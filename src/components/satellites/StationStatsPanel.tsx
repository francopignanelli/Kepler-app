"use client";

import { formatCoords } from "@/lib/geo";
import { Spinner } from "@/components/ui/Spinner";
import type { StationLive } from "@/hooks/useStations";

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[11px] uppercase tracking-wider text-star-500">{label}</dt>
      <dd className="telemetry text-sm text-star-100">
        {value}
        {unit && <span className="ml-1 text-xs text-star-500">{unit}</span>}
      </dd>
    </div>
  );
}

/** Telemetría en vivo de una estación: posición, altitud, az/el, iluminación. */
export function StationStatsPanel({ station }: { station: StationLive }) {
  const { info, position, error } = station;

  if (!position) {
    return (
      <div className="panel p-4">
        {error ? (
          <p className="text-sm text-danger-400">{error}</p>
        ) : (
          <Spinner label={`Recibiendo telemetría de ${info.shortName}…`} />
        )}
      </div>
    );
  }

  const sunlit = position.visibility === "daylight";
  const updatedAt = new Date(position.timestamp).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <section className="panel p-4" aria-label={`Telemetría de ${info.shortName}`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-sm font-semibold uppercase tracking-widest text-star-100">
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: info.color }}
            aria-hidden="true"
          />
          {info.name}
        </h2>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] ${
            sunlit ? "border-alert-400/40 text-alert-400" : "border-orbit-400/40 text-orbit-400"
          }`}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
          {sunlit ? "Iluminada por el Sol" : "En sombra terrestre"}
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        <Stat label="NORAD ID" value={String(position.noradId)} />
        <Stat label="Coordenadas" value={formatCoords(position.lat, position.lon, 2)} />
        <Stat label="Altitud" value={position.altitudeKm.toFixed(1)} unit="km" />
        <Stat
          label="Velocidad"
          value={Math.round(position.velocityKmh).toLocaleString("es-AR")}
          unit="km/h"
        />
        {position.azimuthDeg !== undefined && position.elevationDeg !== undefined && (
          <>
            <Stat label="Azimut" value={position.azimuthDeg.toFixed(1)} unit="°" />
            <Stat
              label="Elevación"
              value={position.elevationDeg.toFixed(1)}
              unit={position.elevationDeg > 0 ? "° (sobre el horizonte)" : "°"}
            />
          </>
        )}
        <Stat
          label="Fuente"
          value={position.source === "wheretheiss" ? "WhereTheISS.at" : "SGP4 local"}
        />
        <Stat label="Actualizado" value={updatedAt} />
      </dl>

      {error && (
        <p className="mt-3 text-xs text-alert-400">
          Reintentando conexión: mostrando el último dato recibido.
        </p>
      )}
    </section>
  );
}
