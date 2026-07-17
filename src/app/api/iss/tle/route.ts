import { NextResponse } from "next/server";
import { z } from "zod";
import { stationIdSchema } from "@/schemas";
import { guardRequest, handleRouteError } from "@/server/http";
import { getStationTle } from "@/server/iss";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const guard = guardRequest(request, z.object({ sat: stationIdSchema }), {
    bucket: "iss-tle",
    limitPerMinute: 30,
  });
  if (!guard.ok) return guard.response;

  try {
    const tle = await getStationTle(guard.data.sat);
    return NextResponse.json(tle, {
      headers: { "Cache-Control": "public, max-age=3600" },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
