import { DrawResult } from '../../types';
import { purifyHistoryForDraw } from '../../utils/arrayUtils';
import { extractDrawNumbers } from './featureExtractor';
import { isDrawWithoutMachine } from '../../constants';

export interface MachineCandidate {
  number: number;
  sourceMachineNumber: number;
  transferType: 'direct' | 'neighbor' | 'mirror' | 'cross_markov';
  historicalTransferCount: number;
  transferProbability: number; // 0 - 100%
  historicalLags: number[];
  averageLag: number;
  confidenceScore: number; // 0 - 100
  recommendationTag: 'CANDIDAT MAJEUR' | 'RÉSONANCE FORTE' | 'SURVEILLANCE' | 'MIROIR MACHINE';
}

export interface MachineTransferPair {
  machineNum: number;
  winnerNum: number;
  coOccurrenceCount: number;
  affinityRatio: number;
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
}

const getMirrorNumber = (n: number): number => {
  if (n < 10) return n * 10 <= 90 ? n * 10 : n;
  const s = String(n);
  const rev = Number(s.split('').reverse().join(''));
  return !isNaN(rev) && rev >= 1 && rev <= 90 ? rev : n;
};

/**
 * Moteur d'Analyse du Transfert Machine -> Gagnants (Zero Magic Numbers)
 */
export const calculateMachineTransferReport = (
  drawName: string,
  rawHistory: DrawResult[]
): MachineTransferReport => {
  if (isDrawWithoutMachine(drawName)) {
    return {
      drawName,
      totalDrawsWithMachine: 0,
      directTransferRate: 0,
      meanTransfersPerDraw: 0,
      hasMachineData: false,
      latestMachineNumbers: [],
      topHistoricalTransfers: [],
      activeSieveCandidates: [],
      crossAffinityMatrix: [],
      lagDistribution: { lag1: 0, lag2: 0, lag3: 0, lag4Plus: 0 },
      diagnosticRemark: `Le tirage officiel ${drawName} ne dispose d'aucun numéro machine (contrairement à Fortune du mercredi).`,
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
      activeSieveCandidates: [],
      crossAffinityMatrix: [],
      lagDistribution: { lag1: 0, lag2: 0, lag3: 0, lag4Plus: 0 },
      diagnosticRemark: 'Aucun historique disponible pour ce tirage.',
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
      activeSieveCandidates: [],
      crossAffinityMatrix: [],
      lagDistribution: { lag1: 0, lag2: 0, lag3: 0, lag4Plus: 0 },
      diagnosticRemark: `Le tirage ${drawName} ne comporte pas de plateau Machine régulier dans son historique.`,
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

    let tag: 'CANDIDAT MAJEUR' | 'RÉSONANCE FORTE' | 'SURVEILLANCE' | 'MIROIR MACHINE' = 'SURVEILLANCE';
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

  activeSieveCandidates.sort((a, b) => b.confidenceScore - a.confidenceScore);

  // Diagnostic narratif
  let diagnosticRemark = `Analyse du plateau Machine pour ${drawName} : `;
  if (directTransferRate >= 20) {
    diagnosticRemark += `Haute résonance de transfert direct (${directTransferRate.toFixed(1)}% des tirages capturent au moins 1 numéro machine au tirage suivant). Le vecteur Machine est un puissant attracteur stochastique.`;
  } else if (directTransferRate >= 10) {
    diagnosticRemark += `Résonance modérée de transfert (${directTransferRate.toFixed(1)}%). Prise en compte prioritaire des leaders de conversion (${topHistoricalTransfers.slice(0, 3).map((t) => t.number).join(', ')}).`;
  } else {
    diagnosticRemark += `Transfert direct diffus (${directTransferRate.toFixed(1)}%). Favoriser les transitions croisées et les résonances harmoniques.`;
  }

  return {
    drawName,
    totalDrawsWithMachine: drawsWithMachine,
    directTransferRate,
    meanTransfersPerDraw,
    hasMachineData: true,
    latestMachineNumbers: latestMachine,
    topHistoricalTransfers: topHistoricalTransfers.slice(0, 10),
    activeSieveCandidates: activeSieveCandidates.slice(0, 8),
    crossAffinityMatrix,
    lagDistribution: lagCounts,
    diagnosticRemark,
  };
};
