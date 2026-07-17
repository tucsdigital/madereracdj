"use client";
import React, { useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { db } from "@/lib/firebase";
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  where,
  addDoc,
  deleteDoc,
  updateDoc,
} from "firebase/firestore";
import { Icon } from "@iconify/react";
import {
  buildExtrasDetalleMensual,
  calcMontoAdicional,
  calcMontoJornada,
  calcularPremioAsistenciaMensual,
  calcularTotalExtrasMensual,
  calcularTotalLiquidacion,
  calcularTotalTrabajadoMensual,
  formatMonthKey,
  formatMonthLabel,
  getDayPaymentBreakdown,
  resolveEmployeeStartDate,
} from "@/lib/asistencia-utils";

// --- Helper Functions ---

function startOfWeek(d) {
  let date;
  if (typeof d === "string" && d.match(/^\d{4}-\d{2}-\d{2}$/)) {
    const [y, m, day] = d.split("-").map(Number);
    date = new Date(y, m - 1, day);
  } else {
    date = new Date(d);
  }
  const day = date.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  const res = new Date(date);
  res.setDate(date.getDate() + diff);
  res.setHours(0, 0, 0, 0);
  return res;
}

function addDays(d, n) {
  const res = new Date(d);
  res.setDate(res.getDate() + n);
  return res;
}

