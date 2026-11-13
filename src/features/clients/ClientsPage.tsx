import { useState } from 'react';
import { Link } from 'react-router';
import { useClients, useSendPromotion, type Client } from '@/api/clients';
import { errorText, mediaUrl } from '@/api/http';
import { usePromos } from '@/api/promos';
import { useCurrentShop } from '@/app/shop-context';
import { t } from '@/i18n';
import { date, int, mad } from '@/lib/format';
import { Button } from '@/ui/Button';
import { Failure, Loading } from '@/ui/controls';
import { Dialog } from '@/ui/Dialog';
import { Field, Select } from '@/ui/Field';
import { Pager, SearchInput, useDebounced } from '@/ui/lists';
import { PageHeader } from '@/ui/PageHeader';
import { Avatar } from '@/ui/Portrait';
import { useToast } from '@/ui/Toast';
import './Clients.css';

export const clientLink = (client: { id: number; full_name?: string; username: string }) => `/clients/${client.id}?nom=${encodeURIComponent(client.full_name || client.username)}`;

export function ClientsPage() {
	const shop = useCurrentShop();
	const [text, setText] = useState('');
	const [page, setPage] = useState(1);
	const [picked, setPicked] = useState<Set<number>>(new Set());
	const [sending, setSending] = useState(false);
	const search = useDebounced(text.trim());
	const { data, isPending, isFetching, error, refetch } = useClients(shop.id, { search, page, page_size: 20 });

	const rows = data?.results ?? [];
	const allPicked = rows.length > 0 && rows.every((client) => picked.has(client.id));
	const toggle = (id: number) =>
		setPicked((current) => {
			const next = new Set(current);
			if (!next.delete(id)) next.add(id);
			return next;
		});
	const toggleAll = () =>
		setPicked((current) => {
			const next = new Set(current);
			for (const client of rows) allPicked ? next.delete(client.id) : next.add(client.id);
			return next;
		});

	return (
		<>
			<PageHeader kicker={shop.name} title={t('clientsPage.title')} />

			<div className="clients">
				<div className="toolbar">
					<SearchInput
						value={text}
						onChange={(value) => {
							setText(value);
							setPage(1);
						}}
						label={t('clientsPage.search')}
					/>
					{picked.size > 0 && (
						<div className="clients-picked" role="status">
							<span className="num">{t('clientsPage.selected', { count: picked.size })}</span>
							<button type="button" className="text-btn" onClick={() => setPicked(new Set())}>
								{t('clientsPage.clearSelection')}
							</button>
							<Button size="sm" dot={false} onClick={() => setSending(true)}>
								{t('clientsPage.sendPromotion')}
							</Button>
						</div>
					)}
				</div>

				{error && !data ? (
					<Failure error={error} onRetry={() => void refetch()} />
				) : isPending || !data ? (
					<Loading />
				) : rows.length === 0 ? (
					<p className="muted">{search ? t('clientsPage.noMatch', { term: search }) : t('clientsPage.empty')}</p>
				) : (
					<>
						<table className={`dtable${isFetching ? ' is-refreshing' : ''}`}>
							<thead>
								<tr>
									<th scope="col" className="clients-check">
										<input type="checkbox" checked={allPicked} onChange={toggleAll} aria-label={t('clientsPage.selectAll')} />
									</th>
									<th scope="col">{t('clientsPage.colClient')}</th>
									<th scope="col" className="end">
										{t('clientsPage.colBookings')}
									</th>
									<th scope="col" className="end">
										{t('clientsPage.colFrequency')}
									</th>
									<th scope="col" className="end">
										{t('clientsPage.colRevenue')}
									</th>
									<th scope="col">{t('clientsPage.colFirst')}</th>
									<th scope="col">{t('clientsPage.colLast')}</th>
								</tr>
							</thead>
							<tbody>
								{rows.map((client) => (
									<ClientRow key={client.id} client={client} picked={picked.has(client.id)} onPick={() => toggle(client.id)} />
								))}
							</tbody>
						</table>
						<Pager page={data.page} totalPages={data.total_pages} onPage={setPage} />
					</>
				)}
			</div>

			<SendPromotionDialog
				open={sending}
				clientIds={[...picked]}
				onClose={() => setSending(false)}
				onSent={() => {
					setSending(false);
					setPicked(new Set());
				}}
			/>
		</>
	);
}

