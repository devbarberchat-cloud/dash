import { defineConfig, type Connect, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { createHandler } from './server/handler.mjs';

// The session and API handler, mounted on the dev and preview servers. It is
// the same code `server/index.mjs` runs in production. `npm run dev` sets
// API_URL (see scripts/dev.mjs).
function backend(): Plugin {
	const mount = (middlewares: Connect.Server) => {
		const apiUrl = process.env.API_URL;
		if (!apiUrl) throw new Error('API_URL is not set. Start the app with `npm run dev`.');
		const handle = createHandler({ apiUrl });
		middlewares.use((req, res, next) => {
			handle(req, res).then((done) => done || next(), next);
		});
	};
	return {
		name: 'barberchat-backend',
		configureServer: (server) => mount(server.middlewares),
		configurePreviewServer: (server) => mount(server.middlewares)
	};
}

export default defineConfig({
	plugins: [react(), backend()],
	resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
	server: { port: 5174 }
});
