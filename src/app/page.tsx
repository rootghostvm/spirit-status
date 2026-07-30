import { StatusPageClient } from "@/components/StatusPageClient";
import { getPublicStatus, startMonitor } from "@/lib/checker";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  startMonitor();
  const initial = await getPublicStatus();
  return <StatusPageClient initial={initial} />;
}
