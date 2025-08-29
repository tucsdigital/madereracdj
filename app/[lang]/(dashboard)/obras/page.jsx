"use client";
import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { db } from "@/lib/firebase";
import { collection, getDocs, doc, getDoc } from "firebase/firestore";
import { Filter, Search, RefreshCw, Building, CheckCircle, Clock, AlertCircle } from "lucide-react";
import { useRouter, useParams } from "next/navigation";
import { Icon } from "@iconify/react";
import { DataTableEnhanced } from "@/components/ui/data-table-enhanced";

const estadosObra = {
  pendiente_inicio: { label: "Pendiente de Inicio", color: "bg-yellow-100 text-yellow-800 border-yellow-200", icon: Clock },
  en_ejecucion: { label: "En Ejecución", color: "bg-blue-100 text-blue-800 border-blue-200", icon: Building },
  pausada: { label: "Pausada", color: "bg-orange-100 text-orange-800 border-orange-200", icon: Clock },
  completada: { label: "Completada", color: "bg-green-100 text-green-800 border-green-200", icon: CheckCircle },
  cancelada: { label: "Cancelada", color: "bg-red-100 text-red-800 border-red-200", icon: AlertCircle },
  // Para presupuestos de obra, el estado mostrado/filtrado es siempre "Activo"
  activo: { label: "Activo", color: "bg-green-100 text-green-800 border-green-200", icon: CheckCircle },
};

