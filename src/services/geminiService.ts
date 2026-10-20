import { DrawResult, GeminiReasoning, ForensicReport, SpectralDeviation } from '../types';

// Bornes structurelles du domaine de température et point fixe de la marche aléatoire.
// Aucun de ces paramètres n'est ajusté sur des données : ce sont des définitions de domaine.
const HURST_RANDOM_WALK = 0.5;
const TEMPERATURE_FLOOR = 0.10;
const TEMPERATURE_CEILING = 0.95;

// Durées de vie de cache (infrastructure de performance, sans effet sur les résultats).
const LOGIC_CACHE_TTL_MS = 3600000;
const NARRATIVE_CACHE_TTL_MS = 1800000;

const logicCache: Record<string, { data: GeminiReasoning; expiry: number }> = {};
const narrativeCache: Record<string, { data: string; expiry: number }> = {};

/**
 * Conversion stricte vers un nombre fini. Toute valeur absente ou non numérique renvoie null :
 * les appelants doivent alors déclarer la mesure indisponible plutôt que d'injecter une valeur
 * de repli arbitraire.
 */
const toFiniteNumber = (value: unknown): number | null => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
};

/**
 * Fonction de répartition de la loi normale centrée réduite (approximation A&S 7.1.26,
 * erreur absolue < 7.5e-8). Coefficients issus de la publication Abramowitz & Stegun.
 */
const normalCdf = (z: number): number => {
    const x = Math.abs(z);
    const t = 1 / (1 + 0.2316419 * x);
    const poly = 0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429)));
    const density = Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
    const tail = density * poly;
    return z >= 0 ? 1 - tail : tail;
};

/**
 * Coefficient binomial C(n, k), calculé par produit pour éviter les factorielles débordantes.
 */
const combinations = (n: number, k: number): number => {
    if (k < 0 || k > n || n < 0) return 0;
    const size = Math.min(k, n - k);
    let result = 1;
    for (let i = 1; i <= size; i++) {
        result = (result * (n - size + i)) / i;
    }
    return result;
};

/**
 * Probabilité exacte P(X >= observed) pour X ~ Hypergéométrique(population, successes, draws).
 * Test de recouvrement sans remise : c'est la loi du nombre de numéros communs entre deux
 * sélections disjointes d'un même domaine. Renvoie null si la population n'est pas exploitable.
 */
const hypergeometricUpperTail = (
    population: number,
    successes: number,
    draws: number,
    observed: number,
): number | null => {
    if (population < 1 || draws < 0 || successes < 0 || successes > population || draws > population) return null;
    const total = combinations(population, draws);
    if (!Number.isFinite(total) || total <= 0) return null;

    const minX = Math.max(0, draws - (population - successes));
    const maxX = Math.min(draws, successes);
    const start = Math.min(Math.max(observed, minX), maxX + 1);

    let tail = 0;
    for (let x = start; x <= maxX; x++) {
        tail += combinations(successes, x) * combinations(population - successes, draws - x);
    }
    return Math.min(1, Math.max(0, tail / total));
};

/**
 * Probabilité, sous hypothèse uniforme, qu'un écart au moins aussi grand que maxAbsZ apparaisse
 * quelque part parmi `tests` comparaisons (statistique de scan, contrôle de multiplicité).
 */
const familyWisePValue = (maxAbsZ: number, tests: number): number => {
    if (!Number.isFinite(maxAbsZ) || tests <= 0) return 1;
    const twoSided = Math.min(1, Math.max(0, 2 * (1 - normalCdf(Math.abs(maxAbsZ)))));
    return Math.min(1, 1 - Math.pow(1 - twoSided, tests));
};

export interface DrawFrequencyMeasurement {
    draws: number;
    drawSize: number;
    domainMax: number;
    counts: Record<number, number>;
    expectedPerNumber: number;
    zScores: Record<number, number>;
    maxAbsZ: number;
    familyWiseP: number;
    topByZScores: Array<{ number: number; count: number; z: number }>;
    parityZ: number | null;
}

/**
 * Mesure réelle des fréquences sur la TOTALITÉ de l'historique fourni (aucune fenêtre tronquée).
 * - drawSize : taille de tirage observée la plus fréquente (aucune constante de jeu codée en dur).
 * - domainMax : plus grand numéro observé. C'est une borne INFÉRIEURE du domaine réel : l'attendu
 *   par numéro est donc surestimé, ce qui rend les écarts mesurés conservateurs.
 * - zScores : écarts normalisés binomialement (sigma = racine(n·p·(1-p))), numéro par numéro.
 * - familyWiseP : probabilité d'observer un écart au moins égal à maxAbsZ quelque part parmi les
 *   `domainMax` numéros candidats, sous équiprobabilité.
 */
