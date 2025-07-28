"use client";
import React, { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Receipt, Plus, Edit, Trash2, Eye } from "lucide-react";
import { db } from "@/lib/firebase";
import { collection, addDoc, getDocs, deleteDoc, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";

// Schema de validación
const schema = yup.object().shape({
  concepto: yup.string().required("El concepto es obligatorio"),
  monto: yup.number().positive("El monto debe ser positivo").required("El monto es obligatorio"),
  responsable: yup.string().required("El responsable es obligatorio"),
  fecha: yup.string().required("La fecha es obligatoria"),
  observaciones: yup.string().optional(),
});

const GastosPage = () => {
  const [open, setOpen] = useState(false);
  const [editando, setEditando] = useState(null);
  const [filtro, setFiltro] = useState("");
  const [gastos, setGastos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm({
    resolver: yupResolver(schema),
    defaultValues: {
      concepto: "",
      monto: "",
      responsable: "",
      fecha: new Date().toISOString().split("T")[0],
      observaciones: "",
    },
  });

  // Cargar gastos desde Firebase
  useEffect(() => {
    const cargarGastos = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, "gastos"));
        const gastosData = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          fecha: doc.data().fecha ? new Date(doc.data().fecha).toISOString().split("T")[0] : "",
        }));
        setGastos(gastosData.sort((a, b) => new Date(b.fecha) - new Date(a.fecha)));
      } catch (error) {
        console.error("Error al cargar gastos:", error);
      } finally {
        setLoading(false);
      }
    };

    cargarGastos();
  }, []);

  // Función para guardar gasto
  const onSubmit = async (data) => {
    setGuardando(true);
    try {
      const gastoData = {
        ...data,
        monto: Number(data.monto),
        fechaCreacion: serverTimestamp(),
        fechaActualizacion: serverTimestamp(),
      };

      if (editando) {
        // Actualizar gasto existente
        await updateDoc(doc(db, "gastos", editando.id), {
          ...gastoData,
          fechaActualizacion: serverTimestamp(),
        });
        
        setGastos(prev => prev.map(g => 
          g.id === editando.id 
            ? { ...g, ...data, monto: Number(data.monto) }
            : g
        ));
      } else {
        // Crear nuevo gasto
        const docRef = await addDoc(collection(db, "gastos"), gastoData);
        const nuevoGasto = {
          id: docRef.id,
          ...data,
          monto: Number(data.monto),
          fechaCreacion: new Date().toISOString(),
        };
        setGastos(prev => [nuevoGasto, ...prev]);
      }

      reset();
      setOpen(false);
      setEditando(null);
    } catch (error) {
      console.error("Error al guardar gasto:", error);
      alert("Error al guardar el gasto: " + error.message);
    } finally {
      setGuardando(false);
    }
  };

  // Función para editar gasto
  const handleEditar = (gasto) => {
    setEditando(gasto);
    setValue("concepto", gasto.concepto);
    setValue("monto", gasto.monto);
    setValue("responsable", gasto.responsable);
    setValue("fecha", gasto.fecha);
    setValue("observaciones", gasto.observaciones || "");
    setOpen(true);
  };

  // Función para eliminar gasto
  const handleEliminar = async (gasto) => {
    if (!confirm("¿Estás seguro de que quieres eliminar este gasto?")) return;
    
    try {
      await deleteDoc(doc(db, "gastos", gasto.id));
      setGastos(prev => prev.filter(g => g.id !== gasto.id));
    } catch (error) {
      console.error("Error al eliminar gasto:", error);
      alert("Error al eliminar el gasto: " + error.message);
    }
  };

  // Función para ver detalles
  const handleVer = (gasto) => {
    alert(`Detalles del gasto:\n\nConcepto: ${gasto.concepto}\nMonto: $${gasto.monto}\nResponsable: ${gasto.responsable}\nFecha: ${gasto.fecha}\nObservaciones: ${gasto.observaciones || "Sin observaciones"}`);
  };

  // Función para cerrar modal
  const handleCerrarModal = () => {
    setOpen(false);
    setEditando(null);
    reset();
  };

  // Filtrar gastos
  const gastosFiltrados = gastos.filter(g => 
    g.concepto.toLowerCase().includes(filtro.toLowerCase()) || 
    g.responsable.toLowerCase().includes(filtro.toLowerCase())
  );

  // Calcular total de gastos
  const totalGastos = gastos.reduce((acc, g) => acc + Number(g.monto), 0);

  if (loading) {
    return (
      <div className="py-8 px-2 max-w-5xl mx-auto">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-gray-600">Cargando gastos...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="py-8 px-2 max-w-5xl mx-auto">
      <div className="mb-8 flex items-center gap-4">
        <Receipt className="w-10 h-10 text-primary" />
        <div>
          <h1 className="text-3xl font-bold mb-1">Gastos</h1>
          <p className="text-lg text-gray-500">Control y registro de gastos de la maderera.</p>
        </div>
      </div>

      {/* Resumen de gastos */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-gray-500">Total Gastos</div>
            <div className="text-2xl font-bold text-red-600">
              ${totalGastos.toLocaleString("es-AR")}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-gray-500">Cantidad de Registros</div>
            <div className="text-2xl font-bold text-blue-600">
              {gastos.length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-gray-500">Promedio por Gasto</div>
            <div className="text-2xl font-bold text-green-600">
              ${gastos.length > 0 ? (totalGastos / gastos.length).toLocaleString("es-AR", { maximumFractionDigits: 2 }) : "0"}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle>Listado de Gastos</CardTitle>
          <div className="flex gap-2">
            <Input 
              placeholder="Buscar concepto o responsable..." 
              value={filtro} 
              onChange={e => setFiltro(e.target.value)} 
              className="w-56" 
            />
            <Button variant="default" onClick={() => setOpen(true)}>
              <Plus className="w-4 h-4 mr-1" />
              Registrar Gasto
            </Button>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {gastosFiltrados.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              {filtro ? "No se encontraron gastos con ese filtro" : "No hay gastos registrados"}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Concepto</TableHead>
                  <TableHead>Monto</TableHead>
                  <TableHead>Responsable</TableHead>
                  <TableHead>Observaciones</TableHead>
                  <TableHead>Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {gastosFiltrados.map(g => (
                  <TableRow key={g.id}>
                    <TableCell>{g.fecha}</TableCell>
                    <TableCell className="font-medium">{g.concepto}</TableCell>
                    <TableCell className="font-bold text-red-600">
                      ${Number(g.monto).toLocaleString("es-AR")}
                    </TableCell>
                    <TableCell>{g.responsable}</TableCell>
                    <TableCell className="max-w-xs truncate" title={g.observaciones}>
                      {g.observaciones || "-"}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" onClick={() => handleVer(g)}>
                          <Eye className="w-3 h-3" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleEditar(g)}>
                          <Edit className="w-3 h-3" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleEliminar(g)}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[95vw] max-w-[420px]">
          <DialogHeader>
            <DialogTitle>
              {editando ? "Editar Gasto" : "Registrar Gasto"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3 py-2">
            <div>
              <Input 
                placeholder="Concepto *" 
                {...register("concepto")}
                className={errors.concepto ? "border-red-500" : ""}
              />
              {errors.concepto && (
                <span className="text-red-500 text-xs">{errors.concepto.message}</span>
              )}
            </div>
            
            <div>
              <Input 
                placeholder="Monto *" 
                type="number" 
                step="0.01"
                {...register("monto")}
                className={errors.monto ? "border-red-500" : ""}
              />
              {errors.monto && (
                <span className="text-red-500 text-xs">{errors.monto.message}</span>
              )}
            </div>
            
            <div>
              <Input 
                placeholder="Responsable *" 
                {...register("responsable")}
                className={errors.responsable ? "border-red-500" : ""}
              />
              {errors.responsable && (
                <span className="text-red-500 text-xs">{errors.responsable.message}</span>
              )}
            </div>
            
            <div>
              <Input 
                placeholder="Fecha *" 
                type="date" 
                {...register("fecha")}
                className={errors.fecha ? "border-red-500" : ""}
              />
              {errors.fecha && (
                <span className="text-red-500 text-xs">{errors.fecha.message}</span>
              )}
            </div>
            
            <div>
              <Textarea 
                placeholder="Observaciones (opcional)" 
                {...register("observaciones")}
                rows={3}
              />
            </div>
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={handleCerrarModal} disabled={guardando}>
              Cancelar
            </Button>
            <Button 
              variant="default" 
              onClick={handleSubmit(onSubmit)}
              disabled={guardando}
            >
              {guardando ? "Guardando..." : (editando ? "Actualizar" : "Guardar")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default GastosPage; 