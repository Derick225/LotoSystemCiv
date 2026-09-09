import React, { useState, useMemo } from "react";
import { useNexusStore } from "../../store/useNexusStore";
import {
  calculateBoulonnierCorrelationReport,
  SynchronizedNumberProfile,
  CrossCorrelationPair,
} from "../../services/boulonnierCorrelationService";
import { NumberBall } from "../NumberBall";
import {
  Network,
  Activity,
  ArrowRight,
  Sparkles,
  GitCompare,
  Layers,
  Clock,
  Wrench,
  Gauge,
  Sliders,
  Filter,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  TrendingUp,
  Share2,
  Zap,
} from "lucide-react";
import { audioEngine } from "../../utils/audioEngine";

export const BoulonnierCrossCorrelationTab: React.FC<{ drawName?: string }> = ({
  drawName,
}) => {
  const history = useNexusStore((state) => state.history);
  const activeDrawName = useNexusStore((state) => state.drawName) || drawName || "Reveil";

  const [activeView, setActiveView] = useState<
    "comparison" | "matrix" | "daily_flow" | "sectors"
  >("comparison");

  const [filterType, setFilterType] = useState<
    "all" | "harmonique" | "soir" | "zenith" | "divergent" | "sector1" | "sector2" | "sector3" | "sector4" | "sector5"
  >("all");

  const [sortBy, setSortBy] = useState<
    "number" | "syncScore" | "freq10H" | "freq16H" | "freq19H55" | "boulonnierA" | "syncDelta"
  >("syncScore");

  const [selectedProfile, setSelectedProfile] = useState<SynchronizedNumberProfile | null>(null);

  // Rapport statistique complet sans nombres magiques
  const report = useMemo(() => {
    return calculateBoulonnierCorrelationReport(history);
  }, [history]);

  // Filtrage et tri des numéros synchronisés
  const filteredProfiles = useMemo(() => {
    let list = [...report.synchronizedNumbers];

    if (filterType === "harmonique") {
      list = list.filter((p) => p.classification === "HARMONIQUE_A");
    } else if (filterType === "soir") {
      list = list.filter((p) => p.classification === "INERTIE_SOIR");
    } else if (filterType === "zenith") {
      list = list.filter((p) => p.classification === "ZENITH_ISOLE");
    } else if (filterType === "divergent") {
      list = list.filter((p) => p.classification === "DIVERGENT");
    } else if (filterType.startsWith("sector")) {
      const secNum = parseInt(filterType.replace("sector", ""), 10);
      list = list.filter((p) => p.sector === secNum);
    }

    list.sort((a, b) => {
      if (sortBy === "syncScore") return b.syncResonanceScore - a.syncResonanceScore;
      if (sortBy === "number") return a.number - b.number;
      if (sortBy === "freq10H") return b.freq10H - a.freq10H;
      if (sortBy === "freq16H") return b.freq16H - a.freq16H;
      if (sortBy === "freq19H55") return b.freq19H55 - a.freq19H55;
      if (sortBy === "boulonnierA") return b.boulonnierAFreq - a.boulonnierAFreq;
      if (sortBy === "syncDelta") return a.syncDelta - b.syncDelta;
      return 0;
    });

    return list;
  }, [report.synchronizedNumbers, filterType, sortBy]);

  const pair10_16 = report.correlations.find(
    (c) => c.sourceName.includes("10H") && c.targetName.includes("16H")
  );
  const pair10_19 = report.correlations.find(
    (c) => c.sourceName.includes("10H") && c.targetName.includes("19H55")
  );
  const pair16_19 = report.correlations.find(
    (c) => c.sourceName.includes("16H") && c.targetName.includes("19H55")
  );

  return (
    <div className="w-full space-y-6 pb-12 animate-fade-in font-sans">
      {/* HEADER DU MODULE */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-900/60 p-6 rounded-3xl border border-white/5 backdrop-blur-xl relative overflow-hidden shadow-2xl">
        <div className="space-y-1.5 relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-500/10 border border-amber-500/20 text-amber-400 font-black text-[10px] rounded-lg uppercase tracking-wider">
            <Network size={13} className="text-amber-400 animate-pulse" />
            Topologie Balistique & Corrélation Multi-Créneaux
          </div>
          <h2 className="text-2xl md:text-3xl font-black text-white uppercase tracking-tight flex items-center gap-3">
            Corrélation Croisée des Boulonniers
          </h2>
          <p className="text-xs text-slate-400 font-medium max-w-2xl">
            Analyse comparative des fréquences et des dynamiques stochastiques entre les tirages de <span className="text-amber-300 font-bold">10H00</span>, <span className="text-orange-300 font-bold">16H00</span> et <span className="text-indigo-300 font-bold">19H55</span> reliés par la topologie mécanique des appareils.
          </p>
        </div>

        <div className="flex items-center gap-3 relative z-10 flex-wrap">
          <div className="px-4 py-2 bg-slate-950/80 rounded-2xl border border-white/10 text-right">
            <span className="text-[10px] text-slate-500 font-bold block uppercase">
              Tirages Analysés
            </span>
            <span className="text-xl font-black font-mono text-amber-400">
              {report.totalAnalyzedDraws}
            </span>
          </div>
          <div className="px-4 py-2 bg-slate-950/80 rounded-2xl border border-white/10 text-right">
            <span className="text-[10px] text-slate-500 font-bold block uppercase">
              Couplage 10H-16H
            </span>
            <span className="text-xl font-black font-mono text-emerald-400">
              r = {pair10_16?.pearsonR.toFixed(3) ?? "0.000"}
            </span>
          </div>
        </div>
      </div>

      {/* BANNIÈRE MATÉRIELLE DES 3 CRÉNEAUX SYNCHRONISÉS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Créneau 10H */}
        <div className="p-5 rounded-2xl bg-gradient-to-br from-amber-500/10 via-slate-900/80 to-slate-950/90 border border-amber-500/20 space-y-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <span className="text-lg">🌅</span>
              <span className="text-xs font-black uppercase text-amber-300">
                10H00 Matin
              </span>
            </div>
            <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
              Boulonnier A
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black font-mono text-white">
              {report.slots.slot10H.totalDraws} <span className="text-xs text-slate-500 font-normal">tirages</span>
            </span>
            <span className="text-[10px] text-slate-400 font-mono">
              Entropie: {report.slots.slot10H.entropy.toFixed(2)} bits
            </span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] text-slate-400 font-bold">Top Sorties :</span>
            {report.slots.slot10H.topNumbers.slice(0, 5).map((t) => (
              <span
                key={t.number}
                className="px-2 py-0.5 rounded-lg bg-amber-500/20 text-amber-200 text-xs font-mono font-black border border-amber-500/30"
              >
                {t.number}
              </span>
            ))}
          </div>
        </div>

        {/* Créneau 16H */}
        <div className="p-5 rounded-2xl bg-gradient-to-br from-orange-500/10 via-slate-900/80 to-slate-950/90 border border-orange-500/20 space-y-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <span className="text-lg">🌤️</span>
              <span className="text-xs font-black uppercase text-orange-300">
                16H00 Après-Midi
              </span>
            </div>
            <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
              Boulonnier A (Partagé)
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black font-mono text-white">
              {report.slots.slot16H.totalDraws} <span className="text-xs text-slate-500 font-normal">tirages</span>
            </span>
            <span className="text-[10px] text-slate-400 font-mono">
              Entropie: {report.slots.slot16H.entropy.toFixed(2)} bits
            </span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] text-slate-400 font-bold">Top Sorties :</span>
            {report.slots.slot16H.topNumbers.slice(0, 5).map((t) => (
              <span
                key={t.number}
                className="px-2 py-0.5 rounded-lg bg-orange-500/20 text-orange-200 text-xs font-mono font-black border border-orange-500/30"
              >
                {t.number}
              </span>
            ))}
          </div>
        </div>

        {/* Créneau 19H55 */}
        <div className="p-5 rounded-2xl bg-gradient-to-br from-indigo-500/10 via-slate-900/80 to-slate-950/90 border border-indigo-500/20 space-y-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <span className="text-lg">🌙</span>
              <span className="text-xs font-black uppercase text-indigo-300">
                19H55 Soir
              </span>
            </div>
            <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              Boulonnier C & A
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-black font-mono text-white">
              {report.slots.slot19H55.totalDraws} <span className="text-xs text-slate-500 font-normal">tirages</span>
            </span>
            <span className="text-[10px] text-slate-400 font-mono">
              Entropie: {report.slots.slot19H55.entropy.toFixed(2)} bits
            </span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] text-slate-400 font-bold">Top Sorties :</span>
            {report.slots.slot19H55.topNumbers.slice(0, 5).map((t) => (
              <span
                key={t.number}
                className="px-2 py-0.5 rounded-lg bg-indigo-500/20 text-indigo-200 text-xs font-mono font-black border border-indigo-500/30"
              >
                {t.number}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* NAVIGATION INTERNE DU MODULE */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/80 p-2 rounded-2xl border border-white/5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => {
              audioEngine.play("click");
              setActiveView("comparison");
            }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeView === "comparison"
                ? "bg-amber-500 text-slate-950 shadow-md font-black"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <GitCompare size={14} />
            Comparateur de Fréquences (1-90)
          </button>
          <button
            onClick={() => {
              audioEngine.play("click");
              setActiveView("matrix");
            }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeView === "matrix"
                ? "bg-amber-500 text-slate-950 shadow-md font-black"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Layers size={14} />
            Matrice de Corrélation Croisée
          </button>
          <button
            onClick={() => {
              audioEngine.play("click");
              setActiveView("daily_flow");
            }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeView === "daily_flow"
                ? "bg-amber-500 text-slate-950 shadow-md font-black"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Clock size={14} />
            Flux Intra-Journalier (10H → 16H → 19H55)
          </button>
          <button
            onClick={() => {
              audioEngine.play("click");
              setActiveView("sectors");
            }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeView === "sectors"
                ? "bg-amber-500 text-slate-950 shadow-md font-black"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Gauge size={14} />
            Distribution Balistique Tambours
          </button>
        </div>

        <div className="text-[10px] text-slate-400 font-mono px-3">
          {filteredProfiles.length} numéros filtrés
        </div>
      </div>

      {/* VUE 1 : COMPARATEUR DE FRÉQUENCES 1-90 */}
      {activeView === "comparison" && (
        <div className="space-y-4">
          {/* BARRE DE FILTRES ET TRI */}
          <div className="bg-slate-900/60 p-4 rounded-2xl border border-white/5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 text-xs font-mono">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-slate-500 font-bold flex items-center gap-1">
                <Filter size={12} /> Filtre :
              </span>
              <button
                onClick={() => setFilterType("all")}
                className={`px-2.5 py-1 rounded-lg ${
                  filterType === "all"
                    ? "bg-white/10 text-white font-black"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Tous (1-90)
              </button>
              <button
                onClick={() => setFilterType("harmonique")}
                className={`px-2.5 py-1 rounded-lg ${
                  filterType === "harmonique"
                    ? "bg-emerald-500/20 text-emerald-300 font-black border border-emerald-500/40"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                ★ Harmoniques A (10H+16H)
              </button>
              <button
                onClick={() => setFilterType("soir")}
                className={`px-2.5 py-1 rounded-lg ${
                  filterType === "soir"
                    ? "bg-indigo-500/20 text-indigo-300 font-black border border-indigo-500/40"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                🌙 Spécifiques Soir (19H55)
              </button>
              <button
                onClick={() => setFilterType("divergent")}
                className={`px-2.5 py-1 rounded-lg ${
                  filterType === "divergent"
                    ? "bg-rose-500/20 text-rose-300 font-black border border-rose-500/40"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                ⚠ Asymétriques / Divergents
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-slate-500 font-bold flex items-center gap-1">
                <Sliders size={12} /> Tri :
              </span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="bg-slate-950 border border-white/10 rounded-lg px-2.5 py-1 text-slate-200 text-xs focus:outline-none focus:border-amber-500"
              >
                <option value="syncScore">Score Résonance Synchro</option>
                <option value="number">Numéro (1-90)</option>
                <option value="boulonnierA">Fréquence Boulonnier A</option>
                <option value="freq10H">Fréquence 10H</option>
                <option value="freq16H">Fréquence 16H</option>
                <option value="freq19H55">Fréquence 19H55</option>
                <option value="syncDelta">Plus Faible Écart (10H-16H)</option>
              </select>
            </div>
          </div>

          {/* GRILLE DES NUMÉROS SYNCHRONISÉS */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredProfiles.map((p) => {
              const maxFreq = Math.max(1, p.freq10H, p.freq16H, p.freq19H55, p.freq13H);
              const isHarmonic = p.classification === "HARMONIQUE_A";
              const isSelected = selectedProfile?.number === p.number;

              return (
                <div
                  key={p.number}
                  onClick={() => {
                    audioEngine.play("click");
                    setSelectedProfile(isSelected ? null : p);
                  }}
                  className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                    isSelected
                      ? "bg-slate-900 border-amber-500/60 shadow-lg ring-1 ring-amber-500/30"
                      : isHarmonic
                      ? "bg-slate-900/70 border-emerald-500/20 hover:border-emerald-500/40"
                      : "bg-slate-900/40 border-white/5 hover:border-white/15"
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                      <NumberBall number={p.number} size="sm" />
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-black text-white">
                            Numéro {p.number}
                          </span>
                          <span className="text-[9px] text-slate-500 font-mono">
                            Secteur {p.sector}
                          </span>
                        </div>
                        <span
                          className={`text-[9px] font-mono font-bold uppercase ${
                            isHarmonic
                              ? "text-emerald-400"
                              : p.classification === "INERTIE_SOIR"
                              ? "text-indigo-400"
                              : p.classification === "DIVERGENT"
                              ? "text-rose-400"
                              : "text-slate-400"
                          }`}
                        >
                          {p.classification.replace("_", " ")}
                        </span>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] text-slate-500 block uppercase font-mono">
                        Synchro A
                      </span>
                      <span
                        className={`text-sm font-black font-mono ${
                          p.syncResonanceScore >= 70
                            ? "text-emerald-400"
                            : p.syncResonanceScore >= 40
                            ? "text-amber-400"
                            : "text-slate-400"
                        }`}
                      >
                        {p.syncResonanceScore}%
                      </span>
                    </div>
                  </div>

                  {/* MINI BARRES COMPARATIVES DES 4 CRÉNEAUX */}
                  <div className="space-y-1.5 font-mono text-[10px]">
                    {/* 10H */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-amber-400 w-12 flex items-center gap-1">
                        <span>🌅</span> 10H:
                      </span>
                      <div className="flex-1 bg-slate-950 h-2 rounded-full overflow-hidden">
                        <div
                          className="bg-amber-400 h-full rounded-full"
                          style={{ width: `${(p.freq10H / maxFreq) * 100}%` }}
                        />
                      </div>
                      <span className="text-slate-300 w-6 text-right font-bold">
                        {p.freq10H}
                      </span>
                    </div>

                    {/* 16H */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-orange-400 w-12 flex items-center gap-1">
                        <span>🌤️</span> 16H:
                      </span>
                      <div className="flex-1 bg-slate-950 h-2 rounded-full overflow-hidden">
                        <div
                          className="bg-orange-400 h-full rounded-full"
                          style={{ width: `${(p.freq16H / maxFreq) * 100}%` }}
                        />
                      </div>
                      <span className="text-slate-300 w-6 text-right font-bold">
                        {p.freq16H}
                      </span>
                    </div>

                    {/* 19H55 */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-indigo-400 w-12 flex items-center gap-1">
                        <span>🌙</span> 19H55:
                      </span>
                      <div className="flex-1 bg-slate-950 h-2 rounded-full overflow-hidden">
                        <div
                          className="bg-indigo-400 h-full rounded-full"
                          style={{ width: `${(p.freq19H55 / maxFreq) * 100}%` }}
                        />
                      </div>
                      <span className="text-slate-300 w-6 text-right font-bold">
                        {p.freq19H55}
                      </span>
                    </div>

                    {/* 13H */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-blue-400 w-12 flex items-center gap-1">
                        <span>☀️</span> 13H:
                      </span>
                      <div className="flex-1 bg-slate-950 h-2 rounded-full overflow-hidden">
                        <div
                          className="bg-blue-400 h-full rounded-full"
                          style={{ width: `${(p.freq13H / maxFreq) * 100}%` }}
                        />
                      </div>
                      <span className="text-slate-300 w-6 text-right font-bold">
                        {p.freq13H}
                      </span>
                    </div>
                  </div>

                  <div className="mt-2.5 pt-2 border-t border-white/5 flex justify-between items-center text-[9px] font-mono text-slate-500">
                    <span>Delta |10H - 16H| : <strong className="text-slate-300">{p.syncDelta.toFixed(2)}σ</strong></span>
                    <span>Total Boulonnier A : <strong className="text-amber-400">{p.boulonnierAFreq} sorties</strong></span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* VUE 2 : MATRICE DE CORRÉLATION CROISÉE */}
      {activeView === "matrix" && (
        <div className="space-y-6">
          <div className="bg-slate-900/60 p-6 rounded-3xl border border-white/5 space-y-4">
            <h3 className="text-base font-black text-white uppercase tracking-wider flex items-center gap-2">
              <Layers size={18} className="text-amber-400" />
              Matrice des Corrélations Spectrales & Linéaires Inter-Créneaux
            </h3>
            <p className="text-xs text-slate-400">
              Calcul mathématique exact du coefficient de Pearson ($r$), de Spearman ($\rho$) et de la similarité cosinus entre les spectres de distribution 1..90 des différents créneaux horaires.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
              {report.correlations.map((pair, idx) => {
                const isSibling = pair.sourceName.includes("10H") && pair.targetName.includes("16H");
                return (
                  <div
                    key={idx}
                    className={`p-5 rounded-2xl border space-y-3 ${
                      isSibling
                        ? "bg-amber-500/10 border-amber-500/30"
                        : "bg-slate-950/60 border-white/5"
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <div className="text-xs font-black text-white flex items-center gap-2">
                        <span>{pair.sourceName}</span>
                        <ArrowRight size={12} className="text-slate-500" />
                        <span>{pair.targetName}</span>
                      </div>
                      {isSibling && (
                        <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                          Même Boulonnier
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-2 py-2 border-y border-white/5 text-center font-mono">
                      <div>
                        <span className="text-[9px] text-slate-500 block uppercase">Pearson r</span>
                        <span className="text-sm font-black text-emerald-400">
                          {pair.pearsonR.toFixed(3)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-500 block uppercase">Spearman ρ</span>
                        <span className="text-sm font-black text-cyan-400">
                          {pair.spearmanRho.toFixed(3)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-500 block uppercase">Cosinus</span>
                        <span className="text-sm font-black text-amber-400">
                          {(pair.cosineSimilarity * 100).toFixed(1)}%
                        </span>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <span className="text-[10px] text-slate-400 font-bold block">
                        Numéros Communs dans le Top 20 :
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {pair.sharedTopNumbers.map((num) => (
                          <span
                            key={num}
                            className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 text-xs font-mono font-bold"
                          >
                            {num}
                          </span>
                        ))}
                      </div>
                    </div>

                    <p className="text-[10px] text-slate-400 italic pt-1">
                      {pair.couplingRemark}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* VUE 3 : FLUX INTRA-JOURNALIER */}
      {activeView === "daily_flow" && (
        <div className="space-y-6">
          <div className="bg-slate-900/60 p-6 rounded-3xl border border-white/5 space-y-4">
            <h3 className="text-base font-black text-white uppercase tracking-wider flex items-center gap-2">
              <Clock size={18} className="text-amber-400" />
              Rémanence & Transferts Séquentiels Même Jour (10H → 16H → 19H55)
            </h3>
            <p className="text-xs text-slate-400">
              Analyse chronologique journalière : probabilité qu'un numéro sorti au tirage du matin (10H) réapparaisse à 16H (même appareil mécanique A) ou le soir à 19H55.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
              {/* Transfert 10H -> 16H */}
              <div className="p-5 rounded-2xl bg-slate-950/80 border border-amber-500/20 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-black text-amber-300 uppercase">
                    10H00 → 16H00 (Boulonnier A)
                  </span>
                  <span className="text-xs font-mono font-bold text-emerald-400">
                    {report.sameDayTransfers.transfers10Hto16H.rate.toFixed(1)}% des jours
                  </span>
                </div>
                <p className="text-[10px] text-slate-400">
                  Fréquence à laquelle au moins un numéro du matin réapparaît l'après-midi sur le même boulonnier physique.
                </p>
                <div className="space-y-1">
                  <span className="text-[10px] text-slate-500 font-bold block uppercase">
                    Top Numéros Rémanents :
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {report.sameDayTransfers.transfers10Hto16H.topCarryNumbers.map((c) => (
                      <span
                        key={c.number}
                        className="px-2 py-1 rounded-lg bg-amber-500/20 text-amber-300 font-mono font-black text-xs border border-amber-500/30"
                      >
                        N°{c.number} ({c.count}x)
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Transfert 16H -> 19H55 */}
              <div className="p-5 rounded-2xl bg-slate-950/80 border border-orange-500/20 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-black text-orange-300 uppercase">
                    16H00 → 19H55 (Après-Midi → Soir)
                  </span>
                  <span className="text-xs font-mono font-bold text-indigo-400">
                    {report.sameDayTransfers.transfers16Hto19H55.rate.toFixed(1)}% des jours
                  </span>
                </div>
                <p className="text-[10px] text-slate-400">
                  Transfert stochastique de fin de journée entre les tirages de 16h et les tirages de clôture.
                </p>
                <div className="space-y-1">
                  <span className="text-[10px] text-slate-500 font-bold block uppercase">
                    Top Numéros Rémanents :
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {report.sameDayTransfers.transfers16Hto19H55.topCarryNumbers.map((c) => (
                      <span
                        key={c.number}
                        className="px-2 py-1 rounded-lg bg-orange-500/20 text-orange-300 font-mono font-black text-xs border border-orange-500/30"
                      >
                        N°{c.number} ({c.count}x)
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Transfert 10H -> 19H55 */}
              <div className="p-5 rounded-2xl bg-slate-950/80 border border-indigo-500/20 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-black text-indigo-300 uppercase">
                    10H00 → 19H55 (Matin → Soir)
                  </span>
                  <span className="text-xs font-mono font-bold text-cyan-400">
                    {report.sameDayTransfers.transfers10Hto19H55.rate.toFixed(1)}% des jours
                  </span>
                </div>
                <p className="text-[10px] text-slate-400">
                  Résonance diurne complète sur toute la chaîne horaire de la journée.
                </p>
                <div className="space-y-1">
                  <span className="text-[10px] text-slate-500 font-bold block uppercase">
                    Top Numéros Rémanents :
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {report.sameDayTransfers.transfers10Hto19H55.topCarryNumbers.map((c) => (
                      <span
                        key={c.number}
                        className="px-2 py-1 rounded-lg bg-indigo-500/20 text-indigo-300 font-mono font-black text-xs border border-indigo-500/30"
                      >
                        N°{c.number} ({c.count}x)
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* TRIPLETS PARFAITS SUR LE MÊME JOUR */}
            {report.sameDayTransfers.fullDayTripletMatches.length > 0 && (
              <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 space-y-2 mt-4">
                <span className="text-xs font-black text-emerald-300 uppercase flex items-center gap-1.5">
                  <Sparkles size={14} /> Triplets Parfaits Observés (Sortis à 10H, 16H et 19H55 le même jour) :
                </span>
                <div className="flex flex-wrap gap-2 pt-1">
                  {report.sameDayTransfers.fullDayTripletMatches.map((tri, idx) => (
                    <span
                      key={idx}
                      className="px-3 py-1.5 rounded-xl bg-slate-900 text-xs font-mono border border-emerald-500/40 text-slate-200"
                    >
                      📅 {tri.date} : <strong className="text-emerald-400">N° {tri.numbers.join(", ")}</strong>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* VUE 4 : DISTRIBUTION BALISTIQUE PAR SECTEUR DE TAMBOUR */}
      {activeView === "sectors" && (
        <div className="space-y-6">
          <div className="bg-slate-900/60 p-6 rounded-3xl border border-white/5 space-y-4">
            <h3 className="text-base font-black text-white uppercase tracking-wider flex items-center gap-2">
              <Gauge size={18} className="text-amber-400" />
              Signature Balistique des 5 Secteurs de Tambour (18 boules / secteur)
            </h3>
            <p className="text-xs text-slate-400">
              Comparaison de la densité d'éjection des boules par segment géométrique de tambour entre le Boulonnier A (10H/16H/Espoir), le Boulonnier B (13H) et le Boulonnier C (19H55 Semaine).
            </p>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 pt-2">
              {report.sectorComparison.map((sec) => (
                <div
                  key={sec.sector}
                  className="p-4 rounded-2xl bg-slate-950/80 border border-white/10 space-y-3 font-mono text-center"
                >
                  <div>
                    <span className="text-[10px] text-slate-500 font-bold block uppercase">
                      Secteur {sec.sector}
                    </span>
                    <span className="text-sm font-black text-white">
                      Boules {sec.range}
                    </span>
                  </div>

                  <div className="space-y-1.5 text-xs text-left">
                    <div className="flex justify-between items-center text-amber-300">
                      <span>Boulonnier A:</span>
                      <strong className="font-mono">{sec.boulonnierAPercent.toFixed(1)}%</strong>
                    </div>
                    <div className="flex justify-between items-center text-blue-300">
                      <span>Boulonnier B:</span>
                      <strong className="font-mono">{sec.boulonnierBPercent.toFixed(1)}%</strong>
                    </div>
                    <div className="flex justify-between items-center text-indigo-300">
                      <span>Boulonnier C:</span>
                      <strong className="font-mono">{sec.boulonnierCPercent.toFixed(1)}%</strong>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-white/5">
                    <span className="text-[9px] text-slate-500 block uppercase">Dominance</span>
                    <span
                      className={`text-xs font-black uppercase ${
                        sec.dominantBoulonnier === "A"
                          ? "text-amber-400"
                          : sec.dominantBoulonnier === "B"
                          ? "text-blue-400"
                          : "text-indigo-400"
                      }`}
                    >
                      Boulonnier {sec.dominantBoulonnier}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SYNTHÈSE FORENSIC ET RECOMMANDATIONS */}
      <div className="bg-gradient-to-r from-slate-900/90 to-slate-950/90 p-6 rounded-3xl border border-white/10 space-y-3">
        <h4 className="text-xs font-black text-amber-400 uppercase tracking-widest flex items-center gap-2">
          <Zap size={14} className="text-amber-400" />
          Synthèse Analytique & Enseignements Mécaniques
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
          {report.synthesisFindings.map((finding, idx) => (
            <div
              key={idx}
              className="p-3 bg-slate-900/60 rounded-xl border border-white/5 text-xs text-slate-300 flex items-start gap-2.5"
            >
              <CheckCircle2 size={14} className="text-emerald-400 shrink-0 mt-0.5" />
              <span className="leading-relaxed">{finding}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
