
import { jsPDF } from "jspdf";
import type { DrawResult, Prediction, AlgoWeights } from '../types';

export const ExportService = {
    /**
     * Exporte les données brutes en JSON
     */
    exportToJSON: (data: unknown, filename: string) => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", `${filename}_${new Date().toISOString().split('T')[0]}.json`);
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    },

    /**
     * Exporte les poids algorithmiques (ADN) en JSON
     */
    exportDNA: (weights: AlgoWeights, drawName: string) => {
        const payload = {
            metadata: {
                type: 'NEXUS_DNA',
                version: '11.0.0',
                drawName,
                exportedAt: new Date().toISOString()
            },
            weights
        };
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(payload, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", `Nexus_DNA_${drawName}_${new Date().toISOString().split('T')[0]}.json`);
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    },

    /**
     * Importe un fichier DNS (JSON)
     */
    importDNA: (): Promise<AlgoWeights> => {
        return new Promise((resolve, reject) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            
            input.onchange = e => {
                const file = (e.target as HTMLInputElement).files?.[0];
                if (!file) return reject(new Error('Aucun fichier sélectionné.'));
                
                const reader = new FileReader();
                reader.onload = ev => {
                    try {
                        const content = ev.target?.result as string;
                        const data = JSON.parse(content);
                        
                        if (data?.metadata?.type !== 'NEXUS_DNA' || !data.weights) {
                            return reject(new Error('Format de fichier ADN invalide.'));
                        }
                        
                        resolve(data.weights);
                    } catch (err) {
                        reject(new Error('Erreur de lecture du fichier ADN.'));
                    }
                };
                reader.readAsText(file);
            };
            
            input.click();
        });
    },

    /**
     * Exporte l'historique des tirages en CSV (Format Excel compatible)
     */
    exportHistoryToCSV: (results: DrawResult[], filename: string) => {
        const headers = ["Date", "G1", "G2", "G3", "G4", "G5", "M1", "M2", "M3", "M4", "M5", "ID"];
        const rows = results.map(r => {
            const g = r.gagnants.join(',');
            const m = r.machine && r.machine.length === 5 ? r.machine.join(',') : ",,,,";
            return `${r.date},${g},${m},${r.id}`;
        });

        const csvContent = "data:text/csv;charset=utf-8," 
            + headers.join(",") + "\n" 
            + rows.join("\n");

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `${filename}_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        link.remove();
    },

    /**
     * Génère un rapport PDF haute fidélité pour une prédiction
     */
    generatePredictionPDF: (drawName: string, prediction: Prediction) => {
        const doc = new jsPDF();
        const dateStr = new Date().toLocaleDateString('fr-FR', { dateStyle: 'full' });

        // Header Industrial Style
        doc.setFillColor(15, 23, 42); // Slate-900
        doc.rect(0, 0, 210, 45, 'F');
        
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(24);
        doc.setFont("helvetica", "bold");
        doc.text("NEXUS PLATINUM REPORT", 105, 22, { align: "center" });
        
        doc.setFontSize(10);
        doc.setFont("helvetica", "italic");
        doc.text(`Engine v9.5 - Industrial Grade Predictive Analytics - ${dateStr}`, 105, 32, { align: "center" });

        // Context
        doc.setTextColor(30, 41, 59);
        doc.setFontSize(14);
        doc.text(`Configuration Cible : ${drawName}`, 20, 65);

        // Score de Confiance (Badge Visual)
        doc.setDrawColor(79, 70, 229);
        doc.setFillColor(245, 243, 255);
        doc.roundedRect(150, 55, 40, 25, 4, 4, 'FD');
        doc.setTextColor(79, 70, 229);
        doc.setFontSize(9);
        doc.text("CONFIANCE IA", 170, 63, { align: "center" });
        doc.setFontSize(18);
        doc.text(`${prediction.confidence}%`, 170, 73, { align: "center" });

        // Numéros Vectoriels
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(16);
        doc.text("Vecteurs de Convergence :", 20, 100);

        let x = 30;
        prediction.suggestedNumbers.forEach((num) => {
            doc.setFillColor(79, 70, 229); // Indigo
            doc.circle(x, 115, 10, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(14);
            doc.text(num.toString(), x, 117, { align: "center" });
            x += 35;
        });

        // Analyse Stratégique
        doc.setTextColor(15, 23, 42);
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.text("ANALYSE SYNCHRONIQUE :", 20, 150);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(11);
        
        const splitText = doc.splitTextToSize(prediction.analysis, 170);
        doc.text(splitText, 20, 160);

        // Footer
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text("Document confidentiel - Nexus Systems Elite Engineering - Pas de garantie de gain.", 105, 280, { align: "center" });

        doc.save(`Nexus_Prediction_${drawName}_${Date.now()}.pdf`);
    },

    /**
     * Exporte le moteur thermodynamique et d'inférence en script Python pur
     */
    exportPythonCore: () => {
        const pythonScript = `import numpy as np
from typing import List, Dict

class NexusThermodynamicEngine:
    """Moteur Déterministe d'Inférence et d'Optimisation Thermodynamique"""
    
    def compute_hurst_exponent(self, series: List[int]) -> float:
        """Exposant Fractal de Hurst (Zéro Nombre Magique)"""
        N = len(series)
        if N < 10: return 0.5
            
        mean = sum(series) / N
        cum_sum = 0
        max_plus = 0
        min_minus = 0
        sum_sq_diff = 0
        
        for val in series:
            diff = val - mean
            cum_sum += diff
            if cum_sum > max_plus: max_plus = cum_sum
            if cum_sum < min_minus: min_minus = cum_sum
            sum_sq_diff += diff * diff
            
        R = max_plus - min_minus
        S = np.sqrt(sum_sq_diff / N) if sum_sq_diff > 0 else 1.0
        
        if R == 0 or S == 0: return 0.5
            
        H = np.log(R / S) / np.log(N)
        return float(np.clip(H, 0.15, 0.85))

    def deterministic_softmax(self, logits: np.ndarray) -> np.ndarray:
        """Mapping Continu pour transitions neuronales"""
        shifted = logits - np.max(logits)
        exps = np.exp(shifted)
        return exps / np.sum(exps)

    def optimize_weights_gradient_descent(self, algo_stats: Dict[str, float]) -> Dict[str, float]:
        """Descente de Gradients Soft-Margin (0 Hasard)"""
        keys = list(algo_stats.keys())
        D = len(keys)
        if D == 0: return {}
        
        initial_w = np.full(D, 1.0/D)
        entropy = -np.sum(initial_w * np.log2(initial_w + 1e-10)) / np.log2(D)
        
        beta = 1.0 / (np.mean(list(algo_stats.values())) + 1e-5)
        lambda_reg = entropy / D
        momentum_decay = np.clip(entropy, 0.5, 0.95)
        max_steps = int(50 + 100 * entropy)
        
        w = initial_w.copy()
        momentum = np.zeros(D)
        lr = 1.0 / (beta + 1e-5)
        
        for step in range(max_steps):
            grad = np.zeros(D)
            for i, k in enumerate(keys):
                predicted_error = 1.0 - algo_stats[k]
                grad[i] = beta * predicted_error + 2 * lambda_reg * w[i]
                
            momentum = momentum_decay * momentum + (1 - momentum_decay) * grad
            w = w - lr * momentum
            w = np.clip(w, 1e-5, 10.0)
            w = w / np.sum(w)
            
        return {k: float(w[i]) for i, k in enumerate(keys)}

if __name__ == "__main__":
    engine = NexusThermodynamicEngine()
    print("Nexus Thermodynamic Engine - Initialized Successfully")
`;
        const blob = new Blob([pythonScript], { type: "text/x-python;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `Nexus_Core_Algorithms_${new Date().toISOString().split('T')[0]}.py`);
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    }
};
