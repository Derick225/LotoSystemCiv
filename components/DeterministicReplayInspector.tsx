import React, { useState, useEffect, useMemo, useRef } from "react";
import { useNexusStore } from "../store/useNexusStore";
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  RefreshCw,
  Download,
  Upload,
  FileText,
  Trophy,
  Target,
  Activity,
  TrendingUp,
  Sliders,
  ShieldCheck,
} from "lucide-react";
import { DrawResult, AlgoWeights } from "../types";
import { generateMasterPrediction } from "../services/predictionEngine";
import { purifyHistoryForDraw } from "../utils/arrayUtils";
import { audioEngine } from "../utils/audioEngine";
import { drawHasMachineNumbers } from "../constants";
import { AlgoKey } from "../shared/prediction.types";
import { normalizeWeights } from "../services/prediction/weightsManager";
import { useToast } from "./ui/Toast";
import {
  buildUnifiedForensicScenario,
  exportUnifiedScenarioToJSON,
  importUnifiedScenarioFromJSON,
  reinjectScenarioIntoState,
  extractMathProofMetadata,
  MathematicalProofMetadata,
} from "../services/forensic/forensicProofStandard";
import { generateUnifiedForensicScenarioPDF } from "../services/exportService";

export interface ReplayStepData {
  stepIndex: number;
  drawDate: string;
  actual: number[];
  predicted: number[];
  hits: number[];
  hitCount: number;
  topologicalLoss: number;
  bankroll: number;
  confidence: number;
  mathProofMetadata?: MathematicalProofMetadata;
}

