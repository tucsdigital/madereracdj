"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Icon } from "@iconify/react";
import { getTierColor, getTierLabel, getTierInfo } from "@/lib/game/roulette";
import { getUserAlias } from "@/lib/daily/userAliases";
import { useAuth } from "@/provider/auth.provider";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface LeaderboardEntry {
  userId: string;
  score: number;
  position: number;
  tier: string;
  email?: string | null;
  alias?: string | null;
}

interface LeaderboardCardProps {
  top10: LeaderboardEntry[];
  userPosition: number | null;
  totalPlayers: number;
  percentile: number | null;
}

export default function LeaderboardCard({
  top10,
  userPosition,
  totalPlayers,
  percentile,
}: LeaderboardCardProps) {
  const { user } = useAuth();
  const currentUserEmail = (user as any)?.email || null;
  const currentUserAlias = getUserAlias(currentUserEmail);
  
  return (
    // @ts-ignore - Card components are in .jsx without types
    <Card className="relative rounded-3xl shadow-2xl border-0 overflow-hidden bg-gradient-to-br from-yellow-50/80 via-orange-50/60 to-amber-50/80  h-full flex flex-col">
      {/* Efecto de brillo sutil */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/40 via-transparent to-transparent pointer-events-none" />
      
      {/* @ts-ignore */}
      <CardHeader className="relative pb-3 lg:pb-2 pt-4 lg:pt-3 px-4 lg:px-4 border-0 bg-transparent">
        {/* @ts-ignore */}
        <CardTitle className="text-xl md:text-2xl lg:text-xl font-bold flex items-center gap-2 md:gap-3 lg:gap-2 text-transparent bg-clip-text bg-gradient-to-r from-yellow-600 via-orange-600 to-amber-600">
          <div className="p-1.5 md:p-2 lg:p-1.5 rounded-xl md:rounded-2xl lg:rounded-xl bg-gradient-to-br from-yellow-200/50 to-orange-200/50 shadow-md md:shadow-lg lg:shadow-md">
            <Icon icon="heroicons:trophy" className="w-5 h-5 md:w-6 md:h-6 lg:w-5 lg:h-5 text-orange-600" />
          </div>
          Ranking del Día
        </CardTitle>
      </CardHeader>
      {/* @ts-ignore */}
      <CardContent className="relative pt-1 lg:pt-0.5 px-4 lg:px-4 pb-4 lg:pb-3 flex-1">
        <div className="space-y-1.5">
          {top10.length === 0 ? (
            <p className="text-xs text-default-500 text-center py-3">
              Aún no hay jugadores hoy
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-1.5">
                {top10.map((entry, index) => (
                  <div
                    key={entry.userId}
                    className={`flex items-center justify-between p-1.5 rounded-lg shadow-sm backdrop-blur-sm transition-all hover:scale-[1.01] ${
                      index < 3 
                        ? "bg-gradient-to-r from-yellow-100/80 via-orange-100/60 to-amber-100/80" 
                        : "bg-white/60"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      <span className="text-xs font-bold text-default-600 w-4 flex-shrink-0">
                        {index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `#${entry.position}`}
                      </span>
                      <span className="text-[10px] font-medium text-default-900 truncate">
                        {entry.alias || (entry.email ? getUserAlias(entry.email, entry.userId) : getUserAlias(null, entry.userId))}
                      </span>
                      {/* @ts-ignore */}
                      <TooltipProvider delayDuration={0}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className={`text-[9px] px-1 py-0.5 rounded-md cursor-help flex-shrink-0 ${getTierColor(entry.tier as any)}`}>
                              {getTierLabel(entry.tier as any)}
                            </span>
                          </TooltipTrigger>
                          {/* @ts-ignore */}
                          <TooltipContent className="max-w-xs" color="secondary">
                            {(() => {
                              const tierInfo = getTierInfo(entry.tier as any);
                              return (
                                <div className="space-y-2">
                                  <p className="font-bold text-sm">{getTierLabel(entry.tier as any)}</p>
                                  <p className="text-xs text-gray-600 dark:text-gray-400">{tierInfo.description}</p>
                                  <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                                    <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">Rango de puntos:</p>
                                    <p className="text-xs text-gray-600 dark:text-gray-400">{tierInfo.minScore} - {tierInfo.maxScore} puntos</p>
                                    <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mt-1">Probabilidad:</p>
                                    <p className="text-xs text-gray-600 dark:text-gray-400">{tierInfo.probability}%</p>
                                  </div>
                                </div>
                              );
                            })()}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <span className="text-[10px] font-bold text-default-900 flex-shrink-0 ml-1">{entry.score}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
