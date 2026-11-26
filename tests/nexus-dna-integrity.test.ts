import { describe, it, expect } from "vitest";
import {
  computePredictionDnaGeneChecksum,
  buildPredictionBaselineSignature,
  verifyPredictionDnaGeneIntegrity,
  type DnaGeneChecksumSnapshot,
} from "../src/components/NexusEngine";
import { generateMasterPredictionCore } from "../src/services/prediction/predictionFacade";
import { AlgoKey, DEFAULT_ALGO_WEIGHTS } from "../src/shared/prediction.types";
import type { AlgoWeights, DrawResult, Prediction } from "../src/types";

const buildDeterministicDrawHistory = (
  drawName: string,
  count: number,
  includeMachine: boolean,
): DrawResult[] => {
  const history: DrawResult[] = [];
  for (let i = 0; i < count; i++) {
    const nums = new Set<number>();
    let step = 0;
    while (nums.size < 5) {
      const candidate = ((i * 11 + step * 17 + 7) % 90) + 1;
      nums.add(candidate);
      step++;
    }
    const gagnants = Array.from(nums).sort((a, b) => a - b);

    const machine = includeMachine
      ? Array.from({ length: 5 }, (_, mIdx) => ((i * 13 + mIdx * 19 + 3) % 90) + 1)
      : undefined;

    const day = ((i % 28) + 1).toString().padStart(2, "0");
    const month = ((Math.floor(i / 28) % 12) + 1).toString().padStart(2, "0");
    history.push({
      id: `${drawName.toLowerCase().replace(/\s+/g, "_")}_${i}`,
      drawName,
      date: `${day}/${month}/2025`,
      gagnants,
      ...(machine ? { machine } : {}),
    });
  }
  return history;
};

