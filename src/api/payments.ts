// What the salon owes BarberChat each week: a commission on completed bookings.
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { request } from './http';

export type PeriodStatus = 'PENDING' | 'PENDING_REVIEW' | 'OVERDUE' | 'PAID';

export interface PaymentPeriod {
	id: number;
	week_start: string;
	week_end: string;
	total_commission: string;
	commission_rate: string;
	status: PeriodStatus;
	paid_at: string | null;
	due_date: string;
	days_overdue: number;
	can_upload_proof: boolean;
	total_bookings: number;
	total_booking_amount: string;
	has_invoice: boolean;
	invoice_number: string | null;
}

export interface PeriodDetails extends PaymentPeriod {
	payment_records: { id: number; booking_date: string; client_name: string; barber_name: string; booking_amount: string; commission_amount: string }[];
	/** The proof of payment the salon sent, while BarberChat checks it. */
	proof?: { file_name: string; uploaded_at: string; notes: string } | null;
}

export interface PaymentStats {
	total_paid: string;
	total_pending: string;
	total_overdue: string;
	pending_review_count: number;
	overdue_count: number;
	paid_count?: number;
}

export interface PeriodsQuery {
	status?: PeriodStatus | '';
	year?: number;
	page?: number;
	page_size?: number;
}

const base = (shop: number) => `/api/auth/dashboard-payments/shops/${shop}`;

export const usePeriods = (shop: number, q: PeriodsQuery) =>
	useQuery({
		queryKey: ['payments', shop, 'periods', q],
		queryFn: ({ signal }) =>
			request<{ results: PaymentPeriod[]; pagination: { page: number; total_pages: number; total_count: number } }>(`${base(shop)}/periods/`, { query: { ...q }, signal }),
		placeholderData: keepPreviousData
	});

export const usePeriod = (shop: number, period: number | null) =>
	useQuery({
		queryKey: ['payments', shop, 'period', period],
		queryFn: ({ signal }) => request<PeriodDetails>(`${base(shop)}/periods/${period}/`, { signal }),
		enabled: period !== null
	});

export const usePaymentStats = (shop: number, year?: number) =>
	useQuery({ queryKey: ['payments', shop, 'stats', year ?? null], queryFn: ({ signal }) => request<PaymentStats>(`${base(shop)}/statistics/`, { query: { year }, signal }) });

export function useUploadProof(shop: number) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ period, file, notes }: { period: number; file: File; notes: string }) => {
			const form = new FormData();
			form.append('proof_file', file);
			if (notes) form.append('notes', notes);
			return request<PaymentPeriod>(`${base(shop)}/periods/${period}/upload-proof/`, { method: 'POST', body: form });
		},
		onSuccess: () => qc.invalidateQueries({ queryKey: ['payments', shop] })
	});
}

export const invoicePath = (shop: number, period: number) => `${base(shop)}/periods/${period}/invoice/`;
export const barberReportPath = (shop: number, period: number) => `${base(shop)}/periods/${period}/barber-report/`;
/** The file sent as proof of payment. */
export const proofPath = (shop: number, period: number) => `${base(shop)}/periods/${period}/proof/`;
