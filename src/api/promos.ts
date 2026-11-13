// Promotions: a code the client types, a standing discount on services, or a
// discount on set days and hours.
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { request } from './http';

export type PromoNature = 'code' | 'constant' | 'schedule';
export type DiscountType = 'fixed' | 'percentage';

export interface PromoSchedule {
	id?: number;
	/** 0 is Monday */
	weekday: number;
	start_time: string;
	end_time: string;
}

export interface Promo {
	id: number;
	name: string;
	description: string;
	discount_type: DiscountType;
	/** decimal as a string */
	discount_value: string;
	is_active: boolean;
	type: 'code' | 'shop';
	promo_nature: PromoNature;
	code: string | null;
	usage_limit_per_user: number | null;
	total_usage_limit: number | null;
	valid_from: string | null;
	valid_until: string | null;
	minimum_spend: string | number | null;
	services: { id: number; title: string; price: string }[];
	schedules: PromoSchedule[];
	usage_stats: { total_uses: number; remaining_uses: number | null; unique_users: number };
	qr_code: { id: string; image_url: string } | null;
	created_at: string;
}

/** What the create and update forms send. */
export interface PromoInput {
	name: string;
	description?: string;
	discount_type: DiscountType;
	discount_value: number;
	code?: string;
	usage_limit_per_user?: number | null;
	total_usage_limit?: number | null;
	valid_from?: string | null;
	valid_until?: string | null;
	minimum_spend?: number | null;
	service_ids?: number[];
	schedules?: PromoSchedule[];
}

const base = (shop: number) => `/api/auth/dashboard-promos/${shop}`;
const CREATE_PATH: Record<PromoNature, string> = { code: 'create-code', constant: 'create-constant', schedule: 'create-scheduled' };

export const usePromos = (shop: number, q: { search?: string; is_active?: boolean; nature?: PromoNature | '' } = {}) =>
	useQuery({
		queryKey: ['promos', shop, q],
		queryFn: async ({ signal }) => (await request<{ promos?: Promo[] }>(`${base(shop)}/list/`, { query: { ...q }, signal })).promos ?? [],
		placeholderData: keepPreviousData
	});

function usePromoChange<T>(shop: number, mutationFn: (input: T) => Promise<unknown>) {
	const qc = useQueryClient();
	return useMutation({ mutationFn, onSuccess: () => qc.invalidateQueries({ queryKey: ['promos', shop] }) });
}

export const useCreatePromo = (shop: number) =>
	usePromoChange(shop, ({ nature, ...input }: PromoInput & { nature: PromoNature }) => request<Promo>(`${base(shop)}/${CREATE_PATH[nature]}/`, { method: 'POST', body: input }));

export const useUpdatePromo = (shop: number) =>
	usePromoChange(shop, ({ id, ...input }: Partial<PromoInput> & { id: number }) => request<Promo>(`${base(shop)}/promo/${id}/update/`, { method: 'PATCH', body: input }));

export const useTogglePromo = (shop: number) => usePromoChange(shop, (id: number) => request<Promo>(`${base(shop)}/promo/${id}/toggle/`, { method: 'POST' }));

export const useDeletePromo = (shop: number) => usePromoChange(shop, (id: number) => request(`${base(shop)}/promo/${id}/delete/`, { method: 'DELETE' }));
