# AGENTS.md

## CONSIGNES DE DÉVELOPPEMENT & PRINCIPES ARCHITECTURAUX

### 1. PHILOSOPHIE MATHÉMATIQUE (NON NÉGOCIABLE)
- **ZÉRO NOMBRES MAGIQUES** : Interdiction d'introduire des constantes arbitraires (par exemple, des coefficients arbitraires d'amortissement, des seuils de décision fixes comme 0.05 ou 30%). Tous les paramètres, poids et valeurs d'amortissement doivent être calculés de façon continue par des fonctions différentiables, des métriques statistiques réelles (Variance, Entropie, Exposant de Hurst, PDF/CDF Gaussiennes) ou des estimations objectives basées sur l'historique complet disponible.
- **ZÉRO HASARD / 100% DÉTERMINISTE** : Aucun appel direct ou indirect à `Math.random()`, `crypto.getRandomValues()` ou d'autres générateurs de nombres pseudo-aléatoires non seedés au sein du moteur d’inférence, des workers ML, d'ACO, des forêts de décision ou des réseaux de neurones. L'exécution globale doit être 100% reproductible à partir des mêmes historiques et filtres temporels. Si une perturbation est requise (par exemple dans les étapes stochastiques ou de recuit simulé), utiliser un LCG (Linear Congruential Generator) à seed canonique déterministe ou des convolutions trigonométriques continues basées sur les horodatages des tirages.
- **CONTINUITÉ DES TRANSITIONS et DÉCISIONS** : Éviter les bifurcations de seuils binaires (`if (score > T) { success = true } else { ... }`). Remplacer systématiquement les portes d'activation brusques par des fonctions de mapping continu (Sigmoïde logistique, tangente hyperbolique, distribution de Cauchy ou fonctions gaussiennes d'étalement) pour conserver la structure gradient-like du paysage d'inférence.

### 2. ISOLATION ABSOLUE DES DONNÉES DU TIRAGE & TYPOLOGIE DES BOULONNIERS (MACHINES)
- **UN ESTIMATEUR PAR TIRAGE** : Chaque nom de tirage (par exemple, "Loto 5/90", "EuroMillions", "Powerball") dispose de son historique propre et exclusif. 
- **ZÉRO POLLUTION INTER-TIRAGES** : Il est strictement interdit d'entraîner, de calculer des corrélations, d'extraire des caractéristiques ou de faire transiter des matrices d'affinités ou des modèles de transition Markovienne d'un tirage vers un autre en dehors des profils de machines explicitement affiliés.
- **TOPOLOGIE MATÉRIELLE DES BOULONNIERS (MACHINES PHYSIQUES)** :
  - **Boulonnier Groupe A (10H / 16H / Dimanche 19H55)** : Les tirages de **10H**, de **16H** ainsi que le tirage unique de **19H55 du Dimanche** partagent exactement le même boulonnier physique (même appareil mécanique).
  - **Boulonnier Groupe B (13H)** : Tous les tirages de **13H** partagent le même boulonnier physique.
  - **Boulonnier Groupe C (19H55 Semaine)** : Les tirages de **19H55** (du lundi au samedi) partagent leur propre boulonnier dédié.
  - *Application* : Les modules d'analyse mécanique, de transfert de machine (`machine_transfer`), d'usure physique et de signatures balistiques doivent respecter cette classification matérielle pour l'étude des biais d'appareils.
- **ISOLATION DU CACHING** : Les clés de cache de toutes les matrices d'inférence (features, poids optimisés, rapports médico-légaux, scores de prédiction) doivent inclure explicitement et de manière unique le nom du tirage (`drawName` / `tirageName`).
- **CONVERGENCE SUR HISTORIQUE PROPRE** : Lors des calculs de backtesting, de simulation Time Machine ou d'optimisation (moteur cybernétique, réseaux neuronaux, descentes de coordonnées), on filtre rigoureusement l'historique et les prédictions sur le jeu de données délimité du tirage actif.

### 3. PROTOCOLE D'ÉCHANTILLONNAGE & REFACTORISATION DIAGNOSTIQUE
- **SOLLICITATION ET AUDIT D'ÉCHANTILLONS RÉELS** : L'IA de Build doit systématiquement inviter l'utilisateur à fournir, tester et injecter des échantillons de tirages réels (séries historiques, jeux de validation croisée, fichiers de tests ciblés par créneau horaire ou par boulonnier).
- **DIAGNOSTIC GUIDÉ PAR LA PRÉCISION** : Dès qu'un échantillon ou historique est fourni ou identifié, l'IA procède à un audit complet des métriques d'exactitude (Forensic Log, taux de capture des gagnants, dispersion spectrale, dérive d'entropie) afin de déterminer avec précision quelles fonctions algorithmiques, heuristiques de tamisage ou composants UI nécessitent un réaménagement, un reparamétrage différentiable ou une refactorisation architecturale.
- **ALIGNEMENT CONTINU SUR LA VÉRITÉ TERRAIN** : Toutes les améliorations logicielles doivent être validées contre ces séries d'échantillons afin d'assurer des analyses et des prédictions justes, rigoureuses et exemptes de biais.

