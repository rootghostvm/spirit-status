import type { Metadata } from "next";
import { StatusPageClient } from "@/components/StatusPageClient";
import { BRAND_NAME, SITE_URL, STATUS_TITLE } from "@/lib/config";
import { getPublicStatus, startMonitor } from "@/lib/checker";
import { statusLabel } from "@/lib/labels";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  startMonitor();
  const status = await getPublicStatus();
  const headline =
    status.overall === "operational"
      ? "All systems operational"
      : status.overall === "down"
        ? "Service disruption"
        : status.overall === "degraded"
          ? "Partial disruption"
          : status.overall === "maintenance"
            ? "Maintenance in progress"
            : "Live system status";

  const description = `${headline}. ${status.summary.operational}/${status.summary.total} services up · ${statusLabel(status.overall)}.`;

  return {
    title: `${BRAND_NAME} · ${STATUS_TITLE}`,
    description,
    openGraph: {
      title: `${BRAND_NAME} · ${headline}`,
      description,
      url: SITE_URL,
      type: "website",
      siteName: `${BRAND_NAME} Status`,
    },
    twitter: {
      card: "summary_large_image",
      title: `${BRAND_NAME} · ${headline}`,
      description,
    },
  };
}

export default async function HomePage() {
  startMonitor();
  const initial = await getPublicStatus();
  return <StatusPageClient initial={initial} />;
}
