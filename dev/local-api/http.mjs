// Small HTTP toolkit for the local development API: a router with path
// parameters, JSON and multipart bodies, and bearer-token checks.
import { createHmac, randomBytes } from 'node:crypto';

export class HttpError extends Error {
	constructor(status, body) {
		super(typeof body === 'string' ? body : JSON.stringify(body));
		this.status = status;
		this.body = typeof body === 'string' ? { detail: body } : body;
	}
}

export const notFound = (what = 'Not found.') => new HttpError(404, { detail: what });
export const badRequest = (fields) => new HttpError(400, fields);

/** A route table: add('GET', '/api/auth/shops/:shopId/staff/', handler). */
export function createRouter() {
	const routes = [];
	const add = (method, pattern, handler, { auth = true } = {}) => {
		const keys = [];
		const source = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/:(\w+)/g, (_, k) => {
			keys.push(k);
			return '([^/]+)';
		});
		routes.push({ method, re: new RegExp(`^${source}$`), keys, handler, auth });
	};
	const match = (method, path) => {
		let pathMatched = false;
		for (const r of routes) {
			const m = r.re.exec(path);
			if (!m) continue;
			pathMatched = true;
			if (r.method !== method) continue;
			const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
			return { route: r, params };
		}
		return pathMatched ? { methodNotAllowed: true } : null;
	};
	return { add, match, routes };
}

export async function readBody(req) {
	const chunks = [];
	for await (const c of req) chunks.push(c);
	const buf = Buffer.concat(chunks);
	const type = req.headers['content-type'] || '';
	if (!buf.length) return {};
	if (type.includes('application/json')) {
		try {
			return JSON.parse(buf.toString('utf8'));
		} catch {
			throw badRequest({ detail: 'JSON parse error.' });
		}
	}
	if (type.includes('multipart/form-data')) return parseMultipart(buf, type);
	if (type.includes('application/x-www-form-urlencoded'))
		return Object.fromEntries(new URLSearchParams(buf.toString('utf8')));
	return { raw: buf };
}

/** Text fields as strings; files as { filename, contentType, data }. */
function parseMultipart(buf, type) {
	const boundary = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(type);
	if (!boundary) throw badRequest({ detail: 'Missing multipart boundary.' });
	const marker = Buffer.from(`--${boundary[1] || boundary[2]}`);
	const out = {};
	let start = buf.indexOf(marker);
	while (start !== -1) {
		const next = buf.indexOf(marker, start + marker.length);
		if (next === -1) break;
		const part = buf.subarray(start + marker.length + 2, next - 2); // skip CRLF after marker, before next
		const headEnd = part.indexOf('\r\n\r\n');
		if (headEnd !== -1) {
			const head = part.subarray(0, headEnd).toString('utf8');
			const body = part.subarray(headEnd + 4);
			const name = /name="([^"]+)"/i.exec(head)?.[1];
			const filename = /filename="([^"]*)"/i.exec(head)?.[1];
			const ct = /content-type:\s*([^\r\n]+)/i.exec(head)?.[1];
			if (name) {
				const value =
					filename !== undefined
						? { filename, contentType: ct || 'application/octet-stream', data: Buffer.from(body) }
						: body.toString('utf8');
				if (name in out) out[name] = [].concat(out[name], value);
				else out[name] = value;
			}
		}
		start = next;
	}
	return out;
}

export function send(res, status, body, headers = {}) {
	if (status === 204) {
		res.writeHead(204, headers);
		return res.end();
	}
	if (Buffer.isBuffer(body)) {
		res.writeHead(status, headers);
		return res.end(body);
	}
	const json = JSON.stringify(body);
	res.writeHead(status, {
		'Content-Type': 'application/json',
		'Content-Length': Buffer.byteLength(json),
		...headers
	});
	res.end(json);
}

export const token = () => randomBytes(24).toString('base64url');

// Tokens shaped like the backend's (Simple JWT, HS256), so the dashboard can
// read their expiry the same way. Signed with a secret that lives for one run.
const secret = randomBytes(32);
const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
export function jwt(payload) {
	const head = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ ...payload, jti: token() })}`;
	const signature = createHmac('sha256', secret).update(head).digest('base64url');
	return `${head}.${signature}`;
}

/** Pagination in the backend's DRF style: { count, next, previous, results }. */
export function paginateDrf(items, query, basePath, defaultSize = 20) {
	const pageSize = Math.max(1, Math.min(200, Number(query.page_size) || defaultSize));
	const page = Math.max(1, Number(query.page) || 1);
	const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
	const url = (p) => {
		const q = new URLSearchParams({ ...query, page: String(p), page_size: String(pageSize) });
		return `${basePath}?${q}`;
	};
	return {
		count: items.length,
		next: page < totalPages ? url(page + 1) : null,
		previous: page > 1 ? url(page - 1) : null,
		results: items.slice((page - 1) * pageSize, page * pageSize),
		page,
		page_size: pageSize,
		total_pages: totalPages
	};
}
