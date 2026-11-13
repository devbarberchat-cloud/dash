// The salon's barbers and their figures.
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { request } from './http';

export interface Paginated<T> {
	count: number;
	page: number;
	page_size: number;
	total_pages: number;
	has_next: boolean;
	has_previous: boolean;
	results: T[];
}

/** GET /api/auth/dashboard-barbers/shops/{id}/barbers/ */
export interface Barber {
	id: number;
	username: string;
	profile_picture: string | null;
	total_bookings: number;
	completed_bookings: number;
	cancelled_bookings: number;
	no_show_bookings: number;
	/** decimal as a string */
	total_revenue: string | null;
	completion_rate: number;
	cancellation_rate: number;
	no_show_rate: number;
	average_service_time: number | null;
	barber_score: number;
	first_booking_date: string | null;
	last_booking_date: string | null;
	average_revenue_per_booking: string | null;
}

export interface BarberQuery {
	search?: string;
	page?: number;
	page_size?: number;
}

export interface DaySchedule {
	start: string;
	end: string;
	breaks?: { start: string; end: string }[];
}

export interface ScoreChange {
	id: number;
	action_name: string;
	action_category: string;
	action_type: string;
	points_awarded: number;
	previous_score: number;
	new_score: number;
	created_at: string;
}

/** GET .../barbers/{barberId}/analytics/ */
export interface BarberAnalytics {
	barber_id: number;
	username: string;
	total_bookings: number;
	completed_bookings: number;
	cancelled_bookings: number;
	no_show_bookings: number;
	total_revenue: string;
	completion_rate: number;
	cancellation_rate: number;
	no_show_rate: number;
	average_service_time: number | null;
	barber_score: number;
	first_booking_date: string | null;
	last_booking_date: string | null;
	average_revenue_per_booking: string | null;
	average_revenue_per_booking_without_promos: string | null;
	average_revenue_per_hour: string | null;
	revenue_breakdown: {
		total_revenue: string;
		total_revenue_without_promos: string;
		average_revenue_per_booking: string | null;
		average_revenue_per_booking_without_promos: string | null;
		average_revenue_per_hour: string | null;
	};
	booking_statistics: {
		total_bookings: number;
		completed_bookings: number;
		cancelled_bookings: number;
		no_show_bookings: number;
		pending_bookings: number;
		confirmed_bookings: number;
		status_distribution: Record<string, number>;
	};
	service_analytics: {
		top_services: { service_id: number; service_title: string; count?: number; revenue?: string }[];
		revenue_by_service: { service_id: number; service_title: string; count?: number; revenue?: string }[];
	};
	client_analytics: {
		total_unique_clients: number;
		repeat_client_rate: number;
		average_bookings_per_client: number;
	};
	time_analytics: {
		bookings_per_day: { date?: string; count: number }[];
		peak_hours: { hour?: number; count: number }[];
		/** day 0 is Monday */
		peak_days: { day?: number; count: number }[];
	} | null;
	barber_score_history?: ScoreChange[];
	barber_schedule: {
		id: number;
		week_start_date: string;
		/** "0" (Monday) to "6"; a closed day is null or missing */
		weekly_schedule: Record<string, DaySchedule | null>;
		is_active: boolean;
	} | null;
}

/** GET .../barbers/{barberId}/periods/{periodId}/bookings/ */
export interface BarberPeriodBookings {
	period_start: string;
	period_end: string;
	total_bookings: number;
	total_revenue: string;
	total_commission: string;
	bookings: {
		id: number;
		booking_date: string;
		status: string;
		client_name: string;
		services: { title: string }[];
		booking_amount: string;
		commission_amount: string;
		commission_rate: number;
	}[];
}

const base = (shop: number) => `/api/auth/dashboard-barbers/shops/${shop}/barbers`;

export const useBarbers = (shop: number, q: BarberQuery = {}) =>
	useQuery({
		queryKey: ['barbers', shop, 'list', q],
		queryFn: ({ signal }) => request<Paginated<Barber>>(`${base(shop)}/`, { query: { ...q }, signal }),
		placeholderData: keepPreviousData
	});

export const useBarberAnalytics = (shop: number, barber: number, range?: { start_date: string; end_date: string }) =>
	useQuery({
		queryKey: ['barbers', shop, barber, 'analytics', range ?? null],
		queryFn: async ({ signal }) =>
			(await request<{ analytics: BarberAnalytics }>(`${base(shop)}/${barber}/analytics/`, { query: { ...range }, signal })).analytics,
		placeholderData: keepPreviousData
	});

export const useBarberPeriodBookings = (shop: number, barber: number, period: number) =>
	useQuery({
		queryKey: ['barbers', shop, barber, 'period', period],
		queryFn: ({ signal }) => request<BarberPeriodBookings>(`${base(shop)}/${barber}/periods/${period}/bookings/`, { signal })
	});
