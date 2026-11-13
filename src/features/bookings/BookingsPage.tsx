import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { RefreshCw } from 'lucide-react';
import { errorText } from '@/api/http';
import { useBookingAction, useFreeSlots, useLiveBookings, type Booking, type BookingAction, type LiveBookings } from '@/api/bookings';
import { useCurrentShop } from '@/app/shop-context';
import { t, type MessageKey } from '@/i18n';
import { toBookingStatus } from '@/lib/booking-status';
import { capitalize, duration, mad, time, weekdayDate } from '@/lib/format';
import { Button } from '@/ui/Button';
import { ChipGroup, Failure, Loading } from '@/ui/controls';
import { Dialog } from '@/ui/Dialog';
import { Field, Select, Textarea } from '@/ui/Field';
import { SearchInput, StatusBadge } from '@/ui/lists';
import { MoreMenu } from '@/ui/MoreMenu';
import { PageHeader } from '@/ui/PageHeader';
import { useToast } from '@/ui/Toast';
import { Agenda } from './Agenda';
import './Bookings.css';

type Tab = 'pending' | 'reschedule' | 'confirmed' | 'inProgress' | 'today' | 'upcoming';

const TABS: Record<Tab, { list: keyof LiveBookings; label: MessageKey; empty: MessageKey }> = {
	pending: { list: 'pending_bookings', label: 'live.tabPending', empty: 'live.emptyPending' },
	reschedule: { list: 'reschedule_requested', label: 'live.tabReschedule', empty: 'live.emptyReschedule' },
	confirmed: { list: 'current_bookings', label: 'live.tabConfirmed', empty: 'live.emptyConfirmed' },
	inProgress: { list: 'in_progress_bookings', label: 'live.tabInProgress', empty: 'live.emptyInProgress' },
	today: { list: 'todays_bookings', label: 'live.tabToday', empty: 'live.emptyToday' },
	upcoming: { list: 'upcoming_bookings', label: 'live.tabUpcoming', empty: 'live.emptyUpcoming' }
};
const TAB_ORDER = Object.keys(TABS) as Tab[];
/** Tabs where the salon still owes an answer (shown in the top "Active" section). */
const ACTIVE_TABS: Tab[] = ['pending', 'reschedule'];

/** What the confirmation says for each action, and the name of its button. */
const ACTIONS: Record<Exclude<BookingAction, 'offer_reschedule_slots'>, { label: MessageKey; title: MessageKey; text: MessageKey; danger?: boolean }> = {
	accept: { label: 'live.action.accept', title: 'live.action.acceptTitle', text: 'live.action.acceptDescription' },
	cancel: { label: 'live.action.cancel', title: 'live.action.cancelTitle', text: 'live.action.cancelDescription', danger: true },
	start_service: { label: 'live.action.start', title: 'live.action.startTitle', text: 'live.action.startDescription' },
	complete_service: { label: 'live.action.complete', title: 'live.action.completeTitle', text: 'live.action.completeDescription' },
	delay_booking: { label: 'live.action.delay', title: 'live.action.delayTitle', text: 'live.action.delayDescription' },
	report_customer_delay: { label: 'live.action.reportLate', title: 'live.action.reportLateTitle', text: 'live.action.reportLateDescription' },
	mark_no_show: { label: 'live.action.noShow', title: 'live.action.noShowTitle', text: 'live.action.noShowDescription', danger: true },
	request_reschedule: { label: 'live.action.askReschedule', title: 'live.action.askRescheduleTitle', text: 'live.action.askRescheduleDescription' }
};
export type SimpleAction = keyof typeof ACTIONS;

const clientName = (booking: Booking) => booking.client?.full_name || booking.client?.username || t('live.unknownClient');
const when = (booking: Booking) => `${weekdayDate(booking.booking_date)}, ${time(booking.start_time)}`;
/** A confirmed booking can be pushed back once, by 5 or 10 minutes. */
const DELAYS = [5, 10] as const;
export type Delay = (typeof DELAYS)[number];

