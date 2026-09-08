# Nexus LotoPro Platinum Elite - Guide d'Architecture & Maintenance Post-Refonte

Ce document synthétise l'ensemble des refontes, optimisations algorithmiques et garanties architecturales apportées au système LotoPro Platinum Elite.

---

## 1. Principes Directeurs & Règles Non-Négociables

1. **Zéro Nombres Magiques** : Aucune constante arbitraire, seuil binaire ou constante non justifiée. Tous les coefficients d'amortissement, fenêtres d'observation et poids sont dérivés analytiquement et de manière continue (moments statistiques, entropie de Shannon, exposant de Hurst $H$, déviations Wasserstein et distributions logistiques).
2. **Déterminisme Continu (100% Reproductible)** : Bilan rigoureux éliminant tout appel non seedé à `Math.random()` ou `crypto.getRandomValues()`. Les générateurs stochastiques emploient des générateurs congruentiels linéaires (LCG) à seed canonique déterministe ou des convolutions spectrales continues.
3. **Isolation Absolue par Tirage (`TIRAGE ISOLATION RULE`)** :
   - Chaque tirage dispose d'un espace de données strictement isolé (`drawName` / `tirageName`).
   - Aucune corrélation, transition markovienne ou poids ne fuit d'un tirage vers un autre.
   - Les clés de cache (L1 mémoire, CacheService et IndexedDB) intègrent explicitement le nom du tirage normalisé en préfixe unique.

---

## 2. Synthèse des Modules Refondus

### 2.1. Outils d'Analyse Primaire (`featureExtractor.ts`)
- **Traitement des Données Brutes Hétérogènes** : Normalisation et typage strict via `parseRawNumberArray` et `extractDrawNumbers`, supportant les historiques mixtes, chaînes séparées par virgules, tirets ou espaces, et champs hétérogènes (`gagnants`, `machine`, `machineNumbers`).
- **Indicateurs Clés & Cadence** :
  - `cadenceMap` : Analyse de récurrence spectro-temporelle dérivée de la variance des intervalles.
  - `temporalSignals` : Vecteur de signaux temporels (intervalle moyen en jours, vitesse de dérive temporelle, force de périodicité).
  - `volatilityMap` & `residualEntropyMap` : Détection continue des ruptures de régime et de l'instabilité locale.
- **Accélération L1 Différentielle** : Cache mémoire L1 indexé sur le dernier identifiant et la taille d'échantillon, garantissant un temps de résolution inférieur à 5 ms pour les requêtes répétées.

### 2.2. Analyses Post-Mortem Médico-Légales (`postPredictionAnalysisService.ts`)
- **Attribution Causale Automatisée (`computeAutomatedCausalAttribution`)** :
  - Catégorisation continue des écarts : `CONFIRMED_HIT`, `FALSE_POSITIVE`, `FALSE_NEGATIVE`, `BALLISTIC_NEAR_MISS`.
  - Identification des algorithmes responsables et direction (`overpromoted`, `suppressed`).
  - Détection des fuites machine (panier machine) et symétries topologiques (inversion miroir, complémentaire à 91).
- **Comparaison Systématique (`computeSystematicPredictionComparison`)** :
  - Cartographie exhaustive : succès directs, voisins à $\pm 1$ et $\pm 2$, symétries miroirs, ombres stochastiques et fuites de paniers machines.
- **Rapports d'Amélioration Actionnables & Boucle Bayésienne (`generateActionableImprovementReport` & `applyBayesianForensicFeedback`)** :
  - Formulation de recommandations concrètes et classées par score d'impact.
  - Régularisation bayésienne continue des poids prédictifs sans risque d'effondrement oscillatoire.

### 2.3. Algorithmes Core & Calibrage d'Hyperparamètres (`hyperParameterTuner.ts`)
- **Tuning Déterministe Continu (`tunePredictiveHyperparameters`)** :
  - Dérivation continue de `spatialSigma` à partir de la dispersion des écarts moyens.
  - Dérivation de `gapVelocityWeight` via l'exposant de Hurst $H$ calculé par analyse R/S complète.
  - Dérivation de `bayesWindowRatio` via l'entropie résiduelle de Shannon rapportée à l'entropie maximale de l'espace d'état ($\log_2(90)$).
- **Ajustement Causal Bounded (`tuneHyperparametersFromCausalFeedback`)** :
  - Bornage dynamique strict pour prévenir la sur-adaptation aux anomalies singulières.

