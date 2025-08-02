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
import { useAuth } from "@/provider/auth.provider";

// Estados de gastos
const estadosGasto = {
  varios: { label: "Varios", color: "bg-blue-100 text-blue-800 border-blue-200" },
  empleados: { label: "Empleados", color: "bg-green-100 text-green-800 border-green-200" },
  viaticos: { label: "Viáticos", color: "bg-purple-100 text-purple-800 border-purple-200" },
};

// Schema de validación actualizado
const schema = yup.object().shape({
  concepto: yup.string().required("El concepto es obligatorio"),
  monto: yup.number().positive("El monto debe ser positivo").required("El monto es obligatorio"),
  estado: yup.string().required("El estado es obligatorio"),
  fecha: yup.string().required("La fecha es obligatoria"),
  observaciones: yup.string().optional(),
  clienteId: yup.string().optional(),
});

// Función helper para formatear fechas de manera segura
const formatFechaSegura = (fecha) => {
  if (!fecha) return "";
  
  try {
    // Si ya es un string en formato YYYY-MM-DD, devolverlo tal como está
    if (typeof fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      return fecha;
    }
    
    // Si es un timestamp de Firestore
    if (fecha && typeof fecha === "object" && fecha.toDate) {
      return fecha.toDate().toISOString().split("T")[0];
    }
    
    // Si es un string de fecha válido
    const dateObj = new Date(fecha);
    if (!isNaN(dateObj.getTime())) {
      return dateObj.toISOString().split("T")[0];
    }
    
    return "";
  } catch (error) {
    console.warn("Error al formatear fecha:", fecha, error);
    return "";
  }
};

