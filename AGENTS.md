# AGENTS.md

## CONSIGNES DE DÉVELOPPEMENT & PRINCIPES ARCHITECTURAUX

### 1. PHILOSOPHIE MATHÉMATIQUE (NON NÉGOCIABLE)
- **ZÉRO NOMBRES MAGIQUES** : Interdiction d'introduire des constantes arbitraires (par exemple, des coefficients arbitraires d'amortissement, des seuils de décision fixes comme 0.05 ou 30%). Tous les paramètres, poids et valeurs d'amortissement doivent être calculés de façon continue par des fonctions différentiables, des métriques statistiques réelles (Variance, Entropie, Exposant de Hurst, PDF/CDF Gaussiennes) ou des estimations objectives basées sur l'historique complet disponible.
- **ZÉRO HASARD / 100% DÉTERMINISTE** : Aucun appel direct ou indirect à `Math.random()`, `crypto.getRandomValues()` ou d'autres générateurs de nombres pseudo-aléatoires non seedés au sein du moteur d’inférence, des workers ML, d'ACO, des forêts de décision ou des réseaux de neurones. L'exécution globale doit être 100% reproductible à partir des mêmes historiques et filtres temporels. Si une perturbation est requise (par exemple dans les étapes stochastiques ou de recuit simulé), utiliser un LCG (Linear Congruential Generator) à seed canonique déterministe ou des convolutions trigonométriques continues basées sur les horodatages des tirages.
- **CONTINUITÉ DES TRANSITIONS et DÉCISIONS** : Éviter les bifurcations de seuils binaires (`if (score > T) { success = true } else { ... }`). Remplacer systématiquement les portes d'activation brusques par des fonctions de mapping continu (Sigmoïde logistique, tangente hyperbolique, distribution de Cauchy ou fonctions gaussiennes d'étalement) pour conserver la structure gradient-like du paysage d'inférence.

### 2. ISOLATION ABSOLUE DES DONNÉES DU TIRAGE (TIRAGE ISOLATION RULE)
- **UN ESTIMATEUR PAR TIRAGE** : Chaque nom de tirage (par exemple, "Loto 5/90", "EuroMillions", "Powerball") dispose de son historique propre et exclusif. 
- **ZÉRO POLLUTION INTER-TIRAGES** : Il est strictement interdit d'entraîner, de calculer des corrélations, d'extraire des caractéristiques ou de faire transiter des matrices d'affinités ou des modèles de transition Markovienne d'un tirage vers un autre.
- **ISOLATION DU CACHING** : Les clés de cache de toutes les matrices d'inférence (features, poids optimisés, rapports médico-légaux, scores de prédiction) doivent inclure explicitement et de manière unique le nom du tirage (`drawName` / `tirageName`).
- **CONVERGENCE SUR HISTORIQUE PROPRE** : Lors des calculs de backtesting, de simulation Time Machine ou d'optimisation (moteur cybernétique, réseaux neuronaux, descentes de coordonnées), on filtre rigoureusement l'historique et les prédictions sur le jeu de données délimité du tirage actif.
