import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  publicWebhookView,
  readStore,
  setWebhookSettings,
} from "@/lib/store";
import {
  assertDiscordWebhookUrl,
  dispatchWebhookEvents,
  testWebhookEvent,
} from "@/lib/webhooks";
import type { WebhookEventFlags } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const store = await readStore();
  return NextResponse.json({ webhook: publicWebhookView(store.webhook) });
}

export async function PUT(request: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    enabled?: boolean;
    url?: string;
    clearUrl?: boolean;
    events?: Partial<WebhookEventFlags>;
  } | null;

  if (!body) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const store = await readStore();
  let url = store.webhook.url;
  let keepExistingUrl = true;

  if (body.clearUrl) {
    url = "";
    keepExistingUrl = false;
  } else if (typeof body.url === "string" && body.url.trim()) {
    const trimmed = body.url.trim();
    // Ignore masked placeholders from the UI.
    if (!trimmed.includes("********")) {
      try {
        url = assertDiscordWebhookUrl(trimmed);
        keepExistingUrl = false;
      } catch (error) {
        return NextResponse.json(
          {
            error:
              error instanceof Error ? error.message : "Invalid webhook URL",
          },
          { status: 400 },
        );
      }
    }
  }

  const webhook = await setWebhookSettings({
    enabled: body.enabled,
    url,
    keepExistingUrl,
    events: body.events,
  });

  return NextResponse.json({ webhook: publicWebhookView(webhook) });
}

export async function POST(request: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    url?: string;
  } | null;

  const store = await readStore();
  let url = store.webhook.url;

  if (typeof body?.url === "string" && body.url.trim() && !body.url.includes("********")) {
    try {
      url = assertDiscordWebhookUrl(body.url);
    } catch (error) {
      return NextResponse.json(
        {
          error: error instanceof Error ? error.message : "Invalid webhook URL",
        },
        { status: 400 },
      );
    }
  }

  if (!url) {
    return NextResponse.json(
      { error: "Save a Discord webhook URL first" },
      { status: 400 },
    );
  }

  await dispatchWebhookEvents(
    {
      enabled: true,
      url,
      events: store.webhook.events,
    },
    [testWebhookEvent()],
  );

  return NextResponse.json({ ok: true });
}
