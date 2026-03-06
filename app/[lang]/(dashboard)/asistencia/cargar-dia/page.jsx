"use client";
import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { db } from "@/lib/firebase";
import { collection, doc, getDocs, query, setDoc, where } from "firebase/firestore";
import { Icon } from "@iconify/react";

const estados = [
  { value: "presente", label: "Presente" },
  { value: "ausente", label: "Ausente" },
  { value: "media", label: "Media jornada" },
  { value: "extra", label: "Extra" },
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

export default function CargarDiaPage() {
  const [fecha, setFecha] = useState(fmt(new Date()));
  const [empleados, setEmpleados] = useState([]);
  const [asistencias, setAsistencias] = useState({});
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
    const base = Number(emp.valorDia || 0);
    const extra = Number(emp.valorExtra || 0);
    const monto = calcMonto(estado, base, extra);
    const prev = asistencias[emp.id];
    const k = dayKey(idx);
    const days = { ...(prev?.days || {}), [k]: { estado, monto } };
    const totalSemana = [0,1,2,3,4,5].reduce((acc,i)=>acc+(days[dayKey(i)]?.monto||0),0);
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
          <Input type="date" value={fecha} onChange={e=>setFecha(e.target.value)} className="w-48" />
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
                  <th className="px-3 py-2 text-right">Monto</th>
                </tr>
              </thead>
              <tbody>
                {empleados.map(emp=>{
                  const prev = asistencias[emp.id];
                  const d = prev?.days?.[dayKey(idx)] || { estado: "ausente", monto: 0 };
                  return (
                    <tr key={emp.id} className="border-t">
                      <td className="px-3 py-2">{emp.nombre || ""}</td>
                      <td className="px-3 py-2">
                        <select value={d.estado} onChange={e=>setEstado(emp,e.target.value)} className="border rounded-md px-2 py-1 text-sm">
                          {estados.map(s=>(<option key={s.value} value={s.value}>{s.label}</option>))}
                        </select>
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
