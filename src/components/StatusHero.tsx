"use client";

import { motion } from "framer-motion";
import type { ServiceHealth } from "@/lib/types";
import { formatRelative } from "@/lib/format";
import { StatusDot, statusLabel } from "./StatusDot";

const headlines: Record<ServiceHealth, string> = {
  operational: "All systems operational",
  degraded: "Partial disruption detected",
  down: "We're investigating an outage",
  maintenance: "Scheduled maintenance in progress",
  unknown: "Gathering live status",
};

export function StatusHero({
  brand,
  title,
  overall,
  lastCheckAt,
  nextCheckInMs,
  checkIntervalMs,
}: {
  brand: string;
  title: string;
  overall: ServiceHealth;
  lastCheckAt: string | null;
  nextCheckInMs: number;
  checkIntervalMs: number;
}) {
  const progress = Math.max(
    0,
    Math.min(1, 1 - nextCheckInMs / Math.max(checkIntervalMs, 1)),
  );

  return (
    <header className="hero">
      <motion.div
        className={`hero-ambient overall-${overall}`}
        aria-hidden
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
      />

      <div className="hero-inner">
        <motion.div
          className="hero-kicker"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55 }}
        >
          <span className="live-pill">
            <span className="live-pulse" />
            Live
          </span>
          <span>Auto-refresh · {Math.round(checkIntervalMs / 1000)}s</span>
        </motion.div>

        <motion.p
          className="brand"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        >
          {brand}
        </motion.p>

        <motion.h1
          className="hero-title"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.75, delay: 0.06, ease: [0.22, 1, 0.36, 1] }}
        >
          {title}
        </motion.h1>

        <motion.p
          className="hero-copy"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.12 }}
        >
          Live availability across {brand} services.
        </motion.p>

        <motion.div
          className="overall"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.75, delay: 0.18 }}
        >
          <StatusDot status={overall} size="lg" />
          <div>
            <p className="overall-label">{headlines[overall]}</p>
            <p className="overall-meta">
              {statusLabel(overall)}
              {lastCheckAt
                ? ` · checked ${formatRelative(lastCheckAt)}`
                : " · first check running"}
            </p>
          </div>
        </motion.div>

        <motion.div
          className="check-meter"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.28, duration: 0.6 }}
        >
          <div className="check-meter-track">
            <motion.div
              className="check-meter-fill"
              animate={{ scaleX: progress }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            />
          </div>
          <span>Next probe in {Math.ceil(nextCheckInMs / 1000)}s</span>
        </motion.div>
      </div>
    </header>
  );
}
