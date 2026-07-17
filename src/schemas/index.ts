import { z } from "zod";

/**
 * Validación de todo parámetro que entra por /api/*.
 * Nada llega a los servicios sin pasar por acá.
 */

export const latSchema = z.coerce.number().finite().min(-90).max(90);
export const lonSchema = z.coerce.number().finite().min(-180).max(180);

export const coordsQuerySchema = z.object({
  lat: latSchema,
  lon: lonSchema,
});

export const passesQuerySchema = z.object({
  lat: latSchema,
  lon: lonSchema,
  days: z.coerce.number().int().min(1).max(5).default(3),
  minElevation: z.coerce.number().min(0).max(90).default(10),
});

export const forecastQuerySchema = z.object({
  lat: latSchema,
  lon: lonSchema,
  days: z.coerce.number().int().min(1).max(3).default(2),
});

/** Búsqueda de ciudad: letras (con acentos), números, espacios y puntuación básica.
 *  lat/lon opcionales sesgan los resultados hacia la zona del usuario. */
export const searchQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .min(2, "Escribí al menos 2 caracteres")
    .max(80)
    .regex(/^[\p{L}\p{N}\s.,'()-]+$/u, "La búsqueda contiene caracteres no permitidos"),
  lat: latSchema.optional(),
  lon: lonSchema.optional(),
});

export const astronomyQuerySchema = z.object({
  lat: latSchema,
  lon: lonSchema,
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha esperado: YYYY-MM-DD"),
});

export const stationIdSchema = z.enum(["iss", "tiangong"]).default("iss");

/** Posición de estación: opcionalmente con observador para calcular az/el. */
export const stationPositionQuerySchema = z.object({
  sat: stationIdSchema,
  lat: latSchema.optional(),
  lon: lonSchema.optional(),
});

export const trackQuerySchema = z.object({
  sat: stationIdSchema,
  pastMin: z.coerce.number().int().min(0).max(360).default(90),
  futureMin: z.coerce.number().int().min(0).max(360).default(90),
  stepSec: z.coerce.number().int().min(10).max(300).default(30),
});

export const satCategorySchema = z.enum([
  "starlink",
  "gps",
  "weather",
  "amateur",
  "earthobs",
  "all",
]);

export const aboveQuerySchema = z.object({
  lat: latSchema,
  lon: lonSchema,
  category: satCategorySchema.default("all"),
  radius: z.coerce.number().int().min(5).max(90).default(90),
});

export const noradIdSchema = z.coerce.number().int().min(1).max(999_999);

/** Preferencias de alerta (se validan también al leer de localStorage). */
export const notificationPreferencesSchema = z.object({
  enabled: z.boolean(),
  minutesBefore: z.union([z.literal(5), z.literal(10), z.literal(15)]),
  minimumSkyVisibility: z.number().min(0).max(100),
  minimumElevation: z.number().min(0).max(90),
  nightOnly: z.boolean(),
});

export const userLocationSchema = z.object({
  name: z.string().min(1).max(120),
  region: z.string().max(120).optional(),
  country: z.string().max(120).optional(),
  timezone: z.string().max(64).optional(),
  lat: latSchema,
  lon: lonSchema,
  source: z.enum(["geolocation", "search", "manual"]),
  accuracyKm: z.number().positive().max(1000).optional(),
});

export type PassesQuery = z.infer<typeof passesQuerySchema>;
export type ForecastQuery = z.infer<typeof forecastQuerySchema>;
