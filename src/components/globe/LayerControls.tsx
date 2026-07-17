"use client";

import type { LayerVisibility } from "@/components/globe/GlobeView";
import { STATION_IDS, STATIONS } from "@/lib/satellites";
import type { StationId } from "@/types";

interface LayerControlsProps {
  layers: LayerVisibility;
  onChange: (layers: LayerVisibility) => void;
  /** estaciones habilitadas: un tilde por cada una */
  stations: Record<StationId, boolean>;
  onToggleStation: (id: StationId) => void;
  onFocusStation: (id: StationId) => void;
  onFocusUser: (() => void) | null;
}

const LAYER_LABELS: Array<{ key: keyof LayerVisibility; label: string }> = [
  { key: "track", label: "Trayectorias" },
  { key: "userLocation", label: "Mi ubicación" },
  { key: "satellites", label: "Satélites del explorador" },
];

/** Panel flotante para alternar estaciones y capas, y centrar la cámara. */
export function LayerControls({
  layers,
  onChange,
  stations,
  onToggleStation,
  onFocusStation,
  onFocusUser,
}: LayerControlsProps) {
  return (
    <div className="panel flex flex-col gap-2 p-3 text-sm">
      <p className="text-[11px] font-medium uppercase tracking-widest text-star-500">Capas</p>

      {/* una casilla por estación espacial */}
      {STATION_IDS.map((id) => {
        const station = STATIONS[id];
        return (
          <label key={id} className="flex cursor-pointer items-center gap-2 text-star-300">
            <input
              type="checkbox"
              checked={stations[id]}
              onChange={() => onToggleStation(id)}
              className="h-3.5 w-3.5"
              style={{ accentColor: station.color }}
            />
            <span className="flex items-center gap-1.5">
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: station.color }}
                aria-hidden="true"
              />
              {station.shortName}
            </span>
          </label>
        );
      })}

      <div className="border-t panel-line" aria-hidden="true" />

      {LAYER_LABELS.map(({ key, label }) => (
        <label key={key} className="flex cursor-pointer items-center gap-2 text-star-300">
          <input
            type="checkbox"
            checked={layers[key]}
            onChange={(e) => onChange({ ...layers, [key]: e.target.checked })}
            className="h-3.5 w-3.5 accent-[#4f7dff]"
          />
          {label}
        </label>
      ))}

      <div className="mt-1 flex flex-col gap-1.5 border-t panel-line pt-2">
        {STATION_IDS.filter((id) => stations[id]).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => onFocusStation(id)}
            className="rounded-md border panel-line px-2 py-1 text-left text-xs transition-colors hover:bg-space-700"
            style={{ color: STATIONS[id].color }}
          >
            ⌖ Centrar {STATIONS[id].shortName}
          </button>
        ))}
        {onFocusUser && (
          <button
            type="button"
            onClick={onFocusUser}
            className="rounded-md border panel-line px-2 py-1 text-left text-xs text-orbit-400 transition-colors hover:bg-space-700"
          >
            ⌖ Centrar en mi ubicación
          </button>
        )}
      </div>
    </div>
  );
}
