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
      <>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6 lg:gap-4">
          {/* Skeleton para DailyRitualCard */}
          <div className="relative rounded-3xl shadow-2xl border-0 overflow-hidden bg-gradient-to-br from-pink-50/80 via-purple-50/60 to-blue-50/80 animate-pulse">
            <div className="absolute inset-0 bg-gradient-to-br from-white/40 via-transparent to-transparent pointer-events-none" />
            <div className="relative pb-1.5 md:pb-2 lg:pb-1.5 pt-2.5 md:pt-3 lg:pt-2.5 px-3 md:px-4 lg:px-3 border-0 bg-transparent">
              <div className="h-5 md:h-6 lg:h-5 w-28 md:w-36 lg:w-28 bg-white/60 rounded-xl md:rounded-2xl lg:rounded-xl mb-2 md:mb-4 lg:mb-2" />
            </div>
            <div className="relative pt-0.5 md:pt-1 lg:pt-0.5 px-3 md:px-4 lg:px-3 pb-3 md:pb-4 lg:pb-3">
              <div className="space-y-2 md:space-y-3 lg:space-y-1.5">
                <div className="h-24 md:h-32 lg:h-24 w-full bg-white/60 rounded-xl md:rounded-2xl lg:rounded-xl mx-auto" />
                <div className="h-3 md:h-4 lg:h-3 w-20 md:w-28 lg:w-20 bg-white/60 rounded-lg md:rounded-xl lg:rounded-lg mx-auto" />
                <div className="h-8 md:h-10 lg:h-8 w-full bg-white/60 rounded-xl md:rounded-2xl lg:rounded-xl" />
              </div>
            </div>
          </div>
          
          {/* Skeleton para WinnersCard */}
          <div className="relative rounded-3xl shadow-2xl border-0 overflow-hidden bg-gradient-to-br from-indigo-50/80 via-purple-50/60 to-pink-50/80 animate-pulse h-full">
            <div className="absolute inset-0 bg-gradient-to-br from-white/40 via-transparent to-transparent pointer-events-none" />
            <div className="relative pb-1.5 md:pb-2 lg:pb-1.5 pt-2.5 md:pt-3 lg:pt-2.5 px-3 md:px-4 lg:px-3 border-0 bg-transparent">
              <div className="h-5 md:h-6 lg:h-5 w-32 md:w-40 lg:w-32 bg-white/60 rounded-xl md:rounded-2xl lg:rounded-xl mb-2 md:mb-4 lg:mb-2" />
            </div>
            <div className="relative pt-0.5 md:pt-1 lg:pt-0 px-3 md:px-4 lg:px-3 pb-3 md:pb-4 lg:pb-2.5">
              <div className="space-y-1.5 md:space-y-2 lg:space-y-1">
                <div className="h-12 md:h-16 lg:h-10 bg-white/60 rounded-xl md:rounded-2xl lg:rounded-xl" />
                <div className="h-12 md:h-16 lg:h-10 bg-white/60 rounded-xl md:rounded-2xl lg:rounded-xl" />
                <div className="h-12 md:h-16 lg:h-10 bg-white/60 rounded-xl md:rounded-2xl lg:rounded-xl" />
              </div>
            </div>
          </div>
          
          {/* Skeleton para LeaderboardCard */}
          <div className="relative rounded-3xl shadow-2xl border-0 overflow-hidden bg-gradient-to-br from-yellow-50/80 via-orange-50/60 to-amber-50/80 animate-pulse">
            <div className="absolute inset-0 bg-gradient-to-br from-white/40 via-transparent to-transparent pointer-events-none" />
            <div className="relative pb-1.5 md:pb-2 lg:pb-1.5 pt-2.5 md:pt-3 lg:pt-2.5 px-3 md:px-4 lg:px-3 border-0 bg-transparent">
              <div className="h-5 md:h-6 lg:h-5 w-28 md:w-36 lg:w-28 bg-white/60 rounded-xl md:rounded-2xl lg:rounded-xl mb-2 md:mb-4 lg:mb-2" />
            </div>
            <div className="relative pt-0.5 md:pt-1 lg:pt-0 px-3 md:px-4 lg:px-3 pb-3 md:pb-4 lg:pb-2.5">
              <div className="space-y-1 md:space-y-2 lg:space-y-0.5">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="h-9 md:h-12 lg:h-8 bg-white/60 rounded-lg md:rounded-xl lg:rounded-lg" />
                ))}
                <div className="mt-2 md:mt-3 lg:mt-1.5 pt-2 md:pt-3 lg:pt-1.5 border-t border-default-200/50">
                  <div className="h-12 md:h-16 lg:h-10 bg-white/60 rounded-xl md:rounded-2xl lg:rounded-xl" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </>
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
    <div className="space-y-4 md:space-y-6 mb-4 md:mb-6 lg:mb-4">
      {/* Spotlight destacado */}
      {status.spotlight && (
        <div className="mb-4 md:mb-6 lg:mb-4">
          <SpotlightSection
            contentBlocks={status.spotlight.contentBlocks}
            userId={status.spotlight.userId}
          />
        </div>
      )}

      {/* Grid principal: 1 columna en mobile, 3 columnas en desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6 lg:gap-4">
        {/* En mobile: Ritual primero, luego Ranking, luego Ganadores */}
        {/* En desktop: Ritual, Ganadores, Ranking - cada uno 1 columna */}
        <DailyRitualCard
          dateKey={status.dateKey}
          hasPlayed={status.hasPlayed}
          userResult={status.userResult}
          onSpin={spin}
          spinning={spinning}
          userPosition={status.userPosition}
          totalPlayers={status.leaderboard.totalPlayers}
          percentile={status.percentile}
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
