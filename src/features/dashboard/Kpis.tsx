import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useBookingsBetween, type Booking } from '@/api/bookings';
import type { DashboardData } from '@/api/dashboard';
import { mediaUrl } from '@/api/http';
import { useStaff, type StaffMember } from '@/api/shops';
import { useCurrentShop } from '@/app/shop-context';
import { DayBars } from '@/charts/DayBars';
import { RevenueTable } from '@/charts/RevenueChart';
import { t } from '@/i18n';
import { GRACE_MINUTES, LAPSE_COLOR, LAPSES, lapsesOf, type Lapse } from '@/lib/booking-lapses';
import { toBookingStatus } from '@/lib/booking-status';
import { dateFull, dateShort, int, mad, pct, personName, signedPct } from '@/lib/format';
import { Failure, Loading } from '@/ui/controls';
import { Avatar } from '@/ui/Portrait';

type Point = DashboardData['revenueChart'][number];
const sum = (points: Point[]) => points.reduce((total, point) => total + point.value, 0);

/** The figures of the period: revenue day by day, then where bookings left their plan, barber by barber. */
export function Kpis({ data }: { data: DashboardData }) {
	const shop = useCurrentShop();
	const start = data.revenueChart[0]?.date;
	const end = data.revenueChart[data.revenueChart.length - 1]?.date;
	const range = useBookingsBetween(shop.id, start, end);

	// bookings completed, day by day
	const done = useMemo(() => {
		if (!range.data) return null;
		const perDay = new Map<string, number>();
		for (const booking of range.data.bookings) if (toBookingStatus(booking.status) === 'completed') perDay.set(booking.booking_date, (perDay.get(booking.booking_date) ?? 0) + 1);
		return perDay;
	}, [range.data]);

	return (
		<>
			<Revenue key={`${start}:${end}`} data={data} done={done} />
			<section aria-labelledby="dash-status" className={range.isPlaceholderData ? 'is-refreshing' : undefined}>
				<div className="sec-head">
					<h3 id="dash-status">{t('overview.statuses')}</h3>
					{range.data && (
						<p className="num">
							{t('home.byBarber')} · {t('overview.bookingsCount', { count: range.data.bookings.length })}
						</p>
					)}
				</div>
				{range.error && !range.data ? (
					<Failure error={range.error} onRetry={() => void range.refetch()} />
				) : !range.data ? (
					<Loading />
				) : range.data.bookings.length === 0 ? (
					<p className="muted">{t('overview.noData')}</p>
				) : (
					<Lapses bookings={range.data.bookings} complete={range.data.complete} />
				)}
			</section>
		</>
	);
}

/** Revenue a week at a time, every day numbered. A longer period is read week by week. */
function Revenue({ data, done }: { data: DashboardData; done: Map<string, number> | null }) {
	const [table, setTable] = useState(false);
	// how many weeks back from the end of the period
	const [back, setBack] = useState(0);
	const weeks = useMemo(() => {
		const out: Point[][] = [];
		for (let end = data.revenueChart.length; end > 0; end -= 7) out.push(data.revenueChart.slice(Math.max(0, end - 7), end));
		return out;
	}, [data.revenueChart]);

	const week = weeks[back] ?? [];
	const before = weeks[back + 1];
	const total = sum(week);
	const open = week.filter((point) => point.value > 0);
	const average = open.length ? total / open.length : 0;
	const best = open.reduce<Point | null>((top, point) => (!top || point.value > top.value ? point : top), null);
	// against the same number of days just before: counted here when the period holds them, else the API's own trend
	const change = before && before.length === week.length && sum(before) > 0 ? ((total - sum(before)) / sum(before)) * 100 : weeks.length === 1 ? data.stats.revenueTrend : null;
	const first = week[0];
	const last = week[week.length - 1];

	return (
		<section aria-labelledby="dash-revenue">
			<div className="sec-head">
				<h3 id="dash-revenue">{t('overview.perDay')}</h3>
				{first && last && (
					<div className="rev-nav">
						{weeks.length > 1 && (
							<button type="button" aria-label={t('home.olderDays')} disabled={back >= weeks.length - 1} onClick={() => setBack((value) => value + 1)}>
								<ChevronLeft aria-hidden="true" />
							</button>
						)}
						<span className="num" aria-live="polite">
							{first.date === last.date ? dateShort(first.date) : `${dateShort(first.date)} – ${dateShort(last.date)}`}
						</span>
						{weeks.length > 1 && (
							<button type="button" aria-label={t('home.newerDays')} disabled={back === 0} onClick={() => setBack((value) => value - 1)}>
								<ChevronRight aria-hidden="true" />
							</button>
						)}
					</div>
				)}
			</div>

			{total === 0 ? (
				<p className="muted">{t('overview.noRevenue')}</p>
			) : (
				<>
					<p className="rev-facts">
						<span>
							<b className="num">{mad(total)}</b> {t('home.overDays', { count: week.length })}
						</span>
						{change !== null && (
							<span>
								<b className={`num${change > 0 ? ' up' : change < 0 ? ' down' : ''}`}>{signedPct(change)}</b> {t('home.vsDaysBefore', { count: week.length })}
							</span>
						)}
						<span className="num">{t('home.averagePerDay', { amount: mad(Math.round(average)) })}</span>
						{best && open.length > 1 && <span className="num">{t('home.bestDay', { day: dateFull(best.date), amount: mad(best.value) })}</span>}
					</p>
					{table ? <RevenueTable points={week} /> : <DayBars points={week.map((point) => ({ ...point, count: done ? (done.get(point.date) ?? 0) : undefined }))} average={average} />}
					<p className="rev-note">
						<button type="button" className="text-btn" aria-pressed={table} onClick={() => setTable((shown) => !shown)}>
							{t(table ? 'home.showChart' : 'home.showTable')}
						</button>
					</p>
				</>
			)}
		</section>
	);
}

