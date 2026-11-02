import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  security: { checkOrigin: true },
  devToolbar: { enabled: false },
  server: { host: true },
  // never inline scripts into pages: the CSP only allows script files from our own origin
  vite: { build: { assetsInlineLimit: 0 } },
});
