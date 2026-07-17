"use client";

import { useEffect, useRef, useState } from "react";
import { locationService } from "@/services/locationService";
import type { CitySearchResult } from "@/types";

interface LocationSearchProps {
  onSelect: (city: CitySearchResult) => void;
  onUseMyLocation: () => void;
  isLocating: boolean;
  /** ubicación actual para priorizar resultados cercanos (ej: barrios) */
  near?: { lat: number; lon: number } | null;
}

const DEBOUNCE_MS = 350;

/** Buscador de ciudades con autocomplete (debounced) + botón de geolocalización. */
export function LocationSearch({ onSelect, onUseMyLocation, isLocating, near }: LocationSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CitySearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    if (value.trim().length < 2) {
      setResults([]);
      setSearchError(null);
      setOpen(false);
    }
  };

  // búsqueda con debounce
  useEffect(() => {
    if (query.trim().length < 2) return;
    const timeout = setTimeout(async () => {
      try {
        const found = await locationService.searchCity(query.trim(), near ?? undefined);
        setResults(found);
        setSearchError(found.length === 0 ? "Sin resultados para esa búsqueda" : null);
        setOpen(true);
      } catch {
        setResults([]);
        setSearchError("No se pudo buscar la ciudad. Probá de nuevo.");
        setOpen(true);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [query, near]);

  // cerrar al clickear afuera
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  return (
    <div ref={containerRef} className="relative flex items-center gap-2">
      <div className="relative">
        <label htmlFor="city-search" className="sr-only">
          Buscar ciudad
        </label>
        <input
          id="city-search"
          type="search"
          value={query}
          placeholder="Buscar ciudad…"
          autoComplete="off"
          onChange={(e) => handleQueryChange(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          className="w-44 rounded-md border panel-line bg-space-900/80 px-3 py-1.5 text-sm text-star-100 placeholder:text-star-700 sm:w-56"
          role="combobox"
          aria-expanded={open}
          aria-controls="city-search-results"
        />
        {open && (results.length > 0 || searchError) && (
          <ul
            id="city-search-results"
            role="listbox"
            className="panel absolute right-0 top-full z-30 mt-1 max-h-72 w-72 overflow-y-auto p-1"
          >
            {searchError && <li className="px-3 py-2 text-xs text-star-500">{searchError}</li>}
            {results.map((city) => (
              <li key={city.id} role="option" aria-selected="false">
                <button
                  type="button"
                  onClick={() => {
                    onSelect(city);
                    setQuery("");
                    setResults([]);
                    setOpen(false);
                  }}
                  className="w-full rounded px-3 py-2 text-left text-sm text-star-100 transition-colors hover:bg-space-700"
                >
                  {city.name}
                  <span className="ml-1 text-xs text-star-500">
                    {[city.region, city.country].filter(Boolean).join(", ")}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button
        type="button"
        onClick={onUseMyLocation}
        disabled={isLocating}
        title="Usar mi ubicación (requiere permiso del navegador)"
        className="inline-flex items-center gap-1.5 rounded-md border panel-line bg-space-900/80 px-3 py-1.5 text-sm text-star-100 transition-colors hover:bg-space-700 disabled:opacity-50"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
          <path
            d="M12 2v3m0 14v3M2 12h3m14 0h3"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.4" strokeOpacity="0.5" />
        </svg>
        <span className="hidden sm:inline">{isLocating ? "Ubicando…" : "Mi ubicación"}</span>
      </button>
    </div>
  );
}
