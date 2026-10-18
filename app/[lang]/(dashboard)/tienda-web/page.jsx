"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/provider/auth.provider";
import { TIENDA_DEFAULTS, normalizeTiendaConfig, tiendaIssues } from "@/lib/tienda-config";
import { countIssues, moveItem, newId, renumber } from "@/lib/tienda-web-ui";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Btn } from "@/components/tienda-web/ui";
import { BannerList, CategoriaGrid, SeccionList } from "@/components/tienda-web/Lists";
import { BannerEditor, CategoriaEditor, SeccionEditor } from "@/components/tienda-web/Editors";
import ObrasManager, { HomeContentEditor } from "@/components/tienda-web/ObrasManager";
import ContactoForm from "@/components/tienda-web/ContactoForm";
import TransferenciaForm from "@/components/tienda-web/TransferenciaForm";
import NotificacionesPedidosForm from "@/components/tienda-web/NotificacionesPedidosForm";
import PreciosForm from "@/components/tienda-web/PreciosForm";
import StockForm from "@/components/tienda-web/StockForm";
import ProductosContenidoManager from "@/components/tienda-web/ProductosContenidoManager";
import { db } from "@/lib/firebase";
import { collection, getDocs, query as fsQuery, where } from "firebase/firestore";

const TABS = [
  { id: "inicio", label: "Inicio", help: "Administrá los textos e imágenes generales de la portada de la tienda." },
  { id: "secciones", label: "Secciones", help: "Las filas de productos que se ven en el inicio, en este orden." },
  { id: "banners", label: "Banners", help: "Las imágenes grandes del carrusel principal. Arrastralas para cambiar el orden." },
  { id: "obras", label: "Obras", help: "Administrá las obras publicadas y, en su pestaña Inicio, el contenido de la página pública /obras. Arrastrá las obras para definir su orden en los listados." },
  { id: "productos", label: "Productos", help: "Administrá imágenes y descripciones por categoría, tipo o producto, sin modificar precios ni stock." },
  { id: "categorias", label: "Categorías", help: "Las tarjetas de “Comprá por material”. Arrastralas para cambiar el orden." },
  { id: "contacto", label: "Contacto", help: "Administrá los datos, horarios, redes y formulario de contacto globales de la tienda." },
  { id: "precios", label: "Precios", help: "Ajustá en porcentaje lo que cuestan los productos en la tienda online. Los precios originales del sistema no cambian." },
  { id: "stock", label: "Stock", help: "Decidí si se puede vender sin stock, cuándo ocultar un producto y cuándo avisar que quedan pocas unidades." },
  { id: "transferencia", label: "Datos", help: "El descuento por transferencia y los datos bancarios que ve el cliente al terminar su compra." },
  { id: "notificaciones", label: "Avisos de pedidos", help: "Configurá qué eventos de pedidos se notifican por email al equipo y consultá el historial de entregas." },
];

const NEW_ITEM = {
  banners: () => ({ id: newId("banner"), activo: true, titulo: "Nuevo banner", enlace: "/shop", imagen: "", imagenMovil: "", alt: "", desde: "", hasta: "" }),
  secciones: () => ({
    id: newId("seccion"), activa: true, eyebrow: "", titulo: "Nueva sección", subtitulo: "", linkLabel: "Ver todos", linkSuffix: " los productos", fondo: "gris",
    regla: { tipo: "oferta", valor: "", minDescuento: 0, productos: [] }, limite: 8, enlace: "/shop?filter=specialOffer",
  }),
  categorias: () => ({ id: newId("categoria"), activa: true, titulo: "Nueva categoría", etiqueta: "", enlace: "/shop", imagen: "" }),
};

const when = (iso) => (iso ? new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "");
const kb = (bytes) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
const perItem = (issues, scope, length) => Array.from({ length }, (_, i) => issues.filter((issue) => issue.scope === scope && issue.index === i).length);

