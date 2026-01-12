
// Fichier de constantes simplifié pour les fonctions Supabase Edge.

export interface Draw { day: string; time: string; name: string; }

export const DRAW_SCHEDULE: Record<string, Record<string, string>> = {
  'Lundi': { 
    '10:00': 'Reveil', 
    '13:00': 'Etoile', 
    '16:00': 'Akwaba', 
    '18:15': 'Monday Special' 
  },
  'Mardi': { 
    '10:00': 'La Matinale', 
    '13:00': 'Emergence', 
    '16:00': 'Sika', 
    '18:15': 'Lucky Tuesday' 
  },
  'Mercredi': { 
    '10:00': 'Premiere Heure', 
    '13:00': 'Fortune', 
    '16:00': 'Baraka', 
    '18:15': 'Midweek' 
  },
  'Jeudi': { 
    '10:00': 'Kado', 
    '13:00': 'Privilege', 
    '16:00': 'Monni', 
    '18:15': 'Fortune Thursday' 
  },
  'Vendredi': { 
    '10:00': 'Cash', 
    '13:00': 'Solution', 
    '16:00': 'Wari', 
    '18:15': 'Friday Bonanza' 
  },
  'Samedi': { 
    '10:00': 'Soutra', 
    '13:00': 'Diamant', 
    '16:00': 'Moaye', 
    '18:15': 'National' 
  },
  'Dimanche': { 
    '10:00': 'Benediction', 
    '13:00': 'Prestige', 
    '16:00': 'Awale', 
    '18:15': 'Espoir' 
  },
};
