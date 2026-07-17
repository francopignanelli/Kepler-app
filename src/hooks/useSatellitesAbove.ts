"use client";

import { useEffect, useMemo, useState } from "react";
import { SAT_CATEGORY_IDS } from "@/lib/satellites";
import { ApiClientError } from "@/services/apiClient";
import { satellitesService } from "@/services/satellitesService";
import type { AboveSatellite, GeoPoint, SatCategoryId, SatellitesAbove } from "@/types";

/**
 * Poll moderado: N2YO limita /above a 100 req/h por key. Con cache de 30 s
 * en el servidor y refresh de 2 min por categoría activa, varias categorías
 * simultáneas siguen dentro del presupuesto.
 */
const POLL_MS = 120_000;

/** Los grupos específicos pisan a "all" al deduplicar. */
const CATEGORY_PRIORITY: SatCategoryId[] = SAT_CATEGORY_IDS.filter((c) => c !== "all");

export interface SatellitesAboveState {
  /** respuestas por categoría (queda la última válida aunque se desactive) */
  byCategory: Partial<Record<SatCategoryId, SatellitesAbove>>;
  /** satélites de las categorías activas, dedupe por NORAD ID */
  satellites: AboveSatellite[];
  error: string | null;
  /** true si el servidor no tiene N2YO_API_KEY configurada */
  unavailable: boolean;
  isLoading: boolean;
}

export function useSatellitesAbove(
  observer: GeoPoint | null,
  activeCategories: SatCategoryId[],
): SatellitesAboveState {
  const [byCategory, setByCategory] = useState<Partial<Record<SatCategoryId, SatellitesAbove>>>({});
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const activeKey = [...activeCategories].sort().join(",");
  const lat = observer?.lat;
  const lon = observer?.lon;

  useEffect(() => {
    const cats = activeKey ? (activeKey.split(",") as SatCategoryId[]) : [];
    if (lat === undefined || lon === undefined || cats.length === 0) return;
    let cancelled = false;

    const load = async () => {
      setIsLoading(true);
      const results = await Promise.allSettled(
        cats.map((cat) => satellitesService.getAbove({ lat, lon }, cat)),
      );
      if (cancelled) return;

      let lastError: string | null = null;
      let missingKey = false;
      const updates: Partial<Record<SatCategoryId, SatellitesAbove>> = {};
      results.forEach((res, i) => {
        if (res.status === "fulfilled") {
          updates[cats[i]] = res.value;
        } else {
          const err = res.reason;
          if (err instanceof ApiClientError && err.code === "MISSING_API_KEY") missingKey = true;
          lastError = err instanceof Error ? err.message : "Error al consultar satélites";
        }
      });
      setByCategory((prev) => ({ ...prev, ...updates }));
      setUnavailable(missingKey);
      setError(lastError);
      setIsLoading(false);
    };

    load();
    const interval = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [lat, lon, activeKey]);

  const satellites = useMemo(() => {
    const cats = activeKey ? (activeKey.split(",") as SatCategoryId[]) : [];
    const seen = new Map<number, AboveSatellite>();
    // primero las categorías específicas: si un satélite aparece también en
    // "all", conserva su categoría con color propio
    const ordered = [...CATEGORY_PRIORITY.filter((c) => cats.includes(c))];
    if (cats.includes("all")) ordered.push("all");
    for (const cat of ordered) {
      for (const sat of byCategory[cat]?.satellites ?? []) {
        if (!seen.has(sat.noradId)) seen.set(sat.noradId, sat);
      }
    }
    return [...seen.values()];
  }, [byCategory, activeKey]);

  return { byCategory, satellites, error, unavailable, isLoading };
}
