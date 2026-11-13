import { useState } from 'react';
import { Link } from 'react-router';
import { ArrowRight, Check, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useBookingAction, useLiveBookings, type Booking, type LiveBookings } from '@/api/bookings';
import { errorText, mediaUrl } from '@/api/http';
import { usePresence, usePresenceHistory, type PresenceDay, type PresenceNow } from '@/api/presence';
import { useCurrentShop } from '@/app/shop-context';
import { ActionDialog, SlotsDialog, type Delay, type SimpleAction } from '@/features/bookings/BookingsPage';
import { t } from '@/i18n';
import { GRACE_MINUTES, overrun, startDelay } from '@/lib/booking-lapses';
import { capitalize, daysAgo, duration, mad, time, today, weekdayDate } from '@/lib/format';
import { Button } from '@/ui/Button';
import { Failure, Loading } from '@/ui/controls';
import { Dialog } from '@/ui/Dialog';
import { Avatar } from '@/ui/Portrait';
import { useToast } from '@/ui/Toast';

/** Why a booking is on the list of things to do. */
type Kind = 'request' | 'reschedule' | 'late' | 'over' | 'ready' | 'expired' | 'next';
interface Task {
	booking: Booking;
	kind: Kind;
}

const KIND_COLOR: Record<Kind, string> = {
	request: 'var(--st-pending)',
	reschedule: 'var(--st-pending)',
	late: 'var(--st-noshow)',
	over: 'var(--st-noshow)',
	ready: 'var(--st-done)',
	expired: 'var(--faint)',
	next: 'var(--st-confirmed)'
};

/**
 * Everything that waits for a hand, most pressing first: requests by the time
 * left to answer, bookings to move, services that should have started,
 * services running past their time, services that can start, and last the
 * requests that already expired.
 */
function tasksOf(data: LiveBookings, now: number): Task[] {
	const as = (kind: Kind) => (booking: Booking) => ({ booking, kind });
	const open = data.pending_bookings.filter((booking) => !booking.is_expired).sort((a, b) => (a.time_until_expiry ?? Infinity) - (b.time_until_expiry ?? Infinity));
	const late = data.current_bookings.filter((booking) => (startDelay(booking, now) ?? 0) > GRACE_MINUTES);
	const over = data.in_progress_bookings.filter((booking) => (overrun(booking, now) ?? 0) > GRACE_MINUTES);
	const ready = data.current_bookings.filter((booking) => booking.can_start_service && !late.includes(booking));
	const expired = data.pending_bookings.filter((booking) => booking.is_expired);
	return [...open.map(as('request')), ...data.reschedule_requested.map(as('reschedule')), ...late.map(as('late')), ...over.map(as('over')), ...ready.map(as('ready')), ...expired.map(as('expired'))];
}

const clientName = (booking: Booking) => booking.client?.full_name || booking.client?.username || t('live.unknownClient');
const dayName = (date: string) => (date === today() ? t('home.today') : date === daysAgo(-1) ? t('home.tomorrow') : capitalize(weekdayDate(date)));

