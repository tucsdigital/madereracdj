# Sistema de Drag & Drop para Imágenes de Productos

## 📋 Descripción General

Se ha implementado un sistema completo de **drag & drop** que permite arrastrar imágenes desde carpetas externas (explorador de archivos) directamente sobre los productos en la lista, sin necesidad de entrar al editor del producto.

## ✨ Características Principales

### 1. **Drag & Drop Directo**
- Arrastra imágenes desde tu explorador de archivos o escritorio
- Suelta la imagen directamente sobre cualquier producto en la lista
- El sistema detecta automáticamente sobre qué producto se está soltando la imagen

### 2. **Validaciones Automáticas**
- ✅ Solo acepta archivos de imagen (jpg, png, gif, webp, etc.)
- ✅ Tamaño máximo de archivo: 5MB
- ✅ Validación de tipo de archivo antes de procesar
- ❌ Muestra mensajes de error claros si el archivo no es válido

### 3. **Modal de Confirmación**
Al soltar una imagen, se muestra un modal elegante con:
- **Preview de la imagen** que se va a subir
- **Información del producto** destino (nombre, código, categoría)
- **Nombre del archivo** que se subirá
- **Alerta informativa** sobre cómo se agregará la imagen
- Botones de **Confirmar** o **Cancelar**

### 4. **Feedback Visual Profesional**

#### Sobre el Producto:
- **Efecto visual** en la fila del producto al pasar sobre ella:
  - Fondo degradado azul-índigo
  - Sombra elevada
  - Borde animado con ring
  - Efecto de escala sutil
  - Transiciones suaves

#### Durante la Subida:
- **Toast de "Subiendo..."** con loader animado
- Estado de carga en el modal
- Deshabilitación de botones durante el proceso

#### Al Completar:
- **Toast de éxito** con mensaje confirmativo
- **Toast de error** si algo sale mal
- Cierre automático del modal
- Actualización automática de la vista

### 5. **Sistema de Notificaciones Toast**
Notificaciones elegantes en la esquina superior derecha con:
- **4 tipos**: success, error, loading, warning
- **Auto-cierre** configurable (4 segundos por defecto)
- **Diseño moderno** con gradientes y animaciones
- **Íconos animados** según el tipo de mensaje

## 🎨 Experiencia de Usuario

### Flujo Completo:

1. **Usuario arrastra una imagen** desde su explorador de archivos
   - → Imagen se mueve con el cursor

2. **Usuario pasa sobre un producto**
   - → La fila del producto se ilumina con efecto visual azul
   - → Indicador claro de que es una zona de drop válida

3. **Usuario suelta la imagen**
   - → Se valida el archivo automáticamente
   - → Si es válido: se muestra modal de confirmación
   - → Si es inválido: toast de error con mensaje específico

4. **Usuario confirma la subida**
   - → Toast "Subiendo imagen..."
   - → Subida al servidor
   - → Actualización en Firebase
   - → Toast de éxito
   - → Vista actualizada automáticamente

## 🔧 Componentes Creados

### 1. **DragDropImageModal.jsx**
```jsx
components/productos/DragDropImageModal.jsx
```
- Modal de confirmación para drag & drop
- Preview de imagen
- Información del producto
- Estados de carga

### 2. **ToastNotification.jsx**
```jsx
components/ui/toast-notification.jsx
```
- Sistema de notificaciones toast
- 4 tipos de notificaciones
- Auto-cierre configurable
- Animaciones suaves

## 📝 Código Implementado

### Estados Añadidos:
```javascript
// Estados para Drag & Drop de imágenes
const [dragOverProductId, setDragOverProductId] = useState(null);
const [dragDropModalOpen, setDragDropModalOpen] = useState(false);
const [draggedImage, setDraggedImage] = useState(null);
const [targetProduct, setTargetProduct] = useState(null);
const [uploadingImage, setUploadingImage] = useState(false);
const [toastVisible, setToastVisible] = useState(false);
const [toastMessage, setToastMessage] = useState("");
const [toastType, setToastType] = useState("info");
```

### Funciones Principales:
- `handleDragOver()` - Detecta cuando se arrastra sobre un producto
- `handleDragLeave()` - Detecta cuando se sale del área del producto
- `handleDrop()` - Procesa la imagen cuando se suelta
- `handleConfirmImageUpload()` - Sube la imagen al servidor
- `showToast()` - Muestra notificaciones

### Eventos en las Filas:
```javascript
<tr
  onDragOver={(e) => handleDragOver(e, p.id)}
  onDragLeave={handleDragLeave}
  onDrop={(e) => handleDrop(e, p)}
  className={...} // Clases dinámicas para feedback visual
>
```

## 🚀 Cómo Usar

1. **Abre la lista de productos** en el dashboard
2. **Selecciona una imagen** de tu explorador de archivos o escritorio
3. **Arrastra la imagen** hacia la ventana del navegador
4. **Pasa sobre el producto** al que quieres subir la imagen
   - La fila se iluminará con efecto visual azul
5. **Suelta la imagen** sobre el producto
6. **Revisa la vista previa** en el modal
7. **Confirma la subida**
8. **¡Listo!** La imagen se agregará a la galería del producto

## 📌 Notas Importantes

- Las imágenes se agregan a la **galería del producto** (campo `imagenes[]`)
- La primera imagen de la galería se considera la **imagen principal**
- Puedes **reordenar las imágenes** entrando al editor del producto
- Las imágenes se suben al servidor mediante la API `/api/upload`
- El sistema actualiza automáticamente Firebase con la nueva imagen

## 🎯 Beneficios

- ✅ **Ahorro de tiempo**: No necesitas entrar al editor de cada producto
- ✅ **Flujo intuitivo**: Drag & drop familiar para usuarios
- ✅ **Feedback claro**: Sabes exactamente qué está pasando en cada momento
- ✅ **Validaciones robustas**: Previene errores antes de subir
- ✅ **Experiencia moderna**: Animaciones y transiciones profesionales
- ✅ **Sin recarga**: Todo funciona sin recargar la página

## 🔄 Integración

El sistema está completamente integrado en:
- `app/[lang]/(dashboard)/productos/page.jsx` - Página principal de productos

Y utiliza los siguientes componentes compartidos:
- `components/productos/DragDropImageModal.jsx`
- `components/ui/toast-notification.jsx`

---

**Desarrollado con ❤️ para mejorar la gestión de productos**

