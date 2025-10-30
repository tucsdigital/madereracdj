"use client";
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Link from "next/link";
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
  writeBatch,
} from "firebase/firestore";
import { useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";
import DragDropImageModal from "@/components/productos/DragDropImageModal";
import ToastNotification from "@/components/ui/toast-notification";

const categorias = ["Maderas", "Ferretería", "Obras"];

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

// Función para calcular precio de machimbre/deck (unidad M2)
function calcularPrecioMachimbre({ alto, largo, cantidad, precioPorPie }) {
  if (
    [alto, largo, cantidad, precioPorPie].some(
      (v) => typeof v !== "number" || v <= 0
    )
  ) {
    return 0;
  }
  const metrosCuadrados = alto * largo;
  const precio = metrosCuadrados * precioPorPie * cantidad;
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
  estadoTienda: yup
    .string()
    .oneOf(["Activo", "Inactivo"])
    .required("El estado de tienda es obligatorio"),
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

const esquemasPorCategoria = {
  Maderas: maderasSchema,
  Ferretería: ferreteriaSchema,
};

// Componente FormularioProducto mejorado
function FormularioProducto({ onClose, onSuccess }) {
  const [categoria, setCategoria] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState(null);
  const [submitMessage, setSubmitMessage] = useState("");
  // Debug UI eliminado; se mantienen logs en consola
  const UNIDADES_MADERAS = ["pie", "M2", "ML", "Unidad"];

  // Normalizador robusto de números (acepta coma y punto)
  const toNumber = (value) => {
    if (value === null || value === undefined) return undefined;
    if (typeof value === "number") return Number.isNaN(value) ? undefined : value;
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) return undefined;
      const normalized = trimmed.replace(/,/g, ".");
      const num = Number(normalized);
      return Number.isNaN(num) ? undefined : num;
    }
    const num = Number(value);
    return Number.isNaN(num) ? undefined : num;
  };
  
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
  
  const schema = esquemasPorCategoria[categoria] || yup.object().shape(baseSchema);
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setValue,
  } = useForm({
    resolver: yupResolver(schema),
    defaultValues: { estado: "Activo", estadoTienda: "Activo" },
  });

  useEffect(() => {
    if (categoria) {
      cargarDatosPrecargados();
    }
  }, [categoria]);

  // Preseleccionar unidad de medida en Maderas
  useEffect(() => {
    if (categoria === "Maderas") {
      setValue("unidadMedida", "pie");
    } else {
      setValue("unidadMedida", "");
    }
  }, [categoria, setValue]);

  const cargarDatosPrecargados = async () => {
    try {
      const productosSnap = await getDocs(collection(db, "productos"));
      const productos = productosSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      const productosCategoria = productos.filter(p => p.categoria === categoria);
      
      if (categoria === "Maderas") {
        const tiposMadera = [...new Set(productosCategoria.map(p => p.tipoMadera).filter(Boolean))];
        const subCategorias = [...new Set(productosCategoria.map(p => p.subcategoria).filter(Boolean))];
        setTiposMaderaUnicos(tiposMadera);
        setSubCategoriasUnicas(subCategorias);
        // Para Maderas, usar catálogo fijo de unidades
        setUnidadesMedidaUnicas(UNIDADES_MADERAS);
      } else if (categoria === "Ferretería") {
        const unidadesMedida = [...new Set(productosCategoria.map(p => p.unidadMedida).filter(Boolean))];
        const subCategorias = [...new Set(productosCategoria.map(p => p.subCategoria).filter(Boolean))];
        const proveedores = [...new Set(productosCategoria.map(p => p.proveedor).filter(Boolean))];
        setUnidadesMedidaUnicas(unidadesMedida);
        setSubCategoriasUnicas(subCategorias);
        setProveedoresUnicos(proveedores);
      } else if (categoria === "Obras") {
        const unidadesMedida = [...new Set(productosCategoria.map(p => p.unidadMedida).filter(Boolean))];
        const subCategorias = [...new Set(productosCategoria.map(p => p.subCategoria).filter(Boolean))];
        setUnidadesMedidaUnicas(unidadesMedida);
        setSubCategoriasUnicas(subCategorias);
      }
    } catch (error) {
      console.error("Error al cargar datos precargados:", error);
    }
  };

  const handleAddNewValue = async (tipo, valor) => {
    if (!valor.trim()) return;
    
    try {
      switch (tipo) {
        case 'tipoMadera':
          setTiposMaderaUnicos(prev => [...prev, valor.trim()]);
          setValue('tipoMadera', valor.trim());
          break;
        case 'subcategoria':
          setSubCategoriasUnicas(prev => [...prev, valor.trim()]);
          setValue('subcategoria', valor.trim());
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
      // Normalizar datos antes de guardar
      const payload = { ...data };

      // Mapear subcategoría según la categoría seleccionada
      if (payload.categoria === "Ferretería") {
        if (payload.subcategoria) {
          payload.subCategoria = payload.subcategoria;
          delete payload.subcategoria;
        }
      } else if (payload.categoria === "Maderas") {
        // Asegurar que no quede subCategoria en maderas
        if (payload.subCategoria) delete payload.subCategoria;
      } else if (payload.categoria === "Obras") {
        if (payload.subcategoria) {
          payload.subCategoria = payload.subcategoria;
          delete payload.subcategoria;
        }
      }

      // Convertir tipos numéricos para consistencia en Firestore
      if (payload.categoria === "Maderas") {
        if (payload.costo !== undefined) payload.costo = toNumber(payload.costo);
        if (payload.largo !== undefined) payload.largo = toNumber(payload.largo);
        if (payload.ancho !== undefined) payload.ancho = toNumber(payload.ancho);
        if (payload.alto !== undefined) payload.alto = toNumber(payload.alto);
        if (payload.precioPorPie !== undefined) payload.precioPorPie = toNumber(payload.precioPorPie);
        // Valor por defecto recomendado
        if (!payload.unidadMedida) payload.unidadMedida = "pie";
      } else if (payload.categoria === "Ferretería") {
        if (payload.costo !== undefined) payload.costo = toNumber(payload.costo);
        if (payload.stockMinimo !== undefined) payload.stockMinimo = toNumber(payload.stockMinimo);
        if (payload.valorCompra !== undefined) payload.valorCompra = toNumber(payload.valorCompra);
        if (payload.valorVenta !== undefined) payload.valorVenta = toNumber(payload.valorVenta);
      } else if (payload.categoria === "Obras") {
        if (payload.stockMinimo !== undefined) payload.stockMinimo = toNumber(payload.stockMinimo);
        if (payload.valorVenta !== undefined) payload.valorVenta = toNumber(payload.valorVenta);
        if (payload.unidad !== undefined) payload.unidad = toNumber(payload.unidad);
      }

      // Eliminar claves con undefined para evitar errores de Firestore
      Object.keys(payload).forEach((k) => {
        if (payload[k] === undefined) {
          delete payload[k];
        }
      });

      // Construir expectativas y posibles faltantes
      const expectedFields = payload.categoria === "Maderas"
        ? [
            "codigo",
            "nombre",
            "descripcion",
            "categoria",
            "subcategoria",
            "estado",
            "estadoTienda",
            "costo",
            "tipoMadera",
            "largo",
            "ancho",
            "alto",
            "unidadMedida",
            "precioPorPie",
            "ubicacion",
          ]
        : [
            "codigo",
            "nombre",
            "descripcion",
            "categoria",
            "subCategoria",
            "estado",
            "estadoTienda",
            "costo",
            "stockMinimo",
            "unidadMedida",
            "valorCompra",
            "valorVenta",
            "proveedor",
          ];

      const missing = expectedFields.filter((field) => {
        const value = payload[field];
        if (value === 0) return false;
        return value === undefined || value === null || value === "" || Number.isNaN(value);
      });

      const typeMap = Object.fromEntries(
        Object.entries(payload).map(([k, v]) => [k, Array.isArray(v) ? "array" : typeof v])
      );

      // Log profesional agrupado en consola
      // Útil para inspección en devtools
      try {
        // eslint-disable-next-line no-console
        console.groupCollapsed("FormularioProducto › onSubmit");
        // eslint-disable-next-line no-console
        console.info("Raw data (RHF):", data);
        // eslint-disable-next-line no-console
        console.info("Payload normalizado:", payload);
        // eslint-disable-next-line no-console
        console.info("Campos esperados:", expectedFields);
        // eslint-disable-next-line no-console
        console.warn("Faltantes:", missing);
        // eslint-disable-next-line no-console
        console.info("Tipos:", typeMap);
      } finally {
        // eslint-disable-next-line no-console
        console.groupEnd();
      }

      await addDoc(collection(db, payload.categoria === "Obras" ? "productos_obras" : "productos"), {
        ...payload,
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

  const onSubmitError = (errors) => {
    const fieldNames = Object.keys(errors || {});
    const messages = fieldNames.map((k) => errors[k]?.message || k);
    // Solo logs en consola, sin UI
    setSubmitStatus("error");
    setSubmitMessage(
      messages.length
        ? `Validación fallida: ${messages.join("; ")}`
        : "Validación fallida. Revisa los campos obligatorios."
    );
    try {
      // eslint-disable-next-line no-console
      console.groupCollapsed("FormularioProducto › validation errors");
      // eslint-disable-next-line no-console
      console.warn("Campos con error:", fieldNames);
      // eslint-disable-next-line no-console
      console.warn("Detalle de errores:", errors);
    } finally {
      // eslint-disable-next-line no-console
      console.groupEnd();
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit, onSubmitError)} className="space-y-6">
      {/* Feedback de guardado con animación */}
      {submitStatus && (
        <div
          className={`mb-6 p-4 rounded-xl flex items-center gap-3 text-sm shadow-lg transform transition-all duration-300 ${
            submitStatus === "success"
              ? "bg-gradient-to-r from-green-50 to-emerald-50 text-green-800 border border-green-200"
              : "bg-gradient-to-r from-red-50 to-pink-50 text-red-800 border border-red-200"
          }`}
        >
          <div className={`p-2 rounded-full ${submitStatus === "success" ? "bg-green-100" : "bg-red-100"}`}>
            {submitStatus === "success" ? (
              <CheckCircle className="w-5 h-5 text-green-600" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-600" />
            )}
          </div>
          <div>
            <div className="font-semibold">
              {submitStatus === "success" ? "¡Éxito!" : "Error"}
            </div>
            <div className="text-sm opacity-90">{submitMessage}</div>
          </div>
        </div>
      )}

      {/* Debug UI removido: usar consola para inspección */}

      {/* Selector de categoría con diseño moderno */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
          <label className="text-lg font-semibold text-gray-800">Categoría del Producto</label>
        </div>
        <div className="relative">
          <select
            {...register("categoria")}
            value={categoria}
            onChange={(e) => {
              setCategoria(e.target.value);
              setValue("categoria", e.target.value);
            }}
            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all duration-200 bg-white shadow-sm hover:border-gray-300 disabled:bg-gray-50 disabled:cursor-not-allowed"
            disabled={isSubmitting}
          >
            <option value="">Selecciona una categoría</option>
            {categorias.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <div className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none">
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
        {errors.categoria && (
          <div className="flex items-center gap-2 text-red-600 text-sm">
            <AlertCircle className="w-4 h-4" />
            {errors.categoria.message}
          </div>
        )}
      </div>

      {/* Solo mostrar el resto del formulario si hay categoría seleccionada */}
      {categoria && (
        <div className="space-y-8">
          {/* Sección: Datos generales */}
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-6 border border-blue-100">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-blue-500 rounded-lg">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-800">Datos Generales</h3>
                <p className="text-sm text-gray-600">Información básica del producto</p>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <span className="text-red-500">*</span>
                  Código del Producto
                </label>
                <Input
                  {...register("codigo")}
                  placeholder="Ej: MAD-001"
                  disabled={isSubmitting}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all duration-200 bg-white shadow-sm hover:border-gray-300 disabled:bg-gray-50"
                />
                {errors.codigo && (
                  <div className="flex items-center gap-2 text-red-600 text-sm">
                    <AlertCircle className="w-4 h-4" />
                    {errors.codigo.message}
                  </div>
                )}
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <span className="text-red-500">*</span>
                  Nombre del Producto
                </label>
                <Input
                  {...register("nombre")}
                  placeholder="Ej: Tabla de Pino"
                  disabled={isSubmitting}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all duration-200 bg-white shadow-sm hover:border-gray-300 disabled:bg-gray-50"
                />
                {errors.nombre && (
                  <div className="flex items-center gap-2 text-red-600 text-sm">
                    <AlertCircle className="w-4 h-4" />
                    {errors.nombre.message}
                  </div>
                )}
              </div>
              
              <div className="md:col-span-2 space-y-2">
                <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <span className="text-red-500">*</span>
                  Descripción
                </label>
                <textarea
                  {...register("descripcion")}
                  placeholder="Describe las características del producto..."
                  disabled={isSubmitting}
                  rows={3}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all duration-200 bg-white shadow-sm hover:border-gray-300 disabled:bg-gray-50 resize-none"
                />
                {errors.descripcion && (
                  <div className="flex items-center gap-2 text-red-600 text-sm">
                    <AlertCircle className="w-4 h-4" />
                    {errors.descripcion.message}
                  </div>
                )}
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <span className="text-red-500">*</span>
                  Subcategoría
                </label>
                <div className="flex gap-2">
                  <select
                    {...register("subcategoria")}
                    className="flex-1 px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all duration-200 bg-white shadow-sm hover:border-gray-300 disabled:bg-gray-50"
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
                    className="px-4 py-3 border-2 border-gray-200 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-all duration-200"
                    disabled={isSubmitting}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                {showAddSubcategoria && (
                  <div className="flex gap-2 mt-3 p-3 bg-gray-50 rounded-xl border border-gray-200">
                    <Input
                      value={newValue}
                      onChange={(e) => setNewValue(e.target.value)}
                      placeholder="Nueva subcategoría"
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => handleAddNewValue('subcategoria', newValue)}
                      disabled={isSubmitting}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
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
                      className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      Cancelar
                    </Button>
                  </div>
                )}
                {errors.subcategoria && (
                  <div className="flex items-center gap-2 text-red-600 text-sm">
                    <AlertCircle className="w-4 h-4" />
                    {errors.subcategoria.message}
                  </div>
                )}
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <span className="text-red-500">*</span>
                  Estado
                </label>
                <select
                  {...register("estado")}
                  className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all duration-200 bg-white shadow-sm hover:border-gray-300 disabled:bg-gray-50"
                  disabled={isSubmitting}
                >
                  <option value="Activo">Activo</option>
                  <option value="Inactivo">Inactivo</option>
                  <option value="Descontinuado">Descontinuado</option>
                </select>
                {errors.estado && (
                  <div className="flex items-center gap-2 text-red-600 text-sm">
                    <AlertCircle className="w-4 h-4" />
                    {errors.estado.message}
                  </div>
                )}
              </div>
            
            <div className="space-y-2">
              <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <span className="text-red-500">*</span>
                Tienda
              </label>
              <select
                {...register("estadoTienda")}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all duration-200 bg-white shadow-sm hover:border-gray-300 disabled:bg-gray-50"
                disabled={isSubmitting}
              >
                <option value="Activo">Activo</option>
                <option value="Inactivo">Inactivo</option>
              </select>
              {errors.estadoTienda && (
                <div className="flex items-center gap-2 text-red-600 text-sm">
                  <AlertCircle className="w-4 h-4" />
                  {errors.estadoTienda.message}
                </div>
              )}
            </div>
              
              <div className="space-y-2">
                <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                  <span className="text-red-500">*</span>
                  Costo Unitario
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">$</span>
                  <Input
                    {...register("costo")}
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    disabled={isSubmitting}
                    className="w-full pl-8 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition-all duration-200 bg-white shadow-sm hover:border-gray-300 disabled:bg-gray-50"
                  />
                </div>
                {errors.costo && (
                  <div className="flex items-center gap-2 text-red-600 text-sm">
                    <AlertCircle className="w-4 h-4" />
                    {errors.costo.message}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Sección específica por categoría */}
          {categoria === "Maderas" && (
            <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl p-6 border border-amber-100">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-amber-500 rounded-lg">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-800">Especificaciones de Madera</h3>
                  <p className="text-sm text-gray-600">Dimensiones y características específicas</p>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <span className="text-red-500">*</span>
                    Tipo de Madera
                  </label>
                  <div className="flex gap-2">
                    <select
                      {...register("tipoMadera")}
                      className="flex-1 px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-amber-500 focus:ring-4 focus:ring-amber-100 transition-all duration-200 bg-white shadow-sm hover:border-gray-300 disabled:bg-gray-50"
                      disabled={isSubmitting}
                    >
                      <option value="">Seleccionar tipo de madera</option>
                      {tiposMaderaUnicos.map((tipo) => (
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
                      className="px-4 py-3 border-2 border-gray-200 rounded-xl hover:border-amber-500 hover:bg-amber-50 transition-all duration-200"
                      disabled={isSubmitting}
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                  {showAddTipoMadera && (
                    <div className="flex gap-2 mt-3 p-3 bg-amber-50 rounded-xl border border-amber-200">
                      <Input
                        value={newValue}
                        onChange={(e) => setNewValue(e.target.value)}
                        placeholder="Nuevo tipo de madera"
                        className="flex-1 px-3 py-2 border border-amber-300 rounded-lg focus:border-amber-500 focus:ring-2 focus:ring-amber-100"
                      />
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handleAddNewValue('tipoMadera', newValue)}
                        disabled={isSubmitting}
                        className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors"
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
                        className="px-4 py-2 border border-amber-300 rounded-lg hover:bg-amber-50 transition-colors"
                      >
                        Cancelar
                      </Button>
                    </div>
                  )}
                  {errors.tipoMadera && (
                    <div className="flex items-center gap-2 text-red-600 text-sm">
                      <AlertCircle className="w-4 h-4" />
                      {errors.tipoMadera.message}
                    </div>
                  )}
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <span className="text-red-500">*</span>
                    Largo (metros)
                  </label>
                  <Input
                    {...register("largo")}
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    disabled={isSubmitting}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-amber-500 focus:ring-4 focus:ring-amber-100 transition-all duration-200 bg-white shadow-sm hover:border-gray-300 disabled:bg-gray-50"
                  />
                  {errors.largo && (
                    <div className="flex items-center gap-2 text-red-600 text-sm">
                      <AlertCircle className="w-4 h-4" />
                      {errors.largo.message}
                    </div>
                  )}
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <span className="text-red-500">*</span>
                    Ancho (cm)
                  </label>
                  <Input
                    {...register("ancho")}
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    disabled={isSubmitting}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-amber-500 focus:ring-4 focus:ring-amber-100 transition-all duration-200 bg-white shadow-sm hover:border-gray-300 disabled:bg-gray-50"
                  />
                  {errors.ancho && (
                    <div className="flex items-center gap-2 text-red-600 text-sm">
                      <AlertCircle className="w-4 h-4" />
                      {errors.ancho.message}
                    </div>
                  )}
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <span className="text-red-500">*</span>
                    Alto (cm)
                  </label>
                  <Input
                    {...register("alto")}
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    disabled={isSubmitting}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-amber-500 focus:ring-4 focus:ring-amber-100 transition-all duration-200 bg-white shadow-sm hover:border-gray-300 disabled:bg-gray-50"
                  />
                  {errors.alto && (
                    <div className="flex items-center gap-2 text-red-600 text-sm">
                      <AlertCircle className="w-4 h-4" />
                      {errors.alto.message}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <span className="text-red-500">*</span>
                    Unidad de Medida
                  </label>
                  <div className="flex gap-2">
                    <select
                      {...register("unidadMedida")}
                      className="flex-1 px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-amber-500 focus:ring-4 focus:ring-amber-100 transition-all duration-200 bg-white shadow-sm hover:border-gray-300 disabled:bg-gray-50"
                      disabled={isSubmitting}
                    >
                      <option value="">Seleccionar unidad</option>
                      {unidadesMedidaUnicas.map((unidad) => (
                        <option key={unidad} value={unidad}>
                          {unidad}
                        </option>
                      ))}
                    </select>
                  </div>
                  {errors.unidadMedida && (
                    <div className="flex items-center gap-2 text-red-600 text-sm">
                      <AlertCircle className="w-4 h-4" />
                      {errors.unidadMedida.message}
                    </div>
                  )}
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <span className="text-red-500">*</span>
                    Precio por Pie
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">$</span>
                    <Input
                      {...register("precioPorPie")}
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      disabled={isSubmitting}
                      className="w-full pl-8 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:border-amber-500 focus:ring-4 focus:ring-amber-100 transition-all duration-200 bg-white shadow-sm hover:border-gray-300 disabled:bg-gray-50"
                    />
                  </div>
                  {errors.precioPorPie && (
                    <div className="flex items-center gap-2 text-red-600 text-sm">
                      <AlertCircle className="w-4 h-4" />
                      {errors.precioPorPie.message}
                    </div>
                  )}
                </div>
                
                <div className="md:col-span-2 space-y-2">
                  <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <span className="text-red-500">*</span>
                    Ubicación en Depósito
                  </label>
                  <Input
                    {...register("ubicacion")}
                    placeholder="Ej: Estante A, Nivel 2"
                    disabled={isSubmitting}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-amber-500 focus:ring-4 focus:ring-amber-100 transition-all duration-200 bg-white shadow-sm hover:border-gray-300 disabled:bg-gray-50"
                  />
                  {errors.ubicacion && (
                    <div className="flex items-center gap-2 text-red-600 text-sm">
                      <AlertCircle className="w-4 h-4" />
                      {errors.ubicacion.message}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {categoria === "Ferretería" && (
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-2xl p-6 border border-green-100">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-green-500 rounded-lg">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-800">Especificaciones de Ferretería</h3>
                  <p className="text-sm text-gray-600">Información de stock y proveedores</p>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <span className="text-red-500">*</span>
                    Stock Mínimo
                  </label>
                  <Input
                    {...register("stockMinimo")}
                    type="number"
                    step="1"
                    placeholder="0"
                    disabled={isSubmitting}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-green-500 focus:ring-4 focus:ring-green-100 transition-all duration-200 bg-white shadow-sm hover:border-gray-300 disabled:bg-gray-50"
                  />
                  {errors.stockMinimo && (
                    <div className="flex items-center gap-2 text-red-600 text-sm">
                      <AlertCircle className="w-4 h-4" />
                      {errors.stockMinimo.message}
                    </div>
                  )}
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <span className="text-red-500">*</span>
                    Unidad de Medida
                  </label>
                  <div className="flex gap-2">
                    <select
                      {...register("unidadMedida")}
                      className="flex-1 px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-green-500 focus:ring-4 focus:ring-green-100 transition-all duration-200 bg-white shadow-sm hover:border-gray-300 disabled:bg-gray-50"
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
                      className="px-4 py-3 border-2 border-gray-200 rounded-xl hover:border-green-500 hover:bg-green-50 transition-all duration-200"
                      disabled={isSubmitting}
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                  {showAddUnidadMedida && (
                    <div className="flex gap-2 mt-3 p-3 bg-green-50 rounded-xl border border-green-200">
                      <Input
                        value={newValue}
                        onChange={(e) => setNewValue(e.target.value)}
                        placeholder="Nueva unidad de medida"
                        className="flex-1 px-3 py-2 border border-green-300 rounded-lg focus:border-green-500 focus:ring-2 focus:ring-green-100"
                      />
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handleAddNewValue('unidadMedida', newValue)}
                        disabled={isSubmitting}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
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
                        className="px-4 py-2 border border-green-300 rounded-lg hover:bg-green-50 transition-colors"
                      >
                        Cancelar
                      </Button>
                    </div>
                  )}
                  {errors.unidadMedida && (
                    <div className="flex items-center gap-2 text-red-600 text-sm">
                      <AlertCircle className="w-4 h-4" />
                      {errors.unidadMedida.message}
                    </div>
                  )}
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <span className="text-red-500">*</span>
                    Valor de Compra
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">$</span>
                    <Input
                      {...register("valorCompra")}
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      disabled={isSubmitting}
                      className="w-full pl-8 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:border-green-500 focus:ring-4 focus:ring-green-100 transition-all duration-200 bg-white shadow-sm hover:border-gray-300 disabled:bg-gray-50"
                    />
                  </div>
                  {errors.valorCompra && (
                    <div className="flex items-center gap-2 text-red-600 text-sm">
                      <AlertCircle className="w-4 h-4" />
                      {errors.valorCompra.message}
                    </div>
                  )}
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <span className="text-red-500">*</span>
                    Valor de Venta
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">$</span>
                    <Input
                      {...register("valorVenta")}
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      disabled={isSubmitting}
                      className="w-full pl-8 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:border-green-500 focus:ring-4 focus:ring-green-100 transition-all duration-200 bg-white shadow-sm hover:border-gray-300 disabled:bg-gray-50"
                    />
                  </div>
                  {errors.valorVenta && (
                    <div className="flex items-center gap-2 text-red-600 text-sm">
                      <AlertCircle className="w-4 h-4" />
                      {errors.valorVenta.message}
                    </div>
                  )}
                </div>
                
                <div className="md:col-span-2 space-y-2">
                  <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <span className="text-red-500">*</span>
                    Proveedor
                  </label>
                  <div className="flex gap-2">
                    <select
                      {...register("proveedor")}
                      className="flex-1 px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-green-500 focus:ring-4 focus:ring-green-100 transition-all duration-200 bg-white shadow-sm hover:border-gray-300 disabled:bg-gray-50"
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
                      className="px-4 py-3 border-2 border-gray-200 rounded-xl hover:border-green-500 hover:bg-green-50 transition-all duration-200"
                      disabled={isSubmitting}
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                  {showAddProveedor && (
                    <div className="flex gap-2 mt-3 p-3 bg-green-50 rounded-xl border border-green-200">
                      <Input
                        value={newValue}
                        onChange={(e) => setNewValue(e.target.value)}
                        placeholder="Nuevo proveedor"
                        className="flex-1 px-3 py-2 border border-green-300 rounded-lg focus:border-green-500 focus:ring-2 focus:ring-green-100"
                      />
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handleAddNewValue('proveedor', newValue)}
                        disabled={isSubmitting}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
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
                        className="px-4 py-2 border border-green-300 rounded-lg hover:bg-green-50 transition-colors"
                      >
                        Cancelar
                      </Button>
                    </div>
                  )}
                  {errors.proveedor && (
                    <div className="flex items-center gap-2 text-red-600 text-sm">
                      <AlertCircle className="w-4 h-4" />
                      {errors.proveedor.message}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {categoria === "Obras" && (
            <div className="bg-gradient-to-br from-purple-50 to-violet-50 rounded-2xl p-6 border border-purple-100">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-purple-500 rounded-lg">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-800">Especificaciones de Obras</h3>
                  <p className="text-sm text-gray-600">Información específica para productos de obras</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <span className="text-red-500">*</span>
                    Stock Mínimo
                  </label>
                  <input
                    {...register("stockMinimo")}
                    type="number"
                    step="0.01"
                    placeholder="0"
                    disabled={isSubmitting}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-purple-500 focus:ring-4 focus:ring-purple-100 transition-all duration-200 bg-white shadow-sm hover:border-gray-300 disabled:bg-gray-50"
                  />
                  {errors.stockMinimo && (
                    <div className="flex items-center gap-2 text-red-600 text-sm">
                      <AlertCircle className="w-4 h-4" />
                      {errors.stockMinimo.message}
                    </div>
                  )}
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <span className="text-red-500">*</span>
                    Valor de Venta
                  </label>
                  <input
                    {...register("valorVenta")}
                    type="number"
                    step="0.01"
                    placeholder="0"
                    disabled={isSubmitting}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-purple-500 focus:ring-4 focus:ring-purple-100 transition-all duration-200 bg-white shadow-sm hover:border-gray-300 disabled:bg-gray-50"
                  />
                  {errors.valorVenta && (
                    <div className="flex items-center gap-2 text-red-600 text-sm">
                      <AlertCircle className="w-4 h-4" />
                      {errors.valorVenta.message}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <span className="text-red-500">*</span>
                    Unidad
                  </label>
                  <input
                    {...register("unidad")}
                    type="number"
                    step="0.01"
                    placeholder="0"
                    disabled={isSubmitting}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-purple-500 focus:ring-4 focus:ring-purple-100 transition-all duration-200 bg-white shadow-sm hover:border-gray-300 disabled:bg-gray-50"
                  />
                  {errors.unidad && (
                    <div className="flex items-center gap-2 text-red-600 text-sm">
                      <AlertCircle className="w-4 h-4" />
                      {errors.unidad.message}
                    </div>
                  )}
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                    <span className="text-red-500">*</span>
                    Unidad de Medida
                  </label>
                  <div className="flex gap-2">
                    <select
                      {...register("unidadMedida")}
                      className="flex-1 px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-purple-500 focus:ring-4 focus:ring-purple-100 transition-all duration-200 bg-white shadow-sm hover:border-gray-300 disabled:bg-gray-50"
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
                      className="px-4 py-3 border-2 border-gray-200 rounded-xl hover:border-purple-500 hover:bg-purple-50 transition-all duration-200"
                      disabled={isSubmitting}
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                  {showAddUnidadMedida && (
                    <div className="flex gap-2 mt-3 p-3 bg-purple-50 rounded-xl border border-purple-200">
                      <Input
                        value={newValue}
                        onChange={(e) => setNewValue(e.target.value)}
                        placeholder="Nueva unidad de medida"
                        className="flex-1 px-3 py-2 border border-purple-300 rounded-lg focus:border-purple-500 focus:ring-2 focus:ring-purple-100"
                      />
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handleAddNewValue('unidadMedida', newValue)}
                        disabled={isSubmitting}
                        className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
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
                        className="px-4 py-2 border border-purple-300 rounded-lg hover:bg-purple-50 transition-colors"
                      >
                        Cancelar
                      </Button>
                    </div>
                  )}
                  {errors.unidadMedida && (
                    <div className="flex items-center gap-2 text-red-600 text-sm">
                      <AlertCircle className="w-4 h-4" />
                      {errors.unidadMedida.message}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Footer con botones modernos */}
          <div className="flex justify-end gap-4 pt-6 border-t border-gray-200">
            <Button
              variant="outline"
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-6 py-3 border-2 border-gray-300 rounded-xl hover:border-gray-400 hover:bg-gray-50 transition-all duration-200"
            >
              Cancelar
            </Button>
            <Button 
              variant="default" 
              type="submit" 
              disabled={isSubmitting}
              className="px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl shadow-lg hover:shadow-xl transition-all duration-200"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Guardando...
                </>
              ) : (
                "Guardar Producto"
              )}
            </Button>
          </div>
        </div>
      )}
    </form>
  );
}

const ProductosPage = () => {
  const [open, setOpen] = useState(false);
  const [openBulk, setOpenBulk] = useState(false);
  const [openBulkFerreteria, setOpenBulkFerreteria] = useState(false);
  const [openBulkObras, setOpenBulkObras] = useState(false);
  const [filtro, setFiltro] = useState("");
  const [cat, setCat] = useState("");
  const [filtroTipoMadera, setFiltroTipoMadera] = useState("");
  const [filtroSubCategoria, setFiltroSubCategoria] = useState("");
  const [filtroTienda, setFiltroTienda] = useState("");

  const [reload, setReload] = useState(false);
  const [productos, setProductos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Estados para datos precargados de Firebase
  const [proveedores, setProveedores] = useState([]);
  const [subcategorias, setSubcategorias] = useState([]);
  const [tiposMadera, setTiposMadera] = useState([]);
  const [unidadesMedida, setUnidadesMedida] = useState([]);

  // Estados para agregar nuevos valores
  const [showAddProveedor, setShowAddProveedor] = useState(false);
  const [showAddSubcategoria, setShowAddSubcategoria] = useState(false);
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

  // Estados para carga masiva Obras
  const [bulkStatusObras, setBulkStatusObras] = useState(null);
  const [bulkMessageObras, setBulkMessageObras] = useState("");
  const [bulkLoadingObras, setBulkLoadingObras] = useState(false);
  const [bulkProgressObras, setBulkProgressObras] = useState({
    current: 0,
    total: 0,
  });
  const [bulkFileObras, setBulkFileObras] = useState(null);

  // Estados para selección múltiple
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [selectAll, setSelectAll] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteMessage, setDeleteMessage] = useState("");

  // Estados para dropdowns
  const [importDropdownOpen, setImportDropdownOpen] = useState(false);
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false);

  // Estados para edición masiva
  const [bulkEditModalOpen, setBulkEditModalOpen] = useState(false);
  const [bulkEditForm, setBulkEditForm] = useState({
    estado: "",
    estadoTienda: "",
    unidadMedida: "",
  });
  const [bulkEditLoading, setBulkEditLoading] = useState(false);
  const [bulkEditMessage, setBulkEditMessage] = useState("");

  // Estados para paginación optimizada
  const [paginaActual, setPaginaActual] = useState(1);
  const [productosPorPagina, setProductosPorPagina] = useState(20);
  const [isLoadingPagination, setIsLoadingPagination] = useState(false);

  // Estados para Drag & Drop de imágenes
  const [dragOverProductId, setDragOverProductId] = useState(null);
  const [dragDropModalOpen, setDragDropModalOpen] = useState(false);
  const [draggedImage, setDraggedImage] = useState(null);
  const [targetProduct, setTargetProduct] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [toastType, setToastType] = useState("info");

  // Función para cargar datos precargados de Firebase
  const cargarDatosPrecargados = () => {
    // Extraer proveedores únicos
    const proveedoresUnicos = [...new Set(
      productos
        .filter(p => p.proveedor)
        .map(p => p.proveedor)
    )].sort();
    setProveedores(proveedoresUnicos);

    // Extraer subcategorías únicas
    const subcategoriasUnicas = [...new Set(
      productos
        .filter(p => p.subcategoria)
        .map(p => p.subcategoria)
    )].sort();
    setSubcategorias(subcategoriasUnicas);

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

  // Función para cargar subcategorías específicas por categoría
  const cargarSubcategoriasPorCategoria = (categoria) => {
    if (categoria === "Ferretería") {
      // Para ferretería, usar subCategoria (con C mayúscula)
      const subcategoriasFerreteria = [...new Set(
        productos
          .filter(p => p.categoria === "Ferretería" && p.subCategoria)
          .map(p => p.subCategoria)
      )].sort();
      setSubcategorias(subcategoriasFerreteria);
    } else if (categoria === "Maderas") {
      // Para maderas, usar subcategoria (con c minúscula)
      const subcategoriasMaderas = [...new Set(
        productos
          .filter(p => p.categoria === "Maderas" && p.subcategoria)
          .map(p => p.subcategoria)
      )].sort();
      setSubcategorias(subcategoriasMaderas);
    } else if (categoria === "Obras") {
      // Para obras, usar subCategoria (con C mayúscula)
      const subcategoriasObras = [...new Set(
        productos
          .filter(p => p.categoria === "Obras" && p.subCategoria)
          .map(p => p.subCategoria)
      )].sort();
      setSubcategorias(subcategoriasObras);
    }
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
        if (!subcategorias.includes(valor)) {
          setSubcategorias(prev => [...prev, valor].sort());
        }
        setEditForm(prev => ({ ...prev, subcategoria: valor }));
        setShowAddSubcategoria(false);
        break;
      case 'tipoMadera':
        if (!tiposMadera.includes(valor)) {
          setTiposMadera(prev => [...prev, valor].sort());
        }
        setEditForm(prev => ({ ...prev, tipoMadera: valor }));
        setShowAddTipoMadera(false);
        break;
      case 'unidadMedida':
        if (!unidadesMedida.includes(valor)) {
          setUnidadesMedida(prev => [...prev, valor].sort());
        }
        setEditForm(prev => ({ ...prev, unidadMedida: valor }));
        setShowAddUnidadMedida(false);
        break;
    }
    setNewValue("");
  };



  useEffect(() => {
    setLoading(true);
    setError(null);
    
    // Cargar productos de ambas colecciones
    const productosQuery = query(collection(db, "productos"), orderBy("nombre"));
    const productosObrasQuery = query(collection(db, "productos_obras"), orderBy("nombre"));
    
    const unsubProductos = onSnapshot(
      productosQuery,
      (snapshot) => {
        const productosNormales = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        
        // Cargar productos de obras
        const unsubObras = onSnapshot(
          productosObrasQuery,
          (obrasSnapshot) => {
            const productosObras = obrasSnapshot.docs.map((doc) => ({ 
              id: doc.id, 
              ...doc.data(),
              categoria: "Obras" // Asegurar que tengan la categoría correcta
            }));
            
            // Combinar ambos arrays
            setProductos([...productosNormales, ...productosObras]);
            setLoading(false);
            // Cargar datos precargados después de obtener los productos
            cargarDatosPrecargados();
          },
          (err) => {
            setError("Error al cargar productos de obras: " + err.message);
            setLoading(false);
          }
        );
        
        return () => unsubObras();
      },
      (err) => {
        setError("Error al cargar productos: " + err.message);
        setLoading(false);
      }
    );
    
    return () => unsubProductos();
  }, [reload]);


  // Productos filtrados optimizados con useMemo
  const productosFiltrados = useMemo(() => {
    return productos.filter((p) => {
      // Función para normalizar texto (eliminar espacios y convertir a minúsculas)
      const normalizarTexto = (texto) => {
        if (!texto) return "";
        return texto.toLowerCase().replace(/\s+/g, '');
      };

      // Normalizar el término de búsqueda
      const filtroNormalizado = normalizarTexto(filtro || "");
      
      // Normalizar el nombre del producto
      const nombreNormalizado = normalizarTexto(p.nombre || "");
      
      // Normalizar el código del producto
      const codigoNormalizado = normalizarTexto(p.codigo || "");

      const cumpleCategoria = cat ? p.categoria === cat : true;
      // Filtro por búsqueda de texto con lógica mejorada
      let cumpleFiltro = !filtro;
      
      if (filtro) {
        // Si la búsqueda termina con punto, usar búsqueda dinámica (starts with)
        if (filtroNormalizado.endsWith('.')) {
          const busquedaSinPunto = filtroNormalizado.slice(0, -1);
          cumpleFiltro = 
            nombreNormalizado.startsWith(busquedaSinPunto) ||
            codigoNormalizado.startsWith(busquedaSinPunto);
        } else {
          // Búsqueda normal: incluye el texto en cualquier parte
          cumpleFiltro = 
            nombreNormalizado.includes(filtroNormalizado) ||
            codigoNormalizado.includes(filtroNormalizado);
        }
      }

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

      // Filtro específico por subcategoría de obras
      const cumpleSubCategoriaObras =
        cat !== "Obras" ||
        filtroSubCategoria === "" ||
        p.subCategoria === filtroSubCategoria;

      // Filtro por estado de tienda
      // Si no tiene estadoTienda, se considera "Inactivo" por defecto
      const estadoTiendaProducto = p.estadoTienda || "Inactivo";
      const cumpleTienda =
        filtroTienda === "" ||
        estadoTiendaProducto === filtroTienda;

      return cumpleCategoria && cumpleFiltro && cumpleTipoMadera && cumpleSubCategoria && cumpleSubCategoriaObras && cumpleTienda;
    }).sort((a, b) => {
      // Ordenar por stock: primero los que tienen stock, luego los que no
      const stockA = Number(a.stock) || 0;
      const stockB = Number(b.stock) || 0;
      
      if (stockA > 0 && stockB === 0) return -1; // a tiene stock, b no
      if (stockA === 0 && stockB > 0) return 1;  // b tiene stock, a no
      
      // Si ambos tienen stock o ambos no tienen stock, mantener orden original
      return 0;
    });
  }, [productos, cat, filtro, filtroTipoMadera, filtroSubCategoria, filtroTienda]);

  // Productos paginados optimizados
  const productosPaginados = useMemo(() => {
    const inicio = (paginaActual - 1) * productosPorPagina;
    const fin = inicio + productosPorPagina;
    return productosFiltrados.slice(inicio, fin);
  }, [productosFiltrados, paginaActual, productosPorPagina]);

  // Cálculo de totales optimizados
  const totalProductos = productosFiltrados.length;
  const totalPaginas = Math.ceil(totalProductos / productosPorPagina);

  // Función para cambiar página con feedback visual
  const cambiarPagina = useCallback((nuevaPagina) => {
    if (nuevaPagina < 1 || nuevaPagina > totalPaginas) return;
    
    setIsLoadingPagination(true);
    setPaginaActual(nuevaPagina);
    
    // Simular un pequeño delay para mostrar el feedback visual
    setTimeout(() => {
      setIsLoadingPagination(false);
    }, 300);
  }, [totalPaginas]);

  // Resetear página cuando cambian los filtros
  useEffect(() => {
    setPaginaActual(1);
  }, [cat, filtro, filtroTipoMadera, filtroSubCategoria, filtroTienda]);

  // Obtener tipos de madera únicos
  const tiposMaderaUnicos = [
    ...new Set(
      productos
        .filter((p) => p.categoria === "Maderas" && p.tipoMadera)
        .map((p) => p.tipoMadera)
    ),
  ].filter(Boolean);

  // Obtener subcategorías de ferretería únicas
  const subCategoriasFerreteria = [
    ...new Set(
      productos
        .filter((p) => p.categoria === "Ferretería" && p.subCategoria)
        .map((p) => p.subCategoria)
    ),
  ].filter(Boolean);

  // Obtener subcategorías de obras únicas
  const subCategoriasObras = [
    ...new Set(
      productos
        .filter((p) => p.categoria === "Obras" && p.subCategoria)
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
                      "stock",
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

  // Función para procesar archivo Excel/CSV específico para Obras
  const processExcelFileObras = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        try {
          const content = e.target.result;
          console.log(
            "Archivo Obras leído:",
            file.name,
            "Tamaño:",
            file.size
          );

          // Si es un archivo CSV, procesar directamente
          if (file.name.toLowerCase().endsWith(".csv")) {
            const lines = content.split("\n");
            console.log("Líneas CSV Obras encontradas:", lines.length);

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
            console.log("Encabezados Obras detectados:", headers);

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
                      "unidad",
                      "stockMinimo",
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
                    "Producto Obras válido agregado:",
                    producto.codigo
                  );
                } else {
                  console.log(
                    "Producto Obras inválido ignorado:",
                    producto
                  );
                }
              }
            }

            console.log(
              "Total de productos Obras válidos:",
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
          console.error("Error procesando archivo Obras:", error);
          reject(error);
        }
      };

      reader.onerror = () => {
        console.error("Error al leer el archivo Obras");
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

        // Validar stock (opcional, si se proporciona debe ser válido)
        if (producto.stock !== undefined && producto.stock !== null && producto.stock !== "") {
          if (isNaN(producto.stock) || producto.stock < 0) {
            productosInvalidos.push({
              index: i + 1,
              codigo: producto.codigo,
              error: `Campo stock debe ser un número válido mayor o igual a 0. Valor actual: ${producto.stock}`,
            });
            continue;
          }
        } else {
          // Si no se proporciona stock, establecer en 0
          producto.stock = 0;
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

  // Función para procesar carga masiva de Obras
  const handleBulkUploadObras = async () => {
    setBulkStatusObras(null);
    setBulkMessageObras("");
    setBulkLoadingObras(true);
    setBulkProgressObras({ current: 0, total: 0 });

    try {
      let productosData;

      if (!bulkFileObras) {
        setBulkStatusObras("error");
        setBulkMessageObras("Debes seleccionar un archivo Excel/CSV.");
        setBulkLoadingObras(false);
        return;
      }

      try {
        productosData = await processExcelFileObras(bulkFileObras);
      } catch (e) {
        setBulkStatusObras("error");
        setBulkMessageObras("Error al procesar el archivo: " + e.message);
        setBulkLoadingObras(false);
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

        // Validar campos específicos de obras
        if (
          !producto.subCategoria ||
          !producto.unidad ||
          !producto.stockMinimo ||
          !producto.unidadMedida ||
          !producto.valorVenta
        ) {
          productosInvalidos.push({
            index: i + 1,
            codigo: producto.codigo,
            error: `Faltan campos específicos de obras. subCategoria: ${producto.subCategoria}, unidad: ${producto.unidad}, stockMinimo: ${producto.stockMinimo}, unidadMedida: ${producto.unidadMedida}, valorVenta: ${producto.valorVenta}`,
          });
          continue;
        }

        // Validar que los valores numéricos sean válidos
        const valoresNumericos = [
          "unidad",
          "stockMinimo",
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

        productosValidos.push({
          ...producto,
          fechaCreacion: new Date().toISOString(),
          fechaActualizacion: new Date().toISOString(),
        });
      }

      // Mostrar errores si hay productos inválidos
      if (productosInvalidos.length > 0) {
        setBulkStatusObras("error");
        const erroresDetallados = productosInvalidos
          .map((p) => `Línea ${p.index} (${p.codigo}): ${p.error}`)
          .join("\n");
        setBulkMessageObras(
          `Se encontraron ${productosInvalidos.length} productos con errores:\n\n${erroresDetallados}`
        );
        setBulkLoadingObras(false);
        return;
      }

      // Procesar productos válidos
      setBulkProgressObras({ current: 0, total: productosValidos.length });

      for (let i = 0; i < productosValidos.length; i++) {
        const producto = productosValidos[i];

        try {
          await addDoc(collection(db, "productos_obras"), producto);
          setBulkProgressObras({
            current: i + 1,
            total: productosValidos.length,
          });
        } catch (error) {
          console.error("Error al guardar producto de obras:", error);
          productosInvalidos.push({
            index: i + 1,
            codigo: producto.codigo,
            error: "Error al guardar en Firebase: " + error.message,
          });
        }
      }

      // Mostrar resultado final
      if (productosInvalidos.length > 0) {
        setBulkStatusObras("error");
        const erroresDetallados = productosInvalidos
          .map((p) => `Línea ${p.index} (${p.codigo}): ${p.error}`)
          .join("\n");
        setBulkMessageObras(
          `Se procesaron ${productosValidos.length - productosInvalidos.length} productos exitosamente, pero ${productosInvalidos.length} tuvieron errores:\n\n${erroresDetallados}`
        );
      } else {
        setBulkStatusObras("success");
        setBulkMessageObras(
          `Se importaron exitosamente ${productosValidos.length} productos de obras.`
        );
      }

      setBulkLoadingObras(false);

      // Limpiar formulario y cerrar modal
      setTimeout(() => {
        setOpenBulkObras(false);
        setBulkFileObras(null);
        setBulkStatusObras(null);
        setBulkMessageObras("");
        setBulkLoadingObras(false);
        setBulkProgressObras({ current: 0, total: 0 });
        setReload((r) => !r);
      }, 2000);
    } catch (e) {
      setBulkStatusObras("error");
      setBulkMessageObras("Error inesperado: " + e.message);
      setBulkLoadingObras(false);
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
      "stock",
      "estado",
      "estadoTienda",
    ];
    const csvContent =
      "data:text/csv;charset=utf-8," +
      headers.join(",") +
      "\n" +
      "1001,TUERCA CUPLA 1/2,TUERCA CUPLA 1/2,Ferretería,Herrajes,Unidad,Global,1,859,1700,50,Activo,Activo";

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

  // Función para descargar CSV de ejemplo para Obras
  const downloadExampleCSVObras = () => {
    const headers = [
      "codigo",
      "nombre",
      "descripcion",
      "categoria",
      "subCategoria",
      "estado",
      "unidad",
      "stockMinimo",
      "unidadMedida",
      "valorVenta",
    ];
    const csvContent =
      "data:text/csv;charset=utf-8," +
      headers.join(",") +
      "\n" +
      "7000,Muelle en madera grandis,nada,Muelles,Obras,Activo,1,1,M2,140000";

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `plantilla_carga_masiva_obras_${new Date()
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
      "costo",
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
        producto.costo || "",
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
      "costo",
      "unidadMedida",
      "proveedor",
      "stockMinimo",
      "valorCompra",
      "valorVenta",
      "stock",
      "estado",
      "estadoTienda"
    ];

    const csvRows = [headers.join(",")];
    
    ferreteria.forEach(producto => {
      const row = [
        producto.codigo || "",
        producto.nombre || "",
        producto.descripcion || "",
        producto.categoria || "Ferretería",
        producto.subCategoria || "",
        producto.costo || "",
        producto.unidadMedida || "",
        producto.proveedor || "",
        producto.stockMinimo || "",
        producto.valorCompra || "",
        producto.valorVenta || "",
        producto.stock || "0",
        producto.estado || "Activo",
        producto.estadoTienda || "Inactivo"
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

  // Función para exportar obras a CSV
  const exportarObrasCSV = () => {
    const obras = productos.filter(p => p.categoria === "Obras");
    
    if (obras.length === 0) {
      alert("No hay productos de obras para exportar");
      return;
    }

    const headers = [
      "codigo",
      "nombre",
      "descripcion",
      "categoria",
      "subCategoria",
      "estado",
      "unidad",
      "stockMinimo",
      "unidadMedida",
      "valorVenta",
      "fechaCreacion",
      "fechaActualizacion"
    ];

    const csvRows = [headers.join(",")];
    
    obras.forEach(producto => {
      const row = [
        producto.codigo || "",
        producto.nombre || "",
        producto.descripcion || "",
        producto.categoria || "Obras",
        producto.subCategoria || "",
        producto.estado || "Activo",
        producto.unidad || "",
        producto.stockMinimo || "",
        producto.unidadMedida || "",
        producto.valorVenta || "",
        producto.fechaCreacion || "",
        producto.fechaActualizacion || ""
      ].map(field => `"${field}"`).join(",");
      
      csvRows.push(row);
    });

    const csvContent = "data:text/csv;charset=utf-8," + csvRows.join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `exportacion_obras_${new Date().toISOString().split("T")[0]}.csv`
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
        // Calcular el nuevo precio considerando la unidad de medida
        let precioBase = 0;
        const unidad = (producto.unidadMedida || "").toString();
        if (unidad === "M2") {
          precioBase = calcularPrecioMachimbre({
            alto: Number(producto.alto) || 0,
            largo: Number(producto.largo) || 0,
            cantidad: 1,
            precioPorPie: Number(nuevoPrecioPorPie) || 0,
          });
        } else if (unidad === "Unidad") {
          const p = Number(nuevoPrecioPorPie) || 0;
          precioBase = Math.round(p / 100) * 100;
        } else {
          precioBase = calcularPrecioCorteMadera({
            alto: Number(producto.alto) || 0,
            ancho: Number(producto.ancho) || 0,
            largo: Number(producto.largo) || 0,
            precioPorPie: Number(nuevoPrecioPorPie) || 0,
          });
        }

        const precioConCepillado = precioBase * 1.066;
        const aplicarCepillado = unidad !== "Unidad" && (producto.cepilladoAplicado || false);
        const precioFinal = aplicarCepillado ? precioConCepillado : precioBase;

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
        // Calcular el nuevo precio con o sin cepillado, respetando la unidad de medida
        let precioBase = 0;
        const unidad = (producto.unidadMedida || "").toString();
        if (unidad === "M2") {
          precioBase = calcularPrecioMachimbre({
            alto: Number(producto.alto) || 0,
            largo: Number(producto.largo) || 0,
            cantidad: 1,
            precioPorPie: Number(producto.precioPorPie) || 0,
          });
        } else if (unidad === "Unidad") {
          const p = Number(producto.precioPorPie) || 0;
          precioBase = Math.round(p / 100) * 100;
        } else {
          precioBase = calcularPrecioCorteMadera({
            alto: Number(producto.alto) || 0,
            ancho: Number(producto.ancho) || 0,
            largo: Number(producto.largo) || 0,
            precioPorPie: Number(producto.precioPorPie) || 0,
          });
        }

        const precioConCepillado = precioBase * 1.066;
        const debeAplicarCepillado = unidad !== "Unidad" && aplicarCepillado;
        const precioFinal = debeAplicarCepillado ? precioConCepillado : precioBase;

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

  // Funciones para Drag & Drop de imágenes
  const showToast = (message, type = "info") => {
    setToastMessage(message);
    setToastType(type);
    setToastVisible(true);
  };

  const handleDragOver = (e, productId) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverProductId(productId);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverProductId(null);
  };

  const handleDrop = async (e, product) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverProductId(null);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      
      // Validar que sea una imagen
      if (!file.type.startsWith('image/')) {
        showToast("Por favor, arrastra solo archivos de imagen", "error");
        return;
      }

      // Validar tamaño (5MB máximo)
      const maxSize = 5 * 1024 * 1024; // 5MB
      if (file.size > maxSize) {
        showToast("La imagen es demasiado grande. Tamaño máximo: 5MB", "error");
        return;
      }

      // Crear preview
      const reader = new FileReader();
      reader.onload = (event) => {
        setDraggedImage({
          file: file,
          preview: event.target.result,
          name: file.name
        });
        setTargetProduct(product);
        setDragDropModalOpen(true);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleConfirmImageUpload = async () => {
    if (!draggedImage || !targetProduct) return;

    try {
      setUploadingImage(true);
      showToast("Subiendo imagen...", "loading");

      // Subir la imagen al servidor
      const formData = new FormData();
      formData.append('file', draggedImage.file);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Error al subir imagen');
      }

      const result = await response.json();
      const imageUrl = result.url;

      // Actualizar el producto en Firebase con la nueva imagen
      const productoRef = doc(db, "productos", targetProduct.id);
      const currentImages = targetProduct.imagenes || [];
      
      await updateDoc(productoRef, {
        imagenes: [...currentImages, imageUrl],
        fechaActualizacion: new Date().toISOString(),
      });

      // Cerrar modal y mostrar éxito
      setDragDropModalOpen(false);
      setDraggedImage(null);
      setTargetProduct(null);
      showToast("¡Imagen subida correctamente al producto!", "success");

    } catch (error) {
      console.error("Error al subir imagen:", error);
      showToast("Error al subir la imagen: " + error.message, "error");
    } finally {
      setUploadingImage(false);
    }
  };

  const handleCloseImageModal = () => {
    if (!uploadingImage) {
      setDragDropModalOpen(false);
      setDraggedImage(null);
      setTargetProduct(null);
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

  // Efecto para actualizar selectAll cuando cambia la selección
  useEffect(() => {
    if (productosPaginados.length > 0) {
      const allSelected = productosPaginados.every(p => selectedProducts.includes(p.id));
      setSelectAll(allSelected);
    } else {
      setSelectAll(false);
    }
  }, [selectedProducts, productosPaginados]);

  // Efecto para limpiar selección cuando cambian los filtros
  useEffect(() => {
    setSelectedProducts([]);
    setSelectAll(false);
  }, [filtro, cat, filtroTipoMadera, filtroSubCategoria, filtroTienda]);

  // Efecto para cerrar dropdowns cuando se hace clic fuera
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!event.target.closest('.dropdown-container')) {
        setImportDropdownOpen(false);
        setExportDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Efecto para cerrar dropdowns cuando se abren modales
  useEffect(() => {
    if (open || openBulk || openBulkFerreteria || openBulkObras || deleteModalOpen || bulkEditModalOpen) {
      setImportDropdownOpen(false);
      setExportDropdownOpen(false);
    }
  }, [open, openBulk, openBulkFerreteria, openBulkObras, deleteModalOpen, bulkEditModalOpen]);

  // Funciones para selección múltiple
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
      setSelectedProducts(productosPaginados.map(p => p.id));
      setSelectAll(true);
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedProducts.length === 0) return;
    
    setDeleteLoading(true);
    setDeleteMessage("");
    
    try {
      const batch = writeBatch(db);
      
      selectedProducts.forEach(productId => {
        const productRef = doc(db, "productos", productId);
        batch.delete(productRef);
      });
      
      await batch.commit();
      
      setDeleteMessage(`Se eliminaron ${selectedProducts.length} producto(s) correctamente`);
      setSelectedProducts([]);
      setSelectAll(false);
      
      setTimeout(() => {
        setDeleteModalOpen(false);
        setDeleteMessage("");
      }, 2000);
      
    } catch (error) {
      setDeleteMessage("Error al eliminar productos: " + error.message);
    } finally {
      setDeleteLoading(false);
    }
  };

  // Función para edición masiva de productos
  const handleBulkEdit = async () => {
    if (selectedProducts.length === 0) return;
    
    setBulkEditLoading(true);
    setBulkEditMessage("");
    
    try {
      const batch = writeBatch(db);
      const updates = {};
      
      // Solo incluir campos que han sido modificados
      if (bulkEditForm.estado) {
        updates.estado = bulkEditForm.estado;
      }
      if (bulkEditForm.estadoTienda) {
        updates.estadoTienda = bulkEditForm.estadoTienda;
      }
      if (bulkEditForm.unidadMedida) {
        updates.unidadMedida = bulkEditForm.unidadMedida;
      }
      
      // Si no hay campos para actualizar, mostrar mensaje
      if (Object.keys(updates).length === 0) {
        setBulkEditMessage("No hay campos para actualizar. Selecciona al menos un campo.");
        setBulkEditLoading(false);
        return;
      }
      
      // Agregar fecha de actualización
      updates.fechaActualizacion = new Date().toISOString();
      
      // Aplicar actualizaciones a todos los productos seleccionados
      selectedProducts.forEach(productId => {
        const productRef = doc(db, "productos", productId);
        batch.update(productRef, updates);
      });
      
      await batch.commit();
      
      setBulkEditMessage(`Se actualizaron ${selectedProducts.length} producto(s) correctamente`);
      
      // Limpiar formulario y cerrar modal después de un delay
      setTimeout(() => {
        setBulkEditModalOpen(false);
        setBulkEditForm({ estado: "", estadoTienda: "", unidadMedida: "" });
        setBulkEditMessage("");
        setSelectedProducts([]);
        setSelectAll(false);
      }, 2000);
      
    } catch (error) {
      setBulkEditMessage("Error al actualizar productos: " + error.message);
    } finally {
      setBulkEditLoading(false);
    }
  };

  // Función para abrir modal de edición masiva
  const openBulkEditModal = () => {
    setBulkEditForm({ estado: "", estadoTienda: "", unidadMedida: "" });
    setBulkEditMessage("");
    setBulkEditModalOpen(true);
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
          <div className="flex flex-col xl:flex-row gap-6 items-start xl:items-center justify-between">
            {/* Filtros y búsqueda */}
            <div className="flex flex-col sm:flex-row gap-3 w-full xl:w-auto">
              <select
                value={cat}
                onChange={(e) => {
                  setCat(e.target.value);
                  // Limpiar filtros específicos al cambiar categoría
                  setFiltroTipoMadera("");
                  setFiltroSubCategoria("");
                }}
                className="w-full sm:w-48 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white shadow-sm hover:border-gray-400 transition-colors"
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
                className="w-full sm:w-64 shadow-sm hover:shadow-md transition-shadow"
              />
            </div>

            {/* Botones de acción principales */}
            <div className="flex flex-col sm:flex-row gap-3 w-full xl:w-auto">
              {/* Botón Agregar Producto */}
              <Button 
                variant="default" 
                onClick={() => setOpen(true)}
                className="w-full sm:w-auto bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-lg hover:shadow-xl transition-all duration-200 font-medium"
              >
                <Plus className="w-4 h-4 mr-2" />
                Agregar Producto
              </Button>

              {/* Botón Importar con dropdown */}
              <div className="relative dropdown-container">
                <Button 
                  variant="outline" 
                  onClick={() => setImportDropdownOpen(!importDropdownOpen)}
                  className="w-full sm:w-auto border-2 border-gray-200 hover:border-blue-500 hover:bg-blue-50 transition-all duration-200 font-medium"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Importar
                  <svg className={`w-4 h-4 ml-2 transition-transform duration-200 ${importDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </Button>
                
                {/* Dropdown de importación */}
                {importDropdownOpen && (
                  <div className="absolute top-full right-0 mt-2 w-64 bg-white border border-gray-200 rounded-lg shadow-xl z-50">
                    <div className="p-2">
                      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-3 py-2 border-b border-gray-100">
                        Seleccionar tipo de importación
                      </div>
                      <button
                        onClick={() => {
                          setOpenBulk(true);
                          setImportDropdownOpen(false);
                        }}
                        className="w-full text-left px-3 py-3 hover:bg-orange-50 rounded-md transition-colors duration-150 flex items-center gap-3 group"
                      >
                        <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center group-hover:bg-orange-200 transition-colors">
                          🌲
                        </div>
                        <div>
                          <div className="font-medium text-gray-900">Importar Maderas</div>
                          <div className="text-xs text-gray-500">Productos de madera desde CSV</div>
                        </div>
                      </button>
                      <button
                        onClick={() => {
                          setOpenBulkFerreteria(true);
                          setImportDropdownOpen(false);
                        }}
                        className="w-full text-left px-3 py-3 hover:bg-blue-50 rounded-md transition-colors duration-150 flex items-center gap-3 group"
                      >
                        <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center group-hover:bg-blue-200 transition-colors">
                          🔧
                        </div>
                        <div>
                          <div className="font-medium text-gray-900">Importar Ferretería</div>
                          <div className="text-xs text-gray-500">Herramientas y accesorios</div>
                        </div>
                      </button>
                      <button
                        onClick={() => {
                          setOpenBulkObras(true);
                          setImportDropdownOpen(false);
                        }}
                        className="w-full text-left px-3 py-3 hover:bg-green-50 rounded-md transition-colors duration-150 flex items-center gap-3 group"
                      >
                        <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center group-hover:bg-green-200 transition-colors">
                          🏗️
                        </div>
                        <div>
                          <div className="font-medium text-gray-900">Importar Obras</div>
                          <div className="text-xs text-gray-500">Productos para construcción</div>
                        </div>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Botón Exportar con dropdown */}
              <div className="relative dropdown-container">
                <Button 
                  variant="outline" 
                  onClick={() => setExportDropdownOpen(!exportDropdownOpen)}
                  className="w-full sm:w-auto border-2 border-gray-200 hover:border-green-500 hover:bg-green-50 transition-all duration-200 font-medium"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Exportar
                  <svg className={`w-4 h-4 ml-2 transition-transform duration-200 ${exportDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </Button>
                
                {/* Dropdown de exportación */}
                {exportDropdownOpen && (
                  <div className="absolute top-full right-0 mt-2 w-64 bg-white border border-gray-200 rounded-lg shadow-xl z-50">
                    <div className="p-2">
                      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-3 py-2 border-b border-gray-100">
                        Seleccionar tipo de exportación
                      </div>
                      <button
                        onClick={() => {
                          exportarMaderasCSV();
                          setExportDropdownOpen(false);
                        }}
                        className="w-full text-left px-3 py-3 hover:bg-orange-50 rounded-md transition-colors duration-150 flex items-center gap-3 group"
                      >
                        <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center group-hover:bg-orange-200 transition-colors">
                          🌲
                        </div>
                        <div>
                          <div className="font-medium text-gray-900">Exportar Maderas</div>
                          <div className="text-xs text-gray-500">Descargar catálogo de maderas</div>
                        </div>
                      </button>
                      <button
                        onClick={() => {
                          exportarFerreteriaCSV();
                          setExportDropdownOpen(false);
                        }}
                        className="w-full text-left px-3 py-3 hover:bg-blue-50 rounded-md transition-colors duration-150 flex items-center gap-3 group"
                      >
                        <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center group-hover:bg-blue-200 transition-colors">
                          🔧
                        </div>
                        <div>
                          <div className="font-medium text-gray-900">Exportar Ferretería</div>
                          <div className="text-xs text-gray-500">Descargar catálogo de ferretería</div>
                        </div>
                      </button>
                      <button
                        onClick={() => {
                          exportarObrasCSV();
                          setExportDropdownOpen(false);
                        }}
                        className="w-full text-left px-3 py-3 hover:bg-purple-50 rounded-md transition-colors duration-150 flex items-center gap-3 group"
                      >
                        <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center group-hover:bg-purple-200 transition-colors">
                          🏗️
                        </div>
                        <div>
                          <div className="font-medium text-gray-900">Exportar Obras</div>
                          <div className="text-xs text-gray-500">Descargar catálogo de obras</div>
                        </div>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Botones de acción para productos seleccionados (solo visible cuando hay selección) */}
              {selectedProducts.length > 0 && (
                <>
                  {/* Botón Editar Masivo */}
                  <Button
                    variant="outline"
                    onClick={openBulkEditModal}
                    className="w-full sm:w-auto border-2 border-blue-200 hover:border-blue-500 hover:bg-blue-50 transition-all duration-200 font-medium text-blue-700"
                  >
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    Editar ({selectedProducts.length})
                  </Button>

                  {/* Botón Borrar Seleccionados */}
                  <Button
                    variant="destructive"
                    onClick={() => setDeleteModalOpen(true)}
                    className="w-full sm:w-auto bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-700 hover:to-pink-700 text-white shadow-lg hover:shadow-xl transition-all duration-200 font-medium"
                  >
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Borrar ({selectedProducts.length})
                  </Button>
                </>
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
            {cat === "Ferretería" && subCategoriasFerreteria.length > 0 && (
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
                  {subCategoriasFerreteria.map((subCategoria) => (
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

            {/* Filtro de subcategoría de obras */}
            {cat === "Obras" && subCategoriasObras.length > 0 && (
              <div className="flex-1">
                <div className="flex bg-white rounded-lg p-1 shadow-sm border border-gray-200">
                  <button
                    type="button"
                    className={`rounded-md px-4 py-1 text-sm flex items-center gap-2 transition-all ${
                      filtroSubCategoria === ""
                        ? "bg-purple-600 text-white"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                    onClick={() => setFiltroSubCategoria("")}
                  >
                    Todas las subcategorías
                  </button>
                  {subCategoriasObras.map((subCategoria) => (
                    <button
                      key={subCategoria}
                      type="button"
                      className={`rounded-full px-4 py-1 text-sm flex items-center gap-2 transition-all ${
                        filtroSubCategoria === subCategoria
                          ? "bg-purple-600 text-white"
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

            {/* Filtro de estado de tienda - siempre visible */}
            <div className="flex-1">
              <div className="flex bg-white rounded-lg p-1 shadow-sm border border-gray-200">
                <button
                  type="button"
                  className={`rounded-full px-4 py-1 text-sm flex items-center gap-2 transition-all ${
                    filtroTienda === ""
                      ? "bg-purple-600 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                  onClick={() => setFiltroTienda("")}
                >
                  🏪 Todas las tiendas
                  <span className="bg-white/20 px-2 py-0.5 rounded-full text-xs font-medium">
                    {productos.length}
                  </span>
                </button>
                <button
                  type="button"
                  className={`rounded-md px-4 py-1 text-sm flex items-center gap-2 transition-all ${
                    filtroTienda === "Activo"
                      ? "bg-green-600 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                  onClick={() => setFiltroTienda("Activo")}
                >
                  ✅ Activos en tienda
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    filtroTienda === "Activo"
                      ? "bg-white/20"
                      : "bg-green-100 text-green-700"
                  }`}>
                    {productos.filter(p => p.estadoTienda === "Activo").length}
                  </span>
                </button>
                <button
                  type="button"
                  className={`rounded-md px-4 py-1 text-sm flex items-center gap-2 transition-all ${
                    filtroTienda === "Inactivo"
                      ? "bg-red-600 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                  onClick={() => setFiltroTienda("Inactivo")}
                >
                  ❌ Inactivos en tienda
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    filtroTienda === "Inactivo"
                      ? "bg-white/20"
                      : "bg-red-100 text-red-700"
                  }`}>
                    {productos.filter(p => !p.estadoTienda || p.estadoTienda === "Inactivo").length}
                  </span>
                </button>
              </div>
            </div>
          </div>

          {/* Indicador de productos filtrados */}
          <div className="flex items-center justify-between">
            {(filtro || cat || filtroTipoMadera || filtroSubCategoria || filtroTienda) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setFiltro("");
                  setCat("");
                  setFiltroTipoMadera("");
                  setFiltroSubCategoria("");
                  setFiltroTienda("");
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
                      <div className="flex items-center justify-center">
                        <input
                          type="checkbox"
                          checked={selectAll}
                          onChange={handleSelectAll}
                          className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                        />
                      </div>
                    </th>
                    <th className="h-14 px-4 ltr:text-left rtl:text-right last:ltr:text-right last:rtl:text-left align-middle font-semibold text-sm text-default-800 capitalize [&:has([role=checkbox])]:ltr:pr-0 [&:has([role=checkbox])]:rtl:pl-0">
                      Código
                    </th>
                    <th className="h-14 px-4 ltr:text-left rtl:text-right last:ltr:text-right last:rtl:text-left align-middle font-semibold text-sm text-default-800 capitalize [&:has([role=checkbox])]:ltr:pr-0 [&:has([role=checkbox])]:rtl:pl-0">
                      Producto
                    </th>
                    <th className="h-14 px-4 ltr:text-left rtl:text-right last:ltr:text-right last:rtl:text-left align-middle font-semibold text-sm text-default-800 capitalize [&:has([role=checkbox])]:ltr:pr-0 [&:has([role=checkbox])]:rtl:pl-0">
                      Categoría
                    </th>
                    <th className="h-14 px-4 ltr:text-left rtl:text-right last:ltr:text-right last:rtl:text-left align-middle font-semibold text-sm text-default-800 capitalize [&:has([role=checkbox])]:ltr:pr-0 [&:has([role=checkbox])]:rtl:pl-0">
                      Subcategoría
                    </th>
                    <th className="h-14 px-4 ltr:text-left rtl:text-right last:ltr:text-right last:rtl:text-left align-middle font-semibold text-sm text-default-800 capitalize [&:has([role=checkbox])]:ltr:pr-0 [&:has([role=checkbox])]:rtl:pl-0">
                      Tipo de Madera
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
                      Precio unit.
                    </th>
                    <th className="h-14 px-4 ltr:text-left rtl:text-right last:ltr:text-right last:rtl:text-left align-middle font-semibold text-sm text-default-800 capitalize [&:has([role=checkbox])]:ltr:pr-0 [&:has([role=checkbox])]:rtl:pl-0">
                      Precio Cepillado
                    </th>
                    <th className="h-14 px-4 ltr:text-left rtl:text-right last:ltr:text-right last:rtl:text-left align-middle font-semibold text-sm text-default-800 capitalize [&:has([role=checkbox])]:ltr:pr-0 [&:has([role=checkbox])]:rtl:pl-0">
                      Precio total
                    </th>
                    <th className="h-14 px-4 ltr:text-left rtl:text-right last:ltr:text-right last:rtl:text-left align-middle font-semibold text-sm text-default-800 capitalize [&:has([role=checkbox])]:ltr:pr-0 [&:has([role=checkbox])]:rtl:pl-0">
                      Estado
                    </th>
                    <th className="h-14 px-4 ltr:text-left rtl:text-right last:ltr:text-right last:rtl:text-left align-middle font-semibold text-sm text-default-800 capitalize [&:has([role=checkbox])]:ltr:pr-0 [&:has([role=checkbox])]:rtl:pl-0">
                      Tienda
                    </th>
                    <th className="h-14 px-4 ltr:text-left rtl:text-right last:ltr:text-right last:rtl:text-left align-middle font-semibold text-sm text-default-800 capitalize [&:has([role=checkbox])]:ltr:pr-0 [&:has([role=checkbox])]:rtl:pl-0">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody className="relative">
                  {/* Overlay de carga durante la paginación */}
                  {isLoadingPagination && (
                    <div className="absolute inset-0 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm z-10 flex items-center justify-center rounded-lg">
                      <div className="flex items-center gap-3 bg-white dark:bg-gray-700 px-4 py-3 rounded-lg shadow-lg border border-gray-200 dark:border-gray-600">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          Cargando productos...
                        </span>
                      </div>
                    </div>
                  )}
                  
                  {productosPaginados.map((p) => (
                    <tr
                      key={p.id}
                      className={`border-b border-default-300 transition-all duration-200 data-[state=selected]:bg-muted ${
                        dragOverProductId === p.id 
                          ? 'bg-gradient-to-r from-blue-50 to-indigo-50 scale-[1.01] shadow-lg border-blue-300 ring-2 ring-blue-400 ring-opacity-50' 
                          : 'hover:bg-gray-50'
                      }`}
                      onDragOver={(e) => handleDragOver(e, p.id)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, p)}
                    >
                      <td className="p-4 align-middle text-sm text-default-600 last:text-right last:rtl:text-left font-normal [&:has([role=checkbox])]:ltr:pr-0 [&:has([role=checkbox])]:rtl:pl-0">
                        <div className="flex items-center justify-center">
                          <input
                            type="checkbox"
                            checked={selectedProducts.includes(p.id)}
                            onChange={() => handleSelectProduct(p.id)}
                            className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                          />
                        </div>
                      </td>
                      <td className="p-4 align-middle text-sm text-default-600 last:text-right last:rtl:text-left font-normal [&:has([role=checkbox])]:ltr:pr-0 [&:has([role=checkbox])]:rtl:pl-0">
                        <div className="font-semibold text-default-900">
                          {p.codigo}
                        </div>
                      </td>
                      <td className="p-4 align-middle text-sm text-default-600 last:text-right last:rtl:text-left font-normal [&:has([role=checkbox])]:ltr:pr-0 [&:has([role=checkbox])]:rtl:pl-0">
                        <div className="font-semibold text-default-900">
                          {p.nombre}
                        </div>
                      </td>
                      <td className="p-4 align-middle text-sm text-default-600 last:text-right last:rtl:text-left font-normal [&:has([role=checkbox])]:ltr:pr-0 [&:has([role=checkbox])]:rtl:pl-0">
                        <div className="font-semibold text-default-900">
                          {p.categoria}
                        </div>
                      </td>
                      <td className="p-4 align-middle text-sm text-default-600 last:text-right last:rtl:text-left font-normal [&:has([role=checkbox])]:ltr:pr-0 [&:has([role=checkbox])]:rtl:pl-0">
                        <div className="font-semibold text-default-900">
                          {p.categoria === "Maderas" ? (p.tipoMadera || "-") : "-"}
                        </div>
                      </td>
                      <td className="p-4 align-middle text-sm text-default-600 last:text-right last:rtl:text-left font-normal [&:has([role=checkbox])]:ltr:pr-0 [&:has([role=checkbox])]:rtl:pl-0">
                        <div className="font-semibold text-default-900">
                          {p.categoria === "Maderas" ? (p.subcategoria || "-") : (p.subCategoria || "-")}
                        </div>
                      </td>
                      <td className="p-4 align-middle text-sm text-default-600 last:text-right last:rtl:text-left font-normal [&:has([role=checkbox])]:ltr:pr-0 [&:has([role=checkbox])]:rtl:pl-0">
                        <div className="font-semibold text-default-900">
                          {p.unidadMedida || "-"}
                        </div>
                      </td>
                      <td className="p-4 align-middle text-sm text-default-600 last:text-right last:rtl:text-left font-normal [&:has([role=checkbox])]:ltr:pr-0 [&:has([role=checkbox])]:rtl:pl-0">
                        <div className="font-semibold text-default-900">
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
                            value={p.cantidad || ""}
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
                          <div className="flex items-center justify-center font-semibold text-default-900">
                            ${formatearNumeroArgentino((() => {
                              const unidad = (p.unidadMedida || "").toString();
                              if (unidad === "M2") {
                                return calcularPrecioMachimbre({
                                  alto: Number(p.alto) || 0,
                                  largo: Number(p.largo) || 0,
                                  cantidad: 1,
                                  precioPorPie: Number(p.precioPorPie) || 0,
                                });
                              } else if (unidad === "Unidad") {
                                const pUnit = Number(p.precioPorPie) || 0;
                                return Math.round(pUnit / 100) * 100;
                              }
                              return calcularPrecioCorteMadera({
                                alto: Number(p.alto) || 0,
                                ancho: Number(p.ancho) || 0,
                                largo: Number(p.largo) || 0,
                                precioPorPie: Number(p.precioPorPie) || 0,
                              });
                            })())}
                          </div>
                        ) : p.categoria === "Obras" ? (
                          <div className="flex items-center justify-center font-semibold text-default-900">
                            ${formatearNumeroArgentino(Number(p.valorVenta) || 0)}
                          </div>
                        ) : (
                          <div className="flex items-center justify-center font-semibold text-default-900">
                            ${formatearNumeroArgentino(Number(p.valorVenta) || 0)}
                          </div>
                        )}
                      </td>
                      <td className="p-4 align-middle text-sm text-default-600 last:text-right last:rtl:text-left font-normal [&:has([role=checkbox])]:ltr:pr-0 [&:has([role=checkbox])]:rtl:pl-0">
                        {p.categoria === "Maderas" ? (
                          <div className="flex items-center justify-center font-semibold text-default-900">
                            ${formatearNumeroArgentino((() => {
                              const unidad = (p.unidadMedida || "").toString();
                              let precioBase = 0;
                              if (unidad === "M2") {
                                precioBase = calcularPrecioMachimbre({
                                  alto: Number(p.alto) || 0,
                                  largo: Number(p.largo) || 0,
                                  cantidad: 1,
                                  precioPorPie: Number(p.precioPorPie) || 0,
                                });
                              } else if (unidad === "Unidad") {
                                const pUnit = Number(p.precioPorPie) || 0;
                                precioBase = Math.round(pUnit / 100) * 100;
                              } else {
                                precioBase = calcularPrecioCorteMadera({
                                  alto: Number(p.alto) || 0,
                                  ancho: Number(p.ancho) || 0,
                                  largo: Number(p.largo) || 0,
                                  precioPorPie: Number(p.precioPorPie) || 0,
                                });
                              }
                              const aplicaCepillado = unidad !== "Unidad";
                              const precioConCepillado = aplicaCepillado ? precioBase * 1.066 : precioBase;
                              return Math.round(precioConCepillado / 100) * 100;
                            })())}
                          </div>
                        ) : (
                          <span className="text-gray-400">-</span>
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
                                        const unidad = (p.unidadMedida || "").toString();
                                        const cantidad = Number(p.cantidad) || 1;
                                        if (unidad === "M2") {
                                          return calcularPrecioMachimbre({
                                            alto: Number(p.alto) || 0,
                                            largo: Number(p.largo) || 0,
                                            cantidad,
                                            precioPorPie: Number(p.precioPorPie) || 0,
                                          });
                                        } else if (unidad === "Unidad") {
                                          const pUnit = Math.round((Number(p.precioPorPie) || 0) / 100) * 100;
                                          return Math.round((pUnit * cantidad) / 100) * 100;
                                        }
                                        const base = calcularPrecioCorteMadera({
                                          alto: Number(p.alto) || 0,
                                          ancho: Number(p.ancho) || 0,
                                          largo: Number(p.largo) || 0,
                                          precioPorPie: Number(p.precioPorPie) || 0,
                                        });
                                        return Math.round((base * cantidad) / 100) * 100;
                                      })()
                                    : p.categoria === "Obras"
                                    ? (Number(p.valorVenta) || 0) * (Number(p.cantidad) || 1)
                                    : (Number(p.valorVenta) || 0) * (Number(p.cantidad) || 1);
                                return precioUnitario;
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
                      <td className="p-4 align-middle text-sm text-default-600 last:text-right last:rtl:text-left font-normal [&:has([role=checkbox])]:rtl:pl-0">
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-semibold ${
                            p.estadoTienda === "Activo"
                              ? "bg-green-100 text-green-800"
                              : p.estadoTienda === "Inactivo" || !p.estadoTienda
                              ? "bg-red-100 text-red-800"
                              : "bg-yellow-100 text-yellow-700"
                          }`}
                        >
                          {p.estadoTienda || "Inactivo"}
                        </span>
                      </td>
                      <td className="p-4 align-middle text-sm text-default-600 last:text-right last:rtl:text-left font-normal [&:has([role=checkbox])]:ltr:pr-0 [&:has([role=checkbox])]:rtl:pl-0">
                        <div className="flex gap-2 justify-center">
                          <Link href={`/productos/${p.id}`}>
                            <Button
                              size="sm"
                              variant="outline"
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
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          
          {/* Paginación profesional */}
          {productosFiltrados.length > 0 && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50">
              <div className="flex items-center gap-4">
                <div className="text-sm text-gray-600">
                  Mostrando <span className="font-semibold">
                    {((paginaActual - 1) * productosPorPagina) + 1}
                  </span> a <span className="font-semibold">
                    {Math.min(paginaActual * productosPorPagina, totalProductos)}
                  </span> de <span className="font-semibold">{totalProductos}</span> productos
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">Productos por página:</span>
                  <select
                    value={productosPorPagina}
                    onChange={(e) => {
                      setProductosPorPagina(Number(e.target.value));
                      setPaginaActual(1);
                    }}
                    className="px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => cambiarPagina(1)}
                  disabled={paginaActual === 1}
                  className="px-3 py-1"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                  </svg>
                </Button>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => cambiarPagina(paginaActual - 1)}
                  disabled={paginaActual === 1}
                  className="px-3 py-1"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                  </svg>
                </Button>
                
                <div className="flex items-center gap-1">
                  {(() => {
                    const paginas = [];
                    const paginasAMostrar = 5;
                    const inicio = Math.max(1, paginaActual - Math.floor(paginasAMostrar / 2));
                    const fin = Math.min(totalPaginas, inicio + paginasAMostrar - 1);
                    
                    // Agregar primera página si no está incluida
                    if (inicio > 1) {
                      paginas.push(
                        <Button
                          key={1}
                          variant={paginaActual === 1 ? "default" : "outline"}
                          size="sm"
                          onClick={() => cambiarPagina(1)}
                          className="px-3 py-1"
                        >
                          1
                        </Button>
                      );
                      if (inicio > 2) {
                        paginas.push(
                          <span key="dots1" className="px-2 text-gray-500">...</span>
                        );
                      }
                    }
                    
                    // Agregar páginas del rango
                    for (let i = inicio; i <= fin; i++) {
                      paginas.push(
                        <Button
                          key={i}
                          variant={paginaActual === i ? "default" : "outline"}
                          size="sm"
                          onClick={() => cambiarPagina(i)}
                          className="px-3 py-1"
                        >
                          {i}
                        </Button>
                      );
                    }
                    
                    // Agregar última página si no está incluida
                    if (fin < totalPaginas) {
                      if (fin < totalPaginas - 1) {
                        paginas.push(
                          <span key="dots2" className="px-2 text-gray-500">...</span>
                        );
                      }
                      paginas.push(
                        <Button
                          key={totalPaginas}
                          variant={paginaActual === totalPaginas ? "default" : "outline"}
                          size="sm"
                          onClick={() => cambiarPagina(totalPaginas)}
                          className="px-3 py-1"
                        >
                          {totalPaginas}
                        </Button>
                      );
                    }
                    
                    return paginas;
                  })()}
                </div>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => cambiarPagina(paginaActual + 1)}
                  disabled={paginaActual === totalPaginas}
                  className="px-3 py-1"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                  </svg>
                </Button>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => cambiarPagina(totalPaginas)}
                  disabled={paginaActual === totalPaginas}
                  className="px-3 py-1"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 5l7 7-7 7m-8 0l7-7-7-7" />
                  </svg>
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[95vw] max-w-[1000px] p-0 overflow-hidden shadow-2xl">
          <div className="relative">
            {/* Header con gradiente y diseño moderno */}
            <div className="bg-gradient-to-br from-blue-600 via-indigo-700 to-purple-800 text-white px-8 py-8 relative overflow-hidden">
              <div className="absolute inset-0 bg-black/10"></div>
              <div className="relative z-10">
                <div className="flex items-center gap-4 mb-3">
                  <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm">
                    <Boxes className="w-7 h-7" />
                  </div>
                  <div>
                    <DialogTitle className="text-3xl font-bold text-white mb-1">
                      Agregar Nuevo Producto
                    </DialogTitle>
                    <p className="text-blue-100 text-base">
                      Complete la información del producto para agregarlo al inventario
                    </p>
                  </div>
                </div>
              </div>
              {/* Elementos decorativos animados */}
              <div className="absolute top-0 right-0 w-40 h-40 bg-white/5 rounded-full -translate-y-20 translate-x-20 animate-pulse"></div>
              <div className="absolute bottom-0 left-0 w-32 h-32 bg-white/5 rounded-full translate-y-16 -translate-x-16 animate-pulse delay-1000"></div>
              <div className="absolute top-1/2 left-1/4 w-16 h-16 bg-white/3 rounded-full animate-bounce"></div>
            </div>
            
            {/* Contenido del formulario con scroll suave */}
            <div className="max-h-[75vh] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
              <div className="px-8 py-8">
                <FormularioProducto
                  onClose={() => setOpen(false)}
                  onSuccess={() => setReload((r) => !r)}
                />
              </div>
            </div>
            
            {/* Footer con diseño moderno - solo información */}
            <div className="bg-gradient-to-r from-gray-50 via-gray-100 to-gray-50 border-t border-gray-200 px-8 py-4">
              <div className="flex items-center justify-center gap-3 text-sm text-gray-600">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <span className="font-medium">Tip:</span> Los campos marcados con <span className="text-red-500 font-bold">*</span> son obligatorios
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal de Carga Masiva */}
      <Dialog open={openBulk} onOpenChange={setOpenBulk}>
        <DialogContent className="w-[95vw] max-w-[800px] max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Importar Maderas</DialogTitle>
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
            <DialogTitle>Importar Ferretería</DialogTitle>
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
                <li>• <strong>Campos obligatorios:</strong> codigo, nombre, descripcion, categoria, subCategoria, unidadMedida, proveedor, stockMinimo, valorCompra, valorVenta, estado</li>
                <li>• <strong>Campos opcionales:</strong> stock (si no se proporciona, se establecerá en 0), estadoTienda</li>
                <li>• El campo "stockMinimo" debe ser un número positivo</li>
                <li>
                  • El campo "valorCompra" y "valorVenta" deben ser números
                  positivos
                </li>
                <li>• El campo "stock" es opcional, pero si se proporciona debe ser un número válido mayor o igual a 0</li>
                <li>• El campo "proveedor" es obligatorio</li>
                <li>• Se agregarán automáticamente las fechas de creación</li>
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

      {/* Modal de Carga Masiva Obras */}
      <Dialog open={openBulkObras} onOpenChange={setOpenBulkObras}>
        <DialogContent className="w-[95vw] max-w-[800px] max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Importar Obras</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            {bulkStatusObras && (
              <div
                className={`p-3 rounded-lg flex items-center gap-2 text-sm ${
                  bulkStatusObras === "success"
                    ? "bg-green-50 text-green-800 border border-green-200"
                    : "bg-red-50 text-red-800 border border-red-200"
                }`}
              >
                {bulkStatusObras === "success" ? (
                  <CheckCircle className="w-4 h-4" />
                ) : (
                  <AlertCircle className="w-4 h-4" />
                )}
                {bulkMessageObras}
              </div>
            )}

            {/* Barra de progreso */}
            {bulkLoadingObras && bulkProgressObras.total > 0 && (
              <div className="bg-blue-50 p-3 rounded-lg">
                <div className="flex justify-between text-sm mb-2">
                  <span>Procesando productos...</span>
                  <span>
                    {bulkProgressObras.current} /{" "}
                    {bulkProgressObras.total}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{
                      width: `${
                        (bulkProgressObras.current /
                          bulkProgressObras.total) *
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
                  onChange={(e) => setBulkFileObras(e.target.files[0])}
                  className="hidden"
                  id="file-upload-obras"
                  disabled={bulkLoadingObras}
                />
                <label
                  htmlFor="file-upload-obras"
                  className="cursor-pointer bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Seleccionar archivo CSV
                </label>
                {bulkFileObras && (
                  <div className="mt-4 p-3 bg-green-50 rounded-lg">
                    <p className="text-sm text-green-800">
                      ✅ Archivo seleccionado:{" "}
                      <strong>{bulkFileObras.name}</strong>
                    </p>
                  </div>
                )}
                <p className="text-sm text-gray-500 mt-2">
                  Formato soportado: CSV (guarda tu Excel como CSV)
                </p>
                <button
                  type="button"
                  onClick={downloadExampleCSVObras}
                  className="mt-4 text-sm text-blue-600 hover:text-blue-800 underline"
                >
                  📥 Descargar ejemplo CSV
                </button>
              </div>
            </div>

            <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-200">
              <h4 className="font-semibold text-yellow-800 mb-2">
                📋 Formato requerido para Obras:
              </h4>
              <ul className="text-sm text-yellow-700 space-y-1">
                <li>• <strong>codigo</strong>: Código único del producto</li>
                <li>• <strong>nombre</strong>: Nombre del producto</li>
                <li>• <strong>descripcion</strong>: Descripción del producto</li>
                <li>• <strong>categoria</strong>: Categoría del producto</li>
                <li>• <strong>subCategoria</strong>: Subcategoría del producto</li>
                <li>• <strong>estado</strong>: Estado del producto (Activo/Inactivo)</li>
                <li>• <strong>unidad</strong>: Cantidad de unidades</li>
                <li>• <strong>stockMinimo</strong>: Stock mínimo requerido</li>
                <li>• <strong>unidadMedida</strong>: Unidad de medida (M2, etc.)</li>
                <li>• <strong>valorVenta</strong>: Precio de venta</li>
              </ul>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setOpenBulkObras(false)}
                disabled={bulkLoadingObras}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleBulkUploadObras}
                disabled={!bulkFileObras || bulkLoadingObras}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {bulkLoadingObras ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Cargando Productos
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    Cargar Productos
                  </>
                )}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>



      {/* Modal de Edición Masiva */}
      <Dialog open={bulkEditModalOpen} onOpenChange={setBulkEditModalOpen}>
        <DialogContent className="w-[95vw] max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-blue-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Edición Masiva de Productos
            </DialogTitle>
          </DialogHeader>
          
          <div className="py-4">
            {/* Información de productos seleccionados */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <div className="flex items-center gap-2 mb-2">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="font-semibold text-blue-800">Productos Seleccionados</span>
              </div>
              <p className="text-blue-700">
                Se editarán <strong>{selectedProducts.length}</strong> producto(s) seleccionado(s).
                Los cambios se aplicarán a todos los productos de la selección.
              </p>
            </div>

            {/* Formulario de edición masiva */}
            <div className="space-y-6">
              {/* Campo Estado */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">
                  Estado de los Productos
                </label>
                <select
                  value={bulkEditForm.estado}
                  onChange={(e) => setBulkEditForm(prev => ({ ...prev, estado: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">No cambiar estado</option>
                  <option value="Activo">Activo</option>
                  <option value="Inactivo">Inactivo</option>
                  <option value="Descontinuado">Descontinuado</option>
                </select>
                <p className="text-xs text-gray-500">
                  Selecciona un nuevo estado para todos los productos o déjalo vacío para no modificar
                </p>
              </div>

              {/* Campo Tienda */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">
                  Estado de Tienda
                </label>
                <select
                  value={bulkEditForm.estadoTienda}
                  onChange={(e) => setBulkEditForm(prev => ({ ...prev, estadoTienda: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">No cambiar estado de tienda</option>
                  <option value="Activo">Activo</option>
                  <option value="Inactivo">Inactivo</option>
                </select>
                <p className="text-xs text-gray-500">
                  Selecciona un nuevo estado de tienda para todos los productos o déjalo vacío para no modificar
                </p>
              </div>

              {/* Campo Unidad de Medida */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">
                  Unidad de Medida
                </label>
                <div className="flex gap-2">
                  <select
                    value={bulkEditForm.unidadMedida}
                    onChange={(e) => setBulkEditForm(prev => ({ ...prev, unidadMedida: e.target.value }))}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">No cambiar unidad de medida</option>
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
                <p className="text-xs text-gray-500">
                  Selecciona una nueva unidad de medida para todos los productos o déjalo vacío para no modificar
                </p>
              </div>

              {/* Mensaje de estado */}
              {bulkEditMessage && (
                <div className={`p-3 rounded-lg text-sm ${
                  bulkEditMessage.startsWith("Error")
                    ? "bg-red-50 text-red-800 border border-red-200"
                    : "bg-green-50 text-green-800 border border-green-200"
                }`}>
                  {bulkEditMessage}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setBulkEditModalOpen(false)}
              disabled={bulkEditLoading}
            >
              Cancelar
            </Button>
            <Button
              variant="default"
              onClick={handleBulkEdit}
              disabled={bulkEditLoading}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {bulkEditLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Actualizando...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Actualizar Productos
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de confirmación de borrado */}
      <Dialog open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
        <DialogContent className="w-[95vw] max-w-[500px]">
          <DialogHeader>
                          <DialogTitle className="flex items-center gap-2 text-red-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                Confirmar Borrado
              </DialogTitle>
          </DialogHeader>
          
          <div className="py-4">
                            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                    <span className="font-semibold text-red-800">¡Atención!</span>
                  </div>
              <p className="text-red-700">
                Estás a punto de eliminar <strong>{selectedProducts.length}</strong> producto(s) de forma permanente.
                Esta acción no se puede deshacer.
              </p>
            </div>
            
            {deleteMessage && (
              <div className={`p-3 rounded-lg text-sm mb-4 ${
                deleteMessage.startsWith("Error")
                  ? "bg-red-50 text-red-800 border border-red-200"
                  : "bg-green-50 text-green-800 border border-green-200"
              }`}>
                {deleteMessage}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setDeleteModalOpen(false)}
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
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Eliminar Productos
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de confirmación para Drag & Drop de imágenes */}
      <DragDropImageModal
        isOpen={dragDropModalOpen}
        onClose={handleCloseImageModal}
        onConfirm={handleConfirmImageUpload}
        imagePreview={draggedImage?.preview}
        fileName={draggedImage?.name}
        producto={targetProduct}
        uploading={uploadingImage}
      />

      {/* Notificación Toast */}
      <ToastNotification
        type={toastType}
        message={toastMessage}
        isVisible={toastVisible}
        onClose={() => setToastVisible(false)}
      />
    </div>
  );
};

export default ProductosPage;