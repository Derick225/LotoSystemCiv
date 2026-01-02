import { jsPDF } from "jspdf";
import type { Prediction, DrawResult } from '../types';

export const ExportService = {
    /**
     * Exporte les données brutes en JSON
     */
    exportToJSON: (data: any, filename: string) => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", `${filename}_${new Date().toISOString().split('T')[0]}.json`);
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
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
    }
};