
export const DRAW_SCHEDULE: Record<string, Record<string, string>> = {
  'Lundi': { 
    '07:00': 'Digital Reveil 7h',
    '08:00': 'Digital Reveil 8h',
    '10:00': 'Reveil', 
    '13:00': 'Etoile', 
    '16:00': 'Akwaba', 
    '18:15': 'Monday Special',
    '19:00': 'Afterwork',
    '20:00': 'Day Off',
    '21:00': 'Digital 21h',
    '22:00': 'Digital 22h',
    '23:00': 'Digital 23h'
  },
  'Mardi': { 
    '07:00': 'Digital Reveil 7h',
    '08:00': 'Digital Reveil 8h',
    '10:00': 'La Matinale', 
    '13:00': 'Emergence', 
    '16:00': 'Sika', 
    '18:15': 'Lucky Tuesday',
    '19:00': 'Afterwork',
    '21:00': 'Digital 21h',
    '22:00': 'Digital 22h',
    '23:00': 'Digital 23h'
  },
  'Mercredi': { 
    '07:00': 'Digital Reveil 7h',
    '08:00': 'Digital Reveil 8h',
    '10:00': 'Premiere Heure', 
    '13:00': 'Fortune', 
    '16:00': 'Baraka', 
    '18:15': 'Midweek',
    '19:00': 'Afterwork',
    '21:00': 'Digital 21h',
    '22:00': 'Digital 22h',
    '23:00': 'Digital 23h'
  },
  'Jeudi': { 
    '07:00': 'Digital Reveil 7h',
    '08:00': 'Digital Reveil 8h',
    '10:00': 'Kado', 
    '13:00': 'Privilege', 
    '16:00': 'Monni', 
    '18:15': 'Fortune Thursday',
    '19:00': 'Afterwork',
    '21:00': 'Digital 21h',
    '22:00': 'Digital 22h',
    '23:00': 'Digital 23h'
  },
  'Vendredi': { 
    '07:00': 'Digital Reveil 7h',
    '08:00': 'Digital Reveil 8h',
    '10:00': 'Cash', 
    '13:00': 'Solution', 
    '16:00': 'Wari', 
    '18:15': 'Friday Bonanza',
    '19:00': 'Afterwork',
    '20:00': 'Day Off',
    '21:00': 'Digital 21h',
    '22:00': 'Digital 22h',
    '23:00': 'Digital 23h'
  },
  'Samedi': { 
    '01:00': 'Special Weekend 1h',
    '03:00': 'Special Weekend 3h',
    '07:00': 'Digital Reveil 7h',
    '08:00': 'Digital Reveil 8h',
    '10:00': 'Soutra', 
    '13:00': 'Diamant', 
    '16:00': 'Moaye', 
    '18:15': 'National',
    '19:00': 'Afterwork',
    '21:00': 'Digital 21h',
    '22:00': 'Digital 22h',
    '23:00': 'Digital 23h'
  },
  'Dimanche': { 
    '01:00': 'Special Weekend 1h',
    '03:00': 'Special Weekend 3h',
    '07:00': 'Digital Reveil 7h',
    '08:00': 'Digital Reveil 8h',
    '10:00': 'Benediction', 
    '13:00': 'Prestige', 
    '16:00': 'Awale', 
    '18:15': 'Espoir',
    '19:00': 'Afterwork',
    '21:00': 'Digital 21h',
    '22:00': 'Digital 22h',
    '23:00': 'Digital 23h'
  },
};

// Métadonnées visuelles pour les créneaux horaires - Design Expert
export const SLOT_CONFIG: Record<string, { color: string, icon: string, label: string }> = {
    '10:00': { color: 'text-amber-400', icon: '🌅', label: 'Morning' },
    '13:00': { color: 'text-blue-400', icon: '☀️', label: 'Zenith' },
    '16:00': { color: 'text-orange-400', icon: '🌤️', label: 'Daylight' },
    '18:15': { color: 'text-indigo-400', icon: '🌙', label: 'Twilight' }
};

// Liste plate pour les itérations rapides et les sélecteurs (dédoublonnée par nom)
export const ALL_DRAWS = Array.from(
    new Map(
        Object.entries(DRAW_SCHEDULE).flatMap(([day, times]) => 
            Object.entries(times).map(([time, name]) => [name, { name, time, day }])
        )
    ).values()
);

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
  if (n < 10) return 'bg-slate-700 border-slate-500 shadow-slate-500/20';
  if (n < 20) return 'bg-blue-900 border-blue-500 shadow-blue-500/20';
  if (n < 30) return 'bg-emerald-900 border-emerald-500 shadow-emerald-500/20';
  if (n < 40) return 'bg-yellow-900 border-yellow-500 shadow-yellow-500/20';
  if (n < 50) return 'bg-orange-900 border-orange-500 shadow-orange-500/20';
  if (n < 60) return 'bg-red-900 border-red-500 shadow-red-500/20';
  if (n < 70) return 'bg-purple-900 border-purple-500 shadow-purple-500/20';
  if (n < 80) return 'bg-pink-900 border-pink-500 shadow-pink-500/20';
  return 'bg-rose-950 border-rose-500 shadow-rose-500/20';
};
