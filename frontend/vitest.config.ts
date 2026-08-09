import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'jsdom',
    // Node's experimental global localStorage conflicts with jsdom's isolated
    // implementation and emits a warning in every worker.
    execArgv: ['--no-experimental-webstorage'],
    environmentOptions: {
      jsdom: { url: 'http://localhost/' },
    },
    exclude: ['dist/**', 'node_modules/**'],
  },
  resolve: {
    alias: { '@': new URL('./src', import.meta.url).pathname },
  },
});
