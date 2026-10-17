# Plan d'Amélioration Prédictive : Couplage Dynamique Inter-Tirages & Générateur Multi-Tickets Diversifiés

## 1. Vision & Fondements Mathématiques

Conformément à la charte **AGENTS.md** (zéro nombre magique, 100% déterministe, transitions différentiables $C^\infty$), cette amélioration exploite l'interconnexion stochastique entre tirages d'un même réseau afin de propulser la précision prédictive et de produire un portefeuille de **multi-tickets diversifiés**.

### Les Deux Piliers Clés :
1. **Couplage Dynamique Inter-Tirages & Effet Domino** :
   - Les tirages ne sont pas traités comme des îles isolées : l'énergie cinétique du tirage prédécesseur (ex: tirage de la veille ou de la session précédente) se propage par advection et diffusion dans le réseau.
   - Utilisation des algorithmes avancés de `crates/loto-engine/src/interdraw_dynamics.rs` :
     - **Advection cinétique** & ondes de réverbération (effet domino).
     - **Noyau de chaleur de graphe** ($e^{-tL}$, effet cascade).
     - **Tenseur de cooccurrence conditionnelle** (`crates/loto-engine/src/cooccurrence.rs`).
2. **Génération Multi-Tickets Diversifiés (Portefeuille Orthogonal)** :
   - Remplacement de la génération d'un ticket unique par un portefeuille optimisé de $K$ tickets ($K \in [3, 6]$).
   - Élimination stricte de la **monoculture** : chaque ticket cible un profil stochastique complémentaire via maximisation de la distance de Jaccard/Hamming entre combinaisons.

---

## 2. Architecture Technique & Flux de Données

```
┌────────────────────────────────────────────────────────────────────────┐
│                        MOTEUR RUST CORE (WASM HPC)                     │
│                                                                        │
│   ┌───────────────────────────────────────────────────────────────┐    │
│   │             In-Memory Store (Tirage N & Prédécesseur N-1)      │    │
│   └───────────────────────────────┬───────────────────────────────┘    │
│                                   │                                    │
│   ┌───────────────────────────────▼───────────────────────────────┐    │
│   │      Tenseur d'Advection Cinétique & Effet Domino             │    │
│   │      (interdraw_dynamics.rs + cooccurrence.rs)                │    │
│   │      • Matrice de transition continue lissée (Laplace)        │    │
│   │      • Énergie de résonance inter-tirages                     │    │
│   └───────────────────────────────┬───────────────────────────────┘    │
│                                   │                                    │
│   ┌───────────────────────────────▼───────────────────────────────┐    │
│   │      Orchestrateur de Portefeuille Multi-Tickets (Rust)       │    │
│   │      • Ticket 1 : Attracteur Primaire (Densité Max P_max)     │    │
│   │      • Ticket 2 : Résonance Domino (Excitations Prédécesseur) │    │
│   │      • Ticket 3 : Dispersion Entropique (Poisson / Outsiders) │    │
│   │      • Ticket 4+ : Couverture Orthogonale (Max Distance J)   │    │
│   └───────────────────────────────┬───────────────────────────────┘    │
└───────────────────────────────────┼────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        FRONTEND REACT & VIZ (PWA)                      │
│                                                                        │
│   • Visualisation cinétique de l'Effet Domino (flux d'énergie N-1 ➔ N) │
│   • Grille du Portefeuille Multi-Tickets avec badges de profil         │
│   • Indicateur de Diversité de Shannon & Indice de Couverture Spatiale │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Plan d'Implémentation Détaillé

### Étape 1 : Extension du Moteur Rust Core (`crates/loto-engine`)
- **Module `crates/loto-engine/src/interdraw_orchestrator.rs`** :
  - Interconnexion entre `InMemoryDrawStore` et les routines de `interdraw_dynamics.rs`.
  - Calcul de la matrice d'advection cinétique basée sur les masques binaires $u128$ des deux derniers tirages.
  - Implémentation du sélecteur multi-tickets orthogonal :
    - Algorithme de projection gloutonne déterministe avec pénalisation de recouvrement quadratique continue $\sum \lambda_{ij} \cdot \mathbf{1}_{\{i \cap j\}}$.
  - Structure de retour `WasmMultiTicketPortfolio` :
    - Liste des tickets générés (vecteurs de 5 numéros triés).
    - Vecteur des profils stochastiques (`ATTRACTOR`, `DOMINO_RESONANCE`, `ENTROPY_DISPERSION`, `ORTHOGONAL_COVERAGE`).
    - Métrique de diversité globale du portefeuille (entropie mutuelle et couverture totale de boules uniques).

### Étape 2 : Câblage dans le Pont WebAssembly (`services/wasm/lotoEngineBridge.ts`)
- Exposer la fonction `computeInterdrawDominoPortfolioHpc` :
  - Prend en entrée l'historique du tirage cible et du tirage prédécesseur.
  - Fallback mathématique déterministe $C^\infty$ synchrone en TypeScript pour les environnements de test / SSR.

### Étape 3 : Intégration dans le Service de Prédiction (`predictionOrchestrator.ts`)
- Intégrer l'appel au portefeuille domino dans le pipeline prédictif lorsque le tirage prédécesseur est disponible dans le même réseau (`weekly` ou `daily`).
- Enrichir le type `Prediction` pour inclure le champ optionnel `multiTicketPortfolio`.

### Étape 4 : Interface Utilisateur & Composants Visuels
- Mettre à jour l'onglet Prédiction (`PredictionTab` / `TicketSummary`) pour afficher :
  - Le sélecteur de vue : "Ticket Recommandé" ou "Portefeuille Multi-Tickets (Diversifié)".
  - Carte de chaque ticket avec son badge de stratégie (Attracteur, Domino, Couverture).
  - Indicateur de non-monoculture (distance de diversité $\ge 80\%$).

### Étape 5 : Tests de Validation Mathématique & Non-Régression
- Tests unitaires dans `tests/interdraw-domino-portfolio.test.ts` :
  - Vérification de l'absence totale de duplication triviale entre tickets.
  - Vérification du déterminisme absolu (mêmes historiques = mêmes tickets).
  - Vérification de l'intégration Wasm et du fallback.
- Validation des suites existantes (`rust-wasm-integration.test.ts`, `closed-loop-autotuning.test.ts`).
- Contrôle de la qualité de compilation (`compile_applet` & `lint_applet`).

---

## 4. Bénéfices Métier & Techniques
1. **Élimination de la Monoculture** : Un utilisateur ne mise plus sur 5 numéros isolés mais sur un portefeuille équilibré couvrant 12 à 20 numéros distincts sans cannibalisation.
2. **Prise en Compte de la Continuité Temporelle** : Les tirages d'une même semaine dialoguent mathématiquement via l'effet domino.
3. **0 Latence Réseau & 0 Coût Supabase** : L'ensemble du calcul matriciel et combinatoire tourne en RAM locale (< 10 ms).
