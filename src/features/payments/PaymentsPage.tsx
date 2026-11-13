import { useState } from 'react';
import { download, errorText } from '@/api/http';
import { barberReportPath, invoicePath, usePaymentStats, usePeriod, usePeriods, useUploadProof, type PaymentPeriod, type PeriodStatus } from '@/api/payments';
import { useCurrentShop } from '@/app/shop-context';
import { t } from '@/i18n';
import { date, dateShort, mad } from '@/lib/format';
import { Button } from '@/ui/Button';
import { ChipGroup, Failure, Loading } from '@/ui/controls';
import { Dialog } from '@/ui/Dialog';
import { Field, Input } from '@/ui/Field';
import { Pager } from '@/ui/lists';
import { MoreMenu } from '@/ui/MoreMenu';
import { PageHeader } from '@/ui/PageHeader';
import { useToast } from '@/ui/Toast';
import './Payments.css';

const STATUSES: PeriodStatus[] = ['PENDING', 'OVERDUE', 'PENDING_REVIEW', 'PAID'];
const TONE: Record<PeriodStatus, string> = { PENDING: 'var(--st-pending)', OVERDUE: 'var(--st-noshow)', PENDING_REVIEW: 'var(--st-confirmed)', PAID: 'var(--st-done)' };
const PROOF_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
const PROOF_MAX = 10 * 1024 * 1024;

export function PaymentsPage() {
	const shop = useCurrentShop();
	const [status, setStatus] = useState<PeriodStatus | ''>('');
	const [page, setPage] = useState(1);
	const [paying, setPaying] = useState<PaymentPeriod | null>(null);
	const [opened, setOpened] = useState<PaymentPeriod | null>(null);
	const stats = usePaymentStats(shop.id);
	const { data, isPending, isFetching, error, refetch } = usePeriods(shop.id, { status, page, page_size: 10 });
	const toast = useToast();

	const save = (path: string, name: string) => download(path, name).catch((failure) => toast(errorText(failure)));

	return (
		<>
			<PageHeader kicker={shop.name} title={t('pay.title')} />

			{stats.data && (
				<dl className="figures figures--3">
					<div>
						<dt>{t('pay.toPay')}</dt>
						<dd>{mad(Number(stats.data.total_pending) + Number(stats.data.total_overdue))}</dd>
						<dd className="figure-note">{t('pay.toPayHint')}</dd>
					</div>
					<div>
						<dt>{t('pay.overdue')}</dt>
						<dd>{mad(stats.data.total_overdue)}</dd>
						<dd className="figure-note">{t('pay.periods', { count: stats.data.overdue_count })}</dd>
					</div>
					<div>
						<dt>{t('pay.paid')}</dt>
						<dd>{mad(stats.data.total_paid)}</dd>
					</div>
				</dl>
			)}

			<section className="pay" aria-label={t('pay.title')}>
				<ChipGroup
					label={t('history.colStatus')}
					value={status}
					onChange={(value) => {
						setStatus(value);
						setPage(1);
					}}
					options={[{ value: '' as const, label: t('pay.all') }, ...STATUSES.map((value) => ({ value, label: t(`pay.status.${value}`) }))]}
				/>

				{error && !data ? (
					<Failure error={error} onRetry={() => void refetch()} />
				) : isPending || !data ? (
					<Loading />
				) : data.results.length === 0 ? (
					<p className="muted">{t(status ? 'pay.noMatch' : 'pay.empty')}</p>
				) : (
					<>
						<ul className={`pay-grid${isFetching ? ' is-refreshing' : ''}`}>
							{data.results.map((period) => (
								<li key={period.id} className={`pay-card pay-card--${period.status.toLowerCase()}`}>
									<div className="pay-top">
										<b>{t('pay.week', { start: dateShort(period.week_start) })}</b>
										<span className="pay-state">
											<i style={{ background: TONE[period.status] }} aria-hidden />
											{t(`pay.status.${period.status}`)}
										</span>
									</div>
									<p className="pay-amount num">{mad(period.total_commission)}</p>
									<p className={`pay-when num${period.status !== 'PAID' && period.days_overdue > 0 ? ' is-late' : ''}`}>
										{period.status === 'PAID' && period.paid_at
											? t('pay.paidOn', { date: date(period.paid_at) })
											: period.days_overdue > 0
												? t('pay.daysLate', { count: period.days_overdue })
												: t('pay.due', { date: date(period.due_date) })}
									</p>
									<p className="pay-detail num">
										{t('pay.bookingsAmount', { count: period.total_bookings, amount: mad(period.total_booking_amount) })} · {t('pay.commission', { rate: `${Number(period.commission_rate)} %` })}
									</p>
									<div className="pay-actions">
										{period.can_upload_proof ? (
											<Button size="sm" dot={false} onClick={() => setPaying(period)}>
												{t('pay.uploadProof')}
											</Button>
										) : (
											<Button size="sm" variant="outline" dot={false} onClick={() => setOpened(period)}>
												{t('pay.details')}
											</Button>
										)}
										<MoreMenu
											label={`${t('common.labels.actions')} : ${t('pay.week', { start: dateShort(period.week_start) })}`}
											items={[
												{ label: t('pay.details'), run: () => setOpened(period) },
												...(period.has_invoice ? [{ label: t('pay.invoice'), run: () => void save(invoicePath(shop.id, period.id), `facture-${period.invoice_number ?? period.id}.pdf`) }] : []),
												{ label: t('pay.report'), run: () => void save(barberReportPath(shop.id, period.id), `rapport-${period.week_start}.pdf`) }
											]}
										/>
									</div>
								</li>
							))}
						</ul>
						<Pager page={data.pagination.page} totalPages={data.pagination.total_pages} onPage={setPage} />
					</>
				)}
			</section>

			<ProofDialog period={paying} onClose={() => setPaying(null)} />
			<PeriodDialog period={opened} onClose={() => setOpened(null)} />
		</>
	);
}