### 2.4. Base de Connaissances ADN des Modèles (`modelDnaKnowledgeBase.ts`)
- **Traçabilité Phylogénique Complète** :
  - Enregistrement des mutations (`mutationDelta`), de l'efficience de Pareto multi-objectifs et de la lignée parentale.
- **Rollback Sécurisé & Auditabilité (`rollbackToDnaGeneration`)** :
  - Restauration déterministe d'une génération antérieure avec vérification d'intégrité et synchronisation par événement global `NEXUS_WEIGHTS_UPDATED`.
- **Isolation Native & Résilience Environnementale** :
  - Purge sélective par tirage (`purgeDnaKnowledgeBaseForDraw`).
  - Garde `isIdbAvailable()` garantissant un fallback mémoire transparent dans les environnements dépourvus d'IndexedDB (ex. tests unitaires headless, workers Node.js).

### 2.5. Couche de Fusion Multimodale (`fusionService.ts`)
- **Estimateur Linéaire Non-Biaisé à Variance Minimale (BLUE)** :
  - Inversion analytique $3 \times 3$ de la matrice de covariance croisée combinant Logic (Python ML), Physics (Modèles Quantiques) et Intuition (Oracle Topologique).
  - Dé-corrélation rigoureuse des signaux redondants pour éliminer la sur-pondération des modes communs.
  - Calcul explicite du gain d'information de Fisher dérivé de la trace du tenseur de précision.

### 2.6. Historique des Prédictions & Prédictions Futures (`predictionHistoryService.ts` & `quantifiedUncertaintyEngine.ts`)
- **Indexation Rapide & Requêtes Isolées (`queryPredictionsFast`)** :
  - Index en mémoire avec pagination fluide, filtres de dates et isolation stricte par tirage.
- **Moteur d'Incertitude Quantifiée (`computeQuantifiedUncertainty`)** :
  - Décomposition explicite de l'incertitude épistémique (dispersion inter-modèles et taille d'échantillon) et aléatoire (entropie résiduelle).
  - Intervalles de confiance à 95% calculés via l'erreur standard rigoureuse ($SE = \sigma / \sqrt{K}$) avec bornage garanti $[0, 100]$.
- **Scénarios de Simulation Contextuels (`generateSimulationScenarios`)** :
  - Génération de 3 stratégies d'inférence objectives : *Conservateur* (stabilité), *Équilibré Pareto* (compromis multimodal) et *Volatile / Anti-Consensus* (recherche de signaux faibles).
- **Rapports de Lisibilité pour Décideurs (`generateReadabilityReport`)** :
  - Synthèse narrative intelligible, drivers clés et estimation des risques stochastiques.

---

## 3. Validation & Suite de Tests

La suite de tests automatisée `tests/system-refactor-enhancements.test.ts` valide les 17 points de contrôle fondamentaux :
- Robustesse des extracteurs face aux données corrompues ou hétérogènes.
- Performance du cache L1 différentiel (< 5ms).
- Précision de l'attribution causale et régularisation bayésienne non-oscillatoire.
- Déterminisme et continuité du tuning d'hyperparamètres.
- Phylogénie, rollback et isolation des données ADN.
- Stabilité et cohérence de la fusion matricielle BLUE.
- Précision des intervalles de confiance et performance de l'interrogation d'historique.

Exécution des tests :
```bash
npm run test -- tests/system-refactor-enhancements.test.ts
```

---

## 4. Guide de Maintenance & Bonnes Pratiques

1. **Ajout d'un Nouvel Algorithme au Hub de Prédiction** :
   - Définir la clé d'algorithme dans `types.ts` (`AlgoWeights`).
   - Mettre à jour `getDefaultWeights()` dans `weightsManager.ts` en veillant à ce que la somme reste normalisée à 1.0 via `normalizeWeights`.
   - Ne jamais introduire de seuils de coupure rigides dans le calcul des scores : employer des activations logistiques continues.
2. **Gestion du Cache & Persistance** :
   - Toujours isoler les clés de stockage avec `${drawName.trim().toLowerCase()}_`.
   - Utiliser `isIdbAvailable()` ou le service unifié `globalCache` pour toutes les opérations asynchrones.
3. **Évolution des Interfaces Graphiques** :
   - Les composants d'autopsie (`PredictionForensics.tsx`) et de scénarios (`PredictionUncertaintyScenariosPanel.tsx`) consomment directement les structures retournées par `computeQuantifiedUncertainty` et `computeAutomatedCausalAttribution` sans recalcul côté client.
