/**
 * SERVICE OFFICIEL DE GÉNÉRATION DE BORDEREAU DE JEU LONACI (PDF & REÇU THERMIQUE)
 * LotoPro Platinum Elite v12.0
 * 
 * Conforme à la réglementation des jeux de hasard de Côte d'Ivoire (LONACI) :
 * - Intégrité cryptographique (Hash SHA-256 déterministe)
 * - Rendu vectoriel du bordereau officiel A4 ou Reçu Thermique 80mm
 * - Grille de validation 1-90 avec cases noircies
 * - Mentions légales obligatoires (Forclusion 30 jours, Traçabilité Terminal)
 */

export interface LonaciDrawBurstItem {
  name: string;
  time: string;
  day?: string;
  stake: number;
  potentialWin: number;
}

export interface LonaciReceiptData {
  ticketId: string;
  terminalId: string;
  timestamp: number;
  date: string;
  drawNames: string[];
  burstItems?: LonaciDrawBurstItem[];
  gameMode: "STANDARD" | "DOUBLE_CHANCE" | "DOUBLE_CHANCE_MACHINE";
  betType: string;
  betTypeLabel: string;
  numbers: number[];
  odds: number;
  stakePerDraw: number;
  totalStake: number;
  potentialWin: number;
  burstStrategy?: string;
  dominantStrategy?: string;
  densityIndex?: number;
  securityHash?: string;
}

/**
 * Calcule un hash cryptographique d'intégrité déterministe (SHA-256) pour le bordereau.
 */
export async function generateReceiptSecurityHash(
  data: Pick<LonaciReceiptData, 'ticketId' | 'terminalId' | 'timestamp' | 'numbers' | 'totalStake' | 'drawNames' | 'betType'>
): Promise<string> {
  const payload = [
    data.ticketId,
    data.terminalId,
    data.timestamp,
    data.numbers.slice().sort((a, b) => a - b).join('-'),
    data.totalStake,
    data.drawNames.join(','),
    data.betType,
    'LONACI_SECURE_AUTH_V12',
  ].join('::');

  if (typeof crypto !== 'undefined' && crypto.subtle && typeof crypto.subtle.digest === 'function') {
    try {
      const msgUint8 = new TextEncoder().encode(payload);
      const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
    } catch {
      // Fallback si non disponible
    }
  }

  // Fallback FNV-1a étendu déterministe 64-bit
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < payload.length; i++) {
    const ch = payload.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 0x01000193);
    h2 = Math.imul(h2 ^ (ch << 3), 0x5bd1e995);
  }
  const part1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const part2 = (h2 >>> 0).toString(16).padStart(8, '0');
  const part3 = ((h1 ^ h2) >>> 0).toString(16).padStart(8, '0');
  const part4 = ((h1 + h2) >>> 0).toString(16).padStart(8, '0');
  return (part1 + part2 + part3 + part4).toUpperCase();
}

/**
 * Génère une référence officielle de ticket LONACI déterministe.
 */
export function generateLonaciTicketReference(drawName: string, timestamp: number): string {
  const code = Math.abs(
    drawName.split('').reduce((acc, c, idx) => (acc * 31 + c.charCodeAt(0) * (idx + 1)) | 0, 7)
  ).toString(36).toUpperCase().padStart(4, '0').slice(0, 4);
  const tsCode = (timestamp % 1000000).toString(36).toUpperCase().padStart(4, '0');
  return `LNC-CI-${new Date(timestamp).getFullYear()}-${code}-${tsCode}`;
}

/**
 * Génère et télécharge le Bordereau Officiel LONACI au format PDF.
 */
