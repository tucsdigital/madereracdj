"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Icon } from "@iconify/react";
import { useDateRange } from "../context/date-range-context";
import { useDashboardData } from "../context/dashboard-data-context";
import { useAuth } from "@/provider/auth.provider";
import { db } from "@/lib/firebase";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import Link from "next/link";

const SalesStats = () => {
  const { fechaDesde, fechaHasta, rangoRapido, setFechaDesde, setFechaHasta, setRangoRapido, isInRange } = useDateRange();
  const { ventas: ventasFiltradas, presupuestos: presupuestosFiltrados, obras: obrasFromContext, clientes: clientesData, loading } = useDashboardData();
  const { user } = useAuth();

  const getPrevMonthKey = useCallback(() => {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + 1;
    const prev = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
    return `${String(prev.year).padStart(4, "0")}-${String(prev.month).padStart(2, "0")}`;
  }, []);

  const [reportMonth, setReportMonth] = useState(() => getPrevMonthKey());
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState("");
  const [reportDoc, setReportDoc] = useState(null);
  const [backfillLoading, setBackfillLoading] = useState(false);
  const [backfillResult, setBackfillResult] = useState(null);
  const [obrasPendMes, setObrasPendMes] = useState([]);
  const [obrasPendLoading, setObrasPendLoading] = useState(false);

  const COMMISSION_RATE = 2.5; // % comisión fija para todos los clientes
  const OBRAS_COMMISSION_RATE = 2.5; // % comisión fija para obras

  // Datos del contexto (ya filtrados por rango de fechas)
  const obrasFiltradas = useMemo(() => {
    return (obrasFromContext || []).filter((o) => o.tipo === "obra");
  }, [obrasFromContext]);

  // Obras confirmadas: solo en_ejecucion y completada (para cálculo de comisiones)
  const obrasConfirmadas = useMemo(() => {
    return obrasFiltradas.filter(
      (o) => o.estado === "en_ejecucion" || o.estado === "completada"
    );
  }, [obrasFiltradas]);

  const kpis = useMemo(() => {
    const ventasCount = ventasFiltradas.length;
    const ventasMonto = ventasFiltradas.reduce(
      (acc, v) => acc + (Number(v.total) || 0),
      0
    );
    const ticketPromedio = ventasCount > 0 ? ventasMonto / ventasCount : 0;

    let cobranzasIngresado = 0;
    let cobranzasPendiente = 0;
    let cobranzasParcialPendiente = 0;
    let cobranzasAbonadoParcial = 0;
    let cobranzasPagadoTotal = 0;
    let cobranzasIngresadoPeriodo = 0;
    ventasFiltradas.forEach((v) => {
      const total = Number(v.total) || 0;
      let pagosArr = Array.isArray(v.pagos) ? v.pagos : [];
      if ((!pagosArr || pagosArr.length === 0) && Number(v.montoAbonado)) {
        pagosArr = [{ monto: Number(v.montoAbonado) }];
      }
      const abonado = pagosArr.reduce((s, p) => s + (Number(p.monto) || 0), 0);
      pagosArr.forEach((p) => {
        const f = p.fecha;
        if (f && isInRange(f)) {
          cobranzasIngresadoPeriodo += Number(p.monto) || 0;
        }
      });
      let estado = String(v.estadoPago || "").toLowerCase();
      if (!estado) {
        if (abonado >= total && total > 0) estado = "pagado";
        else if (abonado > 0 && abonado < total) estado = "parcial";
        else estado = "pendiente";
      }
      cobranzasIngresado += abonado;
      if (estado === "pagado") {
        cobranzasPagadoTotal += total;
      } else if (estado === "pendiente") {
        cobranzasPendiente += total;
      } else if (estado === "parcial") {
        const saldo = Math.max(total - abonado, 0);
        cobranzasParcialPendiente += saldo;
        cobranzasAbonadoParcial += abonado;
      }
    });
    const pendienteParcialTotal = cobranzasPendiente + cobranzasParcialPendiente;

    // Calcular totales de obras (todas las filtradas)
    const obrasCount = obrasFiltradas.length;
    const obrasMonto = obrasFiltradas.reduce((acc, o) => {
      // Calcular total de la obra
      const total =
        Number(o.total) ||
        Number(o.subtotal) ||
        (Number(o.productosTotal) || 0) +
          (Number(o.materialesTotal) || 0) +
          (Number(o.gastoObraManual) || 0) +
          (Number(o.costoEnvio) || 0) -
          (Number(o.descuentoTotal) || 0);
      return acc + total;
    }, 0);

    // Calcular comisión solo sobre obras confirmadas
    const obrasMontoConfirmadas = obrasConfirmadas.reduce((acc, o) => {
      // Calcular total de la obra
      const total =
        Number(o.total) ||
        Number(o.subtotal) ||
        (Number(o.productosTotal) || 0) +
          (Number(o.materialesTotal) || 0) +
          (Number(o.gastoObraManual) || 0) +
          (Number(o.costoEnvio) || 0) -
          (Number(o.descuentoTotal) || 0);
      return acc + total;
    }, 0);
    const obrasComision = obrasMontoConfirmadas * (OBRAS_COMMISSION_RATE / 100);

    const estados = ventasFiltradas.reduce(
      (acc, v) => {
        const e = (v.estadoPago || "").toLowerCase();
        if (e === "pagado") acc.pagado += 1;
        else if (e === "parcial") acc.parcial += 1;
        else acc.pendiente += 1;
        return acc;
      },
      { pagado: 0, parcial: 0, pendiente: 0 }
    );

    const envios = ventasFiltradas.reduce(
      (acc, v) => {
        const t = v.tipoEnvio || "";
        if (t === "envio_domicilio") acc.domicilio += 1;
        else if (t === "retiro_local") acc.retiro += 1;
        else acc.otro += 1;
        return acc;
      },
      { domicilio: 0, retiro: 0, otro: 0 }
    );

    const formasPago = ventasFiltradas.reduce((acc, v) => {
      const f = (v.formaPago || "-").toLowerCase();
      acc[f] = (acc[f] || 0) + 1;
      return acc;
    }, {});

    const prodMap = new Map();
    ventasFiltradas.forEach((v) => {
      const lineas =
        Array.isArray(v.productos) && v.productos.length > 0
          ? v.productos
          : v.items || [];
      lineas.forEach((l) => {
        const key = l.id || l.nombre || "sin-id";
        const prev = prodMap.get(key) || {
          nombre: l.nombre || key,
          unidades: 0,
          monto: 0,
        };
        const unidades = Number(l.cantidad) || 0;
        const montoLinea = (() => {
          if (typeof l.subtotal === "number") return l.subtotal;
          const precio = Number(l.precio) || 0;
          if (
            l.categoria === "Maderas" &&
            (l.subcategoria === "machimbre" || l.subcategoria === "deck")
          ) {
            return precio;
          }
          return precio * (unidades || 1);
        })();
        prev.unidades += unidades;
        prev.monto += montoLinea;
        prodMap.set(key, prev);
      });
    });
    const topProductos = Array.from(prodMap.values())
      .sort((a, b) => b.monto - a.monto)
      .slice(0, 5);

    const presupuestosCount = presupuestosFiltrados.length;
    const conversionAprox =
      presupuestosCount > 0 ? (ventasCount / presupuestosCount) * 100 : 0;

    return {
      ventasCount,
      ventasMonto,
      ticketPromedio,
      estados,
      envios,
      formasPago,
      topProductos,
      presupuestosCount,
      conversionAprox,
      obrasCount,
      obrasMonto,
      obrasComision,
      cobranzasIngresado,
      cobranzasPendiente,
      cobranzasParcialPendiente,
      cobranzasAbonadoParcial,
      cobranzasPagadoTotal,
      pendienteParcialTotal,
      cobranzasIngresadoPeriodo,
    };
  }, [
    ventasFiltradas,
    presupuestosFiltrados,
    obrasFiltradas,
    obrasConfirmadas,
    OBRAS_COMMISSION_RATE,
  ]);

  const nf = useMemo(() => new Intl.NumberFormat("es-AR"), []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setReportError("");
      try {
        const snap = await getDoc(doc(db, "reportes_mensuales", reportMonth));
        if (cancelled) return;
        if (!snap.exists()) {
          setReportDoc(null);
          return;
        }
        setReportDoc({ id: snap.id, ...(snap.data() || {}) });
      } catch (e) {
        if (cancelled) return;
        setReportDoc(null);
        setReportError(e?.message || "Error cargando reporte");
      }
    };
    if (reportMonth) load();
    return () => {
      cancelled = true;
    };
  }, [reportMonth]);

  useEffect(() => {
    let cancelled = false;
    const loadObras = async () => {
      setObrasPendLoading(true);
      try {
        const [y, m] = String(reportMonth || "").split("-").map((n) => Number(n));
        if (!y || !m) {
          setObrasPendMes([]);
          return;
        }
        const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
        const end = new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1, 0, 0, 0));
        const qRef = query(collection(db, "obras"), where("tipo", "==", "obra"));
        const snap = await getDocs(qRef);
        if (cancelled) return;
        const toMs = (v) => {
          const raw = String(v || "").trim();
          if (!raw) return NaN;
          if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return Date.parse(`${raw}T00:00:00-03:00`);
          const ms = Date.parse(raw);
          return Number.isFinite(ms) ? ms : NaN;
        };
        const startMs = start.getTime();
        const endMs = end.getTime();
        const arr = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() || {}) }))
          .filter((o) => {
            const ms = toMs(o.fechaCreacion);
            return Number.isFinite(ms) && ms >= startMs && ms < endMs;
          })
          .filter((o) => {
            const e = String(o.estado || "").toLowerCase();
            return !(e === "en_ejecucion" || e === "completada");
          })
          .sort((a, b) => toMs(a.fechaCreacion) - toMs(b.fechaCreacion));
        setObrasPendMes(arr);
      } catch (e) {
        setObrasPendMes([]);
      } finally {
        if (!cancelled) setObrasPendLoading(false);
      }
    };
    if (reportMonth && user?.email === "admin@admin.com") loadObras();
    else {
      setObrasPendMes([]);
    }
    return () => {
      cancelled = true;
    };
  }, [reportMonth, user?.email]);

  const handleGenerateMonthlyReport = useCallback(async () => {
    setReportError("");
    setReportLoading(true);
    try {
      if (!user) throw new Error("Necesitás iniciar sesión");
      const token = await user.getIdToken();
      const res = await fetch(`/api/reportes/mensual?month=${encodeURIComponent(reportMonth)}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || "No se pudo generar el reporte");
      }
      const snap = await getDoc(doc(db, "reportes_mensuales", reportMonth));
      if (snap.exists()) setReportDoc({ id: snap.id, ...(snap.data() || {}) });
      else setReportDoc(null);
    } catch (e) {
      setReportError(e?.message || "Error generando reporte");
    } finally {
      setReportLoading(false);
    }
  }, [reportMonth, user]);

  const handleBackfillPagados = useCallback(async () => {
    setReportError("");
    setBackfillResult(null);
    setBackfillLoading(true);
    try {
      if (!user) throw new Error("Necesitás iniciar sesión");
      const token = await user.getIdToken();
      const res = await fetch("/api/ventas/pago-events/backfill", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ limit: 500, dryRun: false }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "No se pudo ejecutar el backfill");
      setBackfillResult(json);
    } catch (e) {
      setReportError(e?.message || "Error ejecutando backfill");
    } finally {
      setBackfillLoading(false);
    }
  }, [user]);

  // Visual helpers
  const totalFormasPago = useMemo(() => {
    return Object.values(kpis.formasPago || {}).reduce(
      (acc, n) => acc + (Number(n) || 0),
      0
    );
  }, [kpis.formasPago]);

  const estadosTotal =
    kpis.estados.pagado + kpis.estados.parcial + kpis.estados.pendiente;
  const enviosTotal =
    kpis.envios.domicilio + kpis.envios.retiro + kpis.envios.otro;

  const conversionPct = useMemo(() => {
    const raw = Number.isFinite(kpis.conversionAprox)
      ? kpis.conversionAprox
      : 0;
    return Math.max(0, Math.min(100, Math.round(raw)));
  }, [kpis.conversionAprox]);
  const conversionLabel = useMemo(
    () => Math.round(Number(kpis.conversionAprox) || 0),
    [kpis.conversionAprox]
  );

  const palette = [
    "#22c55e",
    "#3b82f6",
    "#f59e0b",
    "#ef4444",
    "#8b5cf6",
    "#06b6d4",
    "#84cc16",
  ];
  const fpSegments = useMemo(() => {
    const entries = Object.entries(kpis.formasPago || {});
    const sorted = entries.sort(
      (a, b) => (Number(b[1]) || 0) - (Number(a[1]) || 0)
    );
    let offset = 0;
    const segments = sorted.map(([label, value], idx) => {
      const val = Number(value) || 0;
      const pct = totalFormasPago ? (val / totalFormasPago) * 100 : 0;
      const seg = {
        label,
        value: val,
        pct,
        offset,
        color: palette[idx % palette.length],
      };
      offset += pct;
      return seg;
    });
    return segments;
  }, [kpis.formasPago, totalFormasPago]);

  const estadosSegments = useMemo(() => {
    return [
      { label: "Pagado", value: kpis.estados.pagado || 0, color: "#10b981" },
      { label: "Parcial", value: kpis.estados.parcial || 0, color: "#f59e0b" },
      {
        label: "Pendiente",
        value: kpis.estados.pendiente || 0,
        color: "#ef4444",
      },
    ];
  }, [kpis.estados.pagado, kpis.estados.parcial, kpis.estados.pendiente]);

  const enviosSegments = useMemo(() => {
    return [
      {
        label: "Domicilio",
        value: kpis.envios.domicilio || 0,
        color: "#3b82f6",
      },
      { label: "Retiro", value: kpis.envios.retiro || 0, color: "#6366f1" },
      { label: "Otro", value: kpis.envios.otro || 0, color: "#64748b" },
    ];
  }, [kpis.envios.domicilio, kpis.envios.retiro, kpis.envios.otro]);

  // Clientes nuevos vs viejos (solo clientes que aparecen en ventas del rango)
  const clientesCounts = useMemo(() => {
    let nuevo = 0;
    let viejo = 0;
    const ids = new Set(
      (ventasFiltradas || []).map((v) => v.clienteId).filter(Boolean)
    );
    ids.forEach((id) => {
      const c = clientesData[id];
      if (!c) return;
      if (c.esClienteViejo) viejo += 1;
      else nuevo += 1;
    });
    return { nuevo, viejo };
  }, [ventasFiltradas, clientesData]);

  const clientesTotal = useMemo(
    () => clientesCounts.nuevo + clientesCounts.viejo,
    [clientesCounts]
  );

  const clientesSegments = useMemo(() => {
    return [
      { label: "Nuevos", value: clientesCounts.nuevo || 0, color: "#14b8a6" },
      { label: "Viejos", value: clientesCounts.viejo || 0, color: "#f97316" },
    ];
  }, [clientesCounts]);

  // Comisión sobre ventas (2.5% para todos los clientes)
  const comisionesPorTipoCliente = useMemo(() => {
    const basePagada = Number(kpis.cobranzasPagadoTotal) || 0;
    const baseCobrosPeriodo = Number(kpis.cobranzasIngresadoPeriodo) || 0;
    const comisionPagado = basePagada * (COMMISSION_RATE / 100);
    const comisionCobrosPeriodo = baseCobrosPeriodo * (COMMISSION_RATE / 100);
    return { comisionPagado, comisionCobrosPeriodo };
  }, [kpis.cobranzasPagadoTotal, kpis.cobranzasIngresadoPeriodo, COMMISSION_RATE]);

  // Eliminar cálculos anteriores que ya no se usan
  // const totalVendidoClientesNuevos = useMemo(() => {
  //   const idsNuevos = new Set(
  //     Object.entries(clientesData)
  //       .filter(([_, c]) => !c.esClienteViejo)
  //       .map(([id]) => id)
  //   );
  //   return ventasFiltradas
  //     .filter((v) => v.clienteId && idsNuevos.has(v.clienteId))
  //     .reduce((acc, v) => acc + (Number(v.total) || 0), 0);
  // }, [ventasFiltradas, clientesData]);

  // const ventasProporcionalesNuevos = useMemo(() => {
  //   const total = Number(kpis.ventasMonto) || 0;
  //   const propor = clientesTotal > 0 ? (clientesCounts.nuevo / clientesTotal) : 0;
  //   return total * propor;
  // }, [kpis.ventasMonto, clientesTotal, clientesCounts.nuevo]);

  // const comisionClientesNuevos = useMemo(() => {
  //   return ventasProporcionalesNuevos * 0.008;
  // }, [ventasProporcionalesNuevos]);

  const Chart = useMemo(
    () => dynamic(() => import("react-apexcharts"), { ssr: false }),
    []
  );

  // Apex options
  const conversionOptions = useMemo(
    () => ({
      chart: { toolbar: { show: false } },
      labels: ["Convertido", "Restante"],
      stroke: { width: 0 },
      legend: { show: false },
      dataLabels: { enabled: false },
      colors: ["#10b981", "#e5e7eb"],
      plotOptions: {
        pie: {
          donut: {
            size: "70%",
            labels: {
              show: true,
              name: { show: false },
              value: { show: false },
              total: {
                show: true,
                label: "",
                formatter: () => `${conversionPct}%`,
              },
            },
          },
        },
      },
    }),
    [conversionPct]
  );

  const estadosOptions = useMemo(
    () => ({
      chart: { toolbar: { show: false } },
      labels: estadosSegments.map((s) => s.label.toUpperCase()),
      stroke: { width: 0 },
      legend: { show: false },
      dataLabels: { enabled: false },
      colors: estadosSegments.map((s) => s.color),
      plotOptions: {
        pie: {
          donut: {
            size: "78%",
            labels: {
              show: true,
              name: { show: false },
              value: { show: false },
              total: {
                show: true,
                label: "Total",
                formatter: () => `${estadosTotal}`,
              },
            },
          },
        },
      },
    }),
    [estadosSegments, estadosTotal]
  );

  const enviosOptions = useMemo(
    () => ({
      chart: { toolbar: { show: false } },
      labels: enviosSegments.map((s) => s.label.toUpperCase()),
      stroke: { width: 0 },
      legend: { show: false },
      dataLabels: { enabled: false },
      colors: enviosSegments.map((s) => s.color),
      plotOptions: {
        pie: {
          donut: {
            size: "78%",
            labels: {
              show: true,
              name: { show: false },
              value: { show: false },
              total: {
                show: true,
                label: "Total",
                formatter: () => `${enviosTotal}`,
              },
            },
          },
        },
      },
    }),
    [enviosSegments, enviosTotal]
  );

  const clientesOptions = useMemo(
    () => ({
      chart: { toolbar: { show: false } },
      labels: clientesSegments.map((s) => s.label.toUpperCase()),
      stroke: { width: 0 },
      legend: { show: false },
      dataLabels: { enabled: false },
      colors: clientesSegments.map((s) => s.color),
      plotOptions: {
        pie: {
          donut: {
            size: "78%",
            labels: {
              show: true,
              name: { show: false },
              value: { show: false },
              total: {
                show: true,
                label: "Total",
                formatter: () => `${clientesTotal}`,
              },
            },
          },
        },
      },
    }),
    [clientesSegments, clientesTotal]
  );

  const formasPagoOptions = useMemo(
    () => ({
      chart: { toolbar: { show: false } },
      labels: fpSegments.map((s) => s.label.toUpperCase()),
      stroke: { width: 0 },
      legend: { show: false },
      dataLabels: { enabled: false },
      colors: fpSegments.map((s) => s.color),
      plotOptions: {
        pie: {
          donut: {
            size: "78%",
            labels: {
              show: true,
              name: { show: false },
              value: { show: false },
              total: {
                show: true,
                label: "Total",
                formatter: () => `${totalFormasPago}`,
              },
            },
          },
        },
      },
    }),
    [fpSegments, totalFormasPago]
  );

  const QuickRangeButton = ({ value, label, icon }) => (
    <button
      type="button"
      onClick={() => setRangoRapido(value)}
      className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-md backdrop-blur-sm ${
        rangoRapido === value
          ? "bg-gradient-to-r from-slate-600 to-gray-600 text-white border-0 shadow-lg scale-105"
          : "bg-white/60 border-0 text-default-700 hover:bg-white/80 hover:shadow-lg hover:scale-[1.02]"
      }`}
      aria-pressed={rangoRapido === value}
    >
      {icon ? <Icon icon={icon} className="w-3.5 h-3.5" /> : null}
      {label}
    </button>
  );

  const Skeleton = () => (
    <div className="space-y-4">
      {/* Skeletons para KPI Cards (Ventas, Monto, Ticket, Presup.) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {[
          { gradient: "from-primary/20 via-primary/10 to-primary/5", iconBg: "bg-primary/15" },
          { gradient: "from-emerald-100/80 via-emerald-50/60 to-green-50/80", iconBg: "bg-emerald-500/15" },
          { gradient: "from-indigo-100/80 via-indigo-50/60 to-purple-50/80", iconBg: "bg-indigo-500/15" },
          { gradient: "from-amber-100/80 via-amber-50/60 to-yellow-50/80", iconBg: "bg-amber-500/15" },
        ].map((style, i) => (
          <div
            key={i}
            className={`relative p-4 md:p-5 rounded-2xl border-0 bg-gradient-to-br ${style.gradient} shadow-lg backdrop-blur-sm overflow-hidden animate-pulse`}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-white/30 via-transparent to-transparent pointer-events-none" />
            <div className="relative flex items-center justify-between mb-2">
              <div className="h-3 md:h-3.5 w-16 md:w-20 bg-white/60 rounded-lg" />
              <div className={`w-6 h-6 md:w-8 md:h-8 rounded-md ${style.iconBg} bg-white/40`} />
            </div>
            <div className="relative h-6 md:h-8 lg:h-9 w-20 md:w-24 bg-white/50 rounded-xl mt-2" />
          </div>
        ))}
      </div>

      {/* Skeletons para Comisiones Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
        {[
          { gradient: "from-fuchsia-100/80 via-fuchsia-50/60 to-pink-50/80", iconBg: "bg-fuchsia-500/15" },
          { gradient: "from-blue-100/80 via-blue-50/60 to-cyan-50/80", iconBg: "bg-blue-500/15" },
          { gradient: "from-orange-100/80 via-orange-50/60 to-amber-50/80", iconBg: "bg-orange-500/15" },
        ].map((style, i) => (
          <div
            key={i}
            className={`relative p-4 md:p-5 rounded-2xl border-0 bg-gradient-to-br ${style.gradient} shadow-lg backdrop-blur-sm overflow-hidden animate-pulse`}
          >
            <div className="absolute inset-0 bg-gradient-to-br from-white/30 via-transparent to-transparent pointer-events-none" />
            <div className="relative flex items-center justify-between mb-2">
              <div className="h-3 md:h-3.5 w-24 md:w-28 bg-white/60 rounded-lg" />
              <div className={`w-6 h-6 md:w-8 md:h-8 rounded-md ${style.iconBg} bg-white/40`} />
            </div>
            <div className="relative h-6 md:h-7 lg:h-8 w-28 md:w-32 bg-white/50 rounded-xl mt-2" />
            <div className="relative h-2.5 md:h-3 w-32 md:w-36 bg-white/40 rounded-lg mt-2" />
          </div>
        ))}
      </div>

      {/* Skeletons para Donut Charts */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="relative p-4 md:p-5 rounded-2xl border-0 bg-white/60 shadow-lg backdrop-blur-sm overflow-hidden animate-pulse"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-white/40 via-transparent to-transparent pointer-events-none" />
            {/* Título */}
            <div className="relative h-3.5 md:h-4 w-28 md:w-32 bg-white/60 rounded-lg mb-3" />
            {/* Gráfico circular */}
            <div className="relative flex flex-col items-center gap-3">
              <div className="w-full max-w-[120px] h-[120px] sm:max-w-[140px] sm:h-[140px] rounded-full bg-gradient-to-br from-white/50 to-white/30 border-4 border-white/40 flex items-center justify-center">
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-white/40" />
              </div>
              {/* Leyenda */}
              <div className="flex-1 w-full grid grid-cols-1 gap-2">
                {[1, 2, 3].map((j) => (
                  <div key={j} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 md:w-2.5 md:h-2.5 rounded-full bg-white/50" />
                      <div className="h-3 md:h-3.5 w-16 md:w-20 bg-white/50 rounded" />
                    </div>
                    <div className="h-3 md:h-3.5 w-12 md:w-16 bg-white/50 rounded" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <Card className="relative rounded-3xl shadow-2xl border-0 overflow-hidden bg-gradient-to-br from-slate-50/80 via-gray-50/60 to-zinc-50/80">
      <div className="absolute inset-0 bg-gradient-to-br from-white/40 via-transparent to-transparent pointer-events-none" />
      <CardHeader className="relative pb-4 pt-6 px-6 border-0 bg-transparent">
        <div className="flex flex-col gap-4">
          <CardTitle className="text-xl md:text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-slate-600 via-gray-600 to-zinc-600 flex items-center gap-3">
            <div className="p-2 rounded-2xl bg-gradient-to-br from-slate-200/50 to-gray-200/50 shadow-lg">
              <Icon
                icon="heroicons:chart-bar"
                className="w-5 h-5 md:w-6 md:h-6 text-slate-600"
              />
            </div>
            Estadísticas de Ventas
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <QuickRangeButton
              value="month"
              label="Mes"
              icon="heroicons:calendar-days"
            />
            <QuickRangeButton value="7d" label="7d" icon="heroicons:bolt" />
            <QuickRangeButton
              value="30d"
              label="30d"
              icon="heroicons:calendar-days"
            />
            <QuickRangeButton value="90d" label="90d" icon="heroicons:clock" />
            <QuickRangeButton
              value="ytd"
              label="YTD"
              icon="heroicons:chart-pie"
            />
            <QuickRangeButton
              value="custom"
              label="Custom"
              icon="heroicons:adjustments-horizontal"
            />
          </div>
        </div>
        {rangoRapido === "custom" && (
          <div className="mt-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-default-600 whitespace-nowrap font-medium">
                Desde
              </span>
              <input
                type="date"
                value={fechaDesde}
                onChange={(e) => setFechaDesde(e.target.value)}
                className="border-0 rounded-xl px-3 py-2 h-9 flex-1 sm:flex-initial w-full sm:w-auto bg-white/60 shadow-md backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-slate-400/50"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-default-600 whitespace-nowrap font-medium">
                Hasta
              </span>
              <input
                type="date"
                value={fechaHasta}
                onChange={(e) => setFechaHasta(e.target.value)}
                className="border-0 rounded-xl px-3 py-2 h-9 flex-1 sm:flex-initial w-full sm:w-auto bg-white/60 shadow-md backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-slate-400/50"
              />
            </div>
          </div>
        )}
      </CardHeader>
      <CardContent className="relative pt-2 px-6 pb-6 space-y-4">
        {loading ? (
          <Skeleton />
        ) : (
          <>
            {user?.email === "admin@admin.com" && (
            <div className="p-4 md:p-5 rounded-2xl border-0 bg-white/60 shadow-lg backdrop-blur-sm">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="inline-flex w-8 h-8 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                    <Icon icon="heroicons:document-text" className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-sm font-extrabold text-slate-900">Reporte mensual (día 1)</div>
                    <div className="text-xs text-default-600">Se guarda en Firebase (reportes_mensuales)</div>
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                  <input
                    type="month"
                    value={reportMonth}
                    onChange={(e) => setReportMonth(e.target.value)}
                    className="border-0 rounded-xl px-3 py-2 h-9 bg-white/70 shadow-md backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-slate-400/50"
                  />
                  <button
                    type="button"
                    onClick={handleGenerateMonthlyReport}
                    disabled={reportLoading || !reportMonth}
                    className={`inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-bold shadow-md transition-all ${
                      reportLoading
                        ? "bg-slate-200 text-slate-500 cursor-not-allowed"
                        : "bg-gradient-to-r from-slate-700 to-gray-700 text-white hover:shadow-lg"
                    }`}
                  >
                    {reportLoading ? "Generando..." : "Generar"}
                  </button>
                  {user?.email === "admin@admin.com" && (
                    <button
                      type="button"
                      onClick={handleBackfillPagados}
                      disabled={backfillLoading}
                      className={`inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-bold shadow-md transition-all ${
                        backfillLoading
                          ? "bg-amber-100 text-amber-800 cursor-not-allowed"
                          : "bg-amber-200/70 text-amber-900 hover:shadow-lg"
                      }`}
                    >
                      {backfillLoading ? "Backfill..." : "Backfill pagados"}
                    </button>
                  )}
                </div>
              </div>

              {reportError ? (
                <div className="mt-3 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                  {reportError}
                </div>
              ) : null}

              {backfillResult ? (
                <div className="mt-3 text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                  Backfill: {backfillResult.created} creados, {backfillResult.skipped} ya existían (revisados: {backfillResult.checked})
                </div>
              ) : null}

              {reportDoc ? (
                <div className="mt-4 space-y-4">
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                    <div className="rounded-2xl bg-gradient-to-br from-emerald-50/90 to-green-50/70 p-5 shadow-sm border border-emerald-200/50">
                      <div className="text-[11px] font-bold uppercase tracking-wide text-emerald-700/90">Ventas</div>
                      <div className="mt-1 text-2xl font-extrabold text-emerald-800">
                        ${nf.format(Math.round(Number(reportDoc?.kpis?.ventas?.monto || 0)))}
                      </div>
                      <div className="mt-2 text-xs text-emerald-700/90">
                        Total: {Number(reportDoc?.kpis?.ventas?.count || 0)} | Pagadas: {Number(reportDoc?.kpis?.ventas?.estados?.pagado || 0)} | Parciales: {Number(reportDoc?.kpis?.ventas?.estados?.parcial || 0)} | Pendientes: {Number(reportDoc?.kpis?.ventas?.estados?.pendiente || 0)}
                      </div>
                      <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div className="text-[11px] font-semibold text-emerald-800 bg-white/60 rounded-xl px-3 py-2 border border-emerald-200/60">
                          <div className="uppercase tracking-wide text-emerald-700/80">Total pagado</div>
                          <div className="text-sm font-extrabold text-emerald-900">
                            ${nf.format(Math.round(Number(reportDoc?.kpis?.cobranzas?.pagadoTotal || 0)))}
                          </div>
                        </div>
                        <div className="text-[11px] font-semibold text-emerald-800 bg-white/60 rounded-xl px-3 py-2 border border-emerald-200/60">
                          <div className="uppercase tracking-wide text-emerald-700/80">Total pendiente (Pend+Parc)</div>
                          <div className="text-sm font-extrabold text-red-700">
                            ${nf.format(Math.round(Number(reportDoc?.kpis?.cobranzas?.pendienteParcialTotal || 0)))}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl bg-gradient-to-br from-sky-50/90 to-blue-50/70 p-5 shadow-sm border border-sky-200/50">
                      <div className="text-[11px] font-bold uppercase tracking-wide text-sky-700/90">Obras</div>
                      <div className="mt-1 text-2xl font-extrabold text-sky-800">
                        ${nf.format(Math.round(Number(reportDoc?.kpis?.obras?.monto || 0)))}
                      </div>
                      <div className="mt-2 text-xs text-sky-700/90">
                        Total: {Number(reportDoc?.kpis?.obras?.count || 0)} | Confirmadas: {Number(reportDoc?.kpis?.obras?.countConfirmadas || 0)} | Pendientes: {Math.max(0, Number(reportDoc?.kpis?.obras?.count || 0) - Number(reportDoc?.kpis?.obras?.countConfirmadas || 0))}
                      </div>
                      <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div className="text-[11px] font-semibold text-sky-800 bg-white/60 rounded-xl px-3 py-2 border border-sky-200/60">
                          <div className="uppercase tracking-wide text-sky-700/80">Total pagado</div>
                          <div className="text-sm font-extrabold text-sky-900">
                            ${nf.format(Math.round(Number(reportDoc?.kpis?.obras?.montoConfirmadas || 0)))}
                          </div>
                        </div>
                        <div className="text-[11px] font-semibold text-sky-800 bg-white/60 rounded-xl px-3 py-2 border border-sky-200/60">
                          <div className="uppercase tracking-wide text-sky-700/80">Total pendiente</div>
                          <div className="text-sm font-extrabold text-red-700">
                            ${nf.format(Math.round(Math.max(0, Number(reportDoc?.kpis?.obras?.monto || 0) - Number(reportDoc?.kpis?.obras?.montoConfirmadas || 0))))}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl bg-gradient-to-br from-amber-50/90 to-yellow-50/70 p-5 shadow-sm border border-amber-200/50">
                      <div className="text-[11px] font-bold uppercase tracking-wide text-amber-700/90">Comisiones</div>
                      <div className="mt-1 text-2xl font-extrabold text-amber-800">
                        ${nf.format(Math.round(Number(reportDoc?.kpis?.comisiones?.ventasConfirmadas || 0) + Number(reportDoc?.kpis?.comisiones?.obrasConfirmadas || 0)))}
                      </div>
                      <div className="mt-2 grid grid-cols-1 gap-2">
                        <div className="text-[11px] font-semibold text-amber-800 bg-white/60 rounded-xl px-3 py-2 border border-amber-200/60">
                          <div className="uppercase tracking-wide text-amber-700/80">Comisiones por ventas confirmadas</div>
                          <div className="text-sm font-extrabold text-amber-900">
                            ${nf.format(Math.round(Number(reportDoc?.kpis?.comisiones?.ventasConfirmadas || 0)))}
                          </div>
                        </div>
                        <div className="text-[11px] font-semibold text-amber-800 bg-white/60 rounded-xl px-3 py-2 border border-amber-200/60">
                          <div className="uppercase tracking-wide text-amber-700/80">Comisiones por obras confirmadas</div>
                          <div className="text-sm font-extrabold text-amber-900">
                            ${nf.format(Math.round(Number(reportDoc?.kpis?.comisiones?.obrasConfirmadas || 0)))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-white/70 border border-slate-200/70 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-extrabold text-slate-900">
                          Ventas pendientes / parciales (desde el 01)
                        </div>
                        <div className="text-xs font-semibold text-default-600">
                          {Number(reportDoc?.ventasPendientesParcialesCount || 0)} ventas
                        </div>
                      </div>
                      <div className="mt-3 overflow-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-left text-default-600">
                              <th className="py-2 pr-3 whitespace-nowrap">Pedido</th>
                              <th className="py-2 pr-3 whitespace-nowrap">Cliente</th>
                              <th className="py-2 pr-3 whitespace-nowrap">Estado</th>
                              <th className="py-2 pr-3 whitespace-nowrap">Saldo</th>
                              <th className="py-2 pr-3 whitespace-nowrap">Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(Array.isArray(reportDoc?.ventasPendientesParciales) ? reportDoc.ventasPendientesParciales : []).slice(0, 50).map((v) => (
                              <tr key={v.id} className="border-t border-slate-100">
                                <td className="py-2 pr-3">
                                  <Link className="font-semibold text-slate-800 hover:underline" href={`/ventas/${v.id}`}>
                                    {v.numeroPedido || v.id}
                                  </Link>
                                </td>
                                <td className="py-2 pr-3">{v.clienteNombre || "-"}</td>
                                <td className="py-2 pr-3 capitalize">{v.estadoPago}</td>
                                <td className="py-2 pr-3 font-semibold text-red-700">${nf.format(Math.round(Number(v.saldo || 0)))}</td>
                                <td className="py-2 pr-3">${nf.format(Math.round(Number(v.total || 0)))}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {Array.isArray(reportDoc?.ventasPendientesParciales) && reportDoc.ventasPendientesParciales.length > 50 ? (
                        <div className="mt-2 text-[11px] text-default-600">
                          Mostrando 50 de {reportDoc.ventasPendientesParciales.length}.
                        </div>
                      ) : null}
                    </div>

                    <div className="rounded-2xl bg-white/70 border border-slate-200/70 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-extrabold text-slate-900">
                          Obras pendientes a confirmar (desde el 01)
                        </div>
                        <div className="text-xs font-semibold text-default-600">
                          {obrasPendMes.length} obras
                        </div>
                      </div>
                      <div className="mt-3 overflow-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-left text-default-600">
                              <th className="py-2 pr-3 whitespace-nowrap">Obra</th>
                              <th className="py-2 pr-3 whitespace-nowrap">Cliente</th>
                              <th className="py-2 pr-3 whitespace-nowrap">Estado</th>
                              <th className="py-2 pr-3 whitespace-nowrap">Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(obrasPendMes || []).slice(0, 50).map((o) => (
                              <tr key={o.id} className="border-t border-slate-100">
                                <td className="py-2 pr-3">
                                  <Link className="font-semibold text-slate-800 hover:underline" href={`/obras/${o.id}`}>
                                    {o.numero || o.id}
                                  </Link>
                                </td>
                                <td className="py-2 pr-3">{o?.cliente?.nombre || "-"}</td>
                                <td className="py-2 pr-3 capitalize">{String(o.estado || "-").replaceAll("_", " ")}</td>
                                <td className="py-2 pr-3">${nf.format(Math.round(Number(o.total || o.subtotal || 0)))}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {obrasPendLoading ? (
                        <div className="mt-2 text-[11px] text-default-600">Cargando…</div>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-3 text-xs text-default-600">
                  No hay reporte guardado para {reportMonth}. Podés generarlo con el botón.
                </div>
              )}
            </div>
            )}

            <TooltipProvider delayDuration={200}>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
                {/* Ventas */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link href="/ventas" className="block">
                      <div className="p-4 md:p-5 rounded-2xl border-0 bg-gradient-to-br from-primary/20 via-primary/10 to-primary/5 shadow-lg backdrop-blur-sm hover:shadow-xl transition-all cursor-pointer transform hover:scale-[1.01]">
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-xs md:text-sm text-default-700">
                            Ventas
                          </div>
                          <span className="inline-flex w-6 h-6 md:w-8 md:h-8 items-center justify-center rounded-md bg-primary/15 text-primary">
                            <Icon
                              icon="heroicons:shopping-cart"
                              className="w-3 h-3 md:w-4 md:h-4"
                            />
                          </span>
                        </div>
                        <div className="text-xl md:text-3xl font-extrabold tracking-tight">
                          {kpis.ventasCount}
                        </div>
                      </div>
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" color="secondary">
                    <div className="space-y-2 text-xs sm:text-sm">
                      <div className="font-bold text-sm sm:text-base text-gray-900 dark:text-gray-100">
                        Total de ventas
                      </div>
                      <div className="text-gray-700 dark:text-gray-300">
                        En el período seleccionado
                      </div>
                      <div className="pt-2 mt-2 border-t border-gray-200/50 dark:border-gray-700/50">
                        <span className="text-primary dark:text-primary font-medium text-xs sm:text-sm">
                          Click para ver todas las ventas →
                        </span>
                      </div>
                    </div>
                  </TooltipContent>
                </Tooltip>
                {/* Monto */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="p-4 md:p-5 rounded-2xl border-0 bg-gradient-to-br from-emerald-100/80 via-emerald-50/60 to-green-50/80 shadow-lg backdrop-blur-sm cursor-help transition-all hover:scale-[1.01]">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-xs md:text-sm text-emerald-700 dark:text-emerald-300">
                          Total
                        </div>
                        <span className="inline-flex w-6 h-6 md:w-8 md:h-8 items-center justify-center rounded-md bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                          <Icon
                            icon="heroicons:banknotes"
                            className="w-3 h-3 md:w-4 md:h-4"
                          />
                        </span>
                      </div>
                      <div className="text-lg md:text-2xl lg:text-3xl font-extrabold tracking-tight break-all">
                        ${nf.format(Math.round(kpis.ventasMonto))}
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" color="secondary">
                    <div className="space-y-2 text-xs sm:text-sm">
                      <div className="font-bold text-sm sm:text-base text-gray-900 dark:text-gray-100">
                        Total del período
                      </div>
                      <div className="text-gray-700 dark:text-gray-300">
                        Suma de ventas completas, parciales y pendientes
                      </div>
                      <div className="pt-2 mt-2 border-t border-gray-200/50 dark:border-gray-700/50">
                        <div className="text-gray-600 dark:text-gray-400 text-xs">
                          <span className="font-medium">Ticket promedio:</span> ${nf.format(Math.round(kpis.ticketPromedio))}
                        </div>
                      </div>
                    </div>
                  </TooltipContent>
                </Tooltip>
                {/* Ticket */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="p-4 md:p-5 rounded-2xl border-0 bg-gradient-to-br from-indigo-100/80 via-indigo-50/60 to-purple-50/80 shadow-lg backdrop-blur-sm cursor-help transition-all hover:scale-[1.01]">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-xs md:text-sm text-indigo-700 dark:text-indigo-300">
                          Pagado (ventas)
                        </div>
                        <span className="inline-flex w-6 h-6 md:w-8 md:h-8 items-center justify-center rounded-md bg-indigo-500/15 text-indigo-600 dark:text-indigo-400">
                          <Icon
                            icon="heroicons:check-badge"
                            className="w-3 h-3 md:w-4 md:h-4"
                          />
                        </span>
                      </div>
                      <div className="text-lg md:text-2xl lg:text-3xl font-extrabold tracking-tight break-all">
                        ${nf.format(Math.round(kpis.cobranzasPagadoTotal))}
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" color="secondary">
                    <div className="space-y-2 text-xs sm:text-sm">
                      <div className="font-bold text-sm sm:text-base text-gray-900 dark:text-gray-100">
                        Ventas completamente pagadas
                      </div>
                      <div className="text-gray-700 dark:text-gray-300">
                        Monto total de ventas con estado pagado
                      </div>
                    </div>
                  </TooltipContent>
                </Tooltip>
                {/* Pendiente + Parciales */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="p-4 md:p-5 rounded-2xl border-0 bg-gradient-to-br from-amber-100/80 via-amber-50/60 to-yellow-50/80 shadow-lg backdrop-blur-sm transition-all hover:scale-[1.01]">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-xs md:text-sm text-amber-700 dark:text-amber-300">
                          Pendiente + Parciales
                        </div>
                        <span className="inline-flex w-6 h-6 md:w-8 md:h-8 items-center justify-center rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400">
                          <Icon
                            icon="heroicons:exclamation-circle"
                            className="w-3 h-3 md:w-4 md:h-4"
                          />
                        </span>
                      </div>
                      <div className="text-xl md:text-3xl font-extrabold tracking-tight">
                        ${nf.format(Math.round(kpis.pendienteParcialTotal))}
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" color="secondary">
                    <div className="space-y-2 text-xs sm:text-sm">
                      <div className="font-bold text-sm sm:text-base text-gray-900 dark:text-gray-100">
                        Suma de saldos
                      </div>
                      <div className="text-gray-700 dark:text-gray-300">
                        Incluye pendientes y el saldo de ventas parciales
                      </div>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </div>
            </TooltipProvider>

            

            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
              {/* Comisión por ventas */}
              <div className="p-4 md:p-5 rounded-2xl border-0 bg-gradient-to-br from-fuchsia-100/80 via-fuchsia-50/60 to-pink-50/80 shadow-lg backdrop-blur-sm transition-all hover:scale-[1.01]">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs md:text-sm text-fuchsia-700 dark:text-fuchsia-300">
                    Comisión Ventas
                  </div>
                  <span className="inline-flex w-6 h-6 md:w-8 md:h-8 items-center justify-center rounded-md bg-fuchsia-500/15 text-fuchsia-600 dark:text-fuchsia-400">
                    <Icon
                      icon="heroicons:currency-dollar"
                      className="w-3 h-3 md:w-4 md:h-4"
                    />
                  </span>
                </div>
                <div className="text-lg md:text-xl lg:text-2xl font-extrabold tracking-tight break-all">
                  ${nf.format(Math.round(comisionesPorTipoCliente.comisionPagado))}
                </div>
                <div className="text-[10px] md:text-xs text-default-500 mt-1">
                  2.5% sobre ventas pagadas
                </div>
              </div>

              {/* Total Obras */}
              <div className="p-4 md:p-5 rounded-2xl border-0 bg-gradient-to-br from-blue-100/80 via-blue-50/60 to-cyan-50/80 shadow-lg backdrop-blur-sm transition-all hover:scale-[1.01]">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs md:text-sm text-blue-700 dark:text-blue-300">
                    Total Obras
                  </div>
                  <span className="inline-flex w-6 h-6 md:w-8 md:h-8 items-center justify-center rounded-md bg-blue-500/15 text-blue-600 dark:text-blue-400">
                    <Icon
                      icon="heroicons:building-office"
                      className="w-3 h-3 md:w-4 md:h-4"
                    />
                  </span>
                </div>
                <div className="text-lg md:text-xl lg:text-2xl font-extrabold tracking-tight break-all">
                  ${nf.format(Math.round(kpis.obrasMonto))}
                </div>
                <div className="text-[10px] md:text-xs text-default-500 mt-1">
                  {kpis.obrasCount} {kpis.obrasCount === 1 ? "obra" : "obras"}
                </div>
              </div>
              {/* Comisión por Obras */}
              <div className="p-4 md:p-5 rounded-2xl border-0 bg-gradient-to-br from-orange-100/80 via-orange-50/60 to-amber-50/80 shadow-lg backdrop-blur-sm transition-all hover:scale-[1.01]">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs md:text-sm text-orange-700 dark:text-orange-300">
                    Comisión Obras
                  </div>
                  <span className="inline-flex w-6 h-6 md:w-8 md:h-8 items-center justify-center rounded-md bg-orange-500/15 text-orange-600 dark:text-orange-400">
                    <Icon
                      icon="heroicons:currency-dollar"
                      className="w-3 h-3 md:w-4 md:h-4"
                    />
                  </span>
                </div>
                <div className="text-lg md:text-xl lg:text-2xl font-extrabold tracking-tight break-all">
                  ${nf.format(Math.round(kpis.obrasComision))}
                </div>
                <div className="text-[10px] md:text-xs text-default-500 mt-1">
                  2.5% sobre obras confirmadas
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4">
              {/* Estado de pago (donut) */}
              <div className="p-4 md:p-5 rounded-2xl border-0 bg-white/60 shadow-lg backdrop-blur-sm overflow-hidden transition-all hover:scale-[1.01]">
                <div className="text-xs md:text-sm font-bold mb-3 text-default-900">
                  Estado de pago
                </div>
                <div className="flex flex-col items-center gap-3">
                  <div className="shrink-0 w-full max-w-[120px] h-[120px] sm:max-w-[140px] sm:h-[140px]">
                    {typeof window !== "undefined" && (
                      <Chart
                        options={estadosOptions}
                        series={estadosSegments.map((s) => s.value)}
                        type="donut"
                        height="100%"
                        width="100%"
                      />
                    )}
                  </div>
                  <div className="flex-1 w-full grid grid-cols-1 gap-2 text-xs md:text-sm">
                    {estadosSegments.map((seg) => {
                      const pct = estadosTotal
                        ? Math.round((seg.value / estadosTotal) * 100)
                        : 0;
                      const color = seg.color;
                      return (
                        <div
                          key={seg.label}
                          className="flex items-center justify-between gap-2"
                        >
                          <span className="inline-flex items-center gap-2 text-default-700">
                            <span
                              className="w-2 h-2 md:w-2.5 md:h-2.5 rounded-full"
                              style={{ background: color }}
                            />
                            {seg.label}
                          </span>
                          <span className="font-semibold whitespace-nowrap">
                            {seg.value} ({pct}%)
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
              {/* Tipo de envío (donut) */}
              <div className="p-4 md:p-5 rounded-2xl border-0 bg-white/60 shadow-lg backdrop-blur-sm overflow-hidden transition-all hover:scale-[1.01]">
                <div className="text-xs md:text-sm font-bold mb-3 text-default-900">
                  Tipo de envío
                </div>
                <div className="flex flex-col items-center gap-3">
                  <div className="shrink-0 w-full max-w-[120px] h-[120px] sm:max-w-[140px] sm:h-[140px]">
                    {typeof window !== "undefined" && (
                      <Chart
                        options={enviosOptions}
                        series={enviosSegments.map((s) => s.value)}
                        type="donut"
                        height="100%"
                        width="100%"
                      />
                    )}
                  </div>
                  <div className="flex-1 w-full grid grid-cols-1 gap-2 text-xs md:text-sm">
                    {enviosSegments.map((seg) => {
                      const pct = enviosTotal
                        ? Math.round((seg.value / enviosTotal) * 100)
                        : 0;
                      const color = seg.color;
                      return (
                        <div
                          key={seg.label}
                          className="flex items-center justify-between gap-2"
                        >
                          <span className="inline-flex items-center gap-2 text-default-700">
                            <span
                              className="w-2 h-2 md:w-2.5 md:h-2.5 rounded-full"
                              style={{ background: color }}
                            />
                            {seg.label}
                          </span>
                          <span className="font-semibold whitespace-nowrap">
                            {seg.value} ({pct}%)
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
              {/* Formas de pago - donut segmentado (ubicado al lado de Tipo de envío) */}
              <div className="p-4 md:p-5 rounded-2xl border-0 bg-white/60 shadow-lg backdrop-blur-sm overflow-hidden transition-all hover:scale-[1.01]">
                <div className="text-xs md:text-sm font-bold mb-3 text-default-900">
                  Formas de pago
                </div>
                {totalFormasPago === 0 ? (
                  <div className="text-default-500 text-xs md:text-sm">
                    Sin datos
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <div className="shrink-0 w-full max-w-[120px] h-[120px] sm:max-w-[140px] sm:h-[140px]">
                      {typeof window !== "undefined" && (
                        <Chart
                          options={formasPagoOptions}
                          series={fpSegments.map((s) => s.value)}
                          type="donut"
                          height="100%"
                          width="100%"
                        />
                      )}
                    </div>
                    <div className="flex-1 w-full grid grid-cols-1 gap-2 text-xs md:text-sm overflow-hidden">
                      {fpSegments.map((seg) => {
                        const pct = totalFormasPago
                          ? Math.round((seg.value / totalFormasPago) * 100)
                          : 0;
                        return (
                          <div
                            key={seg.label}
                            className="flex items-center justify-between gap-2"
                          >
                            <span className="inline-flex items-center gap-2 text-default-700 truncate min-w-0">
                              <span
                                className="w-2 h-2 md:w-2.5 md:h-2.5 rounded-full shrink-0"
                                style={{ background: seg.color }}
                              />
                              <span className="truncate text-[10px] md:text-xs">
                                {seg.label.toUpperCase()}
                              </span>
                            </span>
                            <span className="font-semibold whitespace-nowrap text-[10px] md:text-xs">
                              {seg.value} ({pct}%)
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
              {/* Clientes nuevos vs viejos */}
              <div className="p-4 md:p-5 rounded-2xl border-0 bg-white/60 shadow-lg backdrop-blur-sm overflow-hidden transition-all hover:scale-[1.01]">
                <div className="text-xs md:text-sm font-bold mb-3 text-default-900">
                  Clientes (nuevos vs viejos)
                </div>
                {clientesTotal === 0 ? (
                  <div className="text-default-500 text-xs md:text-sm">
                    Sin datos
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <div className="shrink-0 w-full max-w-[120px] h-[120px] sm:max-w-[140px] sm:h-[140px]">
                      {typeof window !== "undefined" && (
                        <Chart
                          options={clientesOptions}
                          series={clientesSegments.map((s) => s.value)}
                          type="donut"
                          height="100%"
                          width="100%"
                        />
                      )}
                    </div>
                    <div className="flex-1 w-full grid grid-cols-1 gap-2 text-xs md:text-sm">
                      {clientesSegments.map((seg) => {
                        const pct = clientesTotal
                          ? Math.round((seg.value / clientesTotal) * 100)
                          : 0;
                        const color = seg.color;
                        return (
                          <div
                            key={seg.label}
                            className="flex items-center justify-between gap-2"
                          >
                            <span className="inline-flex items-center gap-2 text-default-700">
                              <span
                                className="w-2 h-2 md:w-2.5 md:h-2.5 rounded-full"
                                style={{ background: color }}
                              />
                              {seg.label}
                            </span>
                            <span className="font-semibold whitespace-nowrap">
                              {seg.value} ({pct}%)
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Top productos (monto) */}
            {/* <div className="p-4 rounded-xl border border-default-200 bg-card shadow-sm">
              <div className="text-sm font-semibold mb-2">Top productos (monto)</div>
              {kpis.topProductos.length === 0 ? (
                <div className="text-default-500 text-sm">Sin datos en el rango</div>
              ) : (
                <div className="space-y-2">
                  {kpis.topProductos.map((p, idx) => (
                    <div
                      key={p.nombre}
                      className="flex items-center justify-between gap-4 p-3 rounded-lg border border-default-200 bg-default-50/50 hover:bg-default-100/60 shadow-sm transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="w-7 h-7 rounded-full bg-primary/10 text-primary ring-1 ring-primary/20 flex items-center justify-center text-xs font-bold">
                          {idx + 1}
                        </span>
                        <div className="truncate">
                          <div className="text-sm font-semibold truncate">{p.nombre}</div>
                          <div className="text-xs text-default-500">{p.unidades} unidades</div>
                        </div>
                      </div>
                      <div className="text-sm font-semibold whitespace-nowrap">$ {nf.format(Math.round(p.monto))}</div>
                    </div>
                  ))}
                </div>
              )}
            </div> */}
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default SalesStats;
