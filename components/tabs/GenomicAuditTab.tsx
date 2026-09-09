import React from "react";
import { ForensicHub } from "./ForensicHub";

/**
 * GenomicAuditTab (Unifié avec ForensicHub)
 * Les fonctionnalités d'audit ADN, de dérive des modèles et d'optimisation neurale
 * sont désormais centralisées au sein du pôle Forensic & ADN unifié.
 */
export const GenomicAuditTab: React.FC<{ drawName: string }> = ({ drawName }) => {
  return <ForensicHub drawName={drawName} initialTab="dna_drift" />;
};
