export interface DrawSchedule {
  id: string;
  name: string;
  dayOfWeek: number; // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  time: string; // HH:mm
}

export const DRAWS: DrawSchedule[] = [
  // Lundi (1)
  { id: 'reveil', name: 'Reveil', dayOfWeek: 1, time: '10:00' },
  { id: 'etoile', name: 'Etoile', dayOfWeek: 1, time: '13:00' },
  { id: 'akwaba', name: 'Akwaba', dayOfWeek: 1, time: '16:00' },
  { id: 'monday_special', name: 'Monday Special', dayOfWeek: 1, time: '18:15' },
  
  // Mardi (2)
  { id: 'la_matinale', name: 'La Matinale', dayOfWeek: 2, time: '10:00' },
  { id: 'emergence', name: 'Emergence', dayOfWeek: 2, time: '13:00' },
  { id: 'sika', name: 'Sika', dayOfWeek: 2, time: '16:00' },
  { id: 'lucky_tuesday', name: 'Lucky Tuesday', dayOfWeek: 2, time: '18:15' },
  
  // Mercredi (3)
  { id: 'premiere_heure', name: 'Premiere Heure', dayOfWeek: 3, time: '10:00' },
  { id: 'fortune', name: 'Fortune', dayOfWeek: 3, time: '13:00' },
  { id: 'baraka', name: 'Baraka', dayOfWeek: 3, time: '16:00' },
  { id: 'midweek', name: 'Midweek', dayOfWeek: 3, time: '18:15' },
  
  // Jeudi (4)
  { id: 'kado', name: 'Kado', dayOfWeek: 4, time: '10:00' },
  { id: 'privilege', name: 'Privilege', dayOfWeek: 4, time: '13:00' },
  { id: 'monni', name: 'Monni', dayOfWeek: 4, time: '16:00' },
  { id: 'fortune_thursday', name: 'Fortune Thursday', dayOfWeek: 4, time: '18:15' },
  
  // Vendredi (5)
  { id: 'cash', name: 'Cash', dayOfWeek: 5, time: '10:00' },
  { id: 'solution', name: 'Solution', dayOfWeek: 5, time: '13:00' },
  { id: 'wari', name: 'Wari', dayOfWeek: 5, time: '16:00' },
  { id: 'friday_bonanza', name: 'Friday Bonanza', dayOfWeek: 5, time: '18:15' },
  
  // Samedi (6)
  { id: 'soutra', name: 'Soutra', dayOfWeek: 6, time: '10:00' },
  { id: 'diamant', name: 'Diamant', dayOfWeek: 6, time: '13:00' },
  { id: 'moaye', name: 'Moaye', dayOfWeek: 6, time: '16:00' },
  { id: 'national', name: 'National', dayOfWeek: 6, time: '18:15' },
  
  // Dimanche (0)
  { id: 'benediction', name: 'Benediction', dayOfWeek: 0, time: '10:00' },
  { id: 'prestige', name: 'Prestige', dayOfWeek: 0, time: '13:00' },
  { id: 'awale', name: 'Awale', dayOfWeek: 0, time: '16:00' },
  { id: 'espoir', name: 'Espoir', dayOfWeek: 0, time: '18:15' },
];

export const DAYS_OF_WEEK = [
  'Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'
];