describe("Vérification d'intégrité des gènes de l'ADN algorithmique (NexusEngine)", () => {
  const drawName = "National";
  const history = buildDeterministicDrawHistory(drawName, 20, true);
  const weights: AlgoWeights = { ...DEFAULT_ALGO_WEIGHTS };
  const temporalDepth = 20;

  it("produit des checksums déterministes identiques à travers deux exécutions indépendantes et valide la base", async () => {
    const pred1 = await generateMasterPredictionCore(
      drawName,
      history,
      temporalDepth,
      weights,
      undefined,
      undefined,
      true,
      false,
      undefined,
      false,
      true,
      undefined,
      undefined,
      "optimal_selection",
    );
    const pred2 = await generateMasterPredictionCore(
      drawName,
      history,
      temporalDepth,
      weights,
      undefined,
      undefined,
      true,
      false,
      undefined,
      false,
      true,
      undefined,
      undefined,
      "optimal_selection",
    );

    const chk1 = computePredictionDnaGeneChecksum(pred1);
    const chk2 = computePredictionDnaGeneChecksum(pred2);

    expect(chk1.genesChecksum).toBe(chk2.genesChecksum);
    expect(chk1.outputChecksum).toBe(chk2.outputChecksum);
    expect(chk1.predictionChecksum).toBe(chk2.predictionChecksum);

    const registry = new Map<string, DnaGeneChecksumSnapshot>();
    const firstReport = await verifyPredictionDnaGeneIntegrity({
      prediction: pred1,
      drawName,
      history,
      weights,
      temporalDepth,
      predictionStrategy: "optimal_selection",
      skipTraining: true,
      baselineRegistry: registry,
    });
    expect(firstReport.valid).toBe(true);
    expect(firstReport.status).toBe("BASELINE_REGISTERED");

    const secondReport = await verifyPredictionDnaGeneIntegrity({
      prediction: pred2,
      drawName,
      history,
      weights,
      temporalDepth,
      predictionStrategy: "optimal_selection",
      skipTraining: true,
      baselineRegistry: registry,
    });
    expect(secondReport.valid).toBe(true);
    expect(secondReport.status).toBe("VERIFIED");
    expect(secondReport.discrepancyReasons).toEqual([]);
  });

  it("authentifie une prédiction contre un recalcul déterministe complet (recomputeBaseline: true)", async () => {
    const prediction = await generateMasterPredictionCore(
      drawName,
      history,
      temporalDepth,
      weights,
      undefined,
      undefined,
      true,
      false,
      undefined,
      false,
      true,
      undefined,
      undefined,
      "hybrid_inference",
    );

    const report = await verifyPredictionDnaGeneIntegrity({
      prediction,
      drawName,
      history,
      weights,
      temporalDepth,
      predictionStrategy: "hybrid_inference",
      skipTraining: true,
      recomputeBaseline: true,
    });

    expect(report.valid).toBe(true);
    expect(report.status).toBe("VERIFIED");
    expect(report.expectedBaselineChecksum).toBe(report.predictionChecksum);
    expect(report.expectedGenesChecksum).toBe(report.genesChecksum);
    expect(report.expectedOutputChecksum).toBe(report.outputChecksum);
  });

  it("sépare strictement les signatures de référence entre optimal_selection et hybrid_inference", () => {
    const sigOptimal = buildPredictionBaselineSignature({
      drawName,
      history,
      weights,
      temporalDepth,
      predictionStrategy: "optimal_selection",
    });
    const sigHybrid = buildPredictionBaselineSignature({
      drawName,
      history,
      weights,
      temporalDepth,
      predictionStrategy: "hybrid_inference",
    });

    expect(sigOptimal.deterministicSeed).toBe(sigHybrid.deterministicSeed);
    expect(sigOptimal.inputBaselineChecksum).not.toBe(
      sigHybrid.inputBaselineChecksum,
    );
  });

  it("détecte toute altération des gènes ADN (dnaSieve, channelWeights) ou des prédictions générées", async () => {
    const authentic = await generateMasterPredictionCore(
      drawName,
      history,
      temporalDepth,
      weights,
      undefined,
      undefined,
      true,
      false,
      undefined,
      false,
      true,
      undefined,
      undefined,
      "optimal_selection",
    );

    const registry = new Map<string, DnaGeneChecksumSnapshot>();
    await verifyPredictionDnaGeneIntegrity({
      prediction: authentic,
      drawName,
      history,
      weights,
      temporalDepth,
      predictionStrategy: "optimal_selection",
      skipTraining: true,
      baselineRegistry: registry,
    });

    // 1. Altération d'un gène DnaSieve (multiplicateur)
    const tamperedGenePred: Prediction = {
      ...authentic,
      dnaSieve: authentic.dnaSieve
        ? {
            ...authentic.dnaSieve,
            multipliers: {
              ...(authentic.dnaSieve.multipliers || {}),
              [authentic.suggestedNumbers[0]]:
                ((authentic.dnaSieve.multipliers?.[authentic.suggestedNumbers[0]] ?? 1) + 0.25),
            },
          }
        : undefined,
    };

    const geneTamperReport = await verifyPredictionDnaGeneIntegrity({
      prediction: tamperedGenePred,
      drawName,
      history,
      weights,
      temporalDepth,
      predictionStrategy: "optimal_selection",
      skipTraining: true,
      baselineRegistry: registry,
    });
    expect(geneTamperReport.valid).toBe(false);
    expect(geneTamperReport.status).toBe("CHECKSUM_MISMATCH");
    expect(
      geneTamperReport.discrepancyReasons.some((r) =>
        r.includes("GENES_CHECKSUM_MISMATCH"),
      ),
    ).toBe(true);

    // 2. Altération d'un numéro suggéré (sortie stochastique)
    const replacementNum =
      [1, 2, 3, 4, 5, 6].find(
        (n) => !authentic.suggestedNumbers.includes(n),
      ) || 88;
    const tamperedOutputPred: Prediction = {
      ...authentic,
      suggestedNumbers: [
        replacementNum,
        ...authentic.suggestedNumbers.slice(1),
      ],
    };

    const outputTamperReport = await verifyPredictionDnaGeneIntegrity({
      prediction: tamperedOutputPred,
      drawName,
      history,
      weights,
      temporalDepth,
      predictionStrategy: "optimal_selection",
      skipTraining: true,
      baselineRegistry: registry,
    });
    expect(outputTamperReport.valid).toBe(false);
    expect(outputTamperReport.status).toBe("CHECKSUM_MISMATCH");
    expect(
      outputTamperReport.discrepancyReasons.some((r) =>
        r.includes("OUTPUT_CHECKSUM_MISMATCH"),
      ),
    ).toBe(true);
  });

  it("rejette les violations d'invariants (simplexe 5/90, MACHINE_TRANSFER sur Fortune Thursday, pollution inter-tirages)", async () => {
    const fortuneThursdayHistory = buildDeterministicDrawHistory(
      "Fortune Thursday",
      15,
      false,
    );
    const ftPred = await generateMasterPredictionCore(
      "Fortune Thursday",
      fortuneThursdayHistory,
      15,
      weights,
      undefined,
      undefined,
      true,
      false,
      undefined,
      false,
      true,
      undefined,
      undefined,
      "optimal_selection",
    );

    // Violation A : Fuite MACHINE_TRANSFER non nulle sur Fortune Thursday
    const leakedMachinePred: Prediction = {
      ...ftPred,
      walkForwardCalibration: ftPred.walkForwardCalibration
        ? {
            ...ftPred.walkForwardCalibration,
            channelWeights: {
              ...(ftPred.walkForwardCalibration.channelWeights || {}),
              [AlgoKey.MACHINE_TRANSFER]: 0.12,
            },
          }
        : undefined,
    };

    const machineReport = await verifyPredictionDnaGeneIntegrity({
      prediction: leakedMachinePred,
      drawName: "Fortune Thursday",
      history: fortuneThursdayHistory,
      weights,
      temporalDepth: 15,
      skipTraining: true,
    });
    expect(machineReport.valid).toBe(false);
    expect(machineReport.status).toBe("INVARIANT_VIOLATION");
    expect(
      machineReport.discrepancyReasons.some((r) =>
        r.includes("MACHINE_TRANSFER_LEAK"),
      ),
    ).toBe(true);

    // Violation B : Corruption du simplexe marginal Sum(p_n) != 5.0
    const brokenSimplexPred: Prediction = {
      ...ftPred,
      numberProbabilities: {
        ...(ftPred.numberProbabilities || {}),
        1: 0.75,
      },
    };
    const simplexReport = await verifyPredictionDnaGeneIntegrity({
      prediction: brokenSimplexPred,
      drawName: "Fortune Thursday",
      history: fortuneThursdayHistory,
      weights,
      temporalDepth: 15,
      skipTraining: true,
    });
    expect(simplexReport.valid).toBe(false);
    expect(
      simplexReport.discrepancyReasons.some((r) =>
        r.includes("PROBABILITY_SIMPLEX_VIOLATION"),
      ),
    ).toBe(true);

    // Violation C : Contamination inter-tirages dans l'historique transmis
    const foreignDraw = buildDeterministicDrawHistory("Espoir", 1, true)[0];
    const pollutedHistory = [...fortuneThursdayHistory, foreignDraw];
    const isolationReport = await verifyPredictionDnaGeneIntegrity({
      prediction: ftPred,
      drawName: "Fortune Thursday",
      history: pollutedHistory,
      weights,
      temporalDepth: 15,
      skipTraining: true,
    });
    expect(isolationReport.valid).toBe(false);
    expect(
      isolationReport.discrepancyReasons.some((r) =>
        r.includes("HISTORY_CROSS_DRAW_CONTAMINATION"),
      ),
    ).toBe(true);
  });
});
