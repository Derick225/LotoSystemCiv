# Plan d'Audit & Correction : Oracle Base (Déterministe & XAP)

Ce plan formalise le récolement exhaustif des anomalies et incohérences logiques identifiées au sein d'**Oracle Base (Déterministe & XAP)**, ainsi que le plan d'action d'ingénierie pour les corriger avec une rigueur mathématique absolue (respect strict des directives `AGENTS.md` : Zéro nombre magique, Zéro hasard, Isolation stricte des tirages, Continuité différentiable).

---

## Synthèse des Décisions Validées (Phase 1)

> [!IMPORTANT]
> Les trois orientations suivantes ont été expressément sélectionnées lors de la phase de cadrage :
> - **Périmètre d'action** : Audit exhaustif assorti d'un plan de correction immédiat et rigoureux.
> - **Exigence méthodologique** : Rigueur mathématique stricte et conformité AGENTS.md totale (zéro hasard, zéro nombre magique, déterminisme complet).
> - **Moteur MCMC & Scénarios** : Harmonisation intégrale du Monte-Carlo MCMC et des scénarios avec le pipeline déterministe complet et les contrats d'explicabilité XAP.

---

## 1. Répertoire Détaillé des Anomalies & Mauvaises Logiques

### A. Rupture d'Isolation Inter-Tirages (Violation AGENTS.md §2)
1. **Fuite d'historique dans l'évaluation des preuves empiriques** :
   - Dans `components/prediction/XAPTransparencyPanel.tsx` (l. 139) et `components/prediction/NeuralWeightsAuditDashboard.tsx` (l. 332, l. 417), l'historique complet multi-tirages (`history`) est passé à `evaluateAlgoEmpiricalProof(drawName, history)` et `computeChronologicalAlgoReinforcement` au lieu de l'historique purifié et isolé (`sample` ou `isolatedHistory`). Cela pollue les métriques d'apprentissage d'un tirage avec les données d'autres tirages.
2. **Omission du paramètre `drawName` dans le calcul des scores MCMC** :
   - Dans `services/prediction/monteCarloMcmc.ts` (l. 72), l'appel `calculateScores(baseFeatures, perturbedWeights, baseBundle, history)` omet l'argument `drawName`. Par conséquent, `context.drawName` est initialisé à une chaîne vide (`""`), ce qui désactive ou corrompt la détection des tirages sans machine (`drawHasMachineNumbers`), risquant d'activer à tort le canal `MACHINE_TRANSFER`.

