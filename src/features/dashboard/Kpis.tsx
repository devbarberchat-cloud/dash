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
import { toBookingStatus } from '@/lib/booking-status';
import { dateShort, mad, pct, personName, signedPct } from '@/lib/format';
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
					<h3 id="dash-status">{t('home.leaderboard')}</h3>
				</div>
				{range.error && !range.data ? (
					<Failure error={range.error} onRetry={() => void range.refetch()} />
				) : !range.data ? (
					<Loading />
				) : range.data.bookings.length === 0 ? (
					<p className="muted">{t('overview.noData')}</p>
				) : (
					<Leaderboard bookings={range.data.bookings} />
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
					<p className="rev-total num">
						<b>{mad(total)}</b>
						{change !== null && (
							<span className={`rev-trend${change > 0 ? ' up' : change < 0 ? ' down' : ''}`}>{signedPct(change)}</span>
						)}
					</p>
					<p className="rev-sub num">
						{t('home.overDays', { count: week.length })} · {t('home.averagePerDay', { amount: mad(Math.round(average)) })}
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
	completed: number;
	revenue: number;
}

/** Per-barber totals over the period: completed services and the revenue they brought in. */
function rowsOf(bookings: Booking[], staff: StaffMember[]): Row[] {
	const rows = new Map<number, Row>();
	for (const member of staff) {
		if (member.staff_type === 'barber') rows.set(member.user.id, { id: member.user.id, name: personName(member.user), picture: member.user.profile_picture ?? null, completed: 0, revenue: 0 });
	}
	for (const booking of bookings) {
		if (!booking.barber || toBookingStatus(booking.status) !== 'completed') continue;
		let row = rows.get(booking.barber.id);
		if (!row) rows.set(booking.barber.id, (row = { id: booking.barber.id, name: booking.barber.full_name || booking.barber.username, picture: booking.barber.profile_picture ?? null, completed: 0, revenue: 0 }));
		row.completed += 1;
		row.revenue += Number(booking.final_price) || 0;
	}
	return [...rows.values()].sort((a, b) => b.revenue - a.revenue || b.completed - a.completed || a.name.localeCompare(b.name));
}

/** Barber leaderboard: completed services and revenue over the period, ranked, with a bar for revenue share. */
function Leaderboard({ bookings }: { bookings: Booking[] }) {
	const shop = useCurrentShop();
	const { data: staff } = useStaff(shop.id);
	const rows = useMemo(() => rowsOf(bookings, staff ?? []), [bookings, staff]);
	const topRevenue = Math.max(1, ...rows.map((row) => row.revenue));
	const totalRevenue = rows.reduce((total, row) => total + row.revenue, 0);
	const totalDone = rows.reduce((total, row) => total + row.completed, 0);

	return (
		<ol className="board">
			{rows.map((row, i) => (
				<li key={row.id} className="board-row">
					<span className="board-rank num" aria-hidden="true">{i + 1}</span>
					<Link to={`/barbiers/${row.id}`} className="board-who">
						<Avatar name={row.name} src={mediaUrl(row.picture)} size={36} />
						<span>
							<b>{row.name}</b>
							<small className="num">{t('home.servicesDone', { count: row.completed })}</small>
						</span>
					</Link>
					<span className="board-bar" aria-hidden="true">
						<span style={{ width: `${(row.revenue / topRevenue) * 100}%` }} />
					</span>
					<span className="board-amount num">
						<b>{mad(Math.round(row.revenue))}</b>
						<small>{totalRevenue ? pct((row.revenue / totalRevenue) * 100) : ' '}</small>
					</span>
				</li>
			))}
			<li className="board-row board-row--total">
				<span className="board-rank num" aria-hidden="true">∑</span>
				<span className="board-who">
					<span>
						<b>{t('home.wholeSalon')}</b>
						<small className="num">{t('home.servicesDone', { count: totalDone })}</small>
					</span>
				</span>
				<span className="board-bar" aria-hidden="true" />
				<span className="board-amount num">
					<b>{mad(Math.round(totalRevenue))}</b>
				</span>
			</li>
		</ol>
	);
}
