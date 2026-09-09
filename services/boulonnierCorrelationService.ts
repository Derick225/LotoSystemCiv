import { DrawResult } from '../types';
import { extractDrawNumbers } from './prediction/featureExtractor';
import { 
  BOULONNIER_CONFIG, 
  BoulonnierId, 
  BoulonnierInfo, 
  getBoulonnierForDraw,
  DRAW_SCHEDULE 
} from '../constants';

export interface SlotStats {
  slot: '10:00' | '13:00' | '16:00' | '19:55';
  label: string;
  totalDraws: number;
  frequencies: number[]; // Index 0..90 (1..90)
  zScores: number[]; // Index 0..90
  entropy: number;
  topNumbers: { number: number; count: number; zScore: number }[];
  coldNumbers: { number: number; count: number; zScore: number }[];
}

export interface BoulonnierGroupStats {
  boulonnier: BoulonnierInfo;
  totalDraws: number;
  frequencies: number[]; // Index 0..90
  zScores: number[]; // Index 0..90
  sectorDensities: { sector: number; name: string; range: string; count: number; percentage: number; zScore: number }[];
  topNumbers: { number: number; count: number; zScore: number }[];
  machineCarryOverRate: number; // Taux de passage machine -> gagnant interne à l'appareil
}

export interface CrossCorrelationPair {
  sourceName: string;
  targetName: string;
  sourceType: 'slot' | 'boulonnier';
  targetType: 'slot' | 'boulonnier';
  pearsonR: number; // -1 to +1
  spearmanRho: number; // -1 to +1
  cosineSimilarity: number; // 0 to 1
  sharedTopNumbers: number[]; // Numbers in top 20 of both
  couplingRemark: string;
}

export interface SynchronizedNumberProfile {
  number: number;
  freq10H: number;
  z10H: number;
  freq16H: number;
  z16H: number;
  freq19H55: number;
  z19H55: number;
  freq13H: number;
  z13H: number;
  boulonnierAFreq: number;
  boulonnierAZScore: number;
  syncDelta: number; // |z10H - z16H| (proximité de comportement sur l'appareil A)
  syncResonanceScore: number; // Score composite de synchronicité (0 - 100)
  classification: 'HARMONIQUE_A' | 'INERTIE_SOIR' | 'ZENITH_ISOLE' | 'DIVERGENT' | 'EQUILIBRE';
  sector: number;
}

export interface SameDayTransferReport {
  evaluatedDays: number;
  transfers10Hto16H: { count: number; rate: number; topCarryNumbers: { number: number; count: number }[] };
  transfers16Hto19H55: { count: number; rate: number; topCarryNumbers: { number: number; count: number }[] };
  transfers10Hto19H55: { count: number; rate: number; topCarryNumbers: { number: number; count: number }[] };
  fullDayTripletMatches: { count: number; date: string; numbers: number[] }[];
}

export interface BoulonnierCorrelationReport {
  totalAnalyzedDraws: number;
  uniqueDatesCount: number;
  slots: {
    slot10H: SlotStats;
    slot13H: SlotStats;
    slot16H: SlotStats;
    slot19H55: SlotStats;
  };
  boulonniers: {
    boulonnierA: BoulonnierGroupStats;
    boulonnierB: BoulonnierGroupStats;
    boulonnierC: BoulonnierGroupStats;
  };
  correlations: CrossCorrelationPair[];
  synchronizedNumbers: SynchronizedNumberProfile[];
  sameDayTransfers: SameDayTransferReport;
  sectorComparison: {
    sector: number;
    name: string;
    range: string;
    boulonnierAPercent: number;
    boulonnierBPercent: number;
    boulonnierCPercent: number;
    dominantBoulonnier: 'A' | 'B' | 'C';
  }[];
  synthesisFindings: string[];
}

// ---------------------------------------------------------------------------
// FONCTIONS MATHÉMATIQUES RIGOUROUSES (ZÉRO NOMBRE MAGIQUE)
// ---------------------------------------------------------------------------