### B. Déconnexion et Régression du Mode Monte-Carlo MCMC
1. **Contournement des couches critiques d'inférence** :
   - Le worker MCMC (`monteCarloMcmc.ts`) court-circuite le débruitage par composantes principales (PCA Denoising), le tamisage différentiable `DnaSieve`, et le recuit simulé combinatoire régulateur (respect des contraintes de somme théorique, d'indice AC, de parité et de distribution des décades). Il effectue une simple troncature `slice(0, 5)` sur les fréquences de comptage MCMC.
2. **Nombre magique arbitraire sur la confiance MCMC** :
   - `confidence: 50` est assigné en dur (l. 83) dans les itérations intermédiaires, et la confiance finale `dynamicConfidence` n'utilise pas la calibration sigmoïde continue de Platt standardisée par le moteur.
3. **Payload XAP incomplet généré par MCMC** :
   - L'objet `Prediction` émis par le worker MCMC omet `explainabilityData`, `simulationScenarios`, `dnaSieve` et `uncertaintyQuantification`, provoquant l'absence ou le mode dégradé des onglets de transparence XAP et de la matrice de scénarios lorsqu'une inférence MCMC est exécutée.

### C. Incohérences lors de l'Adoption de Scénarios (`handleAdoptScenarioTicket`)
1. **Désynchronisation XAP du vecteur adopté** :
   - Dans `components/tabs/PredictionTab.tsx` (l. 160-167), l'adoption d'un scénario alternatif remplace `suggestedNumbers`, mais les explications narratives XAP, les SHAP values et les archétypes physiques dans `explainabilityRecord` ne sont générés que pour le vecteur primaire d'origine. Les nouveaux numéros n'ont pas d'explication narrative associée.
2. **Non-mise à jour de la confiance et des candidats** :
   - Le ticket adopté ne met pas à jour le score de confiance avec son `coherenceScore` calculé par la sigmoïde de Platt. De plus, `candidates` n'est pas réordonné, créant des risques de doublons entre les 5 numéros suggérés et les orbitales secondaires.
3. **Pollution du texte d'analyse** :
   - L'adoption répétée de scénarios concatène indéfiniment `[Scénario Actif : ...] [Scénario Actif : ...]`.

### D. Nombres Magiques Résiduels & Poids Inconstants (Violation AGENTS.md §1)
1. **Poids par défaut arbitraire de 0.05** :
   - Dans `hooks/useAlgorithmSync.ts` (l. 59), les poids absents se voient attribuer la constante magique `0.05` au lieu d'une valeur équiprobable continue `1 / N_algos`.
2. **Explications XAP limitées au Top 5** :
   - `generateXAPNarratives` ne traite que les 5 numéros de `suggestedNumbers`. Quand un utilisateur clique sur un numéro candidat (6 à 15), l'explication narrative est tronquée ou absente.

---

## 2. Architecture & Flux Corrigé du Moteur Oracle Base

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       ORACLE BASE PIPELINE UNIFIÉ                           │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                 ┌────────────────────┴────────────────────┐
                 ▼                                         ▼
   ┌───────────────────────────┐             ┌───────────────────────────┐
   │  Inférence Nominale       │             │  Monte-Carlo MCMC         │
   │  (Pipeline Déterministe)  │             │  (Échantillonneur LCG)    │
   └───────────────────────────┘             └───────────────────────────┘
                 │                                         │
                 │  - Preuves empiriques isolées           │  - drawName injecté
                 │  - Normalisation unifiée sans 0.05      │  - Débruitage PCA
                 │  - DnaSieve différentiable              │  - Tamisage DnaSieve
                 ▼                                         ▼
   ┌─────────────────────────────────────────────────────────────────────┐
   │                  Scoring & Débruitage Vectoriel                     │
   └─────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
   ┌─────────────────────────────────────────────────────────────────────┐
   │         Sélection Combinatoire & Calibrage Platt Continu            │
   │  - Consensus Primaire                                               │
   │  - Matrice Multi-Scénarios Déterministe (5 profils cohérents)       │
   └─────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
   ┌─────────────────────────────────────────────────────────────────────┐
   │           XAP Engine : Explicabilité Étendue (1..15)                │
   │  - Synthèse SHAP et Archétypes Physiques                            │
   │  - Récits dynamiques régénérables lors de l'adoption de scénario    │
   └─────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
   ┌─────────────────────────────────────────────────────────────────────┐
   │                UI Présentation (PredictionTab & XAP)                │
   │  - Cohérence synchronisée (Confiance = Platt score du scénario)     │
   │  - Isolation stricte des tirages garantie à 100%                   │
   └─────────────────────────────────────────────────────────────────────┘
```

---

## 3. Plan d'Exécution & Étapes de Correction

### Étape 1 : Isolation Stricte des Tirages (Zéro Pollution Inter-Tirages)
- Corriger `XAPTransparencyPanel.tsx` et `NeuralWeightsAuditDashboard.tsx` pour filtrer systématiquement l'historique sur `drawName` avant tout appel à `evaluateAlgoEmpiricalProof` et `computeChronologicalAlgoReinforcement`.
- S'assurer que le cache d'analyse utilise des clés étanches préfixées par le réseau et le nom de tirage.

### Étape 2 : Élimination des Nombres Magiques & Remplacement Continu
- Remplacer `0.05` dans `useAlgorithmSync.ts` par le poids uniforme continu dérivé de la dimension du registre d'algorithmes : `1.0 / Object.values(AlgoKey).length`.
- Valider l'absence totale de seuils binaires ou de constantes fixes dans les normalisations.

### Étape 3 : Refonte & Harmonisation du Moteur MCMC (`monteCarloMcmc.ts`)
- Injecter explicitement `drawName` dans chaque appel à `calculateScores` au sein du worker MCMC.
- Brancher les étapes de tamisage `DnaSieve`, de calibrage de Platt (suppression du `confidence: 50` magique) et d'estimation de l'incertitude épistémique/aléatoire.
- Renvoyer un objet `Prediction` complet doté de `explainabilityData`, `simulationScenarios` et `dnaSieve`.

### Étape 4 : Gestion Cohérente de l'Adoption de Scénarios (`handleAdoptScenarioTicket`)
- Dans `PredictionTab.tsx`, lors de l'adoption d'un scénario alternatif :
  1. Recalculer ou récupérer les explications XAP correspondantes aux numéros adoptés via `generateXAPNarratives`.
  2. Mettre à jour `confidence` avec le `coherenceScore` calculé du scénario adopté.
  3. Mettre à jour `candidates` pour exclure les nouveaux numéros suggérés et préserver l'ordre d'importance.
  4. Réinitialiser proprement le bandeau d'analyse sans duplication de balises `[Scénario Actif : ...]`.

### Étape 5 : Extension de la Couverture XAP aux Orbitales Secondaires
- Étendre `generateXAPNarratives` pour couvrir l'union de `selection` et des 10 premiers candidats de `candidates`, garantissant qu'aucune consultation dans l'inspecteur d'orbitales ne se heurte à une explication manquante.

### Étape 6 : Validation & Vérification
- Exécuter `compile_applet` pour garantir l'intégrité TypeScript et l'absence de toute régression de compilation.

---

## 4. Vérification & Critères de Réussite
- Zéro régression de compilation TypeScript.
- Isolation 100% étanche entre les tirages (aucun historique croisé non autorisé).
- Fonctionnement fluide et déterministe tant en mode Inférence Nominale qu'en mode Monte-Carlo MCMC.
- Panneau XAP et Matrice de Scénarios parfaitement synchronisés et réactifs aux interactions utilisateur.
