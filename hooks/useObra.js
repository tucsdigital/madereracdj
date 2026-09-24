"use client";

import { useState, useEffect } from "react";

import { db } from "@/lib/firebase";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  addDoc,
  serverTimestamp,
} from "firebase/firestore";

import { useAuth } from "@/provider/auth.provider";

import { useRouter } from "next/navigation";

import {
  getNextObraNumber,
  getNextObraPresupuestoNumber,
} from "@/lib/obra-numbering";

const opcionActiva = (valor) =>
  valor === true || valor === 1 || valor === "1" || valor === "true";

const limitarDescuento = (valor) =>
  Math.min(100, Math.max(0, Number(valor) || 0));

const precioLineaPresupuesto = (producto = {}) => {
  const precio = Math.max(0, Number(producto.precio) || 0);
  const cantidad = Math.max(1, Number(producto.cantidad) || 1);

  return producto.precioIncluyeCantidad === false
    ? precio * cantidad
    : precio;
};

const sanitizarProductoPresupuesto = (producto = {}) => {
  const cantidad = Math.max(1, Number(producto.cantidad) || 1);
  const descuento = limitarDescuento(producto.descuento);
  const precio = precioLineaPresupuesto(producto);
  const largo = Number(producto.largo ?? producto.largoNum) || 0;

  return {
    ...producto,
    id: producto.id,
    originalId: producto.originalId || producto.id,
    nombre: producto.nombre || "",
    categoria: producto.categoria || "",
    subCategoria: producto.subCategoria || producto.subcategoria || "",
    subcategoria: producto.subcategoria || producto.subCategoria || "",
    unidad: producto.unidad || producto.unidadMedida || "UN",
    unidadMedida: producto.unidadMedida || producto.unidad || "UN",
    cantidad,
    descuento,
    precio,
    valorVenta: Number(producto.valorVenta) || 0,
    alto: Number(producto.alto) || 0,
    ancho: Number(producto.ancho) || 0,
    largo,
    largoNum: largo,
    descripcion: producto.descripcion || producto.description || "",
    precioIncluyeCantidad: true,
    subtotal: Math.round(precio * (1 - descuento / 100)),
  };
};

const calcularResumenProductosPresupuesto = (productos = []) => {
  const lista = Array.isArray(productos) ? productos : [];

  const subtotal = lista.reduce(
    (acumulado, producto) =>
      acumulado + precioLineaPresupuesto(producto),
    0
  );

  const descuentoTotal = lista.reduce(
    (acumulado, producto) =>
      acumulado +
      precioLineaPresupuesto(producto) *
        (limitarDescuento(producto.descuento) / 100),
    0
  );

  return {
    subtotal: Math.round(subtotal),
    descuentoTotal: Math.round(descuentoTotal),
    base: Math.max(0, Math.round(subtotal - descuentoTotal)),
  };
};