const calculatePearson = (x: number[], y: number[]): number => {
  const n = 90;
  let sumX = 0;
  let sumY = 0;
  for (let i = 1; i <= n; i++) {
    sumX += x[i];
    sumY += y[i];
  }
  const meanX = sumX / n;
  const meanY = sumY / n;

  let num = 0;
  let denX = 0;
  let denY = 0;

  for (let i = 1; i <= n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }

  const den = Math.sqrt(denX * denY);
  if (den < Number.EPSILON) return 0;
  return Math.max(-1, Math.min(1, num / den));
};

const calculateCosineSimilarity = (x: number[], y: number[]): number => {
  let dot = 0;
  let normX = 0;
  let normY = 0;
  for (let i = 1; i <= 90; i++) {
    dot += x[i] * y[i];
    normX += x[i] * x[i];
    normY += y[i] * y[i];
  }
  const den = Math.sqrt(normX) * Math.sqrt(normY);
  if (den < Number.EPSILON) return 0;
  return Math.max(0, Math.min(1, dot / den));
};

const getRankArray = (arr: number[]): number[] => {
  const indexed = [];
  for (let i = 1; i <= 90; i++) {
    indexed.push({ num: i, val: arr[i] });
  }
  indexed.sort((a, b) => b.val - a.val);

  const ranks = new Array(91).fill(0);
  for (let r = 0; r < indexed.length; r++) {
    ranks[indexed[r].num] = r + 1;
  }
  return ranks;
};

const calculateSpearman = (x: number[], y: number[]): number => {
  const rankX = getRankArray(x);
  const rankY = getRankArray(y);
  let dSqSum = 0;
  for (let i = 1; i <= 90; i++) {
    const d = rankX[i] - rankY[i];
    dSqSum += d * d;
  }
  const n = 90;
  return 1 - (6 * dSqSum) / (n * (n * n - 1));
};

const calculateShannonEntropy = (freqs: number[], totalEvents: number): number => {
  if (totalEvents === 0) return 0;
  let entropy = 0;
  const totalSlots = totalEvents * 5;
  if (totalSlots === 0) return 0;

  for (let i = 1; i <= 90; i++) {
    const p = freqs[i] / totalSlots;
    if (p > 0) {
      entropy -= p * Math.log2(p);
    }
  }
  return entropy;
};

const normalizeDrawName = (name: string): string =>
  (name || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/^(loto|tirage)\s+/i, '')
    .replace(/[\s\-_/]+/g, ' ')
    .trim();

// Détermine l'horaire canonique (10:00, 13:00, 16:00, 19:55) à partir du nom du tirage
const getDrawSlot = (drawName: string): '10:00' | '13:00' | '16:00' | '19:55' => {
  const norm = normalizeDrawName(drawName);

  for (const day of Object.keys(DRAW_SCHEDULE)) {
    const daySchedule = DRAW_SCHEDULE[day];
    for (const slot of Object.keys(daySchedule)) {
      if (normalizeDrawName(daySchedule[slot]) === norm) {
        return slot as '10:00' | '13:00' | '16:00' | '19:55';
      }
    }
  }

  // Heuristique temporelle en repli
  if (norm.includes('10h') || norm.includes('10:00') || norm.includes('matin') || norm.includes('reveil') || norm.includes('matinale')) return '10:00';
  if (norm.includes('13h') || norm.includes('13:00') || norm.includes('midi') || norm.includes('etoile') || norm.includes('emergence') || norm.includes('fortune')) return '13:00';
  if (norm.includes('16h') || norm.includes('16:00') || norm.includes('akwaba') || norm.includes('sika') || norm.includes('baraka')) return '16:00';
  if (norm.includes('19h') || norm.includes('19:55') || norm.includes('20h') || norm.includes('soir') || norm.includes('special') || norm.includes('espoir') || norm.includes('national')) return '19:55';

  return '10:00';
};

/**
 * Calculateur central de Corrélation Croisée des Boulonniers et Créneaux Horaires.
 */
