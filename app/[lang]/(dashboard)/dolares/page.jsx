"use client";
import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { db } from "@/lib/firebase";
import { collection, getDocs } from "firebase/firestore";
import { Calendar, DollarSign, FolderOpen, Image as ImageIcon, Receipt, Briefcase, Wallet, Filter, RefreshCw } from "lucide-react";

const ORIGEN_META = {
  ventas: { label: "Ventas", icon: Receipt, color: "bg-blue-100 text-blue-700 border-blue-200" },
  obras: { label: "Obras", icon: Briefcase, color: "bg-violet-100 text-violet-700 border-violet-200" },
  gastos: { label: "Gastos", icon: Wallet, color: "bg-amber-100 text-amber-700 border-amber-200" },
  presupuestos: { label: "Presupuestos", icon: DollarSign, color: "bg-emerald-100 text-emerald-700 border-emerald-200" },
};

const toDateSafe = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  if (value && typeof value === "object" && "seconds" in value) {
    return new Date(value.seconds * 1000);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatDate = (value) => {
  const d = toDateSafe(value);
  if (!d) return "-";
  return d.toLocaleDateString("es-AR");
};

const sortByFechaDesc = (a, b) => {
  const da = toDateSafe(a?.fecha)?.getTime?.() || 0;
  const db = toDateSafe(b?.fecha)?.getTime?.() || 0;
  return db - da;
};

const getRefValue = (docData, idFallback) =>
  docData?.numeroPedido ||
  docData?.numeroObra ||
  docData?.numeroComprobante ||
  docData?.numeroFactura ||
  docData?.codigo ||
  docData?.nombre ||
  (idFallback ? String(idFallback).slice(-8) : "-");

const normalizarComprobante = (comp, idx, base) => ({
  id: `${base.origen}-${base.docId}-${base.pagoId || "doc"}-${idx}`,
  origen: base.origen,
  docId: base.docId,
  pagoId: base.pagoId || null,
  url: comp?.url || "",
  nombre: comp?.nombre || `Comprobante ${idx + 1}`,
  tipo: comp?.tipo || (comp?.url?.toLowerCase?.().includes(".pdf") ? "pdf" : "imagen"),
  fecha: base.fecha,
  referencia: base.referencia,
  proveedor: base.proveedor || "",
  cliente: base.cliente || "",
  gastoConcepto: base.gastoConcepto || "",
  metodo: base.metodo || "",
  monto: Number(base.monto || 0),
  pagoEnDolares: !!base.pagoEnDolares,
});

export default function DolaresPage() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [modoVista, setModoVista] = useState("imagenes");
  const [filtroOrigen, setFiltroOrigen] = useState("todos");
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [filtroTexto, setFiltroTexto] = useState("");
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");

  const cargarDatos = async () => {
    setLoading(true);
    try {
      const [ventasSnap, obrasSnap, gastosSnap, presupuestosSnap] = await Promise.all([
        getDocs(collection(db, "ventas")),
        getDocs(collection(db, "obras")),
        getDocs(collection(db, "gastos")),
        getDocs(collection(db, "presupuestos")),
      ]);

      const acc = [];

      ventasSnap.docs.forEach((d) => {
        const venta = d.data();
        const comprobantes = Array.isArray(venta.comprobantesPago) ? venta.comprobantesPago : [];
        if (!venta.pagoEnDolares && comprobantes.length === 0) return;
        const base = {
          origen: "ventas",
          docId: d.id,
          fecha: venta.fecha || venta.fechaCreacion,
          referencia: getRefValue(venta, d.id),
          cliente: venta.cliente?.nombre || "",
          pagoEnDolares: !!venta.pagoEnDolares,
          monto: Number(venta.total || 0),
        };
        comprobantes.forEach((comp, idx) => {
          if (!comp?.url) return;
          acc.push(normalizarComprobante(comp, idx, base));
        });
      });

      obrasSnap.docs.forEach((d) => {
        const obra = d.data();
        const comprobantes = Array.isArray(obra.comprobantesPago) ? obra.comprobantesPago : [];
        if (!obra.pagoEnDolares && comprobantes.length === 0) return;
        const base = {
          origen: "obras",
          docId: d.id,
          fecha: obra.fechaModificacion || obra.fechaCreacion,
          referencia: getRefValue(obra, d.id),
          cliente: obra.cliente?.nombre || obra.clienteNombre || "",
          pagoEnDolares: !!obra.pagoEnDolares,
          monto: Number(obra.total || obra.totalObra || 0),
        };
        comprobantes.forEach((comp, idx) => {
          if (!comp?.url) return;
          acc.push(normalizarComprobante(comp, idx, base));
        });
      });

      gastosSnap.docs.forEach((d) => {
        const gasto = d.data();
        const pagos = Array.isArray(gasto.pagos) ? gasto.pagos : [];
        pagos.forEach((pago, idxPago) => {
          const comprobantes = Array.isArray(pago.comprobantes) ? pago.comprobantes : [];
          if (!pago.pagoEnDolares && comprobantes.length === 0) return;
          const base = {
            origen: "gastos",
            docId: d.id,
            pagoId: `${idxPago}`,
            fecha: pago.fecha || gasto.fecha,
            referencia: getRefValue(gasto, d.id),
            proveedor: gasto.proveedor?.nombre || "",
            gastoConcepto: gasto.concepto || gasto.observaciones || "",
            pagoEnDolares: !!pago.pagoEnDolares,
            metodo: pago.metodo || "",
            monto: Number(pago.monto || 0),
          };
          comprobantes.forEach((comp, idx) => {
            if (!comp?.url) return;
            acc.push(normalizarComprobante(comp, idx, base));
          });
        });
      });

      presupuestosSnap.docs.forEach((d) => {
        const presupuesto = d.data();
        const comprobantes = Array.isArray(presupuesto.comprobantesPago) ? presupuesto.comprobantesPago : [];
        if (!presupuesto.pagoEnDolares && comprobantes.length === 0) return;
        const base = {
          origen: "presupuestos",
          docId: d.id,
          fecha: presupuesto.fecha || presupuesto.fechaCreacion,
          referencia: getRefValue(presupuesto, d.id),
          cliente: presupuesto.cliente?.nombre || "",
          pagoEnDolares: !!presupuesto.pagoEnDolares,
          monto: Number(presupuesto.total || 0),
        };
        comprobantes.forEach((comp, idx) => {
          if (!comp?.url) return;
          acc.push(normalizarComprobante(comp, idx, base));
        });
      });

      const ordenados = acc.sort(sortByFechaDesc);
      setItems(ordenados);
    } catch (error) {
      console.error("Error cargando comprobantes en dólares:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarDatos();
  }, []);

  const itemsFiltrados = useMemo(() => {
    const texto = filtroTexto.trim().toLowerCase();
    const from = toDateSafe(fechaDesde);
    const to = toDateSafe(fechaHasta);
    const filtrados = items.filter((item) => {
      if (filtroOrigen !== "todos" && item.origen !== filtroOrigen) return false;
      if (filtroTipo !== "todos" && item.tipo !== filtroTipo) return false;
      const fechaItem = toDateSafe(item.fecha);
      if (from && (!fechaItem || fechaItem < from)) return false;
      if (to && (!fechaItem || fechaItem > new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59))) return false;
      if (!texto) return true;
      const bolsa = [
        item.nombre,
        item.referencia,
        item.proveedor,
        item.cliente,
        item.gastoConcepto,
        item.metodo,
        item.docId,
      ]
        .join(" ")
        .toLowerCase();
      return bolsa.includes(texto);
    });
    return filtrados.sort(sortByFechaDesc);
  }, [items, filtroOrigen, filtroTipo, filtroTexto, fechaDesde, fechaHasta]);

  const carpetas = useMemo(() => {
    const grouped = {};
    itemsFiltrados.forEach((item) => {
      const key = `${item.origen}-${item.docId}`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(item);
    });
    return Object.values(grouped).map((list) => {
      const primero = list[0];
      return {
        key: `${primero.origen}-${primero.docId}`,
        origen: primero.origen,
        referencia: primero.referencia,
        fecha: primero.fecha,
        total: list.length,
        cover: list.find((i) => i.tipo !== "pdf")?.url || list[0].url,
        proveedor: primero.proveedor,
        cliente: primero.cliente,
      };
    }).sort(sortByFechaDesc);
  }, [itemsFiltrados]);

  const totalPorOrigen = useMemo(() => {
    return itemsFiltrados.reduce((acc, item) => {
      acc[item.origen] = (acc[item.origen] || 0) + 1;
      return acc;
    }, {});
  }, [itemsFiltrados]);

  return (
    <div className="py-8 px-2 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <DollarSign className="w-9 h-9 text-amber-600" />
          <div>
            <h1 className="text-3xl font-bold">Dólares</h1>
            <p className="text-gray-500">Comprobantes de pagos en dólares de ventas, obras, gastos y presupuestos</p>
          </div>
        </div>
        <Button variant="outline" onClick={cargarDatos} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Actualizar
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Filter className="w-4 h-4" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-3">
          <div className="lg:col-span-2">
            <Input
              placeholder="Buscar por pedido, obra, gasto, proveedor, cliente..."
              value={filtroTexto}
              onChange={(e) => setFiltroTexto(e.target.value)}
            />
          </div>
          <Select value={filtroOrigen} onValueChange={setFiltroOrigen}>
            <SelectTrigger>
              <SelectValue placeholder="Origen" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="ventas">Ventas</SelectItem>
              <SelectItem value="obras">Obras</SelectItem>
              <SelectItem value="gastos">Gastos</SelectItem>
              <SelectItem value="presupuestos">Presupuestos</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filtroTipo} onValueChange={setFiltroTipo}>
            <SelectTrigger>
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="imagen">Imágenes</SelectItem>
              <SelectItem value="pdf">PDF</SelectItem>
            </SelectContent>
          </Select>
          <Input type="date" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} />
          <Input type="date" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} />
          <div className="lg:col-span-6 flex flex-wrap items-center gap-2">
            <Button
              variant={modoVista === "imagenes" ? "default" : "outline"}
              size="sm"
              onClick={() => setModoVista("imagenes")}
            >
              <ImageIcon className="w-4 h-4 mr-1" />
              Solo imágenes
            </Button>
            <Button
              variant={modoVista === "carpetas" ? "default" : "outline"}
              size="sm"
              onClick={() => setModoVista("carpetas")}
            >
              <FolderOpen className="w-4 h-4 mr-1" />
              Vista por carpetas
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFiltroTexto("");
                setFiltroOrigen("todos");
                setFiltroTipo("todos");
                setFechaDesde("");
                setFechaHasta("");
              }}
            >
              Limpiar filtros
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Object.entries(ORIGEN_META).map(([key, meta]) => {
          const IconComp = meta.icon;
          return (
            <Card key={key}>
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">{meta.label}</p>
                  <p className="text-2xl font-bold">{totalPorOrigen[key] || 0}</p>
                </div>
                <IconComp className="w-6 h-6 text-gray-500" />
              </CardContent>
            </Card>
          );
        })}
      </div>

      {loading ? (
        <Card>
          <CardContent className="py-16 text-center text-gray-500">Cargando comprobantes...</CardContent>
        </Card>
      ) : modoVista === "carpetas" ? (
        <div className="columns-1 sm:columns-2 lg:columns-3 gap-4 space-y-4">
          {carpetas.map((folder) => {
            const meta = ORIGEN_META[folder.origen] || ORIGEN_META.ventas;
            return (
              <Card key={folder.key} className="break-inside-avoid overflow-hidden">
                <CardContent className="p-0">
                  {folder.cover ? (
                    <a href={folder.cover} target="_blank" rel="noopener noreferrer">
                      <img src={folder.cover} alt={folder.referencia} className="w-full object-cover max-h-[320px]" />
                    </a>
                  ) : (
                    <div className="h-48 flex items-center justify-center bg-gray-100 text-gray-500">Sin preview</div>
                  )}
                  <div className="p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <Badge className={meta.color}>{meta.label}</Badge>
                      <span className="text-xs text-gray-500">{folder.total} archivo{folder.total !== 1 ? "s" : ""}</span>
                    </div>
                    <div className="font-semibold">{folder.referencia}</div>
                    <div className="text-xs text-gray-500 flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {formatDate(folder.fecha)}
                    </div>
                    {!!folder.proveedor && <div className="text-xs text-gray-600">Proveedor: {folder.proveedor}</div>}
                    {!!folder.cliente && <div className="text-xs text-gray-600">Cliente: {folder.cliente}</div>}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="columns-1 sm:columns-2 lg:columns-4 gap-4 space-y-4">
          {itemsFiltrados.map((item) => {
            const meta = ORIGEN_META[item.origen] || ORIGEN_META.ventas;
            return (
              <Card key={item.id} className="break-inside-avoid overflow-hidden">
                <CardContent className="p-0">
                  {item.tipo === "pdf" ? (
                    <a href={item.url} target="_blank" rel="noopener noreferrer" className="block">
                      <div className="h-40 flex items-center justify-center bg-slate-100 text-slate-700 font-semibold">
                        PDF
                      </div>
                    </a>
                  ) : (
                    <a href={item.url} target="_blank" rel="noopener noreferrer" className="block">
                      <img src={item.url} alt={item.nombre} className="w-full object-cover max-h-[380px]" />
                    </a>
                  )}
                  <div className="p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <Badge className={meta.color}>{meta.label}</Badge>
                      {item.pagoEnDolares && <Badge variant="outline">USD</Badge>}
                    </div>
                    <div className="font-semibold text-sm">{item.referencia}</div>
                    <div className="text-xs text-gray-500">{item.nombre}</div>
                    <div className="text-xs text-gray-500 flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {formatDate(item.fecha)}
                    </div>
                    {!!item.proveedor && <div className="text-xs text-gray-600">Proveedor: {item.proveedor}</div>}
                    {!!item.cliente && <div className="text-xs text-gray-600">Cliente: {item.cliente}</div>}
                    {!!item.gastoConcepto && <div className="text-xs text-gray-600">Gasto: {item.gastoConcepto}</div>}
                    {!!item.metodo && <div className="text-xs text-gray-600">Método: {item.metodo}</div>}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {!loading && itemsFiltrados.length === 0 && (
        <Card>
          <CardContent className="py-16 text-center text-gray-500">
            No se encontraron comprobantes para los filtros seleccionados.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
