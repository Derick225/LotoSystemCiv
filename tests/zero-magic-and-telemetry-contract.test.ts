import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import type { DrawResult } from "../src/types";
import { computeAdaptiveContinuousLearningRate } from "../src/services/prediction/adaptiveLearningRate";
import { analyzeTicketStrengthSync } from "../src/services/prediction/ticketAnalysisService";
import { extractFeatures } from "../src/services/prediction/featureExtractor";
import { affinityPlugin } from "../src/services/prediction/algorithms/affinity";
import { echoStateNetworkPlugin } from "../src/services/prediction/algorithms/echoState";
import { jaccardPlugin } from "../src/services/prediction/algorithms/jaccard";
import { derivedNeighborPlugin } from "../src/services/prediction/algorithms/derivedNeighbor";
import {
  shadowProbabilityPlugin,
  networkCorrelationPlugin,
  isolationAnomalyPlugin,
} from "../src/services/prediction/algorithms/advancedTopology";
import {
  recordWasmFallback,
  resetWasmFallbackCount,
  getWasmFallbackCount,
} from "../src/services/wasm/wasmRuntime";
import { logger } from "../src/utils/logger";

function makeDeterministicHistory(count: number): DrawResult[] {
  const draws: DrawResult[] = [];
  for (let i = 0; i < count; i++) {
    const base = ((i * 7) % 85) + 1;
    const nums = [
      base,
      ((base + 11) % 90) + 1,
      ((base + 23) % 90) + 1,
      ((base + 37) % 90) + 1,
      ((base + 53) % 90) + 1,
    ];
    const uniqueSorted = Array.from(new Set(nums)).sort((a, b) => a - b);
    while (uniqueSorted.length < 5) {
      uniqueSorted.push(((uniqueSorted[uniqueSorted.length - 1] + 3) % 90) + 1);
    }
    draws.push({
      id: `det-${i}`,
      drawName: "NATIONAL",
      date: `2026-11-${String((i % 28) + 1).padStart(2, "0")}`,
      gagnants: uniqueSorted.slice(0, 5),
      machine: [],
    });
  }
  return draws;
}

