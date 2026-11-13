// In-memory state of the local API: the dataset, issued tokens and the
// lookups every route needs.
import { HttpError, jwt } from './http.mjs';

// Lifetimes in seconds; LOCAL_API_ACCESS_TTL lets tests exercise the refresh.
const ACCESS_TTL = Number(process.env.LOCAL_API_ACCESS_TTL) || 60 * 60;
const REFRESH_TTL = 7 * 24 * 60 * 60;
const now = () => Math.floor(Date.now() / 1000);

export function createState(data, credentials) {
	const access = new Map(); // token -> { userId, exp }
	const refresh = new Map(); // token -> { userId, exp }
	const live = (map, t) => {
		const entry = map.get(t);
		return entry && entry.exp > now() ? entry : null;
	};
	const issue = (map, userId, ttl, type) => {
		const exp = now() + ttl;
		const t = jwt({ token_type: type, exp, iat: now(), user_id: userId });
		map.set(t, { userId, exp });
		return t;
	};

	const users = () => [
		data.manager,
		...data.otherManagers,
		...data.barbers,
		...data.freeBarbers,
		...data.clients
	];

	return {
		data,
		credentials,
		users,
		userById: (id) => users().find((u) => u.id === Number(id)) || null,
		issueTokens(userId) {
			return {
				access: issue(access, userId, ACCESS_TTL, 'access'),
				refresh: issue(refresh, userId, REFRESH_TTL, 'refresh')
			};
		},
		refreshAccess(r) {
			const entry = live(refresh, r);
			return entry ? issue(access, entry.userId, ACCESS_TTL, 'access') : null;
		},
		isValidAccess: (a) => Boolean(live(access, a)),
		userForAccess(a) {
			const entry = live(access, a);
			return entry ? users().find((u) => u.id === entry.userId) || null : null;
		},
		/** The salon, if it exists; 404 otherwise, as the backend does. */
		shop(shopId) {
			const shop = data.shops.find((s) => s.id === Number(shopId));
			if (!shop) throw new HttpError(404, { detail: 'Shop not found.' });
			return shop;
		},
		team: (shopId) => data.barbers.filter((b) => b.shopId === Number(shopId)),
		bookingsOf: (shopId) => data.bookings.filter((b) => b.shopId === Number(shopId)),
		service: (id) => data.services.find((s) => s.id === Number(id)) || null,
		promo(shopId, promoId) {
			const p = data.promos.find((x) => x.id === Number(promoId) && x.shopId === Number(shopId));
			if (!p) throw new HttpError(404, { detail: 'Promo not found.' });
			return p;
		}
	};
}
