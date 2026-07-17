import { NextResponse } from "next/server";
import { aboveQuerySchema } from "@/schemas";
import { apiError, guardRequest, handleRouteError } from "@/server/http";
import { getSatellitesAbove } from "@/server/n2yo";
import { MissingApiKeyError } from "@/server/weather";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const guard = guardRequest(request, aboveQuerySchema, {
    bucket: "satellites-above",
    limitPerMinute: 30,
  });
  if (!guard.ok) return guard.response;

  try {
    const { lat, lon, category, radius } = guard.data;
    const above = await getSatellitesAbove(lat, lon, category, radius);
    return NextResponse.json(above, {
      headers: { "Cache-Control": "public, max-age=30" },
    });
  } catch (err) {
    if (err instanceof MissingApiKeyError) {
      return apiError(503, "MISSING_API_KEY", "El explorador de satélites no está configurado (N2YO_API_KEY)");
    }
    return handleRouteError(err);
  }
}
