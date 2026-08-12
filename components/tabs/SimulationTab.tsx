import React, { useState } from "react";
import { useNexusStore } from "../../store/useNexusStore";
import {
  Activity,
  TrendingUp,
  Dna,
  Repeat,
  Sliders,
} from "lucide-react";
import { ParallelSimulationTab } from "./ParallelSimulationTab";
import { DeterministicReplayInspector } from "../DeterministicReplayInspector";
import { WhatIfSimulatorTab } from "./WhatIfSimulatorTab";
import { SingleBacktestTab } from "./backtest/SingleBacktestTab";
import { WalkForwardTab } from "./backtest/WalkForwardTab";
import { audioEngine } from "../../utils/audioEngine";

export const SimulationTab: React.FC<{ drawName: string }> = React.memo(
  ({ drawName }) => {
    const history = useNexusStore((state) => state.history);
    const globalWeights = useNexusStore((state) => state.globalWeights);
    const nexusLoading = useNexusStore((state) => state.loading);
    const [mode, setMode] = useState<
      "single" | "comparative" | "walkforward" | "replay" | "whatif"
    >("single");

    if (nexusLoading) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-6 animate-pulse">
          <Activity className="text-indigo-500 animate-spin" size={48} />
          <p className="text-xs font-black uppercase tracking-[0.3em] text-slate-400">
            Synchronisation Temporelle...
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-8 animate-fade-in pb-16 w-full">
        {/* Mode Switcher */}
        <div className="flex justify-center mb-4">
          <div className="flex bg-slate-900 p-1.5 rounded-2xl border border-slate-800 shadow-inner overflow-x-auto max-w-full">
            <button
              onClick={() => {
                audioEngine.play("click");
                setMode("single");
              }}
              className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase transition-all flex items-center gap-2 shrink-0 ${
                mode === "single"
                  ? "bg-white text-slate-900 shadow-lg"
                  : "text-slate-500 hover:text-white"
              }`}
            >
              <Activity size={14} /> Backtest Standard
            </button>
            <button
              onClick={() => {
                audioEngine.play("click");
                setMode("comparative");
              }}
              className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase transition-all flex items-center gap-2 shrink-0 ${
                mode === "comparative"
                  ? "bg-indigo-600 text-white shadow-lg"
                  : "text-slate-500 hover:text-white"
              }`}
            >
              <TrendingUp size={14} /> Comparateur Stratégique
            </button>
            <button
              onClick={() => {
                audioEngine.play("click");
                setMode("walkforward");
              }}
              className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase transition-all flex items-center gap-2 shrink-0 ${
                mode === "walkforward"
                  ? "bg-indigo-600 text-white shadow-lg"
                  : "text-slate-500 hover:text-white"
              }`}
            >
              <Dna size={14} /> Walk-Forward & MC
            </button>
            <button
              onClick={() => {
                audioEngine.play("click");
                setMode("replay");
              }}
              className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase transition-all flex items-center gap-2 shrink-0 ${
                mode === "replay"
                  ? "bg-indigo-600 text-white shadow-lg"
                  : "text-slate-500 hover:text-white"
              }`}
            >
              <Repeat size={14} /> Replay Déterministe
            </button>
            <button
              onClick={() => {
                audioEngine.play("click");
                setMode("whatif");
              }}
              className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase transition-all flex items-center gap-2 shrink-0 ${
                mode === "whatif"
                  ? "bg-indigo-600 text-white shadow-lg"
                  : "text-slate-500 hover:text-white"
              }`}
            >
              <Sliders size={14} /> Simulateur What-If
            </button>
          </div>
        </div>

        {/* Tab Content Router */}
        <div className="relative">
          {mode === "single" && (
            <div className="animate-slide-up">
              <SingleBacktestTab
                drawName={drawName}
                history={history}
                globalWeights={globalWeights}
              />
            </div>
          )}

          {mode === "comparative" && (
            <div className="animate-slide-up">
              <ParallelSimulationTab />
            </div>
          )}

          {mode === "walkforward" && (
            <div className="animate-slide-up">
              <WalkForwardTab
                drawName={drawName}
                history={history}
                globalWeights={globalWeights}
              />
            </div>
          )}

          {mode === "replay" && (
            <div className="animate-slide-up">
              <DeterministicReplayInspector drawName={drawName} />
            </div>
          )}

          {mode === "whatif" && (
            <div className="animate-slide-up">
              <WhatIfSimulatorTab drawName={drawName} />
            </div>
          )}
        </div>
      </div>
    );
  }
);
