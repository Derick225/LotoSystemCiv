import { useEffect, useRef } from 'react';
import { useNexusStore } from '../store/useNexusStore';
import { audioEngine } from '../utils/audioEngine';
import { AlgoWeights } from '../types';
import { getLocalForensicReports } from '../services/postPredictionAnalysisService';
import { normalizeWeights } from '../services/prediction/weightsManager';
import { applyOptimizedWeights } from '../services/prediction/optimizationController';
import { executeClosedLoopAutoAdjustment } from '../services/prediction/closedLoopAutopsyService';
import { purifyHistoryForDraw } from '../utils/arrayUtils';
import { drawHasMachineNumbers } from '../constants';
import { AlgoKey, RETIRED_ALGO_WEIGHT_KEYS } from '../shared/prediction.types';

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

    // Utilisation de Ref pour éviter les problèmes de Stale Closure dans la boucle asynchrone
    const isRunningRef = useRef(false);

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

        if (!isAutonomousAgentActive) {
            isRunningRef.current = false;
            return;
        }

        isRunningRef.current = true;

        /**
         * Cœur de l'Auto-Tune : Passe par la passerelle d'optimisation unifiée
         * (Proof-Guard, verrouillage des canaux retirés / sans machine, et traçabilité ADN).
         */
        const performAutoTune = async () => {
            const { globalWeights, history } = useNexusStore.getState();
            const cleanHistory = purifyHistoryForDraw(drawName, history || []);
            const hasMachine = drawHasMachineNumbers(drawName, cleanHistory);

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

            const latestDrift = currentDrawReports[0].algorithmicDrift?.[0];
            const driftScore = latestDrift?.driftScore || 0;

            // 1. ACTIVATION SIGMOÏDE CONTINUE (Remplace le seuil binaire)
            const activationFactor = 1 / (1 + Math.exp(-0.1 * (driftScore - driftThreshold)));

            if (activationFactor > 0.25 && latestDrift?.direction) {
                logAction(
                    `Dérive détectée (${Math.round(driftScore)} pts). Intensité de correction: ${(activationFactor * 100).toFixed(0)}%`,
                    "WARNING"
                );

                // Voie principale : si l'historique réel suffit, déléguer à l'autopsie en boucle fermée
                if (cleanHistory.length >= 6) {
                    const closedLoopResult = await executeClosedLoopAutoAdjustment(
                        drawName,
                        0,
                        cleanHistory,
                        globalWeights,
                        {
                            dryRun: false,
                            auditContext: `AutonomousAgent (activation=${(activationFactor * 100).toFixed(1)}%, drift=${driftScore.toFixed(1)})`,
                        }
                    );

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

                // Voie de repli lorsque l'historique local est encore court (< 6 tirages) :
                // passe tout de même par applyOptimizedWeights + Kalman + verrouillage canaux
                const optimizedWeights: AlgoWeights = { ...globalWeights };
                RETIRED_ALGO_WEIGHT_KEYS.forEach((rk) => {
                    optimizedWeights[rk] = 0;
                });
                if (!hasMachine) {
                    optimizedWeights[AlgoKey.MACHINE_TRANSFER] = 0;
                }

                const activeKeysCount = Math.max(
                    1,
                    Object.entries(optimizedWeights).filter(([k]) => {
                        const key = k as AlgoKey;
                        return !RETIRED_ALGO_WEIGHT_KEYS.has(key) && (hasMachine || key !== AlgoKey.MACHINE_TRANSFER);
                    }).length
                );

                const normalizedDriftScale = Math.min(1.0, driftScore / 150.0);
                const stepMultiplierString = localStorage.getItem('nexus_agent_step_size');
                const parsedStep = stepMultiplierString ? parseFloat(stepMultiplierString) : NaN;
                const userStepMultiplier = Number.isFinite(parsedStep) ? parsedStep : 1.0;

                const adaptiveStep = (Math.sqrt(normalizedDriftScale) / activeKeysCount) * userStepMultiplier;
                const updateMagnitude = adaptiveStep * activationFactor;

                const currentFreq = optimizedWeights[AlgoKey.FREQUENCY] ?? 0.05;
                const currentSpectral = optimizedWeights[AlgoKey.SPECTRAL] ?? 0.04;
                const currentGaps = optimizedWeights[AlgoKey.GAPS] ?? 0.05;
                const currentMomentum = optimizedWeights[AlgoKey.MOMENTUM] ?? 0.05;
                const currentBayes = optimizedWeights[AlgoKey.BAYES] ?? 0.05;

                if (latestDrift.direction === 'underestimating') {
                    optimizedWeights[AlgoKey.FREQUENCY] = Math.min(0.8, currentFreq + updateMagnitude * 1.5);
                    optimizedWeights[AlgoKey.GAPS] = Math.min(0.8, currentGaps + updateMagnitude * 1.2);
                    optimizedWeights[AlgoKey.SPECTRAL] = Math.max(0.001, currentSpectral - updateMagnitude * 0.5);
                    optimizedWeights[AlgoKey.MOMENTUM] = Math.max(0.001, currentMomentum - updateMagnitude * 0.5);
                } else {
                    optimizedWeights[AlgoKey.FREQUENCY] = Math.max(0.001, currentFreq - updateMagnitude * 1.5);
                    optimizedWeights[AlgoKey.BAYES] = Math.min(0.8, currentBayes + updateMagnitude * 2.0);
                    optimizedWeights[AlgoKey.GAPS] = Math.min(0.8, currentGaps + updateMagnitude * 0.8);
                }

                const normalizedCandidate = normalizeWeights(optimizedWeights);
                const optRes = await applyOptimizedWeights({
                    drawName,
                    weights: normalizedCandidate,
                    origin: 'FORENSIC_AUTOPSY',
                    history: cleanHistory,
                    useKalmanSmoothing: true,
                    causalAuditTrail: [
                        `Auto-Tune autonome (activation=${(activationFactor * 100).toFixed(1)}%, drift=${driftScore.toFixed(1)})`,
                    ],
                    reason: `Autonomous Agent Auto-Tune (${latestDrift.direction})`,
                });

                await updateGlobalWeights(optRes.appliedWeights, drawName);

                const adnImpact = Object.entries(optRes.appliedWeights)
                    .filter(([_, w]) => w > 0)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 6)
                    .map(([key, w]) => `${key}: ${(w * 100).toFixed(1)}%`)
                    .join(' | ');

                logAction(`Auto-Tune Appliqué (Passerelle ADN).`, "AUTOTUNE", adnImpact);
                useNexusStore.getState().setForensicOptimized(true);
            } else {
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
                    await performAutoTune();
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
                await performAutoTune();
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
    }, [isAutonomousAgentActive, drawName, addAgentLog, updateGlobalWeights]);
};
