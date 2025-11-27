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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Receipt, Plus, Edit, Trash2, Eye, Filter, Download, Calendar, TrendingUp, TrendingDown, BarChart3, X, Search, Building2, Wallet, DollarSign, AlertCircle, FileText } from "lucide-react";
import { db } from "@/lib/firebase";
import { collection, addDoc, getDocs, deleteDoc, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";
import { useAuth } from "@/provider/auth.provider";
import { Label } from "@/components/ui/label";

// Categorías de gastos internos
const categoriasGastoInterno = {
  varios: { label: "Gastos Varios", color: "bg-blue-100 text-blue-800 border-blue-200" },
  empleados: { label: "Empleados", color: "bg-green-100 text-green-800 border-green-200" },
  operativos: { label: "Gastos Operativos", color: "bg-orange-100 text-orange-800 border-orange-200" },
  viaticos: { label: "Viáticos", color: "bg-purple-100 text-purple-800 border-purple-200" },
  ventaMarketing: { label: "Venta y Marketing", color: "bg-pink-100 text-pink-800 border-pink-200" },
  generales: { label: "Gastos Generales", color: "bg-gray-100 text-gray-800 border-gray-200" },
};

// Estados de pago para proveedores
const estadosPago = {
  pendiente: { label: "Pendiente", color: "bg-red-100 text-red-800 border-red-200" },
  parcial: { label: "Pagado Parcial", color: "bg-yellow-100 text-yellow-800 border-yellow-200" },
  pagado: { label: "Pagado", color: "bg-green-100 text-green-800 border-green-200" },
};

// Schema para gastos internos
const schemaInterno = yup.object().shape({
  concepto: yup.string().required("El concepto es obligatorio"),
  monto: yup.number().positive("El monto debe ser positivo").required("El monto es obligatorio"),
  categoria: yup.string().required("La categoría es obligatoria"),
  fecha: yup.string().required("La fecha es obligatoria"),
  observaciones: yup.string().optional(),
});

// Schema para cuentas por pagar
const schemaProveedor = yup.object().shape({
  concepto: yup.string().required("El concepto es obligatorio"),
  monto: yup.number().positive("El monto debe ser positivo").required("El monto es obligatorio"),
  proveedorId: yup.string().required("El proveedor es obligatorio"),
  fecha: yup.string().required("La fecha es obligatoria"),
  fechaVencimiento: yup.string().optional(),
  numeroComprobante: yup.string().optional(),
  observaciones: yup.string().optional(),
});

// Función helper para formatear fechas
const formatFechaSegura = (fecha) => {
  if (!fecha) return "";
  try {
    if (typeof fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(fecha)) return fecha;
    if (fecha && typeof fecha === "object" && fecha.toDate) {
      return fecha.toDate().toISOString().split("T")[0];
    }
    const dateObj = new Date(fecha);
    if (!isNaN(dateObj.getTime())) return dateObj.toISOString().split("T")[0];
    return "";
  } catch (error) {
    return "";
  }
};

const GastosPage = () => {
  const { user } = useAuth();
  const [vistaActiva, setVistaActiva] = useState("internos"); // internos | proveedores
  
  // Estados comunes
  const [gastosInternos, setGastosInternos] = useState([]);
  const [cuentasPorPagar, setCuentasPorPagar] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Estados para modales
  const [openInterno, setOpenInterno] = useState(false);
  const [openProveedor, setOpenProveedor] = useState(false);
  const [openPago, setOpenPago] = useState(false);
  const [openHistorial, setOpenHistorial] = useState(false);
  const [editando, setEditando] = useState(null);
  const [cuentaSeleccionada, setCuentaSeleccionada] = useState(null);
  const [guardando, setGuardando] = useState(false);
  
  // Filtros
  const [filtroInterno, setFiltroInterno] = useState("");
  const [filtroProveedor, setFiltroProveedor] = useState("");
  const [filtroEstadoPago, setFiltroEstadoPago] = useState("");
  const [filtroProveedorId, setFiltroProveedorId] = useState("");
  
  // Selector de proveedor con búsqueda
  const [busquedaProveedor, setBusquedaProveedor] = useState("");
  const [mostrarDropdownProveedor, setMostrarDropdownProveedor] = useState(false);
  const [proveedorSeleccionado, setProveedorSeleccionado] = useState(null);

  // Form para gastos internos
  const {
    register: registerInterno,
    handleSubmit: handleSubmitInterno,
    reset: resetInterno,
    setValue: setValueInterno,
    watch: watchInterno,
    formState: { errors: errorsInterno },
  } = useForm({
    resolver: yupResolver(schemaInterno),
    defaultValues: {
      concepto: "",
      monto: "",
      categoria: "varios",
      fecha: new Date().toISOString().split("T")[0],
      observaciones: "",
    },
  });

  // Form para cuentas por pagar
  const {
    register: registerProveedor,
    handleSubmit: handleSubmitProveedor,
    reset: resetProveedor,
    setValue: setValueProveedor,
    watch: watchProveedor,
    formState: { errors: errorsProveedor },
  } = useForm({
    resolver: yupResolver(schemaProveedor),
    defaultValues: {
      concepto: "",
      monto: "",
      proveedorId: "",
      fecha: new Date().toISOString().split("T")[0],
      fechaVencimiento: "",
      numeroComprobante: "",
      observaciones: "",
    },
  });

  // Cargar datos desde Firebase
  useEffect(() => {
    const cargarDatos = async () => {
      try {
        setLoading(true);
        
        // Cargar proveedores
        const proveedoresSnap = await getDocs(collection(db, "proveedores"));
        const proveedoresData = proveedoresSnap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setProveedores(proveedoresData);
        
        // Cargar gastos
        const gastosSnap = await getDocs(collection(db, "gastos"));
        const gastosData = gastosSnap.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            fecha: formatFechaSegura(data.fecha),
            fechaVencimiento: formatFechaSegura(data.fechaVencimiento),
          };
        });
        
        // Separar gastos internos y cuentas por pagar
        const internos = gastosData.filter(g => g.tipo !== "proveedor");
        const proveedoresGastos = gastosData.filter(g => g.tipo === "proveedor");
        
        setGastosInternos(internos.sort((a, b) => new Date(b.fecha) - new Date(a.fecha)));
        setCuentasPorPagar(proveedoresGastos.sort((a, b) => new Date(b.fecha) - new Date(a.fecha)));
      } catch (error) {
        console.error("Error al cargar datos:", error);
      } finally {
        setLoading(false);
      }
    };

    cargarDatos();
  }, []);

  // Guardar gasto interno
  const onSubmitInterno = async (data) => {
    setGuardando(true);
    try {
      const gastoData = {
        tipo: "interno",
        concepto: data.concepto,
        monto: Number(data.monto),
        categoria: data.categoria,
        fecha: data.fecha,
        observaciones: data.observaciones || "",
        responsable: user?.email || "Usuario no identificado",
        fechaCreacion: serverTimestamp(),
        fechaActualizacion: serverTimestamp(),
      };

      if (editando) {
        await updateDoc(doc(db, "gastos", editando.id), {
          ...gastoData,
          fechaActualizacion: serverTimestamp(),
        });
        setGastosInternos(prev => prev.map(g => 
          g.id === editando.id ? { ...g, ...gastoData, id: g.id } : g
        ));
      } else {
        const docRef = await addDoc(collection(db, "gastos"), gastoData);
        setGastosInternos(prev => [{ id: docRef.id, ...gastoData, fechaCreacion: new Date().toISOString() }, ...prev]);
      }

      resetInterno();
      setOpenInterno(false);
      setEditando(null);
    } catch (error) {
      console.error("Error al guardar gasto:", error);
      alert("Error al guardar el gasto: " + error.message);
    } finally {
      setGuardando(false);
    }
  };

  // Guardar cuenta por pagar
  const onSubmitProveedor = async (data) => {
    setGuardando(true);
    try {
      const proveedor = proveedores.find(p => p.id === data.proveedorId);
      
      const cuentaData = {
        tipo: "proveedor",
        concepto: data.concepto,
        monto: Number(data.monto),
        montoPagado: 0,
        estadoPago: "pendiente",
        proveedorId: data.proveedorId,
        proveedor: proveedor ? {
          id: proveedor.id,
          nombre: proveedor.nombre,
          cuit: proveedor.cuit || "",
          telefono: proveedor.telefono || "",
        } : null,
        fecha: data.fecha,
        fechaVencimiento: data.fechaVencimiento || null,
        numeroComprobante: data.numeroComprobante || "",
        observaciones: data.observaciones || "",
        responsable: user?.email || "Usuario no identificado",
        pagos: [],
        fechaCreacion: serverTimestamp(),
        fechaActualizacion: serverTimestamp(),
      };

      if (editando) {
        await updateDoc(doc(db, "gastos", editando.id), {
          ...cuentaData,
          montoPagado: editando.montoPagado || 0,
          estadoPago: editando.estadoPago || "pendiente",
          pagos: editando.pagos || [],
          fechaActualizacion: serverTimestamp(),
        });
        setCuentasPorPagar(prev => prev.map(c => 
          c.id === editando.id ? { ...c, ...cuentaData, id: c.id, montoPagado: editando.montoPagado, estadoPago: editando.estadoPago, pagos: editando.pagos } : c
        ));
      } else {
        const docRef = await addDoc(collection(db, "gastos"), cuentaData);
        setCuentasPorPagar(prev => [{ id: docRef.id, ...cuentaData, fechaCreacion: new Date().toISOString() }, ...prev]);
      }

      resetProveedor();
      setOpenProveedor(false);
      setEditando(null);
      setBusquedaProveedor("");
      setProveedorSeleccionado(null);
    } catch (error) {
      console.error("Error al guardar cuenta:", error);
      alert("Error al guardar la cuenta: " + error.message);
    } finally {
      setGuardando(false);
    }
  };

  // Registrar pago
  const [montoPago, setMontoPago] = useState("");
  const [fechaPago, setFechaPago] = useState(new Date().toISOString().split("T")[0]);
  const [metodoPago, setMetodoPago] = useState("Efectivo");
  const [notasPago, setNotasPago] = useState("");

  const handleRegistrarPago = async () => {
    if (!cuentaSeleccionada || !montoPago || Number(montoPago) <= 0) return;
    
    setGuardando(true);
    try {
      const montoActual = Number(cuentaSeleccionada.montoPagado) || 0;
      const montoTotal = Number(cuentaSeleccionada.monto) || 0;
      const nuevoMontoPagado = montoActual + Number(montoPago);
      
      let nuevoEstado = "pendiente";
      if (nuevoMontoPagado >= montoTotal) {
        nuevoEstado = "pagado";
      } else if (nuevoMontoPagado > 0) {
        nuevoEstado = "parcial";
      }
      
      const nuevoPago = {
        monto: Number(montoPago),
        fecha: fechaPago,
        metodo: metodoPago,
        notas: notasPago,
        responsable: user?.email || "Usuario no identificado",
        fechaRegistro: new Date().toISOString(),
      };
      
      const pagosActualizados = [...(cuentaSeleccionada.pagos || []), nuevoPago];
      
      await updateDoc(doc(db, "gastos", cuentaSeleccionada.id), {
        montoPagado: nuevoMontoPagado,
        estadoPago: nuevoEstado,
        pagos: pagosActualizados,
        fechaActualizacion: serverTimestamp(),
      });
      
      setCuentasPorPagar(prev => prev.map(c => 
        c.id === cuentaSeleccionada.id 
          ? { ...c, montoPagado: nuevoMontoPagado, estadoPago: nuevoEstado, pagos: pagosActualizados }
          : c
      ));
      
      setOpenPago(false);
      setCuentaSeleccionada(null);
      setMontoPago("");
      setFechaPago(new Date().toISOString().split("T")[0]);
      setMetodoPago("Efectivo");
      setNotasPago("");
    } catch (error) {
      console.error("Error al registrar pago:", error);
      alert("Error al registrar el pago: " + error.message);
    } finally {
      setGuardando(false);
    }
  };

  // Editar gasto
  const handleEditarInterno = (gasto) => {
    setEditando(gasto);
    setValueInterno("concepto", gasto.concepto);
    setValueInterno("monto", gasto.monto);
    setValueInterno("categoria", gasto.categoria || "varios");
    setValueInterno("fecha", gasto.fecha);
    setValueInterno("observaciones", gasto.observaciones || "");
    setOpenInterno(true);
  };

  const handleEditarProveedor = (cuenta) => {
    setEditando(cuenta);
    setValueProveedor("concepto", cuenta.concepto);
    setValueProveedor("monto", cuenta.monto);
    setValueProveedor("proveedorId", cuenta.proveedorId);
    setValueProveedor("fecha", cuenta.fecha);
    setValueProveedor("fechaVencimiento", cuenta.fechaVencimiento || "");
    setValueProveedor("numeroComprobante", cuenta.numeroComprobante || "");
    setValueProveedor("observaciones", cuenta.observaciones || "");
    
    if (cuenta.proveedor) {
      setProveedorSeleccionado(cuenta.proveedor);
      setBusquedaProveedor(`${cuenta.proveedor.nombre} - ${cuenta.proveedor.telefono || ""}`);
    }
    
    // No mostrar dropdown al editar
    setMostrarDropdownProveedor(false);
    setOpenProveedor(true);
  };

  // Eliminar
  const handleEliminar = async (tipo, id) => {
    if (!confirm("¿Estás seguro de que quieres eliminar este registro?")) return;
    
    try {
      await deleteDoc(doc(db, "gastos", id));
      if (tipo === "interno") {
        setGastosInternos(prev => prev.filter(g => g.id !== id));
      } else {
        setCuentasPorPagar(prev => prev.filter(c => c.id !== id));
      }
    } catch (error) {
      console.error("Error al eliminar:", error);
      alert("Error al eliminar: " + error.message);
    }
  };

  // Filtrar proveedores
  const proveedoresFiltrados = useMemo(() => {
    if (!busquedaProveedor.trim()) return proveedores;
    const busqueda = busquedaProveedor.toLowerCase();
    return proveedores.filter(p => {
      const nombre = (p.nombre || "").toLowerCase();
      const telefono = (p.telefono || "").toLowerCase();
      const cuit = (p.cuit || "").toLowerCase();
      
      // Buscar en cada campo individualmente
      return nombre.includes(busqueda) || 
             telefono.includes(busqueda) || 
             cuit.includes(busqueda) ||
             // También buscar si el texto de búsqueda contiene el nombre del proveedor
             busqueda.includes(nombre);
    });
  }, [proveedores, busquedaProveedor]);

  // Seleccionar proveedor
  const seleccionarProveedor = (proveedor) => {
    setProveedorSeleccionado(proveedor);
    setBusquedaProveedor(proveedor ? `${proveedor.nombre} - ${proveedor.telefono || ""}` : "");
    setValueProveedor("proveedorId", proveedor ? proveedor.id : "");
    setMostrarDropdownProveedor(false);
  };

  // Cerrar modales
  const cerrarModalInterno = () => {
    setOpenInterno(false);
    setEditando(null);
    resetInterno();
  };

  const cerrarModalProveedor = () => {
    setOpenProveedor(false);
    setEditando(null);
    setBusquedaProveedor("");
    setProveedorSeleccionado(null);
    setMostrarDropdownProveedor(false);
    resetProveedor();
  };

  // Calcular totales
  const totalesInternos = useMemo(() => {
    const total = gastosInternos.reduce((acc, g) => acc + (Number(g.monto) || 0), 0);
    const porCategoria = {};
    Object.keys(categoriasGastoInterno).forEach(key => {
      porCategoria[key] = gastosInternos
        .filter(g => g.categoria === key)
        .reduce((acc, g) => acc + (Number(g.monto) || 0), 0);
    });
    return { total, porCategoria };
  }, [gastosInternos]);

  const totalesProveedores = useMemo(() => {
    const total = cuentasPorPagar.reduce((acc, c) => acc + (Number(c.monto) || 0), 0);
    const pagado = cuentasPorPagar.reduce((acc, c) => acc + (Number(c.montoPagado) || 0), 0);
    const pendiente = total - pagado;
    const porEstado = {
      pendiente: cuentasPorPagar.filter(c => c.estadoPago === "pendiente").length,
      parcial: cuentasPorPagar.filter(c => c.estadoPago === "parcial").length,
      pagado: cuentasPorPagar.filter(c => c.estadoPago === "pagado").length,
    };
    
    // Calcular deudas vencidas
    const vencidas = cuentasPorPagar.filter(c => {
      const saldo = (Number(c.monto) || 0) - (Number(c.montoPagado) || 0);
      return c.fechaVencimiento && 
             new Date(c.fechaVencimiento) < new Date() && 
             saldo > 0;
    });
    
    const montoVencido = vencidas.reduce((acc, c) => 
      acc + ((Number(c.monto) || 0) - (Number(c.montoPagado) || 0)), 0
    );
    
    return { total, pagado, pendiente, porEstado, vencidas: vencidas.length, montoVencido };
  }, [cuentasPorPagar]);

  // Agrupar cuentas por proveedor
  const cuentasPorProveedor = useMemo(() => {
    const grupos = {};
    
    cuentasPorPagar.forEach(cuenta => {
      const provId = cuenta.proveedorId;
      if (!grupos[provId]) {
        grupos[provId] = {
          proveedor: cuenta.proveedor,
          cuentas: [],
          total: 0,
          pagado: 0,
          pendiente: 0,
        };
      }
      
      grupos[provId].cuentas.push(cuenta);
      grupos[provId].total += Number(cuenta.monto) || 0;
      grupos[provId].pagado += Number(cuenta.montoPagado) || 0;
    });
    
    Object.keys(grupos).forEach(provId => {
      grupos[provId].pendiente = grupos[provId].total - grupos[provId].pagado;
    });
    
    return Object.values(grupos).sort((a, b) => b.pendiente - a.pendiente);
  }, [cuentasPorPagar]);

  // Filtrar datos
  const gastosInternosFiltrados = useMemo(() => {
    return gastosInternos.filter(g => {
      const busqueda = filtroInterno.toLowerCase();
      return (g.concepto || "").toLowerCase().includes(busqueda) ||
             (g.observaciones || "").toLowerCase().includes(busqueda);
    });
  }, [gastosInternos, filtroInterno]);

  const cuentasPorPagarFiltradas = useMemo(() => {
    return cuentasPorPagar.filter(c => {
      const busqueda = filtroProveedor.toLowerCase();
      const matchBusqueda = (c.concepto || "").toLowerCase().includes(busqueda) ||
                           (c.proveedor?.nombre || "").toLowerCase().includes(busqueda);
      const matchEstado = !filtroEstadoPago || c.estadoPago === filtroEstadoPago;
      const matchProveedorId = !filtroProveedorId || c.proveedorId === filtroProveedorId;
      return matchBusqueda && matchEstado && matchProveedorId;
    });
  }, [cuentasPorPagar, filtroProveedor, filtroEstadoPago, filtroProveedorId]);

  // Exportar reporte de cuentas por pagar
  const exportarReporteCuentas = () => {
    if (cuentasPorPagarFiltradas.length === 0) {
      alert("No hay datos para exportar");
      return;
    }

    const datos = cuentasPorPagarFiltradas.map(c => ({
      Fecha: c.fecha,
      Proveedor: c.proveedor?.nombre || "",
      Concepto: c.concepto,
      "Nº Comprobante": c.numeroComprobante || "",
      Total: c.monto,
      Pagado: c.montoPagado || 0,
      Saldo: (Number(c.monto) || 0) - (Number(c.montoPagado) || 0),
      Vencimiento: c.fechaVencimiento || "",
      Estado: c.estadoPago === "pagado" ? "Pagado" : c.estadoPago === "parcial" ? "Pagado Parcial" : "Pendiente",
    }));

    const csv = [
      Object.keys(datos[0]).join(','),
      ...datos.map(row => Object.values(row).map(val => `"${val}"`).join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cuentas-por-pagar_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="py-8 px-2 max-w-7xl mx-auto">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-gray-600">Cargando datos...</p>
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
            <p className="text-lg text-gray-500">Control de gastos internos y cuentas por pagar</p>
          </div>
        </div>
      </div>

      {/* Tabs principales */}
      <Tabs value={vistaActiva} onValueChange={setVistaActiva} className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2 mb-6">
          <TabsTrigger value="internos" className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4" />
            Gastos Internos
          </TabsTrigger>
          <TabsTrigger value="proveedores" className="flex items-center gap-2">
            <Building2 className="w-4 h-4" />
            Cuentas por Pagar
          </TabsTrigger>
        </TabsList>

        {/* Vista de Gastos Internos */}
        <TabsContent value="internos" className="space-y-6">
          {/* Dashboard de gastos internos */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Total */}
            <Card className="md:col-span-2 lg:col-span-3">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-gray-500 uppercase tracking-wide">Total Gastos Internos</div>
                    <div className="text-4xl font-bold text-red-600">
                      ${totalesInternos.total.toLocaleString("es-AR")}
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      {gastosInternos.length} registros
                    </div>
                  </div>
                  <TrendingDown className="w-12 h-12 text-red-500" />
                </div>
              </CardContent>
            </Card>
            
            {/* Por categoría */}
            {Object.entries(categoriasGastoInterno).map(([key, cat]) => (
              <Card key={key}>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm text-gray-500">{cat.label}</div>
                      <div className="text-2xl font-bold">${totalesInternos.porCategoria[key]?.toLocaleString("es-AR") || "0"}</div>
                      <div className="text-xs text-gray-400 mt-1">
                        {gastosInternos.filter(g => g.categoria === key).length} gastos
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Tabla gastos internos */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Gastos Internos</CardTitle>
              <div className="flex gap-2">
                <Input 
                  placeholder="Buscar..." 
                  value={filtroInterno} 
                  onChange={e => setFiltroInterno(e.target.value)} 
                  className="w-56" 
                />
                <Button onClick={() => setOpenInterno(true)}>
                  <Plus className="w-4 h-4 mr-1" />
                  Nuevo Gasto
                </Button>
              </div>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Concepto</TableHead>
                    <TableHead>Categoría</TableHead>
                    <TableHead>Monto</TableHead>
                    <TableHead>Responsable</TableHead>
                    <TableHead>Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {gastosInternosFiltrados.map(g => (
                    <TableRow key={g.id}>
                      <TableCell>{g.fecha}</TableCell>
                      <TableCell className="font-medium">{g.concepto}</TableCell>
                      <TableCell>
                        <Badge className={categoriasGastoInterno[g.categoria]?.color || 'bg-gray-100'}>
                          {categoriasGastoInterno[g.categoria]?.label || g.categoria}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-bold text-red-600">
                        ${Number(g.monto).toLocaleString("es-AR")}
                      </TableCell>
                      <TableCell className="text-sm">{g.responsable}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" onClick={() => handleEditarInterno(g)}>
                            <Edit className="w-3 h-3" />
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => handleEliminar("interno", g.id)}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Vista de Cuentas por Pagar */}
        <TabsContent value="proveedores" className="space-y-6">
          {/* Dashboard de cuentas por pagar */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-gray-500">Total Gastado</div>
                    <div className="text-3xl font-bold text-blue-600">
                      ${totalesProveedores.total.toLocaleString("es-AR")}
                    </div>
                  </div>
                  <Receipt className="w-8 h-8 text-blue-500" />
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm text-gray-500">Total Pagado</div>
                    <div className="text-3xl font-bold text-green-600">
                      ${totalesProveedores.pagado.toLocaleString("es-AR")}
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
                    <div className="text-sm text-gray-500">Saldo Pendiente</div>
                    <div className="text-3xl font-bold text-red-600">
                      ${totalesProveedores.pendiente.toLocaleString("es-AR")}
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
                    <div className="text-sm text-gray-500">Deudas Vencidas</div>
                    <div className="text-3xl font-bold text-orange-600">
                      ${totalesProveedores.montoVencido.toLocaleString("es-AR")}
                    </div>
                    <div className="text-xs text-gray-400 mt-1">{totalesProveedores.vencidas} cuentas</div>
                  </div>
                  <AlertCircle className="w-8 h-8 text-orange-500" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Resumen por proveedor */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="w-5 h-5" />
                Resumen por Proveedor
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {cuentasPorProveedor.map((grupo, idx) => {
                  const porcentajePagado = grupo.total > 0 ? (grupo.pagado / grupo.total) * 100 : 0;
                  
                  return (
                    <Card 
                      key={idx} 
                      className="border-2 hover:border-blue-300 transition-all cursor-pointer"
                      onClick={() => setFiltroProveedorId(filtroProveedorId === grupo.proveedor?.id ? "" : grupo.proveedor?.id || "")}
                    >
                      <CardContent className="p-4">
                        <div className="mb-3">
                          <div className="font-bold text-lg flex items-center gap-2">
                            <Building2 className="w-4 h-4 text-blue-600" />
                            {grupo.proveedor?.nombre || "Sin nombre"}
                          </div>
                          <div className="text-xs text-gray-500">
                            {grupo.cuentas.length} cuenta{grupo.cuentas.length !== 1 ? 's' : ''} activa{grupo.cuentas.length !== 1 ? 's' : ''}
                          </div>
                        </div>
                        
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-600">Total:</span>
                            <span className="font-semibold">${grupo.total.toLocaleString("es-AR")}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Pagado:</span>
                            <span className="font-semibold text-green-600">${grupo.pagado.toLocaleString("es-AR")}</span>
                          </div>
                          <div className="flex justify-between border-t pt-2">
                            <span className="text-gray-600 font-semibold">Pendiente:</span>
                            <span className={`font-bold ${grupo.pendiente > 0 ? "text-red-600" : "text-gray-400"}`}>
                              ${grupo.pendiente.toLocaleString("es-AR")}
                            </span>
                          </div>
                        </div>
                        
                        {/* Barra de progreso */}
                        <div className="mt-3">
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div 
                              className="bg-green-600 h-2 rounded-full transition-all" 
                              style={{ width: `${porcentajePagado}%` }}
                            />
                          </div>
                          <div className="text-xs text-gray-500 mt-1 text-center">
                            {porcentajePagado.toFixed(1)}% pagado
                          </div>
                        </div>
                        
                        {filtroProveedorId === (grupo.proveedor?.id || "") && (
                          <div className="mt-2 text-xs text-blue-600 text-center">
                            ✓ Filtrado
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Tabla cuentas por pagar */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                Detalle de Cuentas por Pagar
              </CardTitle>
              <div className="flex gap-2">
                {filtroProveedorId && (
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={() => setFiltroProveedorId("")}
                    className="text-xs"
                  >
                    <X className="w-3 h-3 mr-1" />
                    Limpiar filtro
                  </Button>
                )}
                <Select value={filtroEstadoPago} onValueChange={setFiltroEstadoPago}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Estado de pago" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Todos</SelectItem>
                    <SelectItem value="pendiente">Pendiente</SelectItem>
                    <SelectItem value="parcial">Pagado Parcial</SelectItem>
                    <SelectItem value="pagado">Pagado</SelectItem>
                  </SelectContent>
                </Select>
                <Input 
                  placeholder="Buscar..." 
                  value={filtroProveedor} 
                  onChange={e => setFiltroProveedor(e.target.value)} 
                  className="w-56" 
                />
                <Button variant="outline" onClick={exportarReporteCuentas} disabled={cuentasPorPagarFiltradas.length === 0}>
                  <Download className="w-4 h-4 mr-1" />
                  Exportar
                </Button>
                <Button onClick={() => setOpenProveedor(true)}>
                  <Plus className="w-4 h-4 mr-1" />
                  Nueva Cuenta
                </Button>
              </div>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fecha</TableHead>
                    <TableHead>Proveedor</TableHead>
                    <TableHead>Concepto</TableHead>
                    <TableHead>Nº Comprobante</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Pagado</TableHead>
                    <TableHead>Saldo</TableHead>
                    <TableHead>Vencimiento</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cuentasPorPagarFiltradas.map(c => {
                    const saldo = (Number(c.monto) || 0) - (Number(c.montoPagado) || 0);
                    const vencido = c.fechaVencimiento && new Date(c.fechaVencimiento) < new Date();
                    
                    return (
                      <TableRow key={c.id} className={vencido && saldo > 0 ? "bg-red-50" : ""}>
                        <TableCell>{c.fecha}</TableCell>
                        <TableCell className="font-medium">{c.proveedor?.nombre || "-"}</TableCell>
                        <TableCell>{c.concepto}</TableCell>
                        <TableCell className="text-sm">{c.numeroComprobante || "-"}</TableCell>
                        <TableCell className="font-bold">
                          ${Number(c.monto).toLocaleString("es-AR")}
                        </TableCell>
                        <TableCell className="text-green-600">
                          ${Number(c.montoPagado || 0).toLocaleString("es-AR")}
                        </TableCell>
                        <TableCell className={`font-bold ${saldo > 0 ? "text-red-600" : "text-gray-400"}`}>
                          ${saldo.toLocaleString("es-AR")}
                        </TableCell>
                        <TableCell className={vencido && saldo > 0 ? "text-red-600 font-semibold" : ""}>
                          {c.fechaVencimiento || "-"}
                          {vencido && saldo > 0 && <span className="block text-xs">¡VENCIDA!</span>}
                        </TableCell>
                        <TableCell>
                          <Badge className={estadosPago[c.estadoPago]?.color || 'bg-gray-100'}>
                            {estadosPago[c.estadoPago]?.label || "Pendiente"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {c.pagos && c.pagos.length > 0 && (
                              <Button 
                                size="sm" 
                                variant="outline"
                                className="text-blue-600 border-blue-200 hover:bg-blue-50"
                                onClick={() => {
                                  setCuentaSeleccionada(c);
                                  setOpenHistorial(true);
                                }}
                                title="Ver historial de pagos"
                              >
                                <Eye className="w-3 h-3" />
                              </Button>
                            )}
                            {c.estadoPago !== "pagado" && (
                              <Button 
                                size="sm" 
                                variant="outline"
                                className="text-green-600 border-green-200 hover:bg-green-50"
                                onClick={() => {
                                  setCuentaSeleccionada(c);
                                  setMontoPago((Number(c.monto) - Number(c.montoPagado || 0)).toString());
                                  setOpenPago(true);
                                }}
                                title="Registrar pago"
                              >
                                <Wallet className="w-3 h-3" />
                              </Button>
                            )}
                            <Button size="sm" variant="outline" onClick={() => handleEditarProveedor(c)} title="Editar cuenta">
                              <Edit className="w-3 h-3" />
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => handleEliminar("proveedor", c.id)} title="Eliminar cuenta">
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Modal para gasto interno */}
      <Dialog open={openInterno} onOpenChange={setOpenInterno}>
        <DialogContent className="w-[95vw] max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{editando ? "Editar Gasto Interno" : "Nuevo Gasto Interno"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmitInterno(onSubmitInterno)} className="flex flex-col gap-3 py-2">
            <div>
              <Input 
                placeholder="Concepto *" 
                {...registerInterno("concepto")}
                className={errorsInterno.concepto ? "border-red-500" : ""}
              />
              {errorsInterno.concepto && (
                <span className="text-red-500 text-xs">{errorsInterno.concepto.message}</span>
              )}
            </div>
            
            <div>
              <Input 
                placeholder="Monto *" 
                type="number" 
                step="0.01"
                {...registerInterno("monto")}
                className={errorsInterno.monto ? "border-red-500" : ""}
              />
              {errorsInterno.monto && (
                <span className="text-red-500 text-xs">{errorsInterno.monto.message}</span>
              )}
            </div>
            
            <div>
              <select 
                value={watchInterno("categoria")} 
                onChange={(e) => setValueInterno("categoria", e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
              >
                <option value="">Seleccionar categoría *</option>
                {Object.entries(categoriasGastoInterno).map(([key, value]) => (
                  <option key={key} value={key}>{value.label}</option>
                ))}
              </select>
            </div>
            
            <div>
              <Input 
                placeholder="Fecha *" 
                type="date" 
                {...registerInterno("fecha")}
                className={errorsInterno.fecha ? "border-red-500" : ""}
              />
            </div>
            
            <div>
              <Textarea 
                placeholder="Observaciones (opcional)" 
                {...registerInterno("observaciones")}
                rows={3}
              />
            </div>
            
            <div className="text-sm text-gray-600 bg-gray-50 p-2 rounded">
              <strong>Responsable:</strong> {user?.email || "Usuario no identificado"}
            </div>
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={cerrarModalInterno} disabled={guardando}>
              Cancelar
            </Button>
            <Button 
              onClick={handleSubmitInterno(onSubmitInterno)}
              disabled={guardando}
            >
              {guardando ? "Guardando..." : (editando ? "Actualizar" : "Guardar")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal para cuenta por pagar */}
      <Dialog open={openProveedor} onOpenChange={setOpenProveedor}>
        <DialogContent className="w-[95vw] max-w-[600px]">
          <DialogHeader>
            <DialogTitle>{editando ? "Editar Cuenta por Pagar" : "Nueva Cuenta por Pagar"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmitProveedor(onSubmitProveedor)} className="flex flex-col gap-4 py-2">
            <div>
              <Label>Proveedor *</Label>
              <div className="relative mt-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 z-10" />
                  <Input
                    placeholder="Buscar proveedor por nombre, teléfono o CUIT..."
                    value={busquedaProveedor}
                    onChange={(e) => {
                      setBusquedaProveedor(e.target.value);
                      setMostrarDropdownProveedor(true);
                      if (!e.target.value.trim()) seleccionarProveedor(null);
                    }}
                    onFocus={(e) => {
                      setMostrarDropdownProveedor(true);
                      // Seleccionar todo el texto al hacer foco para facilitar cambio
                      e.target.select();
                    }}
                    className={`pl-10 pr-10 ${errorsProveedor.proveedorId ? "border-red-500" : proveedorSeleccionado ? "border-green-500 bg-green-50" : ""}`}
                  />
                  {busquedaProveedor && (
                    <button
                      type="button"
                      onClick={() => {
                        seleccionarProveedor(null);
                        setMostrarDropdownProveedor(false);
                      }}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 z-10"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                
                {mostrarDropdownProveedor && busquedaProveedor.trim() && (
                  <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                    {proveedoresFiltrados.length === 0 ? (
                      <div className="p-3 text-sm text-gray-500 text-center">
                        No se encontraron proveedores que coincidan con "{busquedaProveedor}"
                      </div>
                    ) : (
                      proveedoresFiltrados.map(proveedor => (
                        <button
                          key={proveedor.id}
                          type="button"
                          onClick={() => seleccionarProveedor(proveedor)}
                          className={`w-full text-left px-3 py-2 hover:bg-blue-50 border-b last:border-b-0 transition-colors ${
                            proveedorSeleccionado?.id === proveedor.id ? "bg-blue-100" : ""
                          }`}
                        >
                          <div className="font-medium">{proveedor.nombre}</div>
                          <div className="text-xs text-gray-500">
                            {proveedor.telefono && `Tel: ${proveedor.telefono}`}
                            {proveedor.cuit && ` • CUIT: ${proveedor.cuit}`}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
              {errorsProveedor.proveedorId && (
                <span className="text-red-500 text-xs">{errorsProveedor.proveedorId.message}</span>
              )}
              {proveedorSeleccionado && !errorsProveedor.proveedorId && (
                <span className="text-green-600 text-xs flex items-center gap-1 mt-1">
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  Proveedor seleccionado
                </span>
              )}
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Concepto *</Label>
                <Input 
                  placeholder="Ej: Compra de madera" 
                  {...registerProveedor("concepto")}
                  className={errorsProveedor.concepto ? "border-red-500" : ""}
                />
                {errorsProveedor.concepto && (
                  <span className="text-red-500 text-xs">{errorsProveedor.concepto.message}</span>
                )}
              </div>
              
              <div>
                <Label>Nº Comprobante</Label>
                <Input 
                  placeholder="Nº Factura/Remito" 
                  {...registerProveedor("numeroComprobante")}
                />
              </div>
            </div>
            
            <div>
              <Label>Monto Total *</Label>
              <Input 
                placeholder="Monto total de la factura" 
                type="number" 
                step="0.01"
                {...registerProveedor("monto")}
                className={errorsProveedor.monto ? "border-red-500" : ""}
              />
              {errorsProveedor.monto && (
                <span className="text-red-500 text-xs">{errorsProveedor.monto.message}</span>
              )}
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Fecha de Emisión *</Label>
                <Input 
                  type="date" 
                  {...registerProveedor("fecha")}
                  className={errorsProveedor.fecha ? "border-red-500" : ""}
                />
              </div>
              
              <div>
                <Label>Fecha de Vencimiento</Label>
                <Input 
                  type="date" 
                  {...registerProveedor("fechaVencimiento")}
                />
              </div>
            </div>
            
            <div>
              <Label>Observaciones</Label>
              <Textarea 
                placeholder="Detalles, condiciones, etc." 
                {...registerProveedor("observaciones")}
                rows={3}
              />
            </div>
            
            <div className="text-sm text-gray-600 bg-gray-50 p-2 rounded">
              <strong>Responsable:</strong> {user?.email || "Usuario no identificado"}
            </div>
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={cerrarModalProveedor} disabled={guardando}>
              Cancelar
            </Button>
            <Button 
              onClick={handleSubmitProveedor(onSubmitProveedor)}
              disabled={guardando}
            >
              {guardando ? "Guardando..." : (editando ? "Actualizar" : "Guardar")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal para registrar pago */}
      <Dialog open={openPago} onOpenChange={setOpenPago}>
        <DialogContent className="w-[95vw] max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Registrar Pago</DialogTitle>
          </DialogHeader>
          
          {cuentaSeleccionada && (
            <div className="space-y-4 py-2">
              {/* Info de la cuenta */}
              <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                <div className="font-medium text-gray-900">{cuentaSeleccionada.proveedor?.nombre}</div>
                <div className="text-sm text-gray-600">{cuentaSeleccionada.concepto}</div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-gray-500">Total:</span>
                    <span className="font-semibold ml-1">${Number(cuentaSeleccionada.monto).toLocaleString("es-AR")}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Saldo:</span>
                    <span className="font-semibold text-red-600 ml-1">
                      ${(Number(cuentaSeleccionada.monto) - Number(cuentaSeleccionada.montoPagado || 0)).toLocaleString("es-AR")}
                    </span>
                  </div>
                </div>
              </div>

              {/* Historial de pagos */}
              {cuentaSeleccionada.pagos && cuentaSeleccionada.pagos.length > 0 && (
                <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                  <div className="font-semibold text-sm mb-2">Pagos registrados:</div>
                  <div className="space-y-1">
                    {cuentaSeleccionada.pagos.map((pago, idx) => (
                      <div key={idx} className="text-xs text-gray-700 flex justify-between">
                        <span>{pago.fecha} - {pago.metodo}</span>
                        <span className="font-semibold">${Number(pago.monto).toLocaleString("es-AR")}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <Label>Monto a Pagar *</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="Monto del pago"
                  value={montoPago}
                  onChange={(e) => setMontoPago(e.target.value)}
                  max={Number(cuentaSeleccionada.monto) - Number(cuentaSeleccionada.montoPagado || 0)}
                />
              </div>

              <div>
                <Label>Fecha de Pago *</Label>
                <Input
                  type="date"
                  value={fechaPago}
                  onChange={(e) => setFechaPago(e.target.value)}
                />
              </div>

              <div>
                <Label>Método de Pago</Label>
                <select 
                  value={metodoPago} 
                  onChange={(e) => setMetodoPago(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="Efectivo">Efectivo</option>
                  <option value="Transferencia">Transferencia</option>
                  <option value="Cheque">Cheque</option>
                  <option value="Tarjeta">Tarjeta</option>
                </select>
              </div>

              <div>
                <Label>Notas del Pago</Label>
                <Textarea
                  placeholder="Detalles del pago..."
                  value={notasPago}
                  onChange={(e) => setNotasPago(e.target.value)}
                  rows={2}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenPago(false)} disabled={guardando}>
              Cancelar
            </Button>
            <Button 
              onClick={handleRegistrarPago}
              disabled={guardando || !montoPago || Number(montoPago) <= 0}
            >
              {guardando ? "Guardando..." : "Registrar Pago"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal para ver historial de pagos */}
      <Dialog open={openHistorial} onOpenChange={setOpenHistorial}>
        <DialogContent className="w-[95vw] max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-blue-600" />
              Historial de Pagos
            </DialogTitle>
          </DialogHeader>
          
          {cuentaSeleccionada && (
            <div className="space-y-4 py-2">
              {/* Info de la cuenta */}
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-lg border-2 border-blue-200">
                <div className="font-bold text-lg text-blue-900">{cuentaSeleccionada.proveedor?.nombre}</div>
                <div className="text-sm text-blue-700 mt-1">{cuentaSeleccionada.concepto}</div>
                {cuentaSeleccionada.numeroComprobante && (
                  <div className="text-xs text-blue-600 mt-1">Comprobante: {cuentaSeleccionada.numeroComprobante}</div>
                )}
                
                <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
                  <div className="bg-white p-2 rounded-md">
                    <div className="text-xs text-gray-500">Total</div>
                    <div className="font-bold text-blue-700">${Number(cuentaSeleccionada.monto).toLocaleString("es-AR")}</div>
                  </div>
                  <div className="bg-white p-2 rounded-md">
                    <div className="text-xs text-gray-500">Pagado</div>
                    <div className="font-bold text-green-600">${Number(cuentaSeleccionada.montoPagado || 0).toLocaleString("es-AR")}</div>
                  </div>
                  <div className="bg-white p-2 rounded-md">
                    <div className="text-xs text-gray-500">Saldo</div>
                    <div className={`font-bold ${(Number(cuentaSeleccionada.monto) - Number(cuentaSeleccionada.montoPagado || 0)) > 0 ? "text-red-600" : "text-gray-400"}`}>
                      ${(Number(cuentaSeleccionada.monto) - Number(cuentaSeleccionada.montoPagado || 0)).toLocaleString("es-AR")}
                    </div>
                  </div>
                </div>
              </div>

              {/* Listado de pagos */}
              {cuentaSeleccionada.pagos && cuentaSeleccionada.pagos.length > 0 ? (
                <div className="space-y-2">
                  <div className="font-semibold text-sm text-gray-700 flex items-center gap-2">
                    <DollarSign className="w-4 h-4" />
                    Pagos Registrados ({cuentaSeleccionada.pagos.length})
                  </div>
                  <div className="max-h-80 overflow-y-auto space-y-2">
                    {cuentaSeleccionada.pagos.map((pago, idx) => (
                      <div 
                        key={idx} 
                        className="bg-white border border-gray-200 rounded-lg p-3 hover:shadow-md transition-shadow"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-green-600 text-lg">
                                ${Number(pago.monto).toLocaleString("es-AR")}
                              </span>
                              <Badge variant="outline" className="text-xs">
                                {pago.metodo || "Efectivo"}
                              </Badge>
                            </div>
                            <div className="text-xs text-gray-500 mt-1 space-y-0.5">
                              <div className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {pago.fecha}
                              </div>
                              {pago.notas && (
                                <div className="text-gray-600 italic">"{pago.notas}"</div>
                              )}
                              {pago.responsable && (
                                <div className="text-gray-400">Por: {pago.responsable}</div>
                              )}
                            </div>
                          </div>
                          <div className="text-xs text-gray-400">
                            Pago #{idx + 1}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  <div className="bg-green-50 p-3 rounded-lg border border-green-200 mt-3">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-sm text-green-800">Total Pagado:</span>
                      <span className="font-bold text-lg text-green-600">
                        ${Number(cuentaSeleccionada.montoPagado || 0).toLocaleString("es-AR")}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <Wallet className="w-12 h-12 mx-auto mb-2 opacity-30" />
                  <p>No hay pagos registrados aún</p>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setOpenHistorial(false);
              setCuentaSeleccionada(null);
            }}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default GastosPage;
