"use client";

import { compassLongName } from "@/lib/geo";
import { formatCountdown, formatDuration, formatRelativeDay, formatTime } from "@/lib/time";
import { ScoreDial } from "@/components/ui/ScoreDial";
import type { EnrichedPass } from "@/types";

const MOON_PHASES_ES: Record<string, string> = {
  "New Moon": "Luna nueva",
  "Waxing Crescent": "Creciente",
  "First Quarter": "Cuarto creciente",
  "Waxing Gibbous": "Gibosa creciente",
  "Full Moon": "Luna llena",
  "Waning Gibbous": "Gibosa menguante",
  "Last Quarter": "Cuarto menguante",
  "Waning Crescent": "Menguante",
};

interface PassCardProps {
  pass: EnrichedPass;
  tzId: string;
  hasAlert: boolean;
  onToggleAlert: (pass: EnrichedPass) => void;
  notificationsAllowed: boolean;
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wider text-star-500">{label}</span>
      <span className="telemetry text-[13px] text-star-100">{value}</span>
    </div>
  );
}

/** Tarjeta de una pasada de la ISS con clima, astronomía y recomendación. */
export function PassCard({ pass, tzId, hasAlert, onToggleAlert, notificationsAllowed }: PassCardProps) {
  const { pass: p, weather, astronomy, scores, recommendation } = pass;

  return (
    <article
      className={`panel p-4 ${p.isVisible ? "" : "opacity-75"}`}
      data-testid="pass-card"
      aria-label={`Pasada de la ISS ${formatRelativeDay(p.startTime, tzId)} a las ${formatTime(p.startTime, tzId)}`}
    >
      {/* encabezado: día + horario + visible/no visible */}
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-star-500">
            <span className="rounded-sm bg-iss-400/15 px-1 py-px font-medium text-iss-400">
              ISS
            </span>
            {formatRelativeDay(p.startTime, tzId)} · {formatCountdown(p.startTime)}
          </p>
          <p className="font-display text-lg font-semibold text-star-100">
            {formatTime(p.startTime, tzId)} – {formatTime(p.endTime, tzId)}
          </p>
          <p className="text-xs text-star-500">
            Máxima altura {formatTime(p.peakTime, tzId)} · {formatDuration(p.durationMinutes * 60)}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${
            p.isVisible
              ? "border-ok-400/50 text-ok-400"
              : "border-star-700 text-star-500"
          }`}
        >
          {p.isVisible ? "Visible" : "No visible"}
        </span>
      </div>

      {/* geometría + scores */}
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="grid flex-1 grid-cols-2 gap-x-3 gap-y-2">
          <Detail label="Altura máx." value={`${p.maxElevation}°`} />
          <Detail
            label="Dirección"
            value={`${compassLongName(p.startDirection)} → ${compassLongName(p.endDirection)}`}
          />
          {p.magnitude !== null && <Detail label="Magnitud est." value={p.magnitude.toFixed(1)} />}
          {weather && <Detail label="Condición" value={weather.condition} />}
        </div>
        <div className="flex shrink-0 gap-2">
          {scores.skyVisibility !== null && (
            <ScoreDial value={scores.skyVisibility} label="Cielo" size={56} />
          )}
          <ScoreDial value={scores.issObservation} label="Observación" size={56} />
        </div>
      </div>

      {/* clima + astronomía */}
      {weather && astronomy ? (
        <div className="mb-3 grid grid-cols-3 gap-x-3 gap-y-2 border-t panel-line pt-3 sm:grid-cols-4">
          <Detail label="Nubosidad" value={`${weather.cloud}%`} />
          <Detail label="Visibilidad" value={`${weather.visibilityKm} km`} />
          <Detail label="Lluvia" value={`${weather.precipMm} mm · ${weather.chanceOfRain}%`} />
          {astronomy.moonPhase ? (
            <Detail
              label="Luna"
              value={`${MOON_PHASES_ES[astronomy.moonPhase] ?? astronomy.moonPhase} · ${astronomy.moonIllumination}%`}
            />
          ) : (
            <Detail label="Sol" value={`${astronomy.sunrise} – ${astronomy.sunset}`} />
          )}
        </div>
      ) : (
        <p className="mb-3 border-t panel-line pt-3 text-xs text-star-500">
          Sin datos de clima para esta pasada (fuera del rango de pronóstico o WEATHER_API_KEY no
          configurada).
        </p>
      )}

      {/* recomendación + calidad */}
      <p className="mb-3 text-sm text-star-300">
        <span
          className={`mr-2 rounded px-1.5 py-0.5 text-[11px] font-medium ${
            scores.issObservation >= 70
              ? "bg-ok-400/15 text-ok-400"
              : scores.issObservation >= 40
                ? "bg-alert-400/15 text-alert-400"
                : "bg-danger-400/15 text-danger-400"
          }`}
        >
          {scores.label}
        </span>
        {recommendation}
      </p>

      {/* acción de alerta */}
      <button
        type="button"
        onClick={() => onToggleAlert(pass)}
        disabled={!p.isVisible}
        className={`w-full rounded-md border px-3 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
          hasAlert
            ? "border-ok-400/50 text-ok-400 hover:bg-space-700"
            : "panel-line text-star-100 hover:bg-space-700"
        }`}
      >
        {hasAlert ? "✓ Alerta programada — tocá para cancelar" : "Crear alerta para esta pasada"}
      </button>
      {!notificationsAllowed && (
        <p className="mt-1.5 text-[11px] text-star-500">
          Sin permiso de notificaciones, la alerta se mostrará dentro de la app.
        </p>
      )}
    </article>
  );
}