export function BookingsPage() {
	const shop = useCurrentShop();
	const { data, isPending, isFetching, error, refetch, dataUpdatedAt } = useLiveBookings(shop.id);
	const [activeTab, setActiveTab] = useState<Tab>('pending');
	const [search, setSearch] = useState('');
	const [barber, setBarber] = useState('');
	const [acting, setActing] = useState<{ booking: Booking; action: SimpleAction } | null>(null);
	const [offering, setOffering] = useState<Booking | null>(null);

	const barbers = useMemo(() => {
		const seen = new Map<number, string>();
		for (const key of TAB_ORDER) for (const booking of (data?.[TABS[key].list] as Booking[] | undefined) ?? []) if (booking.barber) seen.set(booking.barber.id, booking.barber.full_name);
		return [...seen].sort((a, b) => a[1].localeCompare(b[1]));
	}, [data]);

	if (error && !data) return <Failure error={error} onRetry={() => void refetch()} />;
	if (isPending || !data) return <Loading />;

	const canAct = data.booking_management_mode === 'manager';
	const term = search.trim().toLowerCase();
	// a request whose time ran out no longer waits for an answer: it leaves the active lists
	const listOf = (key: Tab) => (data[TABS[key].list] as Booking[]).filter((booking) => !(ACTIVE_TABS.includes(key) && booking.is_expired));
	const filterRows = (key: Tab) =>
		listOf(key).filter((booking) => (!barber || String(booking.barber?.id) === barber) && (!term || `${clientName(booking)} ${booking.booking_number}`.toLowerCase().includes(term)));
	const activeRows = filterRows(activeTab);
	const waiting = listOf('pending').length;
	const activeTotal = waiting + listOf('reschedule').length;

	return (
		<>
			<PageHeader
				title={t('live.title')}
				actions={
					<>
						<Link to="/historique" className="btn btn--outline btn--sm">
							{t('live.history')}
						</Link>
						<Button variant="quiet" size="sm" icon={<RefreshCw />} loading={isFetching} onClick={() => void refetch()}>
							{t('live.refresh')}
						</Button>
					</>
				}
			/>

			{error && (
				<p className="notice notice--warn" role="status">
					{t('live.staleError', { time: time(new Date(dataUpdatedAt)) })}
				</p>
			)}

			<div className="toolbar">
				<SearchInput value={search} onChange={setSearch} label={t('live.searchPlaceholder')} />
				{barbers.length > 1 && (
					<Select className="control--sm" aria-label={t('live.barber')} value={barber} onChange={(event) => setBarber(event.target.value)}>
						<option value="">{t('live.allBarbers')}</option>
						{barbers.map(([id, name]) => (
							<option key={id} value={id}>
								{name}
							</option>
						))}
					</Select>
				)}
			</div>

			{activeTotal > 0 && (
				<section className="bookings" aria-labelledby="bookings-active">
					<h2 id="bookings-active" className="bookings-heading">
						{t('live.sectionActive')}
					</h2>
					<ChipGroup
						label={t('live.sectionActive')}
						value={activeTab}
						onChange={setActiveTab}
						options={ACTIVE_TABS.map((key) => ({ value: key, label: t(TABS[key].label), count: listOf(key).length }))}
					/>
					{activeRows.length === 0 ? (
						<p className="muted bookings-none">{t(term || barber ? 'live.noMatch' : TABS[activeTab].empty)}</p>
					) : (
						<ul className="list">
							{activeRows.map((booking) => (
								<BookingRow key={booking.id} booking={booking} canAct={canAct} onAction={(action) => setActing({ booking, action })} onOffer={() => setOffering(booking)} />
							))}
						</ul>
					)}
				</section>
			)}

			<section className="bookings" aria-labelledby="bookings-schedule">
				<h2 id="bookings-schedule" className="bookings-heading">
					{t('live.sectionSchedule')}
				</h2>
				<Agenda live={data} barber={barber} term={term} canAct={canAct} onAction={(booking, action) => setActing({ booking, action })} onOffer={setOffering} />
			</section>

			<ActionDialog acting={acting} onClose={() => setActing(null)} />
			<SlotsDialog booking={offering} onClose={() => setOffering(null)} />
		</>
	);
}

