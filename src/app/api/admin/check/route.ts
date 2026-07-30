import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getPublicStatus, runChecks, startMonitor } from "@/lib/checker";

export const dynamic = "force-dynamic";

export async function POST() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  startMonitor();
  const result = await runChecks();
  const status = await getPublicStatus();
  return NextResponse.json({
    ...status,
    check: result,
  });
}
