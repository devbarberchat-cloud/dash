import { useState } from 'react';
import { Upload } from 'lucide-react';
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
import { DocumentDialog, docName } from './PaymentDocument';
import './Payments.css';

const STATUSES: PeriodStatus[] = ['PENDING', 'OVERDUE', 'PENDING_REVIEW', 'PAID'];
const PROOF_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
const PROOF_MAX = 10 * 1024 * 1024;

const THIS_YEAR = new Date().getFullYear();
const validYear = (value: string) => /^\d{4}$/.test(value) && Number(value) >= 2020 && Number(value) <= THIS_YEAR + 1;

export function PaymentsPage() {
	const shop = useCurrentShop();
	const [status, setStatus] = useState<PeriodStatus | ''>('');
	const [yearInput, setYearInput] = useState('');
	const [page, setPage] = useState(1);
	const [paying, setPaying] = useState<{ period: PaymentPeriod; replace: boolean } | null>(null);
	const [opened, setOpened] = useState<PaymentPeriod | null>(null);
	// the week whose document is open, by id: once its proof is sent, the week's new state decides what shows
	const [docId, setDocId] = useState<number | null>(null);
	const year = validYear(yearInput) ? Number(yearInput) : undefined;
	const stats = usePaymentStats(shop.id, year);
	const { data, isPending, isFetching, error, refetch } = usePeriods(shop.id, { status, page, page_size: 10, ...(year ? { year } : {}) });
	const toast = useToast();

	const save = (path: string, name: string) => download(path, name).catch((failure) => toast(errorText(failure)));
	const filtered = status !== '' || year !== undefined;
	const docPeriod = data?.results.find((period) => period.id === docId) ?? null;

	return (
		<>
			<div className="pay-filters pay-filters--top" role="group" aria-label={t('pay.title')}>
				<ChipGroup
					label={t('history.colStatus')}
					value={status}
					onChange={(value) => {
						setStatus(value);
						setPage(1);
					}}
					options={[{ value: '' as const, label: t('pay.all') }, ...STATUSES.map((value) => ({ value, label: t(`pay.status.${value}`) }))]}
				/>
				<Input
					type="number"
					inputMode="numeric"
					className="pay-year"
					min={2020}
					max={THIS_YEAR + 1}
					placeholder={t('pay.year')}
					aria-label={t('pay.year')}
					aria-invalid={yearInput !== '' && !validYear(yearInput) ? true : undefined}
					value={yearInput}
					onChange={(event) => {
						setYearInput(event.target.value);
						setPage(1);
					}}
				/>
				{filtered && (
					<Button
						size="sm"
						variant="quiet"
						dot={false}
						onClick={() => {
							setStatus('');
							setYearInput('');
							setPage(1);
						}}
					>
						{t('live.clearFilters')}
					</Button>
				)}
			</div>

			<PageHeader title={t('pay.title')} description={t('pay.description')} />

			{stats.data && (
				<dl className="pay-owed">
					<div className="pay-card pay-card--total">
						<dt>{t('pay.toPay')}</dt>
						<dd className="num">{mad(Number(stats.data.total_pending) + Number(stats.data.total_overdue))}</dd>
					</div>
					<div className="pay-card pay-card--late">
						<dt>{t('pay.overdue')}</dt>
						<dd className="num">{mad(stats.data.total_overdue)}</dd>
					</div>
					<div className="pay-card pay-card--current">
						<dt>{t('pay.current')}</dt>
						<dd className="num">{mad(stats.data.total_pending)}</dd>
					</div>
				</dl>
			)}

			<section className="pay" aria-label={t('pay.title')}>
				{error && !data ? (
					<Failure error={error} onRetry={() => void refetch()} />
				) : isPending || !data ? (
					<Loading />
				) : data.results.length === 0 ? (
					<p className="pay-none">{t(filtered ? 'pay.noMatch' : 'pay.empty')}</p>
				) : (
					<>
						<div className={`pay-ledger${isFetching ? ' is-refreshing' : ''}`}>
							<div className="pay-head" aria-hidden="true">
								<span className="pay-h-week">{t('pay.colWeek')}</span>
								<span className="pay-h-due">{t('pay.colDue')}</span>
								<span className="pay-h-amount">{t('pay.colAmount')}</span>
								<span className="pay-h-state">{t('pay.colStatus')}</span>
							</div>
							<ul className="pay-list">
								{data.results.map((period) => {
									const range = t('pay.range', { start: dateShort(period.week_start), end: date(period.week_end) });
									const late = period.status !== 'PAID' && period.days_overdue > 0;
									return (
										<li key={period.id} className={`pay-row pay-row--${period.status.toLowerCase()}`}>
											<div className="pay-week">
												<p className="pay-range num">
													<button type="button" className="pay-open" aria-label={t('pay.docOpen', { doc: docName(period), period: range })} onClick={() => setDocId(period.id)}>
														{range}
													</button>
												</p>
												<p className="pay-detail num">
													{t('pay.bookingsAmount', { count: period.total_bookings, amount: mad(period.total_booking_amount) })} · {Number(period.commission_rate)} %
												</p>
											</div>
											<div className="pay-when">
												<p className={`pay-due num${late ? ' is-late' : ''}`}>
													{period.status === 'PAID' && period.paid_at
														? t('pay.paidOn', { date: date(period.paid_at) })
														: late
															? t('pay.daysLate', { count: period.days_overdue })
															: t('pay.due', { date: date(period.due_date) })}
												</p>
												<span className="pay-state">{t(`pay.status.${period.status}`)}</span>
											</div>
											<p className="pay-amount num">{mad(period.total_commission)}</p>
											{period.can_upload_proof && (
												<div className="pay-cta">
													<Button size="sm" variant="mauve" icon={<Upload aria-hidden="true" />} onClick={() => setPaying({ period, replace: false })}>
														{t('pay.uploadProof')}
													</Button>
												</div>
											)}
											<div className="pay-menu">
												<MoreMenu
													label={`${t('common.labels.actions')} : ${range}`}
													items={[
														{ label: docName(period), run: () => setDocId(period.id) },
														{ label: t('pay.details'), run: () => setOpened(period) },
														...(period.has_invoice ? [{ label: t('pay.invoice'), run: () => void save(invoicePath(shop.id, period.id), `facture-${period.invoice_number ?? period.id}.pdf`) }] : []),
														{ label: t('pay.report'), run: () => void save(barberReportPath(shop.id, period.id), `rapport-${period.week_start}.pdf`) }
													]}
												/>
											</div>
										</li>
									);
								})}
							</ul>
						</div>
						<Pager page={data.pagination.page} totalPages={data.pagination.total_pages} onPage={setPage} />
					</>
				)}
			</section>

			<DocumentDialog period={docPeriod} onClose={() => setDocId(null)} onProof={(period, replace) => setPaying({ period, replace })} />
			<ProofDialog period={paying?.period ?? null} replace={paying?.replace ?? false} onClose={() => setPaying(null)} />
			<PeriodDialog period={opened} onClose={() => setOpened(null)} />
		</>
	);
}

function ProofDialog({ period, replace, onClose }: { period: PaymentPeriod | null; replace: boolean; onClose: () => void }) {
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
			title={t(replace ? 'pay.replaceTitle' : 'pay.uploadTitle')}
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
