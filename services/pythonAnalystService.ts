
import { isSupabaseConfigured } from './supabaseClient';
import { invokeEdgeFunction } from './apiClient';
import { DrawResult, PythonAnalysisResult, NotebookCell } from "../types";

export const runDeepPythonAnalysis = async (
    drawName: string, 
    history: DrawResult[], 
    modelType: 'XGBoost' | 'ARIMA' | 'MCMC' = 'XGBoost',
    onProgress?: (data: any) => void,
    onLog?: (msg: string) => void
): Promise<PythonAnalysisResult> => {
    
    // Initial logs
    if (onLog) {
        onLog(`[SYSTEM] Initializing Neural Python Kernel v12.0...`);
        onLog(`[CONFIG] Model selected: ${modelType}`);
        onLog(`[DATA] Loading ${history.length} frames from registry...`);
    }

    if (!isSupabaseConfigured()) {
        throw new Error("Connexion Cloud requise pour le moteur d'inférence Python.");
    }

    const dataset = history.slice(0, 100).map(d => ({
        date: d.date,
        gagnants: d.gagnants,
        machine: d.machine || []
    }));

    try {
        if (onLog) onLog(`[CLOUD] Transmitting vector payload to Edge Function...`);
        
        // Utilisation du client API unifié (Vercel Edge Proxy)
        const { data, error } = await invokeEdgeFunction('ask-oracle', {
            body: {
                task: 'python_kernel',
                drawName,
                dataset,
                modelType,
                config: {
                    iterations: 1000,
                    depth: 10,
                    learning_rate: 0.01
                }
            }
        });

        if (error) {
            // Tentative de parsing d'erreur structurée
            let errMsg = error.message;
            try {
                if (errMsg.includes('{')) {
                    const parsedErr = JSON.parse(errMsg.substring(errMsg.indexOf('{')));
                    if (parsedErr.error && parsedErr.error.message) {
                        errMsg = parsedErr.error.message;
                    }
                }
            } catch (e) { /* ignore parse error */ }
            
            // Traduction des erreurs courantes
            if (errMsg.includes('429') || errMsg.includes('quota') || errMsg.includes('RESOURCE_EXHAUSTED')) {
                throw new Error("Surcharge temporaire des serveurs IA (Quota). Veuillez réessayer dans quelques instants.");
            }
            throw new Error(errMsg || "Erreur de communication API");
        }

        if (!data) throw new Error("Réponse vide du noyau distant.");

        if (onLog) {
            data.stdout?.forEach((line: string) => onLog(line));
            if (data.findings?.p_value) onLog(`[SUCCESS] Convergence atteinte. P-Value: ${data.findings.p_value}`);
        }

        // Validation de structure minimale pour éviter le crash UI
        const findings = data.findings || {
            result_vector: [],
            confidence_score: 0,
            p_value: 1.0
        };

        const cells: NotebookCell[] = [
            { id: 'c1', type: 'markdown', content: `## Analyse Avancée : ${modelType}\n**Cible** : ${drawName}\n**Dataset** : ${history.length} tirages` },
            { id: 'c2', type: 'code', content: data.script || "# Script auto-généré par le noyau" },
            { id: 'c3', type: 'output', content: data.stdout?.join('\n') || "Execution completed." },
            { id: 'c4', type: 'markdown', content: `### Synthèse Stochastique\n${data.insight || "Analyse terminée."}` }
        ];

        return {
            id: crypto.randomUUID(),
            timestamp: Date.now(),
            drawName,
            modelType,
            stdout: data.stdout || [],
            script: data.script || "",
            findings,
            insight: data.insight || "Pas de conclusion générée.",
            cells
        };

    } catch (e: any) {
        console.error("Python Kernel Error:", e);
        if (onLog) onLog(`[CRITICAL] Kernel Panic: ${e.message}`);
        throw new Error(`Échec analyse: ${e.message}`);
    }
};
