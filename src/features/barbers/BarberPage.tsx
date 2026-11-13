import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { ChevronLeft } from 'lucide-react';
import { useBarberAnalytics, type BarberAnalytics } from '@/api/barbers';
import { useBookingHistory } from '@/api/bookings';
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
					<Reliability shopId={shop.id} barberId={barberId} name={name.split(' ')[0] || name} period={RANGES[range]} data={data} />

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
							<Money data={data} />
						</section>
					</div>

					<div className="split">
						<section aria-labelledby="barber-services">
							<div className="sec-head">
								<h2 id="barber-services">{t('barberDetail.topServices')}</h2>
							</div>
							{data.service_analytics.top_services.length ? (
								<Bars rows={data.service_analytics.top_services.map((service) => ({ label: service.service_title, value: Number(service.revenue ?? service.count ?? 0), text: service.revenue ? mad(service.revenue) : int(service.count) })).sort((a, b) => b.value - a.value).slice(0, 5)} />
							) : (
								<p className="muted">{t('barberDetail.noData')}</p>
							)}
						</section>
						<section aria-labelledby="barber-busy">
							<div className="sec-head">
								<h2 id="barber-busy">{t('barberDetail.busiestDays')}</h2>
							</div>
							{data.time_analytics?.peak_days.length ? (
								<Week days={data.time_analytics.peak_days} hours={data.time_analytics.peak_hours} />
							) : (
								<p className="muted">{t('barberDetail.noData')}</p>
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

type Period = { start_date: string; end_date: string } | undefined;

/** How many bookings of this barber match one history filter. */
function useCount(shopId: number, barberId: number, period: Period, filter: { status?: string; cancelled_by?: string }) {
	const { data } = useBookingHistory(shopId, { ...period, ...filter, barber_id: barberId, page: 1, page_size: 1 });
	return data?.count ?? 0;
}

/**
 * What an owner wants to know about a barber besides money, said in words:
 * does he answer his requests, and who cancels his bookings.
 */
function Reliability({ shopId, barberId, name, period, data }: { shopId: number; barberId: number; name: string; period: Period; data: BarberAnalytics }) {
	const expired = useCount(shopId, barberId, period, { status: 'expired' });
	const byBarber = useCount(shopId, barberId, period, { cancelled_by: 'barber' });
	const byClient = useCount(shopId, barberId, period, { cancelled_by: 'client' });
	const received = data.total_bookings + expired;
	const missedRate = received ? (expired / received) * 100 : 0;
	const tone = missedRate >= 10 ? 'bad' : missedRate >= 4 ? 'warn' : 'good';
	const cancelled = Math.max(data.cancelled_bookings, byBarber + byClient);
	const other = cancelled - byBarber - byClient;
	const share = (n: number) => (cancelled ? (n / cancelled) * 100 : 0);
	const verdict = { good: `${name} répond presque toujours à ses demandes.`, warn: `${name} laisse passer quelques demandes.`, bad: `${name} laisse passer trop de demandes.` }[tone];
	const rows: [string, number, string][] = [
		[`Par ${name}`, byBarber, 'barber'],
		['Par ses clients', byClient, 'client']
	];
	if (other > 0) rows.push(['Par le salon ou BarberChat', other, 'other']);

	return (
		<div className="split">
			<section aria-labelledby="barber-missed" className="story">
				<div className="sec-head">
					<h2 id="barber-missed">Demandes sans réponse</h2>
				</div>
				<p className={`story-big story-big--${tone}`}>
					<b className="num">{pct(missedRate, 1)}</b>
					<span>des demandes reçues ont expiré</span>
				</p>
				<div className="story-meter" aria-hidden>
					<i className={`is-${tone}`} style={{ width: `${Math.min(100, missedRate)}%` }} />
				</div>
				<p className="story-text">
					{verdict} Sur <b className="num">{int(received)}</b> demandes reçues, <b className="num">{int(expired)}</b> ont expiré sans qu’il accepte, refuse ou propose un autre créneau.
				</p>
			</section>

			<section aria-labelledby="barber-cancel" className="story">
				<div className="sec-head">
					<h2 id="barber-cancel">Qui annule ?</h2>
				</div>
				{cancelled ? (
					<>
						<p className="story-text">
							<b className="num">{int(cancelled)}</b> réservations annulées sur <b className="num">{int(data.total_bookings)}</b>.
						</p>
						<ul className="story-bars">
							{rows.map(([label, n, key]) => (
								<li key={key}>
									<span className="story-bar-label">{label}</span>
									<span className="story-bar-value num">
										{int(n)} <small>{pct(share(n), 0)}</small>
									</span>
									<span className="story-bar-track" aria-hidden>
										<i className={`is-${key}`} style={{ width: `${share(n)}%` }} />
									</span>
								</li>
							))}
						</ul>
						{byBarber > byClient && <p className="story-text story-text--warn">{name} annule plus souvent que ses clients.</p>}
					</>
				) : (
					<p className="muted">Aucune réservation annulée sur la période.</p>
				)}
			</section>
		</div>
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

/** The money, said as an owner would: what he brings, per visit, per hour, and what promos cost. */
function Money({ data }: { data: BarberAnalytics }) {
	const r = data.revenue_breakdown;
	const gross = Number(r.total_revenue_without_promos);
	const promo = Math.max(0, gross - Number(r.total_revenue));
	return (
		<div className="story">
			<div className="tiles-2">
				<div className="mini">
					<span>Par visite</span>
					<b className="num">{mad(r.average_revenue_per_booking)}</b>
				</div>
				<div className="mini">
					<span>Par heure de travail</span>
					<b className="num">{mad(r.average_revenue_per_hour)}</b>
				</div>
			</div>
			<p className="story-text">
				Ses clients reviennent en moyenne <b className="num">{decimal(data.client_analytics.average_bookings_per_client)}</b> fois.{' '}
				{promo > 0 ? (
					<>
						Les promotions ont coûté <b className="num">{mad(promo)}</b>, soit <b className="num">{pct(gross ? (promo / gross) * 100 : 0, 1)}</b> de ce qu’il aurait encaissé sans elles.
					</>
				) : (
					'Aucune promotion n’a réduit ses prix.'
				)}
			</p>
		</div>
	);
}

/** A ranked list as bars, the first one full. */
function Bars({ rows }: { rows: { label: string; value: number; text: string }[] }) {
	const top = Math.max(1, ...rows.map((row) => row.value));
	return (
		<ul className="story-bars">
			{rows.map((row) => (
				<li key={row.label}>
					<span className="story-bar-label">{row.label}</span>
					<span className="story-bar-value num">{row.text}</span>
					<span className="story-bar-track" aria-hidden>
						<i className="is-ink" style={{ width: `${(row.value / top) * 100}%` }} />
					</span>
				</li>
			))}
		</ul>
	);
}

/** The week as seven columns, the busiest one dark, and the hours to staff. */
function Week({ days, hours }: { days: { day?: number; count: number }[]; hours: { hour?: number; count: number }[] }) {
	const counts = [0, 1, 2, 3, 4, 5, 6].map((d) => days.find((row) => row.day === d)?.count ?? 0);
	const top = Math.max(1, ...counts);
	const best = counts.indexOf(top);
	const peak = hours.slice(0, 3).map((row) => `${String(row.hour).padStart(2, '0')} h`);
	return (
		<div className="story">
			<div className="week" role="img" aria-label={counts.map((c, d) => `${tMaybe(`weekdays.${d}`, '')} ${c}`).join(', ')}>
				{counts.map((count, d) => (
					<div key={d} className={`week-day${d === best ? ' is-top' : ''}`}>
						<span className="week-count num">{count}</span>
						<span className="week-bar">
							<i style={{ height: `${(count / top) * 100}%` }} />
						</span>
						<span className="week-name">{tMaybe(`weekdays.${d}`, '').slice(0, 3)}</span>
					</div>
				))}
			</div>
			<p className="story-text">
				Son jour le plus chargé est le <b>{tMaybe(`weekdays.${best}`, '').toLowerCase()}</b>
				{peak.length > 0 && (
					<>
						, surtout vers <b className="num">{peak.join(', ')}</b>
					</>
				)}
				.
			</p>
		</div>
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
