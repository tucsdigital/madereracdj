import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";

const stripUndefined = (value) =>
  JSON.parse(JSON.stringify(value, (_k, v) => (v === undefined ? undefined : v)));

const toNumber = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const calcularEstadoPago = (montoPagado, montoTotal) => {
  const pagado = toNumber(montoPagado);
  const total = toNumber(montoTotal);
  if (pagado >= total) return "pagado";
  if (pagado > 0) return "parcial";
  return "pendiente";
};

const toDateKey = (value) => {
  if (!value) return "";
  const raw = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().split("T")[0];
};

export async function registrarPagoGlobalProveedorEngine({
  actor,
  proveedorId,
  monto,
  fecha,
  metodo,
  notas,
  pagoEnDolares,
  valorOficialDolar,
  comprobantes,
  origen = "ui_gastos",
}) {
  const db = getAdminDb();
  const provId = String(proveedorId || "").trim();
  if (!provId) throw new Error("proveedorId requerido");
  const montoIngresado = toNumber(monto);
  if (montoIngresado <= 0) throw new Error("monto inválido");

  const fechaPago = toDateKey(fecha) || new Date().toISOString().split("T")[0];
  const metodoPago = String(metodo || "Efectivo");
  const notasPago = String(notas || "");
  const isUsd = Boolean(pagoEnDolares);
  const usdRate = isUsd ? (valorOficialDolar ?? null) : null;
  const comprobantesArr = Array.isArray(comprobantes) ? comprobantes : [];

  const proveedorRef = db.collection("proveedores").doc(provId);
  const pagosProveedoresCol = db.collection("pagosProveedores");

  const res = await db.runTransaction(async (t) => {
    const proveedorSnap = await t.get(proveedorRef);
    if (!proveedorSnap.exists) {
      const err = new Error("Proveedor no encontrado");
      err.status = 404;
      throw err;
    }
    const proveedor = proveedorSnap.data() || {};
    const saldoAntes = toNumber(proveedor.saldoAFavor);

    const q = db
      .collection("gastos")
      .where("tipo", "==", "proveedor")
      .where("proveedorId", "==", provId);

    const cuentasSnap = await t.get(q);
    if (cuentasSnap.size > 450) {
      const err = new Error("Demasiadas cuentas para aplicar en una sola operación (limite 450).");
      err.status = 400;
      throw err;
    }

    const cuentas = cuentasSnap.docs
      .map((d) => ({ id: d.id, ref: d.ref, data: d.data() || {} }))
      .sort((a, b) => {
        const fa = toDateKey(a.data.fecha) || "";
        const fb = toDateKey(b.data.fecha) || "";
        return fa.localeCompare(fb);
      });

    let restante = saldoAntes + montoIngresado;
    let aplicadoACuentas = 0;
    const cuentasAplicadas = [];

    for (const c of cuentas) {
      const montoTotal = toNumber(c.data.monto);
      const montoPagadoActual = toNumber(c.data.montoPagado);
      const pendiente = Math.max(montoTotal - montoPagadoActual, 0);
      if (pendiente <= 0 || restante <= 0) continue;
      const montoAplicado = Math.min(restante, pendiente);
      if (montoAplicado <= 0) continue;

      const nuevoMontoPagado = montoPagadoActual + montoAplicado;
      const nuevoPago = stripUndefined({
        monto: montoAplicado,
        fecha: fechaPago,
        metodo: metodoPago,
        notas: notasPago,
        responsable: actor?.email || "Usuario no identificado",
        fechaRegistro: new Date().toISOString(),
        pagoEnDolares: isUsd,
        valorOficialDolar: usdRate,
        comprobantes: comprobantesArr,
        pagoGlobalProveedor: true,
      });

      t.update(c.ref, {
        montoPagado: nuevoMontoPagado,
        estadoPago: calcularEstadoPago(nuevoMontoPagado, montoTotal),
        pagos: FieldValue.arrayUnion(nuevoPago),
        fechaActualizacion: FieldValue.serverTimestamp(),
      });

      aplicadoACuentas += montoAplicado;
      restante -= montoAplicado;
      cuentasAplicadas.push({ cuentaId: c.id, montoAplicado });
    }

    const saldoDespues = Number(restante.toFixed(2));
    const deltaSaldo = Number((saldoDespues - saldoAntes).toFixed(2));

    t.update(proveedorRef, {
      saldoAFavor: saldoDespues,
      fechaActualizacion: FieldValue.serverTimestamp(),
    });

    const pagoGlobalRef = pagosProveedoresCol.doc();
    t.set(pagoGlobalRef, stripUndefined({
      tipo: "pagoGlobal",
      proveedorId: provId,
      proveedor: {
        id: provId,
        nombre: proveedor.nombre || "Proveedor",
        cuit: proveedor.cuit || "",
        telefono: proveedor.telefono || "",
      },
      monto: montoIngresado,
      montoDeltaSaldoAFavor: deltaSaldo,
      fecha: fechaPago,
      metodo: metodoPago,
      notas: notasPago,
      responsable: actor?.email || "Usuario no identificado",
      fechaRegistro: new Date().toISOString(),
      pagoEnDolares: isUsd,
      valorOficialDolar: usdRate,
      comprobantes: comprobantesArr,
      pagoGlobalProveedor: true,
      pagoIngresado: montoIngresado,
      aplicadoACuentas: Number(aplicadoACuentas.toFixed(2)),
      saldoAFavorAntes: Number(saldoAntes.toFixed(2)),
      saldoAFavorDespues: saldoDespues,
      cuentasAplicadas,
      fechaCreacion: FieldValue.serverTimestamp(),
      fechaActualizacion: FieldValue.serverTimestamp(),
      origen,
      actorUid: actor?.uid || "",
      actorEmail: actor?.email || "",
    }));

    const auditRef = db.collection("auditoria").doc();
    t.set(auditRef, stripUndefined({
      accion: "PAGO_GLOBAL_PROVEEDOR",
      coleccion: "pagosProveedores",
      documentoId: pagoGlobalRef.id,
      proveedorId: provId,
      usuarioId: actor?.uid || "",
      usuarioEmail: actor?.email || "",
      fecha: FieldValue.serverTimestamp(),
      origen,
      monto: montoIngresado,
      aplicadoACuentas: Number(aplicadoACuentas.toFixed(2)),
      saldoAFavorAntes: Number(saldoAntes.toFixed(2)),
      saldoAFavorDespues: saldoDespues,
    }));

    return {
      ok: true,
      pagoId: pagoGlobalRef.id,
      proveedorId: provId,
      montoIngresado,
      aplicadoACuentas: Number(aplicadoACuentas.toFixed(2)),
      saldoAFavorAntes: Number(saldoAntes.toFixed(2)),
      saldoAFavorDespues: saldoDespues,
    };
  });

  return res;
}

