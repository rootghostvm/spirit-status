import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type {
  Announcement,
  CheckResult,
  CheckMethod,
  DayBucket,
  Incident,
  IncidentUpdate,
  IncidentUpdateStatus,
  Maintenance,
  Service,
  StoreData,
  WebhookEvent,
  WebhookEventFlags,
  WebhookSettings,
} from "./types";
import {
  DAILY_LIMIT,
  HISTORY_LIMIT,
  INCIDENT_LIMIT,
  MAINTENANCE_LIMIT,
  STORE_VERSION,
} from "./config";
import { dateKey } from "./format";
import { isServiceUnderMaintenance } from "./maintenance";
import { isR2Configured, readR2Object, writeR2Object } from "./r2";
import {
  defaultWebhookSettings,
  maskWebhookUrl,
  normalizeWebhookSettings,
  queueWebhookEvents,
} from "./webhooks";

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(process.cwd(), "data");
const STORE_PATH = path.join(DATA_DIR, "store.json");

function defaultStore(): StoreData {
  return {
    version: STORE_VERSION,
    services: [],
    latest: {},
    history: {},
    daily: {},
    incidents: [],
    maintenances: [],
    announcement: null,
    webhook: defaultWebhookSettings(),
    lastCheckAt: null,
  };
}

function normalizeService(raw: Partial<Service>, index: number): Service {
  const now = new Date().toISOString();
  return {
    id: raw.id || randomUUID(),
    name: (raw.name || "Untitled").trim(),
    url: (raw.url || "https://example.com").trim(),
    description: (raw.description || "").trim(),
    group: (raw.group || "General").trim() || "General",
    sortOrder: typeof raw.sortOrder === "number" ? raw.sortOrder : index,
    enabled: raw.enabled ?? true,
    method: raw.method === "HEAD" ? "HEAD" : "GET",
    expectedStatusCodes: Array.isArray(raw.expectedStatusCodes)
      ? raw.expectedStatusCodes.filter((n) => Number.isFinite(n))
      : [],
    createdAt: raw.createdAt || now,
    updatedAt: raw.updatedAt || now,
  };
}

function normalizeDayBucket(raw: Partial<DayBucket>): DayBucket {
  return {
    date: raw.date || "",
    operational: raw.operational ?? 0,
    degraded: raw.degraded ?? 0,
    down: raw.down ?? 0,
    unknown: raw.unknown ?? 0,
    maintenance: raw.maintenance ?? 0,
  };
}

function normalizeStore(raw: Partial<StoreData> & Record<string, unknown>): StoreData {
  const services = Array.isArray(raw.services)
    ? raw.services.map((s, i) => normalizeService(s as Partial<Service>, i))
    : [];

  const history = (raw.history as StoreData["history"]) ?? {};
  let daily = (raw.daily as StoreData["daily"]) ?? {};

  // Backfill daily buckets from detailed history when missing.
  if (!raw.daily || Object.keys(daily).length === 0) {
    daily = {};
    for (const [serviceId, checks] of Object.entries(history)) {
      let buckets: DayBucket[] = [];
      for (const check of checks) {
        buckets = bumpDaily(buckets, check.status, check.checkedAt);
      }
      daily[serviceId] = buckets;
    }
  } else {
    daily = Object.fromEntries(
      Object.entries(daily).map(([id, buckets]) => [
        id,
        (buckets ?? []).map((b) => normalizeDayBucket(b)),
      ]),
    );
  }

  return {
    version: STORE_VERSION,
    services,
    latest: (raw.latest as StoreData["latest"]) ?? {},
    history,
    daily,
    incidents: Array.isArray(raw.incidents)
      ? (raw.incidents as Partial<Incident>[]).map(normalizeIncident)
      : [],
    maintenances: Array.isArray(raw.maintenances)
      ? (raw.maintenances as Maintenance[]).map(normalizeMaintenance)
      : [],
    announcement: normalizeAnnouncement(raw.announcement),
    webhook: normalizeWebhookSettings(raw.webhook),
    lastCheckAt: (raw.lastCheckAt as string | null) ?? null,
  };
}

