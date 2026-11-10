"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  collection,
  getDocs,
} from "firebase/firestore";
import { ArrowDown, ArrowDownUp, ArrowLeft, ArrowUp, Check, ChevronDown, ChevronsUpDown, Download, ExternalLink, Loader2, MapPin, Phone, Search, Wallet, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { db } from "@/lib/firebase";
import { construirListadoDeudores } from "@/lib/deudores";

const normalizarBusqueda = (value) =>
  String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

const formatearMoneda = (value) => {
  const amount = Number(value) || 0;
  const roundedAmount = Math.round(amount * 100) / 100;
  return `$${roundedAmount.toLocaleString("es-AR", {
    minimumFractionDigits: Number.isInteger(roundedAmount) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
};

const escaparCSV = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;

const formatearFecha = (value) => {
  if (!value) return "—";
  const date = typeof value?.toDate === "function" ? value.toDate() : value instanceof Date ? value : null;
  if (date && !Number.isNaN(date.getTime())) {
    return date.toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });
  }
  const text = String(value);
  const dateOnly = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dateOnly) return `${dateOnly[3]}/${dateOnly[2]}/${dateOnly[1]}`;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime())
    ? text
    : parsed.toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });
};

const obtenerTiempoFecha = (value) => {
  if (!value) return 0;
  const date = typeof value?.toDate === "function" ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
};

const getNombreCliente = (venta) =>
  venta?.cliente?.nombre || venta?.nombreCliente || "Cliente sin nombre";

const getIdentidadCliente = (venta) => {
  const clienteId = venta?.clienteId ?? venta?.cliente?.id;
  const idNormalizado = String(clienteId ?? "").trim();
  return idNormalizado
    ? `id:${idNormalizado}`
    : `nombre:${normalizarBusqueda(getNombreCliente(venta))}`;
};

const getContactoCliente = (venta) =>
  venta?.cliente?.telefono ||
  venta?.cliente?.celular ||
  venta?.cliente?.whatsapp ||
  venta?.cliente?.email ||
  "Sin contacto";

const getDireccionCliente = (venta) => venta?.cliente?.direccion || "";

const getEtiquetaVenta = (venta) => {
  const numero = String(venta?.numeroPedido || venta?.id?.slice(-8) || "").trim();
  return /^venta[-\s]/i.test(numero) ? numero.toUpperCase() : `VENTA-${numero}`;
};

const getCorrelativoVenta = (venta) => {
  const matches = getEtiquetaVenta(venta).match(/\d+/g);
  const parsed = matches?.length ? Number(matches[matches.length - 1]) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
};

const getHistorialPagos = (venta) => {
  if (Array.isArray(venta?.pagos) && venta.pagos.length > 0) return venta.pagos;
  const montoAbonado = Number(venta?.montoAbonado) || 0;
  return montoAbonado > 0
    ? [{
        monto: montoAbonado,
        fecha: venta?.fechaPagoConfirmado || venta?.fecha,
        metodo: venta?.formaPago || "-",
        generadoAutomaticamente: true,
      }]
    : [];
};

const getUltimoPago = (venta) =>
  getHistorialPagos(venta).reduce((ultimo, pago) =>
    !ultimo || obtenerTiempoFecha(pago.fecha) > obtenerTiempoFecha(ultimo.fecha) ? pago : ultimo,
  null);

const DeudoresPage = () => {
  const router = useRouter();
  const { lang } = useParams();
  const [deudores, setDeudores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [filtroCliente, setFiltroCliente] = useState("todos");
  const [clienteSelectorAbierto, setClienteSelectorAbierto] = useState(false);
  const [pagina, setPagina] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [historialAbierto, setHistorialAbierto] = useState(null);
  const [orden, setOrden] = useState({ columna: null, descendente: false });

  const cargarDeudores = async () => {
    setLoading(true);
    setError("");
    try {
      // Sin límite: el listado debe incluir también ventas antiguas, no solo las últimas 500.
      const snapshot = await getDocs(collection(db, "ventas"));
      const ventas = snapshot.docs.map((item) => ({ ...item.data(), id: item.id }));
      setDeudores(construirListadoDeudores(ventas));
    } catch (loadError) {
      console.error("Error al cargar deudores:", loadError);
      setError("No se pudo cargar el listado de deudores.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarDeudores();
    // La carga se ejecuta una vez al montar la pantalla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const deudoresFiltrados = useMemo(() => {
    const search = normalizarBusqueda(busqueda);
    return deudores.filter((venta) => {
      if (filtroEstado !== "todos" && venta.resumenPago.estadoPago !== filtroEstado) return false;
      if (filtroCliente !== "todos" && getIdentidadCliente(venta) !== filtroCliente) return false;
      if (!search) return true;
      const campos = [
        venta.numeroPedido,
        getEtiquetaVenta(venta),
        venta.id,
        getNombreCliente(venta),
        getContactoCliente(venta),
        venta.cliente?.direccion,
        venta.vendedor,
      ];
      return normalizarBusqueda(campos.join(" ")).includes(search);
    });
  }, [deudores, busqueda, filtroEstado, filtroCliente]);

  const deudoresOrdenados = useMemo(() => {
    if (!orden.columna) return deudoresFiltrados;
    const comparar = (a, b) => {
      if (orden.columna === "numero") {
        const difference = getCorrelativoVenta(a) - getCorrelativoVenta(b);
        return Number.isFinite(difference) && difference !== 0
          ? difference
          : getEtiquetaVenta(a).localeCompare(getEtiquetaVenta(b), "es-AR", { sensitivity: "base" });
      }
      if (orden.columna === "cliente") {
        return getNombreCliente(a).localeCompare(getNombreCliente(b), "es-AR", { sensitivity: "base" });
      }
      if (orden.columna === "estado") {
        return a.resumenPago.estadoPago.localeCompare(b.resumenPago.estadoPago, "es-AR");
      }
      if (orden.columna === "ultimoPago") {
        return obtenerTiempoFecha(getUltimoPago(a)?.fecha) - obtenerTiempoFecha(getUltimoPago(b)?.fecha);
      }
      const montos = {
        total: [a.resumenPago.total, b.resumenPago.total],
        abonado: [a.resumenPago.abonado, b.resumenPago.abonado],
        saldo: [a.resumenPago.saldoPendiente, b.resumenPago.saldoPendiente],
      }[orden.columna];
      return (Number(montos?.[0]) || 0) - (Number(montos?.[1]) || 0);
    };
    return [...deudoresFiltrados].sort((a, b) => {
      const result = comparar(a, b);
      return orden.descendente ? -result : result;
    });
  }, [deudoresFiltrados, orden]);

  const clientesDeudores = useMemo(() => {
    const agrupados = new Map();

    deudores.forEach((venta) => {
      const nombre = getNombreCliente(venta);
      const identidad = getIdentidadCliente(venta);
      const cliente = agrupados.get(identidad) || { id: identidad, nombre, saldoPendiente: 0 };
      cliente.saldoPendiente += Number(venta.resumenPago?.saldoPendiente) || 0;
      agrupados.set(identidad, cliente);
    });

    return [...agrupados.values()].sort((a, b) =>
      b.saldoPendiente - a.saldoPendiente || a.nombre.localeCompare(b.nombre, "es-AR", { sensitivity: "base" })
    );
  }, [deudores]);

  useEffect(() => {
    setPagina(0);
  }, [busqueda, filtroEstado, filtroCliente, pageSize]);

  useEffect(() => {
    setPagina((current) => Math.min(
      current,
      Math.max(0, Math.ceil(deudoresFiltrados.length / pageSize) - 1)
    ));
  }, [deudoresFiltrados.length, pageSize]);

  const cantidadPaginas = Math.max(1, Math.ceil(deudoresFiltrados.length / pageSize));
  const filasVisibles = deudoresOrdenados.slice(pagina * pageSize, (pagina + 1) * pageSize);
  const clienteSeleccionado = clientesDeudores.find((cliente) => cliente.id === filtroCliente);
  const hayFiltrosActivos = Boolean(busqueda.trim()) || filtroEstado !== "todos" || filtroCliente !== "todos";

  const limpiarFiltros = () => {
    setBusqueda("");
    setFiltroEstado("todos");
    setFiltroCliente("todos");
    setClienteSelectorAbierto(false);
  };

  const exportarCSV = () => {
    const encabezados = ["N° venta", "Cliente", "Estado", "Total", "Abonado", "Saldo pendiente", "Fecha de venta", "Último pago", "Método de pago"];
    const filas = deudoresFiltrados.map((venta) => {
      const pagos = getHistorialPagos(venta);
      const ultimoPago = pagos.slice().sort((a, b) => obtenerTiempoFecha(b.fecha) - obtenerTiempoFecha(a.fecha))[0];
      return [
        getEtiquetaVenta(venta),
        getNombreCliente(venta).toLocaleUpperCase("es-AR"),
        venta.resumenPago.estadoPago === "parcial" ? "Pago parcial" : "Pendiente",
        venta.resumenPago.total,
        venta.resumenPago.abonado,
        venta.resumenPago.saldoPendiente,
        formatearFecha(venta.fechaCreacion || venta.fecha),
        formatearFecha(ultimoPago?.fecha || ""),
        ultimoPago?.metodo || venta.formaPago || "",
      ];
    });
    const contenido = [encabezados, ...filas].map((fila) => fila.map(escaparCSV).join(",")).join("\r\n");
    const blob = new Blob([`\uFEFF${contenido}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `deudores-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const ordenarPor = (columna) => {
    setPagina(0);
    setOrden((actual) => ({
      columna,
      descendente: actual.columna === columna ? !actual.descendente : false,
    }));
  };

  const encabezadoOrdenable = (etiqueta, columna, alineadoDerecha = false) => {
    const activo = orden.columna === columna;
    const IconoOrden = activo
      ? orden.descendente ? ArrowDown : ArrowUp
      : ArrowDownUp;
    return (
      <button
        type="button"
        onClick={() => ordenarPor(columna)}
        aria-label={`Ordenar por ${etiqueta}`}
        className={`inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[.09em] text-slate-500 transition-colors hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${alineadoDerecha ? "justify-end" : ""}`}
      >
        {etiqueta}<IconoOrden aria-hidden="true" className="h-3 w-3 shrink-0" />
      </button>
    );
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1500px] flex-col gap-7 px-4 py-6 text-slate-900 sm:px-7 sm:py-9">
      <header className="flex flex-col gap-5 border-b border-slate-200/80 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Button variant="ghost" size="sm" className="mb-5 -ml-3 h-8 text-slate-500 hover:text-slate-900" onClick={() => router.push(`/${lang}/ventas`)}>
            <ArrowLeft className="mr-1.5 h-4 w-4" />Ventas
          </Button>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[.2em] text-amber-700">Cartera · Cobros</p>
          <h1 className="text-3xl font-semibold tracking-[-.045em] sm:text-4xl">Deudores</h1>
          <p className="mt-2 max-w-xl text-sm text-slate-500">Seguimiento de ventas con saldo abierto y actividad de pago.</p>
        </div>
        <Button type="button" variant="ghost" onClick={cargarDeudores} disabled={loading} className="self-start text-slate-600 hover:bg-slate-100 sm:self-auto">
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Actualizar datos
        </Button>
      </header>

      <section className="border-y border-slate-200/80 py-4 sm:py-5" aria-labelledby="resumen-clientes-deudores">
        <div className="mb-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h2 id="resumen-clientes-deudores" className="text-lg font-semibold tracking-tight text-slate-900">Clientes deudores</h2>
          <span className="text-xs tabular-nums text-slate-500">{loading ? "Actualizando" : error ? "No disponible" : `${clientesDeudores.length} clientes`}</span>
        </div>
        <p className="mb-3 text-sm text-slate-500">Saldo pendiente acumulado por cliente.</p>

        {loading ? (
          <div className="flex items-center gap-2 py-3 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Cargando saldos por cliente…</div>
        ) : error ? (
          <p className="py-3 text-sm text-slate-500">El listado estará disponible cuando se recuperen los datos.</p>
        ) : clientesDeudores.length ? (
          <ul aria-label="Clientes y montos adeudados" tabIndex={0} className="grid max-h-64 grid-cols-1 gap-x-10 overflow-y-auto overscroll-contain pr-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 sm:grid-cols-2">
            {clientesDeudores.map((cliente) => (
              <li key={cliente.id} className="flex min-w-0 items-center justify-between gap-4 border-b border-slate-200/80 py-2.5 last:border-0">
                <button
                  type="button"
                  aria-pressed={filtroCliente === cliente.id}
                  onClick={() => {
                    setFiltroCliente(cliente.id);
                    setClienteSelectorAbierto(false);
                  }}
                  className={`min-w-0 truncate text-left text-sm font-semibold underline underline-offset-4 transition-colors hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 ${filtroCliente === cliente.id ? "text-slate-950 decoration-slate-500" : "text-slate-800 decoration-slate-300 hover:decoration-slate-500"}`}
                >
                  {String(cliente.nombre).toLocaleUpperCase("es-AR")}
                </button>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-950">{formatearMoneda(cliente.saldoPendiente)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-3 text-sm text-slate-500">No hay clientes con saldo pendiente.</p>
        )}
      </section>

      <section aria-labelledby="deudores-list-heading">
        <div className="flex flex-col gap-4 pb-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <h2 id="deudores-list-heading" className="text-lg font-semibold tracking-tight text-slate-900">Saldo por venta</h2>
              <span className="text-xs tabular-nums text-slate-500">{deudoresFiltrados.length} resultados</span>
              {hayFiltrosActivos ? (
                <Button type="button" variant="ghost" onClick={limpiarFiltros} className="h-7 px-2 text-xs font-medium text-slate-600 hover:text-slate-950">
                  <X aria-hidden="true" className="mr-1 h-3.5 w-3.5" />Limpiar filtros
                </Button>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-slate-500">Seleccioná una venta para consultar o actualizar su historial.</p>
          </div>
          <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2 xl:flex xl:w-auto xl:flex-none xl:items-center">
            <div className="relative min-w-0 xl:w-[288px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <Input
                value={busqueda}
                onChange={(event) => setBusqueda(event.target.value)}
                placeholder="Cliente, venta o contacto..."
                className="h-9 rounded-md border border-slate-200 bg-white pl-9 pr-9 text-xs shadow-sm placeholder:text-slate-500 focus-visible:border-slate-400 focus-visible:ring-2 focus-visible:ring-slate-200"
                aria-label="Buscar clientes o ventas"
              />
              {busqueda.trim() ? (
                <button
                  type="button"
                  aria-label="Limpiar búsqueda"
                  title="Limpiar búsqueda"
                  onClick={() => setBusqueda("")}
                  className="absolute right-2 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                >
                  <X aria-hidden="true" className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
            <div className="relative min-w-0">
              <Select value={filtroEstado} onValueChange={setFiltroEstado}>
                <SelectTrigger aria-label="Filtrar por estado" className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 pr-12 text-xs shadow-sm focus:ring-2 focus:ring-slate-200 xl:w-[170px]">
                  <SelectValue placeholder="Todos los estados" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos los estados</SelectItem>
                  <SelectItem value="pendiente">Pendiente</SelectItem>
                  <SelectItem value="parcial">Pago parcial</SelectItem>
                </SelectContent>
              </Select>
              {filtroEstado !== "todos" ? (
                <button
                  type="button"
                  aria-label="Limpiar filtro de estado"
                  title="Limpiar filtro de estado"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setFiltroEstado("todos");
                  }}
                  className="absolute right-8 top-1/2 z-10 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                >
                  <X aria-hidden="true" className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
            <div className="relative min-w-0 xl:w-[240px]">
              <Popover open={clienteSelectorAbierto} onOpenChange={setClienteSelectorAbierto}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={clienteSelectorAbierto}
                    aria-label="Filtrar por cliente"
                    className="h-9 w-full justify-between rounded-md border-slate-200 bg-white px-3 pr-12 text-left text-xs font-normal text-slate-800 shadow-sm hover:bg-slate-50"
                  >
                    <span className="truncate">
                      {clienteSeleccionado ? String(clienteSeleccionado.nombre).toLocaleUpperCase("es-AR") : "Todos los clientes"}
                    </span>
                    <ChevronsUpDown aria-hidden="true" className="ml-2 h-3.5 w-3.5 shrink-0 text-slate-500" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-[220px] overflow-hidden p-0">
                  <Command
                    filter={(value, search) =>
                      normalizarBusqueda(value).includes(normalizarBusqueda(search)) ? 1 : 0
                    }
                    className="w-full border-0 p-0 shadow-none"
                  >
                    <CommandInput placeholder="Buscar cliente..." aria-label="Buscar cliente" />
                    <CommandList className="max-h-60 overscroll-contain">
                      <CommandEmpty>No se encontraron clientes.</CommandEmpty>
                      <CommandGroup>
                        <CommandItem
                          value="todos los clientes"
                          onSelect={() => {
                            setFiltroCliente("todos");
                            setClienteSelectorAbierto(false);
                          }}
                        >
                          <Check aria-hidden="true" className={`mr-2 h-4 w-4 ${filtroCliente === "todos" ? "opacity-100" : "opacity-0"}`} />
                          Todos los clientes
                        </CommandItem>
                        {clientesDeudores.map((cliente) => {
                          const nombre = String(cliente.nombre).toLocaleUpperCase("es-AR");
                          return (
                            <CommandItem
                              key={cliente.id}
                              value={`${nombre} ${cliente.id}`}
                              onSelect={() => {
                                setFiltroCliente(cliente.id);
                                setClienteSelectorAbierto(false);
                              }}
                            >
                              <Check aria-hidden="true" className={`mr-2 h-4 w-4 ${filtroCliente === cliente.id ? "opacity-100" : "opacity-0"}`} />
                              <span className="truncate">{nombre}</span>
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {filtroCliente !== "todos" ? (
                <button
                  type="button"
                  aria-label="Limpiar filtro de cliente"
                  title="Limpiar filtro de cliente"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setFiltroCliente("todos");
                    setClienteSelectorAbierto(false);
                  }}
                  className="absolute right-8 top-1/2 z-10 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
                >
                  <X aria-hidden="true" className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
            <Button type="button" variant="outline" onClick={exportarCSV} disabled={loading || deudoresFiltrados.length === 0} className="h-9 w-full rounded-md border-slate-200 bg-white px-3 text-xs font-medium text-slate-800 shadow-sm hover:bg-slate-50 xl:w-auto">
              <Download className="mr-2 h-4 w-4" />Exportar
            </Button>
          </div>
        </div>

        {error ? <p role="alert" className="mb-3 flex items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}<Button type="button" variant="ghost" size="sm" onClick={cargarDeudores} className="h-7 px-2 text-red-800">Reintentar</Button></p> : null}

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm shadow-slate-200/40">
          <div aria-label="Tabla de saldos por venta">
            <div className="hidden grid-cols-[minmax(105px,.85fr)_minmax(180px,1.8fr)_minmax(100px,.85fr)_minmax(82px,.7fr)_minmax(82px,.7fr)_minmax(100px,.8fr)_minmax(120px,1fr)_minmax(138px,1.1fr)] items-center gap-3 border-b border-slate-200 bg-slate-50/70 px-4 py-2.5 xl:grid">
              {encabezadoOrdenable("N° venta", "numero")}
              {encabezadoOrdenable("Cliente", "cliente")}
              {encabezadoOrdenable("Estado", "estado")}
              {encabezadoOrdenable("Total", "total", true)}
              {encabezadoOrdenable("Abonado", "abonado", true)}
              {encabezadoOrdenable("Saldo", "saldo", true)}
              {encabezadoOrdenable("Último pago", "ultimoPago")}
              <span className="text-[10px] font-semibold uppercase tracking-[.09em] text-slate-500">Acciones</span>
            </div>

            {loading ? (
              <div className="flex min-h-36 items-center justify-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Actualizando cartera…</div>
            ) : filasVisibles.length ? filasVisibles.map((venta) => {
              const snapshot = venta.resumenPago;
              const pagos = getHistorialPagos(venta);
              const ultimoPago = getUltimoPago(venta);
              const estaExpandida = historialAbierto === venta.id;
              const parcial = snapshot.estadoPago === "parcial";
              const contacto = getContactoCliente(venta);
              const direccion = getDireccionCliente(venta);
              const toggleHistorial = () => setHistorialAbierto((actual) => actual === venta.id ? null : venta.id);
              const etiquetaHistorial = `${estaExpandida ? "Ocultar" : "Mostrar"} historial de pagos de ${getNombreCliente(venta)}`;
              return (
                <article key={venta.id} className="border-b border-slate-200 last:border-0" aria-label={`${getNombreCliente(venta)}, ${getEtiquetaVenta(venta)}`}>
                  <div className="grid gap-y-2 px-3 py-3 sm:px-4 xl:grid-cols-[minmax(105px,.85fr)_minmax(180px,1.8fr)_minmax(100px,.85fr)_minmax(82px,.7fr)_minmax(82px,.7fr)_minmax(100px,.8fr)_minmax(120px,1fr)_minmax(138px,1.1fr)] xl:items-center xl:gap-3">
                    <button
                      type="button"
                      onClick={toggleHistorial}
                      aria-label={etiquetaHistorial}
                      aria-expanded={estaExpandida}
                      aria-controls={`historial-pagos-${venta.id}`}
                      className="grid w-full grid-cols-1 gap-y-2 rounded-md border-0 bg-transparent p-0 text-left transition-colors hover:bg-slate-50/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary xl:col-span-7 xl:grid-cols-[minmax(105px,.85fr)_minmax(180px,1.8fr)_minmax(100px,.85fr)_minmax(82px,.7fr)_minmax(82px,.7fr)_minmax(100px,.8fr)_minmax(120px,1fr)] xl:items-center xl:gap-3 xl:rounded-none"
                    >
                    <div className="min-w-0">
                      <div className="flex items-center justify-between gap-3 xl:block">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 xl:hidden">N° venta</span>
                        <span className="whitespace-nowrap font-mono text-xs font-semibold tracking-wide text-slate-700">{getEtiquetaVenta(venta)}</span>
                      </div>
                    </div>

                    <div className="min-w-0">
                      <div className="flex min-w-0 items-start justify-between gap-3 xl:block">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 xl:hidden">Cliente</span>
                        <div className="min-w-0 flex-1 xl:flex-none">
                          <span className="block max-w-full truncate text-sm font-semibold text-slate-900">{String(getNombreCliente(venta)).toLocaleUpperCase("es-AR")}</span>
                          <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-600">
                            {contacto !== "Sin contacto" ? <span className="inline-flex min-w-0 items-center gap-1.5"><Phone aria-hidden="true" className="h-3 w-3 shrink-0 text-slate-500" /><span className="truncate">{contacto}</span></span> : null}
                            {direccion ? <span className="inline-flex min-w-0 items-center gap-1.5"><MapPin aria-hidden="true" className="h-3 w-3 shrink-0 text-slate-500" /><span className="truncate">{direccion}</span></span> : null}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3 xl:block">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 xl:hidden">Estado</span>
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${parcial ? "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200" : "bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200"}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${parcial ? "bg-amber-500" : "bg-rose-500"}`} aria-hidden="true" />
                        {parcial ? "Pago parcial" : "Pendiente"}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-3 xl:block xl:text-right"><span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 xl:hidden">Total</span><span className="text-sm tabular-nums text-slate-700">{formatearMoneda(snapshot.total)}</span></div>
                    <div className="flex items-center justify-between gap-3 xl:block xl:text-right"><span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 xl:hidden">Abonado</span><span className="text-sm tabular-nums text-emerald-700">{formatearMoneda(snapshot.abonado)}</span></div>
                    <div className="flex items-center justify-between gap-3 xl:block xl:text-right"><span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 xl:hidden">Saldo</span><span className="text-sm font-semibold tabular-nums text-slate-950">{formatearMoneda(snapshot.saldoPendiente)}</span></div>

                    <div className="flex items-center justify-between gap-3 xl:block">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 xl:hidden">Último pago</span>
                      {ultimoPago ? <div className="text-right xl:text-left"><p className="text-xs text-slate-700">{formatearFecha(ultimoPago.fecha || venta.fechaPagoConfirmado)}</p><p className="mt-0.5 text-[10px] text-slate-500">{ultimoPago.metodo || venta.formaPago || "Método no informado"}</p></div> : <span className="text-right text-[11px] text-slate-500 xl:text-left">Sin pagos registrados</span>}
                    </div>
                    </button>

                    <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-2 xl:border-0 xl:pt-0">
                      <Button type="button" variant="outline" size="sm" className="h-8 rounded-md border-slate-200 bg-white px-3 text-xs font-medium text-slate-800 shadow-sm hover:bg-slate-50" onClick={() => router.push(`/${lang}/ventas/${venta.id}`)}>
                        Abrir venta<ExternalLink aria-hidden="true" className="ml-2 h-3.5 w-3.5" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8 rounded-md text-slate-600 hover:bg-slate-100" aria-label={etiquetaHistorial} aria-expanded={estaExpandida} aria-controls={`historial-pagos-${venta.id}`} title={estaExpandida ? "Ocultar historial de pagos" : "Ver historial de pagos"} onClick={toggleHistorial}>
                        <ChevronDown aria-hidden="true" className={`h-4 w-4 transition-transform ${estaExpandida ? "rotate-180" : ""}`} />
                      </Button>
                    </div>
                  </div>

                  {estaExpandida ? (
                    <div id={`historial-pagos-${venta.id}`} className="border-t border-slate-100 bg-slate-50/60 px-4 py-3 sm:px-6">
                      <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.1em] text-slate-500"><Wallet aria-hidden="true" className="h-3.5 w-3.5" />Historial de pagos</div>
                      {pagos.length ? <div className="divide-y divide-slate-200/80">
                        {pagos.map((pago, index) => <div key={pago.id || `${venta.id}-pago-${index}`} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 py-2 text-xs sm:grid-cols-[130px_150px_minmax(0,1fr)_auto]">
                          <span className="text-slate-600">{formatearFecha(pago.fecha)}</span>
                          <span className="text-slate-700">{pago.metodo || venta.formaPago || "Sin método"}</span>
                          <span className="hidden truncate text-slate-500 sm:block">{pago.nota || "—"}</span>
                          <span className="text-right font-semibold tabular-nums text-slate-900">{formatearMoneda(pago.monto)}</span>
                        </div>)}
                      </div> : <p className="py-2 text-xs text-slate-500">Todavía no se registraron pagos.</p>}
                    </div>
                  ) : null}
                </article>
              );
            }) : (
              <div className="px-4 py-12 text-center">
                <p className="text-sm font-medium text-slate-800">{error ? "No se pudieron obtener resultados" : "No hay saldos para mostrar"}</p>
                <p className="mt-1 text-xs text-slate-500">{error ? "Intentá actualizar el listado." : "Probá modificar la búsqueda, el cliente o el estado de pago."}</p>
              </div>
            )}
          </div>
        </div>

        <footer className="flex flex-col gap-3 pt-1 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-500">{deudoresFiltrados.length === 0 ? 0 : pagina * pageSize + 1}–{Math.min((pagina + 1) * pageSize, deudoresFiltrados.length)} de {deudoresFiltrados.length} ventas</p>
          <div className="flex items-center justify-between gap-2 sm:justify-end">
            <Select value={String(pageSize)} onValueChange={(value) => setPageSize(Number(value))}>
              <SelectTrigger className="h-9 w-28 border-0 bg-transparent text-xs shadow-none"><SelectValue /></SelectTrigger>
              <SelectContent>{[10, 20, 50, 100].map((size) => <SelectItem key={size} value={String(size)}>{size} por página</SelectItem>)}</SelectContent>
            </Select>
            <Button variant="ghost" size="sm" onClick={() => setPagina((current) => Math.max(current - 1, 0))} disabled={pagina === 0}>Anterior</Button>
            <span className="min-w-12 text-center text-xs tabular-nums text-slate-500">{pagina + 1} / {cantidadPaginas}</span>
            <Button variant="ghost" size="sm" onClick={() => setPagina((current) => Math.min(current + 1, cantidadPaginas - 1))} disabled={pagina >= cantidadPaginas - 1}>Siguiente</Button>
          </div>
        </footer>
      </section>
    </main>
  );
};

export default DeudoresPage;
