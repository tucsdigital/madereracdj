import { NextResponse } from "next/server";
import { getAdminDb, verifyFirebaseToken } from "@/lib/firebase-admin";
import { nowIso } from "@/lib/documentacion-server";

const parseMonthKey = (value) => {
  const v = String(value || "").trim();
  const m = v.match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(y) || !Number.isFinite(mm) || mm < 1 || mm > 12) return null;
  return { year: y, month: mm, key: `${m[1]}-${m[2]}` };
};

const monthRange = ({ year, month }) => {
  const start = new Date(`${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-01T00:00:00-03:00`);
  const nextMonth = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
  const end = new Date(
    `${String(nextMonth.year).padStart(4, "0")}-${String(nextMonth.month).padStart(2, "0")}-01T00:00:00-03:00`
  );
  return { start, end, nextMonthKey: `${String(nextMonth.year).padStart(4, "0")}-${String(nextMonth.month).padStart(2, "0")}` };
};

const toMs = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return NaN;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return Date.parse(`${raw}T00:00:00-03:00`);
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : NaN;
};

const isInRange = (value, startMs, endMs) => {
  const ms = toMs(value);
  if (!Number.isFinite(ms)) return false;
  return ms >= startMs && ms < endMs;
};

const calcAbonado = (ventaLike) => {
  const pagosArr = Array.isArray(ventaLike?.pagos) ? ventaLike.pagos : [];
  if (pagosArr.length > 0) return pagosArr.reduce((acc, p) => acc + (Number(p?.monto) || 0), 0);
  return Number(ventaLike?.montoAbonado || 0);
};

const deriveEstadoPago = ({ estadoPago, total, abonado }) => {
  const e = String(estadoPago || "").toLowerCase();
  if (e === "pagado" || e === "parcial" || e === "pendiente") return e;
  const t = Number(total) || 0;
  const a = Number(abonado) || 0;
  if (t > 0 && a >= t) return "pagado";
  if (a > 0) return "parcial";
  return "pendiente";
};

const computeKpis = ({ ventas = [], obras = [], startMs, endMs }) => {
  const COMMISSION_RATE = 2.5;
  const OBRAS_COMMISSION_RATE = 2.5;

  const ventasCount = ventas.length;
  const ventasMonto = ventas.reduce((acc, v) => acc + (Number(v.total) || 0), 0);
  const ticketPromedio = ventasCount > 0 ? ventasMonto / ventasCount : 0;

  let cobranzasIngresado = 0;
  let cobranzasPendiente = 0;
  let cobranzasParcialPendiente = 0;
  let cobranzasAbonadoParcial = 0;
  let cobranzasPagadoTotal = 0;
  let cobranzasIngresadoPeriodo = 0;

  ventas.forEach((v) => {
    const total = Number(v.total) || 0;
    const pagosArr = Array.isArray(v.pagos) ? v.pagos : [];
    const abonado = pagosArr.length > 0 ? pagosArr.reduce((s, p) => s + (Number(p.monto) || 0), 0) : Number(v.montoAbonado || 0);
    pagosArr.forEach((p) => {
      const f = p?.fecha;
      if (f && isInRange(f, startMs, endMs)) cobranzasIngresadoPeriodo += Number(p?.monto) || 0;
    });
    cobranzasIngresado += abonado;
    const estado = deriveEstadoPago({ estadoPago: v.estadoPago, total, abonado });
    if (estado === "pagado") cobranzasPagadoTotal += total;
    else if (estado === "pendiente") cobranzasPendiente += total;
    else if (estado === "parcial") {
      const saldo = Math.max(total - abonado, 0);
      cobranzasParcialPendiente += saldo;
      cobranzasAbonadoParcial += abonado;
    }
  });

  const pendienteParcialTotal = cobranzasPendiente + cobranzasParcialPendiente;

  const obrasFiltradas = (obras || []).filter((o) => o.tipo === "obra");
  const obrasConfirmadas = obrasFiltradas.filter((o) => o.estado === "en_ejecucion" || o.estado === "completada");
  const obrasCount = obrasFiltradas.length;

  const calcObraTotal = (o) =>
    Number(o.total) ||
    Number(o.subtotal) ||
    (Number(o.productosTotal) || 0) +
      (Number(o.materialesTotal) || 0) +
      (Number(o.gastoObraManual) || 0) +
      (Number(o.costoEnvio) || 0) -
      (Number(o.descuentoTotal) || 0);

  const obrasMonto = obrasFiltradas.reduce((acc, o) => acc + (Number(calcObraTotal(o)) || 0), 0);
  const obrasMontoConfirmadas = obrasConfirmadas.reduce((acc, o) => acc + (Number(calcObraTotal(o)) || 0), 0);
  const obrasComision = obrasMontoConfirmadas * (OBRAS_COMMISSION_RATE / 100);

  const comisionVentasConfirmadas = cobranzasPagadoTotal * (COMMISSION_RATE / 100);
  const comisionVentasCobrosPeriodo = cobranzasIngresadoPeriodo * (COMMISSION_RATE / 100);

  const estados = ventas.reduce(
    (acc, v) => {
      const total = Number(v.total) || 0;
      const abonado = calcAbonado(v);
      const e = deriveEstadoPago({ estadoPago: v.estadoPago, total, abonado });
      if (e === "pagado") acc.pagado += 1;
      else if (e === "parcial") acc.parcial += 1;
      else acc.pendiente += 1;
      return acc;
    },
    { pagado: 0, parcial: 0, pendiente: 0 }
  );

  return {
    ventas: { count: ventasCount, monto: ventasMonto, ticketPromedio, estados },
    cobranzas: {
      ingresado: cobranzasIngresado,
      pagadoTotal: cobranzasPagadoTotal,
      pendienteTotal: cobranzasPendiente,
      parcialPendiente: cobranzasParcialPendiente,
      abonadoParcial: cobranzasAbonadoParcial,
      pendienteParcialTotal,
      ingresadoPeriodo: cobranzasIngresadoPeriodo,
    },
    obras: {
      count: obrasCount,
      countConfirmadas: obrasConfirmadas.length,
      monto: obrasMonto,
      montoConfirmadas: obrasMontoConfirmadas,
      comision: obrasComision,
    },
    comisiones: {
      rateVentas: COMMISSION_RATE,
      rateObras: OBRAS_COMMISSION_RATE,
      ventasConfirmadas: comisionVentasConfirmadas,
      ventasCobrosPeriodo: comisionVentasCobrosPeriodo,
      obrasConfirmadas: obrasComision,
    },
  };
};

