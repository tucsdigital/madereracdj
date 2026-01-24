"use client";

import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Icon } from "@iconify/react";
import { getTierLabel, getTierColor, getTierColor as getTierColorHex, getTierInfo, getRewardInfo } from "@/lib/game/roulette";
import { useAuth } from "@/provider/auth.provider";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import ConfettiEffect from "./confetti-effect";

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

// Componente de Ruleta Visual
function RouletteWheel({ spinning, finalRotation = 0 }: { spinning: boolean; finalRotation?: number }) {
  const wheelRef = useRef<HTMLDivElement>(null);
  const [rotation, setRotation] = useState(0);

  useEffect(() => {
    if (spinning) {
      // Rotación inicial rápida (múltiples vueltas)
      const baseRotation = 1080 + Math.random() * 360; // 3-4 vueltas completas
      setRotation(baseRotation);
      
      // Cuando termine de girar (después de 2 segundos), aplicar rotación final
      const timer = setTimeout(() => {
        setRotation(baseRotation + finalRotation);
      }, 2000);
      
      return () => clearTimeout(timer);
    } else {
      // Si no está girando, mostrar posición final
      setRotation(finalRotation);
    }
  }, [spinning, finalRotation]);

  // Colores de los tiers para la ruleta
  const sections = [
    { tier: "common", color: "#9CA3AF", percentage: 60, label: "Común" },
    { tier: "rare", color: "#3B82F6", percentage: 25, label: "Raro" },
    { tier: "epic", color: "#A855F7", percentage: 12, label: "Épico" },
    { tier: "legendary", color: "#F59E0B", percentage: 3, label: "Legendario" },
  ];

  // Calcular ángulos para cada sección
  let currentAngle = 0;
  const sectionAngles = sections.map((section) => {
    const angle = (section.percentage / 100) * 360;
    const startAngle = currentAngle;
    currentAngle += angle;
    return { ...section, startAngle, endAngle: currentAngle, angle };
  });

  const size = 200;
  const center = size / 2;
  const radius = size / 2 - 10;

  return (
    <div className="relative w-full flex flex-col items-center">
      {/* Flecha señaladora fija en la parte superior */}
      <div className="relative z-20 mb-1 md:mb-2">
        <div className="w-0 h-0 border-l-[8px] md:border-l-[12px] border-l-transparent border-r-[8px] md:border-r-[12px] border-r-transparent border-t-[14px] md:border-t-[20px] border-t-primary drop-shadow-lg"></div>
      </div>

      {/* Ruleta */}
      <div className="relative w-[140px] h-[140px] md:w-[200px] md:h-[200px]">
        <svg
          width="100%"
          height="100%"
          className="drop-shadow-xl"
          viewBox={`0 0 ${size} ${size}`}
          preserveAspectRatio="xMidYMid meet"
          style={{
            transform: `rotate(${rotation}deg)`,
            transition: spinning ? "transform 2s cubic-bezier(0.17, 0.67, 0.12, 0.99)" : "transform 0.5s ease-out",
          }}
        >
          <defs>
            <filter id="glow">
              <feGaussianBlur stdDeviation="3" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          
          {/* Fondo circular */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="#F3F4F6"
            stroke="#E5E7EB"
            strokeWidth="2"
          />

          {/* Secciones de la ruleta */}
          {sectionAngles.map((section, index) => {
            const startAngleRad = ((section.startAngle - 90) * Math.PI) / 180;
            const endAngleRad = ((section.endAngle - 90) * Math.PI) / 180;
            
            const x1 = center + radius * Math.cos(startAngleRad);
            const y1 = center + radius * Math.sin(startAngleRad);
            const x2 = center + radius * Math.cos(endAngleRad);
            const y2 = center + radius * Math.sin(endAngleRad);
            
            const largeArcFlag = section.angle > 180 ? 1 : 0;
            
            const pathData = [
              `M ${center} ${center}`,
              `L ${x1} ${y1}`,
              `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}`,
              "Z",
            ].join(" ");

            return (
              <path
                key={section.tier}
                d={pathData}
                fill={section.color}
                stroke="#FFFFFF"
                strokeWidth="2"
                opacity={spinning ? 0.9 : 1}
                style={{
                  filter: spinning ? "url(#glow)" : "none",
                  transition: "opacity 0.3s ease",
                }}
              />
            );
          })}

          {/* Líneas divisorias */}
          {sectionAngles.slice(0, -1).map((section, index) => {
            const angleRad = ((section.endAngle - 90) * Math.PI) / 180;
            const x = center + radius * Math.cos(angleRad);
            const y = center + radius * Math.sin(angleRad);
            
            return (
              <line
                key={`divider-${index}`}
                x1={center}
                y1={center}
                x2={x}
                y2={y}
                stroke="#FFFFFF"
                strokeWidth="2"
                opacity="0.8"
              />
            );
          })}

          {/* Círculo central */}
          <circle
            cx={center}
            cy={center}
            r={radius * 0.3}
            fill="#FFFFFF"
            stroke="#E5E7EB"
            strokeWidth="3"
            className="drop-shadow-md"
          />
          
          {/* Puntos decorativos en el borde */}
          {Array.from({ length: 24 }).map((_, i) => {
            const angle = (i * 360) / 24;
            const angleRad = ((angle - 90) * Math.PI) / 180;
            const dotRadius = 3;
            const dotX = center + (radius - 5) * Math.cos(angleRad);
            const dotY = center + (radius - 5) * Math.sin(angleRad);
            
            return (
              <circle
                key={`dot-${i}`}
                cx={dotX}
                cy={dotY}
                r={dotRadius}
                fill="#FFFFFF"
                opacity="0.6"
              />
            );
          })}

          {/* Texto en el centro */}
          <text
            x={center}
            y={center}
            textAnchor="middle"
            dominantBaseline="middle"
            className="text-2xl font-bold fill-primary"
            style={{ pointerEvents: "none" }}
          >
            🎯
          </text>
        </svg>

        {/* Efecto de brillo mientras gira */}
        {spinning && (
          <div
            className="absolute inset-0 rounded-full pointer-events-none animate-pulse"
            style={{
              background: "radial-gradient(circle, rgba(255,255,255,0.3) 0%, transparent 70%)",
            }}
          />
        )}
      </div>

      {/* Leyenda de colores */}
      <div className="mt-2 md:mt-4 flex flex-wrap gap-1.5 md:gap-2 justify-center">
        {sections.map((section) => (
          <div key={section.tier} className="flex items-center gap-0.5 md:gap-1">
            <div
              className="w-2 h-2 md:w-3 md:h-3 rounded-full"
              style={{ backgroundColor: section.color }}
            />
            <span className="text-[10px] md:text-xs text-default-600">{section.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Función para calcular el tiempo restante hasta la medianoche en Argentina
function getTimeUntilMidnight(): { hours: number; minutes: number; formatted: string } {
  const now = new Date();
  // Obtener la hora actual en Argentina
  const argentinaTime = new Date(now.toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
  
  // Crear fecha de medianoche de hoy en Argentina
  const midnight = new Date(argentinaTime);
  midnight.setHours(24, 0, 0, 0);
  
  // Calcular diferencia en milisegundos
  const diff = midnight.getTime() - argentinaTime.getTime();
  
  // Convertir a horas y minutos
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  
  // Formatear hora de medianoche para mostrar
  const midnightFormatted = midnight.toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Argentina/Buenos_Aires",
  });
  
  return {
    hours,
    minutes,
    formatted: `Esperar hasta las ${midnightFormatted}hrs`,
  };
}

export default function DailyRitualCard({
  dateKey,
  hasPlayed,
  userResult,
  onSpin,
  spinning,
}: DailyRitualCardProps) {
  const { user } = useAuth();
  
  // Debug: loguear el estado recibido
  console.log("[DailyRitualCard] Props recibidas:", { hasPlayed, userResult: userResult ? { score: userResult.score, tier: userResult.tier } : null });
  const [showResult, setShowResult] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [finalRotation, setFinalRotation] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const previousResultRef = useRef<string | null>(null);
  const modalShownRef = useRef<boolean>(false);
  const [timeUntilMidnight, setTimeUntilMidnight] = useState(getTimeUntilMidnight());

  // Calcular rotación final basada en el tier del resultado
  useEffect(() => {
    if (userResult) {
      // Mapear tier a ángulo (0-360 grados)
      const tierAngles: Record<string, number> = {
        common: 45,    // Centro de la sección común (0-60%)
        rare: 172,   // Centro de la sección rara (60-85%)
        epic: 258,    // Centro de la sección épica (85-97%)
        legendary: 351, // Centro de la sección legendaria (97-100%)
      };
      setFinalRotation(tierAngles[userResult.tier] || 0);
    }
  }, [userResult]);

  // Detectar cuando se obtiene un resultado nuevo para mostrar el modal
  useEffect(() => {
    if (userResult && hasPlayed && !spinning && !isAnimating) {
      const resultKey = `${dateKey}-${userResult.score}-${userResult.tier}-${userResult.rewardType}`;
      
      // Verificar en localStorage si ya se mostró el modal para este resultado
      const modalShownKey = `daily-ritual-modal-${resultKey}`;
      const wasModalShown = typeof window !== 'undefined' && localStorage.getItem(modalShownKey) === 'true';
      
      // Solo mostrar modal si es un resultado nuevo Y no se ha mostrado antes
      if (previousResultRef.current !== resultKey && !wasModalShown && !modalShownRef.current) {
        previousResultRef.current = resultKey;
        modalShownRef.current = true;
        
        // Guardar en localStorage que el modal ya se mostró
        if (typeof window !== 'undefined') {
          localStorage.setItem(modalShownKey, 'true');
        }
        
        setShowModal(true);
        setShowConfetti(true);
        
        // Ocultar confetti después de 4 segundos
        const confettiTimer = setTimeout(() => {
          setShowConfetti(false);
        }, 4000);
        
        return () => clearTimeout(confettiTimer);
      }
    }
  }, [userResult, hasPlayed, spinning, isAnimating, dateKey]);

  // Efecto para detectar cuando termina el spin y mostrar resultado
  useEffect(() => {
    // Si spinning cambió de true a false y hay resultado, significa que terminó
    if (!spinning && userResult && hasPlayed && isAnimating) {
      // El hook ya esperó 2.3 segundos, solo esperar un momento para la transición visual
      const timer = setTimeout(() => {
        setIsAnimating(false);
        setShowResult(true);
      }, 300); // Tiempo corto para transición suave
      return () => clearTimeout(timer);
    } 
    // Si no está animando y hay resultado, mostrar directamente
    else if (userResult && hasPlayed && !spinning && !isAnimating) {
      setShowResult(true);
    }
    // Ocultar resultado mientras está animando
    else if (spinning || isAnimating) {
      setShowResult(false);
    }
  }, [userResult, hasPlayed, spinning, isAnimating]);

  // Resetear isAnimating cuando spinning se vuelve false sin resultado (error o cancelación)
  useEffect(() => {
    if (!spinning && !userResult && isAnimating) {
      setIsAnimating(false);
    }
  }, [spinning, userResult, isAnimating]);

  // Resetear el flag del modal cuando cambia el dateKey (nuevo día)
  useEffect(() => {
    modalShownRef.current = false;
  }, [dateKey]);

  // Actualizar contador de tiempo cada minuto
  useEffect(() => {
    if (hasPlayed) {
      // Actualizar inmediatamente
      setTimeUntilMidnight(getTimeUntilMidnight());
      
      // Actualizar cada minuto
      const interval = setInterval(() => {
        setTimeUntilMidnight(getTimeUntilMidnight());
      }, 60000); // Cada minuto
      
      return () => clearInterval(interval);
    }
  }, [hasPlayed]);

  const handleSpin = async () => {
    // Prevenir juego si ya jugó
    if (hasPlayed) {
      console.warn("[DailyRitualCard] Intento de jugar cuando ya se jugó hoy");
      return;
    }
    
    console.log("[DailyRitualCard] Iniciando spin...");
    setShowResult(false);
    setIsAnimating(true);
    try {
      await onSpin();
      console.log("[DailyRitualCard] Spin completado, hasPlayed:", hasPlayed);
      // El estado se actualizará automáticamente cuando fetchStatus se complete
      // No necesitamos verificar hasPlayed aquí porque es una prop que viene del padre
    } catch (error) {
      console.error("[DailyRitualCard] Error en spin:", error);
      // Si hay error, asegurarse de limpiar el estado
      setIsAnimating(false);
    }
  };

  return (
    // @ts-ignore - Card components are in .jsx without types
    <Card className="relative rounded-3xl shadow-2xl border-0 overflow-hidden bg-gradient-to-br from-pink-50/80 via-purple-50/60 to-blue-50/80 backdrop-blur-xl">
      {/* Efecto de brillo sutil */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/40 via-transparent to-transparent pointer-events-none" />
      
      {/* @ts-ignore */}
      <CardHeader className="relative pb-2 md:pb-4 pt-3 md:pt-6 px-4 md:px-6 border-0 bg-transparent">
        {/* @ts-ignore */}
        <CardTitle className="text-xl md:text-2xl font-bold flex items-center gap-2 md:gap-3 text-transparent bg-clip-text bg-gradient-to-r from-pink-600 via-purple-600 to-blue-600">
          <div className="p-1.5 md:p-2 rounded-xl md:rounded-2xl bg-gradient-to-br from-pink-200/50 to-purple-200/50 shadow-md md:shadow-lg">
            <Icon icon="heroicons:sparkles" className="w-5 h-5 md:w-6 md:h-6 text-purple-600" />
          </div>
          Ritual Diario
        </CardTitle>
      </CardHeader>
      {/* @ts-ignore */}
      <CardContent className="relative pt-1 md:pt-2 px-4 md:px-6 pb-4 md:pb-6">
        {(spinning || isAnimating) ? (
          <div className="flex flex-col items-center justify-center py-3 md:py-6">
            <RouletteWheel spinning={spinning || isAnimating} finalRotation={finalRotation} />
            <p className="text-xs md:text-sm font-medium text-default-700 mt-2 md:mt-4 animate-pulse">
              {spinning ? "Girando la ruleta..." : userResult ? "Deteniendo ruleta..." : "Calculando resultado..."}
            </p>
          </div>
        ) : hasPlayed ? (
          <div className="space-y-2 md:space-y-4">
            <div className="text-center">
              {userResult && showResult ? (
                <>
                  <p className="text-xs md:text-sm text-default-600 mb-1.5 md:mb-2">
                    Ya jugaste hoy
                  </p>
                  <div className="space-y-2 md:space-y-3">
                    {/* @ts-ignore */}
                    <TooltipProvider delayDuration={0}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className={`inline-flex items-center gap-1.5 md:gap-2 px-3 md:px-5 py-1.5 md:py-2.5 rounded-xl md:rounded-2xl shadow-md md:shadow-lg ${getTierColor(userResult.tier as any)} backdrop-blur-sm cursor-help`}>
                            <Icon icon="heroicons:trophy" className="w-4 h-4 md:w-5 md:h-5" />
                            <span className="text-xs md:text-sm font-bold">{getTierLabel(userResult.tier as any)}</span>
                          </div>
                        </TooltipTrigger>
                        {/* @ts-ignore */}
                        <TooltipContent className="max-w-xs" color="secondary">
                          {(() => {
                            const tierInfo = getTierInfo(userResult.tier as any);
                            return (
                              <div className="space-y-2">
                                <p className="font-bold text-sm">{getTierLabel(userResult.tier as any)}</p>
                                <p className="text-xs text-gray-600 dark:text-gray-400">{tierInfo.description}</p>
                                <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                                  <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">Rango de puntos:</p>
                                  <p className="text-xs text-gray-600 dark:text-gray-400">{tierInfo.minScore} - {tierInfo.maxScore} puntos</p>
                                  <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mt-1">Probabilidad:</p>
                                  <p className="text-xs text-gray-600 dark:text-gray-400">{tierInfo.probability}% de obtener este tier</p>
                                </div>
                              </div>
                            );
                          })()}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <div className="mt-1 md:mt-2">
                      <p className="text-3xl md:text-4xl font-black bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">{userResult.score}</p>
                      <p className="text-[10px] md:text-xs text-purple-500/70 font-medium mt-0.5 md:mt-1">Puntos</p>
                    </div>
                    {userResult.rewardType !== "none" && (
                      // @ts-ignore
                      <TooltipProvider delayDuration={0}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="mt-2 md:mt-4 p-3 md:p-4 rounded-xl md:rounded-2xl bg-gradient-to-br from-emerald-100/80 to-green-100/80 shadow-lg md:shadow-xl border-0 backdrop-blur-sm cursor-help">
                              <p className="text-xs md:text-sm font-bold text-emerald-800">
                                ¡Ganaste un premio! 🎉
                              </p>
                              <p className="text-[10px] md:text-xs text-emerald-700/80 mt-1 md:mt-1.5 font-medium">
                                {(() => {
                                  const rewardInfo = getRewardInfo(userResult.rewardType as any, userResult.tier as any);
                                  return rewardInfo.name;
                                })()}
                              </p>
                            </div>
                          </TooltipTrigger>
                          {/* @ts-ignore */}
                          <TooltipContent className="max-w-xs" color="success">
                            {(() => {
                              const rewardInfo = getRewardInfo(userResult.rewardType as any, userResult.tier as any);
                              return (
                                <div className="space-y-2">
                                  <p className="font-bold text-sm">{rewardInfo.name}</p>
                                  <p className="text-xs text-gray-600 dark:text-gray-400">{rewardInfo.description}</p>
                                  <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                                    <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">Probabilidad de obtener:</p>
                                    <p className="text-xs text-gray-600 dark:text-gray-400">{rewardInfo.probability}% en tier {getTierLabel(userResult.tier as any)}</p>
                                  </div>
                                </div>
                              );
                            })()}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
                </>
              ) : (
                <div className="space-y-2 md:space-y-3">
                  <div className="p-3 md:p-5 rounded-xl md:rounded-2xl bg-gradient-to-br from-blue-50/90 via-purple-50/70 to-pink-50/90 shadow-lg md:shadow-xl border-0 backdrop-blur-sm">
                    <Icon icon="heroicons:clock" className="w-7 h-7 md:w-10 md:h-10 mx-auto mb-2 md:mb-3 text-purple-500/70" />
                    <p className="text-xs md:text-sm font-bold text-purple-800 mb-1 md:mb-1.5">
                      Ya jugaste hoy
                    </p>
                    <p className="text-[10px] md:text-xs text-purple-600/80 font-medium">
                      {timeUntilMidnight.formatted}
                    </p>
                    <div className="mt-2 md:mt-3 flex items-center justify-center gap-1 md:gap-1.5 text-[10px] md:text-xs text-purple-500/70 font-medium">
                      <Icon icon="heroicons:arrow-path" className="w-3 h-3 md:w-3.5 md:h-3.5 animate-spin" />
                      <span>Próximo juego disponible en {timeUntilMidnight.hours}h {timeUntilMidnight.minutes}m</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3 md:space-y-4">
            <div className="text-center">
              <p className="text-xs md:text-sm text-default-600 mb-3 md:mb-4">
                Tu oportunidad diaria de ganar premios
              </p>
              <button
                onClick={handleSpin}
                disabled={spinning || hasPlayed}
                className="group relative w-full py-3 md:py-4 px-4 md:px-6 bg-gradient-to-r from-pink-500 via-purple-500 to-blue-500 text-white rounded-xl md:rounded-2xl font-bold text-sm md:text-base shadow-xl md:shadow-2xl hover:shadow-2xl md:hover:shadow-3xl transition-all duration-300 transform hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none overflow-hidden"
              >
                {/* Efecto de brillo animado */}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                <div className="relative flex items-center justify-center gap-1.5 md:gap-2">
                  <Icon icon="heroicons:sparkles" className="w-5 h-5 md:w-6 md:h-6" />
                  <span>Jugar Ahora</span>
                </div>
              </button>
            </div>
          </div>
        )}
      </CardContent>

      {/* Confetti Effect */}
      <ConfettiEffect active={showConfetti} duration={4000} />

      {/* Modal de Resultado */}
      {userResult && (
        <Dialog open={showModal} onOpenChange={setShowModal}>
          {/* @ts-ignore */}
          <DialogContent className="sm:max-w-[500px] p-0 overflow-hidden" size="md">
            <div className="relative">
              {/* Fondo con gradiente según el tier */}
              <div className={`absolute inset-0 ${
                userResult.tier === "legendary" ? "bg-gradient-to-br from-yellow-400 via-orange-500 to-red-500" :
                userResult.tier === "epic" ? "bg-gradient-to-br from-purple-500 via-pink-500 to-indigo-500" :
                userResult.tier === "rare" ? "bg-gradient-to-br from-blue-400 via-cyan-500 to-teal-500" :
                "bg-gradient-to-br from-gray-300 via-gray-400 to-gray-500"
              } opacity-20`} />
              
              <DialogHeader className="relative p-6 pb-4">
                <div className="flex flex-col items-center text-center space-y-4">
                  {/* Icono de celebración */}
                  <div className={`w-20 h-20 rounded-full flex items-center justify-center ${
                    userResult.tier === "legendary" ? "bg-gradient-to-br from-yellow-400 to-orange-500" :
                    userResult.tier === "epic" ? "bg-gradient-to-br from-purple-500 to-pink-500" :
                    userResult.tier === "rare" ? "bg-gradient-to-br from-blue-500 to-cyan-500" :
                    "bg-gradient-to-br from-gray-400 to-gray-600"
                  } shadow-2xl animate-bounce`}>
                    <Icon 
                      icon={userResult.rewardType !== "none" ? "heroicons:trophy" : "heroicons:sparkles"} 
                      className="w-10 h-10 text-white" 
                    />
                  </div>

                  {/* Título */}
                  {/* @ts-ignore */}
                  <DialogTitle className="text-2xl font-bold text-default-900">
                    {userResult.rewardType !== "none" ? "¡Felicidades!" : "¡Buen trabajo!"}
                  </DialogTitle>

                  {/* Contenido */}
                  <div className="text-base text-default-700 space-y-4 w-full">
                    <div>
                      <p className="text-sm text-default-600 mb-2">Tu resultado del día:</p>
                      <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg ${getTierColor(userResult.tier as any)} mb-3`}>
                        <Icon icon="heroicons:star" className="w-5 h-5" />
                        <span className="font-bold text-lg">{getTierLabel(userResult.tier as any)}</span>
                      </div>
                    </div>

                    {/* Score */}
                    <div className="bg-gradient-to-br from-primary/10 to-primary/5 rounded-xl p-6 border-2 border-primary/20">
                      <p className="text-5xl font-extrabold text-primary mb-1">{userResult.score}</p>
                      <p className="text-sm font-medium text-default-600">Puntos obtenidos</p>
                    </div>

                    {/* Premio si hay */}
                    {userResult.rewardType !== "none" && (
                      <div className="bg-gradient-to-br from-emerald-50 to-green-50 rounded-xl p-5 border-2 border-emerald-200 shadow-lg">
                        <div className="flex items-center gap-3 mb-2">
                          <Icon icon="heroicons:gift" className="w-6 h-6 text-emerald-600" />
                          <p className="text-lg font-bold text-emerald-800">¡Premio Desbloqueado!</p>
                        </div>
                        <p className="text-sm text-emerald-700 font-medium">
                          {userResult.rewardType === "spotlight" && "✨ Mensaje destacado por 24 horas"}
                          {userResult.rewardType === "badge" && "🏅 Nueva insignia coleccionable"}
                          {userResult.rewardType === "perk" && "⭐ Feature premium activada por 24 horas"}
                          {userResult.rewardType === "editorSlot" && "📝 Acceso al editor de contenido destacado"}
                        </p>
                        {userResult.rewardMetadata && (
                          <p className="text-xs text-emerald-600 mt-2 opacity-75">
                            {userResult.rewardType === "perk" && userResult.rewardMetadata.perkFeature && 
                              `Feature: ${userResult.rewardMetadata.perkFeature}`}
                            {userResult.rewardType === "badge" && userResult.rewardMetadata.badgeId && 
                              `ID: ${userResult.rewardMetadata.badgeId.slice(0, 8)}...`}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Mensaje motivacional */}
                    <div className="pt-2">
                      <p className="text-xs text-default-500 italic">
                        {userResult.tier === "legendary" && "🎊 ¡Increíble! Has logrado el tier más alto posible."}
                        {userResult.tier === "epic" && "🔥 Excelente resultado, estás en el top de jugadores."}
                        {userResult.tier === "rare" && "💪 Buen trabajo, sigue así para alcanzar tier épico."}
                        {userResult.tier === "common" && "👍 Sigue participando para obtener mejores resultados."}
                      </p>
                    </div>
                  </div>
                </div>
              </DialogHeader>

              {/* Footer con botón */}
              <div className="relative p-6 pt-0">
                <button
                  onClick={() => setShowModal(false)}
                  className="w-full py-3 px-6 bg-gradient-to-r from-primary to-primary/80 text-white rounded-lg font-semibold hover:from-primary/90 hover:to-primary/70 transition-all shadow-lg hover:shadow-xl"
                >
                  Continuar
                </button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </Card>
  );
}
