// JWT endpoints, as djoser/simplejwt expose them.
import { HttpError } from '../http.mjs';

export function registerAuth(router, state) {
	router.add(
		'POST',
		'/api/auth/jwt/create/',
		({ body }) => {
			const { email, password } = body || {};
			if (!email || !password)
				throw new HttpError(400, {
					email: email ? undefined : ['This field is required.'],
					password: password ? undefined : ['This field is required.']
				});
			if (
				String(email).toLowerCase() !== state.credentials.email.toLowerCase() ||
				password !== state.credentials.password
			) {
				throw new HttpError(401, { detail: 'No active account found with the given credentials' });
			}
			const m = state.data.manager;
			return {
				...state.issueTokens(m.id),
				user: {
					id: m.id,
					email: m.email,
					username: m.username,
					first_name: m.first_name,
					last_name: m.last_name,
					role: m.role,
					is_authorized: true
				}
			};
		},
		{ auth: false }
	);

	router.add(
		'POST',
		'/api/auth/jwt/verify/',
		({ body }) => {
			if (!state.isValidAccess(body?.token))
				throw new HttpError(401, {
					detail: 'Token is invalid or expired',
					code: 'token_not_valid'
				});
			return {};
		},
		{ auth: false }
	);

	router.add(
		'POST',
		'/api/auth/jwt/refresh/',
		({ body }) => {
			const access = state.refreshAccess(body?.refresh);
			if (!access)
				throw new HttpError(401, {
					detail: 'Token is invalid or expired',
					code: 'token_not_valid'
				});
			return { access };
		},
		{ auth: false }
	);
}
