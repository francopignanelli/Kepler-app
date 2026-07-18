import { NextResponse } from "next/server";
import { stationPositionQuerySchema } from "@/schemas";
import { guardRequest, handleRouteError } from "@/server/http";
import { getStationPosition } from "@/server/iss";

export const dynamic = "force-dynamic";
/** posición + TLE para az/el pueden sumar varios segundos en frío */
export const maxDuration = 15;

export async function GET(request: Request) {
  const guard = guardRequest(request, stationPositionQuerySchema, {
    bucket: "iss-position",
    limitPerMinute: 120,
  });
  if (!guard.ok) return guard.response;

  try {
    const { sat, lat, lon } = guard.data;
    const observer = lat !== undefined && lon !== undefined ? { lat, lon } : undefined;
    const position = await getStationPosition(sat, observer);
    return NextResponse.json(position, {
      headers: { "Cache-Control": "public, max-age=3" },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
