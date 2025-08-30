"use client";
import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, doc, getDoc, getDocs, updateDoc, addDoc, serverTimestamp } from "firebase/firestore";
import { useAuth } from "@/provider/auth.provider";
import { useRouter } from "next/navigation";

export const useObra = (id) => {
  const [obra, setObra] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [presupuesto, setPresupuesto] = useState(null);
  const [editando, setEditando] = useState(false);
  const [docLinks, setDocLinks] = useState([]);
  const [movimientos, setMovimientos] = useState([]);
  
  // Estados de edición de Datos Generales (solo para tipo "obra")
  const [nombreObra, setNombreObra] = useState("");
  const [tipoObra, setTipoObra] = useState("");
  const [prioridad, setPrioridad] = useState("");
  const [estadoObra, setEstadoObra] = useState("pendiente_inicio");
  const [responsable, setResponsable] = useState("");
  const [responsables] = useState(["Braian", "Damian", "Jonathan"]);
  const [fechasEdit, setFechasEdit] = useState({
    inicio: "",
    fin: "",
  });
  const [ubicacionEdit, setUbicacionEdit] = useState({
    direccion: "",
    localidad: "",
    provincia: "",
  });
  
  // Estados para información del cliente
  const [clienteId, setClienteId] = useState("");
  const [cliente, setCliente] = useState(null);
  const [clientes, setClientes] = useState([]);
  const [usarDireccionCliente, setUsarDireccionCliente] = useState(true);

  // Catálogo para Materiales (colección: productos)
  const [productosCatalogo, setProductosCatalogo] = useState([]);
  const [productosPorCategoria, setProductosPorCategoria] = useState({});
  const [categorias, setCategorias] = useState([]);
  const [categoriaId, setCategoriaId] = useState("");
  const [busquedaProducto, setBusquedaProducto] = useState("");
  const [busquedaDebounced, setBusquedaDebounced] = useState("");
  const [itemsCatalogo, setItemsCatalogo] = useState([]);
  const [isPendingCat, setIsPendingCat] = useState(false);
  const [catalogoCargado, setCatalogoCargado] = useState(false);

  // Catálogo para Presupuesto inicial (colección: productos_obras)
  const [productosObraCatalogo, setProductosObraCatalogo] = useState([]);
  const [productosObraPorCategoria, setProductosObraPorCategoria] = useState({});
  const [categoriasObra, setCategoriasObra] = useState([]);
  const [categoriaObraId, setCategoriaObraId] = useState("");
  const [busquedaProductoObra, setBusquedaProductoObra] = useState("");
  const [busquedaDebouncedObra, setBusquedaDebouncedObra] = useState("");
  const [itemsPresupuesto, setItemsPresupuesto] = useState([]);
  const [isPendingObra, setIsPendingObra] = useState(false);
  
  // Gasto manual de obra (cuando no hay presupuesto inicial)
  const [gastoObraManual, setGastoObraManual] = useState(0);
  
  // Vinculación de presupuesto inicial
  const [presupuestosDisponibles, setPresupuestosDisponibles] = useState([]);
  const [presupuestoSeleccionadoId, setPresupuestoSeleccionadoId] = useState("");
  
  // Modo de costo para resumen (presupuesto | gasto)
  const [modoCosto, setModoCosto] = useState("gasto");
  const [descripcionGeneral, setDescripcionGeneral] = useState("");

  // Cargar clientes
  useEffect(() => {
    const fetchClientes = async () => {
      try {
        const snapClientes = await getDocs(collection(db, "clientes"));
        setClientes(
          snapClientes.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
        );
      } catch (error) {
        console.error("Error al cargar clientes:", error);
      }
    };
    
    fetchClientes();
  }, []);

  // Cargar obra principal
  useEffect(() => {
    const fetchObra = async () => {
      try {
        setLoading(true);
        const obraDoc = await getDoc(doc(db, "obras", id));

        if (obraDoc.exists()) {
          const data = { id: obraDoc.id, ...obraDoc.data() };
          setObra(data);
          
          // Cargar descripción general si existe
          setDescripcionGeneral(data.descripcionGeneral || "");
          
          // Inicializar estados de edición de datos generales (si es obra)
          if (data.tipo === "obra") {
            setTipoObra(data.tipoObra || "");
            setPrioridad(data.prioridad || "");
            setEstadoObra(data.estado || "pendiente_inicio");
            setResponsable(data.responsable || "");
            
            const f = data.fechas || {};
            const today = new Date().toISOString().split("T")[0];
            setFechasEdit({
              inicio: f.inicio || today,
              fin: f.fin || today,
            });
            
            const u = data.ubicacion || {};
            setUbicacionEdit({
              direccion: u.direccion || "",
              localidad: u.localidad || "",
              provincia: u.provincia || "",
            });
            
            // Inicializar información del cliente
            setClienteId(data.clienteId || "");
            setCliente(data.cliente || null);
            setUsarDireccionCliente(data.usarDireccionCliente !== false);
            
            setItemsCatalogo(Array.isArray(data.materialesCatalogo) ? data.materialesCatalogo : []);
            setGastoObraManual(Number(data.gastoObraManual) || 0);
            setModoCosto(data.presupuestoInicialId ? "presupuesto" : "gasto");
          } else if (data.tipo === "presupuesto") {
            setEstadoObra(data.estado || "Activo");
            setItemsPresupuesto(Array.isArray(data.productos) ? data.productos : []);
            setDescripcionGeneral(data.descripcionGeneral || "");
          }
          
          // Si tiene presupuesto inicial, cargarlo
          if (data.presupuestoInicialId) {
            const presSnap = await getDoc(doc(db, "obras", data.presupuestoInicialId));
            if (presSnap.exists()) {
              setPresupuesto({ id: presSnap.id, ...presSnap.data() });
            }
          }
          
          // Inicializar estados de edición si existen
          const d = data.documentacion || {};
          setDocLinks(Array.isArray(d.links) ? d.links : []);

          const c = data.cobranzas || {};
          const inicial = [];
          const forma = c.formaPago || "efectivo";
          const sen = Number(c.senia) || 0;
          const mon = Number(c.monto) || 0;
          
          if (sen > 0) inicial.push({ 
            fecha: c.fechaSenia || "", 
            tipo: "seña", 
            metodo: forma, 
            monto: sen, 
            nota: "Seña" 
          });
          
          if (mon > 0) inicial.push({ 
            fecha: c.fechaMonto || "", 
            tipo: "pago", 
            metodo: forma, 
            monto: mon, 
            nota: "Pago" 
          });
          
          const hist = Array.isArray(c.historialPagos) ? c.historialPagos : [];
          hist.forEach((p) => {
            inicial.push({
              fecha: p.fecha || "",
              tipo: p.tipo || "pago",
              metodo: p.metodo || "efectivo",
              monto: Number(p.monto) || 0,
              nota: p.nota || "",
            });
          });
          setMovimientos(inicial);
        } else {
          setError("Obra no encontrada");
        }
      } catch (err) {
        console.error("Error al cargar la obra:", err);
        setError("Error al cargar la obra");
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      fetchObra();
    }
  }, [id]);

  // Inicializar edición de presupuesto cuando se carga
  useEffect(() => {
    if (presupuesto) {
      const prods = Array.isArray(presupuesto.productos) ? presupuesto.productos : [];
      setItemsPresupuesto(prods);
      setDescripcionGeneral(presupuesto.descripcionGeneral || "");
    }
  }, [presupuesto]);

  // Debounce búsquedas
  useEffect(() => {
    const t = setTimeout(() => setBusquedaDebounced(busquedaProducto), 150);
    return () => clearTimeout(t);
  }, [busquedaProducto]);
  
  useEffect(() => {
    const t = setTimeout(() => setBusquedaDebouncedObra(busquedaProductoObra), 150);
    return () => clearTimeout(t);
  }, [busquedaProductoObra]);

  // Cargar catálogos al entrar en modo edición
  useEffect(() => {
    async function cargarCatalogos() {
      if (!editando) return;
      
      // productos
      if (productosCatalogo.length === 0) {
        const snap = await getDocs(collection(db, "productos"));
        const prods = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setProductosCatalogo(prods);
        const agrup = {};
        prods.forEach((p) => {
          const cat = p.categoria || "Sin categoría";
          (agrup[cat] = agrup[cat] || []).push(p);
        });
        setProductosPorCategoria(agrup);
        setCategorias(Object.keys(agrup));
        setCatalogoCargado(true);
      }
      
      // productos_obras
      if (productosObraCatalogo.length === 0) {
        const snap2 = await getDocs(collection(db, "productos_obras"));
        const prods2 = snap2.docs.map((d) => ({ id: d.id, ...d.data() }));
        setProductosObraCatalogo(prods2);
        const agrup2 = {};
        prods2.forEach((p) => {
          const cat = p.categoria || "Sin categoría";
          (agrup2[cat] = agrup2[cat] || []).push(p);
        });
        setProductosObraPorCategoria(agrup2);
        setCategoriasObra(Object.keys(agrup2));
      }
      
      // presupuestos disponibles (obras tipo presupuesto)
      const snapObras = await getDocs(collection(db, "obras"));
      const lista = snapObras.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((x) => x.tipo === "presupuesto");
      setPresupuestosDisponibles(lista);
    }
    cargarCatalogos();
  }, [editando]);

  // Función para cargar catálogo de productos normales manualmente
  const cargarCatalogoProductos = async () => {
    if (catalogoCargado) return;
    
    try {
      console.log("Cargando catálogo de productos...");
      const snap = await getDocs(collection(db, "productos"));
      const prods = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      console.log("Productos cargados:", prods.length);
      
      setProductosCatalogo(prods);
      
      // Agrupar por categoría
      const agrup = {};
      prods.forEach((p) => {
        const cat = p.categoria || "Sin categoría";
        if (!agrup[cat]) agrup[cat] = [];
        agrup[cat].push(p);
      });
      
      setProductosPorCategoria(agrup);
      setCategorias(Object.keys(agrup));
      setCatalogoCargado(true);
      
      console.log("Catálogo cargado exitosamente:", {
        totalProductos: prods.length,
        categorias: Object.keys(agrup),
        productosPorCategoria: agrup
      });
    } catch (error) {
      console.error("Error al cargar catálogo de productos:", error);
      setCatalogoCargado(false);
    }
  };

  // Generar número para obra nueva
  const getNextObraNumber = async () => {
    const snap = await getDocs(collection(db, "obras"));
    let maxNum = 0;
    snap.docs.forEach((docSnap) => {
      const data = docSnap.data();
      if (data.numeroPedido && String(data.numeroPedido).startsWith("OBRA-")) {
        const num = parseInt(String(data.numeroPedido).replace("OBRA-", ""), 10);
        if (!Number.isNaN(num) && num > maxNum) maxNum = num;
      }
    });
    return `OBRA-${String(maxNum + 1).padStart(5, "0")}`;
  };

  // Generar número para presupuesto nuevo
  const getNextPresupuestoNumber = async () => {
    const snap = await getDocs(collection(db, "obras"));
    let maxNum = 0;
    snap.docs.forEach((docSnap) => {
      const data = docSnap.data();
      if (data.numeroPedido && String(data.numeroPedido).startsWith("PO-")) {
        const num = parseInt(String(data.numeroPedido).replace("PO-", ""), 10);
        if (!Number.isNaN(num) && num > maxNum) maxNum = num;
      }
    });
    return `PO-${String(maxNum + 1).padStart(4, "0")}`;
  };

  const handleDesvincularPresupuesto = async () => {
    if (!obra) return;
    await updateDoc(doc(db, "obras", obra.id), { presupuestoInicialId: null });
    setPresupuesto(null);
    setObra((prev) => (prev ? { ...prev, presupuestoInicialId: null } : prev));
  };

  const handleVincularPresupuesto = async () => {
    if (!obra || !presupuestoSeleccionadoId) return;
    await updateDoc(doc(db, "obras", obra.id), { presupuestoInicialId: presupuestoSeleccionadoId });
    const presSnap = await getDoc(doc(db, "obras", presupuestoSeleccionadoId));
    if (presSnap.exists()) setPresupuesto({ id: presSnap.id, ...presSnap.data() });
    setObra((prev) => (prev ? { ...prev, presupuestoInicialId: presupuestoSeleccionadoId } : prev));
  };

  const handleCrearPresupuestoDesdeAqui = async () => {
    if (!obra) return;
    const numeroPedido = await getNextPresupuestoNumber();
    const nuevo = {
      tipo: "presupuesto",
      numeroPedido,
      fecha: new Date().toISOString().split("T")[0],
      clienteId: obra.clienteId || obra.cliente?.id || null,
      cliente: obra.cliente || null,
      productos: [],
      subtotal: 0,
      descuentoTotal: 0,
      total: 0,
      descripcionGeneral: descripcionGeneral || "",
      fechaCreacion: new Date().toISOString(),
      estado: "Activo",
    };
    const created = await addDoc(collection(db, "obras"), nuevo);
    await updateDoc(doc(db, "obras", obra.id), { presupuestoInicialId: created.id });
    const presSnap = await getDoc(doc(db, "obras", created.id));
    if (presSnap.exists()) setPresupuesto({ id: presSnap.id, ...presSnap.data() });
    setObra((prev) => (prev ? { ...prev, presupuestoInicialId: created.id } : prev));
    // refrescar lista disponibles
    setPresupuestosDisponibles((prev) => [{ id: created.id, ...nuevo }, ...prev]);
  };

  const convertirPresupuestoToObra = async (datosConversion = {}, user = null) => {
    console.log("convertirPresupuestoToObra llamada con:", { datosConversion, user });
    if (!obra || obra.tipo !== "presupuesto") return;

    try {
      const numeroPedido = await getNextObraNumber();
      
      // Separar productos del presupuesto de materiales adicionales
      const productosPresupuesto = itemsPresupuesto || [];
      const materialesAdicionales = datosConversion.materialesAdicionales || [];
      
      // Combinar para cálculos de totales
      const productosCombinados = [...productosPresupuesto, ...materialesAdicionales];
      
      // Calcular totales combinados
      const subtotalCombinado = productosCombinados.reduce((acc, p) => acc + (Number(p.precio) || 0), 0);
      const descuentoTotalCombinado = productosCombinados.reduce((acc, p) => {
        const base = Number(p.precio) || 0;
        const desc = Number(p.descuento) || 0;
        return acc + Math.round(base * desc / 100);
      }, 0);
      const totalCombinado = subtotalCombinado - descuentoTotalCombinado;
      
      const nuevaObra = {
        tipo: "obra",
        numeroPedido,
        fecha: new Date().toISOString().split("T")[0],
        clienteId: obra.clienteId || obra.cliente?.id || null,
        cliente: obra.cliente || null,
        // PRODUCTOS: Solo productos del presupuesto original (productos de obra)
        productos: productosPresupuesto,
        // MATERIALES: Solo materiales adicionales seleccionados (productos normales)
        materialesCatalogo: materialesAdicionales,
        subtotal: subtotalCombinado,
        descuentoTotal: descuentoTotalCombinado,
        total: totalCombinado,
        descripcionGeneral: datosConversion.descripcionGeneral || descripcionGeneral || obra.descripcionGeneral || "",
        fechaCreacion: serverTimestamp(),
        estado: "pendiente_inicio",
        presupuestoInicialId: obra.id,
        prioridad: datosConversion.prioridad || "media",
        tipoObra: datosConversion.tipoObra || "",
        responsable: datosConversion.responsable || "",
        
        // Ubicación de la obra
        ubicacion: datosConversion.ubicacionTipo === "cliente" ? {
          direccion: obra.cliente?.direccion || "",
          localidad: obra.cliente?.localidad || "",
          provincia: obra.cliente?.provincia || ""
        } : {
          direccion: datosConversion.direccion || "",
          localidad: datosConversion.localidad || "",
          provincia: datosConversion.provincia || ""
        },
        
        // Información de envío si existe
        tipoEnvio: obra.tipoEnvio || null,
        costoEnvio: obra.costoEnvio || 0,
        direccionEnvio: obra.direccionEnvio || null,
        localidadEnvio: obra.localidadEnvio || null,
        transportista: obra.transportista || null,
        fechaEntrega: obra.fechaEntrega || null,
        rangoHorario: obra.rangoHorario || null,
        

        
        // Fechas (estructura obligatoria)
        fechas: {
          inicio: new Date().toISOString().split("T")[0],
          fin: new Date().toISOString().split("T")[0]
        },
        
        // Campos adicionales obligatorios
        gastoObraManual: 0,
        montoEstimado: null,
        productosDescuento: 0,
        productosDescuentoTotal: 0,
        productosSubtotal: 0,
        productosTotal: 0,
        
        // Auditoría
        fechaConversion: serverTimestamp(),
        presupuestoOriginal: {
          id: obra.id,
          numeroPedido: obra.numeroPedido,
          fechaCreacion: obra.fechaCreacion,
          total: obra.total
        }
      };

      console.log("Nueva obra a crear:", nuevaObra);

      const created = await addDoc(collection(db, "obras"), nuevaObra);
      
      // Crear registro de auditoría de conversión
      const auditoriaData = {
        accion: 'CONVERSION_PRESUPUESTO_A_OBRA',
        coleccion: 'obras',
        documentoId: created.id,
        presupuestoOriginalId: obra.id,
        datosPresupuesto: obra,
        datosObra: nuevaObra,
        usuarioId: user?.uid || 'sistema',
        usuarioEmail: user?.email || 'sistema@audit.com',
        fechaConversion: serverTimestamp(),
        tipo: 'conversion_presupuesto_obra'
      };

      await addDoc(collection(db, "auditoria"), auditoriaData);
      
      // Redirigir a la nueva obra
      window.location.href = `/obras/${created.id}`;
      
    } catch (error) {
      console.error("Error al convertir presupuesto a obra:", error);
      throw error;
    }
  };

  const guardarEdicion = async () => {
    if (!obra) return;
    
    const target = doc(db, "obras", obra.id);
    const documentacion = { links: (docLinks || []).filter(Boolean) };
    
    // Persistimos cobranza como ledger
    const movimientosSan = (movimientos || []).map((m) => ({
      fecha: m.fecha || "",
      tipo: m.tipo || "pago",
      metodo: m.metodo || "efectivo",
      monto: Number(m.monto) || 0,
      nota: m.nota || "",
    }));

    // Recalcular totales de materiales si es obra y estamos editando itemsCatalogo
    let materialesSanitizados = Array.isArray(itemsCatalogo) ? itemsCatalogo.map((p) => {
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
    }) : [];

    const productosSubtotalEdit = materialesSanitizados.reduce((acc, p) => {
      const esMadera = String(p.categoria || '').toLowerCase() === 'maderas';
      const isMachDeck = esMadera && (p.subcategoria === 'machimbre' || p.subcategoria === 'deck');
      const base = isMachDeck ? (Number(p.precio) || 0) : (Number(p.precio) || 0) * (Number(p.cantidad) || 0);
      return acc + base;
    }, 0);
    
    const productosDescuentoEdit = materialesSanitizados.reduce((acc, p) => {
      const esMadera = String(p.categoria || '').toLowerCase() === 'maderas';
      const isMachDeck = esMadera && (p.subcategoria === 'machimbre' || p.subcategoria === 'deck');
      const base = isMachDeck ? (Number(p.precio) || 0) : (Number(p.precio) || 0) * (Number(p.cantidad) || 0);
      return acc + Math.round(base * (Number(p.descuento) || 0) / 100);
    }, 0);

    const updateData = {
      documentacion,
      cobranzas: {
        historialPagos: movimientosSan,
        formaPago: movimientosSan.length > 0 ? movimientosSan[0].metodo : "efectivo",
      },
    };

    if (obra.tipo === "obra") {
      updateData.materialesCatalogo = materialesSanitizados;
      updateData.productosSubtotal = productosSubtotalEdit;
      updateData.productosDescuento = productosDescuentoEdit;
      updateData.productosTotal = productosSubtotalEdit - productosDescuentoEdit;
      updateData.gastoObraManual = Number(gastoObraManual) || 0;
      updateData.descripcionGeneral = descripcionGeneral;
      
      if (tipoObra) updateData.tipoObra = tipoObra;
      if (prioridad) updateData.prioridad = prioridad;
      if (estadoObra) updateData.estado = estadoObra;
      if (responsable) updateData.responsable = responsable;
      if (fechasEdit.inicio || fechasEdit.fin) updateData.fechas = fechasEdit;
      if (ubicacionEdit.direccion || ubicacionEdit.localidad || ubicacionEdit.provincia) {
        updateData.ubicacion = ubicacionEdit;
      }
      
      // Guardar información del cliente
      if (clienteId) updateData.clienteId = clienteId;
      if (cliente) updateData.cliente = cliente;
      updateData.usarDireccionCliente = usarDireccionCliente;
    } else if (obra.tipo === "presupuesto") {
      updateData.productos = itemsPresupuesto;
      updateData.subtotal = itemsPresupuesto.reduce((acc, p) => acc + (Number(p.precio) || 0), 0);
      updateData.descuentoTotal = itemsPresupuesto.reduce((acc, p) => {
        const base = Number(p.precio) || 0;
        const desc = Number(p.descuento) || 0;
        return acc + Math.round(base * desc / 100);
      }, 0);
      updateData.total = updateData.subtotal - updateData.descuentoTotal;
      updateData.descripcionGeneral = descripcionGeneral || "";
    }

    try {
      await updateDoc(target, updateData);
      setEditando(false);
      // Recargar la obra para reflejar cambios
      const obraDoc = await getDoc(doc(db, "obras", id));
      if (obraDoc.exists()) {
        setObra({ id: obraDoc.id, ...obraDoc.data() });
      }
    } catch (error) {
      console.error("Error al guardar:", error);
      alert("Error al guardar los cambios");
    }
  };

  return {
    // Estados
    obra,
    loading,
    error,
    presupuesto,
    editando,
    docLinks,
    movimientos,
    tipoObra,
    prioridad,
    estadoObra,
    responsable,
    responsables,
    fechasEdit,
    ubicacionEdit,
    clienteId,
    cliente,
    clientes,
    usarDireccionCliente,
    productosCatalogo,
    productosPorCategoria,
    categorias,
    categoriaId,
    busquedaProducto,
    busquedaDebounced,
    itemsCatalogo,
    isPendingCat,
    productosObraCatalogo,
    productosObraPorCategoria,
    categoriasObra,
    categoriaObraId,
    busquedaProductoObra,
    busquedaDebouncedObra,
    itemsPresupuesto,
    isPendingObra,
    gastoObraManual,
    presupuestosDisponibles,
    presupuestoSeleccionadoId,
    modoCosto,
    descripcionGeneral,
    catalogoCargado,
    
    // Setters
    setEditando,
    setDocLinks,
    setMovimientos,
    setTipoObra,
    setPrioridad,
    setEstadoObra,
    setResponsable,
    setFechasEdit,
    setUbicacionEdit,
    setClienteId,
    setCliente,
    setUsarDireccionCliente,
    setCategoriaId,
    setBusquedaProducto,
    setItemsCatalogo,
    setCategoriaObraId,
    setBusquedaProductoObra,
    setItemsPresupuesto,
    setGastoObraManual,
    setPresupuestoSeleccionadoId,
    setModoCosto,
    setDescripcionGeneral,
    
    // Funciones
    guardarEdicion,
    handleDesvincularPresupuesto,
    handleVincularPresupuesto,
    handleCrearPresupuestoDesdeAqui,
    getNextObraNumber,
    getNextPresupuestoNumber,
    convertirPresupuestoToObra,
    cargarCatalogoProductos,
  };
};
