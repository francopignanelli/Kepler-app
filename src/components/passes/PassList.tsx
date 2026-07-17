"use client";

import { useState } from "react";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { Spinner } from "@/components/ui/Spinner";
import { PassCard } from "@/components/passes/PassCard";
import type { EnrichedPass, PassesResponse } from "@/types";

interface PassListProps {
  data: PassesResponse | null;
  error: string | null;
  isLoading: boolean;
  hasLocation: boolean;
  onRetry: () => void;
  hasAlert: (passId: string) => boolean;
  onToggleAlert: (pass: EnrichedPass) => void;
  notificationsAllowed: boolean;
}

/** Listado textual/accesible de próximas pasadas con filtro de visibles. */
export function PassList({
  data,
  error,
  isLoading,
  hasLocation,
  onRetry,
  hasAlert,
  onToggleAlert,
  notificationsAllowed,
}: PassListProps) {
  const [onlyVisible, setOnlyVisible] = useState(true);

  if (!hasLocation) {
    return (
      <EmptyState
        title="Elegí una ubicación para calcular pasadas"
        detail="Usá tu ubicación o buscá una ciudad en el buscador de arriba."
      />
    );
  }
  if (isLoading) {
    return (
      <div className="panel p-4">
        <Spinner label="Calculando próximas pasadas…" />
      </div>
    );
  }
  if (error) {
    return <ErrorState message={error} onRetry={onRetry} />;
  }
  if (!data) return null;

  const passes = onlyVisible ? data.passes.filter((p) => p.pass.isVisible) : data.passes;

  return (
    <div className="flex flex-col gap-3">
      {/* qué se está listando: pasadas de la ISS sobre la ubicación elegida */}
      <div className="panel flex items-center gap-2 p-3">
        <span className="h-2 w-2 shrink-0 rounded-full bg-iss-400" aria-hidden="true" />
        <p className="text-sm text-star-100">
          Pasadas de la <span className="font-medium">ISS</span> sobre{" "}
          {data.location.name ?? "tu ubicación"}
        </p>
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-star-500">
          Fuente: {data.source === "n2yo" ? "N2YO" : "cálculo orbital propio (SGP4)"}
          {!data.weatherAvailable && " · sin datos de clima"}
        </p>
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-star-300">
          <input
            type="checkbox"
            checked={onlyVisible}
            onChange={(e) => setOnlyVisible(e.target.checked)}
            className="h-3.5 w-3.5 accent-[#4f7dff]"
          />
          Solo visibles
        </label>
      </div>

      {passes.length === 0 ? (
        <EmptyState
          title={
            onlyVisible
              ? "No hay pasadas visibles en los próximos días"
              : "No hay pasadas sobre el horizonte en los próximos días"
          }
          detail={
            onlyVisible
              ? "La geometría orbital cambia todo el tiempo: probá de nuevo mañana o desactivá el filtro para ver todas las pasadas."
              : "Probá con otra ubicación o volvé a consultar más tarde."
          }
        />
      ) : (
        <ul className="flex flex-col gap-3" aria-label="Próximas pasadas de la ISS">
          {passes.map((pass) => (
            <li key={pass.passId}>
              <PassCard
                pass={pass}
                tzId={data.location.timezone}
                hasAlert={hasAlert(pass.passId)}
                onToggleAlert={onToggleAlert}
                notificationsAllowed={notificationsAllowed}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
