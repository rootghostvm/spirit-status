import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { adminErrorResponse } from "@/lib/api";
import { createMaintenance, readStore } from "@/lib/store";
import { maintenancePhase } from "@/lib/maintenance";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const store = await readStore();
  return NextResponse.json({
    maintenances: store.maintenances.map((m) => ({
      ...m,
      phase: maintenancePhase(m),
    })),
  });
}

export async function POST(request: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    title?: string;
    message?: string;
    startsAt?: string;
    endsAt?: string;
    serviceIds?: string[];
  } | null;

  if (!body?.title?.trim() || !body?.startsAt || !body?.endsAt) {
    return NextResponse.json(
      { error: "Title, start, and end are required" },
      { status: 400 },
    );
  }

  try {
    const maintenance = await createMaintenance({
      title: body.title,
      message: body.message,
      startsAt: body.startsAt,
      endsAt: body.endsAt,
      serviceIds: body.serviceIds ?? [],
    });
    return NextResponse.json({ maintenance }, { status: 201 });
  } catch (error) {
    return adminErrorResponse(error, "Could not create maintenance");
  }
}
