import crypto from "crypto";
import { getAdminDb } from "@/lib/firebase-admin";

export const nowIso = () => new Date().toISOString();

export const sha256 = (value) =>
  crypto.createHash("sha256").update(String(value)).digest("hex");

export const newToken = () => crypto.randomBytes(32).toString("base64url");

export const getRequestIp = (req) => {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return "";
};

export const addDocumentoEvent = async ({
  documentoId,
  type,
  actorType,
  actorId,
  actorEmail,
  ip,
  userAgent,
  details,
}) => {
  const db = getAdminDb();
  const ref = db.collection("documentos").doc(String(documentoId)).collection("events").doc();
  await ref.set({
    type: String(type),
    at: nowIso(),
    actorType: actorType || "",
    actorId: actorId || "",
    actorEmail: actorEmail || "",
    ip: ip || "",
    userAgent: userAgent || "",
    details: details || {},
  });
  return ref.id;
};

export const addTemplateEvent = async ({
  templateId,
  type,
  actorType,
  actorId,
  actorEmail,
  ip,
  userAgent,
  details,
}) => {
  const db = getAdminDb();
  const ref = db
    .collection("documentacionTemplates")
    .doc(String(templateId))
    .collection("events")
    .doc();
  await ref.set({
    type: String(type),
    at: nowIso(),
    actorType: actorType || "",
    actorId: actorId || "",
    actorEmail: actorEmail || "",
    ip: ip || "",
    userAgent: userAgent || "",
    details: details || {},
  });
  return ref.id;
};

export const findDocumentoByPublicTokenHash = async (tokenHash) => {
  const hash = String(tokenHash || "").trim();
  if (!hash) return null;
  const db = getAdminDb();
  const snap1 = await db
    .collection("documentos")
    .where("archived", "==", false)
    .where("public.tokenHashes", "array-contains", hash)
    .limit(1)
    .get();
  const docSnap1 = snap1.docs[0];
  if (docSnap1) return docSnap1;

  const snap2 = await db
    .collection("documentos")
    .where("archived", "==", false)
    .where("public.tokenHash", "==", hash)
    .limit(1)
    .get();
  return snap2.docs[0] || null;
};
