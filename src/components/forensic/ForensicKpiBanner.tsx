import React, { memo } from "react";
import { TrendingUp, TrendingDown, BarChart3 } from "lucide-react";

export interface ForensicKpiStats {
  totalAudits: number;
  avgHits: number;
  medianHits: number;
  stdDevHits: number;
  trend: number;
  perfectRate: number;
}

export interface ForensicKpiBannerProps {
  stats: ForensicKpiStats;
  pendingCount: number;
}

export const ForensicKpiBanner: React.FC<ForensicKpiBannerProps> = memo(
  ({ stats, pendingCount }) => {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="p-4 bg-slate-900/60 rounded-2xl border border-slate-800 flex flex-col justify-between">
          <span className="text-[10px] font-black uppercase text-slate-400">Total Autopsies</span>
          <span className="text-2xl font-black font-mono text-white mt-1">
            {stats.totalAudits}
          </span>
        </div>
        <div className="p-4 bg-slate-900/60 rounded-2xl border border-slate-800 flex flex-col justify-between">
          <span className="text-[10px] font-black uppercase text-slate-400">Moy. Concordance</span>
          <span className="text-2xl font-black font-mono text-emerald-400 mt-1">
            {stats.avgHits.toFixed(2)} / 5
          </span>
        </div>
        <div className="p-4 bg-slate-900/60 rounded-2xl border border-slate-800 flex flex-col justify-between">
          <span className="text-[10px] font-black uppercase text-slate-400">Médiane / σ</span>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-xl font-black font-mono text-cyan-400">
              {stats.medianHits.toFixed(1)}
            </span>
            <span className="text-xs font-bold text-slate-500 font-mono">
              ±{stats.stdDevHits.toFixed(2)}
            </span>
          </div>
        </div>
        <div className="p-4 bg-slate-900/60 rounded-2xl border border-slate-800 flex flex-col justify-between">
          <span className="text-[10px] font-black uppercase text-slate-400">Tendance</span>
          <div className="flex items-center gap-2 mt-1">
            {stats.trend > 0.1 ? (
              <TrendingUp size={18} className="text-emerald-400" />
            ) : stats.trend < -0.1 ? (
              <TrendingDown size={18} className="text-rose-400" />
            ) : (
              <BarChart3 size={18} className="text-slate-400" />
            )}
            <span
              className={`text-lg font-black font-mono ${
                stats.trend > 0.1
                  ? "text-emerald-400"
                  : stats.trend < -0.1
                  ? "text-rose-400"
                  : "text-slate-400"
              }`}
            >
              {stats.trend > 0 ? "+" : ""}
              {(stats.trend * 100).toFixed(0)}%
            </span>
          </div>
        </div>
        <div className="p-4 bg-slate-900/60 rounded-2xl border border-slate-800 flex flex-col justify-between">
          <span className="text-[10px] font-black uppercase text-slate-400">En Attente</span>
          <span className="text-2xl font-black font-mono text-indigo-400 mt-1">
            {pendingCount}
          </span>
        </div>
        <div className="p-4 bg-slate-900/60 rounded-2xl border border-slate-800 flex flex-col justify-between">
          <span className="text-[10px] font-black uppercase text-slate-400">Parfait (5/5)</span>
          <span className="text-2xl font-black font-mono text-teal-400 mt-1">
            {stats.perfectRate.toFixed(1)}%
          </span>
        </div>
      </div>
    );
  }
);

ForensicKpiBanner.displayName = "ForensicKpiBanner";
