# Documentación: Generación de PDF Remito (Normal y Empleado)

## 📋 Índice
1. [Resumen Ejecutivo](#resumen-ejecutivo)
2. [Flujo Completo del Proceso](#flujo-completo-del-proceso)
3. [Paso 1: Interfaz de Usuario (Botones)](#paso-1-interfaz-de-usuario-botones)
4. [Paso 2: Función de Descarga](#paso-2-función-de-descarga)
5. [Paso 3: API Route](#paso-3-api-route)
6. [Paso 4: Mapeo de Datos](#paso-4-mapeo-de-datos)
7. [Paso 5: Generación de HTML](#paso-5-generación-de-html)
8. [Paso 6: Conversión a PDF con Puppeteer](#paso-6-conversión-a-pdf-con-puppeteer)
9. [Diferencias entre PDF Normal y Empleado](#diferencias-entre-pdf-normal-y-empleado)
10. [Configuración de Entornos](#configuración-de-entornos)

---

## Resumen Ejecutivo

El sistema genera PDFs de remitos profesionales en formato A4 usando **Puppeteer** para convertir HTML a PDF. Existen dos variantes:

- **PDF Normal**: Incluye precios, totales, descuentos y subtotales
- **PDF Empleado**: Oculta precios, totales, descuentos y subtotales (solo muestra cantidad y detalle)

---

## Flujo Completo del Proceso

```
[Usuario] 
  ↓ Click en botón "Descargar" o "Descargar Empleado"
[Frontend: handlePrintRemitoPdf()]
  ↓ POST /api/pdf/remito con { type, id, empleado }
[API Route: app/api/pdf/remito/route.ts]
  ↓ Obtiene datos de Firestore
[Mapper: mapVentaToRemito() o mapPresupuestoToRemito()]
  ↓ Transforma datos a RemitoModel
[Generador HTML: buildRemitoHtml()]
  ↓ Genera HTML con estilos inline
[Puppeteer: generateRemitoPDFBuffer()]
  ↓ Convierte HTML a PDF
[Respuesta HTTP: Buffer PDF]
  ↓ Descarga automática en navegador
[Usuario recibe PDF]
```

---

## Paso 1: Interfaz de Usuario (Botones)

**Ubicación:** `app/[lang]/(dashboard)/ventas/[id]/page.jsx` (líneas 1661-1676)

### Botones Disponibles

```jsx
// Botón "Descargar" (PDF Normal)
<Button
  onClick={() => handlePrintRemitoPdf(false)}
  variant="outline"
  className="flex items-center gap-2"
>
  <Download className="h-4 w-4" />
  <span className="hidden sm:inline">Descargar</span>
</Button>

// Botón "Descargar Empleado" (PDF sin precios)
<Button
  onClick={() => handlePrintRemitoPdf(true)}
  variant="outline"
  className="flex items-center gap-2"
>
  <User className="h-4 w-4" />
  <span className="hidden sm:inline">Descargar Empleado</span>
</Button>
```

**Características:**
- En mobile: Solo se muestran los iconos
- En desktop: Se muestran icono + texto
- Ambos botones llaman a la misma función con parámetro diferente

---

## Paso 2: Función de Descarga

**Ubicación:** `app/[lang]/(dashboard)/ventas/[id]/page.jsx` (líneas 108-136)

### Código Completo

```javascript
const handlePrintRemitoPdf = async (paraEmpleado = false) => {
  if (!venta?.id) return;
  
  try {
    // 1. Hacer petición POST a la API
    const res = await fetch("/api/pdf/remito", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ 
        type: "venta",        // o "presupuesto"
        id: venta.id,         // ID del documento
        empleado: paraEmpleado // true/false
      }),
    });
    
    // 2. Verificar respuesta
    if (!res.ok) {
      console.error("Error generando remito PDF", await res.text());
      return;
    }
    
    // 3. Convertir respuesta a Blob
    const blob = await res.blob();
    
    // 4. Crear URL temporal para descarga
    const url = window.URL.createObjectURL(blob);
    
    // 5. Crear elemento <a> invisible para descarga
    const a = document.createElement("a");
    a.href = url;
    
    // 6. Generar nombre de archivo
    const numero = venta.numeroPedido || venta.id?.slice(-8) || "documento";
    const suffix = paraEmpleado ? "-empleado" : "";
    a.download = `${numero}${suffix}.pdf`; // Ej: "VENTA-00980-empleado.pdf"
    
    // 7. Trigger descarga automática
    document.body.appendChild(a);
    a.click();
    a.remove();
    
    // 8. Limpiar URL temporal
    window.URL.revokeObjectURL(url);
  } catch (e) {
    console.error("Error descargando remito PDF", e);
  }
};
```

**Parámetros:**
- `paraEmpleado`: `false` = PDF normal, `true` = PDF sin precios

**Proceso:**
1. Envía petición POST con datos del documento
2. Recibe el PDF como Blob
3. Crea descarga automática con nombre personalizado
4. Limpia recursos temporales

---

## Paso 3: API Route

**Ubicación:** `app/api/pdf/remito/route.ts`

### Configuración

```typescript
export const runtime = "nodejs";        // Solo ejecuta en Node.js
export const dynamic = "force-dynamic"; // Siempre dinámico (no cache)
```

### Flujo de la API

```typescript
export async function POST(req: NextRequest) {
  // 1. Parsear body de la petición
  const body = await req.json();
  const { type, id, empleado } = body;
  
  // 2. Validar parámetros requeridos
  if (!type || !id) {
    return new Response(JSON.stringify({ error: "type e id son requeridos" }), {
      status: 400,
    });
  }
  
  // 3. Determinar colección (ventas o presupuestos)
  const collectionName = type === "venta" ? "ventas" : "presupuestos";
  
  // 4. Obtener documento de Firestore
  const docRef = doc(db, collectionName, id);
  const snap = await getDoc(docRef);
  
  // 5. Validar que existe
  if (!snap.exists()) {
    return new Response(JSON.stringify({ error: "Documento no encontrado" }), {
      status: 404,
    });
  }
  
  // 6. Preparar datos
  const data = { id: snap.id, ...snap.data() };
  
  // 7. Mapear a modelo Remito
  const remito = type === "venta" 
    ? mapVentaToRemito(data) 
    : mapPresupuestoToRemito(data);
  
  // 8. Generar PDF
  const buffer = await generateRemitoPDFBuffer(remito, empleado || false);
  
  // 9. Generar nombre de archivo
  const suffix = empleado ? "-empleado" : "";
  const filename = `${remito.numero}${suffix}.pdf`;
  
  // 10. Retornar PDF como respuesta
  return new Response(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
```

**Puntos Clave:**
- Solo se ejecuta en servidor (Node.js runtime)
- Obtiene datos directamente de Firestore
- Llama al mapper correspondiente según el tipo
- Genera el PDF con el flag `empleado`
- Retorna el PDF como Buffer con headers apropiados

---

## Paso 4: Mapeo de Datos

**Ubicación:** `src/lib/pdf/mappers.ts`

### Función Principal: `mapVentaToRemito()`

```typescript
export function mapVentaToRemito(venta: any): RemitoModel {
  const cliente = venta.cliente || {};
  
  // 1. Determinar si hay envío
  const tieneEnvio = venta.tipoEnvio && venta.tipoEnvio !== "retiro_local";
  
  // 2. Determinar dirección de entrega
  const direccionEntrega = tieneEnvio
    ? venta.usarDireccionCliente === false
      ? venta.direccionEnvio
      : cliente.direccion
    : undefined;
  
  // 3. Mapear productos
  const items = Array.isArray(venta.productos) ? venta.productos : [];
  
  // 4. Calcular totales usando el mismo motor de la app
  const totales = computeTotals(items);
  
  // 5. Calcular descuento por pago en efectivo (10%)
  const descuentoEfectivo = venta?.pagoEnEfectivo 
    ? totales.subtotal * 0.1 
    : 0;
  
  // 6. Calcular costo de envío
  const costoEnvio = tieneEnvio && venta.costoEnvio !== undefined
    ? Number(venta.costoEnvio)
    : 0;
  
  // 7. Calcular total final
  const totalFinal = totales.total + costoEnvio - descuentoEfectivo;
  
  // 8. Retornar modelo Remito
  return {
    numero: buildNumeroComprobante(venta.numeroPedido, venta.id),
    fecha: formatFechaLocal(venta.fecha),
    empresa: { /* datos de empresa */ },
    cliente: { /* datos de cliente */ },
    entrega: tieneEnvio ? { /* datos de entrega */ } : undefined,
    items: mapCommonItems(items),
    subtotal: totales.subtotal,
    descuentoTotal: totales.descuentoTotal,
    descuentoEfectivo,
    costoEnvio,
    totalFinal,
    formaPago: venta.formaPago,
    fechaEntrega: venta.fechaEntrega ? formatFechaLocal(venta.fechaEntrega) : undefined,
    observaciones: venta.observaciones,
    disclaimer: "Este remito no es válido como factura...",
  };
}
```

### Función: `mapCommonItems()`

Mapea los productos a items del remito:

```typescript
function mapCommonItems(productos: any[]): RemitoItemModel[] {
  return productos.map((p) => {
    // 1. Obtener cantidad
    const cantidad = p.cantidad ?? 1;
    
    // 2. Obtener nombre (sin código)
    const nombre = safeText(p.nombre, "Producto sin nombre");
    const detalle = nombre; // Solo nombre, sin código
    
    // 3. Generar extras (solo CEPILLADO si aplica)
    const extras: string[] = [];
    if (p.cepilladoAplicado) extras.push("✓ CEPILLADO");
    
    // 4. Calcular precios usando el mismo motor de la app
    const base = computeLineBase(p);
    const totalNeto = computeLineSubtotal(p); // Ya aplica descuento%
    const qty = Math.max(1, Number(cantidad) || 1);
    const unitNeto = qty > 0 ? totalNeto / qty : totalNeto;
    
    return {
      cantidad,
      detalle,
      extra: extras.length > 0 ? extras.join(" | ") : undefined,
      cepillado: p.cepilladoAplicado || false,
      precioUnitario: unitNeto,
      precioTotal: totalNeto,
    };
  });
}
```

**Puntos Clave:**
- Usa `computeTotals()` de `lib/pricing.js` (mismo motor que la app)
- Calcula descuentos, subtotales y totales de forma consistente
- Maneja productos con medidas M2 (machimbre, deck)
- Formatea fechas con `formatFechaLocal()`
- Genera número de comprobante con fallback

---

## Paso 5: Generación de HTML

**Ubicación:** `src/lib/pdf/generate-remito-pdf.ts` (función `buildRemitoHtml()`)

### Estructura del HTML Generado

El HTML se genera completamente con estilos inline para evitar dependencias externas:

```typescript
function buildRemitoHtml(remito: RemitoModel, paraEmpleado: boolean = false): string {
  // 1. Cargar logo como base64
  let logoBase64 = "";
  // ... código de carga de logo ...
  
  // 2. Helpers de formateo
  const safeValue = (val, fallback = "-") => 
    val && val.trim() ? escapeHtml(val.trim().toUpperCase()) : fallback;
  
  const formatCurrency = (num) => {
    // Formatea como moneda argentina: $ 123.456
  };
  
  // 3. Generar HTML completo
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <style>
          /* Estilos CSS inline completos */
          /* Incluye: layout, tipografía, colores, bordes, etc. */
        </style>
      </head>
      <body>
        <!-- Header con logo, empresa y datos -->
        <!-- Bloque de cliente (2 columnas) -->
        <!-- Tabla de items -->
        <!-- Footer con totales, firmas, etc. -->
      </body>
    </html>
  `;
}
```

### Secciones del HTML

1. **Header (3 zonas):**
   - Izquierda: Logo + datos empresa
   - Centro: "X + Documento no válido como factura"
   - Derecha: Caja "REMITO" + N° + Fecha

2. **Bloque Cliente (2 columnas):**
   - Izquierda: R. Social, Dirección, Provincia, CP
   - Derecha: Cliente, CUIT, Teléfono, Email

3. **Tabla de Items:**
   - Columnas: CANTIDAD | DETALLE | CEPILLADO | PRECIO UNIT. | TOTAL
   - En modo empleado: Solo CANTIDAD | DETALLE | CEPILLADO

4. **Footer:**
   - Totales (DESCUENTO, SUBTOTAL, ENVÍO, TOTAL)
   - Texto legal
   - Firmas
   - Datos de entrega

---

## Paso 6: Conversión a PDF con Puppeteer

**Ubicación:** `src/lib/pdf/generate-remito-pdf.ts` (función `generateRemitoPDFBuffer()`)

### Código Completo

```typescript
export async function generateRemitoPDFBuffer(
  remito: RemitoModel,
  paraEmpleado: boolean = false
): Promise<Buffer> {
  // 1. Detectar entorno (producción o desarrollo)
  const isProduction = process.env.NODE_ENV === "production" || process.env.VERCEL;
  
  let browser;
  
  // 2. Configurar Puppeteer según entorno
  if (isProduction) {
    // PRODUCCIÓN: Usar @sparticuz/chromium (compatible con Vercel/serverless)
    const loadModule = new Function("moduleName", "return require(moduleName)");
    const chromium = loadModule("@sparticuz/chromium");
    const puppeteerCore = loadModule("puppeteer-core");
    
    chromium.setGraphicsMode = false; // Deshabilitar WebGL para mejor rendimiento
    
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
    // DESARROLLO: Usar puppeteer normal (Chrome local)
    const loadModule = new Function("moduleName", "return require(moduleName)");
    const puppeteer = loadModule("puppeteer");
    
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  }
  
  // 3. Crear nueva página
  const page = await browser.newPage();
  
  // 4. Generar HTML
  const html = buildRemitoHtml(remito, paraEmpleado);
  
  // 5. Cargar HTML en la página
  await page.setContent(html, { waitUntil: "networkidle0" });
  
  // 6. Generar PDF
  const pdfBuffer = await page.pdf({
    format: "A4",
    printBackground: true,
    margin: {
      top: "0mm",
      bottom: "0mm",
      left: "0mm",
      right: "0mm",
    },
  });
  
  // 7. Cerrar navegador
  await browser.close();
  
  // 8. Retornar buffer
  return pdfBuffer as Buffer;
}
```

**Configuración del PDF:**
- Formato: A4 (210mm × 297mm)
- Márgenes: 0mm (ocupa toda la página)
- Background: Incluido (colores y fondos)
- Espera: `networkidle0` (espera a que no haya requests)

**Nota sobre Function Constructor:**
Se usa `new Function()` para cargar módulos dinámicamente y evitar que Next.js analice Puppeteer durante el build (esto causa errores de compilación).

---

## Diferencias entre PDF Normal y Empleado

### PDF Normal (`paraEmpleado = false`)

**Incluye:**
- ✅ Columna "PRECIO UNIT."
- ✅ Columna "TOTAL"
- ✅ Fila "DESCUENTO" con valor
- ✅ Fila "SUBTOTAL" con valor
- ✅ Fila "ENVÍO" con valor (si aplica)
- ✅ Fila "TOTAL" con valor final

**Anchos de columnas:**
- CANTIDAD: 8%
- DETALLE: 40%
- CEPILLADO: 12%
- PRECIO UNIT.: 20%
- TOTAL: 20%

### PDF Empleado (`paraEmpleado = true`)

**Oculta:**
- ❌ Columna "PRECIO UNIT."
- ❌ Columna "TOTAL"
- ❌ Todas las filas de totales (DESCUENTO, SUBTOTAL, ENVÍO, TOTAL)

**Anchos de columnas:**
- CANTIDAD: 12%
- DETALLE: 70%
- CEPILLADO: 18%

### Código de Diferenciación

```typescript
// En buildRemitoHtml()
${!paraEmpleado ? `
  <th class="price">PRECIO UNIT.</th>
  <th class="total-col">TOTAL</th>
` : ''}

// En cada fila de item
${!paraEmpleado ? `
  <td class="cell precio price">${formatCurrency(item.precioUnitario)}</td>
  <td class="cell total total-col">${formatCurrency(item.precioTotal)}</td>
` : ''}

// En footer de totales
${!paraEmpleado ? `
  <tr>
    <td class="totals-spacer" colspan="3"></td>
    <td class="totals-label">DESCUENTO</td>
    <td class="totals-value">${formatCurrency(descuentoUnificado)}</td>
  </tr>
  <!-- Más filas de totales -->
` : ''}
```

---

## Configuración de Entornos

### Desarrollo Local

**Dependencias:**
- `puppeteer`: ^24.35.0
- Chrome/Chromium local instalado

**Configuración:**
```typescript
browser = await puppeteer.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox"],
});
```

### Producción (Vercel)

**Dependencias:**
- `puppeteer-core`: ^24.36.0
- `@sparticuz/chromium`: ^143.0.4

**Configuración:**
```typescript
const chromium = require("@sparticuz/chromium");
const puppeteerCore = require("puppeteer-core");

chromium.setGraphicsMode = false;

browser = await puppeteerCore.launch({
  args: chromium.args,
  executablePath: await chromium.executablePath(),
  headless: "shell",
});
```

**Razón del cambio:**
- Vercel es un entorno serverless sin Chrome instalado
- `@sparticuz/chromium` proporciona Chromium optimizado para serverless
- Se descarga automáticamente en el primer uso

---

## Resumen de Archivos Involucrados

| Archivo | Función |
|---------|---------|
| `app/[lang]/(dashboard)/ventas/[id]/page.jsx` | UI: Botones y función `handlePrintRemitoPdf()` |
| `app/api/pdf/remito/route.ts` | API: Endpoint POST que genera el PDF |
| `src/lib/pdf/mappers.ts` | Mapeo: Transforma datos de Firestore a `RemitoModel` |
| `src/lib/pdf/generate-remito-pdf.ts` | Generación: `buildRemitoHtml()` y `generateRemitoPDFBuffer()` |
| `src/lib/pdf/models.ts` | Modelos: TypeScript interfaces (`RemitoModel`, `RemitoItemModel`) |
| `src/lib/pdf/formatters.ts` | Utilidades: Formateo de fechas, números, texto |

---

## Flujo de Datos Completo

```
Firestore Document (venta/presupuesto)
  ↓
mapVentaToRemito() / mapPresupuestoToRemito()
  ↓
RemitoModel {
  numero, fecha, empresa, cliente, entrega,
  items[], subtotal, descuentoTotal, costoEnvio, totalFinal
}
  ↓
buildRemitoHtml(remito, paraEmpleado)
  ↓
HTML String (completo con estilos inline)
  ↓
Puppeteer: page.setContent(html)
  ↓
Puppeteer: page.pdf({ format: "A4" })
  ↓
Buffer (PDF binario)
  ↓
HTTP Response (Content-Type: application/pdf)
  ↓
Blob en navegador
  ↓
Descarga automática
```

---

## Notas Técnicas Importantes

1. **Todos los textos dinámicos se convierten a UPPERCASE** usando `safeValue()`
2. **El logo se carga como base64** desde `public/logo_maderas_caballero.png`
3. **Los precios se calculan con `lib/pricing.js`** para mantener consistencia
4. **El PDF ocupa toda la página A4** (márgenes 0mm)
5. **El HTML es completamente autocontenido** (sin dependencias externas)
6. **Puppeteer se carga dinámicamente** para evitar errores de build en Next.js

---

## Troubleshooting

### Error: "Could not find Chrome"
- **Causa**: Puppeteer no encuentra Chrome en producción
- **Solución**: Usar `@sparticuz/chromium` en producción (ya implementado)

### Error: "Module not found" durante build
- **Causa**: Next.js intenta analizar Puppeteer durante el build
- **Solución**: Usar `Function` constructor para carga dinámica (ya implementado)

### PDF sin logo
- **Causa**: Logo no encontrado en `public/`
- **Solución**: Verificar que `logo_maderas_caballero.png` existe en `public/`

### PDF con precios cuando debería ser empleado
- **Causa**: Parámetro `empleado` no se pasa correctamente
- **Solución**: Verificar que `handlePrintRemitoPdf(true)` se llama correctamente

---

**Última actualización:** Diciembre 2024  
**Versión:** 1.0
