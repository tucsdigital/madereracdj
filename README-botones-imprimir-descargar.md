# Botones de Impresión y Descarga PDF

Este proyecto incluye funcionalidad para imprimir y descargar como PDF el formato de impresión de obras y presupuestos.

## Instalación

### 1. Instalar dependencias

```bash
npm install html2pdf.js
```

### 2. Verificar que la dependencia esté en package.json

```json
{
  "dependencies": {
    "html2pdf.js": "^0.10.3"
  }
}
```

## Componentes Creados

### 1. `PrintDownloadButtons` - Componente principal

Ubicado en: `components/ui/print-download-buttons.jsx`

**Props:**
- `obra`: Objeto con datos de la obra
- `presupuesto`: Objeto con datos del presupuesto (opcional)
- `modoCosto`: String indicando el modo de costo
- `movimientos`: Array de movimientos de cobranza (opcional)
- `className`: Clases CSS adicionales
- `variant`: Variante del botón ("outline", "default", etc.)
- `size`: Tamaño del botón ("sm", "md", "lg")

**Ejemplo de uso básico:**

```jsx
import PrintDownloadButtons from "@/components/ui/print-download-buttons";

<PrintDownloadButtons
  obra={miObra}
  presupuesto={miPresupuesto}
  modoCosto="venta"
  movimientos={misMovimientos}
/>
```

### 2. Funciones de utilidad

Ubicadas en: `lib/obra-utils.js`

- `generarContenidoImpresion()`: Genera el HTML para impresión
- `descargarPDF()`: Función básica de descarga (puede generar PDFs en blanco)
- `descargarPDFRobusto()`: Función mejorada que usa ventana oculta
- `descargarPDFDesdeIframe()`: **Función recomendada** que usa el iframe del modal

## Solución del Problema del PDF en Blanco

### ❌ **Problema Identificado**
La función original `descargarPDF` generaba PDFs en blanco porque:
- El contenido HTML no se renderizaba correctamente en el elemento temporal
- Los estilos CSS no se aplicaban completamente
- El timing de renderizado era insuficiente

### ✅ **Solución Implementada**
Se crearon **tres funciones** con diferentes enfoques:

#### **1. `descargarPDF` (Básica)**
- Enfoque original con elemento temporal
- **Problema**: Puede generar PDFs en blanco
- **Uso**: Solo como fallback

#### **2. `descargarPDFRobusto` (Mejorada)**
- Usa ventana oculta para renderizar contenido
- Espera a que se carguen completamente los estilos
- **Ventaja**: Más confiable que la básica
- **Desventaja**: Abre ventana temporal

#### **3. `descargarPDFDesdeIframe` (Recomendada) ⭐**
- **Usa el iframe del modal de vista previa**
- El contenido ya está renderizado y con estilos aplicados
- **Ventaja**: Máxima confiabilidad, no genera PDFs en blanco
- **Uso**: Función principal del componente

### 🔧 **Implementación Actual**
El componente `PrintDownloadButtons` usa `descargarPDFDesdeIframe` por defecto:

```jsx
import { descargarPDFDesdeIframe } from "@/lib/obra-utils";

const handleDescargarPDF = async () => {
  try {
    await descargarPDFDesdeIframe(obra, presupuesto, modoCosto, movimientos);
  } catch (error) {
    // Fallback automático a otras funciones
  }
};
```

## Implementación en Modales de Vista Previa

### ✅ **Modales Actualizados**

Los botones de impresión y descarga PDF ya están implementados en los modales de vista previa de:

1. **Modal de Obras** - `app/[lang]/(dashboard)/obras/[id]/page.jsx`
2. **Modal de Presupuestos** - `app/[lang]/(dashboard)/obras/presupuesto/[id]/page.jsx`

### 🔄 **Cambios Realizados**

- **Antes**: Solo había un botón "Imprimir"
- **Ahora**: Hay dos botones: "Imprimir" y "Descargar PDF"
- Se reemplazó el botón único por el componente `PrintDownloadButtons`
- Se actualizó la descripción del modal para indicar ambas funcionalidades

### 📱 **Ubicación en el Modal**

Los botones aparecen en el `DialogFooter` del modal, junto al botón "Cerrar":

```jsx
<DialogFooter className="gap-2">
  <Button variant="outline" onClick={() => setOpenPrint(false)}>
    Cerrar
  </Button>
  
  {/* Botones de impresión y descarga PDF */}
  <PrintDownloadButtons
    obra={obra}
    presupuesto={presupuesto}
    modoCosto={modoCosto}
    movimientos={movimientos}
    variant="default"
    size="sm"
  />
</DialogFooter>
```

