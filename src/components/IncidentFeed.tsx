"use client";

import { motion } from "framer-motion";
import type { Incident } from "@/lib/types";
import { formatDuration, formatRelative } from "@/lib/format";
import { StatusDot, statusLabel } from "./StatusDot";

const updateLabels: Record<string, string> = {
  investigating: "Investigating",
  identified: "Identified",
  monitoring: "Monitoring",
  resolved: "Resolved",
  update: "Update",
};

export function IncidentFeed({ incidents }: { incidents: Incident[] }) {
  const open = incidents.filter((i) => !i.resolvedAt);
  const recent = incidents.filter((i) => i.resolvedAt).slice(0, 5);
  const shown = [...open, ...recent];

  if (!shown.length) return null;

  return (
    <section className="incidents" id="incidents">
      <div className="services-heading">
        <h2>Incidents</h2>
        <p>Active issues and recent resolutions.</p>
      </div>

      <ul className="incident-list">
        {shown.map((incident, index) => (
          <motion.li
            key={incident.id}
            className="incident-row"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.04 * index }}
          >
            <StatusDot status={incident.status} />
            <div className="incident-body">
              <div className="incident-top">
                <p className="incident-title">
                  {incident.serviceName} · {statusLabel(incident.status)}
                </p>
                <span
                  className={`pill ${incident.resolvedAt ? "operational" : incident.status}`}
                >
                  {incident.resolvedAt ? "Resolved" : "Active"}
                </span>
              </div>
              <p className="incident-msg">{incident.message}</p>
              <p className="incident-meta">
                Started {formatRelative(incident.startedAt)} · lasted{" "}
                {formatDuration(incident.startedAt, incident.resolvedAt)}
                {incident.source === "manual" ? " · posted by admin" : ""}
              </p>

              {incident.updates?.length ? (
                <ol className="incident-updates">
                  {[...incident.updates].reverse().map((update) => (
                    <li key={update.id}>
                      <strong>
                        {updateLabels[update.status] || "Update"}
                      </strong>
                      <span>{formatRelative(update.at)}</span>
                      <p>{update.message}</p>
                    </li>
                  ))}
                </ol>
              ) : null}
            </div>
          </motion.li>
        ))}
      </ul>
    </section>
  );
}
