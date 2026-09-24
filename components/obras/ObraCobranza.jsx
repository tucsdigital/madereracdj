"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@iconify/react";
import { Plus, Trash2, AlertCircle, CheckCircle } from "lucide-react";

const numeroSeguro = (valor) => {
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : 0;
};

const ObraCobranza = ({
  movimientos = [],
  onMovimientosChange,
  editando,
  formatearNumeroArgentino,
  totalObra = 0,
  resumenFinanciero = null,
  onEstadoPagoChange,
}) => {
  const [nuevoMovimiento, setNuevoMovimiento] = useState({
    fecha: "",
    tipo: "pago",
    metodo: "efectivo",
    monto: "",
    nota: "",
  });

  const [error, setError] = useState("");

  // Todos estos tipos representan dinero efectivamente recibido.
  const totalCobrado = useMemo(
    () =>
      (Array.isArray(movimientos) ? movimientos : []).reduce((acc, movimiento) => {
        const tipo = String(movimiento?.tipo || "").toLowerCase();
        if (["pago", "seña", "senia", "anticipo"].includes(tipo)) {
          return acc + Math.max(0, numeroSeguro(movimiento?.monto));
        }
        return acc;
      }, 0),
    [movimientos]
  );

  const financiero = useMemo(() => {
    const resumen = resumenFinanciero || {};

    const subtotal = Math.max(0, numeroSeguro(resumen.subtotal));
    const descuentoProductos = Math.max(
      0,
      numeroSeguro(resumen.descuentoTotal ?? resumen.descuento)
    );
    const descuentoEfectivo = Math.max(
      0,
      numeroSeguro(resumen.descuentoEfectivo)
    );

    const baseCalculada = Math.max(
      0,
      subtotal - descuentoProductos - descuentoEfectivo
    );

    const baseImponible =
      numeroSeguro(resumen.baseImponible) > 0
        ? numeroSeguro(resumen.baseImponible)
        : baseCalculada;

    const aplicarIva =
      resumen.aplicarIva === true ||
      resumen.aplicaIva === true ||
      numeroSeguro(resumen.ivaMonto) > 0;

    const ivaPorcentaje = Math.max(
      0,
      numeroSeguro(resumen.ivaPorcentaje)
    );

    const ivaMonto = aplicarIva
      ? Math.max(
          0,
          numeroSeguro(resumen.ivaMonto) ||
            Math.round(baseImponible * (ivaPorcentaje / 100))
        )
      : 0;

    const aplicarTransferencia =
      resumen.aplicarTransferencia === true ||
      resumen.aplicaTransferencia === true ||
      numeroSeguro(resumen.transferenciaMonto) > 0;

    const transferenciaPorcentaje = Math.max(
      0,
      numeroSeguro(resumen.transferenciaPorcentaje)
    );

    const transferenciaMonto = aplicarTransferencia
      ? Math.max(
          0,
          numeroSeguro(resumen.transferenciaMonto) ||
            Math.round(baseImponible * (transferenciaPorcentaje / 100))
        )
      : 0;

    const totalCalculado = Math.round(
      baseImponible + ivaMonto + transferenciaMonto
    );

    const total =
      numeroSeguro(resumen.total) > 0
        ? numeroSeguro(resumen.total)
        : numeroSeguro(totalObra) > 0
          ? numeroSeguro(totalObra)
          : totalCalculado;

    return {
      subtotal,
      descuentoProductos,
      descuentoEfectivo,
      baseImponible,
      aplicarIva,
      ivaPorcentaje,
      ivaMonto,
      aplicarTransferencia,
      transferenciaPorcentaje,
      transferenciaMonto,
      total: Math.max(0, Math.round(total)),
    };
  }, [resumenFinanciero, totalObra]);

  const saldoPendiente = Math.max(0, financiero.total - totalCobrado);
  const estaPagado = financiero.total > 0 && saldoPendiente === 0;

  const validarPago = (monto) => {
    const montoNum = Number(monto) || 0;

    if (montoNum <= 0) {
      setError("El monto debe ser mayor a 0");
      return false;
    }

    if (montoNum > saldoPendiente) {
      setError(
        `El pago excede el saldo pendiente de ${formatearNumeroArgentino(
          saldoPendiente
        )}`
      );
      return false;
    }

    setError("");
    return true;
  };

  useEffect(() => {
    if (nuevoMovimiento.monto) {
      validarPago(nuevoMovimiento.monto);
    } else {
      setError("");
    }
    // validarPago depende únicamente del saldo y del valor actual.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nuevoMovimiento.monto, saldoPendiente]);

  useEffect(() => {
    if (onEstadoPagoChange) {
      onEstadoPagoChange(estaPagado);
    }
  }, [estaPagado, onEstadoPagoChange]);

  const handleAgregarMovimiento = () => {
    if (!nuevoMovimiento.fecha || !nuevoMovimiento.monto) return;
    if (!validarPago(nuevoMovimiento.monto)) return;

    const movimiento = {
      ...nuevoMovimiento,
      monto: Number(nuevoMovimiento.monto),
      id: Date.now(),
      timestamp: new Date().toISOString(),
    };

    onMovimientosChange([...(movimientos || []), movimiento]);
    setNuevoMovimiento({
      fecha: "",
      tipo: "pago",
      metodo: "efectivo",
      monto: "",
      nota: "",
    });
    setError("");
  };

  const handleEliminarMovimiento = (id) => {
    onMovimientosChange((movimientos || []).filter((m) => m.id !== id));
  };

  const formatearFecha = (fecha) => {
    if (!fecha) return "";
    try {
      return new Date(fecha).toLocaleDateString("es-AR");
    } catch {
      return fecha;
    }
  };

  const tieneAjustes =
    financiero.descuentoProductos > 0 ||
    financiero.descuentoEfectivo > 0 ||
    financiero.aplicarIva ||
    financiero.aplicarTransferencia;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon icon="heroicons:banknotes" className="h-5 w-5" />
          Cobranza y Movimientos
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Resumen principal */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-blue-700">
              Total obra
            </p>
            <p className="text-lg font-bold text-blue-800">
              {formatearNumeroArgentino(financiero.total)}
            </p>
          </div>

          <div className="rounded-lg border border-green-200 bg-green-50 p-3">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-green-700">
              Total abonado
            </p>
            <p className="text-lg font-bold text-green-800">
              {formatearNumeroArgentino(totalCobrado)}
            </p>
          </div>

          <div className="rounded-lg border border-orange-200 bg-orange-50 p-3">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-orange-700">
              Saldo pendiente
            </p>
            <p className="text-lg font-bold text-orange-800">
              {formatearNumeroArgentino(saldoPendiente)}
            </p>
          </div>
        </div>

        {/* Desglose financiero real de la obra */}
        {(financiero.subtotal > 0 || tieneAjustes) && (
          <div className="overflow-hidden rounded-xl border border-border/60 bg-background">
            <div className="border-b border-border/60 bg-muted/20 px-4 py-3">
              <p className="text-sm font-semibold text-foreground">
                Composición del total
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Este desglose es el utilizado para calcular el saldo de la obra.
              </p>
            </div>

            <div className="space-y-2 px-4 py-3 text-sm">
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-medium tabular-nums">
                  {formatearNumeroArgentino(financiero.subtotal)}
                </span>
              </div>

              {financiero.descuentoProductos > 0 && (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">
                    Descuentos de productos
                  </span>
                  <span className="font-medium tabular-nums text-emerald-700">
                    -{formatearNumeroArgentino(financiero.descuentoProductos)}
                  </span>
                </div>
              )}

              {financiero.descuentoEfectivo > 0 && (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">
                    Descuento por efectivo
                  </span>
                  <span className="font-medium tabular-nums text-emerald-700">
                    -{formatearNumeroArgentino(financiero.descuentoEfectivo)}
                  </span>
                </div>
              )}

              {(financiero.descuentoProductos > 0 ||
                financiero.descuentoEfectivo > 0) && (
                <div className="flex items-center justify-between gap-4 border-t border-border/50 pt-2">
                  <span className="text-muted-foreground">Base</span>
                  <span className="font-medium tabular-nums">
                    {formatearNumeroArgentino(financiero.baseImponible)}
                  </span>
                </div>
              )}

              {financiero.aplicarIva && (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">
                    IVA
                    {financiero.ivaPorcentaje > 0
                      ? ` (${financiero.ivaPorcentaje}%)`
                      : ""}
                  </span>
                  <span className="font-medium tabular-nums">
                    +{formatearNumeroArgentino(financiero.ivaMonto)}
                  </span>
                </div>
              )}

              {financiero.aplicarTransferencia && (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">
                    Recargo transferencia
                    {financiero.transferenciaPorcentaje > 0
                      ? ` (${financiero.transferenciaPorcentaje}%)`
                      : ""}
                  </span>
                  <span className="font-medium tabular-nums">
                    +{formatearNumeroArgentino(
                      financiero.transferenciaMonto
                    )}
                  </span>
                </div>
              )}

              <div className="mt-2 flex items-center justify-between gap-4 border-t border-border pt-3">
                <span className="font-semibold text-foreground">
                  Total final
                </span>
                <span className="text-base font-bold tabular-nums text-foreground">
                  {formatearNumeroArgentino(financiero.total)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Formulario de nuevo pago */}
        {editando && saldoPendiente > 0 && (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <h4 className="mb-3 font-medium text-gray-900">
              Agregar Nuevo Pago
            </h4>

            <div className="grid grid-cols-1 items-end gap-2 md:grid-cols-5">
              <DateInput
                value={nuevoMovimiento.fecha}
                onChange={(v) =>
                  setNuevoMovimiento((prev) => ({ ...prev, fecha: v }))
                }
                buttonClassName="h-10 w-full justify-start"
              />

              <Select
                value={nuevoMovimiento.tipo}
                onValueChange={(value) =>
                  setNuevoMovimiento((prev) => ({ ...prev, tipo: value }))
                }
              >
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pago">Pago</SelectItem>
                  <SelectItem value="seña">Seña</SelectItem>
                  <SelectItem value="anticipo">Anticipo</SelectItem>
                </SelectContent>
              </Select>

              <Select
                value={nuevoMovimiento.metodo}
                onValueChange={(value) =>
                  setNuevoMovimiento((prev) => ({ ...prev, metodo: value }))
                }
              >
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="efectivo">Efectivo</SelectItem>
                  <SelectItem value="transferencia">Transferencia</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                  <SelectItem value="tarjeta">Tarjeta</SelectItem>
                </SelectContent>
              </Select>

              <div className="relative">
                <Input
                  type="number"
                  value={nuevoMovimiento.monto}
                  onChange={(e) =>
                    setNuevoMovimiento((prev) => ({
                      ...prev,
                      monto: e.target.value,
                    }))
                  }
                  placeholder="Monto"
                  className={`h-10 pr-8 ${
                    error ? "border-red-500 focus:border-red-500" : ""
                  }`}
                  max={saldoPendiente}
                  step="100"
                />
                {error && (
                  <div className="absolute -bottom-6 left-0 text-xs text-red-600">
                    {error}
                  </div>
                )}
              </div>

              <Button
                onClick={handleAgregarMovimiento}
                disabled={
                  !nuevoMovimiento.fecha ||
                  !nuevoMovimiento.monto ||
                  !!error
                }
                className="flex h-10 items-center gap-2"
              >
                <Plus className="h-4 w-4" />
                Agregar
              </Button>
            </div>

            <div className="mt-3 text-xs text-gray-600">
              <p>
                Saldo pendiente:{" "}
                <strong>
                  {formatearNumeroArgentino(saldoPendiente)}
                </strong>
              </p>
              <p>El pago no puede exceder este monto.</p>
            </div>
          </div>
        )}

        {estaPagado ? (
          <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-center">
            <CheckCircle className="mx-auto mb-2 h-8 w-8 text-green-600" />
            <p className="font-medium text-green-800">
              ¡Obra Completamente Pagada!
            </p>
            <p className="text-sm text-green-700">
              No se pueden agregar más pagos
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-orange-200 bg-orange-50 p-4 text-center">
            <AlertCircle className="mx-auto mb-2 h-8 w-8 text-orange-600" />
            <p className="font-medium text-orange-800">
              Obra Pendiente de Pago
            </p>
            <p className="text-sm text-orange-700">
              Saldo pendiente:{" "}
              <strong>{formatearNumeroArgentino(saldoPendiente)}</strong>
            </p>
          </div>
        )}

        {movimientos.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="p-3 text-left font-medium text-gray-700">
                    Fecha
                  </th>
                  <th className="p-3 text-center font-medium text-gray-700">
                    Tipo
                  </th>
                  <th className="p-3 text-center font-medium text-gray-700">
                    Método
                  </th>
                  <th className="p-3 text-right font-medium text-gray-700">
                    Monto
                  </th>
                  <th className="p-3 text-left font-medium text-gray-700">
                    Nota
                  </th>
                  {editando && (
                    <th className="p-3 text-center font-medium text-gray-700">
                      Acción
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {movimientos.map((movimiento) => (
                  <tr
                    key={movimiento.id}
                    className="border-b hover:bg-gray-50"
                  >
                    <td className="p-3">
                      {formatearFecha(movimiento.fecha)}
                    </td>
                    <td className="p-3 text-center">
                      <Badge
                        variant="outline"
                        className={`px-2 py-1 text-xs ${
                          movimiento.tipo === "seña"
                            ? "border-yellow-300 bg-yellow-50 text-yellow-700"
                            : movimiento.tipo === "pago"
                              ? "border-green-300 bg-green-50 text-green-700"
                              : "border-blue-300 bg-blue-50 text-blue-700"
                        }`}
                      >
                        {movimiento.tipo}
                      </Badge>
                    </td>
                    <td className="p-3 text-center capitalize">
                      {movimiento.metodo}
                    </td>
                    <td className="p-3 text-right font-semibold text-gray-900">
                      {formatearNumeroArgentino(movimiento.monto)}
                    </td>
                    <td className="p-3 text-gray-600">
                      {movimiento.nota || "-"}
                    </td>
                    {editando && (
                      <td className="p-3 text-center">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            handleEliminarMovimiento(movimiento.id)
                          }
                          className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {movimientos.length === 0 && (
          <div className="p-8 text-center text-gray-500">
            <Icon
              icon="heroicons:banknotes"
              className="mx-auto mb-3 h-12 w-12 text-gray-300"
            />
            <p>No hay movimientos de cobranza registrados</p>
            <p className="text-sm">
              Agrega el primer pago cuando el cliente realice un abono
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ObraCobranza;