export default function TiendaWebPage() {
  const { user } = useAuth();
  const tiendaUrl = process.env.NEXT_PUBLIC_TIENDA_URL || "";

  const [config, setConfig] = useState(null);
  const [saved, setSaved] = useState(null);
  const [meta, setMeta] = useState({ version: 0, savedAt: null, imageHosts: [] });
  const [tab, setTab] = useState("secciones");
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState(null);
  const [showProblems, setShowProblems] = useState(false);
  const [openObrasInicio, setOpenObrasInicio] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [media, setMedia] = useState({ storage: null, items: [], loaded: false });
  const [catalog, setCatalog] = useState({ products: [], categories: [], loading: true, error: "" });
  const [productSaveState, setProductSaveState] = useState({ dirty: false, saving: false, save: null, discard: null });
  const [priceProducts, setPriceProducts] = useState({ items: [], loading: false, all: false, loaded: false });
  const loadedFor = useRef(null);

  const authFetch = useCallback(async (url, options = {}) => {
    const token = await user?.getIdToken?.();
    if (!token) throw new Error("Iniciá sesión para administrar la tienda web.");
    const res = await fetch(url, { ...options, headers: { ...(options.headers || {}), Authorization: `Bearer ${token}` } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(data?.error || "No se pudo completar la acción."), { data });
    return data;
  }, [user]);

  const loadCatalog = useCallback(async () => {
    setCatalog((current) => ({ ...current, loading: true, error: "" }));
    try {
      const response = await fetch("/api/precios?all=1", { cache: "no-store" });
      if (!response.ok) throw new Error(`No se pudo cargar el catálogo (HTTP ${response.status}).`);
      const data = await response.json();
      const items = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : null;
      if (!items) throw new Error("La respuesta del catálogo no tiene un formato válido.");

      const products = items.flatMap((item) => {
        const product = item?.producto || item || {};
        if ((product.estadoTienda ?? item?.estadoTienda) !== "Activo") return [];
        const pricing = item?.pricing || item || {};
        const discount = product.discount || pricing.discount || {};
        const discountPercentage = Number(discount.percentage ?? product.descuentoPorcentaje ?? pricing.descuentoPorcentaje) || 0;
        const discountAmount = Number(discount.amount ?? product.descuentoMonto ?? pricing.descuentoMonto) || 0;
        const basePrice = Number(pricing.precioUnitarioBase ?? product.precioLista ?? product.precioBase ?? product.valorVenta) || 0;
        const finalPrice = Number(pricing.precioUnitarioFinal ?? product.valorVenta) || basePrice;
        return [{
          id: String(product.id ?? item.id),
          nombre: product.nombre || product.descripcion || String(product.id ?? item.id),
          codigo: product.codigo || "",
          categoria: product.categoria || pricing.categoria || "",
          subcategoria: product.subcategoria || product.subCategoria || "",
          tipoProducto: product.tipoProducto || (product.esCombo ? "combo" : ""),
          esCombo: product.esCombo === true || String(product.tipoProducto || "").toLowerCase() === "combo",
          specialOffer: product.specialOffer === true || item?.specialOffer === true || discountAmount > 0 || discountPercentage > 0 || finalPrice < basePrice,
          newArrival: product.newArrival === true || item?.newArrival === true,
          precio: basePrice || finalPrice,
          descuento: { percentage: discountPercentage, amount: discountAmount || Math.max(0, basePrice - finalPrice) },
          tipoMadera: product.tipoMadera || product.tipoMaterial || "",
          unidad: product.unidadMedida || product.unidad || "",
          uso: product.uso || product.aplicacion || "",
          imagenes: product.imagenes || product.images || product.imagen || product.srcUrl || "",
        }];
      }).filter((product) => product.id && product.id !== "undefined");
      setCatalog({ products, categories: [...new Set(products.map((product) => product.categoria).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es")), loading: false, error: "" });
    } catch (error) {
      setCatalog((current) => ({ ...current, loading: false, error: error?.message || "No se pudo cargar el catálogo." }));
    }
  }, []);

  const apply = useCallback((data) => {
    const next = normalizeTiendaConfig(data.config);
    setConfig(next);
    setSaved(next);
    setMeta({ version: data.version, savedAt: data.savedAt, savedBy: data.savedBy, imageHosts: data.imageHosts || [] });
  }, []);

  useEffect(() => {
    if (!user) return;
    // Se carga una sola vez por usuario: un cambio de referencia de `user` no debe pisar lo que se está editando.
    const who = user.uid ?? "usuario";
    if (loadedFor.current === who) return;
    loadedFor.current = who;
    authFetch("/api/tienda/config").then(apply).catch((e) => setLoadError(e.message));
    authFetch("/api/tienda/media").then((d) => setMedia({ storage: d.storage, items: d.items || [], loaded: true })).catch(() => setMedia((m) => ({ ...m, loaded: true })));
    void loadCatalog();
  }, [user, authFetch, apply, loadCatalog]);

  const loadPriceProducts = useCallback(async (all = false) => {
    setPriceProducts((prev) => ({ ...prev, loading: true }));
    try {
      const ref = collection(db, "productos");
      const snap = await getDocs(all ? ref : fsQuery(ref, where("estadoTienda", "==", "Activo")));
      setPriceProducts({ items: snap.docs.map((d) => ({ id: d.id, ...d.data() })), loading: false, all, loaded: true });
    } catch (e) {
      setPriceProducts((prev) => ({ ...prev, loading: false, loaded: true }));
      setNotice({ type: "error", text: "No se pudieron cargar los productos: " + e.message });
    }
  }, []);

  useEffect(() => {
    if ((tab === "precios" || tab === "stock") && !priceProducts.loaded && !priceProducts.loading) loadPriceProducts(false);
  }, [tab, priceProducts.loaded, priceProducts.loading, loadPriceProducts]);

  const dirty = useMemo(() => Boolean(config && saved && JSON.stringify(normalizeTiendaConfig(config)) !== JSON.stringify(saved)), [config, saved]);
  const hasUnsavedChanges = dirty || productSaveState.dirty;
  const issues = useMemo(() => (config ? tiendaIssues(config, { imageHosts: meta.imageHosts }) : []), [config, meta.imageHosts]);

  useEffect(() => {
    if (!hasUnsavedChanges) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    if (!notice || notice.type !== "ok") return undefined;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  const uploadImage = useCallback(async (file, folder) => {
    const form = new FormData();
    form.append("file", file);
    form.append("folder", folder);
    const { item } = await authFetch("/api/tienda/media", { method: "POST", body: form });
    setMedia((prev) => ({ ...prev, items: [item, ...prev.items] }));
    return item;
  }, [authFetch]);
  const mediaApi = useMemo(() => ({ ...media, upload: uploadImage }), [media, uploadImage]);

  const setList = (scope, updater) => setConfig((prev) => ({ ...prev, [scope]: renumber(updater(prev[scope])) }));
  const patchItem = (scope, id, patch) => setConfig((prev) => ({ ...prev, [scope]: prev[scope].map((item) => (item.id === id ? { ...item, ...patch } : item)) }));
  const toggleKey = { secciones: "activa", banners: "activo", categorias: "activa" };
  const toggleItem = (scope, index, value) => setConfig((prev) => ({ ...prev, [scope]: prev[scope].map((item, i) => (i === index ? { ...item, [toggleKey[scope]]: value } : item)) }));
  const addItem = (scope) => {
    const item = NEW_ITEM[scope]();
    setList(scope, (items) => [...items, item]);
    setEditing({ scope, id: item.id });
  };
  const duplicateItem = (scope, index) => setList(scope, (items) => {
    const source = items[index];
    const copy = { ...source, id: newId(source.id), titulo: `${source.titulo} (copia)` };
    return [...items.slice(0, index + 1), copy, ...items.slice(index + 1)];
  });
  const removeItem = (scope, index) => setList(scope, (items) => items.filter((_, i) => i !== index));
  const moveIn = (scope) => (from, to) => setList(scope, (items) => moveItem(items, from, to));

  const goTo = (issue) => {
    if (issue.scope === "obrasInicio") {
      setTab("obras");
      setOpenObrasInicio(true);
      return;
    }
    setTab(issue.scope);
    if (issue.scope !== "contacto" && issue.id) setEditing({ scope: issue.scope, id: issue.id });
  };
  const onObrasInicioOpened = useCallback(() => setOpenObrasInicio(false), []);

  const save = async () => {
    if ((!dirty && !productSaveState.dirty) || saving || productSaveState.saving) return;
    setSaving(true);
    setNotice(null);
    const errors = [];
    const successes = [];
    try {
      if (dirty) {
        if (issues.length) {
          setShowProblems(true);
          errors.push("La configuración no se guardó: corregí los campos indicados.");
          window.scrollTo({ top: 0, behavior: "smooth" });
        } else {
          try {
            const data = await authFetch("/api/tienda/config", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ config: normalizeTiendaConfig(config), baseVersion: meta.version }),
            });
            apply(data);
            setShowProblems(false);
            successes.push("Cambios de la tienda guardados.");
          } catch (e) {
            errors.push(`No se guardó la configuración de la tienda: ${e.message}`);
          }
        }
      }

      if (productSaveState.dirty && productSaveState.save) {
        try {
          const result = await productSaveState.save();
          if (result?.ok) successes.push("Contenido de productos publicado.");
          else errors.push(`No se publicó el contenido de productos: ${result?.message || "intentá nuevamente."}`);
        } catch (e) {
          errors.push(`No se publicó el contenido de productos: ${e.message || "intentá nuevamente."}`);
        }
      }

      const messages = [...successes, ...errors];
      setNotice({
        type: errors.length ? "error" : "ok",
        text: messages.join(" ") || "No hay cambios pendientes para guardar.",
      });
    } finally {
      setSaving(false);
    }
  };

  const discard = () => setConfirm({
    title: "¿Descartar los cambios?",
    description: "Vas a volver a lo último que guardaste. Se pierden los cambios hechos desde entonces.",
    action: "Descartar",
    run: () => {
      if (dirty) setConfig(saved);
      productSaveState.discard?.();
      setShowProblems(false);
      setEditing(null);
    },
  });
  const restoreDefaults = () => setConfirm({
    title: "¿Restaurar los valores originales?",
    description: "Reemplaza lo que ves por los banners, secciones y categorías con que arrancó la tienda. Recién se aplica cuando guardes.",
    action: "Restaurar",
    run: () => { setConfig(normalizeTiendaConfig(TIENDA_DEFAULTS)); setEditing(null); },
  });
  const reviewUnused = async () => {
    try {
      const post = (confirmar) => authFetch("/api/tienda/media/limpiar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmar }) });
      const { unused } = await post(false);
      if (!unused.length) { setNotice({ type: "ok", text: "No hay imágenes sin usar." }); return; }
      const total = unused.reduce((sum, item) => sum + (Number(item.size) || 0), 0);
      setConfirm({
        title: `Eliminar ${unused.length} imagen${unused.length === 1 ? "" : "es"} sin usar`,
        description: `Ocupan ${kb(total)} y no están en ningún banner ni categoría. Se eliminan para siempre.`,
        action: "Eliminar",
        run: async () => {
          const { deleted, errors } = await post(true);
          const refreshed = await authFetch("/api/tienda/media");
          setMedia({ storage: refreshed.storage, items: refreshed.items || [], loaded: true });
          setNotice(errors?.length ? { type: "error", text: errors.join(" · ") } : { type: "ok", text: `Se eliminaron ${deleted} imagen(es).` });
        },
      });
    } catch (e) { setNotice({ type: "error", text: e.message }); }
  };

  if (!config) {
    return <div className="p-6 text-sm text-default-600">{loadError ? <span className="text-destructive">{loadError}</span> : "Cargando…"}</div>;
  }

  const tabInfo = TABS.find((t) => t.id === tab);
  const editIndex = editing ? config[editing.scope].findIndex((item) => item.id === editing.id) : -1;
  const editItem = editIndex >= 0 ? config[editing.scope][editIndex] : null;
  const editorProps = (scope) => ({
    open: Boolean(editItem) && editing?.scope === scope,
    onOpenChange: (open) => { if (!open) setEditing(null); },
    index: editIndex,
    issues,
    onChange: (patch) => patchItem(scope, editing.id, patch),
    onDuplicate: () => duplicateItem(scope, editIndex),
    onDelete: () => removeItem(scope, editIndex),
    categories: catalog.categories,
    tiendaUrl,
  });
  const storageProblem = media.loaded && !media.storage?.ok;

  return (
    <div className="mx-auto w-full space-y-6 pb-16">
      <header className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold">Tienda web</h1>
          <p className="flex items-center gap-1.5 truncate text-sm text-default-500">
            {hasUnsavedChanges ? (<><span className="h-2 w-2 rounded-full bg-amber-500" /> Tenés cambios sin guardar</>) : meta.savedAt ? `Guardado el ${when(meta.savedAt)}` : "Todo está como al inicio"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {tiendaUrl && (
            <a href={tiendaUrl} target="_blank" rel="noreferrer" className="hidden h-9 items-center rounded-lg px-3 text-sm text-default-600 hover:bg-default-100 sm:inline-flex">Ver tienda ↗</a>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" aria-label="Más acciones" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card hover:bg-default-100">
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuItem disabled={!hasUnsavedChanges} onSelect={discard}>Descartar cambios</DropdownMenuItem>
              <DropdownMenuItem onSelect={restoreDefaults}>Restaurar valores originales</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={reviewUnused}>Revisar imágenes sin usar</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Btn variant="primary" disabled={!hasUnsavedChanges || saving || productSaveState.saving} onClick={save}>{saving || productSaveState.saving ? "Guardando…" : "Guardar cambios"}</Btn>
        </div>
      </header>

      {notice && (
        <div role="status" className={cn("flex items-start justify-between gap-3 rounded-lg px-4 py-3 text-sm", notice.type === "ok" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800")}>
          <span>{notice.text}</span>
          <button type="button" aria-label="Cerrar" className="opacity-60 hover:opacity-100" onClick={() => setNotice(null)}>×</button>
        </div>
      )}

      {showProblems && issues.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50/60 p-4">
          <p className="mb-2 text-sm font-medium text-red-800">Para poder guardar, corregí esto:</p>
          <ul className="space-y-1">
            {issues.map((issue, i) => (
              <li key={`${issue.scope}-${i}`} className="flex items-center justify-between gap-3 text-sm text-red-900">
                <span>{issue.message}</span>
                <button type="button" onClick={() => goTo(issue)} className="shrink-0 font-medium underline underline-offset-4">Ir</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="w-full min-w-0 max-w-full overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <nav className="flex w-max min-w-full gap-4 border-b border-border sm:gap-6" aria-label="Secciones de la tienda web">
          {TABS.map((t) => {
            const problems = countIssues(issues, t.id) + (t.id === "obras" ? countIssues(issues, "obrasInicio") : 0);
            return (
              <button key={t.id} type="button" onClick={() => setTab(t.id)} aria-current={tab === t.id ? "page" : undefined}
                className={cn("-mb-px flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-0.5 pb-3 text-sm transition", tab === t.id ? "border-primary font-semibold text-foreground" : "border-transparent text-default-500 hover:text-foreground")}>
                {t.label}
                {problems > 0 && <span className="h-2 w-2 rounded-full bg-destructive" aria-label={`${problems} para corregir`} />}
              </button>
            );
          })}
        </nav>
      </div>

      <p className="-mt-2 text-sm text-default-500">{tabInfo.help}</p>

      {(tab === "inicio" || tab === "banners" || tab === "categorias" || tab === "obras") && storageProblem && (
        <div className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
          La subida de imágenes todavía no está activada. Podés seguir editando textos y orden; para agregar o cambiar imágenes hay que completar la configuración del servidor.
          <details className="mt-1 text-xs text-amber-800">
            <summary className="cursor-pointer">Detalles para soporte</summary>
            Faltan estas variables de entorno: {(media.storage?.missing || []).join(", ")}.
          </details>
        </div>
      )}

      {tab === "inicio" && <HomeContentEditor value={config.inicio} onChange={(inicio) => setConfig((prev) => ({ ...prev, inicio }))} uploadImage={uploadImage} media={mediaApi} tiendaUrl={tiendaUrl} onNavigateTab={setTab} />}
      {tab === "secciones" && (
        <SeccionList items={config.secciones} problems={perItem(issues, "secciones", config.secciones.length)}
          onOpen={(i) => setEditing({ scope: "secciones", id: config.secciones[i].id })} onToggle={(i, v) => toggleItem("secciones", i, v)}
          onMove={moveIn("secciones")} onAdd={() => addItem("secciones")} />
      )}
      {tab === "banners" && (
        <BannerList items={config.banners} problems={perItem(issues, "banners", config.banners.length)} tiendaUrl={tiendaUrl}
          onOpen={(i) => setEditing({ scope: "banners", id: config.banners[i].id })} onToggle={(i, v) => toggleItem("banners", i, v)}
          onMove={moveIn("banners")} onAdd={() => addItem("banners")} />
      )}
      {tab === "categorias" && (
        <CategoriaGrid items={config.categorias} problems={perItem(issues, "categorias", config.categorias.length)} tiendaUrl={tiendaUrl}
          onOpen={(i) => setEditing({ scope: "categorias", id: config.categorias[i].id })} onToggle={(i, v) => toggleItem("categorias", i, v)}
          onMove={moveIn("categorias")} onAdd={() => addItem("categorias")} />
      )}
      {tab === "contacto" && (
        <ContactoForm contacto={config.contacto} issues={issues.filter((i) => i.scope === "contacto")}
          onChange={(patch) => setConfig((prev) => ({ ...prev, contacto: { ...prev.contacto, ...patch } }))} />
      )}
      {tab === "precios" && (
        <PreciosForm
          precios={config.precios}
          onChange={(next) => setConfig((prev) => ({ ...prev, precios: next }))}
          products={priceProducts.items}
          productsState={priceProducts}
          onLoadAll={() => loadPriceProducts(true)}
          categories={catalog.categories}
          authFetch={authFetch}
          onRestore={(before) => { setConfig((prev) => ({ ...prev, precios: before })); setNotice({ type: "ok", text: "Versión anterior cargada. Guardá para aplicarla." }); }}
        />
      )}
      {tab === "stock" && (
        <StockForm
          stock={config.stock}
          onChange={(next) => setConfig((prev) => ({ ...prev, stock: next }))}
          products={priceProducts.items}
          productsState={priceProducts}
          onLoadAll={() => loadPriceProducts(true)}
          categories={catalog.categories}
          authFetch={authFetch}
          onRestore={(before) => { setConfig((prev) => ({ ...prev, stock: before })); setNotice({ type: "ok", text: "Versión anterior cargada. Guardá para aplicarla." }); }}
        />
      )}
      {tab === "transferencia" && (
        <TransferenciaForm transferencia={config.transferencia} issues={issues}
          onChange={(patch) => setConfig((prev) => ({ ...prev, transferencia: { ...prev.transferencia, ...patch } }))} />
      )}
      {tab === "obras" && <ObrasManager authFetch={authFetch} uploadImage={uploadImage} media={mediaApi} tiendaUrl={tiendaUrl} obrasInicioContent={config.obrasInicio} onObrasInicioChange={(obrasInicio) => setConfig((prev) => ({ ...prev, obrasInicio }))} openObrasInicio={openObrasInicio} onObrasInicioOpened={onObrasInicioOpened} />}
      {tab === "notificaciones" && <NotificacionesPedidosForm notifications={config.notificacionesPedidos} issues={issues.filter((issue) => issue.scope === "notificaciones")} onChange={(notificacionesPedidos) => setConfig((prev) => ({ ...prev, notificacionesPedidos }))} authFetch={authFetch} />}
      <div className={tab === "productos" ? "" : "hidden"}>
        <ProductosContenidoManager products={catalog.products} categories={catalog.categories} media={mediaApi} uploadImage={uploadImage} authFetch={authFetch} tiendaUrl={tiendaUrl} active={tab === "productos"} onSaveStateChange={setProductSaveState} />
      </div>

      <BannerEditor {...editorProps("banners")} banner={editing?.scope === "banners" ? editItem : null} media={mediaApi} />
      <CategoriaEditor {...editorProps("categorias")} categoria={editing?.scope === "categorias" ? editItem : null} media={mediaApi} />
      <SeccionEditor {...editorProps("secciones")} seccion={editing?.scope === "secciones" ? editItem : null} products={catalog.products} catalogLoading={catalog.loading} catalogError={catalog.error} onReloadCatalog={loadCatalog} />

      {hasUnsavedChanges && (
        <div className="fixed inset-x-4 bottom-4 z-30 mx-auto flex w-fit max-w-full items-center gap-3 rounded-xl border border-border bg-card px-4 py-2.5 shadow-lg" role="region" aria-label="Cambios sin guardar">
          <span className="hidden items-center gap-2 text-sm sm:flex"><span className="h-2 w-2 rounded-full bg-amber-500" /> Tenés cambios sin guardar</span>
          <Btn variant="ghost" size="sm" onClick={discard}>Descartar</Btn>
          <Btn variant="primary" size="sm" disabled={saving || productSaveState.saving} onClick={save}>{saving || productSaveState.saving ? "Guardando…" : "Guardar cambios"}</Btn>
        </div>
      )}

      <AlertDialog open={Boolean(confirm)} onOpenChange={(open) => { if (!open) setConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirm?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={async () => { const run = confirm?.run; setConfirm(null); try { await run?.(); } catch (e) { setNotice({ type: "error", text: e.message }); } }}>{confirm?.action}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
