/**
 * PONT D'INTÉGRATION HAUTE PERFORMANCE (HPC) - LOTO-ENGINE RUST/WASM
 * 
 * Assure la communication à vitesse native entre le Front-end React/Vite et le module Rust WebAssembly.
 * Implémente le pattern hybride avec basculement automatique sans crash :
 * 1. Accélération WASM Native (Rust + SIMD + Mémoire continue partagée Float64Array).
 * 2. Fallback déterministe C^∞ synchrone si le module WebAssembly n'est pas encore instancié.
 */

import { wasmMatrixEngine } from './wasmMatrixCore';

// Types d'interface pour le module WASM généré par wasm-pack
export interface WasmSpectralResult {
  energy: number;
  dominant_period: number;
  dominant_frequency: number;
  psd: Float64Array | number[];
}

export interface WasmHawkesResult {
  intensities: Float64Array;
  net_excitations: Float64Array;
  netExcitations: Float64Array;
  lag_excitations: Float64Array;
  lagExcitations: Float64Array;
  total_energy: number;
  totalEnergy: number;
}

let wasmModuleInstance: any = null;
let isWasmLoaded = false;
let wasmLoadPromise: Promise<boolean> | null = null;

/**
 * Initialise le module WebAssembly généré par wasm-pack.
 * Compatible avec le chargement dynamique asynchrone Vite / PWA.
 */
export async function initializeLotoEngineWasm(): Promise<boolean> {
  if (isWasmLoaded) return true;
  if (wasmLoadPromise) return wasmLoadPromise;

  wasmLoadPromise = (async () => {
    try {
      // Import dynamique du module compilé par wasm-pack (target web)
      // @ts-ignore - Le module compilé réside dans le dossier pkg après `wasm-pack build --target web`
      const wasm = await import('../../../crates/loto-engine/pkg/loto_engine.js').catch(() => null);

      if (wasm && typeof wasm.default === 'function') {
        if (typeof window !== 'undefined') {
          // Contexte Navigateur PWA : chargement via fetch('/loto_engine_bg.wasm') ou URL relative
          try {
            await wasm.default('/loto_engine_bg.wasm');
          } catch {
            await wasm.default();
          }
        } else {
          // Contexte Node.js / Vitest / SSR
          try {
            const fs = await import('fs');
            const path = await import('path');
            const wasmPath = path.resolve(process.cwd(), 'crates/loto-engine/pkg/loto_engine_bg.wasm');
            if (fs.existsSync(wasmPath)) {
              const buffer = fs.readFileSync(wasmPath);
              if (typeof wasm.initSync === 'function') {
                wasm.initSync({ module: buffer });
              } else {
                await wasm.default({ module: buffer });
              }
            } else {
              await wasm.default();
            }
          } catch {
            await wasm.default();
          }
        }
        wasmModuleInstance = wasm;
        isWasmLoaded = true;
        console.info('[LOTO-ENGINE] Module Rust/WASM initialisé avec succès (Accélération HPC active).');
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('loto-engine-wasm-ready', { detail: { mode: 'RUST_WASM' } }));
        }
        return true;
      }
    } catch (err) {
      console.warn('[LOTO-ENGINE] Module WASM non encore compilé ou inaccessible, fallback déterministe actif :', err);
    }
    isWasmLoaded = false;
    return false;
  })();

  return wasmLoadPromise;
}

export function isLotoEngineWasmReady(): boolean {
  return isWasmLoaded;
}

export function getHpcEngineMode(): 'RUST_WASM' | 'SIMD_FALLBACK' {
  return isWasmLoaded ? 'RUST_WASM' : 'SIMD_FALLBACK';
}

export const initLotoEngineWasm = initializeLotoEngineWasm;

let wasmFallbackCount = 0;

export function getWasmFallbackCount(): number {
  return wasmFallbackCount;
}

export function resetWasmFallbackCount(): void {
  wasmFallbackCount = 0;
}

export function recordWasmFallback(context?: string, error?: unknown): void {
  wasmFallbackCount++;
  if (context) {
    console.warn(`[LOTO-ENGINE FALLBACK #${wasmFallbackCount}] ${context}`, error);
  }
}

export function getEngineVersion(): string {
  if (isWasmLoaded && typeof wasmModuleInstance?.engine_version === 'function') {
    try {
      return wasmModuleInstance.engine_version();
    } catch {
      // fallback
    }
  }
  return '12.0.0-source';
}

export function getAbiHash(): string {
  if (isWasmLoaded && typeof wasmModuleInstance?.abi_hash === 'function') {
    try {
      return wasmModuleInstance.abi_hash();
    } catch {
      // fallback
    }
  }
  return 'e3b0c44298fc1c14';
}

/**
 * Calcul de l'Exposant de Hurst Robuste (HPC Rust WASM ou Fallback Déterministe)
 */
export function computeRobustHurstHpc(signal: number[] | Float64Array): number {
  const signalArray = signal instanceof Float64Array ? signal : new Float64Array(signal);

  if (isWasmLoaded && wasmModuleInstance?.compute_robust_hurst_wasm) {
    try {
      return wasmModuleInstance.compute_robust_hurst_wasm(signalArray);
    } catch (e) {
      console.error('[LOTO-ENGINE] Erreur WASM Hurst, passage au fallback :', e);
    }
  }

  // Fallback mathématique continu déterministe (sans allocation superflue)
  const N = signalArray.length;
  if (N < 10) return 0.5;

  let sum = 0;
  for (let i = 0; i < N; i++) sum += signalArray[i];
  const meanVal = sum / N;

  let totalVar = 0;
  for (let i = 0; i < N; i++) {
    const diff = signalArray[i] - meanVal;
    totalVar += diff * diff;
  }
  const std = Math.sqrt(totalVar / N) || 1e-6;

  // Calcul R/S simplifié déterministe
  let cum = 0;
  let minZ = 0;
  let maxZ = 0;
  for (let i = 0; i < N; i++) {
    cum += signalArray[i] - meanVal;
    if (cum < minZ) minZ = cum;
    if (cum > maxZ) maxZ = cum;
  }
  const R = maxZ - minZ;
  const rs = R / std;
  const H = Math.log(Math.max(1e-4, rs)) / Math.log(N);
  return Math.max(0.01, Math.min(0.99, H));
}

/**
 * Analyse Spectrale FFT 1D/2D (Rust FFT ou Fallback Cooley-Tukey Vectorisé)
 */
export function computeFftPowerSpectrumHpc(signal: number[] | Float64Array): Float64Array {
  const signalArray = signal instanceof Float64Array ? signal : new Float64Array(signal);

  if (isWasmLoaded && wasmModuleInstance?.compute_fft_power_spectrum) {
    try {
      const psd = wasmModuleInstance.compute_fft_power_spectrum(signalArray);
      return new Float64Array(psd);
    } catch (e) {
      console.error('[LOTO-ENGINE] Erreur WASM FFT, passage au fallback :', e);
    }
  }

  // Fallback via le moteur WASM/SIMD local optimisé
  return wasmMatrixEngine.vectorizedFFTPowerSpectrum(signalArray);
}

/**
 * Noyau de Hawkes Croisé Vectorisé (Cross-Exciting Hawkes Process)
 */
export function computeCrossHawkesKernelHpc(params: {
  predOccurrences: Int32Array;
  lagCount: number;
  winCols?: number;
  targetBaseline: Float64Array;
  couplingMatrix: Float64Array;
  betaDecay: number;
}): WasmHawkesResult {
  const winCols = params.winCols || 5;

  if (isWasmLoaded && wasmModuleInstance?.compute_cross_hawkes_kernel) {
    try {
      const res = wasmModuleInstance.compute_cross_hawkes_kernel(
        params.predOccurrences,
        params.lagCount,
        winCols,
        params.targetBaseline,
        params.couplingMatrix,
        params.betaDecay
      );
      const net = new Float64Array(res.net_excitations);
      const lag = new Float64Array(res.lag_excitations);
      return {
        intensities: new Float64Array(res.intensities),
        net_excitations: net,
        netExcitations: net,
        lag_excitations: lag,
        lagExcitations: lag,
        total_energy: res.total_energy,
        totalEnergy: res.total_energy,
      };
    } catch (e) {
      console.error('[LOTO-ENGINE] Erreur WASM Hawkes, passage au fallback :', e);
    }
  }

  // Fallback vectorisé haute performance
  const res = wasmMatrixEngine.vectorizedCrossHawkesKernel({
    lagCount: params.lagCount,
    predecessorLaggedOccurrences: params.predOccurrences,
    targetBaseline: params.targetBaseline,
    crossCouplingMatrix: params.couplingMatrix,
    betaDecay: params.betaDecay,
    winningCols: winCols,
  });

  return {
    intensities: res.intensities,
    net_excitations: res.netExcitations,
    netExcitations: res.netExcitations,
    lag_excitations: res.lagExcitations,
    lagExcitations: res.lagExcitations,
    total_energy: res.totalEnergy,
    totalEnergy: res.totalEnergy,
  };
}

/**
 * Matrice de transition stochastique de Markov
 */
export function computeMarkovTransitionHpc(
  historyDraws: Int32Array,
  numDraws: number,
  winCols: number = 5,
  numStates: number = 90
): Float64Array {
  if (isWasmLoaded && wasmModuleInstance?.compute_markov_transition_matrix_wasm) {
    try {
      const mat = wasmModuleInstance.compute_markov_transition_matrix_wasm(
        historyDraws,
        numDraws,
        winCols,
        numStates
      );
      return new Float64Array(mat);
    } catch (e) {
      console.error('[LOTO-ENGINE] Erreur WASM Markov, passage au fallback :', e);
    }
  }

  return wasmMatrixEngine.markovTransitionMatrix(historyDraws, numDraws, winCols, numStates);
}

export interface WasmAnnealingResult {
  best_combination: number[];
  best_energy: number;
  iterations_run: number;
}

export interface WasmLyapunovResult {
  lyapunov_exponent: number;
  is_chaotic: boolean;
  divergence_force: number;
  topological_entropy: number;
}

/**
 * Optimisation Combinatoire par Recuit Simulé (HPC Rust WASM ou Fallback Déterministe)
 */
export function solveCombinatorialAnnealingHpc(params: {
  candidatePool: Int32Array | number[];
  scores91: Float64Array | number[];
  affinityMatrix: Float64Array | number[];
  initialTemperature?: number;
  coolingRate?: number;
  minTemperature?: number;
  iterationsPerTemp?: number;
  deterministicSeed?: number;
}): WasmAnnealingResult {
  const pool = params.candidatePool instanceof Int32Array ? params.candidatePool : new Int32Array(params.candidatePool);
  const scores = params.scores91 instanceof Float64Array ? params.scores91 : new Float64Array(params.scores91);
  const affinities = params.affinityMatrix instanceof Float64Array ? params.affinityMatrix : new Float64Array(params.affinityMatrix);
  const initialTemp = params.initialTemperature ?? 10.0;
  const cooling = params.coolingRate ?? 0.95;
  const minTemp = params.minTemperature ?? 0.01;
  const iters = params.iterationsPerTemp ?? 50;
  const safeSeedNum = Number.isFinite(params.deterministicSeed) ? Math.max(1, Math.floor(params.deterministicSeed!)) : 123456789;
  const seed = BigInt(safeSeedNum);

  if (isWasmLoaded && wasmModuleInstance?.solve_combinatorial_annealing_wasm) {
    try {
      const res = wasmModuleInstance.solve_combinatorial_annealing_wasm(
        pool,
        scores,
        affinities,
        initialTemp,
        cooling,
        minTemp,
        iters,
        seed
      );
      return {
        best_combination: Array.from(res.best_combination),
        best_energy: res.best_energy,
        iterations_run: res.iterations_run,
      };
    } catch (e) {
      console.error('[LOTO-ENGINE] Erreur WASM Recuit Simulé, passage au fallback :', e);
    }
  }

  // Fallback déterministe synchrone
  const top5 = Array.from(pool.slice(0, 5)).sort((a, b) => a - b);
  let energy = 0;
  for (const n of top5) {
    if (n < scores.length) energy -= scores[n];
  }
  return {
    best_combination: top5,
    best_energy: energy,
    iterations_run: 5,
  };
}

/**
 * Analyse Topologique et Exposant de Lyapunov (HPC Rust WASM ou Fallback Déterministe)
 */
export function computeTopologicalLyapunovHpc(
  historyDraws: Int32Array | number[],
  numDraws: number,
  winCols: number = 5,
  horizonLimit: number = 30
): WasmLyapunovResult {
  const draws = historyDraws instanceof Int32Array ? historyDraws : new Int32Array(historyDraws);

  if (isWasmLoaded && wasmModuleInstance?.compute_topological_lyapunov_wasm) {
    try {
      const res = wasmModuleInstance.compute_topological_lyapunov_wasm(
        draws,
        numDraws,
        winCols,
        horizonLimit
      );
      return {
        lyapunov_exponent: res.lyapunov_exponent,
        is_chaotic: res.is_chaotic,
        divergence_force: res.divergence_force,
        topological_entropy: res.topological_entropy,
      };
    } catch (e) {
      console.error('[LOTO-ENGINE] Erreur WASM Lyapunov, passage au fallback :', e);
    }
  }

  // Fallback simplifié
  return {
    lyapunov_exponent: 0.05,
    is_chaotic: true,
    divergence_force: Math.tanh(0.05),
    topological_entropy: 1.0,
  };
}

export interface WasmCooccurrenceResult {
  targetPairHits: Int32Array;
  conditionedPairHits: Int32Array;
  dyadMatrix: Int32Array;
  totalPairsEvaluated: number;
}

/**
 * Calcul Tensoriel Haute Performance des Cooccurrences et Dyades C(90, 2)
 */
export function computeCooccurrenceTensorHpc(
  predDrawsFlat: Int32Array,
  targetDrawsFlat: Int32Array,
  numDraws: number,
  winCols: number = 5,
  activePredNumbers: Int32Array | number[] = []
): WasmCooccurrenceResult {
  const activePred = activePredNumbers instanceof Int32Array ? activePredNumbers : new Int32Array(activePredNumbers);

  if (isWasmLoaded && wasmModuleInstance?.compute_cooccurrence_tensor_wasm) {
    try {
      const res = wasmModuleInstance.compute_cooccurrence_tensor_wasm(
        predDrawsFlat,
        targetDrawsFlat,
        numDraws,
        winCols,
        activePred
      );
      return {
        targetPairHits: new Int32Array(res.target_pair_hits),
        conditionedPairHits: new Int32Array(res.conditioned_pair_hits),
        dyadMatrix: new Int32Array(res.dyad_matrix),
        totalPairsEvaluated: res.total_pairs_evaluated,
      };
    } catch (e) {
      console.error('[LOTO-ENGINE] Erreur WASM Cooccurrence Tensor, passage au fallback :', e);
    }
  }

  // Fallback vectorisé en mémoire contiguë
  const pairsCount = (90 * 89) / 2; // 4005
  const targetPairHits = new Int32Array(pairsCount);
  const conditionedPairHits = new Int32Array(pairsCount);
  const dyadMatrix = new Int32Array(91 * 91);
  const activeSet = new Set(Array.from(activePred).filter(n => n >= 1 && n <= 90));

  let totalPairsEvaluated = 0;

  for (let d = 0; d < numDraws; d++) {
    const pOffset = d * winCols;
    const tOffset = d * winCols;
    if (tOffset + winCols > targetDrawsFlat.length || pOffset + winCols > predDrawsFlat.length) break;

    let activeOverlap = 0;
    for (let c = 0; c < winCols; c++) {
      const p = predDrawsFlat[pOffset + c];
      if (p >= 1 && p <= 90) {
        if (activeSet.has(p)) activeOverlap++;
        const rowIdx = p * 91;
        for (let tc = 0; tc < winCols; tc++) {
          const t = targetDrawsFlat[tOffset + tc];
          if (t >= 1 && t <= 90) {
            dyadMatrix[rowIdx + t]++;
          }
        }
      }
    }

    for (let i = 0; i < winCols; i++) {
      const t1 = targetDrawsFlat[tOffset + i];
      if (t1 < 1 || t1 > 90) continue;
      for (let j = i + 1; j < winCols; j++) {
        const t2 = targetDrawsFlat[tOffset + j];
        if (t2 < 1 || t2 > 90 || t1 === t2) continue;

        const minT = Math.min(t1, t2);
        const maxT = Math.max(t1, t2);
        const m = minT - 1;
        const pIdx = m * 90 - (m * (m + 1)) / 2 + (maxT - minT - 1);
        if (pIdx >= 0 && pIdx < pairsCount) {
          targetPairHits[pIdx]++;
          if (activeOverlap > 0) conditionedPairHits[pIdx]++;
          totalPairsEvaluated++;
        }
      }
    }
  }

  return {
    targetPairHits,
    conditionedPairHits,
    dyadMatrix,
    totalPairsEvaluated,
  };
}

export interface DominoAdvectionHpcResult {
  dominoEnergies: Float64Array;
  leadTriggerNumbers: number[];
  kineticDissipationRate: number;
}

export interface ButterflyLyapunovHpcResult {
  lyapunovExponent: number;
  sensitivityRegime: number;
  phaseAttractorX: number;
  phaseAttractorY: number;
  phaseAttractorZ: number;
  isChaotic: boolean;
}

export interface GraphHeatKernelHpcResult {
  diffusionMatrix: Float64Array;
  harmonicCentralities: Float64Array;
  traceEnergy: number;
}

export interface ChainReactionResonanceHpcResult {
  resonanceSpectrum: Float64Array;
  avalancheCriticalNumbers: number[];
  maxConstructiveAmplitude: number;
  percolationDensity: number;
}

function mirrorNumberLocal(num: number): number {
  if (num >= 10 && num <= 90) {
    const tens = Math.floor(num / 10);
    const units = num % 10;
    const inv = units * 10 + tens;
    if (inv >= 1 && inv <= 90) return inv;
  }
  return num;
}

/**
 * 1. Effet Domino : Advection Cinétique Déterministe et Ondes de Réverbération
 */
export function computeDominoAdvectionHpc(
  historyFlat: Int32Array | number[],
  numDraws: number,
  dampingGamma: number
): DominoAdvectionHpcResult {
  const flatArray = historyFlat instanceof Int32Array ? historyFlat : new Int32Array(historyFlat);

  if (isWasmLoaded && wasmModuleInstance?.compute_domino_advection_wasm) {
    try {
      const res = wasmModuleInstance.compute_domino_advection_wasm(flatArray, numDraws, dampingGamma);
      return {
        dominoEnergies: new Float64Array(res.domino_energies),
        leadTriggerNumbers: Array.from(res.lead_trigger_numbers),
        kineticDissipationRate: res.kinetic_dissipation_rate,
      };
    } catch (e) {
      console.error('[LOTO-ENGINE] Erreur WASM Domino Advection, passage au fallback :', e);
    }
  }

  // Fallback vectorisé C^inf
  const dominoEnergies = new Float64Array(91);
  const winCols = 5;
  const gamma = Math.min(2.0, Math.max(0.05, dampingGamma));
  const maxDraws = Math.min(numDraws, Math.floor(flatArray.length / winCols));

  if (maxDraws > 0) {
    for (let d = 0; d < maxDraws; d++) {
      const lag = d + 1;
      const lagAttenuation = Math.exp(-gamma * lag * 0.25);

      for (let col = 0; col < winCols; col++) {
        const num = flatArray[d * winCols + col];
        if (num >= 1 && num <= 90) {
          dominoEnergies[num] += 10.0 * lagAttenuation;
          const mir = mirrorNumberLocal(num);
          if (mir >= 1 && mir <= 90 && mir !== num) {
            dominoEnergies[mir] += 4.5 * lagAttenuation;
          }
          const comp = 91 - num;
          if (comp >= 1 && comp <= 90 && comp !== num) {
            dominoEnergies[comp] += 4.0 * lagAttenuation;
          }
        }
      }
    }
  }

  const indexedEnergies: { num: number; score: number }[] = [];
  for (let n = 1; n <= 90; n++) {
    const raw = dominoEnergies[n];
    const sigmoidVal = 100.0 / (1.0 + Math.exp(-0.15 * (raw - 8.0)));
    dominoEnergies[n] = Math.round(sigmoidVal * 100.0) / 100.0;
    indexedEnergies.push({ num: n, score: dominoEnergies[n] });
  }

  indexedEnergies.sort((a, b) => b.score - a.score);
  const leadTriggerNumbers = indexedEnergies.slice(0, 5).map(e => e.num);

  return {
    dominoEnergies,
    leadTriggerNumbers,
    kineticDissipationRate: gamma,
  };
}

/**
 * 2. Effet Papillon : Exposant de Lyapunov Local et Espace des Phases
 */
export function computeButterflyLyapunovHpc(
  lagSeries: Float64Array | number[],
  hurstExponent: number
): ButterflyLyapunovHpcResult {
  const seriesArray = lagSeries instanceof Float64Array ? lagSeries : new Float64Array(lagSeries);

  if (isWasmLoaded && wasmModuleInstance?.compute_butterfly_lyapunov_wasm) {
    try {
      const res = wasmModuleInstance.compute_butterfly_lyapunov_wasm(seriesArray, hurstExponent);
      return {
        lyapunovExponent: res.lyapunov_exponent,
        sensitivityRegime: res.sensitivity_regime,
        phaseAttractorX: res.phase_attractor_x,
        phaseAttractorY: res.phase_attractor_y,
        phaseAttractorZ: res.phase_attractor_z,
        isChaotic: res.is_chaotic,
      };
    } catch (e) {
      console.error('[LOTO-ENGINE] Erreur WASM Butterfly Lyapunov, passage au fallback :', e);
    }
  }

  const n = seriesArray.length;
  if (n < 4) {
    return {
      lyapunovExponent: 0.0,
      sensitivityRegime: 0.5,
      phaseAttractorX: 0.0,
      phaseAttractorY: 0.0,
      phaseAttractorZ: hurstExponent,
      isChaotic: false,
    };
  }

  let sumLnDivergence = 0.0;
  let count = 0;
  const eps = 1e-7;

  for (let k = 1; k < n - 1; k++) {
    const diffNext = Math.abs(seriesArray[k + 1] - seriesArray[k]) + eps;
    const diffCurr = Math.abs(seriesArray[k] - seriesArray[k - 1]) + eps;
    const ratio = diffNext / diffCurr;
    sumLnDivergence += Math.log(ratio);
    count++;
  }

  const lyapunovExp = count > 0 ? sumLnDivergence / count : 0.0;
  const sensitivity = 1.0 / (1.0 + Math.exp(-2.5 * lyapunovExp));
  const isChaotic = lyapunovExp > 0.02;

  const vx = seriesArray[n - 1] - seriesArray[n - 2];
  const ax = n >= 3 ? seriesArray[n - 1] - 2.0 * seriesArray[n - 2] + seriesArray[n - 3] : 0.0;

  return {
    lyapunovExponent: Math.round(lyapunovExp * 10000.0) / 10000.0,
    sensitivityRegime: Math.round(sensitivity * 10000.0) / 10000.0,
    phaseAttractorX: vx,
    phaseAttractorY: ax,
    phaseAttractorZ: hurstExponent,
    isChaotic,
  };
}

/**
 * 3. Effet de Cascade : Noyau de Chaleur de Graphe (Graph Heat Kernel exp(-tL))
 */
export function computeGraphHeatKernelHpc(
  weights: Float64Array | number[],
  n: number,
  diffusionTimeT: number
): GraphHeatKernelHpcResult {
  const weightsFlat = weights instanceof Float64Array ? weights : new Float64Array(weights);

  if (isWasmLoaded && wasmModuleInstance?.compute_graph_heat_kernel_wasm) {
    try {
      const res = wasmModuleInstance.compute_graph_heat_kernel_wasm(weightsFlat, n, diffusionTimeT);
      return {
        diffusionMatrix: new Float64Array(res.diffusion_matrix),
        harmonicCentralities: new Float64Array(res.harmonic_centralities),
        traceEnergy: res.trace_energy,
      };
    } catch (e) {
      console.error('[LOTO-ENGINE] Erreur WASM Graph Heat Kernel, passage au fallback :', e);
    }
  }

  if (n === 0 || weightsFlat.length < n * n) {
    return {
      diffusionMatrix: new Float64Array(0),
      harmonicCentralities: new Float64Array(0),
      traceEnergy: 0.0,
    };
  }

  // Degrés D_i
  const degrees = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let d = 0;
    for (let j = 0; j < n; j++) {
      d += Math.max(0, weightsFlat[i * n + j]);
    }
    degrees[i] = Math.max(1e-9, d);
  }

  // Laplacien normalisé symétrique L = I - D^{-1/2} W D^{-1/2}
  const laplacian = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    const invSqrtDi = 1.0 / Math.sqrt(degrees[i]);
    for (let j = 0; j < n; j++) {
      const invSqrtDj = 1.0 / Math.sqrt(degrees[j]);
      const w = Math.max(0, weightsFlat[i * n + j]);
      const normW = invSqrtDi * w * invSqrtDj;
      laplacian[i * n + j] = i === j ? 1.0 - normW : -normW;
    }
  }

  // exp(-t * L) via Taylor jusqu'à convergence
  const t = Math.min(5.0, Math.max(0.01, diffusionTimeT));
  let currentTerm = new Float64Array(n * n);
  const expMatrix = new Float64Array(n * n);

  for (let i = 0; i < n; i++) {
    expMatrix[i * n + i] = 1.0;
    currentTerm[i * n + i] = 1.0;
  }

  const maxOrder = 12;
  for (let k = 1; k <= maxOrder; k++) {
    const nextTerm = new Float64Array(n * n);
    const factor = -t / k;

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        let sum = 0;
        for (let p = 0; p < n; p++) {
          sum += currentTerm[i * n + p] * laplacian[p * n + j];
        }
        nextTerm[i * n + j] = sum * factor;
      }
    }

    let maxDiff = 0;
    for (let idx = 0; idx < n * n; idx++) {
      expMatrix[idx] += nextTerm[idx];
      const absVal = Math.abs(nextTerm[idx]);
      if (absVal > maxDiff) maxDiff = absVal;
    }

    currentTerm = nextTerm;
    if (maxDiff < 1e-8) break;
  }

  // Normalisation stochastique par ligne
  const normalizedDiffusion = new Float64Array(n * n);
  const harmonicCentralities = new Float64Array(n);
  let traceEnergy = 0.0;

  for (let i = 0; i < n; i++) {
    traceEnergy += expMatrix[i * n + i];
    let rowSum = 0;
    for (let j = 0; j < n; j++) {
      rowSum += Math.max(0, expMatrix[i * n + j]);
    }
    const denom = Math.max(1e-9, rowSum);
    for (let j = 0; j < n; j++) {
      const val = Math.max(0, expMatrix[i * n + j]) / denom;
      normalizedDiffusion[i * n + j] = val;
      harmonicCentralities[j] += val;
    }
  }

  for (let j = 0; j < n; j++) {
    harmonicCentralities[j] /= n;
  }

  return {
    diffusionMatrix: normalizedDiffusion,
    harmonicCentralities,
    traceEnergy,
  };
}

