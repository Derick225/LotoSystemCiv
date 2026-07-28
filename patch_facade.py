import re

with open('services/prediction/predictionFacade.ts', 'r') as f:
    content = f.read()

# Replace runLocalPredictionPipeline calls inside try/catch of runLocalPredictionViaWorker
old_worker_fallback = """          try {
            return await runLocalPredictionViaWorker(context);
          } catch (workerErr) {
            logger.warn(
              { drawName: context.drawName, error: workerErr instanceof Error ? workerErr.message : String(workerErr) },
              "[predictionFacade] Échec du Web Worker de prédiction locale. Basculement sur le thread principal pour Local Complet."
            );
            return await runLocalPredictionPipeline(context);
          }
        } else {
          return await runLocalPredictionPipeline(context);
        }"""

new_worker_fallback = """          try {
            return await runLocalPredictionViaWorker(context);
          } catch (workerErr) {
            logger.error(
              { drawName: context.drawName, error: workerErr instanceof Error ? workerErr.message : String(workerErr) },
              "[predictionFacade] Échec du Web Worker de prédiction locale. AUCUN basculement sur le thread principal pour éviter les freezes."
            );
            throw workerErr;
          }
        } else {
            logger.warn("[predictionFacade] Web Workers non supportés, passage direct au Local Simplifié.");
            throw new Error("Web Workers non supportés");
        }"""

content = content.replace(old_worker_fallback, new_worker_fallback)

with open('services/prediction/predictionFacade.ts', 'w') as f:
    f.write(content)
