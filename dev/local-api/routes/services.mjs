// The menu: category orders per salon, categories, services.
import { HttpError, badRequest } from '../http.mjs';
import { serializeService } from '../serialize.mjs';

export function registerServices(router, state) {
	const { data } = state;
	const stamp = () => new Date().toISOString();
	const categoryView = (c, shopId) => {
		const svc = data.services.filter(
			(s) => s.shopId === Number(shopId) && s.groupId === c.id && s.is_active
		);
		return {
			id: c.id,
			name: c.name,
			description: c.description || '',
			created_at: c.created_at,
			updated_at: c.updated_at,
			popular_services: svc.slice(0, 3).map((s) => s.title),
			remaining_services_count: Math.max(0, svc.length - 3)
		};
	};
	const servicesPayload = (shop, list, extra = {}) => ({
		success: true,
		shop_id: shop.id,
		shop_name: shop.name,
		...extra,
		services: list.map((s) => serializeService(s, state)),
		count: list.length
	});

	// ------------------------------------------------------------ category orders
	router.add(
		'GET',
		'/api/auth/dashboard-shop-category-orders/:shopId/list_shop_category_orders/',
		({ params }) => {
			const shop = state.shop(params.shopId);
			const orders = data.categoryOrders
				.filter((o) => o.shop === shop.id)
				.sort((a, b) => a.order - b.order);
			return {
				success: true,
				shop_id: shop.id,
				shop_name: shop.name,
				categories: data.categories.map((c) => categoryView(c, shop.id)),
				orders: orders.map((o) => {
					const c = data.categories.find((x) => x.id === o.category_id);
					return { ...o, category: { id: c.id, name: c.name, description: c.description || '' } };
				})
			};
		}
	);
	router.add(
		'POST',
		'/api/auth/dashboard-shop-category-orders/:shopId/create_shop_category_order/',
		({ params, body }) => {
			const shop = state.shop(params.shopId);
			const categoryId = Number(body?.category_id);
			if (!data.categories.some((c) => c.id === categoryId))
				throw badRequest({ category_id: ['Invalid category.'] });
			let o = data.categoryOrders.find((x) => x.shop === shop.id && x.category_id === categoryId);
			if (o) Object.assign(o, { order: Number(body.order) || 0, updated_at: stamp() });
			else
				data.categoryOrders.push(
					(o = {
						id: data.newId(),
						shop: shop.id,
						category_id: categoryId,
						order: Number(body.order) || 0,
						created_at: stamp(),
						updated_at: stamp()
					})
				);
			return o;
		}
	);
	router.add(
		'PATCH',
		'/api/auth/dashboard-shop-category-orders/:shopId/category/:categoryId/update/',
		({ params, body }) => {
			const shop = state.shop(params.shopId);
			const o = data.categoryOrders.find(
				(x) => x.shop === shop.id && x.category_id === Number(params.categoryId)
			);
			if (!o) throw new HttpError(404, { detail: 'Category not found in this shop.' });
			o.order = Number(body?.order) || 0;
			o.updated_at = stamp();
			return o;
		}
	);
	router.add(
		'DELETE',
		'/api/auth/dashboard-shop-category-orders/:shopId/category/:categoryId/delete/',
		({ params }) => {
			const shop = state.shop(params.shopId);
			const i = data.categoryOrders.findIndex(
				(x) => x.shop === shop.id && x.category_id === Number(params.categoryId)
			);
			if (i === -1) throw new HttpError(404, { detail: 'Category not found in this shop.' });
			data.categoryOrders.splice(i, 1);
			return { success: true, message: 'Category removed from the shop.' };
		}
	);

	// ----------------------------------------------------------------- categories
	router.add(
		'GET',
		'/api/auth/dashboard-service-categories/:shopId/list_service_categories/',
		({ params }) => {
			const shop = state.shop(params.shopId);
			return {
				success: true,
				shop_id: shop.id,
				shop_name: shop.name,
				categories: data.categories.map((c) => categoryView(c, shop.id)),
				count: data.categories.length
			};
		}
	);
	router.add('GET', '/api/auth/dashboard-service-categories/search_categories/', ({ query }) => {
		const term = String(query.search || '')
			.trim()
			.toLowerCase();
		const categories = data.categories
			.filter((c) => c.name.toLowerCase().includes(term))
			.map((c) => ({
				...c,
				usage_count: data.categoryOrders.filter((o) => o.category_id === c.id).length
			}));
		return { success: true, categories, count: categories.length };
	});
	router.add(
		'POST',
		'/api/auth/dashboard-service-categories/:shopId/create_service_category/',
		({ body }) => {
			const name = String(body?.name || '').trim();
			if (!name) throw badRequest({ name: ['This field may not be blank.'] });
			if (data.categories.some((c) => c.name.toLowerCase() === name.toLowerCase()))
				throw badRequest({ detail: 'A category with this name already exists.' });
			const c = {
				id: data.newId(),
				name,
				description: body.description || '',
				created_at: stamp(),
				updated_at: stamp()
			};
			data.categories.push(c);
			return c;
		}
	);
	router.add(
		'PATCH',
		'/api/auth/dashboard-service-categories/:shopId/:categoryId/update/',
		({ params, body }) => {
			const c = data.categories.find((x) => x.id === Number(params.categoryId));
			if (!c) throw new HttpError(404, { detail: 'Category not found.' });
			if (body?.name !== undefined) c.name = String(body.name).trim() || c.name;
			if (body?.description !== undefined) c.description = body.description;
			c.updated_at = stamp();
			return c;
		}
	);
	router.add(
		'DELETE',
		'/api/auth/dashboard-service-categories/:shopId/:categoryId/delete/',
		({ params }) => {
			const i = data.categories.findIndex((x) => x.id === Number(params.categoryId));
			if (i === -1) throw new HttpError(404, { detail: 'Category not found.' });
			data.categories.splice(i, 1);
			return { success: true };
		}
	);

	// ------------------------------------------------------------------- services
	const shopServices = (shopId) => data.services.filter((s) => s.shopId === Number(shopId));
	router.add('GET', '/api/auth/dashboard-services/:shopId/list_services/', ({ params }) => {
		const shop = state.shop(params.shopId);
		return servicesPayload(shop, shopServices(shop.id));
	});
	router.add(
		'GET',
		'/api/auth/dashboard-services/:shopId/category/:categoryId/services/',
		({ params, query }) => {
			const shop = state.shop(params.shopId);
			const c = data.categories.find((x) => x.id === Number(params.categoryId));
			if (!c) throw new HttpError(404, { detail: 'Category not found.' });
			let list = shopServices(shop.id).filter((s) => s.groupId === c.id);
			if (query.is_active !== undefined)
				list = list.filter((s) => String(s.is_active) === String(query.is_active));
			return servicesPayload(shop, list, {
				category: {
					id: c.id,
					name: c.name,
					description: c.description || '',
					created_at: c.created_at,
					updated_at: c.updated_at
				}
			});
		}
	);
	router.add(
		'GET',
		'/api/auth/dashboard-services/:shopId/services-without-group/',
		({ params, query }) => {
			const shop = state.shop(params.shopId);
			let list = shopServices(shop.id).filter((s) => !s.groupId);
			if (query.is_active !== undefined)
				list = list.filter((s) => String(s.is_active) === String(query.is_active));
			return servicesPayload(shop, list);
		}
	);

	const readService = (body, existing) => {
		const errors = {};
		const out = {};
		if (!existing || body.title !== undefined) {
			out.title = String(body.title || '').trim();
			if (!out.title) errors.title = ['This field may not be blank.'];
		}
		if (!existing || body.price !== undefined) {
			out.price = Number(body.price);
			if (!(out.price >= 0) || String(body.price ?? '').trim() === '')
				errors.price = ['A valid number is required.'];
		}
		if (!existing || body.duration_minutes !== undefined) {
			out.duration_minutes = Number(body.duration_minutes);
			if (!Number.isInteger(out.duration_minutes) || out.duration_minutes <= 0)
				errors.duration_minutes = ['Enter a whole number of minutes greater than 0.'];
		}
		if (body.description !== undefined) out.description = String(body.description);
		if (body.is_active !== undefined) out.is_active = String(body.is_active) === 'true';
		if (body.requires_consultation !== undefined)
			out.requires_consultation = String(body.requires_consultation) === 'true';
		if (body.group !== undefined) {
			out.groupId = body.group === '' || body.group === 'null' ? null : Number(body.group);
			if (out.groupId && !data.categories.some((c) => c.id === out.groupId))
				errors.group = ['Invalid category.'];
		}
		if (Object.keys(errors).length) {
			const first = Object.entries(errors)[0];
			throw badRequest({ detail: `${first[0]}: ${first[1][0]}`, ...errors });
		}
		return out;
	};
	router.add('POST', '/api/auth/dashboard-services/:shopId/create_service/', ({ params, body }) => {
		const shop = state.shop(params.shopId);
		const fields = readService(body || {});
		const s = {
			id: data.newId(),
			shopId: shop.id,
			description: '',
			groupId: null,
			is_active: true,
			requires_consultation: false,
			image: null,
			created_at: stamp(),
			updated_at: stamp(),
			...fields
		};
		data.services.push(s);
		return { __status: 201, body: serializeService(s, state) };
	});
	router.add(
		'PATCH',
		'/api/auth/dashboard-services/:shopId/service/:serviceId/update/',
		({ params, body }) => {
			const shop = state.shop(params.shopId);
			const s = shopServices(shop.id).find((x) => x.id === Number(params.serviceId));
			if (!s) throw new HttpError(404, { detail: 'Service not found.' });
			Object.assign(s, readService(body || {}, s), { updated_at: stamp() });
			return serializeService(s, state);
		}
	);
	router.add(
		'DELETE',
		'/api/auth/dashboard-services/:shopId/service/:serviceId/delete/',
		({ params }) => {
			const shop = state.shop(params.shopId);
			const s = shopServices(shop.id).find((x) => x.id === Number(params.serviceId));
			if (!s) throw new HttpError(404, { detail: 'Service not found.' });
			s.is_active = false; // soft delete, as the backend does
			s.updated_at = stamp();
			return { success: true, message: 'Service deactivated.' };
		}
	);
}
