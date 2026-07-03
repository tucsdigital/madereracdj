# Migración de Categorías de Gastos a Base de Datos

## 📋 Resumen

Se ha implementado un sistema dinámico de categorías de gastos que permite:
- ✅ Gestionar categorías desde la interfaz (crear, editar, eliminar)
- ✅ Crear categorías rápidamente al momento de crear un gasto
- ✅ Validación de duplicados y protección contra eliminación de categorías con gastos asociados
- ✅ Compatibilidad con datos antiguos (gastos que usan nombres de categorías en lugar de IDs)

## 🚀 Pasos de Migración

### Paso 1: Ejecutar Script de Migración

Las categorías iniciales deben migrarse a Firestore. Tienes dos opciones:

#### Opción A: Desde la Consola del Navegador (Recomendado - MÁS FÁCIL)

1. Abre la aplicación en el navegador
2. Ve a la página de Gastos
3. Abre la consola del desarrollador (F12)
4. Ejecuta simplemente:

```javascript
migrarCategoriasGastos()
```

La función ya está disponible globalmente cuando estás en la página de Gastos. Verás un mensaje en la consola indicando que la función está disponible.

#### Opción B: Script Completo (Si la función global no está disponible)

Si por alguna razón la función global no está disponible, puedes usar este script completo que no requiere imports:

```javascript
// Script completo para migrar categorías (copiar y pegar todo)
(async function() {
  try {
    // Acceder a Firebase desde el contexto de la página
    // Esto requiere que Firebase ya esté inicializado en la página
    const firebase = await import('firebase/app');
    const firestore = await import('firebase/firestore');
    
    // Configuración de Firebase (debe coincidir con tu proyecto)
    const firebaseConfig = {
      apiKey: "AIzaSyDf8k_-eArQasYLAT0Yg710w223iRIdUlk",
      authDomain: "maderas-caballero.firebaseapp.com",
      projectId: "maderas-caballero",
      storageBucket: "maderas-caballero.appspot.com",
      messagingSenderId: "788421556425",
      appId: "1:788421556425:web:3ff321f1b5e1ba6f427518",
      measurementId: "G-LCK3PP7QWD"
    };
    
    // Inicializar Firebase si no está inicializado
    let app;
    if (firebase.getApps().length === 0) {
      app = firebase.initializeApp(firebaseConfig);
    } else {
      app = firebase.getApps()[0];
    }
    
    const db = firestore.getFirestore(app);
    
    // Verificar si ya existen categorías
    const snapshot = await firestore.getDocs(firestore.collection(db, "categoriasGastos"));
    
    if (!snapshot.empty) {
      console.log("⚠️ Ya existen categorías. No se realizará la migración.");
      console.log("Categorías existentes:", snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      return;
    }

    console.log("🚀 Iniciando migración...");
    
    const categoriasIniciales = [
      { nombre: "Gastos Varios", color: "bg-blue-100 text-blue-800 border-blue-200", icono: "heroicons:receipt", orden: 0 },
      { nombre: "Empleados", color: "bg-green-100 text-green-800 border-green-200", icono: "heroicons:user-group", orden: 1 },
      { nombre: "Gastos Operativos", color: "bg-orange-100 text-orange-800 border-orange-200", icono: "heroicons:cog-6-tooth", orden: 2 },
      { nombre: "Viáticos", color: "bg-purple-100 text-purple-800 border-purple-200", icono: "heroicons:map-pin", orden: 3 },
      { nombre: "Venta y Marketing", color: "bg-pink-100 text-pink-800 border-pink-200", icono: "heroicons:megaphone", orden: 4 },
      { nombre: "Gastos Generales", color: "bg-gray-100 text-gray-800 border-gray-200", icono: "heroicons:square-3-stack-3d", orden: 5 }
    ];
    
    // Crear cada categoría
    for (const categoria of categoriasIniciales) {
      const docRef = await firestore.addDoc(firestore.collection(db, "categoriasGastos"), {
        ...categoria,
        activo: true,
        fechaCreacion: firestore.serverTimestamp(),
        fechaActualizacion: firestore.serverTimestamp(),
        creadoPor: "Sistema (Migración)"
      });
      console.log(`✅ Categoría creada: ${categoria.nombre} (ID: ${docRef.id})`);
    }
    
    console.log("✅ Migración completada!");
    console.log("💡 Recarga la página para ver las nuevas categorías.");
  } catch (error) {
    console.error("❌ Error durante la migración:", error);
  }
})();
```

#### Opción B: Crear Manualmente desde la Interfaz

1. Ve a la página de Gastos
2. Haz clic en el botón "Categorías" (icono de engranaje)
3. Crea cada categoría manualmente usando el formulario

### Paso 2: Verificar Migración

1. Abre Firestore en Firebase Console
2. Verifica que existe la colección `categoriasGastos`
3. Deberías ver 6 documentos con las categorías iniciales

### Paso 3: Actualizar Gastos Existentes (Opcional)

