import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5174,
    strictPort: true,
    proxy: { '/api': { target: 'http://127.0.0.1:4317' } },
  },
  test: { maxWorkers: 2, environment: 'jsdom', include: ['src/**/*.test.{ts,tsx}'] },
});
