# Plan d'Éradication Complète des Données Simulées & Restauration de la Vérité Terrain (Zéro Fausse Donnée)

Ce plan définit l'élimination totale et irréversible de tous les jeux de données simulés, synthétiques ou de secours générés artificiellement au sein de l'application (notamment dans **FluxHub**, **lotteryService**, **interDrawService** et les moteurs prédictifs). L'application n'affichera et ne traitera plus **que des données réelles et authentiques**.

---

## Décisions Validées avec l'Utilisateur (Phase 1)

> [!IMPORTANT]
> - **Comportement en l'absence de données réelles** : Afficher un état vide explicite, digne et informatif invitant l'utilisateur à synchroniser la base réelle, sans jamais injecter de données simulées.
> - **Nettoyage du cache existant** : Purge automatique et immédiate de tous les tirages de secours préalablement enregistrés dans IndexedDB/Cache (ceux portant l'identifiant `deterministic-*`).
> - **Contrat des moteurs prédictifs** : Refus strict et honnête du calcul d'inférence en cas d'historique réel absent ou insuffisant, avec message d'exigence de tirages réels.

---

## 1. Diagnostic des Gisements de Données Simulées à Éradiquer

### A. Le Générateur d'Historique Fictif (`services/lotteryService.ts`)
1. **`generateDeterministicFallbackHistory` (l. 336-390)** :
   - Fonction qui générait 250 tirages fictifs à l'aide d'un LCG lorsque la connexion réseau ou Supabase échouait.
   - Ces faux tirages étaient tagués `deterministic-${drawName}-...` et persistés dans le cache local `nexus_cache_history_...`.
   - **Action** : Supprimer l'appel de secours dans `fetchHistory`. Lorsque la base distante n'est pas joignable et qu'aucun historique réel n'est en cache, la fonction doit renvoyer un tableau vide `[]` ou lever une erreur explicite sans jamais fabriquer de faux tirages.

2. **Pollution du Cache Existant (`services/cache/CacheService.ts` & `store/useNexusStore.ts`)** :
   - Les sessions antérieures ont pu stocker ces faux tirages dans le cache IndexedDB.
   - **Action** : Ajouter une routine d'assainissement automatique au démarrage de l'application qui balaie et purge tout tirage dont l'identifiant commence par `deterministic-`.

### B. Le Module Inter-Tirages (`services/interDrawService.ts`)
1. **Repli sur faux historique du prédécesseur (l. 1808)** :
   - `const predHistory = (cachedPred && cachedPred.length > 0) ? cachedPred : generateDeterministicFallbackHistory(relation.predecessor.name);`
   - **Action** : Remplacer par un traitement honnête : si l'historique réel du tirage prédécesseur n'est pas disponible, le vecteur de report n'est pas simulé et renvoie le vecteur neutre/inopérant avec statut explicite « Données prédécesseur non synchronisées ».

### C. Présentation dans FluxHub (`components/tabs/FluxHub.tsx`)
1. **Affichage du Flux** :
   - Si `filteredHistory.length === 0` : au lieu de risquer d'afficher des données fictives, FluxHub présentera un état vide moderne, sobre et scientifique (inspiré des directives du référentiel `science_space_biotech`), expliquant qu'aucun tirage réel n'est chargé et offrant un bouton d'action directe pour déclencher la synchronisation réelle.
   - Masquage des panneaux d'analyse cybernétique et spectrale lorsqu'il n'y a aucun tirage réel à analyser (évite d'afficher des graphiques sur le néant).

### D. Moteurs d'Inférence & Oracle Base (`services/prediction/predictionOrchestrator.ts` & `PredictionTab.tsx`)
1. **Refus de calcul sur données insuffisantes** :
   - `PredictionTab` et `usePredictionGenerator` vérifient la présence de vrais tirages (non `deterministic-`).
   - Si `activeHistory.length === 0` : le bouton d'inférence est désactivé avec mention « Synchronisation réelle requise (0 tirage réel en base) ».
   - Si `activeHistory.length < 5` : notification claire informant l'utilisateur du nombre réel de tirages requis.

---

