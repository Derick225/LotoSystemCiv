# Plan d'Implémentation : Stacking Dense des 18 Canaux & Tableau Analytique de Calibration

## 1. Contexte & Diagnostic Analytique

L'audit approfondi du moteur de prédiction (`scoringEngine.ts`, `weightsManager.ts`, `loto-core/src/stacking.rs`) et des données historiques a mis en évidence trois leviers majeurs d'optimisation mathématique et logicielle :

1. **Agrégation Linéaire sous-optimale vs Stacking Log-Linéaire** : L'agrégation actuelle réalise une combinaison convexe directe $S_n = \sum_k w_k s_{k,n}$. Or, pour des variables stochastiques binaires indépendantes à saturation marginale (tirage 5 sur 90 sans remise), la théorie de l'information impose une combinaison log-linéaire continue dans l'espace des log-cotes :
   $$\text{logit}(p_n) = \sum_{k=1}^{18} w_k \cdot \text{logit}(s_{k,n}) + \beta_0$$
   suivie d'une projection sur le simplexe marginal $\sum_{n=1}^{90} p_n = 5.0$.
2. **Poids Statiques vs Poids Dérivés du Simplexe OOF (Out-Of-Fold)** : Le moteur Rust Wasm expose déjà la primitive haute performance `stack_channel_weights_wasm`, minimisant la log-loss out-of-sample avec régularisation $L_2$ par Descente de Gradient Exponentielle (EG). Ce méta-modèle doit être intégré directement dans la passe nominale d'inférence.
3. **Absence de Restitution Visuelle de la Fiabilité Empirique** : L'utilisateur ne dispose pas encore dans l'interface de prédiction d'un tableau synthétique mesurant objectivement la supériorité statistique par rapport au hasard (Brier Skill Score, calibration de Platt, ECE).

---

## 2. Décisions Validées & Directives Architecturales

> [!IMPORTANT]
> Conformément aux orientations confirmées par l'utilisateur :
> - **Axe Algorithmique** : Stacking dense des 18 canaux avec simplexe bayésien (optimisation continue $L_2$, élimination de la colinéarité, projection sur simplexe $\sum p_n = 5.0$).
> - **Exposition UI** : Tableau analytique avancé intégrant le Brier Score ($BS$), le Brier Skill Score ($BSS$), l'Expected Calibration Error ($ECE$) et la répartition continue des poids du simplexe.
> - **Discipline Visuelle (frontend-design / saas_dashboard.md)** : Zéro pill statique, chiffres tabulaires monospace (`font-mono`, `tabular-nums`), contrastes WCAG AA, densité compacte, hiérarchie éditoriale soignée.

---

## 3. Architecture Technique du Système