const ObrasPage = () => {
  const [obrasData, setObrasData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filtroEstado, setFiltroEstado] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const router = useRouter();
  const params = useParams();
  const { lang } = params || {};

  // Columnas para presupuestos
  const presupuestosColumns = [
    {
      accessorKey: "numeroPedido",
      header: "N° Presupuesto",
      cell: ({ row }) => {
        const numero = row.getValue("numeroPedido");
        return (
          <div className="flex items-center gap-2">
            <div className="font-medium cursor-pointer hover:underline text-purple-600">
              {numero || "Sin número"}
            </div>
            <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">
              PO
            </Badge>
          </div>
        );
      },
    },
    {
      accessorKey: "cliente",
      header: "Cliente",
      cell: ({ row }) => {
        const cliente = row.original.cliente;
        return (
          <div>
            <div className="font-medium">{cliente?.nombre || "Sin nombre"}</div>
            <div className="text-xs text-gray-500">{cliente?.cuit || "Sin CUIT"}</div>
          </div>
        );
      },
    },
    {
      accessorKey: "fechaCreacion",
      header: ({ column }) => (
        <div className="flex items-center gap-2 cursor-pointer select-none" onClick={() => column.toggleSorting()}>
          <span>Fecha</span>
          <div className="flex flex-col">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
              <path d="M7 14l5-5 5 5z"/>
            </svg>
            <svg className="w-3 h-3 -mt-1" fill="currentColor" viewBox="0 0 24 24">
              <path d="M7 10l5 5 5-5z"/>
            </svg>
          </div>
        </div>
      ),
      enableSorting: true,
      cell: ({ row }) => {
        const fechaCreacion = row.getValue("fechaCreacion");
        if (!fechaCreacion) return <span className="text-gray-400">Sin fecha</span>;
        
        try {
          const fecha = new Date(fechaCreacion);
          const fechaArgentina = new Date(fecha.getTime() - (3 * 60 * 60 * 1000));
          
          return (
            <div className="text-gray-600">
              <div className="font-medium">
                {fechaArgentina.toLocaleDateString("es-AR", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric"
                })}
              </div>
              <div className="text-xs text-gray-500">
                {fechaArgentina.toLocaleTimeString("es-AR", {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false
                })} hs
              </div>
            </div>
          );
        } catch (error) {
          return <span className="text-gray-400">Fecha inválida</span>;
        }
      },
    },
    {
      accessorKey: "presupuestoTotal",
      header: "Total",
      cell: ({ row }) => {
        const total = row.getValue("presupuestoTotal");
        return (
          <div className="font-medium">
            ${total ? Number(total).toLocaleString("es-AR", { minimumFractionDigits: 2 }) : "0.00"}
          </div>
        );
      },
    },
    {
      id: "estadoPago",
      header: "Pago",
      cell: ({ row }) => {
        const estadoPago = row.original.estadoPago || "pendiente";
        const label = estadoPago === "pagado" ? "Pagado" : "Pendiente";
        const color = estadoPago === "pagado" ? "bg-green-100 text-green-800 border-green-200" : "bg-yellow-100 text-yellow-800 border-yellow-200";
        return <Badge variant="outline" className={color}>{label}</Badge>;
      },
    },
  ];

  // Columnas para obras
  const obrasColumns = [
    {
      accessorKey: "numeroPedido",
      header: "N° Obra",
      cell: ({ row }) => {
        const numero = row.getValue("numeroPedido");
        return (
          <div className="font-medium cursor-pointer hover:underline text-blue-600">
            {numero || "Sin número"}
          </div>
        );
      },
    },
    {
      accessorKey: "cliente",
      header: "Cliente",
      cell: ({ row }) => {
        const cliente = row.original.cliente;
        return (
          <div>
            <div className="font-medium">{cliente?.nombre || "Sin nombre"}</div>
            <div className="text-xs text-gray-500">{cliente?.cuit || "Sin CUIT"}</div>
          </div>
        );
      },
    },
    {
      accessorKey: "fechaCreacion",
      header: ({ column }) => (
        <div className="flex items-center gap-2 cursor-pointer select-none" onClick={() => column.toggleSorting()}>
          <span>Fecha</span>
          <div className="flex flex-col">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
              <path d="M7 14l5-5 5 5z"/>
            </svg>
            <svg className="w-3 h-3 -mt-1" fill="currentColor" viewBox="0 0 24 24">
              <path d="M7 10l5 5 5-5z"/>
            </svg>
          </div>
        </div>
      ),
      enableSorting: true,
      cell: ({ row }) => {
        const fechaCreacion = row.getValue("fechaCreacion");
        if (!fechaCreacion) return <span className="text-gray-400">Sin fecha</span>;
        
        try {
          const fecha = new Date(fechaCreacion);
          const fechaArgentina = new Date(fecha.getTime() - (3 * 60 * 60 * 1000));
          
          return (
            <div className="text-gray-600">
              <div className="font-medium">
                {fechaArgentina.toLocaleDateString("es-AR", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric"
                })}
              </div>
              <div className="text-xs text-gray-500">
                {fechaArgentina.toLocaleTimeString("es-AR", {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false
                })} hs
              </div>
            </div>
          );
        } catch (error) {
          return <span className="text-gray-400">Fecha inválida</span>;
        }
      },
    },
    {
      accessorKey: "estado",
      header: "Estado",
      cell: ({ row }) => {
        const estado = row.getValue("estado");
        const estadoInfo = estadosObra[estado] || { label: estado, color: "bg-gray-100 text-gray-800 border-gray-200" };
        const IconCmp = estadoInfo.icon || Clock;
        return (
          <div className="flex items-center gap-2">
            <IconCmp className="w-4 h-4" />
            <Badge variant="outline" className={estadoInfo.color}>
              {estadoInfo.label}
            </Badge>
          </div>
        );
      },
    },
    {
      accessorKey: "presupuestoTotal",
      header: "Total",
      cell: ({ row }) => {
        const total = row.getValue("presupuestoTotal");
        return (
          <div className="font-medium">
            ${total ? Number(total).toLocaleString("es-AR", { minimumFractionDigits: 2 }) : "0.00"}
          </div>
        );
      },
    },
    {
      id: "estadoPago",
      header: "Pago",
      cell: ({ row }) => {
        const estadoPago = row.original.estadoPago || "pendiente";
        const label = estadoPago === "pagado" ? "Pagado" : "Pendiente";
        const color = estadoPago === "pagado" ? "bg-green-100 text-green-800 border-green-200" : "bg-yellow-100 text-yellow-800 border-yellow-200";
        return <Badge variant="outline" className={color}>{label}</Badge>;
      },
    },
  ];

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const obrasSnap = await getDocs(collection(db, "obras"));
        const base = obrasSnap.docs.map((d) => ({ ...d.data(), id: d.id }));
        // Enriquecer con presupuestoTotal, estadoPago y fechaListado
        const enriched = await Promise.all(
          base.map(async (o) => {
            let presupuestoTotal = 0;
            // Totales según tipo
            if (o.tipo === "presupuesto") {
              presupuestoTotal = Number(o.total) || Number(o.productosTotal) || 0;
            } else {
              if (o.presupuestoInicialId) {
                try {
                  const pres = await getDoc(doc(db, "obras", o.presupuestoInicialId));
                  if (pres.exists()) {
                    const pd = pres.data();
                    presupuestoTotal = Number(pd.total) || Number(pd.productosTotal) || 0;
                  }
                } catch (_) {}
              }
            }
            // Fecha de la columna: usar fechaCreacion para ordenamiento y visualización
            const fechaCreacion = o.fechaCreacion || "";

            const cobr = o.cobranzas || {};
            const abonado = (Number(cobr.senia) || 0) + (Number(cobr.monto) || 0) + ((cobr.historialPagos || []).reduce((a, p) => a + (Number(p.monto) || 0), 0));
            const estadoPago = abonado >= presupuestoTotal && presupuestoTotal > 0 ? "pagado" : "pendiente";
            // estadoUI: para presupuestos siempre "activo"; para obras conservar su estado
            const estadoUI = o.tipo === "presupuesto" ? "activo" : (o.estado || "");
            return { ...o, presupuestoTotal, estadoPago, fechaCreacion, estadoUI };
          })
        );
        setObrasData(enriched);
      } catch (error) {
        console.error("Error al cargar datos:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Separar presupuestos y obras
  const presupuestos = obrasData.filter(o => o.tipo === "presupuesto");
  const obras = obrasData.filter(o => o.tipo === "obra");

  // Aplicar filtros
  const presupuestosFiltrados = presupuestos.filter((presupuesto) => {
    const cumpleEstado = !filtroEstado || presupuesto.estadoUI === filtroEstado;
    const cumpleBusqueda =
      !busqueda ||
      presupuesto.numeroPedido?.toLowerCase().includes(busqueda.toLowerCase()) ||
      presupuesto.cliente?.nombre?.toLowerCase().includes(busqueda.toLowerCase());
    return cumpleEstado && cumpleBusqueda;
  });

  const obrasFiltradas = obras.filter((obra) => {
    const cumpleEstado = !filtroEstado || obra.estadoUI === filtroEstado;
    const cumpleBusqueda =
      !busqueda ||
      obra.numeroPedido?.toLowerCase().includes(busqueda.toLowerCase()) ||
      obra.cliente?.nombre?.toLowerCase().includes(busqueda.toLowerCase());
    return cumpleEstado && cumpleBusqueda;
  });

  const estadisticas = {
    total: obrasData.length,
    obras: obras.length,
    presupuestos: presupuestos.length,
    pendientes: obras.filter((o) => o.estado === "pendiente_inicio").length,
    enProgreso: obras.filter((o) => o.estado === "en_ejecucion").length,
    completadas: obras.filter((o) => o.estado === "completada").length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-gray-600">Cargando obras...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 py-8 mx-auto font-sans">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Gestión de Obras y Presupuestos</h1>
          <p className="text-gray-600 mt-1">Administra y da seguimiento a todas las obras y presupuestos</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="default"
            className="w-full sm:w-auto flex items-center justify-center gap-3 px-6 py-4 text-base font-semibold rounded-xl shadow-lg bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 transition-all duration-300 transform hover:scale-105 hover:shadow-xl"
            onClick={() => router.push(`/${lang}/obras/presupuesto/create`)}
          >
            <Icon icon="heroicons:document-plus" className="w-5 h-5" />
            <span className="hidden sm:inline">Nuevo Presupuesto</span>
            <span className="sm:hidden">Presupuesto</span>
          </Button>
          <Button
            variant="default"
            className="w-full sm:w-auto flex items-center justify-center gap-3 px-6 py-4 text-base font-semibold rounded-xl shadow-lg bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 transition-all duration-300 transform hover:scale-105 hover:shadow-xl"
            onClick={() => router.push(`/${lang}/obras/create`)}
          >
            <Icon icon="heroicons:building-office" className="w-5 h-5" />
            <span className="hidden sm:inline">Nueva Obra</span>
            <span className="sm:hidden">Obra</span>
          </Button>
          <Button variant="outline" onClick={() => window.location.reload()}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Actualizar
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-blue-600">{estadisticas.total}</div>
            <div className="text-sm text-gray-600">Total</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-orange-600">{estadisticas.obras}</div>
            <div className="text-sm text-gray-600">Obras</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-purple-600">{estadisticas.presupuestos}</div>
            <div className="text-sm text-gray-600">Presupuestos</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-yellow-600">{estadisticas.pendientes}</div>
            <div className="text-sm text-gray-600">Pendientes</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-blue-600">{estadisticas.enProgreso}</div>
            <div className="text-sm text-gray-600">En Progreso</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold text-green-600">{estadisticas.completadas}</div>
            <div className="text-sm text-gray-600">Completadas</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="w-5 h-5" /> Filtros y Búsqueda
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium">Buscar</label>
              <div className="relative mt-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input placeholder="Número, cliente..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} className="pl-10" />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Estado</label>
              <Select value={filtroEstado} onValueChange={setFiltroEstado}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Todos los estados" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Todos los estados</SelectItem>
                  {Object.entries(estadosObra).map(([key, value]) => (
                    <SelectItem key={key} value={key}>
                      {value.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button
                variant="outline"
                onClick={() => {
                  setFiltroEstado("");
                  setBusqueda("");
                }}
                className="w-full"
              >
                Limpiar Filtros
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tablas mejoradas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 px-2">
        {/* Tabla de Presupuestos - IZQUIERDA */}
        <Card className="rounded-2xl shadow-2xl border-0 bg-gradient-to-br from-white to-gray-50/50 overflow-hidden">
          <CardHeader className="pb-4 border-b border-gray-100 bg-gradient-to-r from-purple-50 to-indigo-50 rounded-t-2xl">
            <CardTitle className="text-2xl font-bold text-gray-900 flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
                <Icon
                  icon="heroicons:document-text"
                  className="w-7 h-7 text-white"
                />
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-900">Presupuestos</div>
                <div className="text-sm font-medium text-gray-600">Gestión de cotizaciones</div>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6 p-0">
            <div className="overflow-hidden rounded-b-2xl">
              <DataTableEnhanced 
                data={presupuestosFiltrados} 
                columns={presupuestosColumns}
                searchPlaceholder="Buscar presupuestos..."
                className="border-0"
                defaultSorting={[{ id: "numeroPedido", desc: true }]}
                onRowClick={(presupuesto) => {
                  router.push(`/${lang}/obras/presupuesto/${presupuesto.id}`);
                }}
                compact={true}
              />
            </div>
          </CardContent>
        </Card>

        {/* Tabla de Obras - DERECHA */}
        <Card className="rounded-2xl shadow-2xl border-0 bg-gradient-to-br from-white to-blue-50/50 overflow-hidden">
          <CardHeader className="pb-4 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-teal-50 rounded-t-2xl">
            <CardTitle className="text-2xl font-bold text-gray-900 flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-teal-600 rounded-xl flex items-center justify-center shadow-lg">
                <Icon
                  icon="heroicons:building-office"
                  className="w-7 h-7 text-white"
                />
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-900">Obras</div>
                <div className="text-sm font-medium text-gray-600">Proyectos en ejecución</div>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6 p-0">
            <div className="overflow-hidden rounded-b-2xl">
              <DataTableEnhanced 
                data={obrasFiltradas} 
                columns={obrasColumns}
                searchPlaceholder="Buscar obras..."
                className="border-0"
                defaultSorting={[{ id: "numeroPedido", desc: true }]}
                onRowClick={(obra) => {
                  router.push(`/${lang}/obras/${obra.id}`);
                }}
                compact={true}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ObrasPage;
