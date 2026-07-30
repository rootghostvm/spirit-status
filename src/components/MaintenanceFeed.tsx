"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { PublicMaintenance } from "@/lib/types";
import { formatWindow } from "@/lib/format";

function MaintenanceItem({
  item,
  index,
}: {
  item: PublicMaintenance;
  index: number;
}) {
  return (
    <motion.div
      className={`maint-item phase-${item.phase}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.04 * index, duration: 0.35 }}
    >
      <div className="maint-item-rail" aria-hidden />
      <div className="maint-item-body">
        <div className="maint-item-head">
          <p className="maint-item-title">{item.title}</p>
          <span className={`maint-flag ${item.phase}`}>
            {item.phase === "active"
              ? "Live"
              : item.phase === "scheduled"
                ? "Upcoming"
                : "Completed"}
          </span>
        </div>
        {item.message ? <p className="maint-item-copy">{item.message}</p> : null}
        <p className="maint-item-meta">
          {formatWindow(item.startsAt, item.endsAt)}
          <span aria-hidden>·</span>
          {item.serviceNames.join(", ") || "All services"}
        </p>
      </div>
    </motion.div>
  );
}

export function MaintenanceFeed({
  maintenances,
  history = [],
}: {
  maintenances: PublicMaintenance[];
  history?: PublicMaintenance[];
}) {
  const [showHistory, setShowHistory] = useState(false);
  const current = [
    ...maintenances.filter((m) => m.phase === "active"),
    ...maintenances.filter((m) => m.phase === "scheduled"),
  ];

  if (!current.length && !history.length) return null;

  return (
    <section className="maint-strip" id="maintenance" aria-label="Maintenance">
      {current.map((item, index) => (
        <MaintenanceItem key={item.id} item={item} index={index} />
      ))}

      {history.length ? (
        <div className="maint-history">
          <button
            type="button"
            className="maint-history-toggle"
            onClick={() => setShowHistory((v) => !v)}
            aria-expanded={showHistory}
          >
            <span>Past maintenance</span>
            <span className="maint-history-count">{history.length}</span>
            <span className={`chevron ${showHistory ? "open" : ""}`} aria-hidden />
          </button>

          <AnimatePresence initial={false}>
            {showHistory ? (
              <motion.div
                className="maint-history-list"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.28 }}
              >
                {history.map((item, index) => (
                  <MaintenanceItem key={item.id} item={item} index={index} />
                ))}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>
      ) : null}
    </section>
  );
}
