/**
 * Mappers para transformar datos de venta/presupuesto a RemitoModel
 */

import { RemitoModel, RemitoItemModel } from "./models";
import {
  buildNumeroComprobante,
  formatFechaLocal,
  calcularFechaVencimiento,
  safeText,
} from "./formatters";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - módulo JS sin tipos
import { computeLineBase, computeLineSubtotal, computeTotals } from "../../../lib/pricing";

/**
 * Mapea productos a items del remito
 */
function mapItems(productos: any[] | undefined): RemitoItemModel[] {
  if (!Array.isArray(productos) || productos.length === 0) {
    return [];
  }

  return productos.map((p) => {
    const cantidad = Number(p.cantidad) || 1;
    const nombre = safeText(p.descripcion || p.nombre, "Producto sin nombre");

    // Calcular precios usando el mismo motor de la app
    let precioUnitario = 0;
    let subtotal = 0;
    let descuento = Number(p.descuento) || 0;

    // Para productos de categoría "Eventual", calcular directamente
    if (p.categoria === "Eventual") {
      precioUnitario = Number(p.precio) || 0;
      subtotal = precioUnitario * cantidad;
    } else {
      // Para otros productos, usar computeLineSubtotal
      subtotal = computeLineSubtotal({
        precio: p.precio,
        cantidad: p.cantidad,
        descuento: p.descuento,
        subcategoria: p.subcategoria,
        subCategoria: p.subCategoria,
        nombre: p.nombre,
        descripcion: p.descripcion,
        alto: p.alto,
        ancho: p.ancho,
        largo: p.largo,
        precioPorPie: p.precioPorPie,
        unidadMedida: p.unidadMedida,
        categoria: p.categoria,
      });
      precioUnitario = cantidad > 0 ? subtotal / cantidad : subtotal;
    }

    return {
      nombre,
      cantidad,
      cepillado: p.cepilladoAplicado || false,
      precioUnitario,
      descuento,
      subtotal,
      categoria: p.categoria,
      subcategoria: p.subcategoria || p.subCategoria,
    };
  });
}

/**
 * Mapea una venta a RemitoModel
 */
export function mapVentaToRemito(venta: any): RemitoModel {
  const cliente = venta.cliente || {};
  const items = Array.isArray(venta.productos) ? venta.productos : venta.items || [];
  
  // Calcular totales usando el mismo motor
  const totalesCalculados = computeTotals(items);
  const descuentoEfectivo = venta?.pagoEnEfectivo ? totalesCalculados.subtotal * 0.1 : 0;
  const costoEnvio =
    venta.costoEnvio !== undefined && venta.costoEnvio !== "" && !isNaN(Number(venta.costoEnvio))
      ? Number(venta.costoEnvio)
      : 0;
  const totalCalculado = totalesCalculados.total + costoEnvio - descuentoEfectivo;

  // Total "oficial" de la venta: priorizar el guardado en la colección
  const totalVenta =
    typeof venta.total === "number" && !isNaN(venta.total)
      ? Number(venta.total)
      : totalCalculado;

  // Calcular pagos alineado con la pantalla de "Información de Pagos"
  const pagosArray = Array.isArray(venta.pagos) ? venta.pagos : [];
  const montoAbonado =
    pagosArray.length > 0
      ? pagosArray.reduce((sum: number, p: any) => sum + (Number(p.monto) || 0), 0)
      : Number(venta.montoAbonado || 0);
  const saldoPendiente = Math.max(0, totalVenta - montoAbonado);

  // Usar el estadoPago de la BD si existe; si no, recalcular igual que en la página de ventas
  const estadoPago = venta.estadoPago
    ? venta.estadoPago
    : (() => {
        const montoAbonadoReal =
          pagosArray.length > 0
            ? pagosArray.reduce((sum: number, p: any) => sum + (Number(p.monto) || 0), 0)
            : Number(venta.montoAbonado || 0);

        return montoAbonadoReal >= (totalVenta || 0)
          ? "pagado"
          : montoAbonadoReal > 0
          ? "parcial"
          : "pendiente";
      })();

  // Determinar envío
  const tieneEnvio = venta.tipoEnvio && venta.tipoEnvio !== "retiro_local";
  const direccionEnvio = tieneEnvio
    ? venta.usarDireccionCliente === false
      ? venta.direccionEnvio
      : cliente.direccion
    : undefined;
  const localidadEnvio = tieneEnvio
    ? venta.usarDireccionCliente === false
      ? venta.localidadEnvio
      : cliente.localidad
    : undefined;

  return {
    numero: buildNumeroComprobante(venta.numeroPedido, venta.id),
    fecha: formatFechaLocal(venta.fecha),
    tipo: "venta",
    empresa: {
      nombre: "Maderas Caballero",
      direccion: "Av. Dr. Honorio Pueyrredón 4625, Villa Rosa, Buenos Aires",
      telefono: "11-3497-6239",
      web: "www.caballeromaderas.com",
      logoUrl: "/logo-maderera.png",
    },
    cliente: {
      nombre: safeText(cliente.nombre, "Consumidor Final"),
      cuit: cliente.cuit,
      direccion: cliente.direccion,
      telefono: cliente.telefono,
      email: cliente.email,
      partido: cliente.partido,
      barrio: cliente.barrio,
      localidad: cliente.localidad,
    },
    envio: tieneEnvio
      ? {
          tipoEnvio: venta.tipoEnvio,
          direccion: direccionEnvio,
          localidad: localidadEnvio,
          fechaEntrega: venta.fechaEntrega ? formatFechaLocal(venta.fechaEntrega) : undefined,
          rangoHorario: venta.rangoHorario,
          costoEnvio: costoEnvio > 0 ? costoEnvio : undefined,
        }
      : undefined,
    items: mapItems(items),
    totales: {
      subtotal: totalesCalculados.subtotal,
      descuentoTotal: totalesCalculados.descuentoTotal,
      descuentoEfectivo: descuentoEfectivo > 0 ? descuentoEfectivo : undefined,
      costoEnvio: costoEnvio > 0 ? costoEnvio : 0,
      total: totalVenta,
    },
    pagos: {
      total: totalVenta,
      montoAbonado,
      saldoPendiente,
      estadoPago,
      pagos: pagosArray.map((p: any) => ({
        fecha: formatFechaLocal(p.fecha),
        metodo: p.metodo || "-",
        monto: Number(p.monto) || 0,
      })),
    },
    observaciones: venta.observaciones,
    formaPago: venta.formaPago,
    vendedor: venta.vendedor,
  };
}

