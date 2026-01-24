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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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
    <div className="space-y-6">
      {/* Spotlight destacado */}
      {status.spotlight && (
        <SpotlightSection
          contentBlocks={status.spotlight.contentBlocks}
          userId={status.spotlight.userId}
        />
      )}

      {/* Grid principal */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Columna izquierda */}
        <div className="space-y-6">
          <DailyRitualCard
            dateKey={status.dateKey}
            hasPlayed={status.hasPlayed}
            userResult={status.userResult}
            onSpin={spin}
            spinning={spinning}
          />
          <WinnersCard yesterdayWinners={status.yesterdayWinners} />
        </div>

        {/* Columna derecha */}
        <div className="space-y-6">
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