/**
 * 4. Réaction en Chaîne : Résonance d'Interférence Constructive & Potentiel d'Avalanche SOC
 */
export function computeChainReactionResonanceHpc(
  recentDrawsFlat: Int32Array | number[],
  drawsCount: number,
  sourceCouplings: Float64Array | number[],
  numSources?: number
): ChainReactionResonanceHpcResult {
  const recentFlat = recentDrawsFlat instanceof Int32Array ? recentDrawsFlat : new Int32Array(recentDrawsFlat);
  const couplingsArray = sourceCouplings instanceof Float64Array ? sourceCouplings : new Float64Array(sourceCouplings);

  const sourcesCount = Math.max(1, Math.min(numSources ?? couplingsArray.length, couplingsArray.length));

  if (isWasmLoaded && wasmModuleInstance?.compute_chain_reaction_resonance_wasm) {
    try {
      const res = wasmModuleInstance.compute_chain_reaction_resonance_wasm(
        recentFlat,
        drawsCount,
        couplingsArray,
        sourcesCount
      );
      return {
        resonanceSpectrum: new Float64Array(res.resonance_spectrum),
        avalancheCriticalNumbers: Array.from(res.avalanche_critical_numbers),
        maxConstructiveAmplitude: res.max_constructive_amplitude,
        percolationDensity: res.percolation_density,
      };
    } catch (e) {
      console.error('[LOTO-ENGINE] Erreur WASM Chain Reaction, passage au fallback :', e);
    }
  }

  const spectrum = new Float64Array(91);
  const winCols = 5;
  const actualDraws = Math.min(drawsCount, Math.floor(recentFlat.length / winCols));

  // Superposition d'ondes harmoniques
  for (let s = 0; s < sourcesCount; s++) {
    const weight = Math.max(0.01, couplingsArray[s] || 0.1);
    const freq = 1.0 + s * 0.47;
    const phase = (s + 1) * 0.6180339887; // Nombre d'or

    for (let n = 1; n <= 90; n++) {
      const theta = (2.0 * Math.PI * freq * n) / 90.0 + phase;
      const wave = Math.cos(theta) * weight;
      spectrum[n] += wave;
    }
  }

  // Potentiel d'avalanche (SOC)
  const avalanchePotentials = new Float64Array(91);
  for (let d = 0; d < actualDraws; d++) {
    const recencyWeight = 1.0 / (1.0 + d * 0.2);
    for (let col = 0; col < winCols; col++) {
      const num = recentFlat[d * winCols + col];
      if (num >= 1 && num <= 90) {
        avalanchePotentials[num] += recencyWeight;
      }
    }
  }

  const criticalIndexed: { num: number; score: number }[] = [];
  let maxAmp = 0.0;
  let totalCritDensity = 0.0;

  for (let n = 1; n <= 90; n++) {
    const combined = spectrum[n] + avalanchePotentials[n] * 1.5;
    const score = 100.0 / (1.0 + Math.exp(-0.8 * combined));
    spectrum[n] = Math.round(score * 10.0) / 10.0;

    if (spectrum[n] > maxAmp) {
      maxAmp = spectrum[n];
    }
    totalCritDensity += spectrum[n];
    criticalIndexed.push({ num: n, score: spectrum[n] });
  }

  criticalIndexed.sort((a, b) => b.score - a.score);
  const avalancheCriticalNumbers = criticalIndexed.slice(0, 5).map(e => e.num);

  return {
    resonanceSpectrum: spectrum,
    avalancheCriticalNumbers,
    maxConstructiveAmplitude: maxAmp,
    percolationDensity: Math.round((totalCritDensity / 90.0 * 100.0) * 100.0) / 100.0,
  };
}

export interface Differentiable4PhenomenaFusionResult {
  fusedScores: Float64Array;
  butterflyScores: Float64Array;
  cascadeScores: Float64Array;
  weights: {
    wDomino: number;
    wButterfly: number;
    wCascade: number;
    wChain: number;
    entropy: number;
  };
  candidateBreakdowns: Record<number, { dominoScore: number; butterflyScore: number; cascadeScore: number; chainScore: number }>;
}

/**
 * Fusion Continuement Différentiable C^∞ des 4 Phénomènes Physiques Inter-Tirages
 * 1. Domino (Advection Cinétique)
 * 2. Papillon (Attracteur dans l'Espace des Phases)
 * 3. Cascade (Diffusion du Noyau de Chaleur Graph Heat Kernel exp(-tL))
 * 4. Réaction en Chaîne (Résonance SOC d'Interférence)
 */
export function computeDifferentiable4PhenomenaFusionHpc(
  dominoEnergies: Float64Array | number[],
  resonanceSpectrum: Float64Array | number[],
  phaseAttractor: { velocity: number; acceleration: number; lyapunovExponent: number; sensitivityRegime: number },
  heatKernelDiffusionMatrix: Float64Array | number[],
  numDrawNodes: number,
  targetNodeIdx: number,
  recentDrawsFlat: Int32Array | number[],
  drawsCount: number,
  hurstExponent: number
): Differentiable4PhenomenaFusionResult {
  const domArr = dominoEnergies instanceof Float64Array ? dominoEnergies : new Float64Array(dominoEnergies);
  const resArr = resonanceSpectrum instanceof Float64Array ? resonanceSpectrum : new Float64Array(resonanceSpectrum);
  const diffMatrix = heatKernelDiffusionMatrix instanceof Float64Array ? heatKernelDiffusionMatrix : new Float64Array(heatKernelDiffusionMatrix);
  const drawsFlat = recentDrawsFlat instanceof Int32Array ? recentDrawsFlat : new Int32Array(recentDrawsFlat);

  // 1. Vecteur Papillon B_n (Espace des phases : vitesse, accélération, Lyapunov)
  const butterflyScores = new Float64Array(91);
  const rawPhaseForces = new Float64Array(91);
  let sumPhase = 0;

  for (let n = 1; n <= 90; n++) {
    const theta = (2.0 * Math.PI * n) / 90.0 + phaseAttractor.velocity * 0.1;
    const force = Math.cos(theta) * phaseAttractor.velocity + Math.sin(2.0 * theta) * phaseAttractor.acceleration + phaseAttractor.lyapunovExponent * 5.0;
    rawPhaseForces[n] = force;
    sumPhase += force;
  }
  const meanPhase = sumPhase / 90.0;
  let varPhase = 0;
  for (let n = 1; n <= 90; n++) {
    varPhase += Math.pow(rawPhaseForces[n] - meanPhase, 2);
  }
  const stdPhase = Math.sqrt(varPhase / 90.0) || 1e-6;

  for (let n = 1; n <= 90; n++) {
    const z = (rawPhaseForces[n] - meanPhase) / stdPhase;
    butterflyScores[n] = Math.round((100.0 / (1.0 + Math.exp(-z))) * 10.0) / 10.0;
  }

  // 2. Vecteur Cascade C_n (Diffusion du Noyau de Chaleur Graph Heat Kernel exp(-tL))
  const cascadeScores = new Float64Array(91);
  const rawHeatEnergies = new Float64Array(91);
  const winCols = 5;
  const actualDraws = Math.min(drawsCount, Math.floor(drawsFlat.length / winCols));
  const safeTargetIdx = targetNodeIdx >= 0 && targetNodeIdx < numDrawNodes ? targetNodeIdx : 0;
  let sumHeat = 0;

  for (let d = 0; d < actualDraws; d++) {
    const sourceNodeIdx = d % Math.max(1, numDrawNodes);
    const diffusivity = numDrawNodes > 0 && diffMatrix.length >= numDrawNodes * numDrawNodes
      ? diffMatrix[safeTargetIdx * numDrawNodes + sourceNodeIdx] || 0.1
      : 1.0 / Math.max(1, numDrawNodes);

    const recencyDecay = 1.0 / (1.0 + d * 0.15);
    const weight = diffusivity * recencyDecay;

    for (let col = 0; col < winCols; col++) {
      const num = drawsFlat[d * winCols + col];
      if (num >= 1 && num <= 90) {
        rawHeatEnergies[num] += weight;
      }
    }
  }

  for (let n = 1; n <= 90; n++) sumHeat += rawHeatEnergies[n];
  const meanHeat = sumHeat / 90.0;
  let varHeat = 0;
  for (let n = 1; n <= 90; n++) {
    varHeat += Math.pow(rawHeatEnergies[n] - meanHeat, 2);
  }
  const stdHeat = Math.sqrt(varHeat / 90.0) || 1e-6;

  for (let n = 1; n <= 90; n++) {
    const z = (rawHeatEnergies[n] - meanHeat) / stdHeat;
    cascadeScores[n] = Math.round((100.0 / (1.0 + Math.exp(-z))) * 10.0) / 10.0;
  }

  // 3. Calcul des Statistiques & Contrastes
  const getStats = (arr: Float64Array) => {
    let sum = 0;
    for (let n = 1; n <= 90; n++) sum += arr[n] || 50.0;
    const mean = sum / 90.0;
    let varVal = 0;
    for (let n = 1; n <= 90; n++) varVal += Math.pow((arr[n] || 50.0) - mean, 2);
    const std = Math.sqrt(varVal / 90.0) || 1e-6;
    return { mean, std, contrast: std / Math.max(1e-3, mean) };
  };

  const statsD = getStats(domArr);
  const statsB = getStats(butterflyScores);
  const statsC = getStats(cascadeScores);
  const statsR = getStats(resArr);

  const sens = Math.min(1.0, Math.max(0.0, phaseAttractor.sensitivityRegime));
  const qD = statsD.contrast * (1.2 - 0.4 * sens);
  const qB = statsB.contrast * (0.6 + 0.8 * sens);
  const qC = statsC.contrast * (1.1 - 0.3 * sens);
  const qR = statsR.contrast * (0.7 + 0.6 * sens);

  const tau = Math.max(0.05, 0.5 / Math.max(0.01, hurstExponent));

  const eD = Math.exp(qD / tau);
  const eB = Math.exp(qB / tau);
  const eC = Math.exp(qC / tau);
  const eR = Math.exp(qR / tau);
  const sumExp = eD + eB + eC + eR;

  const wDomino = Math.round((eD / sumExp) * 10000) / 10000;
  const wButterfly = Math.round((eB / sumExp) * 10000) / 10000;
  const wCascade = Math.round((eC / sumExp) * 10000) / 10000;
  const wChain = Math.round((eR / sumExp) * 10000) / 10000;

  const weightsList = [wDomino, wButterfly, wCascade, wChain];
  let entropy = 0;
  for (const w of weightsList) {
    if (w > 0) entropy -= w * Math.log(w);
  }
  entropy = Math.round(entropy * 1000) / 1000;

  // 4. Fusion Continue Fused Score & Candidate Breakdowns
  const fusedScores = new Float64Array(91);
  const candidateBreakdowns: Record<number, { dominoScore: number; butterflyScore: number; cascadeScore: number; chainScore: number }> = {};

  for (let n = 1; n <= 90; n++) {
    const sD = domArr[n] || 50.0;
    const sB = butterflyScores[n] || 50.0;
    const sC = cascadeScores[n] || 50.0;
    const sR = resArr[n] || 50.0;

    const fused = wDomino * sD + wButterfly * sB + wCascade * sC + wChain * sR;
    const scoreVal = Math.round(Math.min(99.9, Math.max(1.0, fused)) * 10) / 10;
    fusedScores[n] = scoreVal;

    candidateBreakdowns[n] = {
      dominoScore: Math.round(sD * 10) / 10,
      butterflyScore: Math.round(sB * 10) / 10,
      cascadeScore: Math.round(sC * 10) / 10,
      chainScore: Math.round(sR * 10) / 10
    };
  }

  return {
    fusedScores,
    butterflyScores,
    cascadeScores,
    weights: {
      wDomino,
      wButterfly,
      wCascade,
      wChain,
      entropy
    },
    candidateBreakdowns
  };
}


export interface AcoOptimizationHpcResult {
  bestNumbers: number[];
  bestScore: number;
  confidence: number;
  pheromoneDensity: number;
  generationsRun: number;
}

/**
 * 5. Optimisation par Colonie de Fourmis (ACS) en Rust/WASM (remplace `run-ml-models` Cloud)
 */
export function runAntColonyOptimizationHpc(params: {
  flatHistory: Int32Array | number[];
  numDraws: number;
  winCols?: number;
  antsCount: number;
  generations: number;
  alpha: number;
  beta: number;
  rho: number;
  q0: number;
  biasTargets?: Int32Array | number[];
  seed: number;
}): AcoOptimizationHpcResult {
  const flat = params.flatHistory instanceof Int32Array ? params.flatHistory : new Int32Array(params.flatHistory);
  const cols = Math.max(1, params.winCols ?? 5);
  const bias = params.biasTargets instanceof Int32Array
    ? params.biasTargets
    : new Int32Array(params.biasTargets || []);

  if (isWasmLoaded && wasmModuleInstance?.run_aco_optimization_wasm) {
    try {
      const res = wasmModuleInstance.run_aco_optimization_wasm(
        flat,
        params.numDraws,
        cols,
        params.antsCount,
        params.generations,
        params.alpha,
        params.beta,
        params.rho,
        params.q0,
        bias,
        BigInt(Math.max(1, Math.floor(Number(params.seed) || 99991)))
      );
      return {
        bestNumbers: Array.from(res.best_numbers),
        bestScore: res.best_score,
        confidence: res.confidence,
        pheromoneDensity: res.pheromone_density,
        generationsRun: res.generations_run,
      };
    } catch (e) {
      console.error('[LOTO-ENGINE] Erreur WASM ACO, passage au fallback vectorisé :', e);
    }
  }

  // Exécution vectorisée en mémoire contiguë (Zéro GC, 100% Déterministe)
  const NUM_NODES = 90;
  const MATRIX_DIM = 91;
  const TICKET_SIZE = 5;
  const actualDraws = Math.min(params.numDraws, Math.floor(flat.length / cols));
  if (actualDraws === 0) {
    return {
      bestNumbers: [1, 2, 3, 4, 5],
      bestScore: 0,
      confidence: 45,
      pheromoneDensity: 0.45,
      generationsRun: 0,
    };
  }

  let lcgState = BigInt(Math.max(1, Math.floor(Number(params.seed) || 99991)));
  const nextF64 = (): number => {
    lcgState = (lcgState * 6364136223846793005n + 1442695040888963407n) & 0xFFFFFFFFFFFFFFFFn;
    return Number(lcgState >> 11n) / 9007199254740992.0;
  };

  const counts = new Float64Array(MATRIX_DIM);
  let totalCount = 0;
  for (let d = 0; d < actualDraws; d++) {
    const offset = d * cols;
    const limitC = Math.min(cols, TICKET_SIZE);
    for (let c = 0; c < limitC; c++) {
      const n = flat[offset + c];
      if (n >= 1 && n <= NUM_NODES) {
        counts[n] += 1.0;
        totalCount += 1.0;
      }
    }
  }

  let hShannon = 0;
  if (totalCount > 0) {
    for (let n = 1; n <= NUM_NODES; n++) {
      const p = counts[n] / totalCount;
      if (p > 0) hShannon -= p * Math.log2(p);
    }
  }
  const normalizedEntropy = Math.max(0.01, Math.min(0.99, hShannon / Math.log2(NUM_NODES)));

  const baseEta = 1.0 / NUM_NODES;
  const eta = new Float64Array(MATRIX_DIM * MATRIX_DIM).fill(baseEta);
  const evalHorizon = Math.min(actualDraws, 100);
  const decayRate = 1.0 / Math.max(5.0, Math.sqrt(evalHorizon));

  for (let d = 0; d < evalHorizon; d++) {
    const recencyWeight = Math.exp(-decayRate * d);
    const offset = d * cols;
    const limitC = Math.min(cols, TICKET_SIZE);
    for (let i = 0; i < limitC; i++) {
      const u = flat[offset + i];
      if (u < 1 || u > NUM_NODES) continue;
      for (let j = i + 1; j < limitC; j++) {
        const v = flat[offset + j];
        if (v < 1 || v > NUM_NODES || u === v) continue;
        eta[u * MATRIX_DIM + v] += recencyWeight;
        eta[v * MATRIX_DIM + u] += recencyWeight;
      }
    }
  }

  for (let i = 0; i < bias.length; i++) {
    const t = bias[i];
    if (t >= 1 && t <= NUM_NODES) {
      const boost = 1.0 + (1.0 - normalizedEntropy);
      for (let other = 1; other <= NUM_NODES; other++) {
        if (other !== t) {
          eta[t * MATRIX_DIM + other] *= boost;
          eta[other * MATRIX_DIM + t] *= boost;
        }
      }
    }
  }

  const tau0 = 1.0 / (NUM_NODES * Math.SQRT1_2);
  const tau = new Float64Array(MATRIX_DIM * MATRIX_DIM).fill(tau0);

  let globalBestPath = [1, 2, 3, 4, 5];
  let globalBestScore = -Infinity;

  let adaptiveRho = Math.max(0.01, Math.min(0.95, params.rho));
  let adaptiveXi = Math.max(0.01, Math.min(0.9, normalizedEntropy / 2.0));
  let lastHNorm = 1.0 / Math.E;

  const effAnts = Math.max(10, Math.min(200, params.antsCount));
  const effGens = Math.max(10, Math.min(250, params.generations));
  const effAlpha = Math.max(0.1, params.alpha);
  const effBeta = Math.max(0.1, params.beta);
  const effQ0 = Math.max(0.05, Math.min(0.95, params.q0));

  const nodeVisits = new Float64Array(MATRIX_DIM);
  const candNodes = new Int32Array(NUM_NODES);
  const candScores = new Float64Array(NUM_NODES);
  const visited = new Uint8Array(MATRIX_DIM);
  const path = new Int32Array(TICKET_SIZE);

  const hMin = Math.log(TICKET_SIZE);
  const hMax = Math.log(NUM_NODES);

  for (let gen = 0; gen < effGens; gen++) {
    nodeVisits.fill(0);

    for (let k = 0; k < effAnts; k++) {
      visited.fill(0);
      const startNode = Math.min(NUM_NODES, Math.max(1, Math.floor(nextF64() * NUM_NODES) + 1));
      path[0] = startNode;
      visited[startNode] = 1;
      nodeVisits[startNode] += 1;
      let current = startNode;

      for (let step = 1; step < TICKET_SIZE; step++) {
        let candCount = 0;
        let maxRaw = -Infinity;

        for (let next = 1; next <= NUM_NODES; next++) {
          if (visited[next] === 0) {
            const idx = current * MATRIX_DIM + next;
            const t = Math.max(1e-12, tau[idx]);
            const n = Math.max(1e-12, eta[idx]);
            const rawScore = Math.pow(t, effAlpha) * Math.pow(n, effBeta);
            candNodes[candCount] = next;
            candScores[candCount] = rawScore;
            if (rawScore > maxRaw) maxRaw = rawScore;
            candCount++;
          }
        }

        if (candCount === 0) break;

        const temperature = Math.max(1e-6, 1.0 - effQ0) * Math.exp(lastHNorm);
        let sumExp = 0;
        for (let cIdx = 0; cIdx < candCount; cIdx++) {
          const expS = Math.exp(Math.max(-60.0, Math.min(0.0, (candScores[cIdx] - maxRaw) / temperature)));
          candScores[cIdx] = expS;
          sumExp += expS;
        }

        let r = nextF64() * sumExp;
        let chosen = candNodes[candCount - 1];
        for (let cIdx = 0; cIdx < candCount; cIdx++) {
          r -= candScores[cIdx];
          if (r <= 0) {
            chosen = candNodes[cIdx];
            break;
          }
        }

        const idxUv = current * MATRIX_DIM + chosen;
        const newTau = (1.0 - adaptiveXi) * tau[idxUv] + adaptiveXi * tau0;
        tau[idxUv] = newTau;
        tau[chosen * MATRIX_DIM + current] = newTau;

        path[step] = chosen;
        visited[chosen] = 1;
        nodeVisits[chosen] += 1;
        current = chosen;
      }

      const sortedPath = Array.from(path).sort((a, b) => a - b);
      let score = 0;
      for (let i = 0; i < TICKET_SIZE; i++) {
        for (let j = i + 1; j < TICKET_SIZE; j++) {
          score += eta[sortedPath[i] * MATRIX_DIM + sortedPath[j]];
        }
      }

      if (score > globalBestScore) {
        globalBestScore = score;
        globalBestPath = sortedPath;
      }
    }

    const totalVisits = effAnts * TICKET_SIZE;
    let hGen = 0;
    for (let n = 1; n <= NUM_NODES; n++) {
      const p = nodeVisits[n] / totalVisits;
      if (p > 0) hGen -= p * Math.log(p);
    }
    const hNorm = Math.max(0, Math.min(1, (hGen - hMin) / (hMax - hMin)));
    lastHNorm = hNorm;

    const dampingSignal = 1.0 / (1.0 + Math.exp(-Math.E * (hNorm - 1.0 / Math.E)));
    adaptiveRho = 1.0 / Math.pow(Math.E, 3) + (1.0 / Math.E) * dampingSignal;
    adaptiveXi = 1.0 / Math.pow(Math.E, 3) + (1.0 / Math.pow(Math.E, 1.5)) * dampingSignal;

    const deposit = globalBestScore * (1.0 / (Math.PI * Math.PI));
    for (let i = 0; i < TICKET_SIZE; i++) {
      for (let j = i + 1; j < TICKET_SIZE; j++) {
        const u = globalBestPath[i];
        const v = globalBestPath[j];
        const idxUv = u * MATRIX_DIM + v;
        const updated = (1.0 - adaptiveRho) * tau[idxUv] + adaptiveRho * deposit;
        tau[idxUv] = updated;
        tau[v * MATRIX_DIM + u] = updated;
      }
    }
  }

  const expectedBase = ((TICKET_SIZE * (TICKET_SIZE - 1)) / 2) * (tau0 * Math.pow(0.5, effBeta));
  const scoreRatio = globalBestScore / Math.max(1e-9, expectedBase);
  const confSig = 1.0 / (1.0 + Math.exp(-0.1 * (scoreRatio - 1.0)));
  const confidence = Math.max(1, Math.min(99, Math.round(confSig * 100)));

  return {
    bestNumbers: globalBestPath,
    bestScore: globalBestScore,
    confidence,
    pheromoneDensity: confidence / 100.0,
    generationsRun: effGens,
  };
}

export interface HybridRegimeWeightsHpcResult {
  optimizedWeights: Float64Array;
  confidence: number;
  stabilityIndex: number;
}

/**
 * 6. Optimisation Continue des Poids de Régime en Rust/WASM (remplace `hybrid-prediction` Cloud)
 */
export function computeHybridRegimeWeightsHpc(params: {
  baseWeights: Float64Array | number[];
  channelTypes: Int32Array | number[];
  hurst: number;
  entropyNorm: number;
  volatilityNorm: number;
  historyDepth: number;
}): HybridRegimeWeightsHpcResult {
  const baseArr = params.baseWeights instanceof Float64Array ? params.baseWeights : new Float64Array(params.baseWeights);
  const typesArr = params.channelTypes instanceof Int32Array ? params.channelTypes : new Int32Array(params.channelTypes);

  if (isWasmLoaded && wasmModuleInstance?.compute_hybrid_regime_weights_wasm) {
    try {
      const res = wasmModuleInstance.compute_hybrid_regime_weights_wasm(
        baseArr,
        typesArr,
        params.hurst,
        params.entropyNorm,
        params.volatilityNorm,
        params.historyDepth
      );
      return {
        optimizedWeights: new Float64Array(res.optimized_weights),
        confidence: res.confidence,
        stabilityIndex: res.stability_index,
      };
    } catch (e) {
      console.error('[LOTO-ENGINE] Erreur WASM Hybrid Regime Weights, passage au fallback :', e);
    }
  }

  const k = baseArr.length;
  if (k === 0) {
    return {
      optimizedWeights: new Float64Array(0),
      confidence: 50.0,
      stabilityIndex: 50.0,
    };
  }

  const h = Math.max(0.05, Math.min(0.95, params.hurst));
  const s = Math.max(0.05, Math.min(0.99, params.entropyNorm));
  const v = Math.max(0.01, Math.min(1.0, params.volatilityNorm));

  const persistenceDrive = Math.tanh(2.5 * (h - 0.5));
  const meanReversionDrive = Math.tanh(2.5 * (0.5 - h));
  const chaosDrive = Math.tanh(2.0 * (s - 0.5) + 1.5 * (v - 0.3));
  const stabilityDrive = Math.tanh(1.5 * (1.0 - v));

  const sampleConfidence = 1.0 - Math.exp(-Math.max(5, params.historyDepth) / 120.0);
  const out = new Float64Array(k);
  let sumW = 0.0;

  for (let i = 0; i < k; i++) {
    const cType = i < typesArr.length ? typesArr[i] : 3;
    const drive =
      cType === 0
        ? persistenceDrive
        : cType === 1
        ? meanReversionDrive
        : cType === 2
        ? chaosDrive
        : stabilityDrive;
    const factor = Math.exp(0.35 * drive * sampleConfidence);
    const w = Math.max(1e-5, baseArr[i]) * factor;
    out[i] = w;
    sumW += w;
  }

  if (sumW > 0) {
    for (let i = 0; i < k; i++) {
      out[i] /= sumW;
    }
  }

  const stabilityIndex = Math.max(15.0, Math.min(98.0, (1.0 - 0.5 * v - 0.3 * Math.max(0, s - 0.5)) * 100.0));
  const confidence = Math.max(
    25.0,
    Math.min(96.0, (0.45 * sampleConfidence + 0.35 * (1.0 - s * 0.4) + 0.2 * (1.0 + Math.abs(h - 0.5))) * 100.0)
  );

  return {
    optimizedWeights: out,
    confidence,
    stabilityIndex,
  };
}

/**
 * 7. Comptage Vectorisé des Fréquences en O(N) (remplace les requêtes Supabase de `fetchRecentStats` / `fetchGlobalStats`)
 */
export function computeFrequencyCountsHpc(
  flatDraws: Int32Array | number[],
  numDraws: number,
  winCols: number = 5
): Int32Array {
  const flat = flatDraws instanceof Int32Array ? flatDraws : new Int32Array(flatDraws);
  const cols = Math.max(1, winCols);

  if (isWasmLoaded && wasmModuleInstance?.compute_frequency_counts_wasm) {
    try {
      const res = wasmModuleInstance.compute_frequency_counts_wasm(flat, numDraws, cols);
      return new Int32Array(res);
    } catch (e) {
      console.error('[LOTO-ENGINE] Erreur WASM Frequency Counts, passage au fallback :', e);
    }
  }

  const counts = new Int32Array(91);
  const actualDraws = Math.min(numDraws, Math.floor(flat.length / cols));
  for (let d = 0; d < actualDraws; d++) {
    const offset = d * cols;
    for (let c = 0; c < cols; c++) {
      const n = flat[offset + c];
      if (n >= 1 && n <= 90) {
        counts[n]++;
      }
    }
  }
  return counts;
}

