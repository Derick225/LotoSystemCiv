import type { jsPDF as JsPDFType } from 'jspdf';
import type { UserOptions } from 'jspdf-autotable';
import type { UnifiedForensicScenario } from '../forensic/forensicProofStandard';
import type { DrawResult } from '../../types';

export interface PdfExportMetadata {
  fileName: string;
  pageCount: number;
  sizeBytes: number;
}

export interface NeuralPredictionPdfPayload {
  drawName: string;
  suggestedNumbers: number[];
  candidates?: number[];
  confidence?: number;
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
    dominantAlgo?: string;
    contributionPercentage?: number;
    synergyAlgos?: string[];
    compositionGini?: number;
    compositionEntropy?: number;
  }>;
  aiWeights?: Record<string, number>;
  hyperparameters?: Record<string, number | string | boolean>;
  isLocalFallback?: boolean;
  timestamp?: number;
}

export interface ForensicLogPdfItem {
  timestamp: number;
  suggestedNumbers: number[];
  confidence?: number;
  result?: DrawResult | null;
  hits: number[];
  nearMisses: number[];
  precisionPct: number;
  analysis?: string;
}

export interface ForensicLogPdfPayload {
  drawName: string;
  items: ForensicLogPdfItem[];
}

export interface ForensicStochasticReportPayload {
  drawName: string;
  suggestedNumbers: number[];
  candidates?: number[];
  confidence?: number;
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
  appliedWeights?: Record<string, number>;
  empiricalProofs?: Record<
    string,
    {
      brierSkillScore?: number;
      hitRate?: number;
      sampleCount?: number;
      reliability?: number;
    }
  >;
  breakdown?: Record<number, Record<string, number>>;
  analysis?: string;
  hasMachineData?: boolean;
}

function sanitizePdfText(value: unknown, fallback = 'n/d'): string {
  if (value === null || value === undefined) return fallback;
  const raw = String(value);
  if (raw.trim().length === 0) return fallback;
  // Normalize characters outside Helvetica Latin-1 range so jsPDF renders cleanly without mojibake
  return raw
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2022/g, '*')
    .replace(/\u2265/g, '>=')
    .replace(/\u2264/g, '<=')
    .replace(/\u03B7/g, 'eta')
    .replace(/\u03C3/g, 'sigma')
    .replace(/\u221E/g, 'inf')
    .replace(/[^\x09\x0A\x0D\x20-\xFF]/g, '');
}

function formatNumList(nums?: number[]): string {
  if (!nums || nums.length === 0) return 'Aucun';
  return nums.map((n) => String(n).padStart(2, '0')).join(' - ');
}

function formatStat(val: unknown, suffix = '', decimals = 2): string {
  if (typeof val !== 'number' || !Number.isFinite(val)) return 'n/d';
  return `${val.toFixed(decimals)}${suffix}`;
}

function safeSlug(value: string): string {
  return (value || 'tirage')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

async function createPdfContext(title: string, subtitle: string): Promise<{
  doc: JsPDFType;
  autoTable: (doc: JsPDFType, options: UserOptions) => void;
  startY: number;
}> {
  const [{ jsPDF }, { default: autoTablePlugin }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header band
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 30, 'F');
  doc.setFillColor(99, 102, 241);
  doc.rect(0, 28, pageWidth, 2, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(sanitizePdfText(title), 14, 13);

  doc.setTextColor(196, 181, 253);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(sanitizePdfText(subtitle), 14, 21);

  doc.setTextColor(15, 23, 42);
  return {
    doc,
    autoTable: autoTablePlugin as unknown as (doc: JsPDFType, options: UserOptions) => void,
    startY: 38,
  };
}

function getNextTableY(doc: JsPDFType, fallbackY: number): number {
  const lastTable = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable;
  return typeof lastTable?.finalY === 'number' ? lastTable.finalY + 8 : fallbackY;
}

function finalizePdf(doc: JsPDFType, fileName: string): PdfExportMetadata {
  const pageCount = doc.getNumberOfPages();
  const pageHeight = doc.internal.pageSize.getHeight();
  const pageWidth = doc.internal.pageSize.getWidth();

  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(
      sanitizePdfText(`LotoPro Platinum Elite v12.0 - Moteur Deterministe | Page ${p}/${pageCount}`),
      14,
      pageHeight - 8
    );
    doc.text(new Date().toISOString().slice(0, 19).replace('T', ' '), pageWidth - 14, pageHeight - 8, {
      align: 'right',
    });
  }

  const arrayBuffer = doc.output('arraybuffer');
  const sizeBytes = arrayBuffer.byteLength;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    doc.save(fileName);
  }

  return { fileName, pageCount, sizeBytes };
}

