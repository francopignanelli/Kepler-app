import { NextResponse } from "next/server";
import { guardRequest, handleRouteError } from "@/server/http";
import { getStationTrack } from "@/server/iss";
import { trackQuerySchema } from "@/schemas";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const guard = guardRequest(request, trackQuerySchema, {
    bucket: "iss-track",
    limitPerMinute: 30,
  });
  if (!guard.ok) return guard.response;

  try {
    const { sat, pastMin, futureMin, stepSec } = guard.data;
    const track = await getStationTrack(sat, pastMin, futureMin, stepSec);
    return NextResponse.json(track, {
      headers: { "Cache-Control": "public, max-age=120" },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
