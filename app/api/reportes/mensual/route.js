export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { getAdminDb, verifyFirebaseToken } from "@/lib/firebase-admin";
import { nowIso } from "@/lib/documentacion-server";
import { Resend } from "resend";
import { generatePdfFromHtml } from "@/src/lib/pdf/generate-documento-firmado";
import { existsSync, readFileSync } from "fs";
import { join } from "path";

const REPORT_RECIPIENTS = ["mazalautaro.dev@gmail.com"];

const formatArs = (value) => {
  const n = Number(value) || 0;
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(n);
};

const formatDateAr = (value, { withSeconds = false, dateOnly = false } = {}) => {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const tz = "America/Argentina/Buenos_Aires";

  const makeParts = (date, opts) => {
    const partsArr = new Intl.DateTimeFormat("es-AR", { timeZone: tz, hour12: false, ...opts }).formatToParts(date);
    const parts = {};
    partsArr.forEach((p) => {
      if (p.type !== "literal") parts[p.type] = p.value;
    });
    return parts;
  };

  const parse = () => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return new Date(`${raw}T00:00:00-03:00`);
    const ms = Date.parse(raw);
    return Number.isFinite(ms) ? new Date(ms) : null;
  };

  const d = parse();
  if (!d) return raw;

  const hasTime = raw.includes("T") || /\d{2}:\d{2}/.test(raw);
  const wantsDateOnly = dateOnly || !hasTime;

  if (wantsDateOnly) {
    const p = makeParts(d, { year: "numeric", month: "2-digit", day: "2-digit" });
    if (!p.day || !p.month || !p.year) return raw;
    return `${p.day}/${p.month}/${p.year}`;
  }

  const p = makeParts(d, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    ...(withSeconds ? { second: "2-digit" } : {}),
  });
  if (!p.day || !p.month || !p.year || !p.hour || !p.minute) return raw;
  if (withSeconds && p.second) return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}:${p.second}`;
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const monthLabelEs = (monthKey) => {
  const parsed = parseMonthKey(monthKey);
  if (!parsed) return String(monthKey || "");
  const d = new Date(`${parsed.key}-01T00:00:00-03:00`);
  const m = d.toLocaleString("es-AR", { month: "long", timeZone: "America/Argentina/Buenos_Aires" });
  return `${m.charAt(0).toUpperCase()}${m.slice(1)} ${parsed.year}`;
};

const readLogoDataUrl = () => {
  const p = join(process.cwd(), "public", "logo-maderera.png");
  if (!existsSync(p)) return "";
  const buf = readFileSync(p);
  return `data:image/png;base64,${buf.toString("base64")}`;
};

const buildEmailHtml = ({ monthKey, kpis, pendingCount, logoUrl }) => {
  const label = monthLabelEs(monthKey);

  return `
<!doctype html>
<html lang="es">
  <head>
    <meta charSet="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Reporte Mensual ${escapeHtml(label)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="width:640px;max-width:100%;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e5e7eb;">
            <tr>
              <td style="padding:24px 24px 16px 24px;background:linear-gradient(135deg,#f8fafc 0%,#eef2ff 45%,#e0f2fe 100%);">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
                  <tr>
                    <td valign="middle" style="width:64px;padding:0;">
                      <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                        <tr>
                          <td
                            style="width:52px;height:52px;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;text-align:center;vertical-align:middle;"
                          >
                            ${
                              logoUrl
                                ? `<img src="${escapeHtml(logoUrl)}" width="44" alt="Maderas Caballero" style="display:block;margin:0 auto;width:44px;height:auto;max-height:44px;object-fit:contain;" />`
                                : ""
                            }
                          </td>
                        </tr>
                      </table>
                    </td>
                    <td valign="middle" style="padding:0;">
                      <div style="color:#475569;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;">Reporte mensual</div>
                      <div style="color:#0f172a;font-size:22px;font-weight:800;line-height:1.2;">${escapeHtml(label)}</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding:20px 24px 10px 24px;">
                <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:12px;padding:14px 16px;color:#0f172a;">
                  <div style="font-size:14px;font-weight:700;line-height:1.4;">Reporte generado correctamente</div>
                  <div style="margin-top:8px;font-size:13px;line-height:1.65;color:#334155;">
                    Se generó y guardó el reporte mensual correspondiente a <strong>${escapeHtml(label)}</strong>.
                    El detalle completo se encuentra en el PDF adjunto.
                  </div>
                  <div style="margin-top:10px;font-size:12px;line-height:1.6;color:#475569;">
                    Archivo adjunto: <strong>reporte-mensual-${escapeHtml(String(monthKey || ""))}.pdf</strong>
                  </div>
                </div>
              </td>
            </tr>

            <tr>
              <td style="padding:8px 24px 24px 24px;color:#64748b;font-size:12px;line-height:1.6;">
                Este correo fue generado automáticamente.
              </td>
            </tr>
          </table>

          <div style="width:640px;max-width:100%;color:#64748b;font-size:11px;line-height:1.6;margin-top:10px;">
            Maderas Caballero · Reportes Mensuales
          </div>
        </td>
      </tr>
    </table>
  </body>
