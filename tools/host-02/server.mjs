// Local acceptance only. Existing Vite config/proxy; never inherits production Firebase credentials.
import { fileURLToPath } from 'node:url';
import { createServer } from '../../music/node_modules/vite/dist/node/index.js';
const root = fileURLToPath(new URL('../../music/', import.meta.url));
Object.assign(process.env, {
  WALL_ORIGIN: 'http://127.0.0.1:5222',
  VITE_FIREBASE_USE_EMULATORS: 'true',
  VITE_FIREBASE_API_KEY: 'demo-host02-key',
  VITE_FIREBASE_AUTH_DOMAIN: 'demo-host02.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'demo-host02',
  VITE_FIREBASE_STORAGE_BUCKET: 'demo-host02.invalid',
  VITE_FIREBASE_MESSAGING_SENDER_ID: '123456789',
  VITE_FIREBASE_APP_ID: 'demo-host02-app',
});
// Fail before serving if either explicitly loopback emulator is absent.
for (const url of ['http://127.0.0.1:9099/', 'http://127.0.0.1:8080/']) {
  await fetch(url, { signal: AbortSignal.timeout(2000) });
}
const server = await createServer({ root, configFile: `${root}/vite.config.ts`, envFile: false,
  server: { host: '127.0.0.1', port: 5220, strictPort: true },
  plugins: [{ name: 'host02-local-module-entries', configureServer(vite) {
    vite.middlewares.use((req, res, next) => {
      const paths = {
        '/assets/subway-member-runtime.js': '/src/member/subwayMemberRuntime.ts',
        '/assets/radio-channel-receiver-runtime.js': '/src/member/radioChannelReceiverRuntime.ts',
      };
      const target = paths[req.url?.split('?')[0]];
      if (!target) return next();
      res.writeHead(307, { Location: target }); res.end();
    });
  }}],
});
await server.listen();
console.log('HOST-02 emulator-only HOME: http://127.0.0.1:5220/home-dev.html?surface=map');
