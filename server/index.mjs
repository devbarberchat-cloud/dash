// Production server: the built app from dist/, plus the session and API
// handler. Run `npm run build` first.
//
//   API_URL=https://api.example.com node server/index.mjs
//
// PORT defaults to 4174. Cookies are marked Secure unless COOKIE_SECURE=false
// (for a plain-http trial on a local machine).
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHandler } from './handler.mjs';

const apiUrl = process.env.API_URL;
if (!apiUrl) {
	console.error('API_URL is not set. Example: API_URL=https://api.example.com node server/index.mjs');
	process.exit(1);
}

const dist = resolve(fileURLToPath(new URL('../dist', import.meta.url)));
if (!existsSync(join(dist, 'index.html'))) {
	console.error('dist/index.html is missing. Run `npm run build` first.');
	process.exit(1);
}

const TYPES = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.json': 'application/json; charset=utf-8',
	'.svg': 'image/svg+xml',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.webp': 'image/webp',
	'.ico': 'image/x-icon',
	'.woff2': 'font/woff2'
};

const SECURITY = {
	'X-Content-Type-Options': 'nosniff',
	'X-Frame-Options': 'DENY',
	'Referrer-Policy': 'strict-origin-when-cross-origin',
	'Content-Security-Policy': [
		"default-src 'self'",
		"img-src 'self' data: blob: https:",
		"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
		"font-src 'self' https://fonts.gstatic.com",
		"frame-ancestors 'none'"
	].join('; ')
};

const handle = createHandler({ apiUrl, secureCookies: process.env.COOKIE_SECURE !== 'false' });

function serveFile(res, file, cache) {
	res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': cache, ...SECURITY });
	createReadStream(file).pipe(res);
}

const server = createServer(async (req, res) => {
	if (await handle(req, res)) return;
	if (req.method !== 'GET' && req.method !== 'HEAD') {
		res.writeHead(405, SECURITY);
		return res.end();
	}
	const pathname = decodeURIComponent((req.url || '/').split('?')[0]);
	const file = normalize(join(dist, pathname));
	if (file.startsWith(dist) && existsSync(file) && statSync(file).isFile()) {
		// Vite names built assets by their content: they never change
		return serveFile(res, file, pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache');
	}
	// every other address is a page of the app
	serveFile(res, join(dist, 'index.html'), 'no-cache');
});

const port = Number(process.env.PORT) || 4174;
server.listen(port, () => console.log(`BarberChat Pro on http://localhost:${port}`));
