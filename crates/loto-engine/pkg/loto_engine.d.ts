/* tslint:disable */
/* eslint-disable */

/**
 * Résultat de l'optimisation combinatoire par recuit simulé
 */
export class AnnealingOptimizationResult {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    readonly best_combination: Int32Array;
    readonly best_energy: number;
    readonly iterations_run: number;
}

/**
 * Structure de résultat pour l'analyse des cooccurrences inter-tirages
 */
export class CooccurrenceTensorResult {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    readonly conditioned_pair_hits: Int32Array;
    readonly dyad_matrix: Int32Array;
    readonly target_pair_hits: Int32Array;
    readonly total_pairs_evaluated: number;
}

/**
 * Résultat vectorisé du Noyau de Hawkes Croisé (Cross-Exciting Hawkes Process)
 */
export class CrossHawkesWasmResult {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    readonly intensities: Float64Array;
    readonly lag_excitations: Float64Array;
    readonly net_excitations: Float64Array;
    readonly total_energy: number;
}

/**
 * Analyse spectrale FFT 100% déterministe et vectorisée.
 * Évalue la densité spectrale de puissance (PSD) et identifie la fréquence et période dominante.
 */
export class SpectralAnalysisResult {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    readonly dominant_frequency: number;
    readonly dominant_period: number;
    readonly energy: number;
    readonly psd: Float64Array;
}

/**
 * Résultat de l'analyse topologique et chaotique
 */
export class TopologicalLyapunovResult {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    readonly divergence_force: number;
    readonly is_chaotic: boolean;
    readonly lyapunov_exponent: number;
    readonly topological_entropy: number;
}

/**
 * Analyse spectrale complète d'un signal temporel (0/1 ou centré).
 * Conforme à la règle Zéro Nombre Magique : les périodes sont dérivées de la résolution spectrale continue.
 */
export function analyze_signal_spectrum(signal: Float64Array): SpectralAnalysisResult;

/**
 * Analyse fractale par lot sur l'ensemble des 90 numéros d'un historique.
 * `history_matrix` est aplati : `num_draws x 5` entiers contenant les numéros gagnants.
 * Retourne un vecteur de 90 éléments contenant les exposants de Hurst respectifs.
 */
export function batch_fractal_hurst_analysis(history_draws: Int32Array, num_draws: number, win_cols: number): Float64Array;

/**
 * Analyse tensorielle haute performance des cooccurrences inter-tirages en WebAssembly
 *
 * Calcule en mémoire continue contiguë :
 * - La matrice complète des dyades (91 x 91)
 * - Le dénombrement inconditionnel des 4005 paires cibles
 * - Le dénombrement conditionné par la présence des numéros actifs du tirage prédécesseur
 */
export function compute_cooccurrence_tensor_wasm(pred_draws_flat: Int32Array, target_draws_flat: Int32Array, num_draws: number, win_cols: number, active_pred_numbers: Int32Array): CooccurrenceTensorResult;

/**
 * Noyau de Hawkes Croisé Vectorisé en Rust Natif WebAssembly
 *
 * Modélise l'excitation stochastique continue entre tirages au sein d'une famille étanche :
 * lambda_i(t) = mu_i + sum_{l=1}^L exp(-beta * l) * sum_{j in D_pred(t-l)} A_{j, i}
 *
 * # Arguments
 * - `pred_occurrences` : tranche aplatie de `lag_count * win_cols` entiers (numéros 1..90)
 * - `lag_count` : profondeur M des tirages antérieurs du prédécesseur
 * - `win_cols` : 5 numéros par tirage
 * - `target_baseline` : tranche de 91 f64 (intensité de base mu_i)
 * - `coupling_matrix` : tranche aplatie de 91 x 91 f64 (matrice de couplage inter-tirages A_ji)
 * - `beta_decay` : coefficient continu d'amortissement temporel
 */
export function compute_cross_hawkes_kernel(pred_occurrences: Int32Array, lag_count: number, win_cols: number, target_baseline: Float64Array, coupling_matrix: Float64Array, beta_decay: number): CrossHawkesWasmResult;

/**
 * Calcule la Transformée de Fourier Rapide (FFT) via `rustfft` sur une tranche de signal `&[f64]`.
 * Applique un fenêtrage de Hann continu C^∞ pour éliminer les discontinuités spectrales de bord.
 */
export function compute_fft_power_spectrum(signal: Float64Array): Float64Array;

/**
 * Calcule la matrice de transition stochastique de Markov (90 x 90)
 * à partir d'une tranche d'historique aplatie (num_draws x win_cols).
 *
 * 100% Déterministe et sans allocation dans la boucle critique.
 */
export function compute_markov_transition_matrix_wasm(history_draws: Int32Array, num_draws: number, win_cols: number, num_states: number): Float64Array;

/**
 * Calcule l'Exposant de Hurst Robuste H via l'analyse R/S adaptative (Rescaled Range)
 *
 * Propriétés mathématiques :
 * - H > 0.5 : Régime persistant / mémoire longue (tendance)
 * - H = 0.5 : Mouvement brownien standard (bruit blanc)
 * - H < 0.5 : Régime anti-persistant (retour à la moyenne)
 *
 * Zéro nombre magique : les échelles temporelles sont calculées continûment selon
 * la taille du signal et la volatilité locale.
 */
export function compute_robust_hurst_wasm(signal: Float64Array): number;

