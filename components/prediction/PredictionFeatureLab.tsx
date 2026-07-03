import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, ChevronUp, ChevronDown, Settings } from "lucide-react";
import { useFeatureFlags } from "../../services/prediction/featureFlags";
import { useNexusStore } from "../../store/useNexusStore";

interface PredictionFeatureLabProps {
  showCyberFlags: boolean;
  setShowCyberFlags: (show: boolean) => void;
}

export const PredictionFeatureLab: React.FC<PredictionFeatureLabProps> = ({
  showCyberFlags,
  setShowCyberFlags,
}) => {
  const { flags, toggleFlag } = useFeatureFlags();
  const isForensicOptimized = useNexusStore((state) => state.isForensicOptimized);
  const setForensicOptimized = useNexusStore((state) => state.setForensicOptimized);

  return (
    <>
      <button
        onClick={() => setShowCyberFlags(!showCyberFlags)}
        className={`flex-1 xs:flex-none flex items-center justify-center gap-2 px-4 py-2 rounded-full border transition-colors ${showCyberFlags ? "bg-indigo-600 border-indigo-700 text-white" : "bg-slate-50 border-slate-200 text-slate-600 dark:bg-slate-800/50 dark:border-slate-700 dark:text-slate-300"} `}
      >
        <Settings
          size={14}
          className={showCyberFlags ? "animate-spin-slow" : ""}
        />
        <span className="text-xs font-semibold uppercase tracking-wider font-medium">
          Flags Lab
        </span>
        {showCyberFlags ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>
      <AnimatePresence>
        {showCyberFlags && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="w-full max-w-lg mx-auto bg-slate-50 dark:bg-slate-950/50 border border-slate-100 dark:border-slate-850 rounded-2xl p-5 mb-6 text-left overflow-hidden z-10 xs:absolute xs:top-20 xs:right-6"
          >
            <h4 className="text-[10px] font-black text-indigo-500 uppercase tracking-widest flex items-center gap-1.5 mb-3">
              <Sparkles size={12} className="text-indigo-400" /> Laboratoire de
              Flags Cybernétiques Expérimentaux
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-indigo-500/10 dark:bg-indigo-500/25 border border-indigo-500/25 dark:border-indigo-500/40">
                <div className="flex flex-col pr-2">
                  <span className="text-[10px] font-bold text-indigo-950 dark:text-indigo-200">
                    Optimisation Forensic
                  </span>
                  <span className="text-[8px] text-indigo-700 dark:text-indigo-300 font-medium">
                    Intègre les erreurs passées (+1, -1, ombres, miroirs, calibrages)
                  </span>
                </div>
                <button
                  onClick={() => setForensicOptimized(!isForensicOptimized)}
                  className={`w-9 h-5 rounded-full transition-colors relative flex items-center p-0.5 ${isForensicOptimized ? "bg-indigo-600 justify-end" : "bg-slate-300 dark:bg-slate-750 justify-start"}`}
                >
                  <span className="w-4 h-4 bg-white rounded-full shadow" />
                </button>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800">
                <div className="flex flex-col pr-2">
                  <span className="text-[10px] font-bold text-slate-800 dark:text-slate-200">
                    Anti-Consensus
                  </span>
                  <span className="text-[8px] text-slate-550 dark:text-slate-400">
                    Perturbations contradictoires
                  </span>
                </div>
                <button
                  onClick={() => toggleFlag("adversarialMode")}
                  className={`w-9 h-5 rounded-full transition-colors relative flex items-center p-0.5 ${flags.adversarialMode ? "bg-orange-500 justify-end" : "bg-slate-300 dark:bg-slate-750 justify-start"}`}
                >
                  <span className="w-4 h-4 bg-white rounded-full shadow" />
                </button>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800">
                <div className="flex flex-col pr-2">
                  <span className="text-[10px] font-bold text-slate-800 dark:text-slate-200">
                    Rétropropagation ADN
                  </span>
                  <span className="text-[8px] text-slate-550 dark:text-slate-400">
                    Optimisation continue gradients
                  </span>
                </div>
                <button
                  onClick={() => toggleFlag("dnaBackpropagation")}
                  className={`w-9 h-5 rounded-full transition-colors relative flex items-center p-0.5 ${flags.dnaBackpropagation ? "bg-emerald-500 justify-end" : "bg-slate-300 dark:bg-slate-750 justify-start"}`}
                >
                  <span className="w-4 h-4 bg-white rounded-full shadow" />
                </button>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800">
                <div className="flex flex-col pr-2">
                  <span className="text-[10px] font-bold text-slate-800 dark:text-slate-200">
                    Dénoyautage Quantique
                  </span>
                  <span className="text-[8px] text-slate-550 dark:text-slate-400">
                    PCA probabiliste sur signaux
                  </span>
                </div>
                <button
                  onClick={() => toggleFlag("quantumStateDenoising")}
                  className={`w-9 h-5 rounded-full transition-colors relative flex items-center p-0.5 ${flags.quantumStateDenoising ? "bg-indigo-500 justify-end" : "bg-slate-300 dark:bg-slate-750 justify-start"}`}
                >
                  <span className="w-4 h-4 bg-white rounded-full shadow" />
                </button>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800">
                <div className="flex flex-col pr-2">
                  <span className="text-[10px] font-bold text-slate-800 dark:text-slate-200">
                    Dénoyautage Fourier
                  </span>
                  <span className="text-[8px] text-slate-550 dark:text-slate-400 font-medium">
                    Filtrage d'énergie spectrale
                  </span>
                </div>
                <button
                  onClick={() => toggleFlag("spectralDenoising")}
                  className={`w-9 h-5 rounded-full transition-colors relative flex items-center p-0.5 ${flags.spectralDenoising ? "bg-blue-500 justify-end" : "bg-slate-300 dark:bg-slate-750 justify-start"}`}
                >
                  <span className="w-4 h-4 bg-white rounded-full shadow" />
                </button>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800">
                <div className="flex flex-col pr-2">
                  <span className="text-[10px] font-bold text-slate-800 dark:text-slate-200">
                    Auto-Etalonnage Kalman
                  </span>
                  <span className="text-[8px] text-slate-550 dark:text-slate-400">
                    Rétroaction temps-réel adaptative
                  </span>
                </div>
                <button
                  onClick={() => toggleFlag("kalmanAutoCalibration")}
                  className={`w-9 h-5 rounded-full transition-colors relative flex items-center p-0.5 ${flags.kalmanAutoCalibration ? "bg-purple-500 justify-end" : "bg-slate-300 dark:bg-slate-750 justify-start"}`}
                >
                  <span className="w-4 h-4 bg-white rounded-full shadow" />
                </button>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800">
                <div className="flex flex-col pr-2">
                  <span className="text-[10px] font-bold text-slate-800 dark:text-slate-200">
                    Réduction Bayésienne
                  </span>
                  <span className="text-[8px] text-slate-550 dark:text-slate-400">
                    Pondération temporelle robuste
                  </span>
                </div>
                <button
                  onClick={() => toggleFlag("bayesianShrinkage")}
                  className={`w-9 h-5 rounded-full transition-colors relative flex items-center p-0.5 ${flags.bayesianShrinkage ? "bg-pink-500 justify-end" : "bg-slate-300 dark:bg-slate-750 justify-start"}`}
                >
                  <span className="w-4 h-4 bg-white rounded-full shadow" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
