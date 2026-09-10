
export const DRAW_SCHEDULE: Record<string, Record<string, string>> = {
  'Lundi': { 
    '10:00': 'Reveil', 
    '13:00': 'Etoile', 
    '16:00': 'Akwaba', 
    '19:55': 'Monday Special' 
  },
  'Mardi': { 
    '10:00': 'La Matinale', 
    '13:00': 'Emergence', 
    '16:00': 'Sika', 
    '19:55': 'Lucky Tuesday' 
  },
  'Mercredi': { 
    '10:00': 'Premiere Heure', 
    '13:00': 'Fortune', 
    '16:00': 'Baraka', 
    '19:55': 'Midweek' 
  },
  'Jeudi': { 
    '10:00': 'Kado', 
    '13:00': 'Privilege', 
    '16:00': 'Monni', 
    '19:55': 'Fortune Thursday' 
  },
  'Vendredi': { 
    '10:00': 'Cash', 
    '13:00': 'Solution', 
    '16:00': 'Wari', 
    '19:55': 'Friday Bonanza' 
  },
  'Samedi': { 
    '10:00': 'Soutra', 
    '13:00': 'Diamant', 
    '16:00': 'Moaye', 
    '19:55': 'National' 
  },
  'Dimanche': { 
    '10:00': 'Benediction', 
    '13:00': 'Prestige', 
    '16:00': 'Awale', 
    '19:55': 'Espoir' 
  },
};

// Métadonnées visuelles pour les créneaux horaires - Design Expert
export const SLOT_CONFIG: Record<string, { color: string, icon: string, label: string }> = {
    '10:00': { color: 'text-amber-400', icon: '🌅', label: 'Morning' },
    '13:00': { color: 'text-blue-400', icon: '☀️', label: 'Zenith' },
    '16:00': { color: 'text-orange-400', icon: '🌤️', label: 'Daylight' },
    '19:55': { color: 'text-indigo-400', icon: '🌙', label: 'Twilight' }
};

/**
 * Liste des tirages officiels ne disposant pas de numéros machine (notamment Fortune Thursday).
 * Règle d'or : Fortune (Mercredi 13:00) dispose de numéros machine,
 * tandis que Fortune Thursday (Jeudi 19:55) n'a AUCUN numéro machine.
 */
export const DRAWS_WITHOUT_MACHINE = ['Fortune Thursday'] as const;

export const isDrawWithoutMachine = (drawName?: string | null): boolean => {
  if (!drawName) return false;
  const normalized = drawName
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^(loto|tirage)\s+/i, "")
    .replace(/[\s\-_/]+/g, " ")
    .trim();
  return DRAWS_WITHOUT_MACHINE.some(d => {
    const normD = d
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
    return normD === normalized;
  });
};

// Liste plate pour les itérations rapides et les sélecteurs
export const ALL_DRAWS = Object.entries(DRAW_SCHEDULE).flatMap(([day, times]) => 
    Object.entries(times).map(([time, name]) => ({
        name,
        time,
        day
    }))
);

/**
 * CADRE ARCHITECTURAL DES RELATIONS INTER-TIRAGES (3 FAMILLES STRICTEMENT ÉTANCHES)
 * 1. Famille Nationale LONACI : Tirages de 10H, 16H et uniquement le Tirage de 19H55 du dimanche (Espoir).
 * 2. Famille Zénith : Tirages de 13H exclusivement.
 * 3. Famille Nocturne : Tirages de 19H55 exclusivement.
 */
export type InterDrawFamilyId = 'FAMILY_10H_16H_SUN19H55' | 'FAMILY_13H' | 'FAMILY_19H55';

export interface InterDrawSequenceItem {
  day: string;
  time: string;
  name: string;
}

export interface InterDrawFamilyConfig {
  id: InterDrawFamilyId;
  name: string;
  shortName: string;
  label: string;
  description: string;
  color: string;
  badgeBg: string;
  badgeBorder: string;
  icon: string;
  slotsSummary: string;
  sequence: InterDrawSequenceItem[];
  drawNames: string[];
}

