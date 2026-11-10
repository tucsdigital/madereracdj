import { getAdminDb } from "@/lib/firebase-admin";
import { construirEstadoCuentaCompartido } from "@/lib/erp/cuentas-pagar-compartir";
import { sha256 } from "@/lib/documentacion-server";

const COLLECTION = "enlacesCuentasPorPagar";

const getProviderDocuments = async (db, providerId) => {
  const [byId, byEmbeddedId] = await Promise.all([
    db.collection("gastos").where("proveedorId", "==", providerId).get(),
    db.collection("gastos").where("proveedor.id", "==", providerId).get(),
  ]);
  const unique = new Map();
  for (const snapshot of [byId, byEmbeddedId]) {
    for (const item of snapshot.docs) {
      const data = item.data() || {};
      if (data.tipo === "proveedor") unique.set(item.id, { id: item.id, ...data });
    }
  }
  return Array.from(unique.values());
};

const getProviderMovements = async (db, providerId) => {
  const snapshot = await db.collection("pagosProveedores").where("proveedorId", "==", providerId).get();
  return snapshot.docs.map((item) => ({ id: item.id, ...(item.data() || {}) }));
};

export const getStatementForProvider = async (providerId, filters = {}) => {
  const id = String(providerId || "").trim();
  if (!id) return null;
  const db = getAdminDb();
  const providerSnapshot = await db.collection("proveedores").doc(id).get();
  if (!providerSnapshot.exists) return null;

  const [accounts, movements] = await Promise.all([
    getProviderDocuments(db, id),
    getProviderMovements(db, id),
  ]);

  return construirEstadoCuentaCompartido({
    proveedorId: id,
    proveedor: { id, ...(providerSnapshot.data() || {}) },
    cuentas: accounts,
    movimientos: movements,
    filters,
    generatedAt: new Date().toISOString(),
  });
};

export const getPublicStatementByToken = async (token) => {
  const rawToken = String(token || "").trim();
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(rawToken)) return null;

  const db = getAdminDb();
  const shareSnapshot = await db.collection(COLLECTION).doc(sha256(rawToken)).get();
  if (!shareSnapshot.exists) return null;

  const share = shareSnapshot.data() || {};
  if (share.revokedAt) return null;
  if (share.expiresAt && new Date(share.expiresAt).getTime() <= Date.now()) return null;

  const filters = share.filters?.scope === "range"
    ? { from: String(share.filters.from || ""), to: String(share.filters.to || "") }
    : {};
  return getStatementForProvider(share.providerId, filters);
};

export const getStatementShareCollection = () => getAdminDb().collection(COLLECTION);
