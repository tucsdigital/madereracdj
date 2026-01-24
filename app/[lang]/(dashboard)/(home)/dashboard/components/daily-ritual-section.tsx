"use client";

import { useDailyRitual } from "../hooks/use-daily-ritual";
import { useAuth } from "@/provider/auth.provider";
import DailyRitualCard from "./daily-ritual-card";
import LeaderboardCard from "./leaderboard-card";
import WinnersCard from "./winners-card";
import SpotlightSection from "./spotlight-section";

export default function DailyRitualSection() {
  const { loading: authLoading } = useAuth();
  const { status, loading, spinning, spin, error } = useDailyRitual();

  // Mostrar skeleton mientras carga la autenticación o los datos
  if (authLoading || (loading && !status)) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-64 bg-default-200 rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 rounded-xl bg-red-50 border border-red-200">
        <p className="text-sm text-red-800">Error: {error}</p>
      </div>
    );
  }

  if (!status) return null;

  return (
    <div className="space-y-4 md:space-y-6 mb-4 md:mb-8">
      {/* Spotlight destacado */}
      {status.spotlight && (
        <div className="mb-4 md:mb-6">
          <SpotlightSection
            contentBlocks={status.spotlight.contentBlocks}
            userId={status.spotlight.userId}
          />
        </div>
      )}

      {/* Grid principal: 1 columna en mobile, 3 columnas en desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        {/* En mobile: Ritual primero, luego Ranking, luego Ganadores */}
        {/* En desktop: Ritual, Ganadores, Ranking */}
        <DailyRitualCard
          dateKey={status.dateKey}
          hasPlayed={status.hasPlayed}
          userResult={status.userResult}
          onSpin={spin}
          spinning={spinning}
        />
        <div className="order-3 lg:order-2">
          <WinnersCard yesterdayWinners={status.yesterdayWinners} />
        </div>
        <div className="order-2 lg:order-3">
          <LeaderboardCard
            top10={status.leaderboard.top10}
            userPosition={status.userPosition}
            totalPlayers={status.leaderboard.totalPlayers}
            percentile={status.percentile}
          />
        </div>
      </div>
    </div>
  );
}
