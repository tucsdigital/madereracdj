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
import { collection, query, where, orderBy, deleteDoc, doc, getDoc, onSnapshot, setDoc } from "firebase/firestore";
import { useParams } from "next/navigation";
import {
  buildControlAsistenciaValeHtml,
  buildExtrasDetalleMensual,
  buildLiquidacionAsistenciaHtml,
  calcularPremioAsistenciaMensual,
  calcularTotalExtrasMensual,
  calcularTotalLiquidacion,
  calcularTotalTrabajadoMensual,
  formatMonthLabel,
  getDayPaymentBreakdown,
  isDateBeforeEmployeeStart,
} from "@/lib/asistencia-utils";
import { cn } from "@/lib/utils";

function calcTotalSemanaLaboral(days) {
  const d = days && typeof days === "object" ? days : {};
  const keys = ["lun", "mar", "mie", "jue", "vie", "sab", "dom"];
  return keys.reduce((acc, k) => acc + Number(d?.[k]?.monto || 0), 0);
}

const DAY_KEYS = ["lun", "mar", "mie", "jue", "vie", "sab", "dom"];

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

const formatDateKey = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const normalizarAdelantoDetalle = (item) => ({
  id: String(item?.id || ""),
  fecha: item?.fecha || "",
  monto: Number(item?.monto || 0),
  nota: String(item?.nota || ""),
});

const normalizarExtraDetalle = (item) => ({
  id: String(item?.id || ""),
  fecha: item?.fecha || "",
  tipo: String(item?.tipo || ""),
  concepto: String(item?.concepto || ""),
  detalle: String(item?.detalle || ""),
  cantidad: Number(item?.cantidad || 0),
  monto: Number(item?.monto || 0),
  nota: String(item?.nota || ""),
});

const normalizarAusentismoAdjunto = (item) => ({
  id: String(item?.id || ""),
  nombreArchivo: String(item?.nombreArchivo || "Adjunto"),
  mimeType: String(item?.mimeType || ""),
  size: Number(item?.size || 0),
  storagePath: String(item?.storagePath || ""),
  url: String(item?.url || ""),
  uploadedAt: item?.uploadedAt || null,
});

const addDays = (dateInput, days) => {
  const date = new Date(dateInput);
  date.setDate(date.getDate() + Number(days || 0));
  return date;
};

