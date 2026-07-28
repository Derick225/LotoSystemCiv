import React from "react";
import { ActivationLayerMap } from "../../services/training/multiHeadNeuralCore";
import { Activity, Cpu, Sparkles, Zap, Network } from "lucide-react";

interface TensorBoardActivationGridProps {
  activationsLayers: ActivationLayerMap[];
  currentEpoch: number;
  totalEpochs: number;
  learningRate: number;
  wassersteinLoss: number;
  topDriverFeature?: string;
  isTraining: boolean;
}

export const TensorBoardActivationGrid: React.FC<
  TensorBoardActivationGridProps
> = ({
  activationsLayers,
  currentEpoch,
  totalEpochs,
  learningRate,
  wassersteinLoss,
  topDriverFeature = "frequency",
  isTraining,
}) => {
  return (
    <div className="bg-slate-900/90 border border-indigo-500/30 rounded-2xl p-5 text-slate-100 shadow-2xl backdrop-blur-md space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/40">
            <Cpu className={`size-5 ${isTraining ? "animate-spin" : ""}`} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-black text-white tracking-wide uppercase">
                Tensor Board Multi-Head
              </h3>
              <span
                className={`px-2 py-0.5 rounded-full text-[9px] font-mono font-bold ${isTraining ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 animate-pulse" : "bg-slate-800 text-slate-400"}`}
              >
                {isTraining ? "TRAINING LIVE" : "IDLE / CONVERGED"}
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Heatmap des cartes d'activation neuronniques & Perte de
              Wasserstein
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 font-mono text-xs">
          <div className="bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800 flex items-center gap-2">
            <span className="text-[10px] text-slate-500">Époque:</span>
            <span className="text-indigo-400 font-bold">
              {currentEpoch} / {totalEpochs}
            </span>
          </div>
          <div className="bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800 flex items-center gap-2">
            <span className="text-[10px] text-slate-500">Dyn LR (η):</span>
            <span className="text-emerald-400 font-bold">
              {learningRate.toFixed(5)}
            </span>
          </div>
          <div className="bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800 flex items-center gap-2">
            <span className="text-[10px] text-slate-500">
              Wasserstein Loss:
            </span>
            <span className="text-amber-400 font-bold">
              {wassersteinLoss.toFixed(4)}
            </span>
          </div>
        </div>
      </div>

      {/* Feature Attribution Badge */}
      <div className="flex items-center justify-between bg-indigo-950/40 border border-indigo-500/20 px-3 py-2 rounded-xl text-xs">
        <span className="text-indigo-300 font-medium flex items-center gap-1.5">
          <Sparkles className="size-3.5 text-amber-400" />
          Driver Majeur SHAP / Integrated Gradients :
        </span>
        <span className="font-mono font-bold text-amber-300 uppercase bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/30">
          {topDriverFeature}
        </span>
      </div>

      {/* Layer Activation Grids */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {activationsLayers.map((layer) => {
          const acts = layer.activations || [];
          const maxVal = Math.max(...acts.map(Math.abs), 0.001);

          return (
            <div
              key={layer.layerIndex}
              className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 space-y-2"
            >
              <div className="flex items-center justify-between text-[11px] font-mono text-slate-300 border-b border-slate-800/80 pb-1.5">
                <span className="font-bold text-indigo-400 flex items-center gap-1">
                  <Network className="size-3" /> {layer.name}
                </span>
                <span className="text-[10px] text-slate-500">
                  {acts.length} units
                </span>
              </div>

              {/* Activation Heatmap Grid */}
              <div className="grid grid-cols-8 gap-1 pt-1">
                {acts.slice(0, 32).map((val, idx) => {
                  const normalized = Math.min(1.0, Math.abs(val) / maxVal);
                  // Color interpolation from cold dark blue to hot glowing cyan/emerald
                  const bgIntensity = Math.round(normalized * 255);
                  const opacity = Math.max(0.2, normalized);

                  return (
                    <div
                      key={idx}
                      title={`Unit ${idx + 1}: ${val.toFixed(4)}`}
                      className="h-5 rounded border border-slate-800 transition-all duration-300 flex items-center justify-center text-[8px] font-mono font-bold"
                      style={{
                        backgroundColor: `rgba(99, 102, 241, ${opacity})`,
                        borderColor:
                          normalized > 0.7
                            ? "#10b981"
                            : "rgba(255,255,255,0.1)",
                        color: normalized > 0.5 ? "#ffffff" : "#94a3b8",
                      }}
                    >
                      {Math.round(normalized * 99)}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
