# Méthodologie de Scoring et Justifications Statistiques

La présente documentation explique les composants de l'algorithme de calcul des probabilités et d'analyse comportementale de l'application. Elle explicite comment les scores temporels, fréquentiels, et spatiaux sont générés et combinés pour formuler des hypothèses de recommandations.

## 1. Moteur PCA (Principal Component Analysis)
**Objectif :** Réduire le bruit dimensionnel.
*Pourquoi ?* 
Dans un jeu de tirage, chaque numéro a des dizaines de caractéristiques (fréquence, écart depuis le dernier tirage, affinités avec la machine...). Beaucoup de ces 'features' sont corrélées. 
- *Justification statistique :* L'application de la décomposition en valeurs propres (Eigen-decomposition) sur la matrice de covariance isole les vecteurs dominants (les combinaisons de variables qui expliquent 95% de la variance). On 'lisse' ainsi les faux signaux (bruit). L'estimateur garantit ainsi que les probabilités se basent sur des macro-tendances et non des fluctuations isolées.

## 2. Modèle de Poisson & Loi Binomiale Négative
**Objectif :** Modéliser les événements rares.
*Pourquoi ?*
Le loto n'est pas une loi normale, car les occurrences des tirages obéissent à des probabilités discrètes indépendantes initialement, mais l'analyse locale temporelle se modélise bien via un processus de M/M/1. 
- *Loi de Poisson :* On calcule le paramètre Lambda ($\lambda$) qui est le taux moyen d'apparition sur K tirages. La probabilité d'une absence prolongée (P(k=0)) ou d'un réveil subit est comparée aux attentes mathématiques pures. Tout écart significatif engendre un signal de "Rupture de Poisson".

## 3. Dynamique de Markov et Graphes de Transition
**Objectif :** Détecter la force des chaînes séquentielles (N implique N+1).
*Pourquoi ?*
- L'algorithme regarde comment l'état T influence l'état T+1.
- *Justification :* Les machines mécaniques (bien que pseudo-isolées) souffrent de microrugosités ou de biais magnétiques/thermiques infimes au fil des sphères. En analysant la matrice de transition stochastique, en observant que `P(B | A)` est statistiquement supérieur à l'événement indépendant `P(B)`, notre heuristique `AffinityMap` confère un boost additif à `B` lorsque `A` se présente. 

## 4. Thermodynamique et Entropie
**Objectif :** Diagnostiquer les 'Cycles'.
*Pourquoi ?* 
Le "Collapsus Entropique" (Entropy Collapse) détecte un phénomène d'hypo-dispersion.
- *Modélisation :* L'entropie de Shannon de la distribution empirique est H. Lorsque H normalisé approche 1, aucun modèle ne peut prédire l'événement. Si H < 0.85, la distribution se contracte de façon anormale, signalant que le hasard est temporairement bridé et que certains numéros focalisent toute l'énergie du système de tirage (détection des biais mécaniques profonds).

## 5. Régression Ridge (Pénalité L2)
**Objectif :** Machine learning "White Box".
*Pourquoi ?*
- *Justification ML :* Pour associer les variables prédictives au résultat final sans tomber dans le surapprentissage (overfitting) souvent inévitable lors de petits échantillons, le moteur utilise la régression multivariée Ridge. La pénalité Lambda (`λ=0.1`) permet de ne pas accorder trop de poids à une anomalie passagère et "shrink" les coefficients, assurant d'avoir un comportement robuste sur la prédiction (Walk-Forward).

## 6. Analyse Spectrale
**Objectif :** Analyse du cycle temps/fréquence via Transformée de Fourier.
*Pourquoi ?*
Certaines boules obéissent à des cycles harmoniques (par exemple, retour toutes les 14 semaines suite au remplacement d'un lot). Les algorithmes FFT ou la Décomposition en ondelettes de Haar extraient "l'énergie" du signal.

## Architecture de Combinaison de la "Chambre de Fusion"
1. **Extraction (Feature Extractor) :** 40 micro-scores (ex: Gap Velocity, Resistance).
2. **Standardisation :** Z-Score ou MinMax pour mettre tout sur le même pied d'égalité. 
3. **Pondération (Nexus) :** Poids dynamiques selon le profil de risque. 
4. **Denoising (PCA) :** Le score hybride est lissé avec les composantes principales.
5. **Thermodynamique de Laplace (Chaos) :** Pour forcer l'exploration, injecte du bruit probabiliste (Noise) pour explorer des zones de recherche inexplorées.
