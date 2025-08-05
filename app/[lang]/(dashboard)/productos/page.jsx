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
  Download,
  Trash2,
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
  getDocs,
  deleteDoc,
} from "firebase/firestore";
import { useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";
import toast from "react-hot-toast";

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
  estado: yup
    .string()
    .oneOf(["Activo", "Inactivo", "Descontinuado"])
    .required(),
  costo: yup.number().positive().required("El costo es obligatorio"),
};

// Esquema para Maderas
const maderasSchema = yup.object().shape({
  ...baseSchema,
  subcategoria: yup.string().required("La subcategoría es obligatoria"),
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
  codigo: yup.string().required("El código es obligatorio"),
  nombre: yup.string().required("El nombre es obligatorio"),
  descripcion: yup.string().required("La descripción es obligatoria"),
  categoria: yup.string().required("La categoría es obligatoria"),
  subCategoria: yup.string().required("La subcategoría es obligatoria"),
  estado: yup
    .string()
    .oneOf(["Activo", "Inactivo", "Descontinuado"])
    .required(),
  costo: yup.number().positive().required("El costo es obligatorio"),
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
  
  // Estados para agregar nuevos valores
  const [showAddTipoMadera, setShowAddTipoMadera] = useState(false);
  const [showAddSubcategoria, setShowAddSubcategoria] = useState(false);
  const [showAddUnidadMedida, setShowAddUnidadMedida] = useState(false);
  const [showAddProveedor, setShowAddProveedor] = useState(false);
  const [newValue, setNewValue] = useState("");
  
  // Estados para valores precargados
  const [tiposMaderaUnicos, setTiposMaderaUnicos] = useState([]);
  const [subCategoriasUnicas, setSubCategoriasUnicas] = useState([]);
  const [unidadesMedidaUnicas, setUnidadesMedidaUnicas] = useState([]);
  const [proveedoresUnicos, setProveedoresUnicos] = useState([]);
  
  const schema =
    esquemasPorCategoria[categoria] || yup.object().shape(baseSchema);
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
    watch,
  } = useForm({
    resolver: yupResolver(schema),
    defaultValues: { estado: "Activo" },
  });

  // Cargar datos precargados cuando cambie la categoría
  useEffect(() => {
    if (categoria) {
      cargarDatosPrecargados();
    }
  }, [categoria]);

  const cargarDatosPrecargados = async () => {
    try {
      const productosSnap = await getDocs(collection(db, "productos"));
      const productos = productosSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Filtrar por categoría
      const productosCategoria = productos.filter(p => p.categoria === categoria);
      
      if (categoria === "Maderas") {
        // Para maderas: tipoMadera y subcategoria
        const tiposMadera = [...new Set(productosCategoria.map(p => p.tipoMadera).filter(Boolean))];
        const subCategorias = [...new Set(productosCategoria.map(p => p.subcategoria).filter(Boolean))];
        setTiposMaderaUnicos(tiposMadera);
        setSubCategoriasUnicas(subCategorias);
      } else if (categoria === "Ferretería") {
        // Para ferretería: unidadMedida, subCategoria y proveedor
        const unidadesMedida = [...new Set(productosCategoria.map(p => p.unidadMedida).filter(Boolean))];
        const subCategorias = [...new Set(productosCategoria.map(p => p.subCategoria).filter(Boolean))];
        const proveedores = [...new Set(productosCategoria.map(p => p.proveedor).filter(Boolean))];
        setUnidadesMedidaUnicas(unidadesMedida);
        setSubCategoriasUnicas(subCategorias);
        setProveedoresUnicos(proveedores);
      }
    } catch (error) {
      console.error("Error al cargar datos precargados:", error);
    }
  };

  const handleAddNewValue = async (tipo, valor) => {
    if (!valor.trim()) return;
    
    try {
      // Agregar el nuevo valor a la lista correspondiente
      switch (tipo) {
        case 'tipoMadera':
          setTiposMaderaUnicos(prev => [...prev, valor.trim()]);
          setValue('tipoMadera', valor.trim());
          break;
        case 'subcategoria':
          setSubCategoriasUnicas(prev => [...prev, valor.trim()]);
          setValue('subcategoria', valor.trim());
          break;
        case 'subCategoria':
          setSubCategoriasUnicas(prev => [...prev, valor.trim()]);
          setValue('subCategoria', valor.trim());
          break;
        case 'unidadMedida':
          setUnidadesMedidaUnicas(prev => [...prev, valor.trim()]);
          setValue('unidadMedida', valor.trim());
          break;
        case 'proveedor':
          setProveedoresUnicos(prev => [...prev, valor.trim()]);
          setValue('proveedor', valor.trim());
          break;
      }
      
      // Cerrar el input de agregar
      setShowAddTipoMadera(false);
      setShowAddSubcategoria(false);
      setShowAddUnidadMedida(false);
      setShowAddProveedor(false);
      setNewValue("");
    } catch (error) {
      console.error("Error al agregar nuevo valor:", error);
    }
  };

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
          className={`mb-4 p-3 rounded-lg flex items-center gap-2 text-sm ${
            submitStatus === "success"
              ? "bg-green-50 text-green-800 border border-green-200"
              : "bg-red-50 text-red-800 border border-red-200"
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

      {/* Selector de categoría */}
      <div className="mb-6">
        <label className="block text-sm font-semibold text-gray-700 mb-2">
          Categoría del Producto *
        </label>
        <select
          {...register("categoria")}
          value={categoria}
          onChange={(e) => {
            setCategoria(e.target.value);
            setValue("categoria", e.target.value);
          }}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          disabled={isSubmitting}
        >
          <option value="">Seleccionar categoría</option>
          {categorias.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        {errors.categoria && (
          <span className="text-red-500 text-xs mt-1 block">
            {errors.categoria.message}
          </span>
        )}
      </div>

      {/* Solo mostrar el resto del formulario si hay categoría seleccionada */}
      {categoria && (
        <div className="flex-1 overflow-y-auto pr-2" style={{ maxHeight: "70vh" }}>
          
          {/* Sección: Información Básica */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
              <h3 className="text-lg font-semibold text-gray-800">Información Básica</h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Código del Producto *
                </label>
                <Input
                  {...register("codigo")}
                  placeholder="Ej: 1401"
                  disabled={isSubmitting}
                  className="w-full"
                />
                {errors.codigo && (
                  <span className="text-red-500 text-xs mt-1 block">
                    {errors.codigo.message}
                  </span>
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nombre del Producto *
                </label>
                <Input
                  {...register("nombre")}
                  placeholder="Ej: TABLAS 1/2 X 6 X 3"
                  disabled={isSubmitting}
                  className="w-full"
                />
                {errors.nombre && (
                  <span className="text-red-500 text-xs mt-1 block">
                    {errors.nombre.message}
                  </span>
                )}
              </div>
              
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Descripción *
                </label>
                <textarea
                  {...register("descripcion")}
                  placeholder="Descripción detallada del producto"
                  disabled={isSubmitting}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                />
                {errors.descripcion && (
                  <span className="text-red-500 text-xs mt-1 block">
                    {errors.descripcion.message}
                  </span>
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Estado *
                </label>
                <select
                  {...register("estado")}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  disabled={isSubmitting}
                >
                  <option value="Activo">Activo</option>
                  <option value="Inactivo">Inactivo</option>
                  <option value="Descontinuado">Descontinuado</option>
                </select>
                {errors.estado && (
                  <span className="text-red-500 text-xs mt-1 block">
                    {errors.estado.message}
                  </span>
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Costo Unitario *
                </label>
                <Input
                  {...register("costo")}
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  disabled={isSubmitting}
                  className="w-full"
                />
                {errors.costo && (
                  <span className="text-red-500 text-xs mt-1 block">
                    {errors.costo.message}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Sección: Campos Específicos por Categoría */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-4">
              <div className={`w-2 h-2 rounded-full ${categoria === "Maderas" ? "bg-orange-500" : "bg-blue-500"}`}></div>
              <h3 className="text-lg font-semibold text-gray-800">
                {categoria === "Maderas" ? "Especificaciones de Madera" : "Especificaciones de Ferretería"}
              </h3>
            </div>
            
            {categoria === "Maderas" ? (
              // Campos específicos para Maderas
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tipo de Madera *
                  </label>
                  <div className="flex gap-2">
                    <select
                      {...register("tipoMadera")}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      disabled={isSubmitting}
                    >
                      <option value="">Seleccionar tipo</option>
                      {tiposMaderaUnicos.map((tipo) => (
                        <option key={tipo} value={tipo}>{tipo}</option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowAddTipoMadera(true)}
                      className="px-3"
                      disabled={isSubmitting}
                    >
                      +
                    </Button>
                  </div>
                  {showAddTipoMadera && (
                    <div className="flex gap-2 mt-2">
                      <Input
                        value={newValue}
                        onChange={(e) => setNewValue(e.target.value)}
                        placeholder="Nuevo tipo de madera"
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handleAddNewValue('tipoMadera', newValue)}
                        disabled={isSubmitting}
                      >
                        Agregar
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setShowAddTipoMadera(false);
                          setNewValue("");
                        }}
                        disabled={isSubmitting}
                      >
                        Cancelar
                      </Button>
                    </div>
                  )}
                  {errors.tipoMadera && (
                    <span className="text-red-500 text-xs mt-1 block">
                      {errors.tipoMadera.message}
                    </span>
                  )}
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Subcategoría *
                  </label>
                  <div className="flex gap-2">
                    <select
                      {...register("subcategoria")}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      disabled={isSubmitting}
                    >
                      <option value="">Seleccionar subcategoría</option>
                      {subCategoriasUnicas.map((subCategoria) => (
                        <option key={subCategoria} value={subCategoria}>
                          {subCategoria}
                        </option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowAddSubcategoria(true)}
                      className="px-3"
                      disabled={isSubmitting}
                    >
                      +
                    </Button>
                  </div>
                  {showAddSubcategoria && (
                    <div className="flex gap-2 mt-2">
                      <Input
                        value={newValue}
                        onChange={(e) => setNewValue(e.target.value)}
                        placeholder="Nueva subcategoría"
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handleAddNewValue('subcategoria', newValue)}
                        disabled={isSubmitting}
                      >
                        Agregar
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setShowAddSubcategoria(false);
                          setNewValue("");
                        }}
                        disabled={isSubmitting}
                      >
                        Cancelar
                      </Button>
                    </div>
                  )}
                  {errors.subcategoria && (
                    <span className="text-red-500 text-xs mt-1 block">
                      {errors.subcategoria.message}
                    </span>
                  )}
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Largo (metros) *
                  </label>
                  <Input
                    {...register("largo")}
                    type="number"
                    step="0.01"
                    placeholder="3.0"
                    disabled={isSubmitting}
                    className="w-full"
                  />
                  {errors.largo && (
                    <span className="text-red-500 text-xs mt-1 block">
                      {errors.largo.message}
                    </span>
                  )}
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Ancho (centímetros) *
                  </label>
                  <Input
                    {...register("ancho")}
                    type="number"
                    step="0.01"
                    placeholder="50"
                    disabled={isSubmitting}
                    className="w-full"
                  />
                  {errors.ancho && (
                    <span className="text-red-500 text-xs mt-1 block">
                      {errors.ancho.message}
                    </span>
                  )}
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Alto (centímetros) *
                  </label>
                  <Input
                    {...register("alto")}
                    type="number"
                    step="0.01"
                    placeholder="6.0"
                    disabled={isSubmitting}
                    className="w-full"
                  />
                  {errors.alto && (
                    <span className="text-red-500 text-xs mt-1 block">
                      {errors.alto.message}
                    </span>
                  )}
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Precio por Pie *
                  </label>
                  <Input
                    {...register("precioPorPie")}
                    type="number"
                    step="0.01"
                    placeholder="700.00"
                    disabled={isSubmitting}
                    className="w-full"
                  />
                  {errors.precioPorPie && (
                    <span className="text-red-500 text-xs mt-1 block">
                      {errors.precioPorPie.message}
                    </span>
                  )}
                </div>
                
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Ubicación en Depósito
                  </label>
                  <Input
                    {...register("ubicacion")}
                    placeholder="Ej: Estante A, Nivel 2"
                    disabled={isSubmitting}
                    className="w-full"
                  />
                </div>
              </div>
            ) : (
              // Campos específicos para Ferretería
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Subcategoría *
                  </label>
                  <div className="flex gap-2">
                    <select
                      {...register("subCategoria")}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      disabled={isSubmitting}
                    >
                      <option value="">Seleccionar subcategoría</option>
                      {subCategoriasUnicas.map((subCategoria) => (
                        <option key={subCategoria} value={subCategoria}>
                          {subCategoria}
                        </option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowAddSubcategoria(true)}
                      className="px-3"
                      disabled={isSubmitting}
                    >
                      +
                    </Button>
                  </div>
                  {showAddSubcategoria && (
                    <div className="flex gap-2 mt-2">
                      <Input
                        value={newValue}
                        onChange={(e) => setNewValue(e.target.value)}
                        placeholder="Nueva subcategoría"
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handleAddNewValue('subCategoria', newValue)}
                        disabled={isSubmitting}
                      >
                        Agregar
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setShowAddSubcategoria(false);
                          setNewValue("");
                        }}
                        disabled={isSubmitting}
                      >
                        Cancelar
                      </Button>
                    </div>
                  )}
                  {errors.subCategoria && (
                    <span className="text-red-500 text-xs mt-1 block">
                      {errors.subCategoria.message}
                    </span>
                  )}
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Proveedor *
                  </label>
                  <div className="flex gap-2">
                    <select
                      {...register("proveedor")}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      disabled={isSubmitting}
                    >
                      <option value="">Seleccionar proveedor</option>
                      {proveedoresUnicos.map((proveedor) => (
                        <option key={proveedor} value={proveedor}>
                          {proveedor}
                        </option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowAddProveedor(true)}
                      className="px-3"
                      disabled={isSubmitting}
                    >
                      +
                    </Button>
                  </div>
                  {showAddProveedor && (
                    <div className="flex gap-2 mt-2">
                      <Input
                        value={newValue}
                        onChange={(e) => setNewValue(e.target.value)}
                        placeholder="Nuevo proveedor"
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handleAddNewValue('proveedor', newValue)}
                        disabled={isSubmitting}
                      >
                        Agregar
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setShowAddProveedor(false);
                          setNewValue("");
                        }}
                        disabled={isSubmitting}
                      >
                        Cancelar
                      </Button>
                    </div>
                  )}
                  {errors.proveedor && (
                    <span className="text-red-500 text-xs mt-1 block">
                      {errors.proveedor.message}
                    </span>
                  )}
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Unidad de Medida *
                  </label>
                  <div className="flex gap-2">
                    <select
                      {...register("unidadMedida")}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      disabled={isSubmitting}
                    >
                      <option value="">Seleccionar unidad</option>
                      {unidadesMedidaUnicas.map((unidad) => (
                        <option key={unidad} value={unidad}>
                          {unidad}
                        </option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowAddUnidadMedida(true)}
                      className="px-3"
                      disabled={isSubmitting}
                    >
                      +
                    </Button>
                  </div>
                  {showAddUnidadMedida && (
                    <div className="flex gap-2 mt-2">
                      <Input
                        value={newValue}
                        onChange={(e) => setNewValue(e.target.value)}
                        placeholder="Nueva unidad de medida"
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handleAddNewValue('unidadMedida', newValue)}
                        disabled={isSubmitting}
                      >
                        Agregar
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setShowAddUnidadMedida(false);
                          setNewValue("");
                        }}
                        disabled={isSubmitting}
                      >
                        Cancelar
                      </Button>
                    </div>
                  )}
                  {errors.unidadMedida && (
                    <span className="text-red-500 text-xs mt-1 block">
                      {errors.unidadMedida.message}
                    </span>
                  )}
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Stock Mínimo *
                  </label>
                  <Input
                    {...register("stockMinimo")}
                    type="number"
                    step="1"
                    placeholder="1"
                    disabled={isSubmitting}
                    className="w-full"
                  />
                  {errors.stockMinimo && (
                    <span className="text-red-500 text-xs mt-1 block">
                      {errors.stockMinimo.message}
                    </span>
                  )}
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Valor de Compra *
                  </label>
                  <Input
                    {...register("valorCompra")}
                    type="number"
                    step="0.01"
                    placeholder="859.00"
                    disabled={isSubmitting}
                    className="w-full"
                  />
                  {errors.valorCompra && (
                    <span className="text-red-500 text-xs mt-1 block">
                      {errors.valorCompra.message}
                    </span>
                  )}
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Valor de Venta *
                  </label>
                  <Input
                    {...register("valorVenta")}
                    type="number"
                    step="0.01"
                    placeholder="1700.00"
                    disabled={isSubmitting}
                    className="w-full"
                  />
                  {errors.valorVenta && (
                    <span className="text-red-500 text-xs mt-1 block">
                      {errors.valorVenta.message}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Botones de acción */}
      <div className="flex gap-3 pt-4 border-t border-gray-200">
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          disabled={isSubmitting}
          className="flex-1"
        >
          Cancelar
        </Button>
        <Button
          type="submit"
          disabled={isSubmitting || !categoria}
          className="flex-1 bg-blue-600 hover:bg-blue-700"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Guardando...
            </>
          ) : (
            <>
              <Plus className="w-4 h-4 mr-2" />
              Crear Producto
            </>
          )}
        </Button>
      </div>
    </form>
  );
}

const ProductosPage = () => {
  const [open, setOpen] = useState(false);
  const [openBulk, setOpenBulk] = useState(false);
  const [openBulkFerreteria, setOpenBulkFerreteria] = useState(false);
  const [filtro, setFiltro] = useState("");
  const [cat, setCat] = useState("");
  const [filtroTipoMadera, setFiltroTipoMadera] = useState("");
  const [filtroSubCategoria, setFiltroSubCategoria] = useState("");
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editProduct, setEditProduct] = useState(null);
  const [editForm, setEditForm] = useState({
    nombre: "",
    descripcion: "",
    proveedor: "",
    unidadMedida: "",
    estado: "",
    subcategoria: "",
    subCategoria: "",
    tipoMadera: "",
  });
  const [editLoading, setEditLoading] = useState(false);
  const [editMessage, setEditMessage] = useState("");
  const [reload, setReload] = useState(false);
  const [productos, setProductos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Estados para datos precargados de Firebase
  const [proveedores, setProveedores] = useState([]);
  const [subcategorias, setSubcategorias] = useState([]);
  const [subCategoriasFerreteria, setSubCategoriasFerreteria] = useState([]);
  const [tiposMadera, setTiposMadera] = useState([]);
  const [unidadesMedida, setUnidadesMedida] = useState([]);

  // Estados para agregar nuevos valores
  const [showAddProveedor, setShowAddProveedor] = useState(false);
  const [showAddSubcategoria, setShowAddSubcategoria] = useState(false);
  const [showAddSubcategoriaFerreteria, setShowAddSubcategoriaFerreteria] = useState(false);
  const [showAddTipoMadera, setShowAddTipoMadera] = useState(false);
  const [showAddUnidadMedida, setShowAddUnidadMedida] = useState(false);
  const [newValue, setNewValue] = useState("");

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

  // Estados para selección y eliminación de productos
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [selectAll, setSelectAll] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Mantener sincronizado el estado del checkbox "Seleccionar todo"
  useEffect(() => {
    const allProductIds = productosFiltrados.map(p => p.id);
    const allSelected = allProductIds.length > 0 && allProductIds.every(id => selectedProducts.includes(id));
    setSelectAll(allSelected);
  }, [selectedProducts, productosFiltrados]);

  // Función para cargar datos precargados de Firebase
  const cargarDatosPrecargados = () => {
    // Extraer proveedores únicos
    const proveedoresUnicos = [...new Set(
      productos
        .filter(p => p.proveedor)
        .map(p => p.proveedor)
    )].sort();
    setProveedores(proveedoresUnicos);

    // Extraer subcategorías de maderas (subcategoria)
    const subcategoriasMaderas = [...new Set(
      productos
        .filter(p => p.categoria === "Maderas" && p.subcategoria)
        .map(p => p.subcategoria)
    )].sort();
    setSubcategorias(subcategoriasMaderas);

    // Extraer subcategorías de ferretería (subCategoria)
    const subcategoriasFerreteria = [
      ...new Set(
        productos
          .filter((p) => p.categoria === "Ferretería" && p.subCategoria)
          .map((p) => p.subCategoria)
      ),
    ].filter(Boolean);
    setSubCategoriasFerreteria(subcategoriasFerreteria);

    // Extraer tipos de madera únicos
    const tiposMaderaUnicos = [...new Set(
      productos
        .filter(p => p.tipoMadera)
        .map(p => p.tipoMadera)
    )].sort();
    setTiposMadera(tiposMaderaUnicos);

    // Extraer unidades de medida únicas
    const unidadesMedidaUnicas = [...new Set(
      productos
        .filter(p => p.unidadMedida)
        .map(p => p.unidadMedida)
    )].sort();
    setUnidadesMedida(unidadesMedidaUnicas);
  };

  // Funciones para agregar nuevos valores
  const handleAddNewValue = (tipo, valor) => {
    if (!valor.trim()) return;
    
    switch (tipo) {
      case 'proveedor':
        if (!proveedores.includes(valor)) {
          setProveedores(prev => [...prev, valor].sort());
        }
        setEditForm(prev => ({ ...prev, proveedor: valor }));
        setShowAddProveedor(false);
        break;
      case 'subcategoria':
        setSubCategoriasUnicas(prev => [...prev, valor.trim()]);
        setValue('subcategoria', valor.trim());
        break;
      case 'subCategoria':
        setSubCategoriasUnicas(prev => [...prev, valor.trim()]);
        setValue('subCategoria', valor.trim());
        break;
      case 'unidadMedida':
        setUnidadesMedidaUnicas(prev => [...prev, valor.trim()]);
        setValue('unidadMedida', valor.trim());
        break;
      case 'proveedor':
        setProveedoresUnicos(prev => [...prev, valor.trim()]);
        setValue('proveedor', valor.trim());
        break;
    }
    setNewValue("");
  };

  // Funciones para edición de productos
  const handleEditProduct = (producto) => {
    setEditProduct(producto);
    setEditForm({
      nombre: producto.nombre || "",
      descripcion: producto.descripcion || "",
      proveedor: producto.proveedor || "",
      unidadMedida: producto.unidadMedida || "",
      estado: producto.estado || "Activo",
      subcategoria: producto.subcategoria || "",
      subCategoria: producto.subCategoria || "",
      tipoMadera: producto.tipoMadera || "",
    });
    setEditMessage("");
    setEditModalOpen(true);
    
    // Cargar datos precargados cuando se abre el modal
    cargarDatosPrecargados();
  };

  const handleSaveEdit = async () => {
    setEditLoading(true);
    setEditMessage("");
    
    try {
      // Validación de campos obligatorios
      const camposObligatorios = ['nombre', 'descripcion', 'unidadMedida', 'estado'];
      
      // Agregar campos específicos según categoría
      if (editProduct.categoria === "Ferretería") {
        camposObligatorios.push('subCategoria', 'proveedor');
      } else if (editProduct.categoria === "Maderas") {
        camposObligatorios.push('subcategoria', 'tipoMadera');
      }
      
      // Verificar campos vacíos
      const camposVacios = camposObligatorios.filter(campo => !editForm[campo]);
      
      if (camposVacios.length > 0) {
        setEditMessage(`Error: Los siguientes campos son obligatorios: ${camposVacios.join(', ')}`);
        setEditLoading(false);
        return;
      }
      
      const productoRef = doc(db, "productos", editProduct.id);
      const updates = {};
      
      // Solo actualizar campos que han cambiado
      if (editForm.nombre !== editProduct.nombre) {
        updates.nombre = editForm.nombre;
      }
      if (editForm.descripcion !== editProduct.descripcion) {
        updates.descripcion = editForm.descripcion;
      }
      if (editForm.proveedor !== editProduct.proveedor) {
        updates.proveedor = editForm.proveedor;
      }
      if (editForm.unidadMedida !== editProduct.unidadMedida) {
        updates.unidadMedida = editForm.unidadMedida;
      }
      if (editForm.estado !== editProduct.estado) {
        updates.estado = editForm.estado;
      }
      
      // Actualizar subcategoría según la categoría del producto
      if (editProduct.categoria === "Ferretería") {
        if (editForm.subCategoria !== editProduct.subCategoria) {
          updates.subCategoria = editForm.subCategoria;
        }
      } else {
        if (editForm.subcategoria !== editProduct.subcategoria) {
          updates.subcategoria = editForm.subcategoria;
        }
      }
      
      if (editForm.tipoMadera !== editProduct.tipoMadera) {
        updates.tipoMadera = editForm.tipoMadera;
      }
      
      updates.fechaActualizacion = new Date().toISOString();

      await updateDoc(productoRef, updates);
      
      setEditMessage("Producto actualizado correctamente");
      setTimeout(() => {
        setEditModalOpen(false);
        setEditProduct(null);
        setEditForm({ 
          nombre: "", 
          descripcion: "", 
          proveedor: "", 
          unidadMedida: "", 
          estado: "", 
          subcategoria: "", 
          tipoMadera: "" 
        });
      }, 1500);
    } catch (error) {
      setEditMessage("Error al actualizar: " + error.message);
    } finally {
      setEditLoading(false);
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
        // Cargar datos precargados después de obtener los productos
        cargarDatosPrecargados();
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
    (p) => {
      // Función para normalizar texto (eliminar espacios y convertir a minúsculas)
      const normalizarTexto = (texto) => {
        return texto.toLowerCase().replace(/\s+/g, '');
      };

      // Normalizar el término de búsqueda
      const filtroNormalizado = normalizarTexto(filtro || "");
      
      // Normalizar el nombre del producto
      const nombreNormalizado = normalizarTexto(p.nombre || "");
      
      // Normalizar el código del producto
      const codigoNormalizado = normalizarTexto(p.codigo || "");

      const cumpleCategoria = cat ? p.categoria === cat : true;
      const cumpleFiltro = 
        !filtro || 
        nombreNormalizado.includes(filtroNormalizado) ||
        codigoNormalizado.includes(filtroNormalizado);

      // Filtro específico por tipo de madera
      const cumpleTipoMadera =
        cat !== "Maderas" ||
        filtroTipoMadera === "" ||
        p.tipoMadera === filtroTipoMadera;

      // Filtro específico por subcategoría de ferretería
      const cumpleSubCategoria =
        cat !== "Ferretería" ||
        filtroSubCategoria === "" ||
        p.subCategoria === filtroSubCategoria;

      return cumpleCategoria && cumpleFiltro && cumpleTipoMadera && cumpleSubCategoria;
    }
  );

  // Obtener tipos de madera únicos
  const tiposMaderaUnicos = [
    ...new Set(
      productos
        .filter((p) => p.categoria === "Maderas" && p.tipoMadera)
        .map((p) => p.tipoMadera)
    ),
  ].filter(Boolean);

  // Obtener subcategorías de ferretería únicas para filtros
  const subCategoriasFerreteriaFiltro = [
    ...new Set(
      productos
        .filter((p) => p.categoria === "Ferretería" && p.subCategoria)
        .map((p) => p.subCategoria)
    ),
  ].filter(Boolean);

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
    const headers = [
      "codigo",
      "nombre",
      "descripcion",
      "categoria",
      "subCategoria",
      "unidadMedida",
      "proveedor",
      "stockMinimo",
      "valorCompra",
      "valorVenta",
      "estado",
    ];
    const csvContent =
      "data:text/csv;charset=utf-8," +
      headers.join(",") +
      "\n" +
      "1001,TUERCA CUPLA 1/2,TUERCA CUPLA 1/2,Ferretería,Herrajes,Unidad,Global,1,859,1700,Activo";

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `plantilla_carga_masiva_ferreteria_${new Date()
        .toISOString()
        .split("T")[0]}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Función para exportar maderas a CSV
  const exportarMaderasCSV = () => {
    const maderas = productos.filter(p => p.categoria === "Maderas");
    
    if (maderas.length === 0) {
      alert("No hay productos de maderas para exportar");
      return;
    }

    const headers = [
      "codigo",
      "nombre", 
      "descripcion",
      "categoria",
      "subcategoria",
      "tipoMadera",
      "unidadMedida",
      "alto",
      "ancho", 
      "largo",
      "precioPorPie",
      "stock",
      "estado",
      "ubicacion"
    ];

    const csvRows = [headers.join(",")];
    
    maderas.forEach(producto => {
      const row = [
        producto.codigo || "",
        producto.nombre || "",
        producto.descripcion || "",
        producto.categoria || "Maderas",
        producto.subcategoria || "",
        producto.tipoMadera || "",
        producto.unidadMedida || "pie",
        producto.alto || "",
        producto.ancho || "",
        producto.largo || "",
        producto.precioPorPie || "",
        producto.stock || "",
        producto.estado || "Activo",
        producto.ubicacion || ""
      ].map(field => `"${field}"`).join(",");
      
      csvRows.push(row);
    });

    const csvContent = "data:text/csv;charset=utf-8," + csvRows.join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `exportacion_maderas_${new Date().toISOString().split("T")[0]}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Función para exportar ferretería a CSV
  const exportarFerreteriaCSV = () => {
    const ferreteria = productos.filter(p => p.categoria === "Ferretería");
    
    if (ferreteria.length === 0) {
      alert("No hay productos de ferretería para exportar");
      return;
    }

    const headers = [
      "codigo",
      "nombre",
      "descripcion", 
      "categoria",
      "subCategoria",
      "unidadMedida",
      "proveedor",
      "stockMinimo",
      "valorCompra",
      "valorVenta",
      "stock",
      "estado"
    ];

    const csvRows = [headers.join(",")];
    
    ferreteria.forEach(producto => {
      const row = [
        producto.codigo || "",
        producto.nombre || "",
        producto.descripcion || "",
        producto.categoria || "Ferretería",
        producto.subCategoria || "",
        producto.unidadMedida || "",
        producto.proveedor || "",
        producto.stockMinimo || "",
        producto.valorCompra || "",
        producto.valorVenta || "",
        producto.stock || "",
        producto.estado || "Activo"
      ].map(field => `"${field}"`).join(",");
      
      csvRows.push(row);
    });

    const csvContent = "data:text/csv;charset=utf-8," + csvRows.join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `exportacion_ferreteria_${new Date().toISOString().split("T")[0]}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Función para exportar todos los productos a CSV
  const exportarTodosCSV = () => {
    if (productos.length === 0) {
      alert("No hay productos para exportar");
      return;
    }

    const headers = [
      "codigo",
      "nombre",
      "descripcion",
      "categoria",
      "subcategoria",
      "subCategoria",
      "tipoMadera",
      "unidadMedida",
      "proveedor",
      "alto",
      "ancho",
      "largo",
      "precioPorPie",
      "stockMinimo",
      "valorCompra",
      "valorVenta",
      "stock",
      "estado",
      "ubicacion"
    ];

    const csvRows = [headers.join(",")];
    
    productos.forEach(producto => {
      const row = [
        producto.codigo || "",
        producto.nombre || "",
        producto.descripcion || "",
        producto.categoria || "",
        producto.subcategoria || "",
        producto.subCategoria || "",
        producto.tipoMadera || "",
        producto.unidadMedida || "",
        producto.proveedor || "",
        producto.alto || "",
        producto.ancho || "",
        producto.largo || "",
        producto.precioPorPie || "",
        producto.stockMinimo || "",
        producto.valorCompra || "",
        producto.valorVenta || "",
        producto.stock || "",
        producto.estado || "Activo",
        producto.ubicacion || ""
      ].map(field => `"${field}"`).join(",");
      
      csvRows.push(row);
    });

    const csvContent = "data:text/csv;charset=utf-8," + csvRows.join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `exportacion_todos_productos_${new Date().toISOString().split("T")[0]}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Función para manejar cambios en productos
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

  // Funciones para selección y eliminación de productos
  const handleSelectProduct = (productId) => {
    setSelectedProducts(prev => {
      if (prev.includes(productId)) {
        return prev.filter(id => id !== productId);
      } else {
        return [...prev, productId];
      }
    });
  };

  const handleSelectAll = () => {
    if (selectAll) {
      setSelectedProducts([]);
      setSelectAll(false);
    } else {
      const allProductIds = productosFiltrados.map(p => p.id);
      setSelectedProducts(allProductIds);
      setSelectAll(true);
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedProducts.length === 0) return;
    
    setDeleteLoading(true);
    try {
      // Eliminar productos de Firebase
      const deletePromises = selectedProducts.map(async (productId) => {
        const productRef = doc(db, "productos", productId);
        await deleteDoc(productRef);
      });
      
      await Promise.all(deletePromises);
      
      // Actualizar la lista de productos
      setProductos(prev => prev.filter(p => !selectedProducts.includes(p.id)));
      setSelectedProducts([]);
      setSelectAll(false);
      setShowDeleteConfirm(false);
      
      toast.success(`${selectedProducts.length} producto(s) eliminado(s) correctamente`);
    } catch (error) {
      console.error("Error al eliminar productos:", error);
      toast.error("Error al eliminar productos: " + error.message);
    } finally {
      setDeleteLoading(false);
    }
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
        <CardHeader className="flex flex-col gap-4">
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
            <CardTitle>Listado de Productos</CardTitle>
            <div className="flex flex-col md:flex-row gap-3 w-full md:w-auto">
              <select
                value={cat}
                onChange={(e) => {
                  setCat(e.target.value);
                  // Limpiar filtros específicos al cambiar categoría
                  setFiltroTipoMadera("");
                  setFiltroSubCategoria("");
                }}
                className="w-full md:w-48 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Todas las categorías</option>
                {categorias.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <Input
                placeholder="Buscar producto..."
                value={filtro}
                onChange={(e) => setFiltro(e.target.value)}
                className="w-full md:w-64"
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
              <Button
                variant="outline"
                onClick={exportarMaderasCSV}
                className="bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100"
              >
                <Download className="w-4 h-4 mr-1" />
                Exportar TODAS las Maderas
              </Button>
              <Button
                variant="outline"
                onClick={exportarFerreteriaCSV}
                className="bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
              >
                <Download className="w-4 h-4 mr-1" />
                Exportar TODA la Ferretería
              </Button>
              <Button
                variant="outline"
                onClick={exportarTodosCSV}
                className="bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
              >
                <Download className="w-4 h-4 mr-1" />
                Exportar TODOS los Productos
              </Button>
              {selectedProducts.length > 0 && (
                <Button
                  variant="destructive"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
                >
                  <Trash2 className="w-4 h-4 mr-1" />
                  Eliminar ({selectedProducts.length})
                </Button>
              )}
            </div>
          </div>

          {/* Filtros específicos por categoría */}
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Filtro de tipo de madera */}
            {cat === "Maderas" && tiposMaderaUnicos.length > 0 && (
              <div className="flex-1">
                <div className="flex bg-white rounded-lg p-1 shadow-sm border border-gray-200">
                  <button
                    type="button"
                    className={`rounded-full px-4 py-1 text-sm flex items-center gap-2 transition-all ${
                      filtroTipoMadera === ""
                        ? "bg-orange-600 text-white"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                    onClick={() => setFiltroTipoMadera("")}
                  >
                    Todos los tipos
                  </button>
                  {tiposMaderaUnicos.map((tipo) => (
                    <button
                      key={tipo}
                      type="button"
                      className={`rounded-md px-4 py-1 text-sm flex items-center gap-2 transition-all ${
                        filtroTipoMadera === tipo
                          ? "bg-orange-600 text-white"
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                      }`}
                      onClick={() => setFiltroTipoMadera(tipo)}
                    >
                      {tipo}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Filtro de subcategoría de ferretería */}
            {cat === "Ferretería" && subCategoriasFerreteriaFiltro.length > 0 && (
              <div className="flex-1">
                <div className="flex bg-white rounded-lg p-1 shadow-sm border border-gray-200">
                  <button
                    type="button"
                    className={`rounded-md px-4 py-1 text-sm flex items-center gap-2 transition-all ${
                      filtroSubCategoria === ""
                        ? "bg-blue-600 text-white"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                    onClick={() => setFiltroSubCategoria("")}
                  >
                    Todas las subcategorías
                  </button>
                  {subCategoriasFerreteriaFiltro.map((subCategoria) => (
                    <button
                      key={subCategoria}
                      type="button"
                      className={`rounded-full px-4 py-1 text-sm flex items-center gap-2 transition-all ${
                        filtroSubCategoria === subCategoria
                          ? "bg-blue-600 text-white"
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                      }`}
                      onClick={() => setFiltroSubCategoria(subCategoria)}
                    >
                      {subCategoria}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Indicador de productos filtrados */}
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600">
              Mostrando {productosFiltrados.length} de {productos.length} productos
              {(filtro || cat || filtroTipoMadera || filtroSubCategoria) && (
                <span className="ml-2 text-blue-600">
                  (filtros aplicados)
                </span>
              )}
            </div>
            {(filtro || cat || filtroTipoMadera || filtroSubCategoria) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setFiltro("");
                  setCat("");
                  setFiltroTipoMadera("");
                  setFiltroSubCategoria("");
                }}
                className="text-xs"
              >
                Limpiar filtros
              </Button>
            )}
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
                      <input
                        type="checkbox"
                        checked={selectAll}
                        onChange={handleSelectAll}
                        className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                      />
                    </th>
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
                      Tipo de Madera
                    </th>
                    <th className="h-14 px-4 ltr:text-left rtl:text-right last:ltr:text-right last:rtl:text-left align-middle font-semibold text-sm text-default-800 capitalize [&:has([role=checkbox])]:ltr:pr-0 [&:has([role=checkbox])]:rtl:pl-0">
                      Subcategoría
                    </th>
                    <th className="h-14 px-4 ltr:text-left rtl:text-right last:ltr:text-right last:rtl:text-left align-middle font-semibold text-sm text-default-800 capitalize [&:has([role=checkbox])]:ltr:pr-0 [&:has([role=checkbox])]:rtl:pl-0">
                      Unidad Medida
                    </th>
                    <th className="h-14 px-4 ltr:text-left rtl:text-right last:ltr:text-right last:rtl:text-left align-middle font-semibold text-sm text-default-800 capitalize [&:has([role=checkbox])]:ltr:pr-0 [&:has([role=checkbox])]:rtl:pl-0">
                      Proveedor
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
                    <th className="h-14 px-4 ltr:text-left rtl:text-right last:ltr:text-right last:rtl:text-left align-middle font-semibold text-sm text-default-800 capitalize [&:has([role=checkbox])]:ltr:pr-0 [&:has([role=checkbox])]:rtl:pl-0">
                      Acciones
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
                        <input
                          type="checkbox"
                          checked={selectedProducts.includes(p.id)}
                          onChange={() => handleSelectProduct(p.id)}
                          className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                        />
                      </td>
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
                        <div className="font-medium text-orange-700">
                          {p.categoria === "Maderas" ? (p.tipoMadera || "-") : "-"}
                        </div>
                      </td>
                      <td className="p-4 align-middle text-sm text-default-600 last:text-right last:rtl:text-left font-normal [&:has([role=checkbox])]:ltr:pr-0 [&:has([role=checkbox])]:rtl:pl-0">
                        <div className="font-medium text-blue-700">
                          {p.categoria === "Maderas" ? (p.subcategoria || "-") : (p.subCategoria || "-")}
                        </div>
                      </td>
                      <td className="p-4 align-middle text-sm text-default-600 last:text-right last:rtl:text-left font-normal [&:has([role=checkbox])]:ltr:pr-0 [&:has([role=checkbox])]:rtl:pl-0">
                        <div className="font-medium text-gray-700">
                          {p.unidadMedida || "-"}
                        </div>
                      </td>
                      <td className="p-4 align-middle text-sm text-default-600 last:text-right last:rtl:text-left font-normal [&:has([role=checkbox])]:ltr:pr-0 [&:has([role=checkbox])]:rtl:pl-0">
                        <div className="font-medium text-gray-700">
                          {p.proveedor || "-"}
                        </div>
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
                      <td className="p-4 align-middle text-sm text-default-600 last:text-right last:rtl:text-left font-normal [&:has([role=checkbox])]:ltr:pr-0 [&:has([role=checkbox])]:rtl:pl-0">
                        <div className="flex gap-2 justify-center">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleEditProduct(p)}
                            className="bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
                          >
                            <svg
                              className="w-4 h-4"
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
                            Editar
                          </Button>
                        </div>
                      </td>
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
                <p className="text-xs text-gray-400 mt-1">
                  💡 Nota: Este botón descarga un archivo de EJEMPLO con datos de muestra. 
                  Para exportar todos tus productos, usa los botones "Exportar" en la página principal.
                </p>
                <button
                  type="button"
                  onClick={downloadExampleCSV}
                  className="mt-4 text-sm text-blue-600 hover:text-blue-800 underline"
                >
                  📥 Descargar archivo de EJEMPLO CSV (solo datos de muestra)
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
                <p className="text-xs text-gray-400 mt-1">
                  💡 Nota: Este botón descarga un archivo de EJEMPLO con datos de muestra. 
                  Para exportar todos tus productos, usa los botones "Exportar" en la página principal.
                </p>
                <button
                  type="button"
                  onClick={downloadExampleCSVFerreteria}
                  className="mt-4 text-sm text-blue-600 hover:text-blue-800 underline"
                >
                  📥 Descargar archivo de EJEMPLO CSV (solo datos de muestra)
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

      {/* Modal de Edición de Producto */}
      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent className="w-[95vw] max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <svg
                className="w-5 h-5"
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
              Editar Producto
            </DialogTitle>
          </DialogHeader>
          
          {editProduct && (
            <div className="flex flex-col gap-6 py-4">
              {/* Información del producto */}
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-lg border border-blue-200">
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    editProduct.categoria === "Maderas" 
                      ? "bg-orange-100 text-orange-600" 
                      : "bg-blue-100 text-blue-600"
                  }`}>
                    {editProduct.categoria === "Maderas" ? "🌲" : "🔧"}
                  </div>
                  <div>
                    <div className="font-bold text-lg text-gray-900">
                      {editProduct.codigo}
                    </div>
                    <div className="text-sm text-gray-600">
                      Categoría: {editProduct.categoria}
                    </div>
                  </div>
                </div>
                <div className="text-sm text-gray-700">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <span className="font-medium">Stock:</span> 
                      <span className={`ml-1 font-bold ${
                        editProduct.stock > 10 ? "text-green-600" : 
                        editProduct.stock > 0 ? "text-yellow-600" : "text-red-600"
                      }`}>
                        {editProduct.stock || 0}
                      </span>
                    </div>
                    <div>
                      <span className="font-medium">Estado:</span> 
                      <span className={`ml-1 px-2 py-1 rounded-full text-xs font-semibold ${
                        editProduct.estado === "Activo" ? "bg-green-100 text-green-800" :
                        editProduct.estado === "Inactivo" ? "bg-yellow-100 text-yellow-800" :
                        "bg-red-100 text-red-800"
                      }`}>
                        {editProduct.estado}
                      </span>
                    </div>
                    <div>
                      <span className="font-medium">Unidad:</span> 
                      <span className="ml-1 font-semibold">
                        {editProduct.unidadMedida || "No definida"}
                      </span>
                    </div>
                  </div>
                  {/* Información específica por categoría */}
                  {editProduct.categoria === "Maderas" && (
                    <div className="mt-2 pt-2 border-t border-blue-200">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <span className="font-medium">Tipo de Madera:</span> 
                          <span className="ml-1 font-semibold text-orange-600">
                            {editProduct.tipoMadera || "No definido"}
                          </span>
                        </div>
                        <div>
                          <span className="font-medium">Subcategoría:</span> 
                          <span className="ml-1 font-semibold">
                            {editProduct.subcategoria || "No definida"}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                  {editProduct.categoria === "Ferretería" && (
                    <div className="mt-2 pt-2 border-t border-blue-200">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <span className="font-medium">Subcategoría:</span> 
                          <span className="ml-1 font-semibold text-blue-600">
                            {editProduct.subCategoria || "No definida"}
                          </span>
                        </div>
                        <div>
                          <span className="font-medium">Proveedor:</span> 
                          <span className="ml-1 font-semibold">
                            {editProduct.proveedor || "No definido"}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Formulario de edición */}
              <div className="space-y-4">
                {/* Indicador de campos obligatorios */}
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-sm font-medium text-amber-800">
                      Campos obligatorios marcados con *
                    </span>
                  </div>
                  <div className="text-xs text-amber-700">
                    {editProduct.categoria === "Maderas" 
                      ? "Para maderas: nombre, descripción, unidad de medida, estado, subcategoría y tipo de madera"
                      : "Para ferretería: nombre, descripción, unidad de medida, estado, subcategoría y proveedor"
                    }
                  </div>
                </div>

                {/* Campos comunes para todas las categorías */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">
                      Nombre del Producto *
                    </label>
                    <Input
                      value={editForm.nombre}
                      onChange={(e) => setEditForm(prev => ({ ...prev, nombre: e.target.value }))}
                      placeholder="Nombre del producto"
                      className="w-full"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">
                      Estado *
                    </label>
                    <select
                      value={editForm.estado}
                      onChange={(e) => setEditForm(prev => ({ ...prev, estado: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="Activo">Activo</option>
                      <option value="Inactivo">Inactivo</option>
                      <option value="Descontinuado">Descontinuado</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    Descripción *
                  </label>
                  <textarea
                    value={editForm.descripcion}
                    onChange={(e) => setEditForm(prev => ({ ...prev, descripcion: e.target.value }))}
                    placeholder="Descripción detallada del producto"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    Unidad de Medida *
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={editForm.unidadMedida}
                      onChange={(e) => setEditForm(prev => ({ ...prev, unidadMedida: e.target.value }))}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">Seleccionar unidad</option>
                      {unidadesMedida.map((unidad) => (
                        <option key={unidad} value={unidad}>
                          {unidad}
                        </option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowAddUnidadMedida(true)}
                      className="px-3"
                    >
                      +
                    </Button>
                  </div>
                  {showAddUnidadMedida && (
                    <div className="flex gap-2 mt-2">
                      <Input
                        value={newValue}
                        onChange={(e) => setNewValue(e.target.value)}
                        placeholder="Nueva unidad de medida"
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handleAddNewValue('unidadMedida', newValue)}
                      >
                        Agregar
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setShowAddUnidadMedida(false);
                          setNewValue("");
                        }}
                      >
                        Cancelar
                      </Button>
                    </div>
                  )}
                </div>

                {/* Campos específicos para Ferretería */}
                {editProduct.categoria === "Ferretería" && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-700">
                        Subcategoría *
                      </label>
                      <div className="flex gap-2">
                        <select
                          value={editForm.subCategoria}
                          onChange={(e) => setEditForm(prev => ({ ...prev, subCategoria: e.target.value }))}
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                          <option value="">Seleccionar subcategoría</option>
                          {subCategoriasFerreteriaFiltro.map((subcat) => (
                            <option key={subcat} value={subcat}>
                              {subcat}
                            </option>
                          ))}
                        </select>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setShowAddSubcategoriaFerreteria(true)}
                          className="px-3"
                        >
                          +
                        </Button>
                      </div>
                      {showAddSubcategoriaFerreteria && (
                        <div className="flex gap-2 mt-2">
                          <Input
                            value={newValue}
                            onChange={(e) => setNewValue(e.target.value)}
                            placeholder="Nueva subcategoría"
                            className="flex-1"
                          />
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => handleAddNewValue('subCategoria', newValue)}
                          >
                            Agregar
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setShowAddSubcategoriaFerreteria(false);
                              setNewValue("");
                            }}
                          >
                            Cancelar
                          </Button>
                        </div>
                      )}
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-700">
                        Proveedor *
                      </label>
                      <div className="flex gap-2">
                        <select
                          value={editForm.proveedor}
                          onChange={(e) => setEditForm(prev => ({ ...prev, proveedor: e.target.value }))}
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                          <option value="">Seleccionar proveedor</option>
                          {proveedores.map((prov) => (
                            <option key={prov} value={prov}>
                              {prov}
                            </option>
                          ))}
                        </select>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setShowAddProveedor(true)}
                          className="px-3"
                        >
                          +
                        </Button>
                      </div>
                      {showAddProveedor && (
                        <div className="flex gap-2 mt-2">
                          <Input
                            value={newValue}
                            onChange={(e) => setNewValue(e.target.value)}
                            placeholder="Nuevo proveedor"
                            className="flex-1"
                          />
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => handleAddNewValue('proveedor', newValue)}
                          >
                            Agregar
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setShowAddProveedor(false);
                              setNewValue("");
                            }}
                          >
                            Cancelar
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Campos específicos para Maderas */}
                {editProduct.categoria === "Maderas" && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-700">
                        Subcategoría *
                      </label>
                      <div className="flex gap-2">
                        <select
                          value={editForm.subcategoria}
                          onChange={(e) => setEditForm(prev => ({ ...prev, subcategoria: e.target.value }))}
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                          <option value="">Seleccionar subcategoría</option>
                          {subcategorias.map((subcat) => (
                            <option key={subcat} value={subcat}>
                              {subcat}
                            </option>
                          ))}
                        </select>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setShowAddSubcategoria(true)}
                          className="px-3"
                        >
                          +
                        </Button>
                      </div>
                      {showAddSubcategoria && (
                        <div className="flex gap-2 mt-2">
                          <Input
                            value={newValue}
                            onChange={(e) => setNewValue(e.target.value)}
                            placeholder="Nueva subcategoría"
                            className="flex-1"
                          />
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => handleAddNewValue('subcategoria', newValue)}
                          >
                            Agregar
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setShowAddSubcategoria(false);
                              setNewValue("");
                            }}
                          >
                            Cancelar
                          </Button>
                        </div>
                      )}
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-700">
                        Tipo de Madera *
                      </label>
                      <div className="flex gap-2">
                        <select
                          value={editForm.tipoMadera}
                          onChange={(e) => setEditForm(prev => ({ ...prev, tipoMadera: e.target.value }))}
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                          <option value="">Seleccionar tipo de madera</option>
                          {tiposMadera.map((tipo) => (
                            <option key={tipo} value={tipo}>
                              {tipo}
                            </option>
                          ))}
                        </select>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setShowAddTipoMadera(true)}
                          className="px-3"
                        >
                          +
                        </Button>
                      </div>
                      {showAddTipoMadera && (
                        <div className="flex gap-2 mt-2">
                          <Input
                            value={newValue}
                            onChange={(e) => setNewValue(e.target.value)}
                            placeholder="Nuevo tipo de madera"
                            className="flex-1"
                          />
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => handleAddNewValue('tipoMadera', newValue)}
                          >
                            Agregar
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setShowAddTipoMadera(false);
                              setNewValue("");
                            }}
                          >
                            Cancelar
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Mensaje de estado */}
              {editMessage && (
                <div className={`p-3 rounded-lg text-sm ${
                  editMessage.startsWith("Error")
                    ? "bg-red-50 text-red-800 border border-red-200"
                    : "bg-green-50 text-green-800 border border-green-200"
                }`}>
                  {editMessage}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setEditModalOpen(false)}
              disabled={editLoading}
            >
              Cancelar
            </Button>
            <Button
              variant="default"
              onClick={handleSaveEdit}
              disabled={editLoading}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {editLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Guardando...
                </>
              ) : (
                "Guardar Cambios"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Confirmación de Eliminación */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className="w-[95vw] max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="w-5 h-5" />
              Confirmar Eliminación
            </DialogTitle>
          </DialogHeader>
          
          <div className="py-4">
            <p className="text-gray-700 mb-4">
              ¿Estás seguro de que deseas eliminar <strong>{selectedProducts.length}</strong> producto(s) seleccionado(s)?
            </p>
            <p className="text-sm text-red-600 font-medium">
              ⚠️ Esta acción no se puede deshacer. Los productos se eliminarán permanentemente.
            </p>
          </div>

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setShowDeleteConfirm(false)}
              disabled={deleteLoading}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteSelected}
              disabled={deleteLoading}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Eliminando...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Eliminar Productos
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
