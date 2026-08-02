import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { adminErrorResponse } from "@/lib/api";
import { getPublicStatus, runChecks, startMonitor } from "@/lib/checker";

export const dynamic = "force-dynamic";

export async function POST() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    startMonitor();
    const result = await runChecks();
    const status = await getPublicStatus();
    return NextResponse.json(
      {
        ...status,
        check: result,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return adminErrorResponse(error, "Check failed");
  }
}