/**
 * Calcule l'Exposant de Lyapunov $\lambda$ et la dynamique topologique continue
 * sur une séquence d'historique aplatie (num_draws x win_cols).
 *
 * $\lambda = \frac{1}{K} \sum_{k=0}^{K-1} \ln(D_{topologique}(t_k, t_{k+1}) + 1e-4)$
 *
 * Permet d'adapter dynamiquement les coefficients d'apprentissage et de pénalité :
 * - $\lambda > 0$ : Régime chaotique / divergent
 * - $\lambda \le 0$ : Régime d'attracteur régulier / convergent
 */
export function compute_topological_lyapunov_wasm(history_draws: Int32Array, num_draws: number, win_cols: number, horizon_limit: number): TopologicalLyapunovResult;

/**
 * Produit scalaire de deux vecteurs vectorisé (SIMD / auto-vectorisation LLVM)
 */
export function dot_product_f64(a: Float64Array, b: Float64Array): number;

/**
 * Point d'entrée d'initialisation du module WebAssembly
 */
export function init_engine(): void;

/**
 * Évalue les probabilités d'état futur par projection Markovienne d'ordre 1
 * sur le dernier tirage gagnant `last_draw_numbers` (5 entiers).
 */
export function project_markov_next_state(transition_matrix: Float64Array, last_draw: Int32Array, num_states: number): Float64Array;

/**
 * Optimisation Combinatoire par Recuit Simulé (Simulated Annealing) Haute Performance
 *
 * Explore l'espace d'états discret des combinaisons de 5 numéros parmi le pool de candidats
 * avec un calendrier de refroidissement continu Boltzmann : T_{k+1} = T_k * alpha.
 *
 * 100% Déterministe via seed LCG canonique, garantit zéro allocation dans la boucle critique.
 */
export function solve_combinatorial_annealing_wasm(candidate_pool: Int32Array, scores_91: Float64Array, affinity_matrix: Float64Array, initial_temperature: number, cooling_rate: number, min_temperature: number, iterations_per_temp: number, deterministic_seed: bigint): AnnealingOptimizationResult;

/**
 * Scoring tensoriel rapide des 90 numéros : Matrix (90 x F) * Weights (F x 1)
 */
export function tensor_score_wasm(features_flat: Float64Array, weights: Float64Array, num_numbers: number, num_features: number): Float64Array;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_annealingoptimizationresult_free: (a: number, b: number) => void;
    readonly __wbg_cooccurrencetensorresult_free: (a: number, b: number) => void;
    readonly __wbg_crosshawkeswasmresult_free: (a: number, b: number) => void;
    readonly __wbg_spectralanalysisresult_free: (a: number, b: number) => void;
    readonly __wbg_topologicallyapunovresult_free: (a: number, b: number) => void;
    readonly analyze_signal_spectrum: (a: number, b: number) => number;
    readonly annealingoptimizationresult_best_combination: (a: number, b: number) => void;
    readonly annealingoptimizationresult_best_energy: (a: number) => number;
    readonly annealingoptimizationresult_iterations_run: (a: number) => number;
    readonly batch_fractal_hurst_analysis: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly compute_cooccurrence_tensor_wasm: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => number;
    readonly compute_cross_hawkes_kernel: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => number;
    readonly compute_fft_power_spectrum: (a: number, b: number, c: number) => void;
    readonly compute_markov_transition_matrix_wasm: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly compute_robust_hurst_wasm: (a: number, b: number) => number;
    readonly compute_topological_lyapunov_wasm: (a: number, b: number, c: number, d: number, e: number) => number;
    readonly cooccurrencetensorresult_conditioned_pair_hits: (a: number, b: number) => void;
    readonly cooccurrencetensorresult_dyad_matrix: (a: number, b: number) => void;
    readonly cooccurrencetensorresult_target_pair_hits: (a: number, b: number) => void;
    readonly cooccurrencetensorresult_total_pairs_evaluated: (a: number) => number;
    readonly crosshawkeswasmresult_intensities: (a: number, b: number) => void;
    readonly crosshawkeswasmresult_lag_excitations: (a: number, b: number) => void;
    readonly crosshawkeswasmresult_net_excitations: (a: number, b: number) => void;
    readonly crosshawkeswasmresult_total_energy: (a: number) => number;
    readonly dot_product_f64: (a: number, b: number, c: number, d: number) => number;
    readonly init_engine: () => void;
    readonly project_markov_next_state: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly solve_combinatorial_annealing_wasm: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: bigint) => number;
    readonly spectralanalysisresult_dominant_frequency: (a: number) => number;
    readonly spectralanalysisresult_dominant_period: (a: number) => number;
    readonly spectralanalysisresult_energy: (a: number) => number;
    readonly spectralanalysisresult_psd: (a: number, b: number) => void;
    readonly tensor_score_wasm: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
    readonly topologicallyapunovresult_divergence_force: (a: number) => number;
    readonly topologicallyapunovresult_is_chaotic: (a: number) => number;
    readonly topologicallyapunovresult_lyapunov_exponent: (a: number) => number;
    readonly topologicallyapunovresult_topological_entropy: (a: number) => number;
    readonly __wbindgen_export: (a: number, b: number, c: number) => void;
    readonly __wbindgen_export2: (a: number, b: number) => number;
    readonly __wbindgen_export3: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