/** What needs the salon now, one booking at a time, and the way to all the others. */
export function LiveRequests() {
	const shop = useCurrentShop();
	const { data, error, refetch } = useLiveBookings(shop.id);
	const accept = useBookingAction(shop.id);
	const toast = useToast();
	const [picked, setPicked] = useState<number | null>(null);
	// answered here, and not yet gone from the agenda's next refresh
	const [handled, setHandled] = useState<string[]>([]);
	const [acting, setActing] = useState<{ booking: Booking; action: SimpleAction; minutes?: Delay } | null>(null);
	const [offering, setOffering] = useState<Booking | null>(null);

	if (error && !data) return <Failure error={error} onRetry={() => void refetch()} />;
	if (!data) return <Loading />;

	const tasks = tasksOf(data, Date.now()).filter((task) => !handled.includes(`${task.booking.id}:${task.kind}`));
	const at = Math.max(
		0,
		tasks.findIndex((task) => task.booking.id === picked)
	);
	const upcoming = data.current_bookings.find((booking) => !tasks.some((task) => task.booking.id === booking.id));
	const task: Task | null = tasks[at] ?? (upcoming ? { booking: upcoming, kind: 'next' } : null);
	const canAct = data.booking_management_mode === 'manager';

	const step = (by: number) => {
		accept.reset();
		setPicked(tasks[(at + by + tasks.length) % tasks.length]?.booking.id ?? null);
	};
	// accepting is one press: no second question, the next booking comes up
	const acceptNow = (booking: Booking) =>
		accept.mutate(
			{ bookingId: booking.id, action: 'accept' },
			{
				onSuccess: () => {
					setHandled((list) => [...list, `${booking.id}:request`]);
					setPicked(null);
					toast(t('live.action.done.accept'));
				}
			}
		);

	const counts = [
		{ label: t('live.tabPending'), value: data.pending_bookings.length, urgent: true },
		{ label: t('live.tabReschedule'), value: data.reschedule_requested.length, urgent: true },
		{ label: t('live.tabConfirmed'), value: data.current_bookings.length, urgent: false },
		{ label: t('live.tabInProgress'), value: data.in_progress_bookings.length, urgent: false },
		{ label: t('home.today'), value: data.stats.today_count, urgent: false }
	];

	return (
		<section className="act" aria-labelledby="dash-requests">
			<div className="act-head">
				<h2 id="dash-requests">
					{t('home.requests')}
					{tasks.length > 0 && (
						<span className="act-count num" aria-label={t('home.toHandle', { count: tasks.length })}>
							{tasks.length}
						</span>
					)}
				</h2>
				{tasks.length > 1 && (
					<div className="act-step" role="group" aria-label={t('home.requests')}>
						<button type="button" aria-label={t('home.previousTask')} onClick={() => step(-1)}>
							<ChevronLeft aria-hidden="true" />
						</button>
						<span className="num" aria-live="polite">
							{t('home.taskOf', { index: at + 1, count: tasks.length })}
						</span>
						<button type="button" aria-label={t('home.nextTask')} onClick={() => step(1)}>
							<ChevronRight aria-hidden="true" />
						</button>
					</div>
				)}
			</div>

			{task ? (
				<TaskCard
					key={`${task.booking.id}:${task.kind}`}
					task={task}
					canAct={canAct}
					accepting={accept.isPending}
					failure={accept.isError && accept.variables?.bookingId === task.booking.id ? errorText(accept.error) : null}
					onAccept={() => acceptNow(task.booking)}
					onAction={(action, minutes) => setActing({ booking: task.booking, action, minutes })}
					onOffer={() => setOffering(task.booking)}
				/>
			) : (
				<p className="act-none">{t('home.requestsEmpty')}</p>
			)}

			<Link to="/reservations" className="act-all">
				<dl>
					{counts.map((count) => (
						<div key={count.label} className={count.urgent && count.value > 0 ? 'is-alert' : undefined}>
							<dt>{count.label}</dt>
							<dd className="num">{count.value}</dd>
						</div>
					))}
				</dl>
				<span className="act-all-go">
					{t('home.openBookings')}
					<ArrowRight aria-hidden="true" />
				</span>
			</Link>

			<ActionDialog acting={acting} onClose={() => setActing(null)} />
			<SlotsDialog booking={offering} onClose={() => setOffering(null)} />
		</section>
	);
}

interface TaskCardProps {
	task: Task;
	canAct: boolean;
	accepting: boolean;
	failure: string | null;
	onAccept: () => void;
	onAction: (action: SimpleAction, minutes?: Delay) => void;
	onOffer: () => void;
}

/**
 * One booking and what to do with it. Black while it waits for an answer, so
 * it is the first thing read on the page; white when it is only the next
 * client. The answer is one large button, its opposite beside it.
 */
