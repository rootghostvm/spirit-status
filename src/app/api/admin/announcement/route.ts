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

  if (!body) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  try {
    // Explicit clear, or empty message treated as clear.
    if (body.clear || !body.message?.trim()) {
      await setAnnouncement(null);
      return NextResponse.json({ announcement: null });
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
