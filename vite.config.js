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
});
