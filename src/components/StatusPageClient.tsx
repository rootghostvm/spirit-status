"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PublicStatusPayload } from "@/lib/types";
import { StatusHero } from "./StatusHero";
import { StatusSummary } from "./StatusSummary";
import { AnnouncementBanner } from "./AnnouncementBanner";
import { ServiceList } from "./ServiceList";
import { MaintenanceFeed } from "./MaintenanceFeed";
import { IncidentFeed } from "./IncidentFeed";

export function StatusPageClient({
  initial,
}: {
  initial: PublicStatusPayload;
}) {
  const [data, setData] = useState(initial);
  const [tick, setTick] = useState(initial.nextCheckInMs);
  const [mounted, setMounted] = useState(false);
  const fetching = useRef(false);

  const refresh = useCallback(async () => {
    if (fetching.current) return;
    fetching.current = true;
    try {
      const res = await fetch("/api/status", { cache: "no-store" });
      if (!res.ok) return;
      const json = (await res.json()) as PublicStatusPayload;
      setData(json);
      setTick(json.nextCheckInMs);
    } catch {
      // keep last known state
    } finally {
      fetching.current = false;
    }
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setData(initial);
    setTick(initial.nextCheckInMs);
  }, [initial]);

  useEffect(() => {
    if (!mounted) return;
    const id = window.setInterval(() => {
      setTick((current) => Math.max(0, current - 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, [mounted]);

  // Light polling — status API must stay fast (no waiting on probes).
  useEffect(() => {
    if (!mounted) return;
    const id = window.setInterval(() => {
      void refresh();
    }, 10_000);
    return () => window.clearInterval(id);
  }, [mounted, refresh]);

  return (
    <div className="page-shell">
      <StatusHero
        brand={data.brand}
        title={data.title}
        overall={data.overall}
        lastCheckAt={data.lastCheckAt}
        nextCheckInMs={mounted ? tick : initial.nextCheckInMs}
        checkIntervalMs={data.checkIntervalMs}
        probing={data.probing}
      />

      <AnnouncementBanner announcement={data.announcement} />
      <StatusSummary summary={data.summary} />
      <MaintenanceFeed
        maintenances={data.maintenances}
        history={data.maintenanceHistory}
      />
      <ServiceList groups={data.groups} />
      <IncidentFeed incidents={data.incidents} />

      <footer className="site-footer">
        <p>
          {data.brand} Status · probing every{" "}
          {Math.round(data.checkIntervalMs / 1000)}s
        </p>
        <div className="footer-actions">
          <button
            type="button"
            className="text-btn"
            onClick={() => void refresh()}
          >
            Refresh
          </button>
          <a href="/api/feed">RSS</a>
          <a href="/api/badge" target="_blank" rel="noreferrer">
            Badge
          </a>
        </div>
      </footer>
    </div>
  );
}
