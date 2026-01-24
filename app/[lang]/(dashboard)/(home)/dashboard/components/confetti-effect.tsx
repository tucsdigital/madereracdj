"use client";

import { useEffect, useState } from "react";

interface ConfettiEffectProps {
  active: boolean;
  duration?: number;
}

export default function ConfettiEffect({ active, duration = 3000 }: ConfettiEffectProps) {
  const [particles, setParticles] = useState<Array<{
    id: number;
    left: number;
    delay: number;
    duration: number;
    size: number;
    color: string;
  }>>([]);

  useEffect(() => {
    if (active) {
      // Generar partículas de confetti
      const newParticles = Array.from({ length: 150 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 500,
        duration: 2000 + Math.random() * 1000,
        size: 8 + Math.random() * 12,
        color: [
          "#FF6B6B", "#4ECDC4", "#45B7D1", "#FFA07A", "#98D8C8",
          "#F7DC6F", "#BB8FCE", "#85C1E2", "#F8B739", "#E74C3C",
          "#3498DB", "#2ECC71", "#F39C12", "#9B59B6", "#1ABC9C"
        ][Math.floor(Math.random() * 15)],
      }));
      setParticles(newParticles);

      // Limpiar partículas después de la duración
      const timer = setTimeout(() => {
        setParticles([]);
      }, duration);

      return () => clearTimeout(timer);
    } else {
      setParticles([]);
    }
  }, [active, duration]);

  if (!active || particles.length === 0) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-[9999] overflow-hidden">
      {particles.map((particle) => {
        const initialRotation = Math.random() * 360;
        return (
          <div
            key={particle.id}
            className="absolute rounded-sm"
            style={{
              left: `${particle.left}%`,
              width: `${particle.size}px`,
              height: `${particle.size}px`,
              backgroundColor: particle.color,
              animation: `confetti-fall ${particle.duration}ms ease-out ${particle.delay}ms forwards`,
              transform: `rotate(${initialRotation}deg)`,
              boxShadow: `0 0 ${particle.size / 2}px ${particle.color}`,
            }}
          />
        );
      })}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes confetti-fall {
          0% {
            transform: translateY(-100vh) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(100vh) rotate(720deg);
            opacity: 0;
          }
        }
      `}} />
    </div>
  );
}
