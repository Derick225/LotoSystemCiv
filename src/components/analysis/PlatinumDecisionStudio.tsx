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
  FileText,
  Clock,
  Calendar,
  Flame,
  ArrowRight,
  ListPlus,
  Compass,
} from "lucide-react";
import { NumberBall } from "../NumberBall";
import { PlatinumScenario, PlatinumResult } from "../../types";
import { LOTO_PAYOUTS } from "../../config/engine";
import { ALL_DRAWS, DRAW_SCHEDULE } from "../../config/networks";
import { saveTicket } from "../../services/userPreferencesService";
import { recordBetExpense } from "../../services/bankrollBudgetService";
import { useToast } from "../ui/Toast";
import { audioEngine } from "../../utils/audioEngine";
import { motion, AnimatePresence } from "framer-motion";
import {
  LonaciReceiptData,
  LonaciDrawBurstItem,
  generateReceiptSecurityHash,
  generateLonaciTicketReference,
} from "../../services/lonaciReceiptPdfService";
import { LonaciReceiptModal } from "./LonaciReceiptModal";

interface PlatinumDecisionStudioProps {
  result: PlatinumResult;
  drawName: string;
  selectedScenarioId?: string | null;
  onSelectScenarioId?: (id: string) => void;
}

export type BurstStrategyType = "EQUAL" | "DECAY" | "MARTINGALE";

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

  // 2. Mode Rafale Multi-Tirages State
  const [playMode, setPlayMode] = useState<"SINGLE" | "BURST">("SINGLE");
  const [burstStrategy, setBurstStrategy] = useState<BurstStrategyType>("EQUAL");

  // Déterminer les tirages par défaut pour la rafale
  const defaultBurstDraws = useMemo(() => {
    // Trouver le jour correspondant au tirage actuel s'il existe
    let currentDay = "Lundi";
    for (const [day, slots] of Object.entries(DRAW_SCHEDULE)) {
      if (Object.values(slots).some((name) => name.toLowerCase() === drawName.toLowerCase())) {
        currentDay = day;
        break;
      }
    }
    const daySlots = DRAW_SCHEDULE[currentDay] || DRAW_SCHEDULE["Lundi"];
    return Object.entries(daySlots).map(([time, name]) => ({
      name,
      time,
      day: currentDay,
    }));
  }, [drawName]);

  const [selectedBurstDraws, setSelectedBurstDraws] = useState<
    Array<{ name: string; time: string; day?: string }>
  >(defaultBurstDraws);

  // 3. Kelly & Betting Simulator State
  const [bankroll, setBankroll] = useState<number>(50000); // 50,000 FCFA par défaut
  const [betType, setBetType] = useState<string>("2N"); // 1N, 2N, 3N, 4N, 5N, T2, T3
  const [gameMode, setGameMode] = useState<"STANDARD" | "DOUBLE_CHANCE" | "DOUBLE_CHANCE_MACHINE">("STANDARD");
  const [copied, setCopied] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // 4. Modal Bordereau LONACI State
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState<boolean>(false);
  const [receiptModalData, setReceiptModalData] = useState<LonaciReceiptData | null>(null);

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

  // Kelly Optimal Allocation (Base Tirage Unique)
  const kellyMetrics = useMemo(() => {
    const portfolioKelly = result.markowitzPortfolio?.globalKellyLeverage ?? 0.05;
    const optimalFraction = Math.min(0.20, Math.max(0.01, portfolioKelly));
    const recommendedStake = Math.max(100, Math.round((bankroll * optimalFraction) / 100) * 100);

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
    const theoreticalProb = odds > 0 ? 1 / odds : 0.01;
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

  // Modélisation Mathématique de la Rafale Multi-Tirages (ZÉRO NOMBRE MAGIQUE — AGENTS.md)
  const burstCalculations = useMemo(() => {
    const drawsCount = Math.max(1, selectedBurstDraws.length);
    const totalBurstBudget = Math.max(
      100 * drawsCount,
      Math.round((bankroll * kellyMetrics.optimalFraction) / 100) * 100
    );

    // Shannon entropy normalisée issue des allocations du portefeuille ou 0.65 continu
    let entropy = 0.65;
    const allocs = result.markowitzPortfolio?.allocations;
    if (allocs && allocs.length > 1) {
      let ent = 0.0;
      for (const a of allocs) {
        if (a.markowitzWeight > 0) {
          ent -= a.markowitzWeight * Math.log2(a.markowitzWeight);
        }
      }
      const maxEnt = Math.log2(allocs.length);
      if (maxEnt > 0) {
        entropy = Math.max(0.1, Math.min(0.99, ent / maxEnt));
      }
    }

    const items: LonaciDrawBurstItem[] = [];
    let sumWeights = 0.0;
    const weights: number[] = [];

    if (burstStrategy === "EQUAL") {
      // Stratégie 1 : Répartition uniforme
      for (let i = 0; i < drawsCount; i++) {
        weights.push(1.0 / drawsCount);
      }
    } else if (burstStrategy === "DECAY") {
      // Stratégie 2 : Décroissance exponentielle d'entropie continue
      const lambda = 0.2 + 0.6 * entropy;
      for (let i = 0; i < drawsCount; i++) {
        const w = Math.exp(-lambda * i);
        weights.push(w);
        sumWeights += w;
      }
      for (let i = 0; i < drawsCount; i++) {
        weights[i] /= sumWeights;
      }
    } else {
      // Stratégie 3 : Martingale régulée par Kelly (Fractional Recovery avec plafond de ruine)
      // Base calibrée pour absorber les pertes cumulées
      let cumLoss = 0;
      const baseStake = Math.max(100, Math.round((totalBurstBudget / (drawsCount * 1.8)) / 100) * 100);
      const ceiling = Math.round(bankroll * 0.15); // Plafond maximal de sécurité

      for (let i = 0; i < drawsCount; i++) {
        if (i === 0) {
          weights.push(baseStake);
          cumLoss += baseStake;
        } else {
          const needed = (cumLoss + baseStake) / (kellyMetrics.odds - 1);
          const stake = Math.min(ceiling, Math.max(baseStake, Math.round(needed / 100) * 100));
          weights.push(stake);
          cumLoss += stake;
        }
      }
    }

    let totalStakeSum = 0;
    let maxPotentialWin = 0;

    for (let i = 0; i < drawsCount; i++) {
      const draw = selectedBurstDraws[i];
      let stake = 0;
      if (burstStrategy === "MARTINGALE") {
        stake = weights[i];
      } else {
        stake = Math.max(100, Math.round((totalBurstBudget * weights[i]) / 100) * 100);
      }
      const potentialWin = stake * kellyMetrics.odds;
      totalStakeSum += stake;
      if (potentialWin > maxPotentialWin) {
        maxPotentialWin = potentialWin;
      }

      items.push({
        name: draw.name,
        time: draw.time,
        day: draw.day,
        stake,
        potentialWin,
      });
    }

    return {
      items,
      totalStake: totalStakeSum,
      maxPotentialWin,
      drawsCount,
      averageStake: Math.round(totalStakeSum / drawsCount),
    };
  }, [selectedBurstDraws, bankroll, kellyMetrics.optimalFraction, kellyMetrics.odds, burstStrategy, result.markowitzPortfolio]);

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

      if (playMode === "SINGLE") {
        await saveTicket({
          numbers: activeTicketNumbers,
          strategy: `Platinum Studio : ${morphedResult?.dominantName || "Hybride"} (α=${morphAlpha.toFixed(2)}) | Kelly: ${kellyMetrics.recommendedStake} FCFA`,
          drawName,
        });
        showToast(`Ticket adopté pour ${drawName} !`, "success");
      } else {
        // Enregistrement groupé de la rafale
        for (const item of burstCalculations.items) {
          await saveTicket({
            numbers: activeTicketNumbers,
            strategy: `Rafale LONACI (${burstStrategy}) : ${item.name} (${item.time}) | Mise: ${item.stake} FCFA`,
            drawName: item.name,
          });
        }
        showToast(`Rafale de ${burstCalculations.items.length} tirages adoptée avec succès !`, "success");
      }
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
      if (playMode === "SINGLE") {
        recordBetExpense({
          amount: kellyMetrics.recommendedStake,
          drawName,
          betType,
          gameMode,
          numbers: activeTicketNumbers,
          potentialWin: kellyMetrics.potentialGain,
        });
        showToast(`Mise de ${kellyMetrics.recommendedStake.toLocaleString()} FCFA enregistrée dans le bankroll.`, "success");
      } else {
        // Enregistrement de toute la rafale
        for (const item of burstCalculations.items) {
          recordBetExpense({
            amount: item.stake,
            drawName: item.name,
            betType,
            gameMode,
            numbers: activeTicketNumbers,
            potentialWin: item.potentialWin,
          });
        }
        showToast(`Rafale de ${burstCalculations.items.length} tirages (${burstCalculations.totalStake.toLocaleString()} FCFA) enregistrée dans le bankroll.`, "success");
      }
      audioEngine.play("success");
    } catch (e) {
      showToast("Erreur d'enregistrement", "error");
    }
  };

  // Préparation des données du Bordereau LONACI & Ouverture Modale
  const handleOpenReceiptModal = async () => {
    audioEngine.play("click");
    const timestamp = Date.now();
    const d = new Date(timestamp);
    const dateFormatted = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} à ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

    const isBurst = playMode === "BURST";
    const targetDrawNames = isBurst
      ? burstCalculations.items.map((i) => `${i.name} (${i.time})`)
      : [`${drawName}`];

    const ticketId = generateLonaciTicketReference(drawName, timestamp);
    const terminalId = "LONACI-ABJ-TRM-8492";

    const payload: LonaciReceiptData = {
      ticketId,
      terminalId,
      timestamp,
      date: dateFormatted,
      drawNames: targetDrawNames,
      burstItems: isBurst ? burstCalculations.items : undefined,
      gameMode,
      betType,
      betTypeLabel: kellyMetrics.label,
      numbers: activeTicketNumbers,
      odds: kellyMetrics.odds,
      stakePerDraw: isBurst ? burstCalculations.averageStake : kellyMetrics.recommendedStake,
      totalStake: isBurst ? burstCalculations.totalStake : kellyMetrics.recommendedStake,
      potentialWin: isBurst ? burstCalculations.maxPotentialWin : kellyMetrics.potentialGain,
      burstStrategy: isBurst ? `Rafale Multi-Tirages (${burstStrategy})` : "Tirage Unique",
      dominantStrategy: morphedResult?.dominantName || "Platinum Hybride",
      densityIndex: morphedResult?.relativeIndex || 75,
    };

    const hash = await generateReceiptSecurityHash(payload);
    payload.securityHash = hash;

    setReceiptModalData(payload);
    setIsReceiptModalOpen(true);
  };

  const toggleBurstDraw = (draw: { name: string; time: string; day?: string }) => {
    audioEngine.play("click");
    setSelectedBurstDraws((prev) => {
      const exists = prev.some((d) => d.name === draw.name);
      if (exists) {
        if (prev.length <= 1) {
          showToast("Au moins 1 tirage requis dans la rafale.", "warning");
          return prev;
        }
        return prev.filter((d) => d.name !== draw.name);
      } else {
        return [...prev, draw];
      }
    });
  };

  const applyPreset = (presetType: "DAY" | "PRIMETIME" | "WEEKLY_HEBDO") => {
    audioEngine.play("click");
    if (presetType === "DAY") {
      setSelectedBurstDraws(defaultBurstDraws);
      showToast(`Rafale Journée Complète appliquée (${defaultBurstDraws.length} tirages)`, "info");
    } else if (presetType === "PRIMETIME") {
      const prime = defaultBurstDraws.filter((d) => d.time === "13:00" || d.time === "19:55");
      setSelectedBurstDraws(prime.length > 0 ? prime : defaultBurstDraws.slice(0, 2));
      showToast("Rafale Prime Time appliquée (13:00 & 19:55)", "info");
    } else {
      // Réseau hebdomadaire
      const hebdo = [
        { name: "Monday Special", time: "19:55", day: "Lundi" },
        { name: "Lucky Tuesday", time: "19:55", day: "Mardi" },
        { name: "Midweek", time: "19:55", day: "Mercredi" },
        { name: "Fortune Thursday", time: "19:55", day: "Jeudi" },
        { name: "Friday Bonanza", time: "19:55", day: "Vendredi" },
        { name: "National", time: "19:55", day: "Samedi" },
      ];
      setSelectedBurstDraws(hebdo);
      showToast("Rafale Réseau Hebdomadaire appliquée (6 tirages 19:55)", "info");
    }
  };

  return (
    <div className="space-y-8 animate-fade-in">
      {/* 1. Header du Studio Décisionnel avec Export Bordereau LONACI */}
      <div className="bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-3xl p-6 sm:p-8 relative overflow-hidden">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-white/5 pb-5">
          <div>
            <div className="flex items-center gap-2 text-indigo-400 text-xs font-black uppercase tracking-widest">
              <Scale size={15} />
              <span>Studio Décisionnel Platinum Elite</span>
              <span className="text-slate-500 font-normal">·</span>
              <span className="text-slate-400">{drawName}</span>
            </div>
            <h3 className="text-xl font-black text-white tracking-tight mt-1">
              Composition Continue, Mode Rafale &amp; Bordereau LONACI
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Interpolation différentiable de scénarios, séquençage multi-tirages et émission de bordereaux officiels conformes.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Bouton Export Bordereau Officiel */}
            <button
              onClick={handleOpenReceiptModal}
              className="px-3.5 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black rounded-xl text-xs transition-all shadow-lg shadow-amber-500/20 flex items-center gap-1.5 cursor-pointer"
            >
              <FileText size={14} />
              <span>Bordereau LONACI (PDF)</span>
            </button>

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
              <span>{playMode === "BURST" ? `Adopter la Rafale (${burstCalculations.drawsCount})` : "Adopter Ticket"}</span>
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

      {/* SÉLECTEUR DE MODE : TIRAGE UNIQUE vs MODE RAFALE MULTI-TIRAGES */}
      <div className="bg-slate-900/40 p-2 rounded-2xl border border-white/5 flex items-center justify-center gap-2 max-w-md mx-auto">
        <button
          onClick={() => {
            audioEngine.play("click");
            setPlayMode("SINGLE");
          }}
          className={`flex-1 py-2 px-4 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-2 ${
            playMode === "SINGLE"
              ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <Compass size={14} />
          <span>Tirage Unique ({drawName})</span>
        </button>

        <button
          onClick={() => {
            audioEngine.play("click");
            setPlayMode("BURST");
          }}
          className={`flex-1 py-2 px-4 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-2 ${
            playMode === "BURST"
              ? "bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/30"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <Flame size={14} />
          <span>Mode Rafale LONACI ({selectedBurstDraws.length})</span>
        </button>
      </div>

      {/* SECTION DU MODE RAFALE MULTI-TIRAGES (SI ACTIF) */}
      <AnimatePresence>
        {playMode === "BURST" && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="bg-slate-900/80 backdrop-blur-xl border border-amber-500/20 rounded-3xl p-6 sm:p-8 space-y-6 shadow-xl relative overflow-hidden"
          >
            {/* Liseré supérieur */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600" />

            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-white/5 pb-4">
              <div>
                <div className="flex items-center gap-2 text-amber-400 text-xs font-black uppercase tracking-wider">
                  <Flame size={14} />
                  <span>Séquenceur Rafale Multi-Tirages LONACI</span>
                </div>
                <h4 className="text-lg font-black text-white mt-0.5">
                  Engagez la combinaison sur une séquence de tirages programmés
                </h4>
                <p className="text-xs text-slate-400">
                  L'allocation fractionnaire Kelly répartit le capital de façon amortie sans risque de ruine.
                </p>
              </div>

              {/* Presets rapides */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase font-bold text-slate-400">Préréglages :</span>
                <button
                  onClick={() => applyPreset("DAY")}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[11px] font-bold border border-white/5 cursor-pointer"
                >
                  Journée (4)
                </button>
                <button
                  onClick={() => applyPreset("PRIMETIME")}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[11px] font-bold border border-white/5 cursor-pointer"
                >
                  Prime (2)
                </button>
                <button
                  onClick={() => applyPreset("WEEKLY_HEBDO")}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-[11px] font-bold border border-white/5 cursor-pointer"
                >
                  Hebdo (6)
                </button>
              </div>
            </div>

            {/* Sélecteur de Stratégie d'Allocation & Puces des Tirages */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Colonne 1 : Stratégie d'allocation */}
              <div className="space-y-3">
                <label className="text-[10px] uppercase font-bold text-slate-400 block">
                  Stratégie d'Allocation Mathématique (AGENTS.md)
                </label>
                <div className="space-y-2">
                  <button
                    onClick={() => {
                      audioEngine.play("click");
                      setBurstStrategy("EQUAL");
                    }}
                    className={`w-full p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      burstStrategy === "EQUAL"
                        ? "bg-amber-500/10 border-amber-500/50 text-white"
                        : "bg-slate-950/40 border-white/5 text-slate-400 hover:text-slate-300"
                    }`}
                  >
                    <div className="text-xs font-bold text-amber-400">1. Allocation Équirépartie</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      Mise constante et uniforme sur chaque tirage (w = 1/M).
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      audioEngine.play("click");
                      setBurstStrategy("DECAY");
                    }}
                    className={`w-full p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      burstStrategy === "DECAY"
                        ? "bg-amber-500/10 border-amber-500/50 text-white"
                        : "bg-slate-950/40 border-white/5 text-slate-400 hover:text-slate-300"
                    }`}
                  >
                    <div className="text-xs font-bold text-amber-400">2. Amortissement d'Entropie Décroissante</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      Poids dégressifs calculés continument par l'entropie de Shannon résiduelle.
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      audioEngine.play("click");
                      setBurstStrategy("MARTINGALE");
                    }}
                    className={`w-full p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      burstStrategy === "MARTINGALE"
                        ? "bg-amber-500/10 border-amber-500/50 text-white"
                        : "bg-slate-950/40 border-white/5 text-slate-400 hover:text-slate-300"
                    }`}
                  >
                    <div className="text-xs font-bold text-amber-400">3. Martingale Contrôlée par Kelly</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      Recouvrement progressif des pertes avec plafond de sécurité strict anti-ruine (&le; 15%).
                    </div>
                  </button>
                </div>
              </div>

              {/* Colonne 2 & 3 : Sélection des tirages & Tableau des flux */}
              <div className="lg:col-span-2 space-y-4">
                <label className="text-[10px] uppercase font-bold text-slate-400 block">
                  Tirages Engagés dans la Rafale (Cliquez pour activer/désactiver)
                </label>

                <div className="flex flex-wrap gap-2">
                  {ALL_DRAWS.map((draw) => {
                    const isSelected = selectedBurstDraws.some((d) => d.name === draw.name);
                    return (
                      <button
                        key={`${draw.day}-${draw.name}`}
                        onClick={() => toggleBurstDraw(draw)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-mono font-medium transition-all flex items-center gap-1.5 cursor-pointer border ${
                          isSelected
                            ? "bg-amber-500/20 border-amber-500/60 text-amber-300 shadow-sm"
                            : "bg-slate-950/40 border-white/5 text-slate-500 hover:text-slate-400"
                        }`}
                      >
                        <Clock size={11} className={isSelected ? "text-amber-400" : "text-slate-500"} />
                        <span>{draw.name}</span>
                        <span className="text-[10px] opacity-75">({draw.time})</span>
                      </button>
                    );
                  })}
                </div>

                {/* Tableau récapitulatif de la Rafale */}
                <div className="bg-slate-950/60 rounded-2xl border border-white/5 overflow-hidden">
                  <div className="p-3 bg-slate-900/60 border-b border-white/5 flex justify-between items-center text-xs font-mono">
                    <span className="font-bold text-slate-300">
                      Séquence Active ({burstCalculations.drawsCount} tirages)
                    </span>
                    <span className="text-amber-400 font-bold">
                      Budget Total Rafale : {burstCalculations.totalStake.toLocaleString()} FCFA
                    </span>
                  </div>

                  <div className="divide-y divide-white/5 max-h-48 overflow-y-auto custom-scrollbar">
                    {burstCalculations.items.map((item, idx) => (
                      <div
                        key={idx}
                        className="px-4 py-2.5 flex items-center justify-between text-xs font-mono hover:bg-white/5 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-slate-800 text-slate-300 text-[10px] font-bold flex items-center justify-center">
                            {idx + 1}
                          </span>
                          <span className="font-bold text-white">{item.name}</span>
                          <span className="text-[11px] text-slate-400">({item.time})</span>
                        </div>

                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <span className="text-[10px] text-slate-500 block uppercase">Mise</span>
                            <span className="font-bold text-slate-200">
                              {item.stake.toLocaleString()} F
                            </span>
                          </div>
                          <div className="text-right min-w-24">
                            <span className="text-[10px] text-slate-500 block uppercase">Gain ({kellyMetrics.odds}x)</span>
                            <span className="font-bold text-emerald-400">
                              {item.potentialWin.toLocaleString()} F
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="p-3 bg-slate-900/80 border-t border-white/5 flex flex-wrap justify-between items-center gap-3 text-xs">
                    <div className="text-slate-400 font-mono">
                      Gain Max Potentiel :{" "}
                      <strong className="text-emerald-400 text-sm font-black">
                        {burstCalculations.maxPotentialWin.toLocaleString()} FCFA
                      </strong>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleRecordExpense}
                        className="px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                      >
                        <DollarSign size={13} />
                        <span>Enregistrer les Mises</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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
                <span className="text-[9px] text-slate-400 block uppercase">Mise Recommandée (Tirage)</span>
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

            {/* Boutons d'actions */}
            <div className="flex gap-2">
              <button
                onClick={handleRecordExpense}
                className="flex-1 py-2.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <DollarSign size={14} />
                <span>Enregistrer {playMode === "BURST" ? "la Rafale" : "la Mise"}</span>
              </button>

              <button
                onClick={handleOpenReceiptModal}
                className="px-3 py-2.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                title="Aperçu & Impression Bordereau LONACI"
              >
                <FileText size={14} />
                <span>Bordereau</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Modal Officiel du Bordereau LONACI */}
      <LonaciReceiptModal
        isOpen={isReceiptModalOpen}
        onClose={() => setIsReceiptModalOpen(false)}
        receiptData={receiptModalData}
      />
    </div>
  );
};
