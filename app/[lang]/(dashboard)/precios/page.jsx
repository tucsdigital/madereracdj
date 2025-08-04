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
import { db } from "@/lib/firebase";
import {
  collection,
  getDocs,
  updateDoc,
  doc,
  query,
  orderBy,
} from "firebase/firestore";
import { Loader2, Pencil, TrendingUp, Package, Settings } from "lucide-react";
import { Icon } from "@iconify/react";

const PreciosPage = () => {
  const [productos, setProductos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState("");
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState("");
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

  useEffect(() => {
    const fetchProductos = async () => {
      setLoading(true);
      const q = query(collection(db, "productos"), orderBy("nombre"));
      const snap = await getDocs(q);
      setProductos(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    };
    fetchProductos();
  }, []);

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
  
  // Debug: mostrar tipos de madera disponibles
  console.log("Tipos de madera disponibles:", tiposMadera);
  console.log("Productos de maderas:", productos.filter(p => p.categoria === "Maderas"));
  
  const proveedores = [
    ...new Set(productos.filter((p) => p.proveedor).map((p) => p.proveedor)),
  ].filter(Boolean);

  const handleEditarIndividual = (prod) => {
    setModalTipo("individual");
    setEditProd(prod);
    setEditForm({
      costo: prod.costo ?? "",
      valorVenta: prod.valorVenta ?? "",
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
    setSaving(true);
    setMsg("");
    try {
      const updates = {};
      if (editForm.costo !== "") updates.costo = Math.round(Number(editForm.costo) * 100) / 100;
      if (editForm.valorVenta !== "")
        updates.valorVenta = Math.round(Number(editForm.valorVenta) * 100) / 100;

      await updateDoc(doc(db, "productos", editProd.id), updates);
      setMsg("Precios actualizados correctamente.");

      const q = query(collection(db, "productos"), orderBy("nombre"));
      const snap = await getDocs(q);
      setProductos(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
      setTimeout(() => {
        setModalOpen(false);
        setEditProd(null);
      }, 1000);
    } catch (e) {
      setMsg("Error al guardar: " + e.message);
    }
    setSaving(false);
  };

  const handleGuardarGlobal = async () => {
    setSaving(true);
    setMsg("");
    try {
      let productosAActualizar = [];

      if (modalTipo === "maderas") {
        productosAActualizar = productos.filter(
          (p) =>
            p.categoria === "Maderas" && p.tipoMadera === tipoMaderaSeleccionado
        );
      } else if (modalTipo === "proveedor") {
        productosAActualizar = productos.filter(
          (p) => p.proveedor === proveedorSeleccionado
        );
      }

      const porcentaje = Number(porcentajeAumento) / 100;

      for (const producto of productosAActualizar) {
        const updates = {};

        if (producto.valorVenta) {
          updates.valorVenta = Math.round((producto.valorVenta * (1 + porcentaje)) * 100) / 100;
        }
        if (producto.precioPorPie) {
          updates.precioPorPie = Math.round((producto.precioPorPie * (1 + porcentaje)) * 100) / 100;
        }

        await updateDoc(doc(db, "productos", producto.id), updates);
      }

      setMsg(
        `${productosAActualizar.length} productos actualizados correctamente.`
      );

      const q = query(collection(db, "productos"), orderBy("nombre"));
      const snap = await getDocs(q);
      setProductos(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
      setTimeout(() => {
        setModalOpen(false);
      }, 1000);
    } catch (e) {
      setMsg("Error al guardar: " + e.message);
    }
    setSaving(false);
  };

  const productosFiltrados = productos.filter((p) => {
    const cumpleFiltro =
      p.nombre?.toLowerCase().includes(filtro.toLowerCase()) ||
      (p.categoria || "").toLowerCase().includes(filtro.toLowerCase());
    const cumpleCategoria =
      !categoriaSeleccionada || p.categoria === categoriaSeleccionada;
    return cumpleFiltro && cumpleCategoria;
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
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
            <CardTitle>Listado de Productos</CardTitle>
            <div className="flex flex-col md:flex-row gap-3 w-full md:w-auto">
              <select
                value={categoriaSeleccionada}
                onChange={(e) => setCategoriaSeleccionada(e.target.value)}
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
                        {p.stock}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {p.valorVenta && (
                          <div>Venta: ${p.valorVenta.toFixed(2)}</div>
                        )}
                        {p.precioPorPie && (
                          <div>$/pie: ${p.precioPorPie.toFixed(2)}</div>
                        )}
                        {p.costo && (
                          <div className="text-gray-500">
                            Costo: ${p.costo.toFixed(2)}
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
