import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { ArrowRight, Check, X } from 'lucide-react';
import { useBookingAction, useLiveBookings, type Booking, type LiveBookings } from '@/api/bookings';
import { errorText, mediaUrl } from '@/api/http';
import { usePresence, usePresenceHistory, type PresenceDay, type PresenceNow } from '@/api/presence';
import { useCurrentShop } from '@/app/shop-context';
import { ActionDialog, SlotsDialog, type Delay, type SimpleAction } from '@/features/bookings/BookingsPage';
import { t } from '@/i18n';
import { GRACE_MINUTES, startDelay } from '@/lib/booking-lapses';
import { capitalize, daysAgo, duration, mad, time, today, weekdayDate } from '@/lib/format';
import { Button } from '@/ui/Button';
import { Failure, Loading } from '@/ui/controls';
import { Dialog } from '@/ui/Dialog';
import { MoreMenu } from '@/ui/MoreMenu';
import { Avatar } from '@/ui/Portrait';
import { useToast } from '@/ui/Toast';

/**
 * Why a booking waits for the manager: a request to answer, or a client who
 * has not shown up. Starting and finishing a service is the barber's, in the
 * barber's own app, so neither appears here.
 */
type Kind = 'request' | 'late';
interface Task {
	booking: Booking;
	kind: Kind;
	/** seconds left to answer a request, counted down from the last refresh */
	left: number | null;
}

const KIND_COLOR: Record<Kind, string> = {
	request: 'var(--st-pending)',
	late: 'var(--st-noshow)'
};

/** A request is answered within 10 minutes, or it expires. The ring shows what is left of them. */
const REQUEST_WINDOW_SECONDS = 10 * 60;
/** The ring and its figure turn red for the last two minutes. */
const URGENT_SECONDS = 2 * 60;

/** The time on the device, refreshed every second, so a countdown runs between two refreshes of the agenda. */
function useNow() {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		const timer = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(timer);
	}, []);
	return now;
}

/** 4:05 */
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

/**
 * What waits for the manager, most pressing first: requests by the time left
 * to answer, then clients who are late. A request whose time ran out leaves
 * the list: it is expired.
 */
function tasksOf(data: LiveBookings, now: number, fetchedAt: number): Task[] {
	const elapsed = Math.max(0, (now - fetchedAt) / 1000);
	const requests = data.pending_bookings
		.filter((booking) => !booking.is_expired)
		.map((booking): Task => ({ booking, kind: 'request', left: booking.time_until_expiry == null ? null : booking.time_until_expiry - elapsed }))
		.filter((task) => task.left === null || task.left > 0)
		.sort((a, b) => (a.left ?? Infinity) - (b.left ?? Infinity));
	const late = data.current_bookings.filter((booking) => (startDelay(booking, now) ?? 0) > GRACE_MINUTES).map((booking): Task => ({ booking, kind: 'late', left: null }));
	return [...requests, ...late];
}

