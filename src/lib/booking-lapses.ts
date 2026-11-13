// Where a booking left its plan: a request nobody answered in time, a service
// started late, a service that ran past its planned time. Read from the
// booking's own times, so the live agenda and the history count the same way.
import type { Booking } from '@/api/bookings';
import { toBookingStatus } from './booking-status';
import { wallMinutes } from './format';

export const LAPSES = ['expired', 'late_start', 'overrun'] as const;
export type Lapse = (typeof LAPSES)[number];

/** Minutes of tolerance before a start, or a service, counts as late. */
export const GRACE_MINUTES = 5;

export const LAPSE_COLOR: Record<Lapse, string> = {
	expired: 'var(--faint)',
	late_start: 'var(--st-pending)',
	overrun: 'var(--st-noshow)'
};

/**
 * Minutes between the planned start and the moment "start" was pressed. While
 * a confirmed booking has not been started, the wait runs up to now. Null when
 * the booking has no start to be late for (a request, a cancellation).
 */
export function startDelay(booking: Booking, now = Date.now()): number | null {
	const planned = wallMinutes(`${booking.booking_date}T${booking.start_time}`);
	if (Number.isNaN(planned)) return null;
	if (booking.started_at) return wallMinutes(booking.started_at) - planned;
	const status = toBookingStatus(booking.status);
	return status === 'confirmed' || status === 're-confirmed' ? wallMinutes(now) - planned : null;
}

/**
 * Minutes a started service ran past its planned duration. While it is still
 * in progress, the clock runs up to now. Null when the service never started.
 */
export function overrun(booking: Booking, now = Date.now()): number | null {
	const running = toBookingStatus(booking.status) === 'in_progress';
	if (booking.started_at) {
		const end = booking.completed_at ? Date.parse(booking.completed_at) : running ? now : null;
		return end === null ? null : (end - Date.parse(booking.started_at)) / 60_000 - booking.total_duration_minutes;
	}
	// no start time sent: the live agenda still says how far past its end a service is
	return running && typeof booking.remaining_time_seconds === 'number' ? -booking.remaining_time_seconds / 60 : null;
}

/** A service can both start late and run over; an expired request is only that. */
export function lapsesOf(booking: Booking, now = Date.now()): Lapse[] {
	const status = toBookingStatus(booking.status);
	if (status === 'expired' || (status === 'pending' && booking.is_expired)) return ['expired'];
	const found: Lapse[] = [];
	if ((startDelay(booking, now) ?? 0) > GRACE_MINUTES) found.push('late_start');
	if ((overrun(booking, now) ?? 0) > GRACE_MINUTES) found.push('overrun');
	return found;
}
