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
      // No hay header de autorización, retornar null (acceso público permitido)
      return null;
    }

    // Verificar si está en modo dev bypass
    const { isDevBypassEnabled } = await import("@/lib/firebase-admin");
    if (isDevBypassEnabled()) {
      // En modo dev, decodificar el token para obtener el userId real
      // (igual que hace verifyFirebaseToken en firebase-admin.js)
      const token = authHeader.substring(7);
      try {
        const parts = token.split('.');
        if (parts.length === 3) {
          try {
            // Decodificar base64url (puede tener caracteres especiales)
            const payloadBase64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
            // Agregar padding si es necesario
            const padding = payloadBase64.length % 4;
            const paddedBase64 = padding ? payloadBase64 + '='.repeat(4 - padding) : payloadBase64;
            const payload = JSON.parse(Buffer.from(paddedBase64, 'base64').toString());
            
            const uid = payload.user_id || payload.sub;
            const email = payload.email || "";
            
            if (uid) {
              console.log(`[getCurrentUserServer] DEV BYPASS: Usando token decodificado, uid: ${uid}, email: ${email}`);
              return {
                id: uid,
                email: email,
              };
            }
          } catch (e) {
            console.warn("[getCurrentUserServer] DEV BYPASS: Error decodificando payload del token:", e?.message);
          }
        }
      } catch (e) {
        console.warn("[getCurrentUserServer] DEV BYPASS: No se pudo decodificar token, retornando usuario dev por defecto:", e?.message);
      }
      // Fallback: retornar usuario dev por defecto si no se puede decodificar
      return { id: "dev-user", email: "dev@example.com" };
    }

    try {
      const decoded = await verifyFirebaseToken(authHeader) as { uid?: string; email?: string } | null;
      if (!decoded?.uid) {
        console.warn("Token verificado pero sin uid");
        return null;
      }

      return {
        id: decoded.uid,
        email: decoded.email || "",
      };
    } catch (verifyError: any) {
      // Si falla la verificación del token (token inválido, expirado, etc.)
      // Para daily-spin, esto es crítico, así que logueamos el error completo
      console.error("Error verificando token:", {
        message: verifyError?.message,
        status: verifyError?.status,
        code: verifyError?.code,
        stack: verifyError?.stack,
      });
      
      // Retornar null para que el endpoint pueda decidir qué hacer
      return null;
    }
  } catch (error: any) {
    // Cualquier otro error también se maneja silenciosamente
    // No queremos bloquear el acceso público al leaderboard
    console.warn("Error en getCurrentUserServer (no crítico):", error?.message || error);
    return null;
  }
}

/**
 * Hook para obtener usuario en Client Components
 */
export function useCurrentUser() {
  const { user } = useAuth();
  const firebaseUser = user as any; // Firebase Auth User tiene uid y email
  return firebaseUser ? { id: firebaseUser.uid, email: firebaseUser.email || "" } : null;
}