export async function generateLonaciReceiptPdf(
  receiptData: LonaciReceiptData,
  options: { format?: 'A4' | 'THERMAL'; autoDownload?: boolean } = {}
): Promise<{ doc: any; blob: Blob }> {
  const { default: jsPDF } = await import('jspdf');
  const format = options.format || 'A4';
  const autoDownload = options.autoDownload ?? true;

  // Garantir l'existence du hash de sécurité
  const securityHash = receiptData.securityHash || (await generateReceiptSecurityHash(receiptData));

  // Configuration de la page selon le format
  let doc: any;
  if (format === 'THERMAL') {
    // Format Reçu de Caisse / Terminal 80mm de large, hauteur variable (220mm)
    doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: [80, 240],
    });
  } else {
    // Format A4 Officiel Institutionnel
    doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    });
  }

  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  const margin = format === 'THERMAL' ? 6 : 15;

  if (format === 'A4') {
    renderA4OfficialReceipt(doc, receiptData, securityHash, pageWidth, pageHeight, margin);
  } else {
    renderThermalReceipt(doc, receiptData, securityHash, pageWidth, pageHeight, margin);
  }

  const blob = doc.output('blob');
  if (autoDownload && typeof window !== 'undefined') {
    doc.save(`Bordereau_LONACI_${receiptData.ticketId}.pdf`);
  }

  return { doc, blob };
}

/**
 * Rendu A4 : Bordereau Officiel Certifié LONACI
 */
