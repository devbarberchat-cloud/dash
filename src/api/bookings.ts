// Bookings: the live agenda, what can be done to a booking, and the history.
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { request } from './http';

export interface BookingPerson {
	id: number;
	username: string;
	full_name: string;
	email?: string | null;
	phone?: string | null;
	profile_picture?: string | null;
}

export interface Booking {
	id: number;
	booking_number: string;
	status: string;
	booking_date: string;
	start_time: string;
	end_time: string;
	client: BookingPerson | null;
	barber: BookingPerson | null;
	services: { id: number; title: string; price: string; duration_minutes: number }[];
	total_duration_minutes: number;
	final_price: string;
	total_price: string;
	promos: { id: number; name: string; code: string }[];
	cancellation: { cancelled_by: string; cancelled_by_display?: string; cancellation_reason?: string } | null;
	is_delayed: boolean;
	customer_delay_reported: boolean;
	can_mark_no_show: boolean;
	can_start_service: boolean;
	can_be_delayed: boolean;
	can_report_customer_delay: boolean;
	is_expired: boolean;
	/** seconds left to answer a pending request */
	time_until_expiry: number | null;
	/** seconds left in a service in progress; negative once it runs over */
	remaining_time_seconds: number | null;
	/** when the barber pressed "start", and when the service was closed */
	started_at?: string | null;
	completed_at?: string | null;
	client_notes?: string | null;
	barber_notes?: string | null;
}

/** GET /api/auth/dashboard-bookings/shop/{id}/bookings/ */
export interface LiveBookings {
	pending_bookings: Booking[];
	reschedule_requested: Booking[];
	current_bookings: Booking[];
	in_progress_bookings: Booking[];
	todays_bookings: Booking[];
	upcoming_bookings: Booking[];
	stats: { pending_count: number; reschedule_count: number; today_count: number; in_progress_count: number; total_upcoming: number };
	/** 'manager': the dashboard may act on bookings; 'barber': each barber handles their own */
	booking_management_mode: 'barber' | 'manager';
}

export type BookingAction =
	| 'accept'
	| 'cancel'
	| 'start_service'
	| 'complete_service'
	| 'delay_booking'
	| 'report_customer_delay'
	| 'mark_no_show'
	| 'request_reschedule'
	| 'offer_reschedule_slots';

export interface ActionInput {
	bookingId: number;
	action: BookingAction;
	reason?: string;
	delay_minutes?: number;
	/** the start times offered to the client, at most three */
	selected_slots?: string[];
}

export interface Slot {
	start_time: string;
	end_time?: string;
}

export interface HistoryQuery {
	search?: string;
	status?: string;
	start_date?: string;
	end_date?: string;
	min_price?: string;
	max_price?: string;
	has_promo?: 'true' | 'false' | '';
	cancelled_by?: string;
	barber_id?: number;
	client_id?: number;
	ordering?: 'booking_date' | '-booking_date';
	page?: number;
	page_size?: number;
}

export interface BookingHistory {
	count: number;
	page: number;
	page_size: number;
	total_pages: number;
	results: Booking[];
}

const live = (shop: number) => `/api/auth/dashboard-bookings/shop/${shop}/bookings`;

export const useLiveBookings = (shop: number) =>
	useQuery({
		queryKey: ['bookings', shop, 'live'],
		queryFn: ({ signal }) => request<LiveBookings>(`${live(shop)}/`, { signal }),
		// the agenda moves on its own: ask again every 30 seconds
		refetchInterval: 30_000,
		placeholderData: keepPreviousData
	});

export function useBookingAction(shop: number) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: ({ bookingId, ...body }: ActionInput) => request<{ booking: Booking }>(`${live(shop)}/${bookingId}/process_action/`, { method: 'POST', body }),
		onSuccess: () => qc.invalidateQueries({ queryKey: ['bookings', shop] })
	});
}

/** The barber's free slots over the next days, to offer the client another time. */
export const useFreeSlots = (shop: number, bookingId: number | null) =>
	useQuery({
		queryKey: ['bookings', shop, 'slots', bookingId],
		queryFn: async () =>
			(
				await request<{ available_slots?: (Slot | string)[] }>(`${live(shop)}/${bookingId}/process_action/`, { method: 'POST', body: { action: 'show_available_slots' } })
			).available_slots?.map((slot) => (typeof slot === 'string' ? { start_time: slot } : slot)) ?? [],
		enabled: bookingId !== null,
		staleTime: 0
	});

export const useBookingHistory = (shop: number, q: HistoryQuery) =>
	useQuery({
		queryKey: ['bookings', shop, 'history', q],
		queryFn: ({ signal }) => request<BookingHistory>(`/api/auth/dashboard-booking-history/shop/${shop}/history/`, { query: { ...q }, signal }),
		placeholderData: keepPreviousData
	});

/** What the history is asked for a page, and how many pages are read at most (8 000 bookings). */
const RANGE_PAGE_SIZE = 200;
const RANGE_MAX_PAGES = 40;

/** Every booking between two dates, read across the history's pages. `complete` is false if the cap was reached. */
export const useBookingsBetween = (shop: number, start: string | undefined, end: string | undefined) =>
	useQuery({
		queryKey: ['bookings', shop, 'between', start, end],
		queryFn: async ({ signal }) => {
			const bookings: Booking[] = [];
			let page = 1;
			let pages = 1;
			do {
				const data = await request<BookingHistory>(`/api/auth/dashboard-booking-history/shop/${shop}/history/`, {
					query: { start_date: start, end_date: end, ordering: 'booking_date', page, page_size: RANGE_PAGE_SIZE },
					signal
				});
				bookings.push(...data.results);
				pages = data.total_pages;
				page += 1;
			} while (page <= pages && page <= RANGE_MAX_PAGES);
			return { bookings, complete: page > pages };
		},
		enabled: Boolean(start && end),
		placeholderData: keepPreviousData,
		staleTime: 60_000
	});
