import { AlgoKey } from '../../../shared/prediction.types';
import { AlgorithmPlugin } from '../algorithmRegistry';

export const derivedNeighborPlugin: AlgorithmPlugin = {
  key: AlgoKey.DERIVED_NEIGHBOR as any, // Type cast for new key
  category: 'meta', // Meta-algorithme car il observe les autres
  stability: 'stable',
  mathematicalBasis: 'Topologie de Voisinage et Symétrie (Transformations Linéaires)',
  description: 'Calcule l\'affinité avec les transformations (+1, -1, ombre, miroir) des numéros fortement pressentis par les algorithmes principaux.',
  isStrictlyDeterministic: true,

  precompute(ctx) {
    const N = 90;
    // 1. Identifier les "numéros choisis" par les autres algorithmes (proxy via les features de base)
    // On agrège freqMap, markovMap et momentumMap pour trouver les favoris actuels
    const proxyScores: { num: number; score: number }[] = [];
    
    // Normaliser les features pour faire une somme
    const maxFreq = Math.max(0.001, ...Array.from(ctx.features.freqMap));
    const maxMarkov = Math.max(0.001, ...Array.from(ctx.features.markovMap));
    const maxMomentum = Math.max(0.001, ...Array.from(ctx.features.momentumMap));

    for (let i = 1; i <= N; i++) {
        const freqVal = (ctx.features.freqMap[i] || 0) / maxFreq;
        const markovVal = (ctx.features.markovMap[i] || 0) / maxMarkov;
        const momentumVal = (ctx.features.momentumMap[i] || 0) / maxMomentum;
        
        // Poids équivalent pour estimer le choix des autres algos
        const proxyScore = (freqVal + markovVal * 1.5 + momentumVal * 0.8) / 3.3;
        proxyScores.push({ num: i, score: proxyScore });
    }

    // Prendre les 10 meilleurs comme "choisis par les autres algos"
    proxyScores.sort((a, b) => b.score - a.score);
    const topChosen = proxyScores.slice(0, 10).map(p => p.num);

    // 2. Calculer l'affinité historique des transformations
    // Vérifier à quelle fréquence, quand un numéro X sort, son voisin, miroir ou ombre sort (dans le même tirage ou le suivant)
    // Pour simplifier et rester 100% déterministe, on va mapper les transformations des top numéros.
    const transformMap: Record<number, { type: string, source: number }[]> = {};

    topChosen.forEach(chosen => {
        // Transformation +1
        const plus1 = chosen === 90 ? 1 : chosen + 1;
        if (!transformMap[plus1]) transformMap[plus1] = [];
        transformMap[plus1].push({ type: '+1', source: chosen });

        // Transformation -1
        const minus1 = chosen === 1 ? 90 : chosen - 1;
        if (!transformMap[minus1]) transformMap[minus1] = [];
        transformMap[minus1].push({ type: '-1', source: chosen });

        // Ombre (Shadow): Complémentaire à 90 (ou 91 pour que 1->90)
        const shadow = 91 - chosen;
        if (shadow >= 1 && shadow <= 90) {
            if (!transformMap[shadow]) transformMap[shadow] = [];
            transformMap[shadow].push({ type: 'ombre', source: chosen });
        }

        // Miroir (Mirror): Inversion des chiffres
        const strNum = chosen.toString().padStart(2, '0');
        const reversedStr = strNum.split('').reverse().join('');
        const mirror = parseInt(reversedStr, 10);
        if (mirror >= 1 && mirror <= 90 && mirror !== chosen) {
            if (!transformMap[mirror]) transformMap[mirror] = [];
            transformMap[mirror].push({ type: 'miroir', source: chosen });
        }
    });

    ctx.pluginCache = ctx.pluginCache || {};
    ctx.pluginCache[AlgoKey.DERIVED_NEIGHBOR] = {
        transformMap,
        topChosen
    };
  },

  evaluate(num, ctx) {
    if (!ctx.pluginCache?.[AlgoKey.DERIVED_NEIGHBOR]) {
        this.precompute(ctx);
    }
    const cache = ctx.pluginCache![AlgoKey.DERIVED_NEIGHBOR];
    const transformations = cache.transformMap[num];

    if (!transformations || transformations.length === 0) {
        return {
            score: 0,
            confidence: 0.5,
            metadata: { derived: false }
        };
    }

    // Le score dépend du nombre de transformations qui pointent vers ce numéro.
    // Ex: Si le numéro 12 est le miroir de 21 (qui est choisi) ET le voisin de 11 (qui est choisi),
    // son score sera très élevé.
    const baseScorePerTransform = 35.0; 
    const rawScore = transformations.length * baseScorePerTransform;

    // Lissage continu avec tangente hyperbolique pour contraindre entre 0 et 100
    // tanh(x) * 100
    const normalizedScore = Math.tanh(rawScore / 100.0) * 100.0;

    return {
        score: Math.max(0, Math.min(100, normalizedScore)),
        confidence: 0.90,
        metadata: { 
            derived: true, 
            transformations: transformations 
        }
    };
  }
};
