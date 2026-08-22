import React from "react";
import { UnifiedDnaSieveRadar } from "../genomic/UnifiedDnaSieveRadar";

export const GenomicAuditTab: React.FC<{ drawName: string }> = ({
  drawName,
}) => {
  return <UnifiedDnaSieveRadar drawName={drawName} initialViewMode="PANORAMA" />;
};
