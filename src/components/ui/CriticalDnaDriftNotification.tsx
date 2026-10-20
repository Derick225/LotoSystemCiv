import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useDnaAuditMonitor } from "../../hooks/useDnaAuditMonitor";
import {
  AlertTriangle,
  Zap,
  ArrowRightLeft,
  X,
  ChevronDown,
  ChevronUp,
  ShieldAlert,
  Fingerprint,
  Layers,
  Sparkles,
  Sliders,
  ExternalLink,
} from "lucide-react";

export const CriticalDnaDriftNotification: React.FC = () => {
  const {
    drawName,
    isCriticalDrift,
    isHarmonizing,
    criticalThreshold,
    maxDriftDelta,
    criticalAlgorithms,
    driftSeverityScore,
    harmonizeDna,
    inspectDnaAuditor,
    inspectDriftHeatmap,
    dismissNotification,
  } = useDnaAuditMonitor();

  const [showDetails, setShowDetails] = useState<boolean>(false);

  if (!isCriticalDrift || !drawName) return null;

  return (
    <AnimatePresence>
      <motion.div
        id="critical-dna-drift-notification"
        initial={{ opacity: 0, y: -24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -24, scale: 0.96 }}
        transition={{ duration: 0.28, ease: "easeOut" }}
        className="fixed top-4 left-4 right-4 md:left-24 md:right-8 lg:left-32 lg:right-12 z-[150] max-w-5xl mx-auto"
      >
        <div className="bg-slate-950/95 backdrop-blur-2xl border-2 border-rose-500/60 rounded-3xl p-4 md:p-6 shadow-[0_12px_40px_rgba(225,29,72,0.35)] relative overflow-hidden ring-1 ring-white/10">
          {/* Lueur d'ambiance d'arrière-plan */}
          <div className="absolute -right-16 -top-16 w-60 h-60 bg-rose-500/20 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -left-16 -bottom-16 w-60 h-60 bg-amber-500/20 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 flex flex-col gap-4">
            {/* Ligne Supérieure : Badges & Bouton Fermer */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-3 py-1 bg-rose-500/30 border border-rose-500 text-rose-300 text-[10px] font-black uppercase tracking-widest rounded-full flex items-center gap-1.5 shadow-sm shadow-rose-500/50 animate-pulse">
                  <ShieldAlert size={12} className="text-rose-400" />
                  Notification Système Prioritaire
                </span>

                <span className="px-3 py-1 bg-white/10 border border-white/20 text-slate-200 text-[10px] font-mono uppercase tracking-widest rounded-full flex items-center gap-1.5">
                  <Fingerprint size={12} className="text-indigo-400" />
                  {drawName}
                </span>

                <span className="px-2.5 py-0.5 bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[10px] font-mono font-bold rounded-lg">
                  Sévérité : {driftSeverityScore}%
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  id="toggle-dna-drift-details-btn"
                  onClick={() => setShowDetails(!showDetails)}
                  className="px-2.5 py-1 text-[11px] font-bold text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700 rounded-lg flex items-center gap-1 transition-all border border-white/5"
                >
                  {showDetails ? "Masquer" : "Détails"}
                  {showDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>

                <button
                  id="dismiss-dna-drift-btn"
                  onClick={dismissNotification}
                  className="p-1.5 text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-700 rounded-lg transition-colors border border-white/5"
                  title="Fermer l'alerte"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Corps du Message Principal */}
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-5">
              <div className="space-y-1.5 max-w-3xl">
                <h4 className="text-base md:text-lg font-black text-white uppercase tracking-tight flex items-center gap-2">
                  <AlertTriangle size={18} className="text-amber-400 shrink-0" />
                  Dérive Critique des Poids Algorithmiques
                </h4>

                <p className="text-xs md:text-sm text-slate-300 leading-relaxed">
                  L'écart de pondération avec la signature canonique du tirage{" "}
                  <span className="font-bold text-white">({drawName})</span> a dépassé le
                  seuil d'acceptabilité statistique (
                  <span className="text-rose-400 font-mono font-bold">
                    Δ max = +{(maxDriftDelta * 100).toFixed(1)}%
                  </span>{" "}
                  vs seuil critique{" "}
                  <span className="text-amber-400 font-mono font-bold">
                    τ = {(criticalThreshold * 100).toFixed(1)}%
                  </span>
                  ). Une distorsion d'assignation des probabilités de tirage est en cours.
                </p>

                {/* Badges des algorithmes en dérive critique */}
                <div className="flex items-center gap-1.5 flex-wrap pt-1">
                  <span className="text-[10px] uppercase font-mono tracking-widest text-slate-400">
                    Algorithmes affectés ({criticalAlgorithms.length}) :
                  </span>
                  {criticalAlgorithms.slice(0, 5).map((algo, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-0.5 bg-rose-950/60 border border-rose-500/40 text-rose-200 text-[10px] font-mono rounded-md"
                    >
                      {algo.label} (+{(algo.weightDriftDelta * 100).toFixed(1)}%)
                    </span>
                  ))}
                  {criticalAlgorithms.length > 5 && (
                    <span className="text-[10px] text-slate-400 font-mono">
                      +{criticalAlgorithms.length - 5} autres
                    </span>
                  )}
                </div>
              </div>

              {/* Boutons d'Action Principaux */}
              <div className="flex flex-row sm:flex-row items-center gap-2.5 w-full lg:w-auto shrink-0">
                <button
                  id="harmonize-dna-now-btn"
                  onClick={harmonizeDna}
                  disabled={isHarmonizing}
                  className="flex-1 sm:flex-none px-5 py-3 bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white rounded-2xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-xl shadow-rose-600/30 ring-2 ring-rose-400/40 transition-all active:scale-95 disabled:opacity-50"
                >
                  <ArrowRightLeft
                    size={16}
                    className={isHarmonizing ? "animate-spin" : ""}
                  />
                  {isHarmonizing
                    ? "Ré-harmonisation..."
                    : "Ré-harmoniser l'ADN Immédiatement"}
                </button>

                <button
                  id="inspect-dna-auditor-btn"
                  onClick={inspectDnaAuditor}
                  className="px-3.5 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-2xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all border border-white/10"
                  title="Inspecter dans l'Audit ADN"
                >
                  <ExternalLink size={14} />
                  Audit ADN
                </button>

                <button
                  id="inspect-drift-heatmap-btn"
                  onClick={inspectDriftHeatmap}
                  className="px-3.5 py-3 bg-rose-950/80 hover:bg-rose-900 text-rose-200 rounded-2xl text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all border border-rose-500/40 shadow-sm"
                  title="Voir la Heatmap des Corrélations Écarts & Sous-Algorithmes"
                >
                  <Sparkles size={14} className="text-amber-400" />
                  Heatmap
                </button>
              </div>
            </div>

            {/* Barre de Progression de Sévérité */}
            <div className="space-y-1 pt-1">
              <div className="flex justify-between items-center text-[10px] font-mono text-slate-400">
                <span>Tolérance Canonique (0%)</span>
                <span className="text-amber-400 font-bold">
                  Seuil Critique [{(criticalThreshold * 100).toFixed(1)}%]
                </span>
                <span className="text-rose-400 font-bold">Rupture (100%)</span>
              </div>
              <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden border border-white/5">
                <div
                  className="h-full bg-gradient-to-r from-amber-500 via-rose-500 to-rose-600 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.max(10, driftSeverityScore))}%` }}
                />
              </div>
            </div>

            {/* Vue Détaillée Dépliable */}
            {showDetails && (
              <div className="mt-2 pt-3 border-t border-white/10 space-y-3 animate-fade-in text-xs">
                <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Layers size={12} className="text-rose-400" />
                  Détail Mathématique des Dérives par Algorithme
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 max-h-48 overflow-y-auto pr-1">
                  {criticalAlgorithms.map((algo, idx) => (
                    <div
                      key={idx}
                      className="bg-slate-900/80 p-3 rounded-2xl border border-rose-500/30 flex flex-col justify-between space-y-1.5"
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-white text-xs">{algo.label}</span>
                        <span className="px-2 py-0.5 bg-rose-500/20 text-rose-300 font-mono font-bold text-[10px] rounded-full">
                          +{(algo.weightDriftDelta * 100).toFixed(2)}%
                        </span>
                      </div>
                      <div className="flex justify-between text-[10px] text-slate-400 font-mono">
                        <span>Poids Actif : {algo.activeWeight.toFixed(4)}</span>
                        <span className="text-indigo-300">
                          Canonique : {algo.canonicalWeight.toFixed(4)}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 truncate">
                        {algo.mathematicalBasis}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
