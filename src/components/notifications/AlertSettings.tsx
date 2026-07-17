"use client";

import { useEffect, useState } from "react";
import { notificationService } from "@/services/notificationService";
import { formatDateTime } from "@/lib/time";
import type { NotificationPreferences, ScheduledAlert } from "@/types";

interface AlertSettingsProps {
  preferences: NotificationPreferences;
  onPreferencesChange: (prefs: NotificationPreferences) => void;
  alerts: ScheduledAlert[];
  onCancelAlert: (alertId: string) => void;
  tzId?: string;
}

/** Configuración de alertas de pasadas + listado de alertas programadas. */
export function AlertSettings({
  preferences,
  onPreferencesChange,
  alerts,
  onCancelAlert,
  tzId,
}: AlertSettingsProps) {
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");

  useEffect(() => {
    setPermission(notificationService.getPermission());
  }, []);

  const requestPermission = async () => {
    const result = await notificationService.requestPermission();
    setPermission(result);
  };

  const pending = alerts.filter((a) => !a.fired);

  return (
    <div className="flex flex-col gap-3">
      <section className="panel p-4" aria-label="Preferencias de alertas">
        <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-widest text-star-100">
          Alertas de pasadas
        </h2>

        {permission === "unsupported" && (
          <p className="mb-3 text-xs text-alert-400">
            Tu navegador no soporta notificaciones: las alertas se mostrarán dentro de la app.
          </p>
        )}
        {permission === "default" && (
          <button
            type="button"
            onClick={requestPermission}
            className="mb-3 w-full rounded-md border border-orbit-400/40 px-3 py-1.5 text-sm text-orbit-400 transition-colors hover:bg-space-700"
          >
            Permitir notificaciones del sistema
          </button>
        )}
        {permission === "denied" && (
          <p className="mb-3 text-xs text-star-500">
            Notificaciones bloqueadas en el navegador: las alertas se mostrarán dentro de la app
            mientras esté abierta.
          </p>
        )}

        <div className="flex flex-col gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-star-100">
            <input
              type="checkbox"
              checked={preferences.enabled}
              onChange={(e) => onPreferencesChange({ ...preferences, enabled: e.target.checked })}
              className="h-3.5 w-3.5 accent-[#4f7dff]"
            />
            Alertar automáticamente las pasadas visibles que cumplan estos filtros
          </label>

          <label className="flex items-center justify-between gap-2 text-sm text-star-300">
            Avisarme antes de cada pasada
            <select
              value={preferences.minutesBefore}
              onChange={(e) =>
                onPreferencesChange({
                  ...preferences,
                  minutesBefore: Number(e.target.value) as 5 | 10 | 15,
                })
              }
              className="rounded-md border panel-line bg-space-900 px-2 py-1 text-sm text-star-100"
            >
              <option value={5}>5 minutos</option>
              <option value={10}>10 minutos</option>
              <option value={15}>15 minutos</option>
            </select>
          </label>

          <label className="flex items-center justify-between gap-2 text-sm text-star-300">
            Cielo visible mínimo
            <select
              value={preferences.minimumSkyVisibility}
              onChange={(e) =>
                onPreferencesChange({
                  ...preferences,
                  minimumSkyVisibility: Number(e.target.value),
                })
              }
              className="rounded-md border panel-line bg-space-900 px-2 py-1 text-sm text-star-100"
            >
              <option value={0}>Sin mínimo</option>
              <option value={50}>50%</option>
              <option value={70}>70%</option>
              <option value={85}>85%</option>
            </select>
          </label>

          <label className="flex items-center justify-between gap-2 text-sm text-star-300">
            Altura máxima mínima
            <select
              value={preferences.minimumElevation}
              onChange={(e) =>
                onPreferencesChange({
                  ...preferences,
                  minimumElevation: Number(e.target.value),
                })
              }
              className="rounded-md border panel-line bg-space-900 px-2 py-1 text-sm text-star-100"
            >
              <option value={0}>Sin mínimo</option>
              <option value={30}>30°</option>
              <option value={45}>45°</option>
              <option value={60}>60°</option>
            </select>
          </label>

          <label className="flex cursor-pointer items-center gap-2 text-sm text-star-300">
            <input
              type="checkbox"
              checked={preferences.nightOnly}
              onChange={(e) =>
                onPreferencesChange({ ...preferences, nightOnly: e.target.checked })
              }
              className="h-3.5 w-3.5 accent-[#4f7dff]"
            />
            Solo pasadas nocturnas
          </label>
        </div>

        <p className="mt-3 text-[11px] leading-relaxed text-star-500">
          Las alertas se guardan en tu dispositivo y se disparan mientras Kepler esté abierto en
          alguna pestaña. Ejemplo: “Avisame 10 minutos antes si el cielo visible supera 70%”.
        </p>
      </section>

      <section className="panel p-4" aria-label="Alertas programadas">
        <h3 className="mb-2 text-xs font-medium uppercase tracking-widest text-star-500">
          Programadas ({pending.length})
        </h3>
        {pending.length === 0 ? (
          <p className="text-sm text-star-500">
            No hay alertas programadas. Creá una desde cualquier tarjeta de pasada.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {pending.map((alert) => (
              <li
                key={alert.id}
                className="flex items-center justify-between gap-2 rounded-md border panel-line px-3 py-2"
              >
                <div>
                  <p className="text-sm text-star-100">{formatDateTime(alert.passStartAt, tzId)}</p>
                  <p className="text-[11px] text-star-500">
                    Aviso {formatDateTime(alert.triggerAt, tzId)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onCancelAlert(alert.id)}
                  className="rounded-md border panel-line px-2 py-1 text-xs text-danger-400 transition-colors hover:bg-space-700"
                >
                  Cancelar
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
