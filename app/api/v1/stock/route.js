import { NextResponse } from "next/server";
import { db } from "@/lib/firebase";
import { collection, doc, getDoc, getDocs, query, where, orderBy, limit } from "firebase/firestore";

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
    const auditVentasMes = searchParams.get("auditVentasMes");
    const auditDesde = searchParams.get("auditDesde");
    const auditHasta = searchParams.get("auditHasta");
    const limitVentas = Math.max(1, Math.min(500, Number(searchParams.get("limitVentas") || 100)));
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

    if (auditVentasMes || auditDesde || auditHasta) {
      const nowLocal = new Date();
      const currentMonthStartIso = `${String(nowLocal.getFullYear()).padStart(4, "0")}-${String(nowLocal.getMonth() + 1).padStart(2, "0")}-01`;

      const monthToRange = (ym) => {
        const raw = String(ym || "").trim();
        const m = raw.match(/^(\d{4})-(\d{2})$/);
        if (!m) return null;
        const year = Number(m[1]);
        const month = Number(m[2]);
        if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return null;
        const start = `${m[1]}-${m[2]}-01`;
        const nextMonth = month === 12 ? 1 : month + 1;
        const nextYear = month === 12 ? year + 1 : year;
        const end = `${String(nextYear).padStart(4, "0")}-${String(nextMonth).padStart(2, "0")}-01`;
        return { start, end };
      };

      const isoDateOnly = (v) => {
        const s = String(v || "").trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
        return null;
      };

      const range = auditVentasMes ? monthToRange(auditVentasMes) : null;
      const requestedStartIso =
        isoDateOnly(auditDesde) || range?.start || currentMonthStartIso;
      const requestedEndIso =
        isoDateOnly(auditHasta) || range?.end || (() => {
          const y = Number(requestedStartIso.slice(0, 4));
          const m = Number(requestedStartIso.slice(5, 7));
          const nextMonth = m === 12 ? 1 : m + 1;
          const nextYear = m === 12 ? y + 1 : y;
          return `${String(nextYear).padStart(4, "0")}-${String(nextMonth).padStart(2, "0")}-01`;
        })();

      const startIso = requestedStartIso < currentMonthStartIso ? currentMonthStartIso : requestedStartIso;
      const endIso = requestedEndIso <= startIso ? (() => {
        const y = Number(startIso.slice(0, 4));
        const m = Number(startIso.slice(5, 7));
        const nextMonth = m === 12 ? 1 : m + 1;
        const nextYear = m === 12 ? y + 1 : y;
        return `${String(nextYear).padStart(4, "0")}-${String(nextMonth).padStart(2, "0")}-01`;
      })() : requestedEndIso;

      let ventasSnap = null;
      try {
        const ventasQ = query(
          collection(db, "ventas"),
          where("fecha", ">=", startIso),
          where("fecha", "<", endIso),
          orderBy("fecha", "desc"),
          limit(limitVentas)
        );
        ventasSnap = await getDocs(ventasQ);
      } catch (e) {
        const ventasQ = query(collection(db, "ventas"), limit(limitVentas));
        ventasSnap = await getDocs(ventasQ);
      }

      const problemas = [];
      for (const vdoc of ventasSnap.docs) {
        const venta = vdoc.data() || {};
        const vid = vdoc.id;
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

        const movimientosQ = query(collection(db, "movimientos"), where("referenciaId", "==", vid));
        const movimientosSnap = await getDocs(movimientosQ);
        const deltaPorProducto = new Map();
        movimientosSnap.forEach((d) => {
          const m = d.data() || {};
          const productoId = String(m.productoId || "").trim();
          const tipo = String(m.tipo || "").toLowerCase();
          const cantidad = Math.max(0, Math.ceil(Number(m.cantidad) || 0));
          if (!productoId || cantidad === 0) return;
          const delta = tipo === "entrada" ? cantidad : tipo === "salida" ? -cantidad : 0;
          if (delta === 0) return;
          deltaPorProducto.set(productoId, (deltaPorProducto.get(productoId) || 0) + delta);
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

        if (discrepancias.length > 0) {
          problemas.push({
            ventaId: vid,
            numeroPedido: venta.numeroPedido || "",
            fecha: venta.fecha || venta.fechaCreacion || "",
            discrepancias,
            movimientosRelacionados: movimientosSnap.size,
          });
        }
      }

      return withCors(
        NextResponse.json({
          desde: startIso,
          hasta: endIso,
          modo: "solo_informe",
          ventasAuditadas: ventasSnap.size,
          ventasConProblemas: problemas.length,
          problemas,
          ok: problemas.length === 0,
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


