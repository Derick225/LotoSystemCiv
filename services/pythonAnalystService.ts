
import { supabase, isSupabaseConfigured } from './supabaseClient';
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
        
        const { data, error } = await supabase.functions.invoke('ask-oracle', {
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

        if (error) throw new Error(error.message);
        if (!data) throw new Error("Réponse vide du noyau distant.");

        if (onLog) {
            data.stdout?.forEach((line: string) => onLog(line));
            if (data.findings?.p_value) onLog(`[SUCCESS] Convergence atteinte. P-Value: ${data.findings.p_value}`);
        }

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
            findings: data.findings,
            insight: data.insight,
            cells
        };

    } catch (e: any) {
        console.error("Python Kernel Error:", e);
        if (onLog) onLog(`[CRITICAL] Kernel Panic: ${e.message}`);
        throw new Error(`Échec de l'analyse distante: ${e.message}`);
    }
};
