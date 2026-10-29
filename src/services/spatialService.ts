
import type { SpatialMetrics, DrawResult, SpatialCluster, BarycenterPoint } from '../types';
import {
  computeSpatialGridHpc,
  computeBarycenterTrajectoryHpc,
} from './wasm/lotoEngineBridge';

// Configuration Grille Loto 5/90 (9 lignes de 10 colonnes)
const GRID_COLS = 10;
const GRID_ROWS = 9;

// Conversion Numéro -> Coordonnées (0-based)
const getCoords = (num: number) => {
    const index = num - 1;
    return {
        x: index % GRID_COLS,
        y: Math.floor(index / GRID_COLS)
    };
};

const getDistance = (n1: number, n2: number) => {
    const c1 = getCoords(n1);
    const c2 = getCoords(n2);
    return Math.sqrt(Math.pow(c1.x - c2.x, 2) + Math.pow(c1.y - c2.y, 2));
};

export const calculateSpatialMetrics = (results: DrawResult[]): SpatialMetrics => {
    const recent = results.slice(0, 50); // Fenêtre glissante 50 tirages
    const N = recent.length || 1;

    // Aplatir les tirages pour le calcul vectorisé en Rust/WASM
    const flat = new Int32Array(recent.length * 5);
    for (let d = 0; d < recent.length; d++) {
        const w = recent[d]?.gagnants || [];
        for (let c = 0; c < 5; c++) {
            flat[d * 5 + c] = w[c] || 0;
        }
    }

    // 1. Calcul du champ spatial complet en Rust/WASM HPC (grille, gravité, barycentre, seuil probit)
    const hpc = computeSpatialGridHpc(flat, recent.length);

    // Grille de densité indexée 0..90 pour la compatibilité avec l'affichage
    const gridDensity = new Float32Array(91);
    for (let i = 1; i <= 90; i++) {
        gridDensity[i] = hpc.gridDensity[i - 1];
    }

    const densityThreshold = hpc.densityThreshold;

    // 2. Clustering DBSCAN géographique sur points chauds
    const clusters: SpatialCluster[] = [];
    const visited = new Set<number>();
    const MIN_PTS = 2;

    for (let i = 1; i <= 90; i++) {
        if (visited.has(i) || gridDensity[i] < densityThreshold) continue;

        const neighbors = Array.from({ length: 90 }, (_, idx) => idx + 1)
            .filter(n => {
                if (visited.has(n) || gridDensity[n] < densityThreshold) return false;
                const c1 = getCoords(i);
                const c2 = getCoords(n);
                return Math.max(Math.abs(c1.x - c2.x), Math.abs(c1.y - c2.y)) <= 1;
            });

        if (neighbors.length >= MIN_PTS) {
            const clusterIds = [i, ...neighbors];
            clusterIds.forEach(id => visited.add(id));

            const coords = clusterIds.map(getCoords);
            const avgX = coords.reduce((a, b) => a + b.x, 0) / coords.length;
            const avgY = coords.reduce((a, b) => a + b.y, 0) / coords.length;
            const rawPotential = clusterIds.reduce((a, b) => a + gridDensity[b], 0);

            clusters.push({
                id: `cluster-${clusters.length}`,
                center: { x: avgX, y: avgY },
                numbers: Array.from(new Set(clusterIds)).sort((a, b) => a - b),
                density: parseFloat((clusterIds.length / (GRID_COLS * GRID_ROWS)).toFixed(2)),
                potential: Math.min(100, Math.round((rawPotential / N) * 100)),
                color: ['#6366f1', '#ec4899', '#10b981', '#f59e0b'][clusters.length % 4]
            });
        }
    }

    // 3. Puits de gravité newtoniens directement issus du champ de forces HPC
    const gravityWells: any[] = [];
    const pullField = hpc.gravityPulls;

    const sortedCandidates = Array.from({ length: 90 }, (_, i) => ({ num: i + 1, pull: pullField[i] }))
        .sort((a, b) => b.pull - a.pull);

    const selectedWells: number[] = [];
    for (const cand of sortedCandidates) {
        if (selectedWells.length >= 3) break;
        const coords = getCoords(cand.num);
        const tooClose = selectedWells.some(sel => {
            const sc = getCoords(sel);
            const dist = Math.sqrt(Math.pow(coords.x - sc.x, 2) + Math.pow(coords.y - sc.y, 2));
            return dist < 3;
        });
        if (!tooClose) {
            selectedWells.push(cand.num);
        }
    }

    let maxPull = 0;
    for (let i = 0; i < 90; i++) {
        if (pullField[i] > maxPull) maxPull = pullField[i];
    }
    if (maxPull === 0) maxPull = 1;

    selectedWells.forEach((num, index) => {
        const coords = getCoords(num);
        const rawForce = pullField[num - 1];
        const pullPercent = Math.round((rawForce / maxPull) * 100);

        const subordinates = Array.from({ length: 90 }, (_, i) => i + 1)
            .filter(other => getDistance(num, other) <= 1.5);

        gravityWells.push({
            id: `gwell-${index}`,
            x: coords.x,
            y: coords.y,
            pullForce: pullPercent,
            subordinateNumbers: subordinates
        });
    });

    return {
        gridDensity: Array.from(gridDensity),
        detectedPatterns: [],
        barycenter: {
            x: hpc.barycenterX,
            y: hpc.barycenterY,
        },
        advancedClusters: clusters.sort((a, b) => b.potential - a.potential),
        gravityWells
    };
};

export const getSpatialScores = (data: DrawResult[]): Record<number, number> => {
    const metrics = calculateSpatialMetrics(data);
    const scores: Record<number, number> = {};
    const maxDensity = Math.max(...metrics.gridDensity) || 1;

    for (let i = 1; i <= 90; i++) {
        const density = metrics.gridDensity[i] || 0;
        scores[i] = (density / maxDensity) * 100;
    }

    metrics.advancedClusters.forEach(c => {
        c.numbers.forEach(n => {
            const clusterImpact = 100 * (1 - Math.exp(-0.01 * c.potential));
            scores[n] = Math.min(100, scores[n] + clusterImpact);
        });
    });

    return scores;
};

export const getBarycenterTrajectory = (results: DrawResult[], limit: number = 12): BarycenterPoint[] => {
    return computeBarycenterTrajectoryHpc(results, limit);
};
