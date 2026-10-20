# Plan de réaménagement TypeScript

Ce plan complète le [plan de correction du socle moteur](./plan_socle_correction.md). Il organise l'hygiène, la structure des sources, le découpage des modules et l'industrialisation CI sans régression fonctionnelle.

## Phase A — Hygiène et corrections immédiates

- Faire de `supabase/schema.sql` la source de vérité et supprimer le schéma SQL dupliqué.
- Unifier les clients Supabase.
- Regrouper le backtest dans `services/backtest/`, avec des réexports de compatibilité.
- Réexporter la façade de prédiction depuis l'ancien point d'entrée.
- Type-checker les tests.
- Supprimer ou corriger l'alias Vite inutilisé.

## Phase B — Réaménagement de la racine

- Déplacer l'application et ses dossiers (`App.tsx`, composants, hooks, services, store, utilitaires et types) sous `src/`.
- Aligner l'entrée HTML, l'alias `@`, TypeScript et Tailwind sur `src/`.
- Vérifier les chemins du serveur et des Web Workers.
- Ranger les plans dans `docs/`, ajouter un index documentaire et ignorer `.aistudio/` ainsi que `supabase/.temp/`.
- Séparer les constantes de réseaux, de moteur et d'affichage dans `src/config/`.

## Phase C — Découpage incrémental des monolithes

Découper un module à la fois, après caractérisation de son API publique, en séparant calcul pur, orchestration et I/O. Conserver des réexports de compatibilité et le déterminisme. Les cibles incluent les services forensic, inter-tirages, mathématiques, analyse post-prédiction, export, analyste, temporalité, loterie et forêt, ainsi que les composants UI les plus volumineux.

Unifier les types dans `src/types/`, rapprocher les tests unitaires de leur source et réserver `tests/` aux tests de contrat, E2E et fixtures golden.

## Phase D — CI et qualité

- Ajouter un workflow CI exécutant installation reproductible, type-check, tests et build sur les PR et les changements vers `main`.
- Ajouter, si disponible, la vérification ABI WASM.
- Activer progressivement `noUnusedLocals` et `noUnusedParameters` après les découpages.
- Maintenir les tests de reproductibilité et les fixtures golden cross-plateformes.

## Critères d'achèvement

- Les sources applicatives résident sous `src/` et les chemins d'alias sont cohérents.
- Les tests sont type-checkés; les tests, le build et les vérifications pertinentes de CI passent.
- Les clients Supabase et le schéma SQL ont chacun une source unique.
- Les découpages préservent les APIs nécessaires et le comportement observable.
