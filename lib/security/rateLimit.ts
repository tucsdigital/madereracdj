/**
 * Rate limiting básico (memory store)
 * Para producción, reemplazar por Redis o servicio dedicado
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// Memory store (se pierde al reiniciar el servidor)
// En producción usar Redis: const redis = new Redis(process.env.REDIS_URL);
const rateLimitStore = new Map<string, RateLimitEntry>();

const CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hora

// Limpiar entradas expiradas periódicamente
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (entry.resetAt < now) {
      rateLimitStore.delete(key);
    }
  }
}, CLEANUP_INTERVAL);

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * Verifica rate limit por clave (userId + action o IP)
 * @param key - Clave única (ej: userId_dailySpin o IP_dailySpin)
 * @param maxRequests - Máximo de requests permitidos
 * @param windowMs - Ventana de tiempo en milisegundos
 * @returns RateLimitResult
 */
export function checkRateLimit(
  key: string,
  maxRequests: number = 10,
  windowMs: number = 60 * 1000 // 1 minuto por defecto
): RateLimitResult {
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || entry.resetAt < now) {
    // Nueva ventana o expirada
    rateLimitStore.set(key, {
      count: 1,
      resetAt: now + windowMs,
    });
    return {
      allowed: true,
      remaining: maxRequests - 1,
      resetAt: now + windowMs,
    };
  }

  if (entry.count >= maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.resetAt,
    };
  }

  entry.count++;
  rateLimitStore.set(key, entry);

  return {
    allowed: true,
    remaining: maxRequests - entry.count,
    resetAt: entry.resetAt,
  };
}

/**
 * Genera clave de rate limit para un usuario y acción
 */
export function getRateLimitKey(userId: string, action: string): string {
  return `${userId}_${action}`;
}
