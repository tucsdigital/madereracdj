"use client";
import React, { useState, useEffect, useMemo, useRef } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Boxes,
  Save,
  Loader2,
  CheckCircle,
  AlertCircle,
  Plus,
  X,
  Image as ImageIcon,
  Tag,
  Percent,
  Truck,
  Star,
  Gift,
  Zap,
  GripVertical,
} from "lucide-react";
import { db } from "@/lib/firebase";
import {
  doc,
  getDoc,
  updateDoc,
  collection,
  getDocs,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/provider/auth.provider";
import { shouldRestrictProductPricing } from "@/lib/access-control";
import {
  applyDerivedComboStock,
  computeComboStock,
  getComboComponentIds,
  isComboProduct,
  normalizeComboComponents,
} from "@/lib/combos";
import { useQuill } from "react-quilljs";
import "quill/dist/quill.snow.css";

const ProductoDetailPage = () => {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const productId = params.id;
  const { user } = useAuth();
  const blockPriceEdits = shouldRestrictProductPricing(user);
  const descriptionEditorModules = useMemo(
    () => ({
      toolbar: [
        [{ header: [2, 3, false] }],
        ["bold", "italic", "underline"],
        [{ list: "ordered" }, { list: "bullet" }],
        ["link"],
        ["clean"],
      ],
    }),
    []
  );
  const { quill: descriptionQuill, quillRef: descriptionQuillRef } = useQuill({
    theme: "snow",
    modules: descriptionEditorModules,
    placeholder: "Descripción detallada del producto",
  });
  const syncingDescriptionRef = useRef(false);

  const normalizeDescriptionHtml = (value) => {
    const html = String(value ?? "").trim();
    return html === "<p><br></p>" ? "" : html;
  };
  const normalizeDescriptionPlainText = (value) =>
    String(value ?? "").replace(/\r\n/g, "\n");
  const isHtmlDescription = (value) =>
    /<\/?[a-z][\s\S]*>/i.test(String(value ?? ""));

  const [producto, setProducto] = useState(null);
  const [productoCollection, setProductoCollection] = useState("productos");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("");

  // Estados para datos precargados
  const [proveedores, setProveedores] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [subcategorias, setSubcategorias] = useState([]);
  const [subcategoriasPorCategoria, setSubcategoriasPorCategoria] = useState({});
  const [tiposMadera, setTiposMadera] = useState([]);
  const [usos, setUsos] = useState([]);
  const [depositos, setDepositos] = useState([]);
  const [unidadesMedida, setUnidadesMedida] = useState([]);

  // Estados para agregar nuevos valores
  const [showAddProveedor, setShowAddProveedor] = useState(false);
  const [showAddCategoria, setShowAddCategoria] = useState(false);
  const [showAddSubcategoria, setShowAddSubcategoria] = useState(false);
  const [showAddTipoMadera, setShowAddTipoMadera] = useState(false);
  const [showAddUso, setShowAddUso] = useState(false);
  const [showAddDeposito, setShowAddDeposito] = useState(false);
  const [showAddUnidadMedida, setShowAddUnidadMedida] = useState(false);
  const [newValue, setNewValue] = useState("");
  const [discountMode, setDiscountMode] = useState("amount");
  const [lastUpdatedDiscountField, setLastUpdatedDiscountField] = useState("amount");
  const [discountInputs, setDiscountInputs] = useState({ amount: "", percentage: "" });
  const [catalogoProductos, setCatalogoProductos] = useState([]);
  const [comboItems, setComboItems] = useState([]);
  const [comboSearch, setComboSearch] = useState("");

  const [editForm, setEditForm] = useState({
    codigo: "",
    nombre: "",
    categoria: "",
    descripcion: "",
    detalle: "",
    proveedor: "",
    uso: "",
    unidadMedida: "",
    deposito: "deposito_1",
    estado: "",
    estadoTienda: "",
    subcategoria: "",
    tipoMaterial: "",
    largo: "",
    ancho: "",
    espesor: "",
    peso: "",
    rendimiento: "",
    costo: "",
    stock: "",
    minimoCompra: 1,
    pack: "",
    precioVenta: "",
    stockMinimo: "",
    valorCompra: "",
    esCombo: false,
    tipoProducto: "",
    componentesCombo: [],
    imagenes: [],
    discount: { amount: 0, percentage: 0 },
    rating: 0,
    freeShipping: false,
    featuredBrand: false,
    newArrival: false,
    specialOffer: false,
    mundialOffer: false,
  });

  // Estados para nuevos campos
  const [uploadingGallery, setUploadingGallery] = useState(false);
  const subcategoriasDisponibles = useMemo(() => {
    const categoria = String(editForm.categoria || "").trim();
    if (!categoria) return subcategorias;
    return subcategoriasPorCategoria[categoria] || [];
  }, [editForm.categoria, subcategorias, subcategoriasPorCategoria]);

  const normalizeImagenes = (value) => {
    if (Array.isArray(value)) return value.filter(Boolean).map((v) => String(v).trim()).filter(Boolean);
    if (typeof value === "string") {
      return value
        .split("|")
        .map((v) => v.trim())
        .filter(Boolean);
    }
    return [];
  };

  const comboCatalogo = useMemo(
    () =>
      (Array.isArray(catalogoProductos) ? catalogoProductos : [])
        .filter((item) => item.categoria !== "Obras" && !isComboProduct(item)),
    [catalogoProductos]
  );

  const comboSuggestions = useMemo(() => {
    const term = String(comboSearch || "").trim().toLowerCase();
    const selectedIds = new Set(comboItems.map((item) => item.productoId));
    return comboCatalogo
      .filter((item) => !selectedIds.has(String(item.id)))
      .filter((item) => {
        if (!term) return true;
        return [item.nombre, item.codigo, item.categoria]
          .map((value) => String(value || "").toLowerCase())
          .some((value) => value.includes(term));
      })
      .slice(0, 8);
  }, [comboCatalogo, comboItems, comboSearch]);

  const comboStockPreview = useMemo(() => {
    const productoById = new Map(comboCatalogo.map((item) => [String(item.id), item]));
    return computeComboStock({ componentesCombo: comboItems }, productoById);
  }, [comboCatalogo, comboItems]);

  useEffect(() => {
    if (productId) {
      cargarProducto();
      cargarDatosPrecargados();
    }
  }, [productId]);

  useEffect(() => {
    if (!descriptionQuill) return;
    const handleTextChange = () => {
      if (syncingDescriptionRef.current) return;
      const html = normalizeDescriptionHtml(descriptionQuill.root.innerHTML);
      setEditForm((prev) =>
        prev.descripcion === html ? prev : { ...prev, descripcion: html }
      );
    };
    descriptionQuill.on("text-change", handleTextChange);
    return () => {
      descriptionQuill.off("text-change", handleTextChange);
    };
  }, [descriptionQuill]);

  useEffect(() => {
    if (!descriptionQuill) return;
    const formDescripcion = String(editForm.descripcion ?? "");
    const formHtml = normalizeDescriptionHtml(formDescripcion);
    const formIsHtml = isHtmlDescription(formDescripcion);

    if (formIsHtml) {
      const editorHtml = normalizeDescriptionHtml(descriptionQuill.root.innerHTML);
      if (editorHtml === formHtml) return;
    } else {
      const editorText = normalizeDescriptionPlainText(
        descriptionQuill.getText().replace(/\n$/, "")
      );
      const formText = normalizeDescriptionPlainText(formDescripcion);
      if (editorText === formText) return;
    }

    syncingDescriptionRef.current = true;
    if (!formDescripcion) {
      descriptionQuill.setText("");
    } else if (formIsHtml) {
      descriptionQuill.clipboard.dangerouslyPasteHTML(formHtml || "");
    } else {
      descriptionQuill.setText(normalizeDescriptionPlainText(formDescripcion));
    }
    syncingDescriptionRef.current = false;
  }, [descriptionQuill, editForm.descripcion]);

  const cargarProducto = async () => {
    try {
      setLoading(true);
      const colHint = String(searchParams?.get("col") ?? "").trim();
      const colecciones = ["productos", "productos_obras"];
      const order = colecciones.includes(colHint)
        ? [colHint, ...colecciones.filter((c) => c !== colHint)]
        : colecciones;
      let productoSnap = null;
      let encontradaEn = null;

      for (const col of order) {
        const ref = doc(db, col, productId);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          productoSnap = snap;
          encontradaEn = col;
          break;
        }
      }

      if (productoSnap && encontradaEn) {
        const productoData = productoSnap.data();
        setProductoCollection(encontradaEn);
        setProducto({ id: productoSnap.id, ...productoData, __collection: encontradaEn });
        
        setEditForm({
          codigo: productoData.codigo || "",
          nombre: productoData.nombre || "",
          categoria: productoData.categoria || "",
          descripcion: productoData.descripcion || "",
          detalle: productoData.detalle || "",
          proveedor: productoData.proveedor || "",
          uso: productoData.uso || "",
          unidadMedida: productoData.unidadMedida || "",
          deposito: productoData.deposito || "deposito_1",
          estado: productoData.estado || "Activo",
          estadoTienda: productoData.estadoTienda || "Activo",
          subcategoria: productoData.subcategoria || productoData.subCategoria || "",
          tipoMaterial: productoData.tipoMaterial ?? productoData.tipoMadera ?? "",
          largo: productoData.largo ?? "",
          ancho: productoData.ancho ?? "",
          espesor: productoData.espesor ?? productoData.alto ?? "",
          peso: productoData.peso ?? "",
          rendimiento: productoData.rendimiento ?? productoData.rendimientoM2 ?? "",
          costo: productoData.costo ?? productoData.Costo ?? productoData.valorCompra ?? "",
          stock: productoData.stock ?? "",
          minimoCompra: productoData.minimoCompra ?? productoData.minCompra ?? 1,
          pack: productoData.pack ?? productoData.packSize ?? "",
          precioVenta: productoData.precioVenta ?? productoData.valorVenta ?? productoData.precioCalculado ?? "",
          stockMinimo: productoData.stockMinimo ?? "",
          valorCompra: productoData.valorCompra ?? "",
          esCombo: isComboProduct(productoData),
          tipoProducto: productoData.tipoProducto || (isComboProduct(productoData) ? "combo" : "simple"),
          componentesCombo: normalizeComboComponents(productoData.componentesCombo),
          imagenes: normalizeImagenes(productoData.imagenes),
          discount: productoData.discount || { amount: 0, percentage: 0 },
          rating: productoData.rating || 0,
          freeShipping: productoData.freeShipping || false,
          featuredBrand: productoData.featuredBrand || false,
          newArrival: productoData.newArrival || false,
          specialOffer: productoData.specialOffer || false,
          mundialOffer: productoData.mundialOffer || false,
        });
        setComboItems(normalizeComboComponents(productoData.componentesCombo));
        const porcentajeDescuento = Number(productoData.discount?.percentage) || 0;
        const montoDescuento = Number(productoData.discount?.amount) || 0;
        const discountFieldInicial = porcentajeDescuento > 0 ? "percentage" : montoDescuento > 0 ? "amount" : "amount";
        setDiscountMode(discountFieldInicial);
        setLastUpdatedDiscountField(discountFieldInicial);
        setDiscountInputs({
          amount: montoDescuento > 0 ? String(montoDescuento) : "",
          percentage: porcentajeDescuento > 0 ? String(porcentajeDescuento) : "",
        });
      } else {
        setMessage("Producto no encontrado");
        setMessageType("error");
      }
    } catch (error) {
      setMessage("Error al cargar producto: " + error.message);
      setMessageType("error");
    } finally {
      setLoading(false);
    }
  };

  const cargarDatosPrecargados = async () => {
    try {
      const [productosSnap, obrasSnap] = await Promise.all([
        getDocs(collection(db, "productos")),
        getDocs(collection(db, "productos_obras")),
      ]);
      const productos = applyDerivedComboStock([
        ...productosSnap.docs.map((d) => ({ id: d.id, ...d.data(), __collection: "productos" })),
        ...obrasSnap.docs.map((d) => ({ id: d.id, ...d.data(), __collection: "productos_obras" })),
      ]);
      setCatalogoProductos(productos);
      
      // Extraer proveedores únicos
      const proveedoresUnicos = [...new Set(
        productos
          .filter(p => p.proveedor)
          .map(p => p.proveedor)
      )].sort();
      setProveedores(proveedoresUnicos);

      const categoriasUnicas = [...new Set(
        [
          ...productos
            .filter(p => p.categoria)
            .map(p => p.categoria),
          "Combos",
        ]
      )].sort();
      const categoriaActual = String(editForm.categoria || "").trim();
      const categoriasConActual = categoriaActual && !categoriasUnicas.includes(categoriaActual)
        ? [...categoriasUnicas, categoriaActual].sort()
        : categoriasUnicas;
      setCategorias(categoriasConActual);

      const mapaSubcategorias = productos.reduce((acc, p) => {
        const categoria = String(p.categoria || "").trim();
        const subcategoria = String(p.subcategoria || p.subCategoria || "").trim();
        if (!categoria || !subcategoria) return acc;
        if (!acc[categoria]) acc[categoria] = new Set();
        acc[categoria].add(subcategoria);
        return acc;
      }, {});
      const subcategoriasPorCategoriaOrdenadas = Object.fromEntries(
        Object.entries(mapaSubcategorias).map(([categoria, subcatsSet]) => [
          categoria,
          [...subcatsSet].sort(),
        ])
      );
      setSubcategoriasPorCategoria(subcategoriasPorCategoriaOrdenadas);

      // Extraer subcategorías únicas
      const subcategoriasUnicas = [...new Set(
        productos
          .filter(p => p.subcategoria || p.subCategoria)
          .map(p => p.subcategoria || p.subCategoria)
      )].sort();
      setSubcategorias(subcategoriasUnicas);

      // Extraer tipos de material únicos (tipoMaterial o tipoMadera)
      const tiposMaterialUnicos = [...new Set(
        productos.map(p => p.tipoMaterial ?? p.tipoMadera).filter(Boolean)
      )].sort();
      setTiposMadera(tiposMaterialUnicos);

      const usosUnicos = [...new Set(
        productos
          .filter(p => p.uso)
          .map(p => p.uso)
      )].sort();
      setUsos(usosUnicos);

      const depositosUnicos = [...new Set(
        productos
          .filter(p => p.deposito)
          .map(p => p.deposito)
      )].sort();
      setDepositos(
        depositosUnicos.length > 0
          ? depositosUnicos
          : ["deposito_1", "deposito_2"]
      );

      // Extraer unidades de medida únicas
      const unidadesMedidaUnicas = [...new Set(
        [
          ...productos
            .filter(p => p.unidadMedida)
            .map(p => p.unidadMedida),
          "Unidad",
        ]
      )].sort();
      setUnidadesMedida(unidadesMedidaUnicas);
    } catch (error) {
      console.error("Error al cargar datos precargados:", error);
    }
  };

  const addComboItem = (productoToAdd) => {
    if (!productoToAdd?.id) return;
    const nextItems = normalizeComboComponents([
      ...comboItems,
      {
        productoId: productoToAdd.id,
        nombre: productoToAdd.nombre || "",
        codigo: productoToAdd.codigo || "",
        cantidad: 1,
      },
    ]);
    setComboItems(nextItems);
    setEditForm((prev) => ({ ...prev, componentesCombo: nextItems }));
    setComboSearch("");
  };

  const updateComboItemQty = (productoId, cantidad) => {
    const nextItems = normalizeComboComponents(
      comboItems.map((item) =>
        item.productoId === productoId ? { ...item, cantidad } : item
      )
    );
    setComboItems(nextItems);
    setEditForm((prev) => ({ ...prev, componentesCombo: nextItems }));
  };

  const removeComboItem = (productoId) => {
    const nextItems = comboItems.filter((item) => item.productoId !== productoId);
    setComboItems(nextItems);
    setEditForm((prev) => ({ ...prev, componentesCombo: nextItems }));
  };

  const handleAddNewValue = (tipo, valor) => {
    if (!valor.trim()) return;
    
    switch (tipo) {
      case "categoria":
        if (!categorias.includes(valor)) {
          setCategorias(prev => [...prev, valor].sort());
        }
        setEditForm(prev => {
          const subcats = subcategoriasPorCategoria[valor] || [];
          const shouldResetSubcategoria = prev.subcategoria && !subcats.includes(prev.subcategoria);
          return {
            ...prev,
            categoria: valor,
            subcategoria: shouldResetSubcategoria ? "" : prev.subcategoria,
          };
        });
        setShowAddCategoria(false);
        break;
      case 'proveedor':
        if (!proveedores.includes(valor)) {
          setProveedores(prev => [...prev, valor].sort());
        }
        setEditForm(prev => ({ ...prev, proveedor: valor }));
        setShowAddProveedor(false);
        break;
      case 'subcategoria':
        if (!subcategorias.includes(valor)) {
          setSubcategorias(prev => [...prev, valor].sort());
        }
        if (editForm.categoria) {
          setSubcategoriasPorCategoria((prev) => {
            const actuales = prev[editForm.categoria] || [];
            if (actuales.includes(valor)) return prev;
            return {
              ...prev,
              [editForm.categoria]: [...actuales, valor].sort(),
            };
          });
        }
        setEditForm(prev => ({ ...prev, subcategoria: valor }));
        setShowAddSubcategoria(false);
        break;
      case "tipoMaterial":
      case "tipoMadera":
        if (!tiposMadera.includes(valor)) {
          setTiposMadera(prev => [...prev, valor].sort());
        }
        setEditForm(prev => ({ ...prev, tipoMaterial: valor }));
        setShowAddTipoMadera(false);
        break;
      case "uso":
        if (!usos.includes(valor)) {
          setUsos(prev => [...prev, valor].sort());
        }
        setEditForm(prev => ({ ...prev, uso: valor }));
        setShowAddUso(false);
        break;
      case "deposito":
        if (!depositos.includes(valor)) {
          setDepositos(prev => [...prev, valor].sort());
        }
        setEditForm(prev => ({ ...prev, deposito: valor }));
        setShowAddDeposito(false);
        break;
      case 'unidadMedida':
        if (!unidadesMedida.includes(valor)) {
          setUnidadesMedida(prev => [...prev, valor].sort());
        }
        setEditForm(prev => ({ ...prev, unidadMedida: valor }));
        setShowAddUnidadMedida(false);
        break;
    }
    setNewValue("");
  };

  const handleCategoriaChange = (value) => {
    setEditForm((prev) => {
      const subcats = subcategoriasPorCategoria[value] || [];
      const shouldResetSubcategoria = prev.subcategoria && !subcats.includes(prev.subcategoria);
      const isCombo = value === "Combos";
      return {
        ...prev,
        categoria: value,
        subcategoria: shouldResetSubcategoria ? "" : prev.subcategoria,
        unidadMedida: isCombo ? "Unidad" : prev.unidadMedida,
        esCombo: isCombo,
        tipoProducto: isCombo ? "combo" : prev.tipoProducto,
      };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage("");
    
    try {
      // Validación de campos obligatorios
      const camposObligatorios = ['nombre', 'descripcion', 'categoria', 'unidadMedida', 'deposito', 'estado', 'estadoTienda'];
      
      if (productoCollection !== "productos_obras") {
        camposObligatorios.push('subcategoria');
        if (!blockPriceEdits) {
          camposObligatorios.push('precioVenta');
        }
      }
      
      // Verificar campos vacíos
      const camposVacios = camposObligatorios.filter(campo => {
        if (campo === 'subcategoria') {
          return !editForm.subcategoria;
        }
        if (campo === "descripcion") {
          return !normalizeDescriptionHtml(editForm.descripcion);
        }
        return !editForm[campo];
      });
      
      if (camposVacios.length > 0) {
        setMessage(`Error: Los siguientes campos son obligatorios: ${camposVacios.join(', ')}`);
        setMessageType("error");
        setSaving(false);
        return;
      }

      if (editForm.categoria === "Combos" && comboItems.length === 0) {
        setMessage("Error: el combo debe tener al menos un componente");
        setMessageType("error");
        setSaving(false);
        return;
      }
      
      const productoRef = doc(db, productoCollection, productId);
      const updates = {};
      const productoById = new Map(
        comboCatalogo.map((item) => [String(item.id), item])
      );
      
      // Solo actualizar campos que han cambiado
      if (editForm.codigo !== producto.codigo) {
        updates.codigo = editForm.codigo;
      }
      if (editForm.nombre !== producto.nombre) {
        updates.nombre = editForm.nombre;
      }
      if (editForm.categoria !== (producto.categoria || "")) {
        updates.categoria = editForm.categoria;
      }
      if (editForm.descripcion !== producto.descripcion) {
        updates.descripcion = editForm.descripcion;
      }
      if (editForm.detalle !== (producto.detalle || "")) {
        updates.detalle = editForm.detalle;
      }
      if (editForm.proveedor !== producto.proveedor) {
        updates.proveedor = editForm.proveedor;
      }
      if (editForm.uso !== (producto.uso || "")) {
        updates.uso = editForm.uso;
      }
      if (editForm.unidadMedida !== producto.unidadMedida) {
        updates.unidadMedida = editForm.unidadMedida;
      }
      if (editForm.deposito !== (producto.deposito || "deposito_1")) {
        updates.deposito = editForm.deposito;
      }
      if (editForm.estado !== producto.estado) {
        updates.estado = editForm.estado;
      }
      if (editForm.estadoTienda !== producto.estadoTienda) {
        updates.estadoTienda = editForm.estadoTienda;
      }
      
      // Siempre subcategoria (minúscula) para productos normales
      const subActual = String(producto.subcategoria ?? producto.subCategoria ?? "");
      if (productoCollection === "productos_obras") {
        if (editForm.subcategoria !== subActual) {
          updates.subCategoria = editForm.subcategoria;
        }
        if (String(producto.subcategoria ?? "") !== "") {
          updates.subcategoria = "";
        }
      } else {
        if (editForm.subcategoria !== subActual) {
          updates.subcategoria = editForm.subcategoria;
        }
        if (String(producto.subCategoria ?? "") !== "") {
          updates.subCategoria = "";
        }
      }
      if (editForm.tipoMaterial !== (producto.tipoMaterial ?? producto.tipoMadera)) {
        updates.tipoMaterial = editForm.tipoMaterial;
      }
      if (String(editForm.largo ?? "") !== String(producto.largo ?? "")) {
        if (editForm.largo === "" || editForm.largo == null) {
          updates.largo = null;
        } else {
          const v = Number(editForm.largo);
          if (Number.isFinite(v)) updates.largo = v;
        }
      }
      if (String(editForm.ancho ?? "") !== String(producto.ancho ?? "")) {
        if (editForm.ancho === "" || editForm.ancho == null) {
          updates.ancho = null;
        } else {
          const v = Number(editForm.ancho);
          if (Number.isFinite(v)) updates.ancho = v;
        }
      }
      if (String(editForm.espesor) !== String(producto.espesor ?? producto.alto ?? "")) {
        const v = editForm.espesor === "" || editForm.espesor == null ? null : Number(editForm.espesor);
        updates.espesor = Number.isFinite(v) ? v : null;
      }
      if (String(editForm.peso ?? "") !== String(producto.peso ?? "")) {
        if (editForm.peso === "" || editForm.peso == null) {
          updates.peso = null;
        } else {
          const v = Number(editForm.peso);
          if (Number.isFinite(v)) {
            const clamped = Math.min(100, Math.max(0, v));
            updates.peso = clamped;
          }
        }
      }
      if (String(editForm.rendimiento ?? "") !== String(producto.rendimiento ?? producto.rendimientoM2 ?? "")) {
        if (editForm.rendimiento === "" || editForm.rendimiento == null) {
          updates.rendimiento = null;
        } else {
          const v = Number(editForm.rendimiento);
          if (Number.isFinite(v) && v >= 0) updates.rendimiento = v;
        }
      }
      if (!blockPriceEdits && String(editForm.costo ?? "") !== String(producto.costo ?? producto.Costo ?? producto.valorCompra ?? "")) {
        if (editForm.costo === "" || editForm.costo == null) {
          updates.costo = null;
        } else {
          const v = Number(editForm.costo);
          if (Number.isFinite(v) && v >= 0) updates.costo = v;
        }
      }
      if (String(editForm.stock ?? "") !== String(producto.stock ?? "")) {
        if (editForm.stock === "" || editForm.stock == null) {
          updates.stock = 0;
        } else {
          const v = Number(editForm.stock);
          if (Number.isFinite(v) && v >= 0) updates.stock = v;
        }
      }
      if (String(editForm.minimoCompra ?? "") !== String(producto.minimoCompra ?? producto.minCompra ?? 1)) {
        if (editForm.minimoCompra === "" || editForm.minimoCompra == null) {
          updates.minimoCompra = 1;
        } else {
          const v = Number(editForm.minimoCompra);
          if (Number.isFinite(v) && v >= 0) updates.minimoCompra = v;
        }
      }
      if (String(editForm.pack ?? "") !== String(producto.pack ?? producto.packSize ?? "")) {
        updates.pack = String(editForm.pack ?? "").trim();
      }
      if (!blockPriceEdits && String(editForm.precioVenta) !== String(producto.precioVenta ?? producto.valorVenta ?? producto.precioCalculado ?? "")) {
        const v = Number(editForm.precioVenta);
        if (Number.isFinite(v) && v >= 0) updates.precioVenta = v;
      }
      if (String(editForm.stockMinimo ?? "") !== String(producto.stockMinimo ?? "")) {
        if (editForm.stockMinimo === "" || editForm.stockMinimo == null) {
          updates.stockMinimo = null;
        } else {
          const v = Number(editForm.stockMinimo);
          if (Number.isFinite(v) && v >= 0) updates.stockMinimo = v;
        }
      }
      if (!blockPriceEdits && String(editForm.valorCompra ?? "") !== String(producto.valorCompra ?? "")) {
        if (editForm.valorCompra === "" || editForm.valorCompra == null) {
          updates.valorCompra = null;
        } else {
          const v = Number(editForm.valorCompra);
          if (Number.isFinite(v) && v >= 0) updates.valorCompra = v;
        }
      }

      if (editForm.categoria === "Combos") {
        const componentesCombo = normalizeComboComponents(comboItems);
        const comboStock = computeComboStock({ componentesCombo }, productoById);
        updates.esCombo = true;
        updates.tipoProducto = "combo";
        updates.componentesCombo = componentesCombo;
        updates.comboComponentIds = getComboComponentIds({ componentesCombo });
        updates.unidadMedida = "Unidad";
        updates.stock = comboStock;
        if (!blockPriceEdits) {
          const precioVenta = Number(editForm.precioVenta);
          if (Number.isFinite(precioVenta) && precioVenta >= 0) {
            updates.precioVenta = precioVenta;
          }
        }
      } else if (isComboProduct(producto)) {
        updates.esCombo = false;
        updates.tipoProducto = "simple";
        updates.componentesCombo = [];
        updates.comboComponentIds = [];
      }

      // Nuevos campos para tienda
      const imagenesActuales = normalizeImagenes(producto.imagenes);
      const imagenesEditadas = normalizeImagenes(editForm.imagenes);
      if (JSON.stringify(imagenesEditadas) !== JSON.stringify(imagenesActuales)) {
        updates.imagenes = imagenesEditadas;
      }
      const discountEditado = {
        amount: Math.max(0, Number(editForm.discount?.amount) || 0),
        percentage: Math.max(0, Math.min(100, Number(editForm.discount?.percentage) || 0)),
      };
      const discountCampoActivo = lastUpdatedDiscountField || discountMode;
      const discountNormalizado = discountCampoActivo === "amount"
        ? { amount: discountEditado.amount, percentage: 0 }
        : { amount: 0, percentage: discountEditado.percentage };
      const discountOriginal = {
        amount: Math.max(0, Number(producto.discount?.amount) || 0),
        percentage: Math.max(0, Math.min(100, Number(producto.discount?.percentage) || 0)),
      };
      if (JSON.stringify(discountNormalizado) !== JSON.stringify(discountOriginal)) {
        updates.discount = discountNormalizado;
      }
      if (editForm.rating !== producto.rating) {
        updates.rating = editForm.rating;
      }
      if (editForm.freeShipping !== producto.freeShipping) {
        updates.freeShipping = editForm.freeShipping;
      }
      if (editForm.featuredBrand !== producto.featuredBrand) {
        updates.featuredBrand = editForm.featuredBrand;
      }
      if (editForm.newArrival !== producto.newArrival) {
        updates.newArrival = editForm.newArrival;
      }
      if (editForm.specialOffer !== producto.specialOffer) {
        updates.specialOffer = editForm.specialOffer;
      }
      if (editForm.mundialOffer !== producto.mundialOffer) {
        updates.mundialOffer = editForm.mundialOffer;
      }
      
      updates.fechaActualizacion = new Date().toISOString();

      const hasStockChange = Object.prototype.hasOwnProperty.call(updates, "stock");
      if (hasStockChange) {
        await runTransaction(db, async (tx) => {
          const snap = await tx.get(productoRef);
          if (!snap.exists()) throw new Error("Producto no encontrado");
          const productoActual = snap.data() || {};
          const stockAntes = Number(productoActual.stock) || 0;
          const stockDespues = Number(updates.stock) || 0;
          const stockDelta = stockDespues - stockAntes;
          if (stockDespues < 0) throw new Error("El stock no puede ser negativo");

          tx.update(productoRef, updates);

          if (stockDelta !== 0) {
            const precioUnitario = Number(
              productoActual.precioVenta ??
                productoActual.valorVenta ??
                updates.precioVenta ??
                producto.precioVenta ??
                0
            );
            const costoUnitario = Number(
              productoActual.costo ??
                productoActual.valorCompra ??
                updates.costo ??
                producto.costo ??
                0
            );
            const cantidad = Math.abs(stockDelta);
            const movRef = doc(collection(db, "movimientos"));
            tx.set(movRef, {
              productoId: productId,
              tipo: "ajuste",
              cantidad,
              modoAjuste: "absoluto",
              stockAntes,
              stockDelta,
              stockDespues,
              stockActualProducto: stockDespues,
              stockFinalDeseado: stockDespues,
              motivo: "edicion_producto",
              usuario: user?.displayName || user?.email || "Sistema",
              usuarioUid: user?.uid || "",
              usuarioEmail: user?.email || "",
              observaciones: "Ajuste de stock por edición manual de producto",
              fecha: serverTimestamp(),
              categoria: updates.categoria || productoActual.categoria || producto.categoria || "",
              nombreProducto:
                updates.nombre || productoActual.nombre || producto.nombre || "",
              numeroPedido: null,
              importeProducto: cantidad * (Number.isFinite(precioUnitario) ? precioUnitario : 0),
              costoUnitario: Number.isFinite(costoUnitario) ? costoUnitario : 0,
              costoTotal: cantidad * (Number.isFinite(costoUnitario) ? costoUnitario : 0),
              origen: "edicion_producto",
            });
          }
        });
      } else {
        await updateDoc(productoRef, updates);
      }
      
      setMessage("Producto actualizado correctamente");
      setMessageType("success");
      
      // Recargar producto para mostrar cambios
      await cargarProducto();
      
    } catch (error) {
      setMessage("Error al actualizar: " + error.message);
      setMessageType("error");
    } finally {
      setSaving(false);
    }
  };

  const handleMultipleImageUpload = async (files) => {
    if (!files || files.length === 0) return;
    
    try {
      setUploadingGallery(true);
      const newUrls = [];
      
      for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        
        const response = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });
        
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Error al subir imagen');
        }
        
        const result = await response.json();
        newUrls.push(result.url);
      }
      
      setEditForm(prev => ({
        ...prev,
        imagenes: [...normalizeImagenes(prev.imagenes), ...newUrls]
      }));
      
    } catch (error) {
      setMessage("Error al subir imágenes: " + error.message);
      setMessageType("error");
    } finally {
      setUploadingGallery(false);
    }
  };

  const removeImage = (index) => {
    setEditForm(prev => ({
      ...prev,
      imagenes: normalizeImagenes(prev.imagenes).filter((_, i) => i !== index)
    }));
  };

  const moveImage = (fromIndex, toIndex) => {
    if (fromIndex === toIndex) return;
    
    setEditForm(prev => {
      const newImagenes = [...normalizeImagenes(prev.imagenes)];
      const [movedImage] = newImagenes.splice(fromIndex, 1);
      newImagenes.splice(toIndex, 0, movedImage);
      
      return {
        ...prev,
        imagenes: newImagenes
      };
    });
  };

  const updateDiscount = (field, value) => {
    const rawValue = String(value ?? "");
    setLastUpdatedDiscountField(field);
    if (rawValue === "") {
      setDiscountInputs((prev) => ({ ...prev, [field]: "" }));
      setEditForm((prev) => ({
        ...prev,
        discount: {
          ...prev.discount,
          [field]: 0,
        },
      }));
      return;
    }
    const numericValue = Number(rawValue);
    const boundedValue = field === "percentage"
      ? Math.max(0, Math.min(100, Number.isFinite(numericValue) ? numericValue : 0))
      : Math.max(0, Number.isFinite(numericValue) ? numericValue : 0);
    const normalizedInput = field === "percentage"
      ? String(Math.trunc(boundedValue))
      : String(boundedValue);
    setDiscountInputs((prev) => ({
      ...prev,
      [field]: normalizedInput,
    }));
    setEditForm(prev => ({
      ...prev,
      discount: {
        ...prev.discount,
        [field]: boundedValue
      }
    }));
  };

  const handleDiscountModeChange = (mode) => {
    setDiscountMode(mode);
  };

  const imagenesGaleria = normalizeImagenes(editForm.imagenes);

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!producto) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <AlertCircle className="w-16 h-16 text-red-500 mb-4" />
        <h1 className="text-2xl font-bold text-gray-800 mb-2">Producto no encontrado</h1>
        <p className="text-gray-600 mb-6">El producto que buscas no existe o fue eliminado.</p>
        <Link href="/productos">
          <Button variant="outline">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Volver a Productos
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="py-8 px-2 max-w-8xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/productos">
            <Button variant="outline" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Volver
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-800">Editar Producto</h1>
            <p className="text-lg text-gray-500">
              {producto.codigo} - {producto.nombre}
            </p>
          </div>
        </div>

        {/* Mensaje de estado */}
        {message && (
          <div className={`mb-6 p-4 rounded-xl flex items-center gap-3 text-sm shadow-lg ${
            messageType === "success"
              ? "bg-gradient-to-r from-green-50 to-emerald-50 text-green-800 border border-green-200"
              : "bg-gradient-to-r from-red-50 to-pink-50 text-red-800 border border-red-200"
          }`}>
            <div className={`p-2 rounded-full ${messageType === "success" ? "bg-green-100" : "bg-red-100"}`}>
              {messageType === "success" ? (
                <CheckCircle className="w-5 h-5 text-green-600" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-600" />
              )}
            </div>
            <div>
              <div className="font-semibold">
                {messageType === "success" ? "¡Éxito!" : "Error"}
              </div>
              <div className="text-sm opacity-90">{message}</div>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Información del producto */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  productoCollection === "productos_obras"
                    ? "bg-purple-100 text-purple-700"
                    : "bg-blue-100 text-blue-700"
                }`}>
                  {productoCollection === "productos_obras" ? "🏗" : "📦"}
                </div>
                Información del Producto
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <span className="font-medium text-gray-700">Código:</span>
                <div className="font-bold text-lg text-gray-900">{producto.codigo}</div>
              </div>
              <div>
                <span className="font-medium text-gray-700">Categoría:</span>
                <div className="font-semibold text-gray-900">{editForm.categoria || "-"}</div>
              </div>
              <div>
                <span className="font-medium text-gray-700">Stock:</span>
                <span className={`ml-2 font-bold ${
                  producto.stock > 10 ? "text-green-600" : 
                  producto.stock > 0 ? "text-yellow-600" : "text-red-600"
                }`}>
                  {producto.stock || 0}
                </span>
              </div>
              <div>
                <span className="font-medium text-gray-700">Estado:</span>
                <span className={`ml-2 px-2 py-1 rounded-full text-xs font-semibold ${
                  producto.estado === "Activo" ? "bg-green-100 text-green-800" :
                  producto.estado === "Inactivo" ? "bg-yellow-100 text-yellow-800" :
                  "bg-red-100 text-red-800"
                }`}>
                  {producto.estado}
                </span>
              </div>
              <div>
                <span className="font-medium text-gray-700">Tienda:</span>
                <span className={`ml-2 px-2 py-1 rounded-full text-xs font-semibold ${
                  producto.estadoTienda === "Activo" ? "bg-green-100 text-green-800" :
                  producto.estadoTienda === "Inactivo" ? "bg-gray-200 text-gray-700" :
                  "bg-yellow-100 text-yellow-700"
                }`}>
                  {producto.estadoTienda ? producto.estadoTienda : "No definido"}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Formulario de edición */}
        <div className="lg:col-span-2 space-y-6">
          {/* Campos básicos */}
          <Card>
            <CardHeader>
              <CardTitle>Información Básica</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    Código del Producto *
                  </label>
                  <Input
                    value={editForm.codigo}
                    onChange={(e) => setEditForm(prev => ({ ...prev, codigo: e.target.value }))}
                    placeholder="Ej: MAD-001"
                    className="font-mono"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    Nombre del Producto *
                  </label>
                  <Input
                    value={editForm.nombre}
                    onChange={(e) => setEditForm(prev => ({ ...prev, nombre: e.target.value }))}
                    placeholder="Nombre del producto"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    Categoría *
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={editForm.categoria}
                      onChange={(e) => handleCategoriaChange(e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">Seleccionar categoría</option>
                      {categorias.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowAddCategoria(true)}
                      className="px-3"
                    >
                      +
                    </Button>
                  </div>
                  {showAddCategoria && (
                    <div className="flex gap-2 mt-2">
                      <Input
                        value={newValue}
                        onChange={(e) => setNewValue(e.target.value)}
                        placeholder="Nueva categoría"
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handleAddNewValue("categoria", newValue)}
                      >
                        Agregar
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setShowAddCategoria(false);
                          setNewValue("");
                        }}
                      >
                        Cancelar
                      </Button>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    Subcategoría {productoCollection !== "productos_obras" ? "*" : "(opcional)"}
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={editForm.subcategoria}
                      onChange={(e) => setEditForm(prev => ({ ...prev, subcategoria: e.target.value }))}
                      disabled={!editForm.categoria}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">
                        {editForm.categoria ? "Seleccionar subcategoría" : "Seleccionar categoría primero"}
                      </option>
                      {subcategoriasDisponibles.map((subcat) => (
                        <option key={subcat} value={subcat}>
                          {subcat}
                        </option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowAddSubcategoria(true)}
                      disabled={!editForm.categoria}
                      className="px-3"
                    >
                      +
                    </Button>
                  </div>
                  {showAddSubcategoria && (
                    <div className="flex gap-2 mt-2">
                      <Input
                        value={newValue}
                        onChange={(e) => setNewValue(e.target.value)}
                        placeholder="Nueva subcategoría"
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handleAddNewValue('subcategoria', newValue)}
                      >
                        Agregar
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setShowAddSubcategoria(false);
                          setNewValue("");
                        }}
                      >
                        Cancelar
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    Estado *
                  </label>
                  <select
                    value={editForm.estado}
                    onChange={(e) => setEditForm(prev => ({ ...prev, estado: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="Activo">Activo</option>
                    <option value="Inactivo">Inactivo</option>
                    <option value="Descontinuado">Descontinuado</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    Estado de Tienda *
                  </label>
                  <select
                    value={editForm.estadoTienda}
                    onChange={(e) => setEditForm(prev => ({ ...prev, estadoTienda: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="Activo">Activo</option>
                    <option value="Inactivo">Inactivo</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    Proveedor
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={editForm.proveedor}
                      onChange={(e) => setEditForm(prev => ({ ...prev, proveedor: e.target.value }))}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">Seleccionar proveedor</option>
                      {proveedores.map((prov) => (
                        <option key={prov} value={prov}>
                          {prov}
                        </option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowAddProveedor(true)}
                      className="px-3"
                    >
                      +
                    </Button>
                  </div>
                  {showAddProveedor && (
                    <div className="flex gap-2 mt-2">
                      <Input
                        value={newValue}
                        onChange={(e) => setNewValue(e.target.value)}
                        placeholder="Nuevo proveedor"
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handleAddNewValue('proveedor', newValue)}
                      >
                        Agregar
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setShowAddProveedor(false);
                          setNewValue("");
                        }}
                      >
                        Cancelar
                      </Button>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    Uso
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={editForm.uso}
                      onChange={(e) => setEditForm(prev => ({ ...prev, uso: e.target.value }))}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">Seleccionar uso</option>
                      {usos.map((uso) => (
                        <option key={uso} value={uso}>
                          {uso}
                        </option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowAddUso(true)}
                      className="px-3"
                    >
                      +
                    </Button>
                  </div>
                  {showAddUso && (
                    <div className="flex gap-2 mt-2">
                      <Input
                        value={newValue}
                        onChange={(e) => setNewValue(e.target.value)}
                        placeholder="Nuevo uso"
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handleAddNewValue("uso", newValue)}
                      >
                        Agregar
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setShowAddUso(false);
                          setNewValue("");
                        }}
                      >
                        Cancelar
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    Unidad de Medida *
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={editForm.unidadMedida}
                      onChange={(e) => setEditForm(prev => ({ ...prev, unidadMedida: e.target.value }))}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">Seleccionar unidad</option>
                      {unidadesMedida.map((unidad) => (
                        <option key={unidad} value={unidad}>
                          {unidad}
                        </option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowAddUnidadMedida(true)}
                      className="px-3"
                    >
                      +
                    </Button>
                  </div>
                  {showAddUnidadMedida && (
                    <div className="flex gap-2 mt-2">
                      <Input
                        value={newValue}
                        onChange={(e) => setNewValue(e.target.value)}
                        placeholder="Nueva unidad de medida"
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handleAddNewValue('unidadMedida', newValue)}
                      >
                        Agregar
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setShowAddUnidadMedida(false);
                          setNewValue("");
                        }}
                      >
                        Cancelar
                      </Button>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    Depósito *
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={editForm.deposito}
                      onChange={(e) => setEditForm(prev => ({ ...prev, deposito: e.target.value }))}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">Seleccionar depósito</option>
                      {depositos.map((deposito) => (
                        <option key={deposito} value={deposito}>
                          {deposito}
                        </option>
                      ))}
                    </select>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowAddDeposito(true)}
                      className="px-3"
                    >
                      +
                    </Button>
                  </div>
                  {showAddDeposito && (
                    <div className="flex gap-2 mt-2">
                      <Input
                        value={newValue}
                        onChange={(e) => setNewValue(e.target.value)}
                        placeholder="Nuevo depósito"
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handleAddNewValue("deposito", newValue)}
                      >
                        Agregar
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setShowAddDeposito(false);
                          setNewValue("");
                        }}
                      >
                        Cancelar
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">
                  Detalle
                </label>
                <textarea
                  value={editForm.detalle}
                  onChange={(e) => setEditForm(prev => ({ ...prev, detalle: e.target.value }))}
                  placeholder="Detalle extendido para venta/presupuesto"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Descripción del Producto</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="rounded-lg border border-gray-300 bg-white overflow-hidden">
                  <div className="h-[360px] min-h-[280px] max-h-[680px] resize-y overflow-hidden">
                    <div
                      ref={descriptionQuillRef}
                      className="h-full [&_.ql-container]:h-[calc(100%-42px)] [&_.ql-editor]:overflow-y-auto"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {editForm.categoria === "Combos" && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Boxes className="w-5 h-5" />
                  Componentes del Combo
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-xl border border-fuchsia-200 bg-fuchsia-50 px-4 py-3 text-sm text-fuchsia-900">
                  El stock del combo se calcula automáticamente según el stock disponible de sus componentes.
                  Stock disponible actual: <strong>{comboStockPreview}</strong>
                </div>

                <Input
                  value={comboSearch}
                  onChange={(e) => setComboSearch(e.target.value)}
                  placeholder="Buscar producto por nombre o código para agregar al combo"
                />

                {comboSuggestions.length > 0 && (
                  <div className="grid gap-2 rounded-xl border border-gray-200 bg-white p-3">
                    {comboSuggestions.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => addComboItem(item)}
                        className="flex items-center justify-between rounded-lg border border-transparent px-3 py-2 text-left transition hover:border-fuchsia-300 hover:bg-fuchsia-50"
                      >
                        <div>
                          <div className="font-medium text-gray-900">{item.nombre}</div>
                          <div className="text-xs text-gray-500">
                            {item.codigo || "Sin código"} · Stock {item.stock ?? 0}
                          </div>
                        </div>
                        <Plus className="w-4 h-4 text-fuchsia-600" />
                      </button>
                    ))}
                  </div>
                )}

                {comboItems.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-fuchsia-300 px-4 py-6 text-sm text-gray-500">
                    Este combo todavía no tiene componentes cargados.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {comboItems.map((item) => (
                      <div
                        key={item.productoId}
                        className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 md:flex-row md:items-center md:justify-between"
                      >
                        <div>
                          <div className="font-medium text-gray-900">{item.nombre || item.productoId}</div>
                          <div className="text-xs text-gray-500">{item.codigo || "Sin código"}</div>
                        </div>
                        <div className="flex items-center gap-3">
                          <Input
                            type="number"
                            min="1"
                            step="1"
                            value={item.cantidad}
                            onChange={(e) => updateComboItemQty(item.productoId, e.target.value)}
                            className="w-24"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => removeComboItem(item.productoId)}
                            className="border-red-200 text-red-600 hover:bg-red-50"
                          >
                            Quitar
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Datos Técnicos y Comerciales</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Largo</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={editForm.largo}
                    onChange={(e) => setEditForm(prev => ({ ...prev, largo: e.target.value }))}
                    placeholder="0"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Ancho</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={editForm.ancho}
                    onChange={(e) => setEditForm(prev => ({ ...prev, ancho: e.target.value }))}
                    placeholder="0"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Espesor (mm)</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={editForm.espesor}
                    onChange={(e) => setEditForm(prev => ({ ...prev, espesor: e.target.value }))}
                    placeholder="0"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Peso (kg)</label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={editForm.peso}
                    onChange={(e) => setEditForm(prev => ({ ...prev, peso: e.target.value }))}
                    placeholder="0"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Rendimiento</label>
                  <Input
                    type="number"
                    min="0"
                    step="0.0001"
                    value={editForm.rendimiento}
                    onChange={(e) => setEditForm(prev => ({ ...prev, rendimiento: e.target.value }))}
                    placeholder="0"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    {editForm.categoria === "Combos" ? "Stock calculado" : "Stock"}
                  </label>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={editForm.categoria === "Combos" ? comboStockPreview : editForm.stock}
                    onChange={(e) => setEditForm(prev => ({ ...prev, stock: e.target.value }))}
                    placeholder="0"
                    disabled={editForm.categoria === "Combos"}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Mínimo de compra</label>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={editForm.minimoCompra}
                    onChange={(e) => setEditForm(prev => ({ ...prev, minimoCompra: e.target.value }))}
                    placeholder="1"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Pack</label>
                  <Input
                    value={editForm.pack}
                    onChange={(e) => setEditForm(prev => ({ ...prev, pack: e.target.value }))}
                    placeholder="Ej: Caja x12"
                  />
                </div>
                {!blockPriceEdits && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">Costo</label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={editForm.costo}
                      onChange={(e) => setEditForm(prev => ({ ...prev, costo: e.target.value }))}
                      disabled={saving}
                      placeholder="0"
                    />
                  </div>
                )}
                {!blockPriceEdits && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">Precio de venta *</label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={editForm.precioVenta}
                      onChange={(e) => setEditForm(prev => ({ ...prev, precioVenta: e.target.value }))}
                      disabled={saving}
                      placeholder="0"
                    />
                  </div>
                )}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Stock mínimo</label>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={editForm.stockMinimo}
                    onChange={(e) => setEditForm(prev => ({ ...prev, stockMinimo: e.target.value }))}
                    placeholder="0"
                  />
                </div>
                {!blockPriceEdits && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">Valor compra</label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={editForm.valorCompra}
                      onChange={(e) => setEditForm(prev => ({ ...prev, valorCompra: e.target.value }))}
                      placeholder="0"
                    />
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Campos específicos por categoría */}
          {productoCollection !== "productos_obras" && editForm.categoria !== "Combos" && (
            <Card>
              <CardHeader>
                <CardTitle>Material</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">Tipo de material</label>
                    <div className="flex gap-2">
                      <select
                        value={editForm.tipoMaterial}
                        onChange={(e) => setEditForm(prev => ({ ...prev, tipoMaterial: e.target.value }))}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="">Seleccionar (opcional)</option>
                        {tiposMadera.map((tipo) => (
                          <option key={tipo} value={tipo}>{tipo}</option>
                        ))}
                      </select>
                      <Button type="button" variant="outline" size="sm" onClick={() => setShowAddTipoMadera(true)} className="px-3">+</Button>
                    </div>
                    {showAddTipoMadera && (
                      <div className="flex gap-2 mt-2">
                        <Input value={newValue} onChange={(e) => setNewValue(e.target.value)} placeholder="Nuevo tipo de material" className="flex-1" />
                        <Button type="button" size="sm" onClick={() => handleAddNewValue("tipoMaterial", newValue)}>Agregar</Button>
                        <Button type="button" variant="outline" size="sm" onClick={() => { setShowAddTipoMadera(false); setNewValue(""); }}>Cancelar</Button>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}


          {/* Campos para tienda */}
          <Card>
            <CardHeader>
              <CardTitle>Configuración de Tienda</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Rating */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">
                  Calificación del Producto
                </label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setEditForm(prev => ({ ...prev, rating: star }))}
                      className={`p-2 rounded-lg transition-colors ${
                        editForm.rating >= star
                          ? 'bg-yellow-100 text-yellow-600 hover:bg-yellow-200'
                          : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                      }`}
                    >
                      <Star className="w-6 h-6 fill-current" />
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-500">
                  Selecciona la calificación del producto (1-5 estrellas)
                </p>
              </div>

              {/* Galería de imágenes */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">
                  Galería de Imágenes
                </label>
                <p className="text-xs text-gray-500 mb-2">
                  Selecciona múltiples imágenes para la galería del producto. Arrastra y suelta para reordenar. (Medida: 420px x 530px)
                </p>
                <div className="flex gap-2">
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => handleMultipleImageUpload(e.target.files)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => document.getElementById('galleryInput').click()}
                    disabled={uploadingGallery}
                  >
                    {uploadingGallery ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Subiendo...
                      </>
                    ) : (
                      'Seleccionar'
                    )}
                  </Button>
                </div>
                {imagenesGaleria.length > 0 && (
                  <div className="space-y-3 mt-3">
                    {imagenesGaleria.map((url, index) => (
                      <div 
                        key={index} 
                        className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200"
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/plain', index.toString());
                        }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
                          moveImage(fromIndex, index);
                        }}
                      >
                        <div className="cursor-move text-gray-400 hover:text-gray-600">
                          <GripVertical className="w-5 h-5" />
                        </div>
                        <img 
                          src={url} 
                          alt={`Imagen ${index + 1}`} 
                          className="w-20 h-20 object-cover rounded-lg border border-gray-200"
                          onError={(e) => {
                            e.target.style.display = 'none';
                          }}
                        />
                        <div className="flex-1">
                          <div className="text-sm font-medium text-gray-700">
                            Imagen {index + 1}
                          </div>
                          <div className="text-xs text-gray-500">
                            Posición: {index + 1} de {imagenesGaleria.length}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => removeImage(index)}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                <input
                  id="galleryInput"
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => handleMultipleImageUpload(e.target.files)}
                  className="hidden"
                />
              </div>

              {/* Descuento */}
              <div className="space-y-3 rounded-xl border border-gray-200 bg-gradient-to-b from-white to-gray-50 p-4">
                <label className="text-sm font-medium text-gray-700">
                  Descuento
                </label>
                <div className="flex rounded-xl border border-gray-300 p-1 bg-white shadow-sm">
                  <button
                    type="button"
                    onClick={() => handleDiscountModeChange("amount")}
                    className={`flex-1 px-3 py-2 rounded-lg text-sm font-semibold transition-all ${
                      discountMode === "amount"
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    Valor fijo ($)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDiscountModeChange("percentage")}
                    className={`flex-1 px-3 py-2 rounded-lg text-sm font-semibold transition-all ${
                      discountMode === "percentage"
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    Porcentaje (%)
                  </button>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-medium text-gray-600">
                    {discountMode === "amount" ? "Monto ($)" : "Porcentaje (%)"}
                  </label>
                  <Input
                    value={discountMode === "amount" ? discountInputs.amount : discountInputs.percentage}
                    onChange={(e) => updateDiscount(discountMode, e.target.value)}
                    placeholder={discountMode === "amount" ? "0.00" : "0"}
                    type="number"
                    step={discountMode === "amount" ? "0.01" : "1"}
                    min="0"
                    max={discountMode === "percentage" ? "100" : undefined}
                  />
                </div>
              </div>

              {/* Etiquetas */}
              <div className="space-y-3">
                <label className="text-sm font-medium text-gray-700">
                  Etiquetas de Tienda
                </label>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editForm.freeShipping}
                      onChange={(e) => setEditForm(prev => ({ ...prev, freeShipping: e.target.checked }))}
                      className="w-4 h-4 text-blue-600"
                    />
                    <Truck className="w-4 h-4 text-blue-600" />
                    <span className="text-sm">Envío Gratis</span>
                  </label>
                  
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editForm.featuredBrand}
                      onChange={(e) => setEditForm(prev => ({ ...prev, featuredBrand: e.target.checked }))}
                      className="w-4 h-4 text-blue-600"
                    />
                    <Star className="w-4 h-4 text-blue-600" />
                    <span className="text-sm">Marca Destacada</span>
                  </label>
                  
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editForm.newArrival}
                      onChange={(e) => setEditForm(prev => ({ ...prev, newArrival: e.target.checked }))}
                      className="w-4 h-4 text-blue-600"
                    />
                    <Gift className="w-4 h-4 text-blue-600" />
                    <span className="text-sm">Nuevo Lanzamiento</span>
                  </label>
                  
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editForm.specialOffer}
                      onChange={(e) => setEditForm(prev => ({ ...prev, specialOffer: e.target.checked }))}
                      className="w-4 h-4 text-blue-600"
                    />
                    <Zap className="w-4 h-4 text-blue-600" />
                    <span className="text-sm">Oferta Especial</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editForm.mundialOffer}
                      onChange={(e) => setEditForm(prev => ({ ...prev, mundialOffer: e.target.checked }))}
                      className="w-4 h-4 text-blue-600"
                    />
                    <Zap className="w-4 h-4 text-blue-600" />
                    <span className="text-sm">Promo Mundial</span>
                  </label>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Botón guardar */}
          <div className="flex justify-end">
            <Button 
              onClick={handleSave} 
              disabled={saving}
              className="px-8 py-3"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Guardar Cambios
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductoDetailPage;
