import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { globalCache } from '../services/cache/CacheService';
import { purifyHistoryForDraw } from '../utils/arrayUtils';
import { INTER_DRAW_NETWORKS, normalizeDrawName } from '../constants';
import type { InterDrawNetworkId } from '../constants';

/**
 * TESTS-GARDIENS DES INVARIANTS AGENTS.md
 * Verrouillent les propriétés structurelles requises par AGENTS.md :
 * - Invariant #5 : Format canonique des clés de cache nexus_interdraw_${networkId}_${drawName}
 * - Invariant #4 : Étanchéité absolue des 2 réseaux fermés (hebdomadaire 6, quotidien 22, zéro croisement National/Espoir)
 * - Invariant #2 : Zéro hasard dans le moteur d'inférence (100% déterministe)
 */

const SERVICES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'services');

describe('Invariant #5 — Isolation des clés de cache inter-tirages (AGENTS.md)', () => {
  it('encode networkId ET drawName dans le format canonique nexus_interdraw_${networkId}_${drawName}', () => {
    const key = globalCache.getInterDrawKey('quotidien', 'Fortune');
    expect(key).toBe('nexus_interdraw_quotidien_fortune');
    expect(key.startsWith('nexus_interdraw_')).toBe(true);
    expect(key).toContain('quotidien');
    expect(key).toContain('fortune');
  });

  it('normalise le nom du tirage (minuscules, espaces/tirets → underscore)', () => {
    const key = globalCache.getInterDrawKey('hebdomadaire', '  Fortune Thursday ');
    expect(key).toBe('nexus_interdraw_hebdomadaire_fortune_thursday');
  });

  it('produit des clés distinctes pour des réseaux ou des tirages distincts', () => {
    const a = globalCache.getInterDrawKey('quotidien', 'Fortune');
    const b = globalCache.getInterDrawKey('hebdomadaire', 'Fortune');
    const c = globalCache.getInterDrawKey('hebdomadaire', 'Fortune Thursday');
    expect(new Set([a, b, c]).size).toBe(3);
  });

  it('préserve le sous-secteur optionnel sans casser l\'isolation réseau/tirage', () => {
    const key = globalCache.getInterDrawKey('quotidien', 'Fortune', 'matrix');
    expect(key).toBe('nexus_interdraw_quotidien_fortune_matrix');
    expect(key).toContain('quotidien');
    expect(key).toContain('fortune');
  });

  it('aligne la normalisation du nom sur normalizeDrawName (cohérence inter-modules)', () => {
    const drawName = 'Fortune Thursday';
    const key = globalCache.getInterDrawKey('hebdomadaire', normalizeDrawName(drawName));
    expect(key).toContain(normalizeDrawName(drawName).toLowerCase().replace(/[\s-]+/g, '_'));
  });
});

