import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useBarberSchedules } from '@/api/barbers';
import { mediaUrl } from '@/api/http';
import { useBookingsBetween, type Booking, type LiveBookings } from '@/api/bookings';
import { useCurrentShop } from '@/app/shop-context';
import { t } from '@/i18n';
import { statusLabel, toBookingStatus, type BookingStatus } from '@/lib/booking-status';
import { capitalize, dateFull, time, today } from '@/lib/format';
import { Dialog } from '@/ui/Dialog';
import { Avatar } from '@/ui/Portrait';
import { BookingRow, type SimpleAction } from './BookingsPage';

/** One hour on the agenda, in pixels. */
const HOUR = 96;
const PX = HOUR / 60;

/**
 * Which booking a slot shows first when several share it: the service under
 * way, then the confirmed booking still to come, then what still waits for an
 * answer, then what is over, and last what did not happen.
 */
const RANK: Record<BookingStatus, number> = {
	in_progress: 0,
	confirmed: 1,
	're-confirmed': 1,
	pending: 2,
	reschedule_requested: 2,
	completed: 3,
	no_show: 4,
	cancelled: 5,
	expired: 6
};
const rankOf = (booking: Booking) => {
	const status = toBookingStatus(booking.status);
	return status ? RANK[status] : 7;
};

const minutesOf = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
const clientName = (booking: Booking) => booking.client?.full_name || booking.client?.username || t('live.unknownClient');

function shiftDay(day: string, by: number) {
	const date = new Date(`${day}T12:00:00`);
	date.setDate(date.getDate() + by);
	return date.toISOString().slice(0, 10);
}

/** Bookings of one barber that share time, the most important first. */
interface Stack {
	key: string;
	bookings: Booking[];
}

function stacksOf(bookings: Booking[]): Stack[] {
	const sorted = [...bookings].sort((a, b) => minutesOf(a.start_time) - minutesOf(b.start_time));
	const groups: Booking[][] = [];
	let end = -1;
	for (const booking of sorted) {
		const start = minutesOf(booking.start_time);
		const last = groups[groups.length - 1];
		if (last && start < end) last.push(booking);
		else groups.push([booking]);
		end = Math.max(start < end ? end : 0, minutesOf(booking.end_time));
	}
	return groups.map((group) => ({
		key: group
			.map((booking) => booking.id)
			.sort((a, b) => a - b)
			.join('-'),
		bookings: group.sort((a, b) => rankOf(a) - rankOf(b) || minutesOf(a.start_time) - minutesOf(b.start_time))
	}));
}

interface Props {
	live: LiveBookings;
	barber: string;
	term: string;
	canAct: boolean;
	onAction: (booking: Booking, action: SimpleAction) => void;
	onOffer: (booking: Booking) => void;
}

/**
 * The salon's day as an agenda: one column per barber, the hours down the
 * side, every booking of the day whatever became of it.
 */
