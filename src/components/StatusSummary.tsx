"use client";

import { motion } from "framer-motion";
import type { PublicStatusPayload } from "@/lib/types";

export function StatusSummary({
  summary,
}: {
  summary: PublicStatusPayload["summary"];
}) {
  const parts = [
    { label: "monitored", value: summary.total },
    { label: "up", value: summary.operational, tone: "up" as const },
    ...(summary.degraded
      ? [{ label: "degraded", value: summary.degraded, tone: "warn" as const }]
      : []),
    ...(summary.down
      ? [{ label: "down", value: summary.down, tone: "down" as const }]
      : []),
    ...(summary.maintenance
      ? [
          {
            label: "maintenance",
            value: summary.maintenance,
            tone: "maint" as const,
          },
        ]
      : []),
    ...(summary.paused
      ? [{ label: "paused", value: summary.paused }]
      : []),
  ];

  return (
    <motion.p
      className="summary-line"
      aria-label="Status summary"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15, duration: 0.45 }}
    >
      {parts.map((part, index) => (
        <span key={part.label} className="summary-line-item">
          {index > 0 ? <span className="summary-line-sep" aria-hidden>·</span> : null}
          <strong className={part.tone ? `tone-${part.tone}` : undefined}>
            {part.value}
          </strong>{" "}
          {part.label}
        </span>
      ))}
    </motion.p>
  );
}
