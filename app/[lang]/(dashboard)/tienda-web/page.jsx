"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/provider/auth.provider";
import { REGLAS_SECCION, normalizeTiendaConfig, validateTiendaConfig } from "@/lib/tienda-config";
import { IMAGE_GUIDE, MAX_UPLOAD_BYTES } from "@/lib/tienda-media";

const TABS = [
  { id: "secciones", label: "Secciones del inicio" },
  { id: "banners", label: "Banners" },
  { id: "categorias", label: "Categorías destacadas" },
  { id: "contacto", label: "Contacto" },
];

const selectClass = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";
const newId = (base) => `${base}-${Date.now().toString(36)}`;
const renumber = (items) => items.map((item, index) => ({ ...item, orden: index + 1 }));
const when = (iso) => (iso ? new Date(iso).toLocaleString("es-AR") : "");

function Field({ label, children, className = "" }) {
  return (
    <label className={`text-sm space-y-1 block ${className}`}>
      <span className="block text-default-600">{label}</span>
      {children}
    </label>
  );
}

function RowActions({ index, total, onMove, onDuplicate, onRemove }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" size="sm" disabled={index === 0} onClick={() => onMove(-1)}>↑ Subir</Button>
      <Button variant="outline" size="sm" disabled={index === total - 1} onClick={() => onMove(1)}>↓ Bajar</Button>
      <Button variant="outline" size="sm" onClick={onDuplicate}>Duplicar</Button>
      <Button variant="destructive" size="sm" onClick={onRemove}>Eliminar</Button>
    </div>
  );
}

const kb = (bytes) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
const previewSrc = (value) => (value && value.startsWith("/") ? `${process.env.NEXT_PUBLIC_TIENDA_URL || ""}${value}` : value);