function normalizeIncident(raw: Partial<Incident>): Incident {
  const now = new Date().toISOString();
  const serviceId = raw.serviceId ?? null;
  const serviceIds = Array.isArray(raw.serviceIds)
    ? raw.serviceIds
    : serviceId
      ? [serviceId]
      : [];

  return {
    id: raw.id || randomUUID(),
    serviceId,
    serviceIds,
    serviceName: (raw.serviceName || "Service").trim(),
    status: raw.status === "degraded" ? "degraded" : "down",
    startedAt: raw.startedAt || now,
    resolvedAt: raw.resolvedAt ?? null,
    message: (raw.message || "").trim(),
    source: raw.source === "manual" ? "manual" : "auto",
    updates: Array.isArray(raw.updates)
      ? raw.updates.map((u) => ({
          id: u.id || randomUUID(),
          at: u.at || now,
          status: u.status || "update",
          message: (u.message || "").trim(),
        }))
      : [],
  };
}

function normalizeAnnouncement(
  raw: unknown,
): Announcement | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Partial<Announcement>;
  if (!value.message?.trim()) return null;
  return {
    enabled: value.enabled ?? false,
    message: value.message.trim(),
    tone: value.tone === "warn" ? "warn" : "info",
    updatedAt: value.updatedAt || new Date().toISOString(),
  };
}

function normalizeMaintenance(raw: Partial<Maintenance>): Maintenance {
  const now = new Date().toISOString();
  return {
    id: raw.id || randomUUID(),
    title: (raw.title || "Scheduled maintenance").trim(),
    message: (raw.message || "").trim(),
    startsAt: raw.startsAt || now,
    endsAt: raw.endsAt || now,
    serviceIds: Array.isArray(raw.serviceIds) ? raw.serviceIds : [],
    createdAt: raw.createdAt || now,
    updatedAt: raw.updatedAt || now,
  };
}

let writeQueue: Promise<void> = Promise.resolve();
let memoryStore: StoreData | null = null;
let r2FlushTimer: ReturnType<typeof setTimeout> | null = null;
let r2Dirty = false;

async function loadFromLocalFile(): Promise<StoreData | null> {
  try {
    const raw = await fs.readFile(STORE_PATH, "utf8");
    return normalizeStore(JSON.parse(raw) as Partial<StoreData>);
  } catch {
    return null;
  }
}

async function flushR2() {
  if (!isR2Configured() || !memoryStore || !r2Dirty) return;
  r2Dirty = false;
  await writeR2Object(JSON.stringify(memoryStore, null, 2));
}

function scheduleR2Flush() {
  if (r2FlushTimer) return;
  r2FlushTimer = setTimeout(() => {
    r2FlushTimer = null;
    void flushR2().catch((error) => {
      console.error("[spirit-status] R2 flush failed", error);
      r2Dirty = true;
      scheduleR2Flush();
    });
  }, 1_500);
}

export async function flushStoreNow() {
  if (r2FlushTimer) {
    clearTimeout(r2FlushTimer);
    r2FlushTimer = null;
  }
  try {
    await flushR2();
  } catch (error) {
    console.error("[spirit-status] R2 flush failed", error);
    r2Dirty = true;
    scheduleR2Flush();
  }
}

async function ensureStore(): Promise<StoreData> {
  if (memoryStore) return memoryStore;

  let loaded: StoreData | null = null;

  if (isR2Configured()) {
    const raw = await readR2Object();
    if (raw) {
      loaded = normalizeStore(JSON.parse(raw) as Partial<StoreData>);
    }
  } else {
    loaded = await loadFromLocalFile();
  }

  if (!loaded) {
    loaded = defaultStore();
    await persist(loaded);
    return loaded;
  }

  memoryStore = loaded;
  if (
    loaded.version !== STORE_VERSION ||
    !("daily" in loaded) ||
    !("incidents" in loaded) ||
    !("maintenances" in loaded) ||
    !("announcement" in loaded) ||
    !("webhook" in loaded)
  ) {
    await persist(loaded);
  }
  return loaded;
}