export const INTER_DRAW_FAMILIES: Record<InterDrawFamilyId, InterDrawFamilyConfig> = {
  FAMILY_10H_16H_SUN19H55: {
    id: 'FAMILY_10H_16H_SUN19H55',
    name: 'Famille Nationale LONACI (10H, 16H & Dimanche 19H55)',
    shortName: '10H / 16H / Dim 19H55',
    label: 'Nationale (10H - 16H - Dim 19H55)',
    description: 'Relations inter-tirages pour les tirages de 10H, 16H et seulement le Tirage de 19H55 du dimanche (Espoir).',
    color: 'text-amber-400',
    badgeBg: 'bg-amber-500/10 dark:bg-amber-950/40',
    badgeBorder: 'border-amber-500/30 dark:border-amber-500/40',
    icon: '🌅',
    slotsSummary: '10:00 (7) + 16:00 (7) + Dimanche 19:55 (Espoir) — 15 tirages',
    sequence: [
      { day: 'Lundi', time: '10:00', name: 'Reveil' },
      { day: 'Lundi', time: '16:00', name: 'Akwaba' },
      { day: 'Mardi', time: '10:00', name: 'La Matinale' },
      { day: 'Mardi', time: '16:00', name: 'Sika' },
      { day: 'Mercredi', time: '10:00', name: 'Premiere Heure' },
      { day: 'Mercredi', time: '16:00', name: 'Baraka' },
      { day: 'Jeudi', time: '10:00', name: 'Kado' },
      { day: 'Jeudi', time: '16:00', name: 'Monni' },
      { day: 'Vendredi', time: '10:00', name: 'Cash' },
      { day: 'Vendredi', time: '16:00', name: 'Wari' },
      { day: 'Samedi', time: '10:00', name: 'Soutra' },
      { day: 'Samedi', time: '16:00', name: 'Moaye' },
      { day: 'Dimanche', time: '10:00', name: 'Benediction' },
      { day: 'Dimanche', time: '16:00', name: 'Awale' },
      { day: 'Dimanche', time: '19:55', name: 'Espoir' },
    ],
    drawNames: [
      'Reveil', 'La Matinale', 'Premiere Heure', 'Kado', 'Cash', 'Soutra', 'Benediction',
      'Akwaba', 'Sika', 'Baraka', 'Monni', 'Wari', 'Moaye', 'Awale',
      'Espoir'
    ]
  },
  FAMILY_13H: {
    id: 'FAMILY_13H',
    name: 'Famille Zénith (13H Méridien)',
    shortName: 'Tirages 13H',
    label: 'Zénith (13H Quotidien)',
    description: 'Relations inter-tirages exclusives pour l\'ensemble des tirages de 13H.',
    color: 'text-sky-400',
    badgeBg: 'bg-sky-500/10 dark:bg-sky-950/40',
    badgeBorder: 'border-sky-500/30 dark:border-sky-500/40',
    icon: '☀️',
    slotsSummary: '13:00 (7 tirages quotidiens du midi)',
    sequence: [
      { day: 'Lundi', time: '13:00', name: 'Etoile' },
      { day: 'Mardi', time: '13:00', name: 'Emergence' },
      { day: 'Mercredi', time: '13:00', name: 'Fortune' },
      { day: 'Jeudi', time: '13:00', name: 'Privilege' },
      { day: 'Vendredi', time: '13:00', name: 'Solution' },
      { day: 'Samedi', time: '13:00', name: 'Diamant' },
      { day: 'Dimanche', time: '13:00', name: 'Prestige' },
    ],
    drawNames: [
      'Etoile', 'Emergence', 'Fortune', 'Privilege', 'Solution', 'Diamant', 'Prestige'
    ]
  },
  FAMILY_19H55: {
    id: 'FAMILY_19H55',
    name: 'Famille Nocturne (19H55 Soirée)',
    shortName: 'Tirages 19H55',
    label: 'Nocturne (19H55 Soir)',
    description: 'Relations inter-tirages exclusives pour l\'ensemble des Tirages de 19H55.',
    color: 'text-indigo-400',
    badgeBg: 'bg-indigo-500/10 dark:bg-indigo-950/40',
    badgeBorder: 'border-indigo-500/30 dark:border-indigo-500/40',
    icon: '🌙',
    slotsSummary: '19:55 (7 tirages du soir)',
    sequence: [
      { day: 'Lundi', time: '19:55', name: 'Monday Special' },
      { day: 'Mardi', time: '19:55', name: 'Lucky Tuesday' },
      { day: 'Mercredi', time: '19:55', name: 'Midweek' },
      { day: 'Jeudi', time: '19:55', name: 'Fortune Thursday' },
      { day: 'Vendredi', time: '19:55', name: 'Friday Bonanza' },
      { day: 'Samedi', time: '19:55', name: 'National' },
      { day: 'Dimanche', time: '19:55', name: 'Espoir' },
    ],
    drawNames: [
      'Monday Special', 'Lucky Tuesday', 'Midweek', 'Fortune Thursday', 'Friday Bonanza', 'National', 'Espoir'
    ]
  }
};

