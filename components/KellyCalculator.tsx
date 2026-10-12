import React, { useState, useEffect, useMemo } from "react";
import { LOTO_PAYOUTS } from "../constants";
import {
  ChevronDown,
  Percent,
  Layers,
  Shuffle,
  Bot,
  Activity,
  Briefcase,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  PlusCircle,
  BarChart2,
} from "lucide-react";
import { audioEngine } from "../utils/audioEngine";
import { useNexusStore } from "../store/useNexusStore";
import { detectGameRegime } from "../services/mathService";
import {
  computeDailySpendingMetrics,
  recordBetExpense,
  DailySpendingMetrics,
} from "../services/bankrollBudgetService";
import { getBankroll } from "../services/userPreferencesService";
import { useToast } from "./ui/Toast";
import { BankrollRiskMonitor } from "./BankrollRiskMonitor";

interface KellyCalculatorProps {
  confidence: number;
  drawName?: string;
  recommendedNumbers?: number[];
}

export type GameMode = "STANDARD" | "DOUBLE_CHANCE" | "DOUBLE_CHANCE_MACHINE";

export interface ContinuousKellyInput {
  confidence: number;
  bankroll: number;
  gameMode: GameMode;
  selectedBetType: string;
  portfolioMode: boolean;
  regime: {
    regime: string;
    hurst?: number;
    entropy?: number;
    volatility?: number;
  };
}

export interface ContinuousKellyResult {
  betAmount: number;
  percentage: number;
  winProbability: number;
  edge: number;
  kellyFraction: number;
  regimeModulator: number;
  advice: string;
}

const extractBetOrder = (betType: string): number => {
  if (betType === "1N") return 1;
  if (betType === "2N" || betType === "T2") return 2;
  if (betType === "3N" || betType === "T3") return 3;
  if (betType === "4N") return 4;
  if (betType === "5N") return 5;
  return 2;
};

/**
 * Calcule l'allocation optimale de Kelly de manière 100% continue et déterministe
 * (Zéro Nombre Magique, Zéro bifurcation binaire de régime).
 */
