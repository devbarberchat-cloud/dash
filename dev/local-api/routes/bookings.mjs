// Bookings: the live agenda, actions on a booking, the history.
import { HttpError, badRequest } from '../http.mjs';
import { addDays, atTime, isoDate, isoTime } from '../data.mjs';
import { fullName, serializeBooking } from '../serialize.mjs';

export function registerBookings(router, state) {
	const { data } = state;
	const find = (shopId, bookingId) => {
		const b = data.bookings.find((x) => x.id === Number(bookingId) && x.shopId === Number(shopId));
		if (!b) throw new HttpError(404, { detail: 'Booking not found.' });
		return b;
	};

	router.add('GET', '/api/auth/dashboard-bookings/shop/:shopId/bookings/', ({ params }) => {
		const shop = state.shop(params.shopId);
		const today = isoDate(new Date());
		const nowKey = `${today}T${isoTime(new Date())}`;
		const list = state
			.bookingsOf(shop.id)
			.filter((b) => b.date >= today)
			.sort((a, b) => (a.date + a.start_time).localeCompare(b.date + b.start_time));
		const s = (b) => serializeBooking(b, state);
		const pending = list.filter((b) => b.status === 'pending');
		const reschedule = list.filter((b) => b.status === 'reschedule_requested');
		const confirmed = list.filter((b) => ['confirmed', 're-confirmed'].includes(b.status));
		const inProgress = list.filter((b) => b.status === 'in_progress');
		const todays = list.filter((b) => b.date === today && b.status !== 'cancelled');
		const upcoming = confirmed.filter((b) => `${b.date}T${b.start_time}` > nowKey);
		return {
			pending_bookings: pending.map(s),
			reschedule_requested: reschedule.map(s),
			current_bookings: confirmed.map(s),
			in_progress_bookings: inProgress.map(s),
			todays_bookings: todays.map(s),
			upcoming_bookings: upcoming.map(s),
			stats: {
				pending_count: pending.length,
				reschedule_count: reschedule.length,
				today_count: todays.length,
				in_progress_count: inProgress.length,
				total_upcoming: upcoming.length
			},
			booking_management_mode: shop.booking_management_mode
		};
	});

	const freeSlots = (b) => {
		const agenda = data.agendas[b.shopId] || [];
		const slots = [];
		for (let d = 0; d < 4 && slots.length < 6; d++) {
			const day = addDays(new Date(), d + 1);
			const wd = (day.getDay() + 6) % 7;
			const hours = agenda.find((a) => a.weekday === wd);
			if (!hours || hours.is_closed) continue;
			const date = isoDate(day);
			const taken = data.bookings.filter(
				(x) =>
					x.barberId === b.barberId &&
					x.date === date &&
					!['cancelled', 'no_show'].includes(x.status)
			);
			for (
				let t = atTime(date, hours.opening_time);
				t.getTime() + b.duration * 60000 <= atTime(date, hours.closing_time).getTime() &&
				slots.length < 6;
				t = new Date(t.getTime() + 30 * 60000)
			) {
				const start = isoTime(t);
				const end = isoTime(new Date(t.getTime() + b.duration * 60000));
				if (!taken.some((x) => start < x.end_time && end > x.start_time))
					slots.push({ start_time: `${date}T${start}`, end_time: `${date}T${end}` });
			}
		}
		return slots;
	};

	router.add(
		'POST',
		'/api/auth/dashboard-bookings/shop/:shopId/bookings/:bookingId/process_action/',
		({ params, body }) => {
			const shop = state.shop(params.shopId);
			const b = find(shop.id, params.bookingId);
			const action = body?.action;
			const now = new Date();
			const is = (...st) => st.includes(b.status);
			const refuse = (msg) => {
				throw badRequest({ detail: msg });
			};
			switch (action) {
				case 'accept':
					if (!is('pending')) refuse('Only pending bookings can be accepted.');
					b.status = 'confirmed';
					b.confirmed_at = now.toISOString();
					break;
				case 'cancel':
					if (!is('pending', 'confirmed', 're-confirmed', 'reschedule_requested'))
						refuse('This booking can no longer be cancelled.');
					b.status = 'cancelled';
					b.cancellation = {
						cancelled_by: 'barber',
						cancelled_by_display: 'Barber',
						cancellation_reason: body.reason || '',
						cancelled_at: now.toISOString()
					};
					break;
				case 'request_reschedule':
					if (!is('pending', 'confirmed', 're-confirmed'))
						refuse('This booking cannot be rescheduled.');
					b.status = 'reschedule_requested';
					break;
				case 'report_customer_delay':
					if (!is('confirmed', 're-confirmed'))
						refuse('Delays can only be reported on confirmed bookings.');
					b.customer_delay_reported = true;
					break;
				case 'delay_booking': {
					if (!is('confirmed', 're-confirmed')) refuse('Only confirmed bookings can be delayed.');
					const minutes = Number(body.delay_minutes);
					if (![5, 10, 15].includes(minutes)) refuse('Choose a delay of 5, 10 or 15 minutes.');
					const shift = (t) => isoTime(new Date(atTime(b.date, t).getTime() + minutes * 60000));
					b.start_time = shift(b.start_time);
					b.end_time = shift(b.end_time);
					b.is_delayed = true;
					b.delay_count += 1;
					break;
				}
				case 'start_service':
					if (!is('confirmed', 're-confirmed')) refuse('Only confirmed bookings can be started.');
					b.status = 'in_progress';
					b.started_at = now.toISOString();
					break;
				case 'complete_service':
					if (!is('in_progress')) refuse('Only bookings in progress can be completed.');
					b.status = 'completed';
					b.completed_at = now.toISOString();
					break;
				case 'mark_no_show':
					if (!is('confirmed', 're-confirmed'))
						refuse('Only confirmed bookings can be marked as no-show.');
					b.status = 'no_show';
					break;
				case 'show_available_slots':
					return { available_slots: freeSlots(b) };
				case 'offer_reschedule_slots': {
					const slots = Array.isArray(body.selected_slots) ? body.selected_slots : [];
					if (!slots.length || slots.length > 3) refuse('Offer between one and three time slots.');
					b.offered_slots = slots;
					b.status = 'reschedule_requested';
					break;
				}
				default:
					refuse(`Unknown action "${action}".`);
			}
			return { success: true, message: 'Booking updated.', booking: serializeBooking(b, state) };
		}
	);

	router.add(
		'GET',
		'/api/auth/dashboard-booking-history/shop/:shopId/history/',
		({ params, query }) => {
			const shop = state.shop(params.shopId);
			const term = String(query.search || '')
				.trim()
				.toLowerCase();
			let list = state.bookingsOf(shop.id).filter((b) => {
				if (query.status && b.status !== query.status) return false;
				if (query.start_date && b.date < query.start_date) return false;
				if (query.end_date && b.date > query.end_date) return false;
				if (query.min_price && b.price < Number(query.min_price)) return false;
				if (query.max_price && b.price > Number(query.max_price)) return false;
				if (query.barber_id && b.barberId !== Number(query.barber_id)) return false;
				if (query.client_id && b.clientId !== Number(query.client_id)) return false;
				if (query.promo_id && b.promoId !== Number(query.promo_id)) return false;
				if (query.has_promo === 'true' && !b.promoId) return false;
				if (query.has_promo === 'false' && b.promoId) return false;
				if (query.cancelled_by && b.cancellation?.cancelled_by !== query.cancelled_by) return false;
				if (term) {
					const hay =
						`${b.booking_number} ${fullName(state.userById(b.clientId))} ${state.userById(b.clientId).username} ${fullName(state.userById(b.barberId))}`.toLowerCase();
					if (!hay.includes(term)) return false;
				}
				return true;
			});
			const asc = String(query.ordering || '-booking_date').startsWith('booking_date');
			list = list.sort(
				(a, b) => (asc ? 1 : -1) * (a.date + a.start_time).localeCompare(b.date + b.start_time)
			);
			const page_size = Math.max(1, Math.min(200, Number(query.page_size) || 20));
			const total_pages = Math.max(1, Math.ceil(list.length / page_size));
			const page = Math.min(total_pages, Math.max(1, Number(query.page) || 1));
			const applied = Object.fromEntries(
				Object.entries(query).filter(
					([k, v]) => v && !['page', 'page_size', 'ordering'].includes(k)
				)
			);
			return {
				success: true,
				shop_id: shop.id,
				shop_name: shop.name,
				count: list.length,
				page,
				page_size,
				total_pages,
				next: page < total_pages ? page + 1 : null,
				previous: page > 1 ? page - 1 : null,
				results: list
					.slice((page - 1) * page_size, page * page_size)
					.map((b) => serializeBooking(b, state)),
				filters_applied: Object.keys(applied).length ? applied : null
			};
		}
	);

	router.add(
		'GET',
		'/api/auth/dashboard-bookings/shop/:shopId/bookings/:bookingId/',
		({ params }) => serializeBooking(find(state.shop(params.shopId).id, params.bookingId), state)
	);
	router.add(
		'PATCH',
		'/api/auth/dashboard-bookings/shop/:shopId/bookings/:bookingId/',
		({ params, body }) => {
			const b = find(state.shop(params.shopId).id, params.bookingId);
			if (typeof body?.client_notes === 'string') b.client_notes = body.client_notes;
			if (typeof body?.barber_notes === 'string') b.barber_notes = body.barber_notes;
			return serializeBooking(b, state);
		}
	);
	router.add(
		'DELETE',
		'/api/auth/dashboard-bookings/shop/:shopId/bookings/:bookingId/',
		({ params }) => {
			const b = find(state.shop(params.shopId).id, params.bookingId);
			data.bookings.splice(data.bookings.indexOf(b), 1);
			return { success: true };
		}
	);
}