function ImageField({ label, hint, value, folder, onChange, media, onUpload }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [error, setError] = useState("");
  const disabled = !media.storage?.ok;
  const library = media.items.filter((item) => item.folder === folder);

  const handleFile = async (file) => {
    if (!file) return;
    setError("");
    if (file.size > MAX_UPLOAD_BYTES) { setError(`La imagen pesa más de ${Math.round(MAX_UPLOAD_BYTES / 1048576)} MB.`); return; }
    setUploading(true);
    try {
      const item = await onUpload(file, folder);
      onChange(item.url);
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-2">
      <div className="text-sm text-default-600">{label}</div>
      <div className="text-xs text-default-500">{hint}</div>
      <div
        className={`flex gap-3 rounded-md border p-2 ${dragging ? "border-primary bg-primary/5" : ""}`}
        onDragOver={(e) => { if (!disabled) { e.preventDefault(); setDragging(true); } }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); if (!disabled) handleFile(e.dataTransfer.files?.[0]); }}
      >
        <div className="h-20 w-32 shrink-0 overflow-hidden rounded bg-default-100 flex items-center justify-center text-xs text-default-400">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewSrc(value)} alt="" className="h-full w-full object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} />
          ) : "Sin imagen"}
        </div>
        <div className="flex flex-col gap-2 min-w-0">
          <div className="flex flex-wrap gap-2">
            <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,image/avif" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
            <Button size="sm" disabled={disabled || uploading} onClick={() => inputRef.current?.click()}>{uploading ? "Subiendo…" : "Subir imagen"}</Button>
            <Button size="sm" variant="outline" disabled={disabled || !library.length} onClick={() => setShowLibrary((v) => !v)}>Biblioteca ({library.length})</Button>
            {value && <Button size="sm" variant="outline" onClick={() => onChange("")}>Quitar</Button>}
          </div>
          <div className="truncate text-xs text-default-500" title={value}>{value || "Arrastrá una imagen acá o usá “Subir imagen”."}</div>
        </div>
      </div>
      {disabled && media.loaded && (
        <div className="text-xs text-amber-700">Subida desactivada: falta configurar R2 en el servidor ({(media.storage?.missing || []).join(", ")}).</div>
      )}
      {error && <div className="text-xs text-destructive">{error}</div>}
      {showLibrary && (
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 rounded-md border p-2 max-h-56 overflow-auto">
          {library.map((item) => (
            <button key={item.id} type="button" className="text-left" title={`${item.width || "?"}×${item.height || "?"} · ${kb(item.size)}`}
              onClick={() => { onChange(item.url); setShowLibrary(false); }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.url} alt="" className="h-16 w-full rounded object-cover border" />
              <span className="block text-[10px] text-default-500">{kb(item.size)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ProductPicker({ selected, products, onChange }) {
  const [term, setTerm] = useState("");
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const results = useMemo(() => {
    const q = term.trim().toLowerCase();
    if (!q) return [];
    return products.filter((p) => !selected.includes(p.id) && `${p.nombre} ${p.codigo}`.toLowerCase().includes(q)).slice(0, 8);
  }, [term, products, selected]);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {selected.map((id) => (
          <Badge key={id} variant="outline" className="gap-2">
            {byId.get(id)?.nombre || id}
            <button type="button" aria-label="Quitar" onClick={() => onChange(selected.filter((x) => x !== id))}>✕</button>
          </Badge>
        ))}
        {!selected.length && <span className="text-sm text-default-500">Ningún producto elegido.</span>}
      </div>
      <Input placeholder={products.length ? "Buscar producto por nombre o código…" : "Cargando productos…"} value={term} onChange={(e) => setTerm(e.target.value)} />
      {results.length > 0 && (
        <div className="border rounded-md divide-y">
          {results.map((p) => (
            <button key={p.id} type="button" className="block w-full text-left px-3 py-2 text-sm hover:bg-default-100"
              onClick={() => { onChange([...selected, p.id]); setTerm(""); }}>
              {p.nombre} <span className="text-default-500">{p.codigo}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TiendaWebPage() {
  const { user } = useAuth();
  const [config, setConfig] = useState(null);
  const [savedKey, setSavedKey] = useState("");
  const [meta, setMeta] = useState({});
  const [tab, setTab] = useState("secciones");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [serverErrors, setServerErrors] = useState([]);
  const [error, setError] = useState("");
  const [products, setProducts] = useState([]);
  const [media, setMedia] = useState({ storage: null, items: [], loaded: false });

  const authFetch = useCallback(async (url, options = {}) => {
    const token = await user?.getIdToken?.();
    if (!token) throw new Error("Iniciá sesión para administrar la tienda web.");
    const res = await fetch(url, { ...options, headers: { ...(options.headers || {}), Authorization: `Bearer ${token}` } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "No se pudo completar la acción.");
    return data;
  }, [user]);

  useEffect(() => {
    if (!user || (tab !== "banners" && tab !== "categorias") || media.loaded) return;
    authFetch("/api/tienda/media").then((d) => setMedia({ storage: d.storage, items: d.items || [], loaded: true })).catch((e) => setError(e.message));
  }, [user, tab, media.loaded, authFetch]);

  const uploadImage = useCallback(async (file, folder) => {
    const form = new FormData();
    form.append("file", file);
    form.append("folder", folder);
    const { item } = await authFetch("/api/tienda/media", { method: "POST", body: form });
    setMedia((prev) => ({ ...prev, items: [item, ...prev.items] }));
    return item;
  }, [authFetch]);

  const cleanUnused = async () => {
    setBusy(true); setError(""); setMessage("");
    try {
      const post = (confirmar) => authFetch("/api/tienda/media/limpiar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmar }) });
      const { unused } = await post(false);
      if (!unused.length) { setMessage("No hay imágenes sin usar."); return; }
      const total = unused.reduce((sum, item) => sum + (Number(item.size) || 0), 0);
      if (!window.confirm(`Hay ${unused.length} imagen(es) sin usar (${kb(total)}). Se eliminan de R2 y no se pueden recuperar. ¿Eliminarlas?`)) return;
      const { deleted, errors } = await post(true);
      setMedia((prev) => ({ ...prev, loaded: false }));
      setMessage(`Se eliminaron ${deleted} imagen(es).`);
      if (errors?.length) setError(errors.join(" · "));
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const request = useCallback(async (method, body) => {
    const token = await user?.getIdToken?.();
    if (!token) throw new Error("Iniciá sesión para administrar la tienda web.");
    const res = await fetch("/api/tienda/config", {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await res.json();
    if (!res.ok) {
      const err = new Error(data?.error || "No se pudo completar la acción.");
      err.errores = data?.errores || [];
      throw err;
    }
    return data;
  }, [user]);

  const apply = useCallback((data) => {
    const next = normalizeTiendaConfig(data.draft);
    setConfig(next);
    setSavedKey(JSON.stringify(next));
    setMeta(data);
  }, []);

  useEffect(() => {
    if (!user) return;
    request("GET").then(apply).catch((e) => setError(e.message));
  }, [user, request, apply]);

  useEffect(() => {
    if (tab !== "secciones" || products.length) return;
    fetch("/api/precios?all=1")
      .then((r) => r.json())
      .then((d) => setProducts((d?.items || []).map((it) => ({
        id: String(it.id), nombre: it.producto?.nombre || it.producto?.descripcion || String(it.id),
        codigo: it.producto?.codigo || "", categoria: it.producto?.categoria || "",
      }))))
      .catch(() => {});
  }, [tab, products.length]);

  const categories = useMemo(() => [...new Set(products.map((p) => p.categoria).filter(Boolean))].sort(), [products]);
  const dirty = config ? JSON.stringify(config) !== savedKey : false;
  const validation = useMemo(() => (config ? validateTiendaConfig(config, { imageHosts: meta.imageHosts }) : { errors: [], warnings: [] }), [config, meta.imageHosts]);
  const hasPending = dirty || meta.hasDraft;

  const run = async (action) => {
    setBusy(true); setError(""); setMessage(""); setServerErrors([]);
    try { await action(); } catch (e) { setError(e.message); setServerErrors(e.errores || []); } finally { setBusy(false); }
  };
  const saveDraft = () => run(async () => {
    const data = await request("PUT", { config: { ...config, secciones: renumber(config.secciones), banners: renumber(config.banners), categorias: renumber(config.categorias) } });
    apply(data); setMessage("Borrador guardado. Todavía no se ve en la tienda.");
  });
  const publish = () => run(async () => {
    if (dirty) await request("PUT", { config: { ...config, secciones: renumber(config.secciones), banners: renumber(config.banners), categorias: renumber(config.categorias) } });
    const data = await request("POST", { accion: "publicar" });
    apply(data); setMessage("Cambios publicados. La tienda los mostrará en 1 a 5 minutos.");
  });
  const discard = () => run(async () => {
    if (!window.confirm("¿Descartar el borrador y volver a lo publicado?")) return;
    apply(await request("POST", { accion: "descartar" })); setMessage("Borrador descartado.");
  });
  const loadCurrent = () => run(async () => {
    if (!window.confirm("Esto reemplaza el borrador por los textos que hoy tiene la tienda. ¿Continuar?")) return;
    apply(await request("POST", { accion: "valores_actuales" })); setMessage("Valores actuales cargados en el borrador.");
  });

  const patch = (key, items) => setConfig((prev) => ({ ...prev, [key]: items }));
  const update = (key, index, changes) => patch(key, config[key].map((item, i) => (i === index ? { ...item, ...changes } : item)));
  const move = (key, index, delta) => {
    const items = [...config[key]];
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    [items[index], items[target]] = [items[target], items[index]];
    patch(key, items);
  };
  const duplicate = (key, index) => {
    const copy = { ...config[key][index], id: newId(config[key][index].id) };
    const items = [...config[key]];
    items.splice(index + 1, 0, copy);
    patch(key, items);
  };
  const remove = (key, index) => {
    if (window.confirm("¿Eliminar este elemento?")) patch(key, config[key].filter((_, i) => i !== index));
  };

  if (!config) {
    return <div className="p-6 text-sm">{error ? <span className="text-destructive">{error}</span> : "Cargando configuración de la tienda…"}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Tienda web</h1>
          <p className="text-sm text-default-600">
            Controlá lo que se muestra en el inicio de la tienda. Los cambios se guardan como borrador y se publican cuando vos decidas.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {hasPending ? <Badge className="bg-amber-500">Cambios sin publicar</Badge> : <Badge className="bg-emerald-600">Publicado</Badge>}
          <Button variant="outline" onClick={loadCurrent} disabled={busy}>Cargar valores actuales</Button>
          <Button variant="outline" onClick={discard} disabled={busy || !meta.hasDraft}>Descartar borrador</Button>
          <Button variant="outline" onClick={saveDraft} disabled={busy || !dirty}>Guardar borrador</Button>
          <Button onClick={publish} disabled={busy || !hasPending || validation.errors.length > 0}>Publicar</Button>
        </div>
      </div>
      {meta.publishedAt && <p className="text-xs text-default-500">Última publicación: {when(meta.publishedAt)} {meta.publishedBy ? `· ${meta.publishedBy}` : ""}</p>}
      {message && <div className="rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900">{message}</div>}
      {error && <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900">{error}{serverErrors.map((e) => <div key={e}>• {e}</div>)}</div>}
      {validation.errors.length > 0 && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900 space-y-1">
          <div className="font-medium">Hay que corregir antes de publicar:</div>
          {validation.errors.map((e) => <div key={e}>• {e}</div>)}
        </div>
      )}
      {validation.warnings.length > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 space-y-1">
          {validation.warnings.map((w) => <div key={w}>⚠ {w}</div>)}
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-b pb-2">
        {TABS.map((t) => (
          <Button key={t.id} variant={tab === t.id ? "default" : "outline"} size="sm" onClick={() => setTab(t.id)}>{t.label}</Button>
        ))}
      </div>

      {tab === "secciones" && (
        <div className="space-y-3">
          <p className="text-sm text-default-600">
            Cada sección muestra productos según una regla. El orden de esta lista es el orden en la tienda; la sección no aparece si no tiene productos.
          </p>
          {config.secciones.map((s, i) => (
            <Card key={s.id}>
              <CardHeader className="flex-row items-center justify-between gap-2">
                <CardTitle className="text-base">{s.titulo || "Sección sin título"} <span className="text-xs text-default-500 font-normal">({s.id})</span></CardTitle>
                <label className="text-sm flex items-center gap-2">
                  <input type="checkbox" checked={s.activa} onChange={(e) => update("secciones", i, { activa: e.target.checked })} /> Visible
                </label>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Field label="Etiqueta superior"><Input value={s.eyebrow} onChange={(e) => update("secciones", i, { eyebrow: e.target.value })} /></Field>
                  <Field label="Título"><Input value={s.titulo} onChange={(e) => update("secciones", i, { titulo: e.target.value })} /></Field>
                  <Field label="Subtítulo"><Input value={s.subtitulo} onChange={(e) => update("secciones", i, { subtitulo: e.target.value })} /></Field>
                  <Field label="Qué productos muestra">
                    <select className={selectClass} value={s.regla.tipo} onChange={(e) => update("secciones", i, { regla: { ...s.regla, tipo: e.target.value } })}>
                      {Object.entries(REGLAS_SECCION).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </Field>
                  <Field label="Enlace de “Ver todos”"><Input value={s.enlace} onChange={(e) => update("secciones", i, { enlace: e.target.value })} /></Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Máx. productos"><Input value={s.limite} onChange={(e) => update("secciones", i, { limite: e.target.value })} /></Field>
                    <Field label="Fondo">
                      <select className={selectClass} value={s.fondo} onChange={(e) => update("secciones", i, { fondo: e.target.value })}>
                        <option value="gris">Gris</option><option value="blanco">Blanco</option>
                      </select>
                    </Field>
                  </div>
                </div>
                {s.regla.tipo === "categoria" && (
                  <Field label="Categoría">
                    <Input list="tienda-categorias" value={s.regla.valor} onChange={(e) => update("secciones", i, { regla: { ...s.regla, valor: e.target.value } })} />
                    <datalist id="tienda-categorias">{categories.map((c) => <option key={c} value={c} />)}</datalist>
                  </Field>
                )}
                {s.regla.tipo === "descuento" && (
                  <Field label="Descuento mínimo (%)" className="max-w-xs">
                    <Input value={s.regla.minDescuento} onChange={(e) => update("secciones", i, { regla: { ...s.regla, minDescuento: e.target.value } })} />
                  </Field>
                )}
                {s.regla.tipo === "manual" && (
                  <ProductPicker selected={s.regla.productos} products={products}
                    onChange={(ids) => update("secciones", i, { regla: { ...s.regla, productos: ids } })} />
                )}
                <RowActions index={i} total={config.secciones.length} onMove={(d) => move("secciones", i, d)} onDuplicate={() => duplicate("secciones", i)} onRemove={() => remove("secciones", i)} />
              </CardContent>
            </Card>
          ))}
          <Button variant="outline" onClick={() => patch("secciones", [...config.secciones, normalizeTiendaConfig({ secciones: [{ id: newId("seccion"), titulo: "Nueva sección", regla: { tipo: "oferta" }, enlace: "/shop" }] }).secciones[0]])}>
            + Agregar sección
          </Button>
        </div>
      )}

      {tab === "banners" && (
        <div className="space-y-3">
          <p className="text-sm text-default-600">Carrusel principal del inicio. Subí las imágenes desde acá (se guardan en R2). Podés programar fechas de inicio y fin para campañas.</p>
          <Button variant="outline" size="sm" disabled={busy} onClick={cleanUnused}>Revisar imágenes sin usar</Button>
          {config.banners.map((b, i) => (
            <Card key={b.id}>
              <CardHeader className="flex-row items-center justify-between gap-2">
                <CardTitle className="text-base">{b.titulo || "Banner sin título"}</CardTitle>
                <label className="text-sm flex items-center gap-2">
                  <input type="checkbox" checked={b.activo} onChange={(e) => update("banners", i, { activo: e.target.checked })} /> Visible
                </label>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Field label="Título (texto del botón)"><Input value={b.titulo} onChange={(e) => update("banners", i, { titulo: e.target.value })} /></Field>
                  <Field label="Enlace"><Input value={b.enlace} onChange={(e) => update("banners", i, { enlace: e.target.value })} /></Field>
                  <Field label="Texto alternativo"><Input value={b.alt} onChange={(e) => update("banners", i, { alt: e.target.value })} /></Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Desde (AAAA-MM-DD)"><Input value={b.desde} placeholder="Siempre" onChange={(e) => update("banners", i, { desde: e.target.value })} /></Field>
                    <Field label="Hasta (AAAA-MM-DD)"><Input value={b.hasta} placeholder="Siempre" onChange={(e) => update("banners", i, { hasta: e.target.value })} /></Field>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <ImageField label="Imagen de escritorio" hint={`${IMAGE_GUIDE.banners.texto}. Se optimiza a WebP automáticamente.`} value={b.imagen} folder="banners" media={media} onUpload={uploadImage}
                    onChange={(url) => update("banners", i, { imagen: url, ...(b.imagenMovil ? {} : { imagenMovil: url }) })} />
                  <ImageField label="Imagen móvil" hint={IMAGE_GUIDE.bannersMovil.texto} value={b.imagenMovil} folder="banners" media={media} onUpload={uploadImage}
                    onChange={(url) => update("banners", i, { imagenMovil: url })} />
                </div>
                <RowActions index={i} total={config.banners.length} onMove={(d) => move("banners", i, d)} onDuplicate={() => duplicate("banners", i)} onRemove={() => remove("banners", i)} />
              </CardContent>
            </Card>
          ))}
          <Button variant="outline" onClick={() => patch("banners", [...config.banners, normalizeTiendaConfig({ banners: [{ id: newId("banner"), titulo: "Nuevo banner", enlace: "/shop", imagen: "/images/" }] }).banners[0]])}>
            + Agregar banner
          </Button>
        </div>
      )}

      {tab === "categorias" && (
        <div className="space-y-3">
          <p className="text-sm text-default-600">Tarjetas de “Comprá por material” en el inicio.</p>
          <Button variant="outline" size="sm" disabled={busy} onClick={cleanUnused}>Revisar imágenes sin usar</Button>
          {config.categorias.map((c, i) => (
            <Card key={c.id}>
              <CardHeader className="flex-row items-center justify-between gap-2">
                <CardTitle className="text-base">{c.titulo || "Categoría sin título"}</CardTitle>
                <label className="text-sm flex items-center gap-2">
                  <input type="checkbox" checked={c.activa} onChange={(e) => update("categorias", i, { activa: e.target.checked })} /> Visible
                </label>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Field label="Título"><Input value={c.titulo} onChange={(e) => update("categorias", i, { titulo: e.target.value })} /></Field>
                  <Field label="Etiqueta"><Input value={c.etiqueta} onChange={(e) => update("categorias", i, { etiqueta: e.target.value })} /></Field>
                  <Field label="Enlace"><Input value={c.enlace} onChange={(e) => update("categorias", i, { enlace: e.target.value })} /></Field>
                </div>
                <ImageField label="Imagen" hint={`${IMAGE_GUIDE.categorias.texto}. Se optimiza a WebP automáticamente.`} value={c.imagen} folder="categorias" media={media} onUpload={uploadImage}
                  onChange={(url) => update("categorias", i, { imagen: url })} />
                <RowActions index={i} total={config.categorias.length} onMove={(d) => move("categorias", i, d)} onDuplicate={() => duplicate("categorias", i)} onRemove={() => remove("categorias", i)} />
              </CardContent>
            </Card>
          ))}
          <Button variant="outline" onClick={() => patch("categorias", [...config.categorias, normalizeTiendaConfig({ categorias: [{ id: newId("categoria"), titulo: "Nueva categoría", enlace: "/shop", imagen: "/images/" }] }).categorias[0]])}>
            + Agregar categoría
          </Button>
        </div>
      )}

      {tab === "contacto" && (
        <Card>
          <CardHeader><CardTitle className="text-base">WhatsApp y mensajes</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-default-600">Un único número para todos los botones de la tienda. Sin número, los botones se ocultan.</p>
            <Field label="WhatsApp con código de país (solo números)" className="max-w-sm">
              <Input value={config.contacto.whatsapp} onChange={(e) => setConfig({ ...config, contacto: { ...config.contacto, whatsapp: e.target.value } })} />
            </Field>
            {[
              ["mensajeGeneral", "Mensaje del botón flotante"],
              ["mensajeAsesoria", "Mensaje de la sección de asesoramiento / obras"],
              ["mensajeMenu", "Mensaje del menú superior"],
            ].map(([key, label]) => (
              <Field key={key} label={label}>
                <Input value={config.contacto[key]} onChange={(e) => setConfig({ ...config, contacto: { ...config.contacto, [key]: e.target.value } })} />
              </Field>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
