"use client";
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { db } from "@/lib/firebase";
import {
  collection,
  getDocs,
  updateDoc,
  doc,
  query,
  orderBy,
} from "firebase/firestore";
import { Loader2, Pencil, TrendingUp, Package, Settings, CheckSquare, Square, Info } from "lucide-react";
import { Icon } from "@iconify/react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const PreciosPage = () => {
  const [productos, setProductos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState("");
  const [categoriaSeleccionada, setCategoriaSeleccionada] = useState("");
  const [filtroTipoMadera, setFiltroTipoMadera] = useState("");
  const [filtroSubCategoria, setFiltroSubCategoria] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTipo, setModalTipo] = useState("");
  const [editProd, setEditProd] = useState(null);
  const [editForm, setEditForm] = useState({
    costo: "",
    valorVenta: "",
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [porcentajeAumento, setPorcentajeAumento] = useState("");
  const [valorFijoGlobal, setValorFijoGlobal] = useState("");
  const [metodoActualizacionGlobal, setMetodoActualizacionGlobal] = useState("porcentaje"); // "porcentaje" o "valor_fijo"
  const [tipoMaderaSeleccionado, setTipoMaderaSeleccionado] = useState("");
  const [proveedorSeleccionado, setProveedorSeleccionado] = useState("");
  const [tipoOperacion, setTipoOperacion] = useState("aumentar"); // "aumentar" o "disminuir"
  const [filtroGlobalCategoria, setFiltroGlobalCategoria] = useState("");
  const [filtroGlobalSubCategoria, setFiltroGlobalSubCategoria] = useState("");
  const [filtroGlobalTipoMadera, setFiltroGlobalTipoMadera] = useState("");
  
  // Nuevos estados para selección múltiple
  const [productosSeleccionados, setProductosSeleccionados] = useState(new Set());
  const [modalSeleccionMultiple, setModalSeleccionMultiple] = useState(false);
  const [porcentajeSeleccionMultiple, setPorcentajeSeleccionMultiple] = useState("");
  const [modoActualizacion, setModoActualizacion] = useState("porcentaje"); // "porcentaje" o "valor"
  const [valorEspecifico, setValorEspecifico] = useState("");

  // Estados para paginación optimizada
  const [paginaActual, setPaginaActual] = useState(1);
  const [productosPorPagina, setProductosPorPagina] = useState(20);
  const [isLoadingPagination, setIsLoadingPagination] = useState(false);

  useEffect(() => {
    const fetchProductos = async () => {
      setLoading(true);
      try {
        const q = query(collection(db, "productos"), orderBy("nombre"));
        const snap = await getDocs(q);
        setProductos(snap.docs.map((doc) => ({ ...(doc.data() || {}), id: doc.id })));
      } catch (error) {
        console.error("Error al cargar productos:", error);
        setMsg("Error al cargar productos: " + error.message);
      } finally {
        setLoading(false);
      }
    };
    fetchProductos();
  }, []);

  // Limpiar selección cuando cambian los filtros
  useEffect(() => {
    setProductosSeleccionados(new Set());
  }, [filtro, categoriaSeleccionada, filtroTipoMadera, filtroSubCategoria]);

  const categorias = [...new Set(productos.map((p) => p.categoria))].filter(
    Boolean
  );

  const tiposMaderaPorCategoria = useMemo(() => {
    const cat = filtroGlobalCategoria;
    const filtrados = productos.filter((p) => {
      if (cat && p.categoria !== cat) return false;
      return true;
    });
    return [...new Set(filtrados.map((p) => p.tipoMadera).filter(Boolean))].sort(
      (a, b) => a.localeCompare(b, "es-AR")
    );
  }, [productos, filtroGlobalCategoria]);

  const subCategoriasPorCategoria = useMemo(() => {
    const map = new Map();
    productos.forEach((p) => {
      const cat = String(p.categoria || "").trim();
      const sub = String(p.subcategoria ?? p.subCategoria ?? "").trim();
      if (!cat || !sub) return;
      if (!map.has(cat)) map.set(cat, new Set());
      map.get(cat).add(sub);
    });
    const result = {};
    map.forEach((set, key) => {
      result[key] = [...set].sort((a, b) => a.localeCompare(b, "es-AR"));
    });
    return result;
  }, [productos]);

  const subCategoriasParaListado = useMemo(() => {
    const cat = categoriaSeleccionada;
    if (!cat) {
      const set = new Set();
      productos.forEach((p) => {
        const sub = String(p.subcategoria ?? p.subCategoria ?? "").trim();
        if (sub) set.add(sub);
      });
      return [...set].sort((a, b) => a.localeCompare(b, "es-AR"));
    }
    return subCategoriasPorCategoria[cat] || [];
  }, [categoriaSeleccionada, productos, subCategoriasPorCategoria]);

  const subCategoriasParaFiltro = useMemo(() => {
    const cat = filtroGlobalCategoria;
    if (!cat) return [];
    return subCategoriasPorCategoria[cat] || [];
  }, [filtroGlobalCategoria, subCategoriasPorCategoria]);

  const tiposMadera = [
    ...new Set(
      productos
        .filter((p) => p.categoria === "Maderas" && p.tipoMadera)
        .map((p) => p.tipoMadera)
    ),
  ].filter(Boolean);
  
  const subCategoriasFerreteria = [
    ...new Set(
      productos
        .filter((p) => p.categoria === "Ferretería" && p.subCategoria)
        .map((p) => p.subCategoria)
    ),
  ].filter(Boolean);
  
  const proveedores = [
    ...new Set(productos.filter((p) => p.proveedor).map((p) => p.proveedor)),
  ].filter(Boolean);

  const obtenerProductosAfectadosGlobal = useCallback(() => {
    if (modalTipo === "proveedor") {
      if (!proveedorSeleccionado) return [];
      return productos.filter((p) => p.proveedor === proveedorSeleccionado);
    }
    if (modalTipo === "maderas" && !filtroGlobalCategoria && !filtroGlobalSubCategoria && !filtroGlobalTipoMadera) {
      return [];
    }
    const cat = filtroGlobalCategoria;
    const sub = filtroGlobalSubCategoria;
    const tipo = filtroGlobalTipoMadera;
    if (!cat && !sub && !tipo) return [];
    return productos.filter((p) => {
      if (cat && p.categoria !== cat) return false;
      if (sub) {
        const subProd = String(p.subcategoria ?? p.subCategoria ?? "").trim();
        if (subProd !== sub) return false;
      }
      if (tipo && p.tipoMadera !== tipo) return false;
      return true;
    });
  }, [
    modalTipo,
    productos,
    proveedorSeleccionado,
    filtroGlobalCategoria,
    filtroGlobalSubCategoria,
    filtroGlobalTipoMadera,
  ]);

  // Función para redondear a centenas (múltiplos de 100) - igual que en ventas
  const redondearDecimal = (numero) => {
    if (typeof numero !== 'number' || isNaN(numero)) return 0;
    
    // Redondear a centenas (múltiplos de 100) para consistencia con el sistema de ventas
    return Math.round(numero / 100) * 100;
  };

  // Función para validar y formatear números de entrada
  const validarNumero = (valor) => {
    if (!valor || valor === "") return null;
    const numero = Number(valor);
    if (isNaN(numero) || numero < 0) return null;
    return redondearDecimal(numero);
  };

  // Función para validar porcentaje
  const validarPorcentaje = (valor) => {
    if (!valor || valor === "") return null;
    const numero = Number(valor);
    if (isNaN(numero) || numero < -100 || numero > 100) return null;
    return numero;
  };

  // Función para calcular el porcentaje necesario para llegar a un valor objetivo
  const calcularPorcentajeParaObjetivo = (valorActual, valorObjetivo) => {
    if (!valorActual || !valorObjetivo || valorActual <= 0) return null;
    const porcentaje = ((valorObjetivo - valorActual) / valorActual) * 100;
    return redondearDecimal(porcentaje);
  };

  // Funciones para manejo de selección múltiple
  const handleSeleccionarProducto = (productoId) => {
    if (!productoId) return;
    
    setProductosSeleccionados(prev => {
      const nuevosSeleccionados = new Set(prev);
      if (nuevosSeleccionados.has(productoId)) {
        nuevosSeleccionados.delete(productoId);
      } else {
        nuevosSeleccionados.add(productoId);
      }
      return nuevosSeleccionados;
    });
  };

  const handleSeleccionarTodos = () => {
    if (productosPaginados.length === 0) return;
    
    setProductosSeleccionados(prev => {
      if (prev.size === productosPaginados.length) {
        return new Set();
      } else {
        return new Set(productosPaginados.map(p => p.id));
      }
    });
  };

  const handleActualizarSeleccionMultiple = async () => {
    if (productosSeleccionados.size === 0) {
      setMsg("Por favor selecciona productos.");
      return;
    }

    let porcentaje = null;
    let valorObjetivo = null;

    if (modoActualizacion === "porcentaje") {
      if (!porcentajeSeleccionMultiple) {
        setMsg("Por favor ingresa un porcentaje válido.");
        return;
      }
      porcentaje = validarPorcentaje(porcentajeSeleccionMultiple);
      if (porcentaje === null) {
        setMsg("Por favor ingresa un porcentaje válido entre -100 y 100.");
        return;
      }
    } else {
      if (!valorEspecifico) {
        setMsg("Por favor ingresa un valor específico.");
        return;
      }
      valorObjetivo = validarNumero(valorEspecifico);
      if (valorObjetivo === null) {
        setMsg("Por favor ingresa un valor válido mayor a 0.");
        return;
      }
    }

    setSaving(true);
    setMsg("");
    
    try {
      const productosAActualizar = productos.filter(p => productosSeleccionados.has(p.id));
      let actualizados = 0;
      let errores = 0;
      let sinCambios = 0;

      for (const producto of productosAActualizar) {
        try {
          const updates = {};
          
          if (producto.categoria === "Maderas" && producto.precioPorPie) {
            let nuevoPrecio;
            if (modoActualizacion === "porcentaje") {
              const factorAumento = porcentaje / 100;
              nuevoPrecio = redondearDecimal(producto.precioPorPie * (1 + factorAumento));
            } else {
              nuevoPrecio = redondearDecimal(valorObjetivo);
            }
            if (nuevoPrecio > 0) {
              updates.precioPorPie = nuevoPrecio;
            }
          } else if (producto.valorVenta) {
            let nuevoPrecio;
            if (modoActualizacion === "porcentaje") {
              const factorAumento = porcentaje / 100;
              nuevoPrecio = redondearDecimal(producto.valorVenta * (1 + factorAumento));
            } else {
              nuevoPrecio = redondearDecimal(valorObjetivo);
            }
            if (nuevoPrecio > 0) {
              updates.valorVenta = nuevoPrecio;
            }
          }

          if (Object.keys(updates).length > 0) {
            await updateDoc(doc(db, "productos", producto.id), updates);
            actualizados++;
          } else {
            sinCambios++;
          }
        } catch (error) {
          console.error(`Error al actualizar producto ${producto.id}:`, error);
          errores++;
        }
      }

      // Mensaje detallado del resultado
      let mensaje = `${actualizados} productos actualizados correctamente.`;
      if (sinCambios > 0) {
        mensaje += ` ${sinCambios} sin cambios (sin precio válido).`;
      }
      if (errores > 0) {
        mensaje += ` ${errores} errores.`;
      }
      setMsg(mensaje);

      // Limpiar selección y recargar productos
      setProductosSeleccionados(new Set());
      setPorcentajeSeleccionMultiple("");
      setValorEspecifico("");

      const q = query(collection(db, "productos"), orderBy("nombre"));
      const snap = await getDocs(q);
      setProductos(snap.docs.map((doc) => ({ ...(doc.data() || {}), id: doc.id })));
      
      setTimeout(() => {
        setModalSeleccionMultiple(false);
      }, 2000);
    } catch (error) {
      console.error("Error general:", error);
      setMsg("Error al actualizar productos: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleEditarIndividual = (prod) => {
    if (!prod) return;
    
    setModalTipo("individual");
    setEditProd(prod);
    setEditForm({
      costo: prod.costo ? String(prod.costo) : "",
      valorVenta: prod.valorVenta ? String(prod.valorVenta) : "",
    });
    setMsg("");
    setModalOpen(true);
  };

  const handleActualizacionGlobal = (tipo) => {
    setModalTipo(tipo);
    setEditProd(null);
    setEditForm({ costo: "", valorVenta: "" });
    setPorcentajeAumento("");
    setValorFijoGlobal("");
    setMetodoActualizacionGlobal("porcentaje");
    setTipoMaderaSeleccionado("");
    setProveedorSeleccionado("");
    setTipoOperacion("aumentar");
    setFiltroGlobalCategoria("");
    setFiltroGlobalSubCategoria("");
    setFiltroGlobalTipoMadera("");
    setMsg("");
    setModalOpen(true);
  };

  // Función para abrir modal de selección múltiple
  const abrirModalSeleccionMultiple = () => {
    setModoActualizacion("porcentaje");
    setPorcentajeSeleccionMultiple("");
    setValorEspecifico("");
    setMsg("");
    setModalSeleccionMultiple(true);
  };

  const handleGuardarIndividual = async () => {
    if (!editProd) {
      setMsg("Error: No hay producto seleccionado.");
      return;
    }

    setSaving(true);
    setMsg("");
    
    try {
      const updates = {};
      
      if (editForm.costo !== "") {
        const costo = validarNumero(editForm.costo);
        if (costo !== null) {
          updates.costo = redondearDecimal(costo);
        } else {
          setMsg("Por favor ingresa un costo válido (número mayor o igual a 0).");
          setSaving(false);
          return;
        }
      }
      
      if (editForm.valorVenta !== "") {
        const valorVenta = validarNumero(editForm.valorVenta);
        if (valorVenta !== null) {
          updates.valorVenta = redondearDecimal(valorVenta);
        } else {
          setMsg("Por favor ingresa un precio de venta válido (número mayor o igual a 0).");
          setSaving(false);
          return;
        }
      }

      if (Object.keys(updates).length === 0) {
        setMsg("Por favor ingresa al menos un valor válido.");
        setSaving(false);
        return;
      }

      await updateDoc(doc(db, "productos", editProd.id), updates);
      setMsg("Precios actualizados correctamente.");

      const q = query(collection(db, "productos"), orderBy("nombre"));
      const snap = await getDocs(q);
      setProductos(snap.docs.map((doc) => ({ ...(doc.data() || {}), id: doc.id })));
      
      setTimeout(() => {
        setModalOpen(false);
        setEditProd(null);
      }, 1000);
    } catch (error) {
      console.error("Error al guardar:", error);
      setMsg("Error al guardar: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleGuardarGlobal = async () => {
    const productosAActualizar = obtenerProductosAfectadosGlobal();
    if (productosAActualizar.length === 0) {
      setMsg("No se encontraron productos para actualizar.");
      return;
    }

    let factorAumento = 0;
    let valorFijoNum = 0;

    if (metodoActualizacionGlobal === "porcentaje") {
      if (!porcentajeAumento) {
        setMsg("Por favor ingresa un porcentaje válido.");
        return;
      }
      const porcentajePositivo = validarNumero(porcentajeAumento);
      if (porcentajePositivo === null || porcentajePositivo < 0 || porcentajePositivo > 100) {
        setMsg("Por favor ingresa un porcentaje válido entre 0 y 100.");
        return;
      }
      const porcentaje = tipoOperacion === "disminuir" ? -porcentajePositivo : porcentajePositivo;
      factorAumento = porcentaje / 100;
    } else {
      if (!valorFijoGlobal) {
        setMsg("Por favor ingresa un valor fijo válido.");
        return;
      }
      valorFijoNum = validarNumero(valorFijoGlobal);
      if (valorFijoNum === null || valorFijoNum <= 0) {
        setMsg("Por favor ingresa un valor fijo mayor a 0.");
        return;
      }
    }

    setSaving(true);
    setMsg("");
    
    try {
      let actualizados = 0;
      let sinCambios = 0;

      for (const producto of productosAActualizar) {
        try {
          const updates = {};

          if (producto.valorVenta) {
            const nuevoPrecio =
              metodoActualizacionGlobal === "porcentaje"
                ? redondearDecimal(producto.valorVenta * (1 + factorAumento))
                : tipoOperacion === "disminuir"
                  ? Math.max(redondearDecimal(producto.valorVenta - valorFijoNum), 0)
                  : redondearDecimal(producto.valorVenta + valorFijoNum);
            if (nuevoPrecio > 0) {
              updates.valorVenta = nuevoPrecio;
            }
          }
          
          if (producto.precioPorPie) {
            const nuevoPrecio =
              metodoActualizacionGlobal === "porcentaje"
                ? redondearDecimal(producto.precioPorPie * (1 + factorAumento))
                : tipoOperacion === "disminuir"
                  ? Math.max(redondearDecimal(producto.precioPorPie - valorFijoNum), 0)
                  : redondearDecimal(producto.precioPorPie + valorFijoNum);
            if (nuevoPrecio > 0) {
              updates.precioPorPie = nuevoPrecio;
            }
          }

          if (Object.keys(updates).length > 0) {
            await updateDoc(doc(db, "productos", producto.id), updates);
            actualizados++;
          } else {
            sinCambios++;
          }
        } catch (error) {
          console.error(`Error al actualizar producto ${producto.id}:`, error);
        }
      }

      let mensaje = `${actualizados} productos actualizados correctamente.`;
      if (sinCambios > 0) {
        mensaje += ` ${sinCambios} sin cambios (sin precio válido).`;
      }
      setMsg(mensaje);

      const q = query(collection(db, "productos"), orderBy("nombre"));
      const snap = await getDocs(q);
      setProductos(snap.docs.map((doc) => ({ ...(doc.data() || {}), id: doc.id })));
      
      setTimeout(() => {
        setModalOpen(false);
      }, 1000);
    } catch (error) {
      console.error("Error general:", error);
      setMsg("Error al guardar: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const productosFiltrados = productos.filter((p) => {
    // Función para normalizar texto (eliminar espacios y convertir a minúsculas)
    const normalizarTexto = (texto) => {
      if (!texto) return "";
      return texto.toLowerCase().replace(/\s+/g, '');
    };

    // Normalizar el término de búsqueda
    const filtroNormalizado = normalizarTexto(filtro);
    
    // Normalizar el nombre del producto
    const nombreNormalizado = normalizarTexto(p.nombre);
    
    // Normalizar la categoría
    const categoriaNormalizada = normalizarTexto(p.categoria);

    // Búsqueda por precios (adaptada para maderas y ferretería)
    // Maderas usan precioPorPie, Ferretería y otros usan valorVenta
    const precioVenta = p.valorVenta ? redondearDecimal(p.valorVenta) : null;
    const precioPorPie = p.precioPorPie ? redondearDecimal(p.precioPorPie) : null;
    const costo = p.costo ? redondearDecimal(p.costo) : null;
    
    // Convertir precios a string para búsqueda (sin decimales para búsqueda más flexible)
    const precioVentaStr = precioVenta ? precioVenta.toString() : "";
    const precioPorPieStr = precioPorPie ? precioPorPie.toString() : "";
    const costoStr = costo ? costo.toString() : "";
    
    // Normalizar el filtro: remover caracteres no numéricos excepto números
    const filtroNumerico = filtroNormalizado.replace(/[^\d]/g, '');
    
    // Verificar si el filtro contiene números y buscar en precios
    const esBusquedaNumerica = filtroNumerico.length > 0;
    const cumpleBusquedaPrecios = esBusquedaNumerica && (
      precioVentaStr.includes(filtroNumerico) ||
      precioPorPieStr.includes(filtroNumerico) ||
      costoStr.includes(filtroNumerico)
    );

    // Filtro por búsqueda de texto (ahora más flexible)
    const cumpleBusqueda =
      filtroNormalizado === "" ||
      nombreNormalizado.includes(filtroNormalizado) ||
      categoriaNormalizada.includes(filtroNormalizado) ||
      cumpleBusquedaPrecios;

    // Filtro por categoría principal
    const cumpleCategoria =
      !categoriaSeleccionada || p.categoria === categoriaSeleccionada;

    // Filtro específico por tipo de madera
    const cumpleTipoMadera =
      categoriaSeleccionada !== "Maderas" ||
      filtroTipoMadera === "" ||
      p.tipoMadera === filtroTipoMadera;

    // Filtro específico por subcategoría (aplica a cualquier categoría, unifica lectura de field)
    const cumpleSubCategoria = (() => {
      if (!filtroSubCategoria) return true;
      const subProd = String(p.subcategoria ?? p.subCategoria ?? "").trim();
      return subProd === filtroSubCategoria;
    })();

    return cumpleBusqueda && cumpleCategoria && cumpleTipoMadera && cumpleSubCategoria;
  });

  // Productos paginados optimizados
  const productosPaginados = useMemo(() => {
    const inicio = (paginaActual - 1) * productosPorPagina;
    const fin = inicio + productosPorPagina;
    return productosFiltrados.slice(inicio, fin);
  }, [productosFiltrados, paginaActual, productosPorPagina]);

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

  // Resetear página cuando cambian los filtros
  useEffect(() => {
    setPaginaActual(1);
  }, [categoriaSeleccionada, filtro, filtroTipoMadera, filtroSubCategoria]);

  const getIconoCategoria = (categoria) => {
    switch (categoria) {
      case "Maderas":
        return "🌲";
      case "Ferretería":
        return "🔧";
      case "Herramientas":
        return "🛠️";
      case "Químicos":
        return "🧪";
      default:
        return "📦";
    }
  };

  const getColorCategoria = (categoria) => {
    switch (categoria) {
      case "Maderas":
        return "bg-orange-100 text-orange-800 border-orange-200";
      case "Ferretería":
        return "bg-blue-100 text-blue-800 border-blue-200";
      case "Herramientas":
        return "bg-green-100 text-green-800 border-green-200";
      case "Químicos":
        return "bg-purple-100 text-purple-800 border-purple-200";
      default:
        return "bg-gray-100 text-gray-800 border-gray-200";
    }
  };

  // Verificar si todos los productos paginados están seleccionados
  const todosSeleccionados = productosPaginados.length > 0 && 
    productosSeleccionados.size === productosPaginados.length;

  return (
    <div className="py-8 px-2 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Gestión de Precios</h1>
        <p className="text-lg text-gray-600">
          Sistema profesional de actualización de precios por categorías
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <Card className="border-2 border-orange-200 hover:border-orange-300 transition-colors">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
                <Icon
                  icon="mdi:pine-tree"
                  className="w-6 h-6 text-orange-600"
                />
              </div>
              <div>
                <CardTitle className="text-lg">Maderas</CardTitle>
                <p className="text-sm text-gray-600">
                  Actualización por tipo de madera
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => handleActualizacionGlobal("maderas")}
              className="w-full bg-orange-600 hover:bg-orange-700"
            >
              <TrendingUp className="w-4 h-4 mr-2" />
              Actualizar Maderas
            </Button>
          </CardContent>
        </Card>

        <Card className="border-2 border-blue-200 hover:border-blue-300 transition-colors">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <Icon
                  icon="mdi:package-variant"
                  className="w-6 h-6 text-blue-600"
                />
              </div>
              <div>
                <CardTitle className="text-lg">Proveedores</CardTitle>
                <p className="text-sm text-gray-600">
                  Actualización por proveedor
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => handleActualizacionGlobal("proveedor")}
              className="w-full bg-blue-600 hover:bg-blue-700"
            >
              <Package className="w-4 h-4 mr-2" />
              Actualizar Proveedores
            </Button>
          </CardContent>
        </Card>

        <Card className="border-2 border-green-200 hover:border-green-300 transition-colors">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <Icon icon="mdi:tools" className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <CardTitle className="text-lg">Individual</CardTitle>
                <p className="text-sm text-gray-600">
                  Edición producto por producto
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => setCategoriaSeleccionada("")}
              className="w-full bg-green-600 hover:bg-green-700"
            >
              <Settings className="w-4 h-4 mr-2" />
              Ver Todos
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
              <CardTitle>Listado de Productos</CardTitle>
              <div className="flex flex-col md:flex-row gap-3 w-full md:w-auto">
                <select
                  value={categoriaSeleccionada}
                  onChange={(e) => {
                    setCategoriaSeleccionada(e.target.value);
                    // Limpiar filtros específicos al cambiar categoría
                    setFiltroTipoMadera("");
                    setFiltroSubCategoria("");
                  }}
                  className="w-full md:w-48 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Todas las categorías</option>
                  {categorias.map((cat) => (
                    <option key={cat} value={cat}>
                      {getIconoCategoria(cat)} {cat}
                    </option>
                  ))}
                </select>
                <select
                  value={filtroSubCategoria}
                  onChange={(e) => setFiltroSubCategoria(e.target.value)}
                  disabled={subCategoriasParaListado.length === 0}
                  className="w-full md:w-48 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
                >
                  <option value="">Todas las subcategorías</option>
                  {subCategoriasParaListado.map((sub) => (
                    <option key={sub} value={sub}>
                      {sub}
                    </option>
                  ))}
                </select>
                <Input
                  placeholder="Buscar por nombre, categoría o precio..."
                  value={filtro}
                  onChange={(e) => setFiltro(e.target.value)}
                  className="w-full md:w-64"
                />
              </div>
            </div>

            {/* Filtros específicos por categoría */}
            <div className="flex flex-col sm:flex-row gap-3">
              {/* Filtro de tipo de madera */}
              {categoriaSeleccionada === "Maderas" && tiposMadera.length > 0 && (
                <div className="flex-1">
                  <div className="flex bg-white rounded-lg p-1 shadow-sm border border-gray-200">
                    <button
                      type="button"
                      className={`rounded-full px-4 py-1 text-sm flex items-center gap-2 transition-all ${
                        filtroTipoMadera === ""
                          ? "bg-orange-600 text-white"
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                      }`}
                      onClick={() => setFiltroTipoMadera("")}
                    >
                      Todos los tipos
                    </button>
                    {tiposMadera.map((tipo) => (
                      <button
                        key={tipo}
                        type="button"
                        className={`rounded-md px-4 py-1 text-sm flex items-center gap-2 transition-all ${
                          filtroTipoMadera === tipo
                            ? "bg-orange-600 text-white"
                            : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                        }`}
                        onClick={() => setFiltroTipoMadera(tipo)}
                      >
                        {tipo}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Filtro de subcategoría de ferretería */}
              {categoriaSeleccionada === "Ferretería" &&
                subCategoriasFerreteria.length > 0 && (
                  <div className="flex-1">
                    <div className="flex bg-white rounded-lg p-1 shadow-sm border border-gray-200">
                      <button
                        type="button"
                        className={`rounded-md px-4 py-1 text-sm flex items-center gap-2 transition-all ${
                          filtroSubCategoria === ""
                            ? "bg-blue-600 text-white"
                            : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                        }`}
                        onClick={() => setFiltroSubCategoria("")}
                      >
                        Todas las subcategorías
                      </button>
                      {subCategoriasFerreteria.map((subCategoria) => (
                        <button
                          key={subCategoria}
                          type="button"
                          className={`rounded-full px-4 py-1 text-sm flex items-center gap-2 transition-all ${
                            filtroSubCategoria === subCategoria
                              ? "bg-blue-600 text-white"
                              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                          }`}
                          onClick={() => setFiltroSubCategoria(subCategoria)}
                        >
                          {subCategoria}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
            </div>

            {/* Indicador de productos filtrados y botón de selección múltiple */}
            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                {productosSeleccionados.size > 0 && (
                  <Button
                    onClick={abrirModalSeleccionMultiple}
                    className="bg-purple-600 hover:bg-purple-700 text-white"
                    size="sm"
                  >
                    <TrendingUp className="w-4 h-4 mr-2" />
                    Actualizar {productosSeleccionados.size} productos
                  </Button>
                )}
                {(filtro || categoriaSeleccionada || filtroTipoMadera || filtroSubCategoria) && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setFiltro("");
                      setCategoriaSeleccionada("");
                      setFiltroTipoMadera("");
                      setFiltroSubCategoria("");
                    }}
                    className="text-xs"
                  >
                    Limpiar filtros
                  </Button>
                )}
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {loading ? (
            <div className="flex justify-center items-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <div className="flex items-center justify-center">
                      <button
                        onClick={handleSeleccionarTodos}
                        className="p-1 hover:bg-gray-100 rounded"
                        disabled={productosPaginados.length === 0}
                      >
                        {todosSeleccionados ? (
                          <CheckSquare className="w-4 h-4 text-blue-600" />
                        ) : (
                          <Square className="w-4 h-4 text-gray-400" />
                        )}
                      </button>
                    </div>
                  </TableHead>
                  <TableHead>Producto</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead>Unidad</TableHead>
                  <TableHead>Stock</TableHead>
                  <TableHead>Precio Actual</TableHead>
                  <TableHead>Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="relative">
                {/* Overlay de carga durante la paginación */}
                {isLoadingPagination && (
                  <div className="absolute inset-0 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm z-10 flex items-center justify-center rounded-lg">
                    <div className="flex items-center gap-3 bg-white dark:bg-gray-700 px-4 py-3 rounded-lg shadow-lg border border-gray-200 dark:border-gray-600">
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Cargando productos...
                      </span>
                    </div>
                  </div>
                )}
                
                {productosPaginados.map((p) => (
                  <TableRow key={p.id} className="hover:bg-gray-50">
                    <TableCell>
                      <div className="flex items-center justify-center">
                        <Checkbox
                          checked={productosSeleccionados.has(p.id)}
                          onCheckedChange={() => handleSeleccionarProducto(p.id)}
                          className="data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                        />
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">{p.nombre}</div>
                        {p.tipoMadera && (
                          <Badge variant="outline" className="text-xs mt-1">
                            {p.tipoMadera}
                          </Badge>
                        )}
                        {p.proveedor && (
                          <Badge
                            variant="outline"
                            className="text-xs mt-1 ml-1"
                          >
                            {p.proveedor}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={getColorCategoria(p.categoria)}>
                        {getIconoCategoria(p.categoria)} {p.categoria}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {p.unidadMedida ||
                        p.unidadVenta ||
                        p.unidadVentaHerraje ||
                        p.unidadVentaQuimico ||
                        p.unidadVentaHerramienta}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`font-medium ${
                          p.stock > 10
                            ? "text-green-600"
                            : p.stock > 0
                            ? "text-yellow-600"
                            : "text-red-600"
                        }`}
                      >
                        {p.stock || 0}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {p.valorVenta && (
                          <div>Venta: ${redondearDecimal(p.valorVenta).toFixed(2)}</div>
                        )}
                        {p.precioPorPie && (
                          <div>$/pie: ${redondearDecimal(p.precioPorPie).toFixed(2)}</div>
                        )}
                        {p.costo && (
                          <div className="text-gray-500">
                            Costo: ${redondearDecimal(p.costo).toFixed(2)}
                          </div>
                        )}
                        {!p.valorVenta && !p.precioPorPie && !p.costo && (
                          <div className="text-gray-400 italic">Sin precio</div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleEditarIndividual(p)}
                        className="bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
                      >
                        <Pencil className="w-4 h-4 mr-1" />
                        Editar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          
          {/* Paginación profesional */}
          {productosFiltrados.length > 0 && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 bg-gray-50">
              <div className="flex items-center gap-4">
                <div className="text-sm text-gray-600">
                  Mostrando <span className="font-semibold">
                    {((paginaActual - 1) * productosPorPagina) + 1}
                  </span> a <span className="font-semibold">
                    {Math.min(paginaActual * productosPorPagina, totalProductos)}
                  </span> de <span className="font-semibold">{totalProductos}</span> productos
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">Productos por página:</span>
                  <select
                    value={productosPorPagina}
                    onChange={(e) => {
                      setProductosPorPagina(Number(e.target.value));
                      setPaginaActual(1);
                    }}
                    className="px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                  </select>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => cambiarPagina(1)}
                  disabled={paginaActual === 1}
                  className="px-3 py-1"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                  </svg>
                </Button>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => cambiarPagina(paginaActual - 1)}
                  disabled={paginaActual === 1}
                  className="px-3 py-1"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                  </svg>
                </Button>
                
                <div className="flex items-center gap-1">
                  {(() => {
                    const paginas = [];
                    const paginasAMostrar = 5;
                    const inicio = Math.max(1, paginaActual - Math.floor(paginasAMostrar / 2));
                    const fin = Math.min(totalPaginas, inicio + paginasAMostrar - 1);
                    
                    // Agregar primera página si no está incluida
                    if (inicio > 1) {
                      paginas.push(
                        <Button
                          key={1}
                          variant={paginaActual === 1 ? "default" : "outline"}
                          size="sm"
                          onClick={() => cambiarPagina(1)}
                          className="px-3 py-1"
                        >
                          1
                        </Button>
                      );
                      if (inicio > 2) {
                        paginas.push(
                          <span key="dots1" className="px-2 text-gray-500">...</span>
                        );
                      }
                    }
                    
                    // Agregar páginas del rango
                    for (let i = inicio; i <= fin; i++) {
                      paginas.push(
                        <Button
                          key={i}
                          variant={paginaActual === i ? "default" : "outline"}
                          size="sm"
                          onClick={() => cambiarPagina(i)}
                          className="px-3 py-1"
                        >
                          {i}
                        </Button>
                      );
                    }
                    
                    // Agregar última página si no está incluida
                    if (fin < totalPaginas) {
                      if (fin < totalPaginas - 1) {
                        paginas.push(
                          <span key="dots2" className="px-2 text-gray-500">...</span>
                        );
                      }
                      paginas.push(
                        <Button
                          key={totalPaginas}
                          variant={paginaActual === totalPaginas ? "default" : "outline"}
                          size="sm"
                          onClick={() => cambiarPagina(totalPaginas)}
                          className="px-3 py-1"
                        >
                          {totalPaginas}
                        </Button>
                      );
                    }
                    
                    return paginas;
                  })()}
                </div>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => cambiarPagina(paginaActual + 1)}
                  disabled={paginaActual === totalPaginas}
                  className="px-3 py-1"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                  </svg>
                </Button>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => cambiarPagina(totalPaginas)}
                  disabled={paginaActual === totalPaginas}
                  className="px-3 py-1"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 5l7 7-7 7m-8 0l7-7-7-7" />
                  </svg>
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal para actualización de selección múltiple */}
      <Dialog open={modalSeleccionMultiple} onOpenChange={setModalSeleccionMultiple}>
        <DialogContent className="w-[95vw] max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Actualizar Productos Seleccionados
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="bg-purple-50 p-4 rounded-lg">
              <div className="font-bold text-lg mb-2">
                📊 Actualización Personalizada
              </div>
              <div className="text-sm text-gray-600">
                Se actualizarán {productosSeleccionados.size} productos seleccionados.
               
              </div>
            </div>

            {/* Selector de modo de actualización */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">
                Modo de Actualización
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setModoActualizacion("porcentaje")}
                  className={`flex-1 px-4 py-2 rounded-lg border transition-all ${
                    modoActualizacion === "porcentaje"
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  📊 Por Porcentaje
                </button>
                <button
                  type="button"
                  onClick={() => setModoActualizacion("valor")}
                  className={`flex-1 px-4 py-2 rounded-lg border transition-all ${
                    modoActualizacion === "valor"
                      ? "bg-green-600 text-white border-green-600"
                      : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  💰 Valor Específico
                </button>
              </div>
            </div>

            {/* Campo de entrada según el modo */}
            {modoActualizacion === "porcentaje" ? (
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">
                  Porcentaje de Aumento
                </label>
                <Input
                  type="number"
                  min={-100}
                  max={100}
                  step={0.1}
                  placeholder="Ej: 15 para 15%"
                  value={porcentajeSeleccionMultiple}
                  onChange={(e) => {
                    const valor = e.target.value;
                    // Solo permitir números, punto decimal, signo negativo y backspace
                    if (valor === "" || /^-?\d*\.?\d{0,1}$/.test(valor)) {
                      setPorcentajeSeleccionMultiple(valor);
                    }
                  }}
                />
              </div>
            ) : (
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">
                  Valor Específico
                </label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  placeholder="1000"
                  value={valorEspecifico}
                  onChange={(e) => {
                    const valor = e.target.value;
                    // Solo permitir números, punto decimal y backspace
                    if (valor === "" || /^\d*\.?\d{0,2}$/.test(valor)) {
                      setValorEspecifico(valor);
                    }
                  }}
                />
              </div>
            )}

            {/* Resumen de la operación */}
            {(porcentajeSeleccionMultiple || valorEspecifico) && (
              <div className="bg-blue-50 p-4 rounded-lg">
                <div className="font-medium text-blue-800 mb-2">
                  Resumen de la operación:
                </div>
                <div className="text-sm text-blue-700">
                  <div>• Productos seleccionados: {productosSeleccionados.size}</div>
                  {modoActualizacion === "porcentaje" ? (
                    <div>• Aumento: {porcentajeSeleccionMultiple}%</div>
                  ) : (
                    <div>• Valor específico: ${valorEspecifico}</div>
                  )}
                  <div>• Maderas: {productos.filter(p => productosSeleccionados.has(p.id) && p.categoria === "Maderas").length} productos</div>
                  <div>• Otros: {productos.filter(p => productosSeleccionados.has(p.id) && p.categoria !== "Maderas").length} productos</div>
                </div>
              </div>
            )}

            {msg && (
              <div
                className={`p-3 rounded-lg text-sm ${
                  msg.startsWith("Error")
                    ? "bg-red-50 text-red-800 border border-red-200"
                    : "bg-green-50 text-green-800 border border-green-200"
                }`}
              >
                {msg}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalSeleccionMultiple(false)}>
              Cancelar
            </Button>
            <Button
              variant="default"
              onClick={handleActualizarSeleccionMultiple}
              disabled={saving || (modoActualizacion === "porcentaje" ? !porcentajeSeleccionMultiple : !valorEspecifico)}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Actualizando...
                </>
              ) : (
                `Aplicar ${modoActualizacion === "porcentaje" ? "Porcentaje" : "Valor Específico"}`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {modalTipo === "individual" && (
        <Dialog open={modalOpen} onOpenChange={setModalOpen}>
          <DialogContent className="w-[95vw] max-w-[500px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Pencil className="w-5 h-5" />
                Editar Precios Individuales
              </DialogTitle>
            </DialogHeader>
            {editProd && (
              <div className="flex flex-col gap-4 py-2">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <div className="font-bold text-lg mb-2">
                    {editProd.nombre}
                  </div>
                  <div className="text-sm text-gray-600">
                    Categoría: {editProd.categoria}
                    {editProd.tipoMadera && ` | Tipo: ${editProd.tipoMadera}`}
                    {editProd.proveedor &&
                      ` | Proveedor: ${editProd.proveedor}`}
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">
                      Costo
                    </label>
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      placeholder="Ingrese el costo"
                      value={editForm.costo}
                      onChange={(e) => {
                        const valor = e.target.value;
                        // Solo permitir números, punto decimal y backspace
                        if (valor === "" || /^\d*\.?\d{0,2}$/.test(valor)) {
                          setEditForm((f) => ({ ...f, costo: valor }));
                        }
                      }}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">
                      Precio de Venta
                    </label>
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      placeholder="Ingrese el precio de venta"
                      value={editForm.valorVenta}
                      onChange={(e) => {
                        const valor = e.target.value;
                        // Solo permitir números, punto decimal y backspace
                        if (valor === "" || /^\d*\.?\d{0,2}$/.test(valor)) {
                          setEditForm((f) => ({
                            ...f,
                            valorVenta: valor,
                          }));
                        }
                      }}
                    />
                  </div>
                </div>
                {msg && (
                  <div
                    className={`p-3 rounded-lg text-sm ${
                      msg.startsWith("Error")
                        ? "bg-red-50 text-red-800 border border-red-200"
                        : "bg-green-50 text-green-800 border border-green-200"
                    }`}
                  >
                    {msg}
                  </div>
                )}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setModalOpen(false)}>
                Cancelar
              </Button>
              <Button
                variant="default"
                onClick={handleGuardarIndividual}
                disabled={saving}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Guardando...
                  </>
                ) : (
                  "Guardar Cambios"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {(modalTipo === "maderas" || modalTipo === "proveedor") && (
        <Dialog open={modalOpen} onOpenChange={setModalOpen}>
          <DialogContent className="w-[95vw] max-w-[520px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                Actualización Global de Precios
              </DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-4 py-2">


              {/* 1. Operación */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                  <Icon icon="mdi:numeric-1-circle" className="w-5 h-5 text-blue-600" />
                  Operación
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setTipoOperacion("aumentar")}
                    className={`flex-1 px-4 py-3 rounded-lg border-2 transition-all font-medium ${
                      tipoOperacion === "aumentar"
                        ? "bg-green-600 text-white border-green-600 shadow-md"
                        : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex items-center justify-center gap-2">
                      <TrendingUp className="w-5 h-5" />
                      <span>Aumentar precios</span>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTipoOperacion("disminuir")}
                    className={`flex-1 px-4 py-3 rounded-lg border-2 transition-all font-medium ${
                      tipoOperacion === "disminuir"
                        ? "bg-red-600 text-white border-red-600 shadow-md"
                        : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex items-center justify-center gap-2">
                      <Icon icon="mdi:trending-down" className="w-5 h-5" />
                      <span>Disminuir precios</span>
                    </div>
                  </button>
                </div>
              </div>

              {/* 2. Método */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                  <Icon icon="mdi:numeric-2-circle" className="w-5 h-5 text-blue-600" />
                  Método
                </label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setMetodoActualizacionGlobal("porcentaje")}
                    className={`flex-1 px-4 py-2.5 rounded-lg border transition-all font-medium ${
                      metodoActualizacionGlobal === "porcentaje"
                        ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                        : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    Por porcentaje
                  </button>
                  <button
                    type="button"
                    onClick={() => setMetodoActualizacionGlobal("valor_fijo")}
                    className={`flex-1 px-4 py-2.5 rounded-lg border transition-all font-medium ${
                      metodoActualizacionGlobal === "valor_fijo"
                        ? "bg-violet-600 text-white border-violet-600 shadow-sm"
                        : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                    }`}
                  >
                    Por valor fijo
                  </button>
                </div>
              </div>

              {/* 3. Filtros encadenados */}
              {modalTipo === "maderas" && (
                <div className="space-y-3">
                  <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                    <Icon icon="mdi:numeric-3-circle" className="w-5 h-5 text-blue-600" />
                    Filtros
                  </label>

                  <div className="space-y-2">
                    <label className="text-xs font-medium text-gray-500">
                      Categoría
                    </label>
                    <select
                      value={filtroGlobalCategoria}
                      onChange={(e) => {
                        setFiltroGlobalCategoria(e.target.value);
                        setFiltroGlobalTipoMadera("");
                        setFiltroGlobalSubCategoria("");
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                    >
                      <option value="">Todas las categorías</option>
                      {categorias.map((cat) => (
                        <option key={cat} value={cat}>
                          {getIconoCategoria(cat)} {cat}
                        </option>
                      ))}
                    </select>
                  </div>

                  {tiposMaderaPorCategoria.length > 0 && (
                    <div className="space-y-2">
                      <label className="text-xs font-medium text-gray-500">
                        Tipo de madera
                      </label>
                      <select
                        disabled={!filtroGlobalCategoria}
                        value={filtroGlobalTipoMadera}
                        onChange={(e) => {
                          setFiltroGlobalTipoMadera(e.target.value);
                          setFiltroGlobalSubCategoria("");
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 disabled:bg-gray-50 disabled:text-gray-400"
                      >
                        <option value="">
                          {filtroGlobalCategoria ? "Todos los tipos" : "Selecciona una categoría primero"}
                        </option>
                        {tiposMaderaPorCategoria.map((tipo) => (
                          <option key={tipo} value={tipo}>
                            🌲 {tipo}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="text-xs font-medium text-gray-500">
                      Subcategoría
                    </label>
                    <select
                      disabled={!filtroGlobalCategoria}
                      value={filtroGlobalSubCategoria}
                      onChange={(e) => setFiltroGlobalSubCategoria(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 disabled:bg-gray-50 disabled:text-gray-400"
                    >
                      <option value="">
                        {filtroGlobalCategoria ? "Todas las subcategorías" : "Selecciona una categoría primero"}
                      </option>
                      {filtroGlobalCategoria &&
                        subCategoriasParaFiltro.map((sub) => (
                          <option key={sub} value={sub}>
                            {sub}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>
              )}

              {modalTipo === "proveedor" && (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                    <Icon icon="mdi:numeric-3-circle" className="w-5 h-5 text-blue-600" />
                    Proveedor
                  </label>
                  <select
                    value={proveedorSeleccionado}
                    onChange={(e) => setProveedorSeleccionado(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Seleccionar proveedor</option>
                    {proveedores.map((prov) => (
                      <option key={prov} value={prov}>
                        📦 {prov}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* 4. Valor de actualización */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                  <Icon icon="mdi:numeric-4-circle" className="w-5 h-5 text-blue-600" />
                  {metodoActualizacionGlobal === "porcentaje"
                    ? `Porcentaje ${tipoOperacion === "aumentar" ? "de aumento" : "de disminución"}`
                    : `Valor fijo a ${tipoOperacion === "aumentar" ? "sumar" : "restar"}`}
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="inline-flex items-center justify-center rounded-full w-4 h-4 text-gray-500 hover:text-gray-700 focus:outline-none"
                        >
                          <Info className="w-4 h-4" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-xs">
                        <div className="text-sm space-y-1">
                          <p className="font-medium mb-2">💡 Ayuda</p>
                          {metodoActualizacionGlobal === "porcentaje" ? (
                            <>
                              <p>Ingresa un porcentaje entre 0 y 100.</p>
                              {tipoOperacion === "aumentar" ? (
                                <p>• De 1000 a 1150 = 15% de aumento</p>
                              ) : (
                                <p>• De 1000 a 850 = 15% de disminución</p>
                              )}
                            </>
                          ) : (
                            <>
                              <p>Ingresa un monto para sumar o restar a cada precio.</p>
                              {tipoOperacion === "aumentar" ? (
                                <p>• +500 aumenta el precio en $500</p>
                              ) : (
                                <p>• -500 disminuye el precio en $500 (mínimo 0)</p>
                              )}
                            </>
                          )}
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </label>
                {metodoActualizacionGlobal === "porcentaje" ? (
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    placeholder={
                      tipoOperacion === "aumentar"
                        ? "Porcentaje de aumento (ej: 15 para 15%)"
                        : "Porcentaje de disminución (ej: 15 para 15%)"
                    }
                    value={porcentajeAumento}
                    onChange={(e) => {
                      const valor = e.target.value;
                      if (valor === "" || /^\d*\.?\d{0,1}$/.test(valor)) {
                        const num = parseFloat(valor);
                        if (valor === "" || (num >= 0 && num <= 100)) {
                          setPorcentajeAumento(valor);
                        }
                      }
                    }}
                  />
                ) : (
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    placeholder="Valor fijo (ej: 500)"
                    value={valorFijoGlobal}
                    onChange={(e) => {
                      const valor = e.target.value;
                      if (valor === "" || /^\d*$/.test(valor)) {
                        setValorFijoGlobal(valor);
                      }
                    }}
                  />
                )}
              </div>

              {/* Vista previa */}
              {(modalTipo === "proveedor" ||
                filtroGlobalCategoria ||
                filtroGlobalSubCategoria ||
                filtroGlobalTipoMadera) && (
                <div
                  className={`p-4 rounded-lg border ${
                    obtenerProductosAfectadosGlobal().length === 0
                      ? "bg-gray-50 border-gray-200"
                      : tipoOperacion === "aumentar"
                        ? "bg-green-50 border-green-200"
                        : "bg-red-50 border-red-200"
                  }`}
                >
                  <div
                    className={`font-medium mb-2 ${
                      obtenerProductosAfectadosGlobal().length === 0
                        ? "text-gray-700"
                        : tipoOperacion === "aumentar"
                          ? "text-green-800"
                          : "text-red-800"
                    }`}
                  >
                    Se actualizarán:
                  </div>
                  <div
                    className={`text-sm space-y-1 ${
                      obtenerProductosAfectadosGlobal().length === 0
                        ? "text-gray-600"
                        : tipoOperacion === "aumentar"
                          ? "text-green-700"
                          : "text-red-700"
                    }`}
                  >
                    {modalTipo === "proveedor" ? (
                      <div>• Proveedor: <span className="font-semibold">{proveedorSeleccionado || "—"}</span></div>
                    ) : (
                      <>
                        <div>• Categoría: <span className="font-semibold">{filtroGlobalCategoria || "—"}</span></div>
                        {tiposMaderaPorCategoria.length > 0 && (
                          <div>• Tipo de madera: <span className="font-semibold">{filtroGlobalTipoMadera || "—"}</span></div>
                        )}
                        <div>• Subcategoría: <span className="font-semibold">{filtroGlobalSubCategoria || "—"}</span></div>
                      </>
                    )}
                    <div>
                      • Productos afectados:{" "}
                      <span className="font-semibold">
                        {obtenerProductosAfectadosGlobal().length}
                      </span>
                    </div>
                    {metodoActualizacionGlobal === "porcentaje"
                      ? porcentajeAumento && (
                          <div>
                            • Operación:{" "}
                            <span className="font-semibold">
                              {tipoOperacion === "aumentar" ? "Aumentar" : "Disminuir"} {porcentajeAumento}%
                            </span>
                          </div>
                        )
                      : valorFijoGlobal && (
                          <div>
                            • Operación:{" "}
                            <span className="font-semibold">
                              {tipoOperacion === "aumentar" ? "+$" : "-$"}
                              {valorFijoGlobal} por producto
                            </span>
                          </div>
                        )}
                  </div>
                </div>
              )}

              {msg && (
                <div
                  className={`p-3 rounded-lg text-sm ${
                    msg.startsWith("Error")
                      ? "bg-red-50 text-red-800 border border-red-200"
                      : "bg-green-50 text-green-800 border border-green-200"
                  }`}
                >
                  {msg}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setModalOpen(false)}>
                Cancelar
              </Button>
              <Button
                variant="default"
                onClick={handleGuardarGlobal}
                disabled={
                  saving ||
                  obtenerProductosAfectadosGlobal().length === 0 ||
                  (metodoActualizacionGlobal === "porcentaje" ? !porcentajeAumento : !valorFijoGlobal)
                }
                className={
                  tipoOperacion === "aumentar"
                    ? "bg-green-600 hover:bg-green-700"
                    : "bg-red-600 hover:bg-red-700"
                }
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Actualizando...
                  </>
                ) : (
                  <>
                    {tipoOperacion === "aumentar" ? (
                      <>
                        <TrendingUp className="w-4 h-4 mr-2" />
                        Aplicar aumento
                      </>
                    ) : (
                      <>
                        <Icon icon="mdi:trending-down" className="w-4 h-4 mr-2" />
                        Aplicar disminución
                      </>
                    )}
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default PreciosPage;
