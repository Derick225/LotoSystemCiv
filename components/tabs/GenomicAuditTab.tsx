import React, { useState, useEffect } from "react";
import { UnifiedDnaSieveRadar } from "../genomic/UnifiedDnaSieveRadar";
import { DnaReferenceAuditor } from "../genomic/DnaReferenceAuditor";
import { ForensicAuditLogsView } from "../genomic/ForensicAuditLogsView";
import { SubAlgorithmDriftHeatmap } from "../genomic/SubAlgorithmDriftHeatmap";
import { ExpertBiasAdjuster } from "../genomic/ExpertBiasAdjuster";
import { NeuralSelfOptimizationPanel } from "../genomic/NeuralSelfOptimizationPanel";
import { useNexusStore } from "../../store/useNexusStore";
import { Dna, Radar, ShieldCheck, FileText, Flame, Sliders, BrainCircuit } from "lucide-react";

export const GenomicAuditTab: React.FC<{ drawName: string }> = ({
  drawName,
}) => {
  const activeSubTab = useNexusStore((state) => state.activeSubTab);
  const [activeView, setActiveView] = useState<
    "DNA_AUDITOR" | "DRIFT_HEATMAP" | "EXPERT_BIAS" | "NEURAL_OPT" | "FORENSIC_LOGS" | "SIEVE_RADAR"
  >("DNA_AUDITOR");

  useEffect(() => {
    if (activeSubTab === "DRIFT_HEATMAP" || activeSubTab === "HEATMAP") {
      setActiveView("DRIFT_HEATMAP");
    } else if (activeSubTab === "EXPERT_BIAS" || activeSubTab === "BIAS") {
      setActiveView("EXPERT_BIAS");
    } else if (activeSubTab === "NEURAL_OPT" || activeSubTab === "NEURAL") {
      setActiveView("NEURAL_OPT");
    } else if (activeSubTab === "FORENSIC_LOGS" || activeSubTab === "FORENSIC") {
      setActiveView("FORENSIC_LOGS");
    } else if (activeSubTab === "SIEVE_RADAR" || activeSubTab === "RADAR") {
      setActiveView("SIEVE_RADAR");
    } else if (activeSubTab === "DNA_AUDITOR") {
      setActiveView("DNA_AUDITOR");
    }
  }, [activeSubTab]);

  return (
    <div className="space-y-6">
      {/* Sélecteur de Mode d'Audit Génomique */}
      <div className="flex justify-center">
        <div className="inline-flex p-1.5 bg-slate-900/80 border border-white/10 rounded-2xl backdrop-blur-md shadow-xl gap-1 overflow-x-auto max-w-full">
          <button
            id="tab-dna-auditor"
            onClick={() => setActiveView("DNA_AUDITOR")}
            className={`flex items-center gap-2 px-4 md:px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap ${
              activeView === "DNA_AUDITOR"
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <ShieldCheck size={14} />
            Audit ADN & Synchronisation
          </button>

          <button
            id="tab-drift-heatmap"
            onClick={() => setActiveView("DRIFT_HEATMAP")}
            className={`flex items-center gap-2 px-4 md:px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap ${
              activeView === "DRIFT_HEATMAP"
                ? "bg-rose-600 text-white shadow-lg shadow-rose-600/30"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Flame size={14} />
            Heatmap Écarts & Sous-Algos
          </button>

          <button
            id="tab-expert-bias"
            onClick={() => setActiveView("EXPERT_BIAS")}
            className={`flex items-center gap-2 px-4 md:px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap ${
              activeView === "EXPERT_BIAS"
                ? "bg-amber-600 text-white shadow-lg shadow-amber-600/30"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Sliders size={14} />
            Biais Expert Manuel
          </button>

          <button
            id="tab-neural-opt"
            onClick={() => setActiveView("NEURAL_OPT")}
            className={`flex items-center gap-2 px-4 md:px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap ${
              activeView === "NEURAL_OPT"
                ? "bg-cyan-600 text-white shadow-lg shadow-cyan-600/30"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <BrainCircuit size={14} />
            Auto-Optimisation Neurale
          </button>

          <button
            id="tab-forensic-logs"
            onClick={() => setActiveView("FORENSIC_LOGS")}
            className={`flex items-center gap-2 px-4 md:px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap ${
              activeView === "FORENSIC_LOGS"
                ? "bg-purple-600 text-white shadow-lg shadow-purple-600/30"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <FileText size={14} />
            Forensic Logs & Écarts
          </button>

          <button
            id="tab-sieve-radar"
            onClick={() => setActiveView("SIEVE_RADAR")}
            className={`flex items-center gap-2 px-4 md:px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap ${
              activeView === "SIEVE_RADAR"
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Radar size={14} />
            Radar & Tamisage Génomique
          </button>
        </div>
      </div>

      {/* Contenu Actif */}
      {activeView === "DNA_AUDITOR" && (
        <DnaReferenceAuditor drawName={drawName} />
      )}
      {activeView === "DRIFT_HEATMAP" && (
        <SubAlgorithmDriftHeatmap drawName={drawName} />
      )}
      {activeView === "EXPERT_BIAS" && (
        <ExpertBiasAdjuster drawName={drawName} />
      )}
      {activeView === "NEURAL_OPT" && (
        <NeuralSelfOptimizationPanel drawName={drawName} />
      )}
      {activeView === "FORENSIC_LOGS" && (
        <ForensicAuditLogsView drawName={drawName} />
      )}
      {activeView === "SIEVE_RADAR" && (
        <UnifiedDnaSieveRadar drawName={drawName} initialViewMode="PANORAMA" />
      )}
    </div>
  );
};



