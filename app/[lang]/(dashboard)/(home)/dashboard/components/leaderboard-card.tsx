"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Icon } from "@iconify/react";
import { getTierColor } from "@/lib/game/roulette";

interface LeaderboardEntry {
  userId: string;
  score: number;
  position: number;
  tier: string;
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
  return (
    // @ts-ignore - Card components are in .jsx without types
    <Card className="rounded-xl shadow-md border border-default-200/70">
      {/* @ts-ignore */}
      <CardHeader className="pb-3 border-b border-default-100/80">
        {/* @ts-ignore */}
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <Icon icon="heroicons:trophy" className="w-5 h-5 text-yellow-500" />
          Ranking del Día
        </CardTitle>
      </CardHeader>
      {/* @ts-ignore */}
      <CardContent className="pt-4">
        <div className="space-y-3">
          {top10.length === 0 ? (
            <p className="text-sm text-default-500 text-center py-4">
              Aún no hay jugadores hoy
            </p>
          ) : (
            <>
              <div className="space-y-2">
                {top10.map((entry, index) => (
                  <div
                    key={entry.userId}
                    className={`flex items-center justify-between p-2 rounded-lg ${
                      index < 3 ? "bg-gradient-to-r from-yellow-50 to-yellow-100/50" : "bg-default-50"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-lg font-bold text-default-600 w-6">
                        {index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `#${entry.position}`}
                      </span>
                      <span className="text-sm font-medium text-default-900">
                        {entry.userId.slice(0, 8)}...
                      </span>
                      <span className={`text-xs px-2 py-1 rounded ${getTierColor(entry.tier as any)}`}>
                        {entry.tier}
                      </span>
                    </div>
                    <span className="text-sm font-bold text-default-900">{entry.score}</span>
                  </div>
                ))}
              </div>

              {userPosition && (
                <div className="mt-4 pt-4 border-t border-default-200">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-primary/5 border border-primary/20">
                    <div>
                      <p className="text-sm font-medium text-default-900">Tu posición</p>
                      <p className="text-xs text-default-600">
                        {percentile !== null && `Mejor que el ${percentile}% de jugadores`}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-bold text-primary">#{userPosition}</p>
                      <p className="text-xs text-default-500">de {totalPlayers}</p>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
