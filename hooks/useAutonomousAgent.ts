import { useEffect, useRef } from 'react';
import { useNexusStore } from '../store/useNexusStore';
import { audioEngine } from '../utils/audioEngine';
import { AlgoWeights } from '../types';
import { getLocalForensicReports } from '../services/postPredictionAnalysisService';
import { saveAlgoWeights, normalizeWeights } from '../services/prediction/weightsManager';
import { AlgoKey } from '../shared/prediction.types';

// Suppression de l'import de lcgGlobalRandom pour garantir le déterminisme absolu

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
         * Cœur de l'Auto-Tune : Régulation Proportionnelle Continue
         */
        const performAutoTune = async () => {
            const { globalWeights } = useNexusStore.getState();
            
            // Lecture des paramètres utilisateur
            const thresholdString = localStorage.getItem('nexus_agent_drift_threshold');
            const driftThreshold = thresholdString ? parseFloat(thresholdString) : 25;

            // Fetch récent forensic reports
            const reports = await getLocalForensicReports();
            const currentDrawReports = reports.filter(r => r.drawName === drawName).slice(0, 3);
            
            if (currentDrawReports.length > 0) {
                const latestDrift = currentDrawReports[0].algorithmicDrift?.[0];
                const driftScore = latestDrift?.driftScore || 0;

                // 1. ACTIVATION SIGMOÏDE CONTINUE (Remplace le seuil binaire)
                // Calcule un facteur d'activation [0, 1] basé sur l'intensité de la dérive.
                // Centre à driftThreshold. Si Score = Seuil, Activation ~ 0.5.
                const activationFactor = 1 / (1 + Math.exp(-0.1 * (driftScore - driftThreshold)));

                // On agit seulement si l'activation est biologique ou significative (> ~25%) pour éviter le bruit
                if (activationFactor > 0.25 && latestDrift?.direction) {
                    logAction(`Dérive détectée (${Math.round(driftScore)} pts). Intensité de correction: ${(activationFactor * 100).toFixed(0)}%`, "WARNING");
                    
                    const optimizedWeights: AlgoWeights = { ...globalWeights };
                    const currentFreq = optimizedWeights[AlgoKey.FREQUENCY] ?? 0.05;
                    const currentSpectral = optimizedWeights[AlgoKey.SPECTRAL] ?? 0.04;
                    const currentGaps = optimizedWeights[AlgoKey.GAPS] ?? 0.05;
                    const currentMomentum = optimizedWeights[AlgoKey.MOMENTUM] ?? 0.05;
                    const currentBayes = optimizedWeights[AlgoKey.BAYES] ?? 0.05;

                    // 2. ÉTAPE D'AJUSTEMENT DYNAMIQUE DÉTERMINISTE (Remplacement des nombres magiques)
                    // Le pas n'est plus une constante arbitraire (0.01, 0.05), mais dérivé mathématiquement
                    // de l'échelle d'erreur de la dérive par rapport au domaine d'optimisation.
                    // On utilise la racine carrée de la dérive normalisée pour un lissage quadratique.
                    const maxPossibleDrift = 150.0; // Borne empirique du modèle Forensic
                    const normalizedDriftScale = Math.min(1.0, driftScore / maxPossibleDrift);
                    // Pas adaptatif: minoration par la précision machine ou base minimale, majoration par le step multiplier utilisateur
                    const stepMultiplierString = localStorage.getItem('nexus_agent_step_size');
                    const userStepMultiplier = stepMultiplierString ? parseFloat(stepMultiplierString) : 1.0;
                    
                    const adaptiveStep = (Math.sqrt(normalizedDriftScale) / Object.keys(optimizedWeights).length) * userStepMultiplier;

                    // Ajustements continus par descente/montée de gradient stochastique
                    const updateMagnitude = adaptiveStep * activationFactor;

                    if (latestDrift.direction === 'underestimating') {
                        // Boost proportionnel à la variance du signal
                        optimizedWeights[AlgoKey.FREQUENCY] = Math.min(0.8, currentFreq + (updateMagnitude * 1.5));
                        optimizedWeights[AlgoKey.GAPS] = Math.min(0.8, currentGaps + (updateMagnitude * 1.2));
                        
                        optimizedWeights[AlgoKey.SPECTRAL] = Math.max(0.01, currentSpectral - (updateMagnitude * 0.5));
                        optimizedWeights[AlgoKey.MOMENTUM] = Math.max(0.01, currentMomentum - (updateMagnitude * 0.5));
                    } else { // overestimating
                        optimizedWeights[AlgoKey.FREQUENCY] = Math.max(0.01, currentFreq - (updateMagnitude * 1.5));
                        
                        optimizedWeights[AlgoKey.BAYES] = Math.min(0.8, currentBayes + (updateMagnitude * 2.0));
                        optimizedWeights[AlgoKey.GAPS] = Math.min(0.8, currentGaps + (updateMagnitude * 0.8));
                    }

                    // Normalisation stricte et application
                    const finalWeights = normalizeWeights(optimizedWeights);
                    await saveAlgoWeights(drawName, finalWeights);
                    await updateGlobalWeights(finalWeights);
                    
                    const adnImpact = Object.entries(finalWeights)
                        .filter(([_, w]) => w > 0)
                        .sort((a, b) => b[1] - a[1])
                        .map(([key, w]) => `${key}: ${(w * 100).toFixed(1)}%`)
                        .join(' | ');

                    logAction(`Auto-Tune Appliqué. ADN mis à jour.`, "AUTOTUNE", adnImpact);
                    useNexusStore.getState().setForensicOptimized(true);
                } else {
                    // Scan passif sans action (Signal faible ou inexistant)
                    logAction(`Écoute spectrale active (Score: ${driftScore.toFixed(1)}). Stable.`, "SCAN");
                }
            } else {
                logAction(`Filtres d'historique vides. En attente de données Forensic.`, "META");
            }
        };

        const agentLoop = async () => {
            logAction("Agent autonome en ligne. Boucle déterministe lancée.", "SCAN");
            
            while (active && isRunningRef.current) {
                const intervalSecString = localStorage.getItem('nexus_agent_interval_sec');
                const intervalSec = intervalSecString ? parseFloat(intervalSecString) : 8;
                
                // 3. DÉTERMINISME TEMPOREL
                // Suppression du bruit aléatoire (lcgGlobalRandom). Le cycle est strict.
                await new Promise(resolve => setTimeout(resolve, intervalSec * 1000));
                if (!active || !isRunningRef.current) break;

                await performAutoTune();
            }
        };

        agentLoop();

        // Gestion du Forçage (Override)
        const handleForceTrigger = async () => {
            logAction("Signal de forçage reçu. Lancement d'un cycle auto-tuné instantané.", "OVERRIDE");
            await performAutoTune();
        };

        window.addEventListener('TRIGGER_AUTONOMOUS_AUTOTUNE', handleForceTrigger);

        return () => {
            active = false;
            isRunningRef.current = false;
            window.removeEventListener('TRIGGER_AUTONOMOUS_AUTOTUNE', handleForceTrigger);
            logAction("Agent autonome hors-ligne.", "WARNING");
        };
    }, [isAutonomousAgentActive, drawName]);
};
