import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { createManualIncident, readStore } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const store = await readStore();
  return NextResponse.json({ incidents: store.incidents });
}

export async function POST(request: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    title?: string;
    message?: string;
    status?: "degraded" | "down";
    serviceIds?: string[];
  } | null;

  if (!body?.title?.trim()) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  const incident = await createManualIncident({
    title: body.title,
    message: body.message || body.title,
    status: body.status,
    serviceIds: body.serviceIds,
  });

  return NextResponse.json({ incident }, { status: 201 });
}