</html>
`;
};

const buildPdfHtml = ({ monthKey, period, kpis, pendientesParciales, obrasPendientes, generatedAt, logoDataUrl }) => {
  const label = monthLabelEs(monthKey);
  const ventas = kpis?.ventas || {};
  const cobranzas = kpis?.cobranzas || {};
  const obras = kpis?.obras || {};
  const comisiones = kpis?.comisiones || {};
  const estados = ventas?.estados || {};

  const rowsLimit = 500;
  const rows = Array.isArray(pendientesParciales) ? pendientesParciales.slice(0, rowsLimit) : [];
  const truncated = Array.isArray(pendientesParciales) && pendientesParciales.length > rowsLimit;

  const periodStart = period?.start ? formatDateAr(period.start, { dateOnly: true }) : "";
  const periodEndRaw = period?.end ? new Date(period.end) : null;
  const periodEnd = periodEndRaw ? formatDateAr(new Date(periodEndRaw.getTime() - 1).toISOString(), { dateOnly: true }) : "";

  const kpiCard = (title, value, hint) => `
    <div class="card">
      <div class="card-title">${escapeHtml(title)}</div>
      <div class="card-value">${escapeHtml(value)}</div>
      <div class="card-hint">${escapeHtml(hint || "")}</div>
    </div>
  `;

  const pendientesRowsHtml = rows
    .map((v, idx) => {
      const estado = String(v?.estadoPago || "").toLowerCase();
      const badge =
        estado === "pendiente"
          ? `<span class="badge badge-red">Pendiente</span>`
          : estado === "parcial"
            ? `<span class="badge badge-amber">Parcial</span>`
            : `<span class="badge">-</span>`;
      return `
        <tr>
          <td class="td-muted">${idx + 1}</td>
          <td>${escapeHtml(v?.numeroPedido || v?.id || "")}</td>
          <td class="td-muted">${escapeHtml(formatDateAr(v?.fechaCreacion, { withSeconds: false }))}</td>
          <td>${escapeHtml(v?.clienteNombre || "")}</td>
          <td class="right">${formatArs(v?.total)}</td>
          <td class="right">${formatArs(v?.abonado)}</td>
          <td class="right">${formatArs(v?.saldo)}</td>
          <td class="right">${badge}</td>
        </tr>
      `;
    })
    .join("");

  const obrasRowsLimit = 300;
  const obrasRows = Array.isArray(obrasPendientes) ? obrasPendientes.slice(0, obrasRowsLimit) : [];
  const obrasTruncated = Array.isArray(obrasPendientes) && obrasPendientes.length > obrasRowsLimit;
  const obrasRowsHtml = obrasRows
    .map((o, idx) => {
      return `
        <tr>
          <td class="td-muted">${idx + 1}</td>
          <td>${escapeHtml(o?.numero || o?.id || "")}</td>
          <td class="td-muted">${escapeHtml(formatDateAr(o?.fechaCreacion, { withSeconds: false }))}</td>
          <td>${escapeHtml(o?.clienteNombre || "")}</td>
          <td>${escapeHtml(String(o?.estado || "")).replaceAll("_", " ")}</td>
          <td class="right">${formatArs(o?.total)}</td>
        </tr>
      `;
    })
    .join("");

  const ventasCount = Number(ventas.count || 0);
  const pagadasCount = Number(estados.pagado || 0);
  const parcialesCount = Number(estados.parcial || 0);
  const pendientesCount = Number(estados.pendiente || 0);

  const obrasCount = Number(obras.count || 0);
  const obrasConfirmadasCount = Number(obras.countConfirmadas || 0);
  const obrasPendientesCount = Math.max(obrasCount - obrasConfirmadasCount, 0);
  const obrasMontoPendiente = Math.max((Number(obras.monto || 0) - Number(obras.montoConfirmadas || 0)) || 0, 0);

  const comisionesTotal = (Number(comisiones.ventasConfirmadas) || 0) + (Number(comisiones.obrasConfirmadas) || 0);

  return `
