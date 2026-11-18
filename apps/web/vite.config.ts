import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: process.env.BASE_PATH ?? '/airgap-pdf/',
  plugins: [
    react(),
    {
      name: 'dev-csp-style-hmr',
      apply: 'serve',
      transformIndexHtml(html) {
        return html.replace("style-src 'self';", "style-src 'self' 'unsafe-inline';");
      },
    },
    VitePWA({
      registerType: 'prompt',
      manifest: {
        name: 'Airgap PDF',
        short_name: 'Airgap',
        description: 'PDF tools that keep working with the Wi-Fi switched off.',
        theme_color: '#0C0E0D',
        background_color: '#0C0E0D',
        display: 'standalone',
        icons: [
          {
            src: 'icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      },
    }),
  ],
  worker: {
    format: 'es',
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
        },
      },
    },
  },
});
