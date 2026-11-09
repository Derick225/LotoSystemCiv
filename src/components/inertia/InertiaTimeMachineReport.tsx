import React, { memo } from "react";
import { CheckCircle2, Zap, AlertCircle } from "lucide-react";
import {
  InertiaBacktestResult,
  INERTIA_DAMPING_DOMAIN,
} from "../../services/prediction/systemInertiaEngine";
import { DampingSweepVerdict } from "../../hooks/useInertiaCybernetics";

export interface InertiaTimeMachineReportProps {
  backtestStats: InertiaBacktestResult;
  drawName: string;
  dampingRatio: number;
  dampingSweepVerdict: DampingSweepVerdict | null;
  onClose: () => void;
  onApplyOptimalDamping: () => void;
}

export const InertiaTimeMachineReport: React.FC<InertiaTimeMachineReportProps> = memo(
  ({
    backtestStats,
    drawName,
    dampingRatio,
    dampingSweepVerdict,
    onClose,
    onApplyOptimalDamping,
  }) => {
    return (
      <div className="bg-slate-900/80 backdrop-blur-md rounded-[2rem] p-6 border border-cyan-500/20 space-y-6 shadow-2xl">
        <div className="flex justify-between items-start border-b border-white/10 pb-3">
          <div>
            <h4 className="text-xs font-black text-pink-400 uppercase tracking-widest flex items-center gap-1.5 font-sans">
              <CheckCircle2 size={15} /> Rétro-Audit Temporel de l'Inertie (Time Machine)
            </h4>
            <p className="text-[10px] text-slate-400 mt-0.5 font-sans">
              Évaluation empirique rétroactive étape par étape sur les{" "}
              <strong>{backtestStats.trials}</strong> tirages réels précédents sans biais prospectif.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white text-[10px] font-bold uppercase tracking-wider font-mono px-3 py-1 bg-slate-950/60 rounded-lg hover:bg-slate-950 border border-white/10 cursor-pointer"
          >
            Fermer le Diagnostic
          </button>
        </div>

        {/* Backtest Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Summary Card */}
          <div className="bg-slate-950/60 p-4 rounded-2xl border border-white/5 space-y-3 flex flex-col justify-between">
            <div>
              <span className="text-[8px] font-black uppercase text-slate-500 tracking-wider block">
                Performance Empirique
              </span>
              <h5 className="text-lg font-black text-white tracking-tight mt-0.5">
                Validation Rétro-Active
              </h5>
            </div>
            <div className="space-y-1.5 bg-white/5 p-3 rounded-xl border border-white/5">
              <div className="flex justify-between text-[10px] font-mono">
                <span className="text-slate-400">Taux de Succès (≥1) :</span>
                <strong className="text-emerald-400 font-black">
                  {backtestStats.successRate}%
                </strong>
              </div>
              <div className="flex justify-between text-[10px] font-mono">
                <span className="text-slate-400">Hasard pur (≥1) :</span>
                <strong className="text-slate-300 font-black">
                  {backtestStats.nullSuccessRate}%
                </strong>
              </div>
              <div className="flex justify-between text-[10px] font-mono">
                <span className="text-slate-400">Hits Moyens :</span>
                <strong className="text-cyan-400 font-black">
                  {backtestStats.primaryHitsAvg} / 5
                </strong>
              </div>
              <div className="flex justify-between text-[10px] font-mono">
                <span className="text-slate-400">Gain vs Hasard :</span>
                <strong className="text-amber-400 font-black">
                  {backtestStats.empiricalGain}x
                </strong>
              </div>
              <div className="flex justify-between text-[10px] font-mono">
                <span className="text-slate-400">p-value (≥1 bon) :</span>
                <strong className="text-slate-200 font-black">
                  {backtestStats.successPValue === null
                    ? "n/d"
                    : backtestStats.successPValue.toFixed(3)}
                </strong>
              </div>
            </div>
            <span className="text-[8px] font-mono text-slate-500 leading-normal block">
              Rétropolation déterministe isolée respectant la causalité temporelle stricte.
              {backtestStats.successPValue === null
                ? " p-value non calculable sur cet échantillon."
                : " p-value unilatérale exacte sous tirage équitable, référence hypergéométrique exacte ci-dessus."}
            </span>
          </div>

          {/* Detailed retro events listing */}
          <div className="lg:col-span-3 bg-slate-950/40 p-4 rounded-xl border border-white/5 space-y-3 max-h-[190px] overflow-y-auto">
            <span className="text-[8px] font-black uppercase text-slate-500 tracking-wider block pb-1 border-b border-white/5">
              Détail Chronologique des Évaluations Rétro-Actives
            </span>
            <div className="space-y-2">
              {backtestStats.details.map((trial, idx) => (
                <div
                  key={`ret-tr-${idx}`}
                  className="flex justify-between items-center text-[10px] pb-1.5 border-b border-white/5 last:border-b-0"
                >
                  <span className="font-bold text-slate-300 font-mono truncate max-w-[120px]">
                    {trial.drawDate}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-500 font-mono text-[9px]">Gagnants :</span>
                    <div className="flex gap-1">
                      {trial.winners.map((win: number) => {
                        const isHit = trial.matched.includes(win);
                        return (
                          <span
                            key={`win-node-${win}`}
                            className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold ${
                              isHit
                                ? "bg-cyan-500 text-slate-950 border border-cyan-300 font-black"
                                : "bg-slate-900 border border-white/5 text-slate-400"
                            }`}
                          >
                            {String(win).padStart(2, "0")}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                  <span
                    className={`font-mono text-xs font-black ${
                      trial.hits > 0 ? "text-emerald-400" : "text-slate-600"
                    }`}
                  >
                    +{trial.hits} Hit{trial.hits > 1 ? "s" : ""}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Auto-adaptive second-order damping banner */}
        <div className="p-4 bg-gradient-to-r from-pink-950/30 via-slate-900/60 to-cyan-950/30 rounded-2xl border border-pink-500/30 flex flex-col md:flex-row items-start md:items-center justify-between text-[10px] gap-4 shadow-xl">
          <div className="space-y-1.5 max-w-xl">
            <div className="flex items-center gap-2">
              <span className="p-1 bg-pink-500/20 text-pink-300 rounded-md">
                <Zap size={13} />
              </span>
              <span className="font-sans font-black uppercase tracking-wider text-white text-[11px]">
                Calibration Auto-Adaptative du Second Ordre
              </span>
              <span className="text-[9px] font-mono text-cyan-300 bg-slate-950 px-2 py-0.5 rounded border border-cyan-500/20">
                {drawName}
              </span>
            </div>
            <p className="text-slate-300 text-[10px] leading-relaxed">
              Balayage exhaustif des{" "}
              <strong className="text-cyan-300">{backtestStats.dampingCandidatesEvaluated}</strong>{" "}
              valeurs de ζ de la grille ({INERTIA_DAMPING_DOMAIN.min.toFixed(2)} →{" "}
              {INERTIA_DAMPING_DOMAIN.max.toFixed(2)}) sur la fenêtre rétro-active de{" "}
              <strong className="text-cyan-300">{drawName}</strong> : optimum mesuré à{" "}
              <strong className="text-pink-400 font-mono">
                ζ = {backtestStats.bestDamping.toFixed(2)}
              </strong>{" "}
              ({backtestStats.bestDampingHits} hits) contre{" "}
              <strong className="font-mono text-slate-300">{backtestStats.currentDampingHits}</strong>{" "}
              hits à la calibration en vigueur (ζ = {dampingRatio.toFixed(2)}).
              {dampingSweepVerdict && dampingSweepVerdict.improved
                ? ` Gain mesuré : +${dampingSweepVerdict.deltaHits} hit(s) rétro-actif(s).`
                : " Aucun gain mesuré sur cette fenêtre : l'écart au hasard pur n'est pas distinguable ici."}
            </p>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto justify-end flex-wrap">
            <div className="flex flex-col items-end">
              <span className="text-[8px] font-mono uppercase text-slate-400 tracking-wider">
                Amortissement mesuré
              </span>
              <span className="font-mono font-black text-pink-400 text-sm tracking-wider">
                ζ_balayage = {backtestStats.bestDamping.toFixed(2)}
              </span>
            </div>

            {dampingSweepVerdict?.atGridPoint ? (
              <div className="px-4 py-2.5 bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-lg shadow-emerald-950/30">
                <CheckCircle2 size={14} className="text-emerald-400" />
                <span>ζ_balayage Actif &amp; Mémorisé</span>
              </div>
            ) : dampingSweepVerdict?.improved ? (
              <button
                id="btn-apply-optimal-damping"
                onClick={onApplyOptimalDamping}
                className="px-5 py-2.5 bg-gradient-to-r from-pink-600 via-purple-600 to-cyan-600 hover:from-pink-500 hover:to-cyan-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 transition-all duration-300 hover:scale-105 shadow-xl shadow-pink-600/30 border border-pink-400/40 cursor-pointer active:scale-95"
                title={`Appliquer ζ = ${backtestStats.bestDamping.toFixed(2)} (mesuré à ${backtestStats.bestDampingHits} hits contre ${backtestStats.currentDampingHits} actuellement) et le mémoriser pour ${drawName}`}
              >
                <Zap size={14} className="text-white" />
                <span>
                  Appliquer ζ_balayage ({backtestStats.bestDamping.toFixed(2)}) au Moteur
                </span>
              </button>
            ) : (
              <div className="px-4 py-2.5 bg-slate-950/70 border border-white/10 text-slate-400 rounded-xl text-[10px] font-bold uppercase tracking-widest flex items-center gap-2">
                <AlertCircle size={14} className="text-slate-500" />
                <span>Aucun gain mesuré — calibration conservée</span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
);

InertiaTimeMachineReport.displayName = "InertiaTimeMachineReport";
