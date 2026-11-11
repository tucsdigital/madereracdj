"use client";

import React, { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useTheme } from "next-themes";
import { useThemeStore } from "@/store";
import { themes } from "@/config/themes";
import {
  Award,
  CalendarDays,
  ChartNoAxesColumnIncreasing,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Info,
  Landmark,
  Layers,
  Percent,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useDateRange } from "../context/date-range-context";
import { useDashboardData } from "../context/dashboard-data-context";
import CajaDelDia from "./caja-del-dia";
import { calcularTotalObra, esObraComisionable, getFechaComisionObra, OBRAS_COMMISSION_RATE } from "@/lib/obras-comisiones";
import { esVentaPagada, getVentaFechaConfirmacion } from "@/lib/ventas-pagos";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });
const COMMISSION_RATE = 2.5;
const nf = new Intl.NumberFormat("es-AR");

const currency = (amount) => `$${nf.format(Math.round(Number(amount) || 0))}`;
const getPrimaryTonalPalette = (primary, isDark) => {
  const [hue, saturation] = String(primary || "").split(/[\s,]+/).map((value) => Number.parseFloat(value));
  if (!Number.isFinite(hue) || !Number.isFinite(saturation)) {
    return Array.from({ length: 5 }, () => `hsl(${primary})`);
  }
  const lightness = isDark ? [92, 80, 68, 56, 44] : [84, 69, 54, 39, 24];
  return lightness.map((value) => `hsl(${hue} ${saturation}% ${value}%)`);
};
const buildDonutOptions = (segments, total, isDark, chartTokens) => ({
  chart: { type: "donut", toolbar: { show: false }, animations: { enabled: false }, foreColor: `hsl(${chartTokens.foreground})` },
  labels: segments.map((segment) => segment.label),
  colors: segments.map((segment) => segment.color),
  stroke: { width: 2, colors: [`hsl(${chartTokens.card})`] },
  legend: { show: false },
  dataLabels: { enabled: false },
  tooltip: { theme: isDark ? "dark" : "light", y: { formatter: (value) => `${Number(value) || 0}` } },
  plotOptions: {
    pie: {
      expandOnClick: false,
      donut: {
        size: "76%",
        labels: {
          show: true,
          name: { show: false },
          value: { show: false },
          total: { show: true, label: "Total", formatter: () => `${total}` },
        },
      },
    },
  },
});

const StatisticsDonut = ({ title, segments, isDark, chartTokens, chartThemeKey }) => {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  return (
    <section className="min-w-0 rounded-xl border border-border/70 bg-card p-4 sm:p-5" aria-label={title}>
      <h2 className="mb-3 text-sm font-semibold tracking-tight text-foreground">{title}</h2>
      {total ? (
        <div className="flex min-h-[132px] items-center justify-center gap-3 sm:gap-5">
          <div className="h-[128px] w-[128px] shrink-0" aria-hidden="true">
            <Chart key={chartThemeKey} options={buildDonutOptions(segments, total, isDark, chartTokens)} series={segments.map((segment) => segment.value)} type="donut" height="100%" width="100%" />
          </div>
          <ul className="min-w-0 flex-1 space-y-2 text-xs sm:text-[13px]">
            {segments.filter((segment) => segment.value > 0).map((segment) => (
              <li key={segment.label} className="flex min-w-0 items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-2 text-muted-foreground">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: segment.color }} aria-hidden="true" />
                  <span className="truncate">{segment.label}</span>
                </span>
                <span className="shrink-0 tabular-nums font-medium text-foreground">
                  {segment.value} <span className="text-muted-foreground">({Math.round((segment.value / total) * 100)}%)</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="flex min-h-[132px] items-center justify-center gap-4">
          <div className="flex h-[112px] w-[112px] shrink-0 items-center justify-center rounded-full border-[14px] border-muted text-2xl font-semibold tabular-nums text-foreground">0</div>
          <p className="text-sm text-muted-foreground">Sin datos para el período.</p>
        </div>
      )}
    </section>
  );
};

const Metric = ({ icon: Icon, label, value, detail, helpText, href, emphasis = false }) => {
  const content = (
    <div className={`flex min-h-[82px] items-start justify-between gap-3 px-4 py-3 sm:px-5 ${emphasis ? "bg-muted/35" : ""}`}>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground sm:text-[13px]">
          <span>{label}</span>
          {helpText ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={`Información sobre ${label}`}
                  className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Info className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs whitespace-normal text-left leading-relaxed">
                {helpText}
              </TooltipContent>
            </Tooltip>
          ) : null}
        </div>
        <div className="mt-1 truncate text-lg font-semibold tracking-tight text-foreground tabular-nums sm:text-[22px]">{value}</div>
        {detail ? <div className="mt-0.5 truncate text-xs text-muted-foreground">{detail}</div> : null}
      </div>
      <Icon className="mt-0.5 h-[18px] w-[18px] shrink-0 text-muted-foreground" strokeWidth={1.8} aria-hidden="true" />
    </div>
  );
  return href ? <Link href={href} className="block rounded-md outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring">{content}</Link> : content;
};

