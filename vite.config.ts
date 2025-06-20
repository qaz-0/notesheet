import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { VitePWA } from 'vite-plugin-pwa'
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  base: '/notesheet/',
  plugins: [
    tailwindcss(),
    svelte(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Notesheet',
        short_name: 'Notesheet',
        start_url: '/notesheet',
        description: 'Notebook + spreadsheet',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#3b82f6',
        icons: [
          {
            src: 'favicon.png',
            sizes: '16x16',
            type: 'image/png'
          },
        ]
      }
    })
  ]
})