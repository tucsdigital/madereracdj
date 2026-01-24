/**
 * Lógica del juego de ruleta diaria
 * Define probabilidades, tiers y cálculo de resultados
 */

export type Tier = "common" | "rare" | "epic" | "legendary";

export interface RouletteResult {
  score: number; // 0-100
  tier: Tier;
  rewardType: RewardType;
  rewardMetadata?: RewardMetadata;
}

export type RewardType = "none" | "perk" | "spotlight" | "badge" | "editorSlot";

export interface RewardMetadata {
  perkFeature?: string;
  badgeId?: string;
  spotlightDuration?: number; // horas
  editorSlotExpiry?: string; // ISO date
}

/**
 * Probabilidades de tiers (suma debe ser 100)
 * - common: 60% (score 0-50)
 * - rare: 25% (score 51-75)
 * - epic: 12% (score 76-90)
 * - legendary: 3% (score 91-100)
 */
const TIER_PROBABILITIES = {
  common: 60,
  rare: 25,
  epic: 12,
  legendary: 3,
} as const;

/**
 * Probabilidades de premios por tier
 * Cada tier tiene diferentes chances de obtener premios
 */
const REWARD_PROBABILITIES: Record<Tier, { none: number; perk: number; spotlight: number; badge: number; editorSlot: number }> = {
  common: { none: 80, perk: 15, spotlight: 0, badge: 5, editorSlot: 0 },
  rare: { none: 50, perk: 30, spotlight: 5, badge: 10, editorSlot: 5 },
  epic: { none: 20, perk: 40, spotlight: 15, badge: 15, editorSlot: 10 },
  legendary: { none: 0, perk: 30, spotlight: 30, badge: 20, editorSlot: 20 },
};

/**
 * Genera un resultado aleatorio de la ruleta
 * IMPORTANTE: Esta función debe ejecutarse SOLO en el servidor
 * @returns RouletteResult
 */
export function spinRoulette(): RouletteResult {
  // Determinar tier basado en probabilidades
  const tierRoll = Math.random() * 100;
  let tier: Tier = "common";
  let accumulated = 0;

  for (const [tierName, probability] of Object.entries(TIER_PROBABILITIES)) {
    accumulated += probability;
    if (tierRoll <= accumulated) {
      tier = tierName as Tier;
      break;
    }
  }

  // Generar score dentro del rango del tier
  const score = generateScoreForTier(tier);

  // Determinar reward basado en probabilidades del tier
  const rewardType = determineReward(tier);

  // Generar metadata del premio si aplica
  const rewardMetadata = generateRewardMetadata(rewardType);

  return {
    score,
    tier,
    rewardType,
    rewardMetadata,
  };
}

function generateScoreForTier(tier: Tier): number {
  const ranges = {
    common: [0, 50],
    rare: [51, 75],
    epic: [76, 90],
    legendary: [91, 100],
  };

  const [min, max] = ranges[tier];
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function determineReward(tier: Tier): RewardType {
  const probabilities = REWARD_PROBABILITIES[tier];
  const roll = Math.random() * 100;
  let accumulated = 0;

  for (const [rewardType, probability] of Object.entries(probabilities)) {
    accumulated += probability;
    if (roll <= accumulated) {
      return rewardType as RewardType;
    }
  }

  return "none";
}

function generateRewardMetadata(rewardType: RewardType): RewardMetadata | undefined {
  if (rewardType === "none") return undefined;

  const metadata: RewardMetadata = {};

  if (rewardType === "perk") {
    // Lista de perks disponibles (puede expandirse)
    const perks = ["advancedStats", "exportData", "prioritySupport"];
    metadata.perkFeature = perks[Math.floor(Math.random() * perks.length)];
  }

  if (rewardType === "badge") {
    // Generar ID de badge único
    metadata.badgeId = `badge_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  if (rewardType === "spotlight") {
    metadata.spotlightDuration = 24; // 24 horas por defecto
  }

  if (rewardType === "editorSlot") {
    const expiry = new Date();
    expiry.setDate(expiry.getDate() + 7); // Válido por 7 días
    metadata.editorSlotExpiry = expiry.toISOString();
  }

  return metadata;
}

/**
 * Obtiene el nombre legible de un tier
 */
export function getTierLabel(tier: Tier): string {
  const labels = {
    common: "Común",
    rare: "Raro",
    epic: "Épico",
    legendary: "Legendario",
  };
  return labels[tier];
}

/**
 * Obtiene el color de un tier para UI
 */
export function getTierColor(tier: Tier): string {
  const colors = {
    common: "text-gray-600 bg-gray-100",
    rare: "text-blue-600 bg-blue-100",
    epic: "text-purple-600 bg-purple-100",
    legendary: "text-yellow-600 bg-yellow-100",
  };
  return colors[tier];
}
