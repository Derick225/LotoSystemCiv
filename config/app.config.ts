export interface LotteryConfig {
    audit: {
        benfordMinSample: number;
        criticalVariance: number;
        maxDivergence: number;
    };
    markov: {
        order: number;
        timeoutMs: number;
    };
    cache: {
        maxSizeBytes: number;
        ttlMs: number;
    };
    learning: {
        minImprovementDelta: number;
        driftThresholdFactor: number;
        recentWindowSize: number;
        emaAlpha: number;
    };
    concurrency: {
        maxWorkers: number;
        semaphoreLimit: number;
    };
}

export const appConfig: LotteryConfig = {
    audit: {
        benfordMinSample: 50,
        criticalVariance: 0.15,
        maxDivergence: 0.2,
    },
    markov: {
        order: 2,
        timeoutMs: 15000,
    },
    cache: {
        maxSizeBytes: 5 * 1024 * 1024, // 5MB
        ttlMs: 3600000, // 1 hour
    },
    learning: {
        minImprovementDelta: 0.02,
        driftThresholdFactor: 0.8,
        recentWindowSize: 5,
        emaAlpha: 0.3,
    },
    concurrency: {
        maxWorkers: 2,
        semaphoreLimit: 3,
    }
};
