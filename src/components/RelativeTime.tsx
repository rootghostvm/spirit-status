"use client";

import { useEffect, useState } from "react";
import { formatRelative } from "@/lib/format";

export function RelativeTime({
  iso,
  prefix = "",
  fallback = "just now",
}: {
  iso: string | null | undefined;
  prefix?: string;
  fallback?: string;
}) {
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    if (!iso) {
      setText(null);
      return;
    }

    const tick = () => setText(formatRelative(iso));
    tick();
    // Tick every second while recent so "checked Xs ago" stays honest.
    const id = window.setInterval(tick, 1_000);
    return () => window.clearInterval(id);
  }, [iso]);

  if (!iso) {
    return (
      <span suppressHydrationWarning>
        {prefix}
        {fallback}
      </span>
    );
  }

  return (
    <span suppressHydrationWarning>
      {prefix}
      {text ?? "…"}
    </span>
  );
}
