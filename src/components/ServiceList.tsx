"use client";

import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { PublicServiceView, PublicStatusPayload } from "@/lib/types";
import { formatLatency } from "@/lib/format";
import { StatusDot, statusLabel } from "./StatusDot";
import { UptimeBars } from "./UptimeBars";
import { RelativeTime } from "./RelativeTime";

export function ServiceList({
  groups,
  embedded = false,
}: {
  groups: PublicStatusPayload["groups"];
  embedded?: boolean;
}) {
  if (!groups.length) {
    return (
      <section className={embedded ? undefined : "services"}>
        <p className="empty">No services are being monitored yet.</p>
      </section>
    );
  }

  const body = (
    <>
      {groups.map((group) => (
        <div key={group.name} className="service-group">
          <h3 className="group-title">{group.name}</h3>
          <ul className="service-list">
            {group.services.map((service, index) => (
              <ServiceRow key={service.id} service={service} index={index} />
            ))}
          </ul>
        </div>
      ))}
    </>
  );

  if (embedded) return <div className="services-body">{body}</div>;

  return (
    <section className="services" aria-label="Service status">
      <div className="services-heading">
        <h2>Services</h2>
        <p>90-day health bars, live latency, and per-endpoint detail.</p>
      </div>
      {body}
    </section>
  );
}

function ServiceRow({
  service,
  index,
}: {
  service: PublicServiceView;
  index: number;
}) {
  const [open, setOpen] = useState(false);
  const status = service.displayStatus;

  return (
    <motion.li
      className={`service-row ${open ? "is-open" : ""}`}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.45,
        delay: 0.04 * index,
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      <button
        type="button"
        className="service-row-btn"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <div className="service-main">
          <StatusDot status={status} />
          <div>
            <p className="service-name">{service.name}</p>
            {service.description ? (
              <p className="service-desc">{service.description}</p>
            ) : null}
          </div>
        </div>

        <div className="service-meta">
          <span className={`pill ${status}`}>{statusLabel(status)}</span>
          {service.uptime24h != null ? (
            <span className="meta-stat">{service.uptime24h.toFixed(1)}%</span>
          ) : null}
          <span className="meta-stat">
            {formatLatency(service.latest?.responseMs)}
          </span>
          <span className={`chevron ${open ? "open" : ""}`} aria-hidden />
        </div>
      </button>

      <div className="uptime-bars-wrap">
        <UptimeBars bars={service.dayBars} />
      </div>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            className="service-detail"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="detail-grid">
              <Detail
                label="24h uptime"
                value={
                  service.uptime24h == null
                    ? "—"
                    : `${service.uptime24h.toFixed(1)}%`
                }
              />
              <Detail
                label="90d uptime"
                value={
                  service.uptime90d == null
                    ? "—"
                    : `${service.uptime90d.toFixed(1)}%`
                }
              />
              <Detail
                label="Avg latency"
                value={formatLatency(service.avgLatencyMs)}
              />
              <Detail
                label="Last check"
                value={
                  <RelativeTime
                    iso={service.latest?.checkedAt}
                    fallback="never"
                  />
                }
              />
              <Detail
                label="Status code"
                value={
                  service.latest?.statusCode != null
                    ? String(service.latest.statusCode)
                    : "—"
                }
              />
              <Detail label="State" value={statusLabel(status)} />
            </div>

            <div className="sparkline-wrap">
              <p className="detail-label">Latency trend</p>
              <Sparkline values={service.sparkline} />
            </div>

            {service.latest?.error ? (
              <p className="detail-error">{service.latest.error}</p>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.li>
  );
}

function Detail({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div>
      <p className="detail-label">{label}</p>
      <p className="detail-value">{value}</p>
    </div>
  );
}

function Sparkline({ values }: { values: Array<number | null> }) {
  const usable = values
    .map((v, i) => ({ v, i }))
    .filter((p): p is { v: number; i: number } => p.v != null);

  if (usable.length < 2) {
    return <p className="sparkline-empty">Not enough successful samples yet</p>;
  }

  const max = Math.max(...usable.map((p) => p.v), 1);
  const width = 280;
  const height = 48;
  const points = usable
    .map(({ v, i }) => {
      const x = (i / Math.max(values.length - 1, 1)) * width;
      const y = height - (v / max) * (height - 4) - 2;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg
      className="sparkline"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Latency sparkline"
    >
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={points}
      />
    </svg>
  );
}
