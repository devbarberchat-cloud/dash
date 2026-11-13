// Booking states: one name and one color each, wherever a booking shows.
import { t } from '@/i18n';

export const BOOKING_STATUSES = ['pending', 'confirmed', 're-confirmed', 'in_progress', 'completed', 'cancelled', 'no_show', 'reschedule_requested', 'expired'] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

const COLOR: Record<BookingStatus, string> = {
	pending: 'var(--st-pending)',
	confirmed: 'var(--st-confirmed)',
	're-confirmed': 'var(--st-confirmed)',
	in_progress: 'var(--ink)',
	completed: 'var(--st-done)',
	cancelled: 'var(--st-cancelled)',
	no_show: 'var(--st-noshow)',
	reschedule_requested: 'var(--st-pending)',
	expired: 'var(--faint)'
};

export const isBookingStatus = (value: unknown): value is BookingStatus => typeof value === 'string' && (BOOKING_STATUSES as readonly string[]).includes(value);

/** Accepts the code ("no_show") or the English label some endpoints send ("No Show", "In Progress"). */
export function toBookingStatus(value: string | null | undefined): BookingStatus | null {
	if (!value) return null;
	const code = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
	if (isBookingStatus(code)) return code;
	if (code === 're_confirmed' || code === 'reconfirmed') return 're-confirmed';
	return null;
}

export const statusLabel = (status: BookingStatus) => t(`status.${status}`);
export const statusColor = (status: BookingStatus) => COLOR[status];

/** Counts by status, as the parts of a StatusBar. Unknown statuses keep the backend's own label. */
export function statusParts(rows: { status: string; count: number }[]) {
	const merged = new Map<string, { key: string; label: string; value: number; color: string }>();
	for (const row of rows) {
		const status = toBookingStatus(row.status);
		// confirmed and re-confirmed read as one state
		const key = status === 're-confirmed' ? 'confirmed' : (status ?? row.status);
		const part = merged.get(key);
		if (part) part.value += row.count;
		else merged.set(key, { key, label: status ? statusLabel(status === 're-confirmed' ? 'confirmed' : status) : row.status, value: row.count, color: status ? statusColor(status) : 'var(--faint)' });
	}
	const order = (key: string) => {
		const i = (BOOKING_STATUSES as readonly string[]).indexOf(key);
		return i === -1 ? BOOKING_STATUSES.length : i;
	};
	// the outcome first, then what is still open
	const rank = (key: string) => (key === 'completed' ? -1 : order(key));
	return [...merged.values()].sort((a, b) => rank(a.key) - rank(b.key));
}
