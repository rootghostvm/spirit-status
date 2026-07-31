"use client";

import { motion } from "framer-motion";
import type { Announcement } from "@/lib/types";

export function AnnouncementBanner({
  announcement,
  compact = false,
}: {
  announcement: Announcement | null;
  compact?: boolean;
}) {
  if (!announcement?.enabled || !announcement.message) return null;

  const isWarn = announcement.tone === "warn";

  return (
    <motion.aside
      className={`announce-banner tone-${announcement.tone}${compact ? " is-compact" : ""}`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      role="status"
    >
      <div className="announce-accent" aria-hidden />
      <div className="announce-body">
        <div className="announce-top">
          <span className="announce-icon" aria-hidden>
            {isWarn ? "!" : "i"}
          </span>
          <span className="announce-kicker">
            {isWarn ? "Important notice" : "Notice"}
          </span>
        </div>
        <p className="announce-message">{announcement.message}</p>
      </div>
    </motion.aside>
  );
}
