// Numbers, money, dates and durations in the active language, on Casablanca
// time. A unit never wraps away from its number.
import { intlLocale } from '@/i18n';

const TZ = 'Africa/Casablanca';
const NB = ' ';
const DASH = '—';

type Numeric = number | string | null | undefined;
type DateLike = string | number | Date | null | undefined;

const numberFormats = new Map<string, Intl.NumberFormat>();
const dateFormats = new Map<string, Intl.DateTimeFormat>();

function nf(options: Intl.NumberFormatOptions) {
	const key = `${intlLocale()}|${JSON.stringify(options)}`;
	let f = numberFormats.get(key);
	if (!f) numberFormats.set(key, (f = new Intl.NumberFormat(intlLocale(), options)));
	return f;
}
function df(options: Intl.DateTimeFormatOptions) {
	const key = `${intlLocale()}|${JSON.stringify(options)}`;
	let f = dateFormats.get(key);
	if (!f) dateFormats.set(key, (f = new Intl.DateTimeFormat(intlLocale(), { timeZone: TZ, ...options })));
	return f;
}

// French groups thousands with a narrow no-break space (U+202F), which Poppins
// does not have: use the plain no-break space instead.
const spaced = (s: string) => s.replace(/ /g, NB);

const toNumber = (value: Numeric): number | null => {
	if (value === null || value === undefined || value === '') return null;
	const n = typeof value === 'number' ? value : Number(value);
	return Number.isFinite(n) ? n : null;
};

/** Accepts a date ("2026-11-09"), a date-time, a timestamp or a Date. */
const toDate = (value: DateLike): Date | null => {
	if (value === null || value === undefined || value === '') return null;
	if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
	// a bare date is a calendar day: noon keeps it on that day in any time zone
	const d = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value);
	return Number.isNaN(d.getTime()) ? null : d;
};

const dated = (value: DateLike, options: Intl.DateTimeFormatOptions) => {
	const d = toDate(value);
	return d ? df(options).format(d) : DASH;
};

/** 1 234 */
export const int = (n: Numeric) => {
	const v = toNumber(n);
	return v === null ? DASH : spaced(nf({ maximumFractionDigits: 0 }).format(v));
};

