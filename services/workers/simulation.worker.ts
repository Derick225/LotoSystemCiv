import { runSimulationCore, SimulationConfig } from "../simulationCore";

const ctx = self as unknown as Worker;

ctx.onmessage = async (e: MessageEvent) => {
  try {
    const config = e.data as SimulationConfig;

    // 1. Validation déterministe et stricte des paramètres d'entrée
    if (!config || !config.history || !Array.isArray(config.history) || config.history.length === 0) {
      throw new Error("Historique manquant ou invalide pour la simulation.");
    }
    if (!config.depth || config.depth <= 0) {
      throw new Error("La profondeur de simulation doit être strictement positive.");
    }
    if (!config.weights || typeof config.weights !== 'object') {
      throw new Error("Les poids des algorithmes (weights) sont requis et doivent être un objet.");
    }

    // 2. Injection d'un callback de progression déterministe
    config.onProgress = (percent: number) => {
      // Clamp mathématique pour garantir [0, 100]
      const safePercent = Math.min(100, Math.max(0, Math.round(percent)));
      ctx.postMessage({ type: 'progress', percent: safePercent });
    };

    // 3. Exécution du cœur de simulation
    const report = await runSimulationCore(config);

    // 4. Résultat final
    ctx.postMessage({ type: 'progress', percent: 100 });
    ctx.postMessage({ type: 'result', report });
    
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    ctx.postMessage({ 
      type: 'error', 
      error: `Simulation Worker Error: ${errorMessage}` 
    });
  }
};
