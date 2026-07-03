"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Icon } from "@iconify/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "@/components/ui/use-toast";
import { auth, db } from "@/lib/firebase";
import { collection, getDocs, query, where, orderBy, deleteDoc, doc, getDoc, onSnapshot, setDoc } from "firebase/firestore";
import { useParams } from "next/navigation";
import { buildLiquidacionAsistenciaHtml, calcularPremioAsistenciaMensual, formatMonthLabel } from "@/lib/asistencia-utils";
import { cn } from "@/lib/utils";

function calcTotalSemanaLaboral(days) {
  const d = days && typeof days === "object" ? days : {};
  const keys = ["lun", "mar", "mie", "jue", "vie"];
  return keys.reduce((acc, k) => acc + Number(d?.[k]?.monto || 0), 0);
}

const safeJson = async (res) => {
  try {
    return await res.json();
  } catch {
    return null;
  }
};

const formatCurrencyAR = (value) => `$${Number(value || 0).toLocaleString("es-AR")}`;

const formatDateAR = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("es-AR");
};

const formatDateTimeAR = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("es-AR");
};

const addDays = (dateInput, days) => {
  const date = new Date(dateInput);
  date.setDate(date.getDate() + Number(days || 0));
  return date;
};

const MONTHS_ES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

const ACTION_OUTLINE_BUTTON_CLASS =
  "rounded-xl border-violet-200 bg-white text-violet-600 shadow-sm transition-all hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700 focus-visible:ring-2 focus-visible:ring-violet-200 disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-300 disabled:shadow-none disabled:opacity-100";

const MONTH_PICKER_TRIGGER_CLASS =
  "h-12 min-w-[220px] justify-between rounded-2xl border-slate-200 bg-white px-4 text-left text-sm font-medium text-slate-700 shadow-sm transition-all hover:border-violet-300 hover:bg-slate-50 hover:text-slate-800 focus-visible:ring-2 focus-visible:ring-violet-200";

function ProgressRing({ value }) {
  const safeValue = Math.max(0, Math.min(Number(value || 0), 100));
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (safeValue / 100) * circumference;

  return (
    <div className="relative flex h-28 w-28 items-center justify-center">
      <svg className="-rotate-90 h-28 w-28" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={radius} stroke="#d9f1df" strokeWidth="10" fill="none" />
        <circle
          cx="60"
          cy="60"
          r={radius}
          stroke="#58c26b"
          strokeWidth="10"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute text-center">
        <div className="text-2xl font-bold tracking-tight text-slate-800">{safeValue.toLocaleString("es-AR")}%</div>
        <div className="text-[11px] font-medium text-slate-500">Asistencia</div>
      </div>
    </div>
  );
}

