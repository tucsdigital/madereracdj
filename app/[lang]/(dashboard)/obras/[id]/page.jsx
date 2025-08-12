"use client";
import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Edit, Printer, Download } from "lucide-react";
import { db } from "@/lib/firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { Icon } from "@iconify/react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ObraDetallePage = () => {
  const params = useParams();
  const router = useRouter();
  const { id, lang } = params;
  const [obra, setObra] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [presupuesto, setPresupuesto] = useState(null);
  const [editando, setEditando] = useState(false);
  const [docLinks, setDocLinks] = useState([]);
  const [linkInput, setLinkInput] = useState("");
  const [formaPago, setFormaPago] = useState("");
  const [senia, setSenia] = useState(0);
  const [monto, setMonto] = useState(0);
  const [historialPagos, setHistorialPagos] = useState([]);
  const [pagoDraft, setPagoDraft] = useState({
    fecha: "",
    monto: "",
    metodo: "efectivo",
  });

  useEffect(() => {
    const fetchObra = async () => {
      try {
        setLoading(true);
        const obraDoc = await getDoc(doc(db, "obras", id));

        if (obraDoc.exists()) {
          const data = { id: obraDoc.id, ...obraDoc.data() };
          setObra(data);
          // Si tiene presupuesto inicial, cargarlo
          if (data.presupuestoInicialId) {
            const presSnap = await getDoc(
              doc(db, "obras", data.presupuestoInicialId)
            );
            if (presSnap.exists())
              setPresupuesto({ id: presSnap.id, ...presSnap.data() });
          }
          // Inicializar estados de edición si existen
          const d = data.documentacion || {};
          setDocLinks(Array.isArray(d.links) ? d.links : []);

          const c = data.cobranzas || {};
          setFormaPago(c.formaPago || "");
          setSenia(Number(c.senia) || 0);
          setMonto(Number(c.monto) || 0);
          setHistorialPagos(
            Array.isArray(c.historialPagos) ? c.historialPagos : []
          );
        } else {
          setError("Obra no encontrada");
        }
      } catch (err) {
        console.error("Error al cargar la obra:", err);
        setError("Error al cargar la obra");
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      fetchObra();
    }
  }, [id]);

  const formatearNumeroArgentino = (numero) => {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
    }).format(numero);
  };

  const formatearFecha = (fecha) => {
    if (!fecha) return "No especificada";
    return new Date(fecha).toLocaleDateString("es-AR", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const getEstadoColor = (estado) => {
    switch (estado) {
      case "pendiente":
        return "bg-yellow-100 text-yellow-800";
      case "en_progreso":
        return "bg-blue-100 text-blue-800";
      case "completada":
        return "bg-green-100 text-green-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };
  const getEstadoLabel = (estado) => {
    switch (estado) {
      case "pendiente_inicio":
        return "Pendiente de Inicio";
      case "en_ejecucion":
        return "En Ejecución";
      case "pausada":
        return "Pausada";
      case "finalizada":
        return "Finalizada";
      case "cancelada":
        return "Cancelada";
      default:
        return estado || "-";
    }
  };

  const getTipoColor = (tipo) => {
    switch (tipo) {
      case "obra":
        return "bg-orange-100 text-orange-800";
      case "presupuesto":
        return "bg-purple-100 text-purple-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const formatNumber = (n) =>
    new Intl.NumberFormat("es-AR").format(Number(n || 0));

  const productosSubtotal = React.useMemo(() => {
    const items = obra?.materialesCatalogo || [];
    return items.reduce((acc, p) => {
      const esMadera = String(p.categoria || "").toLowerCase() === "maderas";
      const isMachDeck =
        esMadera &&
        (p.subcategoria === "machimbre" || p.subcategoria === "deck");
      const base = isMachDeck
        ? Number(p.precio) || 0
        : (Number(p.precio) || 0) * (Number(p.cantidad) || 0);
      return acc + base;
    }, 0);
  }, [obra]);
  const productosDescuentoTotal = React.useMemo(() => {
    const items = obra?.materialesCatalogo || [];
    return items.reduce((acc, p) => {
      const esMadera = String(p.categoria || "").toLowerCase() === "maderas";
      const isMachDeck =
        esMadera &&
        (p.subcategoria === "machimbre" || p.subcategoria === "deck");
      const base = isMachDeck
        ? Number(p.precio) || 0
        : (Number(p.precio) || 0) * (Number(p.cantidad) || 0);
      return acc + base * ((Number(p.descuento) || 0) / 100);
    }, 0);
  }, [obra]);
  const productosTotal = React.useMemo(
    () => productosSubtotal - productosDescuentoTotal,
    [productosSubtotal, productosDescuentoTotal]
  );

  const guardarEdicion = async () => {
    const target = doc(db, "obras", obra.id);
    const documentacion = { links: (docLinks || []).filter(Boolean) };
    const montoNum = Number(monto) || 0;
    const seniaNum = Number(senia) || 0;
    const totalBase =
      (Number(obra?.productosTotal) || productosTotal) +
      (presupuesto?.total || 0);
    const cobranzas = {
      formaPago: formaPago || "",
      senia: seniaNum,
      monto: montoNum,
      historialPagos: (historialPagos || []).map((p) => ({
        fecha: p.fecha || "",
        monto: Number(p.monto) || 0,
        metodo: p.metodo || "",
      })),
      saldoPendiente: Math.max(
        0,
        totalBase -
          seniaNum -
          montoNum -
          (historialPagos || []).reduce((a, b) => a + (Number(b.monto) || 0), 0)
      ),
    };
    await updateDoc(target, { documentacion, cobranzas });
    setEditando(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-gray-600">Cargando obra...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-red-600 text-lg mb-4">{error}</p>
          <Button onClick={() => router.back()}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Volver
          </Button>
        </div>
      </div>
    );
  }

  if (!obra) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-gray-600 text-lg mb-4">Obra no encontrada</p>
          <Button onClick={() => router.back()}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Volver
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            onClick={() => router.back()}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver
          </Button>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setEditando((v) => !v)}>
            {editando ? "Cancelar" : "Editar Obra"}
          </Button>
          {editando && (
            <Button onClick={guardarEdicion}>Guardar cambios</Button>
          )}
          <Button variant="outline">
            <Printer className="w-4 h-4 mr-2" />
            Imprimir
          </Button>
          <Button variant="outline">
            <Download className="w-4 h-4 mr-2" />
            Exportar
          </Button>
        </div>
      </div>

      {/* Información principal */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Información del cliente */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Icon icon="heroicons:user" className="w-5 h-5" />
              Información del Cliente
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-sm text-gray-500">Nombre</p>
              <p className="font-medium">{obra.cliente?.nombre}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Email</p>
              <p className="font-medium">
                {obra.cliente?.email || "No especificado"}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Teléfono</p>
              <p className="font-medium">{obra.cliente?.telefono}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Dirección</p>
              <p className="font-medium">{obra.cliente?.direccion}</p>
            </div>
            {obra.cliente?.cuit && (
              <div>
                <p className="text-sm text-gray-500">CUIT</p>
                <p className="font-medium">{obra.cliente.cuit}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Información de la obra */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Icon icon="heroicons:document-text" className="w-5 h-5" />
              Información de la{" "}
              {obra.tipo === "presupuesto" ? "Presupuesto" : "Obra"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Badge className={getTipoColor(obra.tipo)}>
                {obra.tipo === "presupuesto" ? "Presupuesto" : "Obra"}
              </Badge>
              <Badge className={getEstadoColor(obra.estado)}>
                {getEstadoLabel(obra.estado)}
              </Badge>
            </div>
            <div>
              <p className="text-sm text-gray-500">Número de Pedido</p>
              <p className="font-medium">{obra.numeroPedido}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Nombre de la Obra</p>
              <p className="font-medium">{obra.nombreObra || "-"}</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-gray-500">Tipo de Obra</p>
                <p className="font-medium">{obra.tipoObra || "-"}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Prioridad</p>
                <p className="font-medium">{obra.prioridad || "-"}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Responsable</p>
                <p className="font-medium">{obra.responsable || "-"}</p>
              </div>
            </div>
            <div>
              <p className="text-sm text-gray-500">Fecha de Creación</p>
              <p className="font-medium">
                {formatearFecha(obra.fechaCreacion)}
              </p>
            </div>
            {/* Fechas de obra */}
            {obra.fechas && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Inicio Estimado</p>
                  <p className="font-medium">
                    {obra.fechas.fechaInicioEstimada || "-"}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Fin Estimado</p>
                  <p className="font-medium">
                    {obra.fechas.fechaFinEstimada || "-"}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Inicio Real</p>
                  <p className="font-medium">
                    {obra.fechas.fechaInicioReal || "-"}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Fin Real</p>
                  <p className="font-medium">
                    {obra.fechas.fechaFinReal || "-"}
                  </p>
                </div>
              </div>
            )}

            {/* Ubicación */}
            {obra.ubicacion && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Dirección (obra)</p>
                  <p className="font-medium">
                    {obra.ubicacion.direccion || "-"}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Localidad</p>
                  <p className="font-medium">
                    {obra.ubicacion.localidad || "-"}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Provincia</p>
                  <p className="font-medium">
                    {obra.ubicacion.provincia || "-"}
                  </p>
                </div>
              </div>
            )}

            {presupuesto && (
              <div>
                <p className="text-sm text-gray-500">Presupuesto inicial</p>
                <p className="font-medium">
                  {presupuesto.numeroPedido || obra.presupuestoInicialId}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Resumen financiero */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Icon icon="heroicons:currency-dollar" className="w-5 h-5" />
              Resumen Financiero
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-sm text-gray-500">Subtotal</p>
              <p className="font-medium">
                {formatearNumeroArgentino(
                  obra.productosSubtotal || productosSubtotal
                )}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Descuento Total</p>
              <p className="font-medium">
                {formatearNumeroArgentino(
                  obra.productosDescuentoTotal || productosDescuentoTotal
                )}
              </p>
            </div>
            {presupuesto && (
              <div>
                <p className="text-sm text-gray-500">
                  Total presupuesto inicial
                </p>
                <p className="font-medium">
                  {formatearNumeroArgentino(presupuesto.total || 0)}
                </p>
              </div>
            )}
            {obra.costoEnvio && obra.costoEnvio > 0 && (
              <div>
                <p className="text-sm text-gray-500">Costo de Envío</p>
                <p className="font-medium">
                  {formatearNumeroArgentino(obra.costoEnvio)}
                </p>
              </div>
            )}
            <Separator />
            <div>
              <p className="text-sm text-gray-500">Total</p>
              <p className="font-bold text-lg">
                {formatearNumeroArgentino(
                  (obra.productosTotal || productosTotal) +
                    (presupuesto?.total || 0)
                )}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Materiales de la obra */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Icon icon="heroicons:cube" className="w-5 h-5" />
            Materiales de la Obra ({obra.materialesCatalogo?.length || 0})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">Producto</th>
                  <th className="text-center py-2">Cant.</th>
                  <th className="text-center py-2">Alto</th>
                  <th className="text-center py-2">Largo</th>
                  <th className="text-center py-2">m2/ml</th>
                  <th className="text-right py-2">Valor</th>
                  <th className="text-center py-2">Desc. %</th>
                  <th className="text-right py-2">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {obra.materialesCatalogo?.map((p, index) => {
                  const unidad = String(p.unidad || "UN").toUpperCase();
                  const valor = Number(p.precio) || 0;
                  const descuento = Number(p.descuento) || 0;
                  const esMadera =
                    String(p.categoria || "").toLowerCase() === "maderas";
                  const isMachDeck =
                    esMadera &&
                    (p.subcategoria === "machimbre" ||
                      p.subcategoria === "deck");
                  const base = isMachDeck
                    ? valor
                    : valor * (Number(p.cantidad) || 0);
                  const sub = Math.round(base * (1 - descuento / 100));
                  const altoNum = Number(p.alto) || 0;
                  const largoNum = Number(p.largo) || 0;
                  const cantNum = Number(p.cantidad) || 1;
                  const medidaValor =
                    unidad === "M2"
                      ? p.m2 ?? altoNum * largoNum * cantNum
                      : unidad === "ML"
                      ? p.ml ?? largoNum * cantNum
                      : null;
                  return (
                    <tr key={index} className="border-b">
                      <td className="py-2">
                        <div>
                          <p className="font-medium">{p.nombre}</p>
                          {p.categoria && (
                            <p className="text-xs text-gray-500">
                              {p.categoria}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="py-2 text-center">{cantNum}</td>
                      <td className="py-2 text-center">
                        {esMadera ? (
                          altoNum
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="py-2 text-center">
                        {esMadera ? (
                          largoNum
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="py-2 text-center">
                        {medidaValor != null ? (
                          medidaValor.toLocaleString("es-AR")
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="py-2 text-right">
                        {formatearNumeroArgentino(valor)}
                      </td>
                      <td className="py-2 text-center">{descuento}</td>
                      <td className="py-2 text-right font-semibold">
                        {formatearNumeroArgentino(sub)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Presupuesto inicial (si existe) */}
      {presupuesto && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Icon icon="heroicons:document-text" className="w-5 h-5" />
              Presupuesto inicial ({presupuesto.numeroPedido})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2">Producto</th>
                    <th className="text-center py-2">Unidad</th>
                    <th className="text-center py-2">Cant.</th>
                    <th className="text-center py-2">Alto</th>
                    <th className="text-center py-2">Largo</th>
                    <th className="text-center py-2">m2/ml</th>
                    <th className="text-right py-2">Valor</th>
                    <th className="text-center py-2">Desc. %</th>
                    <th className="text-right py-2">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {(presupuesto.productos || []).map((p, idx) => {
                    const unidad = String(p.unidadMedida || "UN").toUpperCase();
                    const valor = Number(p.valorVenta) || 0;
                    const descuento = Number(p.descuento) || 0;
                    const precio = Number(p.precio) || 0;
                    const sub = Math.round(precio * (1 - descuento / 100));
                    const altoNum = Number(p.alto) || 0;
                    const largoNum = Number(p.largo) || 0;
                    const cantNum = Number(p.cantidad) || 1;
                    const medidaValor =
                      unidad === "M2"
                        ? p.m2 ?? altoNum * largoNum * cantNum
                        : unidad === "ML"
                        ? p.ml ?? largoNum * cantNum
                        : null;
                    return (
                      <tr key={idx} className="border-b">
                        <td className="py-2">
                          <div className="font-medium">{p.nombre}</div>
                          <div className="text-xs text-gray-500">
                            {p.categoria}
                          </div>
                        </td>
                        <td className="py-2 text-center">{unidad}</td>
                        <td className="py-2 text-center">{cantNum}</td>
                        <td className="py-2 text-center">
                          {unidad === "M2" ? (
                            altoNum
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="py-2 text-center">
                          {unidad === "M2" || unidad === "ML" ? (
                            largoNum
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="py-2 text-center">
                          {medidaValor != null ? (
                            medidaValor.toLocaleString("es-AR")
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="py-2 text-right">
                          {formatearNumeroArgentino(valor)}
                        </td>
                        <td className="py-2 text-center">{descuento}</td>
                        <td className="py-2 text-right font-semibold">
                          {formatearNumeroArgentino(sub)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Panel de edición: Documentación (links) y Cobranza básica */}
      {editando && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Documentación</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm text-gray-600">Links (URLs)</label>
                <div className="flex gap-2 mb-2">
                  <input
                    className="flex-1 border rounded px-3 py-2"
                    placeholder="https://"
                    value={linkInput}
                    onChange={(e) => setLinkInput(e.target.value)}
                  />
                  <Button
                    onClick={() => {
                      const v = linkInput.trim();
                      if (!v) return;
                      setDocLinks([...docLinks, v]);
                      setLinkInput("");
                    }}
                  >
                    Agregar
                  </Button>
                </div>
                <ul className="list-disc pl-6 text-sm">
                  {docLinks.map((u, i) => (
                    <li key={i} className="flex justify-between items-center">
                      <a
                        href={u}
                        target="_blank"
                        className="truncate max-w-[80%] text-blue-600 underline"
                      >
                        {u}
                      </a>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setDocLinks(docLinks.filter((_, idx) => idx !== i))
                        }
                      >
                        Quitar
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Cobranza</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-sm text-gray-600">Forma de pago</label>
                  <Select value={formaPago} onValueChange={setFormaPago}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Seleccione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="efectivo">Efectivo</SelectItem>
                      <SelectItem value="transferencia">
                        Transferencia
                      </SelectItem>
                      <SelectItem value="tarjeta">Tarjeta</SelectItem>
                      <SelectItem value="cheque">Cheque</SelectItem>
                      <SelectItem value="otro">Otro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm text-gray-600">Seña</label>
                  <input
                    className="w-full border rounded px-3 py-2"
                    type="number"
                    min={0}
                    value={senia}
                    onChange={(e) => setSenia(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-sm text-gray-600">Monto</label>
                  <input
                    className="w-full border rounded px-3 py-2"
                    type="number"
                    min={0}
                    value={monto}
                    onChange={(e) => setMonto(e.target.value)}
                  />
                </div>
              </div>
              <div className="border rounded-lg p-4 bg-white/70">
                <div className="font-semibold mb-2">Historial de pagos</div>
                <div className="flex flex-wrap items-end gap-2 mb-3">
                  <input
                    className="w-40 border rounded px-2 py-1"
                    type="date"
                    value={pagoDraft.fecha}
                    onChange={(e) =>
                      setPagoDraft({ ...pagoDraft, fecha: e.target.value })
                    }
                  />
                  <input
                    className="w-32 border rounded px-2 py-1"
                    type="number"
                    min={0}
                    placeholder="Monto"
                    value={pagoDraft.monto}
                    onChange={(e) =>
                      setPagoDraft({ ...pagoDraft, monto: e.target.value })
                    }
                  />
                  <Select
                    value={pagoDraft.metodo}
                    onValueChange={(v) =>
                      setPagoDraft({ ...pagoDraft, metodo: v })
                    }
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="Método" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="efectivo">Efectivo</SelectItem>
                      <SelectItem value="transferencia">
                        Transferencia
                      </SelectItem>
                      <SelectItem value="tarjeta">Tarjeta</SelectItem>
                      <SelectItem value="cheque">Cheque</SelectItem>
                      <SelectItem value="otro">Otro</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    onClick={() => {
                      if (!pagoDraft.fecha || !pagoDraft.monto) return;
                      setHistorialPagos([...historialPagos, { ...pagoDraft }]);
                      setPagoDraft({
                        fecha: "",
                        monto: "",
                        metodo: "efectivo",
                      });
                    }}
                  >
                    Agregar pago
                  </Button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2">Fecha</th>
                        <th className="text-left py-2">Método</th>
                        <th className="text-right py-2">Monto</th>
                        <th className="text-center py-2">Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historialPagos.map((p, i) => (
                        <tr key={i} className="border-b">
                          <td className="py-2">{p.fecha}</td>
                          <td className="py-2 capitalize">{p.metodo}</td>
                          <td className="py-2 text-right">
                            ${formatNumber(p.monto)}
                          </td>
                          <td className="py-2 text-center">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                setHistorialPagos(
                                  historialPagos.filter((_, idx) => idx !== i)
                                )
                              }
                            >
                              Quitar
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-primary/5 border border-primary/20 rounded-lg px-6 py-3 text-lg shadow-sm font-semibold">
                <div>
                  Presupuesto:{" "}
                  <span className="font-bold">
                    ${formatNumber(presupuesto?.total || 0)}
                  </span>
                </div>
                <div>
                  Subtotal:{" "}
                  <span className="font-bold">
                    $
                    {formatNumber(obra?.productosSubtotal || productosSubtotal)}
                  </span>
                </div>
                <div>
                  Descuentos:{" "}
                  <span className="font-bold">
                    $
                    {formatNumber(
                      obra?.productosDescuentoTotal || productosDescuentoTotal
                    )}
                  </span>
                </div>
                <div>
                  Saldo calc.:{" "}
                  <span className="font-bold text-primary">
                    $
                    {formatNumber(
                      Math.max(
                        0,
                        (obra?.productosTotal || productosTotal) +
                          (presupuesto?.total || 0) -
                          (Number(senia) || 0) -
                          (Number(monto) || 0)
                      )
                    )}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Información de envío si existe */}
      {obra.tipoEnvio && obra.tipoEnvio !== "retiro_local" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Icon icon="heroicons:truck" className="w-5 h-5" />
              Información de Envío
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-sm text-gray-500">Tipo de Envío</p>
              <p className="font-medium">{obra.tipoEnvio}</p>
            </div>
            {obra.direccionEnvio && (
              <div>
                <p className="text-sm text-gray-500">Dirección de Envío</p>
                <p className="font-medium">{obra.direccionEnvio}</p>
              </div>
            )}
            {obra.localidadEnvio && (
              <div>
                <p className="text-sm text-gray-500">Localidad</p>
                <p className="font-medium">{obra.localidadEnvio}</p>
              </div>
            )}
            {obra.transportista && (
              <div>
                <p className="text-sm text-gray-500">Transportista</p>
                <p className="font-medium">{obra.transportista}</p>
              </div>
            )}
            {obra.fechaEntrega && (
              <div>
                <p className="text-sm text-gray-500">Fecha de Entrega</p>
                <p className="font-medium">
                  {formatearFecha(obra.fechaEntrega)}
                </p>
              </div>
            )}
            {obra.rangoHorario && (
              <div>
                <p className="text-sm text-gray-500">Rango Horario</p>
                <p className="font-medium">{obra.rangoHorario}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ObraDetallePage;