export const useObra = (id) => {
  const [obra, setObra] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [presupuesto, setPresupuesto] = useState(null);
  const [editando, setEditando] = useState(false);
  const [docLinks, setDocLinks] = useState([]);
  const [movimientos, setMovimientos] = useState([]);

  const [nombreObra, setNombreObra] = useState("");
  const [estadoObra, setEstadoObra] = useState("pendiente_inicio");

  const [fechasEdit, setFechasEdit] = useState({
    inicio: "",
    fin: "",
  });

  const [ubicacionEdit, setUbicacionEdit] = useState({
    direccion: "",
    localidad: "",
    provincia: "",
    barrio: "",
    area: "",
    lote: "",
  });

  const [clienteId, setClienteId] = useState("");
  const [cliente, setCliente] = useState(null);
  const [clientes, setClientes] = useState([]);
  const [usarDireccionCliente, setUsarDireccionCliente] = useState(true);

  const [productosCatalogo, setProductosCatalogo] = useState([]);
  const [productosPorCategoria, setProductosPorCategoria] = useState({});
  const [categorias, setCategorias] = useState([]);
  const [categoriaId, setCategoriaId] = useState("");
  const [busquedaProducto, setBusquedaProducto] = useState("");
  const [busquedaDebounced, setBusquedaDebounced] = useState("");
  const [itemsCatalogo, setItemsCatalogo] = useState([]);
  const [isPendingCat, setIsPendingCat] = useState(false);
  const [catalogoCargado, setCatalogoCargado] = useState(false);

  const [productosObraCatalogo, setProductosObraCatalogo] = useState([]);
  const [productosObraPorCategoria, setProductosObraPorCategoria] =
    useState({});
  const [categoriasObra, setCategoriasObra] = useState([]);
  const [categoriaObraId, setCategoriaObraId] = useState("");
  const [busquedaProductoObra, setBusquedaProductoObra] = useState("");
  const [busquedaDebouncedObra, setBusquedaDebouncedObra] =
    useState("");
  const [itemsPresupuesto, setItemsPresupuesto] = useState([]);
  const [isPendingObra, setIsPendingObra] = useState(false);

  const [gastoObraManual, setGastoObraManual] = useState(0);

  const [presupuestosDisponibles, setPresupuestosDisponibles] =
    useState([]);
  const [presupuestoSeleccionadoId, setPresupuestoSeleccionadoId] =
    useState("");

  const [
    presupuestoBloqueSeleccionadoId,
    setPresupuestoBloqueSeleccionadoId,
  ] = useState("");

  const [modoCosto, setModoCosto] = useState("gasto");
  const [descripcionGeneral, setDescripcionGeneral] = useState("");

  const getNextPresupuestoNumber = getNextObraPresupuestoNumber;

  useEffect(() => {
    const fetchClientes = async () => {
      try {
        const snapClientes = await getDocs(collection(db, "clientes"));

        setClientes(
          snapClientes.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }))
        );
      } catch (error) {
        console.error("Error al cargar clientes:", error);
      }
    };

    fetchClientes();
  }, []);

  useEffect(() => {
    const fetchObra = async () => {
      try {
        setLoading(true);

        const obraDoc = await getDoc(doc(db, "obras", id));

        if (obraDoc.exists()) {
          const data = {
            id: obraDoc.id,
            ...obraDoc.data(),
          };

          setObra(data);

          setDescripcionGeneral(data.descripcionGeneral || "");

          if (data.tipo === "obra") {
            setEstadoObra(data.estado || "pendiente_inicio");

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
              barrio: u.barrio || "",
              area: u.area || "",
              lote: u.lote || "",
            });

            setClienteId(data.clienteId || data.cliente?.id || "");
            setCliente(data.cliente || null);
            setUsarDireccionCliente(data.usarDireccionCliente !== false);

            setItemsCatalogo(
              Array.isArray(data.materialesCatalogo)
                ? data.materialesCatalogo
                : []
            );

            setGastoObraManual(Number(data.gastoObraManual) || 0);

            setModoCosto(
              data.presupuestoInicialId ? "presupuesto" : "gasto"
            );

            setItemsPresupuesto(
              Array.isArray(data.productos) ? data.productos : []
            );

            setPresupuestoBloqueSeleccionadoId(
              data.presupuestoInicialBloqueId || ""
            );
          } else if (data.tipo === "presupuesto") {
            setEstadoObra(data.estado || "Activo");
            setClienteId(data.clienteId || data.cliente?.id || "");
            setCliente(data.cliente || null);
            setUsarDireccionCliente(data.usarDireccionCliente !== false);

            setItemsPresupuesto(
              Array.isArray(data.productos) ? data.productos : []
            );

            setDescripcionGeneral(data.descripcionGeneral || "");
          }

          if (data.presupuestoInicialId) {
            const presSnap = await getDoc(
              doc(db, "obras", data.presupuestoInicialId)
            );

            if (presSnap.exists()) {
              setPresupuesto({
                id: presSnap.id,
                ...presSnap.data(),
              });
            }
          }

          const d = data.documentacion || {};
          setDocLinks(Array.isArray(d.links) ? d.links : []);

          const c = data.cobranzas || {};
          const inicial = [];

          const forma = c.formaPago || "efectivo";
          const sen = Number(c.senia) || 0;
          const mon = Number(c.monto) || 0;

          if (sen > 0) {
            inicial.push({
              fecha: c.fechaSenia || "",
              tipo: "seña",
              metodo: forma,
              monto: sen,
              nota: "Seña",
            });
          }

          if (mon > 0) {
            inicial.push({
              fecha: c.fechaMonto || "",
              tipo: "pago",
              metodo: forma,
              monto: mon,
              nota: "Pago",
            });
          }

          const hist = Array.isArray(c.historialPagos)
            ? c.historialPagos
            : [];

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

  useEffect(() => {
    if (!obra || cliente || !clienteId || clientes.length === 0)
      return;

    const clienteEncontrado = clientes.find(
      (item) => String(item.id) === String(clienteId)
    );

    if (clienteEncontrado) {
      setCliente(clienteEncontrado);
    }
  }, [obra, cliente, clienteId, clientes]);

  useEffect(() => {
    if (!presupuesto) return;

    if (obra?.tipo === "presupuesto") {
      const prods = Array.isArray(presupuesto.productos)
        ? presupuesto.productos
        : [];

      setItemsPresupuesto(prods);
      setDescripcionGeneral(presupuesto.descripcionGeneral || "");
    }
  }, [presupuesto, obra?.tipo]);

  useEffect(() => {
    try {
      if (!obra || obra.tipo !== "obra") return;

      if (
        !obra.presupuestoInicialId ||
        !obra.presupuestoInicialBloqueId
      ) {
        return;
      }

      const tieneProductos =
        Array.isArray(obra.productos) && obra.productos.length > 0;

      if (tieneProductos) return;

      if (!presupuesto || !Array.isArray(presupuesto.bloques)) {
        return;
      }

      const existeBloque = presupuesto.bloques.some(
        (b) =>
          String(b.id) ===
          String(obra.presupuestoInicialBloqueId)
      );

      if (!existeBloque) return;

      cambiarBloquePresupuesto(
        obra.presupuestoInicialBloqueId
      );
    } catch (e) {
      console.error(
        "Auto-hidratación de productos del bloque falló:",
        e
      );
    }
  }, [
    obra?.id,
    obra?.tipo,
    obra?.presupuestoInicialBloqueId,
    obra?.productos?.length,
    presupuesto,
  ]);

  useEffect(() => {
    const t = setTimeout(
      () => setBusquedaDebounced(busquedaProducto),
      150
    );

    return () => clearTimeout(t);
  }, [busquedaProducto]);

  useEffect(() => {
    const t = setTimeout(
      () => setBusquedaDebouncedObra(busquedaProductoObra),
      150
    );

    return () => clearTimeout(t);
  }, [busquedaProductoObra]);

  useEffect(() => {
    async function cargarCatalogos() {
      if (!editando) return;

      if (productosCatalogo.length === 0) {
        const snap = await getDocs(collection(db, "productos"));

        const prods = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));

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

      if (productosObraCatalogo.length === 0) {
        const snap2 = await getDocs(
          collection(db, "productos_obras")
        );

        const prods2 = snap2.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));

        setProductosObraCatalogo(prods2);

        const agrup2 = {};

        prods2.forEach((p) => {
          const cat = p.categoria || "Sin categoría";
          (agrup2[cat] = agrup2[cat] || []).push(p);
        });

        setProductosObraPorCategoria(agrup2);
        setCategoriasObra(Object.keys(agrup2));
      }

      const snapObras = await getDocs(collection(db, "obras"));

      const lista = snapObras.docs
        .map((d) => ({
          id: d.id,
          ...d.data(),
        }))
        .filter((x) => x.tipo === "presupuesto");

      setPresupuestosDisponibles(lista);
    }

    cargarCatalogos();
  }, [editando]);

  const cargarCatalogoProductos = async () => {
    if (catalogoCargado) return;

    try {
      const snap = await getDocs(collection(db, "productos"));

      const prods = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));

      setProductosCatalogo(prods);

      const agrup = {};

      prods.forEach((p) => {
        const cat = p.categoria || "Sin categoría";

        if (!agrup[cat]) {
          agrup[cat] = [];
        }

        agrup[cat].push(p);
      });

      setProductosPorCategoria(agrup);
      setCategorias(Object.keys(agrup));
      setCatalogoCargado(true);
    } catch (error) {
      console.error(
        "Error al cargar catálogo de productos:",
        error
      );

      setCatalogoCargado(false);
    }
  };

  const handleDesvincularPresupuesto = async () => {
    if (!obra) return;

    await updateDoc(doc(db, "obras", obra.id), {
      presupuestoInicialId: null,
    });

    setPresupuesto(null);

    setObra((prev) =>
      prev
        ? {
            ...prev,
            presupuestoInicialId: null,
          }
        : prev
    );
  };

  const handleVincularPresupuesto = async () => {
    if (!obra || !presupuestoSeleccionadoId) return;

    await updateDoc(doc(db, "obras", obra.id), {
      presupuestoInicialId: presupuestoSeleccionadoId,
    });

    const presSnap = await getDoc(
      doc(db, "obras", presupuestoSeleccionadoId)
    );

    if (presSnap.exists()) {
      setPresupuesto({
        id: presSnap.id,
        ...presSnap.data(),
      });
    }

    setObra((prev) =>
      prev
        ? {
            ...prev,
            presupuestoInicialId: presupuestoSeleccionadoId,
          }
        : prev
    );
  };

  const handleCrearPresupuestoDesdeAqui = async () => {
    if (!obra) return;

    const numeroPedido =
      await getNextObraPresupuestoNumber();

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

    const created = await addDoc(
      collection(db, "obras"),
      nuevo
    );

    await updateDoc(doc(db, "obras", obra.id), {
      presupuestoInicialId: created.id,
    });

    const presSnap = await getDoc(
      doc(db, "obras", created.id)
    );

    if (presSnap.exists()) {
      setPresupuesto({
        id: presSnap.id,
        ...presSnap.data(),
      });
    }

    setObra((prev) =>
      prev
        ? {
            ...prev,
            presupuestoInicialId: created.id,
          }
        : prev
    );

    setPresupuestosDisponibles((prev) => [
      {
        id: created.id,
        ...nuevo,
      },
      ...prev,
    ]);
  };

  const convertirPresupuestoToObra = async (
    datosConversion = {},
    user = null
  ) => {
    if (!obra || obra.tipo !== "presupuesto") return;

    try {
      const numeroPedido = await getNextObraNumber();

      const sanitizarProductos = (lista) =>
        (Array.isArray(lista) ? lista : []).map((p) => {
          const esMadera =
            String(p.categoria || "").toLowerCase() ===
            "maderas";

          const isMachDeck =
            esMadera &&
            (p.subcategoria === "machimbre" ||
              p.subcategoria === "deck");

          const precio = Number(p.precio) || 0;
          const cantidad = Number(p.cantidad) || 1;
          const descuento = Number(p.descuento) || 0;

          const base = isMachDeck
            ? precio
            : precio * cantidad;

          const subtotal = Math.round(
            base * (1 - descuento / 100)
          );

          const item = {
            id: p.id,
            nombre: p.nombre || "",
            categoria: p.categoria || "",
            subcategoria: p.subcategoria || "",
            unidad: p.unidad || p.unidadMedida || "",
            unidadMedida:
              p.unidadMedida || p.unidad || "",
            cantidad,
            descuento,
            precio,
            subtotal,
          };

          if (p.alto !== undefined) {
            item.alto = Number(p.alto) || 0;
          }

          if (p.ancho !== undefined) {
            item.ancho = Number(p.ancho) || 0;
          }

          if (p.largo !== undefined) {
            item.largo = Number(p.largo) || 0;
          }

          if (p.precioPorPie !== undefined) {
            item.precioPorPie =
              Number(p.precioPorPie) || 0;
          }

          if (p.cepilladoAplicado !== undefined) {
            item.cepilladoAplicado =
              !!p.cepilladoAplicado;
          }

          return item;
        });

      const calcularSubtotal = (lista) =>
        (Array.isArray(lista) ? lista : []).reduce(
          (acc, p) => {
            const esMadera =
              String(p.categoria || "").toLowerCase() ===
              "maderas";

            const isMachDeck =
              esMadera &&
              (p.subcategoria === "machimbre" ||
                p.subcategoria === "deck");

            const precio = Number(p.precio) || 0;
            const cantidad = Number(p.cantidad) || 1;

            const base = isMachDeck
              ? precio
              : precio * cantidad;

            return acc + base;
          },
          0
        );

      const calcularDescuento = (lista) =>
        (Array.isArray(lista) ? lista : []).reduce(
          (acc, p) => {
            const esMadera =
              String(p.categoria || "").toLowerCase() ===
              "maderas";

            const isMachDeck =
              esMadera &&
              (p.subcategoria === "machimbre" ||
                p.subcategoria === "deck");

            const precio = Number(p.precio) || 0;
            const cantidad = Number(p.cantidad) || 1;

            const base = isMachDeck
              ? precio
              : precio * cantidad;

            const desc = Number(p.descuento) || 0;

            return (
              acc +
              Math.round((base * desc) / 100)
            );
          },
          0
        );

      let productosObraSanitizados = [];
      let bloqueSeleccionadoNombre = null;

      if (
        obra.bloques &&
        obra.bloques.length > 0 &&
        datosConversion.bloqueSeleccionado
      ) {
        const bloqueSeleccionado = obra.bloques.find(
          (b) =>
            String(b.id) ===
            String(datosConversion.bloqueSeleccionado)
        );

        if (bloqueSeleccionado) {
          productosObraSanitizados =
            sanitizarProductos(
              bloqueSeleccionado.productos || []
            );

          bloqueSeleccionadoNombre =
            bloqueSeleccionado.nombre || null;
        }
      } else {
        productosObraSanitizados =
          sanitizarProductos(itemsPresupuesto || []);
      }

      const materialesAdicionalesRaw =
        datosConversion.materialesAdicionales || [];

      const materialesSanitizados =
        sanitizarProductos(materialesAdicionalesRaw);

      const productosObraSubtotal =
        calcularSubtotal(productosObraSanitizados);

      const productosObraDescuento =
        calcularDescuento(productosObraSanitizados);

      const materialesSubtotal =
        calcularSubtotal(materialesSanitizados);

      const materialesDescuento =
        calcularDescuento(materialesSanitizados);

      const subtotalCombinado =
        productosObraSubtotal + materialesSubtotal;

      const descuentoTotalCombinado =
        productosObraDescuento + materialesDescuento;

      const totalCombinado =
        subtotalCombinado - descuentoTotalCombinado;

      const nuevaObra = {
        tipo: "obra",
        numeroPedido,
        fecha: new Date().toISOString().split("T")[0],
        clienteId:
          obra.clienteId || obra.cliente?.id || null,
        cliente: obra.cliente || null,

        productos: productosObraSanitizados,
        materialesCatalogo: materialesSanitizados,

        subtotal: subtotalCombinado,
        descuentoTotal: descuentoTotalCombinado,
        total: totalCombinado,

        descripcionGeneral:
          datosConversion.descripcionGeneral ||
          descripcionGeneral ||
          obra.descripcionGeneral ||
          "",

        fechaCreacion: new Date().toISOString(),
        estado: "pendiente_inicio",

        presupuestoInicialId: obra.id,

        presupuestoInicialBloqueId:
          datosConversion.bloqueSeleccionado || null,

        presupuestoInicialBloqueNombre:
          bloqueSeleccionadoNombre,

        ubicacion:
          datosConversion.ubicacionTipo === "cliente"
            ? {
                direccion:
                  obra.cliente?.direccion || "",
                localidad:
                  obra.cliente?.localidad || "",
                provincia:
                  obra.cliente?.provincia || "",
                barrio: obra.cliente?.barrio || "",
                area: obra.cliente?.area || "",
                lote: obra.cliente?.lote || "",
              }
            : {
                direccion:
                  datosConversion.direccion || "",
                localidad:
                  datosConversion.localidad || "",
                provincia:
                  datosConversion.provincia || "",
                barrio:
                  datosConversion.barrio || "",
                area: datosConversion.area || "",
                lote: datosConversion.lote || "",
              },

        tipoEnvio: obra.tipoEnvio || null,
        costoEnvio: obra.costoEnvio || 0,
        direccionEnvio: obra.direccionEnvio || null,
        localidadEnvio: obra.localidadEnvio || null,
        transportista: obra.transportista || null,
        fechaEntrega: obra.fechaEntrega || null,
        rangoHorario: obra.rangoHorario || null,

        fechas: {
          inicio: new Date()
            .toISOString()
            .split("T")[0],
          fin: new Date()
            .toISOString()
            .split("T")[0],
        },

        gastoObraManual: 0,

        materialesSubtotal,
        materialesDescuento,
        materialesTotal:
          materialesSubtotal - materialesDescuento,

        productosSubtotal: materialesSubtotal,
        productosDescuento: materialesDescuento,
        productosTotal:
          materialesSubtotal - materialesDescuento,
      };

      const created = await addDoc(
        collection(db, "obras"),
        nuevaObra
      );

      const auditoriaData = {
        accion: "CONVERSION_PRESUPUESTO_A_OBRA",
        coleccion: "obras",
        documentoId: created.id,
        presupuestoOriginalId: obra.id,
        datosPresupuesto: obra,
        datosObra: nuevaObra,
        usuarioId: user?.uid || "sistema",
        usuarioEmail:
          user?.email || "sistema@audit.com",
        fechaConversion: serverTimestamp(),
        tipo: "conversion_presupuesto_obra",
      };

      await addDoc(
        collection(db, "auditoria"),
        auditoriaData
      );

      window.location.href = `/obras/${created.id}`;
    } catch (error) {
      console.error(
        "Error al convertir presupuesto a obra:",
        error
      );

      throw error;
    }
  };

  const guardarEdicion = async (opciones = {}) => {
    if (!obra) return;

    const target = doc(db, "obras", obra.id);

    const documentacion = {
      links: (docLinks || []).filter(Boolean),
    };

    const movimientosSan = (movimientos || []).map(
      (m) => ({
        fecha: m.fecha || "",
        tipo: m.tipo || "pago",
        metodo: m.metodo || "efectivo",
        monto: Number(m.monto) || 0,
        nota: m.nota || "",
      })
    );

    const materialesSanitizados = Array.isArray(
      itemsCatalogo
    )
      ? itemsCatalogo.map((p) => {
          const esMadera =
            String(p.categoria || "").toLowerCase() ===
            "maderas";

          const isMachDeck =
            esMadera &&
            (p.subcategoria === "machimbre" ||
              p.subcategoria === "deck");

          const precio = Number(p.precio) || 0;
          const cantidad = Number(p.cantidad) || 1;
          const descuento = Number(p.descuento) || 0;

          const base = isMachDeck
            ? precio
            : precio * cantidad;

          const subtotal = Math.round(
            base * (1 - descuento / 100)
          );

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
            item.precioPorPie =
              Number(p.precioPorPie) || 0;
            item.cepilladoAplicado =
              !!p.cepilladoAplicado;
          }

          return item;
        })
      : [];

    const productosSubtotalEdit =
      materialesSanitizados.reduce((acc, p) => {
        const esMadera =
          String(p.categoria || "").toLowerCase() ===
          "maderas";

        const isMachDeck =
          esMadera &&
          (p.subcategoria === "machimbre" ||
            p.subcategoria === "deck");

        const base = isMachDeck
          ? Number(p.precio) || 0
          : (Number(p.precio) || 0) *
            (Number(p.cantidad) || 0);

        return acc + base;
      }, 0);

    const productosDescuentoEdit =
      materialesSanitizados.reduce((acc, p) => {
        const esMadera =
          String(p.categoria || "").toLowerCase() ===
          "maderas";

        const isMachDeck =
          esMadera &&
          (p.subcategoria === "machimbre" ||
            p.subcategoria === "deck");

        const base = isMachDeck
          ? Number(p.precio) || 0
          : (Number(p.precio) || 0) *
            (Number(p.cantidad) || 0);

        return (
          acc +
          Math.round(
            (base * (Number(p.descuento) || 0)) /
              100
          )
        );
      }, 0);

    const productosObraSanitizados =
      Array.isArray(itemsPresupuesto)
        ? itemsPresupuesto.map(
            sanitizarProductoPresupuesto
          )
        : [];

    const resumenProductosObra =
      calcularResumenProductosPresupuesto(
        productosObraSanitizados
      );

    const productosObraSubtotal =
      resumenProductosObra.subtotal;

    const productosObraDescuento =
      resumenProductosObra.descuentoTotal;

    const updateData = {
      documentacion,

      cobranzas: {
        historialPagos: movimientosSan,
      },

      pagoEnDolares: !!opciones.pagoEnDolares,

      valorOficialDolar: opciones.pagoEnDolares
        ? opciones.valorOficialDolar ?? null
        : null,

      comprobantesPago: Array.isArray(
        opciones.comprobantesPago
      )
        ? opciones.comprobantesPago
        : [],

      notasObra: Array.isArray(opciones.notasObra)
        ? opciones.notasObra
        : [],

      fechaModificacion: new Date().toISOString(),
    };

    if (obra.tipo === "obra") {
      updateData.materialesCatalogo =
        materialesSanitizados;

      updateData.materialesSubtotal =
        productosSubtotalEdit;

      updateData.materialesDescuento =
        productosDescuentoEdit;

      updateData.materialesTotal =
        productosSubtotalEdit -
        productosDescuentoEdit;

      updateData.productosSubtotal =
        productosSubtotalEdit;

      updateData.productosDescuento =
        productosDescuentoEdit;

      updateData.productosTotal =
        productosSubtotalEdit -
        productosDescuentoEdit;

      updateData.gastoObraManual =
        Number(gastoObraManual) || 0;

      updateData.descripcionGeneral =
        descripcionGeneral;

      updateData.productos =
        productosObraSanitizados;

      const subtotalCombinado =
        productosObraSubtotal +
        productosSubtotalEdit;

      const descuentoCombinado =
        productosObraDescuento +
        productosDescuentoEdit;

      const descuentoEfectivoObra = Math.max(
        0,
        Number(obra?.descuentoEfectivo) || 0
      );

      const baseCombinada = Math.max(
        0,
        subtotalCombinado -
          descuentoCombinado -
          descuentoEfectivoObra
      );

      const aplicaIvaObra = opcionActiva(
        opciones.aplicarIva ??
          obra?.aplicarIva ??
          obra?.aplicaIva
      );

      const ivaPctObra = Math.max(
        0,
        Number(
          opciones.ivaPorcentaje ??
            obra?.ivaPorcentaje
        ) || 0
      );

      const ivaMontoObra = aplicaIvaObra
        ? Math.round(
            baseCombinada * (ivaPctObra / 100)
          )
        : 0;

      const aplicaTransfObra = opcionActiva(
        opciones.aplicarTransferencia ??
          obra?.aplicarTransferencia ??
          obra?.aplicaTransferencia
      );

      const transfPctObra = Math.max(
        0,
        Number(
          opciones.transferenciaPorcentaje ??
            obra?.transferenciaPorcentaje
        ) || 0
      );

      const transfMontoObra = aplicaTransfObra
        ? Math.round(
            baseCombinada *
              (transfPctObra / 100)
          )
        : 0;

      updateData.subtotal = subtotalCombinado;
      updateData.descuentoTotal =
        descuentoCombinado;
      updateData.descuentoEfectivo =
        descuentoEfectivoObra;

      updateData.aplicarIva = aplicaIvaObra;
      updateData.ivaPorcentaje = ivaPctObra;
      updateData.ivaMonto = ivaMontoObra;

      updateData.aplicarTransferencia =
        aplicaTransfObra;

      updateData.transferenciaPorcentaje =
        transfPctObra;

      updateData.transferenciaMonto =
        transfMontoObra;

      updateData.total = Math.round(
        baseCombinada +
          ivaMontoObra +
          transfMontoObra
      );

      const bloqueIdGuardar =
        presupuestoBloqueSeleccionadoId ||
        obra.presupuestoInicialBloqueId ||
        "";

      updateData.presupuestoInicialBloqueId =
        bloqueIdGuardar || null;

      const bloqueSeleccionadoGuardar =
        Array.isArray(presupuesto?.bloques)
          ? presupuesto.bloques.find(
              (bloque) =>
                String(bloque.id) ===
                String(bloqueIdGuardar)
            )
          : null;

      updateData.presupuestoInicialBloqueNombre =
        bloqueSeleccionadoGuardar?.nombre ||
        obra.presupuestoInicialBloqueNombre ||
        null;

      if (estadoObra) {
        updateData.estado = estadoObra;
      }

      if (fechasEdit.inicio || fechasEdit.fin) {
        updateData.fechas = fechasEdit;
      }

      if (
        ubicacionEdit.direccion ||
        ubicacionEdit.localidad ||
        ubicacionEdit.provincia ||
        ubicacionEdit.barrio ||
        ubicacionEdit.area ||
        ubicacionEdit.lote
      ) {
        updateData.ubicacion = ubicacionEdit;
      }

      if (clienteId) {
        updateData.clienteId = clienteId;
      }

      if (cliente) {
        updateData.cliente = cliente;
      }

      updateData.usarDireccionCliente =
        usarDireccionCliente;
    } else if (obra.tipo === "presupuesto") {
      updateData.productos = itemsPresupuesto;

      updateData.subtotal =
        itemsPresupuesto.reduce(
          (acc, p) =>
            acc + (Number(p.precio) || 0),
          0
        );

      updateData.descuentoTotal =
        itemsPresupuesto.reduce((acc, p) => {
          const base = Number(p.precio) || 0;
          const desc = Number(p.descuento) || 0;

          return (
            acc +
            Math.round((base * desc) / 100)
          );
        }, 0);

      updateData.total =
        updateData.subtotal -
        updateData.descuentoTotal;

      updateData.descripcionGeneral =
        descripcionGeneral || "";
    }

    try {
      await updateDoc(target, updateData);

      // IMPORTANTE:
      // La obra mantiene una copia independiente del bloque.
      // No se reescribe automáticamente el presupuesto original.
      //
      // Esto evita que una edición de obra altere bloques,
      // precios, productos o descuentos del presupuesto comercial.

      setEditando(false);

      const obraDoc = await getDoc(
        doc(db, "obras", id)
      );

      if (obraDoc.exists()) {
        const obraActualizada = {
          id: obraDoc.id,
          ...obraDoc.data(),
        };

        setObra(obraActualizada);

        setItemsCatalogo(
          Array.isArray(
            obraActualizada.materialesCatalogo
          )
            ? obraActualizada.materialesCatalogo
            : []
        );

        setItemsPresupuesto(
          Array.isArray(obraActualizada.productos)
            ? obraActualizada.productos
            : []
        );

        setPresupuestoBloqueSeleccionadoId(
          obraActualizada.presupuestoInicialBloqueId ||
            ""
        );

        setDescripcionGeneral(
          obraActualizada.descripcionGeneral || ""
        );

        setEstadoObra(
          obraActualizada.estado ||
            "pendiente_inicio"
        );

        setFechasEdit({
          inicio:
            obraActualizada.fechas?.inicio || "",
          fin: obraActualizada.fechas?.fin || "",
        });
      }

      return true;
    } catch (error) {
      console.error("Error al guardar:", error);
      throw error;
    }
  };

  // El cambio de bloque es únicamente local.
  // Firestore se actualiza cuando se guarda la obra.
  const cambiarBloquePresupuesto = (bloqueId) => {
    if (
      !presupuesto ||
      !Array.isArray(presupuesto.bloques)
    ) {
      return null;
    }

    const bloque = presupuesto.bloques.find(
      (item) =>
        String(item.id) === String(bloqueId)
    );

    if (!bloque) return null;

    const productos = Array.isArray(
      bloque.productos
    )
      ? bloque.productos.map(
          sanitizarProductoPresupuesto
        )
      : [];

    const resumen =
      calcularResumenProductosPresupuesto(
        productos
      );

    const aplicarIvaBloque = opcionActiva(
      bloque.aplicarIva ?? bloque.aplicaIva
    );

    const ivaPorcentajeBloque = Math.max(
      0,
      Number(bloque.ivaPorcentaje) || 0
    );

    const aplicarTransferenciaBloque =
      opcionActiva(
        bloque.aplicarTransferencia ??
          bloque.aplicaTransferencia
      );

    const transferenciaPorcentajeBloque =
      Math.max(
        0,
        Number(
          bloque.transferenciaPorcentaje
        ) || 0
      );

    const ivaMontoBloque = aplicarIvaBloque
      ? Math.round(
          resumen.base *
            (ivaPorcentajeBloque / 100)
        )
      : 0;

    const transferenciaMontoBloque =
      aplicarTransferenciaBloque
        ? Math.round(
            resumen.base *
              (transferenciaPorcentajeBloque /
                100)
          )
        : 0;

    setPresupuestoBloqueSeleccionadoId(
      String(bloque.id)
    );

    setItemsPresupuesto(productos);

    if (
      typeof bloque.descripcion === "string" &&
      bloque.descripcion.trim()
    ) {
      setDescripcionGeneral(
        bloque.descripcion
      );
    }

    return {
      bloque,
      productos,
      resumen,

      aplicarIva: aplicarIvaBloque,
      ivaPorcentaje: ivaPorcentajeBloque,
      ivaMonto: ivaMontoBloque,

      aplicarTransferencia:
        aplicarTransferenciaBloque,

      transferenciaPorcentaje:
        transferenciaPorcentajeBloque,

      transferenciaMonto:
        transferenciaMontoBloque,

      total: Math.round(
        resumen.base +
          ivaMontoBloque +
          transferenciaMontoBloque
      ),
    };
  };

  const cancelarEdicion = () => {
    if (!obra) return;

    setItemsCatalogo(
      Array.isArray(obra.materialesCatalogo)
        ? obra.materialesCatalogo
        : []
    );

    setItemsPresupuesto(
      Array.isArray(obra.productos)
        ? obra.productos
        : []
    );

    setPresupuestoBloqueSeleccionadoId(
      obra.presupuestoInicialBloqueId || ""
    );

    setDescripcionGeneral(
      obra.descripcionGeneral || ""
    );

    setEstadoObra(
      obra.estado || "pendiente_inicio"
    );

    setFechasEdit({
      inicio: obra.fechas?.inicio || "",
      fin: obra.fechas?.fin || "",
    });

    setUbicacionEdit({
      direccion:
        obra.ubicacion?.direccion || "",
      localidad:
        obra.ubicacion?.localidad || "",
      provincia:
        obra.ubicacion?.provincia || "",
      barrio: obra.ubicacion?.barrio || "",
      area: obra.ubicacion?.area || "",
      lote: obra.ubicacion?.lote || "",
    });

    setClienteId(
      obra.clienteId || obra.cliente?.id || ""
    );

    setCliente(obra.cliente || null);

    setUsarDireccionCliente(
      obra.usarDireccionCliente !== false
    );

    setGastoObraManual(
      Number(obra.gastoObraManual) || 0
    );

    setModoCosto(
      obra.presupuestoInicialId
        ? "presupuesto"
        : "gasto"
    );

    setEditando(false);
  };

  return {
    obra,
    loading,
    error,
    presupuesto,
    editando,
    docLinks,
    movimientos,
    estadoObra,
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
    presupuestoBloqueSeleccionadoId,
    modoCosto,
    descripcionGeneral,
    catalogoCargado,

    setObra,
    setEditando,
    setDocLinks,
    setMovimientos,
    setEstadoObra,
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
    setPresupuestoBloqueSeleccionadoId,
    setModoCosto,
    setDescripcionGeneral,

    guardarEdicion,
    handleDesvincularPresupuesto,
    handleVincularPresupuesto,
    handleCrearPresupuestoDesdeAqui,
    getNextObraNumber,
    getNextPresupuestoNumber,
    convertirPresupuestoToObra,
    cargarCatalogoProductos,
    cambiarBloquePresupuesto,
    cancelarEdicion,
  };
};