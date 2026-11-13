// Promotions, their weekly schedules and QR codes.
import { deflateSync } from 'node:zlib';
import { HttpError, badRequest } from '../http.mjs';
import { money } from '../data.mjs';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** A 21×21-module pattern PNG standing in for the QR image (the stub has no QR encoder). */
function qrPng(seedText) {
	const n = 21;
	const scale = 8;
	const size = n * scale + 32;
	let h = 0;
	for (const c of seedText) h = (h * 31 + c.charCodeAt(0)) >>> 0;
	const bit = (x, y) => {
		const finder = (fx, fy) =>
			x >= fx &&
			x < fx + 7 &&
			y >= fy &&
			y < fy + 7 &&
			(x === fx ||
				x === fx + 6 ||
				y === fy ||
				y === fy + 6 ||
				(x >= fx + 2 && x <= fx + 4 && y >= fy + 2 && y <= fy + 4));
		if (finder(0, 0) || finder(n - 7, 0) || finder(0, n - 7)) return 1;
		if ((x < 8 && y < 8) || (x >= n - 8 && y < 8) || (x < 8 && y >= n - 8)) return 0;
		h = (h * 1103515245 + 12345) >>> 0;
		return (h >>> 16) & 1;
	};
	const modules = Array.from({ length: n }, (_, y) =>
		Array.from({ length: n }, (_, x) => bit(x, y))
	);
	const raw = Buffer.alloc((size + 1) * size);
	for (let y = 0; y < size; y++) {
		raw[y * (size + 1)] = 0;
		for (let x = 0; x < size; x++) {
			const mx = Math.floor((x - 16) / scale);
			const my = Math.floor((y - 16) / scale);
			const dark = mx >= 0 && my >= 0 && mx < n && my < n && modules[my][mx];
			raw[y * (size + 1) + 1 + x] = dark ? 0 : 255;
		}
	}
	const chunk = (type, data) => {
		const len = Buffer.alloc(4);
		len.writeUInt32BE(data.length);
		const td = Buffer.concat([Buffer.from(type), data]);
		let c = ~0;
		for (const byte of td) {
			c ^= byte;
			for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
		}
		const crc = Buffer.alloc(4);
		crc.writeUInt32BE(~c >>> 0);
		return Buffer.concat([len, td, crc]);
	};
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(size, 0);
	ihdr.writeUInt32BE(size, 4);
	ihdr[8] = 8; // bit depth
	ihdr[9] = 0; // greyscale
	return Buffer.concat([
		Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
		chunk('IHDR', ihdr),
		chunk('IDAT', deflateSync(raw)),
		chunk('IEND', Buffer.alloc(0))
	]);
}

