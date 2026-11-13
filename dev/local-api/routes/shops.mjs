// Salons: the managed list, details and update, staff, manager and barber
// assignment, opening hours.
import { HttpError, badRequest } from '../http.mjs';
import { isoDate } from '../data.mjs';
import { SHOP_TYPE_DISPLAY, isNeighborhoodKey, neighborhoodLabel } from '../neighborhoods.mjs';
import { fullName } from '../serialize.mjs';

const SHOP_TYPES = Object.keys(SHOP_TYPE_DISPLAY);

export function registerShops(router, state) {
	const { data } = state;

	const shopDetails = (shop) => {
		const manager = shop.managerId ? state.userById(shop.managerId) : null;
		const bookings = state.bookingsOf(shop.id);
		const rated = bookings.filter((b) => b.rating);
		const today = isoDate(data.now);
		return {
			id: shop.id,
			name: shop.name,
			description: shop.description || '',
			shop_type: shop.shop_type,
			shop_type_display: SHOP_TYPE_DISPLAY[shop.shop_type],
			city: shop.city || '',
			postal_code: shop.postal_code || '',
			latitude: shop.latitude || '',
			longitude: shop.longitude || '',
			address: shop.address || '',
			neighborhood: neighborhoodLabel(shop.neighborhood),
			google_maps_url: shop.google_maps_url || '',
			cover_image: shop.cover_image,
			logo: shop.logo,
			total_reviews: rated.length,
			email: shop.email || '',
			phone: shop.phone || '',
			rating: rated.length
				? (rated.reduce((s, b) => s + b.rating, 0) / rated.length).toFixed(1)
				: '0.0',
			total_appointments: bookings.filter((b) => b.status === 'completed').length,
			manager: manager
				? {
						id: manager.id,
						username: manager.username,
						first_name: manager.first_name,
						last_name: manager.last_name,
						email: manager.email,
						role: manager.role,
						profile_picture: manager.profile_picture
					}
				: null,
			barber_count: state.team(shop.id).length,
			today_bookings_count: String(
				bookings.filter((b) => b.date === today && b.status !== 'cancelled').length
			),
			status: shop.status,
			booking_management_mode: shop.booking_management_mode
		};
	};

	const applyFields = (shop, body, { creating = false } = {}) => {
		const errors = {};
		if (creating || body.name !== undefined) {
			if (!String(body.name || '').trim()) errors.name = ['This field may not be blank.'];
		}
		if (body.shop_type !== undefined && !SHOP_TYPES.includes(body.shop_type))
			errors.shop_type = [`"${body.shop_type}" is not a valid choice.`];
		if (body.neighborhood && !isNeighborhoodKey(body.neighborhood))
			errors.neighborhood = [`"${body.neighborhood}" is not a valid choice.`];
		if (body.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email))
			errors.email = ['Enter a valid email address.'];
		if (body.google_maps_url && !/^https?:\/\//.test(body.google_maps_url))
			errors.google_maps_url = ['Enter a valid URL.'];
		for (const k of ['latitude', 'longitude'])
			if (body[k] && Number.isNaN(Number(body[k]))) errors[k] = ['A valid number is required.'];
		if (Object.keys(errors).length) throw badRequest(errors);
		for (const k of [
			'name',
			'description',
			'shop_type',
			'address',
			'city',
			'neighborhood',
			'postal_code',
			'latitude',
			'longitude',
			'google_maps_url',
			'phone',
			'email'
		]) {
			if (body[k] !== undefined) shop[k] = typeof body[k] === 'string' ? body[k].trim() : body[k];
		}
		for (const k of ['logo', 'cover_image']) {
			if (body[k] && typeof body[k] === 'object' && body[k].data) {
				if (!/^image\/(jpeg|png)$/.test(body[k].contentType))
					throw badRequest({
						[k]: [
							'Upload a valid image. The file you uploaded was either not an image or a corrupted image.'
						]
					});
				shop[k] = `http://127.0.0.1:${state.port}${state.saveUpload(body[k], 'shops')}`;
			}
		}
	};

	router.add('GET', '/api/auth/shops/managed_shops/', () => {
		const results = data.shops.map((s) => ({
			id: s.id,
			name: s.name,
			logo: s.logo,
			shop_type: s.shop_type,
			shop_type_display: SHOP_TYPE_DISPLAY[s.shop_type]
		}));
		return { count: results.length, results };
	});

	router.add('POST', '/api/auth/shops/', ({ body }) => {
		const shop = {
			id: data.newId(),
			name: '',
			description: '',
			shop_type: 'budget',
			city: 'Casablanca',
			address: '',
			postal_code: '',
			latitude: '',
			longitude: '',
			google_maps_url: '',
			phone: '',
			email: '',
			booking_management_mode: 'barber',
			status: 'active',
			logo: null,
			cover_image: null,
			managerId: data.manager.id
		};
		applyFields(shop, body, { creating: true });
		data.shops.push(shop);
		data.agendas[shop.id] = [
			'Monday',
			'Tuesday',
			'Wednesday',
			'Thursday',
			'Friday',
			'Saturday',
			'Sunday'
		].map((label, i) => ({
			id: shop.id * 10 + i,
			shop: shop.id,
			weekday: i,
			weekday_display: label,
			opening_time: '10:00:00',
			closing_time: '20:00:00',
			is_closed: i === 6
		}));
		return { __status: 201, body: shopDetails(shop) };
	});

	router.add('GET', '/api/auth/shops/:shopId/managed-detail/', ({ params }) =>
		shopDetails(state.shop(params.shopId))
	);

	router.add('PUT', '/api/auth/shops/:shopId/managed-update/', ({ params, body }) => {
		const shop = state.shop(params.shopId);
		applyFields(shop, body);
		return shopDetails(shop);
	});

	router.add('GET', '/api/auth/shops/:shopId/staff/', ({ params }) => {
		const shop = state.shop(params.shopId);
		const manager = shop.managerId ? state.userById(shop.managerId) : null;
		const results = [];
		if (manager)
			results.push({
				staff_type: 'manager',
				user: {
					id: manager.id,
					username: manager.username,
					first_name: manager.first_name,
					last_name: manager.last_name,
					email: manager.email,
					role: 'manager',
					profile_picture: manager.profile_picture
				},
				barber_score: 0,
				is_available: true,
				total_cuts: 0,
				average_cut_time: 0,
				hired_at: '2023-01-10'
			});
		for (const b of state.team(shop.id)) {
			const done = state
				.bookingsOf(shop.id)
				.filter((x) => x.barberId === b.id && x.status === 'completed');
			const rated = done.filter((x) => x.rating);
			results.push({
				staff_type: 'barber',
				user: {
					id: b.id,
					username: b.username,
					first_name: b.first_name,
					last_name: b.last_name,
					email: b.email,
					role: 'barber',
					profile_picture: b.profile_picture
				},
				barber_score: rated.length
					? Math.round((rated.reduce((s, x) => s + x.rating, 0) / rated.length) * 10) / 10
					: 0,
				is_available: b.is_available,
				total_cuts: done.length,
				average_cut_time: done.length
					? Math.round(done.reduce((s, x) => s + x.duration, 0) / done.length)
					: 0,
				hired_at: b.hired_at
			});
		}
		return { count: results.length, results };
	});

	// one path, five uses
	router.add('GET', '/api/auth/shops/:shopId/manager-management/', ({ params, query }) => {
		const shop = state.shop(params.shopId);
		if (query.task_id) return { status: 'completed', success: true, progress: '100%' };
		const term = String(query.search || '')
			.trim()
			.toLowerCase();
		const barbersOnly = String(query.barbers_only) === 'true';
		const taken = new Set(state.team(shop.id).map((b) => b.id));
		const pool = barbersOnly ? data.freeBarbers : [...data.otherManagers, ...data.freeBarbers];
		const results = pool
			.filter(
				(u) =>
					!taken.has(u.id) &&
					(!term || u.username.includes(term) || fullName(u).toLowerCase().includes(term))
			)
			.map((u) => ({
				id: u.id,
				username: u.username,
				role: u.role,
				profile_picture: u.profile_picture
			}));
		return { count: results.length, results };
	});
	router.add('POST', '/api/auth/shops/:shopId/manager-management/', ({ params, body }) => {
		const shop = state.shop(params.shopId);
		const user = state.users().find((u) => u.username === String(body?.username || '').trim());
		if (!user) throw badRequest({ detail: 'No user with this username.' });
		shop.managerId = user.id;
		return {
			success: true,
			message: `${user.username} is now the manager.`,
			username: user.username,
			id: user.id
		};
	});
	router.add('DELETE', '/api/auth/shops/:shopId/manager-management/', ({ params }) => {
		const shop = state.shop(params.shopId);
		const previous = shop.managerId ? state.userById(shop.managerId) : null;
		if (!previous) throw badRequest({ detail: 'This shop has no manager.' });
		shop.managerId = null;
		return {
			success: true,
			message: `${previous.username} is no longer the manager.`,
			username: previous.username
		};
	});
	router.add('PATCH', '/api/auth/shops/:shopId/manager-management/', ({ params }) => {
		const shop = state.shop(params.shopId);
		shop.status = shop.status === 'active' ? 'inactive' : 'active';
		return { status: shop.status, message: `Shop is now ${shop.status}.` };
	});

	router.add('POST', '/api/auth/shops/:shopId/add_barber/', ({ params, body }) => {
		const shop = state.shop(params.shopId);
		const id = Number(body?.barber_id);
		const idx = data.freeBarbers.findIndex((b) => b.id === id);
		if (idx === -1) throw badRequest({ detail: 'This barber is not available.' });
		const [user] = data.freeBarbers.splice(idx, 1);
		data.barbers.push({
			...user,
			shopId: shop.id,
			hired_at: isoDate(data.now),
			is_available: true,
			skill: 0.9,
			minutesFactor: 1
		});
		return {
			success: true,
			id: user.id,
			username: user.username,
			name: fullName(user),
			message: `${user.username} joined ${shop.name}.`
		};
	});
	router.add('POST', '/api/auth/shops/:shopId/remove_barber/', ({ params, body }) => {
		const shop = state.shop(params.shopId);
		const id = Number(body?.barber_id);
		const idx = data.barbers.findIndex((b) => b.id === id && b.shopId === shop.id);
		if (idx === -1) throw new HttpError(404, { detail: 'This barber is not part of the shop.' });
		const [barber] = data.barbers.splice(idx, 1);
		data.freeBarbers.push({
			id: barber.id,
			username: barber.username,
			email: barber.email,
			first_name: barber.first_name,
			last_name: barber.last_name,
			role: 'barber',
			profile_picture: barber.profile_picture
		});
		return {
			success: true,
			id: barber.id,
			username: barber.username,
			name: fullName(barber),
			message: `${barber.username} left ${shop.name}.`
		};
	});

	router.add('GET', '/api/auth/dashboard/shop-agenda/:shopId/', ({ params }) => {
		const shop = state.shop(params.shopId);
		const agenda = data.agendas[shop.id] || [];
		return { shop_id: shop.id, shop_name: shop.name, count: agenda.length, agenda };
	});
	router.add(
		'PATCH',
		'/api/auth/dashboard/shop-agenda/:shopId/weekday/:weekday/',
		({ params, body }) => {
			const shop = state.shop(params.shopId);
			const day = (data.agendas[shop.id] || []).find((d) => d.weekday === Number(params.weekday));
			if (!day) throw new HttpError(404, { detail: 'Weekday not found.' });
			const time = /^\d{2}:\d{2}(:\d{2})?$/;
			const closed = Boolean(body?.is_closed);
			if (!closed) {
				if (!time.test(body?.opening_time || '') || !time.test(body?.closing_time || ''))
					throw badRequest({ detail: 'Opening and closing times are required.' });
				if (body.closing_time.slice(0, 5) <= body.opening_time.slice(0, 5))
					throw badRequest({ detail: 'Closing time must be after opening time.' });
			}
			day.is_closed = closed;
			if (!closed) {
				day.opening_time =
					body.opening_time.length === 5 ? `${body.opening_time}:00` : body.opening_time;
				day.closing_time =
					body.closing_time.length === 5 ? `${body.closing_time}:00` : body.closing_time;
			}
			return day;
		}
	);
}
