"use client";

import dynamic from "next/dynamic";
import { DateRangeProvider } from "./context/date-range-context";
import { DashboardDataProvider } from "./context/dashboard-data-context";

const SalesStatsFallback = () => (
  <div
    className="rounded-3xl border border-border bg-card p-6 shadow-xl animate-pulse"
    aria-hidden="true"
  >
    <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="h-8 w-56 rounded-xl bg-muted/60" />
      <div className="flex items-center justify-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-muted/50" />
        <div className="h-6 w-36 rounded-lg bg-muted/60" />
        <div className="h-10 w-10 rounded-xl bg-muted/50" />
      </div>
    </div>
    <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
      {[0, 1, 2, 3].map((item) => (
        <div key={item} className="h-28 rounded-2xl bg-muted/30" />
      ))}
    </div>
  </div>
);

const SalesStats = dynamic(() => import("./components/sales-stats"), {
  ssr: false,
  loading: () => <SalesStatsFallback />,
});

const DashboardPageView = ({ trans }) => {
  return (
    <DateRangeProvider>
      <DashboardDataProvider>
        <div className="space-y-6 pb-6">
          {/* Única sección del dashboard: estadísticas de ventas. */}
          <SalesStats />
        </div>
      </DashboardDataProvider>
    </DateRangeProvider>
  );
};

export default DashboardPageView;
