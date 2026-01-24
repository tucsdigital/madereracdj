/**
 * Mapeo de emails a aliases de usuarios
 * Actualizar cuando se agreguen nuevos usuarios
 */

export const USER_ALIASES: Record<string, string> = {
  "admin@admin.com": "Lauti",
  "ivan@maderascaballero.com": "Pipi",
  "luisdamian@maderascaballero.com": "Pela",
  "brian@maderascaballero.com": "Coco",
  "jonathan@maderascaballero.com": "Jona",
};

/**
 * Obtiene el alias de un usuario basado en su email
 * @param email - Email del usuario
 * @param userId - (Opcional) UID de Firebase para fallback
 * @returns Alias del usuario, email sin dominio, o userId truncado
 */
export function getUserAlias(email: string | null | undefined, userId?: string): string {
  if (email) {
    const alias = USER_ALIASES[email.toLowerCase()];
    if (alias) return alias;
    // Si no hay alias mapeado, usar la parte antes del @
    const emailPrefix = email.split("@")[0];
    if (emailPrefix) return emailPrefix;
  }
  // Si no hay email, usar userId truncado como fallback
  if (userId) {
    return userId.slice(0, 8) + "...";
  }
  return "Usuario";
}

/**
 * Obtiene el alias de un usuario basado en su userId (uid de Firebase)
 * Por ahora retorna el userId truncado, pero se puede mejorar obteniendo el email desde Firebase Auth
 * @param userId - UID de Firebase
 * @returns Alias o userId truncado
 */
export function getUserAliasFromId(userId: string): string {
  // Por ahora retornamos el userId truncado
  // En el futuro se puede obtener el email desde Firebase Auth
  return userId.slice(0, 8) + "...";
}
