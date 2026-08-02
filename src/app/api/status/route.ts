import { NextResponse } from "next/server";
import { getPublicStatus, startMonitor } from "@/lib/checker";

export const dynamic = "force-dynamic";

const NO_STORE = {
  "Cache-Control": "no-store, max-age=0, must-revalidate",
};

export async function GET() {
  try {
    startMonitor();
    const status = await getPublicStatus();
    return NextResponse.json(status, { headers: NO_STORE });
  } catch (error) {
    console.error("[spirit-status] /api/status failed", error);
    return NextResponse.json(
      { error: "Status unavailable" },
      { status: 503, headers: NO_STORE },
    );
  }
}
