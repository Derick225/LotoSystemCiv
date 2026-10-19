/* @ts-self-types="./loto_engine.d.ts" */

export class AcoResultHpc {
    static __wrap(ptr) {
        const obj = Object.create(AcoResultHpc.prototype);
        obj.__wbg_ptr = ptr;
        AcoResultHpcFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        AcoResultHpcFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_acoresulthpc_free(ptr, 0);
    }
    /**
     * @returns {Int32Array}
     */
    get best_numbers() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.acoresulthpc_best_numbers(retptr, this.__wbg_ptr);
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
    get best_score() {
        const ret = wasm.__wbg_get_acoresulthpc_best_score(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get confidence() {
        const ret = wasm.__wbg_get_acoresulthpc_confidence(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get generations_run() {
        const ret = wasm.__wbg_get_acoresulthpc_generations_run(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    get pheromone_density() {
        const ret = wasm.__wbg_get_acoresulthpc_pheromone_density(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {number} arg0
     */
    set best_score(arg0) {
        wasm.__wbg_set_acoresulthpc_best_score(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set confidence(arg0) {
        wasm.__wbg_set_acoresulthpc_confidence(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set generations_run(arg0) {
        wasm.__wbg_set_acoresulthpc_generations_run(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set pheromone_density(arg0) {
        wasm.__wbg_set_acoresulthpc_pheromone_density(this.__wbg_ptr, arg0);
    }
}
if (Symbol.dispose) AcoResultHpc.prototype[Symbol.dispose] = AcoResultHpc.prototype.free;

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
 * @enum {0 | 1 | 2 | 3}
 */
export const BettingStrategyWasm = Object.freeze({
    Flat: 0, "0": "Flat",
    Martingale: 1, "1": "Martingale",
    Kelly: 2, "2": "Kelly",
    ConfidenceSmart: 3, "3": "ConfidenceSmart",
});

export class ClosedLoopAutopsyResultHpc {
    static __wrap(ptr) {
        const obj = Object.create(ClosedLoopAutopsyResultHpc.prototype);
        obj.__wbg_ptr = ptr;
        ClosedLoopAutopsyResultHpcFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        ClosedLoopAutopsyResultHpcFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_closedloopautopsyresulthpc_free(ptr, 0);
    }
    /**
     * @returns {Float64Array}
     */
    get updated_weights() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.closedloopautopsyresulthpc_updated_weights(retptr, this.__wbg_ptr);
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
    get brier_score() {
        const ret = wasm.__wbg_get_closedloopautopsyresulthpc_brier_score(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get divergence_metric() {
        const ret = wasm.__wbg_get_closedloopautopsyresulthpc_divergence_metric(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get exact_hits() {
        const ret = wasm.__wbg_get_closedloopautopsyresulthpc_exact_hits(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    get near_misses() {
        const ret = wasm.__wbg_get_closedloopautopsyresulthpc_near_misses(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    get rmse() {
        const ret = wasm.__wbg_get_closedloopautopsyresulthpc_rmse(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get wasserstein_distance() {
        const ret = wasm.__wbg_get_closedloopautopsyresulthpc_wasserstein_distance(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {number} arg0
     */
    set brier_score(arg0) {
        wasm.__wbg_set_closedloopautopsyresulthpc_brier_score(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set divergence_metric(arg0) {
        wasm.__wbg_set_closedloopautopsyresulthpc_divergence_metric(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set exact_hits(arg0) {
        wasm.__wbg_set_closedloopautopsyresulthpc_exact_hits(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set near_misses(arg0) {
        wasm.__wbg_set_closedloopautopsyresulthpc_near_misses(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set rmse(arg0) {
        wasm.__wbg_set_closedloopautopsyresulthpc_rmse(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set wasserstein_distance(arg0) {
        wasm.__wbg_set_closedloopautopsyresulthpc_wasserstein_distance(this.__wbg_ptr, arg0);
    }
}
if (Symbol.dispose) ClosedLoopAutopsyResultHpc.prototype[Symbol.dispose] = ClosedLoopAutopsyResultHpc.prototype.free;

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

export class CyclicBatchReportHpc {
    static __wrap(ptr) {
        const obj = Object.create(CyclicBatchReportHpc.prototype);
        obj.__wbg_ptr = ptr;
        CyclicBatchReportHpcFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        CyclicBatchReportHpcFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_cyclicbatchreporthpc_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get count() {
        const ret = wasm.cyclicbatchreporthpc_count(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @param {number} idx
     * @returns {number}
     */
    get_ball(idx) {
        const ret = wasm.cyclicbatchreporthpc_get_ball(this.__wbg_ptr, idx);
        return ret;
    }
    /**
     * @param {number} idx
     * @returns {number}
     */
    get_hazard_rate(idx) {
        const ret = wasm.cyclicbatchreporthpc_get_hazard_rate(this.__wbg_ptr, idx);
        return ret;
    }
    /**
     * @param {number} idx
     * @returns {number}
     */
    get_phase_angle(idx) {
        const ret = wasm.cyclicbatchreporthpc_get_phase_angle(this.__wbg_ptr, idx);
        return ret;
    }
    /**
     * @param {number} idx
     * @returns {number}
     */
    get_phase_resonance(idx) {
        const ret = wasm.cyclicbatchreporthpc_get_phase_resonance(this.__wbg_ptr, idx);
        return ret;
    }
    /**
     * @param {number} idx
     * @returns {number}
     */
    get_quality_factor(idx) {
        const ret = wasm.cyclicbatchreporthpc_get_quality_factor(this.__wbg_ptr, idx);
        return ret;
    }
    /**
     * @param {number} idx
     * @returns {number}
     */
    get_score(idx) {
        const ret = wasm.cyclicbatchreporthpc_get_score(this.__wbg_ptr, idx);
        return ret;
    }
}
if (Symbol.dispose) CyclicBatchReportHpc.prototype[Symbol.dispose] = CyclicBatchReportHpc.prototype.free;

export class CyclicCandidateHpc {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        CyclicCandidateHpcFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_cycliccandidatehpc_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get ball() {
        const ret = wasm.__wbg_get_cycliccandidatehpc_ball(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get hazard_rate() {
        const ret = wasm.__wbg_get_cycliccandidatehpc_hazard_rate(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get phase_angle_deg() {
        const ret = wasm.__wbg_get_cycliccandidatehpc_phase_angle_deg(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get phase_resonance() {
        const ret = wasm.__wbg_get_cycliccandidatehpc_phase_resonance(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get quality_factor() {
        const ret = wasm.__wbg_get_cycliccandidatehpc_quality_factor(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get score() {
        const ret = wasm.__wbg_get_cycliccandidatehpc_score(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {number} arg0
     */
    set ball(arg0) {
        wasm.__wbg_set_cycliccandidatehpc_ball(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set hazard_rate(arg0) {
        wasm.__wbg_set_cycliccandidatehpc_hazard_rate(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set phase_angle_deg(arg0) {
        wasm.__wbg_set_cycliccandidatehpc_phase_angle_deg(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set phase_resonance(arg0) {
        wasm.__wbg_set_cycliccandidatehpc_phase_resonance(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set quality_factor(arg0) {
        wasm.__wbg_set_cycliccandidatehpc_quality_factor(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set score(arg0) {
        wasm.__wbg_set_cycliccandidatehpc_score(this.__wbg_ptr, arg0);
    }
}
if (Symbol.dispose) CyclicCandidateHpc.prototype[Symbol.dispose] = CyclicCandidateHpc.prototype.free;

export class HawkesOutputHpc {
    static __wrap(ptr) {
        const obj = Object.create(HawkesOutputHpc.prototype);
        obj.__wbg_ptr = ptr;
        HawkesOutputHpcFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        HawkesOutputHpcFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_hawkesoutputhpc_free(ptr, 0);
    }
    /**
     * @returns {Float64Array}
     */
    get intensities() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.hawkesoutputhpc_intensities(retptr, this.__wbg_ptr);
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
if (Symbol.dispose) HawkesOutputHpc.prototype[Symbol.dispose] = HawkesOutputHpc.prototype.free;

export class HybridRegimeOptimizationHpc {
    static __wrap(ptr) {
        const obj = Object.create(HybridRegimeOptimizationHpc.prototype);
        obj.__wbg_ptr = ptr;
        HybridRegimeOptimizationHpcFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        HybridRegimeOptimizationHpcFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_hybridregimeoptimizationhpc_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get confidence() {
        const ret = wasm.__wbg_get_hybridregimeoptimizationhpc_confidence(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get stability_index() {
        const ret = wasm.__wbg_get_hybridregimeoptimizationhpc_stability_index(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {Float64Array}
     */
    get optimized_weights() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.hybridregimeoptimizationhpc_optimized_weights(retptr, this.__wbg_ptr);
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
     * @param {number} arg0
     */
    set confidence(arg0) {
        wasm.__wbg_set_hybridregimeoptimizationhpc_confidence(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set stability_index(arg0) {
        wasm.__wbg_set_hybridregimeoptimizationhpc_stability_index(this.__wbg_ptr, arg0);
    }
}
if (Symbol.dispose) HybridRegimeOptimizationHpc.prototype[Symbol.dispose] = HybridRegimeOptimizationHpc.prototype.free;

/**
 * Gestionnaire global du cache in-memory de tous les tirages
 */
export class InMemoryDrawStore {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        InMemoryDrawStoreFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_inmemorydrawstore_free(ptr, 0);
    }
    /**
     * Analyse préalable complète de l'historique d'un tirage (Entropie, Hurst, FFT, Régime)
     * @param {string} draw_name
     * @returns {PriorAnalysisReport}
     */
    analyze_draw(draw_name) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passStringToWasm0(draw_name, wasm.__wbindgen_export2, wasm.__wbindgen_export3);
            const len0 = WASM_VECTOR_LEN;
            wasm.inmemorydrawstore_analyze_draw(retptr, this.__wbg_ptr, ptr0, len0);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return PriorAnalysisReport.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Insère un nouveau tirage de façon idempotente (Delta Sync unitaire)
     * @param {string} draw_name
     * @param {bigint} timestamp
     * @param {Uint8Array} winners
     * @param {Uint8Array} machine
     * @returns {boolean}
     */
    append_single_draw(draw_name, timestamp, winners, machine) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passStringToWasm0(draw_name, wasm.__wbindgen_export2, wasm.__wbindgen_export3);
            const len0 = WASM_VECTOR_LEN;
            const ptr1 = passArray8ToWasm0(winners, wasm.__wbindgen_export2);
            const len1 = WASM_VECTOR_LEN;
            const ptr2 = passArray8ToWasm0(machine, wasm.__wbindgen_export2);
            const len2 = WASM_VECTOR_LEN;
            wasm.inmemorydrawstore_append_single_draw(retptr, this.__wbg_ptr, ptr0, len0, timestamp, ptr1, len1, ptr2, len2);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return r0 !== 0;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Amorce (Bootstrap) le cache depuis un payload JSON compact reçu de Supabase
     * Trie chronologiquement et dédoublonne strictement chaque tirage.
     * @param {string} json_payload
     * @returns {number}
     */
    bootstrap_json(json_payload) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passStringToWasm0(json_payload, wasm.__wbindgen_export2, wasm.__wbindgen_export3);
            const len0 = WASM_VECTOR_LEN;
            wasm.inmemorydrawstore_bootstrap_json(retptr, this.__wbg_ptr, ptr0, len0);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return r0 >>> 0;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Réinitialise complètement un tirage puis recharge en bloc avec tri chronologique et dédoublonnage.
     * API explicite clear + bulk_load pour synchronisation robuste sans cumul.
     * @param {string} json_payload
     * @param {string} draw_name
     * @returns {number}
     */
    clear_and_reload(json_payload, draw_name) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passStringToWasm0(json_payload, wasm.__wbindgen_export2, wasm.__wbindgen_export3);
            const len0 = WASM_VECTOR_LEN;
            const ptr1 = passStringToWasm0(draw_name, wasm.__wbindgen_export2, wasm.__wbindgen_export3);
            const len1 = WASM_VECTOR_LEN;
            wasm.inmemorydrawstore_clear_and_reload(retptr, this.__wbg_ptr, ptr0, len0, ptr1, len1);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return r0 >>> 0;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Réinitialise l'historique d'un tirage spécifique
     * @param {string} draw_name
     */
    clear_draw(draw_name) {
        const ptr0 = passStringToWasm0(draw_name, wasm.__wbindgen_export2, wasm.__wbindgen_export3);
        const len0 = WASM_VECTOR_LEN;
        wasm.inmemorydrawstore_clear_draw(this.__wbg_ptr, ptr0, len0);
    }
    /**
     * Calcule le couplage continu d'interconnexion entre deux tirages du store
     * Zéro coupure binaire, poids continu dans ]0.0, 1.0[ selon AGENTS.md
     * @param {string} draw_a
     * @param {string} draw_b
     * @returns {number}
     */
    compute_interdraw_coupling(draw_a, draw_b) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passStringToWasm0(draw_a, wasm.__wbindgen_export2, wasm.__wbindgen_export3);
            const len0 = WASM_VECTOR_LEN;
            const ptr1 = passStringToWasm0(draw_b, wasm.__wbindgen_export2, wasm.__wbindgen_export3);
            const len1 = WASM_VECTOR_LEN;
            wasm.inmemorydrawstore_compute_interdraw_coupling(retptr, this.__wbg_ptr, ptr0, len0, ptr1, len1);
            var r0 = getDataViewMemory0().getFloat64(retptr + 8 * 0, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            var r3 = getDataViewMemory0().getInt32(retptr + 4 * 3, true);
            if (r3) {
                throw takeObject(r2);
            }
            return r0;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Calcule la propagation d'advection domino pour un tirage cible
     * en exploitant les tirages récents du même réseau
     * @param {string} draw_name
     * @param {number} damping_gamma
     * @returns {WasmDominoResult}
     */
    compute_network_domino_wasm(draw_name, damping_gamma) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passStringToWasm0(draw_name, wasm.__wbindgen_export2, wasm.__wbindgen_export3);
            const len0 = WASM_VECTOR_LEN;
            wasm.inmemorydrawstore_compute_network_domino_wasm(retptr, this.__wbg_ptr, ptr0, len0, damping_gamma);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return WasmDominoResult.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Évalue la calibration empirique out-of-fold et la performance Walk-Forward
     * @param {string} draw_name
     * @param {number} window_size
     * @returns {WalkForwardReport}
     */
    compute_walk_forward_calibration(draw_name, window_size) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passStringToWasm0(draw_name, wasm.__wbindgen_export2, wasm.__wbindgen_export3);
            const len0 = WASM_VECTOR_LEN;
            wasm.inmemorydrawstore_compute_walk_forward_calibration(retptr, this.__wbg_ptr, ptr0, len0, window_size);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return WalkForwardReport.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Génère un portefeuille de tickets diversifiés (100% calculé en RAM Wasm locale, zéro réseau)
     * @param {string} draw_name
     * @param {number} num_tickets
     * @returns {WasmPredictionPortfolio}
     */
    generate_portfolio(draw_name, num_tickets) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passStringToWasm0(draw_name, wasm.__wbindgen_export2, wasm.__wbindgen_export3);
            const len0 = WASM_VECTOR_LEN;
            wasm.inmemorydrawstore_generate_portfolio(retptr, this.__wbg_ptr, ptr0, len0, num_tickets);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var r2 = getDataViewMemory0().getInt32(retptr + 4 * 2, true);
            if (r2) {
                throw takeObject(r1);
            }
            return WasmPredictionPortfolio.__wrap(r0);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Retourne les écarts actuels [1..90] directement depuis la RAM locale en O(1)
     * @param {string} draw_name
     * @returns {Uint32Array}
     */
    get_current_gaps(draw_name) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passStringToWasm0(draw_name, wasm.__wbindgen_export2, wasm.__wbindgen_export3);
            const len0 = WASM_VECTOR_LEN;
            wasm.inmemorydrawstore_get_current_gaps(retptr, this.__wbg_ptr, ptr0, len0);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var v2 = getArrayU32FromWasm0(r0, r1).slice();
            wasm.__wbindgen_export(r0, r1 * 4, 4);
            return v2;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Récupère la taille de l'historique en RAM pour un tirage donné
     * @param {string} draw_name
     * @returns {number}
     */
    get_draw_count(draw_name) {
        const ptr0 = passStringToWasm0(draw_name, wasm.__wbindgen_export2, wasm.__wbindgen_export3);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.inmemorydrawstore_get_draw_count(this.__wbg_ptr, ptr0, len0);
        return ret >>> 0;
    }
    /**
     * Retourne les fréquences [1..90] directement depuis la RAM locale en O(1)
     * @param {string} draw_name
     * @returns {Uint32Array}
     */
    get_frequencies(draw_name) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passStringToWasm0(draw_name, wasm.__wbindgen_export2, wasm.__wbindgen_export3);
            const len0 = WASM_VECTOR_LEN;
            wasm.inmemorydrawstore_get_frequencies(retptr, this.__wbg_ptr, ptr0, len0);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var v2 = getArrayU32FromWasm0(r0, r1).slice();
            wasm.__wbindgen_export(r0, r1 * 4, 4);
            return v2;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * Retourne l'identifiant du réseau ("hebdomadaire" ou "quotidien")
     * @param {string} draw_name
     * @returns {string}
     */
    get_network_id(draw_name) {
        let deferred2_0;
        let deferred2_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            const ptr0 = passStringToWasm0(draw_name, wasm.__wbindgen_export2, wasm.__wbindgen_export3);
            const len0 = WASM_VECTOR_LEN;
            wasm.inmemorydrawstore_get_network_id(retptr, this.__wbg_ptr, ptr0, len0);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            deferred2_0 = r0;
            deferred2_1 = r1;
            return getStringFromWasm0(r0, r1);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_export(deferred2_0, deferred2_1, 1);
        }
    }
    constructor() {
        const ret = wasm.inmemorydrawstore_new();
        this.__wbg_ptr = ret;
        InMemoryDrawStoreFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Reconstruit les index de dédoublonnage de toutes les timelines.
     * À appeler après toute désérialisation pour restaurer l'invariant `seen_draws`.
     */
    rebuild_all_seen_indexes() {
        wasm.inmemorydrawstore_rebuild_all_seen_indexes(this.__wbg_ptr);
    }
}
if (Symbol.dispose) InMemoryDrawStore.prototype[Symbol.dispose] = InMemoryDrawStore.prototype.free;

export class MonteCarloBallStat {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        MonteCarloBallStatFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_montecarloballstat_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get ball() {
        const ret = wasm.__wbg_get_montecarloballstat_ball(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get mean_score() {
        const ret = wasm.__wbg_get_montecarloballstat_mean_score(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get p5() {
        const ret = wasm.__wbg_get_montecarloballstat_p5(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get p95() {
        const ret = wasm.__wbg_get_montecarloballstat_p95(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get stability_index() {
        const ret = wasm.__wbg_get_montecarloballstat_stability_index(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get std_dev() {
        const ret = wasm.__wbg_get_montecarloballstat_std_dev(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {number} arg0
     */
    set ball(arg0) {
        wasm.__wbg_set_montecarloballstat_ball(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set mean_score(arg0) {
        wasm.__wbg_set_montecarloballstat_mean_score(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set p5(arg0) {
        wasm.__wbg_set_montecarloballstat_p5(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set p95(arg0) {
        wasm.__wbg_set_montecarloballstat_p95(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set stability_index(arg0) {
        wasm.__wbg_set_montecarloballstat_stability_index(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set std_dev(arg0) {
        wasm.__wbg_set_montecarloballstat_std_dev(this.__wbg_ptr, arg0);
    }
}
if (Symbol.dispose) MonteCarloBallStat.prototype[Symbol.dispose] = MonteCarloBallStat.prototype.free;

export class MonteCarloReportHpc {
    static __wrap(ptr) {
        const obj = Object.create(MonteCarloReportHpc.prototype);
        obj.__wbg_ptr = ptr;
        MonteCarloReportHpcFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        MonteCarloReportHpcFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_montecarloreporthpc_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get count() {
        const ret = wasm.montecarloreporthpc_count(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @param {number} idx
     * @returns {number}
     */
    get_ball(idx) {
        const ret = wasm.montecarloreporthpc_get_ball(this.__wbg_ptr, idx);
        return ret;
    }
    /**
     * @param {number} idx
     * @returns {number}
     */
    get_mean(idx) {
        const ret = wasm.montecarloreporthpc_get_mean(this.__wbg_ptr, idx);
        return ret;
    }
    /**
     * @param {number} idx
     * @returns {number}
     */
    get_p5(idx) {
        const ret = wasm.montecarloreporthpc_get_p5(this.__wbg_ptr, idx);
        return ret;
    }
    /**
     * @param {number} idx
     * @returns {number}
     */
    get_p95(idx) {
        const ret = wasm.montecarloreporthpc_get_p95(this.__wbg_ptr, idx);
        return ret;
    }
    /**
     * @param {number} idx
     * @returns {number}
     */
    get_stability_index(idx) {
        const ret = wasm.montecarloreporthpc_get_stability_index(this.__wbg_ptr, idx);
        return ret;
    }
    /**
     * @param {number} idx
     * @returns {number}
     */
    get_std_dev(idx) {
        const ret = wasm.montecarloreporthpc_get_std_dev(this.__wbg_ptr, idx);
        return ret;
    }
}
if (Symbol.dispose) MonteCarloReportHpc.prototype[Symbol.dispose] = MonteCarloReportHpc.prototype.free;

export class NativePredictionResult {
    static __wrap(ptr) {
        const obj = Object.create(NativePredictionResult.prototype);
        obj.__wbg_ptr = ptr;
        NativePredictionResultFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        NativePredictionResultFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_nativepredictionresult_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get confidence_score() {
        const ret = wasm.__wbg_get_nativepredictionresult_confidence_score(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get hurst_exponent() {
        const ret = wasm.__wbg_get_nativepredictionresult_hurst_exponent(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get shannon_entropy() {
        const ret = wasm.__wbg_get_nativepredictionresult_shannon_entropy(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {Float64Array}
     */
    get scores() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.nativepredictionresult_scores(retptr, this.__wbg_ptr);
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
     * @returns {Uint8Array}
     */
    get top_10() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.nativepredictionresult_top_10(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var v1 = getArrayU8FromWasm0(r0, r1).slice();
            wasm.__wbindgen_export(r0, r1 * 1, 1);
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * @returns {Uint8Array}
     */
    get top_5() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.nativepredictionresult_top_5(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var v1 = getArrayU8FromWasm0(r0, r1).slice();
            wasm.__wbindgen_export(r0, r1 * 1, 1);
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * @param {number} arg0
     */
    set confidence_score(arg0) {
        wasm.__wbg_set_nativepredictionresult_confidence_score(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set hurst_exponent(arg0) {
        wasm.__wbg_set_nativepredictionresult_hurst_exponent(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set shannon_entropy(arg0) {
        wasm.__wbg_set_nativepredictionresult_shannon_entropy(this.__wbg_ptr, arg0);
    }
}
if (Symbol.dispose) NativePredictionResult.prototype[Symbol.dispose] = NativePredictionResult.prototype.free;

/**
 * Rapport d'analyse préalable de l'historique complet en RAM
 */
export class PriorAnalysisReport {
    static __wrap(ptr) {
        const obj = Object.create(PriorAnalysisReport.prototype);
        obj.__wbg_ptr = ptr;
        PriorAnalysisReportFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        PriorAnalysisReportFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_prioranalysisreport_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get dominant_period() {
        const ret = wasm.__wbg_get_prioranalysisreport_dominant_period(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get hurst_exponent() {
        const ret = wasm.__wbg_get_prioranalysisreport_hurst_exponent(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get shannon_entropy() {
        const ret = wasm.__wbg_get_prioranalysisreport_shannon_entropy(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get spectral_energy() {
        const ret = wasm.__wbg_get_prioranalysisreport_spectral_energy(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get thermal_volatility() {
        const ret = wasm.__wbg_get_prioranalysisreport_thermal_volatility(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {string}
     */
    get regime_label() {
        let deferred1_0;
        let deferred1_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.prioranalysisreport_regime_label(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            deferred1_0 = r0;
            deferred1_1 = r1;
            return getStringFromWasm0(r0, r1);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_export(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @param {number} arg0
     */
    set dominant_period(arg0) {
        wasm.__wbg_set_prioranalysisreport_dominant_period(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set hurst_exponent(arg0) {
        wasm.__wbg_set_prioranalysisreport_hurst_exponent(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set shannon_entropy(arg0) {
        wasm.__wbg_set_prioranalysisreport_shannon_entropy(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set spectral_energy(arg0) {
        wasm.__wbg_set_prioranalysisreport_spectral_energy(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set thermal_volatility(arg0) {
        wasm.__wbg_set_prioranalysisreport_thermal_volatility(this.__wbg_ptr, arg0);
    }
}
if (Symbol.dispose) PriorAnalysisReport.prototype[Symbol.dispose] = PriorAnalysisReport.prototype.free;

export class SimulationResultHpc {
    static __wrap(ptr) {
        const obj = Object.create(SimulationResultHpc.prototype);
        obj.__wbg_ptr = ptr;
        SimulationResultHpcFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        SimulationResultHpcFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_simulationresulthpc_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get bankruptcy_draw() {
        const ret = wasm.__wbg_get_simulationresulthpc_bankruptcy_draw(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get max_drawdown() {
        const ret = wasm.__wbg_get_simulationresulthpc_max_drawdown(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get net_profit() {
        const ret = wasm.__wbg_get_simulationresulthpc_net_profit(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get profit_factor() {
        const ret = wasm.__wbg_get_simulationresulthpc_profit_factor(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get recovery_factor() {
        const ret = wasm.__wbg_get_simulationresulthpc_recovery_factor(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get roi() {
        const ret = wasm.__wbg_get_simulationresulthpc_roi(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get sharpe_ratio() {
        const ret = wasm.__wbg_get_simulationresulthpc_sharpe_ratio(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get sortino_ratio() {
        const ret = wasm.__wbg_get_simulationresulthpc_sortino_ratio(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get win_rate() {
        const ret = wasm.__wbg_get_simulationresulthpc_win_rate(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {number} arg0
     */
    set bankruptcy_draw(arg0) {
        wasm.__wbg_set_simulationresulthpc_bankruptcy_draw(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set max_drawdown(arg0) {
        wasm.__wbg_set_simulationresulthpc_max_drawdown(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set net_profit(arg0) {
        wasm.__wbg_set_simulationresulthpc_net_profit(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set profit_factor(arg0) {
        wasm.__wbg_set_simulationresulthpc_profit_factor(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set recovery_factor(arg0) {
        wasm.__wbg_set_simulationresulthpc_recovery_factor(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set roi(arg0) {
        wasm.__wbg_set_simulationresulthpc_roi(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set sharpe_ratio(arg0) {
        wasm.__wbg_set_simulationresulthpc_sharpe_ratio(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set sortino_ratio(arg0) {
        wasm.__wbg_set_simulationresulthpc_sortino_ratio(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set win_rate(arg0) {
        wasm.__wbg_set_simulationresulthpc_win_rate(this.__wbg_ptr, arg0);
    }
    /**
     * @returns {Float64Array}
     */
    get balances() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.simulationresulthpc_balances(retptr, this.__wbg_ptr);
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
    get drawdowns() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.simulationresulthpc_drawdowns(retptr, this.__wbg_ptr);
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
if (Symbol.dispose) SimulationResultHpc.prototype[Symbol.dispose] = SimulationResultHpc.prototype.free;

export class SpatialFieldMetricsHpc {
    static __wrap(ptr) {
        const obj = Object.create(SpatialFieldMetricsHpc.prototype);
        obj.__wbg_ptr = ptr;
        SpatialFieldMetricsHpcFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        SpatialFieldMetricsHpcFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_spatialfieldmetricshpc_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get barycenter_x() {
        const ret = wasm.__wbg_get_spatialfieldmetricshpc_barycenter_x(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get barycenter_y() {
        const ret = wasm.__wbg_get_spatialfieldmetricshpc_barycenter_y(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get density_threshold() {
        const ret = wasm.__wbg_get_spatialfieldmetricshpc_density_threshold(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get entropy() {
        const ret = wasm.__wbg_get_spatialfieldmetricshpc_entropy(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {number} arg0
     */
    set barycenter_x(arg0) {
        wasm.__wbg_set_spatialfieldmetricshpc_barycenter_x(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set barycenter_y(arg0) {
        wasm.__wbg_set_spatialfieldmetricshpc_barycenter_y(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set density_threshold(arg0) {
        wasm.__wbg_set_spatialfieldmetricshpc_density_threshold(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set entropy(arg0) {
        wasm.__wbg_set_spatialfieldmetricshpc_entropy(this.__wbg_ptr, arg0);
    }
    /**
     * @returns {Float64Array}
     */
    get gravity_pulls() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.spatialfieldmetricshpc_gravity_pulls(retptr, this.__wbg_ptr);
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
    get grid_density() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.spatialfieldmetricshpc_grid_density(retptr, this.__wbg_ptr);
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
if (Symbol.dispose) SpatialFieldMetricsHpc.prototype[Symbol.dispose] = SpatialFieldMetricsHpc.prototype.free;

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

export class WalkForwardReport {
    static __wrap(ptr) {
        const obj = Object.create(WalkForwardReport.prototype);
        obj.__wbg_ptr = ptr;
        WalkForwardReportFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WalkForwardReportFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_walkforwardreport_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get block_bootstrap_bss_mean() {
        const ret = wasm.__wbg_get_walkforwardreport_block_bootstrap_bss_mean(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get block_bootstrap_bss_std() {
        const ret = wasm.__wbg_get_walkforwardreport_block_bootstrap_bss_std(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get brier_score() {
        const ret = wasm.__wbg_get_walkforwardreport_brier_score(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get brier_skill_score() {
        const ret = wasm.__wbg_get_walkforwardreport_brier_skill_score(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get ece() {
        const ret = wasm.__wbg_get_walkforwardreport_ece(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get empirical_reliability_score() {
        const ret = wasm.__wbg_get_walkforwardreport_empirical_reliability_score(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get evaluated_windows() {
        const ret = wasm.__wbg_get_walkforwardreport_evaluated_windows(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    get holdout_brier_skill_score() {
        const ret = wasm.__wbg_get_walkforwardreport_holdout_brier_skill_score(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get holdout_draws() {
        const ret = wasm.__wbg_get_walkforwardreport_holdout_draws(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    get lift_vs_random() {
        const ret = wasm.__wbg_get_walkforwardreport_lift_vs_random(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get log_loss() {
        const ret = wasm.__wbg_get_walkforwardreport_log_loss(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get mean_hits() {
        const ret = wasm.__wbg_get_walkforwardreport_mean_hits(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get platt_alpha() {
        const ret = wasm.__wbg_get_walkforwardreport_platt_alpha(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get platt_beta() {
        const ret = wasm.__wbg_get_walkforwardreport_platt_beta(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {number} arg0
     */
    set block_bootstrap_bss_mean(arg0) {
        wasm.__wbg_set_walkforwardreport_block_bootstrap_bss_mean(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set block_bootstrap_bss_std(arg0) {
        wasm.__wbg_set_walkforwardreport_block_bootstrap_bss_std(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set brier_score(arg0) {
        wasm.__wbg_set_walkforwardreport_brier_score(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set brier_skill_score(arg0) {
        wasm.__wbg_set_walkforwardreport_brier_skill_score(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set ece(arg0) {
        wasm.__wbg_set_walkforwardreport_ece(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set empirical_reliability_score(arg0) {
        wasm.__wbg_set_walkforwardreport_empirical_reliability_score(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set evaluated_windows(arg0) {
        wasm.__wbg_set_walkforwardreport_evaluated_windows(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set holdout_brier_skill_score(arg0) {
        wasm.__wbg_set_walkforwardreport_holdout_brier_skill_score(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set holdout_draws(arg0) {
        wasm.__wbg_set_walkforwardreport_holdout_draws(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set lift_vs_random(arg0) {
        wasm.__wbg_set_walkforwardreport_lift_vs_random(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set log_loss(arg0) {
        wasm.__wbg_set_walkforwardreport_log_loss(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set mean_hits(arg0) {
        wasm.__wbg_set_walkforwardreport_mean_hits(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set platt_alpha(arg0) {
        wasm.__wbg_set_walkforwardreport_platt_alpha(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set platt_beta(arg0) {
        wasm.__wbg_set_walkforwardreport_platt_beta(this.__wbg_ptr, arg0);
    }
    /**
     * @returns {string}
     */
    get calibration_quality_label() {
        let deferred1_0;
        let deferred1_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.walkforwardreport_calibration_quality_label(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            deferred1_0 = r0;
            deferred1_1 = r1;
            return getStringFromWasm0(r0, r1);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_export(deferred1_0, deferred1_1, 1);
        }
    }
}
if (Symbol.dispose) WalkForwardReport.prototype[Symbol.dispose] = WalkForwardReport.prototype.free;

export class WasmButterflyResult {
    static __wrap(ptr) {
        const obj = Object.create(WasmButterflyResult.prototype);
        obj.__wbg_ptr = ptr;
        WasmButterflyResultFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmButterflyResultFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmbutterflyresult_free(ptr, 0);
    }
    /**
     * @returns {boolean}
     */
    get is_chaotic() {
        const ret = wasm.__wbg_get_wasmbutterflyresult_is_chaotic(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * @returns {number}
     */
    get lyapunov_exponent() {
        const ret = wasm.__wbg_get_wasmbutterflyresult_lyapunov_exponent(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get phase_attractor_x() {
        const ret = wasm.__wbg_get_wasmbutterflyresult_phase_attractor_x(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get phase_attractor_y() {
        const ret = wasm.__wbg_get_wasmbutterflyresult_phase_attractor_y(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get phase_attractor_z() {
        const ret = wasm.__wbg_get_wasmbutterflyresult_phase_attractor_z(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get sensitivity_regime() {
        const ret = wasm.__wbg_get_wasmbutterflyresult_sensitivity_regime(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {boolean} arg0
     */
    set is_chaotic(arg0) {
        wasm.__wbg_set_wasmbutterflyresult_is_chaotic(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set lyapunov_exponent(arg0) {
        wasm.__wbg_set_wasmbutterflyresult_lyapunov_exponent(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set phase_attractor_x(arg0) {
        wasm.__wbg_set_wasmbutterflyresult_phase_attractor_x(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set phase_attractor_y(arg0) {
        wasm.__wbg_set_wasmbutterflyresult_phase_attractor_y(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set phase_attractor_z(arg0) {
        wasm.__wbg_set_wasmbutterflyresult_phase_attractor_z(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set sensitivity_regime(arg0) {
        wasm.__wbg_set_wasmbutterflyresult_sensitivity_regime(this.__wbg_ptr, arg0);
    }
}
if (Symbol.dispose) WasmButterflyResult.prototype[Symbol.dispose] = WasmButterflyResult.prototype.free;

export class WasmChainReactionResult {
    static __wrap(ptr) {
        const obj = Object.create(WasmChainReactionResult.prototype);
        obj.__wbg_ptr = ptr;
        WasmChainReactionResultFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmChainReactionResultFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmchainreactionresult_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get max_constructive_amplitude() {
        const ret = wasm.__wbg_get_wasmchainreactionresult_max_constructive_amplitude(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get percolation_density() {
        const ret = wasm.__wbg_get_wasmchainreactionresult_percolation_density(this.__wbg_ptr);
        return ret;
    }
    /**
     * @param {number} arg0
     */
    set max_constructive_amplitude(arg0) {
        wasm.__wbg_set_wasmchainreactionresult_max_constructive_amplitude(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set percolation_density(arg0) {
        wasm.__wbg_set_wasmchainreactionresult_percolation_density(this.__wbg_ptr, arg0);
    }
    /**
     * @returns {Int32Array}
     */
    get avalanche_critical_numbers() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.wasmchainreactionresult_avalanche_critical_numbers(retptr, this.__wbg_ptr);
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
     * @returns {Float64Array}
     */
    get resonance_spectrum() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.wasmchainreactionresult_resonance_spectrum(retptr, this.__wbg_ptr);
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
if (Symbol.dispose) WasmChainReactionResult.prototype[Symbol.dispose] = WasmChainReactionResult.prototype.free;

export class WasmDominoResult {
    static __wrap(ptr) {
        const obj = Object.create(WasmDominoResult.prototype);
        obj.__wbg_ptr = ptr;
        WasmDominoResultFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmDominoResultFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmdominoresult_free(ptr, 0);
    }
    /**
     * @returns {Float64Array}
     */
    get domino_energies() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.wasmdominoresult_domino_energies(retptr, this.__wbg_ptr);
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
     * @param {number} gamma
     * @returns {WasmDominoResult}
     */
    static empty(gamma) {
        const ret = wasm.wasmdominoresult_empty(gamma);
        return WasmDominoResult.__wrap(ret);
    }
    /**
     * @returns {number}
     */
    get kinetic_dissipation_rate() {
        const ret = wasm.wasmdominoresult_kinetic_dissipation_rate(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {Int32Array}
     */
    get lead_trigger_numbers() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.wasmdominoresult_lead_trigger_numbers(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var v1 = getArrayI32FromWasm0(r0, r1).slice();
            wasm.__wbindgen_export(r0, r1 * 4, 4);
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
}
if (Symbol.dispose) WasmDominoResult.prototype[Symbol.dispose] = WasmDominoResult.prototype.free;

export class WasmHeatKernelResult {
    static __wrap(ptr) {
        const obj = Object.create(WasmHeatKernelResult.prototype);
        obj.__wbg_ptr = ptr;
        WasmHeatKernelResultFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmHeatKernelResultFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmheatkernelresult_free(ptr, 0);
    }
    /**
     * @returns {Float64Array}
     */
    get diffusion_matrix() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.wasmheatkernelresult_diffusion_matrix(retptr, this.__wbg_ptr);
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
    get harmonic_centralities() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.wasmheatkernelresult_harmonic_centralities(retptr, this.__wbg_ptr);
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
    get trace_energy() {
        const ret = wasm.wasmheatkernelresult_trace_energy(this.__wbg_ptr);
        return ret;
    }
}
if (Symbol.dispose) WasmHeatKernelResult.prototype[Symbol.dispose] = WasmHeatKernelResult.prototype.free;

/**
 * Portefeuille de prédictions multi-tickets diversifiés (anti-monoculture)
 */
export class WasmPredictionPortfolio {
    static __wrap(ptr) {
        const obj = Object.create(WasmPredictionPortfolio.prototype);
        obj.__wbg_ptr = ptr;
        WasmPredictionPortfolioFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmPredictionPortfolioFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmpredictionportfolio_free(ptr, 0);
    }
    /**
     * @returns {number}
     */
    get confidence_score() {
        const ret = wasm.__wbg_get_wasmpredictionportfolio_confidence_score(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get diversity_jaccard_distance() {
        const ret = wasm.__wbg_get_wasmpredictionportfolio_diversity_jaccard_distance(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get hurst_exponent() {
        const ret = wasm.__wbg_get_wasmpredictionportfolio_hurst_exponent(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get shannon_entropy() {
        const ret = wasm.__wbg_get_wasmpredictionportfolio_shannon_entropy(this.__wbg_ptr);
        return ret;
    }
    /**
     * @returns {number}
     */
    get ticket_count() {
        const ret = wasm.__wbg_get_wasmpredictionportfolio_ticket_count(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @returns {number}
     */
    get unique_numbers_covered() {
        const ret = wasm.__wbg_get_wasmpredictionportfolio_unique_numbers_covered(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * @param {number} arg0
     */
    set confidence_score(arg0) {
        wasm.__wbg_set_wasmpredictionportfolio_confidence_score(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set diversity_jaccard_distance(arg0) {
        wasm.__wbg_set_wasmpredictionportfolio_diversity_jaccard_distance(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set hurst_exponent(arg0) {
        wasm.__wbg_set_wasmpredictionportfolio_hurst_exponent(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set shannon_entropy(arg0) {
        wasm.__wbg_set_wasmpredictionportfolio_shannon_entropy(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set ticket_count(arg0) {
        wasm.__wbg_set_wasmpredictionportfolio_ticket_count(this.__wbg_ptr, arg0);
    }
    /**
     * @param {number} arg0
     */
    set unique_numbers_covered(arg0) {
        wasm.__wbg_set_wasmpredictionportfolio_unique_numbers_covered(this.__wbg_ptr, arg0);
    }
    /**
     * @returns {string}
     */
    get prediction_mode() {
        let deferred1_0;
        let deferred1_1;
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.wasmpredictionportfolio_prediction_mode(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            deferred1_0 = r0;
            deferred1_1 = r1;
            return getStringFromWasm0(r0, r1);
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
            wasm.__wbindgen_export(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * @returns {Float64Array}
     */
    get scores_flat() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.wasmpredictionportfolio_scores_flat(retptr, this.__wbg_ptr);
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
     * @returns {string[]}
     */
    get strategies() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.wasmpredictionportfolio_strategies(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var v1 = getArrayJsValueFromWasm0(r0, r1);
            wasm.__wbindgen_export(r0, r1 * 4, 4);
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    /**
     * @returns {Uint8Array}
     */
    get tickets_flat() {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.wasmpredictionportfolio_tickets_flat(retptr, this.__wbg_ptr);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var v1 = getArrayU8FromWasm0(r0, r1).slice();
            wasm.__wbindgen_export(r0, r1 * 1, 1);
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
}
if (Symbol.dispose) WasmPredictionPortfolio.prototype[Symbol.dispose] = WasmPredictionPortfolio.prototype.free;

/**
 * Hash FNV-1a déterministe des exports WASM publics du moteur.
 * Le bridge TS compare cette valeur à sa propre liste d'appels attendus.
 * Si les deux divergent, le build CI échoue avant déploiement.
 * @returns {string}
 */
export function abi_hash() {
    let deferred1_0;
    let deferred1_1;
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        wasm.abi_hash(retptr);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        deferred1_0 = r0;
        deferred1_1 = r1;
        return getStringFromWasm0(r0, r1);
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
        wasm.__wbindgen_export(deferred1_0, deferred1_1, 1);
    }
}

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
 * 3. Effet Papillon : Exposant de Lyapunov Local et Trajectoire d'Attracteur
 * @param {Float64Array} lag_series
 * @param {number} hurst_exponent
 * @returns {WasmButterflyResult}
 */
export function compute_butterfly_lyapunov_wasm(lag_series, hurst_exponent) {
    const ptr0 = passArrayF64ToWasm0(lag_series, wasm.__wbindgen_export2);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.compute_butterfly_lyapunov_wasm(ptr0, len0, hurst_exponent);
    return WasmButterflyResult.__wrap(ret);
}

/**
 * 4. Réaction en Chaîne : Résonance d'Interférence Constructive et Potentiel d'Avalanche
 * @param {Int32Array} recent_draws_flat
 * @param {number} draws_count
 * @param {Float64Array} source_couplings
 * @param {number} num_sources
 * @returns {WasmChainReactionResult}
 */
export function compute_chain_reaction_resonance_wasm(recent_draws_flat, draws_count, source_couplings, num_sources) {
    const ptr0 = passArray32ToWasm0(recent_draws_flat, wasm.__wbindgen_export2);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArrayF64ToWasm0(source_couplings, wasm.__wbindgen_export2);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.compute_chain_reaction_resonance_wasm(ptr0, len0, draws_count, ptr1, len1, num_sources);
    return WasmChainReactionResult.__wrap(ret);
}

/**
 * Exécute l'autopsie forensique en boucle fermée et la mise à jour continue des poids (SGD / Huber).
 * @param {Int32Array} predicted_numbers
 * @param {Int32Array} actual_winners
 * @param {Float64Array} current_weights
 * @param {Float64Array} algo_contributions_flat
 * @param {number} num_algos
 * @param {number} history_depth
 * @returns {ClosedLoopAutopsyResultHpc}
 */
export function compute_closed_loop_autopsy_wasm(predicted_numbers, actual_winners, current_weights, algo_contributions_flat, num_algos, history_depth) {
    const ptr0 = passArray32ToWasm0(predicted_numbers, wasm.__wbindgen_export2);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArray32ToWasm0(actual_winners, wasm.__wbindgen_export2);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passArrayF64ToWasm0(current_weights, wasm.__wbindgen_export2);
    const len2 = WASM_VECTOR_LEN;
    const ptr3 = passArrayF64ToWasm0(algo_contributions_flat, wasm.__wbindgen_export2);
    const len3 = WASM_VECTOR_LEN;
    const ret = wasm.compute_closed_loop_autopsy_wasm(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, num_algos, history_depth);
    return ClosedLoopAutopsyResultHpc.__wrap(ret);
}

/**
 * Export Wasm pour le calcul de couplage continu d'interconnexion
 * @param {Uint32Array} freqs_a
 * @param {Uint32Array} freqs_b
 * @returns {number}
 */
export function compute_continuous_interdraw_coupling_wasm(freqs_a, freqs_b) {
    const ptr0 = passArray32ToWasm0(freqs_a, wasm.__wbindgen_export2);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArray32ToWasm0(freqs_b, wasm.__wbindgen_export2);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.compute_continuous_interdraw_coupling_wasm(ptr0, len0, ptr1, len1);
    return ret;
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
 * Évalue les candidats cycliques harmoniques en O(N) avec zéro nombre magique
 * @param {Float64Array} current_gaps
 * @param {Float64Array} avg_gaps
 * @param {Float64Array} std_devs
 * @param {Float64Array} acf_scores
 * @param {number} limit_draws
 * @returns {CyclicBatchReportHpc}
 */
export function compute_cyclic_candidates_hpc(current_gaps, avg_gaps, std_devs, acf_scores, limit_draws) {
    const ptr0 = passArrayF64ToWasm0(current_gaps, wasm.__wbindgen_export2);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArrayF64ToWasm0(avg_gaps, wasm.__wbindgen_export2);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passArrayF64ToWasm0(std_devs, wasm.__wbindgen_export2);
    const len2 = WASM_VECTOR_LEN;
    const ptr3 = passArrayF64ToWasm0(acf_scores, wasm.__wbindgen_export2);
    const len3 = WASM_VECTOR_LEN;
    const ret = wasm.compute_cyclic_candidates_hpc(ptr0, len0, ptr1, len1, ptr2, len2, ptr3, len3, limit_draws);
    return CyclicBatchReportHpc.__wrap(ret);
}

/**
 * 2. Effet Domino : Advection Cinétique Déterministe et Ondes de Réverbération
 * @param {Int32Array} history_flat
 * @param {number} draws_count
 * @param {number} damping_gamma
 * @returns {WasmDominoResult}
 */
export function compute_domino_advection_wasm(history_flat, draws_count, damping_gamma) {
    const ptr0 = passArray32ToWasm0(history_flat, wasm.__wbindgen_export2);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.compute_domino_advection_wasm(ptr0, len0, draws_count, damping_gamma);
    return WasmDominoResult.__wrap(ret);
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
 * Calcule en O(N) les fréquences exactes des 90 numéros sur une tranche aplatie de tirages.
 * Retourne un vecteur de taille 91 où l'index `n` (1..=90) contient le nombre d'apparitions.
 * @param {Int32Array} flat_draws
 * @param {number} num_draws
 * @param {number} win_cols
 * @returns {Int32Array}
 */
export function compute_frequency_counts_wasm(flat_draws, num_draws, win_cols) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passArray32ToWasm0(flat_draws, wasm.__wbindgen_export2);
        const len0 = WASM_VECTOR_LEN;
        wasm.compute_frequency_counts_wasm(retptr, ptr0, len0, num_draws, win_cols);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        var v2 = getArrayI32FromWasm0(r0, r1).slice();
        wasm.__wbindgen_export(r0, r1 * 4, 4);
        return v2;
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
    }
}

/**
 * 1. Effet de Cascade : Noyau de Chaleur de Graphe (Graph Heat Kernel exp(-tL))
 * Résout K_t = exp(-t * L) où L = I - D^{-1/2} W D^{-1/2} est le Laplacien normalisé symétrique.
 * Utilise une approximation polynomiale de Taylor avec normalisation stochastique continue.
 * @param {Float64Array} weights_flat
 * @param {number} n
 * @param {number} diffusion_time_t
 * @returns {WasmHeatKernelResult}
 */
export function compute_graph_heat_kernel_wasm(weights_flat, n, diffusion_time_t) {
    const ptr0 = passArrayF64ToWasm0(weights_flat, wasm.__wbindgen_export2);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.compute_graph_heat_kernel_wasm(ptr0, len0, n, diffusion_time_t);
    return WasmHeatKernelResult.__wrap(ret);
}

/**
 * Calcule l'intensité exacte du processus de Hawkes auto-excité pour les 90 numéros
 * @param {Int32Array} flat_history
 * @param {number} num_draws
 * @param {Float64Array} avg_gaps
 * @returns {HawkesOutputHpc}
 */
export function compute_hawkes_intensity_hpc(flat_history, num_draws, avg_gaps) {
    const ptr0 = passArray32ToWasm0(flat_history, wasm.__wbindgen_export2);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArrayF64ToWasm0(avg_gaps, wasm.__wbindgen_export2);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.compute_hawkes_intensity_hpc(ptr0, len0, num_draws, ptr1, len1);
    return HawkesOutputHpc.__wrap(ret);
}

/**
 * Calcule l'allocation optimale des poids selon le régime fractal/entropique (remplace `hybrid-prediction` Cloud).
 * @param {Float64Array} base_weights
 * @param {Int32Array} channel_types
 * @param {number} hurst
 * @param {number} entropy_norm
 * @param {number} volatility_norm
 * @param {number} history_depth
 * @returns {HybridRegimeOptimizationHpc}
 */
export function compute_hybrid_regime_weights_wasm(base_weights, channel_types, hurst, entropy_norm, volatility_norm, history_depth) {
    const ptr0 = passArrayF64ToWasm0(base_weights, wasm.__wbindgen_export2);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArray32ToWasm0(channel_types, wasm.__wbindgen_export2);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.compute_hybrid_regime_weights_wasm(ptr0, len0, ptr1, len1, hurst, entropy_norm, volatility_norm, history_depth);
    return HybridRegimeOptimizationHpc.__wrap(ret);
}

/**
 * Divergence Kullback-Leibler continue sur Simplex 90D
 * @param {Float64Array} p_base
 * @param {Float64Array} p_sim
 * @returns {number}
 */
export function compute_kl_divergence_hpc(p_base, p_sim) {
    const ptr0 = passArrayF64ToWasm0(p_base, wasm.__wbindgen_export2);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArrayF64ToWasm0(p_sim, wasm.__wbindgen_export2);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.compute_kl_divergence_hpc(ptr0, len0, ptr1, len1);
    return ret;
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
 * PMI (Pointwise Mutual Information) lissé de Laplace pour les 4005 paires.
 *
 * Remplace les comptages bruts par une mesure d'association normalisée :
 * PMI(i,j) = ln[ P_smoothed(i,j) / (P_smoothed(i) * P_smoothed(j)) ]
 * avec lissage alpha = nombre moyen de paires par cellule (dérivé des données).
 * @param {Int32Array} pred_draws_flat
 * @param {Int32Array} target_draws_flat
 * @param {number} num_draws
 * @param {number} win_cols
 * @param {Int32Array} active_pred_numbers
 * @returns {Float64Array}
 */
export function compute_pair_pmi_wasm(pred_draws_flat, target_draws_flat, num_draws, win_cols, active_pred_numbers) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passArray32ToWasm0(pred_draws_flat, wasm.__wbindgen_export2);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArray32ToWasm0(target_draws_flat, wasm.__wbindgen_export2);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passArray32ToWasm0(active_pred_numbers, wasm.__wbindgen_export2);
        const len2 = WASM_VECTOR_LEN;
        wasm.compute_pair_pmi_wasm(retptr, ptr0, len0, ptr1, len1, num_draws, win_cols, ptr2, len2);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        var v4 = getArrayF64FromWasm0(r0, r1).slice();
        wasm.__wbindgen_export(r0, r1 * 8, 8);
        return v4;
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
 * Calcule le champ spatial complet (densité, puits de gravité, barycentre, seuil Probit)
 * @param {Int32Array} flat_draws
 * @param {number} num_draws
 * @returns {SpatialFieldMetricsHpc}
 */
export function compute_spatial_grid_hpc(flat_draws, num_draws) {
    const ptr0 = passArray32ToWasm0(flat_draws, wasm.__wbindgen_export2);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.compute_spatial_grid_hpc(ptr0, len0, num_draws);
    return SpatialFieldMetricsHpc.__wrap(ret);
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
 * Version sémantique du moteur Rust, extraite de Cargo.toml à la compilation.
 * Permet au bridge TS de vérifier la cohérence binaire/source.
 * @returns {string}
 */
export function engine_version() {
    let deferred1_0;
    let deferred1_1;
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        wasm.engine_version(retptr);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        deferred1_0 = r0;
        deferred1_1 = r1;
        return getStringFromWasm0(r0, r1);
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
        wasm.__wbindgen_export(deferred1_0, deferred1_1, 1);
    }
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
 * Exécute l'optimisation par colonie de fourmis (ACS) en mémoire contiguë Rust/WASM.
 * @param {Int32Array} flat_history
 * @param {number} num_draws
 * @param {number} win_cols
 * @param {number} ants_count
 * @param {number} generations
 * @param {number} alpha
 * @param {number} beta
 * @param {number} rho
 * @param {number} q0
 * @param {Int32Array} bias_targets
 * @param {bigint} seed
 * @returns {AcoResultHpc}
 */
export function run_aco_optimization_wasm(flat_history, num_draws, win_cols, ants_count, generations, alpha, beta, rho, q0, bias_targets, seed) {
    const ptr0 = passArray32ToWasm0(flat_history, wasm.__wbindgen_export2);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArray32ToWasm0(bias_targets, wasm.__wbindgen_export2);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.run_aco_optimization_wasm(ptr0, len0, num_draws, win_cols, ants_count, generations, alpha, beta, rho, q0, ptr1, len1, seed);
    return AcoResultHpc.__wrap(ret);
}

/**
 * Stress Test Monte Carlo HPC à haute densité d'itérations
 * @param {Float64Array} base_matrix
 * @param {number} k_algos
 * @param {Float64Array} base_weights
 * @param {number} iterations
 * @param {number} noise_std_dev
 * @param {bigint} seed
 * @returns {MonteCarloReportHpc}
 */
export function run_monte_carlo_whatif_hpc(base_matrix, k_algos, base_weights, iterations, noise_std_dev, seed) {
    const ptr0 = passArrayF64ToWasm0(base_matrix, wasm.__wbindgen_export2);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArrayF64ToWasm0(base_weights, wasm.__wbindgen_export2);
    const len1 = WASM_VECTOR_LEN;
    const ret = wasm.run_monte_carlo_whatif_hpc(ptr0, len0, k_algos, ptr1, len1, iterations, noise_std_dev, seed);
    return MonteCarloReportHpc.__wrap(ret);
}

/**
 * Pipeline de prédiction local ultra-rapide exécuté en RAM contiguë
 * @param {Uint8Array} flat_winners
 * @param {number} num_draws
 * @param {number} frequency_weight
 * @param {number} gap_weight
 * @param {number} _markov_weight
 * @param {number} _hurst_weight
 * @returns {NativePredictionResult}
 */
export function run_native_prediction_pipeline(flat_winners, num_draws, frequency_weight, gap_weight, _markov_weight, _hurst_weight) {
    const ptr0 = passArray8ToWasm0(flat_winners, wasm.__wbindgen_export2);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.run_native_prediction_pipeline(ptr0, len0, num_draws, frequency_weight, gap_weight, _markov_weight, _hurst_weight);
    return NativePredictionResult.__wrap(ret);
}

/**
 * Évalue le moteur financier de backtest en O(N) déterministe avec zéro allocation intermédiaire.
 * @param {Int32Array} hits_history
 * @param {Float64Array} confidences
 * @param {Float64Array} multipliers
 * @param {number} strategy_code
 * @param {number} initial_bankroll
 * @param {number} unit_bet
 * @returns {SimulationResultHpc}
 */
export function run_simulation_hpc(hits_history, confidences, multipliers, strategy_code, initial_bankroll, unit_bet) {
    const ptr0 = passArray32ToWasm0(hits_history, wasm.__wbindgen_export2);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArrayF64ToWasm0(confidences, wasm.__wbindgen_export2);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passArrayF64ToWasm0(multipliers, wasm.__wbindgen_export2);
    const len2 = WASM_VECTOR_LEN;
    const ret = wasm.run_simulation_hpc(ptr0, len0, ptr1, len1, ptr2, len2, strategy_code, initial_bankroll, unit_bet);
    return SimulationResultHpc.__wrap(ret);
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
 * Export WASM (binding fin) : optimise les poids de stacking L2 sur sorties OOF aplaties.
 *
 * Layout `oof_flat` : [sample][channel][91] (indice 0 inutilisé)
 * Layout `targets_flat` : [sample][91] (1.0 = numéro sorti, 0.0 sinon)
 * Retourne les K poids du simplexe (somme = 1.0).
 * @param {Float64Array} oof_flat
 * @param {Float64Array} targets_flat
 * @param {number} num_channels
 * @param {number} num_samples
 * @returns {Float64Array}
 */
export function stack_channel_weights_wasm(oof_flat, targets_flat, num_channels, num_samples) {
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        const ptr0 = passArrayF64ToWasm0(oof_flat, wasm.__wbindgen_export2);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passArrayF64ToWasm0(targets_flat, wasm.__wbindgen_export2);
        const len1 = WASM_VECTOR_LEN;
        wasm.stack_channel_weights_wasm(retptr, ptr0, len0, ptr1, len1, num_channels, num_samples);
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

const AcoResultHpcFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_acoresulthpc_free(ptr, 1));
const AnnealingOptimizationResultFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_annealingoptimizationresult_free(ptr, 1));
const ClosedLoopAutopsyResultHpcFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_closedloopautopsyresulthpc_free(ptr, 1));
const CooccurrenceTensorResultFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_cooccurrencetensorresult_free(ptr, 1));
const CrossHawkesWasmResultFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_crosshawkeswasmresult_free(ptr, 1));
const CyclicBatchReportHpcFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_cyclicbatchreporthpc_free(ptr, 1));
const CyclicCandidateHpcFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_cycliccandidatehpc_free(ptr, 1));
const HawkesOutputHpcFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_hawkesoutputhpc_free(ptr, 1));
const HybridRegimeOptimizationHpcFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_hybridregimeoptimizationhpc_free(ptr, 1));
const InMemoryDrawStoreFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_inmemorydrawstore_free(ptr, 1));
const MonteCarloBallStatFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_montecarloballstat_free(ptr, 1));
const MonteCarloReportHpcFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_montecarloreporthpc_free(ptr, 1));
const NativePredictionResultFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_nativepredictionresult_free(ptr, 1));
const PriorAnalysisReportFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_prioranalysisreport_free(ptr, 1));
const SimulationResultHpcFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_simulationresulthpc_free(ptr, 1));
const SpatialFieldMetricsHpcFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_spatialfieldmetricshpc_free(ptr, 1));
const SpectralAnalysisResultFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_spectralanalysisresult_free(ptr, 1));
const TopologicalLyapunovResultFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_topologicallyapunovresult_free(ptr, 1));
const WalkForwardReportFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_walkforwardreport_free(ptr, 1));
const WasmButterflyResultFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmbutterflyresult_free(ptr, 1));
const WasmChainReactionResultFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmchainreactionresult_free(ptr, 1));
const WasmDominoResultFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmdominoresult_free(ptr, 1));
const WasmHeatKernelResultFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmheatkernelresult_free(ptr, 1));
const WasmPredictionPortfolioFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmpredictionportfolio_free(ptr, 1));

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

function getArrayJsValueFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    const mem = getDataViewMemory0();
    const result = [];
    for (let i = ptr; i < ptr + 4 * len; i += 4) {
        result.push(takeObject(mem.getUint32(i, true)));
    }
    return result;
}

function getArrayU32FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint32ArrayMemory0().subarray(ptr / 4, ptr / 4 + len);
}

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
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

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
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
