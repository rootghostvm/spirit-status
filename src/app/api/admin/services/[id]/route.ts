import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { deleteService, updateService } from "@/lib/store";
import { runChecks } from "@/lib/checker";
import { ensureHttpsUrl } from "@/lib/format";
import type { CheckMethod } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = (await request.json().catch(() => null)) as {
    name?: string;
    url?: string;
    description?: string;
    group?: string;
    enabled?: boolean;
    method?: CheckMethod;
    expectedStatusCodes?: number[];
    sortOrder?: number;
  } | null;

  if (!body) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const patch = { ...body };
  if (patch.url) {
    patch.url = ensureHttpsUrl(patch.url);
    try {
      new URL(patch.url);
    } catch {
      return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
    }
  }

  const service = await updateService(id, patch);
  if (!service) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (service.enabled) void runChecks([service.id]);
  return NextResponse.json({ service });
}

export async function DELETE(_request: Request, { params }: Params) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const removed = await deleteService(id);
  if (!removed) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
