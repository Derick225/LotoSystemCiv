import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useNexusStore } from "../../store/useNexusStore";
import { generateMasterPrediction } from "../../services/prediction/predictionFacade";
import { Prediction, AlgoWeights } from "../../types";
import { AlgoKey } from "../../shared/prediction.types";
import { NumberBall } from "../NumberBall";
import {
  Sliders,
  Save,
  Cpu,
  ShieldAlert,
  BarChart2,
  Network,
  Zap,
  GitMerge,
  Activity,
  Sparkles,
  RefreshCw,
  AlertTriangle,
  Layers,
  Search,
  Compass,
} from "lucide-react";
import { debounce } from "lodash";
import { useToast } from "../ui/Toast";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  CartesianGrid,
  LineChart,
  Line,
  AreaChart,
  Area,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
} from "recharts";
import { audioEngine } from "../../utils/audioEngine";
import { useAlgorithmSync } from "../../hooks/useAlgorithmSync";
import {
  computeFullJacobianMatrix,
  computeKLDivergence,
  normalizeGridToSimplex,
  interpolateScenarios,
  findInverseWhatIfWeights,
  detectBifurcationPoints,
  runMonteCarloStressTest,
  computeHessianCoupling,
  generateFitnessLandscape,
  InverseWhatIfResult,
  BifurcationPoint,
  MonteCarloStressResult,
  FitnessLandscapePoint,
} from "../../services/simulation/whatIfEngine";

const ALGO_SEQUENCE: AlgoKey[] = [
  AlgoKey.FREQUENCY,
  AlgoKey.MARKOV,
  AlgoKey.BAYES,
  AlgoKey.GAPS,
  AlgoKey.MOMENTUM,
  AlgoKey.GAP_SEQUENCE,
  AlgoKey.GAP_PATTERN,
  AlgoKey.SEQUENCE_PATTERN,
  AlgoKey.GAP_CADENCE,
  AlgoKey.GAP_TREND,
  AlgoKey.INTER_MONTHLY_RESONANCE,
  AlgoKey.SPECTRAL,
  AlgoKey.FRACTAL,
  AlgoKey.TEMPORAL,
  AlgoKey.SHADOW_PROBABILITY,
  AlgoKey.SPATIAL,
  AlgoKey.AFFINITY,
  AlgoKey.NETWORK_CORRELATION,
  AlgoKey.ECHO_STATE,
  AlgoKey.DERIVED_NEIGHBOR,
];

const solveBezierY = (x: number, px1: number, py1: number, px2: number, py2: number): number => {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  let lower = 0;
  let upper = 1;
  let u = 0.5;
  for (let i = 0; i < 16; i++) {
    const cx = 3 * u * (1 - u) * (1 - u) * px1 + 3 * u * u * (1 - u) * px2 + u * u * u;
    if (Math.abs(cx - x) < 0.001) break;
    if (cx < x) {
      lower = u;
    } else {
      upper = u;
    }
    u = (lower + upper) / 2;
  }
  return 3 * u * (1 - u) * (1 - u) * py1 + 3 * u * u * (1 - u) * py2 + u * u * u;
};

const applyBezierToWeights = (base: AlgoWeights, px1: number, py1: number, px2: number, py2: number): AlgoWeights => {
  const modulated: Record<string, number> = {};
  
  ALGO_SEQUENCE.forEach((key, idx) => {
    const t = idx / Math.max(1, ALGO_SEQUENCE.length - 1);
    const bezierFactor = solveBezierY(t, px1, py1, px2, py2);
    modulated[key] = (base[key] || 0.05) * (0.1 + 1.9 * bezierFactor);
  });
  
  const sum = Object.values(modulated).reduce((a, b) => a + b, 0) || 1;
  const normalized: Record<string, number> = {};
  ALGO_SEQUENCE.forEach(k => {
    normalized[k] = parseFloat((modulated[k] / sum).toFixed(4));
  });
  return normalized as AlgoWeights;
};

