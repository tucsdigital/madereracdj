import { NextResponse } from "next/server";
import { FieldPath, FieldValue } from "firebase-admin/firestore";
import { getAdminDb, verifyFirebaseToken } from "@/lib/firebase-admin";

const parseBool = (value, defaultValue) => {
  if (value === null || value === undefined || value === "") return defaultValue;
  const v = String(value).trim().toLowerCase();
  if (v === "1" || v === "true" || v === "yes" || v === "y") return true;
  if (v === "0" || v === "false" || v === "no" || v === "n") return false;
  return defaultValue;
};

const toMs = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return NaN;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return Date.parse(`${raw}T00:00:00-03:00`);
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : NaN;
};

const normalizarProductoId = (p) => String(p?.originalId || p?.id || "").trim();
const normalizarCantidad = (p) => Math.max(0, Math.ceil(Number(p?.cantidad) || 0));

const computeExpectedByProducto = (venta) => {
  const productos = Array.isArray(venta?.productos)
    ? venta.productos
    : Array.isArray(venta?.items)
      ? venta.items
      : [];
  const expected = new Map();
  for (const p of productos) {
    const productoId = normalizarProductoId(p);
    if (!productoId) continue;
    const qty = normalizarCantidad(p);
    if (qty === 0) continue;
    const prev = expected.get(productoId) || 0;
    expected.set(productoId, prev - qty);
  }
  return expected;
};

const ALLOWED_REFERENCIAS = new Set([
  "venta",
  "edicion_venta",
  "venta_ecommerce",
  "reconciliacion_venta",
]);

const computeActualByProductoFromMovimientos = (movimientos) => {
  const actual = new Map();
  for (const m of movimientos) {
    const referencia = String(m?.referencia || "").trim();
    if (!ALLOWED_REFERENCIAS.has(referencia)) continue;
    const productoId = String(m?.productoId || "").trim();
    if (!productoId) continue;
    const delta = Number(m?.stockDelta) || 0;
    const prev = actual.get(productoId) || 0;
    actual.set(productoId, prev + delta);
  }
  return actual;
};

const buildReconMovimientoId = ({ ventaId, productoId, expectedDelta }) => {
  const safeVenta = String(ventaId || "").replaceAll("/", "_").slice(0, 120);
  const safeProducto = String(productoId || "").replaceAll("/", "_").slice(0, 120);
  const safeExpected = String(Number(expectedDelta) || 0);
  return `recon_venta_${safeVenta}_${safeProducto}_${safeExpected}`;
};

const buildReconObservaciones = ({ ventaId, ventaNumeroPedido, productoId, productoNombre, expectedDelta, actualDelta, diff, movimientoId }) => {
  const pedido = ventaNumeroPedido ? `${ventaNumeroPedido}` : `${ventaId}`;
  const prod = productoNombre ? `“${productoNombre}”` : "el producto";
  const tipo = diff < 0 ? "Salida" : "Ingreso";
  const qty = Math.abs(Number(diff) || 0);
  const qtyLabel = `${qty} ${qty === 1 ? "unidad" : "unidades"}`;
  const exp = Number(expectedDelta) || 0;
  const act = Number(actualDelta) || 0;

  let motivo = "se detectó una diferencia entre la venta y el stock registrado.";
  if (act === 0) {
    motivo = "la venta no impactó el stock automáticamente.";
  } else if (exp !== 0 && Math.sign(act) !== Math.sign(exp)) {
    motivo = "se registró un movimiento en sentido contrario.";
  } else if (Math.abs(act) < Math.abs(exp)) {
    motivo = "el stock se había actualizado de forma parcial.";
  } else if (Math.abs(act) > Math.abs(exp)) {
    motivo = "se había registrado stock de más.";
  }

  return `${pedido}. Ajuste automático de stock para ${prod}. Motivo: ${motivo} Acción: ${tipo} de ${qtyLabel}.`;
};

