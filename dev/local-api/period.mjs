// Date windows shared by the dashboard and analytics endpoints.
import { addDays, isoDate, startOfDay } from './data.mjs';

/** [from, to] as YYYY-MM-DD for the dashboard's period values. */
export function windowFor(query, now = new Date()) {
	const period = query.period || query.date_range || 'last_30_days';
	const today = startOfDay(now);
	if (period === 'custom' || (query.start_date && query.end_date)) {
		if (query.start_date && query.end_date) return [query.start_date, query.end_date];
	}
	const days = {
		today: 1,
		last_7_days: 7,
		'7d': 7,
		week: 7,
		last_30_days: 30,
		'30d': 30,
		month: 30,
		last_90_days: 90,
		'90d': 90,
		quarter: 90,
		last_365_days: 365,
		year: 365,
		'1y': 365
	}[period];
	if (period === 'current_month' || period === 'this_month')
		return [isoDate(new Date(today.getFullYear(), today.getMonth(), 1)), isoDate(today)];
	if (period === 'current_year' || period === 'this_year')
		return [isoDate(new Date(today.getFullYear(), 0, 1)), isoDate(today)];
	const n = days || 30;
	return [isoDate(addDays(today, -(n - 1))), isoDate(today)];
}

/** The window of the same length just before [from, to]. */
export function previousWindow([from, to]) {
	const a = new Date(`${from}T12:00:00`);
	const b = new Date(`${to}T12:00:00`);
	const len = Math.round((b - a) / 86400000) + 1;
	return [isoDate(addDays(a, -len)), isoDate(addDays(a, -1))];
}

export const inWindow =
	([from, to]) =>
	(b) =>
		b.date >= from && b.date <= to;

export function eachDay([from, to]) {
	const out = [];
	for (let d = new Date(`${from}T12:00:00`); isoDate(d) <= to; d = addDays(d, 1))
		out.push(isoDate(d));
	return out;
}

export const pctChange = (cur, prev) =>
	prev ? Math.round(((cur - prev) / prev) * 1000) / 10 : cur ? 100 : 0;
export const round2 = (n) => Math.round(n * 100) / 100;
