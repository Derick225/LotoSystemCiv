import React from "react";
import {
  InterDrawPatternReport,
  DECADE_LABELS
} from "../../services/interDrawPatternService";
import { NumberBall } from "../NumberBall";
import {
  Network,
  Activity,
  ArrowRight,
  TrendingUp,
  Compass,
  Repeat,
  Sparkles,
  BarChart3,
  GitCommit,
  CheckCircle2,
  Gauge
} from "lucide-react";

interface InterDrawPatternViewProps {
  patterns?: InterDrawPatternReport;
  targetDraw: string;
  predecessorName: string;
  predecessorNumbers: number[];
}

export const InterDrawPatternView: React.FC<InterDrawPatternViewProps> = ({
  patterns,
  targetDraw,
  predecessorName,
  predecessorNumbers
}) => {
  if (!patterns) {
    return (
      <div className="p-8 text-center bg-white/50 dark:bg-slate-900/50 rounded-3xl border border-slate-200 dark:border-white/5">
        <p className="text-xs text-slate-400 italic">
          Données de patterns structurels en cours de calcul.
        </p>
      </div>
    );
  }

  const { parity, decades, cascade, centroid, retention } = patterns;

  return (
    <div className="space-y-6 animate-fade-in font-sans">
      {/* 1. EN-TÊTE MÉTHODOLOGIQUE */}
      <div className="bg-white/80 dark:bg-slate-900/80 p-5 md:p-6 rounded-3xl border border-purple-500/20 dark:border-purple-500/10 backdrop-blur-xl shadow-xl space-y-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-purple-500/10 border border-purple-500/20 text-purple-600 dark:text-purple-400 font-black text-[10px] rounded-lg uppercase tracking-wider">
              <Network size={13} className="animate-pulse" />
              Topologie Structurale Inter-Tirages
            </div>
            <h3 className="text-lg md:text-xl font-black text-slate-900 dark:text-white mt-1">
              Détecteur de Patterns Structurels & Morphologiques
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Analyse des invariances combinatoires, flux de parité, transferts de dizaines, cascades $\pm 1$ et dynamiques de centroïde entre <strong className="text-slate-800 dark:text-slate-200">{predecessorName}</strong> et <strong className="text-slate-800 dark:text-slate-200">{targetDraw}</strong>.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="px-3 py-1.5 rounded-xl bg-purple-50 dark:bg-purple-950/40 border border-purple-500/20 text-right">
              <span className="text-[9px] uppercase font-bold text-purple-400 block">Entropie Parité</span>
              <span className="text-xs font-mono font-black text-purple-700 dark:text-purple-300">
                {parity.transitionEntropy} bits
              </span>
            </div>
            <div className="px-3 py-1.5 rounded-xl bg-sky-50 dark:bg-sky-950/40 border border-sky-500/20 text-right">
              <span className="text-[9px] uppercase font-bold text-sky-400 block">Viscosité Rétention</span>
              <span className="text-xs font-mono font-black text-sky-700 dark:text-sky-300">
                {retention.persistenceIndex}x
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. PATTERN DE PARITÉ : FLUX & ENTROPIE */}
      <div className="bg-white/80 dark:bg-slate-900/80 p-5 md:p-6 rounded-3xl border border-slate-200 dark:border-white/10 backdrop-blur-xl shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h4 className="text-sm md:text-base font-black uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-2">
              <Activity size={16} className="text-indigo-500" />
              1. Transmission & Polarité de Parité (Pairs vs Impairs)
            </h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              État antérieur : <strong className="text-slate-800 dark:text-slate-200">{parity.predRatioLabel}</strong> ({parity.predEvenCount} pairs, {parity.predOddCount} impairs).
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-wide bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30">
              {parity.tendencyLabel}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Métriques d'espérance mathématique */}
          <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-white/5 space-y-3 flex flex-col justify-between">
            <div>
              <span className="text-[10px] uppercase font-black tracking-wider text-slate-400 block">
                Espérance Mathématique Projetée
              </span>
              <div className="flex items-baseline gap-3 mt-1">
                <div>
                  <span className="text-2xl font-black font-mono text-indigo-600 dark:text-indigo-400">
                    {parity.expectedTargetEven}
                  </span>
                  <span className="text-[10px] font-bold text-slate-400 block uppercase">Pairs attendus</span>
                </div>
                <span className="text-xl font-light text-slate-300">/</span>
                <div>
                  <span className="text-2xl font-black font-mono text-slate-700 dark:text-slate-300">
                    {parity.expectedTargetOdd}
                  </span>
                  <span className="text-[10px] font-bold text-slate-400 block uppercase">Impairs attendus</span>
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200/60 dark:border-white/5 text-[11px] text-slate-500">
              Force de la tendance : <strong className="font-mono text-indigo-600 dark:text-indigo-400">{parity.tendencyStrength}%</strong>
            </div>
          </div>

          {/* Histogramme des probabilités conditionnelles de transition */}
          <div className="lg:col-span-2 p-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-white/5 space-y-2">
            <span className="text-[10px] uppercase font-black tracking-wider text-slate-400 block">
              Distribution des Transitions Conditionnées par {parity.predRatioLabel}
            </span>

            <div className="grid grid-cols-6 gap-2 pt-1">
              {parity.transitionDistribution.map((td) => (
                <div key={`td-${td.targetEvenCount}`} className="text-center space-y-1">
                  <div className="h-16 flex items-end justify-center">
                    <div
                      style={{ height: `${Math.max(8, td.probability * 1.5)}%` }}
                      className={`w-full max-w-[28px] rounded-t-lg transition-all duration-300 ${
                        td.probability >= 30
                          ? "bg-indigo-600"
                          : td.probability >= 20
                          ? "bg-indigo-400"
                          : "bg-slate-300 dark:bg-slate-700"
                      }`}
                    />
                  </div>
                  <span className="text-xs font-mono font-black text-slate-800 dark:text-slate-200 block">
                    {td.probability}%
                  </span>
                  <span className="text-[9px] font-mono text-slate-400 block">
                    {td.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 3. PATTERN DE FLUX INTER-DIZAINES */}
      <div className="bg-white/80 dark:bg-slate-900/80 p-5 md:p-6 rounded-3xl border border-slate-200 dark:border-white/10 backdrop-blur-xl shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h4 className="text-sm md:text-base font-black uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-2">
              <BarChart3 size={16} className="text-emerald-500" />
              2. Matrice de Transfert & Saturation des Dizaines
            </h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Quelles tranches décimales de [01-09 à 80-90] reçoivent le plus d’énergie markovienne au tirage suivant ?
            </p>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] uppercase font-black text-slate-400">Dizaines Actives :</span>
            {decades.activeDecades.map(d => (
              <span
                key={`act-dec-${d}`}
                className="px-2 py-0.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-[10px] font-mono font-bold"
              >
                {DECADE_LABELS[d]}
              </span>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {decades.stimulatedDecades.slice(0, 6).map((dec, idx) => (
            <div
              key={`dec-card-${dec.decade}`}
              className="p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-white/5 space-y-2"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono font-black text-slate-400">#{idx + 1}</span>
                  <span className="font-black text-sm text-slate-900 dark:text-white">
                    Dizaine {dec.label}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[9px] uppercase font-bold text-slate-400 block">Excitation</span>
                  <span className="text-sm font-black font-mono text-emerald-600 dark:text-emerald-400">
                    {dec.excitationScore}%
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-200/50 dark:border-white/5">
                <span>Lift de transfert :</span>
                <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                  {dec.lift}x
                </span>
              </div>

              {/* Échantillon représentatif de numéros */}
              <div className="flex gap-1.5 pt-1">
                {dec.topNumbers.map(n => (
                  <NumberBall key={`dec-ball-${n}`} number={n} size="xs" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 4. PATTERN DE CASCADE & VOISINAGE UNITAIRE */}
      <div className="bg-white/80 dark:bg-slate-900/80 p-5 md:p-6 rounded-3xl border border-slate-200 dark:border-white/10 backdrop-blur-xl shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h4 className="text-sm md:text-base font-black uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-2">
              <Compass size={16} className="text-amber-500" />
              3. Phénomène de Cascade & Voisinage Unitaire ($\pm 1, \pm 2$)
            </h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Tendance stochastique des numéros à résonner sur leurs voisins immédiats (+1, -1, +2, -2) au tirage consécutif.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-wide bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">
              {cascade.directionalLabel.replace('_', ' ')}
            </span>
          </div>
        </div>

        {/* Synthèse du taux global de cascade */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3.5 bg-amber-50/50 dark:bg-amber-950/20 rounded-2xl border border-amber-500/20">
            <span className="text-[9px] uppercase font-black tracking-wider text-amber-600 dark:text-amber-400 block">
              Taux Global Observé
            </span>
            <span className="text-lg font-black font-mono text-slate-900 dark:text-white mt-0.5 block">
              {cascade.overallCascadeRate}%
            </span>
            <span className="text-[9px] text-slate-400 mt-0.5 block">
              des numéros activent un voisin direct
            </span>
          </div>

          <div className="p-3.5 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-white/5">
            <span className="text-[9px] uppercase font-bold tracking-wider text-slate-400 block">
              Espérance Théorique Null
            </span>
            <span className="text-lg font-black font-mono text-slate-700 dark:text-slate-300 mt-0.5 block">
              {cascade.overallCascadeExpected}%
            </span>
            <span className="text-[9px] text-slate-400 mt-0.5 block">
              baseline combinatoire 5/90
            </span>
          </div>

          <div className="p-3.5 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-white/5">
            <span className="text-[9px] uppercase font-bold tracking-wider text-slate-400 block">
              Lift & Dérive Directionnelle
            </span>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="text-lg font-black font-mono text-amber-600 dark:text-amber-400">
                {cascade.overallCascadeLift}x
              </span>
              <span className="text-[10px] font-mono text-slate-400">
                (Drift: {cascade.directionalDrift > 0 ? `+${cascade.directionalDrift}` : cascade.directionalDrift})
              </span>
            </div>
            <span className="text-[9px] text-slate-400 mt-0.5 block">
              orientation ascensionnelle vs descendante
            </span>
          </div>
        </div>

        {/* Résonances actives de voisinage pour les numéros du prédécesseur */}
        <div className="space-y-2">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
            Résonances de Voisinage Actives ({predecessorName} → {targetDraw}) :
          </span>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2.5">
            {cascade.activeResonances.map((r, idx) => (
              <div
                key={`casc-${r.sourceNumber}-${r.targetNeighbour}`}
                className="p-3 rounded-2xl border bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-white/5 flex flex-col justify-between gap-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-mono text-slate-400 font-bold">#{idx + 1}</span>
                  <span className={`px-1.5 py-0.2 rounded text-[8px] font-mono font-black ${
                    r.delta > 0 ? "bg-emerald-500/10 text-emerald-600" : "bg-sky-500/10 text-sky-600"
                  }`}>
                    {r.delta > 0 ? `+${r.delta}` : r.delta} ({r.type === 'VOISIN_DIRECT' ? '±1' : '±2'})
                  </span>
                </div>

                <div className="flex items-center justify-center gap-2 my-1">
                  <NumberBall number={r.sourceNumber} size="sm" />
                  <ArrowRight size={13} className="text-amber-500 flex-shrink-0" />
                  <NumberBall number={r.targetNeighbour} size="sm" />
                </div>

                <div className="pt-2 border-t border-slate-200/50 dark:border-white/5 text-[9px] flex justify-between text-slate-500">
                  <span>Taux : <strong className="font-mono text-slate-800 dark:text-slate-200">{r.empiricalRate}%</strong></span>
                  <span className="font-mono font-bold text-amber-500">L: {r.lift}x</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 5. PATTERN DE DÉRIVE DES SOMMES & CENTROÏDE */}
      <div className="bg-white/80 dark:bg-slate-900/80 p-5 md:p-6 rounded-3xl border border-slate-200 dark:border-white/10 backdrop-blur-xl shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h4 className="text-sm md:text-base font-black uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-2">
              <Gauge size={16} className="text-sky-500" />
              4. Dérive du Centroïde & Régression vers la Moyenne (Somme des 5 Numéros)
            </h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Somme du tirage précédent : <strong className="text-slate-800 dark:text-slate-200 font-mono">{centroid.predSum}</strong> (Moyenne : {centroid.predMean}). Baseline théorique : 227.5.
            </p>
          </div>

          <span className={`px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-wide border ${
            centroid.reversionTendency === 'HAUSSE_COMPENSATRICE'
              ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
              : centroid.reversionTendency === 'BAISSE_COMPENSATRICE'
              ? "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30"
              : "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30"
          }`}>
            {centroid.reversionTendency.replace('_', ' ')}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-white/5 space-y-1">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">
              Somme Optimale Projetée
            </span>
            <span className="text-2xl font-black font-mono text-sky-600 dark:text-sky-400">
              {centroid.projectedSumRange.optimal}
            </span>
            <span className="text-[10px] text-slate-500 block">
              Fourchette cible : [{centroid.projectedSumRange.min} — {centroid.projectedSumRange.max}]
            </span>
          </div>

          <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-white/5 space-y-1">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">
              Corrélation de Régression (r)
            </span>
            <span className="text-2xl font-black font-mono text-slate-800 dark:text-slate-200">
              {centroid.reversionCorrelation}
            </span>
            <span className="text-[10px] text-slate-500 block">
              Force de rappel vers la moyenne 227.5
            </span>
          </div>

          <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-white/5 space-y-1">
            <span className="text-[10px] uppercase font-bold text-slate-400 block">
              Dérive Moyenne Historique (Δ)
            </span>
            <span className="text-2xl font-black font-mono text-slate-800 dark:text-slate-200">
              {centroid.historicalDeltaMean > 0 ? `+${centroid.historicalDeltaMean}` : centroid.historicalDeltaMean}
            </span>
            <span className="text-[10px] text-slate-500 block">
              Écart-type résiduel : σ = {centroid.historicalDeltaStd}
            </span>
          </div>
        </div>
      </div>

      {/* 6. PATTERN DE RÉTENTION MULTI-ORDRES (CARRY-OVER DISTRIBUTION) */}
      <div className="bg-white/80 dark:bg-slate-900/80 p-5 md:p-6 rounded-3xl border border-slate-200 dark:border-white/10 backdrop-blur-xl shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h4 className="text-sm md:text-base font-black uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-2">
              <Repeat size={16} className="text-rose-500" />
              5. Distribution de Rétention Multi-Ordres (Reports de 0, 1, 2, ≥3 numéros)
            </h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Comparaison rigoureuse de la persistance stochastique observée contre la loi hypergéométrique théorique.
            </p>
          </div>

          <span className="px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-wide bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30">
            Mode : {retention.dominantRetentionMode.replace('_', ' ')}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3.5 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-white/5 space-y-1">
            <span className="text-[9px] uppercase font-bold text-slate-400 block">0 Répété (Renouvellement)</span>
            <div className="flex items-baseline justify-between">
              <span className="text-lg font-black font-mono text-slate-900 dark:text-white">{retention.repeat0Rate}%</span>
              <span className="text-[9px] font-mono text-slate-400">Théo: {retention.hypergeometricExpected.p0}%</span>
            </div>
          </div>

          <div className="p-3.5 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-white/5 space-y-1">
            <span className="text-[9px] uppercase font-bold text-slate-400 block">1 Numéro Reporté</span>
            <div className="flex items-baseline justify-between">
              <span className="text-lg font-black font-mono text-indigo-600 dark:text-indigo-400">{retention.repeat1Rate}%</span>
              <span className="text-[9px] font-mono text-slate-400">Théo: {retention.hypergeometricExpected.p1}%</span>
            </div>
          </div>

          <div className="p-3.5 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-white/5 space-y-1">
            <span className="text-[9px] uppercase font-bold text-slate-400 block">2 Numéros Reportés</span>
            <div className="flex items-baseline justify-between">
              <span className="text-lg font-black font-mono text-purple-600 dark:text-purple-400">{retention.repeat2Rate}%</span>
              <span className="text-[9px] font-mono text-slate-400">Théo: {retention.hypergeometricExpected.p2}%</span>
            </div>
          </div>

          <div className="p-3.5 bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-white/5 space-y-1">
            <span className="text-[9px] uppercase font-bold text-slate-400 block">≥3 Numéros Reportés</span>
            <div className="flex items-baseline justify-between">
              <span className="text-lg font-black font-mono text-rose-600 dark:text-rose-400">{retention.repeat3PlusRate}%</span>
              <span className="text-[9px] font-mono text-slate-400">Théo: {retention.hypergeometricExpected.p3Plus}%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
