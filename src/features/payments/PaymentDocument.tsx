import { useEffect, useRef, useState } from 'react';
import { Download, Printer, RefreshCw, Upload } from 'lucide-react';
import { download, errorText, fileBlob } from '@/api/http';
import { invoicePath, proofPath, usePeriod, type PaymentPeriod } from '@/api/payments';
import { useCurrentShop } from '@/app/shop-context';
import { currentLocale, t } from '@/i18n';
import { date, dateShort, mad } from '@/lib/format';
import { Button } from '@/ui/Button';
import { Dialog } from '@/ui/Dialog';
import { useToast } from '@/ui/Toast';

/** The document a week opens on: what to pay, what was sent, or what was paid. */
export type DocKind = 'notice' | 'proof' | 'invoice';
export const docKind = (period: PaymentPeriod): DocKind => (period.status === 'PAID' ? 'invoice' : period.status === 'PENDING_REVIEW' ? 'proof' : 'notice');
export const docName = (period: PaymentPeriod) => {
	const kind = docKind(period);
	return kind === 'notice' ? t('pay.docNotice') : kind === 'proof' ? t('pay.docProof') : t('pay.invoiceNumber', { number: period.invoice_number ?? '' }).trim();
};
const rangeOf = (period: PaymentPeriod) => t('pay.range', { start: dateShort(period.week_start), end: date(period.week_end) });