function TaskCard({ task, canAct, accepting, failure, onAccept, onAction, onOffer }: TaskCardProps) {
	const { booking, kind } = task;
	const now = Date.now();
	const expiry = kind === 'request' && booking.time_until_expiry ? Math.ceil(booking.time_until_expiry / 60) : null;

	const label: Record<Kind, string> = {
		request: t('home.kind.request'),
		reschedule: t('live.tabReschedule'),
		late: t('home.kind.late'),
		over: t('home.kind.over'),
		ready: t('home.kind.ready'),
		expired: t('live.expired'),
		next: t('home.kind.next')
	};
	// the one figure that says how pressing it is
	const pressure =
		expiry !== null
			? { text: t('live.expiresIn', { time: duration(expiry) }), bad: expiry <= 30 }
			: kind === 'late'
				? { text: t('home.lateBy', { time: duration(Math.floor(startDelay(booking, now) ?? 0)) }), bad: true }
				: kind === 'over'
					? { text: t('live.overBy', { time: duration(Math.floor(overrun(booking, now) ?? 0)) }), bad: true }
					: booking.customer_delay_reported
						? { text: t('live.clientLate'), bad: false }
						: null;

	const decline = (
		<Button variant="outline" dot={false} icon={<X aria-hidden="true" />} onClick={() => onAction('cancel')}>
			{t(kind === 'request' || kind === 'expired' ? 'live.action.decline' : 'live.action.cancel')}
		</Button>
	);
	const offer = (
		<button type="button" className="text-btn" onClick={onOffer}>
			{t('live.action.offerTimes')}
		</button>
	);

	return (
		<article className={`act-card${kind === 'next' ? ' act-card--quiet' : ''}`} aria-label={`${label[kind]} : ${clientName(booking)}, ${dayName(booking.booking_date)} ${time(booking.start_time)}`}>
			<div className="act-top">
				<p className="act-kind">
					<i style={{ background: KIND_COLOR[kind] }} aria-hidden="true" />
					{label[kind]}
				</p>
				{pressure && <p className={`act-pill${pressure.bad ? ' is-bad' : ''}`}>{pressure.text}</p>}
			</div>

			<div className="act-body">
				<div className="act-info">
					<p className="act-when">
						<b className="num">{time(booking.start_time)}</b>
						<span>{dayName(booking.booking_date)}</span>
					</p>
					<h3 className="act-client">{clientName(booking)}</h3>
					<p className="act-services">{booking.services.map((service) => service.title).join(', ')}</p>
					<dl className="act-facts">
						<div>
							<dt>{t('live.barber')}</dt>
							<dd>{booking.barber?.full_name ?? t('live.noBarber')}</dd>
						</div>
						<div>
							<dt>{t('home.duration')}</dt>
							<dd className="num">{duration(booking.total_duration_minutes)}</dd>
						</div>
						<div>
							<dt>{t('home.price')}</dt>
							<dd className="num">{mad(booking.final_price)}</dd>
						</div>
					</dl>
					{booking.client_notes && <p className="act-note">« {booking.client_notes} »</p>}
				</div>

				{canAct ? (
					<div className="act-actions">
						{kind === 'request' && (
							<>
								<div className="act-pair">
									<Button variant="white" dot={false} icon={<Check aria-hidden="true" />} loading={accepting} onClick={onAccept}>
										{t('live.action.accept')}
									</Button>
									{decline}
								</div>
								{offer}
							</>
						)}
						{(kind === 'reschedule' || kind === 'expired') && (
							<div className="act-pair">
								<Button variant="white" dot={false} onClick={onOffer}>
									{t('live.action.offerTimes')}
								</Button>
								{decline}
							</div>
						)}
						{(kind === 'late' || kind === 'ready' || kind === 'next') && (
							<>
								<div className="act-pair">
									<Button
										variant={kind === 'next' ? 'ink' : 'white'}
										dot={false}
										disabled={!booking.can_start_service}
										title={booking.can_start_service ? undefined : t('live.action.startNotYet')}
										onClick={() => onAction('start_service')}
									>
										{t('live.action.start')}
									</Button>
									{kind === 'late' && booking.can_mark_no_show ? (
										<Button variant="outline" dot={false} onClick={() => onAction('mark_no_show')}>
											{t('live.action.noShow')}
										</Button>
									) : (
										decline
									)}
								</div>
								{booking.can_be_delayed && (
									<div className="act-delay" role="group" aria-label={t('live.action.delay')}>
										<span>{t('live.action.delay')}</span>
										{([5, 10] as const).map((minutes) => (
											<button key={minutes} type="button" onClick={() => onAction('delay_booking', minutes)}>
												+{minutes} min
											</button>
										))}
									</div>
								)}
							</>
						)}
						{kind === 'over' && (
							<div className="act-pair act-pair--one">
								<Button variant="white" dot={false} icon={<Check aria-hidden="true" />} onClick={() => onAction('complete_service')}>
									{t('live.action.complete')}
								</Button>
							</div>
						)}
						{failure && (
							<p className="notice notice--bad" role="alert">
								{failure}
							</p>
						)}
					</div>
				) : (
					<p className="act-readonly">{t('live.readOnly')}</p>
				)}
			</div>
		</article>
	);
}

const stateText = (barber: PresenceNow) => (!barber.since ? t('home.notArrived') : barber.is_present ? t('home.presentSince', { time: barber.since }) : t('home.absentSince', { time: barber.since }));
const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

/**
 * Who is in the salon, kept as small as a game's status line: the count, a bar
 * that fills with the share of the team present, and each barber as a name tag.
 * A tag opens that barber's week.
 */
