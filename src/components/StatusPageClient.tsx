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
  const dueRefreshLock = useRef(false);

  const applyStatus = useCallback((json: PublicStatusPayload) => {
    // Always trust the server clock — pinning client lastCheckAt caused stale countdowns.
    setData(json);
    setTick(json.nextCheckInMs);
  }, []);

  const refresh = useCallback(async () => {
    if (fetching.current) return;
    fetching.current = true;
    try {
      const res = await fetch("/api/status", {
        cache: "no-store",
        headers: { "Cache-Control": "no-store" },
      });
      if (!res.ok) return;
      const json = (await res.json()) as PublicStatusPayload;
      applyStatus(json);
    } catch {
      // keep last known state
    } finally {
      fetching.current = false;
    }
  }, [applyStatus]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    applyStatus(initial);
  }, [initial, applyStatus]);

  useEffect(() => {
    if (!mounted) return;
    const id = window.setInterval(() => {
      setTick((current) => Math.max(0, current - 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, [mounted]);

  useEffect(() => {
    if (!mounted) return;
    const id = window.setInterval(() => {
      void refresh();
    }, 8_000);
    return () => window.clearInterval(id);
  }, [mounted, refresh]);

  useEffect(() => {
    if (!mounted) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [mounted, refresh]);

  useEffect(() => {
    if (!mounted || tick > 0) {
      dueRefreshLock.current = false;
      return;
    }
    if (dueRefreshLock.current) return;
    dueRefreshLock.current = true;
    void refresh();
  }, [mounted, tick, refresh]);

  return (
    <div className="page-shell">
      <StatusHero
        brand={data.brand}
        title={data.title}
        overall={data.overall}
        nextCheckInMs={mounted ? tick : initial.nextCheckInMs}
        checkIntervalMs={data.checkIntervalMs}
      />

      <div className="status-board">
        <AnnouncementBanner announcement={data.announcement} />

        <section className="board-section services-section">
          <div className="services-heading">
            <div>
              <h2>Services</h2>
              <p>90-day health, live latency, and endpoint detail.</p>
            </div>
            <StatusSummary summary={data.summary} />
          </div>
          <ServiceList groups={data.groups} embedded />
        </section>

        <MaintenanceFeed
          maintenances={data.maintenances}
          history={data.maintenanceHistory}
        />
        <IncidentFeed incidents={data.incidents} />
      </div>

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
