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
} from "lucide-react";
import { audioEngine } from "../utils/audioEngine";
import { useNexusHistory } from "../store/useNexusStore";
import { detectGameRegime } from "../services/mathService";

interface KellyCalculatorProps {
  confidence: number;
}

type GameMode = "STANDARD" | "DOUBLE_CHANCE" | "DOUBLE_CHANCE_MACHINE";

export const KellyCalculator: React.FC<KellyCalculatorProps> = ({
  confidence,
}) => {
  const history = useNexusHistory();
  const [bankroll, setBankroll] = useState<number>(5000);
  const [gameMode, setGameMode] = useState<GameMode>("STANDARD");
  const [selectedBetType, setSelectedBetType] = useState<string>("2N");
  const [bet, setBet] = useState<{
    betAmount: number;
    percentage: number;
    advice: string;
  } | null>(null);
  const [portfolioMode, setPortfolioMode] = useState(false);

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
      return { regime: "stable", volatility: 0.1 };
    return detectGameRegime(history);
  }, [history]);

  useEffect(() => {
    let safeConf = isNaN(confidence) ? 50 : confidence;

    // Ajustement selon le régime
    if (regime.regime === "chaotic") {
      safeConf *= 0.8; // Réduction de confiance en régime chaotique
    } else if (regime.regime === "trend") {
      safeConf *= 1.1;
    }

    let odds = 240;
    const currentPayouts = LOTO_PAYOUTS[gameMode];

    if (selectedBetType in currentPayouts.SIMPLE)
      odds =
        currentPayouts.SIMPLE[
          selectedBetType as keyof typeof currentPayouts.SIMPLE
        ].odds;
    else if (selectedBetType in currentPayouts.TURBO)
      odds =
        currentPayouts.TURBO[
          selectedBetType as keyof typeof currentPayouts.TURBO
        ].odds;

    // Probabilité ajustée selon le mode
    // DC Machine (odds plus faibles = probabilité perçue plus haute)
    let baseWinProb = 0.15;
    if (gameMode === "DOUBLE_CHANCE") baseWinProb = 0.22;
    if (gameMode === "DOUBLE_CHANCE_MACHINE") baseWinProb = 0.25;

    const b = odds;
    const p = (safeConf / 100) * baseWinProb;
    const q = 1 - p;

    let f = (b * p - q) / b;

    // Diversification Constraint (Portfolio optimization)
    // If portfolio mode is active, Kelly is divided by 4 tickets and capped at 2.5% max per ticket.
    const maxRisk = portfolioMode ? 0.025 : 0.05;
    const multiplier = portfolioMode ? 0.25 : 0.5; // Quart de Kelly ou Demi-Kelly

    f = f * multiplier;
    f = Math.min(f, maxRisk);

    let result;
    if (f <= 0) {
      result = {
        betAmount: 0,
        percentage: 0,
        advice: "Espérance négative. Ne pas parier sur ce type.",
      };
    } else {
      const amount = Math.floor(bankroll * f);
      const roundedAmount = Math.floor(amount / 100) * 100;
      result = {
        betAmount: Math.max(0, roundedAmount),
        percentage: parseFloat((f * 100).toFixed(2)),
        advice: portfolioMode
          ? `Mise par ticket (Portefeuille diversifié de 4 tickets)`
          : `Mise Optimale (Demi-Kelly)`,
      };
    }

    setBet(result);
  }, [confidence, bankroll, selectedBetType, gameMode, portfolioMode, regime]);

  if (!bet) return null;

  return (
    <div className="bg-gradient-to-r from-emerald-900 to-teal-900 p-5 md:p-6 rounded-3xl md:rounded-[2rem] text-white shadow-lg border border-emerald-700/50 mt-6 relative overflow-hidden">
      <div className="absolute top-0 right-0 p-6 opacity-10">
        <Percent size={80} className="w-16 h-16 md:w-20 md:h-20" />
      </div>

      <div className="flex flex-col gap-4 md:gap-6 mb-5 md:mb-6 relative z-10">
        <div className="flex justify-between items-center">
          <h4 className="flex items-center gap-2 font-bold text-base md:text-lg">
            <span className="text-xl md:text-2xl">⚖️</span> Kelly Money
            Management
          </h4>
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest bg-black/20 px-3 py-1 rounded-full text-emerald-300">
            <Activity size={12} />
            Régime Actuel : {regime.regime}
          </div>
        </div>

        <div className="grid grid-cols-4 gap-1.5 bg-black/20 p-1 rounded-2xl">
          <button
            onClick={() => {
              audioEngine.play("click");
              setGameMode("STANDARD");
            }}
            className={`px-1 py-2 rounded-xl text-[10px] md:text-xs font-black uppercase flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2 transition-all ${gameMode === "STANDARD" ? "bg-emerald-500 text-white shadow-lg" : "text-emerald-300 hover:bg-white/5"}`}
          >
            <Layers size={10} /> Standard
          </button>
          <button
            onClick={() => {
              audioEngine.play("click");
              setGameMode("DOUBLE_CHANCE");
            }}
            className={`px-1 py-2 rounded-xl text-[10px] md:text-xs font-black uppercase flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2 transition-all ${gameMode === "DOUBLE_CHANCE" ? "bg-indigo-500 text-white shadow-lg" : "text-indigo-300 hover:bg-white/5"}`}
          >
            <Shuffle size={10} /> DC (G+M)
          </button>
          <button
            onClick={() => {
              audioEngine.play("click");
              setGameMode("DOUBLE_CHANCE_MACHINE");
            }}
            className={`px-1 py-2 rounded-xl text-[10px] md:text-xs font-black uppercase flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2 transition-all ${gameMode === "DOUBLE_CHANCE_MACHINE" ? "bg-amber-500 text-white shadow-lg" : "text-amber-300 hover:bg-white/5"}`}
          >
            <Bot size={10} /> DC Machine
          </button>
          <button
            onClick={() => {
              audioEngine.play("click");
              setPortfolioMode(!portfolioMode);
            }}
            className={`px-1 py-2 rounded-xl text-[10px] md:text-xs font-black uppercase flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2 transition-all ${portfolioMode ? "bg-fuchsia-500 text-white shadow-lg" : "text-fuchsia-300 hover:bg-white/5"}`}
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
              className="w-full appearance-none bg-black/30 border border-emerald-500/30 text-emerald-100 py-2.5 md:py-3 pl-4 pr-10 rounded-xl text-[10px] md:text-xs font-bold uppercase tracking-wider focus:outline-none cursor-pointer hover:bg-black/40 transition-colors"
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
            <label className="block text-[10px] md:text-[10px] font-black uppercase text-emerald-400/80 mb-1.5 md:mb-2 tracking-widest">
              Capital Total (F CFA)
            </label>
            <input
              type="number"
              value={bankroll}
              onChange={(e) => setBankroll(Number(e.target.value))}
              className="w-full p-2.5 md:p-3 rounded-xl bg-black/20 border border-emerald-500/30 text-white font-mono font-bold text-base md:text-lg focus:ring-2 focus:ring-emerald-400 outline-none transition-all placeholder-emerald-800"
              placeholder="Ex: 5000"
            />
          </div>
        </div>

        <div className="flex-1 w-full bg-white/5 p-4 rounded-2xl border border-white/10 backdrop-blur-sm flex flex-col justify-center min-h-[100px] md:min-h-[120px]">
          <div className="flex justify-between items-start mb-1.5 md:mb-2">
            <div className="text-[10px] md:text-[10px] font-black uppercase text-emerald-200 tracking-widest">
              Mise Conseillée
            </div>
            <div className="text-[10px] md:text-xs font-bold bg-white/10 px-2 py-0.5 rounded text-emerald-100">
              Côte: x{betOptions.find((o) => o.key === selectedBetType)?.odds}
            </div>
          </div>
          <div className="flex items-baseline gap-2 mt-0.5 md:mt-1">
            <span className="text-2xl md:text-3xl font-black text-white tracking-tight">
              {isNaN(bet.betAmount)
                ? "..."
                : `${bet.betAmount.toLocaleString()} F`}
            </span>
            <span className="text-[10px] md:text-xs font-bold text-emerald-400 bg-emerald-900/40 px-2 py-0.5 rounded-lg border border-emerald-500/20">
              {isNaN(bet.percentage) ? "0" : bet.percentage}%
            </span>
          </div>
          <p className="text-xs md:text-[10px] text-emerald-100/60 mt-2 italic font-medium border-t border-white/5 pt-2">
            "{bet.advice}"
          </p>
        </div>
      </div>
    </div>
  );
};
