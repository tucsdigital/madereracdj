/**
 * Generador de PDF Remito usando Puppeteer
 * Replica exactamente el diseño de boleta/remito de ventas y presupuestos
 */

import { RemitoModel } from "./models";
import { formatCurrency, formatNumber, formatFechaLocal, escapeHtml, safeText } from "./formatters";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

/**
 * Genera el HTML completo del remito replicando el diseño actual
 */
function buildRemitoHtml(remito: RemitoModel, paraEmpleado: boolean = false): string {
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

  // Tipo de documento
  const tipoDocumento = tipo === "venta" ? "Venta / Comprobante" : "Presupuesto / Cotización";
  const tituloDocumento = tipo === "venta" ? "Maderas Caballero" : "Maderera Caballero";

  // Helper para valores seguros
  const safe = (val: string | undefined | null, fallback = "-") =>
    val && val.trim() ? escapeHtml(val.trim()) : fallback;

  // Generar HTML de items
  const itemsHtml = items.length > 0
    ? items
        .map(
          (item) => `
          <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 12px; font-weight: 500;">${safe(item.nombre)}</td>
            <td style="padding: 12px; text-align: center;">${item.cantidad}</td>
            <td style="padding: 12px; text-align: center;">
              ${
                item.cepillado
                  ? '<span style="display: inline-flex; align-items: center; gap: 4px; padding: 4px 8px; border-radius: 9999px; background: #dcfce7; color: #15803d; font-size: 12px; font-weight: 500;">✓ Sí</span>'
                  : item.categoria === "Maderas"
                  ? '<span style="display: inline-flex; align-items: center; gap: 4px; padding: 4px 8px; border-radius: 9999px; background: #f3f4f6; color: #4b5563; font-size: 12px; font-weight: 500;">✗ No</span>'
                  : '<span style="color: #9ca3af; font-size: 12px;">-</span>'
              }
            </td>
            ${
              !paraEmpleado
                ? `
            <td style="padding: 12px; text-align: right;" class="precio-empleado">${formatCurrency(item.precioUnitario)}</td>
            <td style="padding: 12px; text-align: right;" class="descuento-empleado">${item.descuento ? `${item.descuento.toFixed(2)}%` : "-"}</td>
            <td style="padding: 12px; text-align: right; font-weight: 500;" class="subtotal-empleado">${formatCurrency(item.subtotal)}</td>
            `
                : ""
            }
          </tr>
        `
        )
        .join("")
    : `
      <tr>
        <td colspan="${paraEmpleado ? 3 : 6}" style="padding: 12px; text-align: center; color: #6b7280;">
          Sin productos
        </td>
      </tr>
    `;

  // Generar HTML de totales
  const totalesHtml = !paraEmpleado
    ? `
      <div style="margin-top: 24px; display: flex; justify-content: flex-end;">
        <div style="background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; min-width: 300px;">
          <div style="display: flex; flex-direction: column; gap: 8px; font-size: 14px;">
            <div style="display: flex; justify-content: space-between;" class="subtotal-empleado">
              <span>Subtotal:</span>
              <span>${formatCurrency(totales.subtotal)}</span>
            </div>
            ${totales.descuentoTotal > 0 ? `
            <div style="display: flex; justify-content: space-between;" class="descuento-empleado">
              <span>Descuento total:</span>
              <span>${formatCurrency(totales.descuentoTotal)}</span>
            </div>
            ` : ""}
            ${totales.descuentoEfectivo && totales.descuentoEfectivo > 0 ? `
            <div style="display: flex; justify-content: space-between;" class="descuento-empleado">
              <span>Descuento (Efectivo 10%):</span>
              <span style="color: #16a34a;">${formatCurrency(totales.descuentoEfectivo)}</span>
            </div>
            ` : ""}
            ${totales.costoEnvio > 0 ? `
            <div style="display: flex; justify-content: space-between;" class="costo-envio-empleado">
              <span>${tipo === "venta" ? "Costo de envío:" : "Cotización de envío:"}</span>
              <span>${formatCurrency(totales.costoEnvio)}</span>
            </div>
            ` : ""}
            <div style="border-top: 2px solid #e5e7eb; padding-top: 12px; display: flex; justify-content: space-between; font-weight: 700; font-size: 18px;" class="total-empleado">
              <span>Total:</span>
              <span style="color: #2563eb;">${formatCurrency(totales.total)}</span>
            </div>
          </div>
        </div>
      </div>
    `
    : "";

  // Generar HTML de pagos (solo para ventas y si no es empleado)
  const pagosHtml =
    !paraEmpleado && tipo === "venta" && pagos
      ? `
      <div style="background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
        <h3 style="font-weight: 600; font-size: 18px; margin-bottom: 16px;">Información de Pagos</h3>
        <div style="display: flex; flex-direction: column; gap: 8px; font-size: 14px; margin-bottom: 16px;">
          <div style="display: flex; justify-content: space-between;" class="total-empleado">
            <span>Total de la venta:</span>
            <span style="font-weight: 600;">${formatCurrency(pagos.total)}</span>
          </div>
          <div style="display: flex; justify-content: space-between;" class="monto-abonado-empleado">
            <span>Monto abonado:</span>
            <span style="font-weight: 600; color: #16a34a;">${formatCurrency(pagos.montoAbonado)}</span>
          </div>
          ${pagos.saldoPendiente && pagos.saldoPendiente > 0 ? `
          <div style="display: flex; justify-content: space-between; border-top: 1px solid #e5e7eb; padding-top: 8px;" class="saldo-pendiente-empleado">
            <span>Saldo pendiente:</span>
            <span style="font-weight: 600; color: #dc2626;">${formatCurrency(pagos.saldoPendiente)}</span>
          </div>
          ` : ""}
        </div>
        ${pagos.pagos && pagos.pagos.length > 0 ? `
        <div class="historial-pagos-empleado">
          <h4 style="font-weight: 500; margin-bottom: 8px;">Historial de pagos:</h4>
          <table style="width: 100%; font-size: 14px; background: #fff; border-radius: 8px; padding: 12px;">
            <thead>
              <tr style="border-bottom: 1px solid #e5e7eb;">
                <th style="text-align: left; padding: 8px 4px; font-weight: 600;">Fecha</th>
                <th style="text-align: left; padding: 8px 4px; font-weight: 600;">Método</th>
                <th style="text-align: right; padding: 8px 4px; font-weight: 600;">Monto</th>
              </tr>
            </thead>
            <tbody>
              ${pagos.pagos
                .map(
                  (p) => `
              <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 8px 4px;">${safe(p.fecha)}</td>
                <td style="padding: 8px 4px;">${safe(p.metodo)}</td>
                <td style="padding: 8px 4px; text-align: right;">${formatCurrency(p.monto)}</td>
              </tr>
            `
                )
                .join("")}
            </tbody>
          </table>
        </div>
        ` : ""}
      </div>
    `
      : "";

  // Generar HTML completo
  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${tipoDocumento} - ${numero}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: 14px;
      line-height: 1.5;
      color: #1f2937;
      background: #fff;
      padding: 20px;
    }
    .container {
      max-width: 100%;
      margin: 0 auto;
    }
    .header {
      display: flex;
      align-items: center;
      gap: 16px;
      border-bottom: 1px solid #e5e7eb;
      padding-bottom: 16px;
      margin-bottom: 32px;
    }
    .header-logo {
      height: 60px;
      width: auto;
    }
    .header-info h1 {
      font-size: 24px;
      font-weight: 700;
      letter-spacing: 1px;
      margin-bottom: 4px;
    }
    .header-info .tipo {
      font-size: 14px;
      color: #4b5563;
      margin-bottom: 4px;
    }
    .header-info .web {
      font-size: 12px;
      color: #6b7280;
    }
    .header-meta {
      margin-left: auto;
      text-align: right;
    }
    .header-meta div {
      font-size: 12px;
      color: #6b7280;
      margin-bottom: 4px;
    }
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
      margin-bottom: 16px;
    }
    .card {
      background: #fff;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 16px;
    }
    .card h3 {
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 12px;
    }
    .card .info-row {
      font-size: 14px;
      margin-bottom: 8px;
    }
    .card .info-row .label {
      font-weight: 500;
    }
    .table-container {
      background: #fff;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 16px;
    }
    .table-container h3 {
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 16px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
    }
    thead tr {
      background: #f9fafb;
      border-bottom: 1px solid #e5e7eb;
    }
    th {
      padding: 12px;
      text-align: left;
      font-weight: 500;
    }
    th.text-center {
      text-align: center;
    }
    th.text-right {
      text-align: right;
    }
    tbody tr:hover {
      background: #f9fafb;
    }
    .observaciones {
      background: #fff;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 16px;
    }
    .observaciones h3 {
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 8px;
    }
    .observaciones p {
      color: #374151;
      white-space: pre-wrap;
    }
    ${paraEmpleado ? `
    .precio-empleado,
    .descuento-empleado,
    .subtotal-empleado,
    .total-empleado,
    .costo-envio-empleado,
    .monto-abonado-empleado,
    .saldo-pendiente-empleado,
    .estado-pago-empleado,
    .forma-pago-empleado,
    .historial-pagos-empleado {
      display: none !important;
    }
    ` : ""}
    @media print {
      body {
        padding: 0;
      }
      .container {
        max-width: 100%;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <div class="header">
      ${logoBase64 ? `<img src="${logoBase64}" alt="Logo" class="header-logo" />` : '<div class="header-logo" style="width: 60px; height: 60px; background: #e5e7eb; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-weight: 700;">LOGO</div>'}
      <div class="header-info">
        <h1>${safe(empresa.nombre, tituloDocumento)}</h1>
        <div class="tipo">${tipoDocumento}</div>
        <div class="web">${safe(empresa.web, "www.caballeromaderas.com")}</div>
      </div>
      <div class="header-meta">
        <div>Fecha: ${safe(fecha)}</div>
        ${tipo === "presupuesto" && fechaVencimiento ? `<div>Válido hasta: ${safe(fechaVencimiento)}</div>` : ""}
        <div>N°: ${safe(numero)}</div>
      </div>
    </div>

    <!-- Información del Cliente y Envío -->
    <div class="grid">
      <div class="card">
        <h3>Información del Cliente</h3>
        <div class="info-row"><span class="label">Nombre:</span> ${safe(cliente.nombre)}</div>
        <div class="info-row"><span class="label">CUIT / DNI:</span> ${safe(cliente.cuit)}</div>
        <div class="info-row"><span class="label">Dirección:</span> ${safe(cliente.direccion)}</div>
        ${cliente.localidad ? `<div class="info-row"><span class="label">Localidad:</span> ${safe(cliente.localidad)}</div>` : ""}
        <div class="info-row"><span class="label">Teléfono:</span> ${safe(cliente.telefono)}</div>
        ${cliente.email ? `<div class="info-row"><span class="label">Email:</span> ${safe(cliente.email)}</div>` : ""}
        ${cliente.partido ? `<div class="info-row"><span class="label">Partido:</span> ${safe(cliente.partido)}</div>` : ""}
        ${cliente.barrio ? `<div class="info-row"><span class="label">Barrio:</span> ${safe(cliente.barrio)}</div>` : ""}
      </div>

      <div class="card">
        <h3>${envio && envio.tipoEnvio !== "retiro_local" ? "Información de Envío y Pago" : "Información de Envío y Pago"}</h3>
        ${envio && envio.tipoEnvio !== "retiro_local" ? `
          <div class="info-row"><span class="label">Tipo de envío:</span> Envío a Domicilio</div>
          <div class="info-row"><span class="label">Dirección:</span> ${safe(envio.direccion)}</div>
          ${envio.localidad ? `<div class="info-row"><span class="label">Localidad:</span> ${safe(envio.localidad)}</div>` : ""}
          ${envio.fechaEntrega ? `<div class="info-row"><span class="label">Fecha de envío:</span> ${safe(envio.fechaEntrega)}</div>` : ""}
          ${envio.rangoHorario ? `<div class="info-row"><span class="label">Rango horario:</span> ${safe(envio.rangoHorario)}</div>` : ""}
        ` : `
          <div class="info-row"><span class="label">Tipo de entrega:</span> Retiro en local</div>
          ${envio && envio.fechaEntrega ? `<div class="info-row"><span class="label">Fecha de retiro:</span> ${safe(envio.fechaEntrega)}</div>` : ""}
        `}
        ${vendedor ? `<div class="info-row"><span class="label">Vendedor:</span> ${safe(vendedor)}</div>` : ""}
        ${formaPago ? `<div class="info-row forma-pago-empleado"><span class="label">Forma de pago:</span> ${safe(formaPago)}</div>` : ""}
        ${tipo === "venta" && pagos && pagos.estadoPago ? `
          <div class="info-row estado-pago-empleado">
            <span class="label">Estado de la venta:</span>
            <span style="font-weight: 700; margin-left: 8px; color: ${
              pagos.estadoPago === "pagado" ? "#15803d" :
              pagos.estadoPago === "parcial" ? "#b45309" : "#dc2626"
            };">
              ${pagos.estadoPago === "pagado" ? "Pagado" :
                pagos.estadoPago === "parcial" ? "Parcial" : "Pendiente"}
            </span>
          </div>
        ` : ""}
      </div>
    </div>

    <!-- Información de Pagos (solo ventas) -->
    ${pagosHtml}

    <!-- Productos y Servicios -->
    ${items.length > 0 ? `
    <div class="table-container">
      <h3>Productos y Servicios</h3>
      <table>
        <thead>
          <tr>
            <th>Producto</th>
            <th class="text-center">Cantidad</th>
            <th class="text-center">Cepillado</th>
            ${!paraEmpleado ? `
            <th class="text-right precio-empleado">Precio Unit.</th>
            <th class="text-right descuento-empleado">Descuento</th>
            <th class="text-right subtotal-empleado">Subtotal</th>
            ` : ""}
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>
      ${totalesHtml}
    </div>
    ` : ""}

    <!-- Observaciones -->
    ${observaciones ? `
    <div class="observaciones">
      <h3>Observaciones</h3>
      <p>${escapeHtml(observaciones)}</p>
    </div>
    ` : ""}
  </div>
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
  const isProduction = process.env.NODE_ENV === "production" || process.env.VERCEL;
  
  let browser;
  
  if (isProduction) {
    // Producción: usar @sparticuz/chromium
    const loadModule = new Function("moduleName", "return require(moduleName)");
    const chromium = loadModule("@sparticuz/chromium");
    const puppeteerCore = loadModule("puppeteer-core");
    chromium.setGraphicsMode = false;
    
    browser = await puppeteerCore.launch({
      args: chromium.args,
      defaultViewport: {
        deviceScaleFactor: 1,
        hasTouch: false,
        height: 1080,
        isLandscape: true,
        isMobile: false,
        width: 1920,
      },
      executablePath: await chromium.executablePath(),
      headless: "shell",
    });
  } else {
    // Desarrollo: usar puppeteer normal
    const loadModule = new Function("moduleName", "return require(moduleName)");
    const puppeteer = loadModule("puppeteer");
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  }

  const page = await browser.newPage();
  const html = buildRemitoHtml(remito, paraEmpleado);
  await page.setContent(html, { waitUntil: "networkidle0" });

  const pdfBuffer = await page.pdf({
    format: "A4",
    printBackground: true,
    margin: {
      top: "20mm",
      bottom: "20mm",
      left: "20mm",
      right: "20mm",
    },
  });

  await browser.close();
  return pdfBuffer as Buffer;
}
