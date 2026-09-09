import { DrawResult } from '../../types';
import { purifyHistoryForDraw } from '../../utils/arrayUtils';
import { extractDrawNumbers } from './featureExtractor';
import { isDrawWithoutMachine, getBoulonnierForDraw, BoulonnierInfo } from '../../constants';

export interface MachineCandidate {
  number: number;
  sourceMachineNumber: number;
  transferType: 'direct' | 'neighbor' | 'mirror' | 'cross_markov' | 'boulonnier_shared';
  historicalTransferCount: number;
  transferProbability: number; // 0 - 100%
  historicalLags: number[];
  averageLag: number;
  confidenceScore: number; // 0 - 100
  recommendationTag: 'CANDIDAT MAJEUR' | 'RÉSONANCE FORTE' | 'SURVEILLANCE' | 'MIROIR MACHINE' | 'BOULONNIER PHYSIQUE';
}

export interface MachineTransferPair {
  machineNum: number;
  winnerNum: number;
  coOccurrenceCount: number;
  affinityRatio: number;
}

export interface BoulonnierMechanicalReport {
  boulonnierInfo: BoulonnierInfo;
  siblingDraws: string[];
  totalBoulonnierEvents: number;
  interSessionTransferRate: number; // % of consecutive sessions on this machine where machine/winner carry-over occurred
  latestPhysicalSession: {
    drawName: string;
    date?: string;
    winners: number[];
    machine: number[];
  } | null;
  mechanicalFrequencies: { number: number; count: number; zScore: number; sector: number }[];
  boulonnierCandidates: MachineCandidate[];
  mechanicalRemark: string;
}

export interface MachineTransferReport {
  drawName: string;
  totalDrawsWithMachine: number;
  directTransferRate: number; // % of draws with >= 1 direct transfer
  meanTransfersPerDraw: number;
  hasMachineData: boolean;
  latestMachineNumbers: number[];
  topHistoricalTransfers: { number: number; transfersToWinnersCount: number; totalMachineAppearances: number; conversionRate: number }[];
  activeSieveCandidates: MachineCandidate[];
  crossAffinityMatrix: MachineTransferPair[];
  lagDistribution: { lag1: number; lag2: number; lag3: number; lag4Plus: number };
  diagnosticRemark: string;
  boulonnierReport: BoulonnierMechanicalReport;
}

const getMirrorNumber = (n: number): number => {
  if (n < 10) return n * 10 <= 90 ? n * 10 : n;
  const s = String(n);
  const rev = Number(s.split('').reverse().join(''));
  return !isNaN(rev) && rev >= 1 && rev <= 90 ? rev : n;
};

/**
 * Calcule l'analyse mécanique consolidée pour l'ensemble des tirages partageant le même Boulonnier physique.
 */
