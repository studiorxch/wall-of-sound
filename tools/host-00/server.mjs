// HOST-00 only. No application Vite config, Firebase, or production routing.
import { createServer } from '../../music/node_modules/vite/dist/node/index.js';
import { readFile, appendFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
const tone = Buffer.alloc(44 + 48000 * 120 * 2);
tone.write('RIFF'); tone.writeUInt32LE(tone.length - 8, 4); tone.write('WAVEfmt ', 8);
tone.writeUInt32LE(16, 16); tone.writeUInt16LE(1, 20); tone.writeUInt16LE(1, 22);
tone.writeUInt32LE(48000, 24); tone.writeUInt32LE(96000, 28); tone.writeUInt16LE(2, 32);
tone.writeUInt16LE(16, 34); tone.write('data', 36); tone.writeUInt32LE(tone.length - 44, 40);
for (let n = 0; n < 48000 * 120; n++) tone.writeInt16LE(Math.round(1800 * Math.sin(n * 2 * Math.PI * 220 / 48000)), 44 + n * 2);
const server = await createServer({ configFile: false, root, envFile: false, optimizeDeps: { noDiscovery: true, entries: [] },
  server: { host: '127.0.0.1', port: 5199, strictPort: true },
  plugins: [{ name: 'host-00-loopback-routes', configureServer(vite) {
    vite.middlewares.use(async (req, res, next) => {
      const path = new URL(req.url, 'http://127.0.0.1:5199').pathname;
      if (path === '/evidence' && req.method === 'POST') {
        let body = ''; for await (const chunk of req) body += chunk;
        await appendFile('/tmp/host-00-browser-evidence.ndjson', body + '\n');
        res.end('ok'); return;
      }
      if (path === '/tone.wav') { res.setHeader('Content-Type', 'audio/wav'); res.end(tone); return; }
      const file = ['/wall-app/', '/blackbook.html'].includes(path) ? 'parent.html' : path === '/surface.html' ? 'child.html' : null;
      if (!file) return next();
      try { const html = await readFile(new URL(file, import.meta.url), 'utf8');
        res.setHeader('Content-Type', 'text/html'); res.setHeader('Cache-Control', 'no-store');
        res.end(await vite.transformIndexHtml(req.url, html));
      } catch (error) { next(error); }
    });
  }}] });
await server.listen();
console.log('HOST-00 ONLY http://127.0.0.1:5199/wall-app/');
