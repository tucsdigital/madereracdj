/**
 * Utilidades para manejar dateKey diario basado en timezone de Argentina (UTC-3)
 * El dateKey es un string YYYY-MM-DD que identifica un día específico en la zona horaria local.
 */

/**
 * Obtiene el dateKey actual para la zona horaria de Argentina
 * @returns string en formato YYYY-MM-DD
 */
export function getCurrentDateKey(): string {
  const now = new Date();
  // Convertir a timezone de Argentina (UTC-3)
  const argentinaTime = new Date(now.toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
  
  const year = argentinaTime.getFullYear();
  const month = String(argentinaTime.getMonth() + 1).padStart(2, "0");
  const day = String(argentinaTime.getDate()).padStart(2, "0");
  
  return `${year}-${month}-${day}`;
}

/**
 * Obtiene el dateKey para una fecha específica
 * @param date - Fecha a convertir
 * @returns string en formato YYYY-MM-DD
 */
export function getDateKey(date: Date): string {
  const argentinaTime = new Date(date.toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
  
  const year = argentinaTime.getFullYear();
  const month = String(argentinaTime.getMonth() + 1).padStart(2, "0");
  const day = String(argentinaTime.getDate()).padStart(2, "0");
  
  return `${year}-${month}-${day}`;
}

/**
 * Valida que un dateKey tenga el formato correcto
 * @param dateKey - String a validar
 * @returns boolean
 */
export function isValidDateKey(dateKey: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateKey);
}

/**
 * Obtiene el dateKey de ayer
 * @returns string en formato YYYY-MM-DD
 */
export function getYesterdayDateKey(): string {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  return getDateKey(yesterday);
}
