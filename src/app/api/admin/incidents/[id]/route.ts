import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { adminErrorResponse } from "@/lib/api";
import {
  addIncidentUpdate,
  deleteIncident,
  resolveIncident,
} from "@/lib/store";
import type { IncidentUpdateStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as {
    message?: string;
    status?: IncidentUpdateStatus;
    resolve?: boolean;
  } | null;

  if (!body) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  try {
    if (body.resolve) {
      const incident = await resolveIncident(id, body.message);
      if (!incident) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      return NextResponse.json({ incident });
    }

    if (!body.message?.trim() || !body.status) {
      return NextResponse.json(
        { error: "Message and status are required" },
        { status: 400 },
      );
    }

    const incident = await addIncidentUpdate(id, {
      message: body.message,
      status: body.status,
    });

    if (!incident) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ incident });
  } catch (error) {
    return adminErrorResponse(error, "Could not update incident");
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  try {
    const removed = await deleteIncident(id);
    if (!removed) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return adminErrorResponse(error, "Could not delete incident");
  }
}