export async function quitarSaldoAFavorProveedorEngine({
  actor,
  proveedorId,
  monto,
  fecha,
  metodo,
  notas,
  origen = "ui_gastos",
}) {
  const db = getAdminDb();
  const provId = String(proveedorId || "").trim();
  if (!provId) throw new Error("proveedorId requerido");

  const montoQuitar = toNumber(monto);
  if (montoQuitar <= 0) throw new Error("monto inválido");

  const fechaMov = toDateKey(fecha) || new Date().toISOString().split("T")[0];
  const metodoMov = String(metodo || "Ajuste");
  const notasMov = String(notas || "");

  const proveedorRef = db.collection("proveedores").doc(provId);
  const pagosProveedoresCol = db.collection("pagosProveedores");

  const res = await db.runTransaction(async (t) => {
    const proveedorSnap = await t.get(proveedorRef);
    if (!proveedorSnap.exists) {
      const err = new Error("Proveedor no encontrado");
      err.status = 404;
      throw err;
    }
    const proveedor = proveedorSnap.data() || {};
    const saldoAntes = toNumber(proveedor.saldoAFavor);
    if (saldoAntes <= 0) {
      const err = new Error("El proveedor no tiene saldo a favor para quitar");
      err.status = 400;
      throw err;
    }

    const saldoDespues = Math.max(saldoAntes - montoQuitar, 0);
    const deltaSaldo = Number((saldoDespues - saldoAntes).toFixed(2)); // negativo o 0
    if (deltaSaldo === 0) {
      return {
        ok: true,
        proveedorId: provId,
        saldoAFavorAntes: Number(saldoAntes.toFixed(2)),
        saldoAFavorDespues: Number(saldoAntes.toFixed(2)),
        montoQuitado: 0,
      };
    }

    t.update(proveedorRef, {
      saldoAFavor: saldoDespues,
      fechaActualizacion: FieldValue.serverTimestamp(),
    });

    const saldoRef = pagosProveedoresCol.doc();
    t.set(
      saldoRef,
      stripUndefined({
        tipo: "saldoAFavor",
        direccion: "ajuste_manual",
        proveedorId: provId,
        proveedor: {
          id: provId,
          nombre: proveedor.nombre || "Proveedor",
          cuit: proveedor.cuit || "",
          telefono: proveedor.telefono || "",
        },
        monto: deltaSaldo,
        montoDelta: deltaSaldo,
        fecha: fechaMov,
        metodo: metodoMov,
        notas: notasMov,
        responsable: actor?.email || "Usuario no identificado",
        fechaRegistro: new Date().toISOString(),
        pagoGlobalProveedor: false,
        pagoIngresado: 0,
        aplicadoACuentas: 0,
        saldoAFavorAntes: Number(saldoAntes.toFixed(2)),
        saldoAFavorDespues: saldoDespues,
        fechaCreacion: FieldValue.serverTimestamp(),
        fechaActualizacion: FieldValue.serverTimestamp(),
        origen,
        actorUid: actor?.uid || "",
        actorEmail: actor?.email || "",
      })
    );

    const auditRef = db.collection("auditoria").doc();
    t.set(
      auditRef,
      stripUndefined({
        accion: "AJUSTE_SALDO_A_FAVOR_PROVEEDOR",
        coleccion: "pagosProveedores",
        documentoId: saldoRef.id,
        proveedorId: provId,
        usuarioId: actor?.uid || "",
        usuarioEmail: actor?.email || "",
        fecha: FieldValue.serverTimestamp(),
        origen,
        saldoAFavorAntes: Number(saldoAntes.toFixed(2)),
        saldoAFavorDespues: saldoDespues,
        montoQuitado: Number((-deltaSaldo).toFixed(2)),
      })
    );

    return {
      ok: true,
      proveedorId: provId,
      saldoAFavorAntes: Number(saldoAntes.toFixed(2)),
      saldoAFavorDespues: Number(saldoDespues.toFixed(2)),
      montoQuitado: Number((-deltaSaldo).toFixed(2)),
    };
  });

  return res;
}

