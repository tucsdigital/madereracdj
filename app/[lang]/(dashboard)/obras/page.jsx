"use client";
import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ObrasDataTable } from "./components/obras-data-table";
import { db } from "@/lib/firebase";
import { collection, getDocs, doc, getDoc } from "firebase/firestore";
import { Filter, Search, RefreshCw, Building, CheckCircle, Clock, AlertCircle } from "lucide-react";
import { useRouter, useParams } from "next/navigation";

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

  const obrasColumns = [
    {
      accessorKey: "numeroPedido",
      header: "N° Obra/Presupuesto",
      cell: ({ row }) => {
        const numero = row.getValue("numeroPedido");
        const tipo = row.original.tipo;
        const esPresupuesto = tipo === "presupuesto";
        
        return (
          <div className="flex items-center gap-2">
            <div className={`font-medium cursor-pointer hover:underline ${
              esPresupuesto ? "text-purple-600" : "text-blue-600"
            }`}>
              {numero || "Sin número"}
            </div>
            {esPresupuesto && (
              <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">
                PO
              </Badge>
            )}
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
          <span>Fecha y Hora</span>
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
          // Convertir a fecha y formatear en zona horaria argentina (GMT-3)
          const fecha = new Date(fechaCreacion);
          const fechaArgentina = new Date(fecha.getTime() - (3 * 60 * 60 * 1000)); // Ajustar a GMT-3
          
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
      accessorKey: "tipo",
      header: "Tipo",
      cell: ({ row }) => {
        const tipo = row.getValue("tipo");
        const tipos = {
          obra: { label: "Obra", color: "bg-blue-100 text-blue-800 border-blue-200" },
          presupuesto: { label: "Presupuesto", color: "bg-purple-100 text-purple-800 border-purple-200" },
        };
        const tipoInfo = tipos[tipo] || { label: tipo, color: "bg-gray-100 text-gray-800 border-gray-200" };
        return (
          <Badge variant="outline" className={tipoInfo.color}>
            {tipoInfo.label}
          </Badge>
        );
      },
    },
    {
      accessorKey: "estadoUI",
      header: "Estado",
      cell: ({ row }) => {
        const estado = row.getValue("estadoUI");
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

  const obrasFiltradas = obrasData.filter((obra) => {
    const cumpleEstado = !filtroEstado || obra.estadoUI === filtroEstado;
    const cumpleTipo = !filtroTipo || obra.tipo === filtroTipo;
    const cumpleBusqueda =
      !busqueda ||
      obra.numeroPedido?.toLowerCase().includes(busqueda.toLowerCase()) ||
      obra.cliente?.nombre?.toLowerCase().includes(busqueda.toLowerCase());
    return cumpleEstado && cumpleTipo && cumpleBusqueda;
  });

  const estadisticas = {
    total: obrasData.length,
    obras: obrasData.filter((o) => o.tipo === "obra").length,
    presupuestos: obrasData.filter((o) => o.tipo === "presupuesto").length,
    pendientes: obrasData.filter((o) => o.estado === "pendiente").length,
    enProgreso: obrasData.filter((o) => o.estado === "en_progreso").length,
    completadas: obrasData.filter((o) => o.estado === "completada").length,
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
    <div className="flex flex-col gap-6 py-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Gestión de Obras y Presupuestos</h1>
          <p className="text-gray-600 mt-1">Administra y da seguimiento a todas las obras y presupuestos</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="default"
            className="flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg shadow-sm"
            onClick={() => router.push(`/${lang}/obras/presupuesto/create`)}
          >
            Nuevo Presupuesto
          </Button>
          <Button
            variant="default"
            className="flex items-center justify-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg shadow-sm"
            onClick={() => router.push(`/${lang}/obras/create`)}
          >
            Nueva Obra
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
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
            <div>
              <label className="text-sm font-medium">Tipo</label>
              <Select value={filtroTipo} onValueChange={setFiltroTipo}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Todos los tipos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Todos los tipos</SelectItem>
                  <SelectItem value="obra">Obra</SelectItem>
                  <SelectItem value="presupuesto">Presupuesto</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button
                variant="outline"
                onClick={() => {
                  setFiltroEstado("");
                  setFiltroTipo("");
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

      <Card>
        <CardHeader>
          <CardTitle>Obras y Presupuestos ({obrasFiltradas.length} de {obrasData.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <ObrasDataTable data={obrasFiltradas} columns={obrasColumns} />
        </CardContent>
      </Card>
    </div>
  );
};

export default ObrasPage;
