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

  // 1. MAPPING API KEY (Google GenAI)
  const apiKey = env.VITE_API_KEY || env.VITE_PUBLIC_API_KEY || env.API_KEY;
  if (apiKey) {
    clientEnv['API_KEY'] = apiKey;
  }
  if (env.GEMINI_API_KEY) {
    clientEnv['GEMINI_API_KEY'] = env.GEMINI_API_KEY;
  }

  // 2. MAPPING SUPABASE (Compatibilité Vercel/Supabase env vars)
  if (!clientEnv['VITE_SUPABASE_URL'] && env.SUPABASE_URL) {
    clientEnv['VITE_SUPABASE_URL'] = env.SUPABASE_URL;
  }
  if (!clientEnv['VITE_SUPABASE_ANON_KEY'] && (env.SUPABASE_ANON_KEY || env.SUPABASE_KEY)) {
    clientEnv['VITE_SUPABASE_ANON_KEY'] = env.SUPABASE_ANON_KEY || env.SUPABASE_KEY;
  }

  // Ajout critique : NODE_ENV pour la compatibilité des libs React
  clientEnv['NODE_ENV'] = mode;

  return {
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
        workbox: {
          maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5 MB
        },
        manifest: {
          name: 'LotoPro Platinum Elite',
          short_name: 'LotoPro',
          description: 'Intelligence Cognitive pour Loterie',
          theme_color: '#0f172a',
          background_color: '#0f172a',
          display: 'standalone',
          icons: [
            {
              src: 'pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png'
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png'
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any maskable'
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
            'vendor-core': ['@google/genai', '@supabase/supabase-js', '@tanstack/react-query']
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