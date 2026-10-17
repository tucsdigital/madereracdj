import { NextResponse } from "next/server";
import { obtenerSettingsGeneral } from "@/lib/settings";
import { getAdminDb, verifyFirebaseToken } from "@/lib/firebase-admin";
import { normalizeShippingRules, shippingIssues, validateShippingConfig } from "@/lib/shipping";

export const runtime = "nodejs";

const toNumero = (valor) => {
  const n = typeof valor === "number" ? valor : parseFloat(String(valor ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

// Convierte lo que llega del panel en datos limpios; la validación (con mensajes por campo) la hace `shippingIssues`.
const limpiarSucursales = (lista) =>
  (Array.isArray(lista) ? lista : []).map((raw, idx) => ({
    id: String(raw?.id ?? "").trim() || `store_${idx + 1}`,
    nombre: String(raw?.nombre ?? "").trim(),
    direccion: String(raw?.direccion ?? "").trim(),
    lat: toNumero(raw?.lat),
    lng: toNumero(raw?.lng),
    radio: toNumero(raw?.radio),
  }));

const limpiarTarifas = (lista) =>
  (Array.isArray(lista) ? lista : [])
    .map((raw) => ({ km: toNumero(raw?.km), price: toNumero(raw?.price ?? raw?.precio) }))
    .sort((a, b) => (a.km ?? Infinity) - (b.km ?? Infinity));

function construirRangos(tiers) {
  let desde = 0;
  return tiers.map((tier, idx) => {
    const rango = { index: idx, fromKm: Math.round(desde * 100) / 100, toKm: Math.round(tier.km * 100) / 100, price: tier.price };
    desde = tier.km;
    return rango;
  });
}

function construirResumen(locations, tiers) {
  const radios = locations.map((x) => Number(x.radio) || 0).filter((x) => x > 0);
  const precios = tiers.map((x) => Number(x.price) || 0);
  const kms = tiers.map((x) => Number(x.km) || 0);
  return {
    locationsCount: locations.length,
    tiersCount: tiers.length,
    maxRadioKm: radios.length ? Math.round((Math.max(...radios) / 1000) * 100) / 100 : 0,
    maxTierKm: kms.length ? Math.round(Math.max(...kms) * 100) / 100 : 0,
    minPrice: precios.length ? Math.min(...precios) : 0,
    maxPrice: precios.length ? Math.max(...precios) : 0,
  };
}

async function estado() {
  const { locations, shippingTiers, shippingRules, data } = await obtenerSettingsGeneral();
  return {
    locations,
    shippingTiers,
    shippingRules,
    shippingRanges: construirRangos(shippingTiers),
    summary: construirResumen(locations, shippingTiers),
    warnings: validateShippingConfig({ locations, tiers: shippingTiers, rules: shippingRules }).warnings,
    version: Number(data?.shippingVersion) || 0,
    savedAt: data?.shippingSavedAt || null,
    savedBy: data?.shippingSavedBy || null,
  };
}

const fail = (error) => {
  const status = error?.status || 500;
  const message = status === 401 ? "Iniciá sesión para modificar los envíos." : "No se pudo completar la acción.";
  return NextResponse.json({ error: message, details: error?.message || "internal_error" }, { status });
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

export async function GET() {
  try {
    return NextResponse.json(await estado());
  } catch (error) {
    return NextResponse.json({ error: "No se pudo obtener la configuración de envíos.", details: error?.message || "internal_error" }, { status: 500 });
  }
}

// Guarda sucursales, tarifas y reglas juntas. Los bloques que no se envían se conservan.
export async function PUT(request) {
  try {
    // Sólo usuarios autenticados del sistema pueden modificar sucursales y tarifas.
    const actor = await verifyFirebaseToken(request.headers.get("authorization"));
    const body = (await request.json().catch(() => ({}))) || {};
    const before = await estado();

    const locations = body.locations === undefined ? before.locations : limpiarSucursales(body.locations);
    const shippingTiers = body.shippingTiers === undefined ? before.shippingTiers : limpiarTarifas(body.shippingTiers);
    const shippingRules = normalizeShippingRules(body.shippingRules === undefined ? before.shippingRules : body.shippingRules);

    const issues = shippingIssues({ locations, tiers: shippingTiers, rules: body.shippingRules === undefined ? before.shippingRules : body.shippingRules });
    if (new Set(locations.map((l) => l.id)).size !== locations.length) {
      issues.push({ scope: "sucursales", index: null, field: null, message: "Hay sucursales con el mismo identificador." });
    }
    if (issues.length > 0) {
      return NextResponse.json({ error: "Hay datos que corregir antes de guardar.", errores: issues.map((i) => i.message), issues }, { status: 400 });
    }

    // Si otra persona guardó mientras tanto, no se pisa su trabajo.
    if (body.baseVersion !== undefined && Number(body.baseVersion) !== before.version) {
      return NextResponse.json({ error: "Otra persona modificó los envíos mientras editabas. Recargá la página para ver los cambios." }, { status: 409 });
    }

    const igual = JSON.stringify({ l: before.locations, t: before.shippingTiers, r: before.shippingRules }) === JSON.stringify({ l: locations, t: shippingTiers, r: shippingRules });
    if (igual) return NextResponse.json(before);

    const adminDb = getAdminDb();
    const at = new Date().toISOString();
    // Historial de cambios para auditar y poder volver a una versión anterior.
    await adminDb.collection("settingsHistory").add({
      tipo: "envios",
      at,
      byUid: String(actor?.uid || ""),
      byEmail: String(actor?.email || ""),
      before: { locations: before.locations, shippingTiers: before.shippingTiers, shippingRules: before.shippingRules },
      after: { locations, shippingTiers, shippingRules },
    });
    await adminDb.collection("settings").doc("general").set({
      locations,
      shippingTiers,
      shippingRules,
      shippingVersion: before.version + 1,
      shippingSavedAt: at,
      shippingSavedBy: String(actor?.email || actor?.uid || ""),
    }, { merge: true });
    return NextResponse.json(await estado());
  } catch (error) {
    return fail(error);
  }
}
