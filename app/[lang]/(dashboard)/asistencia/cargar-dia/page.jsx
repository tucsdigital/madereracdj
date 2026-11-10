"use client";
import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { db } from "@/lib/firebase";
import { collection, doc, getDocs, onSnapshot, query, setDoc, where } from "firebase/firestore";
import { Icon } from "@iconify/react";
import {
  calcMontoAdicional,
  calcMontoJornada,
  LABOR_DAY_KEYS,
  normalizeLaborDayKeys,
} from "@/lib/asistencia-utils";

const estados = [
  { value: "presente", label: "Presente" },
  { value: "ausente", label: "Ausente" },
  { value: "media", label: "Media jornada" },
];

const adicionales = [
  { value: "", label: "Sin adicional" },
  { value: "horas", label: "Horas extra" },
  { value: "jornada", label: "Jornada adicional" },
  { value: "manual", label: "Monto personalizado" },
];

function startOfWeek(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  const res = new Date(date);
  res.setDate(date.getDate() + diff);
  res.setHours(0, 0, 0, 0);
  return res;
}
function fmt(d) {
  return new Date(d).toISOString().slice(0, 10);
}
function dayIndex(dateStr) {
  const d = new Date(dateStr);
  const so = startOfWeek(d);
  return Math.floor((d - so) / 86400000);
}
function dayKey(i) {
  return ["lun", "mar", "mie", "jue", "vie", "sab", "dom"][i];
}
function esDiaPagablePorIndice(i, diasLaborables) {
  return normalizeLaborDayKeys(diasLaborables).includes(dayKey(i));
}

