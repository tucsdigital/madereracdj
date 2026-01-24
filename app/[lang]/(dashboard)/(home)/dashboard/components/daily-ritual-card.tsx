"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Icon } from "@iconify/react";
import { getTierLabel, getTierColor } from "@/lib/game/roulette";
import { useAuth } from "@/provider/auth.provider";

interface DailyRitualCardProps {
  dateKey: string;
  hasPlayed: boolean;
  userResult: {
    score: number;
    tier: string;
    rewardType: string;
    rewardMetadata?: any;
  } | null;
  onSpin: () => Promise<void>;
  spinning: boolean;
}

export default function DailyRitualCard({
  dateKey,
  hasPlayed,
  userResult,
  onSpin,
  spinning,
}: DailyRitualCardProps) {
  const { user } = useAuth();
  const [showResult, setShowResult] = useState(false);

  useEffect(() => {
    if (userResult && hasPlayed) {
      setShowResult(true);
    }
  }, [userResult, hasPlayed]);

  const handleSpin = async () => {
    setShowResult(false);
    await onSpin();
    setShowResult(true);
  };

  return (
    // @ts-ignore - Card components are in .jsx without types
    <Card className="rounded-xl shadow-md border border-default-200/70 overflow-hidden">
      {/* @ts-ignore */}
      <CardHeader className="pb-3 border-b border-default-100/80 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent">
        {/* @ts-ignore */}
        <CardTitle className="text-lg font-semibold flex items-center gap-2">
          <Icon icon="heroicons:sparkles" className="w-5 h-5 text-primary" />
          Ritual Diario
        </CardTitle>
      </CardHeader>
      {/* @ts-ignore */}
      <CardContent className="pt-4">
        {spinning ? (
          <div className="flex flex-col items-center justify-center py-8">
            <div className="relative w-32 h-32 mb-4">
              <div className="absolute inset-0 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
              <div className="absolute inset-4 border-4 border-primary/30 border-b-transparent rounded-full animate-spin" style={{ animationDirection: "reverse", animationDuration: "1.5s" }}></div>
            </div>
            <p className="text-sm text-default-600">Girando la ruleta...</p>
          </div>
        ) : hasPlayed && userResult ? (
          <div className="space-y-4">
            <div className="text-center">
              <p className="text-sm text-default-600 mb-2">Ya jugaste hoy</p>
              {showResult && (
                <div className="space-y-3">
                  <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg ${getTierColor(userResult.tier as any)}`}>
                    <Icon icon="heroicons:trophy" className="w-5 h-5" />
                    <span className="font-bold">{getTierLabel(userResult.tier as any)}</span>
                  </div>
                  <div>
                    <p className="text-3xl font-extrabold text-default-900">{userResult.score}</p>
                    <p className="text-xs text-default-500">Puntos</p>
                  </div>
                  {userResult.rewardType !== "none" && (
                    <div className="mt-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                      <p className="text-sm font-medium text-emerald-800">
                        ¡Ganaste un premio! 🎉
                      </p>
                      <p className="text-xs text-emerald-600 mt-1">
                        {userResult.rewardType === "spotlight" && "Mensaje destacado por 24h"}
                        {userResult.rewardType === "badge" && "Nueva insignia"}
                        {userResult.rewardType === "perk" && "Feature premium por 24h"}
                        {userResult.rewardType === "editorSlot" && "Acceso al editor destacado"}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="text-center">
              <p className="text-sm text-default-600 mb-4">
                Tu oportunidad diaria de ganar premios
              </p>
              <button
                onClick={handleSpin}
                disabled={spinning}
                className="w-full py-3 px-6 bg-gradient-to-r from-primary to-primary/80 text-white rounded-lg font-semibold hover:from-primary/90 hover:to-primary/70 transition-all shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Icon icon="heroicons:sparkles" className="w-5 h-5 inline mr-2" />
                Jugar Ahora
              </button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