export function PresenceStrip() {
	const shop = useCurrentShop();
	const { data } = usePresence(shop.id);
	const [open, setOpen] = useState<PresenceNow | null>(null);
	if (!data || data.barbers.length === 0) return null;

	const present = data.barbers.filter((barber) => barber.is_present);
	const team = [...present, ...data.barbers.filter((barber) => !barber.is_present)];

	return (
		<div className="hud" role="group" aria-label={t('home.presence')}>
			<p className="hud-count" title={t('home.presenceSource')}>
				<span>{t('home.presence')}</span>
				<b className="num" aria-label={t('home.presenceCount', { present: present.length, total: team.length })}>
					{present.length}/{team.length}
				</b>
				<i className="hud-bar" aria-hidden="true">
					<i style={{ width: `${(present.length / team.length) * 100}%` }} />
				</i>
			</p>
			<ul className="hud-team">
				{team.map((barber) => (
					<li key={barber.id}>
						<button type="button" className={`hud-who${barber.is_present ? ' is-in' : ''}`} aria-label={`${barber.full_name}, ${stateText(barber)}`} onClick={() => setOpen(barber)}>
							<span className="hud-face">
								<Avatar name={barber.full_name} src={mediaUrl(barber.profile_picture)} size={22} />
							</span>
							<span className="hud-name">{firstName(barber.full_name)}</span>
						</button>
					</li>
				))}
			</ul>
			<PresenceDialog barber={open} onClose={() => setOpen(null)} />
		</div>
	);
}

const toMinutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));

/** One barber's last seven days: when their phone was in the salon, and when not. */
function PresenceDialog({ barber, onClose }: { barber: PresenceNow | null; onClose: () => void }) {
	const shop = useCurrentShop();
	const { data, error, refetch } = usePresenceHistory(shop.id, barber?.id ?? null);
	return (
		<Dialog
			open={Boolean(barber)}
			onClose={onClose}
			placement="side"
			title={barber ? t('home.presenceTitle', { name: barber.full_name }) : ''}
			description={barber ? stateText(barber) : undefined}
			header={barber && <span className="presence-face"><Avatar name={barber.full_name} src={mediaUrl(barber.profile_picture)} size={64} /></span>}
		>
			<p className="presence-note">{t('home.presenceSource')}</p>
			<p className="presence-legend">
				<span>
					<i className="is-in" aria-hidden="true" />
					{t('home.present')}
				</span>
				<span>
					<i aria-hidden="true" />
					{t('home.absent')}
				</span>
			</p>
			{error && !data ? (
				<Failure error={error} onRetry={() => void refetch()} />
			) : !data ? (
				<Loading />
			) : (
				<ol className="presence-days">
					{data.days.map((day) => (
						<PresenceRow key={day.date} day={day} />
					))}
				</ol>
			)}
		</Dialog>
	);
}

function PresenceRow({ day }: { day: PresenceDay }) {
	const open = toMinutes(day.opening);
	const span = toMinutes(day.closing) - open;
	const at = (value: string) => ((toMinutes(value) - open) / span) * 100;
	const inside = day.segments.filter((segment) => segment.present);
	return (
		<li>
			<div className="presence-day-head">
				<b>{capitalize(weekdayDate(day.date))}</b>
				<span className="num">
					{day.closed
						? t('home.closedDay')
						: inside.length === 0
							? t('home.noPresence')
							: `${t('home.presentFor', { time: duration(day.present_minutes) })} · ${t('home.absentFor', { time: duration(day.absent_minutes) })}`}
				</span>
			</div>
			{!day.closed && (
				<>
					<div className="presence-track" aria-hidden="true">
						{day.segments.map((segment) => (
							<span
								key={segment.start}
								className={segment.present ? 'is-in' : ''}
								style={{
									insetInlineStart: `${at(segment.start)}%`,
									width: `${at(segment.end) - at(segment.start)}%`
								}}
							/>
						))}
					</div>
					<div className="presence-scale num" aria-hidden="true">
						{[day.opening, '12:00', '16:00', day.closing].map((mark) => (
							<span key={mark} style={{ insetInlineStart: `${at(mark)}%` }}>
								{mark}
							</span>
						))}
					</div>
				</>
			)}
			{inside.length > 0 && (
				<p className="presence-slots num">
					{t('home.presentSlots')} : {inside.map((segment) => `${segment.start}–${segment.end}`).join(', ')}
				</p>
			)}
		</li>
	);
}