function fmt(d) {
  const date = new Date(d);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function fmtDM(d) {
  // Ajustar para mostrar día/mes local correctamente
  const date = new Date(d);
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}`;
}

function formatDateDisplay(d) {
  return new Date(d).toLocaleDateString("es-AR");
}

function toDateSafe(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "string" && value.match(/^\d{4}-\d{2}-\d{2}$/)) {
    const [y, m, day] = value.split("-").map(Number);
    return new Date(y, m - 1, day);
  }
  if (value && typeof value === "object" && "seconds" in value) {
    return new Date(value.seconds * 1000);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function dayKey(i) {
  return ["lun", "mar", "mie", "jue", "vie", "sab", "dom"][i];
}

function calcTotalSemanaLaboral(days) {
  const d = days && typeof days === "object" ? days : {};
  const keys = ["lun", "mar", "mie", "jue", "vie", "sab", "dom"];
  return keys.reduce((acc, k) => acc + Number(d?.[k]?.monto || 0), 0);
}

function contarDiasHabilesDelMes(dateObj, empleado = null) {
  const d = dateObj instanceof Date ? dateObj : new Date(dateObj);
  const y = d.getFullYear();
  const m = d.getMonth();
  const lastDay = new Date(y, m + 1, 0).getDate();
  const fechaIngreso = resolveEmployeeStartDate(empleado);
  let count = 0;
  for (let day = 1; day <= lastDay; day++) {
    const current = new Date(y, m, day);
    const dow = current.getDay();
    if (dow === 0 || dow === 6) continue;
    if (fechaIngreso && current < fechaIngreso) continue;
    count++;
  }
  return count;
}

function formatCurrencyAR(value) {
  return `$${Number(value || 0).toLocaleString("es-AR")}`;
}

function capitalizeText(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function getNameInitials(nombre) {
  const parts = String(nombre || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (parts.length === 0) return "EM";
  return parts.map((part) => part.charAt(0).toUpperCase()).join("");
}

function isJustifiedAbsence(dayData) {
  return (
    String(dayData?.estado || "") === "ausente" &&
    Boolean(dayData?.ausentismoJustificado)
  );
}

// --- Constants ---

const estadoItems = [
  {
    value: "presente",
    label: "P",
    icon: "lucide:check-circle",
    cls: "bg-green-50 text-green-700 border-green-200",
  },
  {
    value: "ausente",
    label: "A",
    icon: "lucide:x-circle",
    cls: "bg-red-50 text-red-700 border-red-200",
  },
  {
    value: "media",
    label: "½",
    icon: "lucide:clock-2",
    cls: "bg-yellow-50 text-yellow-800 border-yellow-200",
  },
];

const adicionalItems = [
  { value: "", label: "Sin importe extra" },
  { value: "horas", label: "Sumar horas" },
  { value: "jornada", label: "Sumar jornada" },
  { value: "manual", label: "Cargar importe" },
];

function buildAdicionalDraft(dayData) {
  return {
    tipo: String(dayData?.extraTipo || ""),
    cantidad:
      Number(dayData?.extraCantidad || 0) > 0
        ? String(dayData.extraCantidad)
        : "",
    monto:
      String(dayData?.extraTipo || "") === "manual" &&
      Number(dayData?.extraMonto || 0) > 0
        ? String(dayData.extraMonto)
        : "",
    nota: String(dayData?.extraNota || ""),
  };
}

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

export default function AsistenciaPage() {
  const router = useRouter();
  const { lang } = useParams();

  // --- Estados ---
  const [vistaActiva, setVistaActiva] = useState("asistencia"); // asistencia | empleados
  // Inicializar siempre al lunes de la semana actual
  const [fechaBase, setFechaBase] = useState(() =>
    fmt(startOfWeek(new Date())),
  );

  const [empleados, setEmpleados] = useState([]);
  const [filtroNombre, setFiltroNombre] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("activos");
  const [asistencias, setAsistencias] = useState({});
  const [adelantos, setAdelantos] = useState({});
  const [popoverEmpleado, setPopoverEmpleado] = useState(null);
  const [nuevoAdelanto, setNuevoAdelanto] = useState({
    fecha: fmt(new Date()),
    monto: "",
    nota: "",
  });
  const [cerrada, setCerrada] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(null);
  const [adicionalDrafts, setAdicionalDrafts] = useState({});
  const [asistenciasMensuales, setAsistenciasMensuales] = useState([]);
  const [adelantosMensuales, setAdelantosMensuales] = useState([]);
  const [mesResumen, setMesResumen] = useState(() =>
    new Date().toISOString().slice(0, 7),
  );
  const [monthAsistenciaPickerOpen, setMonthAsistenciaPickerOpen] =
    useState(false);
  const [monthAsistenciaPickerYear, setMonthAsistenciaPickerYear] = useState(
    new Date().getFullYear(),
  );
  const [monthResumenPickerOpen, setMonthResumenPickerOpen] = useState(false);
  const [monthResumenPickerYear, setMonthResumenPickerYear] = useState(
    new Date().getFullYear(),
  );
  const [cierresPremioMensuales, setCierresPremioMensuales] = useState({});
  const [guardandoCierreMes, setGuardandoCierreMes] = useState(false);

  // Estados para gestión de empleados (vista empleados)
  const [buscadorEmp, setBuscadorEmp] = useState("");
  const [filtroEmp, setFiltroEmp] = useState("activos");
  const [openEmp, setOpenEmp] = useState(false);
  const [editandoEmp, setEditandoEmp] = useState(null);
  const [formEmp, setFormEmp] = useState({
    nombre: "",
    activo: true,
    valorDia: "",
    valorExtra: "",
    sector: "",
    fechaIngreso: fmt(new Date()),
    premioAsistenciaActivo: false,
    premioAsistenciaMonto: "",
    premioAsistenciaMinPorcentaje: "100",
    premioAsistenciaMaxAusencias: "0",
    premioAsistenciaMaxMedias: "0",
    premioAsistenciaPesoMedia: "0.5",
  });

  // --- Memos ---
  const semanaInicio = useMemo(() => startOfWeek(fechaBase), [fechaBase]);
  const semanaClave = useMemo(() => fmt(semanaInicio), [semanaInicio]);

  const rangoSemana = useMemo(() => {
    const ini = formatDateDisplay(semanaInicio);
    const fin = formatDateDisplay(addDays(semanaInicio, 6));
    return `${ini} – ${fin}`;
  }, [semanaInicio]);

  const encabezadosDias = useMemo(() => {
    const nombres = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
    return [0, 1, 2, 3, 4, 5, 6].map((i) => ({
      nombre: nombres[i],
      fecha: fmtDM(addDays(semanaInicio, i)),
      esFinDeSemana: i >= 5,
    }));
  }, [semanaInicio]);

  const empleadosFiltrados = useMemo(() => {
    return empleados
      .filter((e) =>
        filtroEstado === "todos"
          ? true
          : filtroEstado === "activos"
            ? e.activo !== false
            : e.activo === false,
      )
      .filter((e) =>
        e.nombre?.toLowerCase().includes(filtroNombre.toLowerCase()),
      );
  }, [empleados, filtroEstado, filtroNombre]);

  const mesOperativoLabel = useMemo(() => {
    const [year, month] = String(mesResumen || "").split("-").map(Number);
    if (!year || !month) return "Mes actual";
    return capitalizeText(formatMonthLabel(new Date(year, month - 1, 1)) || "Mes actual");
  }, [mesResumen]);
  const asistenciaMonthDate = useMemo(() => {
    const [year, month] = String(mesResumen || "").split("-").map(Number);
    if (!year || !month) return new Date();
    return new Date(year, month - 1, 1);
  }, [mesResumen]);

  const asistenciaMonthIndex = asistenciaMonthDate.getMonth();
  const asistenciaMonthYear = asistenciaMonthDate.getFullYear();

  useEffect(() => {
    setMonthAsistenciaPickerYear(asistenciaMonthYear);
  }, [asistenciaMonthYear]);

  const seleccionarMesAsistencia = (year, monthIndex) => {
    const now = new Date();
    const nextMonth = String(monthIndex + 1).padStart(2, "0");
    const anchorDate =
      now.getFullYear() === year && now.getMonth() === monthIndex
        ? now
        : new Date(year, monthIndex, 1);
    setMesResumen(`${year}-${nextMonth}`);
    setFechaBase(fmt(startOfWeek(anchorDate)));
    setMonthAsistenciaPickerOpen(false);
  };

  const resumenOperacionVisible = useMemo(() => {
    const totalBruto = empleadosFiltrados.reduce((acc, emp) => {
      return acc + calcTotalSemanaLaboral(asistencias[emp.id]?.days);
    }, 0);
    const totalAdelantos = empleadosFiltrados.reduce((acc, emp) => {
      const adelantosEmp = adelantos[emp.id] || [];
      return (
        acc +
        adelantosEmp.reduce((sum, item) => sum + Number(item.monto || 0), 0)
      );
    }, 0);
    const empleadosConCarga = empleadosFiltrados.reduce((acc, emp) => {
      const totalEmp = calcTotalSemanaLaboral(asistencias[emp.id]?.days);
      const adelantosEmp = (adelantos[emp.id] || []).reduce(
        (sum, item) => sum + Number(item.monto || 0),
        0,
      );
      return acc + (totalEmp > 0 || adelantosEmp > 0 ? 1 : 0);
    }, 0);

    return {
      totalBruto,
      totalAdelantos,
      totalNeto: Math.max(totalBruto - totalAdelantos, 0),
      empleadosConCarga,
    };
  }, [adelantos, asistencias, empleadosFiltrados]);

  const empleadosGestionFiltrados = useMemo(() => {
    return empleados
      .filter((e) =>
        filtroEmp === "todos"
          ? true
          : filtroEmp === "activos"
            ? e.activo !== false
            : e.activo === false,
      )
      .filter((e) =>
        (e.nombre || "").toLowerCase().includes(buscadorEmp.toLowerCase()),
      );
  }, [empleados, filtroEmp, buscadorEmp]);

  const fechaMesResumen = useMemo(() => {
    const [y, m] = String(mesResumen || "")
      .split("-")
      .map(Number);
    if (!y || !m) return new Date();
    return new Date(y, m - 1, 1);
  }, [mesResumen]);

  const resumenMonthIndex = fechaMesResumen.getMonth();
  const resumenMonthYear = fechaMesResumen.getFullYear();

  useEffect(() => {
    setMonthResumenPickerYear(resumenMonthYear);
  }, [resumenMonthYear]);

  const seleccionarMesResumen = (year, monthIndex) => {
    const nextMonth = String(monthIndex + 1).padStart(2, "0");
    const now = new Date();
    const anchorDate =
      now.getFullYear() === year && now.getMonth() === monthIndex
        ? now
        : new Date(year, monthIndex, 1);
    setMesResumen(`${year}-${nextMonth}`);
    setFechaBase(fmt(startOfWeek(anchorDate)));
    setMonthResumenPickerOpen(false);
  };

  const cierreMesActual = useMemo(() => {
    return cierresPremioMensuales[mesResumen] || null;
  }, [cierresPremioMensuales, mesResumen]);

  const estadisticasMensualesLive = useMemo(() => {
    const porEmpleado = empleadosGestionFiltrados.map((emp) => {
      const diasHabiles = contarDiasHabilesDelMes(fechaMesResumen, emp);
      const objetivoCalculado =
        Number(emp.objetivoMensual || 0) > 0
          ? Number(emp.objetivoMensual)
          : Math.round(Number(emp.valorDia || 0) * diasHabiles);
      const trabajado = calcularTotalTrabajadoMensual({
        employeeId: emp.id,
        empleado: emp,
        asistencias: asistenciasMensuales,
        monthInput: fechaMesResumen,
      });
      const adicionales = calcularTotalExtrasMensual({
        employeeId: emp.id,
        empleado: emp,
        asistencias: asistenciasMensuales,
        monthInput: fechaMesResumen,
      });
      const cobrado = trabajado + adicionales;
      const premioAsistencia = calcularPremioAsistenciaMensual({
        empleado: emp,
        asistencias: asistenciasMensuales,
        monthInput: fechaMesResumen,
      });
      const adelanto = adelantosMensuales
        .filter((a) => {
          if (a.employeeId !== emp.id) return false;
          const fechaAdelanto = toDateSafe(a.fecha);
          if (!fechaAdelanto) return false;
          return (
            fechaAdelanto.getFullYear() === fechaMesResumen.getFullYear() &&
            fechaAdelanto.getMonth() === fechaMesResumen.getMonth()
          );
        })
        .reduce((acc, a) => acc + Number(a.monto || 0), 0);
      const faltante = Math.max(objetivoCalculado - trabajado, 0);
      const saldoALiquidar = Math.max(cobrado - adelanto, 0);
      const saldoConPremio = calcularTotalLiquidacion({
        totSemana: trabajado,
        totExtras: adicionales,
        totAdv: adelanto,
        premio: premioAsistencia.premio,
      });
      const progreso =
        objetivoCalculado > 0
          ? Math.min((trabajado / objetivoCalculado) * 100, 100)
          : 0;
      return {
        id: emp.id,
        nombre: emp.nombre || "",
        objetivo: objetivoCalculado,
        trabajado,
        adicionales,
        cobrado,
        adelanto,
        faltante,
        saldoALiquidar,
        saldoConPremio,
        progreso,
        premioAsistencia,
      };
    });
    const totalObjetivo = porEmpleado.reduce((acc, i) => acc + i.objetivo, 0);
    const totalTrabajado = porEmpleado.reduce((acc, i) => acc + i.trabajado, 0);
    const totalAdicionales = porEmpleado.reduce(
      (acc, i) => acc + i.adicionales,
      0,
    );
    const totalCobrado = porEmpleado.reduce((acc, i) => acc + i.cobrado, 0);
    const totalAdelantos = porEmpleado.reduce((acc, i) => acc + i.adelanto, 0);
    const totalFaltante = Math.max(totalObjetivo - totalTrabajado, 0);
    const totalPremios = porEmpleado.reduce(
      (acc, i) => acc + Number(i.premioAsistencia?.premio || 0),
      0,
    );
    return {
      porEmpleado: porEmpleado.sort((a, b) => b.cobrado - a.cobrado),
      totalObjetivo,
      totalTrabajado,
      totalAdicionales,
      totalCobrado,
      totalAdelantos,
      totalFaltante,
      totalPremios,
      labelMes: formatMonthLabel(fechaMesResumen),
      monthKey: formatMonthKey(fechaMesResumen),
    };
  }, [
    asistenciasMensuales,
    adelantosMensuales,
    empleadosGestionFiltrados,
    fechaMesResumen,
  ]);

  const estadisticasMensuales = useMemo(() => {
    if (!cierreMesActual) return estadisticasMensualesLive;
    const visibleIds = new Set(
      empleadosGestionFiltrados.map((emp) => String(emp.id)),
    );
    const porEmpleado = Array.isArray(cierreMesActual.empleados)
      ? cierreMesActual.empleados
          .filter((item) =>
            visibleIds.has(String(item.id || item.employeeId || "")),
          )
          .sort((a, b) => Number(b.cobrado || 0) - Number(a.cobrado || 0))
      : [];
    return {
      porEmpleado,
      totalObjetivo: porEmpleado.reduce(
        (acc, item) => acc + Number(item.objetivo || 0),
        0,
      ),
      totalTrabajado: porEmpleado.reduce(
        (acc, item) => acc + Number(item.trabajado || item.cobrado || 0),
        0,
      ),
      totalAdicionales: porEmpleado.reduce(
        (acc, item) => acc + Number(item.adicionales || item.extras || 0),
        0,
      ),
      totalCobrado: porEmpleado.reduce(
        (acc, item) => acc + Number(item.cobrado || 0),
        0,
      ),
      totalAdelantos: porEmpleado.reduce(
        (acc, item) => acc + Number(item.adelanto || 0),
        0,
      ),
      totalFaltante: porEmpleado.reduce(
        (acc, item) => acc + Number(item.faltante || 0),
        0,
      ),
      totalPremios: porEmpleado.reduce(
        (acc, item) => acc + Number(item.premioAsistencia?.premio || 0),
        0,
      ),
      labelMes: cierreMesActual.labelMes || formatMonthLabel(fechaMesResumen),
      monthKey: cierreMesActual.monthKey || formatMonthKey(fechaMesResumen),
      cerradoEn: cierreMesActual.closedAt || null,
      isClosed: true,
    };
  }, [
    cierreMesActual,
    estadisticasMensualesLive,
    empleadosGestionFiltrados,
    fechaMesResumen,
  ]);

  const estadisticasMensualesPorEmpleado = useMemo(() => {
    return Object.fromEntries(
      (estadisticasMensuales.porEmpleado || []).map((item) => [
        String(item.id),
        item,
      ]),
    );
  }, [estadisticasMensuales]);

  // --- Effects ---

  // Cargar datos al cambiar la semana
  useEffect(() => {
    let isActive = true;
    const unsubs = [];

    // Resetear estados visuales
    setAsistencias({});
    setCerrada(false);
    setAdelantos({});

    const load = async () => {
      try {
        // Cargar empleados
        const snapEmp = await getDocs(collection(db, "empleados"));
        if (!isActive) return;
        setEmpleados(snapEmp.docs.map((d) => ({ ...d.data(), id: d.id })));

        // Suscripción a asistencias
        const qAsis = query(
          collection(db, "asistencias"),
          where("weekStart", "==", semanaClave),
        );
        const unsubAsis = onSnapshot(qAsis, (s) => {
          if (!isActive) return;
          const map = {};
          let weekClosed = false;
          s.forEach((d) => {
            const data = d.data();
            map[data.employeeId] = { id: d.id, ...data };
            if (data.cerrada) weekClosed = true;
          });
          setAsistencias(map);
          setCerrada(weekClosed);
        });
        unsubs.push(unsubAsis);

        // Suscripción a adelantos
        const qAdv = query(
          collection(db, "adelantos"),
          where("weekStart", "==", semanaClave),
        );
        const unsubAdv = onSnapshot(qAdv, (s) => {
          if (!isActive) return;
          const byEmp = {};
          s.forEach((d) => {
            const a = { id: d.id, ...d.data() };
            if (!byEmp[a.employeeId]) byEmp[a.employeeId] = [];
            byEmp[a.employeeId].push(a);
          });
          setAdelantos(byEmp);
        });
        unsubs.push(unsubAdv);
      } catch (err) {
        console.error("Error cargando datos:", err);
      }
    };

    load();

    return () => {
      isActive = false;
      unsubs.forEach((u) => u());
    };
  }, [semanaClave]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "asistencias"), (s) => {
      const rows = [];
      s.forEach((d) => rows.push({ id: d.id, ...d.data() }));
      setAsistenciasMensuales(rows);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "adelantos"), (s) => {
      const rows = [];
      s.forEach((d) => rows.push({ id: d.id, ...d.data() }));
      setAdelantosMensuales(rows);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "premiosAsistenciaCierres"),
      (s) => {
        const map = {};
        s.forEach((d) => {
          map[d.id] = { id: d.id, ...d.data() };
        });
        setCierresPremioMensuales(map);
      },
    );
    return () => unsub();
  }, []);

  // --- Helpers Logic ---

  const totalAdelantosEmp = (empId) =>
    (adelantos[empId] || []).reduce((acc, a) => acc + Number(a.monto || 0), 0);

  const getDay = (empId, idx) => {
    const doc = asistencias[empId];
    const k = dayKey(idx);
    return doc?.days?.[k] || { estado: "ausente", monto: 0 };
  };

  const getAdicionalDraftKey = (empId, idx) => `${empId}-${idx}`;

  const setAdicionalDraft = (empId, idx, partial) => {
    const key = getAdicionalDraftKey(empId, idx);
    setAdicionalDrafts((prev) => ({
      ...prev,
      [key]: {
        ...(prev[key] || {}),
        ...partial,
      },
    }));
  };

  const persistDay = async (emp, idx, dayData) => {
    if (cerrada) return;
    if (!emp?.id) return;
    const k = dayKey(idx);
    const prev = asistencias[emp.id];
    const days = { ...(prev?.days || {}), [k]: dayData };
    const totalSemana = calcTotalSemanaLaboral(days);

    const data = {
      employeeId: emp.id,
      employeeNombre: emp.nombre || "",
      weekStart: semanaClave,
      days,
      totalSemana,
      cerrada: prev?.cerrada || false,
    };

    try {
      if (prev?.id) {
        await setDoc(doc(db, "asistencias", prev.id), data, { merge: true });
      } else {
        const ref = doc(collection(db, "asistencias"));
        await setDoc(ref, { ...data, id: ref.id });
      }
    } catch (err) {
      console.error("Error guardando asistencia:", err);
    }
  };

  const setDay = async (emp, idx, estado) => {
    const prevDay = getDay(emp.id, idx);
    const dateInput = addDays(semanaInicio, idx);
    const breakdown = getDayPaymentBreakdown({
      dayData: prevDay,
      empleado: emp,
      dateInput,
    });
    const montoJornada = calcMontoJornada({
      estado,
      valorDia: Number(emp.valorDia || 0),
      isWeekend: idx >= 5,
    });
    const nextDay = {
      ...prevDay,
      estado,
      montoJornada,
      extraTipo: breakdown.extraTipo || "",
      extraCantidad: breakdown.extraCantidad || 0,
      extraNota: breakdown.extraNota || "",
      extraMonto: breakdown.extraMonto || 0,
      monto: Number((Number(montoJornada || 0) + Number(breakdown.extraMonto || 0)).toFixed(2)),
    };
    await persistDay(emp, idx, nextDay);
  };

  const guardarAdicional = async (emp, idx) => {
    const prevDay = getDay(emp.id, idx);
    const draft = adicionalDrafts[getAdicionalDraftKey(emp.id, idx)] || buildAdicionalDraft(prevDay);
    const tipo = String(draft.tipo || "");
    const cantidad = tipo === "horas" ? Number(draft.cantidad || 0) : 0;
    const montoManual = tipo === "manual" ? Number(draft.monto || 0) : 0;
    const extraMonto = calcMontoAdicional({
      empleado: emp,
      tipo,
      cantidad,
      montoManual,
    });
    const montoJornada = calcMontoJornada({
      estado: String(prevDay.estado || "ausente"),
      valorDia: Number(emp.valorDia || 0),
      isWeekend: idx >= 5,
    });
    const nextDay = {
      ...prevDay,
      montoJornada,
      extraTipo: tipo,
      extraCantidad: tipo === "horas" ? cantidad : 0,
      extraNota: String(draft.nota || ""),
      extraMonto,
      monto: Number((Number(montoJornada || 0) + Number(extraMonto || 0)).toFixed(2)),
    };
    await persistDay(emp, idx, nextDay);
    setPickerOpen(null);
  };

  const cancelarAdicional = (empId, idx) => {
    const savedDay = getDay(empId, idx);
    setAdicionalDrafts((prev) => ({
      ...prev,
      [getAdicionalDraftKey(empId, idx)]: buildAdicionalDraft(savedDay),
    }));
    setPickerOpen(null);
  };

  const cerrarSemana = async () => {
    if (
      !confirm(
        "¿Bloquear el tramo visible? No se podrán hacer más cambios en estos días.",
      )
    )
      return;
    try {
      const updates = Object.values(asistencias);
      for (const a of updates) {
        const totalSemana = calcTotalSemanaLaboral(a?.days);
        await setDoc(
          doc(db, "asistencias", a.id),
          { cerrada: true, totalSemana, snapshotTotal: totalSemana },
          { merge: true },
        );
      }
      setCerrada(true);
    } catch (err) {
      console.error("Error bloqueando tramo visible:", err);
    }
  };

  const navSemana = (dir) => {
    const delta = dir === -1 ? -7 : 7;
    const nextWeekStart = addDays(semanaInicio, delta);
    const nextMonthKey = formatMonthKey(addDays(nextWeekStart, 4));
    setFechaBase(fmt(nextWeekStart));
    setMesResumen((prev) => (prev === nextMonthKey ? prev : nextMonthKey));
  };

  // --- Adelantos Logic ---

  const abrirPopoverAdelantos = (emp) => {
    setPopoverEmpleado(emp);
    setNuevoAdelanto({ fecha: fmt(new Date()), monto: "", nota: "" });
  };

  const agregarAdelanto = async () => {
    if (!popoverEmpleado) return;
    try {
      const data = {
        employeeId: popoverEmpleado.id,
        employeeNombre: popoverEmpleado.nombre || "",
        weekStart: semanaClave,
        fecha: nuevoAdelanto.fecha,
        monto: Number(nuevoAdelanto.monto || 0),
        nota: nuevoAdelanto.nota || "",
      };
      await addDoc(collection(db, "adelantos"), data);
      setNuevoAdelanto({ fecha: fmt(new Date()), monto: "", nota: "" });
    } catch (err) {
      console.error("Error agregando adelanto:", err);
    }
  };

  const eliminarAdelanto = async (id) => {
    if (!confirm("¿Eliminar adelanto?")) return;
    try {
      await deleteDoc(doc(db, "adelantos", id));
    } catch (err) {
      console.error("Error eliminando adelanto:", err);
    }
  };

  // --- Empleados Logic ---

  const cerrarPremioMes = async () => {
    if (
      !confirm(
        `¿Cerrar el premio del mes ${estadisticasMensualesLive.labelMes}? Se congelará la liquidación mensual hasta reabrirlo.`,
      )
    )
      return;
    try {
      setGuardandoCierreMes(true);
      const payload = {
        monthKey: estadisticasMensualesLive.monthKey,
        labelMes: estadisticasMensualesLive.labelMes,
        closedAt: new Date().toISOString(),
        empleados: estadisticasMensualesLive.porEmpleado.map((item) => ({
          id: item.id,
          employeeId: item.id,
          nombre: item.nombre,
          objetivo: Number(item.objetivo || 0),
          trabajado: Number(item.trabajado || 0),
          adicionales: Number(item.adicionales || 0),
          extras: Number(item.adicionales || 0),
          cobrado: Number(item.cobrado || 0),
          adelanto: Number(item.adelanto || 0),
          faltante: Number(item.faltante || 0),
          saldoALiquidar: Number(item.saldoALiquidar || 0),
          saldoConPremio: Number(item.saldoConPremio || 0),
          progreso: Number(item.progreso || 0),
          premioAsistencia: {
            ...(item.premioAsistencia || {}),
            premio: Number(item.premioAsistencia?.premio || 0),
            porcentaje: Number(item.premioAsistencia?.porcentaje || 0),
            presentes: Number(item.premioAsistencia?.presentes || 0),
            medias: Number(item.premioAsistencia?.medias || 0),
            ausentes: Number(item.premioAsistencia?.ausentes || 0),
            justificadas: Number(item.premioAsistencia?.justificadas || 0),
            diasEsperados: Number(item.premioAsistencia?.diasEsperados || 0),
          },
        })),
      };
      await setDoc(
        doc(db, "premiosAsistenciaCierres", estadisticasMensualesLive.monthKey),
        payload,
        { merge: true },
      );
    } catch (err) {
      console.error("Error cerrando premio mensual:", err);
    } finally {
      setGuardandoCierreMes(false);
    }
  };

  const reabrirPremioMes = async () => {
    if (!cierreMesActual) return;
    if (
      !confirm(
        `¿Reabrir el mes ${cierreMesActual.labelMes || estadisticasMensuales.labelMes}? El premio volverá a calcularse en vivo.`,
      )
    )
      return;
    try {
      setGuardandoCierreMes(true);
      await deleteDoc(
        doc(db, "premiosAsistenciaCierres", cierreMesActual.id || mesResumen),
      );
    } catch (err) {
      console.error("Error reabriendo premio mensual:", err);
    } finally {
      setGuardandoCierreMes(false);
    }
  };

  const abrirNuevoEmp = () => {
    setEditandoEmp(null);
    setFormEmp({
      nombre: "",
      activo: true,
      valorDia: "",
      valorExtra: "",
      sector: "",
      fechaIngreso: fmt(new Date()),
      premioAsistenciaActivo: false,
      premioAsistenciaMonto: "",
      premioAsistenciaMinPorcentaje: "100",
      premioAsistenciaMaxAusencias: "0",
      premioAsistenciaMaxMedias: "0",
      premioAsistenciaPesoMedia: "0.5",
    });
    setOpenEmp(true);
  };

  const abrirEditarEmp = (emp) => {
    setEditandoEmp(emp);
    setFormEmp({
      nombre: emp.nombre || "",
      activo: emp.activo !== false,
      valorDia: emp.valorDia ?? "",
      valorExtra: emp.valorExtra ?? "",
      sector: emp.sector || "",
      fechaIngreso: emp.fechaIngreso || "",
      premioAsistenciaActivo: Boolean(emp.premioAsistenciaActivo),
      premioAsistenciaMonto: emp.premioAsistenciaMonto ?? "",
      premioAsistenciaMinPorcentaje: emp.premioAsistenciaMinPorcentaje ?? 100,
      premioAsistenciaMaxAusencias: emp.premioAsistenciaMaxAusencias ?? 0,
      premioAsistenciaMaxMedias: emp.premioAsistenciaMaxMedias ?? 0,
      premioAsistenciaPesoMedia: emp.premioAsistenciaPesoMedia ?? 0.5,
    });
    setOpenEmp(true);
  };

  const guardarEmp = async () => {
    const payload = {
      nombre: (formEmp.nombre || "").trim(),
      activo: Boolean(formEmp.activo),
      valorDia: Number(formEmp.valorDia || 0),
      valorExtra: Number(formEmp.valorExtra || 0),
      sector: formEmp.sector || "",
      fechaIngreso: String(formEmp.fechaIngreso || "").trim() || null,
      premioAsistenciaActivo: Boolean(formEmp.premioAsistenciaActivo),
      premioAsistenciaMonto: Boolean(formEmp.premioAsistenciaActivo)
        ? Number(formEmp.premioAsistenciaMonto || 0)
        : 0,
      premioAsistenciaMinPorcentaje: Boolean(formEmp.premioAsistenciaActivo)
        ? Number(formEmp.premioAsistenciaMinPorcentaje ?? 100)
        : 100,
      premioAsistenciaMaxAusencias: Boolean(formEmp.premioAsistenciaActivo)
        ? Number(formEmp.premioAsistenciaMaxAusencias ?? 0)
        : 0,
      premioAsistenciaMaxMedias: Boolean(formEmp.premioAsistenciaActivo)
        ? Number(formEmp.premioAsistenciaMaxMedias ?? 0)
        : 0,
      premioAsistenciaPesoMedia: Boolean(formEmp.premioAsistenciaActivo)
        ? Number(formEmp.premioAsistenciaPesoMedia ?? 0.5)
        : 0.5,
    };
    if (!payload.nombre) return;

    try {
      if (editandoEmp) {
        await updateDoc(doc(db, "empleados", editandoEmp.id), payload);
      } else {
        await addDoc(collection(db, "empleados"), payload);
      }
      // Recargar lista
      const snap = await getDocs(collection(db, "empleados"));
      setEmpleados(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
      setOpenEmp(false);
    } catch (err) {
      console.error("Error guardando empleado:", err);
    }
  };

  const eliminarEmp = async (emp) => {
    if (!confirm("¿Eliminar empleado?")) return;
    try {
      await deleteDoc(doc(db, "empleados", emp.id));
      const snap = await getDocs(collection(db, "empleados"));
      setEmpleados(snap.docs.map((d) => ({ ...d.data(), id: d.id })));
    } catch (err) {
      console.error("Error eliminando empleado:", err);
    }
  };

  // --- Render ---

  return (
    <div className="flex flex-col gap-6 py-8 mx-auto font-sans">
      {/* Header */}
      <div className="overflow-hidden rounded-[30px] border border-slate-200 bg-[linear-gradient(135deg,rgba(255,255,255,0.98),rgba(248,250,252,0.94))] shadow-[0_28px_65px_-35px_rgba(15,23,42,0.35)]">
        {vistaActiva === "asistencia" ? (
          <div className="space-y-4 px-5 py-5 md:px-6 md:py-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="space-y-2">
                <div className="space-y-2">
                  <h1 className="text-[30px] font-bold tracking-tight text-slate-950 md:text-[32px]">
                    Planilla mensual de asistencia
                  </h1>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs font-medium text-slate-500">
                <span>{mesOperativoLabel}</span>
                <span className="h-1 w-1 rounded-full bg-slate-300" />
                <span
                  className={
                    cerrada ? "font-semibold text-rose-600" : "font-semibold text-emerald-600"
                  }
                >
                  {cerrada ? "Tramo bloqueado" : "Tramo editable"}
                </span>
              </div>
            </div>

            <div className="space-y-3 border-t border-slate-200/80 pt-4">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex min-w-0 flex-1 flex-col gap-3 md:flex-row">
                  <div className="relative min-w-0 flex-1">
                    <Icon
                      icon="lucide:search"
                      className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                    />
                    <Input
                      placeholder="Buscar empleado"
                      value={filtroNombre}
                      onChange={(e) => setFiltroNombre(e.target.value)}
                      className="h-11 rounded-2xl border-slate-200 bg-white pl-11 text-sm shadow-none"
                    />
                  </div>
                  <select
                    value={filtroEstado}
                    onChange={(e) => setFiltroEstado(e.target.value)}
                    className="h-11 min-w-[170px] rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 shadow-none"
                  >
                    <option value="activos">Activos</option>
                    <option value="inactivos">Inactivos</option>
                    <option value="todos">Todos</option>
                  </select>
                </div>

                <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                  <div className="flex items-center gap-1 rounded-2xl bg-slate-100 p-1">
                    <button
                        type="button"
                        onClick={() => setVistaActiva("asistencia")}
                        className={`min-w-[90px] rounded-xl px-3 py-2 text-xs font-semibold transition ${
                          vistaActiva === "asistencia"
                            ? "bg-violet-100 text-violet-700 shadow-sm"
                            : "text-slate-500 hover:bg-white hover:text-slate-700"
                        }`}
                      >
                        Asistencias
                      </button>
                    <button
                        type="button"
                        onClick={() => setVistaActiva("empleados")}
                        className={`min-w-[90px] rounded-xl px-3 py-2 text-xs font-semibold transition ${
                          vistaActiva === "empleados"
                            ? "bg-violet-100 text-violet-700 shadow-sm"
                            : "text-slate-500 hover:bg-white hover:text-slate-700"
                        }`}
                      >
                        Empleados
                    </button>
                  </div>

                  <div>
                    <Popover
                      open={monthAsistenciaPickerOpen}
                      onOpenChange={setMonthAsistenciaPickerOpen}
                    >
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          className="h-10 min-w-[158px] justify-between rounded-xl border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-none hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700"
                        >
                          <span className="flex items-center gap-2">
                            <Icon
                              icon="lucide:calendar-days"
                              className="h-4 w-4 text-violet-500"
                            />
                            <span>
                              {MONTHS_ES[asistenciaMonthIndex]} {asistenciaMonthYear}
                            </span>
                          </span>
                          <Icon
                            icon="lucide:chevron-down"
                            className="h-4 w-4 text-slate-400"
                          />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        align="end"
                        className="w-[320px] rounded-[22px] border border-slate-200 bg-white p-0 shadow-[0_24px_60px_-25px_rgba(15,23,42,0.28)]"
                      >
                        <div className="space-y-4 p-4">
                          <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-3 py-2">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9 rounded-xl text-slate-600 hover:bg-white"
                              onClick={() =>
                                setMonthAsistenciaPickerYear((prev) => prev - 1)
                              }
                            >
                              <Icon
                                icon="lucide:chevron-left"
                                className="h-4 w-4"
                              />
                            </Button>
                            <div className="text-sm font-semibold text-slate-900">
                              {monthAsistenciaPickerYear}
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9 rounded-xl text-slate-600 hover:bg-white"
                              onClick={() =>
                                setMonthAsistenciaPickerYear((prev) => prev + 1)
                              }
                            >
                              <Icon
                                icon="lucide:chevron-right"
                                className="h-4 w-4"
                              />
                            </Button>
                          </div>

                          <div className="grid grid-cols-3 gap-2">
                            {MONTHS_ES.map((monthLabel, monthIndex) => {
                              const isActive =
                                monthIndex === asistenciaMonthIndex &&
                                monthAsistenciaPickerYear === asistenciaMonthYear;
                              return (
                                <button
                                  key={monthLabel}
                                  type="button"
                                  onClick={() =>
                                    seleccionarMesAsistencia(
                                      monthAsistenciaPickerYear,
                                      monthIndex,
                                    )
                                  }
                                  className={`rounded-2xl px-3 py-3 text-sm font-medium transition-all ${
                                    isActive
                                      ? "bg-violet-600 text-white shadow-[0_14px_28px_-16px_rgba(124,58,237,0.95)]"
                                      : "bg-slate-50 text-slate-600 hover:bg-violet-50 hover:text-violet-700"
                                  }`}
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
                                seleccionarMesAsistencia(
                                  now.getFullYear(),
                                  now.getMonth(),
                                );
                              }}
                              className="text-sm font-semibold text-violet-600 transition hover:text-violet-700"
                            >
                              Ir al mes actual
                            </button>
                            <div className="text-xs text-slate-400">
                              Elegí el mes a visualizar
                            </div>
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div>
                    <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50/80 p-1">
                      <Button
                        variant="ghost"
                        onClick={() => navSemana(-1)}
                        className="h-9 w-9 rounded-xl p-0 text-slate-600 hover:bg-white"
                      >
                        <Icon icon="lucide:chevron-left" className="h-4 w-4" />
                      </Button>
                      <div className="min-w-[172px] rounded-xl bg-white px-4 py-2 text-center text-xs font-semibold text-slate-700">
                        {rangoSemana}
                      </div>
                      <Button
                        variant="ghost"
                        onClick={() => navSemana(1)}
                        className="h-9 w-9 rounded-xl p-0 text-slate-600 hover:bg-white"
                      >
                        <Icon icon="lucide:chevron-right" className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <Button
                    variant="outline"
                    onClick={() => {
                      const now = new Date();
                      setFechaBase(fmt(startOfWeek(now)));
                      setMesResumen((prev) => {
                        const nextMonthKey = formatMonthKey(now);
                        return prev === nextMonthKey ? prev : nextMonthKey;
                      });
                    }}
                    className="h-10 rounded-xl border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-700 shadow-none hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700"
                  >
                    Ir al tramo actual
                  </Button>
                  <Button
                    variant="default"
                    onClick={cerrarSemana}
                    disabled={cerrada}
                    className="h-10 rounded-xl bg-violet-600 px-3.5 text-sm font-semibold text-white shadow-[0_16px_28px_-18px_rgba(124,58,237,0.85)] hover:bg-violet-700"
                  >
                    <Icon icon="lucide:lock" className="mr-2 h-4 w-4" />
                    Bloquear tramo
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4 px-5 py-5 md:px-6 md:py-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="space-y-2">
                <div className="space-y-2">
                  <h1 className="text-[30px] font-bold tracking-tight text-slate-950 md:text-[32px]">
                    Gestión de empleados
                  </h1>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs font-medium text-slate-500">
                <span>{estadisticasMensuales.labelMes}</span>
                <span className="h-1 w-1 rounded-full bg-slate-300" />
                <span
                  className={
                    cierreMesActual ? "font-semibold text-amber-600" : "font-semibold text-emerald-600"
                  }
                >
                  {cierreMesActual ? "Resumen guardado" : "Mes editable"}
                </span>
              </div>
            </div>

            <div className="space-y-3 border-t border-slate-200/80 pt-4">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex min-w-0 flex-1 flex-col gap-3 md:flex-row">
                  <div className="relative min-w-0 flex-1">
                    <Icon
                      icon="lucide:search"
                      className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                    />
                    <Input
                      placeholder="Buscar empleado"
                      value={buscadorEmp}
                      onChange={(e) => setBuscadorEmp(e.target.value)}
                      className="h-11 rounded-2xl border-slate-200 bg-white pl-11 text-sm shadow-none"
                    />
                  </div>
                  <select
                    value={filtroEmp}
                    onChange={(e) => setFiltroEmp(e.target.value)}
                    className="h-11 min-w-[170px] rounded-2xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 shadow-none"
                  >
                    <option value="activos">Activos</option>
                    <option value="inactivos">Inactivos</option>
                    <option value="todos">Todos</option>
                  </select>
                  <Button
                    className="h-11 rounded-2xl bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800"
                    onClick={abrirNuevoEmp}
                  >
                    Nuevo empleado
                  </Button>
                </div>

                <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                  <div className="flex items-center gap-1 rounded-2xl bg-slate-100 p-1">
                    <button
                        type="button"
                        onClick={() => setVistaActiva("asistencia")}
                        className={`min-w-[90px] rounded-xl px-3 py-2 text-xs font-semibold transition ${
                          vistaActiva === "asistencia"
                            ? "bg-violet-100 text-violet-700 shadow-sm"
                            : "text-slate-500 hover:bg-white hover:text-slate-700"
                        }`}
                      >
                        Asistencias
                      </button>
                    <button
                        type="button"
                        onClick={() => setVistaActiva("empleados")}
                        className={`min-w-[90px] rounded-xl px-3 py-2 text-xs font-semibold transition ${
                          vistaActiva === "empleados"
                            ? "bg-violet-100 text-violet-700 shadow-sm"
                            : "text-slate-500 hover:bg-white hover:text-slate-700"
                        }`}
                      >
                        Empleados
                    </button>
                  </div>

                  <div>
                    <Popover
                      open={monthResumenPickerOpen}
                      onOpenChange={setMonthResumenPickerOpen}
                    >
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          className="h-10 min-w-[158px] justify-between rounded-xl border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-none hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700"
                        >
                          <span className="flex items-center gap-2">
                            <Icon
                              icon="lucide:calendar-days"
                              className="h-4 w-4 text-violet-500"
                            />
                            <span>
                              {MONTHS_ES[resumenMonthIndex]} {resumenMonthYear}
                            </span>
                          </span>
                          <Icon
                            icon="lucide:chevron-down"
                            className="h-4 w-4 text-slate-400"
                          />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        align="end"
                        className="w-[320px] rounded-[22px] border border-slate-200 bg-white p-0 shadow-[0_24px_60px_-25px_rgba(15,23,42,0.28)]"
                      >
                        <div className="space-y-4 p-4">
                          <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-3 py-2">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9 rounded-xl text-slate-600 hover:bg-white"
                              onClick={() =>
                                setMonthResumenPickerYear((prev) => prev - 1)
                              }
                            >
                              <Icon
                                icon="lucide:chevron-left"
                                className="h-4 w-4"
                              />
                            </Button>
                            <div className="text-sm font-semibold text-slate-900">
                              {monthResumenPickerYear}
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9 rounded-xl text-slate-600 hover:bg-white"
                              onClick={() =>
                                setMonthResumenPickerYear((prev) => prev + 1)
                              }
                            >
                              <Icon
                                icon="lucide:chevron-right"
                                className="h-4 w-4"
                              />
                            </Button>
                          </div>

                          <div className="grid grid-cols-3 gap-2">
                            {MONTHS_ES.map((monthLabel, monthIndex) => {
                              const isActive =
                                monthIndex === resumenMonthIndex &&
                                monthResumenPickerYear === resumenMonthYear;
                              return (
                                <button
                                  key={monthLabel}
                                  type="button"
                                  onClick={() =>
                                    seleccionarMesResumen(
                                      monthResumenPickerYear,
                                      monthIndex,
                                    )
                                  }
                                  className={`rounded-2xl px-3 py-3 text-sm font-medium transition-all ${
                                    isActive
                                      ? "bg-violet-600 text-white shadow-[0_14px_28px_-16px_rgba(124,58,237,0.95)]"
                                      : "bg-slate-50 text-slate-600 hover:bg-violet-50 hover:text-violet-700"
                                  }`}
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
                                seleccionarMesResumen(
                                  now.getFullYear(),
                                  now.getMonth(),
                                );
                              }}
                              className="text-sm font-semibold text-violet-600 transition hover:text-violet-700"
                            >
                              Ir al mes actual
                            </button>
                            <div className="text-xs text-slate-400">
                              Elegí el mes a visualizar
                            </div>
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>

                  {cierreMesActual ? (
                    <Button
                      variant="outline"
                      onClick={reabrirPremioMes}
                      disabled={guardandoCierreMes}
                      className="h-10 rounded-xl border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-700 shadow-none hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700"
                    >
                      {guardandoCierreMes
                        ? "Reabriendo..."
                        : "Volver a editar mes"}
                    </Button>
                  ) : (
                    <Button
                      variant="default"
                      onClick={cerrarPremioMes}
                      disabled={
                        guardandoCierreMes ||
                        estadisticasMensualesLive.porEmpleado.length === 0
                      }
                    className="h-10 rounded-xl bg-violet-600 px-3.5 text-sm font-semibold text-white shadow-[0_16px_28px_-18px_rgba(124,58,237,0.85)] hover:bg-violet-700"
                    >
                      {guardandoCierreMes
                        ? "Guardando..."
                        : "Guardar cierre del mes"}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Contenido Principal */}
      {vistaActiva === "asistencia" ? (
        <div className="space-y-4">
          <div className="overflow-visible rounded-[24px] border border-slate-200 bg-slate-50/70 shadow-sm">
            <div className="overflow-x-auto overflow-y-visible">
            <table className="min-w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50/90">
                <tr>
                  <th className="px-4 py-4 text-left align-middle text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Empleado
                  </th>
                  {encabezadosDias.map((item, i) => (
                    <th
                      key={i}
                      className={`px-2 py-3 text-center align-middle ${item.esFinDeSemana ? "bg-slate-100/80" : ""}`}
                    >
                      <div className="flex min-w-[64px] flex-col items-center gap-1">
                        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                          {item.nombre}
                        </span>
                        <span className={`text-[11px] font-medium ${item.esFinDeSemana ? "text-slate-700" : "text-slate-600"}`}>
                          {item.fecha}
                        </span>
                        <span className="h-1 w-1 rounded-full bg-emerald-400/80" />
                      </div>
                    </th>
                  ))}
                  <th className="px-4 py-4 text-right align-middle text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Total
                  </th>
                  <th className="px-4 py-4 text-right align-middle text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Extras
                  </th>
                  <th className="px-4 py-4 text-right align-middle text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Adelantos
                  </th>
                  <th className="px-4 py-4 text-right align-middle text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Neto
                  </th>
                  <th className="px-4 py-4 text-center align-middle text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {empleadosFiltrados.map((emp, empIdx) => {
                  const a = asistencias[emp.id];
                  const breakdownsSemana = [0, 1, 2, 3, 4, 5, 6].map((idx) =>
                    getDayPaymentBreakdown({
                      dayData: a?.days?.[dayKey(idx)],
                      empleado: emp,
                      dateInput: addDays(semanaInicio, idx),
                    }),
                  );
                  const tSemana = breakdownsSemana.reduce(
                    (acc, item) => acc + Number(item.montoJornada || 0),
                    0,
                  );
                  const tExtras = breakdownsSemana.reduce(
                    (acc, item) => acc + Number(item.extraMonto || 0),
                    0,
                  );
                  const tAdv = totalAdelantosEmp(emp.id);
                  const tPagar = tSemana + tExtras - tAdv;
                  return (
                    <tr
                      key={emp.id}
                      className="transition-colors hover:bg-slate-50/80"
                    >
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-100 text-sm font-bold text-violet-700 shadow-sm">
                            {getNameInitials(emp.nombre)}
                          </div>
                          <div className="space-y-1">
                            <div className="font-semibold text-slate-900">
                              {emp.nombre || ""}
                            </div>
                            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                              <span>{emp.sector || "Sin sector"}</span>
                              <span
                                className={`inline-flex rounded-full px-2 py-0.5 font-medium ${emp.activo !== false ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}
                              >
                                {emp.activo !== false ? "Activo" : "Inactivo"}
                              </span>
                            </div>
                          </div>
                        </div>
                      </td>
                      {[0, 1, 2, 3, 4, 5, 6].map((i) => {
                        const d = getDay(emp.id, i);
                        const dayDate = addDays(semanaInicio, i);
                        const isWeekendColumn = i >= 5;
                        const breakdown = getDayPaymentBreakdown({
                          dayData: d,
                          empleado: emp,
                          dateInput: dayDate,
                        });
                        const estadoItem =
                          estadoItems.find(
                            (it) => it.value === breakdown.estado,
                          ) ||
                          estadoItems[1];
                        const justified = isJustifiedAbsence(d);
                        const key = `${emp.id}-${i}`;
                        const draft =
                          adicionalDrafts[key] || buildAdicionalDraft(d);
                        return (
                          <td
                            key={i}
                            className={`px-2 py-2 ${isWeekendColumn ? "bg-slate-50/60" : ""}`}
                          >
                            <Popover
                              open={!cerrada && pickerOpen === key}
                              onOpenChange={(open) => {
                                if (open) {
                                  setAdicionalDrafts((prev) => ({
                                    ...prev,
                                    [key]: prev[key] || buildAdicionalDraft(d),
                                  }));
                                  setPickerOpen(key);
                                  return;
                                }
                                cancelarAdicional(emp.id, i);
                              }}
                            >
                              <div className="flex flex-col items-start gap-1.5">
                                <PopoverTrigger asChild>
                                  <button
                                    type="button"
                                    disabled={cerrada}
                                    className={`inline-flex h-8 items-center gap-1 rounded-full border px-2.5 text-xs font-semibold transition-colors ${justified ? "border-sky-300 bg-sky-50 text-sky-700 shadow-[0_0_0_1px_rgba(125,211,252,0.35)]" : estadoItem.cls}`}
                                  >
                                    <Icon
                                      icon={
                                        justified
                                          ? "lucide:shield-check"
                                          : estadoItem.icon
                                      }
                                      className="w-3.5 h-3.5"
                                    />
                                    <span>{estadoItem.label}</span>
                                    <Icon
                                      icon="lucide:chevron-down"
                                      className="w-3 h-3 opacity-70"
                                    />
                                  </button>
                                </PopoverTrigger>
                                {justified ? (
                                  <div className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-700">
                                    <Icon
                                      icon="lucide:badge-check"
                                      className="h-3 w-3"
                                    />
                                    Justificada
                                  </div>
                                ) : null}
                                {breakdown.extraMonto > 0 ? (
                                  <div className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-semibold text-violet-700">
                                    <Icon
                                      icon="lucide:plus"
                                      className="h-3 w-3"
                                    />
                                    {formatCurrencyAR(breakdown.extraMonto)}
                                  </div>
                                ) : null}
                              </div>
                              <PopoverContent
                                align="start"
                                sideOffset={8}
                                collisionPadding={16}
                                className="z-[90] w-[260px] rounded-2xl border border-slate-200 bg-white p-3 shadow-xl"
                                onOpenAutoFocus={(e) => e.preventDefault()}
                              >
                                  <div className="space-y-3">
                                    <div className="flex flex-wrap gap-1.5">
                                      {estadoItems.map((item) => (
                                        <button
                                          key={item.value}
                                          type="button"
                                          onMouseDown={(e) =>
                                            e.preventDefault()
                                          }
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setDay(emp, i, item.value);
                                          }}
                                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs ${item.cls}`}
                                        >
                                          <Icon
                                            icon={item.icon}
                                            className="w-3.5 h-3.5"
                                          />
                                          <span>{item.label}</span>
                                        </button>
                                      ))}
                                    </div>

                                    <div className="border-t border-slate-100 pt-3">
                                      <div className="mt-2 space-y-2">
                                        <select
                                          value={draft.tipo}
                                          onChange={(e) =>
                                            setAdicionalDraft(emp.id, i, {
                                              tipo: e.target.value,
                                            })
                                          }
                                          className="h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700"
                                        >
                                          {adicionalItems.map((item) => (
                                            <option
                                              key={item.value || "none"}
                                              value={item.value}
                                            >
                                              {item.label}
                                            </option>
                                          ))}
                                        </select>
                                        {draft.tipo === "horas" ? (
                                          <Input
                                            type="number"
                                            min={0}
                                            step="0.5"
                                            value={draft.cantidad}
                                            onChange={(e) =>
                                              setAdicionalDraft(emp.id, i, {
                                                cantidad: e.target.value,
                                              })
                                            }
                                            placeholder="Horas"
                                            className="h-9 rounded-xl border-slate-200"
                                          />
                                        ) : null}
                                        {draft.tipo === "manual" ? (
                                          <Input
                                            type="number"
                                            min={0}
                                            value={draft.monto}
                                            onChange={(e) =>
                                              setAdicionalDraft(emp.id, i, {
                                                monto: e.target.value,
                                              })
                                            }
                                            placeholder="Importe"
                                            className="h-9 rounded-xl border-slate-200"
                                          />
                                        ) : null}
                                        <Input
                                          value={draft.nota}
                                          onChange={(e) =>
                                            setAdicionalDraft(emp.id, i, {
                                              nota: e.target.value,
                                            })
                                          }
                                          placeholder="Comentario"
                                          className="h-9 rounded-xl border-slate-200"
                                        />
                                        <div className="flex items-center justify-between gap-2">
                                          <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            className="h-8 rounded-xl border-slate-200 px-3 text-xs"
                                            onClick={() => cancelarAdicional(emp.id, i)}
                                          >
                                            Cancelar
                                          </Button>
                                          <Button
                                            type="button"
                                            size="sm"
                                            className="h-8 rounded-xl bg-violet-600 px-3 text-xs text-white hover:bg-violet-700"
                                            onClick={() =>
                                              guardarAdicional(emp, i)
                                            }
                                          >
                                            Guardar
                                          </Button>
                                        </div>
                                        {breakdown.extraMonto > 0 ? (
                                          <div className="text-[11px] text-slate-500">
                                            Guardado:{" "}
                                            <span className="font-semibold text-slate-900">
                                              {formatCurrencyAR(
                                                breakdown.extraMonto,
                                              )}
                                            </span>
                                          </div>
                                        ) : null}
                                      </div>
                                    </div>
                                  </div>
                              </PopoverContent>
                            </Popover>
                          </td>
                        );
                      })}
                      <td className="px-4 py-4 text-right">
                        <div className="text-sm font-bold text-slate-900">
                          {formatCurrencyAR(tSemana)}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <div className="text-sm font-bold text-violet-700">
                          {formatCurrencyAR(tExtras)}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-9 rounded-xl border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-none hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700 focus-visible:ring-0 focus-visible:ring-offset-0"
                          onClick={() => abrirPopoverAdelantos(emp)}
                        >
                          {formatCurrencyAR(tAdv)}
                        </Button>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <div className="text-sm font-bold text-violet-700">
                          {formatCurrencyAR(tPagar)}
                        </div>
                        <div className="mt-1 text-[11px] text-slate-400">
                          Bruto menos adelantos
                        </div>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-10 w-10 rounded-xl border border-slate-200 bg-white p-0 text-slate-600 shadow-none hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700 focus-visible:ring-0 focus-visible:ring-offset-0"
                          onClick={() =>
                            router.push(
                              `/${lang}/asistencia/empleado/${emp.id}`,
                            )
                          }
                        >
                          <Icon icon="lucide:eye" className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <Card className="overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-card to-muted/30 shadow-sm">
            <CardHeader className="border-b border-slate-200/80 bg-white/70 pb-4">
              <CardTitle className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 shadow-sm">
                    <Icon icon="lucide:wallet-cards" className="h-5 w-5" />
                  </div>
                  <div className="space-y-1">
                    <span className="block text-base font-semibold text-foreground">
                      Empleados y resumen del mes
                    </span>
                    <span className="block text-sm font-normal text-slate-500">
                      Visualiza el desempeño, adelantos y total del mes del equipo filtrado.
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                    {MONTHS_ES[resumenMonthIndex]} {resumenMonthYear}
                  </span>
                  <span
                    className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${
                      cierreMesActual
                        ? "border-amber-200 bg-amber-50 text-amber-700"
                        : "border-emerald-200 bg-emerald-50 text-emerald-700"
                    }`}
                  >
                    {cierreMesActual ? "Resumen guardado" : "Actualización en vivo"}
                  </span>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
                <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-4">
                  <div className="text-[11px] font-medium uppercase tracking-wide text-slate-600">
                    Jornales del mes
                  </div>
                  <div className="mt-1 text-2xl font-bold text-slate-900">
                    $
                    {estadisticasMensuales.totalTrabajado.toLocaleString(
                      "es-AR",
                    )}
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500">
                    Suma de jornadas registradas
                  </div>
                </div>
                <div className="rounded-xl border border-indigo-200/80 bg-indigo-50/70 p-4">
                  <div className="text-[11px] font-medium uppercase tracking-wide text-indigo-700/80">
                    Adicionales cargados
                  </div>
                  <div className="mt-1 text-2xl font-bold text-indigo-700">
                    $
                    {estadisticasMensuales.totalAdicionales.toLocaleString(
                      "es-AR",
                    )}
                  </div>
                  <div className="mt-1 text-[11px] text-indigo-700/70">
                    Horas y jornadas adicionales
                  </div>
                </div>
                <div className="rounded-xl border border-emerald-200/70 bg-emerald-50/60 p-4">
                  <div className="text-[11px] font-medium uppercase tracking-wide text-emerald-700/80">
                    Cobrado acumulado
                  </div>
                  <div className="text-2xl font-bold text-emerald-700 mt-1">
                    $
                    {estadisticasMensuales.totalCobrado.toLocaleString("es-AR")}
                  </div>
                  <div className="text-[11px] text-emerald-700/70 mt-1">
                    Ingreso confirmado en el mes
                  </div>
                </div>
                <div className="rounded-xl border border-blue-200/70 bg-blue-50/60 p-4">
                  <div className="text-[11px] font-medium uppercase tracking-wide text-blue-700/80">
                    Objetivo mensual
                  </div>
                  <div className="text-2xl font-bold text-blue-700 mt-1">
                    $
                    {estadisticasMensuales.totalObjetivo.toLocaleString(
                      "es-AR",
                    )}
                  </div>
                  <div className="text-[11px] text-blue-700/70 mt-1">
                    Meta total definida
                  </div>
                </div>
                <div className="rounded-xl border border-violet-200/80 bg-violet-50/70 p-4">
                  <div className="text-[11px] font-medium uppercase tracking-wide text-violet-700/80">
                    Adelantos del mes
                  </div>
                  <div className="text-2xl font-bold text-violet-700 mt-1">
                    $
                    {estadisticasMensuales.totalAdelantos.toLocaleString(
                      "es-AR",
                    )}
                  </div>
                  <div className="text-[11px] text-violet-700/70 mt-1">
                    Total adelantado a empleados
                  </div>
                </div>
                <div className="rounded-xl border border-amber-200/80 bg-amber-50/70 p-4">
                  <div className="text-[11px] font-medium uppercase tracking-wide text-amber-700/80">
                    Reconocimientos por asistencia
                  </div>
                  <div className="text-2xl font-bold text-amber-700 mt-1">
                    $
                    {estadisticasMensuales.totalPremios.toLocaleString("es-AR")}
                  </div>
                  <div className="text-[11px] text-amber-700/70 mt-1">
                    Total definido segun el cumplimiento de cada empleado
                  </div>
                </div>
              </div>
              <div className="overflow-auto rounded-xl border border-border/60 bg-card">
                <table className="min-w-full text-sm">
                  <thead className="bg-muted/50 border-b border-border/60">
                    <tr>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Empleado
                      </th>
                      <th className="px-3 py-2.5 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Activo
                      </th>
                      <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Sector
                      </th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Valor día
                      </th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Jornada adicional
                      </th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Total del mes
                      </th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Jornales
                      </th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Adicionales
                      </th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Cobrado
                      </th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        % asistencia
                      </th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Adelantos
                      </th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Reconocimiento
                      </th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Saldo final
                      </th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Acciones
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {empleadosGestionFiltrados.map((emp) => {
                      const item = estadisticasMensualesPorEmpleado[
                        String(emp.id)
                      ] || {
                        id: emp.id,
                        nombre: emp.nombre || "",
                        objetivo: 0,
                        trabajado: 0,
                        adicionales: 0,
                        cobrado: 0,
                        adelanto: 0,
                        saldoConPremio: 0,
                        premioAsistencia: {
                          porcentaje: 0,
                          presentes: 0,
                          medias: 0,
                          ausentes: 0,
                          justificadas: 0,
                          premio: 0,
                          config: null,
                          estadoLabel: "Sin premio",
                          motivos: [],
                        },
                      };
                      return (
                        <tr
                          key={emp.id}
                          className="hover:bg-muted/30 transition-colors"
                        >
                          <td className="px-3 py-3">
                            <div className="font-medium text-foreground">
                              {emp.nombre || item.nombre}
                            </div>
                            {item.premioAsistencia?.config?.activo ? (
                              <div className="text-[11px] text-muted-foreground mt-1">
                                {item.premioAsistencia.estadoLabel}
                                {item.premioAsistencia.motivos?.length > 0
                                  ? ` · ${item.premioAsistencia.motivos.join(" · ")}`
                                  : ""}
                              </div>
                            ) : (
                              <div className="text-[11px] text-muted-foreground mt-1">
                                Sin reconocimiento configurado
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-3 text-center">
                            {emp.activo !== false ? "Sí" : "No"}
                          </td>
                          <td className="px-3 py-3">{emp.sector || ""}</td>
                          <td className="px-3 py-3 text-right">
                            ${Number(emp.valorDia || 0).toLocaleString("es-AR")}
                          </td>
                          <td className="px-3 py-3 text-right">
                            $
                            {Number(emp.valorExtra || 0).toLocaleString(
                              "es-AR",
                            )}
                          </td>
                          <td className="px-3 py-3 text-right text-foreground font-medium">
                            ${item.objetivo.toLocaleString("es-AR")}
                          </td>
                          <td className="px-3 py-3 text-right text-slate-900 font-medium">
                            ${Number(item.trabajado || 0).toLocaleString("es-AR")}
                          </td>
                          <td className="px-3 py-3 text-right text-indigo-700 font-semibold">
                            ${Number(item.adicionales || 0).toLocaleString("es-AR")}
                          </td>
                          <td className="px-3 py-3 text-right text-emerald-700 font-semibold">
                            ${item.cobrado.toLocaleString("es-AR")}
                          </td>
                          <td className="px-3 py-3 text-right">
                            <div className="font-semibold text-foreground">
                              {Number(
                                item.premioAsistencia?.porcentaje || 0,
                              ).toLocaleString("es-AR")}
                              %
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                              {item.premioAsistencia?.presentes || 0} P ·{" "}
                              {item.premioAsistencia?.medias || 0} M ·{" "}
                              {item.premioAsistencia?.ausentes || 0} A ·{" "}
                              {item.premioAsistencia?.justificadas || 0} J
                            </div>
                          </td>
                          <td className="px-3 py-3 text-right text-violet-700 font-medium">
                            ${item.adelanto.toLocaleString("es-AR")}
                          </td>
                          <td className="px-3 py-3 text-right text-amber-700 font-semibold">
                            $
                            {Number(
                              item.premioAsistencia?.premio || 0,
                            ).toLocaleString("es-AR")}
                          </td>
                          <td className="px-3 py-3 text-right text-blue-700 font-semibold">
                            ${item.saldoConPremio.toLocaleString("es-AR")}
                          </td>
                          <td className="px-3 py-3 text-right">
                            <div className="flex items-center gap-2 justify-end">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="px-2"
                                onClick={() => abrirEditarEmp(emp)}
                              >
                                <Icon
                                  icon="lucide:pencil"
                                  className="w-4 h-4"
                                />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="px-2 text-red-600 hover:text-red-700"
                                onClick={() => eliminarEmp(emp)}
                              >
                                <Icon
                                  icon="lucide:trash-2"
                                  className="w-4 h-4"
                                />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Modal Adelantos */}
      <Dialog
        open={Boolean(popoverEmpleado)}
        onOpenChange={() => setPopoverEmpleado(null)}
      >
        <DialogContent className="rounded-2xl max-w-lg shadow-2xl border border-border/60 bg-card">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">
              Adelantos:{" "}
              <span className="text-primary font-normal">
                {popoverEmpleado?.nombre || ""}
              </span>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-sm font-medium text-muted-foreground">
              Período visible: {rangoSemana}
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto rounded-xl p-3 bg-muted/30 border border-border/50">
              {(adelantos[popoverEmpleado?.id] || []).length === 0 ? (
                <div className="text-xs text-center text-muted-foreground py-4 italic">
                  Sin adelantos en este tramo
                </div>
              ) : (
                (adelantos[popoverEmpleado?.id] || []).map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 bg-card shadow-sm border border-border/60 transition-all hover:shadow-md"
                  >
                    <div className="flex flex-col">
                      <div className="text-sm font-semibold">
                        ${Number(a.monto || 0).toLocaleString("es-AR")}
                      </div>
                      <div className="text-xs text-muted-foreground flex gap-1">
                        <span>{fmtDM(a.fecha)}</span>
                        {a.nota && <span>• {a.nota}</span>}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-500/10"
                      onClick={() => eliminarAdelanto(a.id)}
                    >
                      <Icon icon="lucide:trash-2" className="w-4 h-4" />
                    </Button>
                  </div>
                ))
              )}
            </div>

            <div className="grid grid-cols-1 gap-3 p-3 rounded-xl border border-border/50 bg-muted/10">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                Nuevo Adelanto
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Fecha</Label>
                  <DateInput
                    value={nuevoAdelanto.fecha}
                    onChange={(v) =>
                      setNuevoAdelanto((p) => ({ ...p, fecha: v }))
                    }
                    buttonClassName="h-9 bg-background justify-start"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Monto</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">
                      $
                    </span>
                    <Input
                      type="number"
                      min={0}
                      placeholder="0"
                      className="h-9 pl-6 bg-background"
                      value={nuevoAdelanto.monto}
                      onChange={(e) =>
                        setNuevoAdelanto((p) => ({
                          ...p,
                          monto: e.target.value,
                        }))
                      }
                    />
                  </div>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Nota (opcional)</Label>
                <Input
                  placeholder="Ej: Vale por materiales"
                  className="h-9 bg-background"
                  value={nuevoAdelanto.nota}
                  onChange={(e) =>
                    setNuevoAdelanto((p) => ({ ...p, nota: e.target.value }))
                  }
                />
              </div>
              <Button
                onClick={agregarAdelanto}
                disabled={!nuevoAdelanto.monto}
                className="w-full mt-2 h-9"
              >
                <Icon icon="lucide:plus" className="w-4 h-4 mr-2" /> Agregar
                Adelanto
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal Empleado */}
      <Dialog open={openEmp} onOpenChange={setOpenEmp}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-3xl max-h-[92vh] overflow-hidden rounded-3xl border border-border/60 bg-card p-0 shadow-2xl">
          <DialogHeader className="border-b border-border/60 px-5 py-4 sm:px-6">
            <DialogTitle className="text-xl font-bold">
              {editandoEmp ? "Editar Empleado" : "Nuevo Empleado"}
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto px-5 py-4 sm:max-h-[calc(92vh-150px)] sm:px-6">
            <div className="space-y-5 py-1">
              <div className="space-y-2">
                <Label htmlFor="empNombre">Nombre Completo</Label>
                <Input
                  id="empNombre"
                  placeholder="Ej: Juan Pérez"
                  className="h-10"
                  value={formEmp.nombre}
                  onChange={(e) =>
                    setFormEmp({ ...formEmp, nombre: e.target.value })
                  }
                />
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="empValorDia">Valor Jornada ($)</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                      $
                    </span>
                    <Input
                      id="empValorDia"
                      type="number"
                      min={0}
                      className="h-10 pl-6"
                      placeholder="0"
                      value={formEmp.valorDia}
                      onChange={(e) =>
                        setFormEmp({ ...formEmp, valorDia: e.target.value })
                      }
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="empValorExtra">Monto jornada adicional ($)</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                      $
                    </span>
                    <Input
                      id="empValorExtra"
                      type="number"
                      min={0}
                      className="h-10 pl-6"
                      placeholder="0"
                      value={formEmp.valorExtra}
                      onChange={(e) =>
                        setFormEmp({ ...formEmp, valorExtra: e.target.value })
                      }
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="empSector">Sector / Área</Label>
                  <Input
                    id="empSector"
                    placeholder="Ej: Producción"
                    className="h-10"
                    value={formEmp.sector}
                    onChange={(e) =>
                      setFormEmp({ ...formEmp, sector: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="empFechaIngreso">Fecha de ingreso</Label>
                  <Input
                    id="empFechaIngreso"
                    type="date"
                    className="h-10"
                    value={formEmp.fechaIngreso}
                    onChange={(e) =>
                      setFormEmp({ ...formEmp, fechaIngreso: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className="rounded-xl border border-border/50 bg-muted/10 p-4 space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="empPremioAsistencia" className="text-base">
                      Premio por asistencia
                    </Label>
                    <div className="text-xs text-muted-foreground">
                      Bono individual configurable según porcentaje de
                      asistencia, ausencias y medias jornadas.
                    </div>
                  </div>
                  <Switch
                    id="empPremioAsistencia"
                    checked={formEmp.premioAsistenciaActivo}
                    onCheckedChange={(v) =>
                      setFormEmp({ ...formEmp, premioAsistenciaActivo: v })
                    }
                  />
                </div>

                {formEmp.premioAsistenciaActivo ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="empPremioMonto">
                        Monto del premio ($)
                      </Label>
                      <Input
                        id="empPremioMonto"
                        type="number"
                        min={0}
                        className="h-10"
                        placeholder="0"
                        value={formEmp.premioAsistenciaMonto}
                        onChange={(e) =>
                          setFormEmp({
                            ...formEmp,
                            premioAsistenciaMonto: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="empPremioMinPorcentaje">
                        Asistencia mínima (%)
                      </Label>
                      <Input
                        id="empPremioMinPorcentaje"
                        type="number"
                        min={0}
                        max={100}
                        className="h-10"
                        placeholder="100"
                        value={formEmp.premioAsistenciaMinPorcentaje}
                        onChange={(e) =>
                          setFormEmp({
                            ...formEmp,
                            premioAsistenciaMinPorcentaje: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="empPremioMaxAusencias">
                        Ausencias permitidas
                      </Label>
                      <Input
                        id="empPremioMaxAusencias"
                        type="number"
                        min={0}
                        className="h-10"
                        placeholder="0"
                        value={formEmp.premioAsistenciaMaxAusencias}
                        onChange={(e) =>
                          setFormEmp({
                            ...formEmp,
                            premioAsistenciaMaxAusencias: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="empPremioMaxMedias">
                        Medias jornadas permitidas
                      </Label>
                      <Input
                        id="empPremioMaxMedias"
                        type="number"
                        min={0}
                        className="h-10"
                        placeholder="0"
                        value={formEmp.premioAsistenciaMaxMedias}
                        onChange={(e) =>
                          setFormEmp({
                            ...formEmp,
                            premioAsistenciaMaxMedias: e.target.value,
                          })
                        }
                      />
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-muted/20 border border-border/50">
                <div className="space-y-0.5">
                  <Label htmlFor="empActivo" className="text-base">
                    Empleado Activo
                  </Label>
                  <div className="text-xs text-muted-foreground">
                    Si se desactiva, no aparecerá en las planillas nuevas.
                  </div>
                </div>
                <Switch
                  id="empActivo"
                  checked={formEmp.activo}
                  onCheckedChange={(v) => setFormEmp({ ...formEmp, activo: v })}
                />
              </div>
            </div>
          </div>
          <DialogFooter className="border-t border-border/60 px-5 py-4 sm:gap-2 sm:px-6">
            <Button
              variant="outline"
              onClick={() => setOpenEmp(false)}
              className="h-10 rounded-xl"
            >
              Cancelar
            </Button>
            <Button
              onClick={guardarEmp}
              disabled={!formEmp.nombre}
              className="h-10 rounded-xl px-6"
            >
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
