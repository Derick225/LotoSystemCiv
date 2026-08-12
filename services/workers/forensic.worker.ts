/// <reference lib="webworker" />

import { generateForensicReport } from "../forensicAuditService";
import { unpackHistory } from "./zeroCopy";
import type { DrawResult } from "../../types";

self.onmessage = (e: MessageEvent) => {
    const { taskId, actualWinners, history, historyBuffer, drawCount, winningCount, totalCols } = e.data;
    try {
        const hist = (historyBuffer ? unpackHistory(historyBuffer, drawCount, winningCount, totalCols) : unpackHistory(history)) as DrawResult[];
        const result = generateForensicReport(actualWinners, hist);
        self.postMessage({ taskId, success: true, result });
    } catch (error) {
        self.postMessage({ taskId, success: false, error: error instanceof Error ? error.message : String(error) });
    }
};
