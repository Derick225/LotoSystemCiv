

// ------------------ aco.worker.ts ------------------

export {};
import { unpackHistory } from './zeroCopy';
import { initializeLotoEngineWasm, runAntColonyOptimizationHpc } from '../wasm/lotoEngineBridge';

/**
 * Nexus ACS Worker v7.0 (Rust / WASM HPC Ant Colony System)
 * Exécution 100% locale, vectorisée et déterministe (Zéro appel Cloud Supabase, Zéro GC).
 */

const ctx = self as unknown as Worker;

ctx.onmessage = async (e: MessageEvent) => {
    const { history, historyBuffer, drawCount, winningCount, totalCols, config } = e.data;
    const hist = historyBuffer ? unpackHistory(historyBuffer, drawCount, winningCount, totalCols) : unpackHistory(history);

    if (!hist || hist.length < 10) {
        ctx.postMessage({ error: "Historique insuffisant" });
        return;
    }

    try {
        await initializeLotoEngineWasm();

        const numDraws = hist.length;
        const winCols = 5;
        const flatHistory = new Int32Array(numDraws * winCols);
        for (let d = 0; d < numDraws; d++) {
            const g = hist[d].gagnants || [];
            for (let c = 0; c < winCols; c++) {
                flatHistory[d * winCols + c] = g[c] || 0;
            }
        }

        const dateStr = String((hist[0] as any)?.date || 'default');
        let seedHash = 2166136261;
        for (let i = 0; i < dateStr.length; i++) {
            seedHash ^= dateStr.charCodeAt(i);
            seedHash = Math.imul(seedHash, 16777619);
        }
        const seed = Math.abs(seedHash) + numDraws * 97;

        const hpcResult = runAntColonyOptimizationHpc({
            flatHistory,
            numDraws,
            winCols,
            antsCount: config?.antsCount ?? Math.floor(Math.sqrt(numDraws) * 10),
            generations: config?.generations ?? Math.floor(Math.log(numDraws + 1) * 20),
            alpha: config?.alpha ?? 1.5,
            beta: config?.beta ?? 1.5,
            rho: config?.rho ?? 0.1,
            q0: config?.q0 ?? 0.5,
            seed
        });

        ctx.postMessage({
            type: 'result',
            bestPath: {
                numbers: hpcResult.bestNumbers,
                pheromoneDensity: hpcResult.pheromoneDensity,
                confidence: hpcResult.confidence
            }
        });
    } catch (err: any) {
        ctx.postMessage({ error: err?.message || "Erreur interne Rust/WASM ACO Worker" });
    }
};
