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
import { Boxes, Plus, Loader2, CheckCircle, AlertCircle, Upload, FileSpreadsheet } from "lucide-react";
import { db } from "@/lib/firebase";
import {
  collection,
  addDoc,
  serverTimestamp,
  onSnapshot,
  query,
  orderBy,
} from "firebase/firestore";
import { useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";

const categorias = ["Maderas", "Ferretería"];

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
  const [filtro, setFiltro] = useState("");
  const [cat, setCat] = useState("");
  const [reload, setReload] = useState(false);
  const [productos, setProductos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Estados para carga masiva
  const [bulkJson, setBulkJson] = useState("");
  const [bulkStatus, setBulkStatus] = useState(null);
  const [bulkMessage, setBulkMessage] = useState("");
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0 });
  const [bulkFile, setBulkFile] = useState(null);
  const [uploadMethod, setUploadMethod] = useState("json"); // "json" | "excel"

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
          if (file.name.toLowerCase().endsWith('.csv')) {
            const lines = content.split('\n');
            console.log("Líneas CSV encontradas:", lines.length);
            
            if (lines.length < 2) {
              reject(new Error('El archivo CSV debe tener al menos una fila de encabezados y una fila de datos'));
              return;
            }
            
            const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
            console.log("Encabezados detectados:", headers);
            
            const productos = [];
            for (let i = 1; i < lines.length; i++) {
              if (lines[i].trim()) {
                const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
                const producto = {};
                
                headers.forEach((header, index) => {
                  let value = values[index] || '';
                  
                  // Convertir valores numéricos
                  if (['costo', 'largo', 'ancho', 'alto', 'precioPorPie'].includes(header)) {
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
            reject(new Error('Los archivos Excel (.xlsx, .xls) no están soportados aún. Por favor, guarda tu archivo como CSV y súbelo nuevamente.'));
          }
        } catch (error) {
          console.error("Error procesando archivo:", error);
          reject(error);
        }
      };
      
      reader.onerror = () => {
        console.error("Error al leer el archivo");
        reject(new Error('Error al leer el archivo'));
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

      if (uploadMethod === "excel") {
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
      } else {
        // Procesar JSON
        try {
          productosData = JSON.parse(bulkJson);
        } catch (e) {
          setBulkStatus("error");
          setBulkMessage("JSON inválido. Verifica el formato.");
          setBulkLoading(false);
          return;
        }

        // Validar que sea un array
        if (!Array.isArray(productosData)) {
          setBulkStatus("error");
          setBulkMessage("El JSON debe ser un array de productos.");
          setBulkLoading(false);
          return;
        }
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
            error: "Faltan campos obligatorios (código, nombre, categoría)"
          });
          continue;
        }

        // Validar que sea de categoría Maderas
        if (producto.categoria !== "Maderas") {
          productosInvalidos.push({
            index: i + 1,
            codigo: producto.codigo,
            error: "Solo se permiten productos de categoría 'Maderas'"
          });
          continue;
        }

        // Validar campos específicos de maderas
        if (!producto.tipoMadera || !producto.largo || !producto.ancho || !producto.alto) {
          productosInvalidos.push({
            index: i + 1,
            codigo: producto.codigo,
            error: "Faltan campos específicos de maderas (tipoMadera, largo, ancho, alto)"
          });
          continue;
        }

        // Validar que precioPorPie no sea null
        if (producto.precioPorPie === null || producto.precioPorPie === undefined || producto.precioPorPie === 0) {
          productosInvalidos.push({
            index: i + 1,
            codigo: producto.codigo,
            error: "precioPorPie no puede ser null o 0"
          });
          continue;
        }

        productosValidos.push({
          ...producto,
          fechaCreacion: new Date().toISOString(),
          fechaActualizacion: new Date().toISOString(),
          // Asegurar que unidadMedida sea "pie" para maderas
          unidadMedida: "pie"
        });
      }

      // Mostrar errores si hay productos inválidos
      if (productosInvalidos.length > 0) {
        setBulkStatus("error");
        setBulkMessage(`Se encontraron ${productosInvalidos.length} productos con errores. Revisa los datos.`);
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
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (e) {
          setBulkStatus("error");
          setBulkMessage(`Error al guardar producto ${producto.codigo}: ${e.message}`);
          setBulkLoading(false);
          return;
        }
      }

      setBulkStatus("success");
      setBulkMessage(`Se cargaron exitosamente ${productosValidos.length} productos.`);
      
      // Limpiar formulario y cerrar modal
      setTimeout(() => {
        setOpenBulk(false);
        setBulkJson("");
        setBulkFile(null);
        setBulkStatus(null);
        setBulkMessage("");
        setBulkLoading(false);
        setBulkProgress({ current: 0, total: 0 });
        setReload(r => !r);
      }, 2000);

    } catch (e) {
      setBulkStatus("error");
      setBulkMessage("Error inesperado: " + e.message);
      setBulkLoading(false);
    }
  };

  // Función para descargar CSV de ejemplo
  const downloadExampleCSV = () => {
    const csvContent = `codigo,nombre,descripcion,categoria,subcategoria,estado,costo,tipoMadera,largo,ancho,alto,precioPorPie,ubicacion
1401,TABLAS 1/2 X 6 X 3,,Maderas,Tabla,Activo,420.0,Saligna,3.0,0.5,6.0,700.0,
1402,TABALAS 1" X 4 X 3,,Maderas,Tabla,Activo,353.0,Saligna,3.0,1.0,4.0,700.0,
1403,TABALAS 1" X4 X 4,,Maderas,Tabla,Activo,353.0,Saligna,4.0,1.0,4.0,700.0,`;
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ejemplo_maderas.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="py-8 px-2 max-w-5xl mx-auto">
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead>Unidad</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {productosFiltrados.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>{p.codigo}</TableCell>
                    <TableCell>{p.nombre}</TableCell>
                    <TableCell>{p.categoria}</TableCell>
                    <TableCell>{p.unidadMedida}</TableCell>
                    <TableCell>{p.estado}</TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline">
                        Ver
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
              <div className={`p-3 rounded-lg flex items-center gap-2 text-sm ${
                bulkStatus === 'success' 
                  ? 'bg-green-50 text-green-800 border border-green-200' 
                  : 'bg-red-50 text-red-800 border border-red-200'
              }`}>
                {bulkStatus === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                {bulkMessage}
              </div>
            )}

            {/* Barra de progreso */}
            {bulkLoading && bulkProgress.total > 0 && (
              <div className="bg-blue-50 p-3 rounded-lg">
                <div className="flex justify-between text-sm mb-2">
                  <span>Procesando productos...</span>
                  <span>{bulkProgress.current} / {bulkProgress.total}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${(bulkProgress.current / bulkProgress.total) * 100}%` }}
                  ></div>
                </div>
              </div>
            )}

            {/* Selector de método */}
            <div className="flex gap-2 border-b">
              <button
                type="button"
                onClick={() => setUploadMethod("json")}
                className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                  uploadMethod === "json"
                    ? "bg-blue-100 text-blue-700 border-b-2 border-blue-700"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                📄 JSON
              </button>
              <button
                type="button"
                onClick={() => setUploadMethod("excel")}
                className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                  uploadMethod === "excel"
                    ? "bg-blue-100 text-blue-700 border-b-2 border-blue-700"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                📊 Excel/CSV
              </button>
            </div>

            {/* Contenido según método seleccionado */}
            {uploadMethod === "json" ? (
              <div>
                <label className="font-semibold text-sm mb-2 block">
                  JSON de Productos (Solo Maderas)
                </label>
                <textarea
                  value={bulkJson}
                  onChange={(e) => setBulkJson(e.target.value)}
                  placeholder={`Pega aquí el JSON de productos. Ejemplo:
[
  {
    "codigo": "1401",
    "nombre": "TABLAS 1/2 X 6 X 3",
    "descripcion": "",
    "categoria": "Maderas",
    "subcategoria": "Tabla",
    "estado": "Activo",
    "costo": 420.0,
    "tipoMadera": "Saligna",
    "largo": 3.0,
    "ancho": 0.5,
    "alto": 6.0,
    "precioPorPie": 700.0,
    "ubicacion": ""
  }
]`}
                  className="w-full h-64 p-3 border rounded-lg font-mono text-sm resize-none"
                  disabled={bulkLoading}
                />
              </div>
            ) : (
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
            )}

            <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-200">
              <h4 className="font-semibold text-yellow-800 mb-2">⚠️ Instrucciones:</h4>
              <ul className="text-sm text-yellow-700 space-y-1">
                <li>• Solo se permiten productos de categoría "Maderas"</li>
                <li>• Todos los campos obligatorios deben estar presentes</li>
                <li>• El campo "precioPorPie" no puede ser null o 0</li>
                <li>• Se agregarán automáticamente las fechas de creación</li>
                <li>• La unidad de medida se establecerá automáticamente como "pie"</li>
                {uploadMethod === "excel" && (
                  <>
                    <li>• El archivo debe tener encabezados en la primera fila</li>
                    <li>• Los campos numéricos se convertirán automáticamente</li>
                    <li>• Se ignorarán las filas vacías</li>
                    <li>• Guarda tu archivo Excel como CSV antes de subirlo</li>
                    <li>• Asegúrate de que las columnas coincidan con el formato esperado</li>
                  </>
                )}
              </ul>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenBulk(false)} disabled={bulkLoading}>
              Cancelar
            </Button>
            <Button 
              variant="default" 
              onClick={handleBulkUpload} 
              disabled={bulkLoading || (!bulkJson.trim() && !bulkFile)}
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
    </div>
  );
};

export default ProductosPage;
