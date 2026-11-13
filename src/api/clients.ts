// The salon's clients: everyone with a completed booking, and one client's bookings.
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import type { Paginated } from './barbers';
import { request } from './http';

/** GET /api/auth/dashboard-clients/shops/{id}/clients/ */
export interface Client {
	id: number;
	username: string;
	full_name: string;
	profile_picture: string | null;
	total_completed_bookings: number;
	/** average days between two visits; null with a single visit */
	visit_frequency_days: number | null;
	first_booking_date: string | null;
	last_booking_date: string | null;
	total_revenue: string | null;
}

export interface ClientBooking {
	id: number;
	booking_date: string;
	start_time: string;
	status: string;
	services: { id: number; title: string; price: string }[];
	total_price: string;
	final_price: string;
	barber: { id: number; username: string } | null;
}

/** GET .../clients/{clientId}/bookings/ */
export interface ClientBookings extends Paginated<ClientBooking> {
	total_revenue: number;
	bookings_with_promo_percentage: number;
	/** 0 is Monday; null before the first completed booking */
	preferred_day: number | null;
}

export interface ClientBookingsQuery {
	status?: string;
	start_date?: string;
	end_date?: string;
	page?: number;
	page_size?: number;
}

const base = (shop: number) => `/api/auth/dashboard-clients/shops/${shop}`;

export const useClients = (shop: number, q: { search?: string; page?: number; page_size?: number }) =>
	useQuery({
		queryKey: ['clients', shop, 'list', q],
		queryFn: ({ signal }) => request<Paginated<Client>>(`${base(shop)}/clients/`, { query: { ...q }, signal }),
		placeholderData: keepPreviousData
	});

export const useClientBookings = (shop: number, client: number, q: ClientBookingsQuery) =>
	useQuery({
		queryKey: ['clients', shop, client, 'bookings', q],
		queryFn: ({ signal }) => request<ClientBookings>(`${base(shop)}/clients/${client}/bookings/`, { query: { ...q }, signal }),
		placeholderData: keepPreviousData
	});

/** Notifies the chosen clients of a promotion. Answers with how many were reached. */
export const useSendPromotion = (shop: number) =>
	useMutation({
		mutationFn: (input: { client_ids: number[]; promo_id: number }) => request<{ success_count: number; failure_count: number }>(`${base(shop)}/send-promotion/`, { method: 'POST', body: input })
	});
