
import type { SpatialMetrics, DrawResult, SpatialCluster, BarycenterPoint } from '../types';

// Configuration Grille Loto 5/90 (9 lignes de 10 colonnes)
const GRID_COLS = 10;
const GRID_ROWS = 9;

// Conversion Numéro -> Coordonnées (0-based)
const getCoords = (num: number) => {
    // 1 -> x:0, y:0
    // 10 -> x:9, y:0
    // 11 -> x:0, y:1
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
    // Grille de densité (Index 1-90)
    const gridDensity = new Float32Array(91).fill(0);
    const recent = results.slice(0, 50); // Fenêtre glissante 50 tirages
    const N = recent.length || 1;

    // Calcul de la densité brute (Heatmap)
    recent.forEach(d => {
        d.gagnants.forEach(n => { 
            if (n > 0 && n <= 90) gridDensity[n]++; 
        });
    });

    // Statistical moments - replacing MAGIC threshold values with continuous limits
    const densityValues = Array.from(gridDensity).slice(1);
    const meanDensity = densityValues.reduce((a, b) => a + b, 0) / 90;
    const squaredDiffsSum = densityValues.reduce((acc, v) => acc + Math.pow(v - meanDensity, 2), 0);
    const variance = squaredDiffsSum / 90;
    const stdDev = Math.sqrt(variance);

    // Continuous threshold adaptivity: mean density adjusted by standard deviation damping
    // This scales automatically with the size of data N and its concentration
    const densityThreshold = stdDev > 0 ? meanDensity - (stdDev * 0.15) : meanDensity;
    
    // Clustering DBSCAN (Density-Based Spatial Clustering)
    // Identifies zones where numbers appear grouped geographically on the grid
    const clusters: SpatialCluster[] = [];
    const visited = new Set<number>();
    const EPSILON = Math.sqrt(2); // Exact geometric distance for diagonals in 1x1 grid
    const MIN_PTS = 2;

    for (let i = 1; i <= 90; i++) {
        // Only cluster "hot" points to avoid noise
        if (visited.has(i) || gridDensity[i] < densityThreshold) continue;
        
        // Find geographically hot neighbors
        const neighbors = Array.from({length: 90}, (_, idx) => idx + 1)
            .filter(n => !visited.has(n) && getDistance(i, n) <= (EPSILON + 0.01) && gridDensity[n] >= densityThreshold);

        if (neighbors.length >= MIN_PTS) {
            const clusterIds = [i, ...neighbors]; // Inclure le point source
            clusterIds.forEach(id => visited.add(id));
            
            // Calcul du centroïde du cluster
            const coords = clusterIds.map(getCoords);
            const avgX = coords.reduce((a, b) => a + b.x, 0) / coords.length;
            const avgY = coords.reduce((a, b) => a + b.y, 0) / coords.length;

            // Score de potentiel : somme des densités des membres
            const rawPotential = clusterIds.reduce((a, b) => a + gridDensity[b], 0);
            
            clusters.push({
                id: `cluster-${clusters.length}`,
                center: { x: avgX, y: avgY },
                numbers: Array.from(new Set(clusterIds)).sort((a, b) => a - b),
                density: parseFloat((clusterIds.length / (GRID_COLS * GRID_ROWS)).toFixed(2)),
                potential: Math.min(100, Math.round((rawPotential / N) * 100)), // Normalisation
                color: ['#6366f1', '#ec4899', '#10b981', '#f59e0b'][clusters.length % 4]
            });
        }
    }

    // Calcul du Barycentre du dernier tirage (Le point d'équilibre instantané)
    const lastDraw = results[0]?.gagnants || [];
    let sumX = 0, sumY = 0;
    lastDraw.forEach(n => {
        const c = getCoords(n);
        sumX += c.x; sumY += c.y;
    });

    // Dynamic Newtonian Gravity Wells Calculation
    // Evaluates a continuous gravitational pull field across the entire grid
    const gravityWells: any[] = [];
    const pullField = new Float32Array(90);
    
    for (let num = 1; num <= 90; num++) {
        let pull = 0;
        for (let other = 1; other <= 90; other++) {
            const density = gridDensity[other];
            if (density <= 0) continue;
            const dist = getDistance(num, other);
            // Continuous gravity function: Force decreases with distance square. 1 protects against self-division
            pull += density / (1 + dist * dist);
        }
        pullField[num - 1] = pull;
    }
    
    // Find local maxima with spatial separation (minimum clearance of 3 grid coordinates)
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
    
    const maxPull = Math.max(...pullField) || 1;
    selectedWells.forEach((num, index) => {
        const coords = getCoords(num);
        const rawForce = pullField[num - 1];
        const pullPercent = Math.round((rawForce / maxPull) * 100);
        
        // Subordinate numbers falling directly in this well's event horizon
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
            x: lastDraw.length ? sumX / lastDraw.length : 4.5, 
            y: lastDraw.length ? sumY / lastDraw.length : 4 
        },
        advancedClusters: clusters.sort((a,b) => b.potential - a.potential),
        gravityWells
    };
};

export const getSpatialScores = (data: DrawResult[]): Record<number, number> => {
    const metrics = calculateSpatialMetrics(data);
    const scores: Record<number, number> = {};
    const maxDensity = Math.max(...metrics.gridDensity) || 1;
    
    // Score de base : densité individuelle
    for (let i = 1; i <= 90; i++) {
        const density = metrics.gridDensity[i] || 0;
        scores[i] = (density / maxDensity) * 100;
    }
    
    // Bonus de Cluster : Les numéros dans un cluster chaud reçoivent un boost probabiliste
    metrics.advancedClusters.forEach(c => {
        c.numbers.forEach(n => {
            // Mapping continu de l'impact du cluster (Sigmoïde)
            const clusterImpact = 100 * (1 - Math.exp(-0.01 * c.potential));
            scores[n] = Math.min(100, scores[n] + clusterImpact);
        });
    });
    
    return scores;
};

export const getBarycenterTrajectory = (results: DrawResult[], limit: number = 12): BarycenterPoint[] => {
    // Calcule la trajectoire du centre de gravité sur les N derniers tirages
    return results.slice(0, limit).map((d, idx) => {
        let sumX = 0, sumY = 0;
        d.gagnants.forEach(n => {
            const c = getCoords(n);
            sumX += c.x; sumY += c.y;
        });
        const len = d.gagnants.length || 1;
        return { x: sumX / len, y: sumY / len, drawIndex: idx };
    });
};
