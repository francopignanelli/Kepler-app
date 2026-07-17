import { NextResponse } from "next/server";
import { searchQuerySchema } from "@/schemas";
import { guardRequest, handleRouteError } from "@/server/http";
import { searchCity } from "@/server/weather";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const guard = guardRequest(request, searchQuerySchema, {
    bucket: "weather-search",
    limitPerMinute: 30,
  });
  if (!guard.ok) return guard.response;

  try {
    const { q, lat, lon } = guard.data;
    const near = lat !== undefined && lon !== undefined ? { lat, lon } : undefined;
    const results = await searchCity(q, near);
    return NextResponse.json(results, {
      headers: { "Cache-Control": "public, max-age=3600" },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
