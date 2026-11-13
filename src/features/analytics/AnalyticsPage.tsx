import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { isComplete, type PeriodQuery } from '@/api/dashboard';
import { request } from '@/api/http';
import { useCurrentShop } from '@/app/shop-context';
import { t, tMaybe } from '@/i18n';
import { int, mad, pct, score, signedPct } from '@/lib/format';
import { Failure, Loading } from '@/ui/controls';
import { PageHeader } from '@/ui/PageHeader';
import { PeriodFilter } from '@/ui/PeriodFilter';
import './Analytics.css';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** One analytics endpoint over the chosen period. They all answer { data }. */
function useAnalytics<T>(shop: number, path: string, period: PeriodQuery) {
	return useQuery({
		queryKey: ['analytics', shop, path, period],
		queryFn: async ({ signal }) => (await request<{ data: T }>(`/api/auth/${path.replace(':shop', String(shop))}`, { query: { ...period }, signal })).data,
		placeholderData: keepPreviousData,
		enabled: isComplete(period)
	});
}

export function AnalyticsPage() {
	const shop = useCurrentShop();
	const [period, setPeriod] = useState<PeriodQuery>({ period: 'last_30_days' });
	const revenue = useAnalytics<{ total_revenue: number; revenue_growth_rate: number; average_booking_value: number; abv_trend: number }>(shop.id, 'dashboard-analytics-revenue/shop/:shop/analytics/revenue/overview/', period);
	const clients = useAnalytics<{ total_unique_clients: number; new_clients: number; client_retention_rate: number }>(shop.id, 'dashboard-analytics-client/shop/:shop/analytics/clients/overview/', period);
	const growth = useAnalytics<{ revenue_growth_rate: number; booking_growth_rate: number; client_growth_rate: number; new_client_acquisition_rate: number }>(shop.id, 'dashboard-analytics-growth/shop/:shop/analytics/growth/indicators/', period);
	const days = useAnalytics<{ revenue_by_day_of_week: { day: string; revenue: number }[] }>(shop.id, 'dashboard-analytics-time/shop/:shop/analytics/time/daily-patterns/', period);
	const hours = useAnalytics<{ revenue_by_hour: { hour: string; revenue: number }[] }>(shop.id, 'dashboard-analytics-time/shop/:shop/analytics/time/hourly-patterns/', period);
	const ratings = useAnalytics<{ shop_rating: number; total_reviews_count: number; rating_distribution: Record<string, number> }>(shop.id, 'dashboard-analytics-review/shop/:shop/analytics/reviews/shop-ratings/', period);
	const services = useAnalytics<{ service_performance: { service_id: number; service_title: string; booking_count: number }[] }>(shop.id, 'dashboard-analytics-service/shop/:shop/analytics/services/performance/', period);

	const failed = revenue.error ?? clients.error;
	const refetching = revenue.isFetching || days.isFetching;

	return (
		<>
			<PageHeader title={t('nav.analytics')} actions={<PeriodFilter value={period} onChange={setPeriod} />} />

			{failed && !revenue.data ? (
				<Failure error={failed} onRetry={() => void revenue.refetch()} />
			) : !revenue.data || !clients.data ? (
				<Loading />
			) : (
				<div className={`stats${refetching ? ' is-refreshing' : ''}`}>
					<dl className="figures">
						<div>
							<dt>{t('analytics.revenue.totalRevenue')}</dt>
							<dd>{mad(revenue.data.total_revenue)}</dd>
							<dd className="figure-note">
								<b className={revenue.data.revenue_growth_rate > 0 ? 'up' : revenue.data.revenue_growth_rate < 0 ? 'down' : undefined}>{signedPct(revenue.data.revenue_growth_rate)}</b> {t('period.vsPrevious')}
							</dd>
						</div>
						<div>
							<dt>{t('analytics.revenue.averageBookingValue')}</dt>
							<dd>{mad(Math.round(revenue.data.average_booking_value))}</dd>
							<dd className="figure-note">
								<b className={revenue.data.abv_trend > 0 ? 'up' : revenue.data.abv_trend < 0 ? 'down' : undefined}>{signedPct(revenue.data.abv_trend)}</b> {t('period.vsPrevious')}
							</dd>
						</div>
						<div>
							<dt>{t('analytics.client.totalUniqueClients')}</dt>
							<dd>{int(clients.data.total_unique_clients)}</dd>
							<dd className="figure-note">
								{t('analytics.client.clientRetentionRate')} : {pct(clients.data.client_retention_rate, 0)}
							</dd>
						</div>
						<div>
							<dt>{t('analytics.review.shopRating')}</dt>
							<dd>{ratings.data ? score(ratings.data.shop_rating) : '—'}</dd>
							{ratings.data && (
								<dd className="figure-note">
									{t('analytics.review.totalReviews')} : {int(ratings.data.total_reviews_count)}
								</dd>
							)}
						</div>
					</dl>

					<div className="split">
						<Bars title={t('analytics.time.revenueByDayOfWeek')} rows={(days.data?.revenue_by_day_of_week ?? []).map((row) => ({ label: tMaybe(`weekdays.${DAYS.indexOf(row.day)}`, row.day), value: row.revenue, text: mad(row.revenue) }))} />
						<Bars title={t('analytics.time.revenueByHour')} rows={(hours.data?.revenue_by_hour ?? []).map((row) => ({ label: row.hour, value: row.revenue, text: mad(row.revenue) }))} />
					</div>

					<div className="split">
						<Bars
							title={t('analytics.service.mostPopularServices')}
							rows={(services.data?.service_performance ?? []).slice(0, 8).map((row) => ({ label: row.service_title, value: row.booking_count, text: t('overview.bookingsCount', { count: row.booking_count }) }))}
						/>
						<div className="stats-col">
							<section aria-labelledby="stats-growth">
								<div className="sec-head">
									<h2 id="stats-growth">{t('analytics.growth.indicators')}</h2>
								</div>
								{growth.data && (
									<dl className="kpis">
										{(
											[
												['analytics.growth.revenueGrowthRate', growth.data.revenue_growth_rate],
												['analytics.growth.bookingGrowthRate', growth.data.booking_growth_rate],
												['analytics.growth.clientGrowthRate', growth.data.client_growth_rate],
												['analytics.growth.newClientAcquisitionRate', growth.data.new_client_acquisition_rate]
											] as const
										).map(([label, value]) => (
											<div key={label}>
												<dt>{t(label)}</dt>
												<dd className={`num ${value > 0 ? 'is-up' : value < 0 ? 'is-down' : ''}`}>{signedPct(value)}</dd>
											</div>
										))}
									</dl>
								)}
							</section>
							{ratings.data && (
								<Bars
									title={t('analytics.review.ratingDistribution')}
									rows={[5, 4, 3, 2, 1].map((stars) => ({ label: `${stars} / 5`, value: ratings.data.rating_distribution[String(stars)] ?? 0, text: int(ratings.data.rating_distribution[String(stars)] ?? 0) }))}
								/>
							)}
						</div>
					</div>
				</div>
			)}
		</>
	);
}

/** A ranked list with a bar for each value: readable without hovering. */
function Bars({ title, rows }: { title: string; rows: { label: string; value: number; text: string }[] }) {
	const max = Math.max(1, ...rows.map((row) => row.value));
	return (
		<section>
			<div className="sec-head">
				<h2>{title}</h2>
			</div>
			{rows.length === 0 ? (
				<p className="muted">{t('overview.noData')}</p>
			) : (
				<ul className="bars">
					{rows.map((row) => (
						<li key={row.label}>
							<span className="bars-label">{row.label}</span>
							<span className="bars-track" aria-hidden>
								<span style={{ width: `${(row.value / max) * 100}%` }} />
							</span>
							<b className="num">{row.text}</b>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}
