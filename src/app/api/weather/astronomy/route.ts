import { NextResponse } from "next/server";
import { astronomyQuerySchema } from "@/schemas";
import { apiError, guardRequest, handleRouteError } from "@/server/http";
import { getAstronomy, MissingApiKeyError } from "@/server/weather";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const guard = guardRequest(request, astronomyQuerySchema, {
    bucket: "weather-astronomy",
    limitPerMinute: 30,
  });
  if (!guard.ok) return guard.response;

  try {
    const { lat, lon, date } = guard.data;
    const astro = await getAstronomy(lat, lon, date);
    return NextResponse.json(astro, {
      headers: { "Cache-Control": "public, max-age=3600" },
    });
  } catch (err) {
    if (err instanceof MissingApiKeyError) {
      return apiError(503, "MISSING_API_KEY", "El servicio de clima no está configurado (WEATHER_API_KEY)");
    }
    return handleRouteError(err);
  }
}