export function BookingRow({ booking, canAct, onAction, onOffer }: { booking: Booking; canAct: boolean; onAction: (action: SimpleAction) => void; onOffer: () => void }) {
	const status = toBookingStatus(booking.status);
	const confirmed = status === 'confirmed' || status === 're-confirmed';
	// a request still waiting for its answer
	const open = status === 'pending' && !booking.is_expired;
	const left = booking.remaining_time_seconds;

	// the one thing to do next, then the rest behind "more".
	// start_service and complete_service live in the barber's own tools, not here.
	const primary: { label: MessageKey; run: () => void; disabled?: boolean } | null =
		open ? { label: 'live.action.accept', run: () => onAction('accept') } : null;
	const more: { label: MessageKey; run: () => void }[] = [];
	if (open) more.push({ label: 'live.action.offerTimes', run: onOffer });
	if (confirmed && booking.can_be_delayed) more.push({ label: 'live.action.delay', run: () => onAction('delay_booking') });
	if (confirmed && booking.can_report_customer_delay) more.push({ label: 'live.action.reportLate', run: () => onAction('report_customer_delay') });
	if (confirmed && booking.can_mark_no_show) more.push({ label: 'live.action.noShow', run: () => onAction('mark_no_show') });
	if (open || confirmed) more.push({ label: 'live.action.askReschedule', run: () => onAction('request_reschedule') });
	if (open || confirmed || status === 'reschedule_requested') more.push({ label: 'live.action.cancel', run: () => onAction('cancel') });

	return (
		<li className="bk">
			<p className="bk-when">
				<b className="num">{time(booking.start_time)}</b>
				<span>{capitalize(weekdayDate(booking.booking_date))}</span>
			</p>
			<div className="bk-main">
				<p className="bk-who">
					<b>{clientName(booking)}</b>
					<StatusBadge status={status === 'pending' && booking.is_expired ? 'expired' : booking.status} />
				</p>
				<p className="bk-what">
					{booking.services.map((service) => service.title).join(', ')} · {duration(booking.total_duration_minutes)} · {booking.barber?.full_name ?? t('live.noBarber')}
				</p>
				<Flags booking={booking} left={left} />
				{booking.client_notes && (
					<p className="bk-note">
						{t('live.notes')} : {booking.client_notes}
					</p>
				)}
			</div>
			<p className="bk-price num">{mad(booking.final_price)}</p>
			{canAct && (primary || more.length > 0) && (
				<div className="bk-actions">
					{primary && (
						<Button size="sm" dot={false} disabled={primary.disabled} title={primary.disabled ? t('live.action.startNotYet') : undefined} onClick={primary.run}>
							{t(primary.label)}
						</Button>
					)}
					<MoreMenu label={t('live.actions')} items={more.map((item) => ({ label: t(item.label), run: item.run }))} />
				</div>
			)}
		</li>
	);
}

function Flags({ booking, left }: { booking: Booking; left: number | null }) {
	const flags: string[] = [];
	if (booking.is_expired) flags.push(t('live.expired'));
	else if (booking.time_until_expiry) flags.push(t('live.expiresIn', { time: duration(Math.ceil(booking.time_until_expiry / 60)) }));
	if (left !== null) flags.push(left >= 0 ? t('live.remaining', { time: duration(Math.ceil(left / 60)) }) : t('live.overBy', { time: duration(Math.ceil(-left / 60)) }));
	if (booking.is_delayed) flags.push(t('live.delayed'));
	if (booking.customer_delay_reported) flags.push(t('live.clientLate'));
	return flags.length ? <p className={`bk-flags${left !== null && left < 0 ? ' is-late' : ''}`}>{flags.join(' · ')}</p> : null;
}

/** Every action is confirmed: it names the client, the time, and what happens next. */
export function ActionDialog({ acting, onClose }: { acting: { booking: Booking; action: SimpleAction; minutes?: Delay } | null; onClose: () => void }) {
	const shop = useCurrentShop();
	const act = useBookingAction(shop.id);
	const toast = useToast();
	const [reason, setReason] = useState('');
	const [minutes, setMinutes] = useState<Delay>(10);

	const close = () => {
		act.reset();
		setReason('');
		onClose();
	};
	// the dialog stays mounted between two actions, so it can close with its animation
	if (!acting) return <Dialog open={false} onClose={close} title="" />;
	const { booking, action } = acting;
	const copy = ACTIONS[action];
	const values = { client: clientName(booking), when: when(booking) };

	return (
		<Dialog
			open
			onClose={close}
			title={t(copy.title, values)}
			description={t(copy.text, values)}
			footer={
				<>
					<Button variant="outline" onClick={close}>
						{t(action === 'cancel' ? 'live.action.keep' : 'live.action.back')}
					</Button>
					<Button
						variant={copy.danger ? 'danger' : 'ink'}
						dot={false}
						loading={act.isPending}
						onClick={() =>
							act.mutate(
								{ bookingId: booking.id, action, ...(action === 'cancel' && reason.trim() ? { reason: reason.trim() } : {}), ...(action === 'delay_booking' ? { delay_minutes: acting.minutes ?? minutes } : {}) },
								{
									onSuccess: () => {
										toast(t(`live.action.done.${action}`));
										close();
									}
								}
							)
						}
					>
						{t(copy.label)}
					</Button>
				</>
			}
		>
			{action === 'cancel' && (
				<Field label={t('live.action.reason')}>{({ id }) => <Textarea id={id} value={reason} maxLength={300} onChange={(event) => setReason(event.target.value)} />}</Field>
			)}
			{action === 'delay_booking' && !acting.minutes && (
				<div className="field">
					<span className="field-label">{t('live.action.delayMinutes')}</span>
					<ChipGroup
						label={t('live.action.delayMinutes')}
						value={String(minutes)}
						onChange={(value) => setMinutes(Number(value) as Delay)}
						options={DELAYS.map((value) => ({ value: String(value), label: duration(value) }))}
					/>
				</div>
			)}
			{act.isError && (
				<p className="notice notice--bad" role="alert">
					{errorText(act.error)}
				</p>
			)}
		</Dialog>
	);
}