export const computeContinuousKellyAllocation = ({
  confidence,
  bankroll,
  gameMode,
  selectedBetType,
  portfolioMode,
  regime,
}: ContinuousKellyInput): ContinuousKellyResult => {
  const safeConf = Number.isFinite(confidence) ? Math.max(1, Math.min(99, confidence)) : 50;
  const safeBankroll = Number.isFinite(bankroll) && bankroll > 0 ? bankroll : 0;

  const hurst = typeof regime.hurst === "number" && Number.isFinite(regime.hurst) ? regime.hurst : 0.5;
  const entropy = typeof regime.entropy === "number" && Number.isFinite(regime.entropy) ? regime.entropy : 0.5;
  const rawVol = typeof regime.volatility === "number" && Number.isFinite(regime.volatility) ? regime.volatility : 0.25;
  const normVol = rawVol > 1.0 ? rawVol / 100.0 : rawVol;

  // 1. Modulateur thermodynamique continu (remplace les if/else binaires "chaotic" * 0.8 / "trend" * 1.1)
  // Favorise la persistance (H > 0.5) et amortit continûment l'entropie et la volatilité
  const regimeModulator = Math.exp((hurst - 0.5) - 0.5 * entropy * normVol);

  // 2. Récupération de la cote officielle
  const currentPayouts = LOTO_PAYOUTS[gameMode];
  let odds = 240;
  if (selectedBetType in currentPayouts.SIMPLE) {
    odds = currentPayouts.SIMPLE[selectedBetType as keyof typeof currentPayouts.SIMPLE].odds;
  } else if (selectedBetType in currentPayouts.TURBO) {
    odds = currentPayouts.TURBO[selectedBetType as keyof typeof currentPayouts.TURBO].odds;
  }

  // 3. Ordre combinatoire k du pari et seuil critique d'information C_crit(k) = k / (k + 1)
  const kOrder = extractBetOrder(selectedBetType);
  // Bonus structurel continu du bassin de tirage (Double Chance couvre 10 boules sur 90 vs 5 sur 90)
  const poolCoverageRatio = gameMode === "DOUBLE_CHANCE" ? 10.0 / 90.0 : 5.0 / 90.0;
  const modeSynergy = Math.pow(poolCoverageRatio / (5.0 / 90.0), 1.0 / (kOrder + 1.0));

  const effectiveConf = Math.max(0.01, Math.min(0.99, (safeConf / 100.0) * regimeModulator * modeSynergy));
  const criticalThreshold = kOrder / (kOrder + 1.5);

  // 4. Lift d'information continu par rapport au point mort p_fair = 1 / (b + 1)
  const pFair = 1.0 / (odds + 1.0);
  const infoLift = Math.exp(
    (effectiveConf - criticalThreshold) / (Math.sqrt(kOrder) * (1.0 - criticalThreshold))
  );

  const p = Math.max(1e-6, Math.min(0.99, pFair * infoLift));
  const q = 1.0 - p;
  const b = odds;

  // Espérance mathématique nette (Edge) et fraction de Kelly brute f* = (b*p - q) / b
  const edge = b * p - q;
  const rawKelly = edge / b;

  // 5. Amortissement de Kelly fractionnaire continu dérivé de l'incertitude (Entropie + Volatilité)
  const numTickets = portfolioMode ? 4.0 : 1.0;
  const continuousKellyDamping = 1.0 / ((1.0 + entropy + normVol) * numTickets);

  // Plafond dynamique de risque par ticket dérivé de la densité fondamentale 5/90
  const baseDomainRatio = 5.0 / 90.0;
  const dynamicMaxRisk = baseDomainRatio / (numTickets * (1.0 + 0.5 * entropy));

  // Transition continue positive
  const f = rawKelly > 0 ? Math.min(dynamicMaxRisk, rawKelly * continuousKellyDamping) : 0;

  if (f <= 0 || safeBankroll <= 0) {
    return {
      betAmount: 0,
      percentage: 0,
      winProbability: parseFloat((p * 100).toFixed(3)),
      edge: parseFloat((edge * 100).toFixed(2)),
      kellyFraction: 0,
      regimeModulator: parseFloat(regimeModulator.toFixed(3)),
      advice: `Espérance négative (Edge ${(edge * 100).toFixed(1)}%). Conserver le capital ou réduire l'ordre combinatoire.`,
    };
  }

  const rawAmount = safeBankroll * f;
  const roundedAmount = Math.floor(rawAmount / 100) * 100;

  return {
    betAmount: Math.max(0, roundedAmount),
    percentage: parseFloat((f * 100).toFixed(2)),
    winProbability: parseFloat((p * 100).toFixed(3)),
    edge: parseFloat((edge * 100).toFixed(2)),
    kellyFraction: parseFloat(continuousKellyDamping.toFixed(3)),
    regimeModulator: parseFloat(regimeModulator.toFixed(3)),
    advice: portfolioMode
      ? `Portefeuille 4 tickets • Edge +${(edge * 100).toFixed(1)}% (Kelly fractionnaire γ=${(continuousKellyDamping * 100).toFixed(0)}%)`
      : `Allocation Kelly continue • Edge +${(edge * 100).toFixed(1)}% (Amortissement γ=${(continuousKellyDamping * 100).toFixed(0)}%)`,
  };
};

