"use client";

import { useEffect, useRef, useState } from "react";
import { LocationSearch } from "@/components/location/LocationSearch";
import type { CitySearchResult, UserLocation } from "@/types";

interface LocationMenuProps {
  location: UserLocation | null;
  onSelect: (city: CitySearchResult) => void;
  onUseMyLocation: () => void;
  isLocating: boolean;
}

/**
 * Botón "Ubicación" del header: al presionarlo despliega las dos formas de
 * ubicarse — dar permiso de geolocalización al navegador, o escribir la
 * ciudad a mano en el buscador.
 */
export function LocationMenu({ location, onSelect, onUseMyLocation, isLocating }: LocationMenuProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // cerrar al clickear afuera o con Escape
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="inline-flex max-w-[55vw] items-center gap-1.5 rounded-md border panel-line bg-space-900/80 px-3 py-1.5 text-sm text-star-100 transition-colors hover:bg-space-700 sm:max-w-xs"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0 text-orbit-400">
          <path
            d="M12 21s7-5.1 7-11a7 7 0 1 0-14 0c0 5.9 7 11 7 11Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <circle cx="12" cy="10" r="2.6" stroke="currentColor" strokeWidth="1.8" />
        </svg>
        <span className="truncate">{location ? location.name : "Ubicación"}</span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          className={`shrink-0 text-star-500 transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="m5 9 7 7 7-7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Elegir ubicación"
          className="panel absolute right-0 top-full z-40 mt-1.5 w-80 max-w-[calc(100vw-1.5rem)] p-3"
        >
          <p className="mb-2 text-[11px] uppercase tracking-widest text-star-500">Tu ubicación</p>

          <button
            type="button"
            onClick={onUseMyLocation}
            disabled={isLocating}
            className="flex w-full items-center gap-2 rounded-md border panel-line px-3 py-2 text-left text-sm text-star-100 transition-colors hover:bg-space-700 disabled:opacity-50"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0 text-orbit-400">
              <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
              <path d="M12 2v3m0 14v3M2 12h3m14 0h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.4" strokeOpacity="0.5" />
            </svg>
            <span>
              {isLocating ? "Ubicando…" : "Usar mi ubicación"}
              <span className="block text-[11px] text-star-500">
                Pide permiso de ubicación al navegador
              </span>
            </span>
          </button>

          <div className="my-3 flex items-center gap-2" aria-hidden="true">
            <span className="h-px flex-1 bg-space-700" />
            <span className="text-[10px] uppercase tracking-widest text-star-700">o a mano</span>
            <span className="h-px flex-1 bg-space-700" />
          </div>

          <LocationSearch
            onSelect={(city) => {
              onSelect(city);
              setOpen(false);
            }}
            onUseMyLocation={onUseMyLocation}
            isLocating={isLocating}
            near={location}
            hideLocateButton
            fullWidth
          />
        </div>
      )}
    </div>
  );
}
