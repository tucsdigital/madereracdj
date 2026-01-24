/**
 * Utilidad para obtener el usuario actual
 * Adaptar según tu sistema de autenticación
 */

import { useAuth } from "@/provider/auth.provider";
import { verifyFirebaseToken } from "@/lib/firebase-admin";
import { NextRequest } from "next/server";

/**
 * Obtiene el usuario actual del servidor desde el request
 * Para Server Components / API Routes
 */
export async function getCurrentUserServer(request?: NextRequest): Promise<{ id: string; email: string } | null> {
  try {
    if (!request) return null;
    
    const authHeader = request.headers.get("authorization");
    if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
      return null;
    }

    // Verificar si está en modo dev bypass
    const { isDevBypassEnabled } = await import("@/lib/firebase-admin");
    if (isDevBypassEnabled()) {
      // En modo dev, retornar un usuario mock si hay header
      return { id: "dev-user", email: "dev@example.com" };
    }

    const decoded = await verifyFirebaseToken(authHeader) as { uid?: string; email?: string } | null;
    if (!decoded?.uid) return null;

    return {
      id: decoded.uid,
      email: decoded.email || "",
    };
  } catch (error: any) {
    // Si falla la verificación (401, token inválido, etc.), retornar null silenciosamente
    // No es un error crítico si el usuario no está autenticado
    if (error?.status === 401) {
      return null;
    }
    console.error("Error verificando usuario:", error);
    return null;
  }
}

/**
 * Hook para obtener usuario en Client Components
 */
export function useCurrentUser() {
  const { user } = useAuth();
  return user ? { id: user.uid, email: user.email || "" } : null;
}
