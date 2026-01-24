/**
 * Exporta las implementaciones de repositorios
 * Cambiar aquí para usar otra implementación (Postgres, Supabase, etc.)
 */

import { FirestoreDailySpinRepository } from "./firestore/dailySpinRepo";
import { FirestoreRewardClaimRepository } from "./firestore/rewardClaimRepo";
import { FirestoreDailyWinnerRepository } from "./firestore/dailyWinnerRepo";

// Instancias singleton de repositorios
export const dailySpinRepo = new FirestoreDailySpinRepository();
export const rewardClaimRepo = new FirestoreRewardClaimRepository();
export const dailyWinnerRepo = new FirestoreDailyWinnerRepository();

// Para cambiar a Postgres/Supabase, solo crear nuevas clases que implementen las interfaces
// y reemplazar las instancias aquí:
// export const dailySpinRepo = new PostgresDailySpinRepository();
// export const rewardClaimRepo = new PostgresRewardClaimRepository();
// export const dailyWinnerRepo = new PostgresDailyWinnerRepository();
