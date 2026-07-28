import React, { useMemo, memo } from "react";
import { Thermometer } from "lucide-react";

interface ProbabilityFieldProps {
  scores: Record<number, number>;
}

// Composant Cellule mémoïsé pour la performance HPC
const GridCell = memo(({ num, score }: { num: number; score: number }) => {
  const getStatus = (s: number) => {
    if (s > 85)
      return {
        label: "SURCHAUFFE",
        color: "text-white",
        bg: "bg-rose-500",
        border: "border-rose-600",
      };
    if (s > 65)
      return {
        label: "ATTRACTEUR",
        color: "text-white",
        bg: "bg-indigo-600",
        border: "border-indigo-700",
      };
    if (s < 25)
      return {
        label: "ZONE MORTE",
        color: "text-slate-400",
        bg: "bg-slate-50",
        border: "border-slate-100",
      };
    return {
      label: "STABLE",
      color: "text-slate-600",
      bg: "bg-slate-100",
      border: "border-slate-200",
    };
  };

  const status = getStatus(score);
  const isHot = score > 85;

  return (
    <div
      className={`
                aspect-square rounded-md md:rounded-xl flex items-center justify-center text-[10px] sm:text-xs md:text-xs font-black transition-all duration-500 cursor-help border
                ${status.bg} ${status.border} ${status.color}
                ${isHot ? "animate-pulse shadow-lg z-10" : "hover:scale-110 shadow-sm"}
            `}
      title={`${status.label} : ${score}%`}
    >
      {num}
    </div>
  );
});

export const ProbabilityField: React.FC<ProbabilityFieldProps> = ({
  scores,
}) => {
  const numbers = useMemo(
    () => Array.from({ length: 90 }, (_, i) => i + 1),
    [],
  );

  return (
    <div className="space-y-4 md:space-y-8 animate-fade-in w-full overflow-hidden">
      {/* Légende */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-4">
        {[
          { type: "CHAUD", desc: "Tension max", color: "bg-rose-500" },
          { type: "SIGNAL", desc: "Forte proba", color: "bg-indigo-600" },
          { type: "STABLE", desc: "Rythme normal", color: "bg-slate-200" },
          { type: "FROID", desc: "Zone morte", color: "bg-slate-50" },
        ].map((item) => (
          <div
            key={item.type}
            className="p-2 md:p-3 bg-white rounded-xl md:rounded-2xl border border-slate-200 flex items-center gap-2 md:gap-3 shadow-sm"
          >
            <div
              className={`w-2 h-2 md:w-3 md:h-3 rounded-full ${item.color} shadow-sm shrink-0`}
            ></div>
            <div className="min-w-0 overflow-hidden">
              <div className="text-[10px] md:text-xs font-black text-slate-800 uppercase truncate">
                {item.type}
              </div>
              <div className="text-[10px] md:text-[10px] text-slate-500 uppercase truncate">
                {item.desc}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Matrice de Pression - FOND BLANC HAUTE VISIBILITÉ */}
      <div className="bg-white p-2 sm:p-4 md:p-8 rounded-2xl md:rounded-3xl border border-slate-200 shadow-2xl relative overflow-hidden">
        <div className="flex justify-between items-center mb-4 md:mb-6">
          <div className="flex items-center gap-2">
            <Thermometer className="text-indigo-600" size={16} />
            <h4 className="text-slate-800 font-black text-[10px] md:text-sm uppercase tracking-widest">
              Pression Thermique Matrix
            </h4>
          </div>
        </div>

        <div className="grid grid-cols-10 gap-1 md:gap-3 relative z-10">
          {numbers.map((n) => (
            <GridCell key={n} num={n} score={scores[n] || 0} />
          ))}
        </div>

        {/* Subtle grid background for aesthetic */}
        <div className="absolute inset-0 grid grid-cols-10 grid-rows-9 opacity-[0.02] pointer-events-none">
          {Array.from({ length: 90 }).map((_, i) => (
            <div key={i} className="border border-slate-900"></div>
          ))}
        </div>
      </div>
    </div>
  );
};
