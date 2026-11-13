import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { ChevronLeft } from 'lucide-react';
import { useBarberAnalytics, type BarberAnalytics } from '@/api/barbers';
import { mediaUrl } from '@/api/http';
import { useStaff } from '@/api/shops';
import { useCurrentShop } from '@/app/shop-context';
import { StatusBar } from '@/charts/StatusBar';
import { t, tMaybe } from '@/i18n';
import { statusParts } from '@/lib/booking-status';
import { date, daysAgo, decimal, int, mad, minutes, pct, personName, today } from '@/lib/format';
import { BarberScore } from '@/ui/BarberScore';
import { ChipGroup, Failure, Loading } from '@/ui/controls';
import { PageHeader } from '@/ui/PageHeader';
import { Portrait } from '@/ui/Portrait';
import './Barbers.css';

type Range = 'all' | '30' | '7';
const RANGES: Record<Range, { start_date: string; end_date: string } | undefined> = {
	all: undefined,
	get '30'() {
		return { start_date: daysAgo(29), end_date: today() };
	},
	get '7'() {
		return { start_date: daysAgo(6), end_date: today() };
	}
};

/** One barber: results, clients, schedule and score, over all time or a recent period. */
export function BarberPage() {
	const shop = useCurrentShop();
	const barberId = Number(useParams().barberId);
	const [range, setRange] = useState<Range>('all');
	const { data, isPending, isFetching, error, refetch } = useBarberAnalytics(shop.id, barberId, RANGES[range]);
	const { data: staff = [] } = useStaff(shop.id);
	const member = staff.find((person) => person.user.id === barberId);
	const name = member ? personName(member.user) : (data?.username ?? t('barbersPage.colBarber'));

	return (
		<>
			<Link to="/barbiers" className="back-link">
				<ChevronLeft aria-hidden />
				{t('barberDetail.back')}
			</Link>
			<div className="barber-head">
				<Portrait name={name} src={mediaUrl(member?.user.profile_picture)} size={76} />
				<PageHeader
					title={name}
					actions={
						<>
							<ChipGroup
								label={t('period.label')}
								value={range}
								onChange={setRange}
								options={[
									{ value: 'all', label: t('barberDetail.allTime') },
									{ value: '30', label: t('period.short.last_30_days') },
									{ value: '7', label: t('period.short.last_7_days') }
								]}
							/>
							<Link to={`/historique?coiffeur=${barberId}`} className="btn btn--outline btn--sm">
								{t('barberDetail.inHistory')}
							</Link>
						</>
					}
				/>
			</div>

			{error && !data ? (
				<Failure error={error} onRetry={() => void refetch()} />
			) : isPending || !data ? (
				<Loading />
			) : (
				<div className={`barber${isFetching ? ' is-refreshing' : ''}`}>
					<Figures data={data} />

					<div className="split">
						<section aria-labelledby="barber-status">
							<div className="sec-head">
								<h2 id="barber-status">{t('barberDetail.statuses')}</h2>
							</div>
							{data.total_bookings ? (
								<StatusBar
									label={t('barberDetail.statuses')}
									parts={statusParts(Object.entries(data.booking_statistics.status_distribution).map(([status, count]) => ({ status, count })))}
								/>
							) : (
								<p className="muted">{t('barberDetail.noData')}</p>
							)}
						</section>
						<section aria-labelledby="barber-money">
							<div className="sec-head">
								<h2 id="barber-money">{t('barberDetail.money')}</h2>
							</div>
							<Facts
								rows={[
									[t('barberDetail.withPromos'), mad(data.revenue_breakdown.total_revenue)],
									[t('barberDetail.withoutPromos'), mad(data.revenue_breakdown.total_revenue_without_promos)],
									[t('barberDetail.perBooking'), mad(data.revenue_breakdown.average_revenue_per_booking)],
									[t('barberDetail.perHour'), mad(data.revenue_breakdown.average_revenue_per_hour)],
									[t('barberDetail.bookingsPerClient'), decimal(data.client_analytics.average_bookings_per_client)]
								]}
							/>
						</section>
					</div>

					<div className="split">
						<section aria-labelledby="barber-services">
							<div className="sec-head">
								<h2 id="barber-services">{t('barberDetail.topServices')}</h2>
							</div>
							{data.service_analytics.top_services.length ? (
								<Facts rows={data.service_analytics.top_services.map((service) => [service.service_title, service.revenue ? mad(service.revenue) : int(service.count)])} />
							) : (
								<p className="muted">{t('barberDetail.noData')}</p>
							)}
						</section>
						<section aria-labelledby="barber-busy">
							<div className="sec-head">
								<h2 id="barber-busy">{t('barberDetail.busiestDays')}</h2>
							</div>
							{data.time_analytics?.peak_days.length ? (
								<Facts rows={data.time_analytics.peak_days.slice(0, 4).map((row) => [tMaybe(`weekdays.${row.day}`, '—'), t('overview.bookingsCount', { count: row.count })])} />
							) : (
								<p className="muted">{t('barberDetail.noData')}</p>
							)}
							{Boolean(data.time_analytics?.peak_hours.length) && (
								<p className="muted barber-hours">
									{t('barberDetail.busiestHours')} : {data.time_analytics?.peak_hours.slice(0, 3).map((row) => `${String(row.hour).padStart(2, '0')}:00`).join(', ')}
								</p>
							)}
						</section>
					</div>

					<div className="split">
						<Schedule schedule={data.barber_schedule?.weekly_schedule} />
						<ScoreHistory history={data.barber_score_history ?? []} />
					</div>
				</div>
			)}
		</>
	);
}

