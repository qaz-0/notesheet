import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { VitePWA } from 'vite-plugin-pwa'
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // base: '/notesheet/',
  server: {
    host: '0.0.0.0', // or '0.0.0.0' to expose on all interfaces
    port: 5173, // optional: specify a custom port
    allowedHosts: [
      "localhost",
      "dev.nitbit.dev",
      "notesheet-api.nitbit.workers.dev"
    ]
  },
  base: '/',
  plugins: [
    tailwindcss(),
    svelte(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Notesheet',
        short_name: 'Notesheet',
        // start_url: '/notesheet',
        start_url: '/',
        description: 'Notebook + spreadsheet',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#3b82f6',
        icons: [
          {
            src: 'icon2_192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: 'icon2_512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ]
})