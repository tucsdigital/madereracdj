# 📋 DOCUMENTACIÓN COMPLETA - SECCIÓN DE OBRAS

## 📑 ÍNDICE

1. [Introducción](#introducción)
2. [Estructura de Datos](#estructura-de-datos)
3. [Tipos de Documentos](#tipos-de-documentos)
4. [Colecciones de Firestore](#colecciones-de-firestore)
5. [Páginas y Rutas](#páginas-y-rutas)
6. [Componentes](#componentes)
7. [Hooks Personalizados](#hooks-personalizados)
8. [Funciones y Utilidades](#funciones-y-utilidades)
9. [APIs y Endpoints](#apis-y-endpoints)
10. [Flujos de Trabajo](#flujos-de-trabajo)
11. [Cálculos y Fórmulas](#cálculos-y-fórmulas)
12. [Estados y Gestión de Estado](#estados-y-gestión-de-estado)

---

## 1. INTRODUCCIÓN

La sección de OBRAS es un módulo completo del sistema de gestión de maderera que permite:

- **Crear y gestionar presupuestos** organizados por bloques
- **Convertir presupuestos en obras** activas
- **Gestionar obras** con seguimiento de materiales, cobranzas y documentación
- **Mantener notas** de obras en un calendario semanal
- **Imprimir y exportar** presupuestos y obras en PDF

### Tecnologías Utilizadas

- **Next.js 14+** (App Router)
- **React 18+** (Hooks, Context)
- **Firebase Firestore** (Base de datos)
- **Tailwind CSS** (Estilos)
- **shadcn/ui** (Componentes UI)
- **Iconify** (Iconos)
- **html2pdf.js** (Generación de PDFs)

---

## 2. ESTRUCTURA DE DATOS

### 2.1. Documento de Obra/Presupuesto (Colección: `obras`)

```typescript
interface ObraDocument {
  // Identificación
  id: string; // ID del documento en Firestore
  tipo: "presupuesto" | "obra"; // Tipo de documento
  numeroPedido: string; // Formato: "PO-0001" (presupuesto) o "OBRA-00001" (obra)
  fecha: string; // ISO string (YYYY-MM-DD)
  fechaCreacion: string; // ISO string timestamp
  fechaModificacion?: string; // ISO string timestamp (opcional)
  
  // Cliente
  clienteId: string; // ID del cliente en colección "clientes"
  cliente: {
    nombre: string;
    cuit?: string;
    direccion: string;
    telefono: string;
    email?: string;
    localidad?: string;
    partido?: string;
    barrio?: string;
    area?: string;
    lote?: string;
    descripcion?: string;
    provincia?: string;
  };
  
  // Estado
  estado: string; // Para presupuestos: "Activo" | "Inactivo"
                    // Para obras: "pendiente_inicio" | "en_ejecucion" | "pausada" | "completada" | "cancelada"
  
  // PRESUPUESTO (tipo: "presupuesto")
  bloques?: BloquePresupuesto[]; // Array de bloques (estructura nueva)
  productos?: ProductoPresupuesto[]; // Array de productos (estructura antigua, sin bloques)
  subtotal?: number;
  descuentoTotal?: number;
  total?: number;
  descripcionGeneral?: string; // Descripción general del presupuesto
  pagoEnEfectivo?: boolean; // Si es true, aplica descuento del 10%
  
  // OBRA (tipo: "obra")
  presupuestoInicialId?: string; // ID del presupuesto vinculado
  presupuestoInicialBloqueId?: string; // ID del bloque seleccionado del presupuesto
  presupuestoInicialBloqueNombre?: string; // Nombre del bloque seleccionado
  
  // Ubicación de la obra
  ubicacion?: {
    direccion: string;
    localidad: string;
    provincia: string;
    barrio?: string;
    area?: string;
    lote?: string;
    descripcion?: string;
  };
  usarDireccionCliente?: boolean; // Si usa la dirección del cliente
  
  // Fechas de la obra
  fechas?: {
    inicio: string; // ISO string (YYYY-MM-DD)
    fin: string; // ISO string (YYYY-MM-DD)
  };
  
  // Materiales de la obra (del catálogo general: productos)
  materialesCatalogo?: MaterialObra[];
  materialesSubtotal?: number;
  materialesDescuento?: number;
  materialesTotal?: number;
  
  // Productos de la obra (del presupuesto inicial: productos_obras)
  productos?: ProductoObra[];
  productosSubtotal?: number; // Compatibilidad con estructura antigua
  productosDescuento?: number; // Compatibilidad con estructura antigua
  productosTotal?: number; // Compatibilidad con estructura antigua
  
  // Totales combinados
  subtotal?: number; // productosSubtotal + materialesSubtotal
  descuentoTotal?: number; // productosDescuento + materialesDescuento
  total?: number; // subtotal - descuentoTotal
  
  // Gastos adicionales
  gastoObraManual?: number; // Gasto manual cuando no hay presupuesto inicial
  costoEnvio?: number;
  
  // Descripción general
  descripcionGeneral?: string;
  
  // Cobranzas (estructura legacy, se migra a movimientos)
  cobranzas?: {
    formaPago?: string;
    senia?: number;
    fechaSenia?: string;
    monto?: number;
    fechaMonto?: string;
    historialPagos?: MovimientoCobranza[];
  };
  
  // Movimientos de cobranza (estructura nueva, ledger)
  movimientos?: MovimientoCobranza[]; // Se persiste en cobranzas.historialPagos
  
  // Documentación
  documentacion?: {
    links?: string[]; // Array de URLs
  };
  
  // Información de envío (opcional)
  tipoEnvio?: string; // "retiro_local" | "envio_domicilio" | etc.
  direccionEnvio?: string;
  localidadEnvio?: string;
  transportista?: string;
  fechaEntrega?: string;
  rangoHorario?: string;
}
```

### 2.2. Bloque de Presupuesto

```typescript
interface BloquePresupuesto {
  id: string; // ID único del bloque (formato: "presupuesto-{timestamp}")
  nombre: string; // Nombre del bloque (ej: "Presupuesto 1", "Cocina", "Baño")
  descripcion?: string; // Descripción del bloque (aparece en impresión)
  productos: ProductoPresupuesto[]; // Array de productos del bloque
  subtotal: number; // Suma de precios de productos
  descuentoTotal: number; // Suma de descuentos aplicados
  descuentoEfectivo?: number; // Descuento del 10% si pagoEnEfectivo es true
  total: number; // subtotal - descuentoTotal - descuentoEfectivo
}
```

### 2.3. Producto de Presupuesto (productos_obras)

```typescript
interface ProductoPresupuesto {
  id: string; // ID único de la instancia (permite duplicados)
  originalId: string; // ID del producto original en productos_obras
  nombre: string;
  categoria: string;
  subCategoria?: string; // También puede ser subcategoria
  unidadMedida: "UN" | "M2" | "ML"; // Unidad de medida
  valorVenta: number; // Precio unitario editable
  alto?: number; // Para M2 y ML
  largo?: number; // Para M2 y ML
  cantidad: number;
  descuento: number; // Porcentaje (0-100)
  precio: number; // Precio calculado según unidadMedida
  descripcion?: string; // Descripción específica del producto
  m2?: number; // Metros cuadrados calculados (si unidadMedida === "M2")
  ml?: number; // Metros lineales calculados (si unidadMedida === "ML")
  _esManual?: boolean; // Flag para productos creados manualmente
}
```

### 2.4. Material de Obra (productos)

```typescript
interface MaterialObra {
  id: string; // ID del producto en colección "productos"
  nombre: string;
  categoria: string; // "Maderas" | "Ferretería" | etc.
  subcategoria?: string;
  unidad: string; // "UN" | "M2" | "ML" | etc.
  cantidad: number;
  descuento: number; // Porcentaje (0-100)
  precio: number; // Precio unitario o calculado
  subtotal: number; // precio * cantidad * (1 - descuento/100)
  
  // Campos específicos para Maderas
  alto?: number;
  ancho?: number;
  largo?: number;
  precioPorPie?: number;
  cepilladoAplicado?: boolean; // Si es true, precio se multiplica por 1.066
}
```

### 2.5. Producto de Obra (del presupuesto inicial)

```typescript
interface ProductoObra {
  id: string;
  nombre: string;
  categoria: string;
  subcategoria?: string;
  unidad: string;
  cantidad: number;
  descuento: number;
  precio: number;
  subtotal: number;
  
  // Campos específicos para Maderas
  alto?: number;
  ancho?: number;
  largo?: number;
  precioPorPie?: number;
  cepilladoAplicado?: boolean;
}
```

### 2.6. Movimiento de Cobranza

```typescript
interface MovimientoCobranza {
  fecha: string; // ISO string (YYYY-MM-DD)
  tipo: "pago" | "seña" | "reembolso"; // Tipo de movimiento
  metodo: string; // "efectivo" | "transferencia" | "tarjeta" | etc.
  monto: number; // Monto del movimiento
  nota?: string; // Nota adicional
}
```

### 2.7. Nota de Obra (Colección: `notasObras`)

```typescript
interface NotaObra {
  id: string; // ID del documento en Firestore
  nombreObra: string; // Nombre de la obra
  productos: string; // Texto libre con productos/detalles
  fecha: string; // ISO string (YYYY-MM-DD)
  userId: string; // ID del usuario que creó la nota
  userEmail: string; // Email del usuario
  createdAt: Timestamp | string; // Firebase Timestamp o ISO string
  updatedAt: Timestamp | string; // Firebase Timestamp o ISO string
}
```

---

## 3. TIPOS DE DOCUMENTOS

### 3.1. Presupuesto (`tipo: "presupuesto"`)

**Características:**
- Número de pedido: `PO-0001`, `PO-0002`, etc.
- Puede tener múltiples bloques (`bloques[]`) o productos directos (`productos[]`)
- Estado siempre "Activo" o "Inactivo"
- Se puede convertir a obra
- No tiene ubicación ni fechas de ejecución

**Estructura de datos:**
```javascript
{
  tipo: "presupuesto",
  numeroPedido: "PO-0001",
  fecha: "2024-01-15",
  clienteId: "...",
  cliente: {...},
  bloques: [
    {
      id: "presupuesto-1234567890",
      nombre: "Presupuesto 1",
      descripcion: "...",
      productos: [...],
      subtotal: 100000,
      descuentoTotal: 5000,
      total: 95000
    }
  ],
  estado: "Activo",
  fechaCreacion: "2024-01-15T10:30:00.000Z"
}
```

### 3.2. Obra (`tipo: "obra"`)

**Características:**
- Número de pedido: `OBRA-00001`, `OBRA-00002`, etc.
- Puede tener presupuesto inicial vinculado
- Tiene ubicación, fechas, estado de ejecución
- Gestiona materiales del catálogo y productos del presupuesto
- Tiene sistema de cobranzas (movimientos)
- Tiene documentación asociada

**Estructura de datos:**
```javascript
{
  tipo: "obra",
  numeroPedido: "OBRA-00001",
  fecha: "2024-01-20",
  clienteId: "...",
  cliente: {...},
  estado: "en_ejecucion",
  presupuestoInicialId: "presupuesto-id",
  presupuestoInicialBloqueId: "bloque-id",
  presupuestoInicialBloqueNombre: "Presupuesto 1",
  ubicacion: {
    direccion: "...",
    localidad: "...",
    provincia: "..."
  },
  fechas: {
    inicio: "2024-01-20",
    fin: "2024-02-15"
  },
  materialesCatalogo: [...],
  productos: [...],
  total: 150000,
  cobranzas: {
    historialPagos: [...]
  },
  documentacion: {
    links: [...]
  }
}
```

---

## 4. COLECCIONES DE FIRESTORE

### 4.1. `obras`

**Descripción:** Colección principal que almacena tanto presupuestos como obras.

**Índices recomendados:**
- `tipo` (ascending)
- `fechaCreacion` (descending)
- `clienteId` (ascending)
- `estado` (ascending)

**Operaciones:**
- Crear: `addDoc(collection(db, "obras"), data)`
- Leer: `getDoc(doc(db, "obras", id))` o `getDocs(collection(db, "obras"))`
- Actualizar: `updateDoc(doc(db, "obras", id), data)`
- Eliminar: `deleteDoc(doc(db, "obras", id))`

### 4.2. `notasObras`

**Descripción:** Almacena notas rápidas de obras organizadas por fecha.

**Estructura del documento:**
```typescript
{
  nombreObra: string;
  productos: string;
  fecha: string; // YYYY-MM-DD
  userId: string;
  userEmail: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

**Operaciones:**
- Crear: `POST /api/notas-obras`
- Actualizar: `PUT /api/notas-obras`
- Eliminar: `DELETE /api/notas-obras`

### 4.3. `productos_obras`

**Descripción:** Catálogo de productos específicos para presupuestos de obras.

**Estructura del documento:**
```typescript
{
  nombre: string;
  categoria: string;
  subCategoria?: string;
  unidadMedida: "UN" | "M2" | "ML";
  valorVenta: number;
  // ... otros campos del producto
}
```

**Uso:** Se utiliza en la creación y edición de presupuestos.

### 4.4. `productos`

**Descripción:** Catálogo general de productos (usado para materiales de obras).

**Uso:** Se utiliza para agregar materiales adicionales a obras.

### 4.5. `clientes`

**Descripción:** Colección de clientes del sistema.

**Uso:** Referenciada en obras y presupuestos mediante `clienteId`.

---

## 5. PÁGINAS Y RUTAS

### 5.1. `/obras` - Listado Principal

**Archivo:** `app/[lang]/(dashboard)/obras/page.jsx`

**Funcionalidades:**
- Muestra dos tablas: Presupuestos y Obras
- Calendario semanal de notas de obras
- Filtrado y búsqueda
- Eliminación de presupuestos y obras
- Navegación a crear nuevo presupuesto u obra

**Componentes principales:**
- `DataTableEnhanced` (para presupuestos y obras)
- Calendario semanal personalizado
- Diálogos de confirmación de eliminación
- Diálogo de notas

**Estados:**
```javascript
const [obrasData, setObrasData] = useState([]);
const [notas, setNotas] = useState([]);
const [currentWeekStart, setCurrentWeekStart] = useState(...);
const [showNotaDialog, setShowNotaDialog] = useState(false);
```

**Funciones clave:**
- `fetchData()`: Carga obras y presupuestos, enriquece con totales y estados
- `loadNotas()`: Carga notas desde Firestore
- `saveNota()`: Guarda o actualiza nota
- `deleteNota()`: Elimina nota
- `confirmDelete()`: Elimina presupuesto u obra

### 5.2. `/obras/create` - Crear Obra

**Archivo:** `app/[lang]/(dashboard)/obras/create/page.jsx`

**Funcionalidades:**
- Selección de cliente (con modal para crear nuevo)
- Configuración de ubicación (usar dirección del cliente o manual)
- Vinculación de presupuesto inicial (opcional)
- Selección de materiales del catálogo
- Cálculo automático de precios para maderas

**Secciones:**
1. **Datos Generales:** Cliente
2. **Ubicación:** Dirección, localidad, provincia, etc.
3. **Presupuesto y Costos:** Presupuesto inicial o monto estimado
4. **Catálogo de Materiales:** Búsqueda, filtros, paginación
5. **Productos Seleccionados:** Tabla editable con dimensiones y precios

**Cálculos de precios:**
- **Maderas (machimbre/deck):** `alto × largo × precioPorPie × cantidad`
- **Maderas (corte):** `0.2734 × alto × ancho × largo × precioPorPie`
- **Cepillado:** Aplica factor `1.066` al precio base
- **Ferretería:** `valorVenta × cantidad`

### 5.3. `/obras/[id]` - Detalle de Obra

**Archivo:** `app/[lang]/(dashboard)/obras/[id]/page.jsx`

**Funcionalidades:**
- Visualización completa de la obra
- Modo edición para modificar datos
- Gestión de cobranzas (movimientos)
- Gestión de materiales del catálogo
- Gestión de productos del presupuesto inicial
- Cambio de bloque del presupuesto inicial
- Impresión y descarga PDF

**Componentes utilizados:**
- `ObraHeader`: Encabezado con acciones
- `ObraInfoGeneral`: Información general editable
- `ObraCobranza`: Gestión de pagos
- `ObraDocumentacion`: Links de documentación
- `CatalogoVentas`: Catálogo de materiales
- `TablaProductosVentas`: Tabla de materiales seleccionados
- `CatalogoObras`: Catálogo de productos de obra
- `TablaProductosObras`: Tabla de productos de obra
- `PresupuestoDetalle`: Detalle del presupuesto inicial

**Hook utilizado:** `useObra(id)`

### 5.4. `/obras/presupuesto/create` - Crear Presupuesto

**Archivo:** `app/[lang]/(dashboard)/obras/presupuesto/create/page.jsx`

**Funcionalidades:**
- Creación de presupuestos con múltiples bloques
- Selección de cliente
- Catálogo de productos de obras (`productos_obras`)
- Gestión de bloques (agregar, eliminar, renombrar)
- Productos por bloque con descripciones
- Cálculo de totales por bloque

**Características especiales:**
- Permite duplicar productos en el mismo bloque
- Productos manuales editables
- Descripción por bloque
- Cálculo de precios según unidad de medida:
  - **M2:** `alto × largo × valorVenta × cantidad`
  - **ML:** `largo × valorVenta × cantidad`
  - **UN:** `valorVenta × cantidad`

### 5.5. `/obras/presupuesto/[id]` - Detalle de Presupuesto

**Archivo:** `app/[lang]/(dashboard)/obras/presupuesto/[id]/page.jsx`

**Funcionalidades:**
- Visualización del presupuesto
- Edición de bloques y productos
- Conversión a obra (con selección de bloque)
- Impresión y descarga PDF

**Componentes utilizados:**
- `PresupuestoDetalle`: Componente principal para edición
- `ObraInfoGeneral`: Información del cliente
- `ObraResumenFinanciero`: Resumen financiero por bloques

**Flujo de conversión:**
1. Seleccionar bloque a convertir (si hay múltiples)
2. Configurar ubicación (cliente o nueva)
3. Agregar materiales adicionales (opcional)
4. Agregar descripción general
5. Convertir a obra

---

## 6. COMPONENTES

### 6.1. `ObraHeader`

**Archivo:** `components/obras/ObraHeader.jsx`

**Props:**
```typescript
{
  obra: ObraDocument;
  editando: boolean;
  onToggleEdit: () => void;
  onPrint: () => void;
  onConvertToObra?: () => void; // Solo para presupuestos
  converting?: boolean;
  showBackButton?: boolean;
  backUrl?: string;
}
```

**Funcionalidad:** Encabezado con información de la obra/presupuesto y botones de acción.

### 6.2. `ObraInfoGeneral`

**Archivo:** `components/obras/ObraInfoGeneral.jsx`

**Props:**
```typescript
{
  obra: ObraDocument;
  formatearFecha: (fecha: string) => string;
  editando: boolean;
  // Estados editables
  estadoObra: string;
  fechasEdit: { inicio: string; fin: string };
  ubicacionEdit: {...};
  clienteId: string;
  cliente: Cliente | null;
  clientes: Cliente[];
  usarDireccionCliente: boolean;
  // Setters
  setEstadoObra: (estado: string) => void;
  setFechasEdit: (fechas: {...}) => void;
  setUbicacionEdit: (ubicacion: {...}) => void;
  setClienteId: (id: string) => void;
  setCliente: (cliente: Cliente | null) => void;
  setUsarDireccionCliente: (usar: boolean) => void;
}
```

**Funcionalidad:** Muestra y permite editar información general de la obra.

### 6.3. `ObraCobranza`

**Archivo:** `components/obras/ObraCobranza.jsx`

**Props:**
```typescript
{
  movimientos: MovimientoCobranza[];
  onMovimientosChange: (movimientos: MovimientoCobranza[]) => void;
  editando: boolean;
  formatearNumeroArgentino: (numero: number) => string;
  totalObra: number;
  totalAbonado: number;
  onEstadoPagoChange?: (estaPagado: boolean) => void;
}
```

**Funcionalidad:** Gestión de pagos y cobranzas de la obra.

### 6.4. `ObraDocumentacion`

**Archivo:** `components/obras/ObraDocumentacion.jsx`

**Props:**
```typescript
{
  docLinks: string[];
  onDocLinksChange: (links: string[]) => void;
  editando: boolean;
}
```

**Funcionalidad:** Gestión de links de documentación.

### 6.5. `PresupuestoDetalle`

**Archivo:** `components/obras/PresupuestoDetalle.jsx`

**Props:**
```typescript
{
  obra: ObraDocument;
  editando: boolean;
  formatearNumeroArgentino: (numero: number) => string;
  onObraUpdate: (obra: ObraDocument) => void;
  shouldSave: boolean; // Flag para forzar guardado
  onResetShouldSave: () => void;
}
```

**Funcionalidad:** Componente principal para editar presupuestos con bloques.

**Características:**
- Gestión de bloques (agregar, eliminar, renombrar)
- Catálogo de productos de obras
- Tabla de productos por bloque
- Cálculo de totales por bloque
- Guardado automático cuando `shouldSave` es true

### 6.6. `CatalogoObras`

**Archivo:** `components/obras/CatalogoObras.jsx`

**Props:**
```typescript
{
  titulo: string;
  productos: ProductoObraCatalogo[];
  productosPorCategoria: { [categoria: string]: ProductoObraCatalogo[] };
  categorias: string[];
  itemsSeleccionados: ProductoPresupuesto[];
  onAgregarProducto: (producto: ProductoObraCatalogo) => void;
  onAgregarProductoManual: () => void;
  editando: boolean;
  maxProductos?: number;
  showFilters?: boolean;
  showSearch?: boolean;
  showPagination?: boolean;
  productosPorPagina?: number;
}
```

**Funcionalidad:** Catálogo de productos específico para obras (colección `productos_obras`).

### 6.7. `TablaProductosObras`

**Archivo:** `components/obras/TablaProductosObras.jsx`

**Props:**
```typescript
{
  titulo: string;
  items: ProductoPresupuesto[];
  editando: boolean;
  onQuitarProducto: (id: string) => void;
  onActualizarCampo: (id: string, campo: string, valor: any) => void;
  onActualizarNombreManual: (id: string, nombre: string) => void;
  formatearNumeroArgentino: (numero: number) => string;
  showTotals?: boolean;
  showDescripcionGeneral?: boolean;
}
```

**Funcionalidad:** Tabla para mostrar y editar productos de presupuestos.

### 6.8. `CatalogoVentas`

**Archivo:** `components/ventas/CatalogoVentas.jsx`

**Uso en Obras:** Se utiliza para seleccionar materiales adicionales (colección `productos`).

### 6.9. `TablaProductosVentas`

**Archivo:** `components/ventas/TablaProductosVentas.jsx`

**Uso en Obras:** Se utiliza para mostrar y editar materiales seleccionados.

---

## 7. HOOKS PERSONALIZADOS

### 7.1. `useObra(id)`

**Archivo:** `hooks/useObra.js`

**Parámetros:**
- `id`: string - ID de la obra/presupuesto

**Retorna:**
```typescript
{
  // Estados de datos
  obra: ObraDocument | null;
  loading: boolean;
  error: string | null;
  presupuesto: ObraDocument | null; // Si tiene presupuesto inicial
  
  // Estados de edición
  editando: boolean;
  docLinks: string[];
  movimientos: MovimientoCobranza[];
  estadoObra: string;
  fechasEdit: { inicio: string; fin: string };
  ubicacionEdit: {...};
  clienteId: string;
  cliente: Cliente | null;
  clientes: Cliente[];
  usarDireccionCliente: boolean;
  
  // Estados de catálogos
  productosCatalogo: Producto[]; // Colección: productos
  productosPorCategoria: { [categoria: string]: Producto[] };
  categorias: string[];
  categoriaId: string;
  busquedaProducto: string;
  busquedaDebounced: string;
  itemsCatalogo: MaterialObra[];
  isPendingCat: boolean;
  catalogoCargado: boolean;
  
  productosObraCatalogo: ProductoObraCatalogo[]; // Colección: productos_obras
  productosObraPorCategoria: { [categoria: string]: ProductoObraCatalogo[] };
  categoriasObra: string[];
  categoriaObraId: string;
  busquedaProductoObra: string;
  busquedaDebouncedObra: string;
  itemsPresupuesto: ProductoObra[];
  isPendingObra: boolean;
  
  // Estados adicionales
  gastoObraManual: number;
  presupuestosDisponibles: ObraDocument[];
  presupuestoSeleccionadoId: string;
  modoCosto: "presupuesto" | "gasto";
  descripcionGeneral: string;
  
  // Setters
  setObra: (obra: ObraDocument | null) => void;
  setEditando: (editando: boolean) => void;
  setDocLinks: (links: string[]) => void;
  setMovimientos: (movimientos: MovimientoCobranza[]) => void;
  setEstadoObra: (estado: string) => void;
  setFechasEdit: (fechas: {...}) => void;
  setUbicacionEdit: (ubicacion: {...}) => void;
  setClienteId: (id: string) => void;
  setCliente: (cliente: Cliente | null) => void;
  setUsarDireccionCliente: (usar: boolean) => void;
  setCategoriaId: (id: string) => void;
  setBusquedaProducto: (busqueda: string) => void;
  setItemsCatalogo: (items: MaterialObra[]) => void;
  setCategoriaObraId: (id: string) => void;
  setBusquedaProductoObra: (busqueda: string) => void;
  setItemsPresupuesto: (items: ProductoObra[]) => void;
  setGastoObraManual: (monto: number) => void;
  setPresupuestoSeleccionadoId: (id: string) => void;
  setModoCosto: (modo: "presupuesto" | "gasto") => void;
  setDescripcionGeneral: (desc: string) => void;
  
  // Funciones
  guardarEdicion: () => Promise<void>;
  handleDesvincularPresupuesto: () => Promise<void>;
  handleVincularPresupuesto: () => Promise<void>;
  handleCrearPresupuestoDesdeAqui: () => Promise<void>;
  convertirPresupuestoToObra: (datosConversion: {...}, user: User) => Promise<void>;
  cargarCatalogoProductos: () => Promise<void>;
  cambiarBloquePresupuesto: (bloqueId: string) => Promise<void>;
  getNextObraNumber: () => Promise<string>;
  getNextPresupuestoNumber: () => Promise<string>;
}
```

**Funcionalidades principales:**
- Carga la obra desde Firestore
- Carga el presupuesto inicial si existe
- Inicializa estados de edición
- Carga catálogos de productos cuando se entra en modo edición
- Gestiona guardado de ediciones
- Convierte presupuestos a obras
- Cambia el bloque seleccionado del presupuesto inicial

**Efectos importantes:**
- Auto-hidratación de productos del bloque si la obra no los tiene
- Debounce de búsquedas
- Carga de catálogos al entrar en modo edición

---

## 8. FUNCIONES Y UTILIDADES

### 8.1. `lib/obra-utils.js`

#### `formatearNumeroArgentino(numero)`
Formatea un número como moneda argentina (ARS).

```javascript
formatearNumeroArgentino(100000) // "$ 100.000,00"
```

#### `formatearFecha(fecha)`
Formatea una fecha en formato legible.

```javascript
formatearFecha("2024-01-15") // "15 de enero de 2024"
```

#### `parseNumericValue(value)`
Parsea un valor a número, permitiendo strings vacíos.

```javascript
parseNumericValue("100") // 100
parseNumericValue("") // ""
parseNumericValue(null) // ""
```

#### `calcularPrecioMachimbre({ alto, largo, cantidad, precioPorPie })`
Calcula el precio para machimbre o deck.

**Fórmula:** `alto × largo × precioPorPie × cantidad`

**Redondeo:** A centenas (`Math.round(precio / 100) * 100`)

#### `calcularPrecioCorteMadera({ alto, ancho, largo, precioPorPie })`
Calcula el precio para madera cortada.

**Fórmula:** `0.2734 × alto × ancho × largo × precioPorPie`

**Redondeo:** A centenas

#### `calcularPrecioProductoObra({ unidadMedida, alto, largo, valorVenta, cantidad })`
Calcula el precio para productos de obras según unidad de medida.

**Fórmulas:**
- **M2:** `alto × largo × valorVenta × cantidad`
- **ML:** `largo × valorVenta × cantidad`
- **UN:** `valorVenta × cantidad`

#### `generarContenidoImpresion(obra, presupuesto, modoCosto, movimientos)`
Genera el HTML completo para impresión/PDF.

**Características:**
- Soporta presupuestos con bloques (múltiples páginas)
- Soporta presupuestos sin bloques (estructura antigua)
- Incluye información del cliente
- Incluye productos/materiales con totales
- Incluye movimientos de cobranza
- Incluye información de envío si existe
- Estilos optimizados para impresión

#### `descargarPDF(obra, presupuesto, modoCosto, movimientos)`
Descarga un PDF usando html2pdf.js.

#### `descargarPDFRobusto(obra, presupuesto, modoCosto, movimientos)`
Versión más robusta con mejor renderizado.

#### `descargarPDFDesdeIframe(obra, presupuesto, modoCosto, movimientos)`
Usa el iframe del modal de vista previa para generar el PDF.

### 8.2. Funciones de Generación de Números

#### `getNextObraNumber()`
Genera el siguiente número de obra: `OBRA-00001`, `OBRA-00002`, etc.

**Ubicación:** `app/[lang]/(dashboard)/obras/create/page.jsx` y `hooks/useObra.js`

#### `getNextPresupuestoNumber()`
Genera el siguiente número de presupuesto: `PO-0001`, `PO-0002`, etc.

**Ubicación:** `hooks/useObra.js`

---

## 9. APIs Y ENDPOINTS

### 9.1. `/api/notas-obras`

**Archivo:** `app/api/notas-obras/route.js`

#### `POST /api/notas-obras`
Crea una nueva nota de obra.

**Body:**
```json
{
  "nombreObra": "Casa Rodriguez",
  "productos": "10 tablas de pino, 5kg de clavos",
  "fecha": "2024-01-15",
  "userId": "user-id",
  "userEmail": "user@example.com"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Nota creada exitosamente",
  "id": "nota-id",
  "nota": {
    "id": "nota-id",
    "nombreObra": "Casa Rodriguez",
    "productos": "10 tablas de pino, 5kg de clavos",
    "fecha": "2024-01-15",
    "userId": "user-id",
    "userEmail": "user@example.com",
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:30:00.000Z"
  }
}
```

#### `PUT /api/notas-obras`
Actualiza una nota existente.

**Body:**
```json
{
  "notaId": "nota-id",
  "nombreObra": "Casa Rodriguez",
  "productos": "10 tablas de pino, 5kg de clavos, 2kg de tornillos",
  "fecha": "2024-01-15",
  "userId": "user-id"
}
```

#### `DELETE /api/notas-obras`
Elimina una nota.

**Body:**
```json
{
  "notaId": "nota-id",
  "userId": "user-id"
}
```

### 9.2. `/api/delete-document`

**Archivo:** `app/api/delete-document/route.js`

**Uso:** Elimina presupuestos y obras (compartido con otras secciones).

**Body:**
```json
{
  "documentId": "obra-id",
  "collectionName": "obras",
  "userId": "user-id",
  "userEmail": "user@example.com"
}
```

---

## 10. FLUJOS DE TRABAJO

### 10.1. Crear Presupuesto

1. Usuario navega a `/obras/presupuesto/create`
2. Selecciona o crea cliente
3. Agrega bloques (opcional, mínimo 1)
4. Por cada bloque:
   - Selecciona productos del catálogo `productos_obras`
   - Edita cantidades, dimensiones, precios
   - Agrega descripciones
5. Agrega descripción por bloque
6. Guarda presupuesto
7. Se genera número `PO-XXXX` automáticamente
8. Se guarda en Firestore con `tipo: "presupuesto"`

### 10.2. Convertir Presupuesto a Obra

1. Usuario abre detalle del presupuesto (`/obras/presupuesto/[id]`)
2. Hace clic en "Convertir a Obra"
3. Si hay múltiples bloques, selecciona uno
4. Configura ubicación (cliente o nueva)
5. Opcionalmente agrega materiales adicionales del catálogo `productos`
6. Agrega descripción general
7. Confirma conversión
8. Se crea nueva obra con:
   - Número `OBRA-XXXXX`
   - Productos del bloque seleccionado en `productos[]`
   - Materiales adicionales en `materialesCatalogo[]`
   - `presupuestoInicialId` y `presupuestoInicialBloqueId` vinculados
9. Redirige a `/obras/[id]` de la nueva obra

### 10.3. Crear Obra Directamente

1. Usuario navega a `/obras/create`
2. Selecciona o crea cliente
3. Configura ubicación
4. Opcionalmente vincula presupuesto inicial
5. Selecciona materiales del catálogo `productos`
6. Edita cantidades, dimensiones, precios
7. Guarda obra
8. Se genera número `OBRA-XXXXX` automáticamente
9. Se guarda en Firestore con `tipo: "obra"`

### 10.4. Editar Obra

1. Usuario abre detalle de obra (`/obras/[id]`)
2. Hace clic en "Editar"
3. Modifica información general (estado, fechas, ubicación, cliente)
4. Agrega/quita materiales del catálogo
5. Modifica productos del presupuesto inicial (si existe)
6. Cambia bloque del presupuesto inicial (si hay múltiples)
7. Gestiona cobranzas (agrega movimientos)
8. Gestiona documentación (agrega links)
9. Guarda cambios
10. Se actualiza en Firestore

### 10.5. Gestionar Notas

1. Usuario navega a `/obras`
2. Ve calendario semanal
3. Hace clic en "Agregar" en un día
4. Completa formulario (nombre obra, productos, fecha)
5. Guarda nota
6. La nota aparece en el calendario
7. Puede editar o eliminar desde el calendario

---

## 11. CÁLCULOS Y FÓRMULAS

### 11.1. Precios de Maderas

#### Machimbre/Deck
```javascript
precio = alto × largo × precioPorPie × cantidad
if (cepilladoAplicado) precio = precio × 1.066
precio = Math.round(precio / 100) * 100 // Redondeo a centenas
```

#### Corte de Madera
```javascript
precio = 0.2734 × alto × ancho × largo × precioPorPie
if (cepilladoAplicado) precio = precio × 1.066
precio = Math.round(precio / 100) * 100 // Redondeo a centenas
```

### 11.2. Precios de Productos de Obras

#### Metros Cuadrados (M2)
```javascript
precio = alto × largo × valorVenta × cantidad
```

#### Metros Lineales (ML)
```javascript
precio = largo × valorVenta × cantidad
```

#### Unidades (UN)
```javascript
precio = valorVenta × cantidad
```

### 11.3. Totales

#### Subtotal por Producto
```javascript
// Para machimbre/deck
subtotal = precio * (1 - descuento / 100)

// Para otros
subtotal = precio * cantidad * (1 - descuento / 100)
```

#### Total de Bloque
```javascript
subtotal = suma de precios de productos
descuentoTotal = suma de descuentos aplicados
descuentoEfectivo = pagoEnEfectivo ? subtotal * 0.1 : 0
total = subtotal - descuentoTotal - descuentoEfectivo
```

#### Total de Obra
```javascript
productosSubtotal = suma de precios de productos del presupuesto
productosDescuento = suma de descuentos de productos
materialesSubtotal = suma de precios de materiales
materialesDescuento = suma de descuentos de materiales
subtotal = productosSubtotal + materialesSubtotal
descuentoTotal = productosDescuento + materialesDescuento
total = subtotal - descuentoTotal + gastoObraManual + costoEnvio
```

### 11.4. Cobranzas

#### Total Abonado
```javascript
totalAbonado = senia + monto + suma(historialPagos.monto)
```

#### Saldo Pendiente
```javascript
saldoPendiente = totalObra - totalAbonado
```

#### Estado de Pago
```javascript
if (totalAbonado >= totalObra && totalObra > 0) {
  estadoPago = "pagado"
} else if (totalAbonado > 0) {
  estadoPago = "parcial"
} else {
  estadoPago = "pendiente"
}
```

---

## 12. ESTADOS Y GESTIÓN DE ESTADO

### 12.1. Estados de Obra

```typescript
type EstadoObra = 
  | "pendiente_inicio"  // Pendiente de Inicio
  | "en_ejecucion"      // En Ejecución
  | "pausada"          // Pausada
  | "completada"        // Completada
  | "cancelada"         // Cancelada
```

### 12.2. Estados de Presupuesto

```typescript
type EstadoPresupuesto = 
  | "Activo"    // Activo
  | "Inactivo"  // Inactivo
```

### 12.3. Estados de Pago

```typescript
type EstadoPago = 
  | "pagado"     // Pagado completamente
  | "parcial"    // Pago parcial
  | "pendiente"  // Pendiente de pago
```

### 12.4. Gestión de Estado en Componentes

**Principio:** Los componentes de detalle (`/obras/[id]`, `/obras/presupuesto/[id]`) utilizan el hook `useObra` que centraliza toda la lógica de estado.

**Flujo de edición:**
1. Usuario hace clic en "Editar"
2. `setEditando(true)` activa modo edición
3. Componentes muestran inputs editables
4. Usuario modifica datos
5. Estados locales se actualizan
6. Usuario hace clic en "Guardar"
7. `guardarEdicion()` persiste cambios en Firestore
8. `setEditando(false)` desactiva modo edición
9. Se recarga la obra desde Firestore

**Sincronización:**
- Los cambios se guardan en Firestore
- Después de guardar, se recarga el documento completo
- Los estados locales se sincronizan con Firestore

---

## 13. NOTAS ADICIONALES

### 13.1. Compatibilidad con Estructuras Antiguas

El sistema mantiene compatibilidad con presupuestos que no tienen bloques:
- Si `bloques` no existe o está vacío, se usa `productos[]`
- Los totales se calculan desde `productos[]` si no hay bloques
- En la impresión, se detecta si hay bloques y se renderiza apropiadamente

### 13.2. Duplicación de Productos

- Los presupuestos permiten agregar el mismo producto múltiples veces
- Cada instancia tiene un `id` único generado con timestamp y random
- Se mantiene `originalId` para referencia al producto original

### 13.3. Auto-hidratación de Productos

Si una obra tiene `presupuestoInicialId` y `presupuestoInicialBloqueId` pero no tiene productos, el hook `useObra` automáticamente:
1. Carga el presupuesto
2. Encuentra el bloque seleccionado
3. Copia los productos del bloque a la obra
4. Persiste los cambios

### 13.4. Redondeo de Precios

Todos los precios de maderas se redondean a centenas:
```javascript
Math.round(precio / 100) * 100
```

Esto asegura precios redondeados (ej: 100, 200, 300, 1500, etc.)

### 13.5. Factor de Cepillado

Cuando se aplica cepillado a maderas, el precio se multiplica por `1.066`:
```javascript
if (cepilladoAplicado) precio = precio * 1.066
```

### 13.6. Descuento por Pago en Efectivo

Si `pagoEnEfectivo` es `true`, se aplica un descuento adicional del 10%:
```javascript
descuentoEfectivo = subtotal * 0.1
total = subtotal - descuentoTotal - descuentoEfectivo
```

---

## 14. RECURSOS Y DEPENDENCIAS

### 14.1. Colecciones de Firestore

- `obras`: Presupuestos y obras
- `notasObras`: Notas de obras
- `productos_obras`: Catálogo de productos para presupuestos
- `productos`: Catálogo general de productos (materiales)
- `clientes`: Clientes del sistema
- `auditoria`: Registros de auditoría (conversiones)

### 14.2. Componentes UI Utilizados

- `Card`, `CardContent`, `CardHeader`, `CardTitle`
- `Button`
- `Input`
- `Select`, `SelectContent`, `SelectItem`, `SelectTrigger`, `SelectValue`
- `Dialog`, `DialogContent`, `DialogHeader`, `DialogFooter`, `DialogTitle`, `DialogDescription`
- `Badge`
- `Textarea`
- `DataTableEnhanced`

### 14.3. Librerías Externas

- `firebase/firestore`: Operaciones de base de datos
- `@iconify/react`: Iconos
- `lucide-react`: Iconos adicionales
- `html2pdf.js`: Generación de PDFs (importación dinámica)
- `next/navigation`: Navegación y routing

### 14.4. Hooks de React

- `useState`: Gestión de estado local
- `useEffect`: Efectos secundarios y carga de datos
- `useMemo`: Valores memoizados (cálculos, filtros)
- `useCallback`: Funciones memoizadas
- `useRef`: Referencias a elementos DOM
- `useTransition`: Transiciones para operaciones pesadas

---

## 15. EJEMPLOS DE USO

### 15.1. Crear Presupuesto con Múltiples Bloques

```javascript
// En /obras/presupuesto/create/page.jsx
const bloques = [
  {
    id: "presupuesto-1",
    nombre: "Cocina",
    productos: [
      {
        id: "prod-1",
        nombre: "Machimbre Pino",
        unidadMedida: "M2",
        alto: 2.5,
        largo: 3.0,
        cantidad: 1,
        valorVenta: 5000,
        precio: 37500, // 2.5 * 3.0 * 5000 * 1
        descuento: 10
      }
    ],
    subtotal: 37500,
    descuentoTotal: 3750,
    total: 33750
  },
  {
    id: "presupuesto-2",
    nombre: "Baño",
    productos: [...],
    subtotal: 25000,
    descuentoTotal: 2500,
    total: 22500
  }
];
```

### 15.2. Convertir Presupuesto a Obra

```javascript
// En /obras/presupuesto/[id]/page.jsx
const datosConversion = {
  bloqueSeleccionado: "presupuesto-1", // ID del bloque
  ubicacionTipo: "cliente", // o "nueva"
  direccion: "...", // Solo si ubicacionTipo === "nueva"
  localidad: "...",
  provincia: "...",
  materialesAdicionales: [
    {
      id: "material-1",
      nombre: "Clavos",
      categoria: "Ferretería",
      cantidad: 5,
      precio: 1000
    }
  ],
  descripcionGeneral: "Obra completa de cocina y baño"
};

await convertirPresupuestoToObra(datosConversion, user);
```

### 15.3. Agregar Material a Obra

```javascript
// En /obras/[id]/page.jsx
const agregarProductoCatalogo = (prod) => {
  const esMadera = prod.categoria?.toLowerCase() === "maderas";
  
  if (esMadera) {
    const alto = Number(prod.alto) || 0;
    const ancho = Number(prod.ancho) || 0;
    const largo = Number(prod.largo) || 0;
    const precioPorPie = Number(prod.precioPorPie) || 0;
    
    let precioInicial = 0;
    if (prod.subcategoria === "machimbre" || prod.subcategoria === "deck") {
      precioInicial = calcularPrecioMachimbre({
        alto, largo, cantidad: 1, precioPorPie
      });
    } else {
      precioInicial = calcularPrecioCorteMadera({
        alto, ancho, largo, precioPorPie
      });
    }
    
    setItemsCatalogo(prev => [...prev, {
      id: prod.id,
      nombre: prod.nombre,
      categoria: prod.categoria,
      subcategoria: prod.subcategoria,
      unidad: prod.unidad || "UN",
      cantidad: 1,
      descuento: 0,
      precio: precioInicial,
      alto, ancho, largo, precioPorPie,
      cepilladoAplicado: false
    }]);
  } else {
    setItemsCatalogo(prev => [...prev, {
      id: prod.id,
      nombre: prod.nombre,
      categoria: prod.categoria,
      unidad: prod.unidad || "UN",
      cantidad: 1,
      descuento: 0,
      precio: Number(prod.valorVenta) || 0
    }]);
  }
};
```

### 15.4. Guardar Edición de Obra

```javascript
// En hooks/useObra.js
const guardarEdicion = async () => {
  // Sanitizar materiales
  const materialesSanitizados = itemsCatalogo.map((p) => {
    const esMadera = String(p.categoria || "").toLowerCase() === "maderas";
    const isMachDeck = esMadera && (p.subcategoria === "machimbre" || p.subcategoria === "deck");
    const precio = Number(p.precio) || 0;
    const cantidad = Number(p.cantidad) || 1;
    const descuento = Number(p.descuento) || 0;
    const base = isMachDeck ? precio : precio * cantidad;
    const subtotal = Math.round(base * (1 - descuento / 100));
    
    const item = {
      id: p.id,
      nombre: p.nombre || "",
      categoria: p.categoria || "",
      subcategoria: p.subcategoria || "",
      unidad: p.unidad || "",
      cantidad,
      descuento,
      precio,
      subtotal,
    };
    
    if (esMadera) {
      item.alto = Number(p.alto) || 0;
      item.ancho = Number(p.ancho) || 0;
      item.largo = Number(p.largo) || 0;
      item.precioPorPie = Number(p.precioPorPie) || 0;
      item.cepilladoAplicado = !!p.cepilladoAplicado;
    }
    
    return item;
  });
  
  // Calcular totales
  const materialesSubtotal = materialesSanitizados.reduce((acc, p) => {
    const esMadera = String(p.categoria || '').toLowerCase() === 'maderas';
    const isMachDeck = esMadera && (p.subcategoria === 'machimbre' || p.subcategoria === 'deck');
    const base = isMachDeck ? (Number(p.precio) || 0) : (Number(p.precio) || 0) * (Number(p.cantidad) || 0);
    return acc + base;
  }, 0);
  
  // Actualizar en Firestore
  await updateDoc(doc(db, "obras", obra.id), {
    materialesCatalogo: materialesSanitizados,
    materialesSubtotal,
    materialesDescuento,
    materialesTotal: materialesSubtotal - materialesDescuento,
    // ... otros campos
  });
};
```

---

## 16. CONSIDERACIONES DE RENDIMIENTO

### 16.1. Debounce de Búsquedas

Las búsquedas en catálogos utilizan debounce para evitar demasiadas actualizaciones:

```javascript
useEffect(() => {
  const timer = setTimeout(() => setBusquedaDebounced(busquedaProducto), 150);
  return () => clearTimeout(timer);
}, [busquedaProducto]);
```

### 16.2. Paginación

Los catálogos utilizan paginación para no renderizar demasiados productos:

```javascript
const productosPorPagina = 12;
const productosPaginados = productosFiltrados.slice(
  (paginaActual - 1) * productosPorPagina,
  paginaActual * productosPorPagina
);
```

### 16.3. useMemo para Cálculos

Los totales y filtros se calculan con `useMemo` para evitar recálculos innecesarios:

```javascript
const totalesPorBloque = useMemo(() => {
  return bloques.map(bloque => {
    const subtotal = bloque.productos.reduce((acc, p) => acc + Number(p.precio || 0), 0);
    const descuentoTotal = bloque.productos.reduce((acc, p) => acc + Number(p.precio || 0) * (Number(p.descuento || 0) / 100), 0);
    const total = subtotal - descuentoTotal;
    return { subtotal, descuentoTotal, total };
  });
}, [bloques]);
```

### 16.4. Carga Lazy de Catálogos

Los catálogos se cargan solo cuando se entra en modo edición:

```javascript
useEffect(() => {
  async function cargarCatalogos() {
    if (!editando) return;
    // Cargar catálogos...
  }
  cargarCatalogos();
}, [editando]);
```

---

## 17. ERRORES COMUNES Y SOLUCIONES

### 17.1. Error: "Obra no encontrada"

**Causa:** El ID de la obra no existe en Firestore.

**Solución:** Verificar que el ID sea correcto y que la obra exista.

### 17.2. Error: "No es una obra" / "No es un presupuesto"

**Causa:** Se está intentando acceder a una página de obra con un presupuesto o viceversa.

**Solución:** Verificar el `tipo` del documento y redirigir a la página correcta.

### 17.3. Error: Precios no se calculan correctamente

**Causa:** Valores NaN o undefined en los cálculos.

**Solución:** Asegurar que todos los valores numéricos se conviertan con `Number()` y se validen.

### 17.4. Error: Productos no aparecen después de cambiar bloque

**Causa:** El estado local no se actualiza correctamente.

**Solución:** Verificar que `cambiarBloquePresupuesto` actualice tanto Firestore como el estado local.

---

## 18. MEJORAS FUTURAS SUGERIDAS

1. **Historial de cambios:** Registrar todos los cambios en obras y presupuestos
2. **Notificaciones:** Alertas cuando una obra cambia de estado
3. **Reportes:** Generar reportes de obras por período, cliente, estado
4. **Exportación:** Exportar a Excel/CSV
5. **Fotos:** Subir y gestionar fotos de obras
6. **Tareas:** Sistema de tareas asociadas a obras
7. **Timeline:** Vista de línea de tiempo de la obra
8. **Compartir:** Compartir presupuestos con clientes vía link

---

## 19. CONCLUSIÓN

La sección de OBRAS es un módulo completo y robusto que permite gestionar todo el ciclo de vida de presupuestos y obras, desde la creación hasta el seguimiento de pagos y documentación. Utiliza una arquitectura moderna con React, Next.js y Firebase, con una separación clara de responsabilidades entre componentes, hooks y utilidades.

---

**Última actualización:** Enero 2024
**Versión del documento:** 1.0

