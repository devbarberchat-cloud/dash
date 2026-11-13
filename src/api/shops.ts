// Salons: the ones the user manages, a salon's details, its team and its
// opening hours.
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { request } from './http';

export type ShopType = 'budget' | 'mid_range' | 'high_range' | 'premium';
export const SHOP_TYPES: readonly ShopType[] = ['budget', 'mid_range', 'high_range', 'premium'];
export type BookingManagementMode = 'barber' | 'manager';

/** GET /api/auth/shops/managed_shops/ */
export interface ManagedShop {
	id: number;
	name: string;
	logo?: string | null;
	shop_type?: ShopType;
	shop_type_display?: string;
}

export interface Person {
	id: number;
	username: string;
	first_name: string;
	last_name: string;
	email: string;
	role?: string;
	profile_picture?: string | null;
}

/** GET /api/auth/shops/{id}/managed-detail/ */
export interface ShopDetails {
	id: number;
	name: string;
	description: string;
	shop_type?: ShopType;
	shop_type_display: string;
	city?: string;
	postal_code?: string;
	latitude?: string;
	longitude?: string;
	address: string;
	/** The backend answers with the neighbourhood's label, not its code. */
	neighborhood?: string;
	google_maps_url: string;
	cover_image?: string | null;
	logo?: string | null;
	total_reviews: number;
	email: string;
	phone: string;
	rating: string;
	total_appointments: number;
	manager: Person | null;
	barber_count: number;
	today_bookings_count: string;
	status?: 'active' | 'inactive';
	booking_management_mode?: BookingManagementMode;
}

/** What the update and create forms send (multipart, for the two images). */
export interface ShopFields {
	name?: string;
	description?: string;
	shop_type?: ShopType;
	address?: string;
	city?: string;
	neighborhood?: string;
	postal_code?: string;
	latitude?: string;
	longitude?: string;
	google_maps_url?: string;
	phone?: string;
	email?: string;
	logo?: File;
	cover_image?: File;
}

/** GET /api/auth/shops/{id}/staff/ */
export interface StaffMember {
	staff_type: 'manager' | 'barber';
	user: Person;
	barber_score: number;
	is_available: boolean;
	total_cuts: number;
	average_cut_time: number;
	hired_at: string;
}

/** GET /api/auth/dashboard/shop-agenda/{id}/  (weekday 0 is Monday) */
export interface AgendaDay {
	id?: number;
	weekday: number;
	weekday_display: string;
	opening_time: string;
	closing_time: string;
	is_closed: boolean;
}

/** GET /api/auth/shops/{id}/manager-management/?search= */
export interface UserMatch {
	id: number;
	username: string;
	role: string;
	profile_picture: string | null;
}

const base = (shop: number) => `/api/auth/shops/${shop}`;

function toForm(fields: ShopFields) {
	const form = new FormData();
	for (const [key, value] of Object.entries(fields)) {
		if (value !== undefined) form.append(key, value instanceof File ? value : String(value));
	}
	return form;
}

export const shopKeys = {
	all: ['shops'] as const,
	detail: (shop: number) => ['shop', shop] as const,
	staff: (shop: number) => ['shop', shop, 'staff'] as const,
	agenda: (shop: number) => ['shop', shop, 'agenda'] as const,
	people: (shop: number, term: string, barbersOnly: boolean) => ['shop', shop, 'people', barbersOnly, term] as const
};

export const useShops = () =>
	useQuery({
		queryKey: shopKeys.all,
		queryFn: async () => (await request<{ results?: ManagedShop[] }>('/api/auth/shops/managed_shops/')).results ?? [],
		staleTime: 5 * 60_000
	});

export const useShop = (shop: number) => useQuery({ queryKey: shopKeys.detail(shop), queryFn: () => request<ShopDetails>(`${base(shop)}/managed-detail/`) });

export const useStaff = (shop: number) =>
	useQuery({
		queryKey: shopKeys.staff(shop),
		queryFn: async () => (await request<{ results?: StaffMember[] }>(`${base(shop)}/staff/`)).results ?? []
	});

export const useAgenda = (shop: number) =>
	useQuery({
		queryKey: shopKeys.agenda(shop),
		queryFn: async () => (await request<{ agenda?: AgendaDay[] }>(`/api/auth/dashboard/shop-agenda/${shop}/`)).agenda ?? []
	});

/** People with a BarberChat account who can join the salon: barbers only, or managers too. */
export const usePeopleSearch = (shop: number, term: string, barbersOnly: boolean, enabled = true) =>
	useQuery({
		queryKey: shopKeys.people(shop, term, barbersOnly),
		queryFn: async ({ signal }) =>
			(await request<{ results?: UserMatch[] }>(`${base(shop)}/manager-management/`, { query: { search: term, barbers_only: barbersOnly }, signal })).results ?? [],
		placeholderData: keepPreviousData,
		enabled
	});

export function useUpdateShop(shop: number) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (fields: ShopFields) => request<ShopDetails>(`${base(shop)}/managed-update/`, { method: 'PUT', body: toForm(fields) }),
		onSuccess: (details) => {
			qc.setQueryData(shopKeys.detail(shop), details);
			return qc.invalidateQueries({ queryKey: shopKeys.all });
		}
	});
}

export function useCreateShop() {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: (fields: ShopFields) => request<ShopDetails>('/api/auth/shops/', { method: 'POST', body: toForm(fields) }),
		onSuccess: () => qc.invalidateQueries({ queryKey: shopKeys.all })
	});
}

/** Opens or closes the salon to bookings. The backend flips the current state. */
export function useToggleShopStatus(shop: number) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn: () => request<{ status: 'active' | 'inactive' }>(`${base(shop)}/manager-management/`, { method: 'PATCH' }),
		onSuccess: ({ status }) => qc.setQueryData<ShopDetails>(shopKeys.detail(shop), (details) => (details ? { ...details, status } : details))
	});
}

export function useSaveAgenda(shop: number) {
	const qc = useQueryClient();
	return useMutation({
		// the API takes one weekday at a time
		mutationFn: (days: AgendaDay[]) =>
			Promise.all(
				days.map((day) =>
					request<AgendaDay>(`/api/auth/dashboard/shop-agenda/${shop}/weekday/${day.weekday}/`, {
						method: 'PATCH',
						body: { opening_time: day.opening_time, closing_time: day.closing_time, is_closed: day.is_closed }
					})
				)
			),
		onSettled: () => qc.invalidateQueries({ queryKey: shopKeys.agenda(shop) })
	});
}

function useTeamChange<T>(shop: number, mutationFn: (value: T) => Promise<unknown>) {
	const qc = useQueryClient();
	return useMutation({
		mutationFn,
		onSuccess: () =>
			Promise.all([qc.invalidateQueries({ queryKey: shopKeys.detail(shop) }), qc.invalidateQueries({ queryKey: ['barbers', shop] })])
	});
}

export const useAddBarber = (shop: number) =>
	useTeamChange(shop, (barberId: number) => request(`${base(shop)}/add_barber/`, { method: 'POST', body: { barber_id: barberId } }));

export const useRemoveBarber = (shop: number) =>
	useTeamChange(shop, (barberId: number) => request(`${base(shop)}/remove_barber/`, { method: 'POST', body: { barber_id: barberId } }));

export const useAssignManager = (shop: number) =>
	useTeamChange(shop, (username: string) => request(`${base(shop)}/manager-management/`, { method: 'POST', body: { username } }));

export const useRemoveManager = (shop: number) => useTeamChange(shop, () => request(`${base(shop)}/manager-management/`, { method: 'DELETE' }));
