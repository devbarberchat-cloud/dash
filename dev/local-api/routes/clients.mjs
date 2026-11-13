// Clients of a salon, one client's bookings, and sending a promotion.
import { HttpError, badRequest } from '../http.mjs';
import { money } from '../data.mjs';
import { fullName, paginate, serializeBooking } from '../serialize.mjs';

export function registerClients(router, state) {
	const { data } = state;

	router.add('GET', '/api/auth/dashboard-clients/shops/:shopId/clients/', ({ params, query }) => {
		const shop = state.shop(params.shopId);
		const term = String(query.search || '')
			.trim()
			.toLowerCase();
		const byClient = new Map();
		for (const b of state.bookingsOf(shop.id)) {
			if (!byClient.has(b.clientId)) byClient.set(b.clientId, []);
			byClient.get(b.clientId).push(b);
		}
		const items = [...byClient.entries()]
			.map(([clientId, list]) => {
				const client = state.userById(clientId);
				const done = list
					.filter((b) => b.status === 'completed')
					.sort((a, b) => a.date.localeCompare(b.date));
				const gaps = done
					.slice(1)
					.map((b, i) => (new Date(b.date) - new Date(done[i].date)) / 86400000);
				return {
					id: client.id,
					username: client.username,
					full_name: fullName(client),
					profile_picture: client.profile_picture,
					total_completed_bookings: done.length,
					visit_frequency_days: gaps.length ? gaps.reduce((s, g) => s + g, 0) / gaps.length : null,
					first_booking_date: done[0]?.date || null,
					last_booking_date: done[done.length - 1]?.date || null,
					total_revenue: done.length ? money(done.reduce((s, b) => s + b.price, 0)) : null
				};
			})
			.filter(
				(c) =>
					!term ||
					c.username.toLowerCase().includes(term) ||
					c.full_name.toLowerCase().includes(term)
			)
			.sort((a, b) => (b.last_booking_date || '').localeCompare(a.last_booking_date || ''));
		return paginate(items, query);
	});

	router.add(
		'GET',
		'/api/auth/dashboard-clients/shops/:shopId/clients/:clientId/bookings/',
		({ params, query }) => {
			const shop = state.shop(params.shopId);
			const clientId = Number(params.clientId);
			if (!state.bookingsOf(shop.id).some((b) => b.clientId === clientId))
				throw new HttpError(404, { detail: 'Client not found in this shop.' });
			const statuses = query.status ? String(query.status).split(',') : null;
			const all = state.bookingsOf(shop.id).filter((b) => b.clientId === clientId);
			const list = all
				.filter(
					(b) =>
						(!statuses || statuses.includes(b.status)) &&
						(!query.start_date || b.date >= query.start_date) &&
						(!query.end_date || b.date <= query.end_date)
				)
				.sort((a, b) => (b.date + b.start_time).localeCompare(a.date + a.start_time));
			const page = paginate(list, query);
			const done = all.filter((b) => b.status === 'completed');
			const weekdays = new Map();
			for (const b of done) {
				const wd = (new Date(`${b.date}T12:00:00`).getDay() + 6) % 7;
				weekdays.set(wd, (weekdays.get(wd) || 0) + 1);
			}
			return {
				...page,
				results: page.results.map((b) => {
					const full = serializeBooking(b, state);
					return {
						id: b.id,
						booking_date: b.date,
						start_time: b.start_time,
						status: b.status,
						status_display: full.status_display,
						services: full.services.map(({ id, title, price }) => ({ id, title, price })),
						total_price: full.total_price,
						final_price: full.final_price,
						barber: full.barber ? { id: full.barber.id, username: full.barber.username } : null,
						created_at: b.created_at
					};
				}),
				total_revenue: done.reduce((s, b) => s + b.price, 0),
				bookings_with_promo_percentage: all.length
					? Math.round((all.filter((b) => b.promoId).length / all.length) * 1000) / 10
					: 0,
				preferred_day: weekdays.size
					? [...weekdays.entries()].sort((a, b) => b[1] - a[1])[0][0]
					: null
			};
		}
	);

	router.add(
		'POST',
		'/api/auth/dashboard-clients/shops/:shopId/send-promotion/',
		({ params, body }) => {
			const shop = state.shop(params.shopId);
			const ids = Array.isArray(body?.client_ids) ? body.client_ids.map(Number) : [];
			if (!ids.length) throw badRequest({ detail: 'Choose at least one client.' });
			const promo = state.promo(shop.id, body?.promo_id);
			if (!promo.is_active) throw badRequest({ detail: 'This promotion is not active.' });
			const known = ids.filter((id) => state.userById(id));
			return {
				success_count: known.length,
				failure_count: ids.length - known.length,
				total_requested: ids.length,
				message: `“${promo.name}” sent to ${known.length} client${known.length === 1 ? '' : 's'}.`
			};
		}
	);
}
