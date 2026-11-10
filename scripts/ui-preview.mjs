import { createServer } from 'vite';
import solid from 'vite-plugin-solid';
import { fileURLToPath } from 'node:url';
const server = await createServer({ configFile: false, root: fileURLToPath(new URL('./ui-preview', import.meta.url)),
  plugins: [solid()], server: { host: '127.0.0.1', port: 5176, strictPort: true,
    fs: { allow: [fileURLToPath(new URL('..', import.meta.url))] } } });
await server.listen(); server.printUrls();
for (const name of ['SIGINT', 'SIGTERM']) process.on(name, async () => { await server.close(); process.exit(0); });
