// The local API's dataset: two fictional salons in Casablanca, their teams,
// clients, menus, six months of bookings and the next two weeks, payment
// periods, promotions, QR codes and reviews. Generated from a fixed seed
// relative to today, so every run looks the same and every page has data.

export function rng(seed) {
	return () => {
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), seed | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const pad = (n) => String(n).padStart(2, '0');
export const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const isoTime = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
export const startOfDay = (d) => {
	const x = new Date(d);
	x.setHours(0, 0, 0, 0);
	return x;
};
export const addDays = (d, n) => {
	const x = new Date(d);
	x.setDate(x.getDate() + n);
	return x;
};
export const atTime = (date, time) => new Date(`${date}T${time.slice(0, 5)}:00`);
export const money = (n) => (Math.round(n * 100) / 100).toFixed(2);

const FIRST = [
	'Youssef',
	'Hamza',
	'Anas',
	'Mehdi',
	'Karim',
	'Ayoub',
	'Omar',
	'Soufiane',
	'Rayane',
	'Badr',
	'Nabil',
	'Ilyas',
	'Reda',
	'Zakaria',
	'Amine',
	'Hicham',
	'Othmane',
	'Tarik',
	'Adam',
	'Samir',
	'Walid',
	'Bilal',
	'Taha',
	'Driss',
	'Saad',
	'Fouad',
	'Ayman',
	'Imad',
	'Noah',
	'Rachid',
	'Kamal',
	'Selim',
	'Anouar',
	'Younes',
	'Ismail',
	'Yassine',
	'Jad',
	'Mourad',
	'Nizar',
	'Salah'
];
const LAST = [
	'El Amrani',
	'Bennani',
	'Tazi',
	'Alaoui',
	'Idrissi',
	'Chraibi',
	'Berrada',
	'Lahlou',
	'Kettani',
	'Sqalli',
	'Fassi',
	'Benjelloun',
	'Cherkaoui',
	'Ouazzani',
	'Mansouri',
	'Raji',
	'Lamrani',
	'Ziani',
	'Haddad',
	'Naciri'
];
const slug = (s) =>
	s
		.toLowerCase()
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/[^a-z]/g, '');

