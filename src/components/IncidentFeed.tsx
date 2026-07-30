"use client";

import { useEffect, useState } from "react";
import { formatDuration } from "@/lib/format";
import type { Incident } from "@/lib/types";
import { StatusDot, statusLabel } from "./StatusDot";
import { RelativeTime } from "./RelativeTime";

const updateLabels: Record<string, string> = {
  investigating: "Investigating",
  identified: "Identified",
  monitoring: "Monitoring",
  resolved: "Resolved",
  update: "Update",
};

function LiveDuration({
  startIso,
  endIso,
}: {
  startIso: string;
  endIso?: string | null;
}) {
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    if (endIso) {
      setText(formatDuration(startIso, endIso));
      return;
    }
    const tick = () => setText(formatDuration(startIso, null));
    tick();
    const id = window.setInterval(tick, 15_000);
    return () => window.clearInterval(id);
  }, [startIso, endIso]);

  return <span suppressHydrationWarning>{text ?? "…"}</span>;
}

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
        {shown.map((incident) => (
          <li key={incident.id} className="incident-row">
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
                Started <RelativeTime iso={incident.startedAt} /> · lasted{" "}
                <LiveDuration
                  startIso={incident.startedAt}
                  endIso={incident.resolvedAt}
                />
                {incident.source === "manual" ? " · posted by admin" : ""}
              </p>

              {incident.updates?.length ? (
                <ol className="incident-updates">
                  {[...incident.updates].reverse().map((update) => (
                    <li key={update.id}>
                      <strong>
                        {updateLabels[update.status] || "Update"}
                      </strong>
                      <RelativeTime iso={update.at} />
                      <p>{update.message}</p>
                    </li>
                  ))}
                </ol>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