export function registerPromos(router, state) {
	const { data } = state;
	const stamp = () => new Date().toISOString();
	const qrImageUrl = (qr) => `http://127.0.0.1:${state.port}/media/qr/${qr.id}.png`;

	const serialize = (p) => {
		const uses = data.bookings.filter((b) => b.promoId === p.id && b.status === 'completed');
		const qr = p.qrCodeId ? data.qrCodes.find((q) => q.id === p.qrCodeId) : null;
		return {
			id: p.id,
			name: p.name,
			description: p.description || '',
			behavior: p.behavior,
			discount_type: p.discount_type,
			discount_value: money(p.discount_value),
			discount_display:
				p.discount_type === 'percentage' ? `${p.discount_value}%` : `$${money(p.discount_value)}`,
			is_active: p.is_active,
			type: p.type,
			promo_nature: p.promo_nature,
			code: p.code,
			usage_limit_per_user: p.usage_limit_per_user,
			total_usage_limit: p.total_usage_limit,
			valid_from: p.valid_from || null,
			valid_until: p.valid_until || null,
			minimum_spend: p.minimum_spend,
			services: p.serviceIds
				.map((sid) => state.service(sid))
				.filter(Boolean)
				.map((s) => ({ id: s.id, title: s.title, price: money(s.price) })),
			schedules: p.schedules.map((s) => ({
				id: s.id,
				weekday: s.weekday,
				weekday_display: WEEKDAYS[s.weekday],
				start_time: s.start_time,
				end_time: s.end_time
			})),
			usage_stats: {
				total_uses: uses.length,
				remaining_uses: p.total_usage_limit ? Math.max(0, p.total_usage_limit - uses.length) : null,
				unique_users: new Set(uses.map((b) => b.clientId)).size
			},
			qr_code: qr ? { id: qr.id, image_url: qrImageUrl(qr) } : null,
			created_at: p.created_at,
			updated_at: p.updated_at
		};
	};

	const time = (t) => (/^\d{2}:\d{2}$/.test(t) ? `${t}:00` : t);
	const readPromo = (body, { creating, type, nature }) => {
		const errors = {};
		const out = {};
		if (creating || body.name !== undefined) {
			out.name = String(body.name || '').trim();
			if (!out.name) errors.name = ['This field may not be blank.'];
		}
		if (body.description !== undefined) out.description = String(body.description || '');
		if (creating || body.discount_type !== undefined) {
			if (!['fixed', 'percentage'].includes(body.discount_type))
				errors.discount_type = ['Choose fixed or percentage.'];
			out.discount_type = body.discount_type;
		}
		if (creating || body.discount_value !== undefined) {
			out.discount_value = Number(body.discount_value);
			if (!(out.discount_value > 0)) errors.discount_value = ['Enter a value greater than 0.'];
			else if (
				(body.discount_type || out.discount_type) === 'percentage' &&
				out.discount_value > 100
			)
				errors.discount_value = ['A percentage cannot exceed 100.'];
		}
		if (body.behavior !== undefined)
			out.behavior = body.behavior === 'stackable' ? 'stackable' : 'exclusive';
		if (body.is_active !== undefined) out.is_active = Boolean(body.is_active);
		for (const k of ['usage_limit_per_user', 'total_usage_limit'])
			if (body[k] !== undefined)
				out[k] = body[k] === null || body[k] === '' ? null : Number(body[k]);
		for (const k of ['valid_from', 'valid_until'])
			if (body[k] !== undefined) out[k] = body[k] ? new Date(body[k]).toISOString() : null;
		if (out.valid_from && out.valid_until && out.valid_until <= out.valid_from)
			errors.valid_until = ['The end must be after the start.'];
		if (body.minimum_spend !== undefined)
			out.minimum_spend =
				body.minimum_spend === null || body.minimum_spend === ''
					? null
					: money(Number(body.minimum_spend));
		if (type === 'code' && body.code !== undefined) {
			const code = String(body.code || '')
				.trim()
				.toUpperCase();
			if (code && data.promos.some((p) => p.code === code && p.id !== body.__id))
				errors.code = ['This code is already used.'];
			out.code = code || null;
		}
		if (body.service_ids !== undefined)
			out.serviceIds = (Array.isArray(body.service_ids) ? body.service_ids : []).map(Number);
		if (nature === 'schedule' && body.schedules !== undefined) {
			const list = Array.isArray(body.schedules) ? body.schedules : [];
			if (!list.length) errors.schedules = ['Add at least one time slot.'];
			out.schedules = list.map((s) => ({
				id: data.newId(),
				weekday: Number(s.weekday),
				start_time: time(s.start_time),
				end_time: time(s.end_time)
			}));
		}
		if (Object.keys(errors).length) {
			const first = Object.entries(errors)[0];
			throw badRequest({ detail: `${first[0].replace(/_/g, ' ')}: ${first[1][0]}`, ...errors });
		}
		return out;
	};

	const create =
		(type, nature) =>
		({ params, body }) => {
			const shop = state.shop(params.shopId);
			const fields = readPromo(body || {}, { creating: true, type, nature });
			if (type === 'code' && !fields.code) {
				let code;
				do code = `BC${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
				while (data.promos.some((p) => p.code === code));
				fields.code = code;
			}
			const p = {
				id: data.newId(),
				shopId: shop.id,
				type,
				promo_nature: nature,
				behavior: 'exclusive',
				is_active: true,
				description: '',
				code: null,
				usage_limit_per_user: null,
				total_usage_limit: null,
				valid_from: null,
				valid_until: null,
				minimum_spend: null,
				serviceIds: [],
				schedules: [],
				qrCodeId: null,
				created_at: stamp(),
				updated_at: stamp(),
				...fields
			};
			data.promos.push(p);
			return { __status: 201, body: serialize(p) };
		};

	const base = '/api/auth/dashboard-promos/:shopId';
	router.add('GET', `${base}/list/`, ({ params, query }) => {
		const shop = state.shop(params.shopId);
		const term = String(query.search || '')
			.trim()
			.toLowerCase();
		const promos = data.promos
			.filter((p) => p.shopId === shop.id && !p.deleted)
			.filter(
				(p) => query.is_active === undefined || String(p.is_active) === String(query.is_active)
			)
			.filter((p) => !query.nature || p.promo_nature === query.nature)
			.filter((p) => !query.type || p.type === query.type)
			.filter((p) => !query.discount_type || p.discount_type === query.discount_type)
			.filter(
				(p) =>
					!term ||
					p.name.toLowerCase().includes(term) ||
					(p.code || '').toLowerCase().includes(term)
			)
			.sort((a, b) => b.created_at.localeCompare(a.created_at))
			.map(serialize);
		return { success: true, shop_id: shop.id, shop_name: shop.name, promos, count: promos.length };
	});
	router.add('GET', `${base}/promo/:promoId/`, ({ params }) =>
		serialize(state.promo(params.shopId, params.promoId))
	);
	router.add('POST', `${base}/create-code/`, create('code', 'code'));
	router.add('POST', `${base}/create-constant/`, create('shop', 'constant'));
	router.add('POST', `${base}/create-scheduled/`, create('shop', 'schedule'));
	const update = ({ params, body }) => {
		const p = state.promo(params.shopId, params.promoId);
		Object.assign(
			p,
			readPromo(
				{ ...(body || {}), __id: p.id },
				{ creating: false, type: p.type, nature: p.promo_nature }
			),
			{ updated_at: stamp() }
		);
		return serialize(p);
	};
	router.add('PATCH', `${base}/promo/:promoId/update/`, update);
	router.add('PUT', `${base}/promo/:promoId/update/`, update);
	router.add('DELETE', `${base}/promo/:promoId/delete/`, ({ params }) => {
		const p = state.promo(params.shopId, params.promoId);
		p.is_active = false;
		p.deleted = true;
		return { success: true, message: 'Promotion deleted.' };
	});
	router.add('POST', `${base}/promo/:promoId/toggle/`, ({ params }) => {
		const p = state.promo(params.shopId, params.promoId);
		p.is_active = !p.is_active;
		p.updated_at = stamp();
		return serialize(p);
	});
	router.add('GET', `${base}/promo/:promoId/usage/`, ({ params }) => {
		const p = state.promo(params.shopId, params.promoId);
		const uses = data.bookings.filter((b) => b.promoId === p.id && b.status === 'completed');
		return {
			promo_id: p.id,
			total_uses: uses.length,
			unique_users: new Set(uses.map((b) => b.clientId)).size,
			total_discount: money(uses.reduce((s, b) => s + b.discount, 0)),
			revenue: money(uses.reduce((s, b) => s + b.price, 0))
		};
	});

	// ------------------------------------------------------------------ schedules
	const sched = '/api/auth/dashboard-promo-schedules/:shopId/promo/:promoId/schedules';
	const schedView = (p) =>
		p.schedules.map((s) => ({
			id: s.id,
			weekday: s.weekday,
			weekday_display: WEEKDAYS[s.weekday],
			start_time: s.start_time,
			end_time: s.end_time
		}));
	router.add('GET', `${sched}/`, ({ params }) => ({
		success: true,
		schedules: schedView(state.promo(params.shopId, params.promoId))
	}));
	router.add('POST', `${sched}/create/`, ({ params, body }) => {
		const p = state.promo(params.shopId, params.promoId);
		const s = {
			id: data.newId(),
			weekday: Number(body?.weekday),
			start_time: time(body?.start_time || ''),
			end_time: time(body?.end_time || '')
		};
		if (
			!(s.weekday >= 0 && s.weekday <= 6) ||
			!s.start_time ||
			!s.end_time ||
			s.end_time <= s.start_time
		)
			throw badRequest({ detail: 'Enter a day and a start time before the end time.' });
		p.schedules.push(s);
		return s;
	});
	const schedUpdate = ({ params, body }) => {
		const p = state.promo(params.shopId, params.promoId);
		const s = p.schedules.find((x) => x.id === Number(params.scheduleId));
		if (!s) throw new HttpError(404, { detail: 'Schedule not found.' });
		if (body?.weekday !== undefined) s.weekday = Number(body.weekday);
		if (body?.start_time) s.start_time = time(body.start_time);
		if (body?.end_time) s.end_time = time(body.end_time);
		return s;
	};
	router.add('PATCH', `${sched}/:scheduleId/update/`, schedUpdate);
	router.add('PUT', `${sched}/:scheduleId/update/`, schedUpdate);
	router.add('DELETE', `${sched}/:scheduleId/delete/`, ({ params }) => {
		const p = state.promo(params.shopId, params.promoId);
		p.schedules = p.schedules.filter((x) => x.id !== Number(params.scheduleId));
		return { success: true };
	});
	router.add('POST', `${sched}/bulk-update/`, ({ params, body }) => {
		const p = state.promo(params.shopId, params.promoId);
		const list = Array.isArray(body?.schedules) ? body.schedules : [];
		p.schedules = list.map((s) => ({
			id: data.newId(),
			weekday: Number(s.weekday),
			start_time: time(s.start_time),
			end_time: time(s.end_time)
		}));
		return { success: true, schedules: schedView(p) };
	});

	// ------------------------------------------------------------------- QR codes
	const qrBase = '/api/auth/dashboard-qr-codes/:shopId';
	const findQr = (shopId, id) => {
		const q = data.qrCodes.find((x) => x.id === id && x.shopId === Number(shopId));
		if (!q) throw new HttpError(404, { detail: 'QR code not found.' });
		return q;
	};
	const qrStatus = (q) =>
		!q.is_active
			? 'disabled'
			: q.valid_until && q.valid_until < stamp()
				? 'expired'
				: q.max_scans && q.current_scans >= q.max_scans
					? 'expired'
					: 'active';
	const qrView = (q) => {
		const promo = data.promos.find((p) => p.id === q.promo);
		return {
			id: q.id,
			promo: q.promo,
			promo_name: promo?.name,
			promo_code: promo?.code,
			title: q.title,
			description: q.description,
			max_scans: q.max_scans,
			current_scans: q.current_scans,
			valid_from: q.valid_from,
			valid_until: q.valid_until,
			is_active: q.is_active,
			status: qrStatus(q),
			image_url: qrImageUrl(q),
			created_at: q.created_at
		};
	};
	router.add('GET', `${qrBase}/list_qr_codes/`, ({ params, query }) => {
		const shop = state.shop(params.shopId);
		const list = data.qrCodes
			.filter((q) => q.shopId === shop.id)
			.map(qrView)
			.filter(
				(q) =>
					(!query.promo || q.promo === Number(query.promo)) &&
					(!query.status || q.status === query.status)
			);
		return { success: true, qr_codes: list, count: list.length };
	});
	router.add('POST', `${qrBase}/create_qr_code/`, ({ params, body }) => {
		const shop = state.shop(params.shopId);
		const promo = state.promo(shop.id, body?.promo);
		if (promo.type !== 'code')
			throw badRequest({ detail: 'QR codes can only be created for code promotions.' });
		if (!String(body?.title || '').trim())
			throw badRequest({ detail: 'Give the QR code a title.' });
		if (!body?.valid_from) throw badRequest({ detail: 'Choose when the QR code starts working.' });
		const q = {
			id: `qr-${data.newId()}-${Date.now().toString(36)}`,
			promo: promo.id,
			shopId: shop.id,
			title: String(body.title).trim(),
			description: body.description || '',
			max_scans: body.max_scans ? Number(body.max_scans) : null,
			current_scans: 0,
			valid_from: body.valid_from,
			valid_until: body.valid_until || null,
			is_active: true,
			created_at: stamp(),
			scans: []
		};
		data.qrCodes.push(q);
		promo.qrCodeId = q.id;
		return { __status: 201, body: qrView(q) };
	});
	router.add('GET', `${qrBase}/qr-code/:qrId/`, ({ params }) =>
		qrView(findQr(params.shopId, params.qrId))
	);
	const qrUpdate = ({ params, body }) => {
		const q = findQr(params.shopId, params.qrId);
		for (const k of ['title', 'description', 'max_scans', 'valid_from', 'valid_until'])
			if (body?.[k] !== undefined) q[k] = body[k];
		return qrView(q);
	};
	router.add('PATCH', `${qrBase}/qr-code/:qrId/update/`, qrUpdate);
	router.add('PUT', `${qrBase}/qr-code/:qrId/update/`, qrUpdate);
	router.add('DELETE', `${qrBase}/qr-code/:qrId/delete/`, ({ params }) => {
		const q = findQr(params.shopId, params.qrId);
		data.qrCodes.splice(data.qrCodes.indexOf(q), 1);
		for (const p of data.promos) if (p.qrCodeId === q.id) p.qrCodeId = null;
		return { success: true };
	});
	router.add('POST', `${qrBase}/qr-code/:qrId/regenerate/`, ({ params }) =>
		qrView(findQr(params.shopId, params.qrId))
	);
	router.add('GET', `${qrBase}/qr-code/:qrId/stats/`, ({ params }) => {
		const q = findQr(params.shopId, params.qrId);
		const by = (r) => q.scans.filter((s) => s.result === r).length;
		return {
			total_scans: q.scans.length,
			successful_scans: by('success'),
			unique_users: new Set(q.scans.map((s) => s.user)).size,
			breakdown: {
				success: by('success'),
				expired: by('expired'),
				invalid: by('invalid'),
				limit_reached: by('limit_reached'),
				user_not_found: by('user_not_found')
			}
		};
	});
	router.add(
		'GET',
		'/media/qr/:file',
		({ params }) => {
			const id = params.file.replace(/\.png$/, '');
			if (!data.qrCodes.some((q) => q.id === id))
				throw new HttpError(404, { detail: 'Not found.' });
			return {
				__raw: true,
				status: 200,
				body: qrPng(id),
				headers: { 'Content-Type': 'image/png' }
			};
		},
		{ auth: false }
	);
}
