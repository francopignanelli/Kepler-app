/**
 * Alertas de pasadas.
 *
 * MVP: alertas programadas en el cliente (localStorage + chequeo periódico).
 * Se disparan vía Notification API (a través del Service Worker si está
 * registrado) y siempre con fallback visual dentro de la app.
 *
 * Limitación documentada: sin backend de Web Push, las notificaciones solo
 * se disparan si hay una pestaña de Kepler abierta. La arquitectura deja
 * listo el punto de extensión (VAPID + suscripciones) para push real.
 */

import { notificationPreferencesSchema } from "@/schemas";
import { storageGet, storageSet, STORAGE_KEYS } from "@/services/storage";
import type { EnrichedPass, NotificationPreferences, ScheduledAlert } from "@/types";

export const DEFAULT_PREFERENCES: NotificationPreferences = {
  enabled: false,
  minutesBefore: 10,
  minimumSkyVisibility: 0,
  minimumElevation: 0,
  nightOnly: false,
};

function isSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export const notificationService = {
  isSupported,

  getPermission(): NotificationPermission | "unsupported" {
    if (!isSupported()) return "unsupported";
    return Notification.permission;
  },

  async requestPermission(): Promise<NotificationPermission | "unsupported"> {
    if (!isSupported()) return "unsupported";
    if (Notification.permission !== "default") return Notification.permission;
    return Notification.requestPermission();
  },

  getPreferences(): NotificationPreferences {
    const stored = storageGet<NotificationPreferences>(
      STORAGE_KEYS.notificationPreferences,
      DEFAULT_PREFERENCES,
    );
    const parsed = notificationPreferencesSchema.safeParse(stored);
    return parsed.success ? (parsed.data as NotificationPreferences) : DEFAULT_PREFERENCES;
  },

  savePreferences(prefs: NotificationPreferences): void {
    storageSet(STORAGE_KEYS.notificationPreferences, prefs);
  },

  getAlerts(): ScheduledAlert[] {
    return storageGet<ScheduledAlert[]>(STORAGE_KEYS.scheduledAlerts, []);
  },

  /** Evalúa si una pasada cumple los filtros configurados por el usuario. */
  passMatchesPreferences(pass: EnrichedPass, prefs: NotificationPreferences): boolean {
    if (pass.pass.maxElevation < prefs.minimumElevation) return false;
    if (prefs.minimumSkyVisibility > 0) {
      // sin datos de clima no se puede garantizar el umbral: no alertar
      if (pass.scores.skyVisibility === null) return false;
      if (pass.scores.skyVisibility < prefs.minimumSkyVisibility) return false;
    }
    if (prefs.nightOnly && pass.weather && pass.weather.isDay === 1) return false;
    return true;
  },

  /**
   * Programa una alerta para una pasada. Devuelve la alerta creada o null si
   * la pasada no cumple las preferencias (salvo `force`, para pedidos
   * explícitos del usuario desde una tarjeta) o ya está programada.
   */
  schedulePassAlert(
    pass: EnrichedPass,
    prefs: NotificationPreferences,
    tzId?: string,
    options?: { force?: boolean },
  ): ScheduledAlert | null {
    if (!options?.force && !notificationService.passMatchesPreferences(pass, prefs)) return null;

    const alerts = notificationService.getAlerts();
    if (alerts.some((a) => a.passId === pass.passId && !a.fired)) return null;

    const startAt = new Date(pass.pass.startTime).getTime();
    const triggerAt = startAt - prefs.minutesBefore * 60_000;
    if (triggerAt <= Date.now()) return null;

    const timeFmt = new Intl.DateTimeFormat("es-AR", {
      timeZone: tzId ?? undefined,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const sky =
      pass.scores.skyVisibility !== null ? ` · Cielo visible ${pass.scores.skyVisibility}%` : "";

    const alert: ScheduledAlert = {
      id: `alert-${pass.passId}`,
      passId: pass.passId,
      triggerAt,
      passStartAt: startAt,
      title: `ISS visible en ${prefs.minutesBefore} minutos`,
      body: `Empieza ${timeFmt.format(startAt)} · Altura máx ${pass.pass.maxElevation}° · ${pass.pass.startDirection} → ${pass.pass.endDirection}${sky}`,
      fired: false,
    };

    storageSet(STORAGE_KEYS.scheduledAlerts, [...alerts, alert]);
    return alert;
  },

  cancelAlert(alertId: string): ScheduledAlert[] {
    const remaining = notificationService.getAlerts().filter((a) => a.id !== alertId);
    storageSet(STORAGE_KEYS.scheduledAlerts, remaining);
    return remaining;
  },

  hasAlertForPass(passId: string): boolean {
    return notificationService.getAlerts().some((a) => a.passId === passId && !a.fired);
  },

  /**
   * Marca disparadas y retorna las alertas vencidas. Purga alertas de pasadas
   * ya pasadas hace más de un día.
   */
  collectDueAlerts(now = Date.now()): ScheduledAlert[] {
    const alerts = notificationService.getAlerts();
    const due = alerts.filter((a) => !a.fired && a.triggerAt <= now && a.passStartAt > now - 60_000);
    if (due.length === 0 && alerts.every((a) => a.passStartAt > now - 86_400_000)) {
      return [];
    }
    const updated = alerts
      .map((a) => (due.some((d) => d.id === a.id) ? { ...a, fired: true } : a))
      .filter((a) => a.passStartAt > now - 86_400_000);
    storageSet(STORAGE_KEYS.scheduledAlerts, updated);
    return due;
  },

  /** Muestra la notificación del sistema (vía SW si existe) — el fallback visual lo maneja la UI. */
  async showSystemNotification(title: string, body: string): Promise<boolean> {
    if (!isSupported() || Notification.permission !== "granted") return false;
    const options: NotificationOptions = {
      body,
      icon: "/icon.svg",
      badge: "/icon.svg",
      tag: `kepler-${title}`,
    };
    try {
      if ("serviceWorker" in navigator) {
        const registration = await navigator.serviceWorker.getRegistration();
        if (registration) {
          await registration.showNotification(title, options);
          return true;
        }
      }
      new Notification(title, options);
      return true;
    } catch {
      return false;
    }
  },

  /** Registra el service worker de notificaciones (idempotente). */
  async registerServiceWorker(): Promise<void> {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    try {
      await navigator.serviceWorker.register("/sw.js");
    } catch {
      // sin SW las notificaciones usan el constructor directo
    }
  },
};