/** A file from the API as an address the page can show, released when the dialog moves on. `version` fetches it again. */
function useFile(path: string | null, version: string) {
	const [file, setFile] = useState<{ url: string; type: string } | null>(null);
	const [error, setError] = useState<unknown>(null);
	useEffect(() => {
		setFile(null);
		setError(null);
		if (!path) return;
		const abort = new AbortController();
		let url: string | null = null;
		fileBlob(path, { signal: abort.signal })
			.then((blob) => {
				if (abort.signal.aborted) return;
				url = URL.createObjectURL(blob);
				setFile({ url, type: blob.type });
			})
			.catch((failure) => {
				if (!abort.signal.aborted) setError(failure);
			});
		return () => {
			abort.abort();
			if (url) URL.revokeObjectURL(url);
		};
	}, [path, version]);
	return { file, error, loading: Boolean(path) && !file && !error };
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * The payment notice as a page of its own: shown in a frame, and printed from
 * it, so the paper holds the notice and nothing of the dashboard around it.
 */
function noticePage(period: PaymentPeriod, salon: string) {
	const locale = currentLocale();
	const late = period.days_overdue > 0;
	const row = (label: string, value: string) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`;
	return `<!doctype html>
<html lang="${locale}" dir="${locale === 'ar' ? 'rtl' : 'ltr'}">
<head>
<meta charset="utf-8">
<title>${escapeHtml(`${t('pay.docNotice')} · ${rangeOf(period)}`)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Poppins:wght@600;700&display=swap">
<style>
	* { box-sizing: border-box; margin: 0; }
	html { font: 13px/1.5 Inter, system-ui, sans-serif; color: #111827; background: #fff; }
	body { padding: 32px 28px; }
	header { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; padding-bottom: 16px; border-bottom: 2px solid #111827; }
	.brand { font: 700 18px Poppins, sans-serif; letter-spacing: -0.02em; color: #2b086c; }
	.kind { font: 600 13px Poppins, sans-serif; }
	.intro { margin-top: 16px; color: #6b7280; }
	table { width: 100%; margin-top: 20px; border-collapse: collapse; }
	th, td { padding: 9px 0; border-bottom: 1px solid #e5e7eb; font-weight: 400; text-align: start; }
	th { color: #6b7280; }
	td { font-weight: 500; text-align: end; font-variant-numeric: tabular-nums; }
	.total { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; margin-top: 20px; padding: 14px 16px; border-radius: 10px; background: #f6f6f7; }
	.total span { font-weight: 500; }
	.total b { font: 700 20px Poppins, sans-serif; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
	.due { margin-top: 12px; font-weight: 500; text-align: end; }
	.due.late { color: #9b1c22; }
	footer { margin-top: 32px; padding-top: 14px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280; }
	@page { size: A4; margin: 18mm; }
	@media print { html { font-size: 11pt; } body { padding: 0; } }
</style>
</head>
<body>
<header><span class="brand">BarberChat</span><span class="kind">${escapeHtml(t('pay.docNotice'))}</span></header>
<p class="intro">${escapeHtml(t('pay.noticeIntro'))}</p>
<table>
${row(t('pay.noticeSalon'), salon)}
${row(t('pay.noticePeriod'), rangeOf(period))}
${row(t('pay.records'), String(period.total_bookings))}
${row(t('pay.noticeAmount'), mad(period.total_booking_amount))}
${row(t('pay.noticeRate'), `${Number(period.commission_rate)} %`)}
</table>
<p class="total"><span>${escapeHtml(t('pay.noticeTotal'))}</span><b>${escapeHtml(mad(period.total_commission))}</b></p>
<p class="due${late ? ' late' : ''}">${escapeHtml(t('pay.due', { date: date(period.due_date) }))}${late ? ` · ${escapeHtml(t('pay.daysLate', { count: period.days_overdue }))}` : ''}</p>
<footer>${escapeHtml(t('pay.noticeFooter'))}</footer>
</body>
</html>`;
}

interface Props {
	period: PaymentPeriod | null;
	onClose: () => void;
	/** Send the proof of payment, or replace the one under review. */
	onProof: (period: PaymentPeriod, replace: boolean) => void;
}

/**
 * What a week opens on. Still to pay: the payment notice. Under review: the
 * proof the salon sent, which it can replace. Paid: the invoice, to keep.
 */
export function DocumentDialog({ period, onClose, onProof }: Props) {
	const shop = useCurrentShop();
	const toast = useToast();
	const sheet = useRef<HTMLIFrameElement>(null);
	const kind = period ? docKind(period) : null;
	const details = usePeriod(shop.id, period && kind === 'proof' ? period.id : null);
	const proof = details.data?.proof ?? null;
	const path = !period ? null : kind === 'invoice' ? (period.has_invoice ? invoicePath(shop.id, period.id) : null) : kind === 'proof' ? proofPath(shop.id, period.id) : null;
	const { file, error, loading } = useFile(path, proof?.uploaded_at ?? '');
	const name = period ? docName(period) : '';

	return (
		<Dialog
			open={Boolean(period)}
			onClose={onClose}
			placement="side"
			title={name}
			description={period ? `${rangeOf(period)} · ${mad(period.total_commission)}` : undefined}
			footer={
				period &&
				(kind === 'notice' ? (
					<>
						<Button variant="outline" dot={false} icon={<Printer aria-hidden="true" />} onClick={() => sheet.current?.contentWindow?.print()}>
							{t('pay.print')}
						</Button>
						{period.can_upload_proof && (
							<Button variant="mauve" icon={<Upload aria-hidden="true" />} onClick={() => onProof(period, false)}>
								{t('pay.uploadProof')}
							</Button>
						)}
					</>
				) : kind === 'proof' ? (
					<Button variant="mauve" icon={<RefreshCw aria-hidden="true" />} onClick={() => onProof(period, true)}>
						{t('pay.replace')}
					</Button>
				) : (
					<Button
						variant="mauve"
						icon={<Download aria-hidden="true" />}
						disabled={!period.has_invoice}
						onClick={() => void download(invoicePath(shop.id, period.id), `facture-${period.invoice_number ?? period.id}.pdf`).catch((failure) => toast(errorText(failure)))}
					>
						{t('common.buttons.download')}
					</Button>
				))
			}
		>
			{period && kind === 'notice' && <iframe ref={sheet} className="doc-frame" title={name} srcDoc={noticePage(period, shop.name)} />}

			{period && kind === 'proof' && proof && (
				<dl className="doc-facts">
					<dt>{proof.file_name}</dt>
					<dd className="num">{t('pay.sentOn', { date: date(proof.uploaded_at) })}</dd>
					{proof.notes && <dd>{proof.notes}</dd>}
				</dl>
			)}

			{period && kind !== 'notice' && (
				<>
					{kind === 'invoice' && !period.has_invoice ? (
						<p className="doc-none">{t('pay.noInvoice')}</p>
					) : loading ? (
						<p className="doc-none">{t('common.messages.loading')}</p>
					) : file?.type.startsWith('image/') ? (
						<img className="doc-image" src={file.url} alt={proof?.file_name ?? name} />
					) : file ? (
						<iframe className="doc-frame" title={name} src={file.url} />
					) : (
						<p className="doc-none" role={error ? 'alert' : undefined}>
							{t('pay.noPreview')}
						</p>
					)}
				</>
			)}
		</Dialog>
	);
}
