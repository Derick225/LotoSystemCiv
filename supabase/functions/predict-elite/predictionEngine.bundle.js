var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// services/workers/zeroCopy.ts
function packHistory(history) {
  if (!history || history.length === 0) {
    const empty = new Int32Array(0);
    return { historyBuffer: empty.buffer, drawCount: 0, winningCount: 0, totalCols: 0 };
  }
  const drawCount = history.length;
  const sample = history[0];
  const winningCount = sample.gagnants ? sample.gagnants.length : 5;
  const machineCount = sample.machine ? sample.machine.length : 0;
  const totalCols = winningCount + machineCount;
  const typedArr = new Int32Array(drawCount * totalCols);
  for (let i = 0; i < drawCount; i++) {
    const draw = history[i];
    const offset = i * totalCols;
    const g = draw.gagnants || [];
    for (let k = 0; k < winningCount; k++) {
      typedArr[offset + k] = g[k] || 0;
    }
    if (machineCount > 0 && draw.machine) {
      for (let k = 0; k < machineCount; k++) {
        typedArr[offset + winningCount + k] = draw.machine[k] || 0;
      }
    }
  }
  return {
    historyBuffer: typedArr.buffer,
    drawCount,
    winningCount,
    totalCols
  };
}
function packMatrix(matrix) {
  if (!matrix || matrix.length === 0) {
    return { matrixBuffer: new Float64Array(0).buffer, rows: 0, cols: 0 };
  }
  const rows = matrix.length;
  const cols = matrix[0]?.length || 0;
  const typedArr = new Float64Array(rows * cols);
  for (let r = 0; r < rows; r++) {
    const row = matrix[r];
    const offset = r * cols;
    for (let c = 0; c < cols; c++) {
      typedArr[offset + c] = row[c] || 0;
    }
  }
  return { matrixBuffer: typedArr.buffer, rows, cols };
}
function packArray(arr) {
  if (!arr || arr.length === 0) {
    return { arrayBuffer: new Float64Array(0).buffer, length: 0 };
  }
  const typedArr = Float64Array.from(arr);
  return { arrayBuffer: typedArr.buffer, length: arr.length };
}
function collectTransferables(obj, transferables, visited = /* @__PURE__ */ new WeakSet()) {
  if (!obj || typeof obj !== "object") return;
  if (visited.has(obj)) return;
  visited.add(obj);
  if (obj instanceof ArrayBuffer) {
    if (!transferables.includes(obj)) {
      transferables.push(obj);
    }
    return;
  }
  if (ArrayBuffer.isView(obj)) {
    if (obj.buffer && !transferables.includes(obj.buffer)) {
      transferables.push(obj.buffer);
    }
    return;
  }
  if (Array.isArray(obj)) {
    for (const item of obj) {
      collectTransferables(item, transferables, visited);
    }
    return;
  }
  for (const key of Object.keys(obj)) {
    collectTransferables(obj[key], transferables, visited);
  }
}
var init_zeroCopy = __esm({
  "services/workers/zeroCopy.ts"() {
    "use strict";
  }
});

// shared/prediction.types.ts
var AlgoKey, DEFAULT_ALGO_WEIGHTS, FALLBACK_CALIBRATION;
var init_prediction_types = __esm({
  "shared/prediction.types.ts"() {
    "use strict";
    AlgoKey = /* @__PURE__ */ ((AlgoKey2) => {
      AlgoKey2["FREQUENCY"] = "frequency";
      AlgoKey2["GAPS"] = "gap";
      AlgoKey2["SPECTRAL"] = "spectral";
      AlgoKey2["MARKOV"] = "markov";
      AlgoKey2["BAYES"] = "bayes";
      AlgoKey2["MOMENTUM"] = "momentum";
      AlgoKey2["AFFINITY"] = "affinity";
      AlgoKey2["SPATIAL"] = "spatial";
      AlgoKey2["TEMPORAL"] = "temporal";
      AlgoKey2["FRACTAL"] = "fractal";
      AlgoKey2["SHADOW_PROBABILITY"] = "shadow";
      AlgoKey2["NETWORK_CORRELATION"] = "network";
      AlgoKey2["ECHO_STATE"] = "echo_state";
      AlgoKey2["GAP_SEQUENCE"] = "gap_sequence";
      AlgoKey2["DERIVED_NEIGHBOR"] = "derived_neighbor";
      AlgoKey2["GAP_PATTERN"] = "gap_pattern";
      AlgoKey2["SEQUENCE_PATTERN"] = "sequence_pattern";
      AlgoKey2["GAP_CADENCE"] = "gap_cadence";
      AlgoKey2["GAP_TREND"] = "gap_trend";
      AlgoKey2["INTER_MONTHLY_RESONANCE"] = "inter_monthly_resonance";
      AlgoKey2["ISOLATION_ANOMALY"] = "isolation_anomaly";
      AlgoKey2["GAP_BAND_SEQUENCE"] = "gap_band_sequence";
      return AlgoKey2;
    })(AlgoKey || {});
    DEFAULT_ALGO_WEIGHTS = Object.values(AlgoKey).reduce((acc, key) => {
      acc[key] = 1;
      return acc;
    }, {});
    FALLBACK_CALIBRATION = {
      meanSum: 216.9,
      stdSum: 56.8,
      meanAmplitude: 58.9,
      stdAmplitude: 13.5,
      meanAC: 9.66,
      stdAC: 0.64,
      lambdaConsecutives: 0.21,
      isValid: false
    };
  }
});

// services/prediction/supabaseClientStub.ts
var isSupabaseConfigured, supabase;
var init_supabaseClientStub = __esm({
  "services/prediction/supabaseClientStub.ts"() {
    isSupabaseConfigured = () => false;
    supabase = null;
  }
});

// node_modules/idb-keyval/dist/index.js
var dist_exports = {};
__export(dist_exports, {
  clear: () => clear,
  createStore: () => createStore,
  del: () => del,
  delMany: () => delMany,
  entries: () => entries,
  get: () => get,
  getMany: () => getMany,
  keys: () => keys,
  promisifyRequest: () => promisifyRequest,
  set: () => set,
  setMany: () => setMany,
  update: () => update,
  values: () => values
});
function promisifyRequest(request) {
  return new Promise((resolve, reject) => {
    request.oncomplete = request.onsuccess = () => resolve(request.result);
    request.onabort = request.onerror = () => reject(request.error);
  });
}
function createStore(dbName, storeName) {
  let dbp;
  const getDB = () => {
    if (dbp)
      return dbp;
    const request = indexedDB.open(dbName);
    request.onupgradeneeded = () => request.result.createObjectStore(storeName);
    dbp = promisifyRequest(request);
    dbp.then((db) => {
      db.onclose = () => dbp = void 0;
    }, () => {
    });
    return dbp;
  };
  return (txMode, callback) => getDB().then((db) => callback(db.transaction(storeName, txMode).objectStore(storeName)));
}
function defaultGetStore() {
  if (!defaultGetStoreFunc) {
    defaultGetStoreFunc = createStore("keyval-store", "keyval");
  }
  return defaultGetStoreFunc;
}
function get(key, customStore = defaultGetStore()) {
  return customStore("readonly", (store) => promisifyRequest(store.get(key)));
}
function set(key, value, customStore = defaultGetStore()) {
  return customStore("readwrite", (store) => {
    store.put(value, key);
    return promisifyRequest(store.transaction);
  });
}
function setMany(entries2, customStore = defaultGetStore()) {
  return customStore("readwrite", (store) => {
    entries2.forEach((entry) => store.put(entry[1], entry[0]));
    return promisifyRequest(store.transaction);
  });
}
function getMany(keys2, customStore = defaultGetStore()) {
  return customStore("readonly", (store) => Promise.all(keys2.map((key) => promisifyRequest(store.get(key)))));
}
function update(key, updater, customStore = defaultGetStore()) {
  return customStore("readwrite", (store) => (
    // Need to create the promise manually.
    // If I try to chain promises, the transaction closes in browsers
    // that use a promise polyfill (IE10/11).
    new Promise((resolve, reject) => {
      store.get(key).onsuccess = function() {
        try {
          store.put(updater(this.result), key);
          resolve(promisifyRequest(store.transaction));
        } catch (err) {
          reject(err);
        }
      };
    })
  ));
}
function del(key, customStore = defaultGetStore()) {
  return customStore("readwrite", (store) => {
    store.delete(key);
    return promisifyRequest(store.transaction);
  });
}
function delMany(keys2, customStore = defaultGetStore()) {
  return customStore("readwrite", (store) => {
    keys2.forEach((key) => store.delete(key));
    return promisifyRequest(store.transaction);
  });
}
function clear(customStore = defaultGetStore()) {
  return customStore("readwrite", (store) => {
    store.clear();
    return promisifyRequest(store.transaction);
  });
}
function eachCursor(store, callback) {
  store.openCursor().onsuccess = function() {
    if (!this.result)
      return;
    callback(this.result);
    this.result.continue();
  };
  return promisifyRequest(store.transaction);
}
function keys(customStore = defaultGetStore()) {
  return customStore("readonly", (store) => {
    if (store.getAllKeys) {
      return promisifyRequest(store.getAllKeys());
    }
    const items = [];
    return eachCursor(store, (cursor) => items.push(cursor.key)).then(() => items);
  });
}
function values(customStore = defaultGetStore()) {
  return customStore("readonly", (store) => {
    if (store.getAll) {
      return promisifyRequest(store.getAll());
    }
    const items = [];
    return eachCursor(store, (cursor) => items.push(cursor.value)).then(() => items);
  });
}
function entries(customStore = defaultGetStore()) {
  return customStore("readonly", (store) => {
    if (store.getAll && store.getAllKeys) {
      return Promise.all([
        promisifyRequest(store.getAllKeys()),
        promisifyRequest(store.getAll())
      ]).then(([keys2, values2]) => keys2.map((key, i) => [key, values2[i]]));
    }
    const items = [];
    return customStore("readonly", (store2) => eachCursor(store2, (cursor) => items.push([cursor.key, cursor.value])).then(() => items));
  });
}
var defaultGetStoreFunc;
var init_dist = __esm({
  "node_modules/idb-keyval/dist/index.js"() {
  }
});

// services/prediction/loggerStub.ts
var print, logger;
var init_loggerStub = __esm({
  "services/prediction/loggerStub.ts"() {
    print = (level, ...args) => {
      if (level === "debug") return;
      console.log(`[${level.toUpperCase()}]`, ...args);
    };
    logger = {
      debug: (...args) => print("debug", ...args),
      info: (...args) => print("info", ...args),
      warn: (...args) => print("warn", ...args),
      error: (...args) => print("error", ...args)
    };
  }
});

// services/prediction/postPredictionAnalysisStub.ts
var postPredictionAnalysisStub_exports = {};
__export(postPredictionAnalysisStub_exports, {
  getLocalForensicReports: () => getLocalForensicReports
});
var getLocalForensicReports;
var init_postPredictionAnalysisStub = __esm({
  "services/prediction/postPredictionAnalysisStub.ts"() {
    getLocalForensicReports = async () => {
      return [];
    };
  }
});

// services/prediction/storeStub.ts
var storeStub_exports = {};
__export(storeStub_exports, {
  useNexusStore: () => useNexusStore
});
var useNexusStore;
var init_storeStub = __esm({
  "services/prediction/storeStub.ts"() {
    useNexusStore = {
      getState: () => ({
        useSpatioTemporalHawkes: true,
        useCloudEngine: false
      })
    };
  }
});

// services/prediction/weightsManager.ts
var weightsManager_exports = {};
__export(weightsManager_exports, {
  adjustWeightsForRegime: () => adjustWeightsForRegime,
  applyBayesianForensicFeedback: () => applyBayesianForensicFeedback,
  applyForensicCalibration: () => applyForensicCalibration,
  applyMetaLearning: () => applyMetaLearning,
  getAlgoWeights: () => getAlgoWeights,
  getCalibratedHyperparameters: () => getCalibratedHyperparameters,
  getDefaultWeights: () => getDefaultWeights,
  normalizeWeights: () => normalizeWeights,
  saveAlgoWeights: () => saveAlgoWeights
});
var getDefaultWeights, normalizeWeights, adjustWeightsForRegime, applyMetaLearning, weightsCache, CACHE_TTL_MS, getAlgoWeights, saveAlgoWeights, applyForensicCalibration, applyBayesianForensicFeedback, getCalibratedHyperparameters;
var init_weightsManager = __esm({
  "services/prediction/weightsManager.ts"() {
    "use strict";
    init_prediction_types();
    init_zeroCopy();
    init_supabaseClientStub();
    init_dist();
    init_loggerStub();
    getDefaultWeights = () => ({ ...DEFAULT_ALGO_WEIGHTS });
    normalizeWeights = (weights, options) => {
      const validKeys = Object.values(AlgoKey);
      const keys2 = Object.keys(weights).filter((k) => validKeys.includes(k));
      if (keys2.length === 0) {
        return { ...DEFAULT_ALGO_WEIGHTS };
      }
      const numAlgos = keys2.length;
      const FLOOR = 1 / (2 * numAlgos);
      const CEILING = options?.bypassCap ? 1 - 1 / Math.sqrt(numAlgos) : Math.min(0.5, 2 / Math.sqrt(numAlgos));
      let w = {};
      let initialSum = 0;
      keys2.forEach((key) => {
        let val = weights[key];
        if (typeof val !== "number" || isNaN(val) || val < 0) val = 0;
        w[key] = val;
        initialSum += val;
      });
      if (initialSum > 0) {
        keys2.forEach((key) => {
          w[key] = w[key] / initialSum;
        });
      } else {
        const uniform = 1 / numAlgos;
        keys2.forEach((key) => {
          w[key] = uniform;
        });
      }
      const maxProjectIterations = Math.max(10, numAlgos * 2);
      for (let iter = 0; iter < maxProjectIterations; iter++) {
        let currentSum = 0;
        keys2.forEach((k) => {
          w[k] = Math.max(FLOOR, Math.min(CEILING, w[k]));
          currentSum += w[k];
        });
        if (Math.abs(currentSum - 1) < Number.EPSILON * 100) break;
        const error = 1 - currentSum;
        const freeKeys = keys2.filter((k) => w[k] > FLOOR && w[k] < CEILING);
        const adjustment = freeKeys.length > 0 ? error / freeKeys.length : error / numAlgos;
        const targetKeys = freeKeys.length > 0 ? freeKeys : keys2;
        targetKeys.forEach((k) => {
          w[k] += adjustment;
        });
      }
      let finalTotal = 0;
      keys2.forEach((k) => {
        w[k] = Math.max(FLOOR, Math.min(CEILING, w[k]));
        w[k] = parseFloat(w[k].toFixed(6));
        finalTotal += w[k];
      });
      if (finalTotal > 0 && Math.abs(finalTotal - 1) > 1e-5) {
        const sortedKeys = [...keys2].sort((a, b) => {
          const diff = w[b] - w[a];
          return diff !== 0 ? diff : a.localeCompare(b);
        });
        w[sortedKeys[0]] = parseFloat((w[sortedKeys[0]] + (1 - finalTotal)).toFixed(6));
      }
      return w;
    };
    adjustWeightsForRegime = (weights, regimeInfo) => {
      if (!regimeInfo) return normalizeWeights(weights);
      const { hurst, entropy, volatility } = regimeInfo;
      const adjusted = { ...weights };
      const maxEntropy = Math.log2(90);
      const normalizedEntropy = entropy > 1 ? Math.min(1, entropy / maxEntropy) : Math.max(0, Math.min(1, entropy));
      const w_hurst = 0.5 * (1 + Math.tanh(4 * (hurst - 0.5)));
      const persistenceFactor = w_hurst;
      const meanReversionFactor = 1 - persistenceFactor;
      const volFactor = Math.max(0, Math.min(1, volatility / 100));
      const deterministicFactor = 1 / (1 + Math.exp(10 * (normalizedEntropy - 0.5)));
      const chaoticFactor = 1 / (1 + Math.exp(-10 * (normalizedEntropy - 0.5)));
      const cadenceBoost = 1 + 1.8 * deterministicFactor;
      adjusted["gap_cadence" /* GAP_CADENCE */] = (adjusted["gap_cadence" /* GAP_CADENCE */] || 0) * cadenceBoost;
      adjusted["gap_pattern" /* GAP_PATTERN */] = (adjusted["gap_pattern" /* GAP_PATTERN */] || 0) * cadenceBoost;
      adjusted["gap_sequence" /* GAP_SEQUENCE */] = (adjusted["gap_sequence" /* GAP_SEQUENCE */] || 0) * (1 + 1.2 * deterministicFactor);
      adjusted["gap_band_sequence" /* GAP_BAND_SEQUENCE */] = (adjusted["gap_band_sequence" /* GAP_BAND_SEQUENCE */] || 0) * (1 + 1.2 * deterministicFactor);
      const topologyBayesBoost = 1 + 1.8 * chaoticFactor;
      adjusted["bayes" /* BAYES */] = (adjusted["bayes" /* BAYES */] || 0) * topologyBayesBoost;
      adjusted["temporal" /* TEMPORAL */] = (adjusted["temporal" /* TEMPORAL */] || 0) * topologyBayesBoost;
      adjusted["spectral" /* SPECTRAL */] = (adjusted["spectral" /* SPECTRAL */] || 0) * (1 + 1.2 * chaoticFactor * volFactor);
      adjusted["fractal" /* FRACTAL */] = (adjusted["fractal" /* FRACTAL */] || 0) * (1 + 1.2 * chaoticFactor);
      adjusted["echo_state" /* ECHO_STATE */] = (adjusted["echo_state" /* ECHO_STATE */] || 0) * (1 + 1.2 * chaoticFactor * volFactor);
      adjusted["derived_neighbor" /* DERIVED_NEIGHBOR */] = (adjusted["derived_neighbor" /* DERIVED_NEIGHBOR */] || 0) * (1 + 1 * chaoticFactor);
      adjusted["frequency" /* FREQUENCY */] = (adjusted["frequency" /* FREQUENCY */] || 0) * (1 + persistenceFactor);
      adjusted["markov" /* MARKOV */] = (adjusted["markov" /* MARKOV */] || 0) * (1 + persistenceFactor * 0.5);
      adjusted["gap" /* GAPS */] = (adjusted["gap" /* GAPS */] || 0) * (1 + meanReversionFactor);
      const persistencePremium = 1 + 4 * Math.max(0, hurst - 0.5);
      adjusted["gap_trend" /* GAP_TREND */] = (adjusted["gap_trend" /* GAP_TREND */] || 0) * persistencePremium;
      return normalizeWeights(adjusted);
    };
    applyMetaLearning = async (weights, history, drawName) => {
      const dynamicWeights = { ...weights };
      try {
        const { getLocalForensicReports: getLocalForensicReports2 } = await Promise.resolve().then(() => (init_postPredictionAnalysisStub(), postPredictionAnalysisStub_exports));
        let forensicReports = await getLocalForensicReports2() || [];
        if (drawName) forensicReports = forensicReports.filter((r) => r.drawName === drawName);
        const entropyWindow = forensicReports.length > 0 ? Math.abs(forensicReports.reduce((acc, r) => acc + (r.shannon_entropy || 0), 0) / forensicReports.length) : 1;
        const windowSize = Math.max(5, Math.floor(Math.sqrt(forensicReports.length) * (1 + entropyWindow / Math.log2(90))));
        const recentReports = forensicReports.slice(0, windowSize);
        if (recentReports.length > 0) {
          const dynamicHalfLife = Math.max(1, Math.floor(windowSize / 2));
          const algosList = Object.keys(dynamicWeights);
          const numAlgos = algosList.length || 1;
          const kalmanStates = {};
          algosList.forEach((algo) => {
            kalmanStates[algo] = { x: 1, P: 1 };
          });
          const predictionsMap = /* @__PURE__ */ new Map();
          try {
            const feedbackIndexStr = await get("feedback_index_map");
            if (feedbackIndexStr) {
              const indexObj = typeof feedbackIndexStr === "string" ? JSON.parse(feedbackIndexStr) : feedbackIndexStr;
              Object.keys(indexObj).forEach((id) => {
                predictionsMap.set(id, indexObj[id]);
              });
            } else {
              const { keys: idbKeys } = await Promise.resolve().then(() => (init_dist(), dist_exports));
              const allKeys = await idbKeys();
              const histKeys = allKeys.filter((k) => typeof k === "string" && k.startsWith("pred_"));
              const newIndexObj = {};
              for (const k of histKeys) {
                const itemStr = await get(k);
                if (itemStr) {
                  try {
                    const item = typeof itemStr === "string" ? JSON.parse(itemStr) : itemStr;
                    if (item && item.id) {
                      predictionsMap.set(item.id, item);
                      if (item.feedback) {
                        newIndexObj[item.id] = { id: item.id, feedback: item.feedback };
                      }
                    }
                  } catch (_) {
                  }
                }
              }
              if (Object.keys(newIndexObj).length > 0) {
                await set("feedback_index_map", JSON.stringify(newIndexObj));
              }
            }
          } catch (_) {
          }
          const chronologicalReports = [...recentReports].reverse();
          chronologicalReports.forEach((report, index) => {
            if (report.isBlackSwan) return;
            const originalIndexInRecent = recentReports.length - 1 - index;
            const timeDecay = Math.pow(0.5, originalIndexInRecent / dynamicHalfLife);
            const brierNormalized = Math.max(0, Math.min(1, report.brier_score || 0.5));
            const ufiPenalty = report.unifiedIntegrityIndex !== void 0 ? Math.max(0, (100 - report.unifiedIntegrityIndex) / 100) : 0;
            const baseR = Math.max(1 / (2 * numAlgos), brierNormalized + ufiPenalty * (1 / Math.sqrt(numAlgos)));
            const finalR = baseR / (timeDecay + Number.EPSILON);
            const Q = 1 / (numAlgos * numAlgos) / Math.sqrt(recentReports.length + 1);
            algosList.forEach((algo) => {
              const state = kalmanStates[algo];
              const P_pred = state.P + Q;
              let z_t = 1;
              if (report.proposedAdjustments && report.proposedAdjustments.length > 0) {
                const adj = report.proposedAdjustments.find((a) => a.algo === algo);
                if (adj) {
                  const shockFactor = 1 + 1 / numAlgos * (1 - Math.exp(-Math.abs(adj.proposedWeightChange)));
                  z_t += adj.proposedWeightChange * shockFactor;
                }
              }
              if (report.counterfactuals && report.counterfactuals.length > 0) {
                report.counterfactuals.forEach((cf) => {
                  if (cf.action === "OPTIMAL_DNA" && cf.optimalWeightsDistribution) {
                    const optW = cf.optimalWeightsDistribution[algo];
                    if (typeof optW === "number" && weights[algo] > 0) {
                      const multiplier = optW / weights[algo];
                      z_t += (multiplier - 1) * (1 / 2);
                    }
                  } else if (cf.action === "SYNERGY" && cf.algo) {
                    const parts = cf.algo.split("+").map((a) => a.trim());
                    if (parts.includes(algo)) {
                      z_t += (cf.rankImprovement || 0) / Math.max(1, recentReports.length);
                    }
                  } else if (cf.algo === algo) {
                    const modifier = cf.action === "BOOST" || cf.action === "ISOLATE" ? 1 : -1;
                    z_t += modifier * ((cf.rankImprovement || 0) / Math.max(1, recentReports.length));
                  }
                });
              }
              if (report.kl_divergence && report.kl_divergence > 0) {
                const maxKL = Math.log(90);
                const klImpact = 1 - Math.exp(-(report.kl_divergence / maxKL));
                const normalizedImpact = klImpact / numAlgos;
                if (algo === "frequency" /* FREQUENCY */) z_t -= normalizedImpact;
                if (algo === "gap" /* GAPS */) z_t += normalizedImpact;
                if (algo === "affinity" /* AFFINITY */) z_t += normalizedImpact;
              }
              if (report.shannon_entropy && report.shannon_entropy > 0 && algo === "markov" /* MARKOV */) {
                const maxEntropy = Math.log2(90);
                const entropyImpact = 1 - Math.exp(-(report.shannon_entropy / maxEntropy));
                z_t += entropyImpact / numAlgos;
              }
              if (report.predictionId) {
                const pred = predictionsMap.get(report.predictionId);
                if (pred && pred.feedback && pred.feedback.userRating) {
                  const rating = pred.feedback.userRating;
                  const adj = report.proposedAdjustments?.find((a) => a.algo === algo);
                  const changeMagnitude = adj ? Math.abs(adj.proposedWeightChange) : 1 / numAlgos;
                  if (rating === "Visionnaire") {
                    const isContrib = adj && adj.proposedWeightChange > 0;
                    z_t += changeMagnitude * (isContrib ? 1 : 1 / 2);
                  } else if (rating === "Incoh\xE9rente") {
                    const isOffender = adj && adj.proposedWeightChange < 0;
                    z_t -= changeMagnitude * (isOffender ? 1 : 1 / 2);
                  }
                }
              }
              const scale = Math.log(90);
              z_t = scale * Math.tanh(Math.max(Number.EPSILON, z_t) / scale);
              const rawK = P_pred / (P_pred + finalR);
              const innovation = z_t - state.x;
              const gamma = Math.max(Number.EPSILON, P_pred);
              const resilienceFactor = 1 / (1 + Math.pow(innovation / gamma, 2));
              const K = rawK * resilienceFactor;
              state.x = state.x + K * innovation;
              state.P = (1 - K) * P_pred;
            });
          });
          algosList.forEach((algo) => {
            dynamicWeights[algo] *= kalmanStates[algo].x;
          });
          return normalizeWeights(dynamicWeights);
        }
      } catch (e) {
        logger.warn({ err: e }, "Erreur Meta-Learning, fallback vers les poids normalis\xE9s.");
      }
      if (history.length < 20) return normalizeWeights(dynamicWeights);
      return new Promise((resolve) => {
        try {
          const worker = new Worker(new URL("../workers/metaLearning.worker.ts?worker", import.meta.url), { type: "module" });
          const timeoutMs = 15e3;
          const timer = setTimeout(() => {
            logger.warn(`Meta-Learning Worker Timeout (${timeoutMs}ms), falling back`);
            worker.terminate();
            resolve(normalizeWeights(dynamicWeights));
          }, timeoutMs);
          worker.onmessage = (event) => {
            clearTimeout(timer);
            const { type, bestConfig, error } = event.data;
            if (type === "SUCCESS" && bestConfig) resolve(bestConfig);
            else {
              logger.warn({ err: error }, "Worker error during meta-learning fallback");
              resolve(normalizeWeights(dynamicWeights));
            }
            worker.terminate();
          };
          worker.onerror = (e) => {
            clearTimeout(timer);
            logger.warn({ err: e.message }, "Worker execution error");
            resolve(normalizeWeights(dynamicWeights));
            worker.terminate();
          };
          const historyLite = history.map((h) => ({
            gagnants: h.gagnants,
            machine: h.machine || [],
            date: h.date || ""
          }));
          const packed = packHistory(historyLite);
          worker.postMessage({
            dynamicWeights,
            historyBuffer: packed.historyBuffer,
            drawCount: packed.drawCount,
            winningCount: packed.winningCount,
            totalCols: packed.totalCols
          }, [packed.historyBuffer]);
        } catch (err) {
          logger.warn({ err }, "Failed to spawn meta-learning worker");
          resolve(normalizeWeights(dynamicWeights));
        }
      });
    };
    weightsCache = /* @__PURE__ */ new Map();
    CACHE_TTL_MS = 1e3 * 30;
    getAlgoWeights = async (drawName) => {
      const now = Date.now();
      const cached = weightsCache.get(drawName);
      if (cached && now - cached.timestamp < CACHE_TTL_MS) {
        return cached.weights;
      }
      let weights = getDefaultWeights();
      let localWeights = null;
      let localUpdatedAt = null;
      if (typeof window !== "undefined") {
        try {
          const parsed = await get(`nexus_config_${drawName}`);
          if (parsed?.weights && Object.keys(parsed.weights).length > 0) {
            localWeights = parsed.weights;
            if (parsed.updatedAt) {
              localUpdatedAt = new Date(parsed.updatedAt);
            }
          }
        } catch (e) {
        }
      }
      if (localWeights) {
        const localMergedWeights = normalizeWeights({ ...weights, ...localWeights });
        weightsCache.set(drawName, { weights: localMergedWeights, timestamp: now });
        if (isSupabaseConfigured() && navigator.onLine) {
          (async () => {
            try {
              let remoteWeights2 = null;
              let remoteUpdatedAt2 = null;
              const { data: adaptiveConfig } = await supabase.from("model_weights_config").select("weights, updated_at").eq("draw_name", drawName).maybeSingle();
              if (adaptiveConfig?.weights) {
                remoteWeights2 = adaptiveConfig.weights;
                if (adaptiveConfig.updated_at) {
                  remoteUpdatedAt2 = new Date(adaptiveConfig.updated_at);
                }
              } else {
                const { data } = await supabase.from("algo_weights").select("weights, updated_at").eq("draw_name", drawName).maybeSingle();
                if (data?.weights) {
                  remoteWeights2 = data.weights;
                  if (data.updated_at) {
                    remoteUpdatedAt2 = new Date(data.updated_at);
                  }
                }
              }
              if (remoteWeights2 && remoteUpdatedAt2 && localUpdatedAt) {
                if (remoteUpdatedAt2.getTime() > localUpdatedAt.getTime() + 3e5) {
                  const freshWeights = normalizeWeights({ ...getDefaultWeights(), ...remoteWeights2 });
                  await set(`nexus_config_${drawName}`, {
                    weights: remoteWeights2,
                    updatedAt: remoteUpdatedAt2.toISOString()
                  });
                  weightsCache.set(drawName, { weights: freshWeights, timestamp: Date.now() });
                  const { useNexusStore: useNexusStore2 } = await Promise.resolve().then(() => (init_storeStub(), storeStub_exports));
                  const activeDraw = useNexusStore2.getState().drawName;
                  if (activeDraw === drawName) {
                    useNexusStore2.getState().setGlobalWeights(freshWeights);
                  }
                }
              }
            } catch (e) {
            }
          })();
        }
        return localMergedWeights;
      }
      let remoteWeights = null;
      let remoteUpdatedAt = null;
      if (isSupabaseConfigured() && navigator.onLine) {
        try {
          const { data: adaptiveConfig } = await supabase.from("model_weights_config").select("weights, updated_at").eq("draw_name", drawName).maybeSingle();
          if (adaptiveConfig?.weights) {
            remoteWeights = adaptiveConfig.weights;
            if (adaptiveConfig.updated_at) {
              remoteUpdatedAt = new Date(adaptiveConfig.updated_at);
            }
          } else {
            const { data } = await supabase.from("algo_weights").select("weights, updated_at").eq("draw_name", drawName).maybeSingle();
            if (data?.weights) {
              remoteWeights = data.weights;
              if (data.updated_at) {
                remoteUpdatedAt = new Date(data.updated_at);
              }
            }
          }
        } catch (e) {
        }
      }
      if (remoteWeights) {
        weights = { ...weights, ...remoteWeights };
        try {
          await set(`nexus_config_${drawName}`, {
            weights: remoteWeights,
            updatedAt: remoteUpdatedAt ? remoteUpdatedAt.toISOString() : (/* @__PURE__ */ new Date()).toISOString()
          });
        } catch (e) {
        }
      }
      const finalWeights = normalizeWeights(weights);
      weightsCache.set(drawName, { weights: finalWeights, timestamp: now });
      return finalWeights;
    };
    saveAlgoWeights = async (drawName, weights) => {
      weightsCache.set(drawName, { weights, timestamp: Date.now() });
      try {
        if (typeof window !== "undefined") {
          const payload = { weights, updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
          await set(`nexus_config_${drawName}`, payload);
        }
        if (isSupabaseConfigured()) {
          await supabase.from("algo_weights").upsert({ draw_name: drawName, weights });
        }
      } catch (e) {
      }
    };
    applyForensicCalibration = (currentWeights, suggestions, historyLength) => {
      const newWeights = { ...currentWeights };
      const numAlgos = Object.keys(currentWeights).length || 1;
      const dampingMin = 1 / numAlgos;
      const dampingMax = 1 / Math.sqrt(numAlgos);
      const damping = Math.max(dampingMin, Math.min(dampingMax, 1 / Math.sqrt(historyLength)));
      suggestions.forEach((s) => {
        const change = s.improvement / 100 * damping;
        if (s.action === "SYNERGY") {
          const parts = s.algo.split("+").map((p) => p.trim());
          parts.forEach((p) => {
            if (newWeights[p] !== void 0) newWeights[p] = (newWeights[p] || 0) * (1 + change / parts.length);
          });
        } else {
          const key = s.algo;
          if (newWeights[key] === void 0) return;
          if (s.action === "BOOST" || s.action === "ISOLATE") {
            newWeights[key] = (newWeights[key] || 0) * (1 + change);
          } else if (s.action === "REDUCE") {
            newWeights[key] = (newWeights[key] || 0) * (1 - change);
          }
        }
      });
      return normalizeWeights(newWeights);
    };
    applyBayesianForensicFeedback = async (drawName, report, userRating) => {
      const currentWeights = await getAlgoWeights(drawName);
      const newWeights = { ...currentWeights };
      const feedbackScore = userRating === "Visionnaire" ? 1 : userRating === "Incoh\xE9rente" ? -1 : 0;
      if (feedbackScore === 0) return currentWeights;
      const validKeys = Object.values(AlgoKey);
      const numAlgos = validKeys.length || 1;
      const baseLR = 1 / (2 * numAlgos);
      if (report.proposedAdjustments && report.proposedAdjustments.length > 0) {
        report.proposedAdjustments.forEach((adj) => {
          const key = adj.algo;
          if (!validKeys.includes(key) || newWeights[key] === void 0) return;
          const adjustment = adj.proposedWeightChange * feedbackScore * baseLR;
          newWeights[key] = newWeights[key] * (1 + Math.tanh(adjustment));
        });
      } else if (report.counterfactuals && report.counterfactuals.length > 0) {
        report.counterfactuals.forEach((cf) => {
          if (cf.algo) {
            const key = cf.algo;
            if (!validKeys.includes(key) || newWeights[key] === void 0) return;
            const change = (cf.rankImprovement || 1) / 100;
            const adjustment = change * feedbackScore * baseLR;
            newWeights[key] = newWeights[key] * (1 + Math.tanh(adjustment));
          }
        });
      }
      const finalNormalized = normalizeWeights(newWeights);
      await saveAlgoWeights(drawName, finalNormalized);
      return finalNormalized;
    };
    getCalibratedHyperparameters = async (drawName, currentEntropy) => {
      const defaultParams = {
        sigmoid_slope: 1.2 - 0.8 * currentEntropy,
        sigmoid_intercept: -0.5 - 1.5 * currentEntropy,
        boosting_multiplier: 1,
        prudence_mode_active: false
      };
      if (!isSupabaseConfigured() || !navigator.onLine) {
        return defaultParams;
      }
      try {
        const { data } = await supabase.from("model_weights_config").select("sigmoid_slope, sigmoid_intercept, boosting_multiplier, prudence_mode_active").eq("draw_name", drawName).maybeSingle();
        if (data) {
          return {
            sigmoid_slope: typeof data.sigmoid_slope === "number" ? data.sigmoid_slope : defaultParams.sigmoid_slope,
            sigmoid_intercept: typeof data.sigmoid_intercept === "number" ? data.sigmoid_intercept : defaultParams.sigmoid_intercept,
            boosting_multiplier: typeof data.boosting_multiplier === "number" ? data.boosting_multiplier : defaultParams.boosting_multiplier,
            prudence_mode_active: !!data.prudence_mode_active
          };
        }
      } catch (e) {
      }
      return defaultParams;
    };
  }
});

// utils/mathUtils.ts
var LCG_CONSTANTS, LCG, defaultLcgConfig, initializeLcgForDraw, getCanonicalDrawHistoryHash;
var init_mathUtils = __esm({
  "utils/mathUtils.ts"() {
    "use strict";
    LCG_CONSTANTS = {
      /** Multiplicateur multiplicatif du LCG standard */
      MULTIPLIER: 1664525,
      /** Incrément additif standard */
      INCREMENT: 1013904223,
      /** Seed de repli déterministe canonique (première) */
      DEFAULT_SEED: 848932,
      /** Modulo puissance de 2 de normalisation (2^32) */
      MODULO: 4294967296
    };
    LCG = class {
      seed;
      constructor(initialSeed) {
        if (typeof initialSeed === "string") {
          let hash = 2166136261;
          for (let i = 0; i < initialSeed.length; i++) {
            hash ^= initialSeed.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
          }
          this.seed = (hash >>> 0) % 2147483647;
          if (this.seed === 0) {
            this.seed = 1;
          }
        } else {
          const parsed = Number(initialSeed);
          this.seed = isNaN(parsed) || parsed === 0 ? 1 : Math.abs(parsed) % 2147483647;
          if (this.seed === 0) {
            this.seed = 1;
          }
        }
      }
      /**
       * Génère le prochain nombre pseudo-aléatoire déterministe dans l'intervalle [0, 1[.
       */
      next() {
        this.seed = this.seed * 48271 % 2147483647;
        return (this.seed - 1) / 2147483646;
      }
    };
    defaultLcgConfig = new LCG(LCG_CONSTANTS.DEFAULT_SEED);
    initializeLcgForDraw = (drawName) => {
      defaultLcgConfig = new LCG(drawName);
    };
    getCanonicalDrawHistoryHash = (drawName, history) => {
      const cleanDraw = drawName.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      let signatureStr = `${cleanDraw}_len:${history.length}`;
      for (let i = 0; i < Math.min(25, history.length); i++) {
        const d = history[i];
        const gStr = Array.isArray(d?.gagnants) ? d.gagnants.join(",") : "";
        signatureStr += `|${d?.date || i}:${gStr}`;
      }
      let h1 = 2166136261, h2 = 305419896, h3 = 2882400001, h4 = 1985229328;
      const fnvPrime32 = 16777619, altPrime32 = 10995116;
      for (let i = 0; i < signatureStr.length; i++) {
        const char = signatureStr.charCodeAt(i);
        h1 = Math.imul(h1 ^ char, fnvPrime32);
        h2 = Math.imul(h2 ^ char, altPrime32);
        h3 = Math.imul(h3 ^ char, fnvPrime32) + h1;
        h4 = Math.imul(h4 ^ char, altPrime32) + h2;
      }
      const toHex8 = (num) => (num >>> 0).toString(16).padStart(8, "0");
      return `${cleanDraw}_${history.length}_${toHex8(h1)}${toHex8(h2)}`;
    };
  }
});

// services/cache/CacheService.ts
var CACHE_CONFIG, CACHE_TTL, getDynamicMemoryCacheLimit, CACHE_FLAGS, CacheService, globalCache;
var init_CacheService = __esm({
  "services/cache/CacheService.ts"() {
    "use strict";
    init_dist();
    init_mathUtils();
    CACHE_CONFIG = {
      SHORT_TTL: 5 * 60 * 1e3,
      // 5 minutes : données volatiles temps réel (pings, états actifs)
      MEDIUM_TTL: 60 * 60 * 1e3,
      // 1 heure : statistiques et scores intermédiaires calculés
      LONG_TTL: 24 * 60 * 60 * 1e3,
      // 24 heures : poids d'algorithmes et configurations globales stables
      HISTORY_TTL: 24 * 60 * 60 * 1e3
      // 24 heures : historiques officiels de tirages (stables hors ligne)
    };
    CACHE_TTL = {
      SHORT: CACHE_CONFIG.SHORT_TTL,
      MEDIUM: CACHE_CONFIG.MEDIUM_TTL,
      LONG: CACHE_CONFIG.LONG_TTL,
      HISTORY: CACHE_CONFIG.HISTORY_TTL
    };
    getDynamicMemoryCacheLimit = () => {
      const BASE_LIMIT = 50;
      if (typeof navigator === "undefined" || !("deviceMemory" in navigator)) {
        return BASE_LIMIT * 3;
      }
      const memoryGb = navigator.deviceMemory || 4;
      return Math.round(BASE_LIMIT * Math.log(memoryGb + 1)) + BASE_LIMIT;
    };
    CACHE_FLAGS = {
      ENABLE_MEMORY: true,
      ENABLE_IDB: typeof indexedDB !== "undefined",
      ENABLE_SUPABASE: false
      // Cache partagé désactivé par défaut
    };
    CacheService = class {
      memoryCache = /* @__PURE__ */ new Map();
      recentDrawCounts = /* @__PURE__ */ new Map();
      /**
       * Génère une clé de cache déterministe et structurée.
       */
      generateKey(domain, identifier, subKey) {
        return `nexus_${domain}_${identifier}${subKey ? `_${subKey}` : ""}`;
      }
      /**
       * Génère une clé de cache déterministe isolée par la signature canonique de l'historique propre du tirage.
       * Empêche toute pollution ou croisement de données inter-tirages.
       */
      generateCanonicalDrawKey(domain, drawName, history, subKey) {
        const canonicalHash = getCanonicalDrawHistoryHash(drawName, history);
        return `nexus_${domain}_${canonicalHash}${subKey ? `_${subKey}` : ""}`;
      }
      /**
       * Enregistre un élément dans le cache à double niveau (Mémoire + IDB).
       */
      async set(key, data, ttlMs, drawName) {
        const entry = {
          data,
          expiry: Date.now() + ttlMs
        };
        if (drawName && this.recentDrawCounts.has(drawName)) {
          entry.drawCountRef = this.recentDrawCounts.get(drawName);
        }
        if (CACHE_FLAGS.ENABLE_MEMORY) {
          const dynamicLimit = getDynamicMemoryCacheLimit();
          if (this.memoryCache.size >= dynamicLimit) {
            const oldestKey = this.memoryCache.keys().next().value;
            if (oldestKey) {
              this.memoryCache.delete(oldestKey);
            }
          }
          this.memoryCache.set(key, entry);
        }
        if (CACHE_FLAGS.ENABLE_IDB) {
          try {
            await set(key, entry);
          } catch (e) {
            console.warn(`[CacheService] Failed to set IDB key ${key}`, e);
          }
        }
      }
      /**
       * Récupère un élément depuis les caches hiérarchisés.
       */
      async get(key, drawName) {
        if (CACHE_FLAGS.ENABLE_MEMORY && this.memoryCache.has(key)) {
          const entry = this.memoryCache.get(key);
          if (this.isValid(entry, drawName)) {
            return entry.data;
          } else {
            this.memoryCache.delete(key);
          }
        }
        if (CACHE_FLAGS.ENABLE_IDB) {
          try {
            const idbEntry = await get(key);
            if (idbEntry && this.isValid(idbEntry, drawName)) {
              if (CACHE_FLAGS.ENABLE_MEMORY) this.memoryCache.set(key, idbEntry);
              return idbEntry.data;
            } else if (idbEntry) {
              await del(key);
            }
          } catch (e) {
            console.warn(`[CacheService] Failed to fetch IDB key ${key}`, e);
          }
        }
        return null;
      }
      /**
       * Invalide les caches d'un domaine ou d'un préfixe particulier.
       */
      async invalidateByPrefix(prefix) {
        for (const key of this.memoryCache.keys()) {
          if (key.startsWith(prefix)) {
            this.memoryCache.delete(key);
          }
        }
        if (CACHE_FLAGS.ENABLE_IDB) {
          try {
            const allKeys = await keys();
            const keysToDelete = allKeys.filter(
              (k) => typeof k === "string" && k.startsWith(prefix)
            );
            if (keysToDelete.length > 0) {
              Promise.resolve().then(() => (init_dist(), dist_exports)).then(({ delMany: delMany2 }) => {
                delMany2(keysToDelete).catch((e) => console.warn(e));
              });
            }
          } catch (e) {
            console.warn(
              `[CacheService] Prefix invalidation failed for ${prefix}`,
              e
            );
          }
        }
      }
      /**
       * Enregistre l'arrivée d'un nouveau tirage pour invalider à la volée le cache dépendant.
       */
      async registerNewDraw(drawName, newTotalCount) {
        const oldCount = this.recentDrawCounts.get(drawName) || 0;
        if (newTotalCount > oldCount) {
          this.recentDrawCounts.set(drawName, newTotalCount);
          console.log(
            `[CacheService] New draw registered for ${drawName} (Count: ${newTotalCount}). Dependent caches will auto-invalidate on access.`
          );
        }
      }
      /**
       * Encapsule le calcul d'une fonction avec mise en cache transparente.
       */
      async getOrCompute(key, computeFn, ttlMs = CACHE_TTL.MEDIUM, drawName) {
        const cached = await this.get(key, drawName);
        if (cached !== null) return cached;
        const freshData = await computeFn();
        await this.set(key, freshData, ttlMs, drawName);
        return freshData;
      }
      /**
       * Analyse de validité (Périssabilité temporelle et cohérence du nombre de tirages)
       */
      isValid(entry, drawName) {
        if (Date.now() > entry.expiry) return false;
        if (drawName && entry.drawCountRef !== void 0) {
          const currentCount = this.recentDrawCounts.get(drawName);
          if (currentCount !== void 0 && entry.drawCountRef < currentCount) {
            return false;
          }
        }
        return true;
      }
      async clearAll() {
        this.memoryCache.clear();
        if (CACHE_FLAGS.ENABLE_IDB) {
          await clear();
        }
      }
      async delete(key) {
        this.memoryCache.delete(key);
        if (CACHE_FLAGS.ENABLE_IDB) {
          try {
            await del(key);
          } catch (e) {
            console.warn(`[CacheService] Failed to delete IDB key ${key}`, e);
          }
        }
      }
      /**
       * Collecteur de déchets du cache (Garbage Collection)
       */
      async runGarbageCollection() {
        let clearedCount = 0;
        for (const [key, entry] of this.memoryCache.entries()) {
          if (!this.isValid(entry)) {
            this.memoryCache.delete(key);
            clearedCount++;
          }
        }
        if (CACHE_FLAGS.ENABLE_IDB) {
          try {
            const allKeys = await keys();
            const stringKeys = allKeys.filter((k) => typeof k === "string");
            if (stringKeys.length > 0) {
              const { getMany: getMany2, delMany: delMany2 } = await Promise.resolve().then(() => (init_dist(), dist_exports));
              const values2 = await getMany2(stringKeys);
              const keysToDelete = [];
              for (let i = 0; i < values2.length; i++) {
                const entry = values2[i];
                if (entry && !this.isValid(entry)) {
                  keysToDelete.push(stringKeys[i]);
                }
              }
              if (keysToDelete.length > 0) {
                await delMany2(keysToDelete);
                clearedCount += keysToDelete.length;
              }
            }
          } catch (e) {
            console.warn("[CacheService] GC Error on IDB:", e);
          }
        }
        console.log(
          `[CacheService] Garbage Collection complete. Cleared ${clearedCount} stale entries.`
        );
        return clearedCount;
      }
      /**
       * Permet la récupération groupée par domaine (comportement de table relationnelle locale)
       */
      async getByDomain(domain) {
        const prefix = `nexus_${domain}_`;
        const results = [];
        for (const [key, entry] of this.memoryCache.entries()) {
          if (key.startsWith(prefix) && this.isValid(entry)) {
            results.push(entry.data);
          } else if (key.startsWith(prefix)) {
            this.memoryCache.delete(key);
          }
        }
        if (CACHE_FLAGS.ENABLE_IDB) {
          try {
            const allKeys = await keys();
            const domainKeys = allKeys.filter(
              (k) => typeof k === "string" && k.startsWith(prefix)
            );
            const keysToFetch = domainKeys.filter((k) => !this.memoryCache.has(k));
            if (keysToFetch.length > 0) {
              const { getMany: getMany2, delMany: delMany2 } = await Promise.resolve().then(() => (init_dist(), dist_exports));
              const values2 = await getMany2(keysToFetch);
              const keysToDelete = [];
              for (let i = 0; i < values2.length; i++) {
                const entry = values2[i];
                if (entry && this.isValid(entry)) {
                  if (CACHE_FLAGS.ENABLE_MEMORY) this.memoryCache.set(keysToFetch[i], entry);
                  results.push(entry.data);
                } else if (entry) {
                  keysToDelete.push(keysToFetch[i]);
                }
              }
              if (keysToDelete.length > 0) {
                await delMany2(keysToDelete);
              }
            }
          } catch (e) {
            console.warn(
              `[CacheService] Failed retrieving domain ${domain} from IDB`,
              e
            );
          }
        }
        return results;
      }
    };
    globalCache = new CacheService();
  }
});

// utils/AppError.ts
var AppError;
var init_AppError = __esm({
  "utils/AppError.ts"() {
    "use strict";
    AppError = class _AppError extends Error {
      code;
      severity;
      context;
      constructor(message, code = "UNKNOWN_ERROR", severity = "medium", context) {
        super(message);
        this.name = "AppError";
        this.code = code;
        this.severity = severity;
        this.context = context;
        if (Error.captureStackTrace) {
          Error.captureStackTrace(this, _AppError);
        }
      }
    };
  }
});

// services/prediction/apiClientStub.ts
var apiClient;
var init_apiClientStub = __esm({
  "services/prediction/apiClientStub.ts"() {
    apiClient = {
      post: async () => ({})
    };
  }
});

// services/mathCore.ts
var mathCore_exports = {};
__export(mathCore_exports, {
  calculateACValue: () => calculateACValue,
  calculateBenfordCompliance: () => calculateBenfordCompliance,
  calculateChiSquare: () => calculateChiSquare,
  calculateKolmogorovSmirnov: () => calculateKolmogorovSmirnov,
  calculateLjungBoxTest: () => calculateLjungBoxTest,
  calculateShannonEntropy: () => calculateShannonEntropy,
  calculateTsallisEntropy: () => calculateTsallisEntropy,
  computeContinuousWaveletTransform: () => computeContinuousWaveletTransform,
  computeDFT: () => computeDFT,
  computeDaubechiesWaveletEnergy: () => computeDaubechiesWaveletEnergy,
  computeEigenDecomposition: () => computeEigenDecomposition,
  computeHaarWaveletEnergy: () => computeHaarWaveletEnergy,
  computeRobustHurst: () => computeRobustHurst,
  computeSVD: () => computeSVD,
  computeSVDResonance: () => computeSVDResonance,
  computeTransferEntropy: () => computeTransferEntropy,
  computeWassersteinDistance: () => computeWassersteinDistance,
  decomposeDWT: () => decomposeDWT,
  denoiseFeaturesKernelPCA: () => denoiseFeaturesKernelPCA,
  denoiseFeaturesPCA: () => denoiseFeaturesPCA,
  denoiseSignalWavelet: () => denoiseSignalWavelet,
  dwt1D: () => dwt1D,
  idwt1D: () => idwt1D,
  invertMatrix: () => invertMatrix,
  matAdd: () => matAdd,
  matMul: () => matMul,
  matSub: () => matSub,
  mean: () => mean,
  reconstructDWT: () => reconstructDWT,
  runContinuousWaveletTransformAnalysis: () => runContinuousWaveletTransformAnalysis,
  runFractal: () => runFractal,
  runGapEfficiency: () => runGapEfficiency,
  runSpectral: () => runSpectral,
  scalarMul: () => scalarMul,
  stdDev: () => stdDev,
  trainRidgeRegression: () => trainRidgeRegression,
  transpose: () => transpose,
  vecNorm: () => vecNorm
});
function computeDFT(signal) {
  const originalN = signal.length;
  if (originalN < 4) {
    const spectrum2 = [];
    for (let k = 1; k < originalN / 2; k++) {
      let re = 0;
      let im = 0;
      for (let n = 0; n < originalN; n++) {
        const angle = 2 * Math.PI * k * n / originalN;
        re += signal[n] * Math.cos(angle);
        im -= signal[n] * Math.sin(angle);
      }
      spectrum2.push({ frequency: k, power: Math.sqrt(re * re + im * im), period: originalN / k });
    }
    return spectrum2;
  }
  let N = 1;
  while (N < originalN) {
    N *= 2;
  }
  const rex = new Float64Array(N);
  const imx = new Float64Array(N);
  for (let n = 0; n < originalN; n++) {
    const window2 = 0.5 * (1 - Math.cos(2 * Math.PI * n / (originalN - 1)));
    rex[n] = signal[n] * window2;
  }
  let j = 0;
  for (let i = 0; i < N - 1; i++) {
    if (i < j) {
      const temp = rex[i];
      rex[i] = rex[j];
      rex[j] = temp;
    }
    let k = N / 2;
    while (k <= j) {
      j -= k;
      k /= 2;
    }
    j += k;
  }
  for (let stage = 1; stage <= Math.log2(N); stage++) {
    const le = 1 << stage;
    const le2 = le >> 1;
    let ur = 1;
    let ui = 0;
    const sr = Math.cos(Math.PI / le2);
    const si = -Math.sin(Math.PI / le2);
    for (let s = 0; s < le2; s++) {
      for (let i = s; i < N; i += le) {
        const ip = i + le2;
        const tempRe = rex[ip] * ur - imx[ip] * ui;
        const tempIm = rex[ip] * ui + imx[ip] * ur;
        rex[ip] = rex[i] - tempRe;
        imx[ip] = imx[i] - tempIm;
        rex[i] += tempRe;
        imx[i] += tempIm;
      }
      const tempUr = ur * sr - ui * si;
      ui = ur * si + ui * sr;
      ur = tempUr;
    }
  }
  const spectrum = [];
  for (let k = 1; k < originalN / 2; k++) {
    const ratio = k / originalN;
    const indexInFFT = Math.round(ratio * N);
    const safeIndex = Math.min(N - 1, Math.max(0, indexInFFT));
    const magnitude = Math.sqrt(rex[safeIndex] * rex[safeIndex] + imx[safeIndex] * imx[safeIndex]);
    spectrum.push({ frequency: k, power: magnitude, period: originalN / k });
  }
  return spectrum;
}
function computeDaubechiesWaveletEnergy(signal) {
  const N = signal.length;
  if (N < 4) return computeHaarWaveletEnergy(signal);
  const s3 = Math.sqrt(3);
  const s2 = Math.sqrt(2);
  const h0 = (1 + s3) / (4 * s2);
  const h1 = (3 + s3) / (4 * s2);
  const h2 = (3 - s3) / (4 * s2);
  const h3 = (1 - s3) / (4 * s2);
  const g0 = Math.abs(h3);
  const g1 = -Math.abs(h2);
  const g2 = Math.abs(h1);
  const g3 = -Math.abs(h0);
  let energy = 0;
  const half = Math.floor(N / 2);
  for (let i = 0; i < half; i++) {
    const p0 = signal[2 * i % N];
    const p1 = signal[(2 * i + 1) % N];
    const p2 = signal[(2 * i + 2) % N];
    const p3 = signal[(2 * i + 3) % N];
    const detail = p0 * g0 + p1 * g1 + p2 * g2 + p3 * g3;
    energy += Math.pow(detail, 2);
  }
  return energy;
}
function computeHaarWaveletEnergy(signal) {
  const vals = [...signal];
  if (vals.length % 2 !== 0) vals.pop();
  let energy = 0;
  for (let i = 0; i < vals.length; i += 2) {
    const detail = (vals[i] - vals[i + 1]) / Math.sqrt(2);
    energy += Math.pow(detail, 2);
  }
  return energy;
}
function computeRobustHurst(signal) {
  const N = signal.length;
  if (N < 10) return 0.5;
  const meanVal = mean(signal);
  let totalVar = 0;
  const diffs = [];
  for (let i = 0; i < N; i++) {
    const diff = signal[i] - meanVal;
    totalVar += diff * diff;
    if (i > 0) diffs.push(Math.abs(signal[i] - signal[i - 1]));
  }
  const globalStd = Math.sqrt(totalVar / N) || 1e-6;
  const localVol = diffs.length > 0 ? mean(diffs) / (globalStd + 1e-6) : 1;
  const minWin = Math.max(4, Math.floor(4 * Math.exp(-0.15 * localVol)));
  const maxWin = Math.min(Math.floor(N / 2), Math.max(minWin + 2, Math.floor(N * 0.75 * Math.tanh(1 + 0.2 * localVol))));
  const numScales = 5;
  const windowSizes = [];
  if (maxWin > minWin) {
    for (let s = 0; s < numScales; s++) {
      const frac = s / (numScales - 1);
      const wSize = Math.floor(minWin * Math.pow(maxWin / minWin, frac));
      if (wSize >= 4 && !windowSizes.includes(wSize)) {
        windowSizes.push(wSize);
      }
    }
  }
  if (windowSizes.length < 2) {
    windowSizes.length = 0;
    const w1 = Math.max(4, Math.floor(N / 2));
    const w2 = Math.max(4, Math.floor(N / 4));
    if (w1 >= 4) windowSizes.push(w1);
    if (w2 >= 4 && w2 !== w1) windowSizes.push(w2);
  }
  const logRs = [];
  const logSizes = [];
  for (const wSize of windowSizes) {
    const chunksCount = Math.floor(N / wSize);
    if (chunksCount < 1) continue;
    let totalRS = 0;
    for (let i = 0; i < chunksCount; i++) {
      const chunk = signal.slice(i * wSize, (i + 1) * wSize);
      const m = mean(chunk);
      const y = chunk.map((v) => v - m);
      let sum = 0;
      const z = y.map((v) => {
        sum += v;
        return sum;
      });
      const R = Math.max(...z) - Math.min(...z);
      const S = stdDev(chunk) || 1e-6;
      totalRS += R / S;
    }
    const avgRS = totalRS / chunksCount;
    if (avgRS > 0) {
      logRs.push(Math.log(avgRS));
      logSizes.push(Math.log(wSize));
    }
  }
  if (logRs.length < 2) return 0.5;
  const mX = mean(logSizes);
  const mY = mean(logRs);
  let num = 0, den = 0;
  for (let i = 0; i < logRs.length; i++) {
    num += (logSizes[i] - mX) * (logRs[i] - mY);
    den += Math.pow(logSizes[i] - mX, 2);
  }
  return den !== 0 ? Math.max(0.01, Math.min(0.99, num / den)) : 0.5;
}
function computeEigenDecomposition(matrix) {
  const n = matrix.length;
  let A = matrix.map((row) => [...row]);
  const eigenValues = [];
  const eigenVectors = Array(n).fill(0).map(() => Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    const PHI = 1.618033988749895;
    let v = Array(n).fill(0).map((_, idx) => [Math.cos((i * n + idx) * Math.PI * PHI)]);
    let norm = vecNorm(v);
    if (norm === 0) {
      v[0][0] = 1;
      norm = 1;
    }
    v = scalarMul(v, 1 / norm);
    let lastV = v.map((row) => [...row]);
    for (let iter = 0; iter < 40; iter++) {
      const Av2 = matMul(A, v);
      norm = vecNorm(Av2);
      if (norm < 1e-9) break;
      v = scalarMul(Av2, 1 / norm);
      let diff = 0;
      for (let k = 0; k < n; k++) diff += Math.pow(v[k][0] - lastV[k][0], 2);
      if (Math.sqrt(diff) < 1e-6) break;
      lastV = v.map((row) => [...row]);
    }
    const Av = matMul(A, v);
    const eigenvalue = matMul(transpose(v), Av)[0][0];
    eigenValues.push(eigenvalue);
    for (let k = 0; k < n; k++) eigenVectors[k][i] = v[k][0];
    const vvT = matMul(v, transpose(v));
    const deflation = scalarMul(vvT, eigenvalue);
    A = matSub(A, deflation);
  }
  return { values: eigenValues, vectors: eigenVectors };
}
function computeSVD(matrix, r) {
  const N = matrix.length;
  if (N === 0) return { u: [], s: [], v: [] };
  const M = matrix[0].length;
  const dynamicRank = r ?? Math.min(Math.floor(Math.sqrt(Math.min(N, M))) + 1, 5);
  const numComponents = Math.min(dynamicRank, N, M);
  let A = matrix.map((row) => [...row]);
  const U = Array(N).fill(0).map(() => Array(numComponents).fill(0));
  const S = Array(numComponents).fill(0);
  const V = Array(M).fill(0).map(() => Array(numComponents).fill(0));
  for (let k = 0; k < numComponents; k++) {
    let v = Array(M).fill(0);
    let normV = 0;
    for (let j = 0; j < M; j++) {
      v[j] = Math.cos((k * M + j) * Math.PI * Math.E);
      normV += v[j] * v[j];
    }
    normV = Math.sqrt(normV);
    if (normV === 0) {
      v[0] = 1;
      normV = 1;
    }
    for (let j = 0; j < M; j++) v[j] /= normV;
    let u = Array(N).fill(0);
    for (let iter = 0; iter < 40; iter++) {
      for (let i = 0; i < N; i++) {
        let sum = 0;
        for (let j = 0; j < M; j++) {
          sum += A[i][j] * v[j];
        }
        u[i] = sum;
      }
      let normU = 0;
      for (let i = 0; i < N; i++) normU += u[i] * u[i];
      normU = Math.sqrt(normU);
      if (normU < 1e-9) break;
      for (let i = 0; i < N; i++) u[i] /= normU;
      let vNew = Array(M).fill(0);
      for (let j = 0; j < M; j++) {
        let sum = 0;
        for (let i = 0; i < N; i++) {
          sum += A[i][j] * u[i];
        }
        vNew[j] = sum;
      }
      let normVNew = 0;
      for (let j = 0; j < M; j++) normVNew += vNew[j] * vNew[j];
      normVNew = Math.sqrt(normVNew);
      if (normVNew < 1e-9) break;
      for (let j = 0; j < M; j++) vNew[j] /= normVNew;
      let diff = 0;
      for (let j = 0; j < M; j++) {
        diff += Math.pow(vNew[j] - v[j], 2);
      }
      const isConverged = Math.sqrt(diff) < 1e-6;
      v = vNew;
      if (isConverged) break;
    }
    let Av = Array(N).fill(0);
    for (let i = 0; i < N; i++) {
      let sum = 0;
      for (let j = 0; j < M; j++) sum += A[i][j] * v[j];
      Av[i] = sum;
    }
    let sumAv2 = 0;
    for (let i = 0; i < N; i++) sumAv2 += Av[i] * Av[i];
    const sigma = Math.sqrt(sumAv2);
    S[k] = sigma;
    for (let i = 0; i < N; i++) U[i][k] = u[i];
    for (let j = 0; j < M; j++) V[j][k] = v[j];
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < M; j++) {
        A[i][j] -= sigma * u[i] * v[j];
      }
    }
  }
  return { u: U, s: S, v: V };
}
function computeSVDResonance(history, N, M = 90) {
  const data = history.slice(0, N);
  const H = Array(N).fill(0).map(() => Array(M).fill(0));
  const columnMeans = Array(M).fill(0);
  for (let i = 0; i < N; i++) {
    const d = data[i];
    for (let j = 0; j < M; j++) {
      const ball = j + 1;
      const val = d.gagnants.includes(ball) ? 1 : -1;
      H[i][j] = val;
      columnMeans[j] += val;
    }
  }
  for (let j = 0; j < M; j++) {
    columnMeans[j] /= N;
    for (let i = 0; i < N; i++) {
      H[i][j] -= columnMeans[j];
    }
  }
  const svd = computeSVD(H);
  const globalResonance = new Float64Array(Math.floor(N / 2) + 1);
  let maxResonanceVal = 0;
  let sumPeriodWeighted = 0;
  let sumWeight = 0;
  if (svd.s && svd.s.length > 0) {
    for (let kRank = 0; kRank < svd.s.length; kRank++) {
      const singularValue = svd.s[kRank];
      if (singularValue < 1e-5) continue;
      const uCol = svd.u.map((row) => row[kRank]);
      const spectrum = computeDFT(uCol);
      let maxModePower = 0;
      let modeDominantPeriod = 12;
      spectrum.forEach((s) => {
        if (s.frequency < globalResonance.length) {
          globalResonance[s.frequency] += singularValue * s.power;
        }
        if (s.power > maxModePower) {
          maxModePower = s.power;
          modeDominantPeriod = s.period;
        }
      });
      const modeWeight = singularValue * maxModePower;
      sumPeriodWeighted += modeDominantPeriod * modeWeight;
      sumWeight += modeWeight;
    }
  }
  for (let k = 0; k < globalResonance.length; k++) {
    if (globalResonance[k] > maxResonanceVal) {
      maxResonanceVal = globalResonance[k];
    }
  }
  if (maxResonanceVal > 0) {
    for (let k = 0; k < globalResonance.length; k++) {
      globalResonance[k] /= maxResonanceVal;
    }
  }
  const dominantPeriod = sumWeight > 0 ? sumPeriodWeighted / sumWeight : 12;
  return { globalResonance, dominantPeriod };
}
function denoiseFeaturesPCA(data, varianceThreshold) {
  if (!data || data.length === 0) return [];
  const nSamples = data.length;
  const nFeatures = data[0].length;
  const means = new Float64Array(nFeatures);
  const stdDevs = new Float64Array(nFeatures);
  for (let i = 0; i < nSamples; i++) {
    for (let j = 0; j < nFeatures; j++) means[j] += data[i][j];
  }
  for (let j = 0; j < nFeatures; j++) means[j] /= nSamples;
  for (let i = 0; i < nSamples; i++) {
    for (let j = 0; j < nFeatures; j++) stdDevs[j] += Math.pow(data[i][j] - means[j], 2);
  }
  for (let j = 0; j < nFeatures; j++) {
    stdDevs[j] = Math.sqrt(stdDevs[j] / (nSamples - 1)) || 1;
  }
  const scaledData = data.map((row) => row.map((val, j) => (val - means[j]) / stdDevs[j]));
  const covariance = scalarMul(matMul(transpose(scaledData), scaledData), 1 / (nSamples - 1));
  const { values: values2, vectors } = computeEigenDecomposition(covariance);
  const totalVariance = values2.reduce((a, b) => a + Math.abs(b), 0);
  const dynamicThreshold = varianceThreshold ?? 1 - 1 / Math.sqrt(nFeatures);
  let k = 1;
  let currentVar = 0;
  for (let i = 0; i < nFeatures; i++) {
    currentVar += Math.abs(values2[i]);
    if (totalVariance > 0 && currentVar / totalVariance >= dynamicThreshold) {
      k = i + 1;
      break;
    }
  }
  const topKVectors = vectors.map((row) => row.slice(0, k));
  const projected = matMul(scaledData, topKVectors);
  const reconstructedScaled = matMul(projected, transpose(topKVectors));
  const reconstructed = reconstructedScaled.map(
    (row, i) => row.map((val, j) => val * stdDevs[j] + means[j])
  );
  return reconstructed;
}
function trainRidgeRegression(features, labels, lambda, initialLearningRate) {
  if (!features || features.length === 0 || features.length !== labels.length) return [];
  const nFeatures = features[0].length;
  const nSamples = features.length;
  let weights = new Float64Array(nFeatures);
  const optimalLambda = lambda ?? 1 / Math.sqrt(nSamples);
  const optimalLR = initialLearningRate ?? 1 / Math.sqrt(nFeatures);
  const gSum = new Float64Array(nFeatures);
  const epsilon = 1e-8;
  for (let iter = 0; iter < 200; iter++) {
    const gradients = new Float64Array(nFeatures);
    let maxGradient = 0;
    for (let i = 0; i < nSamples; i++) {
      let pred = 0;
      for (let j = 0; j < nFeatures; j++) pred += features[i][j] * weights[j];
      const error = pred - labels[i];
      for (let j = 0; j < nFeatures; j++) gradients[j] += 2 / nSamples * error * features[i][j];
    }
    for (let j = 0; j < nFeatures; j++) {
      gradients[j] += 2 * optimalLambda * weights[j];
      gSum[j] += gradients[j] * gradients[j];
      const adaptiveRate = optimalLR / (Math.sqrt(gSum[j]) + epsilon);
      weights[j] -= adaptiveRate * gradients[j];
      if (Math.abs(gradients[j]) > maxGradient) maxGradient = Math.abs(gradients[j]);
    }
    if (maxGradient < 1e-4) break;
  }
  return Array.from(weights);
}
function runGapEfficiency(history) {
  if (!history || history.length === 0) return [];
  const efficiencies = [];
  const hurst = computeRobustHurst(history.map((h) => h.gagnants.length));
  const dynamicDepth = Math.min(history.length, Math.ceil(100 / (1 - Math.max(0.1, hurst - 0.4))));
  const subHistory = history.slice(0, dynamicDepth);
  const draws = subHistory.map((h) => new Set(h.gagnants));
  for (let num = 1; num <= 90; num++) {
    const gaps = [];
    let currentCounter = 0;
    let isFirst = true;
    let currentGap = 0;
    for (const drawSet of draws) {
      if (drawSet.has(num)) {
        if (isFirst) {
          currentGap = currentCounter;
          isFirst = false;
        } else {
          gaps.push(currentCounter);
        }
        currentCounter = 0;
      } else {
        currentCounter++;
      }
    }
    if (isFirst) currentGap = currentCounter;
    let maxGap = currentGap;
    let avgGap = 0;
    let sigma = 1;
    let kaplanMeierProb = 0;
    let hazardRate = 0;
    let kmVariance = 1e4;
    if (gaps.length > 0) {
      maxGap = Math.max(Math.max(...gaps), currentGap);
      let sum = 0;
      for (let g of gaps) sum += g;
      avgGap = sum / gaps.length;
      let sumSq = 0;
      for (let g of gaps) sumSq += (g - avgGap) ** 2;
      sigma = Math.sqrt(sumSq / gaps.length) || 1;
      const gapFreq = /* @__PURE__ */ new Map();
      gaps.forEach((g) => gapFreq.set(g, (gapFreq.get(g) || 0) + 1));
      const uniqueGaps = Array.from(gapFreq.keys()).sort((a, b) => a - b);
      let nRisk = gaps.length;
      let S_t = 1;
      let S_current = 1;
      let greenwoodSum = 0;
      for (const t of uniqueGaps) {
        if (t > currentGap) break;
        const d_t = gapFreq.get(t) || 0;
        if (nRisk > 0) {
          const hazard_t = d_t / nRisk;
          S_t = S_t * (1 - hazard_t);
          if (t === currentGap) {
            hazardRate = hazard_t;
          }
          if (nRisk > d_t) {
            greenwoodSum += d_t / (nRisk * (nRisk - d_t));
          }
        }
        nRisk -= d_t;
      }
      S_current = S_t;
      kaplanMeierProb = (1 - S_current) * 100;
      kmVariance = Math.pow(S_current, 2) * greenwoodSum * 1e4;
      if (kmVariance <= 1e-4) {
        kmVariance = 1;
      }
    }
    const zScore = (currentGap - avgGap) / sigma;
    const zScoreProb = 1 / (1 + Math.exp(-0.5 * zScore)) * 100;
    let zScoreVariance = 1e4 / Math.max(1, gaps.length);
    const w_km_raw = 1 / kmVariance;
    const w_z_raw = 1 / zScoreVariance;
    const totalW = w_km_raw + w_z_raw;
    const weightKM = w_km_raw / totalW;
    const weightZ = w_z_raw / totalW;
    const breakoutProb = weightZ * zScoreProb + weightKM * kaplanMeierProb;
    const fatigueIndex = avgGap > 0 ? maxGap / avgGap : 1;
    const positionScore = maxGap > 0 ? currentGap / maxGap * 100 : 0;
    const pressureScore = Math.min(100, Math.max(0, (zScore + 1) * 33));
    const w_pos = 1 / 3, w_pres = 1 / 3, w_km_score = 1 / 3;
    const maturityScore = Math.round(positionScore * w_pos + pressureScore * w_pres + kaplanMeierProb * w_km_score);
    let zone = "COLD";
    if (zScore > 2.5 || maturityScore > 90 || kaplanMeierProb > 95) zone = "CRITICAL";
    else if (zScore > 1 || maturityScore > 70 || kaplanMeierProb > 80) zone = "HOT";
    else if (zScore > 0 || maturityScore > 40) zone = "WARMING";
    efficiencies.push({
      number: num,
      currentGap,
      maxGap,
      avgGap,
      probabilityAtCurrentGap: Math.round(breakoutProb),
      maturityScore,
      zone,
      zScore,
      fatigueIndex,
      breakoutProb,
      kaplanMeierProb: Number(kaplanMeierProb.toFixed(1)),
      hazardRate: Number((hazardRate * 100).toFixed(1))
    });
  }
  return efficiencies.sort((a, b) => b.kaplanMeierProb - a.kaplanMeierProb);
}
function runSpectral(history) {
  const N = Math.min(history.length, 128);
  if (N < 10) {
    return Array.from({ length: 90 }, (_, i) => ({
      number: i + 1,
      energy: 50,
      resonance: false,
      dominantPeriod: 12
    }));
  }
  const data = history.slice(0, N);
  const { globalResonance, dominantPeriod } = computeSVDResonance(history, N, 90);
  const results = [];
  let globalMax = 0;
  for (let num = 1; num <= 90; num++) {
    const signal = data.map((d) => d.gagnants.includes(num) ? 1 : -1);
    const spectrum = computeDFT(signal);
    let maxP = 0;
    spectrum.forEach((s) => {
      const resFactor = s.frequency < globalResonance.length ? globalResonance[s.frequency] : 0;
      const adjustedPower = s.power * (1 + resFactor);
      if (adjustedPower > maxP) maxP = adjustedPower;
    });
    let nullMaxSum = 0;
    let lcgSeed = num * 12345 + N >>> 0;
    const lcg = () => {
      lcgSeed = lcgSeed * 1664525 + 1013904223 >>> 0;
      return lcgSeed / 4294967296;
    };
    const permutationsCount = 5;
    for (let pIdx = 0; pIdx < permutationsCount; pIdx++) {
      const permutedSignal = [...signal];
      for (let i = permutedSignal.length - 1; i > 0; i--) {
        const j = Math.floor(lcg() * (i + 1));
        const temp = permutedSignal[i];
        permutedSignal[i] = permutedSignal[j];
        permutedSignal[j] = temp;
      }
      const nullSpectrum = computeDFT(permutedSignal);
      let nullMax = 0;
      nullSpectrum.forEach((ns) => {
        if (ns.power > nullMax) nullMax = ns.power;
      });
      nullMaxSum += nullMax;
    }
    const nullThreshold = nullMaxSum / permutationsCount;
    const signalToNoiseRatio = maxP / Math.max(1e-6, nullThreshold);
    const significanceMultiplier = 1 / (1 + Math.exp(-4 * (signalToNoiseRatio - 1.1)));
    const finalMaxP = maxP * significanceMultiplier;
    if (finalMaxP > globalMax) globalMax = finalMaxP;
    results.push({ number: num, raw: finalMaxP });
  }
  return results.map((r) => ({
    number: r.number,
    energy: Math.round(r.raw / (globalMax || 1) * 100),
    resonance: r.raw / (globalMax || 1) > 0.8,
    dominantPeriod: Number(dominantPeriod.toFixed(2))
  })).sort((a, b) => b.energy - a.energy);
}
function runFractal(history) {
  const data = history.slice(0, 250);
  const results = [];
  for (let num = 1; num <= 90; num++) {
    const signal = data.map((d) => d.gagnants.includes(num) ? 1 : 0);
    const h = computeRobustHurst(signal);
    results.push({
      number: num,
      hurst: parseFloat(h.toFixed(3)),
      regime: h > 0.6 ? "PERSISTANT" : h < 0.4 ? "ANTI-PERSISTANT" : "RANDOM"
    });
  }
  return results;
}
async function computeTransferEntropy(history, targetNumbers) {
  const N = Math.min(history.length, 500);
  const noiseFloor = 1 / Math.log2(N || 2);
  const data = history.slice(0, N);
  const occurrences = Array(91).fill(0).map(() => new Uint8Array(N));
  for (let i = 0; i < N; i++) {
    const gagnants = data[i].gagnants;
    for (let j = 0; j < gagnants.length; j++) {
      if (gagnants[j] >= 1 && gagnants[j] <= 90) {
        occurrences[gagnants[j]][i] = 1;
      }
    }
  }
  const results = [];
  const targets = targetNumbers && targetNumbers.length > 0 ? targetNumbers : Array.from({ length: 90 }, (_, i) => i + 1);
  let loopCount = 0;
  for (const Y of targets) {
    const ySeries = occurrences[Y];
    for (let X = 1; X <= 90; X++) {
      if (X === Y) continue;
      loopCount++;
      if (loopCount % 200 === 0) {
        await new Promise((r) => setTimeout(r, 0));
      }
      const xSeries = occurrences[X];
      const counts = new Float64Array(8);
      let totalPairs = 0;
      for (let i = 1; i < N; i++) {
        const x_curr = xSeries[i];
        const y_curr = ySeries[i];
        const y_next = ySeries[i - 1];
        const state = y_next << 2 | y_curr << 1 | x_curr;
        counts[state]++;
        totalPairs++;
      }
      if (totalPairs === 0) continue;
      let te = 0;
      const p_y_x = new Float64Array(4);
      const p_yNext_y = new Float64Array(4);
      const p_y = new Float64Array(2);
      for (let s = 0; s < 8; s++) {
        const y_next = s >> 2 & 1;
        const y_curr = s >> 1 & 1;
        const x_curr = s & 1;
        const prob = counts[s] / totalPairs;
        p_y_x[y_curr << 1 | x_curr] += prob;
        p_yNext_y[y_next << 1 | y_curr] += prob;
        p_y[y_curr] += prob;
      }
      for (let s = 0; s < 8; s++) {
        const prob = counts[s] / totalPairs;
        if (prob > 0) {
          const y_next = s >> 2 & 1;
          const y_curr = s >> 1 & 1;
          const x_curr = s & 1;
          const prob_yx = p_y_x[y_curr << 1 | x_curr];
          const prob_yy = p_yNext_y[y_next << 1 | y_curr];
          const prob_y = p_y[y_curr];
          if (prob_yx > 0 && prob_y > 0) {
            const num = prob / prob_yx;
            const den = prob_yy / prob_y;
            if (den > 0) {
              te += prob * Math.log2(num / den);
            }
          }
        }
      }
      if (te > noiseFloor) {
        results.push({
          source: X,
          target: Y,
          entropyTransfer: Number(te.toFixed(4)),
          // CORRECTION : Confiance dérivée continûment du ratio signal/bruit
          confidence: Math.min(100, Math.round(te / noiseFloor * 20))
        });
      }
    }
  }
  return results.sort((a, b) => b.entropyTransfer - a.entropyTransfer);
}
function computeWassersteinDistance(P, Q) {
  const N = Math.min(P.length, Q.length);
  if (N === 0) return 0;
  let sumP = 0, sumQ = 0;
  for (let i = 0; i < N; i++) {
    sumP += Math.max(0, P[i]);
    sumQ += Math.max(0, Q[i]);
  }
  sumP = sumP || Number.EPSILON;
  sumQ = sumQ || Number.EPSILON;
  let cdfP = 0;
  let cdfQ = 0;
  let wassersteinDist = 0;
  for (let i = 0; i < N; i++) {
    cdfP += Math.max(0, P[i]) / sumP;
    cdfQ += Math.max(0, Q[i]) / sumQ;
    wassersteinDist += Math.abs(cdfP - cdfQ);
  }
  return wassersteinDist / N;
}
function invertMatrix(M) {
  const n = M.length;
  const A = M.map((row) => [...row]);
  const I = Array(n).fill(0).map((_, i) => Array(n).fill(0).map((_2, j) => i === j ? 1 : 0));
  for (let i = 0; i < n; i++) {
    let pivotRow = i;
    for (let r = i + 1; r < n; r++) {
      if (Math.abs(A[r][i]) > Math.abs(A[pivotRow][i])) {
        pivotRow = r;
      }
    }
    if (pivotRow !== i) {
      const tempA = A[i];
      A[i] = A[pivotRow];
      A[pivotRow] = tempA;
      const tempI = I[i];
      I[i] = I[pivotRow];
      I[pivotRow] = tempI;
    }
    const pivot = A[i][i];
    if (Math.abs(pivot) < 1e-12) {
      return M;
    }
    for (let j = 0; j < n; j++) {
      A[i][j] /= pivot;
      I[i][j] /= pivot;
    }
    for (let r = 0; r < n; r++) {
      if (r !== i) {
        const factor = A[r][i];
        for (let j = 0; j < n; j++) {
          A[r][j] -= factor * A[i][j];
          I[r][j] -= factor * I[i][j];
        }
      }
    }
  }
  return I;
}
function computeContinuousWaveletTransform(signal, scales = [1.5, 3, 6, 12]) {
  const N = signal.length;
  const coeffs = Array(scales.length).fill(0);
  if (N === 0) return coeffs;
  const omega0 = 6;
  const factor = Math.pow(Math.PI, -0.25);
  for (let sIdx = 0; sIdx < scales.length; sIdx++) {
    const scale = scales[sIdx];
    let energySum = 0;
    for (let b = 0; b < N; b++) {
      let realSum = 0;
      for (let t = 0; t < N; t++) {
        const tau = (t - b) / scale;
        const waveletVal = factor * Math.exp(-0.5 * tau * tau) * Math.cos(omega0 * tau);
        realSum += signal[t] * waveletVal;
      }
      const coeff = realSum / Math.sqrt(scale);
      energySum += coeff * coeff;
    }
    coeffs[sIdx] = energySum / N;
  }
  return coeffs;
}
function dwt1D(signal, wavelet) {
  const N = signal.length;
  const padded = N % 2 !== 0 ? [...signal, signal[N - 1]] : signal;
  const len = padded.length;
  const approx = [];
  const detail = [];
  if (wavelet === "haar") {
    const h0 = 1 / Math.sqrt(2);
    const h1 = 1 / Math.sqrt(2);
    const g0 = 1 / Math.sqrt(2);
    const g1 = -1 / Math.sqrt(2);
    for (let i = 0; i < len; i += 2) {
      approx.push(padded[i] * h0 + padded[i + 1] * h1);
      detail.push(padded[i] * g0 + padded[i + 1] * g1);
    }
  } else {
    const sqrt3 = Math.sqrt(3);
    const denom = 4 * Math.sqrt(2);
    const h = [
      (1 + sqrt3) / denom,
      (3 + sqrt3) / denom,
      (3 - sqrt3) / denom,
      (1 - sqrt3) / denom
    ];
    const g = [h[3], -h[2], h[1], -h[0]];
    for (let i = 0; i < len; i += 2) {
      let aSum = 0;
      let dSum = 0;
      for (let k = 0; k < 4; k++) {
        const idx = (i + k) % len;
        aSum += padded[idx] * h[k];
        dSum += padded[idx] * g[k];
      }
      approx.push(aSum);
      detail.push(dSum);
    }
  }
  return { approx, detail };
}
function idwt1D(approx, detail, wavelet) {
  const N = approx.length;
  const signal = Array(N * 2).fill(0);
  if (wavelet === "haar") {
    const h0 = 1 / Math.sqrt(2);
    const h1 = 1 / Math.sqrt(2);
    const g0 = 1 / Math.sqrt(2);
    const g1 = -1 / Math.sqrt(2);
    for (let i = 0; i < N; i++) {
      signal[2 * i] = approx[i] * h0 + detail[i] * g0;
      signal[2 * i + 1] = approx[i] * h1 + detail[i] * g1;
    }
  } else {
    const sqrt3 = Math.sqrt(3);
    const denom = 4 * Math.sqrt(2);
    const h = [
      (1 + sqrt3) / denom,
      (3 + sqrt3) / denom,
      (3 - sqrt3) / denom,
      (1 - sqrt3) / denom
    ];
    const g = [h[3], -h[2], h[1], -h[0]];
    const len = N * 2;
    for (let i = 0; i < N; i++) {
      const idx2 = 2 * i;
      for (let k = 0; k < 4; k++) {
        const outIdx = (idx2 + k) % len;
        signal[outIdx] += approx[i] * h[k] + detail[i] * g[k];
      }
    }
  }
  return signal;
}
function decomposeDWT(signal, levels, wavelet) {
  const approxs = [];
  const details = [];
  let currentSig = [...signal];
  for (let l = 0; l < levels; l++) {
    if (currentSig.length < 4 && wavelet === "db4") break;
    if (currentSig.length < 2) break;
    const { approx, detail } = dwt1D(currentSig, wavelet);
    approxs.push(approx);
    details.push(detail);
    currentSig = approx;
  }
  return { approxs, details };
}
function reconstructDWT(approxs, details, wavelet) {
  if (approxs.length === 0) return [];
  let currentApprox = approxs[approxs.length - 1];
  for (let l = approxs.length - 1; l >= 0; l--) {
    const detail = details[l];
    currentApprox = idwt1D(currentApprox, detail, wavelet);
  }
  return currentApprox;
}
function denoiseSignalWavelet(signal, wavelet = "db4") {
  const N = signal.length;
  if (N < 4) return [...signal];
  const maxLevels = Math.min(4, Math.floor(Math.log2(N)));
  if (maxLevels === 0) return [...signal];
  const { approxs, details } = decomposeDWT(signal, maxLevels, wavelet);
  if (details.length === 0) return [...signal];
  const level1Details = details[0];
  const absDetails = level1Details.map((x) => Math.abs(x));
  absDetails.sort((a, b) => a - b);
  const medianAbs = absDetails[Math.floor(absDetails.length / 2)] || 0;
  const sigma = Math.max(1e-5, medianAbs / 0.6745);
  const threshold = sigma * Math.sqrt(2 * Math.log(N));
  const thresholdedDetails = details.map((levelDetails) => {
    return levelDetails.map((d) => {
      const absD = Math.abs(d);
      if (absD <= threshold) return 0;
      return Math.sign(d) * (absD - threshold);
    });
  });
  return reconstructDWT(approxs, thresholdedDetails, wavelet).slice(0, N);
}
function runContinuousWaveletTransformAnalysis(history) {
  const N = Math.min(history.length, 128);
  if (N < 10) {
    return Array.from({ length: 90 }, (_, i) => ({
      number: i + 1,
      energy: 50,
      resonance: false,
      dominantPeriod: 12,
      denoisedEnergy: 50,
      transientEnergy: 50,
      phaseShift: 50
    }));
  }
  const data = history.slice(0, N);
  const scales = [1.5, 3, 6, 12];
  const rawResults = [];
  let maxDenoisedCWTEnergy = 1e-9;
  let maxRawDetailEnergy = 1e-9;
  for (let num = 1; num <= 90; num++) {
    const signal = data.map((d) => d.gagnants.includes(num) ? 1 : -1);
    const dwtDb4 = decomposeDWT(signal, Math.min(4, Math.floor(Math.log2(N))), "db4");
    let rawDetailEnergy = 0;
    if (dwtDb4.details.length > 0) {
      let totalCoeffs = 0;
      dwtDb4.details.forEach((levelDetails) => {
        levelDetails.forEach((coeff) => {
          rawDetailEnergy += coeff * coeff;
          totalCoeffs++;
        });
      });
      rawDetailEnergy = totalCoeffs > 0 ? rawDetailEnergy / totalCoeffs : 0;
    }
    const denoisedSignal = denoiseSignalWavelet(signal, "db4");
    const scaleEnergies = computeContinuousWaveletTransform(denoisedSignal, scales);
    const denoisedCWTEnergy = scaleEnergies.reduce((sum, e) => sum + e, 0);
    let maxEnergyVal = -1;
    let dominantPeriod = 6;
    scaleEnergies.forEach((energyVal, sIdx) => {
      if (energyVal > maxEnergyVal) {
        maxEnergyVal = energyVal;
        dominantPeriod = scales[sIdx];
      }
    });
    const hitCount = signal.filter((x) => x === 1).length;
    const p = Math.max(0.01, Math.min(0.99, hitCount / N));
    const signalEntropy = -(p * Math.log(p) + (1 - p) * Math.log(1 - p)) / Math.log(2);
    if (denoisedCWTEnergy > maxDenoisedCWTEnergy) maxDenoisedCWTEnergy = denoisedCWTEnergy;
    if (rawDetailEnergy > maxRawDetailEnergy) maxRawDetailEnergy = rawDetailEnergy;
    rawResults.push({
      number: num,
      denoisedCWTEnergy,
      rawDetailEnergy,
      dominantPeriod,
      signalEntropy
    });
  }
  return rawResults.map((r) => {
    const normDenoisedCWT = r.denoisedCWTEnergy / maxDenoisedCWTEnergy;
    const normRawDetail = r.rawDetailEnergy / maxRawDetailEnergy;
    const alpha = 0.2 + 0.6 * r.signalEntropy;
    const combinedEnergy = (1 - alpha) * normDenoisedCWT + alpha * normRawDetail;
    return {
      number: r.number,
      energy: Math.round(combinedEnergy * 100),
      resonance: combinedEnergy > 0.8,
      dominantPeriod: r.dominantPeriod,
      denoisedEnergy: Math.round(normDenoisedCWT * 100),
      transientEnergy: Math.round(normRawDetail * 100),
      phaseShift: Math.round(normRawDetail * 100)
      // Phase shift magnitude aligns with detail energy
    };
  }).sort((a, b) => b.energy - a.energy);
}
function denoiseFeaturesKernelPCA(data, gamma, varianceThreshold) {
  if (!data || data.length === 0) return [];
  const nSamples = data.length;
  const nFeatures = data[0].length;
  const means = new Float64Array(nFeatures);
  const stdDevs = new Float64Array(nFeatures);
  for (let i = 0; i < nSamples; i++) {
    for (let j = 0; j < nFeatures; j++) means[j] += data[i][j];
  }
  for (let j = 0; j < nFeatures; j++) means[j] /= nSamples;
  for (let i = 0; i < nSamples; i++) {
    for (let j = 0; j < nFeatures; j++) stdDevs[j] += Math.pow(data[i][j] - means[j], 2);
  }
  for (let j = 0; j < nFeatures; j++) {
    stdDevs[j] = Math.sqrt(stdDevs[j] / Math.max(1, nSamples - 1)) || 1;
  }
  const scaledData = data.map((row) => row.map((val, j) => (val - means[j]) / stdDevs[j]));
  let sumDistSq = 0;
  let pairsCount = 0;
  for (let i = 0; i < nSamples; i++) {
    for (let j = i + 1; j < nSamples; j++) {
      let distSq = 0;
      for (let f = 0; f < nFeatures; f++) {
        distSq += Math.pow(scaledData[i][f] - scaledData[j][f], 2);
      }
      sumDistSq += distSq;
      pairsCount++;
    }
  }
  const meanDistSq = pairsCount > 0 ? sumDistSq / pairsCount : 1;
  const g = gamma ?? 1 / (meanDistSq || Number.EPSILON);
  const K = Array(nSamples).fill(0).map(() => Array(nSamples).fill(0));
  for (let i = 0; i < nSamples; i++) {
    for (let j = i; j < nSamples; j++) {
      let distSq = 0;
      for (let f = 0; f < nFeatures; f++) {
        distSq += Math.pow(scaledData[i][f] - scaledData[j][f], 2);
      }
      const val = Math.exp(-g * distSq);
      K[i][j] = val;
      K[j][i] = val;
    }
  }
  const K_centered = Array(nSamples).fill(0).map(() => Array(nSamples).fill(0));
  const rowMeans = Array(nSamples).fill(0);
  let totalMean = 0;
  for (let i = 0; i < nSamples; i++) {
    let rowSum = 0;
    for (let j = 0; j < nSamples; j++) {
      rowSum += K[i][j];
    }
    rowMeans[i] = rowSum / nSamples;
    totalMean += rowSum;
  }
  totalMean /= nSamples * nSamples;
  for (let i = 0; i < nSamples; i++) {
    for (let j = 0; j < nSamples; j++) {
      K_centered[i][j] = K[i][j] - rowMeans[i] - rowMeans[j] + totalMean;
    }
  }
  const { values: values2, vectors } = computeEigenDecomposition(K_centered);
  const totalVariance = values2.reduce((sum, v) => sum + Math.abs(v), 0);
  const dynamicThreshold = varianceThreshold ?? 1 - 1 / Math.sqrt(nFeatures);
  let k = 1;
  let currentVar = 0;
  for (let i = 0; i < nSamples; i++) {
    currentVar += Math.abs(values2[i]);
    if (totalVariance > 0 && currentVar / totalVariance >= dynamicThreshold) {
      k = i + 1;
      break;
    }
  }
  k = Math.max(1, Math.min(k, nSamples, nFeatures));
  const Y = Array(nSamples).fill(0).map(() => Array(k).fill(0));
  for (let i = 0; i < nSamples; i++) {
    for (let col = 0; col < k; col++) {
      let sum = 0;
      for (let j = 0; j < nSamples; j++) {
        sum += K_centered[i][j] * vectors[j][col];
      }
      Y[i][col] = sum;
    }
  }
  const YTY = Array(k).fill(0).map(() => Array(k).fill(0));
  for (let i = 0; i < k; i++) {
    for (let j = 0; j < k; j++) {
      let sum = 0;
      for (let s = 0; s < nSamples; s++) {
        sum += Y[s][i] * Y[s][j];
      }
      YTY[i][j] = sum;
    }
  }
  const ridgeLambda = 1e-4;
  for (let i = 0; i < k; i++) {
    YTY[i][i] += ridgeLambda;
  }
  const YTY_inv = invertMatrix(YTY);
  const YT_X = Array(k).fill(0).map(() => Array(nFeatures).fill(0));
  for (let i = 0; i < k; i++) {
    for (let f = 0; f < nFeatures; f++) {
      let sum = 0;
      for (let s = 0; s < nSamples; s++) {
        sum += Y[s][i] * scaledData[s][f];
      }
      YT_X[i][f] = sum;
    }
  }
  const W = Array(k).fill(0).map(() => Array(nFeatures).fill(0));
  for (let i = 0; i < k; i++) {
    for (let f = 0; f < nFeatures; f++) {
      let sum = 0;
      for (let j = 0; j < k; j++) {
        sum += YTY_inv[i][j] * YT_X[j][f];
      }
      W[i][f] = sum;
    }
  }
  const reconstructedScaled = Array(nSamples).fill(0).map(() => Array(nFeatures).fill(0));
  for (let i = 0; i < nSamples; i++) {
    for (let f = 0; f < nFeatures; f++) {
      let sum = 0;
      for (let j = 0; j < k; j++) {
        sum += Y[i][j] * W[j][f];
      }
      reconstructedScaled[i][f] = sum;
    }
  }
  const smoothClip = (x) => {
    if (x >= 5 && x <= 95) return x;
    if (x < 5) {
      return 5 * Math.exp((x - 5) / 5);
    }
    return 100 - 5 * Math.exp((95 - x) / 5);
  };
  const reconstructed = reconstructedScaled.map(
    (row) => row.map((val, j) => {
      const rawVal = val * stdDevs[j] + means[j];
      return smoothClip(rawVal);
    })
  );
  return reconstructed;
}
var mean, stdDev, matMul, transpose, matSub, matAdd, scalarMul, vecNorm, calculateShannonEntropy, calculateTsallisEntropy, calculateChiSquare, calculateKolmogorovSmirnov, calculateLjungBoxTest, calculateBenfordCompliance, calculateACValue;
var init_mathCore = __esm({
  "services/mathCore.ts"() {
    "use strict";
    mean = (data) => data.reduce((a, b) => a + b, 0) / (data.length || 1);
    stdDev = (data) => {
      const mu = mean(data);
      const variance2 = data.reduce((a, b) => a + Math.pow(b - mu, 2), 0) / (data.length || 1);
      return Math.sqrt(variance2);
    };
    matMul = (A, B) => {
      const m = A.length;
      const n = A[0].length;
      const p = B[0].length;
      const C = Array(m).fill(0).map(() => Array(p).fill(0));
      for (let i = 0; i < m; i++) {
        for (let j = 0; j < p; j++) {
          let sum = 0;
          for (let k = 0; k < n; k++) sum += A[i][k] * B[k][j];
          C[i][j] = sum;
        }
      }
      return C;
    };
    transpose = (A) => {
      const m = A.length;
      const n = A[0].length;
      const C = Array(n).fill(0).map(() => Array(m).fill(0));
      for (let i = 0; i < m; i++) {
        for (let j = 0; j < n; j++) C[j][i] = A[i][j];
      }
      return C;
    };
    matSub = (A, B) => A.map((row, i) => row.map((val, j) => val - B[i][j]));
    matAdd = (A, B) => A.map((row, i) => row.map((val, j) => val + B[i][j]));
    scalarMul = (A, scalar) => A.map((row) => row.map((val) => val * scalar));
    vecNorm = (v) => {
      let sum = 0;
      for (let i = 0; i < v.length; i++) sum += v[i][0] * v[i][0];
      return Math.sqrt(sum);
    };
    calculateShannonEntropy = (history) => {
      if (history.length === 0) return { normalized: 0 };
      const freq = new Float32Array(91);
      let total = 0;
      for (const d of history) {
        for (const n of d.gagnants) {
          if (n >= 1 && n <= 90) {
            freq[n]++;
            total++;
          }
        }
      }
      if (total === 0) return { normalized: 0 };
      let entropy = 0;
      for (let i = 1; i <= 90; i++) {
        if (freq[i] > 0) {
          const p = freq[i] / total;
          entropy -= p * Math.log2(p);
        }
      }
      const maxEntropy = Math.log2(90);
      return { normalized: entropy / maxEntropy };
    };
    calculateTsallisEntropy = (history, q = 1.5, degreesOfFreedom = 5) => {
      if (history.length === 0) return { normalized: 0, tsallisValue: 0 };
      const DOMAIN_SIZE4 = 90;
      const freqs = new Float32Array(DOMAIN_SIZE4 + 1);
      let totalBalls = 0;
      for (const d of history) {
        for (const n of d.gagnants) {
          if (n >= 1 && n <= DOMAIN_SIZE4) {
            freqs[n]++;
            totalBalls++;
          }
        }
      }
      if (totalBalls === 0) return { normalized: 0, tsallisValue: 0 };
      const empiricalProb = new Float32Array(DOMAIN_SIZE4 + 1);
      for (let i = 1; i <= DOMAIN_SIZE4; i++) {
        empiricalProb[i] = freqs[i] / totalBalls;
      }
      const freqArray = Array.from(freqs.slice(1));
      const sigma = stdDev(freqArray) || 1;
      const bandwidth = Math.max(0.1, 1.06 * sigma * Math.pow(DOMAIN_SIZE4, -0.2));
      const smoothDensity = new Float64Array(DOMAIN_SIZE4 + 1);
      let sumDensity = 0;
      const nu = degreesOfFreedom;
      for (let x = 1; x <= DOMAIN_SIZE4; x++) {
        let densityAtX = 0;
        for (let y = 1; y <= DOMAIN_SIZE4; y++) {
          if (empiricalProb[y] > 0) {
            const z = (x - y) / bandwidth;
            const studentWeight = Math.pow(1 + z * z / nu, -0.5 * (nu + 1));
            densityAtX += empiricalProb[y] * studentWeight;
          }
        }
        smoothDensity[x] = densityAtX;
        sumDensity += densityAtX;
      }
      for (let x = 1; x <= DOMAIN_SIZE4; x++) {
        smoothDensity[x] /= sumDensity || 1;
      }
      let sumPq = 0;
      for (let x = 1; x <= DOMAIN_SIZE4; x++) {
        if (smoothDensity[x] > 0) {
          sumPq += Math.pow(smoothDensity[x], q);
        }
      }
      let tsallisValue = 0;
      if (Math.abs(q - 1) < 1e-4) {
        let shannon = 0;
        for (let x = 1; x <= DOMAIN_SIZE4; x++) {
          if (smoothDensity[x] > 0) {
            shannon -= smoothDensity[x] * Math.log2(smoothDensity[x]);
          }
        }
        tsallisValue = shannon;
      } else {
        tsallisValue = (1 - sumPq) / (q - 1);
      }
      const pUniform = 1 / DOMAIN_SIZE4;
      const maxTsallis = Math.abs(q - 1) < 1e-4 ? Math.log2(DOMAIN_SIZE4) : (1 - DOMAIN_SIZE4 * Math.pow(pUniform, q)) / (q - 1);
      const normalized = Math.max(0, Math.min(1, tsallisValue / (maxTsallis || 1)));
      return { normalized, tsallisValue };
    };
    calculateChiSquare = (observed, totalObservations) => {
      const expected = totalObservations / 90;
      let chiSq = 0;
      for (let i = 1; i <= 90; i++) {
        const obs = observed[i] || 0;
        chiSq += Math.pow(obs - expected, 2) / expected;
      }
      return { score: chiSq };
    };
    calculateKolmogorovSmirnov = (numbers) => {
      if (numbers.length === 0) return { dStatistic: 0, isUniform: true };
      const N = numbers.length;
      const counts = new Float64Array(91);
      numbers.forEach((num) => {
        if (num >= 1 && num <= 90) counts[num]++;
      });
      let currentSum = 0;
      let maxD = 0;
      for (let i = 1; i <= 90; i++) {
        currentSum += counts[i];
        const empiricalCDF = currentSum / N;
        const theoreticalCDF = i / 90;
        const d = Math.abs(empiricalCDF - theoreticalCDF);
        if (d > maxD) maxD = d;
      }
      const criticalValue = 1.36 / Math.sqrt(N);
      return {
        dStatistic: maxD,
        isUniform: maxD < criticalValue
      };
    };
    calculateLjungBoxTest = (signal, lags = 10) => {
      const N = signal.length;
      if (N < lags * 2) return { qStatistic: 0, hasAutocorrelation: false };
      const getMean2 = (data) => data.reduce((a, b) => a + b, 0) / data.length;
      const mean4 = getMean2(signal);
      let variance2 = 0;
      for (let i = 0; i < N; i++) {
        variance2 += Math.pow(signal[i] - mean4, 2);
      }
      if (variance2 === 0) return { qStatistic: 0, hasAutocorrelation: false };
      let qStatistic = 0;
      for (let k = 1; k <= lags; k++) {
        let autocovariance = 0;
        for (let t = k; t < N; t++) {
          autocovariance += (signal[t] - mean4) * (signal[t - k] - mean4);
        }
        const rhoC = autocovariance / variance2;
        qStatistic += Math.pow(rhoC, 2) / (N - k);
      }
      qStatistic *= N * (N + 2);
      const threshold = lags + 1.96 * Math.sqrt(2 * lags);
      return {
        qStatistic,
        hasAutocorrelation: qStatistic > threshold
      };
    };
    calculateBenfordCompliance = (numbers) => {
      if (numbers.length === 0) return { score: 0, distribution: Array(9).fill(0) };
      const counts = new Uint32Array(10);
      for (const n of numbers) {
        const str = n.toString();
        const leading = parseInt(str[0], 10);
        if (leading >= 1 && leading <= 9) counts[leading]++;
      }
      const total = numbers.length;
      let deviation = 0;
      const distribution = [];
      for (let d = 1; d <= 9; d++) {
        const observed = counts[d] / total;
        distribution.push(observed * 100);
        const expected = d === 9 ? 2 / 90 : 11 / 90;
        deviation += Math.abs(observed - expected);
      }
      const score = Math.max(0, Math.round(100 - deviation * 50));
      return { score, distribution };
    };
    calculateACValue = (numbers) => {
      if (numbers.length < 2) return 0;
      const diffs = /* @__PURE__ */ new Set();
      for (let i = 0; i < numbers.length; i++) {
        for (let j = i + 1; j < numbers.length; j++) {
          diffs.add(Math.abs(numbers[i] - numbers[j]));
        }
      }
      return diffs.size - (numbers.length - 1);
    };
  }
});

// services/workerService.ts
var WorkerService, workerService;
var init_workerService = __esm({
  "services/workerService.ts"() {
    "use strict";
    init_AppError();
    init_apiClientStub();
    init_zeroCopy();
    WorkerService = class {
      localWorker = null;
      callbacks = /* @__PURE__ */ new Map();
      workerReady = false;
      initFailed = false;
      initAttempts = 0;
      maxInitAttempts = 1;
      constructor() {
        this.initLocalWorker();
      }
      initLocalWorker() {
        if (this.initFailed || this.initAttempts >= this.maxInitAttempts) {
          this.workerReady = false;
          this.localWorker = null;
          return;
        }
        try {
          if (typeof Worker === "undefined") {
            console.warn("L'environnement ne supporte pas les Web Workers. Ex\xE9cution en mode d\xE9grad\xE9 (synchrone).");
            this.initFailed = true;
            return;
          }
          if (this.localWorker) {
            try {
              this.localWorker.terminate();
            } catch (_) {
            }
          }
          this.initAttempts++;
          try {
            this.localWorker = new Worker(new URL(
              "./nexus.worker.ts",
              /* @ts-ignore */
              import.meta.url
            ), { type: "module" });
          } catch (moduleError) {
            console.warn("[WorkerService] \xC9chec du worker en mode 'module', essai en mode classique...", moduleError);
            try {
              this.localWorker = new Worker(new URL(
                "./nexus.worker.ts",
                /* @ts-ignore */
                import.meta.url
              ));
            } catch (classicError) {
              console.error("[WorkerService] \xC9chec d\xE9finitif de cr\xE9ation du Web Worker:", classicError);
              this.initFailed = true;
              this.workerReady = false;
              this.localWorker = null;
              return;
            }
          }
          this.localWorker.onmessage = (e) => {
            const { taskId, success, result, error } = e.data;
            const callback = this.callbacks.get(taskId);
            if (callback) {
              if (success) {
                callback.resolve(result);
              } else {
                callback.reject(new Error(error));
              }
              this.callbacks.delete(taskId);
            }
          };
          this.localWorker.onerror = (e) => {
            console.error("Local Worker interne error:", e);
            this.workerReady = false;
            this.localWorker = null;
            this.initFailed = true;
            for (const [taskId, callback] of Array.from(this.callbacks.entries())) {
              callback.reject(new Error("Local Worker a crash\xE9 ou n'a pas pu se charger."));
            }
            this.callbacks.clear();
          };
          this.workerReady = true;
        } catch (e) {
          console.error("Impossible d'initialiser le Web Worker Local. Les calculs seront bloquants.", e);
          this.workerReady = false;
          this.localWorker = null;
          this.initFailed = true;
        }
      }
      internalWorkerCounter = 0;
      isAvailable() {
        return true;
      }
      runInLocalWorker(task, payload, history) {
        if (this.initFailed) {
          return Promise.reject(new Error("Local Worker non disponible (pr\xE9c\xE9demment \xE9chou\xE9)"));
        }
        if (!this.workerReady || !this.localWorker) {
          this.initLocalWorker();
        }
        return new Promise((resolve, reject) => {
          if (!this.workerReady || !this.localWorker) {
            return reject(new Error("Local Worker non disponible"));
          }
          this.internalWorkerCounter++;
          const taskId = `${task}_${Date.now()}_${this.internalWorkerCounter}`;
          let timer;
          const wrappedResolve = (val) => {
            clearTimeout(timer);
            resolve(val);
          };
          const wrappedReject = (err) => {
            clearTimeout(timer);
            reject(err);
          };
          this.callbacks.set(taskId, { resolve: wrappedResolve, reject: wrappedReject });
          const transferables = [];
          let msgPayload = payload;
          let historyBuffer;
          let drawCount;
          let winningCount;
          let totalCols;
          if (Array.isArray(history) && history.length > 0) {
            const packed = packHistory(history);
            historyBuffer = packed.historyBuffer;
            drawCount = packed.drawCount;
            winningCount = packed.winningCount;
            totalCols = packed.totalCols;
            transferables.push(historyBuffer);
          }
          if (payload && typeof payload === "object") {
            const p = { ...payload };
            if (Array.isArray(p.matrix)) {
              const packed = packMatrix(p.matrix);
              p.matrixBuffer = packed.matrixBuffer;
              p.rows = packed.rows;
              p.cols = packed.cols;
              delete p.matrix;
            }
            if (Array.isArray(p.features)) {
              const packed = packMatrix(p.features);
              p.featuresBuffer = packed.matrixBuffer;
              p.featRows = packed.rows;
              p.featCols = packed.cols;
              delete p.features;
            }
            if (Array.isArray(p.labels)) {
              const packed = packArray(p.labels);
              p.labelsBuffer = packed.arrayBuffer;
              delete p.labels;
            }
            msgPayload = p;
          }
          collectTransferables(msgPayload, transferables);
          if (historyBuffer) collectTransferables(historyBuffer, transferables);
          this.localWorker.postMessage({
            taskId,
            task,
            payload: msgPayload,
            historyBuffer,
            drawCount,
            winningCount,
            totalCols
          }, transferables);
          timer = setTimeout(() => {
            if (this.callbacks.has(taskId)) {
              this.callbacks.delete(taskId);
              reject(new Error(`Timeout du Worker Local pour la t\xE2che ${task}`));
            }
          }, 1e4);
        });
      }
      async runInMainThreadFallback(task, payload, history) {
        console.warn(`[Nexus Worker] \xC9chec du Local Worker. Repli sur le thread principal (synchrone) pour la t\xE2che ${task}...`);
        try {
          const mathCore = await Promise.resolve().then(() => (init_mathCore(), mathCore_exports));
          let result;
          const p = payload;
          const hist = history;
          switch (task) {
            case "full_analysis":
              result = {
                spectral: mathCore.runSpectral(hist),
                fractal: mathCore.runFractal(hist)
              };
              break;
            case "hurst_exponent":
              result = mathCore.runFractal(hist);
              break;
            case "DENOISE_PCA":
              result = mathCore.denoiseFeaturesPCA(p?.matrix, p?.variance);
              break;
            case "TRAIN_RIDGE":
              result = mathCore.trainRidgeRegression(p?.features, p?.labels, p?.lambda);
              break;
            case "GAP_EFFICIENCY":
              result = mathCore.runGapEfficiency(hist);
              break;
            case "SPECTRAL_METRICS":
              result = mathCore.runSpectral(hist);
              break;
            case "wavelet_analysis":
              result = mathCore.runContinuousWaveletTransformAnalysis(hist);
              break;
            case "TRANSFER_ENTROPY":
              result = await mathCore.computeTransferEntropy(hist, p?.targetNumbers);
              break;
            default:
              result = { status: "OK" };
          }
          return result;
        } catch (syncError) {
          throw new AppError((syncError instanceof Error ? syncError.message : String(syncError)) || "\xC9chec final du calcul synchrone de secours", "WORKER_FATAL_ERROR", "high");
        }
      }
      edgeFailures = 0;
      edgeCooldownUntil = 0;
      // Si l'Edge Function a répondu avec succès au moins une fois, on sait qu'elle est
      // déployée et on peut la solliciter en parallèle (best-effort) pour décharger le CPU
      // client sur les gros historiques, sans jamais faire attendre l'UI dessus.
      edgeConfirmedAvailable = false;
      async runTask(task, payload = {}, history = []) {
        if (this.workerReady || !this.localWorker) {
          try {
            const result = await this.runInLocalWorker(task, payload, history);
            if (!this.edgeConfirmedAvailable && Date.now() >= this.edgeCooldownUntil) {
              this.pingEdgeInBackground(task, payload, history);
            }
            return result;
          } catch (localError) {
            console.info("[Nexus Worker] Worker local indisponible, tentative via Edge Function...");
          }
        }
        if (Date.now() >= this.edgeCooldownUntil) {
          try {
            const response = await apiClient.post("compute-nexus-analytics", {
              task,
              payload,
              history
            }, { suppressErrorLogging: true });
            if (response && response.success) {
              this.edgeFailures = 0;
              this.edgeConfirmedAvailable = true;
              return response.result;
            }
            throw new Error(response?.error || "Erreur silencieuse venant de l'Edge Function");
          } catch (e) {
            this.edgeFailures++;
            if (this.edgeFailures >= 3) {
              this.edgeCooldownUntil = Date.now() + 5 * 60 * 1e3;
              console.info(`[Nexus Worker] Edge Function hors ligne (Circuit ouvert). Pause de 5 min.`);
            }
          }
        }
        return await this.runInMainThreadFallback(task, payload, history);
      }
      /** Sollicite l'Edge Function sans jamais faire attendre l'appelant (fire-and-forget). */
      pingEdgeInBackground(task, payload, history) {
        apiClient.post("compute-nexus-analytics", { task, payload, history }, { suppressErrorLogging: true, timeoutMs: 4e3 }).then(() => {
          this.edgeConfirmedAvailable = true;
          this.edgeFailures = 0;
        }).catch(() => {
        });
      }
      async warmup(drawName = "Loto 5/90") {
        const start = performance.now();
        try {
          if (!this.workerReady || !this.localWorker) {
            this.initLocalWorker();
          }
          if (this.localWorker) {
            await this.runInLocalWorker("warmup", { drawName }, []);
          }
        } catch (e) {
          console.debug("[Nexus Worker] Warmup fallback:", e);
        }
        const latencyMs = Math.round(performance.now() - start);
        return { ready: true, latencyMs };
      }
    };
    workerService = new WorkerService();
  }
});

// services/mathService.ts
var denoiseFeaturesKernelPCA_wrapper, calculateMean, calculateStandardDeviation, getMean, getStdDev, calculateFastHurst, calculateFractalIndex, calculateACValue2, detectGameRegime, calculateVolatility, calculateShannonEntropy2, calculateWeylDiscrepancy, calculateGrassbergerProcaccia;
var init_mathService = __esm({
  "services/mathService.ts"() {
    "use strict";
    init_storeStub();
    init_workerService();
    init_mathCore();
    init_mathUtils();
    denoiseFeaturesKernelPCA_wrapper = (data, gamma, varianceThreshold) => {
      return denoiseFeaturesKernelPCA(data, gamma, varianceThreshold);
    };
    calculateMean = (data) => {
      if (!data || data.length === 0) return 0;
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i];
      return sum / data.length;
    };
    calculateStandardDeviation = (data) => {
      if (!data || data.length < 2) return 0;
      const mu = calculateMean(data);
      let sumSq = 0;
      for (let i = 0; i < data.length; i++) {
        sumSq += (data[i] - mu) ** 2;
      }
      return Math.sqrt(sumSq / data.length);
    };
    getMean = calculateMean;
    getStdDev = calculateStandardDeviation;
    calculateFastHurst = (signal) => {
      const N = signal.length;
      if (N < 20) return 0.5;
      const meanVal = getMean(signal);
      const y = new Float32Array(N);
      for (let i = 0; i < N; i++) y[i] = signal[i] - meanVal;
      let currentSum = 0;
      let maxCum = -Infinity;
      let minCum = Infinity;
      for (let i = 0; i < N; i++) {
        currentSum += y[i];
        if (currentSum > maxCum) maxCum = currentSum;
        if (currentSum < minCum) minCum = currentSum;
      }
      const R = maxCum - minCum;
      const S = getStdDev(signal);
      if (R === 0 || S === 0) return 0.5;
      const hurst = Math.log(R / S) / Math.log(N / 2);
      return Math.max(0.01, Math.min(0.99, hurst));
    };
    calculateFractalIndex = (history) => {
      const limit = Math.min(history.length, 100);
      const sums = new Float64Array(limit);
      for (let i = 0; i < limit; i++) {
        let s = 0;
        const w = history[i].gagnants;
        for (let j = 0; j < w.length; j++) s += w[j];
        sums[i] = s;
      }
      return calculateFastHurst(sums);
    };
    calculateACValue2 = (numbers) => {
      if (numbers.length < 2) return 0;
      const diffs = /* @__PURE__ */ new Set();
      for (let i = 0; i < numbers.length; i++) {
        for (let j = i + 1; j < numbers.length; j++) {
          diffs.add(Math.abs(numbers[i] - numbers[j]));
        }
      }
      return diffs.size - (numbers.length - 1);
    };
    detectGameRegime = (history) => {
      const h = calculateFractalIndex(history);
      const entropyOut = calculateShannonEntropy2(history);
      const volatilityOut = calculateVolatility(history);
      const weyl = calculateWeylDiscrepancy(history);
      const chaos = calculateGrassbergerProcaccia(history);
      const N = Math.min(history.length, 200);
      const uncertaintyMargin = 1 / Math.sqrt(N);
      let regime = "NORMAL";
      if (h > 0.5 + uncertaintyMargin && volatilityOut.score < 50) regime = "PERSISTANT_TREND";
      else if (h > 0.5 + uncertaintyMargin && volatilityOut.score >= 50) regime = "PERSISTANT_CHAOS";
      else if (h < 0.5 - uncertaintyMargin) regime = "MEAN_REVERTING";
      else if (entropyOut.normalized > 1 - uncertaintyMargin) regime = "HIGH_ENTROPY";
      else regime = "NORMAL";
      return {
        regime,
        hurst: h,
        entropy: entropyOut.normalized,
        volatility: volatilityOut.score,
        weylDiscrepancy: weyl,
        chaosDimension: chaos
      };
    };
    calculateVolatility = (history) => {
      const sums = history.map((d) => d.gagnants.reduce((a, b) => a + b, 0));
      const std = getStdDev(sums);
      const THEORETICAL_STD_SUM = 56.77;
      const score = Math.min(100, Math.round(std / THEORETICAL_STD_SUM * 100));
      return { score, status: score > 60 ? "Chaos" : score > 30 ? "Volatile" : "Stable" };
    };
    calculateShannonEntropy2 = (history) => {
      if (history.length === 0) return { normalized: 0 };
      const freq = new Float32Array(91);
      let total = 0;
      for (const d of history) {
        for (const n of d.gagnants) {
          if (n >= 1 && n <= 90) {
            freq[n]++;
            total++;
          }
        }
      }
      if (total === 0) return { normalized: 0 };
      let entropy = 0;
      for (let i = 1; i <= 90; i++) {
        if (freq[i] > 0) {
          const p = freq[i] / total;
          entropy -= p * Math.log2(p);
        }
      }
      const maxEntropy = Math.log2(90);
      return { normalized: entropy / maxEntropy };
    };
    calculateWeylDiscrepancy = (history) => {
      const N = Math.min(history.length, 100);
      if (N < 10) return 0.5;
      const values2 = new Float64Array(N);
      const goldenRatio = 0.6180339887498949;
      for (let i = 0; i < N; i++) {
        const sum = history[i].gagnants.reduce((a, b) => a + b, 0);
        values2[i] = sum * goldenRatio % 1;
      }
      values2.sort();
      let maxDiff = 0;
      for (let j = 0; j < N; j++) {
        const expected = (j + 0.5) / N;
        const diff = Math.abs(values2[j] - expected);
        if (diff > maxDiff) maxDiff = diff;
      }
      return Math.max(0, Math.min(1, maxDiff));
    };
    calculateGrassbergerProcaccia = (history) => {
      const N = Math.min(history.length, 100);
      if (N < 15) return 1.5;
      const sums = new Float64Array(N);
      for (let i = 0; i < N; i++) {
        sums[i] = history[i].gagnants.reduce((a, b) => a + b, 0);
      }
      const emb = 3;
      const m = N - emb + 1;
      if (m <= 5) return 1.5;
      const vectors = [];
      for (let i = 0; i < m; i++) {
        vectors.push([sums[i], sums[i + 1], sums[i + 2]]);
      }
      const distances = [];
      for (let i = 0; i < m; i++) {
        for (let j = i + 1; j < m; j++) {
          const dx = vectors[i][0] - vectors[j][0];
          const dy = vectors[i][1] - vectors[j][1];
          const dz = vectors[i][2] - vectors[j][2];
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (dist > 0) distances.push(dist);
        }
      }
      if (distances.length < 5) return 1.5;
      distances.sort((a, b) => a - b);
      const r1 = distances[Math.floor(distances.length * 0.1)];
      const r2 = distances[Math.floor(distances.length * 0.5)];
      if (r1 === r2 || r1 === 0 || r2 === 0) return 1.5;
      let count1 = 0;
      let count2 = 0;
      for (const d2 of distances) {
        if (d2 <= r1) count1++;
        if (d2 <= r2) count2++;
      }
      const c1 = count1 / distances.length;
      const c2 = count2 / distances.length;
      if (c1 === 0 || c2 === 0 || c1 === c2) return 1.5;
      const d = (Math.log(c2) - Math.log(c1)) / (Math.log(r2) - Math.log(r1));
      return Math.max(1, Math.min(3, d));
    };
  }
});

// constants.ts
var DRAW_SCHEDULE, ALL_DRAWS;
var init_constants = __esm({
  "constants.ts"() {
    "use strict";
    DRAW_SCHEDULE = {
      "Lundi": {
        "10:00": "Reveil",
        "13:00": "Etoile",
        "16:00": "Akwaba",
        "19:55": "Monday Special"
      },
      "Mardi": {
        "10:00": "La Matinale",
        "13:00": "Emergence",
        "16:00": "Sika",
        "19:55": "Lucky Tuesday"
      },
      "Mercredi": {
        "10:00": "Premiere Heure",
        "13:00": "Fortune",
        "16:00": "Baraka",
        "19:55": "Midweek"
      },
      "Jeudi": {
        "10:00": "Kado",
        "13:00": "Privilege",
        "16:00": "Monni",
        "19:55": "Fortune Thursday"
      },
      "Vendredi": {
        "10:00": "Cash",
        "13:00": "Solution",
        "16:00": "Wari",
        "19:55": "Friday Bonanza"
      },
      "Samedi": {
        "10:00": "Soutra",
        "13:00": "Diamant",
        "16:00": "Moaye",
        "19:55": "National"
      },
      "Dimanche": {
        "10:00": "Benediction",
        "13:00": "Prestige",
        "16:00": "Awale",
        "19:55": "Espoir"
      }
    };
    ALL_DRAWS = Object.entries(DRAW_SCHEDULE).flatMap(
      ([day, times]) => Object.entries(times).map(([time, name]) => ({
        name,
        time,
        day
      }))
    );
  }
});

// services/lotteryService.ts
var LOTTERY_CONSTANTS;
var init_lotteryService = __esm({
  "services/lotteryService.ts"() {
    "use strict";
    init_constants();
    init_supabaseClientStub();
    init_mathService();
    init_apiClientStub();
    init_AppError();
    init_CacheService();
    LOTTERY_CONSTANTS = {
      /** Nombre total de boules dans l'urne pour les tirages 5/90 (Source officielle: Loto Civil/National) */
      TOTAL_NUMBERS: 90,
      /** Nombre de numéros tirés par tirage (gagnants / machine) (Source officielle: Loto Civil 5/90) */
      NUMBERS_PER_DRAW: 5,
      /** Taille par défaut de l'historique de secours déterministe pour assurer une convergence statistique */
      FALLBACK_HISTORY_DEPTH: 250,
      /** Graine première de grand ordre pour l'initialisation du générateur congruentiel linéaire (LCG) déterministe */
      SEED_PRIME: 99991,
      /** Nombre de jours par défaut pour l'agrégation statistique récente (fenêtre d'observation standard) */
      DEFAULT_STATS_DAYS: 7,
      /** Limite de lecture maximale des tirages de l'historique pour préserver l'occupation mémoire en client */
      MAX_HISTORY_LIMIT: 2e3,
      /** Identifiant global représentant l'agrégation de tous les tirages */
      ALL_DRAWS_IDENTIFIER: "ALL"
    };
  }
});

// utils/arrayUtils.ts
var purifyHistoryForDraw;
var init_arrayUtils = __esm({
  "utils/arrayUtils.ts"() {
    "use strict";
    init_lotteryService();
    purifyHistoryForDraw = (drawName, history) => {
      if (!history || !Array.isArray(history)) return [];
      const normalizedTarget = drawName.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (normalizedTarget === "all_combined" || normalizedTarget === "all") {
        return history;
      }
      const purified = history.reduce((acc, d) => {
        const name = d.drawName || d.draw_name;
        if (!name) {
          acc.push({ ...d, drawName, draw_name: drawName });
        } else {
          const nameStr = String(name).trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          if (nameStr === normalizedTarget || normalizedTarget.includes(nameStr) || nameStr.includes(normalizedTarget)) {
            acc.push({ ...d, drawName: name, draw_name: name });
          }
        }
        return acc;
      }, []);
      return purified;
    };
  }
});

// services/prediction/featureExtractor.ts
var DOMAIN_MIN, DOMAIN_MAX, DOMAIN_SIZE, calculateMedian, extractDrawNumbers, extractFeatures;
var init_featureExtractor = __esm({
  "services/prediction/featureExtractor.ts"() {
    "use strict";
    init_CacheService();
    init_mathService();
    init_arrayUtils();
    DOMAIN_MIN = 1;
    DOMAIN_MAX = 90;
    DOMAIN_SIZE = DOMAIN_MAX - DOMAIN_MIN + 1;
    calculateMedian = (values2) => {
      if (values2.length === 0) return 0;
      const sorted = [...values2].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    };
    extractDrawNumbers = (draw) => {
      const winners = Array.isArray(draw.gagnants) ? draw.gagnants : [];
      let machine = [];
      if (draw.machine) {
        if (Array.isArray(draw.machine)) {
          machine = draw.machine;
        } else if (typeof draw.machine === "number") {
          machine = [draw.machine];
        } else if (typeof draw.machine === "string") {
          machine = String(draw.machine).split(",").map(Number).filter((n) => !isNaN(n) && n >= DOMAIN_MIN && n <= DOMAIN_MAX);
        }
      }
      return {
        winners: winners.filter((n) => n >= DOMAIN_MIN && n <= DOMAIN_MAX),
        machine: machine.filter((n) => n >= DOMAIN_MIN && n <= DOMAIN_MAX)
      };
    };
    extractFeatures = async (drawName, history, sampleSize = history.length) => {
      const filteredHistory = purifyHistoryForDraw(drawName, history);
      const cacheKey = globalCache.generateKey("features", drawName, `${filteredHistory.length}_${filteredHistory[0]?.date || "nodate"}`);
      return globalCache.getOrCompute(
        cacheKey,
        async () => {
          let evalWindow = sampleSize;
          if (filteredHistory.length > 0 && filteredHistory.length < 200) {
            const tempH = calculateFractalIndex(filteredHistory);
            const tempE = calculateShannonEntropy2(filteredHistory).normalized;
            const tempGapsMap = new Int32Array(DOMAIN_MAX + 1).fill(-1);
            for (let i = 0; i < Math.min(50, filteredHistory.length); i++) {
              const { winners } = extractDrawNumbers(filteredHistory[i]);
              for (const w of winners) {
                if (tempGapsMap[w] === -1) tempGapsMap[w] = i;
              }
            }
            const validG = Array.from(tempGapsMap).filter((g) => g !== -1);
            const medG = validG.length > 0 ? calculateMedian(validG) : DOMAIN_SIZE / 6;
            const halfLife = Math.max(6, medG * (1 + (tempH - 0.5) + (1 - tempE)));
            const adaptiveDepth = Math.round(halfLife * (3 + 2 * tempH));
            evalWindow = Math.min(filteredHistory.length, Math.max(25, adaptiveDepth));
          }
          const recentHistory = filteredHistory.slice(0, Math.min(evalWindow, filteredHistory.length));
          const freqMap = new Float32Array(DOMAIN_MAX + 1);
          const gapsMap = new Int32Array(DOMAIN_MAX + 1).fill(-1);
          const markovMap = new Float32Array(DOMAIN_MAX + 1);
          const machineTransferMap = new Float32Array(DOMAIN_MAX + 1);
          const affinityMap = Array.from({ length: DOMAIN_MAX + 1 }, () => new Float32Array(DOMAIN_MAX + 1));
          const momentumMap = new Float32Array(DOMAIN_MAX + 1);
          if (recentHistory.length === 0) {
            return {
              freqMap,
              gapsMap: gapsMap.map(() => 0),
              markovMap,
              affinityMap,
              momentumMap,
              machineTransferMap,
              shadowProbabilityMap: new Float32Array(DOMAIN_MAX + 1),
              networkCorrelationMap: new Float32Array(DOMAIN_MAX + 1)
            };
          }
          for (let i = 0; i < recentHistory.length; i++) {
            const { winners } = extractDrawNumbers(recentHistory[i]);
            for (const n of winners) {
              if (gapsMap[n] === -1) {
                gapsMap[n] = i;
              }
            }
          }
          const h = calculateFractalIndex(filteredHistory);
          const e = calculateShannonEntropy2(filteredHistory).normalized;
          const validGaps = Array.from(gapsMap).filter((g) => g !== -1);
          const medianGap = validGaps.length > 0 ? calculateMedian(validGaps) : DOMAIN_SIZE / 6;
          const minTheoreticalHalfLife = Math.ceil(Math.log2(DOMAIN_SIZE));
          const regimeMultiplier = 1 + (h - 0.5) + (1 - e);
          const adaptiveHalfLife = Math.max(minTheoreticalHalfLife, medianGap * regimeMultiplier);
          const TIME_DECAY = Math.pow(0.5, 1 / adaptiveHalfLife);
          const momentumWindow = Math.floor(adaptiveHalfLife);
          const machineToWinnersMatrix = Array.from({ length: DOMAIN_MAX + 1 }, () => new Float32Array(DOMAIN_MAX + 1));
          for (let i = 0; i < recentHistory.length - 1; i++) {
            const { machine: prevMachine } = extractDrawNumbers(recentHistory[i + 1]);
            const { winners: currWinners } = extractDrawNumbers(recentHistory[i]);
            if (prevMachine.length > 0 && currWinners.length > 0) {
              const decay = Math.pow(TIME_DECAY, i);
              for (const m of prevMachine) {
                for (const w of currWinners) {
                  machineToWinnersMatrix[m][w] += decay;
                }
              }
            }
          }
          for (let i = 0; i < recentHistory.length; i++) {
            const draw = recentHistory[i];
            const { winners, machine } = extractDrawNumbers(draw);
            const decayWeight = Math.pow(TIME_DECAY, i);
            for (const n of winners) {
              freqMap[n] += decayWeight;
              if (gapsMap[n] === -1) gapsMap[n] = i;
              if (i < momentumWindow) momentumMap[n] += decayWeight;
            }
            for (const m of machine) {
              let crossEnergy = 0;
              const row = machineToWinnersMatrix[m];
              if (row) {
                for (let w = DOMAIN_MIN; w <= DOMAIN_MAX; w++) {
                  crossEnergy += row[w];
                }
              }
              const transferRatio = crossEnergy / (winners.length || 5);
              machineTransferMap[m] += decayWeight * (1 + Math.tanh(transferRatio));
            }
          }
          for (let i = DOMAIN_MIN; i <= DOMAIN_MAX; i++) {
            if (gapsMap[i] === -1) gapsMap[i] = recentHistory.length;
          }
          const alphaCross = 0.5 / (1 + Math.exp(10 * (e - 0.5)));
          const markovWinnersMap = Array.from({ length: DOMAIN_MAX + 1 }, () => new Float32Array(DOMAIN_MAX + 1));
          const markovMachineMap = Array.from({ length: DOMAIN_MAX + 1 }, () => new Float32Array(DOMAIN_MAX + 1));
          const affinityWinnersMap = Array.from({ length: DOMAIN_MAX + 1 }, () => new Float32Array(DOMAIN_MAX + 1));
          const affinityMachineMap = Array.from({ length: DOMAIN_MAX + 1 }, () => new Float32Array(DOMAIN_MAX + 1));
          for (let i = 0; i < recentHistory.length - 1; i++) {
            const { winners: currentWinners, machine: currentMachine } = extractDrawNumbers(recentHistory[i]);
            const { winners: prevWinners, machine: prevMachine } = extractDrawNumbers(recentHistory[i + 1]);
            const decayWeight = Math.pow(TIME_DECAY, i);
            for (const p of prevWinners) {
              for (const c of currentWinners) {
                markovWinnersMap[p][c] += decayWeight;
              }
            }
            for (const c1 of currentWinners) {
              for (const c2 of currentWinners) {
                if (c1 !== c2) {
                  affinityWinnersMap[c1][c2] += decayWeight;
                }
              }
            }
            if (currentMachine.length > 0) {
              const pMachineList = prevMachine.length > 0 ? prevMachine : prevWinners;
              for (const p of pMachineList) {
                for (const c of currentMachine) {
                  markovMachineMap[p][c] += decayWeight;
                }
              }
              for (const c1 of currentMachine) {
                for (const c2 of currentMachine) {
                  if (c1 !== c2) {
                    affinityMachineMap[c1][c2] += decayWeight;
                  }
                }
              }
            }
          }
          const markovTransitionMap = Array.from({ length: DOMAIN_MAX + 1 }, () => new Float32Array(DOMAIN_MAX + 1));
          for (let p = DOMAIN_MIN; p <= DOMAIN_MAX; p++) {
            for (let c = DOMAIN_MIN; c <= DOMAIN_MAX; c++) {
              markovTransitionMap[p][c] = markovWinnersMap[p][c] + alphaCross * markovMachineMap[p][c];
              affinityMap[p][c] = affinityWinnersMap[p][c] + alphaCross * affinityMachineMap[p][c];
            }
          }
          let totalFreqSum = 0;
          for (let c = DOMAIN_MIN; c <= DOMAIN_MAX; c++) {
            totalFreqSum += freqMap[c];
          }
          const lambdaBayes = Math.max(0.1, 15 * Math.pow(e, 3));
          for (let p = DOMAIN_MIN; p <= DOMAIN_MAX; p++) {
            let total = 0;
            for (let c = DOMAIN_MIN; c <= DOMAIN_MAX; c++) total += markovTransitionMap[p][c];
            for (let c = DOMAIN_MIN; c <= DOMAIN_MAX; c++) {
              const priorC = totalFreqSum > 0 ? freqMap[c] / totalFreqSum : 1 / DOMAIN_SIZE;
              markovTransitionMap[p][c] = (markovTransitionMap[p][c] + lambdaBayes * priorC) / (total + lambdaBayes);
            }
          }
          for (let c1 = DOMAIN_MIN; c1 <= DOMAIN_MAX; c1++) {
            const freqC1 = freqMap[c1] || 1;
            for (let c2 = DOMAIN_MIN; c2 <= DOMAIN_MAX; c2++) {
              affinityMap[c1][c2] = affinityMap[c1][c2] / freqC1;
            }
          }
          const lastDraw = recentHistory[0] ? extractDrawNumbers(recentHistory[0]).winners : [];
          if (lastDraw.length > 0) {
            let maxMarkov = -Infinity;
            for (const lastNum of lastDraw) {
              for (let nextNum = DOMAIN_MIN; nextNum <= DOMAIN_MAX; nextNum++) {
                markovMap[nextNum] += markovTransitionMap[lastNum][nextNum];
              }
            }
            for (let nextNum = DOMAIN_MIN; nextNum <= DOMAIN_MAX; nextNum++) {
              markovMap[nextNum] = markovMap[nextNum] / lastDraw.length;
              if (markovMap[nextNum] > maxMarkov) maxMarkov = markovMap[nextNum];
            }
            const MARKOV_TEMPERATURE = 1.3;
            let sumSoftmax = 0;
            for (let nextNum = DOMAIN_MIN; nextNum <= DOMAIN_MAX; nextNum++) {
              markovMap[nextNum] = Math.exp((markovMap[nextNum] - maxMarkov) / MARKOV_TEMPERATURE);
              sumSoftmax += markovMap[nextNum];
            }
            for (let nextNum = DOMAIN_MIN; nextNum <= DOMAIN_MAX; nextNum++) {
              markovMap[nextNum] /= sumSoftmax;
            }
          }
          const shadowProbabilityMap = new Float32Array(DOMAIN_MAX + 1);
          const networkCorrelationMap = new Float32Array(DOMAIN_MAX + 1);
          for (let n = DOMAIN_MIN; n <= DOMAIN_MAX; n++) {
            const gap = gapsMap[n];
            shadowProbabilityMap[n] = gap > 0 ? Math.min(1, gap / DOMAIN_SIZE) : 0;
            let affSum = 0;
            const affs = affinityMap[n];
            if (affs) {
              for (let c = DOMAIN_MIN; c <= DOMAIN_MAX; c++) {
                if (c !== n) affSum += affs[c];
              }
            }
            networkCorrelationMap[n] = affSum / DOMAIN_SIZE;
          }
          return {
            freqMap,
            gapsMap,
            markovMap,
            affinityMap,
            momentumMap,
            machineTransferMap,
            shadowProbabilityMap,
            networkCorrelationMap
          };
        },
        CACHE_TTL.MEDIUM,
        drawName
      );
    };
  }
});

// services/prediction/deterministicCore.ts
var LCG_A, LCG_C, LCG_M, DeterministicSeededGenerator, sigmoid, gaussianPDF, softmax;
var init_deterministicCore = __esm({
  "services/prediction/deterministicCore.ts"() {
    "use strict";
    LCG_A = 1664525;
    LCG_C = 1013904223;
    LCG_M = Math.pow(2, 32);
    DeterministicSeededGenerator = class {
      state;
      constructor(seedString) {
        this.state = this.hashString(String(seedString));
      }
      /**
       * Algorithme de hachage FNV-1a 32-bit déterministe.
       */
      hashString(str) {
        let hash = 2166136261;
        for (let i = 0; i < str.length; i++) {
          hash ^= str.charCodeAt(i);
          hash = Math.imul(hash, 16777619);
        }
        return hash >>> 0;
      }
      /**
       * Retourne une valeur déterministe continue entre 0.0 et 1.0 (exclusive)
       */
      nextFloat() {
        this.state = (LCG_A * this.state + LCG_C) % LCG_M;
        return this.state / LCG_M;
      }
    };
    sigmoid = (curr, center = 0, k = 1) => {
      return 1 / (1 + Math.exp(-k * (curr - center)));
    };
    gaussianPDF = (x, mean4 = 0, variance2 = 1) => {
      const safeVariance = Math.max(Number.EPSILON, variance2);
      return 1 / Math.sqrt(2 * Math.PI * safeVariance) * Math.exp(-Math.pow(x - mean4, 2) / (2 * safeVariance));
    };
    softmax = (logits) => {
      const maxLogit = Math.max(...logits);
      const scaled = logits.map((v) => Math.exp(v - maxLogit));
      const sum = scaled.reduce((a, b) => a + b, 0);
      return scaled.map((v) => v / sum);
    };
  }
});

// services/prediction/microDnaService.ts
var calculateMicroDNAPerNumber;
var init_microDnaService = __esm({
  "services/prediction/microDnaService.ts"() {
    "use strict";
    init_deterministicCore();
    init_arrayUtils();
    calculateMicroDNAPerNumber = (drawName, targetNumber, history, globalDnaContext) => {
      const drawHistory = purifyHistoryForDraw(drawName, history);
      const algoKeys = Object.keys(globalDnaContext);
      const behavioralDna = {};
      const generator = new DeterministicSeededGenerator(`${drawName}_micro_dna_${targetNumber}`);
      const allDrawsContainingTarget = drawHistory.filter((h) => h.gagnants.includes(targetNumber));
      const frequency = allDrawsContainingTarget.length;
      const totalDraws = drawHistory.length || 1;
      const baseProb = frequency / totalDraws;
      const vectorLogits = algoKeys.map((algo) => {
        const priorDnaWeight = globalDnaContext[algo] ?? 1;
        const randFloat = generator.nextFloat();
        const numVariance = baseProb > 0 ? 1 - baseProb : 1;
        const affinity = gaussianPDF(randFloat, priorDnaWeight / 100, numVariance);
        return (baseProb * 10 + affinity) * priorDnaWeight;
      });
      const probabilityDistribution = softmax(vectorLogits);
      let spectralPower = 0;
      algoKeys.forEach((algo, index) => {
        const componentWeight = probabilityDistribution[index] * 100;
        behavioralDna[algo] = componentWeight;
        spectralPower += componentWeight * (globalDnaContext[algo] || 0.1);
      });
      return {
        numberData: targetNumber,
        behavioralDna,
        spectralPower: spectralPower / algoKeys.length
      };
    };
  }
});

// services/prediction/algorithmRegistry.ts
var algorithmRegistry, createValidationContext, registerAlgorithm;
var init_algorithmRegistry = __esm({
  "services/prediction/algorithmRegistry.ts"() {
    "use strict";
    algorithmRegistry = [];
    createValidationContext = () => {
      const validationHistory = Array(15).fill(0).map((_, i) => ({
        id: `draw_${i}`,
        date: `2026-01-${i + 1}`,
        gagnants: [1, 2, 3, 4, 5],
        boule_machine: "A",
        drawName: "Reveil",
        timestamp: Date.now() - i * 864e5
      }));
      const freqMap = new Float32Array(91);
      const gapsMap = new Int32Array(91);
      const markovMap = new Float32Array(91);
      const momentumMap = new Float32Array(91);
      const machineTransferMap = new Float32Array(91);
      const shadowProbabilityMap = new Float32Array(91);
      const networkCorrelationMap = new Float32Array(91);
      const affinityMap = Array.from({ length: 91 }, () => new Float32Array(91));
      for (let i = 1; i <= 90; i++) {
        freqMap[i] = 10;
        gapsMap[i] = 5;
        shadowProbabilityMap[i] = 0.5;
        networkCorrelationMap[i] = 0.3;
        momentumMap[i] = 1;
        machineTransferMap[i] = 0.5;
      }
      const validationContext = {
        features: {
          freqMap,
          gapsMap,
          markovMap,
          affinityMap,
          momentumMap,
          machineTransferMap,
          shadowProbabilityMap,
          networkCorrelationMap
        },
        advancedMetrics: {
          digitalRoot: {},
          harmonicTension: {},
          volatility: {},
          drift: {}
        },
        history: validationHistory,
        deterministicSeed: 987654321,
        statisticalBounds: {
          median: 5,
          q1: 2,
          q3: 8,
          variance: 3,
          kurtosis: 1.5,
          skewness: 0.2,
          shannonEntropy: 3.5,
          hurstExponent: 0.5
        }
      };
      return validationContext;
    };
    registerAlgorithm = (plugin) => {
      if (!plugin.isStrictlyDeterministic) {
        throw new Error(
          `[VIOLATION ARCHITECTURE] L'algorithme '${plugin.key}' est rejet\xE9. Principe Z\xC9RO HASARD viol\xE9 : Tous les algorithmes doivent \xEAtre 100% d\xE9terministes.`
        );
      }
      if (!plugin.mathematicalBasis || plugin.mathematicalBasis.trim().length < 3) {
        throw new Error(
          `[VIOLATION ARCHITECTURE] L'algorithme '${plugin.key}' doit d\xE9clarer explicitement sa 'mathematicalBasis' (ex: 'Loi Normale', 'Entropie de Shannon'). Les heuristiques arbitraires sont interdites.`
        );
      }
      if (plugin.evaluate.length < 2) {
        throw new Error(
          `[VIOLATION ARCHITECTURE] L'\xE9valuateur de '${plugin.key}' doit accepter le param\xE8tre 'context' pour garantir l'acc\xE8s \xE0 la deterministicSeed et aux bornes statistiques.`
        );
      }
      try {
        const validationCtx = createValidationContext();
        plugin.precompute(validationCtx);
        const testNumbers = [1, 45, 90];
        for (const num of testNumbers) {
          const result = plugin.evaluate(num, validationCtx);
          if (!result) {
            throw new Error(`L'\xE9valuation a retourn\xE9 null ou undefined pour le num\xE9ro ${num}.`);
          }
          const score = result.score;
          if (typeof score !== "number" || isNaN(score) || !isFinite(score)) {
            throw new Error(`Le score '${score}' retourn\xE9 pour le num\xE9ro ${num} n'est pas un nombre fini.`);
          }
          if (score < 0 || score > 100) {
            throw new Error(`Le score '${score}' retourn\xE9 pour le num\xE9ro ${num} est hors de l'intervalle [0, 100].`);
          }
          const confidence = result.confidence;
          if (typeof confidence !== "number" || isNaN(confidence) || !isFinite(confidence)) {
            throw new Error(`La confiance '${confidence}' retourn\xE9e pour le num\xE9ro ${num} n'est pas un nombre fini.`);
          }
        }
      } catch (error) {
        throw new Error(
          `[VIOLATION INT\xC9GRIT\xC9 MATH\xC9MATIQUE] L'algorithme '${plugin.key}' a \xE9chou\xE9 au test d'int\xE9grit\xE9 de l'\xE9valuateur.
D\xE9tails de l'erreur: ${error.message}`
        );
      }
      const existingIndex = algorithmRegistry.findIndex((p) => p.key === plugin.key);
      if (existingIndex >= 0) {
        console.warn(`[REGISTRY] Mise \xE0 jour de l'algorithme existant : ${plugin.key}`);
        algorithmRegistry[existingIndex] = plugin;
      } else {
        algorithmRegistry.push(plugin);
      }
    };
  }
});

// services/prediction/algorithms/frequency.ts
var frequencyPlugin;
var init_frequency = __esm({
  "services/prediction/algorithms/frequency.ts"() {
    "use strict";
    init_prediction_types();
    frequencyPlugin = {
      key: "frequency" /* FREQUENCY */,
      category: "core",
      stability: "stable",
      mathematicalBasis: "Loi des Grands Nombres et Distribution Empirique Robuste",
      description: "\xC9value la fr\xE9quence historique normalis\xE9e de mani\xE8re robuste aux valeurs aberrantes (outliers).",
      isStrictlyDeterministic: true,
      /**
       * Precomputes median and IQR of frequencies.
       * Uses Number.EPSILON to guarantee division safety.
       */
      precompute(ctx) {
        const values2 = Array.from(ctx.features.freqMap).slice(1).filter((v) => v > 0);
        let cacheVal;
        if (values2.length === 0) {
          cacheVal = { median: 0, iqr: 1 };
        } else {
          const sorted = [...values2].sort((a, b) => a - b);
          const median2 = sorted[Math.floor(sorted.length / 2)];
          const q1 = sorted[Math.floor(sorted.length * 0.25)];
          const q3 = sorted[Math.floor(sorted.length * 0.75)];
          const iqr = Math.max(Number.EPSILON, q3 - q1);
          cacheVal = { median: median2, iqr };
        }
        ctx.pluginCache = ctx.pluginCache || {};
        ctx.pluginCache["frequency" /* FREQUENCY */] = cacheVal;
      },
      /**
       * Evaluates the frequency score of a number.
       * 
       * CRITICAL DESIGN DECISION:
       * Any non-statistical heuristics (such as Digital Root / Numerology) have been completely removed
       * to strictly adhere to the project's statistical philosophy of "Zero Non-Statistical Heuristics".
       * Under the Law of Large Numbers, the expectation of draws is independent of digit sums, and 
       * injecting numerological boosts would distort the gradient landscape and compromise prediction rigor.
       */
      evaluate(num, ctx) {
        const rawFreq = Number(ctx.features.freqMap[num]) || 0;
        if (!ctx.pluginCache?.["frequency" /* FREQUENCY */]) {
          frequencyPlugin.precompute(ctx);
        }
        const cache = ctx.pluginCache["frequency" /* FREQUENCY */];
        const median2 = cache.median;
        const iqr = cache.iqr;
        const slope = 1 / iqr;
        const normalizedScore = 100 / (1 + Math.exp(-slope * (rawFreq - median2)));
        const score = Math.max(0, Math.min(100, normalizedScore));
        return {
          score,
          confidence: 0.95,
          metadata: { rawFreq }
        };
      }
    };
  }
});

// services/kdeService.ts
function gaussianKernel(u) {
  return 1 / SQRT_2PI * Math.exp(-0.5 * u * u);
}
function standardNormalCDF(x) {
  if (x < -8) return 0;
  if (x > 8) return 1;
  const z = Math.abs(x);
  const t = 1 / (1 + 0.2316419 * z);
  const poly = t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const phi = 1 / SQRT_2PI * Math.exp(-0.5 * z * z) * poly;
  return x >= 0 ? 1 - phi : phi;
}
function getQuantile(sorted, q) {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (base + 1 < sorted.length) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  }
  return sorted[base];
}
function calculateSilvermanBandwidth(samples) {
  const n = samples.length;
  if (n <= 1) return 1;
  const m = samples.reduce((a, b) => a + b, 0) / n;
  const variance2 = samples.reduce((acc, v) => acc + Math.pow(v - m, 2), 0) / n;
  const std = Math.sqrt(variance2);
  const sorted = [...samples].sort((a, b) => a - b);
  const q1 = getQuantile(sorted, 0.25);
  const q3 = getQuantile(sorted, 0.75);
  const iqr = q3 - q1;
  const iqrScale = iqr > 0 ? iqr / 1.34 : std;
  const spread = Math.min(std, iqrScale);
  const effectiveSpread = spread > 1e-6 ? spread : Math.max(1, Math.abs(m) * 0.1);
  const h = 0.9 * effectiveSpread * Math.pow(n, -0.2);
  return Math.max(0.2, h);
}
function evaluateKDE(samples, x, customBandwidth) {
  const n = samples.length;
  if (n === 0) {
    return { pdf: 0, cdf: 0.5, bandwidth: 1, logLikelihood: -10 };
  }
  const h = customBandwidth && customBandwidth > 0 ? customBandwidth : calculateSilvermanBandwidth(samples);
  let pdfSum = 0;
  let cdfSum = 0;
  for (let i = 0; i < n; i++) {
    const u = (x - samples[i]) / h;
    pdfSum += gaussianKernel(u);
    cdfSum += standardNormalCDF(u);
  }
  const pdf = pdfSum / (n * h);
  const cdf = cdfSum / n;
  const logLikelihood = Math.log(Math.max(Number.EPSILON, pdf));
  return { pdf, cdf, bandwidth: h, logLikelihood };
}
var SQRT_2PI;
var init_kdeService = __esm({
  "services/kdeService.ts"() {
    "use strict";
    SQRT_2PI = Math.sqrt(2 * Math.PI);
  }
});

// services/prediction/algorithms/gaps.ts
var getDrawSizeConfig, gapsPlugin;
var init_gaps = __esm({
  "services/prediction/algorithms/gaps.ts"() {
    "use strict";
    init_prediction_types();
    init_kdeService();
    getDrawSizeConfig = (ctx) => {
      const domainSize = ctx.features.freqMap?.length ? ctx.features.freqMap.length - 1 : 90;
      const drawSize = ctx.history[0]?.gagnants?.length || 5;
      return { domainSize, drawSize };
    };
    gapsPlugin = {
      key: "gap" /* GAPS */,
      category: "core",
      stability: "stable",
      mathematicalBasis: "Fusion de la CDF G\xE9om\xE9trique Exacte et de l'Estimation par Noyau de Densit\xE9 (KDE) Continue",
      description: "\xC9valuation des \xE9carts entre les sorties vs \xE9cart th\xE9orique via CDF g\xE9om\xE9trique enrichie par lissage continu KDE sur l'historique des \xE9carts.",
      isStrictlyDeterministic: true,
      precompute(ctx) {
        const { domainSize, drawSize } = getDrawSizeConfig(ctx);
        const theoreticalProbability = Math.min(1, drawSize / Math.max(1, domainSize));
        const currentGapsList = [];
        if (ctx.features.gapsMap) {
          for (let i = 1; i <= domainSize; i++) {
            if (typeof ctx.features.gapsMap[i] === "number") {
              currentGapsList.push(ctx.features.gapsMap[i]);
            }
          }
        }
        const kdeBandwidth = calculateSilvermanBandwidth(currentGapsList.length > 0 ? currentGapsList : [10]);
        ctx.pluginCache = ctx.pluginCache || {};
        ctx.pluginCache["gap" /* GAPS */] = {
          theoreticalProbability,
          currentGapsList,
          kdeBandwidth
        };
      },
      evaluate(num, ctx) {
        const currentGap = Number(ctx.features.gapsMap[num]) || 0;
        if (!ctx.pluginCache?.["gap" /* GAPS */]) {
          gapsPlugin.precompute(ctx);
        }
        const cache = ctx.pluginCache["gap" /* GAPS */];
        const theoreticalProbability = cache.theoreticalProbability;
        const currentGapsList = cache.currentGapsList || [];
        const geomCdf = 1 - Math.pow(1 - theoreticalProbability, currentGap);
        const kdeRes = evaluateKDE(currentGapsList, currentGap, cache.kdeBandwidth);
        const empiricalKdeCdf = kdeRes.cdf;
        const fusedCdf = 0.6 * geomCdf + 0.4 * empiricalKdeCdf;
        const gapVelocity = ctx.advancedMetrics?.gapVelocity?.[num] || 0;
        const resistance = ctx.advancedMetrics?.resistance?.[num] || 0;
        const baseScore = fusedCdf * 100;
        const velocityScale = 1 + gapVelocity / 100;
        const resistanceDecay = 1 / (1 + resistance / 100);
        const fusedScore = baseScore * velocityScale * resistanceDecay;
        const score = Math.max(0, Math.min(100, fusedScore));
        return {
          score,
          confidence: 0.95,
          metadata: { currentGap, gapVelocity, resistance, kdePdf: Number(kdeRes.pdf.toFixed(4)), kdeCdf: Number(empiricalKdeCdf.toFixed(4)), bandwidth: Number(cache.kdeBandwidth.toFixed(2)) }
        };
      }
    };
  }
});

// services/prediction/algorithms/markov.ts
function getGameProfile(drawName) {
  const lower = drawName.toLowerCase();
  if (lower.includes("euromillions") || lower.includes("euro million")) {
    return { name: "EuroMillions", mainMax: 50, mainCount: 5, specialMax: 12, specialCount: 2, isSpecialActive: true };
  }
  if (lower.includes("powerball")) {
    return { name: "Powerball", mainMax: 69, mainCount: 5, specialMax: 26, specialCount: 1, isSpecialActive: true };
  }
  if (lower.includes("mega million") || lower.includes("megamillion")) {
    return { name: "Mega Millions", mainMax: 70, mainCount: 5, specialMax: 25, specialCount: 1, isSpecialActive: true };
  }
  return { name: "Loto 5/90", mainMax: 90, mainCount: 5, specialMax: 90, specialCount: 5, isSpecialActive: true };
}
var markovPlugin;
var init_markov = __esm({
  "services/prediction/algorithms/markov.ts"() {
    "use strict";
    init_prediction_types();
    markovPlugin = {
      key: "markov" /* MARKOV */,
      category: "core",
      stability: "stable",
      mathematicalBasis: "Mod\xE9lisation Continue SDE par Processus d'Ornstein-Uhlenbeck & Langevin (Euler-Maruyama)",
      description: "Mod\xE9lise la d\xE9rive (drift) et la volatilit\xE9 continue de l'attractivit\xE9 d'un num\xE9ro par \xE9quation stochastique dans l'espace des phases.",
      isStrictlyDeterministic: true,
      precompute(ctx) {
        const drawName = ctx.drawName || "Loto 5/90";
        const profile = getGameProfile(drawName);
        const domainSize = profile.mainMax;
        const history = ctx.history || [];
        const depth = Math.min(150, history.length);
        const hurst = ctx.statisticalBounds?.hurstExponent ?? 0.5;
        const entropy = ctx.statisticalBounds?.shannonEntropy ?? 0.95;
        const theta = 0.15 * (1 - hurst + 0.1);
        const mu = 5 / domainSize;
        const alpha = 0.25 * (1 + entropy);
        const sigmaSde = 0.05 * entropy;
        const X = new Float64Array(domainSize + 1);
        for (let i = 1; i <= domainSize; i++) {
          X[i] = mu;
        }
        const getDeterministicSeed = (str) => {
          let hash = 0;
          for (let i = 0; i < str.length; i++) {
            hash = (hash << 5) - hash + str.charCodeAt(i);
            hash |= 0;
          }
          return Math.abs(hash);
        };
        const createLcg = (seed) => {
          let s = Math.abs(seed) % 2147483647;
          if (s === 0) s = 1;
          return () => {
            s = s * 16807 % 2147483647;
            return s / 2147483647;
          };
        };
        const getGaussian = (lcg) => {
          const u1 = Math.max(1e-15, lcg());
          const u2 = lcg();
          return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        };
        for (let step = depth - 1; step >= 0; step--) {
          const draw = history[step];
          const winners = new Set(draw?.gagnants || []);
          for (let n = 1; n <= domainSize; n++) {
            const y = winners.has(n) ? 1 : 0;
            const stepSeed = getDeterministicSeed(`${drawName}_sde_${n}_${step}`);
            const lcg = createLcg(stepSeed);
            const dW = getGaussian(lcg) * 1;
            X[n] = X[n] + theta * (mu - X[n]) + alpha * y + sigmaSde * dW;
            if (X[n] < 1e-3) X[n] = 1e-3;
          }
        }
        const validValues = Array.from(X.slice(1, domainSize + 1));
        let median2 = mu;
        let iqr = mu * 0.5;
        if (validValues.length > 0) {
          const sorted = [...validValues].sort((a, b) => a - b);
          median2 = sorted[Math.floor(sorted.length / 2)];
          const q1 = sorted[Math.floor(sorted.length * 0.25)];
          const q3 = sorted[Math.floor(sorted.length * 0.75)];
          iqr = Math.max(1e-6, q3 - q1);
        }
        ctx.pluginCache = ctx.pluginCache || {};
        ctx.pluginCache["markov" /* MARKOV */] = {
          attractionState: X,
          median: median2,
          iqr,
          domainSize
        };
      },
      evaluate(num, ctx) {
        if (!ctx.pluginCache?.["markov" /* MARKOV */]) {
          markovPlugin.precompute(ctx);
        }
        const cache = ctx.pluginCache["markov" /* MARKOV */];
        const X = cache.attractionState;
        const median2 = cache.median;
        const iqr = cache.iqr;
        const domainSize = cache.domainSize;
        if (num < 1 || num > domainSize) {
          return { score: 0, confidence: 0.5 };
        }
        const rawAttraction = X[num] || 0;
        const leaderBoost = ctx.advancedMetrics?.leaderSuccession?.[num] || 0;
        const effectiveAttraction = rawAttraction * (1 + leaderBoost / 100);
        const slope = 1 / iqr;
        const normalizedScore = 100 / (1 + Math.exp(-slope * (effectiveAttraction - median2)));
        const score = Math.max(0, Math.min(100, normalizedScore));
        return {
          score,
          confidence: 0.95,
          metadata: { rawAttraction, leaderBoost }
        };
      }
    };
  }
});

// services/prediction/algorithms/momentum.ts
var momentumPlugin;
var init_momentum = __esm({
  "services/prediction/algorithms/momentum.ts"() {
    "use strict";
    init_prediction_types();
    momentumPlugin = {
      key: "momentum" /* MOMENTUM */,
      category: "core",
      stability: "stable",
      mathematicalBasis: "D\xE9riv\xE9e Premi\xE8re (MOMENTUM) et Seconde (ACCELERATION) de la V\xE9locit\xE9 Temporelle unifi\xE9e",
      description: "Fusion cin\xE9matique continue de la v\xE9locit\xE9 r\xE9cente vs profonde (momentum) et de l'acc\xE9l\xE9ration des cycles d'apparition.",
      isStrictlyDeterministic: true,
      precompute(ctx) {
        const values2 = Array.from(ctx.features.momentumMap).slice(1).filter((v) => v > 0);
        const sorted = [...values2].sort((a, b) => a - b);
        const median2 = sorted[Math.floor(sorted.length / 2)] || 0;
        const q1 = sorted[Math.floor(sorted.length * 0.25)] || 0;
        const q3 = sorted[Math.floor(sorted.length * 0.75)] || 0;
        const iqr = Math.max(Number.EPSILON, q3 - q1);
        const allDiffs = [];
        const maxNum = ctx.features.freqMap?.length ? ctx.features.freqMap.length - 1 : 90;
        const recentFreqs = new Array(maxNum + 1).fill(0);
        const olderFreqs = new Array(maxNum + 1).fill(0);
        ctx.history.slice(0, 10).forEach((d) => {
          if (Array.isArray(d.gagnants)) {
            d.gagnants.forEach((n) => {
              if (n <= maxNum) recentFreqs[n]++;
            });
          }
        });
        ctx.history.slice(10, 30).forEach((d) => {
          if (Array.isArray(d.gagnants)) {
            d.gagnants.forEach((n) => {
              if (n <= maxNum) olderFreqs[n]++;
            });
          }
        });
        for (let i = 1; i <= maxNum; i++) {
          allDiffs.push(Math.abs(recentFreqs[i] - olderFreqs[i] / 2));
        }
        const sortedDiffs = [...allDiffs].sort((a, b) => a - b);
        const medianDiff = sortedDiffs[Math.floor(sortedDiffs.length / 2)] || 0;
        const q1Diff = sortedDiffs[Math.floor(sortedDiffs.length * 0.25)] || 0;
        const q3Diff = sortedDiffs[Math.floor(sortedDiffs.length * 0.75)] || 0;
        const iqrDiff = Math.max(Number.EPSILON, q3Diff - q1Diff);
        ctx.pluginCache = ctx.pluginCache || {};
        ctx.pluginCache["momentum" /* MOMENTUM */] = {
          median: median2,
          iqr,
          medianDiff,
          iqrDiff,
          recentFreqs,
          olderFreqs
        };
      },
      evaluate(num, ctx) {
        if (!ctx.pluginCache?.["momentum" /* MOMENTUM */]) {
          momentumPlugin.precompute(ctx);
        }
        const cache = ctx.pluginCache["momentum" /* MOMENTUM */];
        const rawMom = Number(ctx.features.momentumMap[num]) || 0;
        const slope = 1 / cache.iqr;
        const normMomentum = 100 / (1 + Math.exp(-slope * (rawMom - cache.median)));
        const recentFreq = cache.recentFreqs[num] || 0;
        const olderFreq = (cache.olderFreqs[num] || 0) / 2;
        const diff = recentFreq - olderFreq;
        const slopeDiff = 1 / cache.iqrDiff;
        const normAcceleration = 100 / (1 + Math.exp(-slopeDiff * (diff - cache.medianDiff)));
        const hawkesBoost = ctx.advancedMetrics?.hawkesExcitation?.[num] || 0;
        const baseFused = Math.sqrt(normMomentum * normAcceleration) || (normMomentum + normAcceleration) / 2;
        const fused = baseFused * (1 + hawkesBoost / 100);
        const score = Math.max(0, Math.min(100, fused));
        return {
          score,
          confidence: 0.95,
          metadata: { rawMom, diff, hawkesBoost }
        };
      }
    };
  }
});

// services/prediction/algorithms/affinity.ts
function getGameProfile2(drawName) {
  const lower = drawName.toLowerCase();
  if (lower.includes("euromillions") || lower.includes("euro million")) {
    return { name: "EuroMillions", mainMax: 50, mainCount: 5, specialMax: 12, specialCount: 2, isSpecialActive: true };
  }
  if (lower.includes("powerball")) {
    return { name: "Powerball", mainMax: 69, mainCount: 5, specialMax: 26, specialCount: 1, isSpecialActive: true };
  }
  if (lower.includes("mega million") || lower.includes("megamillion")) {
    return { name: "Mega Millions", mainMax: 70, mainCount: 5, specialMax: 25, specialCount: 1, isSpecialActive: true };
  }
  return { name: "Loto 5/90", mainMax: 90, mainCount: 5, specialMax: 90, specialCount: 5, isSpecialActive: true };
}
var affinityPlugin;
var init_affinity = __esm({
  "services/prediction/algorithms/affinity.ts"() {
    "use strict";
    init_prediction_types();
    affinityPlugin = {
      key: "affinity" /* AFFINITY */,
      category: "advanced",
      stability: "experimental",
      mathematicalBasis: "R\xE9gularisation de Copules Jointes de Gumbel et Clayton (Asym\xE9trie des Queues Intra-Jeu)",
      description: "Analyse la co-occurrence synergique asym\xE9trique et non-lin\xE9aire des boules sp\xE9ciales et principales au sein du jeu via les Copules de Gumbel et Clayton.",
      isStrictlyDeterministic: true,
      precompute(ctx) {
        const drawName = ctx.drawName || "Loto 5/90";
        const profile = getGameProfile2(drawName);
        const mainMax = profile.mainMax;
        const specialMax = profile.specialMax;
        const history = ctx.history || [];
        const countMain = new Float64Array(mainMax + 1);
        const countSpecial = new Float64Array(specialMax + 1);
        const jointCount = Array(mainMax + 1).fill(0).map(() => new Float64Array(specialMax + 1));
        let totalDrawsWithSpecial = 0;
        for (const draw of history) {
          const winners = draw.gagnants || [];
          const specials = draw.machine || [];
          if (winners.length > 0 && specials.length > 0) {
            totalDrawsWithSpecial++;
            for (const w of winners) {
              if (w >= 1 && w <= mainMax) {
                countMain[w]++;
              }
            }
            for (const s of specials) {
              if (s >= 1 && s <= specialMax) {
                countSpecial[s]++;
              }
            }
            for (const w of winners) {
              for (const s of specials) {
                if (w >= 1 && w <= mainMax && s >= 1 && s <= specialMax) {
                  jointCount[w][s]++;
                }
              }
            }
          }
        }
        if (totalDrawsWithSpecial === 0) {
          ctx.pluginCache = ctx.pluginCache || {};
          ctx.pluginCache["affinity" /* AFFINITY */] = {
            rawCopulaScores: new Float64Array(mainMax + 1),
            median: 0,
            iqr: 1,
            mainMax
          };
          return;
        }
        const getUniformMarginals = (counts, maxVal) => {
          const marginals = new Float64Array(maxVal + 1);
          const indexed = Array.from({ length: maxVal }, (_, i) => ({ val: counts[i + 1], index: i + 1 }));
          indexed.sort((a, b) => a.val - b.val);
          for (let r = 0; r < maxVal; r++) {
            const item = indexed[r];
            marginals[item.index] = 0.01 + 0.98 * (r / (maxVal - 1 || 1));
          }
          return marginals;
        };
        const u = getUniformMarginals(countMain, mainMax);
        const v = getUniformMarginals(countSpecial, specialMax);
        let sumExcess = 0;
        let countExcess = 0;
        let sumDeficit = 0;
        let countDeficit = 0;
        for (let i = 1; i <= mainMax; i++) {
          const pI = countMain[i] / totalDrawsWithSpecial;
          if (pI === 0) continue;
          for (let j = 1; j <= specialMax; j++) {
            const pJ = countSpecial[j] / totalDrawsWithSpecial;
            if (pJ === 0) continue;
            const pJoint = jointCount[i][j] / totalDrawsWithSpecial;
            const ratio = pJoint / (pI * pJ);
            if (ratio > 1) {
              sumExcess += ratio - 1;
              countExcess++;
            } else if (ratio < 1) {
              sumDeficit += 1 - ratio;
              countDeficit++;
            }
          }
        }
        const avgExcess = countExcess > 0 ? sumExcess / countExcess : 0.05;
        const avgDeficit = countDeficit > 0 ? sumDeficit / countDeficit : 0.05;
        const thetaGumbel = 1 + Math.log(1 + avgExcess);
        const thetaClayton = Math.max(0.1, Math.log(1 + avgDeficit));
        const rawCopulaScores = new Float64Array(mainMax + 1);
        for (let i = 1; i <= mainMax; i++) {
          let copulaSum = 0;
          let totalWeight = 0;
          const uVal = u[i];
          for (let j = 1; j <= specialMax; j++) {
            const vVal = v[j];
            const pI = countMain[i] / totalDrawsWithSpecial;
            const pJ = countSpecial[j] / totalDrawsWithSpecial;
            const pJoint = jointCount[i][j] / totalDrawsWithSpecial;
            let cValue = 0;
            if (pJoint > pI * pJ) {
              const logU = -Math.log(uVal);
              const logV = -Math.log(vVal);
              cValue = Math.exp(-Math.pow(Math.pow(logU, thetaGumbel) + Math.pow(logV, thetaGumbel), 1 / thetaGumbel));
            } else {
              cValue = Math.pow(Math.max(1e-15, Math.pow(uVal, -thetaClayton) + Math.pow(vVal, -thetaClayton) - 1), -1 / thetaClayton);
            }
            copulaSum += cValue * vVal;
            totalWeight += vVal;
          }
          rawCopulaScores[i] = totalWeight > 0 ? copulaSum / totalWeight : 0;
        }
        const validScores = Array.from(rawCopulaScores.slice(1, mainMax + 1));
        let median2 = 0;
        let iqr = 1;
        if (validScores.length > 0) {
          const sorted = [...validScores].sort((a, b) => a - b);
          median2 = sorted[Math.floor(sorted.length / 2)];
          const q1 = sorted[Math.floor(sorted.length * 0.25)];
          const q3 = sorted[Math.floor(sorted.length * 0.75)];
          iqr = Math.max(1e-6, q3 - q1);
        }
        ctx.pluginCache = ctx.pluginCache || {};
        ctx.pluginCache["affinity" /* AFFINITY */] = {
          rawCopulaScores,
          median: median2,
          iqr,
          mainMax
        };
      },
      evaluate(num, ctx) {
        if (!ctx.pluginCache?.["affinity" /* AFFINITY */]) {
          this.precompute(ctx);
        }
        const cache = ctx.pluginCache["affinity" /* AFFINITY */];
        const rawCopulaScores = cache.rawCopulaScores;
        const median2 = cache.median;
        const iqr = cache.iqr;
        const mainMax = cache.mainMax;
        if (num < 1 || num > mainMax) {
          return { score: 0, confidence: 0.5 };
        }
        const rawScore = rawCopulaScores[num] || 0;
        const zScore = (rawScore - median2) / iqr;
        const score = 100 / (1 + Math.exp(-2 * zScore));
        return {
          score: Math.max(0, Math.min(100, score)),
          confidence: 0.85,
          metadata: { rawScore, zScore }
        };
      }
    };
  }
});

// services/prediction/algorithms/signals.ts
var getRobustStats, sigmoidNormalize, spectralPlugin, fractalPlugin;
var init_signals = __esm({
  "services/prediction/algorithms/signals.ts"() {
    "use strict";
    init_prediction_types();
    getRobustStats = (arr) => {
      if (arr.length === 0) return { median: 0, iqr: 1 };
      const sorted = [...arr].sort((a, b) => a - b);
      const median2 = sorted[Math.floor(sorted.length / 2)] || 0;
      const q1 = sorted[Math.floor(sorted.length * 0.25)] || 0;
      const q3 = sorted[Math.floor(sorted.length * 0.75)] || 0;
      return { median: median2, iqr: Math.max(Number.EPSILON, q3 - q1) };
    };
    sigmoidNormalize = (val, median2, iqr) => {
      const slope = 1 / iqr;
      return 100 / (1 + Math.exp(-slope * (val - median2)));
    };
    spectralPlugin = {
      key: "spectral" /* SPECTRAL */,
      category: "advanced",
      stability: "stable",
      mathematicalBasis: "Transform\xE9e de Fourier Discr\xE8te (DFT) combin\xE9e \xE0 l'Index de Volatilit\xE9",
      description: "\xC9nergie dominante de la d\xE9composition fr\xE9quentielle pond\xE9r\xE9e contin\xFBment par la volatilit\xE9 temporelle.",
      isStrictlyDeterministic: true,
      precompute(ctx) {
        const metrics = ctx.advancedMetrics?.spectral;
        const energies = metrics?.map((s) => s.energy).filter((v) => typeof v === "number") || [];
        const robustStats = energies.length > 0 ? getRobustStats(energies) : { median: 0, iqr: 1 };
        ctx.pluginCache = ctx.pluginCache || {};
        ctx.pluginCache["spectral" /* SPECTRAL */] = { robustStats };
      },
      evaluate(num, ctx) {
        if (!ctx.pluginCache?.["spectral" /* SPECTRAL */]) {
          this.precompute(ctx);
        }
        const cache = ctx.pluginCache["spectral" /* SPECTRAL */];
        const metrics = ctx.advancedMetrics?.spectral;
        const energy = metrics?.find((s) => s.number === num)?.energy || 0;
        const { median: median2, iqr } = cache.robustStats;
        const normSpectral = Math.max(0, Math.min(100, sigmoidNormalize(energy, median2, iqr)));
        const volMap = ctx.advancedMetrics?.volatility;
        let volFactor = 1;
        if (volMap && typeof volMap === "object") {
          const v = volMap[num];
          if (typeof v === "number") {
            volFactor = 1 + Math.max(-0.5, Math.min(0.5, v / 100));
          }
        } else if (typeof volMap === "number") {
          volFactor = 1 + Math.max(-0.5, Math.min(0.5, volMap / 100));
        }
        const score = Math.max(0, Math.min(100, normSpectral * volFactor));
        return {
          score,
          confidence: 0.95,
          metadata: {
            energy: parseFloat(energy.toFixed(4)),
            volFactor: parseFloat(volFactor.toFixed(4)),
            normSpectral: parseFloat(normSpectral.toFixed(4))
          }
        };
      }
    };
    fractalPlugin = {
      key: "fractal" /* FRACTAL */,
      category: "advanced",
      stability: "stable",
      mathematicalBasis: "Exposant de Hurst (Analyse R/S), Coefficients d'Ondelettes et Dimension Fractale de Hausdorff",
      description: "Analyse multi-\xE9chelle mesurant la m\xE9moire longue d\xE9byas\xE9e (Hurst), la r\xE9gularit\xE9 locale (ondelettes) et l'attracteur de Lyapunov.",
      isStrictlyDeterministic: true,
      precompute(ctx) {
        const metricsWavelet = ctx.advancedMetrics?.wavelet;
        const energiesWavelet = metricsWavelet?.map((s) => s.energy).filter((v) => typeof v === "number") || [];
        const waveletStats = energiesWavelet.length > 0 ? getRobustStats(energiesWavelet) : { median: 0, iqr: 1 };
        const resValues = Object.values(ctx.advancedMetrics?.fractalResonance || {}).filter((v) => typeof v === "number");
        const resStats = resValues.length > 0 ? getRobustStats(resValues) : { median: 0, iqr: 1 };
        ctx.pluginCache = ctx.pluginCache || {};
        ctx.pluginCache["fractal" /* FRACTAL */] = { waveletStats, resStats };
      },
      evaluate(num, ctx) {
        if (!ctx.pluginCache?.["fractal" /* FRACTAL */]) {
          this.precompute(ctx);
        }
        const cache = ctx.pluginCache["fractal" /* FRACTAL */];
        const metricsFractal = ctx.advancedMetrics?.fractal;
        const hurst = metricsFractal?.find((s) => s.number === num)?.hurst ?? 0.5;
        const normHurst = 50 + 50 * Math.tanh((hurst - 0.5) * 4);
        const metricsWavelet = ctx.advancedMetrics?.wavelet;
        const energy = metricsWavelet?.find((s) => s.number === num)?.energy || 0;
        const { median: medW, iqr: iqrW } = cache.waveletStats;
        const normWavelet = Math.max(0, Math.min(100, sigmoidNormalize(energy, medW, iqrW)));
        const resVal = ctx.advancedMetrics?.fractalResonance?.[num] || 0;
        const { median: medRes, iqr: iqrRes } = cache.resStats;
        const normFractalRes = Math.max(0, Math.min(100, sigmoidNormalize(resVal, medRes, iqrRes)));
        const lyapunov = ctx.advancedMetrics?.topologicalLyapunov?.[num] || 0;
        const boundedLyapunovMultiplier = 1 + Math.max(-0.5, Math.min(0.5, lyapunov / 100));
        const safeHurst = Math.max(Number.EPSILON, normHurst);
        const safeWavelet = Math.max(Number.EPSILON, normWavelet);
        const safeResonance = Math.max(Number.EPSILON, normFractalRes);
        const baseFused = Math.pow(safeHurst * safeWavelet * safeResonance, 1 / 3);
        const fused = baseFused * boundedLyapunovMultiplier;
        const score = Math.max(0, Math.min(100, fused));
        return {
          score,
          confidence: 0.95,
          metadata: {
            hurst: parseFloat(hurst.toFixed(4)),
            normHurst: parseFloat(normHurst.toFixed(4)),
            energy: parseFloat(energy.toFixed(4)),
            normWavelet: parseFloat(normWavelet.toFixed(4)),
            resVal: parseFloat(resVal.toFixed(4)),
            normFractalRes: parseFloat(normFractalRes.toFixed(4)),
            lyapunov: parseFloat(lyapunov.toFixed(4)),
            boundedLyapunovMultiplier: parseFloat(boundedLyapunovMultiplier.toFixed(4))
          }
        };
      }
    };
  }
});

// services/prediction/algorithms/spatial.ts
var getSpatialSigma, spatialPlugin;
var init_spatial = __esm({
  "services/prediction/algorithms/spatial.ts"() {
    "use strict";
    init_prediction_types();
    getSpatialSigma = (ctx) => {
      const variance2 = ctx.statisticalBounds?.variance;
      const safeVariance = typeof variance2 === "number" && variance2 > 0 ? variance2 : 90;
      return Math.sqrt(safeVariance) / 3;
    };
    spatialPlugin = {
      key: "spatial" /* SPATIAL */,
      category: "advanced",
      stability: "stable",
      mathematicalBasis: "D\xE9croissance Gaussienne Spatiale et Diagnostic de Proximit\xE9 G\xE9om\xE9trique",
      description: "Analyse g\xE9om\xE9trique unifiant les clusters spatiaux de Laplace et la proximit\xE9 gaussienne avec bornage et normalisation continue bas\xE9e sur les donn\xE9es r\xE9elles.",
      isStrictlyDeterministic: true,
      precompute(ctx) {
        const sigma = getSpatialSigma(ctx);
        let spatialStats = { median: 50, iqr: 15 };
        const spatial = ctx.advancedMetrics?.spatial;
        if (spatial && !Array.isArray(spatial) && typeof spatial === "object") {
          const map = spatial;
          const values2 = Object.values(map).filter((v) => typeof v === "number" && v > 0);
          if (values2.length > 0) {
            const sorted = [...values2].sort((a, b) => a - b);
            const median2 = sorted[Math.floor(sorted.length / 2)] || 0;
            const q1 = sorted[Math.floor(sorted.length * 0.25)] || 0;
            const q3 = sorted[Math.floor(sorted.length * 0.75)] || 0;
            spatialStats = { median: median2, iqr: Math.max(Number.EPSILON, q3 - q1) };
          }
        }
        let proximityStats = { median: 0.3, iqr: 0.1 };
        const proxValues = Object.values(ctx.advancedMetrics?.proximityDiagnostic || {}).filter((v) => typeof v === "number" && v > 0);
        if (proxValues.length > 0) {
          const sortedProx = [...proxValues].sort((a, b) => a - b);
          const medianProx = sortedProx[Math.floor(sortedProx.length / 2)] || 0;
          const q1Prox = sortedProx[Math.floor(sortedProx.length * 0.25)] || 0;
          const q3Prox = sortedProx[Math.floor(sortedProx.length * 0.75)] || 0;
          proximityStats = { median: medianProx, iqr: Math.max(Number.EPSILON, q3Prox - q1Prox) };
        }
        ctx.pluginCache = ctx.pluginCache || {};
        ctx.pluginCache["spatial" /* SPATIAL */] = { sigma, spatialStats, proximityStats };
      },
      evaluate(num, ctx) {
        if (!ctx.pluginCache?.["spatial" /* SPATIAL */]) {
          this.precompute(ctx);
        }
        const cache = ctx.pluginCache["spatial" /* SPATIAL */];
        let normSpatial = cache.spatialStats.median;
        const spatial = ctx.advancedMetrics?.spatial;
        if (Array.isArray(spatial)) {
          let minSpatialDist = 999;
          spatial.forEach((sNum) => {
            minSpatialDist = Math.min(minSpatialDist, Math.abs(sNum - num));
          });
          const safeSigma = Math.max(Number.EPSILON, cache.sigma);
          normSpatial = 100 * Math.exp(-0.5 * Math.pow(minSpatialDist / safeSigma, 2));
        } else if (spatial && typeof spatial === "object") {
          const map = spatial;
          const val = map[num] || 0;
          const { median: median2, iqr } = cache.spatialStats;
          const slope = 1 / iqr;
          normSpatial = 100 / (1 + Math.exp(-slope * (val - median2)));
        }
        const proximityVal = ctx.advancedMetrics?.proximityDiagnostic?.[num] || 0;
        const { median: medP, iqr: iqrP } = cache.proximityStats;
        const slopeProx = 1 / iqrP;
        const normProximity = 100 / (1 + Math.exp(-slopeProx * (proximityVal - medP)));
        const anomalyBoost = ctx.advancedMetrics?.anomalyDetection?.[num] || 0;
        const safeNormSpatial = Math.max(Number.EPSILON, normSpatial);
        const safeNormProximity = Math.max(Number.EPSILON, normProximity);
        const baseFused = Math.sqrt(safeNormSpatial * safeNormProximity);
        const boundedAnomalyMultiplier = 1 + Math.min(0.5, anomalyBoost / 100);
        const fused = baseFused * boundedAnomalyMultiplier;
        const score = Math.max(0, Math.min(100, fused));
        return {
          score,
          confidence: 0.95,
          metadata: {
            normSpatial: parseFloat(normSpatial.toFixed(4)),
            normProximity: parseFloat(normProximity.toFixed(4)),
            anomalyBoost: parseFloat(anomalyBoost.toFixed(4)),
            boundedAnomalyMultiplier: parseFloat(boundedAnomalyMultiplier.toFixed(4)),
            empiricalSigma: parseFloat(cache.sigma.toFixed(4))
          }
        };
      }
    };
  }
});

// services/prediction/algorithms/temporalBayes.ts
var temporalPlugin, bayesPlugin;
var init_temporalBayes = __esm({
  "services/prediction/algorithms/temporalBayes.ts"() {
    "use strict";
    init_prediction_types();
    temporalPlugin = {
      key: "temporal" /* TEMPORAL */,
      category: "advanced",
      stability: "stable",
      mathematicalBasis: "Fusion de Mod\xE8le Temporel Continu (Survie) et de Loi de Poisson",
      description: "Mod\xE8le temporel unifi\xE9 combinant les tendances temporelles profondes et l'esp\xE9rance math\xE9matique de Poisson via une moyenne g\xE9om\xE9trique pond\xE9r\xE9e continue.",
      isStrictlyDeterministic: true,
      precompute(ctx) {
        const DOMAIN_SIZE4 = 90;
        const tempScores = new Float64Array(DOMAIN_SIZE4 + 1);
        const poissonScores = new Float64Array(DOMAIN_SIZE4 + 1);
        const temporalMap = ctx.advancedMetrics?.temporal || {};
        const poissonMap = ctx.advancedMetrics?.poisson || {};
        for (let i = 1; i <= DOMAIN_SIZE4; i++) {
          tempScores[i] = Number(temporalMap[i]) || 0;
          poissonScores[i] = Number(poissonMap[i]) || 0;
        }
        ctx.pluginCache = ctx.pluginCache || {};
        ctx.pluginCache["temporal" /* TEMPORAL */] = {
          tempScores,
          poissonScores
        };
      },
      evaluate(num, ctx) {
        if (!ctx.pluginCache?.["temporal" /* TEMPORAL */]) {
          this.precompute(ctx);
        }
        const cache = ctx.pluginCache["temporal" /* TEMPORAL */];
        const tempVal = cache.tempScores[num] || 0;
        const poissonVal = cache.poissonScores[num] || 0;
        const safeTemp = Math.max(Number.EPSILON, tempVal);
        const safePoisson = Math.max(Number.EPSILON, poissonVal);
        const fusedVal = Math.pow(safeTemp, 0.6) * Math.pow(safePoisson, 0.4);
        const score = Math.max(0, Math.min(100, fusedVal));
        return {
          score,
          confidence: 0.95,
          metadata: {
            tempVal: parseFloat(tempVal.toFixed(4)),
            poissonVal: parseFloat(poissonVal.toFixed(4)),
            weightTemporal: 0.6,
            weightPoisson: 0.4,
            fusionMethod: "Weighted Geometric Mean with Epsilon Floor"
          }
        };
      }
    };
    bayesPlugin = {
      key: "bayes" /* BAYES */,
      category: "core",
      stability: "stable",
      mathematicalBasis: "Inf\xE9rence Bayesienne et Probabilit\xE9 Conditionnelle Continue (Modul\xE9e par l'Intuition du Meta LLM)",
      description: "\xC9value les probabilit\xE9s a posteriori bay\xE9siennes pour chaque num\xE9ro avec un ajustement d'ensemble LLM born\xE9.",
      isStrictlyDeterministic: true,
      precompute(ctx) {
        const DOMAIN_SIZE4 = 90;
        const bayesScores = new Float64Array(DOMAIN_SIZE4 + 1);
        const aiScores = new Float64Array(DOMAIN_SIZE4 + 1);
        const bayesMap = ctx.advancedMetrics?.bayes || {};
        const aiMap = ctx.advancedMetrics?.aiIntuition || {};
        for (let i = 1; i <= DOMAIN_SIZE4; i++) {
          bayesScores[i] = Number(bayesMap[i]) || 0;
          aiScores[i] = Number(aiMap[i]) || 0;
        }
        ctx.pluginCache = ctx.pluginCache || {};
        ctx.pluginCache["bayes" /* BAYES */] = {
          bayesScores,
          aiScores
        };
      },
      evaluate(num, ctx) {
        if (!ctx.pluginCache?.["bayes" /* BAYES */]) {
          this.precompute(ctx);
        }
        const cache = ctx.pluginCache["bayes" /* BAYES */];
        const bayesVal = cache.bayesScores[num] || 0;
        const aiVal = cache.aiScores[num] || 0;
        const boundedAiVal = Math.max(-50, Math.min(50, aiVal));
        const fusedVal = bayesVal * (1 + boundedAiVal / 100);
        const score = Math.max(0, Math.min(100, fusedVal));
        return {
          score,
          confidence: 0.95,
          metadata: {
            bayesVal: parseFloat(bayesVal.toFixed(4)),
            aiVal: parseFloat(aiVal.toFixed(4)),
            boundedAiVal: parseFloat(boundedAiVal.toFixed(4)),
            fusionMethod: "Bayesian Evidence with Bounded AI Escalation"
          }
        };
      }
    };
  }
});

// services/prediction/algorithms/echoState.ts
function initDeterministicReservoir(inputSize, spectralRadius, drawName) {
  if (W_in_map[drawName] && W_res_map[drawName] && W_in_map[drawName][0].length === inputSize) return;
  const seedStr = `${drawName}_ESN_init_v12`;
  const prng = new LCG(seedStr);
  W_in_map[drawName] = Array(RESERVOIR_SIZE).fill(0).map(
    () => Array(inputSize).fill(0).map(() => (prng.next() * 2 - 1) * 0.1)
  );
  W_res_map[drawName] = Array(RESERVOIR_SIZE).fill(0).map(
    () => Array(RESERVOIR_SIZE).fill(0).map(() => {
      if (prng.next() > 0.2) return 0;
      return prng.next() * 2 - 1;
    })
  );
  let maxSum = 0;
  const wRes = W_res_map[drawName];
  for (let i = 0; i < RESERVOIR_SIZE; i++) {
    let sum = 0;
    for (let j = 0; j < RESERVOIR_SIZE; j++) {
      sum += Math.abs(wRes[i][j]);
    }
    if (sum > maxSum) maxSum = sum;
  }
  const scale = maxSum > 0 ? spectralRadius / maxSum : 1;
  for (let i = 0; i < RESERVOIR_SIZE; i++) {
    for (let j = 0; j < RESERVOIR_SIZE; j++) {
      wRes[i][j] *= scale;
    }
  }
}
var RESERVOIR_SIZE, LEAKY_RATE, W_res_map, W_in_map, echoStateNetworkPlugin;
var init_echoState = __esm({
  "services/prediction/algorithms/echoState.ts"() {
    "use strict";
    init_prediction_types();
    init_mathUtils();
    init_storeStub();
    RESERVOIR_SIZE = 64;
    LEAKY_RATE = 0.3;
    W_res_map = {};
    W_in_map = {};
    echoStateNetworkPlugin = {
      key: "echo_state" /* ECHO_STATE */,
      category: "advanced",
      stability: "experimental",
      mathematicalBasis: "Reservoir Computing (Echo State Network) D\xE9terministe",
      description: "Projections dynamiques non-lin\xE9aires des s\xE9ries temporelles sans gradient.",
      isStrictlyDeterministic: true,
      precompute(ctx) {
        if (!ctx.history || ctx.history.length < 10) return;
        const activeDraw = useNexusStore.getState().drawName || "Reveil";
        const baseEntropy = ctx.statisticalBounds?.shannonEntropy ?? 3.5;
        const dynamicSpectralRadius = Math.max(0.7, Math.min(0.98, 0.9 + 0.05 * (3.5 - baseEntropy)));
        const N = Math.min(ctx.history.length, 128);
        const chronologicalHistory = ctx.history.slice(0, N).reverse();
        initDeterministicReservoir(90, dynamicSpectralRadius, activeDraw);
        const W_in = W_in_map[activeDraw];
        const W_res = W_res_map[activeDraw];
        let state = new Float64Array(RESERVOIR_SIZE);
        const statesMatrix = [];
        for (let t = 0; t < chronologicalHistory.length; t++) {
          const draw = chronologicalHistory[t];
          const u = new Float64Array(90);
          draw.gagnants.forEach((n) => {
            if (n >= 1 && n <= 90) u[n - 1] = 1;
          });
          const nextState = new Float64Array(RESERVOIR_SIZE);
          for (let i = 0; i < RESERVOIR_SIZE; i++) {
            let inSum = 0;
            for (let j = 0; j < 90; j++) inSum += W_in[i][j] * u[j];
            let resSum = 0;
            for (let j = 0; j < RESERVOIR_SIZE; j++) resSum += W_res[i][j] * state[j];
            const activation = Math.tanh(inSum + resSum);
            nextState[i] = (1 - LEAKY_RATE) * state[i] + LEAKY_RATE * activation;
          }
          state = nextState;
          statesMatrix.push(Array.from(state));
        }
        const finalState = state;
        const numberScores = new Float64Array(91);
        for (let t = 0; t < statesMatrix.length - 1; t++) {
          const s = statesMatrix[t];
          const nextDraw = chronologicalHistory[t + 1].gagnants;
          let dot = 0;
          let magS = 0;
          let magF = 0;
          for (let i = 0; i < RESERVOIR_SIZE; i++) {
            dot += s[i] * finalState[i];
            magS += s[i] * s[i];
            magF += finalState[i] * finalState[i];
          }
          const similarity = dot / (Math.sqrt(magS) * Math.sqrt(magF) + Number.EPSILON);
          nextDraw.forEach((n) => {
            if (n >= 1 && n <= 90) {
              numberScores[n] += (similarity + 1) / 2;
            }
          });
        }
        ctx.pluginCache = ctx.pluginCache || {};
        ctx.pluginCache["echo_state" /* ECHO_STATE */] = {
          scores: Array.from(numberScores),
          spectralRadiusUsed: dynamicSpectralRadius
        };
      },
      evaluate(num, ctx) {
        if (!ctx.pluginCache?.["echo_state" /* ECHO_STATE */]) {
          this.precompute(ctx);
        }
        const cache = ctx.pluginCache?.["echo_state" /* ECHO_STATE */];
        if (!cache || !cache.scores) {
          return { score: 50, confidence: 10 };
        }
        const rawScore = cache.scores[num];
        const allScores = [...cache.scores.slice(1)].filter((s) => s > 0).sort((a, b) => a - b);
        const max = allScores[allScores.length - 1] || 1;
        const scale = 100 / (max + Number.EPSILON);
        const score = Math.max(0, Math.min(100, rawScore * scale));
        return {
          score,
          confidence: 85,
          // Réseau de neurones déterministe
          metadata: { rawScore, spectralRadius: cache.spectralRadiusUsed }
        };
      }
    };
  }
});

// services/prediction/algorithms/gapSequence.ts
function calculateHurstExponent(seq) {
  const N = seq.length;
  if (N < 4) return 0.5;
  const mean4 = seq.reduce((a, b) => a + b, 0) / N;
  let sumSq = 0;
  let maxZ = -Infinity;
  let minZ = Infinity;
  let currentZ = 0;
  for (let i = 0; i < N; i++) {
    const diff = seq[i] - mean4;
    sumSq += diff * diff;
    currentZ += diff;
    if (currentZ > maxZ) maxZ = currentZ;
    if (currentZ < minZ) minZ = currentZ;
  }
  const R = maxZ - minZ;
  const S = Math.sqrt(sumSq / N) || Number.EPSILON;
  const RS = R / S;
  const hurst = Math.log(RS) / Math.log(N);
  return isNaN(hurst) || !isFinite(hurst) ? 0.5 : Math.max(0.01, Math.min(0.99, hurst));
}
var gapSequencePlugin;
var init_gapSequence = __esm({
  "services/prediction/algorithms/gapSequence.ts"() {
    "use strict";
    init_prediction_types();
    init_kdeService();
    gapSequencePlugin = {
      key: "gap_sequence" /* GAP_SEQUENCE */,
      category: "advanced",
      stability: "stable",
      mathematicalBasis: "Autocorr\xE9lation de Lag-1, Variance continue et Processus Stochastique de Retour \xE0 la Moyenne",
      description: "Analyse les s\xE9quences historiques d'\xE9carts d'un num\xE9ro pour d\xE9tecter des patterns de rebond cycliques via l'autocorr\xE9lation (Lag-1) et projeter le prochain \xE9cart attendu.",
      isStrictlyDeterministic: true,
      precompute(ctx) {
        const N = 90;
        const history = ctx.history;
        const sortedHistory = [...history].reverse();
        const totalDraws = sortedHistory.length;
        const lastSeenIndex = {};
        const gapSequences = {};
        for (let i = 1; i <= N; i++) {
          lastSeenIndex[i] = -1;
          gapSequences[i] = [];
        }
        sortedHistory.forEach((draw, index) => {
          (draw.gagnants || []).forEach((num) => {
            if (num >= 1 && num <= N) {
              const gap = index - lastSeenIndex[num] - 1;
              gapSequences[num].push(gap);
              lastSeenIndex[num] = index;
            }
          });
        });
        const patternData = {};
        for (let num = 1; num <= N; num++) {
          const seq = gapSequences[num];
          const currentGap = totalDraws - lastSeenIndex[num] - 1;
          if (seq.length < 2) {
            patternData[num] = {
              currentGap,
              expectedNextGap: currentGap,
              lag1Autocorrelation: 0,
              meanGap: currentGap,
              stdGap: 1,
              hurstExponent: 0.5
            };
            continue;
          }
          const n = seq.length;
          const meanGap = seq.reduce((acc, val) => acc + val, 0) / n;
          const variance2 = seq.reduce((acc, val) => acc + Math.pow(val - meanGap, 2), 0) / n;
          const stdGap = Math.sqrt(variance2) || 1;
          let numerator = 0;
          let denominator = 0;
          for (let i = 1; i < n; i++) {
            numerator += (seq[i] - meanGap) * (seq[i - 1] - meanGap);
          }
          for (let i = 0; i < n; i++) {
            denominator += Math.pow(seq[i] - meanGap, 2);
          }
          const lag1Autocorrelation = denominator > 0 ? numerator / denominator : 0;
          const lastGap = seq[n - 1];
          let expectedNextGap = meanGap + lag1Autocorrelation * (lastGap - meanGap);
          expectedNextGap = Math.max(0, expectedNextGap);
          const hurstExponent = calculateHurstExponent(seq);
          patternData[num] = {
            currentGap,
            expectedNextGap,
            lag1Autocorrelation,
            meanGap,
            stdGap,
            hurstExponent,
            numGaps: n
          };
        }
        ctx.pluginCache = ctx.pluginCache || {};
        ctx.pluginCache["gap_sequence" /* GAP_SEQUENCE */] = patternData;
      },
      evaluate(num, ctx) {
        if (!ctx.pluginCache?.["gap_sequence" /* GAP_SEQUENCE */]) {
          this.precompute(ctx);
        }
        const data = ctx.pluginCache["gap_sequence" /* GAP_SEQUENCE */][num];
        if (!data) return { score: 50, confidence: 0.5 };
        const { currentGap, expectedNextGap, stdGap, meanGap, lag1Autocorrelation, hurstExponent, numGaps } = data;
        const z = (currentGap - meanGap) / stdGap;
        const prob = standardNormalCDF(z);
        const fatigueScore = z > 0 ? 1 - prob : prob;
        const bandwidth = calculateSilvermanBandwidth([meanGap, stdGap, expectedNextGap]);
        const uResonance = (currentGap - expectedNextGap) / (bandwidth + Number.EPSILON);
        const patternResonanceScore = Math.exp(-0.5 * Math.pow(uResonance, 2));
        const threshold = numGaps > 0 ? 1.96 / Math.sqrt(numGaps) : 1.96;
        const significance = 1 / (1 + Math.exp(-10 * (Math.abs(lag1Autocorrelation) - threshold)));
        const hurstSigmoid = 1 / (1 + Math.exp(-12 * (hurstExponent - 0.5)));
        const blendedWeight = 0.5 * significance * Math.abs(lag1Autocorrelation) + 0.5 * hurstSigmoid;
        const combinedSignal = blendedWeight * patternResonanceScore + (1 - blendedWeight) * fatigueScore;
        const finalScore = 100 / (1 + Math.exp(-5 * (combinedSignal - 0.5)));
        return {
          score: Math.max(0, Math.min(100, finalScore)),
          confidence: 0.85 + 0.1 * blendedWeight,
          // Plus le pattern est fort, plus on est confiant
          metadata: {
            currentGap,
            expectedNextGap: parseFloat(expectedNextGap.toFixed(2)),
            lag1: parseFloat(lag1Autocorrelation.toFixed(3)),
            hurst: parseFloat(hurstExponent.toFixed(3)),
            autocorrSignificance: parseFloat(significance.toFixed(3))
          }
        };
      }
    };
  }
});

// services/prediction/algorithms/gapPattern.ts
var gapPatternPlugin;
var init_gapPattern = __esm({
  "services/prediction/algorithms/gapPattern.ts"() {
    "use strict";
    init_prediction_types();
    init_kdeService();
    gapPatternPlugin = {
      key: "gap_pattern" /* GAP_PATTERN */,
      category: "advanced",
      stability: "stable",
      mathematicalBasis: "Mod\xE8le Autor\xE9gressif AR(1) par num\xE9ro sur s\xE9quence d'\xE9carts individuelle (auto-corr\xE9lation de d\xE9calage 1)",
      description: "D\xE9tecte, pour chaque num\xE9ro individuellement, un motif r\xE9current dans sa propre s\xE9quence chronologique d'\xE9carts (ex: alternance court/long, ou r\xE9gularit\xE9), puis pr\xE9dit son \xE9cart attendu actuel via un mod\xE8le autor\xE9gressif entra\xEEn\xE9 sur son propre historique.",
      isStrictlyDeterministic: true,
      precompute(ctx) {
        const N = 90;
        const history = ctx.history;
        const MIN_GAPS_FOR_PATTERN = 3;
        const perNumberAnalysis = {};
        for (let num = 1; num <= N; num++) {
          const appearanceIndices = [];
          for (let i = 0; i < history.length; i++) {
            if (history[i]?.gagnants?.includes(num)) {
              appearanceIndices.push(i);
            }
          }
          const currentOpenGap = appearanceIndices.length > 0 ? appearanceIndices[0] : history.length;
          if (appearanceIndices.length < MIN_GAPS_FOR_PATTERN + 1) {
            perNumberAnalysis[num] = {
              hasPattern: false,
              currentOpenGap,
              predictedGap: 0,
              scaleForNormalization: 1,
              numGaps: 0,
              autocorrelation: 0,
              meanGap: 0,
              variance: 0
            };
            continue;
          }
          const chronoAppearances = [...appearanceIndices].reverse();
          const gapSeq = [];
          for (let i = 1; i < chronoAppearances.length; i++) {
            gapSeq.push(chronoAppearances[i - 1] - chronoAppearances[i] - 1);
          }
          const numGaps = gapSeq.length;
          const meanGap = gapSeq.reduce((a, b) => a + b, 0) / numGaps;
          const variance2 = gapSeq.reduce((a, b) => a + Math.pow(b - meanGap, 2), 0) / numGaps;
          const stdGap = Math.sqrt(variance2);
          let numerator = 0;
          let denominator = 0;
          for (let i = 0; i < numGaps; i++) {
            denominator += Math.pow(gapSeq[i] - meanGap, 2);
            if (i < numGaps - 1) {
              numerator += (gapSeq[i] - meanGap) * (gapSeq[i + 1] - meanGap);
            }
          }
          const autocorrelation = denominator > Number.EPSILON ? numerator / denominator : 0;
          const lastCompletedGap = gapSeq[gapSeq.length - 1];
          const predictedGapRaw = meanGap + autocorrelation * (lastCompletedGap - meanGap);
          const predictedGap = Math.max(0, predictedGapRaw);
          const scaleForNormalization = Math.max(stdGap, 1);
          perNumberAnalysis[num] = {
            hasPattern: true,
            currentOpenGap,
            predictedGap,
            scaleForNormalization,
            numGaps,
            autocorrelation,
            meanGap,
            variance: variance2
          };
        }
        ctx.pluginCache = ctx.pluginCache || {};
        ctx.pluginCache["gap_pattern" /* GAP_PATTERN */] = { perNumberAnalysis };
      },
      evaluate(num, ctx) {
        if (!ctx.pluginCache?.["gap_pattern" /* GAP_PATTERN */]) {
          this.precompute(ctx);
        }
        const cache = ctx.pluginCache["gap_pattern" /* GAP_PATTERN */];
        const analysis = cache.perNumberAnalysis[num];
        if (!analysis || !analysis.hasPattern) {
          return {
            score: 50,
            confidence: 0.3,
            metadata: { hasPattern: false }
          };
        }
        const { currentOpenGap, predictedGap, numGaps, autocorrelation, meanGap, variance: variance2 } = analysis;
        const rho = autocorrelation;
        const SE = Math.sqrt(Math.max(Number.EPSILON, (1 - rho * rho) * variance2));
        const zScore = (currentOpenGap - predictedGap) / (SE + Number.EPSILON);
        const residualKde = evaluateKDE([predictedGap - SE, predictedGap, predictedGap + SE], currentOpenGap);
        const slope = 1 + (ctx.statisticalBounds?.hurstExponent || 0.5) * 5;
        const parametricScore = 100 / (1 + Math.exp(-slope * zScore));
        const normalizedScore = 0.7 * parametricScore + 0.3 * (residualKde.cdf * 100);
        const sampleReliability = 1 - 1 / Math.sqrt(numGaps + 1);
        const predictionPrecision = 1 / (1 + SE / (meanGap + Number.EPSILON));
        const confidence = Math.max(0.3, Math.min(0.95, 0.3 + 0.65 * sampleReliability * predictionPrecision));
        return {
          score: Math.max(0, Math.min(100, normalizedScore)),
          confidence,
          metadata: {
            hasPattern: true,
            currentOpenGap,
            predictedGap: Number(predictedGap.toFixed(2)),
            personalMeanGap: Number(meanGap.toFixed(2)),
            autocorrelation: Number(autocorrelation.toFixed(3)),
            sampleSize: numGaps,
            standardError: Number(SE.toFixed(3)),
            predictionZScore: Number(zScore.toFixed(3))
          }
        };
      }
    };
  }
});

// services/prediction/sequencePatternAnalyzer.ts
var clamp, logistic, mean2, variance, stdDev2, safeGagnants, computeTrendVector, computeSquaredDistance, robustBandwidth, SequencePatternAnalyzer, sequencePatternAnalyzer;
var init_sequencePatternAnalyzer = __esm({
  "services/prediction/sequencePatternAnalyzer.ts"() {
    "use strict";
    init_arrayUtils();
    init_kdeService();
    clamp = (v, min, max) => Math.max(min, Math.min(max, v));
    logistic = (x) => 1 / (1 + Math.exp(-x));
    mean2 = (arr) => arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length;
    variance = (arr, avg) => {
      if (arr.length === 0) return 0;
      const m = avg ?? mean2(arr);
      return arr.reduce((acc, v) => acc + Math.pow(v - m, 2), 0) / arr.length;
    };
    stdDev2 = (arr, avg) => Math.sqrt(variance(arr, avg));
    safeGagnants = (draw) => Array.isArray(draw.gagnants) ? draw.gagnants.filter(Number.isFinite) : [];
    computeTrendVector = (seq) => {
      if (seq.length < 2) return [];
      const deltas = [];
      for (let i = 1; i < seq.length; i++) {
        deltas.push(seq[i] - seq[i - 1]);
      }
      return deltas;
    };
    computeSquaredDistance = (a, b) => {
      let d = 0;
      for (let i = 0; i < Math.min(a.length, b.length); i++) {
        d += Math.pow(a[i] - b[i], 2);
      }
      return d;
    };
    robustBandwidth = (seq) => {
      if (seq.length <= 1) return 1;
      return calculateSilvermanBandwidth(seq);
    };
    SequencePatternAnalyzer = class {
      analyze(drawName, history, config) {
        const windowSize = Math.max(2, config?.slidingWindowSize ?? 3);
        const minRecurrenceThreshold = Math.max(0.1, config?.minRecurrenceThreshold ?? 0.5);
        const maxNumber = Math.max(1, config?.maxNumber ?? 90);
        const maxLookbackWindows = Math.max(10, config?.maxLookbackWindows ?? 250);
        const isolatedHistory = !drawName ? history.slice() : purifyHistoryForDraw(drawName, history);
        const chronologicalHistory = [...isolatedHistory].reverse();
        const totalDraws = chronologicalHistory.length;
        const gapSequences = {};
        const lastSeenIndex = {};
        for (let i = 1; i <= maxNumber; i++) {
          gapSequences[i] = [];
          lastSeenIndex[i] = -1;
        }
        for (let index = 0; index < chronologicalHistory.length; index++) {
          const draw = chronologicalHistory[index];
          const gagnants = safeGagnants(draw);
          for (const num of gagnants) {
            if (num < 1 || num > maxNumber) continue;
            const previousIndex = lastSeenIndex[num];
            if (previousIndex !== -1) {
              const gap = index - previousIndex - 1;
              gapSequences[num].push(gap);
            }
            lastSeenIndex[num] = index;
          }
        }
        const results = [];
        for (let num = 1; num <= maxNumber; num++) {
          const seq = gapSequences[num];
          const lastIndex = lastSeenIndex[num];
          const currentGap = lastIndex !== -1 ? totalDraws - 1 - lastIndex : totalDraws;
          if (seq.length < windowSize + 1) {
            results.push({
              number: num,
              currentGap,
              recentSequence: seq.slice(-windowSize),
              bestMatch: null,
              stochasticScore: 0
            });
            continue;
          }
          const recentSequence = seq.slice(-windowSize);
          const recentTrend = computeTrendVector(recentSequence);
          const gapMean = mean2(seq);
          const gapStd = stdDev2(seq, gapMean);
          const bwLevel = robustBandwidth(seq);
          const bwTrend = Math.max(1, robustBandwidth(recentTrend.length > 0 ? recentTrend : [0]));
          const matches = [];
          const upperBound = Math.min(seq.length - windowSize - 1, maxLookbackWindows);
          for (let i = 0; i <= upperBound; i++) {
            const historicalWindow = seq.slice(i, i + windowSize);
            const historicalNextGap = seq[i + windowSize];
            const historicalTrend = computeTrendVector(historicalWindow);
            const levelDistance = computeSquaredDistance(recentSequence, historicalWindow);
            const trendDistance = computeSquaredDistance(recentTrend, historicalTrend);
            const levelSimilarity = Math.exp(-levelDistance / (2 * Math.pow(bwLevel, 2)));
            const trendSimilarity = recentTrend.length > 0 ? Math.exp(-trendDistance / (2 * Math.pow(bwTrend, 2))) : 1;
            const similarity = 0.7 * levelSimilarity + 0.3 * trendSimilarity;
            if (similarity > Math.exp(-4)) {
              matches.push({
                similarity,
                nextGap: historicalNextGap,
                window: historicalWindow,
                trendSimilarity
              });
            }
          }
          if (matches.length === 0) {
            results.push({
              number: num,
              currentGap,
              recentSequence,
              bestMatch: null,
              stochasticScore: 0
            });
            continue;
          }
          const totalWeight = matches.reduce((acc, m) => acc + m.similarity, 0);
          const weightedNextGap = matches.reduce((acc, m) => acc + m.nextGap * m.similarity, 0) / Math.max(totalWeight, 1e-9);
          const nextGapValues = matches.map((m) => m.nextGap);
          const nextGapMean = mean2(nextGapValues);
          const nextGapStd = stdDev2(nextGapValues, nextGapMean);
          const nextGapDispersionPenalty = 1 / (1 + nextGapStd / Math.max(1, gapStd));
          const bestHistoricalMatch = matches.reduce(
            (best, cur) => cur.similarity > best.similarity ? cur : best
          );
          const bestResonance = bestHistoricalMatch.similarity;
          const supportStrength = logistic((totalWeight - minRecurrenceThreshold) * 1.5);
          const matchCountStrength = logistic((matches.length - 2) * 0.8);
          const signalSpread = Math.max(1, gapStd, nextGapStd * 0.75);
          const gapAlignment = Math.exp(
            -Math.pow(currentGap - weightedNextGap, 2) / (2 * Math.pow(signalSpread, 2))
          );
          const patternConsistency = 0.6 * bestResonance + 0.4 * nextGapDispersionPenalty;
          let score = 100 * gapAlignment * patternConsistency * (0.55 + 0.45 * supportStrength) * (0.55 + 0.45 * matchCountStrength);
          if (matches.length === 1) {
            score *= 0.6;
          } else if (matches.length === 2) {
            score *= 0.8;
          }
          score = clamp(score, 0, 100);
          let bestMatch = null;
          if (totalWeight >= minRecurrenceThreshold) {
            const confidence = 100 * clamp(
              0.35 * supportStrength + 0.2 * matchCountStrength + 0.25 * gapAlignment + 0.2 * patternConsistency,
              0,
              1
            );
            bestMatch = {
              pattern: recentSequence,
              nextExpectedGap: Number(weightedNextGap.toFixed(2)),
              frequency: Number(totalWeight.toFixed(2)),
              confidence: Number(confidence.toFixed(2))
            };
          } else {
            score *= 0.5;
          }
          results.push({
            number: num,
            currentGap,
            recentSequence,
            bestMatch,
            stochasticScore: Number(score.toFixed(2))
          });
        }
        return results;
      }
    };
    sequencePatternAnalyzer = new SequencePatternAnalyzer();
  }
});

// services/prediction/algorithms/sequencePattern.ts
var sequencePatternPlugin;
var init_sequencePattern = __esm({
  "services/prediction/algorithms/sequencePattern.ts"() {
    "use strict";
    init_prediction_types();
    init_sequencePatternAnalyzer();
    sequencePatternPlugin = {
      key: "sequence_pattern" /* SEQUENCE_PATTERN */,
      category: "advanced",
      stability: "stable",
      mathematicalBasis: "Fen\xEAtre glissante configurable pour d\xE9tection de patterns stochastiques d\xE9terministes sur s\xE9quences d'\xE9carts",
      description: "Analyse l'historique pour identifier des r\xE9currences dans les s\xE9quences d'\xE9carts et extraire un signal continu bas\xE9 sur les correspondances de fen\xEAtre (sliding window).",
      isStrictlyDeterministic: true,
      precompute(ctx) {
        const drawName = ctx.drawName || "";
        const results = sequencePatternAnalyzer.analyze(drawName, ctx.history, {
          slidingWindowSize: 3,
          minRecurrenceThreshold: 0.1,
          maxNumber: 90
        });
        ctx.pluginCache = ctx.pluginCache || {};
        ctx.pluginCache["SEQUENCE_PATTERN"] = { results };
      },
      evaluate(num, ctx) {
        if (!ctx.pluginCache?.["SEQUENCE_PATTERN"]) {
          this.precompute(ctx);
        }
        const cache = ctx.pluginCache["SEQUENCE_PATTERN"];
        const results = cache.results;
        const stat = results.find((r) => r.number === num);
        if (!stat) {
          return { score: 0, confidence: 0 };
        }
        return {
          score: stat.stochasticScore,
          confidence: stat.bestMatch ? stat.bestMatch.confidence / 100 : 0.3,
          metadata: {
            currentGap: stat.currentGap,
            bestMatch: stat.bestMatch
          }
        };
      }
    };
  }
});

// services/prediction/algorithms/derivedNeighbor.ts
var getCircularDistance, derivedNeighborPlugin;
var init_derivedNeighbor = __esm({
  "services/prediction/algorithms/derivedNeighbor.ts"() {
    "use strict";
    init_prediction_types();
    getCircularDistance = (a, b, maxVal = 90) => {
      const diff = Math.abs(a - b);
      return Math.min(diff, maxVal - diff);
    };
    derivedNeighborPlugin = {
      key: "derived_neighbor" /* DERIVED_NEIGHBOR */,
      // Type cast for new key
      category: "meta",
      // Meta-algorithme car il observe les autres
      stability: "stable",
      mathematicalBasis: "Diffusion Gaussienne sur Vari\xE9t\xE9 Circulaire (Spreading Activation)",
      description: "Propage l'activation par noyau gaussien circulaire et transformations sym\xE9triques \xE0 partir des graines principales.",
      isStrictlyDeterministic: true,
      /**
       * Precomputes the top seeds and transformations.
       * 
       * This algorithm acts as a Spreading Activation model on a 1D circular manifold [1, 90],
       * where the boundary conditions are periodic (1 is adjacent to 90). It identifies the top 
       * 10 "seed" numbers estimated by principal algorithms and diffuses activation from these 
       * sources across the topology.
       */
      precompute(ctx) {
        const N = 90;
        const proxyScores = [];
        const maxFreq = Math.max(1e-3, ...Array.from(ctx.features.freqMap));
        const maxMarkov = Math.max(1e-3, ...Array.from(ctx.features.markovMap));
        const maxMomentum = Math.max(1e-3, ...Array.from(ctx.features.momentumMap));
        for (let i = 1; i <= N; i++) {
          const freqVal = (ctx.features.freqMap[i] || 0) / maxFreq;
          const markovVal = (ctx.features.markovMap[i] || 0) / maxMarkov;
          const momentumVal = (ctx.features.momentumMap[i] || 0) / maxMomentum;
          const proxyScore = (freqVal + markovVal * 1.5 + momentumVal * 0.8) / 3.3;
          proxyScores.push({ num: i, score: proxyScore });
        }
        const entropyVal = ctx.statisticalBounds?.shannonEntropy !== void 0 ? ctx.statisticalBounds.shannonEntropy : 0.5;
        const adaptiveSeedCount = Math.max(5, Math.min(20, Math.round(10 * (1 + (entropyVal - 0.5)))));
        proxyScores.sort((a, b) => b.score - a.score);
        const topChosen = proxyScores.slice(0, adaptiveSeedCount).map((p) => p.num);
        const transformMap = {};
        topChosen.forEach((chosen) => {
          const plus1 = chosen === 90 ? 1 : chosen + 1;
          if (!transformMap[plus1]) transformMap[plus1] = [];
          transformMap[plus1].push({ type: "+1", source: chosen });
          const minus1 = chosen === 1 ? 90 : chosen - 1;
          if (!transformMap[minus1]) transformMap[minus1] = [];
          transformMap[minus1].push({ type: "-1", source: chosen });
          const shadow = 91 - chosen;
          if (shadow >= 1 && shadow <= 90) {
            if (!transformMap[shadow]) transformMap[shadow] = [];
            transformMap[shadow].push({ type: "ombre", source: chosen });
          }
          const strNum = chosen.toString().padStart(2, "0");
          const reversedStr = strNum.split("").reverse().join("");
          const mirror = parseInt(reversedStr, 10);
          if (mirror >= 1 && mirror <= 90 && mirror !== chosen) {
            if (!transformMap[mirror]) transformMap[mirror] = [];
            transformMap[mirror].push({ type: "miroir", source: chosen });
          }
        });
        ctx.pluginCache = ctx.pluginCache || {};
        ctx.pluginCache["derived_neighbor" /* DERIVED_NEIGHBOR */] = {
          transformMap,
          topChosen
        };
      },
      evaluate(num, ctx) {
        if (!ctx.pluginCache?.["derived_neighbor" /* DERIVED_NEIGHBOR */]) {
          this.precompute(ctx);
        }
        const cache = ctx.pluginCache["derived_neighbor" /* DERIVED_NEIGHBOR */];
        const transformations = cache.transformMap[num] || [];
        const topChosen = cache.topChosen;
        const SIGMA_TOPOLOGY = 90 / 6;
        let spreadingActivation = 0;
        topChosen.forEach((seed) => {
          const dist = getCircularDistance(num, seed);
          spreadingActivation += Math.exp(-0.5 * Math.pow(dist / SIGMA_TOPOLOGY, 2));
        });
        const baseScorePerTransform = 35;
        const discreteScore = transformations.length * baseScorePerTransform;
        const rawScore = spreadingActivation * 25 + discreteScore;
        const normalizedScore = Math.tanh(rawScore / 100) * 100;
        return {
          score: Math.max(0, Math.min(100, normalizedScore)),
          confidence: 0.9,
          metadata: {
            derived: transformations.length > 0,
            transformations,
            spreadingActivation,
            isSeed: topChosen.includes(num)
          }
        };
      }
    };
  }
});

// services/prediction/algorithms/gapCadence.ts
var clamp2, logistic2, mean3, stdDev3, median, quantile, gapCadencePlugin;
var init_gapCadence = __esm({
  "services/prediction/algorithms/gapCadence.ts"() {
    "use strict";
    init_prediction_types();
    init_kdeService();
    clamp2 = (v, min, max) => Math.max(min, Math.min(max, v));
    logistic2 = (x) => 1 / (1 + Math.exp(-x));
    mean3 = (arr) => arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length;
    stdDev3 = (arr, avg) => {
      if (arr.length === 0) return 1;
      const m = avg ?? mean3(arr);
      const variance2 = arr.reduce((acc, v) => acc + Math.pow(v - m, 2), 0) / arr.length;
      return Math.sqrt(variance2) || 1;
    };
    median = (arr) => {
      if (arr.length === 0) return 0;
      const sorted = [...arr].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
    };
    quantile = (arr, q) => {
      if (arr.length === 0) return 0;
      const sorted = [...arr].sort((a, b) => a - b);
      const idx = Math.floor((sorted.length - 1) * q);
      return sorted[idx] ?? sorted[sorted.length - 1];
    };
    gapCadencePlugin = {
      key: "gap_cadence" /* GAP_CADENCE */,
      category: "advanced",
      stability: "stable",
      mathematicalBasis: "D\xE9tection de r\xE9gime collectif via cl\xF4tures de Tukey, percentile empirique et calibration logistique continue",
      description: "D\xE9tecte si le tirage traverse une phase collective de retour de num\xE9ros retardataires et module en continu l'importance du gap individuel.",
      isStrictlyDeterministic: true,
      precompute(ctx) {
        const history = ctx.history || [];
        const domainSize = ctx.features.freqMap?.length ? ctx.features.freqMap.length - 1 : 90;
        const drawSize = history[0]?.gagnants?.length || 5;
        const pooledOccurrenceGaps = [];
        const lastSeenAtIndex = {};
        for (let i = history.length - 1; i >= 0; i--) {
          const draw = history[i];
          (draw.gagnants || []).forEach((num) => {
            const prev = lastSeenAtIndex[num];
            const gap = prev !== void 0 ? prev - i : null;
            if (gap !== null && gap > 0) {
              pooledOccurrenceGaps.push(gap);
            }
            lastSeenAtIndex[num] = i;
          });
        }
        const fallbackGap = domainSize / Math.max(1, drawSize);
        let pooledMean = fallbackGap;
        let pooledStd = Math.max(1, fallbackGap * 0.5);
        let pooledMedian = fallbackGap;
        let pooledIqr = Math.max(1, fallbackGap * 0.5);
        let tukeyUpperFence = fallbackGap;
        if (pooledOccurrenceGaps.length >= 8) {
          pooledMean = mean3(pooledOccurrenceGaps);
          pooledStd = stdDev3(pooledOccurrenceGaps, pooledMean);
          pooledMedian = median(pooledOccurrenceGaps);
          const q1 = quantile(pooledOccurrenceGaps, 0.25);
          const q3 = quantile(pooledOccurrenceGaps, 0.75);
          pooledIqr = Math.max(1e-6, q3 - q1);
          tukeyUpperFence = q3 + 1.5 * pooledIqr;
        }
        const recentWindowSize = Math.min(
          history.length,
          2 * Math.ceil(domainSize / Math.max(1, drawSize))
        );
        let recentGapsCount = 0;
        let recentBigReturnsCount = 0;
        const lastSeenForRecent = {};
        for (let i = history.length - 1; i >= 0; i--) {
          const draw = history[i];
          const isInRecentWindow = i < recentWindowSize;
          (draw.gagnants || []).forEach((num) => {
            const prev = lastSeenForRecent[num];
            const gap = prev !== void 0 ? prev - i : null;
            if (gap !== null && gap > 0 && isInRecentWindow) {
              recentGapsCount++;
              if (gap >= tukeyUpperFence) {
                recentBigReturnsCount++;
              }
            }
            lastSeenForRecent[num] = i;
          });
        }
        const cadenceIntensity = recentGapsCount > 0 ? recentBigReturnsCount / recentGapsCount : 0;
        const cadenceStrength = logistic2((cadenceIntensity - 0.18) * 10);
        const cadenceReliability = logistic2((recentGapsCount - 10) * 0.35);
        const sortedPooled = [...pooledOccurrenceGaps].sort((a, b) => a - b);
        ctx.pluginCache = ctx.pluginCache || {};
        ctx.pluginCache["gap_cadence" /* GAP_CADENCE */] = {
          tukeyUpperFence,
          pooledMean,
          pooledStd,
          pooledMedian,
          pooledIqr,
          cadenceIntensity,
          cadenceStrength,
          cadenceReliability,
          sortedPooled,
          recentWindowSize,
          recentBigReturnsCount,
          recentGapsCount,
          pooledSampleSize: pooledOccurrenceGaps.length
        };
      },
      evaluate(num, ctx) {
        if (!ctx.pluginCache?.["gap_cadence" /* GAP_CADENCE */]) {
          this.precompute(ctx);
        }
        const cache = ctx.pluginCache["gap_cadence" /* GAP_CADENCE */];
        const currentGap = Number(ctx.features.gapsMap[num]) || 0;
        const kdeRes = evaluateKDE(cache.sortedPooled, currentGap);
        const percentile = kdeRes.cdf;
        const percentileScore = percentile * 100;
        const robustScale = Math.max(1, cache.pooledIqr / 1.349);
        const robustZ = (currentGap - cache.pooledMedian) / robustScale;
        const individualGapStrength = logistic2((robustZ - 0.75) * 1.4);
        const tukeyExcess = cache.tukeyUpperFence > 0 ? (currentGap - cache.tukeyUpperFence) / cache.tukeyUpperFence : 0;
        const tukeyExcessStrength = logistic2(tukeyExcess * 8);
        const intrinsicGapScore = 0.5 * percentileScore + 25 * individualGapStrength + 25 * tukeyExcessStrength;
        const regimeBoostStrength = cache.cadenceStrength * cache.cadenceReliability;
        const boostMultiplier = 1 + 0.55 * regimeBoostStrength;
        const eligibilityGate = 0.35 + 0.65 * individualGapStrength;
        const amplifiedScore = intrinsicGapScore * (1 + (boostMultiplier - 1) * eligibilityGate);
        const finalScore = clamp2(amplifiedScore, 0, 100);
        const sampleConfidence = logistic2((cache.pooledSampleSize - 40) * 0.08);
        const recentConfidence = logistic2((cache.recentGapsCount - 8) * 0.25);
        const fenceStability = logistic2((cache.pooledIqr - 2) * 0.4);
        const confidence = 0.2 + 0.25 * sampleConfidence + 0.25 * recentConfidence + 0.15 * cache.cadenceReliability + 0.15 * fenceStability;
        return {
          score: finalScore,
          confidence: clamp2(confidence, 0.25, 0.92),
          metadata: {
            currentGap,
            percentileScore: Number(percentileScore.toFixed(2)),
            intrinsicGapScore: Number(intrinsicGapScore.toFixed(2)),
            cadenceIntensity: Number(cache.cadenceIntensity.toFixed(4)),
            cadenceStrength: Number(cache.cadenceStrength.toFixed(4)),
            cadenceReliability: Number(cache.cadenceReliability.toFixed(4)),
            regimeBoostStrength: Number(regimeBoostStrength.toFixed(4)),
            individualGapStrength: Number(individualGapStrength.toFixed(4)),
            tukeyExcessStrength: Number(tukeyExcessStrength.toFixed(4)),
            tukeyUpperFence: Number(cache.tukeyUpperFence.toFixed(2)),
            pooledMedian: Number(cache.pooledMedian.toFixed(2)),
            pooledIqr: Number(cache.pooledIqr.toFixed(2)),
            recentBigReturns: cache.recentBigReturnsCount,
            recentGapsCount: cache.recentGapsCount,
            recentWindowSize: cache.recentWindowSize,
            pooledSampleSize: cache.pooledSampleSize
          }
        };
      }
    };
  }
});

// services/prediction/algorithms/gapTrend.ts
var gapTrendPlugin;
var init_gapTrend = __esm({
  "services/prediction/algorithms/gapTrend.ts"() {
    "use strict";
    init_prediction_types();
    init_mathService();
    init_kdeService();
    gapTrendPlugin = {
      key: "gap_trend" /* GAP_TREND */,
      category: "advanced",
      stability: "stable",
      mathematicalBasis: "Lissage exponentiel double de Holt (niveau + tendance), param\xE8tres optimis\xE9s par minimisation du SSE in-sample",
      description: "Mod\xE9lise la tendance (acc\xE9l\xE9ration/ralentissement) de la s\xE9quence chronologique des \xE9carts de chaque num\xE9ro, et projette la valeur attendue du prochain \xE9cart.",
      isStrictlyDeterministic: true,
      precompute(ctx) {
        const N = 90;
        const history = ctx.history;
        const MIN_GAPS_FOR_TREND = Math.max(5, Math.ceil(Math.log2(N)));
        const localHistory = history.slice(0, Math.min(history.length, 10));
        const localEntropy = calculateShannonEntropy2(localHistory).normalized;
        const localHurst = calculateFractalIndex(localHistory);
        const entropyDeviation = Math.abs(localEntropy - 0.5);
        const hurstFactor = Math.max(0, localHurst - 0.5);
        const baseCoeff = 0.1;
        const maxCoeff = baseCoeff + 0.8 * entropyDeviation + 0.1 * hurstFactor;
        const GRID_STEPS = Math.max(5, Math.min(15, Math.ceil(Math.sqrt(N) / 2)));
        const ALPHA_BETA_GRID = [];
        for (let i = 0; i <= GRID_STEPS; i++) {
          ALPHA_BETA_GRID.push(baseCoeff + (maxCoeff - baseCoeff) * (i / GRID_STEPS));
        }
        const fitHolt = (seq, alpha, beta) => {
          let level = seq[0];
          let trend = seq.length > 1 ? seq[1] - seq[0] : 0;
          let sse = 0;
          for (let i = 1; i < seq.length; i++) {
            const forecast = level + trend;
            const error = seq[i] - forecast;
            sse += error * error;
            const prevLevel = level;
            level = alpha * seq[i] + (1 - alpha) * (level + trend);
            trend = beta * (level - prevLevel) + (1 - beta) * trend;
          }
          return { level, trend, sse };
        };
        const perNumberAnalysis = {};
        for (let num = 1; num <= N; num++) {
          const appearanceIndices = [];
          for (let i = 0; i < history.length; i++) {
            if (history[i].gagnants?.includes(num)) {
              appearanceIndices.push(i);
            }
          }
          const currentOpenGap = appearanceIndices.length > 0 ? appearanceIndices[0] : history.length;
          if (appearanceIndices.length < MIN_GAPS_FOR_TREND + 1) {
            perNumberAnalysis[num] = {
              hasPattern: false,
              currentOpenGap,
              projectedNextGap: 0,
              volatility: 0,
              trendDirection: 0,
              numGaps: 0,
              fitQuality: 0
            };
            continue;
          }
          const chronoAppearances = [...appearanceIndices].reverse();
          const gapSeq = [];
          for (let i = 1; i < chronoAppearances.length; i++) {
            gapSeq.push(chronoAppearances[i - 1] - chronoAppearances[i]);
          }
          const deltaGapSeq = [];
          for (let i = 1; i < gapSeq.length; i++) {
            deltaGapSeq.push(gapSeq[i] - gapSeq[i - 1]);
          }
          const meanDelta = deltaGapSeq.reduce((a, b) => a + b, 0) / deltaGapSeq.length;
          const variance2 = deltaGapSeq.reduce((a, b) => a + Math.pow(b - meanDelta, 2), 0) / deltaGapSeq.length;
          const volatility = Math.sqrt(variance2) || Number.EPSILON;
          let best = { level: gapSeq[0], trend: 0, sse: Infinity, alpha: 0.5, beta: 0.5 };
          for (const alpha of ALPHA_BETA_GRID) {
            for (const beta of ALPHA_BETA_GRID) {
              const fit = fitHolt(gapSeq, alpha, beta);
              if (fit.sse < best.sse) {
                best = { ...fit, alpha, beta };
              }
            }
          }
          const meanGap = gapSeq.reduce((a, b) => a + b, 0) / gapSeq.length;
          const naiveSSE = gapSeq.reduce((a, b) => a + Math.pow(b - meanGap, 2), 0);
          const fitQuality = naiveSSE > Number.EPSILON ? Math.max(0, 1 - best.sse / naiveSSE) : 0;
          const projectedNextGap = Math.max(0, best.level + best.trend);
          perNumberAnalysis[num] = {
            hasPattern: true,
            currentOpenGap,
            projectedNextGap,
            volatility,
            trendDirection: best.trend,
            numGaps: gapSeq.length,
            fitQuality
          };
        }
        ctx.pluginCache = ctx.pluginCache || {};
        ctx.pluginCache["gap_trend" /* GAP_TREND */] = {
          perNumberAnalysis,
          localEntropy,
          localHurst,
          maxCoeff,
          gridSteps: GRID_STEPS
        };
      },
      evaluate(num, ctx) {
        if (!ctx.pluginCache?.["gap_trend" /* GAP_TREND */]) {
          this.precompute(ctx);
        }
        const cache = ctx.pluginCache["gap_trend" /* GAP_TREND */];
        const analysis = cache.perNumberAnalysis[num];
        if (!analysis || !analysis.hasPattern) {
          return { score: 50, confidence: 0.3, metadata: { hasPattern: false } };
        }
        const { currentOpenGap, projectedNextGap, volatility, trendDirection, numGaps, fitQuality } = analysis;
        const scale = Math.max(volatility, 1);
        const hurstExponent = ctx.statisticalBounds?.hurstExponent || 0.5;
        const slope = 1 + hurstExponent * 5;
        const kdeRes = evaluateKDE([projectedNextGap - scale, projectedNextGap, projectedNextGap + scale], currentOpenGap);
        const parametricScore = 100 / (1 + Math.exp(-slope * (currentOpenGap - projectedNextGap) / scale));
        const normalizedScore = 0.65 * parametricScore + 0.35 * (kdeRes.cdf * 100);
        const sampleReliability = 1 - 1 / Math.sqrt(numGaps + 1);
        const confidence = Math.max(0.3, Math.min(0.95, 0.3 + 0.4 * sampleReliability + 0.25 * fitQuality));
        const trendLabel = trendDirection > 0.5 ? "allongement" : trendDirection < -0.5 ? "raccourcissement" : "stable";
        return {
          score: Math.max(0, Math.min(100, normalizedScore)),
          confidence,
          metadata: {
            currentOpenGap,
            projectedNextGap: Number(projectedNextGap.toFixed(2)),
            trend: trendLabel,
            trendMagnitude: Number(trendDirection.toFixed(3)),
            fitQuality: Number(fitQuality.toFixed(3)),
            sampleSize: numGaps,
            localEntropy: cache.localEntropy,
            localHurst: cache.localHurst,
            mathematicalModel: "Holt Double Exponential Smoothing"
          }
        };
      }
    };
  }
});

// services/prediction/algorithms/interMonthlyResonance.ts
var DEFAULT_CACHE, clamp3, safeArray, uniqueValidNumbers, parseDateStrict, getDayOfYear, getSeasonalAngle, getCircularAngleDistance, SIGMA_SEASONAL_RAD, calculateSeasonalResonance, buildDrawNumberSet, calculateJaccardIndex, getGagnants, jaccardDraws, findTwinDrawCandidates, computeRobustStats, computeTop5Concentration, interMonthlyResonancePlugin;
var init_interMonthlyResonance = __esm({
  "services/prediction/algorithms/interMonthlyResonance.ts"() {
    "use strict";
    init_prediction_types();
    init_lotteryService();
    DEFAULT_CACHE = {
      scores: {},
      median: 0,
      mad: 1,
      iqr: 1,
      topTwinDate: "N/A",
      topTwinIndex: -1,
      topTwinQuality: 0,
      activeTwinsCount: 0,
      periodsAnalyzed: 0,
      matchedSourcePeriods: 0,
      totalProjectedOccurrences: 0,
      distinctProjectedNumbers: 0,
      totalSignalMass: 0,
      concentrationTop5: 0,
      signalDetected: false
    };
    clamp3 = (v, min, max) => Math.max(min, Math.min(max, v));
    safeArray = (arr) => Array.isArray(arr) ? arr.filter((n) => Number.isInteger(n)) : [];
    uniqueValidNumbers = (arr) => {
      const seen = /* @__PURE__ */ new Set();
      const out = [];
      for (const n of safeArray(arr)) {
        if (n >= 1 && n <= LOTTERY_CONSTANTS.TOTAL_NUMBERS && !seen.has(n)) {
          seen.add(n);
          out.push(n);
        }
      }
      return out;
    };
    parseDateStrict = (dateStr) => {
      if (!dateStr || typeof dateStr !== "string") return null;
      const trimmed = dateStr.trim();
      const fr = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);
      if (fr) {
        const day = Number(fr[1]);
        const month = Number(fr[2]);
        const year = Number(fr[3]);
        const d = new Date(year, month - 1, day);
        if (d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day) {
          return d;
        }
        return null;
      }
      const iso = new Date(trimmed);
      return Number.isNaN(iso.getTime()) ? null : iso;
    };
    getDayOfYear = (d) => {
      const start = new Date(d.getFullYear(), 0, 0);
      const diff = d.getTime() - start.getTime() + (start.getTimezoneOffset() - d.getTimezoneOffset()) * 60 * 1e3;
      return Math.floor(diff / (1e3 * 60 * 60 * 24));
    };
    getSeasonalAngle = (d) => {
      const doy = getDayOfYear(d);
      return 2 * Math.PI * doy / 365.25;
    };
    getCircularAngleDistance = (a1, a2) => {
      const diff = Math.abs(a1 - a2) % (2 * Math.PI);
      return Math.min(diff, 2 * Math.PI - diff);
    };
    SIGMA_SEASONAL_RAD = 2 * Math.PI * 14 / 365.25;
    calculateSeasonalResonance = (targetDate, drawDate) => {
      const a1 = getSeasonalAngle(targetDate);
      const a2 = getSeasonalAngle(drawDate);
      const distAngle = getCircularAngleDistance(a1, a2);
      const seasonalWeight = Math.exp(-0.5 * Math.pow(distAngle / SIGMA_SEASONAL_RAD, 2));
      const dowDiff = Math.abs(targetDate.getDay() - drawDate.getDay());
      const dowWeight = Math.pow(Math.cos(Math.PI * dowDiff / 7), 2);
      return seasonalWeight * (0.7 + 0.3 * dowWeight);
    };
    buildDrawNumberSet = (draw) => /* @__PURE__ */ new Set([
      ...uniqueValidNumbers(draw.gagnants),
      ...uniqueValidNumbers(draw.machine)
    ]);
    calculateJaccardIndex = (arr1, arr2) => {
      if (arr1.length === 0 || arr2.length === 0) return 0;
      const set1 = new Set(arr1);
      let intersection = 0;
      for (const num of arr2) {
        if (set1.has(num)) {
          intersection++;
        }
      }
      const union = set1.size + arr2.length - intersection;
      return union > 0 ? intersection / union : 0;
    };
    getGagnants = (draw) => uniqueValidNumbers(draw?.gagnants);
    jaccardDraws = (d1, d2) => {
      return calculateJaccardIndex(getGagnants(d1), getGagnants(d2));
    };
    findTwinDrawCandidates = (history, currentDate, maxYearsToScan, hurst, currentDraw) => {
      const currentYear = currentDate.getFullYear();
      const candidates = [];
      const lambdaYear = 3 + 4 * clamp3(hurst, 0.1, 0.9);
      for (let i = 1; i < history.length; i++) {
        const draw = history[i];
        const drawDate = parseDateStrict(draw.date);
        if (!drawDate) continue;
        const yearDiff = currentYear - drawDate.getFullYear();
        if (yearDiff < 1 || yearDiff > maxYearsToScan) continue;
        const seasonalRes = calculateSeasonalResonance(currentDate, drawDate);
        const yearDecay = Math.exp(-yearDiff / lambdaYear);
        const gagnantsCount = uniqueValidNumbers(draw.gagnants).length;
        const machineCount = uniqueValidNumbers(draw.machine).length;
        const richness = gagnantsCount / 5 * 0.7 + machineCount / 5 * 0.3;
        const jaccardSim = jaccardDraws(draw, currentDraw);
        const alpha = clamp3(hurst, 0.1, 0.9) * 0.5;
        const blendedResonance = seasonalRes * (1 - alpha) + jaccardSim * alpha;
        const quality = clamp3(blendedResonance * yearDecay * (0.5 + 0.5 * richness), 0, 1);
        if (quality > 0.01) {
          const dayDistance = Math.abs(currentDate.getDate() - drawDate.getDate());
          candidates.push({
            draw,
            index: i,
            yearsAgo: yearDiff,
            dayDistance,
            quality
          });
        }
      }
      candidates.sort((a, b) => b.quality - a.quality);
      return candidates;
    };
    computeRobustStats = (scores) => {
      const values2 = Object.values(scores).sort((a, b) => a - b);
      const n = values2.length;
      if (n === 0) {
        return { median: 0, iqr: 1, mad: 1 };
      }
      const median2 = values2[Math.floor(n / 2)] ?? 0;
      const q1 = values2[Math.floor(n * 0.25)] ?? 0;
      const q3 = values2[Math.floor(n * 0.75)] ?? 0;
      const iqr = Math.max(1e-6, q3 - q1);
      const absDeviations = values2.map((v) => Math.abs(v - median2)).sort((a, b) => a - b);
      const mad = Math.max(1e-6, absDeviations[Math.floor(n / 2)] ?? 0);
      return { median: median2, iqr, mad };
    };
    computeTop5Concentration = (scores) => {
      const vals = Object.values(scores).filter((v) => v > 0).sort((a, b) => b - a);
      if (vals.length === 0) return 0;
      const total = vals.reduce((a, b) => a + b, 0);
      if (total <= 0) return 0;
      const top5 = vals.slice(0, 5).reduce((a, b) => a + b, 0);
      return top5 / total;
    };
    interMonthlyResonancePlugin = {
      key: "inter_monthly_resonance" /* INTER_MONTHLY_RESONANCE */,
      category: "advanced",
      stability: "stable",
      mathematicalBasis: "R\xE9tro-ing\xE9nierie temporelle multi-annuelle et projection sym\xE9trique de r\xE9sonance gaussienne",
      description: "D\xE9tecte les tirages jumeaux des ann\xE9es pass\xE9es (m\xEAme p\xE9riode calendaire), analyse la dynamique de leurs sous-ensembles de num\xE9ros, puis projette la r\xE9sonance inter-mensuelle sur l'historique r\xE9cent.",
      isStrictlyDeterministic: true,
      precompute(ctx) {
        const history = ctx.history || [];
        ctx.pluginCache = ctx.pluginCache || {};
        const cacheKey = "inter_monthly_resonance" /* INTER_MONTHLY_RESONANCE */;
        const emptyScores = {};
        for (let i = 1; i <= LOTTERY_CONSTANTS.TOTAL_NUMBERS; i++) {
          emptyScores[i] = 0;
        }
        const defaultCache = {
          ...DEFAULT_CACHE,
          scores: emptyScores
        };
        if (history.length < 20) {
          ctx.pluginCache[cacheKey] = defaultCache;
          return;
        }
        const currentDraw = history[0];
        const currentDate = parseDateStrict(currentDraw?.date || "");
        if (!currentDate) {
          ctx.pluginCache[cacheKey] = defaultCache;
          return;
        }
        let hurst = Number(ctx.statisticalBounds?.hurstExponent);
        if (!Number.isFinite(hurst)) hurst = 0.5;
        hurst = clamp3(hurst, 0.1, 0.9);
        const maxYearsToScan = Math.max(1, Math.min(10, Math.floor(history.length / 52)));
        const twinCandidates = findTwinDrawCandidates(history, currentDate, maxYearsToScan, hurst, currentDraw);
        if (twinCandidates.length === 0) {
          ctx.pluginCache[cacheKey] = defaultCache;
          return;
        }
        const maxActiveTwins = Math.max(2, Math.min(10, Math.round(5 * (1 + (hurst - 0.5)))));
        const activeTwins = twinCandidates.slice(0, maxActiveTwins);
        const topTwin = activeTwins[0];
        const decayGamma = 0.05 / (hurst * 2);
        const rawScores = {};
        for (let i = 1; i <= LOTTERY_CONSTANTS.TOTAL_NUMBERS; i++) {
          rawScores[i] = 0;
        }
        let periodsAnalyzed = 0;
        let matchedSourcePeriods = 0;
        let totalProjectedOccurrences = 0;
        let totalSignalMass = 0;
        const distinctProjected = /* @__PURE__ */ new Set();
        for (const twinRes of activeTwins) {
          const twinNumbers = buildDrawNumberSet(twinRes.draw);
          if (twinNumbers.size < 3) continue;
          const maxLookback = Math.min(150, history.length - twinRes.index - 1);
          for (let k = 1; k <= maxLookback; k++) {
            const historicalSource = history[twinRes.index + k];
            const projectedCurrent = history[k];
            if (!historicalSource || !projectedCurrent) continue;
            periodsAnalyzed++;
            const sourceNumbers = [
              ...uniqueValidNumbers(historicalSource.gagnants),
              ...uniqueValidNumbers(historicalSource.machine)
            ];
            const overlapCount = sourceNumbers.filter((n) => twinNumbers.has(n)).length;
            const combinationActivation = 1 / (1 + Math.exp(-2.5 * (overlapCount - 1.5)));
            if (combinationActivation < 0.1) continue;
            matchedSourcePeriods++;
            const sourceStrength = overlapCount / Math.max(1, twinNumbers.size);
            const timeAmortization = Math.exp(-decayGamma * k);
            const jaccardAnchor = jaccardDraws(twinRes.draw, currentDraw);
            const jaccardEvolution = jaccardDraws(historicalSource, projectedCurrent);
            const jaccardResonance = (jaccardAnchor + jaccardEvolution) / 2;
            const jaccardMultiplier = Math.exp(hurst * 2 * jaccardResonance);
            const periodWeight = combinationActivation * timeAmortization * twinRes.quality * (0.5 + sourceStrength) * jaccardMultiplier;
            const projectedWinners = uniqueValidNumbers(projectedCurrent.gagnants);
            const projectedMachine = uniqueValidNumbers(projectedCurrent.machine);
            for (const num of projectedWinners) {
              rawScores[num] += periodWeight;
              totalProjectedOccurrences++;
              totalSignalMass += periodWeight;
              distinctProjected.add(num);
            }
            const machineRatio = projectedWinners.length > 0 ? 0.5 : 0;
            for (const num of projectedMachine) {
              rawScores[num] += periodWeight * machineRatio;
              totalProjectedOccurrences++;
              totalSignalMass += periodWeight * machineRatio;
              distinctProjected.add(num);
            }
          }
        }
        const { median: median2, iqr, mad } = computeRobustStats(rawScores);
        const concentrationTop5 = computeTop5Concentration(rawScores);
        const signalDetected = matchedSourcePeriods > 0 && totalSignalMass > 0;
        ctx.pluginCache[cacheKey] = {
          scores: rawScores,
          median: median2,
          mad,
          iqr,
          topTwinDate: topTwin.draw.date,
          topTwinIndex: topTwin.index,
          topTwinQuality: topTwin.quality,
          activeTwinsCount: activeTwins.length,
          periodsAnalyzed,
          matchedSourcePeriods,
          totalProjectedOccurrences,
          distinctProjectedNumbers: distinctProjected.size,
          totalSignalMass,
          concentrationTop5,
          signalDetected
        };
      },
      evaluate(num, ctx) {
        const cacheKey = "inter_monthly_resonance" /* INTER_MONTHLY_RESONANCE */;
        if (!ctx.pluginCache?.[cacheKey]) {
          this.precompute(ctx);
        }
        const cache = ctx.pluginCache?.[cacheKey];
        if (!cache) {
          return {
            score: 50,
            confidence: 0.5,
            metadata: {
              rawVal: 0,
              topTwinDate: "N/A",
              periodsAnalyzed: 0,
              matchedSourcePeriods: 0,
              totalProjectedNumbers: 0,
              signalDetected: false
            }
          };
        }
        const rawVal = Number.isFinite(cache.scores[num]) ? cache.scores[num] : 0;
        const median2 = Number.isFinite(cache.median) ? cache.median : 0;
        const robustScale = Math.max(1e-6, 1.4826 * cache.mad);
        let score = 50;
        if (cache.signalDetected) {
          const zRobust = (rawVal - median2) / robustScale;
          let hurst = Number(ctx.statisticalBounds?.hurstExponent);
          if (!Number.isFinite(hurst)) hurst = 0.5;
          const slope = 1 + clamp3(hurst, 0.1, 0.9) * 2;
          score = 100 / (1 + Math.exp(-slope * zRobust));
        }
        score = clamp3(score, 0, 100);
        const evidenceRatio = cache.periodsAnalyzed > 0 ? cache.matchedSourcePeriods / (cache.matchedSourcePeriods + Math.sqrt(cache.periodsAnalyzed) + 1) : 0;
        const twinQualityTerm = clamp3(cache.topTwinQuality, 0, 1);
        const signalMassTerm = 1 / (1 + Math.exp(-0.2 * (cache.totalSignalMass - 5)));
        const concentrationPenalty = clamp3(
          1 - Math.max(0, cache.concentrationTop5 - 0.7) * 1.5,
          0.4,
          1
        );
        const confidenceRaw = 0.2 + 0.3 * evidenceRatio + 0.25 * twinQualityTerm + 0.15 * signalMassTerm + 0.1 * concentrationPenalty;
        const confidence = clamp3(confidenceRaw, 0.2, 0.95);
        return {
          score: Number(score.toFixed(2)),
          confidence: Number(confidence.toFixed(3)),
          metadata: {
            rawVal: Number(rawVal.toFixed(3)),
            topTwinDate: cache.topTwinDate,
            topTwinIndex: cache.topTwinIndex,
            topTwinQuality: Number(cache.topTwinQuality.toFixed(3)),
            activeTwinsCount: cache.activeTwinsCount,
            periodsAnalyzed: cache.periodsAnalyzed,
            matchedSourcePeriods: cache.matchedSourcePeriods,
            totalProjectedNumbers: cache.totalProjectedOccurrences,
            distinctProjectedNumbers: cache.distinctProjectedNumbers,
            totalSignalMass: Number(cache.totalSignalMass.toFixed(2)),
            concentrationTop5: Number(cache.concentrationTop5.toFixed(3)),
            signalDetected: cache.signalDetected
          }
        };
      }
    };
  }
});

// services/prediction/gapRangeSequenceService.ts
function getGapBinIndex(gap, step) {
  const safeGap = Math.max(0, Math.floor(gap));
  if (step === 10) {
    return Math.min(6, Math.floor(safeGap / 10));
  } else {
    return Math.min(10, Math.floor(safeGap / 5));
  }
}
function getGapBinLabel(binIndex, step) {
  if (step === 10) {
    if (binIndex >= 6) return "60+";
    const start = binIndex * 10;
    const end = start + 9;
    return `${start}-${end}`;
  } else {
    if (binIndex >= 10) return "50+";
    const start = binIndex * 5;
    const end = start + 4;
    return `${start}-${end}`;
  }
}
function getGapBinBounds(binIndex, step) {
  if (step === 10) {
    if (binIndex >= 6) return { minGap: 60, maxGap: Infinity };
    return { minGap: binIndex * 10, maxGap: binIndex * 10 + 9 };
  } else {
    if (binIndex >= 10) return { minGap: 50, maxGap: Infinity };
    return { minGap: binIndex * 5, maxGap: binIndex * 5 + 4 };
  }
}
function getTotalBins(step) {
  if (step === "combined") return 10;
  return step === 10 ? 7 : 11;
}
var gapRangeSequenceService;
var init_gapRangeSequenceService = __esm({
  "services/prediction/gapRangeSequenceService.ts"() {
    "use strict";
    init_arrayUtils();
    gapRangeSequenceService = {
      /**
        * Analyzes the historical sequence of gap ranges and computes transition probabilities.
        */
      analyzeGapRangePatterns(drawName, history, step = "combined", maxNumber = 90) {
        if (step === "combined") {
          const report5 = this.analyzeGapRangePatterns(drawName, history, 5, maxNumber);
          const report10 = this.analyzeGapRangePatterns(drawName, history, 10, maxNumber);
          const totalBins5 = getTotalBins(5);
          const totalBins10 = getTotalBins(10);
          let entropy5 = 0;
          report5.bins.forEach((b) => {
            if (b.probability > 0) entropy5 -= b.probability * Math.log(b.probability);
          });
          const normEntropy5 = entropy5 / Math.log(totalBins5);
          let entropy10 = 0;
          report10.bins.forEach((b) => {
            if (b.probability > 0) entropy10 -= b.probability * Math.log(b.probability);
          });
          const normEntropy10 = entropy10 / Math.log(totalBins10);
          const info5 = Math.max(0.01, 1 - normEntropy5);
          const info10 = Math.max(0.01, 1 - normEntropy10);
          const totalInfo = info5 + info10;
          const step5Weight = info5 / totalInfo;
          const step10Weight = info10 / totalInfo;
          const scoresByNumber2 = {};
          for (let num = 1; num <= maxNumber; num++) {
            const s5 = report5.scoresByNumber[num] ?? 50;
            const s10 = report10.scoresByNumber[num] ?? 50;
            scoresByNumber2[num] = parseFloat((step5Weight * s5 + step10Weight * s10).toFixed(2));
          }
          return {
            drawName,
            totalDraws: report10.totalDraws,
            step: "combined",
            lastDrawWinningGaps: report10.lastDrawWinningGaps,
            lastDrawBinSignature: report10.lastDrawBinSignature,
            lastDrawBinLabels: report10.lastDrawBinLabels,
            bins: report10.bins,
            topPredictedBins: report10.topPredictedBins,
            scoresByNumber: scoresByNumber2,
            transitionMatrix: report10.transitionMatrix,
            resolutionWeights: { step5Weight, step10Weight },
            sequenceMatches: report10.sequenceMatches
          };
        }
        const numericStep = step;
        const isolatedHistory = !drawName ? history.slice() : purifyHistoryForDraw(drawName, history);
        const totalDraws = isolatedHistory.length;
        const totalBins = getTotalBins(numericStep);
        const chronologicalHistory = [...isolatedHistory].reverse();
        const lastSeenIndex = {};
        for (let i = 1; i <= maxNumber; i++) {
          lastSeenIndex[i] = -1;
        }
        const drawBinSignatures = [];
        chronologicalHistory.forEach((draw, drawIdx) => {
          const winning = draw.gagnants || [];
          const gapsInfo = [];
          winning.forEach((num) => {
            if (num >= 1 && num <= maxNumber) {
              const prevIdx = lastSeenIndex[num];
              const gap = prevIdx !== -1 ? drawIdx - prevIdx - 1 : drawIdx;
              const binIndex = getGapBinIndex(gap, numericStep);
              gapsInfo.push({ number: num, gap, binIndex });
              lastSeenIndex[num] = drawIdx;
            }
          });
          drawBinSignatures.push({
            drawIndex: drawIdx,
            gaps: gapsInfo
          });
        });
        const currentGaps = {};
        for (let num = 1; num <= maxNumber; num++) {
          const lastIdx = lastSeenIndex[num];
          const gap = lastIdx !== -1 ? totalDraws - 1 - lastIdx : totalDraws;
          const binIndex = getGapBinIndex(gap, numericStep);
          currentGaps[num] = { gap, binIndex };
        }
        const transitionMatrix = Array.from({ length: totalBins }, () => new Float64Array(totalBins));
        for (let t = 1; t < drawBinSignatures.length; t++) {
          const prevBins = drawBinSignatures[t - 1].gaps.map((g) => g.binIndex);
          const currBins = drawBinSignatures[t].gaps.map((g) => g.binIndex);
          prevBins.forEach((prevB) => {
            currBins.forEach((currB) => {
              transitionMatrix[prevB][currB] += 1;
            });
          });
        }
        const lastDrawInfo = drawBinSignatures[drawBinSignatures.length - 1];
        const lastDrawWinningGaps = (lastDrawInfo?.gaps || []).map((g) => ({
          number: g.number,
          gap: g.gap,
          binIndex: g.binIndex,
          binLabel: getGapBinLabel(g.binIndex, numericStep)
        }));
        const lastDrawBinSignature = lastDrawWinningGaps.map((g) => g.binIndex);
        const lastDrawBinLabels = lastDrawWinningGaps.map((g) => g.binLabel);
        const sequenceMatches = [];
        if (drawBinSignatures.length > 2) {
          const targetSig = new Set(lastDrawBinSignature);
          for (let t = 0; t < drawBinSignatures.length - 1; t++) {
            const histSig = drawBinSignatures[t].gaps.map((g) => g.binIndex);
            if (histSig.length === 0) continue;
            const intersection = histSig.filter((b) => targetSig.has(b)).length;
            const union = (/* @__PURE__ */ new Set([...histSig, ...lastDrawBinSignature])).size;
            const jaccardSim = union > 0 ? intersection / union : 0;
            if (jaccardSim > 0.4) {
              const nextInfo = drawBinSignatures[t + 1];
              sequenceMatches.push({
                historicalDrawIndex: t,
                similarityScore: parseFloat(jaccardSim.toFixed(3)),
                historicalGapsSignature: histSig.map((b) => getGapBinLabel(b, numericStep)),
                subsequentGapsSignature: (nextInfo?.gaps || []).map((g) => getGapBinLabel(g.binIndex, numericStep)),
                subsequentBins: (nextInfo?.gaps || []).map((g) => g.binIndex)
              });
            }
          }
        }
        sequenceMatches.sort((a, b) => {
          if (Math.abs(b.similarityScore - a.similarityScore) > 1e-6) return b.similarityScore - a.similarityScore;
          return b.historicalDrawIndex - a.historicalDrawIndex;
        });
        const laplaceAlpha = 1 / totalBins;
        const rawTargetCounts = new Float64Array(totalBins);
        let totalTargetWeight = 0;
        for (let b = 0; b < totalBins; b++) {
          let binCount = 0;
          lastDrawBinSignature.forEach((sourceBin) => {
            binCount += transitionMatrix[sourceBin][b];
          });
          sequenceMatches.slice(0, 10).forEach((match) => {
            if (match.subsequentBins.includes(b)) {
              binCount += match.similarityScore * 2;
            }
          });
          const smoothedCount = binCount + laplaceAlpha;
          rawTargetCounts[b] = smoothedCount;
          totalTargetWeight += smoothedCount;
        }
        const binProbabilities = new Float64Array(totalBins);
        for (let b = 0; b < totalBins; b++) {
          binProbabilities[b] = totalTargetWeight > 0 ? rawTargetCounts[b] / totalTargetWeight : 1 / totalBins;
        }
        const matchingNumbersByBin = {};
        for (let b = 0; b < totalBins; b++) {
          matchingNumbersByBin[b] = [];
        }
        for (let num = 1; num <= maxNumber; num++) {
          const b = currentGaps[num].binIndex;
          matchingNumbersByBin[b].push(num);
        }
        const bins = [];
        for (let b = 0; b < totalBins; b++) {
          const bounds = getGapBinBounds(b, numericStep);
          bins.push({
            binIndex: b,
            label: getGapBinLabel(b, numericStep),
            minGap: bounds.minGap,
            maxGap: bounds.maxGap,
            probability: parseFloat(binProbabilities[b].toFixed(4)),
            matchingNumbers: matchingNumbersByBin[b] || []
          });
        }
        const topPredictedBins = [...bins].sort((a, b) => {
          if (Math.abs(b.probability - a.probability) > 1e-6) return b.probability - a.probability;
          const hashA = a.binIndex * 2654435761 % 4294967296;
          const hashB = b.binIndex * 2654435761 % 4294967296;
          return hashB - hashA;
        });
        const probs = bins.map((b) => b.probability);
        const meanProb = probs.reduce((acc, p) => acc + p, 0) / totalBins;
        const varianceProb = probs.reduce((acc, p) => acc + Math.pow(p - meanProb, 2), 0) / totalBins;
        const stdProb = Math.sqrt(varianceProb) || Number.EPSILON;
        const scoresByNumber = {};
        for (let num = 1; num <= maxNumber; num++) {
          const binIdx = currentGaps[num].binIndex;
          const prob = binProbabilities[binIdx];
          const z = (prob - meanProb) / stdProb;
          const score = 100 / (1 + Math.exp(-3 * z));
          scoresByNumber[num] = parseFloat(Math.max(0, Math.min(100, score)).toFixed(2));
        }
        return {
          drawName,
          totalDraws,
          step: numericStep,
          lastDrawWinningGaps,
          lastDrawBinSignature,
          lastDrawBinLabels,
          bins,
          topPredictedBins,
          scoresByNumber,
          transitionMatrix,
          sequenceMatches: sequenceMatches.slice(0, 10)
        };
      }
    };
  }
});

// services/prediction/algorithms/gapRangeSequence.ts
var gapRangeSequencePlugin;
var init_gapRangeSequence = __esm({
  "services/prediction/algorithms/gapRangeSequence.ts"() {
    "use strict";
    init_prediction_types();
    init_gapRangeSequenceService();
    gapRangeSequencePlugin = {
      key: "gap_band_sequence" /* GAP_BAND_SEQUENCE */,
      category: "advanced",
      stability: "stable",
      mathematicalBasis: "Cha\xEEne de Markov conditionnelle et mod\xE8le de transition de fr\xE9quences sur tranches d'\xE9carts d'apparition",
      description: "Analyse les s\xE9quences et motifs de transitions de tranches d'\xE9carts (par tranches de 5 ou 10) entre tirages successifs pour pr\xE9dire les tranches d'\xE9carts les plus probables et s\xE9lectionner les num\xE9ros correspondants.",
      isStrictlyDeterministic: true,
      precompute(ctx) {
        const drawName = ctx.drawName || "";
        const history = ctx.history;
        const step = "combined";
        const report = gapRangeSequenceService.analyzeGapRangePatterns(drawName, history, step, 90);
        ctx.pluginCache = ctx.pluginCache || {};
        ctx.pluginCache["gap_band_sequence" /* GAP_BAND_SEQUENCE */] = report;
      },
      evaluate(num, ctx) {
        if (!ctx.pluginCache?.["gap_band_sequence" /* GAP_BAND_SEQUENCE */]) {
          this.precompute(ctx);
        }
        const report = ctx.pluginCache["gap_band_sequence" /* GAP_BAND_SEQUENCE */];
        if (!report || !report.scoresByNumber) {
          return { score: 50, confidence: 0.5 };
        }
        const score = report.scoresByNumber[num] ?? 50;
        const totalDraws = report.totalDraws || ctx.history.length;
        const sampleConfidence = Math.min(0.95, 0.4 + 0.55 * (1 - Math.exp(-totalDraws / 30)));
        return {
          score,
          confidence: sampleConfidence,
          metadata: {
            lastDrawBinSignature: report.lastDrawBinSignature,
            topPredictedBins: report.topPredictedBins.slice(0, 3).map((b) => ({
              label: b.label,
              probability: Number((b.probability * 100).toFixed(1))
            }))
          }
        };
      }
    };
  }
});

// services/prediction/algorithms/advancedTopology.ts
var shadowProbabilityPlugin, networkCorrelationPlugin, isolationAnomalyPlugin;
var init_advancedTopology = __esm({
  "services/prediction/algorithms/advancedTopology.ts"() {
    "use strict";
    init_prediction_types();
    shadowProbabilityPlugin = {
      key: "shadow" /* SHADOW_PROBABILITY */,
      category: "advanced",
      stability: "volatile",
      mathematicalBasis: "Noyau Gaussien Continu et Topologie de Voisinage Circulaire",
      description: "\xC9value la probabilit\xE9 de spillover topologique en lissant l'impact des derniers gagnants par un Noyau Gaussien (Sigma = 15.0, couvrant 99.7% du domaine).",
      isStrictlyDeterministic: true,
      precompute(ctx) {
        const DOMAIN_SIZE4 = 90;
        const sigma = DOMAIN_SIZE4 / 6;
        const varG = sigma * sigma;
        const shadowScores = new Float64Array(DOMAIN_SIZE4 + 1);
        const lastDraw = ctx.history[0];
        const winners = lastDraw ? lastDraw.gagnants || [] : [];
        for (let num = 1; num <= DOMAIN_SIZE4; num++) {
          let kernelSum = 0;
          for (const winner of winners) {
            const dDirect = Math.abs(num - winner);
            const dCircular = Math.min(dDirect, DOMAIN_SIZE4 - dDirect);
            const kValue = Math.exp(-(dCircular * dCircular) / (2 * varG));
            kernelSum += kValue;
          }
          const avgKernel = winners.length > 0 ? kernelSum / winners.length : 0;
          shadowScores[num] = avgKernel * 100;
        }
        ctx.pluginCache = ctx.pluginCache || {};
        ctx.pluginCache["shadow" /* SHADOW_PROBABILITY */] = shadowScores;
      },
      evaluate(num, ctx) {
        if (!ctx.pluginCache?.["shadow" /* SHADOW_PROBABILITY */]) {
          this.precompute(ctx);
        }
        const score = ctx.pluginCache["shadow" /* SHADOW_PROBABILITY */][num] || 0;
        return {
          score: Math.max(0, Math.min(100, score)),
          confidence: 0.8,
          metadata: {
            gaussianSigma: 90 / 6,
            basis: "Continuous Gaussian Kernel Smoothing"
          }
        };
      }
    };
    networkCorrelationPlugin = {
      key: "network" /* NETWORK_CORRELATION */,
      category: "core",
      stability: "stable",
      mathematicalBasis: "Score de Lift Statistique Continu d'Affinit\xE9 P(A|B) - P(A)",
      description: "Score issu du Lift moyen continu de co-occurrence de chaque num\xE9ro au sein du graphe d'affinit\xE9s r\xE9elles.",
      isStrictlyDeterministic: true,
      precompute(ctx) {
        const DOMAIN_SIZE4 = 90;
        const history = ctx.history;
        const totalDraws = history.length;
        const networkScores = new Float64Array(DOMAIN_SIZE4 + 1);
        if (totalDraws === 0) {
          ctx.pluginCache = ctx.pluginCache || {};
          ctx.pluginCache["network" /* NETWORK_CORRELATION */] = networkScores;
          return;
        }
        const counts = new Float64Array(DOMAIN_SIZE4 + 1);
        const coCounts = Array(DOMAIN_SIZE4 + 1).fill(0).map(() => new Float64Array(DOMAIN_SIZE4 + 1));
        for (const draw of history) {
          const winners = draw.gagnants || [];
          for (let i = 0; i < winners.length; i++) {
            const u = winners[i];
            if (u >= 1 && u <= DOMAIN_SIZE4) counts[u]++;
            for (let j = i + 1; j < winners.length; j++) {
              const v = winners[j];
              if (v >= 1 && v <= DOMAIN_SIZE4) {
                coCounts[u][v]++;
                coCounts[v][u]++;
              }
            }
          }
        }
        const P = new Float64Array(DOMAIN_SIZE4 + 1);
        for (let i = 1; i <= DOMAIN_SIZE4; i++) {
          P[i] = counts[i] / totalDraws;
        }
        for (let A = 1; A <= DOMAIN_SIZE4; A++) {
          let liftSum = 0;
          let countNeighbors = 0;
          const pA = P[A];
          if (pA === 0) continue;
          for (let B = 1; B <= DOMAIN_SIZE4; B++) {
            if (A === B) continue;
            const pB = P[B];
            if (pB === 0) continue;
            const pAandB = coCounts[A][B] / totalDraws;
            const pAgivenB = pAandB / pB;
            const lift = pAgivenB - pA;
            liftSum += lift;
            countNeighbors++;
          }
          const avgLift = countNeighbors > 0 ? liftSum / countNeighbors : 0;
          const score = 100 / (1 + Math.exp(-150 * avgLift));
          networkScores[A] = score;
        }
        ctx.pluginCache = ctx.pluginCache || {};
        ctx.pluginCache["network" /* NETWORK_CORRELATION */] = networkScores;
      },
      evaluate(num, ctx) {
        if (!ctx.pluginCache?.["network" /* NETWORK_CORRELATION */]) {
          this.precompute(ctx);
        }
        const score = ctx.pluginCache["network" /* NETWORK_CORRELATION */][num] || 0;
        return {
          score: Math.max(0, Math.min(100, score)),
          confidence: 0.85,
          metadata: {
            basis: "Conditional Probability Lift P(A|B) - P(A)"
          }
        };
      }
    };
    isolationAnomalyPlugin = {
      key: "isolation_anomaly" /* ISOLATION_ANOMALY */,
      category: "advanced",
      stability: "stable",
      mathematicalBasis: "Fusion de Signaux Optimale par Pond\xE9ration Inverse de la Variance (Gauss-Markov)",
      description: "Fusionne de mani\xE8re optimale les scores d'anomalie et d'\xE9cart par l'inverse de leur variance d'\xE9chantillon pour maximiser le rapport signal/bruit.",
      isStrictlyDeterministic: true,
      precompute(ctx) {
        const DOMAIN_SIZE4 = 90;
        const anomalies = new Float64Array(DOMAIN_SIZE4 + 1);
        const gaps = new Float64Array(DOMAIN_SIZE4 + 1);
        const anomalyMap = ctx.advancedMetrics?.anomalyDetection || {};
        for (let i = 1; i <= DOMAIN_SIZE4; i++) {
          anomalies[i] = Number(anomalyMap[i]) || 0;
          gaps[i] = Number(ctx.features.gapsMap[i]) || 0;
        }
        let meanAnomaly = 0;
        let meanGap = 0;
        for (let i = 1; i <= DOMAIN_SIZE4; i++) {
          meanAnomaly += anomalies[i];
          meanGap += gaps[i];
        }
        meanAnomaly /= DOMAIN_SIZE4;
        meanGap /= DOMAIN_SIZE4;
        let varAnomaly = 0;
        let varGap = 0;
        for (let i = 1; i <= DOMAIN_SIZE4; i++) {
          varAnomaly += Math.pow(anomalies[i] - meanAnomaly, 2);
          varGap += Math.pow(gaps[i] - meanGap, 2);
        }
        varAnomaly = Math.max(Number.EPSILON, varAnomaly / DOMAIN_SIZE4);
        varGap = Math.max(Number.EPSILON, varGap / DOMAIN_SIZE4);
        const wAnomaly = 1 / varAnomaly;
        const wGap = 1 / varGap;
        const wSum = wAnomaly + wGap;
        const fusedScores = new Float64Array(DOMAIN_SIZE4 + 1);
        for (let i = 1; i <= DOMAIN_SIZE4; i++) {
          const fusedValue = (anomalies[i] * wAnomaly + gaps[i] * wGap) / wSum;
          fusedScores[i] = Math.max(0, Math.min(100, fusedValue));
        }
        ctx.pluginCache = ctx.pluginCache || {};
        ctx.pluginCache["isolation_anomaly" /* ISOLATION_ANOMALY */] = {
          fusedScores,
          varAnomaly,
          varGap
        };
      },
      evaluate(num, ctx) {
        if (!ctx.pluginCache?.["isolation_anomaly" /* ISOLATION_ANOMALY */]) {
          this.precompute(ctx);
        }
        const cache = ctx.pluginCache["isolation_anomaly" /* ISOLATION_ANOMALY */];
        const score = cache.fusedScores[num] || 0;
        return {
          score,
          confidence: 0.9,
          metadata: {
            varAnomaly: parseFloat(cache.varAnomaly.toFixed(4)),
            varGap: parseFloat(cache.varGap.toFixed(4)),
            basis: "Inverse-Variance Weighted Fusion (Gauss-Markov)"
          }
        };
      }
    };
  }
});

// services/prediction/algorithms/index.ts
var initCoreAlgorithms;
var init_algorithms = __esm({
  "services/prediction/algorithms/index.ts"() {
    "use strict";
    init_algorithmRegistry();
    init_frequency();
    init_gaps();
    init_markov();
    init_momentum();
    init_affinity();
    init_signals();
    init_spatial();
    init_temporalBayes();
    init_echoState();
    init_gapSequence();
    init_gapPattern();
    init_sequencePattern();
    init_derivedNeighbor();
    init_gapCadence();
    init_gapTrend();
    init_interMonthlyResonance();
    init_gapRangeSequence();
    init_advancedTopology();
    initCoreAlgorithms = () => {
      registerAlgorithm(frequencyPlugin);
      registerAlgorithm(gapsPlugin);
      registerAlgorithm(markovPlugin);
      registerAlgorithm(momentumPlugin);
      registerAlgorithm(affinityPlugin);
      registerAlgorithm(spectralPlugin);
      registerAlgorithm(fractalPlugin);
      registerAlgorithm(spatialPlugin);
      registerAlgorithm(temporalPlugin);
      registerAlgorithm(bayesPlugin);
      registerAlgorithm(echoStateNetworkPlugin);
      registerAlgorithm(shadowProbabilityPlugin);
      registerAlgorithm(networkCorrelationPlugin);
      registerAlgorithm(isolationAnomalyPlugin);
      registerAlgorithm(gapSequencePlugin);
      registerAlgorithm(gapPatternPlugin);
      registerAlgorithm(sequencePatternPlugin);
      registerAlgorithm(derivedNeighborPlugin);
      registerAlgorithm(gapCadencePlugin);
      registerAlgorithm(gapTrendPlugin);
      registerAlgorithm(interMonthlyResonancePlugin);
      registerAlgorithm(gapRangeSequencePlugin);
    };
    initCoreAlgorithms();
  }
});

// services/prediction/coreAlgorithms.ts
var init_coreAlgorithms = __esm({
  "services/prediction/coreAlgorithms.ts"() {
    "use strict";
    init_algorithms();
  }
});

// services/prediction/scoringEngine.ts
var LOGISTIC_APPROX_FACTOR, getMedian, getMAD, getModifiedZScore, calculateScores, applyPCADenoising;
var init_scoringEngine = __esm({
  "services/prediction/scoringEngine.ts"() {
    "use strict";
    init_prediction_types();
    init_microDnaService();
    init_deterministicCore();
    init_mathService();
    init_algorithmRegistry();
    init_coreAlgorithms();
    init_weightsManager();
    init_loggerStub();
    LOGISTIC_APPROX_FACTOR = 1.702;
    getMedian = (arr) => {
      if (arr.length === 0) return 0;
      const sorted = [...arr].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    };
    getMAD = (arr, median2) => {
      if (arr.length === 0) return 0;
      const absDeviations = arr.map((v) => Math.abs(v - median2));
      const mad = getMedian(absDeviations);
      return mad * 1.4826;
    };
    getModifiedZScore = (val, median2, mad) => {
      return 0.6745 * (val - median2) / (mad + Number.EPSILON);
    };
    calculateScores = (features, weights, advancedMetrics, history, confidenceLevel = 0.9) => {
      const N = 90;
      const context = {
        features,
        advancedMetrics,
        history,
        statisticalBounds: advancedMetrics.statisticalBounds || { median: 0, q1: 0, q3: 0, variance: 0, kurtosis: 0, skewness: 0, shannonEntropy: 0, hurstExponent: 0.5 },
        deterministicSeed: history.length > 0 ? new Date(history[0].date).getTime() : Date.now(),
        maxFreq: Math.max(1, ...Array.from(features.freqMap || [])),
        maxMarkov: Math.max(1e-3, ...Array.from(features.markovMap || [])),
        maxMachineTransfer: Math.max(1e-3, ...Array.from(features.machineTransferMap || []))
      };
      context.pluginCache = {};
      algorithmRegistry.forEach((plugin) => {
        try {
          if (typeof plugin.precompute === "function") {
            plugin.precompute(context);
          }
        } catch (e) {
          logger.error({ err: e }, `[PRECOMPUTE ERROR] Failed to precompute for plugin ${plugin.key}`);
        }
      });
      const failedAlgos = /* @__PURE__ */ new Set();
      let effectiveWeights = { ...weights };
      const rawBreakdowns = {};
      const algoValues = {};
      Object.values(AlgoKey).forEach((k) => {
        algoValues[k] = [];
      });
      for (let i = 1; i <= N; i++) {
        const num = i;
        rawBreakdowns[num] = {};
        algorithmRegistry.forEach((plugin) => {
          try {
            const res = plugin.evaluate(num, context);
            const val = res.score;
            if (typeof val !== "number" || isNaN(val) || !isFinite(val)) throw new Error(`Valeur non num\xE9rique: ${val}`);
            rawBreakdowns[num][plugin.key] = val;
            if (!failedAlgos.has(plugin.key)) algoValues[plugin.key].push(val);
          } catch (err) {
            failedAlgos.add(plugin.key);
            rawBreakdowns[num][plugin.key] = 0;
          }
        });
      }
      if (failedAlgos.size > 0) {
        let sumFailedWeights = 0;
        let sumActiveWeights = 0;
        Object.keys(effectiveWeights).forEach((k) => {
          const key = k;
          if (failedAlgos.has(key)) {
            sumFailedWeights += Number(effectiveWeights[key]) || 0;
            effectiveWeights[key] = 0;
          } else {
            sumActiveWeights += Number(effectiveWeights[key]) || 0;
          }
        });
        if (sumFailedWeights > 0 && sumActiveWeights > 0) {
          Object.keys(effectiveWeights).forEach((k) => {
            const key = k;
            if (!failedAlgos.has(key)) {
              const propShare = (Number(effectiveWeights[key]) || 0) / sumActiveWeights;
              effectiveWeights[key] += sumFailedWeights * propShare;
            }
          });
          effectiveWeights = normalizeWeights(effectiveWeights);
          logger.warn(`[Dynamic Fallback] Redistribution de ${sumFailedWeights.toFixed(4)} sur les algos sains.`);
        }
      }
      const algoRobustStats = {};
      Object.keys(algoValues).forEach((k) => {
        if (failedAlgos.has(k)) return;
        const vals = algoValues[k];
        if (!vals || vals.length === 0) return;
        algoRobustStats[k] = { median: getMedian(vals), mad: getMAD(vals, getMedian(vals)) };
      });
      const targetDrawName = history[0]?.drawName || "ALL";
      const microDnaCache = {};
      if (history.length > 0) {
        for (let i = 1; i <= N; i++) {
          const microDna = calculateMicroDNAPerNumber(targetDrawName, i, history, effectiveWeights);
          microDnaCache[i] = microDna.spectralPower;
        }
      }
      const RESONANCE_BASE = 1;
      const H = context.statisticalBounds?.hurstExponent || 0.5;
      const RESONANCE_AMPLITUDE_MAX = Math.max(0, H);
      const masterScores = [];
      for (let i = 1; i <= N; i++) {
        const num = i;
        const breakdown = rawBreakdowns[num];
        let finalScore = 0;
        const shapValues = {};
        const microDnaResonanceModulator = microDnaCache[num] ? RESONANCE_BASE + sigmoid(microDnaCache[num], RESONANCE_BASE, 0.5) * RESONANCE_AMPLITUDE_MAX : RESONANCE_BASE;
        Object.keys(effectiveWeights).forEach((k) => {
          const key = k;
          let baseWeight = Number(effectiveWeights[key]) || 0;
          const weightModifier = context.advancedMetrics?.dynamicWeightModifiers?.[num]?.[key] || 0;
          baseWeight *= Math.exp(weightModifier);
          baseWeight *= microDnaResonanceModulator;
          const val = Number(breakdown[key]) || 0;
          if (baseWeight > 0 && !failedAlgos.has(key) && algoRobustStats[key]) {
            const stats = algoRobustStats[key];
            const robustZ = getModifiedZScore(val, stats.median, stats.mad);
            const squashed = 1 / (1 + Math.exp(-LOGISTIC_APPROX_FACTOR * robustZ));
            const contribution = squashed * baseWeight;
            finalScore += contribution;
            shapValues[key] = contribution;
          } else {
            shapValues[key] = 0;
          }
        });
        const machineTransferVal = context.features.machineTransferMap?.[num] || 0;
        const maxMachineTransfer = context.maxMachineTransfer || 1;
        const machineSymbiosisBoost = maxMachineTransfer > 1e-3 ? 1 + 0.15 * Math.tanh(machineTransferVal / maxMachineTransfer) : 1;
        finalScore *= machineSymbiosisBoost;
        const dnaOrbitingIndex = microDnaCache[num] || 0;
        const topologicalTension = context.advancedMetrics?.topologicalTension?.[num] || 0;
        masterScores.push({
          num,
          score: isNaN(finalScore) ? 0 : finalScore,
          breakdown,
          explainability: {
            shapValues,
            topologicalTension,
            dnaOrbitingIndex
          }
        });
      }
      const allScores = masterScores.map((m) => m.score).sort((a, b) => a - b);
      const alpha = 1 - confidenceLevel;
      const pLowIndex = Math.floor(allScores.length * (alpha / 2));
      const pHighIndex = Math.floor(allScores.length * (1 - alpha / 2));
      const minS = allScores[pLowIndex] !== void 0 ? allScores[pLowIndex] : allScores[0];
      const maxS = allScores[pHighIndex] !== void 0 ? allScores[pHighIndex] : allScores[allScores.length - 1];
      const range = Math.max(Number.EPSILON, maxS - minS);
      masterScores.forEach((m) => {
        const normalized = (m.score - minS) / range * 100;
        m.score = Math.max(0, Math.min(100, normalized));
        const totalShap = Object.values(m.explainability?.shapValues || {}).reduce((a, b) => a + b, 0);
        if (totalShap > 0 && m.explainability) {
          Object.keys(m.explainability.shapValues).forEach((k) => {
            m.explainability.shapValues[k] = m.explainability.shapValues[k] / totalShap * m.score;
          });
        }
      });
      return masterScores.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.num - b.num;
      });
    };
    applyPCADenoising = async (masterScores, weights, enhancedMetrics, confidenceLevel = 0.9) => {
      const featureKeys = Object.keys(weights);
      try {
        const featureMatrix = masterScores.map((item) => featureKeys.map((k) => Number(item.breakdown[k]) || 0));
        const varThreshold = enhancedMetrics?.pcaVarianceThreshold;
        const denoisedMatrix = denoiseFeaturesKernelPCA_wrapper(featureMatrix, void 0, varThreshold);
        if (denoisedMatrix && denoisedMatrix.length === masterScores.length) {
          let mse = 0;
          let maxVal = 0;
          for (let i = 0; i < featureMatrix.length; i++) {
            for (let j = 0; j < featureMatrix[i].length; j++) {
              const diff = featureMatrix[i][j] - (denoisedMatrix[i][j] || featureMatrix[i][j]);
              mse += diff * diff;
              if (Math.abs(featureMatrix[i][j]) > maxVal) maxVal = Math.abs(featureMatrix[i][j]);
            }
          }
          const totalElements = Math.max(1, featureMatrix.length * featureMatrix[0].length);
          const relativeMSE = mse / (totalElements * Math.max(Number.EPSILON, Math.pow(maxVal, 2)));
          const dimensionalityFactor = featureKeys.length;
          const pcaConfidence = Math.exp(-relativeMSE * Math.max(1, dimensionalityFactor));
          masterScores.forEach((item, idx) => {
            featureKeys.forEach((key, fIdx) => {
              const rawVal = featureMatrix[idx][fIdx];
              const dval = Number(denoisedMatrix[idx]?.[fIdx]);
              const cleanDVal = isNaN(dval) ? rawVal : dval;
              const blended = rawVal + pcaConfidence * (cleanDVal - rawVal);
              item.breakdown[key] = Math.max(0, Math.min(100, blended));
            });
          });
          masterScores.forEach((m) => {
            m.score = 0;
            if (m.explainability) {
              m.explainability.shapValues = {};
            }
          });
          featureKeys.forEach((k) => {
            const vals = masterScores.map((m) => Number(m.breakdown[k]) || 0);
            const median2 = getMedian(vals);
            const mad = getMAD(vals, median2);
            masterScores.forEach((m) => {
              const val = Number(m.breakdown[k]) || 0;
              let weight = Number(weights[k]) || 0;
              const weightModifier = enhancedMetrics?.dynamicWeightModifiers?.[m.num]?.[k] || 0;
              weight *= Math.exp(weightModifier);
              if (weight > 0) {
                const robustZ = getModifiedZScore(val, median2, mad);
                const squashed = 1 / (1 + Math.exp(-LOGISTIC_APPROX_FACTOR * robustZ));
                const contribution = squashed * weight;
                m.score += contribution;
                if (m.explainability) {
                  m.explainability.shapValues[k] = contribution;
                }
              }
            });
          });
        }
      } catch (e) {
        logger.warn({ err: e }, "PCA Denoising \xE9chou\xE9, conservation des scores bruts.");
      }
      const allScoresPCA = masterScores.map((m) => m.score).sort((a, b) => a - b);
      const alpha = 1 - confidenceLevel;
      const pLowIndex = Math.floor(allScoresPCA.length * (alpha / 2));
      const pHighIndex = Math.floor(allScoresPCA.length * (1 - alpha / 2));
      const minS = allScoresPCA[pLowIndex] !== void 0 ? allScoresPCA[pLowIndex] : allScoresPCA[0];
      const maxS = allScoresPCA[pHighIndex] !== void 0 ? allScoresPCA[pHighIndex] : allScoresPCA[allScoresPCA.length - 1];
      const range = Math.max(Number.EPSILON, maxS - minS);
      masterScores.forEach((m) => {
        m.score = Math.max(0, Math.min(100, (m.score - minS) / range * 100));
        const totalShap = Object.values(m.explainability?.shapValues || {}).reduce((a, b) => a + b, 0);
        if (totalShap > 0 && m.explainability) {
          Object.keys(m.explainability.shapValues).forEach((k) => {
            m.explainability.shapValues[k] = m.explainability.shapValues[k] / totalShap * m.score;
          });
        }
      });
      return masterScores.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.num - b.num;
      });
    };
  }
});

// services/prediction/diversityService.ts
var calculateGeneticDiversityIndex;
var init_diversityService = __esm({
  "services/prediction/diversityService.ts"() {
    "use strict";
    calculateGeneticDiversityIndex = (numbers, breakdowns) => {
      if (numbers.length < 2) {
        return {
          meanSimilarity: 0,
          diversityScore: 1,
          penalty: 0,
          isMonoculture: false,
          pairwiseSimilarities: [],
          dominantAlgo: null,
          mutualInformationScore: 0,
          klDivergenceBonus: 1
        };
      }
      const firstBd = breakdowns[numbers[0]];
      const algoKeys = firstBd ? Object.keys(firstBd).filter((k) => typeof firstBd[k] === "number") : [];
      if (algoKeys.length === 0) {
        return {
          meanSimilarity: 0,
          diversityScore: 1,
          penalty: 0,
          isMonoculture: false,
          pairwiseSimilarities: [],
          dominantAlgo: null,
          mutualInformationScore: 0,
          klDivergenceBonus: 1
        };
      }
      const vectors = [];
      const algoContributions = {};
      for (const num of numbers) {
        const bd = breakdowns[num] || {};
        const vec = algoKeys.map((key) => Math.max(0, Number(bd[key]) || 0));
        vec.forEach((val, idx) => {
          algoContributions[algoKeys[idx]] = (algoContributions[algoKeys[idx]] || 0) + val;
        });
        const magnitude = Math.sqrt(vec.reduce((sum, val) => sum + val * val, 0)) || Number.EPSILON;
        vectors.push(vec.map((val) => val / magnitude));
      }
      const pairwiseSimilarities = [];
      for (let i = 0; i < vectors.length; i++) {
        for (let j = i + 1; j < vectors.length; j++) {
          const dotProduct = vectors[i].reduce((sum, val, idx) => sum + val * vectors[j][idx], 0);
          pairwiseSimilarities.push(Math.max(-1, Math.min(1, dotProduct)));
        }
      }
      const meanSimilarity = pairwiseSimilarities.reduce((a, b) => a + b, 0) / pairwiseSimilarities.length;
      const algoDistributions = {};
      const EPSILON_SMOOTH = 1e-6;
      algoKeys.forEach((key) => {
        const activations = numbers.map((num) => {
          const bd = breakdowns[num] || {};
          return Math.max(0, Number(bd[key]) || 0);
        });
        const sumAct = activations.reduce((a, b) => a + b, 0);
        algoDistributions[key] = activations.map((v) => (v + EPSILON_SMOOTH) / (sumAct + EPSILON_SMOOTH * numbers.length));
      });
      let sumRedundancy = 0;
      let countPairs = 0;
      for (let i = 0; i < algoKeys.length; i++) {
        for (let j = i + 1; j < algoKeys.length; j++) {
          const p = algoDistributions[algoKeys[i]];
          const q = algoDistributions[algoKeys[j]];
          let kl_pq = 0;
          let kl_qp = 0;
          for (let r = 0; r < numbers.length; r++) {
            kl_pq += p[r] * Math.log(p[r] / q[r]);
            kl_qp += q[r] * Math.log(q[r] / p[r]);
          }
          const jeffreysDiv = kl_pq + kl_qp;
          const pairRedundancy = Math.exp(-jeffreysDiv);
          sumRedundancy += pairRedundancy;
          countPairs++;
        }
      }
      const mutualInformationScore = countPairs > 0 ? sumRedundancy / countPairs : 0;
      const klDivergenceBonus = 1 - mutualInformationScore;
      const baseDiversity = 1 - meanSimilarity;
      const diversityScore = baseDiversity * klDivergenceBonus;
      let MONOCULTURE_THRESHOLD = 0.75;
      let MAX_DIVERSITY_PENALTY = 25;
      if (breakdowns && Object.keys(breakdowns).length >= 45) {
        const sampleSimilarities = [];
        const allNums = Object.keys(breakdowns).map(Number).filter((n) => !isNaN(n) && n >= 1 && n <= 90);
        const step = Math.max(1, Math.floor(allNums.length / 15));
        for (let i = 0; i < allNums.length; i += step) {
          for (let j = i + step; j < allNums.length; j += step) {
            const numA = allNums[i];
            const numB = allNums[j];
            if (numA === numB) continue;
            const bdA = breakdowns[numA] || {};
            const bdB = breakdowns[numB] || {};
            const vecA = algoKeys.map((key) => Math.max(0, Number(bdA[key]) || 0));
            const vecB = algoKeys.map((key) => Math.max(0, Number(bdB[key]) || 0));
            const magA = Math.sqrt(vecA.reduce((sum, val) => sum + val * val, 0)) || Number.EPSILON;
            const magB = Math.sqrt(vecB.reduce((sum, val) => sum + val * val, 0)) || Number.EPSILON;
            const dot = vecA.reduce((sum, val, idx) => sum + val / magA * (vecB[idx] / magB), 0);
            sampleSimilarities.push(Math.max(-1, Math.min(1, dot)));
          }
        }
        if (sampleSimilarities.length > 0) {
          const mean4 = sampleSimilarities.reduce((a, b) => a + b, 0) / sampleSimilarities.length;
          const variance2 = sampleSimilarities.reduce((sum, val) => sum + Math.pow(val - mean4, 2), 0) / sampleSimilarities.length;
          const stdDev4 = Math.sqrt(variance2);
          MONOCULTURE_THRESHOLD = Math.max(0.6, Math.min(0.85, mean4 + 1.5 * stdDev4));
          MAX_DIVERSITY_PENALTY = Math.max(15, Math.min(35, 25 * (0.25 / (stdDev4 + 1e-4))));
        }
      }
      let penalty = 0;
      let isMonoculture = false;
      if (meanSimilarity > MONOCULTURE_THRESHOLD) {
        isMonoculture = true;
        const excessSimilarity = meanSimilarity - MONOCULTURE_THRESHOLD;
        const maxExcess = Math.max(1e-4, 1 - MONOCULTURE_THRESHOLD);
        penalty += MAX_DIVERSITY_PENALTY * Math.pow(excessSimilarity / maxExcess, 2);
      }
      const redundancyPenaltyFactor = Math.pow(mutualInformationScore, 2);
      penalty += MAX_DIVERSITY_PENALTY * redundancyPenaltyFactor;
      penalty = Math.min(MAX_DIVERSITY_PENALTY, penalty);
      let dominantAlgo = null;
      let maxContribution = -1;
      for (const [algo, contribution] of Object.entries(algoContributions)) {
        if (contribution > maxContribution) {
          maxContribution = contribution;
          dominantAlgo = algo;
        }
      }
      return {
        meanSimilarity: parseFloat(meanSimilarity.toFixed(4)),
        diversityScore: parseFloat(diversityScore.toFixed(4)),
        penalty: parseFloat(penalty.toFixed(2)),
        isMonoculture,
        pairwiseSimilarities: pairwiseSimilarities.map((v) => parseFloat(v.toFixed(4))),
        dominantAlgo,
        mutualInformationScore: parseFloat(mutualInformationScore.toFixed(4)),
        klDivergenceBonus: parseFloat(klDivergenceBonus.toFixed(4))
      };
    };
  }
});

// services/prediction/combinationGenerator.ts
var DOMAIN_SIZE2, DRAW_SIZE, getDominantAlgo, getProfileSimilarity, calculateCombinationEnergyDetailed, calculateCombinationEnergy, generateCombination;
var init_combinationGenerator = __esm({
  "services/prediction/combinationGenerator.ts"() {
    "use strict";
    init_prediction_types();
    init_mathService();
    init_diversityService();
    DOMAIN_SIZE2 = 90;
    DRAW_SIZE = 5;
    getDominantAlgo = (num, breakdownsMap) => {
      const bd = breakdownsMap.get(num);
      if (!bd) return null;
      let maxVal = -Infinity;
      let maxAlgo = null;
      Object.entries(bd).forEach(([algo, val]) => {
        if (typeof val === "number" && val > maxVal) {
          maxVal = val;
          maxAlgo = algo;
        }
      });
      return maxAlgo;
    };
    getProfileSimilarity = (n1, n2, breakdownsMap) => {
      const bd1 = breakdownsMap.get(n1);
      const bd2 = breakdownsMap.get(n2);
      if (!bd1 || !bd2) return 0;
      let dot = 0;
      let norm1 = 0;
      let norm2 = 0;
      const keys2 = Object.keys(bd1);
      keys2.forEach((k) => {
        const v1 = bd1[k] || 0;
        const v2 = bd2[k] || 0;
        dot += v1 * v2;
        norm1 += v1 * v1;
        norm2 += v2 * v2;
      });
      if (norm1 === 0 || norm2 === 0) return 0;
      return dot / (Math.sqrt(norm1) * Math.sqrt(norm2));
    };
    calculateCombinationEnergyDetailed = (combo, scoresMap, affinityMap, calibration = FALLBACK_CALIBRATION, lastDraw, breakdownsMap, topPool, targetOutsiders = 0) => {
      let baseScoreSum = 0;
      let affinitySum = 0;
      for (let i = 0; i < combo.length; i++) {
        const n1 = combo[i];
        baseScoreSum += scoresMap.get(n1) || 0;
        for (let j = i + 1; j < combo.length; j++) {
          const n2 = combo[j];
          affinitySum += affinityMap[n1]?.[n2] || 0;
        }
      }
      const baseScoreScale = combo.length > 0 ? 5 / combo.length : 1;
      const affinityScale = combo.length > 1 ? 10 / (combo.length * (combo.length - 1)) : 1;
      const baseScoreTerm = -(baseScoreSum * baseScoreScale);
      const affinityTerm = -(affinitySum * affinityScale);
      let repetitionPenalty = 0;
      if (lastDraw && lastDraw.length > 0 && combo.length > 0) {
        const intersectionCount = combo.filter((n) => lastDraw.includes(n)).length;
        const expectedIntersection = combo.length * DRAW_SIZE / DOMAIN_SIZE2;
        const varIntersection = combo.length * (DRAW_SIZE / DOMAIN_SIZE2) * (1 - DRAW_SIZE / DOMAIN_SIZE2) * ((DOMAIN_SIZE2 - DRAW_SIZE) / (DOMAIN_SIZE2 - 1));
        const stdIntersection = Math.sqrt(Math.max(Number.EPSILON, varIntersection));
        const zIntersection = Math.max(0, intersectionCount - expectedIntersection) / stdIntersection;
        repetitionPenalty = Math.min(25, Math.pow(zIntersection, 2));
      }
      let parityPenalty = 0;
      if (combo.length > 0) {
        const evens = combo.filter((n) => n % 2 === 0).length;
        const expectedEvens = combo.length * 0.5;
        const stdEvens = Math.sqrt(combo.length * 0.25);
        const zEvens = (evens - expectedEvens) / stdEvens;
        parityPenalty = Math.min(10, Math.pow(zEvens, 2));
      }
      let decadePenalty = 0;
      if (combo.length > 0) {
        const decades = new Array(10).fill(0);
        for (const num of combo) decades[Math.floor(num / 10)]++;
        const maxDecade = decades.reduce((a, b) => Math.max(a, b), 0);
        const expectedDecade = combo.length / 10;
        const stdDecades = Math.sqrt(combo.length * 0.1 * 0.9);
        const zDecades = Math.max(0, maxDecade - expectedDecade) / stdDecades;
        decadePenalty = Math.min(15, Math.pow(zDecades, 2));
      }
      let amplitudePenalty = 0;
      if (combo.length >= 2) {
        const sortedCombo = [...combo].sort((a, b) => a - b);
        const amplitude = sortedCombo[sortedCombo.length - 1] - sortedCombo[0];
        const ampScale = (combo.length - 1) / 4;
        const expectedAmp = calibration.meanAmplitude * ampScale;
        const expectedStd = calibration.stdAmplitude * Math.sqrt(ampScale);
        const zAmp = (amplitude - expectedAmp) / Math.max(Number.EPSILON, expectedStd);
        amplitudePenalty = Math.min(15, Math.pow(zAmp, 2));
      }
      let consecutivePenalty = 0;
      if (combo.length >= 2) {
        const sortedCombo = [...combo].sort((a, b) => a - b);
        let maxConsecutive = 1;
        let currentConsecutive = 1;
        for (let i = 0; i < sortedCombo.length - 1; i++) {
          if (sortedCombo[i] + 1 === sortedCombo[i + 1]) {
            currentConsecutive++;
            if (currentConsecutive > maxConsecutive) maxConsecutive = currentConsecutive;
          } else {
            currentConsecutive = 1;
          }
        }
        const lambda = calibration.lambdaConsecutives;
        const expectedConsecutive = 1 + lambda * ((combo.length - 1) / 4);
        const stdConsecutive = Math.max(0.1, Math.sqrt(lambda));
        const zConsecutive = Math.max(0, maxConsecutive - expectedConsecutive) / stdConsecutive;
        consecutivePenalty = Math.pow(zConsecutive, 2);
        if (maxConsecutive >= 3) {
          consecutivePenalty += 5 * (maxConsecutive - 2);
        }
        consecutivePenalty = Math.min(20, consecutivePenalty);
      }
      let acPenalty = 0;
      if (combo.length >= 4) {
        const sortedCombo = [...combo].sort((a, b) => a - b);
        const ac = calculateACValue2(sortedCombo);
        const acScale = (combo.length - 3) / 2;
        const expectedAC = calibration.meanAC * acScale;
        const stdAC = calibration.stdAC * Math.sqrt(acScale);
        const zAC = (ac - expectedAC) / Math.max(Number.EPSILON, stdAC);
        acPenalty = Math.min(8, Math.pow(zAC, 2) * Math.exp(-Math.abs(zAC)));
      }
      let diversityPenalty = 0;
      if (breakdownsMap && combo.length >= 2) {
        const smallBreakdowns = {};
        for (const num of combo) {
          const bd = breakdownsMap.get(num);
          if (bd) smallBreakdowns[num] = bd;
        }
        const diversity = calculateGeneticDiversityIndex(combo, smallBreakdowns);
        const numAlgos = Object.keys(smallBreakdowns[combo[0]] || {}).length;
        const dynamicMonocultureThreshold = 1 - 1 / Math.sqrt(Math.max(1, numAlgos));
        if (diversity.isMonoculture || diversity.meanSimilarity > dynamicMonocultureThreshold) {
          const excessSimilarity = diversity.meanSimilarity - dynamicMonocultureThreshold;
          const maxExcess = 1 - dynamicMonocultureThreshold;
          const normalizedExcess = excessSimilarity / Math.max(Number.EPSILON, maxExcess);
          const maxPenalty = 25;
          const curvature = 4;
          const monoculturePenalty = maxPenalty * (Math.exp(curvature * normalizedExcess) - 1) / (Math.exp(curvature) - 1);
          diversityPenalty = monoculturePenalty;
        } else {
          diversityPenalty = diversity.penalty;
        }
      }
      let spatialClusteringPenalty = 0;
      if (combo.length >= 2) {
        const sortedCombo = [...combo].sort((a, b) => a - b);
        let adjacentClosePairs = 0;
        for (let i = 0; i < sortedCombo.length - 1; i++) {
          const diff = sortedCombo[i + 1] - sortedCombo[i];
          if (diff <= 2) {
            adjacentClosePairs++;
          }
        }
        spatialClusteringPenalty += adjacentClosePairs * 2.5;
        for (let i = 0; i < sortedCombo.length; i++) {
          let countInWindow = 1;
          for (let j = i + 1; j < sortedCombo.length; j++) {
            if (sortedCombo[j] - sortedCombo[i] <= 12) {
              countInWindow++;
            }
          }
          if (countInWindow >= 3) {
            spatialClusteringPenalty += 3 * (countInWindow - 2);
          }
        }
        spatialClusteringPenalty = Math.min(15, spatialClusteringPenalty);
      }
      let recentBiasPenalty = 0;
      if (lastDraw && lastDraw.length > 0 && combo.length > 0) {
        let neighborsCount = 0;
        for (const num of combo) {
          for (const prev of lastDraw) {
            if (Math.abs(num - prev) === 1) {
              neighborsCount++;
            }
          }
        }
        recentBiasPenalty = Math.min(7.5, neighborsCount * 1.5);
      }
      let profileSimilarityPenalty = 0;
      if (breakdownsMap && combo.length >= 2) {
        for (let i = 0; i < combo.length; i++) {
          for (let j = i + 1; j < combo.length; j++) {
            const sim = getProfileSimilarity(combo[i], combo[j], breakdownsMap);
            if (sim > 0.75) {
              profileSimilarityPenalty += 6 * sim;
            }
          }
        }
        profileSimilarityPenalty = Math.min(15, profileSimilarityPenalty);
      }
      let dominantFamilyPenalty = 0;
      if (breakdownsMap && combo.length >= 2) {
        const familyCounts = {};
        for (const num of combo) {
          const dom = getDominantAlgo(num, breakdownsMap);
          if (dom) {
            familyCounts[dom] = (familyCounts[dom] || 0) + 1;
          }
        }
        for (const count of Object.values(familyCounts)) {
          if (count >= 2) {
            dominantFamilyPenalty += (count - 1) * 4;
          }
        }
        dominantFamilyPenalty = Math.min(15, dominantFamilyPenalty);
      }
      let decadeConcentrationPenalty = 0;
      if (combo.length >= 2) {
        const decCounts = {};
        for (const num of combo) {
          const d = Math.floor(num / 10);
          decCounts[d] = (decCounts[d] || 0) + 1;
        }
        for (const count of Object.values(decCounts)) {
          if (count >= 2) {
            decadeConcentrationPenalty += (count - 1) * 3;
          }
        }
        decadeConcentrationPenalty = Math.min(12, decadeConcentrationPenalty);
      }
      let outsiderQuotaPenalty = 0;
      if (topPool && topPool.length > 0 && combo.length === DRAW_SIZE) {
        const currentOutsiders = combo.filter((n) => !topPool.includes(n)).length;
        const diff = Math.abs(currentOutsiders - targetOutsiders);
        outsiderQuotaPenalty = diff * 4;
      }
      const totalEnergy = baseScoreTerm + affinityTerm + repetitionPenalty + parityPenalty + decadePenalty + amplitudePenalty + consecutivePenalty + acPenalty + diversityPenalty + spatialClusteringPenalty + recentBiasPenalty + profileSimilarityPenalty + dominantFamilyPenalty + decadeConcentrationPenalty + outsiderQuotaPenalty;
      return {
        totalEnergy,
        baseScoreTerm,
        affinityTerm,
        repetitionPenalty,
        parityPenalty,
        decadePenalty,
        amplitudePenalty,
        consecutivePenalty,
        acPenalty,
        diversityPenalty,
        spatialClusteringPenalty,
        recentBiasPenalty,
        profileSimilarityPenalty,
        dominantFamilyPenalty,
        decadeConcentrationPenalty,
        outsiderQuotaPenalty
      };
    };
    calculateCombinationEnergy = (combo, scoresMap, affinityMap, calibration = FALLBACK_CALIBRATION, lastDraw, breakdownsMap, topPool, targetOutsiders = 0) => {
      return calculateCombinationEnergyDetailed(
        combo,
        scoresMap,
        affinityMap,
        calibration,
        lastDraw,
        breakdownsMap,
        topPool,
        targetOutsiders
      ).totalEnergy;
    };
    generateCombination = async (sortedScores, affinityMap, calibration, outsiderCount, lastDraw, regimeStateNormalized) => {
      const outsiderRatio = outsiderCount / DRAW_SIZE;
      const scoresMap = /* @__PURE__ */ new Map();
      const breakdownsMap = /* @__PURE__ */ new Map();
      sortedScores.forEach((s) => {
        scoresMap.set(s.num, s.score);
        if (s.breakdown) breakdownsMap.set(s.num, s.breakdown);
      });
      const topZoneCount = Math.max(DRAW_SIZE, Math.floor(sortedScores.length * Math.max(0, 1 - outsiderRatio)));
      const topPool = sortedScores.slice(0, topZoneCount).map((s) => s.num);
      const outsiderPool = sortedScores.slice(topZoneCount, sortedScores.length).map((s) => s.num);
      const allCandidatesPool = sortedScores.map((s) => s.num);
      const targetOutsiders = Math.round(DRAW_SIZE * outsiderRatio);
      const targetTop = Math.max(0, DRAW_SIZE - targetOutsiders);
      let lcgSeed = 2166136261;
      const mixSeed = (val) => {
        lcgSeed ^= val;
        lcgSeed = Math.imul(lcgSeed, 16777619);
      };
      if (lastDraw) lastDraw.forEach(mixSeed);
      sortedScores.slice(0, 10).forEach((s) => {
        mixSeed(s.num);
        mixSeed(Math.floor(s.score * 1e3));
      });
      const lcgRandom = () => {
        lcgSeed = lcgSeed * 1664525 + 1013904223 >>> 0;
        return lcgSeed / 4294967296;
      };
      const runGreedyConstruction = (initialSelections, poolCandidates, targetOutsidersQuota, forceOutsiders = false) => {
        const combo = [...initialSelections];
        while (combo.length < DRAW_SIZE) {
          let bestCandidate = -1;
          let bestEnergyValue = Infinity;
          let candidates = poolCandidates.filter((c) => !combo.includes(c));
          if (forceOutsiders) {
            const currentOutsidersCount = combo.filter((n) => outsiderPool.includes(n)).length;
            const remainingSlots = DRAW_SIZE - combo.length;
            const neededOutsiders = targetOutsidersQuota - currentOutsidersCount;
            if (neededOutsiders > 0 && neededOutsiders >= remainingSlots) {
              candidates = candidates.filter((c) => outsiderPool.includes(c));
              if (candidates.length === 0) {
                candidates = poolCandidates.filter((c) => !combo.includes(c) && outsiderPool.includes(c));
              }
            }
          }
          if (candidates.length === 0) {
            candidates = allCandidatesPool.filter((c) => !combo.includes(c));
          }
          for (const candidate of candidates) {
            const proposed = [...combo, candidate];
            const energyBreakdown = calculateCombinationEnergyDetailed(
              proposed,
              scoresMap,
              affinityMap,
              calibration,
              lastDraw,
              breakdownsMap,
              topPool,
              targetOutsidersQuota
            );
            const energyVal = energyBreakdown.totalEnergy;
            if (energyVal < bestEnergyValue) {
              bestEnergyValue = energyVal;
              bestCandidate = candidate;
            }
          }
          if (bestCandidate !== -1) {
            combo.push(bestCandidate);
          } else {
            for (const cand of candidates) {
              if (!combo.includes(cand)) {
                combo.push(cand);
                break;
              }
            }
            if (combo.length === initialSelections.length) break;
          }
        }
        return combo;
      };
      const seed1 = runGreedyConstruction([topPool[0]], allCandidatesPool, targetOutsiders);
      const firstNum = topPool[0];
      const secondNumCandidates = topPool.slice(1, 15).filter((n) => getProfileSimilarity(firstNum, n, breakdownsMap) < 0.4);
      const secondNum = secondNumCandidates.length > 0 ? secondNumCandidates[0] : topPool[1];
      const seed2 = runGreedyConstruction([firstNum, secondNum], allCandidatesPool, targetOutsiders);
      let bestPair = [topPool[0], topPool[1]];
      let maxAffinity = -1;
      for (let i = 0; i < Math.min(10, topPool.length); i++) {
        for (let j = i + 1; j < Math.min(10, topPool.length); j++) {
          const aff = affinityMap[topPool[i]]?.[topPool[j]] || 0;
          if (aff > maxAffinity) {
            maxAffinity = aff;
            bestPair = [topPool[i], topPool[j]];
          }
        }
      }
      const seed3 = runGreedyConstruction(bestPair, allCandidatesPool, targetOutsiders);
      const firstOutsider = outsiderPool.length > 0 ? outsiderPool[0] : topPool[topPool.length - 1];
      const seed4 = runGreedyConstruction([firstOutsider], allCandidatesPool, targetOutsiders, true);
      const seedsList = [seed1, seed2, seed3, seed4].filter((s) => s.length === DRAW_SIZE);
      let bestInitialCombo = seed1;
      let bestInitialEnergy = Infinity;
      for (const s of seedsList) {
        const e = calculateCombinationEnergy(s, scoresMap, affinityMap, calibration, lastDraw, breakdownsMap, topPool, targetOutsiders);
        if (e < bestInitialEnergy) {
          bestInitialEnergy = e;
          bestInitialCombo = s;
        }
      }
      let currentCombo = [...bestInitialCombo];
      let currentEnergy = bestInitialEnergy;
      let bestCombo = [...currentCombo];
      let bestEnergy = currentEnergy;
      let sumDelta = 0;
      let samplesCount = 0;
      for (let s = 0; s < 10; s++) {
        const idx = Math.floor(lcgRandom() * DRAW_SIZE);
        const isOutsiderSlot = idx >= targetTop;
        const list = isOutsiderSlot && outsiderPool.length > 0 ? outsiderPool : topPool;
        const rNum = list[Math.floor(lcgRandom() * list.length)];
        if (!currentCombo.includes(rNum)) {
          const propose = [...currentCombo];
          propose[idx] = rNum;
          const proposeEnergy = calculateCombinationEnergy(propose, scoresMap, affinityMap, calibration, lastDraw, breakdownsMap, topPool, targetOutsiders);
          sumDelta += Math.abs(proposeEnergy - currentEnergy);
          samplesCount++;
        }
      }
      const meanDelta = samplesCount > 0 ? sumDelta / samplesCount : 2.5;
      let temperature = Math.max(1, meanDelta) * Math.exp(regimeStateNormalized);
      const initialTemperature = temperature;
      const minTemperature = initialTemperature * 1e-4;
      const stateSpaceSize = DRAW_SIZE * (DOMAIN_SIZE2 - DRAW_SIZE);
      const iterationsPerTemp = Math.max(8, Math.floor(Math.log(stateSpaceSize) * 3.5 * Math.exp(regimeStateNormalized)));
      let stagnationCounter = 0;
      const worstCaseCoolingSteps = Math.log(1e-4) / Math.log(0.99);
      const maxOuterIterations = Math.ceil(worstCaseCoolingSteps * 0.4);
      const maxReheatEvents = Math.max(3, Math.ceil(Math.log2(stateSpaceSize)));
      let reheatEventCount = 0;
      let outerIterationCount = 0;
      while (temperature > minTemperature && outerIterationCount < maxOuterIterations) {
        outerIterationCount++;
        if (outerIterationCount % 15 === 0) {
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
        const energyVariances = [];
        for (let i = 0; i < iterationsPerTemp; i++) {
          let proposedCombo = [...currentCombo];
          const moveType = lcgRandom();
          if (moveType < 0.8) {
            const indexToSwap = Math.floor(lcgRandom() * DRAW_SIZE);
            const isOutsiderSlot = indexToSwap >= targetTop;
            const candidateList = isOutsiderSlot && outsiderPool.length > 0 ? outsiderPool : topPool;
            let newNum = candidateList[Math.floor(lcgRandom() * candidateList.length)];
            let attempts = 0;
            while (currentCombo.includes(newNum) && attempts < candidateList.length) {
              newNum = candidateList[Math.floor(lcgRandom() * candidateList.length)];
              attempts++;
            }
            proposedCombo[indexToSwap] = newNum;
          } else if (moveType < 0.9) {
            const idx1 = Math.floor(lcgRandom() * DRAW_SIZE);
            let idx2 = Math.floor(lcgRandom() * DRAW_SIZE);
            while (idx2 === idx1) {
              idx2 = Math.floor(lcgRandom() * DRAW_SIZE);
            }
            const isOutsider1 = idx1 >= targetTop;
            const list1 = isOutsider1 && outsiderPool.length > 0 ? outsiderPool : topPool;
            let newNum1 = list1[Math.floor(lcgRandom() * list1.length)];
            let attempts = 0;
            while (proposedCombo.includes(newNum1) && attempts < list1.length) {
              newNum1 = list1[Math.floor(lcgRandom() * list1.length)];
              attempts++;
            }
            proposedCombo[idx1] = newNum1;
            const isOutsider2 = idx2 >= targetTop;
            const list2 = isOutsider2 && outsiderPool.length > 0 ? outsiderPool : topPool;
            let newNum2 = list2[Math.floor(lcgRandom() * list2.length)];
            attempts = 0;
            while (proposedCombo.includes(newNum2) && attempts < list2.length) {
              newNum2 = list2[Math.floor(lcgRandom() * list2.length)];
              attempts++;
            }
            proposedCombo[idx2] = newNum2;
          } else {
            let minAvgAff = Infinity;
            let minAffIdx = 0;
            for (let idx = 0; idx < DRAW_SIZE; idx++) {
              let sumAff = 0;
              for (let k = 0; k < DRAW_SIZE; k++) {
                if (idx !== k) {
                  sumAff += affinityMap[currentCombo[idx]]?.[currentCombo[k]] || 0;
                }
              }
              if (sumAff < minAvgAff) {
                minAvgAff = sumAff;
                minAffIdx = idx;
              }
            }
            const isOutsiderSlot = minAffIdx >= targetTop;
            const candidateList = isOutsiderSlot && outsiderPool.length > 0 ? outsiderPool : topPool;
            const otherNumbers = currentCombo.filter((_, idx) => idx !== minAffIdx);
            let bestCand = -1;
            let maxCandAff = -Infinity;
            for (let a = 0; a < 8; a++) {
              const cand = candidateList[Math.floor(lcgRandom() * candidateList.length)];
              if (currentCombo.includes(cand)) continue;
              let sumAff = 0;
              for (const o of otherNumbers) {
                sumAff += affinityMap[cand]?.[o] || 0;
              }
              if (sumAff > maxCandAff) {
                maxCandAff = sumAff;
                bestCand = cand;
              }
            }
            if (bestCand !== -1) {
              proposedCombo[minAffIdx] = bestCand;
            } else {
              const list = isOutsiderSlot && outsiderPool.length > 0 ? outsiderPool : topPool;
              let newNum = list[Math.floor(lcgRandom() * list.length)];
              let attempts = 0;
              while (currentCombo.includes(newNum) && attempts < list.length) {
                newNum = list[Math.floor(lcgRandom() * list.length)];
                attempts++;
              }
              proposedCombo[minAffIdx] = newNum;
            }
          }
          const proposedEnergy = calculateCombinationEnergy(
            proposedCombo,
            scoresMap,
            affinityMap,
            calibration,
            lastDraw,
            breakdownsMap,
            topPool,
            targetOutsiders
          );
          energyVariances.push(Math.abs(proposedEnergy - currentEnergy));
          if (proposedEnergy < currentEnergy) {
            currentCombo = proposedCombo;
            currentEnergy = proposedEnergy;
            stagnationCounter = 0;
            if (proposedEnergy < bestEnergy) {
              bestCombo = [...currentCombo];
              bestEnergy = proposedEnergy;
            }
          } else {
            const acceptanceProbability = Math.exp(-(proposedEnergy - currentEnergy) / temperature);
            if (lcgRandom() < acceptanceProbability) {
              currentCombo = proposedCombo;
              currentEnergy = proposedEnergy;
            } else {
              stagnationCounter++;
            }
          }
        }
        if (stagnationCounter >= 30 && reheatEventCount < maxReheatEvents) {
          temperature = Math.min(initialTemperature * 1.5, temperature * 1.15);
          stagnationCounter = 0;
          reheatEventCount++;
        }
        const avgVariance = energyVariances.length > 0 ? energyVariances.reduce((a, b) => a + b, 0) / energyVariances.length : 0;
        const relativeAgitation = avgVariance / Math.max(Number.EPSILON, temperature);
        const coolingSignal = 1 / (1 + Math.exp(-relativeAgitation));
        const adaptiveCoolingRate = 0.85 + 0.14 * coolingSignal;
        temperature *= adaptiveCoolingRate;
      }
      return bestCombo.sort((a, b) => a - b);
    };
  }
});

// services/prediction/ticketAnalysisService.ts
var generateEmpiricalCalibration;
var init_ticketAnalysisService = __esm({
  "services/prediction/ticketAnalysisService.ts"() {
    "use strict";
    init_prediction_types();
    init_mathCore();
    init_diversityService();
    init_weightsManager();
    generateEmpiricalCalibration = (history) => {
      if (!history || history.length < 10) {
        return FALLBACK_CALIBRATION;
      }
      const sums = [];
      const amplitudes = [];
      const acs = [];
      let totalConsecutives = 0;
      for (const draw of history) {
        const nums = draw.numbers || draw.gagnants || [
          draw.G1,
          draw.G2,
          draw.G3,
          draw.G4,
          draw.G5
        ].filter((n2) => typeof n2 === "number");
        if (nums.length < 5) continue;
        const sorted = [...nums].sort((a, b) => a - b);
        sums.push(sorted.reduce((a, b) => a + b, 0));
        amplitudes.push(sorted[sorted.length - 1] - sorted[0]);
        acs.push(calculateACValue(sorted));
        let consec = 0;
        for (let i = 0; i < sorted.length - 1; i++) {
          if (sorted[i + 1] - sorted[i] === 1) consec++;
        }
        totalConsecutives += consec;
      }
      const n = sums.length;
      if (n === 0) return FALLBACK_CALIBRATION;
      const mean4 = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
      const std = (arr, m) => Math.sqrt(arr.reduce((sq, val) => sq + Math.pow(val - m, 2), 0) / arr.length);
      const mSum = mean4(sums);
      const mAmp = mean4(amplitudes);
      const mAC = mean4(acs);
      const sSum = std(sums, mSum);
      const sAmp = std(amplitudes, mAmp);
      const sAC = std(acs, mAC);
      return {
        meanSum: mSum,
        stdSum: sSum > 0.1 ? sSum : 56.8,
        meanAmplitude: mAmp,
        stdAmplitude: sAmp > 0.1 ? sAmp : 13.5,
        meanAC: mAC,
        stdAC: sAC > 0.1 ? sAC : 0.71,
        lambdaConsecutives: totalConsecutives / n,
        isValid: true
      };
    };
  }
});

// services/prediction/workerStub.ts
var init_workerStub = __esm({
  "services/prediction/workerStub.ts"() {
  }
});

// services/advancedMathService.ts
var DOMAIN_SIZE3, DRAW_SIZE2, BASE_PROB, getAdaptiveWindow, getTimeDecayWeight, calculateSpatialHotSpots, calculateDigitalRootAnalysis, calculateResistanceScores, calculateGapVelocityScores, calculateCoOccurrenceScores, calculateTemporalScores, calculatePoissonScores, calculateLeaderSuccession, calculateBayesianScore, calculateAnomalyScores, calculateAiIntuition, calculateFractalResonance, calculateHawkesExcitation, calculateTopologicalLyapunov;
var init_advancedMathService = __esm({
  "services/advancedMathService.ts"() {
    "use strict";
    init_mathService();
    DOMAIN_SIZE3 = 90;
    DRAW_SIZE2 = 5;
    BASE_PROB = DRAW_SIZE2 / DOMAIN_SIZE3;
    getAdaptiveWindow = (historyLength, hurstExponent) => {
      const persistenceMultiplier = 1 + (hurstExponent - 0.5) * 2;
      const baseWindow = Math.floor(Math.sqrt(historyLength));
      return Math.max(
        10,
        Math.min(historyLength, Math.floor(baseWindow * persistenceMultiplier))
      );
    };
    getTimeDecayWeight = (index, adaptiveHalfLife) => {
      return Math.pow(0.5, index / adaptiveHalfLife);
    };
    calculateSpatialHotSpots = (history, hurstExponent = 0.5, customSigma) => {
      const gridWidth = 10;
      const gridHeight = 9;
      const grid = Array.from(
        { length: gridHeight },
        () => new Float32Array(gridWidth)
      );
      const windowSize = getAdaptiveWindow(history.length, hurstExponent);
      const recent = history.slice(0, windowSize);
      const halfLife = Math.max(5, windowSize * 0.3);
      recent.forEach((d, i) => {
        const weight = getTimeDecayWeight(i, halfLife);
        d.gagnants.forEach((n) => {
          if (n >= 1 && n <= DOMAIN_SIZE3) {
            const row = Math.floor((n - 1) / gridWidth);
            const col = (n - 1) % gridWidth;
            grid[row][col] += weight;
          }
        });
      });
      const hotScores = {};
      const sigma = customSigma !== void 0 ? customSigma : 1.5;
      for (let r = 0; r < gridHeight; r++) {
        for (let c = 0; c < gridWidth; c++) {
          let score = 0;
          for (let dr = -2; dr <= 2; dr++) {
            for (let dc = -2; dc <= 2; dc++) {
              const nr = r + dr;
              const nc = c + dc;
              if (nr >= 0 && nr < gridHeight && nc >= 0 && nc < gridWidth) {
                const dist = Math.sqrt(dr * dr + dc * dc);
                const weight = Math.exp(-(dist * dist) / (2 * sigma * sigma));
                score += grid[nr][nc] * weight;
              }
            }
          }
          hotScores[r * gridWidth + c + 1] = score;
        }
      }
      return hotScores;
    };
    calculateDigitalRootAnalysis = (history, hurstExponent = 0.5) => {
      const rootCounts = new Array(10).fill(0);
      const windowSize = getAdaptiveWindow(history.length, hurstExponent);
      const recent = history.slice(0, windowSize);
      recent.forEach((d) => {
        d.gagnants.forEach((n) => {
          let root = n;
          while (root > 9) {
            root = Math.floor(root / 10) + root % 10;
          }
          if (root >= 1 && root <= 9) rootCounts[root]++;
        });
      });
      const scores = {};
      const maxCount = Math.max(...rootCounts.slice(1)) || 1;
      for (let n = 1; n <= DOMAIN_SIZE3; n++) {
        let root = n;
        while (root > 9) {
          root = Math.floor(root / 10) + root % 10;
        }
        scores[n] = rootCounts[root] / maxCount * 100;
      }
      return scores;
    };
    calculateResistanceScores = (history, hurstExponent = 0.5) => {
      const scores = {};
      const windowSize = getAdaptiveWindow(history.length, hurstExponent);
      const sample = history.slice(0, windowSize);
      const recentFreq = /* @__PURE__ */ new Map();
      const gaps = /* @__PURE__ */ new Map();
      sample.forEach(
        (d) => d.gagnants.forEach((n) => recentFreq.set(n, (recentFreq.get(n) || 0) + 1))
      );
      for (let n = 1; n <= DOMAIN_SIZE3; n++) {
        let gap = 0;
        for (let i = 0; i < sample.length; i++) {
          if (sample[i].gagnants.includes(n)) break;
          gap++;
        }
        gaps.set(n, gap);
      }
      const geomMeans = [];
      for (let n = 1; n <= DOMAIN_SIZE3; n++) {
        const f = recentFreq.get(n) || 0;
        const g = gaps.get(n) || 0;
        geomMeans.push(Math.sqrt(f * (g + 1)));
      }
      const medianGeom = geomMeans.slice().sort((a, b) => a - b)[Math.floor(DOMAIN_SIZE3 / 2)];
      const stdGeom = Math.sqrt(
        geomMeans.reduce((acc, val) => acc + Math.pow(val - medianGeom, 2), 0) / DOMAIN_SIZE3
      ) || 1;
      const slope = 1 / (stdGeom + 1e-6);
      for (let n = 1; n <= DOMAIN_SIZE3; n++) {
        const f = recentFreq.get(n) || 0;
        const g = gaps.get(n) || 0;
        const geomMean = Math.sqrt(f * (g + 1));
        scores[n] = 100 / (1 + Math.exp(-slope * (geomMean - medianGeom)));
      }
      return scores;
    };
    calculateGapVelocityScores = (history, hurstExponent = 0.5) => {
      const scores = {};
      if (history.length === 0) return scores;
      const windowSize = getAdaptiveWindow(history.length, hurstExponent);
      const limit = Math.min(history.length, Math.max(10, windowSize * 2));
      const d = Math.max(0.1, Math.min(0.9, 0.53 + (0.5 - hurstExponent) * 0.25));
      const weights = new Float32Array(limit);
      weights[0] = 1;
      for (let k = 1; k < limit; k++) {
        weights[k] = weights[k - 1] * (1 - (d + 1) / k);
      }
      const velocities = new Float32Array(DOMAIN_SIZE3 + 1);
      for (let n = 1; n <= DOMAIN_SIZE3; n++) {
        const gaps = new Float32Array(limit);
        let currentGap = 0;
        for (let j = 0; j < limit; j++) {
          const i = limit - 1 - j;
          if (history[i].gagnants.includes(n)) {
            currentGap = 0;
          } else {
            currentGap++;
          }
          gaps[j] = currentGap;
        }
        let diffVal = 0;
        for (let k = 0; k < limit; k++) {
          diffVal += weights[k] * gaps[limit - 1 - k];
        }
        velocities[n] = -diffVal;
      }
      const rawVals = Array.from(velocities.slice(1));
      const medianVal = rawVals.slice().sort((a, b) => a - b)[Math.floor(DOMAIN_SIZE3 / 2)] || 0;
      const stdDevVal = Math.sqrt(
        rawVals.reduce((acc, val) => acc + Math.pow(val - medianVal, 2), 0) / DOMAIN_SIZE3
      ) || 1;
      const slope = 1 / (stdDevVal + 1e-6);
      for (let n = 1; n <= DOMAIN_SIZE3; n++) {
        const v = velocities[n];
        scores[n] = 100 / (1 + Math.exp(-slope * (v - medianVal)));
      }
      return scores;
    };
    calculateCoOccurrenceScores = (history, hurstExponent = 0.5) => {
      const scores = {};
      if (history.length < 2) return scores;
      const lastDraw = history[0].gagnants;
      const windowSize = getAdaptiveWindow(history.length, hurstExponent);
      const sample = history.slice(1, windowSize).reverse();
      const dyadicMap = /* @__PURE__ */ new Map();
      const triadicMap = /* @__PURE__ */ new Map();
      const DOMAIN_SIZE4 = 90;
      const kalmanState = new Float64Array(DOMAIN_SIZE4 + 1).fill(0.5);
      const kalmanCovariance = new Float64Array(DOMAIN_SIZE4 + 1).fill(1);
      const freq = new Float32Array(DOMAIN_SIZE4 + 1);
      let totalFreq = 0;
      sample.forEach((draw) => {
        draw.gagnants.forEach((n) => {
          if (n >= 1 && n <= DOMAIN_SIZE4) {
            freq[n]++;
            totalFreq++;
          }
        });
      });
      let H = 0.95;
      if (totalFreq > 0) {
        let ent = 0;
        for (let c = 1; c <= DOMAIN_SIZE4; c++) {
          if (freq[c] > 0) {
            const p = freq[c] / totalFreq;
            ent -= p * Math.log2(p);
          }
        }
        H = ent / Math.log2(DOMAIN_SIZE4);
      }
      const Q = 0.02 * (1 - Math.pow(H, 2));
      const R = 0.4 * (1 + Math.pow(H, 2));
      sample.forEach((draw, drawIdx) => {
        const nums = [...draw.gagnants].sort((a, b) => a - b);
        const len = nums.length;
        for (let i = 0; i < len; i++) {
          for (let j = i + 1; j < len; j++) {
            const dyadKey = `${nums[i]}-${nums[j]}`;
            dyadicMap.set(dyadKey, (dyadicMap.get(dyadKey) || 0) + 1);
            for (let k = j + 1; k < len; k++) {
              const triadKey = `${nums[i]}-${nums[j]}-${nums[k]}`;
              triadicMap.set(triadKey, (triadicMap.get(triadKey) || 0) + 1);
            }
          }
        }
        const lastNums = [...lastDraw].sort((a, b) => a - b);
        const sampleSizeBound = Math.max(1, drawIdx + 1);
        const gamma = Math.tanh(sampleSizeBound / 45);
        for (let n = 1; n <= DOMAIN_SIZE4; n++) {
          const x_pred = kalmanState[n];
          const P_pred = kalmanCovariance[n] + Q;
          let dyadicSum = 0;
          let triadicSum = 0;
          lastNums.forEach((c) => {
            if (n === c) return;
            const key = n < c ? `${n}-${c}` : `${c}-${n}`;
            dyadicSum += dyadicMap.get(key) || 0;
          });
          for (let i = 0; i < lastNums.length; i++) {
            for (let j = i + 1; j < lastNums.length; j++) {
              const c1 = lastNums[i];
              const c2 = lastNums[j];
              if (n === c1 || n === c2) continue;
              const sorted = [n, c1, c2].sort((a, b) => a - b);
              const triKey = `${sorted[0]}-${sorted[1]}-${sorted[2]}`;
              triadicSum += triadicMap.get(triKey) || 0;
            }
          }
          const z_raw = (1 - gamma) * dyadicSum + gamma * triadicSum;
          const z_measured = z_raw / Math.max(1, sampleSizeBound * 0.1);
          const K = P_pred / (P_pred + R);
          kalmanState[n] = x_pred + K * (z_measured - x_pred);
          kalmanCovariance[n] = (1 - K) * P_pred;
        }
      });
      const finalVals = Array.from(kalmanState.slice(1));
      const medianVal = finalVals.slice().sort((a, b) => a - b)[Math.floor(DOMAIN_SIZE4 / 2)] || 0.5;
      const stdDevVal = Math.sqrt(finalVals.reduce((acc, val) => acc + Math.pow(val - medianVal, 2), 0) / DOMAIN_SIZE4) || 0.1;
      const slope = 1 / (stdDevVal + 1e-6);
      for (let n = 1; n <= DOMAIN_SIZE4; n++) {
        const v = kalmanState[n];
        scores[n] = 100 / (1 + Math.exp(-slope * (v - medianVal)));
      }
      return scores;
    };
    calculateTemporalScores = (history, hurstExponent = 0.5) => {
      const scores = {};
      const windowSize = getAdaptiveWindow(history.length, hurstExponent);
      const halfLife = Math.max(3, windowSize * 0.25);
      const lambda0 = Math.log(2) / halfLife;
      const limit = Math.min(history.length, windowSize);
      const freq = new Float32Array(DOMAIN_SIZE3 + 1);
      let totalFreq = 0;
      const entropyHorizon = Math.min(history.length, windowSize);
      for (let j = 0; j < entropyHorizon; j++) {
        history[j].gagnants.forEach((n) => {
          if (n >= 1 && n <= DOMAIN_SIZE3) {
            freq[n]++;
            totalFreq++;
          }
        });
      }
      let E = 0.95;
      if (totalFreq > 0) {
        let ent = 0;
        for (let c = 1; c <= DOMAIN_SIZE3; c++) {
          if (freq[c] > 0) {
            const p = freq[c] / totalFreq;
            ent -= p * Math.log2(p);
          }
        }
        E = ent / Math.log2(DOMAIN_SIZE3);
      }
      const lambdaE = lambda0 * Math.exp((E - 0.5) / (1.1 - E));
      const sums = history.slice(0, entropyHorizon).map((d) => d.gagnants.reduce((a, b) => a + b, 0));
      let meanSum = 0;
      sums.forEach((s) => meanSum += s);
      meanSum /= sums.length || 1;
      let varSum = 0;
      sums.forEach((s) => varSum += Math.pow(s - meanSum, 2));
      const stdSum = Math.sqrt(varSum / (sums.length || 1)) || 1;
      const \u03C3Geom = Math.min(0.25, stdSum / 1e3);
      let accumulatedExponent = 0;
      for (let i = 0; i < limit; i++) {
        const geometricNoise = \u03C3Geom * Math.cos(i * hurstExponent * Math.PI);
        const itoCorrection = -0.5 * \u03C3Geom * \u03C3Geom;
        accumulatedExponent += -lambdaE + geometricNoise + itoCorrection;
        const weight = Math.exp(accumulatedExponent) * 100;
        history[i].gagnants.forEach((n) => {
          if (n >= 1 && n <= DOMAIN_SIZE3) {
            scores[n] = (scores[n] || 0) + weight;
          }
        });
      }
      const max = Math.max(1, ...Object.values(scores));
      for (let n = 1; n <= DOMAIN_SIZE3; n++) {
        scores[n] = (scores[n] || 0) / max * 100;
      }
      return scores;
    };
    calculatePoissonScores = (history) => {
      const scores = {};
      const limit = Math.min(
        history.length,
        getAdaptiveWindow(history.length, 0.5)
      );
      const sample = history.slice(0, limit);
      const freqs = /* @__PURE__ */ new Map();
      sample.forEach(
        (d) => d.gagnants.forEach((n) => freqs.set(n, (freqs.get(n) || 0) + 1))
      );
      const lambda = limit * BASE_PROB;
      for (let n = 1; n <= DOMAIN_SIZE3; n++) {
        const k = freqs.get(n) || 0;
        const deviation = (k - lambda) / Math.sqrt(lambda);
        scores[n] = 100 / (1 + Math.exp(-1.5 * deviation));
      }
      return scores;
    };
    calculateLeaderSuccession = (history, hurstExponent = 0.5) => {
      const scores = {};
      const successionMap = /* @__PURE__ */ new Map();
      const windowSize = getAdaptiveWindow(history.length, hurstExponent);
      const limit = Math.min(history.length, windowSize);
      for (let i = 0; i < limit - 1; i++) {
        const currentDraw = history[i].gagnants;
        const prevDraw = history[i + 1].gagnants;
        if (prevDraw.length > 0) {
          const leader = prevDraw[0];
          if (!successionMap.has(leader)) successionMap.set(leader, /* @__PURE__ */ new Map());
          const followers = successionMap.get(leader);
          currentDraw.forEach((n) => {
            followers.set(n, (followers.get(n) || 0) + 1);
          });
        }
      }
      if (history.length > 0 && history[0].gagnants.length > 0) {
        const lastLeader = history[0].gagnants[0];
        const predictions = successionMap.get(lastLeader);
        if (predictions) {
          const maxCount = Math.max(...Array.from(predictions.values())) || 1;
          for (let n = 1; n <= DOMAIN_SIZE3; n++) {
            scores[n] = (predictions.get(n) || 0) / maxCount * 100;
          }
        }
      }
      return scores;
    };
    calculateBayesianScore = (history, customWindowRatio) => {
      const scores = {};
      if (history.length < 2) return scores;
      const lastDraw = history[0].gagnants;
      const totalDraws = history.length;
      const alpha = 1;
      const V = DOMAIN_SIZE3;
      const priors = /* @__PURE__ */ new Map();
      history.forEach(
        (d) => d.gagnants.forEach((n) => priors.set(n, (priors.get(n) || 0) + 1))
      );
      const likelihoods = /* @__PURE__ */ new Map();
      const windowRatio = customWindowRatio !== void 0 ? customWindowRatio : 0.1;
      const windowSize = Math.max(2, Math.floor(totalDraws * windowRatio));
      for (let i = 0; i < totalDraws - windowSize; i++) {
        const targetDraw = history[i].gagnants;
        let contextMatches = 0;
        for (let w = 1; w <= windowSize; w++) {
          const prevDraw = history[i + w].gagnants;
          contextMatches += prevDraw.filter((n) => lastDraw.includes(n)).length;
        }
        if (contextMatches > 0) {
          targetDraw.forEach((n) => {
            likelihoods.set(n, (likelihoods.get(n) || 0) + contextMatches);
          });
        }
      }
      let maxPosterior = 0;
      for (let n = 1; n <= DOMAIN_SIZE3; n++) {
        const countN = priors.get(n) || 0;
        const prior = (countN + alpha) / (totalDraws * DRAW_SIZE2 + alpha * V);
        const likelihoodCount = likelihoods.get(n) || 0;
        const likelihood = (likelihoodCount + alpha) / (countN * windowSize + alpha * V);
        const posterior = prior * likelihood;
        scores[n] = posterior;
        if (posterior > maxPosterior) maxPosterior = posterior;
      }
      if (maxPosterior > 0) {
        for (let n = 1; n <= DOMAIN_SIZE3; n++) {
          scores[n] = scores[n] / maxPosterior * 100;
        }
      }
      return scores;
    };
    calculateAnomalyScores = (history, hurstExponent = 0.5) => {
      const scores = {};
      if (history.length === 0) return scores;
      const freqs = new Array(DOMAIN_SIZE3 + 1).fill(0);
      const gaps = new Array(DOMAIN_SIZE3 + 1).fill(100);
      const windowSize = getAdaptiveWindow(history.length, hurstExponent);
      history.slice(0, windowSize).forEach((d, idx) => {
        d.gagnants.forEach((n) => {
          if (n >= 1 && n <= DOMAIN_SIZE3) {
            freqs[n]++;
            if (gaps[n] === 100) gaps[n] = idx;
          }
        });
      });
      const validFreqs = freqs.slice(1);
      const validGaps = gaps.slice(1);
      const medianFreq = [...validFreqs].sort((a, b) => a - b)[Math.floor(DOMAIN_SIZE3 / 2)] || 0;
      const stdFreq = Math.sqrt(
        validFreqs.reduce((a, b) => a + Math.pow(b - medianFreq, 2), 0) / DOMAIN_SIZE3
      ) || 1;
      const medianGap = [...validGaps].sort((a, b) => a - b)[Math.floor(DOMAIN_SIZE3 / 2)] || 0;
      const stdGap = Math.sqrt(
        validGaps.reduce((a, b) => a + Math.pow(b - medianGap, 2), 0) / DOMAIN_SIZE3
      ) || 1;
      for (let n = 1; n <= DOMAIN_SIZE3; n++) {
        let anomalyScore = 0;
        const zFreq = (freqs[n] - medianFreq) / stdFreq;
        const zGap = (gaps[n] - medianGap) / stdGap;
        anomalyScore += 60 * (1 - Math.exp(-0.5 * zFreq * zFreq));
        anomalyScore += 40 * (1 - Math.exp(-0.5 * zGap * zGap));
        scores[n] = Math.min(100, Math.max(0, anomalyScore));
      }
      return scores;
    };
    calculateAiIntuition = (history, metrics) => {
      const scores = {};
      const recent = history.slice(0, getAdaptiveWindow(history.length, 0.5));
      const sequenceBoost = /* @__PURE__ */ new Map();
      recent.forEach((d) => {
        const nums = [...d.gagnants].sort((a, b) => a - b);
        for (let i = 0; i < nums.length - 1; i++) {
          const diff = nums[i + 1] - nums[i];
          if (diff > 0 && diff < 10) {
            const next = nums[i + 1] + diff;
            if (next <= DOMAIN_SIZE3) {
              sequenceBoost.set(next, (sequenceBoost.get(next) || 0) + 1);
            }
          }
        }
      });
      const freqs = new Float32Array(DOMAIN_SIZE3 + 1);
      recent.forEach(
        (d) => d.gagnants.forEach((n) => {
          if (n >= 1 && n <= DOMAIN_SIZE3) freqs[n]++;
        })
      );
      const meanFreq = Array.from(freqs).slice(1).reduce((a, b) => a + b, 0) / DOMAIN_SIZE3;
      const varFreq = Array.from(freqs).slice(1).reduce((a, b) => a + Math.pow(b - meanFreq, 2), 0) / DOMAIN_SIZE3;
      const stdFreq = Math.sqrt(varFreq) || 1;
      for (let n = 1; n <= DOMAIN_SIZE3; n++) {
        let continuousScore = 50;
        const seqNorm = (sequenceBoost.get(n) || 0) / Math.max(1, recent.length);
        continuousScore += seqNorm * 30;
        const zScore = stdFreq > 0 ? (freqs[n] - meanFreq) / stdFreq : 0;
        const anomalyFactor = 1 - 1 / (1 + Math.exp(-1 * zScore));
        continuousScore += anomalyFactor * 20;
        const spectralMetrics = metrics?.spectral;
        if (spectralMetrics) {
          const spec = spectralMetrics.find((s) => s.number === n);
          if (spec) {
            const energyNorm = spec.energy / 100;
            continuousScore += energyNorm * 15;
          }
        }
        scores[n] = Math.max(0, Math.min(100, continuousScore));
      }
      return scores;
    };
    calculateFractalResonance = (history, hurstExponent = 0.5) => {
      const scores = {};
      const limit = Math.min(
        history.length,
        getAdaptiveWindow(history.length, hurstExponent) * 2
      );
      let sumGlobalResonance = 0;
      const avgResonances = [];
      for (let n = 1; n <= DOMAIN_SIZE3; n++) {
        const appearances = [];
        for (let i = 0; i < limit; i++) {
          if (history[i].gagnants.includes(n)) {
            appearances.push(i);
          }
        }
        if (appearances.length < 3) {
          avgResonances.push(0);
          continue;
        }
        const gaps = [];
        for (let i = 0; i < appearances.length - 1; i++) {
          gaps.push(appearances[i + 1] - appearances[i]);
        }
        let resonance = 0;
        for (let i = 0; i < gaps.length - 1; i++) {
          const ratio = gaps[i] / (gaps[i + 1] || 1);
          resonance += Math.exp(-0.5 * Math.pow(ratio - 1.618, 2));
          resonance += Math.exp(-0.5 * Math.pow(ratio - 1, 2));
          resonance += Math.exp(-0.5 * Math.pow(ratio - 2, 2));
        }
        const avgResonance = resonance / (gaps.length || 1);
        avgResonances.push(avgResonance);
        sumGlobalResonance += avgResonance;
      }
      const medianResonance = [...avgResonances].sort((a, b) => a - b)[Math.floor(DOMAIN_SIZE3 / 2)] || 0;
      const stdResonance = Math.sqrt(
        avgResonances.reduce(
          (acc, val) => acc + Math.pow(val - medianResonance, 2),
          0
        ) / DOMAIN_SIZE3
      ) || 1;
      const slope = 1 / (stdResonance + 1e-6);
      for (let n = 1; n <= DOMAIN_SIZE3; n++) {
        const res = avgResonances[n - 1];
        if (res === 0) {
          scores[n] = 100 / (1 + Math.exp(-slope * (0 - medianResonance)));
        } else {
          scores[n] = 100 / (1 + Math.exp(-slope * (res - medianResonance)));
        }
      }
      return scores;
    };
    calculateHawkesExcitation = (history) => {
      const scores = {};
      if (history.length === 0) return scores;
      const variance_empirique = DRAW_SIZE2 * (1 - BASE_PROB);
      const lambda_max = variance_empirique * Math.pow(1 + Math.sqrt(BASE_PROB), 2);
      const mu = BASE_PROB;
      const entropy = calculateShannonEntropy2(history).normalized || 0.5;
      const volatility = calculateVolatility(history).score / 100 || 0.5;
      const alpha = 0.2 + 0.5 * volatility;
      const beta = 0.1 + 0.3 * entropy;
      for (let num = 1; num <= DOMAIN_SIZE3; num++) {
        let intensity = mu;
        const horizon = Math.min(150, history.length);
        for (let timeStep = horizon - 1; timeStep >= 0; timeStep--) {
          const deltaT = timeStep;
          const winners = history[timeStep].gagnants;
          if (winners.includes(num)) {
            intensity += alpha;
          }
          intensity = mu + (intensity - mu) * Math.exp(-beta);
        }
        let signalTenseur = intensity;
        if (intensity < mu + lambda_max) {
          signalTenseur *= 1 / (1 + Math.exp(2 * (mu + lambda_max - intensity)));
        }
        scores[num] = 100 * (1 - Math.exp(-signalTenseur));
      }
      return scores;
    };
    calculateTopologicalLyapunov = (history, customHorizon) => {
      const scores = {};
      if (history.length < 5) return scores;
      const baseHorizon = customHorizon !== void 0 ? customHorizon : 50;
      const horizon = Math.min(baseHorizon, history.length);
      const recentHistory = history.slice(0, horizon);
      const getGridPos = (val) => {
        const row = Math.floor((val - 1) / 10);
        const col = (val - 1) % 10;
        return { row, col };
      };
      let lyapunovSum = 0;
      let validSteps = 0;
      for (let i = 0; i < horizon - 2; i++) {
        const t0 = recentHistory[i + 1].gagnants;
        const t1 = recentHistory[i].gagnants;
        let topologicalDist = 0;
        for (const c1 of t1) {
          let minDist = 999;
          const pos1 = getGridPos(c1);
          for (const c0 of t0) {
            const pos0 = getGridPos(c0);
            const d = Math.sqrt(
              Math.pow(pos1.row - pos0.row, 2) + Math.pow(pos1.col - pos0.col, 2)
            );
            if (d < minDist) minDist = d;
          }
          topologicalDist += minDist;
        }
        const divergenceRate = Math.log(topologicalDist + 1e-4);
        lyapunovSum += divergenceRate;
        validSteps++;
      }
      const lambda = validSteps > 0 ? lyapunovSum / validSteps : 0;
      const isChaotic = lambda > 0;
      const lastDraw = history[0].gagnants;
      const entropy = calculateShannonEntropy2(history).normalized || 0.5;
      const gridDamping = Math.exp(-0.5 * entropy);
      const revDamping = 1 - entropy;
      for (let num = 1; num <= DOMAIN_SIZE3; num++) {
        const posNum = getGridPos(num);
        let maxSim = 0;
        for (const w of lastDraw) {
          const posW = getGridPos(w);
          const gridDist = Math.sqrt(
            Math.pow(posNum.row - posW.row, 2) + Math.pow(posNum.col - posW.col, 2)
          );
          const gridSim = Math.exp(-gridDamping * gridDist);
          const circularDiff = Math.min(Math.abs(num - w), 90 - Math.abs(num - w));
          const distanceAffinity = Math.exp(-Math.pow(circularDiff, 2) / 2);
          let mirrorSim = distanceAffinity * gridDamping;
          const revNum = parseInt(num.toString().split("").reverse().join(""), 10);
          const revDiff = Math.abs(revNum - w);
          const revAffinity = Math.exp(-Math.pow(revDiff, 2) / 2);
          mirrorSim = Math.max(mirrorSim, revAffinity * revDamping);
          const sim = Math.max(gridSim, mirrorSim);
          if (sim > maxSim) maxSim = sim;
        }
        let resonance = 0;
        if (isChaotic) {
          const divergenceForce = Math.tanh(lambda);
          resonance = (1 - maxSim) * divergenceForce;
        } else {
          const stabilityForce = Math.abs(Math.tanh(lambda));
          resonance = maxSim * stabilityForce;
        }
        scores[num] = 100 * (1 / (1 + Math.exp(-5 * resonance)));
      }
      return scores;
    };
  }
});

// utils/engine/hawkesEngine.ts
function getGridCoordinates(num) {
  const row = Math.floor((num - 1) / 10);
  const col = (num - 1) % 10;
  return { row, col };
}
function getEuclideanDistance(num1, num2) {
  const coord1 = getGridCoordinates(num1);
  const coord2 = getGridCoordinates(num2);
  return Math.sqrt(
    Math.pow(coord1.row - coord2.row, 2) + Math.pow(coord1.col - coord2.col, 2)
  );
}
function calculateSpatioTemporalHawkes(history, drawName) {
  if (!history || history.length === 0) {
    const fallback = {};
    for (let i = 1; i <= 90; i++) fallback[i] = 50;
    return fallback;
  }
  const newestDraw = history[0];
  const cacheKey = `${drawName}_${history.length}_${newestDraw?.date || "nodate"}`;
  if (hawkesIntensityCache.has(cacheKey)) {
    return hawkesIntensityCache.get(cacheKey);
  }
  const N = history.length;
  const DOMAIN_SIZE4 = 90;
  let sumOfPairwiseDistances = 0;
  let countOfPairs = 0;
  const distancesList = [];
  for (const draw of history) {
    const winners = draw.gagnants;
    if (!winners || winners.length < 2) continue;
    for (let i = 0; i < winners.length; i++) {
      for (let j = i + 1; j < winners.length; j++) {
        const d = getEuclideanDistance(winners[i], winners[j]);
        distancesList.push(d);
        sumOfPairwiseDistances += d;
        countOfPairs++;
      }
    }
  }
  const meanDistance = countOfPairs > 0 ? sumOfPairwiseDistances / countOfPairs : 4.5;
  const varianceDistance = distancesList.length > 0 ? distancesList.reduce((acc, val) => acc + Math.pow(val - meanDistance, 2), 0) / distancesList.length : 4;
  const sigmaSpatial = Math.max(1e-4, Math.sqrt(varianceDistance));
  const numIndices = {};
  for (let i = 1; i <= DOMAIN_SIZE4; i++) {
    numIndices[i] = [];
  }
  for (let k = 0; k < N; k++) {
    const chronoIndex = N - 1 - k;
    const winners = history[k].gagnants;
    if (!winners) continue;
    for (const num of winners) {
      if (num >= 1 && num <= DOMAIN_SIZE4) {
        numIndices[num].push(chronoIndex);
      }
    }
  }
  const mus = new Float64Array(DOMAIN_SIZE4 + 1);
  const betas = new Float64Array(DOMAIN_SIZE4 + 1);
  const alphas = new Float64Array(DOMAIN_SIZE4 + 1);
  const occurrencesCounts = Object.values(numIndices).map((arr) => arr.length);
  const totalOccurrences = occurrencesCounts.reduce((a, b) => a + b, 0) || 1;
  let entropySum = 0;
  for (const count of occurrencesCounts) {
    if (count > 0) {
      const p = count / totalOccurrences;
      entropySum -= p * Math.log2(p);
    }
  }
  const maxEntropy = Math.log2(DOMAIN_SIZE4);
  const normalizedEntropy = Math.max(0.01, Math.min(1, entropySum / (maxEntropy || 1)));
  for (let num = 1; num <= DOMAIN_SIZE4; num++) {
    const indices = numIndices[num];
    const K_num = indices.length;
    mus[num] = (K_num + 1) / (N + 2);
    let meanGap = N;
    let varGap = 0;
    if (K_num >= 2) {
      const gaps = [];
      for (let i = 0; i < K_num - 1; i++) {
        gaps.push(indices[i + 1] - indices[i]);
      }
      meanGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
      const mG = meanGap;
      varGap = gaps.reduce((acc, val) => acc + Math.pow(val - mG, 2), 0) / gaps.length;
    } else {
      meanGap = N / Math.max(1, K_num + 1);
      varGap = Math.pow(meanGap, 2) / 2;
    }
    betas[num] = 1 / Math.max(Number.EPSILON, meanGap);
    const stdDevGap = Math.sqrt(varGap);
    const cv = stdDevGap / Math.max(Number.EPSILON, meanGap);
    alphas[num] = mus[num] * (1 + Math.tanh(cv - 1)) * (1 - normalizedEntropy);
  }
  const scores = {};
  const horizon = Math.min(100, N);
  for (let num = 1; num <= DOMAIN_SIZE4; num++) {
    let excitation = 0;
    const beta = betas[num];
    const alpha = alphas[num];
    for (let step = 0; step < horizon; step++) {
      const deltaT = step + 1;
      const winners = history[step].gagnants;
      if (!winners) continue;
      let spatialExcitationSum = 0;
      for (const w of winners) {
        const dist = getEuclideanDistance(num, w);
        const spatialWeight = Math.exp(-(dist * dist) / (2 * sigmaSpatial * sigmaSpatial));
        spatialExcitationSum += spatialWeight;
      }
      excitation += alpha * spatialExcitationSum * Math.exp(-beta * deltaT);
    }
    const totalIntensity = mus[num] + excitation;
    scores[num] = 100 * (1 - Math.exp(-totalIntensity));
  }
  hawkesIntensityCache.set(cacheKey, scores);
  return scores;
}
var hawkesIntensityCache;
var init_hawkesEngine = __esm({
  "utils/engine/hawkesEngine.ts"() {
    "use strict";
    hawkesIntensityCache = /* @__PURE__ */ new Map();
  }
});

// services/prediction/microSgd.ts
var TUNING, getMedian2, getStdDev2, hashHistoryContent, buildAlgoBundle, applyDeterministicMicroSgd;
var init_microSgd = __esm({
  "services/prediction/microSgd.ts"() {
    "use strict";
    init_loggerStub();
    init_weightsManager();
    init_featureExtractor();
    init_scoringEngine();
    init_advancedMathService();
    init_hawkesEngine();
    TUNING = {
      DEFAULT_SGD_LEARNING_RATE: 0.015,
      DEFAULT_HAWKES_DECAY: 0.15,
      FORENSIC_DAMPING_CENTER: 2.5,
      FORENSIC_DAMPING_SLOPE: 1.5,
      FORENSIC_MAX_BOOST: 1.5,
      BACKPROP_LEARNING_RATE: 0.05,
      ALIGNMENT_MIN: 10,
      ALIGNMENT_MAX: 99
    };
    getMedian2 = (arr) => {
      if (arr.length === 0) return 0;
      const sorted = [...arr].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    };
    getStdDev2 = (arr, mean4) => {
      if (arr.length === 0) return 1;
      return Math.sqrt(arr.reduce((a, b) => a + Math.pow(b - mean4, 2), 0) / arr.length) || 1;
    };
    hashHistoryContent = (history) => {
      let h = 2166136261;
      for (const d of history) {
        const s = `${d.date}|${(d.gagnants || []).join(",")}`;
        for (let i = 0; i < s.length; i++) {
          h ^= s.charCodeAt(i);
          h = Math.imul(h, 16777619);
        }
      }
      return (h >>> 0).toString(16);
    };
    buildAlgoBundle = (subHistory, drawName, useSpatioTemporalHawkes) => {
      const subHawkes = useSpatioTemporalHawkes ? calculateSpatioTemporalHawkes(subHistory, drawName) : calculateHawkesExcitation(subHistory);
      return {
        poisson: calculatePoissonScores(subHistory),
        bayes: calculateBayesianScore(subHistory),
        temporal: calculateTemporalScores(subHistory),
        digitalRoot: calculateDigitalRootAnalysis(subHistory),
        resistance: calculateResistanceScores(subHistory),
        gapVelocity: calculateGapVelocityScores(subHistory),
        leaderSuccession: calculateLeaderSuccession(subHistory),
        aiIntuition: calculateAiIntuition(subHistory, {}),
        fractalResonance: calculateFractalResonance(subHistory),
        spatial: calculateSpatialHotSpots(subHistory),
        coOccurrence: calculateCoOccurrenceScores(subHistory),
        anomaly: calculateAnomalyScores(subHistory),
        hawkes: subHawkes,
        lyapunov: calculateTopologicalLyapunov(subHistory)
      };
    };
    applyDeterministicMicroSgd = async (drawName, weights, history, entropyValue, learningRateOverride, useSpatioTemporalHawkes) => {
      let adjustedWeights = { ...weights };
      if (history.length < 25) {
        return adjustedWeights;
      }
      const K = Math.min(5, history.length - 1);
      if (K <= 0) return adjustedWeights;
      const baseEta = learningRateOverride !== void 0 ? learningRateOverride : TUNING.DEFAULT_SGD_LEARNING_RATE;
      const safeEntropy = typeof entropyValue === "number" && !isNaN(entropyValue) ? entropyValue : 0.5;
      const eta = baseEta * (1 - Math.pow(safeEntropy, 2));
      const bundleCache = /* @__PURE__ */ new Map();
      let failedDraws = 0;
      let attempted = 0;
      for (let t = K - 1; t >= 0; t--) {
        await new Promise((r) => setTimeout(r, 0));
        const targetDraw = history[t];
        const subHistory = history.slice(t + 1);
        if (subHistory.length < 5) continue;
        const gagnants = targetDraw.gagnants;
        if (!gagnants || gagnants.length === 0) continue;
        attempted++;
        try {
          const subHash = `${subHistory.length}_${hashHistoryContent(subHistory)}`;
          let subMetrics = bundleCache.get(subHash);
          if (!subMetrics) {
            subMetrics = buildAlgoBundle(subHistory, drawName, useSpatioTemporalHawkes);
            bundleCache.set(subHash, subMetrics);
          }
          const subFeatures = await extractFeatures(drawName, subHistory);
          const scoredNumbers = calculateScores(subFeatures, adjustedWeights, subMetrics, subHistory);
          const subScores = scoredNumbers.map((s) => s.score);
          const subMedian = getMedian2(subScores);
          const subStd = getStdDev2(subScores, subMedian);
          const probs = {};
          scoredNumbers.forEach((s) => {
            const z = (s.score - subMedian) / (subStd + Number.EPSILON);
            probs[s.num] = 1 / (1 + Math.exp(-z));
          });
          const gradients = {};
          const algoKeys = Object.keys(adjustedWeights);
          algoKeys.forEach((algo) => {
            gradients[algo] = 0;
          });
          scoredNumbers.forEach((s) => {
            const isWinner = gagnants.includes(s.num);
            const y_i = isWinner ? 1 : 0;
            const diff = probs[s.num] - y_i;
            const p_i = probs[s.num];
            const ds_factor = 2 / 90 * diff * p_i * (1 - p_i) / (subStd + Number.EPSILON);
            algoKeys.forEach((algo) => {
              const C_ia = s.breakdown?.[algo] || 0;
              gradients[algo] += ds_factor * C_ia;
            });
          });
          algoKeys.forEach((algo) => {
            const oldWeight = adjustedWeights[algo] || 0;
            let newWeight = Math.max(0, oldWeight - eta * gradients[algo]);
            const variationClamp = 0.05 + 0.2 * (1 - safeEntropy);
            const minW = oldWeight * (1 - variationClamp);
            const maxW = oldWeight * (1 + variationClamp);
            newWeight = Math.max(minW, Math.min(maxW, newWeight));
            adjustedWeights[algo] = newWeight;
          });
          adjustedWeights = normalizeWeights(adjustedWeights);
        } catch (e) {
          failedDraws++;
          logger.debug({ err: e, t }, "[microSgd] SGD: \xE9chec sur un tirage");
        }
      }
      const dynamicFailureTolerance = 0.15 + 0.2 * safeEntropy;
      if (attempted > 0 && failedDraws / attempted > dynamicFailureTolerance) {
        logger.warn(
          { failedDraws, attempted, rate: failedDraws / attempted, threshold: dynamicFailureTolerance },
          "[microSgd] SGD: Taux d'\xE9chec sup\xE9rieur au seuil dynamique de s\xE9curit\xE9. Annulation de l'ajustement."
        );
        return weights;
      }
      return adjustedWeights;
    };
  }
});

// services/prediction/forensicAdjustments.ts
var applyForensicAdjustments, resolveForensicAdjustments;
var init_forensicAdjustments = __esm({
  "services/prediction/forensicAdjustments.ts"() {
    "use strict";
    init_loggerStub();
    init_postPredictionAnalysisStub();
    init_mathService();
    init_microSgd();
    applyForensicAdjustments = async (drawName, _history, gameRegimeInfo, _skipTraining, isForensicOptimized, preloadedForensicReports, algoBreakdowns, _stdDevScore, _medianScore) => {
      const proximityScores = {};
      const missedScores = {};
      const driftScores = {};
      const dynamicWeightModifiers = {};
      const oracleDriftMap = {};
      let reports = preloadedForensicReports;
      if (!reports && isForensicOptimized) {
        try {
          reports = await getLocalForensicReports();
        } catch (e) {
          logger.warn(e, "[forensicAdjustments] \xC9chec du chargement des rapports forensiques locaux.");
        }
      }
      const recentReports = (reports || []).filter((r) => r.drawName === drawName);
      if (recentReports.length === 0) {
        logger.debug("[forensicAdjustments] Sc\xE9nario D : Rapport forensique indisponible pour ce tirage. Ajustements neutralis\xE9s.");
        return {
          recentReports: [],
          proximityScores,
          missedScores,
          driftScores,
          dynamicWeightModifiers,
          oracleDriftMap
        };
      }
      const sortedReports = [...recentReports].sort((a, b) => {
        const tA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const tB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return tB - tA;
      }).slice(0, 5);
      const entropy = gameRegimeInfo?.entropy || 0.5;
      const volatility = (gameRegimeInfo?.volatility || 50) / 100;
      const prudenceFactor = Math.exp(-(entropy + volatility));
      sortedReports.forEach((report, index) => {
        const ageDecay = Math.exp(-0.25 * index) * prudenceFactor;
        if (report.missedOpportunities) {
          report.missedOpportunities.forEach((opp) => {
            const num = opp.number;
            if (num >= 1 && num <= 90) {
              const w = opp.continuousWeight !== void 0 ? opp.continuousWeight : 0.5;
              missedScores[num] = (missedScores[num] || 0) + w * ageDecay;
              if (opp.bestAlgo) {
                const algoKey = opp.bestAlgo;
                if (!dynamicWeightModifiers[num]) dynamicWeightModifiers[num] = {};
                dynamicWeightModifiers[num][algoKey] = (dynamicWeightModifiers[num][algoKey] || 0) + 0.15 * ageDecay;
              }
            }
          });
        }
        if (report.nearMisses) {
          report.nearMisses.forEach((miss) => {
            const num = miss.actual;
            if (num >= 1 && num <= 90) {
              const distBoost = 1 / (Math.max(1, miss.distance) + Number.EPSILON);
              proximityScores[num] = (proximityScores[num] || 0) + distBoost * ageDecay;
            }
          });
        }
        if (report.algorithmicDrift) {
          report.algorithmicDrift.forEach((drift) => {
            const algo = drift.algo;
            const score = drift.driftScore || 0.1;
            const factor = drift.direction === "underestimating" ? 1 : -1;
            oracleDriftMap[algo] = (oracleDriftMap[algo] || 0) + factor * score * ageDecay;
            const breakdownNums = Object.keys(algoBreakdowns).map(Number);
            if (breakdownNums.length > 0) {
              for (const num of breakdownNums) {
                const breakdownVal = algoBreakdowns[num]?.[algo] || 0;
                if (breakdownVal > 0) {
                  driftScores[num] = (driftScores[num] || 0) + factor * score * breakdownVal * ageDecay;
                }
                if (!dynamicWeightModifiers[num]) dynamicWeightModifiers[num] = {};
                dynamicWeightModifiers[num][algo] = (dynamicWeightModifiers[num][algo] || 0) + factor * score * 0.1 * ageDecay;
              }
            }
          });
        }
      });
      return {
        recentReports: sortedReports,
        proximityScores,
        missedScores,
        driftScores,
        dynamicWeightModifiers,
        oracleDriftMap
      };
    };
    resolveForensicAdjustments = async (context, baseScores) => {
      const algoBreakdowns = {};
      baseScores.forEach((curr) => {
        algoBreakdowns[curr.num] = curr.breakdown;
      });
      const allScores = baseScores.map((s) => s.score);
      const medianScore = getMedian2(allScores);
      const stdDevScore = getStdDev2(allScores, medianScore);
      const gameRegimeInfo = detectGameRegime(context.history);
      return await applyForensicAdjustments(
        context.drawName,
        context.history,
        gameRegimeInfo,
        context.skipTraining,
        context.isForensicOptimized,
        context.preloadedForensicReports,
        algoBreakdowns,
        stdDevScore,
        medianScore
      );
    };
  }
});

// services/prediction/predictionScenarios.ts
var HONEST_NOTE, getStoreStateSafely, handleScenarioADegradedPrediction;
var init_predictionScenarios = __esm({
  "services/prediction/predictionScenarios.ts"() {
    "use strict";
    init_loggerStub();
    init_supabaseClientStub();
    init_apiClientStub();
    init_microSgd();
    init_storeStub();
    HONEST_NOTE = "Indicateur interne de coh\xE9rence du moteur \u2014 ne refl\xE8te PAS une probabilit\xE9 de gain.";
    getStoreStateSafely = () => {
      if (typeof window !== "undefined") {
        try {
          const state = useNexusStore.getState();
          if (state) {
            return {
              useSpatioTemporalHawkes: state.useSpatioTemporalHawkes ?? true,
              useCloudEngine: state.useCloudEngine ?? false
            };
          }
        } catch {
        }
      }
      return { useSpatioTemporalHawkes: true, useCloudEngine: false };
    };
    handleScenarioADegradedPrediction = (context) => {
      logger.warn(
        { drawName: context.drawName, len: context.history.length },
        "[predictionScenarios] Scenario A : Dataset insuffisant pour une inf\xE9rence complexe. Mode d\xE9grad\xE9 statistique utile."
      );
      context.onProgress?.(100, "Dataset insuffisant. G\xE9n\xE9ration d'une pr\xE9diction bas\xE9e sur les fr\xE9quences empiriques.");
      const freqMap = {};
      for (const d of context.history) {
        for (const num of d.gagnants || []) {
          freqMap[num] = (freqMap[num] || 0) + 1;
        }
      }
      const sortedNums = Object.keys(freqMap).map(Number).sort((a, b) => (freqMap[b] || 0) - (freqMap[a] || 0));
      let selected = [];
      if (sortedNums.length >= 5) {
        selected = sortedNums.slice(0, 5);
      } else if (context.history.length > 0 && context.history[0]?.gagnants?.length >= 5) {
        selected = context.history[0].gagnants.slice(0, 5);
      } else {
        selected = [1, 2, 3, 4, 5];
      }
      const candidatePool = sortedNums.length > 5 ? sortedNums.slice(5) : [11, 22, 33, 44, 55, 66, 77, 88, 12, 13];
      const candidates = candidatePool.filter((n) => !selected.includes(n)).slice(0, 10);
      return {
        suggestedNumbers: selected,
        candidates,
        confidence: 10,
        confidenceNote: "MOTEUR EN MODE FAIBLE PROFONDEUR - " + HONEST_NOTE,
        analysis: `Dataset insuffisant (${context.history.length} tirages utiles). Inf\xE9rence statistique empirique activ\xE9e.`,
        breakdown: {},
        timestamp: Date.now(),
        symbiosisFactor: 1,
        realityAlignment: 10,
        realityAlignmentNote: HONEST_NOTE,
        adversarialApplied: false,
        challengedNumbers: [],
        stabilityScore: 10,
        diversityMetrics: {
          meanSimilarity: 0,
          diversityScore: 100,
          penalty: 0,
          isMonoculture: false,
          pairwiseSimilarities: [],
          dominantAlgo: null
        },
        adversarialSurvivalScore: 0,
        adversarialRisks: ["Dataset insuffisant pour audit antagoniste"],
        explainabilityData: {},
        shrinkageApplied: true,
        shrinkageFactor: 1,
        hyperparameters: {
          hawkesDecay: TUNING.DEFAULT_HAWKES_DECAY,
          spatialSigma: 1.5,
          gapVelocityWeight: 1,
          bayesWindowRatio: 0.1,
          sgdLearningRate: TUNING.DEFAULT_SGD_LEARNING_RATE,
          lyapunovHorizon: 15
        },
        hyperTuningLog: ["Ajustement impossible : dataset trop court (< 12)"],
        hyperAccuracyGain: 0
      };
    };
  }
});

// services/prediction/adversarialProxy.ts
var evaluateAdversarialSurvival;
var init_adversarialProxy = __esm({
  "services/prediction/adversarialProxy.ts"() {
    "use strict";
    evaluateAdversarialSurvival = (selection, breakdownRecord, history, forensicOracleDrift = {}) => {
      return { survivalScore: 100, risks: [] };
    };
  }
});

// services/prediction/predictionFinalize.ts
var TICKET_SIZE, evaluatePredictionStability, finalizePredictionPayload;
var init_predictionFinalize = __esm({
  "services/prediction/predictionFinalize.ts"() {
    "use strict";
    init_scoringEngine();
    init_weightsManager();
    init_mathService();
    init_diversityService();
    init_adversarialProxy();
    init_microSgd();
    init_predictionScenarios();
    init_loggerStub();
    TICKET_SIZE = 5;
    evaluatePredictionStability = (baseSelection, features, weights, enhancedMetrics, history) => {
      const baseSet = new Set(baseSelection);
      const weightKeys = Object.keys(weights);
      if (weightKeys.length === 0) return 100;
      const activeKeys = weightKeys.filter((k) => (weights[k] || 0) > 1 / weightKeys.length).sort((a, b) => (weights[b] || 0) - (weights[a] || 0)).slice(0, 3);
      if (activeKeys.length === 0) return 100;
      let totalOverlap = 0;
      activeKeys.forEach((k) => {
        const perturbationFactor = 1 + 1 / weightKeys.length;
        const perturbedWeights = { ...weights };
        perturbedWeights[k] = (perturbedWeights[k] || 0) * perturbationFactor;
        const normPerturbed = normalizeWeights(perturbedWeights, { bypassCap: true });
        const perturbedScores = calculateScores(features, normPerturbed, enhancedMetrics, history);
        const sortedPerturbed = perturbedScores.sort((a, b) => b.score - a.score);
        const perturbedSelection = sortedPerturbed.slice(0, TICKET_SIZE).map((s) => s.num);
        const overlap = perturbedSelection.filter((n) => baseSet.has(n)).length;
        totalOverlap += overlap / TICKET_SIZE;
      });
      return Math.round(totalOverlap / activeKeys.length * 100);
    };
    finalizePredictionPayload = async (context, denoisedScores, selection, candidates, weights, enhancedMetrics, features, shrinkageApplied, shrinkageFactor) => {
      const sortedScores = [...denoisedScores].sort((a, b) => b.score - a.score);
      let averageScore = sortedScores.slice(0, TICKET_SIZE).reduce((a, b) => a + (b.score || 0), 0) / TICKET_SIZE;
      if (isNaN(averageScore) || averageScore <= 0) averageScore = 45;
      const currentEntropyResult = calculateShannonEntropy2(context.history);
      const currentEntropy = currentEntropyResult.normalized;
      const calibratedParams = await getCalibratedHyperparameters(context.drawName, currentEntropy);
      const plattA = calibratedParams.sigmoid_slope;
      const plattB = calibratedParams.sigmoid_intercept;
      const rawX = (averageScore - 50) / 15;
      const plattCalibratedProbability = 1 / (1 + Math.exp(-(plattA * rawX + plattB)));
      let calibratedConfidence = plattCalibratedProbability * 100 * calibratedParams.boosting_multiplier;
      if (shrinkageApplied) {
        calibratedConfidence *= shrinkageFactor;
      }
      const finalConfidence = Math.round(Math.max(1, Math.min(99, calibratedConfidence)));
      let analysisText = "";
      if (context.adversarialMode) {
        analysisText = `Pr\xE9diction Oracle Base filtr\xE9e par le Protocole Adversarial Anti-Consensus.`;
      } else if (calibratedParams.prudence_mode_active) {
        analysisText = `Mode Prudence activ\xE9 : D\xE9rive de performance d\xE9tect\xE9e lors de l'autopsie post-mortem. Algorithme calibr\xE9 de fa\xE7on ultra-prudente.`;
      } else if (shrinkageApplied) {
        analysisText = `Pr\xE9diction g\xE9n\xE9r\xE9e sous tension algorithmique \xE9lev\xE9e. Les scores \xE9tant tr\xE8s serr\xE9s, un shrinkage a \xE9t\xE9 appliqu\xE9 pour r\xE9gulariser les probabilit\xE9s.`;
      } else {
        analysisText = `Pr\xE9diction Oracle Base g\xE9n\xE9r\xE9e \xE0 partir de l'ADN Algorithmique du moment.`;
      }
      let postMortemInsights = "";
      let latestAutopsyNotes = "";
      let strategicAdvice = "";
      try {
        const { getLocalForensicReports: getLocalForensicReports2 } = await Promise.resolve().then(() => (init_postPredictionAnalysisStub(), postPredictionAnalysisStub_exports));
        const reports = await getLocalForensicReports2() || [];
        const drawReports = reports.filter((r) => r.drawName === context.drawName);
        if (drawReports.length > 0) {
          const latestReport = drawReports[0];
          postMortemInsights = `

[R\xE9troaction & Calibrage ADN Post-Mortem] : Ajustements de Kalman appliqu\xE9s bas\xE9s sur l'autopsie du tirage du ${latestReport.date || "pr\xE9c\xE9dent"}. `;
          if (latestReport.proposedAdjustments && latestReport.proposedAdjustments.length > 0) {
            const topAdjustments = latestReport.proposedAdjustments.filter((adj) => Math.abs(adj.proposedWeightChange) > 5e-3).slice(0, 4).map((adj) => `${adj.algo} (${adj.proposedWeightChange > 0 ? "+" : ""}${(adj.proposedWeightChange * 100).toFixed(2)}%)`).join(", ");
            if (topAdjustments) {
              postMortemInsights += `Calibrages de poids : ${topAdjustments}.`;
            }
          }
          if (latestReport.recommendations && latestReport.recommendations.length > 0) {
            if (Array.isArray(latestReport.recommendations)) {
              strategicAdvice = latestReport.recommendations.join(" ");
            } else if (typeof latestReport.recommendations === "string") {
              strategicAdvice = latestReport.recommendations;
            }
          } else if (latestReport.aiAnalysis) {
            strategicAdvice = latestReport.aiAnalysis;
          }
          latestAutopsyNotes = `Divergence post-mortem pr\xE9c\xE9dente : ${latestReport.divergenceMetric || 0}%. Index d'int\xE9grit\xE9 unifi\xE9e (UFI) : ${latestReport.unifiedIntegrityIndex || 100}%.`;
        }
      } catch (err) {
        logger.warn({ err }, "Failed to inject post-mortem insights into prediction");
      }
      const stabilityScore = evaluatePredictionStability(selection, features, weights, enhancedMetrics, context.history.slice(0, context.validTemporalDepth));
      const breakdownRecord = {};
      denoisedScores.forEach((curr) => {
        breakdownRecord[curr.num] = curr.breakdown;
      });
      const diversityMetrics = calculateGeneticDiversityIndex(selection, breakdownRecord);
      const forensicOracleDrift = enhancedMetrics.proximityDiagnostic || {};
      const adversarialResult = evaluateAdversarialSurvival(selection, breakdownRecord, context.history, forensicOracleDrift);
      return {
        suggestedNumbers: selection,
        candidates,
        confidence: finalConfidence,
        confidenceNote: HONEST_NOTE,
        analysis: analysisText + postMortemInsights + (latestAutopsyNotes ? `
${latestAutopsyNotes}` : ""),
        breakdown: breakdownRecord,
        timestamp: Date.now(),
        symbiosisFactor: context.symbioticContext ? 1.5 : 1,
        realityAlignment: 82,
        realityAlignmentNote: HONEST_NOTE,
        adversarialApplied: context.adversarialMode,
        challengedNumbers: [],
        stabilityScore,
        diversityMetrics,
        adversarialSurvivalScore: adversarialResult.survivalScore,
        adversarialRisks: adversarialResult.risks,
        explainabilityData: {},
        shrinkageApplied,
        shrinkageFactor,
        shrinkageFactorMap: void 0,
        shrinkageVerification: null,
        hyperparameters: {
          hawkesDecay: TUNING.DEFAULT_HAWKES_DECAY,
          spatialSigma: 1.5,
          gapVelocityWeight: 1,
          bayesWindowRatio: 0.1,
          sgdLearningRate: TUNING.DEFAULT_SGD_LEARNING_RATE,
          lyapunovHorizon: 15,
          ...calibratedParams
        },
        hyperTuningLog: shrinkageApplied ? ["Scenario E : Activation Shrinkage pour resserrer les scores."] : [],
        hyperAccuracyGain: 0,
        aiRationale: latestAutopsyNotes || void 0,
        aiStrategicAdvice: strategicAdvice || void 0
      };
    };
  }
});

// services/prediction/predictionOrchestrator.ts
var buildPredictionRequestContext, yieldToUi, computeAdvancedMetrics, runLocalPredictionPipeline, resolvePredictionWeights, computeAdvancedMetricsBundle, extractPredictionFeatures, scorePredictionNumbers, rescoreWithAdjustments, applyPredictionDenoising, selectPredictionNumbers, generateMasterPredictionCore;
var init_predictionOrchestrator = __esm({
  "services/prediction/predictionOrchestrator.ts"() {
    "use strict";
    init_zeroCopy();
    init_weightsManager();
    init_featureExtractor();
    init_scoringEngine();
    init_combinationGenerator();
    init_ticketAnalysisService();
    init_loggerStub();
    init_workerStub();
    init_mathUtils();
    init_mathService();
    init_arrayUtils();
    init_CacheService();
    init_microSgd();
    init_forensicAdjustments();
    init_predictionScenarios();
    init_predictionFinalize();
    init_advancedMathService();
    init_hawkesEngine();
    buildPredictionRequestContext = (drawName, rawHistory, temporalDepth, weightsToUse, metrics, symbioticContext, skipTraining = false, adversarialMode = false, forcedOutsiderCount, isForensicOptimized = false, onProgress, preloadedForensicReports, useSpatioTemporalHawkesOverride, useCloudEngineOverride) => {
      const history = purifyHistoryForDraw(drawName, rawHistory);
      const contentHash = hashHistoryContent(history);
      const validTemporalDepth = Math.max(5, Math.min(temporalDepth, history.length));
      const storeDefaults = getStoreStateSafely();
      const useSpatioTemporalHawkes = useSpatioTemporalHawkesOverride ?? storeDefaults.useSpatioTemporalHawkes;
      const useCloudEngine = useCloudEngineOverride ?? storeDefaults.useCloudEngine;
      return {
        drawName,
        rawHistory,
        history,
        temporalDepth,
        validTemporalDepth,
        weightsToUse,
        metrics,
        symbioticContext,
        skipTraining,
        adversarialMode,
        forcedOutsiderCount,
        isForensicOptimized,
        useSpatioTemporalHawkes,
        useCloudEngine,
        onProgress,
        preloadedForensicReports,
        contentHash
      };
    };
    yieldToUi = async () => {
      if (typeof window !== "undefined") {
        await new Promise((r) => setTimeout(r, 0));
      }
    };
    computeAdvancedMetrics = async (localHistoryContext, drawName, hyperparameters, useSpatioTemporalHawkes, metrics) => {
      const contentHash = hashHistoryContent(localHistoryContext);
      const cacheKey = globalCache.generateKey(
        "adv_metrics",
        drawName,
        `${localHistoryContext.length}_${contentHash}_${useSpatioTemporalHawkes ? 1 : 0}_${hyperparameters.bayesWindowRatio || "def"}`
      );
      return globalCache.getOrCompute(
        cacheKey,
        async () => {
          const poissonScores = calculatePoissonScores(localHistoryContext);
          await yieldToUi();
          const bayesScores = calculateBayesianScore(localHistoryContext, hyperparameters.bayesWindowRatio);
          await yieldToUi();
          const temporalScores = calculateTemporalScores(localHistoryContext);
          await yieldToUi();
          const digitalRootScores = calculateDigitalRootAnalysis(localHistoryContext);
          await yieldToUi();
          const resistanceScores = calculateResistanceScores(localHistoryContext);
          await yieldToUi();
          const gapVelocityScores = calculateGapVelocityScores(localHistoryContext);
          await yieldToUi();
          const leaderSuccessionScores = calculateLeaderSuccession(localHistoryContext);
          await yieldToUi();
          const aiIntuitionScores = calculateAiIntuition(localHistoryContext, metrics || {});
          await yieldToUi();
          const fractalResonanceScores = calculateFractalResonance(localHistoryContext);
          await yieldToUi();
          const spatialHotSpots = calculateSpatialHotSpots(localHistoryContext, 0.5, hyperparameters.spatialSigma);
          await yieldToUi();
          const symbioticClusterScores = calculateCoOccurrenceScores(localHistoryContext);
          await yieldToUi();
          const anomalyScores = calculateAnomalyScores(localHistoryContext);
          await yieldToUi();
          const hawkesExcitationScores = useSpatioTemporalHawkes ? calculateSpatioTemporalHawkes(localHistoryContext, drawName) : calculateHawkesExcitation(localHistoryContext);
          await yieldToUi();
          const topologicalLyapunovScores = calculateTopologicalLyapunov(localHistoryContext, hyperparameters.lyapunovHorizon);
          await yieldToUi();
          for (const k in gapVelocityScores) {
            gapVelocityScores[k] *= hyperparameters.gapVelocityWeight || 1;
          }
          for (const k in hawkesExcitationScores) {
            hawkesExcitationScores[k] *= (hyperparameters.hawkesDecay || TUNING.DEFAULT_HAWKES_DECAY) / TUNING.DEFAULT_HAWKES_DECAY;
          }
          return {
            ...metrics,
            poisson: poissonScores,
            bayes: bayesScores,
            temporal: temporalScores,
            digitalRoot: digitalRootScores,
            resistance: resistanceScores,
            gapVelocity: gapVelocityScores,
            leaderSuccession: leaderSuccessionScores,
            aiIntuition: aiIntuitionScores,
            fractalResonance: fractalResonanceScores,
            spatial: spatialHotSpots,
            symbioticClusters: symbioticClusterScores,
            anomaly: anomalyScores,
            hawkesExcitation: hawkesExcitationScores,
            topologicalLyapunov: topologicalLyapunovScores
          };
        },
        CACHE_TTL.LONG
      );
    };
    runLocalPredictionPipeline = async (context) => {
      context.onProgress?.(5, "Initialisation de l'ADN algorithmique...");
      initializeLcgForDraw(context.drawName);
      await yieldToUi();
      context.onProgress?.(10, "Optimisation des hyperparam\xE8tres...");
      const weights = await resolvePredictionWeights(context);
      await yieldToUi();
      context.onProgress?.(30, "Calcul des m\xE9triques avanc\xE9es...");
      const advancedMetrics = await computeAdvancedMetricsBundle(context);
      await yieldToUi();
      context.onProgress?.(50, "Extraction des descripteurs de caract\xE9ristiques...");
      const features = await extractPredictionFeatures(context);
      await yieldToUi();
      context.onProgress?.(70, "\xC9valuation et scoring des num\xE9ros...");
      const baseScores = scorePredictionNumbers(context, features, weights, advancedMetrics);
      await yieldToUi();
      context.onProgress?.(80, "R\xE9solution des ajustements forensiques...");
      const forensicAdjustments = await resolveForensicAdjustments(context, baseScores);
      await yieldToUi();
      context.onProgress?.(85, "Double Aveugle : Alignement avec les rapports d'autopsie...");
      const { rescored, enhancedMetrics } = rescoreWithAdjustments(context, features, weights, advancedMetrics, forensicAdjustments);
      await yieldToUi();
      context.onProgress?.(90, "D\xE9sensibilisation au bruit (PCA)...");
      const denoised = await applyPredictionDenoising(context, rescored, weights, enhancedMetrics);
      await yieldToUi();
      context.onProgress?.(95, "Formulation finale et s\xE9lection des combinaisons...");
      const { selection, candidates, shrinkageApplied, shrinkageFactor } = await selectPredictionNumbers(context, denoised, features);
      await yieldToUi();
      context.onProgress?.(100, "Convergence de l'ADN algorithmique atteinte !");
      return await finalizePredictionPayload(context, denoised, selection, candidates, weights, enhancedMetrics, features, shrinkageApplied, shrinkageFactor);
    };
    resolvePredictionWeights = async (context) => {
      let weights = normalizeWeights(context.weightsToUse || await getAlgoWeights(context.drawName));
      if (!context.skipTraining) {
        try {
          const { applyMetaLearning: applyMetaLearning2 } = await Promise.resolve().then(() => (init_weightsManager(), weightsManager_exports));
          weights = await applyMetaLearning2(weights, context.history, context.drawName);
        } catch (err) {
          logger.warn({ err }, "\xC9chec de l'int\xE9gration du calibrage de Kalman post-mortem.");
        }
      }
      if (!context.skipTraining && context.history.length >= 10) {
        const currentEntropyResult = calculateShannonEntropy2(context.history);
        const currentEntropy = currentEntropyResult.normalized;
        weights = await applyDeterministicMicroSgd(
          context.drawName,
          weights,
          context.history,
          currentEntropy,
          void 0,
          context.useSpatioTemporalHawkes
        );
      }
      return weights;
    };
    computeAdvancedMetricsBundle = async (context) => {
      return await computeAdvancedMetrics(
        context.history.slice(0, context.validTemporalDepth),
        context.drawName,
        { hawkesDecay: TUNING.DEFAULT_HAWKES_DECAY, gapVelocityWeight: 1 },
        context.useSpatioTemporalHawkes,
        context.metrics
      );
    };
    extractPredictionFeatures = async (context) => {
      return await extractFeatures(
        context.drawName,
        context.history.slice(0, context.validTemporalDepth),
        context.validTemporalDepth
      );
    };
    scorePredictionNumbers = (context, features, weights, advancedMetrics) => {
      return calculateScores(
        features,
        weights,
        advancedMetrics,
        context.history.slice(0, context.validTemporalDepth)
      );
    };
    rescoreWithAdjustments = (context, features, weights, advancedMetrics, forensicAdjustments) => {
      const enhancedMetrics = {
        ...advancedMetrics,
        proximityDiagnostic: forensicAdjustments.proximityScores,
        missedModulator: forensicAdjustments.missedScores,
        driftCorrection: forensicAdjustments.driftScores,
        symbioticClusters: {},
        entropyRegime: {},
        anomalyDetection: advancedMetrics.anomaly || {},
        symbioticContext: context.symbioticContext,
        dynamicWeightModifiers: forensicAdjustments.dynamicWeightModifiers
      };
      const rescored = calculateScores(
        features,
        weights,
        enhancedMetrics,
        context.history.slice(0, context.validTemporalDepth)
      );
      return { rescored, enhancedMetrics };
    };
    applyPredictionDenoising = async (_context, rescored, weights, enhancedMetrics) => {
      return await applyPCADenoising(rescored, weights, enhancedMetrics);
    };
    selectPredictionNumbers = async (context, denoisedScores, features) => {
      const sortedScores = [...denoisedScores].sort((a, b) => b.score - a.score);
      const top10Scores = sortedScores.slice(0, 10).map((s) => s.score);
      const gap = top10Scores[0] - top10Scores[9];
      let shrinkageApplied = false;
      let shrinkageFactor = 1;
      if (gap < 8) {
        shrinkageApplied = true;
        shrinkageFactor = Math.max(0.7, 0.7 + 0.3 * (gap / 8));
        logger.info(
          { gap, shrinkageFactor },
          "[predictionOrchestrator] Scenario E : Instabilit\xE9 des scores d\xE9tect\xE9e. Application d'un shrinkage continu."
        );
        sortedScores.forEach((s) => {
          s.score = s.score * shrinkageFactor;
        });
      }
      const outsiderCount = context.forcedOutsiderCount !== void 0 ? context.forcedOutsiderCount : 2;
      const empiricalCalibration = generateEmpiricalCalibration(context.history);
      const gameRegimeInfo = detectGameRegime(context.history);
      const regimeStateNormalized = Math.max(0, Math.min(
        1,
        (gameRegimeInfo.volatility / 100 + gameRegimeInfo.entropy) / 2
      ));
      const selection = await generateCombination(
        sortedScores,
        features.affinityMap,
        empiricalCalibration,
        outsiderCount,
        context.history[0]?.gagnants,
        regimeStateNormalized
      );
      const maxCandidates = shrinkageApplied || context.adversarialMode ? 15 : 10;
      const candidates = sortedScores.slice(5, 5 + maxCandidates).map((s) => s.num).filter((n) => !selection.includes(n)).slice(0, 10);
      return {
        selection,
        candidates,
        shrinkageApplied,
        shrinkageFactor
      };
    };
    generateMasterPredictionCore = async (drawName, history, temporalDepth, weightsToUse, metrics, symbioticContext, skipTraining = false, adversarialMode = false, forcedOutsiderCount, isForensicOptimized = false, useSpatioTemporalHawkes = true, onProgress, preloadedForensicReports) => {
      const context = buildPredictionRequestContext(
        drawName,
        history,
        temporalDepth,
        weightsToUse,
        metrics,
        symbioticContext,
        skipTraining,
        adversarialMode,
        forcedOutsiderCount,
        isForensicOptimized,
        onProgress,
        preloadedForensicReports
      );
      context.useSpatioTemporalHawkes = useSpatioTemporalHawkes;
      if (context.history.length < 12) {
        return handleScenarioADegradedPrediction(context);
      }
      return await runLocalPredictionPipeline(context);
    };
  }
});

// services/prediction/denoEntry.ts
init_predictionOrchestrator();
async function predict(drawName, history, weights, symbioticContext, metrics, preloadedForensicReports) {
  const temporalDepth = 100;
  return await generateMasterPredictionCore(
    drawName,
    history,
    temporalDepth,
    weights,
    metrics,
    symbioticContext,
    false,
    // skipTraining
    false,
    // adversarialMode
    void 0,
    // forcedOutsiderCount
    true,
    // isForensicOptimized
    true,
    // useSpatioTemporalHawkes
    void 0,
    // onProgress
    preloadedForensicReports
  );
}
export {
  predict
};
