"use client";
import React, { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Save,
  Loader2,
  CheckCircle,
  AlertCircle,
  Plus,
  X,
  Image as ImageIcon,
  Tag,
  Percent,
  Truck,
  Star,
  Gift,
  Zap,
  GripVertical,
} from "lucide-react";
import { db } from "@/lib/firebase";
import {
  doc,
  getDoc,
  updateDoc,
  collection,
  getDocs,
} from "firebase/firestore";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";

const ProductoDetailPage = () => {
  const router = useRouter();
  const params = useParams();
  const productId = params.id;

  const [producto, setProducto] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");

  // Estados para datos precargados
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

  // Formulario de edición
  const [editForm, setEditForm] = useState({
    codigo: "",
    nombre: "",
    descripcion: "",
    proveedor: "",
    unidadMedida: "",
    estado: "",
    estadoTienda: "",
    subcategoria: "",
    tipoMadera: "",
    // Nuevos campos para tienda
    imagenes: [],
    discount: {
      amount: 0,
      percentage: 0,
    },
    rating: 0,
    // Etiquetas
    freeShipping: false,
    featuredBrand: false,
    newArrival: false,
    specialOffer: false,
  });

  // Estados para nuevos campos
  const [uploadingGallery, setUploadingGallery] = useState(false);

  useEffect(() => {
    if (productId) {
      cargarProducto();
      cargarDatosPrecargados();
    }
  }, [productId]);

  const cargarProducto = async () => {
    try {
      setLoading(true);
      const productoRef = doc(db, "productos", productId);
      const productoSnap = await getDoc(productoRef);

      if (productoSnap.exists()) {
        const productoData = productoSnap.data();
        setProducto({ id: productoSnap.id, ...productoData });
        
        // Cargar formulario con datos existentes
        setEditForm({
          codigo: productoData.codigo || "",
          nombre: productoData.nombre || "",
          descripcion: productoData.descripcion || "",
          proveedor: productoData.proveedor || "",
          unidadMedida: productoData.unidadMedida || "",
          estado: productoData.estado || "Activo",
          estadoTienda: productoData.estadoTienda || "Activo",
          subcategoria: productoData.subcategoria || productoData.subCategoria || "",
          tipoMadera: productoData.tipoMadera || "",
          // Nuevos campos para tienda
          imagenes: productoData.imagenes || [],
          discount: productoData.discount || { amount: 0, percentage: 0 },
          rating: productoData.rating || 0,
          // Etiquetas
          freeShipping: productoData.freeShipping || false,
          featuredBrand: productoData.featuredBrand || false,
          newArrival: productoData.newArrival || false,
          specialOffer: productoData.specialOffer || false,
        });
      } else {
        setMessage("Producto no encontrado");
        setMessageType("error");
      }
    } catch (error) {
      setMessage("Error al cargar producto: " + error.message);
      setMessageType("error");
    } finally {
      setLoading(false);
    }
  };

  const cargarDatosPrecargados = async () => {
    try {
      const productosSnap = await getDocs(collection(db, "productos"));
      const productos = productosSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
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
          .filter(p => p.subcategoria || p.subCategoria)
          .map(p => p.subcategoria || p.subCategoria)
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
    } catch (error) {
      console.error("Error al cargar datos precargados:", error);
    }
  };

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

  const handleSave = async () => {
    setSaving(true);
    setMessage("");
    
    try {
      // Validación de campos obligatorios
      const camposObligatorios = ['nombre', 'descripcion', 'unidadMedida', 'estado', 'estadoTienda'];
      
      // Agregar campos específicos según categoría
      if (producto.categoria === "Ferretería") {
        camposObligatorios.push('subcategoria', 'proveedor');
      } else if (producto.categoria === "Maderas") {
        camposObligatorios.push('subcategoria', 'tipoMadera');
      }
      
      // Verificar campos vacíos
      const camposVacios = camposObligatorios.filter(campo => {
        if (campo === 'subcategoria') {
          return !editForm.subcategoria;
        }
        return !editForm[campo];
      });
      
      if (camposVacios.length > 0) {
        setMessage(`Error: Los siguientes campos son obligatorios: ${camposVacios.join(', ')}`);
        setMessageType("error");
        setSaving(false);
        return;
      }
      
      const productoRef = doc(db, "productos", productId);
      const updates = {};
      
      // Solo actualizar campos que han cambiado
      if (editForm.codigo !== producto.codigo) {
        updates.codigo = editForm.codigo;
      }
      if (editForm.nombre !== producto.nombre) {
        updates.nombre = editForm.nombre;
      }
      if (editForm.descripcion !== producto.descripcion) {
        updates.descripcion = editForm.descripcion;
      }
      if (editForm.proveedor !== producto.proveedor) {
        updates.proveedor = editForm.proveedor;
      }
      if (editForm.unidadMedida !== producto.unidadMedida) {
        updates.unidadMedida = editForm.unidadMedida;
      }
      if (editForm.estado !== producto.estado) {
        updates.estado = editForm.estado;
      }
      if (editForm.estadoTienda !== producto.estadoTienda) {
        updates.estadoTienda = editForm.estadoTienda;
      }
      
      // Guardar subcategoría en el campo correcto según la categoría
      if (producto.categoria === "Ferretería") {
        if (editForm.subcategoria !== (producto.subCategoria || producto.subcategoria)) {
          updates.subCategoria = editForm.subcategoria;
        }
      } else if (producto.categoria === "Maderas") {
        if (editForm.subcategoria !== (producto.subcategoria || producto.subCategoria)) {
          updates.subcategoria = editForm.subcategoria;
        }
      }
      
      if (editForm.tipoMadera !== producto.tipoMadera) {
        updates.tipoMadera = editForm.tipoMadera;
      }

      // Nuevos campos para tienda
      if (JSON.stringify(editForm.imagenes) !== JSON.stringify(producto.imagenes || [])) {
        updates.imagenes = editForm.imagenes;
      }
      if (JSON.stringify(editForm.discount) !== JSON.stringify(producto.discount || { amount: 0, percentage: 0 })) {
        updates.discount = editForm.discount;
      }
      if (editForm.rating !== producto.rating) {
        updates.rating = editForm.rating;
      }
      if (editForm.freeShipping !== producto.freeShipping) {
        updates.freeShipping = editForm.freeShipping;
      }
      if (editForm.featuredBrand !== producto.featuredBrand) {
        updates.featuredBrand = editForm.featuredBrand;
      }
      if (editForm.newArrival !== producto.newArrival) {
        updates.newArrival = editForm.newArrival;
      }
      if (editForm.specialOffer !== producto.specialOffer) {
        updates.specialOffer = editForm.specialOffer;
      }
      
      updates.fechaActualizacion = new Date().toISOString();

      await updateDoc(productoRef, updates);
      
      setMessage("Producto actualizado correctamente");
      setMessageType("success");
      
      // Recargar producto para mostrar cambios
      await cargarProducto();
      
    } catch (error) {
      setMessage("Error al actualizar: " + error.message);
      setMessageType("error");
    } finally {
      setSaving(false);
    }
  };

  const handleMultipleImageUpload = async (files) => {
    if (!files || files.length === 0) return;
    
    try {
      setUploadingGallery(true);
      const newUrls = [];
      
      for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        
        const response = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });
        
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Error al subir imagen');
        }
        
        const result = await response.json();
        newUrls.push(result.url);
      }
      
      setEditForm(prev => ({
        ...prev,
        imagenes: [...prev.imagenes, ...newUrls]
      }));
      
    } catch (error) {
      setMessage("Error al subir imágenes: " + error.message);
      setMessageType("error");
    } finally {
      setUploadingGallery(false);
    }
  };

  const removeImage = (index) => {
    setEditForm(prev => ({
      ...prev,
      imagenes: prev.imagenes.filter((_, i) => i !== index)
    }));
  };

  const moveImage = (fromIndex, toIndex) => {
    if (fromIndex === toIndex) return;
    
    setEditForm(prev => {
      const newImagenes = [...prev.imagenes];
      const [movedImage] = newImagenes.splice(fromIndex, 1);
      newImagenes.splice(toIndex, 0, movedImage);
      
      return {
        ...prev,
        imagenes: newImagenes
      };
    });
  };

  const updateDiscount = (field, value) => {
    setEditForm(prev => ({
      ...prev,
      discount: {
        ...prev.discount,
        [field]: Number(value) || 0
      }
    }));
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!producto) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <AlertCircle className="w-16 h-16 text-red-500 mb-4" />
        <h1 className="text-2xl font-bold text-foreground mb-2">Producto no encontrado</h1>
        <p className="text-muted-foreground mb-6">El producto que buscas no existe o fue eliminado.</p>
        <Link href="/productos">
          <Button variant="outline">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Volver a Productos
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="py-8 px-4 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/productos">
            <Button variant="outline" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Volver
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-foreground">Editar Producto</h1>
            <p className="text-lg text-muted-foreground">
              {producto.codigo} - {producto.nombre}
            </p>
          </div>
        </div>

        {/* Mensaje de estado */}
        {message && (
          <div className={`mb-6 p-4 rounded-xl flex items-center gap-3 text-sm shadow-lg ${
            messageType === "success"
              ? "bg-emerald-500/10 text-emerald-800 dark:text-emerald-200 border border-emerald-500/20"
              : "bg-red-500/15 text-red-800 dark:text-red-200 border border-red-500/20"
          }`}>
            <div className={`p-2 rounded-full ${messageType === "success" ? "bg-emerald-500/10" : "bg-red-500/15"}`}>
              {messageType === "success" ? (
                <CheckCircle className="w-5 h-5" />
              ) : (
                <AlertCircle className="w-5 h-5" />
              )}
            </div>
            <div>
              <div className="font-semibold">
                {messageType === "success" ? "¡Éxito!" : "Error"}
              </div>
              <div className="text-sm opacity-90">{message}</div>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Información del producto */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  producto.categoria === "Maderas" 
                    ? "bg-orange-500/10 text-orange-700 dark:text-orange-300" 
                    : "bg-blue-500/10 text-blue-700 dark:text-blue-300"
                }`}>
                  {producto.categoria === "Maderas" ? "🌲" : "🔧"}
                </div>
                Información del Producto
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <span className="font-medium text-muted-foreground">Código:</span>
                <div className="font-bold text-lg text-foreground">{producto.codigo}</div>
              </div>
              <div>
                <span className="font-medium text-muted-foreground">Categoría:</span>
                <div className="font-semibold text-foreground">{producto.categoria}</div>
              </div>
              <div>
                <span className="font-medium text-muted-foreground">Stock:</span>
                <span className={`ml-2 font-bold ${
                  producto.stock > 10 ? "text-emerald-700 dark:text-emerald-300" : 
                  producto.stock > 0 ? "text-amber-700 dark:text-amber-300" : "text-red-700 dark:text-red-300"
                }`}>
                  {producto.stock || 0}
                </span>
              </div>
              <div>
                <span className="font-medium text-muted-foreground">Estado:</span>
                <span className={`ml-2 px-2 py-1 rounded-full text-xs font-semibold border ${
                  producto.estado === "Activo" ? "bg-emerald-500/10 text-emerald-800 dark:text-emerald-200 border-emerald-500/20" :
                  producto.estado === "Inactivo" ? "bg-amber-500/10 text-amber-800 dark:text-amber-200 border-amber-500/20" :
                  "bg-red-500/15 text-red-800 dark:text-red-200 border-red-500/20"
                }`}>
                  {producto.estado}
                </span>
              </div>
              <div>
                <span className="font-medium text-muted-foreground">Tienda:</span>
                <span className={`ml-2 px-2 py-1 rounded-full text-xs font-semibold border ${
                  producto.estadoTienda === "Activo" ? "bg-emerald-500/10 text-emerald-800 dark:text-emerald-200 border-emerald-500/20" :
                  producto.estadoTienda === "Inactivo" ? "bg-muted/50 text-foreground border-border/60" :
                  "bg-amber-500/10 text-amber-800 dark:text-amber-200 border-amber-500/20"
                }`}>
                  {producto.estadoTienda ? producto.estadoTienda : "No definido"}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Formulario de edición */}
        <div className="lg:col-span-2 space-y-6">
          {/* Campos básicos */}
          <Card>
            <CardHeader>
              <CardTitle className="text-foreground">Información Básica</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">
                    Código del Producto *
                  </label>
                  <Input
                    value={editForm.codigo}
                    onChange={(e) => setEditForm(prev => ({ ...prev, codigo: e.target.value }))}
                    placeholder="Ej: MAD-001"
                    className="font-mono"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">
                    Nombre del Producto *
                  </label>
                  <Input
                    value={editForm.nombre}
                    onChange={(e) => setEditForm(prev => ({ ...prev, nombre: e.target.value }))}
                    placeholder="Nombre del producto"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">
                    Estado *
                  </label>
                  <select
                    value={editForm.estado}
                    onChange={(e) => setEditForm(prev => ({ ...prev, estado: e.target.value }))}
                    className="w-full px-3 py-2 border border-border/60 rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
                  >
                    <option value="Activo">Activo</option>
                    <option value="Inactivo">Inactivo</option>
                    <option value="Descontinuado">Descontinuado</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">
                    Estado de Tienda *
                  </label>
                  <select
                    value={editForm.estadoTienda}
                    onChange={(e) => setEditForm(prev => ({ ...prev, estadoTienda: e.target.value }))}
                    className="w-full px-3 py-2 border border-border/60 rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
                  >
                    <option value="Activo">Activo</option>
                    <option value="Inactivo">Inactivo</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Unidad de Medida *
                </label>
                <div className="flex gap-2">
                  <select
                    value={editForm.unidadMedida}
                    onChange={(e) => setEditForm(prev => ({ ...prev, unidadMedida: e.target.value }))}
                    className="flex-1 px-3 py-2 border border-border/60 rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
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

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Descripción *
                </label>
                <textarea
                  value={editForm.descripcion}
                  onChange={(e) => setEditForm(prev => ({ ...prev, descripcion: e.target.value }))}
                  placeholder="Descripción detallada del producto"
                  className="w-full px-3 py-2 border border-border/60 rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary resize-none"
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          {/* Campos específicos por categoría */}
          {producto.categoria === "Maderas" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-foreground">Especificaciones de Madera</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">
                      Subcategoría *
                    </label>
                    <div className="flex gap-2">
                      <select
                        value={editForm.subcategoria}
                        onChange={(e) => setEditForm(prev => ({ ...prev, subcategoria: e.target.value }))}
                        className="flex-1 px-3 py-2 border border-border/60 rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
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
                    <label className="text-sm font-medium text-foreground">
                      Tipo de Madera *
                    </label>
                    <div className="flex gap-2">
                      <select
                        value={editForm.tipoMadera}
                        onChange={(e) => setEditForm(prev => ({ ...prev, tipoMadera: e.target.value }))}
                        className="flex-1 px-3 py-2 border border-border/60 rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
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
              </CardContent>
            </Card>
          )}

          {producto.categoria === "Ferretería" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-foreground">Especificaciones de Ferretería</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">
                      Subcategoría *
                    </label>
                    <div className="flex gap-2">
                      <select
                        value={editForm.subcategoria}
                        onChange={(e) => setEditForm(prev => ({ ...prev, subcategoria: e.target.value }))}
                        className="flex-1 px-3 py-2 border border-border/60 rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
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
                    <label className="text-sm font-medium text-foreground">
                      Proveedor *
                    </label>
                    <div className="flex gap-2">
                      <select
                        value={editForm.proveedor}
                        onChange={(e) => setEditForm(prev => ({ ...prev, proveedor: e.target.value }))}
                        className="flex-1 px-3 py-2 border border-border/60 rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
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
              </CardContent>
            </Card>
          )}

          {/* Campos para tienda */}
          <Card>
            <CardHeader>
              <CardTitle className="text-foreground">Configuración de Tienda</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Rating */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Calificación del Producto
                </label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setEditForm(prev => ({ ...prev, rating: star }))}
                      className={`p-2 rounded-lg transition-colors border ${
                        editForm.rating >= star
                          ? "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20 hover:bg-amber-500/15"
                          : "bg-muted/50 text-muted-foreground border-border/60 hover:bg-muted"
                      }`}
                    >
                      <Star className="w-6 h-6 fill-current" />
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Selecciona la calificación del producto (1-5 estrellas)
                </p>
              </div>

              {/* Galería de imágenes */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Galería de Imágenes
                </label>
                <p className="text-xs text-muted-foreground mb-2">
                  Selecciona múltiples imágenes para la galería del producto. Arrastra y suelta para reordenar.
                </p>
                <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => document.getElementById("galleryInput")?.click()}
                    disabled={uploadingGallery}
                    className="w-full sm:w-auto"
                  >
                    {uploadingGallery ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Subiendo...
                      </>
                    ) : (
                      "Seleccionar imágenes"
                    )}
                  </Button>
                  <div className="text-xs text-muted-foreground sm:ml-auto">
                    {editForm.imagenes.length} {editForm.imagenes.length === 1 ? "imagen" : "imágenes"}
                  </div>
                </div>
                {editForm.imagenes.length > 0 && (
                  <div className="space-y-3 mt-3">
                    {editForm.imagenes.map((url, index) => (
                      <div 
                        key={index} 
                        className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 bg-card/60 rounded-lg border border-border/60 shadow-lg backdrop-blur-sm"
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/plain', index.toString());
                        }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
                          moveImage(fromIndex, index);
                        }}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="cursor-move text-muted-foreground hover:text-foreground flex-shrink-0 hidden sm:block">
                            <GripVertical className="w-5 h-5" />
                          </div>
                          <img 
                            src={url} 
                            alt={`Imagen ${index + 1}`} 
                            className="w-20 h-20 object-cover rounded-lg border border-border/60 flex-shrink-0"
                            onError={(e) => {
                              e.target.style.display = 'none';
                            }}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-foreground truncate">
                              Imagen {index + 1}
                            </div>
                            <div className="text-xs text-muted-foreground truncate">
                              Posición: {index + 1} de {editForm.imagenes.length}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center justify-between sm:justify-end gap-2">
                          <div className="flex items-center gap-1 sm:hidden">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={index === 0}
                              onClick={() => moveImage(index, index - 1)}
                              className="px-2"
                            >
                              ↑
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={index === editForm.imagenes.length - 1}
                              onClick={() => moveImage(index, index + 1)}
                              className="px-2"
                            >
                              ↓
                            </Button>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            onClick={() => removeImage(index)}
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <input
                  id="galleryInput"
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => handleMultipleImageUpload(e.target.files)}
                  className="hidden"
                />
              </div>

              {/* Descuento */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Descuento
                </label>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-muted-foreground">Monto ($)</label>
                    <Input
                      value={editForm.discount.amount}
                      onChange={(e) => updateDiscount('amount', e.target.value)}
                      placeholder="0.00"
                      type="number"
                      step="0.01"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Porcentaje (%)</label>
                    <Input
                      value={editForm.discount.percentage}
                      onChange={(e) => updateDiscount('percentage', e.target.value)}
                      placeholder="0"
                      type="number"
                      step="1"
                      min="0"
                      max="100"
                    />
                  </div>
                </div>
              </div>

              {/* Etiquetas */}
              <div className="space-y-3">
                <label className="text-sm font-medium text-foreground">
                  Etiquetas de Tienda
                </label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editForm.freeShipping}
                      onChange={(e) => setEditForm(prev => ({ ...prev, freeShipping: e.target.checked }))}
                      className="w-4 h-4 text-blue-600"
                    />
                    <Truck className="w-4 h-4 text-blue-600" />
                    <span className="text-sm">Envío Gratis</span>
                  </label>
                  
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editForm.featuredBrand}
                      onChange={(e) => setEditForm(prev => ({ ...prev, featuredBrand: e.target.checked }))}
                      className="w-4 h-4 text-blue-600"
                    />
                    <Star className="w-4 h-4 text-blue-600" />
                    <span className="text-sm">Marca Destacada</span>
                  </label>
                  
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editForm.newArrival}
                      onChange={(e) => setEditForm(prev => ({ ...prev, newArrival: e.target.checked }))}
                      className="w-4 h-4 text-blue-600"
                    />
                    <Gift className="w-4 h-4 text-blue-600" />
                    <span className="text-sm">Nuevo Lanzamiento</span>
                  </label>
                  
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editForm.specialOffer}
                      onChange={(e) => setEditForm(prev => ({ ...prev, specialOffer: e.target.checked }))}
                      className="w-4 h-4 text-blue-600"
                    />
                    <Zap className="w-4 h-4 text-blue-600" />
                    <span className="text-sm">Oferta Especial</span>
                  </label>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Botón guardar */}
          <div className="flex justify-end">
            <Button 
              onClick={handleSave} 
              disabled={saving}
              className="px-8 py-3"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Guardar Cambios
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductoDetailPage;
