"use client";
import React, { useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { db } from "@/lib/firebase";
import { collection, doc, getDocs, onSnapshot, query, setDoc, where, addDoc, deleteDoc, updateDoc } from "firebase/firestore";
import { Icon } from "@iconify/react";
import { calcularPremioAsistenciaMensual, formatMonthKey, formatMonthLabel } from "@/lib/asistencia-utils";

// --- Helper Functions ---

function startOfWeek(d) {
  let date;
  if (typeof d === 'string' && d.match(/^\d{4}-\d{2}-\d{2}$/)) {
     const [y, m, day] = d.split('-').map(Number);
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
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function fmtDM(d) {
  // Ajustar para mostrar día/mes local correctamente
  const date = new Date(d);
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}`;
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
  return ["lun", "mar", "mie", "jue", "vie", "sab"][i];
}

function calcMonto(estado, base, extra) {
  if (estado === "ausente") return 0;
  if (estado === "presente") return base;
  if (estado === "media") return Math.round(base * 0.5);
  if (estado === "extra") return base + (extra || 0);
  return 0;
}

function calcTotalSemanaLaboral(days) {
  const d = days && typeof days === "object" ? days : {};
  const keys = ["lun", "mar", "mie", "jue", "vie"];
  return keys.reduce((acc, k) => acc + Number(d?.[k]?.monto || 0), 0);
}

function contarDiasHabilesDelMes(dateObj) {
  const d = dateObj instanceof Date ? dateObj : new Date(dateObj);
  const y = d.getFullYear();
  const m = d.getMonth();
  const lastDay = new Date(y, m + 1, 0).getDate();
  let count = 0;
  for (let day = 1; day <= lastDay; day++) {
    const dow = new Date(y, m, day).getDay();
    if (dow === 0 || dow === 6) continue;
    count++;
  }
  return count;
}

// --- Constants ---

const estadoItems = [
  { value: "presente", label: "P", icon: "lucide:check-circle", cls: "bg-green-50 text-green-700 border-green-200" },
  { value: "ausente", label: "A", icon: "lucide:x-circle", cls: "bg-red-50 text-red-700 border-red-200" },
  { value: "media", label: "½", icon: "lucide:clock-2", cls: "bg-yellow-50 text-yellow-800 border-yellow-200" },
  { value: "extra", label: "+", icon: "lucide:plus-circle", cls: "bg-blue-50 text-blue-700 border-blue-200" },
];

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
  const [fechaBase, setFechaBase] = useState(() => fmt(startOfWeek(new Date())));
  
  const [empleados, setEmpleados] = useState([]);
  const [filtroNombre, setFiltroNombre] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("activos");
  const [asistencias, setAsistencias] = useState({});
  const [adelantos, setAdelantos] = useState({});
  const [popoverEmpleado, setPopoverEmpleado] = useState(null);
  const [nuevoAdelanto, setNuevoAdelanto] = useState({ fecha: fmt(new Date()), monto: "", nota: "" });
  const [cerrada, setCerrada] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(null);
  const [asistenciasMensuales, setAsistenciasMensuales] = useState([]);
  const [adelantosMensuales, setAdelantosMensuales] = useState([]);
  const [mesResumen, setMesResumen] = useState(() => new Date().toISOString().slice(0, 7));
  const [monthResumenPickerOpen, setMonthResumenPickerOpen] = useState(false);
  const [monthResumenPickerYear, setMonthResumenPickerYear] = useState(new Date().getFullYear());
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
    const ini = fmt(semanaInicio);
    const fin = fmt(addDays(semanaInicio, 5));
    return `${ini} – ${fin}`;
  }, [semanaInicio]);

  const encabezadosDias = useMemo(() => {
    const nombres = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
    return [0, 1, 2, 3, 4, 5].map(i => `${nombres[i]} ${fmtDM(addDays(semanaInicio, i))}`);
  }, [semanaInicio]);

  const empleadosFiltrados = useMemo(() => {
    return empleados
      .filter(e => (filtroEstado === "todos" ? true : filtroEstado === "activos" ? e.activo !== false : e.activo === false))
      .filter(e => e.nombre?.toLowerCase().includes(filtroNombre.toLowerCase()));
  }, [empleados, filtroEstado, filtroNombre]);

  const empleadosGestionFiltrados = useMemo(() => {
    return empleados
      .filter(e => (filtroEmp === "todos" ? true : filtroEmp === "activos" ? e.activo !== false : e.activo === false))
      .filter(e => (e.nombre || "").toLowerCase().includes(buscadorEmp.toLowerCase()));
  }, [empleados, filtroEmp, buscadorEmp]);

  const fechaMesResumen = useMemo(() => {
    const [y, m] = String(mesResumen || "").split("-").map(Number);
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
    setMesResumen(`${year}-${nextMonth}`);
    setMonthResumenPickerOpen(false);
  };

  const cierreMesActual = useMemo(() => {
    return cierresPremioMensuales[mesResumen] || null;
  }, [cierresPremioMensuales, mesResumen]);

  const estadisticasMensualesLive = useMemo(() => {
    const inicioMes = new Date(fechaMesResumen.getFullYear(), fechaMesResumen.getMonth(), 1);
    const finMes = new Date(fechaMesResumen.getFullYear(), fechaMesResumen.getMonth() + 1, 0, 23, 59, 59);
    const docsMes = asistenciasMensuales.filter((a) => {
      const d = toDateSafe(a.weekStart);
      if (!d) return false;
      return d >= inicioMes && d <= finMes;
    });
    const porEmpleado = empleadosGestionFiltrados.map((emp) => {
      const diasHabiles = contarDiasHabilesDelMes(fechaMesResumen);
      const objetivoCalculado = Number(emp.objetivoMensual || 0) > 0
        ? Number(emp.objetivoMensual)
        : Math.round(Number(emp.valorDia || 0) * diasHabiles);
      const cobrado = docsMes
        .filter((a) => a.employeeId === emp.id)
        .reduce((acc, a) => acc + calcTotalSemanaLaboral(a?.days), 0);
      const premioAsistencia = calcularPremioAsistenciaMensual({
        empleado: emp,
        asistencias: docsMes,
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
      const faltante = Math.max(objetivoCalculado - cobrado, 0);
      const saldoALiquidar = Math.max(cobrado - adelanto, 0);
      const saldoConPremio = Math.max(cobrado + premioAsistencia.premio - adelanto, 0);
      const progreso = objetivoCalculado > 0 ? Math.min((cobrado / objetivoCalculado) * 100, 100) : 0;
      return {
        id: emp.id,
        nombre: emp.nombre || "",
        objetivo: objetivoCalculado,
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
    const totalCobrado = porEmpleado.reduce((acc, i) => acc + i.cobrado, 0);
    const totalAdelantos = porEmpleado.reduce((acc, i) => acc + i.adelanto, 0);
    const totalFaltante = Math.max(totalObjetivo - totalCobrado, 0);
    const totalPremios = porEmpleado.reduce((acc, i) => acc + Number(i.premioAsistencia?.premio || 0), 0);
    return {
      porEmpleado: porEmpleado.sort((a, b) => b.cobrado - a.cobrado),
      totalObjetivo,
      totalCobrado,
      totalAdelantos,
      totalFaltante,
      totalPremios,
      labelMes: formatMonthLabel(fechaMesResumen),
      monthKey: formatMonthKey(fechaMesResumen),
    };
  }, [asistenciasMensuales, adelantosMensuales, empleadosGestionFiltrados, fechaMesResumen]);

  const estadisticasMensuales = useMemo(() => {
    if (!cierreMesActual) return estadisticasMensualesLive;
    const visibleIds = new Set(empleadosGestionFiltrados.map((emp) => String(emp.id)));
    const porEmpleado = Array.isArray(cierreMesActual.empleados)
      ? cierreMesActual.empleados
          .filter((item) => visibleIds.has(String(item.id || item.employeeId || "")))
          .sort((a, b) => Number(b.cobrado || 0) - Number(a.cobrado || 0))
      : [];
    return {
      porEmpleado,
      totalObjetivo: porEmpleado.reduce((acc, item) => acc + Number(item.objetivo || 0), 0),
      totalCobrado: porEmpleado.reduce((acc, item) => acc + Number(item.cobrado || 0), 0),
      totalAdelantos: porEmpleado.reduce((acc, item) => acc + Number(item.adelanto || 0), 0),
      totalFaltante: porEmpleado.reduce((acc, item) => acc + Number(item.faltante || 0), 0),
      totalPremios: porEmpleado.reduce((acc, item) => acc + Number(item.premioAsistencia?.premio || 0), 0),
      labelMes: cierreMesActual.labelMes || formatMonthLabel(fechaMesResumen),
      monthKey: cierreMesActual.monthKey || formatMonthKey(fechaMesResumen),
      cerradoEn: cierreMesActual.closedAt || null,
      isClosed: true,
    };
  }, [cierreMesActual, estadisticasMensualesLive, empleadosGestionFiltrados, fechaMesResumen]);

  const estadisticasMensualesPorEmpleado = useMemo(() => {
    return Object.fromEntries(
      (estadisticasMensuales.porEmpleado || []).map((item) => [String(item.id), item])
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
        setEmpleados(snapEmp.docs.map(d => ({ ...d.data(), id: d.id })));

        // Suscripción a asistencias
        const qAsis = query(collection(db, "asistencias"), where("weekStart", "==", semanaClave));
        const unsubAsis = onSnapshot(qAsis, (s) => {
          if (!isActive) return;
          const map = {};
          let weekClosed = false;
          s.forEach(d => {
            const data = d.data();
            map[data.employeeId] = { id: d.id, ...data };
            if (data.cerrada) weekClosed = true;
          });
          setAsistencias(map);
          setCerrada(weekClosed);
        });
        unsubs.push(unsubAsis);

        // Suscripción a adelantos
        const qAdv = query(collection(db, "adelantos"), where("weekStart", "==", semanaClave));
        const unsubAdv = onSnapshot(qAdv, (s) => {
          if (!isActive) return;
          const byEmp = {};
          s.forEach(d => {
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
      unsubs.forEach(u => u());
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
    const unsub = onSnapshot(collection(db, "premiosAsistenciaCierres"), (s) => {
      const map = {};
      s.forEach((d) => {
        map[d.id] = { id: d.id, ...d.data() };
      });
      setCierresPremioMensuales(map);
    });
    return () => unsub();
  }, []);

  // --- Helpers Logic ---

  const totalAdelantosEmp = empId => (adelantos[empId] || []).reduce((acc, a) => acc + Number(a.monto || 0), 0);

  const getDay = (empId, idx) => {
    const doc = asistencias[empId];
    const k = dayKey(idx);
    return doc?.days?.[k] || { estado: "ausente", monto: 0 };
  };

  const setDay = async (emp, idx, estado, montoManual) => {
    if (cerrada) return;
    if (!emp?.id) return;
    const base = Number(emp.valorDia || 0);
    const extra = Number(emp.valorExtra || 0);
    const montoBase = montoManual != null ? Number(montoManual) : calcMonto(estado, base, extra);
    const monto = idx === 5 ? 0 : montoBase;
    const k = dayKey(idx);
    const prev = asistencias[emp.id];
    const days = { ...(prev?.days || {}) , [k]: { estado, monto } };
    const totalSemana = calcTotalSemanaLaboral(days);
    
    const data = {
      employeeId: emp.id,
      employeeNombre: emp.nombre || "",
      weekStart: semanaClave,
      days,
      totalSemana,
      cerrada: prev?.cerrada || false
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

  const cerrarSemana = async () => {
    if (!confirm("¿Cerrar semana? No se podrán hacer más cambios.")) return;
    try {
      const updates = Object.values(asistencias);
      for (const a of updates) {
        const totalSemana = calcTotalSemanaLaboral(a?.days);
        await setDoc(doc(db, "asistencias", a.id), { cerrada: true, totalSemana, snapshotTotal: totalSemana }, { merge: true });
      }
      setCerrada(true);
    } catch (err) {
      console.error("Error cerrando semana:", err);
    }
  };

  const navSemana = (dir) => {
    const delta = dir === -1 ? -7 : 7;
    setFechaBase(fmt(addDays(semanaInicio, delta)));
  };

  // --- Adelantos Logic ---

  const abrirPopoverAdelantos = emp => {
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
        nota: nuevoAdelanto.nota || ""
      };
      await addDoc(collection(db, "adelantos"), data);
      setNuevoAdelanto({ fecha: fmt(new Date()), monto: "", nota: "" });
    } catch (err) {
      console.error("Error agregando adelanto:", err);
    }
  };

  const eliminarAdelanto = async id => {
    if (!confirm("¿Eliminar adelanto?")) return;
    try {
      await deleteDoc(doc(db, "adelantos", id));
    } catch (err) {
      console.error("Error eliminando adelanto:", err);
    }
  };

  // --- Empleados Logic ---

  const cerrarPremioMes = async () => {
    if (!confirm(`¿Cerrar el premio del mes ${estadisticasMensualesLive.labelMes}? Se congelará la liquidación mensual hasta reabrirlo.`)) return;
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
            diasEsperados: Number(item.premioAsistencia?.diasEsperados || 0),
          },
        })),
      };
      await setDoc(doc(db, "premiosAsistenciaCierres", estadisticasMensualesLive.monthKey), payload, { merge: true });
    } catch (err) {
      console.error("Error cerrando premio mensual:", err);
    } finally {
      setGuardandoCierreMes(false);
    }
  };

  const reabrirPremioMes = async () => {
    if (!cierreMesActual) return;
    if (!confirm(`¿Reabrir el mes ${cierreMesActual.labelMes || estadisticasMensuales.labelMes}? El premio volverá a calcularse en vivo.`)) return;
    try {
      setGuardandoCierreMes(true);
      await deleteDoc(doc(db, "premiosAsistenciaCierres", cierreMesActual.id || mesResumen));
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
      premioAsistenciaActivo: Boolean(formEmp.premioAsistenciaActivo),
      premioAsistenciaMonto: Boolean(formEmp.premioAsistenciaActivo) ? Number(formEmp.premioAsistenciaMonto || 0) : 0,
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
      setEmpleados(snap.docs.map(d => ({ ...d.data(), id: d.id })));
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
      setEmpleados(snap.docs.map(d => ({ ...d.data(), id: d.id })));
    } catch (err) {
      console.error("Error eliminando empleado:", err);
    }
  };

  // --- Render ---

  return (
    <div className="flex flex-col gap-6 py-8 mx-auto font-sans">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 rounded-2xl px-4 py-2 bg-card/70 border border-border/60 backdrop-blur shadow-sm">
        <div className="flex items-center gap-2">
          <div className="text-base font-semibold">Asistencia</div>
          <div className="flex items-center gap-2 pl-2">
            <Label htmlFor="vistaEmp" className="text-xs text-muted-foreground">Empleados</Label>
            <Switch id="vistaEmp" checked={vistaActiva==="empleados"} onCheckedChange={(v)=>setVistaActiva(v?"empleados":"asistencia")} />
          </div>
        </div>
        {vistaActiva === "asistencia" ? (
          <div className="flex items-center gap-2">
            <span className={`px-2 py-1 rounded-full text-[11px] font-medium border ${cerrada ? "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/20" : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20"}`}>
              {cerrada ? "Cerrada" : "Abierta"}
            </span>
            <Button variant="outline" onClick={() => setFechaBase(fmt(startOfWeek(new Date())))} className="h-8 px-2 text-xs">Hoy</Button>
            <Button variant="outline" onClick={() => navSemana(-1)} className="h-8 w-8 p-0"><Icon icon="lucide:chevron-left" /></Button>
            <div className="text-xs font-semibold">{rangoSemana}</div>
            <Button variant="outline" onClick={() => navSemana(1)} className="h-8 w-8 p-0"><Icon icon="lucide:chevron-right" /></Button>
            <Input placeholder="Buscar" value={filtroNombre} onChange={e=>setFiltroNombre(e.target.value)} className="h-8 w-40 text-xs" />
            <select value={filtroEstado} onChange={e=>setFiltroEstado(e.target.value)} className="h-8 border border-border/60 bg-background text-foreground rounded-md px-2 text-xs">
              <option value="activos">Activos</option>
              <option value="inactivos">Inactivos</option>
              <option value="todos">Todos</option>
            </select>
            <Button variant="default" onClick={cerrarSemana} disabled={cerrada} className="h-8 px-2 text-xs">Cerrar semana</Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Input placeholder="Buscar" value={buscadorEmp} onChange={(e)=>setBuscadorEmp(e.target.value)} className="h-8 w-48 text-xs" />
            <select value={filtroEmp} onChange={(e)=>setFiltroEmp(e.target.value)} className="h-8 border border-border/60 bg-background text-foreground rounded-md px-2 text-xs">
              <option value="activos">Activos</option>
              <option value="inactivos">Inactivos</option>
              <option value="todos">Todos</option>
            </select>
            <Button className="h-8 px-2 text-xs" onClick={abrirNuevoEmp}>Nuevo</Button>
          </div>
        )}
      </div>

      {/* Contenido Principal */}
      {vistaActiva === "asistencia" ? (
      <div className="space-y-4">
      <Card className="overflow-hidden rounded-2xl shadow">
        <CardHeader>
          <CardTitle className="text-base">Liquidación semanal</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-auto rounded-xl shadow-sm">
            <table className="min-w-full text-sm rounded-xl">
              <thead className="bg-default-100">
                <tr>
                  <th className="px-2 py-2 text-left w-48">Empleado</th>
                  {encabezadosDias.map((h,i)=>(<th key={i} className="px-2 py-2 text-center w-28">{h}</th>))}
                  <th className="px-2 py-2 text-right w-24">Total</th>
                  <th className="px-2 py-2 text-right w-24">Adelantos</th>
                  <th className="px-2 py-2 text-right w-24">A pagar</th>
                  <th className="px-2 py-2 text-center w-16">Acc.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-default-200">
                {empleadosFiltrados.map((emp, empIdx)=>{
                  const a = asistencias[emp.id];
                  const tSemana = calcTotalSemanaLaboral(a?.days);
                  const tAdv = totalAdelantosEmp(emp.id);
                  const tPagar = tSemana - tAdv;
                  const dropUp = empIdx === empleadosFiltrados.length - 1;
                  return (
                    <tr key={emp.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-2">
                          <div className={`w-2.5 h-2.5 rounded-full ${emp.activo!==false?"bg-green-500":"bg-muted-foreground"}`} />
                          <div className="font-medium">{emp.nombre || ""}</div>
                        </div>
                      </td>
                      {[0,1,2,3,4,5].map(i=>{
                        const d = getDay(emp.id,i);
                        const estadoItem = estadoItems.find(it=>it.value===d.estado) || estadoItems[1];
                        const key = `${emp.id}-${i}`;
                        return (
                          <td key={i} className="px-2 py-1.5">
                            <div className="relative flex items-center gap-1.5" onBlur={(e)=>{ if(!e.currentTarget.contains(e.relatedTarget)) setPickerOpen(null); }} tabIndex={0}>
                              <button
                                type="button"
                                disabled={cerrada}
                                onClick={(e)=>{ e.stopPropagation(); setPickerOpen(p=>p===key?null:key); }}
                                className={`inline-flex items-center gap-1 h-7 px-2 rounded-full border text-xs transition-colors ${estadoItem.cls}`}
                              >
                                <Icon icon={estadoItem.icon} className="w-3.5 h-3.5" />
                                <span>{estadoItem.label}</span>
                                <Icon icon="lucide:chevron-down" className="w-3 h-3 opacity-70" />
                              </button>
                              {pickerOpen===key && !cerrada && (
                                <div className={`absolute ${dropUp ? "bottom-full mb-1" : "top-full mt-1"} left-0 inline-flex items-center gap-1 rounded-full bg-card border border-border/60 shadow-lg px-1 py-1 z-30`}>
                                  {estadoItems.map(item=>(
                                    <button
                                      key={item.value}
                                      type="button"
                                      onMouseDown={(e)=>e.preventDefault()}
                                      onClick={(e)=>{ e.stopPropagation(); setDay(emp,i,item.value,null); setPickerOpen(null); }}
                                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-full border text-xs ${item.cls}`}
                                    >
                                      <Icon icon={item.icon} className="w-3.5 h-3.5" />
                                      <span>{item.label}</span>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          </td>
                        );
                      })}
                      <td className="px-2 py-2 text-right font-semibold text-xs">${tSemana.toLocaleString("es-AR")}</td>
                      <td className="px-2 py-2 text-right">
                        <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={()=>abrirPopoverAdelantos(emp)}>{tAdv.toLocaleString("es-AR")}</Button>
                      </td>
                      <td className="px-2 py-2 text-right font-semibold text-xs">${tPagar.toLocaleString("es-AR")}</td>
                      <td className="px-2 py-2 text-center">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={()=>router.push(`/${lang}/asistencia/empleado/${emp.id}`)}>
                          <Icon icon="lucide:eye" className="w-4 h-4" />
                        </Button>
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
      ) : (
      <div className="space-y-4">
        <Card className="rounded-2xl border border-border/60 shadow-sm bg-gradient-to-br from-card to-muted/30 overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <Icon icon="lucide:wallet-cards" className="w-4 h-4" />
                </div>
                <span className="text-sm md:text-base font-semibold text-foreground">Empleados y Cobro del Mes</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap justify-end">
                <Popover open={monthResumenPickerOpen} onOpenChange={setMonthResumenPickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 min-w-[170px] justify-between rounded-xl border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm transition-all hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700"
                    >
                      <span className="flex items-center gap-2">
                        <Icon icon="lucide:calendar" className="h-3.5 w-3.5 text-violet-500" />
                        <span>{MONTHS_ES[resumenMonthIndex]} {resumenMonthYear}</span>
                      </span>
                      <Icon icon="lucide:chevron-down" className="h-3.5 w-3.5 text-slate-400" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-[320px] rounded-[22px] border border-slate-200 bg-white p-0 shadow-[0_24px_60px_-25px_rgba(15,23,42,0.28)]">
                    <div className="space-y-4 p-4">
                      <div className="flex items-center justify-between rounded-2xl bg-slate-50 px-3 py-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 rounded-xl text-slate-600 hover:bg-white"
                          onClick={() => setMonthResumenPickerYear((prev) => prev - 1)}
                        >
                          <Icon icon="lucide:chevron-left" className="h-4 w-4" />
                        </Button>
                        <div className="text-sm font-semibold text-slate-900">{monthResumenPickerYear}</div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 rounded-xl text-slate-600 hover:bg-white"
                          onClick={() => setMonthResumenPickerYear((prev) => prev + 1)}
                        >
                          <Icon icon="lucide:chevron-right" className="h-4 w-4" />
                        </Button>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        {MONTHS_ES.map((monthLabel, monthIndex) => {
                          const isActive = monthIndex === resumenMonthIndex && monthResumenPickerYear === resumenMonthYear;
                          return (
                            <button
                              key={monthLabel}
                              type="button"
                              onClick={() => seleccionarMesResumen(monthResumenPickerYear, monthIndex)}
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
                            seleccionarMesResumen(now.getFullYear(), now.getMonth());
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
                <span className={`text-[11px] md:text-xs font-semibold border rounded-full px-2.5 py-1 capitalize ${cierreMesActual ? "text-amber-700 bg-amber-50 border-amber-200" : "text-muted-foreground bg-card border-border/60"}`}>
                  {cierreMesActual ? "Mes cerrado" : estadisticasMensuales.labelMes}
                </span>
                {cierreMesActual ? (
                  <Button
                    variant="outline"
                    onClick={reabrirPremioMes}
                    disabled={guardandoCierreMes}
                    className="h-8 px-2 text-xs"
                  >
                    {guardandoCierreMes ? "Reabriendo..." : "Reabrir mes"}
                  </Button>
                ) : (
                  <Button
                    variant="default"
                    onClick={cerrarPremioMes}
                    disabled={guardandoCierreMes || estadisticasMensualesLive.porEmpleado.length === 0}
                    className="h-8 px-2 text-xs"
                  >
                    {guardandoCierreMes ? "Cerrando..." : "Cerrar premio del mes"}
                  </Button>
                )}
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="rounded-xl border border-emerald-200/70 bg-emerald-50/60 p-4">
                <div className="text-[11px] font-medium uppercase tracking-wide text-emerald-700/80">Cobrado acumulado</div>
                <div className="text-2xl font-bold text-emerald-700 mt-1">${estadisticasMensuales.totalCobrado.toLocaleString("es-AR")}</div>
                <div className="text-[11px] text-emerald-700/70 mt-1">Ingreso confirmado en el mes</div>
              </div>
              <div className="rounded-xl border border-blue-200/70 bg-blue-50/60 p-4">
                <div className="text-[11px] font-medium uppercase tracking-wide text-blue-700/80">Objetivo mensual</div>
                <div className="text-2xl font-bold text-blue-700 mt-1">${estadisticasMensuales.totalObjetivo.toLocaleString("es-AR")}</div>
                <div className="text-[11px] text-blue-700/70 mt-1">Meta total definida</div>
              </div>
              <div className="rounded-xl border border-violet-200/80 bg-violet-50/70 p-4">
                <div className="text-[11px] font-medium uppercase tracking-wide text-violet-700/80">Adelantos del mes</div>
                <div className="text-2xl font-bold text-violet-700 mt-1">${estadisticasMensuales.totalAdelantos.toLocaleString("es-AR")}</div>
                <div className="text-[11px] text-violet-700/70 mt-1">Total adelantado a empleados</div>
              </div>
              <div className="rounded-xl border border-amber-200/80 bg-amber-50/70 p-4">
                <div className="text-[11px] font-medium uppercase tracking-wide text-amber-700/80">Premios por asistencia</div>
                <div className="text-2xl font-bold text-amber-700 mt-1">${estadisticasMensuales.totalPremios.toLocaleString("es-AR")}</div>
                <div className="text-[11px] text-amber-700/70 mt-1">Monto ganado según cumplimiento individual</div>
              </div>
            </div>
            <div className="overflow-auto rounded-xl border border-border/60 bg-card">
              <table className="min-w-full text-sm">
                <thead className="bg-muted/50 border-b border-border/60">
                  <tr>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Empleado</th>
                    <th className="px-3 py-2.5 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide">Activo</th>
                    <th className="px-3 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Sector</th>
                    <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Valor día</th>
                    <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Valor extra</th>
                    <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Debería cobrar</th>
                    <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Lleva cobrado</th>
                    <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">% asistencia</th>
                    <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Adelantos</th>
                    <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Premio</th>
                    <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Liquidar final</th>
                    <th className="px-3 py-2.5 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {empleadosGestionFiltrados.map((emp) => {
                    const item = estadisticasMensualesPorEmpleado[String(emp.id)] || {
                      id: emp.id,
                      nombre: emp.nombre || "",
                      objetivo: 0,
                      cobrado: 0,
                      adelanto: 0,
                      saldoConPremio: 0,
                      premioAsistencia: {
                        porcentaje: 0,
                        presentes: 0,
                        medias: 0,
                        ausentes: 0,
                        premio: 0,
                        config: null,
                        estadoLabel: "Sin premio",
                        motivos: [],
                      },
                    };
                    return (
                    <tr key={emp.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-3">
                        <div className="font-medium text-foreground">{emp.nombre || item.nombre}</div>
                        {item.premioAsistencia?.config?.activo ? (
                          <div className="text-[11px] text-muted-foreground mt-1">
                            {item.premioAsistencia.estadoLabel}
                            {item.premioAsistencia.motivos?.length > 0 ? ` · ${item.premioAsistencia.motivos.join(" · ")}` : ""}
                          </div>
                        ) : (
                          <div className="text-[11px] text-muted-foreground mt-1">Sin premio configurado</div>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center">{emp.activo !== false ? "Sí" : "No"}</td>
                      <td className="px-3 py-3">{emp.sector || ""}</td>
                      <td className="px-3 py-3 text-right">${Number(emp.valorDia || 0).toLocaleString("es-AR")}</td>
                      <td className="px-3 py-3 text-right">${Number(emp.valorExtra || 0).toLocaleString("es-AR")}</td>
                      <td className="px-3 py-3 text-right text-foreground font-medium">${item.objetivo.toLocaleString("es-AR")}</td>
                      <td className="px-3 py-3 text-right text-emerald-700 font-semibold">${item.cobrado.toLocaleString("es-AR")}</td>
                      <td className="px-3 py-3 text-right">
                        <div className="font-semibold text-foreground">{Number(item.premioAsistencia?.porcentaje || 0).toLocaleString("es-AR")}%</div>
                        <div className="text-[11px] text-muted-foreground">
                          {item.premioAsistencia?.presentes || 0} P · {item.premioAsistencia?.medias || 0} M · {item.premioAsistencia?.ausentes || 0} A
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right text-violet-700 font-medium">${item.adelanto.toLocaleString("es-AR")}</td>
                      <td className="px-3 py-3 text-right text-amber-700 font-semibold">${Number(item.premioAsistencia?.premio || 0).toLocaleString("es-AR")}</td>
                      <td className="px-3 py-3 text-right text-blue-700 font-semibold">${item.saldoConPremio.toLocaleString("es-AR")}</td>
                      <td className="px-3 py-3 text-right">
                        <div className="flex items-center gap-2 justify-end">
                          <Button variant="ghost" size="sm" className="px-2" onClick={()=>abrirEditarEmp(emp)}>
                            <Icon icon="lucide:pencil" className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="sm" className="px-2 text-red-600 hover:text-red-700" onClick={()=>eliminarEmp(emp)}>
                            <Icon icon="lucide:trash-2" className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )})}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
      )}

      {/* Modal Adelantos */}
      <Dialog open={Boolean(popoverEmpleado)} onOpenChange={()=>setPopoverEmpleado(null)}>
        <DialogContent className="rounded-2xl max-w-lg shadow-2xl border border-border/60 bg-card">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">
              Adelantos: <span className="text-primary font-normal">{popoverEmpleado?.nombre || ""}</span>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-sm font-medium text-muted-foreground">Semana del {rangoSemana}</div>
            
            <div className="space-y-2 max-h-60 overflow-y-auto rounded-xl p-3 bg-muted/30 border border-border/50">
              {(adelantos[popoverEmpleado?.id]||[]).length === 0 ? (
                 <div className="text-xs text-center text-muted-foreground py-4 italic">Sin adelantos esta semana</div>
              ) : (
                (adelantos[popoverEmpleado?.id]||[]).map(a=>(
                  <div key={a.id} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 bg-card shadow-sm border border-border/60 transition-all hover:shadow-md">
                    <div className="flex flex-col">
                      <div className="text-sm font-semibold">${Number(a.monto||0).toLocaleString("es-AR")}</div>
                      <div className="text-xs text-muted-foreground flex gap-1">
                        <span>{fmtDM(a.fecha)}</span>
                        {a.nota && <span>• {a.nota}</span>}
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-500/10" onClick={()=>eliminarAdelanto(a.id)}>
                      <Icon icon="lucide:trash-2" className="w-4 h-4" />
                    </Button>
                  </div>
                ))
              )}
            </div>

            <div className="grid grid-cols-1 gap-3 p-3 rounded-xl border border-border/50 bg-muted/10">
               <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Nuevo Adelanto</div>
               <div className="grid grid-cols-2 gap-3">
                 <div className="space-y-1">
                   <Label className="text-xs">Fecha</Label>
                  <DateInput
                    value={nuevoAdelanto.fecha}
                    onChange={(v) => setNuevoAdelanto((p) => ({ ...p, fecha: v }))}
                    buttonClassName="h-9 bg-background justify-start"
                  />
                 </div>
                 <div className="space-y-1">
                   <Label className="text-xs">Monto</Label>
                   <div className="relative">
                     <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">$</span>
                     <Input type="number" min={0} placeholder="0" className="h-9 pl-6 bg-background" value={nuevoAdelanto.monto} onChange={e=>setNuevoAdelanto(p=>({...p,monto:e.target.value}))} />
                   </div>
                 </div>
               </div>
               <div className="space-y-1">
                 <Label className="text-xs">Nota (opcional)</Label>
                 <Input placeholder="Ej: Vale por materiales" className="h-9 bg-background" value={nuevoAdelanto.nota} onChange={e=>setNuevoAdelanto(p=>({...p,nota:e.target.value}))} />
               </div>
               <Button onClick={agregarAdelanto} disabled={!nuevoAdelanto.monto} className="w-full mt-2 h-9">
                 <Icon icon="lucide:plus" className="w-4 h-4 mr-2" /> Agregar Adelanto
               </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal Empleado */}
      <Dialog open={openEmp} onOpenChange={setOpenEmp}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-3xl max-h-[92vh] overflow-hidden rounded-3xl border border-border/60 bg-card p-0 shadow-2xl">
          <DialogHeader className="border-b border-border/60 px-5 py-4 sm:px-6">
            <DialogTitle className="text-xl font-bold">{editandoEmp ? "Editar Empleado" : "Nuevo Empleado"}</DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto px-5 py-4 sm:max-h-[calc(92vh-150px)] sm:px-6">
          <div className="space-y-5 py-1">
            <div className="space-y-2">
              <Label htmlFor="empNombre">Nombre Completo</Label>
              <Input id="empNombre" placeholder="Ej: Juan Pérez" className="h-10" value={formEmp.nombre} onChange={(e)=>setFormEmp({...formEmp, nombre: e.target.value})} />
            </div>
            
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="empValorDia">Valor Jornada ($)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                  <Input id="empValorDia" type="number" min={0} className="h-10 pl-6" placeholder="0" value={formEmp.valorDia} onChange={(e)=>setFormEmp({...formEmp, valorDia: e.target.value})} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="empValorExtra">Valor Extra ($)</Label>
                <div className="relative">
                   <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                   <Input id="empValorExtra" type="number" min={0} className="h-10 pl-6" placeholder="0" value={formEmp.valorExtra} onChange={(e)=>setFormEmp({...formEmp, valorExtra: e.target.value})} />
                </div>
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="empSector">Sector / Área</Label>
              <Input id="empSector" placeholder="Ej: Producción" className="h-10" value={formEmp.sector} onChange={(e)=>setFormEmp({...formEmp, sector: e.target.value})} />
            </div>

            <div className="rounded-xl border border-border/50 bg-muted/10 p-4 space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="empPremioAsistencia" className="text-base">Premio por asistencia</Label>
                  <div className="text-xs text-muted-foreground">
                    Bono individual configurable según porcentaje de asistencia, ausencias y medias jornadas.
                  </div>
                </div>
                <Switch
                  id="empPremioAsistencia"
                  checked={formEmp.premioAsistenciaActivo}
                  onCheckedChange={(v)=>setFormEmp({...formEmp, premioAsistenciaActivo: v})}
                />
              </div>

              {formEmp.premioAsistenciaActivo ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="empPremioMonto">Monto del premio ($)</Label>
                    <Input
                      id="empPremioMonto"
                      type="number"
                      min={0}
                      className="h-10"
                      placeholder="0"
                      value={formEmp.premioAsistenciaMonto}
                      onChange={(e)=>setFormEmp({...formEmp, premioAsistenciaMonto: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="empPremioMinPorcentaje">Asistencia mínima (%)</Label>
                    <Input
                      id="empPremioMinPorcentaje"
                      type="number"
                      min={0}
                      max={100}
                      className="h-10"
                      placeholder="100"
                      value={formEmp.premioAsistenciaMinPorcentaje}
                      onChange={(e)=>setFormEmp({...formEmp, premioAsistenciaMinPorcentaje: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="empPremioMaxAusencias">Ausencias permitidas</Label>
                    <Input
                      id="empPremioMaxAusencias"
                      type="number"
                      min={0}
                      className="h-10"
                      placeholder="0"
                      value={formEmp.premioAsistenciaMaxAusencias}
                      onChange={(e)=>setFormEmp({...formEmp, premioAsistenciaMaxAusencias: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="empPremioMaxMedias">Medias jornadas permitidas</Label>
                    <Input
                      id="empPremioMaxMedias"
                      type="number"
                      min={0}
                      className="h-10"
                      placeholder="0"
                      value={formEmp.premioAsistenciaMaxMedias}
                      onChange={(e)=>setFormEmp({...formEmp, premioAsistenciaMaxMedias: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="empPremioPesoMedia">Peso de media jornada</Label>
                    <Input
                      id="empPremioPesoMedia"
                      type="number"
                      min={0}
                      max={1}
                      step="0.1"
                      className="h-10"
                      placeholder="0.5"
                      value={formEmp.premioAsistenciaPesoMedia}
                      onChange={(e)=>setFormEmp({...formEmp, premioAsistenciaPesoMedia: e.target.value})}
                    />
                    <div className="text-xs text-muted-foreground">
                      Ejemplo recomendado: `0.5` para contar media jornada como medio día de asistencia.
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl bg-muted/20 border border-border/50">
              <div className="space-y-0.5">
                <Label htmlFor="empActivo" className="text-base">Empleado Activo</Label>
                <div className="text-xs text-muted-foreground">Si se desactiva, no aparecerá en las planillas nuevas.</div>
              </div>
              <Switch id="empActivo" checked={formEmp.activo} onCheckedChange={(v)=>setFormEmp({...formEmp, activo: v})} />
            </div>
          </div>
          </div>
          <DialogFooter className="border-t border-border/60 px-5 py-4 sm:gap-2 sm:px-6">
            <Button variant="outline" onClick={()=>setOpenEmp(false)} className="h-10 rounded-xl">Cancelar</Button>
            <Button onClick={guardarEmp} disabled={!formEmp.nombre} className="h-10 rounded-xl px-6">Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
