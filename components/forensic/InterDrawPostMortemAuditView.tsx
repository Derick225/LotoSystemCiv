import React, { useState } from 'react';
import {
  GitBranch,
  Target,
  Activity,
  Layers,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  Sparkles,
  Zap,
  ArrowRight,
  ShieldCheck,
  Percent,
} from 'lucide-react';
import { InterDrawPostMortemAudit } from '../../services/prediction/interDrawPostMortemService';

interface InterDrawPostMortemAuditViewProps {
  audit: InterDrawPostMortemAudit;
}

export const InterDrawPostMortemAuditView: React.FC<InterDrawPostMortemAuditViewProps> = ({
  audit,
}) => {
  const [detailTab, setDetailTab] = useState<'pairs' | 'dyads' | 'cascades'>('pairs');

  return (
    <div className="p-6 bg-slate-900/80 rounded-3xl border border-indigo-500/20 space-y-6 shadow-xl font-sans">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-white/5 pb-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 font-black text-[10px] rounded-lg uppercase tracking-wider">
            <GitBranch size={13} className="text-indigo-400" />
            <span>Famille {audit.familyName} &bull; {audit.predecessorName} &rarr; {audit.drawName}</span>
          </div>
          <h4 className="text-base sm:text-lg font-black uppercase tracking-tight text-white flex items-center gap-2">
            <ShieldCheck size={18} className="text-cyan-400" />
            Audit Rétrospectif & Calibration des Signaux Inter-Tirages
          </h4>
          <p className="text-xs text-slate-400">
            Confrontation empirique des projections probabilistes formulées à $t-1$ face aux gagnants réels du tirage ({audit.targetDrawDate}).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-emerald-300 bg-emerald-950/60 border border-emerald-800/40 px-3 py-1.5 rounded-xl font-bold">
            Efficacité Calibration : {audit.calibrationEfficiency}%
          </span>
        </div>
      </div>

      {/* 4 PRIMARY METRICS CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* DYADES CROISÉES */}
        <div className="p-4 bg-slate-950/70 rounded-2xl border border-white/5 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              Dyades Actives ({audit.auditedDyads.length})
            </span>
            <Target size={14} className="text-cyan-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black font-mono text-cyan-400">
              {audit.activeDyadConversionRate.toFixed(1)}%
            </span>
            <span className="text-[10px] font-mono text-slate-500">
              (Lift : {audit.dyadConversionLift.toFixed(2)}x)
            </span>
          </div>
          <p className="text-[9px] text-slate-500 font-mono">
            Baseline aléatoire : ~5.55% (5/90)
          </p>
        </div>

        {/* PAIRES CONDITIONNÉES */}
        <div className="p-4 bg-slate-950/70 rounded-2xl border border-white/5 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              Paires Fort Lift C(5, 2)
            </span>
            <Sparkles size={14} className="text-emerald-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black font-mono text-emerald-400">
              {audit.pairPartialConversionRate.toFixed(1)}%
            </span>
            <span className="text-[10px] font-mono text-emerald-500/80 font-bold">
              ({audit.pairFullConversionRate.toFixed(1)}% pleines)
            </span>
          </div>
          <p className="text-[9px] text-slate-500 font-mono">
            Lift partiel : {audit.partialConversionLift.toFixed(1)}x (base 10.86%)
          </p>
        </div>

        {/* RÉSONANCE CASCADE */}
        <div className="p-4 bg-slate-950/70 rounded-2xl border border-white/5 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              Cascades Unitaires (&plusmn;1, &plusmn;2)
            </span>
            <Zap size={14} className="text-amber-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black font-mono text-amber-400">
              {audit.actualCascadeHitsCount} / 5
            </span>
            <span className="text-[10px] font-mono text-slate-400">
              gagnants réels
            </span>
          </div>
          <p className="text-[9px] text-slate-500 font-mono">
            Conversion des cascades : {audit.cascadeConversionRate.toFixed(1)}%
          </p>
        </div>

        {/* CALIBRATION BAYESIENNE */}
        <div className="p-4 bg-slate-950/70 rounded-2xl border border-white/5 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
              Calibration Bayesienne
            </span>
            <Activity size={14} className="text-indigo-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black font-mono text-indigo-400">
              &alpha; = {audit.optimalLaplaceAlpha.toFixed(3)}
            </span>
          </div>
          <p className="text-[9px] text-slate-500 font-mono">
            Brier : {audit.brierScore.toFixed(4)} &bull; LogLoss : {audit.logLoss.toFixed(3)}
          </p>
        </div>
      </div>

      {/* VALIDATION MORPHOLOGIQUE */}
      <div className="p-4 bg-slate-950/60 rounded-2xl border border-white/5 space-y-3">
        <div className="flex items-center gap-2">
          <Layers size={14} className="text-indigo-400" />
          <span className="text-xs font-black uppercase tracking-wider text-white">
            Confrontation Morphologique Invariante
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono">
          <div className="p-3 bg-slate-900/80 rounded-xl border border-white/5">
            <span className="text-[9px] text-slate-500 uppercase block font-bold mb-1">
              Polarité Parité
            </span>
            <div className="flex items-baseline justify-between">
              <span className="text-slate-300 font-bold">
                {audit.actualParityEven} Pairs / {5 - audit.actualParityEven} Impairs
              </span>
              <span className="text-[10px] text-indigo-400">
                Attendu: {audit.expectedParityEven.toFixed(1)}P
              </span>
            </div>
            <span className="text-[9px] text-slate-500 block mt-1">
              Écart absolu : &Delta; = {audit.parityDelta.toFixed(2)}
            </span>
          </div>

          <div className="p-3 bg-slate-900/80 rounded-xl border border-white/5">
            <span className="text-[9px] text-slate-500 uppercase block font-bold mb-1">
              Dérive Somme (Barycentre)
            </span>
            <div className="flex items-baseline justify-between">
              <span className="text-slate-300 font-bold">
                Somme Réelle : {audit.actualSum}
              </span>
              <span className="text-[10px] text-cyan-400">
                Optimal S* : {audit.projectedOptimalSum}
              </span>
            </div>
            <span className={`text-[9px] block mt-1 font-bold ${
              audit.withinProjectedSumRange ? 'text-emerald-400' : 'text-amber-400'
            }`}>
              {audit.withinProjectedSumRange
                ? 'Alignée dans la fourchette cible'
                : `Écart de ${audit.sumDelta} pts`}
            </span>
          </div>

          <div className="p-3 bg-slate-900/80 rounded-xl border border-white/5">
            <span className="text-[9px] text-slate-500 uppercase block font-bold mb-1">
              Rétention Directe (Carry-Over)
            </span>
            <div className="flex items-baseline justify-between">
              <span className="text-slate-300 font-bold">
                {audit.actualRetentionCount} / 5 reconduits
              </span>
              <span className="text-[10px] text-slate-400">
                Espérance : {audit.expectedRetention.toFixed(2)}
              </span>
            </div>
            <span className="text-[9px] text-slate-500 block mt-1">
              Gagnants prédécesseur : [{audit.predecessorWinners.join(', ')}]
            </span>
          </div>
        </div>
      </div>

      {/* DETAIL TABLES WITH TABS */}
      <div className="space-y-3">
        <div className="flex items-center justify-between border-b border-white/5 pb-2">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setDetailTab('pairs')}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                detailTab === 'pairs'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'bg-slate-950 text-slate-400 hover:text-white border border-white/5'
              }`}
            >
              Paires Conditionnées ({audit.auditedPairs.length})
            </button>
            <button
              onClick={() => setDetailTab('dyads')}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                detailTab === 'dyads'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'bg-slate-950 text-slate-400 hover:text-white border border-white/5'
              }`}
            >
              Dyades Croisées ({audit.auditedDyads.length})
            </button>
            <button
              onClick={() => setDetailTab('cascades')}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                detailTab === 'cascades'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  : 'bg-slate-950 text-slate-400 hover:text-white border border-white/5'
              }`}
            >
              Cascades &plusmn;1, &plusmn;2 ({audit.auditedCascades.length})
            </button>
          </div>
          <span className="text-[10px] font-mono text-slate-500 hidden sm:inline">
            Gagnants Réels : [{audit.targetActualWinners.join(', ')}]
          </span>
        </div>

        {/* TAB 1: PAIRES CONDITIONNÉES */}
        {detailTab === 'pairs' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
            {audit.auditedPairs.map((pairItem, idx) => (
              <div
                key={idx}
                className={`p-3 rounded-xl border font-mono text-xs flex items-center justify-between ${
                  pairItem.isFullHit
                    ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-200'
                    : pairItem.isPartialHit
                    ? 'bg-cyan-950/30 border-cyan-500/40 text-cyan-200'
                    : 'bg-slate-950/40 border-white/5 text-slate-400'
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-black text-sm text-white">
                      [{String(pairItem.pair[0]).padStart(2, '0')}, {String(pairItem.pair[1]).padStart(2, '0')}]
                    </span>
                    {pairItem.isFullHit && (
                      <span className="text-[9px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-1.5 py-0.5 rounded font-black">
                        2/2 HIT
                      </span>
                    )}
                    {pairItem.isPartialHit && !pairItem.isFullHit && (
                      <span className="text-[9px] bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 px-1.5 py-0.5 rounded font-bold">
                        1/2 HIT
                      </span>
                    )}
                  </div>
                  <span className="text-[9px] text-slate-500 block">
                    Déclencheur $W_{'{t-1}'}$ : [{pairItem.triggerSources.join(', ') || 'Global'}]
                  </span>
                </div>

                <div className="text-right">
                  <span className="text-xs font-black block text-indigo-300">
                    {pairItem.lift.toFixed(2)}x
                  </span>
                  <span className="text-[8px] text-slate-500">
                    PMI: {pairItem.pmi.toFixed(2)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* TAB 2: DYADES CROISÉES */}
        {detailTab === 'dyads' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
            {audit.auditedDyads.map((dyad, idx) => (
              <div
                key={idx}
                className={`p-3 rounded-xl border font-mono text-xs flex items-center justify-between ${
                  dyad.isConverted
                    ? 'bg-cyan-950/40 border-cyan-500/50 text-cyan-200'
                    : 'bg-slate-950/40 border-white/5 text-slate-400'
                }`}
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-slate-400">{dyad.sourcePredecessor}</span>
                    <ArrowRight size={11} className="text-slate-500" />
                    <span className={`font-black text-sm ${dyad.isConverted ? 'text-cyan-300' : 'text-white'}`}>
                      {dyad.targetDraw}
                    </span>
                    {dyad.isConverted && (
                      <span className="text-[9px] bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 px-1.5 py-0.5 rounded font-black">
                        CONVERTI
                      </span>
                    )}
                  </div>
                  <span className="text-[8px] text-slate-500">
                    Jaccard : {dyad.jaccard.toFixed(3)}
                  </span>
                </div>

                <div className="text-right">
                  <span className="text-xs font-black block text-cyan-400">
                    {dyad.lift.toFixed(2)}x
                  </span>
                  <span className="text-[8px] text-slate-500">Lift</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* TAB 3: CASCADES UNITAIRES */}
        {detailTab === 'cascades' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
            {audit.auditedCascades.map((casc, idx) => (
              <div
                key={idx}
                className={`p-3 rounded-xl border font-mono text-xs flex items-center justify-between ${
                  casc.isConverted
                    ? 'bg-amber-950/40 border-amber-500/50 text-amber-200'
                    : 'bg-slate-950/40 border-white/5 text-slate-400'
                }`}
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-slate-400">{casc.sourcePredecessor}</span>
                    <span className="text-[10px] text-amber-400 font-bold">
                      ({casc.delta > 0 ? `+${casc.delta}` : casc.delta})
                    </span>
                    <ArrowRight size={11} className="text-slate-500" />
                    <span className={`font-black text-sm ${casc.isConverted ? 'text-amber-300' : 'text-white'}`}>
                      {casc.targetNeighbour}
                    </span>
                    {casc.isConverted && (
                      <span className="text-[9px] bg-amber-500/20 text-amber-300 border border-amber-500/40 px-1.5 py-0.5 rounded font-black">
                        IMPACT
                      </span>
                    )}
                  </div>
                  <span className="text-[8px] text-slate-500">
                    Taux empirique : {casc.empiricalRate.toFixed(1)}%
                  </span>
                </div>

                <div className="text-right">
                  <span className="text-xs font-black block text-amber-400">
                    {casc.lift.toFixed(2)}x
                  </span>
                  <span className="text-[8px] text-slate-500">Lift</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* SYNTHÈSE DIAGNOSTIQUE */}
      <div className="p-3.5 bg-indigo-950/30 rounded-xl border border-indigo-500/20 flex items-start gap-2.5 text-xs text-slate-300">
        <Sparkles size={16} className="text-indigo-400 shrink-0 mt-0.5" />
        <p className="leading-relaxed font-sans">
          <strong>Diagnostic de calibration continue :</strong> {audit.summaryDiagnosis}
        </p>
      </div>
    </div>
  );
};