/**
 * 8. In-Memory Store & Zero-Cost Draw Cache (Rust / WASM HPC + Fallback C^∞)
 * Maintient l'historique complet en RAM contiguë avec masques u128 et dénombrement en 1 cycle CPU.
 */
let wasmStoreInstance: any = null;

/**
 * Accesseur polymorphe sécurisé pour les propriétés / getters WebAssembly.
 * Prévient les erreurs de type TypeError si wasm-bindgen expose un getter sous forme de propriété JS.
 */
export function readWasmField<T>(target: any, prop: string, fallback: T): T {
  if (!target) return fallback;
  try {
    const val = target[prop];
    if (typeof val === 'function') {
      return val.call(target);
    }
    return val !== undefined && val !== null ? val : fallback;
  } catch {
    return fallback;
  }
}

interface FallbackDraw {
  timestamp: number;
  winners: number[];
  machine: number[];
  mask: bigint;
}

interface FallbackTimeline {
  history: FallbackDraw[];
  frequencies: Int32Array;
  currentGaps: Int32Array;
  maxGaps: Int32Array;
  seenDraws: Set<string>;
}

const fallbackStoreTimelines = new Map<string, FallbackTimeline>();

export function getOrCreateNativeStoreInstance(): any {
  if (isWasmLoaded && wasmModuleInstance?.InMemoryDrawStore) {
    if (!wasmStoreInstance) {
      try {
        wasmStoreInstance = new wasmModuleInstance.InMemoryDrawStore();
      } catch (e) {
        console.error('[LOTO-ENGINE] Erreur instanciation InMemoryDrawStore WASM :', e);
      }
    }
    return wasmStoreInstance;
  }
  return null;
}

export function clearStoreTimeline(drawName: string): void {
  const normName = drawName.trim().toUpperCase();
  const store = getOrCreateNativeStoreInstance();
  if (store && typeof store.clear_draw === 'function') {
    try {
      store.clear_draw(normName);
    } catch {}
  }
  fallbackStoreTimelines.delete(normName);
}

export function clearAndReloadStore(jsonPayload: string, drawName: string): number {
  clearStoreTimeline(drawName);
  return bootstrapStoreFromJson(jsonPayload);
}

export function bootstrapStoreFromJson(jsonPayload: string): number {
  const store = getOrCreateNativeStoreInstance();
  if (store && typeof store.bootstrap_json === 'function') {
    try {
      return store.bootstrap_json(jsonPayload);
    } catch (e) {
      recordWasmFallback('bootstrap_json', e);
      console.warn('[LOTO-ENGINE] Erreur bootstrap WASM store, passage au fallback JS :', e);
    }
  }

  // Fallback déterministe JS pur
  try {
    const rawList = JSON.parse(jsonPayload);
    if (!Array.isArray(rawList)) return 0;
    
    let count = 0;
    for (const raw of rawList) {
      if (!raw || !Array.isArray(raw.gagnants) || raw.gagnants.length < 5) continue;
      const drawName = String(raw.tirage || raw.draw_name || 'GLOBAL').trim().toUpperCase();
      
      let tsSec = 0;
      if (typeof raw.timestamp === 'number') {
        tsSec = raw.timestamp > 10_000_000_000 ? Math.floor(raw.timestamp / 1000) : raw.timestamp;
      } else if (typeof raw.date === 'string') {
        const parts = raw.date.includes('-') ? raw.date.split('-') : raw.date.split('/');
        if (parts.length === 3) {
          const y = parseInt(parts[0], 10) || 2026;
          const m = parseInt(parts[1], 10) || 1;
          const d = parseInt(parts[2], 10) || 1;
          tsSec = Math.floor(new Date(y, m - 1, d).getTime() / 1000);
        }
      }

      const inserted = appendSingleDrawToStore(
        drawName,
        tsSec,
        raw.gagnants.slice(0, 5),
        Array.isArray(raw.machine) ? raw.machine.slice(0, 5) : []
      );
      if (inserted) count++;
    }
    return count;
  } catch (err) {
    console.error('[LOTO-ENGINE] Erreur bootstrap fallback JSON :', err);
    return 0;
  }
}

export function appendSingleDrawToStore(
  drawName: string,
  timestamp: number,
  winners: number[],
  machine: number[] = []
): boolean {
  const normName = drawName.trim().toUpperCase();
  // Normalisation stricte de l'horodatage en secondes POSIX
  const tsSec = timestamp > 10_000_000_000 ? Math.floor(timestamp / 1000) : Math.floor(timestamp);

  const store = getOrCreateNativeStoreInstance();
  if (store && typeof store.append_single_draw === 'function') {
    try {
      return store.append_single_draw(
        normName,
        BigInt(tsSec || 0),
        new Uint8Array(winners.slice(0, 5)),
        new Uint8Array(machine.slice(0, 5))
      );
    } catch (e) {
      console.warn('[LOTO-ENGINE] Erreur appendSingleDraw WASM, passage au fallback :', e);
    }
  }

  // Fallback Store
  let timeline = fallbackStoreTimelines.get(normName);
  if (!timeline) {
    timeline = {
      history: [],
      frequencies: new Int32Array(91),
      currentGaps: new Int32Array(91),
      maxGaps: new Int32Array(91),
      seenDraws: new Set<string>(),
    };
    fallbackStoreTimelines.set(normName, timeline);
  }

  let mask = 0n;
  for (const w of winners) {
    if (w >= 1 && w <= 90) {
      mask |= 1n << BigInt(w);
    }
  }

  // Dédoublonnage strict par clé composite déterministe
  const compositeKey = `${tsSec}_${mask.toString()}`;
  if (timeline.seenDraws.has(compositeKey)) {
    return false; // Idempotence garantie : déjà présent, no-op
  }
  timeline.seenDraws.add(compositeKey);

  timeline.history.push({
    timestamp: tsSec,
    winners: [...winners].sort((a, b) => a - b),
    machine: [...machine].sort((a, b) => a - b),
    mask,
  });

  // Mise à jour continue O(1) des fréquences et des retards
  for (let n = 1; n <= 90; n++) {
    const isWinner = (mask & (1n << BigInt(n))) !== 0n;
    if (isWinner) {
      timeline.frequencies[n]++;
      if (timeline.currentGaps[n] > timeline.maxGaps[n]) {
        timeline.maxGaps[n] = timeline.currentGaps[n];
      }
      timeline.currentGaps[n] = 0;
    } else {
      timeline.currentGaps[n]++;
    }
  }

  return true;
}

export function getStoreFrequencies(drawName: string): Int32Array {
  const normName = drawName.trim().toUpperCase();
  const store = getOrCreateNativeStoreInstance();
  if (store && typeof store.get_frequencies === 'function') {
    try {
      const freqs = store.get_frequencies(normName);
      if (freqs && freqs.length > 0) return new Int32Array(freqs);
    } catch (e) {
      console.warn('[LOTO-ENGINE] Erreur get_frequencies WASM :', e);
    }
  }

  const timeline = fallbackStoreTimelines.get(normName);
  if (timeline) {
    return new Int32Array(timeline.frequencies);
  }
  return new Int32Array(91);
}

export function getStoreCurrentGaps(drawName: string): Int32Array {
  const normName = drawName.trim().toUpperCase();
  const store = getOrCreateNativeStoreInstance();
  if (store && typeof store.get_current_gaps === 'function') {
    try {
      const gaps = store.get_current_gaps(normName);
      if (gaps && gaps.length > 0) return new Int32Array(gaps);
    } catch (e) {
      console.warn('[LOTO-ENGINE] Erreur get_current_gaps WASM :', e);
    }
  }

  const timeline = fallbackStoreTimelines.get(normName);
  if (timeline) {
    return new Int32Array(timeline.currentGaps);
  }
  return new Int32Array(91);
}

export function getStoreDrawCount(drawName: string): number {
  const normName = drawName.trim().toUpperCase();
  const store = getOrCreateNativeStoreInstance();
  if (store && typeof store.get_draw_count === 'function') {
    try {
      return store.get_draw_count(normName);
    } catch {
      // Basculer vers fallback
    }
  }

  const timeline = fallbackStoreTimelines.get(normName);
  return timeline ? timeline.history.length : 0;
}

export interface StoreTelemetry {
  drawName: string;
  drawCount: number;
  isWasmNative: boolean;
  mode: 'RUST_WASM' | 'SIMD_FALLBACK';
  estimatedMemoryBytes: number;
  frequencyCheckSum: number;
}

export function getStoreTelemetry(drawName: string): StoreTelemetry {
  const normName = (drawName || 'GLOBAL').trim().toUpperCase();
  const count = getStoreDrawCount(normName);
  const freqs = getStoreFrequencies(normName);
  let checkSum = 0;
  for (let i = 1; i <= 90; i++) {
    checkSum += freqs[i];
  }
  const isWasm = isLotoEngineWasmReady();
  const bytesPerDraw = 48;
  const fixedTableBytes = 91 * 4 * 3;
  const estimatedMemoryBytes = fixedTableBytes + (count * bytesPerDraw);

  return {
    drawName: normName,
    drawCount: count,
    isWasmNative: isWasm,
    mode: isWasm ? 'RUST_WASM' : 'SIMD_FALLBACK',
    estimatedMemoryBytes,
    frequencyCheckSum: checkSum,
  };
}

export interface NativePredictionResultHpc {
  top5: number[];
  top10: number[];
  scores: Float64Array;
  shannonEntropy: number;
  hurstExponent: number;
  confidenceScore: number;
}

/**
 * 9. Pipeline d'Inférence Stochastique 100% Natif Local (Rust WASM / Fallback C^∞)
 * Supprime intégralement les appels réseau vers les Edge Functions Supabase pour les prédictions.
 */
export function runNativePredictionHpc(params: {
  flatWinners: Uint8Array | number[];
  numDraws: number;
  frequencyWeight?: number;
  gapWeight?: number;
  markovWeight?: number;
  hurstWeight?: number;
}): NativePredictionResultHpc {
  const flat = params.flatWinners instanceof Uint8Array ? params.flatWinners : new Uint8Array(params.flatWinners);
  const fw = params.frequencyWeight ?? 1.0;
  const gw = params.gapWeight ?? 1.0;
  const mw = params.markovWeight ?? 0.5;
  const hw = params.hurstWeight ?? 0.3;

  if (isWasmLoaded && wasmModuleInstance?.run_native_prediction_pipeline) {
    try {
      const res = wasmModuleInstance.run_native_prediction_pipeline(
        flat,
        params.numDraws,
        fw,
        gw,
        mw,
        hw
      );
      if (res) {
        const top5Raw = readWasmField<number[]>(res, 'top_5', []);
        const top10Raw = readWasmField<number[]>(res, 'top_10', []);
        const scoresRaw = readWasmField<Float64Array>(res, 'scores', new Float64Array(91));
        const entropy = readWasmField<number>(res, 'shannon_entropy', 1.0);
        const hurst = readWasmField<number>(res, 'hurst_exponent', 0.5);
        const conf = readWasmField<number>(res, 'confidence_score', 0.0);

        if (top5Raw && top5Raw.length > 0) {
          return {
            top5: Array.from(top5Raw),
            top10: Array.from(top10Raw),
            scores: new Float64Array(scoresRaw),
            shannonEntropy: entropy,
            hurstExponent: hurst,
            confidenceScore: conf,
          };
        }
      }
    } catch (e) {
      recordWasmFallback('run_native_prediction_pipeline', e);
      console.error('[LOTO-ENGINE] Erreur WASM Native Prediction, passage au fallback :', e);
    }
  }

  // Fallback déterministe vectorisé pur
  const scores = new Float64Array(91);
  const actualDraws = Math.min(params.numDraws, Math.floor(flat.length / 5));
  // Éradication stricte des quintes synthétiques sur historique vide
  if (actualDraws === 0) {
    return {
      top5: [],
      top10: [],
      scores,
      shannonEntropy: 0.0,
      hurstExponent: 0.5,
      confidenceScore: 0.0,
    };
  }

  const freqs = new Int32Array(91);
  const currentGaps = new Int32Array(91);
  const lastSeen = new Uint8Array(91);

  for (let d = 0; d < actualDraws; d++) {
    const offset = d * 5;
    for (let c = 0; c < 5; c++) {
      const n = flat[offset + c];
      if (n >= 1 && n <= 90) {
        freqs[n]++;
        if (!lastSeen[n]) {
          currentGaps[n] = d;
          lastSeen[n] = 1;
        }
      }
    }
  }
  for (let n = 1; n <= 90; n++) {
    if (!lastSeen[n]) currentGaps[n] = actualDraws;
  }

  const totalBalls = actualDraws * 5;
  const expectedGap = 90.0 / 5.0;
  let sumScores = 0.0;

  for (let n = 1; n <= 90; n++) {
    const fScore = (freqs[n] + 1.0) / (totalBalls + 90.0);
    const gRatio = currentGaps[n] / expectedGap;
    const gScore = Math.tanh(Math.min(3.0, gRatio) / 3.0);
    const composite = fw * fScore * 90.0 + gw * gScore;
    scores[n] = composite;
    sumScores += composite;
  }

  // Normalisation sur le simplexe des probabilités marginales de tirage sans remise 5/90 (Sum = 5.0, p_i in [0, 1])
  if (sumScores > 0) {
    for (let n = 1; n <= 90; n++) {
      scores[n] = Math.min(1.0, Math.max(0.0, (scores[n] / sumScores) * 5.0));
    }
    let clampedSum = 0;
    for (let n = 1; n <= 90; n++) clampedSum += scores[n];
    if (clampedSum > 0 && Math.abs(clampedSum - 5.0) > 1e-6) {
      const renormalize = 5.0 / clampedSum;
      for (let n = 1; n <= 90; n++) {
        scores[n] = Math.min(1.0, Math.max(0.0, scores[n] * renormalize));
      }
    }
  }

  let entropy = 0.0;
  const maxEntropy = Math.log(90.0);
  for (let n = 1; n <= 90; n++) {
    const p = scores[n] / 5.0;
    if (p > 1e-9) entropy -= p * Math.log(p);
  }
  const normalizedEntropy = Math.max(0.0, Math.min(1.0, entropy / maxEntropy));

  // Calcul de l'Exposant de Hurst R/S adaptatif sur le signal d'énergie des tirages
  const energySignal = new Float64Array(actualDraws);
  for (let d = 0; d < actualDraws; d++) {
    const offset = d * 5;
    let sumW = 0;
    for (let c = 0; c < 5; c++) sumW += flat[offset + c];
    energySignal[actualDraws - 1 - d] = sumW;
  }
  const hurst = computeRobustHurstHpc(energySignal);

  const indexed: { n: number; s: number }[] = [];
  for (let n = 1; n <= 90; n++) {
    indexed.push({ n, s: scores[n] });
  }
  indexed.sort((a, b) => b.s - a.s || a.n - b.n);

  const top5 = indexed.slice(0, 5).map(x => x.n);
  const top10 = indexed.slice(0, 10).map(x => x.n);

  // Confiance continue différentiable C^∞ combinatoire :
  // - Baseline théorique exacte : P(Hit >= 1) dans un tirage 5/90 = 1 - C(85,5)/C(90,5)
  //   calculée par coefficients binomiaux exacts — zéro constante en dur
  // - Saturation d'échantillon w_N = 1 - exp(-actualDraws / 90)
  // - Gain d'information Shannon I = 1 - normalizedEntropy
  // - Écart au bruit brownien d_H = 2 * |hurst - 0.5|
  const pHitBase = hypergeometricTail(1, 5, 5, 90) * 100.0;
  const sampleSaturation = 1.0 - Math.exp(-actualDraws / 90.0);
  const infoDivergence = 1.0 - normalizedEntropy;
  const hurstDivergence = Math.abs(hurst - 0.5) * 2.0;
  const confidence = Math.max(
    10.0,
    Math.min(95.0, pHitBase + (95.0 - pHitBase) * sampleSaturation * (0.7 * infoDivergence + 0.3 * hurstDivergence))
  );

  return {
    top5,
    top10,
    scores,
    shannonEntropy: normalizedEntropy,
    hurstExponent: hurst,
    confidenceScore: confidence,
  };
}

export interface PriorAnalysisReportHpc {
  shannonEntropy: number;
  hurstExponent: number;
  dominantPeriod: number;
  spectralEnergy: number;
  thermalVolatility: number;
  regimeLabel: string;
}

export interface PredictionPortfolioHpc {
  tickets: number[][];
  strategies: string[];
  scores: Float64Array;
  ticketCount: number;
  uniqueNumbersCovered: number;
  diversityJaccardDistance: number;
  shannonEntropy: number;
  hurstExponent: number;
  confidenceScore: number;
  predictionMode?: 'CALIBRATED' | 'UNIFORM_RANDOM' | 'INSUFFICIENT_HISTORY';
}

type PredictionMode = 'CALIBRATED' | 'UNIFORM_RANDOM' | 'INSUFFICIENT_HISTORY';

/** Normalise le mode déclaré par le moteur Rust (transparence Skill Gate) */
function normalizePredictionMode(raw: unknown): PredictionMode {
  return raw === 'UNIFORM_RANDOM' || raw === 'INSUFFICIENT_HISTORY' ? raw : 'CALIBRATED';
}

/** Hachage FNV-1a 64-bit (BigInt) — seed déterministe miroir du moteur Rust */
function fnv1a64(bytes: ArrayLike<number>): number {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (let i = 0; i < bytes.length; i++) {
    hash = (hash ^ BigInt(bytes[i] & 0xff)) & mask;
    hash = (hash * prime) & mask;
  }
  // Réduction en entier signé 53 bits compatible Number
  return Number(hash % (1n << 53n));
}

/** LCG déterministe 64-bit (miroir TS de combinatorics::DeterministicLcg) */
function createDeterministicLcg(seed: number): () => number {
  let state = seed === 0 ? 0x9e3779b9 : seed >>> 0;
  return () => {
    state = (Math.imul(state, 636413622) + 1442695041) >>> 0;
    return state / 4294967296;
  };
}

/** Coefficient binomial exact par produit multiplicatif (n <= 90, aucun débordement f64) */
function binomialExact(n: number, k: number): number {
  if (k > n) return 0;
  k = Math.min(k, n - k);
  let result = 1;
  for (let i = 0; i < k; i++) {
    result = (result * (n - i)) / (i + 1);
  }
  return Math.round(result);
}

/** Queue hypergéométrique exacte P(X >= minHits) pour un ticket 5/90 */
function hypergeometricTail(minHits: number, ticketSize: number, winners: number, pool: number): number {
  const total = binomialExact(pool, ticketSize);
  let favorable = 0;
  const iMax = Math.min(ticketSize, winners);
  for (let i = minHits; i <= iMax; i++) {
    favorable += binomialExact(winners, i) * binomialExact(pool - winners, ticketSize - i);
  }
  return favorable / total;
}

/** Référence Brier d'un tirage uniforme 5/90 : (5*85)/90² (constante combinatoire exacte) */
const UNIFORM_BRIER_REFERENCE = (5 * 85) / (90 * 90);

/**
 * Skill Gate fallback honnête : mini Walk-Forward Brier Skill Score déterministe
 * calculé sur l'historique JS. Si BSS ≤ 0, le canal n'a pas de valeur prédictive
 * démontrée et la génération uniforme doit être préférée (affichée clairement).
 */
function computeFallbackSkillGate(drawName: string): number {
  const normName = drawName.trim().toUpperCase();
  const timeline = fallbackStoreTimelines.get(normName);
  const history = timeline?.history || [];
  const len = history.length;
  if (len < 8) return 0;

  const startT = Math.max(5, len - 20);
  let totalBrier = 0;
  let samples = 0;

  for (let t = startT; t < len; t++) {
    const freqs = new Int32Array(91);
    const gaps = new Int32Array(91);
    const lastSeen = new Uint8Array(91);
    for (let d = t - 1; d >= 0; d--) {
      for (const w of history[d].winners) {
        if (w >= 1 && w <= 90) {
          freqs[w]++;
          if (!lastSeen[w]) {
            gaps[w] = t - 1 - d;
            lastSeen[w] = 1;
          }
        }
      }
    }
    for (let n = 1; n <= 90; n++) {
      if (!lastSeen[n]) gaps[n] = t;
    }
    const totalBalls = t * 5;
    const scores = new Float64Array(91);
    let sum = 0;
    for (let n = 1; n <= 90; n++) {
      const f = (freqs[n] + 1.0) / (totalBalls + 90.0);
      const g = Math.tanh(Math.min(3.0, gaps[n] / 18.0) / 3.0);
      scores[n] = f * 90.0 * 0.5 + g * 0.5;
      sum += scores[n];
    }
    let brier = 0;
    if (sum > 0) {
      for (let n = 1; n <= 90; n++) {
        const p = Math.min(1.0, Math.max(0.0, (scores[n] / sum) * 5.0));
        const y = history[t].winners.includes(n) ? 1 : 0;
        brier += (p - y) * (p - y);
      }
    }
    totalBrier += brier / 90;
    samples++;
  }

  if (samples === 0) return 0;
  const meanBrier = totalBrier / samples;
  return Math.max(-1, Math.min(1, 1 - meanBrier / UNIFORM_BRIER_REFERENCE));
}

/** P(X >= 3) d'une somme de 5 Bernoulli hétérogènes (Poisson-binomiale exacte, DP) */
function poissonBinomialGe3(probs: number[]): number {
  let dp = [1, 0, 0, 0, 0, 0];
  for (const raw of probs) {
    const p = Math.min(1, Math.max(0, raw));
    const next = [0, 0, 0, 0, 0, 0];
    for (let k = 0; k <= 5; k++) {
      next[k] += dp[k] * (1 - p);
      if (k > 0) next[k] += dp[k - 1] * p;
    }
    dp = next;
  }
  return dp[3] + dp[4] + dp[5];
}

/**
 * 10. Analyse Préalable Exhaustive en RAM (Hurst, Spectre FFT, Entropie, Volatilité)
 * Exécutée directement dans le moteur Rust avant toute génération prédictive.
 */
export function analyzeDrawHistoryHpc(drawName: string): PriorAnalysisReportHpc {
  const normName = drawName.trim().toUpperCase();
  const store = getOrCreateNativeStoreInstance();
  if (store && typeof store.analyze_draw === 'function') {
    try {
      const rep = store.analyze_draw(normName);
      if (rep) {
        return {
          shannonEntropy: readWasmField<number>(rep, 'shannon_entropy', 1.0),
          hurstExponent: readWasmField<number>(rep, 'hurst_exponent', 0.5),
          dominantPeriod: readWasmField<number>(rep, 'dominant_period', 18.0),
          spectralEnergy: readWasmField<number>(rep, 'spectral_energy', 0.0),
          thermalVolatility: readWasmField<number>(rep, 'thermal_volatility', 1.0),
          regimeLabel: readWasmField<string>(rep, 'regime_label', 'INIT_DIFFUSION'),
        };
      }
    } catch (e) {
      recordWasmFallback('analyze_draw', e);
      console.warn('[LOTO-ENGINE] Erreur analyze_draw WASM, passage au fallback :', e);
    }
  }

  // Fallback déterministe
  const timeline = fallbackStoreTimelines.get(normName);
  const history = timeline?.history || [];
  if (history.length < 5) {
    return {
      shannonEntropy: 1.0,
      hurstExponent: 0.5,
      dominantPeriod: 18.0,
      spectralEnergy: 0.0,
      thermalVolatility: 0.5,
      regimeLabel: 'INIT_DIFFUSION',
    };
  }

  const sampleSize = Math.min(history.length, 256);
  const signal = new Float64Array(sampleSize);
  for (let i = 0; i < sampleSize; i++) {
    const d = history[history.length - 1 - i];
    let sum = 0;
    for (const w of d.winners) sum += w;
    signal[i] = sum;
  }

  const hurst = computeRobustHurstHpc(signal);
  const psd = computeFftPowerSpectrumHpc(signal);
  let maxPsd = 0;
  let maxIdx = 0;
  let totalEnergy = 0;
  for (let i = 1; i < psd.length; i++) {
    totalEnergy += psd[i];
    if (psd[i] > maxPsd) {
      maxPsd = psd[i];
      maxIdx = i;
    }
  }
  const dominantPeriod = maxIdx > 0 && psd.length > 0 ? psd.length / maxIdx : 18.0;

  const freqs = timeline?.frequencies || new Int32Array(91);
  const totalBalls = history.length * 5;
  let entropy = 0;
  const maxEntropy = Math.log(90.0);
  for (let n = 1; n <= 90; n++) {
    const p = (freqs[n] + 1.0) / (totalBalls + 90.0);
    if (p > 1e-9) entropy -= p * Math.log(p);
  }
  const normalizedEntropy = Math.max(0.0, Math.min(1.0, entropy / maxEntropy));

  const regimeLabel = hurst > 0.55
    ? 'PERSISTENT_ATTRACTOR'
    : hurst < 0.45
    ? 'MEAN_REVERTING'
    : 'STOCHASTIC_DIFFUSION';

  return {
    shannonEntropy: normalizedEntropy,
    hurstExponent: hurst,
    dominantPeriod,
    spectralEnergy: totalEnergy,
    thermalVolatility: 1.0,
    regimeLabel,
  };
}

/**
 * 11. Génération de Portefeuille Multi-Tickets Diversifiés (Rust Core HPC)
 * Remplace la génération d'un seul ticket par un portefeuille complet sans monoculture.
 */
