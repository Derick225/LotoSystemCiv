import React, { useState, useMemo } from "react";
import {
  Scale,
  Sliders,
  DollarSign,
  TrendingUp,
  Share2,
  Copy,
  Check,
  Save,
  Zap,
  Sparkles,
  Layers,
  ShieldCheck,
  AlertTriangle,
  Info,
} from "lucide-react";
import { NumberBall } from "../NumberBall";
import { PlatinumScenario, PlatinumResult } from "../../types";
import { LOTO_PAYOUTS } from "../../config/engine";
import { saveTicket } from "../../services/userPreferencesService";
import { recordBetExpense } from "../../services/bankrollBudgetService";
import { useToast } from "../ui/Toast";
import { audioEngine } from "../../utils/audioEngine";
import { motion, AnimatePresence } from "framer-motion";

interface PlatinumDecisionStudioProps {
  result: PlatinumResult;
  drawName: string;
  selectedScenarioId?: string | null;
  onSelectScenarioId?: (id: string) => void;
}

export const PlatinumDecisionStudio: React.FC<PlatinumDecisionStudioProps> = ({
  result,
  drawName,
  selectedScenarioId,
  onSelectScenarioId,
}) => {
  const { showToast } = useToast();

  // 1. Morphing State
  const scenarios = result.scenarios;
  const [sourceId, setSourceId] = useState<string>(scenarios[0]?.id || "");
  const [targetId, setTargetId] = useState<string>(scenarios[1]?.id || scenarios[0]?.id || "");
  const [morphAlpha, setMorphAlpha] = useState<number>(0.5); // 0.0 (source) à 1.0 (target)

  // 2. Kelly & Betting Simulator State
  const [bankroll, setBankroll] = useState<number>(50000); // 50,000 FCFA par défaut
  const [betType, setBetType] = useState<string>("2N"); // 1N, 2N, 3N, 4N, 5N, T2, T3
  const [gameMode, setGameMode] = useState<"STANDARD" | "DOUBLE_CHANCE" | "DOUBLE_CHANCE_MACHINE">("STANDARD");
  const [copied, setCopied] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Scénarios pour le morphing
  const scenarioA = useMemo(() => scenarios.find((s) => s.id === sourceId) || scenarios[0], [scenarios, sourceId]);
  const scenarioB = useMemo(() => scenarios.find((s) => s.id === targetId) || scenarios[1] || scenarios[0], [scenarios, targetId]);

  // Calcul du Morphing Continu
  const morphedResult = useMemo(() => {
    if (!scenarioA || !scenarioB) return null;
    const boundedAlpha = Math.max(0, Math.min(1, morphAlpha));
    const scoreMap = new Map<number, number>();

    scenarioA.numbers.forEach((n, idx) => {
      const w = (5 - idx) / 5;
      scoreMap.set(n, (scoreMap.get(n) || 0) + (1.0 - boundedAlpha) * w);
    });

    scenarioB.numbers.forEach((n, idx) => {
      const w = (5 - idx) / 5;
      scoreMap.set(n, (scoreMap.get(n) || 0) + boundedAlpha * w);
    });

    const sorted = Array.from(scoreMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([num]) => num);

    const ticket = sorted.slice(0, 5).sort((a, b) => a - b);
    const relativeIndex = Math.round((1 - boundedAlpha) * scenarioA.relativeIndex + boundedAlpha * scenarioB.relativeIndex);
    const dominantName =
      boundedAlpha <= 0.05
        ? scenarioA.name
        : boundedAlpha >= 0.95
        ? scenarioB.name
        : `Mix ${( (1 - boundedAlpha) * 100 ).toFixed(0)}% ${scenarioA.name} + ${(boundedAlpha * 100).toFixed(0)}% ${scenarioB.name}`;

    return { ticket, relativeIndex, dominantName };
  }, [scenarioA, scenarioB, morphAlpha]);

  // Kelly Optimal Allocation
  const kellyMetrics = useMemo(() => {
    const portfolioKelly = result.markowitzPortfolio?.globalKellyLeverage ?? 0.05;
    const optimalFraction = Math.min(0.20, Math.max(0.01, portfolioKelly));
    const recommendedStake = Math.round(bankroll * optimalFraction);

    // Cote officielle LONACI
    const payoutTable = LOTO_PAYOUTS[gameMode];
    let odds = 240;
    let label = "2 Numéros";

    if (betType in payoutTable.SIMPLE) {
      const p = payoutTable.SIMPLE[betType as keyof typeof payoutTable.SIMPLE];
      odds = p.odds;
      label = p.label;
    } else if (betType in payoutTable.TURBO) {
      const p = payoutTable.TURBO[betType as keyof typeof payoutTable.TURBO];
      odds = p.odds;
      label = p.label;
    }

    const potentialGain = recommendedStake * odds;
    // Probabilité théorique a priori sous H0
    const theoreticalProb = odds > 0 ? 1 / odds : 0.01;
    // Espérance mathématique de gain
    const expectedValue = potentialGain * theoreticalProb - recommendedStake;

    return {
      optimalFraction,
      recommendedStake,
      odds,
      label,
      potentialGain,
      expectedValue,
    };
  }, [bankroll, betType, gameMode, result.markowitzPortfolio]);

  const activeTicketNumbers = morphedResult?.ticket || scenarioA?.numbers || [];

  const handleCopyTicket = () => {
    audioEngine.play("click");
    const text = activeTicketNumbers.join(" - ");
    navigator.clipboard.writeText(text);
    setCopied(true);
    showToast(`Ticket copié : ${text}`, "success");
    setTimeout(() => setCopied(false), 2500);
  };

  const handleAdoptTicket = async () => {
    try {
      setIsSaving(true);
      audioEngine.play("click");
      await saveTicket({
        numbers: activeTicketNumbers,
        strategy: `Platinum Studio : ${morphedResult?.dominantName || "Hybride"} (α=${morphAlpha.toFixed(2)}) | Kelly: ${kellyMetrics.recommendedStake} FCFA`,
        drawName,
      });
      showToast(`Ticket adopté pour ${drawName} !`, "success");
      audioEngine.play("success");
    } catch (e) {
      console.error(e);
      showToast("Erreur lors de l'adoption du ticket", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleRecordExpense = async () => {
    try {
      audioEngine.play("click");
      recordBetExpense({
        amount: kellyMetrics.recommendedStake,
        drawName,
        betType,
        gameMode,
        numbers: activeTicketNumbers,
        potentialWin: kellyMetrics.potentialGain,
      });
      showToast(`Mise de ${kellyMetrics.recommendedStake.toLocaleString()} FCFA enregistrée dans le bankroll.`, "success");
      audioEngine.play("success");
    } catch (e) {
      showToast("Erreur d'enregistrement", "error");
    }
  };

  return (
    <div className="space-y-8 animate-fade-in">
      {/* 1. Header du Studio Décisionnel */}
      <div className="bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-3xl p-6 sm:p-8 relative overflow-hidden">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-white/5 pb-5">
          <div>
            <div className="flex items-center gap-2 text-indigo-400 text-xs font-black uppercase tracking-widest">
              <Scale size={15} />
              <span>Studio Décisionnel &amp; Outils Métier</span>
              <span className="text-slate-500 font-normal">·</span>
              <span className="text-slate-400">{drawName}</span>
            </div>
            <h3 className="text-xl font-black text-white tracking-tight mt-1">
              Composition Continue &amp; Simulateur de Mises Kelly
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Interpolation continue entre profils stratégiques et dimensionnement mathématique du capital de jeu.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyTicket}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-750 text-slate-200 border border-white/10 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
            >
              {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
              <span>{copied ? "Copié !" : "Copier"}</span>
            </button>
            <button
              onClick={handleAdoptTicket}
              disabled={isSaving}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-lg shadow-indigo-600/30 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Save size={14} />
              <span>Adopter Ticket</span>
            </button>
          </div>
        </div>

        {/* 2. Visualisation du Ticket Composé Actuel */}
        <div className="py-6 flex flex-col items-center justify-center space-y-3">
          <div className="text-center">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1">
              Ticket Actif Composé ({morphedResult?.dominantName})
            </span>
          </div>

          <div className="flex flex-wrap gap-3 sm:gap-5 justify-center items-center py-2">
            {activeTicketNumbers.map((num, i) => (
              <motion.div
                key={num}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: i * 0.05 }}
              >
                <NumberBall number={num} size="lg" isAttractor />
              </motion.div>
            ))}
          </div>

          <div className="text-[11px] font-mono text-slate-400 flex items-center gap-2 mt-2">
            <span>Indice de Densité :</span>
            <strong className="text-emerald-400 font-bold">
              {morphedResult?.relativeIndex || 75} / 100
            </strong>
          </div>
        </div>
      </div>

      {/* 3. Deux Colonnes : Studio de Morphing & Simulateur Kelly */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Colonne Gauche : Studio de Morphing Continu */}
        <div className="bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-3xl p-6 sm:p-7 space-y-6 flex flex-col justify-between">
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
                <Sliders size={14} /> Morphing Continu de Scénarios
              </span>
              <span className="text-[10px] font-mono text-slate-400">
                α = {(morphAlpha * 100).toFixed(0)}%
              </span>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Glissez le curseur pour interpoler de façon différentiable les masses de probabilités entre deux scénarios et découvrir un ticket hybride optimal.
            </p>

            {/* Sélecteurs de scénarios A et B */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-400 block">Pôle Source A (0%)</label>
                <select
                  value={sourceId}
                  onChange={(e) => setSourceId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 font-medium focus:ring-1 focus:ring-indigo-500"
                >
                  {scenarios.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-400 block">Pôle Cible B (100%)</label>
                <select
                  value={targetId}
                  onChange={(e) => setTargetId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 font-medium focus:ring-1 focus:ring-indigo-500"
                >
                  {scenarios.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Slider de Morphing */}
            <div className="space-y-2 pt-2">
              <div className="flex justify-between items-center text-[10px] font-mono text-slate-400">
                <span className="text-indigo-400 font-semibold">{scenarioA?.name}</span>
                <span className="text-emerald-400 font-semibold">{scenarioB?.name}</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={morphAlpha}
                onChange={(e) => setMorphAlpha(parseFloat(e.target.value))}
                className="w-full accent-indigo-500 bg-slate-800 h-2 rounded-lg cursor-pointer"
              />
            </div>

            {/* Cartouches des 2 scénarios */}
            <div className="grid grid-cols-2 gap-3 pt-2 text-[11px]">
              <div className="p-3 bg-slate-950/40 rounded-xl border border-white/5 space-y-1">
                <div className="text-slate-300 font-bold truncate">{scenarioA?.name}</div>
                <div className="text-[10px] text-slate-500 font-mono">
                  {scenarioA?.numbers.join(", ")}
                </div>
              </div>
              <div className="p-3 bg-slate-950/40 rounded-xl border border-white/5 space-y-1">
                <div className="text-slate-300 font-bold truncate">{scenarioB?.name}</div>
                <div className="text-[10px] text-slate-500 font-mono">
                  {scenarioB?.numbers.join(", ")}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Colonne Droite : Simulateur de Mises Kelly & Espérance Mathématique */}
        <div className="bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-3xl p-6 sm:p-7 space-y-6 flex flex-col justify-between">
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                <DollarSign size={14} /> Dimensionnement Kelly &amp; Payouts LONACI
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800/40">
                Levier: {(kellyMetrics.optimalFraction * 100).toFixed(1)}%
              </span>
            </div>

            {/* Contrôles Bankroll & Type de Pari */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-400 block">Bankroll (FCFA)</label>
                <input
                  type="number"
                  step="5000"
                  min="1000"
                  value={bankroll}
                  onChange={(e) => setBankroll(Math.max(500, parseInt(e.target.value) || 0))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 font-mono font-bold focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-400 block">Formule LONACI</label>
                <select
                  value={gameMode}
                  onChange={(e) => setGameMode(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 font-medium focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="STANDARD">Standard</option>
                  <option value="DOUBLE_CHANCE">Double Chance</option>
                  <option value="DOUBLE_CHANCE_MACHINE">Double Chance Machine</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-slate-400 block">Type de Pari</label>
                <select
                  value={betType}
                  onChange={(e) => setBetType(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 font-medium focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="1N">1 Numéro (1N)</option>
                  <option value="2N">2 Numéros (2N)</option>
                  <option value="3N">3 Numéros (3N)</option>
                  <option value="4N">4 Numéros (4N)</option>
                  <option value="5N">5 Numéros (5N)</option>
                  <option value="T2">Turbo 2 (T2)</option>
                  <option value="T3">Turbo 3 (T3)</option>
                </select>
              </div>
            </div>

            {/* Métriques de Risque & Rendement */}
            <div className="grid grid-cols-2 gap-3 pt-2 font-mono">
              <div className="bg-slate-950/60 p-3.5 rounded-2xl border border-white/5 space-y-1">
                <span className="text-[9px] text-slate-400 block uppercase">Mise Recommandée</span>
                <span className="text-lg font-black text-emerald-400">
                  {kellyMetrics.recommendedStake.toLocaleString()} FCFA
                </span>
                <span className="text-[9px] text-slate-500 block">
                  {(kellyMetrics.optimalFraction * 100).toFixed(1)}% du capital
                </span>
              </div>

              <div className="bg-slate-950/60 p-3.5 rounded-2xl border border-white/5 space-y-1">
                <span className="text-[9px] text-slate-400 block uppercase">Gain Potentiel ({kellyMetrics.odds}x)</span>
                <span className="text-lg font-black text-indigo-400">
                  {kellyMetrics.potentialGain.toLocaleString()} FCFA
                </span>
                <span className="text-[9px] text-slate-500 block">
                  {kellyMetrics.label}
                </span>
              </div>
            </div>

            {/* Bouton d'enregistrement de la mise */}
            <button
              onClick={handleRecordExpense}
              className="w-full py-2.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <DollarSign size={14} />
              <span>Enregistrer cette mise dans le suivi du Bankroll</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
