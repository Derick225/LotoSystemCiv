import React, { useMemo } from "react";
import { 
  Activity, 
  TrendingUp, 
  Zap,
  TrendingDown,
} from "lucide-react";
import { ForensicReport } from "../types";
import { formatDateSafely } from "../utils/dateUtils";

interface UnifiedForensicTimelineProps {
  reports: ForensicReport[];
  selectedReport: ForensicReport | null;
  onSelectReport: (report: ForensicReport) => void;
  onDeleteReport: (id: string, e: React.MouseEvent) => void;
}

export const UnifiedForensicTimeline: React.FC<UnifiedForensicTimelineProps> = ({
  reports,
  selectedReport,
  onSelectReport,
  onDeleteReport
}) => {
  // Sort reports chronologically for the timeline graph, but we'll show them reversed or chronologically.
  // Usually, a timeline flows from left (oldest) to right (newest).
  const chronologicalReports = useMemo(() => {
    return [...reports].sort((a, b) => {
      const dateA = new Date(a.date || 0).getTime();
      const dateB = new Date(b.date || 0).getTime();
      return dateA - dateB;
    });
  }, [reports]);

  // Compute trend statistics
  const trendStats = useMemo(() => {
    if (reports.length === 0) return { avgDrift: 0, avgAlignment: 0, trend: "STABLE" };
    
    const totalDrift = reports.reduce((acc, r) => acc + (r.divergenceMetric ?? 0), 0);
    const avgDrift = totalDrift / reports.length;

    const totalAlignment = reports.reduce((acc, r) => {
      const hits = Array.isArray(r.matches) ? r.matches.filter(m => m.errorType === "Hit").length : 0;
      return acc + (hits / 5) * 100;
    }, 0);
    const avgAlignment = totalAlignment / reports.length;

    // Compare first half vs second half to determine trend
    const mid = Math.floor(chronologicalReports.length / 2);
    const firstHalf = chronologicalReports.slice(0, mid);
    const secondHalf = chronologicalReports.slice(mid);

    const firstHalfDrift = firstHalf.length > 0 ? firstHalf.reduce((acc, r) => acc + (r.divergenceMetric ?? 0), 0) / firstHalf.length : 0;
    const secondHalfDrift = secondHalf.length > 0 ? secondHalf.reduce((acc, r) => acc + (r.divergenceMetric ?? 0), 0) / secondHalf.length : 0;

    let trend: "IMPROVING" | "DEGRADING" | "STABLE" = "STABLE";
    if (secondHalfDrift < firstHalfDrift - 2) trend = "IMPROVING"; // Lower drift is better
    else if (secondHalfDrift > firstHalfDrift + 2) trend = "DEGRADING";

    return { avgDrift, avgAlignment, trend };
  }, [reports, chronologicalReports]);

  // SVG dimensions for the fluid trend line
  const width = 800;
  const height = 80;
  const paddingX = 40;
  const paddingY = 15;

  // Generate SVG path for the drift trend curve
  const svgPath = useMemo(() => {
    if (chronologicalReports.length < 2) return "";
    
    const points = chronologicalReports.map((r, idx) => {
      const x = paddingX + (idx / (chronologicalReports.length - 1)) * (width - 2 * paddingX);
      // Map drift score [0, 100] to Y [height - paddingY, paddingY]
      // Lower drift is higher up on the graph (more optimal)
      const driftVal = r.divergenceMetric ?? 40;
      const y = paddingY + (driftVal / 100) * (height - 2 * paddingY);
      return { x, y };
    });

    // Generate Bezier curve
    return points.reduce((acc, p, i) => {
      if (i === 0) return `M ${p.x} ${p.y}`;
      const prev = points[i - 1];
      const cpX1 = prev.x + (p.x - prev.x) / 2;
      const cpY1 = prev.y;
      const cpX2 = prev.x + (p.x - prev.x) / 2;
      const cpY2 = p.y;
      return `${acc} C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${p.x} ${p.y}`;
    }, "");
  }, [chronologicalReports]);

  if (reports.length === 0) {
    return (
      <div className="p-8 bg-slate-50/50 dark:bg-slate-900/10 rounded-3xl border border-dashed border-slate-200 dark:border-slate-800 text-center">
        <p className="text-xs text-slate-500 dark:text-slate-400 italic">Aucun rapport d'autopsie disponible pour la frise chronologique.</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-900 rounded-[2rem] p-6 border border-slate-200/80 dark:border-slate-800/80 shadow-xl space-y-6">
      
      {/* Header Info & Stats Summary */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
        <div>
          <h4 className="text-sm font-black uppercase tracking-widest text-slate-700 dark:text-slate-300 flex items-center gap-2">
            <Activity className="text-indigo-500" size={16} />
            Frise Post-Mortem Unifiée
          </h4>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 font-medium">
            Flux chronologique continu des tirages. Visualisation en temps réel de l'écart de dérive spatiale et de l'alignement physique.
          </p>
        </div>

        {/* Global indicators */}
        <div className="flex items-center gap-4">
          <div className="px-3 py-1.5 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200/60 dark:border-slate-850 text-right">
            <span className="block text-[8px] font-bold text-slate-400 uppercase tracking-widest">Dérive Moyenne</span>
            <span className="text-xs font-black text-slate-700 dark:text-slate-200 font-mono">
              {trendStats.avgDrift.toFixed(1)}%
            </span>
          </div>
          <div className="px-3 py-1.5 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200/60 dark:border-slate-850 text-right">
            <span className="block text-[8px] font-bold text-slate-400 uppercase tracking-widest">Taux d'Alignement</span>
            <span className="text-xs font-black text-emerald-500 font-mono">
              {trendStats.avgAlignment.toFixed(1)}%
            </span>
          </div>
          <div className="px-3 py-1.5 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200/60 dark:border-slate-850 flex items-center gap-1.5">
            {trendStats.trend === "IMPROVING" ? (
              <>
                <TrendingDown className="text-emerald-500 animate-bounce" size={16} />
                <span className="text-[9px] font-black uppercase text-emerald-500 tracking-wider">Dérive en Baisse</span>
              </>
            ) : trendStats.trend === "DEGRADING" ? (
              <>
                <TrendingUp className="text-rose-500 animate-bounce" size={16} />
                <span className="text-[9px] font-black uppercase text-rose-500 tracking-wider">Dérive en Hausse</span>
              </>
            ) : (
              <>
                <Zap className="text-indigo-500" size={14} />
                <span className="text-[9px] font-black uppercase text-indigo-500 tracking-wider">Stable</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Fluid Trend Line Graph */}
      {chronologicalReports.length >= 2 && (
        <div className="relative bg-slate-50/50 dark:bg-slate-950/20 rounded-2xl p-2 border border-slate-100 dark:border-slate-850/50 overflow-hidden">
          <div className="absolute top-2 left-4 text-[8px] font-bold uppercase tracking-widest text-emerald-400 flex items-center gap-1">
            <TrendingDown size={10} /> Alignement optimal (Dérive minimum)
          </div>
          <div className="absolute bottom-2 left-4 text-[8px] font-bold uppercase tracking-widest text-slate-400/70 flex items-center gap-1">
            <TrendingUp size={10} /> Dérive chaotique (Bruit)
          </div>
          
          <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto overflow-visible">
            {/* Background grids */}
            <line x1="0" y1={height / 2} x2={width} y2={height / 2} stroke="currentColor" className="text-slate-100 dark:text-slate-900/50" strokeWidth="1" strokeDasharray="4,4" />
            
            {/* Draw curve path */}
            <path
              d={svgPath}
              fill="none"
              stroke="url(#trend-gradient)"
              strokeWidth="3"
              strokeLinecap="round"
            />
            
            {/* Custom SVG Gradient */}
            <defs>
              <linearGradient id="trend-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#4f46e5" />
                <stop offset="50%" stopColor="#8b5cf6" />
                <stop offset="100%" stopColor="#10b981" />
              </linearGradient>
            </defs>

            {/* Render Nodes along path */}
            {chronologicalReports.map((r, idx) => {
              const x = paddingX + (idx / (chronologicalReports.length - 1)) * (width - 2 * paddingX);
              const driftVal = r.divergenceMetric ?? 40;
              const y = paddingY + (driftVal / 100) * (height - 2 * paddingY);
              const isSelected = selectedReport?.id === r.id;

              return (
                <g key={r.id} className="cursor-pointer group" onClick={() => onSelectReport(r)}>
                  {/* Outer aura on hover/selected */}
                  <circle
                    cx={x}
                    cy={y}
                    r={isSelected ? "8" : "6"}
                    className={`transition-all fill-none ${
                      isSelected 
                        ? "stroke-indigo-500/40 stroke-[4px]" 
                        : "group-hover:stroke-slate-300/30 group-hover:stroke-[3px]"
                    }`}
                  />
                  {/* Core node dot */}
                  <circle
                    cx={x}
                    cy={y}
                    r="4"
                    className={`transition-all duration-300 ${
                      isSelected 
                        ? "fill-indigo-500" 
                        : r.isBlackSwan 
                        ? "fill-rose-500" 
                        : "fill-slate-400 dark:fill-slate-600 group-hover:fill-purple-500"
                    }`}
                  />
                </g>
              );
            })}
          </svg>
        </div>
      )}

      {/* Modern, Horizontal Scrollable Timeline Stream */}
      <div className="overflow-x-auto scrollbar-hide pb-4 -mx-2 px-2">
        <div className="flex gap-4 min-w-max">
          {chronologicalReports.map((rep) => {
            const hits = Array.isArray(rep.matches) ? rep.matches.filter((m) => m.errorType === "Hit").length : 0;
            const isSelected = selectedReport?.id === rep.id;
            
            // Spatial drift score
            const spatialDrift = rep.divergenceMetric ?? 0;
            
            // Determine badge style
            let badgeStyle = "bg-slate-500/10 text-slate-400 border-slate-500/20";
            if (hits === 5) {
              badgeStyle = "bg-emerald-500/15 text-emerald-500 border-emerald-500/25";
            } else if (hits >= 3) {
              badgeStyle = "bg-teal-500/15 text-teal-500 border-teal-500/25";
            } else if (hits > 0) {
              badgeStyle = "bg-indigo-500/15 text-indigo-400 border-indigo-500/25";
            }

            return (
              <div
                key={rep.id}
                onClick={() => onSelectReport(rep)}
                className={`relative p-4 rounded-2xl w-60 border transition-all cursor-pointer flex flex-col justify-between group ${
                  isSelected
                    ? "bg-indigo-50/50 dark:bg-indigo-950/10 border-indigo-500 shadow-lg shadow-indigo-500/5"
                    : "bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-850 hover:border-slate-300 dark:hover:border-slate-700"
                }`}
              >
                {/* Delete button (only visible on group hover) */}
                <button
                  onClick={(e) => onDeleteReport(rep.id, e)}
                  className="absolute top-2 right-2 p-1 text-slate-300 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                  title="Supprimer ce rapport d'audit"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>

                <div className="space-y-3">
                  {/* Draw Name & Date */}
                  <div>
                    <span className="block text-[10px] font-black text-slate-800 dark:text-slate-200 truncate uppercase tracking-tight">
                      {rep.drawName}
                    </span>
                    <span className="block text-[8px] text-slate-400 font-mono mt-0.5">
                      {formatDateSafely(rep.date)}
                    </span>
                  </div>

                  {/* Draw Balls (Compact) */}
                  <div className="flex gap-1">
                    {rep.combo?.slice(0, 5).map((n) => {
                      const isHit = Array.isArray(rep.matches) && rep.matches.some(m => m.predicted === n && m.errorType === "Hit");
                      return (
                        <div
                          key={n}
                          className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-black shadow-sm ${
                            isHit
                              ? "bg-emerald-500 text-white"
                              : "bg-slate-50 dark:bg-slate-900 border border-slate-150 dark:border-slate-800 text-slate-600 dark:text-slate-400"
                          }`}
                        >
                          {n}
                        </div>
                      );
                    })}
                  </div>

                  {/* Drift and Reality Gauges */}
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 dark:border-slate-900 font-mono text-[9px]">
                    <div>
                      <span className="block text-slate-400 font-bold uppercase tracking-wide">Dérive</span>
                      <span className={`font-black ${spatialDrift > 60 ? "text-rose-400" : spatialDrift > 30 ? "text-amber-400" : "text-indigo-400"}`}>
                        {spatialDrift.toFixed(0)}%
                      </span>
                    </div>
                    <div>
                      <span className="block text-slate-400 font-bold uppercase tracking-wide">Précision</span>
                      <span className="font-black text-emerald-500">
                        {hits} / 5
                      </span>
                    </div>
                  </div>
                </div>

                {/* Footer status pill */}
                <div className="mt-4 flex items-center justify-between">
                  <div className={`px-2 py-0.5 rounded text-[8px] font-black border uppercase tracking-wider ${badgeStyle}`}>
                    {hits === 5 ? "PARFAIT" : hits >= 3 ? "ÉLITE" : hits > 0 ? "PARTIEL" : "DÉRIVE"}
                  </div>
                  
                  {rep.isBlackSwan && (
                    <span className="text-[7px] font-black uppercase text-rose-500 dark:text-rose-400 tracking-widest bg-rose-500/10 px-1 rounded border border-rose-500/20 animate-pulse">
                      ⚠️ CYGNE NOIR
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