const GastosPage = () => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [editando, setEditando] = useState(null);
  const [filtro, setFiltro] = useState("");
  const [gastos, setGastos] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm({
    resolver: yupResolver(schema),
    defaultValues: {
      concepto: "",
      monto: "",
      estado: "varios",
      fecha: new Date().toISOString().split("T")[0],
      observaciones: "",
      clienteId: "",
    },
  });

  // Cargar clientes y gastos desde Firebase
  useEffect(() => {
    const cargarDatos = async () => {
      try {
        setLoading(true);
        
        // Cargar clientes
        const clientesSnap = await getDocs(collection(db, "clientes"));
        const clientesData = clientesSnap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setClientes(clientesData);
        
        // Cargar gastos
        const gastosSnap = await getDocs(collection(db, "gastos"));
        const gastosData = gastosSnap.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            concepto: data.concepto || "",
            responsable: data.responsable || "",
            monto: Number(data.monto) || 0,
            estado: data.estado || "varios",
            fecha: formatFechaSegura(data.fecha),
            observaciones: data.observaciones || "",
            clienteId: data.clienteId || "",
            cliente: data.cliente || null,
            fechaCreacion: data.fechaCreacion,
            fechaActualizacion: data.fechaActualizacion,
          };
        });
        
        // Filtrar gastos con fechas válidas y ordenar
        const gastosValidos = gastosData
          .filter(g => g.fecha) // Solo gastos con fecha válida
          .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
        
        setGastos(gastosValidos);
      } catch (error) {
        console.error("Error al cargar datos:", error);
      } finally {
        setLoading(false);
      }
    };

    cargarDatos();
  }, []);

  // Función para obtener nombre del cliente
  const obtenerNombreCliente = (clienteId) => {
    if (!clienteId) return null;
    const cliente = clientes.find(c => c.id === clienteId);
    return cliente ? cliente.nombre : null;
  };

  // Función para guardar gasto
  const onSubmit = async (data) => {
    setGuardando(true);
    try {
      // Asegurar que la fecha esté en formato correcto
      const fechaFormateada = formatFechaSegura(data.fecha) || new Date().toISOString().split("T")[0];
      
      // Obtener información del cliente si se seleccionó
      const clienteSeleccionado = data.clienteId ? clientes.find(c => c.id === data.clienteId) : null;
      
      const gastoData = {
        ...data,
        fecha: fechaFormateada,
        monto: Number(data.monto),
        responsable: user?.email || "Usuario no identificado",
        cliente: clienteSeleccionado ? {
          id: clienteSeleccionado.id,
          nombre: clienteSeleccionado.nombre,
          cuit: clienteSeleccionado.cuit || "",
        } : null,
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
            ? { 
                ...g, 
                ...data, 
                fecha: fechaFormateada, 
                monto: Number(data.monto),
                responsable: user?.email || "Usuario no identificado",
                cliente: gastoData.cliente,
              }
            : g
        ));
      } else {
        // Crear nuevo gasto
        const docRef = await addDoc(collection(db, "gastos"), gastoData);
        const nuevoGasto = {
          id: docRef.id,
          ...data,
          fecha: fechaFormateada,
          monto: Number(data.monto),
          responsable: user?.email || "Usuario no identificado",
          cliente: gastoData.cliente,
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
    setValue("estado", gasto.estado || "varios");
    setValue("fecha", gasto.fecha);
    setValue("observaciones", gasto.observaciones || "");
    setValue("clienteId", gasto.clienteId || "");
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
    const concepto = gasto.concepto || "Sin concepto";
    const monto = gasto.monto || 0;
    const responsable = gasto.responsable || "Sin responsable";
    const estado = estadosGasto[gasto.estado]?.label || gasto.estado || "Sin estado";
    const fecha = gasto.fecha || "Sin fecha";
    const observaciones = gasto.observaciones || "Sin observaciones";
    const cliente = gasto.cliente?.nombre || "Sin cliente/proveedor";
    
    alert(`Detalles del gasto:\n\nConcepto: ${concepto}\nMonto: $${monto.toLocaleString("es-AR")}\nEstado: ${estado}\nResponsable: ${responsable}\nCliente/Proveedor: ${cliente}\nFecha: ${fecha}\nObservaciones: ${observaciones}`);
  };

  // Función para cerrar modal
  const handleCerrarModal = () => {
    setOpen(false);
    setEditando(null);
    reset();
  };

  // Filtrar gastos
  const gastosFiltrados = gastos.filter(g => {
    const concepto = (g.concepto || "").toLowerCase();
    const responsable = (g.responsable || "").toLowerCase();
    const cliente = (g.cliente?.nombre || "").toLowerCase();
    const filtroLower = filtro.toLowerCase();
    
    return concepto.includes(filtroLower) || 
           responsable.includes(filtroLower) || 
           cliente.includes(filtroLower);
  });

  // Calcular total de gastos
  const totalGastos = gastos.reduce((acc, g) => acc + Number(g.monto), 0);

  // Calcular totales por estado
  const totalesPorEstado = {
    varios: gastos.filter(g => g.estado === 'varios').reduce((acc, g) => acc + Number(g.monto), 0),
    empleados: gastos.filter(g => g.estado === 'empleados').reduce((acc, g) => acc + Number(g.monto), 0),
    viaticos: gastos.filter(g => g.estado === 'viaticos').reduce((acc, g) => acc + Number(g.monto), 0),
  };

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
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
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
            <div className="text-sm text-gray-500">Varios</div>
            <div className="text-2xl font-bold text-blue-600">
              ${totalesPorEstado.varios.toLocaleString("es-AR")}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-gray-500">Empleados</div>
            <div className="text-2xl font-bold text-green-600">
              ${totalesPorEstado.empleados.toLocaleString("es-AR")}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-sm text-gray-500">Viáticos</div>
            <div className="text-2xl font-bold text-purple-600">
              ${totalesPorEstado.viaticos.toLocaleString("es-AR")}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle>Listado de Gastos</CardTitle>
          <div className="flex gap-2">
            <Input 
              placeholder="Buscar concepto, responsable o cliente..." 
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
                <TableHead>Estado</TableHead>
                <TableHead>Monto</TableHead>
                <TableHead>Responsable</TableHead>
                <TableHead>Cliente/Proveedor</TableHead>
                <TableHead>Observaciones</TableHead>
                <TableHead>Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
                {gastosFiltrados.map(g => (
                <TableRow key={g.id}>
                  <TableCell>{g.fecha}</TableCell>
                  <TableCell className="font-medium">{g.concepto}</TableCell>
                  <TableCell>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${estadosGasto[g.estado]?.color || 'bg-gray-100 text-gray-800'}`}>
                      {estadosGasto[g.estado]?.label || g.estado}
                    </span>
                  </TableCell>
                  <TableCell className="font-bold text-red-600">
                    ${Number(g.monto).toLocaleString("es-AR")}
                  </TableCell>
                  <TableCell className="text-sm">{g.responsable}</TableCell>
                  <TableCell className="text-sm">
                    {g.cliente?.nombre || "-"}
                  </TableCell>
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
        <DialogContent className="w-[95vw] max-w-[500px]">
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
              <select 
                value={watch("estado")} 
                onChange={(e) => setValue("estado", e.target.value)}
                className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${errors.estado ? "border-red-500" : ""}`}
              >
                <option value="">Seleccionar estado *</option>
                {Object.entries(estadosGasto).map(([key, value]) => (
                  <option key={key} value={key}>
                    {value.label}
                  </option>
                ))}
              </select>
              {errors.estado && (
                <span className="text-red-500 text-xs">{errors.estado.message}</span>
              )}
            </div>
            
            <div>
              <select 
                value={watch("clienteId")} 
                onChange={(e) => setValue("clienteId", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Sin cliente/proveedor</option>
                {clientes.map(cliente => (
                  <option key={cliente.id} value={cliente.id}>
                    {cliente.nombre} {cliente.cuit ? `(${cliente.cuit})` : ""}
                  </option>
                ))}
              </select>
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
            
            <div className="text-sm text-gray-600 bg-gray-50 p-2 rounded">
              <strong>Responsable:</strong> {user?.email || "Usuario no identificado"}
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