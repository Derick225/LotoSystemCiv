import { useEffect, useState, useRef } from 'react';
import { useNexusStore } from '../store/useNexusStore';
import { workerService } from '../services/workerService';
import { lotteryService } from '../services/lotteryService';
import { getAlgoWeights } from '../services/prediction/weightsManager';
import { initializeLcgForDraw } from '../utils/mathUtils';

export interface WarmupState {
  isWarmedUp: boolean;
  isWarming: boolean;
  warmupLatencyMs: number | null;
  warmedDrawName: string | null;
  error: string | null;
}

/**
 * Hook 'Warmup' pour l'Inférence Neurale (Neural Engine Connection Warmup)
 * S'exécute dès que la séquence de démarrage (BootSequence) se termine (isBooted = true).
 *
 * Actions de Warmup :
 * 1. Initialise et pré-chauffe le Web Worker local (`workerService.warmup`) pour éviter toute latence d'instanciation.
 * 2. Pré-charge les poids algorithmiques optimisés (`getAlgoWeights`).
 * 3. Pré-charge l'historique du tirage actif dans le cache SWR (`lotteryService.fetchHistory`).
 * 4. Initialise le générateur LCG déterministe pour le tirage actif (`initializeLcgForDraw`).
 *
 * @param isBooted Indicateur de fin de la BootSequence
 * @returns WarmupState
 */
export function useNeuralWarmup(isBooted: boolean): WarmupState {
  const currentDrawName = useNexusStore((state) => state.drawName) || "Loto 5/90";
  const [warmupState, setWarmupState] = useState<WarmupState>({
    isWarmedUp: false,
    isWarming: false,
    warmupLatencyMs: null,
    warmedDrawName: null,
    error: null,
  });

  const warmupTriggeredRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isBooted) return;

    // Ne ré-exécuter que si le tirage actif a changé et n'a pas encore été réchauffé
    if (warmupTriggeredRef.current === currentDrawName && warmupState.isWarmedUp) {
      return;
    }

    let isMounted = true;
    warmupTriggeredRef.current = currentDrawName;

    const executeWarmup = async () => {
      const startTime = performance.now();
      if (isMounted) {
        setWarmupState((prev) => ({ ...prev, isWarming: true, error: null }));
      }

      try {
        // 1. Initialisation LCG déterministe (synchronous, very fast)
        initializeLcgForDraw(currentDrawName);

        // 2. Concurrently execute asynchronous warmup tasks to minimize cumulative latency
        await Promise.all([
          workerService.warmup(currentDrawName).catch(() => null),
          getAlgoWeights(currentDrawName).catch(() => null),
          lotteryService.fetchHistory(currentDrawName).catch(() => null)
        ]);

        const latency = Math.round(performance.now() - startTime);

        if (isMounted) {
          setWarmupState({
            isWarmedUp: true,
            isWarming: false,
            warmupLatencyMs: Math.max(1, latency),
            warmedDrawName: currentDrawName,
            error: null,
          });
          console.info(`[NEURAL WARMUP] Moteur pré-chauffé avec succès pour '${currentDrawName}' en ${latency}ms.`);
        }
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        if (isMounted) {
          setWarmupState({
            isWarmedUp: false,
            isWarming: false,
            warmupLatencyMs: null,
            warmedDrawName: currentDrawName,
            error: errorMsg,
          });
          console.warn(`[NEURAL WARMUP] Échec du pré-chauffage pour '${currentDrawName}':`, errorMsg);
        }
      }
    };

    executeWarmup();

    return () => {
      isMounted = false;
    };
  }, [isBooted, currentDrawName]);

  return warmupState;
}
