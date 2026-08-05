import React, { useMemo } from "react";
import { DrawResult } from "../types";
import {
  Wind,
  AlertTriangle,
  ShieldCheck,
  Gauge,
  Compass,
  Activity,
} from "lucide-react";
import { useNexusStore } from "../store/useNexusStore";

interface ChaosAttractorProps {
  history: DrawResult[];
}

export const ChaosAttractor: React.FC<ChaosAttractorProps> = ({ history }) => {
  const regime = useNexusStore((state) => state.regime);
  const volatility = useNexusStore((state) => state.volatility);

  const turbulence = volatility?.score || 50;
  const weylDiscrepancy = regime?.weylDiscrepancy ?? 0.18;
  const chaosDimension = regime?.chaosDimension ?? 1.84;

  const status = useMemo(() => {
    if (turbulence > 75)
      return {
        label: "TEMPÊTE (Hasard pur)",
        color: "text-rose-500",
        border: "border-rose-500/25",
        bg: "bg-rose-500/10",
        desc: "Le régime est fortement instable. Prédictions sous haute variance.",
        icon: <AlertTriangle className="text-rose-500 animate-pulse" size={20} />,
      };
    if (turbulence > 40)
      return {
        label: "BRÈCHE (Phase variable)",
        color: "text-indigo-400",
        border: "border-indigo-500/25",
        bg: "bg-indigo-500/10",
        desc: "Le système alterne entre régularité markovienne et résurgence chaotique.",
        icon: <Wind className="text-indigo-400" size={20} />,
      };
    return {
      label: "CALME (Attracteur stable)",
      color: "text-emerald-500",
      border: "border-emerald-500/25",
      bg: "bg-emerald-500/10",
      desc: "Les orbites de phase sont bien définies. Alignement optimal pour l'IA.",
      icon: <ShieldCheck className="text-emerald-500" size={20} />,
    };
  }, [turbulence]);

  return (
    <div className="bg-slate-950 rounded-3xl border border-slate-800 shadow-2xl relative overflow-hidden p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-center gap-3 border-b border-slate-900 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-500/10 rounded-xl border border-indigo-500/20">
            <Gauge size={18} className="text-indigo-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-white uppercase tracking-widest">
                Analyse de Phase Chaotique
              </span>
              <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                Métriques Temps-Réel
              </span>
            </div>
            <p className="text-[10px] text-slate-500">
              Diagnostic cybernétique continu du régime des tirages
            </p>
          </div>
        </div>

        <div
          className={`px-2.5 py-1 rounded-xl text-[9px] font-bold ${status.bg} ${status.color} border ${status.border} flex items-center gap-1.5`}
        >
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-current opacity-75"></span>
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-current"></span>
          </span>
          {status.label}
        </div>
      </div>

      {/* Main Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
        {/* Status Indicator Card */}
        <div className="bg-slate-900/40 border border-slate-900 p-4 rounded-2xl flex items-start gap-4">
          <div className="p-2.5 bg-slate-950 rounded-xl">
            {status.icon}
          </div>
          <div>
            <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest leading-none">
              État du Système
            </div>
            <div className={`text-sm font-black mt-1 ${status.color}`}>
              {status.label}
            </div>
            <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
              {status.desc}
            </p>
          </div>
        </div>

        {/* Weyl Discrepancy Card */}
        <div className="bg-slate-900/40 border border-slate-900 p-4 rounded-2xl flex items-start gap-4">
          <div className="p-2.5 bg-slate-950 rounded-xl text-indigo-400">
            <Compass size={20} />
          </div>
          <div>
            <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest leading-none">
              Discrépance Weyl (W)
            </div>
            <div className="text-sm font-black font-mono text-slate-200 mt-1">
              {weylDiscrepancy.toFixed(4)}
            </div>
            <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
              Mesure l'écart à l'équirépartition asymptotique des tirages. Une valeur basse indique une régularité mathématique.
            </p>
          </div>
        </div>

        {/* GP Dimension Card */}
        <div className="bg-slate-900/40 border border-slate-900 p-4 rounded-2xl flex items-start gap-4">
          <div className="p-2.5 bg-slate-950 rounded-xl text-violet-400">
            <Activity size={20} />
          </div>
          <div>
            <div className="text-[8px] font-black text-slate-500 uppercase tracking-widest leading-none">
              Dimension GP (ν)
            </div>
            <div className="text-sm font-black font-mono text-slate-200 mt-1">
              {chaosDimension.toFixed(3)}
            </div>
            <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
              Dimension fractale de Grassberger-Procaccia. Évalue la complexité géométrique de l'espace de phase.
            </p>
          </div>
        </div>
      </div>

      {/* Turbulence Meter Slider */}
      <div className="space-y-2 pt-4 border-t border-slate-900">
        <div className="flex justify-between items-center text-[9px] font-black text-slate-400 uppercase tracking-wider">
          <span>Stabilité Globale du Flux Chaotique</span>
          <span className="font-mono text-slate-200 text-xs font-black">
            {turbulence.toFixed(0)}%
          </span>
        </div>
        <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden p-0.5">
          <div
            className="h-full rounded-full transition-all duration-1000"
            style={{
              width: `${Math.min(100, Math.max(0, turbulence))}%`,
              backgroundColor: `hsl(${120 - Math.min(100, turbulence) * 1.2}, 85%, 50%)`,
            }}
          ></div>
        </div>
        <div className="flex justify-between text-[8px] font-bold uppercase tracking-widest text-slate-500">
          <span>Stabilité Maximale (0%)</span>
          <span>Instabilité Totale (100%)</span>
        </div>
      </div>
    </div>
  );
};
