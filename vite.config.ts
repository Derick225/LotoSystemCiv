import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  // Charge toutes les variables d'environnement du répertoire courant
  // @ts-ignore: process.cwd() is valid in Node context
  const env = loadEnv(mode, process.cwd(), '');

  // FILTRAGE DE SÉCURITÉ :
  // On ne transmet au client (process.env) QUE les variables préfixées par VITE_
  const clientEnv = Object.keys(env).reduce((acc, key) => {
    if (key.startsWith('VITE_')) {
      acc[key] = env[key];
    }
    return acc;
  }, {} as Record<string, string>);

  // 1. MAPPING SUPABASE (Compatibilité Vercel/Supabase env vars)
  if (!clientEnv['VITE_SUPABASE_URL'] && env.SUPABASE_URL) {
    clientEnv['VITE_SUPABASE_URL'] = env.SUPABASE_URL;
  }
  if (!clientEnv['VITE_SUPABASE_ANON_KEY'] && (env.SUPABASE_ANON_KEY || env.SUPABASE_KEY)) {
    clientEnv['VITE_SUPABASE_ANON_KEY'] = env.SUPABASE_ANON_KEY || env.SUPABASE_KEY;
  }

  // Ajout critique : NODE_ENV pour la compatibilité des libs React
  clientEnv['NODE_ENV'] = mode;

  return {
    worker: {
      format: 'es'
    },
    plugins: [
      react(),
        VitePWA({
          registerType: 'autoUpdate',
          devOptions: {
            enabled: false
          },
          includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'icon.svg', 'pwa-64x64.png', 'pwa-192x192.png', 'pwa-512x512.png', 'maskable-icon-512x512.png'],
          workbox: {
            maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5 MB
            globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2,ttf,json}'],
            navigateFallback: '/index.html',
            runtimeCaching: [
              {
                urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
                handler: 'CacheFirst',
                options: {
                  cacheName: 'google-fonts-cache',
                  expiration: {
                    maxEntries: 10,
                    maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
                  },
                  cacheableResponse: {
                    statuses: [0, 200],
                  },
                },
              },
              {
                urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
                handler: 'CacheFirst',
                options: {
                  cacheName: 'gstatic-fonts-cache',
                  expiration: {
                    maxEntries: 10,
                    maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
                  },
                  cacheableResponse: {
                    statuses: [0, 200],
                  },
                },
              },
            ],
          },
          manifestFilename: 'manifest.json',
          manifest: {
            name: 'LotoPro',
            short_name: 'LotoPro',
            id: '/',
            start_url: '/',
            scope: '/',
            description: 'Système industriel de prédiction stochastique par ensemble de neurones pondérés.',
            theme_color: '#0f172a',
            background_color: '#0f172a',
            display: 'standalone',
            orientation: 'portrait',
            categories: ['finance', 'utilities', 'productivity'],
            icons: [
              {
                src: '/icon.svg',
                sizes: 'any',
                type: 'image/svg+xml',
                purpose: 'any maskable'
              },
              {
                src: '/pwa-64x64.png',
                sizes: '64x64',
                type: 'image/png',
                purpose: 'any'
              },
              {
                src: '/pwa-192x192.png',
                sizes: '192x192',
                type: 'image/png',
                purpose: 'any'
              },
              {
                src: '/pwa-512x512.png',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'any'
              },
              {
                src: '/maskable-icon-512x512.png',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'maskable'
              }
            ]
          }
        })
    ],
    // Expose les variables filtrées au code client via `process.env`
    define: {
      'process.env': JSON.stringify(clientEnv)
    },
    resolve: {
      alias: {
        '@': '/src'
      }
    },
    build: {
      outDir: 'dist',
      target: 'esnext',
      sourcemap: false,
      minify: 'esbuild',
      chunkSizeWarningLimit: 2000,
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom', 'react-is', 'framer-motion'],
            'vendor-ui': ['lucide-react', 'recharts', 'clsx', 'tailwind-merge'],
            'vendor-utils': ['jspdf', 'html2canvas'],
            'vendor-core': ['@google/genai', '@supabase/supabase-js', '@tanstack/react-query'],
            'vendor-heavy': ['@tensorflow/tfjs', 'three', '@react-three/fiber']
          }
        }
      }
    },
    server: {
      port: 3000,
      host: true
    }
  };
});