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
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
    build: {
      // Raise the chunk warning threshold since we're intentionally splitting
      chunkSizeWarningLimit: 600,
      sourcemap: true,
      rollupOptions: {
        output: {
          // Manual chunk splitting: isolate heavy vendor libs for independent caching
          manualChunks(id) {
            // D3 is huge — isolate it completely
            if (id.includes('node_modules/d3') || id.includes('node_modules/d3-')) {
              return 'vendor-d3';
            }
            // Motion/Framer is heavy — isolate it
            if (id.includes('node_modules/motion') || id.includes('node_modules/framer-motion')) {
              return 'vendor-motion';
            }
            // Zoom/pan library — isolate it
            if (id.includes('node_modules/react-zoom-pan-pinch')) {
              return 'vendor-zoom';
            }
            // React core — always cached separately
            if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/')) {
              return 'vendor-react';
            }
            // React markdown + remark (only used in modals)
            if (
              id.includes('node_modules/react-markdown') ||
              id.includes('node_modules/remark') ||
              id.includes('node_modules/micromark') ||
              id.includes('node_modules/mdast') ||
              id.includes('node_modules/unified') ||
              id.includes('node_modules/hast')
            ) {
              return 'vendor-markdown';
            }
            // Lucide icons — tree-shaken but still a separate cache unit
            if (id.includes('node_modules/lucide-react')) {
              return 'vendor-lucide';
            }
            // React Joyride (tour) — rarely needed, load separately
            if (id.includes('node_modules/react-joyride')) {
              return 'vendor-joyride';
            }
            // Google Genai SDK — only used when API key is set
            if (id.includes('node_modules/@google/genai')) {
              return 'vendor-genai';
            }
            // Everything else in node_modules
            if (id.includes('node_modules')) {
              return 'vendor-misc';
            }
          },
          // Content-hash filenames for permanent cache busting
          entryFileNames: 'assets/[name]-[hash].js',
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash].[ext]',
        },
      },
    },
  };
});
