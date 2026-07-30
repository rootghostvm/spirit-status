"use client";

import { motion } from "framer-motion";
import type { Announcement } from "@/lib/types";

export function AnnouncementBanner({
  announcement,
}: {
  announcement: Announcement | null;
}) {
  if (!announcement?.enabled || !announcement.message) return null;

  return (
    <motion.aside
      className={`announce-banner tone-${announcement.tone}`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      role="status"
    >
      <span className="announce-kicker">Notice</span>
      <p>{announcement.message}</p>
    </motion.aside>
  );
}
