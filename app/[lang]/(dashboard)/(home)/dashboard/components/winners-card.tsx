"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Icon } from "@iconify/react";

interface Winner {
  userId: string;
  score: number;
  position: number;
  rewardType?: string;
}

interface WinnersCardProps {
  yesterdayWinners: Winner[] | null;
}

export default function WinnersCard({ yesterdayWinners }: WinnersCardProps) {
  if (!yesterdayWinners || yesterdayWinners.length === 0) {
    return (
      // @ts-ignore - Card components are in .jsx without types
      <Card className="rounded-xl shadow-md border border-default-200/70">
        {/* @ts-ignore */}
        <CardHeader className="pb-3 border-b border-default-100/80">
          {/* @ts-ignore */}
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <Icon icon="heroicons:star" className="w-5 h-5 text-yellow-500" />
            Ganadores de Ayer
          </CardTitle>
        </CardHeader>
        {/* @ts-ignore */}
        <CardContent className="pt-4">
          <p className="text-sm text-default-500 text-center py-4">
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
    <Card className="rounded-xl shadow-md border border-default-200/70">
      {/* @ts-ignore */}
      <CardHeader className="pb-3 border-b border-default-100/80">
        {/* @ts-ignore */}
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <Icon icon="heroicons:star" className="w-5 h-5 text-yellow-500" />
          Ganadores de Ayer
        </CardTitle>
      </CardHeader>
      {/* @ts-ignore */}
      <CardContent className="pt-4">
        <div className="space-y-4">
          {top3.length > 0 && (
            <div>
              <p className="text-xs font-medium text-default-600 mb-2">Top 3</p>
              <div className="space-y-2">
                {top3.map((winner, index) => (
                  <div
                    key={winner.userId}
                    className="flex items-center justify-between p-2 rounded-lg bg-gradient-to-r from-yellow-50 to-yellow-100/50"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-lg">
                        {index === 0 ? "🥇" : index === 1 ? "🥈" : "🥉"}
                      </span>
                      <span className="text-sm font-medium text-default-900">
                        {winner.userId.slice(0, 8)}...
                      </span>
                    </div>
                    <span className="text-sm font-bold text-default-900">{winner.score}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {top10.length > 3 && (
            <div>
              <p className="text-xs font-medium text-default-600 mb-2">Top 10</p>
              <div className="space-y-1">
                {top10.slice(3).map((winner) => (
                  <div
                    key={winner.userId}
                    className="flex items-center justify-between p-2 rounded-lg bg-default-50"
                  >
                    <span className="text-xs text-default-700">
                      #{winner.position} {winner.userId.slice(0, 8)}...
                    </span>
                    <span className="text-xs font-medium text-default-900">{winner.score}</span>
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
