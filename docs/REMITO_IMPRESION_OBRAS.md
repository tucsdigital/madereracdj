# Remito de impresión en /obras (Presupuestos y Obras)

## Dónde se imprime

- **Detalle de Presupuesto**: [page.jsx](/app/[lang]/(dashboard)/obras/presupuesto/[id]/page.jsx)
- **Detalle de Obra**: [page.jsx](/app/[lang]/(dashboard)/obras/[id]/page.jsx)

En ambas pantallas, el botón de imprimir ejecuta la misma estrategia:

1. Pide al backend el HTML listo para impresión.
2. Inserta ese HTML en un iframe oculto.
3. Dispara `window.print()` para abrir el diálogo de impresión del navegador.

## Flujo técnico (detalle /obras/*/[id])

### 1) Acción del usuario

Al presionar **Imprimir**, se ejecuta `handlePrint` (en ambas páginas). El flujo:

- Hace `POST` a `/api/pdf/remito-html` con:
  - `type: "obra"`
  - `id: obra.id`

Referencias:
- [handlePrint (Presupuesto)](/app/[lang]/(dashboard)/obras/presupuesto/[id]/page.jsx#L101-L169)
- [handlePrint (Obra)](/app/[lang]/(dashboard)/obras/[id]/page.jsx#L102-L170)

### 2) Endpoint que arma el HTML

El endpoint es: [route.ts](/app/api/pdf/remito-html/route.ts)

Para `type === "obra"`:

- Lee el documento desde Firestore en la colección `obras`.
- Determina `modoCosto`:
  - `"presupuesto"` si el documento es un presupuesto (`obra.tipo === "presupuesto"`) o si la obra tiene `presupuestoInicialId`.
  - `"gasto"` en caso contrario.
- Si es una **obra** con `presupuestoInicialId`, también intenta traer el “presupuesto inicial” (también desde `obras`) y lo pasa como contexto.
- Normaliza movimientos de cobro (seña/pagos) desde `obra.cobranzas` y `cobranzas.historialPagos`.
- Llama a `generarContenidoImpresion(obra, presupuesto, modoCosto, movimientos)` para obtener el HTML final.

Referencia:
- [POST /api/pdf/remito-html](/app/api/pdf/remito-html/route.ts#L18-L117)

### 3) Generación del HTML final

La función que construye el HTML imprimible es:

- [generarContenidoImpresion](/lib/obra-utils.js#L78-L946)

Esta función devuelve un documento HTML completo (con `<style>` y reglas `@media print`) optimizado para impresión.

## Bloques de Presupuesto (qué son y cómo se muestran)

### Qué se considera “bloque”

En la obra/presupuesto se guarda un arreglo `obra.bloques`. Cada bloque tiene, como mínimo:

- `id`
- `nombre`
- `descripcion`
- `productos: []`

Referencia (estructura/creación del bloque inicial y alta de bloques):
- [PresupuestoDetalle.jsx](/components/obras/PresupuestoDetalle.jsx#L54-L137)

### Cuándo se imprimen los bloques

El HTML entra en modo “impresión por bloques” cuando:

- `obra.bloques` existe y
- hay al menos un bloque con `productos.length > 0`

Referencia:
- [Detección hayBloques](/lib/obra-utils.js#L142-L148)

Si no hay bloques con productos, esta sección no aparece.

### Cómo se renderiza cada bloque en el remito

Para cada bloque con productos:

- Se imprime una sección titulada **“Presupuesto 1”**, **“Presupuesto 2”**, etc.
- Cada bloque se renderiza como una tabla con columnas:
  - Producto
  - Cant.
  - Unidad
  - Alto
  - Largo
  - Valor Unit.
  - Desc. %
  - Subtotal
- Si un producto tiene `descripcion`, se agrega una fila extra debajo del ítem con esa descripción.
- Se incluye “Descripción del Presupuesto” usando `bloque.descripcion`.
- Se muestran totales del bloque (Subtotal / Descuento total / Total).
- Desde el segundo bloque en adelante se fuerza un salto de página (`page-break`), para que cada bloque salga como una hoja (o sección) separada.

Referencias:
- [Render de filas y tabla del bloque](/lib/obra-utils.js#L178-L368)
- [Salto de página por bloque](/lib/obra-utils.js#L235-L238)

### Campos relevantes por producto (en bloques)

En impresión por bloques, cada fila usa principalmente estos campos del producto:

- `nombre`
- `cantidad`
- `unidadMedida` (UN / ML / M2)
- `alto` (solo se muestra si unidad es M2)
- `largo` (se muestra si unidad es M2 o ML)
- `valorVenta` (se muestra como valor unitario; si no está, puede quedar en 0 visual)
- `descuento` (porcentaje)
- `precio` (base de cálculo para el subtotal mostrado)
- `descripcion` (opcional; se imprime debajo en una fila adicional)

Referencia:
- [Cálculo y render de fila](/lib/obra-utils.js#L192-L233)

### Nota sobre “pago en efectivo” en la impresión por bloques

Si `obra.pagoEnEfectivo` está activo, en el HTML actual:

- El **valor unitario visual** (`Valor Unit.`) se muestra con 10% de descuento.
- El **subtotal por ítem** también aplica ese 10% adicional.

Referencia:
- [Descuento efectivo en la fila](/lib/obra-utils.js#L197-L216)

## Relación Presupuesto ↔ Obra (impacta en qué se imprime)

- Un **presupuesto** (tipo `"presupuesto"`) y una **obra** (tipo `"obra"`) pueden compartir estructura, incluyendo `bloques`.
- En el flujo de impresión del detalle, siempre se imprime desde el documento en `obras/{id}` que se pidió por API.
- Si el usuario está editando y no guardó cambios aún, la impresión puede no reflejar el estado local del formulario, porque el HTML se arma con lo que está persistido en Firestore.

La edición/guardado de bloques se maneja desde:
- [PresupuestoDetalle.jsx](/components/obras/PresupuestoDetalle.jsx)

## Qué pasa si NO hay bloques (caso típico en “Obra”)

Si no hay bloques con productos, pero la obra tiene materiales cargados en `obra.materialesCatalogo`, entonces se imprime la sección:

- **“Materiales de la Obra”** con una tabla similar.

Referencia:
- [Materiales de la Obra](/lib/obra-utils.js#L946-L1019)

## Impresión/descarga desde el listado /obras (otra ruta)

En el listado general de obras, existe un flujo distinto orientado a **descargar PDF** desde el navegador (no el endpoint `/api/pdf/remito-html`):

- Se arma el HTML con `generarContenidoImpresion(...)`.
- Se usa `descargarPDFDesdeIframe(...)` que genera el PDF con `html2pdf.js` (cliente).

Referencias:
- [handleImprimirObra](/app/[lang]/(dashboard)/obras/page.jsx#L228-L272)
- [descargarPDFDesdeIframe](/lib/obra-utils.js#L1566-L1642)
