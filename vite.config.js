import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    tailwindcss(),
  ],
  build: {
    // Static assets (gallery/, hero-video/, icons/) live in public/ and are
    // copied verbatim, so they resolve identically in dev and prod.
    assetsInlineLimit: 4096,
    cssCodeSplit: true,
    rollupOptions: {
      input: {
        main: 'index.html',
        funnel: 'funnel.html',
      },
    },
  },
})