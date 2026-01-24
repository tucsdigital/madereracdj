"use client";
import PersonalSpace from "./components/personal-space";
import LiveActivityFeed from "./components/live-activity-feed";
import BusinessStatus from "./components/business-status";
import UserProgress from "./components/user-progress";
import CommunityStats from "./components/community-stats";
import PlatformMessages from "./components/platform-messages";
import Opportunities from "./components/opportunities";
import SalesStats from "./components/sales-stats";

const DashboardPageView = ({ trans }) => {
  return (
    <div className="space-y-6">
      {/* 8️⃣ Espacio Personal - Header del negocio */}
      <PersonalSpace />

      {/* Grid principal con los bloques principales */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Columna izquierda */}
        <div className="space-y-6">
          {/* 1️⃣ Bloque: ¿Qué está pasando ahora? */}
          <LiveActivityFeed />

          {/* 3️⃣ Bloque: Progreso del usuario */}
          <UserProgress />
        </div>

        {/* Columna central */}
        <div className="space-y-6">
          {/* 2️⃣ Bloque: Tu negocio hoy */}
          <BusinessStatus />

          {/* 4️⃣ Bloque: Comunidad */}
          <CommunityStats />

          {/* 6️⃣ Bloque: Oportunidades */}
          <Opportunities />
        </div>

        {/* Columna derecha */}
        <div className="space-y-6">
          {/* 5️⃣ Bloque: Mensajes de la plataforma */}
          <PlatformMessages />

          {/* Estadísticas detalladas (mantener el componente original) */}
          <SalesStats />
        </div>
      </div>
    </div>
  );
};

export default DashboardPageView;
