"use client";
import { useState, useEffect, useCallback } from "react";
import { db } from "@/lib/firebase";
import { 
  collection, 
  getDocs, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  query, 
  orderBy,
  serverTimestamp,
  where
} from "firebase/firestore";
import { useAuth } from "@/provider/auth.provider";

/**
 * Hook personalizado para gestionar categorías de gastos
 * Maneja CRUD completo de categorías con cache local
 */
export const useCategoriasGastos = () => {
  const { user } = useAuth();
  const [categorias, setCategorias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Cargar categorías desde Firebase
  const cargarCategorias = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Ordenar solo por 'orden' para evitar necesidad de índice compuesto
      // Luego ordenamos por nombre en memoria si es necesario
      const q = query(
        collection(db, "categoriasGastos"),
        orderBy("orden", "asc")
      );
      
      const snapshot = await getDocs(q);
      const categoriasData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      // Ordenar en memoria: primero por orden, luego por nombre
      categoriasData.sort((a, b) => {
        const ordenA = a.orden ?? 999;
        const ordenB = b.orden ?? 999;
        if (ordenA !== ordenB) {
          return ordenA - ordenB;
        }
        return (a.nombre || "").localeCompare(b.nombre || "");
      });
      
      setCategorias(categoriasData);
    } catch (err) {
      console.error("Error al cargar categorías:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Cargar al montar el componente
  useEffect(() => {
    cargarCategorias();
  }, [cargarCategorias]);

  // Crear nueva categoría
  const crearCategoria = useCallback(async (datos) => {
    try {
      setError(null);
      
      // Validar que no exista una categoría con el mismo nombre (case-insensitive)
      const nombreNormalizado = datos.nombre.trim().toLowerCase();
      const existe = categorias.some(
        cat => cat.nombre.trim().toLowerCase() === nombreNormalizado && cat.activo !== false
      );
      
      if (existe) {
        throw new Error("Ya existe una categoría con ese nombre");
      }

      // Obtener el siguiente orden
      const maxOrden = categorias.length > 0 
        ? Math.max(...categorias.map(c => c.orden || 0)) 
        : -1;

      const nuevaCategoria = {
        nombre: datos.nombre.trim(),
        color: datos.color || "bg-gray-100 text-gray-800 border-gray-200",
        activo: true,
        orden: maxOrden + 1,
        fechaCreacion: serverTimestamp(),
        fechaActualizacion: serverTimestamp(),
        creadoPor: user?.email || "Usuario no identificado"
      };

      const docRef = await addDoc(collection(db, "categoriasGastos"), nuevaCategoria);
      
      const categoriaCreada = {
        id: docRef.id,
        ...nuevaCategoria,
        fechaCreacion: new Date().toISOString(),
        fechaActualizacion: new Date().toISOString()
      };

      setCategorias(prev => [...prev, categoriaCreada].sort((a, b) => {
        if (a.orden !== b.orden) return a.orden - b.orden;
        return a.nombre.localeCompare(b.nombre);
      }));

      return categoriaCreada;
    } catch (err) {
      console.error("Error al crear categoría:", err);
      setError(err.message);
      throw err;
    }
  }, [categorias, user]);

  // Actualizar categoría
  const actualizarCategoria = useCallback(async (id, datos) => {
    try {
      setError(null);
      
      // Validar que no exista otra categoría con el mismo nombre (excluyendo la actual)
      if (datos.nombre) {
        const nombreNormalizado = datos.nombre.trim().toLowerCase();
        const existe = categorias.some(
          cat => cat.id !== id && 
                 cat.nombre.trim().toLowerCase() === nombreNormalizado && 
                 cat.activo !== false
        );
        
        if (existe) {
          throw new Error("Ya existe otra categoría con ese nombre");
        }
      }

      const datosActualizados = {
        ...datos,
        fechaActualizacion: serverTimestamp()
      };

      await updateDoc(doc(db, "categoriasGastos", id), datosActualizados);
      
      setCategorias(prev => prev.map(cat => 
        cat.id === id 
          ? { ...cat, ...datosActualizados, fechaActualizacion: new Date().toISOString() }
          : cat
      ).sort((a, b) => {
        if (a.orden !== b.orden) return a.orden - b.orden;
        return a.nombre.localeCompare(b.nombre);
      }));

      return true;
    } catch (err) {
      console.error("Error al actualizar categoría:", err);
      setError(err.message);
      throw err;
    }
  }, [categorias]);

  // Eliminar categoría (soft delete - marcar como inactiva)
  const eliminarCategoria = useCallback(async (id) => {
    try {
      setError(null);
      
      // Soft delete: marcar como inactiva
      await updateDoc(doc(db, "categoriasGastos", id), {
        activo: false,
        fechaActualizacion: serverTimestamp()
      });
      
      setCategorias(prev => prev.map(cat => 
        cat.id === id 
          ? { ...cat, activo: false, fechaActualizacion: new Date().toISOString() }
          : cat
      ));

      return true;
    } catch (err) {
      console.error("Error al desactivar categoría:", err);
      setError(err.message);
      throw err;
    }
  }, []);

  // Verificar si una categoría tiene gastos asociados
  const tieneGastosAsociados = useCallback(async (categoriaId) => {
    try {
      const categoria = categorias.find(c => c.id === categoriaId);
      if (!categoria) return false;

      // Buscar gastos que usen esta categoría por ID o por nombre
      const gastosSnapshot = await getDocs(collection(db, "gastos"));
      const gastosAsociados = gastosSnapshot.docs.filter(doc => {
        const data = doc.data();
        return data.categoria === categoriaId || 
               data.categoriaNombre === categoria.nombre ||
               data.categoria === categoria.nombre;
      });
      
      return gastosAsociados.length > 0;
    } catch (err) {
      console.error("Error al verificar gastos asociados:", err);
      return false;
    }
  }, [categorias]);

  // Obtener categoría por ID
  const obtenerCategoriaPorId = useCallback((id) => {
    return categorias.find(cat => cat.id === id);
  }, [categorias]);

  // Obtener solo categorías activas
  const categoriasActivas = categorias.filter(cat => cat.activo !== false);

  return {
    categorias,
    categoriasActivas,
    loading,
    error,
    cargarCategorias,
    crearCategoria,
    actualizarCategoria,
    eliminarCategoria,
    tieneGastosAsociados,
    obtenerCategoriaPorId
  };
};
