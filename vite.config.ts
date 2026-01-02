
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Charge les variables d'environnement du répertoire courant
  const env = loadEnv(mode, '.', '');

  return {
    plugins: [react()],
    // Expose les variables d'environnement au code client via `process.env`
    // Use JSON.stringify for define values to ensure they are valid expressions
    define: {
      'process.env': JSON.stringify(env)
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