/**
 * Normalise un nom de tirage pour matching robuste (accents, casse, préfixes)
 */
export const normalizeDrawName = (drawName?: string | null): string => {
  if (!drawName) return '';
  return drawName
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/^(loto|tirage)\s+/i, "")
    .replace(/[\s\-_/]+/g, " ")
    .trim();
};

/**
 * Retourne la liste des familles inter-tirages auxquelles appartient un tirage donné.
 * Exemple : 'Espoir' appartient à la fois à FAMILY_10H_16H_SUN19H55 et FAMILY_19H55.
 */
export const getInterDrawFamiliesForDraw = (drawName?: string | null): InterDrawFamilyConfig[] => {
  if (!drawName) return [];
  const norm = normalizeDrawName(drawName);
  return Object.values(INTER_DRAW_FAMILIES).filter(fam =>
    fam.drawNames.some(d => normalizeDrawName(d) === norm)
  );
};

/**
 * Retourne la famille prioritaire d'un tirage.
 */
export const getPrimaryInterDrawFamily = (drawName?: string | null): InterDrawFamilyConfig | null => {
  const families = getInterDrawFamiliesForDraw(drawName);
  return families.length > 0 ? families[0] : null;
};

/**
 * Vérifie si un tirage appartient à une famille inter-tirage donnée.
 */
export const isDrawInInterDrawFamily = (drawName: string, familyId: InterDrawFamilyId): boolean => {
  const fam = INTER_DRAW_FAMILIES[familyId];
  if (!fam) return false;
  const norm = normalizeDrawName(drawName);
  return fam.drawNames.some(d => normalizeDrawName(d) === norm);
};

/**
 * Calcule le prédécesseur et le successeur chronologique direct au sein d'une famille.
 */
export const getFamilyPredecessorAndSuccessor = (
  drawName: string,
  familyId: InterDrawFamilyId
): { predecessor: InterDrawSequenceItem; successor: InterDrawSequenceItem; currentIndex: number } | null => {
  const fam = INTER_DRAW_FAMILIES[familyId];
  if (!fam) return null;
  const norm = normalizeDrawName(drawName);
  const idx = fam.sequence.findIndex(s => normalizeDrawName(s.name) === norm);
  if (idx === -1) return null;

  const len = fam.sequence.length;
  const predIdx = (idx - 1 + len) % len;
  const succIdx = (idx + 1) % len;

  return {
    predecessor: fam.sequence[predIdx],
    successor: fam.sequence[succIdx],
    currentIndex: idx
  };
};

