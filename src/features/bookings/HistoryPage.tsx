import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useBookingHistory, type Booking, type HistoryQuery } from '@/api/bookings';
import { useCurrentShop } from '@/app/shop-context';
import { t, tMaybe } from '@/i18n';
import { BOOKING_STATUSES, statusLabel } from '@/lib/booking-status';
import { capitalize, mad, time, weekdayDate } from '@/lib/format';
import { Failure, Loading } from '@/ui/controls';
import { Field, Input, Select } from '@/ui/Field';
import { Pager, SearchInput, StatusBadge, useDebounced } from '@/ui/lists';
import { PageHeader } from '@/ui/PageHeader';
import './Bookings.css';

type Filters = Pick<HistoryQuery, 'status' | 'start_date' | 'end_date' | 'min_price' | 'max_price' | 'has_promo' | 'cancelled_by' | 'ordering'>;
const NO_FILTERS: Filters = { status: '', start_date: '', end_date: '', min_price: '', max_price: '', has_promo: '', cancelled_by: '', ordering: '-booking_date' };
const CANCELLERS = [
	['client', 'history.byClient'],
	['barber', 'history.byBarber'],
	['system', 'history.bySystem'],
	['admin', 'history.byAdmin']
] as const;

/** Every booking of the salon, past and to come, with its filters. */
export function HistoryPage() {
	const shop = useCurrentShop();
	const [params, setParams] = useSearchParams();
	const [text, setText] = useState('');
	const [filters, setFilters] = useState<Filters>(NO_FILTERS);
	const [more, setMore] = useState(false);
	const [page, setPage] = useState(1);
	const search = useDebounced(text.trim());

	// a barber's or a client's page links here with its id
	const barberId = Number(params.get('coiffeur')) || undefined;
	const clientId = Number(params.get('client')) || undefined;

	const { data, isPending, isFetching, error, refetch } = useBookingHistory(shop.id, { ...filters, search, barber_id: barberId, client_id: clientId, page, page_size: 20 });

	const set = (patch: Partial<Filters>) => {
		setFilters((current) => ({ ...current, ...patch }));
		setPage(1);
	};
	const filtered = Boolean(search || barberId || clientId) || (Object.keys(NO_FILTERS) as (keyof Filters)[]).some((key) => key !== 'ordering' && filters[key]);
	const clear = () => {
		setText('');
		setFilters(NO_FILTERS);
		setPage(1);
		setParams({}, { replace: true });
	};

	return (
		<>
			<PageHeader kicker={shop.name} title={t('history.title')} />

			<div className="bookings">
				<div className="toolbar">
					<SearchInput
						value={text}
						onChange={(value) => {
							setText(value);
							setPage(1);
						}}
						label={t('history.search')}
					/>
					<Select className="control--sm" aria-label={t('history.colStatus')} value={filters.status} onChange={(event) => set({ status: event.target.value })}>
						<option value="">{t('history.allStatuses')}</option>
						{BOOKING_STATUSES.map((status) => (
							<option key={status} value={status}>
								{statusLabel(status)}
							</option>
						))}
					</Select>
					<Select className="control--sm" aria-label={t('history.sort')} value={filters.ordering} onChange={(event) => set({ ordering: event.target.value as Filters['ordering'] })}>
						<option value="-booking_date">{t('history.newest')}</option>
						<option value="booking_date">{t('history.oldest')}</option>
					</Select>
					<button type="button" className="text-btn" aria-expanded={more} onClick={() => setMore((shown) => !shown)}>
						{t('history.moreFilters')}
					</button>
					{filtered && (
						<button type="button" className="text-btn" onClick={clear}>
							{t('live.clearFilters')}
						</button>
					)}
				</div>

				{more && (
					<div className="history-more">
						<Field label={t('live.dateFrom')}>{({ id }) => <Input id={id} type="date" value={filters.start_date} max={filters.end_date || undefined} onChange={(event) => set({ start_date: event.target.value })} />}</Field>
						<Field label={t('live.dateTo')}>{({ id }) => <Input id={id} type="date" value={filters.end_date} min={filters.start_date || undefined} onChange={(event) => set({ end_date: event.target.value })} />}</Field>
						<Field label={t('history.minPrice')}>{({ id }) => <Input id={id} type="number" min={0} inputMode="numeric" value={filters.min_price} onChange={(event) => set({ min_price: event.target.value })} />}</Field>
						<Field label={t('history.maxPrice')}>{({ id }) => <Input id={id} type="number" min={0} inputMode="numeric" value={filters.max_price} onChange={(event) => set({ max_price: event.target.value })} />}</Field>
						<Field label={t('history.promo')}>
							{({ id }) => (
								<Select id={id} value={filters.has_promo} onChange={(event) => set({ has_promo: event.target.value as Filters['has_promo'] })}>
									<option value="">{t('history.anyPromo')}</option>
									<option value="true">{t('history.withPromo')}</option>
									<option value="false">{t('history.withoutPromo')}</option>
								</Select>
							)}
						</Field>
						<Field label={t('history.cancelledBy')}>
							{({ id }) => (
								<Select id={id} value={filters.cancelled_by} onChange={(event) => set({ cancelled_by: event.target.value })}>
									<option value="">{t('history.anyone')}</option>
									{CANCELLERS.map(([value, label]) => (
										<option key={value} value={value}>
											{t(label)}
										</option>
									))}
								</Select>
							)}
						</Field>
					</div>
				)}

				{(barberId || clientId) && <p className="notice">{t(barberId ? 'history.filteredByBarber' : 'history.filteredByClient')}</p>}

				{error && !data ? (
					<Failure error={error} onRetry={() => void refetch()} />
				) : isPending || !data ? (
					<Loading />
				) : data.results.length === 0 ? (
					<p className="muted bookings-none">{t(filtered ? 'history.noMatch' : 'history.empty')}</p>
				) : (
					<>
						<table className={`dtable${isFetching ? ' is-refreshing' : ''}`}>
							<thead>
								<tr>
									<th scope="col">{t('history.colBooking')}</th>
									<th scope="col">{t('history.colClient')}</th>
									<th scope="col">{t('history.colBarber')}</th>
									<th scope="col">{t('history.colServices')}</th>
									<th scope="col" className="end">
										{t('history.colPrice')}
									</th>
									<th scope="col">{t('history.colStatus')}</th>
								</tr>
							</thead>
							<tbody>
								{data.results.map((booking) => (
									<HistoryRow key={booking.id} booking={booking} />
								))}
							</tbody>
						</table>
						<Pager page={data.page} totalPages={data.total_pages} onPage={setPage} />
					</>
				)}
			</div>
		</>
	);
}

