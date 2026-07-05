import React from "react";
import { motion } from "framer-motion";
import { Cpu } from "lucide-react";

interface PredictionComputationOverlayProps {
  isComputing: boolean;
  computingStep: string;
  historyLength: number;
  progress?: number;
}

export const PredictionComputationOverlay: React.FC<
  PredictionComputationOverlayProps
> = ({ isComputing, computingStep, historyLength, progress }) => {
  if (!isComputing) return null;

  return (
    <div className="bg-slate-50 dark:bg-slate-950/40 rounded-3xl p-6 sm:p-12 border border-slate-200 dark:border-slate-850 shadow-inner flex flex-col items-center justify-center relative overflow-hidden transition-all duration-300">
      {/* Background Tech Mesh */}
      <div className="absolute inset-0 bg-grid-pattern opacity-[0.02] dark:opacity-[0.05] pointer-events-none"></div>

      <div className="relative flex flex-col items-center max-w-lg w-full">
        {/* Interactive Dual-Rotor Loading Core */}
        <div className="relative mb-8 w-20 h-20">
          <motion.div
            className="absolute inset-0 rounded-full border-4 border-indigo-500/20 border-t-indigo-600 dark:border-t-indigo-400"
            animate={{ rotate: 360 }}
            transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
          />
          <motion.div
            className="absolute inset-2 rounded-full border-4 border-emerald-500/10 border-t-emerald-500"
            animate={{ rotate: -360 }}
            transition={{ duration: 1.8, repeat: Infinity, ease: "linear" }}
          />
          <div className="absolute inset-4 rounded-full bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 flex items-center justify-center shadow-lg">
            <Cpu
              className="text-indigo-500 dark:text-indigo-400 animate-pulse"
              size={24}
            />
          </div>
        </div>

        {/* Title and Step */}
        <div className="space-y-2 mb-8 text-center">
          <h3 className="text-sm font-black uppercase tracking-[0.2em] text-slate-400">
            Unité d'Inférence Stochastique
          </h3>
          <p className="text-2xl font-black text-slate-850 dark:text-white tracking-tight">
            Calibration de l'ADN Vectoriel
          </p>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 text-[10px] font-black uppercase tracking-wider animate-pulse">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-ping"></span>
            Étape : {computingStep}
          </div>
        </div>

        {/* Real-time Progress Bar */}
        {progress !== undefined && (
          <div className="w-full max-w-sm mb-8 space-y-1.5 px-4">
            <div className="flex justify-between text-[10px] font-black uppercase tracking-wider text-slate-400">
              <span>Progression de l'Inférence</span>
              <span className="font-mono text-indigo-500 dark:text-indigo-400">{progress}%</span>
            </div>
            <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-indigo-500 to-emerald-500 rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
          </div>
        )}

        {/* Real-time Telemetry Dashboard */}
        <div className="w-full bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-850 rounded-2xl p-5 text-left space-y-3 shadow-md max-h-[170px] overflow-y-auto font-mono text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed max-w-sm">
          <div className="flex items-start gap-2 border-b border-slate-50 dark:border-slate-850 pb-2">
            <span className="text-emerald-500 font-bold">✔</span>
            <span>[GÉOPOLYGONAL] Filtre d'historique borné : N=90, K=5</span>
          </div>
          <div className="flex items-start gap-2 border-b border-slate-50 dark:border-slate-850 pb-2">
            <span className="text-emerald-500 font-bold">✔</span>
            <span>[SPECTRAL] Coefficients spectraux isolés</span>
          </div>
          <div className="flex items-start gap-2 border-b border-slate-50 dark:border-slate-850 pb-2">
            <span
              className={`font-bold ${computingStep.includes("Inférences") ? "text-indigo-500 animate-pulse" : "text-emerald-500"}`}
            >
              {computingStep.includes("Inférences") ? "•" : "✔"}
            </span>
            <span
              className={
                computingStep.includes("Inférences")
                  ? "text-slate-800 dark:text-white font-semibold"
                  : ""
              }
            >
              [ORACLE] Évaluation de divergence KL sur {historyLength || 0}{" "}
              tirages
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span
              className={`font-bold ${computingStep.includes("Convergence") ? "text-indigo-500 animate-pulse" : "text-slate-400"}`}
            >
              {computingStep.includes("Convergence") ? "•" : "•"}
            </span>
            <span
              className={
                computingStep.includes("Convergence")
                  ? "text-slate-800 dark:text-white font-semibold"
                  : ""
              }
            >
              [STREAK] Application anti-monoculture (Cosinus &gt; 0.40)
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