/** The free slots, day by day, in the order the API gives them. */
function slotDays<T extends { start_time: string }>(slots: T[]): [string, T[]][] {
	const days = new Map<string, T[]>();
	for (const slot of slots) {
		const date = slot.start_time.slice(0, 10);
		days.set(date, [...(days.get(date) ?? []), slot]);
	}
	return [...days];
}
/** Offer the client up to three of the barber's free slots. */
export function SlotsDialog({ booking, onClose }: { booking: Booking | null; onClose: () => void }) {
	const shop = useCurrentShop();
	const slots = useFreeSlots(shop.id, booking?.id ?? null);
	const act = useBookingAction(shop.id);
	const toast = useToast();
	const [picked, setPicked] = useState<string[]>([]);

	const close = () => {
		act.reset();
		setPicked([]);
		onClose();
	};
	const names = { barber: booking?.barber?.full_name ?? t('live.noBarber'), client: booking ? clientName(booking) : '' };

	return (
		<Dialog
			open={Boolean(booking)}
			onClose={close}
			title={t('live.slots.title')}
			description={t('live.slots.description', names)}
			footer={
				<>
					<span className="muted bk-picked">{t('live.slots.selected', { count: picked.length })}</span>
					<Button
						dot={false}
						variant="mauve"
						disabled={!picked.length}
						loading={act.isPending}
						onClick={() =>
							booking &&
							act.mutate(
								{ bookingId: booking.id, action: 'offer_reschedule_slots', selected_slots: picked },
								{
									onSuccess: () => {
										toast(t('live.action.done.offer_reschedule_slots'));
										close();
									}
								}
							)
						}
					>
						{t('live.slots.send')}
					</Button>
				</>
			}
		>
			{slots.isPending ? (
				<p className="muted">{t('common.messages.loading')}</p>
			) : slots.error ? (
				<p className="notice notice--bad" role="alert">
					{t('live.slots.loadError')}
				</p>
			) : slots.data.length === 0 ? (
				<p className="muted">{t('live.slots.none', names)}</p>
			) : (
				<div className="slot-days">
					{slotDays(slots.data).map(([date, list]) => (
						<section key={date} className="slot-day" aria-label={capitalize(weekdayDate(date))}>
							<h3>{capitalize(weekdayDate(date))}</h3>
							<ul className="slot-list">
								{list.map((slot) => {
									const on = picked.includes(slot.start_time);
									const off = !on && picked.length >= 3;
									return (
										<li key={slot.start_time}>
											<label className={`slot-row${on ? ' is-on' : ''}${off ? ' is-off' : ''}`}>
												<input
													type="checkbox"
													checked={on}
													disabled={off}
													onChange={() => setPicked((list) => (on ? list.filter((value) => value !== slot.start_time) : [...list, slot.start_time]))}
												/>
												<span className="slot-time num">
													<b>{time(slot.start_time.slice(11))}</b>
													{slot.end_time && <span> – {time(slot.end_time.slice(11))}</span>}
												</span>
											</label>
										</li>
									);
								})}
							</ul>
						</section>
					))}
				</div>
			)}
			{act.isError && (
				<p className="notice notice--bad" role="alert">
					{errorText(act.error)}
				</p>
			)}
		</Dialog>
	);
}