/**
 * Mapea un presupuesto a RemitoModel
 */
export function mapPresupuestoToRemito(presupuesto: any): RemitoModel {
  const cliente = presupuesto.cliente || {};
  const items = Array.isArray(presupuesto.productos) ? presupuesto.productos : [];

  // Calcular totales
  const totalesCalculados = computeTotals(items);
  const costoEnvio =
    presupuesto.costoEnvio !== undefined &&
    presupuesto.costoEnvio !== "" &&
    !isNaN(Number(presupuesto.costoEnvio))
      ? Number(presupuesto.costoEnvio)
      : 0;
  const totalFinal = totalesCalculados.total + costoEnvio;

  // Determinar envío
  const tieneEnvio = presupuesto.tipoEnvio && presupuesto.tipoEnvio !== "retiro_local";
  const direccionEnvio = tieneEnvio
    ? presupuesto.usarDireccionCliente === false
      ? presupuesto.direccionEnvio
      : cliente.direccion
    : undefined;
  const localidadEnvio = tieneEnvio
    ? presupuesto.usarDireccionCliente === false
      ? presupuesto.localidadEnvio
      : cliente.localidad
    : undefined;

  return {
    numero: buildNumeroComprobante(presupuesto.numeroPedido, presupuesto.id),
    fecha: formatFechaLocal(presupuesto.fecha),
    tipo: "presupuesto",
    fechaVencimiento: presupuesto.fecha
      ? formatFechaLocal(calcularFechaVencimiento(presupuesto.fecha))
      : undefined,
    empresa: {
      nombre: "Maderas Caballero",
      direccion: "Av. Dr. Honorio Pueyrredón 4625, Villa Rosa, Buenos Aires",
      telefono: "11-3497-6239",
      web: "www.caballeromaderas.com",
      logoUrl: "/logo-maderera.png",
    },
    cliente: {
      nombre: safeText(cliente.nombre, "Consumidor Final"),
      cuit: cliente.cuit,
      direccion: cliente.direccion,
      telefono: cliente.telefono,
      email: cliente.email,
      partido: cliente.partido,
      barrio: cliente.barrio,
      localidad: cliente.localidad,
    },
    envio: tieneEnvio
      ? {
          tipoEnvio: presupuesto.tipoEnvio,
          direccion: direccionEnvio,
          localidad: localidadEnvio,
          fechaEntrega: presupuesto.fechaEntrega
            ? formatFechaLocal(presupuesto.fechaEntrega)
            : undefined,
          rangoHorario: presupuesto.rangoHorario,
          costoEnvio: costoEnvio > 0 ? costoEnvio : undefined,
        }
      : undefined,
    items: mapItems(items),
    totales: {
      subtotal: totalesCalculados.subtotal,
      descuentoTotal: totalesCalculados.descuentoTotal,
      costoEnvio: costoEnvio > 0 ? costoEnvio : 0,
      total: totalFinal,
    },
    observaciones: presupuesto.observaciones,
    formaPago: presupuesto.formaPago,
    vendedor: presupuesto.vendedor,
  };
}
