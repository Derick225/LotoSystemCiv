import React, { useState, useMemo } from "react";
import {
  InterDrawNetworkMatrix,
  InterDrawNodeCoupling
} from "../../services/interDrawService";
import { InterDrawNetworkId } from "../../constants";
import { audioEngine } from "../../utils/audioEngine";
import {
  Network,
  Activity,
  Layers,
  ArrowRight,
  TrendingUp,
  ShieldCheck,
  Info,
  Filter,
  BarChart3,
  Sparkles
} from "lucide-react";

interface InterDrawNetworkMatrixViewProps {
  networkMatrix?: InterDrawNetworkMatrix;
  networkId: InterDrawNetworkId;
  targetDraw: string;
  onSelectDraw?: (drawName: string) => void;
}

export const InterDrawNetworkMatrixView: React.FC<InterDrawNetworkMatrixViewProps> = ({
  networkMatrix,
  networkId,
  targetDraw,
  onSelectDraw
}) => {
  const [selectedSource, setSelectedSource] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [sortBy, setSortBy] = useState<'WEIGHT' | 'CORRELATION' | 'CARRYOVER'>('WEIGHT');

  const drawNames = useMemo(() => networkMatrix?.drawNames || [], [networkMatrix]);
  const couplings = useMemo(() => networkMatrix?.couplings || [], [networkMatrix]);

  // Couplages filtrés pour le tirage cible ou la source sélectionnée
  const filteredCouplings = useMemo(() => {
    let list = couplings;

    if (selectedSource !== "ALL") {
      list = list.filter(c => c.sourceName === selectedSource || c.targetName === selectedSource);
    } else if (targetDraw) {
      // Par défaut, montrer les couplages liés au tirage cible
      list = list.filter(c => c.targetName === targetDraw || c.sourceName === targetDraw);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(c => c.sourceName.toLowerCase().includes(q) || c.targetName.toLowerCase().includes(q));
    }

    return [...list].sort((a, b) => {
      if (sortBy === 'WEIGHT') return b.weight - a.weight;
      if (sortBy === 'CORRELATION') return b.correlation - a.correlation;
      if (sortBy === 'CARRYOVER') return b.carryOverRate - a.carryOverRate;
      return 0;
    });
  }, [couplings, selectedSource, targetDraw, searchQuery, sortBy]);

  const maxWeight = useMemo(() => {
    return Math.max(0.01, ...couplings.map(c => c.weight));
  }, [couplings]);

  if (!networkMatrix || drawNames.length === 0) {
    return (
      <div className="p-8 text-center bg-white/70 dark:bg-slate-900/70 rounded-3xl border border-slate-200 dark:border-white/10 space-y-3">
        <Network size={28} className="mx-auto text-indigo-400 opacity-60" />
        <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
          Matrice d'interconnexion en cours de vectorisation...
        </p>
        <p className="text-xs text-slate-500">
          Calcul déterministe des corrélations de Pearson et des reports continus sur l'historique complet.
        </p>
      </div>
    );
  }

  const isHebdo = networkId === 'hebdomadaire';

  return (
    <div className="space-y-6">
      {/* 1. CARTE RÉSUMÉ ARCHITECTURALE DU RÉSEAU FERMÉ */}
      <div className="p-6 bg-white/80 dark:bg-slate-900/80 rounded-3xl border border-slate-200 dark:border-white/10 backdrop-blur-xl shadow-xl space-y-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-500/10 border border-indigo-500/20 text-indigo-500 dark:text-indigo-400 font-black text-[10px] rounded-lg uppercase tracking-wider">
              <Network size={13} className="animate-pulse" />
              Graphe Complet All-to-All (AGENTS.md)
            </div>
            <h3 className="text-lg md:text-xl font-black text-slate-900 dark:text-white mt-1">
              Matrice d'Interconnexion Continue du Réseau {isHebdo ? "Hebdomadaire (6 tirages)" : "Quotidien (22 tirages)"}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Chaque tirage est relié à tous les autres tirages du même réseau fermé avec un poids continu différentiable sans seuil binaire.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-xs font-bold">
              <ShieldCheck size={14} />
              Zéro Pollution Inter-Réseaux
            </span>
          </div>
        </div>

        {/* STATS RAPIDES */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
          <div className="p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-white/5">
            <span className="text-[10px] font-bold text-slate-500 uppercase block">Tirages Connectés</span>
            <span className="text-lg font-black text-slate-900 dark:text-white font-mono mt-0.5 block">
              {drawNames.length} tirages
            </span>
            <span className="text-[10px] text-slate-400 font-medium">Graphe {isHebdo ? "K₆" : "K₂₂"} complet</span>
          </div>

          <div className="p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-white/5">
            <span className="text-[10px] font-bold text-slate-500 uppercase block">Couplages Modélisés</span>
            <span className="text-lg font-black text-indigo-500 font-mono mt-0.5 block">
              {couplings.length} flux
            </span>
            <span className="text-[10px] text-slate-400 font-medium">Relations orientées</span>
          </div>

          <div className="p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-white/5">
            <span className="text-[10px] font-bold text-slate-500 uppercase block">Couplage Moyen Réseau</span>
            <span className="text-lg font-black text-amber-500 font-mono mt-0.5 block">
              {(networkMatrix.meanNetworkCoupling * 100).toFixed(1)}%
            </span>
            <span className="text-[10px] text-slate-400 font-medium">W̄(A, B) sigmoïde</span>
          </div>

          <div className="p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-white/5">
            <span className="text-[10px] font-bold text-slate-500 uppercase block">Herméticité</span>
            <span className="text-lg font-black text-emerald-500 font-mono mt-0.5 block">
              100%
            </span>
            <span className="text-[10px] text-slate-400 font-medium">Isolation de cache stricte</span>
          </div>
        </div>
      </div>

      {/* 2. FILTRES ET EXPLORATION DU GRAPHE */}
      <div className="p-5 bg-white/80 dark:bg-slate-900/80 rounded-3xl border border-slate-200 dark:border-white/10 backdrop-blur-xl shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <div className="flex items-center gap-2">
            <Filter size={14} className="text-indigo-500" />
            <span className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">
              Explorer les Liens de Transmission
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl border border-slate-200 dark:border-white/5 text-xs">
              <span className="text-[10px] font-bold px-2 text-slate-500">Trier par :</span>
              <button
                onClick={() => setSortBy('WEIGHT')}
                className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition ${
                  sortBy === 'WEIGHT' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                Poids W
              </button>
              <button
                onClick={() => setSortBy('CORRELATION')}
                className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition ${
                  sortBy === 'CORRELATION' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                Pearson r
              </button>
              <button
                onClick={() => setSortBy('CARRYOVER')}
                className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition ${
                  sortBy === 'CARRYOVER' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                Report %
              </button>
            </div>
          </div>
        </div>

        {/* Sélecteur de tirage focus */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
          <button
            onClick={() => {
              audioEngine.play("click");
              setSelectedSource("ALL");
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer ${
              selectedSource === "ALL"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200"
            }`}
          >
            Tous les flux ({targetDraw ? `Focus: ${targetDraw}` : 'Réseau'})
          </button>
          {drawNames.map(name => (
            <button
              key={`focus-${name}`}
              onClick={() => {
                audioEngine.play("click");
                setSelectedSource(name);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                selectedSource === name
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30"
                  : name === targetDraw
                  ? "bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-400/40"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200"
              }`}
            >
              {name}
            </button>
          ))}
        </div>

        {/* LISTE DES COUPLAGES DU RÉSEAU */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
          {filteredCouplings.slice(0, 36).map((c, idx) => {
            const isTargetInvolved = c.targetName === targetDraw || c.sourceName === targetDraw;
            const pct = Math.round(c.weight * 100);

            return (
              <div
                key={`coupling-${c.sourceName}-${c.targetName}-${idx}`}
                className={`p-4 rounded-2xl border transition-all flex flex-col justify-between ${
                  isTargetInvolved
                    ? "bg-indigo-50/50 dark:bg-indigo-950/30 border-indigo-400/30 shadow-sm"
                    : "bg-slate-50/80 dark:bg-slate-800/40 border-slate-200 dark:border-white/5"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-xs font-black text-slate-900 dark:text-white">
                      <span className="truncate max-w-[100px]">{c.sourceName}</span>
                      <ArrowRight size={12} className="text-indigo-500 shrink-0" />
                      <span className="truncate max-w-[100px] text-indigo-600 dark:text-indigo-400">{c.targetName}</span>
                    </div>

                    <span className="px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-mono text-xs font-black">
                      W = {(c.weight).toFixed(3)}
                    </span>
                  </div>

                  {/* Barre visuelle d'intensité */}
                  <div className="w-full bg-slate-200 dark:bg-slate-700/60 h-2 rounded-full mt-3 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-indigo-500 to-amber-500 rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(100, Math.max(5, (c.weight / maxWeight) * 100))}%` }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-3 mt-3 border-t border-slate-200 dark:border-white/5 text-[10px]">
                  <div>
                    <span className="text-slate-400 block font-medium">Pearson r</span>
                    <span className={`font-mono font-bold ${c.correlation >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                      {c.correlation >= 0 ? `+${c.correlation.toFixed(3)}` : c.correlation.toFixed(3)}
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-400 block font-medium">Report</span>
                    <span className="font-mono font-bold text-amber-500">
                      {c.carryOverRate.toFixed(1)}%
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-400 block font-medium">Cycles</span>
                    <span className="font-mono font-bold text-slate-600 dark:text-slate-300">
                      {c.samplePairs}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {filteredCouplings.length === 0 && (
          <p className="text-center py-6 text-xs text-slate-400 italic">
            Aucun couplage correspondant au filtre sélectionné.
          </p>
        )}
      </div>
    </div>
  );
};
