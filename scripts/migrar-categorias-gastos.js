/**
 * Script de migración para convertir categorías hardcodeadas a Firestore
 * Ejecutar una sola vez desde la consola del navegador o como script de Node
 * 
 * USO:
 * 1. Abrir la consola del navegador en la página de gastos
 * 2. Copiar y pegar este código
 * 3. O ejecutar: node scripts/migrar-categorias-gastos.js (si se adapta para Node)
 */

// Categorías originales hardcodeadas
const categoriasIniciales = [
  { 
    nombre: "Gastos Varios", 
    color: "bg-blue-100 text-blue-800 border-blue-200",
    icono: "heroicons:receipt",
    orden: 0
  },
  { 
    nombre: "Empleados", 
    color: "bg-green-100 text-green-800 border-green-200",
    icono: "heroicons:user-group",
    orden: 1
  },
  { 
    nombre: "Gastos Operativos", 
    color: "bg-orange-100 text-orange-800 border-orange-200",
    icono: "heroicons:cog-6-tooth",
    orden: 2
  },
  { 
    nombre: "Viáticos", 
    color: "bg-purple-100 text-purple-800 border-purple-200",
    icono: "heroicons:map-pin",
    orden: 3
  },
  { 
    nombre: "Venta y Marketing", 
    color: "bg-pink-100 text-pink-800 border-pink-200",
    icono: "heroicons:megaphone",
    orden: 4
  },
  { 
    nombre: "Gastos Generales", 
    color: "bg-gray-100 text-gray-800 border-gray-200",
    icono: "heroicons:square-3-stack-3d",
    orden: 5
  }
];

/**
 * Función para migrar categorías (ejecutar desde consola del navegador)
 * Requiere que estés autenticado y que db esté disponible
 */
async function migrarCategoriasGastos() {
  const { db } = await import('../lib/firebase.js');
  const { collection, getDocs, addDoc, serverTimestamp } = await import('firebase/firestore');
  
  try {
    // Verificar si ya existen categorías
    const snapshot = await getDocs(collection(db, "categoriasGastos"));
    
    if (!snapshot.empty) {
      console.log("⚠️ Ya existen categorías en la base de datos. No se realizará la migración.");
      console.log("Categorías existentes:", snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      return;
    }

    console.log("🚀 Iniciando migración de categorías...");
    
    // Crear cada categoría
    for (const categoria of categoriasIniciales) {
      const categoriaData = {
        ...categoria,
        activo: true,
        fechaCreacion: serverTimestamp(),
        fechaActualizacion: serverTimestamp(),
        creadoPor: "Sistema (Migración)"
      };
      
      const docRef = await addDoc(collection(db, "categoriasGastos"), categoriaData);
      console.log(`✅ Categoría creada: ${categoria.nombre} (ID: ${docRef.id})`);
    }
    
    console.log("✅ Migración completada exitosamente!");
  } catch (error) {
    console.error("❌ Error durante la migración:", error);
    throw error;
  }
}

// Exportar para uso en consola del navegador
if (typeof window !== 'undefined') {
  window.migrarCategoriasGastos = migrarCategoriasGastos;
}

// Para uso en Node.js (si se adapta)
export { migrarCategoriasGastos, categoriasIniciales };
