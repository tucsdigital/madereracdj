"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { ArrowLeftRight, Banknote, ChevronDown, ChevronUp, CreditCard, Wallet } from "lucide-react";
import Link from "next/link";
import { db } from "@/lib/firebase";
import { normalizarFecha } from "@/lib/fechas-locales";
import { useLocalizedPath } from "@/lib/utils";

const nf = new Intl.NumberFormat("es-AR");
const CACHE_MAX_AGE_MS = 2 * 60 * 1000;
let cacheRef = { data: null, ts: 0 };

const hoyIso = () => normalizarFecha(new Date());
const fechaComoIso = (valor) => normalizarFecha(valor) || null;

const toDate = (valor) => {
  if (!valor) return null;
  if (typeof valor === "string" && /^\d{4}-\d{2}-\d{2}$/.test(valor.trim())) return null;
  const date = typeof valor === "object" && typeof valor.toDate === "function"
    ? valor.toDate()
    : typeof valor === "object" && typeof valor.seconds === "number"
      ? new Date(valor.seconds * 1000)
      : valor instanceof Date
        ? valor
        : new Date(valor);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatHour = (valor) => toDate(valor)?.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" }) || "-";
const getMetodoInfo = (metodo) => {
  const label = String(metodo || "").trim();
  const normalized = label.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (normalized.includes("transfer")) return { label: "Transferencia", Icon: ArrowLeftRight };
  if (normalized.includes("efectivo") || normalized === "cash") return { label: "Efectivo", Icon: Banknote };
  if (normalized.includes("tarjeta") || normalized.includes("credito") || normalized.includes("debito")) {
    return { label: "Tarjeta", Icon: CreditCard };
  }
  if (normalized.includes("mercadopago") || normalized.includes("mercado pago")) {
    return { label: "Mercado Pago", Icon: ArrowLeftRight };
  }
  return { label: label || "—", Icon: null };
};
const isVentaAnulada = (venta) => String(venta?.estado || "").toLowerCase() === "anulada" || venta?.anulada === true;

/** Ingresos registrados hoy; conserva el alcance actual de caja: pagos de ventas. */
const CajaDelDia = () => {
  const [loading, setLoading] = useState(true);
  const [ventas, setVentas] = useState([]);
  const [error, setError] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const localize = useLocalizedPath();
  const fetchedRef = useRef(false);

  useEffect(() => {
    const cargar = async () => {
      const now = Date.now();
      if (cacheRef.data && now - cacheRef.ts < CACHE_MAX_AGE_MS) {
        setVentas(cacheRef.data.ventas);
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        setError(false);
        const ventasSnap = await getDocs(collection(db, "ventas"));
        const ventasData = ventasSnap.docs.map((doc) => ({ ...doc.data(), id: doc.id }));
        cacheRef = { data: { ventas: ventasData }, ts: Date.now() };
        setVentas(ventasData);
      } catch (loadError) {
        console.error("Error cargando datos de Caja:", loadError);
        setError(true);
      } finally {
        setLoading(false);
      }
    };
    if (!fetchedRef.current) {
      fetchedRef.current = true;
      cargar();
    }
  }, []);

  const ingresos = useMemo(() => {
    const today = hoyIso();
    const list = [];
    ventas.forEach((venta) => {
      if (isVentaAnulada(venta)) return;
      let pagos = Array.isArray(venta.pagos) ? venta.pagos : [];
      if (!pagos.length && Number(venta.montoAbonado) > 0) {
        pagos = [{ monto: Number(venta.montoAbonado), fecha: venta.fecha || venta.fechaCreacion, metodo: venta.formaPago }];
      }
      pagos.forEach((pago, index) => {
        const fechaIngreso = fechaComoIso(pago.fechaHora) || fechaComoIso(pago.fecha);
        if (fechaIngreso !== today) return;
        const monto = Number(pago.monto) || 0;
        if (monto <= 0) return;
        list.push({
          key: `venta-${venta.id}-${index}`,
          monto,
          metodo: pago.metodo || venta.formaPago || "—",
          referencia: venta.numeroPedido
            ? `#${String(venta.numeroPedido).replace(/^#+/, "").toLocaleUpperCase("es-AR")}`
            : `#${String(venta.id).slice(0, 6).toLocaleUpperCase("es-AR")}`,
          cliente: String(venta.cliente?.nombre || ""),
          fechaHora: pago.fechaHora || null,
          link: localize(`/ventas/${venta.id}`),
        });
      });
    });
    return list.sort((a, b) => (toDate(b.fechaHora)?.getTime() || 0) - (toDate(a.fechaHora)?.getTime() || 0));
  }, [ventas, localize]);

  const total = ingresos.reduce((sum, ingreso) => sum + ingreso.monto, 0);
  const ingresosRecientes = ingresos;

  return (
    <section className="overflow-hidden rounded-xl border border-border/70 bg-card" aria-label="Caja de hoy">
      <div className="grid min-w-0 grid-cols-1 lg:grid-cols-[minmax(220px,0.85fr)_minmax(420px,2.2fr)_minmax(210px,0.9fr)]">
        <div className="flex min-w-0 items-center gap-3 border-b border-border/70 px-4 py-4 sm:px-5 lg:border-b-0 lg:border-r">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground">
            <Wallet className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="text-xs font-medium text-muted-foreground sm:text-[13px]">Caja (Hoy)</div>
            <div className="mt-0.5 text-2xl font-semibold tracking-tight tabular-nums text-foreground">{loading ? "…" : `$${nf.format(Math.round(total))}`}</div>
            <div className="text-xs text-muted-foreground">{loading ? "Cargando ingresos" : `${ingresos.length} ${ingresos.length === 1 ? "ingreso registrado" : "ingresos registrados"}`}</div>
          </div>
        </div>

        <div className="min-w-0 border-b border-border/70 lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between gap-3 px-4 pb-1 pt-3 sm:px-5">
            <h2 className="text-sm font-semibold tracking-tight text-foreground">Últimos ingresos de hoy</h2>
            <button type="button" className="inline-flex h-8 items-center gap-2 rounded-full border border-border px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setExpanded((previous) => !previous)} aria-expanded={expanded} aria-controls="cash-today-entries">
              {expanded ? "Ocultar" : "Ver ingresos"}
              {expanded ? <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" /> : <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />}
            </button>
          </div>
          {expanded && (
            <div id="cash-today-entries" className="px-4 pb-3 sm:px-5">
              {loading ? (
                <p className="py-6 text-sm text-muted-foreground" role="status">Cargando ingresos…</p>
              ) : error ? (
                <p className="py-6 text-sm text-muted-foreground" role="alert">No se pudieron cargar los ingresos. Volvé a intentarlo más tarde.</p>
                ) : ingresosRecientes.length === 0 ? (
                  <p className="py-6 text-sm text-muted-foreground">Todavía no hay ingresos registrados hoy.</p>
                ) : (
                  <>
                    <div className="hidden grid-cols-[64px_minmax(160px,1.5fr)_minmax(90px,0.8fr)_minmax(110px,0.9fr)] gap-3 border-b border-border/70 py-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground md:grid">
                      <span>Hora</span><span>Concepto</span><span className="text-right">Monto</span><span>Método</span>
                    </div>
                    <div
                      role="region"
                      aria-label="Todos los ingresos de hoy; lista desplazable"
                      tabIndex={0}
                      className="max-h-[13.5rem] overflow-y-auto overscroll-contain focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:max-h-48"
                    >
                      <ul className="divide-y divide-border/60">
                        {ingresosRecientes.map((item) => {
                          const { label: metodoLabel, Icon: MetodoIcon } = getMetodoInfo(item.metodo);
                          return (
                            <li key={item.key}>
                              <Link href={item.link} className="grid h-[6.75rem] grid-cols-1 gap-1 py-3 transition-colors hover:bg-muted/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:h-12 md:grid-cols-[64px_minmax(160px,1.5fr)_minmax(90px,0.8fr)_minmax(110px,0.9fr)] md:items-center md:gap-3 md:py-2">
                                <span className="text-xs tabular-nums text-muted-foreground">{formatHour(item.fechaHora)}</span>
                                <span className="min-w-0 truncate text-sm font-medium text-foreground">{item.referencia}{item.cliente ? ` · ${item.cliente.toLocaleUpperCase("es-AR")}` : ""}</span>
                                <span className="text-sm font-semibold tabular-nums text-foreground md:text-right">${nf.format(Math.round(item.monto))}</span>
                                <span className="inline-flex min-w-0 items-center gap-1.5 truncate text-xs text-muted-foreground">
                                  {MetodoIcon && <MetodoIcon className="h-4 w-4 shrink-0" aria-hidden="true" />}
                                  <span className="truncate">{metodoLabel}</span>
                                </span>
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  </>
                )}
            </div>
          )}
        </div>

        <aside className="flex flex-col justify-center gap-3 bg-muted/25 px-4 py-4 sm:px-5" aria-label="Resumen de caja">
          <div className="flex items-center justify-between gap-3 text-sm"><span className="text-muted-foreground">Ingresos</span><span className="font-semibold tabular-nums text-foreground">${loading ? "—" : nf.format(Math.round(total))}</span></div>
          <div className="flex items-center justify-between gap-3 border-t border-border/70 pt-3 text-sm"><span className="font-medium text-foreground">Saldo de caja</span><span className="text-lg font-semibold tracking-tight tabular-nums text-foreground">${loading ? "—" : nf.format(Math.round(total))}</span></div>
        </aside>
      </div>
    </section>
  );
};

export default CajaDelDia;
