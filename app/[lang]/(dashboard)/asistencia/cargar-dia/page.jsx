"use client";
import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { db } from "@/lib/firebase";
import { collection, doc, getDocs, query, setDoc, where } from "firebase/firestore";
import { Icon } from "@iconify/react";
import { calcMontoAdicional, calcMontoJornada } from "@/lib/asistencia-utils";

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
function esDiaPagablePorIndice(i) {
  return i >= 0 && i <= 4;
}

export default function CargarDiaPage() {
  const [fecha, setFecha] = useState(fmt(new Date()));
  const [empleados, setEmpleados] = useState([]);
  const [asistencias, setAsistencias] = useState({});
  const [adicionalDrafts, setAdicionalDrafts] = useState({});
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

  const setEstado = async (emp, estado) => {
    if (!emp?.id) return;
    const prev = asistencias[emp.id];
    const k = dayKey(idx);
    const prevDay = prev?.days?.[k] || { estado: "ausente", monto: 0 };
    const montoJornada = calcMontoJornada({
      estado,
      valorDia: Number(emp.valorDia || 0),
      isWeekend: !esDiaPagablePorIndice(idx),
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
      isWeekend: !esDiaPagablePorIndice(idx),
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
    <div className="flex flex-col gap-6 py-8 mx-auto font-sans">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Icon icon="lucide:calendar" className="w-5 h-5" />
          <DateInput
            value={fecha}
            onChange={(v) => setFecha(v)}
            buttonClassName="w-48 justify-start"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={()=>marcarTodos("presente")}>Marcar todos presentes</Button>
          <Button variant="outline" onClick={copiarDesdeAyer}>Copiar desde ayer</Button>
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Carga rápida</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-auto">
            <table className="min-w-full text-sm border rounded-lg overflow-hidden">
              <thead className="bg-default-100">
                <tr>
                  <th className="px-3 py-2 text-left">Empleado</th>
                  <th className="px-3 py-2 text-left">Estado</th>
                  <th className="px-3 py-2 text-left">Adicional</th>
                  <th className="px-3 py-2 text-right">Monto</th>
                </tr>
              </thead>
              <tbody>
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
                    <tr key={emp.id} className="border-t">
                      <td className="px-3 py-2">{emp.nombre || ""}</td>
                      <td className="px-3 py-2">
                        <select value={d.estado} onChange={e=>setEstado(emp,e.target.value)} className="border rounded-md px-2 py-1 text-sm">
                          {estados.map(s=>(<option key={s.value} value={s.value}>{s.label}</option>))}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-col gap-2">
                          <select
                            value={draft.tipo}
                            onChange={e=>setAdicionalDrafts(p=>({ ...p, [emp.id]: { ...draft, tipo: e.target.value } }))}
                            className="border rounded-md px-2 py-1 text-sm"
                          >
                            {adicionales.map(s=>(<option key={s.value || "none"} value={s.value}>{s.label}</option>))}
                          </select>
                          {draft.tipo === "horas" ? (
                            <Input
                              type="number"
                              min={0}
                              step="0.5"
                              value={draft.cantidad}
                              onChange={e=>setAdicionalDrafts(p=>({ ...p, [emp.id]: { ...draft, cantidad: e.target.value } }))}
                              placeholder="Horas"
                              className="h-9"
                            />
                          ) : null}
                          {draft.tipo === "manual" ? (
                            <Input
                              type="number"
                              min={0}
                              value={draft.monto}
                              onChange={e=>setAdicionalDrafts(p=>({ ...p, [emp.id]: { ...draft, monto: e.target.value } }))}
                              placeholder="Monto"
                              className="h-9"
                            />
                          ) : null}
                          <Button variant="outline" size="sm" onClick={()=>setAdicional(emp, draft)}>
                            Guardar adicional
                          </Button>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right">${Number(d.monto||0).toLocaleString("es-AR")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
