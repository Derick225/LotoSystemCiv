
import type { SpatialMetrics, DrawResult, SpatialCluster, BarycenterPoint } from '../types';

const GRID_COLS = 10;
const GRID_ROWS = 9;

const getCoords = (num: number) => ({
    x: (num - 1) % GRID_COLS,
    y: Math.floor((num - 1) / GRID_COLS)
});

const getDistance = (n1: number, n2: number) => {
    const c1 = getCoords(n1);
    const c2 = getCoords(n2);
    return Math.sqrt(Math.pow(c1.x - c2.x, 2) + Math.pow(c1.y - c2.y, 2));
};

export const calculateSpatialMetrics = (results: DrawResult[]): SpatialMetrics => {
    const gridDensity = new Float32Array(91).fill(0);
    const recent = results.slice(0, 50);
    const N = recent.length || 1;

    recent.forEach(d => d.gagnants.forEach(n => { if (n > 0 && n <= 90) gridDensity[n]++; }));

    // Clustering DBSCAN simplifié
    const clusters: SpatialCluster[] = [];
    const visited = new Set<number>();
    const EPSILON = 1.5;
    const MIN_PTS = 3;

    for (let i = 1; i <= 90; i++) {
        if (visited.has(i) || gridDensity[i] < (N * 0.05)) continue;
        
        const neighbors = Array.from({length: 90}, (_, idx) => idx + 1)
            .filter(n => !visited.has(n) && getDistance(i, n) <= EPSILON && gridDensity[n] > 0);

        if (neighbors.length >= MIN_PTS) {
            const clusterIds = [...neighbors];
            clusterIds.forEach(id => visited.add(id));
            
            const coords = clusterIds.map(getCoords);
            const avgX = coords.reduce((a, b) => a + b.x, 0) / coords.length;
            const avgY = coords.reduce((a, b) => a + b.y, 0) / coords.length;

            clusters.push({
                id: `c-${clusters.length}`,
                center: { x: avgX, y: avgY },
                numbers: clusterIds.sort((a, b) => a - b),
                density: parseFloat((clusterIds.length / 10).toFixed(2)),
                potential: Math.round((clusterIds.reduce((a, b) => a + gridDensity[b], 0) / (N * 5)) * 100),
                color: ['#6366f1', '#ec4899', '#10b981', '#f59e0b'][clusters.length % 4]
            });
        }
    }

    const lastDraw = results[0]?.gagnants || [];
    let sumX = 0, sumY = 0;
    lastDraw.forEach(n => {
        const c = getCoords(n);
        sumX += c.x; sumY += c.y;
    });

    return {
        gridDensity: Array.from(gridDensity),
        detectedPatterns: [],
        barycenter: { x: sumX / (lastDraw.length || 1), y: sumY / (lastDraw.length || 1) },
        advancedClusters: clusters,
        gravityWells: []
    };
};

export const getSpatialScores = (data: DrawResult[]): Record<number, number> => {
    const metrics = calculateSpatialMetrics(data);
    const scores: Record<number, number> = {};
    const maxDensity = Math.max(...metrics.gridDensity);
    for (let i = 1; i <= 90; i++) {
        const density = metrics.gridDensity[i] || 0;
        scores[i] = maxDensity > 0 ? (density / maxDensity) * 100 : 0;
    }
    metrics.advancedClusters.forEach(c => {
        c.numbers.forEach(n => scores[n] = Math.min(100, scores[n] + 20));
    });
    return scores;
};

// FIX: Added missing getBarycenterTrajectory
export const getBarycenterTrajectory = (results: DrawResult[], limit: number = 12): BarycenterPoint[] => {
    return results.slice(0, limit).map((d, idx) => {
        let sumX = 0, sumY = 0;
        d.gagnants.forEach(n => {
            const c = getCoords(n);
            sumX += c.x; sumY += c.y;
        });
        return { x: sumX / 5, y: sumY / 5, drawIndex: idx };
    });
};
