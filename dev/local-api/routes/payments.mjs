// Commission periods: list, detail, proof upload, statistics, invoice and
// barber report (small real PDFs), payment method.
import { HttpError, badRequest } from '../http.mjs';
import { isoDate, money } from '../data.mjs';
import { fullName } from '../serialize.mjs';

const STATUS_DISPLAY = {
	PENDING: 'Pending',
	PENDING_REVIEW: 'Pending review',
	PAID: 'Paid',
	OVERDUE: 'Overdue'
};
const METHOD_DISPLAY = {
	wire_transfer: 'Wire transfer',
	deposit: 'Deposit',
	cash: 'Cash',
	bank_transfer: 'Bank transfer',
	check: 'Check'
};
const fmtRange = (a, b) => {
	const f = (d, opts) => new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', opts);
	return `${f(a, { day: 'numeric', month: 'short' })} – ${f(b, { day: 'numeric', month: 'short', year: 'numeric' })}`;
};

/** A one-page PDF with the given lines, valid enough for any viewer. */
function pdf(lines) {
	const esc = (s) => String(s).replace(/[\\()]/g, (c) => `\\${c}`);
	const text = [
		'BT',
		'/F1 12 Tf',
		'50 780 Td',
		'16 TL',
		...lines.map((l) => `(${esc(l)}) Tj T*`),
		'ET'
	].join('\n');
	const objs = [
		'<< /Type /Catalog /Pages 2 0 R >>',
		'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
		'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
		`<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`,
		'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
	];
	let out = '%PDF-1.4\n';
	const offsets = [];
	objs.forEach((o, i) => {
		offsets.push(Buffer.byteLength(out));
		out += `${i + 1} 0 obj\n${o}\nendobj\n`;
	});
	const xref = Buffer.byteLength(out);
	out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
	out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
	return Buffer.from(out, 'latin1');
}

