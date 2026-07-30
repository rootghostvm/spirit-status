import { getPublicStatus, startMonitor } from "@/lib/checker";
import { statusLabel } from "@/lib/labels";

export const dynamic = "force-dynamic";

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export async function GET(request: Request) {
  startMonitor();
  const status = await getPublicStatus();
  const origin = new URL(request.url).origin;
  const items = [
    ...status.incidents.slice(0, 15).map((incident) => ({
      title: `${incident.serviceName}: ${statusLabel(incident.status)}`,
      description: incident.message,
      date: incident.resolvedAt || incident.startedAt,
      link: `${origin}/#incidents`,
      guid: incident.id,
    })),
    ...status.maintenances.map((m) => ({
      title: `Maintenance: ${m.title}`,
      description: m.message || m.title,
      date: m.startsAt,
      link: `${origin}/#maintenance`,
      guid: m.id,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escapeXml(status.brand)} Status</title>
    <link>${escapeXml(origin)}</link>
    <description>Incidents and maintenance for ${escapeXml(status.brand)}</description>
    <lastBuildDate>${new Date(status.lastCheckAt || Date.now()).toUTCString()}</lastBuildDate>
    ${items
      .map(
        (item) => `<item>
      <title>${escapeXml(item.title)}</title>
      <description>${escapeXml(item.description)}</description>
      <link>${escapeXml(item.link)}</link>
      <guid isPermaLink="false">${escapeXml(item.guid)}</guid>
      <pubDate>${new Date(item.date).toUTCString()}</pubDate>
    </item>`,
      )
      .join("\n    ")}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
