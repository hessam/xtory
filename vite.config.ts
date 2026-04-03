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
        onwarn(warning, warn) {
          if (warning.code === 'CIRCULAR_DEPENDENCY') console.warn(warning.message);
          warn(warning);
        },
        output: {
          // Content-hash filenames for permanent cache busting
          entryFileNames: 'assets/[name]-[hash].js',
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash].[ext]',
          manualChunks: {
            // Core React runtime
            'vendor-react': ['react', 'react-dom'],
            // Map engine and GIS tools
            'vendor-map': ['leaflet', 'react-leaflet', '@turf/turf'],
            // Animation engine
            'vendor-motion': ['motion'],
            // Heavy intro morphing libs (now dynamically loaded)
            'vendor-intro': ['flubber', 'd3'],
            // AI description and markdown rendering
            'vendor-ai-content': ['react-markdown', 'remark-gfm'],
            // Onboarding tour
            'vendor-tour': ['react-joyride'],
            // Large utility/UI components
            'vendor-ui': ['react-virtuoso', 'react-zoom-pan-pinch'],
          },
        },
      },
    },
  };
});
