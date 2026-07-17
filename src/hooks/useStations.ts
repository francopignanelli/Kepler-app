"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { STATION_IDS, STATIONS } from "@/lib/satellites";
import { issService } from "@/services/issService";
import type { GeoPoint, GroundTrack, SatellitePosition, StationId, StationInfo } from "@/types";

const POSITION_POLL_MS = 5_000;
const TRACK_REFRESH_MS = 5 * 60_000;
/** ante un track fallido o vacío, reintentar en 20 s en vez de esperar 5 min */
const TRACK_RETRY_MS = 20_000;

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
            setData((prev) => {
              // guardia anti-desorden: bajo latencia variable (p. ej. la
              // fuente en vivo lenta en prod) una respuesta vieja puede llegar
              // después de una nueva; si su timestamp es anterior al ya
              // aplicado, se descarta para que el marcador no salte hacia atrás.
              const current = prev[id].position;
              if (current && pos.timestamp < current.timestamp) return prev;
              return { ...prev, [id]: { ...prev[id], position: pos, error: null } };
            });
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

  // -- trayectorias (refresh cada 5 min, con reintento rápido ante fallo) ------
  useEffect(() => {
    const ids = enabledKey ? (enabledKey.split(",") as StationId[]) : [];
    if (ids.length === 0) return;
    let cancelled = false;
    const retryTimers: Array<ReturnType<typeof setTimeout>> = [];

    const loadOne = (id: StationId) => {
      issService
        .getStationTrack(id, 90, 90, 30)
        .then((track) => {
          if (cancelled) return;
          // solo aceptar un track con puntos: uno vacío (TLE malo, propagación
          // fallida) dejaría la trayectoria invisible y sin forma de recuperarla
          if (track.past.length === 0 && track.future.length === 0) {
            throw new Error("track vacío");
          }
          setData((prev) => ({ ...prev, [id]: { ...prev[id], track } }));
        })
        .catch(() => {
          if (cancelled) return;
          // la fuente (CelesTrak/SGP4) falló o vino vacía: reintentar pronto en
          // vez de esperar el refresh completo, así la trayectoria no queda
          // "perdida" varios minutos (ni prender/apagar la capa la traería).
          const timer = setTimeout(() => loadOne(id), TRACK_RETRY_MS);
          retryTimers.push(timer);
        });
    };

    const load = () => ids.forEach(loadOne);

    load();
    const interval = setInterval(load, TRACK_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
      retryTimers.forEach(clearTimeout);
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