/** 1 234,5 */
export const decimal = (n: Numeric, digits = 1) => {
	const v = toNumber(n);
	return v === null ? DASH : spaced(nf({ minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v));
};

/** 1 234 MAD, or 1 234,50 MAD when the amount has cents */
export const mad = (n: Numeric) => {
	const v = toNumber(n);
	if (v === null) return DASH;
	const digits = Number.isInteger(v) ? 0 : 2;
	return `${spaced(nf({ minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v))}${NB}MAD`;
};

/** 42,5 % — the value is already a percentage (42.5, not 0.425) */
export const pct = (n: Numeric, digits = 1) => {
	const v = toNumber(n);
	return v === null ? DASH : `${decimal(v, digits)}${NB}%`;
};

/** +12,0 % / −3,0 % */
export const signedPct = (n: number, digits = 1) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${decimal(Math.abs(n), digits)}${NB}%`;

export const score = (n: Numeric) => decimal(n, 1);

/** 45 min */
export const minutes = (n: Numeric) => {
	const v = toNumber(n);
	return v === null ? DASH : `${Math.round(v)}${NB}min`;
};

/** 45 min, 1 h 30 */
export const duration = (n: Numeric) => {
	const v = toNumber(n);
	if (v === null) return DASH;
	if (v < 60) return minutes(v);
	const h = Math.floor(v / 60);
	const m = Math.round(v % 60);
	return m ? `${h}${NB}h${NB}${String(m).padStart(2, '0')}` : `${h}${NB}h`;
};

/** Axis ticks: in full under 10 000, compact above (0 / 20 k / 40 k). */
export const tickMad = (n: number) => (n >= 10_000 ? `${int(n / 1000)}${NB}k` : int(n));

/** lundi 9 novembre */
export const dateFull = (d: DateLike) => dated(d, { weekday: 'long', day: 'numeric', month: 'long' });
/** 9 nov. */
export const dateShort = (d: DateLike) => dated(d, { day: 'numeric', month: 'short' });
/** 9 nov. 2026 */
export const date = (d: DateLike) => dated(d, { day: 'numeric', month: 'short', year: 'numeric' });
/** lun. 9 */
export const dateWeek = (d: DateLike) => dated(d, { weekday: 'short', day: 'numeric' });
/** lun. */
export const weekdayShort = (d: DateLike) => dated(d, { weekday: 'short' });
/** lun. 9 nov. */
export const weekdayDate = (d: DateLike) => dated(d, { weekday: 'short', day: 'numeric', month: 'short' });
/** 9 nov. 2026, 14:30 */
export const dateTime = (d: DateLike) => dated(d, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
/** novembre 2026 */
export const monthYear = (d: DateLike) => dated(d, { month: 'long', year: 'numeric' });
/** nov. 2026 */
export const monthYearShort = (d: DateLike) => dated(d, { month: 'short', year: 'numeric' });

/** 14:30 — from "14:30:00" or a date-time */
export const time = (value: string | Date | null | undefined) => {
	if (typeof value === 'string' && /^\d{1,2}:\d{2}/.test(value)) return value.slice(0, 5).padStart(5, '0');
	return dated(value, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
};

/** "dans 3 jours", "hier", "il y a 5 min" */
export function relative(value: DateLike, now = Date.now()) {
	const d = toDate(value);
	if (!d) return DASH;
	const rtf = new Intl.RelativeTimeFormat(intlLocale(), { numeric: 'auto' });
	const seconds = Math.round((d.getTime() - now) / 1000);
	const abs = Math.abs(seconds);
	if (abs < 45) return rtf.format(0, 'second');
	if (abs < 3600) return rtf.format(Math.round(seconds / 60), 'minute');
	if (abs < 86_400) return rtf.format(Math.round(seconds / 3600), 'hour');
	if (abs < 86_400 * 30) return rtf.format(Math.round(seconds / 86_400), 'day');
	if (abs < 86_400 * 365) return rtf.format(Math.round(seconds / (86_400 * 30)), 'month');
	return rtf.format(Math.round(seconds / (86_400 * 365)), 'year');
}

/** Today's date in Casablanca, as YYYY-MM-DD. */
export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());

/** The date `count` days before today, as YYYY-MM-DD. */
export const daysAgo = (count: number) => {
	const day = new Date(`${today()}T12:00:00Z`);
	day.setUTCDate(day.getUTCDate() - count);
	return day.toISOString().slice(0, 10);
};

/**
 * A moment as minutes on the salon's wall clock, to set against a booking's
 * date and time. A bare date and time ("2026-11-09T14:30") is already on that
 * clock. A date-time that carries its own offset ("…T15:09:00+01:00") is read
 * as written, which does not depend on the browser's time-zone data; one in
 * UTC, or a timestamp, is converted to Casablanca's clock.
 */
export function wallMinutes(value: string | number) {
	if (typeof value === 'string') {
		const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/.exec(value);
		if (match && !/^(Z|[+-]00:?00)$/.test(match[6] ?? '')) return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5])) / 60_000;
	}
	const at = typeof value === 'number' ? value : Date.parse(value);
	if (Number.isNaN(at)) return NaN;
	const parts: Record<string, number> = {};
	const format = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
	for (const part of format.formatToParts(at)) parts[part.type] = Number(part.value);
	return Date.UTC(parts.year ?? 0, (parts.month ?? 1) - 1, parts.day ?? 1, parts.hour ?? 0, parts.minute ?? 0) / 60_000;
}

/** The hour in Casablanca, 0 to 23. */
export const hourNow = () => Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: TZ }).format(new Date()));

export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** HH:MM:SS -> HH:MM */
export const hhmm = (t: string) => t.slice(0, 5);
export const toMinutes = (t: string) => {
	const [h = 0, m = 0] = t.split(':').map(Number);
	return h * 60 + m;
};

/** Up to two initials, for a face without a photo. */
export const initials = (s: string | null | undefined) =>
	(s ?? '')
		.replace(/[^\p{L} ._]/gu, '')
		.split(/[ ._]+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((w) => w[0]!.toUpperCase())
		.join('') || '?';

/** A person's name: first and last name, else the username. */
export const personName = (u: { first_name?: string | null; last_name?: string | null; username?: string | null }) =>
	`${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || u.username || '';
