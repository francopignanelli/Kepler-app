import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cacheClear } from "@/lib/cache";
import { rateLimitClear } from "@/lib/rateLimit";

const FAKE_KEY = "super-secret-weather-key-123";

const waCurrentPayload = {
  location: {
    name: "Buenos Aires",
    region: "Distrito Federal",
    country: "Argentina",
    lat: -34.61,
    lon: -58.38,
    tz_id: "America/Argentina/Buenos_Aires",
    localtime_epoch: 1783382400,
  },
  current: {
    temp_c: 12,
    feelslike_c: 10.5,
    condition: { text: "Despejado", icon: "//cdn.weatherapi.com/weather/64x64/night/113.png", code: 1000 },
    wind_kph: 15,
    wind_dir: "SE",
    gust_kph: 22,
    pressure_mb: 1015,
    precip_mm: 0,
    humidity: 60,
    cloud: 10,
    is_day: 0,
    vis_km: 10,
    uv: 1,
  },
};

const omCurrentPayload = {
  latitude: -34.6,
  longitude: -58.38,
  timezone: "America/Argentina/Buenos_Aires",
  current: {
    time: 1783382400,
    temperature_2m: 12.3,
    apparent_temperature: 10.1,
    relative_humidity_2m: 60,
    precipitation: 0,
    weather_code: 0,
    cloud_cover: 10,
    wind_speed_10m: 15,
    wind_gusts_10m: 22,
    wind_direction_10m: 135,
    is_day: 0,
    pressure_msl: 1015,
  },
  hourly: { time: [1783382400], visibility: [10000], uv_index: [1] },
};

function makeRequest(path: string): Request {
  return new Request(`http://localhost${path}`);
}

