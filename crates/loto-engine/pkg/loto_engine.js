/* @ts-self-types="./loto_engine.d.ts" */

/**
 * Résultat de l'optimisation combinatoire par recuit simulé
 */
export class AnnealingOptimizationResult {
    static __wrap(ptr) {
        const obj = Object.create(AnnealingOptimizationResult.prototype);
        obj.__wbg_ptr = ptr;
        AnnealingOptimizationResultFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        AnnealingOptimizationResultFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_annealingoptimizationresult_free(ptr, 0);
    }
    /**
     * @returns {Int32Array}
     */
    get best_combination() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.annealingoptimizationresult_best_combination(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var v1 = getArrayI32FromWasm0(r0, r1).slice();
            wasm.__wbindgen_export(r0, r1 * 4, 4);
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * @returns {number}
     */
    get best_energy() {
        const ret = wasm.annealingoptimizationresult_best_energy(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get iterations_run() {
        const ret = wasm.annealingoptimizationresult_iterations_run(this.__wbg_ptr);
        return ret >>> 0;
    }
}
if (Symbol.dispose) AnnealingOptimizationResult.prototype[Symbol.dispose] = AnnealingOptimizationResult.prototype.free;

/**
 * Structure de résultat pour l'analyse des cooccurrences inter-tirages
 */
export class CooccurrenceTensorResult {
    static __wrap(ptr) {
        const obj = Object.create(CooccurrenceTensorResult.prototype);
        obj.__wbg_ptr = ptr;
        CooccurrenceTensorResultFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        CooccurrenceTensorResultFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_cooccurrencetensorresult_free(ptr, 0);
    }
    /**
     * @returns {Int32Array}
     */
    get conditioned_pair_hits() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.cooccurrencetensorresult_conditioned_pair_hits(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var v1 = getArrayI32FromWasm0(r0, r1).slice();
            wasm.__wbindgen_export(r0, r1 * 4, 4);
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * @returns {Int32Array}
     */
    get dyad_matrix() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.cooccurrencetensorresult_dyad_matrix(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var v1 = getArrayI32FromWasm0(r0, r1).slice();
            wasm.__wbindgen_export(r0, r1 * 4, 4);
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * @returns {Int32Array}
     */
    get target_pair_hits() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.cooccurrencetensorresult_target_pair_hits(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var v1 = getArrayI32FromWasm0(r0, r1).slice();
            wasm.__wbindgen_export(r0, r1 * 4, 4);
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * @returns {number}
     */
    get total_pairs_evaluated() {
        const ret = wasm.cooccurrencetensorresult_total_pairs_evaluated(this.__wbg_ptr);
        return ret >>> 0;
    }
}
if (Symbol.dispose) CooccurrenceTensorResult.prototype[Symbol.dispose] = CooccurrenceTensorResult.prototype.free;

/**
 * Résultat vectorisé du Noyau de Hawkes Croisé (Cross-Exciting Hawkes Process)
 */
export class CrossHawkesWasmResult {
    static __wrap(ptr) {
        const obj = Object.create(CrossHawkesWasmResult.prototype);
        obj.__wbg_ptr = ptr;
        CrossHawkesWasmResultFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        CrossHawkesWasmResultFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_crosshawkeswasmresult_free(ptr, 0);
    }
    /**
     * @returns {Float64Array}
     */
    get intensities() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.crosshawkeswasmresult_intensities(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var v1 = getArrayF64FromWasm0(r0, r1).slice();
            wasm.__wbindgen_export(r0, r1 * 8, 8);
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * @returns {Float64Array}
     */
    get lag_excitations() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.crosshawkeswasmresult_lag_excitations(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var v1 = getArrayF64FromWasm0(r0, r1).slice();
            wasm.__wbindgen_export(r0, r1 * 8, 8);
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * @returns {Float64Array}
     */
    get net_excitations() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.crosshawkeswasmresult_net_excitations(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var v1 = getArrayF64FromWasm0(r0, r1).slice();
            wasm.__wbindgen_export(r0, r1 * 8, 8);
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * @returns {number}
     */
    get total_energy() {
        const ret = wasm.crosshawkeswasmresult_total_energy(this.__wbg_ptr);
        return ret;
    }
}
if (Symbol.dispose) CrossHawkesWasmResult.prototype[Symbol.dispose] = CrossHawkesWasmResult.prototype.free;

/**
 * Analyse spectrale FFT 100% déterministe et vectorisée.
 * Évalue la densité spectrale de puissance (PSD) et identifie la fréquence et période dominante.
 */
export class SpectralAnalysisResult {
    static __wrap(ptr) {
        const obj = Object.create(SpectralAnalysisResult.prototype);
        obj.__wbg_ptr = ptr;
        SpectralAnalysisResultFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        SpectralAnalysisResultFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_spectralanalysisresult_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get dominant_frequency() {
        const ret = wasm.spectralanalysisresult_dominant_frequency(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get dominant_period() {
        const ret = wasm.spectralanalysisresult_dominant_period(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get energy() {
        const ret = wasm.spectralanalysisresult_energy(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {Float64Array}
     */
    get psd() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.spectralanalysisresult_psd(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var v1 = getArrayF64FromWasm0(r0, r1).slice();
            wasm.__wbindgen_export(r0, r1 * 8, 8);
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
}
if (Symbol.dispose) SpectralAnalysisResult.prototype[Symbol.dispose] = SpectralAnalysisResult.prototype.free;

/**
 * Résultat de l'analyse topologique et chaotique
 */
export class TopologicalLyapunovResult {
    static __wrap(ptr) {
        const obj = Object.create(TopologicalLyapunovResult.prototype);
        obj.__wbg_ptr = ptr;
        TopologicalLyapunovResultFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        TopologicalLyapunovResultFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_topologicallyapunovresult_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get divergence_force() {
        const ret = wasm.topologicallyapunovresult_divergence_force(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {boolean}
     */
    get is_chaotic() {
        const ret = wasm.topologicallyapunovresult_is_chaotic(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @returns {number}
     */
    get lyapunov_exponent() {
        const ret = wasm.topologicallyapunovresult_lyapunov_exponent(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get topological_entropy() {
        const ret = wasm.topologicallyapunovresult_topological_entropy(this.__wbg_ptr);
        return ret;
    }
}
if (Symbol.dispose) TopologicalLyapunovResult.prototype[Symbol.dispose] = TopologicalLyapunovResult.prototype.free;

/**
 * Analyse spectrale complète d'un signal temporel (0/1 ou centré).
 * Conforme à la règle Zéro Nombre Magique : les périodes sont dérivées de la résolution spectrale continue.
 * @param {Float64Array} signal
 * @returns {SpectralAnalysisResult}
 */
export function analyze_signal_spectrum(signal) {
    const ptr0 = passArrayF64ToWasm0(signal, wasm.__wbindgen_export2);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.analyze_signal_spectrum(ptr0, len0);
    return SpectralAnalysisResult.__wrap(ret);
}

/**
 * Analyse fractale par lot sur l'ensemble des 90 numéros d'un historique.
 * `history_matrix` est aplati : `num_draws x 5` entiers contenant les numéros gagnants.
 * Retourne un vecteur de 90 éléments contenant les exposants de Hurst respectifs.
 * @param {Int32Array} history_draws
 * @param {number} num_draws
 * @param {number} win_cols
 * @returns {Float64Array}
 */
export function batch_fractal_hurst_analysis(history_draws, num_draws, win_cols) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passArray32ToWasm0(history_draws, wasm.__wbindgen_export2);
        const len0 = WASM_VECTOR_LEN;
        wasm.batch_fractal_hurst_analysis(retptr, ptr0, len0, num_draws, win_cols);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        var v2 = getArrayF64FromWasm0(r0, r1).slice();
        wasm.__wbindgen_export(r0, r1 * 8, 8);
        return v2;
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
}

/**
 * Analyse tensorielle haute performance des cooccurrences inter-tirages en WebAssembly
 *
 * Calcule en mémoire continue contiguë :
 * - La matrice complète des dyades (91 x 91)
 * - Le dénombrement inconditionnel des 4005 paires cibles
 * - Le dénombrement conditionné par la présence des numéros actifs du tirage prédécesseur
 * @param {Int32Array} pred_draws_flat
 * @param {Int32Array} target_draws_flat
 * @param {number} num_draws
 * @param {number} win_cols
 * @param {Int32Array} active_pred_numbers
 * @returns {CooccurrenceTensorResult}
 */
export function compute_cooccurrence_tensor_wasm(pred_draws_flat, target_draws_flat, num_draws, win_cols, active_pred_numbers) {
    const ptr0 = passArray32ToWasm0(pred_draws_flat, wasm.__wbindgen_export2);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArray32ToWasm0(target_draws_flat, wasm.__wbindgen_export2);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passArray32ToWasm0(active_pred_numbers, wasm.__wbindgen_export2);
    const len2 = WASM_VECTOR_LEN;
    const ret = wasm.compute_cooccurrence_tensor_wasm(ptr0, len0, ptr1, len1, num_draws, win_cols, ptr2, len2);
    return CooccurrenceTensorResult.__wrap(ret);
}

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
 * @param {Int32Array} pred_occurrences
 * @param {number} lag_count
 * @param {number} win_cols
 * @param {Float64Array} target_baseline
 * @param {Float64Array} coupling_matrix
 * @param {number} beta_decay
 * @returns {CrossHawkesWasmResult}
 */
export function compute_cross_hawkes_kernel(pred_occurrences, lag_count, win_cols, target_baseline, coupling_matrix, beta_decay) {
    const ptr0 = passArray32ToWasm0(pred_occurrences, wasm.__wbindgen_export2);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArrayF64ToWasm0(target_baseline, wasm.__wbindgen_export2);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passArrayF64ToWasm0(coupling_matrix, wasm.__wbindgen_export2);
    const len2 = WASM_VECTOR_LEN;
    const ret = wasm.compute_cross_hawkes_kernel(ptr0, len0, lag_count, win_cols, ptr1, len1, ptr2, len2, beta_decay);
    return CrossHawkesWasmResult.__wrap(ret);
}

/**
 * Calcule la Transformée de Fourier Rapide (FFT) via `rustfft` sur une tranche de signal `&[f64]`.
 * Applique un fenêtrage de Hann continu C^∞ pour éliminer les discontinuités spectrales de bord.
 * @param {Float64Array} signal
 * @returns {Float64Array}
 */
export function compute_fft_power_spectrum(signal) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passArrayF64ToWasm0(signal, wasm.__wbindgen_export2);
        const len0 = WASM_VECTOR_LEN;
        wasm.compute_fft_power_spectrum(retptr, ptr0, len0);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        var v2 = getArrayF64FromWasm0(r0, r1).slice();
        wasm.__wbindgen_export(r0, r1 * 8, 8);
        return v2;
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
}

/**
 * Calcule la matrice de transition stochastique de Markov (90 x 90)
 * à partir d'une tranche d'historique aplatie (num_draws x win_cols).
 *
 * 100% Déterministe et sans allocation dans la boucle critique.
 * @param {Int32Array} history_draws
 * @param {number} num_draws
 * @param {number} win_cols
 * @param {number} num_states
 * @returns {Float64Array}
 */
export function compute_markov_transition_matrix_wasm(history_draws, num_draws, win_cols, num_states) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passArray32ToWasm0(history_draws, wasm.__wbindgen_export2);
        const len0 = WASM_VECTOR_LEN;
        wasm.compute_markov_transition_matrix_wasm(retptr, ptr0, len0, num_draws, win_cols, num_states);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        var v2 = getArrayF64FromWasm0(r0, r1).slice();
        wasm.__wbindgen_export(r0, r1 * 8, 8);
        return v2;
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
}

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
 * @param {Float64Array} signal
 * @returns {number}
 */
export function compute_robust_hurst_wasm(signal) {
    const ptr0 = passArrayF64ToWasm0(signal, wasm.__wbindgen_export2);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.compute_robust_hurst_wasm(ptr0, len0);
    return ret;
}

/**
 * Calcule l'Exposant de Lyapunov $\lambda$ et la dynamique topologique continue
 * sur une séquence d'historique aplatie (num_draws x win_cols).
 *
 * $\lambda = \frac{1}{K} \sum_{k=0}^{K-1} \ln(D_{topologique}(t_k, t_{k+1}) + 1e-4)$
 *
 * Permet d'adapter dynamiquement les coefficients d'apprentissage et de pénalité :
 * - $\lambda > 0$ : Régime chaotique / divergent
 * - $\lambda \le 0$ : Régime d'attracteur régulier / convergent
 * @param {Int32Array} history_draws
 * @param {number} num_draws
 * @param {number} win_cols
 * @param {number} horizon_limit
 * @returns {TopologicalLyapunovResult}
 */
export function compute_topological_lyapunov_wasm(history_draws, num_draws, win_cols, horizon_limit) {
    const ptr0 = passArray32ToWasm0(history_draws, wasm.__wbindgen_export2);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.compute_topological_lyapunov_wasm(ptr0, len0, num_draws, win_cols, horizon_limit);
    return TopologicalLyapunovResult.__wrap(ret);
}

/**
 * Produit scalaire de deux vecteurs vectorisé (SIMD / auto-vectorisation LLVM)
 * @param {Float64Array} a
 * @param {Float64Array} b
 * @returns {number}
 */
export function dot_product_f64(a, b) {
    const ptr0 = passArrayF64ToWasm0(a, wasm.__wbindgen_export2);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArrayF64ToWasm0(b, wasm.__wbindgen_export2);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.dot_product_f64(ptr0, len0, ptr1, len1);
    return ret;
}

/**
 * Point d'entrée d'initialisation du module WebAssembly
 */
export function init_engine() {
    wasm.init_engine();
}

/**
 * Évalue les probabilités d'état futur par projection Markovienne d'ordre 1
 * sur le dernier tirage gagnant `last_draw_numbers` (5 entiers).
 * @param {Float64Array} transition_matrix
 * @param {Int32Array} last_draw
 * @param {number} num_states
 * @returns {Float64Array}
 */
export function project_markov_next_state(transition_matrix, last_draw, num_states) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passArrayF64ToWasm0(transition_matrix, wasm.__wbindgen_export2);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArray32ToWasm0(last_draw, wasm.__wbindgen_export2);
        const len1 = WASM_VECTOR_LEN;
        wasm.project_markov_next_state(retptr, ptr0, len0, ptr1, len1, num_states);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        var v3 = getArrayF64FromWasm0(r0, r1).slice();
        wasm.__wbindgen_export(r0, r1 * 8, 8);
        return v3;
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
}

/**
 * Optimisation Combinatoire par Recuit Simulé (Simulated Annealing) Haute Performance
 *
 * Explore l'espace d'états discret des combinaisons de 5 numéros parmi le pool de candidats
 * avec un calendrier de refroidissement continu Boltzmann : T_{k+1} = T_k * alpha.
 *
 * 100% Déterministe via seed LCG canonique, garantit zéro allocation dans la boucle critique.
 * @param {Int32Array} candidate_pool
 * @param {Float64Array} scores_91
 * @param {Float64Array} affinity_matrix
 * @param {number} initial_temperature
 * @param {number} cooling_rate
 * @param {number} min_temperature
 * @param {number} iterations_per_temp
 * @param {bigint} deterministic_seed
 * @returns {AnnealingOptimizationResult}
 */
export function solve_combinatorial_annealing_wasm(candidate_pool, scores_91, affinity_matrix, initial_temperature, cooling_rate, min_temperature, iterations_per_temp, deterministic_seed) {
    const ptr0 = passArray32ToWasm0(candidate_pool, wasm.__wbindgen_export2);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArrayF64ToWasm0(scores_91, wasm.__wbindgen_export2);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passArrayF64ToWasm0(affinity_matrix, wasm.__wbindgen_export2);
    const len2 = WASM_VECTOR_LEN;
    const ret = wasm.solve_combinatorial_annealing_wasm(ptr0, len0, ptr1, len1, ptr2, len2, initial_temperature, cooling_rate, min_temperature, iterations_per_temp, deterministic_seed);
    return AnnealingOptimizationResult.__wrap(ret);
}

/**
 * Scoring tensoriel rapide des 90 numéros : Matrix (90 x F) * Weights (F x 1)
 * @param {Float64Array} features_flat
 * @param {Float64Array} weights
 * @param {number} num_numbers
 * @param {number} num_features
 * @returns {Float64Array}
 */
export function tensor_score_wasm(features_flat, weights, num_numbers, num_features) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passArrayF64ToWasm0(features_flat, wasm.__wbindgen_export2);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArrayF64ToWasm0(weights, wasm.__wbindgen_export2);
        const len1 = WASM_VECTOR_LEN;
        wasm.tensor_score_wasm(retptr, ptr0, len0, ptr1, len1, num_numbers, num_features);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        var v3 = getArrayF64FromWasm0(r0, r1).slice();
        wasm.__wbindgen_export(r0, r1 * 8, 8);
        return v3;
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
}
function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg___wbindgen_throw_5d9e815e6fdf150f: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbg_error_757e9472f8410341: function(arg0, arg1) {
            let deferred0_0;
            let deferred0_1;
            try {
                deferred0_0 = arg0;
                deferred0_1 = arg1;
                console.error(getStringFromWasm0(arg0, arg1));
            } finally {
                wasm.__wbindgen_export(deferred0_0, deferred0_1, 1);
            }
        },
        __wbg_log_363d83b9114c8831: function(arg0) {
            console.log(getObject(arg0));
        },
        __wbg_new_227d7c05414eb861: function() {
            const ret = new Error();
            return addHeapObject(ret);
        },
        __wbg_stack_3b0d974bbf31e44f: function(arg0, arg1) {
            const ret = getObject(arg1).stack;
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export2, wasm.__wbindgen_export3);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbindgen_generic_0000000000000001: function(arg0, arg1) {
            // Cast intrinsic for `Ref(String) -> Externref`.
            const ret = getStringFromWasm0(arg0, arg1);
            return addHeapObject(ret);
        },
        __wbindgen_object_drop_ref: function(arg0) {
            takeObject(arg0);
        },
    };
    return {
        __proto__: null,
        "./loto_engine_bg.js": import0,
    };
}

const AnnealingOptimizationResultFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_annealingoptimizationresult_free(ptr, 1));
const CooccurrenceTensorResultFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_cooccurrencetensorresult_free(ptr, 1));
const CrossHawkesWasmResultFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_crosshawkeswasmresult_free(ptr, 1));
const SpectralAnalysisResultFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_spectralanalysisresult_free(ptr, 1));
const TopologicalLyapunovResultFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_topologicallyapunovresult_free(ptr, 1));

function addHeapObject(obj) {
    if (heap_next === heap.length) heap.push(heap.length + 1);
    const idx = heap_next;
    heap_next = heap[idx];

    heap[idx] = obj;
    return idx;
}

function dropObject(idx) {
    if (idx < 1028) return;
    heap[idx] = heap_next;
    heap_next = idx;
}

function getArrayF64FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getFloat64ArrayMemory0().subarray(ptr / 8, ptr / 8 + len);
}

function getArrayI32FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getInt32ArrayMemory0().subarray(ptr / 4, ptr / 4 + len);
}

let cachedDataViewMemory0 = null;
function getDataViewMemory0() {
    if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || (cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasm.memory.buffer)) {
        cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
    }
    return cachedDataViewMemory0;
}

let cachedFloat64ArrayMemory0 = null;
function getFloat64ArrayMemory0() {
    if (cachedFloat64ArrayMemory0 === null || cachedFloat64ArrayMemory0.byteLength === 0) {
        cachedFloat64ArrayMemory0 = new Float64Array(wasm.memory.buffer);
    }
    return cachedFloat64ArrayMemory0;
}

let cachedInt32ArrayMemory0 = null;
function getInt32ArrayMemory0() {
    if (cachedInt32ArrayMemory0 === null || cachedInt32ArrayMemory0.byteLength === 0) {
        cachedInt32ArrayMemory0 = new Int32Array(wasm.memory.buffer);
    }
    return cachedInt32ArrayMemory0;
}

function getStringFromWasm0(ptr, len) {
    return decodeText(ptr >>> 0, len);
}

let cachedUint32ArrayMemory0 = null;
function getUint32ArrayMemory0() {
    if (cachedUint32ArrayMemory0 === null || cachedUint32ArrayMemory0.byteLength === 0) {
        cachedUint32ArrayMemory0 = new Uint32Array(wasm.memory.buffer);
    }
    return cachedUint32ArrayMemory0;
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function getObject(idx) { return heap[idx]; }

let heap = new Array(1024).fill(undefined);
heap.push(undefined, null, true, false);

let heap_next = heap.length;

function passArray32ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 4, 4) >>> 0;
    getUint32ArrayMemory0().set(arg, ptr / 4);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passArrayF64ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 8, 8) >>> 0;
    getFloat64ArrayMemory0().set(arg, ptr / 8);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

function takeObject(idx) {
    const ret = getObject(idx);
    dropObject(idx);
    return ret;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    };
}

let WASM_VECTOR_LEN = 0;

let wasmModule, wasmInstance, wasm;
function __wbg_finalize_init(instance, module) {
    wasmInstance = instance;
    wasm = instance.exports;
    wasmModule = module;
    cachedDataViewMemory0 = null;
    cachedFloat64ArrayMemory0 = null;
    cachedInt32ArrayMemory0 = null;
    cachedUint32ArrayMemory0 = null;
    cachedUint8ArrayMemory0 = null;
    wasm.__wbindgen_start();
    return wasm;
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (!module.ok) {
            throw new Error(`failed to fetch Wasm: ${module.status} ${module.statusText} fetching '${module.url}'`);
        }

        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = expectedResponseType(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else { throw e; }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }

    function expectedResponseType(type) {
        switch (type) {
            case 'basic': case 'cors': case 'default': return true;
        }
        return false;
    }
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (module !== undefined) {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (module_or_path !== undefined) {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (module_or_path === undefined) {
        module_or_path = new URL('loto_engine_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
