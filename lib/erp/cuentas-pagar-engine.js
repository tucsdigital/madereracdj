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

export async function registrarPagoCuentaProveedorEngine({
  actor,
  cuentaId,
  monto,
  fecha,
  metodo,
  notas,
  pagoEnDolares,
  valorOficialDolar,
  comprobantes,
  permitirExcedenteASaldoAFavor = false,
  origen = "ui_gastos",
}) {
  const db = getAdminDb();
  const id = String(cuentaId || "").trim();
  if (!id) throw new Error("cuentaId requerido");

  const montoIngresado = toNumber(monto);
  if (montoIngresado <= 0) {
    const err = new Error("monto inválido");
    err.status = 400;
    throw err;
  }

  const fechaPago = toDateKey(fecha) || new Date().toISOString().split("T")[0];
  const metodoPago = String(metodo || "Efectivo");
  const notasPago = String(notas || "");
  const isUsd = Boolean(pagoEnDolares);
  const usdRate = isUsd ? (valorOficialDolar ?? null) : null;
  const comprobantesArr = Array.isArray(comprobantes) ? comprobantes : [];

  const cuentaRef = db.collection("gastos").doc(id);

  const res = await db.runTransaction(async (t) => {
    const cuentaSnap = await t.get(cuentaRef);
    if (!cuentaSnap.exists) {
      const err = new Error("Cuenta no encontrada");
      err.status = 404;
      throw err;
    }
    const cuenta = cuentaSnap.data() || {};
    if (String(cuenta?.tipo || "") !== "proveedor") {
      const err = new Error("La cuenta no es de proveedor");
      err.status = 400;
      throw err;
    }
    if (cuenta?.anulada === true || String(cuenta?.estadoOperativo || "") === "anulada") {
      const err = new Error("No se puede registrar pagos sobre una cuenta anulada");
      err.status = 400;
      throw err;
    }

    const provId = String(cuenta?.proveedorId || "").trim();
    if (!provId) {
      const err = new Error("La cuenta no tiene proveedorId");
      err.status = 400;
      throw err;
    }

    const montoTotal = toNumber(cuenta?.monto);
    const montoPagadoActual = toNumber(cuenta?.montoPagado);
    const saldoPendiente = Math.max(montoTotal - montoPagadoActual, 0);
    if (saldoPendiente <= 0) {
      const err = new Error("La cuenta no tiene saldo pendiente");
      err.status = 400;
      throw err;
    }

    const aplicar = Math.min(montoIngresado, saldoPendiente);
    const excedente = Math.max(montoIngresado - aplicar, 0);
    if (excedente > 0 && !permitirExcedenteASaldoAFavor) {
      const err = new Error("El monto supera el saldo pendiente. Confirmá si querés enviar el excedente a saldo a favor.");
      err.status = 409;
      err.excedente = Number(excedente.toFixed(2));
      throw err;
    }

    const nowIso = new Date().toISOString();
    const nuevoPago = stripUndefined({
      monto: Number(aplicar.toFixed(2)),
      fecha: fechaPago,
      metodo: metodoPago,
      notas: notasPago,
      responsable: actor?.email || "Usuario no identificado",
      fechaRegistro: nowIso,
      pagoEnDolares: isUsd,
      valorOficialDolar: usdRate,
      comprobantes: comprobantesArr,
      pagoGlobalProveedor: false,
    });

    const nuevoMontoPagado = Number((montoPagadoActual + aplicar).toFixed(2));
    const nuevoEstado = calcularEstadoPago(nuevoMontoPagado, montoTotal);

    t.update(cuentaRef, {
      montoPagado: nuevoMontoPagado,
      estadoPago: nuevoEstado,
      pagos: FieldValue.arrayUnion(nuevoPago),
      fechaActualizacion: FieldValue.serverTimestamp(),
    });

    let movimientoId = "";
    if (excedente > 0) {
      const proveedorRef = db.collection("proveedores").doc(provId);
      const proveedorSnap = await t.get(proveedorRef);
      if (!proveedorSnap.exists) {
        const err = new Error("Proveedor no encontrado");
        err.status = 404;
        throw err;
      }
      const proveedor = proveedorSnap.data() || {};
      const saldoAntes = toNumber(proveedor.saldoAFavor);
      const saldoDespues = Number((saldoAntes + excedente).toFixed(2));
      const deltaSaldo = Number((saldoDespues - saldoAntes).toFixed(2));

      t.update(proveedorRef, {
        saldoAFavor: saldoDespues,
        fechaActualizacion: FieldValue.serverTimestamp(),
      });

      const movRef = db.collection("pagosProveedores").doc();
      movimientoId = movRef.id;
      t.set(
        movRef,
        stripUndefined({
          tipo: "saldoAFavor",
          direccion: "excedente_pago_manual",
          proveedorId: provId,
          proveedor: {
            id: provId,
            nombre: proveedor.nombre || "Proveedor",
            cuit: proveedor.cuit || "",
            telefono: proveedor.telefono || "",
          },
          monto: deltaSaldo,
          montoDelta: deltaSaldo,
          fecha: fechaPago,
          metodo: metodoPago,
          notas: notasPago,
          responsable: actor?.email || "Usuario no identificado",
          fechaRegistro: nowIso,
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
          cuentaOrigenId: id,
        })
      );

      const auditRef = db.collection("auditoria").doc();
      t.set(
        auditRef,
        stripUndefined({
          accion: "EXCEDENTE_PAGO_MANUAL_A_SALDO_A_FAVOR",
          coleccion: "pagosProveedores",
          documentoId: movRef.id,
          proveedorId: provId,
          cuentaId: id,
          usuarioId: actor?.uid || "",
          usuarioEmail: actor?.email || "",
          fecha: FieldValue.serverTimestamp(),
          origen,
          monto: Number(excedente.toFixed(2)),
          saldoAFavorAntes: Number(saldoAntes.toFixed(2)),
          saldoAFavorDespues: saldoDespues,
        })
      );
    }

    const auditRef = db.collection("auditoria").doc();
    t.set(
      auditRef,
      stripUndefined({
        accion: "PAGO_MANUAL_CUENTA_PROVEEDOR",
        coleccion: "gastos",
        documentoId: id,
        proveedorId: provId,
        usuarioId: actor?.uid || "",
        usuarioEmail: actor?.email || "",
        fecha: FieldValue.serverTimestamp(),
        origen,
        montoAplicado: Number(aplicar.toFixed(2)),
        excedente: Number(excedente.toFixed(2)),
        movimientoSaldoAFavorId: movimientoId || "",
      })
    );

    return {
      ok: true,
      cuentaId: id,
      proveedorId: provId,
      montoAplicado: Number(aplicar.toFixed(2)),
      excedente: Number(excedente.toFixed(2)),
      estadoPago: nuevoEstado,
      montoPagado: nuevoMontoPagado,
    };
  });

  return res;
}

