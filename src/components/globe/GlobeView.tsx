"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { GlobeInstance } from "globe.gl";
import {
  createCelestialBodies,
  MILKY_WAY_URL,
  MILKY_WAY_URL_HD,
  preloadMilkyWayHd,
  updateCelestialPositions,
  type CelestialBodies,
} from "@/components/globe/celestial";
import { createBrightGlobeMaterial } from "@/components/globe/globeMaterial";
import {
  animateUserMarkerPulse,
  createUserMarker,
  setUserMarkerDotScale,
  updateUserMarker,
  type UserMarker3D,
} from "@/components/globe/userMarker";
import type { StationLive } from "@/hooks/useStations";
import type { AboveSatellite, GroundTrack, UserLocation } from "@/types";

const EARTH_RADIUS_KM = 6371;
const CELESTIAL_UPDATE_MS = 60_000;
/** máximo que la pantalla de carga espera al fondo HD antes de seguir igual */
const HD_MAX_WAIT_MS = 12_000;
/** tope de alejamiento de la cámara, en radios de globo (altitud ≈ 4.5) */
const MAX_CAMERA_DISTANCE_R = 5.5;

/** umbral (con histéresis) para agrupar constelaciones al alejar la cámara */
const CLUSTER_ON_ABOVE_ALTITUDE = 1.45;
const CLUSTER_OFF_BELOW_ALTITUDE = 1.2;
/** una categoría se agrupa cuando tiene más satélites que esto */
const CLUSTER_MIN_SATS = 40;
const CLUSTER_CELL_DEG = 15;

/**
 * Imágenes satelitales por tiles (Esri World Imagery, sin key) para vista
 * cercana estilo Google Earth: se activan al acercar la cámara y se apagan
 * al alejarla, volviendo a la textura global.
 */
const TILE_URL = (x: number, y: number, level: number) =>
  `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${level}/${y}/${x}`;
const TILE_MAX_LEVEL = 17;
/** histéresis para que los tiles no parpadeen en el umbral */
const TILES_ON_BELOW_ALTITUDE = 0.7;
const TILES_OFF_ABOVE_ALTITUDE = 0.95;

export interface LayerVisibility {
  track: boolean;
  userLocation: boolean;
  satellites: boolean;
}

export const DEFAULT_LAYERS: LayerVisibility = {
  track: true,
  userLocation: true,
  satellites: true,
};

export interface FocusTarget {
  lat: number;
  lon: number;
  /** cambia en cada pedido de foco para disparar el efecto */
  seq: number;
}

interface GlobeViewProps {
  stations: StationLive[];
  satellites: AboveSatellite[];
  satelliteColors: Record<string, string>;
  selectedSatellite: AboveSatellite | null;
  onSelectSatellite: (sat: AboveSatellite) => void;
  userLocation: UserLocation | null;
  layers: LayerVisibility;
  focusTarget: FocusTarget | null;
  onReady: () => void;
}

interface StationMarkerDatum {
  id: string;
  label: string;
  color: string;
  lat: number;
  lng: number;
  alt: number;
}

interface PathDatum {
  id: string;
  kind: "past" | "future";
  color: string;
  pts: [number, number, number][];
}

interface SatObjectDatum {
  kind: "sat" | "cluster";
  lat: number;
  lng: number;
  alt: number;
  color: string;
  sat?: AboveSatellite;
  count?: number;
}

interface RingDatum {
  lat: number;
  lng: number;
  /** "r,g,b" para el color del anillo */
  rgb: string;
  maxR: number;
}

