// npm run dev
//
// With API_URL set (in the environment or in .env.local), the dashboard runs
// against that backend. Without it, the local development API starts first:
// the same contract on a generated dataset, so every page has data and
// nothing touches production.
//
// The local API's sign-in is kept in .env.development.local (never committed),
// created on the first run.
import { randomBytes } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer, loadEnv } from 'vite';

const root = new URL('..', import.meta.url);
const env = loadEnv('development', fileURLToPath(root), '');
const read = (name) => process.env[name] || env[name];

if (!read('API_URL')) {
	const file = new URL('.env.development.local', root);
	let email = read('DEV_USER_EMAIL');
	let password = read('DEV_USER_PASSWORD');
	if (!email || !password) {
		email = email || 'owner@barberchat.test';
		password = password || randomBytes(9).toString('base64url');
		if (!existsSync(file)) writeFileSync(file, `DEV_USER_EMAIL=${email}\nDEV_USER_PASSWORD=${password}\n`);
	}
	const { startLocalApi } = await import('../dev/local-api/server.mjs');
	const api = await startLocalApi({ port: Number(read('LOCAL_API_PORT')) || 8790, email, password, quiet: true });
	process.env.API_URL = `http://127.0.0.1:${api.port}`;
	console.log(`\n  Local API on ${process.env.API_URL}`);
	console.log(`  Sign in with ${email} and the password in .env.development.local`);
} else {
	process.env.API_URL = read('API_URL');
	console.log(`\n  API: ${process.env.API_URL}`);
}

const server = await createServer();
await server.listen();
server.printUrls();
