import { NextResponse } from "next/server";
import { coordsQuerySchema } from "@/schemas";
import { apiError, guardRequest, handleRouteError } from "@/server/http";
import { getCurrent, MissingApiKeyError } from "@/server/weather";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const guard = guardRequest(request, coordsQuerySchema, {
    bucket: "weather-current",
    limitPerMinute: 30,
  });
  if (!guard.ok) return guard.response;

  try {
    const { lat, lon } = guard.data;
    const current = await getCurrent(lat, lon);
    return NextResponse.json(current, {
      headers: { "Cache-Control": "public, max-age=120" },
    });
  } catch (err) {
    if (err instanceof MissingApiKeyError) {
      return apiError(503, "MISSING_API_KEY", "El servicio de clima no está configurado (WEATHER_API_KEY)");
    }
    return handleRouteError(err);
  }
}
