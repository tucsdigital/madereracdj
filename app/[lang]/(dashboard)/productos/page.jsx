"use client";
import React, { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Boxes,
  Plus,
  Loader2,
  CheckCircle,
  AlertCircle,
  Upload,
  FileSpreadsheet,
} from "lucide-react";
import { db } from "@/lib/firebase";
import {
  collection,
  addDoc,
  serverTimestamp,
  onSnapshot,
  query,
  orderBy,
  doc,
  updateDoc,
} from "firebase/firestore";
import { useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";

const categorias = ["Maderas", "Ferretería"];

// Función para formatear números en formato argentino
const formatearNumeroArgentino = (numero) => {
  if (numero === null || numero === undefined || isNaN(numero)) return "0";
  return Number(numero).toLocaleString("es-AR");
};

// Función para calcular precio de corte de madera
function calcularPrecioCorteMadera({
  alto,
  ancho,
  largo,
  precioPorPie,
  factor = 0.2734,
}) {
  if (
    [alto, ancho, largo, precioPorPie].some(
      (v) => typeof v !== "number" || v <= 0
    )
  ) {
    return 0;
  }
  const precio = factor * alto * ancho * largo * precioPorPie;
  // Redondear a centenas (múltiplos de 100)
  return Math.round(precio / 100) * 100;
}

// Esquemas de validación por categoría
const baseSchema = {
  codigo: yup.string().required("El código es obligatorio"),
  nombre: yup.string().required("El nombre es obligatorio"),
  descripcion: yup.string().required("La descripción es obligatoria"),
  categoria: yup.string().required("La categoría es obligatoria"),
  subcategoria: yup.string().required("La subcategoría es obligatoria"),
  estado: yup
    .string()
    .oneOf(["Activo", "Inactivo", "Descontinuado"])
    .required(),
  costo: yup.number().positive().required("El costo es obligatorio"),
};

// Esquema para Maderas
const maderasSchema = yup.object().shape({
  ...baseSchema,
  tipoMadera: yup.string().required("Tipo de madera obligatorio"),
  largo: yup.number().positive().required("Largo obligatorio"),
  ancho: yup.number().positive().required("Ancho obligatorio"),
  alto: yup.number().positive().required("Alto obligatorio"),
  unidadMedida: yup.string().required("Unidad de medida obligatoria"),
  precioPorPie: yup.number().positive().required("Valor del pie obligatorio"),
  ubicacion: yup.string().required("Ubicación obligatoria"),
});

// Esquema para Ferretería
const ferreteriaSchema = yup.object().shape({
  ...baseSchema,
  stockMinimo: yup.number().positive().required("Stock mínimo obligatorio"),
  unidadMedida: yup.string().required("Unidad de medida obligatoria"),
  valorCompra: yup.number().positive().required("Valor de compra obligatorio"),
  valorVenta: yup.number().positive().required("Valor de venta obligatorio"),
  proveedor: yup.string().required("Proveedor obligatorio"),
});

// Esquemas comentados para uso futuro
/*
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
  ubicacionHerramienta: yup.string().required("Ubicación obligatoria"),
});
*/

const esquemasPorCategoria = {
  Maderas: maderasSchema,
  Ferretería: ferreteriaSchema,
};

function FormularioProducto({ onClose, onSuccess }) {
  const [categoria, setCategoria] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState(null); // 'success' | 'error' | null
  const [submitMessage, setSubmitMessage] = useState("");
  const schema =
    esquemasPorCategoria[categoria] || yup.object().shape(baseSchema);
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
  } = useForm({
    resolver: yupResolver(schema),
    defaultValues: { estado: "Activo" },
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
      setCategoria("");
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
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col h-full">
      {/* Feedback de guardado */}
      {submitStatus && (
        <div
          className={`mb-2 p-2 rounded flex items-center gap-2 text-sm ${
            submitStatus === "success"
              ? "bg-green-50 text-green-800"
              : "bg-red-50 text-red-800"
          }`}
        >
          {submitStatus === "success" ? (
            <CheckCircle className="w-4 h-4" />
          ) : (
            <AlertCircle className="w-4 h-4" />
          )}
          {submitMessage}
        </div>
      )}
      {/* Selector de categoría SIEMPRE visible */}
      <div className="mb-2">
        <label className="font-semibold text-default-700">Categoría</label>
        <select
          {...register("categoria")}
          value={categoria}
          onChange={(e) => {
            setCategoria(e.target.value);
            setValue("categoria", e.target.value);
          }}
          className="border rounded px-2 py-2 w-full"
          disabled={isSubmitting}
        >
          <option value="">Seleccionar categoría</option>
          {categorias.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        {errors.categoria && (
          <span className="text-red-500 text-xs">
            {errors.categoria.message}
          </span>
        )}
      </div>
      {/* Solo mostrar el resto del formulario si hay categoría seleccionada */}
      {categoria && (
        <>
          <div
            className="overflow-y-auto flex-1 pr-1"
            style={{ maxHeight: "60vh" }}
          >
            {/* Sección: Datos generales */}
            <div className="mb-2">
              <div className="font-semibold text-primary mb-1">
                Datos generales
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Input
                    {...register("codigo")}
                    placeholder="Código de producto"
                    disabled={isSubmitting}
                  />
                  {errors.codigo && (
                    <span className="text-red-500 text-xs">
                      {errors.codigo.message}
                    </span>
                  )}
                </div>
                <div>
                  <Input
                    {...register("nombre")}
                    placeholder="Nombre"
                    disabled={isSubmitting}
                  />
                  {errors.nombre && (
                    <span className="text-red-500 text-xs">
                      {errors.nombre.message}
                    </span>
                  )}
                </div>
                <div className="md:col-span-2">
                  <Input
                    {...register("descripcion")}
                    placeholder="Descripción"
                    disabled={isSubmitting}
                  />
                  {errors.descripcion && (
                    <span className="text-red-500 text-xs">
                      {errors.descripcion.message}
                    </span>
                  )}
                </div>
                <div>
                  <Input
                    {...register("subcategoria")}
                    placeholder="Subcategoría"
                    disabled={isSubmitting}
                  />
                  {errors.subcategoria && (
                    <span className="text-red-500 text-xs">
                      {errors.subcategoria.message}
                    </span>
                  )}
                </div>
                <div>
                  <select
                    {...register("estado")}
                    className="border rounded px-2 py-2 w-full"
                    disabled={isSubmitting}
                  >
                    <option value="Activo">Activo</option>
                    <option value="Inactivo">Inactivo</option>
                    <option value="Descontinuado">Descontinuado</option>
                  </select>
                  {errors.estado && (
                    <span className="text-red-500 text-xs">
                      {errors.estado.message}
                    </span>
                  )}
                </div>
                <div>
                  <Input
                    {...register("costo")}
                    type="number"
                    step="0.01"
                    placeholder="Costo unitario"
                    disabled={isSubmitting}
                  />
                  {errors.costo && (
                    <span className="text-red-500 text-xs">
                      {errors.costo.message}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <hr className="my-2" />
            {/* Sección: Datos específicos */}
            <div className="mb-2">
              <div className="font-semibold text-primary mb-1">
                Datos específicos
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {categoria === "Maderas" && (
                  <>
                    <div>
                      <Input
                        {...register("tipoMadera")}
                        placeholder="Tipo de madera"
                        disabled={isSubmitting}
                      />
                    </div>
                    <div>
                      <Input
                        {...register("largo")}
                        type="number"
                        step="0.01"
                        placeholder="Largo (m)"
                        disabled={isSubmitting}
                      />
                    </div>
                    <div>
                      <Input
                        {...register("ancho")}
                        type="number"
                        step="0.01"
                        placeholder="Ancho (cm)"
                        disabled={isSubmitting}
                      />
                    </div>
                    <div>
                      <Input
                        {...register("alto")}
                        type="number"
                        step="0.01"
                        placeholder="Alto (cm)"
                        disabled={isSubmitting}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">
                        Unidad de medida de venta
                      </label>
                      <input
                        type="text"
                        value="pie"
                        readOnly
                        className="border rounded px-2 py-2 w-full bg-gray-100"
                        disabled={isSubmitting}
                      />
                      <input
                        type="hidden"
                        {...register("unidadMedida")}
                        value="pie"
                      />
                    </div>
                    <div>
                      <Input
                        {...register("precioPorPie")}
                        type="number"
                        step="0.01"
                        placeholder="Valor del pie"
                        disabled={isSubmitting}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <Input
                        {...register("ubicacion")}
                        placeholder="Ubicación en depósito"
                        disabled={isSubmitting}
                      />
                    </div>
                  </>
                )}
                {categoria === "Ferretería" && (
                  <>
                    <div>
                      <Input
                        {...register("stockMinimo")}
                        type="number"
                        step="1"
                        placeholder="Stock mínimo"
                        disabled={isSubmitting}
                      />
                    </div>
                    {errors.stockMinimo && (
                      <span className="text-red-500 text-xs">
                        {errors.stockMinimo.message}
                      </span>
                    )}
                    <div>
                      <label className="block text-xs font-medium mb-1">
                        Unidad de medida de venta
                      </label>
                      <select
                        {...register("unidadMedida")}
                        className="border rounded px-2 py-2 w-full"
                        disabled={isSubmitting}
                      >
                        <option value="">Seleccionar unidad</option>
                        <option value="kg">Kg</option>
                        <option value="cm">Cm</option>
                        <option value="l">Litro</option>
                        <option value="m">Metro</option>
                      </select>
                      {errors.unidadMedida && (
                        <span className="text-red-500 text-xs">
                          {errors.unidadMedida.message}
                        </span>
                      )}
                    </div>
                    {errors.unidadMedida && (
                      <span className="text-red-500 text-xs">
                        {errors.unidadMedida.message}
                      </span>
                    )}
                    <div>
                      <Input
                        {...register("valorCompra")}
                        type="number"
                        step="0.01"
                        placeholder="Valor de compra"
                        disabled={isSubmitting}
                      />
                    </div>
                    {errors.valorCompra && (
                      <span className="text-red-500 text-xs">
                        {errors.valorCompra.message}
                      </span>
                    )}
                    <div>
                      <Input
                        {...register("valorVenta")}
                        type="number"
                        step="0.01"
                        placeholder="Valor de venta"
                        disabled={isSubmitting}
                      />
                    </div>
                    {errors.valorVenta && (
                      <span className="text-red-500 text-xs">
                        {errors.valorVenta.message}
                      </span>
                    )}
                    <div>
                      <Input
                        {...register("proveedor")}
                        placeholder="Proveedor"
                        disabled={isSubmitting}
                      />
                    </div>
                    {errors.proveedor && (
                      <span className="text-red-500 text-xs">
                        {errors.proveedor.message}
                      </span>
                    )}
                  </>
                )}
                {/*
              {categoria === "Fijaciones" && (<>
                <div><Input {...register("tipoFijacion")} placeholder="Tipo de fijación" disabled={isSubmitting} /></div>
                <div><Input {...register("material")} placeholder="Material" disabled={isSubmitting} /></div>
                <div><Input {...register("largoFijacion")} type="number" step="0.01" placeholder="Largo (mm o pulgadas)" disabled={isSubmitting} /></div>
                <div><Input {...register("diametro")} type="number" step="0.01" placeholder="Diámetro/Calibre (mm)" disabled={isSubmitting} /></div>
                <div><Input {...register("tipoCabeza")} placeholder="Tipo de cabeza" disabled={isSubmitting} /></div>
                <div><Input {...register("tipoRosca")} placeholder="Tipo de rosca" disabled={isSubmitting} /></div>
                <div><Input {...register("acabado")} placeholder="Acabado" disabled={isSubmitting} /></div>
                <div><Input {...register("unidadVenta")} placeholder="Unidad de venta" disabled={isSubmitting} /></div>
                <div><Input {...register("contenidoUnidad")} type="number" placeholder="Contenido por unidad de venta" disabled={isSubmitting} /></div>
                <div><Input {...register("precioUnidadVenta")} type="number" step="0.01" placeholder="Precio por unidad de venta" disabled={isSubmitting} /></div>
                <div className="md:col-span-2"><Input {...register("ubicacionFijacion")} placeholder="Ubicación en depósito" disabled={isSubmitting} /></div>
              </>)}
              {categoria === "Herrajes" && (<>
                <div><Input {...register("tipoHerraje")} placeholder="Tipo de herraje" disabled={isSubmitting} /></div>
                <div><Input {...register("materialHerraje")} placeholder="Material" disabled={isSubmitting} /></div>
                <div><Input {...register("funcion")} placeholder="Función/Uso específico" disabled={isSubmitting} /></div>
                <div><Input {...register("medidaClave")} placeholder="Medida/Dimensión clave" disabled={isSubmitting} /></div>
                <div><Input {...register("acabadoHerraje")} placeholder="Acabado/Color" disabled={isSubmitting} /></div>
                <div><Input {...register("capacidad")} placeholder="Capacidad/Resistencia (opcional)" disabled={isSubmitting} /></div>
                <div><Input {...register("unidadVentaHerraje")} placeholder="Unidad de venta" disabled={isSubmitting} /></div>
                <div><Input {...register("contenidoUnidadHerraje")} type="number" placeholder="Contenido por unidad de venta" disabled={isSubmitting} /></div>
                <div><Input {...register("precioUnidadHerraje")} type="number" step="0.01" placeholder="Precio por unidad de venta" disabled={isSubmitting} /></div>
                <div className="md:col-span-2"><Input {...register("ubicacionHerraje")} placeholder="Ubicación en depósito" disabled={isSubmitting} /></div>
              </>)}
              {categoria === "Adhesivos" && (<>
                <div><Input {...register("tipoQuimico")} placeholder="Tipo de producto" disabled={isSubmitting} /></div>
                <div><Input {...register("funcionQuimico")} placeholder="Función/Uso" disabled={isSubmitting} /></div>
                <div><Input {...register("marca")} placeholder="Marca" disabled={isSubmitting} /></div>
                <div><Input {...register("contenidoNeto")} placeholder="Contenido neto/volumen" disabled={isSubmitting} /></div>
                <div><Input {...register("unidadVentaQuimico")} placeholder="Unidad de venta" disabled={isSubmitting} /></div>
                <div><Input {...register("precioUnidadQuimico")} type="number" step="0.01" placeholder="Precio por unidad de venta" disabled={isSubmitting} /></div>
                <div className="md:col-span-2"><Input {...register("ubicacionQuimico")} placeholder="Ubicación en depósito" disabled={isSubmitting} /></div>
              </>)}
              {categoria === "Herramientas" && (<>
                <div><Input {...register("tipoHerramienta")} placeholder="Tipo de herramienta/accesorio" disabled={isSubmitting} /></div>
                <div><Input {...register("uso")} placeholder="Uso específico" disabled={isSubmitting} /></div>
                <div><Input {...register("materialHerramienta")} placeholder="Material (opcional)" disabled={isSubmitting} /></div>
                <div><Input {...register("marcaHerramienta")} placeholder="Marca (opcional)" disabled={isSubmitting} /></div>
                <div><Input {...register("medidaHerramienta")} placeholder="Medida/Dimensión (opcional)" disabled={isSubmitting} /></div>
                <div><Input {...register("unidadVentaHerramienta")} placeholder="Unidad de venta" disabled={isSubmitting} /></div>
                <div><Input {...register("contenidoUnidadHerramienta")} type="number" placeholder="Contenido por unidad de venta" disabled={isSubmitting} /></div>
                <div><Input {...register("precioUnidadHerramienta")} type="number" step="0.01" placeholder="Precio por unidad de venta" disabled={isSubmitting} /></div>
                <div className="md:col-span-2"><Input {...register("ubicacionHerramienta")} placeholder="Ubicación en depósito" disabled={isSubmitting} /></div>
              </>)}
              */}
              </div>
            </div>
          </div>
          {/* Footer fijo */}
          <DialogFooter className="bg-white pt-4 sticky bottom-0 z-10">
            <Button
              variant="outline"
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button variant="default" type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Guardando...
                </>
              ) : (
                "Guardar"
              )}
            </Button>
          </DialogFooter>
        </>
      )}
    </form>
  );
}

const ProductosPage = () => {
  const [open, setOpen] = useState(false);
  const [openBulk, setOpenBulk] = useState(false);
  const [openBulkFerreteria, setOpenBulkFerreteria] = useState(false);
  const [filtro, setFiltro] = useState("");
  const [cat, setCat] = useState("");
  const [reload, setReload] = useState(false);
  const [productos, setProductos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Estados para carga masiva
  const [bulkStatus, setBulkStatus] = useState(null);
  const [bulkMessage, setBulkMessage] = useState("");
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0 });
  const [bulkFile, setBulkFile] = useState(null);

  // Estados para carga masiva Ferretería
  const [bulkStatusFerreteria, setBulkStatusFerreteria] = useState(null);
  const [bulkMessageFerreteria, setBulkMessageFerreteria] = useState("");
  const [bulkLoadingFerreteria, setBulkLoadingFerreteria] = useState(false);
  const [bulkProgressFerreteria, setBulkProgressFerreteria] = useState({
    current: 0,
    total: 0,
  });
  const [bulkFileFerreteria, setBulkFileFerreteria] = useState(null);

  // Funciones para manejar cambios en productos
  const handlePrecioPorPieChange = async (id, nuevoPrecioPorPie) => {
    try {
      const productoRef = doc(db, "productos", id);
      const producto = productos.find((p) => p.id === id);

      if (producto && producto.categoria === "Maderas") {
        // Calcular el nuevo precio con el nuevo precio por pie
        const precioBase = calcularPrecioCorteMadera({
          alto: Number(producto.alto) || 0,
          ancho: Number(producto.ancho) || 0,
          largo: Number(producto.largo) || 0,
          precioPorPie: Number(nuevoPrecioPorPie),
        });

        const precioConCepillado = precioBase * 1.066;
        const precioFinal = producto.cepilladoAplicado
          ? precioConCepillado
          : precioBase;

        // Redondear a centenas (múltiplos de 100)
        const precioRedondeado = Math.round(precioFinal / 100) * 100;

        await updateDoc(productoRef, {
          precioPorPie: Number(nuevoPrecioPorPie),
          precioCalculado: precioRedondeado, // Guardar el precio calculado redondeado
          fechaActualizacion: new Date().toISOString(),
        });

        console.log(
          `Precio por pie actualizado para producto ${id}: ${nuevoPrecioPorPie}. Precio calculado: ${precioRedondeado}`
        );
      } else {
        await updateDoc(productoRef, {
          precioPorPie: Number(nuevoPrecioPorPie),
          fechaActualizacion: new Date().toISOString(),
        });
        console.log(
          `Precio por pie actualizado para producto ${id}: ${nuevoPrecioPorPie}`
        );
      }
    } catch (error) {
      console.error("Error al actualizar precio por pie:", error);
      alert("Error al actualizar el precio por pie: " + error.message);
    }
  };

  const handleCepilladoChange = async (id, aplicarCepillado) => {
    try {
      const productoRef = doc(db, "productos", id);
      const producto = productos.find((p) => p.id === id);

      if (producto && producto.categoria === "Maderas") {
        // Calcular el nuevo precio con o sin cepillado
        const precioBase = calcularPrecioCorteMadera({
          alto: Number(producto.alto) || 0,
          ancho: Number(producto.ancho) || 0,
          largo: Number(producto.largo) || 0,
          precioPorPie: Number(producto.precioPorPie) || 0,
        });

        const precioConCepillado = precioBase * 1.066;
        const precioFinal = aplicarCepillado ? precioConCepillado : precioBase;

        // Redondear a centenas (múltiplos de 100)
        const precioRedondeado = Math.round(precioFinal / 100) * 100;

        await updateDoc(productoRef, {
          cepilladoAplicado: aplicarCepillado,
          precioCalculado: precioRedondeado, // Guardar el precio calculado redondeado
          fechaActualizacion: new Date().toISOString(),
        });

        console.log(
          `Cepillado actualizado para producto ${id}: ${aplicarCepillado}. Precio: ${precioRedondeado}`
        );
      } else {
        await updateDoc(productoRef, {
          cepilladoAplicado: aplicarCepillado,
          fechaActualizacion: new Date().toISOString(),
        });
        console.log(
          `Cepillado actualizado para producto ${id}: ${aplicarCepillado}`
        );
      }
    } catch (error) {
      console.error("Error al actualizar cepillado:", error);
      alert("Error al actualizar el cepillado: " + error.message);
    }
  };

  const handleCantidadChange = async (id, nuevaCantidad) => {
    try {
      const cantidad = Math.max(1, parseInt(nuevaCantidad) || 1);
      const productoRef = doc(db, "productos", id);
      await updateDoc(productoRef, {
        cantidad: cantidad,
        fechaActualizacion: new Date().toISOString(),
      });
      console.log(`Cantidad actualizada para producto ${id}: ${cantidad}`);
    } catch (error) {
      console.error("Error al actualizar cantidad:", error);
      alert("Error al actualizar la cantidad: " + error.message);
    }
  };

  const handleValorVentaChange = async (id, nuevoValorVenta) => {
    try {
      const productoRef = doc(db, "productos", id);
      const producto = productos.find((p) => p.id === id);

      if (producto && producto.categoria === "Ferretería") {
        await updateDoc(productoRef, {
          valorVenta: Number(nuevoValorVenta),
          fechaActualizacion: new Date().toISOString(),
        });
        console.log(
          `Valor de venta actualizado para producto ${id}: ${nuevoValorVenta}`
        );
      }
    } catch (error) {
      console.error("Error al actualizar valor de venta:", error);
      alert("Error al actualizar el valor de venta: " + error.message);
    }
  };

  useEffect(() => {
    setLoading(true);
    setError(null);
    const q = query(collection(db, "productos"), orderBy("nombre"));
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        setProductos(
          snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
        );
        setLoading(false);
      },
      (err) => {
        setError("Error al cargar productos: " + err.message);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [reload]);

  // Filtro profesional
  const productosFiltrados = productos.filter(
    (p) =>
      (cat ? p.categoria === cat : true) &&
      (filtro
        ? p.nombre?.toLowerCase().includes(filtro.toLowerCase()) ||
          p.codigo?.toLowerCase().includes(filtro.toLowerCase())
        : true)
  );

  // Función para procesar archivo Excel/CSV
  const processExcelFile = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        try {
          const content = e.target.result;
          console.log("Archivo leído:", file.name, "Tamaño:", file.size);

          // Si es un archivo CSV, procesar directamente
          if (file.name.toLowerCase().endsWith(".csv")) {
            const lines = content.split("\n");
            console.log("Líneas CSV encontradas:", lines.length);

            if (lines.length < 2) {
              reject(
                new Error(
                  "El archivo CSV debe tener al menos una fila de encabezados y una fila de datos"
                )
              );
              return;
            }

            const headers = lines[0]
              .split(",")
              .map((h) => h.trim().replace(/"/g, ""));
            console.log("Encabezados detectados:", headers);

            const productos = [];
            for (let i = 1; i < lines.length; i++) {
              if (lines[i].trim()) {
                // Función para parsear valores CSV correctamente
                const parseCSVLine = (line) => {
                  const result = [];
                  let current = "";
                  let inQuotes = false;

                  for (let j = 0; j < line.length; j++) {
                    const char = line[j];
                    if (char === '"') {
                      inQuotes = !inQuotes;
                    } else if (char === "," && !inQuotes) {
                      result.push(current.trim());
                      current = "";
                    } else {
                      current += char;
                    }
                  }
                  result.push(current.trim());
                  return result;
                };

                const values = parseCSVLine(lines[i]);
                const producto = {};

                headers.forEach((header, index) => {
                  let value = values[index] || "";

                  // Limpiar comillas
                  value = value.replace(/"/g, "");

                  // Convertir valores numéricos
                  if (
                    [
                      "costo",
                      "largo",
                      "ancho",
                      "alto",
                      "precioPorPie",
                    ].includes(header)
                  ) {
                    // Manejar comas en números (formato argentino)
                    value = value.replace(",", ".");
                    value = parseFloat(value) || 0;
                  }

                  producto[header] = value;
                });

                // Validar que tenga los campos mínimos
                if (producto.codigo && producto.nombre && producto.categoria) {
                  productos.push(producto);
                  console.log("Producto válido agregado:", producto.codigo);
                } else {
                  console.log("Producto inválido ignorado:", producto);
                }
              }
            }

            console.log("Total de productos válidos:", productos.length);
            resolve(productos);
          } else {
            // Para archivos Excel (.xlsx, .xls), mostrar error por ahora
            reject(
              new Error(
                "Los archivos Excel (.xlsx, .xls) no están soportados aún. Por favor, guarda tu archivo como CSV y súbelo nuevamente."
              )
            );
          }
        } catch (error) {
          console.error("Error procesando archivo:", error);
          reject(error);
        }
      };

      reader.onerror = () => {
        console.error("Error al leer el archivo");
        reject(new Error("Error al leer el archivo"));
      };

      // Leer como texto para CSV
      reader.readAsText(file);
    });
  };

  // Función para procesar archivo Excel/CSV específico para Ferretería
  const processExcelFileFerreteria = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        try {
          const content = e.target.result;
          console.log(
            "Archivo Ferretería leído:",
            file.name,
            "Tamaño:",
            file.size
          );

          // Si es un archivo CSV, procesar directamente
          if (file.name.toLowerCase().endsWith(".csv")) {
            const lines = content.split("\n");
            console.log("Líneas CSV Ferretería encontradas:", lines.length);

            if (lines.length < 2) {
              reject(
                new Error(
                  "El archivo CSV debe tener al menos una fila de encabezados y una fila de datos"
                )
              );
              return;
            }

            const headers = lines[0]
              .split(",")
              .map((h) => h.trim().replace(/"/g, ""));
            console.log("Encabezados Ferretería detectados:", headers);

            const productos = [];
            for (let i = 1; i < lines.length; i++) {
              if (lines[i].trim()) {
                // Función para parsear valores CSV correctamente
                const parseCSVLine = (line) => {
                  const result = [];
                  let current = "";
                  let inQuotes = false;

                  for (let j = 0; j < line.length; j++) {
                    const char = line[j];
                    if (char === '"') {
                      inQuotes = !inQuotes;
                    } else if (char === "," && !inQuotes) {
                      result.push(current.trim());
                      current = "";
                    } else {
                      current += char;
                    }
                  }
                  result.push(current.trim());
                  return result;
                };

                const values = parseCSVLine(lines[i]);
                const producto = {};

                headers.forEach((header, index) => {
                  let value = values[index] || "";

                  // Limpiar comillas
                  value = value.replace(/"/g, "");

                  // Convertir valores numéricos
                  if (
                    [
                      "costo",
                      "stockMinimo",
                      "valorCompra",
                      "valorVenta",
                    ].includes(header)
                  ) {
                    // Manejar comas en números (formato argentino)
                    value = value.replace(",", ".");
                    value = parseFloat(value) || 0;
                  }

                  producto[header] = value;
                });

                // Validar que tenga los campos mínimos
                if (producto.codigo && producto.nombre && producto.categoria) {
                  productos.push(producto);
                  console.log(
                    "Producto Ferretería válido agregado:",
                    producto.codigo
                  );
                } else {
                  console.log(
                    "Producto Ferretería inválido ignorado:",
                    producto
                  );
                }
              }
            }

            console.log(
              "Total de productos Ferretería válidos:",
              productos.length
            );
            resolve(productos);
          } else {
            // Para archivos Excel (.xlsx, .xls), mostrar error por ahora
            reject(
              new Error(
                "Los archivos Excel (.xlsx, .xls) no están soportados aún. Por favor, guarda tu archivo como CSV y súbelo nuevamente."
              )
            );
          }
        } catch (error) {
          console.error("Error procesando archivo Ferretería:", error);
          reject(error);
        }
      };

      reader.onerror = () => {
        console.error("Error al leer el archivo Ferretería");
        reject(new Error("Error al leer el archivo"));
      };

      // Leer como texto para CSV
      reader.readAsText(file);
    });
  };

  // Función para procesar carga masiva
  const handleBulkUpload = async () => {
    setBulkStatus(null);
    setBulkMessage("");
    setBulkLoading(true);
    setBulkProgress({ current: 0, total: 0 });

    try {
      let productosData;

      if (!bulkFile) {
        setBulkStatus("error");
        setBulkMessage("Debes seleccionar un archivo Excel/CSV.");
        setBulkLoading(false);
        return;
      }

      try {
        productosData = await processExcelFile(bulkFile);
      } catch (e) {
        setBulkStatus("error");
        setBulkMessage("Error al procesar el archivo: " + e.message);
        setBulkLoading(false);
        return;
      }

      // Validar productos
      const productosValidos = [];
      const productosInvalidos = [];

      for (let i = 0; i < productosData.length; i++) {
        const producto = productosData[i];

        // Validaciones básicas
        if (!producto.codigo || !producto.nombre || !producto.categoria) {
          productosInvalidos.push({
            index: i + 1,
            codigo: producto.codigo || "Sin código",
            error: "Faltan campos obligatorios (código, nombre, categoría)",
          });
          continue;
        }

        // Validar que sea de categoría Maderas
        if (producto.categoria !== "Maderas") {
          productosInvalidos.push({
            index: i + 1,
            codigo: producto.codigo,
            error: "Solo se permiten productos de categoría 'Maderas'",
          });
          continue;
        }

        // Validar campos específicos de maderas
        if (
          !producto.tipoMadera ||
          !producto.largo ||
          !producto.ancho ||
          !producto.alto
        ) {
          productosInvalidos.push({
            index: i + 1,
            codigo: producto.codigo,
            error: `Faltan campos específicos de maderas. tipoMadera: ${producto.tipoMadera}, largo: ${producto.largo}, ancho: ${producto.ancho}, alto: ${producto.alto}`,
          });
          continue;
        }

        // Validar que precioPorPie no sea null o 0
        if (
          producto.precioPorPie === null ||
          producto.precioPorPie === undefined ||
          producto.precioPorPie === 0
        ) {
          productosInvalidos.push({
            index: i + 1,
            codigo: producto.codigo,
            error: `precioPorPie no puede ser null o 0. Valor actual: ${producto.precioPorPie}`,
          });
          continue;
        }

        // Validar que los valores numéricos sean válidos
        const valoresNumericos = [
          "largo",
          "ancho",
          "alto",
          "costo",
          "precioPorPie",
        ];
        for (const campo of valoresNumericos) {
          if (
            producto[campo] === null ||
            producto[campo] === undefined ||
            isNaN(producto[campo]) ||
            producto[campo] <= 0
          ) {
            productosInvalidos.push({
              index: i + 1,
              codigo: producto.codigo,
              error: `Campo ${campo} debe ser un número válido mayor a 0. Valor actual: ${producto[campo]}`,
            });
            continue;
          }
        }

        productosValidos.push({
          ...producto,
          fechaCreacion: new Date().toISOString(),
          fechaActualizacion: new Date().toISOString(),
          // Asegurar que unidadMedida sea "pie" para maderas
          unidadMedida: "pie",
        });
      }

      // Mostrar errores si hay productos inválidos
      if (productosInvalidos.length > 0) {
        setBulkStatus("error");
        const erroresDetallados = productosInvalidos
          .map((p) => `Línea ${p.index} (${p.codigo}): ${p.error}`)
          .join("\n");
        setBulkMessage(
          `Se encontraron ${productosInvalidos.length} productos con errores:\n\n${erroresDetallados}`
        );
        setBulkLoading(false);
        return;
      }

      // Procesar productos válidos
      setBulkProgress({ current: 0, total: productosValidos.length });

      for (let i = 0; i < productosValidos.length; i++) {
        const producto = productosValidos[i];

        try {
          await addDoc(collection(db, "productos"), producto);
          setBulkProgress({ current: i + 1, total: productosValidos.length });

          // Pequeña pausa para no sobrecargar Firebase
          await new Promise((resolve) => setTimeout(resolve, 100));
        } catch (e) {
          setBulkStatus("error");
          setBulkMessage(
            `Error al guardar producto ${producto.codigo}: ${e.message}`
          );
          setBulkLoading(false);
          return;
        }
      }

      setBulkStatus("success");
      setBulkMessage(
        `Se cargaron exitosamente ${productosValidos.length} productos.`
      );

      // Limpiar formulario y cerrar modal
      setTimeout(() => {
        setOpenBulk(false);
        setBulkFile(null);
        setBulkStatus(null);
        setBulkMessage("");
        setBulkLoading(false);
        setBulkProgress({ current: 0, total: 0 });
        setReload((r) => !r);
      }, 2000);
    } catch (e) {
      setBulkStatus("error");
      setBulkMessage("Error inesperado: " + e.message);
      setBulkLoading(false);
    }
  };

  // Función para procesar carga masiva de Ferretería
  const handleBulkUploadFerreteria = async () => {
    setBulkStatusFerreteria(null);
    setBulkMessageFerreteria("");
    setBulkLoadingFerreteria(true);
    setBulkProgressFerreteria({ current: 0, total: 0 });

    try {
      let productosData;

      if (!bulkFileFerreteria) {
        setBulkStatusFerreteria("error");
        setBulkMessageFerreteria("Debes seleccionar un archivo Excel/CSV.");
        setBulkLoadingFerreteria(false);
        return;
      }

      try {
        productosData = await processExcelFileFerreteria(bulkFileFerreteria);
      } catch (e) {
        setBulkStatusFerreteria("error");
        setBulkMessageFerreteria("Error al procesar el archivo: " + e.message);
        setBulkLoadingFerreteria(false);
        return;
      }

      // Validar productos
      const productosValidos = [];
      const productosInvalidos = [];

      for (let i = 0; i < productosData.length; i++) {
        const producto = productosData[i];

        // Validaciones básicas
        if (!producto.codigo || !producto.nombre || !producto.categoria) {
          productosInvalidos.push({
            index: i + 1,
            codigo: producto.codigo || "Sin código",
            error: "Faltan campos obligatorios (código, nombre, categoría)",
          });
          continue;
        }

        // Validar que sea de categoría Ferretería
        if (producto.categoria !== "Ferretería") {
          productosInvalidos.push({
            index: i + 1,
            codigo: producto.codigo,
            error: "Solo se permiten productos de categoría 'Ferretería'",
          });
          continue;
        }

        // Validar campos específicos de ferretería
        if (
          !producto.stockMinimo ||
          !producto.unidadMedida ||
          !producto.valorCompra ||
          !producto.valorVenta ||
          !producto.proveedor
        ) {
          productosInvalidos.push({
            index: i + 1,
            codigo: producto.codigo,
            error: `Faltan campos específicos de ferretería. stockMinimo: ${producto.stockMinimo}, unidadMedida: ${producto.unidadMedida}, valorCompra: ${producto.valorCompra}, valorVenta: ${producto.valorVenta}, proveedor: ${producto.proveedor}`,
          });
          continue;
        }

        // Validar que los valores numéricos sean válidos
        const valoresNumericos = [
          "costo",
          "stockMinimo",
          "valorCompra",
          "valorVenta",
        ];
        for (const campo of valoresNumericos) {
          if (
            producto[campo] === null ||
            producto[campo] === undefined ||
            isNaN(producto[campo]) ||
            producto[campo] < 0
          ) {
            productosInvalidos.push({
              index: i + 1,
              codigo: producto.codigo,
              error: `Campo ${campo} debe ser un número válido mayor o igual a 0. Valor actual: ${producto[campo]}`,
            });
            continue;
          }
        }

        // Validar que valorVenta sea mayor que valorCompra
        if (producto.valorVenta <= producto.valorCompra) {
          productosInvalidos.push({
            index: i + 1,
            codigo: producto.codigo,
            error: `El valor de venta debe ser mayor al valor de compra. valorVenta: ${producto.valorVenta}, valorCompra: ${producto.valorCompra}`,
          });
          continue;
        }

        productosValidos.push({
          ...producto,
          fechaCreacion: new Date().toISOString(),
          fechaActualizacion: new Date().toISOString(),
        });
      }

      // Mostrar errores si hay productos inválidos
      if (productosInvalidos.length > 0) {
        setBulkStatusFerreteria("error");
        const erroresDetallados = productosInvalidos
          .map((p) => `Línea ${p.index} (${p.codigo}): ${p.error}`)
          .join("\n");
        setBulkMessageFerreteria(
          `Se encontraron ${productosInvalidos.length} productos con errores:\n\n${erroresDetallados}`
        );
        setBulkLoadingFerreteria(false);
        return;
      }

      // Procesar productos válidos
      setBulkProgressFerreteria({ current: 0, total: productosValidos.length });

      for (let i = 0; i < productosValidos.length; i++) {
        const producto = productosValidos[i];

        try {
          await addDoc(collection(db, "productos"), producto);
          setBulkProgressFerreteria({
            current: i + 1,
            total: productosValidos.length,
          });

          // Pequeña pausa para no sobrecargar Firebase
          await new Promise((resolve) => setTimeout(resolve, 100));
        } catch (e) {
          setBulkStatusFerreteria("error");
          setBulkMessageFerreteria(
            `Error al guardar producto ${producto.codigo}: ${e.message}`
          );
          setBulkLoadingFerreteria(false);
          return;
        }
      }

      setBulkStatusFerreteria("success");
      setBulkMessageFerreteria(
        `Se cargaron exitosamente ${productosValidos.length} productos de Ferretería.`
      );

      // Limpiar formulario y cerrar modal
      setTimeout(() => {
        setOpenBulkFerreteria(false);
        setBulkFileFerreteria(null);
        setBulkStatusFerreteria(null);
        setBulkMessageFerreteria("");
        setBulkLoadingFerreteria(false);
        setBulkProgressFerreteria({ current: 0, total: 0 });
        setReload((r) => !r);
      }, 2000);
    } catch (e) {
      setBulkStatusFerreteria("error");
      setBulkMessageFerreteria("Error inesperado: " + e.message);
      setBulkLoadingFerreteria(false);
    }
  };

  // Función para descargar CSV de ejemplo
  const downloadExampleCSV = () => {
    const csvContent = `codigo,nombre,descripcion,categoria,subcategoria,estado,costo,tipoMadera,largo,ancho,alto,precioPorPie,ubicacion,unidadMedida
1401,TABLAS 1/2 X 6 X 3,,Maderas,Tabla,Activo,420.0,Saligna,3.0,0.5,6.0,700.0,,pie
1402,TABALAS 1" X 4 X 3,,Maderas,Tabla,Activo,353.0,Saligna,3.0,1.0,4.0,700.0,,pie
1403,TABALAS 1" X4 X 4,,Maderas,Tabla,Activo,353.0,Saligna,4.0,1.0,4.0,700.0,,pie`;

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ejemplo_maderas.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  // Función para descargar CSV de ejemplo para Ferretería
  const downloadExampleCSVFerreteria = () => {
    const csvContent = `codigo,nombre,descripcion,categoria,subcategoria,estado,costo,stockMinimo,unidadMedida,valorCompra,valorVenta,proveedor,ubicacion
F001,Tornillos Phillips 3x20,Tornillos Phillips cabeza plana,Ferretería,Tornillos,Activo,150.0,50,kg,120.0,180.0,Proveedor A,Estante A1
F002,Clavos 2 pulgadas,Clavos de construcción,Ferretería,Clavos,Activo,80.0,100,kg,65.0,95.0,Proveedor B,Estante B2
F003,Bisagras 3 pulgadas,Bisagras de acero,Ferretería,Bisagras,Activo,200.0,30,unidad,160.0,240.0,Proveedor C,Estante C3`;

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ejemplo_ferreteria.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="py-8 px-2 max-w-8xl mx-auto">
      <div className="mb-8 flex items-center gap-4">
        <Boxes className="w-10 h-10 text-primary" />
        <div>
          <h1 className="text-3xl font-bold mb-1">Productos</h1>
          <p className="text-lg text-gray-500">
            Catálogo y stock de productos madereros.
          </p>
        </div>
      </div>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle>Listado de Productos</CardTitle>
          <div className="flex gap-2">
            <select
              value={cat}
              onChange={(e) => setCat(e.target.value)}
              className="border rounded px-2 py-2"
            >
              <option value="">Todas las categorías</option>
              {categorias.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <Input
              placeholder="Buscar producto..."
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              className="w-48"
            />
            <Button variant="default" onClick={() => setOpen(true)}>
              <Plus className="w-4 h-4 mr-1" />
              Agregar Producto
            </Button>
            <Button variant="outline" onClick={() => setOpenBulk(true)}>
              <Upload className="w-4 h-4 mr-1" />
              Carga Masiva
            </Button>
            <Button
              variant="outline"
              onClick={() => setOpenBulkFerreteria(true)}
            >
              <Upload className="w-4 h-4 mr-1" />
              Carga Masiva Ferretería
            </Button>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {loading ? (
            <div className="flex justify-center items-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : error ? (
            <div className="text-red-600 py-4 text-center">{error}</div>
          ) : productosFiltrados.length === 0 ? (
            <div className="text-gray-500 py-4 text-center">
              No hay productos para mostrar.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full caption-top text-sm overflow-hidden">
                <thead className="[&_tr]:border-b bg-default-">
                  <tr className="border-b border-default-300 transition-colors data-[state=selected]:bg-muted">
                    <th className="h-14 px-4 ltr:text-left rtl:text-right last:ltr:text-right last:rtl:text-left align-middle font-semibold text-sm text-default-800 capitalize [&:has([role=checkbox])]:ltr:pr-0 [&:has([role=checkbox])]:rtl:pl-0">
                      Código
                    </th>
                    <th className="h-14 px-4 ltr:text-left rtl:text-right last:ltr:text-right last:rtl:text-left align-middle font-semibold text-sm text-default-800 capitalize [&:has([role=checkbox])]:ltr:pr-0 [&:has([role=checkbox])]:rtl:pl-0">
                      Categoría
                    </th>
                    <th className="h-14 px-4 ltr:text-left rtl:text-right last:ltr:text-right last:rtl:text-left align-middle font-semibold text-sm text-default-800 capitalize [&:has([role=checkbox])]:ltr:pr-0 [&:has([role=checkbox])]:rtl:pl-0">
                      Producto
                    </th>
                    <th className="h-14 px-4 ltr:text-left rtl:text-right last:ltr:text-right last:rtl:text-left align-middle font-semibold text-sm text-default-800 capitalize [&:has([role=checkbox])]:ltr:pr-0 [&:has([role=checkbox])]:rtl:pl-0">
                      Stock
                    </th>
                    <th className="h-14 px-4 ltr:text-left rtl:text-right last:ltr:text-right last:rtl:text-left align-middle font-semibold text-sm text-default-800 capitalize [&:has([role=checkbox])]:ltr:pr-0 [&:has([role=checkbox])]:rtl:pl-0">
                      Cantidad
                    </th>
                    <th className="h-14 px-4 ltr:text-left rtl:text-right last:ltr:text-right last:rtl:text-left align-middle font-semibold text-sm text-default-800 capitalize [&:has([role=checkbox])]:ltr:pr-0 [&:has([role=checkbox])]:rtl:pl-0">
                      Cepillado
                    </th>
                    <th className="h-14 px-4 ltr:text-left rtl:text-right last:ltr:text-right last:rtl:text-left align-middle font-semibold text-sm text-default-800 capitalize [&:has([role=checkbox])]:ltr:pr-0 [&:has([role=checkbox])]:rtl:pl-0">
                      Precio unit.
                    </th>
                    <th className="h-14 px-4 ltr:text-left rtl:text-right last:ltr:text-right last:rtl:text-left align-middle font-semibold text-sm text-default-800 capitalize [&:has([role=checkbox])]:ltr:pr-0 [&:has([role=checkbox])]:rtl:pl-0">
                      Precio total
                    </th>
                    <th className="h-14 px-4 ltr:text-left rtl:text-right last:ltr:text-right last:rtl:text-left align-middle font-semibold text-sm text-default-800 capitalize [&:has([role=checkbox])]:ltr:pr-0 [&:has([role=checkbox])]:rtl:pl-0">
                      Estado
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {productosFiltrados.map((p) => (
                    <tr
                      key={p.id}
                      className="border-b border-default-300 transition-colors data-[state=selected]:bg-muted"
                    >
                      <td className="p-4 align-middle text-sm text-default-600 last:text-right last:rtl:text-left font-normal [&:has([role=checkbox])]:ltr:pr-0 [&:has([role=checkbox])]:rtl:pl-0">
                        <div className="font-semibold text-default-900">
                          {p.codigo}
                        </div>
                      </td>
                      <td className="p-4 align-middle text-sm text-default-600 last:text-right last:rtl:text-left font-normal [&:has([role=checkbox])]:ltr:pr-0 [&:has([role=checkbox])]:rtl:pl-0">
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                              p.categoria === "Maderas"
                                ? "bg-orange-100 text-orange-700"
                                : "bg-blue-100 text-blue-700"
                            }`}
                          >
                            {p.categoria === "Maderas" ? "🌲" : "🔧"}
                          </div>
                          <span>{p.categoria}</span>
                        </div>
                      </td>
                      <td className="p-4 align-middle text-sm text-default-600 last:text-right last:rtl:text-left font-normal [&:has([role=checkbox])]:ltr:pr-0 [&:has([role=checkbox])]:rtl:pl-0">
                        <div className="font-semibold text-default-900">
                          {p.nombre}
                        </div>
                        {p.categoria === "Maderas" && (
                          <div className="flex flex-wrap gap-2 mt-1 text-xs items-center">
                            <span className="font-medium text-gray-500">
                              Dimensiones:
                            </span>
                            <span>
                              Alto:{" "}
                              <span className="font-bold">{p.alto || 0}</span>{" "}
                              cm
                            </span>
                            <span>
                              Ancho:{" "}
                              <span className="font-bold">{p.ancho || 0}</span>{" "}
                              cm
                            </span>
                            <span>
                              Largo:{" "}
                              <span className="font-bold">{p.largo || 0}</span>{" "}
                              cm
                            </span>
                            <span>
                              $/pie:{" "}
                              <div className="inline-flex items-center gap-1">
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={p.precioPorPie || 0}
                                  onChange={(e) =>
                                    handlePrecioPorPieChange(
                                      p.id,
                                      e.target.value
                                    )
                                  }
                                  className="w-20 text-center border border-blue-300 rounded px-2 py-1 text-xs font-bold bg-blue-50 focus:bg-white focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                                  placeholder="0.00"
                                  title="Editar precio por pie"
                                />
                                <svg
                                  className="w-3 h-3 text-blue-500"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth="2"
                                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                  />
                                </svg>
                              </div>
                            </span>
                            {p.stock <= 0 && (
                              <span className="text-red-600 font-semibold ml-2">
                                ¡Sin stock!
                              </span>
                            )}
                            {p.stock > 0 && p.stock <= 3 && (
                              <span className="text-yellow-600 font-semibold ml-2">
                                Stock bajo: {p.stock}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="p-4 align-middle text-sm text-default-600 last:text-right last:rtl:text-left font-normal [&:has([role=checkbox])]:ltr:pr-0 [&:has([role=checkbox])]:rtl:pl-0">
                        <span
                          className={`font-bold ${
                            p.stock > 10
                              ? "text-green-600"
                              : p.stock > 0
                              ? "text-yellow-600"
                              : "text-red-600"
                          }`}
                        >
                          {p.stock || 0}
                        </span>
                      </td>
                      <td className="p-4 align-middle text-sm text-default-600 last:text-right last:rtl:text-left font-normal [&:has([role=checkbox])]:ltr:pr-0 [&:has([role=checkbox])]:rtl:pl-0">
                        <div className="flex items-center justify-center">
                          <input
                            type="number"
                            min="1"
                            value={p.cantidad || 1}
                            onChange={(e) => {
                              handleCantidadChange(p.id, e.target.value);
                            }}
                            className="w-16 text-center border border-gray-300 rounded px-2 py-1 text-sm font-medium bg-white focus:bg-white focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                            title="Cantidad"
                          />
                        </div>
                      </td>
                      <td className="p-4 align-middle text-sm text-default-600 last:text-right last:rtl:text-left font-normal [&:has([role=checkbox])]:ltr:pr-0 [&:has([role=checkbox])]:rtl:pl-0">
                        {p.categoria === "Maderas" ? (
                          <div className="flex items-center justify-center">
                            <input
                              type="checkbox"
                              checked={p.cepilladoAplicado || false}
                              onChange={(e) => {
                                handleCepilladoChange(p.id, e.target.checked);
                              }}
                              className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                              title="Aplicar cepillado (+6.6%)"
                            />
                          </div>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="p-4 align-middle text-sm text-default-600 last:text-right last:rtl:text-left font-normal [&:has([role=checkbox])]:ltr:pr-0 [&:has([role=checkbox])]:rtl:pl-0">
                        {p.categoria === "Maderas" ? (
                          <div className="flex flex-col items-center">
                            <span className="font-bold text-lg">
                              $
                              {formatearNumeroArgentino(
                                (() => {
                                  const precioBase = calcularPrecioCorteMadera({
                                    alto: Number(p.alto) || 0,
                                    ancho: Number(p.ancho) || 0,
                                    largo: Number(p.largo) || 0,
                                    precioPorPie: Number(p.precioPorPie) || 0,
                                  });
                                  const precioConCepillado = precioBase * 1.066;
                                  const precioFinal = p.cepilladoAplicado
                                    ? precioConCepillado
                                    : precioBase;
                                  // Redondear a centenas (múltiplos de 100)
                                  return Math.round(precioFinal / 100) * 100;
                                })()
                              )}
                            </span>
                            <span className="text-xs text-gray-500">
                              {p.cepilladoAplicado
                                ? "Con cepillado"
                                : "Sin cepillado"}
                            </span>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center">
                            <div className="inline-flex items-center gap-1">
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={p.valorVenta || 0}
                                onChange={(e) =>
                                  handleValorVentaChange(p.id, e.target.value)
                                }
                                className="w-20 text-center border border-blue-300 rounded px-2 py-1 text-xs font-bold bg-blue-50 focus:bg-white focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                                placeholder="0.00"
                                title="Editar valor de venta"
                              />
                              <svg
                                className="w-3 h-3 text-blue-500"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth="2"
                                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                />
                              </svg>
                            </div>
                            <span className="text-xs text-gray-500">
                              Valor de venta
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="p-4 align-middle text-sm text-default-600 last:text-right last:rtl:text-left font-normal [&:has([role=checkbox])]:ltr:pr-0 [&:has([role=checkbox])]:rtl:pl-0">
                        <div className="flex flex-col items-center">
                          <span className="font-bold text-lg text-green-600">
                            $
                            {formatearNumeroArgentino(
                              (() => {
                                const precioUnitario =
                                  p.categoria === "Maderas"
                                    ? (() => {
                                        const precioBase =
                                          calcularPrecioCorteMadera({
                                            alto: Number(p.alto) || 0,
                                            ancho: Number(p.ancho) || 0,
                                            largo: Number(p.largo) || 0,
                                            precioPorPie:
                                              Number(p.precioPorPie) || 0,
                                          });
                                        const precioConCepillado =
                                          precioBase * 1.066;
                                        const precioFinal = p.cepilladoAplicado
                                          ? precioConCepillado
                                          : precioBase;
                                        // Redondear a centenas (múltiplos de 100)
                                        return (
                                          Math.round(precioFinal / 100) * 100
                                        );
                                      })()
                                    : Number(p.valorVenta) || 0;
                                const cantidad = Number(p.cantidad) || 1;
                                return precioUnitario * cantidad;
                              })()
                            )}
                          </span>
                          <span className="text-xs text-gray-500">Total</span>
                        </div>
                      </td>
                      <td className="p-4 align-middle text-sm text-default-600 last:text-right last:rtl:text-left font-normal [&:has([role=checkbox])]:ltr:pr-0 [&:has([role=checkbox])]:rtl:pl-0">
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-semibold ${
                            p.estado === "Activo"
                              ? "bg-green-100 text-green-800"
                              : p.estado === "Inactivo"
                              ? "bg-yellow-100 text-yellow-800"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {p.estado}
                        </span>
                      </td>
                      {/* <td className="p-4 align-middle text-sm text-default-600 last:text-right last:rtl:text-left font-normal [&:has([role=checkbox])]:ltr:pr-0 [&:has([role=checkbox])]:rtl:pl-0">
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline">
                            Editar
                          </Button>
                        </div>
                      </td> */}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[95vw] max-w-[520px] p-0">
          <DialogHeader className="px-6 pt-6 pb-2">
            <DialogTitle>Agregar Producto</DialogTitle>
          </DialogHeader>
          <div
            className="px-6 pb-2 pt-0"
            style={{ maxHeight: "65vh", overflowY: "auto" }}
          >
            <FormularioProducto
              onClose={() => setOpen(false)}
              onSuccess={() => setReload((r) => !r)}
            />
          </div>
          <DialogFooter className="bg-white px-6 py-4 border-t bottom-0 z-20 shadow-lg flex justify-end gap-2">
            {/* Los botones del footer se renderizan dentro del propio FormularioProducto, así que aquí solo se deja el espacio visual */}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Carga Masiva */}
      <Dialog open={openBulk} onOpenChange={setOpenBulk}>
        <DialogContent className="w-[95vw] max-w-[800px] max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Carga Masiva de Productos</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            {bulkStatus && (
              <div
                className={`p-3 rounded-lg flex items-center gap-2 text-sm ${
                  bulkStatus === "success"
                    ? "bg-green-50 text-green-800 border border-green-200"
                    : "bg-red-50 text-red-800 border border-red-200"
                }`}
              >
                {bulkStatus === "success" ? (
                  <CheckCircle className="w-4 h-4" />
                ) : (
                  <AlertCircle className="w-4 h-4" />
                )}
                {bulkMessage}
              </div>
            )}

            {/* Barra de progreso */}
            {bulkLoading && bulkProgress.total > 0 && (
              <div className="bg-blue-50 p-3 rounded-lg">
                <div className="flex justify-between text-sm mb-2">
                  <span>Procesando productos...</span>
                  <span>
                    {bulkProgress.current} / {bulkProgress.total}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{
                      width: `${
                        (bulkProgress.current / bulkProgress.total) * 100
                      }%`,
                    }}
                  ></div>
                </div>
              </div>
            )}

            <div>
              <label className="font-semibold text-sm mb-2 block">
                Archivo Excel/CSV
              </label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                <FileSpreadsheet className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <input
                  type="file"
                  accept=".csv"
                  onChange={(e) => setBulkFile(e.target.files[0])}
                  className="hidden"
                  id="file-upload"
                  disabled={bulkLoading}
                />
                <label
                  htmlFor="file-upload"
                  className="cursor-pointer bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Seleccionar archivo CSV
                </label>
                {bulkFile && (
                  <div className="mt-4 p-3 bg-green-50 rounded-lg">
                    <p className="text-sm text-green-800">
                      ✅ Archivo seleccionado: <strong>{bulkFile.name}</strong>
                    </p>
                  </div>
                )}
                <p className="text-sm text-gray-500 mt-2">
                  Formato soportado: CSV (guarda tu Excel como CSV)
                </p>
                <button
                  type="button"
                  onClick={downloadExampleCSV}
                  className="mt-4 text-sm text-blue-600 hover:text-blue-800 underline"
                >
                  📥 Descargar ejemplo CSV
                </button>
              </div>
            </div>

            <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-200">
              <h4 className="font-semibold text-yellow-800 mb-2">
                ⚠️ Instrucciones:
              </h4>
              <ul className="text-sm text-yellow-700 space-y-1">
                <li>• Solo se permiten productos de categoría "Maderas"</li>
                <li>• Todos los campos obligatorios deben estar presentes</li>
                <li>• El campo "precioPorPie" no puede ser null o 0</li>
                <li>• Se agregarán automáticamente las fechas de creación</li>
                <li>
                  • La unidad de medida se establecerá automáticamente como
                  "pie"
                </li>
                <li>• El archivo debe tener encabezados en la primera fila</li>
                <li>• Los campos numéricos se convertirán automáticamente</li>
                <li>• Se ignorarán las filas vacías</li>
                <li>• Guarda tu archivo Excel como CSV antes de subirlo</li>
                <li>
                  • Asegúrate de que las columnas coincidan con el formato
                  esperado
                </li>
              </ul>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpenBulk(false)}
              disabled={bulkLoading}
            >
              Cancelar
            </Button>
            <Button
              variant="default"
              onClick={handleBulkUpload}
              disabled={bulkLoading || !bulkFile}
            >
              {bulkLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Procesando...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Cargar Productos
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Carga Masiva Ferretería */}
      <Dialog open={openBulkFerreteria} onOpenChange={setOpenBulkFerreteria}>
        <DialogContent className="w-[95vw] max-w-[800px] max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Carga Masiva de Productos Ferretería</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            {bulkStatusFerreteria && (
              <div
                className={`p-3 rounded-lg flex items-center gap-2 text-sm ${
                  bulkStatusFerreteria === "success"
                    ? "bg-green-50 text-green-800 border border-green-200"
                    : "bg-red-50 text-red-800 border border-red-200"
                }`}
              >
                {bulkStatusFerreteria === "success" ? (
                  <CheckCircle className="w-4 h-4" />
                ) : (
                  <AlertCircle className="w-4 h-4" />
                )}
                {bulkMessageFerreteria}
              </div>
            )}

            {/* Barra de progreso */}
            {bulkLoadingFerreteria && bulkProgressFerreteria.total > 0 && (
              <div className="bg-blue-50 p-3 rounded-lg">
                <div className="flex justify-between text-sm mb-2">
                  <span>Procesando productos...</span>
                  <span>
                    {bulkProgressFerreteria.current} /{" "}
                    {bulkProgressFerreteria.total}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{
                      width: `${
                        (bulkProgressFerreteria.current /
                          bulkProgressFerreteria.total) *
                        100
                      }%`,
                    }}
                  ></div>
                </div>
              </div>
            )}

            <div>
              <label className="font-semibold text-sm mb-2 block">
                Archivo Excel/CSV
              </label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                <FileSpreadsheet className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <input
                  type="file"
                  accept=".csv"
                  onChange={(e) => setBulkFileFerreteria(e.target.files[0])}
                  className="hidden"
                  id="file-upload-ferreteria"
                  disabled={bulkLoadingFerreteria}
                />
                <label
                  htmlFor="file-upload-ferreteria"
                  className="cursor-pointer bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Seleccionar archivo CSV
                </label>
                {bulkFileFerreteria && (
                  <div className="mt-4 p-3 bg-green-50 rounded-lg">
                    <p className="text-sm text-green-800">
                      ✅ Archivo seleccionado:{" "}
                      <strong>{bulkFileFerreteria.name}</strong>
                    </p>
                  </div>
                )}
                <p className="text-sm text-gray-500 mt-2">
                  Formato soportado: CSV (guarda tu Excel como CSV)
                </p>
                <button
                  type="button"
                  onClick={downloadExampleCSVFerreteria}
                  className="mt-4 text-sm text-blue-600 hover:text-blue-800 underline"
                >
                  📥 Descargar ejemplo CSV
                </button>
              </div>
            </div>

            <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-200">
              <h4 className="font-semibold text-yellow-800 mb-2">
                ⚠️ Instrucciones:
              </h4>
              <ul className="text-sm text-yellow-700 space-y-1">
                <li>• Solo se permiten productos de categoría "Ferretería"</li>
                <li>• Todos los campos obligatorios deben estar presentes</li>
                <li>• El campo "stockMinimo" debe ser un número positivo</li>
                <li>
                  • El campo "valorCompra" y "valorVenta" deben ser números
                  positivos
                </li>
                <li>• El campo "proveedor" es obligatorio</li>
                <li>• Se agregarán automáticamente las fechas de creación</li>
                <li>• La unidad de medida se establecerá automáticamente</li>
                <li>• El archivo debe tener encabezados en la primera fila</li>
                <li>• Los campos numéricos se convertirán automáticamente</li>
                <li>• Se ignorarán las filas vacías</li>
                <li>• Guarda tu archivo Excel como CSV antes de subirlo</li>
                <li>
                  • Asegúrate de que las columnas coincidan con el formato
                  esperado
                </li>
              </ul>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpenBulkFerreteria(false)}
              disabled={bulkLoadingFerreteria}
            >
              Cancelar
            </Button>
            <Button
              variant="default"
              onClick={handleBulkUploadFerreteria}
              disabled={bulkLoadingFerreteria || !bulkFileFerreteria}
            >
              {bulkLoadingFerreteria ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Procesando...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Cargar Productos
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProductosPage;