## 2. Architecture du Flux Zéro Faux Tirages

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          FLUX DE DONNÉES STRICT                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
                        ┌───────────────────────────┐
                        │   Requête Supabase / API  │
                        └───────────────────────────┘
                                      │
                     ┌────────────────┴────────────────┐
                     │ Succès                          │ Échec / Hors-ligne
                     ▼                                 ▼
       ┌───────────────────────────┐     ┌───────────────────────────┐
       │ Ingestion Vrais Tirages   │     │ Cache Réel Local Existant?│
       │ (Dates, numéros réels)    │     └───────────────────────────┘
       └───────────────────────────┘                   │
                     │                     ┌───────────┴───────────┐
                     │                     │ Oui                   │ Non
                     ▼                     ▼                       ▼
       ┌───────────────────────────┐ ┌───────────────┐ ┌─────────────────────┐
       │   Stockage Cache Réel     │ │ Utilise Cache │ │ 0 DONNÉE SIMULÉE    │
       │   (Zéro 'deterministic-') │ │ Réel Existant │ │ État vide explicite │
       └───────────────────────────┘ └───────────────┘ │ "Synchronisation   │
                     │                     │           │  réelle requise"    │
                     └──────────┬──────────┘           └─────────────────────┘
                                │                                 │
                                ▼                                 ▼
                 ┌───────────────────────────┐     ┌───────────────────────────┐
                 │ Analyses & Inférences OK  │     │ Modules en attente        │
                 │ (100% Empirique Réel)     │     │ (Zéro hallucination)      │
                 └───────────────────────────┘     └───────────────────────────┘
```

---

## 3. Plan d'Exécution & Étapes

### Étape 1 : Nettoyage de `lotteryService.ts`
- Éliminer le fallback de fabrication de tirages dans `fetchHistory`.
- Renvoyer un tableau vide si aucune donnée réelle n'est présente en ligne ou dans le cache authentique.
- Conserver la signature de `generateDeterministicFallbackHistory` si nécessaire uniquement pour les tests unitaires isolés ou la déprécier formellement, sans jamais l'appeler dans le code de production.

### Étape 2 : Purge Automatique du Cache des Anciens Faux Tirages
- Créer une fonction utilitaire `purgeSyntheticDrawsFromCache()` exécutée dès le démarrage dans `initialize()` du store `useNexusStore`.
- Cette fonction élimine tout tirage stocké dont l'identifiant commence par `deterministic-`, garantissant qu'aucun artefact résiduel ne subsiste sur le poste de l'utilisateur.

### Étape 3 : Nettoyage de `interDrawService.ts`
- Remplacer l'appel à `generateDeterministicFallbackHistory` par une gestion honnête de l'absence d'historique réel pour le tirage prédécesseur.

### Étape 4 : Refonte de l'État Vide de `FluxHub.tsx`
- Concevoir un composant d'état vide conforme au guide de design :
  - Icône de base de données / antenne propre.
  - Typographie technique soignée.
  - Message clair : « Aucun tirage réel en mémoire locale pour [Nom du Tirage]. »
  - Bouton d'action principal bien contrasté : « Synchroniser les tirages réels ».
  - Conditionner l'affichage des graphiques et spectrogrammes à `filteredHistory.length > 0`.

### Étape 5 : Verrouillage des Moteurs Prédictifs dans `PredictionTab.tsx`
- Si `history.length === 0` : afficher le panneau invitant à synchroniser des données réelles, avec désactivation des boutons de calcul d'inférence.
- Garantir qu'aucune prédiction ne peut être lancée sur une base vide ou artificielle.

### Étape 6 : Compilation & Validation
- Exécuter `compile_applet` et `lint_applet` pour valider l'intégrité du code.
- Vérifier que l'application démarre proprement, sans erreur ni avertissement.

---

## 4. Critères de Validation
- Aucun tirage avec `id: "deterministic-..."` n'est généré ni affiché dans FluxHub ou dans l'application.
- Les historiques vides affichent clairement l'état d'attente de synchronisation.
- Les analyses statistiques et les prédictions ne s'exécutent que sur de vrais tirages authentiques.
- Zéro régression de compilation TypeScript.
