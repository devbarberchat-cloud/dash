import { useState } from 'react';
import { Link } from 'react-router';
import { useDashboard, type PeriodQuery } from '@/api/dashboard';
import { useShop } from '@/api/shops';
import { useCurrentShop } from '@/app/shop-context';
import { t } from '@/i18n';
import { capitalize, dateFull } from '@/lib/format';
import { Failure, Loading } from '@/ui/controls';
import { PageHeader } from '@/ui/PageHeader';
import { PeriodFilter } from '@/ui/PeriodFilter';
import { Kpis } from './Kpis';
import { LiveRequests, PresenceStrip } from './Live';
import './Dashboard.css';

/**
 * The salon's home. First what waits for an answer, with who is in the salon
 * kept small at the top; the figures come last, and the period is chosen there.
 */
export function DashboardPage() {
	const shop = useCurrentShop();
	const { data: details } = useShop(shop.id);
	const [period, setPeriod] = useState<PeriodQuery>({ period: 'last_7_days' });
	const { data, isPending, isFetching, error, refetch } = useDashboard(shop.id, period);
	const place = details ? [details.neighborhood, details.city].filter(Boolean).join(', ') : undefined;
	const overdue = data ? data.alerts.overduePayments > 0 : false;
	const waiting = data ? !overdue && data.alerts.pendingPayments > 0 : false;

	return (
		<>
			<PageHeader kicker={capitalize(dateFull(new Date()))} title={shop.name} place={place} actions={<PresenceStrip />} />

			<div className="dash">
				{data && (overdue || waiting) && (
					<p className={`notice ${overdue ? 'notice--bad' : 'notice--warn'}`} role={overdue ? 'alert' : 'status'}>
						{overdue ? t('overview.overdue', { count: data.alerts.overduePayments }) : t('overview.pending', { count: data.alerts.pendingPayments })}{' '}
						<Link to="/paiements" className="text-btn">
							{t('overview.viewPayments')}
						</Link>
					</p>
				)}

				<LiveRequests />

				<section className="kpi" aria-labelledby="dash-kpi">
					<div className="kpi-head">
						<h2 id="dash-kpi">{t('home.kpis')}</h2>
						<PeriodFilter size="sm" value={period} onChange={setPeriod} />
					</div>
					{error && !data ? (
						<Failure error={error} onRetry={() => void refetch()} />
					) : isPending || !data ? (
						<Loading />
					) : (
						<div className={`kpi-body${isFetching ? ' is-refreshing' : ''}`} aria-busy={isFetching}>
							<Kpis data={data} />
						</div>
					)}
				</section>
			</div>
		</>
	);
}
