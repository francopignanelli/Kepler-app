"use client";

import { STATION_IDS, STATIONS } from "@/lib/satellites";
import type { StationId } from "@/types";

interface StationSelectorProps {
  enabled: Record<StationId, boolean>;
  onToggle: (id: StationId) => void;
}

/** Chips para elegir qué estaciones espaciales se trackean (una, otra o ambas). */
export function StationSelector({ enabled, onToggle }: StationSelectorProps) {
  return (
    <div className="panel flex items-center gap-2 p-2" role="group" aria-label="Estaciones a trackear">
      <span className="pl-1 text-[11px] uppercase tracking-widest text-star-500">Estaciones</span>
      <div className="flex flex-1 flex-wrap gap-1.5">
        {STATION_IDS.map((id) => {
          const station = STATIONS[id];
          const active = enabled[id];
          return (
            <button
              key={id}
              type="button"
              aria-pressed={active}
              onClick={() => onToggle(id)}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                active
                  ? "border-transparent bg-space-700 font-medium text-star-100"
                  : "panel-line text-star-500 hover:text-star-300"
              }`}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: active ? station.color : "transparent", boxShadow: active ? "none" : `inset 0 0 0 1.5px ${station.color}` }}
                aria-hidden="true"
              />
              {station.shortName}
            </button>
          );
        })}
      </div>
    </div>
  );
}
