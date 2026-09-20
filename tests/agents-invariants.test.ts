import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { globalCache } from '../services/cache/CacheService';
import { purifyHistoryForDraw } from '../utils/arrayUtils';
import { INTER_DRAW_FAMILIES, normalizeDrawName } from '../constants';
import type { InterDrawFamilyId } from '../constants';

/**
 * TESTS-GARDIENS DES INVARIANTS AGENTS.md (recommandation #2)
 * Verrouillent les propriétés structurelles que les correctifs précédents établissent,
 * pour empêcher toute récidive : isolation des clés de cache (#5), étanchéité des
 * 3 familles inter-tirages (#4) et zéro hasard dans le moteur (#2).
 */

const SERVICES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'services');

describe('Invariant #5 — Isolation des clés de cache inter-tirages', () => {
  it('encode familyId ET drawName dans un format canonique', () => {
    const key = globalCache.getInterDrawKey('FAMILY_13H', 'Fortune');
    expect(key).toBe('nexus_interdraw_FAMILY_13H_fortune');
    expect(key.startsWith('nexus_interdraw_')).toBe(true);
    expect(key).toContain('FAMILY_13H');
    expect(key).toContain('fortune');
  });

  it('normalise le nom du tirage (minuscules, espaces/tirets → underscore)', () => {
    const key = globalCache.getInterDrawKey('FAMILY_19H55', '  Fortune Thursday ');
    expect(key).toBe('nexus_interdraw_FAMILY_19H55_fortune_thursday');
  });

  it('produit des clés distinctes pour des familles ou des tirages distincts', () => {
    const a = globalCache.getInterDrawKey('FAMILY_13H', 'Fortune');
    const b = globalCache.getInterDrawKey('FAMILY_19H55', 'Fortune');
    const c = globalCache.getInterDrawKey('FAMILY_13H', 'Fortune Thursday');
    expect(new Set([a, b, c]).size).toBe(3);
  });

  it('préserve le sous-secteur optionnel sans casser l\'isolation famille/tirage', () => {
    const key = globalCache.getInterDrawKey('FAMILY_13H', 'Fortune', 'matrix');
    expect(key).toBe('nexus_interdraw_FAMILY_13H_fortune_matrix');
    expect(key).toContain('FAMILY_13H');
    expect(key).toContain('fortune');
  });

  it('aligne la normalisation du nom sur normalizeDrawName (cohérence inter-modules)', () => {
    // La clé doit refléter le même nom normalisé que celui utilisé ailleurs dans le moteur.
    const drawName = 'Fortune Thursday';
    const key = globalCache.getInterDrawKey('FAMILY_19H55', normalizeDrawName(drawName));
    expect(key).toContain(normalizeDrawName(drawName).toLowerCase().replace(/[\s-]+/g, '_'));
  });
});

describe('Invariant #4 — Étanchéité des 3 familles inter-tirages', () => {
  const familyIds = Object.keys(INTER_DRAW_FAMILIES) as InterDrawFamilyId[];

  const namesOf = (id: InterDrawFamilyId): string[] =>
    INTER_DRAW_FAMILIES[id].sequence.map(s => s.name);

  it('compte exactement 3 familles', () => {
    expect(familyIds.length).toBe(3);
  });

  it('chaque tirage (hors Espoir, partagé par design) n\'appartient qu\'à une seule famille', () => {
    const ownership = new Map<string, InterDrawFamilyId[]>();
    familyIds.forEach(id => {
      namesOf(id).forEach(name => {
        ownership.set(name, [...(ownership.get(name) || []), id]);
      });
    });

    ownership.forEach((families, name) => {
      if (name === 'Espoir') {
        // Exception documentée : Espoir (Dimanche 19H55) relie la famille Nationale et la Nocturne.
        expect(families.length).toBe(2);
      } else {
        expect(families.length, `« ${name} » ne doit appartenir qu'à une seule famille`).toBe(1);
      }
    });
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
