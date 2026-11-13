// What the dashboard needs from a server of its own: sign-in, sign-out, and a
// pass-through to the BarberChat API that adds the user's token. The same
// handler runs inside the Vite dev server and in `server/index.mjs`.
import { Readable } from 'node:stream';
import {
	ACCESS_COOKIE,
	ACCESS_MAX_AGE,
	REFRESH_COOKIE,
	REFRESH_MAX_AGE,
	USER_COOKIE,
	cookie,
	expiredCookies,
	parseCookies,
	profileFrom,
	readProfile,
	secondsUntilExpiry
} from './session.mjs';

/** Refresh when the access token has less than this many seconds left. */
const REFRESH_MARGIN = 60;
const LOGIN_BODY_LIMIT = 10_000;

/**
 * @param {{ apiUrl: string, secureCookies?: boolean }} options
 * @returns {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => Promise<boolean>}
 *   resolves to true when the request was answered here
 */
export function createHandler({ apiUrl, secureCookies = false }) {
	const backend = apiUrl.replace(/\/+$/, '');

	const json = (res, status, body, cookies) => {
		const text = JSON.stringify(body);
		res.writeHead(status, {
			'Content-Type': 'application/json; charset=utf-8',
			'Content-Length': Buffer.byteLength(text),
			'Cache-Control': 'no-store',
			...(cookies?.length ? { 'Set-Cookie': cookies } : {})
		});
		res.end(text);
	};

	const language = (req) => ({ 'Accept-Language': req.headers['accept-language'] || 'fr' });

	async function post(path, body, req) {
		return fetch(`${backend}${path}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', ...language(req) },
			body: JSON.stringify(body)
		});
	}

	/** A usable access token for this request, refreshed if needed; null when signed out. */
	async function resolveAccess(req) {
		const jar = parseCookies(req.headers.cookie);
		const access = jar[ACCESS_COOKIE] || null;
		const refresh = jar[REFRESH_COOKIE] || null;
		if (access) {
			const left = secondsUntilExpiry(access);
			if (left !== null && left > REFRESH_MARGIN) return { token: access, cookies: [] };
			if (left === null) {
				const verified = await post('/api/auth/jwt/verify/', { token: access }, req).catch(() => null);
				if (verified?.ok) return { token: access, cookies: [] };
			}
		}
		if (!refresh) return null;
		const renewed = await post('/api/auth/jwt/refresh/', { refresh }, req).catch(() => null);
		if (!renewed?.ok) return null;
		const { access: token } = await renewed.json();
		return typeof token === 'string' ? { token, cookies: [cookie(ACCESS_COOKIE, token, ACCESS_MAX_AGE, secureCookies)] } : null;
	}

	async function readJson(req) {
		const chunks = [];
		let size = 0;
		for await (const chunk of req) {
			size += chunk.length;
			if (size > LOGIN_BODY_LIMIT) return null;
			chunks.push(chunk);
		}
		try {
			return JSON.parse(Buffer.concat(chunks).toString('utf8'));
		} catch {
			return null;
		}
	}

	async function signIn(req, res) {
		const body = await readJson(req);
		const email = typeof body?.email === 'string' ? body.email.trim() : '';
		const password = typeof body?.password === 'string' ? body.password : '';
		if (!email || !password) return json(res, 400, { code: 'invalid' });

		const answer = await post('/api/auth/jwt/create/', { email, password }, req);
		if (answer.status === 400 || answer.status === 401) return json(res, 401, { code: 'wrong_credentials' });
		if (!answer.ok) return json(res, 502, { code: 'server' });

		const tokens = await answer.json();
		if (tokens.user?.is_authorized === false) return json(res, 403, { code: 'not_authorized' });
		const user = profileFrom(tokens.user);
		json(res, 200, { user }, [
			cookie(ACCESS_COOKIE, tokens.access, ACCESS_MAX_AGE, secureCookies),
			cookie(REFRESH_COOKIE, tokens.refresh, REFRESH_MAX_AGE, secureCookies),
			...(user ? [cookie(USER_COOKIE, JSON.stringify(user), REFRESH_MAX_AGE, secureCookies)] : [])
		]);
	}

	async function whoAmI(req, res) {
		const session = await resolveAccess(req);
		if (!session) return json(res, 401, { code: 'session_expired' }, expiredCookies(secureCookies));
		json(res, 200, { user: readProfile(parseCookies(req.headers.cookie)[USER_COOKIE]) }, session.cookies);
	}

	async function forward(req, res) {
		const session = await resolveAccess(req);
		if (!session) return json(res, 401, { code: 'session_expired' }, expiredCookies(secureCookies));

		const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
		const headers = { Authorization: `Bearer ${session.token}`, Accept: req.headers.accept || 'application/json', ...language(req) };
		if (hasBody && req.headers['content-type']) headers['Content-Type'] = req.headers['content-type'];

		const upstream = await fetch(`${backend}${req.url}`, {
			method: req.method,
			headers,
			body: hasBody ? Readable.toWeb(req) : undefined,
			duplex: hasBody ? 'half' : undefined,
			redirect: 'manual'
		});

		if (upstream.status === 401) return json(res, 401, { code: 'session_expired' }, expiredCookies(secureCookies));
		// a 5xx body can carry a stack trace: never pass it on
		if (upstream.status >= 500) {
			console.error('[api]', req.method, req.url, upstream.status);
			return json(res, 502, { code: 'server' }, session.cookies);
		}

		const out = { 'Cache-Control': 'no-store' };
		for (const name of ['content-type', 'content-disposition']) {
			const value = upstream.headers.get(name);
			if (value) out[name] = value;
		}
		if (session.cookies.length) out['Set-Cookie'] = session.cookies;
		res.writeHead(upstream.status, out);
		if (upstream.body) Readable.fromWeb(upstream.body).pipe(res);
		else res.end();
	}

	async function media(req, res, pathname) {
		if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { code: 'invalid' });
		// only plain media paths: no way out of /media on the backend
		if (decodeURIComponent(pathname).split('/').some((segment) => segment === '..' || segment === '.')) return json(res, 400, { code: 'invalid' });
		const session = await resolveAccess(req);
		if (!session) return json(res, 401, { code: 'session_expired' });

		const upstream = await fetch(`${backend}${pathname}`, { headers: { Authorization: `Bearer ${session.token}` }, redirect: 'manual' });
		if (!upstream.ok) return json(res, upstream.status === 404 ? 404 : 502, { code: 'not_found' });
		res.writeHead(200, {
			'Content-Type': upstream.headers.get('content-type') || 'application/octet-stream',
			'Cache-Control': 'private, max-age=86400',
			// files come from the backend as they are: never let one run script on this origin
			'Content-Security-Policy': "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox",
			'X-Content-Type-Options': 'nosniff',
			...(session.cookies.length ? { 'Set-Cookie': session.cookies } : {})
		});
		if (upstream.body && req.method === 'GET') Readable.fromWeb(upstream.body).pipe(res);
		else res.end();
	}

	/** A form on another site must not be able to act with the user's cookies. */
	function sameOrigin(req) {
		if (req.method === 'GET' || req.method === 'HEAD') return true;
		const origin = req.headers.origin;
		if (!origin) return true;
		try {
			return new URL(origin).host === req.headers.host;
		} catch {
			return false;
		}
	}

	return async function handle(req, res) {
		const pathname = (req.url || '/').split('?')[0];
		const isSession = pathname === '/session' || pathname.startsWith('/session/');
		const isApi = pathname.startsWith('/api/');
		const isMedia = pathname.startsWith('/media/');
		if (!isSession && !isApi && !isMedia) return false;

		try {
			if (!sameOrigin(req)) json(res, 403, { code: 'forbidden' });
			else if (isMedia) await media(req, res, pathname);
			else if (isApi) await forward(req, res);
			else if (pathname === '/session' && req.method === 'GET') await whoAmI(req, res);
			else if (pathname === '/session/login' && req.method === 'POST') await signIn(req, res);
			else if (pathname === '/session/logout' && req.method === 'POST') json(res, 200, { ok: true }, expiredCookies(secureCookies));
			else json(res, 404, { code: 'not_found' });
		} catch (error) {
			// fetch() rejects with a TypeError when the backend cannot be reached
			const unreachable = error instanceof TypeError;
			if (!unreachable) console.error('[api]', req.method, req.url, error);
			if (!res.headersSent) json(res, unreachable ? 503 : 500, { code: unreachable ? 'unreachable' : 'server' });
			else res.destroy();
		}
		return true;
	};
}
