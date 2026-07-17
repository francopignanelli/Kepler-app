/**
 * Astros de la escena: Sol, Luna y Vía Láctea.
 *
 * Las posiciones son astronómicamente correctas en dirección (el Sol está
 * donde realmente está respecto de la Tierra, la Luna usa una aproximación
 * de Meeus de baja precisión ~1°).
 *
 * Escalas: la Luna está a ESCALA REAL (distancia 60,3 radios terrestres,
 * radio 0,273 R⊕ → tamaño angular ~0,52°, igual que en el cielo). El Sol
 * real quedaría a 23.455 R⊕ (fuera de la escena), así que se dibuja como
 * glow lejano pegado al firmamento, dentro de la esfera de fondo (500 R⊕).
 * El límite de zoom-out de la cámara impide alejarse lo suficiente como
 * para romper la ilusión de escala.
 */

import * as THREE from "three";

/**
 * Panorama de la Vía Láctea (ESO/S. Brunier, CC BY 4.0).
 * Carga progresiva: la versión liviana (1280×640, 152 KB) aparece al instante
 * y se reemplaza por la HD (4000×2000, ~4.7 MB) cuando termina de descargar.
 */
export const MILKY_WAY_URL = "https://cdn.eso.org/images/screen/eso0932a.jpg";
export const MILKY_WAY_URL_HD = "https://cdn.eso.org/images/publicationjpg/eso0932a.jpg";

/**
 * Pre-descarga la versión HD y avisa cuando está lista para swapear
 * (el navegador la sirve de cache al volver a pedirla como textura).
 */
export function preloadMilkyWayHd(onReady: () => void): () => void {
  const img = new Image();
  img.crossOrigin = "anonymous";
  let cancelled = false;
  img.onload = () => {
    if (!cancelled) onReady();
  };
  img.src = MILKY_WAY_URL_HD;
  return () => {
    cancelled = true;
  };
}

const MOON_TEXTURE_URL = "https://unpkg.com/globe.gl/example/moon-landing-sites/lunar_surface.jpg";

const DEG = Math.PI / 180;
/** el radio del globo de three-globe es 100 unidades = 1 R⊕ (6371 km) */
const GLOBE_R = 100;
/** Sol: lejano, dentro del skybox (50.000 u); el sprite incluye el halo */
const SUN_DISTANCE = 40_000;
const SUN_SCALE = 5600;
/**
 * Luna: distancia real (384.400 km) pero radio ×3 sobre el real (1737 km)
 * con fines estéticos: a escala exacta se percibía demasiado chica.
 */
const MOON_DISTANCE = (384_400 / 6371) * GLOBE_R;
const MOON_RADIUS = ((1737 * 3) / 6371) * GLOBE_R;

/** Convención de three-globe: (lat, lng) → dirección unitaria en la escena. */
function latLngToVec3(lat: number, lng: number): THREE.Vector3 {
  const phi = (90 - lat) * DEG;
  const theta = (90 - lng) * DEG;
  return new THREE.Vector3(
    Math.sin(phi) * Math.cos(theta),
    Math.cos(phi),
    Math.sin(phi) * Math.sin(theta),
  );
}

/** Punto subsolar aproximado (lat/lng donde el Sol está en el cénit, error <1°). */
export function approxSubsolarPoint(date: Date): { lat: number; lng: number } {
  // días julianos desde J2000
  const jd = date.getTime() / 86400000 + 2440587.5;
  const n = jd - 2451545.0;

  const meanLongitude = (280.46 + 0.9856474 * n) % 360;
  const meanAnomaly = ((357.528 + 0.9856003 * n) % 360) * DEG;
  const eclipticLongitude =
    (meanLongitude + 1.915 * Math.sin(meanAnomaly) + 0.02 * Math.sin(2 * meanAnomaly)) * DEG;
  const obliquity = (23.439 - 0.0000004 * n) * DEG;

  const declination = Math.asin(Math.sin(obliquity) * Math.sin(eclipticLongitude));
  const rightAscension = Math.atan2(
    Math.cos(obliquity) * Math.sin(eclipticLongitude),
    Math.cos(eclipticLongitude),
  );

  const gmstDeg = (280.46061837 + 360.98564736629 * n) % 360;
  let lng = rightAscension / DEG - gmstDeg;
  lng = ((lng % 360) + 540) % 360 - 180;

  return { lat: declination / DEG, lng };
}

/**
 * Punto sublunar aproximado (fórmulas de Meeus simplificadas, error ~1°:
 * de sobra para ubicar la Luna en la dirección correcta).
 */
