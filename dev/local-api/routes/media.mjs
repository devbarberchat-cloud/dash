// /media/...: files uploaded through the dashboard (logos, covers, service
// images) are kept in memory and served back from here.
import { readdirSync, readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { HttpError } from '../http.mjs';

const TYPES = { '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png' };
const DEMO = new URL('../media/', import.meta.url);

export function registerMedia(router, state) {
	state.media = state.media || new Map();
	// the photos the dataset refers to (a logo, a cover, the barbers' portraits)
	for (const name of readdirSync(DEMO)) {
		state.media.set(`/media/demo/${name}`, {
			data: readFileSync(new URL(name, DEMO)),
			contentType: TYPES[extname(name)] || 'application/octet-stream'
		});
	}
	state.saveUpload = (file, folder = 'uploads') => {
		if (!file || !file.data) return null;
		const safe = String(file.filename || 'file').replace(/[^\w.-]+/g, '_');
		const path = `/media/${folder}/${Date.now()}_${safe}`;
		state.media.set(path, file);
		return path;
	};
	router.add(
		'GET',
		'/media/:folder/:name',
		({ params }) => {
			const file = state.media.get(`/media/${params.folder}/${params.name}`);
			if (!file) throw new HttpError(404, { detail: 'Not found.' });
			return {
				__raw: true,
				status: 200,
				body: file.data,
				headers: { 'Content-Type': file.contentType, 'Cache-Control': 'no-store' }
			};
		},
		{ auth: false }
	);
}
