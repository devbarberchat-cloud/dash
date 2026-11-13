// Analytics and forecasts, all computed from the bookings.
import { addDays, isoDate } from '../data.mjs';
import { eachDay, inWindow, pctChange, previousWindow, round2 } from '../period.mjs';
import { fullName } from '../serialize.mjs';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const weekday = (date) => (new Date(`${date}T12:00:00`).getDay() + 6) % 7;
const r1 = (n) => Math.round(n * 10) / 10;

/** The analytics period values: today, this_week, this_month, last_7/30/90_days, this_year, custom. */
function analyticsWindow(query, now = new Date()) {
	if (query.start_date && query.end_date) return [query.start_date, query.end_date];
	const today = new Date(now);
	const d = isoDate(today);
	switch (query.period) {
		case 'today':
			return [d, d];
		case 'this_week':
			return [isoDate(addDays(today, -weekday(d))), d];
		case 'this_month':
		case 'current_month':
			return [isoDate(new Date(today.getFullYear(), today.getMonth(), 1)), d];
		case 'last_30_days':
			return [isoDate(addDays(today, -29)), d];
		case 'last_90_days':
			return [isoDate(addDays(today, -89)), d];
		case 'this_year':
			return [isoDate(new Date(today.getFullYear(), 0, 1)), d];
		default:
			return [isoDate(addDays(today, -6)), d];
	}
}

