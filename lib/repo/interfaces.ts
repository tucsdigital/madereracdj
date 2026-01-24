/**
 * Interfaces de repositorio para desacoplar la implementación de base de datos
 * Permite cambiar fácilmente entre Firestore, Postgres, Supabase, etc.
 */

import { RouletteResult, RewardType } from "@/lib/game/roulette";

export interface DailySpin {
  id?: string;
  userId: string;
  email?: string; // Email del usuario (guardado para evitar consultas)
  alias?: string; // Alias del usuario (guardado para evitar consultas)
  dateKey: string;
  score: number;
  tier: string;
  rewardType: RewardType;
  rewardMetadata?: any;
  createdAt: string; // ISO date
  ipAddress?: string; // Para auditoría
}

export interface RewardClaim {
  id?: string;
  userId: string;
  dailySpinId: string;
  dateKey: string;
  rewardType: RewardType;
  rewardMetadata?: any;
  status: "pending" | "claimed" | "expired" | "used";
  contentBlocks?: any[]; // JSON blocks del editor
  approvalStatus?: "pending" | "approved" | "rejected";
  approvedAt?: string;
  expiresAt?: string; // ISO date
  createdAt: string;
}

export interface DailyWinner {
  id?: string;
  dateKey: string;
  winners: {
    userId: string;
    email?: string; // Email del usuario (guardado)
    alias?: string; // Alias del usuario (guardado)
    score: number;
    position: number;
    tier?: string; // Tier del usuario (guardado)
    rewardType?: RewardType;
  }[];
  computedAt: string; // ISO date
  spotlightUserId?: string; // Usuario con mensaje destacado activo
}

export interface DailyLeaderboard {
  dateKey: string;
  entries: {
    userId: string;
    email?: string; // Email del usuario (guardado)
    alias?: string; // Alias del usuario (guardado)
    score: number;
    position: number;
    tier: string;
  }[];
  totalPlayers: number;
}

export interface IDailySpinRepository {
  create(spin: DailySpin): Promise<DailySpin>;
  findByUserAndDate(userId: string, dateKey: string): Promise<DailySpin | null>;
  getLeaderboard(dateKey: string, limit?: number): Promise<DailyLeaderboard>;
  getUserPosition(userId: string, dateKey: string): Promise<number | null>;
}

export interface IRewardClaimRepository {
  create(claim: RewardClaim): Promise<RewardClaim>;
  findByUserAndDate(userId: string, dateKey: string): Promise<RewardClaim | null>;
  findByDailySpinId(spinId: string): Promise<RewardClaim | null>;
  update(id: string, updates: Partial<RewardClaim>): Promise<RewardClaim>;
  getActiveSpotlight(dateKey: string): Promise<RewardClaim | null>;
}

export interface IDailyWinnerRepository {
  create(winner: DailyWinner): Promise<DailyWinner>;
  findByDate(dateKey: string): Promise<DailyWinner | null>;
  update(id: string, updates: Partial<DailyWinner>): Promise<DailyWinner>;
}