export function generateDiversifiedPortfolioHpc(
  drawName: string,
  numTickets: number = 5
): PredictionPortfolioHpc {
  const normName = drawName.trim().toUpperCase();
  const kTickets = Math.max(1, Math.min(8, numTickets));
  const store = getOrCreateNativeStoreInstance();

  if (store && typeof store.generate_portfolio === 'function') {
    try {
      const port = store.generate_portfolio(normName, kTickets);
      if (port) {
        const rawFlat = readWasmField<any>(port, 'tickets_flat', []);
        const flatTickets: number[] = Array.from(rawFlat as Iterable<number>);
        const rawStrat = readWasmField<any>(port, 'strategies', []);
        const strategies: string[] = Array.from(rawStrat as Iterable<string>);
        const rawScores = readWasmField<any>(port, 'scores_flat', new Float64Array(91));
        const ticketCount = readWasmField<number>(port, 'ticket_count', 0);

        if (flatTickets.length >= 5 && ticketCount > 0) {
          const tickets: number[][] = [];
          for (let i = 0; i < ticketCount; i++) {
            tickets.push(flatTickets.slice(i * 5, (i + 1) * 5));
          }
          return {
            tickets,
            strategies,
            scores: new Float64Array(rawScores as ArrayLike<number>),
            ticketCount,
            uniqueNumbersCovered: readWasmField<number>(port, 'unique_numbers_covered', 0),
            diversityJaccardDistance: readWasmField<number>(port, 'diversity_jaccard_distance', 0.8),
            shannonEntropy: readWasmField<number>(port, 'shannon_entropy', 1.0),
            hurstExponent: readWasmField<number>(port, 'hurst_exponent', 0.5),
            confidenceScore: readWasmField<number>(port, 'confidence_score', 0.0),
            // Mode honnête déclaré par le moteur Rust (Skill Gate BSS ≤ 0 => UNIFORM_RANDOM)
            predictionMode: normalizePredictionMode(readWasmField<string>(port, 'prediction_mode', 'CALIBRATED')),
          };
        }
      }
    } catch (e) {
      recordWasmFallback('generate_portfolio', e);
      console.warn('[LOTO-ENGINE] Erreur generate_portfolio WASM, passage au fallback :', e);
    }
  }

  // Fallback déterministe JS
  const prior = analyzeDrawHistoryHpc(drawName);
  const freqs = getStoreFrequencies(drawName);
  const gaps = getStoreCurrentGaps(drawName);
  const drawCount = getStoreDrawCount(drawName);

  if (drawCount < 5) {
    throw new Error(`INSUFFICIENT_HISTORY: historique insuffisant pour ${drawName} (minimum 5 requis)`);
  }

  const baseScores = new Float64Array(91);
  const totalBalls = Math.max(1, drawCount * 5);
  const expectedGap = 90.0 / 5.0;

  for (let n = 1; n <= 90; n++) {
    const fScore = (freqs[n] + 1.0) / (totalBalls + 90.0);
    const gRatio = gaps[n] / expectedGap;
    const gScore = Math.tanh(Math.min(3.0, gRatio) / 3.0);
    // Poids 0.5/0.5 identiques au moteur Rust (l'échelle absolue est absorbée par le simplexe)
    baseScores[n] = fScore * 90.0 * 0.5 + gScore * 0.5;
  }

  // Normalisation sur le simplexe marginal de 5 boules (Sum = 5.0)
  let sumB = 0;
  for (let n = 1; n <= 90; n++) sumB += baseScores[n];
  if (sumB > 0) {
    for (let n = 1; n <= 90; n++) {
      baseScores[n] = Math.min(1.0, (baseScores[n] / sumB) * 5.0);
    }
  }

  // 1. Skill Gate fallback honnête : BSS Walk-Forward déterministe
  const fallbackBss = computeFallbackSkillGate(drawName);
  const useUniformMode = fallbackBss <= 0;

  let tickets: number[][] = [];
  const selectionCounts = new Int32Array(91);

  if (useUniformMode) {
    // Génération uniforme déclarée : LCG seedé par FNV-1a de l'historique réel
    const timeline = fallbackStoreTimelines.get(normName);
    const seedBytes: number[] = [];
    for (const d of timeline?.history || []) {
      for (const w of d.winners) seedBytes.push(w);
    }
    const rng = createDeterministicLcg(fnv1a64(seedBytes));
    for (let t = 0; t < kTickets; t++) {
      const pool = Array.from({ length: 90 }, (_, i) => i + 1);
      for (let i = 0; i < 5; i++) {
        const j = i + Math.floor(rng() * (90 - i));
        [pool[i], pool[j]] = [pool[j], pool[i]];
      }
      const ticket = pool.slice(0, 5).sort((a, b) => a - b);
      for (const n of ticket) selectionCounts[n]++;
      tickets.push(ticket);
    }
    for (let n = 1; n <= 90; n++) baseScores[n] = 5.0 / 90.0;
  } else {
    // Répulsion dérivée de la pression de sélection : gamma = clamp(K*5/90, 0.05, 0.98)
    const gamma = Math.max(0.05, Math.min(0.98, (kTickets * 5) / 90));
    for (let t = 0; t < kTickets; t++) {
      const penalized = new Float64Array(baseScores);
      for (let n = 1; n <= 90; n++) {
        if (selectionCounts[n] > 0) {
          penalized[n] *= Math.exp(-gamma * selectionCounts[n]);
        }
        if (t === 2) {
          // Boost Poisson pour le ticket outsiders (amplitude dérivée du poids du canal écart)
          penalized[n] *= 1.0 + (Math.min(2.5, gaps[n] / expectedGap) / 2.5);
        }
      }

      const indexed: { n: number; s: number }[] = [];
      for (let n = 1; n <= 90; n++) indexed.push({ n, s: penalized[n] });
      indexed.sort((a, b) => b.s - a.s || a.n - b.n);

      const ticket = indexed.slice(0, 5).map(x => x.n).sort((a, b) => a - b);
      for (const n of ticket) selectionCounts[n]++;
      tickets.push(ticket);
    }
  }

  let uniqueCovered = 0;
  for (let n = 1; n <= 90; n++) {
    if (selectionCounts[n] > 0) uniqueCovered++;
  }

  // Calcul de la distance de Jaccard moyenne réelle inter-tickets (diversité empirique)
  let totalJaccard = 0;
  let pairCount = 0;
  for (let i = 0; i < tickets.length; i++) {
    for (let j = i + 1; j < tickets.length; j++) {
      const t1 = tickets[i];
      const t2 = tickets[j];
      let common = 0;
      for (const n1 of t1) {
        if (t2.includes(n1)) common++;
      }
      const unionLen = 10 - common;
      totalJaccard += 1.0 - (common / unionLen);
      pairCount++;
    }
  }
  const avgJaccard = pairCount > 0 ? totalJaccard / pairCount : 1.0;

  // 2. Objectif de portefeuille explicite : P(au moins un ticket >= 3 bons numéros)
  //    Probabilité par ticket : hypergéométrique exacte en mode uniforme,
  //    Poisson-binomiale exacte sur les marginales en mode calibré.
  let survival = 1.0;
  for (const ticket of tickets) {
    const pGe3 = useUniformMode
      ? hypergeometricTail(3, 5, 5, 90)
      : poissonBinomialGe3(ticket.map(num => baseScores[num]));
    survival *= 1.0 - pGe3;
  }
  const confidence = Math.max(0, Math.min(100, (1.0 - survival) * 100.0));

  return {
    tickets,
    strategies: tickets.map((_, t) =>
      useUniformMode
        ? 'UNIFORM_RANDOM_LCG'
        : ['ATTRACTEUR_CENTRAL', 'RESONANCE_DOMINO', 'POISSON_OUTSIDERS', 'PHASE_SPECTRALE_FFT', 'EQUILIBRE_THERMODYNAMIQUE'][t % 5]
    ),
    scores: baseScores,
    ticketCount: kTickets,
    uniqueNumbersCovered: uniqueCovered,
    diversityJaccardDistance: avgJaccard,
    shannonEntropy: prior.shannonEntropy,
    hurstExponent: prior.hurstExponent,
    confidenceScore: confidence,
    predictionMode: useUniformMode ? 'UNIFORM_RANDOM' : 'CALIBRATED',
  };
}

/**
 * 12. Identification du Réseau Hermétique (AGENTS.md)
 * Associe chaque tirage à son réseau ('hebdomadaire' vs 'quotidien').
 */
const WEEKLY_DRAWS_CANONICAL = new Set([
  'MONDAY SPECIAL', 'MONDAY_SPECIAL',
  'LUCKY TUESDAY', 'LUCKY_TUESDAY',
  'MIDWEEK',
  'FORTUNE THURSDAY', 'FORTUNE_THURSDAY',
  'FRIDAY BONANZA', 'FRIDAY_BONANZA',
  'NATIONAL'
]);

export function getStoreNetworkId(drawName: string): 'hebdomadaire' | 'quotidien' {
  const normName = drawName.trim().toUpperCase().replace(/[\s-]+/g, '_');
  const store = getOrCreateNativeStoreInstance();
  if (store && typeof store.get_network_id === 'function') {
    try {
      const net = store.get_network_id(normName);
      if (net === 'hebdomadaire' || net === 'quotidien') {
        return net;
      }
    } catch {}
  }
  return WEEKLY_DRAWS_CANONICAL.has(normName) || WEEKLY_DRAWS_CANONICAL.has(normName.replace(/_/g, ' '))
    ? 'hebdomadaire'
    : 'quotidien';
}

/**
 * Génère la clé de cache isolée strictement conforme à AGENTS.md :
 * nexus_interdraw_${networkId}_${drawName}
 */
export function getInterDrawCacheKey(drawName: string, subKey?: string): string {
  const normName = drawName.trim().toLowerCase().replace(/[\s-]+/g, '_');
  const networkId = getStoreNetworkId(drawName);
  return `nexus_interdraw_${networkId}_${normName}${subKey ? `_${subKey}` : ''}`;
}

/**
 * 13. Couplage Continu d'Interconnexion Inter-Tirages (Rust Core HPC)
 * Mesure la dépendance statistique continue entre deux tirages du même réseau.
 * Zéro seuil binaire, zéro coupure brutale : poids continu dans ]0.0, 1.0[.
 */
export function computeInterDrawCouplingHpc(drawA: string, drawB: string): number {
  const normA = drawA.trim().toUpperCase();
  const normB = drawB.trim().toUpperCase();
  const store = getOrCreateNativeStoreInstance();

  if (store && typeof store.compute_interdraw_coupling === 'function') {
    try {
      const w = store.compute_interdraw_coupling(normA, normB);
      if (typeof w === 'number' && Number.isFinite(w)) {
        return Math.max(0.001, Math.min(0.999, w));
      }
    } catch {}
  }

  // Fallback déterministe C^∞
  const freqsA = getStoreFrequencies(normA);
  const freqsB = getStoreFrequencies(normB);

  let sumA = 0;
  let sumB = 0;
  for (let i = 1; i <= 90; i++) {
    sumA += freqsA[i];
    sumB += freqsB[i];
  }
  const meanA = sumA / 90.0;
  const meanB = sumB / 90.0;

  let num = 0;
  let varA = 0;
  let varB = 0;
  for (let i = 1; i <= 90; i++) {
    const da = freqsA[i] - meanA;
    const db = freqsB[i] - meanB;
    num += da * db;
    varA += da * da;
    varB += db * db;
  }
  const den = Math.sqrt(varA * varB);
  const r = den > 1e-9 ? Math.max(-1.0, Math.min(1.0, num / den)) : 0.0;
  return 0.5 * (1.0 + Math.tanh(2.0 * r));
}

export interface NetworkDominoResultHpc {
  dominoEnergies: Float64Array;
  leadTriggerNumbers: number[];
  kineticDissipationRate: number;
}

/**
 * 14. Effet Domino & Advection Cinétique Déterministe en RAM (Rust Core HPC)
 * Propage l'énergie cinétique le long des tirages récents du réseau.
 */
export function computeNetworkDominoHpc(
  drawName: string,
  dampingGamma: number = 0.5
): NetworkDominoResultHpc {
  const normName = drawName.trim().toUpperCase();
  const gamma = Math.max(0.05, Math.min(2.0, dampingGamma));
  const store = getOrCreateNativeStoreInstance();

  if (store && typeof store.compute_network_domino_wasm === 'function') {
    try {
      const res = store.compute_network_domino_wasm(normName, gamma);
      if (res) {
        const energies = readWasmField<Float64Array>(res, 'domino_energies', new Float64Array(91));
        const triggers = readWasmField<number[]>(res, 'lead_trigger_numbers', []);
        const rate = readWasmField<number>(res, 'kinetic_dissipation_rate', gamma);
        return {
          dominoEnergies: new Float64Array(energies),
          leadTriggerNumbers: Array.from(triggers),
          kineticDissipationRate: rate,
        };
      }
    } catch {}
  }

  // Fallback déterministe C^∞
  const timeline = fallbackStoreTimelines.get(normName);
  const history = timeline?.history || [];
  const maxDraws = Math.min(history.length, 30);
  const dominoEnergies = new Float64Array(91);

  if (maxDraws === 0) {
    return {
      dominoEnergies,
      leadTriggerNumbers: [],
      kineticDissipationRate: gamma,
    };
  }

  for (let d = 0; d < maxDraws; d++) {
    const lag = d + 1;
    const attenuation = Math.exp(-gamma * lag * 0.25);
    const draw = history[history.length - 1 - d];
    for (const num of draw.winners) {
      if (num >= 1 && num <= 90) {
        dominoEnergies[num] += 10.0 * attenuation;
        // Miroir diacritique
        if (num >= 10 && num <= 90) {
          const mir = (num % 10) * 10 + Math.floor(num / 10);
          if (mir >= 1 && mir <= 90 && mir !== num) {
            dominoEnergies[mir] += 4.5 * attenuation;
          }
        }
        // Complémentaire 91
        const comp = 91 - num;
        if (comp >= 1 && comp <= 90 && comp !== num) {
          dominoEnergies[comp] += 4.0 * attenuation;
        }
      }
    }
  }

  // Normalisation sigmoïde continue sur [0, 100]
  const indexed: { n: number; e: number }[] = [];
  for (let n = 1; n <= 90; n++) {
    const raw = dominoEnergies[n];
    const score = 100.0 / (1.0 + Math.exp(-0.15 * (raw - 8.0)));
    dominoEnergies[n] = Math.round(score * 100.0) / 100.0;
    indexed.push({ n, e: dominoEnergies[n] });
  }

  indexed.sort((a, b) => b.e - a.e || a.n - b.n);
  const leadTriggerNumbers = indexed.slice(0, 5).map(x => x.n);

  return {
    dominoEnergies,
    leadTriggerNumbers,
    kineticDissipationRate: gamma,
  };
}

export interface DecileCalibrationBucket {
  decile: number;
  meanPredicted: number;
  meanObserved: number;
  count: number;
}

export interface CalibrationReportHpc {
  brierScore: number;
  brierSkillScore: number;
  plattAlpha: number;
  plattBeta: number;
  empiricalReliabilityScore: number;
  evaluatedWindows: number;
  calibrationQualityLabel: string;
  logLoss: number;
  ece: number;
  liftVsRandom: number;
  meanHits: number;
  holdoutBrierSkillScore: number;
  holdoutDraws: number;
  blockBootstrapBssMean: number;
  blockBootstrapBssStd: number;
  decileCalibration: DecileCalibrationBucket[];
  channelWeights?: Record<string, number>;
}

const UNIFORM_BRIER_BENCHMARK = (5.0 * 85.0) / (90.0 * 90.0);

/**
 * 15. Calibration Empirique Out-Of-Fold & Validation Walk-Forward (Rust Core HPC)
 * Mesure l'erreur de Brier rétrospective sans fuite de données et calibre les probabilités.
 */
export function computeWalkForwardCalibrationHpc(
  drawName: string,
  windowSize: number = 15,
  historyOverride?: any[]
): CalibrationReportHpc {
  const normName = drawName.trim().toUpperCase();
  const wSize = Math.max(4, Math.min(30, windowSize));

  const defaultDeciles: DecileCalibrationBucket[] = Array.from({ length: 10 }, (_, i) => ({
    decile: i + 1,
    meanPredicted: Math.round(((i + 0.5) / 10.0 * (5.0 / 90.0)) * 10000.0) / 10000.0,
    meanObserved: 5.0 / 90.0,
    count: 0,
  }));

  // Si aucun historique spécifique n'est fourni, tenter d'interroger le store natif WASM
  if (!historyOverride || historyOverride.length === 0) {
    const store = getOrCreateNativeStoreInstance();
    if (store && typeof store.compute_walk_forward_calibration === 'function') {
      try {
        const rep = store.compute_walk_forward_calibration(normName, wSize);
        if (rep) {
          return {
            brierScore: readWasmField<number>(rep, 'brier_score', UNIFORM_BRIER_BENCHMARK),
            brierSkillScore: readWasmField<number>(rep, 'brier_skill_score', 0.0),
            plattAlpha: readWasmField<number>(rep, 'platt_alpha', 1.0),
            plattBeta: readWasmField<number>(rep, 'platt_beta', 0.0),
            empiricalReliabilityScore: readWasmField<number>(rep, 'empirical_reliability_score', 50.0),
            evaluatedWindows: readWasmField<number>(rep, 'evaluated_windows', 0),
            calibrationQualityLabel: readWasmField<string>(rep, 'calibration_quality_label', 'DIFFUSION_EQUIPROBABLE_NEUTRE'),
            logLoss: readWasmField<number>(rep, 'log_loss', 0.0),
            ece: readWasmField<number>(rep, 'ece', 0.0),
            liftVsRandom: readWasmField<number>(rep, 'lift_vs_random', 1.0),
            meanHits: readWasmField<number>(rep, 'mean_hits', 0.0),
            holdoutBrierSkillScore: readWasmField<number>(rep, 'holdout_brier_skill_score', 0.0),
            holdoutDraws: readWasmField<number>(rep, 'holdout_draws', 0),
            blockBootstrapBssMean: readWasmField<number>(rep, 'block_bootstrap_bss_mean', 0.0),
            blockBootstrapBssStd: readWasmField<number>(rep, 'block_bootstrap_bss_std', 0.0),
            decileCalibration: defaultDeciles,
          };
        }
      } catch {}
    }
  }

  // Historique causal borné (sans fuite de données futures)
  let history: FallbackDraw[] = [];
  if (historyOverride && historyOverride.length > 0) {
    const raw = historyOverride.map((d: any) => ({
      timestamp: typeof d.date === 'string' ? new Date(d.date).getTime() / 1000 : (d.timestamp || 0),
      winners: (d.gagnants || d.winners || []).slice(0, 5),
      machine: (d.machine || []).slice(0, 5),
      mask: 0n,
    }));
    // S'assurer de l'ordre chronologique croissant (du plus ancien au plus récent)
    // Dans context.history, index 0 est le plus récent : on inverse pour l'analyse walk-forward
    history = (raw.length > 1 && raw[0].timestamp >= raw[raw.length - 1].timestamp)
      ? [...raw].reverse()
      : [...raw];
  } else {
    const timeline = fallbackStoreTimelines.get(normName);
    history = timeline?.history || [];
  }
  const totalDraws = history.length;

  if (totalDraws < 8) {
    return {
      brierScore: UNIFORM_BRIER_BENCHMARK,
      brierSkillScore: 0.0,
      plattAlpha: 1.0,
      plattBeta: 0.0,
      empiricalReliabilityScore: 50.0,
      evaluatedWindows: 0,
      calibrationQualityLabel: 'HISTORIQUE_INSUFFISANT',
      logLoss: 0.0,
      ece: 0.0,
      liftVsRandom: 1.0,
      meanHits: 0.0,
      holdoutBrierSkillScore: 0.0,
      holdoutDraws: 0,
      blockBootstrapBssMean: 0.0,
      blockBootstrapBssStd: 0.0,
      decileCalibration: defaultDeciles,
    };
  }

  const evalWindow = Math.min(wSize, totalDraws - 4);
  const startIdx = totalDraws - evalWindow;
  let totalBrier = 0.0;
  let totalLogLoss = 0.0;
  let totalHits = 0;
  let numSamples = 0;

  let sumRaw = 0.0;
  let sumTarget = 0.0;
  let sumRawSq = 0.0;
  let sumProd = 0.0;
  let totalPairs = 0;

  const bucketPredSum = new Float64Array(10);
  const bucketObsSum = new Float64Array(10);
  const bucketCounts = new Uint32Array(10);

  for (let t = startIdx; t < totalDraws; t++) {
    const training = history.slice(0, t);
    const target = history[t];
    const nTrain = training.length;

    const freqs = new Int32Array(91);
    const gaps = new Int32Array(91);
    const lastSeen = new Uint8Array(91);

    for (let d = 0; d < nTrain; d++) {
      const draw = training[nTrain - 1 - d];
      for (const w of draw.winners) {
        if (w >= 1 && w <= 90) {
          freqs[w]++;
          if (!lastSeen[w]) {
            gaps[w] = d;
            lastSeen[w] = 1;
          }
        }
      }
    }
    for (let n = 1; n <= 90; n++) {
      if (!lastSeen[n]) gaps[n] = nTrain;
    }

    const totalBalls = nTrain * 5;
    const expectedGap = 90.0 / 5.0;
    const scores = new Float64Array(91);
    let sumScores = 0.0;

    for (let n = 1; n <= 90; n++) {
      const fScore = (freqs[n] + 1.0) / (totalBalls + 90.0);
      const gRatio = gaps[n] / expectedGap;
      const gScore = Math.tanh(Math.min(3.0, gRatio) / 3.0);
      const composite = fScore * 45.0 + gScore * 1.5;
      scores[n] = composite;
      sumScores += composite;
    }

    // Projection simplexe marginal Sum = 5.0
    if (sumScores > 0) {
      for (let n = 1; n <= 90; n++) {
        scores[n] = Math.min(1.0, (scores[n] / sumScores) * 5.0);
      }
    }

    let windowBrier = 0.0;
    const targetSet = new Set(target.winners);

    for (let n = 1; n <= 90; n++) {
      const y = targetSet.has(n) ? 1.0 : 0.0;
      const p = scores[n];
      const err = p - y;
      windowBrier += err * err;

      const pClamp = Math.max(1e-9, Math.min(1.0 - 1e-9, p));
      totalLogLoss += -(y * Math.log(pClamp) + (1.0 - y) * Math.log(1.0 - pClamp));

      // Bucket décile pour ECE
      const bIdx = Math.min(9, Math.max(0, Math.floor(pClamp * 10)));
      bucketPredSum[bIdx] += pClamp;
      bucketObsSum[bIdx] += y;
      bucketCounts[bIdx]++;

      sumRaw += p;
      sumTarget += y;
      sumRawSq += p * p;
      sumProd += p * y;
      totalPairs++;
    }

    // Hit rate top 5
    const indexed: { n: number; s: number }[] = [];
    for (let n = 1; n <= 90; n++) indexed.push({ n, s: scores[n] });
    indexed.sort((a, b) => b.s - a.s || a.n - b.n);

    for (let i = 0; i < 5; i++) {
      if (targetSet.has(indexed[i].n)) totalHits++;
    }

    totalBrier += windowBrier / 90.0;
    numSamples++;
  }

  const meanBrier = numSamples > 0 ? totalBrier / numSamples : UNIFORM_BRIER_BENCHMARK;
  const brierSkillScore = Math.max(-1.0, Math.min(1.0, 1.0 - (meanBrier / UNIFORM_BRIER_BENCHMARK)));
  const meanLogLoss = totalPairs > 0 ? totalLogLoss / totalPairs : 0.0;

  // Calcul ECE (Expected Calibration Error) sur les 10 déciles
  let eceAcc = 0.0;
  const decileBuckets: DecileCalibrationBucket[] = [];
  for (let b = 0; b < 10; b++) {
    const cnt = bucketCounts[b];
    const meanP = cnt > 0 ? bucketPredSum[b] / cnt : ((b + 0.5) / 10.0) * (5.0 / 90.0);
    const meanO = cnt > 0 ? bucketObsSum[b] / cnt : (5.0 / 90.0);
    if (cnt > 0 && totalPairs > 0) {
      eceAcc += Math.abs(meanP - meanO) * (cnt / totalPairs);
    }
    decileBuckets.push({
      decile: b + 1,
      meanPredicted: Math.round(meanP * 10000.0) / 10000.0,
      meanObserved: Math.round(meanO * 10000.0) / 10000.0,
      count: cnt,
    });
  }

  let plattAlpha = 1.0;
  let plattBeta = 0.0;
  if (totalPairs > 10) {
    const nF = totalPairs;
    const meanX = sumRaw / nF;
    const meanY = sumTarget / nF;
    const cov = sumProd - nF * meanX * meanY;
    const varX = sumRawSq - nF * meanX * meanX;
    plattAlpha = varX > 1e-9 ? Math.max(0.5, Math.min(3.0, cov / varX)) : 1.0;
    plattBeta = Math.max(-2.0, Math.min(2.0, meanY - plattAlpha * meanX));
  }

  const baseSkill = brierSkillScore * 50.0 + 50.0;
  const avgHits = numSamples > 0 ? totalHits / numSamples : 0.0;
  const reliability = Math.max(10.0, Math.min(98.0, baseSkill * 0.7 + avgHits * 30.0));
  const expectedHitsUniform = 25.0 / 90.0;
  const liftVsRandom = expectedHitsUniform > 0 ? avgHits / expectedHitsUniform : 1.0;

  const qualityLabel = brierSkillScore > 0.08
    ? 'HAUTE_CALIBRATION_EMPIRIQUE'
    : brierSkillScore > 0.01
    ? 'CALIBRATION_STOCHASTIQUE_STABLE'
    : 'DIFFUSION_EQUIPROBABLE_NEUTRE';

  return {
    brierScore: Math.round(meanBrier * 10000.0) / 10000.0,
    brierSkillScore: Math.round(brierSkillScore * 10000.0) / 10000.0,
    plattAlpha: Math.round(plattAlpha * 1000.0) / 1000.0,
    plattBeta: Math.round(plattBeta * 1000.0) / 1000.0,
    empiricalReliabilityScore: Math.round(reliability * 10.0) / 10.0,
    evaluatedWindows: numSamples,
    calibrationQualityLabel: qualityLabel,
    logLoss: Math.round(meanLogLoss * 10000.0) / 10000.0,
    ece: Math.round(eceAcc * 10000.0) / 10000.0,
    liftVsRandom: Math.round(liftVsRandom * 1000.0) / 1000.0,
    meanHits: Math.round(avgHits * 1000.0) / 1000.0,
    holdoutBrierSkillScore: 0.0,
    holdoutDraws: 0,
    blockBootstrapBssMean: 0.0,
    blockBootstrapBssStd: 0.0,
    decileCalibration: decileBuckets,
  };
}

/**
 * 16. Optimisation Stacking des Canaux sur Simplexe L2 (Exponentiated Gradient)
 * Minimise la log-loss empirique OOF sous contrainte Sum w_k = 1.0 et w_k >= 0.
 */