Los gastos existentes seguirán funcionando porque el sistema es compatible con:
- Gastos que usan IDs de categorías (nuevo formato)
- Gastos que usan nombres de categorías (formato antiguo)

Si deseas migrar los gastos existentes para usar IDs:

```javascript
// Script para migrar gastos existentes (ejecutar desde consola)
const { db } = await import('/lib/firebase.js');
const { collection, getDocs, updateDoc, doc } = await import('firebase/firestore');

// Cargar categorías
const catSnapshot = await getDocs(collection(db, "categoriasGastos"));
const categorias = {};
catSnapshot.docs.forEach(d => {
  const data = d.data();
  categorias[data.nombre] = d.id;
});

// Cargar gastos
const gastosSnapshot = await getDocs(collection(db, "gastos"));
let migrados = 0;

for (const gastoDoc of gastosSnapshot.docs) {
  const data = gastoDoc.data();
  
  // Si el gasto usa nombre de categoría (formato antiguo)
  if (data.categoria && !data.categoria.includes('-') && categorias[data.categoria]) {
    const categoriaId = categorias[data.categoria];
    await updateDoc(doc(db, "gastos", gastoDoc.id), {
      categoria: categoriaId,
      categoriaNombre: data.categoria
    });
    migrados++;
    console.log(`Migrado: ${gastoDoc.id} -> ${data.categoria} -> ${categoriaId}`);
  }
}

console.log(`✅ ${migrados} gastos migrados`);
```

## 📁 Archivos Creados/Modificados

### Nuevos Archivos:
- `hooks/useCategoriasGastos.js` - Hook para gestionar categorías
- `components/gastos/GestionCategorias.jsx` - Componente de gestión de categorías
- `scripts/migrar-categorias-gastos.js` - Script de migración (referencia)

### Archivos Modificados:
- `app/[lang]/(dashboard)/gastos/page.jsx` - Actualizado para usar categorías dinámicas

## 🎯 Funcionalidades Implementadas

### 1. Gestión de Categorías
- **Panel de gestión**: Accesible desde el botón "Categorías" en la vista de gastos internos
- **Crear**: Formulario con nombre, color y icono opcional
- **Editar**: Modificar nombre, color e icono
- **Eliminar**: Con validación (no permite eliminar si hay gastos asociados)

### 2. Creación Rápida
- Al crear un gasto, si la categoría no existe, puedes crearla directamente desde el formulario
- Botón "Crear nueva categoría" en el selector de categorías

### 3. Validaciones
- ✅ No permite duplicados (nombres case-insensitive)
- ✅ No permite eliminar categorías con gastos asociados
- ✅ Validación de formularios con mensajes claros

### 4. Compatibilidad
- ✅ Funciona con gastos antiguos que usan nombres de categorías
- ✅ Funciona con gastos nuevos que usan IDs de categorías
- ✅ Dashboard y totales funcionan con ambos formatos

## 🔧 Estructura de Datos

### Colección: `categoriasGastos`

```javascript
{
  id: "auto-generado",
  nombre: "Gastos Varios",
  color: "bg-blue-100 text-blue-800 border-blue-200",
  icono: "heroicons:receipt", // opcional
  activo: true,
  orden: 0,
  fechaCreacion: Timestamp,
  fechaActualizacion: Timestamp,
  creadoPor: "user@email.com"
}
```

### Actualización en `gastos`:

Los gastos ahora guardan:
- `categoria`: ID de la categoría (nuevo formato)
- `categoriaNombre`: Nombre de la categoría (para compatibilidad y consultas rápidas)

## 🐛 Solución de Problemas

### Error: "Ya existe una categoría con ese nombre"
- Verifica que no estés creando una categoría duplicada
- Los nombres son case-insensitive

### Error: "No se puede eliminar: hay gastos asociados"
- Primero debes eliminar o cambiar la categoría de los gastos asociados
- O usar soft delete (marcar `activo: false`) en lugar de eliminar

### Las categorías no aparecen
- Verifica que la migración se haya ejecutado correctamente
- Revisa la consola del navegador por errores
- Verifica que la colección `categoriasGastos` existe en Firestore

## 📝 Notas Importantes

1. **Backward Compatibility**: El sistema es compatible con datos antiguos, pero se recomienda migrar los gastos existentes para usar IDs.

2. **Performance**: Las categorías se cargan una vez y se mantienen en cache. Si agregas categorías desde otra sesión, recarga la página.

3. **Orden**: Las categorías se ordenan por el campo `orden` y luego alfabéticamente por nombre.

4. **Colores**: Se proporcionan 10 colores predefinidos. Puedes extender esta lista en `GestionCategorias.jsx`.

## 🚀 Próximas Mejoras (Opcionales)

- [ ] Reordenamiento drag & drop de categorías
- [ ] Colores personalizables (selector de color avanzado)
- [ ] Iconos con selector visual
- [ ] Soft delete (marcar inactivas en lugar de eliminar)
- [ ] Estadísticas por categoría (gráficos)
- [ ] Exportar/importar categorías
