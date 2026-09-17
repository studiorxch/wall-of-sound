import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 3000,
    open: true,
    // iPad + Apple Pencil LAN test access: binds the dev server to every
    // network interface (0.0.0.0), not just loopback, so a device on the
    // same LAN as this Mac (e.g. an iPad) can reach it. `npm run dev` still
    // prints and serves a `localhost` URL exactly as before -- this only
    // ADDS the LAN "Network:" URL to Vite's own startup output, it never
    // removes localhost access. No IP is hard-coded here; Vite resolves
    // the Mac's actual LAN address itself at startup and prints it.
    host: true
  },
  preview: {
    // Same reasoning as server.host above, for `vite preview` (the
    // production-build smoke test) -- kept in sync so LAN access works
    // identically whether testing the dev server or a built bundle.
    host: true
  }
});
