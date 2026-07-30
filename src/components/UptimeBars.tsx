"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { PublicServiceView } from "@/lib/types";
import { statusLabel } from "./StatusDot";

type DayBar = PublicServiceView["dayBars"][number];

function formatBarDate(isoDate: string) {
  const d = new Date(`${isoDate}T12:00:00Z`);
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function UptimeBars({ bars }: { bars: DayBar[] }) {
  const [active, setActive] = useState<{
    bar: DayBar;
    index: number;
  } | null>(null);

  return (
    <div
      className="uptime-bars"
      onMouseLeave={() => setActive(null)}
    >
      {bars.map((bar, index) => (
        <button
          key={bar.date}
          type="button"
          className={`uptime-bar ${bar.status}`}
          aria-label={`${formatBarDate(bar.date)}: ${
            bar.uptime == null ? "No data" : `${bar.uptime}% uptime`
          }`}
          onMouseEnter={() => setActive({ bar, index })}
          onFocus={() => setActive({ bar, index })}
          onBlur={() => setActive(null)}
        />
      ))}

      <AnimatePresence>
        {active ? (
          <motion.div
            className="uptime-tooltip"
            style={{
              left: `${(active.index / Math.max(bars.length - 1, 1)) * 100}%`,
            }}
            initial={{ opacity: 0, y: 6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            transition={{ duration: 0.16 }}
            role="tooltip"
          >
            <p className="uptime-tooltip-date">
              {formatBarDate(active.bar.date)}
            </p>
            <div className="uptime-tooltip-row">
              <span className={`uptime-tooltip-dot ${active.bar.status}`} />
              <strong>
                {active.bar.uptime == null
                  ? "No data"
                  : `${active.bar.uptime.toFixed(1)}%`}
              </strong>
              <span>{statusLabel(active.bar.status)}</span>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
