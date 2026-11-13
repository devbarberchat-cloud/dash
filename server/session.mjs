// The session lives in three httpOnly cookies: the backend's access and
// refresh tokens, and the profile the backend returned at sign-in (shown in the
// account menu; it grants nothing). The browser never reads the tokens.

export const ACCESS_COOKIE = 'access_token';
export const REFRESH_COOKIE = 'refresh_token';
export const USER_COOKIE = 'bc_user';

// The backend's token lifetimes: one hour and seven days.
export const ACCESS_MAX_AGE = 60 * 60;
export const REFRESH_MAX_AGE = 60 * 60 * 24 * 7;

export function parseCookies(header = '') {
	const out = {};
	for (const part of header.split(';')) {
		const eq = part.indexOf('=');
		if (eq === -1) continue;
		const name = part.slice(0, eq).trim();
		try {
			out[name] = decodeURIComponent(part.slice(eq + 1).trim());
		} catch {
			// a cookie we did not write: ignore it
		}
	}
	return out;
}

export function cookie(name, value, maxAge, secure) {
	return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}

export const expiredCookies = (secure) => [ACCESS_COOKIE, REFRESH_COOKIE, USER_COOKIE].map((name) => cookie(name, '', 0, secure));

/**
 * Seconds until a JWT expires, read from its payload without checking the
 * signature (the backend checks it on every call). null when the token is not
 * a readable JWT.
 */
export function secondsUntilExpiry(token, now = Date.now()) {
	const payload = token.split('.')[1];
	if (!payload) return null;
	try {
		const { exp } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
		return typeof exp === 'number' ? exp - Math.floor(now / 1000) : null;
	} catch {
		return null;
	}
}

export function profileFrom(user) {
	if (!user || typeof user !== 'object') return null;
	return {
		email: String(user.email ?? ''),
		firstName: String(user.first_name ?? ''),
		lastName: String(user.last_name ?? ''),
		username: String(user.username ?? '')
	};
}

export function readProfile(raw) {
	if (!raw) return null;
	try {
		const value = JSON.parse(raw);
		return typeof value?.email === 'string'
			? { email: value.email, firstName: String(value.firstName ?? ''), lastName: String(value.lastName ?? ''), username: String(value.username ?? '') }
			: null;
	} catch {
		return null;
	}
}