describe('Invariant #4 — Étanchéité des 2 réseaux fermés (AGENTS.md)', () => {
  const networkIds = Object.keys(INTER_DRAW_NETWORKS) as InterDrawNetworkId[];

  const namesOf = (id: InterDrawNetworkId): string[] =>
    INTER_DRAW_NETWORKS[id].sequence.map(s => s.name);

  it('compte exactement 2 réseaux fermés', () => {
    expect(networkIds.length).toBe(2);
    expect(networkIds).toContain('hebdomadaire');
    expect(networkIds).toContain('quotidien');
  });

  it('le Réseau Hebdomadaire compte exactement 6 tirages et le Réseau Quotidien 22 tirages', () => {
    expect(INTER_DRAW_NETWORKS.hebdomadaire.drawNames.length).toBe(6);
    expect(INTER_DRAW_NETWORKS.quotidien.drawNames.length).toBe(22);
    const allNames = [
      ...INTER_DRAW_NETWORKS.hebdomadaire.drawNames,
      ...INTER_DRAW_NETWORKS.quotidien.drawNames
    ];
    expect(new Set(allNames.map(normalizeDrawName)).size).toBe(28);
  });

  it('chaque tirage n\'appartient qu\'à un seul réseau (zéro pollution inter-réseaux)', () => {
    const hebdoNames = new Set(INTER_DRAW_NETWORKS.hebdomadaire.drawNames.map(normalizeDrawName));
    const quotNames = new Set(INTER_DRAW_NETWORKS.quotidien.drawNames.map(normalizeDrawName));

    // Intersection strictement vide : aucun tirage partagé
    const intersection = [...hebdoNames].filter(name => quotNames.has(name));
    expect(intersection).toHaveLength(0);

    // National appartient exclusivement à l'hebdomadaire
    expect(hebdoNames.has(normalizeDrawName('National'))).toBe(true);
    expect(quotNames.has(normalizeDrawName('National'))).toBe(false);

    // Espoir appartient exclusivement au quotidien
    expect(quotNames.has(normalizeDrawName('Espoir'))).toBe(true);
    expect(hebdoNames.has(normalizeDrawName('Espoir'))).toBe(false);
  });

  it('purifyHistoryForDraw isole strictement deux tirages aux noms proches', () => {
    const mk = (drawName: string, id: string): any => ({
      id, drawName, draw_name: drawName, date: '01/01/2024',
      gagnants: [1, 2, 3, 4, 5], machine: [6, 7, 8, 9, 10], version: 1
    });
    const mixed = [
      mk('Fortune', 'a'), mk('Fortune Thursday', 'b'),
      mk('Fortune', 'c'), mk('Espoir', 'd'), mk('Fortune Thursday', 'e')
    ];

    const fortune = purifyHistoryForDraw('Fortune', mixed);
    const thursday = purifyHistoryForDraw('Fortune Thursday', mixed);

    expect(fortune.map(d => d.id).sort()).toEqual(['a', 'c']);
    expect(thursday.map(d => d.id).sort()).toEqual(['b', 'e']);
    // Aucune intersection → zéro pollution croisée.
    expect(fortune.filter(d => thursday.some(t => t.id === d.id))).toHaveLength(0);
  });

  it('la purification est idempotente', () => {
    const mk = (drawName: string, id: string): any => ({
      id, drawName, draw_name: drawName, date: '01/01/2024',
      gagnants: [1, 2, 3, 4, 5], machine: [], version: 1
    });
    const mixed = [mk('Fortune', 'a'), mk('Espoir', 'd'), mk('Fortune', 'c')];
    const once = purifyHistoryForDraw('Fortune', mixed);
    const twice = purifyHistoryForDraw('Fortune', once);
    expect(twice.map(d => d.id)).toEqual(once.map(d => d.id));
  });
});

describe('Invariant #2 — Zéro hasard dans le moteur d\'inférence', () => {
  const walk = (dir: string, acc: string[] = []): string[] => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) walk(full, acc);
      else if (full.endsWith('.ts')) acc.push(full);
    }
    return acc;
  };

  it('aucun appel réel à Math.random() ou crypto.getRandomValues() dans services/**', () => {
    const files = walk(SERVICES_DIR);
    expect(files.length).toBeGreaterThan(0);

    const forbidden = /Math\.random\s*\(|getRandomValues\s*\(/;
    const violations: string[] = [];

    for (const file of files) {
      // Supprime les blocs de commentaires /* ... */ (les références documentaires y sont fréquentes).
      const withoutBlockComments = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      const lines = withoutBlockComments.split('\n');

      lines.forEach((rawLine, idx) => {
        const trimmed = rawLine.trim();
        // Ligne de commentaire (// ou * d'un bloc) → ignorée.
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return;
        // Coupe un commentaire de fin de ligne (sans briser les URL « :// »).
        const code = rawLine.replace(/(^|[^:])\/\/.*$/, '$1');
        if (forbidden.test(code)) {
          violations.push(`${relative(SERVICES_DIR, file)}:${idx + 1}`);
        }
      });
    }

    expect(violations, `Appels non déterministes détectés → ${violations.join(', ')}`).toEqual([]);
  });
});
