import { useState, useEffect, useCallback, useRef } from "react";
import { useNexusStore } from "../store/useNexusStore";
import {
  runSystematicDnaAudit,
  synchronizeAlgorithmsToDnaReference,
  DnaAuditReport,
} from "../services/prediction/dnaAuditService";
import { audioEngine } from "../utils/audioEngine";
import { useToast } from "../components/ui/Toast";

export function useDnaAuditMonitor(targetDrawName?: string) {
  const { showToast } = useToast();
  const currentDrawName = useNexusStore((state) => state.drawName);
  const history = useNexusStore((state) => state.history);
  const globalWeights = useNexusStore((state) => state.globalWeights);
  const setGlobalWeights = useNexusStore((state) => state.setGlobalWeights);
  const addAgentLog = useNexusStore((state) => state.addAgentLog);
  const navigateToModule = useNexusStore((state) => state.navigateToModule);

  const drawName = targetDrawName || currentDrawName;

  const [auditReport, setAuditReport] = useState<DnaAuditReport | null>(null);
  const [isEvaluating, setIsEvaluating] = useState<boolean>(false);
  const [isHarmonizing, setIsHarmonizing] = useState<boolean>(false);
  const [isDismissed, setIsDismissed] = useState<boolean>(false);

  const lastAlertedFingerprint = useRef<string>("");

  // Évaluation déterministe de l'ADN de référence
  const evaluateDna = useCallback(async () => {
    if (!drawName || !history || history.length === 0) {
      setAuditReport(null);
      return;
    }

    try {
      setIsEvaluating(true);
      const report = await runSystematicDnaAudit(drawName, history, globalWeights);
      setAuditReport(report);

      // Alerte sonore et log système si un nouveau seuil critique est franchi
      if (
        report.isCriticalDrift &&
        lastAlertedFingerprint.current !== `${drawName}_${report.referenceDnaFingerprint}_${report.maxWeightDriftDelta}`
      ) {
        lastAlertedFingerprint.current = `${drawName}_${report.referenceDnaFingerprint}_${report.maxWeightDriftDelta}`;
        setIsDismissed(false); // Réactiver si une nouvelle dérive critique survient
        try {
          audioEngine.play("error");
        } catch (e) {}
      }
    } catch (err) {
      console.warn("[USE_DNA_AUDIT_MONITOR ERROR]", err);
    } finally {
      setIsEvaluating(false);
    }
  }, [drawName, history, globalWeights]);

  useEffect(() => {
    evaluateDna();
  }, [evaluateDna]);

  // Réinitialiser le dismiss lors d'un changement de tirage
  useEffect(() => {
    setIsDismissed(false);
  }, [drawName]);

  // Action de Ré-harmonisation 1-Click
  const harmonizeDna = useCallback(async () => {
    if (!drawName) return;

    try {
      setIsHarmonizing(true);
      try {
        audioEngine.play("scan");
      } catch (e) {}

      const syncResult = await synchronizeAlgorithmsToDnaReference(
        drawName,
        history,
        globalWeights
      );

      setGlobalWeights(syncResult.synchronizedWeights);
      setAuditReport(syncResult.report);
      setIsDismissed(true);

      addAgentLog({
        id: `dna_reharmonize_notif_${Date.now()}`,
        timestamp: new Date(),
        action: `Ré-harmonisation prioritaire de l'ADN de référence exécutée pour ${drawName}.`,
        type: "AUTOTUNE",
        impact: `Alignement ADN rétabli à 100% (${syncResult.realignedCount} plugins calibrés).`,
      });

      try {
        audioEngine.play("success");
      } catch (e) {}

      showToast(
        `Ré-harmonisation réussie ! L'ADN canonique de ${drawName} est désormais aligné.`,
        "success"
      );
    } catch (err: any) {
      console.error("[HARMONIZATION ERROR]", err);
      showToast(
        `Échec de la ré-harmonisation : ${err.message || "Erreur inconnue"}`,
        "error"
      );
    } finally {
      setIsHarmonizing(false);
    }
  }, [drawName, history, globalWeights, setGlobalWeights, addAgentLog, showToast]);

  const inspectDnaAuditor = useCallback(() => {
    navigateToModule("Genomique", "DNA_AUDITOR");
    setIsDismissed(true);
  }, [navigateToModule]);

  const inspectDriftHeatmap = useCallback(() => {
    navigateToModule("Genomique", "DRIFT_HEATMAP");
    setIsDismissed(true);
  }, [navigateToModule]);

  return {
    drawName,
    auditReport,
    isEvaluating,
    isHarmonizing,
    isCriticalDrift: !!(auditReport?.isCriticalDrift && !isDismissed),
    criticalThreshold: auditReport?.criticalDriftThreshold ?? 0.025,
    maxDriftDelta: auditReport?.maxWeightDriftDelta ?? 0,
    criticalAlgorithms: auditReport?.criticalDriftAlgorithms ?? [],
    driftSeverityScore: auditReport?.driftSeverityScore ?? 0,
    harmonizeDna,
    inspectDnaAuditor,
    inspectDriftHeatmap,
    dismissNotification: () => setIsDismissed(true),
    refreshAudit: evaluateDna,
  };
}