export function registerPayments(router, state) {
	const { data } = state;
	const today = () => isoDate(new Date());
	const findPeriod = (shopId, periodId) => {
		const p = data.periods.find((x) => x.id === Number(periodId) && x.shopId === Number(shopId));
		if (!p) throw new HttpError(404, { detail: 'Payment period not found.' });
		return p;
	};
	const bookingsIn = (p) =>
		data.bookings.filter(
			(b) =>
				b.shopId === p.shopId &&
				b.status === 'completed' &&
				b.date >= p.week_start &&
				b.date <= p.week_end
		);

	const serialize = (p) => {
		const list = bookingsIn(p);
		const amount = list.reduce((s, b) => s + b.price, 0);
		const status = p.status === 'PENDING' && p.due_date < today() ? 'OVERDUE' : p.status;
		const daysOverdue =
			status === 'OVERDUE'
				? Math.max(
						0,
						Math.round(
							(new Date(`${today()}T12:00:00`) - new Date(`${p.due_date}T12:00:00`)) / 86400000
						)
					)
				: 0;
		return {
			id: p.id,
			shop_name: state.shop(p.shopId).name,
			week_start: p.week_start,
			week_end: p.week_end,
			period_display: fmtRange(p.week_start, p.week_end),
			total_commission: money((amount * p.commission_rate) / 100),
			commission_rate: money(p.commission_rate),
			status,
			status_display: STATUS_DISPLAY[status],
			payment_method: p.payment_method,
			payment_method_display: p.payment_method ? METHOD_DISPLAY[p.payment_method] : null,
			paid_at: p.paid_at,
			due_date: p.due_date,
			is_overdue: status === 'OVERDUE',
			days_overdue: daysOverdue,
			is_pending_review: status === 'PENDING_REVIEW',
			can_upload_proof: status === 'PENDING' || status === 'OVERDUE',
			total_bookings: list.length,
			total_booking_amount: money(amount),
			has_invoice: Boolean(p.invoice_number),
			invoice_number: p.invoice_number,
			created_at: p.created_at,
			updated_at: p.updated_at
		};
	};

	router.add('GET', '/api/auth/dashboard-payments/shops/:shopId/periods/', ({ params, query }) => {
		const shop = state.shop(params.shopId);
		let items = data.periods.filter((p) => p.shopId === shop.id).map(serialize);
		if (query.status) items = items.filter((p) => p.status === query.status);
		if (query.year)
			items = items.filter(
				(p) =>
					p.week_start.startsWith(String(query.year)) || p.week_end.startsWith(String(query.year))
			);
		if (query.month)
			items = items.filter(
				(p) =>
					Number(p.week_start.slice(5, 7)) === Number(query.month) ||
					Number(p.week_end.slice(5, 7)) === Number(query.month)
			);
		items.sort((a, b) => b.week_start.localeCompare(a.week_start));
		const page_size = Math.max(1, Math.min(100, Number(query.page_size) || 10));
		const total_pages = Math.max(1, Math.ceil(items.length / page_size));
		const page = Math.min(total_pages, Math.max(1, Number(query.page) || 1));
		return {
			results: items.slice((page - 1) * page_size, page * page_size),
			pagination: {
				page,
				page_size,
				total_pages,
				total_count: items.length,
				has_next: page < total_pages,
				has_previous: page > 1
			}
		};
	});

	router.add(
		'GET',
		'/api/auth/dashboard-payments/shops/:shopId/periods/:periodId/',
		({ params }) => {
			const p = findPeriod(state.shop(params.shopId).id, params.periodId);
			return {
				...serialize(p),
				payment_records: bookingsIn(p).map((b) => ({
					id: b.id,
					booking_date: b.date,
					client_name: fullName(state.userById(b.clientId)),
					barber_name: fullName(state.userById(b.barberId)),
					booking_amount: money(b.price),
					commission_amount: money((b.price * p.commission_rate) / 100)
				})),
				invoice: p.invoice_number
					? { invoice_number: p.invoice_number, generated_at: p.paid_at }
					: null,
				proof: p.proof
					? { file_name: p.proof.filename, uploaded_at: p.proof.uploaded_at, notes: p.proof.notes }
					: null
			};
		}
	);

	router.add(
		'POST',
		'/api/auth/dashboard-payments/shops/:shopId/periods/:periodId/upload-proof/',
		({ params, body }) => {
			const p = findPeriod(state.shop(params.shopId).id, params.periodId);
			const file = body?.proof_file;
			if (!file || typeof file !== 'object' || !file.data)
				throw badRequest({ proof_file: ['No file was submitted.'] });
			if (!/^(image\/(jpeg|png)|application\/pdf)$/.test(file.contentType))
				throw badRequest({ proof_file: ['Upload a JPEG, PNG or PDF file.'] });
			if (file.data.length > 5 * 1024 * 1024)
				throw badRequest({ proof_file: ['The file must be 5 MB or less.'] });
			// a proof still under review can be replaced; a paid week is closed
			const st = serialize(p).status;
			if (!['PENDING', 'OVERDUE', 'PENDING_REVIEW'].includes(st))
				throw badRequest({ detail: 'Proof can only be uploaded for unpaid periods.' });
			p.proof = {
				filename: file.filename,
				contentType: file.contentType,
				data: file.data,
				uploaded_at: new Date().toISOString(),
				notes: body.notes || ''
			};
			p.status = 'PENDING_REVIEW';
			p.updated_at = new Date().toISOString();
			return serialize(p);
		}
	);

	// the file sent as proof, as it was uploaded; a seeded week gets a one-page receipt
	router.add(
		'GET',
		'/api/auth/dashboard-payments/shops/:shopId/periods/:periodId/proof/',
		({ params }) => {
			const shop = state.shop(params.shopId);
			const p = findPeriod(shop.id, params.periodId);
			if (!p.proof) throw new HttpError(404, { detail: 'No proof for this period.' });
			const s = serialize(p);
			return {
				__raw: true,
				status: 200,
				body:
					p.proof.data ??
					pdf([
						'Bank transfer receipt',
						`From: ${shop.name}`,
						'To: BarberChat',
						`Period: ${s.period_display}`,
						`Amount: ${s.total_commission} MAD`
					]),
				headers: { 'Content-Type': p.proof.data ? p.proof.contentType : 'application/pdf' }
			};
		}
	);

	router.add(
		'GET',
		'/api/auth/dashboard-payments/shops/:shopId/statistics/',
		({ params, query }) => {
			const shop = state.shop(params.shopId);
			const items = data.periods
				.filter(
					(p) =>
						p.shopId === shop.id && (!query.year || p.week_start.startsWith(String(query.year)))
				)
				.map(serialize);
			const sum = (list) => money(list.reduce((s, p) => s + Number(p.total_commission), 0));
			const by = (st) => items.filter((p) => p.status === st);
			return {
				total_periods: items.length,
				total_commission: sum(items),
				total_paid: sum(by('PAID')),
				total_pending: sum([...by('PENDING'), ...by('PENDING_REVIEW')]),
				total_overdue: sum(by('OVERDUE')),
				pending_review_count: by('PENDING_REVIEW').length,
				overdue_count: by('OVERDUE').length,
				paid_count: by('PAID').length,
				pending_count: by('PENDING').length
			};
		}
	);

	const pdfRoute =
		(kind) =>
		({ params }) => {
			const shop = state.shop(params.shopId);
			const p = findPeriod(shop.id, params.periodId);
			const s = serialize(p);
			if (kind === 'invoice' && !p.invoice_number)
				throw new HttpError(404, { detail: 'No invoice for this period yet.' });
			const lines =
				kind === 'invoice'
					? [
							`Invoice ${p.invoice_number}`,
							shop.name,
							`Period: ${s.period_display}`,
							`Bookings: ${s.total_bookings}`,
							`Booking amount: ${s.total_booking_amount} MAD`,
							`Commission (${s.commission_rate}%): ${s.total_commission} MAD`,
							`Status: ${s.status_display}`
						]
					: [
							`Barber report`,
							shop.name,
							`Period: ${s.period_display}`,
							...state.team(shop.id).map((b) => {
								const mine = bookingsIn(p).filter((x) => x.barberId === b.id);
								return `${fullName(b)}: ${mine.length} bookings, ${money(mine.reduce((t, x) => t + x.price, 0))} MAD`;
							})
						];
			return {
				__raw: true,
				status: 200,
				body: pdf(lines),
				headers: { 'Content-Type': 'application/pdf' }
			};
		};
	router.add(
		'GET',
		'/api/auth/dashboard-payments/shops/:shopId/periods/:periodId/invoice/',
		pdfRoute('invoice')
	);
	router.add(
		'GET',
		'/api/auth/dashboard-payments/shops/:shopId/periods/:periodId/barber-report/',
		pdfRoute('report')
	);

	router.add(
		'PATCH',
		'/api/auth/dashboard-payments/shops/:shopId/periods/:periodId/payment-method/',
		({ params, body }) => {
			const p = findPeriod(state.shop(params.shopId).id, params.periodId);
			if (!METHOD_DISPLAY[body?.payment_method])
				throw badRequest({ payment_method: [`"${body?.payment_method}" is not a valid choice.`] });
			p.payment_method = body.payment_method;
			return serialize(p);
		}
	);
}