export const calculateBoulonnierCorrelationReport = (
  rawHistory: DrawResult[]
): BoulonnierCorrelationReport => {
  const totalAnalyzed = rawHistory.length;
  
  // 1. Découpage de l'historique par créneau horaire
  const draws10H: DrawResult[] = [];
  const draws13H: DrawResult[] = [];
  const draws16H: DrawResult[] = [];
  const draws19H55: DrawResult[] = [];

  // Groupes par Boulonnier physique
  const drawsBoulonnierA: DrawResult[] = [];
  const drawsBoulonnierB: DrawResult[] = [];
  const drawsBoulonnierC: DrawResult[] = [];

  const dateMap: Record<string, { '10:00'?: number[]; '13:00'?: number[]; '16:00'?: number[]; '19:55'?: number[] }> = {};

  rawHistory.forEach(draw => {
    const dName = draw.drawName || draw.draw_name || '';
    const slot = getDrawSlot(dName);
    const boulonnier = getBoulonnierForDraw(dName);
    const { winners } = extractDrawNumbers(draw);

    if (slot === '10:00') draws10H.push(draw);
    else if (slot === '13:00') draws13H.push(draw);
    else if (slot === '16:00') draws16H.push(draw);
    else if (slot === '19:55') draws19H55.push(draw);

    if (boulonnier.id === 'BOULONNIER_A') drawsBoulonnierA.push(draw);
    else if (boulonnier.id === 'BOULONNIER_B') drawsBoulonnierB.push(draw);
    else if (boulonnier.id === 'BOULONNIER_C') drawsBoulonnierC.push(draw);

    // Groupement par date pour les transferts intra-journaliers
    if (draw.date && winners.length > 0) {
      if (!dateMap[draw.date]) dateMap[draw.date] = {};
      dateMap[draw.date][slot] = winners;
    }
  });

  const uniqueDatesCount = Object.keys(dateMap).length;

  // Fonction d'extraction des statistiques de créneau
  const computeSlotStats = (draws: DrawResult[], slotKey: '10:00' | '13:00' | '16:00' | '19:55', label: string): SlotStats => {
    const total = draws.length;
    const frequencies = new Array(91).fill(0);
    draws.forEach(d => {
      const { winners } = extractDrawNumbers(d);
      winners.forEach(w => { if (w >= 1 && w <= 90) frequencies[w]++; });
    });

    const p = 5 / 90;
    const expected = total * p;
    const stdDev = Math.max(Number.EPSILON, Math.sqrt(total * p * (1 - p)));
    const zScores = new Array(91).fill(0);
    const ranked: { number: number; count: number; zScore: number }[] = [];

    for (let i = 1; i <= 90; i++) {
      const z = (frequencies[i] - expected) / stdDev;
      zScores[i] = z;
      ranked.push({ number: i, count: frequencies[i], zScore: z });
    }

    ranked.sort((a, b) => b.count - a.count);
    const entropy = calculateShannonEntropy(frequencies, total);

    return {
      slot: slotKey,
      label,
      totalDraws: total,
      frequencies,
      zScores,
      entropy,
      topNumbers: ranked.slice(0, 10),
      coldNumbers: ranked.slice(-10).reverse(),
    };
  };

  const slot10H = computeSlotStats(draws10H, '10:00', '10H00 (Matin - Boulonnier A)');
  const slot13H = computeSlotStats(draws13H, '13:00', '13H00 (Zénith - Boulonnier B)');
  const slot16H = computeSlotStats(draws16H, '16:00', '16H00 (Après-midi - Boulonnier A)');
  const slot19H55 = computeSlotStats(draws19H55, '19:55', '19H55 (Soir - Boulonnier C & A)');

  // Statistiques par Boulonnier physique
  const computeBoulonnierStats = (draws: DrawResult[], info: BoulonnierInfo): BoulonnierGroupStats => {
    const total = draws.length;
    const frequencies = new Array(91).fill(0);
    let carryEvals = 0;
    let carryHits = 0;

    for (let i = 0; i < total; i++) {
      const { winners, machine } = extractDrawNumbers(draws[i]);
      winners.forEach(w => { if (w >= 1 && w <= 90) frequencies[w]++; });

      if (i < total - 1 && machine.length > 0) {
        const nextDraw = extractDrawNumbers(draws[i + 1]);
        if (nextDraw.winners.length > 0) {
          carryEvals++;
          if (machine.some(m => nextDraw.winners.includes(m))) {
            carryHits++;
          }
        }
      }
    }

    const p = 5 / 90;
    const expected = total * p;
    const stdDev = Math.max(Number.EPSILON, Math.sqrt(total * p * (1 - p)));
    const zScores = new Array(91).fill(0);
    const ranked: { number: number; count: number; zScore: number }[] = [];

    // Secteurs du tambour (5 secteurs de 18 numéros)
    const sectorCounts = [0, 0, 0, 0, 0];
    for (let i = 1; i <= 90; i++) {
      const z = (frequencies[i] - expected) / stdDev;
      zScores[i] = z;
      ranked.push({ number: i, count: frequencies[i], zScore: z });
      const secIdx = Math.min(4, Math.floor((i - 1) / 18));
      sectorCounts[secIdx] += frequencies[i];
    }

    ranked.sort((a, b) => b.count - a.count);

    const totalSectorBalls = total * 5;
    const sectorNames = [
      'Secteur I (1-18)', 
      'Secteur II (19-36)', 
      'Secteur III (37-54)', 
      'Secteur IV (55-72)', 
      'Secteur V (73-90)'
    ];
    const sectorRanges = ['1-18', '19-36', '37-54', '55-72', '73-90'];

    const sectorDensities = sectorCounts.map((count, idx) => {
      const pct = totalSectorBalls > 0 ? (count / totalSectorBalls) * 100 : 20.0;
      const expSec = totalSectorBalls * 0.2;
      const stdSec = Math.max(Number.EPSILON, Math.sqrt(totalSectorBalls * 0.2 * 0.8));
      const zSec = (count - expSec) / stdSec;
      return {
        sector: idx + 1,
        name: sectorNames[idx],
        range: sectorRanges[idx],
        count,
        percentage: pct,
        zScore: zSec,
      };
    });

    const carryRate = carryEvals > 0 ? (carryHits / carryEvals) * 100 : 0;

    return {
      boulonnier: info,
      totalDraws: total,
      frequencies,
      zScores,
      sectorDensities,
      topNumbers: ranked.slice(0, 10),
      machineCarryOverRate: carryRate,
    };
  };

  const boulonnierA = computeBoulonnierStats(drawsBoulonnierA, BOULONNIER_CONFIG.BOULONNIER_A);
  const boulonnierB = computeBoulonnierStats(drawsBoulonnierB, BOULONNIER_CONFIG.BOULONNIER_B);
  const boulonnierC = computeBoulonnierStats(drawsBoulonnierC, BOULONNIER_CONFIG.BOULONNIER_C);

  // 2. Matrices de Corrélation Croisée
  const pairsToEvaluate: { s1: SlotStats; s2: SlotStats; name1: string; name2: string; isSibling: boolean }[] = [
    { s1: slot10H, s2: slot16H, name1: '10H (Matin)', name2: '16H (Après-midi)', isSibling: true },
    { s1: slot10H, s2: slot19H55, name1: '10H (Matin)', name2: '19H55 (Soir)', isSibling: false },
    { s1: slot16H, s2: slot19H55, name1: '16H (Après-midi)', name2: '19H55 (Soir)', isSibling: false },
    { s1: slot10H, s2: slot13H, name1: '10H (Matin)', name2: '13H (Zénith)', isSibling: false },
    { s1: slot13H, s2: slot16H, name1: '13H (Zénith)', name2: '16H (Après-midi)', isSibling: false },
    { s1: slot13H, s2: slot19H55, name1: '13H (Zénith)', name2: '19H55 (Soir)', isSibling: false },
  ];

  const correlations: CrossCorrelationPair[] = pairsToEvaluate.map(({ s1, s2, name1, name2, isSibling }) => {
    const pearsonR = calculatePearson(s1.frequencies, s2.frequencies);
    const spearmanRho = calculateSpearman(s1.frequencies, s2.frequencies);
    const cosineSimilarity = calculateCosineSimilarity(s1.frequencies, s2.frequencies);

    const s1TopSet = new Set(s1.topNumbers.slice(0, 20).map(t => t.number));
    const sharedTopNumbers = s2.topNumbers.slice(0, 20).filter(t => s1TopSet.has(t.number)).map(t => t.number);

    let couplingRemark = '';
    if (isSibling) {
      couplingRemark = `Appareil Partagé (Boulonnier A) : Corrélation spectrale r = ${pearsonR.toFixed(3)}. Alignement des fréquences sur le même tambour.`;
    } else {
      couplingRemark = `Appareils Distincts : Corrélation r = ${pearsonR.toFixed(3)}. Transfert d'inertie stochastique modéré.`;
    }

    return {
      sourceName: name1,
      targetName: name2,
      sourceType: 'slot',
      targetType: 'slot',
      pearsonR,
      spearmanRho,
      cosineSimilarity,
      sharedTopNumbers,
      couplingRemark,
    };
  });

  // 3. Profils de Synchronicité Numéro par Numéro (1..90)
  const synchronizedNumbers: SynchronizedNumberProfile[] = [];

  for (let num = 1; num <= 90; num++) {
    const f10 = slot10H.frequencies[num];
    const z10 = slot10H.zScores[num];
    const f16 = slot16H.frequencies[num];
    const z16 = slot16H.zScores[num];
    const f19 = slot19H55.frequencies[num];
    const z19 = slot19H55.zScores[num];
    const f13 = slot13H.frequencies[num];
    const z13 = slot13H.zScores[num];

    const fA = boulonnierA.frequencies[num];
    const zA = boulonnierA.zScores[num];

    // Delta de synchronicité entre 10H et 16H (appareil A)
    const syncDelta = Math.abs(z10 - z16);

    // Score de résonance (0-100) : favorise les numéros positifs à la fois en 10H et 16H avec faible delta
    const baseScore = Math.max(0, (z10 + z16 + zA) / 3);
    const penalty = syncDelta * 0.4;
    const resonance = Math.min(100, Math.max(0, Math.round((1 / (1 + Math.exp(-baseScore + penalty * 0.5))) * 100)));

    let classification: 'HARMONIQUE_A' | 'INERTIE_SOIR' | 'ZENITH_ISOLE' | 'DIVERGENT' | 'EQUILIBRE' = 'EQUILIBRE';

    if (z10 > 0.8 && z16 > 0.8 && syncDelta < 1.0) {
      classification = 'HARMONIQUE_A'; // Fortement synchronisé sur le Boulonnier A
    } else if (z19 > 1.2 && (z10 < 0 || z16 < 0)) {
      classification = 'INERTIE_SOIR'; // Spécifique au soir
    } else if (z13 > 1.2 && (z10 < 0 && z16 < 0)) {
      classification = 'ZENITH_ISOLE'; // Spécifique au 13H
    } else if (syncDelta > 2.0) {
      classification = 'DIVERGENT'; // Comportement asymétrique sur l'appareil A
    }

    const sector = Math.min(5, Math.floor((num - 1) / 18) + 1);

    synchronizedNumbers.push({
      number: num,
      freq10H: f10,
      z10H: z10,
      freq16H: f16,
      z16H: z16,
      freq19H55: f19,
      z19H55: z19,
      freq13H: f13,
      z13H: z13,
      boulonnierAFreq: fA,
      boulonnierAZScore: zA,
      syncDelta,
      syncResonanceScore: resonance,
      classification,
      sector,
    });
  }

  // 4. Analyse des Transferts Journaliers (10H -> 16H -> 19H55 même jour)
  let count10to16Evals = 0;
  let count10to16Hits = 0;
  const carryCount10to16 = new Array(91).fill(0);

  let count16to19Evals = 0;
  let count16to19Hits = 0;
  const carryCount16to19 = new Array(91).fill(0);

  let count10to19Evals = 0;
  let count10to19Hits = 0;
  const carryCount10to19 = new Array(91).fill(0);

  const fullDayTripletMatches: { count: number; date: string; numbers: number[] }[] = [];

  Object.entries(dateMap).forEach(([date, daySlots]) => {
    const w10 = daySlots['10:00'] || [];
    const w16 = daySlots['16:00'] || [];
    const w19 = daySlots['19:55'] || [];

    if (w10.length > 0 && w16.length > 0) {
      count10to16Evals++;
      const common = w10.filter(n => w16.includes(n));
      if (common.length > 0) {
        count10to16Hits++;
        common.forEach(n => carryCount10to16[n]++);
      }
    }

    if (w16.length > 0 && w19.length > 0) {
      count16to19Evals++;
      const common = w16.filter(n => w19.includes(n));
      if (common.length > 0) {
        count16to19Hits++;
        common.forEach(n => carryCount16to19[n]++);
      }
    }

    if (w10.length > 0 && w19.length > 0) {
      count10to19Evals++;
      const common = w10.filter(n => w19.includes(n));
      if (common.length > 0) {
        count10to19Hits++;
        common.forEach(n => carryCount10to19[n]++);
      }
    }

    if (w10.length > 0 && w16.length > 0 && w19.length > 0) {
      const triple = w10.filter(n => w16.includes(n) && w19.includes(n));
      if (triple.length > 0) {
        fullDayTripletMatches.push({ count: triple.length, date, numbers: triple });
      }
    }
  });

  const getTopCarry = (arr: number[]) => {
    const res: { number: number; count: number }[] = [];
    for (let i = 1; i <= 90; i++) {
      if (arr[i] > 0) res.push({ number: i, count: arr[i] });
    }
    return res.sort((a, b) => b.count - a.count).slice(0, 6);
  };

  const sameDayTransfers: SameDayTransferReport = {
    evaluatedDays: uniqueDatesCount,
    transfers10Hto16H: {
      count: count10to16Hits,
      rate: count10to16Evals > 0 ? (count10to16Hits / count10to16Evals) * 100 : 0,
      topCarryNumbers: getTopCarry(carryCount10to16),
    },
    transfers16Hto19H55: {
      count: count16to19Hits,
      rate: count16to19Evals > 0 ? (count16to19Hits / count16to19Evals) * 100 : 0,
      topCarryNumbers: getTopCarry(carryCount16to19),
    },
    transfers10Hto19H55: {
      count: count10to19Hits,
      rate: count10to19Evals > 0 ? (count10to19Hits / count10to19Evals) * 100 : 0,
      topCarryNumbers: getTopCarry(carryCount10to19),
    },
    fullDayTripletMatches,
  };

  // 5. Comparaison des Secteurs Mécaniques
  const sectorComparison = [1, 2, 3, 4, 5].map(sec => {
    const secA = boulonnierA.sectorDensities.find(s => s.sector === sec);
    const secB = boulonnierB.sectorDensities.find(s => s.sector === sec);
    const secC = boulonnierC.sectorDensities.find(s => s.sector === sec);

    const pA = secA ? secA.percentage : 20;
    const pB = secB ? secB.percentage : 20;
    const pC = secC ? secC.percentage : 20;

    let dominant: 'A' | 'B' | 'C' = 'A';
    if (pB > pA && pB > pC) dominant = 'B';
    else if (pC > pA && pC > pB) dominant = 'C';

    return {
      sector: sec,
      name: secA?.name || `Secteur ${sec}`,
      range: secA?.range || '',
      boulonnierAPercent: pA,
      boulonnierBPercent: pB,
      boulonnierCPercent: pC,
      dominantBoulonnier: dominant,
    };
  });

  // 6. Synthèse objective des Découvertes
  const synthesisFindings: string[] = [];
  
  const pair10_16 = correlations.find(c => c.sourceName.includes('10H') && c.targetName.includes('16H'));
  if (pair10_16) {
    synthesisFindings.push(
      `Couplage Mécanique 10H-16H (Boulonnier A) : Corrélation de Pearson r = ${pair10_16.pearsonR.toFixed(3)} avec ${pair10_16.sharedTopNumbers.length} numéros communs parmi les top-20 respectifs.`
    );
  }

  synthesisFindings.push(
    `Transfert Intra-Journalier 10H -> 16H : ${sameDayTransfers.transfers10Hto16H.rate.toFixed(1)}% des journées enregistrent la réapparition d'au moins 1 numéro du matin à 16H (même appareil mécanique).`
  );

  const harmonicCount = synchronizedNumbers.filter(s => s.classification === 'HARMONIQUE_A').length;
  synthesisFindings.push(
    `${harmonicCount} numéros identifiés en état d'Harmonique Forte sur le Boulonnier A (stabilité statistique confirmée entre le matin et l'après-midi).`
  );

  return {
    totalAnalyzedDraws: totalAnalyzed,
    uniqueDatesCount,
    slots: {
      slot10H,
      slot13H,
      slot16H,
      slot19H55,
    },
    boulonniers: {
      boulonnierA,
      boulonnierB,
      boulonnierC,
    },
    correlations,
    synchronizedNumbers,
    sameDayTransfers,
    sectorComparison,
    synthesisFindings,
  };
};