export function approxSubLunarPoint(date: Date): { lat: number; lng: number } {
  const jd = date.getTime() / 86400000 + 2440587.5;
  const d = jd - 2451545.0;

  const meanLongitude = (218.316 + 13.176396 * d) % 360;
  const meanAnomaly = ((134.963 + 13.064993 * d) % 360) * DEG;
  const argLatitude = ((93.272 + 13.22935 * d) % 360) * DEG;

  const eclLon = (meanLongitude + 6.289 * Math.sin(meanAnomaly)) * DEG;
  const eclLat = 5.128 * Math.sin(argLatitude) * DEG;
  const obliquity = (23.439 - 0.0000004 * d) * DEG;

  const ra = Math.atan2(
    Math.sin(eclLon) * Math.cos(obliquity) - Math.tan(eclLat) * Math.sin(obliquity),
    Math.cos(eclLon),
  );
  const dec = Math.asin(
    Math.sin(eclLat) * Math.cos(obliquity) +
      Math.cos(eclLat) * Math.sin(obliquity) * Math.sin(eclLon),
  );

  const gmstDeg = (280.46061837 + 360.98564736629 * d) % 360;
  let lng = ra / DEG - gmstDeg;
  lng = ((lng % 360) + 540) % 360 - 180;

  return { lat: dec / DEG, lng };
}

/** Sprite del Sol: glow radial dibujado en canvas, mezclado aditivamente. */
function createSunSprite(): THREE.Sprite {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgba(255, 255, 252, 1)");
  gradient.addColorStop(0.18, "rgba(255, 250, 235, 1)");
  gradient.addColorStop(0.3, "rgba(255, 235, 180, 0.85)");
  gradient.addColorStop(0.5, "rgba(255, 210, 130, 0.4)");
  gradient.addColorStop(0.75, "rgba(255, 185, 105, 0.14)");
  gradient.addColorStop(1, "rgba(255, 170, 90, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(SUN_SCALE, SUN_SCALE, 1);
  return sprite;
}

/**
 * Luna: esfera con textura real + halo aditivo sutil detrás. El glow la hace
 * brillar contra el fondo pero la textura sigue leyéndose como Luna.
 */
function createMoonMesh(): THREE.Group {
  const material = new THREE.MeshBasicMaterial({ color: 0xbfc4cc });
  new THREE.TextureLoader().load(MOON_TEXTURE_URL, (texture) => {
    texture.colorSpace = THREE.SRGBColorSpace;
    material.map = texture;
    material.color.set(0xffffff);
    material.needsUpdate = true;
  });
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(MOON_RADIUS, 48, 48), material);

  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgba(226, 234, 248, 0.85)");
  gradient.addColorStop(0.35, "rgba(200, 214, 240, 0.35)");
  gradient.addColorStop(0.7, "rgba(180, 200, 235, 0.1)");
  gradient.addColorStop(1, "rgba(170, 195, 235, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const glowTexture = new THREE.CanvasTexture(canvas);
  glowTexture.colorSpace = THREE.SRGBColorSpace;
  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  glow.scale.setScalar(MOON_RADIUS * 5);

  const group = new THREE.Group();
  group.add(glow, sphere);
  return group;
}

export interface CelestialBodies {
  sun: THREE.Sprite;
  moon: THREE.Group;
}

export function createCelestialBodies(): CelestialBodies {
  return { sun: createSunSprite(), moon: createMoonMesh() };
}

/**
 * La banda de la Vía Láctea del fondo corre por el "ecuador" del skybox:
 * las latitudes del Sol y la Luna se comprimen hacia ese plano para que
 * ambos queden visualmente integrados a la banda (la longitud/azimut sigue
 * siendo el astronómico real).
 */
const BAND_FLATTEN = 0.25;

/** Reubica Sol y Luna según la hora real. Llamar al iniciar y cada minuto. */
export function updateCelestialPositions(bodies: CelestialBodies, date: Date): void {
  const sunPos = approxSubsolarPoint(date);
  bodies.sun.position.copy(
    latLngToVec3(sunPos.lat * BAND_FLATTEN, sunPos.lng).multiplyScalar(SUN_DISTANCE),
  );

  const moonPos = approxSubLunarPoint(date);
  bodies.moon.position.copy(
    latLngToVec3(moonPos.lat * BAND_FLATTEN, moonPos.lng).multiplyScalar(MOON_DISTANCE),
  );
}

export function setCelestialVisible(bodies: CelestialBodies, visible: boolean): void {
  bodies.sun.visible = visible;
  bodies.moon.visible = visible;
}
