/**
 * Tipos de dominio compartidos entre servidor y cliente.
 * Ninguno de estos tipos expone datos crudos de APIs externas:
 * el backend siempre mapea a estas formas propias.
 */

// ---------------------------------------------------------------------------
// Geografía / ubicación
// ---------------------------------------------------------------------------

export interface GeoPoint {
  lat: number;
  lon: number;
}

export interface UserLocation extends GeoPoint {
  name: string;
  region?: string;
  country?: string;
  timezone?: string;
  /** Cómo se obtuvo: geolocalización del navegador o búsqueda manual */
  source: "geolocation" | "search" | "manual";
  /**
   * Radio de precisión en km: accuracy del GPS para geolocalización, o el
   * radio aproximado de la zona para búsquedas (ej: un barrio ≈ 3 km).
   * Se dibuja como rango alrededor del punto en el globo.
   */
  accuracyKm?: number;
}

export interface CitySearchResult extends GeoPoint {
  id: string;
  name: string;
  region: string;
  country: string;
}

// ---------------------------------------------------------------------------
// ISS / satélites
// ---------------------------------------------------------------------------

export interface Tle {
  name: string;
  line1: string;
  line2: string;
  /** epoch de descarga, ms UTC */
  fetchedAt: number;
  source: "celestrak" | "wheretheiss";
}

export interface SatellitePosition {
  noradId: number;
  name: string;
  lat: number;
  lon: number;
  altitudeKm: number;
  velocityKmh: number;
  /** ms UTC */
  timestamp: number;
  /** si el satélite está iluminado por el Sol o en sombra terrestre */
  visibility: "daylight" | "eclipsed";
  source: "wheretheiss" | "sgp4";
  /** ángulos de observación desde la ubicación del usuario (si se pasó) */
  azimuthDeg?: number;
  elevationDeg?: number;
}

// ---------------------------------------------------------------------------
// Estaciones espaciales y explorador de satélites
// ---------------------------------------------------------------------------

export type StationId = "iss" | "tiangong";

export interface StationInfo {
  id: StationId;
  name: string;
  shortName: string;
  noradId: number;
  /** color de marcador y trayectoria en el globo */
  color: string;
}

/** Grupos del explorador de satélites (mapean a categorías de N2YO). */
export type SatCategoryId = "starlink" | "gps" | "weather" | "amateur" | "earthobs" | "all";

export interface SatCategoryInfo {
  id: SatCategoryId;
  /** id de categoría en la API de N2YO */
  n2yoId: number;
  label: string;
  color: string;
}

/** Satélite reportado por N2YO /above sobre el observador. */
export interface AboveSatellite {
  noradId: number;
  name: string;
  intlDesignator: string;
  /** YYYY-MM-DD */
  launchDate: string;
  lat: number;
  lon: number;
  altitudeKm: number;
  category: SatCategoryId;
}

export interface SatellitesAbove {
  category: SatCategoryId;
  /** total reportado por N2YO para el radio pedido */
  total: number;
  satellites: AboveSatellite[];
  /** ms UTC */
  fetchedAt: number;
}

export interface GroundTrackPoint {
  lat: number;
  lon: number;
  altitudeKm: number;
  /** ms UTC */
  timestamp: number;
}

export interface GroundTrack {
  noradId: number;
  past: GroundTrackPoint[];
  future: GroundTrackPoint[];
  /** ms UTC en que se generó */
  generatedAt: number;
}

// ---------------------------------------------------------------------------
// Pasadas
// ---------------------------------------------------------------------------

export interface SatellitePass {
  /** ISO UTC */
  startTime: string;
  peakTime: string;
  endTime: string;
  durationMinutes: number;
  /** grados sobre el horizonte */
  maxElevation: number;
  startAzimuth: number;
  endAzimuth: number;
  /** punto cardinal, ej: "SO" */
  startDirection: string;
  endDirection: string;
  /** magnitud visual estimada (menor = más brillante), si se pudo calcular */
  magnitude: number | null;
  /** si la pasada es visible a simple vista (noche + ISS iluminada) */
  isVisible: boolean;
}

export interface PassWeather {
  condition: string;
  icon: string;
  code: number;
  tempC: number;
  feelsLikeC: number;
  cloud: number;
  visibilityKm: number;
  humidity: number;
  precipMm: number;
  chanceOfRain: number;
  windKph: number;
  gustKph: number;
  isDay: number;
}