const clientName = (booking: Booking) => booking.client?.full_name || booking.client?.username || t('live.unknownClient');
const dayName = (date: string) => (date === today() ? t('home.today') : date === daysAgo(-1) ? t('home.tomorrow') : capitalize(weekdayDate(date)));
/** When the booking ends: its start plus its length, as 14:05. */
const endOf = (booking: Booking) => {
	const [h = 0, m = 0] = time(booking.start_time).split(':').map(Number);
	const total = h * 60 + m + Number(booking.total_duration_minutes || 0);
	return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

/** What needs the manager now: one booking in full, the others as a row of chips to pick from. */
export function LiveRequests() {
	const shop = useCurrentShop();
	const { data, error, refetch, dataUpdatedAt } = useLiveBookings(shop.id);
	const accept = useBookingAction(shop.id);
	const toast = useToast();
	const now = useNow();
	const [picked, setPicked] = useState<number | null>(null);
	// answered here, and not yet gone from the agenda's next refresh
	const [handled, setHandled] = useState<string[]>([]);
	const [acting, setActing] = useState<{ booking: Booking; action: SimpleAction; minutes?: Delay } | null>(null);
	const [offering, setOffering] = useState<Booking | null>(null);

	if (error && !data) return <Failure error={error} onRetry={() => void refetch()} />;
	if (!data) return <Loading />;

	const tasks = tasksOf(data, now, dataUpdatedAt).filter((task) => !handled.includes(`${task.booking.id}:${task.kind}`));
	const task: Task | null = tasks.find((item) => item.booking.id === picked) ?? tasks[0] ?? null;
	const canAct = data.booking_management_mode === 'manager';
	const rest = tasks.filter((item) => item !== task);

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
			</div>

			{task ? (
				<TaskCard
					key={`${task.booking.id}:${task.kind}`}
					task={task}
					now={now}
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

			{rest.length > 0 && (
				<div className="act-next">
					<p className="act-next-label">{t('home.queueNext')}</p>
					<ol className="act-queue" aria-label={t('home.queueNext')}>
						{rest.map((item) => (
							<li key={`${item.booking.id}:${item.kind}`}>
								<button
									type="button"
									className="act-mini"
									onClick={() => {
										accept.reset();
										setPicked(item.booking.id);
									}}
								>
									<span className="act-mini-row">
										<span className="act-mini-range num">
											<b>{time(item.booking.start_time)}</b>
											<span>– {endOf(item.booking)}</span>
										</span>
										<b className="act-mini-price num">{mad(item.booking.final_price)}</b>
									</span>
									<span className="act-mini-who">{clientName(item.booking)}</span>
									{item.left !== null ? (
										<span className={`act-mini-timer${item.left <= URGENT_SECONDS ? ' is-bad' : ''}`} role="timer" aria-label={t('live.expiresIn', { time: clock(Math.max(0, item.left)) })}>
											<span className="act-mini-track" aria-hidden="true">
												<i style={{ width: `${Math.max(0, Math.min(1, item.left / REQUEST_WINDOW_SECONDS)) * 100}%` }} />
											</span>
											<span className="act-mini-left num" aria-hidden="true">
												{clock(Math.max(0, item.left))}
											</span>
										</span>
									) : (
										<span className="act-mini-left is-bad">{t('home.kind.late')}</span>
									)}
								</button>
							</li>
						))}
					</ol>
				</div>
			)}

			<Link to="/reservations" className="act-queue-all">
				{t('home.openBookings')}
				<ArrowRight aria-hidden="true" />
			</Link>

			<ActionDialog acting={acting} onClose={() => setActing(null)} />
			<SlotsDialog booking={offering} onClose={() => setOffering(null)} />
		</section>
	);
}

interface TaskCardProps {
	task: Task;
	now: number;
	canAct: boolean;
	accepting: boolean;
	failure: string | null;
	onAccept: () => void;
	onAction: (action: SimpleAction, minutes?: Delay) => void;
	onOffer: () => void;
}

/** One booking and what the manager can do with it: the answer as one large button, the other way beside it. */
function TaskCard({ task, now, canAct, accepting, failure, onAccept, onAction, onOffer }: TaskCardProps) {
	const { booking, kind, left } = task;
	const label = t(kind === 'request' ? 'home.kind.request' : 'home.kind.late');
	const urgent = left !== null && left <= URGENT_SECONDS;

	return (
		<article className="act-card" aria-label={`${label} : ${clientName(booking)}, ${dayName(booking.booking_date)} ${time(booking.start_time)}`}>
			<div className="act-top">
				<p className="act-kind">
					<i style={{ background: KIND_COLOR[kind] }} aria-hidden="true" />
					{label}
				</p>
				{kind === 'late' && <p className="act-left is-bad">{t('home.lateBy', { time: duration(Math.floor(startDelay(booking, now) ?? 0)) })}</p>}
				{canAct && kind === 'request' && <MoreMenu label={t('live.actions')} items={[{ label: t('live.action.decline'), run: () => onAction('cancel') }]} />}
			</div>
			{left !== null && (
				<div className={`act-timer${urgent ? ' is-bad' : ''}`} role="timer" aria-label={t('live.expiresIn', { time: clock(Math.max(0, left)) })}>
					<span className="act-track" aria-hidden="true">
						<i style={{ width: `${Math.max(0, Math.min(1, left / REQUEST_WINDOW_SECONDS)) * 100}%` }} />
					</span>
					<span className="act-left num" aria-hidden="true">
						{clock(Math.max(0, left))}
					</span>
				</div>
			)}
			<div className="act-body">
				<div className="act-info">
					<p className="act-day">{dayName(booking.booking_date)}</p>
					<p className="act-when num">
						<b>{time(booking.start_time)}</b>
						<ArrowRight className="act-when-arrow" aria-hidden="true" />
						<span>{endOf(booking)}</span>
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
				</div>

				{canAct ? (
					<div className="act-actions">
						{kind === 'request' ? (
							<>
								<div className="act-pair">
									<Button variant="white" dot={false} icon={<Check aria-hidden="true" />} loading={accepting} onClick={onAccept}>
										{t('live.action.accept')}
									</Button>
									<Button variant="outline" dot={false} onClick={onOffer}>
										{t('live.action.offerTimes')}
									</Button>
								</div>
							</>
						) : (
							<>
								<div className="act-pair">
									{booking.can_mark_no_show && (
										<Button variant="white" dot={false} onClick={() => onAction('mark_no_show')}>
											{t('live.action.noShow')}
										</Button>
									)}
									<Button variant="outline" dot={false} icon={<X aria-hidden="true" />} onClick={() => onAction('cancel')}>
										{t('live.action.cancel')}
									</Button>
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
const HELP_KEY = 'bc.presence-help-closed';

export function PresenceStrip() {
	const shop = useCurrentShop();
	const { data } = usePresence(shop.id);
	const [open, setOpen] = useState<PresenceNow | null>(null);
	const [help, setHelp] = useState(() => {
		try {
			return localStorage.getItem(HELP_KEY) !== '1';
		} catch {
			return true;
		}
	});
	const closeHelp = () => {
		setHelp(false);
		try {
			localStorage.setItem(HELP_KEY, '1');
		} catch {
			/* the note simply shows again next time */
		}
	};
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
								<Avatar name={barber.full_name} src={mediaUrl(barber.profile_picture)} size={22} round />
							</span>
							<span className="hud-name">{firstName(barber.full_name)}</span>
						</button>
					</li>
				))}
			</ul>
			{help && (
				<div className="hud-help" role="note">
					<button type="button" className="hud-help-close" aria-label={t('common.buttons.close')} onClick={closeHelp}>
						<X aria-hidden />
					</button>
					<p className="hud-help-title">{t('home.presenceHelpTitle')}</p>
					<p>{t('home.presenceHelp')}</p>
				</div>
			)}
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
