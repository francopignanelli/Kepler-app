"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { formatTime } from "@/lib/time";
import { DEFAULT_PREFERENCES, notificationService } from "@/services/notificationService";
import type { EnrichedPass, NotificationPreferences, PassesResponse, ScheduledAlert } from "@/types";

const CHECK_INTERVAL_MS = 15_000;

/**
 * Estado y ciclo de vida de las alertas de pasadas:
 * hidrata desde localStorage, programa/cancela, dispara las vencidas
 * (notificación del sistema + toast en la app) y auto-programa pasadas
 * que cumplan los filtros si las alertas automáticas están activadas.
 */
export function useAlerts(passesData: PassesResponse | null) {
  const { pushToast } = useToast();
  const [alerts, setAlerts] = useState<ScheduledAlert[]>([]);
  const [preferences, setPreferences] = useState<NotificationPreferences>(DEFAULT_PREFERENCES);
  const [hydrated, setHydrated] = useState(false);

  // hidratación inicial + registro del service worker
  useEffect(() => {
    setAlerts(notificationService.getAlerts());
    setPreferences(notificationService.getPreferences());
    setHydrated(true);
    notificationService.registerServiceWorker();
  }, []);

  // ticker: dispara alertas vencidas
  useEffect(() => {
    const tick = () => {
      const due = notificationService.collectDueAlerts();
      for (const alert of due) {
        notificationService.showSystemNotification(alert.title, alert.body);
        pushToast({ title: alert.title, body: alert.body, tone: "alert" });
      }
      if (due.length > 0) setAlerts(notificationService.getAlerts());
    };
    tick();
    const interval = setInterval(tick, CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [pushToast]);

  // alertas automáticas para pasadas visibles que cumplan los filtros
  useEffect(() => {
    if (!hydrated || !preferences.enabled || !passesData) return;
    let scheduled = 0;
    for (const pass of passesData.passes) {
      if (!pass.pass.isVisible) continue;
      const created = notificationService.schedulePassAlert(
        pass,
        preferences,
        passesData.location.timezone,
      );
      if (created) scheduled += 1;
    }
    if (scheduled > 0) {
      setAlerts(notificationService.getAlerts());
      pushToast({
        title: `${scheduled} alerta${scheduled > 1 ? "s" : ""} programada${scheduled > 1 ? "s" : ""} automáticamente`,
        body: "Según tus filtros de visibilidad y altura.",
        tone: "success",
      });
    }
  }, [hydrated, preferences, passesData, pushToast]);

  const updatePreferences = useCallback((prefs: NotificationPreferences) => {
    setPreferences(prefs);
    notificationService.savePreferences(prefs);
  }, []);

  const toggleAlert = useCallback(
    async (pass: EnrichedPass) => {
      const tzId = passesData?.location.timezone;
      if (notificationService.hasAlertForPass(pass.passId)) {
        const existing = notificationService
          .getAlerts()
          .find((a) => a.passId === pass.passId && !a.fired);
        if (existing) {
          setAlerts(notificationService.cancelAlert(existing.id));
          pushToast({ title: "Alerta cancelada", tone: "info" });
        }
        return;
      }

      // pedir permiso en el momento del gesto explícito del usuario
      await notificationService.requestPermission();

      const created = notificationService.schedulePassAlert(pass, preferences, tzId, {
        force: true,
      });
      if (created) {
        setAlerts(notificationService.getAlerts());
        pushToast({
          title: "Alerta programada",
          body: `Te avisamos ${preferences.minutesBefore} min antes de la pasada de las ${formatTime(pass.pass.startTime, tzId)}.`,
          tone: "success",
        });
      } else {
        pushToast({
          title: "No se pudo programar la alerta",
          body: "La pasada ya empezó o está demasiado próxima.",
          tone: "info",
        });
      }
    },
    [passesData, preferences, pushToast],
  );

  const cancelAlert = useCallback(
    (alertId: string) => {
      setAlerts(notificationService.cancelAlert(alertId));
      pushToast({ title: "Alerta cancelada", tone: "info" });
    },
    [pushToast],
  );

  const hasAlert = useCallback(
    (passId: string) => alerts.some((a) => a.passId === passId && !a.fired),
    [alerts],
  );

  return { alerts, preferences, updatePreferences, toggleAlert, cancelAlert, hasAlert };
}
