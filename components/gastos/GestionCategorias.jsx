"use client";
import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Edit, Trash2, Plus, X, GripVertical, RotateCcw, Eye, EyeOff } from "lucide-react";
import { useCategoriasGastos } from "@/hooks/useCategoriasGastos";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// Colores predefinidos para elegir
const coloresPredefinidos = [
  { label: "Azul", value: "bg-blue-100 text-blue-800 border-blue-200", hex: "#DBEAFE" },
  { label: "Verde", value: "bg-green-100 text-green-800 border-green-200", hex: "#D1FAE5" },
  { label: "Naranja", value: "bg-orange-100 text-orange-800 border-orange-200", hex: "#FED7AA" },
  { label: "Púrpura", value: "bg-purple-100 text-purple-800 border-purple-200", hex: "#E9D5FF" },
  { label: "Rosa", value: "bg-pink-100 text-pink-800 border-pink-200", hex: "#FCE7F3" },
  { label: "Gris", value: "bg-gray-100 text-gray-800 border-gray-200", hex: "#F3F4F6" },
  { label: "Rojo", value: "bg-red-100 text-red-800 border-red-200", hex: "#FEE2E2" },
  { label: "Amarillo", value: "bg-yellow-100 text-yellow-800 border-yellow-200", hex: "#FEF3C7" },
  { label: "Índigo", value: "bg-indigo-100 text-indigo-800 border-indigo-200", hex: "#E0E7FF" },
  { label: "Cian", value: "bg-cyan-100 text-cyan-800 border-cyan-200", hex: "#CFFAFE" },
];

// Función para convertir hex a clases de Tailwind (simplificado)
const hexToTailwind = (hex) => {
  // Mapeo básico - en producción podrías usar una librería más completa
  const colorMap = {
    "#DBEAFE": "bg-blue-100 text-blue-800 border-blue-200",
    "#D1FAE5": "bg-green-100 text-green-800 border-green-200",
    "#FED7AA": "bg-orange-100 text-orange-800 border-orange-200",
    "#E9D5FF": "bg-purple-100 text-purple-800 border-purple-200",
    "#FCE7F3": "bg-pink-100 text-pink-800 border-pink-200",
    "#F3F4F6": "bg-gray-100 text-gray-800 border-gray-200",
    "#FEE2E2": "bg-red-100 text-red-800 border-red-200",
    "#FEF3C7": "bg-yellow-100 text-yellow-800 border-yellow-200",
    "#E0E7FF": "bg-indigo-100 text-indigo-800 border-indigo-200",
    "#CFFAFE": "bg-cyan-100 text-cyan-800 border-cyan-200",
  };
  return colorMap[hex] || `bg-[${hex}] text-gray-800 border-gray-200`;
};

// Componente de fila arrastrable
const SortableRow = ({ categoria, onEdit, onEliminar, onRestaurar, eliminando, categoriasActivas }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: categoria.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const isActiva = categoria.activo !== false;

  return (
    <TableRow
      ref={setNodeRef}
      style={style}
      className={!isActiva ? "opacity-50 bg-gray-50" : ""}
    >
      <TableCell>
        {isActiva ? (
          <div
            {...attributes}
            {...listeners}
            className="flex items-center text-gray-400 cursor-grab active:cursor-grabbing"
          >
            <GripVertical className="w-4 h-4" />
            <span className="ml-1 text-xs">{categoria.orden || 0}</span>
          </div>
        ) : (
          <div className="flex items-center text-gray-400">
            <span className="text-xs">{categoria.orden || 0}</span>
          </div>
        )}
      </TableCell>
      <TableCell className="font-medium">
        {categoria.nombre}
        {!isActiva && (
          <Badge variant="outline" className="ml-2 text-xs">
            Inactiva
          </Badge>
        )}
      </TableCell>
      <TableCell>
        <Badge className={categoria.color || "bg-gray-100"}>
          {categoria.nombre}
        </Badge>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex gap-1 justify-end">
          {isActiva ? (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onEdit(categoria)}
                disabled={eliminando === categoria.id}
              >
                <Edit className="w-3 h-3" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onEliminar(categoria)}
                disabled={eliminando === categoria.id}
                title="Desactivar categoría"
              >
                {eliminando === categoria.id ? (
                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-red-500"></div>
                ) : (
                  <Trash2 className="w-3 h-3 text-red-600" />
                )}
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onRestaurar(categoria)}
              disabled={eliminando === categoria.id}
              title="Restaurar categoría"
            >
              {eliminando === categoria.id ? (
                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-500"></div>
              ) : (
                <RotateCcw className="w-3 h-3 text-blue-600" />
              )}
            </Button>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
};

