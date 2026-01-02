
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Charge toutes les variables d'environnement du répertoire courant
  // @ts-ignore: process.cwd() is valid in Node context but types might be missing
  const env = loadEnv(mode, (process as any).cwd(), '');

  // FILTRAGE DE SÉCURITÉ :
  // On ne transmet au client (process.env) QUE les variables préfixées par VITE_
  // Cela empêche la fuite accidentelle de clés serveurs (comme SUPABASE_SERVICE_ROLE_KEY ou API_KEY)
  const clientEnv = Object.keys(env).reduce((acc, key) => {
    if (key.startsWith('VITE_')) {
      acc[key] = env[key];
    }
    return acc;
  }, {} as Record<string, string>);

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
      sourcemap: false,
      minify: 'esbuild',
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom', 'react-is'],
            'vendor-ui': ['lucide-react', 'recharts'],
            'vendor-utils': ['jspdf', 'html2canvas', '@google/genai', '@supabase/supabase-js']
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
