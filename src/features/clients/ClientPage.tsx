import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { ChevronLeft } from 'lucide-react';
import { useClientBookings } from '@/api/clients';
import { useCurrentShop } from '@/app/shop-context';
import { t, tMaybe } from '@/i18n';
import { BOOKING_STATUSES, statusLabel } from '@/lib/booking-status';
import { capitalize, int, mad, pct, time, weekdayDate } from '@/lib/format';
import { Failure, Loading } from '@/ui/controls';
import { Input, Select } from '@/ui/Field';
import { Pager, StatusBadge } from '@/ui/lists';
import { PageHeader } from '@/ui/PageHeader';
import './Clients.css';

/** One client: what they brought in, how they book, and every booking. */
export function ClientPage() {
	const shop = useCurrentShop();
	const clientId = Number(useParams().clientId);
	const [params] = useSearchParams();
	const name = params.get('nom') || t('clientsPage.colClient');
	const [status, setStatus] = useState('');
	const [from, setFrom] = useState('');
	const [to, setTo] = useState('');
	const [page, setPage] = useState(1);
	const { data, isPending, isFetching, error, refetch } = useClientBookings(shop.id, clientId, { status, start_date: from, end_date: to, page, page_size: 20 });
	const filtered = Boolean(status || from || to);

	return (
		<>
			<Link to="/clients" className="back-link">
				<ChevronLeft aria-hidden />
				{t('clientDetail.back')}
			</Link>
			<PageHeader
				title={name}
				actions={
					<Link to={`/historique?client=${clientId}`} className="btn btn--outline btn--sm">
						{t('clientDetail.inHistory')}
					</Link>
				}
			/>

			{error && !data ? (
				<Failure error={error} onRetry={() => void refetch()} />
			) : isPending || !data ? (
				<Loading />
			) : (
				<>
					<dl className="figures">
						<div>
							<dt>{t('clientDetail.revenue')}</dt>
							<dd>{mad(data.total_revenue)}</dd>
							<dd className="figure-note">{t('clientDetail.revenueHint')}</dd>
						</div>
						<div>
							<dt>{t('clientDetail.bookings')}</dt>
							<dd>{int(data.count)}</dd>
						</div>
						<div>
							<dt>{t('clientDetail.withPromo')}</dt>
							<dd>{pct(data.bookings_with_promo_percentage, 0)}</dd>
						</div>
						<div>
							<dt>{t('clientDetail.preferredDay')}</dt>
							<dd>{data.preferred_day === null ? '—' : tMaybe(`weekdays.${data.preferred_day}`, '—')}</dd>
						</div>
					</dl>

					<section className="clients" aria-label={t('clientDetail.bookings')}>
						<div className="toolbar">
							<Select
								className="control--sm"
								aria-label={t('history.colStatus')}
								value={status}
								onChange={(event) => {
									setStatus(event.target.value);
									setPage(1);
								}}
							>
								<option value="">{t('history.allStatuses')}</option>
								{BOOKING_STATUSES.map((value) => (
									<option key={value} value={value}>
										{statusLabel(value)}
									</option>
								))}
							</Select>
							<Input
								className="control--sm"
								type="date"
								aria-label={t('live.dateFrom')}
								value={from}
								max={to || undefined}
								onChange={(event) => {
									setFrom(event.target.value);
									setPage(1);
								}}
							/>
							<Input
								className="control--sm"
								type="date"
								aria-label={t('live.dateTo')}
								value={to}
								min={from || undefined}
								onChange={(event) => {
									setTo(event.target.value);
									setPage(1);
								}}
							/>
						</div>

						{data.results.length === 0 ? (
							<p className="muted">{t(filtered ? 'clientDetail.noMatch' : 'clientDetail.empty')}</p>
						) : (
							<>
								<table className={`dtable${isFetching ? ' is-refreshing' : ''}`}>
									<thead>
										<tr>
											<th scope="col">{t('history.colBooking')}</th>
											<th scope="col">{t('history.colServices')}</th>
											<th scope="col">{t('history.colBarber')}</th>
											<th scope="col" className="end">
												{t('history.colPrice')}
											</th>
											<th scope="col">{t('history.colStatus')}</th>
										</tr>
									</thead>
									<tbody>
										{data.results.map((booking) => (
											<tr key={booking.id}>
												<td className="dtable-lead">
													<b className="num">
														{capitalize(weekdayDate(booking.booking_date))}, {time(booking.start_time)}
													</b>
												</td>
												<td data-label={t('history.colServices')}>
													<span>{booking.services.map((service) => service.title).join(', ')}</span>
												</td>
												<td data-label={t('history.colBarber')}>
													{booking.barber ? <Link to={`/barbiers/${booking.barber.id}`}>{booking.barber.username}</Link> : <span>—</span>}
												</td>
												<td data-label={t('history.colPrice')} className="end">
													<b className="num">{mad(booking.final_price)}</b>
												</td>
												<td data-label={t('history.colStatus')}>
													<StatusBadge status={booking.status} />
												</td>
											</tr>
										))}
									</tbody>
								</table>
								<Pager page={data.page} totalPages={data.total_pages} onPage={setPage} />
							</>
						)}
					</section>
				</>
			)}
		</>
	);
}