export const measureDrawFrequencies = (history: DrawResult[]): DrawFrequencyMeasurement | null => {
    const draws = (history || []).filter((h) => Array.isArray(h?.gagnants) && h.gagnants.length > 0);
    if (draws.length === 0) return null;

    const sizeTally: Record<number, number> = {};
    draws.forEach((h) => {
        sizeTally[h.gagnants.length] = (sizeTally[h.gagnants.length] || 0) + 1;
    });
    const sizeEntries = Object.entries(sizeTally).map(([size, count]) => ({ size: Number(size), count }));
    sizeEntries.sort((a, b) => b.count - a.count || b.size - a.size);
    const drawSize = sizeEntries[0].size;

    const numbers: number[] = [];
    draws.forEach((h) => {
        h.gagnants.forEach((n) => {
            const value = toFiniteNumber(n);
            if (value !== null && value >= 1) numbers.push(value);
        });
    });
    if (numbers.length === 0) return null;

    const domainMax = Math.max(...numbers);
    if (domainMax < 1) return null;

    const counts: Record<number, number> = {};
    for (let n = 1; n <= domainMax; n++) counts[n] = 0;
    numbers.forEach((n) => {
        counts[n] += 1;
    });

    const totalNumbers = numbers.length;
    const p = 1 / domainMax;
    const expectedPerNumber = totalNumbers * p;
    const sigma = Math.sqrt(totalNumbers * p * (1 - p));

    const zScores: Record<number, number> = {};
    let maxAbsZ = 0;
    for (let n = 1; n <= domainMax; n++) {
        const z = sigma > 0 ? (counts[n] - expectedPerNumber) / sigma : 0;
        zScores[n] = z;
        if (Math.abs(z) > maxAbsZ) maxAbsZ = Math.abs(z);
    }

    const topByZScores = Array.from({ length: domainMax }, (_, i) => i + 1)
        .map((number) => ({ number, count: counts[number], z: zScores[number] }))
        .sort((a, b) => Math.abs(b.z) - Math.abs(a.z) || a.number - b.number)
        .slice(0, Math.max(drawSize, 5));

    const evenCount = numbers.filter((n) => n % 2 === 0).length;
    const paritySigma = Math.sqrt(totalNumbers * 0.25);
    const parityZ = paritySigma > 0 ? (evenCount - totalNumbers / 2) / paritySigma : null;

    return {
        draws: draws.length,
        drawSize,
        domainMax,
        counts,
        expectedPerNumber,
        zScores,
        maxAbsZ,
        familyWiseP: familyWisePValue(maxAbsZ, domainMax),
        topByZScores,
        parityZ,
    };
};

/**
 * Température de génération continue, dérivée de l'incertitude d'échantillonnage de l'exposant de
 * Hurst : sigma(H) = 1/racine(N) pour une marche aléatoire. La pente logistique vaut 3 sigma, donc
 * T ne dépend que de la déviation réellement significative de H par rapport à 0.5.
 * Renvoie null si H ou N n'est pas une mesure disponible (aucune valeur de repli inventée).
 */
export const computeContinuousTemperature = (
    hurst: number | null | undefined,
    samples: number | null | undefined,
): number | null => {
    const h = toFiniteNumber(hurst);
    const n = toFiniteNumber(samples);
    if (h === null || n === null || n < 1) return null;

    const sigma = 1 / Math.sqrt(n);
    const slope = 3 / sigma;
    const logistic = 1 / (1 + Math.exp(slope * (h - HURST_RANDOM_WALK)));
    const value = TEMPERATURE_FLOOR + (TEMPERATURE_CEILING - TEMPERATURE_FLOOR) * logistic;
    return parseFloat(value.toFixed(4));
};

/**
 * Indice composite de fiabilité : moyenne à poids UNIFORMES (hypothèse de variance maximale sur
 * les pondérations) de trois mesures bornées [0,1] — score de Brier, volatilité, entropie.
 * Ce n'est PAS une probabilité de gain, seulement un résumé borné de trois métriques.
 * Renvoie null dès qu'une des trois mesures est absente.
 */
export const computeBayesianRecurrenceScore = (
    brier: number | null | undefined,
    volatility: number | null | undefined,
    entropy: number | null | undefined,
): number | null => {
    const b = toFiniteNumber(brier);
    const v = toFiniteNumber(volatility);
    const e = toFiniteNumber(entropy);
    if (b === null || v === null || e === null) return null;

    const bounded = (x: number) => Math.min(1, Math.max(0, x));
    const score = (100 * ((1 - bounded(b)) + (1 - bounded(v)) + (1 - bounded(e)))) / 3;
    return Math.round(Math.min(100, Math.max(0, score)));
};

/**
 * Analyse structurelle 100% hors-ligne : ne restitue que des mesures effectivement calculées sur
 * l'historique fourni. Les métriques absentes sont déclarées absentes ; aucun écart prédictif
 * n'est revendiqué.
 */