export function buildDataset(now = new Date()) {
	const r = rng(20261109);
	const pick = (list) => list[Math.floor(r() * list.length)];
	let nextId = 1000;
	const id = () => nextId++;
	const created = (daysAgo) => addDays(now, -daysAgo).toISOString();

	// ------------------------------------------------------------------ people
	const manager = {
		id: 1,
		username: 'salma.benali',
		email: 'owner@barberchat.test',
		first_name: 'Salma',
		last_name: 'Benali',
		role: 'manager',
		profile_picture: null
	};

	const shops = [
		{
			id: 12,
			name: 'Atlas Barber Club',
			neighborhood: 'MAARIF',
			shop_type: 'high_range',
			city: 'Casablanca',
			address: '27 rue Ibnou Mounir',
			postal_code: '20330',
			latitude: '33.58642',
			longitude: '-7.63215',
			google_maps_url: 'https://maps.google.com/?q=33.58642,-7.63215',
			phone: '+212522000412',
			email: 'contact@atlasbarber.test',
			booking_management_mode: 'manager',
			status: 'active',
			description:
				'Coupes, barbe et soins au Maârif. Sans rendez-vous le matin, sur réservation le week-end.',
			logo: '/media/demo/logo.webp',
			cover_image: '/media/demo/cover.jpg',
			managerId: 1
		},
		{
			id: 19,
			name: 'Atlas Barber Club Gauthier',
			neighborhood: 'GAUTHIER',
			shop_type: 'mid_range',
			city: 'Casablanca',
			address: '8 rue Jean Jaurès',
			postal_code: '20060',
			latitude: '33.59041',
			longitude: '-7.62788',
			google_maps_url: '',
			phone: '+212522000588',
			email: 'gauthier@atlasbarber.test',
			booking_management_mode: 'barber',
			status: 'active',
			description: 'Le deuxième salon, près du boulevard Moulay Youssef.',
			logo: null,
			cover_image: null,
			managerId: 1
		}
	];

	const barbers = [];
	const teamSizes = { 12: 6, 19: 3 };
	// portraits served from dev/local-api/media (see routes/media.mjs)
	const PORTRAITS = ['barber-4286.webp', 'barber-4283.webp', 'barber-4281.webp', 'barber-4282.webp', 'barber-4284.webp'];
	let nameIdx = 0;
	for (const shop of shops) {
		for (let i = 0; i < teamSizes[shop.id]; i++) {
			const first = FIRST[nameIdx % FIRST.length];
			const last = LAST[(nameIdx * 7) % LAST.length];
			nameIdx++;
			barbers.push({
				id: 100 + barbers.length,
				username: `${slug(first)}.${slug(last)}`,
				email: `${slug(first)}@atlasbarber.test`,
				first_name: first,
				last_name: last,
				role: 'barber',
				profile_picture: shop.id === 12 && PORTRAITS[i] ? `/media/demo/${PORTRAITS[i]}` : null,
				shopId: shop.id,
				hired_at: isoDate(addDays(now, -Math.round(120 + r() * 700))),
				is_available: i !== 3, // one barber is off
				skill: 0.8 + r() * 0.18, // drives completion and ratings
				minutesFactor: 0.9 + r() * 0.35
			});
		}
	}
	// people with a BarberChat account who are not on a team yet
	const freeBarbers = [
		'nassim.cuts',
		'reda.fade',
		'ilyas.razor',
		'zakaria.blade',
		'amine.barber'
	].map((username, i) => ({
		id: 900 + i,
		username,
		email: `${username}@barberchat.test`,
		first_name: username.split('.')[0].replace(/^./, (c) => c.toUpperCase()),
		last_name: '',
		role: 'barber',
		profile_picture: null
	}));
	const otherManagers = ['karim.manager', 'nadia.gerante'].map((username, i) => ({
		id: 950 + i,
		username,
		email: `${username}@barberchat.test`,
		first_name: username.split('.')[0].replace(/^./, (c) => c.toUpperCase()),
		last_name: '',
		role: 'manager',
		profile_picture: null
	}));

	const clients = [];
	for (let i = 0; i < 160; i++) {
		const first = FIRST[(i * 3 + 5) % FIRST.length];
		const last = LAST[(i * 11) % LAST.length];
		clients.push({
			id: 5000 + i,
			username: `${slug(first)}${i}`,
			first_name: first,
			last_name: last,
			email: `${slug(first)}.${i}@mail.test`,
			phone: `+2126${String(10000000 + Math.floor(r() * 89999999))}`,
			profile_picture: null
		});
	}

	// ------------------------------------------------------------------- menus
	// global categories, as the backend has them; each salon orders the ones it uses
	const categories = [
		['Coupe & Coiffage', 'Coupes, dégradés et coiffage'],
		['Barbe & Rasage', 'Taille, contours et rasage'],
		['Soins du Visage', 'Nettoyage et soins de la peau'],
		['Packs', 'Formules combinées'],
		['Coloration', 'Coloration cheveux et barbe'],
		['Soins Cheveux', 'Soins et traitements capillaires']
	].map(([name, description], i) => ({
		id: 10 + i,
		name,
		description,
		created_at: created(700 - i),
		updated_at: created(300)
	}));
	const categoryOrders = [];
	const services = [];
	const MENU = [
		[
			10,
			[
				['Coupe classique', 90, 30],
				['Dégradé', 110, 40],
				['Coupe enfant', 60, 25],
				['Coupe aux ciseaux', 130, 45]
			]
		],
		[
			11,
			[
				['Taille de barbe', 60, 20],
				['Rasage à l’ancienne', 80, 30],
				['Barbe sculptée', 90, 30]
			]
		],
		[
			12,
			[
				['Soin visage express', 150, 30],
				['Masque purifiant', 120, 25]
			]
		],
		[
			13,
			[
				['Coupe + barbe', 170, 60],
				['Coupe + soin visage', 220, 60]
			]
		]
	];
	for (const shop of shops) {
		MENU.forEach(([categoryId, items], order) => {
			categoryOrders.push({
				id: id(),
				shop: shop.id,
				category_id: categoryId,
				order,
				created_at: created(500),
				updated_at: created(500)
			});
			for (const [title, price, minutes] of items) {
				const factor = shop.id === 19 ? 0.8 : 1;
				services.push({
					id: id(),
					shopId: shop.id,
					title,
					description: '',
					groupId: categoryId,
					price: Math.round((price * factor) / 5) * 5,
					duration_minutes: minutes,
					is_active: true,
					requires_consultation: false,
					image: null,
					created_at: created(500),
					updated_at: created(120)
				});
			}
		});
		services.push({
			id: id(),
			shopId: shop.id,
			title: 'Coloration barbe',
			description: 'Sur rendez-vous.',
			groupId: null,
			price: shop.id === 19 ? 95 : 120,
			duration_minutes: 30,
			is_active: true,
			requires_consultation: false,
			image: null,
			created_at: created(200),
			updated_at: created(60)
		});
		services.push({
			id: id(),
			shopId: shop.id,
			title: 'Lissage',
			description: '',
			groupId: null,
			price: 250,
			duration_minutes: 60,
			is_active: false,
			requires_consultation: true,
			image: null,
			created_at: created(260),
			updated_at: created(90)
		});
	}

	// ------------------------------------------------------------------ agenda
	const agendas = {};
	for (const shop of shops) {
		agendas[shop.id] = [
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
			opening_time: i === 4 ? '14:30:00' : '10:00:00',
			closing_time: i >= 4 && i <= 5 ? '22:00:00' : '21:00:00',
			is_closed: i === 6
		}));
	}

	// ------------------------------------------------------------------ promos
	const promos = [];
	for (const shop of shops) {
		const menu = services.filter((s) => s.shopId === shop.id && s.is_active);
		const mk = (p) =>
			promos.push({
				id: id(),
				shopId: shop.id,
				description: '',
				usage_limit_per_user: null,
				total_usage_limit: null,
				minimum_spend: null,
				code: null,
				schedules: [],
				serviceIds: [],
				qrCodeId: null,
				created_at: created(p.age),
				updated_at: created(Math.max(1, p.age - 5)),
				...p
			});
		mk({
			name: 'Première visite',
			type: 'code',
			promo_nature: 'code',
			code: 'BIENVENUE',
			behavior: 'exclusive',
			discount_type: 'percentage',
			discount_value: 20,
			is_active: true,
			usage_limit_per_user: 1,
			total_usage_limit: 500,
			valid_from: created(90),
			valid_until: addDays(now, 60).toISOString(),
			age: 90
		});
		mk({
			name: 'Vendredi soir',
			type: 'shop',
			promo_nature: 'schedule',
			behavior: 'stackable',
			discount_type: 'percentage',
			discount_value: 15,
			is_active: true,
			serviceIds: menu.slice(0, 4).map((s) => s.id),
			schedules: [{ weekday: 4, start_time: '18:00:00', end_time: '22:00:00' }],
			age: 40
		});
		mk({
			name: 'Viens avec un ami',
			type: 'code',
			promo_nature: 'code',
			code: 'DUO',
			behavior: 'stackable',
			discount_type: 'fixed',
			discount_value: 30,
			is_active: true,
			minimum_spend: '100.00',
			valid_from: created(20),
			valid_until: null,
			age: 20
		});
		mk({
			name: 'Barbe du mardi',
			type: 'shop',
			promo_nature: 'constant',
			behavior: 'exclusive',
			discount_type: 'fixed',
			discount_value: 10,
			is_active: true,
			serviceIds: menu.filter((s) => s.groupId === 11).map((s) => s.id),
			age: 30
		});
		mk({
			name: 'Ramadan',
			type: 'code',
			promo_nature: 'code',
			code: 'RAMADAN',
			behavior: 'exclusive',
			discount_type: 'percentage',
			discount_value: 10,
			is_active: false,
			valid_from: created(260),
			valid_until: created(230),
			age: 260
		});
	}
	for (const p of promos) p.schedules = p.schedules.map((s) => ({ id: id(), ...s }));

	// ---------------------------------------------------------------- bookings
	const bookings = [];
	const DAY_LOAD = [0.75, 0.8, 0.85, 0.95, 0.7, 1.25, 0]; // Monday..Sunday, closed on Sunday
	const nowMs = now.getTime();
	for (const shop of shops) {
		const team = barbers.filter((b) => b.shopId === shop.id);
		const menu = services.filter((s) => s.shopId === shop.id && s.is_active);
		const shopPromos = promos.filter((p) => p.shopId === shop.id && p.is_active);
		const clientPool = shop.id === 19 ? clients.slice(100) : clients.slice(0, 120);
		for (let dayOffset = -182; dayOffset <= 14; dayOffset++) {
			const day = startOfDay(addDays(now, dayOffset));
			const weekday = (day.getDay() + 6) % 7;
			const load =
				DAY_LOAD[weekday] * (shop.id === 19 ? 0.5 : 1) * (0.85 + 0.15 * ((dayOffset + 182) / 196));
			if (!load) continue;
			for (const barber of team) {
				if (!barber.is_available && dayOffset === 0) continue;
				const count = Math.round(load * (4 + r() * 4) * (dayOffset > 0 ? 0.55 : 1));
				let minute = (weekday === 4 ? 14 * 60 + 30 : 10 * 60) + Math.round(r() * 40);
				for (let k = 0; k < count; k++) {
					const two = r() < 0.18;
					const chosen = two
						? [pick(menu), pick(menu)].filter((s, i, a) => a.findIndex((x) => x.id === s.id) === i)
						: [pick(menu)];
					const duration = chosen.reduce((s, x) => s + x.duration_minutes, 0);
					const start = new Date(day);
					start.setMinutes(minute);
					minute += duration + 10 + Math.round(r() * 40);
					if (minute > 21 * 60) break;
					const end = new Date(start.getTime() + duration * 60000);
					let status;
					if (end.getTime() <= nowMs) {
						const x = r();
						status =
							x < barber.skill * 0.97
								? 'completed'
								: x < barber.skill * 0.97 + 0.07
									? 'cancelled'
									: 'no_show';
					} else if (start.getTime() <= nowMs) status = 'in_progress';
					else {
						const x = r();
						status =
							dayOffset <= 2 && x < 0.22
								? 'pending'
								: x > 0.97
									? 'reschedule_requested'
									: x > 0.92
										? 're-confirmed'
										: 'confirmed';
					}
					const original = chosen.reduce((s, x) => s + x.price, 0);
					const promo = r() < 0.13 && shopPromos.length ? pick(shopPromos) : null;
					const discount = promo
						? promo.discount_type === 'percentage'
							? Math.round((original * promo.discount_value) / 100)
							: Math.min(original, promo.discount_value)
						: 0;
					const client = pick(clientPool);
					const createdAt = new Date(start.getTime() - (1 + Math.round(r() * 120)) * 3600000);
					const b = {
						id: id(),
						shopId: shop.id,
						barberId: barber.id,
						clientId: client.id,
						serviceIds: chosen.map((s) => s.id),
						date: isoDate(day),
						start_time: isoTime(start),
						end_time: isoTime(end),
						duration,
						status,
						original_price: original,
						discount,
						price: original - discount,
						promoId: promo?.id ?? null,
						rating:
							status === 'completed' && r() < 0.35
								? Math.max(3, Math.min(5, Math.round(barber.skill * 5 + (r() - 0.45))))
								: null,
						created_at: createdAt.toISOString(),
						confirmed_at:
							status === 'pending'
								? null
								: new Date(createdAt.getTime() + 20 * 60000).toISOString(),
						started_at: ['completed', 'in_progress'].includes(status) ? start.toISOString() : null,
						completed_at: status === 'completed' ? end.toISOString() : null,
						cancellation: null,
						is_delayed: false,
						delay_count: 0,
						customer_delay_reported: false,
						client_notes: r() < 0.08 ? 'Pas trop court sur les côtés.' : '',
						barber_notes: '',
						offered_slots: []
					};
					if (status === 'cancelled') {
						const by = pick(['client', 'client', 'barber', 'system']);
						b.cancellation = {
							cancelled_by: by,
							cancelled_by_display: { client: 'Client', barber: 'Barber', system: 'System' }[by],
							cancellation_reason:
								by === 'system'
									? 'Not confirmed in time'
									: by === 'barber'
										? 'Barber unavailable'
										: 'Change of plans',
							cancelled_at: new Date(start.getTime() - 3 * 3600000).toISOString()
						};
					}
					bookings.push(b);
				}
			}
		}
	}
	// Where bookings leave their plan, so the dashboard has something to count:
	// requests left to expire, services started late, services that ran over.
	// Drawn from each booking's position, not from r(), so the rest of the
	// dataset stays what it was.
	const chance = (n, salt) => {
		let x = Math.imul((n + 1) ^ Math.imul(salt, 0x9e3779b1), 0x85ebca6b) >>> 0;
		x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
		return ((x ^ (x >>> 16)) >>> 0) / 2 ** 32;
	};
	bookings.forEach((b, i) => {
		const slack = 1 - (barbers.find((x) => x.id === b.barberId)?.skill ?? 0.9);
		const start = atTime(b.date, b.start_time).getTime();
		const end = atTime(b.date, b.end_time).getTime();
		if (b.status === 'cancelled' && b.cancellation?.cancelled_by === 'system') {
			// nobody answered the request in time
			b.status = 'expired';
			b.cancellation = null;
			b.confirmed_at = null;
		} else if (b.status === 'in_progress' && chance(i, 1) < 0.4) {
			// the client's time has come and "start" has not been pressed
			b.status = 'confirmed';
			b.started_at = null;
		} else if (b.status === 'completed' && nowMs - end < 30 * 60000 && chance(i, 2) < 0.5) {
			// still in the chair past the planned end
			b.status = 'in_progress';
			b.completed_at = null;
			b.rating = null;
		} else if (b.status === 'completed') {
			const late =
				chance(i, 3) < 0.04 + slack * 0.9
					? 6 + Math.round(chance(i, 4) * 19)
					: Math.round(chance(i, 4) * 4);
			const over =
				chance(i, 5) < 0.03 + slack * 0.6
					? 6 + Math.round(chance(i, 6) * 16)
					: Math.round(chance(i, 6) * 4) - 2;
			b.started_at = new Date(start + late * 60000).toISOString();
			b.completed_at = new Date(
				Math.min(nowMs, start + (late + b.duration + over) * 60000)
			).toISOString();
		}
	});
	bookings.forEach(
		(b, i) =>
			(b.booking_number = `BC${b.date.slice(2, 4)}${b.date.slice(5, 7)}-${String(i + 1).padStart(5, '0')}`)
	);

	// ------------------------------------------------------- payment periods
	// weekly commission periods: the last two are not due yet; Atlas has one
	// overdue and one under review; the rest are paid
	const periods = [];
	for (const shop of shops) {
		const weekStart = startOfDay(addDays(now, -((now.getDay() + 6) % 7)));
		for (let w = 1; w <= 12; w++) {
			const start = addDays(weekStart, -7 * w);
			const end = addDays(start, 6);
			const status =
				w === 1
					? 'PENDING'
					: shop.id === 12 && w === 3
						? 'OVERDUE'
						: shop.id === 12 && w === 2
							? 'PENDING_REVIEW'
							: 'PAID';
			periods.push({
				id: id(),
				shopId: shop.id,
				week_start: isoDate(start),
				week_end: isoDate(end),
				status,
				commission_rate: 10,
				due_date: isoDate(addDays(end, 7)),
				paid_at: status === 'PAID' ? addDays(end, 4).toISOString() : null,
				payment_method:
					status === 'PAID' || status === 'PENDING_REVIEW'
						? w % 2
							? 'wire_transfer'
							: 'cash'
						: null,
				invoice_number:
					status === 'PAID' ? `INV-${shop.id}-${isoDate(start).replace(/-/g, '')}` : null,
				created_at: addDays(end, 1).toISOString(),
				updated_at: addDays(end, 4).toISOString(),
				proof: null
			});
		}
	}

	// ---------------------------------------------------------------- QR codes
	const qrCodes = [];
	for (const p of promos.filter((x) => x.type === 'code' && x.is_active)) {
		if (p.code !== 'BIENVENUE') continue;
		const qr = {
			id: `0b6f${String(p.id).padStart(4, '0')}-6c1e-4f3a-9b2d-${String(p.shopId).padStart(12, '0')}`,
			promo: p.id,
			shopId: p.shopId,
			title: 'Affiche vitrine',
			description: 'QR code en vitrine',
			max_scans: 1000,
			current_scans: 0,
			valid_from: p.valid_from,
			valid_until: p.valid_until,
			is_active: true,
			created_at: created(60),
			scans: []
		};
		for (let d = 59; d >= 0; d--) {
			const n = Math.round(r() * 4);
			for (let k = 0; k < n; k++)
				qr.scans.push({
					date: isoDate(addDays(now, -d)),
					result: pick([
						'success',
						'success',
						'success',
						'success',
						'expired',
						'invalid',
						'limit_reached',
						'user_not_found'
					]),
					user: pick(clients).id
				});
		}
		qr.current_scans = qr.scans.length;
		p.qrCodeId = qr.id;
		qrCodes.push(qr);
	}

	return {
		now,
		manager,
		otherManagers,
		shops,
		barbers,
		freeBarbers,
		clients,
		categories,
		categoryOrders,
		services,
		agendas,
		promos,
		bookings,
		periods,
		qrCodes,
		newId: id
	};
}