export default function CargarDiaPage() {
  const [fecha, setFecha] = useState(fmt(new Date()));
  const [empleados, setEmpleados] = useState([]);
  const [asistencias, setAsistencias] = useState({});
  const [adicionalDrafts, setAdicionalDrafts] = useState({});
  const [diasLaborables, setDiasLaborables] = useState(LABOR_DAY_KEYS);
  const semanaClave = fmt(startOfWeek(new Date(fecha)));
  const idx = dayIndex(fecha);

  useEffect(() => {
    const load = async () => {
      const snap = await getDocs(collection(db, "empleados"));
      setEmpleados(snap.docs.map(d => ({ ...d.data(), id: d.id })));
      const q = query(collection(db, "asistencias"), where("weekStart", "==", semanaClave));
      const as = await getDocs(q);
      const map = {};
      as.forEach(d => map[d.data().employeeId] = { id: d.id, ...d.data() });
      setAsistencias(map);
    };
    load();
  }, [semanaClave]);

  useEffect(() => {
    const ref = doc(db, "configuracion", "asistencia");
    return onSnapshot(ref, (snap) => {
      setDiasLaborables(normalizeLaborDayKeys(snap.data()?.diasLaborables));
    });
  }, []);

  const setEstado = async (emp, estado) => {
    if (!emp?.id) return;
    const prev = asistencias[emp.id];
    const k = dayKey(idx);
    const prevDay = prev?.days?.[k] || { estado: "ausente", monto: 0 };
    const montoJornada = calcMontoJornada({
      estado,
      valorDia: Number(emp.valorDia || 0),
      isWeekend: !esDiaPagablePorIndice(idx, diasLaborables),
    });
    const extraMonto = Number(prevDay?.extraMonto || 0);
    const nextDay = {
      ...prevDay,
      estado,
      montoJornada,
      monto: Number(montoJornada || 0) + Number(extraMonto || 0),
    };
    const days = { ...(prev?.days || {}), [k]: nextDay };
    const totalSemana = [0,1,2,3,4,5,6].reduce((acc,i)=>acc+(days[dayKey(i)]?.monto||0),0);
    const data = { employeeId: emp.id, employeeNombre: emp.nombre||"", weekStart: semanaClave, days, totalSemana, cerrada: prev?.cerrada||false };
    if (prev?.id) await setDoc(doc(db, "asistencias", prev.id), data, { merge: true });
    else {
      const ref = doc(collection(db, "asistencias"));
      await setDoc(ref, { ...data, id: ref.id });
      setAsistencias(p => ({ ...p, [emp.id]: { ...data, id: ref.id } }));
    }
  };

  const setAdicional = async (emp, draft) => {
    if (!emp?.id) return;
    const prev = asistencias[emp.id];
    const k = dayKey(idx);
    const prevDay = prev?.days?.[k] || { estado: "ausente", monto: 0 };
    const tipo = String(draft?.tipo || "");
    const cantidad = tipo === "horas" ? Number(draft?.cantidad || 0) : 0;
    const montoManual = tipo === "manual" ? Number(draft?.monto || 0) : 0;
    const extraMonto = calcMontoAdicional({
      empleado: emp,
      tipo,
      cantidad,
      montoManual,
    });
    const montoJornada = calcMontoJornada({
      estado: String(prevDay.estado || "ausente"),
      valorDia: Number(emp.valorDia || 0),
      isWeekend: !esDiaPagablePorIndice(idx, diasLaborables),
    });
    const nextDay = {
      ...prevDay,
      montoJornada,
      extraTipo: tipo,
      extraCantidad: tipo === "horas" ? cantidad : 0,
      extraNota: String(draft?.nota || ""),
      extraMonto,
      monto: Number(montoJornada || 0) + Number(extraMonto || 0),
    };
    const days = { ...(prev?.days || {}), [k]: nextDay };
    const totalSemana = [0,1,2,3,4,5,6].reduce((acc,i)=>acc+(days[dayKey(i)]?.monto||0),0);
    const data = { employeeId: emp.id, employeeNombre: emp.nombre||"", weekStart: semanaClave, days, totalSemana, cerrada: prev?.cerrada||false };
    if (prev?.id) await setDoc(doc(db, "asistencias", prev.id), data, { merge: true });
    else {
      const ref = doc(collection(db, "asistencias"));
      await setDoc(ref, { ...data, id: ref.id });
      setAsistencias(p => ({ ...p, [emp.id]: { ...data, id: ref.id } }));
    }
  };

  const marcarTodos = async estado => {
    for (const emp of empleados) await setEstado(emp, estado);
  };

  const copiarDesdeAyer = async () => {
    const d = new Date(fecha);
    d.setDate(d.getDate() - 1);
    const ayer = fmt(d);
    const ayerIdx = dayIndex(ayer);
    for (const emp of empleados) {
      const prev = asistencias[emp.id];
      const k = dayKey(ayerIdx);
      const reg = prev?.days?.[k] || { estado: "ausente", monto: 0 };
      await setEstado(emp, reg.estado);
    }
  };

  return (
    <main className="mx-auto flex w-full max-w-[1500px] flex-col gap-6 px-3 py-6 font-sans text-slate-900 sm:px-6 sm:py-8">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[.18em] text-amber-700">Asistencia · Registro</p>
          <h1 className="text-3xl font-semibold tracking-[-.04em] sm:text-4xl">Carga diaria</h1>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2">
          <Icon icon="lucide:calendar" className="w-5 h-5" />
          <DateInput
            value={fecha}
            onChange={(v) => setFecha(v)}
            buttonClassName="h-9 w-full justify-start rounded-md border-slate-200 bg-white text-xs shadow-sm sm:w-48"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={()=>marcarTodos("presente")} className="h-9 rounded-md border-slate-200 px-3 text-xs">Marcar todos presentes</Button>
          <Button variant="outline" onClick={copiarDesdeAyer} className="h-9 rounded-md border-slate-200 px-3 text-xs">Copiar desde ayer</Button>
        </div>
        </div>
      </header>
      <Card className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm shadow-slate-200/40">
        <CardHeader className="border-b border-slate-200 p-3 sm:p-4">
          <CardTitle className="text-sm font-semibold text-slate-900">Equipo · {empleados.length} empleados</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div>
            <table className="block w-full text-sm md:table">
              <thead className="hidden bg-slate-50/70 md:table-header-group">
                <tr className="border-b border-slate-200">
                  <th className="px-3 py-2 text-left">Empleado</th>
                  <th className="px-3 py-2 text-left">Estado</th>
                  <th className="px-3 py-2 text-left">Adicional</th>
                  <th className="px-3 py-2 text-right">Monto</th>
                </tr>
              </thead>
              <tbody className="block divide-y divide-slate-200 md:table-row-group">
                {empleados.map(emp=>{
                  const prev = asistencias[emp.id];
                  const d = prev?.days?.[dayKey(idx)] || { estado: "ausente", monto: 0 };
                  const draft = adicionalDrafts[emp.id] || {
                    tipo: String(d.extraTipo || ""),
                    cantidad: d.extraCantidad ? String(d.extraCantidad) : "",
                    monto: d.extraTipo === "manual" && Number(d.extraMonto || 0) > 0 ? String(d.extraMonto) : "",
                    nota: String(d.extraNota || ""),
                  };
                  return (
                    <tr key={emp.id} className="block px-1 py-2 md:table-row md:border-b md:border-slate-100 md:px-0 md:py-0">
                      <td data-label="Empleado" className="flex items-center justify-between gap-3 px-3 py-2 md:table-cell md:px-4 md:py-3"><span className="w-[34%] shrink-0 text-[10px] font-semibold uppercase tracking-wide text-slate-400 md:hidden">Empleado</span><span className="flex-1 text-right font-medium text-slate-900 md:text-left">{emp.nombre || ""}</span></td>
                      <td data-label="Estado" className="flex items-center justify-between gap-3 px-3 py-2 md:table-cell md:px-4 md:py-3"><span className="w-[34%] shrink-0 text-[10px] font-semibold uppercase tracking-wide text-slate-400 md:hidden">Estado</span><select aria-label={`Estado de asistencia de ${emp.nombre || "empleado"}`} value={d.estado} onChange={e=>setEstado(emp,e.target.value)} className="h-9 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 text-xs md:w-auto md:flex-none">{estados.map(s=>(<option key={s.value} value={s.value}>{s.label}</option>))}</select></td>
                      <td data-label="Adicional" className="flex items-start justify-between gap-3 px-3 py-2 md:table-cell md:px-4 md:py-3"><span className="w-[34%] shrink-0 pt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400 md:hidden">Adicional</span><div className="min-w-0 flex-1 space-y-2">
                        <select aria-label={`Tipo de adicional de ${emp.nombre || "empleado"}`} value={draft.tipo} onChange={e=>setAdicionalDrafts(p=>({ ...p, [emp.id]: { ...draft, tipo: e.target.value } }))} className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-xs">{adicionales.map(s=>(<option key={s.value || "none"} value={s.value}>{s.label}</option>))}</select>
                        {draft.tipo === "horas" ? <Input type="number" min={0} step="0.5" value={draft.cantidad} onChange={e=>setAdicionalDrafts(p=>({ ...p, [emp.id]: { ...draft, cantidad: e.target.value } }))} placeholder="Horas" className="h-9 text-xs" /> : null}
                        {draft.tipo === "manual" ? <Input type="number" min={0} value={draft.monto} onChange={e=>setAdicionalDrafts(p=>({ ...p, [emp.id]: { ...draft, monto: e.target.value } }))} placeholder="Monto" className="h-9 text-xs" /> : null}
                        <Button variant="outline" size="sm" onClick={()=>setAdicional(emp, draft)} className="h-8 rounded-md border-slate-200 text-xs">Guardar adicional</Button>
                      </div></td>
                      <td data-label="Monto" className="flex items-center justify-between gap-3 px-3 py-2 text-right tabular-nums md:table-cell md:px-4 md:py-3 md:text-right"><span className="w-[34%] shrink-0 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-400 md:hidden">Monto</span><span className="flex-1 font-semibold text-slate-900">{formatCurrencyAR(Number(d.monto || 0))}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