async function persist(store: StoreData) {
  memoryStore = store;
  const body = JSON.stringify(store, null, 2);

  if (isR2Configured()) {
    r2Dirty = true;
    scheduleR2Flush();
    return;
  }

  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = `${STORE_PATH}.tmp`;
  await fs.writeFile(tmp, body, "utf8");
  try {
    await fs.rename(tmp, STORE_PATH);
  } catch {
    await fs.copyFile(tmp, STORE_PATH);
    await fs.unlink(tmp).catch(() => undefined);
  }
}

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeQueue.then(fn, fn);
  writeQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export async function readStore(): Promise<StoreData> {
  return enqueue(() => ensureStore());
}

export async function updateStore(
  mutator: (store: StoreData) => void | Promise<void>,
): Promise<StoreData> {
  return enqueue(async () => {
    const store = await ensureStore();
    await mutator(store);
    await persist(store);
    // Durably flush R2 immediately so admin edits survive free-tier freezes.
    if (isR2Configured()) {
      await flushStoreNow();
    }
    try {
      const { invalidateStatusCache } = await import("./checker");
      invalidateStatusCache();
    } catch {
      // ignore circular-init edge during boot
    }
    return store;
  });
}

export type ServiceInput = {
  name: string;
  url: string;
  description?: string;
  group?: string;
  enabled?: boolean;
  method?: CheckMethod;
  expectedStatusCodes?: number[];
  sortOrder?: number;
};

export async function createService(input: ServiceInput): Promise<Service> {
  const now = new Date().toISOString();
  let created!: Service;

  await updateStore((store) => {
    const maxOrder = store.services.reduce(
      (max, s) => Math.max(max, s.sortOrder),
      -1,
    );
    created = {
      id: randomUUID(),
      name: input.name.trim(),
      url: input.url.trim(),
      description: (input.description ?? "").trim(),
      group: (input.group ?? "General").trim() || "General",
      sortOrder: input.sortOrder ?? maxOrder + 1,
      enabled: input.enabled ?? true,
      method: input.method === "HEAD" ? "HEAD" : "GET",
      expectedStatusCodes: input.expectedStatusCodes ?? [],
      createdAt: now,
      updatedAt: now,
    };
    store.services.push(created);
  });

  return created;
}

export async function updateService(
  id: string,
  patch: Partial<ServiceInput>,
): Promise<Service | null> {
  let updated: Service | null = null;

  await updateStore((store) => {
    const service = store.services.find((s) => s.id === id);
    if (!service) return;
    if (patch.name !== undefined) service.name = patch.name.trim();
    if (patch.url !== undefined) service.url = patch.url.trim();
    if (patch.description !== undefined)
      service.description = patch.description.trim();
    if (patch.group !== undefined)
      service.group = patch.group.trim() || "General";
    if (patch.enabled !== undefined) service.enabled = patch.enabled;
    if (patch.method !== undefined)
      service.method = patch.method === "HEAD" ? "HEAD" : "GET";
    if (patch.expectedStatusCodes !== undefined)
      service.expectedStatusCodes = patch.expectedStatusCodes;
    if (patch.sortOrder !== undefined) service.sortOrder = patch.sortOrder;
    service.updatedAt = new Date().toISOString();
    updated = { ...service };
  });

  return updated;
}

export async function deleteService(id: string) {
  let removed = false;
  await updateStore((store) => {
    const before = store.services.length;
    store.services = store.services.filter((s) => s.id !== id);
    removed = store.services.length < before;
    delete store.latest[id];
    delete store.history[id];
    delete store.daily[id];

    store.incidents = store.incidents
      .map((incident) => {
        const serviceIds = incident.serviceIds.filter((sid) => sid !== id);
        const serviceId =
          incident.serviceId === id
            ? (serviceIds[0] ?? null)
            : incident.serviceId;
        return { ...incident, serviceId, serviceIds };
      })
      .filter((incident) => {
        if (incident.serviceIds.length > 0 || incident.serviceId) return true;
        // Keep manual site-wide incidents; drop auto incidents with no service left.
        return incident.source === "manual";
      });

    for (const m of store.maintenances) {
      m.serviceIds = m.serviceIds.filter((sid) => sid !== id);
    }
  });
  return removed;
}

