
import { jsPDF } from "jspdf";
import * as XLSX from "xlsx"; 
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
     * Exporte l'historique en Excel (.xlsx) avec formatage professionnel
     */
    exportHistoryToExcel: (results: DrawResult[], filename: string) => {
        const rows = results.map(r => ({
            Date: r.date,
            Tirage: r.drawName,
            G1: r.gagnants[0],
            G2: r.gagnants[1],
            G3: r.gagnants[2],
            G4: r.gagnants[3],
            G5: r.gagnants[4],
            M1: r.machine?.[0] || '',
            M2: r.machine?.[1] || '',
            M3: r.machine?.[2] || '',
            M4: r.machine?.[3] || '',
            M5: r.machine?.[4] || '',
            ID: r.id
        }));

        const worksheet = XLSX.utils.json_to_sheet(rows);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Nexus_History");

        // Ajustement largeur colonnes
        const wscols = [
            { wch: 12 }, { wch: 20 }, 
            { wch: 5 }, { wch: 5 }, { wch: 5 }, { wch: 5 }, { wch: 5 },
            { wch: 5 }, { wch: 5 }, { wch: 5 }, { wch: 5 }, { wch: 5 },
            { wch: 30 }
        ];
        worksheet['!cols'] = wscols;

        XLSX.writeFile(workbook, `${filename}.xlsx`);
    },

    /**
     * Exporte l'historique en CSV (Fallback léger)
     */
    exportHistoryToCSV: (results: DrawResult[], filename: string) => {
        const headers = ["Date", "Tirage", "G1", "G2", "G3", "G4", "G5", "M1", "M2", "M3", "M4", "M5", "ID"];
        const rows = results.map(r => {
            const g = r.gagnants.join(',');
            const m = r.machine && r.machine.length === 5 ? r.machine.join(',') : ",,,,";
            return `${r.date},${r.drawName},${g},${m},${r.id}`;
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
     * Génère un rapport PDF haute fidélité avec Graphiques, Watermark et Sécurité
     */
    generatePredictionPDF: (drawName: string, prediction: Prediction) => {
        const doc = new jsPDF();
        const dateStr = new Date().toLocaleDateString('fr-FR', { dateStyle: 'full' });
        const timeStr = new Date().toLocaleTimeString('fr-FR');
        
        // --- CONFIGURATION GRAPHIQUE ---
        const primaryColor = [79, 70, 229]; // Indigo 600
        const secondaryColor = [15, 23, 42]; // Slate 900
        const accentColor = [251, 191, 36]; // Amber 400

        // --- BACKGROUND & WATERMARK ---
        const addBackground = () => {
            const pageCount = doc.getNumberOfPages();
            for (let i = 1; i <= pageCount; i++) {
                doc.setPage(i);
                
                // Header Bar
                doc.setFillColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
                doc.rect(0, 0, 210, 40, 'F');

                // Watermark
                doc.setTextColor(245, 245, 245);
                doc.setFontSize(60);
                doc.setFont("helvetica", "bold");
                doc.saveGraphicsState();
                doc.setGState(new (doc as any).GState({ opacity: 0.1 }));
                doc.text("NEXUS CONFIDENTIAL", 105, 150, { align: "center", angle: 45 });
                doc.restoreGraphicsState();
                
                // Footer
                doc.setFontSize(8);
                doc.setTextColor(150, 150, 150);
                doc.text(`Nexus Elite Engineering - Page ${i}`, 105, 290, { align: "center" });
            }
        };

        // --- HEADER CONTENT ---
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(22);
        doc.setFont("helvetica", "bold");
        doc.text("RAPPORT PRÉDICTIF", 105, 20, { align: "center" });
        
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.text(`Généré le ${dateStr} à ${timeStr}`, 105, 30, { align: "center" });

        // --- INFO TIRAGE ---
        doc.setTextColor(30, 41, 59);
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.text(`Cible : ${drawName.toUpperCase()}`, 20, 60);

        // --- SCORE CONFIANCE (Jauge Circulaire Simulée par Rectangle) ---
        doc.setDrawColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.setLineWidth(1);
        doc.setFillColor(245, 243, 255);
        doc.roundedRect(150, 50, 40, 20, 3, 3, 'FD');
        doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2]);
        doc.setFontSize(9);
        doc.text("CONFIANCE", 170, 58, { align: "center" });
        doc.setFontSize(16);
        doc.text(`${prediction.confidence}%`, 170, 66, { align: "center" });

        // --- VECTEURS (Boules) ---
        doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
        doc.setFontSize(12);
        doc.text("VECTEURS PRIORITAIRES :", 20, 85);

        let xPos = 30;
        prediction.suggestedNumbers.forEach((num) => {
            // Ombre
            doc.setFillColor(200, 200, 200);
            doc.circle(xPos + 1, 101, 8, 'F');
            // Boule
            doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
            doc.circle(xPos, 100, 8, 'F');
            // Texte
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(12);
            doc.setFont("helvetica", "bold");
            doc.text(num.toString(), xPos, 104, { align: "center" });
            xPos += 25;
        });

        // --- GRAPHIQUE ANALYTIQUE (Bar Chart simulé) ---
        if (prediction.breakdown) {
            doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
            doc.setFontSize(12);
            doc.text("DÉCOMPOSITION ALGORITHMIQUE :", 20, 130);

            const scores = prediction.breakdown[prediction.suggestedNumbers[0]] || {};
            const metrics = Object.entries(scores)
                .filter(([_, v]) => typeof v === 'number' && v > 10)
                .sort((a, b) => (b[1] as number) - (a[1] as number))
                .slice(0, 5);

            let yPos = 145;
            metrics.forEach(([key, val]) => {
                const label = key.charAt(0).toUpperCase() + key.slice(1);
                const value = val as number;
                const barWidth = (value / 100) * 100; // Max 100mm

                // Label
                doc.setFontSize(10);
                doc.setFont("helvetica", "normal");
                doc.setTextColor(100, 116, 139);
                doc.text(label, 20, yPos);

                // Bar Background
                doc.setFillColor(241, 245, 249);
                doc.rect(50, yPos - 4, 100, 5, 'F');

                // Bar Value
                doc.setFillColor(accentColor[0], accentColor[1], accentColor[2]);
                doc.rect(50, yPos - 4, barWidth, 5, 'F');

                // Value Text
                doc.setFontSize(9);
                doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
                doc.text(`${Math.round(value)}%`, 155, yPos);

                yPos += 12;
            });
        }

        // --- ANALYSE TEXTUELLE ---
        doc.setTextColor(secondaryColor[0], secondaryColor[1], secondaryColor[2]);
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.text("THÈSE D'INVESTISSEMENT :", 20, 220);
        
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(71, 85, 105);
        
        const cleanAnalysis = prediction.analysis.replace(/[*_#]/g, '');
        const splitText = doc.splitTextToSize(cleanAnalysis, 170);
        doc.text(splitText, 20, 230);

        // --- QR CODE (Simulé pour sécurité) ---
        // Dans une version réelle, on génèrerait un QR Code image
        doc.setDrawColor(200, 200, 200);
        doc.rect(170, 240, 25, 25);
        doc.setFontSize(8);
        doc.text("NEXUS ID", 182.5, 255, { align: "center" });

        // Apply Background layers
        addBackground();

        doc.save(`Nexus_SecureReport_${drawName}_${Date.now()}.pdf`);
    }
};
