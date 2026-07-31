"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type {
  Announcement,
  CheckMethod,
  CheckResult,
  Incident,
  IncidentUpdateStatus,
  Maintenance,
  Service,
} from "@/lib/types";
import {
  formatLatency,
  formatRelative,
  formatWindow,
  fromDatetimeLocalValue,
  toDatetimeLocalValue,
} from "@/lib/format";
import { maintenancePhase } from "@/lib/maintenance";
import { AdminSelect } from "./AdminSelect";
import { SegmentedControl } from "./SegmentedControl";
import { StatusDot, statusLabel } from "./StatusDot";

const INCIDENT_UPDATE_STATUS_OPTIONS = [
  {
    value: "investigating",
    label: "Investigating",
    hint: "Looking into the issue",
    tone: "warn",
  },
  {
    value: "identified",
    label: "Identified",
    hint: "Cause found",
    tone: "warn",
  },
  {
    value: "monitoring",
    label: "Monitoring",
    hint: "Watching recovery",
    tone: "up",
  },
  {
    value: "resolved",
    label: "Resolved",
    hint: "Issue closed",
    tone: "up",
  },
  {
    value: "update",
    label: "Update",
    hint: "General progress note",
    tone: "info",
  },
] as const;

type AdminService = Service & { latest?: CheckResult | null };
type TabId = "services" | "maintenance" | "incidents" | "notice";

type FormState = {
  name: string;
  url: string;
  description: string;
  group: string;
  method: CheckMethod;
  expectedStatusCodes: string;
};

type MaintFormState = {
  title: string;
  message: string;
  startsAt: string;
  endsAt: string;
  allServices: boolean;
  serviceIds: string[];
};

type IncidentFormState = {
  title: string;
  message: string;
  status: "degraded" | "down";
  serviceIds: string[];
};

type IncidentUpdateFormState = {
  message: string;
  status: IncidentUpdateStatus;
};

type AnnouncementFormState = {
  enabled: boolean;
  message: string;
  tone: "info" | "warn";
};

const emptyForm: FormState = {
  name: "",
  url: "",
  description: "",
  group: "General",
  method: "GET",
  expectedStatusCodes: "200",
};

function defaultMaintForm(): MaintFormState {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);
  const end = new Date(start);
  end.setHours(end.getHours() + 2);
  return {
    title: "",
    message: "",
    startsAt: toDatetimeLocalValue(start.toISOString()),
    endsAt: toDatetimeLocalValue(end.toISOString()),
    allServices: true,
    serviceIds: [],
  };
}

const emptyIncidentForm: IncidentFormState = {
  title: "",
  message: "",
  status: "down",
  serviceIds: [],
};

const emptyIncidentUpdateForm: IncidentUpdateFormState = {
  message: "",
  status: "investigating",
};

const emptyAnnouncementForm: AnnouncementFormState = {
  enabled: false,
  message: "",
  tone: "info",
};

const TAB_COPY: Record<TabId, { title: string; subtitle: string }> = {
  services: {
    title: "Services",
    subtitle: "Monitored endpoints, probe settings, and live status.",
  },
  maintenance: {
    title: "Maintenance",
    subtitle: "Schedule windows shown on the public status page.",
  },
  incidents: {
    title: "Incidents",
    subtitle: "Open and resolved incidents visible to customers.",
  },
  notice: {
    title: "Notice",
    subtitle: "Public banner at the top of the status page.",
  },
};

