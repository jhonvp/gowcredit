import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { SECURITY_HEADERS } from './security-headers';

const proxy = {
  '/api': { target: process.env.API_PROXY_TARGET ?? 'http://api:3000', changeOrigin: true },
};

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Other containers (playwright, smoke) reach Vite by service name; Vite 8 rejects unknown hosts.
    allowedHosts: ['web', 'localhost'],
    // In Docker the API is reachable by service name; the browser only talks to Vite.
    proxy,
  },
  // The production build with the production headers (CSP etc.), for e2e: see security-headers.ts.
  preview: {
    port: 4173,
    allowedHosts: ['web-preview', 'localhost'],
    proxy,
    headers: SECURITY_HEADERS,
  },
});