describe("Audit Zéro Nombre Magique & Télémétrie Unifiée / Build Vercel WASM", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetWasmFallbackCount();
  });

  it("calcule continûment la confiance des plugins selon la taille d'historique sans constante figée", async () => {
    const shortHistory = makeDeterministicHistory(6);
    const longHistory = makeDeterministicHistory(48);

    const buildCtx = async (history: DrawResult[]) => ({
      drawName: "NATIONAL",
      history,
      features: await extractFeatures("NATIONAL", history),
      advancedMetrics: {
        anomalyDetection: Object.fromEntries(Array.from({ length: 90 }, (_, i) => [i + 1, (i * 1.1) % 100])),
      },
      pluginCache: {},
    });

    const plugins = [
      affinityPlugin,
      echoStateNetworkPlugin,
      jaccardPlugin,
      derivedNeighborPlugin,
      shadowProbabilityPlugin,
      networkCorrelationPlugin,
      isolationAnomalyPlugin,
    ];

    for (const plugin of plugins) {
      const ctxShort = (await buildCtx(shortHistory)) as any;
      const ctxLong = (await buildCtx(longHistory)) as any;
      plugin.precompute?.(ctxShort);
      plugin.precompute?.(ctxLong);

      const resShort = plugin.evaluate(12, ctxShort);
      const resLong = plugin.evaluate(12, ctxLong);
      const resRepeat = plugin.evaluate(12, ctxLong);

      expect(resShort.confidence).toBeGreaterThan(0);
      expect(resLong.confidence).toBeGreaterThan(resShort.confidence);
      expect(resLong.confidence).toBeLessThanOrEqual(1 - 1 / 90);
      expect(resLong.score).toBe(resRepeat.score);
      expect(resLong.confidence).toBe(resRepeat.confidence);
    }
  });

  it("utilise des références combinatoires 5/90 exactes pour le taux d'apprentissage adaptatif et le scoring ticket", () => {
    const emptyLr = computeAdaptiveContinuousLearningRate([]);
    expect(emptyLr.normalizedEntropy).toBe(1);
    expect(emptyLr.learningRate).toBeGreaterThanOrEqual(1 / 900);
    expect(emptyLr.learningRate).toBeLessThanOrEqual(1 / 5);

    const histLr = computeAdaptiveContinuousLearningRate(makeDeterministicHistory(30));
    expect(histLr.learningRate).toBeGreaterThanOrEqual(1 / 900);
    expect(histLr.learningRate).toBeLessThanOrEqual(1 / 5);

    const ticketStrong = analyzeTicketStrengthSync([7, 21, 38, 56, 79]);
    const ticketConsec = analyzeTicketStrengthSync([1, 2, 3, 4, 5]);
    expect(ticketStrong.score).toBeGreaterThan(ticketConsec.score);
    expect(ticketStrong.score).toBeGreaterThanOrEqual(0);
    expect(ticketStrong.score).toBeLessThanOrEqual(100);
  });

  it("centralise les repliements WASM et services critiques via logger structuré sans console.warn/error résiduel", () => {
    const warnSpy = vi.spyOn(logger, "warn");
    recordWasmFallback("compute_fft_power_spectrum", new Error("wasm not compiled"));
    expect(getWasmFallbackCount()).toBe(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        module: "WASM",
        fallbackCount: 1,
        context: "compute_fft_power_spectrum",
        error: "wasm not compiled",
      }),
      expect.stringContaining("[LOTO-ENGINE FALLBACK #1]"),
    );

    const rootDir = path.resolve(__dirname, "..");
    const standardizedFiles = [
      "src/services/wasm/wasmRuntime.ts",
      "src/services/wasm/wasmMatrixCore.ts",
      "src/services/wasm/wasmHpcWorkerPool.ts",
      "src/services/wasm/epigenomeBridge.ts",
      "src/services/wasm/simulationAutopsyBridge.ts",
      "src/services/wasm/gapRangePatternBridge.ts",
      "src/services/wasm/spatialTensorBridge.ts",
      "src/services/wasm/lotoEngineBridge.ts",
      "src/services/offlineQueueService.ts",
      "src/services/cache/CacheService.ts",
      "src/services/storageOptimizationService.ts",
      "src/services/forensic/forensicStorageService.ts",
      "src/services/training/trainingWorkers.ts",
      "src/services/prediction/weightsManager.ts",
      "src/services/prediction/closedLoopAutopsyService.ts",
      "src/services/lotteryService.ts",
    ];

    for (const relPath of standardizedFiles) {
      const content = fs.readFileSync(path.join(rootDir, relPath), "utf8");
      expect(content, `${relPath} contient encore console.warn/error`).not.toMatch(
        /console\.(warn|error)\(/,
      );
    }
  });

  it("valide la syntaxe et la cohérence des scripts Vercel Rust/WASM", () => {
    const rootDir = path.resolve(__dirname, "..");
    const installScript = path.join(rootDir, "scripts", "vercel-install.sh");
    const buildScript = path.join(rootDir, "scripts", "vercel-build.sh");
    const vercelConfig = JSON.parse(
      fs.readFileSync(path.join(rootDir, "vercel.json"), "utf8"),
    );

    expect(vercelConfig.installCommand).toBe("sh scripts/vercel-install.sh");
    expect(vercelConfig.buildCommand).toBe("sh scripts/vercel-build.sh");

    execSync(`sh -n "${installScript}"`, { stdio: "pipe" });
    execSync(`sh -n "${buildScript}"`, { stdio: "pipe" });

    const installContent = fs.readFileSync(installScript, "utf8");
    const buildContent = fs.readFileSync(buildScript, "utf8");
    expect(installContent).toContain("/rust/env");
    expect(installContent).toContain("/root/.cargo/env");
    expect(installContent).toContain("RUSTUP_INIT_SKIP_PATH_CHECK=yes");
    expect(buildContent).toContain("npm run build:wasm");
    expect(buildContent).toContain("npm run verify:wasm -- --strict");
    expect(buildContent).toContain("public/loto_engine_bg.wasm");
  });
});
