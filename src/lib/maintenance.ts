import type {
  Maintenance,
  MaintenancePhase,
  ServiceHealth,
} from "./types";

export function maintenancePhase(
  maintenance: Pick<Maintenance, "startsAt" | "endsAt">,
  now = Date.now(),
): MaintenancePhase {
  const start = new Date(maintenance.startsAt).getTime();
  const end = new Date(maintenance.endsAt).getTime();
  if (now < start) return "scheduled";
  if (now > end) return "completed";
  return "active";
}

export function isServiceUnderMaintenance(
  serviceId: string,
  maintenances: Maintenance[],
  now = Date.now(),
) {
  return maintenances.some((m) => {
    if (maintenancePhase(m, now) !== "active") return false;
    if (!m.serviceIds.length) return true;
    return m.serviceIds.includes(serviceId);
  });
}

export function activeMaintenanceIds(
  maintenances: Maintenance[],
  now = Date.now(),
) {
  const ids = new Set<string>();
  let coversAll = false;

  for (const m of maintenances) {
    if (maintenancePhase(m, now) !== "active") continue;
    if (!m.serviceIds.length) {
      coversAll = true;
      break;
    }
    for (const id of m.serviceIds) ids.add(id);
  }

  return { coversAll, ids };
}

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
