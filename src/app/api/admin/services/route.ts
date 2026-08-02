import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { adminErrorResponse } from "@/lib/api";
import { createService, publicWebhookView, readStore } from "@/lib/store";
import { runChecks, startMonitor } from "@/lib/checker";
import { assertSafeProbeUrl } from "@/lib/format";
import type { CheckMethod } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  startMonitor();
  const store = await readStore();
  return NextResponse.json(
    {
      services: [...store.services].sort(
        (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
      ),
      latest: store.latest,
      incidents: store.incidents.slice(0, 40),
      maintenances: store.maintenances,
      announcement: store.announcement,
      webhook: publicWebhookView(store.webhook),
      lastCheckAt: store.lastCheckAt,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    name?: string;
    url?: string;
    description?: string;
    group?: string;
    enabled?: boolean;
    method?: CheckMethod;
    expectedStatusCodes?: number[];
  } | null;

  if (!body?.name?.trim() || !body?.url?.trim()) {
    return NextResponse.json(
      { error: "Name and URL are required" },
      { status: 400 },
    );
  }

  let url: string;
  try {
    url = assertSafeProbeUrl(body.url);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid URL" },
      { status: 400 },
    );
  }

  try {
    const service = await createService({
      name: body.name,
      url,
      description: body.description,
      group: body.group,
      enabled: body.enabled,
      method: body.method,
      expectedStatusCodes: body.expectedStatusCodes,
    });

    await runChecks([service.id]);
    const store = await readStore();
    return NextResponse.json(
      {
        service,
        services: store.services,
        latest: store.latest,
      },
      { status: 201 },
    );
  } catch (error) {
    return adminErrorResponse(error, "Could not create service");
  }
}
