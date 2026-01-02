
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Charge toutes les variables d'environnement du répertoire courant
  // @ts-ignore: process.cwd() is valid in Node context
  const env = loadEnv(mode, (process as any).cwd(), '');

  // FILTRAGE DE SÉCURITÉ :
  // On ne transmet au client (process.env) QUE les variables préfixées par VITE_
  const clientEnv = Object.keys(env).reduce((acc, key) => {
    if (key.startsWith('VITE_')) {
      acc[key] = env[key];
    }
    return acc;
  }, {} as Record<string, string>);

  // MAPPING SPÉCIFIQUE :
  // Permet d'utiliser process.env.API_KEY dans le code (standard Google GenAI SDK)
  // tout en utilisant VITE_API_KEY ou VITE_PUBLIC_API_KEY dans le .env
  let apiKey = env.VITE_API_KEY || env.VITE_PUBLIC_API_KEY;
  if (apiKey) {
    clientEnv['API_KEY'] = apiKey;
  }

  // Ajout critique : NODE_ENV pour la compatibilité des libs React
  clientEnv['NODE_ENV'] = mode;

  return {
    plugins: [react()],
    // Expose les variables filtrées au code client via `process.env`
    define: {
      'process.env': JSON.stringify(clientEnv)
    },
    resolve: {
      alias: {
        'react-is': 'react-is'
      }
    },
    build: {
      outDir: 'dist',
      target: 'esnext',
      sourcemap: false, // Désactivé pour la production (Sécurité & Taille)
      minify: 'esbuild', // Minification rapide et efficace
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
