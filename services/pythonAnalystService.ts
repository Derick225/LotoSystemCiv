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
    
    if (onLog) {
        onLog(`[SYSTEM] Initiating Neural Python Kernel v12.0...`);
        onLog(`[CONFIG] Model selected: ${modelType}`);
        onLog(`[DATA] Loading ${history.length} frames from registry...`);
    }

    const dataset = history.slice(0, 100).map(d => ({
        date: d.date,
        gagnants: d.gagnants,
        machine: d.machine || []
    }));

    try {
        if (onLog) onLog(`[CLOUD] Transmitting vector payload to Edge Node...`);
        
        const { data, error } = await invokeEdgeFunction('ask-oracle', {
            body: {
                task: 'python_kernel',
                drawName,
                dataset,
                modelType
            }
        });

        if (error) {
            let errMsg = error.message || "Erreur de communication";
            if (errMsg.includes('429') || errMsg.includes('quota')) {
                errMsg = "Surcharge temporaire de l'Oracle. Veuillez patienter 60s.";
            }
            throw new Error(errMsg);
        }

        if (!data) throw new Error("Réponse vide du noyau distant.");

        const cells: NotebookCell[] = [
            { 
                id: 'c1', 
                type: 'markdown', 
                content: `### Analyse Scientifique : ${modelType}\nLe noyau a initialisé une session de Data Science sur le tirage **${drawName}**. Le dataset comprend ${history.length} séquences historiques.` 
            },
            { 
                id: 'c2', 
                type: 'code', 
                content: data.script || "# Python script generation failed" 
            },
            { 
                id: 'c3', 
                type: 'output', 
                content: data.stdout?.join('\n') || "Process executed with zero output." 
            }
        ];

        return {
            id: crypto.randomUUID(),
            timestamp: Date.now(),
            drawName,
            modelType,
            stdout: data.stdout || [],
            script: data.script || "",
            findings: data.findings || { result_vector: [], confidence_score: 0, p_value: 1.0 },
            insight: data.insight || "Analyse terminée sans conclusion narrative.",
            cells
        };

    } catch (e: any) {
        console.error("Python Kernel Error:", e);
        if (onLog) onLog(`[CRITICAL] Kernel Panic: ${e.message}`);
        throw e;
    }
};