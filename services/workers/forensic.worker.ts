/// <reference lib="webworker" />

import { generateForensicReport } from "../forensicAuditService";
import { unpackHistory } from "./zeroCopy";
import type { DrawResult } from "../../types";

self.onmessage = (e: MessageEvent) => {
    const { taskId, actualWinners, history, historyBuffer, drawCount, winningCount, totalCols, predictionMatrix, algoWeights } = e.data;
    try {
        const hist = (historyBuffer ? unpackHistory(historyBuffer, drawCount, winningCount, totalCols) : unpackHistory(history)) as DrawResult[];
        // predictionMatrix/algoWeights sont optionnels : s'ils ne sont pas fournis,
        // generateForensicReport retombe sur ses valeurs par défaut (calibration
        // fallback, poids par défaut) et NE PEUT PAS comparer le tirage réel à la
        // vraie prédiction du modèle (voir generateForensicReport pour le détail).
        const result = generateForensicReport(
            actualWinners,
            hist,
            undefined,
            algoWeights,
            predictionMatrix
        );
        self.postMessage({ taskId, success: true, result });
    } catch (error) {
        self.postMessage({ taskId, success: false, error: error instanceof Error ? error.message : String(error) });
    }
};
