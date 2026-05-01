import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { obtenerSettingsGeneral } from "@/lib/settings";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";

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

  return { locations, shippingTiers, errores };
}

function buildResponse(locations, shippingTiers) {
  return {
    locations,
    shippingTiers,
    shippingRanges: construirRangos(shippingTiers),
    summary: construirResumen(locations, shippingTiers),
  };
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

export async function GET() {
  try {
    const { locations, shippingTiers } = await obtenerSettingsGeneral();
    return NextResponse.json(buildResponse(locations, shippingTiers));
  } catch (error) {
    return NextResponse.json(
      { error: "No se pudo obtener la configuración de envíos", details: error?.message || "internal_error" },
      { status: 500 }
    );
  }
}

export async function PUT(request) {
  try {
    const body = await request.json();
    const { locations, shippingTiers, errores } = normalizarPayload(body || {});
    if (errores.length > 0) {
      return NextResponse.json({ error: "Datos inválidos", errores }, { status: 400 });
    }

    const ref = doc(db, "settings", "general");
    const snap = await getDoc(ref);
    const payload = { locations, shippingTiers };
    if (!snap.exists()) await setDoc(ref, payload);
    else await updateDoc(ref, payload);
    return NextResponse.json(buildResponse(locations, shippingTiers));
  } catch (error) {
    return NextResponse.json(
      { error: "No se pudo guardar la configuración de envíos", details: error?.message || "internal_error" },
      { status: 500 }
    );
  }
}
