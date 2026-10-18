import { getAdminDb } from "@/lib/firebase-admin";
import { normalizeTiendaConfig } from "@/lib/tienda-config";

/** Ajustes publicados del checkout; las reservas nuevas nunca leen borradores del panel. */
export async function getPublishedCheckoutSettings(db = getAdminDb()) {
  const settings = (await db.collection("settings").doc("tienda").get()).data() || {};
  return normalizeTiendaConfig(settings.published).checkout;
}
