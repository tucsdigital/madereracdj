/**
 * Generador de PDF Remito usando Puppeteer
 * Replica exactamente el diseño de boleta/remito de ventas y presupuestos
 */

import { RemitoModel } from "./models";
import { formatCurrency, formatNumber, formatFechaLocal, escapeHtml, safeText } from "./formatters";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { getBrowser } from "./browser-pool";

/**
 * Genera el HTML completo del remito replicando el diseño del PDF de referencia
 * @param remito - Datos del remito
 * @param paraEmpleado - Si es true, oculta precios
 * @param autoPrint - Si es true, incluye scripts para imprimir automáticamente (solo para PDF, no para impresión directa)
 */
export function buildRemitoHtml(remito: RemitoModel, paraEmpleado: boolean = false, autoPrint: boolean = false): string {
  const {
    numero,
    fecha,
    tipo,
    fechaVencimiento,
    empresa,
    cliente,
    envio,
    items,
    totales,
    pagos,
    observaciones,
    formaPago,
    vendedor,
  } = remito;

  const esVenta = tipo === "venta";
  const esPresupuesto = tipo === "presupuesto";

  // Información de pagos para ventas
  const estadoPago = pagos?.estadoPago;
  const tieneHistorialPagos = pagos?.pagos && pagos.pagos.length > 0;

  // Cargar logo como base64
  let logoBase64 = "";
  try {
    if (empresa.logoUrl) {
      const logoFileName = empresa.logoUrl.replace(/^\//, "");
      const logoPath = join(process.cwd(), "public", logoFileName);
      
      if (existsSync(logoPath)) {
        const logoBuffer = readFileSync(logoPath);
        const logoMimeType = logoPath.endsWith(".png") ? "image/png" : 
                            logoPath.endsWith(".jpg") || logoPath.endsWith(".jpeg") ? "image/jpeg" : 
                            "image/png";
        logoBase64 = `data:${logoMimeType};base64,${logoBuffer.toString("base64")}`;
      }
    }
  } catch (error: any) {
    console.error("Error al cargar el logo:", error?.message);
  }

  // Helper para valores seguros y uppercase
  const safe = (val: string | undefined | null, fallback = "-") =>
    val && val.trim() ? escapeHtml(val.trim().toUpperCase()) : fallback;

  // Generar HTML de items de productos
  const itemsHtml = items.length > 0
    ? items
        .map(
          (item) => `
          <tr>
            <td style="padding: 10px 8px; text-align: center; font-weight: 800; color: #000000; font-size: 12px;">${item.cantidad}</td>
            <td style="padding: 10px 8px; font-weight: 700; color: #000000; font-size: 11.5px;">${safe(item.nombre)}</td>
            <td style="padding: 10px 8px; text-align: center; color: #000000; font-size: 11px; font-weight: 700;">${item.cepillado ? "✓ Sí" : "No"}</td>
            ${!paraEmpleado ? `
            <td style="padding: 10px 8px; text-align: right; color: #000000; font-size: 11.5px; font-weight: 800;">${formatCurrency(item.precioUnitario || 0)}</td>
            <td style="padding: 10px 8px; text-align: right; font-weight: 800; color: #000000; font-size: 12px;">${formatCurrency(item.subtotal || 0)}</td>
            ` : `
            <td style="padding: 10px 8px; text-align: right;" class="precio-empleado"></td>
            <td style="padding: 10px 8px; text-align: right; font-weight: 600;" class="total-empleado"></td>
            `}
          </tr>
        `
        )
        .join("")
    : `
      <tr>
        <td colspan="${paraEmpleado ? 3 : 5}" style="padding: 12px; text-align: center; color: #000000; font-weight: 700;">
          Sin productos
        </td>
      </tr>
    `;

  // Agregar solo 2-3 filas vacías si hay pocos items (solo para llenar un poco el espacio)
  // No agregar si hay muchos items (Puppeteer manejará el overflow automáticamente)
    let filasVacias = "";
    if (items.length > 0 && items.length < 8) {
      const numFilasVacias = Math.min(3, 8 - items.length);
      filasVacias = Array.from({ length: numFilasVacias }, () => `
      <tr>
        <td style="padding: 8px 6px; height: 32px;"></td>
        <td style="padding: 8px 6px;"></td>
        <td style="padding: 8px 6px;"></td>
        ${!paraEmpleado ? `
        <td style="padding: 8px 6px;"></td>
        <td style="padding: 8px 6px;"></td>
        ` : `
        <td style="padding: 8px 6px;" class="precio-empleado"></td>
        <td style="padding: 8px 6px;" class="total-empleado"></td>
        `}
      </tr>
    `).join("");
    }

  // Generar filas de totales en el footer de la tabla (alineados como en el PDF)
  const totalesRowsHtml = !paraEmpleado
    ? `
      <tr>
        <td colspan="2" style="padding: 6px;"></td>
        <td style="padding: 6px;"></td>
        <td style="padding: 6px; text-align: right; font-weight: 800; color: #000000; font-size: 11px;">DESCUENTO</td>
        <td style="padding: 6px; text-align: right; font-weight: 800; color: #000000; font-size: 11px;">${formatCurrency(totales.descuentoTotal || 0)}</td>
      </tr>
      <tr>
        <td colspan="2" style="padding: 6px;"></td>
        <td style="padding: 6px;"></td>
        <td style="padding: 6px; text-align: right; font-weight: 800; color: #000000; font-size: 11px;">SUBTOTAL</td>
        <td style="padding: 6px; text-align: right; font-weight: 800; color: #000000; font-size: 11px;">${formatCurrency(totales.subtotal)}</td>
      </tr>
      <tr>
        <td colspan="2" style="padding: 6px;"></td>
        <td style="padding: 6px;"></td>
        <td style="padding: 6px; text-align: right; font-weight: 900; font-size: 14px; color: #000000;">TOTAL</td>
        <td style="padding: 6px; text-align: right; font-weight: 900; font-size: 14px; color: #000000;">${formatCurrency(totales.total)}</td>
      </tr>
    `
    : "";

  // Información de envío - Solo si NO es retiro local
  const esRetiroLocal = !envio || !envio.tipoEnvio || envio.tipoEnvio === "retiro_local";
  const tipoEnvio = esRetiroLocal ? "RETIRO EN LOCAL" : "DOMICILIO";
  const fechaEntrega = esRetiroLocal ? null : (envio?.fechaEntrega || null);
  const lugarEntrega = esRetiroLocal ? null : (envio?.direccion || cliente.direccion || null);
  const entreCalles = esRetiroLocal ? null : "-"; // No está en el modelo actual
  const telEnvio = esRetiroLocal ? null : (cliente.telefono || null);

  // Combinar localidad y provincia
  const provinciaCompleta = cliente.localidad && cliente.partido
    ? `${safe(cliente.localidad)} - ${safe(cliente.partido)}`
    : cliente.localidad
    ? safe(cliente.localidad)
    : cliente.partido
    ? safe(cliente.partido)
    : "-";
  
  // Combinar dirección con provincia
  const direccionCompleta = provinciaCompleta && provinciaCompleta !== "-"
    ? `${safe(cliente.direccion)} - ${provinciaCompleta}`
    : safe(cliente.direccion);

  // Construir HTML de estado de pago (solo para ventas, se incrusta dentro del bloque de envío)
  const paymentStatusHtml =
    esVenta && estadoPago
      ? (() => {
          const estadoLabel =
            estadoPago === "pagado"
              ? "PAGADO"
              : estadoPago === "parcial"
              ? "PAGO PARCIAL"
              : "PENDIENTE";

          const total = pagos?.total ?? totales.total;
          const abonado = pagos?.montoAbonado ?? 0;
          const saldo = pagos?.saldoPendiente ?? Math.max(total - abonado, 0);

          const historyRows =
            estadoPago === "parcial" && tieneHistorialPagos
              ? pagos!.pagos!
                  .map(
                    (p) => `
                <tr>
                  <td>${safe(p.fecha)}</td>
                  <td>${escapeHtml(p.metodo.toUpperCase())}</td>
                  <td style="text-align: right;">${formatCurrency(p.monto)}</td>
                </tr>
              `
                  )
                  .join("")
              : "";

          return `
        <div class="payment-inline">
          <div class="payment-row"><strong>Estado de pago:</strong> ${estadoLabel}</div>
          <div class="payment-row"><strong>Total venta:</strong> ${formatCurrency(total)}</div>
          <div class="payment-row"><strong>Monto abonado:</strong> ${formatCurrency(abonado)}</div>
          <div class="payment-row"><strong>Saldo pendiente:</strong> ${formatCurrency(saldo)}</div>
          ${
            historyRows
              ? `
          <div class="payment-history">
            <div class="payment-history-title">Historial de pagos</div>
            <table class="payment-history-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Método</th>
                  <th style="text-align: right;">Monto</th>
                </tr>
              </thead>
              <tbody>
                ${historyRows}
              </tbody>
            </table>
          </div>
          `
              : ""
          }
        </div>
      `;
        })()
      : "";

  // Generar HTML completo - Diseño minimalista UI/UX moderno
  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esVenta ? "REMITO" : "PRESUPUESTO / COTIZACIÓN"} - ${numero}</title>
  <style>
    @page {
      margin: 0;
      size: A4;
    }
    @media print {
      body {
        margin: 0;
        padding: 0;
      }
      .no-print {
        display: none !important;
      }
    }
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, Helvetica, sans-serif;
      font-size: 12px;
      line-height: 1.4;
      color: #000000;
      background: #fff;
      width: 210mm;
      min-height: 297mm;
      padding: 8mm 10mm;
      display: flex;
      flex-direction: column;
    }
    .page {
      width: 100%;
      flex: 1;
      display: flex;
      flex-direction: column;
    }
    .main {
      flex: 1;
      display: flex;
      flex-direction: column;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 14px;
      padding-bottom: 12px;
      border-bottom: 1px solid #000000;
    }
    .header-left {
      flex: 0 0 52%;
      display: flex;
      align-items: flex-start;
      gap: 10px;
    }
    .header-logo-container {
      width: 90px;
      height: 90px;
      flex-shrink: 0;
      background: transparent;
      border: none;
      padding: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .header-logo {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
    .header-empresa {
      flex: 1;
    }
    .header-empresa h1 {
      font-size: 18px;
      font-weight: 900;
      margin-bottom: 3px;
      letter-spacing: 0.2px;
      line-height: 1.3;
      color: #000000;
    }
    .header-empresa .direccion {
      font-size: 11px;
      color: #000000;
      margin-bottom: 2px;
      line-height: 1.3;
      font-weight: 600;
    }
    .header-empresa .telefono {
      font-size: 11px;
      color: #000000;
      line-height: 1.3;
      font-weight: 600;
    }
    .header-center {
      flex: 0 0 14%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-start;
      padding: 0 6px;
    }
    .x-box {
      width: 70px;
      height: 70px;
      border: 3px solid #000000;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 50px;
      font-weight: 900;
      margin-bottom: 6px;
      color: #000000;
      background: #fff;
    }
    .documento-invalido {
      font-size: 10px;
      text-align: center;
      line-height: 1.2;
      font-weight: 800;
      color: #000000;
    }
    .header-right {
      flex: 0 0 34%;
      border: 1px solid #000000;
      border-radius: 8px;
      padding: 10px;
      text-align: center;
      background: #fff;
    }
    .header-right .remito-title {
      font-size: 16px;
      font-weight: 900;
      margin-bottom: 6px;
      letter-spacing: 0.5px;
      color: #000000;
    }
    .header-right .remito-numero {
      font-size: 12px;
      font-weight: 800;
      margin-bottom: 3px;
      color: #000000;
    }
    .header-right .remito-fecha {
      font-size: 11px;
      font-weight: 700;
      color: #000000;
    }
    .client-section {
      margin-bottom: 14px;
      border: 1px solid #000000;
      border-radius: 10px;
      padding: 14px;
      background: #fff;
    }
    .client-grid {
      display: flex;
      gap: 20px;
    }
    .client-col {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .client-row {
      display: flex;
      align-items: baseline;
      gap: 8px;
      line-height: 1.5;
    }
    .client-label {
      font-weight: 800;
      font-size: 11px;
      color: #000000;
      min-width: 80px;
    }
    .client-value {
      font-size: 11px;
      color: #000000;
      font-weight: 700;
      flex: 1;
    }
    .products-section {
      flex: 1;
      margin-bottom: 14px;
      min-height: 0;
    }
    .products-table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      border: 1px solid #000000;
      border-radius: 10px;
      font-size: 11px;
      background: #fff;
      overflow: hidden;
    }
    .products-table thead {
      background: #fff;
    }
    .products-table th {
      padding: 6px 6px;
      text-align: left;
      font-weight: 900;
      border-bottom: 1px solid #000000;
      font-size: 12px;
      color: #000000;
      letter-spacing: 0.3px;
      text-transform: uppercase;
    }
    .products-table th:not(:last-child) {
      border-right: 1px solid #000000;
    }
    .products-table th.text-center {
      text-align: center;
    }
    .products-table th.text-right {
      text-align: right;
    }
    .products-table td {
      padding: 6px 6px;
      line-height: 1.3;
      color: #000000;
      vertical-align: middle;
    }
    .products-table td:not(:last-child) {
      border-right: 1px solid #000000;
    }
    .products-table tbody td {
      border-bottom: 1px solid #e5e7eb;
    }
    .products-table tbody tr:last-child td {
      border-bottom: none;
    }
    .products-table tfoot {
      background: #fff;
    }
    .products-table tfoot td {
      padding: 8px;
      background: #fff;
    }
    .products-table tfoot td:not(:last-child) {
      border-right: 1px solid #000000;
    }
    .products-table tfoot tr:first-child td {
      border-top: 1px solid #000000;
    }
    .products-table tfoot tr:last-child td {
      border-top: 1px solid #000000;
      background: #fff;
      font-weight: 900;
    }
    .bottom {
      margin-top: 20px;
      padding-top: 12px;
      padding-bottom: 15mm;
    }
    .disclaimer {
      font-size: 10px;
      color: #000000;
      line-height: 1.4;
      margin-bottom: 10px;
      text-align: justify;
      padding: 10px 12px;
      background: #fff;
      border-radius: 6px;
      border: 1px solid #000000;
      font-weight: 600;
    }
    .firmas {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 10px;
    }
    .firma-col {
      flex: 1;
      text-align: center;
      font-size: 11px;
      font-weight: 700;
      color: #000000;
      padding: 10px 6px;
      background: #fff;
      border-radius: 6px;
      border: 1px solid #000000;
      min-height: 45px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .envio-info {
      font-size: 10px;
      color: #000000;
      margin-bottom: 8px;
      line-height: 1.5;
      padding: 10px 12px;
      background: #fff;
      border-radius: 6px;
      border: 1px solid #000000;
      font-weight: 600;
      display: flex;
      justify-content: space-between;
      gap: 16px;
    }
    .envio-info strong {
      font-weight: 800;
      color: #000000;
      margin-right: 4px;
    }
    .envio-info-item {
      margin-bottom: 3px;
    }
    .envio-info-item:last-child {
      margin-bottom: 0;
    }
    .envio-info-left {
      flex: 1;
      min-width: 0;
    }
    .envio-info-right {
      flex: 1;
      min-width: 0;
      border-left: 1px solid #000000;
      padding-left: 12px;
    }
    .payment-inline {
      font-size: 10px;
      line-height: 1.5;
    }
    .payment-row {
      margin-bottom: 3px;
    }
    .payment-history {
      margin-top: 4px;
    }
    .payment-history-title {
      font-size: 10px;
      font-weight: 800;
      margin-bottom: 4px;
    }
    .payment-history-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 9px;
    }
    .payment-history-table th,
    .payment-history-table td {
      padding: 3px 4px;
      border-top: 1px solid #e5e7eb;
    }
    .payment-history-table th {
      font-weight: 800;
      text-align: left;
    }
    .footer-bottom {
      display: flex;
      justify-content: flex-end;
      align-items: center;
      gap: 8px;
      font-size: 7px;
      color: #000000;
      margin-top: 6px;
      font-weight: 600;
    }
    .page-continuation {
      font-size: 8px;
      color: #000000;
      text-align: center;
      padding: 8px;
      margin-bottom: 8px;
      font-style: italic;
      font-weight: 700;
    }
    .observaciones-section {
      margin-top: 14px;
      margin-bottom: 14px;
      border: 1px solid #000000;
      border-radius: 10px;
      padding: 14px;
      background: #fff;
    }
    .observaciones-title {
      font-size: 12px;
      font-weight: 900;
      color: #000000;
      margin-bottom: 8px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }
    .observaciones-content {
      font-size: 11px;
      color: #000000;
      line-height: 1.5;
      font-weight: 600;
      white-space: pre-wrap;
    }
    ${paraEmpleado ? `
    .precio-empleado,
    .total-empleado {
      display: none !important;
    }
    ` : ""}
  </style>
</head>
<body>
  <div class="page">
    <div class="main">
      <!-- Header con 3 zonas -->
      <div class="header">
        <div class="header-left">
          ${logoBase64 ? `<div class="header-logo-container"><img src="${logoBase64}" alt="Logo" class="header-logo" /></div>` : ""}
          <div class="header-empresa">
            <h1>${safe(empresa.nombre, "MADERAS CABALLERO")}</h1>
            <div class="direccion">${safe(empresa.direccion, "AV. DR. HONORIO PUEYRREDÓN 4625, VILLA ROSA, BUENOS AIRES")}</div>
            <div class="telefono">Tel: ${safe(empresa.telefono, "11-3497-6239")}</div>
            <div class="telefono">${safe(empresa.web, "WWW.CABALLEROMADERAS.COM")}</div>
          </div>
        </div>
        <div class="header-center">
          <div class="x-box">X</div>
          <div class="documento-invalido">
            DOCUMENTO<br/>
            NO VALIDO<br/>
            COMO FACTURA
          </div>
        </div>
        <div class="header-right">
          <div class="remito-title">
            ${esVenta ? "REMITO" : "PRESUPUESTO / COTIZACIÓN"}
          </div>
          <div class="remito-numero">N° ${safe(numero)}</div>
          <div class="remito-fecha">FECHA ${safe(fecha)}</div>
        </div>
      </div>

      <!-- Información del Cliente -->
      <div class="client-section">
        <div class="client-grid">
          <div class="client-col">
            <div class="client-row">
              <span class="client-label">Cliente:</span>
              <span class="client-value">${safe(cliente.nombre)}</span>
            </div>
            <div class="client-row">
              <span class="client-label">CUIT:</span>
              <span class="client-value">${safe(cliente.cuit)}</span>
            </div>
            <div class="client-row">
              <span class="client-label">Forma Pago:</span>
              <span class="client-value">${safe(formaPago)}</span>
            </div>
          </div>
          <div class="client-col">
            <div class="client-row">
              <span class="client-label">Dirección:</span>
              <span class="client-value">${safe(cliente.direccion)}</span>
            </div>
            <div class="client-row">
              <span class="client-label">Provincia:</span>
              <span class="client-value">${provinciaCompleta}</span>
            </div>
            <div class="client-row">
              <span class="client-label">Teléfono:</span>
              <span class="client-value">${safe(cliente.telefono)}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Tabla de Productos -->
      <div class="products-section">
        <table class="products-table">
          <thead>
            <tr>
              <th class="text-center" style="width: 10%;">CANTIDAD</th>
              <th style="width: 40%;">DETALLE</th>
              <th class="text-center" style="width: 15%;">CEPILLADO</th>
              ${!paraEmpleado ? `
              <th class="text-right" style="width: 17.5%;">PRECIO UNIT.</th>
              <th class="text-right" style="width: 17.5%;">TOTAL</th>
              ` : `
              <th class="text-right precio-empleado" style="width: 17.5%;"></th>
              <th class="text-right total-empleado" style="width: 17.5%;"></th>
              `}
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
            ${filasVacias}
          </tbody>
          ${!paraEmpleado ? `
          <tfoot>
            ${totalesRowsHtml}
          </tfoot>
          ` : ""}
        </table>
      </div>

      ${observaciones && observaciones.trim() ? `
      <!-- Observaciones -->
      <div class="observaciones-section">
        <div class="observaciones-title">Observaciones</div>
        <div class="observaciones-content">${escapeHtml(observaciones.trim())}</div>
      </div>
      ` : ""}
    </div>

    <!-- Footer -->
    <div class="bottom">
      ${tipo === "venta" ? `
      <div class="disclaimer">
        ESTE REMITO NO ES VÁLIDO COMO FACTURA. VERIFIQUE LA MERCADERÍA AL RECIBIRLA. RECLAMOS DENTRO DE LAS 48 HS DE ENTREGADA LA MISMA. TODA LA MERCADERÍA SERÁ DESCARGADA SIN EXCEPCIÓN ALGUNA AL PIE DEL CAMIÓN.
      </div>
      
      <div class="firmas">
        <div class="firma-col">Firma</div>
        <div class="firma-col">Aclaración</div>
        <div class="firma-col">Documento N°</div>
      </div>
      ` : ""}
      ${!esRetiroLocal ? `
      <div class="envio-info">
        <div class="envio-info-left">
          <div class="envio-info-item"><strong>Tipo de envío:</strong> ${tipoEnvio}</div>
          ${fechaEntrega ? `<div class="envio-info-item"><strong>Fecha entrega:</strong> ${safe(fechaEntrega)}</div>` : ""}
          ${lugarEntrega ? `<div class="envio-info-item"><strong>Lugar entrega:</strong> ${safe(lugarEntrega)}</div>` : ""}
          ${entreCalles && entreCalles !== "-" ? `<div class="envio-info-item"><strong>Entre calles:</strong> ${safe(entreCalles)}</div>` : ""}
          ${telEnvio ? `<div class="envio-info-item"><strong>Tel:</strong> ${safe(telEnvio)}</div>` : ""}
        </div>
        ${
          paymentStatusHtml
            ? `<div class="envio-info-right">${paymentStatusHtml}</div>`
            : ""
        }
      </div>
      ` : ""}

      <div class="footer-bottom">
        <div>ORIGINAL BLANCO / DUPLICADO COLOR</div>
        <div>1/1</div>
      </div>
    </div>
  </div>
  ${autoPrint ? `
  <script>
    // Imprimir automáticamente cuando la página se carga (solo para PDF)
    window.onload = function() {
      setTimeout(function() {
        window.print();
      }, 100);
    };
    
    // Fallback: si onload no funciona, intentar cuando el DOM esté listo
    if (document.readyState === 'complete') {
      setTimeout(function() {
        window.print();
      }, 100);
    } else {
      document.addEventListener('DOMContentLoaded', function() {
        setTimeout(function() {
          window.print();
        }, 100);
      });
    }
  </script>
  ` : ''}
</body>
</html>
  `;
}

/**
 * Genera un buffer PDF del remito usando Puppeteer
 */
export async function generateRemitoPDFBuffer(
  remito: RemitoModel,
  paraEmpleado: boolean = false
): Promise<Buffer> {
  // Verificar que estamos en Node.js
  if (typeof window !== "undefined") {
    throw new Error("Este código solo puede ejecutarse en el servidor Node.js");
  }

  // Obtener navegador del pool (reutiliza instancia existente)
  const browser = await getBrowser();
  const page = await browser.newPage();
  
  // Deshabilitar JavaScript completamente - no lo necesitamos para HTML estático
  await page.setJavaScriptEnabled(false);
  
  // Deshabilitar recursos innecesarios para mayor velocidad
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    const resourceType = req.resourceType();
    const url = req.url();
    // Permitir data URLs (imágenes base64 inline) y bloquear solo recursos externos
    if (url.startsWith("data:")) {
      req.continue();
    } else if (["image", "font", "stylesheet", "script", "websocket", "manifest", "xhr", "fetch", "media"].includes(resourceType)) {
      req.abort();
    } else {
      req.continue();
    }
  });
  
  // Deshabilitar cache para evitar esperas innecesarias
  await page.setCacheEnabled(false);
  
  const html = buildRemitoHtml(remito, paraEmpleado);
  // Usar 'domcontentloaded' - el más rápido, solo espera el DOM sin recursos
  // Timeout reducido a 1 segundo para mayor velocidad
  await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 1000 });

  // Generar PDF - Puppeteer manejará automáticamente el overflow a nuevas páginas
  // Optimizaciones adicionales para velocidad
  const pdfBuffer = await page.pdf({
    format: "A4",
    printBackground: true,
    margin: {
      top: "2mm",
      bottom: "8mm",
      left: "2mm",
      right: "2mm",
    },
    preferCSSPageSize: true,
    displayHeaderFooter: false,
    // Deshabilitar outline para mayor velocidad
    outline: false,
    // Timeout reducido a 5 segundos para mayor velocidad
    timeout: 5000,
  });

  // Cerrar solo la página, mantener el navegador para reutilización
  try {
    await page.close();
  } catch (e) {
    // Ignorar errores al cerrar página
  }
  
  // NO cerramos el navegador aquí - se mantiene en el pool para reutilización
  // El navegador se cerrará automáticamente después de 30 segundos de inactividad
  
  return pdfBuffer as Buffer;
}
