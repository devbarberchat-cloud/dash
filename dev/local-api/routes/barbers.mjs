// The barbers' dashboard: the list with their figures, one barber's analytics
// and their bookings within a payment period.
import { HttpError } from '../http.mjs';
import { addDays, isoDate, money } from '../data.mjs';
import { paginate, fullName } from '../serialize.mjs';

const r1 = (n) => Math.round(n * 10) / 10;

export function registerBarbers(router, state) {
	const { data } = state;

	// BarberScore: points a client may gift the barber after a completed service
	// (as many as they choose, no money value; about two in three gift some here)
	const tipOf = (b) => (b.status === 'completed' && (b.id * 7) % 3 !== 0 ? 10 + ((b.id * 37) % 9) * 5 : 0);

	const stats = (barber, list) => {
		const total = list.length;
		const by = (s) => list.filter((b) => b.status === s).length;
		const completed = list.filter((b) => b.status === 'completed');
		const revenue = completed.reduce((s, b) => s + b.price, 0);
		const original = completed.reduce((s, b) => s + b.original_price, 0);
		const minutes = completed.reduce((s, b) => s + b.duration, 0);
		const dates = list.map((b) => b.date).sort();
		const pct = (n) => (total ? r1((n / total) * 100) : 0);
		return {
			total,
			completed: completed.length,
			cancelled: by('cancelled'),
			noShow: by('no_show'),
			pending: by('pending'),
			confirmed: by('confirmed') + by('re-confirmed'),
			revenue,
			original,
			minutes,
			score: completed.reduce((s, b) => s + tipOf(b), 0),
			pct,
			first: dates[0] || null,
			last: dates[dates.length - 1] || null
		};
	};

	const listItem = (barber) => {
		const s = stats(
			barber,
			data.bookings.filter((b) => b.barberId === barber.id)
		);
		return {
			id: barber.id,
			username: barber.username,
			profile_picture: barber.profile_picture,
			total_bookings: s.total,
			completed_bookings: s.completed,
			cancelled_bookings: s.cancelled,
			no_show_bookings: s.noShow,
			total_revenue: s.total ? money(s.revenue) : null,
			completion_rate: s.pct(s.completed),
			cancellation_rate: s.pct(s.cancelled),
			no_show_rate: s.pct(s.noShow),
			average_service_time: s.completed ? Math.round(s.minutes / s.completed) : null,
			barber_score: s.score,
			first_booking_date: s.first,
			last_booking_date: s.last,
			average_revenue_per_booking: s.completed ? money(s.revenue / s.completed) : null
		};
	};

	router.add('GET', '/api/auth/dashboard-barbers/shops/:shopId/barbers/', ({ params, query }) => {
		const shop = state.shop(params.shopId);
		const term = String(query.search || '')
			.trim()
			.toLowerCase();
		const items = state
			.team(shop.id)
			.filter((b) => !term || b.username.includes(term) || fullName(b).toLowerCase().includes(term))
			.map(listItem);
		return paginate(items, query);
	});

	router.add(
		'GET',
		'/api/auth/dashboard-barbers/shops/:shopId/barbers/:barberId/analytics/',
		({ params, query }) => {
			const shop = state.shop(params.shopId);
			const barber = state.team(shop.id).find((b) => b.id === Number(params.barberId));
			if (!barber) throw new HttpError(404, { detail: 'Barber not found in this shop.' });
			const ranged = Boolean(query.start_date && query.end_date);
			const list = data.bookings.filter(
				(b) =>
					b.barberId === barber.id &&
					(!ranged || (b.date >= query.start_date && b.date <= query.end_date))
			);
			const s = stats(barber, list);
			const completed = list.filter((b) => b.status === 'completed');
			const withoutPromos = completed.reduce((t, b) => t + b.original_price, 0);
			const hours = s.minutes / 60;

			const serviceCount = new Map();
			for (const b of completed) {
				for (const sid of b.serviceIds) {
					const e = serviceCount.get(sid) || { count: 0, revenue: 0 };
					e.count += 1;
					e.revenue += b.price / b.serviceIds.length;
					serviceCount.set(sid, e);
				}
			}
			const serviceRows = [...serviceCount.entries()].map(([sid, e]) => ({
				service_id: sid,
				service_title: state.service(sid)?.title || 'Service',
				count: e.count,
				revenue: money(e.revenue)
			}));
			const clientsSeen = new Map();
			for (const b of completed)
				clientsSeen.set(b.clientId, (clientsSeen.get(b.clientId) || 0) + 1);
			const repeat = [...clientsSeen.values()].filter((n) => n > 1).length;

			const perDay = new Map();
			const perHour = new Map();
			const perWeekday = new Map();
			for (const b of list) {
				perDay.set(b.date, (perDay.get(b.date) || 0) + 1);
				const h = Number(b.start_time.slice(0, 2));
				perHour.set(h, (perHour.get(h) || 0) + 1);
				const wd = (new Date(`${b.date}T12:00:00`).getDay() + 6) % 7;
				perWeekday.set(wd, (perWeekday.get(wd) || 0) + 1);
			}
			const statusDistribution = Object.fromEntries(
				['pending', 'confirmed', 'completed', 'cancelled', 'no_show'].map((k) => [
					k,
					list.filter((b) =>
						k === 'confirmed' ? ['confirmed', 're-confirmed'].includes(b.status) : b.status === k
					).length
				])
			);

			// the latest gifts, newest first, each raising the running total
			const tipped = list.filter((b) => tipOf(b) > 0).sort((a, b) => a.date.localeCompare(b.date));
			let running = 0;
			const history = tipped
				.map((b) => {
					const prev = running;
					running += tipOf(b);
					return {
						id: b.id,
						action_name: fullName(state.userById(b.clientId)),
						action_category: 'tip',
						action_type: 'positive',
						points_awarded: tipOf(b),
						previous_score: prev,
						new_score: running,
						created_at: `${b.date}T${b.end_time}`
					};
				})
				.reverse();
			const agenda = data.agendas[shop.id] || [];
			const weekStart = addDays(data.now, -((data.now.getDay() + 6) % 7));

			return {
				analytics: {
					barber_id: barber.id,
					username: barber.username,
					total_bookings: s.total,
					completed_bookings: s.completed,
					cancelled_bookings: s.cancelled,
					no_show_bookings: s.noShow,
					total_revenue: money(s.revenue),
					completion_rate: s.pct(s.completed),
					cancellation_rate: s.pct(s.cancelled),
					no_show_rate: s.pct(s.noShow),
					average_service_time: s.completed ? Math.round(s.minutes / s.completed) : null,
					barber_score: s.score,
					first_booking_date: s.first,
					last_booking_date: s.last,
					average_revenue_per_booking: s.completed ? money(s.revenue / s.completed) : null,
					average_revenue_per_booking_without_promos: s.completed
						? money(withoutPromos / s.completed)
						: null,
					average_revenue_per_hour: hours ? money(s.revenue / hours) : null,
					revenue_breakdown: {
						total_revenue: money(s.revenue),
						total_revenue_without_promos: money(withoutPromos),
						average_revenue_per_booking: s.completed ? money(s.revenue / s.completed) : '0.00',
						average_revenue_per_booking_without_promos: s.completed
							? money(withoutPromos / s.completed)
							: '0.00',
						average_revenue_per_hour: hours ? money(s.revenue / hours) : '0.00'
					},
					booking_statistics: {
						total_bookings: s.total,
						completed_bookings: s.completed,
						cancelled_bookings: s.cancelled,
						no_show_bookings: s.noShow,
						pending_bookings: s.pending,
						confirmed_bookings: s.confirmed,
						completed_bookings_percentage: s.pct(s.completed),
						cancelled_bookings_percentage: s.pct(s.cancelled),
						no_show_bookings_percentage: s.pct(s.noShow),
						pending_bookings_percentage: s.pct(s.pending),
						confirmed_bookings_percentage: s.pct(s.confirmed),
						status_distribution: statusDistribution,
						completion_rate: s.pct(s.completed),
						cancellation_rate: s.pct(s.cancelled),
						no_show_rate: s.pct(s.noShow)
					},
					performance_metrics: {
						average_service_time: s.completed ? Math.round(s.minutes / s.completed) : null,
						barber_score: s.score
					},
					service_analytics: {
						top_services: [...serviceRows].sort((a, b) => b.count - a.count).slice(0, 5),
						revenue_by_service: [...serviceRows]
							.sort((a, b) => Number(b.revenue) - Number(a.revenue))
							.slice(0, 5)
							.map(({ service_id, service_title, revenue }) => ({
								service_id,
								service_title,
								revenue
							}))
					},
					client_analytics: {
						total_unique_clients: clientsSeen.size,
						repeat_client_rate: clientsSeen.size ? r1((repeat / clientsSeen.size) * 100) : 0,
						average_bookings_per_client: clientsSeen.size
							? r1(completed.length / clientsSeen.size)
							: 0
					},
					time_analytics: {
						bookings_per_day: [...perDay.entries()]
							.sort()
							.slice(-30)
							.map(([date, count]) => ({ date, count })),
						revenue_per_day: [],
						peak_hours: [...perHour.entries()]
							.sort((a, b) => b[1] - a[1])
							.slice(0, 5)
							.map(([hour, count]) => ({ hour, count })),
						peak_days: [...perWeekday.entries()]
							.sort((a, b) => b[1] - a[1])
							.map(([day, count]) => ({ day, count }))
					},
					barber_score_history: history,
					barber_schedule: {
						id: barber.id * 7,
						week_start_date: isoDate(weekStart),
						is_active: true,
						is_template: false,
						weekly_schedule: Object.fromEntries(
							agenda.map((d) => [
								String(d.weekday),
								d.is_closed
									? null
									: {
											start: d.opening_time.slice(0, 5),
											end: d.closing_time.slice(0, 5),
											breaks: [{ start: '14:00', end: '14:30' }]
										}
							])
						)
					}
				},
				date_range: ranged ? { start_date: query.start_date, end_date: query.end_date } : null
			};
		}
	);

	router.add(
		'GET',
		'/api/auth/dashboard-barbers/shops/:shopId/barbers/:barberId/periods/:periodId/bookings/',
		({ params }) => {
			const shop = state.shop(params.shopId);
			const period = data.periods.find(
				(p) => p.id === Number(params.periodId) && p.shopId === shop.id
			);
			if (!period) throw new HttpError(404, { detail: 'Payment period not found.' });
			const list = data.bookings.filter(
				(b) =>
					b.barberId === Number(params.barberId) &&
					b.status === 'completed' &&
					b.date >= period.week_start &&
					b.date <= period.week_end
			);
			const rows = list.map((b) => ({
				id: b.id,
				booking_date: b.date,
				status: b.status,
				client_name: fullName(state.userById(b.clientId)),
				services: b.serviceIds.map((sid) => ({ title: state.service(sid)?.title || 'Service' })),
				booking_amount: money(b.price),
				commission_amount: money((b.price * period.commission_rate) / 100),
				commission_rate: period.commission_rate,
				created_at: b.created_at
			}));
			const total = list.reduce((s, b) => s + b.price, 0);
			return {
				period_start: period.week_start,
				period_end: period.week_end,
				total_bookings: rows.length,
				total_revenue: money(total),
				total_commission: money((total * period.commission_rate) / 100),
				bookings: rows
			};
		}
	);
}
