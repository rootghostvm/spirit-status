import type { DayBucket, ServiceHealth } from "./types";

export function statusRank(status: ServiceHealth) {
  switch (status) {
    case "down":
      return 4;
    case "degraded":
      return 3;
    case "maintenance":
      return 2;
    case "unknown":
      return 1;
    default:
      return 0;
  }
}

export function worseStatus(a: ServiceHealth, b: ServiceHealth): ServiceHealth {
  return statusRank(a) >= statusRank(b) ? a : b;
}

export function dayBucketStatus(bucket: DayBucket): ServiceHealth {
  const total =
    bucket.operational +
    bucket.degraded +
    bucket.down +
    bucket.unknown +
    (bucket.maintenance ?? 0);
  if (!total) return "unknown";
  const downRatio = bucket.down / total;
  const degradedRatio = bucket.degraded / total;
  const maintenanceRatio = (bucket.maintenance ?? 0) / total;
  if (downRatio >= 0.2) return "down";
  if (degradedRatio >= 0.15 || bucket.down > 0) return "degraded";
  if (maintenanceRatio >= 0.15 || (bucket.maintenance ?? 0) > 0) {
    return "maintenance";
  }
  if (bucket.operational > 0) return "operational";
  return "unknown";
}

export function dayBucketUptime(bucket: DayBucket): number | null {
  // Maintenance windows are excluded from uptime math.
  const total =
    bucket.operational + bucket.degraded + bucket.down + bucket.unknown;
  if (!total) {
    return (bucket.maintenance ?? 0) > 0 ? 100 : null;
  }
  return Math.round((bucket.operational / total) * 1000) / 10;
}

export function formatRelative(iso: string | null | undefined) {
  if (!iso) return "never";
  const delta = Date.now() - new Date(iso).getTime();
  const seconds = Math.max(0, Math.round(delta / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function formatDuration(startIso: string, endIso?: string | null) {
  const end = endIso ? new Date(endIso).getTime() : Date.now();
  const ms = Math.max(0, end - new Date(startIso).getTime());
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${Math.max(1, minutes)}m`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  if (hours < 48) return rem ? `${hours}h ${rem}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

export function formatLatency(ms: number | null | undefined) {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function dateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function ensureHttpsUrl(raw: string) {
  const trimmed = raw.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

export function toDatetimeLocalValue(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromDatetimeLocalValue(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function formatWindow(startsAt: string, endsAt: string) {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const opts: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  };
  return `${start.toLocaleString("en-GB", opts)} → ${end.toLocaleString("en-GB", opts)} UTC`;
}
