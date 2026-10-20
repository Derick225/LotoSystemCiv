import React, { useState } from 'react';
import {
  Activity,
  Zap,
  Flame,
  GitBranch,
  ShieldAlert,
  ChevronRight,
  Info,
  Waves,
  Cpu,
  ArrowRight,
  TrendingUp,
  Sparkles
} from 'lucide-react';
import { audioEngine } from '../../utils/audioEngine';
import { InterDrawComplexDynamicsReport } from '../../services/interDrawDynamicsService';
import { getHpcEngineMode } from '../../services/wasm/lotoEngineBridge';

interface InterDrawDynamicsViewProps {
  dynamics?: InterDrawComplexDynamicsReport;
  targetDraw: string;
  predecessorName: string;
  networkId: 'hebdomadaire' | 'quotidien';
  onSelectDraw?: (drawName: string) => void;
}

export const InterDrawDynamicsView: React.FC<InterDrawDynamicsViewProps> = ({
  dynamics,
  targetDraw,
  predecessorName,
  networkId,
  onSelectDraw
}) => {
  const [activePhenomenon, setActivePhenomenon] = useState<'DOMINO' | 'BUTTERFLY' | 'CASCADE' | 'CHAIN'>('CASCADE');
  const hpcMode = getHpcEngineMode();

  if (!dynamics) {
    return (
      <div className="bg-white/80 dark:bg-slate-900/80 p-8 rounded-3xl border border-slate-200 dark:border-white/10 text-center">
        <Activity size={32} className="text-indigo-500 mx-auto mb-3 animate-spin" />
        <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
          Calcul des dynamiques complexes en cours...
        </p>
        <p className="text-xs text-slate-500 mt-1">
          Résolution du Heat Kernel et des résonances interférométriques.
        </p>
      </div>
    );
  }

  const { domino, butterfly, cascade, chainReaction, topDynamicCandidates } = dynamics;

  return (
    <div className="space-y-6">
      {/* 1. EN-TÊTE DYNAMIQUE & STATUT HPC */}
      <div className="bg-gradient-to-br from-indigo-900/80 via-slate-900/90 to-purple-950/80 p-6 rounded-3xl border border-indigo-500/20 shadow-2xl relative overflow-hidden text-white">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />

        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="px-2.5 py-1 rounded-lg bg-indigo-500/30 text-indigo-300 border border-indigo-500/40 text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5">
                <Cpu size={12} className="animate-pulse" />
                {hpcMode === 'RUST_WASM' ? 'HPC Rust WebAssembly Natif' : 'SIMD Vectorisé Fallback'}
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-black uppercase tracking-wider">
                Réseau {networkId === 'hebdomadaire' ? 'Hebdomadaire (6 Tirages)' : 'Quotidien (22 Tirages)'}
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-purple-500/20 text-purple-300 border border-purple-500/30 text-[10px] font-black uppercase tracking-wider">
                AGENTS.md Conforme (100% Déterministe)
              </span>
            </div>

            <h2 className="text-xl md:text-2xl font-black tracking-tight">
              Dynamiques Complexes : Domino, Papillon, Cascade & Réaction en Chaîne
            </h2>
            <p className="text-xs text-indigo-200/80 mt-1 max-w-2xl leading-relaxed">
              Modélisation physique et stochastique des impulsions cinétiques, de la sensibilité aux conditions initiales (Lyapunov), de la diffusion thermique par le Laplacien de graphe et des avalanches d'auto-organisation critique (SOC).
            </p>
          </div>

          {chainReaction.imminentAvalancheAlert && (
            <div className="flex items-center gap-2 px-3 py-2 bg-rose-500/20 border border-rose-500/40 rounded-2xl text-rose-300 text-xs font-bold animate-pulse">
              <ShieldAlert size={16} />
              <span>Alerte Résonance Critique Détectée</span>
            </div>
          )}
        </div>
      </div>

      {/* 2. NUMÉROS PILOTES ISSUS DE LA FUSION DES DYNAMIQUES */}
      <div className="bg-white/80 dark:bg-slate-900/80 p-6 rounded-3xl border border-slate-200 dark:border-white/10 backdrop-blur-xl shadow-xl">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-amber-500" />
            <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 dark:text-white">
              Top 10 Numéros Émergents (Fusion Différentiable des 4 Phénomènes)
            </h3>
          </div>
          <span className="text-[11px] font-mono text-slate-400">
            Cible : {targetDraw}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 md:grid-cols-10 gap-2.5">
          {topDynamicCandidates.map((c, idx) => {
            const numStr = c.number < 10 ? `0${c.number}` : `${c.number}`;
            const isTop = idx < 3;
            return (
              <div
                key={c.number}
                className={`p-3 rounded-2xl border transition text-center flex flex-col items-center justify-between ${
                  isTop
                    ? 'bg-gradient-to-b from-indigo-500/10 to-purple-500/10 border-indigo-500/30 dark:border-indigo-500/40 shadow-sm'
                    : 'bg-slate-50/70 dark:bg-slate-800/40 border-slate-200 dark:border-white/5'
                }`}
              >
                <span className="text-[10px] font-mono text-slate-400 font-bold mb-1">
                  #{idx + 1}
                </span>

                <div
                  className={`w-11 h-11 rounded-2xl flex items-center justify-center font-black text-base shadow-md ${
                    isTop
                      ? 'bg-gradient-to-tr from-indigo-600 to-purple-600 text-white'
                      : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-200 dark:border-white/10'
                  }`}
                >
                  {numStr}
                </div>

                <div className="mt-2 w-full">
                  <div className="text-xs font-black text-indigo-600 dark:text-indigo-400 font-mono">
                    {c.score.toFixed(1)}%
                  </div>
                  <div className="flex flex-wrap gap-0.5 justify-center mt-1">
                    {c.flags.includes('DOMINO_IMPULSE') && (
                      <span className="px-1 py-0.2 rounded text-[8px] bg-amber-500/20 text-amber-600 dark:text-amber-400 font-mono font-bold" title="Impulsion cinétique domino">
                        DOM
                      </span>
                    )}
                    {c.flags.includes('AVALANCHE_RESONANCE') && (
                      <span className="px-1 py-0.2 rounded text-[8px] bg-rose-500/20 text-rose-600 dark:text-rose-400 font-mono font-bold" title="Avalanche critique">
                        SOC
                      </span>
                    )}
                    {c.flags.includes('CASCADE_CONDUCTOR') && (
                      <span className="px-1 py-0.2 rounded text-[8px] bg-purple-500/20 text-purple-600 dark:text-purple-400 font-mono font-bold" title="Conducteur de cascade">
                        CAS
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. SÉLECTEUR DE VUE DES 4 PHÉNOMÈNES */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <button
          onClick={() => {
            audioEngine.play('click');
            setActivePhenomenon('DOMINO');
          }}
          className={`p-4 rounded-2xl border text-left transition cursor-pointer ${
            activePhenomenon === 'DOMINO'
              ? 'bg-amber-500/10 border-amber-500/40 text-amber-900 dark:text-amber-200 shadow-md scale-101'
              : 'bg-white/80 dark:bg-slate-900/80 border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300'
          }`}
        >
          <div className="flex items-center gap-2 mb-1">
            <Zap size={16} className={activePhenomenon === 'DOMINO' ? 'text-amber-500 animate-pulse' : 'text-slate-400'} />
            <span className="text-xs font-black uppercase tracking-wider">1. Effet Domino</span>
          </div>
          <div className="text-lg font-black font-mono">
            γ = {domino.dampingGamma}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            Advection d'énergie séquentielle
          </div>
        </button>

        <button
          onClick={() => {
            audioEngine.play('click');
            setActivePhenomenon('BUTTERFLY');
          }}
          className={`p-4 rounded-2xl border text-left transition cursor-pointer ${
            activePhenomenon === 'BUTTERFLY'
              ? 'bg-sky-500/10 border-sky-500/40 text-sky-900 dark:text-sky-200 shadow-md scale-101'
              : 'bg-white/80 dark:bg-slate-900/80 border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300'
          }`}
        >
          <div className="flex items-center gap-2 mb-1">
            <Activity size={16} className={activePhenomenon === 'BUTTERFLY' ? 'text-sky-500 animate-pulse' : 'text-slate-400'} />
            <span className="text-xs font-black uppercase tracking-wider">2. Effet Papillon</span>
          </div>
          <div className="text-lg font-black font-mono">
            λ = {butterfly.lyapunovExponent > 0 ? `+${butterfly.lyapunovExponent}` : butterfly.lyapunovExponent}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            Exposant de Lyapunov & Chaos
          </div>
        </button>

        <button
          onClick={() => {
            audioEngine.play('click');
            setActivePhenomenon('CASCADE');
          }}
          className={`p-4 rounded-2xl border text-left transition cursor-pointer ${
            activePhenomenon === 'CASCADE'
              ? 'bg-indigo-500/10 border-indigo-500/40 text-indigo-900 dark:text-indigo-200 shadow-md scale-101'
              : 'bg-white/80 dark:bg-slate-900/80 border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300'
          }`}
        >
          <div className="flex items-center gap-2 mb-1">
            <GitBranch size={16} className={activePhenomenon === 'CASCADE' ? 'text-indigo-500 animate-pulse' : 'text-slate-400'} />
            <span className="text-xs font-black uppercase tracking-wider">3. Effet de Cascade</span>
          </div>
          <div className="text-lg font-black font-mono">
            K_t (t={cascade.diffusionTimeT})
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            Noyau de Chaleur Graph Laplacien
          </div>
        </button>

        <button
          onClick={() => {
            audioEngine.play('click');
            setActivePhenomenon('CHAIN');
          }}
          className={`p-4 rounded-2xl border text-left transition cursor-pointer ${
            activePhenomenon === 'CHAIN'
              ? 'bg-rose-500/10 border-rose-500/40 text-rose-900 dark:text-rose-200 shadow-md scale-101'
              : 'bg-white/80 dark:bg-slate-900/80 border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300'
          }`}
        >
          <div className="flex items-center gap-2 mb-1">
            <Flame size={16} className={activePhenomenon === 'CHAIN' ? 'text-rose-500 animate-pulse' : 'text-slate-400'} />
            <span className="text-xs font-black uppercase tracking-wider">4. Réaction en Chaîne</span>
          </div>
          <div className="text-lg font-black font-mono">
            {chainReaction.maxConstructiveAmplitude}%
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            Auto-organisation critique (SOC)
          </div>
        </button>
      </div>

      {/* 4. DÉTAIL DU PHÉNOMÈNE SÉLECTIONNÉ */}

      {/* PHÉNOMÈNE 1 : EFFET DOMINO */}
      {activePhenomenon === 'DOMINO' && (
        <div className="bg-white/80 dark:bg-slate-900/80 p-6 rounded-3xl border border-slate-200 dark:border-white/10 backdrop-blur-xl shadow-xl space-y-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2 pb-4 border-b border-slate-200 dark:border-white/5">
            <div>
              <div className="inline-flex items-center gap-2 px-2.5 py-0.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-lg text-xs font-bold uppercase tracking-wider mb-1">
                <Zap size={14} />
                Dynamique d'Advection Temporelle
              </div>
              <h3 className="text-lg font-black text-slate-900 dark:text-white">
                Effet Domino : Propagation Séquentielle & Ondes de Réverbération
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {domino.explanation}
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs font-mono text-slate-400">Vitesse de propagation</span>
              <div className="text-xl font-black font-mono text-amber-600 dark:text-amber-400">
                v = {domino.kineticVelocity} pas/tirage
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-2xl bg-amber-500/5 border border-amber-500/20">
              <h4 className="text-xs font-black uppercase text-amber-700 dark:text-amber-300 mb-2">
                Top 5 Numéros Porteurs d'Impulsion Cinétique
              </h4>
              <p className="text-xs text-slate-600 dark:text-slate-300 mb-3">
                Numéros recevant le transfert d'inertie direct ou réverbéré depuis le tirage précédent ({predecessorName}) :
              </p>
              <div className="flex flex-wrap gap-2">
                {domino.leadTriggerNumbers.map((num) => (
                  <div
                    key={num}
                    className="px-4 py-2 rounded-xl bg-amber-500 text-white font-black text-sm shadow-md flex items-center gap-2"
                  >
                    <span>{num < 10 ? `0${num}` : num}</span>
                    <span className="text-[10px] font-mono opacity-80">
                      ({domino.dominoEnergies[num]?.toFixed(1)}%)
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-white/5 space-y-3">
              <h4 className="text-xs font-black uppercase text-slate-700 dark:text-slate-300">
                Paramètres d'Onde & Amortissement Continu
              </h4>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between items-center py-1 border-b border-slate-200 dark:border-white/5">
                  <span className="text-slate-500">Facteur d'amortissement γ :</span>
                  <span className="font-mono font-bold">{domino.dampingGamma} (dérivé de la variance)</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-200 dark:border-white/5">
                  <span className="text-slate-500">Taux de réverbération harmonique :</span>
                  <span className="font-mono font-bold text-amber-600 dark:text-amber-400">{domino.harmonicReverberationRate}%</span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-slate-500">Ondes miroirs et compléments 91 :</span>
                  <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">Activées (Non-linéaires)</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PHÉNOMÈNE 2 : EFFET PAPILLON */}
      {activePhenomenon === 'BUTTERFLY' && (
        <div className="bg-white/80 dark:bg-slate-900/80 p-6 rounded-3xl border border-slate-200 dark:border-white/10 backdrop-blur-xl shadow-xl space-y-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2 pb-4 border-b border-slate-200 dark:border-white/5">
            <div>
              <div className="inline-flex items-center gap-2 px-2.5 py-0.5 bg-sky-500/10 text-sky-600 dark:text-sky-400 rounded-lg text-xs font-bold uppercase tracking-wider mb-1">
                <Activity size={14} />
                Dynamique du Chaos Déterministe
              </div>
              <h3 className="text-lg font-black text-slate-900 dark:text-white">
                Effet Papillon : Exposant de Lyapunov & Espace des Phases
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {butterfly.divergenceDescription}
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs font-mono text-slate-400">Régime de Sensibilité</span>
              <div className={`text-sm font-black uppercase px-2.5 py-1 rounded-xl ${
                butterfly.isChaotic
                  ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20'
                  : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
              }`}>
                {butterfly.regimeLabel}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-2xl bg-sky-500/5 border border-sky-500/20 text-center">
              <div className="text-[11px] font-bold text-sky-700 dark:text-sky-300 uppercase">
                Exposant de Lyapunov Local
              </div>
              <div className="text-3xl font-black font-mono mt-2 text-sky-600 dark:text-sky-400">
                λ = {butterfly.lyapunovExponent}
              </div>
              <p className="text-[10px] text-slate-500 mt-2">
                {butterfly.lyapunovExponent > 0
                  ? 'Divergence exponentielle des micro-écarts (régime chaotique contrôlé)'
                  : 'Convergence vers un attracteur stable périodique'}
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-white/5 text-center">
              <div className="text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase">
                Facteur de Sensibilité Continue
              </div>
              <div className="text-3xl font-black font-mono mt-2 text-indigo-600 dark:text-indigo-400">
                {(butterfly.sensitivityRegime * 100).toFixed(1)}%
              </div>
              <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full mt-3 overflow-hidden">
                <div
                  className="bg-indigo-500 h-full rounded-full transition-all duration-500"
                  style={{ width: `${butterfly.sensitivityRegime * 100}%` }}
                />
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-white/5 space-y-2">
              <div className="text-[11px] font-bold text-slate-600 dark:text-slate-300 uppercase">
                Coordonnées Attracteur 3D
              </div>
              <div className="text-xs space-y-1 font-mono">
                <div className="flex justify-between">
                  <span className="text-slate-500">Vitesse Δx (vx) :</span>
                  <span className="font-bold">{butterfly.phaseAttractor.velocity}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Accélération Δ²x (ax) :</span>
                  <span className="font-bold">{butterfly.phaseAttractor.acceleration}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Dimension de Hurst (H) :</span>
                  <span className="font-bold text-amber-500">{butterfly.phaseAttractor.fractalHurst}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PHÉNOMÈNE 3 : EFFET DE CASCADE (GRAPH HEAT KERNEL) */}
      {activePhenomenon === 'CASCADE' && (
        <div className="bg-white/80 dark:bg-slate-900/80 p-6 rounded-3xl border border-slate-200 dark:border-white/10 backdrop-blur-xl shadow-xl space-y-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2 pb-4 border-b border-slate-200 dark:border-white/5">
            <div>
              <div className="inline-flex items-center gap-2 px-2.5 py-0.5 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-lg text-xs font-bold uppercase tracking-wider mb-1">
                <GitBranch size={14} />
                Diffusion Thermique sur Graphe All-to-All
              </div>
              <h3 className="text-lg font-black text-slate-900 dark:text-white">
                Effet de Cascade : Noyau de Chaleur Graph Heat Kernel exp(-tL)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {cascade.explanation}
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs font-mono text-slate-400">Énergie Trace Tr(K_t)</span>
              <div className="text-xl font-black font-mono text-indigo-600 dark:text-indigo-400">
                {cascade.traceEnergy}
              </div>
            </div>
          </div>

          {/* CONDUCTEURS PRINCIPAUX DE LA CASCADE */}
          <div>
            <h4 className="text-xs font-black uppercase text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
              <TrendingUp size={14} className="text-indigo-500" />
              Tirages Polarisants (Plus Forte Centralité Harmonique dans le Réseau)
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5">
              {cascade.primaryConductors.map((cond, i) => (
                <div
                  key={cond.drawName}
                  className={`p-3 rounded-2xl border transition ${
                    cond.drawName === targetDraw
                      ? 'bg-indigo-500/10 border-indigo-500/40 shadow-sm'
                      : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-white/5'
                  }`}
                >
                  <div className="flex justify-between items-center text-[10px] text-slate-400 font-mono">
                    <span>Rank #{i + 1}</span>
                    {cond.drawName === targetDraw && <span className="font-bold text-indigo-500">Cible</span>}
                  </div>
                  <div className="font-black text-xs text-slate-800 dark:text-slate-200 mt-1 truncate">
                    {cond.drawName}
                  </div>
                  <div className="text-xs font-black font-mono text-indigo-600 dark:text-indigo-400 mt-1">
                    Centralité : {(cond.centrality * 100).toFixed(1)}%
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* TABLE DES CHEMINS DE CONDUCTION DIRECTS VS DIFFUSIFS */}
          <div>
            <h4 className="text-xs font-black uppercase text-slate-700 dark:text-slate-300 mb-3">
              Chemins de Conduction vers {targetDraw} (Direct vs Cascade Multi-Sauts)
            </h4>
            <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-white/5">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 uppercase text-[10px] font-bold">
                  <tr>
                    <th className="p-3">Tirage Source</th>
                    <th className="p-3">Conductance Directe (W_ij)</th>
                    <th className="p-3">Diffusivité Heat Kernel (K_t)</th>
                    <th className="p-3">Amplification Indirecte</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-white/5">
                  {cascade.conductionPaths.map((p) => (
                    <tr key={p.sourceDraw} className="hover:bg-slate-500/5 transition">
                      <td className="p-3 font-bold text-slate-800 dark:text-slate-200">
                        {p.sourceDraw}
                      </td>
                      <td className="p-3 font-mono">
                        {(p.directConductance * 100).toFixed(1)}%
                      </td>
                      <td className="p-3 font-mono font-bold text-indigo-600 dark:text-indigo-400">
                        {(p.heatKernelDiffusivity * 100).toFixed(1)}%
                      </td>
                      <td className="p-3 font-mono">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          p.indirectAmplification > 1.2
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                            : 'bg-slate-500/10 text-slate-500'
                        }`}>
                          x{p.indirectAmplification.toFixed(2)}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        {onSelectDraw && (
                          <button
                            onClick={() => {
                              audioEngine.play('click');
                              onSelectDraw(p.sourceDraw);
                            }}
                            className="px-2.5 py-1 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 font-bold text-[10px] uppercase transition cursor-pointer"
                          >
                            Analyser
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* PHÉNOMÈNE 4 : RÉACTION EN CHAÎNE */}
      {activePhenomenon === 'CHAIN' && (
        <div className="bg-white/80 dark:bg-slate-900/80 p-6 rounded-3xl border border-slate-200 dark:border-white/10 backdrop-blur-xl shadow-xl space-y-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2 pb-4 border-b border-slate-200 dark:border-white/5">
            <div>
              <div className="inline-flex items-center gap-2 px-2.5 py-0.5 bg-rose-500/10 text-rose-600 dark:text-rose-400 rounded-lg text-xs font-bold uppercase tracking-wider mb-1">
                <Flame size={14} />
                Auto-Organisation Critique (SOC) & Interférence
              </div>
              <h3 className="text-lg font-black text-slate-900 dark:text-white">
                Réaction en Chaîne : Résonance d'Interférence Constructive & Avalanche
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {chainReaction.explanation}
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs font-mono text-slate-400">Densité de Percolation</span>
              <div className="text-xl font-black font-mono text-rose-600 dark:text-rose-400">
                {chainReaction.percolationDensity}%
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-2xl bg-rose-500/5 border border-rose-500/20">
              <h4 className="text-xs font-black uppercase text-rose-700 dark:text-rose-300 mb-2">
                Numéros en Danger d'Avalanche Imminente (Pic de Stress Cumulé)
              </h4>
              <p className="text-xs text-slate-600 dark:text-slate-300 mb-3">
                Ces 5 numéros ont atteint le seuil critique d'accumulation de retard et d'interférence constructive des ondes inter-tirages :
              </p>
              <div className="flex flex-wrap gap-2">
                {chainReaction.avalancheCriticalNumbers.map((num) => (
                  <div
                    key={num}
                    className="px-4 py-2 rounded-xl bg-gradient-to-r from-rose-600 to-amber-600 text-white font-black text-sm shadow-md flex items-center gap-2"
                  >
                    <span>{num < 10 ? `0${num}` : num}</span>
                    <span className="text-[10px] font-mono opacity-80">
                      ({chainReaction.resonanceSpectrum[num]?.toFixed(1)}%)
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-white/5 space-y-3">
              <h4 className="text-xs font-black uppercase text-slate-700 dark:text-slate-300">
                Métriques de Synchronisation Interférométrique
              </h4>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between items-center py-1 border-b border-slate-200 dark:border-white/5">
                  <span className="text-slate-500">Amplitude Constructive Maximale :</span>
                  <span className="font-mono font-bold text-rose-600 dark:text-rose-400">
                    {chainReaction.maxConstructiveAmplitude}%
                  </span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-200 dark:border-white/5">
                  <span className="text-slate-500">Phase de synchronisation critique :</span>
                  <span className="font-mono font-bold">{chainReaction.criticalSyncPhase} rad</span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-slate-500">Alerte Déclenchement Coordonné :</span>
                  <span className={`font-mono font-bold ${
                    chainReaction.imminentAvalancheAlert ? 'text-rose-500 animate-pulse' : 'text-slate-400'
                  }`}>
                    {chainReaction.imminentAvalancheAlert ? 'ALERTE ACTIVE' : 'En veille stable'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