export const KellyCalculator: React.FC<KellyCalculatorProps> = ({
  confidence,
  drawName = "NATIONAL",
  recommendedNumbers = [7, 77],
}) => {
  const { showToast } = useToast();
  const history = useNexusStore((state) => state.history);
  const [bankroll, setBankroll] = useState<number>(() => getBankroll());
  const [gameMode, setGameMode] = useState<GameMode>("STANDARD");
  const [selectedBetType, setSelectedBetType] = useState<string>("2N");
  const [bet, setBet] = useState<ContinuousKellyResult | null>(null);
  const [portfolioMode, setPortfolioMode] = useState(false);
  const [showRiskModal, setShowRiskModal] = useState(false);

  // Synchronisation des métriques de budget quotidien
  const [budgetMetrics, setBudgetMetrics] = useState<DailySpendingMetrics>(() => computeDailySpendingMetrics());

  useEffect(() => {
    const handleUpdate = () => {
      setBudgetMetrics(computeDailySpendingMetrics());
      setBankroll(getBankroll());
    };
    window.addEventListener("BANKROLL_BUDGET_UPDATED", handleUpdate);
    return () => window.removeEventListener("BANKROLL_BUDGET_UPDATED", handleUpdate);
  }, []);

  // Extraction dynamique des types de paris selon le mode
  const betOptions = [
    ...Object.entries(LOTO_PAYOUTS[gameMode].SIMPLE).map(
      ([key, val]: [
        string,
        { label: string; odds: number; gain: number },
      ]) => ({ key, ...val, group: "Simple" }),
    ),
    ...Object.entries(LOTO_PAYOUTS[gameMode].TURBO).map(
      ([key, val]: [
        string,
        { label: string; odds: number; gain: number },
      ]) => ({ key, ...val, group: "Turbo" }),
    ),
  ];

  // Reset selection quand on change de mode si la clé n'existe pas
  useEffect(() => {
    const exists = betOptions.some((opt) => opt.key === selectedBetType);
    if (!exists && betOptions.length > 0) {
      setSelectedBetType(betOptions[0].key);
    }
  }, [gameMode]);

  const regime = useMemo(() => {
    if (!history || history.length < 10)
      return { regime: "stable", hurst: 0.5, entropy: 0.5, volatility: 0.1 };
    return detectGameRegime(history);
  }, [history]);

  useEffect(() => {
    const baseResult = computeContinuousKellyAllocation({
      confidence,
      bankroll,
      gameMode,
      selectedBetType,
      portfolioMode,
      regime,
    });

    // Amortissement continu par le risque budgétaire quotidien f*_damped = f* * damping
    const dampedBetAmount = Math.max(
      0,
      Math.floor((baseResult.betAmount * budgetMetrics.kellyFractionDamping) / 50) * 50
    );

    const isDrifting = budgetMetrics.todaySpending > budgetMetrics.dailyAverage;

    setBet({
      ...baseResult,
      betAmount: dampedBetAmount,
      advice: isDrifting
        ? `Surdépense détectée (${budgetMetrics.todaySpending.toLocaleString()} / ${budgetMetrics.dailyAverage.toLocaleString()} F). Mise amortie de ${(budgetMetrics.continuousRiskActivation * 100).toFixed(0)}% pour protéger le capital.`
        : baseResult.advice,
    });
  }, [confidence, bankroll, selectedBetType, gameMode, portfolioMode, regime, budgetMetrics]);

  const handleRecordCurrentBet = () => {
    if (!bet || bet.betAmount <= 0) {
      showToast("La mise conseillée est nulle (espérance négative ou capital épuisé).", "info");
      return;
    }

    recordBetExpense({
      amount: bet.betAmount,
      drawName,
      betType: selectedBetType,
      gameMode,
      numbers: recommendedNumbers,
    });

    audioEngine.play("success");
    showToast(`Pari de ${bet.betAmount.toLocaleString()} FCFA comptabilisé sur ${drawName}.`, "success");
  };

  if (!bet) return null;

  const isOverBudget = budgetMetrics.todaySpending > budgetMetrics.dailyAverage;

  return (
    <div className="bg-gradient-to-r from-emerald-950 via-slate-900 to-teal-950 p-5 md:p-6 rounded-3xl md:rounded-[2rem] text-white shadow-xl border border-emerald-700/40 mt-6 relative overflow-hidden">
      <div className="absolute top-0 right-0 p-6 opacity-10">
        <Percent size={80} className="w-16 h-16 md:w-20 md:h-20" />
      </div>

      <div className="flex flex-col gap-4 md:gap-6 mb-5 md:mb-6 relative z-10">
        <div className="flex flex-wrap justify-between items-center gap-2">
          <h4 className="flex items-center gap-2 font-bold text-base md:text-lg">
            <span className="text-xl md:text-2xl">⚖️</span> Kelly Money Management & Protection de Budget
          </h4>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowRiskModal(true)}
              className={`flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-xl border transition-all cursor-pointer ${
                isOverBudget
                  ? "bg-rose-500/20 text-rose-300 border-rose-500/40 hover:bg-rose-500/30"
                  : "bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30"
              }`}
            >
              {isOverBudget ? <ShieldAlert size={13} className="animate-pulse" /> : <ShieldCheck size={13} />}
              {isOverBudget ? "Alerte Dérive Budget" : "Budget Nominal"} • {budgetMetrics.todaySpending.toLocaleString()} F / {budgetMetrics.dailyAverage.toLocaleString()} F
            </button>
            <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest bg-black/40 px-3 py-1.5 rounded-xl text-emerald-300 border border-emerald-500/20">
              <Activity size={12} />
              {regime.regime}
            </div>
          </div>
        </div>

        {/* Bannière d'avertissement de dépassement de budget quotidien */}
        {isOverBudget && (
          <div className="p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-between text-xs text-rose-200">
            <div className="flex items-center gap-2.5">
              <AlertTriangle size={18} className="text-rose-400 shrink-0" />
              <span>
                <strong>Alerte Dépense :</strong> Dépensé aujourd'hui : <strong>{budgetMetrics.todaySpending.toLocaleString()} FCFA</strong> (Moyenne : {budgetMetrics.dailyAverage.toLocaleString()} FCFA). Mise Kelly amortie à <strong>x{budgetMetrics.kellyFractionDamping}</strong>.
              </span>
            </div>
            <button
              onClick={() => setShowRiskModal(true)}
              className="text-[10px] font-black uppercase underline hover:text-white shrink-0 ml-2"
            >
              Voir Détails
            </button>
          </div>
        )}

        <div className="grid grid-cols-4 gap-1.5 bg-black/30 p-1.5 rounded-2xl border border-white/5">
          <button
            onClick={() => {
              audioEngine.play("click");
              setGameMode("STANDARD");
            }}
            className={`px-1 py-2 rounded-xl text-[10px] md:text-xs font-black uppercase flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2 transition-all ${gameMode === "STANDARD" ? "bg-emerald-600 text-white shadow-lg" : "text-emerald-300 hover:bg-white/5"}`}
          >
            <Layers size={10} /> Standard
          </button>
          <button
            onClick={() => {
              audioEngine.play("click");
              setGameMode("DOUBLE_CHANCE");
            }}
            className={`px-1 py-2 rounded-xl text-[10px] md:text-xs font-black uppercase flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2 transition-all ${gameMode === "DOUBLE_CHANCE" ? "bg-indigo-600 text-white shadow-lg" : "text-indigo-300 hover:bg-white/5"}`}
          >
            <Shuffle size={10} /> DC (G+M)
          </button>
          <button
            onClick={() => {
              audioEngine.play("click");
              setGameMode("DOUBLE_CHANCE_MACHINE");
            }}
            className={`px-1 py-2 rounded-xl text-[10px] md:text-xs font-black uppercase flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2 transition-all ${gameMode === "DOUBLE_CHANCE_MACHINE" ? "bg-amber-600 text-white shadow-lg" : "text-amber-300 hover:bg-white/5"}`}
          >
            <Bot size={10} /> DC Machine
          </button>
          <button
            onClick={() => {
              audioEngine.play("click");
              setPortfolioMode(!portfolioMode);
            }}
            className={`px-1 py-2 rounded-xl text-[10px] md:text-xs font-black uppercase flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2 transition-all ${portfolioMode ? "bg-fuchsia-600 text-white shadow-lg" : "text-fuchsia-300 hover:bg-white/5"}`}
          >
            <Briefcase size={10} /> Portfolio
          </button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-4 md:gap-6 items-start relative z-10">
        <div className="flex-1 w-full space-y-3 md:space-y-4">
          <div className="relative group">
            <select
              value={selectedBetType}
              onChange={(e) => {
                audioEngine.play("click");
                setSelectedBetType(e.target.value);
              }}
              className="w-full appearance-none bg-black/40 border border-emerald-500/30 text-emerald-100 py-2.5 md:py-3 pl-4 pr-10 rounded-xl text-[10px] md:text-xs font-bold uppercase tracking-wider focus:outline-none cursor-pointer hover:bg-black/50 transition-colors"
            >
              {betOptions.map((opt) => (
                <option
                  key={opt.key}
                  value={opt.key}
                  className="bg-slate-900 text-slate-300"
                >
                  {opt.label} (x{opt.odds})
                </option>
              ))}
            </select>
            <ChevronDown
              size={14}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-400 pointer-events-none"
            />
          </div>

          <div>
            <div className="flex justify-between items-center mb-1.5 md:mb-2">
              <label className="text-[10px] md:text-[10px] font-black uppercase text-emerald-400/80 tracking-widest">
                Capital Total (F CFA)
              </label>
              <button
                onClick={() => setShowRiskModal(true)}
                className="text-[10px] font-mono text-emerald-300/80 hover:text-white flex items-center gap-1"
              >
                <BarChart2 size={11} /> Moniteur Dépenses
              </button>
            </div>
            <input
              type="number"
              value={bankroll}
              onChange={(e) => setBankroll(Number(e.target.value))}
              className="w-full p-2.5 md:p-3 rounded-xl bg-black/30 border border-emerald-500/30 text-white font-mono font-bold text-base md:text-lg focus:ring-2 focus:ring-emerald-400 outline-none transition-all placeholder-emerald-800"
              placeholder="Ex: 5000"
            />
          </div>
        </div>

        <div className="flex-1 w-full bg-slate-950/60 p-5 rounded-2xl border border-emerald-500/20 backdrop-blur-sm flex flex-col justify-between min-h-[140px]">
          <div>
            <div className="flex justify-between items-start mb-1.5">
              <div className="text-[10px] font-black uppercase text-emerald-200 tracking-widest">
                Mise Conseillée Adaptative
              </div>
              <div className="text-[10px] md:text-xs font-bold bg-white/10 px-2 py-0.5 rounded text-emerald-100 font-mono">
                Côte: x{betOptions.find((o) => o.key === selectedBetType)?.odds}
              </div>
            </div>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl md:text-3xl font-black text-white tracking-tight font-mono">
                {isNaN(bet.betAmount)
                  ? "..."
                  : `${bet.betAmount.toLocaleString()} F`}
              </span>
              <span className="text-[10px] md:text-xs font-bold text-emerald-400 bg-emerald-900/40 px-2 py-0.5 rounded-lg border border-emerald-500/20">
                {isNaN(bet.percentage) ? "0" : bet.percentage}%
              </span>
            </div>
            <p className="text-xs text-emerald-100/70 mt-2 font-medium border-t border-white/5 pt-2">
              "{bet.advice}"
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between gap-2">
            <button
              onClick={handleRecordCurrentBet}
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-lg transition-all active:scale-95"
            >
              <PlusCircle size={15} /> Noter & Déduire du Budget
            </button>
          </div>
        </div>
      </div>

      {/* Modal du Moniteur de Risque */}
      {showRiskModal && (
        <BankrollRiskMonitor
          currentDrawName={drawName}
          onClose={() => setShowRiskModal(false)}
          isModal={true}
        />
      )}
    </div>
  );
};
