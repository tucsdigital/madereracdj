// Panel de ecommerce: normalización, filtros, orden, paginación y estadísticas de las ventas de la tienda online.
// JavaScript puro (sin Firebase) para usarlo en el servidor y en las pruebas.

const DAY = 86400000;
const AR_OFFSET = 3 * 3600000; // Argentina (UTC-3, sin horario de verano)

export const PERIODOS = [
  { value: "hoy", label: "Hoy" },
  { value: "7d", label: "7 días" },
  { value: "30d", label: "30 días" },
  { value: "mes", label: "Este mes" },
  { value: "anio", label: "Este año" },
  { value: "todo", label: "Todo" },
  { value: "custom", label: "Personalizado" },
];
export const ESTADOS = [
  { value: "pagado", label: "Pagado" },
  { value: "pendiente", label: "Pendiente" },
  { value: "parcial", label: "Parcial" },
  { value: "anulada", label: "Anulada" },
];
export const PAGOS = [
  { value: "mercadopago", label: "Mercado Pago" },
  { value: "transferencia", label: "Transferencia" },
];
export const ENTREGAS = [
  { value: "retiro", label: "Retiro" },
  { value: "envio", label: "Envío" },
  { value: "cotizar", label: "A cotizar" },
];
export const LIMITES = [10, 25, 50, 100];
export const DESCUENTOS = [
  { value: "con", label: "Con descuento" },
  { value: "sin", label: "Sin descuento registrado" },
  { value: "producto", label: "De producto" },
  { value: "pago", label: "Por forma de pago" },
  { value: "revisar", label: "Importes a revisar" },
];
export const SORT_KEYS = ["fecha", "numero", "cliente", "total", "estado", "pago"];

const str = (v) => String(v ?? "").trim();
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const money = (n) => Math.round(num(n) * 100) / 100;
const fold = (v) => str(v).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

// Los importes históricos son la fuente: nunca aplicar el descuento vigente
// ni convertir una diferencia sin respaldo en una promoción confirmada.
export function conciliarVenta(v, productos, pago) {
  const lineas = money(productos.reduce((sum, p) => sum + p.total, 0));
  const descuentoLineas = money(productos.reduce((sum, p) => sum + p.descuentoMonto, 0));
  const producto = money(v.descuentoTotal ?? v.descuentos ?? descuentoLineas);
  const pagoMonto = money(v.descuentoEfectivo);
  const base = v.subtotal != null ? money(v.subtotal) : money(lineas + producto);
  const iva = money(v.ivaMonto);
  const recargo = money(v.transferenciaMonto);
  const esperado = money(base - producto - pagoMonto + money(v.costoEnvio) + iva + recargo);
  const diferencia = money(money(v.total) - esperado);
  const motivos = [];
  if (Math.abs(diferencia) > 1) motivos.push("El total registrado no coincide con el subtotal, los descuentos y el envío. La diferencia no tiene un concepto confirmado.");
  if (Math.abs(lineas - (base - producto)) > 1) motivos.push("La suma neta de productos no coincide con el subtotal menos el descuento de producto.");
  if (producto < 0 || pagoMonto < 0 || producto + pagoMonto > base + 1) motivos.push("Los descuentos registrados están fuera del rango del subtotal.");
  if (v.descuentoTotal != null && v.descuentos != null && Math.abs(num(v.descuentoTotal) - num(v.descuentos)) > 1) motivos.push("Los campos históricos de descuento de producto difieren entre sí.");
  const pct = (amount, total) => total > 0 ? Math.round(amount / total * 10000) / 100 : null;
  return { base, producto, pago: pagoMonto, total: money(producto + pagoMonto),
    pagoTipo: pago === "transferencia" ? "Transferencia" : pago === "efectivo" ? "Efectivo" : "Forma de pago",
    pctProducto: pct(producto, base), pctPago: pct(pagoMonto, base - producto),
    iva, recargo, diferencia, esperado, lineas, motivos, revisar: motivos.length > 0 };
}

export function describeDescuentos(d) {
  if (!d) return [];
  return [
    { key: "producto", label: "Producto", monto: d.producto, pct: d.pctProducto },
    { key: "pago", label: d.pagoTipo, monto: d.pago, pct: d.pctPago },
  ].filter((part) => part.monto > 0);
}

