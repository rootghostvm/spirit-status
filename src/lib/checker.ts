import {
  BRAND_NAME,
  CHECK_INTERVAL_MS,
  CHECK_RETRIES,
  CHECK_TIMEOUT_MS,
  DAILY_LIMIT,
  STATUS_TITLE,
} from "./config";
import {
  avgLatency,
  readStore,
  recordCheckResults,
  sparklineValues,
  updateLastCheckAt,
  uptimePercent,
} from "./store";
import {
  dateKey,
  dayBucketStatus,
  dayBucketUptime,
  sanitizeProbeError,
  assertSafeProbeUrl,
  worseStatus,
} from "./format";
import {
  isServiceUnderMaintenance,
  maintenancePhase,
} from "./maintenance";
import type {
  CheckResult,
  PublicMaintenance,
  PublicServiceView,
  PublicStatusPayload,
  Service,
  ServiceHealth,
} from "./types";

declare global {
  // eslint-disable-next-line no-var
  var __spiritMonitor:
    | {
        timer: NodeJS.Timeout | null;
        bootTimer: NodeJS.Timeout | null;
        started: boolean;
        running: boolean;
        lastStartedAt: number | null;
        nextCheckAt: number | null;
      }
    | undefined;
}

function monitorState() {
  if (!globalThis.__spiritMonitor) {
    globalThis.__spiritMonitor = {
      timer: null,
      bootTimer: null,
      started: false,
      running: false,
      lastStartedAt: null,
      nextCheckAt: null,
    };
  }
  return globalThis.__spiritMonitor;
}

function classify(
  statusCode: number,
  expected: number[],
): CheckResult["status"] {
  if (expected.length) {
    if (expected.includes(statusCode)) return "operational";
    if (statusCode >= 500) return "down";
    return "degraded";
  }
  if (statusCode >= 200 && statusCode < 400) return "operational";
  if (statusCode >= 400 && statusCode < 500) return "degraded";
  return "down";
}

async function probeOnce(
  url: string,
  method: "GET" | "HEAD",
  expected: number[],
  hop = 0,
): Promise<CheckResult> {
  const started = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method,
      redirect: "manual",
      signal: controller.signal,
      cache: "no-store",
      headers: {
        "User-Agent": "SpiritStatusMonitor/1.0 (+https://spirithost.co.uk)",
        Accept: "*/*",
      },
    });

    // Follow at most one safe hop (blocks open redirect SSRF).
    if (
      hop === 0 &&
      [301, 302, 303, 307, 308].includes(response.status)
    ) {
      clearTimeout(timeout);
      const location = response.headers.get("location");
      if (!location) {
        return {
          status: "degraded",
          statusCode: response.status,
          responseMs: Date.now() - started,
          error: "Redirect without location",
          checkedAt: new Date().toISOString(),
        };
      }
      let nextUrl: string;
      try {
        nextUrl = assertSafeProbeUrl(new URL(location, url).toString());
      } catch {
        return {
          status: "down",
          statusCode: response.status,
          responseMs: Date.now() - started,
          error: "Unsafe redirect blocked",
          checkedAt: new Date().toISOString(),
        };
      }
      return probeOnce(nextUrl, method, expected, 1);
    }

    // Some hosts reject HEAD — fall back to GET once (same timeout budget).
    if (method === "HEAD" && (response.status === 405 || response.status === 501)) {
      clearTimeout(timeout);
      return await probeOnce(url, "GET", expected, hop);
    }

    // Drop the body immediately — we only need status codes, not page content.
    if (method === "GET" && response.body) {
      await response.body.cancel().catch(() => undefined);
    }

    clearTimeout(timeout);
    return {
      status: classify(response.status, expected),
      statusCode: response.status,
      responseMs: Date.now() - started,
      error: null,
      checkedAt: new Date().toISOString(),
    };
  } catch (error) {
    clearTimeout(timeout);
    const message =
      error instanceof Error
        ? error.name === "AbortError"
          ? "Request timed out"
          : error.message
        : "Unknown error";

    return {
      status: "down",
      statusCode: null,
      responseMs: Date.now() - started,
      error: message,
      checkedAt: new Date().toISOString(),
    };
  }
}

export async function checkService(service: Service): Promise<CheckResult> {
  let last: CheckResult | null = null;
  const attempts = Math.max(1, CHECK_RETRIES + 1);

  for (let i = 0; i < attempts; i++) {
    last = await probeOnce(
      service.url,
      service.method,
      service.expectedStatusCodes,
    );
    if (last.status === "operational") return last;
    if (i < attempts - 1) {
      await new Promise((r) => setTimeout(r, 350 * (i + 1)));
    }
  }

  return last!;
}

let checkChain: Promise<void> = Promise.resolve();
let lastOverdueKickAt = 0;
let statusCache: { at: number; payload: PublicStatusPayload; gen: number } | null =
  null;
let statusCacheGen = 0;

export function invalidateStatusCache() {
  statusCache = null;
  statusCacheGen += 1;
}

