// Shapes shared by several endpoints: bookings, people and services as the
// backend sends them.
import { atTime, money } from './data.mjs';

const STATUS_DISPLAY = {
	pending: 'Pending',
	confirmed: 'Confirmed',
	're-confirmed': 'Re-confirmed',
	in_progress: 'In progress',
	completed: 'Completed',
	cancelled: 'Cancelled',
	no_show: 'No show',
	reschedule_requested: 'Reschedule requested',
	expired: 'Expired'
};

export const fullName = (u) => `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username;

/** A booking's date-times as a backend with a time zone set sends them: local time, then its offset. */
export function withOffset(iso) {
	if (!iso) return null;
	const at = new Date(iso);
	const ahead = -at.getTimezoneOffset();
	const two = (n) => String(n).padStart(2, '0');
	const local = new Date(at.getTime() + ahead * 60000).toISOString().slice(0, 19);
	return `${local}${ahead < 0 ? '-' : '+'}${two(Math.floor(Math.abs(ahead) / 60))}:${two(Math.abs(ahead) % 60)}`;
}

export function userRef(u) {
	if (!u) return null;
	return {
		id: u.id,
		username: u.username,
		full_name: fullName(u),
		email: u.email,
		phone: u.phone || null,
		profile_picture: u.profile_picture || null,
		avatar: u.profile_picture || null
	};
}

export function serializeService(s, state) {
	const group = s.groupId ? state.data.categories.find((c) => c.id === s.groupId) : null;
	const promos = state.data.promos.filter(
		(p) => p.shopId === s.shopId && p.is_active && p.type === 'shop' && p.serviceIds.includes(s.id)
	);
	const best = promos[0] || null;
	const discounted = best
		? best.discount_type === 'percentage'
			? s.price * (1 - best.discount_value / 100)
			: Math.max(0, s.price - best.discount_value)
		: null;
	return {
		id: s.id,
		title: s.title,
		description: s.description || '',
		category: 'standard',
		group: group ? { id: group.id, name: group.name, description: group.description } : null,
		price: money(s.price),
		duration: `00:${String(s.duration_minutes).padStart(2, '0')}:00`,
		duration_minutes: s.duration_minutes,
		is_active: s.is_active,
		requires_consultation: Boolean(s.requires_consultation),
		image: s.image || null,
		bookings_count: state.data.bookings.filter((b) => b.serviceIds.includes(s.id)).length,
		has_active_promos: Boolean(best),
		discounted_price: discounted != null ? money(discounted) : null,
		best_promo: best
			? {
					id: best.id,
					name: best.name,
					discount_type: best.discount_type,
					discount_value: money(best.discount_value)
				}
			: null,
		created_at: s.created_at,
		updated_at: s.updated_at
	};
}

/** The full booking, as the agenda and the history read it. */
export function serializeBooking(b, state) {
	const now = Date.now();
	const client = state.userById(b.clientId);
	const barber = state.userById(b.barberId);
	const services = b.serviceIds.map((sid) => state.service(sid)).filter(Boolean);
	const start = atTime(b.date, b.start_time).getTime();
	const end = atTime(b.date, b.end_time).getTime();
	const promo = b.promoId ? state.data.promos.find((p) => p.id === b.promoId) : null;
	const pendingDeadline =
		b.status === 'pending'
			? Math.max(0, Math.round((new Date(b.created_at).getTime() + 10 * 60000 - now) / 1000))
			: null;
	const sinceStart =
		b.status === 'in_progress' ? Math.max(0, Math.round((now - start) / 1000)) : null;
	const fmtSince = (s) =>
		`${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
	return {
		id: b.id,
		booking_number: b.booking_number,
		status: b.status,
		status_display: STATUS_DISPLAY[b.status] || b.status,
		booking_date: b.date,
		start_time: b.start_time,
		end_time: b.end_time,
		client: userRef(client),
		barber: barber ? { ...userRef(barber), full_name: fullName(barber) } : null,
		services: services.map((s) => ({
			id: s.id,
			title: s.title,
			price: money(s.price),
			duration_minutes: s.duration_minutes
		})),
		total_duration_minutes: b.duration,
		final_price: money(b.price),
		total_price: money(b.original_price),
		pricing: {
			original_price: money(b.original_price),
			total_discount: money(b.discount),
			final_price: money(b.price),
			has_promo: Boolean(promo),
			promo_count: promo ? 1 : 0
		},
		promos: promo
			? [
					{
						id: promo.id,
						name: promo.name,
						code: promo.code || '',
						type: promo.type,
						discount_amount: money(b.discount),
						discount_percentage: promo.discount_type === 'percentage' ? promo.discount_value : null,
						behavior: promo.behavior
					}
				]
			: [],
		cancellation: b.cancellation,
		created_at: withOffset(b.created_at),
		confirmed_at: withOffset(b.confirmed_at),
		started_at: withOffset(b.started_at),
		completed_at: withOffset(b.completed_at),
		is_delayed: b.is_delayed,
		delay_count: b.delay_count,
		customer_delay_reported: b.customer_delay_reported,
		can_mark_no_show: ['confirmed', 're-confirmed'].includes(b.status) && start < now,
		can_start_service: ['confirmed', 're-confirmed'].includes(b.status) && start - now < 30 * 60000,
		can_be_delayed: ['confirmed', 're-confirmed'].includes(b.status) && b.delay_count < 3,
		can_report_customer_delay:
			['confirmed', 're-confirmed'].includes(b.status) && !b.customer_delay_reported,
		is_expired: b.status === 'pending' && pendingDeadline === 0,
		time_until_expiry: pendingDeadline,
		remaining_time_seconds: b.status === 'in_progress' ? Math.round((end - now) / 1000) : null,
		time_since_started: sinceStart != null ? fmtSince(sinceStart) : null,
		current_location: null,
		customer_service: { status: 'none', message: '' },
		client_notes: b.client_notes,
		barber_notes: b.barber_notes,
		notes: { client_notes: b.client_notes, barber_notes: b.barber_notes }
	};
}

/** Custom pagination: { count, page, page_size, total_pages, has_next, has_previous, results }. */
export function paginate(items, query, defaultSize = 20) {
	const page_size = Math.max(1, Math.min(200, Number(query.page_size) || defaultSize));
	const total_pages = Math.max(1, Math.ceil(items.length / page_size));
	const page = Math.min(total_pages, Math.max(1, Number(query.page) || 1));
	return {
		count: items.length,
		page,
		page_size,
		total_pages,
		has_next: page < total_pages,
		has_previous: page > 1,
		results: items.slice((page - 1) * page_size, page * page_size)
	};
}
