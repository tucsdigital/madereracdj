"use client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Boxes, DollarSign, ExternalLink, FileText, Image as ImageIcon, Layers, Loader2, Package, Ruler, Store } from "lucide-react";
import { collection, doc, getDoc, getDocs, runTransaction, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/provider/auth.provider";
import { shouldRestrictProductPricing } from "@/lib/access-control";
import { applyDerivedComboStock, computeComboStock, getComboComponentIds, isComboProduct, isValidComboQuantity, normalizeComboComponents } from "@/lib/combos";
import { normalizeStoreSectionCatalog, productBelongsToSection } from "@/lib/tienda-web-ui";
import {
  DEFAULT_UNITS, KIND_HELP, KIND_LABEL, SECTION_OF_FIELD, WOOD_UNITS,
  buildProductUpdates, computePiecePrice, diffForm, getMeasureFields, getPriceModel, getUnitKey, kindForCategory,
  parseNumber, previewStorePrice, productToForm, storedUnit, uniqueOptions, validateProductForm,
} from "@/lib/producto-tipos";
import { Btn, Chip, Segmented, inputClass } from "@/components/panel-ui/ui";
import { TooltipProvider } from "@/components/ui/tooltip";
import ComboComponentBuilder from "@/components/productos/ComboComponentBuilder";
import EditCard from "@/components/productos/edit/EditCard";
import { FormField, NumberInput, SelectAdd, TextArea, TextInput, ToggleCard } from "@/components/productos/edit/Fields";
import SaveBar from "@/components/productos/edit/SaveBar";
import DescriptionEditor from "@/components/productos/edit/DescriptionEditor";
import Gallery from "@/components/productos/edit/Gallery";

const money = (n) => `$${Number(n || 0).toLocaleString("es-AR", { maximumFractionDigits: 2 })}`;
const recipeKey = (items) => JSON.stringify(normalizeComboComponents(items).map(({ productoId, cantidad }) => ({ productoId, cantidad })));

export default function ProductoDetailPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const productId = params.id;
  const { user } = useAuth();
  const blockPriceEdits = shouldRestrictProductPricing(user);

  const [producto, setProducto] = useState(null);
  const [productoCollection, setProductoCollection] = useState("productos");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [initial, setInitial] = useState(null);
  const [form, setForm] = useState(null);
  const [comboItems, setComboItems] = useState([]);
  const [initialRecipe, setInitialRecipe] = useState("[]");
  const [comboValid, setComboValid] = useState(true);
  const [suggested, setSuggested] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [storeCatalog, setStoreCatalog] = useState([]);
  const [storeCatalogLoading, setStoreCatalogLoading] = useState(true);
  const [storeCatalogError, setStoreCatalogError] = useState("");
  const [tiendaSections, setTiendaSections] = useState([]);
  const [tiendaSectionsLoading, setTiendaSectionsLoading] = useState(true);
  const [tiendaSectionsError, setTiendaSectionsError] = useState("");
  const [extra, setExtra] = useState({});
  const [status, setStatus] = useState("idle");
  const [saveMessage, setSaveMessage] = useState("");
  const [showErrors, setShowErrors] = useState(false);
  const [uploading, setUploading] = useState(false);
  const savedTimer = useRef(null);

  const load = useCallback(async () => {
    try {
      const hint = String(searchParams?.get("col") ?? "").trim();
      const order = ["productos", "productos_obras"];
      const cols = order.includes(hint) ? [hint, ...order.filter((c) => c !== hint)] : order;
      for (const col of cols) {
        const snap = await getDoc(doc(db, col, productId));
        if (!snap.exists()) continue;
        const data = { id: snap.id, ...snap.data(), __collection: col };
        const kind = kindForCategory(data.categoria, col);
        const effective = isComboProduct(data) ? "combo" : kind;
        const initialForm = productToForm(data, { collection: col, kind: effective });
        setProductoCollection(col);
        setProducto(data);
        setInitial(initialForm);
        setForm(initialForm);
        const items = normalizeComboComponents(data.componentesCombo);
        setComboItems(items);
        setInitialRecipe(recipeKey(items));
        return;
      }
      setLoadError("No encontramos este producto.");
    } catch (error) {
      setLoadError("No se pudo cargar el producto: " + error.message);
    } finally {
      setLoading(false);
    }
  }, [productId, searchParams]);

  const loadCatalog = useCallback(async () => {
    try {
      const snap = await getDocs(collection(db, "productos"));
      setCatalog(applyDerivedComboStock(snap.docs.map((d) => ({ id: d.id, ...d.data(), __collection: "productos" }))));
    } catch (error) {
      console.error("Error al cargar el catálogo:", error);
    }
  }, []);

  const loadStoreCatalog = useCallback(async () => {
    setStoreCatalogLoading(true);
    setStoreCatalogError("");
    try {
      const response = await fetch("/api/precios?all=1", { cache: "no-store" });
      if (!response.ok) throw new Error(`No se pudo cargar el catálogo público (HTTP ${response.status}).`);
      setStoreCatalog(normalizeStoreSectionCatalog(await response.json()));
    } catch (error) {
      setStoreCatalogError(error?.message || "No se pudo verificar el catálogo de la tienda.");
      setStoreCatalog([]);
    } finally {
      setStoreCatalogLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!productId) return;
    load();
    loadCatalog();
    loadStoreCatalog();
    return () => clearTimeout(savedTimer.current);
  }, [productId, load, loadCatalog, loadStoreCatalog]);

  useEffect(() => {
    let active = true;
    if (!user || typeof user.getIdToken !== "function") {
      setTiendaSectionsLoading(false);
      return () => { active = false; };
    }
    setTiendaSectionsLoading(true);
    user.getIdToken()
      .then((token) => fetch("/api/tienda/config", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }))
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data?.error || "No se pudieron cargar las secciones de la tienda.");
        if (active) setTiendaSections(Array.isArray(data?.config?.secciones) ? data.config.secciones : []);
      })
      .catch((error) => { if (active) setTiendaSectionsError(error.message || "No se pudieron cargar las secciones de la tienda."); })
      .finally(() => { if (active) setTiendaSectionsLoading(false); });
    return () => { active = false; };
  }, [user]);

  const kind = useMemo(() => {
    if (!form) return "general";
    if (productoCollection === "productos_obras") return "obra";
    return kindForCategory(form.categoria, productoCollection);
  }, [form, productoCollection]);
  const unitKey = form ? getUnitKey(kind, form.unidadMedida) : "Unidad";
  const priceModel = getPriceModel(kind, unitKey);
  const measureFields = form ? getMeasureFields(kind, unitKey) : [];

  const comboCatalog = useMemo(() => catalog.filter((item) => item.categoria !== "Obras" && !isComboProduct(item)), [catalog]);
  const comboStock = useMemo(() => computeComboStock({ componentesCombo: comboItems }, new Map(comboCatalog.map((i) => [String(i.id), i]))), [comboCatalog, comboItems]);

  const options = useMemo(() => {
    const pick = (fn) => uniqueOptions(catalog.map(fn));
    const subs = {};
    for (const p of catalog) {
      const c = String(p.categoria || "").trim();
      const s = String(p.subcategoria || p.subCategoria || "").trim();
      if (c && s) (subs[c] ||= new Set()).add(s);
    }
    return {
      categorias: uniqueOptions([...catalog.map((p) => p.categoria), "Combos"]),
      subcategorias: subs,
      proveedores: pick((p) => p.proveedor),
      usos: pick((p) => p.uso),
      materiales: pick((p) => p.tipoMaterial ?? p.tipoMadera),
      depositos: pick((p) => p.deposito),
      unidades: uniqueOptions([...DEFAULT_UNITS, ...catalog.filter((p) => !/madera/i.test(p.categoria || "")).map((p) => p.unidadMedida)]),
    };
  }, [catalog]);
  const withExtra = (key, list) => uniqueOptions([...list, ...(extra[key] || [])]);
  const addExtra = (key) => (value) => setExtra((prev) => ({ ...prev, [key]: [...(prev[key] || []), value] }));

  const set = useCallback((key, value) => setForm((prev) => ({ ...prev, [key]: value })), []);
  const setDescription = useCallback((html) => setForm((prev) => (prev && prev.descripcion !== html ? { ...prev, descripcion: html } : prev)), []);

  const changedFields = useMemo(() => diffForm(initial, form), [initial, form]);
  const recipeChanged = kind === "combo" && recipeKey(comboItems) !== initialRecipe;
  const changeCount = changedFields.length + (recipeChanged ? 1 : 0);
  const dirty = changeCount > 0;
  const changedSections = useMemo(() => {
    const set = new Set(changedFields.map((k) => SECTION_OF_FIELD[k]));
    if (recipeChanged) set.add("composicion");
    return set;
  }, [changedFields, recipeChanged]);

  const validation = useMemo(
    () => (form ? validateProductForm(form, { kind, collection: productoCollection, blockPriceEdits }) : { errors: {}, warnings: {}, valid: true }),
    [form, kind, productoCollection, blockPriceEdits]
  );
  const errors = showErrors ? validation.errors : {};
  const warnings = validation.warnings;
  const errorCount = Object.keys(validation.errors).length;

  useEffect(() => {
    if (status === "saving" || status === "saved") return;
    if (!dirty) setStatus("idle");
    else if (status === "idle") setStatus("dirty");
    else if (status === "error" && validation.valid && (comboValid || kind !== "combo")) setStatus("dirty");
  }, [dirty, status, validation.valid, comboValid, kind]);

  useEffect(() => {
    if (!dirty) return undefined;
    const handler = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const goBack = () => {
    if (dirty && !window.confirm("Tenés cambios sin guardar. ¿Salir igual?")) return;
    router.push("/productos");
  };

  const discard = () => {
    setForm(initial);
    setComboItems(normalizeComboComponents(producto?.componentesCombo));
    setShowErrors(false);
    setStatus("idle");
  };

  const handleCategoria = (value) => {
    setForm((prev) => {
      const subs = options.subcategorias[value] ? [...options.subcategorias[value]] : [];
      const next = { ...prev, categoria: value, subcategoria: prev.subcategoria && !subs.includes(prev.subcategoria) ? "" : prev.subcategoria };
      if (kindForCategory(value, productoCollection) === "combo") next.unidadMedida = "Unidad";
      return next;
    });
  };

  const handleUnit = (key) => set("unidadMedida", kind === "madera" ? storedUnit(kind, key, form.unidadMedida) : key);

  const focusFirstError = (errs) => {
    const first = Object.keys(errs)[0];
    if (!first) return;
    const el = document.getElementById(`f-${first}`) || document.getElementById(SECTION_OF_FIELD[first] || "");
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => el?.focus?.(), 250);
  };

  const handleSave = async () => {
    if (status === "saving") return;
    setShowErrors(true);
    if (uploading) { setSaveMessage("Esperá a que terminen de subir las imágenes."); setStatus("error"); return; }
    if (!validation.valid) { setSaveMessage(""); setStatus("error"); focusFirstError(validation.errors); return; }
    if (kind === "combo" && (!comboValid || comboItems.length === 0)) {
      setSaveMessage(comboItems.length === 0 ? "El combo necesita al menos un producto." : "Corregí las cantidades del combo.");
      setStatus("error");
      document.getElementById("composicion")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setStatus("saving");
    setSaveMessage("");
    try {
      const productoRef = doc(db, productoCollection, productId);
      const updates = buildProductUpdates({ producto, form, kind, collection: productoCollection, blockPriceEdits });

      if (kind === "combo") {
        const byId = new Map(comboCatalog.map((item) => [String(item.id), item]));
        const normalized = normalizeComboComponents(comboItems);
        if (!normalized.length || normalized.length !== comboItems.length) throw new Error("Cada producto del combo necesita una cantidad válida.");
        const componentes = normalized.map((c) => {
          const base = byId.get(String(c.productoId));
          if (!base) throw new Error(`${c.nombre || c.productoId} ya no está disponible como producto simple. Quitalo y agregá otro.`);
          if (!isValidComboQuantity(c.cantidad, base.unidadMedida || base.unidad)) throw new Error(`${base.nombre} necesita una cantidad válida para su unidad (${base.unidadMedida || base.unidad || "Unidad"}).`);
          return { ...c, nombre: base.nombre || c.nombre, codigo: base.codigo || c.codigo, categoria: base.categoria || "", unidadMedida: base.unidadMedida || base.unidad || "" };
        });
        const costs = componentes.map((c) => {
          const b = byId.get(String(c.productoId));
          const cost = Number(b?.costo ?? b?.valorCompra ?? b?.costoCompra);
          return Number.isFinite(cost) && cost > 0 ? cost * c.cantidad : null;
        });
        const totalCost = costs.every((c) => c !== null) ? costs.reduce((a, b) => a + b, 0) : null;
        const recipeDiff = recipeKey(componentes) !== recipeKey(producto.componentesCombo);
        Object.assign(updates, {
          esCombo: true,
          tipoProducto: "combo",
          componentesCombo: componentes,
          comboComponentIds: getComboComponentIds({ componentesCombo: componentes }),
          unidadMedida: "Unidad",
          stock: computeComboStock({ componentesCombo: componentes }, byId),
          versionComposicion: Math.max(1, Number(producto.versionComposicion) || 1) + (recipeDiff ? 1 : 0),
          costoComponentesCalculado: totalCost,
          costo: totalCost,
        });
        if (recipeDiff) updates.composicionActualizadaEn = new Date().toISOString();
      } else if (isComboProduct(producto)) {
        Object.assign(updates, { esCombo: false, tipoProducto: "simple", componentesCombo: [], comboComponentIds: [] });
      }
      updates.fechaActualizacion = new Date().toISOString();

      if (kind === "combo") {
        if (!user || typeof user.getIdToken !== "function") throw new Error("No hay usuario autenticado.");
        const idToken = await user.getIdToken();
        const response = await fetch(`/api/erp/combos/${encodeURIComponent(productId)}`, {
          method: "PUT",
          headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ combo: updates }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result?.ok) throw new Error(result?.error || "No se pudo actualizar el combo.");
      } else if (Object.prototype.hasOwnProperty.call(updates, "stock") && !isComboProduct(producto)) {
        await runTransaction(db, async (tx) => {
          const snap = await tx.get(productoRef);
          if (!snap.exists()) throw new Error("Producto no encontrado");
          const actual = snap.data() || {};
          const antes = Number(actual.stock) || 0;
          const despues = Number(updates.stock) || 0;
          const delta = despues - antes;
          tx.update(productoRef, updates);
          if (delta !== 0) {
            const precio = Number(updates.valorVenta ?? updates.precioVenta ?? actual.valorVenta ?? actual.precioVenta ?? actual.precioCalculado ?? 0) || 0;
            const costo = Number(updates.costo ?? actual.costo ?? actual.valorCompra ?? 0) || 0;
            const cantidad = Math.abs(delta);
            tx.set(doc(collection(db, "movimientos")), {
              productoId: productId, tipo: "ajuste", cantidad, modoAjuste: "absoluto",
              stockAntes: antes, stockDelta: delta, stockDespues: despues, stockActualProducto: despues, stockFinalDeseado: despues,
              motivo: "edicion_producto",
              usuario: user?.displayName || user?.email || "Sistema", usuarioUid: user?.uid || "", usuarioEmail: user?.email || "",
              observaciones: "Ajuste de stock por edición manual de producto",
              fecha: serverTimestamp(),
              categoria: updates.categoria || actual.categoria || producto.categoria || "",
              nombreProducto: updates.nombre || actual.nombre || producto.nombre || "",
              numeroPedido: null, importeProducto: cantidad * precio, costoUnitario: costo, costoTotal: cantidad * costo, origen: "edicion_producto",
            });
          }
        });
      } else {
        await updateDoc(productoRef, updates);
      }

      await Promise.all([load(), loadCatalog()]);
      setShowErrors(false);
      setStatus("saved");
      clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setStatus("idle"), 2500);
    } catch (error) {
      setSaveMessage(error.message || "No se pudo guardar.");
      setStatus("error");
    }
  };

  if (loading) {
    return <div className="flex min-h-[50vh] items-center justify-center text-default-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Cargando producto…</div>;
  }
  if (loadError || !form) {
    return (
      <div className="mx-auto max-w-md space-y-4 py-16 text-center">
        <p className="text-sm text-default-600">{loadError || "No encontramos este producto."}</p>
        <Link href="/productos"><Btn variant="primary"><ArrowLeft className="h-4 w-4" /> Volver a productos</Btn></Link>
      </div>
    );
  }

  const saving = status === "saving";
  const preview = previewStorePrice(form, kind);
  const sectionProduct = {
    ...producto,
    ...form,
    id: String(producto?.id || productId),
    codigo: producto?.codigo,
    tipoProducto: kind === "combo" ? "combo" : producto?.tipoProducto,
    esCombo: kind === "combo" || producto?.esCombo === true,
    price: preview.base,
    precio: preview.base,
    discount: {
      amount: form.discountMode === "amount" ? Number(form.discountValue) || 0 : 0,
      percentage: form.discountMode === "percentage" ? Number(form.discountValue) || 0 : 0,
    },
    descuento: {
      amount: form.discountMode === "amount" ? Number(form.discountValue) || 0 : 0,
      percentage: form.discountMode === "percentage" ? Number(form.discountValue) || 0 : 0,
    },
  };
  const sectionPricingChanged = changedFields.some((field) => ["precio", "discountMode", "discountValue"].includes(field));
  const sectionCatalog = storeCatalog
    .map((item) => {
      if (String(item.id) !== String(sectionProduct.id)) return item;
      const preview = { ...item, ...sectionProduct, category: sectionProduct.categoria };
      if (!sectionPricingChanged) {
        preview.price = item.price;
        preview.precio = item.precio;
        preview.discount = item.discount;
        preview.descuento = item.descuento;
      }
      return preview;
    })
    .filter((item) => item.estadoTienda === undefined || item.estadoTienda === "Activo");
  const productIsInStoreCatalog = sectionCatalog.some((item) => String(item.id) === String(sectionProduct.id));
  const matchingTiendaSections = tiendaSections.filter((section) => productBelongsToSection(sectionProduct, section, sectionCatalog));
  const piece = kind === "madera" ? computePiecePrice(form, unitKey) : 0;
  const cost = parseNumber(form.costo);
  const price = parseNumber(form.precio);
  const margin = kind !== "madera" && kind !== "combo" && price && cost !== null && price > 0 ? { amount: price - cost, pct: ((price - cost) / price) * 100 } : null;
  const subcats = withExtra(`sub-${form.categoria}`, options.subcategorias[form.categoria] ? [...options.subcategorias[form.categoria]] : []);
  const isWood = kind === "madera";
  const isCombo = kind === "combo";
  const isObra = kind === "obra";
  const mod = (id) => changedSections.has(id);
  const unitOptions = isWood ? WOOD_UNITS : null;

  return (
    <TooltipProvider delayDuration={150}>
      <div className="mx-auto space-y-6 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <Btn variant="secondary" aria-label="Volver a productos" onClick={goBack} className="h-10 w-10 px-0"><ArrowLeft className="h-4 w-4" /></Btn>
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-semibold leading-tight">{form.nombre || "Producto sin nombre"}</h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-default-500">
                {form.codigo ? <span>Código {form.codigo}</span> : null}
                <Chip>{KIND_LABEL[kind]}</Chip>
                <Chip tone={form.estado === "Activo" ? "ok" : "neutral"}>{form.estado || "Activo"}</Chip>
                {!isObra ? <Chip tone={form.estadoTienda === "Activo" ? "ok" : "warn"}>{form.estadoTienda === "Activo" ? "Visible en la tienda" : "Oculto en la tienda"}</Chip> : null}
              </div>
            </div>
          </div>
          {!isObra && form.estadoTienda === "Activo" && process.env.NEXT_PUBLIC_TIENDA_URL ? (
            <a href={`${String(process.env.NEXT_PUBLIC_TIENDA_URL).replace(/\/+$/, "")}/shop/product/${encodeURIComponent(productId)}`} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center rounded-lg border border-border bg-card px-3 text-sm font-medium hover:bg-default-100">Ver en la tienda ↗</a>
          ) : null}
        </div>
        <p className="-mt-3 text-sm text-default-500">{KIND_HELP[kind]}</p>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="space-y-6">
            <EditCard id="general" title="Datos generales" description="Cómo se identifica y se clasifica el producto." icon={Package} modified={mod("general")}>
              <div className="grid gap-5 sm:grid-cols-2">
                <FormField id="f-codigo" label="Código" required error={errors.codigo} tip="Código interno único. Lo ves en ventas, stock y presupuestos.">
                  <TextInput id="f-codigo" value={form.codigo} error={errors.codigo} onChange={(e) => set("codigo", e.target.value)} />
                </FormField>
                <FormField id="f-nombre" label="Nombre" required error={errors.nombre} tip="Es el título que ve el cliente en la tienda.">
                  <TextInput id="f-nombre" value={form.nombre} error={errors.nombre} onChange={(e) => set("nombre", e.target.value)} />
                </FormField>
                <FormField id="f-categoria" label="Categoría" required error={errors.categoria} tip={isCombo ? "Los combos usan la categoría Combos." : "Define el tipo de producto y qué datos se piden."}>
                  <SelectAdd id="f-categoria" value={form.categoria} error={errors.categoria} options={withExtra("categorias", options.categorias)} onChange={handleCategoria} onAdd={addExtra("categorias")} addLabel="Nueva categoría" addPlaceholder="Nombre de la categoría" disabled={isObra} />
                </FormField>
                {!isCombo && !isObra ? (
                  <FormField id="f-subcategoria" label="Subcategoría" required error={errors.subcategoria} tip="Agrupa el producto dentro de su categoría en la tienda.">
                    <SelectAdd id="f-subcategoria" value={form.subcategoria} error={errors.subcategoria} options={subcats} onChange={(v) => set("subcategoria", v)} onAdd={form.categoria ? addExtra(`sub-${form.categoria}`) : undefined} addLabel="Nueva subcategoría" addPlaceholder="Nombre de la subcategoría" />
                  </FormField>
                ) : null}
                {isWood ? (
                  <FormField id="f-tipoMaterial" label="Tipo de madera" tip="Especie o material, por ejemplo Pino, Eucalipto o Paraíso.">
                    <SelectAdd id="f-tipoMaterial" value={form.tipoMaterial} options={withExtra("materiales", options.materiales)} onChange={(v) => set("tipoMaterial", v)} onAdd={addExtra("materiales")} addLabel="Nuevo tipo de madera" addPlaceholder="Tipo de madera" />
                  </FormField>
                ) : null}
                {isWood ? (
                  <FormField id="f-uso" label="Uso" tip="Para qué se usa: estructura, revestimiento, deck…">
                    <SelectAdd id="f-uso" value={form.uso} options={withExtra("usos", options.usos)} onChange={(v) => set("uso", v)} onAdd={addExtra("usos")} addLabel="Nuevo uso" addPlaceholder="Uso" />
                  </FormField>
                ) : null}
                {!isCombo ? (
                  <FormField id="f-proveedor" label="Proveedor" tip="A quién se lo comprás. Solo uso interno.">
                    <SelectAdd id="f-proveedor" value={form.proveedor} options={withExtra("proveedores", options.proveedores)} onChange={(v) => set("proveedor", v)} onAdd={addExtra("proveedores")} addLabel="Nuevo proveedor" addPlaceholder="Nombre del proveedor" />
                  </FormField>
                ) : null}
                <FormField id="f-deposito" label="Depósito" required error={errors.deposito} tip="Dónde se guarda el stock.">
                  <SelectAdd id="f-deposito" value={form.deposito} error={errors.deposito} options={withExtra("depositos", options.depositos)} onChange={(v) => set("deposito", v)} onAdd={addExtra("depositos")} addLabel="Nuevo depósito" addPlaceholder="Nombre del depósito" />
                </FormField>
                {isWood ? (
                  <FormField id="f-ubicacion" label="Ubicación en depósito" tip="Sector o estante donde está la madera, por ejemplo Playón A.">
                    <TextInput id="f-ubicacion" value={form.ubicacion} onChange={(e) => set("ubicacion", e.target.value)} placeholder="Ej: Playón A" />
                  </FormField>
                ) : null}
                <FormField id="f-estado" label="Estado" tip="Activo: se usa en ventas. Inactivo o descontinuado: deja de ofrecerse.">
                  <select id="f-estado" className={inputClass} value={form.estado} onChange={(e) => set("estado", e.target.value)}>
                    <option value="Activo">Activo</option>
                    <option value="Inactivo">Inactivo</option>
                    <option value="Descontinuado">Descontinuado</option>
                  </select>
                </FormField>
              </div>
            </EditCard>

            <EditCard id="descripcion" title="Descripción" description="El texto que ve el cliente en la ficha del producto." icon={FileText} modified={mod("descripcion")}>
              <div className="space-y-5">
                <FormField id="f-descripcion" required error={errors.descripcion}>
                  <DescriptionEditor id="f-descripcion" value={form.descripcion} onChange={setDescription} invalid={Boolean(errors.descripcion)} />
                </FormField>
                <FormField id="f-detalle" label="Detalle adicional" tip="Nota breve complementaria, por ejemplo cuidados o recomendaciones.">
                  <TextArea id="f-detalle" rows={2} value={form.detalle} onChange={(e) => set("detalle", e.target.value)} />
                </FormField>
              </div>
            </EditCard>

            <EditCard id="imagenes" title="Imágenes" description="Fotos del producto para la tienda." icon={ImageIcon} modified={mod("imagenes")}>
              <Gallery images={form.imagenes} onChange={(imgs) => set("imagenes", imgs)} disabled={saving} onBusyChange={setUploading} />
            </EditCard>

            {!isCombo ? (
              <EditCard id="medidas" title={isWood || measureFields.length ? "Unidad y medidas" : "Unidad"} description="Cómo se vende y cuánto mide cada unidad." icon={Ruler} modified={mod("medidas")}>
                <div className="grid gap-5 sm:grid-cols-2">
                  <FormField id="f-unidadMedida" label="Se vende por" required error={errors.unidadMedida} tip={isWood ? "Define cómo se calcula el precio de cada pieza." : "Unidad en la que se cuenta y se vende el producto."}>
                    {unitOptions ? (
                      <select id="f-unidadMedida" className={inputClass} value={unitKey} onChange={(e) => handleUnit(e.target.value)}>
                        {unitOptions.map((u) => <option key={u.key} value={u.key}>{u.label}</option>)}
                      </select>
                    ) : (
                      <SelectAdd id="f-unidadMedida" value={form.unidadMedida} error={errors.unidadMedida} options={withExtra("unidades", options.unidades)} onChange={handleUnit} onAdd={addExtra("unidades")} addLabel="Nueva unidad" addPlaceholder="Unidad de medida" />
                    )}
                  </FormField>
                  {measureFields.map((m) => (
                    <FormField key={m.key} id={`f-${m.key}`} label={m.label} required={isWood} error={errors[m.key]} tip={m.help}>
                      <NumberInput id={`f-${m.key}`} suffix={m.suffix} value={form[m.key]} error={errors[m.key]} onChange={(e) => set(m.key, e.target.value)} />
                    </FormField>
                  ))}
                  {unitKey === "M2" ? (
                    <FormField id="f-rendimiento" label="Rendimiento" tip="Metros cuadrados que rinde cada unidad, si querés informarlo.">
                      <NumberInput id="f-rendimiento" suffix="m²" value={form.rendimiento} onChange={(e) => set("rendimiento", e.target.value)} />
                    </FormField>
                  ) : null}
                  <FormField id="f-peso" label="Peso por unidad" error={errors.peso} tip="Se usa para calcular el costo de envío.">
                    <NumberInput id="f-peso" suffix="kg" value={form.peso} error={errors.peso} onChange={(e) => set("peso", e.target.value)} />
                  </FormField>
                </div>
              </EditCard>
            ) : null}

            {isCombo ? (
              <EditCard id="composicion" title="Composición" description="Los productos que forman el combo. El stock y el costo se calculan con ellos." icon={Layers} modified={mod("composicion")}>
                <ComboComponentBuilder
                  productos={comboCatalog}
                  value={comboItems}
                  disabled={saving}
                  showCosts={!blockPriceEdits}
                  salePrice={form.precio}
                  onSuggestedPrice={setSuggested}
                  onValidityChange={setComboValid}
                  onChange={setComboItems}
                />
                {!blockPriceEdits && Number.isFinite(suggested) && suggested > 0 && Number(form.precio) !== suggested ? (
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-default-100 px-4 py-3 text-sm">
                    <span>Precio sugerido por composición: <strong>{money(suggested)}</strong></span>
                    <Btn size="sm" disabled={saving} onClick={() => set("precio", String(suggested))}>Usar precio sugerido</Btn>
                  </div>
                ) : null}
              </EditCard>
            ) : null}

            {!isObra && !blockPriceEdits ? (
              <EditCard id="precio" title="Precio" description={isWood ? "Se carga por unidad de medida; el precio de la pieza se calcula solo." : "Lo que te cuesta y lo que paga el cliente."} icon={DollarSign} modified={mod("precio")}>
                <div className="grid gap-5 sm:grid-cols-2">
                  {!isCombo ? (
                    <FormField id="f-costo" label="Costo" error={errors.costo} tip="Lo que te cuesta cada unidad. Solo uso interno, el cliente no lo ve.">
                      <NumberInput id="f-costo" prefix="$" value={form.costo} error={errors.costo} onChange={(e) => set("costo", e.target.value)} />
                    </FormField>
                  ) : null}
                  <FormField id="f-precio" label={priceModel.label} required error={errors.precio} warning={warnings.precio} tip={priceModel.help}>
                    <NumberInput id="f-precio" prefix="$" value={form.precio} error={errors.precio} warning={warnings.precio} onChange={(e) => set("precio", e.target.value)} />
                  </FormField>
                  {isWood ? (
                    <FormField id="f-pieza" label="Precio de la pieza" tip="Resultado de multiplicar el precio por las medidas. Es el precio que ve el cliente por cada pieza.">
                      <div className="flex h-10 items-center rounded-lg bg-default-100 px-3 text-sm font-medium">{piece > 0 ? money(piece) : "Completá precio y medidas"}</div>
                    </FormField>
                  ) : null}
                  {margin ? (
                    <FormField id="f-margen" label="Margen" tip="Diferencia entre precio de venta y costo.">
                      <div className={`flex h-10 items-center rounded-lg bg-default-100 px-3 text-sm font-medium ${margin.amount < 0 ? "text-destructive" : ""}`}>{money(margin.amount)} ({margin.pct.toFixed(1)}%)</div>
                    </FormField>
                  ) : null}
                </div>
              </EditCard>
            ) : null}
            {!isObra && blockPriceEdits ? <p className="rounded-xl border border-border bg-card px-5 py-4 text-sm text-default-500">Tu usuario no puede ver ni modificar precios y costos.</p> : null}

            <EditCard id="stock" title="Stock y compra" description="Cuánto hay y cómo se puede comprar." icon={Boxes} modified={mod("stock")}>
              <div className="grid gap-5 sm:grid-cols-2">
                {isCombo ? (
                  <FormField id="f-stock" label="Stock disponible" tip="Se calcula con el stock de los productos del combo. No se edita a mano.">
                    <div className="flex h-10 items-center rounded-lg bg-default-100 px-3 text-sm font-medium">{comboStock} combos</div>
                  </FormField>
                ) : (
                  <FormField id="f-stock" label="Stock" error={errors.stock} tip="Unidades disponibles. Al cambiarlo se registra un ajuste en movimientos.">
                    <NumberInput id="f-stock" value={form.stock} error={errors.stock} onChange={(e) => set("stock", e.target.value)} />
                  </FormField>
                )}
                <FormField id="f-stockMinimo" label="Stock mínimo" error={errors.stockMinimo} tip="Debajo de este número el producto se marca con stock bajo.">
                  <NumberInput id="f-stockMinimo" value={form.stockMinimo} error={errors.stockMinimo} onChange={(e) => set("stockMinimo", e.target.value)} />
                </FormField>
                <FormField id="f-minimoCompra" label="Compra mínima" error={errors.minimoCompra} warning={warnings.minimoCompra} tip="Cantidad mínima que puede comprar un cliente en la tienda.">
                  <NumberInput id="f-minimoCompra" value={form.minimoCompra} error={errors.minimoCompra} warning={warnings.minimoCompra} onChange={(e) => set("minimoCompra", e.target.value)} />
                </FormField>
                <FormField id="f-pack" label="Unidades por pack" error={errors.pack} hint={form.packLegacy ? `Antes decía "${form.packLegacy}". Ingresá solo el número.` : undefined} tip="Si se vende en packs, cuántas unidades trae cada uno. Dejalo vacío si se vende suelto.">
                  <NumberInput id="f-pack" value={form.pack} error={errors.pack} hint={form.packLegacy} onChange={(e) => set("pack", e.target.value)} />
                </FormField>
              </div>
            </EditCard>

            {!isObra ? (
              <EditCard id="tienda" title="Tienda online" icon={Store} modified={mod("tienda")}>
                <div className="space-y-4">
                  <div className="grid gap-5 sm:grid-cols-2">
                    <FormField id="f-estadoTienda" label="Visibilidad" tip="Activo: el producto se muestra y se puede comprar. Inactivo: queda oculto.">
                      <select id="f-estadoTienda" className={inputClass} value={form.estadoTienda} onChange={(e) => set("estadoTienda", e.target.value)}>
                        <option value="Activo">Visible en la tienda</option>
                        <option value="Inactivo">Oculto</option>
                      </select>
                    </FormField>
                    <FormField id="f-discountValue" label="Descuento" error={errors.discountValue} tip="Se resta del precio en la tienda. Elegí monto fijo o porcentaje.">
                      <div className="flex gap-2">
                        <Segmented value={form.discountMode} onChange={(v) => set("discountMode", v)} options={[{ value: "amount", label: "$" }, { value: "percentage", label: "%" }]} />
                        <NumberInput id="f-discountValue" className="flex-1" value={form.discountValue} error={errors.discountValue} onChange={(e) => set("discountValue", e.target.value)} />
                      </div>
                    </FormField>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <ToggleCard checked={form.newArrival} onChange={(v) => set("newArrival", v)} title="Novedad" />
                    <ToggleCard checked={form.featuredBrand} onChange={(v) => set("featuredBrand", v)} title="Destacado" />
                    <ToggleCard checked={form.specialOffer} onChange={(v) => set("specialOffer", v)} title="Oferta" />
                  </div>
                  <div className="flex min-h-8 flex-wrap items-center gap-2 border-t border-border pt-3">
                    <span className="mr-1 text-xs font-medium text-default-500">Secciones</span>
                    {tiendaSectionsLoading || storeCatalogLoading ? <span className="h-5 w-16 animate-pulse rounded-full bg-default-100" aria-label="Cargando secciones" />
                      : tiendaSectionsError || storeCatalogError ? <span className="text-xs text-default-400" title={tiendaSectionsError || storeCatalogError}>No disponible</span>
                        : form.estadoTienda !== "Activo" || !productIsInStoreCatalog || matchingTiendaSections.length === 0 ? <span className="text-xs text-default-400" title="El producto no aparece actualmente en ninguna sección activa del inicio">—</span>
                          : matchingTiendaSections.map((section) => <span key={section.id} className="rounded-full bg-default-100 px-2.5 py-1 text-xs text-default-700">{section.titulo}</span>)}
                    <Link href={`/${params.lang || "es"}/tienda-web`} aria-label="Editar secciones de la tienda" title="Editar secciones" className="ml-auto inline-flex h-7 w-7 items-center justify-center rounded-md text-default-500 hover:bg-default-100 hover:text-foreground"><ExternalLink className="h-3.5 w-3.5" /></Link>
                  </div>
                </div>
              </EditCard>
            ) : null}
          </div>

          <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              <div className="aspect-square bg-default-100">
                {form.imagenes[0] ? <img src={form.imagenes[0]} alt="Imagen principal" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-default-400"><ImageIcon className="h-10 w-10" /></div>}
              </div>
              <div className="space-y-3 p-4 text-sm">
                <p className="font-medium leading-snug">{form.nombre || "Sin nombre"}</p>
                {!isObra && !blockPriceEdits ? (
                  <div>
                    <p className="text-xs text-default-500">Así lo ve el cliente{isWood ? " (por pieza)" : ""}</p>
                    {preview.base > 0 ? (
                      <p className="text-lg font-semibold">
                        {money(preview.final)}
                        {preview.discounted ? <span className="ml-2 text-sm font-normal text-default-400 line-through">{money(preview.base)}</span> : null}
                      </p>
                    ) : <p className="text-default-500">Sin precio cargado</p>}
                  </div>
                ) : null}
                <dl className="space-y-1.5 border-t border-border pt-3 text-xs text-default-600">
                  <div className="flex justify-between"><dt>Stock</dt><dd className="font-medium text-foreground">{isCombo ? comboStock : form.stock || 0}</dd></div>
                  {!isObra ? <div className="flex justify-between"><dt>Tienda</dt><dd className="font-medium text-foreground">{form.estadoTienda === "Activo" ? "Visible" : "Oculto"}</dd></div> : null}
                  <div className="flex justify-between"><dt>Imágenes</dt><dd className="font-medium text-foreground">{form.imagenes.length}</dd></div>
                </dl>
              </div>
            </div>
            <nav aria-label="Secciones" className="hidden rounded-xl border border-border bg-card p-2 text-sm lg:block">
              {[["general", "Datos generales"], ["descripcion", "Descripción"], ["imagenes", "Imágenes"], !isCombo && ["medidas", "Unidad y medidas"], isCombo && ["composicion", "Composición"], !isObra && !blockPriceEdits && ["precio", "Precio"], ["stock", "Stock y compra"], !isObra && ["tienda", "Tienda online"]].filter(Boolean).map(([id, label]) => (
                <a key={id} href={`#${id}`} className="flex items-center justify-between rounded-lg px-3 py-2 text-default-600 hover:bg-default-100 hover:text-foreground">
                  {label}{changedSections.has(id) ? <span className="h-2 w-2 rounded-full bg-amber-500" aria-label="Modificado" /> : null}
                </a>
              ))}
            </nav>
          </aside>
        </div>

        <SaveBar status={status} count={changeCount} errorCount={errorCount} message={saveMessage} onSave={handleSave} onDiscard={discard} />
      </div>
    </TooltipProvider>
  );
}