const GestionCategorias = ({ open, onOpenChange }) => {
  const {
    categorias,
    categoriasActivas,
    loading,
    error,
    crearCategoria,
    actualizarCategoria,
    eliminarCategoria,
    tieneGastosAsociados,
    cargarCategorias,
  } = useCategoriasGastos();

  const [editando, setEditando] = useState(null);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [vistaActiva, setVistaActiva] = useState("activas");
  const [formData, setFormData] = useState({
    nombre: "",
    color: coloresPredefinidos[0].value,
    colorHex: coloresPredefinidos[0].hex,
    usarColorPersonalizado: false,
  });
  const [eliminando, setEliminando] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [reordenando, setReordenando] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const resetFormulario = () => {
    setFormData({
      nombre: "",
      color: coloresPredefinidos[0].value,
      colorHex: coloresPredefinidos[0].hex,
      usarColorPersonalizado: false,
    });
    setEditando(null);
    setMostrarFormulario(false);
  };

  const handleCrear = async () => {
    if (!formData.nombre.trim()) {
      alert("El nombre es obligatorio");
      return;
    }

    setGuardando(true);
    try {
      const colorFinal = formData.usarColorPersonalizado
        ? hexToTailwind(formData.colorHex)
        : formData.color;

      await crearCategoria({
        nombre: formData.nombre,
        color: colorFinal,
      });
      resetFormulario();
    } catch (err) {
      alert("Error al crear categoría: " + err.message);
    } finally {
      setGuardando(false);
    }
  };

  const handleEditar = (categoria) => {
    setEditando(categoria);
    
    // Detectar si usa color personalizado
    const colorPredefinido = coloresPredefinidos.find(c => c.value === categoria.color);
    const usarPersonalizado = !colorPredefinido;
    
    setFormData({
      nombre: categoria.nombre,
      color: categoria.color || coloresPredefinidos[0].value,
      colorHex: colorPredefinido?.hex || "#F3F4F6",
      usarColorPersonalizado: usarPersonalizado,
    });
    setMostrarFormulario(true);
  };

  const handleActualizar = async () => {
    if (!formData.nombre.trim()) {
      alert("El nombre es obligatorio");
      return;
    }

    setGuardando(true);
    try {
      const colorFinal = formData.usarColorPersonalizado
        ? hexToTailwind(formData.colorHex)
        : formData.color;

      await actualizarCategoria(editando.id, {
        nombre: formData.nombre,
        color: colorFinal,
      });
      resetFormulario();
    } catch (err) {
      alert("Error al actualizar categoría: " + err.message);
    } finally {
      setGuardando(false);
    }
  };

  const handleEliminar = async (categoria) => {
    if (!confirm(`¿Estás seguro de desactivar la categoría "${categoria.nombre}"?\n\nSe marcará como inactiva pero no se eliminará.`)) {
      return;
    }

    setEliminando(categoria.id);
    try {
      // Soft delete: marcar como inactiva
      await actualizarCategoria(categoria.id, {
        activo: false,
      });
    } catch (err) {
      alert("Error al desactivar categoría: " + err.message);
    } finally {
      setEliminando(null);
    }
  };

  const handleRestaurar = async (categoria) => {
    setEliminando(categoria.id);
    try {
      await actualizarCategoria(categoria.id, {
        activo: true,
      });
    } catch (err) {
      alert("Error al restaurar categoría: " + err.message);
    } finally {
      setEliminando(null);
    }
  };

  const handleDragEnd = async (event) => {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    const oldIndex = categoriasActivas.findIndex((cat) => cat.id === active.id);
    const newIndex = categoriasActivas.findIndex((cat) => cat.id === over.id);

    if (oldIndex === -1 || newIndex === -1) {
      return;
    }

    const nuevasCategorias = arrayMove(categoriasActivas, oldIndex, newIndex);
    setReordenando(true);

    try {
      // Actualizar el orden de todas las categorías afectadas
      const promesas = nuevasCategorias.map((cat, index) => {
        if (cat.orden !== index) {
          return actualizarCategoria(cat.id, { orden: index });
        }
        return Promise.resolve();
      });

      await Promise.all(promesas);
      
      // Recargar categorías para reflejar el nuevo orden
      await cargarCategorias();
    } catch (err) {
      console.error("Error al reordenar:", err);
      alert("Error al reordenar categorías: " + err.message);
    } finally {
      setReordenando(false);
    }
  };

  const categoriasInactivas = categorias.filter(cat => cat.activo === false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-[900px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="pr-20">
            Gestión de Categorías de Gastos
          </DialogTitle>
          <div className="flex justify-end mt-2">
            <Button
              size="sm"
              onClick={() => {
                resetFormulario();
                setMostrarFormulario(true);
              }}
              disabled={mostrarFormulario}
            >
              <Plus className="w-4 h-4 mr-1" />
              Nueva Categoría
            </Button>
          </div>
        </DialogHeader>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            Error: {error}
          </div>
        )}

        {mostrarFormulario && (
          <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 mb-4">
            <h3 className="font-semibold mb-3">
              {editando ? "Editar Categoría" : "Nueva Categoría"}
            </h3>
            
            <div className="space-y-3">
              <div>
                <Label>Nombre de la Categoría *</Label>
                <Input
                  value={formData.nombre}
                  onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                  placeholder="Ej: Gastos Varios"
                />
              </div>

              <div>
                <Label>Color</Label>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="colorPersonalizado"
                      checked={formData.usarColorPersonalizado}
                      onChange={(e) => setFormData({ ...formData, usarColorPersonalizado: e.target.checked })}
                      className="rounded"
                    />
                    <Label htmlFor="colorPersonalizado" className="text-sm font-normal cursor-pointer">
                      Usar color personalizado
                    </Label>
                  </div>

                  {formData.usarColorPersonalizado ? (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={formData.colorHex}
                          onChange={(e) => setFormData({ ...formData, colorHex: e.target.value })}
                          className="h-10 w-20 rounded border border-gray-300 cursor-pointer"
                        />
                        <Input
                          type="text"
                          value={formData.colorHex}
                          onChange={(e) => setFormData({ ...formData, colorHex: e.target.value })}
                          placeholder="#F3F4F6"
                          className="flex-1"
                          maxLength={7}
                        />
                      </div>
                      <p className="text-xs text-gray-500">
                        Selecciona un color personalizado o ingresa un código hexadecimal
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-5 gap-2">
                      {coloresPredefinidos.map((color, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setFormData({ ...formData, color: color.value, colorHex: color.hex })}
                          className={`h-10 rounded border-2 ${
                            formData.color === color.value
                              ? "border-blue-500 ring-2 ring-blue-200"
                              : "border-gray-300"
                          } ${color.value.split(" ")[0]}`}
                          title={color.label}
                        />
                      ))}
                    </div>
                  )}
                </div>
                <div className="mt-2">
                  <Badge className={formData.usarColorPersonalizado ? hexToTailwind(formData.colorHex) : formData.color}>
                    Vista previa: {formData.nombre || "Nombre de categoría"}
                  </Badge>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <Button
                  onClick={editando ? handleActualizar : handleCrear}
                  disabled={guardando || !formData.nombre.trim()}
                >
                  {guardando ? "Guardando..." : editando ? "Actualizar" : "Crear"}
                </Button>
                <Button
                  variant="outline"
                  onClick={resetFormulario}
                  disabled={guardando}
                >
                  Cancelar
                </Button>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
            <p className="text-gray-600 mt-2">Cargando categorías...</p>
          </div>
        ) : (
          <Tabs value={vistaActiva} onValueChange={setVistaActiva}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="activas">
                <Eye className="w-4 h-4 mr-1" />
                Activas ({categoriasActivas.length})
              </TabsTrigger>
              <TabsTrigger value="inactivas">
                <EyeOff className="w-4 h-4 mr-1" />
                Inactivas ({categoriasInactivas.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="activas" className="mt-4">
              {categoriasActivas.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No hay categorías activas. Crea una nueva para comenzar.
                </div>
              ) : (
                <div className="border rounded-lg">
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12">Orden</TableHead>
                          <TableHead>Nombre</TableHead>
                          <TableHead>Color</TableHead>
                          <TableHead className="text-right">Acciones</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        <SortableContext
                          items={categoriasActivas.map(c => c.id)}
                          strategy={verticalListSortingStrategy}
                        >
                          {categoriasActivas.map((categoria) => (
                            <SortableRow
                              key={categoria.id}
                              categoria={categoria}
                              onEdit={handleEditar}
                              onEliminar={handleEliminar}
                              onRestaurar={handleRestaurar}
                              eliminando={eliminando}
                              categoriasActivas={categoriasActivas}
                            />
                          ))}
                        </SortableContext>
                      </TableBody>
                    </Table>
                  </DndContext>
                  {reordenando && (
                    <div className="p-2 text-center text-sm text-gray-500 bg-blue-50">
                      Guardando nuevo orden...
                    </div>
                  )}
                </div>
              )}
            </TabsContent>

            <TabsContent value="inactivas" className="mt-4">
              {categoriasInactivas.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No hay categorías inactivas.
                </div>
              ) : (
                <div className="border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">Orden</TableHead>
                        <TableHead>Nombre</TableHead>
                        <TableHead>Color</TableHead>
                        <TableHead className="text-right">Acciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {categoriasInactivas.map((categoria) => (
                        <SortableRow
                          key={categoria.id}
                          categoria={categoria}
                          onEdit={handleEditar}
                          onEliminar={handleEliminar}
                          onRestaurar={handleRestaurar}
                          eliminando={eliminando}
                          categoriasActivas={categoriasActivas}
                        />
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default GestionCategorias;
