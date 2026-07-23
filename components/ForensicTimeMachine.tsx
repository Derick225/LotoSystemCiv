import React, { useState, useEffect, useMemo } from "react";
import { useNexusStore } from "../store/useNexusStore";
import { Clock, Play, Pause, Calendar, Network, TrendingUp, AlertTriangle } from "lucide-react";
import { AlgoWeights, DrawResult } from "../types";
import { useToast } from "./ui/Toast";
import { audioEngine } from "../utils/audioEngine";
import { purifyHistoryForDraw } from "../utils/arrayUtils";
import { generateMasterPrediction } from "../services/predictionEngine";

interface ForensicTimeMachineProps {
  drawName: string;
  history: DrawResult[];
  currentWeights: AlgoWeights;
}

export const ForensicTimeMachine: React.FC<ForensicTimeMachineProps> = ({
  drawName,
  history,
  currentWeights,
}) => {
  const { showToast } = useToast();
  const temporalDepth = useNexusStore(state => state.temporalDepth);
  const isForensicOptimized = useNexusStore(state => state.isForensicOptimized);

  const drawHistory = useMemo(() => {
    return purifyHistoryForDraw(drawName, history);
  }, [history, drawName]);

  const [historicalIndex, setHistoricalIndex] = useState<number>(0);
  const [isSimulating, setIsSimulating] = useState(false);
  const [isWalkForwarding, setIsWalkForwarding] = useState(false);

  const [simulationResult, setSimulationResult] = useState<{
    accuracy: number;
    hits: number[];
    predicted: number[];
    actual: number[];
    confidence: number;
    xapExp?: any[];
  } | null>(null);

  const [walkForwardStats, setWalkForwardStats] = useState<{
    isActive: boolean;
    history: { date: string; hits: number; accuracy: number; predicted: number[]; actual: number[] }[];
  } | null>(null);

  const targetDraw = useMemo(() => {
    if (!drawHistory || drawHistory.length <= historicalIndex + 1) return null;
    return drawHistory[historicalIndex];
  }, [drawHistory, historicalIndex]);

  const pastHistory = useMemo(() => {
    if (!drawHistory) return [];
    return drawHistory.slice(historicalIndex + 1);
  }, [drawHistory, historicalIndex]);

  const computeTimeTravelPrediction = async () => {
    if (!targetDraw || pastHistory.length < 5) {
      showToast("Profondeur d'historique insuffisante dans le passé (minimum 5 requis).", "error");
      return;
    }
    setIsSimulating(true);
    try {
      const pred = await generateMasterPrediction(
        drawName,
        pastHistory,
        temporalDepth,
        currentWeights,
        undefined,
        undefined,
        true,
        false,
        0,
        isForensicOptimized
      );

      const hits = pred.suggestedNumbers.filter((n) => targetDraw.gagnants.includes(n));
      const accuracy = Math.round((hits.length / targetDraw.gagnants.length) * 100);

      setSimulationResult({
        accuracy,
        hits,
        predicted: pred.suggestedNumbers,
        actual: targetDraw.gagnants,
        confidence: pred.confidence,
        xapExp: pred.xapExp,
      });

      if (isWalkForwarding) {
        setWalkForwardStats(prev => {
          if (!prev) return null;
          if (prev.history.some(item => item.date === targetDraw.date)) return prev;
          return {
            ...prev,
            history: [
              ...prev.history,
              { date: targetDraw.date, hits: hits.length, accuracy, predicted: pred.suggestedNumbers, actual: targetDraw.gagnants }
            ]
          };
        });
      }
    } catch (err) {
      showToast("Erreur lors de la simulation", "error");
    } finally {
      setIsSimulating(false);
    }
  };

  useEffect(() => {
    computeTimeTravelPrediction();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historicalIndex]);

  useEffect(() => {
    let interval: ReturnType<typeof setTimeout>;
    if (isWalkForwarding) {
      interval = setInterval(() => {
        setHistoricalIndex(prev => {
          if (prev > 0) return prev - 1;
          setIsWalkForwarding(false);
          if (walkForwardStats) setWalkForwardStats(s => s ? { ...s, isActive: false } : null);
          return 0;
        });
      }, 2500);
    }
    return () => clearInterval(interval);
  }, [isWalkForwarding, walkForwardStats]);

  const toggleWalkForward = () => {
    if (!isWalkForwarding) {
      setWalkForwardStats({ isActive: true, history: [] });
      setHistoricalIndex(Math.min(drawHistory.length - 6, Math.max(10, historicalIndex)));
    } else {
      setWalkForwardStats(s => s ? { ...s, isActive: false } : null);
    }
    setIsWalkForwarding(!isWalkForwarding);
    audioEngine.play("click");
  };

  const walkForwardSummary = useMemo(() => {
    if (!walkForwardStats || walkForwardStats.history.length === 0) return null;
    const len = walkForwardStats.history.length;
    const totalHits = walkForwardStats.history.reduce((a, b) => a + b.hits, 0);
    const avgHits = (totalHits / len).toFixed(2);
    const successRate = ((walkForwardStats.history.filter((h) => h.hits >= 1).length / len) * 100).toFixed(1);
    return { len, avgHits, successRate };
  }, [walkForwardStats]);

  if (!targetDraw) {
    return (
      <div className="glass-card neural-border p-8 rounded-3xl text-center text-slate-400">
        Pas assez d'historique de tirages disponibles.
      </div>
    );
  }

  return (
    <div className="bg-slate-950 p-6 md:p-8 rounded-[2rem] border border-slate-800/60 shadow-2xl relative overflow-hidden space-y-8">
      {/* HEADER & TIME SLIDER */}
      <div className="flex flex-col md:flex-row gap-6 justify-between items-start">
        <div className="flex-1">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-fuchsia-500/10 text-fuchsia-400 border border-fuchsia-500/20 font-black text-[9px] rounded-full uppercase tracking-wider mb-4">
            <Clock size={12} /> Machine Temporelle Épurée
          </div>
          <h3 className="text-2xl font-black text-white uppercase tracking-tight">Time Machine Forensic</h3>
          <p className="text-[11px] text-slate-400 mt-2">
            Inférence 100% aveugle sur le passé pour tester les performances du modèle sans pollution temporelle.
          </p>
        </div>

        <div className="bg-slate-900/60 p-5 rounded-2xl border border-slate-800/80 min-w-[300px]">
          <div className="flex justify-between items-center text-[10px] font-black text-slate-400 mb-3 uppercase">
            <div className="flex items-center gap-2">
              <span>Saut Temporel (-T)</span>
              <button
                onClick={toggleWalkForward}
                className={`flex items-center p-1.5 rounded-full border transition-all ${isWalkForwarding ? 'bg-fuchsia-500/20 border-fuchsia-500/50 text-fuchsia-400 animate-pulse' : 'bg-slate-800 border-slate-700 hover:text-white'}`}
              >
                {isWalkForwarding ? <Pause size={12} fill="currentColor" /> : <Play size={12} fill="currentColor" />}
              </button>
            </div>
            <span className="text-fuchsia-400 font-mono">Tirage -{historicalIndex}</span>
          </div>
          <input
            type="range"
            min="0"
            max={Math.max(0, drawHistory.length - 6)}
            step="1"
            value={historicalIndex}
            onChange={(e) => setHistoricalIndex(parseInt(e.target.value))}
            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-fuchsia-500 mb-3"
          />
        </div>
      </div>

      {/* TARGET DRAW vs PREDICTION */}
      <div className="bg-slate-900/80 p-6 rounded-3xl border border-slate-800 shadow-xl">
        <div className="flex items-center gap-2.5 text-xs text-slate-400 font-bold mb-4">
          <Calendar size={14} className="text-fuchsia-400" />
          <span>Tirage Cible du {targetDraw.date}</span>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-2">Gagnants Réels</span>
            <div className="flex gap-2">
              {targetDraw.gagnants.slice(0, 5).map((num, idx) => {
                const isHit = simulationResult?.hits.includes(num);
                return (
                  <div key={idx} className={`w-11 h-11 rounded-full border-2 flex items-center justify-center font-bold font-mono text-xs ${isHit ? "border-emerald-500 bg-emerald-500/10 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.25)]" : "border-slate-800 bg-black/40 text-slate-400"}`}>
                    {num}
                  </div>
                );
              })}
            </div>
          </div>

          {simulationResult && (
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 block mb-2">Vecteur Suggéré</span>
              <div className="flex gap-2">
                {simulationResult.predicted.slice(0, 5).map((num, idx) => {
                  const isHit = targetDraw.gagnants.includes(num);
                  return (
                    <div key={idx} className={`w-11 h-11 rounded-full border-2 flex items-center justify-center font-bold font-mono text-xs ${isHit ? "border-emerald-500 bg-emerald-500/10 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.25)]" : "border-indigo-500/40 bg-indigo-500/5 text-indigo-300"}`}>
                      {num}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* WALK-FORWARD AGGREGATE SUMMARY */}
      {walkForwardSummary && (
        <div className="bg-slate-900/30 p-6 rounded-[2rem] border border-slate-800/80">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-md font-black text-white uppercase tracking-wider flex items-center gap-2">
              <TrendingUp size={16} className="text-fuchsia-400" /> Walk-Forward Analysis
            </h3>
            <button onClick={() => setWalkForwardStats(null)} className="px-2.5 py-1 bg-slate-800 text-slate-300 border border-slate-700 rounded-lg text-[9px] font-bold uppercase transition-all">
              Réinitialiser
            </button>
          </div>
          
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-slate-950/40 p-4 rounded-2xl border border-slate-900">
              <span className="text-[9px] font-black uppercase text-slate-500">Tirages Simulés</span>
              <span className="text-2xl font-black text-white mt-1 block font-mono">{walkForwardSummary.len}</span>
            </div>
            <div className="bg-slate-950/40 p-4 rounded-2xl border border-slate-900">
              <span className="text-[9px] font-black uppercase text-slate-500">Espérance Hits</span>
              <span className="text-2xl font-black text-fuchsia-400 mt-1 block font-mono">{walkForwardSummary.avgHits}</span>
            </div>
            <div className="bg-slate-950/40 p-4 rounded-2xl border border-slate-900">
              <span className="text-[9px] font-black uppercase text-slate-500">Taux Succès (≥1)</span>
              <span className="text-2xl font-black text-emerald-400 mt-1 block font-mono">{walkForwardSummary.successRate}%</span>
            </div>
          </div>

          <div className="max-h-60 overflow-y-auto custom-scrollbar">
            <table className="w-full text-left text-[10px] border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-500 font-extrabold uppercase bg-slate-900/10">
                  <th className="p-3">Tirage</th>
                  <th className="p-3">Hits</th>
                  <th className="p-3">Cible</th>
                  <th className="p-3">Suggéré</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900">
                {walkForwardStats?.history.slice().reverse().map((item, index) => (
                  <tr key={index} className="hover:bg-slate-900/30 transition-colors">
                    <td className="p-3 font-mono font-bold text-slate-300">{item.date}</td>
                    <td className="p-3 font-mono font-black">
                      <span className={`px-2 py-0.5 rounded-full text-[9px] ${item.hits >= 2 ? 'bg-emerald-500/10 text-emerald-400' : item.hits === 1 ? 'bg-blue-500/10 text-blue-400' : 'bg-slate-800 text-slate-500'}`}>
                        {item.hits} / 5
                      </span>
                    </td>
                    <td className="p-3 font-mono text-slate-300">{item.actual.join(", ")}</td>
                    <td className="p-3 font-mono text-slate-400 flex gap-1">
                      {item.predicted.map((num, i) => (
                        <span key={i} className={`px-1 rounded ${item.actual.includes(num) ? 'bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/20' : 'bg-slate-800 text-slate-500'}`}>
                          {num}
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
