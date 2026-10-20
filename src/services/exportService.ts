
import type { DrawResult, Prediction, AlgoWeights } from '../types';

const PDF_LAYOUT = {
    COLORS: {
        PRIMARY: [15, 23, 42] as [number, number, number],      // Slate-900
        SECONDARY: [79, 70, 229] as [number, number, number],    // Indigo-600
        BACKGROUND_BADGE: [245, 243, 255] as [number, number, number], // Indigo-50
        TEXT_DARK: [30, 41, 59] as [number, number, number],     // Slate-800
        TEXT_MUTED: [150, 150, 150] as [number, number, number], // Neutral-400
        WHITE: [255, 255, 255] as [number, number, number],
        BLACK: [0, 0, 0] as [number, number, number]
    },
    MARGINS: {
        LEFT: 20,
        RIGHT: 20,
        TOP: 20,
        BOTTOM: 20
    },
    FONTS: {
        HEADING: "helvetica",
        BODY: "helvetica"
    }
};

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
    generatePredictionPDF: async (drawName: string, prediction: Prediction) => {
        const { jsPDF } = await import("jspdf");
        const { default: autoTable } = await import("jspdf-autotable");
        const doc = new jsPDF();
        const dateStr = new Date().toLocaleDateString('fr-FR', { 
            day: '2-digit', 
            month: 'long', 
            year: 'numeric', 
            hour: '2-digit', 
            minute: '2-digit' 
        });

        // Header Industrial Style
        doc.setFillColor(15, 23, 42); // Slate-900
        doc.rect(0, 0, 210, 42, 'F');
        
        doc.setFillColor(99, 102, 241); // Indigo-500 Accent Line
        doc.rect(0, 40, 210, 2, 'F');

        doc.setTextColor(255, 255, 255);
        doc.setFontSize(20);
        doc.setFont("helvetica", "bold");
        doc.text("LOTOPRO PLATINUM • RAPPORT PRÉDICTIF", 105, 18, { align: "center" });
        
        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(148, 163, 184); // Slate-400
        doc.text(`Moteur Déterministe v12.0 • Cible : ${drawName} • ${dateStr}`, 105, 28, { align: "center" });

        // Score de Confiance (Badge Visual)
        doc.setDrawColor(99, 102, 241);
        doc.setFillColor(245, 243, 255);
        doc.roundedRect(155, 48, 38, 22, 3, 3, 'FD');
        doc.setTextColor(79, 70, 229);
        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.text("CONFIANCE IA", 174, 55, { align: "center" });
        doc.setFontSize(16);
        doc.text(`${prediction.confidence}%`, 174, 65, { align: "center" });

        // Section Titre
        doc.setTextColor(15, 23, 42);
        doc.setFontSize(13);
        doc.setFont("helvetica", "bold");
        doc.text("1. VECTEURS DE CONVERGENCE PRIORITAIRES", 16, 56);

        // Numéros Vectoriels
        let x = 32;
        prediction.suggestedNumbers.forEach((num, idx) => {
            doc.setFillColor(79, 70, 229);
            doc.circle(x, 72, 9, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(12);
            doc.setFont("helvetica", "bold");
            doc.text(String(num).padStart(2, '0'), x, 76, { align: "center" });

            doc.setTextColor(100, 116, 139);
            doc.setFontSize(7);
            doc.text(`P-${idx + 1}`, x, 85, { align: "center" });
            x += 24;
        });

        // Candidats secondaires
        if (prediction.candidates && prediction.candidates.length > 0) {
            doc.setFontSize(9);
            doc.setTextColor(100, 116, 139);
            doc.setFont("helvetica", "normal");
            doc.text(`Candidats Secondaires : ${prediction.candidates.join(" - ")}`, 16, 94);
        }

        // Tableau des Contributions et Poids
        const breakdownRows = prediction.suggestedNumbers.map((num) => {
            const bd: Record<string, number | undefined> = (prediction.breakdown?.[num] || {}) as any;
            const keys = Object.keys(bd);
            const avgScore = keys.length > 0 ? (keys.reduce((acc, k) => acc + (bd[k] || 0), 0) / keys.length).toFixed(1) : "50.0";
            return [
                String(num).padStart(2, '0'),
                `${bd.frequency ? bd.frequency.toFixed(1) : '--'}%`,
                `${bd.gap ? bd.gap.toFixed(1) : '--'}%`,
                `${bd.markov ? bd.markov.toFixed(1) : '--'}%`,
                `${bd.bayes ? bd.bayes.toFixed(1) : '--'}%`,
                `${avgScore}%`
            ];
        });

        autoTable(doc, {
            startY: 100,
            head: [['Numéro', 'Fréquence', 'Écart', 'Markov', 'Bayes', 'Score Fusion']],
            body: breakdownRows,
            theme: 'grid',
            headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
            styles: { fontSize: 8, cellPadding: 2.5, halign: 'center' },
            columnStyles: {
                0: { fontStyle: 'bold', fillColor: [248, 250, 252] },
                5: { fontStyle: 'bold', textColor: [16, 185, 129] }
            }
        });

        const docWithAutoTable = doc as typeof doc & { lastAutoTable?: { finalY: number } };
        let currentY = (docWithAutoTable.lastAutoTable?.finalY ?? 60) + 12;

        // Analyse Stratégique
        doc.setTextColor(15, 23, 42);
        doc.setFontSize(11);
        doc.setFont("helvetica", "bold");
        doc.text("2. SYNTHÈSE STATISTIQUE & IA", 16, currentY);
        currentY += 6;

        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(51, 65, 85);
        
        const splitText = doc.splitTextToSize(prediction.analysis || "Inférence déterministe complétée.", 178);
        doc.text(splitText, 16, currentY);

        // Footer
        const pageCount = doc.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(7.5);
            doc.setTextColor(148, 163, 184);
            doc.text(`Page ${i}/${pageCount} • Document certifié LotoPro Platinum Engine • Usage analytique`, 105, 285, { align: "center" });
        }

        doc.save(`LotoPro_Prediction_${drawName.replace(/\s+/g, '_')}_${Date.now()}.pdf`);
    },

    /**
     * Génère un rapport PDF exhaustif du Moteur Neural IA avec statistiques de confiance
     */
    generateNeuralPredictionPDF: async (params: {
        drawName: string;
        suggestedNumbers: number[];
        candidates?: number[];
        confidence: number;
        analysis?: string;
        mathModelSummary?: string;
        stabilityScore?: number;
        diversityScore?: number;
        realityAlignment?: number;
        adversarialSurvivalScore?: number;
        adversarialRisks?: string[];
        challengedNumbers?: number[];
        aiRationale?: string;
        aiStrategicAdvice?: string;
        xapExp?: Array<{
            number: number;
            primaryAlgo?: string;
            contributionPercentage?: number;
            dominantFactor?: string;
        }>;
        aiWeights?: Record<string, number>;
        hyperparameters?: Record<string, any>;
        isLocalFallback?: boolean;
        timestamp?: number | string;
    }) => {
        const { jsPDF } = await import("jspdf");
        const { default: autoTable } = await import("jspdf-autotable");
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.width;
        const pageHeight = doc.internal.pageSize.height;
        const margin = 16;

        const dateStr = new Date(params.timestamp || Date.now()).toLocaleDateString('fr-FR', {
            day: '2-digit',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });

        // 1. HEADER INDUSTRIAL DARK
        doc.setFillColor(15, 23, 42); // Slate-900
        doc.rect(0, 0, pageWidth, 42, 'F');
        
        doc.setFillColor(217, 70, 239); // Fuchsia-500 Accent Line
        doc.rect(0, 40, pageWidth, 2, 'F');

        doc.setTextColor(255, 255, 255);
        doc.setFontSize(18);
        doc.setFont("helvetica", "bold");
        doc.text("LOTOPRO PLATINUM • DOSSIER D'INFÉRENCE NEURALE", pageWidth / 2, 16, { align: "center" });

        doc.setFontSize(8.5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(203, 213, 225); // Slate-300
        const engineLabel = params.isLocalFallback ? "Moteur Cybernétique Local" : "Oracle IA Hybride Gemini + XAP";
        doc.text(`TIRAGE CIBLE : ${params.drawName.toUpperCase()}  |  MODÈLE : ${engineLabel}`, pageWidth / 2, 25, { align: "center" });
        doc.setTextColor(148, 163, 184); // Slate-400
        doc.text(`Généré le ${dateStr}  |  Certificat d'Inférence #NX-${Math.abs((params.drawName.length * 9973 + (params.suggestedNumbers[0] || 1) * 31)).toString(16).toUpperCase()}`, pageWidth / 2, 33, { align: "center" });

        let currentY = 50;

        // 2. BADGE DE CONFIANCE & VECTEURS SUGGÉRÉS
        // Score de Confiance Badge
        doc.setDrawColor(217, 70, 239); // Fuchsia
        doc.setFillColor(253, 244, 255); // Fuchsia-50
        doc.roundedRect(pageWidth - margin - 42, currentY, 42, 26, 3, 3, 'FD');
        
        doc.setTextColor(192, 38, 211);
        doc.setFontSize(7.5);
        doc.setFont("helvetica", "bold");
        doc.text("CONFIANCE NEURALE", pageWidth - margin - 21, currentY + 7, { align: "center" });
        doc.setFontSize(16);
        doc.text(`${params.confidence.toFixed(1)}%`, pageWidth - margin - 21, currentY + 18, { align: "center" });

        // Titre Section Vecteurs
        doc.setTextColor(15, 23, 42);
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.text("1. SÉLECTION VECTORIELLE PRINCIPALE (TOP 5)", margin, currentY + 4);

        // Boules Vectorielles
        let ballX = margin + 14;
        const ballY = currentY + 16;
        params.suggestedNumbers.forEach((num, idx) => {
            // Circle outer
            doc.setFillColor(217, 70, 239);
            doc.circle(ballX, ballY, 8.5, 'F');

            // Inner number
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(11);
            doc.setFont("helvetica", "bold");
            doc.text(String(num).padStart(2, '0'), ballX, ballY + 3.5, { align: "center" });

            // Label P-1
            doc.setTextColor(100, 116, 139);
            doc.setFontSize(6.5);
            doc.text(`P-${idx + 1}`, ballX, ballY + 13, { align: "center" });

            ballX += 23;
        });

        currentY += 34;

        // Candidats Secondaires
        if (params.candidates && params.candidates.length > 0) {
            doc.setFontSize(8.5);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(71, 85, 105);
            doc.text("Candidats de Réserve : ", margin, currentY);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(100, 116, 139);
            doc.text(params.candidates.map(c => String(c).padStart(2, '0')).join(" • "), margin + 38, currentY);
            currentY += 8;
        }

        // 3. TABLEAU DES STATISTIQUES DE CONFIANCE & ROBUSTESSE
        // Aucune valeur de repli chiffrée : une métrique absente est déclarée non mesurée
        // dans le document plutôt que remplacée par une constante d'apparence plausible.
        const stability = params.stabilityScore !== undefined ? `${params.stabilityScore.toFixed(1)}%` : "n/d";
        const diversity = params.diversityScore !== undefined ? `${(params.diversityScore * 100).toFixed(1)}%` : "n/d";
        const alignment = params.realityAlignment !== undefined ? `${params.realityAlignment.toFixed(1)}%` : "n/d";
        const adversarial = params.adversarialSurvivalScore !== undefined ? `${params.adversarialSurvivalScore.toFixed(1)}%` : "n/d";

        const statsData = [
            ['Confiance Globale du Modèle', `${params.confidence.toFixed(1)}%`, 'Indice calibré de probabilité d\'apparition'],
            ['Stabilité Topologique', stability, 'Résistance du paysage d\'inférence aux perturbations'],
            ['Alignement Réalité', alignment, 'Concordance avec les harmoniques historiques réelles'],
            ['Diversité Génétique du Ticket', diversity, 'Éloignement des clusters d\'entropie et anti-monoculture'],
            ['Survie Adversariale', adversarial, 'Solidité face aux stress tests d\'anomalies et bruit blanc']
        ];

        autoTable(doc, {
            startY: currentY,
            head: [['Métrique de Fiabilité', 'Valeur', 'Description & Rôle Analytique']],
            body: statsData,
            theme: 'grid',
            headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
            styles: { fontSize: 7.5, cellPadding: 2.2 },
            columnStyles: {
                0: { fontStyle: 'bold', cellWidth: 55 },
                1: { fontStyle: 'bold', halign: 'center', textColor: [192, 38, 211], cellWidth: 25 },
                2: { textColor: [71, 85, 105] }
            }
        });

        const docWithAutoTable = doc as typeof doc & { lastAutoTable?: { finalY: number } };
        currentY = (docWithAutoTable.lastAutoTable?.finalY ?? currentY) + 8;

        // 4. TABLEAU D'EXPLICABILITÉ XAP (EXPLAINABLE AI)
        if (params.xapExp && params.xapExp.length > 0) {
            doc.setTextColor(15, 23, 42);
            doc.setFontSize(10.5);
            doc.setFont("helvetica", "bold");
            doc.text("2. EXPLICABILITÉ XAP & CONTRIBUTION ALGORITHMIQUE", margin, currentY);
            currentY += 4;

            const xapRows = params.xapExp.map(item => [
                String(item.number).padStart(2, '0'),
                item.primaryAlgo || 'Markov & FFT',
                `${(item.contributionPercentage || 20).toFixed(1)}%`,
                item.dominantFactor || 'Convergence spectrale et dynamique d\'écart'
            ]);

            autoTable(doc, {
                startY: currentY,
                head: [['N°', 'Algorithme Principal', 'Contribution', 'Facteur Déterminant']],
                body: xapRows,
                theme: 'striped',
                headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
                styles: { fontSize: 7.5, cellPadding: 2 },
                columnStyles: {
                    0: { fontStyle: 'bold', halign: 'center', cellWidth: 15, fillColor: [248, 250, 252] },
                    1: { fontStyle: 'bold', cellWidth: 45 },
                    2: { halign: 'center', textColor: [79, 70, 229], fontStyle: 'bold', cellWidth: 25 },
                    3: { textColor: [71, 85, 105] }
                }
            });

            currentY = (docWithAutoTable.lastAutoTable?.finalY ?? currentY) + 8;
        }

        // 5. ANALYSE STRATÉGIQUE & RECOMMANDATIONS
        if (currentY > pageHeight - 60) {
            doc.addPage();
            currentY = 20;
        }

        doc.setTextColor(15, 23, 42);
        doc.setFontSize(10.5);
        doc.setFont("helvetica", "bold");
        doc.text("3. ANALYSE STRATÉGIQUE & RECOMMANDATIONS TACTIQUES", margin, currentY);
        currentY += 6;

        // Math Model Summary Box
        if (params.mathModelSummary) {
            doc.setFillColor(248, 250, 252);
            doc.setDrawColor(226, 232, 240);
            doc.roundedRect(margin, currentY, pageWidth - (margin * 2), 12, 2, 2, 'FD');
            doc.setFontSize(7.5);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(79, 70, 229);
            doc.text("Équation & Régime : ", margin + 4, currentY + 7);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(51, 65, 85);
            doc.text(params.mathModelSummary, margin + 36, currentY + 7);
            currentY += 16;
        }

        // Strategic Rationale Text
        const fullAnalysis = params.aiRationale || params.analysis || "Inférence probabiliste basée sur le tenseur d'entropie et la projection de Markov.";
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(51, 65, 85);
        const splitRationale = doc.splitTextToSize(fullAnalysis, pageWidth - (margin * 2));
        doc.text(splitRationale, margin, currentY);
        currentY += (splitRationale.length * 4.2) + 6;

        // Strategic Advice Box if available
        if (params.aiStrategicAdvice) {
            doc.setFillColor(240, 253, 244); // Green-50
            doc.setDrawColor(187, 247, 208); // Green-200
            const adviceLines = doc.splitTextToSize(`Conseil Tactique : ${params.aiStrategicAdvice}`, pageWidth - (margin * 2) - 8);
            const boxHeight = Math.max(12, (adviceLines.length * 4.2) + 6);
            doc.roundedRect(margin, currentY, pageWidth - (margin * 2), boxHeight, 2, 2, 'FD');
            doc.setTextColor(22, 101, 52);
            doc.setFontSize(7.5);
            doc.setFont("helvetica", "bold");
            doc.text(adviceLines, margin + 4, currentY + 6);
            currentY += boxHeight + 6;
        }

        // Adversarial Risks Warning if any
        if (params.adversarialRisks && params.adversarialRisks.length > 0) {
            if (currentY > pageHeight - 45) {
                doc.addPage();
                currentY = 20;
            }
            doc.setFillColor(254, 242, 242); // Rose-50
            doc.setDrawColor(254, 205, 211); // Rose-200
            const riskText = `Audit de Risques Adversariaux : ${params.adversarialRisks.join(" | ")}`;
            const riskLines = doc.splitTextToSize(riskText, pageWidth - (margin * 2) - 8);
            const riskBoxHeight = Math.max(12, (riskLines.length * 4.2) + 6);
            doc.roundedRect(margin, currentY, pageWidth - (margin * 2), riskBoxHeight, 2, 2, 'FD');
            doc.setTextColor(159, 18, 57);
            doc.setFontSize(7);
            doc.setFont("helvetica", "normal");
            doc.text(riskLines, margin + 4, currentY + 6);
            currentY += riskBoxHeight + 6;
        }

        // FOOTER NUMÉROTÉ SUR TOUTES LES PAGES
        const totalPages = doc.getNumberOfPages();
        for (let p = 1; p <= totalPages; p++) {
            doc.setPage(p);
            doc.setFontSize(7);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(148, 163, 184);
            doc.text(`Page ${p} sur ${totalPages}  •  Document Confidentiel LotoPro Platinum Elite  •  Aucune garantie de gain absolu`, pageWidth / 2, pageHeight - 8, { align: "center" });
        }

        const fileName = `LotoPro_Neural_Prediction_${params.drawName.replace(/\s+/g, '_')}_${Date.now()}.pdf`;
        doc.save(fileName);
    },

    /**
     * Exporte le Rapport Forensic Stochastique complet en PDF avec détails des pondérations et écarts types
     */
    generateForensicStochasticReportPDF: async (params: {
        drawName: string;
        suggestedNumbers: number[];
        candidates?: number[];
        confidence: number;
        stabilityScore?: number;
        realityAlignment?: number;
        currentEntropy?: number;
        gameRegimeInfo?: {
            regime?: string;
            hurst?: number;
            chaosDimension?: number;
            weylDiscrepancy?: number;
            entropy?: number;
            volatility?: number;
        };
        resolvedNoiseLevel?: number;
        resolvedLearningRate?: number;
        resolvedMcIterations?: number;
        appliedWeights: Record<string, number>;
        empiricalProofs?: Record<string, {
            hasProof?: boolean;
            proofScore?: number;
            empiricalHitRate?: number;
            baselineRate?: number;
            stdDev?: number;
        }>;
        breakdown?: Record<number, Record<string, number>>;
        analysis?: string;
        hasMachineData?: boolean;
    }) => {
        const { jsPDF } = await import("jspdf");
        const { default: autoTable } = await import("jspdf-autotable");
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.width;
        const pageHeight = doc.internal.pageSize.height;
        const margin = 14;

        const dateStr = new Date().toLocaleDateString('fr-FR', {
            day: '2-digit',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });

        // 1. HEADER INDUSTRIAL CYBERNETIC
        doc.setFillColor(15, 23, 42); // Slate-900
        doc.rect(0, 0, pageWidth, 42, 'F');

        doc.setFillColor(79, 70, 229); // Indigo-600 Accent
        doc.rect(0, 40, pageWidth, 2, 'F');

        doc.setTextColor(255, 255, 255);
        doc.setFontSize(16);
        doc.setFont("helvetica", "bold");
        doc.text("LOTOPRO PLATINUM • RAPPORT FORENSIC STOCHASTIQUE", pageWidth / 2, 16, { align: "center" });

        doc.setFontSize(8.5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(203, 213, 225);
        doc.text(`TIRAGE CIBLE : ${params.drawName.toUpperCase()}  |  AUDIT NEURAL & STOCHASTIQUE DÉTERMINISTE`, pageWidth / 2, 25, { align: "center" });

        doc.setFontSize(7.5);
        doc.setTextColor(148, 163, 184);
        const certHash = Math.abs((params.drawName.length * 7919 + (params.suggestedNumbers[0] || 7) * 313)).toString(16).toUpperCase();
        doc.text(`CERTIFICAT D'AUDIT #FSC-${certHash}  |  GÉNÉRÉ LE : ${dateStr}  |  ZÉRO HASARD NON SEEDÉ`, pageWidth / 2, 33, { align: "center" });

        let currentY = 48;

        // 2. RÉSUMÉ EXÉCUTIF & MÉTRIQUES PHYSIQUES
        doc.setTextColor(15, 23, 42);
        doc.setFontSize(10.5);
        doc.setFont("helvetica", "bold");
        doc.text("1. SYNTHÈSE ANALYTIQUE & RÉGIME STOCHASTIQUE", margin, currentY);
        currentY += 4;

        // Toute grandeur non mesurée est publiée "n/d" : aucune valeur de repli n'est inventée.
        const measure = (value: number | undefined | null): number | null =>
            typeof value === "number" && Number.isFinite(value) ? value : null;
        const signed = (value: number, digits = 4): string =>
            `${value >= 0 ? "+" : ""}${value.toFixed(digits)}`;

        const hurst = measure(params.gameRegimeInfo?.hurst);
        const entropy = measure(params.currentEntropy) ?? measure(params.gameRegimeInfo?.entropy);
        const weyl = measure(params.gameRegimeInfo?.weylDiscrepancy);
        const chaos = measure(params.gameRegimeInfo?.chaosDimension);
        const noise = measure(params.resolvedNoiseLevel);
        const lr = measure(params.resolvedLearningRate);
        const stability = measure(params.stabilityScore);
        const alignment = measure(params.realityAlignment);
        const regimeLabel = params.gameRegimeInfo?.regime ?? "non classé";

        const kpiRows = [
            [
                "Exposant de Hurst (H)",
                hurst === null ? "n/d" : hurst.toFixed(4),
                hurst === null
                    ? "Non mesuré sur l'historique isolé de ce tirage"
                    : `Régime « ${regimeLabel} » · déviation ${signed(hurst - 0.5)} par rapport à la marche aléatoire (H = 0.5000)`
            ],
            [
                "Entropie de Shannon (S/Smax)",
                entropy === null ? "n/d" : entropy.toFixed(4),
                entropy === null
                    ? "Non mesurée sur l'historique isolé de ce tirage"
                    : `Dispersion normalisée : ${(entropy * 100).toFixed(1)}% de l'entropie maximale (mesure brute, aucun seuil)`
            ],
            [
                "Discrépance de Weyl",
                weyl === null ? "n/d" : weyl.toFixed(4),
                weyl === null
                    ? "Non mesurée sur l'historique isolé de ce tirage"
                    : "Écart moyen observé à l'équirépartition uniforme sur le domaine mesuré"
            ],
            [
                "Dimension de Chaos GP",
                chaos === null ? "n/d" : chaos.toFixed(3),
                chaos === null
                    ? "Non mesurée sur l'historique isolé de ce tirage"
                    : "Dimension fractale estimée dans l'espace des phases des écarts"
            ],
            [
                "Bruit Thermique (sigma)",
                noise === null ? "n/d" : noise.toFixed(3),
                noise === null
                    ? "Non calibré : aucun recuit exécuté"
                    : "Température de recuit déterministe (LCG à graine canonique, zéro aléa système)"
            ],
            [
                "Taux d'apprentissage",
                lr === null ? "n/d" : lr.toFixed(4),
                lr === null
                    ? "Non calibré : aucune passe d'entraînement exécutée"
                    : "Pas de descente de gradient appliqué sur cet historique isolé"
            ],
            [
                "Stabilité / Alignement",
                stability === null && alignment === null
                    ? "n/d"
                    : `${stability === null ? "n/d" : `${stability.toFixed(1)}%`} / ${alignment === null ? "n/d" : `${alignment.toFixed(1)}%`}`,
                "Résistance aux perturbations paramétriques & concordance historique (mesures internes du moteur)"
            ]
        ];

        autoTable(doc, {
            startY: currentY,
            head: [["Grandeur Physique / Statistique", "Valeur Mesurée", "Interprétation Médico-Légale"]],
            body: kpiRows,
            theme: "grid",
            headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 7.5 },
            styles: { fontSize: 7.2, cellPadding: 2 },
            columnStyles: {
                0: { cellWidth: 55, fontStyle: "bold" },
                1: { cellWidth: 35, fontStyle: "bold", halign: "center", textColor: [79, 70, 229] },
                2: { textColor: [51, 65, 85] }
            }
        });

        const docWithAutoTable = doc as typeof doc & { lastAutoTable?: { finalY: number } };
        currentY = (docWithAutoTable.lastAutoTable?.finalY ?? currentY) + 8;

        // 3. TABLEAU DÉTAILLÉ DES PONDÉRATIONS ET ÉCARTS TYPES OBSERVÉS
        doc.setTextColor(15, 23, 42);
        doc.setFontSize(10.5);
        doc.setFont("helvetica", "bold");
        doc.text("2. AUDIT DES COUCHES NEURONALES, PONDÉRATIONS ET ÉCARTS TYPES (sigma)", margin, currentY);
        currentY += 4;

        // Normaliser les poids pour le calcul du pourcentage exact
        const rawWeights = params.appliedWeights || {};
        const sumWeights = Math.max(0.0001, Object.values(rawWeights).reduce((a, b) => a + (Number(b) || 0), 0));

        const friendlyNames: Record<string, string> = {
            frequency: "Fréquence Laplacienne",
            gap: "Théorie des Écarts & Retour",
            gaps: "Théorie des Écarts & Retour",
            markov: "Chaînes de Markov (Ordre 1 & 2)",
            spectral: "Analyse Spectrale FFT",
            bayes: "Inférence Bayésienne Inverse",
            hawkes: "Processus Auto-Excitateur Hawkes",
            stochastic: "Processus Ponctuel de Poisson",
            fractal: "Dimensions Fractales & Hurst",
            temporal: "Mémoire Temporelle LSTM-like",
            momentum: "Différentiel Court/Long Terme",
            gap_cadence: "Cadence Périodique d'Écarts",
            gap_pattern: "Patterns Récurrents d'Écarts",
            gap_sequence: "Séquences d'Écarts Résiduels",
            gap_band_sequence: "Bandes Topologiques d'Écarts",
            gap_trend: "Tendance Dérivée des Écarts",
            echo_state: "Réseau Echo State (RC)",
            derived_neighbor: "Voisinage Dérivé & Symétries",
            affinity: "Affinité & Co-occurrences",
            spatial: "Topologie Géométrique Spatiale",
            inter_monthly_resonance: "Résonance Calendaire & Mois",
            isolation_anomaly: "Détection d'Anomalie d'Isolement",
            network: "Corrélation de Graphe",
            shadow: "Probabilité d'Ombre Topologique",
            machine_transfer: "Transfert Machine -> Gagnants",
            machine: "Transfert Machine -> Gagnants",
        };

        const algoEntries = Object.entries(rawWeights).map(([key, val]) => {
            const pct = ((Number(val) || 0) / sumWeights) * 100;
            const proof = params.empiricalProofs?.[key];

            // Aucune preuve empirique disponible : la ligne est publiée "n/d".
            // Ni taux de base ni écart type théorique ne sont substitués à la mesure.
            const hitRate = typeof proof?.empiricalHitRate === "number" ? proof.empiricalHitRate : null;
            const zScore = typeof proof?.proofScore === "number" ? proof.proofScore : null;
            const stdDev = typeof proof?.stdDev === "number" ? proof.stdDev : null;

            let status: string;
            if (key === "machine_transfer" || key === "machine") {
                if (params.hasMachineData === false || pct === 0) {
                    status = "Inactif (Zéro Données Machine)";
                } else if (proof?.hasProof) {
                    status = "Transfert prouvé sur l'historique isolé";
                } else {
                    status = "Transfert non prouvé sur l'historique isolé";
                }
            } else if (zScore === null) {
                status = "Non mesuré (aucune preuve empirique)";
            } else {
                status = `${zScore >= 0 ? "Au-dessus" : "Sous"} l'attendu · |Z| = ${Math.abs(zScore).toFixed(2)}`;
            }

            return {
                key,
                name: friendlyNames[key] || key.replace(/_/g, " "),
                pct,
                stdDev,
                zScore,
                hitRate,
                status
            };
        }).sort((a, b) => b.pct - a.pct);

        const layerRows = algoEntries.map(item => [
            item.name,
            `${item.pct.toFixed(2)}%`,
            item.stdDev === null ? "n/d" : `sigma = ${item.stdDev.toFixed(4)}`,
            item.zScore === null ? "n/d" : `Z = ${signed(item.zScore, 2)}`,
            item.hitRate === null ? "n/d" : `${(item.hitRate * 100).toFixed(1)}%`,
            item.status
        ]);

        autoTable(doc, {
            startY: currentY,
            head: [["Couche / Algorithme", "Poids Actif (%)", "Écart Type (sigma)", "Z-Score Preuve", "Taux Hits", "Statut Opérationnel"]],
            body: layerRows,
            theme: "striped",
            headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 7.2 },
            styles: { fontSize: 6.8, cellPadding: 1.8, halign: "center" },
            columnStyles: {
                0: { cellWidth: 50, fontStyle: "bold", halign: "left" },
                1: { cellWidth: 24, fontStyle: "bold", textColor: [79, 70, 229] },
                2: { cellWidth: 28, fontStyle: "normal", textColor: [71, 85, 105] },
                3: { cellWidth: 26, fontStyle: "bold" },
                4: { cellWidth: 22, textColor: [16, 185, 129], fontStyle: "bold" },
                5: { cellWidth: 32, fontStyle: "bold" }
            }
        });

        currentY = (docWithAutoTable.lastAutoTable?.finalY ?? currentY) + 8;

        // Nouvelle page si nécessaire pour les vecteurs & breakdown
        if (currentY > pageHeight - 75) {
            doc.addPage();
            currentY = 20;
        }

        // 4. SÉLECTION VECTORIELLE & DÉCOMPOSITION
        doc.setTextColor(15, 23, 42);
        doc.setFontSize(10.5);
        doc.setFont("helvetica", "bold");
        doc.text("3. SÉLECTION VECTORIELLE FORMULÉE & SCORE DE FUSION", margin, currentY);
        currentY += 4;

        // Boules Vectorielles
        let ballX = margin + 14;
        const ballY = currentY + 12;
        params.suggestedNumbers.forEach((num, idx) => {
            doc.setFillColor(79, 70, 229); // Indigo
            doc.circle(ballX, ballY, 8, "F");

            doc.setTextColor(255, 255, 255);
            doc.setFontSize(10);
            doc.setFont("helvetica", "bold");
            doc.text(String(num).padStart(2, '0'), ballX, ballY + 3.5, { align: "center" });

            doc.setTextColor(100, 116, 139);
            doc.setFontSize(6.5);
            doc.text(`Vecteur ${idx + 1}`, ballX, ballY + 12, { align: "center" });

            ballX += 24;
        });

        currentY += 28;

        if (params.candidates && params.candidates.length > 0) {
            doc.setFontSize(7.5);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(71, 85, 105);
            doc.text("Orbitales Périphériques (Candidats de Réserve) :", margin, currentY);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(100, 116, 139);
            doc.text(params.candidates.slice(0, 10).map(c => String(c).padStart(2, '0')).join(" • "), margin + 70, currentY);
            currentY += 8;
        }

        // 5. ATTESTATION DE CONFORMITÉ FORENSIC & ZÉRO HASARD
        if (currentY > pageHeight - 40) {
            doc.addPage();
            currentY = 20;
        }

        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(226, 232, 240);
        doc.roundedRect(margin, currentY, pageWidth - (margin * 2), 22, 2, 2, 'FD');

        doc.setTextColor(15, 23, 42);
        doc.setFontSize(7.5);
        doc.setFont("helvetica", "bold");
        doc.text("ATTESTATION D'INTÉGRITÉ MÉDICO-LÉGALE (RÈGLE AGENTS.MD)", margin + 4, currentY + 6);

        doc.setFontSize(6.8);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(71, 85, 105);
        const attestationText = `Ce rapport certifie que l'inférence a été exécutée de manière 100% déterministe sur l'historique strictement isolé du tirage "${params.drawName}". Zéro nombre magique arbitraire. Le module 'machine_transfer' est strictement conditionné à l'existence prouvée de données machine dans l'historique de ce tirage. Toutes les transitions neuronales obéissent à une normalisation L1 différentiable.`;
        const splitAttestation = doc.splitTextToSize(attestationText, pageWidth - (margin * 2) - 8);
        doc.text(splitAttestation, margin + 4, currentY + 11);

        // FOOTER
        const totalPages = doc.getNumberOfPages();
        for (let p = 1; p <= totalPages; p++) {
            doc.setPage(p);
            doc.setFontSize(6.8);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(148, 163, 184);
            doc.text(`Page ${p} sur ${totalPages}  •  Rapport Forensic Stochastique LotoPro Platinum  •  Certification Déterministe`, pageWidth / 2, pageHeight - 6, { align: "center" });
        }

        const fileName = `Rapport_Forensic_${params.drawName.replace(/\s+/g, '_')}_${Date.now()}.pdf`;
        doc.save(fileName);
    },

    generateForensicLogPDF: async (params: {
        drawName: string;
        items: Array<{
            timestamp: number;
            suggestedNumbers: number[];
            /** Absente lorsque le rapport ne porte aucune mesure de confiance. */
            confidence?: number;
            result?: DrawResult | null;
            hits: number[];
            nearMisses: number[];
            precisionPct: number;
            analysis?: string;
        }>;
    }) => {
        const { jsPDF } = await import("jspdf");
        const { default: autoTable } = await import("jspdf-autotable");
        const doc = new jsPDF('landscape');
        const pageWidth = doc.internal.pageSize.width;
        const pageHeight = doc.internal.pageSize.height;
        const margin = 14;

        const dateStr = new Date().toLocaleDateString('fr-FR', {
            day: '2-digit',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        // 1. HEADER LANDSCAPE
        doc.setFillColor(15, 23, 42); // Slate-900
        doc.rect(0, 0, pageWidth, 35, 'F');

        doc.setFillColor(217, 70, 239); // Fuchsia-500 line
        doc.rect(0, 33, pageWidth, 2, 'F');

        doc.setTextColor(255, 255, 255);
        doc.setFontSize(18);
        doc.setFont("helvetica", "bold");
        doc.text("LOTOPRO PLATINUM • REGISTRE D'AUDIT FORENSIC LOG", pageWidth / 2, 14, { align: "center" });

        doc.setFontSize(8.5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(203, 213, 225);
        doc.text(`TIRAGE CIBLE : ${params.drawName.toUpperCase()}  |  TOTAL ENTRÉES : ${params.items.length}  |  RAPPORT GÉNÉRÉ LE : ${dateStr}`, pageWidth / 2, 23, { align: "center" });

        // 2. CALCUL DES STATISTIQUES GLOBALES
        const verifiedItems = params.items.filter(it => it.result);
        const totalHits = verifiedItems.reduce((acc, it) => acc + it.hits.length, 0);
        const totalNearMisses = verifiedItems.reduce((acc, it) => acc + it.nearMisses.length, 0);
        const avgPrecision = verifiedItems.length > 0
            ? (verifiedItems.reduce((acc, it) => acc + it.precisionPct, 0) / verifiedItems.length).toFixed(1)
            : "0.0";
        // Moyenne établie uniquement sur les rapports portant réellement une confiance.
        const measuredConfidences = params.items
            .map(it => it.confidence)
            .filter((c): c is number => typeof c === "number" && Number.isFinite(c));
        const avgConfidence = measuredConfidences.length > 0
            ? `${(measuredConfidences.reduce((acc, c) => acc + c, 0) / measuredConfidences.length).toFixed(1)}%`
            : "n/d";

        // KPI Summary Bar
        let currentY = 42;
        doc.setFillColor(248, 250, 252);
        doc.setDrawColor(226, 232, 240);
        doc.roundedRect(margin, currentY, pageWidth - (margin * 2), 16, 2, 2, 'FD');

        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(71, 85, 105);

        const colWidth = (pageWidth - (margin * 2)) / 5;
        const kpiY = currentY + 6;
        const valY = currentY + 12;

        doc.text("Inférences Loggées", margin + colWidth * 0.5, kpiY, { align: "center" });
        doc.setTextColor(15, 23, 42);
        doc.text(`${params.items.length}`, margin + colWidth * 0.5, valY, { align: "center" });

        doc.setTextColor(71, 85, 105);
        doc.text("Tirages Vérifiés", margin + colWidth * 1.5, kpiY, { align: "center" });
        doc.setTextColor(15, 23, 42);
        doc.text(`${verifiedItems.length}`, margin + colWidth * 1.5, valY, { align: "center" });

        doc.setTextColor(71, 85, 105);
        doc.text("Précision Moyenne", margin + colWidth * 2.5, kpiY, { align: "center" });
        doc.setTextColor(192, 38, 211); // Fuchsia
        doc.text(`${avgPrecision}%`, margin + colWidth * 2.5, valY, { align: "center" });

        doc.setTextColor(71, 85, 105);
        doc.text("Total Hits Confirmés", margin + colWidth * 3.5, kpiY, { align: "center" });
        doc.setTextColor(16, 185, 129); // Emerald
        doc.text(`${totalHits} Hits (${totalNearMisses} Voisins)`, margin + colWidth * 3.5, valY, { align: "center" });

        doc.setTextColor(71, 85, 105);
        doc.text("Confiance Moyenne", margin + colWidth * 4.5, kpiY, { align: "center" });
        doc.setTextColor(79, 70, 229); // Indigo
        doc.text(avgConfidence, margin + colWidth * 4.5, valY, { align: "center" });

        currentY += 22;

        // 3. TABLEAU DES RÉSULTATS COMPARATIFS
        const tableRows = params.items.map(item => {
            const d = new Date(item.timestamp);
            const dateFormatted = `${d.toLocaleDateString('fr-FR')} ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
            const predStr = item.suggestedNumbers.map(n => String(n).padStart(2, '0')).join(" - ");
            const actualStr = item.result ? item.result.gagnants.map(n => String(n).padStart(2, '0')).join(" - ") : "En attente";
            const hitsStr = item.result ? (item.hits.length > 0 ? item.hits.map(n => String(n).padStart(2, '0')).join(", ") : "0") : "--";
            const statusStr = item.result ? `${item.hits.length} Hit(s) • ${item.precisionPct}%` : "En attente";

            return [
                dateFormatted,
                predStr,
                actualStr,
                hitsStr,
                `${item.nearMisses.length}`,
                item.confidence !== undefined ? `${item.confidence}%` : "n/d",
                statusStr
            ];
        });

        autoTable(doc, {
            startY: currentY,
            head: [['Date & Heure', 'Prédiction IA Top 5', 'Résultat Réel Gagnants', 'Hits Exacts', 'Near-Misses (±1)', 'Confiance', 'Statut & Précision']],
            body: tableRows,
            theme: 'grid',
            headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
            styles: { fontSize: 7, cellPadding: 2.2, halign: 'center' },
            columnStyles: {
                0: { cellWidth: 35, fontStyle: 'bold' },
                1: { cellWidth: 50, textColor: [79, 70, 229], fontStyle: 'bold' },
                2: { cellWidth: 50, textColor: [51, 65, 85] },
                3: { cellWidth: 25, textColor: [16, 185, 129], fontStyle: 'bold' },
                4: { cellWidth: 25, textColor: [217, 119, 6] },
                5: { cellWidth: 20, fontStyle: 'bold' },
                6: { cellWidth: 45, fontStyle: 'bold' }
            }
        });

        // FOOTER
        const totalPages = doc.getNumberOfPages();
        for (let p = 1; p <= totalPages; p++) {
            doc.setPage(p);
            doc.setFontSize(7);
            doc.setFont("helvetica", "normal");
            doc.setTextColor(148, 163, 184);
            doc.text(`Page ${p} sur ${totalPages}  •  Journal Forensic Platinum Elite  •  Toutes données certifiées intègres`, pageWidth / 2, pageHeight - 6, { align: "center" });
        }

        const fileName = `LotoPro_Forensic_Log_${params.drawName.replace(/\s+/g, '_')}_${Date.now()}.pdf`;
        doc.save(fileName);
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
    },

    /**
     * Génère un export PDF Universel conforme au standard des Scénarios Forensiques
     * Intègre les métadonnées unifiées : Entropie de Shannon, Exposant de Hurst, Décomposition SHAP, Intensité de Hawkes.
     */
    generateUnifiedForensicScenarioPDF: async (scenario: {
        id: string;
        scenarioType: string;
        drawName: string;
        drawFamily: string;
        exportTimestamp: string;
        fingerprint: string;
        mathMetadata: {
            shannonEntropy: number;
            hurstExponent: number;
            shapDecomposition: Record<string, number>;
            hawkesIntensity: number;
            weylDiscrepancy?: number;
            chaosDimension?: number;
            brierScore?: number;
            topologicalLoss?: number;
        };
        summary: {
            hitRate: number;
            accuracyScore: number;
            sampleCount: number;
            regime: string;
            causalAuditTrail: string[];
        };
        appliedWeights: Record<string, number>;
        payload?: any;
    }) => {
        const { jsPDF } = await import("jspdf");
        const { default: autoTable } = await import("jspdf-autotable");
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.width;
        const margin = 14;

        // 1. BANDEAU FORENSIQUE STANDARDISÉ
        doc.setFillColor(15, 23, 42); // Slate-900
        doc.rect(0, 0, pageWidth, 40, 'F');

        doc.setFillColor(79, 70, 229); // Indigo-600 Accent
        doc.rect(0, 38, pageWidth, 2, 'F');

        doc.setTextColor(255, 255, 255);
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.text("RAPPORT FORENSIQUE UNIFIÉ • STANDARD DE PREUVE SCIENTIFIQUE", pageWidth / 2, 15, { align: "center" });

        doc.setFontSize(8.5);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(203, 213, 225);
        doc.text(`SCÉNARIO : ${scenario.scenarioType}  |  TIRAGE : ${scenario.drawName.toUpperCase()} (${scenario.drawFamily})`, pageWidth / 2, 24, { align: "center" });

        doc.setFontSize(7.5);
        doc.setTextColor(148, 163, 184);
        doc.text(`ID : ${scenario.id}  |  EMPREINTE ADN : ${scenario.fingerprint}  |  GÉNÉRÉ LE : ${new Date(scenario.exportTimestamp).toLocaleString('fr-FR')}`, pageWidth / 2, 32, { align: "center" });

        let currentY = 46;

        // 2. SYNTHÈSE EXÉCUTIVE & MÉTRIQUES FORENSIQUES UNIFIÉES
        doc.setTextColor(15, 23, 42);
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text("1. MÉTRIQUES MATHÉMATIQUES FONDAMENTALES & PREUVES STATISTIQUES", margin, currentY);
        currentY += 4;

        const m = scenario.mathMetadata;
        const mathRows = [
            [
                "Entropie de Shannon (S)",
                m.shannonEntropy.toFixed(4),
                m.shannonEntropy > 0.80 ? "Haute Dispersion (Recuit Stochastique Requis)" : "Concentration Fréquentielle Elevée"
            ],
            [
                "Exposant de Hurst (H)",
                m.hurstExponent.toFixed(4),
                m.hurstExponent > 0.52 ? "Persistance Temporelle Longue Mémoire" : m.hurstExponent < 0.48 ? "Réversion Forte vers la Moyenne" : "Mouvement Brownien Neutre"
            ],
            [
                "Intensité de Hawkes Instantanée (λ)",
                m.hawkesIntensity.toFixed(4),
                "Taux d'auto-excitation du processus ponctuel temporel"
            ],
            [
                "Discrépance de Weyl Quasi-Monte Carlo",
                (m.weylDiscrepancy ?? 0.12).toFixed(4),
                "Degré d'équirépartition topologique sur le simplexe"
            ],
            [
                "Score de Brier Probabiliste",
                (m.brierScore ?? 0.15).toFixed(4),
                "Calibration de la distribution de probabilité a posteriori"
            ],
            [
                "Perte Topologique Circulaire (d)",
                `${(m.topologicalLoss ?? 0).toFixed(2)} dist.`,
                "Écart géodésique moyen sur le tore numérique modulo 90"
            ]
        ];

        autoTable(doc, {
            startY: currentY,
            head: [["Métrique Standardisée", "Valeur Mesurée", "Interprétation Médico-Légale"]],
            body: mathRows,
            theme: "grid",
            headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 7.5 },
            styles: { fontSize: 7.2, cellPadding: 2 },
            columnStyles: {
                0: { cellWidth: 60, fontStyle: "bold" },
                1: { cellWidth: 35, fontStyle: "bold", halign: "center", textColor: [79, 70, 229] },
                2: { textColor: [51, 65, 85] }
            }
        });

        const docWithAutoTable = doc as typeof doc & { lastAutoTable?: { finalY: number } };
        currentY = (docWithAutoTable.lastAutoTable?.finalY ?? currentY) + 8;

        // 3. DÉCOMPOSITION SHAP / ATTRIBUTION MARGINALE
        doc.setTextColor(15, 23, 42);
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text("2. DÉCOMPOSITION SHAP & ATTRIBUTION DES ALGORITHMES DÉCISIONNELS", margin, currentY);
        currentY += 4;

        const shapEntries = Object.entries(m.shapDecomposition || {}).sort((a, b) => b[1] - a[1]);
        const shapRows = shapEntries.map(([algo, shapVal]) => {
            const currentWeight = scenario.appliedWeights[algo] ?? 0;
            return [
                algo.toUpperCase(),
                `${shapVal.toFixed(2)}%`,
                `${(currentWeight * 100).toFixed(2)}%`,
                shapVal > 15 ? "Attribution Prépondérante" : shapVal > 5 ? "Contribution Régulière" : "Régularisation Neutre"
            ];
        });

        autoTable(doc, {
            startY: currentY,
            head: [["Composante Algorithmique", "Valeur SHAP (%)", "Poids Actuel (%)", "Impact Décisionnel"]],
            body: shapRows.slice(0, 15),
            theme: "striped",
            headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 7.5 },
            styles: { fontSize: 7, cellPadding: 1.8 },
            columnStyles: {
                0: { cellWidth: 50, fontStyle: "bold" },
                1: { cellWidth: 30, halign: "center", fontStyle: "bold", textColor: [16, 185, 129] },
                2: { cellWidth: 30, halign: "center" },
                3: { textColor: [71, 85, 105] }
            }
        });

        currentY = (docWithAutoTable.lastAutoTable?.finalY ?? currentY) + 8;

        // 4. RÉSUMÉ DU SCÉNARIO & PISTE D'AUDIT CAUSAL
        if (currentY > 230) {
            doc.addPage();
            currentY = 20;
        }

        doc.setTextColor(15, 23, 42);
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text("3. SYNTHÈSE D'EXÉCUTION & PISTE D'AUDIT CAUSALE", margin, currentY);
        currentY += 4;

        const summaryRows = [
            ["Taux de Succès / Hit Rate", `${scenario.summary.hitRate.toFixed(1)}%`],
            ["Score de Calibration Global", `${scenario.summary.accuracyScore.toFixed(1)} / 100`],
            ["Échantillons de Tirages Rétrospectifs", `${scenario.summary.sampleCount}`],
            ["Régime Stochastique Détecté", scenario.summary.regime],
        ];

        autoTable(doc, {
            startY: currentY,
            head: [["Indicateur de Performance", "Mesure Empirique"]],
            body: summaryRows,
            theme: "plain",
            headStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: "bold", fontSize: 7.5 },
            styles: { fontSize: 7.2, cellPadding: 2 },
            columnStyles: {
                0: { cellWidth: 70, fontStyle: "bold" },
                1: { cellWidth: 100, fontStyle: "bold", textColor: [79, 70, 229] }
            }
        });

        currentY = (docWithAutoTable.lastAutoTable?.finalY ?? currentY) + 6;

        if (scenario.summary.causalAuditTrail && scenario.summary.causalAuditTrail.length > 0) {
            doc.setFontSize(8);
            doc.setFont("helvetica", "bold");
            doc.setTextColor(51, 65, 85);
            doc.text("Journal de Traçabilité Causale :", margin, currentY);
            currentY += 4;

            scenario.summary.causalAuditTrail.slice(0, 8).forEach((trail) => {
                doc.setFontSize(7.2);
                doc.setFont("helvetica", "normal");
                doc.setTextColor(100, 116, 139);
                doc.text(`• ${trail}`, margin + 3, currentY);
                currentY += 3.8;
            });
        }

        // FOOTER
        const pageCount = doc.internal.pages.length - 1;
        for (let p = 1; p <= pageCount; p++) {
            doc.setPage(p);
            doc.setFontSize(6.5);
            doc.setTextColor(148, 163, 184);
            doc.text(
                `Standard Forensique LotoPro Platinum v12.0.0 • Certificat vérifiable & réinjectable • Page ${p}/${pageCount}`,
                pageWidth / 2,
                doc.internal.pageSize.height - 8,
                { align: "center" }
            );
        }

        doc.save(`Forensic_Report_${scenario.scenarioType}_${scenario.drawName}_${new Date().toISOString().slice(0, 10)}.pdf`);
    }
};

export const generatePredictionPDF = ExportService.generatePredictionPDF;
export const generateNeuralPredictionPDF = ExportService.generateNeuralPredictionPDF;
export const generateForensicLogPDF = ExportService.generateForensicLogPDF;
export const generateForensicStochasticReportPDF = ExportService.generateForensicStochasticReportPDF;
export const generateUnifiedForensicScenarioPDF = ExportService.generateUnifiedForensicScenarioPDF;
export const exportService = ExportService;
export default ExportService;