export async function mutarPagoCuentaProveedorEngine({
  actor,
  cuentaId,
  idx,
  action,
  pago,
  origen = "ui_gastos",
}) {
  const db = getAdminDb();
  const id = String(cuentaId || "").trim();
  if (!id) throw new Error("cuentaId requerido");
  const index = Number(idx);
  if (!Number.isFinite(index) || index < 0) {
    const err = new Error("idx inválido");
    err.status = 400;
    throw err;
  }
  const act = String(action || "").trim().toLowerCase();
  if (act !== "edit" && act !== "delete") {
    const err = new Error("action inválida");
    err.status = 400;
    throw err;
  }

  const cuentaRef = db.collection("gastos").doc(id);
  const res = await db.runTransaction(async (t) => {
    const cuentaSnap = await t.get(cuentaRef);
    if (!cuentaSnap.exists) {
      const err = new Error("Cuenta no encontrada");
      err.status = 404;
      throw err;
    }
    const cuenta = cuentaSnap.data() || {};
    if (String(cuenta?.tipo || "") !== "proveedor") {
      const err = new Error("La cuenta no es de proveedor");
      err.status = 400;
      throw err;
    }
    if (cuenta?.anulada === true || String(cuenta?.estadoOperativo || "") === "anulada") {
      const err = new Error("No se puede modificar pagos en una cuenta anulada");
      err.status = 400;
      throw err;
    }

    const pagosArr = Array.isArray(cuenta?.pagos) ? [...cuenta.pagos] : [];
    const target = pagosArr[index];
    if (!target) {
      const err = new Error("Pago no encontrado");
      err.status = 404;
      throw err;
    }
    if (target?.pagoGlobalProveedor === true) {
      const err = new Error("No se puede modificar un pago proveniente de pago global");
      err.status = 400;
      throw err;
    }

    if (act === "delete") {
      pagosArr.splice(index, 1);
    } else {
      const n = toNumber(pago?.monto);
      if (n <= 0) {
        const err = new Error("monto inválido");
        err.status = 400;
        throw err;
      }
      const fechaPago = toDateKey(pago?.fecha) || toDateKey(target?.fecha) || new Date().toISOString().split("T")[0];
      const metodoPago = String(pago?.metodo || target?.metodo || "Efectivo");
      const notasPago = String(pago?.notas ?? target?.notas ?? "");
      const isUsd = Boolean(pago?.pagoEnDolares ?? target?.pagoEnDolares);
      const usdRate = isUsd ? (pago?.valorOficialDolar ?? target?.valorOficialDolar ?? null) : null;
      const comprobantesArr = Array.isArray(pago?.comprobantes) ? pago.comprobantes : Array.isArray(target?.comprobantes) ? target.comprobantes : [];

      pagosArr[index] = stripUndefined({
        ...target,
        monto: Number(n.toFixed(2)),
        fecha: fechaPago,
        metodo: metodoPago,
        notas: notasPago,
        responsable: String(pago?.responsable || target?.responsable || actor?.email || "Usuario no identificado"),
        pagoEnDolares: isUsd,
        valorOficialDolar: usdRate,
        comprobantes: comprobantesArr,
        fechaRegistro: target?.fechaRegistro || new Date().toISOString(),
        pagoGlobalProveedor: false,
      });
    }

    const montoTotal = toNumber(cuenta?.monto);
    const montoPagadoNuevo = pagosArr.reduce((s, p) => s + toNumber(p?.monto), 0);
    const nuevoEstado = calcularEstadoPago(montoPagadoNuevo, montoTotal);

    t.update(cuentaRef, {
      pagos: stripUndefined(pagosArr),
      montoPagado: Number(montoPagadoNuevo.toFixed(2)),
      estadoPago: nuevoEstado,
      fechaActualizacion: FieldValue.serverTimestamp(),
    });

    const auditRef = db.collection("auditoria").doc();
    t.set(
      auditRef,
      stripUndefined({
        accion: act === "delete" ? "ELIMINACION_PAGO_MANUAL_CUENTA_PROVEEDOR" : "EDICION_PAGO_MANUAL_CUENTA_PROVEEDOR",
        coleccion: "gastos",
        documentoId: id,
        proveedorId: String(cuenta?.proveedorId || ""),
        usuarioId: actor?.uid || "",
        usuarioEmail: actor?.email || "",
        fecha: FieldValue.serverTimestamp(),
        origen,
        pagoIndex: index,
      })
    );

    return { ok: true, cuentaId: id, montoPagado: Number(montoPagadoNuevo.toFixed(2)), estadoPago: nuevoEstado };
  });

  return res;
}