## Características

### Botón Imprimir
- Abre una nueva ventana con el formato
- Ejecuta automáticamente la función de impresión del navegador
- Mantiene el formato exacto del diseño

### Botón Descargar PDF
- Genera un archivo PDF del documento
- El PDF mantiene exactamente el mismo formato visual
- Nombre de archivo automático: `{Tipo}_{NumeroPedido}.pdf`
- Configuración optimizada para calidad y tamaño
- **Solución al problema del PDF en blanco implementada**

## Personalización

### Estilos de botones
```jsx
// Botones con variante sólida
<PrintDownloadButtons
  variant="default"
  size="md"
  className="justify-center"
/>

// Botones grandes
<PrintDownloadButtons
  variant="outline"
  size="lg"
/>
```

### Configuración del PDF
Puedes modificar la configuración del PDF en `lib/obra-utils.js`:

```javascript
const opt = {
  margin: [8, 8, 8, 8],           // Márgenes en mm
  filename: "nombre_archivo.pdf",  // Nombre del archivo
  image: { type: 'jpeg', quality: 0.95 },
  html2canvas: { 
    scale: 1.5,                    // Escala de calidad
    useCORS: true,
    allowTaint: true,
    backgroundColor: '#ffffff',
    letterRendering: true,
    foreignObjectRendering: true
  },
  jsPDF: { 
    unit: 'mm',                    // Unidad de medida
    format: 'a4',                  // Formato de página
    orientation: 'portrait',       // Orientación
    compress: true,                // Compresión
    precision: 16                  // Precisión
  }
};
```

## Fallback

Si la generación del PDF falla:
1. Se muestra un mensaje de error en consola
2. Se intenta con la función robusta
3. Se abre una nueva ventana con el contenido HTML
4. El usuario puede usar la función de imprimir del navegador

## Compatibilidad

- ✅ Chrome/Chromium
- ✅ Firefox
- ✅ Safari
- ✅ Edge
- ⚠️ Internet Explorer (limitado)

## Solución de Problemas

### Error: "html2pdf is not defined"
- Verificar que `html2pdf.js` esté instalado
- Ejecutar `npm install` nuevamente

### PDF no se descarga
- Verificar permisos del navegador para descargas
- Revisar la consola del navegador para errores
- Usar el fallback de impresión

### **PDF se descarga en blanco** ⚠️
- **Solución implementada**: El componente usa `descargarPDFDesdeIframe` por defecto
- Esta función usa el contenido ya renderizado del modal
- Si persiste el problema, verificar que el modal esté abierto
- Usar el componente de prueba para diagnosticar

### Calidad del PDF baja
- Ajustar la escala en `html2canvas.scale`
- Verificar que las imágenes estén cargadas correctamente

## Ejemplos de Implementación

### 1. Uso Básico
Ver el archivo `components/examples/uso-botones-imprimir-descargar.jsx`

### 2. Modal de Vista Previa
Ver el archivo `components/examples/modal-vista-previa-actualizado.jsx`

### 3. **Prueba de Generación de PDF** ⭐
Ver el archivo `components/examples/test-pdf-generation.jsx` para probar las diferentes funciones

## Archivos Modificados

1. **`lib/obra-utils.js`** - Agregadas funciones `descargarPDFRobusto` y `descargarPDFDesdeIframe`
2. **`components/ui/print-download-buttons.jsx`** - Componente actualizado con función confiable
3. **`app/[lang]/(dashboard)/obras/[id]/page.jsx`** - Modal de obras actualizado
4. **`app/[lang]/(dashboard)/obras/presupuesto/[id]/page.jsx`** - Modal de presupuestos actualizado
5. **`package.json`** - Agregada dependencia `html2pdf.js`

## Notas Importantes

1. **Imágenes**: Asegúrate de que las imágenes usen rutas absolutas o URLs completas
2. **Fuentes**: Las fuentes web se incluyen automáticamente en el PDF
3. **Estilos**: Todos los estilos CSS se mantienen en el PDF generado
4. **Rendimiento**: Para documentos grandes, la generación del PDF puede tomar unos segundos
5. **Modales**: Los botones ya están integrados en los modales de vista previa existentes
6. **PDF en blanco**: **Problema resuelto** con la función `descargarPDFDesdeIframe`
