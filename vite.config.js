import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    tailwindcss(),
  ],
  // Honour PORT so the harness (and any host that assigns a port) can place the
  // dev server anywhere; Vite does not read PORT on its own. Falls back to the
  // usual 5173 for a plain `npm run dev`.
  server: {
    port: Number(process.env.PORT) || 5173,
  },
  build: {
    // Static assets (gallery/, hero-video/, icons/) live in public/ and are
    // copied verbatim, so they resolve identically in dev and prod.
    assetsInlineLimit: 4096,
    cssCodeSplit: true,
    rollupOptions: {
      input: {
        main: 'index.html',
        funnel: 'funnel.html',
        estimate: 'estimate.html',
        admin: 'admin.html',
      },
    },
  },
})