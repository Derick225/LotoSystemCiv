import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  computeDailySpendingMetrics,
  recordBetExpense,
  clearBetExpenses,
  loadAllBetExpenses,
  DailySpendingMetrics,
  UserBetExpense,
} from "../services/bankrollBudgetService";
import { getBankroll, updateBankroll } from "../services/userPreferencesService";
import { audioEngine } from "../utils/audioEngine";
import { useToast } from "./ui/Toast";
import {
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Wallet,
  Clock,
  Activity,
  PlusCircle,
  RefreshCw,
  Scale,
  Sparkles,
  Info,
  Sliders,
  CheckCircle2,
  X,
  History,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface BankrollRiskMonitorProps {
  currentDrawName?: string;
  onClose?: () => void;
  isModal?: boolean;
}

export const BankrollRiskMonitor: React.FC<BankrollRiskMonitorProps> = ({
  currentDrawName = "NATIONAL",
  onClose,
  isModal = false,
}) => {
  const { showToast } = useToast();
  const [metrics, setMetrics] = useState<DailySpendingMetrics>(() => computeDailySpendingMetrics());
  const [expenses, setExpenses] = useState<UserBetExpense[]>(() => loadAllBetExpenses());

  // Formulaire d'enregistrement rapide de mise
  const [showLogForm, setShowLogForm] = useState(false);
  const [inputAmount, setInputAmount] = useState<number>(500);
  const [inputBetType, setInputBetType] = useState<string>("2N");
  const [inputNumbers, setInputNumbers] = useState<string>("12, 45");

  // Ajustement de capital
  const [showAdjustBankroll, setShowAdjustBankroll] = useState(false);
  const [newBankrollAmount, setNewBankrollAmount] = useState<number>(() => getBankroll());

  const refreshMetrics = useCallback(() => {
    setMetrics(computeDailySpendingMetrics());
    setExpenses(loadAllBetExpenses());
  }, []);

  useEffect(() => {
    const handleUpdate = () => {
      refreshMetrics();
    };
    window.addEventListener("BANKROLL_BUDGET_UPDATED", handleUpdate);
    return () => window.removeEventListener("BANKROLL_BUDGET_UPDATED", handleUpdate);
  }, [refreshMetrics]);

  // Détermination de la palette chromatique continue selon le score de risque A(Z)
  const riskColor = useMemo(() => {
    const r = metrics.continuousRiskActivation;
    if (r < 0.35) {
      return {
        bg: "bg-emerald-500/10",
        border: "border-emerald-500/30",
        text: "text-emerald-400",
        badge: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
        bar: "bg-gradient-to-r from-emerald-500 to-teal-400",
        label: "Régime Nominal / Budget Protégé",
        status: "STABLE",
      };
    }
    if (r < 0.65) {
      return {
        bg: "bg-amber-500/10",
        border: "border-amber-500/30",
        text: "text-amber-400",
        badge: "bg-amber-500/20 text-amber-300 border-amber-500/30",
        bar: "bg-gradient-to-r from-amber-500 to-orange-400",
        label: "Dérive Modérée / Vigilance Requise",
        status: "VIGILANCE",
      };
    }
    return {
      bg: "bg-rose-500/15",
      border: "border-rose-500/40",
      text: "text-rose-400",
      badge: "bg-rose-500/20 text-rose-300 border-rose-500/40",
      bar: "bg-gradient-to-r from-rose-500 via-rose-600 to-red-600",
      label: "Alerte Dépassement / Risque Élevé",
      status: "ALERTE_SURDÉPENSE",
    };
  }, [metrics.continuousRiskActivation]);

  const handleRecordBet = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputAmount || inputAmount <= 0) {
      showToast("Veuillez saisir un montant de mise valide.", "error");
      return;
    }

    const parsedNumbers = inputNumbers
      .split(/[,\s]+/)
      .map((n) => parseInt(n.trim(), 10))
      .filter((n) => !isNaN(n) && n >= 1 && n <= 90);

    recordBetExpense({
      amount: inputAmount,
      drawName: currentDrawName,
      betType: inputBetType,
      numbers: parsedNumbers.length > 0 ? parsedNumbers : [7, 77],
    });

    audioEngine.play("click");
    showToast(`Mise de ${inputAmount.toLocaleString()} FCFA enregistrée.`, "success");
    setShowLogForm(false);
    refreshMetrics();
  };

  const handleSaveBankroll = () => {
    if (newBankrollAmount < 0) return;
    const diff = newBankrollAmount - metrics.currentBankroll;
    updateBankroll(diff);
    audioEngine.play("success");
    showToast("Capital total actualisé.", "success");
    setShowAdjustBankroll(false);
    refreshMetrics();
  };

  const content = (
    <div className="space-y-6">
      {/* En-tête avec Statut de Risque Continu */}
      <div className={`p-5 rounded-3xl border ${riskColor.border} ${riskColor.bg} backdrop-blur-md transition-all shadow-xl`}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className={`p-3 rounded-2xl ${riskColor.badge} border shadow-lg`}>
              {metrics.continuousRiskActivation >= 0.65 ? (
                <ShieldAlert size={28} className="animate-pulse" />
              ) : metrics.continuousRiskActivation >= 0.35 ? (
                <AlertTriangle size={28} />
              ) : (
                <ShieldCheck size={28} />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full border ${riskColor.badge}`}>
                  {riskColor.status}
                </span>
                <span className="text-[10px] font-mono text-slate-400">
                  Z-Score = {metrics.driftZScore >= 0 ? `+${metrics.driftZScore}` : metrics.driftZScore}σ
                </span>
              </div>
              <h2 className="text-xl font-black text-white tracking-tight mt-1">
                Moniteur de Risque & Dépenses Quotidiennes
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowLogForm(!showLogForm)}
              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-md transition-all active:scale-95"
            >
              <PlusCircle size={15} /> Noter une mise
            </button>
            <button
              onClick={() => setShowAdjustBankroll(!showAdjustBankroll)}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-all border border-slate-700"
            >
              <Wallet size={15} /> Ajuster Capital
            </button>
            {isModal && onClose && (
              <button
                onClick={onClose}
                className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl transition-all"
              >
                <X size={18} />
              </button>
            )}
          </div>
        </div>

        {/* Jauge de Risque Continue Différentiable A(Z) */}
        <div className="mt-5 space-y-2">
          <div className="flex justify-between items-center text-xs font-mono">
            <span className="text-slate-300 font-semibold flex items-center gap-1.5">
              <Activity size={13} className={riskColor.text} /> Activation Continue du Risque A(Z_t) :
            </span>
            <span className={`font-black ${riskColor.text}`}>
              {metrics.riskPercentage}% (Amortissement Kelly : x{metrics.kellyFractionDamping})
            </span>
          </div>

          <div className="w-full h-3 bg-slate-950/80 rounded-full overflow-hidden p-0.5 border border-slate-800/80">
            <motion.div
              className={`h-full rounded-full ${riskColor.bar}`}
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(100, Math.max(5, metrics.riskPercentage))}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
            />
          </div>

          <div className="flex justify-between text-[10px] text-slate-500 font-mono px-1">
            <span>0% (Nominal)</span>
            <span>Moyenne Quotidienne</span>
            <span>100% (Surdépense critique)</span>
          </div>
        </div>

        {/* Diagnostic Métier Explicite */}
        <div className="mt-4 p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800 text-xs text-slate-300 space-y-1.5 leading-relaxed">
          {metrics.todaySpending > metrics.dailyAverage ? (
            <div className="flex items-start gap-2 text-rose-300 font-medium">
              <AlertTriangle size={16} className="shrink-0 mt-0.5 text-rose-400" />
              <span>
                <strong>Alerte de Dérive Budgétaire :</strong> Vous avez dépensé{" "}
                <span className="underline font-mono text-white">
                  {metrics.todaySpending.toLocaleString()} FCFA
                </span>{" "}
                aujourd'hui, soit{" "}
                <span className="font-mono text-white">
                  +{(metrics.todaySpending - metrics.dailyAverage).toLocaleString()} FCFA
                </span>{" "}
                au-dessus de votre moyenne journalière historique (
                <span className="font-mono text-slate-200">{metrics.dailyAverage.toLocaleString()} FCFA/j</span>).
                Le moteur a automatiquement amorti la mise optimale de Kelly d'un facteur{" "}
                <span className="font-mono text-rose-300 font-black">
                  {metrics.kellyFractionDamping}
                </span>{" "}
                pour préserver votre horizon de capital.
              </span>
            </div>
          ) : (
            <div className="flex items-start gap-2 text-emerald-300 font-medium">
              <CheckCircle2 size={16} className="shrink-0 mt-0.5 text-emerald-400" />
              <span>
                <strong>Discipline Respectée :</strong> Vos dépenses d'aujourd'hui (
                <span className="font-mono text-white">{metrics.todaySpending.toLocaleString()} FCFA</span>)
                restent sous contrôle par rapport à votre moyenne quotidienne (
                <span className="font-mono text-white">{metrics.dailyAverage.toLocaleString()} FCFA</span>).
                Pleine allocation de Kelly autorisée.
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Formulaire Modal / Drawer d'ajout de mise */}
      <AnimatePresence>
        {showLogForm && (
          <motion.form
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            onSubmit={handleRecordBet}
            className="p-5 rounded-2xl bg-slate-900 border border-indigo-500/30 space-y-4 shadow-xl overflow-hidden"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                <PlusCircle size={16} className="text-indigo-400" /> Enregistrer un ticket joué
              </h3>
              <button
                type="button"
                onClick={() => setShowLogForm(false)}
                className="text-slate-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">
                  Montant Mise (FCFA)
                </label>
                <input
                  type="number"
                  min="50"
                  step="50"
                  value={inputAmount}
                  onChange={(e) => setInputAmount(Math.max(0, parseInt(e.target.value, 10) || 0))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono text-sm focus:border-indigo-500 outline-none"
                  required
                />
              </div>

              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">
                  Type de Pari
                </label>
                <select
                  value={inputBetType}
                  onChange={(e) => setInputBetType(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-sm focus:border-indigo-500 outline-none font-mono"
                >
                  <option value="1N">1N (Premier Numéro)</option>
                  <option value="2N">2N (2 Sûrs / 2 Perm)</option>
                  <option value="3N">3N (3 Sûrs)</option>
                  <option value="4N">4N (4 Numéros)</option>
                  <option value="5N">5N (Quinte)</option>
                  <option value="T2">Turbo 2</option>
                  <option value="T3">Turbo 3</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">
                  Numéros (séparés par virgule)
                </label>
                <input
                  type="text"
                  value={inputNumbers}
                  onChange={(e) => setInputNumbers(e.target.value)}
                  placeholder="ex: 12, 45, 89"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono text-sm focus:border-indigo-500 outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowLogForm(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-all"
              >
                Annuler
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-lg transition-all"
              >
                Enregistrer la dépense
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {/* Formulaire d'ajustement du capital total */}
      <AnimatePresence>
        {showAdjustBankroll && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="p-5 rounded-2xl bg-slate-900 border border-slate-700 space-y-4 shadow-xl overflow-hidden"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                <Wallet size={16} className="text-slate-400" /> Ajuster votre Capital de Jeu (Bankroll)
              </h3>
              <button
                onClick={() => setShowAdjustBankroll(false)}
                className="text-slate-400 hover:text-white"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex-1">
                <label className="text-[10px] font-black uppercase text-slate-400 block mb-1">
                  Nouveau Solde Bankroll (FCFA)
                </label>
                <input
                  type="number"
                  min="0"
                  step="1000"
                  value={newBankrollAmount}
                  onChange={(e) => setNewBankrollAmount(parseInt(e.target.value, 10) || 0)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono text-sm focus:border-indigo-500 outline-none"
                />
              </div>
              <button
                onClick={handleSaveBankroll}
                className="mt-5 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-md"
              >
                Valider
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Cartes Métriques Clés (Zéro Magie, Métriques Statistiques Réelles) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800/80 space-y-1">
          <div className="flex items-center gap-1.5 text-[10px] font-black uppercase text-slate-400">
            <Wallet size={13} className="text-indigo-400" /> Capital Actuel
          </div>
          <div className="text-lg font-black font-mono text-white">
            {metrics.currentBankroll.toLocaleString()} <span className="text-[10px] font-sans text-slate-500">FCFA</span>
          </div>
          <div className="text-[10px] text-slate-500">
            Solde total en réserve
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800/80 space-y-1">
          <div className="flex items-center gap-1.5 text-[10px] font-black uppercase text-slate-400">
            <Clock size={13} className="text-amber-400" /> Dépensé Aujourd'hui
          </div>
          <div className={`text-lg font-black font-mono ${metrics.todaySpending > metrics.dailyAverage ? "text-rose-400" : "text-white"}`}>
            {metrics.todaySpending.toLocaleString()} <span className="text-[10px] font-sans text-slate-500">FCFA</span>
          </div>
          <div className="text-[10px] text-slate-500">
            Burn Rate : {metrics.burnRate}% du capital
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800/80 space-y-1">
          <div className="flex items-center gap-1.5 text-[10px] font-black uppercase text-slate-400">
            <Scale size={13} className="text-cyan-400" /> Moyenne Quotidienne
          </div>
          <div className="text-lg font-black font-mono text-white">
            {metrics.dailyAverage.toLocaleString()} <span className="text-[10px] font-sans text-slate-500">FCFA/j</span>
          </div>
          <div className="text-[10px] text-slate-500">
            Écart-type : ±{metrics.dailyStdDev.toLocaleString()} FCFA
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800/80 space-y-1">
          <div className="flex items-center gap-1.5 text-[10px] font-black uppercase text-slate-400">
            <ShieldCheck size={13} className="text-emerald-400" /> Horizon de Survie
          </div>
          <div className="text-lg font-black font-mono text-emerald-400">
            {metrics.capitalSurvivalHorizon} <span className="text-[10px] font-sans text-slate-500">jours</span>
          </div>
          <div className="text-[10px] text-slate-500">
            Au rythme de mise actuel
          </div>
        </div>
      </div>

      {/* Historique des Dépenses & Journal des Tickets */}
      <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-2">
            <History size={15} className="text-indigo-400" /> Journal Récent des Mises & Dépenses
          </h3>
          <span className="text-[10px] text-slate-500 font-mono">
            {expenses.length} transaction(s) enregistrée(s)
          </span>
        </div>

        {expenses.length === 0 ? (
          <div className="py-8 text-center text-slate-500 text-xs">
            Aucune mise enregistrée pour le moment. Cliquez sur "Noter une mise" pour suivre vos dépenses et activer la protection du budget.
          </div>
        ) : (
          <div className="max-h-60 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
            {expenses.slice(0, 8).map((exp) => (
              <div
                key={exp.id}
                className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 flex items-center justify-between text-xs transition-all hover:border-slate-700"
              >
                <div className="flex items-center gap-3">
                  <span className="px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-400 font-mono text-[10px] font-bold border border-indigo-500/20">
                    {exp.drawName}
                  </span>
                  <div>
                    <div className="font-semibold text-slate-200">
                      Pari {exp.betType} • Numéros :{" "}
                      <span className="font-mono text-indigo-300">
                        {exp.numbers.join(", ")}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono">
                      {new Date(exp.timestamp).toLocaleDateString()} {new Date(exp.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <div className="font-mono font-black text-rose-400">
                    -{exp.amount.toLocaleString()} FCFA
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  if (isModal) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
        <div className="bg-slate-950 border border-slate-800 rounded-3xl max-w-2xl w-full p-6 shadow-2xl overflow-y-auto max-h-[90vh]">
          {content}
        </div>
      </div>
    );
  }

  return content;
};
