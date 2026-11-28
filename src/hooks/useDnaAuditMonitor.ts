import { useState, useEffect, useCallback, useRef } from "react";
import { useNexusStore } from "../store/useNexusStore";
import {
  runSystematicDnaAudit,
  DnaAuditReport,
} from "../services/prediction/dnaAuditService";
import { runUnifiedDnaGeneSequencer } from "../services/prediction/dnaGeneSequenceService";
import { audioEngine } from "../utils/audioEngine";
import { logger } from "../utils/logger";
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
        } catch (audioErr) {
          logger.debug({ audioErr }, "Audio playback non-bloquant");
        }
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
      } catch (scanErr) {
        logger.debug({ scanErr }, "Audio playback non-bloquant");
      }

      const synthesis = await runUnifiedDnaGeneSequencer(
        drawName,
        history,
        globalWeights,
        { applyWeights: true }
      );

      if (!synthesis.applied) {
        addAgentLog({
          id: `epigenome_reharmonize_blocked_${Date.now()}`,
          timestamp: new Date(),
          action: `Ré-harmonisation simulée pour ${drawName} bloquée (${synthesis.walkForwardVerdict ?? "PARITY_WITH_BASELINE"}).`,
          type: "AUTOTUNE",
          impact: synthesis.applicationBlockedReason || "Preuve OOS insuffisante",
        });
        showToast(
          synthesis.applicationBlockedReason ||
            `Ré-harmonisation bloquée sur ${drawName} : aucun gain hors-échantillon significatif.`,
          "info"
        );
        return;
      }

      setGlobalWeights(synthesis.optimizedWeights);
      const updatedReport = await runSystematicDnaAudit(
        drawName,
        history,
        synthesis.optimizedWeights
      );
      setAuditReport(updatedReport);
      setIsDismissed(true);

      addAgentLog({
        id: `epigenome_reharmonize_notif_${Date.now()}`,
        timestamp: new Date(),
        action: `Régulation EpiGenome-SQ exécutée pour ${drawName} (${synthesis.sequenceMetrics.sequenceSignature}).`,
        type: "AUTOTUNE",
        impact: `Cohérence épistasique ${synthesis.sequenceMetrics.epistaticCoherenceScore}% · Alignement ${updatedReport.coherenceScore}%.`,
      });

      try {
        audioEngine.play("success");
      } catch (succErr) {
        logger.debug({ succErr }, "Audio playback non-bloquant");
      }

      showToast(
        `Régulation EpiGenome-SQ appliquée pour ${drawName} (${synthesis.sequenceMetrics.sequenceSignature}).`,
        "success"
      );
    } catch (err: unknown) {
      console.error("[HARMONIZATION ERROR]", err);
      const msg = err instanceof Error ? err.message : "Erreur inconnue";
      showToast(
        `Échec de la ré-harmonisation : ${msg}`,
        "error"
      );
    } finally {
      setIsHarmonizing(false);
    }
  }, [drawName, history, globalWeights, setGlobalWeights, addAgentLog, showToast]);

  const inspectDnaAuditor = useCallback(() => {
    navigateToModule("Genomique", "GENE_SEQUENCER");
    setIsDismissed(true);
  }, [navigateToModule]);

  const inspectDriftHeatmap = useCallback(() => {
    navigateToModule("Genomique", "GENE_SEQUENCER");
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
