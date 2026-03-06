"use client";
import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { db } from "@/lib/firebase";
import { collection, getDocs, query, where, orderBy, deleteDoc, doc, getDoc } from "firebase/firestore";
import { useParams } from "next/navigation";

export default function EmpleadoDetallePage() {
  const { id } = useParams();
  const [empleado, setEmpleado] = useState(null);
  const [asistencias, setAsistencias] = useState([]);
  const [adelantos, setAdelantos] = useState([]);
  const [filtroMes, setFiltroMes] = useState(new Date().toISOString().slice(0,7));

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

  const resumenMes = useMemo(() => {
    const [y,m] = filtroMes.split("-").map(Number);
    const totSemana = asistencias
      .filter(a => {
        const d = new Date(a.weekStart);
        return d.getFullYear()===y && d.getMonth()+1===m;
      })
      .reduce((acc,a)=>acc+(a.totalSemana||0),0);
    const totAdv = adelantos
      .filter(a=>{
        const d = new Date(a.fecha);
        return d.getFullYear()===y && d.getMonth()+1===m;
      })
      .reduce((acc,a)=>acc+Number(a.monto||0),0);
    return { totSemana, totAdv, totPagar: totSemana - totAdv };
  }, [filtroMes, asistencias, adelantos]);

  return (
    <div className="flex flex-col gap-6 py-8 mx-auto font-sans">
      <div className="flex items-center justify-between">
        <div className="text-lg font-semibold">{empleado?.nombre || "Empleado"}</div>
        <div className="flex items-center gap-2">
          <Input type="month" value={filtroMes} onChange={e=>setFiltroMes(e.target.value)} className="w-48" />
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm">Resumen mensual</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            <div className="flex justify-between"><span>Total semana</span><span className="font-semibold">${resumenMes.totSemana.toLocaleString("es-AR")}</span></div>
            <div className="flex justify-between"><span>Adelantos</span><span className="font-semibold">${resumenMes.totAdv.toLocaleString("es-AR")}</span></div>
            <div className="flex justify-between"><span>Total a pagar</span><span className="font-semibold">${resumenMes.totPagar.toLocaleString("es-AR")}</span></div>
          </CardContent>
        </Card>
        <Card className="md:col-span-2">
          <CardHeader><CardTitle className="text-sm">Semanas</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-auto">
              <table className="min-w-full text-sm border rounded">
                <thead className="bg-default-100">
                  <tr>
                    <th className="px-3 py-2 text-left">Semana</th>
                    <th className="px-3 py-2 text-right">Total</th>
                    <th className="px-3 py-2 text-left">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {asistencias.map(a=>(
                    <tr key={a.id} className="border-t">
                      <td className="px-3 py-2">{a.weekStart}</td>
                      <td className="px-3 py-2 text-right">${Number(a.totalSemana||0).toLocaleString("es-AR")}</td>
                      <td className="px-3 py-2">{a.cerrada?"CERRADA":"ABIERTA"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-sm">Adelantos</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-auto">
            <table className="min-w-full text-sm border rounded">
              <thead className="bg-default-100">
                <tr>
                  <th className="px-3 py-2 text-left">Fecha</th>
                  <th className="px-3 py-2 text-right">Monto</th>
                  <th className="px-3 py-2 text-left">Nota</th>
                  <th className="px-3 py-2 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {adelantos.map(a=>(
                  <tr key={a.id} className="border-t">
                    <td className="px-3 py-2">{a.fecha}</td>
                    <td className="px-3 py-2 text-right">${Number(a.monto||0).toLocaleString("es-AR")}</td>
                    <td className="px-3 py-2">{a.nota||""}</td>
                    <td className="px-3 py-2 text-right"><Button variant="ghost" size="sm" onClick={()=>deleteDoc(doc(db,"adelantos",a.id))}>Eliminar</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
