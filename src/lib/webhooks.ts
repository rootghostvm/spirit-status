import { BRAND_NAME, SITE_URL } from "./config";
import type {
  WebhookEvent,
  WebhookEventFlags,
  WebhookEventType,
  WebhookSettings,
} from "./types";

const DISCORD_WEBHOOK_RE =
  /^https:\/\/(?:discord|discordapp)\.com\/api\/webhooks\/\d+\/[\w.-]+$/i;

const BRAND_ICON = `${SITE_URL}/favicon.ico`;

export const DEFAULT_WEBHOOK_EVENTS: WebhookEventFlags = {
  incidentOpened: true,
  incidentUpdated: true,
  incidentResolved: true,
  maintenanceChanged: true,
  noticeChanged: true,
};

const EVENT_META: Record<
  WebhookEventType,
  { label: string; color: number; accent: string }
> = {
  "incident.opened": {
    label: "Incident opened",
    color: 0xdc2626,
    accent: "Outage",
  },
  "incident.updated": {
    label: "Incident update",
    color: 0xd97706,
    accent: "Update",
  },
  "incident.resolved": {
    label: "Recovered",
    color: 0x16a34a,
    accent: "Online",
  },
  "maintenance.changed": {
    label: "Maintenance",
    color: 0x2563eb,
    accent: "Maintenance",
  },
  "notice.changed": {
    label: "Notice",
    color: 0x475569,
    accent: "Notice",
  },
};

export function defaultWebhookSettings(): WebhookSettings {
  return {
    enabled: false,
    url: "",
    events: { ...DEFAULT_WEBHOOK_EVENTS },
  };
}