export function computeStackedChannelWeightsHpc(
  oofFlat: Float64Array | number[],
  targetsFlat: Float64Array | number[],
  numChannels: number,
  numSamples: number
): Float64Array {
  // 1. Appel WASM natif Rust SIMD si le module est présent
  if (wasmModuleInstance && typeof wasmModuleInstance.stack_channel_weights_wasm === 'function') {
    try {
      const oofF64 = oofFlat instanceof Float64Array ? oofFlat : new Float64Array(oofFlat);
      const tgtF64 = targetsFlat instanceof Float64Array ? targetsFlat : new Float64Array(targetsFlat);
      const res = wasmModuleInstance.stack_channel_weights_wasm(oofF64, tgtF64, numChannels, numSamples);
      if (res && res.length === numChannels) {
        return res instanceof Float64Array ? res : new Float64Array(res);
      }
    } catch {}
  }

  // 2. Fallback déterministe Exponentiated Gradient L2 (AGENTS.md)
  const TOTAL_NUMBERS = 90;
  const NUMBERS_PER_DRAW = 5;
  const stride = TOTAL_NUMBERS + 1;
  const weights = new Float64Array(numChannels);
  const uniformW = 1.0 / Math.max(1, numChannels);
  for (let k = 0; k < numChannels; k++) weights[k] = uniformW;

  const validSamples = Math.max(0, numSamples);
  if (validSamples === 0 || numChannels === 0) {
    return weights;
  }

  const eta = 1.0 / Math.sqrt(numChannels);
  const lambda = 1.0 / (validSamples * numChannels);
  const EG_MAX_ITER = 60;
  const EG_TOL = 1e-6;

  let bestLoss = Infinity;
  let bestWeights = new Float64Array(weights);
  let prevLoss = Infinity;

  for (let iter = 0; iter < EG_MAX_ITER; iter++) {
    const sampleProbs: Float64Array[] = [];
    let totalLogLoss = 0.0;
    let logLossCount = 0;

    for (let s = 0; s < validSamples; s++) {
      const sampleBase = s * numChannels * stride;
      const targetBase = s * stride;

      const logits = new Float64Array(stride);
      let maxLogit = -Infinity;

      for (let n = 1; n <= TOTAL_NUMBERS; n++) {
        let acc = 0.0;
        for (let k = 0; k < numChannels; k++) {
          const idx = sampleBase + k * stride + n;
          const sVal = idx < oofFlat.length ? (oofFlat as any)[idx] : 0.0;
          const sSafe = Math.max(1e-12, sVal);
          const odds = Math.max(1e-12, sSafe / (NUMBERS_PER_DRAW / TOTAL_NUMBERS));
          acc += weights[k] * Math.log(odds);
        }
        logits[n] = acc;
        if (acc > maxLogit) maxLogit = acc;
      }

      let sumExp = 0.0;
      const expZ = new Float64Array(stride);
      for (let n = 1; n <= TOTAL_NUMBERS; n++) {
        const e = Math.exp(logits[n] - maxLogit);
        expZ[n] = e;
        sumExp += e;
      }

      const probs = new Float64Array(stride);
      if (sumExp > 1e-12) {
        for (let n = 1; n <= TOTAL_NUMBERS; n++) {
          probs[n] = Math.min(1.0, Math.max(0.0, (expZ[n] / sumExp) * NUMBERS_PER_DRAW));
        }
      }
      sampleProbs.push(probs);

      for (let n = 1; n <= TOTAL_NUMBERS; n++) {
        const y = targetBase + n < targetsFlat.length ? (targetsFlat as any)[targetBase + n] : 0.0;
        const p = Math.max(1e-9, Math.min(1.0 - 1e-9, probs[n]));
        totalLogLoss += -(y * Math.log(p) + (1.0 - y) * Math.log(1.0 - p));
        logLossCount++;
      }
    }

    const loss = logLossCount > 0 ? totalLogLoss / logLossCount : 0.0;
    if (loss < bestLoss) {
      bestLoss = loss;
      bestWeights = new Float64Array(weights);
    }
    if (Number.isFinite(prevLoss) && Math.abs(prevLoss - loss) <= EG_TOL * Math.max(1.0, Math.abs(prevLoss))) {
      break;
    }
    prevLoss = loss;

    const grad = new Float64Array(numChannels);
    for (let s = 0; s < validSamples; s++) {
      const sampleBase = s * numChannels * stride;
      const targetBase = s * stride;
      const probs = sampleProbs[s];

      const logOdds: Float64Array[] = [];
      const channelAvg = new Float64Array(numChannels);

      for (let k = 0; k < numChannels; k++) {
        const kOdds = new Float64Array(stride);
        for (let n = 1; n <= TOTAL_NUMBERS; n++) {
          const idx = sampleBase + k * stride + n;
          const sVal = idx < oofFlat.length ? (oofFlat as any)[idx] : 0.0;
          const sSafe = Math.max(1e-12, sVal);
          const odds = Math.max(1e-12, sSafe / (NUMBERS_PER_DRAW / TOTAL_NUMBERS));
          const lo = Math.log(odds);
          kOdds[n] = lo;
          channelAvg[k] += (probs[n] / NUMBERS_PER_DRAW) * lo;
        }
        logOdds.push(kOdds);
      }

      for (let n = 1; n <= TOTAL_NUMBERS; n++) {
        const y = targetBase + n < targetsFlat.length ? (targetsFlat as any)[targetBase + n] : 0.0;
        const p = Math.max(1e-9, Math.min(1.0 - 1e-9, probs[n]));
        const coeff = p - y;
        for (let k = 0; k < numChannels; k++) {
          grad[k] += coeff * (logOdds[k][n] - channelAvg[k]);
        }
      }
    }

    const norm = validSamples * TOTAL_NUMBERS;
    for (let k = 0; k < numChannels; k++) {
      grad[k] /= norm;
    }

    for (let k = 0; k < numChannels; k++) {
      const reg = lambda * Math.max(-30.0, Math.log(Math.max(1e-12, weights[k])));
      const exponent = -eta * (grad[k] + reg);
      weights[k] *= Math.exp(Math.min(50.0, exponent));
    }

    let sumW = 0.0;
    for (let k = 0; k < numChannels; k++) sumW += weights[k];
    if (sumW > 1e-12) {
      for (let k = 0; k < numChannels; k++) weights[k] /= sumW;
    }
  }

  return bestWeights;
}

export interface InterDrawCrossDyadHpc {
  sourceNumber: number;
  targetNumber: number;
  occurrences: number;
  expectedOccurrences: number;
  zScore: number;
  lift: number;
  significanceScore: number;
}

export interface BivariateDyadsReportHpc {
  dyads: InterDrawCrossDyadHpc[];
  machineDyads?: InterDrawCrossDyadHpc[];
  transitionMatrix: Float64Array;
  totalPairedDraws: number;
  meanCouplingZ: number;
}

/**
 * 16. Dyades Croisées & Matrice de Transition Bivariée (Rust Core HPC)
 * Calcule les transitions directes avec filtrage statistique rigoureux par z-score (AGENTS.md).
 */
export function computeBivariateCrossDyadsHpc(
  sourceDraw: string,
  targetDraw: string,
  minZScore: number = 0.0
): BivariateDyadsReportHpc {
  const normSrc = sourceDraw.trim().toUpperCase();
  const normTgt = targetDraw.trim().toUpperCase();
  const store = getOrCreateNativeStoreInstance();

  if (store && typeof store.compute_bivariate_dyads_wasm === 'function') {
    try {
      const rep = store.compute_bivariate_dyads_wasm(normSrc, normTgt, minZScore);
      if (rep) {
        const count = readWasmField<number>(rep, 'dyads_count', 0);
        const dyads: InterDrawCrossDyadHpc[] = [];
        for (let i = 0; i < count; i++) {
          const d = rep.get_dyad(i);
          if (d) {
            dyads.push({
              sourceNumber: readWasmField<number>(d, 'source_number', 0),
              targetNumber: readWasmField<number>(d, 'target_number', 0),
              occurrences: readWasmField<number>(d, 'occurrences', 0),
              expectedOccurrences: readWasmField<number>(d, 'expected_occurrences', 0.0),
              zScore: readWasmField<number>(d, 'z_score', 0.0),
              lift: readWasmField<number>(d, 'lift', 1.0),
              significanceScore: readWasmField<number>(d, 'significance_score', 50.0),
            });
          }
        }

        const rawMatrix = readWasmField<Float64Array>(rep, 'transition_matrix_flat', new Float64Array(90 * 90));
        return {
          dyads,
          transitionMatrix: new Float64Array(rawMatrix),
          totalPairedDraws: readWasmField<number>(rep, 'total_paired_draws', 0),
          meanCouplingZ: readWasmField<number>(rep, 'mean_coupling_z', 0.0),
        };
      }
    } catch (e) {
      console.warn('[LOTO-ENGINE] Erreur WASM compute_bivariate_dyads, passage au fallback :', e);
    }
  }

  // Fallback déterministe C^∞
  const timeSrc = fallbackStoreTimelines.get(normSrc);
  const timeTgt = fallbackStoreTimelines.get(normTgt);
  const histSrc = timeSrc?.history || [];
  const histTgt = timeTgt?.history || [];
  const nPairs = Math.min(histSrc.length, histTgt.length);
  const matrix = new Float64Array(90 * 90);

  if (nPairs < 2) {
    return {
      dyads: [],
      transitionMatrix: matrix,
      totalPairedDraws: 0,
      meanCouplingZ: 0.0,
    };
  }

  const counts = new Uint32Array(90 * 90);
  const srcFreqs = new Uint32Array(91);
  const machCounts = new Uint32Array(90 * 90);
  const machSrcFreqs = new Uint32Array(91);
  let machinePairsCount = 0;

  for (let i = 0; i < nPairs; i++) {
    const sDraw = histSrc[i];
    const tDraw = histTgt[i];
    for (const s of sDraw.winners) {
      if (s >= 1 && s <= 90) {
        srcFreqs[s]++;
        for (const t of tDraw.winners) {
          if (t >= 1 && t <= 90) {
            counts[(s - 1) * 90 + (t - 1)]++;
          }
        }
      }
    }

    if (Array.isArray(sDraw.machine) && sDraw.machine.length > 0) {
      machinePairsCount++;
      for (const m of sDraw.machine) {
        if (m >= 1 && m <= 90) {
          machSrcFreqs[m]++;
          for (const t of tDraw.winners) {
            if (t >= 1 && t <= 90) {
              machCounts[(m - 1) * 90 + (t - 1)]++;
            }
          }
        }
      }
    }
  }

  const pJoint = (5.0 / 90.0) * (5.0 / 90.0);
  const expected = nPairs * pJoint;
  const variance = nPairs * pJoint * (1.0 - pJoint);
  const stdDev = Math.max(1e-9, Math.sqrt(variance));

  const dyads: InterDrawCrossDyadHpc[] = [];
  let sumZ = 0.0;

  for (let s = 1; s <= 90; s++) {
    const sCount = srcFreqs[s];
    const row = (s - 1) * 90;
    for (let t = 1; t <= 90; t++) {
      const o = counts[row + (t - 1)];
      const pTrans = (o + 1.0) / (sCount + 18.0);
      matrix[row + (t - 1)] = pTrans;

      const z = (o - expected) / stdDev;
      sumZ += z;
      const lift = expected > 0 ? o / expected : 1.0;
      const sig = 100.0 / (1.0 + Math.exp(-1.2 * z));

      if (z >= minZScore) {
        dyads.push({
          sourceNumber: s,
          targetNumber: t,
          occurrences: o,
          expectedOccurrences: Math.round(expected * 1000) / 1000,
          zScore: Math.round(z * 1000) / 1000,
          lift: Math.round(lift * 100) / 100,
          significanceScore: Math.round(sig * 10) / 10,
        });
      }
    }
  }

  dyads.sort((a, b) => b.zScore - a.zScore || a.sourceNumber - b.sourceNumber);

  // Dyades canal machine : machine(source) -> gagnants(cible)
  const machineDyads: InterDrawCrossDyadHpc[] = [];
  if (machinePairsCount >= 2) {
    const expectedMach = machinePairsCount * pJoint;
    const varMach = machinePairsCount * pJoint * (1.0 - pJoint);
    const stdDevMach = Math.max(1e-9, Math.sqrt(varMach));

    for (let m = 1; m <= 90; m++) {
      const row = (m - 1) * 90;
      for (let t = 1; t <= 90; t++) {
        const o = machCounts[row + (t - 1)];
        if (o > 0) {
          const z = (o - expectedMach) / stdDevMach;
          const lift = expectedMach > 0 ? o / expectedMach : 1.0;
          const sig = 100.0 / (1.0 + Math.exp(-1.2 * z));

          if (z >= minZScore) {
            machineDyads.push({
              sourceNumber: m,
              targetNumber: t,
              occurrences: o,
              expectedOccurrences: Math.round(expectedMach * 1000) / 1000,
              zScore: Math.round(z * 1000) / 1000,
              lift: Math.round(lift * 100) / 100,
              significanceScore: Math.round(sig * 10) / 10,
            });
          }
        }
      }
    }
    machineDyads.sort((a, b) => b.zScore - a.zScore || a.sourceNumber - b.sourceNumber);
  }

  return {
    dyads,
    machineDyads,
    transitionMatrix: matrix,
    totalPairedDraws: nPairs,
    meanCouplingZ: Math.round((sumZ / 8100.0) * 1000) / 1000,
  };
}

// ═══════════════════════════════════════════════════════════════
// NOUVEAUX MODULES HPC RUST/WASM (AXE 1 : HAUTE PERFORMANCE)
// ═══════════════════════════════════════════════════════════════

export interface MonteCarloBallStatHpc {
  ball: number;
  meanScore: number;
  stdDev: number;
  p5: number;
  p95: number;
  stabilityIndex: number;
}

/**
 * 20. Test de Stress Monte Carlo What-If en Rust/WASM (zéro GC, mémoire contiguë)
 */
export function runMonteCarloWhatIfHpc(params: {
  baseMatrix: Float64Array | number[];
  kAlgos: number;
  baseWeights: Float64Array | number[];
  iterations?: number;
  noiseStdDev?: number;
  seed?: number | bigint;
}): MonteCarloBallStatHpc[] {
  const kAlgos = Math.max(1, params.kAlgos);
  const iterations = Math.max(10, params.iterations ?? 100);
  const noiseStdDev = Math.max(0.0001, params.noiseStdDev ?? 0.05);
  const seedBigInt = typeof params.seed === 'bigint'
    ? params.seed
    : BigInt(Math.max(1, Math.floor(Number(params.seed) || 123456789)));

  const baseMatrixF64 = params.baseMatrix instanceof Float64Array
    ? params.baseMatrix
    : new Float64Array(params.baseMatrix);
  const baseWeightsF64 = params.baseWeights instanceof Float64Array
    ? params.baseWeights
    : new Float64Array(params.baseWeights);

  if (isWasmLoaded && wasmModuleInstance?.run_monte_carlo_whatif_hpc) {
    try {
      const report = wasmModuleInstance.run_monte_carlo_whatif_hpc(
        baseMatrixF64,
        kAlgos,
        baseWeightsF64,
        iterations,
        noiseStdDev,
        seedBigInt
      );
      const count = report.count;
      const stats: MonteCarloBallStatHpc[] = [];
      for (let i = 0; i < count; i++) {
        stats.push({
          ball: report.get_ball(i),
          meanScore: parseFloat(report.get_mean(i).toFixed(2)),
          stdDev: parseFloat(report.get_std_dev(i).toFixed(2)),
          p5: parseFloat(report.get_p5(i).toFixed(2)),
          p95: parseFloat(report.get_p95(i).toFixed(2)),
          stabilityIndex: parseFloat(report.get_stability_index(i).toFixed(1)),
        });
      }
      if (typeof report.free === 'function') {
        report.free();
      }
      return stats;
    } catch (e) {
      console.warn('[LOTO-ENGINE] WASM Monte Carlo What-If failed, using vectorized fallback :', e);
    }
  }

  // Fallback vectorisé continu Float64Array (Zero allocation intermédiaire en boucle serrée)
  const linearScores = new Float64Array(iterations * 90);
  let lcg = seedBigInt;
  const nextGaussian = (): number => {
    lcg = (lcg * 6364136223846793005n + 1442695040888963407n) & 0xFFFFFFFFFFFFFFFFn;
    const u1 = Math.max(1e-12, Number(lcg >> 11n) / 9007199254740992);
    lcg = (lcg * 6364136223846793005n + 1442695040888963407n) & 0xFFFFFFFFFFFFFFFFn;
    const u2 = Math.max(1e-12, Number(lcg >> 11n) / 9007199254740992);
    return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  };

  const noisyWeights = new Float64Array(kAlgos);

  for (let r = 0; r < iterations; r++) {
    let sumW = 0.0;
    for (let j = 0; j < kAlgos; j++) {
      const g = nextGaussian();
      const w = Math.max(0.0001, (baseWeightsF64[j] || 0) + g * noiseStdDev);
      noisyWeights[j] = w;
      sumW += w;
    }
    const invSum = 1.0 / (sumW || 1e-9);
    for (let j = 0; j < kAlgos; j++) {
      noisyWeights[j] *= invSum;
    }

    const offset = r * 90;
    for (let b = 0; b < 90; b++) {
      let score = 0.0;
      const rowOffset = b * kAlgos;
      for (let j = 0; j < kAlgos; j++) {
        score += (baseMatrixF64[rowOffset + j] || 0) * noisyWeights[j];
      }
      linearScores[offset + b] = score;
    }
  }

  const results: MonteCarloBallStatHpc[] = [];
  const singleBall = new Float64Array(iterations);

  for (let b = 0; b < 90; b++) {
    let sum = 0.0;
    for (let r = 0; r < iterations; r++) {
      const val = linearScores[r * 90 + b];
      singleBall[r] = val;
      sum += val;
    }
    const mean = sum / iterations;

    let varSum = 0.0;
    for (let r = 0; r < iterations; r++) {
      const diff = singleBall[r] - mean;
      varSum += diff * diff;
    }
    const stdDev = Math.sqrt(varSum / iterations);

    singleBall.sort();
    const p5Idx = Math.floor(iterations * 0.05);
    const p95Idx = Math.min(iterations - 1, Math.floor(iterations * 0.95));
    const stability = Math.max(0, 1.0 - (stdDev / Math.max(1.0, mean)));

    results.push({
      ball: b + 1,
      meanScore: parseFloat(mean.toFixed(2)),
      stdDev: parseFloat(stdDev.toFixed(2)),
      p5: parseFloat(singleBall[p5Idx].toFixed(2)),
      p95: parseFloat(singleBall[p95Idx].toFixed(2)),
      stabilityIndex: parseFloat((stability * 100.0).toFixed(1)),
    });
  }

  results.sort((a, b) => b.meanScore - a.meanScore || a.ball - b.ball);
  return results;
}

/**
 * 21. Divergence de Kullback-Leibler continue sur Simplex 90D en Rust/WASM
 */
export function computeKlDivergenceHpc(
  pBase: Float64Array | number[],
  pSim: Float64Array | number[]
): number {
  const pBaseF64 = pBase instanceof Float64Array ? pBase : new Float64Array(pBase);
  const pSimF64 = pSim instanceof Float64Array ? pSim : new Float64Array(pSim);

  if (pBaseF64.length < 90 || pSimF64.length < 90) return 0;

  if (isWasmLoaded && wasmModuleInstance?.compute_kl_divergence_hpc) {
    try {
      const kl = wasmModuleInstance.compute_kl_divergence_hpc(pBaseF64, pSimF64);
      return parseFloat(Math.max(0, kl).toFixed(5));
    } catch (e) {
      console.warn('[LOTO-ENGINE] WASM KL Divergence failed, using fallback :', e);
    }
  }

  let kl = 0.0;
  for (let i = 0; i < 90; i++) {
    const p = Math.max(1e-12, pBaseF64[i] || 0);
    const q = Math.max(1e-12, pSimF64[i] || 0);
    kl += p * Math.log(p / q);
  }
  return parseFloat(Math.max(0, kl).toFixed(5));
}

/**
 * 22. Simulation Financière & Backtest en Rust/WASM (O(N) déterministe)
 */
export interface FinancialSimulationHpcResult {
  netProfit: number;
  roi: number;
  maxDrawdown: number;
  winRate: number;
  sharpeRatio: number;
  sortinoRatio: number;
  profitFactor: number;
  recoveryFactor: number;
  bankruptcyDraw: number | null;
  balances: number[];
  drawdowns: number[];
}

export function runFinancialSimulationHpc(params: {
  hitsHistory: Int32Array | number[];
  confidences: Float64Array | number[];
  multipliers: Float64Array | number[];
  strategyCode: number; // 0=Flat, 1=Martingale, 2=Kelly, 3=ConfidenceSmart
  initialBankroll: number;
  unitBet: number;
}): FinancialSimulationHpcResult {
  const hits = params.hitsHistory instanceof Int32Array ? params.hitsHistory : new Int32Array(params.hitsHistory);
  const confs = params.confidences instanceof Float64Array ? params.confidences : new Float64Array(params.confidences);
  const mults = params.multipliers instanceof Float64Array ? params.multipliers : new Float64Array(params.multipliers);

  if (isWasmLoaded && wasmModuleInstance?.run_simulation_hpc) {
    try {
      const res = wasmModuleInstance.run_simulation_hpc(
        hits,
        confs,
        mults,
        params.strategyCode,
        params.initialBankroll,
        params.unitBet
      );
      const output: FinancialSimulationHpcResult = {
        netProfit: res.net_profit,
        roi: res.roi,
        maxDrawdown: res.max_drawdown,
        winRate: res.win_rate,
        sharpeRatio: res.sharpe_ratio,
        sortinoRatio: res.sortino_ratio,
        profitFactor: res.profit_factor,
        recoveryFactor: res.recovery_factor,
        bankruptcyDraw: res.bankruptcy_draw >= 0 ? res.bankruptcy_draw : null,
        balances: Array.from(res.balances),
        drawdowns: Array.from(res.drawdowns),
      };
      if (typeof res.free === 'function') {
        res.free();
      }
      return output;
    } catch (e) {
      console.warn('[LOTO-ENGINE] WASM financial simulation failed, using fallback :', e);
    }
  }

  // Fallback vectorisé continu
  let balance = params.initialBankroll;
  let peakBalance = params.initialBankroll;
  let maxDd = 0.0;
  let wins = 0;
  let bankruptcy: number | null = null;
  const balances: number[] = [];
  const drawdowns: number[] = [];
  const returns: number[] = [];
  let grossWins = 0.0;
  let grossLosses = 0.0;
  let consecutiveLosses = 0;

  for (let i = 0; i < hits.length; i++) {
    if (balance < params.unitBet) {
      if (bankruptcy === null) bankruptcy = i;
      balances.push(0);
      drawdowns.push(1.0);
      continue;
    }

    let bet = params.unitBet;
    if (params.strategyCode === 1) {
      bet = params.unitBet * Math.exp(consecutiveLosses * Math.log(2));
      const cap = balance * Math.exp(-maxDd * 5.0);
      if (bet > cap) bet = Math.floor(cap);
    } else if (params.strategyCode === 2) {
      const conf = (confs[i] || 50.0) / 100.0;
      const mult = mults[i] || 1.0;
      const b = Math.max(0.1, mult - 1.0);
      const p = conf;
      const q = 1.0 - p;
      let f = Math.max(0, (b * p - q) / b);
      f = f * Math.exp(-maxDd * 3.0);
      bet = Math.floor(balance * f);
    } else if (params.strategyCode === 3) {
      const conf = (confs[i] || 50.0) / 100.0;
      bet = params.unitBet * (0.5 + conf);
    }
    bet = Math.max(params.unitBet, Math.min(balance, Math.floor(bet)));

    const hit = hits[i];
    const isWin = hit >= 2;
    let profit = -bet;
    if (isWin) {
      wins++;
      consecutiveLosses = 0;
      const mult = mults[i] || 2.0;
      profit = bet * (mult - 1.0);
      grossWins += profit;
    } else {
      consecutiveLosses++;
      grossLosses += bet;
    }

    const prevBal = balance;
    balance += profit;
    returns.push(prevBal > 0 ? profit / prevBal : 0);
    balances.push(balance);

    if (balance > peakBalance) peakBalance = balance;
    const currentDd = peakBalance > 0 ? (peakBalance - balance) / peakBalance : 0;
    if (currentDd > maxDd) maxDd = currentDd;
    drawdowns.push(currentDd);
  }

  const n = hits.length;
  const netProfit = balance - params.initialBankroll;
  const roi = (netProfit / params.initialBankroll) * 100.0;
  const winRate = n > 0 ? (wins / n) * 100.0 : 0;
  const meanReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const varReturn = returns.length > 1 ? returns.reduce((acc, r) => acc + (r - meanReturn) ** 2, 0) / (returns.length - 1) : 0;
  const stdReturn = Math.sqrt(varReturn);
  const sharpe = stdReturn > 0 ? (meanReturn / stdReturn) * Math.sqrt(252) : 0;
  const downsideReturns = returns.filter(r => r < 0);
  const downsideVar = downsideReturns.length > 0 ? downsideReturns.reduce((acc, r) => acc + r ** 2, 0) / downsideReturns.length : 0;
  const sortino = Math.sqrt(downsideVar) > 0 ? (meanReturn / Math.sqrt(downsideVar)) * Math.sqrt(252) : 0;
  const profitFactor = grossLosses > 0 ? grossWins / grossLosses : grossWins > 0 ? 10.0 : 0.0;
  const recoveryFactor = maxDd > 0 ? netProfit / (params.initialBankroll * maxDd) : 0.0;

  return {
    netProfit: parseFloat(netProfit.toFixed(2)),
    roi: parseFloat(roi.toFixed(2)),
    maxDrawdown: parseFloat((maxDd * 100).toFixed(2)),
    winRate: parseFloat(winRate.toFixed(2)),
    sharpeRatio: parseFloat(sharpe.toFixed(3)),
    sortinoRatio: parseFloat(sortino.toFixed(3)),
    profitFactor: parseFloat(profitFactor.toFixed(3)),
    recoveryFactor: parseFloat(recoveryFactor.toFixed(3)),
    bankruptcyDraw: bankruptcy,
    balances,
    drawdowns,
  };
}

/**
 * 23. Autopsie Médico-Légale en Boucle Fermée en Rust/WASM
 */
export interface ClosedLoopAutopsyHpcResult {
  updatedWeights: Float64Array;
  brierScore: number;
  divergenceMetric: number;
  exactHits: number;
  nearMisses: number;
  rmse: number;
  wassersteinDistance: number;
}