interface Row {
	id: number;
	name: string;
	picture: string | null;
	bookings: number;
	counts: Record<Lapse, number>;
}
const noLapse = (): Record<Lapse, number> => ({ expired: 0, late_start: 0, overrun: 0 });
const lapsesIn = (row: Row) => LAPSES.reduce((total, lapse) => total + row.counts[lapse], 0);

/** Every barber of the team, even with nothing to report, then anyone else the bookings name. */
function rowsOf(bookings: Booking[], staff: StaffMember[]): Row[] {
	const rows = new Map<number, Row>();
	for (const member of staff) {
		if (member.staff_type === 'barber') rows.set(member.user.id, { id: member.user.id, name: personName(member.user), picture: member.user.profile_picture ?? null, bookings: 0, counts: noLapse() });
	}
	const now = Date.now();
	for (const booking of bookings) {
		if (!booking.barber) continue;
		let row = rows.get(booking.barber.id);
		if (!row) rows.set(booking.barber.id, (row = { id: booking.barber.id, name: booking.barber.full_name || booking.barber.username, picture: booking.barber.profile_picture ?? null, bookings: 0, counts: noLapse() }));
		row.bookings += 1;
		for (const lapse of lapsesOf(booking, now)) row.counts[lapse] += 1;
	}
	// the most to look at first
	return [...rows.values()].sort((a, b) => lapsesIn(b) - lapsesIn(a) || b.bookings - a.bookings || a.name.localeCompare(b.name));
}

/**
 * Per barber: requests left to expire, services started late, services that
 * ran over. Each count has a bar, the longest going to whoever has the most,
 * and its share of that barber's bookings.
 */
function Lapses({ bookings, complete }: { bookings: Booking[]; complete: boolean }) {
	const shop = useCurrentShop();
	const { data: staff } = useStaff(shop.id);
	const rows = useMemo(() => rowsOf(bookings, staff ?? []), [bookings, staff]);
	const most = (lapse: Lapse) => Math.max(1, ...rows.map((row) => row.counts[lapse]));
	const all = (lapse: Lapse) => rows.reduce((total, row) => total + row.counts[lapse], 0);
	const assigned = rows.reduce((total, row) => total + row.bookings, 0);

	return (
		<>
			<table className="lapses">
				<caption className="sr-only">{t('home.lapsesCaption')}</caption>
				<thead>
					<tr>
						<th scope="col">{t('home.barber')}</th>
						{LAPSES.map((lapse) => (
							<th key={lapse} scope="col">
								<i style={{ background: LAPSE_COLOR[lapse] }} aria-hidden="true" />
								{t(`home.lapse.${lapse}`)}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{rows.map((row) => (
						<tr key={row.id}>
							<th scope="row">
								<Link to={`/barbiers/${row.id}`} className="lapses-who">
									<Avatar name={row.name} src={mediaUrl(row.picture)} size={36} />
									<span>
										<b>{row.name}</b>
										<small className="num">{t('overview.bookingsCount', { count: row.bookings })}</small>
									</span>
								</Link>
							</th>
							{LAPSES.map((lapse) => (
								<td key={lapse} data-label={t(`home.lapse.${lapse}`)}>
									<b className={`num${row.counts[lapse] ? '' : ' is-none'}`}>{int(row.counts[lapse])}</b>
									<span className="lapses-bar" aria-hidden="true">
										<span style={{ width: `${(row.counts[lapse] / most(lapse)) * 100}%`, background: LAPSE_COLOR[lapse] }} />
									</span>
									<small className="num">{row.counts[lapse] && row.bookings ? pct((row.counts[lapse] / row.bookings) * 100) : ' '}</small>
								</td>
							))}
						</tr>
					))}
				</tbody>
				<tfoot>
					<tr>
						<th scope="row">
							<span className="lapses-who">
								<span>
									<b>{t('home.wholeSalon')}</b>
									<small className="num">{t('overview.bookingsCount', { count: assigned })}</small>
								</span>
							</span>
						</th>
						{LAPSES.map((lapse) => (
							<td key={lapse} data-label={t(`home.lapse.${lapse}`)}>
								<b className={`num${all(lapse) ? '' : ' is-none'}`}>{int(all(lapse))}</b>
								<small className="num">{all(lapse) && assigned ? pct((all(lapse) / assigned) * 100) : ' '}</small>
							</td>
						))}
					</tr>
				</tfoot>
			</table>

			<dl className="lapses-key">
				{LAPSES.map((lapse) => (
					<div key={lapse}>
						<dt>
							<i style={{ background: LAPSE_COLOR[lapse] }} aria-hidden="true" />
							{t(`home.lapse.${lapse}`)}
						</dt>
						<dd>{t(`home.lapseHint.${lapse}`, { minutes: GRACE_MINUTES })}</dd>
					</div>
				))}
			</dl>
			<p className="lapses-note">
				{t('home.lapsesNote')}
				{!complete && ` ${t('home.partial', { count: bookings.length })}`}
			</p>
		</>
	);
}
