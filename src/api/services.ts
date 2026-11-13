// The salon's menu: its categories, in the salon's order, and their services.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { request } from './http';

export interface Category {
	id: number;
	name: string;
	description: string;
	/** up to three active services, by name */
	popular_services?: string[];
	remaining_services_count?: number;
}

export interface CategoryOrder {
	category_id: number;
	order: number;
	category: { id: number; name: string; description: string };
}

export interface Service {
	id: number;
	title: string;
	description: string;
	group: { id: number; name: string } | null;
	/** decimal as a string */
	price: string;
	duration_minutes: number;
	is_active: boolean;
	bookings_count: number;
	has_active_promos: boolean;
	discounted_price: string | null;
	best_promo: { id: number; name: string } | null;
}

export interface ServiceInput {
	id?: number;
	title: string;
	description: string;
	price: number;
	duration_minutes: number;
	/** the category's id, or '' for none */
	group: string;
	is_active: boolean;
}

const orders = (shop: number) => `/api/auth/dashboard-shop-category-orders/${shop}`;
const categories = (shop: number) => `/api/auth/dashboard-service-categories/${shop}`;
const services = (shop: number) => `/api/auth/dashboard-services/${shop}`;

/** Every BarberChat category, and the ones on this salon's menu in their order. */
export const useMenu = (shop: number) =>
	useQuery({
		queryKey: ['services', shop, 'menu'],
		queryFn: async ({ signal }) => {
			const data = await request<{ categories?: Category[]; orders?: CategoryOrder[] }>(`${orders(shop)}/list_shop_category_orders/`, { signal });
			return { categories: data.categories ?? [], orders: [...(data.orders ?? [])].sort((a, b) => a.order - b.order) };
		}
	});

/** The services of a category, or the ones in no category ('none'). */
export const useServices = (shop: number, category: number | 'none') =>
	useQuery({
		queryKey: ['services', shop, 'list', category],
		queryFn: async ({ signal }) => {
			const path = category === 'none' ? `${services(shop)}/services-without-group/` : `${services(shop)}/category/${category}/services/`;
			const data = await request<{ services?: Service[]; category?: { id: number; name: string; description: string } }>(path, { signal });
			return { services: data.services ?? [], category: data.category ?? null };
		}
	});

function useMenuChange<T>(shop: number, mutationFn: (input: T) => Promise<unknown>) {
	const qc = useQueryClient();
	return useMutation({ mutationFn, onSettled: () => qc.invalidateQueries({ queryKey: ['services', shop] }) });
}

export const useAddCategory = (shop: number) =>
	useMenuChange(shop, (input: { category_id: number; order: number }) => request(`${orders(shop)}/create_shop_category_order/`, { method: 'POST', body: input }));

/** Creates a category of the salon's own, then puts it on the menu. */
export const useCreateCategory = (shop: number) =>
	useMenuChange(shop, async (input: { name: string; description: string; order: number }) => {
		const created = await request<{ id: number }>(`${categories(shop)}/create_service_category/`, { method: 'POST', body: { name: input.name, description: input.description } });
		return request(`${orders(shop)}/create_shop_category_order/`, { method: 'POST', body: { category_id: created.id, order: input.order } });
	});

/** Saves the menu's order: one call per category whose place changed. */
export const useReorderMenu = (shop: number) =>
	useMenuChange(shop, (moves: { category_id: number; order: number }[]) =>
		Promise.all(moves.map((move) => request(`${orders(shop)}/category/${move.category_id}/update/`, { method: 'PATCH', body: { order: move.order } })))
	);

export const useRemoveCategory = (shop: number) => useMenuChange(shop, (categoryId: number) => request(`${orders(shop)}/category/${categoryId}/delete/`, { method: 'DELETE' }));

export const useSaveService = (shop: number) =>
	useMenuChange(shop, ({ id, ...input }: ServiceInput) => {
		// multipart, as the backend expects (it also takes an image)
		const form = new FormData();
		for (const [key, value] of Object.entries(input)) form.append(key, String(value));
		return id
			? request<Service>(`${services(shop)}/service/${id}/update/`, { method: 'PATCH', body: form })
			: request<Service>(`${services(shop)}/create_service/`, { method: 'POST', body: form });
	});

export const useDeleteService = (shop: number) => useMenuChange(shop, (serviceId: number) => request(`${services(shop)}/service/${serviceId}/delete/`, { method: 'DELETE' }));

/** Every service of the salon, whatever its category. */
export const useAllServices = (shop: number) =>
	useQuery({
		queryKey: ['services', shop, 'all'],
		queryFn: async ({ signal }) => (await request<{ services?: Service[] }>(`${services(shop)}/list_services/`, { signal })).services ?? []
	});
