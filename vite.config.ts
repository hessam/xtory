import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import { compression } from 'vite-plugin-compression2';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  const isProd = mode === 'production';

  return {
    plugins: [
      react(),
      tailwindcss(),
      // Pre-compress all assets with Brotli (primary) and Gzip (fallback).
      // Vercel serves .br files automatically when Accept-Encoding: br is present.
      ...(isProd
        ? [
            compression({ algorithms: ['brotliCompress'], exclude: [/\.(br)$/, /\.(gz)$/] }),
            compression({ algorithms: ['gzip'], exclude: [/\.(br)$/, /\.(gz)$/] }),
          ]
        : []),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // `npm run dev:api` serves /api/* locally (AI proxy + fact engine)
      proxy: { '/api': 'http://localhost:8787' },
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
    build: {
      // Raise the chunk warning threshold since we're intentionally splitting
      chunkSizeWarningLimit: 600,
      sourcemap: true,
      rollupOptions: {
        onwarn(warning, warn) {
          if (warning.code === 'CIRCULAR_DEPENDENCY') console.warn(warning.message);
          warn(warning);
        },
        output: {
          // Content-hash filenames for permanent cache busting
          entryFileNames: 'assets/[name]-[hash].js',
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash].[ext]',
          manualChunks(id) {
            // ── React: catch ALL react sub-paths in one chunk ──────────────
            // Must use a function (not object) to match react/jsx-runtime,
            // react-dom/client, react/compiler etc. — object form only matches
            // the exact package entry and causes duplicate-React crashes.
            if (id.includes('node_modules/react/') ||
                id.includes('node_modules/react-dom/') ||
                id.includes('node_modules/scheduler/')) {
              return 'vendor-react';
            }
            // ── Map / GIS ──────────────────────────────────────────────────
            if (id.includes('node_modules/leaflet/') ||
                id.includes('node_modules/react-leaflet/') ||
                id.includes('node_modules/@turf/')) {
              return 'vendor-map';
            }
            // ── Animation (motion/react, framer internals) ─────────────────
            if (id.includes('node_modules/motion/')) {
              return 'vendor-motion';
            }
            // ── Board geometry libs (small; must NOT drag the intro chunk in) ──
            if (id.includes('node_modules/d3-geo/') ||
                id.includes('node_modules/d3-array/') ||
                id.includes('node_modules/d3-delaunay/') ||
                id.includes('node_modules/delaunator/') ||
                id.includes('node_modules/robust-predicates/')) {
              return 'vendor-board';
            }
            // ── Intro morph libs (dynamically imported — kept separate) ────
            if (id.includes('node_modules/flubber/') ||
                id.includes('node_modules/d3')) {
              return 'vendor-intro';
            }
            // ── AI / Markdown rendering ────────────────────────────────────
            if (id.includes('node_modules/react-markdown/') ||
                id.includes('node_modules/remark') ||
                id.includes('node_modules/rehype') ||
                id.includes('node_modules/micromark') ||
                id.includes('node_modules/mdast') ||
                id.includes('node_modules/unified')) {
              return 'vendor-ai-content';
            }
            // ── Tour ───────────────────────────────────────────────────────
            if (id.includes('node_modules/react-joyride/')) {
              return 'vendor-tour';
            }
            // ── Large UI utilities ─────────────────────────────────────────
            if (id.includes('node_modules/react-virtuoso/') ||
                id.includes('node_modules/react-zoom-pan-pinch/')) {
              return 'vendor-ui';
            }
          },
        },
      },
    },
  };
});