export async function anularCuentaProveedorEngine({
  actor,
  cuentaId,
  motivo,
  origen = "ui_gastos",
}) {
  const db = getAdminDb();
  const id = String(cuentaId || "").trim();
  if (!id) throw new Error("cuentaId requerido");

  const cuentaRef = db.collection("gastos").doc(id);
  const res = await db.runTransaction(async (t) => {
    const cuentaSnap = await t.get(cuentaRef);
    if (!cuentaSnap.exists) {
      const err = new Error("Cuenta no encontrada");
      err.status = 404;
      throw err;
    }
    const cuenta = cuentaSnap.data() || {};
    if (String(cuenta?.tipo || "") !== "proveedor") {
      const err = new Error("La cuenta no es de proveedor");
      err.status = 400;
      throw err;
    }
    if (cuenta?.anulada === true || String(cuenta?.estadoOperativo || "") === "anulada") {
      return { ok: true, cuentaId: id, already: true };
    }

    const provId = String(cuenta?.proveedorId || "").trim();
    const pagado = toNumber(cuenta?.montoPagado);
    const nowIso = new Date().toISOString();
    const motivoTxt = String(motivo || "").trim();

    t.update(
      cuentaRef,
      stripUndefined({
        anulada: true,
        estadoOperativo: "anulada",
        anulacionMotivo: motivoTxt,
        anuladaEn: FieldValue.serverTimestamp(),
        anuladaPorUid: actor?.uid || "",
        anuladaPorEmail: actor?.email || "",
        fechaActualizacion: FieldValue.serverTimestamp(),
      })
    );

    let movimientoId = "";
    if (provId && pagado > 0) {
      const proveedorRef = db.collection("proveedores").doc(provId);
      const proveedorSnap = await t.get(proveedorRef);
      if (proveedorSnap.exists) {
        const proveedor = proveedorSnap.data() || {};
        const saldoAntes = toNumber(proveedor.saldoAFavor);
        const saldoDespues = Number((saldoAntes + pagado).toFixed(2));
        const deltaSaldo = Number((saldoDespues - saldoAntes).toFixed(2));

        t.update(proveedorRef, {
          saldoAFavor: saldoDespues,
          fechaActualizacion: FieldValue.serverTimestamp(),
        });

        const movRef = db.collection("pagosProveedores").doc();
        movimientoId = movRef.id;
        t.set(
          movRef,
          stripUndefined({
            tipo: "saldoAFavor",
            direccion: "anulacion_cuenta",
            proveedorId: provId,
            proveedor: {
              id: provId,
              nombre: proveedor.nombre || "Proveedor",
              cuit: proveedor.cuit || "",
              telefono: proveedor.telefono || "",
            },
            monto: deltaSaldo,
            montoDelta: deltaSaldo,
            fecha: toDateKey(cuenta?.fecha) || new Date().toISOString().split("T")[0],
            metodo: "Anulación",
            notas: `Saldo a favor por anulación de cuenta${motivoTxt ? `: ${motivoTxt}` : ""}`,
            responsable: actor?.email || "Usuario no identificado",
            fechaRegistro: nowIso,
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
            cuentaOrigenId: id,
          })
        );
      }
    }

    const auditRef = db.collection("auditoria").doc();
    t.set(
      auditRef,
      stripUndefined({
        accion: "ANULACION_CUENTA_PROVEEDOR",
        coleccion: "gastos",
        documentoId: id,
        proveedorId: provId,
        usuarioId: actor?.uid || "",
        usuarioEmail: actor?.email || "",
        fecha: FieldValue.serverTimestamp(),
        origen,
        motivo: motivoTxt,
        montoPagado: Number(pagado.toFixed(2)),
        movimientoSaldoAFavorId: movimientoId || "",
      })
    );

    return { ok: true, cuentaId: id, already: false };
  });

  return res;
}