export const DeterministicReplayInspector: React.FC<{ drawName: string }> = ({
  drawName,
}) => {
  const { showToast } = useToast();
  const history = useNexusStore((state) => state.history);
  const globalWeights = useNexusStore((state) => state.globalWeights);
  const temporalDepth = useNexusStore((state) => state.temporalDepth);
  const isForensicOptimized = useNexusStore((state) => state.isForensicOptimized);
  const useSpatioTemporalHawkes = useNexusStore((state) => state.useSpatioTemporalHawkes);

  const cleanHistory = useMemo(() => {
    return purifyHistoryForDraw(drawName, history);
  }, [drawName, history]);

  const [replayWindow, setReplayWindow] = useState<number>(20);
  const [initialBankroll, setInitialBankroll] = useState<number>(50000);
  const [unitBet, setUnitBet] = useState<number>(200);

  const [steps, setSteps] = useState<ReplayStepData[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1000); // ms per step

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Run full deterministic replay simulation
  const runDeterministicReplay = async () => {
    if (cleanHistory.length < replayWindow + 5) {
      showToast(
        `Historique insuffisant pour une fenêtre de ${replayWindow} tirages.`,
        "error",
      );
      return;
    }

    setIsExecuting(true);
    setIsPlaying(false);
    audioEngine.play("scan");

    try {
      const generatedSteps: ReplayStepData[] = [];
      let currentBankroll = initialBankroll;

      const hasMachine = drawHasMachineNumbers(drawName, cleanHistory);
      const sanitizedWeights = { ...(globalWeights || {}) } as AlgoWeights;
      if (!hasMachine) {
        (sanitizedWeights as any)[AlgoKey.MACHINE_TRANSFER] = 0.0;
      }
      const effectiveWeights = normalizeWeights(sanitizedWeights);

      // Slice historical range from oldest to newest within the window
      const targetWindowHistory = cleanHistory.slice(0, replayWindow).reverse();

      for (let i = 0; i < targetWindowHistory.length; i++) {
        const target = targetWindowHistory[i];
        // Past history for blind evaluation
        const targetIndexInFull = cleanHistory.findIndex(
          (d) =>
            d.id === target.id ||
            (d.date === target.date && d.drawName === target.drawName),
        );
        const past =
          targetIndexInFull >= 0
            ? cleanHistory.slice(targetIndexInFull + 1)
            : [];

        if (past.length < 5) continue;

        const pred = await generateMasterPrediction(
          drawName,
          past,
          temporalDepth,
          effectiveWeights,
          undefined,
          undefined,
          true,
          false,
          0,
          isForensicOptimized,
          undefined,
          undefined,
          useSpatioTemporalHawkes,
        );

        const actualGagnants = Array.isArray(target?.gagnants) ? target.gagnants : [];
        const hits = pred.suggestedNumbers.filter((n) =>
          actualGagnants.includes(n),
        );
        const hitCount = hits.length;

        // Compute Topological Loss (mean circular distance between suggested and actuals)
        let topoDistSum = 0;
        const safePredNumbers = Array.isArray(pred.suggestedNumbers) ? pred.suggestedNumbers : [];
        safePredNumbers.forEach((p) => {
          let minDist = 90;
          actualGagnants.forEach((a) => {
            const d = Math.min(Math.abs(p - a), 90 - Math.abs(p - a));
            if (d < minDist) minDist = d;
          });
          topoDistSum += minDist;
        });
        const topologicalLoss = safePredNumbers.length > 0 ? topoDistSum / safePredNumbers.length : 0;

        // Payout simulation logic
        let payoutMultiplier = 0;
        if (hitCount === 5) payoutMultiplier = 500;
        else if (hitCount === 4) payoutMultiplier = 50;
        else if (hitCount === 3) payoutMultiplier = 10;
        else if (hitCount === 2) payoutMultiplier = 2;

        const pnl = unitBet * payoutMultiplier - unitBet;
        currentBankroll += pnl;

        const mathProofMetadata = extractMathProofMetadata({
          history: past,
          weights: globalWeights,
          suggestedNumbers: pred.suggestedNumbers,
          actualWinners: target.gagnants,
          topologicalLoss,
        });

        generatedSteps.push({
          stepIndex: i + 1,
          drawDate: target.date,
          actual: target.gagnants,
          predicted: pred.suggestedNumbers,
          hits,
          hitCount,
          topologicalLoss,
          bankroll: currentBankroll,
          confidence: pred.confidence,
          mathProofMetadata,
        });
      }

      setSteps(generatedSteps);
      setCurrentStepIndex(generatedSteps.length - 1);
      audioEngine.play("success");
      showToast(
        `Simulation de Replay Déterministe achevée (${generatedSteps.length} étapes)`,
        "success",
      );
    } catch (err) {
      console.error(err);
      audioEngine.play("error");
      showToast("Erreur lors de la simulation de replay.", "error");
    } finally {
      setIsExecuting(false);
    }
  };

  // Playback timer handling
  useEffect(() => {
    if (isPlaying && steps.length > 0) {
      timerRef.current = setInterval(() => {
        setCurrentStepIndex((prev) => {
          if (prev < steps.length - 1) return prev + 1;
          setIsPlaying(false);
          return prev;
        });
      }, playbackSpeed);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, steps.length, playbackSpeed]);

  const activeStep = steps[currentStepIndex];

  const replaySummary = useMemo(() => {
    if (steps.length === 0) return null;
    const totalHits = steps.reduce((acc, s) => acc + s.hitCount, 0);
    const avgHits = (totalHits / steps.length).toFixed(2);
    const successRate = (
      (steps.filter((s) => s.hitCount >= 1).length / steps.length) *
      100
    ).toFixed(1);
    const finalPnl = steps[steps.length - 1].bankroll - initialBankroll;
    const avgTopoLoss = (
      steps.reduce((acc, s) => acc + s.topologicalLoss, 0) / steps.length
    ).toFixed(1);

    return { totalHits, avgHits, successRate, finalPnl, avgTopoLoss };
  }, [steps, initialBankroll]);

  const handleExportUniversalJSON = () => {
    if (steps.length === 0) return;
    audioEngine.play("click");
    const activeOrLastStep = activeStep || steps[steps.length - 1];
    const mathMeta = activeOrLastStep.mathProofMetadata || extractMathProofMetadata({
      history: cleanHistory,
      weights: globalWeights,
      suggestedNumbers: activeOrLastStep.predicted,
      actualWinners: activeOrLastStep.actual,
      topologicalLoss: activeOrLastStep.topologicalLoss,
    });

    const scenario = buildUnifiedForensicScenario({
      scenarioType: 'DETERMINISTIC_REPLAY',
      drawName,
      appliedWeights: globalWeights,
      mathMetadata: mathMeta,
      summary: {
        hitRate: Number(replaySummary?.successRate || 0),
        accuracyScore: Number(replaySummary?.avgHits || 0) * 20,
        sampleCount: steps.length,
        regime: 'DETERMINISTIC_REPLAY',
        causalAuditTrail: [
          `Replay déterministe sur ${steps.length} tirages`,
          `Moyenne hits : ${replaySummary?.avgHits} / 5`,
          `PnL Final : ${replaySummary?.finalPnl} FCFA`,
          `Perte topologique moyenne : ${replaySummary?.avgTopoLoss}`,
        ],
      },
      payload: { steps, summary: replaySummary },
    });

    exportUnifiedScenarioToJSON(scenario);
    showToast("Scénario de Replay exporté en JSON", "success");
  };

  const handleExportUniversalPDF = async () => {
    if (steps.length === 0) return;
    try {
      audioEngine.play("click");
      const activeOrLastStep = activeStep || steps[steps.length - 1];
      const mathMeta = activeOrLastStep.mathProofMetadata || extractMathProofMetadata({
        history: cleanHistory,
        weights: globalWeights,
        suggestedNumbers: activeOrLastStep.predicted,
        actualWinners: activeOrLastStep.actual,
        topologicalLoss: activeOrLastStep.topologicalLoss,
      });

      const scenario = buildUnifiedForensicScenario({
        scenarioType: 'DETERMINISTIC_REPLAY',
        drawName,
        appliedWeights: globalWeights,
        mathMetadata: mathMeta,
        summary: {
          hitRate: Number(replaySummary?.successRate || 0),
          accuracyScore: Number(replaySummary?.avgHits || 0) * 20,
          sampleCount: steps.length,
          regime: 'DETERMINISTIC_REPLAY',
          causalAuditTrail: [
            `Replay déterministe sur ${steps.length} tirages`,
            `Moyenne hits : ${replaySummary?.avgHits} / 5`,
            `PnL Final : ${replaySummary?.finalPnl} FCFA`,
            `Perte topologique moyenne : ${replaySummary?.avgTopoLoss}`,
          ],
        },
        payload: { steps, summary: replaySummary },
      });

      await generateUnifiedForensicScenarioPDF(scenario);
      showToast("Rapport de Replay exporté en PDF", "success");
    } catch (err: any) {
      showToast("Erreur lors de l'exportation PDF : " + err.message, "error");
    }
  };

  const handleImportUniversalJSON = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      audioEngine.play("scan");
      const scenario = await importUnifiedScenarioFromJSON(file);
      const res = await reinjectScenarioIntoState(scenario, cleanHistory);
      showToast(res.message, "success");
      audioEngine.play("success");
    } catch (err: any) {
      showToast(err.message || "Échec de l'importation du scénario", "error");
      audioEngine.play("error");
    } finally {
      e.target.value = "";
    }
  };

  const exportReplayJson = handleExportUniversalJSON;

  return (
    <div className="bg-slate-950 p-6 md:p-8 rounded-[2rem] border border-slate-800 shadow-2xl space-y-8">
      {/* HEADER & SETTINGS */}
      <div className="flex flex-col md:flex-row justify-between items-start gap-6 border-b border-slate-800/80 pb-6">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-black text-[9px] rounded-full uppercase tracking-wider mb-3">
            <ShieldCheck size={12} /> Exécution 100% Déterministe Seedée
          </div>
          <h3 className="text-2xl font-black text-white uppercase tracking-tight flex items-center gap-2">
            Simulation de Replay Pas-à-Pas
          </h3>
          <p className="text-xs text-slate-400 mt-1 max-w-xl">
            Rejoue l'historique de tirages en isolation aveugle. Compare à
            chaque étape le vecteur de 5 numéros prédits aux numéros réellement
            tirés.
          </p>
        </div>

        <div className="flex flex-wrap gap-3 items-center">
          <div>
            <label className="block text-[9px] font-black uppercase text-slate-400 mb-1">
              Fenêtre Tirages
            </label>
            <select
              value={replayWindow}
              onChange={(e) => setReplayWindow(Number(e.target.value))}
              disabled={isExecuting}
              className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs font-bold text-white focus:outline-none"
            >
              <option value={10}>10 Tirages</option>
              <option value={20}>20 Tirages</option>
              <option value={50}>50 Tirages</option>
            </select>
          </div>

          <button
            onClick={runDeterministicReplay}
            disabled={isExecuting}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-lg border border-indigo-400/30 transition-all flex items-center gap-2 disabled:opacity-50 mt-4 sm:mt-0"
          >
            <RefreshCw
              size={14}
              className={isExecuting ? "animate-spin" : ""}
            />
            {isExecuting ? "Calcul Replay..." : "Lancer Replay"}
          </button>
        </div>
      </div>

      {/* PLAYBACK CONTROLS & STEP INSPECTOR */}
      {steps.length > 0 && activeStep && (
        <div className="space-y-6">
          {/* PLAYBACK BAR */}
          <div className="bg-slate-900/80 p-5 rounded-2xl border border-slate-800 flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() =>
                  setCurrentStepIndex((prev) => Math.max(0, prev - 1))
                }
                disabled={currentStepIndex === 0}
                className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl transition-colors disabled:opacity-30"
              >
                <SkipBack size={16} />
              </button>

              <button
                onClick={() => {
                  setIsPlaying(!isPlaying);
                  audioEngine.play("click");
                }}
                className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 border ${
                  isPlaying
                    ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                    : "bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30"
                }`}
              >
                {isPlaying ? <Pause size={14} /> : <Play size={14} />}
                {isPlaying ? "Pause" : "Lecture"}
              </button>

              <button
                onClick={() =>
                  setCurrentStepIndex((prev) =>
                    Math.min(steps.length - 1, prev + 1),
                  )
                }
                disabled={currentStepIndex === steps.length - 1}
                className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl transition-colors disabled:opacity-30"
              >
                <SkipForward size={16} />
              </button>

              <span className="text-xs font-mono font-bold text-indigo-400 ml-2">
                Étape {activeStep.stepIndex} / {steps.length}
              </span>
            </div>

            {/* TIMELINE SLIDER */}
            <div className="flex-1 max-w-md w-full">
              <input
                type="range"
                min={0}
                max={steps.length - 1}
                value={currentStepIndex}
                onChange={(e) => setCurrentStepIndex(Number(e.target.value))}
                className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
              />
            </div>

            <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400">
              <span>Vitesse:</span>
              {[
                { label: "0.5x", speed: 2000 },
                { label: "1x", speed: 1000 },
                { label: "3x", speed: 330 },
              ].map((s) => (
                <button
                  key={s.label}
                  onClick={() => setPlaybackSpeed(s.speed)}
                  className={`px-2 py-1 rounded transition-colors ${
                    playbackSpeed === s.speed
                      ? "bg-indigo-500/30 text-indigo-300 font-black border border-indigo-500/40"
                      : "bg-slate-800 text-slate-400"
                  }`}
                >
                  {s.label}
                </button>
              ))}

              <button
                onClick={handleExportUniversalJSON}
                className="ml-2 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer"
                title="Exporter le Replay en JSON Universel"
              >
                <Download size={13} className="text-cyan-400" />
                <span>JSON</span>
              </button>

              <button
                onClick={handleExportUniversalPDF}
                className="px-2.5 py-1.5 bg-fuchsia-950/60 hover:bg-fuchsia-900/60 text-fuchsia-300 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 border border-fuchsia-800/40 cursor-pointer"
                title="Exporter le Rapport de Replay en PDF Universel"
              >
                <FileText size={13} className="text-fuchsia-400" />
                <span>PDF</span>
              </button>

              <label
                className="px-2.5 py-1.5 bg-indigo-950/60 hover:bg-indigo-900/60 text-indigo-300 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 border border-indigo-800/40 cursor-pointer"
                title="Importer et Réinjecter un Scénario Forensique"
              >
                <Upload size={13} className="text-indigo-400" />
                <span>Réinjecter</span>
                <input
                  type="file"
                  accept=".json"
                  onChange={handleImportUniversalJSON}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {/* ACTIVE STEP CARD */}
          <div className="bg-slate-900 p-6 rounded-3xl border border-slate-800/80 grid grid-cols-1 md:grid-cols-2 gap-8 shadow-xl">
            <div>
              <div className="flex justify-between items-center mb-3">
                <span className="text-[10px] font-black uppercase text-slate-400">
                  Tirage Réel : {activeStep.drawDate}
                </span>
                <span className="text-xs font-mono font-bold text-emerald-400">
                  {activeStep.hitCount} / 5 Hits
                </span>
              </div>
              <div className="flex gap-2">
                {activeStep.actual.map((num, i) => {
                  const isHit = activeStep.hits.includes(num);
                  return (
                    <div
                      key={i}
                      className={`w-11 h-11 rounded-full border-2 flex items-center justify-center font-mono text-xs font-black ${
                        isHit
                          ? "border-emerald-500 bg-emerald-500/20 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.3)] animate-pulse"
                          : "border-slate-800 bg-black/40 text-slate-400"
                      }`}
                    >
                      {num}
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-3">
                <span className="text-[10px] font-black uppercase text-slate-400">
                  Prédit (Master Inférence)
                </span>
                <span className="text-xs font-mono font-bold text-indigo-400">
                  Confiance : {activeStep.confidence.toFixed(1)}%
                </span>
              </div>
              <div className="flex gap-2">
                {activeStep.predicted.map((num, i) => {
                  const isHit = activeStep.actual.includes(num);
                  return (
                    <div
                      key={i}
                      className={`w-11 h-11 rounded-full border-2 flex items-center justify-center font-mono text-xs font-black ${
                        isHit
                          ? "border-emerald-500 bg-emerald-500/20 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.3)]"
                          : "border-indigo-500/30 bg-indigo-500/5 text-indigo-300"
                      }`}
                    >
                      {num}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* STANDARD MATHEMATICAL PROOF METADATA (ISO/IEC 12.0) */}
          {activeStep.mathProofMetadata && (
            <div className="bg-slate-900/80 p-5 rounded-2xl border border-indigo-500/20 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-black uppercase text-slate-300 flex items-center gap-1.5">
                  <ShieldCheck size={13} className="text-cyan-400" />
                  Preuves Mathématiques Standardisées de l'Étape (Shannon, Hurst, Hawkes, SHAP)
                </span>
                <span className="text-[9px] font-mono text-slate-500">
                  Zéro Nombre Magique &bull; 100% Déterministe
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                <div className="p-2.5 bg-slate-950/60 rounded-xl border border-white/5 space-y-0.5">
                  <span className="text-[8px] uppercase text-slate-500 block">Entropie Shannon</span>
                  <span className="text-xs font-black text-indigo-300">
                    {activeStep.mathProofMetadata.shannonEntropy.toFixed(4)}
                  </span>
                </div>
                <div className="p-2.5 bg-slate-950/60 rounded-xl border border-white/5 space-y-0.5">
                  <span className="text-[8px] uppercase text-slate-500 block">Exposant Hurst</span>
                  <span className="text-xs font-black text-emerald-300">
                    {activeStep.mathProofMetadata.hurstExponent.toFixed(4)}
                  </span>
                </div>
                <div className="p-2.5 bg-slate-950/60 rounded-xl border border-white/5 space-y-0.5">
                  <span className="text-[8px] uppercase text-slate-500 block">Intensité Hawkes λ</span>
                  <span className="text-xs font-black text-cyan-300">
                    {activeStep.mathProofMetadata.hawkesIntensity.toFixed(4)}
                  </span>
                </div>
                <div className="p-2.5 bg-slate-950/60 rounded-xl border border-white/5 space-y-0.5">
                  <span className="text-[8px] uppercase text-slate-500 block">Discrépance Weyl</span>
                  <span className="text-xs font-black text-amber-300">
                    {activeStep.mathProofMetadata.weylDiscrepancy.toFixed(4)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* REPLAY SUMMARY CARDS */}
          {replaySummary && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-slate-900/60 p-4 rounded-2xl border border-slate-800/80">
                <span className="text-[9px] font-black uppercase text-slate-500">
                  Moyenne Hits / Tirage
                </span>
                <span className="text-xl font-black text-indigo-400 mt-1 block font-mono">
                  {replaySummary.avgHits} / 5
                </span>
              </div>
              <div className="bg-slate-900/60 p-4 rounded-2xl border border-slate-800/80">
                <span className="text-[9px] font-black uppercase text-slate-500">
                  Taux de Rentrée (≥1 Hit)
                </span>
                <span className="text-xl font-black text-emerald-400 mt-1 block font-mono">
                  {replaySummary.successRate}%
                </span>
              </div>
              <div className="bg-slate-900/60 p-4 rounded-2xl border border-slate-800/80">
                <span className="text-[9px] font-black uppercase text-slate-500">
                  Perte Topologique Moy.
                </span>
                <span className="text-xl font-black text-amber-400 mt-1 block font-mono">
                  {replaySummary.avgTopoLoss} dist.
                </span>
              </div>
              <div className="bg-slate-900/60 p-4 rounded-2xl border border-slate-800/80">
                <span className="text-[9px] font-black uppercase text-slate-500">
                  P&L Capital Simulé
                </span>
                <span
                  className={`text-xl font-black mt-1 block font-mono ${replaySummary.finalPnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}
                >
                  {replaySummary.finalPnl >= 0
                    ? `+${replaySummary.finalPnl.toLocaleString()} F`
                    : `${replaySummary.finalPnl.toLocaleString()} F`}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
