/* tslint:disable */
/* eslint-disable */

export class AcoResultHpc {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    readonly best_numbers: Int32Array;
    best_score: number;
    confidence: number;
    generations_run: number;
    pheromone_density: number;
}

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

export enum BettingStrategyWasm {
    Flat = 0,
    Martingale = 1,
    Kelly = 2,
    ConfidenceSmart = 3,
}

export class ClosedLoopAutopsyResultHpc {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    readonly updated_weights: Float64Array;
    brier_score: number;
    divergence_metric: number;
    exact_hits: number;
    near_misses: number;
    rmse: number;
    wasserstein_distance: number;
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

export class CyclicBatchReportHpc {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    get_ball(idx: number): number;
    get_hazard_rate(idx: number): number;
    get_phase_angle(idx: number): number;
    get_phase_resonance(idx: number): number;
    get_quality_factor(idx: number): number;
    get_score(idx: number): number;
    readonly count: number;
}

export class CyclicCandidateHpc {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    ball: number;
    hazard_rate: number;
    phase_angle_deg: number;
    phase_resonance: number;
    quality_factor: number;
    score: number;
}

export class HawkesOutputHpc {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    readonly intensities: Float64Array;
}

export class HybridRegimeOptimizationHpc {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    confidence: number;
    stability_index: number;
    readonly optimized_weights: Float64Array;
}

/**
 * Gestionnaire global du cache in-memory de tous les tirages
 */
export class InMemoryDrawStore {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Analyse préalable complète de l'historique d'un tirage (Entropie, Hurst, FFT, Régime)
     */
    analyze_draw(draw_name: string): PriorAnalysisReport;
    /**
     * Insère un nouveau tirage de façon idempotente (Delta Sync unitaire)
     */
    append_single_draw(draw_name: string, timestamp: bigint, winners: Uint8Array, machine: Uint8Array): boolean;
    /**
     * Amorce (Bootstrap) le cache depuis un payload JSON compact reçu de Supabase
     * Trie chronologiquement et dédoublonne strictement chaque tirage.
     */
    bootstrap_json(json_payload: string): number;
    /**
     * Réinitialise complètement un tirage puis recharge en bloc avec tri chronologique et dédoublonnage.
     * API explicite clear + bulk_load pour synchronisation robuste sans cumul.
     */
    clear_and_reload(json_payload: string, draw_name: string): number;
    /**
     * Réinitialise l'historique d'un tirage spécifique
     */
    clear_draw(draw_name: string): void;
    /**
     * Calcule le couplage continu d'interconnexion entre deux tirages du store
     * Zéro coupure binaire, poids continu dans ]0.0, 1.0[ selon AGENTS.md
     */
    compute_interdraw_coupling(draw_a: string, draw_b: string): number;
    /**
     * Calcule la propagation d'advection domino pour un tirage cible
     * en exploitant les tirages récents du même réseau
     */
    compute_network_domino_wasm(draw_name: string, damping_gamma: number): WasmDominoResult;
    /**
     * Évalue la calibration empirique out-of-fold et la performance Walk-Forward
     */
    compute_walk_forward_calibration(draw_name: string, window_size: number): WalkForwardReport;
    /**
     * Génère un portefeuille de tickets diversifiés (100% calculé en RAM Wasm locale, zéro réseau)
     */
    generate_portfolio(draw_name: string, num_tickets: number): WasmPredictionPortfolio;
    /**
     * Retourne les écarts actuels [1..90] directement depuis la RAM locale en O(1)
     */
    get_current_gaps(draw_name: string): Uint32Array;
    /**
     * Récupère la taille de l'historique en RAM pour un tirage donné
     */
    get_draw_count(draw_name: string): number;
    /**
     * Retourne les fréquences [1..90] directement depuis la RAM locale en O(1)
     */
    get_frequencies(draw_name: string): Uint32Array;
    /**
     * Retourne l'identifiant du réseau ("hebdomadaire" ou "quotidien")
     */
    get_network_id(draw_name: string): string;
    constructor();
    /**
     * Reconstruit les index de dédoublonnage de toutes les timelines.
     * À appeler après toute désérialisation pour restaurer l'invariant `seen_draws`.
     */
    rebuild_all_seen_indexes(): void;
}

export class MonteCarloBallStat {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    ball: number;
    mean_score: number;
    p5: number;
    p95: number;
    stability_index: number;
    std_dev: number;
}

export class MonteCarloReportHpc {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    get_ball(idx: number): number;
    get_mean(idx: number): number;
    get_p5(idx: number): number;
    get_p95(idx: number): number;
    get_stability_index(idx: number): number;
    get_std_dev(idx: number): number;
    readonly count: number;
}

export class NativePredictionResult {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    confidence_score: number;
    hurst_exponent: number;
    shannon_entropy: number;
    readonly scores: Float64Array;
    readonly top_10: Uint8Array;
    readonly top_5: Uint8Array;
}

/**
 * Rapport d'analyse préalable de l'historique complet en RAM
 */
export class PriorAnalysisReport {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    dominant_period: number;
    hurst_exponent: number;
    shannon_entropy: number;
    spectral_energy: number;
    thermal_volatility: number;
    readonly regime_label: string;
}

export class SimulationResultHpc {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    bankruptcy_draw: number;
    max_drawdown: number;
    net_profit: number;
    profit_factor: number;
    recovery_factor: number;
    roi: number;
    sharpe_ratio: number;
    sortino_ratio: number;
    win_rate: number;
    readonly balances: Float64Array;
    readonly drawdowns: Float64Array;
}

export class SpatialFieldMetricsHpc {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    barycenter_x: number;
    barycenter_y: number;
    density_threshold: number;
    entropy: number;
    readonly gravity_pulls: Float64Array;
    readonly grid_density: Float64Array;
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

export class WalkForwardReport {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    block_bootstrap_bss_mean: number;
    block_bootstrap_bss_std: number;
    brier_score: number;
    brier_skill_score: number;
    ece: number;
    empirical_reliability_score: number;
    evaluated_windows: number;
    holdout_brier_skill_score: number;
    holdout_draws: number;
    lift_vs_random: number;
    log_loss: number;
    mean_hits: number;
    platt_alpha: number;
    platt_beta: number;
    readonly calibration_quality_label: string;
}

export class WasmButterflyResult {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    is_chaotic: boolean;
    lyapunov_exponent: number;
    phase_attractor_x: number;
    phase_attractor_y: number;
    phase_attractor_z: number;
    sensitivity_regime: number;
}

export class WasmChainReactionResult {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    max_constructive_amplitude: number;
    percolation_density: number;
    readonly avalanche_critical_numbers: Int32Array;
    readonly resonance_spectrum: Float64Array;
}

export class WasmDominoResult {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    static empty(gamma: number): WasmDominoResult;
    readonly domino_energies: Float64Array;
    readonly kinetic_dissipation_rate: number;
    readonly lead_trigger_numbers: Int32Array;
}

export class WasmHeatKernelResult {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    readonly diffusion_matrix: Float64Array;
    readonly harmonic_centralities: Float64Array;
    readonly trace_energy: number;
}

/**
 * Portefeuille de prédictions multi-tickets diversifiés (anti-monoculture)
 */
export class WasmPredictionPortfolio {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    confidence_score: number;
    diversity_jaccard_distance: number;
    hurst_exponent: number;
    shannon_entropy: number;
    ticket_count: number;
    unique_numbers_covered: number;
    readonly prediction_mode: string;
    readonly scores_flat: Float64Array;
    readonly strategies: string[];
    readonly tickets_flat: Uint8Array;
}

/**
 * Hash FNV-1a déterministe des exports WASM publics du moteur.
 * Le bridge TS compare cette valeur à sa propre liste d'appels attendus.
 * Si les deux divergent, le build CI échoue avant déploiement.
 */
export function abi_hash(): string;

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
 * 3. Effet Papillon : Exposant de Lyapunov Local et Trajectoire d'Attracteur
 */
export function compute_butterfly_lyapunov_wasm(lag_series: Float64Array, hurst_exponent: number): WasmButterflyResult;

/**
 * 4. Réaction en Chaîne : Résonance d'Interférence Constructive et Potentiel d'Avalanche
 */
export function compute_chain_reaction_resonance_wasm(recent_draws_flat: Int32Array, draws_count: number, source_couplings: Float64Array, num_sources: number): WasmChainReactionResult;

/**
 * Exécute l'autopsie forensique en boucle fermée et la mise à jour continue des poids (SGD / Huber).
 */
export function compute_closed_loop_autopsy_wasm(predicted_numbers: Int32Array, actual_winners: Int32Array, current_weights: Float64Array, algo_contributions_flat: Float64Array, num_algos: number, history_depth: number): ClosedLoopAutopsyResultHpc;

/**
 * Export Wasm pour le calcul de couplage continu d'interconnexion
 */
export function compute_continuous_interdraw_coupling_wasm(freqs_a: Uint32Array, freqs_b: Uint32Array): number;

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
 * Évalue les candidats cycliques harmoniques en O(N) avec zéro nombre magique
 */
export function compute_cyclic_candidates_hpc(current_gaps: Float64Array, avg_gaps: Float64Array, std_devs: Float64Array, acf_scores: Float64Array, limit_draws: number): CyclicBatchReportHpc;

/**
 * 2. Effet Domino : Advection Cinétique Déterministe et Ondes de Réverbération
 */
export function compute_domino_advection_wasm(history_flat: Int32Array, draws_count: number, damping_gamma: number): WasmDominoResult;

/**
 * Calcule la Transformée de Fourier Rapide (FFT) via `rustfft` sur une tranche de signal `&[f64]`.
 * Applique un fenêtrage de Hann continu C^∞ pour éliminer les discontinuités spectrales de bord.
 */
export function compute_fft_power_spectrum(signal: Float64Array): Float64Array;

/**
 * Calcule en O(N) les fréquences exactes des 90 numéros sur une tranche aplatie de tirages.
 * Retourne un vecteur de taille 91 où l'index `n` (1..=90) contient le nombre d'apparitions.
 */
export function compute_frequency_counts_wasm(flat_draws: Int32Array, num_draws: number, win_cols: number): Int32Array;

/**
 * 1. Effet de Cascade : Noyau de Chaleur de Graphe (Graph Heat Kernel exp(-tL))
 * Résout K_t = exp(-t * L) où L = I - D^{-1/2} W D^{-1/2} est le Laplacien normalisé symétrique.
 * Utilise une approximation polynomiale de Taylor avec normalisation stochastique continue.
 */
export function compute_graph_heat_kernel_wasm(weights_flat: Float64Array, n: number, diffusion_time_t: number): WasmHeatKernelResult;

/**
 * Calcule l'intensité exacte du processus de Hawkes auto-excité pour les 90 numéros
 */
export function compute_hawkes_intensity_hpc(flat_history: Int32Array, num_draws: number, avg_gaps: Float64Array): HawkesOutputHpc;

/**
 * Calcule l'allocation optimale des poids selon le régime fractal/entropique (remplace `hybrid-prediction` Cloud).
 */
export function compute_hybrid_regime_weights_wasm(base_weights: Float64Array, channel_types: Int32Array, hurst: number, entropy_norm: number, volatility_norm: number, history_depth: number): HybridRegimeOptimizationHpc;

/**
 * Divergence Kullback-Leibler continue sur Simplex 90D
 */
export function compute_kl_divergence_hpc(p_base: Float64Array, p_sim: Float64Array): number;

/**
 * Calcule la matrice de transition stochastique de Markov (90 x 90)
 * à partir d'une tranche d'historique aplatie (num_draws x win_cols).
 *
 * 100% Déterministe et sans allocation dans la boucle critique.
 */
export function compute_markov_transition_matrix_wasm(history_draws: Int32Array, num_draws: number, win_cols: number, num_states: number): Float64Array;

/**
 * PMI (Pointwise Mutual Information) lissé de Laplace pour les 4005 paires.
 *
 * Remplace les comptages bruts par une mesure d'association normalisée :
 * PMI(i,j) = ln[ P_smoothed(i,j) / (P_smoothed(i) * P_smoothed(j)) ]
 * avec lissage alpha = nombre moyen de paires par cellule (dérivé des données).
 */
export function compute_pair_pmi_wasm(pred_draws_flat: Int32Array, target_draws_flat: Int32Array, num_draws: number, win_cols: number, active_pred_numbers: Int32Array): Float64Array;

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
 * Calcule le champ spatial complet (densité, puits de gravité, barycentre, seuil Probit)
 */
export function compute_spatial_grid_hpc(flat_draws: Int32Array, num_draws: number): SpatialFieldMetricsHpc;

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
 * Version sémantique du moteur Rust, extraite de Cargo.toml à la compilation.
 * Permet au bridge TS de vérifier la cohérence binaire/source.
 */
export function engine_version(): string;

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
 * Exécute l'optimisation par colonie de fourmis (ACS) en mémoire contiguë Rust/WASM.
 */
export function run_aco_optimization_wasm(flat_history: Int32Array, num_draws: number, win_cols: number, ants_count: number, generations: number, alpha: number, beta: number, rho: number, q0: number, bias_targets: Int32Array, seed: bigint): AcoResultHpc;

/**
 * Stress Test Monte Carlo HPC à haute densité d'itérations
 */
export function run_monte_carlo_whatif_hpc(base_matrix: Float64Array, k_algos: number, base_weights: Float64Array, iterations: number, noise_std_dev: number, seed: bigint): MonteCarloReportHpc;

/**
 * Pipeline de prédiction local ultra-rapide exécuté en RAM contiguë
 */
export function run_native_prediction_pipeline(flat_winners: Uint8Array, num_draws: number, frequency_weight: number, gap_weight: number, _markov_weight: number, _hurst_weight: number): NativePredictionResult;

/**
 * Évalue le moteur financier de backtest en O(N) déterministe avec zéro allocation intermédiaire.
 */
export function run_simulation_hpc(hits_history: Int32Array, confidences: Float64Array, multipliers: Float64Array, strategy_code: number, initial_bankroll: number, unit_bet: number): SimulationResultHpc;

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
 * Export WASM (binding fin) : optimise les poids de stacking L2 sur sorties OOF aplaties.
 *
 * Layout `oof_flat` : [sample][channel][91] (indice 0 inutilisé)
 * Layout `targets_flat` : [sample][91] (1.0 = numéro sorti, 0.0 sinon)
 * Retourne les K poids du simplexe (somme = 1.0).
 */
export function stack_channel_weights_wasm(oof_flat: Float64Array, targets_flat: Float64Array, num_channels: number, num_samples: number): Float64Array;

/**
 * Scoring tensoriel rapide des 90 numéros : Matrix (90 x F) * Weights (F x 1)
 */
export function tensor_score_wasm(features_flat: Float64Array, weights: Float64Array, num_numbers: number, num_features: number): Float64Array;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_acoresulthpc_free: (a: number, b: number) => void;
    readonly __wbg_annealingoptimizationresult_free: (a: number, b: number) => void;
    readonly __wbg_closedloopautopsyresulthpc_free: (a: number, b: number) => void;
    readonly __wbg_cooccurrencetensorresult_free: (a: number, b: number) => void;
    readonly __wbg_crosshawkeswasmresult_free: (a: number, b: number) => void;
    readonly __wbg_cyclicbatchreporthpc_free: (a: number, b: number) => void;
    readonly __wbg_cycliccandidatehpc_free: (a: number, b: number) => void;
    readonly __wbg_get_acoresulthpc_best_score: (a: number) => number;
    readonly __wbg_get_acoresulthpc_confidence: (a: number) => number;
    readonly __wbg_get_acoresulthpc_generations_run: (a: number) => number;
    readonly __wbg_get_acoresulthpc_pheromone_density: (a: number) => number;
    readonly __wbg_get_closedloopautopsyresulthpc_brier_score: (a: number) => number;
    readonly __wbg_get_closedloopautopsyresulthpc_divergence_metric: (a: number) => number;
    readonly __wbg_get_closedloopautopsyresulthpc_exact_hits: (a: number) => number;
    readonly __wbg_get_closedloopautopsyresulthpc_near_misses: (a: number) => number;
    readonly __wbg_get_closedloopautopsyresulthpc_rmse: (a: number) => number;
    readonly __wbg_get_closedloopautopsyresulthpc_wasserstein_distance: (a: number) => number;
    readonly __wbg_get_cycliccandidatehpc_ball: (a: number) => number;
    readonly __wbg_get_cycliccandidatehpc_hazard_rate: (a: number) => number;
    readonly __wbg_get_cycliccandidatehpc_phase_angle_deg: (a: number) => number;
    readonly __wbg_get_cycliccandidatehpc_phase_resonance: (a: number) => number;
    readonly __wbg_get_cycliccandidatehpc_quality_factor: (a: number) => number;
    readonly __wbg_get_cycliccandidatehpc_score: (a: number) => number;
    readonly __wbg_get_hybridregimeoptimizationhpc_confidence: (a: number) => number;
    readonly __wbg_get_hybridregimeoptimizationhpc_stability_index: (a: number) => number;
    readonly __wbg_get_montecarloballstat_ball: (a: number) => number;
    readonly __wbg_get_montecarloballstat_mean_score: (a: number) => number;
    readonly __wbg_get_montecarloballstat_p5: (a: number) => number;
    readonly __wbg_get_montecarloballstat_p95: (a: number) => number;
    readonly __wbg_get_montecarloballstat_stability_index: (a: number) => number;
    readonly __wbg_get_montecarloballstat_std_dev: (a: number) => number;
    readonly __wbg_get_nativepredictionresult_confidence_score: (a: number) => number;
    readonly __wbg_get_nativepredictionresult_hurst_exponent: (a: number) => number;
    readonly __wbg_get_nativepredictionresult_shannon_entropy: (a: number) => number;
    readonly __wbg_get_prioranalysisreport_dominant_period: (a: number) => number;
    readonly __wbg_get_prioranalysisreport_hurst_exponent: (a: number) => number;
    readonly __wbg_get_prioranalysisreport_shannon_entropy: (a: number) => number;
    readonly __wbg_get_prioranalysisreport_spectral_energy: (a: number) => number;
    readonly __wbg_get_prioranalysisreport_thermal_volatility: (a: number) => number;
    readonly __wbg_get_simulationresulthpc_bankruptcy_draw: (a: number) => number;
    readonly __wbg_get_simulationresulthpc_max_drawdown: (a: number) => number;
    readonly __wbg_get_simulationresulthpc_net_profit: (a: number) => number;
    readonly __wbg_get_simulationresulthpc_profit_factor: (a: number) => number;
    readonly __wbg_get_simulationresulthpc_recovery_factor: (a: number) => number;
    readonly __wbg_get_simulationresulthpc_roi: (a: number) => number;
    readonly __wbg_get_simulationresulthpc_sharpe_ratio: (a: number) => number;
    readonly __wbg_get_simulationresulthpc_sortino_ratio: (a: number) => number;
    readonly __wbg_get_simulationresulthpc_win_rate: (a: number) => number;
    readonly __wbg_get_spatialfieldmetricshpc_barycenter_x: (a: number) => number;
    readonly __wbg_get_spatialfieldmetricshpc_barycenter_y: (a: number) => number;
    readonly __wbg_get_spatialfieldmetricshpc_density_threshold: (a: number) => number;
    readonly __wbg_get_spatialfieldmetricshpc_entropy: (a: number) => number;
    readonly __wbg_get_walkforwardreport_block_bootstrap_bss_mean: (a: number) => number;
    readonly __wbg_get_walkforwardreport_block_bootstrap_bss_std: (a: number) => number;
    readonly __wbg_get_walkforwardreport_brier_score: (a: number) => number;
    readonly __wbg_get_walkforwardreport_brier_skill_score: (a: number) => number;
    readonly __wbg_get_walkforwardreport_ece: (a: number) => number;
    readonly __wbg_get_walkforwardreport_empirical_reliability_score: (a: number) => number;
    readonly __wbg_get_walkforwardreport_evaluated_windows: (a: number) => number;
    readonly __wbg_get_walkforwardreport_holdout_brier_skill_score: (a: number) => number;
    readonly __wbg_get_walkforwardreport_holdout_draws: (a: number) => number;
    readonly __wbg_get_walkforwardreport_lift_vs_random: (a: number) => number;
    readonly __wbg_get_walkforwardreport_log_loss: (a: number) => number;
    readonly __wbg_get_walkforwardreport_mean_hits: (a: number) => number;
    readonly __wbg_get_walkforwardreport_platt_alpha: (a: number) => number;
    readonly __wbg_get_walkforwardreport_platt_beta: (a: number) => number;
    readonly __wbg_get_wasmbutterflyresult_is_chaotic: (a: number) => number;
    readonly __wbg_get_wasmbutterflyresult_lyapunov_exponent: (a: number) => number;
    readonly __wbg_get_wasmbutterflyresult_phase_attractor_x: (a: number) => number;
    readonly __wbg_get_wasmbutterflyresult_phase_attractor_y: (a: number) => number;
    readonly __wbg_get_wasmbutterflyresult_phase_attractor_z: (a: number) => number;
    readonly __wbg_get_wasmbutterflyresult_sensitivity_regime: (a: number) => number;
    readonly __wbg_get_wasmchainreactionresult_max_constructive_amplitude: (a: number) => number;
    readonly __wbg_get_wasmchainreactionresult_percolation_density: (a: number) => number;
    readonly __wbg_get_wasmpredictionportfolio_confidence_score: (a: number) => number;
    readonly __wbg_get_wasmpredictionportfolio_diversity_jaccard_distance: (a: number) => number;
    readonly __wbg_get_wasmpredictionportfolio_hurst_exponent: (a: number) => number;
    readonly __wbg_get_wasmpredictionportfolio_shannon_entropy: (a: number) => number;
    readonly __wbg_get_wasmpredictionportfolio_ticket_count: (a: number) => number;
    readonly __wbg_get_wasmpredictionportfolio_unique_numbers_covered: (a: number) => number;
    readonly __wbg_hawkesoutputhpc_free: (a: number, b: number) => void;
    readonly __wbg_hybridregimeoptimizationhpc_free: (a: number, b: number) => void;
    readonly __wbg_inmemorydrawstore_free: (a: number, b: number) => void;
    readonly __wbg_montecarloballstat_free: (a: number, b: number) => void;
    readonly __wbg_montecarloreporthpc_free: (a: number, b: number) => void;
    readonly __wbg_nativepredictionresult_free: (a: number, b: number) => void;
    readonly __wbg_prioranalysisreport_free: (a: number, b: number) => void;
    readonly __wbg_set_acoresulthpc_best_score: (a: number, b: number) => void;
    readonly __wbg_set_acoresulthpc_confidence: (a: number, b: number) => void;
    readonly __wbg_set_acoresulthpc_generations_run: (a: number, b: number) => void;
    readonly __wbg_set_acoresulthpc_pheromone_density: (a: number, b: number) => void;
    readonly __wbg_set_closedloopautopsyresulthpc_brier_score: (a: number, b: number) => void;
    readonly __wbg_set_closedloopautopsyresulthpc_divergence_metric: (a: number, b: number) => void;
    readonly __wbg_set_closedloopautopsyresulthpc_exact_hits: (a: number, b: number) => void;
    readonly __wbg_set_closedloopautopsyresulthpc_near_misses: (a: number, b: number) => void;
    readonly __wbg_set_closedloopautopsyresulthpc_rmse: (a: number, b: number) => void;
    readonly __wbg_set_closedloopautopsyresulthpc_wasserstein_distance: (a: number, b: number) => void;
    readonly __wbg_set_cycliccandidatehpc_ball: (a: number, b: number) => void;
    readonly __wbg_set_cycliccandidatehpc_hazard_rate: (a: number, b: number) => void;
    readonly __wbg_set_cycliccandidatehpc_phase_angle_deg: (a: number, b: number) => void;
    readonly __wbg_set_cycliccandidatehpc_phase_resonance: (a: number, b: number) => void;
    readonly __wbg_set_cycliccandidatehpc_quality_factor: (a: number, b: number) => void;
    readonly __wbg_set_cycliccandidatehpc_score: (a: number, b: number) => void;
    readonly __wbg_set_hybridregimeoptimizationhpc_confidence: (a: number, b: number) => void;
    readonly __wbg_set_hybridregimeoptimizationhpc_stability_index: (a: number, b: number) => void;
    readonly __wbg_set_montecarloballstat_ball: (a: number, b: number) => void;
    readonly __wbg_set_montecarloballstat_mean_score: (a: number, b: number) => void;
    readonly __wbg_set_montecarloballstat_p5: (a: number, b: number) => void;
    readonly __wbg_set_montecarloballstat_p95: (a: number, b: number) => void;
    readonly __wbg_set_montecarloballstat_stability_index: (a: number, b: number) => void;
    readonly __wbg_set_montecarloballstat_std_dev: (a: number, b: number) => void;
    readonly __wbg_set_nativepredictionresult_confidence_score: (a: number, b: number) => void;
    readonly __wbg_set_nativepredictionresult_hurst_exponent: (a: number, b: number) => void;
    readonly __wbg_set_nativepredictionresult_shannon_entropy: (a: number, b: number) => void;
    readonly __wbg_set_prioranalysisreport_dominant_period: (a: number, b: number) => void;
    readonly __wbg_set_prioranalysisreport_hurst_exponent: (a: number, b: number) => void;
    readonly __wbg_set_prioranalysisreport_shannon_entropy: (a: number, b: number) => void;
    readonly __wbg_set_prioranalysisreport_spectral_energy: (a: number, b: number) => void;
    readonly __wbg_set_prioranalysisreport_thermal_volatility: (a: number, b: number) => void;
    readonly __wbg_set_simulationresulthpc_bankruptcy_draw: (a: number, b: number) => void;
    readonly __wbg_set_simulationresulthpc_max_drawdown: (a: number, b: number) => void;
    readonly __wbg_set_simulationresulthpc_net_profit: (a: number, b: number) => void;
    readonly __wbg_set_simulationresulthpc_profit_factor: (a: number, b: number) => void;
    readonly __wbg_set_simulationresulthpc_recovery_factor: (a: number, b: number) => void;
    readonly __wbg_set_simulationresulthpc_roi: (a: number, b: number) => void;
    readonly __wbg_set_simulationresulthpc_sharpe_ratio: (a: number, b: number) => void;
    readonly __wbg_set_simulationresulthpc_sortino_ratio: (a: number, b: number) => void;
    readonly __wbg_set_simulationresulthpc_win_rate: (a: number, b: number) => void;
    readonly __wbg_set_spatialfieldmetricshpc_barycenter_x: (a: number, b: number) => void;
    readonly __wbg_set_spatialfieldmetricshpc_barycenter_y: (a: number, b: number) => void;
    readonly __wbg_set_spatialfieldmetricshpc_density_threshold: (a: number, b: number) => void;
    readonly __wbg_set_spatialfieldmetricshpc_entropy: (a: number, b: number) => void;
    readonly __wbg_set_walkforwardreport_block_bootstrap_bss_mean: (a: number, b: number) => void;
    readonly __wbg_set_walkforwardreport_block_bootstrap_bss_std: (a: number, b: number) => void;
    readonly __wbg_set_walkforwardreport_brier_score: (a: number, b: number) => void;
    readonly __wbg_set_walkforwardreport_brier_skill_score: (a: number, b: number) => void;
    readonly __wbg_set_walkforwardreport_ece: (a: number, b: number) => void;
    readonly __wbg_set_walkforwardreport_empirical_reliability_score: (a: number, b: number) => void;
    readonly __wbg_set_walkforwardreport_evaluated_windows: (a: number, b: number) => void;
    readonly __wbg_set_walkforwardreport_holdout_brier_skill_score: (a: number, b: number) => void;
    readonly __wbg_set_walkforwardreport_holdout_draws: (a: number, b: number) => void;
    readonly __wbg_set_walkforwardreport_lift_vs_random: (a: number, b: number) => void;
    readonly __wbg_set_walkforwardreport_log_loss: (a: number, b: number) => void;
    readonly __wbg_set_walkforwardreport_mean_hits: (a: number, b: number) => void;
    readonly __wbg_set_walkforwardreport_platt_alpha: (a: number, b: number) => void;
    readonly __wbg_set_walkforwardreport_platt_beta: (a: number, b: number) => void;
    readonly __wbg_set_wasmbutterflyresult_is_chaotic: (a: number, b: number) => void;
    readonly __wbg_set_wasmbutterflyresult_lyapunov_exponent: (a: number, b: number) => void;
    readonly __wbg_set_wasmbutterflyresult_phase_attractor_x: (a: number, b: number) => void;
    readonly __wbg_set_wasmbutterflyresult_phase_attractor_y: (a: number, b: number) => void;
    readonly __wbg_set_wasmbutterflyresult_phase_attractor_z: (a: number, b: number) => void;
    readonly __wbg_set_wasmbutterflyresult_sensitivity_regime: (a: number, b: number) => void;
    readonly __wbg_set_wasmchainreactionresult_max_constructive_amplitude: (a: number, b: number) => void;
    readonly __wbg_set_wasmchainreactionresult_percolation_density: (a: number, b: number) => void;
    readonly __wbg_set_wasmpredictionportfolio_confidence_score: (a: number, b: number) => void;
    readonly __wbg_set_wasmpredictionportfolio_diversity_jaccard_distance: (a: number, b: number) => void;
    readonly __wbg_set_wasmpredictionportfolio_hurst_exponent: (a: number, b: number) => void;
    readonly __wbg_set_wasmpredictionportfolio_shannon_entropy: (a: number, b: number) => void;
    readonly __wbg_set_wasmpredictionportfolio_ticket_count: (a: number, b: number) => void;
    readonly __wbg_set_wasmpredictionportfolio_unique_numbers_covered: (a: number, b: number) => void;
    readonly __wbg_simulationresulthpc_free: (a: number, b: number) => void;
    readonly __wbg_spatialfieldmetricshpc_free: (a: number, b: number) => void;
    readonly __wbg_spectralanalysisresult_free: (a: number, b: number) => void;
    readonly __wbg_topologicallyapunovresult_free: (a: number, b: number) => void;
    readonly __wbg_walkforwardreport_free: (a: number, b: number) => void;
    readonly __wbg_wasmbutterflyresult_free: (a: number, b: number) => void;
    readonly __wbg_wasmchainreactionresult_free: (a: number, b: number) => void;
    readonly __wbg_wasmdominoresult_free: (a: number, b: number) => void;
    readonly __wbg_wasmheatkernelresult_free: (a: number, b: number) => void;
    readonly __wbg_wasmpredictionportfolio_free: (a: number, b: number) => void;
    readonly abi_hash: (a: number) => void;
    readonly acoresulthpc_best_numbers: (a: number, b: number) => void;
    readonly analyze_signal_spectrum: (a: number, b: number) => number;
    readonly annealingoptimizationresult_best_combination: (a: number, b: number) => void;
    readonly annealingoptimizationresult_best_energy: (a: number) => number;
    readonly annealingoptimizationresult_iterations_run: (a: number) => number;
    readonly batch_fractal_hurst_analysis: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly closedloopautopsyresulthpc_updated_weights: (a: number, b: number) => void;
    readonly compute_butterfly_lyapunov_wasm: (a: number, b: number, c: number) => number;
    readonly compute_chain_reaction_resonance_wasm: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
    readonly compute_closed_loop_autopsy_wasm: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number) => number;
    readonly compute_continuous_interdraw_coupling_wasm: (a: number, b: number, c: number, d: number) => number;
    readonly compute_cooccurrence_tensor_wasm: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => number;
    readonly compute_cross_hawkes_kernel: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => number;
    readonly compute_cyclic_candidates_hpc: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => number;
    readonly compute_domino_advection_wasm: (a: number, b: number, c: number, d: number) => number;
    readonly compute_fft_power_spectrum: (a: number, b: number, c: number) => void;
    readonly compute_frequency_counts_wasm: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly compute_graph_heat_kernel_wasm: (a: number, b: number, c: number, d: number) => number;
    readonly compute_hawkes_intensity_hpc: (a: number, b: number, c: number, d: number, e: number) => number;
    readonly compute_hybrid_regime_weights_wasm: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => number;
    readonly compute_kl_divergence_hpc: (a: number, b: number, c: number, d: number) => number;
    readonly compute_markov_transition_matrix_wasm: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly compute_pair_pmi_wasm: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => void;
    readonly compute_robust_hurst_wasm: (a: number, b: number) => number;
    readonly compute_spatial_grid_hpc: (a: number, b: number, c: number) => number;
    readonly compute_topological_lyapunov_wasm: (a: number, b: number, c: number, d: number, e: number) => number;
    readonly cooccurrencetensorresult_conditioned_pair_hits: (a: number, b: number) => void;
    readonly cooccurrencetensorresult_dyad_matrix: (a: number, b: number) => void;
    readonly cooccurrencetensorresult_target_pair_hits: (a: number, b: number) => void;
    readonly cooccurrencetensorresult_total_pairs_evaluated: (a: number) => number;
    readonly crosshawkeswasmresult_intensities: (a: number, b: number) => void;
    readonly crosshawkeswasmresult_lag_excitations: (a: number, b: number) => void;
    readonly crosshawkeswasmresult_net_excitations: (a: number, b: number) => void;
    readonly crosshawkeswasmresult_total_energy: (a: number) => number;
    readonly cyclicbatchreporthpc_count: (a: number) => number;
    readonly cyclicbatchreporthpc_get_ball: (a: number, b: number) => number;
    readonly cyclicbatchreporthpc_get_hazard_rate: (a: number, b: number) => number;
    readonly cyclicbatchreporthpc_get_phase_angle: (a: number, b: number) => number;
    readonly cyclicbatchreporthpc_get_phase_resonance: (a: number, b: number) => number;
    readonly cyclicbatchreporthpc_get_quality_factor: (a: number, b: number) => number;
    readonly cyclicbatchreporthpc_get_score: (a: number, b: number) => number;
    readonly dot_product_f64: (a: number, b: number, c: number, d: number) => number;
    readonly engine_version: (a: number) => void;
    readonly hawkesoutputhpc_intensities: (a: number, b: number) => void;
    readonly hybridregimeoptimizationhpc_optimized_weights: (a: number, b: number) => void;
    readonly init_engine: () => void;
    readonly inmemorydrawstore_analyze_draw: (a: number, b: number, c: number, d: number) => void;
    readonly inmemorydrawstore_append_single_draw: (a: number, b: number, c: number, d: number, e: bigint, f: number, g: number, h: number, i: number) => void;
    readonly inmemorydrawstore_bootstrap_json: (a: number, b: number, c: number, d: number) => void;
    readonly inmemorydrawstore_clear_and_reload: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly inmemorydrawstore_clear_draw: (a: number, b: number, c: number) => void;
    readonly inmemorydrawstore_compute_interdraw_coupling: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly inmemorydrawstore_compute_network_domino_wasm: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly inmemorydrawstore_compute_walk_forward_calibration: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly inmemorydrawstore_generate_portfolio: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly inmemorydrawstore_get_current_gaps: (a: number, b: number, c: number, d: number) => void;
    readonly inmemorydrawstore_get_draw_count: (a: number, b: number, c: number) => number;
    readonly inmemorydrawstore_get_frequencies: (a: number, b: number, c: number, d: number) => void;
    readonly inmemorydrawstore_get_network_id: (a: number, b: number, c: number, d: number) => void;
    readonly inmemorydrawstore_new: () => number;
    readonly inmemorydrawstore_rebuild_all_seen_indexes: (a: number) => void;
    readonly montecarloreporthpc_count: (a: number) => number;
    readonly montecarloreporthpc_get_ball: (a: number, b: number) => number;
    readonly montecarloreporthpc_get_mean: (a: number, b: number) => number;
    readonly montecarloreporthpc_get_p5: (a: number, b: number) => number;
    readonly montecarloreporthpc_get_p95: (a: number, b: number) => number;
    readonly montecarloreporthpc_get_stability_index: (a: number, b: number) => number;
    readonly montecarloreporthpc_get_std_dev: (a: number, b: number) => number;
    readonly nativepredictionresult_scores: (a: number, b: number) => void;
    readonly nativepredictionresult_top_10: (a: number, b: number) => void;
    readonly nativepredictionresult_top_5: (a: number, b: number) => void;
    readonly prioranalysisreport_regime_label: (a: number, b: number) => void;
    readonly project_markov_next_state: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly run_aco_optimization_wasm: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: bigint) => number;
    readonly run_monte_carlo_whatif_hpc: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: bigint) => number;
    readonly run_native_prediction_pipeline: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => number;
    readonly run_simulation_hpc: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => number;
    readonly simulationresulthpc_balances: (a: number, b: number) => void;
    readonly simulationresulthpc_drawdowns: (a: number, b: number) => void;
    readonly solve_combinatorial_annealing_wasm: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: bigint) => number;
    readonly spatialfieldmetricshpc_gravity_pulls: (a: number, b: number) => void;
    readonly spatialfieldmetricshpc_grid_density: (a: number, b: number) => void;
    readonly spectralanalysisresult_dominant_frequency: (a: number) => number;
    readonly spectralanalysisresult_dominant_period: (a: number) => number;
    readonly spectralanalysisresult_energy: (a: number) => number;
    readonly spectralanalysisresult_psd: (a: number, b: number) => void;
    readonly stack_channel_weights_wasm: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
    readonly tensor_score_wasm: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
    readonly topologicallyapunovresult_divergence_force: (a: number) => number;
    readonly topologicallyapunovresult_is_chaotic: (a: number) => number;
    readonly topologicallyapunovresult_lyapunov_exponent: (a: number) => number;
    readonly topologicallyapunovresult_topological_entropy: (a: number) => number;
    readonly walkforwardreport_calibration_quality_label: (a: number, b: number) => void;
    readonly wasmchainreactionresult_avalanche_critical_numbers: (a: number, b: number) => void;
    readonly wasmchainreactionresult_resonance_spectrum: (a: number, b: number) => void;
    readonly wasmdominoresult_domino_energies: (a: number, b: number) => void;
    readonly wasmdominoresult_empty: (a: number) => number;
    readonly wasmdominoresult_kinetic_dissipation_rate: (a: number) => number;
    readonly wasmdominoresult_lead_trigger_numbers: (a: number, b: number) => void;
    readonly wasmheatkernelresult_diffusion_matrix: (a: number, b: number) => void;
    readonly wasmheatkernelresult_harmonic_centralities: (a: number, b: number) => void;
    readonly wasmheatkernelresult_trace_energy: (a: number) => number;
    readonly wasmpredictionportfolio_prediction_mode: (a: number, b: number) => void;
    readonly wasmpredictionportfolio_scores_flat: (a: number, b: number) => void;
    readonly wasmpredictionportfolio_strategies: (a: number, b: number) => void;
    readonly wasmpredictionportfolio_tickets_flat: (a: number, b: number) => void;
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
