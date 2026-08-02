import { DRAW_SCHEDULE } from "../constants";

export interface ScheduledDraw {
  dayName: string;
  timeString: string;
  drawName: string;
  targetDate: Date;
  minutesUntil: number;
}

const FRENCH_DAYS = [
  "Dimanche",
  "Lundi",
  "Mardi",
  "Mercredi",
  "Jeudi",
  "Vendredi",
  "Samedi"
];

const NOTIFICATIONS_ENABLED_KEY = "lotopro_push_notifications_enabled";
const NOTIFIED_DRAWS_KEY = "lotopro_notified_draws";

/**
 * Calcule le prochain tirage à venir à partir d'une date donnée.
 */
export function getNextDraw(now: Date): ScheduledDraw {
  let bestDraw: ScheduledDraw | null = null;
  
  for (let dShift = 0; dShift < 8; dShift++) {
    const targetDayDate = new Date(now.getTime() + dShift * 24 * 60 * 60 * 1000);
    const dayName = FRENCH_DAYS[targetDayDate.getDay()];
    const timesMap = DRAW_SCHEDULE[dayName];
    
    if (!timesMap) continue;
    
    for (const [timeStr, drawName] of Object.entries(timesMap)) {
      const [hours, minutes] = timeStr.split(":").map(Number);
      const drawDate = new Date(targetDayDate);
      drawDate.setHours(hours, minutes, 0, 0);
      
      const diffMs = drawDate.getTime() - now.getTime();
      if (diffMs > 0) {
        const minutesUntil = diffMs / (60 * 1000);
        const candidate: ScheduledDraw = {
          dayName,
          timeString: timeStr,
          drawName,
          targetDate: drawDate,
          minutesUntil
        };
        
        if (!bestDraw || candidate.targetDate.getTime() < bestDraw.targetDate.getTime()) {
          bestDraw = candidate;
        }
      }
    }
  }
  
  if (!bestDraw) {
    throw new Error("Aucun tirage futur trouvé dans le calendrier.");
  }
  
  return bestDraw;
}

/**
 * Service de gestion des notifications déterministes.
 */
class NotificationService {
  private checkIntervalId: any = null;
  private listeners: Set<(nextDraw: ScheduledDraw) => void> = new Set();

  constructor() {
    if (typeof window !== "undefined") {
      this.startCheckLoop();
    }
  }

  isSupported(): boolean {
    return typeof window !== "undefined" && "Notification" in window;
  }

  getPermissionState(): NotificationPermission {
    if (!this.isSupported()) return "denied";
    return Notification.permission;
  }

  async requestPermission(): Promise<boolean> {
    if (!this.isSupported()) return false;
    const permission = await Notification.requestPermission();
    const isGranted = permission === "granted";
    if (isGranted) {
      this.setEnabledSetting(true);
    }
    return isGranted;
  }

  isEnabled(): boolean {
    if (!this.isSupported()) return false;
    const enabledSetting = localStorage.getItem(NOTIFICATIONS_ENABLED_KEY) !== "false";
    return this.getPermissionState() === "granted" && enabledSetting;
  }

  setEnabledSetting(enabled: boolean) {
    localStorage.setItem(NOTIFICATIONS_ENABLED_KEY, String(enabled));
  }

  getNotifiedDraws(): string[] {
    try {
      const raw = localStorage.getItem(NOTIFIED_DRAWS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  markAsNotified(drawKey: string) {
    const notified = this.getNotifiedDraws();
    if (!notified.includes(drawKey)) {
      notified.push(drawKey);
      localStorage.setItem(NOTIFIED_DRAWS_KEY, JSON.stringify(notified));
    }
  }

  sendNotification(title: string, body: string, iconUrl?: string) {
    if (!this.isEnabled()) return;
    try {
      new Notification(title, {
        body,
        icon: iconUrl || "/icon.svg",
        tag: "lotopro-draw-alert",
      });
    } catch (e) {
      console.warn("[NotificationService] Fallback to service worker notification:", e);
      // Fallback via service worker if available
      if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        navigator.serviceWorker.ready.then((registration) => {
          registration.showNotification(title, {
            body,
            icon: iconUrl || "/icon.svg",
            tag: "lotopro-draw-alert",
          });
        });
      }
    }
  }

  addListener(listener: (nextDraw: ScheduledDraw) => void) {
    this.listeners.add(listener);
    // Call immediately to provide initial state
    try {
      listener(getNextDraw(new Date()));
    } catch {}
  }

  removeListener(listener: (nextDraw: ScheduledDraw) => void) {
    this.listeners.delete(listener);
  }

  private startCheckLoop() {
    if (this.checkIntervalId) return;

    // Run every 30 seconds
    this.checkIntervalId = setInterval(() => {
      this.checkDrawTime();
    }, 30000);

    // Initial check
    setTimeout(() => this.checkDrawTime(), 1000);
  }

  private checkDrawTime() {
    try {
      const now = new Date();
      const nextDraw = getNextDraw(now);

      // Notify listeners
      this.listeners.forEach((l) => {
        try {
          l(nextDraw);
        } catch {}
      });

      // Target lead time: 5 to 10 minutes before the draw
      const isWithinWindow = nextDraw.minutesUntil >= 5.0 && nextDraw.minutesUntil <= 10.0;
      if (isWithinWindow && this.isEnabled()) {
        const dateKey = `${nextDraw.targetDate.getFullYear()}-${nextDraw.targetDate.getMonth()}-${nextDraw.targetDate.getDate()}`;
        const drawKey = `${dateKey}_${nextDraw.dayName}_${nextDraw.timeString}`;
        const notified = this.getNotifiedDraws();

        if (!notified.includes(drawKey)) {
          this.markAsNotified(drawKey);
          
          // Formulate discrete deterministic trigger notification message
          const minutesLeft = Math.round(nextDraw.minutesUntil);
          const title = `Stabilisation Thermique Active - ${nextDraw.drawName}`;
          const body = `Le tirage ${nextDraw.drawName} débute dans exactement ${minutesLeft} minutes. L'entropie thermique du modèle s'est stabilisée au seuil optimal de convergence. Générez votre prédiction !`;
          
          this.sendNotification(title, body);
        }
      }

      // Cleanup old notified keys that are more than 1 day old
      const notified = this.getNotifiedDraws();
      if (notified.length > 50) {
        // Keep only last 20 notified entries
        localStorage.setItem(NOTIFIED_DRAWS_KEY, JSON.stringify(notified.slice(-20)));
      }
    } catch (e) {
      console.error("[NotificationService] Loop check failed:", e);
    }
  }
}

export const notificationService = new NotificationService();
