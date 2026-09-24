"use client";
import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Icon } from "@iconify/react";
import {
  Plus,
  Trash2,
  Search,
  Filter,
  Edit3,
  Check,
  X
} from "lucide-react";
import { db } from "@/lib/firebase";
import { doc, updateDoc, collection, getDocs, query, where } from "firebase/firestore";
import { detalleMedidaProducto } from "@/lib/obra-utils";

const capitalizarInicial = (value, fallback = "") => {
  const texto = String(value || fallback).trim();
  return texto.replace(
    /^[a-záéíóúüñ]/i,
    (letra) => letra.toLocaleUpperCase("es-AR")
  );
};

const normalizarPorcentaje = (value, fallback) => {
  if (value === null || value === undefined || value === "") return fallback;
  const numero = Number(String(value).replace(",", "."));
  return Number.isFinite(numero) ? Math.max(0, numero) : fallback;
};

const opcionActiva = (value) =>
  value === true || value === 1 || value === "1" || value === "true";

const normalizarProductoBloque = (producto = {}) => {
  const unidadMedida = String(
    producto.unidadMedida || producto.unidad || "UN"
  ).toUpperCase();
  const cantidad = Math.max(1, Number(producto.cantidad) || 1);
  const alto = Number(producto.alto ?? producto.ancho) || 0;
  const largo = Number(producto.largo ?? producto.largoNum) || 0;
  const precioGuardado = Math.max(0, Number(producto.precio) || 0);
  const divisor =
    unidadMedida === "M2"
      ? alto * largo * cantidad
      : unidadMedida === "ML"
        ? largo * cantidad
        : cantidad;
  const valorVentaGuardado = Number(producto.valorVenta);
  const valorVenta =
    Number.isFinite(valorVentaGuardado) && valorVentaGuardado >= 0
      ? valorVentaGuardado
      : divisor > 0
        ? precioGuardado / divisor
        : precioGuardado;

  return {
    ...producto,
    unidadMedida,
    cantidad,
    alto,
    largo,
    largoNum: largo,
    valorVenta: Math.round(valorVenta * 100) / 100,
    precio:
      precioGuardado > 0
        ? precioGuardado
        : Math.round(Math.max(0, valorVenta) * Math.max(1, divisor)),
  };
};

const normalizarBloque = (bloque = {}, obra = {}) => {
  const productosRaw = Array.isArray(bloque.productos)
    ? bloque.productos
    : Array.isArray(bloque.items)
      ? bloque.items
      : [];
  const productos = productosRaw.map(normalizarProductoBloque);
  const aplicaIvaBloque = bloque.aplicarIva ?? bloque.aplicaIva;
  const aplicaTransferenciaBloque =
    bloque.aplicarTransferencia ?? bloque.aplicaTransferencia;

  return {
    ...bloque,
    productos,
    aplicarIva:
      aplicaIvaBloque === undefined
        ? opcionActiva(obra.aplicarIva ?? obra.aplicaIva)
        : opcionActiva(aplicaIvaBloque),
    ivaPorcentaje: normalizarPorcentaje(
      bloque.ivaPorcentaje,
      normalizarPorcentaje(obra.ivaPorcentaje, 21)
    ),
    aplicarTransferencia:
      aplicaTransferenciaBloque === undefined
        ? opcionActiva(obra.aplicarTransferencia ?? obra.aplicaTransferencia)
        : opcionActiva(aplicaTransferenciaBloque),
    transferenciaPorcentaje: normalizarPorcentaje(
      bloque.transferenciaPorcentaje,
      normalizarPorcentaje(obra.transferenciaPorcentaje, 10)
    ),
  };
};

const calcularTotalesBloque = (bloque = {}, pagoEnEfectivo = false) => {
  const productos = Array.isArray(bloque.productos) ? bloque.productos : [];
  const subtotal = productos.reduce(
    (acc, producto) => acc + (Number(producto.precio) || 0),
    0
  );
  const descuentoTotal = productos.reduce(
    (acc, producto) =>
      acc +
      (Number(producto.precio) || 0) *
        (Math.min(100, Math.max(0, Number(producto.descuento) || 0)) / 100),
    0
  );
  const descuentoEfectivo = pagoEnEfectivo ? subtotal * 0.1 : 0;
  const base = Math.max(0, subtotal - descuentoTotal - descuentoEfectivo);
  const aplicarIva = opcionActiva(bloque.aplicarIva ?? bloque.aplicaIva);
  const ivaPorcentaje = normalizarPorcentaje(bloque.ivaPorcentaje, 21);
  const ivaMonto = aplicarIva ? Math.round(base * (ivaPorcentaje / 100)) : 0;
  const aplicarTransferencia = opcionActiva(
    bloque.aplicarTransferencia ?? bloque.aplicaTransferencia
  );
  const transferenciaPorcentaje = normalizarPorcentaje(
    bloque.transferenciaPorcentaje,
    10
  );
  const transferenciaMonto = aplicarTransferencia
    ? Math.round(base * (transferenciaPorcentaje / 100))
    : 0;

  return {
    subtotal: Math.round(subtotal),
    descuentoTotal: Math.round(descuentoTotal),
    descuentoEfectivo: Math.round(descuentoEfectivo),
    base: Math.round(base),
    aplicarIva,
    ivaPorcentaje,
    ivaMonto,
    aplicarTransferencia,
    transferenciaPorcentaje,
    transferenciaMonto,
    total: Math.round(base + ivaMonto + transferenciaMonto),
  };
};

