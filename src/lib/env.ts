/**
 * Acceso centralizado a variables de entorno.
 * Solo debe importarse desde código de servidor (API routes / lib de server).
 * Las keys NUNCA se envían al cliente: el frontend solo habla con /api/*.
 */

function readOptional(name: string): string | null {
  const value = process.env[name];
  if (!value || value.trim() === "" || value.trim() === "your_key_here") {
    return null;
  }
  return value.trim();
}

export function getWeatherApiKey(): string | null {
  return readOptional("WEATHER_API_KEY");
}

export function getN2yoApiKey(): string | null {
  return readOptional("N2YO_API_KEY");
}

export function getOpenWeatherApiKey(): string | null {
  return readOptional("OPENWEATHER_API_KEY");
}

export function hasWeatherApiKey(): boolean {
  return getWeatherApiKey() !== null;
}

export function hasN2yoApiKey(): boolean {
  return getN2yoApiKey() !== null;
}

/**
 * Reemplaza cualquier aparición de una key en un mensaje de error antes de
 * loguearlo o devolverlo, para no filtrar secrets ni en logs.
 */
export function scrubSecrets(message: string): string {
  let out = message;
  for (const key of [getWeatherApiKey(), getN2yoApiKey(), getOpenWeatherApiKey()]) {
    if (key) {
      out = out.split(key).join("[REDACTED]");
    }
  }
  return out;
}
