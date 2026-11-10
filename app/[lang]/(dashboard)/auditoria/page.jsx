"use client";
import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@iconify/react";
import { useAuth } from "@/provider/auth.provider";
import { useParams, useRouter } from "next/navigation";
import { Loader2, AlertCircle, CheckCircle, Trash2, Eye, Clock } from "lucide-react";

const AuditoriaPage = () => {
  const { user } = useAuth();
  const [auditoria, setAuditoria] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const router = useRouter();
  const params = useParams();
  const { lang } = params;

  useEffect(() => {
    if (user) {
      cargarAuditoria();
    }
  }, [user, filtroTipo]);

  const cargarAuditoria = async () => {
    try {
      setLoading(true);
      setError("");

      const response = await fetch(`/api/auditoria?tipo=${filtroTipo}&limit=100`);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error al cargar auditoría');
      }

      const result = await response.json();
      setAuditoria(result.data);

    } catch (error) {
      console.error('Error al cargar auditoría:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const formatearFecha = (fechaString) => {
    if (!fechaString) return "-";
    try {
      const fecha = new Date(fechaString);
      return fecha.toLocaleDateString("es-AR", {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    } catch {
      return fechaString;
    }
  };

  const obtenerIconoTipo = (tipo) => {
    switch (tipo) {
      case 'presupuestos':
        return 'heroicons:document-text';
      case 'ventas':
        return 'heroicons:shopping-cart';
      case 'pagosProveedores':
        return 'heroicons:banknotes';
      default:
        return 'heroicons:document';
    }
  };

  const tituloRegistro = (registro) => {
    switch (registro?.accion) {
      case 'ELIMINACION_PAGO_PROVEEDOR':
        return 'Movimiento de proveedor eliminado';
      case 'ELIMINACION_PAGO_MANUAL_CUENTA_PROVEEDOR':
        return 'Pago manual eliminado';
      case 'ANULACION_PAGO_PROVEEDOR':
        return 'Pago de proveedor anulado';
      case 'ELIMINACION':
        return `${registro.coleccion === 'presupuestos' ? 'Presupuesto' : registro.coleccion === 'ventas' ? 'Venta' : 'Documento'} eliminado`;
      default:
        return String(registro?.accion || 'Registro de auditoría').replaceAll('_', ' ').toLocaleLowerCase('es-AR');
    }
  };

  const formatearImporte = (value) => {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return 'N/A';
    return `$${amount.toLocaleString('es-AR', {
      minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
      maximumFractionDigits: 2,
    })}`;
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-foreground mb-2">Acceso Denegado</h2>
          <p className="text-muted-foreground">Debes iniciar sesión para ver esta página.</p>
        </div>
      </div>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-[1500px] flex-col gap-6 px-3 py-6 font-sans text-slate-900 sm:px-6 sm:py-8">
      {/* Header */}
      <header className="flex flex-col items-start justify-between gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end">
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[.18em] text-amber-700">Control · Trazabilidad</p>
          <h1 className="text-3xl font-semibold tracking-[-.04em] sm:text-4xl">Auditoría</h1>
          <p className="mt-2 text-sm text-slate-500">
            Registro de eliminaciones de presupuestos, ventas y pagos de proveedores
          </p>
        </div>
        
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <Button
            variant="outline"
            onClick={() => router.push(`/${lang}/ventas`)}
            className="h-9 rounded-md border-slate-200 px-3 text-xs"
          >
            <Icon icon="heroicons:arrow-left" className="w-4 h-4" />
            Volver
          </Button>
          
          <Button
            variant="default"
            onClick={cargarAuditoria}
            disabled={loading}
            className="h-9 rounded-md px-3 text-xs"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Icon icon="heroicons:arrow-path" className="w-4 h-4" />
            )}
            Actualizar
          </Button>
        </div>
      </header>

      {/* Filtros */}
      <section className="flex flex-col gap-3 border-b border-slate-200 pb-4" aria-label="Filtrar registros">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant={filtroTipo === "todos" ? "default" : "outline"}
                onClick={() => setFiltroTipo("todos")}
                size="sm"
              >
                <Icon icon="heroicons:document" className="w-4 h-4 mr-2" />
                Todos los documentos
              </Button>
              <Button
                variant={filtroTipo === "presupuestos" ? "default" : "outline"}
                onClick={() => setFiltroTipo("presupuestos")}
                size="sm"
              >
                <Icon icon="heroicons:document-text" className="w-4 h-4 mr-2" />
                Solo Presupuestos
              </Button>
              <Button
                variant={filtroTipo === "ventas" ? "default" : "outline"}
                onClick={() => setFiltroTipo("ventas")}
                size="sm"
              >
                <Icon icon="heroicons:shopping-cart" className="w-4 h-4 mr-2" />
                Solo Ventas
              </Button>
              <Button
                variant={filtroTipo === "pagosProveedores" ? "default" : "outline"}
                onClick={() => setFiltroTipo("pagosProveedores")}
                size="sm"
              >
                <Icon icon="heroicons:banknotes" className="w-4 h-4 mr-2" />
                Pagos de proveedores
              </Button>
            </div>
      </section>

      {/* Mensaje de error */}
      {error && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <AlertCircle className="w-5 h-5 text-red-700 dark:text-red-300" />
            <span className="font-medium">Error: {error}</span>
        </div>
      )}

      {/* Lista de auditoría */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm shadow-slate-200/40" aria-labelledby="auditoria-list-heading">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 bg-slate-50/70 px-4 py-3 sm:px-5">
            <h2 id="auditoria-list-heading" className="text-sm font-semibold text-slate-900">Registro de eliminaciones</h2>
            <span className="text-xs tabular-nums text-slate-500">{auditoria.length} registros</span>
          </div>
          <div className="px-4 sm:px-5">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="flex items-center gap-3">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  <span className="text-lg text-muted-foreground">Cargando auditoría...</span>
                </div>
              </div>
            ) : auditoria.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 mx-auto mb-4 bg-muted/50 rounded-full flex items-center justify-center">
                  <Icon icon="heroicons:clipboard-document-list" className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-medium text-foreground mb-2">
                  No hay registros de auditoría
                </h3>
                <p className="text-muted-foreground">
                  {filtroTipo === "todos" 
                    ? "No se han eliminado documentos aún"
                    : filtroTipo === "pagosProveedores"
                      ? "No se han eliminado pagos de proveedores aún"
                      : `No se han eliminado ${filtroTipo} aún`
                  }
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-200">
                {auditoria.map((registro) => (
                  <div
                    key={registro.id}
                    className="py-4 transition-colors first:pt-4 last:pb-4 hover:bg-slate-50/50"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-100 text-slate-600">
                          <Icon 
                            icon={obtenerIconoTipo(registro.coleccion)} 
                            className="w-5 h-5" 
                          />
                        </div>
                        <div>
                          <h4 className="font-semibold text-foreground">
                            {tituloRegistro(registro)}
                          </h4>
                          <p className="text-sm text-muted-foreground">
                            ID: {registro.documentoId?.slice(-8) || 'N/A'}
                          </p>
                        </div>
                      </div>
                      
                      <div className="text-right">
                        <Badge variant="destructive" className="mb-2">
                          <Trash2 className="w-3 h-3 mr-1" />
                          {registro.accion === 'ANULACION_PAGO_PROVEEDOR' ? 'Anulado' : 'Eliminado'}
                        </Badge>
                        <div className="text-xs text-muted-foreground">
                          {formatearFecha(registro.fechaEliminacion)}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div>
                        <h5 className="font-medium text-foreground mb-2 flex items-center gap-2">
                          <Icon icon="heroicons:user" className="w-4 h-4" />
                          Usuario Responsable
                        </h5>
                        <div className="space-y-1">
                          <p className="font-medium">{registro.usuarioEmail || 'N/A'}</p>
                          <p className="text-xs text-muted-foreground">ID: {registro.usuarioId || 'N/A'}</p>
                        </div>
                      </div>

                      <div>
                        <h5 className="font-medium text-foreground mb-2 flex items-center gap-2">
                          <Icon icon="heroicons:information-circle" className="w-4 h-4" />
                          Información del Documento
                        </h5>
                        <div className="space-y-1">
                          {registro.datosEliminados?.cliente?.nombre && (
                            <p className="font-medium">
                              Cliente: {registro.datosEliminados.cliente.nombre}
                            </p>
                          )}
                          {registro.datosEliminados?.total && (
                            <p className="text-green-600 font-medium">
                              Total: ${Number(registro.datosEliminados.total).toLocaleString('es-AR', { minimumFractionDigits: Number.isInteger(Number(registro.datosEliminados.total)) ? 0 : 2, maximumFractionDigits: 2 })}
                            </p>
                          )}
                          {registro.datosEliminados?.vendedor && (
                            <p className="text-xs text-muted-foreground">
                              Vendedor: {registro.datosEliminados.vendedor}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    {registro.coleccion === 'pagosProveedores' ? (
                      <div className="mt-4 border-t border-slate-200 pt-3">
                        <h5 className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
                          <Icon icon="heroicons:banknotes" className="w-4 h-4" />
                          Detalle de pago eliminado
                        </h5>
                        <div className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                          <p>
                            <span className="text-muted-foreground">Proveedor:</span>{' '}
                            <span className="font-medium uppercase">{registro.proveedorNombre || registro.datosEliminados?.movimiento?.proveedor?.nombre || 'N/A'}</span>
                          </p>
                          <p>
                            <span className="text-muted-foreground">Tipo:</span>{' '}
                            {registro.accion === 'ELIMINACION_PAGO_MANUAL_CUENTA_PROVEEDOR'
                              ? 'Pago manual'
                              : registro.datosEliminados?.movimiento?.tipo === 'pagoGlobal'
                                ? 'Pago global'
                                : 'Saldo a favor'}
                          </p>
                          <p><span className="text-muted-foreground">Importe:</span> <span className="font-semibold tabular-nums">{formatearImporte(registro.monto)}</span></p>
                          <p><span className="text-muted-foreground">Medio:</span> {registro.datosEliminados?.movimiento?.metodo || registro.datosEliminados?.pago?.metodo || 'N/A'}</p>
                          {registro.datosEliminados?.movimiento?.aplicadoACuentas != null ? (
                            <p><span className="text-muted-foreground">Aplicado a cuentas:</span> <span className="tabular-nums">{formatearImporte(registro.datosEliminados.movimiento.aplicadoACuentas)}</span></p>
                          ) : null}
                          {registro.cuentaId ? <p><span className="text-muted-foreground">Cuenta:</span> <span className="font-mono">#{String(registro.cuentaId).slice(-8)}</span></p> : null}
                          {registro.motivo ? <p className="sm:col-span-2"><span className="text-muted-foreground">Motivo:</span> {registro.motivo}</p> : null}
                        </div>
                        {Array.isArray(registro.datosEliminados?.cuentasAfectadas) && registro.datosEliminados.cuentasAfectadas.length > 0 ? (
                          <ul className="mt-3 divide-y divide-slate-200 border-y border-slate-200 text-xs">
                            {registro.datosEliminados.cuentasAfectadas.map((cuenta, index) => (
                              <li key={`${cuenta.cuentaId || 'cuenta'}-${index}`} className="flex flex-wrap justify-between gap-2 py-2">
                                <span>{cuenta.cuentaConcepto || `Cuenta #${String(cuenta.cuentaId || '').slice(-8)}`}</span>
                                <span className="tabular-nums text-slate-600">Aplicado: {formatearImporte(cuenta.montoAplicado)}</span>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    ) : null}

                                         {registro.coleccion === 'ventas' && (
                       <div className="mt-3 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                         <div className="flex items-start gap-2 text-emerald-800 dark:text-emerald-200">
                           <CheckCircle className="w-4 h-4 mt-0.5" />
                           <div className="flex flex-col gap-2 flex-1">
                             <div>
                               <span className="text-sm font-medium">
                                 Stock repuesto automáticamente para todos los productos
                               </span>
                               <span className="text-xs text-emerald-700 dark:text-emerald-300 block mt-1">
                                  Movimientos de entrada registrados en la colección &quot;Movimientos&quot;
                               </span>
                             </div>
                             
                             {/* Lista de productos repuestos */}
                             {registro.datosEliminados?.productos && (
                               <div className="bg-emerald-500/10 rounded p-2 border border-emerald-500/20">
                                 <span className="text-xs font-medium text-emerald-800 dark:text-emerald-200 mb-2 block">
                                   Productos repuestos:
                                 </span>
                                 <div className="space-y-1">
                                   {registro.datosEliminados.productos.map((prod, idx) => (
                                     <div key={idx} className="text-xs text-emerald-700 dark:text-emerald-300 flex justify-between">
                                       <span className="truncate max-w-[200px]">{prod.nombre || `Producto ${idx + 1}`}</span>
                                       <span className="font-medium">+{prod.cantidad || 0}</span>
                                     </div>
                                   ))}
                                 </div>
                               </div>
                             )}
                           </div>
                         </div>
                       </div>
                     )}

                    <div className="mt-3 pt-3 border-t border-border/60">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>IP: {registro.ip || 'N/A'}</span>
                        <span>User Agent: {registro.userAgent?.substring(0, 50) || 'N/A'}...</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
      </section>
    </main>
  );
};

export default AuditoriaPage;
