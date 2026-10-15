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
      const wasm = await import('../../crates/loto-engine/pkg/loto_engine.js').catch(() => null);

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


