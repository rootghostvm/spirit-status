import type { ServiceHealth } from "./types";

export const STATUS_LABELS: Record<ServiceHealth, string> = {
  operational: "Operational",
  degraded: "Degraded",
  down: "Outage",
  maintenance: "Maintenance",
  unknown: "Checking…",
};

export function statusLabel(status: ServiceHealth) {
  return STATUS_LABELS[status];
}
