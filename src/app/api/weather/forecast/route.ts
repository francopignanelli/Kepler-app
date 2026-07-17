import { NextResponse } from "next/server";
import { forecastQuerySchema } from "@/schemas";
import { apiError, guardRequest, handleRouteError } from "@/server/http";
import { getForecast, MissingApiKeyError } from "@/server/weather";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const guard = guardRequest(request, forecastQuerySchema, {
    bucket: "weather-forecast",
    limitPerMinute: 20,
  });
  if (!guard.ok) return guard.response;

  try {
    const { lat, lon, days } = guard.data;
    const forecast = await getForecast(lat, lon, days);
    return NextResponse.json(forecast, {
      headers: { "Cache-Control": "public, max-age=300" },
    });
  } catch (err) {
    if (err instanceof MissingApiKeyError) {
      return apiError(503, "MISSING_API_KEY", "El servicio de clima no está configurado (WEATHER_API_KEY)");
    }
    return handleRouteError(err);
  }
}