const toIso = (v) => {
  if (!v) return "";
  if (typeof v?.toDate === "function") return v.toDate().toISOString();
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? "" : v.toISOString();
  const ms = Date.parse(v);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : "";
};

/** Día calendario argentino de un instante: { y, m, d } (m de 0 a 11). */
export const arDay = (ms) => { const d = new Date(ms - AR_OFFSET); return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate() }; };
export const arStart = (y, m, d) => Date.UTC(y, m, d) + AR_OFFSET;
export const dayKey = (ms) => { const { y, m, d } = arDay(ms); return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`; };

export function normalizeVenta(id, v = {}) {
  const fecha = toIso(v.fechaCreacion) || toIso(v.creadoEn) || toIso(v.fecha);
  const forma = fold(v.formaPago);
  const pago = forma.includes("mercado") ? "mercadopago" : forma.includes("transfer") ? "transferencia" : forma ? forma : "";
  const tipo = fold(v.tipoEnvio);
  const entrega = tipo.includes("cotiz") ? "cotizar" : tipo === "retiro_local" || tipo.includes("retiro") ? "retiro" : "envio";
  const anulada = v.anulada === true || fold(v.estado) === "anulada";
  const productos = (Array.isArray(v.productos) ? v.productos : []).map((p) => {
    const base = money(num(p?.precio) * num(p?.cantidad));
    const porcentaje = num(p?.descuento ?? p?.descuentoPorcentaje ?? p?.discount?.percentage);
    const descuentoMonto = money(p?.descuentoMonto ?? p?.discount?.amount ?? base * porcentaje / 100);
    return {
    id: str(p?.originalId || p?.id),
    nombre: str(p?.nombre || p?.descripcion),
    cantidad: num(p?.cantidad),
    precio: num(p?.precio),
    base,
    descuentoMonto,
    total: money(base - descuentoMonto),
    sinStock: num(p?.cantidadSinStock),
  }; });
  const desc = conciliarVenta(v, productos, pago);
  const cliente = v.cliente || {};
  const direccion = [str(v.direccionEnvio || cliente.direccion), str(v.localidadEnvio || cliente.ciudad), str(v.codigoPostal) ? `CP ${str(v.codigoPostal)}` : ""].filter(Boolean).join(", ");
  return {
    id: str(id),
    numero: str(v.numeroPedido) || str(id).slice(-8),
    referencia: str(v.idExterno),
    fecha,
    ms: fecha ? Date.parse(fecha) : 0,
    cliente: { nombre: str(cliente.nombre), email: str(cliente.email), telefono: str(cliente.telefono) },
    productos,
    unidades: productos.reduce((s, p) => s + p.cantidad, 0),
    pago,
    estadoPago: ["pagado", "parcial"].includes(str(v.estadoPago)) ? str(v.estadoPago) : "pendiente",
    anulada,
    entrega,
    direccion: entrega === "retiro" ? str(v.sucursal?.nombre || v.sucursal?.direccion) : direccion,
    total: money(v.total),
    subtotal: desc.base,
    descuentos: desc.total,
    desc,
    envio: money(v.costoEnvio),
    aReponer: v.aReponer === true,
  };
}

/** Rango de fechas de un período (en días de Argentina) y el período anterior de igual duración. */
export function periodRange(periodo, { desde = "", hasta = "" } = {}, now = Date.now()) {
  const t = arDay(now);
  const today = arStart(t.y, t.m, t.d);
  const end = today + DAY;
  let from = null;
  let to = end;
  if (periodo === "hoy") from = today;
  else if (periodo === "7d") from = today - 6 * DAY;
  else if (periodo === "30d") from = today - 29 * DAY;
  else if (periodo === "mes") from = arStart(t.y, t.m, 1);
  else if (periodo === "anio") from = arStart(t.y, 0, 1);
  else if (periodo === "custom") {
    const parse = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str(s)); return m ? arStart(+m[1], +m[2] - 1, +m[3]) : null; };
    from = parse(desde);
    const h = parse(hasta);
    to = h === null ? end : h + DAY;
    if (from !== null && to <= from) to = from + DAY;
  }
  const prev = from === null ? null : { from: from - (to - from), to: from };
  return { from, to, prev };
}

export function filterVentas(rows, f = {}) {
  const q = fold(f.q);
  return rows.filter((r) => {
    if (r.anulada && !f.anuladas && f.estadoPago !== "anulada") return false;
    if (f.from != null && r.ms < f.from) return false;
    if (f.to != null && r.ms >= f.to) return false;
    if (f.estadoPago === "anulada" ? !r.anulada : f.estadoPago ? r.anulada || r.estadoPago !== f.estadoPago : false) return false;
    if (f.pago && r.pago !== f.pago) return false;
    if (f.entrega && r.entrega !== f.entrega) return false;
    if (f.reponer && !r.aReponer) return false;
    if (f.descuento && !({ con: r.desc.total > 0, sin: r.desc.total === 0, producto: r.desc.producto > 0, pago: r.desc.pago > 0, revisar: r.desc.revisar }[f.descuento])) return false;
    if (!q) return true;
    const hay = fold(`${r.numero} ${r.referencia} ${r.cliente.nombre} ${r.cliente.email} ${r.cliente.telefono} ${r.productos.map((p) => p.nombre).join(" ")}`);
    return q.split(/\s+/).every((word) => hay.includes(word));
  });
}

const stateOrder = (r) => (r.anulada ? 3 : { pagado: 0, parcial: 1, pendiente: 2 }[r.estadoPago] ?? 2);
const SORTERS = {
  fecha: (a, b) => a.ms - b.ms,
  numero: (a, b) => a.numero.localeCompare(b.numero, "es", { numeric: true }),
  cliente: (a, b) => fold(a.cliente.nombre || a.cliente.email).localeCompare(fold(b.cliente.nombre || b.cliente.email), "es"),
  total: (a, b) => a.total - b.total,
  estado: (a, b) => stateOrder(a) - stateOrder(b),
  pago: (a, b) => a.pago.localeCompare(b.pago),
};
export function sortVentas(rows, key = "fecha", dir = "desc") {
  const sorter = SORTERS[key] || SORTERS.fecha;
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => sign * sorter(a, b) || b.ms - a.ms);
}

export function paginate(rows, pagina = 1, limite = 25) {
  const size = LIMITES.includes(Number(limite)) ? Number(limite) : 25;
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const page = Math.min(pages, Math.max(1, Math.floor(Number(pagina)) || 1));
  return { items: rows.slice((page - 1) * size, page * size), total: rows.length, pagina: page, paginas: pages, limite: size };
}

/** Filtros desde la URL de la API. */
export function parseFilters(params, now = Date.now()) {
  const get = (k) => str(params.get(k));
  const periodo = PERIODOS.some((p) => p.value === get("periodo")) ? get("periodo") : "30d";
  const { from, to, prev } = periodRange(periodo, { desde: get("desde"), hasta: get("hasta") }, now);
  const pick = (k, list) => (list.some((o) => o.value === get(k)) ? get(k) : "");
  return {
    periodo, from, to, prev,
    q: get("q"),
    estadoPago: pick("estado", ESTADOS),
    pago: pick("pago", PAGOS),
    entrega: pick("entrega", ENTREGAS),
    descuento: pick("descuento", DESCUENTOS),
    anuladas: get("anuladas") === "1",
    reponer: get("reponer") === "1",
    orden: SORT_KEYS.includes(get("orden")) ? get("orden") : "fecha",
    dir: get("dir") === "asc" ? "asc" : "desc",
    pagina: Number(get("pagina")) || 1,
    limite: Number(get("limite")) || 25,
  };
}

const pctChange = (now, before) => (before > 0 ? Math.round(((now - before) / before) * 1000) / 10 : null);

function metrics(rows) {
  const active = rows.filter((r) => !r.anulada);
  const paid = active.filter((r) => r.estadoPago === "pagado");
  const vendido = money(paid.reduce((s, r) => s + r.total, 0));
  const open = active.filter((r) => r.estadoPago !== "pagado");
  return {
    vendido,
    pedidos: active.length,
    pagados: paid.length,
    ticket: paid.length ? money(vendido / paid.length) : 0,
    porCobrar: money(open.reduce((s, r) => s + r.total, 0)),
    porCobrarPedidos: open.length,
    aReponer: active.filter((r) => r.aReponer).length,
    anuladas: rows.length - active.length,
    descuentos: {
      total: money(paid.reduce((sum, r) => sum + r.desc.total, 0)),
      producto: money(paid.reduce((sum, r) => sum + r.desc.producto, 0)),
      pago: money(paid.reduce((sum, r) => sum + r.desc.pago, 0)),
      revisar: active.filter((r) => r.desc.revisar).length,
    },
  };
}

/** Estadísticas del período: la plata es de pedidos pagados; el resto cuenta pedidos no anulados. */
export function computeResumen({ rows, prevRows = null, from = null, to = null, clientes = { total: 0, nuevos: 0 }, top = 8 }) {
  const m = metrics(rows);
  const before = prevRows ? metrics(prevRows) : null;
  const active = rows.filter((r) => !r.anulada);

  const products = new Map();
  for (const r of active) {
    for (const p of r.productos) {
      const key = p.id || p.nombre;
      if (!key) continue;
      const item = products.get(key) || { id: p.id, nombre: p.nombre, unidades: 0, ingresos: 0 };
      item.unidades += p.cantidad;
      item.ingresos = money(item.ingresos + p.total);
      products.set(key, item);
    }
  }
  const topProductos = [...products.values()].sort((a, b) => b.unidades - a.unidades || b.ingresos - a.ingresos).slice(0, top);

  const paid = active.filter((r) => r.estadoPago === "pagado");
  const first = from ?? (paid.length ? Math.min(...paid.map((r) => r.ms)) : null);
  const last = to ?? (paid.length ? Math.max(...paid.map((r) => r.ms)) + DAY : null);
  const serie = [];
  if (first !== null && last !== null) {
    const start = arDay(first);
    let cursor = arStart(start.y, start.m, start.d);
    const buckets = new Map();
    for (const r of paid) buckets.set(dayKey(r.ms), money((buckets.get(dayKey(r.ms)) || 0) + r.total));
    for (let i = 0; cursor < last && i < 400; i += 1, cursor += DAY) serie.push({ dia: dayKey(cursor), total: buckets.get(dayKey(cursor)) || 0 });
  }

  const split = (key, list) => list.map((o) => ({ value: o.value, label: o.label, pedidos: active.filter((r) => r[key] === o.value).length }));
  return {
    ...m,
    variacion: before ? { vendido: pctChange(m.vendido, before.vendido), pedidos: pctChange(m.pedidos, before.pedidos), ticket: pctChange(m.ticket, before.ticket) } : null,
    clientes,
    topProductos,
    serie,
    pagos: split("pago", PAGOS),
    entregas: split("entrega", ENTREGAS),
  };
}

const csvCell = (v) => {
  const s = String(v ?? "");
  return /[",\n;]/.test(s) || /^[=+\-@]/.test(s) ? `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"` : s;
};
/** CSV (con BOM y separador ";" para que Excel lo abra bien) de las ventas indicadas. */
export function ventasCsv(rows) {
  const head = ["Pedido", "Fecha", "Cliente", "Email", "Teléfono", "Productos", "Unidades", "Pago", "Estado", "Entrega", "Subtotal", "Descuentos", "Envío", "Total", "A reponer", "Desc. producto", "Desc. forma de pago", "Tipo descuento pago", "Diferencia sin conciliar", "Revisar"];
  const label = (list, v) => list.find((o) => o.value === v)?.label || v;
  const lines = rows.map((r) => [
    r.numero, r.fecha ? new Date(r.ms - AR_OFFSET).toISOString().slice(0, 16).replace("T", " ") : "", r.cliente.nombre, r.cliente.email, r.cliente.telefono,
    r.productos.map((p) => `${p.cantidad} x ${p.nombre}`).join(" | "), r.unidades, label(PAGOS, r.pago), r.anulada ? "Anulada" : label(ESTADOS, r.estadoPago),
    label(ENTREGAS, r.entrega), r.subtotal, r.descuentos, r.envio, r.total, r.aReponer ? "Sí" : "No",
    r.desc.producto, r.desc.pago, r.desc.pago > 0 ? r.desc.pagoTipo : "", r.desc.diferencia, r.desc.motivos.join(" "),
  ].map(csvCell).join(";"));
  return `\uFEFF${[head.join(";"), ...lines].join("\r\n")}`;
}