export const analyzeDrawLogic = async (
    drawName: string,
    history: DrawResult[],
    metrics?: Record<string, unknown>,
): Promise<GeminiReasoning> => {
    const measurement = measureDrawFrequencies(history);
    const hurst = toFiniteNumber(metrics?.hurst);
    const entropy = toFiniteNumber(metrics?.entropy) ?? toFiniteNumber(metrics?.spectralEntropy);
    const volatility = toFiniteNumber(metrics?.volatility);
    const brier = toFiniteNumber(metrics?.brierScore);
    const regimeRaw = metrics?.regime ?? metrics?.gameRegime;
    const regime = typeof regimeRaw === 'string' && regimeRaw.trim() !== '' ? regimeRaw : null;
    const lastDrawDate = history?.[0]?.date ?? 'date inconnue';

    const cacheKey = `${drawName}_${lastDrawDate}_${measurement?.draws ?? 0}_${regime ?? 'sans-regime'}`.replace(/\s+/g, '_');
    const cached = logicCache[cacheKey];
    if (cached && cached.expiry > Date.now()) return cached.data;

    if (!measurement) {
        return {
            logicalAnalysis: `Aucune mesure possible pour ${drawName} : l'historique fourni ne contient aucun tirage exploitable.`,
            patternType: 'Indéterminé (aucune donnée)',
            nextSequence: 'Non calculable : aucun historique.',
            anomalies: [],
            strategicAdvice: "Fournir un historique avant toute analyse : aucune valeur n'est extrapolée en l'absence de données.",
            suggestedFocus: [],
            intuitionScore: 0,
        };
    }

    const samples = measurement.draws;
    const half = Math.floor(samples / 2);

    const topFromSubset = (subset: DrawResult[]): number[] => {
        const subsetCounts: Record<number, number> = {};
        for (let n = 1; n <= measurement.domainMax; n++) subsetCounts[n] = 0;
        subset.forEach((h) => {
            (h.gagnants || []).forEach((n) => {
                const value = toFiniteNumber(n);
                if (value !== null && value >= 1 && value <= measurement.domainMax) subsetCounts[value] += 1;
            });
        });
        return Object.keys(subsetCounts)
            .map(Number)
            .sort((a, b) => subsetCounts[b] - subsetCounts[a] || a - b)
            .slice(0, measurement.drawSize);
    };

    // L'historique est ordonné du plus récent au plus ancien : la fenêtre récente est en tête.
    const recentTop = half >= 1 ? topFromSubset(history.slice(0, half)) : [];
    const olderTop = half >= 1 ? topFromSubset(history.slice(half)) : [];
    const overlap = recentTop.filter((n) => olderTop.includes(n)).length;
    const overlapP =
        recentTop.length > 0 && olderTop.length > 0
            ? hypergeometricUpperTail(measurement.domainMax, olderTop.length, recentTop.length, overlap)
            : null;

    const hurstZ = hurst === null ? null : (hurst - HURST_RANDOM_WALK) * Math.sqrt(samples);
    const hurstDescriptor =
        hurst === null
            ? 'non mesuré (aucune valeur fournie)'
            : `${hurst.toFixed(3)} — déviation de ${hurstZ !== null ? `${hurstZ >= 0 ? '+' : ''}${hurstZ.toFixed(2)}` : '?'} σ par rapport à la marche aléatoire (H = 0.5)`;

    const suggestedFocus = Object.keys(measurement.counts)
        .map(Number)
        .sort((a, b) => measurement.counts[b] - measurement.counts[a] || a - b)
        .slice(0, measurement.drawSize);

    const anomalies: string[] = measurement.topByZScores.slice(0, 3).map(({ number, count, z }) =>
        `N°${number} : ${count} sortie(s) observée(s) contre ${measurement.expectedPerNumber.toFixed(2)} attendue(s) — écart de ${z >= 0 ? '+' : ''}${z.toFixed(2)} σ`,
    );
    if (measurement.parityZ !== null) {
        anomalies.push(
            `Parité : ${measurement.parityZ >= 0 ? 'excès' : 'déficit'} de nombres pairs de ${Math.abs(measurement.parityZ).toFixed(2)} σ`,
        );
    }
    anomalies.push(
        `Contrôle de multiplicité : p famille = ${measurement.familyWiseP.toFixed(4)} — probabilité qu'un écart au moins égal à ${measurement.maxAbsZ.toFixed(2)} σ apparaisse par hasard parmi ${measurement.domainMax} numéros candidats.`,
    );

    const logicalAnalysis = `Mesures locales pour ${drawName} (dernier tirage : ${lastDrawDate}) sur ${samples} séquences. Domaine observé 1-${measurement.domainMax} (borne inférieure du domaine réel, non fourni par les données), ${measurement.drawSize} numéros par tirage. Régime déclaré : ${regime ?? 'non fourni'}. Exposant de Hurst ${hurstDescriptor}. Écart de fréquence maximal mesuré : ${measurement.maxAbsZ.toFixed(2)} σ (p famille = ${measurement.familyWiseP.toFixed(4)}). Ces valeurs décrivent l'historique : elles ne modifient pas la probabilité du prochain tirage.`;

    const strategicAdvice = `Sur ${samples} séquences, la fréquence la plus déviante atteint ${measurement.maxAbsZ.toFixed(2)} σ, soit une probabilité d'apparition de ${(measurement.familyWiseP * 100).toFixed(2)} % quelque part parmi ${measurement.domainMax} numéros sous équiprobabilité. Aucun de ces écarts ne modifie la probabilité de gain du prochain tirage : la seule décision rationnelle reste la maîtrise du coût (mise constante, aucune martingale).`;

    const counterfactualExplanation =
        recentTop.length > 0 && olderTop.length > 0
            ? `Contrefactuel mesuré (fenêtres de ${half} séquences) : les ${recentTop.length} numéros les plus fréquents de la fenêtre récente [${recentTop.join(', ')}] recoupent ceux de la fenêtre antérieure [${olderTop.join(', ')}] sur ${overlap} position(s). Sous équiprobabilité, la probabilité d'un recoupement au moins égal est de ${overlapP === null ? 'non calculable' : `${(overlapP * 100).toFixed(2)} %`}.`
            : undefined;

    const bayesianRecurrenceScore = computeBayesianRecurrenceScore(brier, volatility, entropy);

    const result: GeminiReasoning = {
        logicalAnalysis,
        patternType: `Déviation mesurée de la marche aléatoire : ${hurstZ === null ? 'Hurst non fourni' : `${hurstZ >= 0 ? '+' : ''}${hurstZ.toFixed(2)} σ`}`,
        nextSequence: `Série de travail (numéros classés par fréquence mesurée sur la fenêtre complète) : [${suggestedFocus.join(', ')}] — classement descriptif, sans valeur prédictive.`,
        anomalies,
        strategicAdvice,
        suggestedFocus,
        intuitionScore: overlapP === null ? 0 : Math.round(100 * (1 - overlapP)),
    };
    if (counterfactualExplanation) result.counterfactualExplanation = counterfactualExplanation;
    if (bayesianRecurrenceScore !== null) result.bayesianRecurrenceScore = bayesianRecurrenceScore;

    logicCache[cacheKey] = { data: result, expiry: Date.now() + LOGIC_CACHE_TTL_MS };
    return result;
};