function ProofDialog({ period, onClose }: { period: PaymentPeriod | null; onClose: () => void }) {
	const shop = useCurrentShop();
	const upload = useUploadProof(shop.id);
	const toast = useToast();
	const [file, setFile] = useState<File | null>(null);
	const [notes, setNotes] = useState('');
	const fileError = file ? (!PROOF_TYPES.includes(file.type) ? t('pay.fileType') : file.size > PROOF_MAX ? t('pay.fileSize') : null) : null;
	const close = () => {
		upload.reset();
		setFile(null);
		setNotes('');
		onClose();
	};
	return (
		<Dialog
			open={Boolean(period)}
			onClose={close}
			title={t('pay.uploadTitle')}
			description={period ? t('pay.uploadBody', { period: `${dateShort(period.week_start)} – ${dateShort(period.week_end)}`, amount: mad(period.total_commission) }) : undefined}
			footer={
				<>
					<Button variant="outline" onClick={close}>
						{t('common.buttons.cancel')}
					</Button>
					<Button
						dot={false}
						disabled={!file || Boolean(fileError)}
						loading={upload.isPending}
						onClick={() =>
							period &&
							file &&
							upload.mutate(
								{ period: period.id, file, notes: notes.trim() },
								{
									onSuccess: () => {
										toast(t('pay.sent'));
										close();
									}
								}
							)
						}
					>
						{t('pay.send')}
					</Button>
				</>
			}
		>
			<Field label={t('pay.file')} error={fileError}>
				{({ id, describedBy, invalid }) => (
					<input id={id} type="file" accept=".pdf,image/jpeg,image/png" className="pay-file" onChange={(event) => setFile(event.target.files?.[0] ?? null)} aria-describedby={describedBy} aria-invalid={invalid} />
				)}
			</Field>
			<Field label={t('pay.notes')}>{({ id }) => <Input id={id} value={notes} maxLength={200} onChange={(event) => setNotes(event.target.value)} />}</Field>
			{upload.isError && (
				<p className="notice notice--bad" role="alert">
					{errorText(upload.error)}
				</p>
			)}
		</Dialog>
	);
}

function PeriodDialog({ period, onClose }: { period: PaymentPeriod | null; onClose: () => void }) {
	const shop = useCurrentShop();
	const details = usePeriod(shop.id, period?.id ?? null);
	return (
		<Dialog open={Boolean(period)} onClose={onClose} placement="side" title={period ? t('pay.detailsTitle', { start: dateShort(period.week_start) }) : ''} description={t('pay.records')}>
			{details.error ? (
				<p className="notice notice--bad" role="alert">
					{errorText(details.error)}
				</p>
			) : !details.data ? (
				<p className="muted">{t('common.messages.loading')}</p>
			) : details.data.payment_records.length === 0 ? (
				<p className="muted">{t('pay.noRecords')}</p>
			) : (
				<dl className="pairs">
					{details.data.payment_records.map((record) => (
						<div key={record.id}>
							<dt>
								{record.client_name}
								<small className="num">
									{dateShort(record.booking_date)} · {record.barber_name} · {mad(record.booking_amount)}
								</small>
							</dt>
							<dd className="num">{mad(record.commission_amount)}</dd>
						</div>
					))}
				</dl>
			)}
		</Dialog>
	);
}
