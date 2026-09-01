"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Icon } from "@iconify/react";
import Link from "next/link";
import { useLocalizedPath } from "@/lib/utils";

const nf = new Intl.NumberFormat("es-AR");

// Cache simple en memoria del módulo para no re-leer Firestore en cada montaje.
const CACHE_MAX_AGE_MS = 2 * 60 * 1000;
let cacheRef = { data: null, ts: 0 };

const hoyIso = () => new Date().toISOString().split("T")[0];

const fechaComoIso = (valor) => {
  if (!valor) return null;
  if (typeof valor === "string") return valor.slice(0, 10);
  if (valor && typeof valor === "object" && typeof valor.seconds === "number") {
    return new Date(valor.seconds * 1000).toISOString().split("T")[0];
  }
  return null;
};

const isVentaAnulada = (v) =>
  String(v?.estado || "").toLowerCase() === "anulada" || v?.anulada === true;

const formatFechaHora = (valor) => {
  if (!valor) return null;
  let d = null;
  if (typeof valor === "object" && typeof valor.seconds === "number") {
    d = new Date(valor.seconds * 1000);
  } else if (valor instanceof Date) {
    d = valor;
  } else if (typeof valor === "string") {
    d = new Date(valor);
  }
  if (!d || Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

/**
 * Item "Caja": suma de todos los ingresos (pagos) de ventas registrados el día de hoy,
 * sin importar cuándo se creó la venta a la que pertenecen. Por ahora no incluye obras.
 */
const CajaDelDia = () => {
  const [loading, setLoading] = useState(true);
  const [ventas, setVentas] = useState([]);
  const [expanded, setExpanded] = useState(false);
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
        // Por ahora la Caja no incluye pagos de obras, solo ventas.
        const ventasSnap = await getDocs(collection(db, "ventas"));
        const ventasData = ventasSnap.docs.map((d) => ({ ...d.data(), id: d.id }));
        cacheRef = { data: { ventas: ventasData }, ts: Date.now() };
        setVentas(ventasData);
      } catch (error) {
        console.error("Error cargando datos de Caja:", error);
      } finally {
        setLoading(false);
      }
    };

    if (!fetchedRef.current) {
      fetchedRef.current = true;
      cargar();
    }
  }, []);

  const { total, ingresos } = useMemo(() => {
    const hoy = hoyIso();
    const lista = [];

    ventas.forEach((v) => {
      if (isVentaAnulada(v)) return;
      let pagosArr = Array.isArray(v.pagos) ? v.pagos : [];
      if ((!pagosArr || pagosArr.length === 0) && Number(v.montoAbonado) > 0) {
        pagosArr = [
          { monto: Number(v.montoAbonado), fecha: v.fecha || v.fechaCreacion, metodo: v.formaPago },
        ];
      }
      pagosArr.forEach((p, idx) => {
        if (fechaComoIso(p.fecha) !== hoy) return;
        const monto = Number(p.monto) || 0;
        if (monto <= 0) return;
        lista.push({
          key: `venta-${v.id}-${idx}`,
          monto,
          metodo: p.metodo || v.formaPago || "-",
          origen: "Venta",
          referencia: v.numeroPedido ? `Venta #${v.numeroPedido}` : `Venta ${String(v.id).slice(0, 6)}`,
          cliente: v.cliente?.nombre || "",
          fechaCreacion: formatFechaHora(v.fechaCreacion),
          fechaActualizacion: formatFechaHora(v.fechaActualizacion),
          link: localize(`/ventas/${v.id}`),
        });
      });
    });

    lista.sort((a, b) => b.monto - a.monto);
    const totalIngresos = lista.reduce((acc, item) => acc + item.monto, 0);
    return { total: totalIngresos, ingresos: lista };
  }, [ventas, localize]);

  return (
    <div className="rounded-2xl border border-border/60 bg-gradient-to-br from-teal-500/15 via-teal-500/10 to-cyan-500/10 shadow-lg backdrop-blur-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="w-full text-left p-4 md:p-5 flex items-center justify-between gap-3 transition-colors hover:bg-teal-500/5"
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-3">
          <span className="inline-flex w-9 h-9 md:w-10 md:h-10 items-center justify-center rounded-xl bg-teal-500/15 text-teal-600 dark:text-teal-400">
            <Icon icon="heroicons:banknotes" className="w-4 h-4 md:w-5 md:h-5" />
          </span>
          <div>
            <div className="text-xs md:text-sm font-semibold text-teal-700 dark:text-teal-300">
              Caja (Hoy)
            </div>
            <div className="text-lg md:text-2xl font-extrabold tracking-tight">
              {loading ? "..." : `$${nf.format(Math.round(total))}`}
            </div>
            {!loading && (
              <div className="text-[10px] md:text-xs text-default-500 mt-0.5">
                {ingresos.length} {ingresos.length === 1 ? "ingreso" : "ingresos"} registrados hoy
              </div>
            )}
          </div>
        </div>
        <Icon
          icon={expanded ? "heroicons:chevron-up" : "heroicons:chevron-down"}
          className="w-5 h-5 text-teal-600 dark:text-teal-400 shrink-0"
        />
      </button>
      {expanded && (
        <div className="border-t border-border/60 bg-card/60 max-h-80 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-sm text-default-500">Cargando ingresos...</div>
          ) : ingresos.length === 0 ? (
            <div className="p-4 text-sm text-default-500">Todavía no hay ingresos registrados hoy.</div>
          ) : (
            <ul className="divide-y divide-border/60">
              {ingresos.map((item) => (
                <li key={item.key}>
                  <Link
                    href={item.link}
                    className="flex items-center justify-between gap-3 p-3 md:p-4 hover:bg-teal-500/5 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-default-900 truncate">
                        {item.referencia}
                        {item.cliente ? ` · ${item.cliente}` : ""}
                      </div>
                      <div className="text-[11px] md:text-xs text-default-500">
                        {item.origen} · {item.metodo}
                      </div>
                      {(item.fechaCreacion || item.fechaActualizacion) && (
                        <div className="text-[10px] md:text-[11px] text-default-400 mt-0.5">
                          {item.fechaCreacion && <>Creada: {item.fechaCreacion}</>}
                          {item.fechaCreacion && item.fechaActualizacion ? " · " : ""}
                          {item.fechaActualizacion && <>Modificada: {item.fechaActualizacion}</>}
                        </div>
                      )}
                    </div>
                    <div className="text-sm md:text-base font-bold text-teal-700 dark:text-teal-300 whitespace-nowrap">
                      ${nf.format(Math.round(item.monto))}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

export default CajaDelDia;
