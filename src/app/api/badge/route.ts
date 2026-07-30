import { getPublicStatus, startMonitor } from "@/lib/checker";
import { statusLabel } from "@/lib/labels";

export const dynamic = "force-dynamic";

const colors: Record<string, string> = {
  operational: "#0f7a6c",
  degraded: "#c57a12",
  down: "#c03948",
  maintenance: "#1f6f8b",
  unknown: "#7d8b9a",
};

export async function GET() {
  startMonitor();
  const status = await getPublicStatus();
  const label = statusLabel(status.overall);
  const color = colors[status.overall] ?? colors.unknown;
  const text = `${status.brand}: ${label}`;
  const width = Math.max(118, 12 + text.length * 7.2);

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="28" role="img" aria-label="${text}">
  <title>${text}</title>
  <rect width="${width}" height="28" rx="6" fill="#102033"/>
  <circle cx="14" cy="14" r="4" fill="${color}"/>
  <text x="26" y="18" fill="#ffffff" font-family="Segoe UI, Helvetica, Arial, sans-serif" font-size="12" font-weight="600">${text}</text>
</svg>`;

  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