export async function aplicarSaldoAFavorProveedorEngine({
  actor,
  proveedorId,
  fecha,
  metodo,
  notas,
  origen = "ui_gastos",
}) {
  const db = getAdminDb();
  const provId = String(proveedorId || "").trim();
  if (!provId) throw new Error("proveedorId requerido");

  const fechaMov = toDateKey(fecha) || new Date().toISOString().split("T")[0];
  const metodoMov = String(metodo || "Ajuste");
  const notasMov = String(notas || "");

  const proveedorRef = db.collection("proveedores").doc(provId);
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
      const err = new Error("El proveedor no tiene saldo a favor para aplicar");
      err.status = 400;
      throw err;
    }

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
      .filter((c) => c.data?.anulada !== true && String(c.data?.estadoOperativo || "") !== "anulada")
      .sort((a, b) => {
        const fa = toDateKey(a.data.fechaVencimiento) || toDateKey(a.data.fecha) || "";
        const fb = toDateKey(b.data.fechaVencimiento) || toDateKey(b.data.fecha) || "";
        return fa.localeCompare(fb);
      });

    let restante = saldoAntes;
    let aplicado = 0;
    const cuentasAplicadas = [];
    const nowIso = new Date().toISOString();

    for (const c of cuentas) {
      const montoTotal = toNumber(c.data.monto);
      const montoPagadoActual = toNumber(c.data.montoPagado);
      const pendiente = Math.max(montoTotal - montoPagadoActual, 0);
      if (pendiente <= 0 || restante <= 0) continue;
      const montoAplicado = Math.min(restante, pendiente);
      if (montoAplicado <= 0) continue;

      const nuevoMontoPagado = montoPagadoActual + montoAplicado;
      const nuevoEstado = calcularEstadoPago(nuevoMontoPagado, montoTotal);
      const pagoAplicado = stripUndefined({
        monto: Number(montoAplicado.toFixed(2)),
        fecha: fechaMov,
        metodo: metodoMov,
        notas: notasMov || "Aplicación de saldo a favor",
        responsable: actor?.email || "Usuario no identificado",
        fechaRegistro: nowIso,
        pagoEnDolares: false,
        valorOficialDolar: null,
        comprobantes: [],
        pagoGlobalProveedor: true,
        saldoAFavorAplicado: true,
      });

      t.update(c.ref, {
        montoPagado: Number(nuevoMontoPagado.toFixed(2)),
        estadoPago: nuevoEstado,
        pagos: FieldValue.arrayUnion(pagoAplicado),
        fechaActualizacion: FieldValue.serverTimestamp(),
      });

      aplicado += montoAplicado;
      restante -= montoAplicado;
      cuentasAplicadas.push({ cuentaId: c.id, montoAplicado: Number(montoAplicado.toFixed(2)) });
    }

    const saldoDespues = Number(Math.max(restante, 0).toFixed(2));
    const deltaSaldo = Number((saldoDespues - saldoAntes).toFixed(2)); // negativo o 0
    if (deltaSaldo !== 0) {
      t.update(proveedorRef, {
        saldoAFavor: saldoDespues,
        fechaActualizacion: FieldValue.serverTimestamp(),
      });
    }

    const movRef = db.collection("pagosProveedores").doc();
    t.set(
      movRef,
      stripUndefined({
        tipo: "saldoAFavor",
        direccion: "aplicacion_a_cuentas",
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
        fechaRegistro: nowIso,
        pagoGlobalProveedor: false,
        pagoIngresado: 0,
        aplicadoACuentas: Number(aplicado.toFixed(2)),
        cuentasAplicadas,
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
        accion: "APLICACION_SALDO_A_FAVOR_PROVEEDOR",
        coleccion: "pagosProveedores",
        documentoId: movRef.id,
        proveedorId: provId,
        usuarioId: actor?.uid || "",
        usuarioEmail: actor?.email || "",
        fecha: FieldValue.serverTimestamp(),
        origen,
        aplicadoACuentas: Number(aplicado.toFixed(2)),
        saldoAFavorAntes: Number(saldoAntes.toFixed(2)),
        saldoAFavorDespues: saldoDespues,
      })
    );

    return {
      ok: true,
      proveedorId: provId,
      aplicadoACuentas: Number(aplicado.toFixed(2)),
      saldoAFavorAntes: Number(saldoAntes.toFixed(2)),
      saldoAFavorDespues: saldoDespues,
      movimientoId: movRef.id,
    };
  });

  return res;
}
