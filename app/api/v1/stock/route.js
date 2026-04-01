import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";

function withCors(resp) {
  const headers = new Headers(resp.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET,OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  return new NextResponse(resp.body, { status: resp.status, headers });
}

export function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const ventaId = searchParams.get("ventaId");
    const id = searchParams.get("id");
    const idsParam = searchParams.get("ids");
    const now = Date.now();

    if (ventaId) {
      const ventaRef = doc(db, "ventas", ventaId);
      const ventaSnap = await getDoc(ventaRef);
      if (!ventaSnap.exists()) {
        return withCors(NextResponse.json({ error: "Venta no encontrada" }, { status: 404 }));
      }
      const venta = ventaSnap.data() || {};
      const productos = Array.isArray(venta.productos) ? venta.productos : Array.isArray(venta.items) ? venta.items : [];

      const esperadoPorProducto = new Map();
      for (const p of productos) {
        const productoId = String(p?.originalId || p?.id || "").trim();
        if (!productoId) continue;
        const cantidad = Math.max(0, Math.ceil(Number(p?.cantidad) || 0));
        if (cantidad === 0) continue;
        const prev = esperadoPorProducto.get(productoId);
        esperadoPorProducto.set(productoId, {
          productoId,
          cantidad: (prev?.cantidad || 0) + cantidad,
          nombre: prev?.nombre || p?.nombre || "",
        });
      }

      const movimientosQ = query(collection(db, "movimientos"), where("referenciaId", "==", ventaId));
      const movimientosSnap = await getDocs(movimientosQ);

      const deltaPorProducto = new Map();
      const movimientos = [];
      movimientosSnap.forEach((d) => {
        const m = d.data() || {};
        const productoId = String(m.productoId || "").trim();
        const tipo = String(m.tipo || "").toLowerCase();
        const cantidad = Math.max(0, Math.ceil(Number(m.cantidad) || 0));
        if (!productoId || cantidad === 0) return;

        const delta = tipo === "entrada" ? cantidad : tipo === "salida" ? -cantidad : 0;
        if (delta === 0) return;

        deltaPorProducto.set(productoId, (deltaPorProducto.get(productoId) || 0) + delta);
        movimientos.push({
          id: d.id,
          productoId,
          tipo,
          cantidad,
          referencia: m.referencia || "",
          fecha: m.fecha || null,
          observaciones: m.observaciones || "",
          usuario: m.usuario || "",
        });
      });

      const discrepancias = [];
      for (const entry of esperadoPorProducto.values()) {
        const esperadoDelta = -entry.cantidad;
        const realDelta = deltaPorProducto.get(entry.productoId) || 0;
        if (realDelta !== esperadoDelta) {
          discrepancias.push({
            productoId: entry.productoId,
            nombre: entry.nombre,
            cantidadActualEnVenta: entry.cantidad,
            deltaEsperado: esperadoDelta,
            deltaEnMovimientos: realDelta,
          });
        }
      }

      for (const [productoId, realDelta] of deltaPorProducto.entries()) {
        if (!esperadoPorProducto.has(productoId)) {
          discrepancias.push({
            productoId,
            nombre: "",
            cantidadActualEnVenta: 0,
            deltaEsperado: 0,
            deltaEnMovimientos: realDelta,
          });
        }
      }

      return withCors(
        NextResponse.json({
          ventaId,
          esperado: Array.from(esperadoPorProducto.values()),
          movimientos,
          discrepancias,
          ok: discrepancias.length === 0,
        })
      );
    }

    const productoIds = [];
    if (id) productoIds.push(id);
    if (idsParam) {
      idsParam
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((x) => productoIds.push(x));
    }

    if (productoIds.length === 0) {
      return withCors(NextResponse.json({ error: "Debe enviar id o ids" }, { status: 400 }));
    }

    const items = [];
    for (const pid of productoIds) {
      const ref = doc(db, "productos", pid);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        items.push({ id: pid, error: "No encontrado" });
        continue;
      }
      const data = { id: snap.id, ...snap.data() };

      // Reservas vigentes
      let reservadas = 0;
      try {
        const qq = query(collection(db, "reservasStock"), where("productoId", "==", pid));
        const rs = await getDocs(qq);
        rs.forEach((d) => {
          const r = d.data();
          if (String(r.estado || "").toLowerCase() !== "activa") return;
          const exp = r.expiresAt ? Date.parse(r.expiresAt) : 0;
          if (Number.isFinite(exp) && exp > now) {
            const cant = Number(r.cantidad);
            if (Number.isFinite(cant)) reservadas += cant;
          }
        });
      } catch (_) {}

      const stockTotal = Number(data.stock) || 0;
      const stockDisponible = Math.max(0, stockTotal - reservadas);
      items.push({
        id: data.id,
        stockTotal,
        stockReservado: reservadas,
        stockDisponible,
        estado: data.estado || "",
        nombre: data.nombre || "",
        unidadMedida: data.unidadMedida || "",
      });
    }

    return withCors(NextResponse.json({ items }));
  } catch (err) {
    return withCors(NextResponse.json({ error: err.message }, { status: 500 }));
  }
}


