import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Activity,
  AlertCircle,
  Award,
  BrainCircuit,
  Check,
  CheckCircle2,
  Copy,
  Cpu,
  Download,
  FileText,
  Network,
  RefreshCw,
  ShieldCheck,
  Sliders,
  Sparkles,
  Target,
} from "lucide-react";
import { ACTIVE_ALGO_COUNT } from "../../../shared/prediction.types";
import { audioEngine } from "../../../utils/audioEngine";
import { formatPercent, type InferencePrediction } from "./types";

interface IAPredictionInferencePanelProps {
  skipTraining: boolean;
  onToggleSkipTraining: (skip: boolean) => void;
  forcedOutsiderCount: number;
  onChangeForcedOutsiderCount: (count: number) => void;
  loading: boolean;
  error: string | null;
  prediction: InferencePrediction | null;
  globalRegimeLabel?: string;
  hasGlobalRegime: boolean;
  isCopiedInference: boolean;
  isExportingPDF: boolean;
  onRunAIPrediction: () => void;
  onCopyTicket: (numbers: number[]) => void;
  onExportJSON: (pred: InferencePrediction) => void;
  onExportPDF: (pred: InferencePrediction) => void;
  onSaveToForensicLog: (pred: InferencePrediction) => Promise<void>;
}

export const IAPredictionInferencePanel: React.FC<IAPredictionInferencePanelProps> = ({
  skipTraining,
  onToggleSkipTraining,
  forcedOutsiderCount,
  onChangeForcedOutsiderCount,
  loading,
  error,
  prediction,
  globalRegimeLabel,
  hasGlobalRegime,
  isCopiedInference,
  isExportingPDF,
  onRunAIPrediction,
  onCopyTicket,
  onExportJSON,
  onExportPDF,
  onSaveToForensicLog,
}) => {
  return (
    <div className="space-y-6">
      {/* Cybernetic Control Panel */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-950 to-indigo-950/20 p-6 rounded-[2rem] border border-slate-800/80 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-[40px] pointer-events-none" />
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 relative z-10">
          <div className="space-y-1">
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-300 flex items-center gap-2">
              <Sliders size={14} className="text-indigo-400" />
              Panneau de Contrôle Cybernétique
            </h3>
            <p className="text-[11px] text-slate-500">
              Ajustez continûment l'apprentissage de l'ADN
              algorithmologique, la réduction de consensus et la couverture
              spectrale.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mt-6 pt-6 border-t border-slate-800/60 relative z-10">
          {/* Toggle 1: Active Learning */}
          <label
            className="flex items-start gap-3 cursor-pointer select-none group"
            style={{ minHeight: "44px" }}
          >
            <div className="relative flex items-center h-5 mt-1.5 shrink-0">
              <input
                type="checkbox"
                checked={!skipTraining}
                onChange={(e) => {
                  audioEngine.play("click");
                  onToggleSkipTraining(!e.target.checked);
                }}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-slate-800 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-300 after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-fuchsia-600 peer-checked:after:bg-white" />
            </div>
            <div className="space-y-1">
              <span className="text-[11px] font-black uppercase tracking-wider text-slate-300 group-hover:text-white transition-colors block">
                Calibration Active (Meta-Learning)
              </span>
              <span className="text-[10px] text-slate-500 block leading-normal">
                Ajuste automatiquement l'ADN algorithmique à partir de
                l'analyse d'erreur de recalibration de Kalman (Rétroaction
                fermée).
              </span>
            </div>
          </label>

          {/* Identifier: Local Neuro-Vectoriel HPC (Rust / WASM) */}
          <div
            className="flex items-start gap-3 select-none"
            style={{ minHeight: "44px" }}
          >
            <div className="w-9 h-9 rounded-xl bg-fuchsia-500/10 border border-fuchsia-500/30 text-fuchsia-400 flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
              <Cpu size={18} className="text-fuchsia-400" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-black uppercase tracking-wider text-fuchsia-400 block">
                  Moteur Neuro-Vectoriel HPC
                </span>
                <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 text-[8px] font-black uppercase border border-emerald-500/30">
                  Rust / WASM Local
                </span>
              </div>
              <span className="text-[10px] text-slate-400 block leading-normal">
                Exécution déterministe 100% locale via le noyau Rust/WASM HPC et les 25 canaux stochastiques (zéro appel Cloud externe).
              </span>
            </div>
          </div>

          {/* Slider: Outsider Count */}
          <div className="space-y-2">
            <div className="flex justify-between items-center text-[11px] font-black uppercase tracking-wider text-slate-300">
              <span>Couverture d'Outsiders</span>
              <span className="text-indigo-400 font-black font-mono bg-indigo-500/10 px-2 py-0.5 rounded-md border border-indigo-500/20">
                {forcedOutsiderCount} Numéro
                {forcedOutsiderCount > 1 ? "s" : ""}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={4}
              value={forcedOutsiderCount}
              onChange={(e) => {
                onChangeForcedOutsiderCount(parseInt(e.target.value, 10));
              }}
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
              style={{ minHeight: "44px" }}
            />
            <span className="text-[10px] text-slate-500 block leading-normal">
              Injection de candidats marginaux d'écart topologique majeur
              pour élargir le spectre de réussite géométrique globale.
            </span>
          </div>
        </div>
      </div>

      {/* Trigger Button Row for Hybrid prediction */}
      <div className="flex justify-end">
        <button
          id="btn-run-ai-prediction"
          onClick={onRunAIPrediction}
          disabled={loading}
          className="w-full lg:w-auto px-8 py-4 bg-gradient-to-r from-fuchsia-600 to-indigo-600 hover:from-fuchsia-500 hover:to-indigo-500 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-3 transition-all duration-300 hover:scale-[1.02] shadow-xl shadow-fuchsia-500/10 border border-fuchsia-400/25 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {loading ? (
            <>
              <RefreshCw size={16} className="animate-spin" />
              <span>Optimisation des Poids HPC...</span>
            </>
          ) : (
            <>
              <Sparkles size={16} />
              <span>Lancer l'Inférence Neuro-Vectorielle</span>
            </>
          )}
        </button>
      </div>

      {/* Error Message */}
      {error && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-start gap-3">
          <AlertCircle
            className="text-rose-400 flex-shrink-0 mt-0.5"
            size={16}
          />
          <div className="space-y-1">
            <p className="text-xs font-bold text-rose-300">
              Échec du décodage quantique
            </p>
            <p className="text-[11px] text-rose-400/95 leading-relaxed">
              {error}
            </p>
          </div>
        </div>
      )}

      {/* Dashboard Display */}
      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex flex-col items-center justify-center py-20 bg-slate-950/20 rounded-[2rem] border border-slate-800/50"
          >
            <div className="relative mb-6">
              <div className="w-16 h-16 rounded-full border border-fuchsia-500/20 animate-ping absolute inset-0" />
              <div className="w-16 h-16 rounded-full border-t-2 border-r-2 border-fuchsia-500 animate-spin relative flex items-center justify-center">
                <BrainCircuit className="text-fuchsia-400" size={24} />
              </div>
            </div>
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-300">
              Alignement Spectral en cours...
            </h3>
            <p className="text-[10px] text-slate-500 mt-2 max-w-xs text-center leading-relaxed">
              L'IA structure la matrice de transition Markovienne et compile
              les lois géométriques déterministes.
            </p>
          </motion.div>
        ) : prediction ? (
          <motion.div
            key="prediction-results"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="grid grid-cols-1 lg:grid-cols-3 gap-6"
          >
            {/* Main Prediction & Metrics */}
            <div className="lg:col-span-2 space-y-6">
              {/* Suggested numbers card */}
              <div className="bg-slate-900/40 p-8 rounded-[2rem] border border-slate-800/80 shadow-xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />

                <div className="flex justify-between items-center mb-6">
                  <div className="space-y-1">
                    <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                      <Target size={12} className="text-indigo-400" />
                      Sélection Directe Prédictive
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Combinaisons à forte convergence thermodynamique
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <div className="flex items-center gap-2">
                      <Activity
                        size={12}
                        className="text-fuchsia-400 animate-pulse"
                      />
                      <span className="text-[9px] font-black uppercase tracking-wider text-slate-300">
                        Indice de Confiance
                      </span>
                      <span className="text-[12px] font-black text-white">
                        {prediction.confidence}%
                      </span>
                    </div>
                    <div className="w-32 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${prediction.confidence}%` }}
                        transition={{ duration: 1.5, ease: "easeOut" }}
                        className="h-full bg-gradient-to-r from-fuchsia-500 to-indigo-500"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-center gap-4 py-6">
                  {prediction.suggestedNumbers.map((num, idx) => (
                    <motion.div
                      key={`sugg-${num}`}
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{
                        delay: idx * 0.08,
                        type: "spring",
                        stiffness: 120,
                      }}
                      className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-gradient-to-b from-indigo-500/10 to-fuchsia-500/10 hover:from-indigo-500/20 hover:to-fuchsia-500/20 border-2 border-indigo-500/30 hover:border-fuchsia-500/50 flex flex-col items-center justify-center shadow-lg hover:shadow-indigo-500/5 hover:scale-105 transition-all cursor-pointer group"
                    >
                      <span className="text-xl md:text-2xl font-black text-white group-hover:text-fuchsia-300 transition-colors">
                        {String(num).padStart(2, "0")}
                      </span>
                      <span className="text-[8px] font-mono text-slate-500 uppercase tracking-tighter">
                        P-{idx + 1}
                      </span>
                    </motion.div>
                  ))}
                </div>

                <div className="flex flex-wrap items-center justify-center gap-3 pt-2 pb-6">
                  <button
                    onClick={() => onCopyTicket(prediction.suggestedNumbers)}
                    className="px-5 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 flex items-center justify-center gap-2 shadow-md hover:scale-[1.02] active:scale-95 cursor-pointer border border-slate-700"
                  >
                    {isCopiedInference ? (
                      <>
                        <Check size={14} className="text-emerald-400" />
                        <span className="text-emerald-400">Copié !</span>
                      </>
                    ) : (
                      <>
                        <Copy size={14} />
                        <span>Copier Ticket</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => onExportJSON(prediction)}
                    className="px-5 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 flex items-center justify-center gap-2 shadow-md hover:scale-[1.02] active:scale-95 cursor-pointer border border-slate-700"
                  >
                    <Download size={14} />
                    <span>Export JSON</span>
                  </button>

                  <button
                    onClick={() => onExportPDF(prediction)}
                    disabled={isExportingPDF}
                    className="px-5 py-3 bg-indigo-950/80 hover:bg-indigo-900 text-indigo-200 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 flex items-center justify-center gap-2 shadow-md hover:scale-[1.02] active:scale-95 cursor-pointer border border-indigo-700/60 disabled:opacity-50"
                  >
                    <FileText size={14} className="text-indigo-400" />
                    <span>{isExportingPDF ? "Génération PDF..." : "Exporter PDF"}</span>
                  </button>

                  <button
                    onClick={() => onSaveToForensicLog(prediction)}
                    className="px-6 py-3 bg-gradient-to-r from-fuchsia-600 to-indigo-600 hover:from-fuchsia-500 hover:to-indigo-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 flex items-center justify-center gap-2 shadow-lg hover:scale-[1.03] active:scale-95 cursor-pointer border border-fuchsia-400/20"
                  >
                    <ShieldCheck size={14} />
                    Enregistrer dans le Forensic Log
                  </button>
                </div>

                <div className="mt-6 pt-6 border-t border-slate-800/60 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="bg-slate-950/40 p-4 rounded-2xl border border-slate-800/40">
                      <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider block mb-1">
                        Équation Utilisée
                      </span>
                      <span className="text-[10px] font-mono font-bold text-indigo-400 leading-normal block">
                        {prediction.mathModelSummary}
                      </span>
                    </div>
                    <div className="bg-slate-950/40 p-4 rounded-2xl border border-slate-800/40">
                      <span className="text-[9px] font-black text-slate-500 uppercase tracking-wider block mb-1">
                        Régime Détecté
                      </span>
                      <span className="text-[10px] uppercase font-bold text-fuchsia-400 leading-normal block flex items-center gap-1.5">
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${hasGlobalRegime ? "bg-emerald-500" : "bg-slate-500"}`}
                        />
                        {globalRegimeLabel ?? "Régime non mesuré"}
                      </span>
                    </div>
                  </div>

                  {/* Bento Grid Layout for Continuous Cybernetic Metrics */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
                    <div className="bg-slate-950/50 p-4 rounded-2xl border border-slate-800/40 hover:border-slate-700/50 transition-colors">
                      <span className="text-[8.5px] font-black text-slate-500 uppercase tracking-wider block mb-1.5">
                        Alignement ADN Réel
                      </span>
                      <div className="flex items-baseline gap-1">
                        <span className="text-sm font-black text-emerald-400 font-mono">
                          {formatPercent(prediction.realityAlignment)}
                        </span>
                      </div>
                      <span className="text-[8px] text-slate-500 block leading-tight mt-1">
                        Fidélité de la signature matricielle historique.
                      </span>
                    </div>

                    <div className="bg-slate-950/50 p-4 rounded-2xl border border-slate-800/40 hover:border-slate-700/50 transition-colors">
                      <span className="text-[8.5px] font-black text-slate-500 uppercase tracking-wider block mb-1.5">
                        Stabilité Sélection
                      </span>
                      <div className="flex items-baseline gap-1">
                        <span className="text-sm font-black text-indigo-400 font-mono">
                          {formatPercent(prediction.stabilityScore)}
                        </span>
                      </div>
                      <span className="text-[8px] text-slate-500 block leading-tight mt-1">
                        Résistance de la convergence face aux perturbations.
                      </span>
                    </div>

                    <div className="bg-slate-950/50 p-4 rounded-2xl border border-slate-800/40 hover:border-slate-700/50 transition-colors">
                      <span className="text-[8.5px] font-black text-slate-500 uppercase tracking-wider block mb-1.5">
                        Diversité Génétique
                      </span>
                      <div className="flex items-baseline gap-1">
                        <span className="text-sm font-black text-fuchsia-400 font-mono">
                          {(prediction.diversityScore !== undefined
                            ? prediction.diversityScore
                            : 1.25
                          ).toFixed(2)}
                        </span>
                      </div>
                      <span className="text-[8px] text-slate-500 block leading-tight mt-1">
                        Dispersion spectrale d'énergie des candidats.
                      </span>
                    </div>
                  </div>

                  {/* Dynamic Hyper-parameter Calibration Panel */}
                  {prediction.hyperparameters && (
                    <div className="bg-slate-950/45 p-6 rounded-2xl border border-slate-800/60 mt-4 relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none" />

                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-4 pb-4 border-b border-slate-800/45">
                        <div>
                          <h4 className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-2">
                            <Sliders
                              size={14}
                              className="text-emerald-400 animate-pulse"
                            />
                            Auto-Calibration des Hyper-paramètres Réseaux
                          </h4>
                          <p className="text-[10px] text-slate-500">
                            Ajustement continu des paramètres internes pour
                            maximiser la convergence locale
                          </p>
                        </div>
                        {prediction.hyperAccuracyGain !== undefined &&
                          prediction.hyperAccuracyGain > 0 && (
                            <span className="px-2.5 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-lg text-[10px] font-black uppercase tracking-wider">
                              Gain d'Alignement : +
                              {prediction.hyperAccuracyGain.toFixed(2)}{" "}
                              rangs
                            </span>
                          )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1.5 p-3 bg-slate-900/30 rounded-xl border border-slate-800/40">
                          <div className="flex justify-between text-[10px] font-bold">
                            <span className="text-slate-400">
                              Taux d'Excitation Hawkes
                            </span>
                            <span className="text-emerald-400 font-mono">
                              {prediction.hyperparameters.hawkesDecay.toFixed(2)}
                            </span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-850 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-emerald-500 rounded-full"
                              style={{
                                width: `${(prediction.hyperparameters.hawkesDecay / 0.5) * 100}%`,
                              }}
                            />
                          </div>
                          <span className="text-[8px] text-slate-500 block leading-tight">
                            Sensibilité temporelle des tirages consécutifs
                            (processus d'auto-excitation).
                          </span>
                        </div>

                        <div className="space-y-1.5 p-3 bg-slate-900/30 rounded-xl border border-slate-800/40">
                          <div className="flex justify-between text-[10px] font-bold">
                            <span className="text-slate-400">
                              Lissage Spatial (Grid Sigma)
                            </span>
                            <span className="text-indigo-400 font-mono">
                              {prediction.hyperparameters.spatialSigma.toFixed(1)}{" "}
                              cells
                            </span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-850 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-indigo-500 rounded-full"
                              style={{
                                width: `${(prediction.hyperparameters.spatialSigma / 3.0) * 100}%`,
                              }}
                            />
                          </div>
                          <span className="text-[8px] text-slate-500 block leading-tight">
                            Étalement géométrique des probabilités sur la
                            grille de tirage.
                          </span>
                        </div>

                        <div className="space-y-1.5 p-3 bg-slate-900/30 rounded-xl border border-slate-800/40">
                          <div className="flex justify-between text-[10px] font-bold">
                            <span className="text-slate-400">
                              Poids Vélocité des Écarts
                            </span>
                            <span className="text-fuchsia-400 font-mono">
                              {prediction.hyperparameters.gapVelocityWeight.toFixed(2)}x
                            </span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-850 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-fuchsia-500 rounded-full"
                              style={{
                                width: `${(prediction.hyperparameters.gapVelocityWeight / 2.0) * 100}%`,
                              }}
                            />
                          </div>
                          <span className="text-[8px] text-slate-500 block leading-tight">
                            Modulation continue basée sur l'accélération
                            d'apparition des numéros.
                          </span>
                        </div>

                        <div className="space-y-1.5 p-3 bg-slate-900/30 rounded-xl border border-slate-800/40">
                          <div className="flex justify-between text-[10px] font-bold">
                            <span className="text-slate-400">
                              Taux d'Apprentissage Micro-SGD (η)
                            </span>
                            <span className="text-teal-400 font-mono">
                              {prediction.hyperparameters.sgdLearningRate.toFixed(4)}
                            </span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-850 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-teal-500 rounded-full"
                              style={{
                                width: `${(prediction.hyperparameters.sgdLearningRate / 0.05) * 100}%`,
                              }}
                            />
                          </div>
                          <span className="text-[8px] text-slate-500 block leading-tight">
                            Vitesse d'ajustement du gradient sur
                            l'historique rétroactif immédiat.
                          </span>
                        </div>
                      </div>

                      {prediction.hyperTuningLog &&
                        prediction.hyperTuningLog.length > 0 && (
                          <details className="mt-4 pt-4 border-t border-slate-800/40">
                            <summary className="text-[9px] font-black text-slate-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors">
                              Afficher le Journal de Descente de Coordonnées
                            </summary>
                            <div className="mt-2 bg-slate-950 p-3 rounded-lg border border-slate-900 max-h-32 overflow-y-auto font-mono text-[8px] text-slate-500 leading-normal space-y-1 custom-scrollbar">
                              {prediction.hyperTuningLog.map((logLine, lIdx) => (
                                <div
                                  key={lIdx}
                                  className="whitespace-pre-wrap text-slate-400"
                                >
                                  {logLine}
                                </div>
                              ))}
                            </div>
                          </details>
                        )}
                    </div>
                  )}

                  {/* Block Warnings & Filter details */}
                  {prediction.adversarialApplied &&
                    prediction.challengedNumbers &&
                    prediction.challengedNumbers.length > 0 && (
                      <div className="bg-amber-500/5 border border-amber-500/25 p-4.5 rounded-2xl space-y-2 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-xl pointer-events-none" />
                        <div className="flex items-center gap-2 text-amber-400 font-black text-[10px] uppercase tracking-wider">
                          <AlertCircle
                            size={14}
                            className="animate-pulse text-amber-400 shrink-0"
                          />
                          <span>
                            Protocole Adversaire Actif (Anti-Consensus)
                          </span>
                        </div>
                        <p className="text-[10.5px] text-slate-400 leading-relaxed">
                          Les candidats suivants présentaient un excès
                          d'inertie collective statique susceptible de
                          perturber la prédiction. Le système d'adaptation
                          stochastique a modéré leur poids pour préserver
                          l'équilibre d'entropie :
                        </p>
                        <div className="flex flex-wrap gap-2 pt-1">
                          {prediction.challengedNumbers.map((num) => (
                            <span
                              key={num}
                              className="px-2.5 py-1 bg-amber-500/10 text-amber-300 rounded-lg text-xs font-mono font-black border border-amber-500/20 shadow-inner"
                            >
                              {String(num).padStart(2, "0")}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                  {prediction.adversarialRisks &&
                    prediction.adversarialRisks.length > 0 && (
                      <div className="bg-rose-500/5 border border-rose-500/25 p-4.5 rounded-2xl space-y-1.5">
                        <div className="text-rose-400 font-black text-[10px] uppercase tracking-wider">
                          Garde-fous Médico-Légaux (Risques Détectés)
                        </div>
                        <ul className="list-disc list-inside text-[9.5px] text-slate-400 leading-normal space-y-1">
                          {prediction.adversarialRisks.map((risk, idx) => (
                            <li key={idx} className="text-rose-350/90">
                              {risk}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                </div>
              </div>

              {/* AI Weights & Rationale Bento Panel */}
              {prediction.aiWeights && (
                <div className="bg-gradient-to-br from-slate-900/60 to-indigo-950/20 p-8 rounded-[2rem] border border-slate-800/80 shadow-2xl space-y-6 relative overflow-hidden">
                  <div className="absolute top-0 right-0 h-48 w-48 rounded-full bg-fuchsia-500/5 blur-[80px] pointer-events-none" />

                  <div className="flex justify-between items-center pb-4 border-b border-slate-800/60">
                    <div className="space-y-1">
                      <h3 className="text-[10px] font-black uppercase tracking-widest text-fuchsia-400 flex items-center gap-2">
                        <BrainCircuit size={14} />
                        Pondération Hybride de l'Oracle
                      </h3>
                      <p className="text-[11px] text-slate-500">
                        Configuration des {ACTIVE_ALGO_COUNT} canaux algorithmiques actifs calibrée par le moteur hybride Rust/WASM local
                      </p>
                    </div>
                    <span className="px-3 py-1 text-[9px] font-black uppercase tracking-wider rounded-full border bg-blue-500/10 text-blue-400 border-blue-500/20">
                      Moteur HPC Local
                    </span>
                  </div>

                  <div className="p-5 bg-slate-950/40 rounded-2xl border border-slate-800/60 space-y-2">
                    <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-300">
                      Raisonnement stratégique du moteur local :
                    </h4>
                    <p className="text-[11px] text-slate-400 leading-relaxed font-normal whitespace-pre-line">
                      {prediction.aiRationale}
                    </p>
                  </div>

                  {prediction.aiStrategicAdvice && (
                    <div className="p-4.5 bg-emerald-500/5 border border-emerald-500/15 rounded-2xl flex items-start gap-3">
                      <Award
                        size={16}
                        className="text-emerald-400 flex-shrink-0 mt-0.5"
                      />
                      <div className="space-y-0.5">
                        <h5 className="text-[9.5px] font-black uppercase tracking-wider text-emerald-400">
                          Conseil Tactique de Jeu
                        </h5>
                        <p className="text-[11px] text-slate-300 leading-relaxed font-normal">
                          {prediction.aiStrategicAdvice}
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="space-y-3 pt-2">
                    <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                      Matrice de Pondération Algorithmique Calibrée (DNA) :
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {Object.entries(prediction.aiWeights).map(([algoName, val]) => {
                        const baseline = 1.0;
                        const ratio = val / baseline;
                        const isBoosted = ratio > 1.08;
                        const isModerated = ratio < 0.92;

                        let badgeColor = "text-slate-500 bg-slate-500/5 border-slate-500/10";
                        let badgeText = "Stable";
                        if (isBoosted) {
                          badgeColor = "text-emerald-400 bg-emerald-500/5 border-emerald-500/15";
                          badgeText = `+${((ratio - 1) * 100).toFixed(0)}% Boost`;
                        } else if (isModerated) {
                          badgeColor = "text-indigo-400 bg-indigo-500/5 border-indigo-500/15";
                          badgeText = `-${((1 - ratio) * 100).toFixed(0)}% Atténué`;
                        }

                        return (
                          <div
                            key={algoName}
                            className="p-3 bg-slate-950/30 rounded-xl border border-slate-900 flex flex-col justify-between space-y-1.5 hover:border-slate-800 transition-colors"
                          >
                            <div className="flex justify-between items-center">
                              <span
                                className="text-[10.5px] font-black text-slate-300 font-mono capitalize truncate max-w-[120px]"
                                title={algoName}
                              >
                                {algoName.replace("_", " ")}
                              </span>
                              <span
                                className={`px-2 py-0.5 text-[8px] font-mono font-black uppercase tracking-tighter rounded border ${badgeColor}`}
                              >
                                {badgeText}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1.5 bg-slate-900 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${isBoosted ? "bg-emerald-500" : isModerated ? "bg-indigo-500" : "bg-slate-500"}`}
                                  style={{
                                    width: `${Math.min(100, (val / 3.0) * 100)}%`,
                                  }}
                                />
                              </div>
                              <span className="text-[10px] font-mono font-black text-slate-400 min-w-[24px] text-right">
                                {val.toFixed(2)}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Markdown Analysis content */}
              <div className="bg-slate-900/30 p-8 rounded-[2rem] border border-slate-800/80 shadow-xl space-y-4">
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-300 flex items-center gap-2">
                  <Activity size={14} className="text-fuchsia-400" />
                  Rapport de Convergence Analytique
                </h3>
                <div className="text-xs text-slate-400 space-y-3 leading-relaxed font-normal whitespace-pre-line prose prose-invert max-w-none">
                  {prediction.analysis}
                </div>
              </div>

              {/* XAP Floor for IA */}
              {prediction.xapExp && prediction.xapExp.length > 0 && (
                <div className="bg-slate-900/40 p-8 rounded-[2rem] border border-slate-800/80 shadow-xl mt-6 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-[40px] pointer-events-none" />
                  <h3 className="text-xs font-black uppercase tracking-widest text-slate-300 flex items-center gap-2 mb-6">
                    <Network size={14} className="text-indigo-400" />
                    Attribution Stochastique Détaillée (XAP)
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    {prediction.xapExp.map((xap) => (
                      <div
                        key={xap.number}
                        className="bg-slate-950/80 rounded-2xl p-4 border border-slate-800/50 flex flex-col items-center justify-between text-center min-h-[140px] relative z-10 cursor-help group transition-all hover:border-fuchsia-500/30"
                        title={`Algorithmes en synergie: ${xap.synergyAlgos?.join(", ") || "Aucun"}\nGini (Concentration): ${xap.compositionGini?.toFixed(2) || "0.00"}\nEntropie: ${xap.compositionEntropy?.toFixed(2) || "1.00"}`}
                      >
                        <div className="w-10 h-10 rounded-full bg-slate-900/80 flex items-center justify-center text-slate-300 font-black text-lg mb-3 shadow-inner border border-white/5">
                          {xap.number}
                        </div>
                        <span className="text-[9px] uppercase font-bold text-fuchsia-400 mb-2 leading-tight line-clamp-1">
                          {xap.dominantAlgo}
                        </span>
                        <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden mb-1">
                          <div
                            className="bg-gradient-to-r from-fuchsia-500 to-indigo-500 h-full rounded-full transition-all duration-1000"
                            style={{
                              width: `${xap.contributionPercentage}%`,
                            }}
                          />
                        </div>
                        <span className="text-[8px] font-mono font-bold text-slate-500 mb-1">
                          {xap.contributionPercentage.toFixed(1)}% force
                        </span>

                        {xap.compositionGini !== undefined && (
                          <div className="text-[8px] font-mono text-fuchsia-400 mt-1 opacity-80">
                            Gini: {xap.compositionGini.toFixed(2)}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Side column: Expanded candidates */}
            <div className="space-y-6">
              <div className="bg-slate-900/40 p-6 rounded-[2rem] border border-slate-800/80 shadow-xl relative overflow-hidden h-full">
                <div className="absolute top-0 right-0 w-32 h-32 bg-fuchsia-500/5 rounded-full blur-2xl pointer-events-none" />
                <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1.5 mb-2">
                  <Target size={12} className="text-fuchsia-400" />
                  Vecteurs de Rupture Marginale
                </h3>
                <p className="text-[11px] text-slate-500 mb-6">
                  Candidats résiduels exploitant le delta d'entropie locale
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-2 gap-3">
                  {prediction.candidates.map((num, idx) => {
                    const isEven = num % 2 === 0;
                    return (
                      <div
                        key={`cand-${num}`}
                        className="bg-slate-950/60 p-3 rounded-xl border border-slate-800/80 hover:border-slate-700 hover:bg-slate-950 transition-all flex items-center justify-between"
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-7 h-7 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-lg text-xs font-black flex items-center justify-center">
                            {num}
                          </span>
                          <span className="text-[9px] font-mono text-slate-500">
                            {isEven ? "Pair" : "Impair"}
                          </span>
                        </div>
                        <span className="text-[8px] font-black text-slate-600">
                          C-{idx + 1}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-8 p-4 bg-fuchsia-500/5 border border-fuchsia-500/10 rounded-2xl flex items-start gap-3">
                  <CheckCircle2
                    size={16}
                    className="text-fuchsia-400 flex-shrink-0 mt-0.5"
                  />
                  <p className="text-[10px] text-fuchsia-300/90 leading-relaxed">
                    <strong>Intégration Modulaire</strong> : Intégrez ces
                    candidats de gisement pour composer des formulaires de
                    couverture s'appuyant sur l'analyse de régularisation
                    continue.
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="prediction-idle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-24 bg-slate-950/30 rounded-[2rem] border border-dashed border-slate-850 text-center p-6"
          >
            <div className="p-4 bg-indigo-500/5 rounded-full border border-indigo-500/10 mb-4 animate-bounce">
              <BrainCircuit
                size={32}
                className="text-slate-600 dark:text-slate-400"
              />
            </div>
            <h4 className="text-sm font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">
              Inférence Stochastique Suspendue
            </h4>
            <p className="text-xs text-slate-500 max-w-sm mt-2 leading-relaxed font-medium">
              Cliquez sur le bouton ci-dessus pour déclencher l'analyse
              harmonique du jeu de données, évaluer l'asymétrie matricielle,
              et extraire l'onde de continuité sous-jacente.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
