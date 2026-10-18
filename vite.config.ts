import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  preview: {
    // Spike A only: lets the Cloudflare quick tunnel's random hostname
    // through Vite's host-check so a real Android phone can reach it.
    allowedHosts: ['.trycloudflare.com'],
  },
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      // Spike A: served over HTTPS + installed, this is what proves (or
      // disproves) that Android's share sheet can hand data to the app.
      manifest: {
        name: 'CepDost',
        short_name: 'CepDost',
        description: 'Kaydettiğin şey nihayet işe yarasın.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#FBF8F4',
        theme_color: '#FF5A3C',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        ],
        share_target: {
          action: '/share-target/',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: {
            title: 'title',
            text: 'text',
            url: 'url',
            files: [{ name: 'images', accept: ['image/*'] }],
          },
        },
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png}'],
      },
    }),
  ],
})