function Figures({ data }: { data: BarberAnalytics }) {
	return (
		<dl className="figures figures--3">
			<div>
				<dt>{t('barberDetail.revenue')}</dt>
				<dd>{mad(data.total_revenue)}</dd>
			</div>
			<div>
				<dt>{t('barberDetail.completed')}</dt>
				<dd>{int(data.completed_bookings)}</dd>
				<dd className="figure-note">
					{t('barberDetail.ofTotal', { total: int(data.total_bookings) })} · {pct(data.completion_rate, 0)}
				</dd>
			</div>
			<div>
				<dt>{t('barberDetail.clients')}</dt>
				<dd>{int(data.client_analytics.total_unique_clients)}</dd>
				<dd className="figure-note">{t('barberDetail.repeatRate', { rate: pct(data.client_analytics.repeat_client_rate, 0) })}</dd>
			</div>
			<div>
				<dt>{t('barberDetail.score')}</dt>
				<dd>
					<BarberScore value={data.barber_score} />
				</dd>
				<dd className="figure-note">{t('barberDetail.scoreNote')}</dd>
			</div>
			<div>
				<dt>{t('barberDetail.serviceTime')}</dt>
				<dd>{minutes(data.average_service_time)}</dd>
			</div>
			<div>
				<dt>{t('barbersPage.colLast')}</dt>
				<dd>{date(data.last_booking_date)}</dd>
			</div>
		</dl>
	);
}

/** Name on the left, value on the right, one line each. */
function Facts({ rows }: { rows: [string, string][] }) {
	return (
		<dl className="pairs">
			{rows.map(([name, value]) => (
				<div key={name}>
					<dt>{name}</dt>
					<dd className="num">{value}</dd>
				</div>
			))}
		</dl>
	);
}

function Schedule({ schedule }: { schedule?: Record<string, { start: string; end: string; breaks?: { start: string; end: string }[] } | null> }) {
	return (
		<section aria-labelledby="barber-schedule">
			<div className="sec-head">
				<h2 id="barber-schedule">{t('barberDetail.schedule')}</h2>
			</div>
			{schedule ? (
				<dl className="pairs">
					{[0, 1, 2, 3, 4, 5, 6].map((day) => {
						const hours = schedule[String(day)];
						return (
							<div key={day}>
								<dt>{tMaybe(`weekdays.${day}`, String(day))}</dt>
								<dd className="num">
									{hours ? `${hours.start} – ${hours.end}` : t('barberDetail.off')}
									{hours?.breaks?.map((pause) => (
										<small key={pause.start}>{t('barberDetail.breaks', { range: `${pause.start} – ${pause.end}` })}</small>
									))}
								</dd>
							</div>
						);
					})}
				</dl>
			) : (
				<p className="muted">{t('barberDetail.noSchedule')}</p>
			)}
		</section>
	);
}

function ScoreHistory({ history }: { history: NonNullable<BarberAnalytics['barber_score_history']> }) {
	return (
		<section aria-labelledby="barber-score">
			<div className="sec-head">
				<h2 id="barber-score">{t('barberDetail.scoreHistory')}</h2>
			</div>
			{history.length ? (
				<dl className="pairs">
					{history.slice(0, 8).map((change) => (
						<div key={change.id}>
							<dt>
								{change.action_name}
								<small className="num">{date(change.created_at)}</small>
							</dt>
							<dd>
								<BarberScore value={change.points_awarded} signed />
							</dd>
						</div>
					))}
				</dl>
			) : (
				<p className="muted">{t('barberDetail.noData')}</p>
			)}
		</section>
	);
}