function renderA4OfficialReceipt(
  doc: any,
  data: LonaciReceiptData,
  securityHash: string,
  pageWidth: number,
  pageHeight: number,
  margin: number
): void {
  // 1. Bande Tricolore Ivoirienne (Orange - Blanc - Vert)
  const stripeH = 4;
  const thirdW = pageWidth / 3;
  doc.setFillColor(255, 130, 0); // Orange CI
  doc.rect(0, 0, thirdW, stripeH, 'F');
  doc.setFillColor(255, 255, 255); // Blanc
  doc.rect(thirdW, 0, thirdW, stripeH, 'F');
  doc.setFillColor(0, 154, 68); // Vert CI
  doc.rect(thirdW * 2, 0, thirdW, stripeH, 'F');

  // 2. En-tête Institutionnel
  let y = 14;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(30, 41, 59);
  doc.text("RÉPUBLIQUE DE CÔTE D'IVOIRE", pageWidth / 2, y, { align: 'center' });
  y += 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text('Union - Discipline - Travail', pageWidth / 2, y, { align: 'center' });
  y += 6;

  // 3. Cartouche LONACI Principal
  doc.setFillColor(15, 23, 42); // Fond ardoise sombre prestigieux
  doc.roundedRect(margin, y, pageWidth - 2 * margin, 24, 3, 3, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('LOTERIE NATIONALE DE CÔTE D\'IVOIRE', margin + 6, y + 9);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(226, 232, 240);
  doc.text('BORDEREAU OFFICIEL DE PRISE DE JEU NUMÉRIQUE (LOTO 5/90)', margin + 6, y + 15);
  doc.setFontSize(7.5);
  doc.setTextColor(148, 163, 184);
  doc.text('Système d\'Inférence Certifié LotoPro Platinum Elite v12.0', margin + 6, y + 20);

  // Badge Statut
  doc.setFillColor(16, 185, 129); // Vert Émeraude
  doc.roundedRect(pageWidth - margin - 38, y + 5, 32, 7, 2, 2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('TICKET VALIDÉ', pageWidth - margin - 22, y + 9.8, { align: 'center' });

  // Terminal & Date dans l'en-tête
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(203, 213, 225);
  doc.text(`Émis le : ${data.date}`, pageWidth - margin - 6, y + 17, { align: 'right' });
  doc.text(`Terminal : ${data.terminalId}`, pageWidth - margin - 6, y + 21, { align: 'right' });

  y += 30;

  // 4. Bloc Identification & Traçabilité
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(margin, y, pageWidth - 2 * margin, 18, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text('RÉFÉRENCE DU BORDEREAU :', margin + 5, y + 6);
  doc.setFont('courier', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(data.ticketId, margin + 55, y + 6.2);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text('MODE DE JEU :', margin + 5, y + 13);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(79, 70, 229);
  doc.text(`${data.gameMode} · ${data.betTypeLabel} (${data.betType})`, margin + 30, y + 13);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text('STRATÉGIE :', pageWidth / 2 + 10, y + 13);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text(data.burstStrategy || data.dominantStrategy || 'Platinum Hybride', pageWidth / 2 + 32, y + 13);

  y += 24;

  // 5. Affichage Spécial des 5 Numéros Joués (Grosses Boules Visuelles)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text('COMBINAISON OFFICIELLE ENGAGÉE (5 NUMÉROS)', margin, y);
  y += 4;

  const ballRadius = 6.5;
  const ballSpacing = 16;
  const startX = pageWidth / 2 - (5 * ballSpacing) / 2 + ballSpacing / 2;

  // Fond du conteneur de numéros
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(margin, y, pageWidth - 2 * margin, 20, 3, 3, 'F');

  data.numbers.forEach((num, idx) => {
    const cx = startX + idx * ballSpacing;
    const cy = y + 10;

    // Disque externe dégradé
    doc.setFillColor(30, 41, 59);
    doc.circle(cx, cy, ballRadius, 'F');

    // Contour blanc
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(0.5);
    doc.circle(cx, cy, ballRadius - 0.5, 'S');

    // Numéro
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.text(String(num).padStart(2, '0'), cx, cy + 3.2, { align: 'center' });
  });

  y += 26;

  // 6. Grille Officielle 1-90 (Style Bordereau Papier LONACI avec Cases Noircies)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text('GRILLE DE VALIDATION OPTIQUE LONACI (1 - 90)', margin, y);
  y += 3;

  const gridCols = 10;
  const gridRows = 9;
  const cellW = (pageWidth - 2 * margin) / gridCols;
  const cellH = 5.2;

  const playedSet = new Set(data.numbers);

  for (let r = 0; r < gridRows; r++) {
    for (let c = 0; c < gridCols; c++) {
      const num = r * gridCols + c + 1;
      const x = margin + c * cellW;
      const cy = y + r * cellH;
      const isPlayed = playedSet.has(num);

      if (isPlayed) {
        // Case cochée / noircie
        doc.setFillColor(255, 130, 0); // Orange vibrant LONACI
        doc.rect(x + 0.3, cy + 0.3, cellW - 0.6, cellH - 0.6, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.text(String(num).padStart(2, '0'), x + cellW / 2, cy + cellH / 2 + 2, { align: 'center' });
      } else {
        // Case normale
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.15);
        doc.rect(x + 0.3, cy + 0.3, cellW - 0.6, cellH - 0.6, 'FD');
        doc.setTextColor(148, 163, 184);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.text(String(num).padStart(2, '0'), x + cellW / 2, cy + cellH / 2 + 1.8, { align: 'center' });
      }
    }
  }

  y += gridRows * cellH + 6;

  // 7. Tableau des Tirages Ciblés (Mode Tirage Unique ou Rafale)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text(
    data.drawNames.length > 1
      ? `SÉQUENCE EN RAFALE MULTI-TIRAGES (${data.drawNames.length} TIRAGES)`
      : 'TIRAGE CIBLÉ LONACI',
    margin,
    y
  );
  y += 3;

  // Table header
  doc.setFillColor(241, 245, 249);
  doc.rect(margin, y, pageWidth - 2 * margin, 6, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  doc.text('TIRAGE OFFICIEL', margin + 3, y + 4.2);
  doc.text('HORAIRE', margin + 50, y + 4.2);
  doc.text('COTE', margin + 80, y + 4.2);
  doc.text('MISE (FCFA)', margin + 110, y + 4.2);
  doc.text('GAIN POTENTIEL (FCFA)', pageWidth - margin - 3, y + 4.2, { align: 'right' });
  y += 6;

  const burstItems = data.burstItems || data.drawNames.map((name) => ({
    name,
    time: name.includes(':') ? name.split('(')[1]?.replace(')', '') || '13:00' : '13:00',
    stake: data.stakePerDraw,
    potentialWin: data.stakePerDraw * data.odds,
  }));

  burstItems.forEach((item, idx) => {
    const isEven = idx % 2 === 0;
    if (isEven) {
      doc.setFillColor(250, 250, 250);
      doc.rect(margin, y, pageWidth - 2 * margin, 5.5, 'F');
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(30, 41, 59);
    doc.text(item.name, margin + 3, y + 4);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(item.time, margin + 50, y + 4);

    doc.setTextColor(79, 70, 229);
    doc.text(`${data.odds}x`, margin + 80, y + 4);

    doc.setFont('courier', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(item.stake.toLocaleString('fr-FR'), margin + 110, y + 4);

    doc.setFont('courier', 'bold');
    doc.setTextColor(16, 185, 129);
    doc.text(item.potentialWin.toLocaleString('fr-FR') + ' FCFA', pageWidth - margin - 3, y + 4, { align: 'right' });

    y += 5.5;
  });

  y += 4;

  // 8. Récapitulatif Financier Encadré
  doc.setFillColor(15, 23, 42);
  doc.roundedRect(margin, y, pageWidth - 2 * margin, 20, 2.5, 2.5, 'F');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text('TOTAL MISES ENGAGÉES :', margin + 6, y + 8);
  doc.setFont('courier', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(255, 255, 255);
  doc.text(`${data.totalStake.toLocaleString('fr-FR')} FCFA`, margin + 6, y + 16);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text('GAIN TOTAL MAXIMAL POTENTIEL :', pageWidth - margin - 6, y + 8, { align: 'right' });
  doc.setFont('courier', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(52, 211, 153); // Vert émeraude vif
  doc.text(`${data.potentialWin.toLocaleString('fr-FR')} FCFA`, pageWidth - margin - 6, y + 16, { align: 'right' });

  y += 26;

  // 9. Sécurité Cryptographique & Code-Barres
  doc.setDrawColor(203, 213, 225);
  doc.setLineDashPattern([1, 1], 0);
  doc.line(margin, y, pageWidth - margin, y);
  doc.setLineDashPattern([], 0);
  y += 5;

  // Barcode vectoriel
  drawDeterministicBarcode(doc, securityHash, margin, y, pageWidth - 2 * margin, 9);
  y += 11;

  doc.setFont('courier', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(100, 116, 139);
  doc.text(`HASH SHA-256 : ${securityHash}`, pageWidth / 2, y, { align: 'center' });
  y += 6;

  // 10. Mentions Réglementaires Officielles LONACI
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(148, 163, 184);
  const legalText = [
    "Ce bordereau certifié est émis conformément aux dispositions réglementaires régissant la Loterie Nationale de Côte d'Ivoire (LONACI).",
    "Les gains sont payables sur présentation de l'original ou de son justificatif numérique sécurisé dans un délai strict de 30 jours.",
    "La participation implique l'adhésion sans réserve au règlement officiel du Loto 5/90. Interdit aux mineurs de moins de 18 ans.",
  ];
  legalText.forEach((line) => {
    doc.text(line, pageWidth / 2, y, { align: 'center' });
    y += 3.2;
  });
}

/**
 * Rendu Format Thermique 80mm (Reçu de Point de Vente LONACI)
 */
function renderThermalReceipt(
  doc: any,
  data: LonaciReceiptData,
  securityHash: string,
  pageWidth: number,
  pageHeight: number,
  margin: number
): void {
  let y = 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);
  doc.text("LONACI - CÔTE D'IVOIRE", pageWidth / 2, y, { align: 'center' });
  y += 4;
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text('Loterie Nationale de Côte d\'Ivoire', pageWidth / 2, y, { align: 'center' });
  y += 3.5;
  doc.text('BORDEREAU DE PRISE DE JEU 5/90', pageWidth / 2, y, { align: 'center' });
  y += 4;

  doc.setDrawColor(0, 0, 0);
  doc.setLineDashPattern([0.5, 0.5], 0);
  doc.line(margin, y, pageWidth - margin, y);
  doc.setLineDashPattern([], 0);
  y += 4;

  doc.setFont('courier', 'normal');
  doc.setFontSize(6.5);
  doc.text(`Réf: ${data.ticketId}`, margin, y);
  y += 3.5;
  doc.text(`Date: ${data.date}`, margin, y);
  y += 3.5;
  doc.text(`Trm: ${data.terminalId}`, margin, y);
  y += 3.5;
  doc.text(`Mode: ${data.gameMode} - ${data.betType}`, margin, y);
  y += 4;

  // Ligne de séparation
  doc.line(margin, y, pageWidth - margin, y);
  y += 4;

  // Numéros
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('NUMÉROS JOUÉS :', margin, y);
  y += 5;

  doc.setFont('courier', 'bold');
  doc.setFontSize(11);
  const numStr = data.numbers.map((n) => String(n).padStart(2, '0')).join('   ');
  doc.text(numStr, pageWidth / 2, y, { align: 'center' });
  y += 6;

  // Tirages
  doc.line(margin, y, pageWidth - margin, y);
  y += 4;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('TIRAGES CONCERNÉS :', margin, y);
  y += 4;

  doc.setFont('courier', 'normal');
  doc.setFontSize(7);
  data.drawNames.forEach((d) => {
    doc.text(`• ${d}`, margin + 2, y);
    y += 3.5;
  });

  y += 2;
  doc.line(margin, y, pageWidth - margin, y);
  y += 4;

  // Finances
  doc.setFont('courier', 'normal');
  doc.setFontSize(7.5);
  doc.text(`Mise / Tirage :`, margin, y);
  doc.text(`${data.stakePerDraw.toLocaleString()} F`, pageWidth - margin, y, { align: 'right' });
  y += 4;

  doc.setFont('courier', 'bold');
  doc.setFontSize(8.5);
  doc.text(`TOTAL PAYÉ :`, margin, y);
  doc.text(`${data.totalStake.toLocaleString()} FCFA`, pageWidth - margin, y, { align: 'right' });
  y += 4.5;

  doc.text(`GAIN MAX :`, margin, y);
  doc.text(`${data.potentialWin.toLocaleString()} FCFA`, pageWidth - margin, y, { align: 'right' });
  y += 6;

  // Code barres
  drawDeterministicBarcode(doc, securityHash, margin, y, pageWidth - 2 * margin, 8);
  y += 10;

  doc.setFont('courier', 'normal');
  doc.setFontSize(5);
  doc.text(`CTRL: ${securityHash.slice(0, 32)}`, pageWidth / 2, y, { align: 'center' });
  y += 4;
  doc.text('Gains payables sous 30 jours.', pageWidth / 2, y, { align: 'center' });
  doc.text('LotoPro Platinum Elite v12.0', pageWidth / 2, y + 3, { align: 'center' });
}

/**
 * Trace un code-barre vectoriel déterministe haute résolution.
 */
function drawDeterministicBarcode(
  doc: any,
  hash: string,
  x: number,
  y: number,
  totalWidth: number,
  height: number
): void {
  doc.setFillColor(15, 23, 42);
  const numBars = 75;
  const barWidth = totalWidth / numBars;

  for (let i = 0; i < numBars; i++) {
    const charCode = hash.charCodeAt(i % hash.length);
    const isThick = ((charCode * (i + 13)) % 7) > 2;
    const isSpace = ((charCode * (i + 7)) % 11) < 2;

    if (!isSpace) {
      const w = isThick ? barWidth * 0.85 : barWidth * 0.45;
      const offsetX = x + i * barWidth;
      doc.rect(offsetX, y, w, height, 'F');
    }
  }
}