/**
 * Rapport narratif 100% hors-ligne : sérialisé en JSON à partir des mesures locale de fréquence.
 * Renvoie null si aucune mesure n'est possible (l'appelant décide alors de son repli).
 */
export const getNarrativeAnalysis = async (
    drawName: string,
    history: DrawResult[],
    metrics?: Record<string, unknown>,
): Promise<string | null> => {
    const measurement = measureDrawFrequencies(history);
    if (!measurement) return null;

    const hurst = toFiniteNumber(metrics?.hurst);
    const lastDrawDate = history?.[0]?.date ?? 'date inconnue';
    const cacheKey = `${drawName}_${lastDrawDate}_${measurement.draws}`.replace(/\s+/g, '_');
    const cached = narrativeCache[cacheKey];
    if (cached && cached.expiry > Date.now()) return cached.data;

    const deviationIndex = 1 - measurement.familyWiseP;

    const output = JSON.stringify({
        summary: `Mesures locales pour ${drawName} sur ${measurement.draws} séquences (domaine observé 1-${measurement.domainMax}, ${measurement.drawSize} numéros par tirage). Écart de fréquence maximal : ${measurement.maxAbsZ.toFixed(2)} σ ; probabilité d'apparition sous équiprobabilité : p = ${measurement.familyWiseP.toFixed(4)} (indice de déviation 1-p = ${deviationIndex.toFixed(4)}). Exposant de Hurst ${hurst === null ? 'non fourni' : `= ${hurst.toFixed(3)}`}. Ces mesures décrivent l'historique et ne prédisent pas le prochain tirage.`,
        technicalVerdict: `Diagnostic descriptif : p famille = ${measurement.familyWiseP.toFixed(4)}, écart maximal ${measurement.maxAbsZ.toFixed(2)} σ, parité ${measurement.parityZ === null ? 'non mesurée' : `${measurement.parityZ >= 0 ? '+' : ''}${measurement.parityZ.toFixed(2)} σ`}. Aucune classification binaire n'est appliquée.`,
        riskAssessment: `Le hasard uniforme reste le modèle de référence : la probabilité de gain d'une combinaison donnée est inchangée par ces mesures.`,
        confidence: Math.round(100 * Math.max(0, Math.min(1, deviationIndex))),
    });

    narrativeCache[cacheKey] = { data: output, expiry: Date.now() + NARRATIVE_CACHE_TTL_MS };
    return output;
};

