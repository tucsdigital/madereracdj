"use client";
import React, { useState, useEffect, useMemo } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Receipt, Plus, Edit, Trash2, Eye, Filter, Download, Calendar, TrendingUp, TrendingDown, BarChart3, X, Search } from "lucide-react";
import { db } from "@/lib/firebase";
import { collection, addDoc, getDocs, deleteDoc, doc, updateDoc, serverTimestamp, query, where, orderBy } from "firebase/firestore";
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
  const [gastos, setGastos] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  
  // Filtros avanzados
  const [filtros, setFiltros] = useState({
    busqueda: "",
    estado: "",
    cliente: "",
    responsable: "",
    fechaInicio: "",
    fechaFin: "",
    mes: "",
    año: new Date().getFullYear().toString()
  });
  const [mostrarFiltros, setMostrarFiltros] = useState(false);
  const [vistaActual, setVistaActual] = useState("tabla"); // tabla, mes, grafico
  const [gastosPorMes, setGastosPorMes] = useState({});

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

  // Función para obtener meses del año
  const obtenerMeses = () => {
    return [
      { value: "01", label: "Enero" },
      { value: "02", label: "Febrero" },
      { value: "03", label: "Marzo" },
      { value: "04", label: "Abril" },
      { value: "05", label: "Mayo" },
      { value: "06", label: "Junio" },
      { value: "07", label: "Julio" },
      { value: "08", label: "Agosto" },
      { value: "09", label: "Septiembre" },
      { value: "10", label: "Octubre" },
      { value: "11", label: "Noviembre" },
      { value: "12", label: "Diciembre" }
    ];
  };

  // Función para obtener años disponibles
  const obtenerAños = () => {
    const años = [...new Set(gastos.map(g => {
      const fecha = new Date(g.fecha);
      return fecha.getFullYear();
    }))].sort((a, b) => b - a);
    return años.map(año => ({ value: año.toString(), label: año.toString() }));
  };

  // Función para obtener responsables únicos
  const obtenerResponsables = () => {
    const responsables = [...new Set(gastos.map(g => g.responsable).filter(Boolean))];
    return responsables.map(resp => ({ value: resp, label: resp }));
  };

  // Filtrar gastos con filtros avanzados
  const gastosFiltrados = useMemo(() => {
    return gastos.filter(g => {
      // Filtro de búsqueda general
      if (filtros.busqueda) {
        const busqueda = filtros.busqueda.toLowerCase();
        const concepto = (g.concepto || "").toLowerCase();
        const responsable = (g.responsable || "").toLowerCase();
        const cliente = (g.cliente?.nombre || "").toLowerCase();
        const observaciones = (g.observaciones || "").toLowerCase();
        
        if (!concepto.includes(busqueda) && 
            !responsable.includes(busqueda) && 
            !cliente.includes(busqueda) &&
            !observaciones.includes(busqueda)) {
          return false;
        }
      }

      // Filtro por estado
      if (filtros.estado && g.estado !== filtros.estado) {
        return false;
      }

      // Filtro por cliente
      if (filtros.cliente && g.clienteId !== filtros.cliente) {
        return false;
      }

      // Filtro por responsable
      if (filtros.responsable && g.responsable !== filtros.responsable) {
        return false;
      }

      // Filtro por mes y año
      if (filtros.mes || filtros.año) {
        const fecha = new Date(g.fecha);
        const mes = (fecha.getMonth() + 1).toString().padStart(2, '0');
        const año = fecha.getFullYear().toString();
        
        if (filtros.mes && mes !== filtros.mes) {
          return false;
        }
        if (filtros.año && año !== filtros.año) {
          return false;
        }
      }

      // Filtro por rango de fechas
      if (filtros.fechaInicio || filtros.fechaFin) {
        const fechaGasto = new Date(g.fecha);
        
        if (filtros.fechaInicio) {
          const fechaInicio = new Date(filtros.fechaInicio);
          if (fechaGasto < fechaInicio) {
            return false;
          }
        }
        
        if (filtros.fechaFin) {
          const fechaFin = new Date(filtros.fechaFin);
          if (fechaGasto > fechaFin) {
            return false;
          }
        }
      }

      return true;
    });
  }, [gastos, filtros]);

  // Agrupar gastos por mes
  const gastosAgrupadosPorMes = useMemo(() => {
    const agrupados = {};
    gastosFiltrados.forEach(gasto => {
      const fecha = new Date(gasto.fecha);
      const mesAño = `${fecha.getFullYear()}-${(fecha.getMonth() + 1).toString().padStart(2, '0')}`;
      const mesNombre = obtenerMeses()[fecha.getMonth()].label;
      
      if (!agrupados[mesAño]) {
        agrupados[mesAño] = {
          mes: mesNombre,
          año: fecha.getFullYear(),
          gastos: [],
          total: 0,
          totalPorEstado: {
            varios: 0,
            empleados: 0,
            viaticos: 0
          }
        };
      }
      
      agrupados[mesAño].gastos.push(gasto);
      agrupados[mesAño].total += Number(gasto.monto);
      agrupados[mesAño].totalPorEstado[gasto.estado] += Number(gasto.monto);
    });
    
    return Object.values(agrupados).sort((a, b) => {
      if (a.año !== b.año) return b.año - a.año;
      return b.mes.localeCompare(a.mes);
    });
  }, [gastosFiltrados]);

  // Función para limpiar filtros
  const limpiarFiltros = () => {
    setFiltros({
      busqueda: "",
      estado: "",
      cliente: "",
      responsable: "",
      fechaInicio: "",
      fechaFin: "",
      mes: "",
      año: new Date().getFullYear().toString()
    });
  };

  // Función para exportar datos
  const exportarDatos = () => {
    const datos = gastosFiltrados.map(gasto => ({
      Fecha: gasto.fecha,
      Concepto: gasto.concepto,
      Estado: estadosGasto[gasto.estado]?.label || gasto.estado,
      Monto: gasto.monto,
      Responsable: gasto.responsable,
      Cliente: gasto.cliente?.nombre || "",
      Observaciones: gasto.observaciones || ""
    }));

    const csv = [
      Object.keys(datos[0]).join(','),
      ...datos.map(row => Object.values(row).map(val => `"${val}"`).join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gastos_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

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
    <div className="py-8 px-2 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Receipt className="w-10 h-10 text-primary" />
          <div>
            <h1 className="text-3xl font-bold mb-1">Gestión de Gastos</h1>
            <p className="text-lg text-gray-500">Control avanzado y análisis de gastos de la maderera.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setMostrarFiltros(!mostrarFiltros)}>
            <Filter className="w-4 h-4 mr-2" />
            Filtros
          </Button>
          <Button variant="outline" onClick={exportarDatos} disabled={gastosFiltrados.length === 0}>
            <Download className="w-4 h-4 mr-2" />
            Exportar
          </Button>
          <Button variant="default" onClick={() => setOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Nuevo Gasto
          </Button>
        </div>
      </div>

      {/* Filtros Avanzados */}
      {mostrarFiltros && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="w-5 h-5" />
              Filtros Avanzados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Búsqueda General</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    placeholder="Concepto, responsable, cliente..."
                    value={filtros.busqueda}
                    onChange={(e) => setFiltros(prev => ({ ...prev, busqueda: e.target.value }))}
                    className="pl-10"
                  />
                </div>
              </div>
              
              <div>
                <label className="text-sm font-medium mb-2 block">Estado</label>
                <Select value={filtros.estado} onValueChange={(value) => setFiltros(prev => ({ ...prev, estado: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todos los estados" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Todos los estados</SelectItem>
                    {Object.entries(estadosGasto).map(([key, value]) => (
                      <SelectItem key={key} value={key}>{value.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Cliente</label>
                <Select value={filtros.cliente} onValueChange={(value) => setFiltros(prev => ({ ...prev, cliente: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todos los clientes" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Todos los clientes</SelectItem>
                    {clientes.map(cliente => (
                      <SelectItem key={cliente.id} value={cliente.id}>
                        {cliente.nombre} {cliente.telefono ? `(${cliente.telefono})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Responsable</label>
                <Select value={filtros.responsable} onValueChange={(value) => setFiltros(prev => ({ ...prev, responsable: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todos los responsables" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Todos los responsables</SelectItem>
                    {obtenerResponsables().map(resp => (
                      <SelectItem key={resp.value} value={resp.value}>{resp.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Mes</label>
                <Select value={filtros.mes} onValueChange={(value) => setFiltros(prev => ({ ...prev, mes: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todos los meses" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Todos los meses</SelectItem>
                    {obtenerMeses().map(mes => (
                      <SelectItem key={mes.value} value={mes.value}>{mes.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Año</label>
                <Select value={filtros.año} onValueChange={(value) => setFiltros(prev => ({ ...prev, año: value }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar año" />
                  </SelectTrigger>
                  <SelectContent>
                    {obtenerAños().map(año => (
                      <SelectItem key={año.value} value={año.value}>{año.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Fecha Inicio</label>
                <Input
                  type="date"
                  value={filtros.fechaInicio}
                  onChange={(e) => setFiltros(prev => ({ ...prev, fechaInicio: e.target.value }))}
                />
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Fecha Fin</label>
                <Input
                  type="date"
                  value={filtros.fechaFin}
                  onChange={(e) => setFiltros(prev => ({ ...prev, fechaFin: e.target.value }))}
                />
              </div>
            </div>
            
            <div className="flex justify-between items-center mt-4 pt-4 border-t">
              <div className="text-sm text-gray-600">
                Mostrando {gastosFiltrados.length} de {gastos.length} gastos
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={limpiarFiltros}>
                  <X className="w-4 h-4 mr-2" />
                  Limpiar Filtros
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Resumen de gastos mejorado */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-500">Total Gastos</div>
                <div className="text-3xl font-bold text-red-600">
                  ${totalGastos.toLocaleString("es-AR")}
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  {gastos.length} registros
                </div>
              </div>
              <TrendingDown className="w-8 h-8 text-red-500" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-500">Varios</div>
                <div className="text-2xl font-bold text-blue-600">
                  ${totalesPorEstado.varios.toLocaleString("es-AR")}
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  {gastos.filter(g => g.estado === 'varios').length} gastos
                </div>
              </div>
              <BarChart3 className="w-8 h-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-500">Empleados</div>
                <div className="text-2xl font-bold text-green-600">
                  ${totalesPorEstado.empleados.toLocaleString("es-AR")}
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  {gastos.filter(g => g.estado === 'empleados').length} gastos
                </div>
              </div>
              <TrendingUp className="w-8 h-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-gray-500">Viáticos</div>
                <div className="text-2xl font-bold text-purple-600">
                  ${totalesPorEstado.viaticos.toLocaleString("es-AR")}
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  {gastos.filter(g => g.estado === 'viaticos').length} gastos
                </div>
              </div>
              <Calendar className="w-8 h-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Selector de vista */}
      <div className="mb-6">
        <div className="flex gap-2">
          <Button
            variant={vistaActual === "tabla" ? "default" : "outline"}
            onClick={() => setVistaActual("tabla")}
          >
            <Table className="w-4 h-4 mr-2" />
            Vista Tabla
          </Button>
          <Button
            variant={vistaActual === "mes" ? "default" : "outline"}
            onClick={() => setVistaActual("mes")}
          >
            <Calendar className="w-4 h-4 mr-2" />
            Vista por Mes
          </Button>
          <Button
            variant={vistaActual === "grafico" ? "default" : "outline"}
            onClick={() => setVistaActual("grafico")}
          >
            <BarChart3 className="w-4 h-4 mr-2" />
            Gráficos
          </Button>
        </div>
      </div>

      {/* Vista por Mes */}
      {vistaActual === "mes" && (
        <div className="space-y-6">
          {gastosAgrupadosPorMes.map((mesData, index) => (
            <Card key={index}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl">
                    {mesData.mes} {mesData.año}
                  </CardTitle>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-red-600">
                      ${mesData.total.toLocaleString("es-AR")}
                    </div>
                    <div className="text-sm text-gray-500">
                      {mesData.gastos.length} gastos
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  {Object.entries(mesData.totalPorEstado).map(([estado, total]) => (
                    <div key={estado} className="text-center p-3 bg-gray-50 rounded-lg">
                      <div className="text-sm text-gray-600">{estadosGasto[estado]?.label || estado}</div>
                      <div className="text-lg font-semibold">
                        ${total.toLocaleString("es-AR")}
                      </div>
                    </div>
                  ))}
                </div>
                
                <div className="space-y-2">
                  {mesData.gastos.map(gasto => (
                    <div key={gasto.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex-1">
                        <div className="font-medium">{gasto.concepto}</div>
                        <div className="text-sm text-gray-500">
                          {gasto.fecha} • {gasto.responsable}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-red-600">
                          ${Number(gasto.monto).toLocaleString("es-AR")}
                        </div>
                        <Badge className={estadosGasto[gasto.estado]?.color}>
                          {estadosGasto[gasto.estado]?.label || gasto.estado}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Vista Tabla */}
      {vistaActual === "tabla" && (
        <Card>
          <CardHeader>
            <CardTitle>Listado de Gastos</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {gastosFiltrados.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                {filtros.busqueda || filtros.estado || filtros.cliente || filtros.responsable || filtros.mes || filtros.año || filtros.fechaInicio || filtros.fechaFin ? "No se encontraron gastos con los filtros aplicados" : "No hay gastos registrados"}
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
                      <Badge className={estadosGasto[g.estado]?.color || 'bg-gray-100 text-gray-800'}>
                        {estadosGasto[g.estado]?.label || g.estado}
                      </Badge>
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
      )}

      {/* Vista Gráficos */}
      {vistaActual === "grafico" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Gráfico por Estado */}
          <Card>
            <CardHeader>
              <CardTitle>Gastos por Estado</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {Object.entries(totalesPorEstado).map(([estado, total]) => {
                  const porcentaje = totalGastos > 0 ? (total / totalGastos) * 100 : 0;
                  return (
                    <div key={estado} className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium">
                          {estadosGasto[estado]?.label || estado}
                        </span>
                        <span className="text-sm text-gray-500">
                          ${total.toLocaleString("es-AR")} ({porcentaje.toFixed(1)}%)
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className={`h-2 rounded-full ${
                            estado === 'varios' ? 'bg-blue-500' :
                            estado === 'empleados' ? 'bg-green-500' : 'bg-purple-500'
                          }`}
                          style={{ width: `${porcentaje}%` }}
                        ></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Gráfico por Mes */}
          <Card>
            <CardHeader>
              <CardTitle>Gastos por Mes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {gastosAgrupadosPorMes.slice(0, 6).map((mesData, index) => {
                  const maxTotal = Math.max(...gastosAgrupadosPorMes.map(m => m.total));
                  const porcentaje = maxTotal > 0 ? (mesData.total / maxTotal) * 100 : 0;
                  return (
                    <div key={index} className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium">
                          {mesData.mes} {mesData.año}
                        </span>
                        <span className="text-sm text-gray-500">
                          ${mesData.total.toLocaleString("es-AR")}
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className="h-2 rounded-full bg-red-500"
                          style={{ width: `${porcentaje}%` }}
                        ></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Resumen de Responsables */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Gastos por Responsable</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {obtenerResponsables().map(resp => {
                  const gastosResponsable = gastosFiltrados.filter(g => g.responsable === resp.value);
                  const total = gastosResponsable.reduce((acc, g) => acc + Number(g.monto), 0);
                  return (
                    <div key={resp.value} className="p-4 border rounded-lg">
                      <div className="text-sm text-gray-500">{resp.label}</div>
                      <div className="text-2xl font-bold text-red-600">
                        ${total.toLocaleString("es-AR")}
                      </div>
                      <div className="text-xs text-gray-400">
                        {gastosResponsable.length} gastos
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

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
              <label className="text-sm font-medium mb-2 block">Cliente/Proveedor</label>
              <Select value={watch("clienteId")} onValueChange={(value) => setValue("clienteId", value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar cliente/proveedor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Sin cliente/proveedor</SelectItem>
                  {clientes.map(cliente => (
                    <SelectItem key={cliente.id} value={cliente.id}>
                      {cliente.nombre} {cliente.telefono ? `(${cliente.telefono})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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