export const CHECK_INTERVAL_MS = Number(
  process.env.CHECK_INTERVAL_MS ?? 60_000,
);
export const CHECK_TIMEOUT_MS = Number(process.env.CHECK_TIMEOUT_MS ?? 10_000);
export const CHECK_RETRIES = Number(process.env.CHECK_RETRIES ?? 1);
export const HISTORY_LIMIT = 1_440; // ~24h at 60s
export const DAILY_LIMIT = 90;
export const INCIDENT_LIMIT = 50;
export const MAINTENANCE_LIMIT = 100;
export const STORE_VERSION = 4;
export const BRAND_NAME = process.env.NEXT_PUBLIC_BRAND_NAME ?? "SpiritHost";
export const STATUS_TITLE =
  process.env.NEXT_PUBLIC_STATUS_TITLE ?? "System Status";

export function getAdminPassword() {
  const value = process.env.ADMIN_PASSWORD?.trim();
  return value || "changeme";
}

export function getAdminSecret() {
  return process.env.ADMIN_SECRET || "spirit-status-dev-secret";
}
