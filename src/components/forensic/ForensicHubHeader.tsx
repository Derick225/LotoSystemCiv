import React, { memo } from "react";
import {
  BookOpen,
  Zap,
  Cpu,
  Download,
  FileText,
  Upload,
  Database,
  Cloud,
  RefreshCw,
} from "lucide-react";

export interface ForensicHubHeaderProps {
  drawName: string;
  isGeneratingAudit: boolean;
  isBatchApplying: boolean;
  reportsCount: number;
  isExportingPDF: boolean;
  syncing: boolean;
  onFlashAutopsy: () => void;
  onRetroPropagation: () => void;
  onExportJSON: () => void;
  onExportPDF: () => void;
  onImportScenario: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onOpenStorageModal: () => void;
  onSync: () => void;
  onRefresh: () => void;
}

export const ForensicHubHeader: React.FC<ForensicHubHeaderProps> = memo(
  ({
    drawName,
    isGeneratingAudit,
    isBatchApplying,
    reportsCount,
    isExportingPDF,
    syncing,
    onFlashAutopsy,
    onRetroPropagation,
    onExportJSON,
    onExportPDF,
    onImportScenario,
    onOpenStorageModal,
    onSync,
    onRefresh,
  }) => {
    return (
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 bg-slate-900/80 p-6 md:p-8 rounded-3xl border border-slate-800 shadow-2xl">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-2 bg-indigo-500/10 text-indigo-400 rounded-xl border border-indigo-500/20">
              <BookOpen size={18} />
            </span>
            <span className="text-[10px] font-black uppercase tracking-[0.25em] text-indigo-400">
              Post-Mortem &amp; Confrontation Réelle
            </span>
          </div>
          <h2 className="text-2xl md:text-3xl font-black text-white uppercase tracking-tight">
            Autopsies &amp; Rapports Médico-Légaux
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Tirage actif : <strong className="text-emerald-400">{drawName}</strong> • Rétro-propagation d'erreurs, calibration de distribution &amp; traçabilité intégrale
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            id="btn-flash-autopsy"
            onClick={onFlashAutopsy}
            disabled={isGeneratingAudit}
            className="px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-indigo-600/20 transition-all cursor-pointer disabled:opacity-50 active:scale-95"
          >
            <Zap size={14} className={isGeneratingAudit ? "animate-spin" : ""} />
            <span>{isGeneratingAudit ? "Analyse..." : "Autopsie Flash"}</span>
          </button>

          <button
            id="btn-retro-propagation"
            onClick={onRetroPropagation}
            disabled={isBatchApplying || reportsCount === 0}
            className="px-3.5 py-2.5 bg-cyan-950/60 hover:bg-cyan-900/60 text-cyan-300 rounded-xl text-xs font-bold transition-all border border-cyan-800/40 flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
            title="Rétro-propager les erreurs de prédiction sur l'ADN du modèle"
          >
            <Cpu size={14} className={isBatchApplying ? "animate-spin" : ""} />
            <span>{isBatchApplying ? "Propagation..." : "Rétro-Propagation"}</span>
          </button>

          <button
            id="btn-export-json"
            onClick={onExportJSON}
            disabled={reportsCount === 0}
            className="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-all border border-slate-700 flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
            title="Exporter les autopsies en JSON"
          >
            <Download size={14} />
            <span>JSON</span>
          </button>

          <button
            id="btn-export-pdf"
            onClick={onExportPDF}
            disabled={isExportingPDF || reportsCount === 0}
            className="px-3.5 py-2.5 bg-fuchsia-950/60 hover:bg-fuchsia-900/60 text-fuchsia-300 rounded-xl text-xs font-bold transition-all border border-fuchsia-800/40 flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
            title="Exporter le Forensic Log complet en PDF"
          >
            <FileText size={14} />
            <span>{isExportingPDF ? "PDF..." : "PDF"}</span>
          </button>

          <label
            id="btn-import-scenario"
            className="px-3.5 py-2.5 bg-indigo-950/60 hover:bg-indigo-900/60 text-indigo-300 rounded-xl text-xs font-bold transition-all border border-indigo-800/40 flex items-center gap-1.5 cursor-pointer"
            title="Importer et Réinjecter un Scénario Forensique Universel"
          >
            <Upload size={14} />
            <span>Réinjecter</span>
            <input
              type="file"
              accept=".json"
              onChange={onImportScenario}
              className="hidden"
            />
          </label>

          <button
            id="btn-storage-opt"
            onClick={onOpenStorageModal}
            className="px-3.5 py-2.5 bg-indigo-950/60 hover:bg-indigo-900/60 text-indigo-300 rounded-xl text-xs font-bold transition-all border border-indigo-800/40 flex items-center gap-1.5 cursor-pointer"
            title="Audit de Cohérence & Compression Différentielle IndexedDB"
          >
            <Database size={14} />
            <span>Audit &amp; Stockage</span>
          </button>

          <button
            id="btn-sync-cloud"
            onClick={onSync}
            disabled={syncing}
            className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-all border border-slate-700 cursor-pointer"
            title="Synchroniser avec le cloud"
          >
            <Cloud size={16} className={syncing ? "animate-spin text-indigo-400" : ""} />
          </button>

          <button
            id="btn-refresh-reports"
            onClick={onRefresh}
            className="p-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition-all border border-slate-700 cursor-pointer"
            title="Rafraîchir"
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </div>
    );
  }
);

ForensicHubHeader.displayName = "ForensicHubHeader";
