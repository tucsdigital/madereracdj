"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Icon } from "@iconify/react";
import { getUserAlias } from "@/lib/daily/userAliases";
import { getTierLabel } from "@/lib/game/roulette";

interface Winner {
  userId: string;
  score: number;
  position: number;
  rewardType?: string;
  email?: string | null;
  alias?: string | null;
  tier?: string;
}

interface WinnersCardProps {
  yesterdayWinners: Winner[] | null;
}

export default function WinnersCard({ yesterdayWinners }: WinnersCardProps) {
  if (!yesterdayWinners || yesterdayWinners.length === 0) {
    return (
      // @ts-ignore - Card components are in .jsx without types
      <Card className="relative rounded-3xl shadow-2xl border-0 overflow-hidden bg-gradient-to-br from-indigo-50/80 via-purple-50/60 to-pink-50/80 backdrop-blur-xl">
        {/* Efecto de brillo sutil */}
        <div className="absolute inset-0 bg-gradient-to-br from-white/40 via-transparent to-transparent pointer-events-none" />
        
        {/* @ts-ignore */}
        <CardHeader className="relative pb-3 pt-4 px-4 border-0 bg-transparent">
          {/* @ts-ignore */}
          <CardTitle className="text-xl md:text-2xl font-bold flex items-center gap-2 md:gap-3 text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600">
            <div className="p-1.5 md:p-2 rounded-xl md:rounded-2xl bg-gradient-to-br from-indigo-200/50 to-purple-200/50 shadow-md md:shadow-lg">
              <Icon icon="heroicons:star" className="w-5 h-5 md:w-6 md:h-6 text-purple-600" />
            </div>
            Ganadores de Ayer
          </CardTitle>
        </CardHeader>
        {/* @ts-ignore */}
        <CardContent className="relative pt-1 px-4 pb-4">
          <p className="text-xs text-default-500 text-center py-3">
            Aún no hay ganadores de ayer
          </p>
        </CardContent>
      </Card>
    );
  }

  const top3 = yesterdayWinners.slice(0, 3);
  const top10 = yesterdayWinners.slice(0, 10);

  return (
    // @ts-ignore - Card components are in .jsx without types
    <Card className="relative rounded-3xl shadow-2xl border-0 overflow-hidden bg-gradient-to-br from-indigo-50/80 via-purple-50/60 to-pink-50/80 backdrop-blur-xl">
      {/* Efecto de brillo sutil */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/40 via-transparent to-transparent pointer-events-none" />
      
      {/* @ts-ignore */}
      <CardHeader className="relative pb-3 pt-4 px-4 border-0 bg-transparent">
        {/* @ts-ignore */}
        <CardTitle className="text-lg font-bold flex items-center gap-2 text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600">
          <div className="p-1.5 rounded-xl bg-gradient-to-br from-indigo-200/50 to-purple-200/50 shadow-md">
            <Icon icon="heroicons:star" className="w-4 h-4 text-purple-600" />
          </div>
          Ganadores de Ayer
        </CardTitle>
      </CardHeader>
      {/* @ts-ignore */}
      <CardContent className="relative pt-1 px-4 pb-4">
        <div className="space-y-2.5">
          {top3.length > 0 && (
            <div>
              <p className="text-[10px] font-medium text-default-600 mb-1.5">Top 3</p>
              <div className="space-y-1.5">
                {top3.map((winner, index) => (
                  <div
                    key={winner.userId}
                    className="flex items-center justify-between p-2 rounded-xl bg-gradient-to-r from-yellow-100/80 via-orange-100/60 to-amber-100/80 shadow-md backdrop-blur-sm transition-all hover:scale-[1.01]"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="text-sm flex-shrink-0">
                        {index === 0 ? "🥇" : index === 1 ? "🥈" : "🥉"}
                      </span>
                      <span className="text-xs font-medium text-default-900 truncate">
                        {winner.alias || (winner.email ? getUserAlias(winner.email, winner.userId) : getUserAlias(null, winner.userId))}
                      </span>
                      {winner.rewardType && winner.rewardType !== "none" && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-lg bg-emerald-100 text-emerald-700 flex-shrink-0">
                          {winner.rewardType === "spotlight" && "✨"}
                          {winner.rewardType === "badge" && "🏅"}
                          {winner.rewardType === "perk" && "⭐"}
                          {winner.rewardType === "editorSlot" && "📝"}
                        </span>
                      )}
                    </div>
                    <span className="text-xs font-bold text-default-900 flex-shrink-0 ml-2">{winner.score}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {top10.length > 3 && (
            <div>
              <p className="text-[10px] font-medium text-default-600 mb-1.5">Top 10</p>
              <div className="space-y-1">
                {top10.slice(3).map((winner) => (
                  <div
                    key={winner.userId}
                    className="flex items-center justify-between p-2 rounded-xl bg-white/60 shadow-md backdrop-blur-sm transition-all hover:scale-[1.01]"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="text-[10px] text-default-700 truncate">
                        #{winner.position} {winner.alias || (winner.email ? getUserAlias(winner.email, winner.userId) : getUserAlias(null, winner.userId))}
                      </span>
                      {winner.tier && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-lg bg-default-100 text-default-600 flex-shrink-0">
                          {getTierLabel(winner.tier as any)}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] font-medium text-default-900 flex-shrink-0 ml-2">{winner.score}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
