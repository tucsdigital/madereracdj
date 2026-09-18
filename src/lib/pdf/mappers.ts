/**
 * Mappers para transformar datos de venta/presupuesto a RemitoModel
 */

import { RemitoModel, RemitoItemModel } from "./models";
import {
  buildNumeroComprobante,
  formatFechaLocal,
  formatFechaLocalConDia,
  calcularFechaVencimiento,
  safeText,
} from "./formatters";
// @ts-ignore - módulo JS sin tipos
import {
  computeLineBase,
  computeLineSubtotal,
  computeTotals,
  computeQuantityDisplay,
} from "../../../lib/pricing";

function buildMapsUrlFallback({
  explicitMapsUrl,
  lat,
  lng,
  direccion,
  localidad,
}: {
  explicitMapsUrl?: string;
  lat?: number | string | null;
  lng?: number | string | null;
  direccion?: string;
  localidad?: string;
}): string | undefined {
  const mapsUrl = String(explicitMapsUrl || "").trim();
  if (mapsUrl) return mapsUrl;

  const latNum = Number(lat);
  const lngNum = Number(lng);
  if (Number.isFinite(latNum) && Number.isFinite(lngNum)) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${latNum},${lngNum}`)}`;
  }

  const addressText = [String(direccion || "").trim(), String(localidad || "").trim()]
    .filter(Boolean)
    .join(", ");

  if (!addressText) return undefined;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressText)}`;
}

/**
 * Mapea productos a items del remito
 */
function mapItems(productos: any[] | undefined): RemitoItemModel[] {
  if (!Array.isArray(productos) || productos.length === 0) {
    return [];
  }

  return productos.map((p) => {
    const cantidad = Math.max(1, Math.ceil(Number(p.cantidad) || 1));
    const nombre = safeText(p.nombre || p.descripcion, "Producto sin nombre");
    const detalle = safeText(p.detalle || p.descripcion, "");

    // Calcular precios usando el mismo motor de la app
    let precioUnitario = 0;
    let subtotal = 0;
    let descuento = Number(p.descuento) || 0;

    // Para productos de categoría "Eventual", calcular directamente
    if (p.categoria === "Eventual") {
      precioUnitario = Number(p.precio) || 0;
      subtotal = precioUnitario * cantidad;
    } else {
      const base = computeLineBase({
        precio: p.precio,
        cantidad,
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
        unidad: p.unidad,
        categoria: p.categoria,
        precioIncluyeCantidad: p.precioIncluyeCantidad,
      });
      precioUnitario = cantidad > 0 ? base / cantidad : base;
      subtotal = computeLineSubtotal({
        precio: p.precio,
        cantidad,
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
        unidad: p.unidad,
        categoria: p.categoria,
        precioIncluyeCantidad: p.precioIncluyeCantidad,
      });
    }

    const measure = computeQuantityDisplay({ ...p, cantidad });
    const medidaUnidad = String(measure?.unit || "");
    const medidaValor = Number(measure?.value);
    const shouldShowMeasure =
      Number.isFinite(medidaValor) &&
      (medidaUnidad === "m²" || medidaUnidad === "m³" || medidaUnidad === "ml");

    return {
      nombre,
      detalle: detalle || undefined,
      cantidad,
      medidaValor: shouldShowMeasure ? medidaValor : undefined,
      medidaUnidad: shouldShowMeasure ? medidaUnidad : undefined,
      cepillado: p.cepilladoAplicado || false,
      cepilladoPorcentaje: p.cepilladoAplicado
        ? Math.max(0, Number(p.cepilladoPorcentaje ?? 6) || 6)
        : undefined,
      calibrado: p.calibradoAplicado || false,
      calibradoPorcentaje: p.calibradoAplicado
        ? Math.max(0, Number(p.calibradoPorcentaje ?? 3) || 3)
        : undefined,
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
  const baseImponibleVenta = Math.max(0, totalesCalculados.total - descuentoEfectivo);
  const aplicaIvaVenta = venta?.aplicaIva === true || venta?.aplicarIva === true;
  const ivaPorcentaje = Math.max(0, Number(venta?.ivaPorcentaje) || 21);
  const ivaMonto = !aplicaIvaVenta
    ? 0
    : Math.round(Number(venta?.ivaMonto) || baseImponibleVenta * (ivaPorcentaje / 100));
  const aplicaTransfVenta = venta?.aplicaTransferencia === true || venta?.aplicarTransferencia === true;
  const transferenciaPorcentaje = Math.max(0, Number(venta?.transferenciaPorcentaje) || 10);
  const transferenciaMonto = !aplicaTransfVenta
    ? 0
    : Math.round(Number(venta?.transferenciaMonto) || baseImponibleVenta * (transferenciaPorcentaje / 100));
  const totalCalculado = Math.round(baseImponibleVenta + costoEnvio + ivaMonto + transferenciaMonto);

  // Total "oficial" de la venta: priorizar el guardado en la colección
  const totalVenta =
    typeof venta.total === "number" && !isNaN(venta.total) && Number(venta.total) > 0
      ? Math.round(Number(venta.total))
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
  const tieneTipoEnvio = Boolean(venta.tipoEnvio);
  const tieneEnvioDomicilio = venta.tipoEnvio && venta.tipoEnvio !== "retiro_local";
  const direccionEnvio = tieneEnvioDomicilio
    ? venta.usarDireccionCliente === false
      ? venta.direccionEnvio
      : cliente.direccion
    : undefined;
  const localidadEnvio = tieneEnvioDomicilio
    ? venta.usarDireccionCliente === false
      ? venta.localidadEnvio
      : cliente.localidad
    : undefined;
  const mapsUrlEnvio = tieneEnvioDomicilio
    ? buildMapsUrlFallback({
        explicitMapsUrl: venta.direccionMapsUrl || venta.cliente?.mapsUrl,
        lat: venta.direccionLat ?? venta.cliente?.lat,
        lng: venta.direccionLng ?? venta.cliente?.lng,
        direccion: direccionEnvio,
        localidad: localidadEnvio,
      })
    : undefined;

  return {
    numero: buildNumeroComprobante(venta.numeroPedido, venta.id),
    fecha: formatFechaLocal(venta.fecha),
    tipo: "venta",
    empresa: {
      nombre: "Maderas Caballero",
      direccion: "Av. Dr. Honorio Pueyrredón 4625, Villa Rosa, Buenos Aires",
      telefono: "1178971517",
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
    envio: tieneTipoEnvio
      ? {
          tipoEnvio: venta.tipoEnvio,
          direccion: direccionEnvio,
          localidad: localidadEnvio,
          fechaEntrega: venta.fechaEntrega ? formatFechaLocalConDia(venta.fechaEntrega) : undefined,
          rangoHorario: venta.rangoHorario,
          costoEnvio: costoEnvio > 0 ? costoEnvio : undefined,
          mapsUrl: mapsUrlEnvio,
        }
      : undefined,
    items: mapItems(items),
    totales: {
      subtotal: totalesCalculados.subtotal,
      descuentoTotal: totalesCalculados.descuentoTotal,
      descuentoEfectivo: descuentoEfectivo > 0 ? descuentoEfectivo : undefined,
      costoEnvio: costoEnvio > 0 ? costoEnvio : 0,
      ivaPorcentaje: ivaMonto > 0 ? ivaPorcentaje : undefined,
      ivaMonto: ivaMonto > 0 ? ivaMonto : undefined,
      transferenciaPorcentaje: transferenciaMonto > 0 ? transferenciaPorcentaje : undefined,
      transferenciaMonto: transferenciaMonto > 0 ? transferenciaMonto : undefined,
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
 * Resumen de impuestos para el remito/boleta: usa montos guardados cuando
 * existen, y si no los recalcula sobre la base. Devuelve también los flags
 * efectivos para que la impresión nunca oculte impuestos activos.
 */
export function calcularImpuestosRemito(doc: any, baseImponible: number) {
  const base = Math.max(0, Math.round(Number(baseImponible) || 0));
  const aplicaIva = doc?.aplicaIva === true || doc?.aplicarIva === true;
  const ivaPorcentaje = Math.max(0, Number(doc?.ivaPorcentaje) || 0);
  const ivaGuardado = Math.max(0, Math.round(Number(doc?.ivaMonto) || 0));
  const ivaMonto = !aplicaIva
    ? 0
    : ivaGuardado > 0
      ? ivaGuardado
      : Math.round(base * (ivaPorcentaje / 100));
  const aplicaTransferencia = doc?.aplicaTransferencia === true || doc?.aplicarTransferencia === true;
  const transferenciaPorcentaje = Math.max(0, Number(doc?.transferenciaPorcentaje) || 0);
  const transfGuardado = Math.max(0, Math.round(Number(doc?.transferenciaMonto) || 0));
  const transferenciaMonto = !aplicaTransferencia
    ? 0
    : transfGuardado > 0
      ? transfGuardado
      : Math.round(base * (transferenciaPorcentaje / 100));
  return {
    aplicaIva,
    ivaPorcentaje,
    ivaMonto,
    aplicaTransferencia,
    transferenciaPorcentaje,
    transferenciaMonto,
    mostrarIva: aplicaIva && (ivaMonto > 0 || ivaPorcentaje > 0),
    mostrarTransferencia: aplicaTransferencia && (transferenciaMonto > 0 || transferenciaPorcentaje > 0),
  };
}

/**
 * Mapea una obra (tipo "obra" o "presupuesto" de la colección obras) a RemitoModel.
 * Se usa para la boleta/remito de impresión de obras.
 */
export function mapObraToRemito(obra: any, presupuestoInicial?: any): RemitoModel {
  const fuente = obra || {};
  const presupuesto = presupuestoInicial || null;
  const cliente = fuente.cliente || presupuesto?.cliente || {};

  const bloques = Array.isArray((fuente as any)?.bloques) ? (fuente as any).bloques : [];
  const bloquesConItems = bloques.filter((b: any) => Array.isArray(b?.productos) && b.productos.length > 0);
  const materiales = Array.isArray((fuente as any)?.materialesCatalogo) ? (fuente as any).materialesCatalogo : [];
  const productosSueltos = Array.isArray((fuente as any)?.productos) ? (fuente as any).productos : [];
  const productosPresupuesto = Array.isArray(presupuesto?.productos) ? presupuesto.productos : [];

  const items =
    bloquesConItems.length > 0
      ? bloquesConItems.flatMap((b: any) => (Array.isArray(b?.productos) ? b.productos : []))
      : productosSueltos.length > 0
        ? productosSueltos
        : materiales.length > 0
          ? materiales
          : productosPresupuesto;

  const impuestosDePresupuesto =
    fuente?.tipo === "obra" &&
    !(fuente?.aplicarIva === true || fuente?.aplicaIva === true) &&
    !(fuente?.aplicarTransferencia === true || fuente?.aplicaTransferencia === true) &&
    (presupuesto?.aplicarIva === true || presupuesto?.aplicaIva === true ||
      presupuesto?.aplicarTransferencia === true || presupuesto?.aplicaTransferencia === true);
  const fuenteImpuestos = impuestosDePresupuesto ? { ...presupuesto } : fuente;

  const totalesCalculados = computeTotals(items);
  const subtotalBase = Number.isFinite(Number(fuente?.subtotal)) && Number(fuente.subtotal) > 0
    ? Math.round(Number(fuente.subtotal))
    : totalesCalculados.subtotal;
  const descuentoBase = Number.isFinite(Number(fuente?.descuentoTotal)) && Number(fuente.descuentoTotal) >= 0
    ? Math.round(Number(fuente.descuentoTotal))
    : totalesCalculados.descuentoTotal;
  const descuentoEfectivo = fuente?.pagoEnEfectivo
    ? Math.round(subtotalBase * 0.1)
    : Math.max(0, Math.round(Number(fuente?.descuentoEfectivo) || 0));
  const baseImponible = Math.max(0, Math.round(subtotalBase - descuentoBase - descuentoEfectivo));
  const impuestosObra = calcularImpuestosRemito(fuenteImpuestos, baseImponible);
  const aplicaIva = impuestosObra.aplicaIva;
  const ivaPorcentaje = impuestosObra.ivaPorcentaje;
  const ivaMonto = impuestosObra.ivaMonto;
  const aplicaTransferencia = impuestosObra.aplicaTransferencia;
  const transferenciaPorcentaje = impuestosObra.transferenciaPorcentaje;
  const transferenciaMonto = impuestosObra.transferenciaMonto;
  const mostrarIvaObra = impuestosObra.mostrarIva;
  const mostrarTransfObra = impuestosObra.mostrarTransferencia;
  const totalCalculadoFinal = Math.round(baseImponible + ivaMonto + transferenciaMonto);
  const totalGuardado = Number(fuente?.total);
  const totalRemito = Number.isFinite(totalGuardado) && totalGuardado > 0
    ? (Math.abs(totalGuardado - baseImponible) < Math.max(1, totalCalculadoFinal * 0.001) && (ivaMonto > 0 || transferenciaMonto > 0)
        ? Math.round(totalGuardado + ivaMonto + transferenciaMonto)
        : Math.round(totalGuardado))
    : totalCalculadoFinal;

  const numeroPedido = fuente?.numeroPedido || presupuesto?.numeroPedido || fuente?.id || "OBRA";

  return {
    numero: buildNumeroComprobante(numeroPedido, fuente?.id),
    fecha: formatFechaLocal(fuente?.fecha),
    tipo: "presupuesto",
    empresa: {
      nombre: "Maderas Caballero",
      direccion: "Av. Dr. Honorio Pueyrredón 4625, Villa Rosa, Buenos Aires",
      telefono: "1178971517",
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
    envio: undefined,
    items: mapItems(items),
    totales: {
      subtotal: Math.round(subtotalBase),
      descuentoTotal: Math.round(descuentoBase),
      descuentoEfectivo: descuentoEfectivo > 0 ? Math.round(descuentoEfectivo) : undefined,
      costoEnvio: 0,
      ivaPorcentaje: mostrarIvaObra ? ivaPorcentaje : undefined,
      ivaMonto: mostrarIvaObra ? ivaMonto : undefined,
      transferenciaPorcentaje: mostrarTransfObra ? transferenciaPorcentaje : undefined,
      transferenciaMonto: mostrarTransfObra ? transferenciaMonto : undefined,
      total: totalRemito,
    },
    observaciones: fuente?.observaciones || presupuesto?.observaciones,
    formaPago: fuente?.formaPago || presupuesto?.formaPago,
    vendedor: fuente?.vendedor || presupuesto?.vendedor,
  };
}

/**
 * Mapea un presupuesto a RemitoModel
 */
export function mapPresupuestoToRemito(presupuesto: any): RemitoModel {
  const cliente = presupuesto.cliente || {};
  const bloques = Array.isArray((presupuesto as any)?.bloques) ? (presupuesto as any).bloques : [];
  const bloquesConItems = bloques.filter((b: any) => Array.isArray(b?.productos) && b.productos.length > 0);
  // Las obras/presupuestos pueden venir con bloques (cada línea trae precio y
  // descuento). Los items del remito se arman desde los bloques cuando existen.
  const items = bloquesConItems.length > 0
    ? bloquesConItems.flatMap((b: any) => (Array.isArray(b?.productos) ? b.productos : []))
    : (Array.isArray(presupuesto.productos) ? presupuesto.productos : []);

  // Los bloques guardan precio y descuento por línea:
  // subtotal = suma de precios, descuentoTotal = suma de precio*descuento%.
  const sumarBloques = (listaBloques: any[]) => {
    let subtotal = 0;
    let descuentoTotal = 0;
    for (const b of listaBloques) {
      if (!Array.isArray((b as any)?.productos) || (b as any).productos.length === 0) continue;
      for (const p of (b as any).productos) {
        const precio = Number((p as any)?.precio) || 0;
        const desc = Number((p as any)?.descuento) || 0;
        subtotal += precio;
        descuentoTotal += Math.round((precio * desc) / 100);
      }
    }
    return { subtotal: Math.round(subtotal), descuentoTotal: Math.round(descuentoTotal) };
  };
  const totalesPorBloques = bloquesConItems.length > 0 ? sumarBloques(bloquesConItems) : null;
  const totalesCalculados = computeTotals(items);
  const subtotalBase = totalesPorBloques ? totalesPorBloques.subtotal : totalesCalculados.subtotal;
  const descuentoBase = totalesPorBloques ? totalesPorBloques.descuentoTotal : totalesCalculados.descuentoTotal;
  const descuentoEfectivo =
    presupuesto?.pagoEnEfectivo ? Math.round(subtotalBase * 0.1) : Math.max(0, Math.round(Number(presupuesto?.descuentoEfectivo) || 0));
  const costoEnvio =
    presupuesto.costoEnvio !== undefined &&
    presupuesto.costoEnvio !== "" &&
    !isNaN(Number(presupuesto.costoEnvio))
      ? Number(presupuesto.costoEnvio)
      : 0;
  const baseImponible = Math.max(0, Math.round(subtotalBase - descuentoBase - descuentoEfectivo));
  const impuestos = calcularImpuestosRemito(presupuesto, baseImponible);
  const aplicaIva = impuestos.aplicaIva;
  const ivaPorcentaje = impuestos.ivaPorcentaje;
  const ivaMonto = impuestos.ivaMonto;
  const aplicaTransferencia = impuestos.aplicaTransferencia;
  const transferenciaPorcentaje = impuestos.transferenciaPorcentaje;
  const transferenciaMonto = impuestos.transferenciaMonto;
  const mostrarIva = impuestos.mostrarIva;
  const mostrarTransferencia = impuestos.mostrarTransferencia;
  const totalCalculadoFinal = Math.round(baseImponible + costoEnvio + ivaMonto + transferenciaMonto);
  const totalGuardado = Number(presupuesto?.total);
  const totalRemito = Number.isFinite(totalGuardado) && totalGuardado > 0 ? Math.round(totalGuardado) : totalCalculadoFinal;

  // Determinar envío
  const tieneTipoEnvio = Boolean(presupuesto.tipoEnvio);
  const tieneEnvioDomicilio = presupuesto.tipoEnvio && presupuesto.tipoEnvio !== "retiro_local";
  const direccionEnvio = tieneEnvioDomicilio
    ? presupuesto.usarDireccionCliente === false
      ? presupuesto.direccionEnvio
      : cliente.direccion
    : undefined;
  const localidadEnvio = tieneEnvioDomicilio
    ? presupuesto.usarDireccionCliente === false
      ? presupuesto.localidadEnvio
      : cliente.localidad
    : undefined;
  const mapsUrlEnvio = tieneEnvioDomicilio
    ? buildMapsUrlFallback({
        explicitMapsUrl: presupuesto.direccionMapsUrl || presupuesto.cliente?.mapsUrl,
        lat: presupuesto.direccionLat ?? presupuesto.cliente?.lat,
        lng: presupuesto.direccionLng ?? presupuesto.cliente?.lng,
        direccion: direccionEnvio,
        localidad: localidadEnvio,
      })
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
      telefono: "1178971517",
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
    envio: tieneTipoEnvio
      ? {
          tipoEnvio: presupuesto.tipoEnvio,
          direccion: direccionEnvio,
          localidad: localidadEnvio,
          fechaEntrega: presupuesto.fechaEntrega ? formatFechaLocalConDia(presupuesto.fechaEntrega) : undefined,
          rangoHorario: presupuesto.rangoHorario,
          costoEnvio: costoEnvio > 0 ? costoEnvio : undefined,
          mapsUrl: mapsUrlEnvio,
        }
      : undefined,
    items: mapItems(items),
    totales: {
      subtotal: Math.round(subtotalBase),
      descuentoTotal: Math.round(descuentoBase),
      descuentoEfectivo: descuentoEfectivo > 0 ? Math.round(descuentoEfectivo) : undefined,
      costoEnvio: costoEnvio > 0 ? costoEnvio : 0,
      ivaPorcentaje: mostrarIva ? ivaPorcentaje : undefined,
      ivaMonto: mostrarIva ? ivaMonto : undefined,
      transferenciaPorcentaje: mostrarTransferencia ? transferenciaPorcentaje : undefined,
      transferenciaMonto: mostrarTransferencia ? transferenciaMonto : undefined,
      total: totalRemito,
    },
    observaciones: presupuesto.observaciones,
    formaPago: presupuesto.formaPago,
    vendedor: presupuesto.vendedor,
  };
}