export default function EmpleadoDetallePage() {
  const { id, lang } = useParams();
  const [empleado, setEmpleado] = useState(null);
  const [asistencias, setAsistencias] = useState([]);
  const [adelantos, setAdelantos] = useState([]);
  const [filtroMes, setFiltroMes] = useState(new Date().toISOString().slice(0,7));
  const [cierreMensual, setCierreMensual] = useState(null);
  const [comprobanteMensual, setComprobanteMensual] = useState(null);
  const [emitiendoComprobante, setEmitiendoComprobante] = useState(false);
  const [generandoLink, setGenerandoLink] = useState(false);
  const [publicUrl, setPublicUrl] = useState("");
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [monthPickerYear, setMonthPickerYear] = useState(new Date().getFullYear());

  useEffect(() => {
    const load = async () => {
      const empRef = doc(db, "empleados", String(id));
      const empSnap = await getDoc(empRef);
      setEmpleado(empSnap.exists() ? { ...empSnap.data(), id: empSnap.id } : null);
      const asistSnap = await getDocs(query(collection(db, "asistencias"), where("employeeId", "==", id), orderBy("weekStart","desc")));
      setAsistencias(asistSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      const adSnap = await getDocs(query(collection(db, "adelantos"), where("employeeId","==", id)));
      setAdelantos(adSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    };
    load();
  }, [id]);

  useEffect(() => {
    if (!filtroMes) return undefined;
    const ref = doc(db, "premiosAsistenciaCierres", filtroMes);
    const unsub = onSnapshot(ref, (snap) => {
      setCierreMensual(snap.exists() ? { id: snap.id, ...snap.data() } : null);
    });
    return () => unsub();
  }, [filtroMes]);

  useEffect(() => {
    if (!filtroMes || !id) return undefined;
    const ref = doc(db, "liquidacionesAsistencia", `${filtroMes}_${id}`);
    const unsub = onSnapshot(ref, (snap) => {
      setComprobanteMensual(snap.exists() ? { id: snap.id, ...snap.data() } : null);
    });
    return () => unsub();
  }, [filtroMes, id]);

  useEffect(() => {
    setPublicUrl("");
  }, [filtroMes, id]);

  const buildPublicUrl = useCallback((tokenPlain) => {
    const token = String(tokenPlain || "").trim();
    if (!token) return "";
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/${String(lang || "en")}/asistencia/liquidacion/${token}`;
  }, [lang]);

  const resumenMes = useMemo(() => {
    const [y,m] = filtroMes.split("-").map(Number);
    const fechaMes = new Date(y, (m || 1) - 1, 1);
    const totSemana = asistencias
      .filter(a => {
        const d = new Date(a.weekStart);
        return d.getFullYear()===y && d.getMonth()+1===m;
      })
      .reduce((acc,a)=>acc+calcTotalSemanaLaboral(a?.days),0);
    const totAdv = adelantos
      .filter(a=>{
        const d = new Date(a.fecha);
        return d.getFullYear()===y && d.getMonth()+1===m;
      })
      .reduce((acc,a)=>acc+Number(a.monto||0),0);
    const premioAsistencia = calcularPremioAsistenciaMensual({
      empleado,
      asistencias,
      monthInput: fechaMes,
    });
    const totPagar = Math.max(totSemana + Number(premioAsistencia.premio || 0) - totAdv, 0);
    const cierreEmpleado = Array.isArray(cierreMensual?.empleados)
      ? cierreMensual.empleados.find((item) => String(item.id || item.employeeId || "") === String(id))
      : null;
    if (cierreEmpleado) {
      return {
        totSemana: Number(cierreEmpleado.cobrado || 0),
        totAdv: Number(cierreEmpleado.adelanto || 0),
        premioAsistencia: cierreEmpleado.premioAsistencia || premioAsistencia,
        totPagar: Number(cierreEmpleado.saldoConPremio || 0),
        closedAt: cierreMensual?.closedAt || null,
        isClosed: true,
        labelMes: cierreMensual?.labelMes || formatMonthLabel(fechaMes),
      };
    }
    return {
      totSemana,
      totAdv,
      premioAsistencia,
      totPagar,
      closedAt: null,
      isClosed: false,
      labelMes: formatMonthLabel(fechaMes),
    };
  }, [filtroMes, asistencias, adelantos, empleado, cierreMensual, id]);

  const semanasOrdenadas = useMemo(() => {
    return [...asistencias].sort((a, b) => {
      const timeA = new Date(a.weekStart || 0).getTime();
      const timeB = new Date(b.weekStart || 0).getTime();
      return timeB - timeA;
    });
  }, [asistencias]);

  const adelantosOrdenados = useMemo(() => {
    return [...adelantos].sort((a, b) => {
      const timeA = new Date(a.fecha || 0).getTime();
      const timeB = new Date(b.fecha || 0).getTime();
      return timeB - timeA;
    });
  }, [adelantos]);

  const periodoHistorico = useMemo(() => {
    if (semanasOrdenadas.length === 0) {
      return {
        desde: null,
        hasta: null,
        dias: 0,
      };
    }

    const fechas = semanasOrdenadas
      .map((item) => new Date(item.weekStart))
      .filter((date) => !Number.isNaN(date.getTime()))
      .sort((a, b) => a.getTime() - b.getTime());

    if (fechas.length === 0) {
      return {
        desde: null,
        hasta: null,
        dias: 0,
      };
    }

    const desde = fechas[0];
    const hasta = addDays(fechas[fechas.length - 1], 5);
    const dias = Math.max(Math.round((hasta.getTime() - desde.getTime()) / 86400000) + 1, 0);

    return { desde, hasta, dias };
  }, [semanasOrdenadas]);

  const totalHistoricoSemanas = useMemo(() => {
    return semanasOrdenadas.reduce((acc, item) => acc + calcTotalSemanaLaboral(item?.days), 0);
  }, [semanasOrdenadas]);

  const totalHistoricoAdelantos = useMemo(() => {
    return adelantosOrdenados.reduce((acc, item) => acc + Number(item.monto || 0), 0);
  }, [adelantosOrdenados]);

  const monthInputLabel = useMemo(() => {
    const [year, month] = String(filtroMes || "").split("-");
    if (!year || !month) return "";
    const date = new Date(Number(year), Number(month) - 1, 1);
    return date.toLocaleDateString("es-AR", { month: "long", year: "numeric" });
  }, [filtroMes]);

  const selectedMonthDate = useMemo(() => {
    const [year, month] = String(filtroMes || "").split("-").map(Number);
    if (!year || !month) return new Date();
    return new Date(year, month - 1, 1);
  }, [filtroMes]);

  const selectedMonthIndex = selectedMonthDate.getMonth();
  const selectedMonthYear = selectedMonthDate.getFullYear();

  useEffect(() => {
    setMonthPickerYear(selectedMonthYear);
  }, [selectedMonthYear]);

  const selectMonthYear = useCallback((year, monthIndex) => {
    const nextMonth = String(monthIndex + 1).padStart(2, "0");
    setFiltroMes(`${year}-${nextMonth}`);
    setMonthPickerOpen(false);
  }, []);

  const abrirComprobanteImprimible = (comprobanteData) => {
    const html = buildLiquidacionAsistenciaHtml({
      empleado,
      resumenMes,
      comprobante: comprobanteData,
    });
    const printWindow = window.open("", "_blank", "width=980,height=900");
    if (!printWindow) return;
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  };

  const generarLinkPublico = useCallback(async (liquidacionId, { rotate = true } = {}) => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      toast({
        title: "Sesión requerida",
        description: "Iniciá sesión para generar el link público.",
        variant: "destructive",
      });
      return "";
    }

    try {
      setGenerandoLink(true);
      const idToken = await currentUser.getIdToken();
      const res = await fetch(`/api/asistencia/liquidaciones/${liquidacionId}/link`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ rotate }),
      });
      const data = await safeJson(res);
      if (!data?.ok) throw new Error(data?.error || "No se pudo generar el link");

      const tokenPlain = String(data?.token || "").trim();
      if (!tokenPlain) {
        throw new Error("No se pudo obtener el token del link.");
      }

      const nextUrl = buildPublicUrl(tokenPlain);
      setPublicUrl(nextUrl);
      return nextUrl;
    } catch (err) {
      toast({
        title: "No se pudo generar el link",
        description: err?.message || "Error",
        variant: "destructive",
      });
      return "";
    } finally {
      setGenerandoLink(false);
    }
  }, [buildPublicUrl]);

  useEffect(() => {
    const tokenPlain = String(comprobanteMensual?.public?.token || "").trim();
    const tokenHash = String(comprobanteMensual?.public?.tokenHash || "").trim();

    if (tokenPlain) {
      const nextUrl = buildPublicUrl(tokenPlain);
      setPublicUrl((prev) => (prev === nextUrl ? prev : nextUrl));
      return;
    }

    if (!tokenHash || !comprobanteMensual?.id || publicUrl) return;

    let cancelled = false;
    const recover = async () => {
      const nextUrl = await generarLinkPublico(comprobanteMensual.id, { rotate: false });
      if (!cancelled && nextUrl) {
        setPublicUrl(nextUrl);
      }
    };
    recover();

    return () => {
      cancelled = true;
    };
  }, [buildPublicUrl, comprobanteMensual?.id, comprobanteMensual?.public?.token, comprobanteMensual?.public?.tokenHash, generarLinkPublico, publicUrl]);

  const copiarLinkPublico = useCallback(async () => {
    if (!publicUrl) return;
    try {
      await navigator.clipboard.writeText(publicUrl);
      toast({ title: "Link copiado" });
    } catch {
      toast({
        title: "No se pudo copiar el link",
        variant: "destructive",
      });
    }
  }, [publicUrl]);

  const abrirLinkPublico = useCallback(() => {
    if (!publicUrl) return;
    window.open(publicUrl, "_blank", "noopener,noreferrer");
  }, [publicUrl]);

  const handleGenerarLinkPublico = useCallback(async () => {
    const liquidacionId = comprobanteMensual?.id || `${filtroMes}_${id}`;
    if (!liquidacionId || !comprobanteMensual) return;
    const nextUrl = await generarLinkPublico(liquidacionId);
    if (nextUrl) {
      toast({ title: "Link público listo para compartir" });
    }
  }, [comprobanteMensual, filtroMes, generarLinkPublico, id]);

  const emitirComprobante = async () => {
    if (!resumenMes.isClosed || !empleado?.id) return;
    try {
      setEmitiendoComprobante(true);
      const nextVersion = Number(comprobanteMensual?.version || 0) + 1;
      const payload = {
        employeeId: empleado.id,
        employeeNombre: empleado.nombre || "",
        employeeSector: empleado.sector || "",
        monthKey: filtroMes,
        labelMes: resumenMes.labelMes,
        generatedAt: new Date().toISOString(),
        closedAt: resumenMes.closedAt || null,
        version: nextVersion,
        totSemana: Number(resumenMes.totSemana || 0),
        totAdv: Number(resumenMes.totAdv || 0),
        totPagar: Number(resumenMes.totPagar || 0),
        premioAsistencia: {
          ...(resumenMes.premioAsistencia || {}),
          premio: Number(resumenMes.premioAsistencia?.premio || 0),
          porcentaje: Number(resumenMes.premioAsistencia?.porcentaje || 0),
          presentes: Number(resumenMes.premioAsistencia?.presentes || 0),
          medias: Number(resumenMes.premioAsistencia?.medias || 0),
          ausentes: Number(resumenMes.premioAsistencia?.ausentes || 0),
          diasEsperados: Number(resumenMes.premioAsistencia?.diasEsperados || 0),
        },
      };
      const liquidacionId = `${filtroMes}_${empleado.id}`;
      await setDoc(doc(db, "liquidacionesAsistencia", liquidacionId), payload, { merge: true });
      const linkUrl = await generarLinkPublico(liquidacionId);
      toast({
        title: linkUrl ? "Comprobante emitido y link listo" : "Comprobante emitido",
        description: "La impresión queda disponible desde 'Ver / imprimir', sin abrir una ventana extra al emitir.",
      });
    } catch (err) {
      console.error("Error emitiendo comprobante de liquidacion:", err);
      toast({
        title: "No se pudo emitir el comprobante",
        description: err?.message || "Error",
        variant: "destructive",
      });
    } finally {
      setEmitiendoComprobante(false);
    }
  };

  return (
      <div className="mx-auto flex max-w-[1380px] flex-col gap-6 px-4 py-8 md:px-6 xl:px-8">
        <div className="flex flex-col gap-5 rounded-[28px] border border-white/70 bg-white/80 p-6 shadow-[0_24px_60px_-30px_rgba(15,23,42,0.25)] backdrop-blur md:p-7">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
                <Link href={`/${String(lang || "en")}/asistencia`} className="font-medium text-violet-600 transition hover:text-violet-700">
                  Asistencias
                </Link>
                <Icon icon="lucide:chevron-right" className="h-4 w-4" />
                <span>Detalle de liquidación</span>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-[28px] font-bold tracking-tight text-slate-900 md:text-[34px]">
                  Liquidación de {resumenMes.labelMes || monthInputLabel}
                </h1>
                <span
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-semibold",
                    resumenMes.isClosed
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-amber-200 bg-amber-50 text-amber-700"
                  )}
                >
                  {resumenMes.isClosed ? "Cerrada" : "En cálculo"}
                </span>
              </div>
              <div className="text-sm text-slate-500">
                {resumenMes.isClosed
                  ? `Cerrado el ${formatDateTimeAR(resumenMes.closedAt)}`
                  : `Liquidación en cálculo vivo para ${resumenMes.labelMes}.`}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Popover open={monthPickerOpen} onOpenChange={setMonthPickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className={MONTH_PICKER_TRIGGER_CLASS}
                  >
                    <span className="flex items-center gap-3">
                      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-50 text-violet-600">
                        <Icon icon="lucide:calendar" className="h-4 w-4" />
                      </span>
                      <span className="capitalize">{MONTHS_ES[selectedMonthIndex]} {selectedMonthYear}</span>
                    </span>
                    <Icon icon="lucide:chevron-down" className="h-4 w-4 text-slate-400" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-[320px] rounded-[24px] border border-slate-200 bg-white p-0 shadow-[0_24px_60px_-25px_rgba(15,23,42,0.28)]">
                  <div className="space-y-4 p-4">
                    <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-3 py-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 rounded-xl text-slate-600 hover:bg-white"
                        onClick={() => setMonthPickerYear((prev) => prev - 1)}
                      >
                        <Icon icon="lucide:chevron-left" className="h-4 w-4" />
                      </Button>
                      <div className="text-sm font-semibold text-slate-900">{monthPickerYear}</div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 rounded-xl text-slate-600 hover:bg-white"
                        onClick={() => setMonthPickerYear((prev) => prev + 1)}
                      >
                        <Icon icon="lucide:chevron-right" className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      {MONTHS_ES.map((monthLabel, monthIndex) => {
                        const isActive = monthIndex === selectedMonthIndex;
                        return (
                          <button
                            key={monthLabel}
                            type="button"
                            onClick={() => selectMonthYear(monthPickerYear, monthIndex)}
                            className={cn(
                              "rounded-2xl px-3 py-3 text-sm font-medium transition-all",
                              isActive && monthPickerYear === selectedMonthYear
                                ? "bg-violet-600 text-white shadow-[0_14px_28px_-16px_rgba(124,58,237,0.95)]"
                                : "bg-slate-50 text-slate-600 hover:bg-violet-50 hover:text-violet-700"
                            )}
                          >
                            {monthLabel}
                          </button>
                        );
                      })}
                    </div>

                    <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                      <button
                        type="button"
                        onClick={() => {
                          const now = new Date();
                          selectMonthYear(now.getFullYear(), now.getMonth());
                        }}
                        className="text-sm font-semibold text-violet-600 transition hover:text-violet-700"
                      >
                        Ir al mes actual
                      </button>
                      <div className="text-xs text-slate-400">Selector mensual en español</div>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
              <div
                className={cn(
                  "rounded-2xl border px-4 py-3 text-sm font-medium shadow-sm",
                  resumenMes.isClosed
                    ? "border-amber-200 bg-amber-50 text-amber-700"
                    : "border-emerald-200 bg-emerald-50 text-emerald-700"
                )}
              >
                {resumenMes.isClosed ? "Mes cerrado" : "Mes abierto"}
              </div>
            </div>
          </div>
        </div>

        <Card className="rounded-[28px] border border-slate-200 bg-white shadow-[0_20px_45px_-30px_rgba(15,23,42,0.25)]">
          <CardHeader className="border-b border-slate-100 pb-4">
            <CardTitle className="text-base font-semibold text-slate-900">Comprobante de liquidación</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5 p-5 md:p-6">
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={emitirComprobante}
                disabled={!resumenMes.isClosed || emitiendoComprobante || generandoLink}
                className="rounded-xl bg-violet-600 text-white shadow-sm transition-all hover:bg-violet-700 focus-visible:ring-2 focus-visible:ring-violet-200 disabled:bg-violet-300 disabled:text-white disabled:shadow-none disabled:opacity-100"
              >
                {emitiendoComprobante
                  ? "Emitiendo..."
                  : comprobanteMensual
                    ? "Reemitir comprobante"
                    : "Emitir comprobante"}
              </Button>
              <Button
                variant="outline"
                onClick={() => abrirComprobanteImprimible(comprobanteMensual)}
                disabled={!comprobanteMensual}
                className={ACTION_OUTLINE_BUTTON_CLASS}
              >
                Ver / imprimir
              </Button>
              <Button
                variant="outline"
                onClick={handleGenerarLinkPublico}
                disabled={!comprobanteMensual || generandoLink}
                className={ACTION_OUTLINE_BUTTON_CLASS}
              >
                {generandoLink ? "Generando link..." : publicUrl ? "Regenerar link público" : "Generar link público"}
              </Button>
              <Button
                variant="outline"
                onClick={copiarLinkPublico}
                disabled={!publicUrl}
                className={ACTION_OUTLINE_BUTTON_CLASS}
              >
                Copiar link
              </Button>
              <Button
                variant="outline"
                onClick={abrirLinkPublico}
                disabled={!publicUrl}
                className={ACTION_OUTLINE_BUTTON_CLASS}
              >
                Abrir link
              </Button>
            </div>

            {comprobanteMensual ? (
              <div className="rounded-[22px] border border-slate-200 bg-slate-50/80 p-5">
                <div className="grid gap-4 md:grid-cols-[1fr_1fr_220px]">
                  <div>
                    <div className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">Emitido</div>
                    <div className="mt-2 text-sm font-semibold text-slate-900">{formatDateTimeAR(comprobanteMensual.generatedAt)}</div>
                  </div>
                  <div>
                    <div className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">Versión</div>
                    <div className="mt-2 text-sm font-semibold text-slate-900">{Number(comprobanteMensual.version || 1)}</div>
                  </div>
                  <div className="md:text-right">
                    <div className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">Total a pagar</div>
                    <div className="mt-2 text-[28px] font-extrabold tracking-tight text-violet-600">
                      {formatCurrencyAR(comprobanteMensual.totPagar || 0)}
                    </div>
                  </div>
                </div>
                {publicUrl ? (
                  <div className="mt-4 space-y-2">
                    <div className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">Link compartible</div>
                    <Input value={publicUrl} readOnly className="h-11 rounded-xl border-slate-200 bg-white" />
                  </div>
                ) : comprobanteMensual?.public?.tokenHash ? (
                  <div className="mt-4 text-sm text-slate-500">
                    Ya existe un link público generado. Si necesitás compartirlo de nuevo, generá uno nuevo.
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50/70 p-5 text-sm text-slate-500">
                {!resumenMes.isClosed
                  ? "Para emitir el comprobante primero tenés que cerrar el mes desde Asistencia."
                  : "Todavía no hay comprobante emitido para este mes."}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-4 xl:grid-cols-[1fr_1fr_1fr]">
          <Card className="rounded-[24px] border border-slate-200 bg-white shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-slate-900">Resumen general</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="flex items-center justify-between text-slate-600">
                <span>Total semana</span>
                <span className="font-semibold text-slate-900">{formatCurrencyAR(resumenMes.totSemana)}</span>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span>Adelantos</span>
                <span className="font-semibold text-orange-500">{formatCurrencyAR(resumenMes.totAdv)}</span>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span>Premio asistencia</span>
                <span className="font-semibold text-orange-500">{formatCurrencyAR(Number(resumenMes.premioAsistencia?.premio || 0))}</span>
              </div>
              <div className="border-t border-slate-100 pt-4">
                <div className="flex items-center justify-between">
                  <span className="text-base font-semibold text-slate-900">Total a pagar</span>
                  <span className="text-[28px] font-extrabold tracking-tight text-slate-900">
                    {formatCurrencyAR(resumenMes.totPagar)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[24px] border border-slate-200 bg-white shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-slate-900">Cumplimiento de asistencia</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col items-center gap-5 md:flex-row md:items-center md:justify-between">
                <ProgressRing value={Number(resumenMes.premioAsistencia?.porcentaje || 0)} />
                <div className="flex-1 space-y-3 text-sm">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2 text-slate-600">
                      <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                      <span>Presentes</span>
                    </div>
                    <span className="font-semibold text-slate-900">{resumenMes.premioAsistencia?.presentes || 0}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2 text-slate-600">
                      <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
                      <span>Ausencias</span>
                    </div>
                    <span className="font-semibold text-slate-900">{resumenMes.premioAsistencia?.ausentes || 0}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2 text-slate-600">
                      <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                      <span>Medias</span>
                    </div>
                    <span className="font-semibold text-slate-900">{resumenMes.premioAsistencia?.medias || 0}</span>
                  </div>
                </div>
              </div>
              {/* <div className="text-sm font-medium text-violet-600">
                Ver detalle de asistencia
                <span className="ml-2 inline-flex align-middle">
                  <Icon icon="lucide:arrow-right" className="h-4 w-4" />
                </span>
              </div> */}
            </CardContent>
          </Card>

          <Card className="rounded-[24px] border border-slate-200 bg-white shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-slate-900">Regla de premio</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="flex items-center justify-between gap-4">
                <span className="text-slate-600">Estado</span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
                  {resumenMes.premioAsistencia?.estadoLabel || "Sin premio"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-slate-600">Mínimo</span>
                <span className="font-semibold text-slate-900">
                  {Number(resumenMes.premioAsistencia?.config?.minPorcentaje || 0).toLocaleString("es-AR")}%
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-slate-600">Máx. ausencias</span>
                <span className="font-semibold text-slate-900">{resumenMes.premioAsistencia?.config?.maxAusencias ?? 0}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-slate-600">Máx. medias</span>
                <span className="font-semibold text-slate-900">{resumenMes.premioAsistencia?.config?.maxMedias ?? 0}</span>
              </div>
              {/* <div className="text-sm font-medium text-violet-600">
                Ver configuración de regla
                <span className="ml-2 inline-flex align-middle">
                  <Icon icon="lucide:arrow-right" className="h-4 w-4" />
                </span>
              </div> */}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
          <Card className="rounded-[24px] border border-slate-200 bg-white shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-sm font-semibold text-slate-900">Semanas del período</CardTitle>
              <div className="text-xs font-medium text-slate-400">{empleado?.nombre || "Empleado"}</div>
            </CardHeader>
            <CardContent>
              <div className="overflow-hidden rounded-[18px] border border-slate-100">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold">Semana</th>
                      <th className="px-4 py-3 text-right font-semibold">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {semanasOrdenadas.map((item) => {
                      const weekStart = item.weekStart ? new Date(item.weekStart) : null;
                      const weekEnd = weekStart && !Number.isNaN(weekStart.getTime()) ? addDays(weekStart, 5) : null;
                      return (
                        <tr key={item.id} className="bg-white">
                          <td className="px-4 py-3 text-slate-700">
                            <div className="flex items-center gap-2">
                              <Icon icon="lucide:calendar-days" className="h-4 w-4 text-slate-400" />
                              <span>
                                {formatDateAR(weekStart)} - {formatDateAR(weekEnd)}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right font-medium text-slate-900">
                            {formatCurrencyAR(calcTotalSemanaLaboral(item?.days))}
                          </td>
                        </tr>
                      );
                    })}
                    {semanasOrdenadas.length === 0 ? (
                      <tr>
                        <td colSpan={2} className="px-4 py-6 text-center text-slate-500">
                          No hay semanas registradas todavía.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                  <tfoot className="bg-slate-50">
                    <tr>
                      <td className="px-4 py-3 font-semibold text-slate-900">Total</td>
                      <td className="px-4 py-3 text-right font-extrabold text-slate-900">
                        {formatCurrencyAR(totalHistoricoSemanas)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[24px] border border-slate-200 bg-white shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle className="text-sm font-semibold text-slate-900">Adelantos</CardTitle>
              <div className="rounded-xl border border-violet-100 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-600">
                Historial del empleado
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-hidden rounded-[18px] border border-slate-100">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold">Fecha</th>
                      <th className="px-4 py-3 text-right font-semibold">Monto</th>
                      <th className="px-4 py-3 text-left font-semibold">Nota</th>
                      <th className="px-4 py-3 text-right font-semibold">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {adelantosOrdenados.map((item) => (
                      <tr key={item.id} className="bg-white">
                        <td className="px-4 py-3 text-slate-700">{formatDateAR(item.fecha)}</td>
                        <td className="px-4 py-3 text-right font-medium text-slate-900">
                          {formatCurrencyAR(item.monto)}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{item.nota || "-"}</td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="rounded-lg text-red-600 hover:bg-red-50 hover:text-red-700"
                            onClick={() => deleteDoc(doc(db, "adelantos", item.id))}
                          >
                            Eliminar
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {adelantosOrdenados.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                          No hay adelantos registrados.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                  <tfoot className="bg-slate-50">
                    <tr>
                      <td className="px-4 py-3 font-semibold text-slate-900">Total</td>
                      <td className="px-4 py-3 text-right font-extrabold text-slate-900">
                        {formatCurrencyAR(totalHistoricoAdelantos)}
                      </td>
                      <td className="px-4 py-3" />
                      <td className="px-4 py-3" />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        {resumenMes.premioAsistencia?.motivos?.length > 0 ? (
          <Card className="rounded-[24px] border border-amber-200 bg-amber-50/80 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-amber-900">Observaciones del premio</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-amber-900">
              {resumenMes.premioAsistencia.motivos.join(" · ")}
            </CardContent>
          </Card>
        ) : null}

        <div className="rounded-[24px] border border-violet-100 bg-[linear-gradient(135deg,rgba(122,90,248,0.08),rgba(122,90,248,0.03))] px-5 py-6 shadow-sm">
          <div className="grid gap-5 md:grid-cols-[96px_1fr_1fr] md:items-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-violet-600 text-white shadow-lg shadow-violet-200">
              <Icon icon="lucide:file-text" className="h-6 w-6" />
            </div>
            <div className="border-slate-200 md:border-r md:pr-8">
              <div className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">Período</div>
              <div className="mt-2 text-lg font-semibold text-slate-900">
                {periodoHistorico.desde && periodoHistorico.hasta
                  ? `${formatDateAR(periodoHistorico.desde)} - ${formatDateAR(periodoHistorico.hasta)}`
                  : "-"}
              </div>
            </div>
            <div>
              <div className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">Días totales en el período</div>
              <div className="mt-2 text-[30px] font-extrabold tracking-tight text-slate-900">
                {periodoHistorico.dias.toLocaleString("es-AR")} días
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-slate-200 pt-4 text-xs text-slate-400 md:flex-row md:items-center md:justify-between">
          <div>© 2026 Maderas Caballero. Todos los derechos reservados.</div>
          <div>Desarrollado por Tucs Digital</div>
        </div>
      </div>

  );
}
