import { NextResponse } from "next/server";
import { coordsQuerySchema } from "@/schemas";
import { guardRequest, handleRouteError } from "@/server/http";
import { getTimezoneForCoords } from "@/server/iss";
import { getTimezone, MissingApiKeyError } from "@/server/weather";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const guard = guardRequest(request, coordsQuerySchema, {
    bucket: "weather-timezone",
    limitPerMinute: 30,
  });
  if (!guard.ok) return guard.response;

  try {
    const { lat, lon } = guard.data;
    try {
      const tz = await getTimezone(lat, lon);
      return NextResponse.json(tz, { headers: { "Cache-Control": "public, max-age=86400" } });
    } catch (err) {
      if (!(err instanceof MissingApiKeyError)) throw err;
      // sin WeatherAPI key: resolver timezone vía WhereTheISS.at
      const tzId = await getTimezoneForCoords(lat, lon);
      return NextResponse.json(
        { tzId, localtimeEpoch: Math.floor(Date.now() / 1000) },
        { headers: { "Cache-Control": "public, max-age=86400" } },
      );
    }
  } catch (err) {
    return handleRouteError(err);
  }
}
