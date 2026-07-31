import { ImageResponse } from "next/og";
import { BRAND_NAME, STATUS_TITLE } from "@/lib/config";
import { getPublicStatus, startMonitor } from "@/lib/checker";
import type { ServiceHealth } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const alt = `${BRAND_NAME} Status`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const tones: Record<
  ServiceHealth,
  { fill: string; soft: string; label: string }
> = {
  operational: {
    fill: "#0e7468",
    soft: "rgba(14, 116, 104, 0.14)",
    label: "All systems operational",
  },
  degraded: {
    fill: "#c57a12",
    soft: "rgba(197, 122, 18, 0.14)",
    label: "Partial disruption detected",
  },
  down: {
    fill: "#c03948",
    soft: "rgba(192, 57, 72, 0.14)",
    label: "Service disruption",
  },
  maintenance: {
    fill: "#1f6f8b",
    soft: "rgba(31, 111, 139, 0.14)",
    label: "Maintenance in progress",
  },
  unknown: {
    fill: "#4a5d72",
    soft: "rgba(74, 93, 114, 0.12)",
    label: "Gathering live status",
  },
};

function buildStats(summary: {
  total: number;
  operational: number;
  degraded: number;
  down: number;
  maintenance: number;
}) {
  const parts: string[] = [`${summary.total} monitored`];
  if (summary.operational > 0) parts.push(`${summary.operational} up`);
  if (summary.degraded > 0) parts.push(`${summary.degraded} degraded`);
  if (summary.down > 0) parts.push(`${summary.down} down`);
  if (summary.maintenance > 0) {
    parts.push(
      `${summary.maintenance} under maintenance`,
    );
  }
  return parts;
}

export default async function OpenGraphImage() {
  startMonitor();
  const status = await getPublicStatus();
  const tone = tones[status.overall] ?? tones.unknown;
  const title =
    STATUS_TITLE && !STATUS_TITLE.toLowerCase().includes("live availability")
      ? STATUS_TITLE
      : "System Status";
  const stats = buildStats(status.summary);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          overflow: "hidden",
          background: "#eef5f4",
          color: "#0e1c2b",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            background:
              "radial-gradient(900px 520px at 8% -10%, #c5ebe2 0%, transparent 55%), radial-gradient(780px 480px at 100% 0%, #d5e5f6 0%, transparent 50%), radial-gradient(640px 420px at 70% 110%, #e4f0d8 0%, transparent 45%), linear-gradient(180deg, #e7f2f3 0%, #f3f8f7 48%, #eef4f1 100%)",
          }}
        />

        <div
          style={{
            position: "absolute",
            right: -80,
            top: -60,
            width: 420,
            height: 420,
            borderRadius: 999,
            background: tone.soft,
            display: "flex",
          }}
        />
        <div
          style={{
            position: "absolute",
            right: 120,
            bottom: -140,
            width: 360,
            height: 360,
            borderRadius: 999,
            background: "rgba(14, 116, 104, 0.08)",
            display: "flex",
          }}
        />

        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            width: "100%",
            height: "100%",
            padding: "56px 64px",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div
              style={{
                display: "flex",
                fontSize: 56,
                fontWeight: 700,
                letterSpacing: "-0.055em",
                lineHeight: 0.95,
              }}
            >
              {BRAND_NAME}
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 28,
                fontWeight: 600,
                letterSpacing: "-0.02em",
                color: "#4a5d72",
              }}
            >
              {title}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 20,
                padding: "22px 26px",
                borderRadius: 28,
                background: "rgba(255,255,255,0.72)",
                border: "1px solid rgba(255,255,255,0.9)",
                boxShadow: "0 18px 40px rgba(14, 48, 56, 0.08)",
                width: "auto",
                alignSelf: "flex-start",
              }}
            >
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 999,
                  background: tone.fill,
                  boxShadow: `0 0 0 10px ${tone.soft}`,
                  display: "flex",
                  flexShrink: 0,
                }}
              />
              <div
                style={{
                  display: "flex",
                  fontSize: 42,
                  fontWeight: 700,
                  letterSpacing: "-0.04em",
                  lineHeight: 1.05,
                }}
              >
                {tone.label}
              </div>
            </div>

            <div
              style={{
                display: "flex",
                gap: 14,
                flexWrap: "wrap",
              }}
            >
              {stats.map((item) => (
                <div
                  key={item}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "12px 18px",
                    borderRadius: 999,
                    background: "rgba(14, 28, 43, 0.06)",
                    color: "#24384d",
                    fontSize: 24,
                    fontWeight: 600,
                    letterSpacing: "-0.01em",
                  }}
                >
                  {item}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