/**
 * Génère un script Python à partir de l'historique réel. Aucun interpréteur n'étant embarqué dans
 * l'application, le script n'est pas exécuté : les valeurs restituées sont les mesures calculées
 * localement en JavaScript, explicitement étiquetées comme telles.
 */
export const getPythonKernelAnalysis = async (
    drawName: string,
    history: DrawResult[],
    modelType: string,
    computedContext: unknown,
): Promise<{ script?: string; stdout?: string[]; insight?: string } | null> => {
    const measurement = measureDrawFrequencies(history);
    const sequences = (history || []).slice(0, 30).map((h) => h.gagnants || []);

    const script = `import numpy as np

# Script genere localement par Nexus. AUCUN interpreteur Python n'est embarque dans l'application :
# ce code n'a pas ete execute. Les valeurs affichees par l'interface proviennent de mesures JavaScript locales.
# Jeu : ${drawName}
# Modele demande : ${modelType}
# Contexte calcule transmis a la generation : ${JSON.stringify(computedContext ?? {})}

history = [${sequences.map((row) => `[${row.join(', ')}]`).join(', ')}]
print(f"[NEXUS INFO] Sequences chargees : {len(history)}")
lengths = {len(row) for row in history}
print(f"[NEXUS INFO] Tailles de tirage observees : {sorted(lengths)}")
`;

    const stdout = [
        "[NEXUS INFO] Aucun interpreteur Python n'est embarque : le script ci-dessus n'a pas ete execute.",
        measurement
            ? `[NEXUS MESURE] Sequences analysees localement (JavaScript) : ${measurement.draws}.`
            : '[NEXUS MESURE] Historique indisponible : aucune sequence analysee.',
        measurement
            ? `[NEXUS MESURE] Domaine observe : 1-${measurement.domainMax} ; taille de tirage modale : ${measurement.drawSize}.`
            : '[NEXUS MESURE] Domaine : non mesure.',
        measurement
            ? `[NEXUS MESURE] Ecart de frequence maximal : ${measurement.maxAbsZ.toFixed(2)} sigma (p famille = ${measurement.familyWiseP.toFixed(4)}).`
            : '[NEXUS MESURE] Ecart de frequence : non mesure.',
    ];

    const insight = measurement
        ? `Le modele "${modelType}" n'a produit aucune execution. Les seules valeurs disponibles sont les mesures locales ci-dessus (${measurement.draws} sequences, ${measurement.domainMax} numeros candidats, ecart maximal ${measurement.maxAbsZ.toFixed(2)} sigma). Aucune composante harmonique ni sortie de noyau n'est revendiquee sans execution reelle.`
        : `Le modele "${modelType}" n'a produit aucune execution et l'historique est insuffisant pour une mesure locale : aucune valeur n'est revendiquee.`;

    return { script, stdout, insight };
};

/**
 * Autopsie post-tirage : chaque chiffre avancé est testé. Le recouvrement exact est comparé à
 * l'attendu hypergéométrique sur un domaine borné par le plus grand numéro observé (borne
 * inférieure conservative), et l'indice de confiance restitué est une couverture diagnostique,
 * pas une probabilité de succès.
 */
