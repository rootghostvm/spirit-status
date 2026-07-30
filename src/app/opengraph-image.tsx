import { ImageResponse } from "next/og";
import { BRAND_NAME, STATUS_TITLE } from "@/lib/config";
import { getPublicStatus, startMonitor } from "@/lib/checker";
import { statusLabel } from "@/lib/labels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const alt = `${BRAND_NAME} Status`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const tones: Record<string, { fill: string; label: string }> = {
  operational: { fill: "#0e7468", label: "All systems operational" },
  degraded: { fill: "#c57a12", label: "Partial disruption" },
  down: { fill: "#c03948", label: "Service disruption" },
  maintenance: { fill: "#1f6f8b", label: "Maintenance in progress" },
  unknown: { fill: "#4a5d72", label: "Gathering status" },
};

export default async function OpenGraphImage() {
  startMonitor();
  const status = await getPublicStatus();
  const tone = tones[status.overall] ?? tones.unknown;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          background: "linear-gradient(145deg, #e7f2f3 0%, #f3f8f7 45%, #dfeef0 100%)",
          color: "#0e1c2b",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div
            style={{
              fontSize: 42,
              fontWeight: 700,
              letterSpacing: "-0.04em",
            }}
          >
            {BRAND_NAME}
          </div>
          <div
            style={{
              fontSize: 64,
              fontWeight: 700,
              letterSpacing: "-0.05em",
              lineHeight: 1.05,
            }}
          >
            {STATUS_TITLE}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 999,
                background: tone.fill,
              }}
            />
            <div
              style={{
                fontSize: 40,
                fontWeight: 650,
                letterSpacing: "-0.03em",
              }}
            >
              {tone.label}
            </div>
          </div>
          <div
            style={{
              display: "flex",
              gap: 28,
              fontSize: 26,
              color: "#4a5d72",
            }}
          >
            <span>
              {status.summary.operational}/{status.summary.total} up
            </span>
            <span>{statusLabel(status.overall)}</span>
            <span>{status.summary.maintenance} maintenance</span>
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
