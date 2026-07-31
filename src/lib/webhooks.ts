import { BRAND_NAME, SITE_URL } from "./config";
import type {
  WebhookEvent,
  WebhookEventFlags,
  WebhookSettings,
} from "./types";

const DISCORD_WEBHOOK_RE =
  /^https:\/\/(?:discord|discordapp)\.com\/api\/webhooks\/\d+\/[\w.-]+$/i;

export const DEFAULT_WEBHOOK_EVENTS: WebhookEventFlags = {
  incidentOpened: true,
  incidentUpdated: true,
  incidentResolved: true,
  maintenanceChanged: true,
  noticeChanged: true,
};

export function defaultWebhookSettings(): WebhookSettings {
  return {
    enabled: false,
    url: "",
    events: { ...DEFAULT_WEBHOOK_EVENTS },
  };
}

export function normalizeWebhookSettings(
  raw: unknown,
): WebhookSettings {
  const base = defaultWebhookSettings();
  if (!raw || typeof raw !== "object") return base;
  const value = raw as Partial<WebhookSettings>;
  const eventsRaw =
    value.events && typeof value.events === "object" ? value.events : {};
  const events = eventsRaw as Partial<WebhookEventFlags>;
  return {
    enabled: Boolean(value.enabled),
    url: typeof value.url === "string" ? value.url.trim() : "",
    events: {
      incidentOpened: events.incidentOpened ?? true,
      incidentUpdated: events.incidentUpdated ?? true,
      incidentResolved: events.incidentResolved ?? true,
      maintenanceChanged: events.maintenanceChanged ?? true,
      noticeChanged: events.noticeChanged ?? true,
    },
  };
}

export function isDiscordWebhookUrl(url: string): boolean {
  return DISCORD_WEBHOOK_RE.test(url.trim());
}

export function assertDiscordWebhookUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) throw new Error("Webhook URL is required");
  if (!isDiscordWebhookUrl(trimmed)) {
    throw new Error(
      "URL must be a Discord webhook (https://discord.com/api/webhooks/...)",
    );
  }
  return trimmed;
}

export function maskWebhookUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "";
  const parts = trimmed.split("/");
  if (parts.length < 2) return "********";
  parts[parts.length - 1] = "********";
  return parts.join("/");
}

function eventAllowed(
  settings: WebhookSettings,
  type: WebhookEvent["type"],
): boolean {
  switch (type) {
    case "incident.opened":
      return settings.events.incidentOpened;
    case "incident.updated":
      return settings.events.incidentUpdated;
    case "incident.resolved":
      return settings.events.incidentResolved;
    case "maintenance.changed":
      return settings.events.maintenanceChanged;
    case "notice.changed":
      return settings.events.noticeChanged;
    default:
      return false;
  }
}

function embedColor(type: WebhookEvent["type"], override?: number): number {
  if (override != null) return override;
  switch (type) {
    case "incident.opened":
      return 0xe74c3c;
    case "incident.updated":
      return 0xf0a020;
    case "incident.resolved":
      return 0x2ecc71;
    case "maintenance.changed":
      return 0x3b82f6;
    case "notice.changed":
      return 0x64748b;
    default:
      return 0x94a3b8;
  }
}

async function postDiscordEmbed(
  url: string,
  event: WebhookEvent,
): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        username: `${BRAND_NAME} Status`,
        embeds: [
          {
            title: event.title.slice(0, 256),
            description: event.description.slice(0, 4096),
            color: embedColor(event.type, event.color),
            fields: (event.fields ?? []).slice(0, 25).map((field) => ({
              name: field.name.slice(0, 256),
              value: field.value.slice(0, 1024),
              inline: field.inline ?? false,
            })),
            url: SITE_URL,
            footer: { text: SITE_URL.replace(/^https?:\/\//, "") },
            timestamp: new Date().toISOString(),
          },
        ],
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(
        "[spirit-status] Discord webhook failed",
        res.status,
        text.slice(0, 200),
      );
    }
  } catch (error) {
    console.error("[spirit-status] Discord webhook error", error);
  } finally {
    clearTimeout(timeout);
  }
}

export async function dispatchWebhookEvents(
  settings: WebhookSettings,
  events: WebhookEvent[],
): Promise<void> {
  if (!settings.enabled || !settings.url || !events.length) return;
  if (!isDiscordWebhookUrl(settings.url)) return;

  const allowed = events.filter((event) => eventAllowed(settings, event.type));
  if (!allowed.length) return;

  // Send sequentially to avoid Discord rate limits on burst recoveries.
  for (const event of allowed) {
    await postDiscordEmbed(settings.url, event);
  }
}

export function queueWebhookEvents(
  settings: WebhookSettings,
  events: WebhookEvent[],
) {
  if (!events.length) return;
  void dispatchWebhookEvents(settings, events).catch((error) => {
    console.error("[spirit-status] webhook dispatch failed", error);
  });
}

export function testWebhookEvent(): WebhookEvent {
  return {
    type: "notice.changed",
    title: "Test alert",
    description: `Webhook connected for ${BRAND_NAME} status page.`,
    color: 0x3b82f6,
    fields: [
      { name: "Status page", value: SITE_URL, inline: false },
    ],
  };
}
