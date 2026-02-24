"use client";
import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { db } from "@/lib/firebase";
import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, updateDoc } from "firebase/firestore";
import { useParams } from "next/navigation";

export default function EmpleadosPage() {
  const { lang } = useParams();
  const [items, setItems] = useState([]);
  const [buscador, setBuscador] = useState("");
  const [filtro, setFiltro] = useState("activos");
  const [open, setOpen] = useState(false);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState({ nombre: "", activo: true, valorDia: "", valorExtra: "", sector: "" });

  useEffect(() => {
    const q = query(collection(db, "empleados"), orderBy("nombre", "asc"));
    const unsub = onSnapshot(q, (snap) => {
      setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  const filtrados = useMemo(() => {
    return items
      .filter((i) => (filtro === "todos" ? true : filtro === "activos" ? i.activo !== false : i.activo === false))
      .filter((i) => (i.nombre || "").toLowerCase().includes(buscador.toLowerCase()));
  }, [items, buscador, filtro]);

  const abrirNuevo = () => {
    setEditando(null);
    setForm({ nombre: "", activo: true, valorDia: "", valorExtra: "", sector: "" });
    setOpen(true);
  };

  const abrirEditar = (emp) => {
    setEditando(emp);
    setForm({
      nombre: emp.nombre || "",
      activo: emp.activo !== false,
      valorDia: emp.valorDia ?? "",
      valorExtra: emp.valorExtra ?? "",
      sector: emp.sector || "",
    });
    setOpen(true);
  };

  const guardar = async () => {
    const payload = {
      nombre: form.nombre.trim(),
      activo: Boolean(form.activo),
      valorDia: Number(form.valorDia || 0),
      valorExtra: Number(form.valorExtra || 0),
      sector: form.sector || "",
    };
    if (!payload.nombre) return;
    if (editando) {
      await updateDoc(doc(db, "empleados", editando.id), payload);
    } else {
      await addDoc(collection(db, "empleados"), payload);
    }
    setOpen(false);
  };

  const eliminar = async (emp) => {
    if (!confirm("¿Eliminar empleado?")) return;
    await deleteDoc(doc(db, "empleados", emp.id));
  };

  return (
    <div className="flex flex-col gap-6 py-8 mx-auto font-sans">
      <div className="flex items-center justify-between gap-4">
        <div className="text-lg font-semibold">Empleados</div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => (window.location.href = `/${lang}/asistencia`)}>Volver</Button>
          <Button onClick={abrirNuevo}>Nuevo empleado</Button>
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Listado</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 mb-3">
            <Input placeholder="Buscar por nombre" value={buscador} onChange={(e) => setBuscador(e.target.value)} className="w-64" />
            <select value={filtro} onChange={(e) => setFiltro(e.target.value)} className="border rounded-md px-3 py-2 text-sm">
              <option value="activos">Activos</option>
              <option value="inactivos">Inactivos</option>
              <option value="todos">Todos</option>
            </select>
          </div>
          <div className="overflow-auto">
            <table className="min-w-full text-sm border rounded-lg overflow-hidden">
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
                {filtrados.map((emp) => (
                  <tr key={emp.id} className="border-t">
                    <td className="px-3 py-2">{emp.nombre || ""}</td>
                    <td className="px-3 py-2 text-center">{emp.activo !== false ? "Sí" : "No"}</td>
                    <td className="px-3 py-2 text-right">${Number(emp.valorDia || 0).toLocaleString("es-AR")}</td>
                    <td className="px-3 py-2 text-right">${Number(emp.valorExtra || 0).toLocaleString("es-AR")}</td>
                    <td className="px-3 py-2">{emp.sector || ""}</td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex items-center gap-2 justify-end">
                        <Button variant="ghost" size="sm" onClick={() => abrirEditar(emp)}>Editar</Button>
                        <Button variant="ghost" size="sm" onClick={() => eliminar(emp)}>Eliminar</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[95vw] max-w-[600px] max-h-[90vh] rounded-xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">{editando ? "Editar empleado" : "Nuevo empleado"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="nombre" className="text-sm font-medium">Nombre</Label>
              <Input id="nombre" placeholder="Nombre y apellido" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} className="mt-1" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="valorDia" className="text-sm font-medium">Valor día</Label>
                <Input id="valorDia" type="number" min={0} placeholder="0" value={form.valorDia} onChange={(e) => setForm({ ...form, valorDia: e.target.value })} className="mt-1" />
              </div>
              <div>
                <Label htmlFor="valorExtra" className="text-sm font-medium">Valor extra</Label>
                <Input id="valorExtra" type="number" min={0} placeholder="0" value={form.valorExtra} onChange={(e) => setForm({ ...form, valorExtra: e.target.value })} className="mt-1" />
              </div>
            </div>
            <div>
              <Label htmlFor="sector" className="text-sm font-medium">Sector</Label>
              <Input id="sector" placeholder="Ej: Aserrado, Carga, Entregas" value={form.sector} onChange={(e) => setForm({ ...form, sector: e.target.value })} className="mt-1" />
            </div>
            <div className="flex items-center justify-between rounded-md border bg-default-50 py-2 px-3">
              <div className="flex flex-col">
                <Label htmlFor="activo" className="text-sm font-medium">Activo</Label>
                <span className="text-xs text-muted-foreground">Habilitar para que aparezca en listados de asistencia</span>
              </div>
              <Switch id="activo" checked={form.activo} onCheckedChange={(v) => setForm({ ...form, activo: v })} />
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={guardar} disabled={!form.nombre}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