export const generateAutopsyAnalysis = async (
    drawName: string,
    predicted: number[],
    actual: number[],
    machine: number[],
    exactHits: number,
    nearMissesCount: number,
    machineHits: number,
    rmse?: number,
    spectralDeviations: SpectralDeviation[] = [],
    entropyCollapse?: boolean,
    benfordCompliance?: number,
): Promise<{ analysis: string; recommendations: string[]; confidence: number; isBlackSwan: boolean } | null> => {
    const observedNumbers = [...(predicted || []), ...(actual || []), ...(machine || [])].filter(
        (n) => Number.isFinite(n) && n >= 1,
    );
    if (observedNumbers.length === 0) return null;

    const domain = Math.max(...observedNumbers);
    const predictedSet = new Set((predicted || []).filter((n) => Number.isFinite(n) && n >= 1));
    const actualNumbers = (actual || []).filter((n) => Number.isFinite(n) && n >= 1);
    const measuredHits = actualNumbers.filter((n) => predictedSet.has(n)).length;
    const reportedHitsConsistent = measuredHits === exactHits;

    const drawsCount = actualNumbers.length;
    const markedCount = predictedSet.size;
    const expectedHits = (drawsCount * markedCount) / domain;
    const upperTail = hypergeometricUpperTail(domain, markedCount, drawsCount, measuredHits);
    const lowerTailInclusive = hypergeometricUpperTail(domain, markedCount, drawsCount, measuredHits + 1);
    const twoSidedP =
        upperTail === null || lowerTailInclusive === null
            ? null
            : Math.min(1, 2 * Math.min(upperTail, 1 - lowerTailInclusive));

    const expectedNearMisses = (2 * markedCount * drawsCount) / domain;
    const relativeRmse =
        domain > 0 && typeof rmse === 'number' && Number.isFinite(rmse)
            ? rmse / domain
            : null;
    const benfordMeasured = toFiniteNumber(benfordCompliance);

    // Diagnostics réellement disponibles : base de l'indice de couverture et du seuil de singularité.
    const availableDiagnostics: string[] = [];
    if (upperTail !== null) availableDiagnostics.push('queue supérieure hypergéométrique');
    if (lowerTailInclusive !== null) availableDiagnostics.push('queue inférieure hypergéométrique');
    if (relativeRmse !== null) availableDiagnostics.push('RMSE relative au domaine observé');
    if (spectralDeviations.length > 0) availableDiagnostics.push('déviations spectrales transmises');
    if (benfordMeasured !== null) availableDiagnostics.push('conformité de Benford');
    if (typeof entropyCollapse === 'boolean') availableDiagnostics.push("état d'effondrement entropique");
    if ((machine || []).length > 0) availableDiagnostics.push('transferts machine');

    const totalDiagnostics = 7;
    const coverage = Math.round((100 * availableDiagnostics.length) / totalDiagnostics);
    // Seuil de singularité dérivé du nombre de diagnostics : p minimal attendu sous uniformité
    // pour m tirages indépendants, soit 1/(m+1). Aucune constante de décision arbitraire.
    const singularityThreshold = availableDiagnostics.length > 0 ? 1 / (availableDiagnostics.length + 1) : null;
    const isBlackSwan = twoSidedP !== null && singularityThreshold !== null && twoSidedP < singularityThreshold;

    const analysis = [
        `Autopsie mesurée du tirage ${drawName}.`,
        `Recouvrement exact : ${measuredHits} numéro(s) prédit(s) parmi ${drawsCount} tiré(s), contre ${expectedHits.toFixed(2)} attendu(s) sous équiprobabilité sur un domaine observé de ${domain} numéros (borne inférieure : un domaine réel plus large ne ferait que réduire cet attendu).`,
        upperTail === null
            ? `Queue supérieure hypergéométrique : non calculable (paramètres de tirage incomplets).`
            : `Queue supérieure hypergéométrique : p(X >= ${measuredHits}) = ${upperTail.toFixed(4)} ; p bilatéral = ${twoSidedP?.toFixed(4)}.`,
        reportedHitsConsistent
            ? `Le compteur transmis (${exactHits}) est cohérent avec le recouvrement recalculé.`
            : `Incohérence interne : le compteur transmis (${exactHits}) diffère du recouvrement recalculé (${measuredHits}) ; les statistiques ci-dessus utilisent la valeur recalculée.`,
        `Frôlements : ${nearMissesCount} observé(s) contre environ ${expectedNearMisses.toFixed(2)} attendu(s) pour des voisins à ±1 sous équiprobabilité.`,
        relativeRmse === null
            ? `RMSE transmise : non exploitable.`
            : `RMSE transmise : ${(relativeRmse * domain).toFixed(3)}, soit ${relativeRmse.toFixed(4)} rapporté au domaine observé.`,
        benfordMeasured === null
            ? `Conformité de Benford : non mesurée (aucune valeur transmise).`
            : `Conformité de Benford : ${(benfordMeasured * 100).toFixed(1)} %.`,
        entropyCollapse === undefined
            ? `Effondrement entropique : non mesuré.`
            : `Effondrement entropique : ${entropyCollapse ? 'signalé par le moteur' : 'non signalé'}.`,
        spectralDeviations.length > 0
            ? `Déviations spectrales transmises (${spectralDeviations.length}) : ${spectralDeviations
                  .slice(0, 3)
                  .map((d) => `N°${d.number} (Δ ${d.delta.toFixed(2)})`)
                  .join(', ')}.`
            : `Déviations spectrales : aucune transmise.`,
        `Couverture diagnostique : ${coverage} % (${availableDiagnostics.length}/${totalDiagnostics} diagnostics disponibles) — mesure de complétude, pas une probabilité de succès.`,
        twoSidedP === null
            ? `Singularité : non évaluable.`
            : `Singularité : p bilatéral ${twoSidedP.toFixed(4)} contre un seuil de ${singularityThreshold?.toFixed(4)} dérivé du nombre de diagnostics (p minimal attendu sous uniformité pour ${availableDiagnostics.length} diagnostics).`,
    ].join(' ');

    const recommendations: string[] = [];
    if (twoSidedP !== null) {
        recommendations.push(
            `Recouvrement mesuré : p bilatéral = ${twoSidedP.toFixed(4)} sur ${domain} numéros — indice de déviation 1-p = ${(1 - twoSidedP).toFixed(4)}.`,
        );
    } else {
        recommendations.push(`Recouvrement non testable : compléter les numéros prédits et réels pour rendre l'attendu hypergéométrique calculable.`);
    }
    recommendations.push(
        `Comparer les frôlements observés (${nearMissesCount}) à l'attendu sous équiprobabilité (${expectedNearMisses.toFixed(2)}) avant toute modification de filtre.`,
    );
    if ((machine || []).length > 0) {
        recommendations.push(`Transferts machine : ${machineHits} numéro(s) en commun — mesuré, sans effet démontré sur la probabilité de gain.`);
    } else {
        recommendations.push(`Aucun numéro machine transmis : les algorithmes de transfert n'ont pas d'entrée à exploiter pour ce tirage.`);
    }
    if (entropyCollapse === true) {
        recommendations.push(`Effondrement entropique signalé : vérifier la mesure d'entropie source ; aucun ajustement automatique n'est appliqué.`);
    }
    recommendations.push(`Diagnostics disponibles : ${availableDiagnostics.join(', ') || 'aucun'}.`);

    return { analysis, recommendations, confidence: coverage, isBlackSwan };
};

