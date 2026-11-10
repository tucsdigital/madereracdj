"use client";
import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateInput } from "@/components/ui/date-input";
import { db } from "@/lib/firebase";
import { collection, getDocs } from "firebase/firestore";
import { Calendar, DollarSign, FolderOpen, Image as ImageIcon, Receipt, Briefcase, Wallet, RefreshCw, Search, Loader2 } from "lucide-react";

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
    <main className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-3 py-6 font-sans text-slate-900 sm:px-6 sm:py-8">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[.18em] text-amber-700">Finanzas · Comprobantes</p>
          <h1 className="text-3xl font-semibold tracking-[-.04em] sm:text-4xl">Pagos en dólares</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-500">Comprobantes de ventas, obras, gastos y presupuestos.</p>
        </div>
        <Button variant="outline" onClick={cargarDatos} disabled={loading} className="h-9 self-start rounded-md border-slate-200 bg-white px-3 text-xs font-medium shadow-sm hover:bg-slate-50 sm:self-auto">
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />Actualizar
        </Button>
      </header>

      <section className="flex flex-col gap-3 border-b border-slate-200 pb-4" aria-label="Filtros de comprobantes">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(250px,2fr)_repeat(4,minmax(145px,1fr))]">
          <div className="relative min-w-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <Input
              placeholder="Buscar por pedido, obra, gasto, proveedor, cliente..."
              value={filtroTexto}
              onChange={(e) => setFiltroTexto(e.target.value)}
              aria-label="Buscar comprobantes"
              className="h-9 rounded-md border-slate-200 bg-white pl-9 text-xs shadow-sm placeholder:text-slate-500 focus-visible:ring-slate-200"
            />
          </div>
          <Select value={filtroOrigen} onValueChange={setFiltroOrigen}>
            <SelectTrigger className="h-9 rounded-md border-slate-200 bg-white text-xs shadow-sm">
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
            <SelectTrigger className="h-9 rounded-md border-slate-200 bg-white text-xs shadow-sm">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="imagen">Imágenes</SelectItem>
              <SelectItem value="pdf">PDF</SelectItem>
            </SelectContent>
          </Select>
          <DateInput
            value={fechaDesde}
            onChange={(v) => setFechaDesde(v)}
            buttonClassName="h-9 w-full justify-start rounded-md border-slate-200 bg-white text-xs shadow-sm"
          />
          <DateInput
            value={fechaHasta}
            min={fechaDesde || undefined}
            onChange={(v) => setFechaHasta(v)}
            buttonClassName="h-9 w-full justify-start rounded-md border-slate-200 bg-white text-xs shadow-sm"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={modoVista === "imagenes" ? "default" : "outline"}
              size="sm"
              onClick={() => setModoVista("imagenes")}
              className="h-8 rounded-md px-3 text-xs"
            >
              <ImageIcon className="w-4 h-4 mr-1" />
              Solo imágenes
            </Button>
            <Button
              variant={modoVista === "carpetas" ? "default" : "outline"}
              size="sm"
              onClick={() => setModoVista("carpetas")}
              className="h-8 rounded-md px-3 text-xs"
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
              className="h-8 px-3 text-xs text-slate-600"
            >
              Limpiar filtros
            </Button>
        </div>
      </section>

      <div className="flex flex-wrap gap-x-7 gap-y-3 border-b border-slate-200 pb-4" aria-label="Cantidad de comprobantes por origen">
        {Object.entries(ORIGEN_META).map(([key, meta]) => {
          return (
            <div key={key} className="flex items-baseline gap-2">
              <span className="text-lg font-semibold tabular-nums text-slate-900">{totalPorOrigen[key] || 0}</span>
              <span className="text-xs text-slate-500">{meta.label}</span>
            </div>
          );
        })}
      </div>

      {loading ? (
        <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Cargando comprobantes...</div>
      ) : modoVista === "carpetas" ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {carpetas.map((folder) => {
            const meta = ORIGEN_META[folder.origen] || ORIGEN_META.ventas;
            return (
              <Card key={folder.key} className="overflow-hidden rounded-lg border-slate-200 bg-white shadow-none transition-colors hover:border-slate-300">
                <CardContent className="p-0">
                  {folder.cover ? (
                    <a href={folder.cover} target="_blank" rel="noopener noreferrer">
                      <img src={folder.cover} alt={folder.referencia} className="w-full object-cover max-h-[320px]" />
                    </a>
                  ) : (
                    <div className="h-48 flex items-center justify-center bg-muted/50 text-muted-foreground">Sin preview</div>
                  )}
                    <div className="space-y-2 p-3">
                    <div className="flex items-center justify-between">
                      <Badge className={meta.color}>{meta.label}</Badge>
                      <span className="text-xs text-muted-foreground">{folder.total} archivo{folder.total !== 1 ? "s" : ""}</span>
                    </div>
                    <div className="font-semibold">{folder.referencia}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {formatDate(folder.fecha)}
                    </div>
                    {!!folder.proveedor && <div className="text-xs text-muted-foreground">Proveedor: <span className="uppercase">{folder.proveedor}</span></div>}
                    {!!folder.cliente && <div className="text-xs text-muted-foreground">Cliente: {folder.cliente}</div>}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {itemsFiltrados.map((item) => {
            const meta = ORIGEN_META[item.origen] || ORIGEN_META.ventas;
            return (
              <Card key={item.id} className="overflow-hidden rounded-lg border-slate-200 bg-white shadow-none transition-colors hover:border-slate-300">
                <CardContent className="p-0">
                  {item.tipo === "pdf" ? (
                    <a href={item.url} target="_blank" rel="noopener noreferrer" className="block">
                      <div className="h-40 flex items-center justify-center bg-muted/50 text-foreground font-semibold">
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
                    <div className="text-xs text-muted-foreground">{item.nombre}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {formatDate(item.fecha)}
                    </div>
                    {!!item.proveedor && <div className="text-xs text-muted-foreground">Proveedor: <span className="uppercase">{item.proveedor}</span></div>}
                    {!!item.cliente && <div className="text-xs text-muted-foreground">Cliente: {item.cliente}</div>}
                    {!!item.gastoConcepto && <div className="text-xs text-muted-foreground">Gasto: {item.gastoConcepto}</div>}
                    {!!item.metodo && <div className="text-xs text-muted-foreground">Método: {item.metodo}</div>}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {!loading && itemsFiltrados.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-300 px-4 py-12 text-center">
          <p className="text-sm font-medium text-slate-800">No hay comprobantes para mostrar</p>
          <p className="mt-1 text-xs text-slate-500">Ajustá los filtros o probá otra búsqueda.</p>
        </div>
      )}
    </main>
  );
}
