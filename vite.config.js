import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon-192.png", "icon-512.png"],
      manifest: false, // usamos o manifest.json externo em /public
      // Sem runtimeCaching para /api: a regra antiga (regex ancorada em
      // pathname) nunca casava com url.href no Workbox — e cachear o GET de
      // transactions seria perigoso de verdade: um snapshot stale servido do
      // cache seguido de um save (PUT do array inteiro) regravaria dados
      // antigos por cima dos atuais.
    }),
  ],
  server: {
    port: 5173,
  },
  build: {
    rollupOptions: {
      output: {
        // Split the charting stack (recharts + its d3/victory internals —
        // roughly half the bundle) and the React runtime into their own
        // chunks. App code changes then invalidate only the small app chunk
        // in the PWA precache, and the browser fetches the three in
        // parallel. (True lazy-loading of charts would require extracting
        // the chart components from the App.jsx monolith — deferred.)
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (/recharts|victory-vendor|[\\/]d3-|internmap|delaunator|robust-predicates/.test(id)) {
            return "charts";
          }
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) {
            return "react";
          }
          return undefined;
        },
      },
    },
  },
});
