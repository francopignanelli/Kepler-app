import { NextResponse } from "next/server";
import { guardRequest, handleRouteError } from "@/server/http";
import { getEnrichedPasses } from "@/server/passes";
import { passesQuerySchema } from "@/schemas";

export const dynamic = "force-dynamic";
/** el barrido SGP4 de 3 días puede tardar >1 s en frío */
export const maxDuration = 30;

export async function GET(request: Request) {
  const guard = guardRequest(request, passesQuerySchema, {
    bucket: "passes",
    limitPerMinute: 20,
  });
  if (!guard.ok) return guard.response;

  try {
    const { lat, lon, days, minElevation } = guard.data;
    const passes = await getEnrichedPasses(lat, lon, days, minElevation);
    return NextResponse.json(passes, {
      headers: { "Cache-Control": "public, max-age=300" },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