const PresupuestoDetalle = ({
  obra,
  editando,
  formatearNumeroArgentino,
  onObraUpdate,
  onGuardarRef,
}) => {
  // Estados para bloques
  const [bloques, setBloques] = useState([]);
  const [bloqueActivo, setBloqueActivo] = useState(0);
  const [editandoNombreBloque, setEditandoNombreBloque] = useState(null);
  const [nuevoNombreBloque, setNuevoNombreBloque] = useState("");
  // const [descripcionGeneral, setDescripcionGeneral] = useState("");

  // Estados para catálogo de productos
  const [productosObra, setProductosObra] = useState([]);
  const [productosObraPorCategoria, setProductosObraPorCategoria] = useState({});
  const [categoriasObra, setCategoriasObra] = useState([]);
  const [categoriaObraId, setCategoriaObraId] = useState("");
  const [busquedaProductoObra, setBusquedaProductoObra] = useState("");
  const [busquedaDebounced, setBusquedaDebounced] = useState("");
  const [paginaActual, setPaginaActual] = useState(1);
  const [productosPorPagina] = useState(12);
  const [isPending, startTransition] = React.useTransition();

  // Snapshot original para edición: al entrar en edición se congela una copia
  // profunda; al cancelar se restaura sin tocar Firestore ni perder medidas.
  const snapshotRef = useRef(null);
  const snapshotKeyRef = useRef(null);

  // Inicializar datos cuando cambia el documento (id o fechaModificacion).
  // NO reinicia mientras se está editando: evita que un re-render pise lo
  // que el usuario está modificando.
  const obraDocKey = obra ? `${obra?.id || ""}|${obra?.fechaModificacion || ""}` : "";
  useEffect(() => {
    if (!obra || editando) return;
    snapshotKeyRef.current = obraDocKey;
    snapshotRef.current = null;
    if (obra.bloques && obra.bloques.length > 0) {
      setBloques(
        JSON.parse(JSON.stringify(obra.bloques)).map((bloque) =>
          normalizarBloque(bloque, obra)
        )
      );
    } else {
      // Crear un bloque inicial si no hay bloques
      const bloqueInicial = {
        id: `presupuesto-${Date.now()}`,
        nombre: "Presupuesto 1",
        productos: [],
        descripcion: "",
        aplicarIva: opcionActiva(obra.aplicarIva ?? obra.aplicaIva),
        ivaPorcentaje: normalizarPorcentaje(obra.ivaPorcentaje, 21),
        aplicarTransferencia: opcionActiva(
          obra.aplicarTransferencia ?? obra.aplicaTransferencia
        ),
        transferenciaPorcentaje: normalizarPorcentaje(
          obra.transferenciaPorcentaje,
          10
        ),
      };
      setBloques([bloqueInicial]);
    }
    setBloqueActivo(0);
    // setDescripcionGeneral(obra.descripcionGeneral || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obraDocKey, editando]);

  // Al activar edición se congela el snapshot; al salir (guardar/cancelar)
  // se libera. Cancelar restaura desde el snapshot.
  useEffect(() => {
    if (editando && obraDocKey) {
      if (snapshotKeyRef.current !== obraDocKey || !snapshotRef.current) {
        snapshotKeyRef.current = obraDocKey;
        snapshotRef.current = {
          bloques: JSON.parse(JSON.stringify(bloques.length > 0 ? bloques : (obra?.bloques || []))),
        };
      }
    }
    if (!editando) {
      snapshotRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editando]);

  // Cargar catálogo de productos de obra
  useEffect(() => {
    if (editando) {
      const cargarProductosObra = async () => {
        try {
          const snapProd = await getDocs(collection(db, "productos_obras"));
          const prods = snapProd.docs.map((d) => ({ id: d.id, ...d.data() }));
          setProductosObra(prods);

          const agrupados = {};
          prods.forEach((p) => {
            const cat = p.categoria || "Sin categoría";
            (agrupados[cat] = agrupados[cat] || []).push(p);
          });
          setProductosObraPorCategoria(agrupados);
          setCategoriasObra(Object.keys(agrupados));
        } catch (error) {
          console.error("Error cargando productos de obra:", error);
        }
      };
      cargarProductosObra();
    }
  }, [editando]);

  // Búsqueda debounced
  useEffect(() => {
    const timer = setTimeout(() => setBusquedaDebounced(busquedaProductoObra), 150);
    return () => clearTimeout(timer);
  }, [busquedaProductoObra]);

  // Resetear página cuando cambien los filtros
  useEffect(() => {
    setPaginaActual(1);
  }, [categoriaObraId, busquedaDebounced, bloqueActivo]);

  // Función para calcular precio de productos de obra
  const calcularPrecioProductoObra = ({ unidadMedida, alto, largo, valorVenta, cantidad }) => {
    const u = String(unidadMedida || "").toUpperCase();
    const altoNum = Number(alto) || 0;
    const largoNum = Number(largo) || 0;
    const valorNum = Number(valorVenta) || 0;
    const cantNum = Number(cantidad) || 1;

    if (u === "M2") {
      return Math.round(altoNum * largoNum * valorNum * cantNum);
    }
    if (u === "ML") {
      return Math.round(largoNum * valorNum * cantNum);
    }
    return Math.round(valorNum * cantNum);
  };

  // Funciones para manejar bloques
  const agregarBloque = () => {
    const nuevoBloque = {
      id: `presupuesto-${Date.now()}`,
      nombre: `Presupuesto ${bloques.length + 1}`,
      productos: [],
      descripcion: "",
      aplicarIva: false,
      ivaPorcentaje: 21,
      aplicarTransferencia: false,
      transferenciaPorcentaje: 10,
    };
    setBloques(prev => [...prev, nuevoBloque]);
    setBloqueActivo(bloques.length);
  };

  const eliminarBloque = (bloqueIndex) => {
    if (bloques.length <= 1) return;

    setBloques(prev => prev.filter((_, index) => index !== bloqueIndex));

    if (bloqueActivo >= bloqueIndex) {
      setBloqueActivo(prev => Math.max(0, prev - 1));
    }
  };

  const actualizarNombreBloque = (bloqueIndex, nuevoNombre) => {
    setBloques(prev => prev.map((bloque, index) =>
      index === bloqueIndex ? { ...bloque, nombre: nuevoNombre } : bloque
    ));
  };

  const actualizarDescripcionBloque = (bloqueIndex, descripcion) => {
    setBloques(prev => prev.map((bloque, index) =>
      index === bloqueIndex ? { ...bloque, descripcion } : bloque
    ));
  };

  const actualizarConfiguracionBloque = (campo, valor) => {
    setBloques((prev) =>
      prev.map((bloque, index) =>
        index === bloqueActivo ? { ...bloque, [campo]: valor } : bloque
      )
    );
  };

  // Funciones para manejar productos en bloques
  const agregarProducto = (prod) => {
    const bloqueActual = bloques[bloqueActivo];
    if (!bloqueActual) return;

    // Generar ID único para permitir duplicados del mismo producto
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substr(2, 5);
    const uniqueId = `${prod.id}-${timestamp}-${randomSuffix}`;

    const unidadMedida = prod.unidadMedida || "UN";
    const valorVenta = Number(prod.valorVenta) || 0;
    const nuevo = {
      id: uniqueId, // ID único para permitir duplicados
      originalId: prod.id, // ID original del producto para referencia
      nombre: prod.nombre,
      categoria: prod.categoria || "",
      subCategoria: prod.subCategoria || prod.subcategoria || "",
      unidadMedida,
      valorVenta,
      alto: 1,
      largo: 1,
      cantidad: 1,
      descuento: 0,
      descripcion: "",
    };

    const precio = calcularPrecioProductoObra({
      unidadMedida,
      alto: nuevo.alto,
      largo: nuevo.largo,
      valorVenta: nuevo.valorVenta,
      cantidad: nuevo.cantidad,
    });
    nuevo.precio = precio;

    setBloques(prev => prev.map((bloque, index) =>
      index === bloqueActivo
        ? { ...bloque, productos: [...bloque.productos, nuevo] }
        : bloque
    ));
    setPaginaActual(1);
  };

  const agregarProductoManual = () => {
    const bloqueActual = bloques[bloqueActivo];
    if (!bloqueActual) return;

    const nuevo = {
      id: `manual-${Date.now()}`,
      nombre: "Nuevo ítem",
      categoria: "Manual",
      subCategoria: "",
      unidadMedida: "UN",
      valorVenta: 0,
      alto: 1,
      largo: 1,
      cantidad: 1,
      descuento: 0,
      descripcion: "",
      _esManual: true,
    };

    nuevo.precio = calcularPrecioProductoObra({
      unidadMedida: nuevo.unidadMedida,
      alto: nuevo.alto,
      largo: nuevo.largo,
      valorVenta: nuevo.valorVenta,
      cantidad: nuevo.cantidad
    });

    setBloques(prev => prev.map((bloque, index) =>
      index === bloqueActivo
        ? { ...bloque, productos: [nuevo, ...bloque.productos] }
        : bloque
    ));
  };

  const quitarProducto = (id) => {
    setBloques(prev => prev.map((bloque, index) =>
      index === bloqueActivo
        ? { ...bloque, productos: bloque.productos.filter((p) => p.id !== id) }
        : bloque
    ));
  };

  const quitarProductoDesdeCatalogo = (productoCatalogoId) => {
    setBloques((prev) =>
      prev.map((bloque, index) => {
        if (index !== bloqueActivo) return bloque;

        const indiceProducto = bloque.productos.findIndex(
          (producto) =>
            (producto.originalId || producto.id) === productoCatalogoId
        );
        if (indiceProducto === -1) return bloque;

        return {
          ...bloque,
          productos: bloque.productos.filter(
            (_, productoIndex) => productoIndex !== indiceProducto
          ),
        };
      })
    );
    setPaginaActual(1);
  };

  const duplicarProducto = (producto) => {
    const bloqueActual = bloques[bloqueActivo];
    if (!bloqueActual) return;

    // Generar ID único para el producto duplicado
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substr(2, 5);
    const uniqueId = `${producto.originalId || producto.id}-${timestamp}-${randomSuffix}`;

    const duplicado = {
      ...producto,
      id: uniqueId,
      originalId: producto.originalId || producto.id,
    };

    setBloques(prev => prev.map((bloque, index) =>
      index === bloqueActivo
        ? { ...bloque, productos: [...bloque.productos, duplicado] }
        : bloque
    ));
  };

  const actualizarCampo = (id, campo, valor) => {
    setBloques(prev => prev.map((bloque, bloqueIndex) =>
      bloqueIndex === bloqueActivo
        ? {
          ...bloque,
          productos: bloque.productos.map((p) => {
            if (p.id !== id) return p;

            const actualizado = { ...p };

            if (campo === "unidadMedida") {
              actualizado.unidadMedida = valor;
            } else if (campo === "descuento") {
              actualizado[campo] = Math.min(
                100,
                Math.max(0, Number(valor) || 0)
              );
            } else if (campo === "valorVenta") {
              actualizado[campo] = valor === "" ? "" : Number(valor);
            } else if (campo === "descripcion") {
              actualizado[campo] = valor;
            } else if (campo === "largo") {
              // Compat: los registros viejos guardan largoNum/ml.
              // NUNCA pisar con 0: "" conserva el valor previo hasta guardar.
              if (valor === "" || valor === null || valor === undefined) {
                actualizado.largo = p.largo ?? p.largoNum ?? "";
              } else {
                const num = Number(valor);
                if (!Number.isFinite(num)) return p;
                actualizado.largo = num;
                actualizado.largoNum = num;
                if (String(actualizado.unidadMedida || "").toUpperCase() === "ML") {
                  const cant = Number(actualizado.cantidad) || 1;
                  actualizado.ml = num * cant;
                }
              }
            } else if (campo === "alto" || campo === "cantidad") {
              if (valor === "" || valor === null || valor === undefined) {
                actualizado[campo] = p[campo] ?? (campo === "cantidad" ? 1 : "");
              } else {
                const num = Number(valor);
                if (!Number.isFinite(num)) return p;
                actualizado[campo] = num;
              }
              if (campo === "cantidad" && String(actualizado.unidadMedida || "").toUpperCase() === "ML") {
                const largoNum = Number(actualizado.largo ?? actualizado.largoNum) || 0;
                actualizado.ml = largoNum * (Number(actualizado.cantidad) || 1);
              }
            } else {
              if (valor === "" || valor === null || valor === undefined) {
                actualizado[campo] = p[campo] ?? "";
              } else {
                const num = Number(valor);
                actualizado[campo] = Number.isFinite(num) ? num : (p[campo] ?? "");
              }
            }

            if (campo !== "descripcion") {
              const alto = Number(actualizado.alto) || 0;
              const largo = Number(actualizado.largo) || 0;
              const cantidad = Number(actualizado.cantidad) || 1;
              const valorVenta = Number(actualizado.valorVenta) || 0;

              const precioBase = calcularPrecioProductoObra({
                unidadMedida: actualizado.unidadMedida,
                alto,
                largo,
                valorVenta,
                cantidad,
              });
              actualizado.precio = Math.round(precioBase);
            }

            return actualizado;
          })
        }
        : bloque
    ));
  };

  const actualizarNombreManual = (id, nombre) => {
    setBloques(prev => prev.map((bloque, bloqueIndex) =>
      bloqueIndex === bloqueActivo
        ? {
          ...bloque,
          productos: bloque.productos.map((p) => (p.id === id ? { ...p, nombre } : p))
        }
        : bloque
    ));
  };

  // Cálculos de totales por bloque
  const totalesPorBloque = useMemo(() => {
    return bloques.map((bloque) =>
      calcularTotalesBloque(bloque, opcionActiva(obra?.pagoEnEfectivo))
    );
  }, [bloques, obra?.pagoEnEfectivo]);

  // Bloque actual
  const bloqueActual = bloques[bloqueActivo];
  const itemsSeleccionados = useMemo(
    () => bloqueActual?.productos || [],
    [bloqueActual]
  );

  // Función para guardar cambios
  const guardarCambios = useCallback(async () => {
    console.log("🔄 Iniciando guardado de cambios...");
    try {
      const obraRef = doc(db, "obras", obra.id);

      // Actualizar bloques con totales calculados
      const bloquesActualizados = bloques.map((bloque, index) => {
        const totales = totalesPorBloque[index];
        return {
          ...bloque,
          subtotal: totales.subtotal,
          descuentoTotal: totales.descuentoTotal,
          descuentoEfectivo: totales.descuentoEfectivo,
          baseImponible: totales.base,
          aplicarIva: totales.aplicarIva,
          aplicaIva: totales.aplicarIva,
          ivaPorcentaje: totales.ivaPorcentaje,
          ivaMonto: totales.ivaMonto,
          aplicarTransferencia: totales.aplicarTransferencia,
          aplicaTransferencia: totales.aplicarTransferencia,
          transferenciaPorcentaje: totales.transferenciaPorcentaje,
          transferenciaMonto: totales.transferenciaMonto,
          total: totales.total,
        };
      });

      // Los bloques representan presupuestos alternativos: nunca se suman.
      // Los campos raíz solo se completan cuando existe un único bloque.
      const tieneBloqueUnico = bloquesActualizados.length === 1;
      const bloqueReferencia = tieneBloqueUnico ? bloquesActualizados[0] : {};

      const updateData = {
        bloques: bloquesActualizados,
        bloqueActivoId: bloquesActualizados[bloqueActivo]?.id || null,
        totalesPorBloque: true,
        subtotal: Number(bloqueReferencia.subtotal) || 0,
        descuentoTotal: Number(bloqueReferencia.descuentoTotal) || 0,
        descuentoEfectivo: Number(bloqueReferencia.descuentoEfectivo) || 0,
        total: Number(bloqueReferencia.total) || 0,
        aplicarIva: opcionActiva(bloqueReferencia.aplicarIva),
        aplicaIva: opcionActiva(bloqueReferencia.aplicarIva),
        ivaPorcentaje: tieneBloqueUnico
          ? normalizarPorcentaje(bloqueReferencia.ivaPorcentaje, 21)
          : 0,
        ivaMonto: Number(bloqueReferencia.ivaMonto) || 0,
        aplicarTransferencia: opcionActiva(
          bloqueReferencia.aplicarTransferencia
        ),
        aplicaTransferencia: opcionActiva(
          bloqueReferencia.aplicarTransferencia
        ),
        transferenciaPorcentaje: tieneBloqueUnico
          ? normalizarPorcentaje(bloqueReferencia.transferenciaPorcentaje, 10)
          : 0,
        transferenciaMonto: Number(bloqueReferencia.transferenciaMonto) || 0,
        fechaModificacion: new Date().toISOString(),
      };

      await updateDoc(obraRef, updateData);
      console.log("✅ Datos guardados en Firestore:", updateData);

      // SINCRONIZACIÓN BIDIRECCIONAL: Buscar y actualizar obras vinculadas a este presupuesto
      try {
        const obrasQuery = query(
          collection(db, "obras"),
          where("presupuestoInicialId", "==", obra.id),
          where("tipo", "==", "obra")
        );
        const obrasSnap = await getDocs(obrasQuery);

        if (!obrasSnap.empty) {
          const actualizacionesObras = obrasSnap.docs.map(async (obraDoc) => {
            const obraData = obraDoc.data();
            const bloqueIdObra = obraData.presupuestoInicialBloqueId;

            // Si la obra está vinculada a un bloque específico
            if (bloqueIdObra) {
              const bloqueActualizado = bloquesActualizados.find(b => b.id === bloqueIdObra);
              if (bloqueActualizado) {
                // Sanitizar productos del bloque actualizado
                const productosObraSanitizados = Array.isArray(bloqueActualizado.productos) ? bloqueActualizado.productos.map((p) => {
                  const esMadera = String(p.categoria || "").toLowerCase() === "maderas";
                  const precio = Number(p.precio) || 0;
                  const cantidad = Number(p.cantidad) || 1;
                  const descuento = Number(p.descuento) || 0;
                  // En presupuestos de obra `precio` es el total de la línea
                  // (precio unitario × medida × cantidad), no debe multiplicarse otra vez.
                  const base = precio;
                  const subtotal = Math.round(base * (1 - descuento / 100));
                  const item = {
                    id: p.id,
                    nombre: p.nombre || "",
                    categoria: p.categoria || "",
                    subcategoria: p.subcategoria || "",
                    unidad: p.unidad || p.unidadMedida || "",
                    cantidad,
                    descuento,
                    precio,
                    valorVenta: Number(p.valorVenta) || 0,
                    precioIncluyeCantidad: true,
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

                // Recalcular totales de productos de la obra
                const productosObraSubtotal = productosObraSanitizados.reduce((acc, p) => {
                  return acc + (Number(p.precio) || 0);
                }, 0);

                const productosObraDescuento = productosObraSanitizados.reduce((acc, p) => {
                  const base = Number(p.precio) || 0;
                  return acc + Math.round(base * (Number(p.descuento) || 0) / 100);
                }, 0);

                // Mantener materiales existentes de la obra
                const materialesExistentes = Array.isArray(obraData.materialesCatalogo) ? obraData.materialesCatalogo : [];
                const materialesSubtotal = materialesExistentes.reduce((acc, p) => {
                  const esMadera = String(p.categoria || '').toLowerCase() === 'maderas';
                  const isMachDeck = esMadera && (p.subcategoria === 'machimbre' || p.subcategoria === 'deck');
                  const base = isMachDeck ? (Number(p.precio) || 0) : (Number(p.precio) || 0) * (Number(p.cantidad) || 0);
                  return acc + base;
                }, 0);

                const materialesDescuento = materialesExistentes.reduce((acc, p) => {
                  const esMadera = String(p.categoria || '').toLowerCase() === 'maderas';
                  const isMachDeck = esMadera && (p.subcategoria === 'machimbre' || p.subcategoria === 'deck');
                  const base = isMachDeck ? (Number(p.precio) || 0) : (Number(p.precio) || 0) * (Number(p.cantidad) || 0);
                  return acc + Math.round(base * (Number(p.descuento) || 0) / 100);
                }, 0);

                // Totales combinados
                const subtotalCombinado = productosObraSubtotal + materialesSubtotal;
                const descuentoCombinado = productosObraDescuento + materialesDescuento;
                const descuentoEfectivoObra = opcionActiva(obraData.pagoEnEfectivo)
                  ? Math.round(subtotalCombinado * 0.1)
                  : 0;
                const baseCombinada = Math.max(
                  0,
                  subtotalCombinado - descuentoCombinado - descuentoEfectivoObra
                );
                const ivaMontoObra = bloqueActualizado.aplicarIva
                  ? Math.round(
                      baseCombinada *
                        (normalizarPorcentaje(bloqueActualizado.ivaPorcentaje, 21) / 100)
                    )
                  : 0;
                const transferenciaMontoObra = bloqueActualizado.aplicarTransferencia
                  ? Math.round(
                      baseCombinada *
                        (normalizarPorcentaje(
                          bloqueActualizado.transferenciaPorcentaje,
                          10
                        ) /
                          100)
                    )
                  : 0;

                // Actualizar la obra vinculada con TODOS los totales
                await updateDoc(doc(db, "obras", obraDoc.id), {
                  productos: productosObraSanitizados,
                  // Total de productos del presupuesto
                  productosSubtotal: productosObraSubtotal,
                  productosDescuento: productosObraDescuento,
                  productosTotal: productosObraSubtotal - productosObraDescuento,
                  // Total de materiales (mantener existentes)
                  materialesSubtotal: materialesSubtotal,
                  materialesDescuento: materialesDescuento,
                  materialesTotal: materialesSubtotal - materialesDescuento,
                  // Totales combinados
                  subtotal: subtotalCombinado,
                  descuentoTotal: descuentoCombinado,
                  descuentoEfectivo: descuentoEfectivoObra,
                  aplicarIva: bloqueActualizado.aplicarIva,
                  aplicaIva: bloqueActualizado.aplicarIva,
                  ivaPorcentaje: bloqueActualizado.ivaPorcentaje,
                  ivaMonto: ivaMontoObra,
                  aplicarTransferencia: bloqueActualizado.aplicarTransferencia,
                  aplicaTransferencia: bloqueActualizado.aplicarTransferencia,
                  transferenciaPorcentaje:
                    bloqueActualizado.transferenciaPorcentaje,
                  transferenciaMonto: transferenciaMontoObra,
                  total: Math.round(
                    baseCombinada + ivaMontoObra + transferenciaMontoObra
                  ),
                  fechaModificacion: new Date().toISOString(),
                });

                console.log(`✅ Obra ${obraDoc.id} sincronizada con bloque ${bloqueIdObra}`);
              }
            } else {
              // Sin bloque específico: actualizar productos directamente
              const productosPresupuesto = Array.isArray(obra.productos) ? obra.productos : [];
              const productosObraSanitizados = productosPresupuesto.map((p) => {
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
                  unidad: p.unidad || p.unidadMedida || "",
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
              });

              const productosObraSubtotal = productosObraSanitizados.reduce((acc, p) => {
                const esMadera = String(p.categoria || '').toLowerCase() === 'maderas';
                const isMachDeck = esMadera && (p.subcategoria === 'machimbre' || p.subcategoria === 'deck');
                const base = isMachDeck ? (Number(p.precio) || 0) : (Number(p.precio) || 0) * (Number(p.cantidad) || 0);
                return acc + base;
              }, 0);

              const productosObraDescuento = productosObraSanitizados.reduce((acc, p) => {
                const esMadera = String(p.categoria || '').toLowerCase() === 'maderas';
                const isMachDeck = esMadera && (p.subcategoria === 'machimbre' || p.subcategoria === 'deck');
                const base = isMachDeck ? (Number(p.precio) || 0) : (Number(p.precio) || 0) * (Number(p.cantidad) || 0);
                return acc + Math.round(base * (Number(p.descuento) || 0) / 100);
              }, 0);

              // Mantener materiales existentes
              const materialesExistentes = Array.isArray(obraData.materialesCatalogo) ? obraData.materialesCatalogo : [];
              const materialesSubtotal = materialesExistentes.reduce((acc, p) => {
                const esMadera = String(p.categoria || '').toLowerCase() === 'maderas';
                const isMachDeck = esMadera && (p.subcategoria === 'machimbre' || p.subcategoria === 'deck');
                const base = isMachDeck ? (Number(p.precio) || 0) : (Number(p.precio) || 0) * (Number(p.cantidad) || 0);
                return acc + base;
              }, 0);

              const materialesDescuento = materialesExistentes.reduce((acc, p) => {
                const esMadera = String(p.categoria || '').toLowerCase() === 'maderas';
                const isMachDeck = esMadera && (p.subcategoria === 'machimbre' || p.subcategoria === 'deck');
                const base = isMachDeck ? (Number(p.precio) || 0) : (Number(p.precio) || 0) * (Number(p.cantidad) || 0);
                return acc + Math.round(base * (Number(p.descuento) || 0) / 100);
              }, 0);

              const subtotalCombinado = productosObraSubtotal + materialesSubtotal;
              const descuentoCombinado = productosObraDescuento + materialesDescuento;

              await updateDoc(doc(db, "obras", obraDoc.id), {
                productos: productosObraSanitizados,
                // Total de productos del presupuesto
                productosSubtotal: productosObraSubtotal,
                productosDescuento: productosObraDescuento,
                productosTotal: productosObraSubtotal - productosObraDescuento,
                // Total de materiales (mantener existentes)
                materialesSubtotal: materialesSubtotal,
                materialesDescuento: materialesDescuento,
                materialesTotal: materialesSubtotal - materialesDescuento,
                // Totales combinados
                subtotal: subtotalCombinado,
                descuentoTotal: descuentoCombinado,
                total: subtotalCombinado - descuentoCombinado,
                fechaModificacion: new Date().toISOString(),
              });

              console.log(`✅ Obra ${obraDoc.id} sincronizada (sin bloque específico)`);
            }
          });

          await Promise.all(actualizacionesObras);
          console.log(`✅ ${obrasSnap.docs.length} obra(s) sincronizada(s) exitosamente`);
        }
      } catch (syncError) {
        console.error("Error al sincronizar obras vinculadas:", syncError);
        // No bloquear el guardado si falla la sincronización
      }

      // Actualizar el estado local de la obra directamente
      const obraActualizada = {
        ...obra,
        ...updateData
      };

      // Notificar al componente padre para actualizar el estado
      if (onObraUpdate) {
        onObraUpdate(obraActualizada);
        console.log("✅ Estado local actualizado");
      }

      return true;
    } catch (error) {
      console.error("Error guardando cambios:", error);
      alert("Error al guardar los cambios");
      return false;
    }
  }, [obra, bloques, bloqueActivo, totalesPorBloque, onObraUpdate]);

  // El encabezado espera el resultado real del guardado antes de salir del
  // modo edición. Cancelar restaura el snapshot sin escribir en Firestore.
  useEffect(() => {
    if (!onGuardarRef) return;
    onGuardarRef.current = {
      guardar: guardarCambios,
      cancelar: () => {
        if (!snapshotRef.current) return;
        const snap = snapshotRef.current;
        setBloques(JSON.parse(JSON.stringify(snap.bloques)));
        setBloqueActivo(0);
        snapshotRef.current = null;
      },
    };
  }, [guardarCambios, onGuardarRef]);

  const productosSeleccionadosPorId = useMemo(() => {
    return itemsSeleccionados.reduce((conteo, producto) => {
      if (producto._esManual) return conteo;
      const productoId = producto.originalId || producto.id;
      conteo.set(productoId, (conteo.get(productoId) || 0) + 1);
      return conteo;
    }, new Map());
  }, [itemsSeleccionados]);

  // Filtros para productos. Los que ya pertenecen al bloque activo siempre
  // aparecen primero, manteniendo el orden original dentro de cada grupo.
  const productosFiltrados = useMemo(() => {
    const fuente = categoriaObraId
      ? productosObraPorCategoria[categoriaObraId] || []
      : productosObra;
    const consulta = String(busquedaDebounced || "")
      .trim()
      .toLocaleLowerCase("es-AR")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    const filtrados = consulta
      ? fuente.filter((producto) => {
          const texto = [
            producto.nombre,
            producto.categoria,
            producto.unidadMedida,
          ]
            .join(" ")
            .toLocaleLowerCase("es-AR")
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "");
          return texto.includes(consulta);
        })
      : fuente;

    return filtrados
      .map((producto, indice) => ({ producto, indice }))
      .sort((a, b) => {
        const seleccionadoA = productosSeleccionadosPorId.has(a.producto.id);
        const seleccionadoB = productosSeleccionadosPorId.has(b.producto.id);
        if (seleccionadoA === seleccionadoB) return a.indice - b.indice;
        return seleccionadoA ? -1 : 1;
      })
      .map(({ producto }) => producto);
  }, [
    busquedaDebounced,
    categoriaObraId,
    productosObra,
    productosObraPorCategoria,
    productosSeleccionadosPorId,
  ]);

  const totalProductos = productosFiltrados.length;
  const totalPaginas = Math.max(
    1,
    Math.ceil(totalProductos / productosPorPagina)
  );
  const productosPaginados = useMemo(() => {
    const inicio = (paginaActual - 1) * productosPorPagina;
    return productosFiltrados.slice(inicio, inicio + productosPorPagina);
  }, [productosFiltrados, paginaActual, productosPorPagina]);

  // Si no está en modo edición, mostrar solo la visualización
  if (!editando) {
    return (
      <div className="space-y-6">
        {bloques.map((bloque, index) => {
          const cantidadProductos = bloque.productos?.length || 0;
          const totales = calcularTotalesBloque(
            bloque,
            opcionActiva(obra?.pagoEnEfectivo)
          );
          const totalBloque = totales.total;
          const columnasTotales =
            totales.aplicarIva || totales.aplicarTransferencia
              ? "sm:grid-cols-3 lg:grid-cols-6"
              : obra?.pagoEnEfectivo
                ? "sm:grid-cols-4"
                : "sm:grid-cols-3";

          return (
            <Card key={bloque.id} className="overflow-hidden border-slate-200/80 shadow-sm">
              <CardHeader className="mb-0 border-slate-200/80 bg-slate-50/70 px-5 py-4 sm:px-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-xs font-semibold tracking-wide text-white">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div className="min-w-0">
                      <CardTitle className="truncate text-base font-semibold text-slate-900 sm:text-lg">
                        {bloque.nombre || `Presupuesto ${index + 1}`}
                      </CardTitle>
                      <p className="mt-1 text-xs text-slate-500">
                        {cantidadProductos} {cantidadProductos === 1 ? "producto" : "productos"}
                      </p>
                    </div>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Total del bloque</p>
                    <p className="mt-1 text-lg font-semibold tracking-tight text-emerald-600 tabular-nums sm:text-xl">
                      ${formatearNumeroArgentino(totalBloque)}
                    </p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className={`grid grid-cols-2 divide-x divide-y divide-slate-200/80 border-b border-slate-200/80 bg-white ${columnasTotales}`}>
                  <div className="px-5 py-4 sm:px-6">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Subtotal</p>
                    <p className="mt-1 text-sm font-semibold text-slate-800 tabular-nums">${formatearNumeroArgentino(totales.subtotal)}</p>
                  </div>
                  <div className="px-5 py-4 sm:px-6">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Descuento</p>
                    <p className="mt-1 text-sm font-semibold text-amber-600 tabular-nums">${formatearNumeroArgentino(totales.descuentoTotal)}</p>
                  </div>
                  {obra?.pagoEnEfectivo && (
                    <div className="px-5 py-4 sm:px-6">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Efectivo</p>
                      <p className="mt-1 text-sm font-semibold text-emerald-600 tabular-nums">${formatearNumeroArgentino(totales.descuentoEfectivo)}</p>
                    </div>
                  )}
                  {totales.aplicarIva && (
                    <div className="px-5 py-4 sm:px-6">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">IVA ({totales.ivaPorcentaje}%)</p>
                      <p className="mt-1 text-sm font-semibold text-amber-600 tabular-nums">${formatearNumeroArgentino(totales.ivaMonto)}</p>
                    </div>
                  )}
                  {totales.aplicarTransferencia && (
                    <div className="px-5 py-4 sm:px-6">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Transferencia ({totales.transferenciaPorcentaje}%)</p>
                      <p className="mt-1 text-sm font-semibold text-blue-600 tabular-nums">${formatearNumeroArgentino(totales.transferenciaMonto)}</p>
                    </div>
                  )}
                  <div className="bg-emerald-50/60 px-5 py-4 sm:px-6">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-700/70">Total</p>
                    <p className="mt-1 text-sm font-bold text-emerald-700 tabular-nums">${formatearNumeroArgentino(totalBloque)}</p>
                  </div>
                </div>

                {/* Productos del bloque */}
                {bloque.productos && bloque.productos.length > 0 ? (
                  <div className="overflow-x-auto -mx-1">
                    <table className="w-full text-sm border-separate border-spacing-0">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Producto</th>
                          <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Cant.</th>
                          <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Unidad</th>
                          <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Alto</th>
                          <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Largo</th>
                          <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Medida</th>
                          <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Valor Unit.</th>
                          <th className="px-3 py-2.5 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Desc. %</th>
                          <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bloque.productos.map((producto) => {
                          const medida = detalleMedidaProducto(producto);
                          let subtotal = Number(producto.precio || 0) * (1 - Number(producto.descuento || 0) / 100);
                          // Si es pago en efectivo, aplicar descuento adicional del 10%
                          if (obra?.pagoEnEfectivo) {
                            subtotal = subtotal * 0.9;
                          }
                          return (
                            <React.Fragment key={producto.id}>
                              <tr className="border-b border-gray-100 hover:bg-gray-50/60 transition-colors duration-150">
                                <td className="px-3 py-2.5">
                                  <div className="font-medium text-gray-900">
                                    {capitalizarInicial(
                                      producto.nombre,
                                      "Producto sin nombre"
                                    )}
                                  </div>
                                </td>
                                <td className="px-3 py-2.5 text-center text-gray-700">{producto.cantidad}</td>
                                <td className="px-3 py-2.5 text-center">
                                  <Badge variant="outline" className="text-xs font-normal text-gray-600 border-gray-300">{medida.unidad}</Badge>
                                </td>
                                <td className="px-3 py-2.5 text-center text-gray-700">{medida.altoTxt}</td>
                                <td className="px-3 py-2.5 text-center text-gray-700">{medida.largoTxt}</td>
                                <td className="px-3 py-2.5 text-center">
                                  <span className="text-xs font-medium text-gray-700">{medida.medidaTxt}</span>
                                </td>
                                <td className="px-3 py-2.5 text-right font-medium text-gray-900">
                                  ${formatearNumeroArgentino(
                                    obra?.pagoEnEfectivo
                                      ? Number(producto.valorVenta) * 0.9
                                      : producto.valorVenta
                                  )}
                                </td>
                                <td className="px-3 py-2.5 text-center">
                                  {producto.descuento > 0 ? (
                                    <span className="text-xs font-medium text-orange-600">{producto.descuento}%</span>
                                  ) : (
                                    <span className="text-gray-300">0%</span>
                                  )}
                                </td>
                                <td className="px-3 py-2.5 text-right font-semibold text-gray-900">
                                  ${formatearNumeroArgentino(subtotal)}
                                </td>
                              </tr>
                              {(producto.descripcion || producto.description) && (
                                <tr className="border-b border-gray-100 bg-gray-50/50">
                                  <td colSpan={9} className="px-3 py-2">
                                    <div className="flex items-start gap-2">
                                      <span className="shrink-0 text-xs font-medium text-gray-500">Descripción:</span>
                                      <span className="text-xs leading-relaxed text-gray-600">{producto.descripcion || producto.description}</span>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <Icon icon="heroicons:cube" className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                    <p>No hay productos en este bloque</p>
                  </div>
                )}

                {/* Descripción si existe */}
                {bloque.descripcion && (
                  <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <div className="flex items-center gap-2 mb-2">
                      <Icon icon="heroicons:document-text" className="w-4 h-4 text-blue-600" />
                      <span className="text-sm font-medium text-blue-800">Descripción</span>
                    </div>
                    <p className="text-sm text-blue-700">{bloque.descripcion}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    );
  }

  // Modo edición
  return (
    <div className="space-y-6">
      {/* Gestión de Bloques */}
      <Card className="overflow-hidden border-slate-200 shadow-sm">
        <CardHeader className="border-b border-slate-200 bg-slate-50/70 px-5 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Icon icon="heroicons:squares-2x2" className="h-5 w-5 text-primary" />
                Presupuestos por bloque
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Creá y organizá las opciones de este presupuesto.
              </p>
            </div>
            <Button onClick={agregarBloque} size="sm" className="shrink-0">
              <Plus className="mr-2 h-4 w-4" />
              Nuevo bloque
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-5 p-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {bloques.map((bloque, index) => (
              <div
                key={bloque.id}
                role="button"
                tabIndex={0}
                className={`group rounded-xl border p-3 transition-all ${index === bloqueActivo
                  ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary/20"
                  : "border-slate-200 bg-white hover:border-primary/40 hover:shadow-sm"
                  }`}
                onClick={() => setBloqueActivo(index)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setBloqueActivo(index);
                  }
                }}
              >
                {editandoNombreBloque === index ? (
                  <div className="flex items-center gap-2" onClick={(event) => event.stopPropagation()}>
                    <Input
                      value={nuevoNombreBloque}
                      onChange={(e) => setNuevoNombreBloque(e.target.value)}
                      className="h-9 flex-1"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          actualizarNombreBloque(index, nuevoNombreBloque);
                          setEditandoNombreBloque(null);
                          setNuevoNombreBloque("");
                        }
                        if (e.key === "Escape") {
                          setEditandoNombreBloque(null);
                          setNuevoNombreBloque("");
                        }
                      }}
                      autoFocus
                    />
                    <Button
                      size="sm"
                      className="h-9 w-9 p-0"
                      onClick={() => {
                        actualizarNombreBloque(index, nuevoNombreBloque);
                        setEditandoNombreBloque(null);
                        setNuevoNombreBloque("");
                      }}
                    >
                      <Check className="w-3 h-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-9 w-9 p-0"
                      onClick={() => {
                        setEditandoNombreBloque(null);
                        setNuevoNombreBloque("");
                      }}
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-start gap-3">
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${index === bloqueActivo ? "bg-primary text-primary-foreground" : "bg-slate-100 text-slate-600"}`}>
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-slate-900">{bloque.nombre}</p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {bloque.productos.length} {bloque.productos.length === 1 ? "producto" : "productos"}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-slate-500"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditandoNombreBloque(index);
                              setNuevoNombreBloque(bloque.nombre);
                            }}
                            title="Renombrar bloque"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                          </Button>
                          {bloques.length > 1 && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-red-500 hover:bg-red-50 hover:text-red-600"
                              onClick={(e) => {
                                e.stopPropagation();
                                eliminarBloque(index);
                              }}
                              title="Eliminar bloque"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-1.5">
                        <Badge variant="outline" className="bg-white text-[10px]">
                          {bloque.aplicarIva ? `IVA ${normalizarPorcentaje(bloque.ivaPorcentaje, 21)}%` : "Sin IVA"}
                        </Badge>
                        <Badge variant="outline" className="bg-white text-[10px]">
                          {bloque.aplicarTransferencia ? `Transferencia ${normalizarPorcentaje(bloque.transferenciaPorcentaje, 10)}%` : "Sin transferencia"}
                        </Badge>
                      </div>
                      <p className="mt-3 text-base font-bold tabular-nums text-emerald-600">
                        $ {formatearNumeroArgentino(totalesPorBloque[index]?.total || 0)}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {bloqueActual && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Bloque activo</p>
                  <h3 className="mt-1 text-lg font-semibold text-slate-900">{bloqueActual.nombre}</h3>
                </div>
                <div className="grid flex-1 gap-3 sm:grid-cols-2 xl:max-w-2xl">
                  <div className={`rounded-lg border p-3 ${bloqueActual.aplicarIva ? "border-amber-200 bg-amber-50/60" : "border-slate-200"}`}>
                    <label className="flex cursor-pointer items-center justify-between gap-3 text-sm font-semibold">
                      <span>Aplicar IVA</span>
                      <input
                        type="checkbox"
                        checked={Boolean(bloqueActual.aplicarIva)}
                        onChange={(event) => actualizarConfiguracionBloque("aplicarIva", event.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                      />
                    </label>
                    <div className="mt-2 flex items-center justify-self-end gap-2">
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={bloqueActual.ivaPorcentaje ?? 21}
                        onChange={(event) => actualizarConfiguracionBloque("ivaPorcentaje", event.target.value)}
                        disabled={!bloqueActual.aplicarIva}
                        className="h-8 text-right"
                      />
                      <span className="text-sm text-muted-foreground">%</span>
                    </div>
                  </div>
                  <div className={`rounded-lg border p-3 ${bloqueActual.aplicarTransferencia ? "border-blue-200 bg-blue-50/60" : "border-slate-200"}`}>
                    <label className="flex cursor-pointer items-center justify-between gap-3 text-sm font-semibold">
                      <span>Transferencia</span>
                      <input
                        type="checkbox"
                        checked={Boolean(bloqueActual.aplicarTransferencia)}
                        onChange={(event) => actualizarConfiguracionBloque("aplicarTransferencia", event.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                      />
                    </label>
                    <div className="mt-2 flex items-center justify-self-end gap-2">
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={bloqueActual.transferenciaPorcentaje ?? 10}
                        onChange={(event) => actualizarConfiguracionBloque("transferenciaPorcentaje", event.target.value)}
                        disabled={!bloqueActual.aplicarTransferencia}
                        className="h-8 text-right"
                      />
                      <span className="text-sm text-muted-foreground">%</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 sm:grid-cols-3 lg:grid-cols-5">
                {[
                  ["Subtotal", totalesPorBloque[bloqueActivo]?.subtotal, "text-slate-900"],
                  ["Descuentos", totalesPorBloque[bloqueActivo]?.descuentoTotal, "text-amber-600"],
                  [`IVA ${totalesPorBloque[bloqueActivo]?.aplicarIva ? `(${totalesPorBloque[bloqueActivo]?.ivaPorcentaje}%)` : ""}`, totalesPorBloque[bloqueActivo]?.ivaMonto, "text-amber-600"],
                  [`Transferencia ${totalesPorBloque[bloqueActivo]?.aplicarTransferencia ? `(${totalesPorBloque[bloqueActivo]?.transferenciaPorcentaje}%)` : ""}`, totalesPorBloque[bloqueActivo]?.transferenciaMonto, "text-blue-600"],
                  ["Total del bloque", totalesPorBloque[bloqueActivo]?.total, "text-emerald-600"],
                ].map(([label, value, color]) => (
                  <div key={label} className="bg-white px-3 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
                    <p className={`mt-1 text-sm font-bold tabular-nums ${color}`}>$ {formatearNumeroArgentino(value || 0)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Catálogo de Productos */}
      <Card className="overflow-hidden border-slate-200 shadow-sm">
        <CardHeader className="border-b border-slate-200 bg-slate-50/70 px-5 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Filter className="h-5 w-5 text-primary" />
                Catálogo de productos
                <Badge variant="outline" className="ml-1 bg-white">
                  {bloqueActual?.nombre}
                </Badge>
              </CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Elegí los productos que querés agregar al presupuesto.
              </p>
            </div>
            <Button onClick={agregarProductoManual} variant="outline" size="sm">
              <Plus className="mr-2 h-4 w-4" />
              Agregar ítem manual
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="flex flex-1 flex-wrap gap-2">
              {categoriasObra.map((categoria) => (
                <button
                  key={categoria}
                  type="button"
                  onClick={() =>
                    setCategoriaObraId((actual) =>
                      actual === categoria ? "" : categoria
                    )
                  }
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${categoriaObraId === categoria
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-slate-200 bg-white text-slate-600 hover:border-primary/40 hover:text-primary"
                    }`}
                >
                  {capitalizarInicial(categoria)}
                </button>
              ))}
            </div>
            <div className="relative w-full lg:w-80">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Buscar productos..."
                value={busquedaProductoObra}
                onChange={(e) => setBusquedaProductoObra(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          <div className="min-h-56 rounded-xl border border-slate-200 bg-slate-50/40 p-4">
            {categoriasObra.length === 0 ? (
              <div className="flex min-h-48 flex-col items-center justify-center text-center">
                <Icon icon="heroicons:cube-transparent" className="mb-2 h-9 w-9 text-slate-300" />
                <p className="font-medium text-slate-700">No hay productos disponibles</p>
              </div>
            ) : productosFiltrados.length === 0 ? (
              <div className="flex min-h-48 flex-col items-center justify-center text-center">
                <Search className="mb-2 h-8 w-8 text-slate-300" />
                <p className="font-medium text-slate-700">No encontramos productos</p>
                <p className="mt-1 text-sm text-slate-500">Probá con otra búsqueda o categoría.</p>
              </div>
            ) : (
              <div className="relative grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {isPending && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-white/80 backdrop-blur-sm">
                    <span className="text-sm font-medium text-slate-600">Actualizando catálogo…</span>
                  </div>
                )}
                {productosPaginados.map((prod) => {
              const vecesAgregado = productosSeleccionadosPorId.get(prod.id) || 0;
              const precio = Number(prod.valorVenta) || 0;

              return (
                <div key={prod.id} className={`group relative flex h-full flex-col rounded-xl border bg-white transition-all hover:-translate-y-0.5 hover:shadow-md ${vecesAgregado > 0 ? "border-primary/40 ring-1 ring-primary/10" : "border-slate-200 hover:border-primary/30"
                  }`}>
                  <div className="flex h-full flex-col p-4">
                    <div className="mb-3 flex items-start gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm">
                            🏗️
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="line-clamp-2 min-h-10 text-sm font-semibold leading-5 text-slate-900" title={prod.nombre}>
                              {capitalizarInicial(prod.nombre, "Producto sin nombre")}
                            </h4>
                            {vecesAgregado > 0 && (
                              <Badge className="mt-1 bg-primary/10 text-[10px] text-primary hover:bg-primary/10">
                                Agregado {vecesAgregado}×
                              </Badge>
                            )}
                          </div>
                    </div>
                    <div className="flex flex-1 items-end justify-between gap-3 border-t border-slate-100 pt-3">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Valor unitario</p>
                        <p className="mt-1 font-bold tabular-nums text-slate-900">$ {formatearNumeroArgentino(precio)}</p>
                      </div>
                      <Badge variant="outline" className="bg-slate-50 text-[10px] text-slate-600">
                        {String(prod.unidadMedida || "UN").toUpperCase()}
                      </Badge>
                    </div>
                    <div className={`mt-3 grid gap-2 ${vecesAgregado > 0 ? "grid-cols-2" : "grid-cols-1"}`}>
                      {vecesAgregado > 0 && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => quitarProductoDesdeCatalogo(prod.id)}
                          className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                          aria-label={`Quitar ${prod.nombre || "producto"} del bloque`}
                        >
                          <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                          {vecesAgregado > 1 ? "Quitar uno" : "Quitar"}
                        </Button>
                      )}
                      <Button
                        type="button"
                        onClick={() => agregarProducto(prod)}
                        size="sm"
                        className="w-full"
                      >
                        {vecesAgregado > 0 ? "Agregar otro" : "Agregar"}
                      </Button>
                    </div>
                  </div>
                </div>
              );
                })}
              </div>
            )}
          </div>

          {productosFiltrados.length > 0 && (
            <div className="flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-500">
                Mostrando {(paginaActual - 1) * productosPorPagina + 1}–{Math.min(paginaActual * productosPorPagina, totalProductos)} de {totalProductos}
              </p>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={paginaActual === 1 || isPending}
                  onClick={() => startTransition(() => setPaginaActual(1))}
                >
                  «
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={paginaActual === 1 || isPending}
                  onClick={() => startTransition(() => setPaginaActual((pagina) => Math.max(1, pagina - 1)))}
                >
                  Anterior
                </Button>
                <span className="min-w-20 px-2 text-center text-sm font-medium text-slate-600">
                  {paginaActual} / {totalPaginas}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={paginaActual === totalPaginas || isPending}
                  onClick={() => startTransition(() => setPaginaActual((pagina) => Math.min(totalPaginas, pagina + 1)))}
                >
                  Siguiente
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={paginaActual === totalPaginas || isPending}
                  onClick={() => startTransition(() => setPaginaActual(totalPaginas))}
                >
                  »
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Productos Seleccionados */}
      {itemsSeleccionados.length > 0 && (
        <Card className="overflow-hidden border-slate-200 shadow-sm">
          <CardHeader className="border-b border-slate-200 bg-slate-50/70 px-5 py-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Icon icon="heroicons:clipboard-document-list" className="h-5 w-5 text-primary" />
                  Productos del bloque
                  <Badge variant="outline" className="bg-white">{bloqueActual?.nombre}</Badge>
                </CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">
                  Revisá y ajustá los productos agregados.
                </p>
              </div>
              <div className="text-left sm:text-right">
                <p className="text-xs text-slate-500">{itemsSeleccionados.length} {itemsSeleccionados.length === 1 ? "producto" : "productos"}</p>
                <p className="text-lg font-bold tabular-nums text-emerald-600">
                  $ {formatearNumeroArgentino(totalesPorBloque[bloqueActivo]?.total || 0)}
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="min-w-[1100px] w-full text-sm">
                <thead className="bg-slate-800">
                  <tr className="border-b border-slate-700">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-100">Producto</th>
                    <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-100">Cant.</th>
                    <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-100">Unidad</th>
                    <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-100">Alto</th>
                    <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-100">Largo</th>
                    <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-100">Medida</th>
                    <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-100">Precio unitario</th>
                    <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-100">Desc. %</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-100">Total línea</th>
                    <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-100">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {itemsSeleccionados.map((p) => {
                    const medida = detalleMedidaProducto(p);
                    const u = medida.unidad;
                    const descuento = Math.min(
                      100,
                      Math.max(0, Number(p.descuento) || 0)
                    );
                    const sub =
                      (Number(p.precio) || 0) * (1 - descuento / 100);
                    const requiereAlto = u === "M2";
                    const requiereLargo = u === "M2" || u === "ML";

                    return (
                      <React.Fragment key={p.id}>
                        <tr className="border-b border-slate-100 bg-white hover:bg-slate-50/60">
                          <td className="px-4 py-3">
                            <div className="font-medium">
                              {p._esManual ? (
                                <Input
                                  value={p.nombre}
                                  onChange={(e) => actualizarNombreManual(p.id, e.target.value)}
                                  className="h-8"
                                />
                              ) : (
                                <div className="flex items-center gap-2">
                                  <span>
                                    {capitalizarInicial(
                                      p.nombre,
                                      "Producto sin nombre"
                                    )}
                                  </span>
                                  {itemsSeleccionados.filter(item => (item.originalId || item.id) === (p.originalId || p.id)).length > 1 && (
                                    <Badge variant="outline" className="text-xs bg-blue-50 text-blue-600 border-blue-200">
                                      Duplicado
                                    </Badge>
                                  )}
                                </div>
                              )}
                            </div>
                          </td>

                          <td className="px-3 py-3 text-center">
                            <Input
                              type="number"
                              min={1}
                              value={p.cantidad}
                              onChange={(e) => actualizarCampo(p.id, "cantidad", e.target.value)}
                              className="h-9 w-20 mx-auto text-center"
                            />
                          </td>

                          <td className="px-3 py-3 text-center">
                            {p._esManual ? (
                              <Select
                                value={u}
                                onValueChange={(v) => actualizarCampo(p.id, "unidadMedida", v)}
                              >
                                <SelectTrigger className="w-24 mx-auto h-8">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="UN">UN</SelectItem>
                                  <SelectItem value="M2">M2</SelectItem>
                                  <SelectItem value="ML">ML</SelectItem>
                                </SelectContent>
                              </Select>
                            ) : (
                              <Badge variant="outline">{u}</Badge>
                            )}
                          </td>

                          <td className="px-3 py-3 text-center">
                            {requiereAlto ? (
                              <Input
                                type="number"
                                min={0}
                                step="0.01"
                                value={p.alto}
                                onChange={(e) => actualizarCampo(p.id, "alto", e.target.value)}
                                className="h-9 w-24 mx-auto text-center"
                              />
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>

                          <td className="px-3 py-3 text-center">
                            {requiereLargo ? (
                              <Input
                                type="number"
                                min={0}
                                step="0.01"
                                value={p.largo ?? p.largoNum ?? ""}
                                onChange={(e) => actualizarCampo(p.id, "largo", e.target.value)}
                                className="h-9 w-24 mx-auto text-center"
                              />
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>

                          <td className="px-3 py-3 text-center">
                            <span className="text-xs font-medium text-gray-700">{medida.medidaTxt}</span>
                          </td>

                          <td className="px-3 py-3 text-right">
                            <div className="relative ml-auto w-32">
                              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-slate-400">$</span>
                              <Input
                                type="number"
                                min={0}
                                step="0.01"
                                value={p.valorVenta ?? ""}
                                onChange={(e) => actualizarCampo(p.id, "valorVenta", e.target.value)}
                                className="h-9 pl-6 pr-2 text-right font-medium tabular-nums"
                                aria-label={`Precio unitario de ${p.nombre || "producto"}`}
                              />
                            </div>
                          </td>

                          <td className="px-3 py-3 text-center">
                            <Input
                              type="number"
                              min={0}
                              max={100}
                              value={p.descuento}
                              onChange={(e) => actualizarCampo(p.id, "descuento", e.target.value)}
                              className="h-9 w-20 mx-auto text-center"
                            />
                          </td>

                          <td className="px-4 py-3 text-right font-bold tabular-nums text-slate-900">
                            $ {formatearNumeroArgentino(Math.round(sub))}
                          </td>

                          <td className="px-3 py-3 text-center">
                            <div className="flex items-center gap-1 justify-center">
                              <Button
                                variant="outline"
                                onClick={() => duplicarProducto(p)}
                                size="sm"
                                className="h-8 w-8 p-0 text-blue-600 hover:bg-blue-50 hover:text-blue-700"
                                title="Duplicar producto"
                              >
                                <Plus className="w-3 h-3" />
                              </Button>
                              <Button
                                variant="outline"
                                onClick={() => quitarProducto(p.id)}
                                size="sm"
                                className="h-8 w-8 p-0 text-red-600 hover:bg-red-50 hover:text-red-700"
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                        {/* Fila adicional para descripción del producto */}
                        <tr className="border-b border-slate-100 bg-slate-50/60">
                          <td colSpan={10} className="px-4 py-3">
                            <div className="flex items-start gap-3">
                              <span className="w-20 shrink-0 pt-2 text-xs font-semibold text-slate-500">Descripción</span>
                              <Textarea
                                placeholder="Escribe una descripción específica para este producto..."
                                value={p.descripcion || ""}
                                onChange={(e) => actualizarCampo(p.id, "descripcion", e.target.value)}
                                className="min-h-10 flex-1 resize-y bg-white"
                                rows={1}
                              />
                            </div>
                          </td>
                        </tr>
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Descripción del Presupuesto (Bloque) - siempre visible en edición */}
      {bloqueActual && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Icon icon="heroicons:document-text" className="w-5 h-5" />
              Descripción del Presupuesto (Bloque actual)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              placeholder="Escribe una descripción para este presupuesto (bloque) que aparecerá en la impresión"
              value={bloqueActual?.descripcion || ""}
              onChange={(e) => actualizarDescripcionBloque(bloqueActivo, e.target.value)}
              className="min-h-[80px] resize-none"
              rows={3}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default PresupuestoDetalle;
