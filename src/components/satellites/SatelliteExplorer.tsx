"use client";

import { useMemo } from "react";
import { SAT_CATEGORIES, SAT_CATEGORY_IDS } from "@/lib/satellites";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";
import { formatCoords } from "@/lib/geo";
import type { SatellitesAboveState } from "@/hooks/useSatellitesAbove";
import type { AboveSatellite, SatCategoryId } from "@/types";

const MAX_LIST_ITEMS = 150;

interface SatelliteExplorerProps {
  filters: Record<SatCategoryId, boolean>;
  onToggleFilter: (category: SatCategoryId) => void;
  state: SatellitesAboveState;
  hasLocation: boolean;
  selected: AboveSatellite | null;
  onSelect: (sat: AboveSatellite | null) => void;
  onFocus: (sat: AboveSatellite) => void;
}

/** Ficha con la información completa del satélite seleccionado. */
function SatelliteCard({
  sat,
  onFocus,
  onClose,
}: {
  sat: AboveSatellite;
  onFocus: (sat: AboveSatellite) => void;
  onClose: () => void;
}) {
  const category = SAT_CATEGORIES[sat.category];
  return (
    <div className="panel border-l-2 p-4" style={{ borderLeftColor: category.color }}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-display text-sm font-semibold text-star-100">{sat.name}</p>
          <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-star-500">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: category.color }}
              aria-hidden="true"
            />
            {category.label}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border panel-line px-1.5 py-0.5 text-xs text-star-500 transition-colors hover:bg-space-700"
          aria-label="Cerrar ficha"
        >
          ✕
        </button>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div>
          <dt className="text-[11px] uppercase tracking-wider text-star-500">NORAD ID</dt>
          <dd className="telemetry text-star-100">{sat.noradId}</dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-wider text-star-500">Designador intl.</dt>
          <dd className="telemetry text-star-100">{sat.intlDesignator || "—"}</dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-wider text-star-500">Lanzamiento</dt>
          <dd className="telemetry text-star-100">{sat.launchDate || "—"}</dd>
        </div>
        <div>
          <dt className="text-[11px] uppercase tracking-wider text-star-500">Altitud</dt>
          <dd className="telemetry text-star-100">
            {Math.round(sat.altitudeKm).toLocaleString("es-AR")}
            <span className="ml-1 text-xs text-star-500">km</span>
          </dd>
        </div>
        <div className="col-span-2">
          <dt className="text-[11px] uppercase tracking-wider text-star-500">Posición actual</dt>
          <dd className="telemetry text-star-100">{formatCoords(sat.lat, sat.lon, 2)}</dd>
        </div>
      </dl>
      <button
        type="button"
        onClick={() => onFocus(sat)}
        className="mt-3 rounded-md border panel-line px-2.5 py-1 text-xs text-orbit-400 transition-colors hover:bg-space-700"
      >
        ⌖ Centrar en el globo
      </button>
    </div>
  );
}

/**
 * Explorador de satélites: filtros por grupo, total visible, lista y ficha.
 * Los filtros solo activan/desactivan capas: no recargan el mapa.
 */
export function SatelliteExplorer({
  filters,
  onToggleFilter,
  state,
  hasLocation,
  selected,
  onSelect,
  onFocus,
}: SatelliteExplorerProps) {
  const { byCategory, satellites, error, unavailable, isLoading } = state;
  const anyActive = SAT_CATEGORY_IDS.some((c) => filters[c]);

  const sorted = useMemo(
    () => [...satellites].sort((a, b) => a.name.localeCompare(b.name)),
    [satellites],
  );

  if (!hasLocation) {
    return (
      <EmptyState
        title="Elegí una ubicación para descubrir qué satélites tenés sobre tu cabeza"
        detail="Buscá tu ciudad o usá tu posición: el radar barre 90° alrededor de tu cielo."
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* filtros por grupo */}
      <div className="panel p-3">
        <p className="mb-2 text-[11px] uppercase tracking-widest text-star-500">
          Grupos de satélites
        </p>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtros de satélites">
          {SAT_CATEGORY_IDS.map((id) => {
            const cat = SAT_CATEGORIES[id];
            const active = filters[id];
            const count = byCategory[id]?.total;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={active}
                onClick={() => onToggleFilter(id)}
                className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                  active
                    ? "border-transparent bg-space-700 font-medium text-star-100"
                    : "panel-line text-star-500 hover:text-star-300"
                }`}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{
                    backgroundColor: active ? cat.color : "transparent",
                    boxShadow: active ? "none" : `inset 0 0 0 1.5px ${cat.color}`,
                  }}
                  aria-hidden="true"
                />
                {cat.label}
                {active && count !== undefined && (
                  <span className="telemetry rounded-full bg-space-950 px-1.5 text-[10px] text-star-300">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {unavailable && (
        <div className="panel p-4">
          <p className="text-sm text-alert-400">
            El explorador necesita una key de N2YO en el servidor (N2YO_API_KEY).
          </p>
        </div>
      )}

      {!anyActive && !unavailable && (
        <EmptyState
          title="Activá un grupo para escanear tu cielo"
          detail="Starlink, GPS, meteorológicos y más: cada grupo se dibuja sobre el globo con su color."
        />
      )}

      {anyActive && !unavailable && (
        <>
          {/* resumen */}
          <div className="panel flex items-center justify-between p-3">
            <p className="text-sm text-star-300">
              <span className="telemetry text-lg text-star-100">{satellites.length}</span> satélites
              sobre tu horizonte
            </p>
            {isLoading && <Spinner size={16} />}
          </div>

          {error && (
            <div className="panel p-3">
              <p className="text-xs text-alert-400">
                {error} — mostrando los últimos datos válidos.
              </p>
            </div>
          )}

          {/* ficha del seleccionado */}
          {selected && <SatelliteCard sat={selected} onFocus={onFocus} onClose={() => onSelect(null)} />}

          {/* lista */}
          {sorted.length > 0 && (
            <ul className="panel divide-y divide-space-700/60 overflow-hidden" aria-label="Satélites visibles">
              {sorted.slice(0, MAX_LIST_ITEMS).map((sat) => {
                const cat = SAT_CATEGORIES[sat.category];
                const isSelected = selected?.noradId === sat.noradId;
                return (
                  <li key={sat.noradId}>
                    <button
                      type="button"
                      onClick={() => onSelect(isSelected ? null : sat)}
                      aria-pressed={isSelected}
                      className={`flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-space-700/60 ${
                        isSelected ? "bg-space-700/80" : ""
                      }`}
                    >
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: cat.color }}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-star-100">{sat.name}</span>
                        <span className="telemetry block text-[11px] text-star-500">
                          NORAD {sat.noradId} · {cat.label}
                        </span>
                      </span>
                      <span className="telemetry shrink-0 text-xs text-star-300">
                        {Math.round(sat.altitudeKm).toLocaleString("es-AR")} km
                      </span>
                    </button>
                  </li>
                );
              })}
              {sorted.length > MAX_LIST_ITEMS && (
                <li className="px-3 py-2 text-center text-xs text-star-500">
                  y {sorted.length - MAX_LIST_ITEMS} más (todos visibles en el globo)
                </li>
              )}
            </ul>
          )}

          <p className="px-1 text-[10px] text-star-700">
            Datos: N2YO.com · actualización cada 2 minutos · radio de búsqueda 90°
          </p>
        </>
      )}
    </div>
  );
}