export async function generateNeuralPredictionPDF(
  payload: NeuralPredictionPdfPayload
): Promise<PdfExportMetadata> {
  const drawName = payload?.drawName || 'GLOBAL';
  const ts = payload?.timestamp ? new Date(payload.timestamp) : new Date();
  const dateTag = ts.toISOString().slice(0, 10);

  const { doc, autoTable, startY } = await createPdfContext(
    `Rapport d'Inference IA Neural - ${drawName}`,
    `Mode: ${payload.mathModelSummary || 'Neuro-Vectoriel HPC Local'} | Date: ${dateTag}`
  );

  let cursorY = startY;
  autoTable(doc, {
    startY: cursorY,
    head: [['Indicateur', 'Valeur']],
    body: [
      ['Tirage cible', sanitizePdfText(drawName)],
      ['Selection directe (5)', formatNumList(payload.suggestedNumbers)],
      ['Candidats marginaux', formatNumList(payload.candidates)],
      ['Indice de confiance', formatStat(payload.confidence, '%', 1)],
      ['Alignement ADN reel', formatStat(payload.realityAlignment, '%', 1)],
      ['Stabilite selection', formatStat(payload.stabilityScore, '%', 1)],
      ['Diversite genetique', formatStat(payload.diversityScore, '', 2)],
      ['Survie adversariale', formatStat(payload.adversarialSurvivalScore, '%', 1)],
    ],
    theme: 'grid',
    headStyles: { fillColor: [79, 70, 229], textColor: 255, fontSize: 9 },
    styles: { fontSize: 8.5, cellPadding: 2.5 },
  });
  cursorY = getNextTableY(doc, cursorY + 55);

  if (payload.xapExp && payload.xapExp.length > 0) {
    autoTable(doc, {
      startY: cursorY,
      head: [['Numero', 'Algorithme Dominant', 'Contribution', 'Gini', 'Entropie', 'Synergies']],
      body: payload.xapExp.map((x) => [
        String(x.number).padStart(2, '0'),
        sanitizePdfText(x.dominantAlgo),
        formatStat(x.contributionPercentage, '%', 1),
        formatStat(x.compositionGini, '', 2),
        formatStat(x.compositionEntropy, '', 2),
        sanitizePdfText(x.synergyAlgos?.join(', '), 'Aucune'),
      ]),
      theme: 'striped',
      headStyles: { fillColor: [162, 28, 175], textColor: 255, fontSize: 8.5 },
      styles: { fontSize: 8, cellPadding: 2 },
    });
    cursorY = getNextTableY(doc, cursorY + 45);
  }

  if (payload.aiWeights && Object.keys(payload.aiWeights).length > 0) {
    const sortedWeights = Object.entries(payload.aiWeights)
      .filter(([, w]) => typeof w === 'number' && Number.isFinite(w))
      .sort((a, b) => b[1] - a[1]);

    autoTable(doc, {
      startY: cursorY,
      head: [['Canal Algorithmique', 'Poids Calibre']],
      body: sortedWeights.map(([algo, weight]) => [sanitizePdfText(algo), weight.toFixed(4)]),
      theme: 'grid',
      headStyles: { fillColor: [30, 41, 59], textColor: 255, fontSize: 8.5 },
      styles: { fontSize: 8, cellPadding: 2 },
    });
    cursorY = getNextTableY(doc, cursorY + 40);
  }

  const narrativeBlocks = [payload.aiRationale, payload.aiStrategicAdvice, payload.analysis].filter(
    (s): s is string => typeof s === 'string' && s.trim().length > 0
  );
  if (narrativeBlocks.length > 0) {
    autoTable(doc, {
      startY: cursorY,
      head: [['Synthese Analytique & Recommandation']],
      body: narrativeBlocks.map((txt) => [sanitizePdfText(txt)]),
      theme: 'plain',
      headStyles: { fillColor: [51, 65, 85], textColor: 255, fontSize: 9 },
      styles: { fontSize: 8, cellPadding: 2.5 },
    });
  }

  const fileName = `lotopro_ia_prediction_${safeSlug(drawName)}_${dateTag}.pdf`;
  return finalizePdf(doc, fileName);
}

