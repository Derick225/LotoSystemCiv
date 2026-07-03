/// <reference lib="webworker" />

import { generateForensicReport } from "../forensicAuditService";

self.onmessage = (e: MessageEvent) => {
    const { taskId, actualWinners, history } = e.data;
    try {
        const result = generateForensicReport(actualWinners, history);
        self.postMessage({ taskId, success: true, result });
    } catch (error) {
        self.postMessage({ taskId, success: false, error: error instanceof Error ? error.message : String(error) });
    }
};