function hexToRgbString(hex: string): string {
  const n = parseInt(hex.replace("#", ""), 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

/**
 * globe.gl posiciona el elemento raíz escribiendo su `transform` inline,
 * lo que pisaría el translate(-50%,-50%) de centrado. Por eso el marcador
 * visible vive en un hijo y el raíz queda para globe.gl.
 */
function buildStationMarker(d: StationMarkerDatum): HTMLElement {
  const wrapper = document.createElement("div");
  const inner = document.createElement("div");
  inner.className = "iss-marker";
  inner.style.setProperty("--marker-color", d.color);
  inner.innerHTML = `<div class="iss-marker__pulse"></div><div class="iss-marker__dot"></div><div class="iss-marker__label">${d.label}</div>`;
  wrapper.appendChild(inner);
  return wrapper;
}

/**
 * Los satélites se dibujan como sprites con glow (núcleo brillante + halo
 * del color de su categoría, mezcla aditiva): leen como luces en órbita en
 * vez de esferas planas. Un material compartido por color mantiene el costo
 * bajo aun con cientos de satélites.
 */
const satMaterialCache = new Map<string, THREE.SpriteMaterial>();

function glowSpriteMaterial(color: string): THREE.SpriteMaterial {
  let mat = satMaterialCache.get(color);
  if (mat) return mat;

  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const rgb = hexToRgbString(color);
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.22, `rgba(${rgb},0.95)`);
  gradient.addColorStop(0.45, `rgba(${rgb},0.35)`);
  gradient.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  mat = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  satMaterialCache.set(color, mat);
  return mat;
}

function buildSatObject(d: SatObjectDatum): THREE.Object3D {
  const sprite = new THREE.Sprite(glowSpriteMaterial(d.color));
  const scale =
    d.kind === "cluster" ? 3.2 + Math.log2((d.count ?? 1) + 1) * 0.9 : 2.6;
  sprite.scale.set(scale, scale, 1);
  return sprite;
}

/** Agrupa satélites en celdas de una grilla lat/lon (centroide + conteo). */
function clusterByGrid(sats: AboveSatellite[], color: string): SatObjectDatum[] {
  const cells = new Map<string, { latSum: number; lonSum: number; altSum: number; count: number }>();
  for (const s of sats) {
    const key = `${Math.floor((s.lat + 90) / CLUSTER_CELL_DEG)}:${Math.floor((s.lon + 180) / CLUSTER_CELL_DEG)}`;
    const cell = cells.get(key) ?? { latSum: 0, lonSum: 0, altSum: 0, count: 0 };
    cell.latSum += s.lat;
    cell.lonSum += s.lon;
    cell.altSum += s.altitudeKm;
    cell.count += 1;
    cells.set(key, cell);
  }
  return [...cells.values()].map((c) => ({
    kind: "cluster" as const,
    lat: c.latSum / c.count,
    lng: c.lonSum / c.count,
    alt: c.altSum / c.count / EARTH_RADIUS_KM,
    color,
    count: c.count,
  }));
}

/**
 * Globo terráqueo interactivo (globe.gl / Three.js), montado de forma
 * imperativa. Solo se carga en el cliente vía dynamic import.
 */
export default function GlobeView({
  stations,
  satellites,
  satelliteColors,
  selectedSatellite,
  onSelectSatellite,
  userLocation,
  layers,
  focusTarget,
  onReady,
}: GlobeViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<GlobeInstance | null>(null);
  const hasCenteredRef = useRef(false);
  const tilesActiveRef = useRef(false);
  const [tilesActive, setTilesActive] = useState(false);
  const celestialRef = useRef<CelestialBodies | null>(null);
  const userMarkerRef = useRef<UserMarker3D | null>(null);
  // los efectos de datos re-corren cuando el init async termina (fix del bug
  // de la trayectoria que llegaba antes de que el globo existiera)
  const [ready, setReady] = useState(false);
  const altitudeRef = useRef(2.5);
  const [zoomedOut, setZoomedOut] = useState(true);
  const zoomedOutRef = useRef(true);
  const onSelectRef = useRef(onSelectSatellite);
  useEffect(() => {
    onSelectRef.current = onSelectSatellite;
  }, [onSelectSatellite]);

  // marcadores HTML estables por estación: globe.gl actualiza la posición del
  // elemento existente (con transición suave) en vez de reconstruirlo por tick
  const stationDatumsRef = useRef(new Map<string, StationMarkerDatum>());

  // -- inicialización única -------------------------------------------------
  useEffect(() => {
    let disposed = false;
    let celestialTimer: ReturnType<typeof setInterval> | null = null;
    const cleanupRef = { current: null as null | (() => void) };

    (async () => {
      const { default: Globe } = await import("globe.gl");
      if (disposed || !containerRef.current) return;

      // la pantalla de carga se libera cuando el globo está listo Y el fondo
      // HD de la Vía Láctea quedó aplicado (antes a veces quedaba la versión
      // en baja para siempre); con tope de seguridad por si la HD nunca llega
      let globeVisualReady = false;
      let hdReady = false;
      let readyNotified = false;
      const maybeReady = () => {
        if (disposed || readyNotified || !globeVisualReady || !hdReady) return;
        readyNotified = true;
        onReady();
      };

      const globe = new Globe(containerRef.current, {
        animateIn: false,
        rendererConfig: { antialias: true },
      })
        .globeMaterial(createBrightGlobeMaterial())
        .backgroundImageUrl(MILKY_WAY_URL)
        .showAtmosphere(true)
        .atmosphereColor("#4f7dff")
        .atmosphereAltitude(0.16)
        .pathTransitionDuration(0)
        // tween corto entre posiciones: suaviza el paso a paso real pero, si
        // llega una posición desfasada, se corrige casi al instante en vez de
        // deslizarse 1 s por el globo (el default de three-globe)
        .htmlTransitionDuration(400)
        .htmlElement((d) => buildStationMarker(d as StationMarkerDatum))
        .htmlAltitude((d) => (d as StationMarkerDatum).alt)
        .ringColor((d: object) => (t: number) =>
          `rgba(${(d as RingDatum).rgb},${Math.max(0, 0.6 * (1 - t))})`,
        )
        .ringMaxRadius((d: object) => (d as RingDatum).maxR)
        .ringPropagationSpeed(1.2)
        .ringRepeatPeriod(2200)
        .objectThreeObject((d) => buildSatObject(d as SatObjectDatum))
        .objectLat((d) => (d as SatObjectDatum).lat)
        .objectLng((d) => (d as SatObjectDatum).lng)
        .objectAltitude((d) => (d as SatObjectDatum).alt)
        .objectLabel((d) => {
          const datum = d as SatObjectDatum;
          return datum.kind === "cluster"
            ? `${datum.count} satélites (acercate para ver)`
            : `${datum.sat?.name ?? ""} · NORAD ${datum.sat?.noradId ?? ""}`;
        })
        .onObjectClick((d) => {
          const datum = d as SatObjectDatum;
          if (datum.kind === "cluster") {
            globe.pointOfView({ lat: datum.lat, lng: datum.lng, altitude: 1.0 }, 900);
          } else if (datum.sat) {
            onSelectRef.current(datum.sat);
          }
        })
        .labelLat((d) => (d as SatObjectDatum).lat)
        .labelLng((d) => (d as SatObjectDatum).lng)
        .labelAltitude((d) => (d as SatObjectDatum).alt + 0.01)
        .labelText((d) => String((d as SatObjectDatum).count ?? ""))
        .labelSize(1.1)
        .labelDotRadius(0)
        .labelColor(() => "rgba(255,255,255,0.92)")
        .onGlobeReady(() => {
          globeVisualReady = true;
          maybeReady();
        })
        .onZoom((pov) => {
          altitudeRef.current = pov.altitude;
          // el punto del observador mantiene tamaño ~constante en pantalla
          if (userMarkerRef.current) setUserMarkerDotScale(userMarkerRef.current, pov.altitude);
          // agrupar constelaciones al alejarse (con histéresis)
          if (pov.altitude > CLUSTER_ON_ABOVE_ALTITUDE && !zoomedOutRef.current) {
            zoomedOutRef.current = true;
            setZoomedOut(true);
          } else if (pov.altitude < CLUSTER_OFF_BELOW_ALTITUDE && zoomedOutRef.current) {
            zoomedOutRef.current = false;
            setZoomedOut(false);
          }
          // vista cercana: activar tiles satelitales de alta resolución
          if (pov.altitude < TILES_ON_BELOW_ALTITUDE && !tilesActiveRef.current) {
            tilesActiveRef.current = true;
            globe.globeTileEngineUrl(TILE_URL).globeTileEngineMaxLevel(TILE_MAX_LEVEL);
            setTilesActive(true);
          } else if (pov.altitude > TILES_OFF_ABOVE_ALTITUDE && tilesActiveRef.current) {
            tilesActiveRef.current = false;
            // null desactiva el motor de tiles y vuelve a la textura global
            globe.globeTileEngineUrl(null as unknown as typeof TILE_URL);
            setTilesActive(false);
          }
        });

      globe.width(containerRef.current.clientWidth).height(containerRef.current.clientHeight);

      // rotación automática sutil hasta que el usuario interactúa
      const controls = globe.controls();
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      controls.autoRotate = !reducedMotion;
      controls.autoRotateSpeed = 0.4;
      controls.addEventListener("start", () => {
        controls.autoRotate = false;
      });
      // límite de zoom-out: mantiene la escala de la escena creíble
      controls.maxDistance = globe.getGlobeRadius() * MAX_CAMERA_DISTANCE_R;

      globeRef.current = globe;

      // Sol y Luna en la escena, en sus direcciones astronómicas reales
      const celestial = createCelestialBodies();
      updateCelestialPositions(celestial, new Date());
      globe.scene().add(celestial.sun, celestial.moon);
      celestialRef.current = celestial;

      // grilla de coordenadas siempre visible sobre el planeta
      globe.showGraticules(true);

      // marcador del observador: geometría anclada a la superficie
      const userMarker = createUserMarker();
      globe.scene().add(userMarker.group);
      userMarkerRef.current = userMarker;
      altitudeRef.current = globe.pointOfView().altitude;
      setUserMarkerDotScale(userMarker, altitudeRef.current);

      // loop del radar: anillo que se expande desde la ubicación del usuario
      // (independiente del render de globe.gl, sobrevive a cualquier zoom)
      let pulseFrame = 0;
      const animatePulse = (time: number) => {
        if (userMarkerRef.current) {
          animateUserMarkerPulse(userMarkerRef.current, time, altitudeRef.current);
        }
        pulseFrame = requestAnimationFrame(animatePulse);
      };
      pulseFrame = requestAnimationFrame(animatePulse);

      // fondo: swap a la Vía Láctea HD cuando termina de descargar
      const cancelHdPreload = preloadMilkyWayHd(() => {
        if (disposed) return;
        globe.backgroundImageUrl(MILKY_WAY_URL_HD);
        hdReady = true;
        maybeReady();
      });
      // tope: si la HD no llega (red caída), no bloquear la app para siempre
      const hdCapTimer = setTimeout(() => {
        hdReady = true;
        maybeReady();
      }, HD_MAX_WAIT_MS);

      // actualizar posiciones de Sol y Luna cada minuto
      celestialTimer = setInterval(() => {
        if (celestialRef.current) updateCelestialPositions(celestialRef.current, new Date());
      }, CELESTIAL_UPDATE_MS);

      // pausar el render cuando la pestaña no está visible
      const onVisibility = () => {
        if (document.hidden) globe.pauseAnimation();
        else globe.resumeAnimation();
      };
      document.addEventListener("visibilitychange", onVisibility);

      // responsive
      const resizeObserver = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (entry && globeRef.current) {
          globeRef.current.width(entry.contentRect.width).height(entry.contentRect.height);
        }
      });
      resizeObserver.observe(containerRef.current);

      // guardar cleanup en el ref del contenedor
      cleanupRef.current = () => {
        cancelAnimationFrame(pulseFrame);
        clearTimeout(hdCapTimer);
        cancelHdPreload();
        document.removeEventListener("visibilitychange", onVisibility);
        resizeObserver.disconnect();
        globe._destructor();
        globeRef.current = null;
      };

      // re-correr los efectos de datos ahora que el globo existe
      setReady(true);
    })().catch((err) => {
      console.error("[globe] falló la inicialización:", err);
      // liberar la pantalla de carga igualmente: el resto de la app sirve
      if (!disposed) onReady();
    });

    return () => {
      disposed = true;
      if (celestialTimer) clearInterval(celestialTimer);
      cleanupRef.current?.();
    };
  }, [onReady]);

  // -- marcadores de estaciones -------------------------------------------------
  useEffect(() => {
    const globe = globeRef.current;
    if (!globe || !ready) return;
    const datums: StationMarkerDatum[] = [];
    for (const s of stations) {
      if (!s.position) continue;
      let datum = stationDatumsRef.current.get(s.info.id);
      if (!datum) {
        datum = {
          id: s.info.id,
          label: s.info.shortName,
          color: s.info.color,
          lat: 0,
          lng: 0,
          alt: 0,
        };
        stationDatumsRef.current.set(s.info.id, datum);
      }
      datum.lat = s.position.lat;
      datum.lng = s.position.lon;
      // las estaciones sí flotan: están en órbita a ~400 km (escala real)
      datum.alt = s.position.altitudeKm / EARTH_RADIUS_KM;
      datums.push(datum);
    }
    globe.htmlElementsData(datums);
  }, [stations, ready]);

  // centrar la primera vez que llega una posición de estación
  useEffect(() => {
    const globe = globeRef.current;
    if (!globe || !ready || hasCenteredRef.current) return;
    const first = stations.find((s) => s.position)?.position;
    if (!first) return;
    hasCenteredRef.current = true;
    globe.pointOfView({ lat: first.lat, lng: first.lon, altitude: 2.2 }, 0);
  }, [stations, ready]);

  // -- trayectorias de estaciones ------------------------------------------------
  // `stations` cambia de referencia cada 5 s (poll de posición), pero el
  // ground track solo se recalcula cada 5 min: el efecto depende de una firma
  // estable (id + timestamp del track) para no re-digestar sin necesidad.
  // Además los datums son ESTABLES por `${id}-${kind}` (se mutan, no se
  // recrean): three-globe actualiza la geometría del path existente en vez de
  // destruir/crear, así la trayectoria nunca puede quedar "perdida" a mitad
  // de una reconstrucción.
  const stationsRef = useRef(stations);
  useEffect(() => {
    stationsRef.current = stations;
  }, [stations]);
  const trackSignature = stations.map((s) => `${s.info.id}:${s.track?.generatedAt ?? 0}`).join("|");
  const pathDatumsRef = useRef(new Map<string, PathDatum>());

  useEffect(() => {
    const globe = globeRef.current;
    if (!globe || !ready) return;
    if (!layers.track) {
      globe.pathsData([]);
      return;
    }
    const toPoint = (p: { lat: number; lon: number; altitudeKm: number }): [number, number, number] => [
      p.lat,
      p.lon,
      p.altitudeKm / EARTH_RADIUS_KM,
    ];
    const paths: PathDatum[] = stationsRef.current.flatMap((s) => {
      if (!s.track) return [];
      const track: GroundTrack = s.track;
      return (["past", "future"] as const).map((kind) => {
        const key = `${s.info.id}-${kind}`;
        let datum = pathDatumsRef.current.get(key);
        if (!datum) {
          datum = { id: key, kind, color: s.info.color, pts: [] };
          pathDatumsRef.current.set(key, datum);
        }
        datum.pts = (kind === "past" ? track.past : track.future).map(toPoint);
        return datum;
      });
    });
    const rgb = (d: PathDatum) => hexToRgbString(d.color);
    globe
      .pathsData(paths)
      .pathPoints((d) => (d as PathDatum).pts)
      .pathColor((d: object) =>
        (d as PathDatum).kind === "past"
          ? [`rgba(${rgb(d as PathDatum)},0.12)`, `rgba(${rgb(d as PathDatum)},0.9)`]
          : [`rgba(${rgb(d as PathDatum)},0.9)`, `rgba(${rgb(d as PathDatum)},0.15)`],
      )
      .pathStroke(1.6)
      .pathDashLength((d) => ((d as PathDatum).kind === "future" ? 0.06 : 1))
      .pathDashGap((d) => ((d as PathDatum).kind === "future" ? 0.025 : 0))
      .pathDashAnimateTime((d) => ((d as PathDatum).kind === "future" ? 18_000 : 0));
  }, [trackSignature, layers.track, ready]);

  // -- satélites sobre el observador (explorador) ---------------------------------
  useEffect(() => {
    const globe = globeRef.current;
    if (!globe || !ready) return;
    if (!layers.satellites) {
      globe.objectsData([]);
      globe.labelsData([]);
      return;
    }

    const byCategory = new Map<string, AboveSatellite[]>();
    for (const sat of satellites) {
      const list = byCategory.get(sat.category) ?? [];
      list.push(sat);
      byCategory.set(sat.category, list);
    }

    const objects: SatObjectDatum[] = [];
    const clusterLabels: SatObjectDatum[] = [];
    for (const [category, sats] of byCategory) {
      const color = satelliteColors[category] ?? "#94a3b8";
      if (zoomedOut && sats.length > CLUSTER_MIN_SATS) {
        const clusters = clusterByGrid(sats, color);
        objects.push(...clusters);
        clusterLabels.push(...clusters);
      } else {
        objects.push(
          ...sats.map((sat) => ({
            kind: "sat" as const,
            lat: sat.lat,
            lng: sat.lon,
            alt: sat.altitudeKm / EARTH_RADIUS_KM,
            color,
            sat,
          })),
        );
      }
    }
    globe.objectsData(objects);
    globe.labelsData(clusterLabels);
  }, [satellites, satelliteColors, zoomedOut, layers.satellites, ready]);

  // -- marcador del observador + anillos ------------------------------------------
  useEffect(() => {
    const globe = globeRef.current;
    const marker = userMarkerRef.current;
    if (!globe || !marker || !ready) return;
    const visible = Boolean(userLocation) && layers.userLocation;
    marker.group.visible = visible;
    if (userLocation) {
      updateUserMarker(marker, globe, userLocation.lat, userLocation.lon, userLocation.accuracyKm);
    }

    // el radar del usuario ahora vive en el propio marcador 3D (visible a
    // cualquier zoom); ringsData queda solo para el satélite seleccionado
    const rings: RingDatum[] = [];
    if (selectedSatellite) {
      rings.push({
        lat: selectedSatellite.lat,
        lng: selectedSatellite.lon,
        rgb: hexToRgbString(satelliteColors[selectedSatellite.category] ?? "#94a3b8"),
        maxR: 3.5,
      });
    }
    globe.ringsData(rings);
  }, [userLocation, layers.userLocation, selectedSatellite, satelliteColors, ready]);

  // -- foco de cámara ----------------------------------------------------------
  useEffect(() => {
    const globe = globeRef.current;
    if (!globe || !ready || !focusTarget) return;
    globe.controls().autoRotate = false;
    globe.pointOfView({ lat: focusTarget.lat, lng: focusTarget.lon, altitude: 1.7 }, 1100);
  }, [focusTarget, ready]);

  return (
    <div className="relative h-full w-full">
      <div
        ref={containerRef}
        className="h-full w-full"
        role="application"
        aria-label="Globo terráqueo interactivo con estaciones y satélites en tiempo real. Los datos también están disponibles en el panel lateral."
      />

      {/* leyenda de trayectorias por estación: línea llena = recorrido ya
          hecho, línea punteada = trayectoria prevista */}
      {layers.track && stations.length > 0 && (
        <div className="panel pointer-events-none absolute bottom-2 right-2 hidden flex-col gap-1 px-2.5 py-1.5 text-[10px] text-star-300 lg:flex">
          {stations.map((s) => (
            <span key={s.info.id} className="flex flex-col gap-0.5">
              <span className="flex items-center gap-1.5">
                <svg width="26" height="4" aria-hidden="true">
                  <line x1="0" y1="2" x2="26" y2="2" stroke={s.info.color} strokeWidth="2" />
                </svg>
                {s.info.shortName} · recorrido (últimos 90 min)
              </span>
              <span className="flex items-center gap-1.5">
                <svg width="26" height="4" aria-hidden="true">
                  <line
                    x1="0"
                    y1="2"
                    x2="26"
                    y2="2"
                    stroke={s.info.color}
                    strokeWidth="2"
                    strokeDasharray="4 3"
                    opacity="0.8"
                  />
                </svg>
                {s.info.shortName} · trayectoria prevista (próximos 90 min)
              </span>
            </span>
          ))}
        </div>
      )}

      {/* atribución de imágenes satelitales cuando los tiles están activos */}
      {tilesActive && (
        <p className="pointer-events-none absolute bottom-0.5 left-2 text-[9px] text-star-700">
          Imágenes satelitales © Esri — Maxar, Earthstar Geographics
        </p>
      )}
    </div>
  );
}
