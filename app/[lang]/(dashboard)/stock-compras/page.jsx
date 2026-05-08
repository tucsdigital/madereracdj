"use client";
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, ArrowDown, ArrowUp, RefreshCw, Loader2, CheckCircle, AlertCircle, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { db, onAuthStateChangedFirebase } from "@/lib/firebase";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

function StockComprasPage() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState("inventario");
  const [openMov, setOpenMov] = useState(false);
  const [filtro, setFiltro] = useState("");
  const [filtroMov, setFiltroMov] = useState("");
  const [filtroMovTipo, setFiltroMovTipo] = useState("");
  const [filtroMovUsuario, setFiltroMovUsuario] = useState("");
  const [productos, setProductos] = useState([]);
  const [movimientos, setMovimientos] = useState([]);
  const [loadingProd, setLoadingProd] = useState(true);
  const [loadingMov, setLoadingMov] = useState(true);
  const [error, setError] = useState(null);
  
  // Formulario movimiento
  const [movProductoId, setMovProductoId] = useState("");
  const [movTipo, setMovTipo] = useState("entrada");
  const [movCantidad, setMovCantidad] = useState("");
  const [movObs, setMovObs] = useState("");
  const [movStatus, setMovStatus] = useState(null);
  const [movMsg, setMovMsg] = useState("");
  const [movLoading, setMovLoading] = useState(false);
  // Ajuste avanzado
  const [ajusteAbsoluto, setAjusteAbsoluto] = useState(false);
  const [stockFinal, setStockFinal] = useState("");
  const [movMotivo, setMovMotivo] = useState("");
  // Usuario autenticado
  const [usuario, setUsuario] = useState(null);

  const [selectedProductoIds, setSelectedProductoIds] = useState(() => new Set());
  const [openBulkAjuste, setOpenBulkAjuste] = useState(false);
  const [bulkTipo, setBulkTipo] = useState("ajuste");
  const [bulkCantidad, setBulkCantidad] = useState("");
  const [bulkAjusteAbsoluto, setBulkAjusteAbsoluto] = useState(false);
  const [bulkStockFinal, setBulkStockFinal] = useState("");
  const [bulkMotivo, setBulkMotivo] = useState("");
  const [bulkObs, setBulkObs] = useState("");
  const [bulkStatus, setBulkStatus] = useState(null);
  const [bulkMsg, setBulkMsg] = useState("");
  const [bulkLoading, setBulkLoading] = useState(false);

  // Estado para proveedores y buscador dinámico
  const [proveedores, setProveedores] = useState([]);
  const [buscadorMov, setBuscadorMov] = useState("");

  // Estado para modal de detalle de producto
  const [detalleProducto, setDetalleProducto] = useState(null);
  const [detalleMovimientos, setDetalleMovimientos] = useState([]);
  const [detalleOpen, setDetalleOpen] = useState(false);

  // Estados para filtros avanzados
  const [categoriaId, setCategoriaId] = useState("");
  const [filtroTipoMadera, setFiltroTipoMadera] = useState("");
  const [filtroSubCategoria, setFiltroSubCategoria] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");

  // Estados para paginación optimizada
  const [paginaActual, setPaginaActual] = useState(1);
  const [productosPorPagina, setProductosPorPagina] = useState(20);
  const [isLoadingPagination, setIsLoadingPagination] = useState(false);

  // Estados para paginación de movimientos
  const [paginaActualMov, setPaginaActualMov] = useState(1);
  const [movimientosPorPagina, setMovimientosPorPagina] = useState(15);
  const [isLoadingPaginationMov, setIsLoadingPaginationMov] = useState(false);

  // Cargar productos en tiempo real
  useEffect(() => {
    setLoadingProd(true);
    const q = query(collection(db, "productos"), orderBy("nombre"));
    const unsub = onSnapshot(q, (snap) => {
      setProductos(snap.docs.map((doc) => ({ ...(doc.data() || {}), id: doc.id })));
      setLoadingProd(false);
    }, (err) => {
      setError("Error al cargar productos: " + err.message);
      setLoadingProd(false);
    });
    return () => unsub();
  }, []);

  // Filtrar automáticamente cuando hay parámetro producto en la URL
  useEffect(() => {
    const productoId = searchParams.get("producto");
    if (productoId && productos.length > 0) {
      // Buscar el producto por ID
      const producto = productos.find(p => p.id === productoId);
      if (producto) {
        // Establecer el nombre del producto en el filtro para que se vea en el input
        const nombreProducto = producto.nombre || "";
        setFiltro(nombreProducto);
        // Cambiar a la pestaña de inventario si no está ahí
        setTab("inventario");
        // Resetear página a la primera para asegurar que el producto sea visible
        setPaginaActual(1);
        // Limpiar otros filtros que puedan interferir
        setCategoriaId("");
        setFiltroTipoMadera("");
        setFiltroSubCategoria("");
        setFiltroEstado("");
        
        // Hacer scroll al input de búsqueda después de un pequeño delay para que se renderice
        setTimeout(() => {
          const inputElement = document.querySelector('input[placeholder="Buscar producto..."]');
          if (inputElement) {
            inputElement.focus();
            inputElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 150);
      }
    } else if (!productoId && filtro) {
      // Si se elimina el parámetro producto de la URL, limpiar el filtro solo si fue establecido automáticamente
      // Esto evita limpiar el filtro si el usuario está buscando manualmente
    }
  }, [searchParams, productos]);

  // Cargar movimientos en tiempo real
  useEffect(() => {
    setLoadingMov(true);
    const q = query(collection(db, "movimientos"), orderBy("fecha", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const fallbackFechaArgentina = new Date("2026-05-06T19:30:00.000Z"); // 06/05/2026 16:30 AR (UTC-3)
      setMovimientos(
        snap.docs.map((doc) => {
          const data = doc.data() || {};
          const isValidFechaValue = (v) => {
            if (!v) return false;
            if (typeof v === "string") return v.trim().length > 0;
            if (typeof v === "number") return Number.isFinite(v);
            if (v instanceof Date) return !Number.isNaN(v.getTime());
            if (typeof v?.toDate === "function") {
              const d = v.toDate();
              return d instanceof Date && !Number.isNaN(d.getTime());
            }
            return false;
          };
          const fechaFallback = isValidFechaValue(data?.fecha) ? data.fecha : fallbackFechaArgentina;
          return { id: doc.id, ...data, fecha: fechaFallback };
        })
      );
      setLoadingMov(false);
    }, (err) => {
      setError("Error al cargar movimientos: " + err.message);
      setLoadingMov(false);
    });
    return () => unsub();
  }, []);

  // Escuchar usuario autenticado
  useEffect(() => {
    const unsub = onAuthStateChangedFirebase((u) => setUsuario(u));
    return () => unsub && unsub();
  }, []);

  // Cargar proveedores
  useEffect(() => {
    const q = query(collection(db, "proveedores"));
    const unsub = onSnapshot(q, (snap) => {
      setProveedores(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => unsub();
  }, []);

  // Cantidad numérica parseada (evita que "" se convierta en 0)
  const movCantidadNum = movCantidad === "" ? NaN : Number(movCantidad);

  // Al seleccionar producto, prellenar costo
  useEffect(() => {
    const prod = productos.find(p => p.id === movProductoId);
    // setMovCosto(prod ? prod.costo : ""); // Eliminado
  }, [movProductoId, productos]);

  // Función profesional para registrar movimiento y actualizar stock
  async function registrarMovimiento({ productoId, tipo, cantidad, usuario, observaciones, modoAjuste, stockFinalDeseado, motivo }) {
    if (!usuario || typeof usuario?.getIdToken !== "function") {
      throw new Error("No hay usuario autenticado.");
    }
    const idToken = await usuario.getIdToken();
    const resp = await fetch("/api/erp/stock/movimientos", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${idToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        productoId,
        tipo,
        cantidad,
        modoAjuste,
        stockFinalDeseado,
        motivo,
        observaciones,
        referencia: "movimiento_stock_manual",
        referenciaId: "",
        origen: "ui_stock_compras",
      }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data?.ok) throw new Error(data?.error || "Error registrando movimiento");
    return true;
  }

  // Resetear página cuando cambian los filtros
  useEffect(() => {
    setPaginaActual(1);
  }, [categoriaId, filtro, filtroTipoMadera, filtroSubCategoria, filtroEstado, productosPorPagina]);

  // Función para normalizar texto (eliminar espacios y convertir a minúsculas)
  const normalizarTexto = useCallback((texto) => {
    if (!texto) return "";
    return texto.toLowerCase().replace(/\s+/g, '');
  }, []);

  // Inventario filtrado optimizado con useMemo
  const productosFiltrados = useMemo(() => {
    // Obtener productoId de la URL para filtrado directo por ID
    const productoIdFromUrl = searchParams.get("producto");
    
    return productos.filter((p) => {
      // Si hay un productoId en la URL, filtrar directamente por ID (prioridad máxima)
      // Ignorar todos los demás filtros cuando hay productoId en URL
      if (productoIdFromUrl) {
        return p.id === productoIdFromUrl;
      }
      
      // Si no hay productoId en URL, usar el filtro de búsqueda normal
      // Normalizar el término de búsqueda
      const filtroNormalizado = normalizarTexto(filtro || "");
      
      // Normalizar el nombre del producto
      const nombreNormalizado = normalizarTexto(p.nombre || "");
      
      // Normalizar el código del producto
      const codigoNormalizado = normalizarTexto(p.codigo || "");

      // Filtro por categoría
      const cumpleCategoria = categoriaId ? p.categoria === categoriaId : true;

      // Filtro por búsqueda de texto con lógica mejorada
      let cumpleFiltro = !filtro;
      
      if (filtro) {
        // Si la búsqueda termina con punto, usar búsqueda dinámica (starts with)
        if (filtroNormalizado.endsWith('.')) {
          const busquedaSinPunto = filtroNormalizado.slice(0, -1);
          cumpleFiltro = 
            nombreNormalizado.startsWith(busquedaSinPunto) ||
            codigoNormalizado.startsWith(busquedaSinPunto);
        } else {
          // Búsqueda normal: incluye el texto en cualquier parte
          cumpleFiltro = 
            nombreNormalizado.includes(filtroNormalizado) ||
            codigoNormalizado.includes(filtroNormalizado);
        }
      }

      // Filtro específico por tipo de madera
      const cumpleTipoMadera =
        categoriaId !== "Maderas" ||
        filtroTipoMadera === "" ||
        p.tipoMadera === filtroTipoMadera;

      // Filtro específico por subcategoría de ferretería
      const cumpleSubCategoria =
        categoriaId !== "Ferretería" ||
        filtroSubCategoria === "" ||
        p.subCategoria === filtroSubCategoria;

      // Filtro por estado de stock
      const cumpleEstado = !filtroEstado || (() => {
        const stock = Number(p.stock) || 0;
        const min = Number(p.min) || 0;
        
        switch (filtroEstado) {
          case "sin_stock":
            return stock === 0;
          case "bajo_stock":
            return stock > 0 && stock <= min;
          case "ok_stock":
            return stock > min;
          default:
            return true;
        }
      })();

      return cumpleCategoria && cumpleFiltro && cumpleTipoMadera && cumpleSubCategoria && cumpleEstado;
    }).sort((a, b) => {
      // Si hay un productoId en la URL, poner ese producto primero
      if (productoIdFromUrl) {
        if (a.id === productoIdFromUrl) return -1;
        if (b.id === productoIdFromUrl) return 1;
      }
      
      // Ordenar por stock: primero los que tienen stock, luego los que no
      const stockA = Number(a.stock) || 0;
      const stockB = Number(b.stock) || 0;
      
      if (stockA > 0 && stockB === 0) return -1; // a tiene stock, b no
      if (stockA === 0 && stockB > 0) return 1;  // b tiene stock, a no
      
      // Si ambos tienen stock o ambos no tienen stock, mantener orden original
      return 0;
    });
  }, [productos, categoriaId, filtro, filtroTipoMadera, filtroSubCategoria, filtroEstado, normalizarTexto, searchParams]);

  // Productos paginados optimizados
  const productosPaginados = useMemo(() => {
    const inicio = (paginaActual - 1) * productosPorPagina;
    const fin = inicio + productosPorPagina;
    return productosFiltrados.slice(inicio, fin);
  }, [productosFiltrados, paginaActual, productosPorPagina]);

  const productosById = useMemo(() => {
    const map = new Map();
    for (const p of productos) map.set(p.id, p);
    return map;
  }, [productos]);

  const selectedCount = useMemo(() => selectedProductoIds.size, [selectedProductoIds]);

  const pageIds = useMemo(() => productosPaginados.map((p) => p.id), [productosPaginados]);
  const pageSelectedCount = useMemo(() => {
    let count = 0;
    for (const id of pageIds) if (selectedProductoIds.has(id)) count += 1;
    return count;
  }, [pageIds, selectedProductoIds]);
  const pageAllSelected = pageIds.length > 0 && pageSelectedCount === pageIds.length;
  const pageSomeSelected = pageSelectedCount > 0 && pageSelectedCount < pageIds.length;

  // Cálculo de totales optimizados
  const totalProductos = productosFiltrados.length;
  const totalPaginas = Math.ceil(totalProductos / productosPorPagina);

  // Función para cambiar página con feedback visual
  const cambiarPagina = useCallback((nuevaPagina) => {
    if (nuevaPagina < 1 || nuevaPagina > totalPaginas) return;
    
    setIsLoadingPagination(true);
    setPaginaActual(nuevaPagina);
    
    // Simular un pequeño delay para mostrar el feedback visual
    setTimeout(() => {
      setIsLoadingPagination(false);
    }, 300);
  }, [totalPaginas]);

  // Movimientos con join de nombre de producto optimizados
  const movimientosFiltrados = useMemo(() => {
    return movimientos
      .map(m => ({
        ...m,
        productoNombre: productos.find(p => p.id === m.productoId)?.nombre || "(eliminado)"
      }))
      .filter(m => {
        // Normalizar el término de búsqueda
        const filtroNormalizado = normalizarTexto(filtroMov || "");
        
        // Normalizar el nombre del producto
        const nombreNormalizado = normalizarTexto(m.productoNombre || "");
        
        // Normalizar el usuario
        const usuarioNormalizado = normalizarTexto(m.usuario || "");
        const observacionesNormalizado = normalizarTexto(m.observaciones || "");
        const cumpleTexto = !filtroMov ||
               nombreNormalizado.includes(filtroNormalizado) ||
               usuarioNormalizado.includes(filtroNormalizado) ||
               observacionesNormalizado.includes(filtroNormalizado);
        const cumpleTipo = !filtroMovTipo || m.tipo === filtroMovTipo;
        const cumpleUsuario = !filtroMovUsuario || (m.usuario || "") === filtroMovUsuario;

        return cumpleTexto && cumpleTipo && cumpleUsuario;
      });
  }, [movimientos, productos, filtroMov, filtroMovTipo, filtroMovUsuario, normalizarTexto]);

  // Movimientos paginados optimizados
  const movimientosPaginados = useMemo(() => {
    const inicio = (paginaActualMov - 1) * movimientosPorPagina;
    const fin = inicio + movimientosPorPagina;
    return movimientosFiltrados.slice(inicio, fin);
  }, [movimientosFiltrados, paginaActualMov, movimientosPorPagina]);

  // Cálculo de totales de movimientos optimizados
  const totalMovimientos = movimientosFiltrados.length;
  const totalPaginasMov = Math.ceil(totalMovimientos / movimientosPorPagina);

  // Función para cambiar página de movimientos con feedback visual
  const cambiarPaginaMov = useCallback((nuevaPagina) => {
    if (nuevaPagina < 1 || nuevaPagina > totalPaginasMov) return;
    
    setIsLoadingPaginationMov(true);
    setPaginaActualMov(nuevaPagina);
    
    // Simular un pequeño delay para mostrar el feedback visual
    setTimeout(() => {
      setIsLoadingPaginationMov(false);
    }, 300);
  }, [totalPaginasMov]);

  // Resetear página de movimientos cuando cambia el filtro
  useEffect(() => {
    setPaginaActualMov(1);
  }, [filtroMov, filtroMovTipo, filtroMovUsuario, movimientosPorPagina]);

  const usuariosMovUnicos = useMemo(() => {
    return [...new Set(movimientos.map((m) => m.usuario).filter(Boolean))].sort();
  }, [movimientos]);

  // Obtener categorías únicas
  const categoriasUnicas = useMemo(() => {
    return [...new Set(productos.map(p => p.categoria))].sort();
  }, [productos]);

  // Obtener tipos de madera únicos
  const tiposMaderaUnicos = useMemo(() => {
    if (!productos.length || categoriaId !== "Maderas") return [];
    const tipos = new Set();
    productos.forEach(p => {
      if (p.categoria === "Maderas" && p.tipoMadera) {
        tipos.add(p.tipoMadera);
      }
    });
    return Array.from(tipos).sort();
  }, [productos, categoriaId]);

  // Obtener subcategorías de ferretería únicas
  const subCategoriasFerreteria = useMemo(() => {
    if (!productos.length || categoriaId !== "Ferretería") return [];
    const subcats = new Set();
    productos.forEach(p => {
      if (p.categoria === "Ferretería" && p.subCategoria) {
        subcats.add(p.subCategoria);
      }
    });
    return Array.from(subcats).sort();
  }, [productos, categoriaId]);

  // Filtrar productos en buscador dinámico
  const productosMovFiltrados = productos.filter(p => {
    // Normalizar el término de búsqueda
    const buscadorNormalizado = normalizarTexto(buscadorMov || "");
    
    // Normalizar el nombre del producto
    const nombreNormalizado = normalizarTexto(p.nombre || "");
    
    // Normalizar el ID del producto
    const idNormalizado = normalizarTexto(p.id || "");

    return nombreNormalizado.includes(buscadorNormalizado) ||
           idNormalizado.includes(buscadorNormalizado);
  });

  // Handlers para formularios
  const handleMovGuardar = async () => {
    setMovStatus(null); 
    setMovMsg("");
    
    // Validaciones inteligentes
    if (!movProductoId) {
      setMovStatus("error"); 
      setMovMsg("Debe seleccionar un producto."); 
      return;
    }
    
    const qty = movCantidad === "" ? NaN : Number(movCantidad);
    if (movTipo !== "ajuste" && !(qty > 0)) {
      setMovStatus("error"); 
      setMovMsg("La cantidad debe ser mayor a 0."); 
      return;
    }

    // Validación especial para salidas
    if (movTipo === "salida") {
      const producto = productos.find(p => p.id === movProductoId);
      if (producto && Number(producto.stock) < Number(qty || 0)) {
        setMovStatus("error"); 
        setMovMsg(`Stock insuficiente. Stock actual: ${producto.stock}, intenta vender: ${movCantidad}`);
        return;
      }
    }

    // Validación para ajustes
    if (movTipo === "ajuste") {
      const producto = productos.find(p => p.id === movProductoId);
      if (!ajusteAbsoluto) {
        const nuevoStock = calcularStockResultante(Number(producto.stock) || 0, movTipo, Number(qty || 0));
        if (nuevoStock < 0) {
          setMovStatus("error"); 
          setMovMsg(`Ajuste inválido. El stock no puede ser negativo. Stock actual: ${producto.stock}`);
          return;
        }
      } else {
        const finalNum = stockFinal === "" ? NaN : Number(stockFinal);
        if (Number.isNaN(finalNum) || finalNum < 0) {
          setMovStatus("error");
          setMovMsg("Stock final inválido para ajuste absoluto.");
          return;
        }
      }
    }

    // Motivo obligatorio en ajuste
    if (movTipo === "ajuste" && !movMotivo) {
      setMovStatus("error");
      setMovMsg("Seleccione un motivo para el ajuste.");
      return;
    }

    setMovLoading(true);
    try {
      // Registrar movimiento y stock
      await registrarMovimiento({
        productoId: movProductoId,
        tipo: movTipo,
        cantidad: Number(movCantidad || 0),
        usuario: usuario,
        observaciones: movObs || `Movimiento ${movTipo} registrado manualmente`,
        modoAjuste: movTipo === "ajuste" ? (ajusteAbsoluto ? "absoluto" : "delta") : undefined,
        stockFinalDeseado: movTipo === "ajuste" && ajusteAbsoluto ? Number(stockFinal || 0) : undefined,
        motivo: movMotivo,
      });
      
      setMovStatus("success"); 
      setMovMsg(`Movimiento de ${movTipo} registrado exitosamente. Stock actualizado.`);
      
      setTimeout(() => { 
        setOpenMov(false); 
        setMovProductoId(""); 
        setMovTipo("entrada"); 
        setMovCantidad(""); 
        setMovObs(""); 
        setAjusteAbsoluto(false);
        setStockFinal("");
        setMovMotivo("");
        setMovStatus(null); 
        setMovLoading(false); 
      }, 1500);
    } catch (e) {
      setMovStatus("error"); 
      setMovMsg("Error: " + e.message); 
      setMovLoading(false);
    }
  };

  // Función para calcular stock resultante
  const calcularStockResultante = (stockActual, tipo, cantidad) => {
    if (tipo === "entrada") {
      return stockActual + cantidad;
    } else if (tipo === "salida") {
      return stockActual - cantidad;
    } else if (tipo === "ajuste") {
      return stockActual + cantidad; // cantidad puede ser positiva o negativa
    }
    return stockActual;
  };

  // Función para prellenar datos inteligentemente
  const handleSeleccionarProducto = (productoId) => {
    setMovProductoId(productoId);
    const producto = productos.find(p => p.id === productoId);
    
    // Prellenar observaciones según el tipo de producto
    if (producto) {
      let observacionSugerida = "";
      if (producto.stock === 0) {
        observacionSugerida = "Reposición de stock agotado";
      } else if (producto.stock <= (producto.min || 0)) {
        observacionSugerida = "Reposición de stock bajo";
      } else {
        observacionSugerida = "Movimiento de stock";
      }
      setMovObs(observacionSugerida);
    }
  };

  // Acción para ver detalle de producto
  const handleVerDetalleProducto = (producto) => {
    setDetalleProducto(producto);
    const movs = movimientos.filter(m => m.productoId === producto.id);
    setDetalleMovimientos(movs);
    setDetalleOpen(true);
  };

  const setProductoSelected = useCallback((productoId, checked) => {
    setSelectedProductoIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(productoId);
      else next.delete(productoId);
      return next;
    });
  }, []);

  const setPageSelected = useCallback((checked) => {
    setSelectedProductoIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        for (const id of pageIds) next.add(id);
      } else {
        for (const id of pageIds) next.delete(id);
      }
      return next;
    });
  }, [pageIds]);

  const selectAllFiltrados = useCallback(() => {
    setSelectedProductoIds(new Set(productosFiltrados.map((p) => p.id)));
  }, [productosFiltrados]);

  const clearSelection = useCallback(() => {
    setSelectedProductoIds(new Set());
  }, []);

  const handleBulkGuardar = async () => {
    setBulkStatus(null);
    setBulkMsg("");

    if (selectedCount === 0) {
      setBulkStatus("error");
      setBulkMsg("No hay productos seleccionados.");
      return;
    }

    if (!usuario || typeof usuario?.getIdToken !== "function") {
      setBulkStatus("error");
      setBulkMsg("No hay sesión válida. Cerrá sesión y volvé a ingresar.");
      return;
    }

    const qty = bulkCantidad === "" ? NaN : Number(bulkCantidad);
    if (bulkTipo !== "ajuste" && !(qty > 0)) {
      setBulkStatus("error");
      setBulkMsg("La cantidad debe ser mayor a 0.");
      return;
    }

    if (bulkTipo === "ajuste") {
      if (!bulkAjusteAbsoluto) {
        if (Number.isNaN(qty)) {
          setBulkStatus("error");
          setBulkMsg("La cantidad del ajuste es inválida.");
          return;
        }
        const ids = Array.from(selectedProductoIds);
        for (const id of ids) {
          const prod = productosById.get(id);
          const stockAct = Number(prod?.stock) || 0;
          const nuevoStock = calcularStockResultante(stockAct, "ajuste", Number(qty || 0));
          if (nuevoStock < 0) {
            setBulkStatus("error");
            setBulkMsg(`Ajuste inválido: el stock no puede quedar negativo (${prod?.nombre || id}).`);
            return;
          }
        }
      } else {
        const finalNum = bulkStockFinal === "" ? NaN : Number(bulkStockFinal);
        if (Number.isNaN(finalNum) || finalNum < 0) {
          setBulkStatus("error");
          setBulkMsg("Stock final inválido para ajuste absoluto.");
          return;
        }
      }
      if (!bulkMotivo) {
        setBulkStatus("error");
        setBulkMsg("Seleccione un motivo para el ajuste.");
        return;
      }
    }

    setBulkLoading(true);
    const ids = Array.from(selectedProductoIds);
    const failures = [];

    try {
      for (const id of ids) {
        try {
          await registrarMovimiento({
            productoId: id,
            tipo: bulkTipo,
            cantidad: bulkTipo === "ajuste" && bulkAjusteAbsoluto ? 0 : Number(bulkCantidad || 0),
            usuario,
            observaciones:
              bulkObs ||
              `Ajuste masivo (${bulkTipo}) · ${ids.length} producto(s)`,
            modoAjuste:
              bulkTipo === "ajuste"
                ? bulkAjusteAbsoluto
                  ? "absoluto"
                  : "delta"
                : undefined,
            stockFinalDeseado:
              bulkTipo === "ajuste" && bulkAjusteAbsoluto
                ? Number(bulkStockFinal || 0)
                : undefined,
            motivo: bulkTipo === "ajuste" ? bulkMotivo : "",
          });
        } catch (e) {
          failures.push({ id, error: e?.message || String(e) });
        }
      }

      if (failures.length > 0) {
        const firstNames = failures
          .slice(0, 3)
          .map((f) => productosById.get(f.id)?.nombre || f.id)
          .join(", ");
        const firstError = failures[0]?.error ? ` (${failures[0].error})` : "";
        setBulkStatus("error");
        setBulkMsg(
          `Se aplicó en ${ids.length - failures.length}/${ids.length}. Errores: ${firstNames}${failures.length > 3 ? "..." : ""}${firstError}`
        );
        setBulkLoading(false);
        return;
      }

      setBulkStatus("success");
      setBulkMsg(`Ajuste masivo aplicado en ${ids.length} producto(s).`);
      setTimeout(() => {
        setOpenBulkAjuste(false);
        clearSelection();
        setBulkTipo("ajuste");
        setBulkCantidad("");
        setBulkAjusteAbsoluto(false);
        setBulkStockFinal("");
        setBulkMotivo("");
        setBulkObs("");
        setBulkStatus(null);
        setBulkMsg("");
        setBulkLoading(false);
      }, 1200);
    } catch (e) {
      setBulkStatus("error");
      setBulkMsg("Error: " + (e?.message || String(e)));
      setBulkLoading(false);
    }
  };

  const formatFechaHora = useCallback((valor) => {
    if (!valor) return "-";
    if (typeof valor === "string") {
      const s = valor.trim();
      const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (m) {
        const y = Number(m[1]);
        const mo = Number(m[2]);
        const d = Number(m[3]);
        const fechaLocal = new Date(y, mo - 1, d, 12, 0, 0);
        if (Number.isNaN(fechaLocal.getTime())) return "-";
        return new Intl.DateTimeFormat("es-AR", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          timeZone: "America/Argentina/Buenos_Aires",
        }).format(fechaLocal);
      }
    }
    const fecha = typeof valor?.toDate === "function" ? valor.toDate() : valor instanceof Date ? valor : new Date(valor);
    if (Number.isNaN(fecha.getTime())) return "-";
    return new Intl.DateTimeFormat("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "America/Argentina/Buenos_Aires",
    }).format(fecha);
  }, []);

  const formatUsuario = useCallback((usuario) => {
    const value = String(usuario || "").trim().toLowerCase();
    if (!value) return "-";
    if (value === "luisdamian@maderascaballero.com") return "luis";
    if (value === "ivan@maderascaballero.com") return "ivan";
    if (value === "brian@maderascaballero.com") return "coco";
    return usuario;
  }, []);

  return (
    <TooltipProvider>
      <div className="py-8 px-2 max-w-8xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Stock y Compras</h1>
          <p className="text-lg text-muted-foreground">Controla el inventario, repón productos y gestiona los movimientos de stock de tu maderera.</p>
        </div>
        <Tabs value={tab} onValueChange={setTab} className="mb-6">
          <TabsList className="mb-4">
            <TabsTrigger value="inventario">Inventario</TabsTrigger>
            <TabsTrigger value="movimientos">Movimientos</TabsTrigger>
          </TabsList>
          <TabsContent value="inventario">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-4">
                <CardTitle>Inventario</CardTitle>
                <div className="flex gap-2 items-center">
                  <Input placeholder="Buscar producto..." value={filtro} onChange={e => setFiltro(e.target.value)} className="w-48" />
                  <select
                    value={productosPorPagina}
                    onChange={(e) => setProductosPorPagina(Number(e.target.value))}
                    className="h-9 px-2 border border-border/60 rounded-md bg-background text-foreground text-sm"
                  >
                    <option value={10}>10 / pág.</option>
                    <option value={20}>20 / pág.</option>
                    <option value={50}>50 / pág.</option>
                    <option value={100}>100 / pág.</option>
                  </select>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setFiltro("");
                      setCategoriaId("");
                      setFiltroTipoMadera("");
                      setFiltroSubCategoria("");
                      setFiltroEstado("");
                      setPaginaActual(1);
                    }}
                  >
                    Limpiar filtros
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {/* Filtros avanzados */}
                <div className="mb-6 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* Filtro por categoría */}
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1">
                        Categoría
                      </label>
                      <select
                        value={categoriaId}
                        onChange={(e) => setCategoriaId(e.target.value)}
                        className="w-full px-3 py-2 border border-border/60 rounded-md shadow-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="">Todas las categorías</option>
                        {categoriasUnicas.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Filtro por tipo de madera */}
                    {categoriaId === "Maderas" && tiposMaderaUnicos.length > 0 && (
                      <div>
                        <label className="block text-sm font-medium text-foreground mb-1">
                          Tipo de Madera
                        </label>
                        <select
                          value={filtroTipoMadera}
                          onChange={(e) => setFiltroTipoMadera(e.target.value)}
                          className="w-full px-3 py-2 border border-border/60 rounded-md shadow-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                          <option value="">Todos los tipos</option>
                          {tiposMaderaUnicos.map((tipo) => (
                            <option key={tipo} value={tipo}>
                              {tipo}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Filtro por subcategoría de ferretería */}
                    {categoriaId === "Ferretería" && subCategoriasFerreteria.length > 0 && (
                      <div>
                        <label className="block text-sm font-medium text-foreground mb-1">
                          Subcategoría
                        </label>
                        <select
                          value={filtroSubCategoria}
                          onChange={(e) => setFiltroSubCategoria(e.target.value)}
                          className="w-full px-3 py-2 border border-border/60 rounded-md shadow-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                          <option value="">Todas las subcategorías</option>
                          {subCategoriasFerreteria.map((subCat) => (
                            <option key={subCat} value={subCat}>
                              {subCat}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Filtro por estado de stock */}
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-1">
                        Estado de Stock
                      </label>
                      <select
                        value={filtroEstado}
                        onChange={(e) => setFiltroEstado(e.target.value)}
                        className="w-full px-3 py-2 border border-border/60 rounded-md shadow-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="">Todos los estados</option>
                        <option value="sin_stock">Sin stock</option>
                        <option value="bajo_stock">Bajo stock</option>
                        <option value="ok_stock">Stock OK</option>
                      </select>
                    </div>
                  </div>

                  {/* Información de resultados */}
                  <div className="flex justify-between items-center text-sm text-muted-foreground">
                    <span>
                      Mostrando {totalProductos === 0 ? 0 : (paginaActual - 1) * productosPorPagina + 1}-{Math.min(paginaActual * productosPorPagina, totalProductos)} de {totalProductos} productos
                    </span>
                    <span>
                      Página {totalPaginas === 0 ? 1 : paginaActual} de {Math.max(totalPaginas, 1)}
                    </span>
                  </div>
                                </div>
              </CardContent>
              <CardContent className="overflow-x-auto">
                {loadingProd ? (
                  <div className="flex justify-center items-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
                ) : error ? (
                  <div className="text-red-700 dark:text-red-300 py-4 text-center">{error}</div>
                ) : (
                  <>
                    {selectedCount > 0 && (
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-blue-200 bg-blue-50/60 px-3 py-2">
                        <div className="text-sm font-semibold text-blue-900">
                          Seleccionados: {selectedCount}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {selectedCount < totalProductos && (
                            <Button size="sm" variant="outline" onClick={selectAllFiltrados}>
                              Seleccionar todos ({totalProductos})
                            </Button>
                          )}
                          <Button size="sm" variant="default" onClick={() => setOpenBulkAjuste(true)}>
                            Ajustar stock
                          </Button>
                          <Button size="sm" variant="outline" onClick={clearSelection}>
                            Limpiar selección
                          </Button>
                        </div>
                      </div>
                    )}

                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10">
                            <div className="flex items-center justify-center">
                              <Checkbox
                                checked={pageAllSelected ? true : pageSomeSelected ? "indeterminate" : false}
                                onCheckedChange={(v) => setPageSelected(Boolean(v))}
                                aria-label="Seleccionar todos en la página"
                              />
                            </div>
                          </TableHead>
                          <TableHead>Producto</TableHead>
                          <TableHead>Categoría</TableHead>
                          <TableHead>Stock</TableHead>
                          <TableHead>Unidad</TableHead>
                          <TableHead>Estado</TableHead>
                          <TableHead>Acciones</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {productosPaginados.map((p) => {
                          const isSelected = selectedProductoIds.has(p.id);
                          const isLow = Number(p.stock) <= (Number(p.min) || 0);
                          return (
                            <TableRow
                              key={p.id}
                              className={
                                isSelected
                                  ? "bg-blue-500/5 ring-1 ring-blue-200/70"
                                  : isLow
                                  ? "bg-amber-500/10"
                                  : ""
                              }
                            >
                              <TableCell className="w-10">
                                <div className="flex items-center justify-center">
                                  <Checkbox
                                    checked={isSelected}
                                    onCheckedChange={(v) => setProductoSelected(p.id, Boolean(v))}
                                    aria-label={`Seleccionar ${p.nombre}`}
                                  />
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold">{p.nombre}</span>
                                  {p.stock === 0 && (
                                    <span className="bg-red-500/15 text-red-800 dark:text-red-200 border border-red-500/20 px-2 py-0.5 rounded text-xs">
                                      Sin stock
                                    </span>
                                  )}
                                  {p.stock > 0 && p.stock <= (p.min || 0) && (
                                    <span className="bg-amber-500/10 text-amber-800 dark:text-amber-200 border border-amber-500/20 px-2 py-0.5 rounded text-xs">
                                      Bajo
                                    </span>
                                  )}
                                  {p.stock > (p.min || 0) && (
                                    <span className="bg-emerald-500/10 text-emerald-800 dark:text-emerald-200 border border-emerald-500/20 px-2 py-0.5 rounded text-xs">
                                      OK
                                    </span>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>{p.categoria}</TableCell>
                              <TableCell>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="cursor-help">{p.stock}</span>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    Última actualización:{" "}
                                    {p.fechaActualizacion?.toDate
                                      ? p.fechaActualizacion.toDate().toLocaleString()
                                      : "-"}
                                  </TooltipContent>
                                </Tooltip>
                              </TableCell>
                              <TableCell>
                                {p.unidadMedida ||
                                  p.unidadVenta ||
                                  p.unidadVentaHerraje ||
                                  p.unidadVentaQuimico ||
                                  p.unidadVentaHerramienta}
                              </TableCell>
                              <TableCell>
                                {p.stock === 0 ? (
                                  <span className="text-red-700 dark:text-red-300 font-semibold">Sin stock</span>
                                ) : p.stock <= (p.min || 0) ? (
                                  <span className="text-amber-700 dark:text-amber-300 font-semibold">Bajo</span>
                                ) : (
                                  <span className="text-emerald-700 dark:text-emerald-300 font-semibold">OK</span>
                                )}
                              </TableCell>
                              <TableCell>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    setOpenMov(true);
                                    handleSeleccionarProducto(p.id);
                                  }}
                                >
                                  <RefreshCw className="w-4 h-4 mr-1" />
                                  Movimientos
                                </Button>
                                <Button size="sm" variant="soft" onClick={() => handleVerDetalleProducto(p)}>
                                  <Plus className="w-4 h-4 mr-1" />
                                  Ver detalle
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </>
                )}
                {!loadingProd && !error && totalPaginas > 1 && (
                  <div className="flex items-center justify-between mt-4 border-t pt-4">
                    <div className="text-sm text-muted-foreground">
                      Página {paginaActual} de {totalPaginas}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="outline" onClick={() => cambiarPagina(1)} disabled={paginaActual === 1 || isLoadingPagination}>
                        <ChevronsLeft className="w-4 h-4" />
                      </Button>
                      <Button size="icon" variant="outline" onClick={() => cambiarPagina(paginaActual - 1)} disabled={paginaActual === 1 || isLoadingPagination}>
                        <ChevronLeft className="w-4 h-4" />
                      </Button>
                      <Button size="icon" variant="outline" onClick={() => cambiarPagina(paginaActual + 1)} disabled={paginaActual === totalPaginas || isLoadingPagination}>
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                      <Button size="icon" variant="outline" onClick={() => cambiarPagina(totalPaginas)} disabled={paginaActual === totalPaginas || isLoadingPagination}>
                        <ChevronsRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="movimientos">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-4">
                <CardTitle>Movimientos de Stock</CardTitle>
                <div className="flex gap-2 items-center flex-wrap justify-end">
                  <Input placeholder="Buscar producto o usuario..." value={filtroMov} onChange={e => setFiltroMov(e.target.value)} className="w-56" />
                  <select
                    value={filtroMovTipo}
                    onChange={(e) => setFiltroMovTipo(e.target.value)}
                    className="h-9 px-2 border border-border/60 rounded-md bg-background text-foreground text-sm"
                  >
                    <option value="">Todos los tipos</option>
                    <option value="entrada">Entradas</option>
                    <option value="salida">Salidas</option>
                    <option value="ajuste">Ajustes</option>
                  </select>
                  <select
                    value={filtroMovUsuario}
                    onChange={(e) => setFiltroMovUsuario(e.target.value)}
                    className="h-9 px-2 border border-border/60 rounded-md bg-background text-foreground text-sm"
                  >
                    <option value="">Todos los usuarios</option>
                    {usuariosMovUnicos.map((usuarioMov) => (
                      <option key={usuarioMov} value={usuarioMov}>{usuarioMov}</option>
                    ))}
                  </select>
                  <select
                    value={movimientosPorPagina}
                    onChange={(e) => setMovimientosPorPagina(Number(e.target.value))}
                    className="h-9 px-2 border border-border/60 rounded-md bg-background text-foreground text-sm"
                  >
                    <option value={15}>15 / pág.</option>
                    <option value={30}>30 / pág.</option>
                    <option value={50}>50 / pág.</option>
                  </select>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setFiltroMov("");
                      setFiltroMovTipo("");
                      setFiltroMovUsuario("");
                      setPaginaActualMov(1);
                    }}
                  >
                    Limpiar filtros
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {loadingMov ? (
                  <div className="flex justify-center items-center py-8"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
                ) : error ? (
                  <div className="text-red-700 dark:text-red-300 py-4 text-center">{error}</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Producto</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Stock antes</TableHead>
                        <TableHead>Cantidad</TableHead>
                        <TableHead>Stock después</TableHead>
                        <TableHead>Usuario</TableHead>
                        <TableHead>Observaciones</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {movimientosPaginados.map(m => (
                        <TableRow key={m.id}>
                          <TableCell>{formatFechaHora(m.fecha)}</TableCell>
                          <TableCell>{m.productoNombre}</TableCell>
                          <TableCell>
                            {m.tipo === "entrada" && <span className="text-emerald-700 dark:text-emerald-300 font-semibold flex items-center"><ArrowDown className="w-4 h-4 mr-1" />Entrada</span>}
                            {m.tipo === "salida" && <span className="text-red-700 dark:text-red-300 font-semibold flex items-center"><ArrowUp className="w-4 h-4 mr-1" />Salida</span>}
                            {m.tipo === "ajuste" && <span className="text-blue-700 dark:text-blue-300 font-semibold flex items-center"><RefreshCw className="w-4 h-4 mr-1" />Ajuste</span>}
                          </TableCell>
                          <TableCell>{Number.isFinite(Number(m.stockAntes)) ? Number(m.stockAntes) : "-"}</TableCell>
                          <TableCell>
                            {Number.isFinite(Number(m.stockDelta)) ? (
                              <span className={Number(m.stockDelta) < 0 ? "text-red-700 dark:text-red-300 font-semibold" : Number(m.stockDelta) > 0 ? "text-emerald-700 dark:text-emerald-300 font-semibold" : ""}>
                                {Number(m.stockDelta) > 0 ? `+${Number(m.stockDelta)}` : Number(m.stockDelta)}
                              </span>
                            ) : (
                              "-"
                            )}
                          </TableCell>
                          <TableCell>{Number.isFinite(Number(m.stockDespues)) ? Number(m.stockDespues) : "-"}</TableCell>
                          <TableCell>{m.usuario}</TableCell>
                          <TableCell>{m.observaciones}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
                {!loadingMov && !error && (
                  <div className="flex items-center justify-between mt-4 border-t pt-4">
                    <div className="text-sm text-muted-foreground">
                      Mostrando {totalMovimientos === 0 ? 0 : (paginaActualMov - 1) * movimientosPorPagina + 1}-{Math.min(paginaActualMov * movimientosPorPagina, totalMovimientos)} de {totalMovimientos} movimientos
                    </div>
                    {totalPaginasMov > 1 && (
                      <div className="flex items-center gap-1">
                        <Button size="icon" variant="outline" onClick={() => cambiarPaginaMov(1)} disabled={paginaActualMov === 1 || isLoadingPaginationMov}>
                          <ChevronsLeft className="w-4 h-4" />
                        </Button>
                        <Button size="icon" variant="outline" onClick={() => cambiarPaginaMov(paginaActualMov - 1)} disabled={paginaActualMov === 1 || isLoadingPaginationMov}>
                          <ChevronLeft className="w-4 h-4" />
                        </Button>
                        <Button size="icon" variant="outline" onClick={() => cambiarPaginaMov(paginaActualMov + 1)} disabled={paginaActualMov === totalPaginasMov || isLoadingPaginationMov}>
                          <ChevronRight className="w-4 h-4" />
                        </Button>
                        <Button size="icon" variant="outline" onClick={() => cambiarPaginaMov(totalPaginasMov)} disabled={paginaActualMov === totalPaginasMov || isLoadingPaginationMov}>
                          <ChevronsRight className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
        {/* Modal de Ajuste Masivo */}
        <Dialog open={openBulkAjuste} onOpenChange={setOpenBulkAjuste}>
          <DialogContent className="w-[95vw] max-w-[560px] border border-border/60 bg-card">
            <DialogHeader>
              <DialogTitle>Ajuste masivo de stock</DialogTitle>
              <DialogDescription>
                Aplica un movimiento a los productos seleccionados (se registra un movimiento por producto).
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-4 py-2">
              {bulkStatus && (
                <div
                  className={`mb-2 p-3 rounded-lg flex items-center gap-2 text-sm border ${
                    bulkStatus === "success"
                      ? "bg-emerald-500/10 text-emerald-800 dark:text-emerald-200 border-emerald-500/20"
                      : "bg-red-500/15 text-red-800 dark:text-red-200 border-red-500/20"
                  }`}
                >
                  {bulkStatus === "success" ? (
                    <CheckCircle className="w-4 h-4" />
                  ) : (
                    <AlertCircle className="w-4 h-4" />
                  )}
                  {bulkMsg}
                </div>
              )}

              <div className="bg-blue-500/10 p-4 rounded-lg border border-blue-500/20">
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-blue-900">Seleccionados</div>
                  <div className="text-sm font-bold text-blue-900">{selectedCount}</div>
                </div>
              </div>

              <div>
                <label className="font-semibold text-sm mb-2 block">Tipo de movimiento</label>
                <select
                  className="border border-border/60 rounded-lg px-3 py-2 w-full bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
                  value={bulkTipo}
                  onChange={(e) => {
                    setBulkTipo(e.target.value);
                    setBulkStatus(null);
                    setBulkMsg("");
                  }}
                >
                  <option value="entrada">📥 Entrada (Aumentar stock)</option>
                  <option value="salida">📤 Salida (Disminuir stock)</option>
                  <option value="ajuste">⚖️ Ajuste (Corregir stock)</option>
                </select>
              </div>

              <div>
                <label className="font-semibold text-sm mb-2 block">Cantidad</label>
                <Input
                  type="text"
                  inputMode="numeric"
                  className="w-full"
                  value={bulkCantidad}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const esAjusteDelta = bulkTipo === "ajuste" && !bulkAjusteAbsoluto;
                    const valid = raw === "" || (esAjusteDelta ? /^-?\d*$/.test(raw) : /^\d*$/.test(raw));
                    if (valid) setBulkCantidad(raw);
                  }}
                  disabled={bulkTipo === "ajuste" && bulkAjusteAbsoluto}
                  placeholder={bulkTipo === "ajuste" ? "0" : "1"}
                />
              </div>

              {bulkTipo === "ajuste" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="flex items-center gap-2">
                    <input
                      id="bulkAjusteAbs"
                      type="checkbox"
                      checked={bulkAjusteAbsoluto}
                      onChange={(e) => {
                        setBulkAjusteAbsoluto(e.target.checked);
                        setBulkStatus(null);
                        setBulkMsg("");
                      }}
                    />
                    <label htmlFor="bulkAjusteAbs" className="text-sm">
                      Ajustar a stock final
                    </label>
                  </div>
                  <div>
                    <label className="font-semibold text-sm mb-2 block">Stock final (mismo para todos)</label>
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={bulkStockFinal}
                      onChange={(e) => {
                        const r = e.target.value;
                        if (r === "" || /^\d*$/.test(r)) setBulkStockFinal(r);
                      }}
                      disabled={!bulkAjusteAbsoluto}
                      placeholder="Ej: 120"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="font-semibold text-sm mb-2 block">Motivo</label>
                    <select
                      className="border border-border/60 bg-background text-foreground rounded-lg px-3 py-2 w-full focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      value={bulkMotivo}
                      onChange={(e) => setBulkMotivo(e.target.value)}
                    >
                      <option value="">Seleccionar motivo</option>
                      <option value="conteo">Conteo físico</option>
                      <option value="rotura">Rotura</option>
                      <option value="merma">Merma</option>
                      <option value="carga_inicial">Carga inicial</option>
                      <option value="otros">Otros</option>
                    </select>
                  </div>
                </div>
              )}

              <div>
                <label className="font-semibold text-sm mb-2 block">Observaciones</label>
                <Input
                  type="text"
                  className="w-full"
                  value={bulkObs}
                  onChange={(e) => setBulkObs(e.target.value)}
                  placeholder="Opcional..."
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpenBulkAjuste(false)} disabled={bulkLoading}>
                Cancelar
              </Button>
              <Button
                variant="default"
                onClick={handleBulkGuardar}
                disabled={(() => {
                  if (bulkLoading || loadingProd || selectedCount === 0) return true;
                  const qty = bulkCantidad === "" ? NaN : Number(bulkCantidad);
                  if (bulkTipo !== "ajuste" && !(qty > 0)) return true;
                  if (bulkTipo === "ajuste") {
                    if (!bulkMotivo) return true;
                    if (bulkAjusteAbsoluto) {
                      const finalNum = bulkStockFinal === "" ? NaN : Number(bulkStockFinal);
                      if (Number.isNaN(finalNum) || finalNum < 0) return true;
                    } else {
                      if (Number.isNaN(qty)) return true;
                    }
                  }
                  return false;
                })()}
              >
                {bulkLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Aplicar ajuste
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {/* Modal de Movimiento */}
        <Dialog open={openMov} onOpenChange={setOpenMov}>
          <DialogContent className="w-[95vw] max-w-[500px] border border-border/60 bg-card">
            <DialogHeader>
              <DialogTitle>Registrar Movimiento de Stock</DialogTitle>
              <DialogDescription>Gestiona el inventario del producto seleccionado.</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-4 py-2">
              {movStatus && (
                <div className={`mb-2 p-3 rounded-lg flex items-center gap-2 text-sm border ${movStatus === 'success' ? 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-200 border-emerald-500/20' : 'bg-red-500/15 text-red-800 dark:text-red-200 border-red-500/20'}`}>
                  {movStatus === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                  {movMsg}
                </div>
              )}
              
              {/* Información del producto seleccionado */}
              {movProductoId && (
                <div className="bg-blue-500/10 p-4 rounded-lg border border-blue-500/20">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-semibold text-blue-800 dark:text-blue-200">Producto Seleccionado</h4>
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      productos.find(p => p.id === movProductoId)?.stock === 0 
                        ? 'bg-red-500/15 text-red-800 dark:text-red-200' 
                        : productos.find(p => p.id === movProductoId)?.stock <= (productos.find(p => p.id === movProductoId)?.min || 0)
                        ? 'bg-amber-500/10 text-amber-800 dark:text-amber-200'
                        : 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
                    }`}>
                      {productos.find(p => p.id === movProductoId)?.stock === 0 
                        ? 'Sin stock' 
                        : productos.find(p => p.id === movProductoId)?.stock <= (productos.find(p => p.id === movProductoId)?.min || 0)
                        ? 'Stock bajo'
                        : 'Stock OK'
                      }
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div><span className="font-medium">Nombre:</span> {productos.find(p => p.id === movProductoId)?.nombre}</div>
                    <div><span className="font-medium">Categoría:</span> {productos.find(p => p.id === movProductoId)?.categoria}</div>
                    <div><span className="font-medium">Stock actual:</span> <span className="font-bold">{productos.find(p => p.id === movProductoId)?.stock || 0}</span></div>
                    <div><span className="font-medium">Stock mínimo:</span> {productos.find(p => p.id === movProductoId)?.min || 0}</div>
                  </div>
                </div>
              )}

              {/* Tipo de movimiento */}
              <div>
                <label className="font-semibold text-sm mb-2 block">Tipo de movimiento</label>
                <select 
                  className="border border-border/60 rounded-lg px-3 py-2 w-full bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary" 
                  value={movTipo} 
                  onChange={e => setMovTipo(e.target.value)}
                >
                  <option value="entrada">📥 Entrada (Aumentar stock)</option>
                  <option value="salida">📤 Salida (Disminuir stock)</option>
                  <option value="ajuste">⚖️ Ajuste (Corregir stock)</option>
              </select>
              </div>

              {/* Cantidad con validación visual */}
              <div>
                <label className="font-semibold text-sm mb-2 block">
                  Cantidad
                  {movTipo === "salida" && movProductoId && (
                    <span className="text-xs text-muted-foreground ml-2">
                      (Máx: {productos.find(p => p.id === movProductoId)?.stock || 0})
                    </span>
                  )}
                </label>
                <Input 
                  type="text"
                  inputMode="numeric"
                  className={`w-full ${movTipo === "salida" && Number(movCantidad || 0) > (productos.find(p => p.id === movProductoId)?.stock || 0) ? 'border-red-500 focus:border-red-500' : ''}`}
                  value={movCantidad}
                  onChange={e => {
                    const raw = e.target.value;
                    const esAjuste = movTipo === "ajuste" && !ajusteAbsoluto;
                    const valid = raw === "" || (esAjuste ? /^-?\d*$/.test(raw) : /^\d*$/.test(raw));
                    if (valid) setMovCantidad(raw);
                  }}
                  disabled={movTipo === "ajuste" && ajusteAbsoluto}
                  placeholder={movTipo === "ajuste" ? "0" : "1"}
                />
                {movTipo === "salida" && Number(movCantidad || 0) > (productos.find(p => p.id === movProductoId)?.stock || 0) && (
                  <p className="text-red-700 dark:text-red-300 text-xs mt-1">⚠️ Cantidad excede el stock disponible</p>
                )}
              </div>

              {/* Ajuste absoluto y motivo */}
              {movTipo === "ajuste" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="flex items-center gap-2">
                    <input id="ajusteAbs" type="checkbox" checked={ajusteAbsoluto} onChange={(e) => setAjusteAbsoluto(e.target.checked)} />
                    <label htmlFor="ajusteAbs" className="text-sm">Ajustar a stock final</label>
                  </div>
                  <div>
                    <label className="font-semibold text-sm mb-2 block">Stock final deseado</label>
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={stockFinal}
                      onChange={(e) => { const r = e.target.value; if (r === "" || /^\d*$/.test(r)) setStockFinal(r); }}
                      disabled={!ajusteAbsoluto}
                      placeholder="Ej: 120"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="font-semibold text-sm mb-2 block">Motivo</label>
                    <select
                      className="border border-border/60 bg-background text-foreground rounded-lg px-3 py-2 w-full focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      value={movMotivo}
                      onChange={(e) => setMovMotivo(e.target.value)}
                    >
                      <option value="">Seleccionar motivo</option>
                      <option value="conteo">Conteo físico</option>
                      <option value="rotura">Rotura</option>
                      <option value="merma">Merma</option>
                      <option value="carga_inicial">Carga inicial</option>
                      <option value="otros">Otros</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Observaciones */}
              <div>
                <label className="font-semibold text-sm mb-2 block">Observaciones</label>
                <Input 
                  type="text" 
                  className="w-full" 
                  value={movObs} 
                  onChange={e => setMovObs(e.target.value)}
                  placeholder="Motivo del movimiento..."
                />
              </div>

              {/* Resumen del movimiento */}
              {movProductoId && ((movCantidad !== "" && Number(movCantidad) > 0) || movTipo === "ajuste") && (
                <div className="bg-muted/50 p-3 rounded-lg border border-border/60">
                  <h5 className="font-medium text-sm mb-2">Resumen del movimiento:</h5>
                  <div className="text-sm">
                    <p><span className="font-medium">Stock actual:</span> {productos.find(p => p.id === movProductoId)?.stock || 0}</p>
                    <p>
                      <span className="font-medium">Movimiento:</span>{" "}
                      {movTipo === "ajuste" && ajusteAbsoluto
                        ? `→ Ajuste a ${stockFinal !== "" ? stockFinal : "?"}`
                        : `${movTipo === "entrada" ? "+" : movTipo === "salida" ? "-" : "±"} ${movCantidad || 0}`}
                    </p>
                    <p><span className="font-medium">Stock resultante:</span> 
                      <span className={`font-bold ml-1 ${
                        movTipo === "entrada" 
                          ? "text-emerald-700 dark:text-emerald-300" 
                          : movTipo === "salida" 
                          ? "text-red-700 dark:text-red-300" 
                          : "text-blue-700 dark:text-blue-300"
                      }`}>
                        {movTipo === "ajuste" && ajusteAbsoluto
                          ? (stockFinal === "" ? "?" : Number(stockFinal))
                          : calcularStockResultante(productos.find(p => p.id === movProductoId)?.stock || 0, movTipo, Number(movCantidad || 0))}
                      </span>
                    </p>
                  </div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpenMov(false)}>Cancelar</Button>
              <Button 
                variant="default" 
                onClick={handleMovGuardar} 
                disabled={(() => {
                  const prod = productos.find(p => p.id === movProductoId);
                  const stockAct = Number(prod?.stock) || 0;
                  const qty = movCantidad === "" ? NaN : Number(movCantidad);
                  const isSalidaOver = movTipo === "salida" && Number(qty || 0) > stockAct;
                  const isEntradaInvalid = movTipo === "entrada" && !(qty > 0);
                  const isAjusteDeltaInvalid = movTipo === "ajuste" && !ajusteAbsoluto && (Number.isNaN(qty) || stockAct + qty < 0);
                  const finalNum = stockFinal === "" ? NaN : Number(stockFinal);
                  const isAjusteAbsInvalid = movTipo === "ajuste" && ajusteAbsoluto && (Number.isNaN(finalNum) || finalNum < 0);
                  const basics = loadingProd || movLoading || !movProductoId;
                  return basics || isSalidaOver || isEntradaInvalid || isAjusteDeltaInvalid || isAjusteAbsInvalid;
                })()}
              >
                {movLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Registrar Movimiento
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        {/* Modal de detalle de producto */}
        <Dialog open={detalleOpen} onOpenChange={setDetalleOpen}>
          <DialogContent className="w-[95vw] max-w-[1200px] max-h-[90vh] overflow-hidden flex flex-col border border-border/60 bg-card">
            <DialogHeader>
              <DialogTitle>Detalle del Producto</DialogTitle>
            </DialogHeader>
            {detalleProducto && (
              <div className="flex flex-col gap-2 flex-1 min-h-0">
                <div className="font-bold text-lg mb-2">{detalleProducto.nombre}</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-2">
                  <div><b>Categoría:</b> {detalleProducto.categoria}</div>
                  <div><b>Unidad:</b> {detalleProducto.unidadMedida || detalleProducto.unidadVenta || detalleProducto.unidadVentaHerraje || detalleProducto.unidadVentaQuimico || detalleProducto.unidadVentaHerramienta}</div>
                  <div><b>Stock actual:</b> {detalleProducto.stock}</div>
                  <div><b>Mínimo:</b> {detalleProducto.min || "-"}</div>
                  <div><b>Estado:</b> {detalleProducto.stock === 0 ? "Sin stock" : detalleProducto.stock <= (detalleProducto.min || 0) ? "Bajo" : "OK"}</div>
                  <div><b>Última actualización:</b> {detalleProducto.fechaActualizacion ? formatFechaHora(detalleProducto.fechaActualizacion) : "-"}</div>
                </div>
                <div className="mt-2 flex-1 min-h-0">
                  <b>Historial de movimientos:</b>
                  {detalleMovimientos.length === 0 ? (
                    <div className="text-muted-foreground text-sm">No hay movimientos registrados.</div>
                  ) : (
                    <div className="mt-2 border border-border/60 rounded-xl overflow-auto max-h-[50vh]">
                      <Table className="min-w-[900px] table-fixed">
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-44 whitespace-nowrap">Fecha</TableHead>
                            <TableHead className="w-28 whitespace-nowrap">Tipo</TableHead>
                            <TableHead className="w-32 whitespace-nowrap text-right">Stock después</TableHead>
                            <TableHead className="w-24 whitespace-nowrap text-right">Cantidad</TableHead>
                            <TableHead className="w-28 whitespace-nowrap">Usuario</TableHead>
                            <TableHead className="w-[420px]">Observaciones</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {detalleMovimientos.map(m => (
                            <TableRow key={m.id}>
                              <TableCell className="whitespace-nowrap">{formatFechaHora(m.fecha)}</TableCell>
                              <TableCell className="whitespace-nowrap">
                                {m.tipo === "entrada" && <span className="text-emerald-700 dark:text-emerald-300 font-semibold flex items-center"><ArrowDown className="w-4 h-4 mr-1" />Entrada</span>}
                                {m.tipo === "salida" && <span className="text-red-700 dark:text-red-300 font-semibold flex items-center"><ArrowUp className="w-4 h-4 mr-1" />Salida</span>}
                                {m.tipo === "ajuste" && <span className="text-blue-700 dark:text-blue-300 font-semibold flex items-center"><RefreshCw className="w-4 h-4 mr-1" />Ajuste</span>}
                              </TableCell>
                              <TableCell className="whitespace-nowrap text-right">{Number.isFinite(Number(m.stockDespues)) ? Number(m.stockDespues) : "-"}</TableCell>
                              <TableCell className="whitespace-nowrap text-right">{m.cantidad}</TableCell>
                              <TableCell className="whitespace-nowrap">{formatUsuario(m.usuario)}</TableCell>
                              <TableCell className="whitespace-normal break-words max-w-[420px]">{m.observaciones}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}

export default StockComprasPage; 