const defaultMonthKey = () => {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const prev = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
  return { year: prev.year, month: prev.month, key: `${String(prev.year).padStart(4, "0")}-${String(prev.month).padStart(2, "0")}` };
};

export async function POST(request) {
  try {
    const secret = String(process.env.CRON_SECRET || "").trim();
    const auth = String(request.headers.get("authorization") || "");
    const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
    if (secret) {
      if (token !== secret) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    } else {
      const decoded = await verifyFirebaseToken(auth);
      if (decoded?.email !== "admin@admin.com") {
        return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
      }
    }

    const url = new URL(request.url);
    const monthKeyParam = url.searchParams.get("month");
    const parsed = monthKeyParam ? parseMonthKey(monthKeyParam) : defaultMonthKey();
    if (!parsed) {
      return NextResponse.json({ ok: false, error: "Parámetro month inválido (YYYY-MM)" }, { status: 400 });
    }

    const { start, end } = monthRange(parsed);
    const startMs = start.getTime();
    const endMs = end.getTime();

    const db = getAdminDb();
    const [ventasSnap, obrasSnap] = await Promise.all([db.collection("ventas").get(), db.collection("obras").get()]);
    const ventasAll = ventasSnap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
    const obrasAll = obrasSnap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));

    const ventasPeriodo = ventasAll.filter((v) => isInRange(v.fechaCreacion || v.fecha, startMs, endMs));
    const obrasPeriodo = obrasAll.filter((o) => isInRange(o.fechaCreacion, startMs, endMs));

    const pendientesParciales = ventasPeriodo
      .map((v) => {
        const total = Number(v.total) || 0;
        const abonado = calcAbonado(v);
        const estadoPago = deriveEstadoPago({ estadoPago: v.estadoPago, total, abonado });
        const saldo = Math.max(total - abonado, 0);
        return {
          id: String(v.id || ""),
          numeroPedido: String(v.numeroPedido || v.numero || ""),
          fechaCreacion: String(v.fechaCreacion || v.fecha || ""),
          clienteNombre: String(v.cliente?.nombre || ""),
          clienteId: String(v.clienteId || ""),
          estadoPago,
          total,
          abonado,
          saldo,
        };
      })
      .filter((v) => v.estadoPago === "pendiente" || v.estadoPago === "parcial")
      .sort((a, b) => toMs(a.fechaCreacion) - toMs(b.fechaCreacion));

    const kpis = computeKpis({ ventas: ventasPeriodo, obras: obrasPeriodo, startMs, endMs });
    const now = nowIso();

    const reportRef = db.collection("reportes_mensuales").doc(parsed.key);
    await reportRef.set(
      {
        month: parsed.key,
        period: {
          start: start.toISOString(),
          end: end.toISOString(),
        },
        generatedAt: now,
        kpis,
        ventasPendientesParciales: pendientesParciales,
        ventasPendientesParcialesCount: pendientesParciales.length,
        ventasPendientesCount: pendientesParciales.filter((v) => v.estadoPago === "pendiente").length,
        ventasParcialesCount: pendientesParciales.filter((v) => v.estadoPago === "parcial").length,
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true, month: parsed.key, reportId: parsed.key, pendingCount: pendientesParciales.length });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e?.message || "Error" }, { status: 500 });
  }
}
