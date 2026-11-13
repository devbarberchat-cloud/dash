// Calls to the BarberChat API. They go to this origin (/api/...), where the
// server adds the signed-in user's token (see server/handler.mjs).
import { currentLocale, t, type MessageKey } from '@/i18n';

/** Field errors as Django REST framework sends them: { field: ['message'] }. */
export type FieldErrors = Record<string, string[]>;

const NOT_FIELDS = ['detail', 'message', 'error', 'non_field_errors', 'code'];

export class ApiError extends Error {
	constructor(
		readonly status: number,
		/** The parsed JSON body, or null. */
		readonly body: unknown
	) {
		super(`Request failed (${status})`);
		this.name = 'ApiError';
	}

	private get record(): Record<string, unknown> | null {
		return this.body && typeof this.body === 'object' && !Array.isArray(this.body) ? (this.body as Record<string, unknown>) : null;
	}

	/** Our server's own reason: session_expired, unreachable, server... */
	get code(): string | null {
		const code = this.record?.code;
		return typeof code === 'string' ? code : null;
	}

	/** The backend's message, when it sent one. It is already in the user's language. */
	get detail(): string | null {
		const record = this.record;
		if (record) {
			for (const key of ['detail', 'message', 'error']) {
				const value = record[key];
				if (typeof value === 'string' && value.trim()) return value;
			}
			const general = record.non_field_errors;
			if (Array.isArray(general) && typeof general[0] === 'string') return general[0];
		}
		if (Array.isArray(this.body) && typeof this.body[0] === 'string') return this.body[0];
		return null;
	}

	get fieldErrors(): FieldErrors | null {
		const record = this.record;
		if (!record) return null;
		const fields: FieldErrors = {};
		for (const [key, value] of Object.entries(record)) {
			if (NOT_FIELDS.includes(key)) continue;
			if (Array.isArray(value) && value.every((v) => typeof v === 'string')) fields[key] = value as string[];
			else if (typeof value === 'string') fields[key] = [value];
		}
		return Object.keys(fields).length ? fields : null;
	}

	/** The first message for a field, to show under that input. */
	field(name: string): string | undefined {
		return this.fieldErrors?.[name]?.[0];
	}
}

function statusMessage(status: number): MessageKey {
	if (status === 401) return 'serverErrors.sessionExpired';
	if (status === 403) return 'serverErrors.forbidden';
	if (status === 404) return 'serverErrors.notFound';
	if (status === 409) return 'serverErrors.conflict';
	if (status === 429) return 'serverErrors.tooMany';
	if (status === 408 || status === 504) return 'serverErrors.timeout';
	if (status === 503) return 'serverErrors.unreachable';
	if (status >= 500) return 'serverErrors.server';
	return 'serverErrors.invalid';
}

/** What to tell the user about any error thrown by a request. */
export function errorText(error: unknown): string {
	if (!(error instanceof ApiError)) return t('serverErrors.unreachable');
	if (error.status === 401 || error.status >= 500) return t(statusMessage(error.status));
	const firstField = error.fieldErrors ? Object.values(error.fieldErrors)[0]?.[0] : null;
	return error.detail ?? firstField ?? t(statusMessage(error.status));
}

type Query = Record<string, string | number | boolean | null | undefined>;

export function queryString(query: Query = {}) {
	const params = new URLSearchParams();
	for (const [key, value] of Object.entries(query)) {
		if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
	}
	const text = params.toString();
	return text ? `?${text}` : '';
}

let onSessionEnd: () => void = () => {};
/** Called once by the session layer: what to do when the server says the session is over. */
export function whenSessionEnds(handler: () => void) {
	onSessionEnd = handler;
}

export interface RequestOptions {
	method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
	query?: Query;
	/** A plain object is sent as JSON; FormData as it is. */
	body?: FormData | object;
	signal?: AbortSignal;
}

async function send(path: string, { method = 'GET', query, body, signal }: RequestOptions = {}): Promise<Response> {
	const form = body instanceof FormData;
	const res = await fetch(`${path}${queryString(query)}`, {
		method,
		signal,
		credentials: 'same-origin',
		headers: {
			Accept: 'application/json',
			'Accept-Language': currentLocale(),
			...(body && !form ? { 'Content-Type': 'application/json' } : {})
		},
		body: body ? (form ? body : JSON.stringify(body)) : undefined
	});
	if (res.ok) return res;
	const type = res.headers.get('content-type') ?? '';
	const parsed = type.includes('application/json') ? await res.json().catch(() => null) : null;
	if (res.status === 401 && !path.startsWith('/session')) onSessionEnd();
	throw new ApiError(res.status, parsed);
}

/** JSON from the API. Throws ApiError when the answer is not 2xx. */
export async function request<T>(path: string, options?: RequestOptions): Promise<T> {
	const res = await send(path, options);
	if (res.status === 204) return undefined as T;
	const text = await res.text();
	return (text ? JSON.parse(text) : undefined) as T;
}

/** Fetches a file from the API and saves it under its own name. */
export async function download(path: string, fallbackName: string, options?: RequestOptions) {
	const res = await send(path, options);
	const disposition = res.headers.get('content-disposition') ?? '';
	const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
	const url = URL.createObjectURL(await res.blob());
	const link = document.createElement('a');
	link.href = url;
	link.download = match?.[1] ? decodeURIComponent(match[1]) : fallbackName;
	document.body.append(link);
	link.click();
	link.remove();
	// the browser needs a moment to start the download before the file is released
	setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** A media path from the API ("/media/logos/x.png") as an address the browser can load. */
export function mediaUrl(path: string | null | undefined): string | null {
	if (!path) return null;
	const trimmed = path.trim();
	if (/^(https?:|blob:|data:)/.test(trimmed)) return trimmed;
	return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}
