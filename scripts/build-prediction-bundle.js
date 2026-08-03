import esbuild from 'esbuild';
import path from 'path';

esbuild.build({
  entryPoints: ['services/prediction/denoEntry.ts'],
  bundle: true,
  platform: 'neutral',
  format: 'esm',
  target: 'es2022',
  outfile: 'supabase/functions/predict-elite/predictionEngine.bundle.js',
  plugins: [{
    name: 'stub-resolver',
    setup(build) {
      build.onResolve({ filter: /prediction\.worker/ }, args => {
        return { path: path.resolve('services/prediction/workerStub.ts') };
      });
      build.onResolve({ filter: /useNexusStore/ }, args => {
        return { path: path.resolve('services/prediction/storeStub.ts') };
      });
      build.onResolve({ filter: /postPredictionAnalysisService/ }, args => {
        return { path: path.resolve('services/prediction/postPredictionAnalysisStub.ts') };
      });
      build.onResolve({ filter: /utils\/logger/ }, args => {
        return { path: path.resolve('services/prediction/loggerStub.ts') };
      });
      build.onResolve({ filter: /supabaseClient/ }, args => {
        return { path: path.resolve('services/prediction/supabaseClientStub.ts') };
      });
      build.onResolve({ filter: /apiClient/ }, args => {
        return { path: path.resolve('services/prediction/apiClientStub.ts') };
      });
    }
  }]
}).then(() => {
  console.log('✅ Prediction engine bundled successfully for Deno!');
}).catch((err) => {
  console.error('❌ Bundling failed:', err);
  process.exit(1);
});