export async function generateForensicLogPDF(
  payload: ForensicLogPdfPayload
): Promise<PdfExportMetadata> {
  const drawName = payload?.drawName || 'GLOBAL';
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const dateTag = new Date().toISOString().slice(0, 10);

  const verifiedCount = items.filter((it) => Boolean(it.result)).length;
  const totalHits = items.reduce((acc, it) => acc + (it.hits?.length || 0), 0);
  const avgPrecision =
    verifiedCount > 0
      ? items.filter((it) => Boolean(it.result)).reduce((acc, it) => acc + (it.precisionPct || 0), 0) /
        verifiedCount
      : 0;

  const { doc, autoTable, startY } = await createPdfContext(
    `Journal Forensic Log - ${drawName}`,
    `${items.length} entree(s) | ${verifiedCount} verifiee(s) | Exact Hits cumules: ${totalHits}`
  );

  let cursorY = startY;
  autoTable(doc, {
    startY: cursorY,
    head: [['Resume Audit', 'Mesure']],
    body: [
      ['Total d\'inferences archivees', String(items.length)],
      ['Inferences verifiees vs tirages officiels', String(verifiedCount)],
      ['Exact Hits cumules', String(totalHits)],
      ['Precision moyenne verifiee', `${avgPrecision.toFixed(1)}%`],
    ],
    theme: 'grid',
    headStyles: { fillColor: [79, 70, 229], textColor: 255, fontSize: 9 },
    styles: { fontSize: 8.5, cellPadding: 2.5 },
  });
  cursorY = getNextTableY(doc, cursorY + 40);

  autoTable(doc, {
    startY: cursorY,
    head: [['Date', 'Selection Predite', 'Resultat Officiel', 'Hits', 'Voisins', 'Precision', 'Conf.']],
    body: items.slice(0, 120).map((it) => [
      new Date(it.timestamp).toISOString().slice(0, 16).replace('T', ' '),
      formatNumList(it.suggestedNumbers),
      it.result ? formatNumList(it.result.gagnants) : 'En attente',
      String(it.hits?.length || 0),
      String(it.nearMisses?.length || 0),
      `${(it.precisionPct || 0).toFixed(1)}%`,
      formatStat(it.confidence, '%', 0),
    ]),
    theme: 'striped',
    headStyles: { fillColor: [30, 41, 59], textColor: 255, fontSize: 8 },
    styles: { fontSize: 7.5, cellPadding: 2 },
  });

  const fileName = `lotopro_forensic_log_${safeSlug(drawName)}_${dateTag}.pdf`;
  return finalizePdf(doc, fileName);
}

export async function generateForensicStochasticReportPDF(
  payload: ForensicStochasticReportPayload
): Promise<PdfExportMetadata> {
  const drawName = payload?.drawName || 'GLOBAL';
  const dateTag = new Date().toISOString().slice(0, 10);

  const { doc, autoTable, startY } = await createPdfContext(
    `Rapport Forensic Stochastique - ${drawName}`,
    `Regime: ${payload.gameRegimeInfo?.regime || 'Standard'} | Machine incluse: ${payload.hasMachineData ? 'Oui' : 'Non'}`
  );

  let cursorY = startY;
  autoTable(doc, {
    startY: cursorY,
    head: [['Parametre / Metrique', 'Valeur']],
    body: [
      ['Selection directe', formatNumList(payload.suggestedNumbers)],
      ['Candidats', formatNumList(payload.candidates)],
      ['Confiance', formatStat(payload.confidence, '%', 1)],
      ['Stabilite', formatStat(payload.stabilityScore, '%', 1)],
      ['Alignement reel', formatStat(payload.realityAlignment, '%', 1)],
      ['Entropie courante', formatStat(payload.currentEntropy, '', 4)],
      ['Exposant de Hurst', formatStat(payload.gameRegimeInfo?.hurst, '', 4)],
      ['Dimension fractale (Chaos)', formatStat(payload.gameRegimeInfo?.chaosDimension, '', 3)],
      ['Discrepance de Weyl', formatStat(payload.gameRegimeInfo?.weylDiscrepancy, '', 4)],
      ['Volatilite', formatStat(payload.gameRegimeInfo?.volatility, '%', 2)],
      ['Bruit / Taux apprentissage / MC', `${formatStat(payload.resolvedNoiseLevel, '', 3)} / ${formatStat(payload.resolvedLearningRate, '', 4)} / ${payload.resolvedMcIterations ?? 'n/d'}`],
    ],
    theme: 'grid',
    headStyles: { fillColor: [79, 70, 229], textColor: 255, fontSize: 9 },
    styles: { fontSize: 8.5, cellPadding: 2.2 },
  });
  cursorY = getNextTableY(doc, cursorY + 75);

  if (payload.appliedWeights && Object.keys(payload.appliedWeights).length > 0) {
    const entries = Object.entries(payload.appliedWeights).sort((a, b) => b[1] - a[1]);
    autoTable(doc, {
      startY: cursorY,
      head: [['Canal', 'Poids', 'BSS Empirique', 'Taux Hit']],
      body: entries.map(([algo, weight]) => {
        const proof = payload.empiricalProofs?.[algo];
        return [
          sanitizePdfText(algo),
          typeof weight === 'number' ? weight.toFixed(4) : 'n/d',
          formatStat(proof?.brierSkillScore, '', 4),
          formatStat(proof?.hitRate, '%', 1),
        ];
      }),
      theme: 'striped',
      headStyles: { fillColor: [162, 28, 175], textColor: 255, fontSize: 8.5 },
      styles: { fontSize: 8, cellPadding: 2 },
    });
    cursorY = getNextTableY(doc, cursorY + 50);
  }

  if (payload.analysis) {
    autoTable(doc, {
      startY: cursorY,
      head: [['Notes d\'Analyse Stochastique']],
      body: [[sanitizePdfText(payload.analysis)]],
      theme: 'plain',
      headStyles: { fillColor: [30, 41, 59], textColor: 255, fontSize: 8.5 },
      styles: { fontSize: 8, cellPadding: 2.5 },
    });
  }

  const fileName = `lotopro_stochastic_report_${safeSlug(drawName)}_${dateTag}.pdf`;
  return finalizePdf(doc, fileName);
}

