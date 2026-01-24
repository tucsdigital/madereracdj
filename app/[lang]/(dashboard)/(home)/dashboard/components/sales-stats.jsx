"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Icon } from "@iconify/react";
import { db } from "@/lib/firebase";
import { collection, getDocs } from "firebase/firestore";
import { useAuth } from "@/provider/auth.provider";
import { useDateRange } from "../context/date-range-context";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import Link from "next/link";

const SalesStats = () => {
  const { user } = useAuth();
  const { fechaDesde, fechaHasta, rangoRapido, setFechaDesde, setFechaHasta, setRangoRapido, isInRange, toDateSafe } = useDateRange();

  const [ventasData, setVentasData] = useState([]);
  const [presupuestosData, setPresupuestosData] = useState([]);
  const [obrasData, setObrasData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [clientesData, setClientesData] = useState({});
  const COMMISSION_RATE = 2.5; // % comisión fija para todos los clientes
  const OBRAS_COMMISSION_RATE = 2.5; // % comisión fija para obras

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const ventasSnap = await getDocs(collection(db, "ventas"));
        setVentasData(
          ventasSnap.docs.map((doc) => ({ ...doc.data(), id: doc.id }))
        );
        const presupuestosSnap = await getDocs(collection(db, "presupuestos"));
        setPresupuestosData(
          presupuestosSnap.docs.map((doc) => ({ ...doc.data(), id: doc.id }))
        );
        const obrasSnap = await getDocs(collection(db, "obras"));
        setObrasData(
          obrasSnap.docs.map((doc) => ({ ...doc.data(), id: doc.id }))
        );
        const clientesSnap = await getDocs(collection(db, "clientes"));
        const map = {};
        clientesSnap.docs.forEach((d) => {
          map[d.id] = { id: d.id, ...d.data() };
        });
        setClientesData(map);
      } catch (error) {
        console.error("Error al cargar datos de estadísticas:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // El rango rápido ahora se maneja en el contexto

  const ventasFiltradas = useMemo(() => {
    const filtradas = (ventasData || []).filter((v) => {
      // IMPORTANTE: Usar fechaCreacion primero, ya que es la fecha real de creación de la venta
      // El campo "fecha" puede ser una fecha manual/editable que no refleja cuando se hizo la venta
      const fechaVenta = v.fechaCreacion || v.fecha;
      const resultado = isInRange(fechaVenta);
      
      return resultado;
    });
    
    return filtradas;
  }, [ventasData, isInRange]);

  const presupuestosFiltrados = useMemo(() => {
    return (presupuestosData || []).filter((p) =>
      isInRange(p.fechaCreacion || p.fecha)
    );
  }, [presupuestosData, isInRange]);

  const obrasFiltradas = useMemo(() => {
    return (obrasData || [])
      .filter((o) => o.tipo === "obra")
      .filter((o) => isInRange(o.fechaCreacion));
  }, [obrasData, isInRange]);

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
    };
  }, [
    ventasFiltradas,
    presupuestosFiltrados,
    obrasFiltradas,
    obrasConfirmadas,
    OBRAS_COMMISSION_RATE,
  ]);

  const nf = useMemo(() => new Intl.NumberFormat("es-AR"), []);

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
    let totalVentasConCliente = 0;
    let ventasSinCliente = 0;
    let totalVentasProcesadas = 0;
    let ventasClienteNoEncontradoIds = [];

    ventasFiltradas.forEach((venta) => {
      let clienteEncontrado = null;

      // Buscar cliente por clienteId primero
      if (venta.clienteId) {
        clienteEncontrado = clientesData[venta.clienteId];
      }

      // Si no se encontró por clienteId, buscar por teléfono del objeto cliente
      if (!clienteEncontrado && venta.cliente && venta.cliente.telefono) {
        const telefono = venta.cliente.telefono;
        // Buscar en clientesData por teléfono
        for (const [clienteId, cliente] of Object.entries(clientesData)) {
          if (cliente.telefono === telefono) {
            clienteEncontrado = cliente;
            break;
          }
        }
      }

      // Si no se encontró por teléfono, buscar por CUIT del objeto cliente
      if (!clienteEncontrado && venta.cliente && venta.cliente.cuit) {
        const cuit = venta.cliente.cuit;
        // Buscar en clientesData por CUIT
        for (const [clienteId, cliente] of Object.entries(clientesData)) {
          if (cliente.cuit === cuit) {
            clienteEncontrado = cliente;
            break;
          }
        }
      }

      if (!clienteEncontrado) {
        ventasSinCliente++;
        ventasClienteNoEncontradoIds.push({
          id: venta.id,
          numeroPedido: venta.numeroPedido,
          cliente: venta.cliente,
          monto: venta.total,
        });
        return;
      }

      const montoVenta = Number(venta.total) || 0;
      totalVentasProcesadas += montoVenta;
      totalVentasConCliente += montoVenta;
    });

    // Calcular comisión: 2.5% para todas las ventas con cliente
    const comisionTotal = totalVentasConCliente * (COMMISSION_RATE / 100);

    return {
      totalVentasConCliente,
      comisionTotal,
      ventasSinCliente,
      totalVentasProcesadas,
      ventasClienteNoEncontradoIds,
    };
  }, [ventasFiltradas, clientesData, kpis.ventasMonto, COMMISSION_RATE]);

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
          : "bg-white/60 border-0 text-default-700 hover:bg-white/80 hover:shadow-lg hover:scale-105"
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
    <Card className="relative rounded-3xl shadow-2xl border-0 overflow-hidden bg-gradient-to-br from-slate-50/80 via-gray-50/60 to-zinc-50/80 backdrop-blur-xl">
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
            <TooltipProvider delayDuration={200}>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
                {/* Ventas */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link href="/ventas" className="block">
                      <div className="p-4 md:p-5 rounded-2xl border-0 bg-gradient-to-br from-primary/20 via-primary/10 to-primary/5 shadow-lg backdrop-blur-sm hover:shadow-xl transition-all cursor-pointer transform hover:scale-[1.02]">
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
                    <div className="p-4 md:p-5 rounded-2xl border-0 bg-gradient-to-br from-emerald-100/80 via-emerald-50/60 to-green-50/80 shadow-lg backdrop-blur-sm cursor-help transition-all hover:scale-[1.02]">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-xs md:text-sm text-emerald-700 dark:text-emerald-300">
                          Monto
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
                        Total acumulado
                      </div>
                      <div className="text-gray-700 dark:text-gray-300">
                        Suma de todas las ventas del período
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
                    <div className="p-4 md:p-5 rounded-2xl border-0 bg-gradient-to-br from-indigo-100/80 via-indigo-50/60 to-purple-50/80 shadow-lg backdrop-blur-sm cursor-help transition-all hover:scale-[1.02]">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-xs md:text-sm text-indigo-700 dark:text-indigo-300">
                          Ticket
                        </div>
                        <span className="inline-flex w-6 h-6 md:w-8 md:h-8 items-center justify-center rounded-md bg-indigo-500/15 text-indigo-600 dark:text-indigo-400">
                          <Icon
                            icon="heroicons:chart-bar-square"
                            className="w-3 h-3 md:w-4 md:h-4"
                          />
                        </span>
                      </div>
                      <div className="text-lg md:text-2xl lg:text-3xl font-extrabold tracking-tight break-all">
                        ${nf.format(Math.round(kpis.ticketPromedio))}
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" color="secondary">
                    <div className="space-y-2 text-xs sm:text-sm">
                      <div className="font-bold text-sm sm:text-base text-gray-900 dark:text-gray-100">
                        Ticket promedio
                      </div>
                      <div className="text-gray-700 dark:text-gray-300">
                        Monto promedio por venta
                      </div>
                      <div className="pt-2 mt-2 border-t border-gray-200/50 dark:border-gray-700/50">
                        <div className="text-gray-600 dark:text-gray-400 text-xs">
                          <span className="font-medium">Calculado:</span> Total ÷ Cantidad de ventas
                        </div>
                      </div>
                    </div>
                  </TooltipContent>
                </Tooltip>
                {/* Presupuestos */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link href="/presupuestos" className="block">
                      <div className="p-4 md:p-5 rounded-2xl border-0 bg-gradient-to-br from-amber-100/80 via-amber-50/60 to-yellow-50/80 shadow-lg backdrop-blur-sm hover:shadow-xl transition-all cursor-pointer transform hover:scale-[1.02]">
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-xs md:text-sm text-amber-700 dark:text-amber-300">
                            Presup.
                          </div>
                          <span className="inline-flex w-6 h-6 md:w-8 md:h-8 items-center justify-center rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400">
                            <Icon
                              icon="heroicons:document-text"
                              className="w-3 h-3 md:w-4 md:h-4"
                            />
                          </span>
                        </div>
                        <div className="text-xl md:text-3xl font-extrabold tracking-tight">
                          {kpis.presupuestosCount}
                        </div>
                      </div>
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" color="secondary">
                    <div className="space-y-2 text-xs sm:text-sm">
                      <div className="font-bold text-sm sm:text-base text-gray-900 dark:text-gray-100">
                        Presupuestos generados
                      </div>
                      <div className="text-gray-700 dark:text-gray-300">
                        En el período seleccionado
                      </div>
                      <div className="pt-2 mt-2 border-t border-gray-200/50 dark:border-gray-700/50">
                        <span className="text-primary dark:text-primary font-medium text-xs sm:text-sm">
                          Click para ver todos los presupuestos →
                        </span>
                      </div>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </div>
            </TooltipProvider>

            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
              {/* Comisión por ventas */}
              <div className="p-4 md:p-5 rounded-2xl border-0 bg-gradient-to-br from-fuchsia-100/80 via-fuchsia-50/60 to-pink-50/80 shadow-lg backdrop-blur-sm transition-all hover:scale-[1.02]">
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
                  ${nf.format(Math.round(comisionesPorTipoCliente.comisionTotal))}
                </div>
                <div className="text-[10px] md:text-xs text-default-500 mt-1">
                  2.5% sobre ventas
                </div>
              </div>

              {/* Total Obras */}
              <div className="p-4 md:p-5 rounded-2xl border-0 bg-gradient-to-br from-blue-100/80 via-blue-50/60 to-cyan-50/80 shadow-lg backdrop-blur-sm transition-all hover:scale-[1.02]">
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
              <div className="p-4 md:p-5 rounded-2xl border-0 bg-gradient-to-br from-orange-100/80 via-orange-50/60 to-amber-50/80 shadow-lg backdrop-blur-sm transition-all hover:scale-[1.02]">
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
