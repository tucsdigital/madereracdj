"use client";
import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { db } from "@/lib/firebase";
import { collection, doc, getDocs, onSnapshot, query, setDoc, where, addDoc, deleteDoc } from "firebase/firestore";
import { useParams } from "next/navigation";
import { Icon } from "@iconify/react";

function startOfWeek(d) {
  const date = new Date(d);
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
  return new Date(d).toISOString().slice(0, 10);
}

const estados = [
  { value: "presente", label: "Presente" },
  { value: "ausente", label: "Ausente" },
  { value: "media", label: "Media jornada" },
  { value: "extra", label: "Extra" },
];

function calcMonto(estado, base, extra) {
  if (estado === "ausente") return 0;
  if (estado === "presente") return base;
  if (estado === "media") return Math.round(base * 0.5);
  if (estado === "extra") return base + (extra || 0);
  return 0;
}

function dayKey(i) {
  return ["lun", "mar", "mie", "jue", "vie", "sab"][i];
}

export default function AsistenciaPage() {
  const { lang } = useParams();
  const [fechaBase, setFechaBase] = useState(fmt(startOfWeek(new Date())));
  const [empleados, setEmpleados] = useState([]);
  const [filtroNombre, setFiltroNombre] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("activos");
  const [asistencias, setAsistencias] = useState({});
  const [adelantos, setAdelantos] = useState({});
  const [popoverEmpleado, setPopoverEmpleado] = useState(null);
  const [nuevoAdelanto, setNuevoAdelanto] = useState({ fecha: fmt(new Date()), monto: "", nota: "" });
  const [cerrada, setCerrada] = useState(false);

  const semanaInicio = useMemo(() => startOfWeek(new Date(fechaBase)), [fechaBase]);
  const semanaClave = useMemo(() => fmt(semanaInicio), [semanaInicio]);
  const rangoSemana = useMemo(() => {
    const ini = fmt(semanaInicio);
    const fin = fmt(addDays(semanaInicio, 5));
    return `${ini} – ${fin}`;
  }, [semanaInicio]);

  useEffect(() => {
    let unsub;
    const load = async () => {
      const snap = await getDocs(collection(db, "empleados"));
      const lista = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setEmpleados(lista);
      const q = query(collection(db, "asistencias"), where("weekStart", "==", semanaClave));
      unsub = onSnapshot(q, s => {
        const map = {};
        s.forEach(d => {
          map[d.data().employeeId] = { id: d.id, ...d.data() };
        });
        setAsistencias(map);
        setCerrada(Boolean(Object.values(map)[0]?.cerrada));
      });
      const advQ = query(collection(db, "adelantos"), where("weekStart", "==", semanaClave));
      onSnapshot(advQ, s => {
        const byEmp = {};
        s.forEach(d => {
          const a = { id: d.id, ...d.data() };
          if (!byEmp[a.employeeId]) byEmp[a.employeeId] = [];
          byEmp[a.employeeId].push(a);
        });
        setAdelantos(byEmp);
      });
    };
    load();
    return () => unsub && unsub();
  }, [semanaClave]);

  const empleadosFiltrados = useMemo(() => {
    return empleados
      .filter(e => (filtroEstado === "todos" ? true : filtroEstado === "activos" ? e.activo !== false : e.activo === false))
      .filter(e => e.nombre?.toLowerCase().includes(filtroNombre.toLowerCase()));
  }, [empleados, filtroEstado, filtroNombre]);

  const totalAdelantosEmp = empId => (adelantos[empId] || []).reduce((acc, a) => acc + Number(a.monto || 0), 0);

  const getDay = (empId, idx) => {
    const doc = asistencias[empId];
    const k = dayKey(idx);
    return doc?.days?.[k] || { estado: "ausente", monto: 0 };
  };

  const setDay = async (emp, idx, estado, montoManual) => {
    if (cerrada) return;
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
    if (prev?.id) {
      await setDoc(doc(db, "asistencias", prev.id), data, { merge: true });
    } else {
      const ref = doc(collection(db, "asistencias"));
      await setDoc(ref, { ...data, id: ref.id });
    }
  };

  const totalAPagar = empId => {
    const docA = asistencias[empId];
    const ts = docA?.totalSemana || 0;
    const adv = totalAdelantosEmp(empId);
    return ts - adv;
  };

  const cerrarSemana = async () => {
    const updates = Object.values(asistencias);
    for (const a of updates) {
      await setDoc(doc(db, "asistencias", a.id), { cerrada: true, snapshotTotal: a.totalSemana }, { merge: true });
    }
    setCerrada(true);
  };

  const abrirPopoverAdelantos = emp => {
    setPopoverEmpleado(emp);
    setNuevoAdelanto({ fecha: fmt(new Date()), monto: "", nota: "" });
  };

  const agregarAdelanto = async () => {
    if (!popoverEmpleado) return;
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
  };

  const eliminarAdelanto = async id => {
    await deleteDoc(doc(db, "adelantos", id));
  };

  const navSemana = dir => {
    const delta = dir === -1 ? -7 : 7;
    setFechaBase(fmt(addDays(semanaInicio, delta)));
  };

  return (
    <div className="flex flex-col gap-6 py-8 mx-auto font-sans">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={() => navSemana(-1)} className="px-3"><Icon icon="lucide:chevron-left" /> </Button>
          <div className="text-sm font-semibold">Semana {rangoSemana}</div>
          <Button variant="outline" onClick={() => navSemana(1)} className="px-3"><Icon icon="lucide:chevron-right" /> </Button>
        </div>
        <div className="flex items-center gap-2">
          <Input placeholder="Buscar empleado" value={filtroNombre} onChange={e=>setFiltroNombre(e.target.value)} className="w-56" />
          <select value={filtroEstado} onChange={e=>setFiltroEstado(e.target.value)} className="border rounded-md px-3 py-2 text-sm">
            <option value="activos">Activos</option>
            <option value="inactivos">Inactivos</option>
            <option value="todos">Todos</option>
          </select>
          <Button variant="default" onClick={cerrarSemana} disabled={cerrada} className="ml-2">{cerrada?"Semana cerrada":"Cerrar semana"}</Button>
          <Button variant="outline" onClick={()=>window.location.assign(`/${lang}/asistencia/empleados`)} className="ml-2">Gestionar empleados</Button>
        </div>
      </div>
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="text-base">Liquidación semanal</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-auto">
            <table className="min-w-full text-sm border border-default-200 rounded-lg overflow-hidden">
              <thead className="bg-default-100">
                <tr>
                  <th className="px-3 py-2 text-left w-56">Empleado</th>
                  {["Lun","Mar","Mié","Jue","Vie","Sáb"].map(h=>(<th key={h} className="px-3 py-2 text-center w-36">{h}</th>))}
                  <th className="px-3 py-2 text-right w-28">Total semana</th>
                  <th className="px-3 py-2 text-right w-28">Adelantos</th>
                  <th className="px-3 py-2 text-right w-28">Total a pagar</th>
                  <th className="px-3 py-2 text-center w-24">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {empleadosFiltrados.map(emp=>{
                  const a = asistencias[emp.id];
                  const tSemana = a?.totalSemana || 0;
                  const tAdv = totalAdelantosEmp(emp.id);
                  const tPagar = tSemana - tAdv;
                  return (
                    <tr key={emp.id} className="border-t">
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${emp.activo!==false?"bg-green-500":"bg-gray-400"}`} />
                          <div className="font-medium">{emp.nombre || ""}</div>
                        </div>
                      </td>
                      {[0,1,2,3,4,5].map(i=>{
                        const d = getDay(emp.id,i);
                        return (
                          <td key={i} className="px-2 py-2">
                            <div className="flex items-center gap-2">
                              <select disabled={cerrada} value={d.estado} onChange={e=>setDay(emp,i,e.target.value,null)} className="border rounded-md px-2 py-1 text-xs">
                                {estados.map(s=>(<option key={s.value} value={s.value}>{s.label}</option>))}
                              </select>
                              <Input disabled={cerrada} type="number" min={0} value={d.monto} onChange={e=>setDay(emp,i,d.estado,e.target.value)} className="w-24 text-right" />
                            </div>
                          </td>
                        );
                      })}
                      <td className="px-3 py-2 text-right font-semibold">${tSemana.toLocaleString("es-AR")}</td>
                      <td className="px-3 py-2 text-right">
                        <Button variant="outline" size="sm" onClick={()=>abrirPopoverAdelantos(emp)}>{tAdv.toLocaleString("es-AR")}</Button>
                      </td>
                      <td className="px-3 py-2 text-right font-semibold">${tPagar.toLocaleString("es-AR")}</td>
                      <td className="px-3 py-2 text-center">
                        <Button variant="ghost" size="sm" onClick={()=>window.location.assign(`/${lang}/asistencia/empleado/${emp.id}`)}>Ver detalle</Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={Boolean(popoverEmpleado)} onOpenChange={()=>setPopoverEmpleado(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adelantos {popoverEmpleado?.nombre || ""}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-sm font-medium">Semana {rangoSemana}</div>
            <div className="space-y-2 max-h-52 overflow-auto border rounded-md p-2">
              {(adelantos[popoverEmpleado?.id]||[]).map(a=>(
                <div key={a.id} className="flex items-center justify-between gap-2 border rounded-md px-2 py-1">
                  <div className="text-sm">{a.fecha} — ${Number(a.monto||0).toLocaleString("es-AR")} {a.nota?`• ${a.nota}`:""}</div>
                  <Button variant="ghost" size="sm" onClick={()=>eliminarAdelanto(a.id)}>Eliminar</Button>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <Input type="date" value={nuevoAdelanto.fecha} onChange={e=>setNuevoAdelanto(p=>({...p,fecha:e.target.value}))} />
              <Input type="number" min={0} placeholder="Monto" value={nuevoAdelanto.monto} onChange={e=>setNuevoAdelanto(p=>({...p,monto:e.target.value}))} />
              <Input placeholder="Nota" value={nuevoAdelanto.nota} onChange={e=>setNuevoAdelanto(p=>({...p,nota:e.target.value}))} />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={agregarAdelanto} disabled={!nuevoAdelanto.monto}>Agregar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
