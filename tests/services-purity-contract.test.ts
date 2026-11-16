import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { runSimulationCore } from '../src/services/simulationCore';
import * as predictionEngine from '../src/services/prediction/predictionFacade';
import { getDefaultWeights } from '../src/services/prediction/weightsManager';
import { echoStateNetworkPlugin } from '../src/services/prediction/algorithms/echoState';
import {
  calculateSpectralMetricsAsync,
  calculateCorrelationMatrixAsync,
} from '../src/services/mathService';
import { extractDrawAlgorithmicParameters } from '../src/services/prediction/strictValidationService';
import { DrawResult } from '../src/types';

function collectTsFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTsFiles(full));
    } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

const buildDrawHistory = (drawName: string, count: number): DrawResult[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `${drawName}-${i}`,
    drawName,
    date: `2026-03-${String(Math.max(1, 28 - i)).padStart(2, '0')}`,
    gagnants: [
      ((i * 3 + 1) % 90) + 1,
      ((i * 5 + 12) % 90) + 1,
      ((i * 7 + 23) % 90) + 1,
      ((i * 11 + 34) % 90) + 1,
      ((i * 13 + 45) % 90) + 1,
    ],
    machine: [],
  }));

describe('Services Store-Decoupling & Worker Purity Contract', () => {
  it('1. Aucun fichier dans src/services ne doit importer ou appeler useNexusStore', () => {
    const servicesRoot = path.resolve(process.cwd(), 'src/services');
    const files = collectTsFiles(servicesRoot);
    const offenders: string[] = [];

    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      const codeLines = content
        .split('\n')
        .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'));
      if (codeLines.some((line) => /\buseNexusStore\b/.test(line))) {
        offenders.push(path.relative(process.cwd(), file));
      }
    }

    expect(offenders).toEqual([]);
  });

  it('2. runSimulationCore propage explicitement temporalDepth, isForensicOptimized et useSpatioTemporalHawkes', async () => {
    const spy = vi.spyOn(predictionEngine, 'generateMasterPrediction').mockResolvedValue({
      suggestedNumbers: [2, 14, 28, 49, 77],
      candidates: [2, 14, 28, 49, 77, 81],
      breakdown: {},
      confidence: 68,
      analysis: 'contract-test',
      timestamp: 0,
    });

    const weights = getDefaultWeights();
    const history = buildDrawHistory('NATIONAL', 14);

    await runSimulationCore({
      drawName: 'NATIONAL',
      history,
      weights,
      depth: 2,
      strategy: 'FLAT',
      temporalDepth: 75,
      isForensicOptimized: true,
      useSpatioTemporalHawkes: true,
    });

    expect(spy).toHaveBeenCalledTimes(2);
    const firstCall = spy.mock.calls[0];
    expect(firstCall[0]).toBe('NATIONAL');
    expect(firstCall[2]).toBe(75);
    expect(firstCall[9]).toBe(true);
    expect(firstCall[12]).toBe(true);

    spy.mockRestore();
  });

  it('3. echoStateNetworkPlugin est 100% déterministe sans store React actif', () => {
    const history = buildDrawHistory('ESPOIR', 25);
    const ctx = {
      drawName: 'ESPOIR',
      history,
      statisticalBounds: { shannonEntropy: 3.4 },
    } as any;

    const resA = echoStateNetworkPlugin.precompute?.(ctx);
    const resB = echoStateNetworkPlugin.precompute?.(ctx);
    expect(resA).toEqual(resB);
  });

  it('4. mathService applique strictement la garde expectedDrawName et rejette les historiques hétérogènes', async () => {
    const national = buildDrawHistory('NATIONAL', 15);
    const espoir = buildDrawHistory('ESPOIR', 15);

    const okSpec = await calculateSpectralMetricsAsync(national, 'NATIONAL');
    expect(Array.isArray(okSpec)).toBe(true);
    expect(okSpec.length).toBeGreaterThan(0);

    const mismatched = await calculateSpectralMetricsAsync(national, 'ESPOIR');
    expect(mismatched).toEqual([]);

    const mixed = [...national.slice(0, 5), ...espoir.slice(0, 5)];
    const rejectedMixed = await calculateCorrelationMatrixAsync(mixed);
    expect(rejectedMixed).toEqual({});
  });

  it('5. extractDrawAlgorithmicParameters accepte la configuration runtime explicite sans lire de store global', async () => {
    const history = buildDrawHistory('NATIONAL', 20);
    const weights = getDefaultWeights();

    const params = await extractDrawAlgorithmicParameters('NATIONAL', history, false, {
      weights,
      temporalDepth: 60,
      isForensicOptimized: true,
      useSpatioTemporalHawkes: true,
    });

    expect(params.drawName).toBe('NATIONAL');
    expect(params.temporalDepth).toBe(60);
    expect(params.isForensicOptimized).toBe(true);
    expect(params.useSpatioTemporalHawkes).toBe(true);
  });
});