export function AdminApp() {
  const [loading, setLoading] = useState(true);
  const [authed, setAuthed] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [maintError, setMaintError] = useState<string | null>(null);
  const [incidentError, setIncidentError] = useState<string | null>(null);
  const [incidentUpdateError, setIncidentUpdateError] = useState<string | null>(
    null,
  );
  const [announcementError, setAnnouncementError] = useState<string | null>(
    null,
  );
  const [toast, setToast] = useState<string | null>(null);
  const [services, setServices] = useState<AdminService[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [maintenances, setMaintenances] = useState<Maintenance[]>([]);
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [lastCheckAt, setLastCheckAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<TabId>("services");
  const [form, setForm] = useState<FormState>(emptyForm);
  const [maintForm, setMaintForm] = useState<MaintFormState>(defaultMaintForm);
  const [incidentForm, setIncidentForm] =
    useState<IncidentFormState>(emptyIncidentForm);
  const [incidentUpdateForm, setIncidentUpdateForm] =
    useState<IncidentUpdateFormState>(emptyIncidentUpdateForm);
  const [announcementForm, setAnnouncementForm] = useState<AnnouncementFormState>(
    emptyAnnouncementForm,
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingMaintId, setEditingMaintId] = useState<string | null>(null);
  const [addingUpdateToIncidentId, setAddingUpdateToIncidentId] = useState<
    string | null
  >(null);
  const [serviceSearch, setServiceSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState("all");

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2400);
  }, []);

  const loadServices = useCallback(async () => {
    const res = await fetch("/api/admin/services", { cache: "no-store" });
    if (!res.ok) throw new Error("unauthorized");
    const json = (await res.json()) as {
      services: Service[];
      latest: Record<string, CheckResult>;
      incidents: Incident[];
      maintenances: Maintenance[];
      announcement: Announcement | null;
      lastCheckAt: string | null;
    };
    setServices(
      json.services.map((service) => ({
        ...service,
        latest: json.latest[service.id] ?? null,
      })),
    );
    setIncidents(json.incidents ?? []);
    setMaintenances(json.maintenances ?? []);
    setAnnouncement(json.announcement ?? null);
    setLastCheckAt(json.lastCheckAt);
    if (json.announcement) {
      setAnnouncementForm({
        enabled: json.announcement.enabled,
        message: json.announcement.message,
        tone: json.announcement.tone,
      });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await fetch("/api/admin/me", { cache: "no-store" });
        if (!me.ok) {
          if (!cancelled) setAuthed(false);
          return;
        }
        await loadServices();
        if (!cancelled) setAuthed(true);
      } catch {
        if (!cancelled) setAuthed(false);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadServices]);

  useEffect(() => {
    if (!authed) return;
    const id = window.setInterval(() => {
      void loadServices().catch(() => undefined);
    }, 15_000);
    return () => window.clearInterval(id);
  }, [authed, loadServices]);

  const sortedMaintenances = useMemo(() => {
    return [...maintenances].sort((a, b) => {
      const pa = maintenancePhase(a);
      const pb = maintenancePhase(b);
      if (pa === pb) {
        return new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime();
      }
      const rank = { active: 0, scheduled: 1, completed: 2 };
      return rank[pa] - rank[pb];
    });
  }, [maintenances]);

  const sortedIncidents = useMemo(() => {
    const open = incidents.filter((i) => !i.resolvedAt);
    const resolved = incidents.filter((i) => i.resolvedAt);
    return [...open, ...resolved].sort(
      (a, b) =>
        new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
    );
  }, [incidents]);

  const serviceGroups = useMemo(() => {
    const groups = new Set<string>();
    for (const service of services) {
      const group = service.group?.trim() || "General";
      groups.add(group);
    }
    return Array.from(groups).sort((a, b) => a.localeCompare(b));
  }, [services]);

  const groupFilterOptions = useMemo(
    () => [
      { value: "all", label: "All groups" },
      ...serviceGroups.map((group) => ({ value: group, label: group })),
    ],
    [serviceGroups],
  );

  const filteredServices = useMemo(() => {
    const query = serviceSearch.trim().toLowerCase();
    return services.filter((service) => {
      const group = service.group?.trim() || "General";
      if (groupFilter !== "all" && group !== groupFilter) return false;
      if (!query) return true;
      return (
        service.name.toLowerCase().includes(query) ||
        service.url.toLowerCase().includes(query) ||
        group.toLowerCase().includes(query)
      );
    });
  }, [services, serviceSearch, groupFilter]);

  const hasPausedServices = services.some((s) => !s.enabled);
  const hasEnabledServices = services.some((s) => s.enabled);

  async function onLogin(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        setError("Wrong password.");
        return;
      }
      await loadServices();
      setAuthed(true);
      setPassword("");
      showToast("Welcome back");
    } finally {
      setBusy(false);
    }
  }

  async function onLogout() {
    await fetch("/api/admin/logout", { method: "POST" });
    setAuthed(false);
    setServices([]);
    setEditingId(null);
    setEditingMaintId(null);
  }

  function startEdit(service: AdminService) {
    setTab("services");
    setEditingId(service.id);
    setForm({
      name: service.name,
      url: service.url,
      description: service.description,
      group: service.group || "General",
      method: service.method || "GET",
      expectedStatusCodes: service.expectedStatusCodes.join(","),
    });
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm);
    setError(null);
  }

  function startMaintEdit(item: Maintenance) {
    setTab("maintenance");
    setEditingMaintId(item.id);
    setMaintForm({
      title: item.title,
      message: item.message,
      startsAt: toDatetimeLocalValue(item.startsAt),
      endsAt: toDatetimeLocalValue(item.endsAt),
      allServices: item.serviceIds.length === 0,
      serviceIds: item.serviceIds,
    });
    setMaintError(null);
  }

  function cancelMaintEdit() {
    setEditingMaintId(null);
    setMaintForm(defaultMaintForm());
    setMaintError(null);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const codes = form.expectedStatusCodes
        .split(",")
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !isNaN(n));
      if (!codes.length) {
        setError("Provide at least one valid status code");
        return;
      }
      const payload = {
        name: form.name,
        url: form.url,
        description: form.description,
        group: form.group,
        method: form.method,
        expectedStatusCodes: codes,
      };
      const endpoint = editingId
        ? `/api/admin/services/${editingId}`
        : "/api/admin/services";
      const res = await fetch(endpoint, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Could not save service");
        return;
      }
      cancelEdit();
      await loadServices();
      showToast(editingId ? "Service updated" : "Service added");
    } finally {
      setBusy(false);
    }
  }

  async function onMaintSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMaintError(null);
    try {
      const startsAt = fromDatetimeLocalValue(maintForm.startsAt);
      const endsAt = fromDatetimeLocalValue(maintForm.endsAt);
      if (!startsAt || !endsAt) {
        setMaintError("Pick valid start and end times");
        return;
      }

      const payload = {
        title: maintForm.title,
        message: maintForm.message,
        startsAt,
        endsAt,
        serviceIds: maintForm.allServices ? [] : maintForm.serviceIds,
      };

      const endpoint = editingMaintId
        ? `/api/admin/maintenances/${editingMaintId}`
        : "/api/admin/maintenances";
      const res = await fetch(endpoint, {
        method: editingMaintId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        setMaintError(json.error ?? "Could not save maintenance");
        return;
      }
      cancelMaintEdit();
      await loadServices();
      showToast(editingMaintId ? "Maintenance updated" : "Maintenance created");
    } finally {
      setBusy(false);
    }
  }

  async function onIncidentSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setIncidentError(null);
    try {
      const res = await fetch("/api/admin/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: incidentForm.title,
          message: incidentForm.message,
          status: incidentForm.status,
          serviceIds: incidentForm.serviceIds,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setIncidentError(json.error ?? "Could not create incident");
        return;
      }
      setIncidentForm(emptyIncidentForm);
      await loadServices();
      showToast("Incident created");
    } finally {
      setBusy(false);
    }
  }

  async function onIncidentUpdateSubmit(
    event: FormEvent,
    incidentId: string,
  ) {
    event.preventDefault();
    setBusy(true);
    setIncidentUpdateError(null);
    try {
      const res = await fetch(`/api/admin/incidents/${incidentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: incidentUpdateForm.message,
          status: incidentUpdateForm.status,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setIncidentUpdateError(json.error ?? "Could not add update");
        return;
      }
      setIncidentUpdateForm(emptyIncidentUpdateForm);
      setAddingUpdateToIncidentId(null);
      await loadServices();
      showToast("Update added");
    } finally {
      setBusy(false);
    }
  }

  async function resolveIncident(incident: Incident) {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/incidents/${incident.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolve: true }),
      });
      const json = await res.json();
      if (!res.ok) {
        showToast(json.error ?? "Could not resolve incident");
        return;
      }
      await loadServices();
      showToast("Incident resolved");
    } finally {
      setBusy(false);
    }
  }

  async function removeIncident(incident: Incident) {
    if (!window.confirm(`Delete incident for "${incident.serviceName}"?`)) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/incidents/${incident.id}`, {
        method: "DELETE",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(json.error ?? "Could not delete incident");
        return;
      }
      await loadServices();
      showToast("Incident deleted");
    } finally {
      setBusy(false);
    }
  }

  async function onAnnouncementSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setAnnouncementError(null);
    try {
      const res = await fetch("/api/admin/announcement", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(announcementForm),
      });
      const json = await res.json();
      if (!res.ok) {
        setAnnouncementError(json.error ?? "Could not save announcement");
        return;
      }
      await loadServices();
      showToast("Announcement saved");
    } finally {
      setBusy(false);
    }
  }

  async function clearAnnouncement() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/announcement", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: false, message: "", tone: "info" }),
      });
      const json = await res.json();
      if (!res.ok) {
        showToast(json.error ?? "Could not clear announcement");
        return;
      }
      setAnnouncementForm(emptyAnnouncementForm);
      await loadServices();
      showToast("Announcement cleared");
    } finally {
      setBusy(false);
    }
  }

  async function toggleEnabled(service: AdminService) {
    setBusy(true);
    try {
      await fetch(`/api/admin/services/${service.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !service.enabled }),
      });
      await loadServices();
      showToast(service.enabled ? "Paused" : "Resumed");
    } finally {
      setBusy(false);
    }
  }

  async function pauseAllServices() {
    const targets = services.filter((s) => s.enabled);
    if (!targets.length) return;
    setBusy(true);
    try {
      await Promise.all(
        targets.map((service) =>
          fetch(`/api/admin/services/${service.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ enabled: false }),
          }),
        ),
      );
      await loadServices();
      showToast("All services paused");
    } finally {
      setBusy(false);
    }
  }

  async function resumeAllServices() {
    const targets = services.filter((s) => !s.enabled);
    if (!targets.length) return;
    setBusy(true);
    try {
      await Promise.all(
        targets.map((service) =>
          fetch(`/api/admin/services/${service.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ enabled: true }),
          }),
        ),
      );
      await loadServices();
      showToast("All services resumed");
    } finally {
      setBusy(false);
    }
  }

  async function copyStatusLink() {
    const link = `${window.location.origin}/`;
    try {
      await navigator.clipboard.writeText(link);
      showToast("Link copied");
    } catch {
      showToast("Could not copy link");
    }
  }

  async function removeService(service: AdminService) {
    if (!window.confirm(`Remove ${service.name}?`)) return;
    setBusy(true);
    try {
      await fetch(`/api/admin/services/${service.id}`, { method: "DELETE" });
      if (editingId === service.id) cancelEdit();
      await loadServices();
      showToast("Service removed");
    } finally {
      setBusy(false);
    }
  }

  async function moveService(service: AdminService, direction: "up" | "down") {
    const currentIndex = services.findIndex((s) => s.id === service.id);
    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= services.length) return;

    const target = services[targetIndex];
    setBusy(true);
    try {
      await fetch(`/api/admin/services/${service.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sortOrder: target.sortOrder }),
      });
      await fetch(`/api/admin/services/${target.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sortOrder: service.sortOrder }),
      });
      await loadServices();
    } finally {
      setBusy(false);
    }
  }

  async function removeMaintenance(item: Maintenance) {
    if (!window.confirm(`Delete maintenance "${item.title}"?`)) return;
    setBusy(true);
    try {
      await fetch(`/api/admin/maintenances/${item.id}`, { method: "DELETE" });
      if (editingMaintId === item.id) cancelMaintEdit();
      await loadServices();
      showToast("Maintenance deleted");
    } finally {
      setBusy(false);
    }
  }

  async function endMaintenanceNow(item: Maintenance) {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/maintenances/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endsAt: new Date().toISOString() }),
      });
      const json = await res.json();
      if (!res.ok) {
        showToast(json.error ?? "Could not end maintenance");
        return;
      }
      await loadServices();
      showToast("Maintenance ended");
    } finally {
      setBusy(false);
    }
  }

  async function runCheckNow() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/check", { method: "POST" });
      const json = (await res.json()) as { check?: { ran: boolean } };
      await loadServices();
      if (json.check?.ran) {
        showToast("Checks completed");
      } else {
        showToast("Check already running");
      }
    } finally {
      setBusy(false);
    }
  }

  function toggleMaintService(id: string) {
    setMaintForm((f) => {
      const exists = f.serviceIds.includes(id);
      return {
        ...f,
        allServices: false,
        serviceIds: exists
          ? f.serviceIds.filter((sid) => sid !== id)
          : [...f.serviceIds, id],
      };
    });
  }

  function toggleIncidentService(id: string) {
    setIncidentForm((f) => {
      const exists = f.serviceIds.includes(id);
      return {
        ...f,
        serviceIds: exists
          ? f.serviceIds.filter((sid) => sid !== id)
          : [...f.serviceIds, id],
      };
    });
  }

  const upCount = services.filter(
    (s) => s.enabled && s.latest?.status === "operational",
  ).length;
  const degradedCount = services.filter(
    (s) => s.enabled && s.latest?.status === "degraded",
  ).length;
  const downCount = services.filter(
    (s) => s.enabled && s.latest?.status === "down",
  ).length;
  const openIncidents = incidents.filter((i) => !i.resolvedAt).length;
  const activeMaint = maintenances.filter(
    (m) => maintenancePhase(m) === "active",
  ).length;
  const scheduledMaint = maintenances.filter(
    (m) => maintenancePhase(m) === "scheduled",
  ).length;

  const tabCopy = TAB_COPY[tab];

  if (loading) {
    return (
      <div className="admin-shell is-loading">
        <div className="admin-loading-block">
          <span className="loader" />
          <p>Loading ops console…</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`admin-shell ${authed ? "is-authed" : "is-login"}`}>
      <AnimatePresence>
        {toast ? (
          <motion.div
            className="toast"
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8 }}
          >
            {toast}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {!authed ? (
          <motion.div
            key="login"
            className="admin-login"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          >
            <motion.div
              className="admin-login-brand"
              initial={{ opacity: 0, x: -24 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            >
              <p className="brand">SpiritHost</p>
              <p className="admin-login-lead">
                Ops console for probes, maintenance, and public status.
              </p>
              <a href="/" className="text-btn admin-login-public">
                View public page
              </a>
            </motion.div>

            <motion.form
              className="admin-login-form"
              onSubmit={onLogin}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{
                duration: 0.5,
                delay: 0.08,
                ease: [0.22, 1, 0.36, 1],
              }}
            >
              <div className="admin-login-form-head">
                <p className="editor-kicker">Admin access</p>
                <h1>Sign in</h1>
              </div>
              <label>
                Password
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  placeholder="Enter admin password"
                  required
                />
              </label>
              {error ? <p className="form-error">{error}</p> : null}
              <button type="submit" className="primary-btn" disabled={busy}>
                {busy ? "Signing in…" : "Continue"}
              </button>
            </motion.form>
          </motion.div>
        ) : (
          <motion.div
            key="dash"
            className="admin-console"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
          >
            <motion.aside
              className="admin-rail"
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="admin-rail-top">
                <p className="brand compact">SpiritHost</p>
                <p className="admin-rail-label">Ops console</p>
              </div>

              <nav className="admin-rail-nav" aria-label="Admin sections">
                <button
                  type="button"
                  className={tab === "services" ? "is-active" : ""}
                  onClick={() => setTab("services")}
                >
                  <span>Services</span>
                  <em>{services.length}</em>
                </button>
                <button
                  type="button"
                  className={tab === "maintenance" ? "is-active" : ""}
                  onClick={() => setTab("maintenance")}
                >
                  <span>Maintenance</span>
                  <em>{maintenances.length}</em>
                </button>
                <button
                  type="button"
                  className={tab === "incidents" ? "is-active" : ""}
                  onClick={() => setTab("incidents")}
                >
                  <span>Incidents</span>
                  <em>{incidents.length}</em>
                </button>
                <button
                  type="button"
                  className={tab === "notice" ? "is-active" : ""}
                  onClick={() => setTab("notice")}
                >
                  <span>Notice</span>
                  {announcement?.enabled ? <em>on</em> : null}
                </button>
              </nav>

              <div className="admin-rail-stats" aria-label="Live status">
                <div>
                  <span>Up</span>
                  <strong className="tone-up">{upCount}</strong>
                </div>
                <div>
                  <span>Degraded</span>
                  <strong className="tone-warn">{degradedCount}</strong>
                </div>
                <div>
                  <span>Down</span>
                  <strong className="tone-down">{downCount}</strong>
                </div>
                <div>
                  <span>Maint</span>
                  <strong className="tone-maint">{activeMaint}</strong>
                </div>
                <p className="admin-rail-probe">
                  {lastCheckAt
                    ? `Probed ${formatRelative(lastCheckAt)}`
                    : "Waiting for first probe"}
                  {openIncidents
                    ? ` · ${openIncidents} open`
                    : ""}
                  {scheduledMaint ? ` · ${scheduledMaint} scheduled` : ""}
                </p>
              </div>

              <div className="admin-rail-actions">
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={runCheckNow}
                  disabled={busy}
                >
                  Check now
                </button>
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={copyStatusLink}
                >
                  Copy status link
                </button>
                <a href="/" className="ghost-link">
                  Public
                </a>
                <button type="button" className="ghost-btn" onClick={onLogout}>
                  Log out
                </button>
              </div>
            </motion.aside>

            <main className="admin-canvas">
              <header className="admin-canvas-head">
                <h1>{tabCopy.title}</h1>
                <p>{tabCopy.subtitle}</p>
              </header>

              <AnimatePresence mode="wait">
                {tab === "services" ? (
                  <motion.div
                    key="services"
                    className="admin-workspace"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.28 }}
                  >
                    <section className="admin-stream">
                      {services.length ? (
                        <div className="admin-toolbar">
                          <label className="admin-search">
                            <span className="sr-only">Search services</span>
                            <input
                              type="search"
                              value={serviceSearch}
                              onChange={(e) => setServiceSearch(e.target.value)}
                              placeholder="Search name, URL, or group"
                            />
                          </label>
                          <AdminSelect
                            value={groupFilter}
                            onChange={setGroupFilter}
                            options={groupFilterOptions}
                            ariaLabel="Filter by group"
                          />
                        </div>
                      ) : null}

                      <div className="admin-stream-head">
                        <p className="admin-stream-count">
                          {!services.length
                            ? "No services"
                            : filteredServices.length === services.length
                              ? `${services.length} service${services.length === 1 ? "" : "s"}`
                              : `${filteredServices.length} of ${services.length}`}
                        </p>
                        {services.length ? (
                          <div className="admin-stream-actions">
                            {hasEnabledServices ? (
                              <button
                                type="button"
                                className="ghost-btn"
                                onClick={pauseAllServices}
                                disabled={busy}
                              >
                                Pause all
                              </button>
                            ) : null}
                            {hasPausedServices ? (
                              <button
                                type="button"
                                className="ghost-btn"
                                onClick={resumeAllServices}
                                disabled={busy}
                              >
                                Resume all
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </div>

                      {!services.length ? (
                        <div className="admin-empty">
                          <p>No services yet</p>
                          <span>Add your first website in the editor.</span>
                        </div>
                      ) : !filteredServices.length ? (
                        <div className="admin-empty">
                          <p>No matching services</p>
                          <span>Try a different search or group filter.</span>
                        </div>
                      ) : (
                        <ul className="ops-list">
                          {filteredServices.map((service) => {
                            const idx = services.findIndex(
                              (s) => s.id === service.id,
                            );
                            const status = service.enabled
                              ? (service.latest?.status ?? "unknown")
                              : "unknown";
                            const selected = editingId === service.id;
                            return (
                              <li
                                key={service.id}
                                className={`ops-row ${selected ? "is-selected" : ""}`}
                              >
                                <button
                                  type="button"
                                  className="ops-row-main"
                                  onClick={() => startEdit(service)}
                                >
                                  <StatusDot status={status} />
                                  <div className="ops-row-copy">
                                    <p className="ops-row-title">
                                      {service.name}
                                      <span className="group-chip">
                                        {service.group}
                                      </span>
                                    </p>
                                    <p className="ops-row-meta">
                                      {service.url}
                                      {" · "}
                                      {service.enabled
                                        ? statusLabel(status)
                                        : "Paused"}
                                      {" · "}
                                      {service.method}
                                      {service.latest?.responseMs != null ? (
                                        <>
                                          {" · "}
                                          <span className="ops-row-latency">
                                            {formatLatency(
                                              service.latest.responseMs,
                                            )}
                                          </span>
                                        </>
                                      ) : null}
                                    </p>
                                    {service.latest?.error ? (
                                      <p className="ops-row-error">
                                        {service.latest.error}
                                      </p>
                                    ) : null}
                                  </div>
                                </button>
                                <div className="ops-row-actions">
                                  <button
                                    type="button"
                                    className="ghost-btn"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      window.open(
                                        service.url,
                                        "_blank",
                                        "noopener,noreferrer",
                                      );
                                    }}
                                  >
                                    Open URL
                                  </button>
                                  <button
                                    type="button"
                                    className="ghost-btn"
                                    onClick={() => toggleEnabled(service)}
                                    disabled={busy}
                                  >
                                    {service.enabled ? "Pause" : "Resume"}
                                  </button>
                                  <button
                                    type="button"
                                    className="ghost-btn"
                                    onClick={() => moveService(service, "up")}
                                    disabled={busy || idx <= 0}
                                  >
                                    ↑
                                  </button>
                                  <button
                                    type="button"
                                    className="ghost-btn"
                                    onClick={() => moveService(service, "down")}
                                    disabled={
                                      busy || idx < 0 || idx >= services.length - 1
                                    }
                                  >
                                    ↓
                                  </button>
                                  <button
                                    type="button"
                                    className="danger-btn"
                                    onClick={() => removeService(service)}
                                    disabled={busy}
                                  >
                                    Remove
                                  </button>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </section>

                    <aside className="admin-editor">
                      <form onSubmit={onSubmit}>
                        <div className="editor-head">
                          <div>
                            <p className="editor-kicker">
                              {editingId ? "Editing" : "New monitor"}
                            </p>
                            <h2>
                              {editingId ? "Edit service" : "Add service"}
                            </h2>
                          </div>
                          {editingId ? (
                            <button
                              type="button"
                              className="ghost-btn"
                              onClick={cancelEdit}
                            >
                              Clear
                            </button>
                          ) : null}
                        </div>

                        <div className="form-stack">
                          <label>
                            Name
                            <input
                              value={form.name}
                              onChange={(e) =>
                                setForm((f) => ({
                                  ...f,
                                  name: e.target.value,
                                }))
                              }
                              placeholder="Billing portal"
                              required
                            />
                          </label>
                          <label>
                            URL
                            <input
                              value={form.url}
                              onChange={(e) =>
                                setForm((f) => ({
                                  ...f,
                                  url: e.target.value,
                                }))
                              }
                              placeholder="https://panel.spirithost.co.uk"
                              required
                            />
                          </label>
                          <label>
                            Description
                            <textarea
                              value={form.description}
                              onChange={(e) =>
                                setForm((f) => ({
                                  ...f,
                                  description: e.target.value,
                                }))
                              }
                              placeholder="Optional note on the public page"
                              rows={3}
                            />
                          </label>
                          <div className="form-row">
                            <label>
                              Group
                              <input
                                value={form.group}
                                onChange={(e) =>
                                  setForm((f) => ({
                                    ...f,
                                    group: e.target.value,
                                  }))
                                }
                                placeholder="General"
                                list="admin-group-suggestions"
                              />
                              <datalist id="admin-group-suggestions">
                                {serviceGroups.map((group) => (
                                  <option key={group} value={group} />
                                ))}
                              </datalist>
                            </label>
                            <div className="form-field">
                              <span className="form-label">Method</span>
                              <SegmentedControl
                                value={form.method}
                                onChange={(method) =>
                                  setForm((f) => ({
                                    ...f,
                                    method: method as CheckMethod,
                                  }))
                                }
                                options={[
                                  { value: "GET", label: "GET" },
                                  { value: "HEAD", label: "HEAD" },
                                ]}
                                ariaLabel="HTTP method"
                                disabled={busy}
                              />
                            </div>
                          </div>
                          <label>
                            Expected Status Codes
                            <input
                              value={form.expectedStatusCodes}
                              onChange={(e) =>
                                setForm((f) => ({
                                  ...f,
                                  expectedStatusCodes: e.target.value,
                                }))
                              }
                              placeholder="200,204"
                              required
                            />
                          </label>
                        </div>

                        {error ? <p className="form-error">{error}</p> : null}
                        <button
                          type="submit"
                          className="primary-btn primary-btn-block"
                          disabled={busy}
                        >
                          {busy
                            ? "Saving…"
                            : editingId
                              ? "Save changes"
                              : "Add service"}
                        </button>
                      </form>
                    </aside>
                  </motion.div>
                ) : tab === "maintenance" ? (
                  <motion.div
                    key="maintenance"
                    className="admin-workspace"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.28 }}
                  >
                    <section className="admin-stream">
                      {!sortedMaintenances.length ? (
                        <div className="admin-empty">
                          <p>No maintenance yet</p>
                          <span>Schedule a window from the editor.</span>
                        </div>
                      ) : (
                        <ul className="ops-list">
                          {sortedMaintenances.map((item) => {
                            const phase = maintenancePhase(item);
                            const selected = editingMaintId === item.id;
                            const names = !item.serviceIds.length
                              ? "All services"
                              : item.serviceIds
                                  .map(
                                    (id) =>
                                      services.find((s) => s.id === id)
                                        ?.name ?? id,
                                  )
                                  .join(", ");
                            return (
                              <li
                                key={item.id}
                                className={`ops-row ${selected ? "is-selected" : ""}`}
                              >
                                <button
                                  type="button"
                                  className="ops-row-main"
                                  onClick={() => startMaintEdit(item)}
                                >
                                  <StatusDot status="maintenance" />
                                  <div className="ops-row-copy">
                                    <p className="ops-row-title">
                                      {item.title}
                                      <span
                                        className={`pill maintenance ${phase}`}
                                      >
                                        {phase}
                                      </span>
                                    </p>
                                    {item.message ? (
                                      <p className="ops-row-sub">
                                        {item.message}
                                      </p>
                                    ) : null}
                                    <p className="ops-row-meta">
                                      {formatWindow(
                                        item.startsAt,
                                        item.endsAt,
                                      )}
                                      {" · "}
                                      {names}
                                    </p>
                                  </div>
                                </button>
                                <div className="ops-row-actions">
                                  {phase === "active" ? (
                                    <button
                                      type="button"
                                      className="ghost-btn"
                                      onClick={() => endMaintenanceNow(item)}
                                      disabled={busy}
                                    >
                                      End now
                                    </button>
                                  ) : null}
                                  <button
                                    type="button"
                                    className="danger-btn"
                                    onClick={() => removeMaintenance(item)}
                                    disabled={busy}
                                  >
                                    Delete
                                  </button>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </section>

                    <aside className="admin-editor">
                      <form onSubmit={onMaintSubmit}>
                        <div className="editor-head">
                          <div>
                            <p className="editor-kicker">
                              {editingMaintId ? "Editing" : "New window"}
                            </p>
                            <h2>
                              {editingMaintId
                                ? "Edit maintenance"
                                : "Schedule maintenance"}
                            </h2>
                          </div>
                          {editingMaintId ? (
                            <button
                              type="button"
                              className="ghost-btn"
                              onClick={cancelMaintEdit}
                            >
                              Clear
                            </button>
                          ) : null}
                        </div>

                        <div className="form-stack">
                          <label>
                            Title
                            <input
                              value={maintForm.title}
                              onChange={(e) =>
                                setMaintForm((f) => ({
                                  ...f,
                                  title: e.target.value,
                                }))
                              }
                              placeholder="Panel database upgrade"
                              required
                            />
                          </label>
                          <label>
                            Message
                            <textarea
                              value={maintForm.message}
                              onChange={(e) =>
                                setMaintForm((f) => ({
                                  ...f,
                                  message: e.target.value,
                                }))
                              }
                              placeholder="What customers should expect"
                              rows={3}
                            />
                          </label>
                          <div className="form-row">
                            <label>
                              Starts
                              <input
                                type="datetime-local"
                                value={maintForm.startsAt}
                                onChange={(e) =>
                                  setMaintForm((f) => ({
                                    ...f,
                                    startsAt: e.target.value,
                                  }))
                                }
                                required
                              />
                            </label>
                            <label>
                              Ends
                              <input
                                type="datetime-local"
                                value={maintForm.endsAt}
                                onChange={(e) =>
                                  setMaintForm((f) => ({
                                    ...f,
                                    endsAt: e.target.value,
                                  }))
                                }
                                required
                              />
                            </label>
                          </div>

                          <div className="maint-targets">
                            <label className="check-row">
                              <input
                                type="checkbox"
                                checked={maintForm.allServices}
                                onChange={(e) =>
                                  setMaintForm((f) => ({
                                    ...f,
                                    allServices: e.target.checked,
                                    serviceIds: e.target.checked
                                      ? []
                                      : f.serviceIds,
                                  }))
                                }
                              />
                              Affects all services
                            </label>

                            {!maintForm.allServices ? (
                              <div className="service-check-grid">
                                {services.map((service) => (
                                  <label
                                    key={service.id}
                                    className="check-row"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={maintForm.serviceIds.includes(
                                        service.id,
                                      )}
                                      onChange={() =>
                                        toggleMaintService(service.id)
                                      }
                                    />
                                    {service.name}
                                  </label>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        </div>

                        {maintError ? (
                          <p className="form-error">{maintError}</p>
                        ) : null}
                        <button
                          type="submit"
                          className="primary-btn primary-btn-block"
                          disabled={busy}
                        >
                          {busy
                            ? "Saving…"
                            : editingMaintId
                              ? "Save maintenance"
                              : "Create maintenance"}
                        </button>
                      </form>
                    </aside>
                  </motion.div>
                ) : tab === "incidents" ? (
                  <motion.div
                    key="incidents"
                    className="admin-workspace"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.28 }}
                  >
                    <section className="admin-stream">
                      {!sortedIncidents.length ? (
                        <div className="admin-empty">
                          <p>No incidents</p>
                          <span>
                            Create a manual incident from the editor.
                          </span>
                        </div>
                      ) : (
                        <ul className="ops-list">
                          {sortedIncidents.map((incident) => {
                            const isOpen = !incident.resolvedAt;
                            const serviceNames = incident.serviceIds
                              .map(
                                (id) =>
                                  services.find((s) => s.id === id)?.name ??
                                  id,
                              )
                              .join(", ");
                            const addingUpdate =
                              addingUpdateToIncidentId === incident.id;
                            return (
                              <li key={incident.id} className="ops-row is-block">
                                <div className="ops-row-main is-static">
                                  <StatusDot status={incident.status} />
                                  <div className="ops-row-copy">
                                    <p className="ops-row-title">
                                      {incident.serviceName}
                                      <span
                                        className={`pill ${isOpen ? "open" : "resolved"}`}
                                      >
                                        {isOpen ? "Open" : "Resolved"}
                                      </span>
                                    </p>
                                    <p className="ops-row-sub">
                                      {incident.message}
                                    </p>
                                    <p className="ops-row-meta">
                                      {formatRelative(incident.startedAt)}
                                      {" · "}
                                      {incident.source}
                                      {serviceNames
                                        ? ` · ${serviceNames}`
                                        : ""}
                                    </p>
                                    {incident.updates.length > 0 ? (
                                      <div className="admin-incident-updates">
                                        {incident.updates.map((update) => (
                                          <div
                                            key={update.id}
                                            className="update-item"
                                          >
                                            <span className="update-status">
                                              {update.status}
                                            </span>
                                            <span>{update.message}</span>
                                            <span className="update-time">
                                              {formatRelative(update.at)}
                                            </span>
                                          </div>
                                        ))}
                                      </div>
                                    ) : null}
                                  </div>
                                </div>
                                {isOpen ? (
                                  <div className="ops-row-actions">
                                    <button
                                      type="button"
                                      className="ghost-btn"
                                      onClick={() =>
                                        setAddingUpdateToIncidentId(
                                          addingUpdate ? null : incident.id,
                                        )
                                      }
                                      disabled={busy}
                                    >
                                      {addingUpdate ? "Cancel" : "Add update"}
                                    </button>
                                    <button
                                      type="button"
                                      className="primary-btn"
                                      onClick={() => resolveIncident(incident)}
                                      disabled={busy}
                                    >
                                      Resolve
                                    </button>
                                    <button
                                      type="button"
                                      className="danger-btn"
                                      onClick={() => removeIncident(incident)}
                                      disabled={busy}
                                    >
                                      Delete
                                    </button>
                                  </div>
                                ) : (
                                  <div className="ops-row-actions">
                                    <button
                                      type="button"
                                      className="danger-btn"
                                      onClick={() => removeIncident(incident)}
                                      disabled={busy}
                                    >
                                      Delete
                                    </button>
                                  </div>
                                )}
                                {addingUpdate ? (
                                  <form
                                    className="incident-update-form"
                                    onSubmit={(e) =>
                                      onIncidentUpdateSubmit(e, incident.id)
                                    }
                                  >
                                    <label>
                                      Status
                                      <AdminSelect
                                        value={incidentUpdateForm.status}
                                        onChange={(status) =>
                                          setIncidentUpdateForm((f) => ({
                                            ...f,
                                            status:
                                              status as IncidentUpdateStatus,
                                          }))
                                        }
                                        options={[
                                          ...INCIDENT_UPDATE_STATUS_OPTIONS,
                                        ]}
                                        ariaLabel="Incident update status"
                                        disabled={busy}
                                      />
                                    </label>
                                    <label>
                                      Message
                                      <textarea
                                        value={incidentUpdateForm.message}
                                        onChange={(e) =>
                                          setIncidentUpdateForm((f) => ({
                                            ...f,
                                            message: e.target.value,
                                          }))
                                        }
                                        placeholder="Update message"
                                        rows={2}
                                        required
                                      />
                                    </label>
                                    {incidentUpdateError ? (
                                      <p className="form-error">
                                        {incidentUpdateError}
                                      </p>
                                    ) : null}
                                    <button
                                      type="submit"
                                      className="primary-btn"
                                      disabled={busy}
                                    >
                                      {busy ? "Adding…" : "Add update"}
                                    </button>
                                  </form>
                                ) : null}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </section>

                    <aside className="admin-editor">
                      <form onSubmit={onIncidentSubmit}>
                        <div className="editor-head">
                          <div>
                            <p className="editor-kicker">New incident</p>
                            <h2>Create manual incident</h2>
                          </div>
                        </div>

                        <div className="form-stack">
                          <label>
                            Title
                            <input
                              value={incidentForm.title}
                              onChange={(e) =>
                                setIncidentForm((f) => ({
                                  ...f,
                                  title: e.target.value,
                                }))
                              }
                              placeholder="Service outage"
                              required
                            />
                          </label>
                          <label>
                            Message
                            <textarea
                              value={incidentForm.message}
                              onChange={(e) =>
                                setIncidentForm((f) => ({
                                  ...f,
                                  message: e.target.value,
                                }))
                              }
                              placeholder="Describe the issue"
                              rows={3}
                              required
                            />
                          </label>
                          <div className="form-field">
                            <span className="form-label">Status</span>
                            <SegmentedControl
                              value={incidentForm.status}
                              onChange={(status) =>
                                setIncidentForm((f) => ({
                                  ...f,
                                  status: status as "degraded" | "down",
                                }))
                              }
                              options={[
                                { value: "degraded", label: "Degraded" },
                                { value: "down", label: "Down" },
                              ]}
                              ariaLabel="Incident status"
                              disabled={busy}
                            />
                          </div>

                          <div className="maint-targets">
                            <p className="form-label">Affected services</p>
                            <div className="service-check-grid">
                              {services.map((service) => (
                                <label key={service.id} className="check-row">
                                  <input
                                    type="checkbox"
                                    checked={incidentForm.serviceIds.includes(
                                      service.id,
                                    )}
                                    onChange={() =>
                                      toggleIncidentService(service.id)
                                    }
                                  />
                                  {service.name}
                                </label>
                              ))}
                            </div>
                          </div>
                        </div>

                        {incidentError ? (
                          <p className="form-error">{incidentError}</p>
                        ) : null}
                        <button
                          type="submit"
                          className="primary-btn primary-btn-block"
                          disabled={busy}
                        >
                          {busy ? "Creating…" : "Create incident"}
                        </button>
                      </form>
                    </aside>
                  </motion.div>
                ) : (
                  <motion.div
                    key="notice"
                    className="admin-workspace"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.28 }}
                  >
                    <section className="admin-stream">
                      {announcement?.enabled ? (
                        <div
                          className={`announcement-preview tone-${announcement.tone}`}
                        >
                          <p className="announcement-label">
                            Current announcement ({announcement.tone})
                          </p>
                          <p className="announcement-text">
                            {announcement.message}
                          </p>
                          <p className="announcement-meta">
                            Updated {formatRelative(announcement.updatedAt)}
                          </p>
                        </div>
                      ) : (
                        <div className="admin-empty">
                          <p>No active announcement</p>
                          <span>Configure one from the editor.</span>
                        </div>
                      )}
                    </section>

                    <aside className="admin-editor">
                      <form onSubmit={onAnnouncementSubmit}>
                        <div className="editor-head">
                          <div>
                            <p className="editor-kicker">Announcement</p>
                            <h2>Manage notice</h2>
                          </div>
                        </div>

                        <div className="form-stack">
                          <label className="check-row">
                            <input
                              type="checkbox"
                              checked={announcementForm.enabled}
                              onChange={(e) =>
                                setAnnouncementForm((f) => ({
                                  ...f,
                                  enabled: e.target.checked,
                                }))
                              }
                            />
                            Enabled (visible to public)
                          </label>
                          <div className="form-field">
                            <span className="form-label">Tone</span>
                            <SegmentedControl
                              value={announcementForm.tone}
                              onChange={(tone) =>
                                setAnnouncementForm((f) => ({
                                  ...f,
                                  tone: tone as "info" | "warn",
                                }))
                              }
                              options={[
                                { value: "info", label: "Info" },
                                { value: "warn", label: "Warn" },
                              ]}
                              ariaLabel="Announcement tone"
                              disabled={busy}
                            />
                          </div>
                          <label>
                            Message
                            <textarea
                              value={announcementForm.message}
                              onChange={(e) =>
                                setAnnouncementForm((f) => ({
                                  ...f,
                                  message: e.target.value,
                                }))
                              }
                              placeholder="We're working on something exciting…"
                              rows={4}
                              required
                            />
                          </label>
                        </div>

                        {announcementError ? (
                          <p className="form-error">{announcementError}</p>
                        ) : null}
                        <div className="form-actions">
                          <button
                            type="submit"
                            className="primary-btn"
                            disabled={busy}
                          >
                            {busy ? "Saving…" : "Save"}
                          </button>
                          <button
                            type="button"
                            className="ghost-btn"
                            onClick={clearAnnouncement}
                            disabled={busy}
                          >
                            Clear
                          </button>
                        </div>
                      </form>
                    </aside>
                  </motion.div>
                )}
              </AnimatePresence>
            </main>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
