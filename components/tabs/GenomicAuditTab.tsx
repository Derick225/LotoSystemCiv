import React, { useState } from "react";
import { UnifiedDnaSieveRadar } from "../genomic/UnifiedDnaSieveRadar";
import { DnaReferenceAuditor } from "../genomic/DnaReferenceAuditor";
import { Dna, Radar, ShieldCheck } from "lucide-react";

export const GenomicAuditTab: React.FC<{ drawName: string }> = ({
  drawName,
}) => {
  const [activeView, setActiveView] = useState<"DNA_AUDITOR" | "SIEVE_RADAR">(
    "DNA_AUDITOR"
  );

  return (
    <div className="space-y-6">
      {/* Sélecteur de Mode d'Audit Génomique */}
      <div className="flex justify-center">
        <div className="inline-flex p-1.5 bg-slate-900/80 border border-white/10 rounded-2xl backdrop-blur-md shadow-xl gap-1">
          <button
            id="tab-dna-auditor"
            onClick={() => setActiveView("DNA_AUDITOR")}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
              activeView === "DNA_AUDITOR"
                ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <ShieldCheck size={14} />
            Audit ADN & Synchronisation
          </button>

          <button
            id="tab-sieve-radar"
            onClick={() => setActiveView("SIEVE_RADAR")}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
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
      {activeView === "DNA_AUDITOR" ? (
        <DnaReferenceAuditor drawName={drawName} />
      ) : (
        <UnifiedDnaSieveRadar drawName={drawName} initialViewMode="PANORAMA" />
      )}
    </div>
  );
};