export type MaintenanceInput = {
  title: string;
  message?: string;
  startsAt: string;
  endsAt: string;
  serviceIds?: string[];
};

function assertMaintenanceWindow(startsAt: string, endsAt: string) {
  const start = new Date(startsAt).getTime();
  const end = new Date(endsAt).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) {
    throw new Error("Invalid maintenance dates");
  }
  if (end <= start) {
    throw new Error("End time must be after start time");
  }
}

export async function createMaintenance(
  input: MaintenanceInput,
): Promise<Maintenance> {
  assertMaintenanceWindow(input.startsAt, input.endsAt);
  const now = new Date().toISOString();
  let created!: Maintenance;
  let webhook = defaultWebhookSettings();

  await updateStore((store) => {
    webhook = store.webhook;
    created = {
      id: randomUUID(),
      title: input.title.trim(),
      message: (input.message ?? "").trim(),
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      serviceIds: input.serviceIds ?? [],
      createdAt: now,
      updatedAt: now,
    };
    store.maintenances.unshift(created);
    store.maintenances = store.maintenances.slice(0, MAINTENANCE_LIMIT);
  });

  queueWebhookEvents(webhook, [
    {
      type: "maintenance.changed",
      title: `Maintenance scheduled: ${created.title}`,
      description: created.message || "A maintenance window was scheduled.",
      fields: [
        { name: "Starts", value: created.startsAt, inline: true },
        { name: "Ends", value: created.endsAt, inline: true },
        {
          name: "Scope",
          value: created.serviceIds.length
            ? `${created.serviceIds.length} service(s)`
            : "All services",
          inline: true,
        },
      ],
    },
  ]);

  return created;
}

export async function updateMaintenance(
  id: string,
  patch: Partial<MaintenanceInput>,
): Promise<Maintenance | null> {
  const store = await readStore();
  const existing = store.maintenances.find((m) => m.id === id);
  if (!existing) return null;

  const nextStarts = patch.startsAt ?? existing.startsAt;
  const nextEnds = patch.endsAt ?? existing.endsAt;
  assertMaintenanceWindow(nextStarts, nextEnds);

  let updated: Maintenance | null = null;
  let webhook = defaultWebhookSettings();

  await updateStore((current) => {
    webhook = current.webhook;
    const item = current.maintenances.find((m) => m.id === id);
    if (!item) return;
    if (patch.title !== undefined) item.title = patch.title.trim();
    if (patch.message !== undefined) item.message = patch.message.trim();
    if (patch.startsAt !== undefined) item.startsAt = patch.startsAt;
    if (patch.endsAt !== undefined) item.endsAt = patch.endsAt;
    if (patch.serviceIds !== undefined) item.serviceIds = patch.serviceIds;
    item.updatedAt = new Date().toISOString();
    updated = { ...item };
  });

  if (updated) {
    const item = updated as Maintenance;
    queueWebhookEvents(webhook, [
      {
        type: "maintenance.changed",
        title: `Maintenance updated: ${item.title}`,
        description: item.message || "Maintenance window was updated.",
        fields: [
          { name: "Starts", value: item.startsAt, inline: true },
          { name: "Ends", value: item.endsAt, inline: true },
        ],
      },
    ]);
  }

  return updated;
}

export async function deleteMaintenance(id: string) {
  let removed = false;
  let title = "Maintenance";
  let webhook = defaultWebhookSettings();
  await updateStore((store) => {
    webhook = store.webhook;
    const existing = store.maintenances.find((m) => m.id === id);
    if (existing) title = existing.title;
    const before = store.maintenances.length;
    store.maintenances = store.maintenances.filter((m) => m.id !== id);
    removed = store.maintenances.length < before;
  });
  if (removed) {
    queueWebhookEvents(webhook, [
      {
        type: "maintenance.changed",
        title: `Maintenance removed: ${title}`,
        description: "A maintenance window was deleted.",
      },
    ]);
  }
  return removed;
}

export async function reorderServices(orderedIds: string[]) {
  await updateStore((store) => {
    const map = new Map(store.services.map((s) => [s.id, s]));
    orderedIds.forEach((id, index) => {
      const service = map.get(id);
      if (service) service.sortOrder = index;
    });
  });
}

