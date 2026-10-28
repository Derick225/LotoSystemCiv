import React from "react";
import {
  Scale,
  Waves,
  Activity,
  Cpu,
} from "lucide-react";
import type { MarkowitzPortfolioReport } from "../../services/prediction/markowitzKellyPortfolioService";
import type { KalmanRegimeState } from "../../services/prediction/stochasticKalmanRegimeService";
import type { SpatioTemporalHawkesReport } from "../../services/prediction/spatioTemporalHawkes2DService";
import { NumberBall } from "../NumberBall";

interface PlatinumStochasticModelCardProps {
  markowitz?: MarkowitzPortfolioReport;
  kalman?: KalmanRegimeState;
  hawkes?: SpatioTemporalHawkesReport;
  selectedScenarioId?: string | null;
  onSelectScenarioId?: (id: string) => void;
}

export const PlatinumStochasticModelCard: React.FC<PlatinumStochasticModelCardProps> = ({
  markowitz,
  kalman,
  hawkes,
  selectedScenarioId,
  onSelectScenarioId,
}) => {
  if (!markowitz && !kalman && !hawkes) {
    return null;
  }

  const isBreakDetected = (kalman?.regimeBreakIntensity ?? 0) > 0.5;

  return (
    <div className="bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl relative overflow-hidden">
      {/* Decorative gradient flare */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-white/5 pb-4 relative z-10">
        <div>
          <div className="flex items-center gap-2 text-indigo-400 text-xs font-black uppercase tracking-widest">
            <Cpu size={15} />
            <span>Axe II : Rigueur Mathématique &amp; Inférence Continue</span>
            <span className="bg-indigo-500/20 text-indigo-300 text-[9px] px-2 py-0.5 rounded-full border border-indigo-500/30">
              AGENTS.md C∞
            </span>
          </div>
          <h3 className="text-xl font-black text-white tracking-tight mt-1">
            Modélisation Stochastique Avancée
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Frontière Efficiente Markowitz-Kelly, Processus Spatio-Temporel Hawkes 2D et Filtre EKF Kalman sur l'Entropie.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/80 border border-white/5 text-[10px] font-mono text-slate-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Déterministe &amp; Différentiable</span>
          </div>
        </div>
      </div>

      {/* 3 Columns Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 relative z-10">
        {/* 1. Markowitz & Kelly Multi-Scénarios */}
        <div className="bg-slate-950/50 border border-white/5 rounded-2xl p-5 flex flex-col justify-between hover:border-indigo-500/30 transition-all duration-300">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-[10px] font-black uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
                <Scale size={14} /> Frontière de Markowitz &amp; Kelly
              </span>
              <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-800/50">
                Sharpe: {markowitz ? markowitz.portfolioSharpeRatio.toFixed(2) : "n/d"}
              </span>
            </div>

            {markowitz ? (
              <div className="space-y-4">
                {/* Allocation Simplex Bars */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-[10px] text-slate-400">
                    <span>Pondération sur Simplexe (Σ = 100%)</span>
                    <span className="font-mono text-emerald-400 font-semibold">
                      Levier: {(markowitz.globalKellyLeverage * 100).toFixed(1)}%
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    {markowitz.allocations.map((alloc) => {
                      const isSelected = selectedScenarioId === alloc.id;
                      return (
                        <div
                          key={alloc.id}
                          onClick={() => onSelectScenarioId?.(alloc.id)}
                          className={`group cursor-pointer rounded-lg p-1.5 transition-all ${
                            isSelected
                              ? "bg-white/10 ring-1 ring-indigo-400/50"
                              : "hover:bg-white/5"
                          }`}
                        >
                          <div className="flex justify-between items-center text-[10px] mb-1 font-mono">
                            <span className="text-slate-300 font-medium truncate">
                              {alloc.name}
                            </span>
                            <span className="text-indigo-300 font-bold">
                              {(alloc.markowitzWeight * 100).toFixed(1)}%
                            </span>
                          </div>
                          <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-indigo-500 to-emerald-400 rounded-full transition-all duration-500"
                              style={{ width: `${Math.max(alloc.markowitzWeight * 100, 2)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Metrics Footer */}
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/5 text-[10px] font-mono">
                  <div className="bg-slate-900/80 p-2 rounded-lg border border-white/5">
                    <span className="text-slate-500 block text-[9px]">Rendement μp</span>
                    <span className="text-slate-200 font-bold">
                      {markowitz.portfolioExpectedReturn.toFixed(3)}
                    </span>
                  </div>
                  <div className="bg-slate-900/80 p-2 rounded-lg border border-white/5">
                    <span className="text-slate-500 block text-[9px]">Volatilité σp</span>
                    <span className="text-slate-200 font-bold">
                      {markowitz.portfolioVolatility.toFixed(3)}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500 italic">Portfolio en cours de calcul...</p>
            )}
          </div>
        </div>

        {/* 2. Processus Spatio-Temporel Hawkes 2D */}
        <div className="bg-slate-950/50 border border-white/5 rounded-2xl p-5 flex flex-col justify-between hover:border-violet-500/30 transition-all duration-300">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-[10px] font-black uppercase tracking-wider text-violet-400 flex items-center gap-1.5">
                <Waves size={14} /> Hawkes 2D (Toroïdal 9×10)
              </span>
              <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-violet-950 text-violet-300 border border-violet-800/50">
                Énergie: {hawkes ? hawkes.totalSpatioTemporalEnergy.toFixed(1) : "n/d"}
              </span>
            </div>

            {hawkes ? (
              <div className="space-y-4">
                {/* Hotspot Dominant */}
                <div className="bg-violet-950/30 border border-violet-500/20 rounded-xl p-3 flex items-center justify-between">
                  <div>
                    <span className="text-[9px] font-mono uppercase text-violet-400 block tracking-wider">
                      Hotspot Dominant
                    </span>
                    <span className="text-xs text-slate-300">
                      Boule {hawkes.dominantHotspot} (Excitation max)
                    </span>
                  </div>
                  <NumberBall number={hawkes.dominantHotspot} size="md" isAttractor />
                </div>

                {/* Top 5 Hotspots */}
                <div className="space-y-1.5">
                  <span className="text-[10px] font-mono text-slate-400 block">
                    Top 5 Noeuds d'Intensité Spatiale :
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {hawkes.nodes.slice(0, 5).map((node) => (
                      <div
                        key={node.number}
                        className="flex items-center gap-1 bg-slate-900 border border-white/5 px-2 py-1 rounded-lg"
                      >
                        <NumberBall number={node.number} size="xs" />
                        <span className="text-[9px] font-mono text-slate-400">
                          {node.normalizedScore.toFixed(0)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Hyperparameters */}
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/5 text-[10px] font-mono">
                  <div className="bg-slate-900/80 p-2 rounded-lg border border-white/5">
                    <span className="text-slate-500 block text-[9px]">Décroissance βt</span>
                    <span className="text-violet-300 font-bold">
                      {hawkes.temporalDecayBeta.toFixed(3)}
                    </span>
                  </div>
                  <div className="bg-slate-900/80 p-2 rounded-lg border border-white/5">
                    <span className="text-slate-500 block text-[9px]">Dispersion σs</span>
                    <span className="text-violet-300 font-bold">
                      {hawkes.spatialSpreadSigma.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500 italic">Hawkes 2D en cours de calcul...</p>
            )}
          </div>
        </div>

        {/* 3. Filtre Kalman EKF sur l'Entropie & Ruptures */}
        <div className="bg-slate-950/50 border border-white/5 rounded-2xl p-5 flex flex-col justify-between hover:border-emerald-500/30 transition-all duration-300">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                <Activity size={14} /> Filtre Kalman EKF (Entropie)
              </span>
              <span
                className={`text-[9px] font-mono px-2 py-0.5 rounded border ${
                  isBreakDetected
                    ? "bg-rose-950 text-rose-300 border-rose-800/50"
                    : "bg-emerald-950 text-emerald-300 border-emerald-800/50"
                }`}
              >
                {isBreakDetected ? "Rupture CUSUM" : "Flux Homogène"}
              </span>
            </div>

            {kalman ? (
              <div className="space-y-4">
                {/* State Vector */}
                <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
                  <div className="bg-slate-900/80 p-2 rounded-lg border border-white/5">
                    <span className="text-slate-500 block text-[9px]">Entropie Filtrée Ĥ</span>
                    <span className="text-emerald-400 font-bold text-xs">
                      {kalman.filteredEntropy.toFixed(3)} bit
                    </span>
                  </div>
                  <div className="bg-slate-900/80 p-2 rounded-lg border border-white/5">
                    <span className="text-slate-500 block text-[9px]">Vitesse Dérive Ḣ</span>
                    <span className="text-slate-300 font-bold text-xs">
                      {kalman.entropyVelocity.toFixed(4)}
                    </span>
                  </div>
                </div>

                {/* Regime Simplex Probability */}
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-[10px] font-mono">
                    <span className="text-slate-400">Probabilités de Régime EKF</span>
                    <span className="text-slate-300 text-[9px]">Σ = 1.000</span>
                  </div>
                  <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden flex">
                    <div
                      className="bg-emerald-500 h-full transition-all duration-300"
                      style={{ width: `${kalman.probStable * 100}%` }}
                      title={`Stable: ${(kalman.probStable * 100).toFixed(1)}%`}
                    />
                    <div
                      className="bg-amber-500 h-full transition-all duration-300"
                      style={{ width: `${kalman.probTransition * 100}%` }}
                      title={`Transition: ${(kalman.probTransition * 100).toFixed(1)}%`}
                    />
                    <div
                      className="bg-rose-500 h-full transition-all duration-300"
                      style={{ width: `${kalman.probChaotic * 100}%` }}
                      title={`Chaotique: ${(kalman.probChaotic * 100).toFixed(1)}%`}
                    />
                  </div>
                  <div className="flex justify-between text-[9px] font-mono text-slate-400">
                    <span className="text-emerald-400">
                      S: {(kalman.probStable * 100).toFixed(1)}%
                    </span>
                    <span className="text-amber-400">
                      T: {(kalman.probTransition * 100).toFixed(1)}%
                    </span>
                    <span className="text-rose-400">
                      C: {(kalman.probChaotic * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>

                {/* CUSUM Drift Intensity */}
                <div className="bg-slate-900/60 p-2.5 rounded-xl border border-white/5 space-y-1">
                  <div className="flex justify-between text-[9px] font-mono">
                    <span className="text-slate-400">Intensité Rupture CUSUM</span>
                    <span className="text-slate-300 font-bold">
                      {kalman.regimeBreakIntensity.toFixed(3)}
                    </span>
                  </div>
                  <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-rose-500 rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.min(kalman.regimeBreakIntensity * 100, 100)}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500 italic">EKF Kalman en cours de calcul...</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
