import { describe, it, expect } from 'vitest';
import {
  INTER_DRAW_NETWORKS,
  INTER_DRAW_FAMILIES,
  getInterDrawFamiliesForDraw,
  getFamilyPredecessorAndSuccessor,
  getDrawNetworkId,
  areDrawsInSameNetwork,
  normalizeDrawName
} from '../constants';
import {
  getMirrorNumber,
  getComplement90,
  generateInterDrawReport,
  calculateInterDrawVector,
  generateNetworkInterconnectionMatrix,
  computeContinuousInterDrawCoupling
} from '../services/interDrawService';

describe('CADRE DES RELATIONS INTER-TIRAGES SELON AGENTS.md : 2 RÉSEAUX ÉTANCHES', () => {
  it('doit contenir exactement les 2 réseaux fermés et étanches exigés par AGENTS.md', () => {
    const networkKeys = Object.keys(INTER_DRAW_NETWORKS);
    expect(networkKeys).toContain('hebdomadaire');
    expect(networkKeys).toContain('quotidien');
    expect(networkKeys.length).toBe(2);
  });

  describe('Réseau Hebdomadaire (6 tirages à 19:55 Lun-Sam)', () => {
    const net = INTER_DRAW_NETWORKS.hebdomadaire;

    it('doit contenir exactement 6 tirages dans sa séquence', () => {
      expect(net.sequence.length).toBe(6);
      expect(net.drawNames.length).toBe(6);
    });

    it('tous les tirages doivent être à 19:55 du Lundi au Samedi', () => {
      for (const s of net.sequence) {
        expect(s.time).toBe('19:55');
        expect(['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi']).toContain(s.day);
      }
    });

    it('doit inclure National, Friday Bonanza et Monday Special', () => {
      const names = net.drawNames.map(normalizeDrawName);
      expect(names).toContain(normalizeDrawName('Monday Special'));
      expect(names).toContain(normalizeDrawName('Lucky Tuesday'));
      expect(names).toContain(normalizeDrawName('Midweek'));
      expect(names).toContain(normalizeDrawName('Fortune Thursday'));
      expect(names).toContain(normalizeDrawName('Friday Bonanza'));
      expect(names).toContain(normalizeDrawName('National'));
    });

    it('ne doit pas inclure Espoir (réservé exclusivement au réseau quotidien)', () => {
      const names = net.drawNames.map(normalizeDrawName);
      expect(names).not.toContain(normalizeDrawName('Espoir'));
    });

    it('doit fermer le cycle temporel (le successeur du dernier est le premier)', () => {
      const lastDraw = net.sequence[net.sequence.length - 1];
      const rel = getFamilyPredecessorAndSuccessor(lastDraw.name, 'hebdomadaire');
      expect(rel).toBeDefined();
      expect(rel?.successor.name).toBe(net.sequence[0].name);
    });
  });

  describe('Réseau Quotidien (22 tirages : 10H, 13H, 16H + Espoir Dimanche 19H55)', () => {
    const net = INTER_DRAW_NETWORKS.quotidien;

    it('doit contenir exactement 22 tirages dans sa séquence', () => {
      // 7 jours * 3 créneaux (10H, 13H, 16H) + Espoir Dimanche 19H55 = 22 tirages
      expect(net.sequence.length).toBe(22);
      expect(net.drawNames.length).toBe(22);
    });

    it('doit inclure le tirage Espoir du Dimanche à 19H55', () => {
      const espoir = net.sequence.find(s => s.day === 'Dimanche' && s.time === '19:55');
      expect(espoir).toBeDefined();
      expect(espoir?.name).toBe('Espoir');
    });

    it('doit contenir les tirages fondamentaux : Reveil, Etoile, Akwaba, Fortune, Diamant, Prestige', () => {
      const names = net.drawNames.map(normalizeDrawName);
      expect(names).toContain(normalizeDrawName('Reveil'));
      expect(names).toContain(normalizeDrawName('Etoile'));
      expect(names).toContain(normalizeDrawName('Akwaba'));
      expect(names).toContain(normalizeDrawName('Fortune'));
      expect(names).toContain(normalizeDrawName('Diamant'));
      expect(names).toContain(normalizeDrawName('Prestige'));
      expect(names).toContain(normalizeDrawName('Awale'));
    });

    it('doit fermer le cycle temporel (le successeur du dernier est le premier)', () => {
      const lastDraw = net.sequence[net.sequence.length - 1];
      const rel = getFamilyPredecessorAndSuccessor(lastDraw.name, 'quotidien');
      expect(rel).toBeDefined();
      expect(rel?.successor.name).toBe(net.sequence[0].name);
    });
  });

  describe('Zéro Pollution Inter-Réseaux (AGENTS.md)', () => {
    it('interdit rigoureusement tout croisement entre Réseau Hebdomadaire et Réseau Quotidien', () => {
      const hebdoNames = new Set(INTER_DRAW_NETWORKS.hebdomadaire.drawNames.map(normalizeDrawName));
      const quotNames = new Set(INTER_DRAW_NETWORKS.quotidien.drawNames.map(normalizeDrawName));

      const shared = [...hebdoNames].filter(n => quotNames.has(n));
      expect(shared).toHaveLength(0);
    });

    it('National et Espoir ne se croisent JAMAIS (étanchéité absolue)', () => {
      expect(getDrawNetworkId('National')).toBe('hebdomadaire');
      expect(getDrawNetworkId('Espoir')).toBe('quotidien');
      expect(areDrawsInSameNetwork('National', 'Espoir')).toBe(false);
      expect(areDrawsInSameNetwork('Friday Bonanza', 'Reveil')).toBe(false);
      expect(areDrawsInSameNetwork('Monday Special', 'National')).toBe(true);
      expect(areDrawsInSameNetwork('Reveil', 'Espoir')).toBe(true);
    });
  });

  describe('Matrice d\'Interconnexion Continue (Graphe Complet All-to-All)', () => {
    it('génère un graphe complet sans seuil binaire pour le Réseau Hebdomadaire (6x6)', async () => {
      const matrix = await generateNetworkInterconnectionMatrix('hebdomadaire');
      expect(matrix).toBeDefined();
      expect(matrix.networkId).toBe('hebdomadaire');
      expect(matrix.drawNames.length).toBe(6);
      expect(matrix.couplings.length).toBe(6 * 5); // K_6 sans boucles
      for (const c of matrix.couplings) {
        expect(c.weight).toBeGreaterThan(0);
        expect(c.weight).toBeLessThanOrEqual(1);
        expect(Number.isFinite(c.correlation)).toBe(true);
      }
    });

    it('calcule le couplage continu avec une fonction sigmoïde différentiable', () => {
      const mockHistA = [
        { date: '2026-03-01', draw_name: 'Reveil', gagnants: [1, 2, 3, 4, 5], machine: [] },
        { date: '2026-02-22', draw_name: 'Reveil', gagnants: [11, 12, 13, 14, 15], machine: [] }
      ];
      const mockHistB = [
        { date: '2026-03-01', draw_name: 'Etoile', gagnants: [1, 2, 30, 40, 50], machine: [] },
        { date: '2026-02-22', draw_name: 'Etoile', gagnants: [11, 22, 33, 44, 55], machine: [] }
      ];

      const coupling = computeContinuousInterDrawCoupling(mockHistA, mockHistB);
      expect(coupling.weight).toBeGreaterThan(0);
      expect(coupling.weight).toBeLessThanOrEqual(1);
      expect(coupling.correlation).toBeGreaterThanOrEqual(-1);
      expect(coupling.correlation).toBeLessThanOrEqual(1);
    });
  });

  describe('Opérateurs Harmoniques Déterministes', () => {
    it('calcule correctement les miroirs décimaux dans [1, 90]', () => {
      expect(getMirrorNumber(7)).toBe(70);
      expect(getMirrorNumber(70)).toBe(7);
      expect(getMirrorNumber(23)).toBe(32);
      expect(getMirrorNumber(32)).toBe(23);
      expect(getMirrorNumber(44)).toBe(44); // palindrome
      expect(getMirrorNumber(19)).toBe(91 > 90 ? 19 : 91);
    });

    it('calcule correctement le complémentaire à 90 (somme = 91)', () => {
      expect(getComplement90(1)).toBe(90);
      expect(getComplement90(90)).toBe(1);
      expect(getComplement90(45)).toBe(46);
      expect(getComplement90(46)).toBe(45);
      expect(getComplement90(15)).toBe(76);
    });
  });

  describe('Moteur de Génération de Rapport Inter-Tirages', () => {
    it('génère un rapport valide pour un tirage du Réseau Quotidien (ex: Fortune)', async () => {
      const report = await generateInterDrawReport('Fortune');
      expect(report).toBeDefined();
      expect(report?.family.id).toBe('quotidien');
      expect(report?.targetDraw).toBe('Fortune');
      expect(report?.topCandidates.length).toBeGreaterThan(0);
      expect(report?.recommendedPairs.length).toBeGreaterThan(0);
      expect(report?.carryOverRate).toBeGreaterThan(0);
      expect(report?.sourceTransitions).toBeDefined();
      expect(report?.sourceTransitions.length).toBe(5);
      expect(report?.fullCandidateScores).toBeDefined();
      expect(report?.fullCandidateScores.length).toBe(91);
      for (let i = 1; i <= 90; i++) {
        expect(report!.fullCandidateScores[i]).toBeGreaterThanOrEqual(0.01);
        expect(report!.fullCandidateScores[i]).toBeLessThanOrEqual(1.0);
      }
    });

    it('génère un rapport valide pour un tirage de 10H (ex: Reveil)', async () => {
      const report = await generateInterDrawReport('Reveil');
      expect(report).toBeDefined();
      expect(report?.family.id).toBe('quotidien');
      expect(report?.targetDraw).toBe('Reveil');
      expect(report?.sourceTransitions.length).toBe(5);
    });

    it('génère un rapport valide pour un tirage du Réseau Hebdomadaire (ex: National)', async () => {
      const report = await generateInterDrawReport('National');
      expect(report).toBeDefined();
      expect(report?.family.id).toBe('hebdomadaire');
      expect(report?.targetDraw).toBe('National');
      expect(report?.topCandidates.length).toBeGreaterThan(0);
    });
  });

  describe('Vecteur de Transition Inter-Tirages (calculateInterDrawVector)', () => {
    it('polarise les scores sur les numéros du tirage prédécesseur et non sur le tirage cible lui-même', () => {
      const targetHistory = [
        { date: '2026-03-01', draw_name: 'Fortune', gagnants: [81, 82, 83, 84, 85], machine: [] },
        { date: '2026-02-22', draw_name: 'Fortune', gagnants: [81, 82, 83, 84, 85], machine: [] }
      ];

      const predecessorHistory = [
        { date: '2026-02-28', draw_name: 'Emergence', gagnants: [7, 14, 21, 28, 35], machine: [] },
        { date: '2026-02-21', draw_name: 'Emergence', gagnants: [7, 14, 21, 28, 35], machine: [] }
      ];

      const vector = calculateInterDrawVector(targetHistory, 'Fortune', predecessorHistory);
      expect(vector).toBeDefined();
      expect(vector.length).toBe(91);

      expect(vector[7]).toBeGreaterThan(vector[51]); // Report direct carry-over
      expect(vector[14]).toBeGreaterThan(vector[52]); // Report direct carry-over
      expect(vector[81]).toBeGreaterThan(vector[53]); // Transition Markov observée
      expect(vector[70]).toBeGreaterThan(vector[54]); // Résonance Miroir décimal du prédécesseur (7 -> 70)
      expect(vector[84]).toBeGreaterThan(vector[55]); // Transition Markov observée
    });
  });
});