export function registerAnalytics(router, state) {
	const { data } = state;

	// every analytics route: resolve the shop and the window, then compute
	const route = (path, compute) =>
		router.add('GET', path, ({ params, query }) => {
			const shop = state.shop(params.shopId);
			const win = analyticsWindow(query);
			const all = state.bookingsOf(shop.id);
			const cur = all.filter(inWindow(win));
			const prev = all.filter(inWindow(previousWindow(win)));
			return compute({ shop, win, all, cur, prev, query });
		});
	const done = (list) => list.filter((b) => b.status === 'completed');
	const revenue = (list) => done(list).reduce((s, b) => s + b.price, 0);
	const clientsOf = (list) => new Set(list.map((b) => b.clientId));
	const firstVisit = (all) => {
		const first = new Map();
		for (const b of [...all].sort((a, b) => a.date.localeCompare(b.date)))
			if (!first.has(b.clientId)) first.set(b.clientId, b.date);
		return first;
	};
	const meta = (shop, win) => ({
		shop_id: shop.id,
		shop_name: shop.name,
		date_range: { start_date: win[0], end_date: win[1] }
	});

	// ------------------------------------------------------------------ revenue
	const rev = '/api/auth/dashboard-analytics-revenue/shop/:shopId/analytics/revenue';
	route(`${rev}/overview/`, ({ shop, win, cur, prev }) => {
		const n = done(cur).length;
		const pn = done(prev).length;
		return {
			...meta(shop, win),
			data: {
				total_revenue: revenue(cur),
				revenue_growth_rate: pctChange(revenue(cur), revenue(prev)),
				average_booking_value: n ? round2(revenue(cur) / n) : 0,
				abv_trend: pctChange(n ? revenue(cur) / n : 0, pn ? revenue(prev) / pn : 0),
				gross_revenue: done(cur).reduce((s, b) => s + b.original_price, 0),
				net_revenue: revenue(cur)
			}
		};
	});
	route(`${rev}/commission/`, ({ shop, win }) => {
		const periods = data.periods.filter(
			(p) => p.shopId === shop.id && p.week_start <= win[1] && p.week_end >= win[0]
		);
		const methods = {};
		for (const p of periods)
			if (p.payment_method) methods[p.payment_method] = (methods[p.payment_method] || 0) + 1;
		return {
			...meta(shop, win),
			data: {
				commission_rate: 10,
				total_commission_collected: 0,
				overdue_payments: { count: periods.filter((p) => p.status === 'OVERDUE').length },
				payment_completion_rate: periods.length
					? r1((periods.filter((p) => p.status === 'PAID').length / periods.length) * 100)
					: 0,
				payment_method_distribution: methods
			}
		};
	});
	route(`${rev}/by-time/`, ({ shop, win, cur }) => {
		const days = eachDay(win);
		const byDay = new Map(days.map((d) => [d, 0]));
		for (const b of done(cur)) byDay.set(b.date, (byDay.get(b.date) || 0) + b.price);
		return {
			...meta(shop, win),
			data: {
				time_granularity: 'daily',
				revenue_breakdown: [...byDay.entries()].map(([date, value]) => ({ date, revenue: value }))
			}
		};
	});
	route(`${rev}/by-source/`, ({ shop, win, cur }) => {
		const bySvc = new Map();
		const byBarber = new Map();
		const byCat = new Map();
		for (const b of done(cur)) {
			byBarber.set(b.barberId, (byBarber.get(b.barberId) || 0) + b.price);
			for (const sid of b.serviceIds) {
				const share = b.price / b.serviceIds.length;
				bySvc.set(sid, (bySvc.get(sid) || 0) + share);
				const s = state.service(sid);
				const cat = data.categories.find((c) => c.id === s?.groupId)?.name || 'Uncategorized';
				byCat.set(cat, (byCat.get(cat) || 0) + share);
			}
		}
		const sorted = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]);
		return {
			...meta(shop, win),
			data: {
				revenue_by_service: sorted(bySvc).map(([id, v]) => ({
					service_id: id,
					service_title: state.service(id)?.title || 'Service',
					revenue: Math.round(v)
				})),
				revenue_by_barber: sorted(byBarber).map(([id, v]) => ({
					barber_id: id,
					barber_name: fullName(state.userById(id)),
					revenue: Math.round(v)
				})),
				revenue_by_category: sorted(byCat).map(([category, v]) => ({
					category,
					revenue: Math.round(v)
				}))
			}
		};
	});

	// ----------------------------------------------------------------- bookings
	const bk = '/api/auth/dashboard-analytics-booking/shop/:shopId/analytics/bookings';
	route(`${bk}/volume/`, ({ shop, win, cur, prev }) => ({
		...meta(shop, win),
		data: {
			total_bookings: cur.length,
			bookings_growth_rate: pctChange(cur.length, prev.length),
			average_bookings_per_day: r1(cur.length / eachDay(win).length)
		},
		comparison: { previous_period: { total_bookings: prev.length } }
	}));
	route(`${bk}/status-distribution/`, ({ shop, win, cur }) => {
		const counts = {};
		for (const b of cur) counts[b.status] = (counts[b.status] || 0) + 1;
		const pct = (k) => (cur.length ? r1(((counts[k] || 0) / cur.length) * 100) : 0);
		return {
			...meta(shop, win),
			data: {
				status_counts: counts,
				status_rates: {
					completion_rate: pct('completed'),
					cancellation_rate: pct('cancelled'),
					no_show_rate: pct('no_show')
				}
			}
		};
	});
	route(`${bk}/lifecycle/`, ({ shop, win, cur }) => {
		const confirmed = cur.filter((b) => b.confirmed_at);
		const toConfirm = confirmed.length
			? confirmed.reduce(
					(s, b) => s + (new Date(b.confirmed_at) - new Date(b.created_at)) / 60000,
					0
				) / confirmed.length
			: 0;
		const d = done(cur);
		return {
			...meta(shop, win),
			data: {
				average_time_to_confirmation_minutes: r1(toConfirm),
				average_service_duration_minutes: d.length
					? r1(d.reduce((s, b) => s + b.duration, 0) / d.length)
					: 0,
				reschedule_request_rate: cur.length
					? r1((cur.filter((b) => b.status === 'reschedule_requested').length / cur.length) * 100)
					: 0,
				delay_count: cur.filter((b) => b.is_delayed).length
			}
		};
	});
	route(`${bk}/patterns/`, ({ shop, win, cur }) => {
		const counts = DAYS.map(() => 0);
		for (const b of cur) counts[weekday(b.date)]++;
		return {
			...meta(shop, win),
			data: { distribution_by_day_of_week: DAYS.map((day, i) => ({ day, count: counts[i] })) }
		};
	});

	// ----------------------------------------------------------------- forecast
	const fc = '/api/auth/dashboard-forecast/shops/:shopId';
	const weeklyHistory = (shop) => {
		const out = [];
		for (let w = 8; w >= 1; w--) {
			const end = addDays(new Date(), -7 * (w - 1) - 1);
			const start = addDays(end, -6);
			out.push(revenue(state.bookingsOf(shop.id).filter(inWindow([isoDate(start), isoDate(end)]))));
		}
		return out;
	};
	const dayAverages = (shop) => {
		const last = state
			.bookingsOf(shop.id)
			.filter(inWindow([isoDate(addDays(new Date(), -56)), isoDate(addDays(new Date(), -1))]));
		const counts = DAYS.map(() => 0);
		for (const b of last) counts[weekday(b.date)]++;
		return counts.map((c) => c / 8);
	};
	router.add('GET', `${fc}/booking-forecast/`, ({ params }) => {
		const shop = state.shop(params.shopId);
		const avg = dayAverages(shop);
		return {
			shop_id: shop.id,
			forecast: DAYS.map((day_name, i) => ({
				day_name,
				average: r1(avg[i]),
				optimistic_forecast: r1(avg[i] * 1.12)
			}))
		};
	});
	router.add('GET', `${fc}/revenue-forecast/`, ({ params }) => {
		const shop = state.shop(params.shopId);
		const hist = weeklyHistory(shop);
		const avg = hist.reduce((s, v) => s + v, 0) / hist.length;
		return {
			shop_id: shop.id,
			weekly_revenue_history: hist,
			average_weekly_revenue: round2(avg),
			optimistic_forecast: round2(avg * 1.1)
		};
	});
	router.add('GET', `${fc}/weekly-graph/`, ({ params }) => {
		const shop = state.shop(params.shopId);
		const avg = dayAverages(shop);
		const last7 = state
			.bookingsOf(shop.id)
			.filter(inWindow([isoDate(addDays(new Date(), -7)), isoDate(addDays(new Date(), -1))]));
		const histCounts = DAYS.map((day_name, i) => ({
			day_name,
			count: last7.filter((b) => weekday(b.date) === i).length
		}));
		const histRevenue = DAYS.map((_, i) => ({
			value: revenue(last7.filter((b) => weekday(b.date) === i))
		}));
		const avgTicket = (() => {
			const d = done(state.bookingsOf(shop.id));
			return d.length ? revenue(d) / d.length : 0;
		})();
		return {
			historical: { bookings: histCounts, revenue: histRevenue },
			forecast: {
				bookings: avg.map((v) => ({ value: r1(v * 1.05) })),
				revenue: avg.map((v) => ({ value: round2(v * 1.05 * avgTicket * 0.88) }))
			}
		};
	});

	// ------------------------------------------------------------------ clients
	const cl = '/api/auth/dashboard-analytics-client/shop/:shopId/analytics/clients';
	route(`${cl}/overview/`, ({ shop, win, all, cur, prev }) => {
		const first = firstVisit(all);
		const isNew = (w) => (id) => first.get(id) >= w[0] && first.get(id) <= w[1];
		const curClients = clientsOf(cur);
		const prevClients = clientsOf(prev);
		const newCur = [...curClients].filter(isNew(win)).length;
		const newPrev = [...prevClients].filter(isNew(previousWindow(win))).length;
		const returning = curClients.size - newCur;
		const retained = [...prevClients].filter((id) => curClients.has(id)).length;
		return {
			...meta(shop, win),
			data: {
				total_unique_clients: curClients.size,
				client_growth_rate: pctChange(curClients.size, prevClients.size),
				new_clients: newCur,
				new_client_growth_rate: pctChange(newCur, newPrev),
				returning_clients: returning,
				client_retention_rate: prevClients.size ? r1((retained / prevClients.size) * 100) : 0
			}
		};
	});
	route(`${cl}/behavior/`, ({ shop, win, cur, query }) => {
		const per = new Map();
		for (const b of done(cur)) {
			const e = per.get(b.clientId) || { booking_count: 0, total_revenue: 0 };
			e.booking_count++;
			e.total_revenue += b.price;
			per.set(b.clientId, e);
		}
		const list = [...per.entries()]
			.map(([id, e]) => ({ client_id: id, client_name: fullName(state.userById(id)), ...e }))
			.sort((a, b) => b.total_revenue - a.total_revenue)
			.slice(0, Number(query.limit) || 10);
		return { ...meta(shop, win), data: { client_lifetime_values: list } };
	});
	route(`${cl}/engagement/`, ({ shop, win, cur }) => ({
		...meta(shop, win),
		data: {
			average_bookings_per_client: clientsOf(cur).size ? r1(cur.length / clientsOf(cur).size) : 0
		}
	}));

	// ------------------------------------------------------------------ barbers
	const br = '/api/auth/dashboard-analytics-barber/shop/:shopId/analytics/barbers';
	route(`${br}/overview/`, ({ shop, win, cur }) => {
		const team = state.team(shop.id);
		const active = new Set(cur.map((b) => b.barberId));
		const agenda = data.agendas[shop.id] || [];
		const openMinutes = eachDay(win).reduce((s, d) => {
			const a = agenda.find((x) => x.weekday === weekday(d));
			return (
				s +
				(!a || a.is_closed
					? 0
					: Number(a.closing_time.slice(0, 2)) * 60 +
						Number(a.closing_time.slice(3, 5)) -
						Number(a.opening_time.slice(0, 2)) * 60 -
						Number(a.opening_time.slice(3, 5)))
			);
		}, 0);
		const busy = done(cur).reduce((s, b) => s + b.duration, 0);
		return {
			...meta(shop, win),
			data: {
				total_barbers: team.length,
				active_barbers: active.size,
				barber_utilization_rate:
					openMinutes && team.length ? r1((busy / (openMinutes * team.length)) * 100) : 0,
				average_bookings_per_barber: team.length ? r1(cur.length / team.length) : 0
			}
		};
	});
	route(`${br}/performance/`, ({ shop, win, cur }) => ({
		...meta(shop, win),
		data: {
			barber_performance: state
				.team(shop.id)
				.map((b) => ({
					barber_id: b.id,
					barber_name: fullName(b),
					revenue: revenue(cur.filter((x) => x.barberId === b.id)),
					bookings: cur.filter((x) => x.barberId === b.id).length
				}))
				.sort((a, b) => b.revenue - a.revenue)
		}
	}));
	route(`${br}/efficiency/`, ({ shop, win }) => ({ ...meta(shop, win), data: {} }));

	// ----------------------------------------------------------------- services
	const sv = '/api/auth/dashboard-analytics-service/shop/:shopId/analytics/services';
	route(`${sv}/overview/`, ({ shop, win }) => {
		const list = data.services.filter((s) => s.shopId === shop.id);
		const active = list.filter((s) => s.is_active);
		return {
			...meta(shop, win),
			data: {
				total_services: list.length,
				active_services: active.length,
				average_service_price: active.length
					? round2(active.reduce((s, x) => s + x.price, 0) / active.length)
					: 0
			}
		};
	});
	route(`${sv}/performance/`, ({ shop, win, cur }) => {
		const counts = new Map();
		for (const b of cur)
			for (const sid of b.serviceIds) counts.set(sid, (counts.get(sid) || 0) + 1);
		return {
			...meta(shop, win),
			data: {
				service_performance: [...counts.entries()]
					.sort((a, b) => b[1] - a[1])
					.map(([id, n]) => ({
						service_id: id,
						service_title: state.service(id)?.title || 'Service',
						booking_count: n
					}))
			}
		};
	});
	route(`${sv}/trends/`, ({ shop, win }) => ({ ...meta(shop, win), data: {} }));

	// ------------------------------------------------------------------- promos
	const pr = '/api/auth/dashboard-analytics-promo/shop/:shopId/analytics/promos';
	const qrsOf = (shop) => data.qrCodes.filter((q) => q.shopId === shop.id);
	route(`${pr}/overview/`, ({ shop, win }) => {
		const promos = data.promos.filter((p) => p.shopId === shop.id && !p.deleted);
		const qrs = qrsOf(shop);
		return {
			...meta(shop, win),
			data: {
				total_promos: promos.length,
				active_promos: promos.filter((p) => p.is_active).length,
				total_qr_codes: qrs.length,
				active_qr_codes: qrs.filter((q) => q.is_active).length
			}
		};
	});
	route(`${pr}/performance/`, ({ shop, win, cur }) => {
		const d = done(cur);
		const withP = d.filter((b) => b.promoId);
		const scans = qrsOf(shop).flatMap((q) =>
			q.scans.filter((s) => s.date >= win[0] && s.date <= win[1])
		);
		const by = (r) => scans.filter((s) => s.result === r).length;
		return {
			...meta(shop, win),
			data: {
				total_promo_usage: withP.length,
				conversion_rate: d.length ? r1((withP.length / d.length) * 100) : 0,
				total_qr_code_scans: scans.length,
				successful_qr_code_scans: by('success'),
				revenue_breakdown: {
					with_promos: { revenue: revenue(withP) },
					without_promos: { revenue: revenue(d.filter((b) => !b.promoId)) }
				},
				qr_code_scan_breakdown: {
					success: by('success'),
					expired: by('expired'),
					invalid: by('invalid'),
					limit_reached: by('limit_reached'),
					user_not_found: by('user_not_found')
				}
			}
		};
	});
	route(`${pr}/analytics/`, ({ shop, win }) => {
		const qrs = qrsOf(shop);
		const days = eachDay(win);
		const scansIn = (q) => q.scans.filter((s) => s.date >= win[0] && s.date <= win[1]);
		return {
			...meta(shop, win),
			data: {
				top_qr_codes_by_scans: qrs.map((q) => {
					const promo = data.promos.find((p) => p.id === q.promo);
					const s = scansIn(q);
					return {
						qr_code_id: q.id,
						qr_code_title: q.title,
						promo_id: promo?.id,
						promo_name: promo?.name || '',
						promo_code: promo?.code || '',
						total_scans: s.length,
						successful_scans: s.filter((x) => x.result === 'success').length,
						unique_users: new Set(s.map((x) => x.user)).size,
						status: !q.is_active ? 'disabled' : 'active',
						max_scans: q.max_scans,
						current_scans: q.current_scans
					};
				}),
				qr_code_scan_trend: qrs.length
					? {
							dates: days,
							total_scans: days.map((d) =>
								qrs.reduce((s, q) => s + q.scans.filter((x) => x.date === d).length, 0)
							),
							successful_scans: days.map((d) =>
								qrs.reduce(
									(s, q) =>
										s + q.scans.filter((x) => x.date === d && x.result === 'success').length,
									0
								)
							),
							failed_scans: days.map((d) =>
								qrs.reduce(
									(s, q) =>
										s + q.scans.filter((x) => x.date === d && x.result !== 'success').length,
									0
								)
							)
						}
					: null
			}
		};
	});

	// ------------------------------------------------------------------ reviews
	const rv = '/api/auth/dashboard-analytics-review/shop/:shopId/analytics/reviews';
	route(`${rv}/shop-ratings/`, ({ shop, win, cur }) => {
		const rated = cur.filter((b) => b.rating);
		const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
		for (const b of rated) dist[b.rating]++;
		return {
			...meta(shop, win),
			data: {
				shop_rating: rated.length ? r1(rated.reduce((s, b) => s + b.rating, 0) / rated.length) : 0,
				total_reviews_count: rated.length,
				rating_distribution: dist
			}
		};
	});
	route(`${rv}/barber-ratings/`, ({ shop, win, cur }) => {
		const scores = state
			.team(shop.id)
			.map((b) => {
				const rated = cur.filter((x) => x.barberId === b.id && x.rating);
				return rated.length ? rated.reduce((s, x) => s + x.rating, 0) / rated.length : null;
			})
			.filter((s) => s != null);
		const band = (s) => (s >= 4.5 ? 'excellent' : s >= 4 ? 'good' : s >= 3 ? 'average' : 'poor');
		const dist = { excellent: 0, good: 0, average: 0, poor: 0 };
		for (const s of scores) dist[band(s)]++;
		return {
			...meta(shop, win),
			data: {
				average_barber_score: scores.length
					? r1(scores.reduce((a, b) => a + b, 0) / scores.length)
					: 0,
				barber_score_distribution: dist
			}
		};
	});

	// --------------------------------------------------------------------- time
	const tm = '/api/auth/dashboard-analytics-time/shop/:shopId/analytics/time';
	route(`${tm}/hourly-patterns/`, ({ shop, win, cur }) => {
		const by = new Map();
		for (const b of done(cur)) {
			const h = Number(b.start_time.slice(0, 2));
			by.set(h, (by.get(h) || 0) + b.price);
		}
		return {
			...meta(shop, win),
			data: {
				revenue_by_hour: [...by.entries()]
					.sort((a, b) => a[0] - b[0])
					.map(([hour, revenue]) => ({ hour: `${String(hour).padStart(2, '0')}:00`, revenue }))
			}
		};
	});
	route(`${tm}/daily-patterns/`, ({ shop, win, cur }) => {
		const by = DAYS.map(() => 0);
		for (const b of done(cur)) by[weekday(b.date)] += b.price;
		return {
			...meta(shop, win),
			data: { revenue_by_day_of_week: DAYS.map((day, i) => ({ day, revenue: by[i] })) }
		};
	});
	route(`${tm}/seasonal-patterns/`, ({ shop, win, all }) => {
		const by = new Map();
		for (const b of done(all)) {
			const key = b.date.slice(0, 7);
			by.set(key, (by.get(key) || 0) + b.price);
		}
		return {
			...meta(shop, win),
			data: {
				monthly_trends: [...by.entries()].sort().map(([k, revenue]) => ({
					month: `${MONTHS[Number(k.slice(5, 7)) - 1]} ${k.slice(0, 4)}`,
					revenue
				}))
			}
		};
	});

	// ------------------------------------------------------------------- growth
	const gr = '/api/auth/dashboard-analytics-growth/shop/:shopId/analytics/growth';
	route(`${gr}/indicators/`, ({ shop, win, all, cur, prev }) => {
		const first = firstVisit(all);
		const curClients = clientsOf(cur);
		const prevClients = clientsOf(prev);
		const newCur = [...curClients].filter((id) => first.get(id) >= win[0]).length;
		return {
			...meta(shop, win),
			data: {
				revenue_growth_rate: pctChange(revenue(cur), revenue(prev)),
				booking_growth_rate: pctChange(cur.length, prev.length),
				client_growth_rate: pctChange(curClients.size, prevClients.size),
				new_client_acquisition_rate: curClients.size ? r1((newCur / curClients.size) * 100) : 0,
				client_retention_rate: prevClients.size
					? r1(
							([...prevClients].filter((id) => curClients.has(id)).length / prevClients.size) * 100
						)
					: 0
			}
		};
	});
	route(`${gr}/trends/`, ({ shop, win, cur, prev }) => ({
		...meta(shop, win),
		data: {
			revenue_trend: { percentage: pctChange(revenue(cur), revenue(prev)) },
			booking_trend: { percentage: pctChange(cur.length, prev.length) },
			client_trend: { percentage: pctChange(clientsOf(cur).size, clientsOf(prev).size) }
		}
	}));

	// --------------------------------------------------------------- comparison
	const cp = '/api/auth/dashboard-analytics-comparison/shop/:shopId/analytics/comparison';
	router.add('GET', `${cp}/period/`, ({ params }) => {
		const shop = state.shop(params.shopId);
		const today = isoDate(new Date());
		const yesterday = isoDate(addDays(new Date(), -1));
		const all = state.bookingsOf(shop.id);
		const on = (d) => all.filter((b) => b.date === d);
		return {
			comparison_type: 'today_vs_yesterday',
			current_period: { revenue: revenue(on(today)), bookings: on(today).length },
			previous_period: { revenue: revenue(on(yesterday)), bookings: on(yesterday).length }
		};
	});
	route(`${cp}/benchmarks/`, ({ shop, win, cur, prev, query }) => {
		const d = done(cur);
		const abv = d.length ? revenue(cur) / d.length : 0;
		const completion = cur.length ? (d.length / cur.length) * 100 : 0;
		const cancellation = cur.length
			? (cur.filter((b) => b.status === 'cancelled').length / cur.length) * 100
			: 0;
		const prevClients = clientsOf(prev);
		const retention = prevClients.size
			? ([...prevClients].filter((id) => clientsOf(cur).has(id)).length / prevClients.size) * 100
			: 0;
		const b = (actual, target) => ({ actual: r1(actual), target, vs_target: r1(actual - target) });
		return {
			...meta(shop, win),
			data: {
				average_booking_value: b(abv, Number(query.target_abv) || 120),
				completion_rate: b(completion, Number(query.target_completion_rate) || 90),
				cancellation_rate: b(cancellation, Number(query.target_cancellation_rate) || 5),
				client_retention_rate: b(retention, Number(query.target_retention_rate) || 60)
			}
		};
	});
}