/**
 * Synthèse stratégique globale construite uniquement sur les rapports médico-légaux fournis.
 * Les impacts cumulés sont confrontés à leur attendu hypergéométrique (approximation de Poisson
 * pour la variance), et toute grandeur absente est déclarée non mesurée.
 */
export const generateGlobalForensicSynthesis = async (
    reports: Array<unknown>,
): Promise<{ synthesis: string; focalPoints: string[]; overallCalibration: string } | null> => {
    const forensicReports = (reports || []).filter(
        (r): r is ForensicReport => Boolean(r && typeof r === 'object' && ('matches' in r || 'rmse' in r)),
    );

    const totalAudits = forensicReports.length;
    if (totalAudits === 0) {
        return {
            synthesis: `Aucun rapport médico-légal enregistré : la synthèse globale ne contient aucune mesure (0 autopsie).`,
            focalPoints: [
                'Produire des autopsies (Forensic) pour alimenter la synthèse',
                'Aucune tendance ne peut être déclarée sans rapport source',
                "Aucune calibration globale n'est affichée tant que la mesure est vide",
            ],
            overallCalibration: 'Indéterminé (0 rapport)',
        };
    }

    let totalHits = 0;
    let pairedHits = 0;
    let totalExpectedHits = 0;
    let pairedAudits = 0;
    let totalNearMisses = 0;
    let totalRmse = 0;
    let rmseCount = 0;
    let totalBenford = 0;
    let benfordCount = 0;
    let blackSwanCount = 0;
    let entropyCollapseCount = 0;

    const algoHitsMap: Record<string, number> = {};
    const algoDriftMap: Record<string, number> = {};

    forensicReports.forEach((rep) => {
        if (Array.isArray(rep.matches)) {
            const predictedNumbers = rep.matches.map((m) => m.predicted).filter((n) => Number.isFinite(n) && n >= 1);
            const actualNumbers = rep.matches
                .map((m) => m.actual)
                .filter((n): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 1);
            const hits = rep.matches.filter((m) => m.errorType === 'Hit').length;

            totalHits += hits;
            totalNearMisses += rep.matches.filter(
                (m) => m.errorType === 'Voisin' || m.errorType === 'Miroir' || m.errorType === 'Shadow',
            ).length;

            if (predictedNumbers.length > 0 && actualNumbers.length > 0) {
                const domain = Math.max(...predictedNumbers, ...actualNumbers);
                if (domain > 0) {
                    pairedHits += hits;
                    totalExpectedHits += (actualNumbers.length * predictedNumbers.length) / domain;
                    pairedAudits += 1;
                }
            }
        }

        if (typeof rep.rmse === 'number' && Number.isFinite(rep.rmse)) {
            totalRmse += rep.rmse;
            rmseCount += 1;
        }

        if (typeof rep.benfordCompliance === 'number' && Number.isFinite(rep.benfordCompliance)) {
            totalBenford += rep.benfordCompliance;
            benfordCount += 1;
        }

        if (rep.isBlackSwan) blackSwanCount += 1;
        if (rep.entropyCollapse) entropyCollapseCount += 1;

        if (Array.isArray(rep.algorithmicDrift)) {
            rep.algorithmicDrift.forEach((d) => {
                algoDriftMap[d.algo] = (algoDriftMap[d.algo] || 0) + d.driftScore;
            });
        }
        if (Array.isArray(rep.missedOpportunities)) {
            rep.missedOpportunities.forEach((mo) => {
                if (mo.bestAlgo) {
                    algoHitsMap[mo.bestAlgo] = (algoHitsMap[mo.bestAlgo] || 0) + 1;
                }
            });
        }
        if (Array.isArray(rep.counterfactuals)) {
            rep.counterfactuals.forEach((cf) => {
                if (cf.potentialHits > 0) {
                    algoHitsMap[cf.algo] = (algoHitsMap[cf.algo] || 0) + cf.potentialHits;
                }
            });
        }
    });

    const meanHits = totalHits / totalAudits;
    const meanRmse = rmseCount > 0 ? totalRmse / rmseCount : null;
    const meanBenfordPct = benfordCount > 0 ? (totalBenford / benfordCount) * 100 : null;
    const blackSwanRate = (100 * blackSwanCount) / totalAudits;

    // z de Poisson : variance = moyenne pour des événements rares sous équiprobabilité.
    const hitsZ = totalExpectedHits > 0 ? (pairedHits - totalExpectedHits) / Math.sqrt(totalExpectedHits) : null;
    const hitsTwoSidedP = hitsZ === null ? null : Math.min(1, 2 * (1 - normalCdf(Math.abs(hitsZ))));
    const hitsDeviationIndex = hitsTwoSidedP === null ? null : 1 - hitsTwoSidedP;

    const sortedHitsAlgos = Object.entries(algoHitsMap).sort((a, b) => b[1] - a[1]);
    const topAlgoName = sortedHitsAlgos[0]?.[0] ?? null;

    const sortedDriftAlgos = Object.entries(algoDriftMap).sort((a, b) => b[1] - a[1]);
    const mostDriftedAlgo = sortedDriftAlgos[0]?.[0] ?? null;

    const hitsZText =
        hitsZ === null
            ? 'attendu hypergéométrique non calculable'
            : `z = ${hitsZ.toFixed(2)}, p bilatéral = ${hitsTwoSidedP?.toFixed(4)}`;

    const synthesis = `Synthèse consolidée sur ${totalAudits} autopsie(s) : ${totalHits} impact(s) exact(s) cumulé(s) contre ${totalExpectedHits.toFixed(2)} attendu(s) sous équiprobabilité (${hitsZText}, sur ${pairedAudits}/${totalAudits} rapport(s) exploitables). ${totalNearMisses} frôlement(s) recensé(s). RMSE moyen : ${
        meanRmse === null ? 'non mesuré' : meanRmse.toFixed(2)
    } ; conformité de Benford : ${
        meanBenfordPct === null ? 'non mesurée' : `${meanBenfordPct.toFixed(1)} %`
    } ; singularités signalées : ${blackSwanCount}/${totalAudits} (${blackSwanRate.toFixed(1)} %). ${
        topAlgoName
            ? `Composante la plus citée par les rapports : [${topAlgoName}] — contribution déclarée par les autopsies, non validée hors échantillon.`
            : `Aucune composante algorithmique n'est citée par les rapports : le classement des contributions reste vide.`
    } Le domaine utilisé rapport par rapport est la borne inférieure donnée par le plus grand numéro observé : un domaine réel plus large ne ferait que réduire l'écart attendu.`;

    const focalPoints: string[] = [];
    focalPoints.push(
        hitsZ === null
            ? "Compléter les rapports (numéros prédits et réels) pour rendre l'attendu hypergéométrique calculable"
            : `Écart d'impacts cumulés : ${hitsZ >= 0 ? '+' : ''}${hitsZ.toFixed(2)} σ (indice de déviation 1-p = ${((hitsDeviationIndex ?? 0) * 100).toFixed(1)} %)`,
    );
    focalPoints.push(
        mostDriftedAlgo
            ? `Amortir la dérive de l'estimateur [${mostDriftedAlgo}] : score de dérive cumulé le plus élevé des rapports`
            : "Aucune dérive algorithmique déclarée dans les rapports : rien à amortir",
    );
    focalPoints.push(
        entropyCollapseCount > 0
            ? `Effondrements d'entropie signalés : ${entropyCollapseCount}/${totalAudits} — vérifier la source de la mesure d'entropie`
            : "Aucun effondrement d'entropie signalé dans les rapports",
    );
    if (benfordCount === 0) {
        focalPoints.push(`Conformité de Benford absente de tous les rapports : ce volet n'est pas mesuré.`);
    }

    const overallCalibration =
        hitsZ === null
            ? 'Indéterminé : aucun attendu hypergéométrique calculable (rapports incomplets)'
            : `Impacts : ${pairedHits} observés contre ${totalExpectedHits.toFixed(2)} attendus sur ${pairedAudits} rapport(s) — ${hitsZText}`;

    return { synthesis, focalPoints, overallCalibration };
};

/**
 * Lecture optique de ticket : aucune capacité d'OCR n'existe dans le client. L'OCR réel est
 * assuré par la fonction Edge (Gemini Vision), qui dispose du modèle multimodal. Fabriquer des
 * numéros localement reviendrait à présenter des données synthétiques comme une lecture réelle.
 */
export const scanTicket = async (
    _imageBase64: string,
): Promise<{ gagnants?: number[]; date?: string; machine?: number[] } | null> => null;
