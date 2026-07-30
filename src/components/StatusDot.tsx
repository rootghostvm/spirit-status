import type { ServiceHealth } from "@/lib/types";
import { statusLabel as labelFromLib } from "@/lib/labels";

const tones: Record<ServiceHealth, string> = {
  operational: "tone-up",
  degraded: "tone-warn",
  down: "tone-down",
  maintenance: "tone-maint",
  unknown: "tone-unknown",
};

export function StatusDot({
  status,
  size = "md",
}: {
  status: ServiceHealth;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <span
      className={`status-dot ${tones[status]} size-${size}`}
      aria-hidden
    />
  );
}

export function statusLabel(status: ServiceHealth) {
  return labelFromLib(status);
}
