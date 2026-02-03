"use client";

import dynamic from "next/dynamic";
import { DateRangeProvider } from "./context/date-range-context";
import { DashboardDataProvider } from "./context/dashboard-data-context";

const SkeletonCard = () => (
  <div className="h-48 rounded-3xl bg-default-100/50 animate-pulse" aria-hidden />
);

const SalesStats = dynamic(() => import("./components/sales-stats"), {
  ssr: false,
  loading: () => (
    <div className="h-64 rounded-3xl bg-default-100/50 animate-pulse" aria-hidden />
  ),
});

const LiveActivityFeed = dynamic(() => import("./components/live-activity-feed"), {
  loading: () => <SkeletonCard />,
});
const BusinessStatus = dynamic(() => import("./components/business-status"), {
  loading: () => <SkeletonCard />,
});
const CommunityStats = dynamic(() => import("./components/community-stats"), {
  loading: () => <SkeletonCard />,
});
const PersonalSpace = dynamic(() => import("./components/personal-space"), {
  loading: () => <SkeletonCard />,
});
const UserProgress = dynamic(() => import("./components/user-progress"), {
  loading: () => <SkeletonCard />,
});
const Opportunities = dynamic(() => import("./components/opportunities"), {
  loading: () => <SkeletonCard />,
});
const PlatformMessages = dynamic(() => import("./components/platform-messages"), {
  loading: () => <SkeletonCard />,
});

const DashboardPageView = ({ trans }) => {
  return (
    <DateRangeProvider>
      <DashboardDataProvider>
        <div className="space-y-6 pb-6">
          {/* Estadísticas de Ventas - Carga diferida para priorizar el resto */}
          <SalesStats />

          {/* Grid principal con mejor distribución - 2 columnas principales */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Columna izquierda */}
            <div className="space-y-6">
              <LiveActivityFeed />
              <BusinessStatus />
              <CommunityStats />
            </div>

            {/* Columna derecha */}
            <div className="space-y-6">
              <PersonalSpace />
              <UserProgress />
              <Opportunities />
              <PlatformMessages />
            </div>
          </div>
        </div>
      </DashboardDataProvider>
    </DateRangeProvider>
  );
};

export default DashboardPageView;
