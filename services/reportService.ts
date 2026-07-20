
import {  Prediction, AlgoWeights, ForensicReport } from '../types';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

interface ReportData {
    drawName: string;
    prediction: Prediction;
    forensic?: ForensicReport;
    weights: AlgoWeights;
}

export const generateTacticalReport = async (data: ReportData) => {
    const { default: jsPDF } = await import('jspdf');
    const { default: autoTable } = await import('jspdf-autotable');
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;
    const margin = 15;

    // --- Header ---
    doc.setFillColor(15, 23, 42); // Slate-900
    doc.rect(0, 0, pageWidth, 40, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('LOTOPRO PLATINUM ELITE', margin, 20);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(148, 163, 184); // Slate-400
    doc.text('RAPPORT TACTIQUE & PRÉDICTIF', margin, 28);

    doc.setFontSize(10);
    doc.text(`Généré le : ${format(new Date(), 'dd MMMM yyyy à HH:mm', { locale: fr })}`, pageWidth - margin, 20, { align: 'right' });
    doc.text(`Cible : ${data.drawName}`, pageWidth - margin, 28, { align: 'right' });

    let y = 55;

    // --- Section 1: Synthèse Prédictive ---
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('1. SYNTHÈSE PRÉDICTIVE', margin, y);
    y += 10;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Confiance Globale: ${data.prediction.confidence}%`, margin, y);
    y += 6;
    doc.text(`Analyse IA: ${data.prediction.analysis}`, margin, y, { maxWidth: pageWidth - (margin * 2) });
    
    // Calcul de la hauteur du texte d'analyse
    const analysisLines = doc.splitTextToSize(data.prediction.analysis, pageWidth - (margin * 2));
    y += (analysisLines.length * 5) + 10;

    // --- Section 2: Numéros Suggérés ---
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('2. VECTEURS PRIORITAIRES', margin, y);
    y += 10;

    const suggestedData = data.prediction.suggestedNumbers.map(n => {
        const bd = data.prediction.breakdown[n] || {};
        return [
            n,
            `${Math.round((bd.frequency || 0))}%`,
            `${Math.round((bd.gap || 0))}%`,
            `${Math.round((bd.bayes || 0))}%`, // Bayes Score
            `${Math.round((Object.values(bd).reduce((a: number, b: number) => a + (b || 0), 0) / Object.keys(bd).length))}%` // Moyenne approx
        ];
    });

    autoTable(doc, {
        startY: y,
        head: [['Numéro', 'Fréquence', 'Écart', 'Bayes Inf.', 'Score Global']],
        body: suggestedData,
        theme: 'grid',
        headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: 'bold' }, // Indigo-600
        styles: { fontSize: 10, cellPadding: 3 },
        columnStyles: {
            0: { fontStyle: 'bold', halign: 'center', fillColor: [241, 245, 249] }, // Slate-100
            4: { fontStyle: 'bold', textColor: [16, 185, 129] } // Emerald-500
        }
    });

    // @ts-ignore
    y = doc.lastAutoTable.finalY + 20;

    // --- Section 3: Configuration Algorithmique ---
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('3. PARAMÈTRES DU NOYAU', margin, y);
    y += 10;

    const weightsData = [
        ['Fréquence', `${(data.weights.frequency || 0) * 100}%`],
        ['Écart (Gap)', `${(data.weights.gap || 0) * 100}%`],
        ['Markov Chain', `${(data.weights.markov || 0) * 100}%`],
        ['Spectral (FFT)', `${(data.weights.spectral || 0) * 100}%`],
        ['Inférence Bayes', `${(data.weights.bayes || 0) * 100}%`],
        ['Modèle Temporel', `${(data.weights.temporal || 0) * 100}%`]
    ];

    autoTable(doc, {
        startY: y,
        head: [['Algorithme', 'Poids Actuel']],
        body: weightsData,
        theme: 'striped',
        headStyles: { fillColor: [30, 41, 59] }, // Slate-800
        styles: { fontSize: 9 }
    });

    // --- Footer ---
    const pageCount = doc.getNumberOfPages();
    for(let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(100);
        doc.text(`Page ${i} sur ${pageCount} - Document Confidentiel - LotoPro Platinum Elite`, pageWidth / 2, pageHeight - 10, { align: 'center' });
    }

    doc.save(`Rapport_Tactique_${data.drawName.replace(/\s+/g, '_')}_${format(new Date(), 'yyyyMMdd')}.pdf`);
};
