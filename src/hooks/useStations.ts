"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { STATION_IDS, STATIONS } from "@/lib/satellites";
import { issService } from "@/services/issService";
import type { GeoPoint, GroundTrack, SatellitePosition, StationId, StationInfo } from "@/types";

const POSITION_POLL_MS = 5_000;
const TRACK_REFRESH_MS = 5 * 60_000;

export interface StationLive {
  info: StationInfo;
  position: SatellitePosition | null;
  track: GroundTrack | null;
  error: string | null;
}

interface StationData {
  position: SatellitePosition | null;
  track: GroundTrack | null;
  error: string | null;
}

const EMPTY: StationData = { position: null, track: null, error: null };

/**
 * Posiciones y trayectorias de las estaciones habilitadas, con polling
 * (pausado cuando la pestaña está en background). Si hay observador,
 * las posiciones incluyen azimut/elevación calculados por el servidor.
 */
export function useStations(
  enabled: Record<StationId, boolean>,
  observer: GeoPoint | null,
): { stations: StationLive[] } {
  const [data, setData] = useState<Record<StationId, StationData>>({
    iss: EMPTY,
    tiangong: EMPTY,
  });

  const enabledIds = STATION_IDS.filter((id) => enabled[id]);
  const enabledKey = enabledIds.join(",");
  // el observador solo afecta az/el: no reiniciar el polling por cambios chicos
  const observerRef = useRef(observer);
  useEffect(() => {
    observerRef.current = observer;
  }, [observer]);

  // -- posiciones (poll cada 5 s) --------------------------------------------
  useEffect(() => {
    const ids = enabledKey ? (enabledKey.split(",") as StationId[]) : [];
    if (ids.length === 0) return;
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const tick = () => {
      for (const id of ids) {
        issService
          .getStationPosition(id, observerRef.current)
          .then((pos) => {
            if (cancelled) return;
            setData((prev) => ({ ...prev, [id]: { ...prev[id], position: pos, error: null } }));
          })
          .catch((err) => {
            if (cancelled) return;
            const message = err instanceof Error ? err.message : "Error al obtener la posición";
            setData((prev) => ({ ...prev, [id]: { ...prev[id], error: message } }));
          });
      }
    };

    const start = () => {
      if (timer) return;
      tick();
      timer = setInterval(tick, POSITION_POLL_MS);
    };
    const stop = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };
    const onVisibility = () => {
      if (document.hidden) stop();
      else start();
    };

    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabledKey]);

  // -- trayectorias (refresh cada 5 min) --------------------------------------
  useEffect(() => {
    const ids = enabledKey ? (enabledKey.split(",") as StationId[]) : [];
    if (ids.length === 0) return;
    let cancelled = false;

    const load = () => {
      for (const id of ids) {
        issService
          .getStationTrack(id, 90, 90, 30)
          .then((track) => {
            if (cancelled) return;
            setData((prev) => ({ ...prev, [id]: { ...prev[id], track } }));
          })
          .catch(() => {
            // la trayectoria es decorativa: el error de posición ya se reporta
          });
      }
    };

    load();
    const interval = setInterval(load, TRACK_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [enabledKey]);

  const stations = useMemo<StationLive[]>(
    () =>
      (enabledKey ? (enabledKey.split(",") as StationId[]) : []).map((id) => ({
        info: STATIONS[id],
        ...data[id],
      })),
    [enabledKey, data],
  );

  return { stations };
}