function bumpDaily(
  daily: DayBucket[] | undefined,
  status: CheckResult["status"] | "maintenance",
  when: string,
): DayBucket[] {
  const key = dateKey(new Date(when));
  const list = [...(daily ?? [])];
  let bucket = list.find((d) => d.date === key);
  if (!bucket) {
    bucket = {
      date: key,
      operational: 0,
      degraded: 0,
      down: 0,
      unknown: 0,
      maintenance: 0,
    };
    list.push(bucket);
  }
  if (bucket.maintenance == null) bucket.maintenance = 0;
  bucket[status] += 1;
  list.sort((a, b) => a.date.localeCompare(b.date));
  return list.slice(-DAILY_LIMIT);
}

function syncIncidents(
  store: StoreData,
  service: Service,
  previous: CheckResult | undefined,
  next: CheckResult,
): WebhookEvent[] {
  const events: WebhookEvent[] = [];
  const wasBad =
    previous?.status === "degraded" || previous?.status === "down";
  const isBad = next.status === "degraded" || next.status === "down";
  const open = store.incidents.find(
    (i) =>
      !i.resolvedAt &&
      (i.serviceId === service.id || i.serviceIds.includes(service.id)),
  );

  if (isBad && !open) {
    const badStatus = next.status as "degraded" | "down";
    const message =
      next.error ||
      (next.statusCode
        ? `HTTP ${next.statusCode}`
        : `${service.name} became ${next.status}`);
    const incident: Incident = {
      id: randomUUID(),
      serviceId: service.id,
      serviceIds: [service.id],
      serviceName: service.name,
      status: badStatus,
      startedAt: next.checkedAt,
      resolvedAt: null,
      message,
      source: "auto",
      updates: [
        {
          id: randomUUID(),
          at: next.checkedAt,
          status: "investigating",
          message,
        },
      ],
    };
    store.incidents.unshift(incident);
    events.push({
      type: "incident.opened",
      title: `${service.name} is ${badStatus}`,
      description: message,
      fields: [
        { name: "Service", value: service.name, inline: true },
        { name: "Status", value: badStatus, inline: true },
        { name: "Source", value: "auto", inline: true },
      ],
    });
  } else if (isBad && open && open.source === "auto") {
    const prevStatus = open.status;
    if (open.status !== next.status) {
      open.status = next.status as "degraded" | "down";
    }
    open.message =
      next.error ||
      (next.statusCode
        ? `HTTP ${next.statusCode}`
        : `${service.name} is ${next.status}`);
    if (prevStatus !== open.status) {
      events.push({
        type: "incident.updated",
        title: `${service.name} now ${open.status}`,
        description: open.message,
        fields: [
          { name: "Service", value: service.name, inline: true },
          { name: "Status", value: open.status, inline: true },
        ],
      });
    }
  } else if (wasBad && !isBad && open && open.source === "auto") {
    open.resolvedAt = next.checkedAt;
    open.updates.push({
      id: randomUUID(),
      at: next.checkedAt,
      status: "resolved",
      message: `${service.name} recovered`,
    });
    events.push({
      type: "incident.resolved",
      title: `${service.name} recovered`,
      description: `${service.name} is operational again.`,
      fields: [
        { name: "Service", value: service.name, inline: true },
        { name: "Status", value: "operational", inline: true },
      ],
    });
  }

  store.incidents = store.incidents.slice(0, INCIDENT_LIMIT);
  return events;
}

