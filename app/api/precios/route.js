import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { collection, doc, getDoc, getDocs, query, where, limit } from "firebase/firestore";
import { calcularPreciosProducto, normalizarProductoEntrada } from "@/lib/pricing";

// Sencillo helper CORS
function withCors(resp) {
  const headers = new Headers(resp.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  return new NextResponse(resp.body, { status: resp.status, headers });
}

export function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

// GET /api/precios?id=...&cantidad=1&cepillado=true|false
// GET /api/precios?codigo=ABC123 o ?nombre=...
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const codigo = searchParams.get("codigo");
    const nombre = searchParams.get("nombre");
    const cantidad = parseFloat(searchParams.get("cantidad") || "1");
    const cepillado = (searchParams.get("cepillado") || "false").toLowerCase() === "true";
    const redondearParam = searchParams.get("redondear");
    const redondear = redondearParam == null ? true : redondearParam.toLowerCase() !== "false";

    let producto = null;

    if (id) {
      const ref = doc(db, "productos", id);
      const snap = await getDoc(ref);
      if (snap.exists()) producto = { id: snap.id, ...snap.data() };
    } else if (codigo) {
      const qq = query(
        collection(db, "productos"),
        where("codigo", "==", codigo),
        limit(1)
      );
      const snap = await getDocs(qq);
      snap.forEach((d) => (producto = { id: d.id, ...d.data() }));
    } else if (nombre) {
      // Búsqueda simple por igualdad; para fuzzy ver /api/productos/search
      const qq = query(
        collection(db, "productos"),
        where("nombre", "==", nombre),
        limit(1)
      );
      const snap = await getDocs(qq);
      snap.forEach((d) => (producto = { id: d.id, ...d.data() }));
    } else {
      return withCors(NextResponse.json({ error: "Debe enviar id, codigo o nombre" }, { status: 400 }));
    }

    if (!producto) {
      return withCors(NextResponse.json({ error: "Producto no encontrado" }, { status: 404 }));
    }

    const normalized = normalizarProductoEntrada(producto);
    const pricing = calcularPreciosProducto(normalized, { cantidad, cepillado, redondear });
    return withCors(NextResponse.json({ id: producto.id, producto: normalized, pricing }));
  } catch (err) {
    return withCors(NextResponse.json({ error: err.message }, { status: 500 }));
  }
}

// POST /api/precios  Body: { items: [{ producto: {...}, cantidad, cepillado } | { id, cantidad, cepillado } ] }
export async function POST(request) {
  try {
    const body = await request.json();
    const items = Array.isArray(body?.items) ? body.items : [];
    const redondear = body?.redondear == null ? true : Boolean(body.redondear);
    if (!Array.isArray(items) || items.length === 0) {
      return withCors(NextResponse.json({ error: "items vacío" }, { status: 400 }));
    }

    const out = [];
    for (const it of items) {
      let prod = it.producto;
      if (!prod && it.id) {
        const ref = doc(db, "productos", String(it.id));
        const snap = await getDoc(ref);
        if (snap.exists()) prod = { id: snap.id, ...snap.data() };
      }
      if (!prod) {
        out.push({ error: "Producto no encontrado", input: it });
        continue;
      }
      const cantidad = typeof it.cantidad === "number" ? it.cantidad : parseFloat(String(it.cantidad || "1"));
      const cepillado = Boolean(it.cepillado);
      const normalized = normalizarProductoEntrada(prod);
      const pricing = calcularPreciosProducto(normalized, { cantidad, cepillado, redondear });
      out.push({ id: normalized.id, producto: normalized, pricing });
    }

    return withCors(NextResponse.json({ items: out }));
  } catch (err) {
    return withCors(NextResponse.json({ error: err.message }, { status: 500 }));
  }
}


