"use client";
import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Hammer, Plus } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";
import { db } from "@/lib/firebase";
import { collection, getDocs, addDoc, doc, updateDoc, increment } from "firebase/firestore";
import { Upload } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { useEffect } from "react";

// Helper para modelo de obra
const obraBase = {
  id: "",
  nombre: "",
  cliente: { nombre: "", contacto: "", telefono: "", email: "" },
  fechaInicioEstimada: "",
  fechaFinEstimada: "",
  fechaInicioReal: "",
  fechaFinReal: "",
  direccion: { calle: "", numero: "", localidad: "", provincia: "" },
  descripcion: "",
  estado: "En Presupuesto",
  responsable: "",
  notas: "",
  presupuesto: { items: [], subtotalMateriales: 0, subtotalManoObra: 0, subtotalOtrosCostos: 0, costosIndirectos: 0, totalPresupuestado: 0 },
  materialesConsumidos: [],
  tareas: [],
  facturacion: [],
  documentos: []
};

const estadosObra = ["En Presupuesto", "Pendiente de Inicio", "En Ejecución", "Pausada", "Finalizada", "Cancelada"];

function DatosGeneralesObra({ obra, onChange }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>
        <label className="font-semibold">ID/Código de Obra</label>
        <Input value={obra.id} onChange={e => onChange({ ...obra, id: e.target.value })} />
      </div>
      <div>
        <label className="font-semibold">Nombre de la Obra</label>
        <Input value={obra.nombre} onChange={e => onChange({ ...obra, nombre: e.target.value })} />
      </div>
      <div>
        <label className="font-semibold">Cliente</label>
        <Input value={obra.cliente.nombre} onChange={e => onChange({ ...obra, cliente: { ...obra.cliente, nombre: e.target.value } })} />
      </div>
      <div>
        <label className="font-semibold">Contacto</label>
        <Input value={obra.cliente.contacto} onChange={e => onChange({ ...obra, cliente: { ...obra.cliente, contacto: e.target.value } })} />
      </div>
      <div>
        <label className="font-semibold">Teléfono</label>
        <Input value={obra.cliente.telefono} onChange={e => onChange({ ...obra, cliente: { ...obra.cliente, telefono: e.target.value } })} />
      </div>
      <div>
        <label className="font-semibold">Email</label>
        <Input value={obra.cliente.email} onChange={e => onChange({ ...obra, cliente: { ...obra.cliente, email: e.target.value } })} />
      </div>
      <div>
        <label className="font-semibold">Fecha de Inicio Estimada</label>
        <Input type="date" value={obra.fechaInicioEstimada} onChange={e => onChange({ ...obra, fechaInicioEstimada: e.target.value })} />
      </div>
      <div>
        <label className="font-semibold">Fecha de Fin Estimada</label>
        <Input type="date" value={obra.fechaFinEstimada} onChange={e => onChange({ ...obra, fechaFinEstimada: e.target.value })} />
      </div>
      <div>
        <label className="font-semibold">Dirección</label>
        <Input value={obra.direccion.calle} onChange={e => onChange({ ...obra, direccion: { ...obra.direccion, calle: e.target.value } })} placeholder="Calle" />
        <Input value={obra.direccion.numero} onChange={e => onChange({ ...obra, direccion: { ...obra.direccion, numero: e.target.value } })} placeholder="Número" />
        <Input value={obra.direccion.localidad} onChange={e => onChange({ ...obra, direccion: { ...obra.direccion, localidad: e.target.value } })} placeholder="Localidad" />
        <Input value={obra.direccion.provincia} onChange={e => onChange({ ...obra, direccion: { ...obra.direccion, provincia: e.target.value } })} placeholder="Provincia" />
      </div>
      <div>
        <label className="font-semibold">Descripción</label>
        <Textarea value={obra.descripcion} onChange={e => onChange({ ...obra, descripcion: e.target.value })} />
      </div>
      <div>
        <label className="font-semibold">Estado</label>
        <select value={obra.estado} onChange={e => onChange({ ...obra, estado: e.target.value })} className="border rounded px-2 py-2 w-full">
          {estadosObra.map(e => <option key={e}>{e}</option>)}
        </select>
      </div>
      <div>
        <label className="font-semibold">Responsable/Jefe de Obra</label>
        <Input value={obra.responsable} onChange={e => onChange({ ...obra, responsable: e.target.value })} />
      </div>
      <div className="md:col-span-2">
        <label className="font-semibold">Notas Adicionales</label>
        <Textarea value={obra.notas} onChange={e => onChange({ ...obra, notas: e.target.value })} />
      </div>
    </div>
  );
}

