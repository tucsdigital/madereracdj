"use client";
import PersonalSpace from "./components/personal-space";
import LiveActivityFeed from "./components/live-activity-feed";
import BusinessStatus from "./components/business-status";
import UserProgress from "./components/user-progress";
import CommunityStats from "./components/community-stats";
import PlatformMessages from "./components/platform-messages";
import Opportunities from "./components/opportunities";
import SalesStats from "./components/sales-stats";
import DailyRitualSection from "./components/daily-ritual-section";
import { DateRangeProvider } from "./context/date-range-context";
import { DashboardDataProvider } from "./context/dashboard-data-context";

const DashboardPageView = ({ trans }) => {
  return (
    <DateRangeProvider>
      <DashboardDataProvider>
        <div className="space-y-6 pb-6">
          {/* Ritual Diario - Sección destacada */}
          <DailyRitualSection />

          {/* Estadísticas de Ventas - Sección Principal */}
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
