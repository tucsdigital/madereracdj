# Relevamiento de velocidad – Panel Admin

Relevamiento página por página del panel administrativo (menú principal) para identificar cuellos de botella y acciones de mejora.

---

## Rutas del menú

Según `config/menus.js`:

| Ruta | Página principal | Otras páginas relevantes |
|------|------------------|---------------------------|
| `/dashboard` | dashboard | — |
| `/ventas` | ventas/page.jsx | ventas/[id], ventas/create |
| `/envios` | envios/page.jsx | — |
| `/productos` | productos/page.jsx | productos/[id] |
| `/stock-compras` | stock-compras/page.jsx | — |
| `/gastos` | gastos/page.jsx | — |
| `/proveedores` | proveedores/page.jsx | — |
| `/obras` | obras/page.jsx | obras/[id], obras/create, obras/presupuesto/* |
| `/clientes` | clientes/page.jsx | — |
| `/precios` | precios/page.jsx | — |
| `/auditoria` | auditoria/page.jsx | — |

*(Presupuestos se gestionan desde ventas o obras; la ruta `/presupuestos` existe con listado/create/[id].)*

---

## 1. Dashboard (`/dashboard`)

**Archivo:** `(home)/dashboard/page-view.jsx` + contexto + `SalesStats`, etc.

**Estado:** Estable. Una sola carga con `Promise.all` de las 5 colecciones; solo `SalesStats` en `dynamic()`.

**Resumen:**
- **Contexto único** (`DashboardDataProvider`): una sola fuente de datos, valor memorizado.
- **Una sola fase de carga:** `Promise.all([ventas, presupuestos, obras, productos, clientes])` y un único `setData`. (Se probó carga progresiva en dos fases y dynamic para LiveActivityFeed/Opportunities/PlatformMessages; se revirtió por problemas de carga en algunos entornos.)
- **`SalesStats`** en `dynamic(..., { ssr: false })` con skeleton.
- **Resto de componentes** import estático (LiveActivityFeed, Opportunities, PlatformMessages, etc.).

**Mejoras posibles (con cautela / A/B):**
- Carga progresiva (ventas+presupuestos primero) si se valida bien en todos los navegadores.
- `dynamic()` para below-the-fold solo si no afecta la carga inicial.
- Cache o SWR al cambiar solo el rango de fechas.

---

## 2. Ventas / Presupuestos (`/ventas`)

**Archivo:** `ventas/page.jsx` (~380 líneas).

**Carga de datos:**
- `useEffect` en mount: `getDocs(ventas)` y luego `getDocs(presupuestos)` en secuencia.

**Problemas:**
- Dos lecturas secuenciales; se puede hacer en paralelo con `Promise.all`.
- Sin paginación: se trae toda la colección.

**Recomendaciones:**
- Usar `Promise.all([getDocs(collection(db,"ventas")), getDocs(collection(db,"presupuestos"))])` en el primer load.
- A medio plazo: paginación o límite + “cargar más” para listas grandes.

---

## 3. Ventas detalle (`/ventas/[id]`)

**Archivo:** `ventas/[id]/page.jsx` (~3580 líneas).

**Carga:** Un documento por id (getDoc o equivalente). Tamaño del componente muy grande.

**Problemas:**
- Archivo enorme: difícil de mantener y puede impactar bundle y tiempos de parsing.
- Mucha lógica en un solo componente.

**Recomendaciones:**
- Dividir en subcomponentes por sección (header, ítems, pagos, impresión, etc.).
- Mover formularios y modales a componentes separados y cargarlos con `dynamic()` si son pesados.
- Revisar que no se importen librerías pesadas (charts, PDF, etc.) hasta que hagan falta (lazy/dynamic).

---

## 4. Envíos (`/envios`)

**Archivo:** `envios/page.jsx` (~818 líneas).

**Carga:** `getDocs(collection(db, "envios"))` en un handler (ej. `loadEnvio` / `fetchData`), no siempre en un `useEffect` único al montar.

**Problemas:**
- Confirmar que la carga inicial sea una sola vez y que no se repitan fetches innecesarios.
- Uso de `DataTable` y diálogos de impresión/PDF: revisar imports estáticos de cosas pesadas.

**Recomendaciones:**
- Un solo `useEffect` (o callback estable) que llame a la función de carga al montar.
- Si hay bloques de impresión/PDF, cargarlos con `dynamic(..., { ssr: false })`.

---

## 5. Productos (`/productos`)

**Archivo:** `productos/page.jsx` (~5509 líneas).

**Carga:**
- `onSnapshot(productos)` + `onSnapshot` anidado para obras/uso de productos.
- En otros `useEffect`: `getDocs(collection(db,"productos"))` (ej. en `cargarDatosPrecargados`).

**Problemas:**
- Archivo gigante: rendimiento de parsing, mantenimiento y bundle.
- Dos `onSnapshot` (productos + obras) desde el inicio: más lecturas y posibles re-renders.
- Posible duplicación de carga entre `onSnapshot` y `getDocs` en distintos efectos.

**Recomendaciones:**
- Dividir la página en módulos (listado, filtros, formulario, modal de imágenes, etc.) y usar `dynamic()` para las partes más pesadas.
- Unificar fuente de datos: o bien solo `onSnapshot(productos)` inicial, o solo `getDocs` + refresco manual/otro listener, para no duplicar lógica.
- Valorar pasar a `getDocs` + recarga por acción (guardar, filtrar) en lugar de tiempo real si la lista es muy grande.
- Revisar si el segundo `onSnapshot` (obras) puede cargarse solo cuando se necesita (por pestaña o por vista).

---

## 6. Stock / Compras (`/stock-compras`)

**Archivo:** `stock-compras/page.jsx` (~1027 líneas).

**Carga:**
- `onSnapshot(query(collection(db,"productos"), orderBy("nombre")))` en mount.
- Movimientos: según implementación, otro `onSnapshot` o `getDocs` sobre `movimientos` (o equivalente).

**Problemas:**
- Tiempo real sobre toda la colección “productos” puede ser costoso en volumen alto.
- Paginación en UI ayuda, pero el listener sigue recibiendo todos los documentos.

**Recomendaciones:**
- Si no se necesita tiempo real estricto, probar `getDocs` + botón “Actualizar” o recarga tras cada movimiento.
- Si se mantiene `onSnapshot`, acotar con `limit()` y/o `where()` y paginación por cursor.
- Cargar “movimientos” solo cuando el usuario abre la pestaña o el detalle (lazy).

---

## 7. Gastos (`/gastos`)

**Archivo:** `gastos/page.jsx` (~1821 líneas).

**Carga (en `cargarDatos`):**
- `getDocs(collection(db,"proveedores"))`.
- Luego `getDocs(collection(db,"gastos"))`.
- Hook `useCategoriasGastos`: propia carga de categorías.

**Problemas:**
- Proveedores y gastos se piden en secuencia; se pueden pedir en paralelo.
- Al cerrar el modal de gestión de categorías se hace `setTimeout(..., 300)` y se vuelve a llamar `cargarDatos()`: se recargan proveedores + gastos aunque solo cambiaron categorías.

**Recomendaciones:**
- `Promise.all([getDocs(proveedores), getDocs(gastos)])` en `cargarDatos`.
- Tras cerrar el modal de categorías, recargar solo gastos (o solo lo que use categorías), no proveedores.
- Evitar el `setTimeout(300)` si es posible; si hace falta, dejar un único “refresco de datos afectados por categorías”.

---

## 8. Proveedores (`/proveedores`)

**Archivo:** `proveedores/page.jsx` (~740 líneas).

**Carga:**
- Mount: `getDocs(collection(db,"proveedores"))`.
- Al abrir detalle: `getDocs(query(gastos, tipo==proveedor, proveedorId==id))` bajo demanda.

**Problemas:** Ninguno grave; carga diferida en el detalle está bien.

**Recomendaciones:** Mantener este patrón; opcionalmente cachear por `proveedorId` para no repetir la misma query al reabrir el mismo proveedor.

---

## 9. Obras (`/obras`)

**Archivo:** `obras/page.jsx` (~1748 líneas).

**Carga (en `fetchData`):**
- `getDocs(collection(db,"obras"))`.
- Luego `Promise.all(base.map(async (o) => { ... }))` donde, para obras con `presupuestoInicialId`, se hace `getDoc(doc(db,"obras", o.presupuestoInicialId))` por cada una.

**Problemas:**
- Patrón N+1: 1 lectura de obras + N lecturas de presupuestos asociados. Con muchas obras, muchas rondas a Firestore.
- Imports pesados: `obra-utils` (generarContenidoImpresion, descargarPDFDesdeIframe), `DataTableEnhanced`, `CalendarioObras`, `ObraSidePanel`, `WizardConversion`; todo se carga con la página.

**Recomendaciones:**
- En el enriquecimiento, si hace falta el presupuesto inicial, hacer una única query por lotes de IDs (si Firestore lo permite, p. ej. `where('__name__', 'in', ids)` con hasta 30 IDs por llamada) en lugar de un `getDoc` por obra.
- O guardar en cada obra un campo denormalizado `presupuestoTotal` / `totalPresupuesto` al crear/actualizar y evitar `getDoc` en el listado.
- Cargar con `dynamic()`: CalendarioObras, ObraSidePanel, WizardConversion y la parte de PDF/impresión de `obra-utils`.

---

## 10. Clientes (`/clientes`)

**Archivo:** `clientes/page.jsx` (~743 líneas).

**Carga:**
- Mount: `getDocs(collection(db,"clientes"))`.
- Al abrir detalle: `Promise.all([getDocs(ventas por clienteId), getDocs(presupuestos por cliente.cuit)])` bajo demanda.

**Problemas:** Ninguno grave.

**Recomendaciones:** Mantener; opcionalmente cachear ventas/presupuestos por `clienteId` al abrir detalle.

---

## 11. Precios (`/precios`)

**Archivo:** `precios/page.jsx` (~1660 líneas).

**Carga:** `getDocs(query(collection(db,"productos"), orderBy("nombre")))` en mount.

**Problemas:**
- Se cargan todos los productos de una vez; en catálogos grandes puede ser lento.
- Paginación en UI: existe `paginaActual` / `productosPorPagina`; la query sigue siendo “todas”.

**Recomendaciones:**
- Paginación en backend: `limit(n)`, `startAfter(lastDoc)` (o `offset` si se usa otra capa) y cargar por páginas.
- O al menos `limit(500)` (u otro tope) + “Cargar más” para no traer decenas de miles de documentos en la primera carga.

---

## 12. Auditoría (`/auditoria`)

**Archivo:** `auditoria/page.jsx` (~355 líneas).

**Carga:** `fetch(\`/api/auditoria?tipo=${filtroTipo}&limit=100\`)` en un `useEffect` que depende de `user` y `filtroTipo`.

**Problemas:** Dependencia de `user` puede provocar doble carga (antes y después de login). Asegurar que `user` esté estable antes de pedir.

**Recomendaciones:**
- No llamar a `/api/auditoria` hasta que `user` exista y, si aplica, no re-ejecutar por cambios de referencia de `user` que no cambien el uid.
- En el API, mantener `limit=100` (o paginación) y índices adecuados en el origen de datos.

---

## 13. Presupuestos (`/presupuestos`)

**Archivos:** `presupuestos/page.jsx`, `presupuestos/create/page.jsx`, `presupuestos/[id]/page.jsx`.

**Carga (según vistas):**
- Form/create: `getDocs(collection(db,"clientes"))` en el formulario (y productos si aplica).
- Listado: revisar si reutiliza datos de ventas o hace su propio `getDocs(presupuestos)`.

**Problemas:** Evitar duplicar lógica y fetches con la sección de ventas si ambas muestran presupuestos.

**Recomendaciones:** Centralizar carga de presupuestos en un hook o contexto cuando ventas y presupuestos compartan pantalla; en listado, paginación o límite.

---

## Resumen de prioridades

| Prioridad | Página / Área | Acción principal |
|-----------|----------------|-------------------|
| Alta | Ventas (listado) | `Promise.all` para ventas + presupuestos |
| Alta | Gastos | `Promise.all` para proveedores + gastos; no recargar todo al cerrar modal categorías |
| Alta | Obras | Reducir N+1 (getDoc por obra); dynamic para calendario/sidepanel/PDF |
| Media | Productos | Partir en componentes + dynamic; unificar onSnapshot/getDocs |
| Media | Stock-compras | Valorar getDocs + recarga en vez de onSnapshot completo; lazy de movimientos |
| Media | Precios | Paginación o límite en la query de productos |
| Media | Ventas [id] | Dividir en componentes; dynamic en bloques pesados |
| Baja | Envíos, Clientes, Proveedores, Auditoría | Ajustes finos (un solo fetch inicial, cache, evitar doble carga) |

---

## Métricas sugeridas

Para medir mejoras:

- Tiempo hasta primer render de la tabla o listado (TTFB + FCP).
- Tiempo hasta “listado útil” (datos visibles y estables).
- Número de lecturas Firestore por carga de página (antes y después).
- Tamaño de chunks JS de las rutas del panel (antes y después de dynamic/lazy).

---

## Optimizaciones aplicadas (post-relevamiento)

Se implementaron mejoras priorizando **Dashboard** y **Ventas**:

### Dashboard
- **Carga diferida (dynamic):** Los componentes below-the-fold (LiveActivityFeed, BusinessStatus, CommunityStats, PersonalSpace, UserProgress, Opportunities, PlatformMessages) se cargan con `dynamic()`, reduciendo el bundle inicial y mejorando FCP. Cada uno muestra un skeleton mientras carga.
- **Cache por rango de fechas:** En `dashboard-data-context.jsx` se agregó cache en memoria keyed por `fechaDesde_fechaHasta` (TTL 2 min). Al cambiar el rango y volver al mismo, no se vuelve a llamar a Firestore.

### Ventas (listado)
- **DataTableEnhanced en dynamic:** La tabla se carga en un chunk separado con `dynamic(..., { ssr: false })` y skeleton, reduciendo el JS inicial de la ruta `/ventas`.
- **Limpieza de imports:** Se quitaron imports no usados (useForm, yup, yupResolver, Input, Textarea, computeTotals) para aligerar el bundle.

### Ventas (crear)
- **FormularioVentaPresupuesto en dynamic:** El formulario pesado se carga con `dynamic(..., { ssr: false })` y skeleton, de modo que la ruta `/ventas/create` muestre la shell rápido y el formulario después.

### Ventas (detalle `/ventas/[id]`)
- **ModalCambiarCliente en dynamic:** El modal se carga en un chunk separado (`dynamic(..., { ssr: false })`) para no bloquear el parse inicial del detalle.

Documento generado como parte del relevamiento de velocidad del panel admin.