function HistoryRow({ booking }: { booking: Booking }) {
	const promo = booking.promos[0];
	const cancelledBy = booking.cancellation?.cancelled_by;
	return (
		<tr>
			<td className="dtable-lead">
				<b className="num">
					{capitalize(weekdayDate(booking.booking_date))}, {time(booking.start_time)}
				</b>			</td>
			<td data-label={t('history.colClient')}>
				{booking.client ? <Link to={`/clients/${booking.client.id}?nom=${encodeURIComponent(booking.client.full_name || booking.client.username)}`}>{booking.client.full_name || booking.client.username}</Link> : <span>{t('live.unknownClient')}</span>}
			</td>
			<td data-label={t('history.colBarber')}>
				{booking.barber ? <Link to={`/barbiers/${booking.barber.id}`}>{booking.barber.full_name}</Link> : <span>{t('live.noBarber')}</span>}
			</td>
			<td data-label={t('history.colServices')}>
				<span>
					{booking.services.map((service) => service.title).join(', ')}
					{promo && <small>{t('history.promoApplied', { name: promo.name })}</small>}
				</span>
			</td>
			<td data-label={t('history.colPrice')} className="end">
				<b className="num">{mad(booking.final_price)}</b>
			</td>
			<td data-label={t('history.colStatus')}>
				<span>
					<StatusBadge status={booking.status} />
					{cancelledBy && <small>{t('history.cancelledReason', { who: tMaybe(`history.by${capitalize(cancelledBy)}`, booking.cancellation?.cancelled_by_display ?? cancelledBy) })}</small>}
				</span>
			</td>
		</tr>
	);
}
