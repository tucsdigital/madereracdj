/**
 * Generador de PDF Remito usando Puppeteer
 * Replica exactamente el diseño de boleta/remito de ventas y presupuestos
 */

import { RemitoModel } from "./models";
import { formatCurrency, formatNumber, formatFechaLocal, escapeHtml, safeText } from "./formatters";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

/**
 * Genera el HTML completo del remito replicando el diseño del PDF de referencia
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

  // Helper para valores seguros y uppercase
  const safe = (val: string | undefined | null, fallback = "-") =>
    val && val.trim() ? escapeHtml(val.trim().toUpperCase()) : fallback;

  // Generar HTML de items de productos
  const itemsHtml = items.length > 0
    ? items
        .map(
          (item) => `
          <tr>
            <td style="padding: 10px 8px; text-align: center; font-weight: 600; color: #111827; font-size: 10px;">${item.cantidad}</td>
            <td style="padding: 10px 8px; font-weight: 500; color: #1f2937; font-size: 9.5px;">${safe(item.nombre)}</td>
            <td style="padding: 10px 8px; text-align: center; color: #6b7280; font-size: 9px; font-weight: 500;">${item.cepillado ? "✓ Sí" : "No"}</td>
            ${!paraEmpleado ? `
            <td style="padding: 10px 8px; text-align: right; color: #374151; font-size: 9.5px; font-weight: 500;">${formatCurrency(item.precioUnitario || 0)}</td>
            <td style="padding: 10px 8px; text-align: right; font-weight: 600; color: #111827; font-size: 10px;">${formatCurrency(item.subtotal || 0)}</td>
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
        <td colspan="${paraEmpleado ? 3 : 5}" style="padding: 12px; text-align: center; color: #6b7280;">
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
      <tr style="border-bottom: 1px solid #f3f4f6;">
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
        <td style="padding: 6px; text-align: right; font-weight: 600; color: #4b5563;">DESCUENTO</td>
        <td style="padding: 6px; text-align: right; font-weight: 600; color: #1f2937;">${formatCurrency(totales.descuentoTotal || 0)}</td>
      </tr>
      <tr>
        <td colspan="2" style="padding: 6px;"></td>
        <td style="padding: 6px;"></td>
        <td style="padding: 6px; text-align: right; font-weight: 600; color: #4b5563;">SUBTOTAL</td>
        <td style="padding: 6px; text-align: right; font-weight: 600; color: #1f2937;">${formatCurrency(totales.subtotal)}</td>
      </tr>
      <tr>
        <td colspan="2" style="padding: 6px;"></td>
        <td style="padding: 6px;"></td>
        <td style="padding: 6px; text-align: right; font-weight: 700; font-size: 11px; color: #111827;">TOTAL</td>
        <td style="padding: 6px; text-align: right; font-weight: 700; font-size: 11px; color: #111827;">${formatCurrency(totales.total)}</td>
      </tr>
    `
    : "";

  // Información de envío
  const tipoEnvio = envio && envio.tipoEnvio && envio.tipoEnvio !== "retiro_local" 
    ? "DOMICILIO" 
    : "RETIRO EN LOCAL";
  const fechaEntrega = envio?.fechaEntrega || "-";
  const lugarEntrega = envio?.direccion || cliente.direccion || "-";
  const entreCalles = "-"; // No está en el modelo actual
  const telEnvio = cliente.telefono || "-";

  // Combinar localidad y provincia
  const provinciaCompleta = cliente.localidad && cliente.partido
    ? `${safe(cliente.localidad)} - ${safe(cliente.partido)}`
    : cliente.localidad
    ? safe(cliente.localidad)
    : cliente.partido
    ? safe(cliente.partido)
    : "-";

  // Generar HTML completo - Diseño minimalista UI/UX moderno
  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>REMITO - ${numero}</title>
  <style>
    @page {
      margin: 0;
      size: A4;
    }
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, Helvetica, sans-serif;
      font-size: 10px;
      line-height: 1.4;
      color: #1f2937;
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
      margin-bottom: 10px;
      padding-bottom: 8px;
      border-bottom: 1px solid #e5e7eb;
    }
    .header-left {
      flex: 0 0 52%;
      display: flex;
      align-items: flex-start;
      gap: 10px;
    }
    .header-logo-container {
      width: 60px;
      height: 60px;
      flex-shrink: 0;
      background: #fff;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
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
      font-size: 15px;
      font-weight: 700;
      margin-bottom: 3px;
      letter-spacing: 0.2px;
      line-height: 1.3;
      color: #111827;
    }
    .header-empresa .direccion {
      font-size: 9px;
      color: #6b7280;
      margin-bottom: 2px;
      line-height: 1.3;
    }
    .header-empresa .telefono {
      font-size: 9px;
      color: #6b7280;
      line-height: 1.3;
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
      width: 48px;
      height: 48px;
      border: 1.5px solid #fecaca;
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 26px;
      font-weight: 700;
      margin-bottom: 6px;
      color: #db2525;
      background: #fee2e2;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
    }
    .documento-invalido {
      font-size: 7px;
      text-align: center;
      line-height: 1.2;
      font-weight: 600;
      color: #6b7280;
    }
    .header-right {
      flex: 0 0 34%;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 10px;
      text-align: center;
      background: #f9fafb;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
    }
    .header-right .remito-title {
      font-size: 13px;
      font-weight: 700;
      margin-bottom: 6px;
      letter-spacing: 0.5px;
      color: #111827;
    }
    .header-right .remito-numero {
      font-size: 10px;
      font-weight: 600;
      margin-bottom: 3px;
      color: #374151;
    }
    .header-right .remito-fecha {
      font-size: 9px;
      font-weight: 500;
      color: #6b7280;
    }
    .client-section {
      margin-bottom: 12px;
      border: 1px solid #e5e7eb;
      border-radius: 10px;
      padding: 12px;
      background: #fff;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
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
      font-weight: 600;
      font-size: 9px;
      color: #374151;
      min-width: 80px;
    }
    .client-value {
      font-size: 9px;
      color: #111827;
      font-weight: 500;
      flex: 1;
    }
    .products-section {
      flex: 1;
      margin-bottom: 10px;
      min-height: 0;
    }
    .products-table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      border: 1px solid #e5e7eb;
      border-radius: 10px;
      font-size: 9px;
      overflow: hidden;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.06);
      background: #fff;
    }
    .products-table thead {
      background: linear-gradient(to bottom, #f9fafb, #f3f4f6);
    }
    .products-table th {
      padding: 10px 8px;
      text-align: left;
      font-weight: 700;
      border-bottom: 2px solid #e5e7eb;
      font-size: 10px;
      color: #111827;
      letter-spacing: 0.3px;
      text-transform: uppercase;
    }
    .products-table th.text-center {
      text-align: center;
    }
    .products-table th.text-right {
      text-align: right;
    }
    .products-table td {
      padding: 10px 8px;
      border-bottom: 1px solid #f3f4f6;
      line-height: 1.5;
      color: #1f2937;
      vertical-align: middle;
    }
    .products-table tbody tr {
      transition: background-color 0.2s;
    }
    .products-table tbody tr:not(:last-child) {
      border-bottom: 1px solid #f3f4f6;
    }
    .products-table tbody tr:hover {
      background: #fafafa;
    }
    .products-table tbody tr:last-child td {
      border-bottom: none;
    }
    .products-table tfoot {
      background: #f9fafb;
    }
    .products-table tfoot td {
      padding: 8px;
      border-top: 2px solid #e5e7eb;
      background: #f9fafb;
    }
    .products-table tfoot tr:last-child td {
      border-top: 2px solid #d1d5db;
      background: #f3f4f6;
      font-weight: 700;
    }
    .bottom {
      margin-top: 20px;
      padding-top: 12px;
    }
    .disclaimer {
      font-size: 8px;
      color: #6b7280;
      line-height: 1.4;
      margin-bottom: 8px;
      text-align: justify;
      padding: 8px 10px;
      background: #f3f4f6;
      border-radius: 8px;
      border: 1px solid #e5e7eb;
    }
    .firmas {
      display: flex;
      justify-content: space-between;
      gap: 6px;
      margin-bottom: 8px;
    }
    .firma-col {
      flex: 1;
      text-align: center;
      font-size: 9px;
      font-weight: 600;
      color: #374151;
      padding: 8px;
      background: #f3f4f6;
      border-radius: 8px;
      border: 1px solid #e5e7eb;
    }
    .envio-info {
      font-size: 8px;
      color: #374151;
      margin-bottom: 6px;
      line-height: 1.4;
      padding: 8px 10px;
      background: #f3f4f6;
      border-radius: 8px;
      border: 1px solid #e5e7eb;
    }
    .envio-info strong {
      font-weight: 600;
      color: #1f2937;
    }
    .footer-bottom {
      display: flex;
      justify-content: flex-end;
      align-items: center;
      font-size: 8px;
      color: #9ca3af;
      margin-top: 4px;
    }
    .page-continuation {
      font-size: 8px;
      color: #9ca3af;
      text-align: center;
      padding: 8px;
      margin-bottom: 8px;
      font-style: italic;
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
          <div class="remito-title">REMITO</div>
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
              <span class="client-label">CP:</span>
              <span class="client-value">-</span>
            </div>
            <div class="client-row">
              <span class="client-label">Provincia:</span>
              <span class="client-value">${provinciaCompleta}</span>
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
    </div>

    <!-- Footer -->
    <div class="bottom">
      <div class="disclaimer">
        ESTE REMITO NO ES VÁLIDO COMO FACTURA. VERIFIQUE LA MERCADERÍA AL RECIBIRLA. RECLAMOS DENTRO DE LAS 48 HS DE ENTREGADA LA MISMA. TODA LA MERCADERÍA SERÁ DESCARGADA SIN EXCEPCIÓN ALGUNA AL PIE DEL CAMIÓN.
      </div>
      
      <div class="firmas">
        <div class="firma-col">Firma</div>
        <div class="firma-col">Aclaración</div>
        <div class="firma-col">Documento N°</div>
      </div>

      <div class="envio-info">
        <strong>Tipo de envío:</strong> ${tipoEnvio} <strong>Fecha entrega:</strong> ${safe(fechaEntrega)} <strong>Lugar entrega:</strong> ${safe(lugarEntrega)} <strong>Entre calles:</strong> ${safe(entreCalles)} <strong>Tel:</strong> ${safe(telEnvio)}
      </div>

      <div class="footer-bottom">
        <div>ORIGINAL BLANCO / DUPLICADO COLOR</div>
        <div>1/1</div>
      </div>
    </div>
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
  // Verificar que estamos en Node.js
  if (typeof window !== "undefined") {
    throw new Error("Este código solo puede ejecutarse en el servidor Node.js");
  }

  const isProduction = process.env.NODE_ENV === "production" || process.env.VERCEL;
  
  let browser;
  
  try {
    if (isProduction) {
      // Producción (Vercel): usar import dinámico para @sparticuz/chromium y puppeteer-core
      // Estos módulos están marcados como externals en next.config.js
      const chromiumModule = await import("@sparticuz/chromium");
      const puppeteerCoreModule = await import("puppeteer-core");
      
      // Manejar exports default y named exports
      const chromium: any = (chromiumModule as any).default || chromiumModule;
      const puppeteerCore: any = (puppeteerCoreModule as any).default || puppeteerCoreModule;
      
      // setGraphicsMode puede no estar disponible en todas las versiones
      if (chromium && typeof chromium.setGraphicsMode === "function") {
        chromium.setGraphicsMode(false);
      }
      
      // executablePath es una función async en @sparticuz/chromium
      const executablePath = await chromium.executablePath();
      
      browser = await puppeteerCore.launch({
        args: chromium.args || [],
        defaultViewport: {
          deviceScaleFactor: 1,
          hasTouch: false,
          height: 1080,
          isLandscape: true,
          isMobile: false,
          width: 1920,
        },
        executablePath: executablePath,
        headless: chromium.headless || "shell",
      });
    } else {
      // Desarrollo: usar puppeteer normal con import dinámico
      const puppeteerModule = await import("puppeteer");
      const puppeteer: any = (puppeteerModule as any).default || puppeteerModule;
      browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });
    }
  } catch (importError: any) {
    console.error("Error importando módulos de Puppeteer:", importError);
    throw new Error(`Error al cargar Puppeteer: ${importError?.message || "Unknown error"}`);
  }

  const page = await browser.newPage();
  const html = buildRemitoHtml(remito, paraEmpleado);
  await page.setContent(html, { waitUntil: "networkidle0" });

  // Generar PDF - Puppeteer manejará automáticamente el overflow a nuevas páginas
  const pdfBuffer = await page.pdf({
    format: "A4",
    printBackground: true,
    margin: {
      top: "2mm",
      bottom: "2mm",
      left: "2mm",
      right: "2mm",
    },
    preferCSSPageSize: true,
  });

  await browser.close();
  return pdfBuffer as Buffer;
}
