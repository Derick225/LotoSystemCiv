import { useState, useEffect, useRef } from 'react';
import { DrawResult } from '../types';
import type { FluxMathResult } from '../services/workers/fluxMath.worker';

const initialMetrics: FluxMathResult = {
  entropyStats: { entropy: 0, normalized: 0, maxEntropy: 0 },
  hurstStats: { hurst: 0.5, interpretation: 'Neutre', color: 'text-slate-400' },
  speedStats: { topoSpeed: 0, meanSum: 0, stdSum: 0 },
  spectrumStats: { raw: [], maxCount: 1, avgOcc: 0 },
  topCorrelations: [],
  trajectoryPoints: []
};

export const useFluxMath = (filteredHistory: DrawResult[]) => {
  const [metrics, setMetrics] = useState<FluxMathResult>(initialMetrics);
  const [isCalculating, setIsCalculating] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const currentReqIdRef = useRef<number>(0);

  useEffect(() => {
    // Initialize worker
    workerRef.current = new Worker(
      new URL('../services/workers/fluxMath.worker.ts', import.meta.url),
      { type: 'module' }
    );

    workerRef.current.onmessage = (e) => {
      if (e.data.type === 'METRICS_RESULT' && e.data.reqId === currentReqIdRef.current) {
        setMetrics(e.data.payload);
        setIsCalculating(false);
      }
    };

    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  useEffect(() => {
    if (workerRef.current && filteredHistory.length > 0) {
      setIsCalculating(true);
      const reqId = ++currentReqIdRef.current;
      const drawsLite = filteredHistory.map(d => ({
        gagnants: d.gagnants || [],
        date: d.date || ""
      }));

      workerRef.current.postMessage({
        type: 'CALCULATE_METRICS',
        reqId,
        payload: { draws: drawsLite }
      });
    } else if (filteredHistory.length === 0) {
      currentReqIdRef.current++;
      setMetrics(initialMetrics);
      setIsCalculating(false);
    }
  }, [filteredHistory]);

  return { metrics, isCalculating };
};
