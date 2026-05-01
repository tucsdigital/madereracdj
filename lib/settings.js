import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";

function toNumero(valor) {
  const n = typeof valor === "number" ? valor : parseFloat(String(valor ?? ""));
  return Number.isFinite(n) ? n : null;
}

function normalizarLocation(raw) {
  const id = raw?.id != null ? String(raw.id) : undefined;
  const nombre = String(raw?.nombre ?? "");
  const direccion = String(raw?.direccion ?? "");
  const lat = toNumero(raw?.lat);
  const lng = toNumero(raw?.lng);
  const radio = toNumero(raw?.radio);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(radio)) return null;
  return id ? { id, nombre, direccion, lat, lng, radio } : { nombre, direccion, lat, lng, radio };
}

function normalizarTier(raw) {
  const km = toNumero(raw?.km);
  const price = toNumero(raw?.price ?? raw?.precio);
  if (!Number.isFinite(km) || !Number.isFinite(price)) return null;
  return { km, price };
}

export async function obtenerSettingsGeneral() {
  const snap = await getDoc(doc(db, "settings", "general"));
  if (!snap.exists()) {
    return { locations: [], shippingTiers: [], data: null };
  }
  const data = snap.data() || {};
  const general = data?.locations ? data : data?.settings?.general || {};
  const locationsRaw = Array.isArray(general?.locations) ? general.locations : [];
  const locations = locationsRaw
    .map(normalizarLocation)
    .filter((x) => x && Number.isFinite(x.lat) && Number.isFinite(x.lng) && Number.isFinite(x.radio));
  const tiersRaw = Array.isArray(general?.shippingTiers) ? general.shippingTiers : [];
  const shippingTiers = tiersRaw.map(normalizarTier).filter(Boolean).sort((a, b) => a.km - b.km);
  return { locations, shippingTiers, data: general };
}