function PresupuestoObra({ obra, onChange }) {
  const [productos, setProductos] = useState([]);
  const [nuevoItem, setNuevoItem] = useState({ nombre: "", materiales: [], manoObra: [], otrosCostos: [] });
  const [material, setMaterial] = useState({ productoId: "", cantidad: 1 });

  // Cargar productos reales de Firebase
  useEffect(() => {
    const fetchProductos = async () => {
      const snap = await getDocs(collection(db, "productos"));
      setProductos(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    };
    fetchProductos();
  }, []);

  // Agregar material al nuevo ítem
  const handleAgregarMaterial = () => {
    if (!material.productoId || material.cantidad <= 0) return;
    const prod = productos.find(p => p.id === material.productoId);
    if (!prod) return;
    setNuevoItem(item => ({
      ...item,
      materiales: [
        ...item.materiales,
        {
          productoId: prod.id,
          nombre: prod.nombre,
          cantidad: material.cantidad,
          unidad: prod.unidadMedida || prod.unidadVenta || prod.unidadVentaHerraje || prod.unidadVentaQuimico || prod.unidadVentaHerramienta,
          costoUnitario: prod.costo || prod.precioUnidad || prod.precioUnidadVenta || prod.precioUnidadHerraje || prod.precioUnidadQuimico || prod.precioUnidadHerramienta,
          costoTotal: (prod.costo || prod.precioUnidad || prod.precioUnidadVenta || prod.precioUnidadHerraje || prod.precioUnidadQuimico || prod.precioUnidadHerramienta) * material.cantidad
        }
      ]
    }));
    setMaterial({ productoId: "", cantidad: 1 });
  };

  // Agregar ítem al presupuesto
  const handleAgregarItem = () => {
    if (!nuevoItem.nombre || nuevoItem.materiales.length === 0) return;
    const items = [...(obra.presupuesto.items || []), nuevoItem];
    // Calcular subtotales
    const subtotalMateriales = items.reduce((acc, item) => acc + item.materiales.reduce((a, m) => a + m.costoTotal, 0), 0);
    const subtotalManoObra = items.reduce((acc, item) => acc + (item.manoObra?.reduce((a, m) => a + (m.costoTotal || 0), 0) || 0), 0);
    const subtotalOtrosCostos = items.reduce((acc, item) => acc + (item.otrosCostos?.reduce((a, o) => a + (o.monto || 0), 0) || 0), 0);
    const costosIndirectos = obra.presupuesto.costosIndirectos || 0;
    const totalPresupuestado = subtotalMateriales + subtotalManoObra + subtotalOtrosCostos + costosIndirectos;
    onChange({
      ...obra,
      presupuesto: {
        ...obra.presupuesto,
        items,
        subtotalMateriales,
        subtotalManoObra,
        subtotalOtrosCostos,
        costosIndirectos,
        totalPresupuestado
      }
    });
    setNuevoItem({ nombre: "", materiales: [], manoObra: [], otrosCostos: [] });
  };

  return (
    <div>
      <h2 className="text-xl font-bold mb-2">Agregar Ítem de Presupuesto</h2>
      <div className="mb-4 grid grid-cols-1 md:grid-cols-2 gap-2">
        <Input placeholder="Nombre del ítem" value={nuevoItem.nombre} onChange={e => setNuevoItem(i => ({ ...i, nombre: e.target.value }))} />
        <div className="flex gap-2">
          <select value={material.productoId} onChange={e => setMaterial(m => ({ ...m, productoId: e.target.value }))} className="border rounded px-2 py-2">
            <option value="">Producto...</option>
            {productos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
          <Input type="number" min={1} value={material.cantidad} onChange={e => setMaterial(m => ({ ...m, cantidad: Number(e.target.value) }))} className="w-24" />
          <Button onClick={handleAgregarMaterial} type="button">Agregar Material</Button>
        </div>
        <div className="col-span-2">
          <ul className="list-disc ml-6 text-sm">
            {nuevoItem.materiales.map((m, idx) => (
              <li key={idx}>{m.nombre} - {m.cantidad} {m.unidad} x ${m.costoUnitario} = <span className="font-semibold">${m.costoTotal}</span></li>
            ))}
          </ul>
        </div>
        <Button onClick={handleAgregarItem} type="button" className="col-span-2">Agregar Ítem</Button>
      </div>
      <h2 className="text-xl font-bold mb-2">Presupuesto</h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Ítem</TableHead>
            <TableHead>Materiales</TableHead>
            <TableHead>Subtotal</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {obra.presupuesto.items.map((item, idx) => (
            <TableRow key={idx}>
              <TableCell>{item.nombre}</TableCell>
              <TableCell>
                <ul className="list-disc ml-4">
                  {item.materiales.map((m, i) => (
                    <li key={i}>{m.nombre} - {m.cantidad} {m.unidad} x ${m.costoUnitario} = ${m.costoTotal}</li>
                  ))}
                </ul>
              </TableCell>
              <TableCell>${item.materiales.reduce((a, m) => a + m.costoTotal, 0)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="mt-4 flex flex-col items-end gap-2">
        <div>Subtotal Materiales: <span className="font-semibold">${obra.presupuesto.subtotalMateriales}</span></div>
        <div>Subtotal Mano de Obra: <span className="font-semibold">${obra.presupuesto.subtotalManoObra}</span></div>
        <div>Subtotal Otros Costos: <span className="font-semibold">${obra.presupuesto.subtotalOtrosCostos}</span></div>
        <div>Costos Indirectos: <Input type="number" min={0} value={obra.presupuesto.costosIndirectos} onChange={e => onChange({ ...obra, presupuesto: { ...obra.presupuesto, costosIndirectos: Number(e.target.value) } })} className="w-32 inline-block ml-2" /></div>
        <div className="text-lg font-bold">Total Presupuestado: <span className="text-primary">${obra.presupuesto.totalPresupuestado}</span></div>
      </div>
    </div>
  );
}

function MaterialesObra({ obra, onChange }) {
  const [productos, setProductos] = useState([]);
  const [consumo, setConsumo] = useState({ productoId: '', cantidad: 1, fecha: '', responsable: '', notas: '' });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchProductos = async () => {
      const snap = await getDocs(collection(db, "productos"));
      setProductos(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    };
    fetchProductos();
  }, []);

  const handleRegistrarConsumo = async () => {
    if (!consumo.productoId || consumo.cantidad <= 0 || !consumo.fecha) return;
    setLoading(true);
    try {
      // Descontar stock en Firebase
      const productoRef = doc(db, "productos", consumo.productoId);
      await updateDoc(productoRef, { stock: increment(-Math.abs(consumo.cantidad)) });
      // Agregar a materialesConsumidos
      const prod = productos.find(p => p.id === consumo.productoId);
      const nuevoConsumo = {
        ...consumo,
        nombre: prod?.nombre || '',
        unidad: prod?.unidadMedida || prod?.unidadVenta || prod?.unidadVentaHerraje || prod?.unidadVentaQuimico || prod?.unidadVentaHerramienta || '',
        obraId: obra.id
      };
      onChange({
        ...obra,
        materialesConsumidos: [...(obra.materialesConsumidos || []), nuevoConsumo]
      });
      setConsumo({ productoId: '', cantidad: 1, fecha: '', responsable: '', notas: '' });
    } catch (e) {
      alert('Error al descontar stock: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2 className="text-xl font-bold mb-2">Registrar Consumo de Material</h2>
      <div className="grid grid-cols-1 md:grid-cols-5 gap-2 mb-4">
        <select value={consumo.productoId} onChange={e => setConsumo(c => ({ ...c, productoId: e.target.value }))} className="border rounded px-2 py-2">
          <option value="">Producto...</option>
          {productos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
        <Input type="number" min={1} value={consumo.cantidad} onChange={e => setConsumo(c => ({ ...c, cantidad: Number(e.target.value) }))} placeholder="Cantidad" />
        <Input type="date" value={consumo.fecha} onChange={e => setConsumo(c => ({ ...c, fecha: e.target.value }))} />
        <Input value={consumo.responsable} onChange={e => setConsumo(c => ({ ...c, responsable: e.target.value }))} placeholder="Responsable" />
        <Input value={consumo.notas} onChange={e => setConsumo(c => ({ ...c, notas: e.target.value }))} placeholder="Notas" />
        <Button onClick={handleRegistrarConsumo} disabled={loading} type="button">Registrar</Button>
      </div>
      <h2 className="text-xl font-bold mb-2">Historial de Consumos</h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Fecha</TableHead>
            <TableHead>Producto</TableHead>
            <TableHead>Cantidad</TableHead>
            <TableHead>Unidad</TableHead>
            <TableHead>Responsable</TableHead>
            <TableHead>Notas</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(obra.materialesConsumidos || []).map((c, idx) => (
            <TableRow key={idx}>
              <TableCell>{c.fecha}</TableCell>
              <TableCell>{c.nombre}</TableCell>
              <TableCell>{c.cantidad}</TableCell>
              <TableCell>{c.unidad}</TableCell>
              <TableCell>{c.responsable}</TableCell>
              <TableCell>{c.notas}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function TareasObra({ obra, onChange }) {
  const [nuevaTarea, setNuevaTarea] = useState({
    nombre: '', responsable: '', fechaInicioPlaneada: '', fechaFinPlaneada: '', fechaInicioReal: '', fechaFinReal: '', estado: 'Pendiente', avance: 0, comentarios: ''
  });
  const estadosTarea = ['Pendiente', 'En Proceso', 'Completa', 'Pausada'];

  const handleAgregarTarea = () => {
    if (!nuevaTarea.nombre) return;
    onChange({
      ...obra,
      tareas: [...(obra.tareas || []), nuevaTarea]
    });
    setNuevaTarea({ nombre: '', responsable: '', fechaInicioPlaneada: '', fechaFinPlaneada: '', fechaInicioReal: '', fechaFinReal: '', estado: 'Pendiente', avance: 0, comentarios: '' });
  };

  const handleActualizarTarea = (idx, campo, valor) => {
    const tareas = obra.tareas.map((t, i) => i === idx ? { ...t, [campo]: valor } : t);
    onChange({ ...obra, tareas });
  };

  return (
    <div>
      <h2 className="text-xl font-bold mb-2">Agregar Tarea</h2>
      <div className="grid grid-cols-1 md:grid-cols-6 gap-2 mb-4">
        <Input placeholder="Tarea" value={nuevaTarea.nombre} onChange={e => setNuevaTarea(t => ({ ...t, nombre: e.target.value }))} />
        <Input placeholder="Responsable" value={nuevaTarea.responsable} onChange={e => setNuevaTarea(t => ({ ...t, responsable: e.target.value }))} />
        <Input type="date" placeholder="Inicio Planeado" value={nuevaTarea.fechaInicioPlaneada} onChange={e => setNuevaTarea(t => ({ ...t, fechaInicioPlaneada: e.target.value }))} />
        <Input type="date" placeholder="Fin Planeado" value={nuevaTarea.fechaFinPlaneada} onChange={e => setNuevaTarea(t => ({ ...t, fechaFinPlaneada: e.target.value }))} />
        <select value={nuevaTarea.estado} onChange={e => setNuevaTarea(t => ({ ...t, estado: e.target.value }))} className="border rounded px-2 py-2">
          {estadosTarea.map(e => <option key={e}>{e}</option>)}
        </select>
        <Button onClick={handleAgregarTarea} type="button">Agregar</Button>
      </div>
      <h2 className="text-xl font-bold mb-2">Tareas</h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tarea</TableHead>
            <TableHead>Responsable</TableHead>
            <TableHead>Inicio Planeado</TableHead>
            <TableHead>Fin Planeado</TableHead>
            <TableHead>Inicio Real</TableHead>
            <TableHead>Fin Real</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Avance (%)</TableHead>
            <TableHead>Comentarios</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(obra.tareas || []).map((t, idx) => (
            <TableRow key={idx}>
              <TableCell>{t.nombre}</TableCell>
              <TableCell><Input value={t.responsable} onChange={e => handleActualizarTarea(idx, 'responsable', e.target.value)} className="w-28" /></TableCell>
              <TableCell><Input type="date" value={t.fechaInicioPlaneada} onChange={e => handleActualizarTarea(idx, 'fechaInicioPlaneada', e.target.value)} className="w-32" /></TableCell>
              <TableCell><Input type="date" value={t.fechaFinPlaneada} onChange={e => handleActualizarTarea(idx, 'fechaFinPlaneada', e.target.value)} className="w-32" /></TableCell>
              <TableCell><Input type="date" value={t.fechaInicioReal} onChange={e => handleActualizarTarea(idx, 'fechaInicioReal', e.target.value)} className="w-32" /></TableCell>
              <TableCell><Input type="date" value={t.fechaFinReal} onChange={e => handleActualizarTarea(idx, 'fechaFinReal', e.target.value)} className="w-32" /></TableCell>
              <TableCell>
                <select value={t.estado} onChange={e => handleActualizarTarea(idx, 'estado', e.target.value)} className="border rounded px-2 py-2">
                  {estadosTarea.map(e => <option key={e}>{e}</option>)}
                </select>
              </TableCell>
              <TableCell><Input type="number" min={0} max={100} value={t.avance} onChange={e => handleActualizarTarea(idx, 'avance', e.target.value)} className="w-20" /></TableCell>
              <TableCell><Textarea value={t.comentarios} onChange={e => handleActualizarTarea(idx, 'comentarios', e.target.value)} className="w-40" /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ... (componentes FacturacionObra, DocumentosObra irán aquí)

const ObrasProyectosPage = () => {
  const [obra, setObra] = useState(obraBase);
  const [tab, setTab] = useState("generales");

  return (
    <div className="py-8 px-2 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-4">Gestión de Obras / Proyectos</h1>
      <Tabs value={tab} onValueChange={setTab} className="mb-6">
        <TabsList className="mb-4">
          <TabsTrigger value="generales">Datos Generales</TabsTrigger>
          <TabsTrigger value="presupuesto">Presupuesto</TabsTrigger>
          <TabsTrigger value="materiales">Materiales</TabsTrigger>
          <TabsTrigger value="tareas">Tareas</TabsTrigger>
          <TabsTrigger value="facturacion">Facturación</TabsTrigger>
          <TabsTrigger value="documentos">Documentos</TabsTrigger>
        </TabsList>
        <TabsContent value="generales">
          <Card><CardContent className="pt-6"><DatosGeneralesObra obra={obra} onChange={setObra} /></CardContent></Card>
        </TabsContent>
        <TabsContent value="presupuesto">
          <Card><CardContent className="pt-6"><PresupuestoObra obra={obra} onChange={setObra} /></CardContent></Card>
        </TabsContent>
        <TabsContent value="materiales">
          <Card><CardContent className="pt-6"><MaterialesObra obra={obra} onChange={setObra} /></CardContent></Card>
        </TabsContent>
        <TabsContent value="tareas">
          <Card><CardContent className="pt-6"><TareasObra obra={obra} onChange={setObra} /></CardContent></Card>
        </TabsContent>
        <TabsContent value="facturacion">
          <Card><CardContent className="pt-6">FacturacionObra (en desarrollo)</CardContent></Card>
        </TabsContent>
        <TabsContent value="documentos">
          <Card><CardContent className="pt-6">DocumentosObra (en desarrollo)</CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ObrasProyectosPage; 