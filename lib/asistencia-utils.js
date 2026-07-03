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

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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
      body {
        font-family: Arial, Helvetica, sans-serif;
        color: #111827;
        margin: 0;
        padding: 24px;
        background: #f8fafc;
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
      table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 8px;
      }
      th, td {
        padding: 10px 12px;
        border-bottom: 1px solid #e5e7eb;
        text-align: left;
        font-size: 14px;
      }
      th {
        font-size: 12px;
        text-transform: uppercase;
        color: #6b7280;
      }
      .right {
        text-align: right;
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
        }
        .sheet {
          border: none;
          border-radius: 0;
          padding: 0;
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
          <div class="box-value">${formatCurrencyAR(resumenMes?.totPagar ?? comprobante?.totPagar ?? 0)}</div>
          <div class="muted">Incluye premio y adelantos descontados</div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Concepto</th>
            <th class="right">Importe</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Total trabajado del mes</td>
            <td class="right">${formatCurrencyAR(resumenMes?.totSemana ?? comprobante?.totSemana ?? 0)}</td>
          </tr>
          <tr>
            <td>Adelantos descontados</td>
            <td class="right">${formatCurrencyAR(resumenMes?.totAdv ?? comprobante?.totAdv ?? 0)}</td>
          </tr>
          <tr>
            <td>Premio por asistencia</td>
            <td class="right">${formatCurrencyAR(premio)}</td>
          </tr>
          <tr>
            <td class="total">Total a pagar</td>
            <td class="right total">${formatCurrencyAR(resumenMes?.totPagar ?? comprobante?.totPagar ?? 0)}</td>
          </tr>
        </tbody>
      </table>

      <table>
        <thead>
          <tr>
            <th>% asistencia</th>
            <th>Presentes</th>
            <th>Medias</th>
            <th>Ausencias</th>
            <th>Estado premio</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>${cumplimiento.toLocaleString("es-AR")}%</td>
            <td>${presentes}</td>
            <td>${medias}</td>
            <td>${ausentes}</td>
            <td>${escapeHtml(resumenMes?.premioAsistencia?.estadoLabel || comprobante?.premioAsistencia?.estadoLabel || "-")}</td>
          </tr>
        </tbody>
      </table>

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
    <script>
      window.onload = function() {
        window.print();
      };
    </script>
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

function scoreDay(estado, pesoMedia) {
  if (estado === "presente" || estado === "extra") return 1;
  if (estado === "media") return Math.max(0, Number(pesoMedia || 0));
  return 0;
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
  let extras = 0;
  let puntaje = 0;

  for (let day = 1; day <= fechaCorte.getDate(); day += 1) {
    const current = new Date(year, month, day);
    const dow = current.getDay();
    if (dow === 0 || dow === 6) continue;
    diasEsperados += 1;

    const weekStartKey = fmtDateOnly(startOfWeek(current));
    const row = weekMap[weekStartKey];
    const key = DAY_KEYS[dow - 1];
    const estado = String(row?.days?.[key]?.estado || "ausente");

    if (estado === "presente") presentes += 1;
    else if (estado === "media") medias += 1;
    else if (estado === "extra") {
      presentes += 1;
      extras += 1;
    } else {
      ausentes += 1;
    }

    puntaje += scoreDay(estado, config.pesoMedia);
  }

  const porcentaje = diasEsperados > 0 ? Number(((puntaje / diasEsperados) * 100).toFixed(1)) : 0;
  const motivos = [];
  if (porcentaje < config.minPorcentaje) motivos.push(`Asistencia menor a ${config.minPorcentaje}%`);
  if (ausentes > config.maxAusencias) motivos.push(`Ausencias ${ausentes}/${config.maxAusencias}`);
  if (medias > config.maxMedias) motivos.push(`Medias jornadas ${medias}/${config.maxMedias}`);

  const cumple =
    config.activo &&
    diasEsperados > 0 &&
    porcentaje >= config.minPorcentaje &&
    ausentes <= config.maxAusencias &&
    medias <= config.maxMedias;

  return {
    config,
    diasEsperados,
    presentes,
    medias,
    ausentes,
    extras,
    puntaje: Number(puntaje.toFixed(2)),
    porcentaje,
    cumple,
    premio: cumple ? config.monto : 0,
    motivos,
    estadoLabel: !config.activo ? "Sin premio" : cumple ? "Cumple" : "No cumple",
    fechaCorte,
    esMesActual,
  };
}