export function computeClosedLoopAutopsyHpc(params: {
  predictedNumbers: Int32Array | number[];
  actualWinners: Int32Array | number[];
  currentWeights: Float64Array | number[];
  algoContributionsFlat: Float64Array | number[];
  numAlgos: number;
  historyDepth: number;
}): ClosedLoopAutopsyHpcResult {
  const preds = params.predictedNumbers instanceof Int32Array ? params.predictedNumbers : new Int32Array(params.predictedNumbers);
  const winners = params.actualWinners instanceof Int32Array ? params.actualWinners : new Int32Array(params.actualWinners);
  const weights = params.currentWeights instanceof Float64Array ? params.currentWeights : new Float64Array(params.currentWeights);
  const contribs = params.algoContributionsFlat instanceof Float64Array ? params.algoContributionsFlat : new Float64Array(params.algoContributionsFlat);

  if (isWasmLoaded && wasmModuleInstance?.compute_closed_loop_autopsy_wasm) {
    try {
      const res = wasmModuleInstance.compute_closed_loop_autopsy_wasm(
        preds,
        winners,
        weights,
        contribs,
        params.numAlgos,
        params.historyDepth
      );
      const out: ClosedLoopAutopsyHpcResult = {
        updatedWeights: new Float64Array(res.updated_weights),
        brierScore: res.brier_score,
        divergenceMetric: res.divergence_metric,
        exactHits: res.exact_hits,
        nearMisses: res.near_misses,
        rmse: res.rmse,
        wassersteinDistance: res.wasserstein_distance,
      };
      if (typeof res.free === 'function') {
        res.free();
      }
      return out;
    } catch (e) {
      console.warn('[LOTO-ENGINE] WASM Closed Loop Autopsy failed, using fallback :', e);
    }
  }

  // Fallback déterministe C^∞
  const winnersSet = new Set(Array.from(winners));
  let exactHits = 0;
  let nearMisses = 0;
  for (let i = 0; i < preds.length; i++) {
    const p = preds[i];
    if (winnersSet.has(p)) {
      exactHits++;
    } else if (winnersSet.has(p - 1) || winnersSet.has(p + 1)) {
      nearMisses++;
    }
  }

  const updated = new Float64Array(params.numAlgos);
  const learningRate = 1.0 / Math.sqrt(Math.max(1, params.historyDepth));
  for (let a = 0; a < params.numAlgos; a++) {
    const curW = weights[a] || 1.0;
    let alignment = 0;
    for (let i = 0; i < preds.length; i++) {
      const p = preds[i];
      const c = contribs[a * 91 + p] || 0;
      if (winnersSet.has(p)) alignment += c;
    }
    updated[a] = Math.max(0.01, curW + alignment * learningRate);
  }

  let sumW = 0;
  for (let a = 0; a < params.numAlgos; a++) sumW += updated[a];
  if (sumW > 0) {
    for (let a = 0; a < params.numAlgos; a++) updated[a] /= sumW;
  }

  const brier = Math.pow((exactHits / 5.0) - 1.0, 2);
  const rmse = Math.sqrt(brier);

  return {
    updatedWeights: updated,
    brierScore: parseFloat(brier.toFixed(4)),
    divergenceMetric: parseFloat((1.0 - (exactHits / 5.0)).toFixed(4)),
    exactHits,
    nearMisses,
    rmse: parseFloat(rmse.toFixed(4)),
    wassersteinDistance: parseFloat((5.0 - exactHits + nearMisses * 0.5).toFixed(3)),
  };
}

/**
 * 24. Produit Scalaire SIMD & Scoring Tensoriel Vectorisé en Rust/WASM
 */
export function dotProductHpc(a: Float64Array | number[], b: Float64Array | number[]): number {
  const aF64 = a instanceof Float64Array ? a : new Float64Array(a);
  const bF64 = b instanceof Float64Array ? b : new Float64Array(b);
  if (isWasmLoaded && wasmModuleInstance?.dot_product_f64) {
    try {
      return wasmModuleInstance.dot_product_f64(aF64, bF64);
    } catch {
      // fallback
    }
  }
  const len = Math.min(aF64.length, bF64.length);
  let sum = 0.0;
  for (let i = 0; i < len; i++) sum += aF64[i] * bF64[i];
  return sum;
}

export function tensorScoreHpc(
  featuresFlat: Float64Array | number[],
  weights: Float64Array | number[],
  numNumbers: number = 90,
  numFeatures: number
): Float64Array {
  const feat = featuresFlat instanceof Float64Array ? featuresFlat : new Float64Array(featuresFlat);
  const w = weights instanceof Float64Array ? weights : new Float64Array(weights);

  if (isWasmLoaded && wasmModuleInstance?.tensor_score_wasm) {
    try {
      return new Float64Array(wasmModuleInstance.tensor_score_wasm(feat, w, numNumbers, numFeatures));
    } catch {
      // fallback
    }
  }

  const scores = new Float64Array(numNumbers);
  for (let n = 0; n < numNumbers; n++) {
    const row = n * numFeatures;
    let s = 0.0;
    for (let f = 0; f < numFeatures; f++) {
      s += feat[row + f] * (w[f] || 0);
    }
    scores[n] = s;
  }
  return scores;
}

export const computeTensorScoreHpc = tensorScoreHpc;

// Table de lookup statique des coordonnées et harmoniques des 90 numéros (zéro allocation en boucle)
interface NumberGeoData {
  row: number;
  col: number;
  rev: number;
  mod10: number;
  decade: number;
}

export const NUMBER_GEO_TABLE: NumberGeoData[] = (() => {
  const table: NumberGeoData[] = new Array(91);
  table[0] = { row: 0, col: 0, rev: 0, mod10: 0, decade: 0 };
  for (let n = 1; n <= 90; n++) {
    const idx = n - 1;
    const row = Math.floor(idx / 10);
    const col = idx % 10;
    const mod10 = n % 10;
    const rev = n < 10 ? n : (n % 10) * 10 + Math.floor(n / 10);
    const decade = Math.floor(idx / 10);
    table[n] = { row, col, rev, mod10, decade };
  }
  return table;
})();

/**
 * Calcul Vectorisé Rapide de la Proximité Topologique Continue (1-90 vs Gagnants)
 * Remplace les boucles dynamiques JavaScript et élimine les allocations de chaînes string.
 */
export function computeTopologicalProximityVectorHpc(winners: number[] | Int32Array): Float64Array {
  const result = new Float64Array(91);
  const winLen = winners.length;
  if (winLen === 0) return result;

  for (let num = 1; num <= 90; num++) {
    const pGeo = NUMBER_GEO_TABLE[num];
    let maxSimForWinner = 1e-9;

    for (let i = 0; i < winLen; i++) {
      const w = winners[i];
      if (w < 1 || w > 90) continue;
      if (num === w) {
        maxSimForWinner = 1.0;
        break;
      }
      const wGeo = NUMBER_GEO_TABLE[w];

      const linSim = Math.exp(-0.25 * Math.abs(num - w));
      const dRow = pGeo.row - wGeo.row;
      const dCol = pGeo.col - wGeo.col;
      const gridDist = Math.sqrt(dRow * dRow + dCol * dCol);
      const gridSim = Math.exp(-0.35 * gridDist);
      const mirror91Sim = Math.exp(-0.5 * Math.abs(num + w - 91));
      const mirrorRevSim = Math.exp(-0.5 * Math.abs(pGeo.rev - w));

      const dHarm = Math.abs(pGeo.mod10 - wGeo.mod10);
      const harmonicDist = Math.min(dHarm, 10 - dHarm);
      const harmonicSim = Math.exp(-0.5 * harmonicDist);

      const decadeSim = Math.exp(-0.5 * Math.abs(pGeo.decade - wGeo.decade));

      const sim = Math.max(linSim, gridSim, mirror91Sim, mirrorRevSim, harmonicSim, decadeSim);
      if (sim > maxSimForWinner) {
        maxSimForWinner = sim;
      }
    }
    result[num] = maxSimForWinner;
  }

  return result;
}

export interface SpatialFieldMetricsHpcResult {
  gridDensity: Float64Array;
  gravityPulls: Float64Array;
  barycenterX: number;
  barycenterY: number;
  entropy: number;
  densityThreshold: number;
}

/**
 * 25. Calcul du Champ Spatial Complet en Rust/WASM (Grille, Gravité newtonienne, Barycentre, Entropie)
 */
export function computeSpatialGridHpc(
  flatDraws: Int32Array | number[],
  numDraws: number
): SpatialFieldMetricsHpcResult {
  const flat = flatDraws instanceof Int32Array ? flatDraws : new Int32Array(flatDraws);

  if (isWasmLoaded && wasmModuleInstance?.compute_spatial_grid_hpc) {
    try {
      const res = wasmModuleInstance.compute_spatial_grid_hpc(flat, numDraws);
      const out: SpatialFieldMetricsHpcResult = {
        gridDensity: new Float64Array(res.grid_density),
        gravityPulls: new Float64Array(res.gravity_pulls),
        barycenterX: res.barycenter_x,
        barycenterY: res.barycenter_y,
        entropy: res.entropy,
        densityThreshold: res.density_threshold,
      };
      if (typeof res.free === 'function') {
        res.free();
      }
      return out;
    } catch (e) {
      console.warn('[LOTO-ENGINE] WASM compute_spatial_grid_hpc error, using fallback :', e);
    }
  }

  // Fallback vectorisé déterministe C^∞
  const TOTAL_NUMBERS = 90;
  const k = 5;
  const gridDensity = new Float64Array(TOTAL_NUMBERS + 1);
  const evalDraws = Math.min(numDraws, Math.floor(flat.length / k));

  for (let d = 0; d < evalDraws; d++) {
    for (let c = 0; c < k; c++) {
      const val = flat[d * k + c];
      if (val >= 1 && val <= TOTAL_NUMBERS) {
        gridDensity[val]++;
      }
    }
  }

  let totalDensity = 0.0;
  for (let n = 1; n <= TOTAL_NUMBERS; n++) totalDensity += gridDensity[n];
  const meanDensity = totalDensity / TOTAL_NUMBERS;

  let variance = 0.0;
  for (let n = 1; n <= TOTAL_NUMBERS; n++) {
    const diff = gridDensity[n] - meanDensity;
    variance += diff * diff;
  }
  variance /= TOTAL_NUMBERS;
  const stdDev = Math.sqrt(variance);

  let entropy = 0.0;
  if (totalDensity > 0.0) {
    for (let n = 1; n <= TOTAL_NUMBERS; n++) {
      const v = gridDensity[n];
      if (v > 0.0) {
        const p = v / totalDensity;
        entropy -= p * Math.log2(p);
      }
    }
  }
  const normEntropy = Math.min(1.0, Math.max(0.0, entropy / Math.log2(TOTAL_NUMBERS)));
  const pConfidence = 0.3 + 0.4 * normEntropy;
  // ndtri approximation
  const q = pConfidence < 0.5 ? pConfidence : 1.0 - pConfidence;
  const t = Math.sqrt(-2.0 * Math.log(q));
  const z = t - ((0.010328 * t + 0.802853) * t + 2.515517) / (((0.001308 * t + 0.189269) * t + 1.432788) * t + 1.0);
  const signedZ = pConfidence < 0.5 ? -z : z;
  const densityThreshold = meanDensity + signedZ * stdDev;

  // Barycentre premier tirage
  let sumX = 0.0;
  let sumY = 0.0;
  let recentCount = 0;
  if (evalDraws > 0) {
    for (let c = 0; c < k; c++) {
      const val = flat[c];
      if (val >= 1 && val <= TOTAL_NUMBERS) {
        const idx = val - 1;
        sumX += idx % 10;
        sumY += Math.floor(idx / 10);
        recentCount++;
      }
    }
  }
  const barycenterX = recentCount > 0 ? sumX / recentCount : 4.5;
  const barycenterY = recentCount > 0 ? sumY / recentCount : 4.0;

  // Puits de gravité newtoniens
  const gravityPulls = new Float64Array(TOTAL_NUMBERS);
  for (let num = 1; num <= TOTAL_NUMBERS; num++) {
    const idx1 = num - 1;
    const x1 = idx1 % 10;
    const y1 = Math.floor(idx1 / 10);
    let pull = 0.0;
    for (let other = 1; other <= TOTAL_NUMBERS; other++) {
      const dVal = gridDensity[other];
      if (dVal > 0.0) {
        const idx2 = other - 1;
        const x2 = idx2 % 10;
        const y2 = Math.floor(idx2 / 10);
        const distSq = (x1 - x2) * (x1 - x2) + (y1 - y2) * (y1 - y2);
        pull += dVal / (1.0 + distSq);
      }
    }
    gravityPulls[num - 1] = pull;
  }

  const outDensity = new Float64Array(TOTAL_NUMBERS);
  for (let i = 1; i <= TOTAL_NUMBERS; i++) outDensity[i - 1] = gridDensity[i];

  return {
    gridDensity: outDensity,
    gravityPulls,
    barycenterX,
    barycenterY,
    entropy: normEntropy,
    densityThreshold,
  };
}

/**
 * 26. Calcul Vectorisé de la Trajectoire de Barycentre
 */
export function computeBarycenterTrajectoryHpc(
  results: { gagnants: number[]; date?: string }[],
  limit: number = 20
): Array<{ x: number; y: number; drawIndex: number; date?: string }> {
  const actualLimit = Math.min(results.length, limit);
  const out: Array<{ x: number; y: number; drawIndex: number; date?: string }> = [];

  for (let idx = 0; idx < actualLimit; idx++) {
    const draw = results[idx];
    const winners = draw?.gagnants || [];
    let sumX = 0.0;
    let sumY = 0.0;
    const len = winners.length || 1;

    for (let c = 0; c < winners.length; c++) {
      const n = winners[c];
      if (n >= 1 && n <= 90) {
        const i = n - 1;
        sumX += i % 10;
        sumY += Math.floor(i / 10);
      }
    }

    out.push({
      x: Math.round((sumX / len) * 100) / 100,
      y: Math.round((sumY / len) * 100) / 100,
      drawIndex: idx,
      date: draw.date,
    });
  }

  return out;
}

/**
 * 27. Corrélation de Pearson Vectorisée Haute Précision (Zéro Allocation)
 */
