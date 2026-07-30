import { NextResponse } from "next/server";
import { getPublicStatus, startMonitor } from "@/lib/checker";

export const dynamic = "force-dynamic";

export async function GET() {
  startMonitor();
  const status = await getPublicStatus();
  return NextResponse.json(status);
}