export async function anularPagoProveedorEngine({
  actor,
  pagoId,
  motivo,
  origen = "ui_gastos",
}) {
  const db = getAdminDb();
  const id = String(pagoId || "").trim();
  if (!id) throw new Error("pagoId requerido");

  const pagoRef = db.collection("pagosProveedores").doc(id);

  const res = await db.runTransaction(async (t) => {
    const pagoSnap = await t.get(pagoRef);
    if (!pagoSnap.exists) {
      const err = new Error("Pago no encontrado");
      err.status = 404;
      throw err;
    }
    const pago = pagoSnap.data() || {};
    if (pago?.anulado === true) {
      return { ok: true, pagoId: id, already: true };
    }

    const tipo = String(pago?.tipo || "").trim();
    const provId = String(pago?.proveedorId || "").trim();
    if (!provId) throw new Error("proveedorId inválido en el pago");

    const proveedorRef = db.collection("proveedores").doc(provId);
    const proveedorSnap = await t.get(proveedorRef);
    if (!proveedorSnap.exists) {
      const err = new Error("Proveedor no encontrado");
      err.status = 404;
      throw err;
    }
    const proveedor = proveedorSnap.data() || {};
    const saldoAntes = toNumber(proveedor.saldoAFavor);

    const fechaBase = toDateKey(pago?.fecha) || new Date().toISOString().split("T")[0];
    const motivoTxt = String(motivo || "").trim();
    const notasAnulacion = `Anulación${motivoTxt ? `: ${motivoTxt}` : ""}`;

    if (tipo === "pagoGlobal") {
      const cuentasAplicadas = Array.isArray(pago?.cuentasAplicadas) ? pago.cuentasAplicadas : [];
      if (cuentasAplicadas.length > 450) {
        const err = new Error("Demasiadas cuentas para anular en una sola operación (limite 450).");
        err.status = 400;
        throw err;
      }

      for (const c of cuentasAplicadas) {
        const cuentaId = String(c?.cuentaId || "").trim();
        const montoAplicado = toNumber(c?.montoAplicado);
        if (!cuentaId || montoAplicado <= 0) continue;

        const cuentaRef = db.collection("gastos").doc(cuentaId);
        const cuentaSnap = await t.get(cuentaRef);
        if (!cuentaSnap.exists) continue;
        const cuenta = cuentaSnap.data() || {};

        const montoTotal = toNumber(cuenta?.monto);
        const montoPagadoActual = toNumber(cuenta?.montoPagado);
        const nuevoMontoPagado = Math.max(montoPagadoActual - montoAplicado, 0);
        const nuevoEstado = calcularEstadoPago(nuevoMontoPagado, montoTotal);

        const pagoReversion = stripUndefined({
          monto: Number((-montoAplicado).toFixed(2)),
          fecha: fechaBase,
          metodo: "Anulación",
          notas: notasAnulacion,
          responsable: actor?.email || "Usuario no identificado",
          fechaRegistro: new Date().toISOString(),
          pagoEnDolares: false,
          valorOficialDolar: null,
          comprobantes: [],
          pagoGlobalProveedor: true,
          pagoGlobalReversion: true,
          pagoGlobalId: id,
        });

        t.update(cuentaRef, {
          montoPagado: Number(nuevoMontoPagado.toFixed(2)),
          estadoPago: nuevoEstado,
          pagos: FieldValue.arrayUnion(pagoReversion),
          fechaActualizacion: FieldValue.serverTimestamp(),
        });
      }

      const deltaSaldo = toNumber(pago?.montoDeltaSaldoAFavor);
      const saldoDespues = Math.max(saldoAntes - deltaSaldo, 0);
      t.update(proveedorRef, {
        saldoAFavor: Number(saldoDespues.toFixed(2)),
        fechaActualizacion: FieldValue.serverTimestamp(),
      });
    } else if (tipo === "saldoAFavor") {
      const deltaSaldo = toNumber(pago?.montoDelta ?? pago?.monto);
      const saldoDespues = Math.max(saldoAntes - deltaSaldo, 0);
      t.update(proveedorRef, {
        saldoAFavor: Number(saldoDespues.toFixed(2)),
        fechaActualizacion: FieldValue.serverTimestamp(),
      });
    } else {
      const err = new Error("Tipo de pago no anulable");
      err.status = 400;
      throw err;
    }

    t.update(pagoRef, stripUndefined({
      anulado: true,
      anuladoEn: FieldValue.serverTimestamp(),
      anuladoPorUid: actor?.uid || "",
      anuladoPorEmail: actor?.email || "",
      anulacionMotivo: motivoTxt,
      fechaActualizacion: FieldValue.serverTimestamp(),
      origenAnulacion: String(origen || "ui_gastos").trim() || "ui_gastos",
    }));

    const auditRef = db.collection("auditoria").doc();
    t.set(auditRef, stripUndefined({
      accion: "ANULACION_PAGO_PROVEEDOR",
      coleccion: "pagosProveedores",
      documentoId: id,
      proveedorId: provId,
      usuarioId: actor?.uid || "",
      usuarioEmail: actor?.email || "",
      fecha: FieldValue.serverTimestamp(),
      origen,
      tipo,
      motivo: motivoTxt,
    }));

    return { ok: true, pagoId: id, already: false };
  });

  return res;
}
