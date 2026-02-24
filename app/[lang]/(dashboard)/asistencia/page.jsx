"use client";
import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { db } from "@/lib/firebase";
import { collection, doc, getDocs, onSnapshot, query, setDoc, where, addDoc, deleteDoc, updateDoc } from "firebase/firestore";
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
  const [vistaActiva, setVistaActiva] = useState("asistencia"); // asistencia | empleados
  const [fechaBase, setFechaBase] = useState(fmt(startOfWeek(new Date())));
  const [empleados, setEmpleados] = useState([]);
  const [filtroNombre, setFiltroNombre] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("activos");
  const [asistencias, setAsistencias] = useState({});
  const [adelantos, setAdelantos] = useState({});
  const [popoverEmpleado, setPopoverEmpleado] = useState(null);
  const [nuevoAdelanto, setNuevoAdelanto] = useState({ fecha: fmt(new Date()), monto: "", nota: "" });
  const [cerrada, setCerrada] = useState(false);
  // Estado para gestión de empleados (vista empleados)
  const [buscadorEmp, setBuscadorEmp] = useState("");
  const [filtroEmp, setFiltroEmp] = useState("activos");
  const [openEmp, setOpenEmp] = useState(false);
  const [editandoEmp, setEditandoEmp] = useState(null);
  const [formEmp, setFormEmp] = useState({ nombre: "", activo: true, valorDia: "", valorExtra: "", sector: "" });

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

  // Funciones gestión de empleados (vista empleados)
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
    if (editandoEmp) {
      await updateDoc(doc(db, "empleados", editandoEmp.id), payload);
    } else {
      await addDoc(collection(db, "empleados"), payload);
    }
    const snap = await getDocs(collection(db, "empleados"));
    setEmpleados(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    setOpenEmp(false);
  };
  const eliminarEmp = async (emp) => {
    if (!confirm("¿Eliminar empleado?")) return;
    await deleteDoc(doc(db, "empleados", emp.id));
    const snap = await getDocs(collection(db, "empleados"));
    setEmpleados(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  };

  return (
    <div className="flex flex-col gap-6 py-8 mx-auto font-sans">
      <div className="flex items-center justify-between gap-4 bg-gradient-to-r from-gray-50 to-white border rounded-2xl px-4 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="text-lg font-semibold">Asistencia</div>
          <div className="flex items-center gap-2 pl-3">
            <Label htmlFor="vistaEmp" className="text-sm">Empleados</Label>
            <Switch id="vistaEmp" checked={vistaActiva==="empleados"} onCheckedChange={(v)=>setVistaActiva(v?"empleados":"asistencia")} />
          </div>
        </div>
        {vistaActiva === "asistencia" ? (
          <div className="flex items-center gap-2">
            <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${cerrada ? "bg-red-50 text-red-700 border-red-200" : "bg-green-50 text-green-700 border-green-200"}`}>
              {cerrada ? "Semana cerrada" : "Semana abierta"}
            </span>
            <Button variant="outline" onClick={() => setFechaBase(fmt(startOfWeek(new Date())))} className="px-3">Hoy</Button>
            <Button variant="outline" onClick={() => navSemana(-1)} className="px-3"><Icon icon="lucide:chevron-left" /></Button>
            <div className="text-sm font-semibold">Semana {rangoSemana}</div>
            <Button variant="outline" onClick={() => navSemana(1)} className="px-3"><Icon icon="lucide:chevron-right" /></Button>
            <Input placeholder="Buscar empleado" value={filtroNombre} onChange={e=>setFiltroNombre(e.target.value)} className="w-56" />
            <select value={filtroEstado} onChange={e=>setFiltroEstado(e.target.value)} className="border rounded-md px-3 py-2 text-sm">
              <option value="activos">Activos</option>
              <option value="inactivos">Inactivos</option>
              <option value="todos">Todos</option>
            </select>
            <Button variant="default" onClick={cerrarSemana} disabled={cerrada} className="ml-2">{cerrada?"Cerrada":"Cerrar semana"}</Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Input placeholder="Buscar por nombre" value={buscadorEmp} onChange={(e)=>setBuscadorEmp(e.target.value)} className="w-64" />
            <select value={filtroEmp} onChange={(e)=>setFiltroEmp(e.target.value)} className="border rounded-md px-3 py-2 text-sm">
              <option value="activos">Activos</option>
              <option value="inactivos">Inactivos</option>
              <option value="todos">Todos</option>
            </select>
            <Button onClick={abrirNuevoEmp}>Nuevo empleado</Button>
          </div>
        )}
      </div>

      {vistaActiva === "asistencia" ? (
      <Card className="overflow-hidden rounded-2xl shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Liquidación semanal</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-auto rounded-xl border">
            <table className="min-w-full text-sm rounded-xl overflow-hidden">
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
                    <tr key={emp.id} className="border-t hover:bg-muted/30 transition-colors">
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className={`w-2.5 h-2.5 rounded-full ${emp.activo!==false?"bg-green-500":"bg-gray-400"}`} />
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
                              <Input disabled={cerrada} type="number" min={0} value={d.monto} onChange={e=>setDay(emp,i,d.estado,e.target.value)} className="w-24 text-right rounded-md" />
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
      ) : (
      <Card className="rounded-2xl shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Empleados</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-auto rounded-xl border">
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
              <tbody>
                {empleados
                  .filter(i => (filtroEmp === "todos" ? true : filtroEmp === "activos" ? i.activo !== false : i.activo === false))
                  .filter(i => (i.nombre || "").toLowerCase().includes(buscadorEmp.toLowerCase()))
                  .map(emp => (
                  <tr key={emp.id} className="border-t hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-2">{emp.nombre || ""}</td>
                    <td className="px-3 py-2 text-center">{emp.activo !== false ? "Sí" : "No"}</td>
                    <td className="px-3 py-2 text-right">${Number(emp.valorDia || 0).toLocaleString("es-AR")}</td>
                    <td className="px-3 py-2 text-right">${Number(emp.valorExtra || 0).toLocaleString("es-AR")}</td>
                    <td className="px-3 py-2">{emp.sector || ""}</td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center gap-2 justify-end">
                        <Button variant="ghost" size="sm" onClick={()=>abrirEditarEmp(emp)}>Editar</Button>
                        <Button variant="ghost" size="sm" onClick={()=>eliminarEmp(emp)}>Eliminar</Button>
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

      <Dialog open={Boolean(popoverEmpleado)} onOpenChange={()=>setPopoverEmpleado(null)}>
        <DialogContent className="rounded-xl">
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

      <Dialog open={openEmp} onOpenChange={setOpenEmp}>
        <DialogContent className="w-[95vw] max-w-[600px] max-h-[90vh] rounded-xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">{editandoEmp ? "Editar empleado" : "Nuevo empleado"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="empNombre" className="text-sm font-medium">Nombre</Label>
              <Input id="empNombre" placeholder="Nombre y apellido" value={formEmp.nombre} onChange={(e)=>setFormEmp({...formEmp, nombre: e.target.value})} className="mt-1" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="empValorDia" className="text-sm font-medium">Valor día</Label>
                <Input id="empValorDia" type="number" min={0} placeholder="0" value={formEmp.valorDia} onChange={(e)=>setFormEmp({...formEmp, valorDia: e.target.value})} className="mt-1" />
              </div>
              <div>
                <Label htmlFor="empValorExtra" className="text-sm font-medium">Valor extra</Label>
                <Input id="empValorExtra" type="number" min={0} placeholder="0" value={formEmp.valorExtra} onChange={(e)=>setFormEmp({...formEmp, valorExtra: e.target.value})} className="mt-1" />
              </div>
            </div>
            <div>
              <Label htmlFor="empSector" className="text-sm font-medium">Sector</Label>
              <Input id="empSector" placeholder="Ej: Aserrado, Carga, Entregas" value={formEmp.sector} onChange={(e)=>setFormEmp({...formEmp, sector: e.target.value})} className="mt-1" />
            </div>
            <div className="flex items-center justify-between rounded-md border bg-default-50 py-2 px-3">
              <div className="flex flex-col">
                <Label htmlFor="empActivo" className="text-sm font-medium">Activo</Label>
                <span className="text-xs text-muted-foreground">Habilitar para listados de asistencia</span>
              </div>
              <Switch id="empActivo" checked={formEmp.activo} onCheckedChange={(v)=>setFormEmp({...formEmp, activo: v})} />
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={()=>setOpenEmp(false)}>Cancelar</Button>
            <Button onClick={guardarEmp} disabled={!formEmp.nombre}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
