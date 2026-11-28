import { useEffect, useRef } from 'react';
import { useNexusStore } from '../store/useNexusStore';
import { audioEngine } from '../utils/audioEngine';
import { AlgoWeights } from '../types';
import { getLocalForensicReports } from '../services/postPredictionAnalysisService';
import { executeClosedLoopAutoAdjustment } from '../services/prediction/closedLoopAutopsyService';
import { purifyHistoryForDraw } from '../utils/arrayUtils';

export interface AgentActionLog {
    id: string;
    timestamp: Date;
    action: string;
    type: 'SCAN' | 'AUTOTUNE' | 'WARNING' | 'OVERRIDE' | 'META';
    impact?: string;
}

let agentLogCounter = 0;

export const useAutonomousAgent = () => {
    const isAutonomousAgentActive = useNexusStore(s => s.isAutonomousAgentActive);
    const drawName = useNexusStore(s => s.drawName);
    const addAgentLog = useNexusStore(s => s.addAgentLog);
    const updateGlobalWeights = useNexusStore(s => s.updateGlobalWeights);
    const markAutonomousDrawProcessed = useNexusStore(s => s.markAutonomousDrawProcessed);

    // Utilisation de Ref pour éviter les problèmes de Stale Closure et le retraitement en boucle
    const isRunningRef = useRef(false);
    const processedSignatureRef = useRef<string | null>(null);

    const logAction = (action: string, type: AgentActionLog['type'], impact?: string) => {
        agentLogCounter++;
        addAgentLog({
            id: `log_${Date.now()}_${agentLogCounter}`,
            timestamp: new Date(),
            action,
            type,
            impact
        });
        if (type === 'AUTOTUNE' || type === 'OVERRIDE') {
            audioEngine.play('success');
        } else if (type === 'WARNING') {
            audioEngine.play('error');
        }
    };

    useEffect(() => {
        let active = true;

        if (!isAutonomousAgentActive || !drawName || !drawName.trim()) {
            isRunningRef.current = false;
            return;
        }

        isRunningRef.current = true;
        const normalizedDrawKey = drawName.trim().toUpperCase();
        const storageKey = `nexus_agent_last_processed_${normalizedDrawKey}`;
        const storeProcessed = useNexusStore.getState().lastProcessedAutonomousDrawByDraw?.[normalizedDrawKey];
        if (storeProcessed) {
            processedSignatureRef.current = storeProcessed;
        } else {
            try {
                const persisted = localStorage.getItem(storageKey);
                if (persisted) {
                    processedSignatureRef.current = persisted;
                    markAutonomousDrawProcessed(drawName, persisted);
                }
            } catch {
                // Ignorer si localStorage indisponible
            }
        }

        const persistProcessedDraw = (signature: string) => {
            processedSignatureRef.current = signature;
            markAutonomousDrawProcessed(drawName, signature);
            try {
                localStorage.setItem(storageKey, signature);
            } catch {
                // Ignorer
            }
        };

        /**
         * Cœur de l'Auto-Tune : Passe par la passerelle d'optimisation unifiée
         * (Proof-Guard, déduplication stricte store + tirage/rapport, verrouillage prudence).
         */
        const performAutoTune = async (isForced = false) => {
            const { globalWeights, history, lastProcessedAutonomousDrawByDraw } = useNexusStore.getState();
            const cleanHistory = purifyHistoryForDraw(drawName, history || []);

            // Lecture des paramètres utilisateur
            const thresholdString = localStorage.getItem('nexus_agent_drift_threshold');
            const parsedThreshold = thresholdString ? parseFloat(thresholdString) : NaN;
            const driftThreshold = Number.isFinite(parsedThreshold) ? parsedThreshold : 25;

            // Fetch récents forensic reports isolés sur le tirage actif
            const reports = await getLocalForensicReports();
            const currentDrawReports = reports.filter(r => r.drawName === drawName).slice(0, 3);

            if (currentDrawReports.length === 0) {
                logAction(`Filtres d'historique vides. En attente de données Forensic.`, "META");
                return;
            }

            const latestReport = currentDrawReports[0];
            const latestDraw = cleanHistory[0];
            const stateSignature = `${drawName}::${latestDraw?.id || latestDraw?.date || 'none'}::${latestReport.id || latestReport.date}`;
            const alreadyProcessedInStore = lastProcessedAutonomousDrawByDraw?.[normalizedDrawKey] === stateSignature;

            if (!isForced && (processedSignatureRef.current === stateSignature || alreadyProcessedInStore)) {
                return;
            }
            if (isForced && (processedSignatureRef.current === stateSignature || alreadyProcessedInStore)) {
                logAction(
                    `Tirage/rapport déjà mémorisé dans le store (${latestReport.date}). Aucune ré-application pour éviter l'accumulation.`,
                    "SCAN"
                );
                return;
            }

            const latestDrift = latestReport.algorithmicDrift?.[0];
            const driftScore = latestDrift?.driftScore || 0;

            // 1. ACTIVATION SIGMOÏDE CONTINUE (Remplace le seuil binaire)
            const activationFactor = 1 / (1 + Math.exp(-0.1 * (driftScore - driftThreshold)));

            if (activationFactor > 0.25 && latestDrift?.direction) {
                logAction(
                    `Dérive détectée (${Math.round(driftScore)} pts). Intensité de correction: ${(activationFactor * 100).toFixed(0)}%`,
                    "WARNING"
                );

                // Mémoriser le dernier tirage traité dans le store et localStorage avant exécution pour bloquer toute boucle concurrente
                persistProcessedDraw(stateSignature);

                // Voie principale : si l'historique réel suffit, déléguer à l'autopsie en boucle fermée
                if (cleanHistory.length >= 6) {
                    const closedLoopResult = await executeClosedLoopAutoAdjustment(
                        drawName,
                        0,
                        cleanHistory,
                        globalWeights,
                        {
                            dryRun: cleanHistory.length < 18,
                            auditContext: `AutonomousAgent (activation=${(activationFactor * 100).toFixed(1)}%, drift=${driftScore.toFixed(1)})`,
                        }
                    );

                    if (closedLoopResult.idempotentHit) {
                        logAction(
                            `Idempotence confirmée sur ${drawName} (${closedLoopResult.targetDrawDate}) : tirage déjà traité, poids existants conservés.`,
                            "SCAN"
                        );
                        return;
                    }

                    const prudenceActive = Boolean(
                        closedLoopResult.autopsyReport.learningAudit?.prudenceModeActive
                    );
                    if (prudenceActive || !closedLoopResult.appliedDirectly) {
                        logAction(
                            `Mode prudence actif sur ${drawName} (${closedLoopResult.targetDrawDate}) : observation enregistrée sans mutation des poids.`,
                            "META"
                        );
                        return;
                    }

                    const targetWeights: AlgoWeights = closedLoopResult.optimizedWeights;
                    await updateGlobalWeights(targetWeights, drawName);

                    const adnImpact = (Object.entries(targetWeights) as [string, number][])
                        .filter(([_, w]) => w > 0)
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 6)
                        .map(([key, w]) => `${key}: ${(w * 100).toFixed(1)}%`)
                        .join(' | ');

                    logAction(
                        `Auto-Tune Boucle Fermée appliqué (${closedLoopResult.targetDrawDate}).`,
                        "AUTOTUNE",
                        adnImpact
                    );
                    useNexusStore.getState().setForensicOptimized(true);
                    return;
                }

                // Historique trop court (< 6 tirages) : aucune mutation hasardeuse sur les poids de production
                logAction(
                    `Historique insuffisant (${cleanHistory.length}/6 tirages) : mode prudence actif, aucune mutation des poids.`,
                    "META"
                );
            } else {
                persistProcessedDraw(stateSignature);
                logAction(`Écoute spectrale active (Score: ${driftScore.toFixed(1)}). Stable.`, "SCAN");
            }
        };

        const agentLoop = async () => {
            logAction("Agent autonome en ligne. Boucle déterministe lancée.", "SCAN");

            while (active && isRunningRef.current) {
                const intervalSecString = localStorage.getItem('nexus_agent_interval_sec');
                const parsedInterval = intervalSecString ? parseFloat(intervalSecString) : NaN;
                const intervalSec = Number.isFinite(parsedInterval) && parsedInterval >= 2 ? parsedInterval : 8;

                await new Promise(resolve => setTimeout(resolve, intervalSec * 1000));
                if (!active || !isRunningRef.current) break;

                try {
                    await performAutoTune(false);
                } catch (err) {
                    const msg = err instanceof Error ? err.message : String(err);
                    logAction(`Erreur cycle auto-tune : ${msg}`, "WARNING");
                }
            }
        };

        agentLoop();

        const handleForceTrigger = async () => {
            logAction("Signal de forçage reçu. Lancement d'un cycle auto-tuné instantané.", "OVERRIDE");
            try {
                await performAutoTune(true);
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                logAction(`Erreur forçage auto-tune : ${msg}`, "WARNING");
            }
        };

        window.addEventListener('TRIGGER_AUTONOMOUS_AUTOTUNE', handleForceTrigger);

        return () => {
            active = false;
            isRunningRef.current = false;
            window.removeEventListener('TRIGGER_AUTONOMOUS_AUTOTUNE', handleForceTrigger);
            logAction("Agent autonome hors-ligne.", "WARNING");
        };
    }, [isAutonomousAgentActive, drawName, addAgentLog, updateGlobalWeights, markAutonomousDrawProcessed]);
};