describe("GET /api/weather/current", () => {
  beforeEach(() => {
    cacheClear();
    rateLimitClear();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("sin WEATHER_API_KEY usa Open-Meteo (sin key) y responde 200", async () => {
    vi.stubEnv("WEATHER_API_KEY", "");
    const fetchSpy = vi.fn(async (url: RequestInfo | URL) => {
      expect(String(url)).toContain("api.open-meteo.com");
      return new Response(JSON.stringify(omCurrentPayload), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchSpy);

    const { GET } = await import("@/app/api/weather/current/route");
    const response = await GET(makeRequest("/api/weather/current?lat=-34.6&lon=-58.4"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.source).toBe("open-meteo");
    expect(body.tempC).toBe(12.3);
    expect(body.condition).toBe("Despejado");
    expect(body.windDir).toBe("SE");
    expect(body.visKm).toBe(10);
    expect(body.location.tzId).toBe("America/Argentina/Buenos_Aires");
  });

  it("con key pero WeatherAPI caída, degrada a Open-Meteo", async () => {
    vi.stubEnv("WEATHER_API_KEY", FAKE_KEY);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: RequestInfo | URL) => {
        if (String(url).includes("weatherapi.com")) {
          return new Response("down", { status: 500 });
        }
        return new Response(JSON.stringify(omCurrentPayload), { status: 200 });
      }),
    );

    const { GET } = await import("@/app/api/weather/current/route");
    const response = await GET(makeRequest("/api/weather/current?lat=-34.6&lon=-58.4"));

    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).not.toContain(FAKE_KEY);
    expect(JSON.parse(text).source).toBe("open-meteo");
  });

  it("con OPENWEATHER_API_KEY (y sin WeatherAPI) usa OpenWeatherMap para el clima actual", async () => {
    const OWM_KEY = "owm-secret-key-456";
    vi.stubEnv("WEATHER_API_KEY", "");
    vi.stubEnv("OPENWEATHER_API_KEY", OWM_KEY);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: RequestInfo | URL) => {
        expect(String(url)).toContain("api.openweathermap.org");
        return new Response(
          JSON.stringify({
            coord: { lat: -34.6, lon: -58.38 },
            weather: [{ id: 800, description: "cielo claro", icon: "01n" }],
            main: { temp: 11.2, feels_like: 10, humidity: 55, pressure: 1016 },
            visibility: 10000,
            wind: { speed: 4.2, deg: 135, gust: 6 },
            clouds: { all: 5 },
            dt: 1783382400,
            sys: { sunrise: 1783336000, sunset: 1783372000 },
            name: "Buenos Aires",
          }),
          { status: 200 },
        );
      }),
    );

    const { GET } = await import("@/app/api/weather/current/route");
    const response = await GET(makeRequest("/api/weather/current?lat=-34.6&lon=-58.4"));

    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).not.toContain(OWM_KEY);

    const body = JSON.parse(text);
    expect(body.source).toBe("openweathermap");
    expect(body.condition).toBe("Cielo claro");
    expect(body.icon).toBe("https://openweathermap.org/img/wn/01n@2x.png");
    expect(body.windKph).toBeCloseTo(15.12, 1);
    expect(body.isDay).toBe(0); // dt posterior al atardecer
    expect(body.cloud).toBe(5);
  });

  it("astronomy sigue exigiendo WEATHER_API_KEY (503 sin key, sin llamar afuera)", async () => {
    vi.stubEnv("WEATHER_API_KEY", "");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const { GET } = await import("@/app/api/weather/astronomy/route");
    const response = await GET(
      makeRequest("/api/weather/astronomy?lat=-34.6&lon=-58.4&date=2026-07-08"),
    );

    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe("MISSING_API_KEY");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("valida lat/lon y devuelve 400 sin tocar la API externa", async () => {
    vi.stubEnv("WEATHER_API_KEY", FAKE_KEY);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const { GET } = await import("@/app/api/weather/current/route");
    const response = await GET(makeRequest("/api/weather/current?lat=95&lon=-58.4"));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("mapea la respuesta de WeatherAPI sin filtrar la API key", async () => {
    vi.stubEnv("WEATHER_API_KEY", FAKE_KEY);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(waCurrentPayload), { status: 200 })),
    );

    const { GET } = await import("@/app/api/weather/current/route");
    const response = await GET(makeRequest("/api/weather/current?lat=-34.6&lon=-58.4"));

    expect(response.status).toBe(200);
    const text = await response.text();
    // la key jamás aparece en la respuesta
    expect(text).not.toContain(FAKE_KEY);

    const body = JSON.parse(text);
    expect(body.tempC).toBe(12);
    expect(body.cloud).toBe(10);
    expect(body.location.tzId).toBe("America/Argentina/Buenos_Aires");
    // el ícono se normaliza a https
    expect(body.icon).toMatch(/^https:\/\//);
  });

  it("devuelve 502 saneado si WeatherAPI falla (sin datos internos)", async () => {
    vi.stubEnv("WEATHER_API_KEY", FAKE_KEY);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("upstream boom", { status: 500 })),
    );

    const { GET } = await import("@/app/api/weather/current/route");
    const response = await GET(makeRequest("/api/weather/current?lat=-20&lon=-50"));

    expect(response.status).toBe(502);
    const text = await response.text();
    expect(text).not.toContain(FAKE_KEY);
    expect(JSON.parse(text).code).toBe("UPSTREAM_ERROR");
  });

  it("encuentra barrios vía Nominatim (ej: Palermo, Buenos Aires)", async () => {
    vi.stubEnv("WEATHER_API_KEY", "");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: RequestInfo | URL) => {
        expect(String(url)).toContain("nominatim.openstreetmap.org");
        return new Response(
          JSON.stringify([
            {
              place_id: 101,
              lat: "-34.5889",
              lon: "-58.4306",
              name: "Palermo",
              display_name: "Palermo, Buenos Aires, Argentina",
              class: "boundary",
              type: "administrative",
              address: { suburb: "Palermo", city: "Buenos Aires", country: "Argentina" },
            },
            {
              place_id: 102,
              lat: "38.1157",
              lon: "13.3615",
              name: "Palermo",
              display_name: "Palermo, Sicilia, Italia",
              class: "boundary",
              type: "administrative",
              address: { city: "Palermo", state: "Sicilia", country: "Italia" },
            },
            {
              // resultados no geográficos se filtran (calles, comercios, etc.)
              place_id: 103,
              lat: "0",
              lon: "0",
              name: "Palermo Bar",
              display_name: "Palermo Bar, Otra Parte",
              class: "amenity",
              type: "bar",
            },
          ]),
          { status: 200 },
        );
      }),
    );

    const { GET } = await import("@/app/api/weather/search/route");
    const response = await GET(makeRequest("/api/weather/search?q=Palermo"));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toHaveLength(2);
    expect(body[0]).toMatchObject({
      name: "Palermo",
      region: "Buenos Aires",
      country: "Argentina",
      lat: -34.5889,
      lon: -58.4306,
    });
  });

  it("aplica rate limiting y responde 429 con Retry-After", async () => {
    vi.stubEnv("WEATHER_API_KEY", FAKE_KEY);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(waCurrentPayload), { status: 200 })),
    );

    const { GET } = await import("@/app/api/weather/current/route");
    let lastStatus = 200;
    for (let i = 0; i < 40; i++) {
      const response = await GET(makeRequest("/api/weather/current?lat=-34.6&lon=-58.4"));
      lastStatus = response.status;
      if (lastStatus === 429) {
        expect(response.headers.get("Retry-After")).toBeTruthy();
        break;
      }
    }
    expect(lastStatus).toBe(429);
  });
});
