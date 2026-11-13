// GET /api/auth/dashboard-overview/shop/:shopId/overview/  (DashboardData, camelCase)
import { eachDay, inWindow, pctChange, previousWindow, windowFor } from '../period.mjs';
import { isoDate } from '../data.mjs';

const isoToday = () => isoDate(new Date());

const LABEL = {
	completed: 'Completed',
	pending: 'Pending',
	confirmed: 'Confirmed',
	're-confirmed': 'Confirmed',
	in_progress: 'In Progress',
	reschedule_requested: 'Reschedule Requested',
	cancelled: 'Cancelled',
	no_show: 'No Show',
	expired: 'Expired'
};

export function registerDashboard(router, state) {
	router.add('GET', '/api/auth/dashboard-overview/shop/:shopId/overview/', ({ params, query }) => {
		const shop = state.shop(params.shopId);
		const all = state.bookingsOf(shop.id);
		const win = windowFor(query, state.data.now);
		const prevWin = previousWindow(win);
		const cur = all.filter(inWindow(win));
		const prev = all.filter(inWindow(prevWin));
		const done = (list) => list.filter((b) => b.status === 'completed');
		const revenue = (list) => done(list).reduce((s, b) => s + b.price, 0);
		const clients = (list) => new Set(list.map((b) => b.clientId)).size;
		const promosActive = state.data.promos.filter((p) => p.shopId === shop.id && p.is_active);
		const weekAgo = new Date(state.data.now.getTime() - 7 * 86400000).toISOString();
		const newPromos = promosActive.filter((p) => p.created_at >= weekAgo).length;

		const byDay = new Map(eachDay(win).map((d) => [d, 0]));
		for (const b of done(cur)) byDay.set(b.date, (byDay.get(b.date) || 0) + b.price);

		const statusCounts = {};
		for (const b of cur)
			statusCounts[LABEL[b.status] || b.status] =
				(statusCounts[LABEL[b.status] || b.status] || 0) + 1;

		const serviceStats = new Map();
		for (const b of done(cur)) {
			for (const sid of b.serviceIds) {
				const s = serviceStats.get(sid) || { bookings: 0, revenue: 0 };
				s.bookings += 1;
				s.revenue += b.price / b.serviceIds.length;
				serviceStats.set(sid, s);
			}
		}
		const popularServices = [...serviceStats.entries()]
			.map(([sid, s]) => {
				const svc = state.service(sid);
				const cat = state.data.categories.find((c) => c.id === svc.groupId);
				return {
					id: svc.id,
					title: svc.title,
					bookings: s.bookings,
					revenue: Math.round(s.revenue),
					category: cat ? { id: cat.id, name: cat.name } : null
				};
			})
			.sort((a, b) => b.revenue - a.revenue)
			.slice(0, 5);

		const bestBarbers = state
			.team(shop.id)
			.map((barber) => {
				const mine = cur.filter((b) => b.barberId === barber.id);
				const rated = mine.filter((b) => b.rating);
				return {
					id: barber.id,
					name: `${barber.first_name} ${barber.last_name}`.trim(),
					avatar: barber.profile_picture || undefined,
					revenue: revenue(mine),
					rating: rated.length
						? Math.round((rated.reduce((s, b) => s + b.rating, 0) / rated.length) * 10) / 10
						: 0,
					bookings: mine.length
				};
			})
			.filter((b) => b.bookings > 0)
			.sort((a, b) => b.revenue - a.revenue)
			.slice(0, 5);

		const bestPromos = promosActive
			.map((p) => {
				const used = done(cur).filter((b) => b.promoId === p.id);
				return {
					id: p.id,
					name: p.name,
					code: p.code,
					redemptions: used.length,
					revenue: used.reduce((s, b) => s + b.price, 0)
				};
			})
			.filter((p) => p.redemptions > 0)
			.sort((a, b) => b.revenue - a.revenue);

		const periods = state.data.periods.filter((p) => p.shopId === shop.id);
		return {
			stats: {
				totalRevenue: revenue(cur),
				revenueTrend: pctChange(revenue(cur), revenue(prev)),
				bookings: cur.length,
				bookingsTrend: pctChange(cur.length, prev.length),
				activeCustomers: clients(cur),
				customersTrend: pctChange(clients(cur), clients(prev)),
				activePromos: promosActive.length,
				promosTrend: newPromos
			},
			revenueChart: [...byDay.entries()].map(([date, value]) => ({
				date,
				value: Math.round(value)
			})),
			statusDistribution: Object.entries(statusCounts).map(([status, count]) => ({
				status,
				count
			})),
			popularServices,
			bestBarbers,
			bestPromos,
			alerts: {
				pendingPayments: periods.filter((p) => p.status === 'PENDING' && p.due_date >= isoToday())
					.length,
				overduePayments: periods.filter(
					(p) => p.status === 'OVERDUE' || (p.status === 'PENDING' && p.due_date < isoToday())
				).length
			}
		};
	});
}