export const LOTO_PAYOUTS = {
    STANDARD: {
        SIMPLE: {
            '1N': { label: '1 Numéro', odds: 15, gain: 1500 },
            '2N': { label: '2 Numéros', odds: 240, gain: 24000 },
            '3N': { label: '3 Numéros', odds: 2100, gain: 210000 },
            '4N': { label: '4 Numéros', odds: 15000, gain: 1500000 },
            '5N': { label: '5 Numéros', odds: 40000, gain: 4000000 },
        },
        TURBO: {
            'T2': { label: 'Turbo 2', odds: 120, gain: 12000 },
            'T3': { label: 'Turbo 3', odds: 600, gain: 60000 },
        }
    },
    DOUBLE_CHANCE: {
        SIMPLE: {
            '1N': { label: '1 Numéro (DC)', odds: 10, gain: 1000 },
            '2N': { label: '2 Numéros (DC)', odds: 100, gain: 10000 },
            '3N': { label: '3 Numéros (DC)', odds: 1000, gain: 100000 },
            '4N': { label: '4 Numéros (DC)', odds: 5000, gain: 500000 },
            '5N': { label: '5 Numéros (DC)', odds: 20000, gain: 2000000 },
        },
        TURBO: {
            'T2': { label: 'Turbo 2 (DC)', odds: 50, gain: 5000 },
            'T3': { label: 'Turbo 3 (DC)', odds: 250, gain: 25000 },
        }
    },
    DOUBLE_CHANCE_MACHINE: {
        SIMPLE: {
            '1N': { label: '1 Numéro (DCM)', odds: 8, gain: 800 },
            '2N': { label: '2 Numéros (DCM)', odds: 80, gain: 8000 },
            '3N': { label: '3 Numéros (DCM)', odds: 800, gain: 80000 },
            '4N': { label: '4 Numéros (DCM)', odds: 4000, gain: 400000 },
            '5N': { label: '5 Numéros (DCM)', odds: 15000, gain: 1500000 },
        },
        TURBO: {
            'T2': { label: 'Turbo 2 (DCM)', odds: 40, gain: 4000 },
            'T3': { label: 'Turbo 3 (DCM)', odds: 200, gain: 20000 },
        }
    }
};

export const getNumberColor = (n: number): string => {
  if (n < 10) return 'bg-slate-600 border-slate-400 shadow-slate-400/20';
  if (n < 20) return 'bg-blue-600 border-blue-400 shadow-blue-400/20';
  if (n < 30) return 'bg-emerald-600 border-emerald-400 shadow-emerald-400/20';
  if (n < 40) return 'bg-yellow-500 border-yellow-300 shadow-yellow-300/20';
  if (n < 50) return 'bg-orange-600 border-orange-400 shadow-orange-400/20';
  if (n < 60) return 'bg-red-600 border-red-400 shadow-red-400/20';
  if (n < 70) return 'bg-purple-600 border-purple-400 shadow-purple-400/20';
  if (n < 80) return 'bg-pink-600 border-pink-400 shadow-pink-400/20';
  return 'bg-rose-700 border-rose-500 shadow-rose-500/20';
};

export function getPayoutMultiplier(model: string, hits: number): number {
  if (model === "LEGACY" || !model) {
    if (hits === 2) return 15;
    if (hits === 3) return 100;
    if (hits === 4) return 1500;
    if (hits === 5) return 15000;
    return 0;
  }
  
  if (model === "STANDARD") {
    if (hits === 1) return 15;
    if (hits === 2) return 240;
    if (hits === 3) return 2100;
    if (hits === 4) return 15000;
    if (hits === 5) return 40000;
    return 0;
  }
  
  if (model === "DOUBLE_CHANCE") {
    if (hits === 1) return 10;
    if (hits === 2) return 100;
    if (hits === 3) return 1000;
    if (hits === 4) return 5000;
    if (hits === 5) return 20000;
    return 0;
  }
  
  if (model === "DOUBLE_CHANCE_MACHINE") {
    if (hits === 1) return 8;
    if (hits === 2) return 80;
    if (hits === 3) return 800;
    if (hits === 4) return 4000;
    if (hits === 5) return 15000;
    return 0;
  }
  
  return 0;
}

