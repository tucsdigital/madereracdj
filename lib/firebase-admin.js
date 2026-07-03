import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

let adminAuthInstance = null;
let adminDbInstance = null;

function getProjectIdFallback() {
  const pid =
    process.env.FIREBASE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT ||
    "";
  return pid;
}

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
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
      GOOGLE_CLOUD_PROJECT: process.env.GOOGLE_CLOUD_PROJECT || "",
      GCLOUD_PROJECT: process.env.GCLOUD_PROJECT || "",
    });
    if (svc) {
      try {
        initializeApp({
          credential: cert({
            projectId: svc.projectId,
            clientEmail: svc.clientEmail,
            privateKey: svc.privateKey,
          }),
          projectId: svc.projectId,
        });
        console.log("Firebase Admin inicializado con service account");
      } catch (initError) {
        console.error("Error inicializando Firebase Admin:", initError);
        throw initError;
      }
    } else {
      const projectIdFallback = getProjectIdFallback();
      console.warn("Firebase Admin: usando credenciales por defecto (puede fallar). projectId:", projectIdFallback);
      if (projectIdFallback) {
        if (!process.env.GOOGLE_CLOUD_PROJECT) {
          process.env.GOOGLE_CLOUD_PROJECT = projectIdFallback;
        }
        if (!process.env.GCLOUD_PROJECT) {
          process.env.GCLOUD_PROJECT = projectIdFallback;
        }
        if (!process.env.FIREBASE_PROJECT_ID) {
          process.env.FIREBASE_PROJECT_ID = projectIdFallback;
        }
        initializeApp({ projectId: projectIdFallback });
      } else {
        initializeApp();
      }
    }
  }
  adminAuthInstance = getAuth();
  return adminAuthInstance;
}

export function getAdminDb() {
  if (adminDbInstance) return adminDbInstance;
  getAdminAuth();
  adminDbInstance = getFirestore();
  return adminDbInstance;
}

export function isDevBypassEnabled() {
  const bypass = process.env.DEV_BYPASS_AUTH === "1";
  if (bypass) {
    console.warn("⚠️ DEV BYPASS HABILITADO - Solo para desarrollo");
  }
  return bypass;
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
    const parts = token.split(".");
    if (parts.length === 3) {
      try {
        const payloadBase64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
        const padding = payloadBase64.length % 4;
        const paddedBase64 = padding ? payloadBase64 + "=".repeat(4 - padding) : payloadBase64;
        const payloadStr = Buffer.from(paddedBase64, "base64").toString();
        const payload = JSON.parse(payloadStr);
        const expectedAud = process.env.FIREBASE_PROJECT_ID || "";
        const expectedIss = expectedAud ? `https://securetoken.google.com/${expectedAud}` : "";
        console.error("Error verificando token de Firebase:", {
          message: e?.message,
          code: e?.code,
          errorInfo: e?.errorInfo,
          claims: {
            aud: payload?.aud,
            iss: payload?.iss,
            sub: payload?.sub,
            user_id: payload?.user_id,
            email: payload?.email,
          },
          expected: {
            aud: expectedAud,
            iss: expectedIss,
          },
        });
      } catch (decodeErr) {
        console.error("Error verificando token de Firebase:", {
          message: e?.message,
          code: e?.code,
          errorInfo: e?.errorInfo,
          decodeError: decodeErr?.message,
        });
      }
    } else {
      console.error("Error verificando token de Firebase:", {
        message: e?.message,
        code: e?.code,
        errorInfo: e?.errorInfo,
        tokenParts: parts.length,
      });
    }
    const error = new Error(e?.message || "Unauthorized");
    error.status = 401;
    error.code = e?.code;
    throw error;
  }
}


