"use client";
import React, { useEffect, useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { db } from "@/lib/firebase";
import { collection, doc, getDocs, onSnapshot, query, setDoc, where, addDoc, deleteDoc, updateDoc } from "firebase/firestore";
import { Icon } from "@iconify/react";

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

// --- Constants ---

const estadoItems = [
  { value: "presente", label: "P", icon: "lucide:check-circle", cls: "bg-green-50 text-green-700 border-green-200" },
  { value: "ausente", label: "A", icon: "lucide:x-circle", cls: "bg-red-50 text-red-700 border-red-200" },
  { value: "media", label: "½", icon: "lucide:clock-2", cls: "bg-yellow-50 text-yellow-800 border-yellow-200" },
  { value: "extra", label: "+", icon: "lucide:plus-circle", cls: "bg-blue-50 text-blue-700 border-blue-200" },
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

  // Estados para gestión de empleados (vista empleados)
  const [buscadorEmp, setBuscadorEmp] = useState("");
  const [filtroEmp, setFiltroEmp] = useState("activos");
  const [openEmp, setOpenEmp] = useState(false);
  const [editandoEmp, setEditandoEmp] = useState(null);
  const [formEmp, setFormEmp] = useState({ nombre: "", activo: true, valorDia: "", valorExtra: "", sector: "" });

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

  const estadisticasMensuales = useMemo(() => {
    const hoy = new Date();
    const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    const finMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0, 23, 59, 59);
    const docsMes = asistenciasMensuales.filter((a) => {
      const d = toDateSafe(a.weekStart);
      if (!d) return false;
      return d >= inicioMes && d <= finMes;
    });
    const porEmpleado = empleadosFiltrados.map((emp) => {
      const objetivoCalculado = Number(emp.objetivoMensual || 0) > 0
        ? Number(emp.objetivoMensual)
        : Math.round(Number(emp.valorDia || 0) * 26);
      const cobrado = docsMes
        .filter((a) => a.employeeId === emp.id)
        .reduce((acc, a) => acc + Number(a.totalSemana || 0), 0);
      const faltante = Math.max(objetivoCalculado - cobrado, 0);
      const progreso = objetivoCalculado > 0 ? Math.min((cobrado / objetivoCalculado) * 100, 100) : 0;
      return {
        id: emp.id,
        nombre: emp.nombre || "",
        objetivo: objetivoCalculado,
        cobrado,
        faltante,
        progreso,
      };
    });
    const totalObjetivo = porEmpleado.reduce((acc, i) => acc + i.objetivo, 0);
    const totalCobrado = porEmpleado.reduce((acc, i) => acc + i.cobrado, 0);
    const totalFaltante = Math.max(totalObjetivo - totalCobrado, 0);
    const progresoGeneral = totalObjetivo > 0 ? Math.min((totalCobrado / totalObjetivo) * 100, 100) : 0;
    return {
      porEmpleado: porEmpleado.sort((a, b) => b.cobrado - a.cobrado),
      totalObjetivo,
      totalCobrado,
      totalFaltante,
      progresoGeneral,
      labelMes: hoy.toLocaleDateString("es-AR", { month: "long", year: "numeric" }),
    };
  }, [asistenciasMensuales, empleadosFiltrados]);

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
    const monto = montoManual != null ? Number(montoManual) : calcMonto(estado, base, extra);
    const k = dayKey(idx);
    const prev = asistencias[emp.id];
    const days = { ...(prev?.days || {}) , [k]: { estado, monto } };
    const totalSemana = [0,1,2,3,4,5].reduce((acc,i)=>acc+(days[dayKey(i)]?.monto||0),0);
    
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
        await setDoc(doc(db, "asistencias", a.id), { cerrada: true, snapshotTotal: a.totalSemana }, { merge: true });
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

  const abrirNuevoEmp = () => {
    setEditandoEmp(null);
    setFormEmp({ nombre: "", activo: true, valorDia: "", valorExtra: "", sector: "" });
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
      <div className="flex items-center justify-between gap-3 rounded-2xl px-4 py-2 bg-white/70 backdrop-blur shadow-sm">
        <div className="flex items-center gap-2">
          <div className="text-base font-semibold">Asistencia</div>
          <div className="flex items-center gap-2 pl-2">
            <Label htmlFor="vistaEmp" className="text-xs text-muted-foreground">Empleados</Label>
            <Switch id="vistaEmp" checked={vistaActiva==="empleados"} onCheckedChange={(v)=>setVistaActiva(v?"empleados":"asistencia")} />
          </div>
        </div>
        {vistaActiva === "asistencia" ? (
          <div className="flex items-center gap-2">
            <span className={`px-2 py-1 rounded-full text-[11px] font-medium border ${cerrada ? "bg-red-50 text-red-700 border-red-200" : "bg-green-50 text-green-700 border-green-200"}`}>
              {cerrada ? "Cerrada" : "Abierta"}
            </span>
            <Button variant="outline" onClick={() => setFechaBase(fmt(startOfWeek(new Date())))} className="h-8 px-2 text-xs">Hoy</Button>
            <Button variant="outline" onClick={() => navSemana(-1)} className="h-8 w-8 p-0"><Icon icon="lucide:chevron-left" /></Button>
            <div className="text-xs font-semibold">{rangoSemana}</div>
            <Button variant="outline" onClick={() => navSemana(1)} className="h-8 w-8 p-0"><Icon icon="lucide:chevron-right" /></Button>
            <Input placeholder="Buscar" value={filtroNombre} onChange={e=>setFiltroNombre(e.target.value)} className="h-8 w-40 text-xs" />
            <select value={filtroEstado} onChange={e=>setFiltroEstado(e.target.value)} className="h-8 border rounded-md px-2 text-xs">
              <option value="activos">Activos</option>
              <option value="inactivos">Inactivos</option>
              <option value="todos">Todos</option>
            </select>
            <Button variant="default" onClick={cerrarSemana} disabled={cerrada} className="h-8 px-2 text-xs">Cerrar semana</Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Input placeholder="Buscar" value={buscadorEmp} onChange={(e)=>setBuscadorEmp(e.target.value)} className="h-8 w-48 text-xs" />
            <select value={filtroEmp} onChange={(e)=>setFiltroEmp(e.target.value)} className="h-8 border rounded-md px-2 text-xs">
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
      <Card className="rounded-2xl shadow">
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between gap-2">
            <span>Estadísticas de Cobro del Mes</span>
            <span className="text-xs font-medium text-muted-foreground capitalize">{estadisticasMensuales.labelMes}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-xl border p-3 bg-green-50/60">
              <div className="text-xs text-muted-foreground">Cobrado acumulado</div>
              <div className="text-xl font-bold text-green-700">${estadisticasMensuales.totalCobrado.toLocaleString("es-AR")}</div>
            </div>
            <div className="rounded-xl border p-3 bg-blue-50/60">
              <div className="text-xs text-muted-foreground">Objetivo mensual</div>
              <div className="text-xl font-bold text-blue-700">${estadisticasMensuales.totalObjetivo.toLocaleString("es-AR")}</div>
            </div>
            <div className="rounded-xl border p-3 bg-orange-50/60">
              <div className="text-xs text-muted-foreground">Faltante al cierre</div>
              <div className="text-xl font-bold text-orange-700">${estadisticasMensuales.totalFaltante.toLocaleString("es-AR")}</div>
            </div>
          </div>
          <div className="rounded-xl border p-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
              <span>Avance general</span>
              <span>{estadisticasMensuales.progresoGeneral.toFixed(1)}%</span>
            </div>
            <div className="w-full bg-default-200 rounded-full h-2.5">
              <div
                className="h-2.5 rounded-full bg-primary transition-all"
                style={{ width: `${Math.max(0, Math.min(100, estadisticasMensuales.progresoGeneral))}%` }}
              />
            </div>
          </div>
          <div className="overflow-auto rounded-xl border">
            <table className="min-w-full text-sm">
              <thead className="bg-default-100">
                <tr>
                  <th className="px-3 py-2 text-left">Empleado</th>
                  <th className="px-3 py-2 text-right">Cobrado</th>
                  <th className="px-3 py-2 text-right">Objetivo</th>
                  <th className="px-3 py-2 text-right">Faltante</th>
                  <th className="px-3 py-2 text-right">Avance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-default-200">
                {estadisticasMensuales.porEmpleado.map((item) => (
                  <tr key={item.id}>
                    <td className="px-3 py-2 font-medium">{item.nombre}</td>
                    <td className="px-3 py-2 text-right text-green-700 font-semibold">${item.cobrado.toLocaleString("es-AR")}</td>
                    <td className="px-3 py-2 text-right">${item.objetivo.toLocaleString("es-AR")}</td>
                    <td className="px-3 py-2 text-right text-orange-700">${item.faltante.toLocaleString("es-AR")}</td>
                    <td className="px-3 py-2 text-right">{item.progreso.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
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
                  const tSemana = a?.totalSemana || 0;
                  const tAdv = totalAdelantosEmp(emp.id);
                  const tPagar = tSemana - tAdv;
                  const dropUp = empIdx === empleadosFiltrados.length - 1;
                  return (
                    <tr key={emp.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-2">
                          <div className={`w-2.5 h-2.5 rounded-full ${emp.activo!==false?"bg-green-500":"bg-gray-400"}`} />
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
                                <div className={`absolute ${dropUp ? "bottom-full mb-1" : "top-full mt-1"} left-0 inline-flex items-center gap-1 rounded-full bg-white shadow-lg px-1 py-1 z-30`}>
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
      <Card className="rounded-2xl shadow">
        <CardHeader>
          <CardTitle className="text-base">Empleados</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-auto rounded-xl shadow-sm">
            <table className="min-w-full text-sm rounded-xl overflow-hidden">
              <thead className="bg-default-100">
                <tr>
                  <th className="px-3 py-2 text-left">Nombre</th>
                  <th className="px-3 py-2 text-center">Activo</th>
                  <th className="px-3 py-2 text-right">Valor día</th>
                  <th className="px-3 py-2 text-right">Valor extra</th>
                  <th className="px-3 py-2 text-left">Sector</th>
                  <th className="px-3 py-2 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-default-200">
                {empleados
                  .filter(i => (filtroEmp === "todos" ? true : filtroEmp === "activos" ? i.activo !== false : i.activo === false))
                  .filter(i => (i.nombre || "").toLowerCase().includes(buscadorEmp.toLowerCase()))
                  .map(emp => (
                  <tr key={emp.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-2">{emp.nombre || ""}</td>
                    <td className="px-3 py-2 text-center">{emp.activo !== false ? "Sí" : "No"}</td>
                    <td className="px-3 py-2 text-right">${Number(emp.valorDia || 0).toLocaleString("es-AR")}</td>
                    <td className="px-3 py-2 text-right">${Number(emp.valorExtra || 0).toLocaleString("es-AR")}</td>
                    <td className="px-3 py-2">{emp.sector || ""}</td>
                    <td className="px-3 py-2 text-right">
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
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      )}

      {/* Modal Adelantos */}
      <Dialog open={Boolean(popoverEmpleado)} onOpenChange={()=>setPopoverEmpleado(null)}>
        <DialogContent className="rounded-2xl max-w-lg shadow-2xl border-none">
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
                  <div key={a.id} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 bg-white shadow-sm border border-border/50 transition-all hover:shadow-md">
                    <div className="flex flex-col">
                      <div className="text-sm font-semibold">${Number(a.monto||0).toLocaleString("es-AR")}</div>
                      <div className="text-xs text-muted-foreground flex gap-1">
                        <span>{fmtDM(a.fecha)}</span>
                        {a.nota && <span>• {a.nota}</span>}
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50" onClick={()=>eliminarAdelanto(a.id)}>
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
                   <Input type="date" className="h-9 bg-white" value={nuevoAdelanto.fecha} onChange={e=>setNuevoAdelanto(p=>({...p,fecha:e.target.value}))} />
                 </div>
                 <div className="space-y-1">
                   <Label className="text-xs">Monto</Label>
                   <div className="relative">
                     <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">$</span>
                     <Input type="number" min={0} placeholder="0" className="h-9 pl-6 bg-white" value={nuevoAdelanto.monto} onChange={e=>setNuevoAdelanto(p=>({...p,monto:e.target.value}))} />
                   </div>
                 </div>
               </div>
               <div className="space-y-1">
                 <Label className="text-xs">Nota (opcional)</Label>
                 <Input placeholder="Ej: Vale por materiales" className="h-9 bg-white" value={nuevoAdelanto.nota} onChange={e=>setNuevoAdelanto(p=>({...p,nota:e.target.value}))} />
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
        <DialogContent className="rounded-2xl max-w-lg shadow-2xl border-none">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">{editandoEmp ? "Editar Empleado" : "Nuevo Empleado"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-2">
            <div className="space-y-2">
              <Label htmlFor="empNombre">Nombre Completo</Label>
              <Input id="empNombre" placeholder="Ej: Juan Pérez" className="h-10" value={formEmp.nombre} onChange={(e)=>setFormEmp({...formEmp, nombre: e.target.value})} />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
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

            <div className="flex items-center justify-between p-3 rounded-xl bg-muted/20 border border-border/50">
              <div className="space-y-0.5">
                <Label htmlFor="empActivo" className="text-base">Empleado Activo</Label>
                <div className="text-xs text-muted-foreground">Si se desactiva, no aparecerá en las planillas nuevas.</div>
              </div>
              <Switch id="empActivo" checked={formEmp.activo} onCheckedChange={(v)=>setFormEmp({...formEmp, activo: v})} />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={()=>setOpenEmp(false)} className="h-10 rounded-xl">Cancelar</Button>
            <Button onClick={guardarEmp} disabled={!formEmp.nombre} className="h-10 rounded-xl px-6">Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
