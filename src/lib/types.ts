export type ServiceHealth =
  | "operational"
  | "degraded"
  | "down"
  | "maintenance"
  | "unknown";
export type CheckMethod = "GET" | "HEAD";
export type MaintenancePhase = "scheduled" | "active" | "completed";
export type IncidentUpdateStatus =
  | "investigating"
  | "identified"
  | "monitoring"
  | "resolved"
  | "update";

export interface Service {
  id: string;
  name: string;
  url: string;
  description: string;
  group: string;
  sortOrder: number;
  enabled: boolean;
  method: CheckMethod;
  expectedStatusCodes: number[];
  createdAt: string;
  updatedAt: string;
}

export interface CheckResult {
  status: Exclude<ServiceHealth, "maintenance">;
  statusCode: number | null;
  responseMs: number | null;
  error: string | null;
  checkedAt: string;
}

export interface DayBucket {
  date: string;
  operational: number;
  degraded: number;
  down: number;
  unknown: number;
  maintenance: number;
}

export interface IncidentUpdate {
  id: string;
  at: string;
  status: IncidentUpdateStatus;
  message: string;
}

export interface Incident {
  id: string;
  serviceId: string | null;
  serviceIds: string[];
  serviceName: string;
  status: "degraded" | "down";
  startedAt: string;
  resolvedAt: string | null;
  message: string;
  source: "auto" | "manual";
  updates: IncidentUpdate[];
}

export interface Maintenance {
  id: string;
  title: string;
  message: string;
  startsAt: string;
  endsAt: string;
  /** Empty array means all services */
  serviceIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Announcement {
  enabled: boolean;
  message: string;
  tone: "info" | "warn";
  updatedAt: string;
}

export interface StoreData {
  version: number;
  services: Service[];
  latest: Record<string, CheckResult>;
  history: Record<string, CheckResult[]>;
  daily: Record<string, DayBucket[]>;
  incidents: Incident[];
  maintenances: Maintenance[];
  announcement: Announcement | null;
  lastCheckAt: string | null;
}

export interface PublicServiceView {
  id: string;
  name: string;
  description: string;
  group: string;
  enabled: boolean;
  displayStatus: ServiceHealth;
  underMaintenance: boolean;
  latest: CheckResult | null;
  uptime24h: number | null;
  uptime90d: number | null;
  avgLatencyMs: number | null;
  sparkline: Array<number | null>;
  dayBars: Array<{
    date: string;
    status: ServiceHealth;
    uptime: number | null;
  }>;
}

export interface PublicMaintenance extends Maintenance {
  phase: MaintenancePhase;
  serviceNames: string[];
}

export interface PublicStatusPayload {
  brand: string;
  title: string;
  overall: ServiceHealth;
  summary: {
    total: number;
    operational: number;
    degraded: number;
    down: number;
    maintenance: number;
    paused: number;
  };
  announcement: Announcement | null;
  groups: Array<{
    name: string;
    services: PublicServiceView[];
  }>;
  services: PublicServiceView[];
  incidents: Incident[];
  maintenances: PublicMaintenance[];
  maintenanceHistory: PublicMaintenance[];
  lastCheckAt: string | null;
  nextCheckInMs: number;
  checkIntervalMs: number;
  probing: boolean;
}
