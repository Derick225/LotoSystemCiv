# AGENTS.md

## CONSIGNES DE DÉVELOPPEMENT & PRINCIPES ARCHITECTURAUX

### 1. PHILOSOPHIE MATHÉMATIQUE (NON NÉGOCIABLE)
- **ZÉRO NOMBRES MAGIQUES** : Interdiction d'introduire des constantes arbitraires (par exemple, des coefficients arbitraires d'amortissement, des seuils de décision fixes comme 0.05 ou 30%). Tous les paramètres, poids et valeurs d'amortissement doivent être calculés de façon continue par des fonctions différentiables, des métriques statistiques réelles (Variance, Entropie, Exposant de Hurst, PDF/CDF Gaussiennes) ou des estimations objectives basées sur l'historique complet disponible.
- **ZÉRO HASARD / 100% DÉTERMINISTE** : Aucun appel direct ou indirect à `Math.random()`, `crypto.getRandomValues()` ou d'autres générateurs de nombres pseudo-aléatoires non seedés au sein du moteur d’inférence, des workers ML, d'ACO, des forêts de décision ou des réseaux de neurones. L'exécution globale doit être 100% reproductible à partir des mêmes historiques et filtres temporels. Si une perturbation est requise (par exemple dans les étapes stochastiques ou de recuit simulé), utiliser un LCG (Linear Congruential Generator) à seed canonique déterministe ou des convolutions trigonométriques continues basées sur les horodatages des tirages.
- **CONTINUITÉ DES TRANSITIONS et DÉCISIONS** : Éviter les bifurcations de seuils binaires (`if (score > T) { success = true } else { ... }`). Remplacer systématiquement les portes d'activation brusques par des fonctions de mapping continu (Sigmoïde logistique, tangente hyperbolique, distribution de Cauchy ou fonctions gaussiennes d'étalement) pour conserver la structure gradient-like du paysage d'inférence.

### 2. ISOLATION DES DONNÉES & RELATIONS INTER-TIRAGES AUTORISÉES
- **UN ESTIMATEUR PAR TIRAGE HORS FAMILLE** : Chaque tirage dispose de son historique propre et exclusif pour les métriques intra-tirage fondamentales.
- **CADRE STRICT DES RELATIONS INTER-TIRAGES (3 FAMILLES ÉTANCHES)** :
  Les relations inter-tirages (transitions stochastiques Markov, reports direct carry-over, résonances harmoniques) sont autorisées et modélisées STRICTEMENT au sein de 3 familles fermées et étanches :
  1. **Famille Nationale LONACI** : Tirages de 10H, 16H et exclusivement le tirage de 19H55 du dimanche (Espoir).
  2. **Famille Zénith (13H)** : Ensemble des tirages de 13H exclusivement.
  3. **Famille Nocturne (19H55)** : Ensemble des tirages de 19H55 exclusivement.
- **ZÉRO POLLUTION INTER-FAMILLES** : Il est strictement interdit d'entraîner, de calculer des corrélations ou de croiser des données entre deux familles distinctes (ex: 13H et 19H55 ne se croisent jamais).
- **ISOLATION DU CACHING** : Les clés de cache de toutes les matrices d'inférence et d'analyse inter-tirages doivent inclure explicitement et de manière unique l'identifiant de la famille et les noms des tirages (`nexus_interdraw_${familyId}_${drawName}`).
- **ZÉRO NOMBRES MAGIQUES & DÉTERMINISME** : Les calculs inter-tirages reposent sur des fonctions différentiables et des fréquences réelles lissées (Laplace continu dérivé de la variance). Aucun appel aléatoire non déterministe.
