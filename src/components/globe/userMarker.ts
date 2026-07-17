/**
 * Marcador 3D del observador, anclado a la superficie del globo.
 *
 * Es geometría WebGL dentro de la escena (no un overlay HTML): queda
 * perfectamente fijo al planeta al rotar o arrastrar la cámara. Consta de
 * un punto central (tamaño ~constante en pantalla, se reescala con el zoom)
 * y un círculo de precisión con radio físico real (accuracyKm), al estilo
 * de los mapas: al acercar el zoom el rango se hace visible.
 */

import * as THREE from "three";
import type { GlobeInstance } from "globe.gl";

const EARTH_RADIUS_KM = 6371;
/** color orbit-400 de la paleta (#6f9bff) */
const MARKER_COLOR = 0x6f9bff;
/** altitud del marcador en radios de globo (~4 km) para evitar z-fighting */
const SURFACE_ALTITUDE = 0.0006;
const Z_AXIS = new THREE.Vector3(0, 0, 1);

export interface UserMarker3D {
  group: THREE.Group;
  /** punto central + borde blanco (escala según zoom) */
  dot: THREE.Group;
  /** disco de precisión (escala = radio físico en unidades de escena) */
  accuracy: THREE.Group;
  /** anillo "radar" animado: escala según zoom, visible a cualquier altitud */
  pulse: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
}

function circleMaterial(color: number, opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    // evita z-fighting contra la superficie en ángulos rasantes
    polygonOffset: true,
    polygonOffsetFactor: -2,
    side: THREE.DoubleSide,
  });
}

export function createUserMarker(): UserMarker3D {
  const group = new THREE.Group();
  group.visible = false;

  // círculo de precisión: relleno translúcido + borde
  const accuracy = new THREE.Group();
  const fill = new THREE.Mesh(new THREE.CircleGeometry(1, 96), circleMaterial(MARKER_COLOR, 0.14));
  const border = new THREE.Mesh(
    new THREE.RingGeometry(0.97, 1, 96),
    circleMaterial(MARKER_COLOR, 0.55),
  );
  fill.renderOrder = 2;
  border.renderOrder = 2;
  accuracy.add(fill, border);
  accuracy.visible = false;

  // punto central: dot de color + borde blanco (leve offset en Z para
  // dibujarse siempre por encima del círculo de precisión)
  const dot = new THREE.Group();
  const dotFill = new THREE.Mesh(new THREE.CircleGeometry(1, 48), circleMaterial(MARKER_COLOR, 1));
  const dotBorder = new THREE.Mesh(
    new THREE.RingGeometry(1, 1.35, 48),
    circleMaterial(0xffffff, 0.95),
  );
  dotFill.renderOrder = 3;
  dotBorder.renderOrder = 3;
  dot.add(dotFill, dotBorder);
  dot.position.z = 0.02;

  // anillo radar: se expande y desvanece en loop (animado desde GlobeView)
  const pulse = new THREE.Mesh(
    new THREE.RingGeometry(0.86, 1, 64),
    circleMaterial(MARKER_COLOR, 0.5),
  );
  pulse.renderOrder = 3;
  pulse.position.z = 0.015;

  group.add(accuracy, dot, pulse);
  return { group, dot, accuracy, pulse };
}

/** Posiciona y orienta el marcador sobre (lat, lon), tangente a la superficie. */
export function updateUserMarker(
  marker: UserMarker3D,
  globe: GlobeInstance,
  lat: number,
  lon: number,
  accuracyKm?: number,
): void {
  const { x, y, z } = globe.getCoords(lat, lon, SURFACE_ALTITUDE);
  const pos = new THREE.Vector3(x, y, z);
  marker.group.position.copy(pos);
  marker.group.quaternion.setFromUnitVectors(Z_AXIS, pos.clone().normalize());

  const radiusUnits = accuracyKm
    ? (accuracyKm / EARTH_RADIUS_KM) * globe.getGlobeRadius()
    : 0;
  marker.accuracy.visible = radiusUnits > 0;
  if (radiusUnits > 0) marker.accuracy.scale.setScalar(radiusUnits);
}

/** Por debajo de esta altitud el punto opaco taparía la zona: se oculta y
 *  quedan el círculo de precisión translúcido y el radar. */
const DOT_HIDE_BELOW_ALTITUDE = 0.09;

/** radio base del marcador en unidades de escena, ~constante en pantalla */
function baseRadiusForAltitude(altitude: number): number {
  return THREE.MathUtils.clamp(0.8 * altitude, 0.015, 2.4);
}

/**
 * Reescala el punto central para que mida ~10 px en pantalla a cualquier zoom
 * (la distancia cámara-superficie es ≈ altitude × radio del globo).
 * Con mucho zoom el punto se oculta si el círculo de precisión es visible.
 */
export function setUserMarkerDotScale(marker: UserMarker3D, altitude: number): void {
  const radius = baseRadiusForAltitude(altitude);
  marker.dot.scale.setScalar(radius);
  marker.dot.visible = !(altitude < DOT_HIDE_BELOW_ALTITUDE && marker.accuracy.visible);
}

const PULSE_PERIOD_MS = 2400;

/**
 * Animación del anillo radar: se expande desde el punto y se desvanece, a
 * escala de pantalla (funciona igual en vista global y en el zoom máximo).
 * Llamar en cada frame con la altitud actual de la cámara.
 */
export function animateUserMarkerPulse(
  marker: UserMarker3D,
  timeMs: number,
  altitude: number,
): void {
  if (!marker.group.visible) return;
  const phase = (timeMs % PULSE_PERIOD_MS) / PULSE_PERIOD_MS;
  const base = baseRadiusForAltitude(altitude);
  marker.pulse.scale.setScalar(base * (1 + 3.2 * phase));
  marker.pulse.material.opacity = 0.55 * (1 - phase);
}
