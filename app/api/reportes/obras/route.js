export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { Resend } from "resend";
import { getAdminDb, verifyFirebaseToken } from "@/lib/firebase-admin";
import { getObraReferenceDate } from "@/lib/obras-fechas";
import { calcVentaAbonado, deriveVentaEstadoPago, toPaymentDateKey } from "@/lib/ventas-pagos";
import { generatePdfFromHtml } from "@/src/lib/pdf/generate-documento-firmado";

const RATE = 2.5;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const money = (value) => new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(Number(value) || 0);
const escape = (value) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
const dateOf = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? new Date(`${value}T12:00:00-03:00`) : new Date(value);
const dateLabel = (value) => { const date = dateOf(value); return Number.isNaN(date.getTime()) ? "-" : new Intl.DateTimeFormat("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Argentina/Buenos_Aires" }).format(date); };
const inRange = (value, start, end) => { const date = dateOf(value); return !Number.isNaN(date.getTime()) && date >= start && date < end; };
const parseMonth = (value) => { const match = String(value || "").match(/^(\d{4})-(\d{2})$/); return match && Number(match[2]) >= 1 && Number(match[2]) <= 12 ? { year: Number(match[1]), month: Number(match[2]), key: `${match[1]}-${match[2]}` } : null; };
const range = ({ year, month }) => ({ start: new Date(`${year}-${String(month).padStart(2, "0")}-01T00:00:00-03:00`), end: new Date(`${month === 12 ? year + 1 : year}-${String(month === 12 ? 1 : month + 1).padStart(2, "0")}-01T00:00:00-03:00`) });
const monthLabel = (key) => { const text = new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric", timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(`${key}-01T12:00:00-03:00`)); return text[0].toUpperCase() + text.slice(1); };
const obraTotal = (obra) => Number(obra?.total) || Number(obra?.subtotal) || (Number(obra?.productosTotal) || 0) + (Number(obra?.materialesTotal) || 0) + (Number(obra?.gastoObraManual) || 0) + (Number(obra?.costoEnvio) || 0) - (Number(obra?.descuentoTotal) || 0);
const paidObra = (obra) => { const c = obra?.cobranzas || {}; const totalPaid = (Number(c.senia) || 0) + (Number(c.monto) || 0) + (Array.isArray(c.historialPagos) ? c.historialPagos.reduce((sum, pago) => sum + (Number(pago?.monto) || 0), 0) : 0); return obraTotal(obra) > 0 && totalPaid >= obraTotal(obra); };
const lastPayment = (item) => { const payments = Array.isArray(item?.pagos) ? item.pagos : Array.isArray(item?.cobranzas?.historialPagos) ? item.cobranzas.historialPagos : []; return payments.map((pago) => toPaymentDateKey(pago?.fecha)).filter(Boolean).sort().at(-1) || ""; };
const isCompletedOrPaid = (obra) => String(obra?.estado || "").toLowerCase() === "completada" || paidObra(obra);
const row = (item, kind) => ({
  numero: item?.numero || item?.numeroPedido || String(item?.id || "").slice(-8),
  fechaCreacion: kind === "obra" ? item?.fechaCreacion || getObraReferenceDate(item) : item?.fechaCreacion || item?.fecha || "",
  fechaCierre: kind === "obra" ? lastPayment(item) || item?.fechaCompletada || item?.fechaFinalizacion || item?.fechaModificacion || "" : item?.fechaPagoConfirmado || lastPayment(item) || "",
  cliente: String(item?.cliente?.nombre || item?.clienteNombre || "Sin cliente").toUpperCase(),
  estado: kind === "obra"
    ? String(item?.estado || "pendiente").replaceAll("_", " ")
    : deriveVentaEstadoPago({ total: item?.total, abonado: calcVentaAbonado(item) }),
  total: kind === "obra" ? obraTotal(item) : Number(item?.total) || 0,
});
const makeRows = (items, kind) => items.map((item) => row(item, kind)).sort((a, b) => dateOf(a.fechaCreacion).getTime() - dateOf(b.fechaCreacion).getTime());
const total = (rows) => rows.reduce((sum, item) => sum + item.total, 0);
const table = (rows, empty) => rows.length ? `${rows.map((item, index) => `<tr><td>${index + 1}</td><td>${escape(item.numero)}</td><td>${escape(dateLabel(item.fechaCreacion))}</td><td>${escape(dateLabel(item.fechaCierre))}</td><td class="client">${escape(item.cliente)}</td><td>${escape(item.estado)}</td><td class="amount">${escape(money(item.total))}</td></tr>`).join("")}<tr class="total"><td colspan="6">Total</td><td class="amount">${escape(money(total(rows)))}</td></tr>` : `<tr><td colspan="7" class="empty">${escape(empty)}</td></tr>`;
const section = (title, rows, empty) => `<section><h2>${escape(title)}</h2><table><thead><tr><th>#</th><th>Comprobante</th><th>Creación</th><th>Cierre / último pago</th><th>Cliente</th><th>Estado</th><th>Importe</th></tr></thead><tbody>${table(rows, empty)}</tbody></table></section>`;
const pdf = ({ key, selected, obras, ventas }) => { const cards = []; if (selected.includes("obras")) cards.push(["Obras confirmadas", money(total(obras.confirmed))], ["Comisión obras 2,5%", money(total(obras.commissionable) * RATE / 100)]); if (selected.includes("ventas")) cards.push(["Ventas pagadasr", money(total(ventas.paid))], ["Comisión ventas 2,5%", money(total(ventas.paid) * RATE / 100)]); return `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>@page{size:A4;margin:12mm}*{box-sizing:border-box}body{font:11px Arial;color:#172033}.head{padding:17px 18px;border-radius:16px;background:#12233c;color:#fff}.over{font-size:9px;letter-spacing:1px;color:#bcd2ef;text-transform:uppercase}h1{margin:4px 0 0;font-size:20px}.cards{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:14px 0}.card{border:1px solid #dce5ef;border-radius:12px;padding:12px}.label{font-size:9px;color:#64748b;text-transform:uppercase;font-weight:bold}.value{font-size:20px;font-weight:bold;margin-top:7px}section{margin-top:19px;page-break-inside:avoid}h2{font-size:14px}table{width:100%;border-collapse:separate;border-spacing:0;border:1px solid #dde5ee;border-radius:10px;overflow:hidden}th{padding:9px 8px;background:#eaf0f7;text-align:left;font-size:9px;text-transform:uppercase}td{padding:9px 8px;border-top:1px solid #edf1f5}.amount{text-align:right;font-weight:bold}.client{text-transform:uppercase}.total td{background:#eaf0f7!important;font-weight:bold;text-transform:uppercase}.empty{text-align:center;color:#64748b}</style></head><body><header class="head"><div class="over">Maderas Caballero</div><h1>Reporte mensual - ${escape(monthLabel(key))}</h1></header><div class="cards">${cards.map(([label, value]) => `<div class="card"><div class="label">${escape(label)}</div><div class="value">${escape(value)}</div></div>`).join("")}</div>${selected.includes("obras") ? `${section("Obras confirmadas", obras.confirmed, "No hay obras confirmadas en este mes.")}${section("Obras pendientes de cobrar", obras.pending, "No hay obras pendientes de cobrar en este mes.")}` : ""}${selected.includes("ventas") ? `${section("Ventas pagadas", ventas.paid, "No hay ventas con pago finalizado en este mes.")}${section("Ventas pendientes", ventas.pending, "No hay ventas pendientes en este mes.")}${section("Ventas parciales", ventas.partial, "No hay ventas parciales en este mes.")}` : ""}</body></html>`; };

export async function POST(request) {
  try {
    const decoded = await verifyFirebaseToken(String(request.headers.get("authorization") || ""));
    if (!decoded?.email) return NextResponse.json({ ok: false, error: "Iniciá sesión para enviar reportes." }, { status: 403 });
    const body = await request.json().catch(() => ({}));
    const month = parseMonth(body?.month); const recipient = String(body?.email || "").trim().toLowerCase(); const selected = Array.isArray(body?.exports) ? body.exports.filter((item) => item === "obras" || item === "ventas") : [];
    if (!month || !emailPattern.test(recipient) || !selected.length) return NextResponse.json({ ok: false, error: "Completá el mes, el email y al menos una opción de exportación." }, { status: 400 });
    const { start, end } = range(month); const db = getAdminDb();
    const [obrasSnap, ventasSnap] = await Promise.all([selected.includes("obras") ? db.collection("obras").get() : Promise.resolve(null), selected.includes("ventas") ? db.collection("ventas").get() : Promise.resolve(null)]);
    const obrasAll = obrasSnap ? obrasSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) })).filter((obra) => String(obra?.tipo || "").toLowerCase() === "obra") : [];
    const obrasConfirmadas = obrasAll.filter((obra) => {
      const enEjecucion = String(obra?.estado || "").toLowerCase() === "en_ejecucion" && inRange(getObraReferenceDate(obra), start, end);
      const finalizadaOPagada = isCompletedOrPaid(obra) && inRange(lastPayment(obra) || obra?.fechaCompletada || obra?.fechaFinalizacion || obra?.fechaModificacion, start, end);
      return enEjecucion || finalizadaOPagada;
    });
    const obras = { confirmed: makeRows(obrasConfirmadas, "obra"), commissionable: makeRows(obrasConfirmadas, "obra"), pending: makeRows(obrasAll.filter((obra) => inRange(getObraReferenceDate(obra), start, end) && !obrasConfirmadas.some((confirmada) => confirmada.id === obra.id)), "obra") };
    const ventasAll = ventasSnap ? ventasSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) })).filter((venta) => !venta?.anulada && String(venta?.estado || "").toLowerCase() !== "anulada") : [];
    const ventasPeriodo = ventasAll.filter((venta) => inRange(venta?.fechaCreacion || venta?.fecha, start, end));
    const ventas = {
      paid: makeRows(ventasAll.filter((venta) => deriveVentaEstadoPago({ total: venta?.total, abonado: calcVentaAbonado(venta) }) === "pagado" && inRange(venta?.fechaPagoConfirmado || lastPayment(venta), start, end)), "venta"),
      pending: makeRows(ventasPeriodo.filter((venta) => deriveVentaEstadoPago({ total: venta?.total, abonado: calcVentaAbonado(venta) }) === "pendiente"), "venta"),
      partial: makeRows(ventasPeriodo.filter((venta) => deriveVentaEstadoPago({ total: venta?.total, abonado: calcVentaAbonado(venta) }) === "parcial"), "venta"),
    };
    const key = month.key; const commission = (total(obras.commissionable) + total(ventas.paid)) * RATE / 100; const apiKey = String(process.env.RESEND_API_KEY || "").trim(); const from = String(process.env.RESEND_FROM || "").trim();
    if (!apiKey || !from) return NextResponse.json({ ok: false, error: "Falta la configuración de envío de correo." }, { status: 500 });
    const attachment = await generatePdfFromHtml(pdf({ key, selected, obras, ventas }));
    const result = await new Resend(apiKey).emails.send({ from, to: [recipient], subject: `Reporte mensual ${monthLabel(key)} - Maderas Caballero`, text: `Reporte mensual ${monthLabel(key)}. Comisiones 2,5%: ${money(commission)}.`, html: `<p>Adjuntamos el reporte mensual solicitado.</p>`, attachments: [{ filename: `reporte-${key}.pdf`, content: attachment.toString("base64"), contentType: "application/pdf" }] });
    if (result.error) throw new Error(result.error.message || "No se pudo enviar el email.");
    return NextResponse.json({ ok: true, recipient, month: key, commission, resendId: result.data?.id || null });
  } catch (error) { return NextResponse.json({ ok: false, error: error?.message || "No se pudo generar el reporte." }, { status: 500 }); }
}
