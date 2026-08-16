import React, { useMemo } from "react";
import { useNexusStore } from "../../store/useNexusStore";
import {
  Cpu,
  Layers,
  ArrowRight,
  TrendingUp,
  Activity,
  Sparkles,
  Zap,
  Info,
  ShieldCheck,
  RotateCcw,
  CheckCircle2,
  Share2,
} from "lucide-react";
import { calculateMachineTransferReport } from "../../services/prediction/machineTransferService";
import { NumberBall } from "../NumberBall";

export const MachineTransferTab: React.FC<{ drawName: string }> = ({
  drawName,
}) => {
  const history = useNexusStore((state) => state.history);

  const report = useMemo(() => {
    return calculateMachineTransferReport(drawName, history);
  }, [drawName, history]);

  if (!report.hasMachineData) {
    return (
      <div className="bg-slate-900/60 p-8 rounded-3xl border border-white/5 text-center space-y-4 animate-fade-in font-sans">
        <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-400 flex items-center justify-center mx-auto border border-amber-500/20">
          <Cpu size={24} />
        </div>
        <h3 className="text-lg font-black text-white uppercase tracking-tight">
          Plateau Machine Non Détecté pour {drawName}
        </h3>
        <p className="text-xs text-slate-400 max-w-lg mx-auto leading-relaxed">
          {report.diagnosticRemark} Pour les tirages avec numéros Machine enregistrés (comme Sika ou Emergence), ce module extrait les résonances croisées, les taux de carry-over et les candidats de transition.
        </p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6 pb-12 animate-fade-in font-sans">
      {/* HEADER DU MODULE */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-900/70 p-6 md:p-8 rounded-3xl border border-white/5 backdrop-blur-xl shadow-2xl relative overflow-hidden">
        <div className="space-y-1.5 relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 font-black text-[10px] rounded-lg uppercase tracking-wider">
            <Cpu size={13} className="text-cyan-400 animate-pulse" />
            Matrice de Transfert Machine & Gagnants
          </div>
          <h2 className="text-2xl md:text-3xl font-black text-white uppercase tracking-tight flex items-center gap-3">
            Transfert Stochastique Machine $\rightarrow$ Gagnants
          </h2>
          <p className="text-xs text-slate-400 font-medium max-w-2xl">
            {report.diagnosticRemark}
          </p>
        </div>

        <div className="flex items-center gap-3 relative z-10">
          <div className="px-4 py-2 bg-slate-950/80 rounded-2xl border border-white/10 text-right">
            <span className="text-[10px] text-slate-500 font-bold block uppercase">
              Taux de Transfert Direct
            </span>
            <span className="text-xl font-black font-mono text-cyan-400">
              {report.directTransferRate.toFixed(1)}%
            </span>
          </div>
        </div>
      </div>

      {/* KPIS DE TRANSFERT */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 bg-slate-900/70 rounded-2xl border border-white/5 flex flex-col justify-between">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
            Tirages avec Machine
          </span>
          <div className="my-2">
            <span className="text-3xl font-black font-mono text-white">
              {report.totalDrawsWithMachine}
            </span>
            <span className="text-[10px] text-slate-500 block mt-0.5">
              Historique complet analysé
            </span>
          </div>
          <div className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
            <ShieldCheck size={12} />
            <span>Isolation hermétique vérifiée</span>
          </div>
        </div>

        <div className="p-5 bg-slate-900/70 rounded-2xl border border-white/5 flex flex-col justify-between">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
            Moyenne Transferts / Tirage
          </span>
          <div className="my-2">
            <span className="text-3xl font-black font-mono text-indigo-400">
              {report.meanTransfersPerDraw.toFixed(2)}
            </span>
            <span className="text-[10px] text-slate-500 block mt-0.5">
              Numéros Machine devenus Gagnants
            </span>
          </div>
          <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-indigo-500 h-full rounded-full"
              style={{ width: `${Math.min(100, report.meanTransfersPerDraw * 50)}%` }}
            />
          </div>
        </div>

        <div className="p-5 bg-slate-900/70 rounded-2xl border border-white/5 flex flex-col justify-between">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
            Distribution du Lag Temporel
          </span>
          <div className="my-2">
            <div className="flex items-baseline gap-2 font-mono">
              <span className="text-lg font-black text-cyan-400">
                L1: {report.lagDistribution.lag1}
              </span>
              <span className="text-sm font-bold text-slate-400">
                L2: {report.lagDistribution.lag2}
              </span>
              <span className="text-xs text-slate-500">
                L3+: {report.lagDistribution.lag3}
              </span>
            </div>
            <span className="text-[10px] text-slate-500 block mt-0.5">
              L1 = Immédiat (tirage consécutif)
            </span>
          </div>
          <div className="text-[10px] text-cyan-400 font-mono">
            {report.lagDistribution.lag1 > 0 ? "Forte dominance Lag 1" : "Distribution diffuse"}
          </div>
        </div>

        <div className="p-5 bg-slate-900/70 rounded-2xl border border-white/5 flex flex-col justify-between">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
            Derniers Numéros Machine
          </span>
          <div className="my-2 flex items-center gap-1.5 flex-wrap">
            {report.latestMachineNumbers.map((n) => (
              <span
                key={n}
                className="w-7 h-7 rounded-lg bg-cyan-500/20 text-cyan-300 font-mono font-black text-xs flex items-center justify-center border border-cyan-500/30"
              >
                {n}
              </span>
            ))}
          </div>
          <span className="text-[10px] text-slate-400 font-mono">
            Sources actives pour le prochain tirage
          </span>
        </div>
      </div>

      {/* CRIBLE ACTIF : CANDIDATS DU TRANSFERT POUR LE PROCHAIN TIRAGE */}
      <div className="bg-slate-900/60 p-6 md:p-8 rounded-3xl border border-white/5 shadow-sm space-y-4">
        <div className="flex justify-between items-center border-b border-white/5 pb-4">
          <div>
            <h3 className="text-base font-black text-white uppercase tracking-wider flex items-center gap-2">
              <Sparkles size={18} className="text-cyan-400" />
              Crible de Transfert Actif pour le Prochain Tirage
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Numéros dérivés du dernier plateau Machine ({report.latestMachineNumbers.join(", ")}) classés par probabilité empirique de transition.
            </p>
          </div>
          <span className="px-3 py-1 bg-cyan-500/10 text-cyan-400 text-[10px] font-black uppercase rounded-lg border border-cyan-500/20">
            {report.activeSieveCandidates.length} Candidats Détectés
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
          {report.activeSieveCandidates.map((cand) => (
            <div
              key={`${cand.number}-${cand.transferType}`}
              className="p-4 bg-slate-950/70 rounded-2xl border border-white/5 space-y-3 relative group hover:border-cyan-500/30 transition-all"
            >
              <div className="flex justify-between items-start">
                <span
                  className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${
                    cand.recommendationTag === "CANDIDAT MAJEUR"
                      ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                      : cand.recommendationTag === "RÉSONANCE FORTE"
                      ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                      : "bg-slate-800 text-slate-400"
                  }`}
                >
                  {cand.recommendationTag}
                </span>
                <span className="text-xs font-mono font-black text-cyan-400">
                  {cand.confidenceScore}% Conf.
                </span>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center font-mono font-black text-xl border border-cyan-500/20 shadow-inner">
                  {cand.number}
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block font-mono">
                    {cand.transferType === "direct"
                      ? "Transfert Direct"
                      : cand.transferType === "mirror"
                      ? `Miroir de Machine ${cand.sourceMachineNumber}`
                      : `Transition de ${cand.sourceMachineNumber}`}
                  </span>
                  <span className="text-xs font-bold text-slate-200">
                    {cand.historicalTransferCount} transferts passés
                  </span>
                </div>
              </div>

              <div className="pt-2 border-t border-white/5 flex justify-between text-[10px] font-mono text-slate-400">
                <span>Taux de conversion :</span>
                <span className="text-cyan-400 font-bold">
                  {cand.transferProbability}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* TOP TRANSFERTS HISTORIQUES & MATRICE DE TRANSITION */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Leaders de Conversion */}
        <div className="bg-slate-900/60 p-6 rounded-3xl border border-white/5 space-y-4">
          <h4 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
            <TrendingUp size={16} className="text-emerald-400" />
            Top Numéros à Forte Conversion Machine $\rightarrow$ Gagnants
          </h4>
          <div className="space-y-2">
            {report.topHistoricalTransfers.map((item, idx) => (
              <div
                key={item.number}
                className="flex items-center justify-between p-3 bg-slate-950/60 rounded-xl border border-white/5 text-xs font-mono"
              >
                <div className="flex items-center gap-3">
                  <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-400 text-[10px] font-black flex items-center justify-center">
                    #{idx + 1}
                  </span>
                  <span className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-300 font-black text-sm flex items-center justify-center border border-emerald-500/30">
                    {item.number}
                  </span>
                  <span className="text-slate-300">
                    {item.transfersToWinnersCount} sorties consécutives
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-emerald-400 font-bold">
                    {item.conversionRate.toFixed(1)}% conversion
                  </span>
                  <span className="block text-[9px] text-slate-500">
                    sur {item.totalMachineAppearances} passages machine
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Matrice de Transition Croisée */}
        <div className="bg-slate-900/60 p-6 rounded-3xl border border-white/5 space-y-4">
          <h4 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
            <Share2 size={16} className="text-indigo-400" />
            Paires d'Affinité Croisée (Machine $m \rightarrow$ Gagnant $w$)
          </h4>
          <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1 custom-scrollbar">
            {report.crossAffinityMatrix.map((pair, idx) => (
              <div
                key={`${pair.machineNum}-${pair.winnerNum}`}
                className="flex items-center justify-between p-3 bg-slate-950/60 rounded-xl border border-white/5 text-xs font-mono"
              >
                <div className="flex items-center gap-2">
                  <span className="px-2 py-1 bg-cyan-500/20 text-cyan-300 rounded font-black">
                    M: {pair.machineNum}
                  </span>
                  <ArrowRight size={12} className="text-slate-500" />
                  <span className="px-2 py-1 bg-indigo-500/20 text-indigo-300 rounded font-black">
                    G: {pair.winnerNum}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-indigo-400 font-bold">
                    {pair.coOccurrenceCount} occurrences
                  </span>
                  <span className="block text-[9px] text-slate-500">
                    Ratio d'affinité {(pair.affinityRatio * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