```
┌────────────────────────────────────────────────────────────────────────┐
│              PIPELINE DE PRÉDICTION & CALIBRATION STACKING             │
│                                                                        │
│   [18 CANAUX DE SCORING ANALYTIQUE]                                    │
│   ├── Fréquentiel / Écarts / Spectre / Markov / Bayes                 │
│   ├── Momentum / Affinité / Spatial / Temporel / Fractale               │
│   ├── Shadow / Réseau / Echo State / Dérivé / Cadence / Tendance       │
│   └── Machine Transfer / Inter-Draw Resonance (Miroirs/Compléments)    │
│                           │                                            │
│                           ▼ (Sorties brutes s_{k,n})                   │
│   [MÉTA-MODÈLE STACKING RUST WASM (stack_channels_l2)]                 │
│   ├── Décorrélation Matricielle Instantanée                            │
│   ├── Optimisation Exponentiated Gradient (EG) sur Simplexe            │
│   └── Régularisation L2 entropique lambda = 1/(S·K)                    │
│                           │                                            │
│                           ▼                                            │
│   [CALIBRATION DE PLATT & PROJECTION SIMPLEXE]                         │
│   ├── Logit squashing & Softmax Normalisé : Sum(p_n) = 5.0            │
│   └── Calcul OOF : Brier Score, BSS vs Référence (0.0525), ECE         │
│                           │                                            │
│                           ▼                                            │
│   [TABLEAU ANALYTIQUE DE PRÉDICTION & CALIBRATION (UI)]                │
│   ├── Brier Skill Score (BSS) en direct avec indicateur de gain réel   │
│   ├── Distribution des 18 poids optimisés du simplexe                  │
│   └── Courbe de calibration décile par décile                          │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Plan d'Exécution Détaillé

### Étape 1 : Consolidation & Câblage du Stacking Log-Linéaire dans l'Orchestrateur
- **Fichiers** : `services/prediction/scoringEngine.ts`, `services/prediction/predictionOrchestrator.ts`, `services/wasm/lotoEngineBridge.ts`.
- Intégrer l'optimisation des poids de stacking via `stack_channel_weights_wasm` lors de la passe d'inférence nominale.
- Assurer le fallback déterministe en TypeScript pur en cas d'absence d'historique étendu ou de tirages minimaux ($S < 8$).
- Garantir le strict respect de la contrainte marginale $\sum_{n=1}^{90} p_n = 5.0$ et l'isolation hermétique des tirages (zéro fuite de données temporelles).

### Étape 2 : Enrichissement des Métriques de Calibration OOF dans la Passerelle Bridge
- **Fichiers** : `services/wasm/lotoEngineBridge.ts`, `crates/loto-engine/src/calibration.rs`.
- Étendre `CalibrationReportHpc` pour transmettre les métriques complètes de `WalkForwardReport` :
  - `brierScore` : Score moyen quadratique.
  - `brierSkillScore` : Gain relatif $1 - \frac{BS}{BS_{\text{ref}}}$ (où $BS_{\text{ref}} \approx 0.05247$).
  - `plattAlpha` & `plattBeta` : Coefficients de calibration affine.
  - `ece` : Expected Calibration Error.
  - `logLoss` : Perte logarithmique out-of-fold.
  - `channelWeights` : Vecteur des 18 poids optimisés sur le simplexe.

### Étape 3 : Création du Tableau Analytique Avancé de Calibration dans l'UI
- **Fichier** : `components/prediction/PredictiveCalibrationAnalyticsDashboard.tsx`.
- Intégration dans `PredictionTab.tsx` sous forme d'un volet d'évaluation analytique :
  - **Panneau de Synthèse Statistique** : Cartes à élévation unique affichant le Brier Score, le BSS, l'ECE et le nombre de fenêtres Walk-Forward évaluées en chiffres monospace tabulaires.
  - **Inspecteur des 18 Canaux du Simplexe** : Tableau haute densité classant les canaux actifs par poids effectif et contribution marginale.
  - **Jauge de Fiabilité Empirique** : Évaluation visuelle de la convergence du méta-modèle sans badge superflu ni pill statique.

### Étape 4 : Validation Mathématique, Tests de Contrat & Build
- Création du banc de test `tests/predictive-stacking-calibration.test.ts` :
  - Validation de la convergence du simplexe bayésien ($\sum w_k = 1.0, w_k \ge 0$).
  - Validation de la projection marginale ($\sum_{n=1}^{90} p_n = 5.0$).
  - Validation du calcul objectif du Brier Skill Score comparé à l'équiprobabilité.
- Contrôle de non-régression global (`npx vitest run`).
- Validation TypeScript stricte (`npm run lint` / `tsc --noEmit`) et compilation de production (`npm run build`).

---

## 5. Critères d'Acceptation & Livrables

1. **Stacking 18 Canaux Opérationnel** : Les poids sont optimisés déterministement sur les sorties out-of-fold via le gradient exponentiel régularisé $L_2$.
2. **Tableau Analytique Déployé dans l'Interface** : Affichage clair, précis et lisible des scores Brier, BSS et ECE avec conformité design `3_saas_dashboard.md`.
3. **Conformité Mathématique AGENTS.md** : Zéro nombre magique, zéro aléatoire, transitions différentiables $C^\infty$.
4. **100% de Succès aux Tests** et compilation de production sans avertissement.