function ClientRow({ client, picked, onPick }: { client: Client; picked: boolean; onPick: () => void }) {
	const name = client.full_name || client.username;
	return (
		<tr>
			<td className="clients-check">
				<input type="checkbox" checked={picked} onChange={onPick} aria-label={t('clientsPage.select', { name })} />
			</td>
			<td className="dtable-lead">
				<Link to={clientLink(client)} className="clients-who">
					<Avatar name={name} src={mediaUrl(client.profile_picture)} size={36} />
					<span>
						<b>{name}</b>
						<small>@{client.username}</small>
					</span>
				</Link>
			</td>
			<td data-label={t('clientsPage.colBookings')} className="end num">
				<span>{int(client.total_completed_bookings)}</span>
			</td>
			<td data-label={t('clientsPage.colFrequency')} className="end num">
				<span>{client.visit_frequency_days === null ? '—' : t('clientsPage.days', { count: Math.round(client.visit_frequency_days) })}</span>
			</td>
			<td data-label={t('clientsPage.colRevenue')} className="end num">
				<b>{mad(client.total_revenue)}</b>
			</td>
			<td data-label={t('clientsPage.colFirst')} className="num">
				<span>{date(client.first_booking_date)}</span>
			</td>
			<td data-label={t('clientsPage.colLast')} className="num">
				<span>{date(client.last_booking_date)}</span>
			</td>
		</tr>
	);
}

function SendPromotionDialog({ open, clientIds, onClose, onSent }: { open: boolean; clientIds: number[]; onClose: () => void; onSent: () => void }) {
	const shop = useCurrentShop();
	const promos = usePromos(shop.id, { is_active: true });
	const send = useSendPromotion(shop.id);
	const toast = useToast();
	const [promoId, setPromoId] = useState('');
	const active = promos.data ?? [];

	return (
		<Dialog
			open={open}
			onClose={() => {
				send.reset();
				onClose();
			}}
			title={t('clientsPage.sendTitle')}
			description={t('clientsPage.sendDescription', { count: clientIds.length })}
			footer={
				<>
					<Button variant="outline" onClick={onClose}>
						{t('common.buttons.cancel')}
					</Button>
					<Button
						dot={false}
						disabled={!promoId}
						loading={send.isPending}
						onClick={() =>
							send.mutate(
								{ client_ids: clientIds, promo_id: Number(promoId) },
								{
									onSuccess: (result) => {
										toast(t('clientsPage.sent', { count: result.success_count }));
										onSent();
									}
								}
							)
						}
					>
						{t('clientsPage.send')}
					</Button>
				</>
			}
		>
			{promos.error ? (
				<p className="notice notice--bad" role="alert">
					{t('clientsPage.promosError')}
				</p>
			) : promos.isPending ? (
				<p className="muted">{t('common.messages.loading')}</p>
			) : active.length === 0 ? (
				<p className="muted">
					{t('clientsPage.noActivePromos')}{' '}
					<Link to="/promotions" className="text-btn">
						{t('clientsPage.createPromotion')}
					</Link>
				</p>
			) : (
				<Field label={t('clientsPage.promotion')}>
					{({ id }) => (
						<Select id={id} value={promoId} onChange={(event) => setPromoId(event.target.value)}>
							<option value="">{t('clientsPage.choosePromotion')}</option>
							{active.map((promo) => (
								<option key={promo.id} value={promo.id}>
									{promo.name}
								</option>
							))}
						</Select>
					)}
				</Field>
			)}
			{send.isError && (
				<p className="notice notice--bad" role="alert">
					{errorText(send.error)}
				</p>
			)}
		</Dialog>
	);
}
