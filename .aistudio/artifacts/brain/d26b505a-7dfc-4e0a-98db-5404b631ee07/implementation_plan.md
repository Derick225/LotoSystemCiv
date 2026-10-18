# Plan d'Implémentation : Calibration Empirique Out-Of-Fold, Validation Walk-Forward & Restitution UI (Lot 3)

## 1. Contexte & Objectifs Scientifiques

Après l'assainissement du store (Lot 1) et le déploiement du couplage inter-tirages / effet domino 100% Wasm (Lot 2), le **Lot 3** franchit une étape déterminante dans la rigueur statistique de **LotoPro Platinum Elite v12.0** :

1. **Sortir des scores heuristiques pour des probabilités calibrées out-of-fold** :
   - Les scores bruts ne garantissent pas que 70% de confiance équivaut à 70% de présence empirique.
   - Application d'une **calibration logistique de Platt continue** ($P(y=1|s) = \frac{1}{1 + \exp(-(\alpha s + \beta))}$) ajustée exclusivement sur des prédictions passées *out-of-fold* (zéro fuite de données d'apprentissage).
   - Projection stricte sur le simplexe marginal sans remise : $\sum_{i=1}^{90} p_i = 5.0$.

2. **Validation Walk-Forward en Mémoire Vive (Rust Core)** :
   - Simulation rétrospective glissante : entraînement sur $t < T$, inférence sur $T$, répétée sur les $W$ derniers tirages réels.
   - Calcul des métriques empiriques objectives : **Brier Score** ($\frac{1}{90} \sum (p_i - y_i)^2$), log-loss et gain d'information par rapport à la distribution uniforme de référence.

3. **Restitution des Métriques de Fiabilité dans l'Interface Utilisateur** :
   - Affichage transparent dans l'écran de prédiction :
     - Score de Brier calibré (mesure d'erreur quadratique réelle).
     - Indice de calibration empirique (régime sous-calibré, bien calibré ou hyper-tendu).
     - Intervalle de confiance probabiliste dérivé des tests passés out-of-fold.

---

## 2. Architecture & Invariants Techniques

```
┌────────────────────────────────────────────────────────────────────────┐
│                   MOTEUR RUST DE CALIBRATION EMPIRIQUE                 │
│                                                                        │
│   1. Fenêtrage Walk-Forward glissant (Sur historique contigu en RAM)   │
│      ├── T_start .. T_eval (Fenêtre glissante W tirages)               │
│      └── Zéro fuite de données : évaluation stricte sur tirage T       │
│                                                                        │
│   2. Ajustement différentiable des paramètres de Platt (alpha, beta)   │
│      └── Descente de gradient continue (Zéro constante arbitraire)     │
│      └── Calcul du Brier Score empirique moyen                         │
│                                                                        │
│   3. Projection finale sur le simplexe marginal (Sum p_i = 5.0)        │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      PONT TYPESCRIPT / WASM BRIDGE                     │
│                                                                        │
│   • computeWalkForwardCalibrationHpc(drawName, windowSize)             │
│   • Structure typée CalibrationReportHpc :                             │
│     - brierScore, brierSkillScore, plattAlpha, plattBeta               │
│     - empiricalReliabilityScore, outOfFoldHitRate                      │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      INTERFACE UTILISATEUR (REACT)                     │
│                                                                        │
│   • Badge de calibration scientifique & jauge de fiabilité            │
│   • Décomposition du Brier Score vs benchmark aléatoire                │
│   • Intégration fluide dans la fiche de prédiction existante           │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Plan d'Exécution Détaillé

### Étape 1 : Moteur Rust de Calibration & Walk-Forward (`crates/loto-engine/src/calibration.rs`)
- **Structure `WalkForwardReport`** :
  - `brier_score: f64` (cible < 0.051 qui est le benchmark d'équiprobabilité 5/90).
  - `brier_skill_score: f64` (gain relatif vs référence).
  - `platt_alpha: f64`, `platt_beta: f64`.
  - `calibration_quality_label: String`.
- **Régression de Platt continue** :
  - Minimisation de la log-perte sur les paires $(s_n, y_n)$ des tirages out-of-fold.
  - Déterminisme absolu, pas de nombre magique.
- **Export WebAssembly** :
  - `run_walk_forward_calibration_wasm` et intégration dans `in_memory_store.rs`.

### Étape 2 : Pont TypeScript & Cache Isolé (`services/wasm/lotoEngineBridge.ts`)
- Encapsulation des résultats dans `CalibrationReportHpc`.
- Méthode synchrone/asynchrone ultra-rapide (< 10 ms pour 30 fenêtres Walk-Forward).
- Cache déterministe avec clé isolée `nexus_calibration_${networkId}_${drawName}`.

### Étape 3 : Intégration dans le Pipeline de Prédiction (`predictionOrchestrator.ts`)
- Application de la calibration aux scores de sortie du pipeline natif.
- Enrichissement du payload de prédiction avec les métriques empiriques de calibration.

### Étape 4 : Affichage des Métriques de Fiabilité dans l'UI
- Enrichir le composant de visualisation de prédiction avec un panneau compact et élégant :
  - Brier Skill Score (comparaison au hasard pur).
  - Qualité de calibration (indice de fiabilité empirique certifié).
  - Zéro jargon obscur : infobulles claires explicitant la méthode Walk-Forward out-of-fold.

### Étape 5 : Tests de Contrat & Validation Mathématique
- Création du banc de test `tests/walk-forward-calibration-contract.test.ts` :
  - Vérifier l'absence de fuite temporelle (résultats strictement inchangés par les tirages futurs).
  - Vérifier que le Brier Score de prédictions parfaites tend vers 0.
  - Vérifier la somme marginale calibrée ($\sum p_i = 5.0$).
- Validation complète `lint_applet` et `compile_applet`.

---

## 4. Critères d'Acceptation & Livrables
1. **Calibration de Platt continue** opérationnelle en Rust Wasm sans fuite de données.
2. **Brier Skill Score** calculé et restitué pour chaque tirage analysé.
3. **Composant UI élégant** affichant la fiabilité probabiliste calibrée.
4. **100% des tests unitaires et de contrat validés**.
5. **Compilation TypeScript et build Vite réussis sans avertissement**.