export async function recordCheckResults(
  results: Array<{ serviceId: string; result: CheckResult }>,
  options?: { touchLastCheck?: boolean },
) {
  const events: WebhookEvent[] = [];
  let webhook = defaultWebhookSettings();

  await updateStore((store) => {
    webhook = store.webhook;
    const checkedAt = new Date().toISOString();
    for (const { serviceId, result } of results) {
      const service = store.services.find((s) => s.id === serviceId);
      const previous = store.latest[serviceId];
      store.latest[serviceId] = result;
      const history = store.history[serviceId] ?? [];
      history.push(result);
      store.history[serviceId] = history.slice(-HISTORY_LIMIT);
      const underMaintenance = isServiceUnderMaintenance(
        serviceId,
        store.maintenances,
      );
      store.daily[serviceId] = bumpDaily(
        store.daily[serviceId],
        underMaintenance ? "maintenance" : result.status,
        result.checkedAt,
      );
      if (service && !underMaintenance) {
        events.push(...syncIncidents(store, service, previous, result));
      } else if (service && underMaintenance) {
        const open = store.incidents.find(
          (i) =>
            !i.resolvedAt &&
            i.source === "auto" &&
            (i.serviceId === serviceId || i.serviceIds.includes(serviceId)),
        );
        if (open) {
          open.resolvedAt = result.checkedAt;
          open.updates.push({
            id: randomUUID(),
            at: result.checkedAt,
            status: "resolved",
            message: "Closed during scheduled maintenance",
          });
          events.push({
            type: "incident.resolved",
            title: `${service.name} incident closed`,
            description: "Closed during scheduled maintenance.",
            fields: [
              { name: "Service", value: service.name, inline: true },
              { name: "Reason", value: "maintenance", inline: true },
            ],
          });
        }
      }
    }
    if (options?.touchLastCheck !== false) {
      store.lastCheckAt = checkedAt;
    }
  });

  queueWebhookEvents(webhook, events);
}

export function uptimePercent(
  history: CheckResult[] | undefined,
  windowMs = 24 * 60 * 60 * 1000,
): number | null {
  if (!history?.length) return null;
  const cutoff = Date.now() - windowMs;
  const recent = history.filter(
    (h) => new Date(h.checkedAt).getTime() >= cutoff,
  );
  if (!recent.length) return null;
  const up = recent.filter((h) => h.status === "operational").length;
  return Math.round((up / recent.length) * 1000) / 10;
}

export function avgLatency(
  history: CheckResult[] | undefined,
  limit = 30,
): number | null {
  if (!history?.length) return null;
  const slice = history.slice(-limit).filter((h) => h.responseMs != null);
  if (!slice.length) return null;
  const sum = slice.reduce((acc, h) => acc + (h.responseMs ?? 0), 0);
  return Math.round(sum / slice.length);
}

export function sparklineValues(
  history: CheckResult[] | undefined,
  points = 24,
): Array<number | null> {
  if (!history?.length) return [];
  return history.slice(-points).map((h) => {
    if (h.status !== "operational" || h.responseMs == null) return null;
    return Math.min(h.responseMs, 5000);
  });
}

export async function createManualIncident(input: {
  title: string;
  message: string;
  status?: "degraded" | "down";
  serviceIds?: string[];
}): Promise<Incident> {
  const now = new Date().toISOString();
  let created!: Incident;
  let webhook = defaultWebhookSettings();

  await updateStore((store) => {
    webhook = store.webhook;
    const ids = input.serviceIds ?? [];
    const names = ids
      .map((id) => store.services.find((s) => s.id === id)?.name)
      .filter((n): n is string => Boolean(n));
    const serviceName =
      names.length === 0
        ? input.title.trim()
        : names.length === 1
          ? names[0]
          : `${names[0]} +${names.length - 1}`;

    created = {
      id: randomUUID(),
      serviceId: ids[0] ?? null,
      serviceIds: ids,
      serviceName,
      status: input.status ?? "down",
      startedAt: now,
      resolvedAt: null,
      message: input.message.trim() || input.title.trim(),
      source: "manual",
      updates: [
        {
          id: randomUUID(),
          at: now,
          status: "investigating",
          message: input.message.trim() || input.title.trim(),
        },
      ],
    };
    store.incidents.unshift(created);
    store.incidents = store.incidents.slice(0, INCIDENT_LIMIT);
  });

  queueWebhookEvents(webhook, [
    {
      type: "incident.opened",
      title: `Incident: ${created.serviceName}`,
      description: created.message,
      fields: [
        { name: "Status", value: created.status, inline: true },
        { name: "Source", value: "manual", inline: true },
      ],
    },
  ]);

  return created;
}