export interface PassAstronomy {
  sunrise: string;
  sunset: string;
  moonrise: string;
  moonset: string;
  moonPhase: string;
  moonIllumination: number;
  isMoonUp: number;
  isSunUp: number;
}

export interface PassScores {
  /** 0-100: qué tan despejado estará el cielo */
  skyVisibility: number | null;
  /** 0-100: score combinado clima + geometría de la pasada */
  issObservation: number;
  label: string;
}

export interface EnrichedPass {
  passId: string;
  pass: SatellitePass;
  weather: PassWeather | null;
  astronomy: PassAstronomy | null;
  scores: PassScores;
  recommendation: string;
}

export interface PassesResponse {
  location: {
    lat: number;
    lon: number;
    name?: string;
    timezone: string;
  };
  passes: EnrichedPass[];
  /** de dónde salieron las pasadas */
  source: "n2yo" | "sgp4";
  weatherAvailable: boolean;
  generatedAt: number;
}

// ---------------------------------------------------------------------------
// Clima
// ---------------------------------------------------------------------------

export interface WeatherLocation {
  name: string;
  region: string;
  country: string;
  lat: number;
  lon: number;
  tzId: string;
  localtimeEpoch: number;
}

export type WeatherSource = "weatherapi" | "open-meteo" | "openweathermap";

export interface CurrentWeather {
  location: WeatherLocation;
  /** proveedor que respondió (WeatherAPI con key, Open-Meteo sin key o como fallback) */
  source?: WeatherSource;
  tempC: number;
  feelsLikeC: number;
  condition: string;
  icon: string;
  code: number;
  windKph: number;
  windDir: string;
  gustKph: number;
  pressureMb: number;
  precipMm: number;
  humidity: number;
  cloud: number;
  isDay: number;
  visKm: number;
  uv: number;
}

export interface WeatherHour {
  timeEpoch: number;
  time: string;
  tempC: number;
  feelsLikeC: number;
  condition: string;
  icon: string;
  code: number;
  windKph: number;
  gustKph: number;
  precipMm: number;
  humidity: number;
  cloud: number;
  dewpointC: number;
  willItRain: number;
  chanceOfRain: number;
  willItSnow: number;
  chanceOfSnow: number;
  isDay: number;
  visKm: number;
  uv: number;
}

export interface AstroDay {
  sunrise: string;
  sunset: string;
  moonrise: string;
  moonset: string;
  moonPhase: string;
  moonIllumination: number;
  isMoonUp: number;
  isSunUp: number;
}

export interface ForecastDay {
  date: string;
  dateEpoch: number;
  maxTempC: number;
  minTempC: number;
  avgTempC: number;
  condition: string;
  icon: string;
  dailyChanceOfRain: number;
  totalPrecipMm: number;
  avgVisKm: number;
  avgHumidity: number;
  astro: AstroDay;
  hours: WeatherHour[];
}

export interface WeatherForecast {
  location: WeatherLocation;
  current: CurrentWeather;
  days: ForecastDay[];
  source?: WeatherSource;
}

// ---------------------------------------------------------------------------
// Alertas / preferencias
// ---------------------------------------------------------------------------

export interface NotificationPreferences {
  enabled: boolean;
  minutesBefore: 5 | 10 | 15;
  /** solo alertar si el cielo visible estimado supera este % */
  minimumSkyVisibility: number;
  /** solo alertar si la altura máxima supera estos grados */
  minimumElevation: number;
  nightOnly: boolean;
}

export interface ScheduledAlert {
  id: string;
  passId: string;
  /** ms UTC en que debe dispararse */
  triggerAt: number;
  /** ms UTC de inicio de la pasada */
  passStartAt: number;
  title: string;
  body: string;
  fired: boolean;
}

export interface UserPreferences {
  favoriteLocations: UserLocation[];
  notificationPreferences: NotificationPreferences;
}

// ---------------------------------------------------------------------------
// Errores de API propios
// ---------------------------------------------------------------------------

export interface ApiError {
  error: string;
  code:
    | "VALIDATION_ERROR"
    | "RATE_LIMITED"
    | "UPSTREAM_ERROR"
    | "MISSING_API_KEY"
    | "NOT_FOUND"
    | "INTERNAL_ERROR";
}
