"use client";

import dynamic from "next/dynamic";
import PersonalSpace from "./components/personal-space";
import BusinessStatus from "./components/business-status";
import UserProgress from "./components/user-progress";
import CommunityStats from "./components/community-stats";
import DailyRitualSection from "./components/daily-ritual-section";
import { DateRangeProvider } from "./context/date-range-context";
import { DashboardDataProvider } from "./context/dashboard-data-context";

const cardSkeleton = () => (
  <div className="h-40 rounded-2xl bg-default-100/50 animate-pulse" aria-hidden />
);

const SalesStats = dynamic(() => import("./components/sales-stats"), {
  ssr: false,
  loading: () => (
    <div className="h-64 rounded-3xl bg-default-100/50 animate-pulse" aria-hidden />
  ),
});

// Below-the-fold: cargas diferidas para reducir bundle inicial (date-fns, lógica pesada)
const LiveActivityFeed = dynamic(() => import("./components/live-activity-feed"), {
  ssr: false,
  loading: cardSkeleton,
});

const Opportunities = dynamic(() => import("./components/opportunities"), {
  ssr: false,
  loading: cardSkeleton,
});

const PlatformMessages = dynamic(() => import("./components/platform-messages"), {
  ssr: false,
  loading: cardSkeleton,
});

const DashboardPageView = ({ trans }) => {
  return (
    <DateRangeProvider>
      <DashboardDataProvider>
        <div className="space-y-6 pb-6">
          {/* Ritual Diario - Sección destacada */}
          <DailyRitualSection />

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