export async function addIncidentUpdate(
  id: string,
  input: { message: string; status: IncidentUpdateStatus },
): Promise<Incident | null> {
  let updated: Incident | null = null;
  const now = new Date().toISOString();
  let webhook = defaultWebhookSettings();

  await updateStore((store) => {
    webhook = store.webhook;
    const incident = store.incidents.find((i) => i.id === id);
    if (!incident) return;
    const entry: IncidentUpdate = {
      id: randomUUID(),
      at: now,
      status: input.status,
      message: input.message.trim(),
    };
    incident.updates.push(entry);
    incident.message = entry.message;
    if (input.status === "resolved") {
      incident.resolvedAt = now;
    } else if (incident.resolvedAt) {
      incident.resolvedAt = null;
    }
    updated = {
      ...incident,
      updates: [...incident.updates],
    };
  });

  if (updated) {
    const incident = updated as Incident;
    const type: WebhookEvent["type"] =
      input.status === "resolved" ? "incident.resolved" : "incident.updated";

    queueWebhookEvents(webhook, [
      {
        type,
        title:
          type === "incident.resolved"
            ? `Resolved: ${incident.serviceName}`
            : `Update: ${incident.serviceName}`,
        description: input.message.trim(),
        fields: [
          { name: "Status", value: input.status, inline: true },
          { name: "Service", value: incident.serviceName, inline: true },
        ],
      },
    ]);
  }

  return updated;
}

export async function resolveIncident(id: string, message?: string) {
  return addIncidentUpdate(id, {
    status: "resolved",
    message: message?.trim() || "Incident resolved",
  });
}

export async function updateLastCheckAt(iso: string) {
  await updateStore((store) => {
    store.lastCheckAt = iso;
  });
}

export async function deleteIncident(id: string) {
  let removed = false;
  await updateStore((store) => {
    const before = store.incidents.length;
    store.incidents = store.incidents.filter((i) => i.id !== id);
    removed = store.incidents.length < before;
  });
  return removed;
}

export async function setAnnouncement(
  input: { message: string; tone?: "info" | "warn"; enabled?: boolean } | null,
): Promise<Announcement | null> {
  let next: Announcement | null = null;
  let webhook = defaultWebhookSettings();
  let cleared = false;

  await updateStore((store) => {
    webhook = store.webhook;
    if (!input || !input.message.trim()) {
      cleared = Boolean(store.announcement);
      store.announcement = null;
      next = null;
      return;
    }
    store.announcement = {
      enabled: input.enabled ?? true,
      message: input.message.trim(),
      tone: input.tone === "warn" ? "warn" : "info",
      updatedAt: new Date().toISOString(),
    };
    next = { ...store.announcement };
  });

  if (cleared) {
    queueWebhookEvents(webhook, [
      {
        type: "notice.changed",
        title: "Notice cleared",
        description: "The public status notice was removed.",
      },
    ]);
  } else if (next) {
    const announcement = next as Announcement;
    queueWebhookEvents(webhook, [
      {
        type: "notice.changed",
        title: announcement.enabled ? "Notice published" : "Notice saved (hidden)",
        description: announcement.message,
        fields: [
          {
            name: "Tone",
            value: announcement.tone,
            inline: true,
          },
          {
            name: "Visible",
            value: announcement.enabled ? "yes" : "no",
            inline: true,
          },
        ],
      },
    ]);
  }

  return next;
}

export async function setWebhookSettings(input: {
  enabled?: boolean;
  url?: string;
  keepExistingUrl?: boolean;
  events?: Partial<WebhookEventFlags>;
}): Promise<WebhookSettings> {
  let next = defaultWebhookSettings();
  await updateStore((store) => {
    const current = store.webhook ?? defaultWebhookSettings();
    const url =
      input.keepExistingUrl || input.url === undefined
        ? current.url
        : input.url.trim();
    store.webhook = {
      enabled: input.enabled ?? current.enabled,
      url,
      events: {
        ...current.events,
        ...(input.events ?? {}),
      },
    };
    next = { ...store.webhook, events: { ...store.webhook.events } };
  });
  return next;
}

export function publicWebhookView(settings: WebhookSettings) {
  return {
    enabled: settings.enabled,
    urlMasked: maskWebhookUrl(settings.url),
    hasUrl: Boolean(settings.url),
    events: { ...settings.events },
  };
}
