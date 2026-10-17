import { NextResponse } from "next/server";
import { obtenerSettingsGeneral } from "@/lib/settings";
import { getAdminDb, verifyFirebaseToken } from "@/lib/firebase-admin";
import { normalizeShippingRules, validateShippingConfig } from "@/lib/shipping";

export const runtime = "nodejs";

function toNumero(valor) {
  const n = typeof valor === "number" ? valor : parseFloat(String(valor ?? ""));
  return Number.isFinite(n) ? n : null;
}

function normalizarLocation(raw, idx) {
  const id = raw?.id != null ? String(raw.id) : `store_${idx + 1}`;
  const nombre = String(raw?.nombre ?? "").trim();
  const direccion = String(raw?.direccion ?? "").trim();
  const lat = toNumero(raw?.lat);
  const lng = toNumero(raw?.lng);
  const radio = toNumero(raw?.radio);
  if (!nombre) return { error: `Sucursal #${idx + 1}: nombre requerido` };
  if (!direccion) return { error: `Sucursal #${idx + 1}: dirección requerida` };
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { error: `Sucursal #${idx + 1}: lat/lng inválidos` };
  }
  if (!Number.isFinite(radio) || radio <= 0) {
    return { error: `Sucursal #${idx + 1}: radio inválido` };
  }
  return {
    value: {
      id,
      nombre,
      direccion,
      lat,
      lng,
      radio,
    },
  };
}

function normalizarTier(raw, idx) {
  const km = toNumero(raw?.km);
  const price = toNumero(raw?.price ?? raw?.precio);
  if (!Number.isFinite(km) || km <= 0) {
    return { error: `Tramo #${idx + 1}: km inválido` };
  }
  if (!Number.isFinite(price) || price < 0) {
    return { error: `Tramo #${idx + 1}: precio inválido` };
  }
  return { value: { km, price } };
}

function construirRangos(tiers) {
  let desde = 0;
  return tiers.map((tier, idx) => {
    const rango = {
      index: idx,
      fromKm: Math.round(desde * 100) / 100,
      toKm: Math.round(tier.km * 100) / 100,
      price: tier.price,
    };
    desde = tier.km;
    return rango;
  });
}

function construirResumen(locations, tiers) {
  const radios = locations.map((x) => Number(x.radio) || 0).filter((x) => x > 0);
  const precios = tiers.map((x) => Number(x.price) || 0);
  const kms = tiers.map((x) => Number(x.km) || 0);
  const maxRadioKm = radios.length ? Math.max(...radios) / 1000 : 0;
  const minPrice = precios.length ? Math.min(...precios) : 0;
  const maxPrice = precios.length ? Math.max(...precios) : 0;
  const maxTierKm = kms.length ? Math.max(...kms) : 0;
  return {
    locationsCount: locations.length,
    tiersCount: tiers.length,
    maxRadioKm: Math.round(maxRadioKm * 100) / 100,
    maxTierKm: Math.round(maxTierKm * 100) / 100,
    minPrice,
    maxPrice,
  };
}

function normalizarPayload(body) {
  const rawLocations = Array.isArray(body?.locations) ? body.locations : [];
  const rawTiers = Array.isArray(body?.shippingTiers) ? body.shippingTiers : [];
  const locations = [];
  const shippingTiers = [];
  const errores = [];

  rawLocations.forEach((x, idx) => {
    const parsed = normalizarLocation(x, idx);
    if (parsed.error) errores.push(parsed.error);
    else locations.push(parsed.value);
  });
  const ids = locations.map((x) => x.id);
  if (new Set(ids).size !== ids.length) errores.push("Hay sucursales con identificador repetido");

  rawTiers.forEach((x, idx) => {
    const parsed = normalizarTier(x, idx);
    if (parsed.error) errores.push(parsed.error);
    else shippingTiers.push(parsed.value);
  });

  shippingTiers.sort((a, b) => a.km - b.km);
  for (let i = 1; i < shippingTiers.length; i++) {
    if (shippingTiers[i].km <= shippingTiers[i - 1].km) {
      errores.push(`Tramos: el km debe ser estrictamente creciente (error en tramo #${i + 1})`);
      break;
    }
  }

  const rulesCheck = validateShippingConfig({ locations, tiers: shippingTiers, rules: body?.shippingRules });
  errores.push(...rulesCheck.errors);
  const shippingRules = normalizeShippingRules(body?.shippingRules);

  return { locations, shippingTiers, shippingRules, errores, avisos: rulesCheck.warnings };
}

function buildResponse(locations, shippingTiers, shippingRules, avisos = []) {
  return {
    locations,
    shippingTiers,
    shippingRules,
    shippingRanges: construirRangos(shippingTiers),
    summary: construirResumen(locations, shippingTiers),
    warnings: avisos,
  };
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

export async function GET() {
  try {
    const { locations, shippingTiers, shippingRules } = await obtenerSettingsGeneral();
    const { warnings } = validateShippingConfig({ locations, tiers: shippingTiers, rules: shippingRules });
    return NextResponse.json(buildResponse(locations, shippingTiers, shippingRules, warnings));
  } catch (error) {
    return NextResponse.json(
      { error: "No se pudo obtener la configuración de envíos", details: error?.message || "internal_error" },
      { status: 500 }
    );
  }
}

export async function PUT(request) {
  try {
    // Sólo usuarios autenticados del sistema pueden modificar sucursales y tarifas.
    const actor = await verifyFirebaseToken(request.headers.get("authorization"));
    const body = await request.json();
    const adminDb = getAdminDb();
    const ref = adminDb.collection("settings").doc("general");
    const before = await obtenerSettingsGeneral();
    // Los bloques que no se envían se conservan, así guardar reglas no pisa sucursales ni tarifas.
    const { locations, shippingTiers, shippingRules, errores, avisos } = normalizarPayload({
      locations: body?.locations ?? before.locations,
      shippingTiers: body?.shippingTiers ?? before.shippingTiers,
      shippingRules: body?.shippingRules ?? before.shippingRules,
    });
    if (errores.length > 0) {
      return NextResponse.json({ error: "Datos inválidos", errores }, { status: 400 });
    }
    const at = new Date().toISOString();
    await ref.set({ locations, shippingTiers, shippingRules }, { merge: true });
    // Historial de cambios para auditar y poder volver a una versión anterior.
    await adminDb.collection("settingsHistory").add({
      tipo: "envios",
      at,
      byUid: String(actor?.uid || ""),
      byEmail: String(actor?.email || ""),
      before: { locations: before.locations, shippingTiers: before.shippingTiers, shippingRules: before.shippingRules },
      after: { locations, shippingTiers, shippingRules },
    });
    return NextResponse.json(buildResponse(locations, shippingTiers, shippingRules, avisos));
  } catch (error) {
    return NextResponse.json(
      { error: error?.status === 401 ? "Iniciá sesión para modificar los envíos" : "No se pudo guardar la configuración de envíos", details: error?.message || "internal_error" },
      { status: error?.status || 500 }
    );
  }
}
