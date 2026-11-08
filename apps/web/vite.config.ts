import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Other containers (playwright, smoke) reach Vite by service name; Vite 8 rejects unknown hosts.
    allowedHosts: ['web', 'localhost'],
    // In Docker the API is reachable by service name; the browser only talks to Vite.
    proxy: {
      '/api': { target: process.env.API_PROXY_TARGET ?? 'http://api:3000', changeOrigin: true },
    },
  },
});
