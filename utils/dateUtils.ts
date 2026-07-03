/**
 * Outil robuste de traitement et de parsing des dates.
 * Évite le bug classique de "Invalid Date" lié au format français DD/MM/YYYY dans le moteur JS.
 */

export const parseDateSafely = (dateVal: any): Date => {
  if (dateVal === null || dateVal === undefined) return new Date();
  if (dateVal instanceof Date) {
    return isNaN(dateVal.getTime()) ? new Date() : dateVal;
  }
  
  const dateStr = String(dateVal).trim();
  if (!dateStr) return new Date();
  
  // 1. Format français DD/MM/YYYY (avec optionnellement une partie Heure après T ou espace)
  // Ex: "26/06/2026" ou "26/06/2026 13:00"
  if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(dateStr)) {
    const cleanDateStr = dateStr.split(/[ T]/)[0];
    const parts = cleanDateStr.split('/');
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; // 0-indexed en JS
    const year = parseInt(parts[2], 10);
    
    // On extrait l'heure si elle existe
    let hour = 0, minute = 0, second = 0;
    const timeMatch = dateStr.match(/[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
    if (timeMatch) {
      hour = parseInt(timeMatch[1], 10);
      minute = parseInt(timeMatch[2], 10);
      if (timeMatch[3]) second = parseInt(timeMatch[3], 10);
    }
    
    const d = new Date(year, month, day, hour, minute, second);
    if (!isNaN(d.getTime())) return d;
  }
  
  // 2. Format ISO ou US YYYY-MM-DD ou YYYY/MM/DD
  if (/^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(dateStr)) {
    const cleanDateStr = dateStr.split(/[ T]/)[0];
    const separator = dateStr.includes('-') ? '-' : '/';
    const parts = cleanDateStr.split(separator);
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    
    let hour = 0, minute = 0, second = 0;
    const timeMatch = dateStr.match(/[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
    if (timeMatch) {
      hour = parseInt(timeMatch[1], 10);
      minute = parseInt(timeMatch[2], 10);
      if (timeMatch[3]) second = parseInt(timeMatch[3], 10);
    }
    
    const d = new Date(year, month, day, hour, minute, second);
    if (!isNaN(d.getTime())) return d;
  }

  // 3. Essai d'un parsing standard
  const parsed = new Date(dateStr);
  if (!isNaN(parsed.getTime())) {
    return parsed;
  }
  
  // 4. Si la chaîne ressemble à un timestamp brut
  const timestamp = Number(dateStr);
  if (!isNaN(timestamp) && timestamp > 0) {
    const d = new Date(timestamp);
    if (!isNaN(d.getTime())) return d;
  }
  
  // Fallback sécurisé
  return new Date();
};

export const formatDateSafely = (
  dateVal: any, 
  options: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric' },
  locale: string = 'fr-FR'
): string => {
  try {
    const d = parseDateSafely(dateVal);
    return d.toLocaleDateString(locale, options);
  } catch (e) {
    return "Date Invalide";
  }
};
