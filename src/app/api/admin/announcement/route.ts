import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { readStore, setAnnouncement } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const store = await readStore();
  return NextResponse.json({ announcement: store.announcement });
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

  if (!body || body.clear) {
    await setAnnouncement(null);
    return NextResponse.json({ announcement: null });
  }

  if (!body.message?.trim()) {
    return NextResponse.json({ error: "Message is required" }, { status: 400 });
  }

  const announcement = await setAnnouncement({
    message: body.message,
    tone: body.tone,
    enabled: body.enabled,
  });

  return NextResponse.json({ announcement });
}
