import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

let adminAuthInstance = null;

function getServiceAccountConfig() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (privateKey && privateKey.includes("\\n")) {
    privateKey = privateKey.replace(/\\n/g, "\n");
  }
  if (projectId && clientEmail && privateKey) {
    return { projectId, clientEmail, privateKey };
  }
  return null;
}

export function getAdminAuth() {
  if (adminAuthInstance) return adminAuthInstance;
  const apps = getApps();
  if (apps.length === 0) {
    const svc = getServiceAccountConfig();
    console.log("Firebase Admin config:", {
      hasProjectId: !!process.env.FIREBASE_PROJECT_ID,
      hasClientEmail: !!process.env.FIREBASE_CLIENT_EMAIL,
      hasPrivateKey: !!process.env.FIREBASE_PRIVATE_KEY,
      svcConfigured: !!svc,
    });
    if (svc) {
      try {
        initializeApp({
          credential: cert({
            projectId: svc.projectId,
            clientEmail: svc.clientEmail,
            privateKey: svc.privateKey,
          }),
        });
        console.log("Firebase Admin inicializado con service account");
      } catch (initError) {
        console.error("Error inicializando Firebase Admin:", initError);
        throw initError;
      }
    } else {
      console.warn("Firebase Admin: usando credenciales por defecto (puede fallar)");
      // Fallback: initialize with default credentials (if present in environment)
      initializeApp();
    }
  }
  adminAuthInstance = getAuth();
  return adminAuthInstance;
}

export function isDevBypassEnabled() {
  // Temporalmente habilitado para debugging - REMOVER EN PRODUCCIÓN
  // Verificar múltiples formas de detectar desarrollo
  const isDev = 
    process.env.NODE_ENV === "development" ||
    process.env.NODE_ENV !== "production" ||
    !process.env.VERCEL ||
    process.env.DEV_BYPASS_AUTH === "1";
  
  if (isDev) {
    console.warn("⚠️ DEV BYPASS HABILITADO - Solo para desarrollo");
    return true;
  }
  return false;
}

export async function verifyFirebaseToken(authorizationHeader) {
  // En desarrollo, si hay bypass habilitado, extraer uid del token si es posible
  const bypassEnabled = isDevBypassEnabled();
  console.log("=== verifyFirebaseToken DEBUG ===");
  console.log("bypassEnabled:", bypassEnabled);
  console.log("NODE_ENV:", process.env.NODE_ENV);
  console.log("VERCEL:", process.env.VERCEL);
  console.log("authHeader presente:", !!authorizationHeader);
  
  if (bypassEnabled) {
    console.log("⚠️ DEV BYPASS ACTIVO");
    if (authorizationHeader && authorizationHeader.toLowerCase().startsWith("bearer ")) {
      const token = authorizationHeader.substring(7);
      console.log("Token recibido, length:", token.length);
      try {
        // Intentar decodificar el token JWT (sin verificar) para obtener el uid
        const parts = token.split('.');
        console.log("Token parts count:", parts.length);
        if (parts.length === 3) {
          try {
            // Decodificar base64url (puede tener caracteres especiales)
            const payloadBase64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
            // Agregar padding si es necesario
            const padding = payloadBase64.length % 4;
            const paddedBase64 = padding ? payloadBase64 + '='.repeat(4 - padding) : payloadBase64;
            const payload = JSON.parse(Buffer.from(paddedBase64, 'base64').toString());
            console.log("Token payload keys:", Object.keys(payload));
            console.log("Token payload:", { user_id: payload.user_id, sub: payload.sub, email: payload.email });
            
            const uid = payload.user_id || payload.sub;
            if (uid) {
              console.warn("⚠️ DEV BYPASS: Usando token sin verificar, uid:", uid);
              return {
                uid: uid,
                email: payload.email || "",
              };
            }
          } catch (decodeError) {
            console.warn("⚠️ DEV BYPASS: Error decodificando payload:", decodeError?.message);
          }
        }
      } catch (e) {
        console.warn("⚠️ DEV BYPASS: Error procesando token:", e?.message);
      }
    }
    console.warn("⚠️ DEV BYPASS: Retornando usuario dev por defecto");
    return { uid: "dev-user", email: "dev@example.com" };
  }

  if (!authorizationHeader || !authorizationHeader.toLowerCase().startsWith("bearer ")) {
    const error = new Error("Missing or invalid Authorization header");
    error.status = 401;
    throw error;
  }
  const token = authorizationHeader.substring(7);
  try {
    const auth = getAdminAuth();
    const decoded = await auth.verifyIdToken(token);
    return decoded;
  } catch (e) {
    // Log del error original para debugging
    console.error("Error verificando token de Firebase:", {
      message: e?.message,
      code: e?.code,
      errorInfo: e?.errorInfo,
    });
    const error = new Error(e?.message || "Unauthorized");
    error.status = 401;
    error.code = e?.code;
    throw error;
  }
}


