"use client";

import { motion } from "framer-motion";
import type { ServiceHealth } from "@/lib/types";
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
  nextCheckInMs,
  checkIntervalMs,
}: {
  brand: string;
  title: string;
  overall: ServiceHealth;
  nextCheckInMs: number;
  checkIntervalMs: number;
}) {
  const progress = Math.max(
    0,
    Math.min(1, 1 - nextCheckInMs / Math.max(checkIntervalMs, 1)),
  );

  return (
    <header className={`hero overall-${overall}`}>
      <motion.div
        className="hero-wash"
        aria-hidden
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
      />
      <motion.div
        className={`hero-ambient overall-${overall}`}
        aria-hidden
        initial={{ opacity: 0, scale: 0.88 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 1.15, ease: [0.22, 1, 0.36, 1] }}
      />

      <div className="hero-inner">
        <motion.div
          className="hero-kicker"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <span className="live-pill">
            <span className="live-pulse" />
            Live
          </span>
          <span className="hero-kicker-title">{title}</span>
          <span className="hero-kicker-sep" aria-hidden>
            ·
          </span>
          <span>Probe every {Math.round(checkIntervalMs / 1000)}s</span>
        </motion.div>

        <motion.p
          className="brand"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        >
          {brand}
        </motion.p>

        <motion.div
          className="overall"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
        >
          <StatusDot status={overall} size="lg" />
          <div>
            <h1 className="overall-label">{headlines[overall]}</h1>
            <p className="overall-meta">{statusLabel(overall)}</p>
          </div>
        </motion.div>

        <motion.p
          className="hero-copy"
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65, delay: 0.14 }}
        >
          Live availability across {brand} services.
        </motion.p>

        <motion.div
          className="check-meter"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.26, duration: 0.55 }}
        >
          <div className="check-meter-track">
            <motion.div
              className="check-meter-fill"
              animate={{ scaleX: progress }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            />
          </div>
          <span suppressHydrationWarning>
            {nextCheckInMs <= 0
              ? "Next probe due"
              : `Next probe in ${Math.ceil(nextCheckInMs / 1000)}s`}
          </span>
        </motion.div>
      </div>
    </header>
  );
}
