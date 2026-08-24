import React, { useState, useEffect, useCallback } from "react";
import { 
  Database, 
  Trash2, 
  Zap, 
  CheckCircle2, 
  AlertTriangle, 
  Layers, 
  X, 
  RefreshCw, 
  HardDrive, 
  ShieldCheck,
  FileCheck
} from "lucide-react";
import { 
  auditStorageConsistency, 
  purgeExploratorySimulations, 
  purgeOrphanSnapshots, 
  compressForensicStorage, 
  executeComprehensiveStorageOptimization 
} from "../services/storageOptimizationService";
import { StorageAuditReport, StorageOptimizationResult } from "../types";
import { useToast } from "./ui/Toast";
import { audioEngine } from "../utils/audioEngine";

interface StorageOptimizationModalProps {
  drawName: string;
  isOpen: boolean;
  onClose: () => void;
  onDataChanged?: () => void;
}

export const StorageOptimizationModal: React.FC<StorageOptimizationModalProps> = ({
  drawName,
  isOpen,
  onClose,
  onDataChanged,
}) => {
  const { showToast } = useToast();
  const [audit, setAudit] = useState<StorageAuditReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<StorageOptimizationResult | null>(null);

  const loadAudit = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await auditStorageConsistency(drawName);
      setAudit(res);
    } catch (err) {
      console.error("Storage audit error:", err);
      showToast("Erreur lors de l'audit de cohérence", "error");
    } finally {
      setIsLoading(false);
    }
  }, [drawName, showToast]);

  useEffect(() => {
    if (isOpen) {
      loadAudit();
      setLastResult(null);
    }
  }, [isOpen, loadAudit]);

  if (!isOpen) return null;

  const handlePurgeSimulations = async () => {
    if (!audit || audit.exploratorySimulationsCount === 0) {
      showToast("Aucune simulation exploratoire à purger.", "info");
      return;
    }

    if (
      !window.confirm(
        `Purger ${audit.exploratorySimulationsCount} simulation(s) exploratoire(s) ?\n` +
        `Vos prédictions réelles enregistrées seront 100% conservées.`
      )
    ) {
      return;
    }

    try {
      setIsProcessing(true);
      setActiveAction("simulations");
      audioEngine.play("click");
      const res = await purgeExploratorySimulations(drawName, audit.exploratorySimulationIds);
      showToast(`${res.purgedCount} simulation(s) purgée(s) avec succès (~${res.freedBytesKb} Ko libérés).`, "success");
      audioEngine.play("success");
      await loadAudit();
      if (onDataChanged) onDataChanged();
    } catch (err) {
      console.error("Error purging simulations:", err);
      showToast("Erreur lors de la purge des simulations", "error");
    } finally {
      setIsProcessing(false);
      setActiveAction(null);
    }
  };

  const handleCompressReports = async () => {
    try {
      setIsProcessing(true);
      setActiveAction("compress");
      audioEngine.play("click");
      const res = await compressForensicStorage(drawName);
      showToast(`${res.compressedCount} rapport(s) d'autopsie compressé(s) en index différentiel (~${res.savedBytesKb} Ko optimisés).`, "success");
      audioEngine.play("success");
      await loadAudit();
      if (onDataChanged) onDataChanged();
    } catch (err) {
      console.error("Error compressing reports:", err);
      showToast("Erreur lors de la compression différentielle", "error");
    } finally {
      setIsProcessing(false);
      setActiveAction(null);
    }
  };

  const handlePurgeOrphans = async () => {
    try {
      setIsProcessing(true);
      setActiveAction("orphans");
      audioEngine.play("click");
      const res = await purgeOrphanSnapshots();
      showToast(`${res.purgedCount} instantané(s) orphelin(s) nettoyé(s).`, "success");
      audioEngine.play("success");
      await loadAudit();
      if (onDataChanged) onDataChanged();
    } catch (err) {
      console.error("Error purging orphans:", err);
      showToast("Erreur lors du nettoyage des orphelins", "error");
    } finally {
      setIsProcessing(false);
      setActiveAction(null);
    }
  };

  const handleCompleteOptimization = async () => {
    try {
      setIsProcessing(true);
      setActiveAction("all");
      audioEngine.play("click");
      const res = await executeComprehensiveStorageOptimization(drawName);
      setLastResult(res);
      showToast(`Optimisation terminée : ${res.bytesFreedKb} Ko libérés/optimisés !`, "success");
      audioEngine.play("success");
      await loadAudit();
      if (onDataChanged) onDataChanged();
    } catch (err) {
      console.error("Error running optimization:", err);
      showToast("Erreur lors de l'optimisation complète", "error");
    } finally {
      setIsProcessing(false);
      setActiveAction(null);
    }
  };

  const getHealthBadge = (health?: string) => {
    switch (health) {
      case "OPTIMAL":
        return (
          <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-black uppercase flex items-center gap-1.5">
            <CheckCircle2 size={12} /> Stockage Optimal
          </span>
        );
      case "MODERATE":
        return (
          <span className="px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs font-black uppercase flex items-center gap-1.5">
            <AlertTriangle size={12} /> Optimisation Conseillée
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20 text-xs font-black uppercase flex items-center gap-1.5">
            <AlertTriangle size={12} /> Purge Requise
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in font-sans">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-6 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-500/10 text-indigo-400 rounded-2xl border border-indigo-500/20">
              <Database size={20} />
            </div>
            <div>
              <h2 className="text-base font-black text-white tracking-wide uppercase">
                Audit de Cohérence & Compression IndexedDB
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Isolation stricte pour <span className="text-indigo-400 font-bold">{drawName}</span> • Zero Magic Numbers
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6 custom-scrollbar">
          {isLoading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-3 text-slate-400">
              <RefreshCw className="animate-spin text-indigo-400" size={28} />
              <span className="text-xs uppercase tracking-wider font-bold">Audit des tenseurs locaux en cours...</span>
            </div>
          ) : audit ? (
            <>
              {/* Health and Overview */}
              <div className="bg-slate-950/80 p-5 rounded-2xl border border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Diagnostic Global</span>
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-black text-white font-mono">
                      {audit.estimatedTotalSizeKb} Ko
                    </span>
                    <span className="text-xs text-slate-400">occupés en base locale</span>
                  </div>
                </div>
                <div>{getHealthBadge(audit.storageHealthScore)}</div>
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-4 bg-slate-950/50 rounded-xl border border-slate-800">
                  <div className="flex items-center gap-1.5 text-slate-400 text-[10px] font-black uppercase">
                    <ShieldCheck size={12} className="text-emerald-400" />
                    <span>Prédictions Réelles</span>
                  </div>
                  <div className="text-xl font-black font-mono text-emerald-400 mt-1">
                    {audit.realPredictionsCount}
                  </div>
                  <span className="text-[9px] text-slate-500">Protégées</span>
                </div>

                <div className="p-4 bg-slate-950/50 rounded-xl border border-slate-800">
                  <div className="flex items-center gap-1.5 text-slate-400 text-[10px] font-black uppercase">
                    <Layers size={12} className="text-amber-400" />
                    <span>Simulations</span>
                  </div>
                  <div className="text-xl font-black font-mono text-amber-400 mt-1">
                    {audit.exploratorySimulationsCount}
                  </div>
                  <span className="text-[9px] text-slate-500">Purger si besoin</span>
                </div>

                <div className="p-4 bg-slate-950/50 rounded-xl border border-slate-800">
                  <div className="flex items-center gap-1.5 text-slate-400 text-[10px] font-black uppercase">
                    <FileCheck size={12} className="text-cyan-400" />
                    <span>Rapports Autopsie</span>
                  </div>
                  <div className="text-xl font-black font-mono text-cyan-400 mt-1">
                    {audit.totalForensicReportsCount}
                  </div>
                  <span className="text-[9px] text-slate-500">{audit.compressedReportsCount} condensés</span>
                </div>

                <div className="p-4 bg-slate-950/50 rounded-xl border border-slate-800">
                  <div className="flex items-center gap-1.5 text-slate-400 text-[10px] font-black uppercase">
                    <HardDrive size={12} className="text-indigo-400" />
                    <span>Espace Récupérable</span>
                  </div>
                  <div className="text-xl font-black font-mono text-indigo-400 mt-1">
                    {audit.estimatedReclaimableKb} Ko
                  </div>
                  <span className="text-[9px] text-slate-500">Optimisable</span>
                </div>
              </div>

              {/* Action Cards */}
              <div className="space-y-3">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                  Actions d'Optimisation Ciblées
                </span>

                {/* 1. Purge des simulations exploratoires */}
                <div className="p-4 bg-slate-950/60 rounded-2xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1 max-w-md">
                    <div className="flex items-center gap-2">
                      <Trash2 size={14} className="text-amber-400" />
                      <h4 className="text-xs font-bold text-white uppercase">Purger les simulations exploratoires</h4>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Supprime les scénarios What-If et simulations de test sans impacter vos prédictions réelles enregistrées.
                    </p>
                  </div>
                  <button
                    onClick={handlePurgeSimulations}
                    disabled={isProcessing || audit.exploratorySimulationsCount === 0}
                    className="px-4 py-2 bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/30 rounded-xl text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap cursor-pointer flex items-center justify-center gap-2"
                  >
                    {activeAction === "simulations" ? (
                      <RefreshCw size={12} className="animate-spin" />
                    ) : (
                      <Trash2 size={12} />
                    )}
                    <span>Purger ({audit.exploratorySimulationsCount})</span>
                  </button>
                </div>

                {/* 2. Compression Différentielle de l'IndexedDB */}
                <div className="p-4 bg-slate-950/60 rounded-2xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1 max-w-md">
                    <div className="flex items-center gap-2">
                      <Layers size={14} className="text-indigo-400" />
                      <h4 className="text-xs font-bold text-white uppercase">Compression Différentielle IndexedDB</h4>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Archive les métriques condensées (UFI, hits, RMSE) dans un index rapide et charge les tenseurs lourds à la demande.
                    </p>
                  </div>
                  <button
                    onClick={handleCompressReports}
                    disabled={isProcessing || audit.totalForensicReportsCount === 0}
                    className="px-4 py-2 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 rounded-xl text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap cursor-pointer flex items-center justify-center gap-2"
                  >
                    {activeAction === "compress" ? (
                      <RefreshCw size={12} className="animate-spin" />
                    ) : (
                      <Zap size={12} />
                    )}
                    <span>Compresser ({audit.totalForensicReportsCount})</span>
                  </button>
                </div>

                {/* 3. Nettoyage des orphelins */}
                {audit.orphanSnapshotsCount > 0 && (
                  <div className="p-4 bg-slate-950/60 rounded-2xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1 max-w-md">
                      <div className="flex items-center gap-2">
                        <Trash2 size={14} className="text-rose-400" />
                        <h4 className="text-xs font-bold text-white uppercase">Nettoyer les instantanés orphelins</h4>
                      </div>
                      <p className="text-[11px] text-slate-400 leading-relaxed">
                        Supprime les snapshots de calcul orphelins dont la prédiction parente a déjà été supprimée.
                      </p>
                    </div>
                    <button
                      onClick={handlePurgeOrphans}
                      disabled={isProcessing}
                      className="px-4 py-2 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 rounded-xl text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap cursor-pointer flex items-center justify-center gap-2"
                    >
                      {activeAction === "orphans" ? (
                        <RefreshCw size={12} className="animate-spin" />
                      ) : (
                        <Trash2 size={12} />
                      )}
                      <span>Nettoyer ({audit.orphanSnapshotsCount})</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Optimization Result Banner */}
              {lastResult && (
                <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-emerald-300 text-xs space-y-1">
                  <div className="font-bold flex items-center gap-1.5">
                    <CheckCircle2 size={14} /> Pipeline d'optimisation exécuté avec succès
                  </div>
                  <div className="text-[11px] text-emerald-400/90 font-mono">
                    • Simulations purgées : {lastResult.purgedSimulationsCount} | Instantanés nettoyés : {lastResult.purgedSnapshotsCount} | Rapports compressés : {lastResult.compressedReportsCount}
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>

        {/* Footer */}
        <div className="p-5 bg-slate-950 border-t border-slate-800 flex items-center justify-between gap-4">
          <button
            onClick={loadAudit}
            disabled={isProcessing}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <RefreshCw size={12} className={isLoading ? "animate-spin" : ""} />
            <span>Actualiser l'audit</span>
          </button>

          <button
            onClick={handleCompleteOptimization}
            disabled={isProcessing}
            className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-lg shadow-indigo-600/30 cursor-pointer flex items-center gap-2"
          >
            {activeAction === "all" ? (
              <RefreshCw size={14} className="animate-spin" />
            ) : (
              <Zap size={14} />
            )}
            <span>Optimisation Complète en 1 Clic</span>
          </button>
        </div>
      </div>
    </div>
  );
};