export function normalizeWebhookSettings(raw: unknown): WebhookSettings {
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

function clip(value: string, max: number) {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function code(value: string) {
  const safe = value.replace(/`/g, "'").trim() || "—";
  return `\`${clip(safe, 100)}\``;
}

function discordTime(iso: string, style: "F" | "R" | "f" = "f") {
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) return iso;
  const unix = Math.floor(ms / 1000);
  return `<t:${unix}:${style}>`;
}

function formatDuration(startedAt: string, endedAt: string) {
  const start = new Date(startedAt).getTime();
  const end = new Date(endedAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return null;
  }
  const mins = Math.round((end - start) / 60_000);
  if (mins < 1) return "< 1 min";
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  if (hours < 48) return rem ? `${hours}h ${rem}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remH = hours % 24;
  return remH ? `${days}d ${remH}h` : `${days}d`;
}

function statusLabel(status: string) {
  switch (status) {
    case "down":
      return "Down";
    case "degraded":
      return "Degraded";
    case "operational":
      return "Operational";
    case "investigating":
      return "Investigating";
    case "identified":
      return "Identified";
    case "monitoring":
      return "Monitoring";
    case "resolved":
      return "Resolved";
    case "update":
      return "Update";
    default:
      return status;
  }
}

function field(
  name: string,
  value: string,
  inline = true,
): { name: string; value: string; inline: boolean } {
  return { name, value: clip(value, 1024) || "—", inline };
}

export function incidentOpenedEvent(input: {
  serviceName: string;
  status: "degraded" | "down";
  message: string;
  source: "auto" | "manual";
  group?: string;
}): WebhookEvent {
  const severity = input.status === "down" ? "Outage" : "Degradation";
  return {
    type: "incident.opened",
    content: `**${severity}** · ${input.serviceName}`,
    title: `${input.serviceName} is ${statusLabel(input.status).toLowerCase()}`,
    description: clip(input.message, 1800),
    color: input.status === "down" ? 0xdc2626 : 0xd97706,
    fields: [
      field("Status", code(statusLabel(input.status))),
      field("Source", code(input.source === "auto" ? "Monitor" : "Manual")),
      ...(input.group ? [field("Group", code(input.group))] : []),
      field("Status page", `[Open status page](${SITE_URL})`, false),
    ],
  };
}

export function incidentUpdatedEvent(input: {
  serviceName: string;
  status: string;
  message: string;
  previousStatus?: string;
}): WebhookEvent {
  return {
    type: "incident.updated",
    content: `**Update** · ${input.serviceName}`,
    title: `${input.serviceName} — ${statusLabel(input.status)}`,
    description: clip(input.message, 1800),
    fields: [
      field("Status", code(statusLabel(input.status))),
      ...(input.previousStatus
        ? [
            field(
              "Was",
              code(statusLabel(input.previousStatus)),
            ),
          ]
        : []),
      field("Service", code(input.serviceName)),
      field("Status page", `[Open status page](${SITE_URL})`, false),
    ],
  };
}

export function incidentResolvedEvent(input: {
  serviceName: string;
  message?: string;
  startedAt?: string;
  resolvedAt?: string;
  reason?: string;
}): WebhookEvent {
  const resolvedAt = input.resolvedAt ?? new Date().toISOString();
  const duration =
    input.startedAt != null
      ? formatDuration(input.startedAt, resolvedAt)
      : null;

  return {
    type: "incident.resolved",
    content: `**Online** · ${input.serviceName} recovered`,
    title: `${input.serviceName} is operational`,
    description: clip(
      input.message || `${input.serviceName} is operational again.`,
      1800,
    ),
    fields: [
      field("Status", code("Operational")),
      ...(duration ? [field("Duration", code(duration))] : []),
      ...(input.reason ? [field("Note", input.reason, false)] : []),
      ...(input.startedAt
        ? [field("Started", discordTime(input.startedAt, "f"))]
        : []),
      field("Resolved", discordTime(resolvedAt, "R")),
      field("Status page", `[Open status page](${SITE_URL})`, false),
    ],
  };
}

export function maintenanceEvent(input: {
  action: "scheduled" | "updated" | "removed";
  title: string;
  message?: string;
  startsAt?: string;
  endsAt?: string;
  scope?: string;
}): WebhookEvent {
  const actionLabel =
    input.action === "scheduled"
      ? "Scheduled"
      : input.action === "updated"
        ? "Updated"
        : "Removed";

  const fields = [
    field("Action", code(actionLabel)),
    ...(input.startsAt
      ? [field("Starts", `${discordTime(input.startsAt, "f")}\n${discordTime(input.startsAt, "R")}`)]
      : []),
    ...(input.endsAt
      ? [field("Ends", `${discordTime(input.endsAt, "f")}\n${discordTime(input.endsAt, "R")}`)]
      : []),
    ...(input.scope ? [field("Scope", code(input.scope))] : []),
    field("Status page", `[Open status page](${SITE_URL})`, false),
  ];

  return {
    type: "maintenance.changed",
    content: `**Maintenance ${actionLabel.toLowerCase()}** · ${input.title}`,
    title: input.title,
    description: clip(
      input.message ||
        (input.action === "removed"
          ? "This maintenance window was removed."
          : "A maintenance window was changed on the status page."),
      1800,
    ),
    fields,
  };
}

export function noticeEvent(input: {
  action: "published" | "saved" | "cleared";
  message?: string;
  tone?: "info" | "warn";
  enabled?: boolean;
}): WebhookEvent {
  if (input.action === "cleared") {
    return {
      type: "notice.changed",
      content: "**Notice cleared**",
      title: "Public notice removed",
      description: "The banner on the status page was cleared.",
      fields: [field("Status page", `[Open status page](${SITE_URL})`, false)],
    };
  }

  const visible = input.enabled ? "Visible" : "Hidden";
  return {
    type: "notice.changed",
    content:
      input.action === "published"
        ? "**Notice published**"
        : "**Notice saved**",
    title:
      input.action === "published"
        ? "Public notice is live"
        : "Notice saved (not visible)",
    description: clip(input.message || "—", 1800),
    color: input.tone === "warn" ? 0xd97706 : 0x475569,
    fields: [
      field("Tone", code(input.tone === "warn" ? "Warning" : "Info")),
      field("Visibility", code(visible)),
      field("Status page", `[Open status page](${SITE_URL})`, false),
    ],
  };
}

function toDiscordEmbed(event: WebhookEvent) {
  const meta = EVENT_META[event.type];
  const color = event.color ?? meta.color;

  return {
    author: {
      name: `${BRAND_NAME} · ${meta.label}`,
      url: SITE_URL,
      icon_url: BRAND_ICON,
    },
    title: clip(event.title, 256),
    description: event.description
      ? clip(event.description, 4096)
      : undefined,
    color,
    fields: (event.fields ?? []).slice(0, 25).map((item) => ({
      name: clip(item.name, 256),
      value: clip(item.value, 1024),
      inline: item.inline ?? false,
    })),
    url: SITE_URL,
    footer: {
      text: `${BRAND_NAME} Status`,
      icon_url: BRAND_ICON,
    },
    timestamp: new Date().toISOString(),
  };
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
        avatar_url: BRAND_ICON,
        content: event.content ? clip(event.content, 2000) : undefined,
        allowed_mentions: { parse: [] },
        embeds: [toDiscordEmbed(event)],
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
    content: "**Test alert** · webhook connected",
    title: "Discord alerts are working",
    description: `You’ll receive embeds here when ${BRAND_NAME} services go down, recover, or when maintenance and notices change.`,
    color: 0x2563eb,
    fields: [
      field("Brand", code(BRAND_NAME)),
      field("Events", code("Incidents · Maintenance · Notices")),
      field("Status page", `[Open status page](${SITE_URL})`, false),
    ],
  };
}
