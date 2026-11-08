import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';

export default defineConfig({
  output: 'static',
  // News is temporarily paused; keep its source in src/paused for restoration.
  redirects: { '/news': { status: 302, destination: '/' } },
  vite: {
    plugins: [tailwindcss()],
    server: { allowedHosts: ['terminal.local'] },
    // Keep bundled scripts external so the existing self-only CSP can run them.
    build: { assetsInlineLimit: 0 },
    define: {
      'import.meta.env.PUBLIC_SENTRY_ENVIRONMENT': JSON.stringify(process.env.VERCEL_ENV || 'development'),
      'import.meta.env.PUBLIC_SENTRY_RELEASE': JSON.stringify(process.env.VERCEL_GIT_COMMIT_SHA || ''),
    },
  },
});