export function computePearsonCorrelationHpc(
  scoresX: Float64Array | number[],
  scoresY: Float64Array | number[]
): number | null {
  const n = Math.min(scoresX.length, scoresY.length);
  if (n === 0) return null;

  let sumX = 0.0;
  let sumY = 0.0;
  for (let i = 0; i < n; i++) {
    sumX += scoresX[i];
    sumY += scoresY[i];
  }
  const meanX = sumX / n;
  const meanY = sumY / n;

  let num = 0.0;
  let denX = 0.0;
  let denY = 0.0;
  for (let i = 0; i < n; i++) {
    const dx = scoresX[i] - meanX;
    const dy = scoresY[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }

  if (denX <= 1e-12 || denY <= 1e-12) return null;
  const r = num / Math.sqrt(denX * denY);
  return Math.max(-1.0, Math.min(1.0, r));
}

/**
 * 28. Matrice de Corrélation de Pearson Complète Vectorisée
 */
export function computePearsonCorrelationMatrixHpc(
  algoScores: Record<string, number[] | Float64Array>,
  keys: readonly string[]
): { matrix: Record<string, Record<string, number | null>>; average: number } {
  const matrix: Record<string, Record<string, number | null>> = {};
  let sumCorr = 0;
  let countCorr = 0;

  for (const k1 of keys) {
    matrix[k1] = {};
    const s1 = algoScores[k1];
    if (!s1) continue;

    for (const k2 of keys) {
      if (k1 === k2) {
        matrix[k1][k2] = 1.0;
      } else {
        const s2 = algoScores[k2];
        if (!s2) {
          matrix[k1][k2] = null;
          continue;
        }
        const r = computePearsonCorrelationHpc(s1, s2);
        matrix[k1][k2] = r === null ? null : parseFloat(r.toFixed(4));
        if (r !== null) {
          sumCorr += Math.abs(r);
          countCorr++;
        }
      }
    }
  }

  const average = countCorr > 0 ? parseFloat((sumCorr / countCorr).toFixed(4)) : 0;
  return { matrix, average };
}

/**
 * 29. Calcul Vectorisé de Jaccard HPC (Set-Overlap + Régime Inter-Tirages)
 * Exécute la simulation matricielle continue sans allocation dynamique en boucle.
 */
export function computeVectorizedJaccardHpc(
  flatHistory: Int32Array | number[],
  drawsCount: number,
  winCols: number = 5,
  mainMax: number = 90
): Float64Array {
  const flat = flatHistory instanceof Int32Array ? flatHistory : new Int32Array(flatHistory);
  return wasmMatrixEngine.vectorizedJaccardAnalysis(flat, drawsCount, winCols, mainMax);
}

/**
 * 30. Fusion Tensorielle 25D Vectorisée HPC (Scoring des 25 canaux)
 * Évalue simultanément les 90 numéros sur les 25 canaux tensoriels avec application de la
 * CDF logistique normale standard et projection sur simplexe marginal.
 */
export function computeTensorFusion25DHpc(
  rawMatrixFlat: Float64Array,
  weights25D: Float64Array,
  medianPerChannel: Float64Array,
  madPerChannel: Float64Array,
  resonanceModulator: Float64Array,
  mainMax: number = 90,
  numChannels: number = 25
): {
  finalScores: Float64Array;
  shapContributions: Float64Array;
} {
  return wasmMatrixEngine.vectorizedTensorFusion25D(
    rawMatrixFlat,
    weights25D,
    medianPerChannel,
    madPerChannel,
    resonanceModulator,
    mainMax,
    numChannels
  );
}

// ============================================================================
// 31-33. NOYAUX RUST/WASM : SÉQUENCES D'ÉCARTS, WALK-FORWARD OOS & MOTIFS
// ============================================================================

export interface GapRangeAnalysisHpcResult {
  totalAnalyzedDraws: number;
  klM1: number;
  klM2: number;
  wassersteinBandwidth: number;
  ticketStoufferZ: number;
  selectionConfidence: number;
  expectedNextMean: number;
  poolBaselineProbs: Float64Array;
  blendedProbs: Float64Array;
  binZScores: Float64Array;
  transitionMatrixOrder1: Float64Array;
  droughtDraws: Int32Array;
  droughtPressure: Float64Array;
  droughtZScores: Float64Array;
  modelWeights: Float64Array;
  ballCurrentGaps: Int32Array;
  ballStoufferZ: Float64Array;
  ballStoufferP: Float64Array;
  ballChannelZFlat: Float64Array;
  ballActiveChannels: Uint8Array;
  topPredictedBins: Uint8Array;
  optimalFive: Uint8Array;
  reserveTwo: Uint8Array;
  trancheQuotas: Uint8Array;
}

export interface GapRangeWalkForwardHpcResult {
  evalCount: number;
  minTrainDraws: number;
  top1SuccessRate: number;
  top1H0ChanceRate: number;
  top3BallCoverageRate: number;
  top3H0ChanceRate: number;
  avgBallsCoveredPerDraw: number;
  avgSelectionHitsPerDraw: number;
  selectionAtLeastOneHitRate: number;
  meanBrierScore: number;
  h0BrierScore: number;
  brierSkillScore: number;
  stepDrawIndices: Int32Array;
  stepPredictedTop3: Uint8Array;
  stepActualCounts: Uint8Array;
  stepOptimalFiveHits: Uint8Array;
  stepBrierScores: Float64Array;
}

export interface PatternMiningHpcResult {
  totalCycles: number;
  completedCyclesCount: number;
  activeCycleIndex: number;
  activeCycleDrawsCount: number;
  overallCycleEntropy: number;
  minPairCyclesThreshold: number;
  activeCycleNumbers: Uint8Array;
  ballCycleCounts: Uint32Array;
  sourceBallCounts: Uint32Array;
  sameDrawPairCounts: Uint32Array;
  pairCycleSupports: Uint32Array;
  pairTuples: Uint32Array;
  pairCycleOffsets: Uint32Array;
  pairCycleIndicesFlat: Uint32Array;
  tripletTuples: Uint32Array;
  tripletCycleOffsets: Uint32Array;
  tripletCycleIndicesFlat: Uint32Array;
  transitionTuples: Uint32Array;
  transitionCycleOffsets: Uint32Array;
  transitionCycleIndicesFlat: Uint32Array;
}

const GAP_BIN_COUNT = 7;
const GAP_BOUNDS_MIN = new Int32Array([0, 1, 4, 8, 15, 25, 40]);
const GAP_BOUNDS_MAX = new Int32Array([0, 3, 7, 14, 24, 39, 0x7fffffff]);
const P_SINGLE_5_90 = 5.0 / 90.0;

function classifyGapFast(gap: number): number {
  const g = gap < 0 ? 0 : gap;
  if (g === 0) return 0;
  if (g <= 3) return 1;
  if (g <= 7) return 2;
  if (g <= 14) return 3;
  if (g <= 24) return 4;
  if (g <= 39) return 5;
  return 6;
}

function normalCdfFast(z: number): number {
  if (!Number.isFinite(z)) return z > 0 ? 1 : 0;
  const sign = z < 0 ? -1.0 : 1.0;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1.0 / (1.0 + 0.3275911 * x);
  const poly =
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
    t;
  const erf = 1.0 - poly * Math.exp(-x * x);
  return Math.max(0.0, Math.min(1.0, 0.5 * (1.0 + sign * erf)));
}

function geometricRangeProbFast(minGap: number, maxGap: number): number {
  const q = 1.0 - P_SINGLE_5_90;
  const pMin = Math.pow(q, Math.max(0, minGap));
  const pMax = maxGap >= 0x7fffffff ? 0.0 : Math.pow(q, Math.max(0, maxGap + 1));
  return Math.max(1e-6, pMin - pMax);
}

function computeGapRangeCoreFallback(
  flat: Int32Array,
  numDraws: number,
  winCols: number
): GapRangeAnalysisHpcResult {
  const cols = Math.max(1, winCols);
  const totalDraws = Math.min(numDraws, Math.floor(flat.length / cols));
  const burnIn = Math.min(20, Math.max(3, Math.floor(totalDraws / 4)));

  const lastSeen = new Int32Array(91).fill(-1);
  const ballExitGaps: number[][] = Array.from({ length: 91 }, () => []);
  const ballTrancheExits = new Uint32Array(91 * GAP_BIN_COUNT);
  const poolOccTotals = new Float64Array(GAP_BIN_COUNT);
  let poolOccSteps = 0;

  const geomPriors = new Float64Array(GAP_BIN_COUNT);
  for (let b = 0; b < GAP_BIN_COUNT; b++) {
    geomPriors[b] = geometricRangeProbFast(GAP_BOUNDS_MIN[b], GAP_BOUNDS_MAX[b]);
  }

  interface FpEntry {
    counts: Uint8Array;
    winners: Uint8Array;
    winLen: number;
    dom: number;
    meanGap: number;
    stdGap: number;
    medianGap: number;
    entropy: number;
  }
  const footprints: FpEntry[] = [];

  for (let t = 0; t < totalDraws; t++) {
    const off = t * cols;
    let validCnt = 0;
    const winners = new Uint8Array(Math.min(5, cols));
    for (let c = 0; c < cols; c++) {
      const n = flat[off + c];
      if (n >= 1 && n <= 90) {
        if (validCnt < 5) winners[validCnt] = n;
        validCnt++;
      }
    }
    if (validCnt === 0) continue;

    if (t >= burnIn) {
      for (let num = 1; num <= 90; num++) {
        const prev = lastSeen[num];
        const g = prev === -1 ? t : t - 1 - prev;
        poolOccTotals[classifyGapFast(g)] += 1;
      }
      poolOccSteps++;

      const counts = new Uint8Array(GAP_BIN_COUNT);
      const gapsArr: number[] = [];
      let gSum = 0;
      for (let c = 0; c < cols; c++) {
        const n = flat[off + c];
        if (n >= 1 && n <= 90) {
          const prev = lastSeen[n];
          const g = prev === -1 ? t : t - 1 - prev;
          const bIdx = classifyGapFast(g);
          counts[bIdx]++;
          gSum += g;
          gapsArr.push(g);
          ballExitGaps[n].push(g);
          ballTrancheExits[n * GAP_BIN_COUNT + bIdx]++;
        }
      }
      const cnt = Math.max(1, gapsArr.length);
      const meanG = gSum / cnt;
      let varG = 0;
      for (let i = 0; i < gapsArr.length; i++) {
        const d = gapsArr[i] - meanG;
        varG += d * d;
      }
      const stdG = Math.sqrt(varG / cnt);
      gapsArr.sort((a, b) => a - b);
      const mid = gapsArr.length >> 1;
      const medG =
        gapsArr.length === 0
          ? 0
          : gapsArr.length % 2 === 1
            ? gapsArr[mid]
            : (gapsArr[mid - 1] + gapsArr[mid]) / 2;

      let dom = 1;
      let maxBinScore = -1;
      let ent = 0;
      let nonZeroTot = 0;
      for (let b = 0; b < GAP_BIN_COUNT; b++) nonZeroTot += counts[b];
      for (let b = 0; b < GAP_BIN_COUNT; b++) {
        if (counts[b] > 0) {
          const rarityWeight = counts[b] / Math.max(0.02, geomPriors[b]);
          if (rarityWeight > maxBinScore) {
            maxBinScore = rarityWeight;
            dom = b;
          }
        }
        if (nonZeroTot > 0 && counts[b] > 0) {
          const p = counts[b] / nonZeroTot;
          ent -= p * Math.log(p);
        }
      }
      const maxEnt = Math.log(Math.min(Math.max(1, nonZeroTot), GAP_BIN_COUNT));
      footprints.push({
        counts,
        winners,
        winLen: Math.min(5, validCnt),
        dom,
        meanGap: meanG,
        stdGap: stdG,
        medianGap: medG,
        entropy: maxEnt > 0 ? ent / maxEnt : 0,
      });
    } else {
      for (let c = 0; c < cols; c++) {
        const n = flat[off + c];
        if (n >= 1 && n <= 90) {
          const prev = lastSeen[n];
          if (prev !== -1) {
            const g = t - 1 - prev;
            const bIdx = classifyGapFast(g);
            ballExitGaps[n].push(g);
            ballTrancheExits[n * GAP_BIN_COUNT + bIdx]++;
          }
        }
      }
    }

    for (let c = 0; c < cols; c++) {
      const n = flat[off + c];
      if (n >= 1 && n <= 90) lastSeen[n] = t;
    }
  }

  const nFp = footprints.length;
  const poolBaselineProbs = new Float64Array(GAP_BIN_COUNT);
  const priorStrength = Math.sqrt(Math.max(1, poolOccSteps));
  const occTotal = Math.max(1, poolOccSteps * 90);
  const weightEmp = poolOccSteps / (poolOccSteps + priorStrength);
  let baseSum = 0;
  for (let b = 0; b < GAP_BIN_COUNT; b++) {
    const empShare = poolOccSteps > 0 ? poolOccTotals[b] / occTotal : geomPriors[b];
    const blended = Math.max(1e-5, weightEmp * empShare + (1 - weightEmp) * geomPriors[b]);
    poolBaselineProbs[b] = blended;
    baseSum += blended;
  }
  for (let b = 0; b < GAP_BIN_COUNT; b++) {
    poolBaselineProbs[b] /= Math.max(1e-9, baseSum);
  }

  const ballCurrentGaps = new Int32Array(91);
  const ballCurrentBin = new Uint8Array(91);
  const poolSizes = new Int32Array(GAP_BIN_COUNT);
  const poolGapSums = new Float64Array(GAP_BIN_COUNT);
  for (let num = 1; num <= 90; num++) {
    const prev = lastSeen[num];
    const g = prev === -1 ? totalDraws : totalDraws - 1 - prev;
    ballCurrentGaps[num] = g;
    const bIdx = classifyGapFast(g);
    ballCurrentBin[num] = bIdx;
    poolSizes[bIdx]++;
    poolGapSums[bIdx] += g;
  }

  const empCounts = new Float64Array(GAP_BIN_COUNT);
  let totalEmpBalls = 0;
  const transCounts1 = new Float64Array(GAP_BIN_COUNT * GAP_BIN_COUNT);
  const transRowTotals1 = new Float64Array(GAP_BIN_COUNT);
  const transCounts2 = new Float64Array(GAP_BIN_COUNT * GAP_BIN_COUNT * GAP_BIN_COUNT);
  const transRowTotals2 = new Float64Array(GAP_BIN_COUNT * GAP_BIN_COUNT);

  for (let i = 0; i < nFp; i++) {
    const fp = footprints[i];
    for (let b = 0; b < GAP_BIN_COUNT; b++) {
      empCounts[b] += fp.counts[b];
      totalEmpBalls += fp.counts[b];
    }
    if (i >= 1) {
      const prevDom = footprints[i - 1].dom;
      const prevShare = footprints[i - 1].counts[prevDom] / 5;
      for (let b = 0; b < GAP_BIN_COUNT; b++) {
        const w = fp.counts[b] * prevShare;
        transCounts1[prevDom * GAP_BIN_COUNT + b] += w;
        transRowTotals1[prevDom] += w;
      }
    }
    if (i >= 2) {
      const k2 = footprints[i - 2].dom * GAP_BIN_COUNT + footprints[i - 1].dom;
      for (let b = 0; b < GAP_BIN_COUNT; b++) {
        transCounts2[k2 * GAP_BIN_COUNT + b] += fp.counts[b];
        transRowTotals2[k2] += fp.counts[b];
      }
    }
  }

  const jeffreysPrior = Math.sqrt(GAP_BIN_COUNT);
  const empDist = new Float64Array(GAP_BIN_COUNT);
  for (let b = 0; b < GAP_BIN_COUNT; b++) {
    empDist[b] =
      totalEmpBalls > 0
        ? (empCounts[b] + jeffreysPrior * poolBaselineProbs[b]) /
          (totalEmpBalls + jeffreysPrior)
        : poolBaselineProbs[b];
  }

  const transitionMatrixOrder1 = new Float64Array(GAP_BIN_COUNT * GAP_BIN_COUNT);
  for (let src = 0; src < GAP_BIN_COUNT; src++) {
    const rTot = transRowTotals1[src];
    const denom = Math.max(1e-9, rTot + jeffreysPrior);
    for (let dst = 0; dst < GAP_BIN_COUNT; dst++) {
      const priorMass = jeffreysPrior * poolBaselineProbs[dst];
      transitionMatrixOrder1[src * GAP_BIN_COUNT + dst] =
        (transCounts1[src * GAP_BIN_COUNT + dst] + priorMass) / denom;
    }
  }

  const lastDom = nFp > 0 ? footprints[nFp - 1].dom : 3;
  const markov1Dist = new Float64Array(GAP_BIN_COUNT);
  for (let b = 0; b < GAP_BIN_COUNT; b++) {
    markov1Dist[b] = transitionMatrixOrder1[lastDom * GAP_BIN_COUNT + b];
  }

  const hasM2 = nFp >= 2;
  const key2 = hasM2 ? footprints[nFp - 2].dom * GAP_BIN_COUNT + lastDom : 0;
  const markov2Dist = new Float64Array(GAP_BIN_COUNT);
  const r2 = hasM2 ? transRowTotals2[key2] : 0;
  const shrink2 = jeffreysPrior * 5;
  for (let b = 0; b < GAP_BIN_COUNT; b++) {
    markov2Dist[b] =
      hasM2 && r2 > 0
        ? (transCounts2[key2 * GAP_BIN_COUNT + b] + shrink2 * markov1Dist[b]) / (r2 + shrink2)
        : markov1Dist[b];
  }

  // Renewal & Drought
  const droughtDraws = new Int32Array(GAP_BIN_COUNT);
  const droughtPressure = new Float64Array(GAP_BIN_COUNT);
  const droughtZScores = new Float64Array(GAP_BIN_COUNT);
  const renewalRaw = new Float64Array(GAP_BIN_COUNT);
  let renewalSum = 0;

  for (let b = 0; b < GAP_BIN_COUNT; b++) {
    let lastAct = -1;
    const intervals: number[] = [];
    for (let i = 0; i < nFp; i++) {
      if (footprints[i].counts[b] > 0) {
        if (lastAct !== -1) intervals.push(i - lastAct);
        lastAct = i;
      }
    }
    const curD = lastAct === -1 ? nFp : nFp - 1 - lastAct;
    const pHit = 1.0 - Math.pow(Math.max(1e-6, 1.0 - poolBaselineProbs[b]), 5);
    const thMean = 1.0 / Math.max(1e-4, pHit);
    const thVar = (1.0 - pHit) / Math.pow(Math.max(1e-4, pHit), 2);
    const meanIv =
      intervals.length >= 2
        ? intervals.reduce((a, v) => a + v, 0) / intervals.length
        : thMean;
    let varIv = thVar;
    if (intervals.length >= 2) {
      varIv =
        intervals.reduce((a, v) => a + (v - meanIv) * (v - meanIv), 0) /
        intervals.length;
    }
    const stdIv = Math.max(0.5, Math.sqrt(varIv));
    const empMeanDrought = Math.max(0, meanIv - 1);
    const zDr = (curD - empMeanDrought) / stdIv;
    const press = 1.0 / (1.0 + Math.exp(-zDr));
    droughtDraws[b] = curD;
    droughtZScores[b] = zDr;
    droughtPressure[b] = press;
    const availRatio = (poolSizes[b] / 90) / Math.max(1e-5, poolBaselineProbs[b]);
    renewalRaw[b] =
      poolBaselineProbs[b] * (0.5 + press) * Math.sqrt(Math.max(0.1, availRatio));
    renewalSum += renewalRaw[b];
  }
  const renewalDist = new Float64Array(GAP_BIN_COUNT);
  for (let b = 0; b < GAP_BIN_COUNT; b++) {
    renewalDist[b] = renewalRaw[b] / Math.max(1e-9, renewalSum);
  }

  // W1 + DNA 4D matches
  let w1Bandwidth = 0.15;
  const topMatches: Array<{ idx: number; sim: number }> = [];
  if (nFp >= 6) {
    const lastFp = footprints[nFp - 1];
    const prevFp = footprints[nFp - 2];
    const prev2Fp = footprints[nFp - 3];
    let gM = 0;
    let gS = 0;
    for (let i = 0; i < nFp; i++) {
      gM += footprints[i].meanGap;
      gS += footprints[i].stdGap;
    }
    gM /= nFp;
    gS /= nFp;
    let vM = 0;
    let vS = 0;
    for (let i = 0; i < nFp; i++) {
      vM += (footprints[i].meanGap - gM) ** 2;
      vS += (footprints[i].stdGap - gS) ** 2;
    }
    const scM = Math.max(1.0, Math.sqrt(vM / nFp));
    const scS = Math.max(1.0, Math.sqrt(vS / nFp));

    const w1Norm = (a: Uint8Array, b: Uint8Array): number => {
      let ta = 0;
      let tb = 0;
      for (let i = 0; i < GAP_BIN_COUNT; i++) {
        ta += a[i];
        tb += b[i];
      }
      if (ta <= 0 || tb <= 0) return 1;
      let ca = 0;
      let cb = 0;
      let l1 = 0;
      for (let i = 0; i < GAP_BIN_COUNT - 1; i++) {
        ca += a[i] / ta;
        cb += b[i] / tb;
        l1 += Math.abs(ca - cb);
      }
      return l1 / (GAP_BIN_COUNT - 1);
    };

    const rawDists: Array<{ i: number; w1: number; dna: number; comb: number }> = [];
    for (let i = 2; i < nFp - 2; i++) {
      const w1 =
        (4 * w1Norm(lastFp.counts, footprints[i].counts) +
          2 * w1Norm(prevFp.counts, footprints[i - 1].counts) +
          w1Norm(prev2Fp.counts, footprints[i - 2].counts)) /
        7;
      const dM = Math.abs(lastFp.meanGap - footprints[i].meanGap) / scM;
      const dS = Math.abs(lastFp.stdGap - footprints[i].stdGap) / scS;
      const dMed = Math.abs(lastFp.medianGap - footprints[i].medianGap) / scM;
      const dEnt = Math.abs(lastFp.entropy - footprints[i].entropy);
      const dna = Math.sqrt((dM * dM + dS * dS + dMed * dMed + dEnt * dEnt) / 4);
      rawDists.push({ i, w1, dna, comb: 0.5 * w1 + 0.5 * (dna / (1 + dna)) });
    }
    if (rawDists.length > 0) {
      const sorted = rawDists.map((d) => d.comb).sort((a, b) => a - b);
      w1Bandwidth = Math.max(0.05, sorted[Math.floor(sorted.length / 2)]);
      for (const d of rawDists) {
        const sim = Math.sqrt(Math.exp(-d.w1 / w1Bandwidth) * Math.exp(-d.dna));
        topMatches.push({ idx: d.i, sim });
      }
      topMatches.sort((a, b) => b.sim - a.sim);
      if (topMatches.length > 8) topMatches.length = 8;
    }
  }

  const seqEchoDist = new Float64Array(GAP_BIN_COUNT);
  let echoWSum = 0;
  let echoWSqSum = 0;
  for (const m of topMatches) {
    const nfp = footprints[m.idx + 1];
    for (let b = 0; b < GAP_BIN_COUNT; b++) seqEchoDist[b] += m.sim * (nfp.counts[b] / 5);
    echoWSum += m.sim;
    echoWSqSum += m.sim * m.sim;
  }
  for (let b = 0; b < GAP_BIN_COUNT; b++) {
    seqEchoDist[b] = echoWSum > 0 ? seqEchoDist[b] / echoWSum : empDist[b];
  }

  const klDiv = (p: Float64Array, q: Float64Array): number => {
    let s = 0;
    for (let b = 0; b < GAP_BIN_COUNT; b++) {
      const pb = Math.max(1e-9, p[b]);
      const qb = Math.max(1e-9, q[b]);
      s += pb * Math.log(pb / qb);
    }
    return Math.max(0, s);
  };

  const klM1 = klDiv(markov1Dist, empDist);
  const klM2 = klDiv(markov2Dist, markov1Dist);
  const klRen = klDiv(renewalDist, empDist);
  const klEcho = klDiv(seqEchoDist, empDist);

  const n1Eff = transRowTotals1[lastDom] / 5;
  const n2Eff = hasM2 ? transRowTotals2[key2] / 5 : 0;
  const credM1 = n1Eff / (n1Eff + GAP_BIN_COUNT);
  const credM2 = n2Eff / (n2Eff + GAP_BIN_COUNT);
  const credEcho =
    topMatches.length > 0
      ? topMatches[0].sim * (topMatches.length / (topMatches.length + GAP_BIN_COUNT))
      : 0;

  const evEmp = 1 / Math.sqrt(GAP_BIN_COUNT);
  const evM1 = credM1 * (evEmp + Math.sqrt(klM1));
  const evM2 = credM2 * (evEmp * 0.75 + Math.sqrt(klM2));
  const evRen = evEmp * 0.8 + Math.sqrt(klRen);
  const evEcho = credEcho * (evEmp + Math.sqrt(klEcho));
  const evSum = Math.max(1e-9, evEmp + evM1 + evM2 + evRen + evEcho);
  const modelWeights = new Float64Array([
    evEmp / evSum,
    evM1 / evSum,
    evM2 / evSum,
    evRen / evSum,
    evEcho / evSum,
  ]);

  const rawBlended = new Float64Array(GAP_BIN_COUNT);
  let totRaw = 0;
  for (let b = 0; b < GAP_BIN_COUNT; b++) {
    const lin =
      modelWeights[0] * empDist[b] +
      modelWeights[1] * markov1Dist[b] +
      modelWeights[2] * markov2Dist[b] +
      modelWeights[3] * renewalDist[b] +
      modelWeights[4] * seqEchoDist[b];
    const avail =
      poolSizes[b] === 0
        ? 0
        : Math.pow(poolSizes[b] / 90 / Math.max(1e-4, poolBaselineProbs[b]), 0.35);
    rawBlended[b] = Math.max(0, lin * avail);
    totRaw += rawBlended[b];
  }
  const blendedProbs = new Float64Array(GAP_BIN_COUNT);
  for (let b = 0; b < GAP_BIN_COUNT; b++) {
    blendedProbs[b] = totRaw > 0 ? rawBlended[b] / totRaw : poolBaselineProbs[b];
  }

  // Hamilton-Hare
  const trancheQuotas = new Uint8Array(GAP_BIN_COUNT);
  let maxZ = 0;
  for (let b = 0; b < GAP_BIN_COUNT; b++) {
    const p0 = poolBaselineProbs[b];
    const se = Math.sqrt(Math.max(1e-6, (p0 * (1 - p0)) / Math.max(1, n1Eff)));
    const z = Math.abs(blendedProbs[b] - p0) / se;
    if (z > maxZ) maxZ = z;
  }
  const effProbs = maxZ < 1.96 ? poolBaselineProbs : blendedProbs;
  let sumP = 0;
  for (let b = 0; b < GAP_BIN_COUNT; b++) if (poolSizes[b] > 0) sumP += effProbs[b];
  if (sumP > 0) {
    const rems: Array<{ b: number; rem: number; p: number }> = [];
    let alloc = 0;
    for (let b = 0; b < GAP_BIN_COUNT; b++) {
      const cap = poolSizes[b];
      if (cap <= 0) {
        rems.push({ b, rem: -1, p: 0 });
        continue;
      }
      const ex = (effProbs[b] / sumP) * 5;
      const fl = Math.min(cap, Math.floor(ex));
      trancheQuotas[b] = fl;
      alloc += fl;
      rems.push({ b, rem: fl < cap ? ex - fl : -1, p: effProbs[b] });
    }
    rems.sort(
      (a, b) =>
        b.p * Math.max(0, b.rem) - a.p * Math.max(0, a.rem) ||
        b.p - a.p ||
        b.rem - a.rem
    );
    let saf = 0;
    while (alloc < 5 && saf < 20) {
      saf++;
      let prog = false;
      for (const r of rems) {
        if (alloc >= 5) break;
        if (trancheQuotas[r.b] < poolSizes[r.b]) {
          trancheQuotas[r.b]++;
          alloc++;
          prog = true;
        }
      }
      if (!prog) break;
    }
  }

  const binZScores = new Float64Array(GAP_BIN_COUNT);
  for (let b = 0; b < GAP_BIN_COUNT; b++) {
    const p0 = poolBaselineProbs[b];
    const se = Math.sqrt(Math.max(1e-9, (p0 * (1 - p0)) / Math.max(1, n1Eff)));
    binZScores[b] = (blendedProbs[b] - p0) / se;
  }

  // Micro-scoring Stouffer
  const dirShrink = Math.sqrt(GAP_BIN_COUNT);
  const bndVar = 5 / 2;
  const seqNEff = echoWSqSum > 0 ? (echoWSum * echoWSum) / echoWSqSum : 0;
  const geomVarH0 = (1 - P_SINGLE_5_90) / (P_SINGLE_5_90 * P_SINGLE_5_90);

  const ballStoufferZ = new Float64Array(91);
  const ballStoufferP = new Float64Array(91).fill(0.5);
  const ballChannelZFlat = new Float64Array(91 * 5);
  const ballActiveChannels = new Uint8Array(91);
  const cands: Array<{ num: number; bin: number; z: number; comp: number }> = [];

  for (let num = 1; num <= 90; num++) {
    const cg = ballCurrentGaps[num];
    const bIdx = ballCurrentBin[num];
    const exits = ballExitGaps[num];
    const m = exits.length;
    const meanG = m > 0 ? exits.reduce((a, v) => a + v, 0) / m : (1 - P_SINGLE_5_90) / P_SINGLE_5_90;
    const varG =
      m >= 2
        ? exits.reduce((a, v) => a + (v - meanG) ** 2, 0) / m
        : geomVarH0;
    const stdG = Math.max(1.5, Math.sqrt(varG));

    let numZT = 0;
    let sumWSq = 0;
    for (let ob = 0; ob < GAP_BIN_COUNT; ob++) {
      const lo = GAP_BOUNDS_MIN[ob];
      const hi = GAP_BOUNDS_MAX[ob];
      const dist = cg < lo ? lo - cg : cg > hi ? cg - hi : 0;
      const w = Math.exp(-(dist * dist) / (2 * bndVar));
      numZT += w * binZScores[ob];
      sumWSq += w * w;
    }
    const zTr = sumWSq > 0 ? numZT / Math.sqrt(sumWSq) : binZScores[bIdx];
    const zDr = droughtZScores[bIdx];

    const bw = Math.max(1.2, 1.06 * stdG * Math.pow(Math.max(1, m), -0.2));
    const wLo = Math.max(0, cg - 1);
    const wHi = cg + Math.max(1, Math.round(bw * 0.75));
    let surv = 0;
    let near = 0;
    for (let i = 0; i < m; i++) {
      if (exits[i] >= wLo) {
        surv++;
        if (exits[i] <= wHi) near++;
      }
    }
    const p0W = Math.min(1 - 1e-6, Math.max(1e-6, 1 - Math.pow(1 - P_SINGLE_5_90, wHi - wLo + 1)));
    const zHa =
      surv > 0
        ? (surv / (surv + dirShrink)) *
          ((near - surv * p0W) / Math.sqrt(Math.max(1e-9, surv * p0W * (1 - p0W))))
        : 0;

    let zAf = 0;
    if (m > 0) {
      const hitsB = ballTrancheExits[num * GAP_BIN_COUNT + bIdx];
      const pS = Math.min(1 - 1e-5, Math.max(1e-5, poolBaselineProbs[bIdx]));
      zAf =
        (m / (m + dirShrink)) *
        ((hitsB - m * pS) / Math.sqrt(Math.max(1e-9, m * pS * (1 - pS))));
    }

    let echoHits = 0;
    for (const tm of topMatches) {
      const nfp = footprints[tm.idx + 1];
      let has = false;
      for (let wi = 0; wi < nfp.winLen; wi++) if (nfp.winners[wi] === num) has = true;
      if (has) echoHits += tm.sim;
    }
    const zEc =
      seqNEff > 0 && echoWSum > 0
        ? (seqNEff / (seqNEff + dirShrink)) *
          ((echoHits / echoWSum - P_SINGLE_5_90) /
            Math.sqrt(Math.max(1e-9, (P_SINGLE_5_90 * (1 - P_SINGLE_5_90)) / seqNEff)))
        : 0;

    let wSum = zTr + zDr;
    let kAct = 2;
    if (surv > 0) {
      wSum += zHa;
      kAct++;
    }
    if (m > 0) {
      wSum += zAf;
      kAct++;
    }
    if (seqNEff > 0) {
      wSum += zEc;
      kAct++;
    }
    const zSt = wSum / Math.sqrt(kAct);
    const pSt = 1 - normalCdfFast(zSt);
    const comp = Math.round(normalCdfFast(zSt) * 1000) / 10;

    ballStoufferZ[num] = Math.round(zSt * 10000) / 10000;
    ballStoufferP[num] = Math.round(pSt * 1000000) / 1000000;
    ballChannelZFlat[num * 5] = zTr;
    ballChannelZFlat[num * 5 + 1] = zDr;
    ballChannelZFlat[num * 5 + 2] = zHa;
    ballChannelZFlat[num * 5 + 3] = zAf;
    ballChannelZFlat[num * 5 + 4] = zEc;
    ballActiveChannels[num] = kAct;
    cands.push({ num, bin: bIdx, z: ballStoufferZ[num], comp });
  }

  cands.sort((a, b) => b.z - a.z || b.comp - a.comp || a.num - b.num);

  const binsPrio = [0, 1, 2, 3, 4, 5, 6].sort(
    (a, b) => binZScores[b] - binZScores[a] || blendedProbs[b] - blendedProbs[a] || a - b
  );
  const topPredictedBins = new Uint8Array([binsPrio[0], binsPrio[1], binsPrio[2]]);

  const selNums: number[] = [];
  const used = new Uint8Array(91);
  const decCnt = new Uint8Array(9);
  const divScale = 1 / Math.sqrt(5);
  for (const bId of binsPrio) {
    let q = trancheQuotas[bId];
    while (q > 0 && selNums.length < 5) {
      let bestN = 0;
      let bestM = -Infinity;
      for (const c of cands) {
        if (c.bin !== bId || used[c.num]) continue;
        const dec = Math.min(8, Math.floor((c.num - 1) / 10));
        let sg = 0;
        for (const sn of selNums) if (ballCurrentGaps[sn] === ballCurrentGaps[c.num]) sg++;
        const marg = c.z - (decCnt[dec] + sg) * divScale;
        if (marg > bestM) {
          bestM = marg;
          bestN = c.num;
        }
      }
      if (bestN === 0) break;
      selNums.push(bestN);
      used[bestN] = 1;
      decCnt[Math.min(8, Math.floor((bestN - 1) / 10))]++;
      q--;
    }
  }
  while (selNums.length < 5) {
    let bestN = 0;
    let bestM = -Infinity;
    for (const c of cands) {
      if (used[c.num]) continue;
      const dec = Math.min(8, Math.floor((c.num - 1) / 10));
      const marg = c.z - decCnt[dec] * divScale;
      if (marg > bestM) {
        bestM = marg;
        bestN = c.num;
      }
    }
    if (bestN === 0) break;
    selNums.push(bestN);
    used[bestN] = 1;
    decCnt[Math.min(8, Math.floor((bestN - 1) / 10))]++;
  }

  const selBins = new Uint8Array(GAP_BIN_COUNT);
  for (const n of selNums) selBins[ballCurrentBin[n]] = 1;
  const resNums: number[] = [];
  while (resNums.length < 2) {
    let bestN = 0;
    let bestU = -Infinity;
    for (const c of cands) {
      if (used[c.num]) continue;
      const u = c.z - (selBins[c.bin] ? divScale : 0);
      if (u > bestU) {
        bestU = u;
        bestN = c.num;
      }
    }
    if (bestN === 0) break;
    resNums.push(bestN);
    used[bestN] = 1;
    selBins[ballCurrentBin[bestN]] = 1;
  }

  selNums.sort((a, b) => a - b);
  const optimalFive = new Uint8Array(5);
  for (let i = 0; i < Math.min(5, selNums.length); i++) optimalFive[i] = selNums[i];
  const reserveTwo = new Uint8Array(2);
  for (let i = 0; i < Math.min(2, resNums.length); i++) reserveTwo[i] = resNums[i];

  let zSum = 0;
  let compSum = 0;
  const realCnt = new Uint8Array(GAP_BIN_COUNT);
  const decUsed = new Uint8Array(9);
  for (const n of selNums) {
    const c = cands.find((x) => x.num === n);
    if (c) {
      zSum += c.z;
      compSum += c.comp;
      realCnt[c.bin]++;
    }
    decUsed[Math.min(8, Math.floor((n - 1) / 10))] = 1;
  }
  const ticketStoufferZ = selNums.length > 0 ? zSum / Math.sqrt(selNums.length) : 0;
  const meanComp = selNums.length > 0 ? compSum / selNums.length : 50;
  let qCa = 0;
  let qCb = 0;
  let qL1 = 0;
  let ta = selNums.length;
  let tb = trancheQuotas.reduce((a, b) => a + b, 0);
  if (ta > 0 && tb > 0) {
    for (let i = 0; i < GAP_BIN_COUNT - 1; i++) {
      qCa += realCnt[i] / ta;
      qCb += trancheQuotas[i] / tb;
      qL1 += Math.abs(qCa - qCb);
    }
  }
  const qFid = Math.max(0, Math.min(100, (1 - qL1 / (GAP_BIN_COUNT - 1)) * 100));
  const decDiv = (decUsed.reduce((a, b) => a + b, 0) / 5) * 100;
  const maxTZ = Math.max(...Array.from(binZScores).map((z) => Math.abs(z)));
  const intCoh = 0.55 * meanComp + 0.25 * qFid + 0.20 * decDiv;
  const zEv = Math.max(0, Math.min(1, (maxTZ - 1.96) / 2.5));
  const selectionConfidence = Math.min(98.5, 25.4 + (Math.min(95, intCoh) - 25.4) * zEv);

  const recN = Math.min(10, nFp);
  let recAvg = 12.5;
  if (recN > 0) {
    let s = 0;
    for (let i = nFp - recN; i < nFp; i++) s += footprints[i].meanGap;
    recAvg = s / recN;
  }
  let expFromBins = 0;
  for (let b = 0; b < GAP_BIN_COUNT; b++) {
    const mid =
      GAP_BOUNDS_MAX[b] >= 0x7fffffff
        ? poolSizes[b] > 0
          ? poolGapSums[b] / poolSizes[b]
          : 40 + (1 - P_SINGLE_5_90) / P_SINGLE_5_90
        : (GAP_BOUNDS_MIN[b] + GAP_BOUNDS_MAX[b]) / 2;
    expFromBins += blendedProbs[b] * mid;
  }
  const expectedNextMean = 0.62 * expFromBins + 0.38 * recAvg;

  return {
    totalAnalyzedDraws: nFp,
    klM1,
    klM2,
    wassersteinBandwidth: w1Bandwidth,
    ticketStoufferZ: Math.round(ticketStoufferZ * 10000) / 10000,
    selectionConfidence: Math.round(selectionConfidence * 10) / 10,
    expectedNextMean: Math.round(expectedNextMean * 10) / 10,
    poolBaselineProbs,
    blendedProbs,
    binZScores,
    transitionMatrixOrder1,
    droughtDraws,
    droughtPressure,
    droughtZScores,
    modelWeights,
    ballCurrentGaps,
    ballStoufferZ,
    ballStoufferP,
    ballChannelZFlat,
    ballActiveChannels,
    topPredictedBins,
    optimalFive,
    reserveTwo,
    trancheQuotas,
  };
}

/**
 * 31. Analyse Séquences & Patterns d'Écarts par Tranches (Rust/WASM + Stouffer Z)
 */
export function computeGapRangeAnalysisHpc(
  chronoDrawsFlat: Int32Array | number[],
  numDraws: number,
  winCols: number = 5
): GapRangeAnalysisHpcResult {
  const flat = chronoDrawsFlat instanceof Int32Array ? chronoDrawsFlat : new Int32Array(chronoDrawsFlat);

  if (isWasmLoaded && wasmModuleInstance?.compute_gap_range_analysis_wasm) {
    try {
      const res = wasmModuleInstance.compute_gap_range_analysis_wasm(flat, numDraws, winCols);
      const out: GapRangeAnalysisHpcResult = {
        totalAnalyzedDraws: res.total_analyzed_draws,
        klM1: res.kl_m1,
        klM2: res.kl_m2,
        wassersteinBandwidth: res.wasserstein_bandwidth,
        ticketStoufferZ: res.ticket_stouffer_z,
        selectionConfidence: res.selection_confidence,
        expectedNextMean: res.expected_next_mean,
        poolBaselineProbs: new Float64Array(res.pool_baseline_probs),
        blendedProbs: new Float64Array(res.blended_probs),
        binZScores: new Float64Array(res.bin_z_scores),
        transitionMatrixOrder1: new Float64Array(res.transition_matrix_order1),
        droughtDraws: new Int32Array(res.drought_draws),
        droughtPressure: new Float64Array(res.drought_pressure),
        droughtZScores: new Float64Array(res.drought_z_scores),
        modelWeights: new Float64Array(res.model_weights),
        ballCurrentGaps: new Int32Array(res.ball_current_gaps),
        ballStoufferZ: new Float64Array(res.ball_stouffer_z),
        ballStoufferP: new Float64Array(res.ball_stouffer_p),
        ballChannelZFlat: new Float64Array(res.ball_channel_z_flat),
        ballActiveChannels: new Uint8Array(res.ball_active_channels),
        topPredictedBins: new Uint8Array(res.top_predicted_bins),
        optimalFive: new Uint8Array(res.optimal_five),
        reserveTwo: new Uint8Array(res.reserve_two),
        trancheQuotas: new Uint8Array(res.tranche_quotas),
      };
      if (typeof res.free === 'function') res.free();
      return out;
    } catch (e) {
      console.warn('[LOTO-ENGINE] WASM compute_gap_range_analysis_wasm error, using fallback :', e);
    }
  }

  return computeGapRangeCoreFallback(flat, numDraws, winCols);
}

/**
 * 32. Évaluation Walk-Forward Strictement Hors-Échantillon (0 Fuite Future)
 */
export function computeGapRangeWalkForwardHpc(
  chronoDrawsFlat: Int32Array | number[],
  numDraws: number,
  winCols: number = 5,
  windowSize: number = 30
): GapRangeWalkForwardHpcResult {
  const flat = chronoDrawsFlat instanceof Int32Array ? chronoDrawsFlat : new Int32Array(chronoDrawsFlat);

  if (isWasmLoaded && wasmModuleInstance?.compute_gap_range_walk_forward_wasm) {
    try {
      const res = wasmModuleInstance.compute_gap_range_walk_forward_wasm(flat, numDraws, winCols, windowSize);
      const out: GapRangeWalkForwardHpcResult = {
        evalCount: res.eval_count,
        minTrainDraws: res.min_train_draws,
        top1SuccessRate: res.top1_success_rate,
        top1H0ChanceRate: res.top1_h0_chance_rate,
        top3BallCoverageRate: res.top3_ball_coverage_rate,
        top3H0ChanceRate: res.top3_h0_chance_rate,
        avgBallsCoveredPerDraw: res.avg_balls_covered_per_draw,
        avgSelectionHitsPerDraw: res.avg_selection_hits_per_draw,
        selectionAtLeastOneHitRate: res.selection_at_least_one_hit_rate,
        meanBrierScore: res.mean_brier_score,
        h0BrierScore: res.h0_brier_score,
        brierSkillScore: res.brier_skill_score,
        stepDrawIndices: new Int32Array(res.step_draw_indices),
        stepPredictedTop3: new Uint8Array(res.step_predicted_top3),
        stepActualCounts: new Uint8Array(res.step_actual_counts),
        stepOptimalFiveHits: new Uint8Array(res.step_optimal_five_hits),
        stepBrierScores: new Float64Array(res.step_brier_scores),
      };
      if (typeof res.free === 'function') res.free();
      return out;
    } catch (e) {
      console.warn('[LOTO-ENGINE] WASM compute_gap_range_walk_forward_wasm error, using fallback :', e);
    }
  }

  const cols = Math.max(1, winCols);
  const totalDraws = Math.min(numDraws, Math.floor(flat.length / cols));
  const minTrain = Math.max(12, Math.min(25, Math.floor(totalDraws / 3)));
  const evalCount =
    totalDraws > minTrain ? Math.min(Math.max(1, windowSize), totalDraws - minTrain) : 0;

  if (evalCount === 0) {
    return {
      evalCount: 0,
      minTrainDraws: minTrain,
      top1SuccessRate: 0,
      top1H0ChanceRate: 0,
      top3BallCoverageRate: 0,
      top3H0ChanceRate: 0,
      avgBallsCoveredPerDraw: 0,
      avgSelectionHitsPerDraw: 0,
      selectionAtLeastOneHitRate: 0,
      meanBrierScore: 0,
      h0BrierScore: 0,
      brierSkillScore: 0,
      stepDrawIndices: new Int32Array(0),
      stepPredictedTop3: new Uint8Array(0),
      stepActualCounts: new Uint8Array(0),
      stepOptimalFiveHits: new Uint8Array(0),
      stepBrierScores: new Float64Array(0),
    };
  }

  const startT = totalDraws - evalCount;
  let top1Hits = 0;
  let top3Covered = 0;
  let totalEvalBalls = 0;
  let sumH0Top1 = 0;
  let sumH0Top3 = 0;
  let sumSelHits = 0;
  let selGe1 = 0;
  let sumBrier = 0;
  let sumH0Brier = 0;

  const stepDrawIndices = new Int32Array(evalCount);
  const stepPredictedTop3 = new Uint8Array(evalCount * 3);
  const stepActualCounts = new Uint8Array(evalCount * GAP_BIN_COUNT);
  const stepOptimalFiveHits = new Uint8Array(evalCount);
  const stepBrierScores = new Float64Array(evalCount);

  for (let s = 0; s < evalCount; s++) {
    const t = startT + s;
    const prefix = flat.subarray(0, t * cols);
    const core = computeGapRangeCoreFallback(prefix, t, cols);

    const tOff = t * cols;
    const actCounts = new Uint8Array(GAP_BIN_COUNT);
    const actBalls: number[] = [];
    for (let c = 0; c < Math.min(5, cols); c++) {
      const bv = flat[tOff + c];
      if (bv >= 1 && bv <= 90) {
        actCounts[classifyGapFast(core.ballCurrentGaps[bv])]++;
        actBalls.push(bv);
      }
    }

    const t0 = core.topPredictedBins[0];
    const t1 = core.topPredictedBins[1];
    const t2 = core.topPredictedBins[2];
    if (actCounts[t0] > 0) top1Hits++;

    const pTop1 = core.poolBaselineProbs[t0];
    const pTop3 =
      core.poolBaselineProbs[t0] + core.poolBaselineProbs[t1] + core.poolBaselineProbs[t2];
    sumH0Top1 += 1 - Math.pow(1 - pTop1, 5);
    sumH0Top3 += pTop3;

    const cov = actCounts[t0] + actCounts[t1] + actCounts[t2];
    top3Covered += cov;
    totalEvalBalls += Math.max(1, actBalls.length);

    let optHits = 0;
    for (let i = 0; i < 5; i++) {
      const cand = core.optimalFive[i];
      if (cand > 0 && actBalls.includes(cand)) optHits++;
    }
    sumSelHits += optHits;
    if (optHits >= 1) selGe1++;

    const denom = Math.max(1, actBalls.length);
    let brier = 0;
    let h0Brier = 0;
    for (let b = 0; b < GAP_BIN_COUNT; b++) {
      const y = actCounts[b] / denom;
      const e = core.blendedProbs[b] - y;
      const e0 = core.poolBaselineProbs[b] - y;
      brier += e * e;
      h0Brier += e0 * e0;
    }
    brier /= GAP_BIN_COUNT;
    h0Brier /= GAP_BIN_COUNT;
    sumBrier += brier;
    sumH0Brier += h0Brier;

    stepDrawIndices[s] = totalDraws - 1 - t;
    stepPredictedTop3[s * 3] = t0;
    stepPredictedTop3[s * 3 + 1] = t1;
    stepPredictedTop3[s * 3 + 2] = t2;
    stepActualCounts.set(actCounts, s * GAP_BIN_COUNT);
    stepOptimalFiveHits[s] = optHits;
    stepBrierScores[s] = brier;
  }

  const meanBrier = sumBrier / evalCount;
  const meanH0Brier = sumH0Brier / evalCount;
  const bss =
    meanH0Brier > 1e-9
      ? Math.max(-1, Math.min(1, 1 - meanBrier / meanH0Brier))
      : 0;

  return {
    evalCount,
    minTrainDraws: minTrain,
    top1SuccessRate: (top1Hits / evalCount) * 100,
    top1H0ChanceRate: (sumH0Top1 / evalCount) * 100,
    top3BallCoverageRate: (top3Covered / Math.max(1, totalEvalBalls)) * 100,
    top3H0ChanceRate: (sumH0Top3 / evalCount) * 100,
    avgBallsCoveredPerDraw: top3Covered / evalCount,
    avgSelectionHitsPerDraw: sumSelHits / evalCount,
    selectionAtLeastOneHitRate: (selGe1 / evalCount) * 100,
    meanBrierScore: meanBrier,
    h0BrierScore: meanH0Brier,
    brierSkillScore: bss,
    stepDrawIndices,
    stepPredictedTop3,
    stepActualCounts,
    stepOptimalFiveHits,
    stepBrierScores,
  };
}

/**
 * 33. Extraction Combinatoire Multi-Cycles HPC (Paires, Triplets Apriori & Transitions Markov)
 * Sans allocation de chaînes de caractères via indexation triangulaire/combinadique O(1).
 */
export function mineCyclePatternsHpc(
  chronoDrawsFlat: Int32Array | number[],
  numDraws: number,
  winCols: number,
  cycleLengthRaw: number,
  minSupportOverride: number = 0,
  includeTransitions: boolean = true
): PatternMiningHpcResult {
  const flat = chronoDrawsFlat instanceof Int32Array ? chronoDrawsFlat : new Int32Array(chronoDrawsFlat);

  if (isWasmLoaded && wasmModuleInstance?.mine_cycle_patterns_wasm) {
    try {
      const res = wasmModuleInstance.mine_cycle_patterns_wasm(
        flat,
        numDraws,
        winCols,
        cycleLengthRaw,
        minSupportOverride,
        includeTransitions
      );
      const out: PatternMiningHpcResult = {
        totalCycles: res.total_cycles,
        completedCyclesCount: res.completed_cycles_count,
        activeCycleIndex: res.active_cycle_index,
        activeCycleDrawsCount: res.active_cycle_draws_count,
        overallCycleEntropy: res.overall_cycle_entropy,
        minPairCyclesThreshold: res.min_pair_cycles_threshold,
        activeCycleNumbers: new Uint8Array(res.active_cycle_numbers),
        ballCycleCounts: new Uint32Array(res.ball_cycle_counts),
        sourceBallCounts: new Uint32Array(res.source_ball_counts),
        sameDrawPairCounts: new Uint32Array(res.same_draw_pair_counts),
        pairCycleSupports: new Uint32Array(res.pair_cycle_supports),
        pairTuples: new Uint32Array(res.pair_tuples),
        pairCycleOffsets: new Uint32Array(res.pair_cycle_offsets),
        pairCycleIndicesFlat: new Uint32Array(res.pair_cycle_indices_flat),
        tripletTuples: new Uint32Array(res.triplet_tuples),
        tripletCycleOffsets: new Uint32Array(res.triplet_cycle_offsets),
        tripletCycleIndicesFlat: new Uint32Array(res.triplet_cycle_indices_flat),
        transitionTuples: new Uint32Array(res.transition_tuples),
        transitionCycleOffsets: new Uint32Array(res.transition_cycle_offsets),
        transitionCycleIndicesFlat: new Uint32Array(res.transition_cycle_indices_flat),
      };
      if (typeof res.free === 'function') res.free();
      return out;
    } catch (e) {
      console.warn('[LOTO-ENGINE] WASM mine_cycle_patterns_wasm error, using fallback :', e);
    }
  }

  // Fallback déterministe à tableaux typés O(1) (zéro allocation de clés chaînes)
  const N_BALLS = 90;
  const TOTAL_PAIRS = 4005;
  const TOTAL_TRIPLETS = 117480;
  const cols = Math.max(1, winCols);
  const totalDraws = Math.min(numDraws, Math.floor(flat.length / cols));
  const cycleLength = Math.max(3, Math.min(30, cycleLengthRaw));

  if (totalDraws < cycleLength) {
    return {
      totalCycles: 0,
      completedCyclesCount: 0,
      activeCycleIndex: 0,
      activeCycleDrawsCount: 0,
      overallCycleEntropy: 0,
      minPairCyclesThreshold: 2,
      activeCycleNumbers: new Uint8Array(0),
      ballCycleCounts: new Uint32Array(N_BALLS + 1),
      sourceBallCounts: new Uint32Array(N_BALLS + 1),
      sameDrawPairCounts: new Uint32Array(0),
      pairCycleSupports: new Uint32Array(0),
      pairTuples: new Uint32Array(0),
      pairCycleOffsets: new Uint32Array([0]),
      pairCycleIndicesFlat: new Uint32Array(0),
      tripletTuples: new Uint32Array(0),
      tripletCycleOffsets: new Uint32Array([0]),
      tripletCycleIndicesFlat: new Uint32Array(0),
      transitionTuples: new Uint32Array(0),
      transitionCycleOffsets: new Uint32Array([0]),
      transitionCycleIndicesFlat: new Uint32Array(0),
    };
  }

  const pairIdx = (a: number, b: number): number => {
    const m = a - 1;
    return m * N_BALLS - ((m * (m + 1)) >> 1) + (b - a - 1);
  };
  const tripletIdx = (a: number, b: number, c: number): number => {
    const i = a - 1;
    const j = b - 1;
    const k = c - 1;
    return (
      i +
      ((j * (j > 0 ? j - 1 : 0)) >> 1) +
      Math.floor((k * (k > 0 ? k - 1 : 0) * (k > 1 ? k - 2 : 0)) / 6)
    );
  };
  const comb = (n: number, k: number): number => {
    if (k < 0 || k > n) return 0;
    if (k === 0 || k === n) return 1;
    let c = 1;
    for (let i = 1; i <= k; i++) c = (c * (n - (k - i))) / i;
    return c;
  };
  const exactUnion = (k: number): number => {
    const tot = comb(N_BALLS, 5);
    let p = 0;
    for (let j = 0; j <= k; j++) {
      p += (j % 2 === 0 ? 1 : -1) * comb(k, j) * Math.pow(comb(N_BALLS - j, 5) / tot, cycleLength);
    }
    return Math.max(1e-7, Math.min(1 - 1e-7, p));
  };

  const totalCycles = Math.ceil(totalDraws / cycleLength);
  const activeCycleIndex = totalCycles - 1;
  const completedCyclesCount = totalCycles > 1 ? totalCycles - 1 : 1;

  const actStart = activeCycleIndex * cycleLength;
  const actEnd = Math.min(totalDraws, actStart + cycleLength);
  const activeCycleDrawsCount = actEnd - actStart;
  const actSeen = new Uint8Array(N_BALLS + 1);
  for (let d = actStart; d < actEnd; d++) {
    const off = d * cols;
    for (let c = 0; c < cols; c++) {
      const v = flat[off + c];
      if (v >= 1 && v <= N_BALLS) actSeen[v] = 1;
    }
  }
  const actNumsArr: number[] = [];
  for (let n = 1; n <= N_BALLS; n++) if (actSeen[n]) actNumsArr.push(n);
  const activeCycleNumbers = new Uint8Array(actNumsArr);

  const globalBallDrawCounts = new Uint32Array(N_BALLS + 1);
  const ballCycleCounts = new Uint32Array(N_BALLS + 1);
  const sameDrawPairCounts = new Uint32Array(TOTAL_PAIRS);
  const sameDrawTripletCounts = new Uint16Array(TOTAL_TRIPLETS);
  let totalBallHits = 0;

  interface Bucket {
    cycleIdx: number;
    nums: Uint8Array;
    early: Uint8Array;
    mid: Uint8Array;
    late: Uint8Array;
  }
  const buckets: Bucket[] = [];

  for (let c = 0; c < completedCyclesCount; c++) {
    const startIdx = c * cycleLength;
    const endIdx = Math.min(totalDraws, startIdx + cycleLength);
    const drawsInC = endIdx - startIdx;
    const phaseThird = Math.max(1, drawsInC / 3);
    const allF = new Uint8Array(N_BALLS + 1);
    const earlyF = new Uint8Array(N_BALLS + 1);
    const midF = new Uint8Array(N_BALLS + 1);
    const lateF = new Uint8Array(N_BALLS + 1);

    for (let dr = 0; dr < drawsInC; dr++) {
      const off = (startIdx + dr) * cols;
      const dNums: number[] = [];
      for (let col = 0; col < cols; col++) {
        const v = flat[off + col];
        if (v >= 1 && v <= N_BALLS) {
          allF[v] = 1;
          globalBallDrawCounts[v]++;
          totalBallHits++;
          if (dr < phaseThird) earlyF[v] = 1;
          else if (dr < phaseThird * 2) midF[v] = 1;
          else lateF[v] = 1;
          if (!dNums.includes(v)) dNums.push(v);
        }
      }
      dNums.sort((a, b) => a - b);
      for (let i = 0; i < dNums.length; i++) {
        for (let j = i + 1; j < dNums.length; j++) {
          sameDrawPairCounts[pairIdx(dNums[i], dNums[j])]++;
          for (let k = j + 1; k < dNums.length; k++) {
            sameDrawTripletCounts[tripletIdx(dNums[i], dNums[j], dNums[k])]++;
          }
        }
      }
    }

    const sNums: number[] = [];
    for (let n = 1; n <= N_BALLS; n++) {
      if (allF[n]) {
        ballCycleCounts[n]++;
        sNums.push(n);
      }
    }
    buckets.push({ cycleIdx: c, nums: new Uint8Array(sNums), early: earlyF, mid: midF, late: lateF });
  }

  let rawEntropy = 0;
  if (totalBallHits > 0) {
    for (let n = 1; n <= N_BALLS; n++) {
      if (globalBallDrawCounts[n] > 0) {
        const p = globalBallDrawCounts[n] / totalBallHits;
        rawEntropy -= p * Math.log2(p);
      }
    }
  }
  const overallCycleEntropy = parseFloat(
    Math.min(1, Math.max(0, rawEntropy / Math.log2(N_BALLS))).toFixed(4)
  );

  const pairCycles: number[][] = Array.from({ length: TOTAL_PAIRS }, () => []);
  const pairEarlyX2 = new Uint32Array(TOTAL_PAIRS);
  const pairMidX2 = new Uint32Array(TOTAL_PAIRS);
  const pairLateX2 = new Uint32Array(TOTAL_PAIRS);
  const pairA = new Uint8Array(TOTAL_PAIRS);
  const pairB = new Uint8Array(TOTAL_PAIRS);
  for (let a = 1; a <= N_BALLS; a++) {
    for (let b = a + 1; b <= N_BALLS; b++) {
      const pid = pairIdx(a, b);
      pairA[pid] = a;
      pairB[pid] = b;
    }
  }

  for (const cyc of buckets) {
    const nums = cyc.nums;
    for (let i = 0; i < nums.length; i++) {
      const n1 = nums[i];
      for (let j = i + 1; j < nums.length; j++) {
        const n2 = nums[j];
        const pid = pairIdx(n1, n2);
        pairCycles[pid].push(cyc.cycleIdx);
        if (cyc.early[n1] && cyc.early[n2]) pairEarlyX2[pid] += 2;
        else if (cyc.mid[n1] && cyc.mid[n2]) pairMidX2[pid] += 2;
        else if (cyc.late[n1] && cyc.late[n2]) pairLateX2[pid] += 2;
        else {
          if (cyc.early[n1] || cyc.early[n2]) pairEarlyX2[pid] += 1;
          if (cyc.mid[n1] || cyc.mid[n2]) pairMidX2[pid] += 1;
          if (cyc.late[n1] || cyc.late[n2]) pairLateX2[pid] += 1;
        }
      }
    }
  }

  const pairCycleSupports = new Uint32Array(TOTAL_PAIRS);
  for (let pid = 0; pid < TOTAL_PAIRS; pid++) pairCycleSupports[pid] = pairCycles[pid].length;

  const expSingle = exactUnion(1);
  const expPair = exactUnion(2);
  const minPairForTriplet = Math.max(2, Math.ceil(completedCyclesCount * expPair * 1.15));
  const aprioriCands: Array<{ pid: number; score: number }> = [];
  for (let pid = 0; pid < TOTAL_PAIRS; pid++) {
    const sup = pairCycles[pid].length;
    const sc = sameDrawPairCounts[pid];
    if (sup >= minPairForTriplet || sc >= 2) {
      const a = pairA[pid];
      const b = pairB[pid];
      const dice = (2 * sup) / Math.max(1, (ballCycleCounts[a] || 1) + (ballCycleCounts[b] || 1));
      const lift = sup / Math.max(1, completedCyclesCount) / expPair;
      aprioriCands.push({ pid, score: lift * dice + sc * 3.0 });
    }
  }
  aprioriCands.sort((x, y) => y.score - x.score || x.pid - y.pid);
  const freqFlags = new Uint8Array(TOTAL_PAIRS);
  for (let i = 0; i < Math.min(320, aprioriCands.length); i++) freqFlags[aprioriCands[i].pid] = 1;

  const tripletAcc = new Map<
    number,
    { a: number; b: number; c: number; e: number; m: number; l: number; cycs: number[] }
  >();
  for (const cyc of buckets) {
    const nums = cyc.nums;
    const len = nums.length;
    if (len < 3) continue;
    for (let i = 0; i < len - 2; i++) {
      const n1 = nums[i];
      for (let j = i + 1; j < len - 1; j++) {
        const n2 = nums[j];
        const f12 = freqFlags[pairIdx(n1, n2)] === 1;
        for (let k = j + 1; k < len; k++) {
          const n3 = nums[k];
          const tid = tripletIdx(n1, n2, n3);
          const hasSd = sameDrawTripletCounts[tid] >= 1;
          if (!hasSd && (!f12 || !freqFlags[pairIdx(n1, n3)] || !freqFlags[pairIdx(n2, n3)])) {
            continue;
          }
          let entry = tripletAcc.get(tid);
          if (!entry) {
            entry = { a: n1, b: n2, c: n3, e: 0, m: 0, l: 0, cycs: [] };
            tripletAcc.set(tid, entry);
          }
          entry.cycs.push(cyc.cycleIdx);
          entry.e += cyc.early[n1] + cyc.early[n2] + cyc.early[n3];
          entry.m += cyc.mid[n1] + cyc.mid[n2] + cyc.mid[n3];
          entry.l += cyc.late[n1] + cyc.late[n2] + cyc.late[n3];
        }
      }
    }
  }

  const minPairCyclesThreshold =
    minSupportOverride > 0
      ? minSupportOverride
      : Math.max(2, Math.floor(completedCyclesCount * expPair * 0.85));

  const pairTuplesArr: number[] = [];
  const pairOffsetsArr: number[] = [0];
  const pairCycsFlat: number[] = [];
  for (let pid = 0; pid < TOTAL_PAIRS; pid++) {
    const cycs = pairCycles[pid];
    const sc = sameDrawPairCounts[pid];
    if (cycs.length >= minPairCyclesThreshold || sc >= 2) {
      pairTuplesArr.push(pairA[pid], pairB[pid], sc, pairEarlyX2[pid], pairMidX2[pid], pairLateX2[pid]);
      for (const cIdx of cycs) pairCycsFlat.push(cIdx);
      pairOffsetsArr.push(pairCycsFlat.length);
    }
  }

  const tripletTuplesArr: number[] = [];
  const tripletOffsetsArr: number[] = [0];
  const tripletCycsFlat: number[] = [];
  const sortedTids = Array.from(tripletAcc.keys()).sort((a, b) => a - b);
  for (const tid of sortedTids) {
    const acc = tripletAcc.get(tid)!;
    const sc = sameDrawTripletCounts[tid];
    if (acc.cycs.length >= 2 || sc >= 1) {
      tripletTuplesArr.push(acc.a, acc.b, acc.c, sc, acc.e, acc.m, acc.l);
      for (const cIdx of acc.cycs) tripletCycsFlat.push(cIdx);
      tripletOffsetsArr.push(tripletCycsFlat.length);
    }
  }

  const sourceBallCounts = new Uint32Array(N_BALLS + 1);
  const srcLim = Math.max(1, completedCyclesCount - 1);
  for (let c = 0; c < Math.min(srcLim, buckets.length); c++) {
    for (const n of buckets[c].nums) sourceBallCounts[n]++;
  }

  const transTuplesArr: number[] = [];
  const transOffsetsArr: number[] = [0];
  const transCycsFlat: number[] = [];
  if (includeTransitions && buckets.length >= 2) {
    const bayesPrior = Math.sqrt(Math.max(1, completedCyclesCount));
    const smoothProb = new Float64Array(N_BALLS + 1);
    for (let n = 1; n <= N_BALLS; n++) {
      smoothProb[n] = (ballCycleCounts[n] + bayesPrior * expSingle) / (completedCyclesCount + bayesPrior);
    }
    const transCycs: number[][] = Array.from({ length: N_BALLS * N_BALLS }, () => []);
    const trE = new Uint32Array(N_BALLS * N_BALLS);
    const trM = new Uint32Array(N_BALLS * N_BALLS);
    const trL = new Uint32Array(N_BALLS * N_BALLS);
    for (let c = 0; c < buckets.length - 1; c++) {
      const curr = buckets[c];
      const next = buckets[c + 1];
      for (const src of curr.nums) {
        for (const tgt of next.nums) {
          if (src !== tgt) {
            const eid = (src - 1) * N_BALLS + (tgt - 1);
            transCycs[eid].push(next.cycleIdx);
            if (next.early[tgt]) trE[eid]++;
            if (next.mid[tgt]) trM[eid]++;
            if (next.late[tgt]) trL[eid]++;
          }
        }
      }
    }
    for (let src = 1; src <= N_BALLS; src++) {
      const srcTot = Math.max(1, sourceBallCounts[src]);
      for (let tgt = 1; tgt <= N_BALLS; tgt++) {
        if (src === tgt) continue;
        const eid = (src - 1) * N_BALLS + (tgt - 1);
        const transitions = transCycs[eid].length;
        if (transitions < 2) continue;
        const targMarg = smoothProb[tgt];
        const smoothedTr = (transitions + bayesPrior * targMarg) / (srcTot + bayesPrior);
        const lift = targMarg > 0 ? smoothedTr / targMarg : 1.0;
        const minTr = Math.max(2, Math.floor(srcTot * targMarg * 1.15));
        if (transitions >= minTr && lift > 1.08) {
          transTuplesArr.push(src, tgt, trE[eid], trM[eid], trL[eid]);
          for (const cIdx of transCycs[eid]) transCycsFlat.push(cIdx);
          transOffsetsArr.push(transCycsFlat.length);
        }
      }
    }
  }

  return {
    totalCycles,
    completedCyclesCount,
    activeCycleIndex,
    activeCycleDrawsCount,
    overallCycleEntropy,
    minPairCyclesThreshold,
    activeCycleNumbers,
    ballCycleCounts,
    sourceBallCounts,
    sameDrawPairCounts,
    pairCycleSupports,
    pairTuples: new Uint32Array(pairTuplesArr),
    pairCycleOffsets: new Uint32Array(pairOffsetsArr),
    pairCycleIndicesFlat: new Uint32Array(pairCycsFlat),
    tripletTuples: new Uint32Array(tripletTuplesArr),
    tripletCycleOffsets: new Uint32Array(tripletOffsetsArr),
    tripletCycleIndicesFlat: new Uint32Array(tripletCycsFlat),
    transitionTuples: new Uint32Array(transTuplesArr),
    transitionCycleOffsets: new Uint32Array(transOffsetsArr),
    transitionCycleIndicesFlat: new Uint32Array(transCycsFlat),
  };
}


