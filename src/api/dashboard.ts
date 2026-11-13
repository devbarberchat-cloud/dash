// The overview of a salon over a period.
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { request } from './http';

export type Period = 'last_7_days' | 'last_30_days' | 'current_month' | 'custom';

export interface PeriodQuery {
	period: Period;
	start_date?: string;
	end_date?: string;
}

/** GET /api/auth/dashboard-overview/shop/{id}/overview/ */
export interface DashboardData {
	stats: {
		totalRevenue: number;
		revenueTrend: number;
		bookings: number;
		bookingsTrend: number;
		activeCustomers: number;
		customersTrend: number;
		activePromos: number;
		/** promotions created over the last seven days */
		promosTrend: number;
	};
	revenueChart: { date: string; value: number }[];
	/** `status` is the backend's English label ("No Show", "In Progress"). */
	statusDistribution: { status: string; count: number }[];
	popularServices: { id: number; title: string; bookings: number; revenue: number; category?: { id: number; name: string } | null }[];
	bestBarbers: { id: number; name: string; avatar?: string; revenue: number; rating: number; bookings: number }[];
	bestPromos: { id: number; name: string; code: string; redemptions: number; revenue: number }[];
	alerts: { pendingPayments: number; overduePayments: number };
}

/** A custom period is only complete with both of its dates. */
export const isComplete = (q: PeriodQuery) => q.period !== 'custom' || Boolean(q.start_date && q.end_date);

export const useDashboard = (shop: number, q: PeriodQuery) =>
	useQuery({
		queryKey: ['dashboard', shop, q],
		queryFn: ({ signal }) => request<DashboardData>(`/api/auth/dashboard-overview/shop/${shop}/overview/`, { query: { ...q }, signal }),
		// refetches keep the previous figures on screen
		placeholderData: keepPreviousData,
		enabled: isComplete(q)
	});