export const WhatIfSimulatorTab: React.FC<{ drawName: string }> = ({
  drawName,
}) => {
  const history = useNexusStore((state) => state.history);
  const { weights: globalWeights, labels: LABELS } = useAlgorithmSync();
  const temporalDepth = useNexusStore((state) => state.temporalDepth);

  const [customWeights, setCustomWeights] =
    useState<AlgoWeights>(globalWeights);
  const [basePrediction, setBasePrediction] = useState<Prediction | null>(null);
  const [simPrediction, setSimPrediction] = useState<Prediction | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const { showToast } = useToast();

  // Scenarios & Morphing
  const [scenarios, setScenarios] = useState<Record<string, AlgoWeights>>({});
  const [scenarioAKey, setScenarioAKey] = useState<string>("Stable");
  const [scenarioBKey, setScenarioBKey] = useState<string>("Chaotique");
  const [morphAlpha, setMorphAlpha] = useState<number>(0.0);

  // Advanced Math Metrics States
  const [jacobianSensitivities, setJacobianSensitivities] = useState<
    Array<{ name: string; sensitivity: number }>
  >([]);
  const [klDivergence, setKlDivergence] = useState<number>(0.0);
  const [bifurcations, setBifurcations] = useState<BifurcationPoint[]>([]);

  // Inverse What-If State
  const [inverseTargetBall, setInverseTargetBall] = useState<number>(77);
  const [inverseResult, setInverseResult] =
    useState<InverseWhatIfResult | null>(null);
  const [isCalculatingInverse, setIsCalculatingInverse] =
    useState<boolean>(false);

  // Monte Carlo Stress Test
  const [mcResults, setMcResults] = useState<MonteCarloStressResult[]>([]);
  const [isMonteCarloRunning, setIsMonteCarloRunning] =
    useState<boolean>(false);

  // 2nd Order Hessian Coupling State
  const [hessianAlgoA, setHessianAlgoA] = useState<AlgoKey>(AlgoKey.GAP_TREND);
  const [hessianAlgoB, setHessianAlgoB] = useState<AlgoKey>(AlgoKey.MARKOV);
  const [hessianCouplingVal, setHessianCouplingVal] = useState<number>(0);

  // Fitness Landscape State
  const [landscapePoints, setLandscapePoints] = useState<
    FitnessLandscapePoint[]
  >([]);

  // Bezier Modulator States
  const [bezierCP, setBezierCP] = useState({ x1: 0.35, y1: 0.15, x2: 0.65, y2: 0.85 });
  const [activePreset, setActivePreset] = useState<string>("linear");
  const [isDraggingCP, setIsDraggingCP] = useState<1 | 2 | null>(null);

  // Mini-Backtest Metrics State
  const [baselineEfficiency, setBaselineEfficiency] = useState<number>(0);
  const [currentEfficiency, setCurrentEfficiency] = useState<number>(0);
  const [partialDerivatives, setPartialDerivatives] = useState<
    Array<{ name: string; key: AlgoKey; value: number }>
  >([]);

  useEffect(() => {
    setCustomWeights(globalWeights);
  }, [globalWeights]);

  // Initial Base Prediction
  useEffect(() => {
    let isMounted = true;
    const loadBase = async () => {
      try {
        const base = await generateMasterPrediction(
          drawName,
          history,
          temporalDepth,
          globalWeights,
          undefined,
          undefined,
          true,
        );
        if (isMounted) {
          setBasePrediction(base);
          setSimPrediction(base);
        }
      } catch (err) {
        console.error("Error loading base prediction:", err);
      }
    };
    loadBase();
    return () => {
      isMounted = false;
    };
  }, [drawName, history, temporalDepth, globalWeights]);

  // Function to evaluate grid scores for arbitrary weights based on a specific history slice
  const evalGridScoresForHistory = useCallback(
    (w: AlgoWeights, histSlice: typeof history): number[] => {
      const scores = new Array(90).fill(0);
      const keys = Object.keys(w) as AlgoKey[];

      const freqMap = new Array(91).fill(0);
      const lastSeen = new Array(91).fill(histSlice.length);
      const totalDraws = Math.max(1, histSlice.length);

      histSlice.forEach((d, idx) => {
        if (Array.isArray(d.gagnants)) {
          d.gagnants.forEach((n) => {
            if (n >= 1 && n <= 90) {
              freqMap[n]++;
              if (idx < lastSeen[n]) lastSeen[n] = idx;
            }
          });
        }
      });

      for (let num = 1; num <= 90; num++) {
        let s = 0;
        const freqRatio = freqMap[num] / totalDraws;
        const gapDecay = Math.exp(-0.05 * lastSeen[num]);
        const spectralVal = Math.abs(Math.sin(num * 0.1 + freqRatio * 3.14));

        keys.forEach((k) => {
          const weightVal = w[k] || 0.05;
          let featVal = 0.5;
          if (k === "frequency") featVal = freqRatio * 5;
          else if (k === "gap") featVal = gapDecay;
          else if (k === "spectral") featVal = spectralVal;
          else if (k === "bayes")
            featVal = freqRatio * (1.0 / (1.0 + Math.abs(lastSeen[num] - 10)));
          else if (k === "momentum") featVal = Math.exp(-0.1 * lastSeen[num]);
          else featVal = 0.5;

          s += weightVal * (featVal * 100);
        });
        scores[num - 1] = Math.max(1.0, s);
      }
      return scores;
    },
    [],
  );

  const evalGridScores = useCallback(
    (w: AlgoWeights): number[] => {
      return evalGridScoresForHistory(w, history);
    },
    [history, evalGridScoresForHistory]
  );

  // Main Simulation Handler
  const runSimulation = async (weights: AlgoWeights) => {
    setIsSimulating(true);
    try {
      const pred = await generateMasterPrediction(
        drawName,
        history,
        temporalDepth,
        weights,
        undefined,
        undefined,
        true,
      );
      setSimPrediction(pred);

      // 1. Compute Full Jacobian Matrix (Central Differences)
      const evalProbabilities = (w: AlgoWeights) =>
        normalizeGridToSimplex(evalGridScores(w));
      const { algoSensitivities } = computeFullJacobianMatrix(
        weights,
        evalProbabilities,
        0.02,
      );

      const formattedSensitivities = algoSensitivities.slice(0, 6).map((s) => ({
        name: LABELS[s.key] || s.key,
        sensitivity: s.sensitivity,
      }));
      setJacobianSensitivities(formattedSensitivities);

      // 2. Compute KL Divergence (Stability)
      if (basePrediction) {
        const pBase = normalizeGridToSimplex(evalGridScores(globalWeights));
        const pSim = normalizeGridToSimplex(evalGridScores(weights));
        const kl = computeKLDivergence(pBase, pSim);
        setKlDivergence(kl);
      }

      // 3. Detect Bifurcation Points (Catastrophe Theory)
      const evalTopCandidates = (w: AlgoWeights) => {
        const sc = evalGridScores(w);
        const indexed = sc.map((val, idx) => ({ ball: idx + 1, val }));
        indexed.sort((a, b) => b.val - a.val);
        return indexed.map((x) => x.ball);
      };
      const bifurcs = detectBifurcationPoints(weights, evalTopCandidates, 0.03);
      setBifurcations(bifurcs);

      // 4. Compute 2nd Order Hessian Coupling
      const evalTop1Score = (w: AlgoWeights) => {
        const sc = evalGridScores(w);
        return Math.max(...sc);
      };
      const hessVal = computeHessianCoupling(
        weights,
        hessianAlgoA,
        hessianAlgoB,
        evalTop1Score,
        0.03,
      );
      setHessianCouplingVal(hessVal);
    } catch (error) {
      console.error("Simulation error:", error);
      showToast("Erreur lors de la simulation", "error");
    } finally {
      setIsSimulating(false);
    }
  };

  const debouncedRunSimulation = useMemo(
    () => debounce((w: AlgoWeights) => runSimulation(w), 250),
    [
      drawName,
      history,
      temporalDepth,
      basePrediction,
      hessianAlgoA,
      hessianAlgoB,
    ],
  );

  // Mini-Backtest over the last 15 draws
  const runMiniBacktest = useCallback(
    (w: AlgoWeights): number => {
      if (history.length < 5) return 0;
      const N = Math.min(15, history.length - 1);
      let successSum = 0;
      let count = 0;

      for (let d = 0; d < N; d++) {
        const targetDraw = history[d];
        const histSlice = history.slice(d + 1);
        if (histSlice.length < 5) continue;

        const rawScores = evalGridScoresForHistory(w, histSlice);
        
        const indexed = rawScores.map((score, idx) => ({ ball: idx + 1, score }));
        indexed.sort((a, b) => b.score - a.score);
        const top10 = indexed.slice(0, 10).map((x) => x.ball);

        if (Array.isArray(targetDraw.gagnants)) {
          const hits = targetDraw.gagnants.filter((num) => top10.includes(num)).length;
          successSum += hits / targetDraw.gagnants.length;
          count++;
        }
      }
      return count > 0 ? (successSum / count) * 100 : 0;
    },
    [history, evalGridScoresForHistory]
  );

  // Dragging event listeners effect for the Bezier Editor
  useEffect(() => {
    if (isDraggingCP === null) return;

    const handleWindowMouseMove = (e: MouseEvent) => {
      const svgEl = document.getElementById("bezier-svg");
      if (!svgEl) return;
      const rect = svgEl.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height));

      setBezierCP(prev => {
        const updated = { ...prev };
        if (isDraggingCP === 1) {
          updated.x1 = parseFloat(x.toFixed(3));
          updated.y1 = parseFloat(y.toFixed(3));
        } else {
          updated.x2 = parseFloat(x.toFixed(3));
          updated.y2 = parseFloat(y.toFixed(3));
        }
        
        const modulated = applyBezierToWeights(globalWeights, updated.x1, updated.y1, updated.x2, updated.y2);
        setCustomWeights(modulated);
        debouncedRunSimulation(modulated);
        return updated;
      });
      setActivePreset("custom");
    };

    const handleWindowMouseUp = () => {
      setIsDraggingCP(null);
    };

    window.addEventListener("mousemove", handleWindowMouseMove);
    window.addEventListener("mouseup", handleWindowMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleWindowMouseMove);
      window.removeEventListener("mouseup", handleWindowMouseUp);
    };
  }, [isDraggingCP, globalWeights, debouncedRunSimulation]);

  useEffect(() => {
    if (isDraggingCP === null) return;

    const handleWindowTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 0) return;
      const svgEl = document.getElementById("bezier-svg");
      if (!svgEl) return;
      const rect = svgEl.getBoundingClientRect();
      const touch = e.touches[0];
      const x = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, 1 - (touch.clientY - rect.top) / rect.height));

      setBezierCP(prev => {
        const updated = { ...prev };
        if (isDraggingCP === 1) {
          updated.x1 = parseFloat(x.toFixed(3));
          updated.y1 = parseFloat(y.toFixed(3));
        } else {
          updated.x2 = parseFloat(x.toFixed(3));
          updated.y2 = parseFloat(y.toFixed(3));
        }
        
        const modulated = applyBezierToWeights(globalWeights, updated.x1, updated.y1, updated.x2, updated.y2);
        setCustomWeights(modulated);
        debouncedRunSimulation(modulated);
        return updated;
      });
      setActivePreset("custom");
    };

    const handleWindowTouchEnd = () => {
      setIsDraggingCP(null);
    };

    window.addEventListener("touchmove", handleWindowTouchMove, { passive: false });
    window.addEventListener("touchend", handleWindowTouchEnd);
    return () => {
      window.removeEventListener("touchmove", handleWindowTouchMove);
      window.removeEventListener("touchend", handleWindowTouchEnd);
    };
  }, [isDraggingCP, globalWeights, debouncedRunSimulation]);

  // Compute baseline mini-backtest efficiency
  useEffect(() => {
    if (history.length >= 5) {
      const baseEff = runMiniBacktest(globalWeights);
      setBaselineEfficiency(parseFloat(baseEff.toFixed(1)));
    }
  }, [history, globalWeights, runMiniBacktest]);

  // Compute current efficiency and partial derivatives
  useEffect(() => {
    if (history.length >= 5) {
      const curEff = runMiniBacktest(customWeights);
      setCurrentEfficiency(parseFloat(curEff.toFixed(1)));

      const coreAlgos = [AlgoKey.FREQUENCY, AlgoKey.GAPS, AlgoKey.SPECTRAL, AlgoKey.MARKOV];
      const eps = 0.05;

      const derivs = coreAlgos.map((key) => {
        const perturbedWeights = { ...customWeights, [key]: (customWeights[key] || 0) + eps };
        const sum = Object.values(perturbedWeights).reduce((a, b) => a + b, 0) || 1;
        const normalizedPerturbed: Record<string, number> = {};
        Object.keys(perturbedWeights).forEach((k) => {
          normalizedPerturbed[k] = (perturbedWeights[k as AlgoKey] || 0) / sum;
        });

        const perturbedEff = runMiniBacktest(normalizedPerturbed as AlgoWeights);
        const deriv = (perturbedEff - curEff) / eps;

        return {
          name: LABELS[key] || key,
          key,
          value: parseFloat(deriv.toFixed(2)),
        };
      });

      setPartialDerivatives(derivs);
    }
  }, [history, customWeights, runMiniBacktest, LABELS]);

  // Bezier preset application helper
  const applyPreset = (presetName: string) => {
    setActivePreset(presetName);
    let cp = { x1: 0.35, y1: 0.15, x2: 0.65, y2: 0.85 };
    if (presetName === "linear") {
      cp = { x1: 0.25, y1: 0.25, x2: 0.75, y2: 0.75 };
    } else if (presetName === "ease-in-out") {
      cp = { x1: 0.42, y1: 0.0, x2: 0.58, y2: 1.0 };
    } else if (presetName === "low-boost") {
      cp = { x1: 0.05, y1: 0.95, x2: 0.15, y2: 0.95 };
    } else if (presetName === "high-boost") {
      cp = { x1: 0.85, y1: 0.05, x2: 0.95, y2: 0.05 };
    }
    setBezierCP(cp);
    const modulated = applyBezierToWeights(globalWeights, cp.x1, cp.y1, cp.x2, cp.y2);
    setCustomWeights(modulated);
    debouncedRunSimulation(modulated);
  };

  const handleWeightChange = (key: string, value: number) => {
    const newWeights = { ...customWeights, [key]: value };
    setCustomWeights(newWeights);
    debouncedRunSimulation(newWeights);
  };

  // Scenario Management & Morphing
  const handleSaveScenario = (name: string) => {
    if (!name) return;
    setScenarios((prev) => ({ ...prev, [name]: customWeights }));
    showToast(`Scénario "${name}" sauvegardé avec succès`, "success");
    audioEngine.play("success");
  };

  const handleMorphChange = (newAlpha: number) => {
    setMorphAlpha(newAlpha);
    const wA = scenarios[scenarioAKey] || globalWeights;
    const wB = scenarios[scenarioBKey] || globalWeights;
    const interpolated = interpolateScenarios(wA, wB, newAlpha);
    setCustomWeights(interpolated);
    debouncedRunSimulation(interpolated);
  };

  // Inverse What-If Solver Trigger
  const handleRunInverseWhatIf = () => {
    setIsCalculatingInverse(true);
    audioEngine.play("click");

    setTimeout(() => {
      const result = findInverseWhatIfWeights(
        inverseTargetBall,
        customWeights,
        evalGridScores,
        40,
      );
      setInverseResult(result);
      setIsCalculatingInverse(false);
      showToast(
        `Inverse What-If résolu pour N°${inverseTargetBall} (Rang atteint : #${result.achievableRank})`,
        "success",
      );
      audioEngine.play("success");
    }, 300);
  };

  // Apply Inverse Weights
  const handleApplyInverseWeights = () => {
    if (!inverseResult) return;
    setCustomWeights(inverseResult.optimalWeights);
    runSimulation(inverseResult.optimalWeights);
    showToast(
      `Poids optimaux appliqués pour le N°${inverseTargetBall}`,
      "info",
    );
  };

  // Monte Carlo Stress Test Trigger
  const handleRunMonteCarlo = () => {
    setIsMonteCarloRunning(true);
    audioEngine.play("click");

    setTimeout(() => {
      const results = runMonteCarloStressTest(
        customWeights,
        evalGridScores,
        120,
        0.05,
      );
      setMcResults(results);
      setIsMonteCarloRunning(false);
      showToast(
        "Test de stress Monte Carlo achevé (120 itérations stochastiques)",
        "success",
      );
      audioEngine.play("success");
    }, 400);
  };

  // Generate Fitness Landscape Grid
  const handleGenerateLandscape = () => {
    const evalTop5Score = (w: AlgoWeights) => {
      const sc = evalGridScores(w);
      sc.sort((a, b) => b - a);
      return sc.slice(0, 5).reduce((a, b) => a + b, 0);
    };
    const pts = generateFitnessLandscape(
      customWeights,
      hessianAlgoA,
      hessianAlgoB,
      evalTop5Score,
      5,
    );
    setLandscapePoints(pts);
    showToast("Surface de Fitness 3D générée", "info");
  };

  const candidates = simPrediction?.candidates || [];
  const suggested = simPrediction?.suggestedNumbers || [];

  const chartData = useMemo(() => {
    if (!simPrediction) return [];
    return simPrediction.candidates.slice(0, 10).map((num, i) => ({
      num,
      score: 100 - i * 5,
    }));
  }, [simPrediction]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 md:p-6 animate-fade-in text-slate-100">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-900/90 border border-slate-800 p-5 rounded-3xl backdrop-blur-md shadow-2xl">
        <div>
          <h2 className="text-xl md:text-2xl font-black text-white flex items-center gap-3">
            <Sliders className="text-indigo-400 size-6" />
            Simulateur What-If Continu & Analyse Contrefactuelle
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Inférence différentiable continue, Dérivées Jacobiennes,
            Interpolation de Scénarios & Recherche Inversée
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => handleSaveScenario("Stable")}
            className="px-3.5 py-2 text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-xl hover:bg-emerald-500/30 flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <Save size={14} /> Sauver Scenario A (Stable)
          </button>
          <button
            onClick={() => handleSaveScenario("Chaotique")}
            className="px-3.5 py-2 text-xs font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded-xl hover:bg-rose-500/30 flex items-center gap-1.5 transition-all cursor-pointer"
          >
            <Save size={14} /> Sauver Scenario B (Chaotique)
          </button>
        </div>
      </div>

      {/* Scenario Morphing Slider (Continuous Interpolation) */}
      <div className="bg-slate-900/80 border border-indigo-500/30 p-5 rounded-3xl shadow-xl space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-black text-indigo-400 uppercase tracking-widest flex items-center gap-2">
            <GitMerge size={16} /> Moteur Morphing de Scénarios (Interpolation
            α)
          </span>
          <span className="font-mono text-emerald-400 font-bold bg-emerald-950 px-2.5 py-1 rounded-lg border border-emerald-800">
            α = {(morphAlpha * 100).toFixed(0)}% [{scenarioAKey} ➔{" "}
            {scenarioBKey}]
          </span>
        </div>

        <div className="flex items-center gap-4">
          <span className="text-xs font-bold text-slate-400 w-24 text-right truncate">
            {scenarioAKey}
          </span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={morphAlpha}
            onChange={(e) => handleMorphChange(parseFloat(e.target.value))}
            className="w-full h-2.5 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-indigo-500"
          />
          <span className="text-xs font-bold text-slate-400 w-24 truncate">
            {scenarioBKey}
          </span>
        </div>
      </div>

      {/* SECTION MODULATEUR DE BÉZIER & MINI BACKTEST HISTORIQUE */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 bg-slate-900/90 border border-slate-800 p-6 rounded-3xl backdrop-blur-md shadow-2xl">
        <div className="md:col-span-5 flex flex-col items-center justify-between bg-slate-950/40 p-4 rounded-2xl border border-slate-800/80">
          <div className="w-full flex justify-between items-center mb-3">
            <span className="text-[11px] font-black text-indigo-400 uppercase tracking-widest">
              Canvas de Bézier Interactif
            </span>
            <span className="text-[10px] font-mono text-slate-500">
              P1: ({bezierCP.x1.toFixed(2)}, {bezierCP.y1.toFixed(2)}) | P2: ({bezierCP.x2.toFixed(2)}, {bezierCP.y2.toFixed(2)})
            </span>
          </div>

          <div className="relative w-full aspect-square max-w-[240px] bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-center p-2">
            <svg
              id="bezier-svg"
              viewBox="0 0 240 240"
              className="w-full h-full overflow-visible select-none"
            >
              {/* Background Grid Lines */}
              <line x1="20" y1="75" x2="220" y2="75" stroke="#1e293b" strokeWidth="1" strokeDasharray="3 3" />
              <line x1="20" y1="120" x2="220" y2="120" stroke="#334155" strokeWidth="1" />
              <line x1="20" y1="175" x2="220" y2="175" stroke="#1e293b" strokeWidth="1" strokeDasharray="3 3" />
              
              <line x1="75" y1="20" x2="75" y2="220" stroke="#1e293b" strokeWidth="1" strokeDasharray="3 3" />
              <line x1="120" y1="20" x2="120" y2="220" stroke="#334155" strokeWidth="1" />
              <line x1="175" y1="20" x2="175" y2="220" stroke="#1e293b" strokeWidth="1" strokeDasharray="3 3" />

              {/* Axis labels */}
              <text x="25" y="215" fill="#475569" fontSize="9" fontWeight="bold">Fréquentiel</text>
              <text x="185" y="35" fill="#475569" fontSize="9" fontWeight="bold">Profond</text>

              {/* Connection Lines to Control Points */}
              <line
                x1="20"
                y1="220"
                x2={20 + bezierCP.x1 * 200}
                y2={220 - bezierCP.y1 * 200}
                stroke="#818cf8"
                strokeWidth="1.5"
                strokeDasharray="4 4"
              />
              <line
                x1="220"
                y1="20"
                x2={20 + bezierCP.x2 * 200}
                y2={220 - bezierCP.y2 * 200}
                stroke="#c084fc"
                strokeWidth="1.5"
                strokeDasharray="4 4"
              />

              {/* The Bezier Curve Path */}
              <path
                d={`M 20 220 C ${20 + bezierCP.x1 * 200} ${220 - bezierCP.y1 * 200}, ${20 + bezierCP.x2 * 200} ${220 - bezierCP.y2 * 200}, 220 20`}
                fill="none"
                stroke="url(#bezierGradient)"
                strokeWidth="4"
              />

              <defs>
                <linearGradient id="bezierGradient" x1="0%" y1="100%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#6366f1" />
                  <stop offset="100%" stopColor="#a855f7" />
                </linearGradient>
              </defs>

              {/* Draggable Circle Handle 1 */}
              <circle
                cx={20 + bezierCP.x1 * 200}
                cy={220 - bezierCP.y1 * 200}
                r="10"
                fill="#818cf8"
                stroke="#ffffff"
                strokeWidth="2.5"
                className="cursor-grab active:cursor-grabbing hover:scale-125 transition-transform"
                onMouseDown={() => setIsDraggingCP(1)}
                onTouchStart={() => setIsDraggingCP(1)}
              />

              {/* Draggable Circle Handle 2 */}
              <circle
                cx={20 + bezierCP.x2 * 200}
                cy={220 - bezierCP.y2 * 200}
                r="10"
                fill="#c084fc"
                stroke="#ffffff"
                strokeWidth="2.5"
                className="cursor-grab active:cursor-grabbing hover:scale-125 transition-transform"
                onMouseDown={() => setIsDraggingCP(2)}
                onTouchStart={() => setIsDraggingCP(2)}
              />
            </svg>
          </div>
          <p className="text-[10px] text-slate-500 text-center mt-3 leading-relaxed">
            Glissez les deux poignées colorées pour modifier continuement la courbure cybernétique.
          </p>
        </div>

        <div className="md:col-span-7 flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="size-5 text-indigo-400 shrink-0" />
              <h3 className="text-base font-black text-white">Modulation Cybernétique de Bézier</h3>
            </div>
            <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
              Ce système applique un étalement continu non-linéaire sur les 20 algorithmes en séquence (du fréquentiel classique au deep learning).
            </p>
          </div>

          {/* Preset Buttons */}
          <div className="space-y-2">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider block">
              Profils Prédéfinis
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { id: "linear", label: "Linéaire Flat" },
                { id: "ease-in-out", label: "Ease In-Out S-Curve" },
                { id: "low-boost", label: "Structurel (Basse)" },
                { id: "high-boost", label: "Profond (Haute)" },
              ].map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => applyPreset(preset.id)}
                  className={`px-3 py-2 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                    activePreset === preset.id
                      ? "bg-indigo-600/30 text-indigo-300 border-indigo-500"
                      : "bg-slate-950/40 text-slate-400 border-slate-800/80 hover:bg-slate-950/80"
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Mini-Backtest Performance Panel */}
          <div className="bg-slate-950/40 border border-slate-800/80 p-4 rounded-2xl grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                Efficacité Baseline (Global)
              </span>
              <div className="text-2xl font-black text-slate-300">{baselineEfficiency}%</div>
            </div>

            <div className="space-y-1 border-t sm:border-t-0 sm:border-l border-slate-800/80 sm:pl-4">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                Efficacité Courante (What-If)
              </span>
              <div className="text-2xl font-black text-indigo-400">{currentEfficiency}%</div>
            </div>

            <div className="space-y-1 border-t sm:border-t-0 sm:border-l border-slate-800/80 sm:pl-4">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                Écart de Performance
              </span>
              <div className="flex items-center gap-1.5">
                {currentEfficiency - baselineEfficiency >= 0 ? (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    ▲ +{(currentEfficiency - baselineEfficiency).toFixed(1)}%
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-black bg-rose-500/20 text-rose-300 border border-rose-500/30">
                    ▼ {(currentEfficiency - baselineEfficiency).toFixed(1)}%
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Partial Derivatives Panel */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">
                Sensibilité de l'Efficacité (Dérivées Partielles ∂E / ∂W)
              </span>
              <span className="text-[9px] font-mono text-slate-400">ε = 0.05</span>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              {partialDerivatives.map((deriv) => {
                const isPositive = deriv.value >= 0;
                return (
                  <div
                    key={deriv.key}
                    className="bg-slate-950/20 border border-slate-800/50 p-2.5 rounded-xl flex flex-col justify-between space-y-1"
                  >
                    <div className="flex justify-between items-center text-[11px] font-bold text-slate-300">
                      <span>{deriv.name}</span>
                      <span className={isPositive ? "text-emerald-400" : "text-rose-400"}>
                        {isPositive ? "+" : ""}{deriv.value.toFixed(2)}
                      </span>
                    </div>
                    {/* Visual derivative bar */}
                    <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden relative">
                      <div
                        className={`absolute top-0 h-full rounded-full transition-all duration-300 ${
                          isPositive ? "bg-emerald-500 left-1/2" : "bg-rose-500 right-1/2"
                        }`}
                        style={{
                          width: `${Math.min(50, Math.abs(deriv.value) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Bifurcation Alert (Catastrophe Theory) */}
      {bifurcations.length > 0 && (
        <div className="bg-amber-950/80 border border-amber-500/50 p-4 rounded-2xl flex items-start gap-3 text-amber-200 text-xs shadow-xl animate-pulse">
          <AlertTriangle className="size-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-black text-amber-400 uppercase tracking-wider block text-[11px]">
              Alerte Point de Bifurcation Détecté (Théorie des Catastrophes)
            </span>
            <p className="text-[11px] leading-relaxed text-amber-200/90">
              Une micro-variation de slider provoque un basculement d'attracteur
              : L'algorithme{" "}
              <span className="font-bold text-amber-300">
                {LABELS[bifurcations[0].algoKey] || bifurcations[0].algoKey}
              </span>{" "}
              a fait sauter la boule gagnante du N°
              {bifurcations[0].rankFlipBallFrom} vers le N°
              {bifurcations[0].rankFlipBallTo}.
            </p>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-12 gap-6">
        {/* Left Panel: Hyper-parameter Sliders */}
        <div className="lg:col-span-4 space-y-4 bg-slate-900/90 border border-slate-800 rounded-3xl p-5 shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h3 className="font-bold text-slate-200 flex items-center gap-2 text-sm">
              <Cpu size={16} className="text-indigo-400" /> Sliders Continu (20
              Algos)
            </h3>
            <button
              onClick={() => {
                setCustomWeights(globalWeights);
                runSimulation(globalWeights);
              }}
              className="text-[10px] text-slate-400 hover:text-indigo-400 flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw size={12} /> Reset
            </button>
          </div>

          <div className="space-y-5 max-h-[620px] overflow-y-auto pr-2 custom-scrollbar">
            {[
              {
                name: "Fréquentiel & Transition",
                keys: [
                  AlgoKey.FREQUENCY,
                  AlgoKey.MARKOV,
                  AlgoKey.BAYES,
                  AlgoKey.GAPS,
                  AlgoKey.MOMENTUM,
                  AlgoKey.GAP_SEQUENCE,
                  AlgoKey.GAP_PATTERN,
                  AlgoKey.SEQUENCE_PATTERN,
                  AlgoKey.GAP_CADENCE,
                  AlgoKey.GAP_TREND,
                  AlgoKey.INTER_MONTHLY_RESONANCE,
                ],
              },
              {
                name: "Mathématique & Structural",
                keys: [
                  AlgoKey.SPECTRAL,
                  AlgoKey.FRACTAL,
                  AlgoKey.TEMPORAL,
                  AlgoKey.SHADOW_PROBABILITY,
                ],
              },
              {
                name: "Dynamiques Avancées",
                keys: [
                  AlgoKey.SPATIAL,
                  AlgoKey.AFFINITY,
                  AlgoKey.JACCARD,
                  AlgoKey.NETWORK_CORRELATION,
                  AlgoKey.ECHO_STATE,
                  AlgoKey.DERIVED_NEIGHBOR,
                ],
              },
            ].map((cat) => (
              <div
                key={cat.name}
                className="space-y-3 border-b border-slate-800/80 pb-3.5 last:border-0"
              >
                <h4 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">
                  {cat.name}
                </h4>
                <div className="space-y-3">
                  {cat.keys.map((key) => {
                    const val = customWeights[key] || 0;
                    const label = LABELS[key] || key;
                    return (
                      <div key={key} className="space-y-1">
                        <div className="flex justify-between text-xs font-medium">
                          <span className="text-slate-300 font-semibold text-[11px]">
                            {label}
                          </span>
                          <span className="text-indigo-400 font-mono font-bold">
                            {(val * 100).toFixed(1)}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.01"
                          value={val}
                          onChange={(e) =>
                            handleWeightChange(key, parseFloat(e.target.value))
                          }
                          className="w-full accent-indigo-500 h-1.5 bg-slate-950 rounded cursor-pointer"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Panel: Live Impact, Jacobian, Inverse What-If, Monte Carlo & Coupling */}
        <div className="lg:col-span-8 space-y-6">
          {/* Live Candidates Impact */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-xl relative">
            {isSimulating && (
              <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm z-10 flex items-center justify-center rounded-3xl">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-400"></div>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 mb-6 border-b border-slate-800 pb-3">
              <h3 className="font-bold text-white flex items-center gap-2 text-sm">
                <BarChart2 size={18} className="text-emerald-400" /> Top 10
                Attracteurs - Impact Live
              </h3>

              {/* KL Divergence Badge */}
              <div className="flex items-center gap-2 text-xs font-mono">
                <span className="text-slate-400">Divergence KL:</span>
                <span
                  className={`font-bold px-2.5 py-0.5 rounded-full border ${klDivergence < 0.05 ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : klDivergence < 0.15 ? "bg-amber-500/20 text-amber-400 border-amber-500/30" : "bg-rose-500/20 text-rose-400 border-rose-500/30"}`}
                >
                  {klDivergence.toFixed(4)}{" "}
                  {klDivergence < 0.05
                    ? "(TRÈS STABLE)"
                    : klDivergence < 0.15
                      ? "(SENSIS) "
                      : "(DÉVIATION HAUTE)"}
                </span>
              </div>
            </div>

            {/* Top 5 Balls Display */}
            <div className="space-y-6">
              <div className="flex flex-wrap gap-4 justify-center py-2">
                {suggested.map((n) => (
                  <NumberBall key={n} number={n} size="lg" isAttractor={true} />
                ))}
              </div>

              <div className="h-52 w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartData}
                    margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="#334155"
                      opacity={0.2}
                    />
                    <XAxis
                      dataKey="num"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 11, fill: "#94a3b8" }}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10, fill: "#64748b" }}
                    />
                    <Tooltip
                      cursor={{ fill: "rgba(99, 102, 241, 0.1)" }}
                      contentStyle={{
                        borderRadius: "12px",
                        border: "none",
                        backgroundColor: "#0f172a",
                        color: "#fff",
                      }}
                    />
                    <Bar dataKey="score" radius={[6, 6, 0, 0]}>
                      {chartData.map((data) => (
                        <Cell
                          key={data.num}
                          fill={
                            suggested.includes(data.num) ? "#10b981" : "#6366f1"
                          }
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Jacobian Sensitivity & 2nd Order Hessian Coupling Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Jacobian Sensitivity Chart */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-3">
              <h4 className="text-xs font-black text-indigo-400 uppercase tracking-widest flex items-center gap-2 border-b border-slate-800 pb-2">
                <Network size={15} /> Dérivées Jacobiennes J_ij (90x20)
              </h4>
              <p className="text-[10px] text-slate-400">
                Gradients de sensibilité les plus raides sur le Simplex 90D
              </p>

              <div className="h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={jacobianSensitivities}
                    margin={{ top: 10, right: 0, left: -20, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient
                        id="colorSensitivity"
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="5%"
                          stopColor="#8b5cf6"
                          stopOpacity={0.4}
                        />
                        <stop
                          offset="95%"
                          stopColor="#8b5cf6"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="name"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 9, fill: "#94a3b8" }}
                    />
                    <YAxis axisLine={false} tickLine={false} tick={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#0f172a",
                        borderColor: "#334155",
                        borderRadius: "8px",
                        fontSize: "10px",
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="sensitivity"
                      stroke="#8b5cf6"
                      strokeWidth={2}
                      fill="url(#colorSensitivity)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Hessian 2nd-Order Coupling Matrix */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-5 shadow-xl space-y-3">
              <h4 className="text-xs font-black text-amber-400 uppercase tracking-widest flex items-center gap-2 border-b border-slate-800 pb-2">
                <Zap size={15} /> Couplage de 2nd Ordre (Hessienne H_jk)
              </h4>
              <p className="text-[10px] text-slate-400">
                Détection des synergies / antagonismes forts entre algorithmes
              </p>

              <div className="space-y-3 pt-1">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[9px] text-slate-500 uppercase font-bold block mb-1">
                      Algo A
                    </label>
                    <select
                      value={hessianAlgoA}
                      onChange={(e) =>
                        setHessianAlgoA(e.target.value as AlgoKey)
                      }
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-slate-200"
                    >
                      {Object.keys(globalWeights).map((k) => (
                        <option key={k} value={k}>
                          {LABELS[k as AlgoKey] || k}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[9px] text-slate-500 uppercase font-bold block mb-1">
                      Algo B
                    </label>
                    <select
                      value={hessianAlgoB}
                      onChange={(e) =>
                        setHessianAlgoB(e.target.value as AlgoKey)
                      }
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-slate-200"
                    >
                      {Object.keys(globalWeights).map((k) => (
                        <option key={k} value={k}>
                          {LABELS[k as AlgoKey] || k}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800 flex items-center justify-between font-mono">
                  <span className="text-xs text-slate-400">
                    Dérivée Seconde H_AB :
                  </span>
                  <span
                    className={`text-sm font-bold ${hessianCouplingVal >= 0 ? "text-emerald-400" : "text-rose-400"}`}
                  >
                    {hessianCouplingVal > 0 ? "+" : ""}
                    {hessianCouplingVal.toFixed(4)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Inverse What-If Search Solver Widget */}
          <div className="bg-slate-900/90 border border-indigo-500/30 rounded-3xl p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-white text-sm flex items-center gap-2">
                  <Search size={16} className="text-indigo-400" /> Recherche
                  Inversée Contrefactuelle ("Inverse What-If")
                </h3>
                <p className="text-[11px] text-slate-400">
                  Trouve le vecteur de poids optimal W* pour propulser un numéro
                  cible dans le Top 5 via Gradient Descent (L-BFGS)
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <label className="text-xs font-bold text-slate-300">
                  Numéro Cible :
                </label>
                <input
                  type="number"
                  min="1"
                  max="90"
                  value={inverseTargetBall}
                  onChange={(e) =>
                    setInverseTargetBall(
                      Math.max(1, Math.min(90, parseInt(e.target.value) || 1)),
                    )
                  }
                  className="w-16 bg-slate-950 border border-indigo-500/40 rounded-xl px-2.5 py-1.5 text-center font-mono font-bold text-indigo-300 text-sm"
                />
              </div>

              <button
                onClick={handleRunInverseWhatIf}
                disabled={isCalculatingInverse}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer shadow-lg disabled:opacity-50"
              >
                <Sparkles size={14} />
                {isCalculatingInverse
                  ? "Calcul L-BFGS..."
                  : "Résoudre Combinaison Optimale"}
              </button>

              {inverseResult && (
                <button
                  onClick={handleApplyInverseWeights}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer shadow-lg"
                >
                  <Zap size={14} /> Appliquer les Poids Optimaux
                </button>
              )}
            </div>

            {inverseResult && (
              <div className="bg-slate-950 p-4 rounded-2xl border border-indigo-500/30 space-y-3 font-mono text-xs">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="text-slate-400">
                    Résultat Optimisation (N°{inverseResult.targetBall}) :
                  </span>
                  <span className="text-emerald-400 font-bold">
                    Rang Atteint : #{inverseResult.achievableRank}
                  </span>
                </div>
                <div className="space-y-1 text-[11px]">
                  <span className="text-indigo-300 font-bold block mb-1">
                    Ajustements Requis Majeurs :
                  </span>
                  {inverseResult.requiredAdjustments.map((adj) => (
                    <div
                      key={adj.key}
                      className="flex justify-between text-slate-300"
                    >
                      <span>{LABELS[adj.key] || adj.key}</span>
                      <span
                        className={
                          adj.delta > 0 ? "text-emerald-400" : "text-rose-400"
                        }
                      >
                        {(adj.original * 100).toFixed(1)}% ➔{" "}
                        {(adj.target * 100).toFixed(1)}% (
                        {adj.delta > 0 ? "+" : ""}
                        {(adj.delta * 100).toFixed(1)}%)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Monte Carlo Multi-Scenario Stress Test */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-white text-sm flex items-center gap-2">
                  <Compass size={16} className="text-emerald-400" /> Test de
                  Stress Monte Carlo Multi-Scénarios (Bandes de Confiance)
                </h3>
                <p className="text-[11px] text-slate-400">
                  Pannes stochastiques gaussiennes N(0, σ²) pour évaluer les
                  bandes de tolérance p5-p95
                </p>
              </div>
              <button
                onClick={handleRunMonteCarlo}
                disabled={isMonteCarloRunning}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer disabled:opacity-50"
              >
                <Activity size={14} />
                {isMonteCarloRunning
                  ? "Simulation..."
                  : "Lancer Monte Carlo (120 Runs)"}
              </button>
            </div>

            {mcResults.length > 0 && (
              <div className="space-y-2 font-mono text-xs">
                <div className="grid grid-cols-5 text-[10px] text-slate-500 uppercase font-bold border-b border-slate-800 pb-1">
                  <span>Boule</span>
                  <span>Score Moyen</span>
                  <span>Écart-type σ</span>
                  <span>Bande [p5 - p95]</span>
                  <span>Stabilité</span>
                </div>
                {mcResults.slice(0, 5).map((res) => (
                  <div
                    key={res.ball}
                    className="grid grid-cols-5 text-slate-300 py-1 border-b border-slate-900 items-center"
                  >
                    <span className="font-bold text-indigo-400">
                      N°{res.ball}
                    </span>
                    <span>{res.meanScore}</span>
                    <span className="text-amber-400">±{res.stdDev}</span>
                    <span className="text-slate-400">
                      [{res.p5} - {res.p95}]
                    </span>
                    <span className="text-emerald-400 font-bold">
                      {res.stabilityIndex}%
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
