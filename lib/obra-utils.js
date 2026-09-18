// Utilidades para el manejo de obras y presupuestos

export const formatearNumeroArgentino = (numero) => {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
  }).format(numero);
};

export const formatearFecha = (fecha) => {
  if (!fecha) return "No especificada";
  return new Date(fecha).toLocaleDateString("es-AR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

export const parseNumericValue = (value) => {
  if (value === "" || value === null || value === undefined) return "";
  const parsed = parseFloat(value);
  return isNaN(parsed) ? "" : parsed;
};

export const calcularPrecioMachimbre = ({
  alto,
  largo,
  cantidad,
  precioPorPie,
}) => {
  const altoNum = Number(alto) || 0;
  const largoNum = Number(largo) || 0;
  const cantNum = Number(cantidad) || 1;
  const precioPorPieNum = Number(precioPorPie) || 0;

  if (altoNum <= 0 || largoNum <= 0 || precioPorPieNum <= 0) return 0;

  const areaTotal = altoNum * largoNum * cantNum;
  return Math.round(areaTotal * precioPorPieNum);
};

export const calcularPrecioCorteMadera = ({
  alto,
  ancho,
  largo,
  precioPorPie,
}) => {
  const altoNum = Number(alto) || 0;
  const anchoNum = Number(ancho) || 0;
  const largoNum = Number(largo) || 0;
  const precioPorPieNum = Number(precioPorPie) || 0;

  if (altoNum <= 0 || anchoNum <= 0 || largoNum <= 0 || precioPorPieNum <= 0)
    return 0;

  const volumen = altoNum * anchoNum * largoNum;
  return Math.round(volumen * precioPorPieNum);
};

export const calcularPrecioProductoObra = ({
  unidadMedida,
  alto,
  largo,
  valorVenta,
  cantidad,
}) => {
  const u = String(unidadMedida || "").toUpperCase();
  const altoNum = Number(alto) || 0;
  const largoNum = Number(largo) || 0;
  const valorNum = Number(valorVenta) || 0;
  const cantNum = Number(cantidad) || 1;

  if (u === "M2") return Math.round(altoNum * largoNum * valorNum * cantNum);
  if (u === "ML") return Math.round(largoNum * valorNum * cantNum);
  return Math.round(valorNum * cantNum);
};

// Indica si el doc tiene IVA/Transferencia activos (compat ambos nombres de campo)
export const obraAplicaIva = (obra) =>
  obra?.aplicarIva === true || obra?.aplicaIva === true;

export const obraAplicaTransferencia = (obra) =>
  obra?.aplicarTransferencia === true || obra?.aplicaTransferencia === true;

// Base imponible: subtotal - descuentos. Si no hay campos generales (presupuestos
// viejos solo con bloques, u obras manuales solo con materiales/productos),
// se reconstruye sumando bloques, productos o materiales.
export const calcularBaseImponibleObra = (obra) => {
  let subtotal = Number(obra?.subtotal);
  let descuento = Number(obra?.descuentoTotal);
  const descuentoEfectivo = Math.max(0, Number(obra?.descuentoEfectivo) || 0);

  const bloques = Array.isArray(obra?.bloques) ? obra.bloques : [];
  const bloquesConItems = bloques.filter(
    (b) => Array.isArray(b?.productos) && b.productos.length > 0
  );

  const sumarProductos = (lista) => {
    const arr = Array.isArray(lista) ? lista : [];
    const subt = arr.reduce((a, p) => a + (Number(p?.precio) || 0), 0);
    const desc = arr.reduce(
      (a, p) =>
        a + (Number(p?.precio) || 0) * ((Number(p?.descuento) || 0) / 100),
      0
    );
    return { subt, desc };
  };

  const sumarMateriales = (lista) => {
    const arr = Array.isArray(lista) ? lista : [];
    const subt = arr.reduce((acc, item) => {
      const esMadera = String(item.categoria || "").toLowerCase() === "maderas";
      const isMachDeck =
        esMadera &&
        (item.subcategoria === "machimbre" || item.subcategoria === "deck");
      const base = isMachDeck
        ? Number(item.precio) || 0
        : (Number(item.precio) || 0) * (Number(item.cantidad) || 0);
      return acc + base;
    }, 0);
    const desc = arr.reduce((acc, item) => {
      const esMadera = String(item.categoria || "").toLowerCase() === "maderas";
      const isMachDeck =
        esMadera &&
        (item.subcategoria === "machimbre" || item.subcategoria === "deck");
      const base = isMachDeck
        ? Number(item.precio) || 0
        : (Number(item.precio) || 0) * (Number(item.cantidad) || 0);
      return acc + Math.round((base * (Number(item.descuento) || 0)) / 100);
    }, 0);
    return { subt, desc };
  };

  if (!Number.isFinite(subtotal) || subtotal <= 0) {
    if (bloquesConItems.length > 0) {
      subtotal = bloquesConItems.reduce((acc, b) => {
        if (Number.isFinite(Number(b?.subtotal)) && Number(b.subtotal) > 0)
          return acc + Number(b.subtotal);
        return (
          acc +
          (Array.isArray(b?.productos) ? b.productos : []).reduce(
            (a, p) => a + (Number(p?.precio) || 0),
            0
          )
        );
      }, 0);
    } else if (Array.isArray(obra?.productos) && obra.productos.length > 0) {
      subtotal = sumarProductos(obra.productos).subt;
    } else if (Array.isArray(obra?.materialesCatalogo) && obra.materialesCatalogo.length > 0) {
      subtotal = sumarMateriales(obra.materialesCatalogo).subt;
    } else if (Number.isFinite(Number(obra?.productosSubtotal)) && Number(obra.productosSubtotal) > 0) {
      subtotal = Number(obra.productosSubtotal);
    } else {
      subtotal = 0;
    }
  }
  if (!Number.isFinite(descuento) || descuento < 0) {
    if (bloquesConItems.length > 0) {
      descuento = bloquesConItems.reduce((acc, b) => {
        if (Number.isFinite(Number(b?.descuentoTotal)) && Number(b.descuentoTotal) >= 0)
          return acc + Number(b.descuentoTotal);
        return (
          acc +
          (Array.isArray(b?.productos) ? b.productos : []).reduce(
            (a, p) =>
              a + (Number(p?.precio) || 0) * ((Number(p?.descuento) || 0) / 100),
            0
          )
        );
      }, 0);
    } else if (Array.isArray(obra?.productos) && obra.productos.length > 0) {
      descuento = sumarProductos(obra.productos).desc;
    } else if (Array.isArray(obra?.materialesCatalogo) && obra.materialesCatalogo.length > 0) {
      descuento = sumarMateriales(obra.materialesCatalogo).desc;
    } else if (Number.isFinite(Number(obra?.productosDescuento)) && Number(obra.productosDescuento) >= 0) {
      descuento = Number(obra.productosDescuento);
    } else if (Number.isFinite(Number(obra?.productosDescuentoTotal)) && Number(obra.productosDescuentoTotal) >= 0) {
      descuento = Number(obra.productosDescuentoTotal);
    } else {
      descuento = 0;
    }
  }

  return Math.max(0, (Number(subtotal) || 0) - (Number(descuento) || 0) - descuentoEfectivo);
};

export const calcularIvaObra = (obra, base) => {
  if (!obraAplicaIva(obra)) return { porcentaje: 0, monto: 0 };
  const baseNum = Math.max(0, Number(base) || 0);
  const porcentaje = Math.max(0, Number(obra?.ivaPorcentaje) || 0);
  const guardado = Math.max(0, Number(obra?.ivaMonto) || 0);
  return {
    porcentaje,
    monto: guardado > 0 ? Math.round(guardado) : Math.round(baseNum * (porcentaje / 100)),
  };
};

export const calcularTransferenciaObra = (obra, base) => {
  if (!obraAplicaTransferencia(obra)) return { porcentaje: 0, monto: 0 };
  const baseNum = Math.max(0, Number(base) || 0);
  const porcentaje = Math.max(0, Number(obra?.transferenciaPorcentaje) || 0);
  const guardado = Math.max(0, Number(obra?.transferenciaMonto) || 0);
  return {
    porcentaje,
    monto: guardado > 0 ? Math.round(guardado) : Math.round(baseNum * (porcentaje / 100)),
  };
};

// Total final con IVA/Transferencia incluidos, sin doble conteo:
// - Si el total guardado ya coincide con base+IVA+Transf, se respeta.
// - Si el total guardado coincide con la base (registros viejos guardados sin
//   impuestos), se le suman los montos guardados.
export const calcularTotalFinalObra = (obra) => {
  const base = calcularBaseImponibleObra(obra);
  const { monto: ivaMonto } = calcularIvaObra(obra, base);
  const { monto: transferenciaMonto } = calcularTransferenciaObra(obra, base);
  const calculado = Math.round(base + ivaMonto + transferenciaMonto);
  const guardado = Number(obra?.total);

  if (Number.isFinite(guardado) && guardado > 0) {
    if (Math.abs(guardado - calculado) < 1) return Math.round(guardado);
    if (
      (ivaMonto > 0 || transferenciaMonto > 0) &&
      Math.abs(guardado - base) < Math.max(1, calculado * 0.001)
    ) {
      return Math.round(guardado + ivaMonto + transferenciaMonto);
    }
    // El guardado manda (puede incluir envío u otros ajustes manuales)
    if (ivaMonto <= 0 && transferenciaMonto <= 0) return Math.round(guardado);
    return Math.round(guardado);
  }
  return calculado;
};

export const generarContenidoImpresion = (
  obra,
  presupuesto,
  modoCosto,
  movimientos = []
) => {
  // Función auxiliar para obtener el label del estado
  const getEstadoLabel = (estado) => {
    const estados = {
      pendiente_inicio: "Pendiente de Inicio",
      en_progreso: "En Progreso",
      completada: "Completada",
      cancelada: "Cancelada",
      Activo: "Activo",
      Inactivo: "Inactivo",
    };
    return estados[estado] || estado;
  };

  // Calcular totales para obras
  let productosSubtotal = 0;
  let productosDescuentoTotal = 0;
  let productosTotal = 0;
  let baseTotalVisual = 0;
  let totalMovimientos = 0;

  if (obra?.tipo === "obra" && obra?.materialesCatalogo) {
    productosSubtotal = obra.materialesCatalogo.reduce((acc, item) => {
      const esMadera = String(item.categoria || "").toLowerCase() === "maderas";
      const isMachDeck =
        esMadera &&
        (item.subcategoria === "machimbre" || item.subcategoria === "deck");
      const base = isMachDeck
        ? Number(item.precio) || 0
        : (Number(item.precio) || 0) * (Number(item.cantidad) || 0);
      return acc + base;
    }, 0);

    productosDescuentoTotal = obra.materialesCatalogo.reduce((acc, item) => {
      const esMadera = String(item.categoria || "").toLowerCase() === "maderas";
      const isMachDeck =
        esMadera &&
        (item.subcategoria === "machimbre" || item.subcategoria === "deck");
      const base = isMachDeck
        ? Number(item.precio) || 0
        : (Number(item.precio) || 0) * (Number(item.cantidad) || 0);
      return acc + Math.round((base * (Number(item.descuento) || 0)) / 100);
    }, 0);

    productosTotal = productosSubtotal - productosDescuentoTotal;
    baseTotalVisual = productosTotal + (Number(obra.gastoObraManual) || 0);
  }

  // IVA y Transferencia para obras/presupuestos (compat aplicaIva/aplicarIva)
  // Si la obra no los tiene pero su presupuesto inicial sí, se heredan en la
  // boleta/remito para que figuren en la impresión.
  const impuestosDePresupuesto =
    obra?.tipo === "obra" &&
    !obraAplicaIva(obra) && !obraAplicaTransferencia(obra) &&
    (obraAplicaIva(presupuesto) || obraAplicaTransferencia(presupuesto));
  const fuenteImpuestos = impuestosDePresupuesto ? presupuesto : obra;
  const aplicarIva = obraAplicaIva(fuenteImpuestos);
  const aplicarTransferencia = obraAplicaTransferencia(fuenteImpuestos);
  const calcularTotalesImpuestos = (fuente, baseDoc) => {
    const base = calcularBaseImponibleObra(baseDoc);
    const iva = calcularIvaObra(fuente, base);
    const transf = calcularTransferenciaObra(fuente, base);
    return { base, iva, transf };
  };
  const totalesObra = calcularTotalesImpuestos(obra, obra);
  const basePresupuestoParaImpuestos = impuestosDePresupuesto
    ? calcularBaseImponibleObra({
      ...obra,
      subtotal: presupuesto?.subtotal,
      descuentoTotal: presupuesto?.descuentoTotal,
      descuentoEfectivo: presupuesto?.descuentoEfectivo,
      bloques: presupuesto?.bloques,
      productos: presupuesto?.productos,
    })
    : totalesObra.base;
  const ivaCalc = impuestosDePresupuesto
    ? calcularIvaObra(presupuesto, basePresupuestoParaImpuestos)
    : totalesObra.iva;
  const ivaPorcentaje = ivaCalc.porcentaje;
  const ivaMonto = ivaCalc.monto;
  const transfCalc = impuestosDePresupuesto
    ? calcularTransferenciaObra(presupuesto, basePresupuestoParaImpuestos)
    : totalesObra.transf;
  const transferenciaPorcentaje = transfCalc.porcentaje;
  const transferenciaMonto = transfCalc.monto;
  const mostrarIvaImpresion = aplicarIva && (ivaMonto > 0 || ivaPorcentaje > 0);
  const mostrarTransfImpresion = aplicarTransferencia && (transferenciaMonto > 0 || transferenciaPorcentaje > 0);
  const baseImponibleObra = totalesObra.base;
  const totalFinalObra = impuestosDePresupuesto
    ? Math.round(basePresupuestoParaImpuestos + ivaMonto + transferenciaMonto)
    : calcularTotalFinalObra(obra);

  // Calcular total de movimientos
  if (movimientos && Array.isArray(movimientos)) {
    totalMovimientos = movimientos.reduce(
      (acc, m) => acc + Number(m.monto || 0),
      0
    );
  }

  // Obtener descripción general
  const descripcionGeneral = obra?.descripcionGeneral || "";

  // Detectar y preparar impresión por bloques (si existen)
  const hayBloques =
    Array.isArray(obra?.bloques) &&
    obra.bloques.some(
      (b) => Array.isArray(b?.productos) && b.productos.length > 0
    );

  const bloquesSeccionHTML = hayBloques
    ? (() => {
      // Totales generales por bloques
      const totalesGenerales = obra.bloques.reduce(
        (acc, bloque) => {
          if (
            !Array.isArray(bloque?.productos) ||
            bloque.productos.length === 0
          )
            return acc;
          const subtotal = bloque.productos.reduce(
            (a, p) => a + Number(p.precio || 0),
            0
          );
          const descuentoTotal = bloque.productos.reduce(
            (a, p) =>
              a + Number(p.precio || 0) * (Number(p.descuento || 0) / 100),
            0
          );
          const total = Math.round(subtotal - descuentoTotal);
          return {
            subtotal: acc.subtotal + subtotal,
            descuentoTotal: acc.descuentoTotal + descuentoTotal,
            total: acc.total + total,
          };
        },
        { subtotal: 0, descuentoTotal: 0, total: 0 }
      );

      const bloquesHTML = obra.bloques
        .filter((b) => Array.isArray(b?.productos) && b.productos.length > 0)
        .map((bloque, idx) => {
          const subtotal = bloque.productos.reduce(
            (a, p) => a + Number(p.precio || 0),
            0
          );
          const descuentoTotal = bloque.productos.reduce(
            (a, p) =>
              a + Number(p.precio || 0) * (Number(p.descuento || 0) / 100),
            0
          );
          const total = Math.round(subtotal - descuentoTotal);

          const filas = bloque.productos
            .map((p) => {
              const unidad = String(p.unidadMedida || "UN").toUpperCase();
              const descuento = Number(p.descuento) || 0;
              const precio = Number(p.precio) || 0;
              let sub = precio * (1 - descuento / 100);
              if (obra?.pagoEnEfectivo) sub = sub * 0.9;
              sub = Math.round(sub);
              const altoNum = Number(p.alto) || 0;
              const largoNum = Number(p.largo) || 0;
              const cantNum = Number(p.cantidad) || 1;
              const valorUnit = Number(p.valorVenta) || 0;
              const valorUnitVisual = obra?.pagoEnEfectivo ? valorUnit * 0.9 : valorUnit;
              const filaBase = `
                  <tr>
                    <td>
                      <div><strong>${p.nombre || "-"}</strong></div>
                    </td>
                    <td style="text-align: center;">${cantNum}</td>
                    <td style="text-align: center;">${unidad}</td>
                    <td style="text-align: center;">${unidad === "M2" ? altoNum : "-"}</td>
                    <td style="text-align: center;">${unidad === "M2" || unidad === "ML" ? largoNum : "-"}</td>
                    <td style="text-align: right;">${formatearNumeroArgentino(valorUnitVisual)}</td>
                    <td style="text-align: center;">${descuento}%</td>
                    <td style="text-align: right; font-weight: bold;">${formatearNumeroArgentino(sub)}</td>
                  </tr>
                `;
              const filaDescripcion = p.descripcion
                ? `
                    <tr>
                      <td colspan="8" style="background: #f9fafb;">
                        <div style="display: flex; gap: 8px; align-items: baseline;">
                          <div style="min-width: 78px; font-weight: 600; color: #4b5563; font-size: 10px;">Descripción:</div>
                          <div style="color: #374151; font-size: 10px;">${p.descripcion}</div>
                        </div>
                      </td>
                    </tr>
                  `
                : "";
              return `${filaBase}${filaDescripcion}`;
            })
            .join("");

          return `
              <div class="${idx > 0 ? "page-break" : ""}">
                ${idx > 0
              ? `
                <div class="header">
                  <div class="header-content">
                    <div class="company-info">
                      <div class="logo">
                        <img src="/logo-maderera.png" alt="Logo Maderera">
                      </div>
                      <div class="company-details">
                        <h1>Maderas Caballero</h1>
                        <div class="company-meta">
                          <span class="badge">${obra?.tipo === "presupuesto" ? "Presupuesto" : "Obra"}</span>
                          <span class="sep">•</span>
                          <span class="web">www.caballeromaderas.com</span>
                        </div>
                      </div>
                    </div>
                    <div class="document-info">
                      <div class="doc-top">
                        <div class="doc-number">N°: ${obra?.numeroPedido || ""}</div>
                        <div class="doc-sub">Remito ${obra?.numeroPedido ? `N° ${obra.numeroPedido}` : ""}${idx > 0 ? ` · Hoja ${idx + 1}` : ""}</div>
                        <div class="doc-date">Fecha: ${obra?.fecha
                ? formatearFecha(obra.fecha)
                : new Date().toLocaleDateString("es-AR")
              }</div>
                      </div>
                      <div class="doc-contact">
                        <div>AV. DR. HONORIO PUEYRREDÓN 4625, VILLA ROSA, BUENOS AIRES</div>
                        <div>Tel: 11-3497-6239</div>
                        <div class="ig">
                          <svg viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M7.5 2h9A5.5 5.5 0 0 1 22 7.5v9A5.5 5.5 0 0 1 16.5 22h-9A5.5 5.5 0 0 1 2 16.5v-9A5.5 5.5 0 0 1 7.5 2Zm0 2A3.5 3.5 0 0 0 4 7.5v9A3.5 3.5 0 0 0 7.5 20h9a3.5 3.5 0 0 0 3.5-3.5v-9A3.5 3.5 0 0 0 16.5 4h-9Zm9.25 1.75a1 1 0 1 1 0 2 1 1 0 0 1 0-2ZM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z"/>
                          </svg>
                          <span>@maderas_caballero</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div class="meta-cols">
                  <div class="meta-block">
                    <div class="meta-kicker">Cliente</div>
                    <div class="client-name">${obra?.cliente?.nombre || "-"}</div>
                    <div class="info-grid">
                      <div class="info-card"><div class="info-label">Contacto</div><div class="info-value">${[obra?.cliente?.telefono, obra?.cliente?.email].filter(Boolean).join(" · ") || "-"}</div></div>
                      <div class="info-card"><div class="info-label">Dirección</div><div class="info-value">${[obra?.cliente?.direccion, obra?.cliente?.localidad].filter(Boolean).join(", ") || "-"}</div></div>
                      <div class="info-card"><div class="info-label">CUIT / Estado</div><div class="info-value">${[obra?.cliente?.cuit, getEstadoLabel(obra?.estado)].filter(Boolean).join(" · ") || "-"}</div></div>
                    </div>
                  </div>
                </div>
                `
              : ""
            }

                <div class="section">
                  <div class="section-title">Detalle ${idx > 0 ? `· Hoja ${idx + 1}` : ""}</div>
                <div class="table-container">
                  <table class="table">
                    <thead>
                      <tr>
                        <th>Producto</th>
                        <th>Cant.</th>
                        <th>Unidad</th>
                        <th>Alto</th>
                        <th>Largo</th>
                        <th>Valor Unit.</th>
                        <th>Desc. %</th>
                        <th>Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${filas}
                    </tbody>
                  </table>
                </div>
                <div class="totals-section">
                  <div class="totals-content">
                    ${bloque.descripcion ? `<div class="description-field"><div class="description-box">${bloque.descripcion}</div></div>` : ""}
                    <div class="totals-right">
                      <div class="total-row">
                        <span class="total-label">Subtotal</span>
                        <span class="total-value">${formatearNumeroArgentino(
              subtotal
            )}</span>
                      </div>
                      <div class="total-row">
                        <span class="total-label">Descuentos</span>
                        <span class="total-value">${formatearNumeroArgentino(
              descuentoTotal
            )}</span>
                      </div>
                      <div class="total-row">
                        <span class="total-label">Total hoja</span>
                        <span class="total-value">${formatearNumeroArgentino(
              total
            )}</span>
                      </div>
                      ${mostrarIvaImpresion ? `
                      <div class="total-row">
                        <span class="total-label">IVA (${ivaPorcentaje}%)</span>
                        <span class="total-value">${formatearNumeroArgentino(ivaMonto)}</span>
                      </div>` : ""}
                      ${mostrarTransfImpresion ? `
                      <div class="total-row">
                        <span class="total-label">Transferencia (${transferenciaPorcentaje}%)</span>
                        <span class="total-value">${formatearNumeroArgentino(transferenciaMonto)}</span>
                      </div>` : ""}
                      ${(mostrarIvaImpresion || mostrarTransfImpresion) ? `
                      <div class="total-row">
                        <span class="total-label">Total final</span>
                        <span class="total-value grand-total">${formatearNumeroArgentino(totalFinalObra)}</span>
                      </div>` : ""}
                    </div>
                  </div>
                </div>
              </div>
            `;
        })
        .join("");

      const totalesGeneralesHTML = ``;

      return `
          ${bloquesHTML}
        `;
    })()
    : "";

  let contenido = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${obra?.numeroPedido ||
    (obra?.id ? obra.id.slice(-8) : obra?.tipo === "presupuesto" ? "Presupuesto" : "Obra")
    }</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        
        * { box-sizing: border-box; }
        
        @media print {
          body { margin: 0; padding: 0; background: #ffffff; font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; }
          .container { max-width: none; border: none; border-radius: 0; margin: 0; }
          .page-break { page-break-before: always; }
          .header { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .section-title { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .print-header { display: none !important; }
          .container > .header, .container .header { display: block !important; }
          .content { padding: 14px 16px !important; }
          .meta-wrap { break-inside: avoid; page-break-inside: avoid; }
          .table thead { display: table-header-group; }
          .table tfoot { display: table-footer-group; }
          .table tr { break-inside: avoid; page-break-inside: avoid; }
          .table th { background: #f1f5f9 !important; color: #334155 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          @page { margin: 12mm 10mm; }
        }
        
        /* Estilos para vista previa */
        body { 
          margin: 0; 
          padding: 12px; 
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; 
          background: #eef1f5;
          color: #111827;
          line-height: 1.45;
          font-size: 11px;
        }

        .print-header { display: none; }
        
        .container {
          max-width: 760px;
          margin: 0 auto;
          background: #ffffff;
          border: 1px solid #e5e7eb;
          border-radius: 10px;
          box-shadow: none;
          overflow: hidden;
        }
        
        .header {
          background: #111827;
          color: #ffffff;
          padding: 16px 20px;
          border-radius: 0;
          box-shadow: none;
        }
        
        .header-content {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 16px;
        }
        
        .company-info {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
        }
        
        .logo {
          width: 40px;
          height: 40px;
          background: white;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: none;
          border: none;
          flex: 0 0 auto;
        }
        
        .logo img {
          width: 30px;
          height: 30px;
          object-fit: contain;
        }
        
        .company-details h1 {
          margin: 0;
          font-size: 16px;
          font-weight: 800;
          color: white;
          text-shadow: none;
          letter-spacing: -0.01em;
          line-height: 1.1;
        }
        
        .company-meta { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; margin-top: 3px; }
        .company-meta .badge { font-size: 8.5px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; padding: 2px 7px; border-radius: 99px; background: #1e1b1b; color: #ffffff; border: none; }
        .company-meta .sep { display: none; }
        .company-meta .web { font-size: 9px; font-weight: 500; opacity: 0.75; }
        
        .document-info { text-align: right; flex: 0 0 auto; display: grid; gap: 2px; justify-items: end; }
        .document-info .doc-top { display: grid; gap: 1px; justify-items: end; }
        .document-info .doc-number { font-size: 13px; font-weight: 800; margin: 0; color: white; letter-spacing: 0; }
        .document-info .doc-sub { font-size: 9px; font-weight: 700; margin: 0; opacity: 0.85; text-transform: uppercase; letter-spacing: 0.05em; }
        .document-info .doc-date { font-size: 9px; font-weight: 500; margin: 0; opacity: 0.75; }
        .document-info .doc-contact { display: none; }
        .document-info .ig { display: none; }
        
        .content {
          padding: 16px 20px 18px 20px;
        }
        
        .section {
          margin-bottom: 16px;
        }
        
        .section-title {
          display: flex;
          align-items: center;
          gap: 7px;
          font-size: 10px;
          font-weight: 800;
          color: #374151;
          margin: 0 0 10px 0;
          padding-bottom: 6px;
          border-bottom: 1px solid #e5e7eb;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }
        .section-title::before {
          content: "";
          width: 3px;
          height: 11px;
          border-radius: 99px;
          background: #1e1b1b;
          flex: 0 0 auto;
        }
        
        /* Meta minimalista: UNA sola franja plana, sin cajas anidadas */
        .meta-wrap {
          display: block;
          margin: 0 0 14px 0;
          padding: 0 0 10px 0;
          border-bottom: 1px solid #e5e7eb;
        }
        .meta-wrap.single { display: block; }
        
        .meta-cols {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 6px 28px;
        }
        @media (max-width: 560px) {
          .meta-cols { grid-template-columns: 1fr; }
        }
        @media print {
          .meta-cols { gap: 5px 24px; }
        }
        
        .meta-block { min-width: 0; }
        .meta-kicker {
          font-size: 8px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #9ca3af;
          margin: 0 0 3px 0;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .meta-kicker .pill { margin-left: 2px; }
        
        .info-grid {
          display: block;
          margin-bottom: 0;
        }
        
        .info-card {
          background: transparent;
          border: none;
          border-radius: 0;
          padding: 2px 0;
          font-size: 10.5px;
          box-shadow: none;
          display: flex;
          justify-content: flex-start;
          align-items: baseline;
          gap: 8px;
          min-width: 0;
        }
        
        .info-label {
          font-size: 10.5px;
          font-weight: 400;
          color: #6b7280;
          text-transform: none;
          letter-spacing: 0;
          margin: 0;
          white-space: nowrap;
          flex: 0 0 auto;
          min-width: 74px;
        }
        
        .info-value {
          font-size: 10.5px;
          font-weight: 600;
          color: #111827;
          margin: 0;
          text-align: left;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        
        /* Compat: selectores viejos sin efecto visual (ya no hay cajas) */
        .section-info-general,
        .section-detalles-obra {
          background: transparent;
          border: none;
          padding: 0;
          margin: 0;
          box-shadow: none;
        }

        .client-name {
          font-size: 12.5px;
          font-weight: 800;
          color: #111827;
          margin: 0 0 4px 0;
          letter-spacing: -0.01em;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .client-sub {
          font-size: 10px;
          color: #4b5563;
          margin: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .pill {
          display: inline-block;
          font-size: 8px;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          padding: 1px 6px;
          border-radius: 99px;
          background: #f3f4f6;
          color: #4b5563;
          border: none;
          white-space: nowrap;
        }
        .pill.red { background: #fef2f2; color: #b91c1c; border: none; }
        .pill.green { background: #ecfdf5; color: #047857; border: none; }
        .pill.amber { background: #fffbeb; color: #b45309; border: none; }
        .pill.slate { background: #f3f4f6; color: #4b5563; border: none; }
        
        .table-container {
          background: transparent;
          border: none;
          border-radius: 0;
          overflow: visible;
          margin-bottom: 10px;
          box-shadow: none;
        }
        
        .table {
          width: 100%;
          border-collapse: collapse;
          font-size: 10.5px;
        }
        
        .table th {
          background: #f8fafc;
          color: #64748b;
          font-size: 8.5px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          padding: 6px 8px;
          text-align: left;
          border: none;
          border-bottom: 1px solid #e5e7eb;
          position: relative;
          box-shadow: none;
        }
        
        .table th:first-child {
          border-top-left-radius: 0;
        }
        
        .table th:last-child {
          border-top-right-radius: 0;
        }
        
        .table td {
          padding: 7px 8px;
          border-bottom: 1px solid #f1f5f9;
          font-size: 10px;
          color: #374151;
          background: transparent;
        }
        
        .table tr:last-child td {
          border-bottom: none;
        }
        
        .table tbody tr:nth-child(even) td {
          background: transparent;
        }
        
        .totals-section {
          background: transparent;
          border: none;
          border-radius: 0;
          padding: 0;
          margin-top: 10px;
          box-shadow: none;
        }
        
        .totals-content {
          display: flex;
          gap: 16px;
          justify-content: flex-end;
          align-items: flex-start;
        }
        
        .description-field {
          flex: 1 1 auto;
          min-width: 0;
        }
        
        .description-box {
          width: 100%;
          height: auto;
          min-height: 0;
          border: none;
          border-radius: 0;
          padding: 0;
          font-size: 10px;
          font-family: inherit;
          background: transparent;
          box-shadow: none;
          white-space: pre-wrap;
          word-break: break-word;
          line-height: 1.45;
          color: #4b5563;
        }
        
        .totals-right {
          flex: 0 0 220px;
          background: transparent;
          padding: 0;
          border-radius: 0;
          border: none;
          border-top: 1px solid #e5e7eb;
          padding-top: 8px;
          box-shadow: none;
        }
        
        .total-row {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          margin-bottom: 3px;
          font-size: 10.5px;
          padding: 0;
        }
        
        .total-row:last-child {
          margin-bottom: 0;
          margin-top: 5px;
          padding-top: 6px;
          border-top: 1px solid #111827;
          font-weight: 800;
          font-size: 12px;
        }
        
        .total-label {
          font-weight: 400;
          color: #6b7280;
        }
        
        .total-value {
          font-weight: 600;
          color: #111827;
        }
        
        .grand-total { color: #111827; font-size: 12.5px; font-weight: 800; }
        
        .product-details {
          font-size: 9px;
          color: #6b7280;
          margin-top: 4px;
          font-style: italic;
          padding: 2px 6px;
          background: #f3f4f6;
          border-radius: 4px;
          display: inline-block;
        }
        
        .description-placeholder {
          color: #1a1a1a;
          font-style: italic;
        }
        
        /* Mejoras adicionales para las tablas */
        .table tbody tr:first-child td {
          border-top: 1px solid #e5e7eb;
        }
        
        .table tbody tr:last-child td {
          border-bottom: 1px solid #e5e7eb;
        }
        
        /* Estilos para totales destacados */
        .grand-total { color: #111827; font-weight: 800; }
        
        .footer {
          margin-top: 14px;
          padding-top: 8px;
          border-top: 1px solid #f1f5f9;
          color: #9ca3af;
          font-size: 8.5px;
          text-align: center;
        }
        .footer .links { display: flex; justify-content: center; gap: 12px; flex-wrap: wrap; margin-top: 6px; }
        .footer a { color: #374151; text-decoration: none; }
      </style>
    </head>
    <body>
      <div class="print-header">
        <div class="header">
          <div class="header-content">
            <div class="company-info">
              <div class="logo">
                <img src="/logo-maderera.png" alt="Logo Maderera">
              </div>
              <div class="company-details">
                <h1>Maderas Caballero</h1>
                <div class="company-meta">
                  <span class="badge">${obra?.tipo === "presupuesto" ? "Presupuesto" : "Obra"}</span>
                  <span class="sep">•</span>
                  <span class="web">www.caballeromaderas.com</span>
                </div>
              </div>
            </div>
            <div class="document-info">
              <div class="doc-top">
                <div class="doc-number">N°: ${obra?.numeroPedido || (obra?.id ? obra.id.slice(-8) : "")}</div>
                <div class="doc-date">Fecha: ${obra?.fecha
      ? formatearFecha(obra.fecha)
      : new Date().toLocaleDateString("es-AR")
    }</div>
              </div>
              <div class="doc-contact">
                <div>AV. DR. HONORIO PUEYRREDÓN 4625, VILLA ROSA, BUENOS AIRES</div>
                <div>Tel: 11-3497-6239</div>
                <div class="ig">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M7.5 2h9A5.5 5.5 0 0 1 22 7.5v9A5.5 5.5 0 0 1 16.5 22h-9A5.5 5.5 0 0 1 2 16.5v-9A5.5 5.5 0 0 1 7.5 2Zm0 2A3.5 3.5 0 0 0 4 7.5v9A3.5 3.5 0 0 0 7.5 20h9a3.5 3.5 0 0 0 3.5-3.5v-9A3.5 3.5 0 0 0 16.5 4h-9Zm9.25 1.75a1 1 0 1 1 0 2 1 1 0 0 1 0-2ZM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z"/>
                  </svg>
                  <span>@maderas_caballero</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="container">
        <!-- Header -->
        <div class="header">
          <div class="header-content">
            <div class="company-info">
              <div class="logo">
                <img src="/logo-maderera.png" alt="Logo Maderera">
              </div>
              <div class="company-details">
                <h1>Maderas Caballero</h1>
                <div class="company-meta">
                  <span class="badge">${obra?.tipo === "presupuesto" ? "Presupuesto" : "Obra"}</span>
                  <span class="sep">•</span>
                  <span class="web">www.caballeromaderas.com</span>
                </div>
              </div>
            </div>
            <div class="document-info">
              <div class="doc-top">
                <div class="doc-number">N°: ${obra?.numeroPedido || (obra?.id ? obra.id.slice(-8) : "")}</div>
                <div class="doc-date">Fecha: ${obra?.fecha
      ? formatearFecha(obra.fecha)
      : new Date().toLocaleDateString("es-AR")
    }</div>
              </div>
              <div class="doc-contact">
                <div>AV. DR. HONORIO PUEYRREDÓN 4625, VILLA ROSA, BUENOS AIRES</div>
                <div>Tel: 11-3497-6239</div>
                <div class="ig">
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M7.5 2h9A5.5 5.5 0 0 1 22 7.5v9A5.5 5.5 0 0 1 16.5 22h-9A5.5 5.5 0 0 1 2 16.5v-9A5.5 5.5 0 0 1 7.5 2Zm0 2A3.5 3.5 0 0 0 4 7.5v9A3.5 3.5 0 0 0 7.5 20h9a3.5 3.5 0 0 0 3.5-3.5v-9A3.5 3.5 0 0 0 16.5 4h-9Zm9.25 1.75a1 1 0 1 1 0 2 1 1 0 0 1 0-2ZM12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10Zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z"/>
                  </svg>
                  <span>@maderas_caballero</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Contenido -->
        <div class="content">

        ${(() => {
      const c = obra?.cliente || {};
      const nombre = c?.nombre || "-";
      const contacto = [c?.telefono, c?.email].filter(Boolean).join(" · ") || "-";
      const direccion = [c?.direccion, c?.localidad].filter(Boolean).join(", ") || "-";
      const estadoObra = getEstadoLabel(obra?.estado) || "-";
      const pillEstado = /complet/i.test(String(obra?.estado || "")) ? "green" : /cancel/i.test(String(obra?.estado || "")) ? "red" : /progreso/i.test(String(obra?.estado || "")) ? "amber" : "slate";
      const esObra = obra?.tipo === "obra";
      const fechasTxt = esObra
        ? [(obra?.fechas?.inicio ? formatearFecha(obra.fechas.inicio) : null), (obra?.fechas?.fin ? formatearFecha(obra.fechas.fin) : null)].filter(Boolean).join(" · ") || "-"
        : null;
      const ubiTxt = esObra
        ? [obra?.ubicacion?.direccion, obra?.ubicacion?.localidad, obra?.ubicacion?.provincia].filter(Boolean).join(", ") || "-"
        : null;
      const barrioLote = esObra
        ? [obra?.ubicacion?.barrio, obra?.ubicacion?.area, obra?.ubicacion?.lote].filter(Boolean).join(" · ") || null
        : null;
      return `
        <div class="meta-wrap">
          <div class="meta-cols">
            <div class="meta-block">
              <div class="meta-kicker">Cliente <span class="pill ${pillEstado}">${estadoObra}</span></div>
              <div class="client-name">${nombre}</div>
              <div class="info-grid">
                <div class="info-card"><div class="info-label">Contacto</div><div class="info-value">${contacto}</div></div>
                <div class="info-card"><div class="info-label">Dirección</div><div class="info-value">${direccion}</div></div>
                ${c?.cuit ? `<div class="info-card"><div class="info-label">CUIT</div><div class="info-value">${c.cuit}</div></div>` : ""}
              </div>
            </div>
            ${esObra ? `
            <div class="meta-block">
              <div class="meta-kicker">Obra</div>
              <div class="info-grid">
                <div class="info-card"><div class="info-label">Ubicación</div><div class="info-value">${ubiTxt}</div></div>
                <div class="info-card"><div class="info-label">Cronograma</div><div class="info-value">${fechasTxt}</div></div>
                ${barrioLote ? `<div class="info-card"><div class="info-label">Barrio / Lote</div><div class="info-value">${barrioLote}</div></div>` : ""}
              </div>
            </div>` : ""}
          </div>
        </div>`;
    })()}

        ${hayBloques ? bloquesSeccionHTML : ""}

        ${obra?.tipo === "obra" &&
      obra?.materialesCatalogo &&
      obra.materialesCatalogo.length > 0
      ? `
        <div class="section">
          <div class="section-title">Materiales de la Obra</div>
          <div class="table-container">
            <table class="table">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Cant.</th>
                  <th>Unidad</th>
                  <th>Alto</th>
                  <th>Largo</th>
                  <th>Valor Unit.</th>
                  <th>Desc. %</th>
                  <th>Subtotal</th>
                </tr>
              </thead>
              <tbody>
                ${obra.materialesCatalogo
        .map((p) => {
          const unidad = String(p.unidad || p.unidadMedida || "UN").toUpperCase();
          const valor = Number(p.precio) || 0;
          const descuento = Number(p.descuento) || 0;
          const esMadera =
            String(p.categoria || "").toLowerCase() === "maderas";
          const isMachDeck =
            esMadera &&
            (p.subcategoria === "machimbre" ||
              p.subcategoria === "deck");
          const cantNum = Number(p.cantidad) || 1;
          const base = isMachDeck ? valor : valor * cantNum;
          const sub =
            Number.isFinite(Number(p.subtotal)) && Number(p.subtotal) > 0
              ? Math.round(Number(p.subtotal))
              : Math.round(base * (1 - descuento / 100));
          const altoNum = Number(p.alto) || 0;
          const largoNum = Number(p.largo) || 0;
          const valorUnit = Number(p.valorVenta) || valor;
          const filaBase = `
                    <tr>
                      <td>
                        <div class="product-name">${p.nombre || "-"}</div>
                      </td>
                      <td class="numeric-value">${cantNum}</td>
                      <td class="numeric-value">${unidad}</td>
                      <td class="numeric-value">${unidad === "M2" ? altoNum : "-"}</td>
                      <td class="numeric-value">${unidad === "M2" || unidad === "ML" ? largoNum : "-"}</td>
                      <td class="numeric-value">${formatearNumeroArgentino(valorUnit)}</td>
                      <td class="discount-value">${descuento}%</td>
                      <td class="subtotal-value">${formatearNumeroArgentino(sub)}</td>
                    </tr>
                  `;
          const filaDescripcion = p.descripcion
            ? `
                    <tr>
                      <td colspan="8" style="background: #f9fafb;">
                        <div style="display: flex; gap: 8px; align-items: baseline;">
                          <div style="min-width: 78px; font-weight: 600; color: #4b5563; font-size: 10px;">Descripción:</div>
                          <div style="color: #374151; font-size: 10px;">${p.descripcion}</div>
                        </div>
                      </td>
                    </tr>
                    `
            : "";
          return `${filaBase}${filaDescripcion}`;
        })
        .join("")}
              </tbody>
            </table>
          </div>
          
          <!-- Totales con campo de descripción -->
          <div class="totals-section">
            <div class="totals-content">
              <div class="totals-right">
                <div class="total-row">
                  <span class="total-label">Subtotal:</span>
                  <span class="total-value">${formatearNumeroArgentino(
          productosSubtotal
        )}</span>
                </div>
                <div class="total-row">
                  <span class="total-label">Descuentos:</span>
                  <span class="total-value">${formatearNumeroArgentino(
          productosDescuentoTotal
        )}</span>
                </div>
                <div class="total-row">
                  <span class="total-label">Total Materiales:</span>
                  <span class="total-value">${formatearNumeroArgentino(
          productosTotal
        )}</span>
                </div>
                ${mostrarIvaImpresion ? `
                <div class="total-row">
                  <span class="total-label">IVA (${ivaPorcentaje}%):</span>
                  <span class="total-value">${formatearNumeroArgentino(ivaMonto)}</span>
                </div>` : ""}
                ${mostrarTransfImpresion ? `
                <div class="total-row">
                  <span class="total-label">Transferencia (${transferenciaPorcentaje}%):</span>
                  <span class="total-value">${formatearNumeroArgentino(transferenciaMonto)}</span>
                </div>` : ""}
                <div class="total-row">
                  <span class="total-label">Total Final:</span>
                  <span class="total-value grand-total">${formatearNumeroArgentino((aplicarIva || aplicarTransferencia) ? totalFinalObra : productosTotal)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        `
      : ""
    }

        ${!hayBloques &&
      presupuesto &&
      presupuesto.productos &&
      presupuesto.productos.length > 0
      ? `
        <div class="section">
          <div class="section-title">Presupuesto Inicial</div>
          <div class="table-container">
            <table class="table">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Cant.</th>
                  <th>Unidad</th>
                  <th>Alto</th>
                  <th>Largo</th>
                  <th>Valor Unit.</th>
                  <th>Desc. %</th>
                  <th>Subtotal</th>
                </tr>
              </thead>
              <tbody>
                ${presupuesto.productos
        .map((p) => {
          const unidad = String(p.unidadMedida || "UN").toUpperCase();
          const valor = Number(p.valorVenta) || 0;
          const descuento = Number(p.descuento) || 0;
          const precio = Number(p.precio) || 0;
          let sub = precio * (1 - descuento / 100);
          if (presupuesto?.pagoEnEfectivo) sub = sub * 0.9;
          sub = Math.round(sub);
          const altoNum = Number(p.alto) || 0;
          const largoNum = Number(p.largo) || 0;
          const cantNum = Number(p.cantidad) || 1;
          const valorUnitVisual = presupuesto?.pagoEnEfectivo ? valor * 0.9 : valor;
          const filaBase = `
                    <tr>
                      <td>
                        <div><strong>${p.nombre || "-"}</strong></div>
                      </td>
                      <td style="text-align: center;">${cantNum}</td>
                      <td style="text-align: center;">${unidad}</td>
                      <td style="text-align: center;">${unidad === "M2" ? altoNum : "-"}</td>
                      <td style="text-align: center;">${unidad === "M2" || unidad === "ML" ? largoNum : "-"}</td>
                      <td style="text-align: right;">${formatearNumeroArgentino(valorUnitVisual)}</td>
                      <td style="text-align: center;">${descuento}%</td>
                      <td style="text-align: right; font-weight: bold;">${formatearNumeroArgentino(sub)}</td>
                    </tr>
                  `;
          const filaDescripcion = p.descripcion
            ? `
                    <tr>
                      <td colspan="8" style="background: #f9fafb;">
                        <div style="display: flex; gap: 8px; align-items: baseline;">
                          <div style="min-width: 78px; font-weight: 600; color: #4b5563; font-size: 10px;">Descripción:</div>
                          <div style="color: #374151; font-size: 10px;">${p.descripcion}</div>
                        </div>
                      </td>
                    </tr>
                    `
            : "";
          return `${filaBase}${filaDescripcion}`;
        })
        .join("")}
              </tbody>
            </table>
          </div>
          
          <div class="totals-section">
            <div class="totals-content">
              <div class="totals-right">
                <div class="total-row">
                  <span class="total-label">Subtotal:</span>
                  <span class="total-value">${formatearNumeroArgentino(
          presupuesto.subtotal || 0
        )}</span>
                </div>
                <div class="total-row">
                  <span class="total-label">Descuentos:</span>
                  <span class="total-value">${formatearNumeroArgentino(
          presupuesto.descuentoTotal || 0
        )}</span>
                </div>
                ${presupuesto.pagoEnEfectivo ? `
                <div class="total-row">
                  <span class="total-label">Descuento (Efectivo 10%):</span>
                  <span class="total-value" style="color: #16a34a;">${formatearNumeroArgentino(
          Math.round((presupuesto.subtotal || 0) * 0.1)
        )}</span>
                </div>
                ` : ''}
                <div class="total-row">
                  <span class="total-label">Total:</span>
                  <span class="total-value">${formatearNumeroArgentino(
          presupuesto.pagoEnEfectivo
            ? Math.round((presupuesto.total || 0) - (presupuesto.subtotal || 0) * 0.1)
            : presupuesto.total || 0
        )}</span>
                </div>
                ${mostrarIvaImpresion ? `
                <div class="total-row">
                  <span class="total-label">IVA (${ivaPorcentaje}%):</span>
                  <span class="total-value">${formatearNumeroArgentino(ivaMonto)}</span>
                </div>` : ""}
                ${mostrarTransfImpresion ? `
                <div class="total-row">
                  <span class="total-label">Transferencia (${transferenciaPorcentaje}%):</span>
                  <span class="total-value">${formatearNumeroArgentino(transferenciaMonto)}</span>
                </div>` : ""}
                ${(mostrarIvaImpresion || mostrarTransfImpresion) ? `
                <div class="total-row">
                  <span class="total-label">Total Final:</span>
                  <span class="total-value grand-total">${formatearNumeroArgentino(totalFinalObra)}</span>
                </div>` : ""}
              </div>
            </div>
          </div>
        </div>
        `
      : ""
    }

        ${(!hayBloques &&
      obra?.productos &&
      obra.productos.length > 0) ||
      (obra?.tipo === "obra" &&
        (!obra?.materialesCatalogo || obra.materialesCatalogo.length === 0))
      ? (() => {
        const listaProductos = (obra?.productos && obra.productos.length > 0)
          ? obra.productos
          : (presupuesto?.productos && presupuesto.productos.length > 0 ? presupuesto.productos : []);
        const esPresupuestoSinBloques = obra?.tipo === "presupuesto";
        const pagoEfectivoProductos = esPresupuestoSinBloques ? obra?.pagoEnEfectivo : (obra?.pagoEnEfectivo || presupuesto?.pagoEnEfectivo);
        const filasProductos = listaProductos
          .map((p) => {
            const unidad = String(p.unidadMedida || p.unidad || "UN").toUpperCase();
            const valor = Number(p.valorVenta) || Number(p.precio) || 0;
            const descuento = Number(p.descuento) || 0;
            const precio = Number(p.precio) || 0;
            let sub = precio * (1 - descuento / 100);
            if (pagoEfectivoProductos) sub = sub * 0.9;
            sub = Math.round(sub);
            const altoNum = Number(p.alto) || 0;
            const largoNum = Number(p.largo) || 0;
            const cantNum = Number(p.cantidad) || 1;
            const valorUnitVisual = pagoEfectivoProductos ? valor * 0.9 : valor;
            const filaBase = `
                    <tr>
                      <td>
                        <div><strong>${p.nombre || "-"}</strong></div>
                      </td>
                      <td style="text-align: center;">${cantNum}</td>
                      <td style="text-align: center;">${unidad}</td>
                      <td style="text-align: center;">${unidad === "M2" ? altoNum : "-"}</td>
                      <td style="text-align: center;">${unidad === "M2" || unidad === "ML" ? largoNum : "-"}</td>
                      <td style="text-align: right;">${formatearNumeroArgentino(valorUnitVisual)}</td>
                      <td style="text-align: center;">${descuento}%</td>
                      <td style="text-align: right; font-weight: bold;">${formatearNumeroArgentino(sub)}</td>
                    </tr>
                  `;
            const filaDescripcion = p.descripcion
              ? `
                    <tr>
                      <td colspan="8" style="background: #f9fafb;">
                        <div style="display: flex; gap: 8px; align-items: baseline;">
                          <div style="min-width: 78px; font-weight: 600; color: #4b5563; font-size: 10px;">Descripción:</div>
                          <div style="color: #374151; font-size: 10px;">${p.descripcion}</div>
                        </div>
                      </td>
                    </tr>
                    `
              : "";
            return `${filaBase}${filaDescripcion}`;
          })
          .join("");
        return `
        <div class="section">
          <div class="section-title">${esPresupuestoSinBloques ? "Productos del Presupuesto" : "Productos de la Obra"}</div>
          <div class="table-container">
            <table class="table">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Cant.</th>
                  <th>Unidad</th>
                  <th>Alto</th>
                  <th>Largo</th>
                  <th>Valor Unit.</th>
                  <th>Desc. %</th>
                  <th>Subtotal</th>
                </tr>
              </thead>
              <tbody>
                ${filasProductos}
              </tbody>
            </table>
          </div>
          
          <div class="totals-section">
            <div class="totals-content">
              <div class="totals-right">
                <div class="total-row">
                  <span class="total-label">Subtotal:</span>
                  <span class="total-value">${formatearNumeroArgentino(
          Math.round(baseImponibleObra + (Number(obra?.descuentoTotal) || 0) + (Number(obra?.descuentoEfectivo) || 0)) || obra.subtotal || 0
        )}</span>
                </div>
                <div class="total-row">
                  <span class="total-label">Descuentos:</span>
                  <span class="total-value">${formatearNumeroArgentino(
          obra.descuentoTotal || 0
        )}</span>
                </div>
                ${pagoEfectivoProductos ? `
                <div class="total-row">
                  <span class="total-label">Descuento (Efectivo 10%):</span>
                  <span class="total-value" style="color: #16a34a;">${formatearNumeroArgentino(
          Math.round(((Number(obra?.subtotal) || 0) || baseImponibleObra) * 0.1)
        )}</span>
                </div>
                ` : ''}
                <div class="total-row">
                  <span class="total-label">Total:</span>
                  <span class="total-value">${formatearNumeroArgentino(Math.round(baseImponibleObra))}</span>
                </div>
                ${mostrarIvaImpresion ? `
                <div class="total-row">
                  <span class="total-label">IVA (${ivaPorcentaje}%):</span>
                  <span class="total-value">${formatearNumeroArgentino(ivaMonto)}</span>
                </div>` : ""}
                ${mostrarTransfImpresion ? `
                <div class="total-row">
                  <span class="total-label">Transferencia (${transferenciaPorcentaje}%):</span>
                  <span class="total-value">${formatearNumeroArgentino(transferenciaMonto)}</span>
                </div>` : ""}
                ${(mostrarIvaImpresion || mostrarTransfImpresion) ? `
                <div class="total-row">
                  <span class="total-label">Total Final:</span>
                  <span class="total-value grand-total">${formatearNumeroArgentino(totalFinalObra)}</span>
                </div>` : ""}
              </div>
            </div>
          </div>
        </div>
        `;
      })()
      : ""
    }

        ${obra?.tipo === "obra" && movimientos && movimientos.length > 0
      ? `
        <div class="section">
          <div class="section-title">Movimientos de Cobranza</div>
          <div class="table-container">
            <table class="table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Tipo</th>
                  <th>Método</th>
                  <th>Monto</th>
                  <th>Nota</th>
                </tr>
              </thead>
              <tbody>
                ${movimientos
        .map(
          (m) => `
                  <tr>
                    <td>${m.fecha || "-"}</td>
                    <td style="text-transform: capitalize;">${m.tipo}</td>
                    <td style="text-transform: capitalize;">${m.metodo}</td>
                    <td style="text-align: right;">${formatearNumeroArgentino(
            Number(m.monto || 0)
          )}</td>
                    <td>${m.nota || "-"}</td>
                  </tr>
                `
        )
        .join("")}
              </tbody>
            </table>
          </div>
        </div>
        `
      : ""
    }

        ${obra?.tipoEnvio && obra.tipoEnvio !== "retiro_local"
      ? `
        <div class="section">
          <div class="section-title">Información de Envío</div>
          <div class="info-grid">
            <div class="info-card">
              <div class="info-label">Tipo de Envío</div>
              <div class="info-value">${obra.tipoEnvio}</div>
            </div>
            ${obra.direccionEnvio
        ? `
            <div class="info-card">
              <div class="info-label">Dirección de Envío</div>
              <div class="info-value">${obra.direccionEnvio}</div>
            </div>
            `
        : ""
      }
            ${obra.localidadEnvio
        ? `
            <div class="info-card">
              <div class="info-label">Localidad</div>
              <div class="info-value">${obra.localidadEnvio}</div>
            </div>
            `
        : ""
      }
            ${obra.transportista
        ? `
            <div class="info-card">
              <div class="info-label">Transportista</div>
              <div class="info-value">${obra.transportista}</div>
            </div>
            `
        : ""
      }
            ${obra.fechaEntrega
        ? `
            <div class="info-card">
              <div class="info-label">Fecha de Entrega</div>
              <div class="info-value">${formatearFecha(obra.fechaEntrega)}</div>
            </div>
            `
        : ""
      }
            ${obra.rangoHorario
        ? `
            <div class="info-card">
              <div class="info-label">Rango Horario</div>
              <div class="info-value">${obra.rangoHorario}</div>
            </div>
            `
        : ""
      }
          </div>
        </div>
        `
      : ""
    }

      </div>
      </body>
      </html>
  `;

  return contenido;
};

export const descargarPDF = async (
  obra,
  presupuesto,
  modoCosto,
  movimientos = []
) => {
  try {
    // Generar el contenido HTML
    const contenidoHTML = generarContenidoImpresion(
      obra,
      presupuesto,
      modoCosto,
      movimientos
    );

    // Crear un elemento temporal para el contenido
    const elemento = document.createElement("div");
    elemento.innerHTML = contenidoHTML;
    elemento.style.position = "absolute";
    elemento.style.left = "0";
    elemento.style.top = "0";
    elemento.style.opacity = "0";
    elemento.style.pointerEvents = "none";
    elemento.style.zIndex = "-1";
    document.body.appendChild(elemento);

    const imgs = Array.from(elemento.querySelectorAll("img"));
    await Promise.all(
      imgs.map(
        (img) =>
          img.complete
            ? Promise.resolve()
            : new Promise((resolve) => {
              img.onload = resolve;
              img.onerror = resolve;
            })
      )
    );

    if (document.fonts?.ready) {
      try {
        await document.fonts.ready;
      } catch (e) { }
    }

    // Configuración para html2pdf
    const opt = {
      margin: [10, 10, 10, 10],
      filename: `${obra?.tipo === "presupuesto" ? "Presupuesto" : "Obra"}_${obra?.numeroPedido || "sin_numero"
        }.pdf`,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        allowTaint: true,
      },
      jsPDF: {
        unit: "mm",
        format: "a4",
        orientation: "portrait",
      },
    };

    // Importar html2pdf dinámicamente
    const html2pdf = (await import("html2pdf.js")).default;

    // Generar y descargar el PDF
    await html2pdf().set(opt).from(elemento).save();

    // Limpiar el elemento temporal
    document.body.removeChild(elemento);
  } catch (error) {
    console.error("Error al generar PDF:", error);
    // Fallback: abrir en nueva ventana para imprimir
    const contenidoHTML = generarContenidoImpresion(
      obra,
      presupuesto,
      modoCosto,
      movimientos
    );
    const nuevaVentana = window.open("", "_blank");
    nuevaVentana.document.write(contenidoHTML);
    nuevaVentana.document.close();
  }
};

// Función alternativa más robusta para descargar PDF
export const descargarPDFRobusto = async (
  obra,
  presupuesto,
  modoCosto,
  movimientos = []
) => {
  try {
    // Generar el contenido HTML
    const contenidoHTML = generarContenidoImpresion(
      obra,
      presupuesto,
      modoCosto,
      movimientos
    );

    // Crear una nueva ventana oculta para renderizar el contenido
    const ventanaOculta = window.open(
      "",
      "_blank",
      "width=800,height=600,scrollbars=yes,resizable=yes"
    );

    // Escribir el contenido en la ventana
    ventanaOculta.document.write(contenidoHTML);
    ventanaOculta.document.close();

    // Esperar a que se cargue completamente
    await new Promise((resolve) => {
      ventanaOculta.onload = resolve;
      if (ventanaOculta.document.readyState === "complete") {
        resolve();
      }
    });

    // Esperar un poco más para asegurar que los estilos se apliquen
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Configuración optimizada para html2pdf
    const opt = {
      margin: [8, 8, 8, 8],
      filename: `${obra?.tipo === "presupuesto" ? "Presupuesto" : "Obra"}_${obra?.numeroPedido || "sin_numero"
        }.pdf`,
      image: { type: "jpeg", quality: 0.95 },
      html2canvas: {
        scale: 1.5,
        useCORS: true,
        allowTaint: true,
        backgroundColor: "#ffffff",
        letterRendering: true,
        foreignObjectRendering: true,
      },
      jsPDF: {
        unit: "mm",
        format: "a4",
        orientation: "portrait",
        compress: true,
        precision: 16,
      },
    };

    // Importar html2pdf dinámicamente
    const html2pdf = (await import("html2pdf.js")).default;

    // Generar PDF desde la ventana oculta
    await html2pdf().set(opt).from(ventanaOculta.document.body).save();

    // Cerrar la ventana oculta
    ventanaOculta.close();
  } catch (error) {
    console.error("Error al generar PDF robusto:", error);

    // Fallback: usar la función original
    try {
      await descargarPDF(obra, presupuesto, modoCosto, movimientos);
    } catch (fallbackError) {
      console.error("Error en fallback:", fallbackError);

      // Último recurso: abrir en nueva ventana
      const contenidoHTML = generarContenidoImpresion(
        obra,
        presupuesto,
        modoCosto,
        movimientos
      );
      const nuevaVentana = window.open("", "_blank");
      nuevaVentana.document.write(contenidoHTML);
      nuevaVentana.document.close();

      alert(
        "Error al generar el PDF. Se abrió una nueva ventana para que pueda imprimir manualmente."
      );
    }
  }
};

// Función que usa el iframe del modal para generar el PDF (más confiable)
export const descargarPDFDesdeIframe = async (
  obra,
  presupuesto,
  modoCosto,
  movimientos = []
) => {
  try {
    // Buscar el iframe del modal de vista previa
    const iframe = document.querySelector(
      'iframe[title="Vista previa de impresión"]'
    );

    if (iframe && iframe.contentDocument && iframe.contentDocument.body) {
      // Usar el contenido del iframe que ya está renderizado
      const contenidoRenderizado = iframe.contentDocument.body;

      // Configuración optimizada para html2pdf
      const opt = {
        margin: [8, 8, 8, 8],
        filename: `${obra?.tipo === "presupuesto" ? "Presupuesto" : "Obra"}_${obra?.numeroPedido || "sin_numero"
          }.pdf`,
        image: { type: "jpeg", quality: 0.95 },
        html2canvas: {
          scale: 1.5,
          useCORS: true,
          allowTaint: true,
          backgroundColor: "#ffffff",
          letterRendering: true,
          foreignObjectRendering: true,
          width: 800, // Ancho fijo para mejor renderizado
          height: contenidoRenderizado.scrollHeight,
        },
        jsPDF: {
          unit: "mm",
          format: "a4",
          orientation: "portrait",
          compress: true,
          precision: 16,
        },
      };

      // Importar html2pdf dinámicamente
      const html2pdf = (await import("html2pdf.js")).default;

      // Generar PDF desde el contenido del iframe
      await html2pdf().set(opt).from(contenidoRenderizado).save();
    } else {
      // Si no hay iframe, usar la función robusta
      await descargarPDFRobusto(obra, presupuesto, modoCosto, movimientos);
    }
  } catch (error) {
    console.error("Error al generar PDF desde iframe:", error);

    // Fallback: usar la función robusta
    try {
      await descargarPDFRobusto(obra, presupuesto, modoCosto, movimientos);
    } catch (fallbackError) {
      console.error("Error en fallback:", fallbackError);

      // Último recurso: abrir en nueva ventana
      const contenidoHTML = generarContenidoImpresion(
        obra,
        presupuesto,
        modoCosto,
        movimientos
      );
      const nuevaVentana = window.open("", "_blank");
      nuevaVentana.document.write(contenidoHTML);
      nuevaVentana.document.close();

      alert(
        "Error al generar el PDF. Se abrió una nueva ventana para que pueda imprimir manualmente."
      );
    }
  }
};
