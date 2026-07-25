import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import { VitePWA } from 'vite-plugin-pwa';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // .env values are not on process.env — load them explicitly for the dev proxy.
  const env = loadEnv(mode, fileURLToPath(new URL('.', import.meta.url)), '');
  // Must match the backend's default PORT (3100).
  const proxyTarget = env.VITE_PROXY_TARGET || 'http://localhost:3100';

  return {
    plugins: [
      vue(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
        manifest: {
          name: 'Точка Ясности: рефлексивные арт-практики',
          short_name: 'Точка Ясности',
          description: 'Self-hosted платформа рефлексивных арт-практик и самоподдержки',
          theme_color: '#ffffff',
          icons: [
            {
              src: 'pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
            },
          ],
        },
        // Cache only build assets. Authenticated API responses can contain diary,
        // chat, health and profile data and must never be persisted by Workbox.
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,jpeg,jpg}'],
        },
      }),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
        },
        '/api-docs': {
          target: proxyTarget,
          changeOrigin: true,
        },
      },
    },
    // Mirror the dev proxy for `vite preview` so the production build can also
    // be exercised locally.
    preview: {
      proxy: {
        '/api': { target: proxyTarget, changeOrigin: true },
        '/api-docs': { target: proxyTarget, changeOrigin: true },
      },
    },
    build: {
      target: 'esnext',
    },
  };
});