export async function generateUnifiedForensicScenarioPDF(
  scenario: UnifiedForensicScenario
): Promise<PdfExportMetadata> {
  const drawName = scenario?.drawName || 'GLOBAL';
  const dateTag = (scenario?.exportTimestamp || new Date().toISOString()).slice(0, 10);

  const { doc, autoTable, startY } = await createPdfContext(
    `Scenario Forensique Unifie - ${drawName}`,
    `Type: ${scenario.scenarioType} | Famille: ${scenario.drawFamily} | Schema: ${scenario.schemaVersion}`
  );

  let cursorY = startY;
  autoTable(doc, {
    startY: cursorY,
    head: [['Propriete du Scenario', 'Valeur']],
    body: [
      ['Identifiant', sanitizePdfText(scenario.id)],
      ['Empreinte ADN (Fingerprint)', sanitizePdfText(scenario.fingerprint)],
      ['Regime detecte', sanitizePdfText(scenario.summary?.regime)],
      ['Taux de succes (Hit Rate)', formatStat(scenario.summary?.hitRate, '%', 1)],
      ['Score synthetique', formatStat(scenario.summary?.accuracyScore, '/100', 1)],
      ['Echantillon historique', String(scenario.summary?.sampleCount ?? 0)],
      ['Entropie de Shannon', formatStat(scenario.mathMetadata?.shannonEntropy, '', 4)],
      ['Exposant de Hurst', formatStat(scenario.mathMetadata?.hurstExponent, '', 4)],
      ['Intensite de Hawkes', formatStat(scenario.mathMetadata?.hawkesIntensity, '', 4)],
      ['Score de Brier', formatStat(scenario.mathMetadata?.brierScore, '', 4)],
      ['Perte topologique', formatStat(scenario.mathMetadata?.topologicalLoss, '', 4)],
    ],
    theme: 'grid',
    headStyles: { fillColor: [79, 70, 229], textColor: 255, fontSize: 9 },
    styles: { fontSize: 8.5, cellPadding: 2.2 },
  });
  cursorY = getNextTableY(doc, cursorY + 75);

  if (scenario.summary?.causalAuditTrail?.length > 0) {
    autoTable(doc, {
      startY: cursorY,
      head: [['Piste d\'Audit Causal']],
      body: scenario.summary.causalAuditTrail.map((line) => [sanitizePdfText(line)]),
      theme: 'striped',
      headStyles: { fillColor: [30, 41, 59], textColor: 255, fontSize: 8.5 },
      styles: { fontSize: 8, cellPadding: 2 },
    });
  }

  const fileName = `lotopro_scenario_${safeSlug(scenario.scenarioType)}_${safeSlug(drawName)}_${dateTag}.pdf`;
  return finalizePdf(doc, fileName);
}

export const exportPythonCore = () => undefined;