const calcTotalSemanaEnMes = (days, weekStartInput, filtroMes) => {
  const d = days && typeof days === "object" ? days : {};
  const weekStart = weekStartInput ? new Date(weekStartInput) : null;
  const [year, month] = String(filtroMes || "").split("-").map(Number);

  if (!weekStart || Number.isNaN(weekStart.getTime()) || !year || !month) {
    return calcTotalSemanaLaboral(days);
  }

  return DAY_KEYS.reduce((acc, key, index) => {
    const current = addDays(weekStart, index);
    const sameMonth =
      current.getFullYear() === year && current.getMonth() + 1 === month;
    if (!sameMonth) return acc;
    return acc + Number(d?.[key]?.monto || 0);
  }, 0);
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

const DAY_LABELS = {
  lun: "Lunes",
  mar: "Martes",
  mie: "Miércoles",
  jue: "Jueves",
  vie: "Viernes",
  sab: "Sábado",
  dom: "Domingo",
};

const ACTION_OUTLINE_BUTTON_CLASS =
  "rounded-xl border-violet-200 bg-white text-violet-600 shadow-sm transition-all hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700 focus-visible:ring-2 focus-visible:ring-violet-200 disabled:border-slate-200 disabled:bg-slate-50 disabled:text-slate-300 disabled:shadow-none disabled:opacity-100";

const MONTH_PICKER_TRIGGER_CLASS =
  "h-12 min-w-[220px] justify-between rounded-2xl border-slate-200 bg-white px-4 text-left text-sm font-medium text-slate-700 shadow-sm transition-all hover:border-violet-300 hover:bg-slate-50 hover:text-slate-800 focus-visible:ring-2 focus-visible:ring-violet-200";

const FALLBACK_EMPLOYEE_NAME = "Empleado sin nombre";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildAdelantoComprobanteHtml({ empleado, adelanto, comprobante }) {
  const nombre = escapeHtml(empleado?.nombre || "Empleado");
  const sector = escapeHtml(empleado?.sector || "-");
  const fecha = escapeHtml(formatDateAR(adelanto?.fecha));
  const emitido = escapeHtml(formatDateTimeAR(comprobante?.emittedAt));
  const version = Number(comprobante?.version || 1);
  const monto = formatCurrencyAR(adelanto?.monto || 0);
  const nota = escapeHtml(adelanto?.nota || "-");

  return `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <title>Comprobante de adelanto</title>
    <style>
      * { box-sizing: border-box; }
      @page { size: A4; margin: 12mm; }
      body { font-family: Arial, Helvetica, sans-serif; background: #f8fafc; color: #0f172a; padding: 24px; margin: 0; overflow-wrap: anywhere; word-break: break-word; }
      .sheet { max-width: 780px; margin: 0 auto; background: white; border: 1px solid #e2e8f0; border-radius: 20px; padding: 28px; }
      .header { display: flex; justify-content: space-between; gap: 24px; border-bottom: 2px solid #e2e8f0; padding-bottom: 18px; margin-bottom: 22px; break-inside: avoid; page-break-inside: avoid; }
      .eyebrow { display: inline-flex; align-items: center; gap: 8px; border: 1px solid #ddd6fe; background: #f5f3ff; color: #7c3aed; border-radius: 999px; padding: 6px 10px; font-size: 11px; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; }
      .title { font-size: 26px; font-weight: 700; margin: 10px 0 6px; }
      .muted { color: #64748b; font-size: 13px; }
      .meta { text-align: right; color: #64748b; font-size: 13px; }
      .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; margin-bottom: 20px; break-inside: avoid; page-break-inside: avoid; }
      .box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 14px; padding: 16px; }
      .label { font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.14em; margin-bottom: 8px; }
      .value { font-size: 21px; font-weight: 700; }
      .formula-card { margin-top: 18px; border: 1px solid #ddd6fe; background: linear-gradient(135deg, rgba(245,243,255,0.95), rgba(238,242,255,0.88)); border-radius: 16px; padding: 16px; }
      .formula-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; background: rgba(255,255,255,0.88); border: 1px solid #e5e7eb; border-radius: 12px; padding: 10px 12px; margin-top: 8px; font-size: 14px; }
      .formula-total { margin-top: 12px; background: #111827; color: white; border-radius: 16px; padding: 14px 16px; }
      .formula-total-head { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
      .formula-total-label { font-size: 12px; text-transform: uppercase; letter-spacing: 0.16em; color: rgba(255,255,255,0.72); }
      .formula-total-value { font-size: 30px; font-weight: 700; }
      .formula-caption { margin-top: 8px; font-size: 12px; color: rgba(255,255,255,0.72); }
      .note { margin-top: 18px; border: 1px solid #e2e8f0; border-radius: 14px; padding: 16px; background: #fafafa; break-inside: auto; page-break-inside: auto; }
      .note-body { font-size: 14px; line-height: 1.55; color: #0f172a; overflow-wrap: anywhere; word-break: break-word; hyphens: auto; white-space: pre-wrap; }
      .legal { margin-top: 18px; border: 1px dashed #cbd5e1; border-radius: 14px; background: #f8fafc; padding: 14px 16px; color: #475569; font-size: 12px; line-height: 1.55; break-inside: avoid; page-break-inside: avoid; }
      .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 36px; break-inside: avoid; page-break-inside: avoid; }
      .sign { border-top: 1px solid #cbd5e1; padding-top: 12px; height: 72px; display: flex; align-items: flex-end; justify-content: center; color: #64748b; font-size: 13px; }
      @media print {
        body { background: white; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .sheet { border: none; padding: 0; border-radius: 0; max-width: none; }
      }
      @media (max-width: 720px) {
        .header { flex-direction: column; align-items: flex-start; }
        .meta { text-align: left; }
        .grid, .signatures { grid-template-columns: 1fr; }
      }
    </style>
  </head>
  <body>
    <div class="sheet">
      <div class="header">
        <div>
          <div class="eyebrow">Resguardo interno</div>
          <div class="title">Comprobante de adelanto</div>
          <div class="muted">Entrega registrada para control interno y firma de conformidad.</div>
        </div>
        <div class="meta">
          <div><strong>Emitido:</strong> ${emitido}</div>
          <div><strong>Versión:</strong> ${version}</div>
        </div>
      </div>
      <div class="grid">
        <div class="box">
          <div class="label">Empleado</div>
          <div class="value">${nombre}</div>
          <div class="muted">Sector: ${sector}</div>
        </div>
        <div class="box">
          <div class="label">Monto entregado</div>
          <div class="value">${monto}</div>
          <div class="muted">Fecha registrada: ${fecha}</div>
        </div>
      </div>

      

      <div class="note">
        <div class="label">Detalle</div>
        <div class="note-body">${nota}</div>
      </div>
      <div class="legal">
        La firma del presente acredita la entrega del adelanto indicado en este comprobante, quedando sujeto a su correspondiente imputación dentro de la liquidación mensual del empleado.
      </div>
      <div class="signatures">
        <div class="sign">Firma empresa</div>
        <div class="sign">Firma empleado</div>
      </div>
    </div>
  </body>
</html>`;
}

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
  const [guardandoAusentismoKey, setGuardandoAusentismoKey] = useState("");
  const [subiendoAusentismoKey, setSubiendoAusentismoKey] = useState("");
  const [imprimiendoAdelantoId, setImprimiendoAdelantoId] = useState("");
  const [ausentismoDrafts, setAusentismoDrafts] = useState({});
  const [ordenTardanzas, setOrdenTardanzas] = useState("desc");

  useEffect(() => {
    let cancelled = false;
    const loadEmpleado = async () => {
      const empRef = doc(db, "empleados", String(id));
      const empSnap = await getDoc(empRef);
      if (cancelled) return;
      setEmpleado(empSnap.exists() ? { ...empSnap.data(), id: empSnap.id } : null);
    };

    loadEmpleado();

    const asistQuery = query(
      collection(db, "asistencias"),
      where("employeeId", "==", id),
      orderBy("weekStart", "desc"),
    );
    const adelantosQuery = query(
      collection(db, "adelantos"),
      where("employeeId", "==", id),
    );

    const unsubAsistencias = onSnapshot(asistQuery, (snap) => {
      setAsistencias(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    const unsubAdelantos = onSnapshot(adelantosQuery, (snap) => {
      setAdelantos(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    return () => {
      cancelled = true;
      unsubAsistencias();
      unsubAdelantos();
    };
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

  useEffect(() => {
    setOrdenTardanzas("desc");
  }, [filtroMes]);

  const buildPublicUrl = useCallback((tokenPlain) => {
    const token = String(tokenPlain || "").trim();
    if (!token) return "";
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return `${origin}/${String(lang || "en")}/asistencia/liquidacion/${token}`;
  }, [lang]);

  const resumenMes = useMemo(() => {
    const [y,m] = filtroMes.split("-").map(Number);
    const fechaMes = new Date(y, (m || 1) - 1, 1);
    const adelantosDetalle = adelantos
      .filter((a) => {
        const d = new Date(a.fecha);
        return d.getFullYear() === y && d.getMonth() + 1 === m;
      })
      .sort((a, b) => new Date(b.fecha || 0).getTime() - new Date(a.fecha || 0).getTime())
      .map(normalizarAdelantoDetalle);
    const totSemana = calcularTotalTrabajadoMensual({
      employeeId: id,
      empleado,
      asistencias,
      monthInput: fechaMes,
    });
    const totExtras = calcularTotalExtrasMensual({
      employeeId: id,
      empleado,
      asistencias,
      monthInput: fechaMes,
    });
    const extrasDetalle = buildExtrasDetalleMensual({
      employeeId: id,
      empleado,
      asistencias,
      monthInput: fechaMes,
    });
    const totAdv = adelantosDetalle.reduce((acc, item) => acc + Number(item.monto || 0), 0);
    const premioAsistencia = calcularPremioAsistenciaMensual({
      empleado,
      asistencias,
      monthInput: fechaMes,
    });
    const totPagar = calcularTotalLiquidacion({
      totSemana,
      totExtras,
      totAdv,
      premio: premioAsistencia.premio,
    });
    const cierreEmpleado = Array.isArray(cierreMensual?.empleados)
      ? cierreMensual.empleados.find((item) => String(item.id || item.employeeId || "") === String(id))
      : null;
    if (cierreEmpleado) {
      return {
        totSemana: Number(cierreEmpleado.trabajado || cierreEmpleado.cobrado || 0),
        totExtras: Number(cierreEmpleado.adicionales || cierreEmpleado.extras || 0),
        totAdv: Number(cierreEmpleado.adelanto || 0),
        adelantosDetalle,
        extrasDetalle,
        premioAsistencia: cierreEmpleado.premioAsistencia || premioAsistencia,
        totPagar: Number(cierreEmpleado.saldoConPremio || 0),
        closedAt: cierreMensual?.closedAt || null,
        isClosed: true,
        labelMes: cierreMensual?.labelMes || formatMonthLabel(fechaMes),
      };
    }
    return {
      totSemana,
      totExtras,
      totAdv,
      adelantosDetalle,
      extrasDetalle,
      premioAsistencia,
      totPagar,
      closedAt: null,
      isClosed: false,
      labelMes: formatMonthLabel(fechaMes),
    };
  }, [filtroMes, asistencias, adelantos, empleado, cierreMensual, id]);

  const comprobanteMensualNormalizado = useMemo(() => {
    if (!comprobanteMensual) return null;
    const premio = Number(comprobanteMensual?.premioAsistencia?.premio || 0);
    return {
      ...comprobanteMensual,
      totSemana: Number(comprobanteMensual?.totSemana || 0),
      totExtras: Number(comprobanteMensual?.totExtras || 0),
      totAdv: Number(comprobanteMensual?.totAdv || 0),
      adelantosDetalle: Array.isArray(comprobanteMensual?.adelantosDetalle)
        ? comprobanteMensual.adelantosDetalle.map(normalizarAdelantoDetalle)
        : [],
      extrasDetalle: Array.isArray(comprobanteMensual?.extrasDetalle)
        ? comprobanteMensual.extrasDetalle.map(normalizarExtraDetalle)
        : [],
      totPagar: calcularTotalLiquidacion({
        totSemana: comprobanteMensual?.totSemana,
        totExtras: comprobanteMensual?.totExtras,
        totAdv: comprobanteMensual?.totAdv,
        premio,
      }),
      premioAsistencia: {
        ...(comprobanteMensual?.premioAsistencia || {}),
        premio,
        justificadas: Number(comprobanteMensual?.premioAsistencia?.justificadas || 0),
      },
    };
  }, [comprobanteMensual]);

  const semanasOrdenadas = useMemo(() => {
    const [year, month] = String(filtroMes || "").split("-").map(Number);
    if (!year || !month) return [];

    return [...asistencias]
      .filter((item) => {
        const weekStart = item?.weekStart ? new Date(item.weekStart) : null;
        if (!weekStart || Number.isNaN(weekStart.getTime())) return false;

        return DAY_KEYS.some((_, index) => {
          const current = addDays(weekStart, index);
          return (
            current.getFullYear() === year &&
            current.getMonth() + 1 === month
          );
        });
      })
      .sort((a, b) => {
      const timeA = new Date(a.weekStart || 0).getTime();
      const timeB = new Date(b.weekStart || 0).getTime();
      return timeB - timeA;
    });
  }, [asistencias, filtroMes]);

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
    const hasta = addDays(fechas[fechas.length - 1], 6);
    const dias = Math.max(Math.round((hasta.getTime() - desde.getTime()) / 86400000) + 1, 0);

    return { desde, hasta, dias };
  }, [semanasOrdenadas]);

  const totalHistoricoSemanas = useMemo(() => {
    return semanasOrdenadas.reduce(
      (acc, item) => acc + calcTotalSemanaEnMes(item?.days, item?.weekStart, filtroMes),
      0,
    );
  }, [filtroMes, semanasOrdenadas]);

  const totalHistoricoAdelantos = useMemo(() => {
    return adelantosOrdenados.reduce((acc, item) => acc + Number(item.monto || 0), 0);
  }, [adelantosOrdenados]);

  const ausenciasMes = useMemo(() => {
    const [year, month] = String(filtroMes || "").split("-").map(Number);
    if (!year || !month) return [];

    const rowsByWeek = Object.fromEntries(
      asistencias.map((item) => [String(item.weekStart || ""), item])
    );
    const endOfMonth = new Date(year, month, 0).getDate();
    const results = [];

    for (let day = 1; day <= endOfMonth; day += 1) {
      const current = new Date(year, month - 1, day);
      const dow = current.getDay();
      if (dow === 0 || dow === 6) continue;
      if (isDateBeforeEmployeeStart(current, empleado)) continue;

      const currentDayKey = ["lun", "mar", "mie", "jue", "vie"][dow - 1];
      const currentWeekStart = new Date(current);
      const diff = (dow === 0 ? -6 : 1) - dow;
      currentWeekStart.setDate(current.getDate() + diff);
      currentWeekStart.setHours(0, 0, 0, 0);
      const weekStartKey = formatDateKey(currentWeekStart);
      const row = rowsByWeek[weekStartKey];
      const dayData = row?.days?.[currentDayKey];

      if (!dayData || String(dayData.estado || "") !== "ausente") continue;

      results.push({
        id: `${weekStartKey}_${currentDayKey}`,
        dateIso: formatDateKey(current),
        weekStart: weekStartKey,
        dayKey: currentDayKey,
        dayLabel: DAY_LABELS[currentDayKey] || currentDayKey,
        rowId: row?.id || "",
        data: {
          ...dayData,
          ausentismoNota: String(dayData?.ausentismoNota || ""),
          ausentismoAdjuntos: Array.isArray(dayData?.ausentismoAdjuntos)
            ? dayData.ausentismoAdjuntos.map(normalizarAusentismoAdjunto)
            : [],
        },
      });
    }

    return results.sort((a, b) => String(b.dateIso).localeCompare(String(a.dateIso)));
  }, [asistencias, empleado, filtroMes]);

  const tardanzasMes = useMemo(() => {
    const [year, month] = String(filtroMes || "").split("-").map(Number);
    if (!year || !month) return [];

    const rowsByWeek = asistencias.reduce((acc, item) => {
      const key = formatDateKey(item?.weekStart) || String(item?.weekStart || "");
      if (key) acc[key] = item;
      return acc;
    }, {});
    const endOfMonth = new Date(year, month, 0).getDate();
    const results = [];

    for (let day = 1; day <= endOfMonth; day += 1) {
      const current = new Date(year, month - 1, day);
      if (isDateBeforeEmployeeStart(current, empleado)) continue;

      const dow = current.getDay();
      const dayIndex = dow === 0 ? 6 : dow - 1;
      const currentDayKey = DAY_KEYS[dayIndex];
      const currentWeekStart = new Date(current);
      const diff = (dow === 0 ? -6 : 1) - dow;
      currentWeekStart.setDate(current.getDate() + diff);
      currentWeekStart.setHours(0, 0, 0, 0);
      const weekStartKey = formatDateKey(currentWeekStart);
      const row = rowsByWeek[weekStartKey];
      const dayData = row?.days?.[currentDayKey];

      if (!dayData) continue;

      const breakdown = getDayPaymentBreakdown({
        dayData,
        empleado,
        dateInput: current,
      });

      if (!breakdown.llegoTarde) continue;

      results.push({
        id: `${weekStartKey}_${currentDayKey}_tarde`,
        dateIso: formatDateKey(current),
        weekStart: weekStartKey,
        dayKey: currentDayKey,
        dayLabel: DAY_LABELS[currentDayKey] || currentDayKey,
        horaLlegada: String(breakdown.horaLlegada || ""),
        horaEsperada: String(breakdown.horaIngresoEsperada || ""),
        minutosTarde: Number(breakdown.minutosTarde || 0),
        minutosDemora: Number(breakdown.minutosDemora || 0),
        justificacion: String(
          dayData?.notaTarde ?? dayData?.demoraNota ?? dayData?.ausentismoNota ?? "",
        ).trim(),
      });
    }

    return results;
  }, [asistencias, empleado, filtroMes]);

  const tardanzasMesOrdenadas = useMemo(() => {
    const results = [...tardanzasMes];
    results.sort((a, b) => {
      const compare = String(a.dateIso || "").localeCompare(String(b.dateIso || ""));
      return ordenTardanzas === "asc" ? compare : -compare;
    });

    return results;
  }, [ordenTardanzas, tardanzasMes]);

  const resumenTardanzas = useMemo(() => {
    return tardanzasMesOrdenadas.reduce(
      (acc, item) => {
        acc.cantidad += 1;
        acc.minutos += Number(item.minutosTarde || 0);
        return acc;
      },
      { cantidad: 0, minutos: 0 },
    );
  }, [tardanzasMesOrdenadas]);

  const resumenFormula = useMemo(() => {
    const trabajado = Number(resumenMes?.totSemana || 0);
    const adicionales = Number(resumenMes?.totExtras || 0);
    const adelantosMes = Number(resumenMes?.totAdv || 0);
    const premio = Number(resumenMes?.premioAsistencia?.premio || 0);
    const total = Number(resumenMes?.totPagar || 0);
    const cantidadAdelantos = Array.isArray(resumenMes?.adelantosDetalle) ? resumenMes.adelantosDetalle.length : 0;
    const cantidadAdicionales = Array.isArray(resumenMes?.extrasDetalle) ? resumenMes.extrasDetalle.length : 0;

    return {
      trabajado,
      adicionales,
      adelantosMes,
      premio,
      total,
      cantidadAdelantos,
      cantidadAdicionales,
    };
  }, [resumenMes]);

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
  const employeeName = empleado?.nombre?.trim() || FALLBACK_EMPLOYEE_NAME;
  const employeeSector = empleado?.sector?.trim() || "";

  useEffect(() => {
    setMonthPickerYear(selectedMonthYear);
  }, [selectedMonthYear]);

  const selectMonthYear = useCallback((year, monthIndex) => {
    const nextMonth = String(monthIndex + 1).padStart(2, "0");
    setFiltroMes(`${year}-${nextMonth}`);
    setMonthPickerOpen(false);
  }, []);

  const updateAsistenciaDayLocal = useCallback((rowId, dayKeyName, updater) => {
    setAsistencias((prev) =>
      prev.map((item) => {
        if (String(item.id || "") !== String(rowId || "")) return item;
        const prevDay = item?.days?.[dayKeyName] || {};
        const nextDay = typeof updater === "function" ? updater(prevDay) : updater;
        return {
          ...item,
          days: {
            ...(item.days || {}),
            [dayKeyName]: nextDay,
          },
        };
      })
    );
  }, []);

  const setAusentismoDraft = useCallback((entryId, patch) => {
    setAusentismoDrafts((prev) => ({
      ...prev,
      [entryId]: {
        ...(prev[entryId] || {}),
        ...patch,
      },
    }));
  }, []);

  const imprimirHtmlInvisible = useCallback((html) => {
    const markup = String(html || "").trim();
    if (!markup) {
      toast({
        title: "No se pudo preparar la impresión",
        description: "El comprobante llegó vacío antes de abrir la vista previa.",
        variant: "destructive",
      });
      return;
    }

    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "1px";
    iframe.style.height = "1px";
    iframe.style.border = "0";
    iframe.style.opacity = "0";
    iframe.style.pointerEvents = "none";

    const cleanup = () => {
      try {
        if (iframe.parentNode) document.body.removeChild(iframe);
      } catch {}
    };

    const runPrint = () => {
      try {
        const frameWindow = iframe.contentWindow;
        if (!frameWindow) throw new Error("No se pudo acceder a la ventana de impresión.");
        frameWindow.addEventListener("afterprint", cleanup, { once: true });
        frameWindow.focus();
        frameWindow.print();
        window.setTimeout(cleanup, 60000);
      } catch (error) {
        console.error("Error al imprimir:", error);
        toast({
          title: "No se pudo abrir la impresión",
          description: "La vista previa no llegó a cargarse correctamente.",
          variant: "destructive",
        });
        cleanup();
      }
    };

    document.body.appendChild(iframe);

    const frameDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!frameDoc) {
      cleanup();
      toast({
        title: "No se pudo preparar la impresión",
        description: "El navegador no permitió inicializar el documento imprimible.",
        variant: "destructive",
      });
      return;
    }

    frameDoc.open();
    frameDoc.write(markup);
    frameDoc.close();

    const waitUntilReady = () => {
      if (frameDoc.readyState !== "complete") {
        window.setTimeout(waitUntilReady, 50);
        return;
      }
      window.requestAnimationFrame(() => {
        window.setTimeout(runPrint, 180);
      });
    };

    waitUntilReady();
  }, []);

  const abrirComprobanteImprimible = (comprobanteData) => {
    const html = buildLiquidacionAsistenciaHtml({
      empleado,
      resumenMes,
      comprobante: comprobanteData,
    });

    imprimirHtmlInvisible(html);
  };

  const abrirValeImprimible = useCallback(() => {
    const html = buildControlAsistenciaValeHtml({
      empleado,
      resumenMes,
      comprobante: comprobanteMensualNormalizado,
    });

    imprimirHtmlInvisible(html);
  }, [comprobanteMensualNormalizado, empleado, imprimirHtmlInvisible, resumenMes]);

  const emitirComprobanteAdelanto = useCallback(async (adelantoItem) => {
    if (!adelantoItem?.id) return;
    try {
      setImprimiendoAdelantoId(String(adelantoItem.id));
      const currentVersion = Number(adelantoItem?.comprobante?.version || 0);
      const nextComprobante = {
        version: currentVersion + 1,
        emittedAt: new Date().toISOString(),
      };
      await setDoc(
        doc(db, "adelantos", String(adelantoItem.id)),
        { comprobante: nextComprobante },
        { merge: true }
      );
      setAdelantos((prev) =>
        prev.map((item) =>
          String(item.id || "") === String(adelantoItem.id)
            ? { ...item, comprobante: nextComprobante }
            : item
        )
      );

      const html = buildAdelantoComprobanteHtml({
        empleado,
        adelanto: { ...adelantoItem, comprobante: nextComprobante },
        comprobante: nextComprobante,
      });
      imprimirHtmlInvisible(html);
      toast({ title: "Comprobante de adelanto listo para imprimir" });
    } catch (error) {
      toast({
        title: "No se pudo emitir el comprobante",
        description: error?.message || "Error",
        variant: "destructive",
      });
    } finally {
      setImprimiendoAdelantoId("");
    }
  }, [empleado, imprimirHtmlInvisible]);

  const guardarJustificacionAusencia = useCallback(async (entry) => {
    if (!entry?.rowId) return;
    const draft = ausentismoDrafts[entry.id] || {};
    const note = String((draft.note ?? entry.data?.ausentismoNota) || "").trim();
    const files = Array.from(draft.files || []);
    const currentAttachments = Array.isArray(entry.data?.ausentismoAdjuntos)
      ? entry.data.ausentismoAdjuntos.map(normalizarAusentismoAdjunto)
      : [];

    if (!note && files.length === 0 && currentAttachments.length === 0) {
      toast({
        title: "Falta respaldo",
        description: "Agregá una nota o al menos un adjunto para justificar la ausencia.",
        variant: "destructive",
      });
      return;
    }

    try {
      setSubiendoAusentismoKey(entry.id);
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error("Iniciá sesión para adjuntar comprobantes.");
      const idToken = await currentUser.getIdToken();
      const uploaded = [];

      for (const file of files) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("employeeId", String(id));
        formData.append("weekStart", String(entry.weekStart));
        formData.append("dayKey", String(entry.dayKey));

        const res = await fetch("/api/asistencia/ausentismo/adjunto", {
          method: "POST",
          headers: {
            authorization: `Bearer ${idToken}`,
          },
          body: formData,
        });
        const data = await safeJson(res);
        if (!data?.ok) throw new Error(data?.error || "No se pudo subir el adjunto.");
        uploaded.push(normalizarAusentismoAdjunto(data.adjunto));
      }

      setGuardandoAusentismoKey(entry.id);
      const nextDay = {
        ...(entry.data || {}),
        estado: "ausente",
        monto: Number(entry.data?.monto || 0),
        ausentismoJustificado: true,
        ausentismoNota: note,
        ausentismoJustificadoAt: new Date().toISOString(),
        ausentismoAdjuntos: [...currentAttachments, ...uploaded],
      };

      await setDoc(
        doc(db, "asistencias", String(entry.rowId)),
        {
          days: {
            [entry.dayKey]: nextDay,
          },
        },
        { merge: true }
      );

      updateAsistenciaDayLocal(entry.rowId, entry.dayKey, nextDay);
      setAusentismoDrafts((prev) => ({
        ...prev,
        [entry.id]: {
          ...(prev[entry.id] || {}),
          note,
          files: [],
        },
      }));
      toast({ title: "Ausencia justificada correctamente" });
    } catch (error) {
      toast({
        title: "No se pudo guardar la justificación",
        description: error?.message || "Error",
        variant: "destructive",
      });
    } finally {
      setSubiendoAusentismoKey("");
      setGuardandoAusentismoKey("");
    }
  }, [ausentismoDrafts, id, updateAsistenciaDayLocal]);

  const eliminarAdjuntoAusentismo = useCallback(async (entry, adjunto) => {
    if (!entry?.rowId || !adjunto?.id) return;
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error("Iniciá sesión para gestionar adjuntos.");
      const idToken = await currentUser.getIdToken();

      if (adjunto.storagePath) {
        const res = await fetch("/api/asistencia/ausentismo/adjunto", {
          method: "DELETE",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({ storagePath: adjunto.storagePath }),
        });
        const data = await safeJson(res);
        if (!data?.ok) throw new Error(data?.error || "No se pudo eliminar el archivo.");
      }

      const remaining = (entry.data?.ausentismoAdjuntos || [])
        .map(normalizarAusentismoAdjunto)
        .filter((item) => String(item.id) !== String(adjunto.id));
      const note = String(entry.data?.ausentismoNota || "");
      const nextDay = {
        ...(entry.data || {}),
        ausentismoAdjuntos: remaining,
        ausentismoJustificado: Boolean(note || remaining.length > 0),
      };

      await setDoc(
        doc(db, "asistencias", String(entry.rowId)),
        {
          days: {
            [entry.dayKey]: nextDay,
          },
        },
        { merge: true }
      );

      updateAsistenciaDayLocal(entry.rowId, entry.dayKey, nextDay);
      toast({ title: "Adjunto eliminado" });
    } catch (error) {
      toast({
        title: "No se pudo eliminar el adjunto",
        description: error?.message || "Error",
        variant: "destructive",
      });
    }
  }, [updateAsistenciaDayLocal]);

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
    const tokenPlain = String(comprobanteMensualNormalizado?.public?.token || "").trim();
    const liquidacionId = String(comprobanteMensualNormalizado?.id || "").trim();

    if (tokenPlain) {
      const nextUrl = buildPublicUrl(tokenPlain);
      setPublicUrl((prev) => (prev === nextUrl ? prev : nextUrl));
      return;
    }

    if (!liquidacionId || publicUrl) return;

    let cancelled = false;
    const recover = async () => {
      const nextUrl = await generarLinkPublico(liquidacionId, { rotate: false });
      if (!cancelled && nextUrl) {
        setPublicUrl(nextUrl);
      }
    };
    recover();

    return () => {
      cancelled = true;
    };
  }, [buildPublicUrl, comprobanteMensualNormalizado?.id, comprobanteMensualNormalizado?.public?.token, generarLinkPublico, publicUrl]);

  const abrirLinkPublico = useCallback(() => {
    if (!publicUrl) return;
    window.open(publicUrl, "_blank", "noopener,noreferrer");
  }, [publicUrl]);

  const emitirComprobante = async () => {
    if (!empleado?.id) return;
    try {
      setEmitiendoComprobante(true);
      const nextVersion = Number(comprobanteMensualNormalizado?.version || 0) + 1;
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
        totExtras: Number(resumenMes.totExtras || 0),
        totAdv: Number(resumenMes.totAdv || 0),
        adelantosDetalle: Array.isArray(resumenMes.adelantosDetalle)
          ? resumenMes.adelantosDetalle.map(normalizarAdelantoDetalle)
          : [],
        extrasDetalle: Array.isArray(resumenMes.extrasDetalle)
          ? resumenMes.extrasDetalle.map(normalizarExtraDetalle)
          : [],
        totPagar: Number(resumenMes.totPagar || 0),
        premioAsistencia: {
          ...(resumenMes.premioAsistencia || {}),
          premio: Number(resumenMes.premioAsistencia?.premio || 0),
          porcentaje: Number(resumenMes.premioAsistencia?.porcentaje || 0),
          presentes: Number(resumenMes.premioAsistencia?.presentes || 0),
          medias: Number(resumenMes.premioAsistencia?.medias || 0),
          ausentes: Number(resumenMes.premioAsistencia?.ausentes || 0),
          justificadas: Number(resumenMes.premioAsistencia?.justificadas || 0),
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
                <span>Detalle Empleado</span>
              </div>
              <div className="space-y-2">
                <h1 className="text-[28px] font-bold tracking-tight text-slate-900 md:text-[34px]">
                  {employeeName}
                </h1>
                <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500">
                  {employeeSector ? (
                    <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 font-medium text-slate-600">
                      <Icon icon="lucide:briefcase-business" className="h-4 w-4 text-slate-400" />
                      {employeeSector}
                    </span>
                  ) : null}
                  <span
                    className={cn(
                      "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 font-medium",
                      resumenMes.isClosed
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-amber-200 bg-amber-50 text-amber-700"
                    )}
                  >
                    <Icon
                      icon={resumenMes.isClosed ? "lucide:badge-check" : "lucide:clock-3"}
                      className="h-4 w-4"
                    />
                    {resumenMes.isClosed ? "Resumen guardado" : "Mes abierto"}
                  </span>
                </div>
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
                disabled={!empleado?.id || emitiendoComprobante || generandoLink}
                className="rounded-xl bg-violet-600 text-white shadow-sm transition-all hover:bg-violet-700 focus-visible:ring-2 focus-visible:ring-violet-200 disabled:bg-violet-300 disabled:text-white disabled:shadow-none disabled:opacity-100"
              >
                {emitiendoComprobante
                  ? "Emitiendo..."
                  : comprobanteMensualNormalizado
                    ? "Reemitir comprobante"
                    : "Emitir comprobante"}
              </Button>
              <Button
                variant="outline"
                onClick={() => abrirComprobanteImprimible(comprobanteMensualNormalizado)}
                disabled={!comprobanteMensualNormalizado}
                className={ACTION_OUTLINE_BUTTON_CLASS}
              >
                Ver / imprimir
              </Button>
              <Button
                variant="outline"
                onClick={abrirValeImprimible}
                disabled={!empleado?.id}
                className={ACTION_OUTLINE_BUTTON_CLASS}
              >
                Imprimir Vale
              </Button>
              <Button
                variant="outline"
                onClick={abrirLinkPublico}
                disabled={!comprobanteMensualNormalizado || !publicUrl || generandoLink}
                className={ACTION_OUTLINE_BUTTON_CLASS}
              >
                {generandoLink ? "Preparando link..." : "Abrir link"}
              </Button>
            </div>

            {comprobanteMensualNormalizado ? (
              <div className="rounded-[22px] border border-slate-200 bg-slate-50/80 p-5">
                <div className="grid gap-4 md:grid-cols-[1fr_1fr_220px]">
                  <div>
                    <div className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">Emitido</div>
                    <div className="mt-2 text-sm font-semibold text-slate-900">{formatDateTimeAR(comprobanteMensualNormalizado.generatedAt)}</div>
                  </div>
                  <div className="md:text-right">
                    <div className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">Total a pagar</div>
                    <div className="mt-2 text-[28px] font-extrabold tracking-tight text-violet-600">
                      {formatCurrencyAR(comprobanteMensualNormalizado.totPagar || 0)}
                    </div>
                  </div>
                </div>

              </div>
            ) : (
              <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50/70 p-5 text-sm text-slate-500">
                {resumenMes.isClosed
                  ? "Todavía no hay comprobante emitido para este mes."
                  : "Todavía no hay comprobante emitido para este mes. Podés generarlo ahora mismo con los datos actuales, sin cerrar el mes."}
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
              <div className="rounded-[20px] border border-slate-200 bg-slate-50/80 p-4">
                <div className="flex items-center justify-between text-slate-600">
                  <span>Total trabajado</span>
                  <span className="font-semibold text-slate-900">{formatCurrencyAR(resumenFormula.trabajado)}</span>
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  Suma exacta de los jornales del mes seleccionado.
                </div>
              </div>

              <div className="rounded-[20px] border border-indigo-200 bg-indigo-50/70 p-4">
                <div className="flex items-center justify-between text-slate-600">
                  <span>Adicionales del mes</span>
                  <span className="font-semibold text-indigo-700">{formatCurrencyAR(resumenFormula.adicionales)}</span>
                </div>
                <div className="mt-1 text-xs text-indigo-700/80">
                  {resumenFormula.cantidadAdicionales.toLocaleString("es-AR")} registro{resumenFormula.cantidadAdicionales === 1 ? "" : "s"} de horas o jornadas adicionales.
                </div>
              </div>

              <div className="rounded-[20px] border border-orange-200 bg-orange-50/70 p-4">
                <div className="flex items-center justify-between text-slate-600">
                  <span>Adelantos del mes</span>
                  <span className="font-semibold text-orange-600">{formatCurrencyAR(resumenFormula.adelantosMes)}</span>
                </div>
                <div className="mt-1 text-xs text-orange-700/80">
                  Subtotal del mes: {resumenFormula.cantidadAdelantos.toLocaleString("es-AR")} movimiento{resumenFormula.cantidadAdelantos === 1 ? "" : "s"} cargado{resumenFormula.cantidadAdelantos === 1 ? "" : "s"}.
                </div>
              </div>

              <div className="rounded-[20px] border border-emerald-200 bg-emerald-50/70 p-4">
                <div className="flex items-center justify-between text-slate-600">
                  <span>Reconocimiento por asistencia</span>
                  <span className="font-semibold text-emerald-600">{formatCurrencyAR(resumenFormula.premio)}</span>
                </div>
                <div className="mt-1 text-xs text-emerald-700/80">
                  Se ajusta según asistencia, medias y llegadas tarde del mes.
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
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2 text-slate-600">
                      <span className="h-2.5 w-2.5 rounded-full bg-sky-400" />
                      <span>Justificadas</span>
                    </div>
                    <span className="font-semibold text-slate-900">{resumenMes.premioAsistencia?.justificadas || 0}</span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2 text-slate-600">
                      <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                      <span>Llegadas tarde</span>
                    </div>
                    <span className="font-semibold text-slate-900">{resumenMes.premioAsistencia?.tardanzas || 0}</span>
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
              <CardTitle className="text-sm font-semibold text-slate-900">Condiciones del reconocimiento</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="flex items-center justify-between gap-4">
                <span className="text-slate-600">Resultado</span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
                  {resumenMes.premioAsistencia?.estadoLabel || "Sin reconocimiento"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-slate-600">Asistencia minima</span>
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
              <div className="flex items-center justify-between gap-4">
                <span className="text-slate-600">Límite de llegadas tarde</span>
                <span className="font-semibold text-slate-900">
                  {Number(resumenMes.premioAsistencia?.config?.maxTardanzas || 0) > 0
                    ? resumenMes.premioAsistencia?.config?.maxTardanzas
                    : "Sin tope"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-slate-600">Hora de ingreso</span>
                <span className="font-semibold text-slate-900">
                  {resumenMes.premioAsistencia?.config?.horaIngreso || "Sin horario"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-slate-600">Margen permitido</span>
                <span className="font-semibold text-slate-900">
                  {Number(
                    resumenMes.premioAsistencia?.config?.toleranciaMinutos || 0,
                  ).toLocaleString("es-AR")}{" "}
                  min
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-slate-600">Reconocimiento base</span>
                <span className="font-semibold text-slate-900">
                  {formatCurrencyAR(resumenMes.premioAsistencia?.premioBase || resumenMes.premioAsistencia?.premio || 0)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-slate-600">Ajuste por llegadas tarde</span>
                <span className="font-semibold text-slate-900">
                  {formatCurrencyAR(resumenMes.premioAsistencia?.descuentoTardanzas || 0)}
                </span>
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

        <Card className="rounded-[24px] border border-slate-200 bg-white shadow-sm">
          <CardHeader className="gap-4 pb-3">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="space-y-1">
                <CardTitle className="text-sm font-semibold text-slate-900">
                  Historial de llegadas tarde
                </CardTitle>
                <div className="text-sm text-slate-500">
                  Fechas del período con ingreso fuera del horario esperado.
                </div>
              </div>

              <div className="w-full max-w-[220px] space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                    Orden por fecha
                  </label>
                  <select
                    value={ordenTardanzas}
                    onChange={(e) => setOrdenTardanzas(e.target.value)}
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-violet-300 focus:ring-2 focus:ring-violet-200"
                  >
                    <option value="desc">Más recientes primero</option>
                    <option value="asc">Más antiguas primero</option>
                  </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700">
                {resumenTardanzas.cantidad.toLocaleString("es-AR")} llegada{resumenTardanzas.cantidad === 1 ? "" : "s"} tarde
              </div>
              <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600">
                {Number(resumenTardanzas.minutos || 0).toLocaleString("es-AR")} min acumulados
              </div>
              {ordenTardanzas !== "desc" ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setOrdenTardanzas("desc");
                  }}
                  className="rounded-full border-slate-200 text-slate-600 hover:bg-slate-50"
                >
                  Limpiar filtros
                </Button>
              ) : null}
            </div>
          </CardHeader>
          <CardContent>
            {tardanzasMesOrdenadas.length > 0 ? (
              <>
                <div className="space-y-3 md:hidden">
                  {tardanzasMesOrdenadas.map((item) => (
                    <div
                      key={item.id}
                      className="rounded-[22px] border border-slate-200 bg-slate-50/70 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-slate-900">
                            {item.dayLabel} {formatDateAR(item.dateIso)}
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            Ingreso {item.horaLlegada || "-"} · Esperado {item.horaEsperada || "-"}
                          </div>
                        </div>
                        <div className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                          +{Number(item.minutosTarde || 0).toLocaleString("es-AR")} min
                        </div>
                      </div>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                            Retraso total
                          </div>
                          <div className="mt-2 text-sm font-semibold text-slate-900">
                            {Number(item.minutosDemora || item.minutosTarde || 0).toLocaleString("es-AR")} min
                          </div>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-white px-3 py-3">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                            Justificación
                          </div>
                          <div className="mt-2 text-sm text-slate-700">
                            {item.justificacion || "Sin detalle"}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="hidden overflow-hidden rounded-[18px] border border-slate-100 md:block">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 text-slate-500">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold">Fecha</th>
                        <th className="px-4 py-3 text-left font-semibold">Ingreso</th>
                        <th className="px-4 py-3 text-left font-semibold">Horario esperado</th>
                        <th className="px-4 py-3 text-right font-semibold">Minutos tarde</th>
                        <th className="px-4 py-3 text-left font-semibold">Justificación</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {tardanzasMesOrdenadas.map((item) => (
                        <tr key={item.id} className="bg-white">
                          <td className="px-4 py-3 text-slate-700">
                            <div className="font-medium text-slate-900">
                              {formatDateAR(item.dateIso)}
                            </div>
                            <div className="text-xs text-slate-500">{item.dayLabel}</div>
                          </td>
                          <td className="px-4 py-3 text-slate-700">
                            {item.horaLlegada || "-"}
                          </td>
                          <td className="px-4 py-3 text-slate-700">
                            {item.horaEsperada || "-"}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-amber-700">
                            +{Number(item.minutosTarde || 0).toLocaleString("es-AR")} min
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {item.justificacion || "Sin detalle"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50/70 px-4 py-6 text-center text-sm text-slate-500">
                No hay llegadas tarde registradas en el mes seleccionado.
              </div>
            )}
          </CardContent>
        </Card>

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
                      const weekEnd = weekStart && !Number.isNaN(weekStart.getTime()) ? addDays(weekStart, 6) : null;
                      const totalSemanaPeriodo = calcTotalSemanaEnMes(
                        item?.days,
                        item?.weekStart,
                        filtroMes,
                      );
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
                            {formatCurrencyAR(totalSemanaPeriodo)}
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
                      <th className="px-4 py-3 text-left font-semibold">Comprobante</th>
                      <th className="px-4 py-3 text-right font-semibold">Acciones</th>
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
                        <td className="px-4 py-3 text-slate-600">
                          {item?.comprobante?.emittedAt ? (
                            <div className="space-y-1">
                              <div className="text-sm font-semibold text-slate-900">
                                Versión {Number(item?.comprobante?.version || 1)}
                              </div>
                              <div className="text-xs text-slate-500">{formatDateTimeAR(item?.comprobante?.emittedAt)}</div>
                            </div>
                          ) : (
                            <span className="text-sm text-slate-400">Sin emitir</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="rounded-lg border-violet-200 text-violet-700 hover:bg-violet-50"
                              onClick={() => emitirComprobanteAdelanto(item)}
                              disabled={imprimiendoAdelantoId === String(item.id)}
                            >
                              {imprimiendoAdelantoId === String(item.id) ? "Emitiendo..." : "Comprobante"}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="rounded-lg text-red-600 hover:bg-red-50 hover:text-red-700"
                              onClick={() => deleteDoc(doc(db, "adelantos", item.id))}
                            >
                              Eliminar
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {adelantosOrdenados.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
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
                      <td className="px-4 py-3" />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="rounded-[24px] border border-slate-200 bg-white shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-sm font-semibold text-slate-900">Adicionales del mes</CardTitle>
            <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-600">
              Horas y jornadas adicionales
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-[18px] border border-slate-100">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">Fecha</th>
                    <th className="px-4 py-3 text-left font-semibold">Concepto</th>
                    <th className="px-4 py-3 text-left font-semibold">Detalle</th>
                    <th className="px-4 py-3 text-right font-semibold">Monto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {Array.isArray(resumenMes.extrasDetalle) &&
                  resumenMes.extrasDetalle.length > 0 ? (
                    <>
                      {resumenMes.extrasDetalle.map((item) => (
                        <tr key={item.id || `${item.fecha}-${item.monto}`} className="bg-white">
                          <td className="px-4 py-3 text-slate-700">{formatDateAR(item.fecha)}</td>
                          <td className="px-4 py-3 font-medium text-slate-900">{item.concepto || "Adicional"}</td>
                          <td className="px-4 py-3 text-slate-600">{item.detalle || item.nota || "-"}</td>
                          <td className="px-4 py-3 text-right font-semibold text-indigo-700">
                            {formatCurrencyAR(item.monto)}
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-slate-50">
                        <td colSpan={3} className="px-4 py-3 font-semibold text-slate-900">
                          Total adicionales
                        </td>
                        <td className="px-4 py-3 text-right font-extrabold text-slate-900">
                          {formatCurrencyAR(resumenFormula.adicionales)}
                        </td>
                      </tr>
                    </>
                  ) : (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-slate-500">
                        No hay adicionales cargados en el mes seleccionado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-[24px] border border-slate-200 bg-white shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-slate-900">Ausentismo justificado</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {ausenciasMes.length > 0 ? (
              <div className="space-y-4">
                {ausenciasMes.map((entry) => {
                  const draft = ausentismoDrafts[entry.id] || {};
                  const isBusy = guardandoAusentismoKey === entry.id || subiendoAusentismoKey === entry.id;
                  const currentNote = String((draft.note ?? entry.data?.ausentismoNota) || "");
                  const pendingFiles = Array.from(draft.files || []);
                  const currentAttachments = Array.isArray(entry.data?.ausentismoAdjuntos)
                    ? entry.data.ausentismoAdjuntos.map(normalizarAusentismoAdjunto)
                    : [];

                  return (
                    <div key={entry.id} className="rounded-[22px] border border-slate-200 bg-slate-50/70 p-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="text-sm font-semibold text-slate-900">
                              {entry.dayLabel} {formatDateAR(entry.dateIso)}
                            </div>
                            <span className={cn(
                              "rounded-full px-2.5 py-1 text-xs font-semibold",
                              entry.data?.ausentismoJustificado ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                            )}>
                              {entry.data?.ausentismoJustificado ? "Justificada" : "Sin justificar"}
                            </span>
                          </div>
                          <div className="text-xs text-slate-500">
                            La falta no paga el día, pero si la justificás no penaliza el presentismo.
                          </div>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-500">
                          Impacto en jornal: {formatCurrencyAR(entry.data?.monto || 0)}
                        </div>
                      </div>

                      <div className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                        <div className="space-y-3">
                          <div>
                            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Motivo / nota</div>
                            <Input
                              value={currentNote}
                              onChange={(e) => setAusentismoDraft(entry.id, { note: e.target.value })}
                              placeholder="Ej: certificado médico, reposo indicado, estudio, etc."
                              className="h-11 rounded-xl border-slate-200 bg-white"
                            />
                          </div>
                          <div>
                            <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Adjuntar comprobantes</div>
                            <Input
                              type="file"
                              accept=".pdf,image/png,image/jpeg,image/webp"
                              multiple
                              onChange={(e) => setAusentismoDraft(entry.id, { files: e.target.files ? Array.from(e.target.files) : [] })}
                              className="h-11 rounded-xl border-slate-200 bg-white file:mr-3 file:rounded-lg file:border-0 file:bg-violet-50 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-violet-700"
                            />
                            {pendingFiles.length > 0 ? (
                              <div className="mt-2 text-xs text-slate-500">
                                Pendientes para subir: {pendingFiles.map((file) => file.name).join(" · ")}
                              </div>
                            ) : null}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Button
                              onClick={() => guardarJustificacionAusencia(entry)}
                              disabled={isBusy}
                              className="rounded-xl bg-violet-600 text-white hover:bg-violet-700"
                            >
                              {isBusy ? "Guardando..." : entry.data?.ausentismoJustificado ? "Actualizar justificación" : "Justificar falta"}
                            </Button>
                          </div>
                        </div>

                        <div className="space-y-3">
                          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Resguardos cargados</div>
                          <div className="space-y-2">
                            {currentAttachments.length > 0 ? currentAttachments.map((adjunto) => (
                              <div key={adjunto.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-3">
                                <div className="min-w-0">
                                  <a
                                    href={adjunto.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="block truncate text-sm font-semibold text-violet-700 hover:text-violet-800"
                                  >
                                    {adjunto.nombreArchivo}
                                  </a>
                                  <div className="text-xs text-slate-500">
                                    {formatDateTimeAR(adjunto.uploadedAt)} · {Math.max(Math.round((adjunto.size || 0) / 1024), 1)} KB
                                  </div>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="rounded-lg text-red-600 hover:bg-red-50 hover:text-red-700"
                                  onClick={() => eliminarAdjuntoAusentismo(entry, adjunto)}
                                >
                                  Quitar
                                </Button>
                              </div>
                            )) : (
                              <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500">
                                Todavía no hay comprobantes adjuntos para esta falta.
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50/70 px-4 py-6 text-center text-sm text-slate-500">
                No hay faltas ausentes registradas en el mes seleccionado.
              </div>
            )}
          </CardContent>
        </Card>

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