export const calculateBoulonnierMechanicalReport = (
  drawName: string,
  rawHistory: DrawResult[]
): BoulonnierMechanicalReport => {
  const boulonnierInfo = getBoulonnierForDraw(drawName);
  const siblingSet = new Set(boulonnierInfo.draws.map(d => d.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()));

  // Filtrer l'historique chronologique pour tous les tirages exécutés sur ce boulonnier
  const boulonnierHistory = rawHistory.filter(draw => {
    const dName = (draw.drawName || draw.draw_name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    return siblingSet.has(dName);
  });

  const totalEvents = boulonnierHistory.length;
  const siblingDraws = boulonnierInfo.draws;

  if (totalEvents === 0) {
    return {
      boulonnierInfo,
      siblingDraws,
      totalBoulonnierEvents: 0,
      interSessionTransferRate: 0,
      latestPhysicalSession: null,
      mechanicalFrequencies: [],
      boulonnierCandidates: [],
      mechanicalRemark: `Aucune session historique trouvée pour le ${boulonnierInfo.name}.`,
    };
  }

  // Dernière session physique passée sur cette machine mécanique
  const latestDraw = boulonnierHistory[0];
  const latestNums = extractDrawNumbers(latestDraw);
  const latestPhysicalSession = {
    drawName: latestDraw.drawName || latestDraw.draw_name || drawName,
    date: latestDraw.date,
    winners: latestNums.winners,
    machine: latestNums.machine,
  };

  // 1. Comptage des fréquences globales sur cette machine physique (Détection des biais de plateau/rotor)
  const hitCounts = new Array(91).fill(0);
  const machineHits = new Array(91).fill(0);
  let evaluatedTransfers = 0;
  let successfulTransfers = 0;

  for (let i = 0; i < totalEvents; i++) {
    const { winners, machine } = extractDrawNumbers(boulonnierHistory[i]);
    winners.forEach(w => { if (w >= 1 && w <= 90) hitCounts[w]++; });
    machine.forEach(m => { if (m >= 1 && m <= 90) machineHits[m]++; });

    // Transfert inter-sessions consécutives sur le même appareil mécanique
    if (i < totalEvents - 1) {
      const prevSession = extractDrawNumbers(boulonnierHistory[i + 1]);
      if (prevSession.machine.length > 0 && winners.length > 0) {
        evaluatedTransfers++;
        const hasCarry = prevSession.machine.some(m => winners.includes(m));
        if (hasCarry) successfulTransfers++;
      }
    }
  }

  const interSessionTransferRate = evaluatedTransfers > 0 ? (successfulTransfers / evaluatedTransfers) * 100 : 0;

  // Calcul du Z-Score mécanique par numéro (zéro nombre magique)
  const pSingle = 5 / 90;
  const expectedHits = totalEvents * pSingle;
  const stdDev = Math.max(Number.EPSILON, Math.sqrt(totalEvents * pSingle * (1 - pSingle)));

  const mechanicalFrequencies: { number: number; count: number; zScore: number; sector: number }[] = [];
  for (let n = 1; n <= 90; n++) {
    const count = hitCounts[n];
    const zScore = (count - expectedHits) / stdDev;
    const sector = Math.ceil(n / 18); // 5 secteurs de 18 numéros
    mechanicalFrequencies.push({ number: n, count, zScore, sector });
  }

  // Candidats issus de la dernière session du même boulonnier
  const boulonnierCandidates: MachineCandidate[] = [];
  const processed = new Set<number>();

  // Numéros machine et gagnants de la toute dernière session physique du boulonnier
  const activePhysicalSource = [...latestNums.machine, ...latestNums.winners];
  
  activePhysicalSource.forEach(num => {
    if (num >= 1 && num <= 90 && !processed.has(num)) {
      processed.add(num);
      const isMachineSource = latestNums.machine.includes(num);
      const z = mechanicalFrequencies[num - 1]?.zScore || 0;
      const prob = Math.min(95, Math.max(10, Math.round(50 + z * 15 + (isMachineSource ? 15 : 0))));
      
      boulonnierCandidates.push({
        number: num,
        sourceMachineNumber: num,
        transferType: 'boulonnier_shared',
        historicalTransferCount: machineHits[num] || 0,
        transferProbability: prob,
        historicalLags: [1],
        averageLag: 1.0,
        confidenceScore: Math.min(98, Math.max(20, Math.round(prob * 1.05))),
        recommendationTag: 'BOULONNIER PHYSIQUE',
      });
    }
  });

  boulonnierCandidates.sort((a, b) => b.confidenceScore - a.confidenceScore);

  let mechanicalRemark = `Topologie Matérielle : ${boulonnierInfo.name}. `;
  if (interSessionTransferRate >= 25) {
    mechanicalRemark += `Forte résonance mécanique inter-séances (${interSessionTransferRate.toFixed(1)}%). Le rotor conserve une inertie cinématique active entre tirages affiliés.`;
  } else {
    mechanicalRemark += `Comportement mécanique stable (${interSessionTransferRate.toFixed(1)}% de transfert inter-séances sur ${totalEvents} tirages de l'appareil).`;
  }

  return {
    boulonnierInfo,
    siblingDraws,
    totalBoulonnierEvents: totalEvents,
    interSessionTransferRate,
    latestPhysicalSession,
    mechanicalFrequencies: mechanicalFrequencies.sort((a, b) => b.zScore - a.zScore).slice(0, 10),
    boulonnierCandidates: boulonnierCandidates.slice(0, 6),
    mechanicalRemark,
  };
};

/**
 * Moteur d'Analyse du Transfert Machine -> Gagnants (Zero Magic Numbers)
 */
export const calculateMachineTransferReport = (
  drawName: string,
  rawHistory: DrawResult[]
): MachineTransferReport => {
  const boulonnierReport = calculateBoulonnierMechanicalReport(drawName, rawHistory);

  if (isDrawWithoutMachine(drawName)) {
    return {
      drawName,
      totalDrawsWithMachine: 0,
      directTransferRate: 0,
      meanTransfersPerDraw: 0,
      hasMachineData: false,
      latestMachineNumbers: [],
      topHistoricalTransfers: [],
      activeSieveCandidates: boulonnierReport.boulonnierCandidates,
      crossAffinityMatrix: [],
      lagDistribution: { lag1: 0, lag2: 0, lag3: 0, lag4Plus: 0 },
      diagnosticRemark: `Le tirage officiel ${drawName} ne dispose d'aucun numéro machine (contrairement à Fortune du mercredi). Analyse matérielle basée sur le ${boulonnierReport.boulonnierInfo.shortLabel}.`,
      boulonnierReport,
    };
  }

  const history = purifyHistoryForDraw(drawName, rawHistory);
  const totalDraws = history.length;

  if (totalDraws === 0) {
    return {
      drawName,
      totalDrawsWithMachine: 0,
      directTransferRate: 0,
      meanTransfersPerDraw: 0,
      hasMachineData: false,
      latestMachineNumbers: [],
      topHistoricalTransfers: [],
      activeSieveCandidates: boulonnierReport.boulonnierCandidates,
      crossAffinityMatrix: [],
      lagDistribution: { lag1: 0, lag2: 0, lag3: 0, lag4Plus: 0 },
      diagnosticRemark: `Aucun historique disponible pour ${drawName}.`,
      boulonnierReport,
    };
  }

  // Vérification de la présence effective de numéros machine
  let drawsWithMachine = 0;
  for (let i = 0; i < totalDraws; i++) {
    const { machine } = extractDrawNumbers(history[i]);
    if (machine.length > 0) drawsWithMachine++;
  }

  const latestDraw = history[0];
  const latestMachine = latestDraw ? extractDrawNumbers(latestDraw).machine : [];

  if (drawsWithMachine < 3) {
    return {
      drawName,
      totalDrawsWithMachine: drawsWithMachine,
      directTransferRate: 0,
      meanTransfersPerDraw: 0,
      hasMachineData: false,
      latestMachineNumbers: latestMachine,
      topHistoricalTransfers: [],
      activeSieveCandidates: boulonnierReport.boulonnierCandidates,
      crossAffinityMatrix: [],
      lagDistribution: { lag1: 0, lag2: 0, lag3: 0, lag4Plus: 0 },
      diagnosticRemark: `Le tirage ${drawName} ne comporte pas de plateau Machine régulier dans son historique.`,
      boulonnierReport,
    };
  }

  // Statistiques de transfert
  const machineAppearances = new Array(91).fill(0);
  const transferCounts = new Array(91).fill(0);
  const lagCounts = { lag1: 0, lag2: 0, lag3: 0, lag4Plus: 0 };
  const crossMatrix: Record<string, number> = {};

  let drawsWithAtLeastOneTransfer = 0;
  let totalTransfersSum = 0;
  let evaluatedSteps = 0;

  for (let t = 0; t < totalDraws - 1; t++) {
    const current = extractDrawNumbers(history[t]);
    const prev = extractDrawNumbers(history[t + 1]);

    if (prev.machine.length === 0 || current.winners.length === 0) continue;

    evaluatedSteps++;
    prev.machine.forEach((m) => machineAppearances[m]++);

    const currentWinnersSet = new Set(current.winners);
    let stepTransfers = 0;

    prev.machine.forEach((m) => {
      if (currentWinnersSet.has(m)) {
        transferCounts[m]++;
        stepTransfers++;
        lagCounts.lag1++;
      }

      // Matrice de transition Machine -> Gagnants
      current.winners.forEach((w) => {
        const key = `${m}->${w}`;
        crossMatrix[key] = (crossMatrix[key] || 0) + 1;
      });
    });

    // Recherche de lags plus profonds (lag 2 et 3)
    if (t < totalDraws - 3) {
      const prev2 = extractDrawNumbers(history[t + 2]);
      const prev3 = extractDrawNumbers(history[t + 3]);

      prev2.machine.forEach((m) => {
        if (currentWinnersSet.has(m) && !prev.machine.includes(m)) {
          lagCounts.lag2++;
        }
      });

      prev3.machine.forEach((m) => {
        if (currentWinnersSet.has(m) && !prev.machine.includes(m) && !prev2.machine.includes(m)) {
          lagCounts.lag3++;
        }
      });
    }

    if (stepTransfers > 0) drawsWithAtLeastOneTransfer++;
    totalTransfersSum += stepTransfers;
  }

  const directTransferRate = evaluatedSteps > 0 ? (drawsWithAtLeastOneTransfer / evaluatedSteps) * 100 : 0;
  const meanTransfersPerDraw = evaluatedSteps > 0 ? totalTransfersSum / evaluatedSteps : 0;

  // Top transferts historiques
  const topHistoricalTransfers: { number: number; transfersToWinnersCount: number; totalMachineAppearances: number; conversionRate: number }[] = [];
  for (let n = 1; n <= 90; n++) {
    if (machineAppearances[n] >= 2) {
      topHistoricalTransfers.push({
        number: n,
        transfersToWinnersCount: transferCounts[n],
        totalMachineAppearances: machineAppearances[n],
        conversionRate: (transferCounts[n] / machineAppearances[n]) * 100,
      });
    }
  }
  topHistoricalTransfers.sort((a, b) => b.transfersToWinnersCount - a.transfersToWinnersCount || b.conversionRate - a.conversionRate);

  // Matrice des paires croisées significatives
  const crossAffinityMatrix: MachineTransferPair[] = Object.entries(crossMatrix)
    .map(([key, count]) => {
      const [mStr, wStr] = key.split('->');
      const machineNum = Number(mStr);
      const winnerNum = Number(wStr);
      const totalM = machineAppearances[machineNum] || 1;
      return {
        machineNum,
        winnerNum,
        coOccurrenceCount: count,
        affinityRatio: count / totalM,
      };
    })
    .filter((p) => p.coOccurrenceCount >= 2)
    .sort((a, b) => b.coOccurrenceCount - a.coOccurrenceCount)
    .slice(0, 15);

  // 4. Construction du Crible Actif (Candidats pour le Prochain Tirage)
  const activeSieveCandidates: MachineCandidate[] = [];
  const processedNumbers = new Set<number>();

  latestMachine.forEach((m) => {
    const totalApps = machineAppearances[m] || 1;
    const directTrans = transferCounts[m] || 0;
    const convRate = (directTrans / totalApps) * 100;
    const conf = Math.min(99, Math.round(convRate * 1.5 + (directTrans >= 2 ? 25 : 10)));

    let tag: 'CANDIDAT MAJEUR' | 'RÉSONANCE FORTE' | 'SURVEILLANCE' | 'MIROIR MACHINE' | 'BOULONNIER PHYSIQUE' = 'SURVEILLANCE';
    if (directTrans >= 3 || convRate >= 40) tag = 'CANDIDAT MAJEUR';
    else if (directTrans >= 1 || convRate >= 20) tag = 'RÉSONANCE FORTE';

    if (!processedNumbers.has(m)) {
      processedNumbers.add(m);
      activeSieveCandidates.push({
        number: m,
        sourceMachineNumber: m,
        transferType: 'direct',
        historicalTransferCount: directTrans,
        transferProbability: Math.min(100, Math.round(convRate)),
        historicalLags: [1],
        averageLag: 1.0,
        confidenceScore: conf,
        recommendationTag: tag,
      });
    }

    // Candidat Miroir
    const mirror = getMirrorNumber(m);
    if (mirror !== m && !processedNumbers.has(mirror)) {
      processedNumbers.add(mirror);
      activeSieveCandidates.push({
        number: mirror,
        sourceMachineNumber: m,
        transferType: 'mirror',
        historicalTransferCount: transferCounts[mirror] || 0,
        transferProbability: Math.min(100, Math.round(convRate * 0.7)),
        historicalLags: [1, 2],
        averageLag: 1.4,
        confidenceScore: Math.round(conf * 0.75),
        recommendationTag: 'MIROIR MACHINE',
      });
    }

    // Top transitions croisées
    const topTransitions = crossAffinityMatrix
      .filter((p) => p.machineNum === m && p.winnerNum !== m)
      .slice(0, 1);

    topTransitions.forEach((tPair) => {
      if (!processedNumbers.has(tPair.winnerNum)) {
        processedNumbers.add(tPair.winnerNum);
        activeSieveCandidates.push({
          number: tPair.winnerNum,
          sourceMachineNumber: m,
          transferType: 'cross_markov',
          historicalTransferCount: tPair.coOccurrenceCount,
          transferProbability: Math.min(100, Math.round(tPair.affinityRatio * 100)),
          historicalLags: [1],
          averageLag: 1.0,
          confidenceScore: Math.min(95, Math.round(tPair.affinityRatio * 120)),
          recommendationTag: 'RÉSONANCE FORTE',
        });
      }
    });
  });

  // Ajouter les candidats majeurs du Boulonnier partagé s'ils ne sont pas déjà présents
  boulonnierReport.boulonnierCandidates.forEach(cand => {
    if (!processedNumbers.has(cand.number)) {
      processedNumbers.add(cand.number);
      activeSieveCandidates.push(cand);
    }
  });

  activeSieveCandidates.sort((a, b) => b.confidenceScore - a.confidenceScore);

  // Diagnostic narratif
  let diagnosticRemark = `Analyse du plateau Machine pour ${drawName} (${boulonnierReport.boulonnierInfo.shortLabel}) : `;
  if (directTransferRate >= 20) {
    diagnosticRemark += `Haute résonance de transfert direct (${directTransferRate.toFixed(1)}% des tirages capturent au moins 1 numéro machine au tirage suivant). Le vecteur Machine est un puissant attracteur stochastique.`;
  } else if (directTransferRate >= 10) {
    diagnosticRemark += `Résonance modérée de transfert (${directTransferRate.toFixed(1)}%). Prise en compte prioritaire des leaders de conversion (${topHistoricalTransfers.slice(0, 3).map((t) => t.number).join(', ')}).`;
  } else {
    diagnosticRemark += `Transfert direct diffus (${directTransferRate.toFixed(1)}%). Couplage avec la signature mécanique du ${boulonnierReport.boulonnierInfo.code}.`;
  }

  return {
    drawName,
    totalDrawsWithMachine: drawsWithMachine,
    directTransferRate,
    meanTransfersPerDraw,
    hasMachineData: true,
    latestMachineNumbers: latestMachine,
    topHistoricalTransfers: topHistoricalTransfers.slice(0, 10),
    activeSieveCandidates: activeSieveCandidates.slice(0, 10),
    crossAffinityMatrix,
    lagDistribution: lagCounts,
    diagnosticRemark,
    boulonnierReport,
  };
};
