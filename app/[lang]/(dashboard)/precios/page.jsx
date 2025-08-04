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
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { db } from "@/lib/firebase";
import {
  collection,
  getDocs,
  updateDoc,
  doc,
  query,
  orderBy,
} from "firebase/firestore";
import { Loader2, Pencil, TrendingUp, Package, Settings, CheckSquare, Square } from "lucide-react";
import { Icon } from "@iconify/react";

const PreciosPage = () => {
  const [productos, setProductos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState("");
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState("");
  const [filtroTipoMadera, setFiltroTipoMadera] = useState("");
  const [filtroSubCategoria, setFiltroSubCategoria] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTipo, setModalTipo] = useState("");
  const [editProd, setEditProd] = useState(null);
  const [editForm, setEditForm] = useState({
    costo: "",
    valorVenta: "",
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [porcentajeAumento, setPorcentajeAumento] = useState("");
  const [tipoMaderaSeleccionado, setTipoMaderaSeleccionado] = useState("");
  const [proveedorSeleccionado, setProveedorSeleccionado] = useState("");
  
  // Nuevos estados para selección múltiple
  const [productosSeleccionados, setProductosSeleccionados] = useState(new Set());
  const [modalSeleccionMultiple, setModalSeleccionMultiple] = useState(false);
  const [porcentajeSeleccionMultiple, setPorcentajeSeleccionMultiple] = useState("");

  useEffect(() => {
    const fetchProductos = async () => {
      setLoading(true);
      try {
        const q = query(collection(db, "productos"), orderBy("nombre"));
        const snap = await getDocs(q);
        setProductos(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
      } catch (error) {
        console.error("Error al cargar productos:", error);
        setMsg("Error al cargar productos: " + error.message);
      } finally {
        setLoading(false);
      }
    };
    fetchProductos();
  }, []);

  // Limpiar selección cuando cambian los filtros
  useEffect(() => {
    setProductosSeleccionados(new Set());
  }, [filtro, categoriaSeleccionada, filtroTipoMadera, filtroSubCategoria]);

  const categorias = [...new Set(productos.map((p) => p.categoria))].filter(
    Boolean
  );
  const tiposMadera = [
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
  
  const proveedores = [
    ...new Set(productos.filter((p) => p.proveedor).map((p) => p.proveedor)),
  ].filter(Boolean);

  // Función para redondear decimales correctamente
  const redondearDecimal = (numero) => {
    if (typeof numero !== 'number' || isNaN(numero)) return 0;
    
    // Si el número es muy cercano a un entero, redondear al entero
    const entero = Math.round(numero);
    const diferencia = Math.abs(numero - entero);
    
    // Si la diferencia es menor a 0.01, considerar como entero
    if (diferencia < 0.01) {
      return entero;
    }
    
    // Para otros casos, redondear a 2 decimales
    return Math.round(numero * 100) / 100;
  };

  // Funciones para manejo de selección múltiple
  const handleSeleccionarProducto = (productoId) => {
    if (!productoId) return;
    
    setProductosSeleccionados(prev => {
      const nuevosSeleccionados = new Set(prev);
      if (nuevosSeleccionados.has(productoId)) {
        nuevosSeleccionados.delete(productoId);
      } else {
        nuevosSeleccionados.add(productoId);
      }
      return nuevosSeleccionados;
    });
  };

  const handleSeleccionarTodos = () => {
    if (productosFiltrados.length === 0) return;
    
    setProductosSeleccionados(prev => {
      if (prev.size === productosFiltrados.length) {
        return new Set();
      } else {
        return new Set(productosFiltrados.map(p => p.id));
      }
    });
  };

  const handleActualizarSeleccionMultiple = async () => {
    if (!porcentajeSeleccionMultiple || productosSeleccionados.size === 0) {
      setMsg("Por favor selecciona productos y un porcentaje válido.");
      return;
    }

    const porcentaje = Number(porcentajeSeleccionMultiple);
    if (isNaN(porcentaje) || porcentaje < -100 || porcentaje > 100) {
      setMsg("Por favor ingresa un porcentaje válido entre -100 y 100.");
      return;
    }

    setSaving(true);
    setMsg("");
    
    try {
      const factorAumento = porcentaje / 100;
      const productosAActualizar = productos.filter(p => productosSeleccionados.has(p.id));
      let actualizados = 0;
      let errores = 0;

      for (const producto of productosAActualizar) {
        try {
          const updates = {};
          
          if (producto.categoria === "Maderas" && producto.precioPorPie) {
            const nuevoPrecio = redondearDecimal(producto.precioPorPie * (1 + factorAumento));
            if (nuevoPrecio > 0) {
              updates.precioPorPie = nuevoPrecio;
            }
          } else if (producto.valorVenta) {
            const nuevoPrecio = redondearDecimal(producto.valorVenta * (1 + factorAumento));
            if (nuevoPrecio > 0) {
              updates.valorVenta = nuevoPrecio;
            }
          }

          if (Object.keys(updates).length > 0) {
            await updateDoc(doc(db, "productos", producto.id), updates);
            actualizados++;
          }
        } catch (error) {
          console.error(`Error al actualizar producto ${producto.id}:`, error);
          errores++;
        }
      }

      if (errores > 0) {
        setMsg(`${actualizados} productos actualizados correctamente. ${errores} errores.`);
      } else {
        setMsg(`${actualizados} productos actualizados correctamente.`);
      }

      // Limpiar selección y recargar productos
      setProductosSeleccionados(new Set());
      setPorcentajeSeleccionMultiple("");

      const q = query(collection(db, "productos"), orderBy("nombre"));
      const snap = await getDocs(q);
      setProductos(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
      
      setTimeout(() => {
        setModalSeleccionMultiple(false);
      }, 2000);
    } catch (error) {
      console.error("Error general:", error);
      setMsg("Error al actualizar productos: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleEditarIndividual = (prod) => {
    if (!prod) return;
    
    setModalTipo("individual");
    setEditProd(prod);
    setEditForm({
      costo: prod.costo ? String(prod.costo) : "",
      valorVenta: prod.valorVenta ? String(prod.valorVenta) : "",
    });
    setMsg("");
    setModalOpen(true);
  };

  const handleActualizacionGlobal = (tipo) => {
    setModalTipo(tipo);
    setEditProd(null);
    setEditForm({ costo: "", valorVenta: "" });
    setPorcentajeAumento("");
    setTipoMaderaSeleccionado("");
    setProveedorSeleccionado("");
    setMsg("");
    setModalOpen(true);
  };

  const handleGuardarIndividual = async () => {
    if (!editProd) {
      setMsg("Error: No hay producto seleccionado.");
      return;
    }

    setSaving(true);
    setMsg("");
    
    try {
      const updates = {};
      
      if (editForm.costo !== "") {
        const costo = Number(editForm.costo);
        if (!isNaN(costo) && costo >= 0) {
          updates.costo = redondearDecimal(costo);
        }
      }
      
      if (editForm.valorVenta !== "") {
        const valorVenta = Number(editForm.valorVenta);
        if (!isNaN(valorVenta) && valorVenta >= 0) {
          updates.valorVenta = redondearDecimal(valorVenta);
        }
      }

      if (Object.keys(updates).length === 0) {
        setMsg("Por favor ingresa al menos un valor válido.");
        return;
      }

      await updateDoc(doc(db, "productos", editProd.id), updates);
      setMsg("Precios actualizados correctamente.");

      const q = query(collection(db, "productos"), orderBy("nombre"));
      const snap = await getDocs(q);
      setProductos(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
      
      setTimeout(() => {
        setModalOpen(false);
        setEditProd(null);
      }, 1000);
    } catch (error) {
      console.error("Error al guardar:", error);
      setMsg("Error al guardar: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleGuardarGlobal = async () => {
    if (!porcentajeAumento || (!tipoMaderaSeleccionado && !proveedorSeleccionado)) {
      setMsg("Por favor completa todos los campos requeridos.");
      return;
    }

    const porcentaje = Number(porcentajeAumento);
    if (isNaN(porcentaje) || porcentaje < -100 || porcentaje > 100) {
      setMsg("Por favor ingresa un porcentaje válido entre -100 y 100.");
      return;
    }

    setSaving(true);
    setMsg("");
    
    try {
      let productosAActualizar = [];

      if (modalTipo === "maderas") {
        productosAActualizar = productos.filter(
          (p) => p.categoria === "Maderas" && p.tipoMadera === tipoMaderaSeleccionado
        );
      } else if (modalTipo === "proveedor") {
        productosAActualizar = productos.filter(
          (p) => p.proveedor === proveedorSeleccionado
        );
      }

      if (productosAActualizar.length === 0) {
        setMsg("No se encontraron productos para actualizar.");
        return;
      }

      const factorAumento = porcentaje / 100;
      let actualizados = 0;

      for (const producto of productosAActualizar) {
        try {
          const updates = {};

          if (producto.valorVenta) {
            const nuevoPrecio = redondearDecimal(producto.valorVenta * (1 + factorAumento));
            if (nuevoPrecio > 0) {
              updates.valorVenta = nuevoPrecio;
            }
          }
          
          if (producto.precioPorPie) {
            const nuevoPrecio = redondearDecimal(producto.precioPorPie * (1 + factorAumento));
            if (nuevoPrecio > 0) {
              updates.precioPorPie = nuevoPrecio;
            }
          }

          if (Object.keys(updates).length > 0) {
            await updateDoc(doc(db, "productos", producto.id), updates);
            actualizados++;
          }
        } catch (error) {
          console.error(`Error al actualizar producto ${producto.id}:`, error);
        }
      }

      setMsg(`${actualizados} productos actualizados correctamente.`);

      const q = query(collection(db, "productos"), orderBy("nombre"));
      const snap = await getDocs(q);
      setProductos(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
      
      setTimeout(() => {
        setModalOpen(false);
      }, 1000);
    } catch (error) {
      console.error("Error general:", error);
      setMsg("Error al guardar: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const productosFiltrados = productos.filter((p) => {
    // Función para normalizar texto (eliminar espacios y convertir a minúsculas)
    const normalizarTexto = (texto) => {
      if (!texto) return "";
      return texto.toLowerCase().replace(/\s+/g, '');
    };

    // Normalizar el término de búsqueda
    const filtroNormalizado = normalizarTexto(filtro);
    
    // Normalizar el nombre del producto
    const nombreNormalizado = normalizarTexto(p.nombre);
    
    // Normalizar la categoría
    const categoriaNormalizada = normalizarTexto(p.categoria);

    // Filtro por búsqueda de texto (ahora más flexible)
    const cumpleBusqueda =
      filtroNormalizado === "" ||
      nombreNormalizado.includes(filtroNormalizado) ||
      categoriaNormalizada.includes(filtroNormalizado);

    // Filtro por categoría principal
    const cumpleCategoria =
      !categoriaSeleccionada || p.categoria === categoriaSeleccionada;

    // Filtro específico por tipo de madera
    const cumpleTipoMadera =
      categoriaSeleccionada !== "Maderas" ||
      filtroTipoMadera === "" ||
      p.tipoMadera === filtroTipoMadera;

    // Filtro específico por subcategoría de ferretería
    const cumpleSubCategoria =
      categoriaSeleccionada !== "Ferretería" ||
      filtroSubCategoria === "" ||
      p.subCategoria === filtroSubCategoria;

    return cumpleBusqueda && cumpleCategoria && cumpleTipoMadera && cumpleSubCategoria;
  });

  const getIconoCategoria = (categoria) => {
    switch (categoria) {
      case "Maderas":
        return "🌲";
      case "Ferretería":
        return "🔧";
      case "Herramientas":
        return "🛠️";
      case "Químicos":
        return "🧪";
      default:
        return "📦";
    }
  };

  const getColorCategoria = (categoria) => {
    switch (categoria) {
      case "Maderas":
        return "bg-orange-100 text-orange-800 border-orange-200";
      case "Ferretería":
        return "bg-blue-100 text-blue-800 border-blue-200";
      case "Herramientas":
        return "bg-green-100 text-green-800 border-green-200";
      case "Químicos":
        return "bg-purple-100 text-purple-800 border-purple-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  // Verificar si todos los productos filtrados están seleccionados
  const todosSeleccionados = productosFiltrados.length > 0 && 
    productosSeleccionados.size === productosFiltrados.length;

  return (
    <div className="py-8 px-2 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Gestión de Precios</h1>
        <p className="text-lg text-gray-600">
          Sistema profesional de actualización de precios por categorías
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <Card className="border-2 border-orange-200 hover:border-orange-300 transition-colors">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                <Icon
                  icon="mdi:pine-tree"
                  className="w-6 h-6 text-orange-600"
                />
              </div>
              <div>
                <CardTitle className="text-lg">Maderas</CardTitle>
                <p className="text-sm text-gray-600">
                  Actualización por tipo de madera
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => handleActualizacionGlobal("maderas")}
              className="w-full bg-orange-600 hover:bg-orange-700"
            >
              <TrendingUp className="w-4 h-4 mr-2" />
              Actualizar Maderas
            </Button>
          </CardContent>
        </Card>

        <Card className="border-2 border-blue-200 hover:border-blue-300 transition-colors">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <Icon
                  icon="mdi:package-variant"
                  className="w-6 h-6 text-blue-600"
                />
              </div>
              <div>
                <CardTitle className="text-lg">Proveedores</CardTitle>
                <p className="text-sm text-gray-600">
                  Actualización por proveedor
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => handleActualizacionGlobal("proveedor")}
              className="w-full bg-blue-600 hover:bg-blue-700"
            >
              <Package className="w-4 h-4 mr-2" />
              Actualizar Proveedores
            </Button>
          </CardContent>
        </Card>

        <Card className="border-2 border-green-200 hover:border-green-300 transition-colors">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <Icon icon="mdi:tools" className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <CardTitle className="text-lg">Individual</CardTitle>
                <p className="text-sm text-gray-600">
                  Edición producto por producto
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => setCategoriaSeleccionada("")}
              className="w-full bg-green-600 hover:bg-green-700"
            >
              <Settings className="w-4 h-4 mr-2" />
              Ver Todos
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
              <CardTitle>Listado de Productos</CardTitle>
              <div className="flex flex-col md:flex-row gap-3 w-full md:w-auto">
                <select
                  value={categoriaSeleccionada}
                  onChange={(e) => {
                    setCategoriaSeleccionada(e.target.value);
                    // Limpiar filtros específicos al cambiar categoría
                    setFiltroTipoMadera("");
                    setFiltroSubCategoria("");
                  }}
                  className="w-full md:w-48 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Todas las categorías</option>
                  {categorias.map((cat) => (
                    <option key={cat} value={cat}>
                      {getIconoCategoria(cat)} {cat}
                    </option>
                  ))}
                </select>
                <Input
                  placeholder="Buscar producto..."
                  value={filtro}
                  onChange={(e) => setFiltro(e.target.value)}
                  className="w-full md:w-64"
                />
              </div>
            </div>

            {/* Filtros específicos por categoría */}
            <div className="flex flex-col sm:flex-row gap-3">
              {/* Filtro de tipo de madera */}
              {categoriaSeleccionada === "Maderas" && tiposMadera.length > 0 && (
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
                    {tiposMadera.map((tipo) => (
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
              {categoriaSeleccionada === "Ferretería" &&
                subCategoriasFerreteria.length > 0 && (
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
            </div>

            {/* Indicador de productos filtrados y botón de selección múltiple */}
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-600">
                Mostrando {productosFiltrados.length} de {productos.length} productos
                {(filtro || categoriaSeleccionada || filtroTipoMadera || filtroSubCategoria) && (
                  <span className="ml-2 text-blue-600">
                    (filtros aplicados)
                  </span>
                )}
                {productosSeleccionados.size > 0 && (
                  <span className="ml-2 text-green-600 font-medium">
                    • {productosSeleccionados.size} seleccionados
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                {productosSeleccionados.size > 0 && (
                  <Button
                    onClick={() => setModalSeleccionMultiple(true)}
                    className="bg-purple-600 hover:bg-purple-700 text-white"
                    size="sm"
                  >
                    <TrendingUp className="w-4 h-4 mr-2" />
                    Actualizar {productosSeleccionados.size} productos
                  </Button>
                )}
                {(filtro || categoriaSeleccionada || filtroTipoMadera || filtroSubCategoria) && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setFiltro("");
                      setCategoriaSeleccionada("");
                      setFiltroTipoMadera("");
                      setFiltroSubCategoria("");
                    }}
                    className="text-xs"
                  >
                    Limpiar filtros
                  </Button>
                )}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {loading ? (
            <div className="flex justify-center items-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <div className="flex items-center justify-center">
                      <button
                        onClick={handleSeleccionarTodos}
                        className="p-1 hover:bg-gray-100 rounded"
                        disabled={productosFiltrados.length === 0}
                      >
                        {todosSeleccionados ? (
                          <CheckSquare className="w-4 h-4 text-blue-600" />
                        ) : (
                          <Square className="w-4 h-4 text-gray-400" />
                        )}
                      </button>
                    </div>
                  </TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead>Unidad</TableHead>
                  <TableHead>Stock</TableHead>
                  <TableHead>Precio Actual</TableHead>
                  <TableHead>Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {productosFiltrados.map((p) => (
                  <TableRow key={p.id} className="hover:bg-gray-50">
                    <TableCell>
                      <div className="flex items-center justify-center">
                        <Checkbox
                          checked={productosSeleccionados.has(p.id)}
                          onCheckedChange={() => handleSeleccionarProducto(p.id)}
                          className="data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                        />
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">{p.nombre}</div>
                        {p.tipoMadera && (
                          <Badge variant="outline" className="text-xs mt-1">
                            {p.tipoMadera}
                          </Badge>
                        )}
                        {p.proveedor && (
                          <Badge
                            variant="outline"
                            className="text-xs mt-1 ml-1"
                          >
                            {p.proveedor}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={getColorCategoria(p.categoria)}>
                        {getIconoCategoria(p.categoria)} {p.categoria}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {p.unidadMedida ||
                        p.unidadVenta ||
                        p.unidadVentaHerraje ||
                        p.unidadVentaQuimico ||
                        p.unidadVentaHerramienta}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`font-medium ${
                          p.stock > 10
                            ? "text-green-600"
                            : p.stock > 0
                            ? "text-yellow-600"
                            : "text-red-600"
                        }`}
                      >
                        {p.stock || 0}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {p.valorVenta && (
                          <div>Venta: ${redondearDecimal(p.valorVenta).toFixed(2)}</div>
                        )}
                        {p.precioPorPie && (
                          <div>$/pie: ${redondearDecimal(p.precioPorPie).toFixed(2)}</div>
                        )}
                        {p.costo && (
                          <div className="text-gray-500">
                            Costo: ${redondearDecimal(p.costo).toFixed(2)}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleEditarIndividual(p)}
                        className="bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
                      >
                        <Pencil className="w-4 h-4 mr-1" />
                        Editar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Modal para actualización de selección múltiple */}
      <Dialog open={modalSeleccionMultiple} onOpenChange={setModalSeleccionMultiple}>
        <DialogContent className="w-[95vw] max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Actualizar Productos Seleccionados
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="bg-purple-50 p-4 rounded-lg">
              <div className="font-bold text-lg mb-2">
                📊 Actualización Personalizada
              </div>
              <div className="text-sm text-gray-600">
                Se actualizarán {productosSeleccionados.size} productos seleccionados.
                {productos.filter(p => productosSeleccionados.has(p.id) && p.categoria === "Maderas").length > 0 && (
                  <div className="mt-2 text-purple-700">
                    • Maderas: se actualizará precioPorPie
                  </div>
                )}
                {productos.filter(p => productosSeleccionados.has(p.id) && p.categoria !== "Maderas").length > 0 && (
                  <div className="mt-1 text-purple-700">
                    • Otros: se actualizará valorVenta
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">
                Porcentaje de Aumento
              </label>
              <Input
                type="number"
                min={-100}
                max={100}
                step={0.1}
                placeholder="Porcentaje de aumento (ej: 15 para 15%)"
                value={porcentajeSeleccionMultiple}
                onChange={(e) => setPorcentajeSeleccionMultiple(e.target.value)}
              />
            </div>

            {porcentajeSeleccionMultiple && (
              <div className="bg-blue-50 p-4 rounded-lg">
                <div className="font-medium text-blue-800 mb-2">
                  Resumen de la operación:
                </div>
                <div className="text-sm text-blue-700">
                  <div>• Productos seleccionados: {productosSeleccionados.size}</div>
                  <div>• Aumento: {porcentajeSeleccionMultiple}%</div>
                  <div>• Maderas: {productos.filter(p => productosSeleccionados.has(p.id) && p.categoria === "Maderas").length} productos</div>
                  <div>• Otros: {productos.filter(p => productosSeleccionados.has(p.id) && p.categoria !== "Maderas").length} productos</div>
                </div>
              </div>
            )}

            {msg && (
              <div
                className={`p-3 rounded-lg text-sm ${
                  msg.startsWith("Error")
                    ? "bg-red-50 text-red-800 border border-red-200"
                    : "bg-green-50 text-green-800 border border-green-200"
                }`}
              >
                {msg}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalSeleccionMultiple(false)}>
              Cancelar
            </Button>
            <Button
              variant="default"
              onClick={handleActualizarSeleccionMultiple}
              disabled={saving || !porcentajeSeleccionMultiple}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Actualizando...
                </>
              ) : (
                "Aplicar Actualización"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {modalTipo === "individual" && (
        <Dialog open={modalOpen} onOpenChange={setModalOpen}>
          <DialogContent className="w-[95vw] max-w-[500px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Pencil className="w-5 h-5" />
                Editar Precios Individuales
              </DialogTitle>
            </DialogHeader>
            {editProd && (
              <div className="flex flex-col gap-4 py-2">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <div className="font-bold text-lg mb-2">
                    {editProd.nombre}
                  </div>
                  <div className="text-sm text-gray-600">
                    Categoría: {editProd.categoria}
                    {editProd.tipoMadera && ` | Tipo: ${editProd.tipoMadera}`}
                    {editProd.proveedor &&
                      ` | Proveedor: ${editProd.proveedor}`}
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">
                      Costo
                    </label>
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      placeholder="Ingrese el costo"
                      value={editForm.costo}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, costo: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">
                      Precio de Venta
                    </label>
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      placeholder="Ingrese el precio de venta"
                      value={editForm.valorVenta}
                      onChange={(e) =>
                        setEditForm((f) => ({
                          ...f,
                          valorVenta: e.target.value,
                        }))
                      }
                    />
                  </div>
                </div>
                {msg && (
                  <div
                    className={`p-3 rounded-lg text-sm ${
                      msg.startsWith("Error")
                        ? "bg-red-50 text-red-800 border border-red-200"
                        : "bg-green-50 text-green-800 border border-green-200"
                    }`}
                  >
                    {msg}
                  </div>
                )}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setModalOpen(false)}>
                Cancelar
              </Button>
              <Button
                variant="default"
                onClick={handleGuardarIndividual}
                disabled={saving}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {saving ? (
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
      )}

      {(modalTipo === "maderas" || modalTipo === "proveedor") && (
        <Dialog open={modalOpen} onOpenChange={setModalOpen}>
          <DialogContent className="w-[95vw] max-w-[500px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                Actualización Global de Precios
              </DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-4 py-2">
              <div className="bg-orange-50 p-4 rounded-lg">
                <div className="font-bold text-lg mb-2">
                  {modalTipo === "maderas"
                    ? "🌲 Actualización por Tipo de Madera"
                    : "📦 Actualización por Proveedor"}
                </div>
                <div className="text-sm text-gray-600">
                  {modalTipo === "maderas"
                    ? "Selecciona el tipo de madera y el porcentaje de aumento para actualizar todos los productos de ese tipo."
                    : "Selecciona el proveedor y el porcentaje de aumento para actualizar todos los productos de ese proveedor."}
                </div>
              </div>

              {modalTipo === "maderas" && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    Tipo de Madera
                  </label>
                  <select
                    value={tipoMaderaSeleccionado}
                    onChange={(e) => setTipoMaderaSeleccionado(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  >
                    <option value="">Seleccionar tipo de madera</option>
                    {tiposMadera.map((tipo) => (
                      <option key={tipo} value={tipo}>
                        🌲 {tipo}
                      </option>
                    ))}
                  </select>
                  {tipoMaderaSeleccionado && (
                    <div className="text-sm text-orange-600 bg-orange-50 p-2 rounded">
                      📊 Se actualizarán {productos.filter(p => p.categoria === "Maderas" && p.tipoMadera === tipoMaderaSeleccionado).length} productos de tipo "{tipoMaderaSeleccionado}"
                    </div>
                  )}
                </div>
              )}

              {modalTipo === "proveedor" && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    Proveedor
                  </label>
                  <select
                    value={proveedorSeleccionado}
                    onChange={(e) => setProveedorSeleccionado(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Seleccionar proveedor</option>
                    {proveedores.map((prov) => (
                      <option key={prov} value={prov}>
                        📦 {prov}
                      </option>
                    ))}
                  </select>
                  {proveedorSeleccionado && (
                    <div className="text-sm text-blue-600 bg-blue-50 p-2 rounded">
                      📊 Se actualizarán {productos.filter(p => p.proveedor === proveedorSeleccionado).length} productos del proveedor "{proveedorSeleccionado}"
                    </div>
                  )}
                </div>
              )}

              <Input
                type="number"
                min={-100}
                max={100}
                step={0.1}
                placeholder="Porcentaje de aumento (ej: 15 para 15%)"
                value={porcentajeAumento}
                onChange={(e) => setPorcentajeAumento(e.target.value)}
              />

              {porcentajeAumento &&
                (tipoMaderaSeleccionado || proveedorSeleccionado) && (
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <div className="font-medium text-blue-800 mb-2">
                      Resumen de la operación:
                    </div>
                    <div className="text-sm text-blue-700">
                      <div>
                        • Tipo:{" "}
                        {modalTipo === "maderas"
                          ? tipoMaderaSeleccionado
                          : proveedorSeleccionado}
                      </div>
                      <div>• Aumento: {porcentajeAumento}%</div>
                      <div>
                        • Productos afectados:{" "}
                        {
                          productos.filter((p) =>
                            modalTipo === "maderas"
                              ? p.categoria === "Maderas" &&
                                p.tipoMadera === tipoMaderaSeleccionado
                              : p.proveedor === proveedorSeleccionado
                          ).length
                        }
                      </div>
                    </div>
                  </div>
                )}

              {msg && (
                <div
                  className={`p-3 rounded-lg text-sm ${
                    msg.startsWith("Error")
                      ? "bg-red-50 text-red-800 border border-red-200"
                      : "bg-green-50 text-green-800 border border-green-200"
                  }`}
                >
                  {msg}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setModalOpen(false)}>
                Cancelar
              </Button>
              <Button
                variant="default"
                onClick={handleGuardarGlobal}
                disabled={
                  saving ||
                  !porcentajeAumento ||
                  (!tipoMaderaSeleccionado && !proveedorSeleccionado)
                }
                className="bg-orange-600 hover:bg-orange-700"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Actualizando...
                  </>
                ) : (
                  "Aplicar Actualización Global"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default PreciosPage;
