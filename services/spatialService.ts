
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

    // Clustering DBSCAN (Density-Based Spatial Clustering)
    // Identifie les zones où les numéros sortent groupés géographiquement sur la grille
    const clusters: SpatialCluster[] = [];
    const visited = new Set<number>();
    const EPSILON = 1.5; // Rayon de voisinage (voisins directs + diagonales)
    const MIN_PTS = 2;   // Minimum de points pour former un cluster (faible car 50 tirages)

    for (let i = 1; i <= 90; i++) {
        // On ne clusterise que les points "chauds" (> 5% de fréquence) pour éviter le bruit
        if (visited.has(i) || gridDensity[i] < (N * 0.05)) continue;
        
        // Trouver les voisins géographiques chauds
        const neighbors = Array.from({length: 90}, (_, idx) => idx + 1)
            .filter(n => !visited.has(n) && getDistance(i, n) <= EPSILON && gridDensity[n] >= (N * 0.05));

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

    return {
        gridDensity: Array.from(gridDensity),
        detectedPatterns: [],
        barycenter: { 
            x: lastDraw.length ? sumX / lastDraw.length : 4.5, 
            y: lastDraw.length ? sumY / lastDraw.length : 4 
        },
        advancedClusters: clusters.sort((a,b) => b.potential - a.potential),
        gravityWells: []
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
    
    // Bonus de Cluster : Les numéros dans un cluster chaud reçoivent un boost
    metrics.advancedClusters.forEach(c => {
        c.numbers.forEach(n => {
            scores[n] = Math.min(100, scores[n] + (c.potential * 0.3));
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
