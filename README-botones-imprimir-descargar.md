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
- `descargarPDF()`: Genera y descarga el PDF

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
  margin: [10, 10, 10, 10],        // Márgenes en mm
  filename: "nombre_archivo.pdf",   // Nombre del archivo
  image: { type: 'jpeg', quality: 0.98 },
  html2canvas: { 
    scale: 2,                       // Escala de calidad
    useCORS: true,
    allowTaint: true
  },
  jsPDF: { 
    unit: 'mm',                     // Unidad de medida
    format: 'a4',                   // Formato de página
    orientation: 'portrait'          // Orientación
  }
};
```

## Fallback

Si la generación del PDF falla:
1. Se muestra un mensaje de error en consola
2. Se abre una nueva ventana con el contenido HTML
3. El usuario puede usar la función de imprimir del navegador

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

### Calidad del PDF baja
- Ajustar la escala en `html2canvas.scale`
- Verificar que las imágenes estén cargadas correctamente

## Ejemplos de Implementación

### 1. Uso Básico
Ver el archivo `components/examples/uso-botones-imprimir-descargar.jsx`

### 2. Modal de Vista Previa
Ver el archivo `components/examples/modal-vista-previa-actualizado.jsx`

## Archivos Modificados

1. **`lib/obra-utils.js`** - Agregada función `descargarPDF()`
2. **`components/ui/print-download-buttons.jsx`** - Nuevo componente
3. **`app/[lang]/(dashboard)/obras/[id]/page.jsx`** - Modal de obras actualizado
4. **`app/[lang]/(dashboard)/obras/presupuesto/[id]/page.jsx`** - Modal de presupuestos actualizado
5. **`package.json`** - Agregada dependencia `html2pdf.js`

## Notas Importantes

1. **Imágenes**: Asegúrate de que las imágenes usen rutas absolutas o URLs completas
2. **Fuentes**: Las fuentes web se incluyen automáticamente en el PDF
3. **Estilos**: Todos los estilos CSS se mantienen en el PDF generado
4. **Rendimiento**: Para documentos grandes, la generación del PDF puede tomar unos segundos
5. **Modales**: Los botones ya están integrados en los modales de vista previa existentes