<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <title>Reporte Mensual ${escapeHtml(label)}</title>
    <style>
      @page { size: A4; margin: 12mm; }
      * { box-sizing: border-box; }
      body { font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; color:#0f172a; margin:0; }
      .header { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:16px 18px; border:1px solid #e5e7eb; border-radius:14px; background:#f8fafc; color:#0f172a; }
      .brand { display:flex; align-items:center; gap:12px; }
      .logo-wrap { width:52px; height:52px; border-radius:12px; background:#ffffff; border:1px solid #e5e7eb; display:flex; align-items:center; justify-content:center; overflow:hidden; }
      .logo-img { max-width:44px; max-height:44px; width:auto; height:auto; display:block; object-fit:contain; }
      .title { font-size:18px; font-weight:800; line-height:1.2; margin:0; }
      .subtitle { margin-top:4px; font-size:12px; color:#64748b; }
      .meta { text-align:right; font-size:11px; color:#334155; }
      .meta b { color:#0f172a; }
      .grid { display:grid; grid-template-columns: 1fr 1fr; gap:12px; margin-top:14px; }
      .card { border:1px solid #e5e7eb; border-radius:14px; padding:12px 12px; background:#ffffff; }
      .card-title { font-size:11px; text-transform:uppercase; letter-spacing:0.08em; color:#64748b; }
      .card-value { font-size:18px; font-weight:800; margin-top:6px; }
      .card-hint { font-size:11px; color:#475569; margin-top:6px; }
      .card-lines { margin-top:10px; font-size:11px; color:#334155; line-height:1.65; }
      .metrics { display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-top:10px; }
      .metric { border:1px solid #eef2f7; background:#f8fafc; border-radius:12px; padding:10px 10px; }
      .metric-label { font-size:10px; text-transform:uppercase; letter-spacing:0.08em; color:#64748b; }
      .metric-value { margin-top:6px; font-size:14px; font-weight:900; color:#0f172a; }
      .section { margin-top:18px; }
      .section h2 { margin:0 0 10px 0; font-size:14px; font-weight:900; }
      .small { font-size:11px; color:#475569; }
      table { width:100%; border-collapse:collapse; }
      th { text-align:left; font-size:10px; text-transform:uppercase; letter-spacing:0.08em; color:#64748b; padding:10px 10px; border-bottom:1px solid #e5e7eb; }
      td { padding:9px 10px; border-bottom:1px solid #f1f5f9; font-size:11px; vertical-align:top; }
      tr:nth-child(even) td { background:#fafafa; }
      .right { text-align:right; white-space:nowrap; }
      .td-muted { color:#64748b; }
      .badge { display:inline-block; padding:3px 8px; border-radius:999px; border:1px solid #e5e7eb; font-size:10px; font-weight:700; color:#0f172a; background:#f8fafc; }
      .badge-red { background:#fee2e2; border-color:#fecaca; color:#991b1b; }
      .badge-amber { background:#fef3c7; border-color:#fde68a; color:#92400e; }
      .row { display:flex; gap:12px; }
      .row .card { flex:1; }
      .divider { height:1px; background:#e5e7eb; margin-top:14px; }
      .footer { margin-top:16px; font-size:10px; color:#64748b; display:flex; justify-content:space-between; gap:12px; }
    </style>
  </head>
  <body>
    <div class="header">
      <div class="brand">
        ${
          logoDataUrl
            ? `<div class="logo-wrap"><img class="logo-img" src="${logoDataUrl}" alt="Maderas Caballero" /></div>`
            : `<div class="logo-wrap"></div>`
        }
        <div>
          <div style="font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:#64748b;">Reporte mensual</div>
          <h1 class="title">${escapeHtml(label)}</h1>
          <div class="subtitle">Periodo: ${escapeHtml(periodStart)} — ${escapeHtml(periodEnd)}</div>
        </div>
      </div>
      <div class="meta">
        <div><b>Generado:</b> ${escapeHtml(formatDateAr(generatedAt, { withSeconds: false }))}</div>
        <div><b>Moneda:</b> ARS</div>
      </div>
    </div>

    <div class="grid">
      <div class="card">
        <div class="card-title">Ventas</div>
        <div class="card-value">${escapeHtml(formatArs(ventas.monto))}</div>
        <div class="card-lines">
          <div>${escapeHtml(`Total: ${ventasCount} | Pagadas: ${pagadasCount} | Parciales: ${parcialesCount} | Pendientes: ${pendientesCount}`)}</div>
          <div class="metrics">
            <div class="metric">
              <div class="metric-label">Total pagado</div>
              <div class="metric-value">${escapeHtml(formatArs(cobranzas.pagadoTotal))}</div>
            </div>
            <div class="metric">
              <div class="metric-label">Total pendiente (Pend+Parc)</div>
              <div class="metric-value">${escapeHtml(formatArs(cobranzas.pendienteParcialTotal))}</div>
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Obras</div>
        <div class="card-value">${escapeHtml(formatArs(obras.montoConfirmadas))}</div>
        <div class="card-lines">
          <div>${escapeHtml(`Total: ${obrasCount} | Confirmadas: ${obrasConfirmadasCount} | Pendientes: ${obrasPendientesCount}`)}</div>
          <div class="metrics">
            <div class="metric">
              <div class="metric-label">Total pagado</div>
              <div class="metric-value">${escapeHtml(formatArs(obras.montoConfirmadas))}</div>
            </div>
            <div class="metric">
              <div class="metric-label">Total pendiente</div>
              <div class="metric-value">${escapeHtml(formatArs(obrasMontoPendiente))}</div>
            </div>
          </div>
        </div>
      </div>

      <div class="card" style="grid-column:1 / -1;">
        <div class="card-title">Comisiones</div>
        <div class="card-value">${escapeHtml(formatArs(comisionesTotal))}</div>
        <div class="card-lines">
          <div class="metrics" style="grid-template-columns: 1fr 1fr;">
            <div class="metric">
              <div class="metric-label">Comisiones por ventas confirmadas</div>
              <div class="metric-value">${escapeHtml(formatArs(comisiones.ventasConfirmadas))}</div>
            </div>
            <div class="metric">
              <div class="metric-label">Comisiones por obras confirmadas</div>
              <div class="metric-value">${escapeHtml(formatArs(comisiones.obrasConfirmadas))}</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="section">
      <h2>Ventas pendientes / parciales</h2>
      <div class="small">
        Total: <b>${escapeHtml(String(Array.isArray(pendientesParciales) ? pendientesParciales.length : 0))}</b>
        ${truncated ? ` · Mostrando primeros <b>${rowsLimit}</b> por seguridad` : ""}
      </div>
      <div class="divider"></div>
      <table>
        <thead>
          <tr>
            <th style="width:30px;">#</th>
            <th style="width:90px;">Pedido</th>
            <th style="width:110px;">Fecha</th>
            <th>Cliente</th>
            <th class="right" style="width:80px;">Total</th>
            <th class="right" style="width:80px;">Abonado</th>
            <th class="right" style="width:80px;">Saldo</th>
            <th class="right" style="width:80px;">Estado</th>
          </tr>
        </thead>
        <tbody>
          ${pendientesRowsHtml || `<tr><td colspan="8" class="td-muted">Sin ventas pendientes/parciales en el periodo.</td></tr>`}
        </tbody>
      </table>
    </div>

    <div class="section">
      <h2>Obras pendientes a confirmar</h2>
      <div class="small">
        Total: <b>${escapeHtml(String(Array.isArray(obrasPendientes) ? obrasPendientes.length : 0))}</b>
        ${obrasTruncated ? ` · Mostrando primeros <b>${obrasRowsLimit}</b> por seguridad` : ""}
      </div>
      <div class="divider"></div>
      <table>
        <thead>
          <tr>
            <th style="width:30px;">#</th>
            <th style="width:90px;">Obra</th>
            <th style="width:110px;">Fecha</th>
            <th>Cliente</th>
            <th style="width:110px;">Estado</th>
            <th class="right" style="width:90px;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${obrasRowsHtml || `<tr><td colspan="6" class="td-muted">Sin obras pendientes a confirmar en el periodo.</td></tr>`}
        </tbody>
      </table>
    </div>

    <div class="footer">
      <div>Reporte interno · Maderas Caballero</div>
      <div>Mes: ${escapeHtml(String(monthKey || ""))}</div>
    </div>
  </body>
</html>
`;
};

const calcObraTotal = (o) =>
  Number(o?.total) ||
  Number(o?.subtotal) ||
  (Number(o?.productosTotal) || 0) +
    (Number(o?.materialesTotal) || 0) +
    (Number(o?.gastoObraManual) || 0) +
    (Number(o?.costoEnvio) || 0) -
    (Number(o?.descuentoTotal) || 0);

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
    const sendEmail = url.searchParams.get("email") !== "0";
    const force = url.searchParams.get("force") === "1";
    const parsed = monthKeyParam ? parseMonthKey(monthKeyParam) : defaultMonthKey();
    if (!parsed) {
      return NextResponse.json({ ok: false, error: "Parámetro month inválido (YYYY-MM)" }, { status: 400 });
    }

    const db = getAdminDb();
    const reportRef = db.collection("reportes_mensuales").doc(parsed.key);
    const existingSnap = await reportRef.get();
    const existing = existingSnap.exists ? existingSnap.data() || {} : null;
    const emailAlreadySent = Boolean(existing?.email?.sentAt);

    const shouldGenerate = force || !existingSnap.exists;
    let reportDoc = existing || null;
    let pendingCount = Number(existing?.ventasPendientesParcialesCount || 0);

    if (!shouldGenerate) {
      if (emailAlreadySent || !sendEmail) {
        return NextResponse.json({
          ok: true,
          month: parsed.key,
          reportId: parsed.key,
          pendingCount,
          generated: false,
          emailed: emailAlreadySent,
          skipped: true,
        });
      }
    }

    if (shouldGenerate) {
      const { start, end } = monthRange(parsed);
      const startMs = start.getTime();
      const endMs = end.getTime();

      const [ventasSnap, obrasSnap] = await Promise.all([db.collection("ventas").get(), db.collection("obras").get()]);
      const ventasAll = ventasSnap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
      const obrasAll = obrasSnap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));

      const ventasPeriodo = ventasAll.filter((v) => isInRange(v.fechaCreacion || v.fecha, startMs, endMs));
      const obrasPeriodo = obrasAll.filter((o) => isInRange(o.fechaCreacion, startMs, endMs));

      const obrasPendientes = obrasPeriodo
        .filter((o) => String(o?.tipo || "").toLowerCase() === "obra")
        .filter((o) => {
          const e = String(o?.estado || "").toLowerCase();
          return !(e === "en_ejecucion" || e === "completada");
        })
        .map((o) => ({
          id: String(o?.id || ""),
          numero: String(o?.numero || o?.numeroPedido || (o?.id ? String(o.id).slice(-8) : "")),
          fechaCreacion: String(o?.fechaCreacion || ""),
          clienteNombre: String(o?.cliente?.nombre || ""),
          estado: String(o?.estado || ""),
          total: Number(calcObraTotal(o)) || 0,
        }))
        .sort((a, b) => toMs(a.fechaCreacion) - toMs(b.fechaCreacion));

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

      reportDoc = {
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
        obrasPendientes,
        obrasPendientesCount: obrasPendientes.length,
        email: {
          sentAt: null,
          resendId: null,
          to: REPORT_RECIPIENTS,
          sendingAt: null,
          sendingError: null,
        },
      };
      pendingCount = pendientesParciales.length;

      if (!existingSnap.exists) {
        await reportRef.create(reportDoc);
      } else {
        await reportRef.set(reportDoc, { merge: true });
      }
    }

    if (!sendEmail) {
      return NextResponse.json({
        ok: true,
        month: parsed.key,
        reportId: parsed.key,
        pendingCount,
        generated: shouldGenerate,
        emailed: false,
      });
    }

    const latestSnap = await reportRef.get();
    const latest = latestSnap.exists ? latestSnap.data() || {} : reportDoc || {};
    if (latest?.email?.sentAt && !force) {
      return NextResponse.json({
        ok: true,
        month: parsed.key,
        reportId: parsed.key,
        pendingCount: Number(latest?.ventasPendientesParcialesCount || pendingCount || 0),
        generated: shouldGenerate,
        emailed: true,
        skipped: true,
      });
    }

    const apiKey = String(process.env.RESEND_API_KEY || "").trim();
    const from = String(process.env.RESEND_FROM || "").trim();
    const replyTo = String(process.env.RESEND_REPLY_TO || "").trim();
    if (!apiKey || !from) {
      await reportRef.set(
        { email: { sendingError: "Falta RESEND_API_KEY o RESEND_FROM", sendingAt: null, to: REPORT_RECIPIENTS }, updatedAt: nowIso() },
        { merge: true }
      );
      return NextResponse.json({ ok: false, error: "Falta configuración de Resend (RESEND_API_KEY / RESEND_FROM)" }, { status: 500 });
    }

    const origin = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
    const logoUrl = `${String(origin || "").replace(/\/$/, "")}/logo-maderera.png`;
    const logoDataUrl = readLogoDataUrl();

    const emailSendingAt = nowIso();
    await reportRef.set({ email: { ...(latest.email || {}), sendingAt: emailSendingAt, sendingError: null, to: REPORT_RECIPIENTS } }, { merge: true });

    try {
      const pdfHtml = buildPdfHtml({
        monthKey: parsed.key,
        period: latest.period,
        kpis: latest.kpis,
        pendientesParciales: latest.ventasPendientesParciales || [],
        obrasPendientes: latest.obrasPendientes || [],
        generatedAt: latest.generatedAt || emailSendingAt,
        logoDataUrl,
      });
      const pdfBuffer = await generatePdfFromHtml(pdfHtml);

      const resend = new Resend(apiKey);
      const label = monthLabelEs(parsed.key);
      const subject = `Reporte Mensual ${label} - Maderas Caballero`;
      const html = buildEmailHtml({
        monthKey: parsed.key,
        kpis: latest.kpis,
        pendingCount: Number(latest?.ventasPendientesParcialesCount || 0),
        logoUrl,
      });
      const text = `Reporte mensual ${label}\n\nSe generó y guardó el reporte mensual. Se adjunta el PDF con el detalle completo.`;

      const { data, error } = await resend.emails.send({
        from,
        to: REPORT_RECIPIENTS,
        subject,
        text,
        html,
        ...(replyTo ? { replyTo } : {}),
        attachments: [
          {
            filename: `reporte-mensual-${parsed.key}.pdf`,
            content: pdfBuffer.toString("base64"),
            contentType: "application/pdf",
          },
        ],
      });

      if (error) {
        throw new Error(error?.message || "Error enviando email");
      }

      const sentAt = nowIso();
      await reportRef.set(
        {
          email: {
            ...(latest.email || {}),
            sentAt,
            resendId: data?.id || null,
            sendingAt: null,
            sendingError: null,
            to: REPORT_RECIPIENTS,
          },
          updatedAt: sentAt,
        },
        { merge: true }
      );

      return NextResponse.json({
        ok: true,
        month: parsed.key,
        reportId: parsed.key,
        pendingCount: Number(latest?.ventasPendientesParcialesCount || pendingCount || 0),
        generated: shouldGenerate,
        emailed: true,
        resendId: data?.id || null,
      });
    } catch (e) {
      const errMsg = String(e?.message || "Error enviando email");
      const errAt = nowIso();
      await reportRef.set(
        { email: { ...(latest.email || {}), sendingAt: null, sendingError: errMsg, errorAt: errAt, to: REPORT_RECIPIENTS }, updatedAt: errAt },
        { merge: true }
      );
      return NextResponse.json({ ok: false, error: errMsg, month: parsed.key, reportId: parsed.key }, { status: 502 });
    }
  } catch (e) {
    return NextResponse.json({ ok: false, error: e?.message || "Error" }, { status: 500 });
  }
}
