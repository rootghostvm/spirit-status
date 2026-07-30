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
import { StatusDot, statusLabel } from "./StatusDot";

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
      const res = await fetch(`/api/admin/incidents/${incidentId}/updates`, {
        method: "POST",
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
      const res = await fetch(`/api/admin/incidents/${incident.id}/resolve`, {
        method: "POST",
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

  if (loading) {
    return (
      <div className="admin-shell">
        <div className="admin-loading-block">
          <span className="loader" />
          <p>Loading control room…</p>
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
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="admin-login-copy">
              <p className="brand">SpiritHost</p>
              <h1>Status control</h1>
              <p>
                Monitor endpoints, announce maintenance, and keep the public
                status page honest.
              </p>
            </div>

            <form className="admin-login-card" onSubmit={onLogin}>
              <div className="admin-login-card-head">
                <h2>Admin access</h2>
                <a href="/" className="text-btn">
                  View public page
                </a>
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
            </form>
          </motion.div>
        ) : (
          <motion.div
            key="dash"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="admin-app"
          >
            <header className="admin-header">
              <div className="admin-header-brand">
                <p className="brand compact">SpiritHost</p>
                <div>
                  <h1>Control room</h1>
                  <p className="admin-subtitle">
                    {lastCheckAt
                      ? `Last probe ${formatRelative(lastCheckAt)}`
                      : "Waiting for first probe"}
                    {openIncidents
                      ? ` · ${openIncidents} open incident${openIncidents === 1 ? "" : "s"}`
                      : ""}
                  </p>
                </div>
              </div>
              <div className="admin-header-actions">
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={runCheckNow}
                  disabled={busy}
                >
                  Check now
                </button>
                <a href="/" className="ghost-link">
                  Public page
                </a>
                <button type="button" className="ghost-btn" onClick={onLogout}>
                  Log out
                </button>
              </div>
            </header>

            <section className="admin-metrics" aria-label="Status summary">
              <article className="metric-card">
                <span className="metric-label">Services</span>
                <strong>{services.length}</strong>
              </article>
              <article className="metric-card tone-up">
                <span className="metric-label">Operational</span>
                <strong>{upCount}</strong>
              </article>
              <article className="metric-card tone-warn">
                <span className="metric-label">Degraded</span>
                <strong>{degradedCount}</strong>
              </article>
              <article className="metric-card tone-maint">
                <span className="metric-label">Maintenance</span>
                <strong>{activeMaint}</strong>
                <em>{scheduledMaint} scheduled</em>
              </article>
              <article className="metric-card tone-down">
                <span className="metric-label">Down</span>
                <strong>{downCount}</strong>
              </article>
            </section>

            <nav className="admin-tabs" aria-label="Admin sections">
              <button
                type="button"
                className={tab === "services" ? "is-active" : ""}
                onClick={() => setTab("services")}
              >
                Services
                <span>{services.length}</span>
              </button>
              <button
                type="button"
                className={tab === "maintenance" ? "is-active" : ""}
                onClick={() => setTab("maintenance")}
              >
                Maintenance
                <span>{maintenances.length}</span>
              </button>
              <button
                type="button"
                className={tab === "incidents" ? "is-active" : ""}
                onClick={() => setTab("incidents")}
              >
                Incidents
                <span>{incidents.length}</span>
              </button>
              <button
                type="button"
                className={tab === "notice" ? "is-active" : ""}
                onClick={() => setTab("notice")}
              >
                Notice
              </button>
            </nav>

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
                    <div className="stream-head">
                      <h2>Monitored endpoints</h2>
                      <p>Click a service to edit it in the side panel.</p>
                    </div>

                    {!services.length ? (
                      <div className="admin-empty">
                        <p>No services yet</p>
                        <span>Add your first website on the right.</span>
                      </div>
                    ) : (
                      <ul className="entity-list">
                        {services.map((service, idx) => {
                          const status = service.enabled
                            ? (service.latest?.status ?? "unknown")
                            : "unknown";
                          const selected = editingId === service.id;
                          return (
                            <li key={service.id}>
                              <button
                                type="button"
                                className={`entity-card ${selected ? "is-selected" : ""}`}
                                onClick={() => startEdit(service)}
                              >
                                <div className="entity-main">
                                  <StatusDot status={status} />
                                  <div>
                                    <p className="entity-title">
                                      {service.name}
                                      <span className="group-chip">
                                        {service.group}
                                      </span>
                                    </p>
                                    <p className="entity-sub">{service.url}</p>
                                    <p className="entity-meta">
                                      {service.enabled
                                        ? statusLabel(status)
                                        : "Paused"}
                                      {" · "}
                                      {service.method}
                                      {service.latest?.responseMs != null
                                        ? ` · ${formatLatency(service.latest.responseMs)}`
                                        : ""}
                                    </p>
                                    {service.latest?.error ? (
                                      <p className="entity-error">
                                        {service.latest.error}
                                      </p>
                                    ) : null}
                                  </div>
                                </div>
                              </button>
                              <div className="entity-actions">
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
                                  disabled={busy || idx === 0}
                                >
                                  ↑
                                </button>
                                <button
                                  type="button"
                                  className="ghost-btn"
                                  onClick={() => moveService(service, "down")}
                                  disabled={busy || idx === services.length - 1}
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
                          <h2>{editingId ? "Edit service" : "Add service"}</h2>
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
                              setForm((f) => ({ ...f, name: e.target.value }))
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
                              setForm((f) => ({ ...f, url: e.target.value }))
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
                            />
                          </label>
                          <label>
                            Method
                            <select
                              value={form.method}
                              onChange={(e) =>
                                setForm((f) => ({
                                  ...f,
                                  method: e.target.value as CheckMethod,
                                }))
                              }
                            >
                              <option value="GET">GET</option>
                              <option value="HEAD">HEAD</option>
                            </select>
                          </label>
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
                        className="primary-btn"
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
                    <div className="stream-head">
                      <h2>Maintenance windows</h2>
                      <p>
                        Scheduled and active work shown on the public status
                        page.
                      </p>
                    </div>

                    {!sortedMaintenances.length ? (
                      <div className="admin-empty">
                        <p>No maintenance yet</p>
                        <span>Schedule a window from the editor.</span>
                      </div>
                    ) : (
                      <ul className="entity-list">
                        {sortedMaintenances.map((item) => {
                          const phase = maintenancePhase(item);
                          const selected = editingMaintId === item.id;
                          const names = !item.serviceIds.length
                            ? "All services"
                            : item.serviceIds
                                .map(
                                  (id) =>
                                    services.find((s) => s.id === id)?.name ??
                                    id,
                                )
                                .join(", ");
                          return (
                            <li key={item.id}>
                              <button
                                type="button"
                                className={`entity-card ${selected ? "is-selected" : ""}`}
                                onClick={() => startMaintEdit(item)}
                              >
                                <div className="entity-main">
                                  <StatusDot status="maintenance" />
                                  <div>
                                    <p className="entity-title">
                                      {item.title}
                                      <span
                                        className={`pill maintenance ${phase}`}
                                      >
                                        {phase}
                                      </span>
                                    </p>
                                    {item.message ? (
                                      <p className="entity-sub">
                                        {item.message}
                                      </p>
                                    ) : null}
                                    <p className="entity-meta">
                                      {formatWindow(item.startsAt, item.endsAt)}
                                      {" · "}
                                      {names}
                                    </p>
                                  </div>
                                </div>
                              </button>
                              <div className="entity-actions">
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
                                <label key={service.id} className="check-row">
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
                        className="primary-btn"
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
                    <div className="stream-head">
                      <h2>Incidents</h2>
                      <p>Open and resolved incidents shown to the public.</p>
                    </div>

                    {!sortedIncidents.length ? (
                      <div className="admin-empty">
                        <p>No incidents</p>
                        <span>Create a manual incident from the editor.</span>
                      </div>
                    ) : (
                      <ul className="entity-list">
                        {sortedIncidents.map((incident) => {
                          const isOpen = !incident.resolvedAt;
                          const serviceNames = incident.serviceIds
                            .map(
                              (id) =>
                                services.find((s) => s.id === id)?.name ?? id,
                            )
                            .join(", ");
                          const addingUpdate =
                            addingUpdateToIncidentId === incident.id;
                          return (
                            <li key={incident.id}>
                              <div className="entity-card">
                                <div className="entity-main">
                                  <StatusDot status={incident.status} />
                                  <div>
                                    <p className="entity-title">
                                      {incident.serviceName}
                                      <span
                                        className={`pill ${isOpen ? "open" : "resolved"}`}
                                      >
                                        {isOpen ? "Open" : "Resolved"}
                                      </span>
                                    </p>
                                    <p className="entity-sub">
                                      {incident.message}
                                    </p>
                                    <p className="entity-meta">
                                      {formatRelative(incident.startedAt)}
                                      {" · "}
                                      {incident.source}
                                      {serviceNames ? ` · ${serviceNames}` : ""}
                                    </p>
                                    {incident.updates.length > 0 ? (
                                      <div className="incident-updates">
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
                              </div>
                              {isOpen ? (
                                <div className="entity-actions">
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
                                </div>
                              ) : null}
                              {addingUpdate ? (
                                <form
                                  className="incident-update-form"
                                  onSubmit={(e) =>
                                    onIncidentUpdateSubmit(e, incident.id)
                                  }
                                >
                                  <label>
                                    Status
                                    <select
                                      value={incidentUpdateForm.status}
                                      onChange={(e) =>
                                        setIncidentUpdateForm((f) => ({
                                          ...f,
                                          status: e.target
                                            .value as IncidentUpdateStatus,
                                        }))
                                      }
                                    >
                                      <option value="investigating">
                                        Investigating
                                      </option>
                                      <option value="identified">
                                        Identified
                                      </option>
                                      <option value="monitoring">
                                        Monitoring
                                      </option>
                                      <option value="resolved">Resolved</option>
                                      <option value="update">Update</option>
                                    </select>
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
                        <label>
                          Status
                          <select
                            value={incidentForm.status}
                            onChange={(e) =>
                              setIncidentForm((f) => ({
                                ...f,
                                status: e.target.value as "degraded" | "down",
                              }))
                            }
                          >
                            <option value="degraded">Degraded</option>
                            <option value="down">Down</option>
                          </select>
                        </label>

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
                        className="primary-btn"
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
                    <div className="stream-head">
                      <h2>Public announcement</h2>
                      <p>
                        A banner shown at the top of the public status page.
                      </p>
                    </div>

                    {announcement?.enabled ? (
                      <div
                        className={`announcement-preview tone-${announcement.tone}`}
                      >
                        <p className="announcement-label">
                          Current announcement ({announcement.tone})
                        </p>
                        <p className="announcement-text">{announcement.message}</p>
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
                        <label>
                          Tone
                          <select
                            value={announcementForm.tone}
                            onChange={(e) =>
                              setAnnouncementForm((f) => ({
                                ...f,
                                tone: e.target.value as "info" | "warn",
                              }))
                            }
                          >
                            <option value="info">Info</option>
                            <option value="warn">Warning</option>
                          </select>
                        </label>
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
                      <div className="form-row">
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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