export function runChecks(serviceIds?: string[]) {
  const job = () => executeChecks(serviceIds);
  const result = checkChain.then(job, job);
  checkChain = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

/** Hero clock uses full-cycle lastCheckAt only (not single-service probes). */
function heroProbeMs(store: Awaited<ReturnType<typeof readStore>>) {
  return store.lastCheckAt ? new Date(store.lastCheckAt).getTime() : null;
}

async function executeChecks(serviceIds?: string[]) {
  const state = monitorState();
  const partial = Boolean(serviceIds?.length);
  state.running = true;
  state.lastStartedAt = Date.now();

  try {
    const store = await readStore();
    const targets = store.services.filter((s) => {
      if (!s.enabled) return false;
      if (serviceIds?.length) return serviceIds.includes(s.id);
      return true;
    });

    const results = await Promise.all(
      targets.map(async (service) => ({
        serviceId: service.id,
        result: await checkService(service),
      })),
    );

    if (results.length) {
      await recordCheckResults(results, { touchLastCheck: !partial });
    } else if (!partial) {
      await updateLastCheckAt(new Date().toISOString());
    }

    return { ran: true, checked: results.length };
  } catch (error) {
    console.error("[spirit-status] check cycle failed", error);
    return { ran: false, checked: 0 };
  } finally {
    state.running = false;
    invalidateStatusCache();
    if (!partial) {
      state.nextCheckAt = Date.now() + CHECK_INTERVAL_MS;
    }
  }
}

export function startMonitor() {
  const state = monitorState();
  // Synchronous guard so concurrent callers cannot install multiple intervals.
  if (state.started) return;
  state.started = true;

  void (async () => {
    try {
      const store = await readStore();
      const anchor = heroProbeMs(store);
      const delay =
        anchor != null
          ? Math.max(0, anchor + CHECK_INTERVAL_MS - Date.now())
          : 1_500;
      state.nextCheckAt = Date.now() + delay;
      state.bootTimer = setTimeout(() => {
        state.bootTimer = null;
        void runChecks();
        if (!state.timer) {
          state.timer = setInterval(() => {
            void runChecks();
          }, CHECK_INTERVAL_MS);
        }
      }, delay);
    } catch {
      state.nextCheckAt = Date.now() + 1_500;
      state.bootTimer = setTimeout(() => {
        state.bootTimer = null;
        void runChecks();
        if (!state.timer) {
          state.timer = setInterval(() => {
            void runChecks();
          }, CHECK_INTERVAL_MS);
        }
      }, 1_500);
    }
  })();
}

/** Kick a background probe if overdue — never blocks the status response. */
function kickProbeIfOverdue(store: Awaited<ReturnType<typeof readStore>>) {
  const state = monitorState();
  if (state.running) return;

  // Use full-cycle hero clock only — partial probes must not suppress overdue kicks.
  const anchor = heroProbeMs(store);
  const overdue =
    anchor == null || Date.now() - anchor >= CHECK_INTERVAL_MS;

  if (!overdue) return;
  if (Date.now() - lastOverdueKickAt < 20_000) return;

  lastOverdueKickAt = Date.now();
  void runChecks();
}

function withLiveClock(payload: PublicStatusPayload): PublicStatusPayload {
  const state = monitorState();
  const lastMs = payload.lastCheckAt
    ? new Date(payload.lastCheckAt).getTime()
    : null;
  const nextCheckInMs =
    lastMs != null
      ? Math.max(0, lastMs + payload.checkIntervalMs - Date.now())
      : state.nextCheckAt != null
        ? Math.max(0, state.nextCheckAt - Date.now())
        : 0;

  return {
    ...payload,
    nextCheckInMs,
  };
}

export async function getPublicStatus(): Promise<PublicStatusPayload> {
  startMonitor();

  if (statusCache && Date.now() - statusCache.at < 2_500) {
    return withLiveClock(statusCache.payload);
  }

  const gen = statusCacheGen;
  const store = await readStore();
  kickProbeIfOverdue(store);

  const services = [...store.services]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    .map((service) => toPublicService(service, store));

  const visible = services.filter((s) => s.enabled);
  const overall = overallStatus(visible.map((s) => s.displayStatus));

  const groupMap = new Map<string, PublicServiceView[]>();
  for (const service of visible) {
    const list = groupMap.get(service.group) ?? [];
    list.push(service);
    groupMap.set(service.group, list);
  }

  const groups = [...groupMap.entries()].map(([name, groupServices]) => ({
    name,
    services: groupServices,
  }));

  const heroMs = heroProbeMs(store);
  const lastCheckAt = heroMs ? new Date(heroMs).toISOString() : null;
  const state = monitorState();
  const nextCheckInMs =
    heroMs != null
      ? Math.max(0, heroMs + CHECK_INTERVAL_MS - Date.now())
      : state.nextCheckAt != null
        ? Math.max(0, state.nextCheckAt - Date.now())
        : 0;

  const { current: maintenances, history: maintenanceHistory } =
    toPublicMaintenances(store);
  const announcement =
    store.announcement?.enabled && store.announcement.message
      ? store.announcement
      : null;

  const payload: PublicStatusPayload = {
    brand: BRAND_NAME,
    title: STATUS_TITLE,
    overall,
    summary: {
      total: visible.length,
      operational: visible.filter((s) => s.displayStatus === "operational")
        .length,
      degraded: visible.filter((s) => s.displayStatus === "degraded").length,
      down: visible.filter((s) => s.displayStatus === "down").length,
      maintenance: visible.filter((s) => s.displayStatus === "maintenance")
        .length,
      paused: services.filter((s) => !s.enabled).length,
    },
    announcement,
    groups,
    services: visible,
    incidents: store.incidents.slice(0, 20),
    maintenances,
    maintenanceHistory,
    lastCheckAt,
    nextCheckInMs,
    checkIntervalMs: CHECK_INTERVAL_MS,
  };

  // Generation guard: do not re-publish a payload built before an invalidate.
  if (gen === statusCacheGen) {
    statusCache = { at: Date.now(), payload, gen };
  }
  return withLiveClock(payload);
}

export function overallStatus(statuses: ServiceHealth[]): ServiceHealth {
  if (!statuses.length) return "unknown";
  if (statuses.some((s) => s === "down")) return "down";
  if (statuses.some((s) => s === "degraded")) return "degraded";
  if (statuses.some((s) => s === "maintenance")) return "maintenance";
  if (statuses.every((s) => s === "operational")) return "operational";
  return "unknown";
}

function buildDayBars(
  daily: StoreDataDaily | undefined,
): PublicServiceView["dayBars"] {
  const map = new Map((daily ?? []).map((d) => [d.date, d]));
  const bars: PublicServiceView["dayBars"] = [];
  const today = new Date();

  for (let i = DAILY_LIMIT - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(today.getUTCDate() - i);
    const key = dateKey(d);
    const bucket = map.get(key);
    if (!bucket) {
      bars.push({ date: key, status: "unknown", uptime: null });
    } else {
      bars.push({
        date: key,
        status: dayBucketStatus(bucket),
        uptime: dayBucketUptime(bucket),
      });
    }
  }

  return bars;
}

type StoreDataDaily = Awaited<ReturnType<typeof readStore>>["daily"][string];

function toPublicService(
  service: Service,
  store: Awaited<ReturnType<typeof readStore>>,
): PublicServiceView {
  const history = store.history[service.id];
  const daily = store.daily[service.id];
  const underMaintenance =
    service.enabled &&
    isServiceUnderMaintenance(service.id, store.maintenances);
  const dayBars = buildDayBars(daily);
  if (underMaintenance && dayBars.length) {
    const today = dayBars[dayBars.length - 1];
    dayBars[dayBars.length - 1] = { ...today, status: "maintenance" };
  }
  const filled = dayBars.filter((b) => b.uptime != null);
  const uptime90d = filled.length
    ? Math.round(
        (filled.reduce((acc, b) => acc + (b.uptime ?? 0), 0) / filled.length) *
          10,
      ) / 10
    : null;

  const latestRaw = store.latest[service.id] ?? null;
  const latest = latestRaw
    ? { ...latestRaw, error: sanitizeProbeError(latestRaw.error) }
    : null;

  const openIncident = store.incidents.find(
    (i) =>
      !i.resolvedAt &&
      (i.serviceId === service.id || i.serviceIds.includes(service.id)),
  );

  let displayStatus: ServiceHealth = !service.enabled
    ? "unknown"
    : underMaintenance
      ? "maintenance"
      : (latest?.status ?? "unknown");

  if (
    service.enabled &&
    !underMaintenance &&
    openIncident &&
    (openIncident.status === "degraded" || openIncident.status === "down")
  ) {
    displayStatus = worseStatus(displayStatus, openIncident.status);
  }

  return {
    id: service.id,
    name: service.name,
    description: service.description,
    group: service.group,
    enabled: service.enabled,
    latest,
    displayStatus,
    underMaintenance,
    uptime24h: uptimePercent(history),
    uptime90d,
    avgLatencyMs: avgLatency(history),
    sparkline: sparklineValues(history, 28),
    dayBars,
  };
}

function toPublicMaintenances(
  store: Awaited<ReturnType<typeof readStore>>,
) {
  const nameById = new Map(store.services.map((s) => [s.id, s.name]));

  const all = [...store.maintenances].map((m) => {
    const phase = maintenancePhase(m);
    const serviceNames = !m.serviceIds.length
      ? ["All services"]
      : m.serviceIds
          .map((id) => nameById.get(id))
          .filter((n): n is string => Boolean(n));

    return { ...m, phase, serviceNames };
  });

  const current = all
    .filter((m) => m.phase !== "completed")
    .sort((a, b) => {
      if (a.phase === b.phase) {
        return new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
      }
      if (a.phase === "active") return -1;
      if (b.phase === "active") return 1;
      return 0;
    });

  const history = all
    .filter((m) => m.phase === "completed")
    .sort(
      (a, b) => new Date(b.endsAt).getTime() - new Date(a.endsAt).getTime(),
    )
    .slice(0, 20);

  return { current, history };
}
