import React, { useState, useEffect } from 'react';
import {
  generateDnaEvolutionReport,
  DnaEvolutionReport,
  ModelDnaRecord,
} from '../../services/prediction/modelDnaKnowledgeBase';
import { audioEngine } from '../../utils/audioEngine';
import { useToast } from '../ui/Toast';
import {
  Dna,
  GitBranch,
  TrendingUp,
  ShieldCheck,
  Cpu,
  RefreshCw,
  Sparkles,
  Layers,
  ArrowUpRight,
  Activity,
} from 'lucide-react';

interface ModelDnaEvolutionPanelProps {
  drawName: string;
}

export const ModelDnaEvolutionPanel: React.FC<ModelDnaEvolutionPanelProps> = ({ drawName }) => {
  const { showToast } = useToast();
  const [report, setReport] = useState<DnaEvolutionReport | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const loadReport = async () => {
    try {
      setLoading(true);
      const rep = await generateDnaEvolutionReport(drawName);
      setReport(rep);
    } catch (e: any) {
      showToast(e.message || "Erreur de chargement de la base ADN", 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReport();
  }, [drawName]);

  const avgPareto = report && report.generations.length > 0
    ? report.generations.reduce((s, g) => s + (g.paretoEfficiency || 0), 0) / report.generations.length
    : 0;

  return (
    <div id="model-dna-evolution-panel" className="w-full space-y-6 bg-slate-900/60 p-6 rounded-3xl border border-white/5 shadow-xl font-sans">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-black text-[10px] rounded-lg uppercase tracking-wider">
            <Dna size={13} className="text-emerald-400 animate-pulse" />
            Model DNA Knowledge Base & Phylogenetic Tree
          </div>
          <h3 className="text-lg md:text-xl font-black text-white uppercase tracking-tight">
            Base de Connaissances ADN & Traçabilité des Modèles
          </h3>
          <p className="text-xs text-slate-400">
            Historique phylogénétique des mutations de poids, gains de fitness relatifs et frontières de Pareto pour <span className="font-bold text-white">{drawName}</span>.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-950 rounded-xl border border-white/10 text-[10px] font-mono text-emerald-400">
            <ShieldCheck size={12} className="text-emerald-400" />
            <span>Isolation Stricte Active</span>
          </div>
          <button
            onClick={() => {
              audioEngine.play('click');
              loadReport();
            }}
            disabled={loading}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-all"
            title="Rafraîchir"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin text-emerald-400' : ''} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center space-y-2">
          <RefreshCw className="animate-spin text-emerald-400 mx-auto" size={24} />
          <p className="text-xs text-slate-400 font-mono">Lecture de la phylogénie génomique...</p>
        </div>
      ) : report ? (
        <div className="space-y-6">
          {/* STATS OVERVIEW */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 bg-slate-950/80 rounded-2xl border border-white/5 space-y-1">
              <span className="text-[10px] font-black uppercase text-slate-400">Générations Totales</span>
              <span className="text-2xl font-black font-mono text-white block">
                {report.totalGenerations}
              </span>
              <span className="text-[9px] text-slate-500 font-mono">
                Arbre Généalogique
              </span>
            </div>

            <div className="p-4 bg-slate-950/80 rounded-2xl border border-white/5 space-y-1">
              <span className="text-[10px] font-black uppercase text-slate-400">Gain Net de Fitness</span>
              <span className={`text-2xl font-black font-mono block ${report.netFitnessGain >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {report.netFitnessGain > 0 ? `+${report.netFitnessGain.toFixed(1)}` : report.netFitnessGain.toFixed(1)}%
              </span>
              <span className="text-[9px] text-slate-500 font-mono">
                vs Génération Initiale
              </span>
            </div>

            <div className="p-4 bg-slate-950/80 rounded-2xl border border-white/5 space-y-1">
              <span className="text-[10px] font-black uppercase text-slate-400">Efficacité de Pareto</span>
              <span className="text-2xl font-black font-mono text-cyan-400 block">
                {avgPareto.toFixed(1)}%
              </span>
              <span className="text-[9px] text-slate-500 font-mono">
                Compromis Biais / Variance
              </span>
            </div>

            <div className="p-4 bg-slate-950/80 rounded-2xl border border-white/5 space-y-1">
              <span className="text-[10px] font-black uppercase text-slate-400">Régime d'Évolution</span>
              <span className="text-sm font-black font-mono text-amber-400 block uppercase truncate mt-1">
                {report.stabilityTrend}
              </span>
              <span className="text-[9px] text-slate-500 font-mono">
                Stabilité Génétique
              </span>
            </div>
          </div>

          {/* GENERATIONS TIMELINE TABLE */}
          <div className="space-y-3">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <GitBranch size={14} className="text-emerald-400" />
              Historique des Versions & Mutations Génétiques
            </h4>

            {report.generations.length === 0 ? (
              <div className="p-6 bg-slate-950/50 rounded-2xl border border-white/5 text-center text-xs text-slate-400 italic">
                Aucune génération de modèle encore enregistrée pour ce tirage.
              </div>
            ) : (
              <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                {report.generations.map((snap: ModelDnaRecord) => (
                  <div
                    key={snap.id}
                    className="p-4 bg-slate-950/70 rounded-2xl border border-white/5 hover:border-white/10 transition-all space-y-2 text-xs"
                  >
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                      <div className="flex items-center gap-2.5">
                        <span className="px-2 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-400 font-mono font-black text-[10px] border border-emerald-500/20">
                          Gen {snap.generation}
                        </span>
                        <span className="font-bold text-white uppercase text-[11px]">
                          {snap.source}
                        </span>
                        {snap.relativeGain !== undefined && (
                          <span className={`text-[10px] font-mono font-bold flex items-center gap-0.5 ${snap.relativeGain >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            <ArrowUpRight size={11} />
                            {snap.relativeGain > 0 ? `+${snap.relativeGain.toFixed(1)}%` : `${snap.relativeGain.toFixed(1)}%`}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 text-[10px] font-mono text-slate-400">
                        <span>Fitness : <strong className="text-white">{snap.fitnessScore.toFixed(1)}</strong></span>
                        <span>Pareto : <strong className="text-cyan-400">{snap.paretoEfficiency.toFixed(0)}%</strong></span>
                        <span>{new Date(snap.timestamp).toLocaleDateString()}</span>
                      </div>
                    </div>

                    {/* TOP MUTATIONS DELTA */}
                    {Object.keys(snap.mutationDelta || {}).length > 0 && (
                      <div className="flex items-center gap-1.5 flex-wrap pt-1">
                        <span className="text-[9px] text-slate-500 font-bold uppercase mr-1">Mutations :</span>
                        {Object.entries(snap.mutationDelta).slice(0, 6).map(([algo, delta]) => {
                          const numDelta = Number(delta);
                          return (
                            <span
                              key={algo}
                              className={`px-1.5 py-0.5 rounded text-[9px] font-mono ${
                                numDelta > 0
                                  ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                                  : 'bg-rose-500/10 text-rose-300 border border-rose-500/20'
                              }`}
                            >
                              {algo}: {numDelta > 0 ? `+${(numDelta * 100).toFixed(1)}%` : `${(numDelta * 100).toFixed(1)}%`}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
};
