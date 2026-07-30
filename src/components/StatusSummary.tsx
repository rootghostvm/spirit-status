"use client";

import { motion } from "framer-motion";
import type { PublicStatusPayload } from "@/lib/types";

export function StatusSummary({
  summary,
}: {
  summary: PublicStatusPayload["summary"];
}) {
  return (
    <motion.section
      className="summary-strip"
      aria-label="Status summary"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2, duration: 0.55 }}
    >
      <SummaryStat label="Monitored" value={summary.total} />
      <SummaryStat label="Up" value={summary.operational} tone="up" />
      <SummaryStat label="Degraded" value={summary.degraded} tone="warn" />
      <SummaryStat label="Down" value={summary.down} tone="down" />
      <SummaryStat
        label="Maintenance"
        value={summary.maintenance}
        tone="maint"
      />
    </motion.section>
  );
}

function SummaryStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "up" | "warn" | "down" | "maint";
}) {
  return (
    <div className={`summary-stat ${tone ? `tone-${tone}` : ""}`}>
      <span className="summary-value">{value}</span>
      <span className="summary-label">{label}</span>
    </div>
  );
}
