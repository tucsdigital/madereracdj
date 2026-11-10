import {
  calcularEstadoCuenta,
  calcularResumenProveedor,
  calcularSaldoCuenta,
  esCuentaAnulada,
  formatFechaAR,
  formatMoneyARS,
} from "@/lib/erp/cuentas-pagar-calculos";

const toNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const dateKey = (value) => {
  if (!value) return "";
  const date = typeof value?.toDate === "function" ? value.toDate() : value instanceof Date ? value : null;
  if (date) {
    if (Number.isNaN(date.getTime())) return "";
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  const text = String(value).trim();
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return "";
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
};

const withinPeriod = (value, period) => {
  const key = dateKey(value);
  if (!key) return false;
  if (period.from && key < period.from) return false;
  if (period.to && key > period.to) return false;
  return true;
};

const serializePayment = (payment, index, movementById, period) => {
  const date = dateKey(payment?.fecha);
  if ((period.from || period.to) && !withinPeriod(date, period)) return null;
  const amount = toNumber(payment?.monto);
  const isReversal = payment?.pagoGlobalReversion === true || amount < 0 || String(payment?.metodo || "").toLowerCase() === "anulación";
  const globalId = String(payment?.pagoGlobalId || "");
  const associatedMovement = globalId ? movementById.get(globalId) : null;
  return {
    id: String(payment?.id || `${index}`),
    date,
    amount,
    method: String(payment?.metodo || "No especificado").slice(0, 80),
    origin: isReversal ? "Reversión" : payment?.saldoAFavorAplicado ? "Saldo a favor" : payment?.pagoGlobalProveedor ? "Pago global aplicado" : "Pago de cuenta",
    annulled: associatedMovement?.anulado === true,
  };
};

/**
 * Construye una versión pública explícita del estado de cuenta. No propaga los
 * documentos Firestore originales para evitar filtrar responsable, notas internas,
 * comprobantes privados u otros campos que se agreguen en el futuro.
 */
export const construirEstadoCuentaCompartido = ({
  proveedorId,
  proveedor = {},
  cuentas = [],
  movimientos = [],
  filters = {},
  now = new Date(),
  generatedAt = new Date().toISOString(),
}) => {
  const id = String(proveedorId || "").trim();
  const period = {
    from: String(filters?.from || "").trim(),
    to: String(filters?.to || "").trim(),
  };
  const matchingAccounts = (Array.isArray(cuentas) ? cuentas : [])
    .filter((account) => String(account?.proveedorId || account?.proveedor?.id || "") === id)
    .map((account) => ({
      ...account,
      id: String(account.id || ""),
      proveedorId: id,
      fecha: dateKey(account.fecha),
      fechaVencimiento: dateKey(account.fechaVencimiento),
    }));
  const matchingMovements = (Array.isArray(movimientos) ? movimientos : [])
    .filter((movement) => String(movement?.proveedorId || "") === id);
  const movementById = new Map(matchingMovements.map((movement) => [String(movement.id || ""), movement]));
  const hasPeriod = Boolean(period.from || period.to);

  const publicAccounts = matchingAccounts
    .map((account) => {
      const payments = (Array.isArray(account.pagos) ? account.pagos : [])
        .map((payment, index) => serializePayment(payment, index, movementById, period))
        .filter(Boolean)
        .sort((a, b) => a.date.localeCompare(b.date));
      const invoiceInPeriod = withinPeriod(account.fecha, period);
      if (hasPeriod && !invoiceInPeriod && payments.length === 0) return null;

      const estado = calcularEstadoCuenta(account, now);
      return {
        id: account.id,
        invoiceNumber: String(account.numeroComprobante || account.nroComprobante || account.comprobanteNumero || "").slice(0, 100),
        concept: String(account.concepto || account.descripcion || "Cuenta por pagar").slice(0, 160),
        date: dateKey(account.fecha),
        dueDate: dateKey(account.fechaVencimiento),
        total: toNumber(account.monto),
        paidToDate: toNumber(account.montoPagado),
        balance: calcularSaldoCuenta(account),
        status: estado,
        annulled: esCuentaAnulada(account),
        invoiceInPeriod,
        payments,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.date.localeCompare(a.date));

  const publicMovements = matchingMovements
    .filter((movement) => !hasPeriod || withinPeriod(movement.fecha, period))
    .map((movement) => {
      const type = String(movement.tipo || "");
      return {
        id: String(movement.id || ""),
        date: dateKey(movement.fecha),
        type: type === "pagoGlobal" ? "Pago global" : type === "saldoAFavor" ? "Movimiento de saldo a favor" : "Movimiento",
        amount: toNumber(type === "pagoGlobal" ? movement.pagoIngresado ?? movement.monto : movement.montoDelta ?? movement.monto),
        applied: toNumber(movement.aplicadoACuentas),
        creditDelta: toNumber(movement.montoDeltaSaldoAFavor ?? movement.montoDelta),
        method: String(movement.metodo || "No especificado").slice(0, 80),
        annulled: movement.anulado === true,
        // Es un resumen del movimiento: las aplicaciones por cuenta ya se detallan arriba.
        applicationCount: Array.isArray(movement.cuentasAplicadas) ? movement.cuentasAplicadas.length : 0,
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  const summary = calcularResumenProveedor({
    proveedorId: id,
    cuentas: matchingAccounts,
    proveedor,
    movimientos: matchingMovements,
    now,
  });
  const overdueAccounts = matchingAccounts.filter((account) => calcularEstadoCuenta(account, now) === "vencida");

  return {
    provider: {
      name: String(proveedor?.nombre || matchingAccounts[0]?.proveedor?.nombre || "Proveedor").slice(0, 160),
      taxId: String(proveedor?.cuit || matchingAccounts[0]?.proveedor?.cuit || "").slice(0, 40),
    },
    period,
    isFiltered: hasPeriod,
    generatedAt,
    summary: {
      accountTotal: summary.total,
      paidToDate: summary.pagado,
      grossBalance: summary.saldoPendienteBruto,
      creditBalance: summary.saldoAFavor,
      netBalance: summary.saldoPendienteNeto,
      creditRemainder: summary.excedenteSaldoAFavor,
      accountCount: matchingAccounts.filter((account) => !esCuentaAnulada(account)).length,
      overdueCount: overdueAccounts.length,
      overdueBalance: overdueAccounts.reduce((sum, account) => sum + calcularSaldoCuenta(account), 0),
    },
    accounts: publicAccounts,
    movements: publicMovements,
    notices: {
      periodBalancesAreCurrent: hasPeriod,
      movementsExplainGlobalPayments: true,
    },
  };
};

const escapeHtml = (value) => String(value ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#39;");

const formatDate = (value) => value ? formatFechaAR(value) : "—";
const formatCurrency = (value) => escapeHtml(formatMoneyARS(value));

export const construirHtmlEstadoCuentaPdf = (statement) => {
  const accountRows = statement.accounts.map((account) => {
    const paymentRows = account.payments.map((payment) => `
      <tr class="payment-row">
        <td>${escapeHtml(formatDate(payment.date))}</td>
        <td>↳ ${escapeHtml(payment.origin)}${payment.annulled ? " · movimiento anulado" : ""}</td>
        <td>${escapeHtml(payment.method)}</td>
        <td class="number">${formatCurrency(payment.amount)}</td>
      </tr>`).join("");
    return `
      <tr class="account-row">
        <td>${escapeHtml(formatDate(account.date))}</td>
        <td><strong>${escapeHtml(account.concept)}</strong>${account.invoiceNumber ? `<span class="secondary">Comprobante ${escapeHtml(account.invoiceNumber)}</span>` : ""}<span class="secondary">${account.dueDate ? `Vence ${escapeHtml(formatDate(account.dueDate))}` : "Sin vencimiento informado"}</span></td>
        <td><span class="status ${account.annulled ? "muted" : account.status === "vencida" ? "danger" : account.status === "pagado" ? "success" : "neutral"}">${escapeHtml(account.status)}</span></td>
        <td class="number">${formatCurrency(account.total)}</td>
        <td class="number paid">${formatCurrency(account.paidToDate)}</td>
        <td class="number balance">${formatCurrency(account.balance)}</td>
      </tr>${paymentRows}`;
  }).join("");

  const movementRows = statement.movements.map((movement) => `
    <tr>
      <td>${escapeHtml(formatDate(movement.date))}</td>
      <td>${escapeHtml(movement.type)}${movement.annulled ? " · Anulado" : ""}</td>
      <td>${escapeHtml(movement.method)}</td>
      <td class="number">${formatCurrency(movement.amount)}</td>
      <td class="number">${formatCurrency(movement.applied)}</td>
      <td class="number">${formatCurrency(movement.creditDelta)}</td>
    </tr>`).join("");

  const periodLabel = statement.isFiltered
    ? `${statement.period.from ? formatDate(statement.period.from) : "Inicio"} — ${statement.period.to ? formatDate(statement.period.to) : "Hoy"}`
    : "Historial completo";
  const summary = statement.summary;

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Estado de cuenta - ${escapeHtml(statement.provider.name)}</title>
<style>
  @page { size: A4; margin: 14mm 13mm 16mm; }
  * { box-sizing: border-box; }
  body { color: #172033; font: 10px/1.45 Arial, Helvetica, sans-serif; margin: 0; }
  .topline { align-items: center; border-bottom: 2px solid #173b65; display: flex; justify-content: space-between; padding: 0 0 12px; }
  .brand { color: #173b65; font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
  .eyebrow { color: #61738b; font-size: 8px; letter-spacing: .12em; text-transform: uppercase; }
  h1 { font-size: 25px; letter-spacing: -.04em; margin: 22px 0 4px; }
  .provider { color: #4c5d73; font-size: 12px; }
  .period { background: #f2f6fb; border: 1px solid #dce5ef; border-radius: 7px; color: #40536b; display: inline-block; margin: 14px 0; padding: 7px 10px; }
  .summary { display: grid; gap: 8px; grid-template-columns: repeat(4, 1fr); margin: 8px 0 18px; }
  .metric { border: 1px solid #e1e7ef; border-radius: 8px; padding: 10px; }
  .metric span { color: #6c7a8c; display: block; font-size: 8px; margin-bottom: 4px; }
  .metric strong { font-size: 13px; }
  h2 { border-bottom: 1px solid #dce3ec; color: #203c5e; font-size: 13px; margin: 20px 0 8px; padding-bottom: 6px; }
  table { border-collapse: collapse; width: 100%; }
  thead { display: table-header-group; }
  th { background: #f3f6fa; color: #53657a; font-size: 8px; font-weight: 700; text-align: left; text-transform: uppercase; }
  th, td { border-bottom: 1px solid #e7ecf2; padding: 7px 6px; vertical-align: top; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  .number { text-align: right; white-space: nowrap; }
  .paid { color: #14734b; }
  .balance { color: #a33232; font-weight: 700; }
  .secondary { color: #738196; display: block; font-size: 8px; margin-top: 2px; }
  .payment-row td { background: #fbfcfe; color: #53657a; font-size: 8px; }
  .status { background: #edf2f7; border-radius: 20px; display: inline-block; font-size: 8px; padding: 3px 7px; text-transform: capitalize; }
  .status.danger { background: #fff0ed; color: #9b3025; }
  .status.success { background: #eaf7ef; color: #176943; }
  .status.muted { color: #687487; }
  .note { background: #f7f9fc; border-left: 3px solid #7192b7; color: #5e6d80; margin-top: 10px; padding: 8px 10px; }
  .footer { border-top: 1px solid #e1e7ef; color: #7a8797; font-size: 8px; margin-top: 24px; padding-top: 8px; }
</style></head><body>
  <div class="topline"><div class="brand">Maderas Caballero</div><div class="eyebrow">Estado de cuenta de proveedor</div></div>
  <h1>${escapeHtml(statement.provider.name)}</h1>
  ${statement.provider.taxId ? `<div class="provider">CUIT ${escapeHtml(statement.provider.taxId)}</div>` : ""}
  <div class="period">${escapeHtml(periodLabel)} · Emitido ${escapeHtml(formatDate(statement.generatedAt))}</div>
  <div class="summary">
    <div class="metric"><span>Total de cuentas</span><strong>${formatCurrency(summary.accountTotal)}</strong></div>
    <div class="metric"><span>Pagado a la fecha</span><strong>${formatCurrency(summary.paidToDate)}</strong></div>
    <div class="metric"><span>Saldo pendiente bruto</span><strong>${formatCurrency(summary.grossBalance)}</strong></div>
    <div class="metric"><span>Saldo a favor</span><strong>${formatCurrency(summary.creditBalance)}</strong></div>
  </div>
  <h2>Cuentas y pagos aplicados</h2>
  <table><thead><tr><th>Fecha</th><th>Cuenta / comprobante</th><th>Estado</th><th class="number">Total</th><th class="number">Pagado</th><th class="number">Saldo</th></tr></thead>
    <tbody>${accountRows || `<tr><td colspan="6">No hay cuentas dentro del período seleccionado.</td></tr>`}</tbody>
  </table>
  <h2>Pagos globales y movimientos de saldo a favor</h2>
  <div class="note">Los pagos globales son un resumen de los movimientos del proveedor. Sus aplicaciones ya se detallan dentro de cada cuenta y no deben sumarse nuevamente.</div>
  <table><thead><tr><th>Fecha</th><th>Movimiento</th><th>Método</th><th class="number">Ingresado / ajuste</th><th class="number">Aplicado</th><th class="number">Cambio saldo a favor</th></tr></thead>
    <tbody>${movementRows || `<tr><td colspan="6">No hay movimientos dentro del período seleccionado.</td></tr>`}</tbody>
  </table>
  ${statement.isFiltered ? `<div class="note">Este estado muestra movimientos del período seleccionado. Los saldos resumidos corresponden al estado actual de la cuenta, actualizado al momento de emisión.</div>` : ""}
  <div class="footer">Documento informativo emitido el ${escapeHtml(formatDate(statement.generatedAt))}. Si encuentra una diferencia, por favor comuníquese con Maderas Caballero.</div>
</body></html>`;
};
