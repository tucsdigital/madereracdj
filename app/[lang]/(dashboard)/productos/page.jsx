"use client";
import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Boxes, Plus, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { db } from "@/lib/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";

const categorias = [
  "Maderas",
  "Fijaciones",
  "Herrajes",
  "Adhesivos",
  "Herramientas"
];

// Esquemas de validación por categoría
const baseSchema = {
  id: yup.string().required("El código es obligatorio"),
  nombre: yup.string().required("El nombre es obligatorio"),
  descripcion: yup.string().required("La descripción es obligatoria"),
  categoria: yup.string().required("La categoría es obligatoria"),
  subcategoria: yup.string().required("La subcategoría es obligatoria"),
  estado: yup.string().oneOf(["Activo", "Inactivo", "Descontinuado"]).required(),
};
const maderasSchema = yup.object().shape({
  ...baseSchema,
  tipoMadera: yup.string().required("Tipo de madera obligatorio"),
  tratamiento: yup.string().required("Tratamiento obligatorio"),
  largo: yup.number().positive().required("Largo obligatorio"),
  ancho: yup.number().positive().required("Ancho obligatorio"),
  espesor: yup.number().positive().required("Espesor obligatorio"),
  unidadMedida: yup.string().required("Unidad de medida obligatoria"),
  precioUnidad: yup.number().positive().required("Precio obligatorio"),
  stock: yup.number().integer().min(0).required("Stock obligatorio"),
  ubicacion: yup.string().required("Ubicación obligatoria"),
  dimensionesEspeciales: yup.boolean(),
});
const fijacionesSchema = yup.object().shape({
  ...baseSchema,
  tipoFijacion: yup.string().required("Tipo de fijación obligatorio"),
  material: yup.string().required("Material obligatorio"),
  largoFijacion: yup.number().positive().required("Largo obligatorio"),
  diametro: yup.number().positive().required("Diámetro obligatorio"),
  tipoCabeza: yup.string().required("Tipo de cabeza obligatorio"),
  tipoRosca: yup.string().required("Tipo de rosca obligatorio"),
  acabado: yup.string().required("Acabado obligatorio"),
  unidadVenta: yup.string().required("Unidad de venta obligatoria"),
  contenidoUnidad: yup.number().positive().required("Contenido por unidad obligatorio"),
  precioUnidadVenta: yup.number().positive().required("Precio obligatorio"),
  stockFijacion: yup.number().integer().min(0).required("Stock obligatorio"),
  ubicacionFijacion: yup.string().required("Ubicación obligatoria"),
});
const herrajesSchema = yup.object().shape({
  ...baseSchema,
  tipoHerraje: yup.string().required("Tipo de herraje obligatorio"),
  materialHerraje: yup.string().required("Material obligatorio"),
  funcion: yup.string().required("Función obligatoria"),
  medidaClave: yup.string().required("Medida obligatoria"),
  acabadoHerraje: yup.string().required("Acabado obligatorio"),
  capacidad: yup.string(),
  unidadVentaHerraje: yup.string().required("Unidad de venta obligatoria"),
  contenidoUnidadHerraje: yup.number().positive().required("Contenido por unidad obligatorio"),
  precioUnidadHerraje: yup.number().positive().required("Precio obligatorio"),
  stockHerraje: yup.number().integer().min(0).required("Stock obligatorio"),
  ubicacionHerraje: yup.string().required("Ubicación obligatoria"),
});
const adhesivosSchema = yup.object().shape({
  ...baseSchema,
  tipoQuimico: yup.string().required("Tipo de producto obligatorio"),
  funcionQuimico: yup.string().required("Función obligatoria"),
  marca: yup.string().required("Marca obligatoria"),
  contenidoNeto: yup.string().required("Contenido neto obligatorio"),
  unidadVentaQuimico: yup.string().required("Unidad de venta obligatoria"),
  precioUnidadQuimico: yup.number().positive().required("Precio obligatorio"),
  stockQuimico: yup.number().integer().min(0).required("Stock obligatorio"),
  ubicacionQuimico: yup.string().required("Ubicación obligatoria"),
});
const herramientasSchema = yup.object().shape({
  ...baseSchema,
  tipoHerramienta: yup.string().required("Tipo de herramienta obligatorio"),
  uso: yup.string().required("Uso específico obligatorio"),
  materialHerramienta: yup.string(),
  marcaHerramienta: yup.string(),
  medidaHerramienta: yup.string(),
  unidadVentaHerramienta: yup.string().required("Unidad de venta obligatoria"),
  contenidoUnidadHerramienta: yup.number().positive().required("Contenido por unidad obligatorio"),
  precioUnidadHerramienta: yup.number().positive().required("Precio obligatorio"),
  stockHerramienta: yup.number().integer().min(0).required("Stock obligatorio"),
  ubicacionHerramienta: yup.string().required("Ubicación obligatoria"),
});
const esquemasPorCategoria = {
  Maderas: maderasSchema,
  Fijaciones: fijacionesSchema,
  Herrajes: herrajesSchema,
  Adhesivos: adhesivosSchema,
  Herramientas: herramientasSchema,
};

