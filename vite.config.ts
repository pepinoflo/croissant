import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';
import { splashEntries } from './scripts/splash-devices.mjs';

/** iOS launch images: one <link> per device size and orientation. */
const splashLinks = splashEntries()
  .map((s: { file: string; media: string }) => `<link rel="apple-touch-startup-image" href="./${s.file}" media="${s.media}" />`)
  .join('\n    ');

// Relative base so the same build works at https://<user>.github.io/<repo>/ and locally.
export default defineConfig({
  base: './',
  build: {
    // iPads that can no longer be updated should still run the app.
    target: ['es2020', 'safari14'],
  },
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [
    preact(),
    {
      name: 'croissant-splash-links',
      transformIndexHtml: (html) => html.replace('<!--splash-links-->', splashLinks),
    },
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'icons/*.png', 'img/**/*.svg'],
      manifest: {
        name: 'Croissant — French review',
        short_name: 'Croissant',
        description: 'Five minutes of French a day, made from your own class notes.',
        lang: 'en',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'any',
        background_color: '#F6EEDF',
        theme_color: '#F6EEDF',
        categories: ['education'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,svg,png,webmanifest}'],
        globIgnores: ['splash/**'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
