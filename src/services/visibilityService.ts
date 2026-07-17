/**
 * Cálculo de visibilidad del cielo y score de observación de la ISS.
 * Funciones puras: sin red, sin estado. Se usan tanto en el backend
 * (enriquecimiento de pasadas) como en tests.
 */

import type { AstroDay, PassWeather, SatellitePass } from "@/types";

export interface SkyVisibilityInput {
  cloud?: number;
  visKm?: number;
  precipMm?: number;
  chanceOfRain?: number;
  humidity?: number;
  isDay?: number;
}

export interface AstroInput {
  isSunUp?: number;
  isMoonUp?: number;
  moonIllumination?: number | string;
}

/**
 * Devuelve 0-100: porcentaje estimado de cielo aprovechable para observación.
 * La nubosidad es el factor dominante; lluvia, mala visibilidad atmosférica,
 * humedad extrema y Luna brillante restan; si es de día el máximo se capa a 45.
 */
export function calculateSkyVisibility(hour: SkyVisibilityInput, astro?: AstroInput | null): number {
  let score = 100;

  const cloud = hour.cloud ?? 0;
  const visKm = hour.visKm ?? 10;
  const precipMm = hour.precipMm ?? 0;
  const chanceOfRain = hour.chanceOfRain ?? 0;
  const humidity = hour.humidity ?? 0;
  const isDay = hour.isDay ?? 0;
  const isSunUp = astro?.isSunUp ?? 0;
  const isMoonUp = astro?.isMoonUp ?? 0;
  const moonIllumination = Number(astro?.moonIllumination ?? 0);

  score -= cloud * 0.65;

  if (precipMm > 0) score -= 35;
  else if (chanceOfRain > 70) score -= 25;
  else if (chanceOfRain > 40) score -= 15;
  else if (chanceOfRain > 20) score -= 8;

  if (visKm < 2) score -= 35;
  else if (visKm < 5) score -= 20;
  else if (visKm < 8) score -= 10;

  if (humidity > 90) score -= 15;
  else if (humidity > 80) score -= 8;

  if (isMoonUp === 1 && moonIllumination > 80) score -= 8;
  else if (isMoonUp === 1 && moonIllumination > 60) score -= 5;

  if (isDay === 1 || isSunUp === 1) {
    score = Math.min(score, 45);
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

export function getSkyVisibilityLabel(score: number): string {
  if (score >= 85) return "Excelente";
  if (score >= 70) return "Muy buena";
  if (score >= 55) return "Buena";
  if (score >= 40) return "Regular";
  if (score >= 20) return "Mala";
  return "Muy mala";
}

const LABEL_MESSAGES: Record<string, string> = {
  Excelente: "Condiciones ideales para observar la ISS.",
  "Muy buena": "Muy buenas condiciones, con pocas interferencias.",
  Buena: "Probablemente visible si la pasada tiene buena altura.",
  Regular: "Puede verse, pero el clima podría dificultarlo.",
  Mala: "Baja probabilidad de observación por clima o nubosidad.",
  "Muy mala": "No recomendable para observación visual.",
};

export function getSkyVisibilityMessage(score: number): string {
  return LABEL_MESSAGES[getSkyVisibilityLabel(score)];
}

export interface ObservationPassInput {
  maxElevation: number;
  durationMinutes: number;
}

/**
 * Score final de observación (0-100) combinando:
 * cielo 60% + altura máxima 25% + duración 10% + condición nocturna 5%.
 */
export function calculateISSObservationScore(
  pass: ObservationPassInput,
  skyVisibilityScore: number,
  astro?: AstroInput | null,
  weatherHour?: { isDay?: number } | null,
): number {
  let score = 0;

  const elevationScore = Math.min(100, (pass.maxElevation / 90) * 100);
  const durationScore = Math.min(100, (pass.durationMinutes / 7) * 100);

  const isNight = (weatherHour?.isDay ?? 0) === 0 && (astro?.isSunUp ?? 0) === 0;
  const nightScore = isNight ? 100 : 20;

  score += skyVisibilityScore * 0.6;
  score += elevationScore * 0.25;
  score += durationScore * 0.1;
  score += nightScore * 0.05;

  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Score alternativo cuando no hay datos de clima (sin WEATHER_API_KEY):
 * solo geometría de la pasada + visibilidad geométrica calculada por SGP4.
 */
export function calculateGeometryOnlyScore(pass: {
  maxElevation: number;
  durationMinutes: number;
  isVisible: boolean;
}): number {
  const elevationScore = Math.min(100, (pass.maxElevation / 90) * 100);
  const durationScore = Math.min(100, (pass.durationMinutes / 7) * 100);
  const visibleScore = pass.isVisible ? 100 : 10;
  const score = elevationScore * 0.45 + durationScore * 0.2 + visibleScore * 0.35;
  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Recomendación textual final para la tarjeta de pasada.
 */
export function buildRecommendation(
  pass: Pick<SatellitePass, "maxElevation" | "isVisible">,
  skyVisibility: number | null,
  observationScore: number,
  weather?: Pick<PassWeather, "cloud" | "chanceOfRain"> | null,
  astro?: Pick<AstroDay, "isMoonUp" | "moonIllumination"> | null,
): string {
  if (!pass.isVisible) {
    return "Esta pasada no será visible a simple vista: la ISS estará en sombra o el cielo demasiado claro.";
  }
  if (skyVisibility === null) {
    return observationScore >= 60
      ? "Pasada con buena geometría. Configurá la API de clima para una recomendación completa."
      : "Pasada baja o corta. Configurá la API de clima para una recomendación completa.";
  }
  if (observationScore >= 80) {
    return "Excelente oportunidad. Salí 5 minutos antes y buscá un lugar con horizonte despejado.";
  }
  if (observationScore >= 65) {
    return "Muy buena oportunidad para observar. Alejate de luces fuertes y mirá hacia la dirección de aparición.";
  }
  if (observationScore >= 50) {
    const cloudNote =
      weather && weather.cloud > 40 ? " Atento a la nubosidad: puede tapar parte del recorrido." : "";
    return `Oportunidad razonable si el horizonte está despejado.${cloudNote}`;
  }
  if (observationScore >= 35) {
    if (weather && weather.chanceOfRain > 40) {
      return "Probabilidad de lluvia considerable: revisá el cielo antes de salir.";
    }
    if (pass.maxElevation < 25) {
      return "Pasada baja en el horizonte: solo conviene si tenés vista despejada hacia esa dirección.";
    }
    return "Condiciones justas: puede verse, pero no es una pasada destacada.";
  }
  if (astro && astro.isMoonUp === 1 && Number(astro.moonIllumination) > 80) {
    return "Condiciones difíciles y Luna muy brillante: no es una buena noche para observar.";
  }
  return "No recomendable: entre el clima y la geometría de la pasada, es muy difícil que se vea.";
}