function FormularioProducto({ onClose, onSuccess }) {
  const [categoria, setCategoria] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState(null); // 'success' | 'error' | null
  const [submitMessage, setSubmitMessage] = useState("");
  const schema = esquemasPorCategoria[categoria] || yup.object().shape(baseSchema);
  const { register, handleSubmit, formState: { errors }, reset, setValue } = useForm({
    resolver: yupResolver(schema),
    defaultValues: { estado: "Activo" }
  });

  const onSubmit = async (data) => {
    setIsSubmitting(true);
    setSubmitStatus(null);
    setSubmitMessage("");
    try {
      await addDoc(collection(db, "productos"), {
        ...data,
        fechaCreacion: new Date().toISOString(),
        fechaActualizacion: new Date().toISOString(),
      });
      setSubmitStatus("success");
      setSubmitMessage("Producto guardado exitosamente");
      reset();
      setTimeout(() => {
        onSuccess && onSuccess();
        onClose();
      }, 1200);
    } catch (e) {
      setSubmitStatus("error");
      setSubmitMessage("Error al guardar: " + e.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3 py-2">
      {/* Feedback de guardado */}
      {submitStatus && (
        <div className={`mb-2 p-2 rounded flex items-center gap-2 text-sm ${
          submitStatus === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
        }`}>
          {submitStatus === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {submitMessage}
        </div>
      )}
      <Input {...register("id")} placeholder="Código de producto" disabled={isSubmitting} />
      {errors.id && <span className="text-red-500 text-xs">{errors.id.message}</span>}
      <Input {...register("nombre")} placeholder="Nombre" disabled={isSubmitting} />
      {errors.nombre && <span className="text-red-500 text-xs">{errors.nombre.message}</span>}
      <Input {...register("descripcion")} placeholder="Descripción" disabled={isSubmitting} />
      {errors.descripcion && <span className="text-red-500 text-xs">{errors.descripcion.message}</span>}
      <select {...register("categoria")} value={categoria} onChange={e => { setCategoria(e.target.value); setValue('categoria', e.target.value); }} className="border rounded px-2 py-2" disabled={isSubmitting}>
        <option value="">Seleccionar categoría</option>
        {categorias.map(c => <option key={c}>{c}</option>)}
      </select>
      {errors.categoria && <span className="text-red-500 text-xs">{errors.categoria.message}</span>}
      <Input {...register("subcategoria")} placeholder="Subcategoría" disabled={isSubmitting} />
      {errors.subcategoria && <span className="text-red-500 text-xs">{errors.subcategoria.message}</span>}
      <select {...register("estado")} className="border rounded px-2 py-2" disabled={isSubmitting}>
        <option value="Activo">Activo</option>
        <option value="Inactivo">Inactivo</option>
        <option value="Descontinuado">Descontinuado</option>
      </select>
      {errors.estado && <span className="text-red-500 text-xs">{errors.estado.message}</span>}
      {/* Campos dinámicos por categoría */}
      {categoria === "Maderas" && (
        <>
          <Input {...register("tipoMadera")} placeholder="Tipo de madera" disabled={isSubmitting} />
          <Input {...register("tratamiento")} placeholder="Tratamiento/Acabado" disabled={isSubmitting} />
          <Input {...register("largo")} type="number" step="0.01" placeholder="Largo (m)" disabled={isSubmitting} />
          <Input {...register("ancho")} type="number" step="0.01" placeholder="Ancho (cm)" disabled={isSubmitting} />
          <Input {...register("espesor")} type="number" step="0.01" placeholder="Espesor (cm)" disabled={isSubmitting} />
          <Input {...register("unidadMedida")} placeholder="Unidad de medida de venta" disabled={isSubmitting} />
          <Input {...register("precioUnidad")} type="number" step="0.01" placeholder="Precio por unidad de medida" disabled={isSubmitting} />
          <Input {...register("stock")} type="number" placeholder="Stock actual" disabled={isSubmitting} />
          <Input {...register("ubicacion")} placeholder="Ubicación en depósito" disabled={isSubmitting} />
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" {...register("dimensionesEspeciales")} disabled={isSubmitting} />Dimensiones especiales</label>
        </>
      )}
      {categoria === "Fijaciones" && (
        <>
          <Input {...register("tipoFijacion")} placeholder="Tipo de fijación" disabled={isSubmitting} />
          <Input {...register("material")} placeholder="Material" disabled={isSubmitting} />
          <Input {...register("largoFijacion")} type="number" step="0.01" placeholder="Largo (mm o pulgadas)" disabled={isSubmitting} />
          <Input {...register("diametro")} type="number" step="0.01" placeholder="Diámetro/Calibre (mm)" disabled={isSubmitting} />
          <Input {...register("tipoCabeza")} placeholder="Tipo de cabeza" disabled={isSubmitting} />
          <Input {...register("tipoRosca")} placeholder="Tipo de rosca" disabled={isSubmitting} />
          <Input {...register("acabado")} placeholder="Acabado" disabled={isSubmitting} />
          <Input {...register("unidadVenta")} placeholder="Unidad de venta" disabled={isSubmitting} />
          <Input {...register("contenidoUnidad")} type="number" placeholder="Contenido por unidad de venta" disabled={isSubmitting} />
          <Input {...register("precioUnidadVenta")} type="number" step="0.01" placeholder="Precio por unidad de venta" disabled={isSubmitting} />
          <Input {...register("stockFijacion")} type="number" placeholder="Stock actual" disabled={isSubmitting} />
          <Input {...register("ubicacionFijacion")} placeholder="Ubicación en depósito" disabled={isSubmitting} />
        </>
      )}
      {categoria === "Herrajes" && (
        <>
          <Input {...register("tipoHerraje")} placeholder="Tipo de herraje" disabled={isSubmitting} />
          <Input {...register("materialHerraje")} placeholder="Material" disabled={isSubmitting} />
          <Input {...register("funcion")} placeholder="Función/Uso específico" disabled={isSubmitting} />
          <Input {...register("medidaClave")} placeholder="Medida/Dimensión clave" disabled={isSubmitting} />
          <Input {...register("acabadoHerraje")} placeholder="Acabado/Color" disabled={isSubmitting} />
          <Input {...register("capacidad")} placeholder="Capacidad/Resistencia (opcional)" disabled={isSubmitting} />
          <Input {...register("unidadVentaHerraje")} placeholder="Unidad de venta" disabled={isSubmitting} />
          <Input {...register("contenidoUnidadHerraje")} type="number" placeholder="Contenido por unidad de venta" disabled={isSubmitting} />
          <Input {...register("precioUnidadHerraje")} type="number" step="0.01" placeholder="Precio por unidad de venta" disabled={isSubmitting} />
          <Input {...register("stockHerraje")} type="number" placeholder="Stock actual" disabled={isSubmitting} />
          <Input {...register("ubicacionHerraje")} placeholder="Ubicación en depósito" disabled={isSubmitting} />
        </>
      )}
      {categoria === "Adhesivos" && (
        <>
          <Input {...register("tipoQuimico")} placeholder="Tipo de producto" disabled={isSubmitting} />
          <Input {...register("funcionQuimico")} placeholder="Función/Uso" disabled={isSubmitting} />
          <Input {...register("marca")} placeholder="Marca" disabled={isSubmitting} />
          <Input {...register("contenidoNeto")} placeholder="Contenido neto/volumen" disabled={isSubmitting} />
          <Input {...register("unidadVentaQuimico")} placeholder="Unidad de venta" disabled={isSubmitting} />
          <Input {...register("precioUnidadQuimico")} type="number" step="0.01" placeholder="Precio por unidad de venta" disabled={isSubmitting} />
          <Input {...register("stockQuimico")} type="number" placeholder="Stock actual" disabled={isSubmitting} />
          <Input {...register("ubicacionQuimico")} placeholder="Ubicación en depósito" disabled={isSubmitting} />
        </>
      )}
      {categoria === "Herramientas" && (
        <>
          <Input {...register("tipoHerramienta")} placeholder="Tipo de herramienta/accesorio" disabled={isSubmitting} />
          <Input {...register("uso")} placeholder="Uso específico" disabled={isSubmitting} />
          <Input {...register("materialHerramienta")} placeholder="Material (opcional)" disabled={isSubmitting} />
          <Input {...register("marcaHerramienta")} placeholder="Marca (opcional)" disabled={isSubmitting} />
          <Input {...register("medidaHerramienta")} placeholder="Medida/Dimensión (opcional)" disabled={isSubmitting} />
          <Input {...register("unidadVentaHerramienta")} placeholder="Unidad de venta" disabled={isSubmitting} />
          <Input {...register("contenidoUnidadHerramienta")} type="number" placeholder="Contenido por unidad de venta" disabled={isSubmitting} />
          <Input {...register("precioUnidadHerramienta")} type="number" step="0.01" placeholder="Precio por unidad de venta" disabled={isSubmitting} />
          <Input {...register("stockHerramienta")} type="number" placeholder="Stock actual" disabled={isSubmitting} />
          <Input {...register("ubicacionHerramienta")} placeholder="Ubicación en depósito" disabled={isSubmitting} />
        </>
      )}
      <DialogFooter>
        <Button variant="outline" type="button" onClick={onClose} disabled={isSubmitting}>Cancelar</Button>
        <Button variant="default" type="submit" disabled={isSubmitting}>
          {isSubmitting ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />Guardando...</>) : "Guardar"}
        </Button>
      </DialogFooter>
    </form>
  );
}

const productos = [];

const ProductosPage = () => {
  const [open, setOpen] = useState(false);
  const [filtro, setFiltro] = useState("");
  const [cat, setCat] = useState("");
  const [reload, setReload] = useState(false);
  return (
    <div className="py-8 px-2 max-w-5xl mx-auto">
      <div className="mb-8 flex items-center gap-4">
        <Boxes className="w-10 h-10 text-primary" />
        <div>
          <h1 className="text-3xl font-bold mb-1">Productos</h1>
          <p className="text-lg text-gray-500">Catálogo y stock de productos madereros.</p>
        </div>
      </div>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle>Listado de Productos</CardTitle>
          <div className="flex gap-2">
            <select value={cat} onChange={e => setCat(e.target.value)} className="border rounded px-2 py-2">
              <option value="">Todas las categorías</option>
              {categorias.map(c => <option key={c}>{c}</option>)}
            </select>
            <Input placeholder="Buscar producto..." value={filtro} onChange={e => setFiltro(e.target.value)} className="w-48" />
            <Button variant="default" onClick={() => setOpen(true)}><Plus className="w-4 h-4 mr-1" />Agregar Producto</Button>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead>Stock</TableHead>
                <TableHead>Unidad</TableHead>
                <TableHead>Precio</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {productos.filter(p => (cat ? p.categoria === cat : true) && p.nombre.toLowerCase().includes(filtro.toLowerCase())).map(p => (
                <TableRow key={p.id}>
                  <TableCell>{p.nombre}</TableCell>
                  <TableCell>{p.categoria}</TableCell>
                  <TableCell>{p.stock || p.stockFijacion || p.stockHerraje || p.stockQuimico || p.stockHerramienta}</TableCell>
                  <TableCell>{p.unidadMedida || p.unidadVenta || p.unidadVentaHerraje || p.unidadVentaQuimico || p.unidadVentaHerramienta}</TableCell>
                  <TableCell>${p.precioUnidad || p.precioUnidadVenta || p.precioUnidadHerraje || p.precioUnidadQuimico || p.precioUnidadHerramienta}</TableCell>
                  <TableCell>{p.estado}</TableCell>
                  <TableCell>
                    <Button size="sm" variant="outline">Ver</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[95vw] max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Agregar Producto</DialogTitle>
          </DialogHeader>
          <FormularioProducto onClose={() => setOpen(false)} onSuccess={() => setReload(r => !r)} />
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProductosPage; 