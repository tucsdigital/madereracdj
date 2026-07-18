"use client";

export const DAY_KEYS = ["lun", "mar", "mie", "jue", "vie", "sab", "dom"];
export const LABOR_DAY_KEYS = DAY_KEYS.slice(0, 5);

export function toDateSafe(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, day] = value.split("-").map(Number);
    return new Date(y, m - 1, day);
  }
  if (value && typeof value === "object" && "seconds" in value) {
    return new Date(value.seconds * 1000);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function fmtDateOnly(dateInput) {
  const date = toDateSafe(dateInput);
  if (!date) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatMonthKey(dateInput) {
  const date = toDateSafe(dateInput);
  if (!date) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function formatMonthLabel(dateInput) {
  const date = toDateSafe(dateInput);
  if (!date) return "";
  return date.toLocaleDateString("es-AR", { month: "long", year: "numeric" });
}

export function formatCurrencyAR(value) {
  return `$${Number(value || 0).toLocaleString("es-AR")}`;
}

export function resolveEmployeeStartDate(empleado) {
  const candidates = [
    empleado?.fechaIngreso,
    empleado?.fechaIngresoLaboral,
    empleado?.fechaInicioLaboral,
    empleado?.fechaInicio,
    empleado?.fechaAlta,
    empleado?.ingreso,
  ];

  for (const candidate of candidates) {
    const parsed = toDateSafe(candidate);
    if (!parsed) continue;
    parsed.setHours(0, 0, 0, 0);
    return parsed;
  }

  return null;
}

export function isDateBeforeEmployeeStart(dateInput, empleado) {
  const current = toDateSafe(dateInput);
  const startDate = resolveEmployeeStartDate(empleado);
  if (!current || !startDate) return false;

  const normalizedCurrent = new Date(current);
  normalizedCurrent.setHours(0, 0, 0, 0);
  return normalizedCurrent.getTime() < startDate.getTime();
}

function roundMoney(value) {
  return Number(Number(value || 0).toFixed(2));
}

function getLateArrivalBreakdown(dayData) {
  const llegoTarde = Boolean(
    dayData?.llegoTarde ?? dayData?.llegadaTarde ?? dayData?.tarde ?? false,
  );
  const minutosTarde = Math.max(
    Number(dayData?.minutosTarde ?? dayData?.demoraMinutos ?? 0),
    0,
  );
  const notaTarde = String(dayData?.notaTarde ?? dayData?.demoraNota ?? "");

  return {
    llegoTarde,
    minutosTarde,
    notaTarde,
  };
}

export function calcularTotalLiquidacion({
  totSemana = 0,
  totExtras = 0,
  totAdv = 0,
  premio = 0,
}) {
  return Math.max(
    Number(totSemana || 0) + Number(totExtras || 0) + Number(premio || 0) - Number(totAdv || 0),
    0,
  );
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDateAR(value) {
  const date = toDateSafe(value);
  if (!date) return "-";
  return date.toLocaleDateString("es-AR");
}

function normalizeAdelantoDetalle(item) {
  return {
    id: String(item?.id || ""),
    fecha: item?.fecha || "",
    monto: Number(item?.monto || 0),
    nota: String(item?.nota || ""),
  };
}

function normalizeExtraDetalle(item) {
  return {
    id: String(item?.id || ""),
    fecha: item?.fecha || "",
    tipo: String(item?.tipo || ""),
    concepto: String(item?.concepto || ""),
    detalle: String(item?.detalle || ""),
    cantidad: Number(item?.cantidad || 0),
    monto: Number(item?.monto || 0),
    nota: String(item?.nota || ""),
  };
}

export function getAdditionalLabel(tipo) {
  if (tipo === "horas") return "Horas extra";
  if (tipo === "jornada") return "Jornada adicional";
  if (tipo === "manual") return "Adicional manual";
  return "Adicional";
}

export function calcMontoJornada({ estado, valorDia = 0, isWeekend = false }) {
  if (isWeekend) return 0;
  if (estado === "ausente") return 0;
  if (estado === "media") return roundMoney(Number(valorDia || 0) * 0.5);
  if (estado === "presente" || estado === "extra") return roundMoney(Number(valorDia || 0));
  return 0;
}

export function calcMontoAdicional({
  empleado,
  tipo,
  cantidad = 0,
  montoManual = 0,
}) {
  const valorDia = Number(empleado?.valorDia || 0);
  const horasJornada = Math.max(Number(empleado?.horasJornada || 8), 1);
  if (tipo === "horas") {
    const horas = Math.max(Number(cantidad || 0), 0);
    const valorHora = valorDia / horasJornada;
    return roundMoney(valorHora * horas * 1.5);
  }
  if (tipo === "jornada") {
    return roundMoney(Number(empleado?.valorExtra || empleado?.valorDia || 0));
  }
  if (tipo === "manual") {
    return roundMoney(Number(montoManual || 0));
  }
  return 0;
}

export function getDayPaymentBreakdown({ dayData, empleado, dateInput }) {
  const rawEstado = String(dayData?.estado || "ausente");
  const estado = rawEstado === "extra" ? "presente" : rawEstado;
  const date = toDateSafe(dateInput);
  const isWeekend = date ? date.getDay() === 0 || date.getDay() === 6 : false;
  const lateBreakdown = getLateArrivalBreakdown(dayData);

  let montoJornada =
    dayData?.montoJornada != null
      ? Number(dayData.montoJornada || 0)
      : calcMontoJornada({
          estado: rawEstado,
          valorDia: Number(empleado?.valorDia || 0),
          isWeekend,
        });

  let extraMonto = Number(dayData?.extraMonto || 0);
  let extraTipo = String(dayData?.extraTipo || "");
  const extraCantidad = Math.max(Number(dayData?.extraCantidad || 0), 0);
  const extraNota = String(dayData?.extraNota || "");

  if (rawEstado === "extra" && extraMonto <= 0) {
    const totalGuardado = Number(dayData?.monto || 0);
    const inferido = Math.max(totalGuardado - montoJornada, 0);
    extraMonto =
      inferido > 0
        ? roundMoney(inferido)
        : calcMontoAdicional({ empleado, tipo: "jornada" });
    extraTipo = extraTipo || "jornada";
  }

  if (!extraTipo && extraMonto > 0) {
    extraTipo = extraCantidad > 0 ? "horas" : "manual";
  }

  const monto = roundMoney(
    dayData?.monto != null
      ? Number(dayData.monto || 0)
      : Number(montoJornada || 0) + Number(extraMonto || 0),
  );

  return {
    estado,
    legacyEstado: rawEstado,
    montoJornada: roundMoney(montoJornada),
    extraMonto: roundMoney(extraMonto),
    extraTipo,
    extraCantidad,
    extraNota,
    monto,
    llegoTarde: lateBreakdown.llegoTarde,
    minutosTarde: lateBreakdown.minutosTarde,
    notaTarde: lateBreakdown.notaTarde,
  };
}

export function buildExtraDetalle({ dayData, empleado, dateInput, id }) {
  const breakdown = getDayPaymentBreakdown({ dayData, empleado, dateInput });
  if (Number(breakdown.extraMonto || 0) <= 0) return null;
  const concepto = getAdditionalLabel(breakdown.extraTipo);
  const detalleHoras =
    breakdown.extraTipo === "horas" && breakdown.extraCantidad > 0
      ? `${breakdown.extraCantidad.toLocaleString("es-AR")} h`
      : "";
  const detalleNota = breakdown.extraNota ? breakdown.extraNota : "";
  const detalle = [detalleHoras, detalleNota].filter(Boolean).join(" · ");
  return {
    id: String(id || ""),
    fecha: fmtDateOnly(dateInput),
    tipo: breakdown.extraTipo,
    concepto,
    detalle,
    cantidad: breakdown.extraCantidad,
    monto: breakdown.extraMonto,
    nota: breakdown.extraNota,
  };
}

export function buildLiquidacionAsistenciaHtml({ empleado, resumenMes, comprobante }) {
  const nombre = escapeHtml(empleado?.nombre || "Empleado");
  const sector = escapeHtml(empleado?.sector || "-");
  const monthLabel = escapeHtml(resumenMes?.labelMes || comprobante?.labelMes || "-");
  const emittedAt = comprobante?.generatedAt
    ? new Date(comprobante.generatedAt).toLocaleString("es-AR")
    : new Date().toLocaleString("es-AR");
  const closedAt = resumenMes?.closedAt
    ? new Date(resumenMes.closedAt).toLocaleString("es-AR")
    : comprobante?.closedAt
      ? new Date(comprobante.closedAt).toLocaleString("es-AR")
      : "-";
  const premio = Number(resumenMes?.premioAsistencia?.premio || comprobante?.premioAsistencia?.premio || 0);
  const cumplimiento = Number(resumenMes?.premioAsistencia?.porcentaje || comprobante?.premioAsistencia?.porcentaje || 0);
  const presentes = Number(resumenMes?.premioAsistencia?.presentes || comprobante?.premioAsistencia?.presentes || 0);
  const medias = Number(resumenMes?.premioAsistencia?.medias || comprobante?.premioAsistencia?.medias || 0);
  const ausentes = Number(resumenMes?.premioAsistencia?.ausentes || comprobante?.premioAsistencia?.ausentes || 0);
  const justificadas = Number(resumenMes?.premioAsistencia?.justificadas || comprobante?.premioAsistencia?.justificadas || 0);
  const tardanzas = Number(resumenMes?.premioAsistencia?.tardanzas || comprobante?.premioAsistencia?.tardanzas || 0);
  const descuentoTardanzas = Number(
    resumenMes?.premioAsistencia?.descuentoTardanzas ||
      comprobante?.premioAsistencia?.descuentoTardanzas ||
      0,
  );
  const totalTrabajado = Number(resumenMes?.totSemana ?? comprobante?.totSemana ?? 0);
  const totalAdicionales = Number(resumenMes?.totExtras ?? comprobante?.totExtras ?? 0);
  const adelantos = Number(resumenMes?.totAdv ?? comprobante?.totAdv ?? 0);
  const totalLiquidacion = calcularTotalLiquidacion({
    totSemana: totalTrabajado,
    totExtras: totalAdicionales,
    totAdv: adelantos,
    premio,
  });
  const adelantosDetalle = Array.isArray(resumenMes?.adelantosDetalle)
    ? resumenMes.adelantosDetalle.map(normalizeAdelantoDetalle)
    : Array.isArray(comprobante?.adelantosDetalle)
      ? comprobante.adelantosDetalle.map(normalizeAdelantoDetalle)
      : [];
  const extrasDetalle = Array.isArray(resumenMes?.extrasDetalle)
    ? resumenMes.extrasDetalle.map(normalizeExtraDetalle)
    : Array.isArray(comprobante?.extrasDetalle)
      ? comprobante.extrasDetalle.map(normalizeExtraDetalle)
      : [];
  const motivos = Array.isArray(resumenMes?.premioAsistencia?.motivos)
    ? resumenMes.premioAsistencia.motivos
    : Array.isArray(comprobante?.premioAsistencia?.motivos)
      ? comprobante.premioAsistencia.motivos
      : [];
  const version = Number(comprobante?.version || 1);
  return `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <title>Comprobante de liquidacion</title>
    <style>
      * {
        box-sizing: border-box;
      }
      @page {
        size: A4;
        margin: 12mm;
      }
      body {
        font-family: Arial, Helvetica, sans-serif;
        color: #111827;
        margin: 0;
        padding: 24px;
        background: #f8fafc;
        overflow-wrap: anywhere;
        word-break: break-word;
      }
      .sheet {
        max-width: 820px;
        margin: 0 auto;
        background: #ffffff;
        border: 1px solid #e5e7eb;
        border-radius: 16px;
        padding: 28px;
      }
      .header {
        display: flex;
        justify-content: space-between;
        gap: 24px;
        border-bottom: 2px solid #e5e7eb;
        padding-bottom: 18px;
        margin-bottom: 22px;
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .title {
        font-size: 24px;
        font-weight: 700;
        margin-bottom: 6px;
      }
      .muted {
        color: #6b7280;
        font-size: 13px;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 14px;
        margin-bottom: 20px;
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .box {
        background: #f8fafc;
        border: 1px solid #e5e7eb;
        border-radius: 12px;
        padding: 14px;
      }
      .box-label {
        font-size: 12px;
        text-transform: uppercase;
        color: #6b7280;
        margin-bottom: 8px;
      }
      .box-value {
        font-size: 22px;
        font-weight: 700;
      }
      .section {
        margin-top: 20px;
        break-inside: auto;
        page-break-inside: auto;
      }
      .section-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 10px;
        break-inside: avoid;
        page-break-after: avoid;
      }
      .section-kicker {
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: #94a3b8;
        margin-bottom: 4px;
      }
      .section-title {
        font-size: 16px;
        font-weight: 700;
        color: #0f172a;
      }
      .section-note {
        font-size: 12px;
        color: #64748b;
      }
      .table-shell {
        overflow: hidden;
        border: 1px solid #e2e8f0;
        border-radius: 18px;
        background: linear-gradient(180deg, #ffffff 0%, #fbfdff 100%);
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.85);
        break-inside: auto;
        page-break-inside: auto;
      }
      table {
        width: 100%;
        border-collapse: separate;
        border-spacing: 0;
        margin-top: 0;
        table-layout: fixed;
      }
      thead {
        display: table-header-group;
      }
      tfoot {
        display: table-footer-group;
      }
      tbody {
        display: table-row-group;
      }
      th, td {
        padding: 12px 14px;
        border-bottom: 1px solid #edf2f7;
        text-align: left;
        font-size: 14px;
        vertical-align: top;
        overflow-wrap: anywhere;
        word-break: break-word;
        hyphens: auto;
      }
      th {
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: #64748b;
        background: #f8fafc;
      }
      tbody tr:nth-child(even) td {
        background: #fcfdff;
      }
      tbody tr:last-child td {
        border-bottom: none;
      }
      tr {
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .summary-table td:first-child {
        color: #334155;
      }
      .summary-table th:first-child,
      .summary-table td:first-child {
        width: 68%;
      }
      .summary-table th:last-child,
      .summary-table td:last-child {
        width: 32%;
      }
      .movements-table th:nth-child(1),
      .movements-table td:nth-child(1) {
        width: 18%;
      }
      .movements-table th:nth-child(2),
      .movements-table td:nth-child(2) {
        width: 20%;
      }
      .movements-table th:nth-child(3),
      .movements-table td:nth-child(3) {
        width: 42%;
      }
      .movements-table th:nth-child(4),
      .movements-table td:nth-child(4) {
        width: 20%;
      }
      .attendance-table th,
      .attendance-table td {
        width: 16.66%;
      }
      .amount-negative {
        color: #c2410c;
        font-weight: 600;
      }
      .amount-positive {
        color: #b45309;
        font-weight: 600;
      }
      .row-total td {
        background: #eef4ff !important;
        color: #1d4ed8;
        font-weight: 700;
      }
      .attendance-table td {
        text-align: center;
      }
      .attendance-table td:last-child {
        text-align: left;
      }
      .empty-cell {
        padding: 24px 14px;
        color: #64748b;
        text-align: center;
        font-style: italic;
      }
      .right {
        text-align: right;
        white-space: nowrap;
      }
      .total {
        font-weight: 700;
        color: #1d4ed8;
      }
      .footer {
        margin-top: 24px;
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 18px;
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .sign {
        height: 72px;
        border-top: 1px solid #d1d5db;
        display: flex;
        align-items: flex-end;
        justify-content: center;
        color: #6b7280;
        font-size: 13px;
        padding-top: 12px;
      }
      @media print {
        body {
          background: #ffffff;
          padding: 0;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .sheet {
          border: none;
          border-radius: 0;
          padding: 0;
          max-width: none;
        }
        .header {
          gap: 16px;
        }
        .grid {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .table-shell {
          overflow: visible;
          border-radius: 0;
          box-shadow: none;
          background: transparent;
        }
        .section {
          margin-top: 16px;
        }
        .section:first-of-type {
          margin-top: 0;
        }
        .footer {
          margin-top: 20px;
        }
      }
      @media (max-width: 720px) {
        .header,
        .section-head {
          flex-direction: column;
          align-items: flex-start;
        }
        .grid,
        .footer {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <div class="sheet">
      <div class="header">
        <div>
          <div class="title">Comprobante de liquidacion mensual</div>
          <div class="muted">Asistencia y premio por presentismo</div>
        </div>
        <div class="muted">
          <div><strong>Mes:</strong> ${monthLabel}</div>
          <div><strong>Version:</strong> ${version}</div>
          <div><strong>Emitido:</strong> ${escapeHtml(emittedAt)}</div>
          <div><strong>Cierre:</strong> ${escapeHtml(closedAt)}</div>
        </div>
      </div>

      <div class="grid">
        <div class="box">
          <div class="box-label">Empleado</div>
          <div class="box-value" style="font-size:20px">${nombre}</div>
          <div class="muted">Sector: ${sector}</div>
        </div>
        <div class="box">
          <div class="box-label">Liquidacion final</div>
          <div class="box-value">${formatCurrencyAR(totalLiquidacion)}</div>
          <div class="muted">Incluye premio y adelantos descontados</div>
        </div>
      </div>

      <div class="section">
        <div class="section-head">
          <div>
            <div class="section-kicker">Resumen</div>
            <div class="section-title">Detalle de liquidacion</div>
          </div>
        </div>
        <div class="table-shell">
          <table class="summary-table">
            <thead>
              <tr>
                <th>Concepto</th>
                <th class="right">Importe</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Total trabajado del mes</td>
                <td class="right">${formatCurrencyAR(totalTrabajado)}</td>
              </tr>
              <tr>
                <td>Adicionales del mes</td>
                <td class="right">${formatCurrencyAR(totalAdicionales)}</td>
              </tr>
              <tr>
                <td>Adelantos descontados</td>
                <td class="right amount-negative">${formatCurrencyAR(adelantos)}</td>
              </tr>
              <tr>
                <td>Premio por asistencia</td>
                <td class="right amount-positive">${formatCurrencyAR(premio)}</td>
              </tr>
              <tr class="row-total">
                <td class="total">Total a pagar</td>
                <td class="right total">${formatCurrencyAR(totalLiquidacion)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="section">
        <div class="section-head">
          <div>
            <div class="section-kicker">Adicionales</div>
            <div class="section-title">Trabajos adicionales del mes</div>
          </div>
          <div class="section-note">${extrasDetalle.length} registro${extrasDetalle.length === 1 ? "" : "s"} cargado${extrasDetalle.length === 1 ? "" : "s"}</div>
        </div>
        <div class="table-shell">
          <table class="movements-table">
            <thead>
              <tr>
                <th>Concepto</th>
                <th>Fecha</th>
                <th>Detalle</th>
                <th class="right">Monto</th>
              </tr>
            </thead>
            <tbody>
              ${extrasDetalle.length > 0 ? extrasDetalle.map((item) => `
              <tr>
                <td>${escapeHtml(item.concepto || "Adicional")}</td>
                <td>${escapeHtml(formatDateAR(item.fecha))}</td>
                <td>${escapeHtml(item.detalle || item.nota || "-")}</td>
                <td class="right">${formatCurrencyAR(item.monto)}</td>
              </tr>`).join("") : `
              <tr>
                <td colspan="4" class="empty-cell">No hay adicionales cargados en este mes.</td>
              </tr>`}
              ${extrasDetalle.length > 0 ? `
              <tr class="row-total">
                <td colspan="3">Subtotal adicionales</td>
                <td class="right">${formatCurrencyAR(totalAdicionales)}</td>
              </tr>` : ""}
            </tbody>
          </table>
        </div>
      </div>

      <div class="section">
        <div class="section-head">
          <div>
            <div class="section-kicker">Movimientos</div>
            <div class="section-title">Adelantos del mes</div>
          </div>
          <div class="section-note">${adelantosDetalle.length} movimiento${adelantosDetalle.length === 1 ? "" : "s"} registrado${adelantosDetalle.length === 1 ? "" : "s"}</div>
        </div>
        <div class="table-shell">
          <table class="movements-table">
            <thead>
              <tr>
                <th>Concepto</th>
                <th>Fecha</th>
                <th>Nota</th>
                <th class="right">Monto</th>
              </tr>
            </thead>
            <tbody>
              ${adelantosDetalle.length > 0 ? adelantosDetalle.map((item) => `
              <tr>
                <td>Adelanto</td>
                <td>${escapeHtml(formatDateAR(item.fecha))}</td>
                <td>${escapeHtml(item.nota || "-")}</td>
                <td class="right">${formatCurrencyAR(item.monto)}</td>
              </tr>`).join("") : `
              <tr>
                <td colspan="4" class="empty-cell">No hay adelantos registrados en este mes.</td>
              </tr>`}
              ${adelantosDetalle.length > 0 ? `
              <tr class="row-total">
                <td colspan="3">Subtotal adelantos</td>
                <td class="right">${formatCurrencyAR(adelantos)}</td>
              </tr>` : ""}
            </tbody>
          </table>
        </div>
      </div>

      <div class="section">
        <div class="section-head">
          <div>
            <div class="section-kicker">Control</div>
            <div class="section-title">Asistencia del periodo</div>
          </div>
        </div>
        <div class="table-shell">
          <table class="attendance-table">
            <thead>
              <tr>
                <th>% asistencia</th>
                <th>Presentes</th>
                <th>Medias</th>
                <th>Ausencias</th>
                <th>Justificadas</th>
                <th>Llegadas tarde</th>
                <th>Estado premio</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>${cumplimiento.toLocaleString("es-AR")}%</td>
                <td>${presentes}</td>
                <td>${medias}</td>
                <td>${ausentes}</td>
                <td>${justificadas}</td>
                <td>${tardanzas}</td>
                <td>${escapeHtml(resumenMes?.premioAsistencia?.estadoLabel || comprobante?.premioAsistencia?.estadoLabel || "-")}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      ${descuentoTardanzas > 0 ? `
      <div class="box" style="margin-top:18px">
        <div class="box-label">Ajuste por llegadas tarde</div>
        <div class="box-value" style="font-size:18px">${formatCurrencyAR(descuentoTardanzas)}</div>
      </div>` : ""}

      ${motivos.length > 0 ? `
      <div class="box" style="margin-top:18px">
        <div class="box-label">Observaciones</div>
        <div>${escapeHtml(motivos.join(" · "))}</div>
      </div>` : ""}

      <div class="footer">
        <div class="sign">Firma empleador</div>
        <div class="sign">Firma empleado</div>
      </div>
    </div>
  </body>
</html>`;
}

export function startOfWeek(dateInput) {
  const date = toDateSafe(dateInput) || new Date();
  const day = date.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  const res = new Date(date);
  res.setDate(date.getDate() + diff);
  res.setHours(0, 0, 0, 0);
  return res;
}

export function addDays(dateInput, days) {
  const date = toDateSafe(dateInput) || new Date();
  const res = new Date(date);
  res.setDate(res.getDate() + Number(days || 0));
  return res;
}

export function dayKey(index) {
  return DAY_KEYS[index] || DAY_KEYS[0];
}

export function contarDiasHabilesEntre(desdeInput, hastaInput) {
  const desde = toDateSafe(desdeInput);
  const hasta = toDateSafe(hastaInput);
  if (!desde || !hasta || desde > hasta) return 0;
  let total = 0;
  const current = new Date(desde);
  current.setHours(0, 0, 0, 0);
  const end = new Date(hasta);
  end.setHours(0, 0, 0, 0);
  while (current <= end) {
    const dow = current.getDay();
    if (dow >= 1 && dow <= 5) total += 1;
    current.setDate(current.getDate() + 1);
  }
  return total;
}

export function getPremioAsistenciaConfig(empleado) {
  return {
    activo: Boolean(empleado?.premioAsistenciaActivo),
    monto: Number(empleado?.premioAsistenciaMonto || 0),
    minPorcentaje: Number(empleado?.premioAsistenciaMinPorcentaje ?? 100),
    maxAusencias: Number(empleado?.premioAsistenciaMaxAusencias ?? 0),
    maxMedias: Number(empleado?.premioAsistenciaMaxMedias ?? 0),
    pesoMedia: Number(empleado?.premioAsistenciaPesoMedia ?? 0.5),
    maxTardanzas: Math.max(
      Number(empleado?.premioAsistenciaMaxTardanzas ?? 0),
      0,
    ),
    descuentoPorTardanza: Math.max(
      Number(empleado?.premioAsistenciaDescuentoTardanza ?? 0),
      0,
    ),
  };
}

function buildWeekMap(rows, employeeId) {
  const filtered = Array.isArray(rows)
    ? rows.filter((row) => String(row?.employeeId || "") === String(employeeId || ""))
    : [];
  return filtered.reduce((acc, row) => {
    const key = fmtDateOnly(row?.weekStart);
    if (key) acc[key] = row;
    return acc;
  }, {});
}

export function calcularTotalTrabajadoMensual({ employeeId, asistencias, monthInput }) {
  const empleado = arguments[0]?.empleado;
  const date = toDateSafe(monthInput) || new Date();
  const year = date.getFullYear();
  const month = date.getMonth();
  const finMes = new Date(year, month + 1, 0);
  const weekMap = buildWeekMap(asistencias, employeeId);
  let total = 0;

  for (let day = 1; day <= finMes.getDate(); day += 1) {
    const current = new Date(year, month, day);
    const dow = current.getDay();
    if (dow === 0 || dow === 6) continue;
    if (isDateBeforeEmployeeStart(current, empleado)) continue;

    const weekStartKey = fmtDateOnly(startOfWeek(current));
    const row = weekMap[weekStartKey];
    const key = DAY_KEYS[dow - 1];
    const breakdown = getDayPaymentBreakdown({
      dayData: row?.days?.[key],
      empleado,
      dateInput: current,
    });
    total += Number(breakdown.montoJornada || 0);
  }

  return Number(total.toFixed(2));
}

export function calcularTotalExtrasMensual({ employeeId, asistencias, monthInput, empleado }) {
  const date = toDateSafe(monthInput) || new Date();
  const year = date.getFullYear();
  const month = date.getMonth();
  const finMes = new Date(year, month + 1, 0);
  const weekMap = buildWeekMap(asistencias, employeeId);
  let total = 0;

  for (let day = 1; day <= finMes.getDate(); day += 1) {
    const current = new Date(year, month, day);
    const dow = current.getDay();
    if (isDateBeforeEmployeeStart(current, empleado)) continue;
    const dayIndex = dow === 0 ? 6 : dow - 1;
    const weekStartKey = fmtDateOnly(startOfWeek(current));
    const row = weekMap[weekStartKey];
    const key = DAY_KEYS[dayIndex];
    const breakdown = getDayPaymentBreakdown({
      dayData: row?.days?.[key],
      empleado,
      dateInput: current,
    });
    total += Number(breakdown.extraMonto || 0);
  }

  return Number(total.toFixed(2));
}

export function buildExtrasDetalleMensual({ employeeId, asistencias, monthInput, empleado }) {
  const date = toDateSafe(monthInput) || new Date();
  const year = date.getFullYear();
  const month = date.getMonth();
  const finMes = new Date(year, month + 1, 0);
  const weekMap = buildWeekMap(asistencias, employeeId);
  const items = [];

  for (let day = 1; day <= finMes.getDate(); day += 1) {
    const current = new Date(year, month, day);
    const dow = current.getDay();
    if (isDateBeforeEmployeeStart(current, empleado)) continue;
    const dayIndex = dow === 0 ? 6 : dow - 1;
    const weekStartKey = fmtDateOnly(startOfWeek(current));
    const row = weekMap[weekStartKey];
    const key = DAY_KEYS[dayIndex];
    const detail = buildExtraDetalle({
      dayData: row?.days?.[key],
      empleado,
      dateInput: current,
      id: `${weekStartKey}-${key}`,
    });
    if (detail) items.push(detail);
  }

  return items.sort((a, b) => String(b.fecha || "").localeCompare(String(a.fecha || "")));
}

function scoreDay(estado, pesoMedia) {
  if (estado === "presente" || estado === "extra") return 1;
  if (estado === "media") return Math.max(0, Number(pesoMedia || 0));
  return 0;
}

function isJustifiedAbsence(dayData) {
  return String(dayData?.estado || "") === "ausente" && Boolean(dayData?.ausentismoJustificado);
}

function isSameLocalDay(a, b) {
  return (
    a instanceof Date &&
    b instanceof Date &&
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function calcularPremioAsistenciaMensual({ empleado, asistencias, monthInput }) {
  const date = toDateSafe(monthInput) || new Date();
  const year = date.getFullYear();
  const month = date.getMonth();
  const inicioMes = new Date(year, month, 1);
  const finMes = new Date(year, month + 1, 0);
  const hoy = new Date();
  const esMesActual = hoy.getFullYear() === year && hoy.getMonth() === month;
  const fechaCorte = esMesActual ? new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()) : finMes;
  const config = getPremioAsistenciaConfig(empleado);
  const weekMap = buildWeekMap(asistencias, empleado?.id);

  let diasEsperados = 0;
  let presentes = 0;
  let medias = 0;
  let ausentes = 0;
  let justificadas = 0;
  let extras = 0;
  let tardanzas = 0;
  let minutosTarde = 0;
  let puntaje = 0;

  for (let day = 1; day <= fechaCorte.getDate(); day += 1) {
    const current = new Date(year, month, day);
    const dow = current.getDay();
    if (dow === 0 || dow === 6) continue;
    if (isDateBeforeEmployeeStart(current, empleado)) continue;
    const weekStartKey = fmtDateOnly(startOfWeek(current));
    const row = weekMap[weekStartKey];
    const key = DAY_KEYS[dow - 1];
    const dayData = row?.days?.[key] || null;
    const hasStoredDay = Boolean(row?.days && Object.prototype.hasOwnProperty.call(row.days, key));

    // El dia en curso no debe penalizar si todavia no fue cargado.
    if (esMesActual && isSameLocalDay(current, fechaCorte) && !hasStoredDay) {
      continue;
    }

    const breakdown = getDayPaymentBreakdown({
      dayData,
      empleado,
      dateInput: current,
    });
    const estado = String(breakdown.estado || "ausente");

    if (isJustifiedAbsence(dayData)) {
      justificadas += 1;
      continue;
    }

    diasEsperados += 1;

    if (estado === "presente") presentes += 1;
    else if (estado === "media") medias += 1;
    else if (estado === "extra") {
      presentes += 1;
      extras += 1;
    } else {
      ausentes += 1;
    }

    if (estado !== "ausente" && breakdown.llegoTarde) {
      tardanzas += 1;
      minutosTarde += Math.max(Number(breakdown.minutosTarde || 0), 0);
    }

    puntaje += scoreDay(estado, config.pesoMedia);
  }

  const porcentaje = diasEsperados > 0 ? Number(((puntaje / diasEsperados) * 100).toFixed(1)) : 0;
  const motivos = [];
  if (porcentaje < config.minPorcentaje) motivos.push(`Asistencia menor a ${config.minPorcentaje}%`);
  if (ausentes > config.maxAusencias) motivos.push(`Ausencias ${ausentes}/${config.maxAusencias}`);
  if (medias > config.maxMedias) motivos.push(`Medias jornadas ${medias}/${config.maxMedias}`);
  if (config.maxTardanzas > 0 && tardanzas > config.maxTardanzas) {
    motivos.push(`Llegadas tarde ${tardanzas}/${config.maxTardanzas}`);
  }

  const cumpleBase =
    config.activo &&
    diasEsperados > 0 &&
    porcentaje >= config.minPorcentaje &&
    ausentes <= config.maxAusencias &&
    medias <= config.maxMedias &&
    (config.maxTardanzas <= 0 || tardanzas <= config.maxTardanzas);

  const premioBase = cumpleBase ? roundMoney(config.monto) : 0;
  const descuentoTardanzas =
    cumpleBase && tardanzas > 0 && config.descuentoPorTardanza > 0
      ? roundMoney(tardanzas * config.descuentoPorTardanza)
      : 0;
  const premioFinal = Math.max(premioBase - descuentoTardanzas, 0);
  const cumple = premioFinal > 0;

  if (descuentoTardanzas > 0) {
    motivos.push(
      `Llegadas tarde ${tardanzas} · ajuste ${formatCurrencyAR(descuentoTardanzas)}`,
    );
  }

  return {
    config,
    diasEsperados,
    presentes,
    medias,
    ausentes,
    justificadas,
    extras,
    tardanzas,
    minutosTarde: roundMoney(minutosTarde),
    puntaje: Number(puntaje.toFixed(2)),
    porcentaje,
    cumple,
    premioBase,
    descuentoTardanzas,
    premio: premioFinal,
    motivos,
    estadoLabel: !config.activo
      ? "Sin reconocimiento"
      : !cumpleBase
        ? "No corresponde"
        : premioFinal <= 0
          ? "Sin reconocimiento"
          : descuentoTardanzas > 0
            ? "Reconocimiento ajustado"
            : "Reconocimiento completo",
    fechaCorte,
    esMesActual,
  };
}
