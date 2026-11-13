// Local development API for the BarberChat dashboard.
//
// It implements the backend contract the dashboard's server code expects
// (src/lib/server/*), on a generated dataset, so the dashboard can be run,
// tested and screenshotted without touching the production backend.
// Development only: nothing in the product imports it.
//
//   node dev/local-api/server.mjs            # port 8788
//   LOCAL_API_PORT=9000 node dev/local-api/server.mjs
//
// Sign-in: the e-mail and password are read from DEV_USER_EMAIL and
// DEV_USER_PASSWORD, or generated and printed at start-up. None are committed.
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createRouter, HttpError, readBody, send } from './http.mjs';
import { buildDataset } from './data.mjs';
import { createState } from './state.mjs';
import { registerAuth } from './routes/auth.mjs';
import { registerShops } from './routes/shops.mjs';
import { registerBarbers } from './routes/barbers.mjs';
import { registerBookings } from './routes/bookings.mjs';
import { registerClients } from './routes/clients.mjs';
import { registerDashboard } from './routes/dashboard.mjs';
import { registerPayments } from './routes/payments.mjs';
import { registerServices } from './routes/services.mjs';
import { registerPromos } from './routes/promos.mjs';
import { registerAnalytics } from './routes/analytics.mjs';
import { registerMedia } from './routes/media.mjs';

export function startLocalApi({
	port = Number(process.env.LOCAL_API_PORT) || 8788,
	email,
	password,
	quiet = false
} = {}) {
	const credentials = {
		email: email || process.env.DEV_USER_EMAIL || 'owner@barberchat.test',
		password: password || process.env.DEV_USER_PASSWORD || randomBytes(9).toString('base64url')
	};
	const state = createState(buildDataset(new Date()), credentials);
	state.port = port;
	const router = createRouter();
	for (const register of [
		registerAuth,
		registerShops,
		registerBarbers,
		registerBookings,
		registerClients,
		registerDashboard,
		registerPayments,
		registerServices,
		registerPromos,
		registerAnalytics,
		registerMedia
	]) {
		register(router, state);
	}

	const server = createServer(async (req, res) => {
		const url = new URL(req.url, 'http://local');
		const started = Date.now();
		try {
			const found = router.match(req.method, url.pathname);
			if (!found) throw new HttpError(404, { detail: 'Not found.' });
			if (found.methodNotAllowed)
				throw new HttpError(405, { detail: `Method "${req.method}" not allowed.` });
			const { route, params } = found;
			let user = null;
			if (route.auth) {
				const header = req.headers.authorization || '';
				const access = header.startsWith('Bearer ') ? header.slice(7) : null;
				user = access ? state.userForAccess(access) : null;
				if (!user) throw new HttpError(401, { detail: 'Unauthorized', code: 'not_authenticated' });
			}
			const query = Object.fromEntries(url.searchParams);
			const body = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)
				? await readBody(req)
				: {};
			const result = await route.handler({ params, query, body, user, req, url });
			if (result && result.__raw)
				return send(res, result.status ?? 200, result.body, result.headers);
			if (result === undefined) return send(res, 204);
			send(res, result?.__status ?? 200, result?.__status ? result.body : result);
		} catch (err) {
			if (err instanceof HttpError) send(res, err.status, err.body);
			else {
				console.error('[local-api]', req.method, url.pathname, err);
				send(res, 500, { detail: 'Server error in the local API.' });
			}
		} finally {
			if (!quiet && process.env.LOCAL_API_LOG)
				console.log(
					`[local-api] ${req.method} ${url.pathname}${url.search} ${res.statusCode} ${Date.now() - started}ms`
				);
		}
	});

	return new Promise((resolve) => {
		server.listen(port, '127.0.0.1', () => {
			if (!quiet) {
				console.log(`[local-api] listening on http://127.0.0.1:${port}`);
				console.log(`[local-api] sign in with ${credentials.email} / ${credentials.password}`);
			}
			resolve({ server, port, credentials, close: () => new Promise((r) => server.close(r)) });
		});
	});
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) startLocalApi();
