import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { adminErrorResponse } from "@/lib/api";
import { readStore, setAnnouncement } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const store = await readStore();
  return NextResponse.json(
    { announcement: store.announcement },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function PUT(request: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    message?: string;
    tone?: "info" | "warn";
    enabled?: boolean;
    clear?: boolean;
  } | null;

  if (!body) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  try {
    if (body.clear) {
      await setAnnouncement(null);
      return NextResponse.json({ announcement: null });
    }

    if (!body.message?.trim()) {
      return NextResponse.json(
        { error: "Message is required (or use Delete)" },
        { status: 400 },
      );
    }

    const announcement = await setAnnouncement({
      message: body.message,
      tone: body.tone,
      enabled: body.enabled,
    });

    return NextResponse.json({ announcement });
  } catch (error) {
    return adminErrorResponse(error, "Could not save announcement");
  }
}

export async function DELETE() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await setAnnouncement(null);
    return NextResponse.json({ announcement: null, ok: true });
  } catch (error) {
    return adminErrorResponse(error, "Could not delete notice");
  }
}