const MetricRow = ({ metrics }) => (
  <TooltipProvider delayDuration={200}>
    <div className="grid grid-cols-1 divide-y divide-border/70 sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-4">
      {metrics.map((metric) => <Metric key={metric.label} {...metric} />)}
    </div>
  </TooltipProvider>
);

const SalesStats = () => {
  const { resolvedTheme, theme } = useTheme();
  const isDark = (resolvedTheme || theme) === "dark";
  const selectedThemeName = useThemeStore((state) => state.theme);
  const selectedTheme = themes.find((item) => item.name === selectedThemeName) || themes.find((item) => item.name === "violet");
  const chartTokens = selectedTheme?.cssVars[isDark ? "dark" : "light"] || {};
  const chartThemeKey = `${selectedThemeName}-${isDark ? "dark" : "light"}`;
  const chartColors = useMemo(
    () => getPrimaryTonalPalette(chartTokens.primary, isDark),
    [chartTokens.primary, isDark]
  );
  const { mesSeleccionado, setMesSeleccionado, isInRange } = useDateRange();
  const { ventas: ventasFiltradas = [], allVentas = [], presupuestos: presupuestosFiltrados = [], obras: obrasFromContext = [], allObras = [], loading } = useDashboardData();
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const now = new Date();
  const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const canGoToNextMonth = mesSeleccionado && mesSeleccionado < currentMonth;

  const changeMonth = (amount) => {
    if (mesSeleccionado) setMesSeleccionado(new Date(mesSeleccionado.getFullYear(), mesSeleccionado.getMonth() + amount, 1));
  };

  const obrasFiltradas = useMemo(() => obrasFromContext.filter((obra) => String(obra?.tipo || "").toLowerCase() === "obra"), [obrasFromContext]);
  const obrasConfirmadas = useMemo(() => allObras.filter((obra) =>
    esObraComisionable(obra) && isInRange(getFechaComisionObra(obra))
  ), [allObras, isInRange]);
  const ventasConfirmadas = useMemo(() => allVentas.filter((venta) =>
    esVentaPagada(venta) && isInRange(getVentaFechaConfirmacion(venta))
  ), [allVentas, isInRange]);

  const kpis = useMemo(() => {
    const ventasCount = ventasFiltradas.length;
    const ventasMonto = ventasFiltradas.reduce((sum, venta) => sum + (Number(venta.total) || 0), 0);
    const cobranzasPagadoTotal = ventasConfirmadas.reduce((sum, venta) => sum + (Number(venta.total) || 0), 0);
    let cobranzasIngresadoPeriodo = 0;
    let pendienteParcialTotal = 0;
    ventasFiltradas.forEach((venta) => {
      const total = Number(venta.total) || 0;
      let pagos = Array.isArray(venta.pagos) ? venta.pagos : [];
      if (!pagos.length && Number(venta.montoAbonado)) pagos = [{ monto: Number(venta.montoAbonado) }];
      const abonado = pagos.reduce((sum, pago) => sum + (Number(pago.monto) || 0), 0);
      pagos.forEach((pago) => { if (pago.fecha && isInRange(pago.fecha)) cobranzasIngresadoPeriodo += Number(pago.monto) || 0; });
      let estado = String(venta.estadoPago || "").toLowerCase();
      if (!estado) estado = abonado >= total && total > 0 ? "pagado" : abonado > 0 && abonado < total ? "parcial" : "pendiente";
      if (estado === "pendiente") pendienteParcialTotal += total;
      else if (estado === "parcial") pendienteParcialTotal += Math.max(total - abonado, 0);
    });
    const estados = ventasFiltradas.reduce((acc, venta) => {
      const estado = String(venta.estadoPago || "").toLowerCase();
      if (estado === "pagado") acc.pagado += 1;
      else if (estado === "parcial") acc.parcial += 1;
      else acc.pendiente += 1;
      return acc;
    }, { pagado: 0, parcial: 0, pendiente: 0 });
    const formasPago = ventasFiltradas.reduce((acc, venta) => {
      const forma = String(venta.formaPago || "-").toLowerCase();
      acc[forma] = (acc[forma] || 0) + 1;
      return acc;
    }, {});
    const obrasMonto = obrasFiltradas.reduce((sum, obra) => sum + calcularTotalObra(obra), 0);
    const obrasMontoComisionable = obrasConfirmadas.reduce((sum, obra) => sum + calcularTotalObra(obra), 0);
    return {
      ventasCount, ventasMonto, cobranzasPagadoTotal, pendienteParcialTotal, cobranzasIngresadoPeriodo, estados, formasPago,
      obrasMonto, obrasCount: obrasFiltradas.length, obrasComision: obrasMontoComisionable * (OBRAS_COMMISSION_RATE / 100),
    };
  }, [ventasFiltradas, ventasConfirmadas, obrasFiltradas, obrasConfirmadas, isInRange]);

  const fpSegments = useMemo(() => {
    const labels = { efectivo: "Efectivo", transferencia: "Transferencia", tarjeta: "Tarjeta", cheque: "Cheque", otro: "Otro", mercadopago: "Mercado Pago", mercado_pago: "Mercado Pago" };
    return Object.entries(kpis.formasPago).sort((a, b) => b[1] - a[1]).map(([label, value], index) => ({ label: labels[label] || label.replace(/\b\w/g, (letter) => letter.toUpperCase()), value, color: chartColors[index % chartColors.length] }));
  }, [kpis.formasPago, chartColors]);
  const saleTypeSegments = useMemo(() => {
    const counts = { Contado: 0, Tarjeta: 0, Otro: 0 };
    ventasFiltradas.forEach((sale) => {
      const method = String(sale.formaPago || "").trim().toLowerCase().replace(/[\s_-]/g, "");
      if (["efectivo", "transferencia"].includes(method)) counts.Contado += 1;
      else if (["tarjeta", "debito", "creditodebito"].includes(method)) counts.Tarjeta += 1;
      else counts.Otro += 1;
    });
    return Object.entries(counts).map(([label, value], index) => ({ label, value, color: chartColors[[0, 2, 4][index]] }));
  }, [ventasFiltradas, chartColors]);
  const channelSegments = useMemo(() => {
    const counts = { Teléfono: 0, Web: 0 };
    ventasFiltradas.forEach((sale) => {
      const origin = String(sale.origen || "").toLowerCase();
      if (origin.includes("web") || origin.includes("ecommerce")) counts.Web += 1;
      else counts.Teléfono += 1;
    });
    return [
      { label: "Teléfono", value: counts.Teléfono, color: chartColors[0] },
      { label: "Web", value: counts.Web, color: chartColors[3] },
    ];
  }, [ventasFiltradas, chartColors]);

  const commissionSales = kpis.cobranzasPagadoTotal * (COMMISSION_RATE / 100);
  const commissionTotal = commissionSales + kpis.obrasComision;
  const firstRow = [
    { label: "Ventas", value: nf.format(kpis.ventasCount), icon: TrendingUp, href: "/ventas" },
    { label: "Total de ventas", value: currency(kpis.ventasMonto), icon: Layers },
    { label: "Pagado (Ventas)", value: currency(kpis.cobranzasPagadoTotal), icon: Check },
    { label: "Pendiente + Parcial", value: currency(kpis.pendienteParcialTotal), icon: Clock },
  ];
  const secondRow = [
    {
      label: "Comisión Ventas",
      value: currency(commissionSales),
      detail: "2,5% sobre ventas confirmadas en el período",
      helpText: "Es el 2,5% del importe total de las ventas que quedaron totalmente pagadas durante el mes seleccionado. Incluye ventas creadas en meses anteriores; se toma la fecha del pago que completó el total.",
      icon: Percent,
    },
    {
      label: "Comisión Obras",
      value: currency(kpis.obrasComision),
      detail: "2,5% sobre obras confirmadas",
      helpText: "Es el 2,5% del importe de las obras en ejecución o completadas cuya fecha de referencia corresponde al mes seleccionado.",
      icon: Percent,
    },
    {
      label: "Total Comisiones",
      value: currency(commissionTotal),
      detail: "Ventas + Obras",
      helpText: "Es la suma de la comisión de ventas y la comisión de obras correspondientes al mes seleccionado.",
      icon: Award,
      emphasis: true,
    },
    { label: "Total Obras", value: currency(kpis.obrasMonto), detail: `${kpis.obrasCount} ${kpis.obrasCount === 1 ? "obra" : "obras"}`, icon: Landmark },
  ];

  return (
    <main className="space-y-4 sm:space-y-5">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-card text-foreground">
            <ChartNoAxesColumnIncreasing className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">Estadísticas de Ventas</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">Resumen general de ventas, cobros y estado de cuentas.</p>
          </div>
        </div>
        <div className="flex items-center justify-between gap-1 sm:justify-center">
          <Button type="button" variant="outline" size="icon" onClick={() => changeMonth(-1)} className="h-10 w-10 shrink-0 rounded-full" aria-label="Ver mes anterior"><ChevronLeft className="h-4 w-4" aria-hidden="true" /></Button>
          <Popover open={monthPickerOpen} onOpenChange={setMonthPickerOpen}>
            <PopoverTrigger asChild>
              <Button type="button" variant="outline" className="h-10 min-w-40 flex-1 gap-2 rounded-full px-4 font-medium capitalize sm:flex-initial" aria-label="Elegir mes de las estadísticas">
                <CalendarDays className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{mesSeleccionado ? format(mesSeleccionado, "MMMM yyyy", { locale: es }) : "Elegir mes"}</span>
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="center">
              <Calendar mode="single" month={mesSeleccionado || currentMonth} selected={mesSeleccionado || undefined} onSelect={(date) => { if (date) { setMesSeleccionado(date); setMonthPickerOpen(false); } }} onMonthChange={(month) => { if (month <= currentMonth) setMesSeleccionado(month); }} disabled={{ after: now }} toMonth={currentMonth} initialFocus />
              <p className="px-4 pb-3 text-center text-xs text-muted-foreground">Elegí cualquier día para ver ese mes.</p>
            </PopoverContent>
          </Popover>
          <Button type="button" variant="outline" size="icon" onClick={() => changeMonth(1)} disabled={!canGoToNextMonth} className="h-10 w-10 shrink-0 rounded-full" aria-label="Ver mes siguiente"><ChevronRight className="h-4 w-4" aria-hidden="true" /></Button>
        </div>
      </header>

      <CajaDelDia />

      {loading ? (
        <div className="space-y-4" aria-label="Cargando estadísticas" aria-busy="true">
          {[0, 1].map((row) => <div key={row} className="grid min-h-[82px] grid-cols-2 overflow-hidden rounded-xl border border-border/70 bg-card sm:grid-cols-4">{[0, 1, 2, 3].map((item) => <div key={item} className="space-y-3 border-b border-r border-border/60 p-4"><div className="h-3 w-24 animate-pulse rounded bg-muted"/><div className="h-6 w-32 animate-pulse rounded bg-muted"/></div>)}</div>)}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((item) => <div key={item} className="h-[196px] animate-pulse rounded-xl border border-border/70 bg-card"/>)}</div>
        </div>
      ) : (
        <>
          <div className="space-y-2.5">
            <div className="overflow-hidden rounded-xl border border-border/70 bg-card"><MetricRow metrics={firstRow} /></div>
            <div className="overflow-hidden rounded-xl border border-border/70 bg-card"><MetricRow metrics={secondRow} /></div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-4">
            <StatisticsDonut isDark={isDark} chartTokens={chartTokens} chartThemeKey={chartThemeKey} title="Estado de pagos" segments={[
              { label: "Pagado", value: kpis.estados.pagado, color: chartColors[0] },
              { label: "Parcial", value: kpis.estados.parcial, color: chartColors[2] },
              { label: "Pendiente", value: kpis.estados.pendiente, color: chartColors[4] },
            ]} />
            <StatisticsDonut isDark={isDark} chartTokens={chartTokens} chartThemeKey={chartThemeKey} title="Tipo de venta" segments={saleTypeSegments} />
            <StatisticsDonut isDark={isDark} chartTokens={chartTokens} chartThemeKey={chartThemeKey} title="Forma de pago" segments={fpSegments} />
            <StatisticsDonut isDark={isDark} chartTokens={chartTokens} chartThemeKey={chartThemeKey} title="Canal de venta (origen)" segments={channelSegments} />
          </div>
        </>
      )}
    </main>
  );
};

export default SalesStats;