export async function POST(request) {
  try {
    const secret = String(process.env.CRON_SECRET || "").trim();
    const auth = String(request.headers.get("authorization") || "");
    const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
    let actor = { uid: "", email: "", authMode: "" };
    if (secret && token === secret) {
      actor = { uid: "", email: "", authMode: "cron_secret" };
    } else {
      const decoded = await verifyFirebaseToken(auth);
      if (decoded?.email !== "admin@admin.com") {
        return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
      }
      actor = { uid: String(decoded?.uid || ""), email: String(decoded?.email || ""), authMode: "firebase_token" };
    }

    const url = new URL(request.url);
    const dryRun = parseBool(url.searchParams.get("dryRun"), true);
    const limit = Math.max(1, Math.min(300, Number(url.searchParams.get("limit") || 120)));
    const backfillObservaciones = parseBool(url.searchParams.get("backfillObservaciones"), false);
    const ventaIdFilter = String(url.searchParams.get("ventaId") || "").trim();
    const productoIdFilter = String(url.searchParams.get("productoId") || "").trim();

    const sinceMsParam = toMs(url.searchParams.get("since"));
    const daysParam = Number(url.searchParams.get("days") || 7);
    const days = Number.isFinite(daysParam) ? Math.max(1, Math.min(90, daysParam)) : 7;
    const sinceMs = Number.isFinite(sinceMsParam) ? sinceMsParam : Date.now() - days * 24 * 60 * 60 * 1000;

    const db = getAdminDb();

    if (backfillObservaciones) {
      const prefixStart = "recon_venta_";
      const prefixEnd = "recon_venta_\uf8ff";
      const cursor = String(url.searchParams.get("cursor") || "").trim();

      let q = db
        .collection("movimientos")
        .orderBy(FieldPath.documentId())
        .startAt(prefixStart)
        .endAt(prefixEnd)
        .limit(limit);

      if (cursor) q = q.startAfter(cursor);

      const snap = await q.get();
      const docs = snap.docs;

      const result = {
        ok: true,
        dryRun,
        backfillObservaciones: true,
        scanned: docs.length,
        updated: 0,
        skipped: 0,
        nextCursor: docs.length > 0 ? docs[docs.length - 1].id : null,
      };

      if (docs.length === 0) return NextResponse.json(result, { status: 200 });

      const batch = db.batch();
      for (const d of docs) {
        const data = d.data() || {};
        const obs = String(data.observaciones || "");
        const referencia = String(data.referencia || "");
        if (referencia !== "reconciliacion_venta") {
          result.skipped += 1;
          continue;
        }
        if (obs && !obs.startsWith("Reconciliación automática:")) {
          result.skipped += 1;
          continue;
        }

        const ventaId = String(data.referenciaId || "");
        const ventaNumeroPedido = String(data.ventaNumeroPedido || "");
        const productoId = String(data.productoId || "");
        const productoNombre = String(data.productoNombre || "");
        const expectedDelta = Number(data.expectedDelta) || 0;
        const actualDelta = Number(data.actualDeltaAntes) || 0;
        const diff = Number(data.stockDelta) || 0;

        const newObs = buildReconObservaciones({
          ventaId,
          ventaNumeroPedido,
          productoId,
          productoNombre,
          expectedDelta,
          actualDelta,
          diff,
          movimientoId: d.id,
        });

        result.updated += 1;
        if (!dryRun) batch.update(d.ref, { observaciones: newObs });
      }

      if (!dryRun && result.updated > 0) await batch.commit();
      return NextResponse.json(result, { status: 200 });
    }

    let ventas = [];
    if (ventaIdFilter) {
      const snap = await db.collection("ventas").doc(ventaIdFilter).get();
      if (!snap.exists) {
        return NextResponse.json({ ok: false, error: "Venta no encontrada" }, { status: 404 });
      }
      const v = { id: snap.id, ...(snap.data() || {}) };
      const fecha = v?.fechaCreacion || v?.fecha || "";
      const ms = toMs(fecha);
      ventas = [{ ...v, __ms: ms }];
    } else {
      const ventasSnap = await db.collection("ventas").get();
      const ventasAll = ventasSnap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
      ventas = ventasAll
        .map((v) => {
          const fecha = v?.fechaCreacion || v?.fecha || "";
          const ms = toMs(fecha);
          return { ...v, __ms: ms };
        })
        .filter((v) => Number.isFinite(v.__ms) && v.__ms >= sinceMs)
        .sort((a, b) => a.__ms - b.__ms)
        .slice(0, limit);
    }

    const resumen = {
      ok: true,
      dryRun,
      sinceMs,
      ventaId: ventaIdFilter || null,
      productoId: productoIdFilter || null,
      authMode: actor.authMode,
      ventasEvaluadas: ventas.length,
      ventasConInconsistencias: 0,
      movimientosCreados: 0,
      ventas: [],
      skipped: [],
      warnings: [],
    };

    for (const venta of ventas) {
      const ventaId = String(venta.id || "");
      let expectedByProducto = computeExpectedByProducto(venta);
      if (productoIdFilter) {
        const expectedDelta = expectedByProducto.get(productoIdFilter);
        expectedByProducto = expectedDelta === undefined ? new Map() : new Map([[productoIdFilter, expectedDelta]]);
      }
      if (expectedByProducto.size === 0) continue;

      const movSnap = await db.collection("movimientos").where("referenciaId", "==", ventaId).get();
      const movimientos = movSnap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
      const actualByProducto = computeActualByProductoFromMovimientos(movimientos);

      const inconsistencias = [];
      for (const [productoId, expectedDelta] of expectedByProducto.entries()) {
        const actualDelta = actualByProducto.get(productoId) || 0;
        const diff = Number(expectedDelta) - Number(actualDelta);
        if (diff !== 0) {
          inconsistencias.push({
            productoId,
            expectedDelta,
            actualDelta,
            diff,
          });
        }
      }

      if (inconsistencias.length === 0) continue;
      resumen.ventasConInconsistencias += 1;

      const ventaResumen = {
        ventaId,
        numeroPedido: String(venta?.numeroPedido || venta?.numero || ""),
        fechaCreacion: String(venta?.fechaCreacion || venta?.fecha || ""),
        inconsistencias,
        fixes: [],
        errores: [],
      };

      for (const inc of inconsistencias) {
        const productoId = String(inc.productoId || "");
        const expectedDelta = Number(inc.expectedDelta) || 0;
        const actualDelta = Number(inc.actualDelta) || 0;
        const diff = Number(inc.diff) || 0;
        if (!productoId || diff === 0) continue;

        if (dryRun) {
          ventaResumen.fixes.push({
            productoId,
            stockDelta: diff,
            tipo: diff < 0 ? "salida" : "entrada",
            movimientoId: buildReconMovimientoId({ ventaId, productoId, expectedDelta }),
            wouldApply: true,
          });
          continue;
        }

        try {
          const productoRef = db.collection("productos").doc(productoId);
          const movimientoId = buildReconMovimientoId({ ventaId, productoId, expectedDelta });
          const movRef = db.collection("movimientos").doc(movimientoId);

          await db.runTransaction(async (t) => {
            const [prodSnap, movExistsSnap] = await Promise.all([t.get(productoRef), t.get(movRef)]);
            if (!prodSnap.exists) {
              const e = new Error(`Producto ${productoId} no encontrado`);
              e.code = "PRODUCTO_NO_ENCONTRADO";
              throw e;
            }
            if (movExistsSnap.exists) return;

            const data = prodSnap.data() || {};
            const stockActual = Number(data.stock) || 0;
            const nuevoStock = stockActual + diff;
            if (nuevoStock < 0) {
              const e = new Error(`Stock insuficiente para aplicar reconciliación (producto ${productoId})`);
              e.code = "STOCK_INSUFICIENTE";
              e.details = { stockActual, diff, nuevoStock };
              throw e;
            }

            const nowTs = FieldValue.serverTimestamp();
            t.set(movRef, {
              productoId,
              tipo: diff < 0 ? "salida" : "entrada",
              cantidad: Math.abs(diff),
              usuario: actor.email || "Sistema",
              usuarioUid: actor.uid || "",
              usuarioEmail: actor.email || "",
              fecha: nowTs,
              referencia: "reconciliacion_venta",
              referenciaId: ventaId,
              observaciones: buildReconObservaciones({
                ventaId,
                ventaNumeroPedido: String(venta?.numeroPedido || venta?.numero || ""),
                productoId,
                productoNombre: String(data.nombre || ""),
                expectedDelta,
                actualDelta,
                diff,
                movimientoId,
              }),
              productoNombre: String(data.nombre || ""),
              stockAntes: stockActual,
              stockDelta: diff,
              stockDespues: nuevoStock,
              categoria: String(data.categoria || "Sin categoría"),
              origen: "cron_reconciliacion",
              expectedDelta,
              actualDeltaAntes: actualDelta,
              ventaNumeroPedido: String(venta?.numeroPedido || venta?.numero || ""),
            });

            t.update(productoRef, { stock: nuevoStock, fechaActualizacion: nowTs });
          });

          resumen.movimientosCreados += 1;
          ventaResumen.fixes.push({
            productoId,
            stockDelta: diff,
            tipo: diff < 0 ? "salida" : "entrada",
            movimientoId,
            applied: true,
          });
        } catch (e) {
          const msg = typeof e?.message === "string" ? e.message : "Error";
          ventaResumen.errores.push({
            productoId,
            error: msg,
            code: e?.code || "",
            details: e?.details || null,
          });
          resumen.skipped.push({
            ventaId,
            productoId,
            reason: msg,
            code: e?.code || "",
          });
        }
      }

      resumen.ventas.push(ventaResumen);
    }

    return NextResponse.json(resumen, { status: 200 });
  } catch (e) {
    const msg = typeof e?.message === "string" ? e.message : "Error interno";
    return NextResponse.json({ ok: false, error: msg }, { status: e?.status || 500 });
  }
}
