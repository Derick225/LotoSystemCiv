import React, { useMemo } from "react";
import type { ScoreBreakdown } from "../types";
import { Activity, Zap } from "lucide-react";
import { useNexusStore } from "../store/useNexusStore";

interface NeuralHeatmapGridProps {
  breakdown?: Record<number, ScoreBreakdown>;
  suggestedNumbers: number[];
}

export const NeuralHeatmapGrid: React.FC<NeuralHeatmapGridProps> = React.memo(
  ({ breakdown, suggestedNumbers }) => {
    const setHoveredNumber = useNexusStore((state) => state.setHoveredNumber);

    const grid = useMemo(() => {
      return Array.from({ length: 90 }, (_, i) => {
        const num = i + 1;
        const scores = breakdown?.[num];
        if (!scores) return { num, intensity: 0, topAlgo: "N/A" };

        let sum = 0;
        let count = 0;
        Object.values(scores).forEach((val) => {
          if (typeof val === "number") {
            sum += val;
            count++;
          }
        });
        const avg = count > 0 ? sum / count : 0;

        let maxScore = -1;
        let topAlgo = "Consensus";
        Object.entries(scores).forEach(([key, val]) => {
          if (typeof val === "number" && val > maxScore) {
            maxScore = val;
            topAlgo = key;
          }
        });

        return {
          num,
          intensity: avg,
          topAlgo: topAlgo.charAt(0).toUpperCase() + topAlgo.slice(1),
        };
      });
    }, [breakdown]);

    return (
      <div className="glass-card p-4 sm:p-6 md:p-8 rounded-3xl neural-border shadow-2xl relative overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.03] z-20"
          style={{
            backgroundImage:
              "linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.25) 50%), linear-gradient(90deg, rgba(255, 0, 0, 0.06), rgba(0, 255, 0, 0.02), rgba(0, 0, 255, 0.06))",
            backgroundSize: "100% 2px, 3px 100%",
          }}
        ></div>

        <div className="flex justify-between items-end mb-8 relative z-10 px-2 gap-4">
          <div>
            <h4 className="text-sm font-black text-white uppercase tracking-[0.2em] flex items-center gap-3">
              <Activity className="text-indigo-400" size={18} /> Matrice
              Tensorielle 1-90
            </h4>
            <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">
              Séquençage des points chauds par fusion d'algorithmes (Cliquez
              pour Analyse)
            </p>
          </div>
        </div>

        <div className="grid grid-cols-10 gap-1 sm:gap-2 md:gap-3 relative z-10">
          {grid.map((cell) => {
            const isSuggested = suggestedNumbers.includes(cell.num);
            const colorIntensity = Math.min(1, cell.intensity / 100);

            return (
              <div
                key={cell.num}
                onClick={() => setHoveredNumber(cell.num)}
                className={`
                                aspect-square rounded-md sm:rounded-xl flex items-center justify-center text-[8px] xs:text-[10px] md:text-xs font-black transition-all duration-500 relative group border cursor-pointer
                                ${
                                  isSuggested
                                    ? "bg-gradient-to-br from-indigo-600 to-indigo-700 text-white border-indigo-400 scale-110 z-10 shadow-[0_0_15px_rgba(99,102,241,0.5)]"
                                    : "text-slate-400 bg-slate-900/50 border-white/5 hover:border-indigo-400 hover:shadow-[0_0_10px_rgba(99,102,241,0.3)] hover:z-10 hover:text-white"
                                }
                            `}
                style={{
                  backgroundColor: isSuggested
                    ? undefined
                    : `rgba(79, 70, 229, ${colorIntensity * 0.25})`,
                  borderColor: isSuggested
                    ? undefined
                    : `rgba(99, 102, 241, ${colorIntensity * 0.5})`,
                }}
              >
                {cell.num}

                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 hidden group-hover:block z-50 pointer-events-none animate-scale-in">
                  <div className="bg-slate-900/95 backdrop-blur-xl text-white p-4 rounded-2xl shadow-2xl min-w-[160px] border border-indigo-500/50">
                    <div className="flex justify-between items-center mb-3">
                      <div className="text-[10px] font-black uppercase text-indigo-400">
                        Vecteur #{cell.num}
                      </div>
                      <div className="p-1 bg-white/10 rounded-lg">
                        <Zap size={10} className="text-amber-400" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold text-slate-500 uppercase">
                          Probabilité
                        </span>
                        <span className="text-sm font-black text-white">
                          {Math.round(cell.intensity)}%
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold text-slate-500 uppercase">
                          Dominance
                        </span>
                        <span className="text-xs font-bold text-indigo-300">
                          {cell.topAlgo}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-12 flex flex-wrap justify-center gap-8 border-t border-white/5 pt-10 relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-4 h-4 rounded-md bg-indigo-600 shadow-md shadow-indigo-600/20 ring-1 ring-white/20"></div>
            <div className="flex flex-col">
              <span className="text-[10px] font-black text-white uppercase tracking-widest leading-none">
                Top Inférence
              </span>
              <span className="text-[10px] text-slate-400 font-bold mt-1">
                Cible IA Prioritaire
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-4 h-4 rounded-md bg-indigo-900/30 ring-1 ring-indigo-500/50"></div>
            <div className="flex flex-col">
              <span className="text-[10px] font-black text-white uppercase tracking-widest leading-none">
                Activité Haute
              </span>
              <span className="text-[10px] text-slate-400 font-bold mt-1">
                Pression Stochastique
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-4 h-4 rounded-md bg-slate-900/50 border border-white/10"></div>
            <div className="flex flex-col">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">
                Stable / Froid
              </span>
              <span className="text-[10px] text-slate-400 font-bold mt-1">
                Bruit de fond
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  },
);