export function Agenda({ live, barber, term, canAct, onAction, onOffer }: Props) {
	const shop = useCurrentShop();
	const [day, setDay] = useState(today);
	const [open, setOpen] = useState<Booking | null>(null);
	const [shown, setShown] = useState<Record<string, number>>({});
	const range = useBookingsBetween(shop.id, day, day);
	const now = useNow();

	// the day's bookings: the history's, and the live ones it may not hold yet
	const bookings = useMemo(() => {
		const all = new Map<number, Booking>();
		for (const booking of range.data?.bookings ?? []) all.set(booking.id, booking);
		for (const list of [live.pending_bookings, live.reschedule_requested, live.current_bookings, live.in_progress_bookings, live.todays_bookings, live.upcoming_bookings])
			for (const booking of list) if (booking.booking_date === day) all.set(booking.id, booking);
		return [...all.values()].filter((booking) => (!barber || String(booking.barber?.id) === barber) && (!term || `${clientName(booking)} ${booking.booking_number}`.toLowerCase().includes(term)));
	}, [range.data, live, day, barber, term]);

	const columns = useMemo(() => {
		const byBarber = new Map<number, { person: NonNullable<Booking['barber']>; bookings: Booking[] }>();
		for (const booking of bookings) {
			if (!booking.barber) continue;
			const column = byBarber.get(booking.barber.id) ?? { person: booking.barber, bookings: [] };
			column.bookings.push(booking);
			byBarber.set(booking.barber.id, column);
		}
		return [...byBarber.values()].sort((a, b) => a.person.full_name.localeCompare(b.person.full_name)).map((column) => ({ ...column, stacks: stacksOf(column.bookings) }));
	}, [bookings]);
	const schedules = useBarberSchedules(
		shop.id,
		columns.map((column) => column.person.id)
	);

	// the day runs from the earliest barber's start to the latest one's end;
	// a booking outside those hours still widens it so nothing is hidden
	const weekday = (new Date(`${day}T12:00:00`).getDay() + 6) % 7;
	const shifts = schedules.map((week) => week?.[String(weekday)]).filter((shift): shift is NonNullable<typeof shift> => Boolean(shift));
	const starts = [...shifts.map((shift) => minutesOf(shift.start)), ...bookings.map((booking) => minutesOf(booking.start_time))];
	const ends = [...shifts.map((shift) => minutesOf(shift.end)), ...bookings.map((booking) => minutesOf(booking.end_time))];
	const first = starts.length ? Math.min(...starts) : 9 * 60;
	const last = ends.length ? Math.max(...ends) : 21 * 60;
	const from = Math.floor(first / 60);
	const to = Math.ceil(last / 60);
	const hours = Array.from({ length: to - from }, (_, i) => from + i);
	const isToday = day === today();
	const nowMinutes = now.getHours() * 60 + now.getMinutes();

	return (
		<div className="agenda">
			<div className="agenda-head">
				<div className="agenda-nav">
					<button type="button" className="agenda-step" aria-label={t('agenda.previous')} onClick={() => setDay((d) => shiftDay(d, -1))}>
						<ChevronLeft aria-hidden />
					</button>
					<button type="button" className="agenda-step" aria-label={t('agenda.next')} onClick={() => setDay((d) => shiftDay(d, 1))}>
						<ChevronRight aria-hidden />
					</button>
					<h3 className="agenda-day">{capitalize(dateFull(`${day}T12:00:00`))}</h3>
				</div>
				{!isToday && (
					<button type="button" className="btn btn--outline btn--sm" onClick={() => setDay(today())}>
						{t('agenda.today')}
					</button>
				)}
			</div>

			{columns.length === 0 ? (
				<p className="muted agenda-none">{range.isPending ? t('common.messages.loading') : t(term || barber ? 'live.noMatch' : 'agenda.empty')}</p>
			) : (
				<div
					className="agenda-scroll"
					ref={(el) => {
						// open the day where it starts: now on today, else its first booking
						if (!el || el.dataset.day === day) return;
						el.dataset.day = day;
						const at = isToday ? nowMinutes - 60 : Math.min(...bookings.map((b) => minutesOf(b.start_time))) - 30;
						el.scrollTop = Math.max(0, (at - from * 60) * PX);
					}}
				>
					<div className="agenda-grid" style={{ gridTemplateColumns: `52px repeat(${columns.length}, minmax(var(--agenda-col, 150px), 1fr))` }}>
						<div className="agenda-corner" />
						{columns.map(({ person }) => (
							<div key={person.id} className="agenda-who">
								<Avatar name={person.full_name} src={mediaUrl(person.profile_picture)} size={34} />
								<span>{person.full_name.split(' ')[0]}</span>
							</div>
						))}

						<div className="agenda-hours" style={{ height: hours.length * HOUR }}>
							{hours.map((hour) => (
								<span key={hour} className="num" style={{ top: (hour - from) * HOUR }}>
									{String(hour).padStart(2, '0')}:00
								</span>
							))}
						</div>
						{columns.map(({ person, stacks }) => (
							<div key={person.id} className="agenda-col" style={{ height: hours.length * HOUR }}>
								{isToday && nowMinutes >= from * 60 && nowMinutes <= to * 60 && <i className="agenda-now" style={{ top: (nowMinutes - from * 60) * PX }} aria-hidden />}
								{stacks.map((stack) => {
									const index = Math.min(shown[stack.key] ?? 0, stack.bookings.length - 1);
									const booking = stack.bookings[index]!;
									const status = toBookingStatus(booking.status);
									const start = minutesOf(booking.start_time);
									const height = Math.max(26, (minutesOf(booking.end_time) - start) * PX - 2);
									const go = (by: number) => setShown((s) => ({ ...s, [stack.key]: (index + by + stack.bookings.length) % stack.bookings.length }));
									const label = status ? statusLabel(status) : booking.status;
									// a confirmed booking is the normal case: only the others say what they are
									const word = status === 'confirmed' || status === 're-confirmed' ? null : label;
									return (
										<div key={stack.key} className={`agenda-item is-${status ?? 'other'}${height < 40 ? ' is-short' : ''}`} style={{ top: (start - from * 60) * PX + 1, height }}>
											<button type="button" className="agenda-open" onClick={() => setOpen(booking)} aria-label={`${time(booking.start_time)}, ${clientName(booking)}, ${label}`}>
												<span className="agenda-client">{clientName(booking)}</span>
												<span className="agenda-line num">
													{time(booking.start_time)}
													<span className="agenda-end"> – {time(booking.end_time)}</span>
												</span>
												{word && height >= 58 && <span className="agenda-line agenda-word">{word}</span>}
											</button>
											{stack.bookings.length > 1 && (
												<span className="agenda-pager">
													<button type="button" aria-label={t('agenda.prevInSlot')} onClick={() => go(-1)}>
														<ChevronLeft aria-hidden />
													</button>
													<span className="num">
														{index + 1}/{stack.bookings.length}
													</span>
													<button type="button" aria-label={t('agenda.nextInSlot')} onClick={() => go(1)}>
														<ChevronRight aria-hidden />
													</button>
												</span>
											)}
										</div>
									);
								})}
							</div>
						))}
					</div>
				</div>
			)}

			<Dialog open={Boolean(open)} onClose={() => setOpen(null)} placement="side" title={open ? clientName(open) : ''} description={open ? `${capitalize(dateFull(`${open.booking_date}T12:00:00`))}, ${time(open.start_time)}` : undefined}>
				{open && (
					<ul className="list">
						<BookingRow
							booking={open}
							canAct={canAct}
							onAction={(action) => {
								onAction(open, action);
								setOpen(null);
							}}
							onOffer={() => {
								onOffer(open);
								setOpen(null);
							}}
						/>
					</ul>
				)}
			</Dialog>
		</div>
	);
}

/** The time now, moving on every minute. */
function useNow() {
	const [now, setNow] = useState(() => new Date());
	useEffect(() => {
		const id = window.setInterval(() => setNow(new Date()), 60_000);
		return () => window.clearInterval(id);
	}, []);
	return now;
}
