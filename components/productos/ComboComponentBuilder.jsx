"use client";

import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Boxes, Check, Minus, Package, Plus, Ruler, Search, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/provider/auth.provider";
import { normalizeDimensionQuery, parseDimensionQuery } from "@/lib/product-search";
import { calcularPrecioComponenteVenta } from "@/lib/pricing";
import {
  getComboStockAnalysis,
  isComboProduct,
  normalizeComboComponents,
} from "@/lib/combos";

const normalizeText = (value) =>
  String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

const getCost = (producto) => {
  for (const candidate of [producto?.costo, producto?.valorCompra, producto?.costoCompra]) {
    const value = Number(candidate);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return null;
};

const formatMoney = (value) => `$${(Number(value) || 0).toLocaleString("es-AR")}`;
const formatDimensions = (producto) =>
  [producto?.alto, producto?.ancho, producto?.largo]
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 0)
    .map((value) => value.toLocaleString("es-AR", { maximumFractionDigits: 2 }))
    .join(" × ");
const getCalculatedPrice = (producto) => calcularPrecioComponenteVenta(producto);

export default function ComboComponentBuilder({
  productos = [],
  value = [],
  onChange,
  onValidityChange,
  disabled = false,
  showCosts = true,
  salePrice = 0,
  onSuggestedPrice,
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [stockFilter, setStockFilter] = useState("todos");
  const [quantityDrafts, setQuantityDrafts] = useState({});
  const [remoteProducts, setRemoteProducts] = useState(null);
  const [remotePage, setRemotePage] = useState(0);
  const [remoteHasMore, setRemoteHasMore] = useState(false);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remoteError, setRemoteError] = useState("");
  const [resolvedProducts, setResolvedProducts] = useState({});
  const { user } = useAuth();
  const normalizedDimensions = useMemo(() => normalizeDimensionQuery(search), [search]);
  const isDimensionSearch = Boolean(parseDimensionQuery(search));

  const componentes = useMemo(() => normalizeComboComponents(value), [value]);
  const productById = useMemo(() => {
    const products = new Map((Array.isArray(productos) ? productos : []).map((p) => [String(p.id), p]));
    Object.values(resolvedProducts).forEach((p) => products.set(String(p.id), p));
    (Array.isArray(remoteProducts) ? remoteProducts : []).forEach((p) => products.set(String(p.id), p));
    return products;
  }, [productos, remoteProducts, resolvedProducts]);
  const componentIds = useMemo(
    () => new Set(componentes.map((component) => component.productoId)),
    [componentes]
  );
  const suggestedPrice = useMemo(() => {
    if (componentes.length === 0) return null;
    let total = 0;
    for (const component of componentes) {
      const producto = productById.get(component.productoId);
      if (!producto || producto.categoria === "Obras" || isComboProduct(producto)) return null;
      const unitPrice = getCalculatedPrice(producto);
      if (!Number.isFinite(unitPrice) || unitPrice <= 0) return null;
      total += unitPrice * component.cantidad;
    }
    return Math.round(total * 100) / 100;
  }, [componentes, productById]);
  const selectedIdsParam = useMemo(() => Array.from(componentIds).join(","), [componentIds]);
  const eligibleProducts = useMemo(
    () =>
      (Array.isArray(productos) ? productos : []).filter(
        (producto) => producto?.categoria !== "Obras" && !isComboProduct(producto)
      ),
    [productos]
  );

  useEffect(() => {
    if (!search.trim() && !category && stockFilter === "todos") {
      setRemoteProducts(null);
      setRemoteHasMore(false);
      setRemotePage(0);
      setRemoteError("");
      return undefined;
    }
    let active = true;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setRemoteLoading(true);
      setRemoteError("");
      try {
        const token = user && typeof user.getIdToken === "function" ? await user.getIdToken() : "";
        const params = new URLSearchParams({ limit: "12", page: String(remotePage), stock: stockFilter });
        if (search.trim()) params.set("q", search.trim());
        if (category) params.set("categoria", category);
        if (selectedIdsParam) params.set("selected", selectedIdsParam);
        const response = await fetch(`/api/erp/combos/componentes?${params.toString()}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("No se pudo consultar el catálogo");
        const data = await response.json();
        if (!active) return;
        const selectedIds = new Set(selectedIdsParam.split(",").filter(Boolean));
        setRemoteProducts(Array.isArray(data.items) ? data.items : []);
        setResolvedProducts((previous) => ({
          ...Object.fromEntries(Object.entries(previous).filter(([id]) => selectedIds.has(id))),
          ...Object.fromEntries((Array.isArray(data.items) ? data.items : []).map((item) => [String(item.id), item])),
          ...Object.fromEntries((Array.isArray(data.selectedItems) ? data.selectedItems : []).map((item) => [String(item.id), item])),
        }));
        setRemoteHasMore(Boolean(data.hasMore));
      } catch (error) {
        if (error?.name !== "AbortError" && active) {
          setRemoteProducts(null);
          setRemoteHasMore(false);
          setRemoteError(error?.message || "No se pudo consultar el catálogo.");
        }
      } finally {
        if (active) setRemoteLoading(false);
      }
    }, 220);

    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [search, category, stockFilter, remotePage, selectedIdsParam, user]);

  useEffect(() => {
    setRemotePage(0);
  }, [search, category, stockFilter]);

  const categories = useMemo(
    () => Array.from(new Set([
      "Maderas",
      "Ferretería",
      ...eligibleProducts.map((p) => p.categoria).filter(Boolean),
    ])).sort(),
    [eligibleProducts]
  );
  const filteredProducts = useMemo(() => {
    const term = normalizeText(search);
    const fromServer = Boolean(remoteProducts);
    const source = remoteProducts || eligibleProducts;
    return source
      .filter((producto) => !componentIds.has(String(producto.id)))
      .filter((producto) => !category || producto.categoria === category)
      .filter((producto) => {
        const stock = Number(producto.stock) || 0;
        if (stockFilter === "con-stock") return stock > 0;
        if (stockFilter === "sin-stock") return stock <= 0;
        return true;
      })
      .filter((producto) => {
        if (fromServer || !term) return true;
        return [producto.nombre, producto.codigo, producto.descripcion, producto.subcategoria, producto.subCategoria]
          .some((field) => normalizeText(field).includes(term));
      })
      .slice(0, remoteProducts ? undefined : 10);
  }, [eligibleProducts, remoteProducts, componentIds, category, stockFilter, search]);

  const stockAnalysis = useMemo(
    () => getComboStockAnalysis({ componentesCombo: componentes }, productById),
    [componentes, productById]
  );
  const margin = Number(salePrice) - Number(stockAnalysis.costoComponentes || 0);
  const marginPercentage = Number(salePrice) > 0 && stockAnalysis.costoComponentes !== null
    ? (margin / Number(salePrice)) * 100
    : null;
  const hasInvalidDraft = componentes.some((component) => {
    const draft = quantityDrafts[component.productoId];
    return draft !== undefined && (!/^\d+$/.test(draft) || Number(draft) < 1);
  });
  const hasInvalidComponent = componentes.some((component) => {
    const producto = productById.get(component.productoId);
    return !producto || producto.categoria === "Obras" || isComboProduct(producto);
  });

  React.useEffect(() => {
    onValidityChange?.(!hasInvalidDraft && !hasInvalidComponent);
  }, [hasInvalidDraft, hasInvalidComponent, onValidityChange]);

  React.useEffect(() => {
    onSuggestedPrice?.(suggestedPrice);
  }, [onSuggestedPrice, suggestedPrice]);

  const emit = (next) => onChange?.(normalizeComboComponents(next));

  const addComponent = (producto) => {
    if (!producto?.id || disabled) return;
    setResolvedProducts((previous) => ({ ...previous, [String(producto.id)]: producto }));
    emit([
      ...componentes,
      {
        productoId: String(producto.id),
        nombre: producto.nombre || "",
        codigo: producto.codigo || "",
        cantidad: 1,
      },
    ]);
    setSearch("");
  };

  const updateQuantity = (productoId, rawValue) => {
    setQuantityDrafts((previous) => ({ ...previous, [productoId]: rawValue }));
    if (!/^\d+$/.test(rawValue) || Number(rawValue) < 1) return;
    emit(componentes.map((component) =>
      component.productoId === productoId ? { ...component, cantidad: Number(rawValue) } : component
    ));
  };

  const commitQuantity = (productoId) => {
    const draft = quantityDrafts[productoId];
    if (draft === undefined) return;
    if (!/^\d+$/.test(draft) || Number(draft) < 1) {
      const current = componentes.find((component) => component.productoId === productoId);
      setQuantityDrafts((previous) => ({ ...previous, [productoId]: String(current?.cantidad || 1) }));
      return;
    }
    setQuantityDrafts((previous) => {
      const next = { ...previous };
      delete next[productoId];
      return next;
    });
  };

  const removeComponent = (productoId) => {
    if (disabled) return;
    emit(componentes.filter((component) => component.productoId !== productoId));
    setQuantityDrafts((previous) => {
      const next = { ...previous };
      delete next[productoId];
      return next;
    });
  };

  const stockTone = stockAnalysis.stock > 0
    ? "text-emerald-700 dark:text-emerald-300"
    : "text-amber-700 dark:text-amber-300";

  return (
    <section className="space-y-5" aria-label="Productos del combo">
      <div className={`grid gap-2.5 ${showCosts ? "grid-cols-2 xl:grid-cols-4" : "grid-cols-2"}`}>
        <div className="rounded-2xl border border-border/70 bg-background/80 px-3.5 py-3 shadow-sm transition-colors">
          <div className="text-[10px] font-medium uppercase tracking-[0.13em] text-muted-foreground">Incluidos</div>
          <div className="mt-1 text-xl font-semibold leading-none tabular-nums">{componentes.length}</div>
          <div className="mt-1 text-[11px] text-muted-foreground">{componentes.length === 1 ? "producto" : "productos"}</div>
        </div>
        <div className={`rounded-2xl border px-3.5 py-3 shadow-sm transition-colors ${stockAnalysis.stock > 0 ? "border-emerald-200/80 bg-emerald-50/70 dark:border-emerald-900/70 dark:bg-emerald-950/25" : "border-amber-200/80 bg-amber-50/70 dark:border-amber-900/70 dark:bg-amber-950/25"}`}>
          <div className="text-[10px] font-medium uppercase tracking-[0.13em] text-muted-foreground">Disponibles</div>
          <div className={`mt-1 text-xl font-semibold leading-none tabular-nums ${stockTone}`}>{stockAnalysis.stock}</div>
          <div className="mt-1 text-[11px] text-muted-foreground">combos armables</div>
        </div>
        {showCosts && (
          <div className="rounded-2xl border border-border/70 bg-background/80 px-3.5 py-3 shadow-sm">
            <div className="text-[10px] font-medium uppercase tracking-[0.13em] text-muted-foreground">Costo estimado</div>
            <div className="mt-1 text-xl font-semibold leading-none tabular-nums">
              {stockAnalysis.costoComponentes === null ? "—" : formatMoney(stockAnalysis.costoComponentes)}
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">por combo</div>
          </div>
        )}
        {showCosts && (
          <div className="rounded-2xl border border-border/70 bg-background/80 px-3.5 py-3 shadow-sm">
            <div className="text-[10px] font-medium uppercase tracking-[0.13em] text-muted-foreground">Margen bruto</div>
            <div className={`mt-1 text-xl font-semibold leading-none tabular-nums ${margin >= 0 ? "text-emerald-700 dark:text-emerald-300" : "text-destructive"}`}>
              {marginPercentage === null ? "—" : `${marginPercentage.toLocaleString("es-AR", { maximumFractionDigits: 1 })}%`}
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              {marginPercentage === null ? "Completá los costos" : `${formatMoney(margin)} por combo`}
            </div>
          </div>
        )}
      </div>

      <div className="grid w-full grid-cols-1 items-start gap-4">
        <div className="overflow-hidden rounded-2xl border border-border/70 bg-background shadow-sm">
          <div className="border-b border-border/60 bg-gradient-to-br from-muted/35 via-background to-background px-4 py-4 sm:px-5">
            <div className="mb-3 flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Boxes className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold tracking-tight">Sumá productos</h3>
                <p className="text-xs text-muted-foreground">Buscá por nombre, código o medida.</p>
              </div>
            </div>
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Ej. 1 x 3 x 3, 1/2 x 4 o machimbre"
                aria-label="Buscar producto para agregar al combo"
                disabled={disabled}
                className="h-12 rounded-xl border-border/70 bg-background pl-10 pr-10 text-sm shadow-sm transition-all placeholder:text-muted-foreground/70 focus-visible:border-primary/50 focus-visible:ring-primary/15"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  aria-label="Limpiar búsqueda"
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </label>
            {isDimensionSearch && normalizedDimensions && (
              <div className="mt-2.5 inline-flex items-center gap-1.5 rounded-full border border-sky-200/70 bg-sky-50/80 px-2.5 py-1 text-[11px] font-medium text-sky-800 dark:border-sky-900/70 dark:bg-sky-950/30 dark:text-sky-300">
                <Ruler className="h-3 w-3" />
                Medidas {normalizedDimensions}
              </div>
            )}
            {!isDimensionSearch && remoteLoading && (
              <div className="mt-2.5 text-[11px] text-muted-foreground">Buscando en el catálogo…</div>
            )}
          </div>

          <div className="space-y-3 px-4 py-3.5 sm:px-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-1.5" aria-label="Filtrar por categoría">
                <button
                  type="button"
                  onClick={() => setCategory("")}
                  disabled={disabled}
                  className={`rounded-full px-3 py-1.5 text-[11px] font-medium transition-all motion-safe:duration-150 ${!category ? "bg-foreground text-background shadow-sm" : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                >
                  Todo
                </button>
                {categories.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setCategory(category === item ? "" : item)}
                    disabled={disabled}
                    className={`rounded-full px-3 py-1.5 text-[11px] font-medium transition-all motion-safe:duration-150 ${category === item ? "bg-foreground text-background shadow-sm" : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground"}`}
                  >
                    {item}
                  </button>
                ))}
              </div>
              <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                <SlidersHorizontal className="h-3 w-3" />
                <select
                  value={stockFilter}
                  onChange={(event) => setStockFilter(event.target.value)}
                  disabled={disabled}
                  aria-label="Filtrar por disponibilidad"
                  className="h-7 cursor-pointer rounded-lg border-0 bg-transparent pr-1 text-[10px] font-medium text-muted-foreground outline-none focus:text-foreground"
                >
                  <option value="todos" className="bg-popover text-popover-foreground">Cualquier stock</option>
                  <option value="con-stock" className="bg-popover text-popover-foreground">Con disponibilidad</option>
                  <option value="sin-stock" className="bg-popover text-popover-foreground">Sin stock</option>
                </select>
              </span>
            </div>

            <div className="flex items-center justify-between border-t border-border/50 pt-2.5">
              <span className="text-[11px] font-medium text-muted-foreground">
                {remoteLoading ? "Actualizando resultados" : search || category || stockFilter !== "todos" ? `${filteredProducts.length}${remoteHasMore ? "+" : ""} resultados` : "Catálogo"}
              </span>
              {remoteError && <span className="text-[11px] text-destructive">{remoteError}</span>}
            </div>

            <div className="max-h-[340px] min-h-[130px] divide-y divide-border/50 overflow-y-auto overscroll-contain rounded-xl border border-border/60 bg-card/50" aria-label="Resultados de productos">
              {!search && !category && stockFilter === "todos" ? (
                <div className="flex min-h-[130px] flex-col items-center justify-center px-4 text-center">
                  <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-muted/70 text-muted-foreground"><Search className="h-4 w-4" /></div>
                  <p className="text-xs font-medium text-foreground">¿Qué producto necesitás?</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">Probá con una medida, un nombre o un código.</p>
                </div>
              ) : remoteLoading && filteredProducts.length === 0 ? (
                <div className="flex min-h-[130px] items-center justify-center gap-2 text-xs text-muted-foreground">
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary/25 border-t-primary" />
                  Buscando productos…
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="flex min-h-[130px] flex-col items-center justify-center px-4 text-center">
                  <Package className="mb-2 h-5 w-5 text-muted-foreground/70" />
                  <p className="text-xs font-medium text-foreground">No encontramos coincidencias</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">Probá con otra medida o cambiá los filtros.</p>
                </div>
              ) : filteredProducts.map((producto) => {
                const price = getCalculatedPrice(producto);
                return (
                  <div key={producto.id} className="group flex items-center gap-3 px-3 py-3 transition-colors hover:bg-background sm:px-3.5 motion-safe:duration-150">
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${producto.categoria === "Maderas" ? "bg-orange-500/10 text-orange-700 dark:text-orange-300" : "bg-primary/10 text-primary"}`}>
                      {producto.categoria === "Maderas" ? <Ruler className="h-4 w-4" /> : <Package className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-semibold text-foreground">{producto.nombre || "Producto sin nombre"}</div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-[9px] text-muted-foreground">Precio calculado</div>
                      <div className="text-xs font-semibold tabular-nums text-foreground">
                        {price > 0 ? formatMoney(price) : "Sin precio"}
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => addComponent(producto)}
                      disabled={disabled || remoteLoading}
                      aria-label={`Agregar ${producto.nombre || "producto"}`}
                      className="h-8 w-8 shrink-0 rounded-lg border-border/70 text-muted-foreground shadow-none transition-all hover:border-primary/30 hover:bg-primary/5 hover:text-primary group-hover:scale-[1.03] motion-safe:duration-150"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                );
              })}
              {remoteHasMore && (
                <button
                  type="button"
                  onClick={() => setRemotePage((page) => page + 1)}
                  disabled={remoteLoading}
                  className="w-full px-3 py-2.5 text-center text-[11px] font-medium text-primary transition-colors hover:bg-primary/5 disabled:opacity-50"
                >
                  {remoteLoading ? "Cargando…" : "Ver más resultados"}
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-border/70 bg-background shadow-sm">
          <div className="flex items-center justify-between border-b border-border/60 bg-gradient-to-br from-muted/35 via-background to-background px-4 py-4 sm:px-5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary"><Boxes className="h-4 w-4" /></div>
              <div>
                <h3 className="text-sm font-semibold tracking-tight">Productos del combo</h3>
                <p className="text-xs text-muted-foreground">Cantidad de cada producto en una unidad del combo.</p>
              </div>
            </div>
            <span className="rounded-full border border-border/70 bg-background px-2.5 py-1 text-[10px] font-medium text-muted-foreground tabular-nums">
              {componentes.length} {componentes.length === 1 ? "producto" : "productos"}
            </span>
          </div>

          {stockAnalysis.limitantes.length > 0 && componentes.length > 0 && (
            <div className={`flex items-start gap-2.5 border-b px-4 py-3 sm:px-5 ${stockAnalysis.stock > 0 ? "border-sky-200/60 bg-sky-50/60 text-sky-900 dark:border-sky-900/50 dark:bg-sky-950/20 dark:text-sky-200" : "border-amber-200/60 bg-amber-50/60 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200"}`}>
              {stockAnalysis.stock > 0 ? <SlidersHorizontal className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
              <p className="text-[11px] leading-relaxed">
                {stockAnalysis.stock > 0
                  ? <>La disponibilidad la marca <strong>{stockAnalysis.limitantes.map((item) => item.nombre || productById.get(item.productoId)?.nombre || item.productoId).join(", ")}</strong>.</>
                  : <>El stock actual es cero. Podés guardar el combo igual; su disponibilidad se actualizará cuando haya existencias.</>}
              </p>
            </div>
          )}

          {componentes.length === 0 ? (
            <div className="flex min-h-[245px] flex-col items-center justify-center px-6 py-8 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/70 text-muted-foreground"><Package className="h-5 w-5" /></div>
              <p className="text-sm font-medium text-foreground">Este combo todavía no tiene productos</p>
              <p className="mt-1 max-w-[230px] text-xs leading-relaxed text-muted-foreground">Buscá y agregá productos de venta; después ajustá la cantidad de cada uno.</p>
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {componentes.map((component, index) => {
                const producto = productById.get(component.productoId);
                const invalidProduct = !producto || producto.categoria === "Obras" || isComboProduct(producto);
                const stock = Math.max(0, Number(producto?.stock) || 0);
                const stockTotal = Math.max(stock, Number(producto?.stockTotal) || 0);
                const stockReservado = Math.max(0, Number(producto?.stockReservado) || 0);
                const unitCost = getCost(producto);
                const calculatedPrice = producto ? getCalculatedPrice(producto) : 0;
                const dimensions = formatDimensions(producto);
                const displayName = producto?.nombre || component.nombre || "Componente no encontrado";
                const nameDigits = normalizeText(displayName).replace(/\D/g, "");
                const dimensionsDigits = String(dimensions || "").replace(/\D/g, "");
                const nameHasDimensions = Boolean(dimensionsDigits && nameDigits.includes(dimensionsDigits));
                const draft = quantityDrafts[component.productoId] ?? String(component.cantidad);
                return (
                  <div key={component.productoId} className={`px-3.5 py-3.5 transition-colors sm:px-4 ${invalidProduct ? "bg-destructive/[0.035]" : "hover:bg-muted/20"} motion-safe:duration-150`}>
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted/70 text-[10px] font-semibold text-muted-foreground tabular-nums">{String(index + 1).padStart(2, "0")}</div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <span className="max-w-full truncate text-xs font-semibold text-foreground">{producto?.nombre || component.nombre || "Componente no encontrado"}</span>
                          {producto?.codigo && <span className="text-[10px] text-muted-foreground">{producto.codigo}</span>}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[10px] text-muted-foreground">
                          {invalidProduct ? <span className="text-destructive">Ya no se puede usar en combos</span> : <>
                            {producto?.categoria && <span>{producto.categoria}</span>}
                            {producto?.unidadMedida && <span>{producto.unidadMedida}</span>}
                            {dimensions && !nameHasDimensions && <span className="inline-flex items-center gap-0.5"><Ruler className="h-2.5 w-2.5" />{dimensions}</span>}
                          </>}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center rounded-xl border border-border/70 bg-background p-0.5 shadow-sm">
                        <button
                          type="button"
                          onClick={() => updateQuantity(component.productoId, String(Math.max(1, component.cantidad - 1)))}
                          disabled={disabled || component.cantidad <= 1}
                          aria-label={`Disminuir cantidad de ${producto?.nombre || component.nombre}`}
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-35"
                        ><Minus className="h-3 w-3" /></button>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          inputMode="numeric"
                          value={draft}
                          onChange={(event) => updateQuantity(component.productoId, event.target.value)}
                          onBlur={() => commitQuantity(component.productoId)}
                          disabled={disabled}
                          aria-label={`Cantidad de ${producto?.nombre || component.nombre || component.productoId} por combo`}
                          className="h-7 w-10 border-0 bg-transparent p-0 text-center text-xs font-semibold tabular-nums outline-none focus:ring-0 disabled:opacity-60"
                        />
                        <button
                          type="button"
                          onClick={() => updateQuantity(component.productoId, String(component.cantidad + 1))}
                          disabled={disabled}
                          aria-label={`Aumentar cantidad de ${producto?.nombre || component.nombre}`}
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-35"
                        ><Plus className="h-3 w-3" /></button>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeComponent(component.productoId)}
                        disabled={disabled}
                        aria-label={`Quitar ${producto?.nombre || component.nombre || component.productoId}`}
                        className="-mr-1 h-8 w-8 shrink-0 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      ><X className="h-3.5 w-3.5" /></Button>
                    </div>

                    <div className="ml-10 mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={`rounded-full px-2 py-1 text-[10px] font-medium tabular-nums ${stock > 0 ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-amber-500/10 text-amber-700 dark:text-amber-300"}`}>
                          {stock} disponibles
                        </span>
                        {stockReservado > 0 && <span className="text-[10px] text-muted-foreground">{stockReservado} reservados de {stockTotal}</span>}
                        <span className="text-[10px] text-muted-foreground">· {component.cantidad} por combo</span>
                      </div>
                      {showCosts && (
                        <span className="text-[10px] tabular-nums text-muted-foreground">
                          {unitCost === null ? "Costo sin cargar" : `${formatMoney(unitCost * component.cantidad)} / combo`}
                        </span>
                      )}
                      <span className="text-[10px] tabular-nums text-muted-foreground">
                        {calculatedPrice > 0 ? `${formatMoney(calculatedPrice)} c/u · ${formatMoney(calculatedPrice * component.cantidad)} / combo` : "Precio no disponible"}
                      </span>
                    </div>
                    {hasInvalidDraft && quantityDrafts[component.productoId] !== undefined && (!/^\d+$/.test(quantityDrafts[component.productoId]) || Number(quantityDrafts[component.productoId]) < 1) && (
                      <div className="ml-10 mt-1 text-[10px] text-destructive">Usá una cantidad entera mayor que cero.</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {hasInvalidDraft && (
            <div className="border-t border-amber-200/60 bg-amber-50/50 px-4 py-2.5 text-[11px] text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-300">
              Corregí las cantidades para guardar el combo.
            </div>
          )}
          {hasInvalidComponent && (
            <div className="border-t border-destructive/15 bg-destructive/[0.04] px-4 py-2.5 text-[11px] text-destructive">
              Quitá los productos eliminados, de Obras o que ahora sean combos.
            </div>
          )}
          {componentes.length > 0 && !hasInvalidDraft && !hasInvalidComponent && (
            <div className="flex items-center gap-1.5 border-t border-border/50 px-4 py-2.5 text-[10px] text-muted-foreground">
              <Check className="h-3 w-3 text-emerald-600" />
              El stock informa cuántas unidades se pueden armar, pero no impide guardar el combo.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
