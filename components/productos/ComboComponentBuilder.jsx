"use client";

import React, { useDeferredValue, useEffect, useMemo, useState } from "react";
import { Boxes, Minus, Package, Plus, Ruler, Search, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { dimensionSearchVariants, parseDimensionQuery } from "@/lib/product-search";
import { calcularPrecioComponenteVenta, calcularPrecioComponenteCantidad, getMedidaPorUnidadComponente } from "@/lib/pricing";
import {
  getComboStockAnalysis,
  isDiscreteComboUnit,
  isValidComboQuantity,
  isComboProduct,
  normalizeComboQuantity,
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
const getProductUnit = (producto) => String(
  producto?.unidadMedida || producto?.unidad || producto?.unidadVenta || "Unidad"
).trim() || "Unidad";
const getMeasuredAmountPerItem = (producto) => {
  const medida = getMedidaPorUnidadComponente(producto);
  return medida?.cantidadPorUnidad ? { amount: medida.cantidadPorUnidad, unit: medida.simbolo } : null;
};
const formatQuantity = (value) => Number(value || 0).toLocaleString("es-AR", { maximumFractionDigits: 3 });
const quantityStep = (unit) => isDiscreteComboUnit(unit) ? 1 : 0.001;
const quantityIncrement = (unit) => isDiscreteComboUnit(unit) ? 1 : 0.01;
const minimumQuantity = (unit) => isDiscreteComboUnit(unit) ? 1 : 0.001;
const parseQuantity = (raw) => {
  const parsed = Number(String(raw ?? "").trim().replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
};
const isValidQuantity = (raw, unit) => {
  const quantity = parseQuantity(raw);
  return quantity !== null && isValidComboQuantity(quantity, unit);
};

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
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [category, setCategory] = useState("");
  const [stockFilter, setStockFilter] = useState("todos");
  const [quantityDrafts, setQuantityDrafts] = useState({});
  const [quantityModes, setQuantityModes] = useState({});
  const [resultLimit, setResultLimit] = useState(20);
  const [resolvedProducts, setResolvedProducts] = useState({});
  const deferredSearch = useDeferredValue(debouncedSearch);

  const componentes = useMemo(() => normalizeComboComponents(value), [value]);
  const productById = useMemo(() => {
    const products = new Map((Array.isArray(productos) ? productos : []).map((p) => [String(p.id), p]));
    Object.values(resolvedProducts).forEach((p) => products.set(String(p.id), p));
    return products;
  }, [productos, resolvedProducts]);
  const componentById = useMemo(
    () => new Map(componentes.map((component) => [component.productoId, component])),
    [componentes]
  );
  const suggestedPrice = useMemo(() => {
    if (componentes.length === 0) return null;
    let sum = 0;
    for (const component of componentes) {
      const producto = productById.get(component.productoId);
      if (!producto || producto.categoria === "Obras" || isComboProduct(producto)) return null;
      const total = calcularPrecioComponenteCantidad(producto, component.cantidad);
      if (!Number.isFinite(total) || total <= 0) return null;
      sum += total;
    }
    return Math.round(sum * 100) / 100;
  }, [componentes, productById]);
  const eligibleProducts = useMemo(
    () =>
      (Array.isArray(productos) ? productos : [])
        .filter((producto) => producto?.categoria !== "Obras" && !isComboProduct(producto))
        .map((producto) => ({
          ...producto,
          _comboSearchText: [producto.nombre, producto.codigo, producto.descripcion, producto.unidadMedida, producto.unidad, producto.subcategoria, producto.subCategoria]
            .map(normalizeText)
            .join(" "),
        }))
        .sort((a, b) => {
          const stockDifference = (Number(b.stock) || 0) - (Number(a.stock) || 0);
          return stockDifference || String(a.nombre || "").localeCompare(String(b.nombre || ""), "es", { sensitivity: "base" });
        }),
    [productos]
  );

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 100);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setResultLimit(20);
  }, [deferredSearch, category, stockFilter]);

  const categories = useMemo(
    () => Array.from(new Set([
      "Maderas",
      "Ferretería",
      ...eligibleProducts.map((p) => p.categoria).filter(Boolean),
    ])).sort(),
    [eligibleProducts]
  );
  const filteredProducts = useMemo(() => {
    const term = normalizeText(deferredSearch);
    const dimensions = parseDimensionQuery(deferredSearch);
    const dimensionVariants = dimensionSearchVariants(dimensions);
    const stockFiltered = eligibleProducts
      .filter((producto) => !category || producto.categoria === category)
      .filter((producto) => {
        const stock = Number(producto.stock) || 0;
        if (stockFilter === "con-stock") return stock > 0;
        if (stockFilter === "sin-stock") return stock <= 0;
        return true;
      })
      .filter((producto) => {
        if (dimensions) {
          return producto.categoria === "Maderas" && dimensionVariants.some((variant) =>
            Object.entries(variant).every(([field, value]) => Math.abs(Number(producto[field]) - value) < 0.01)
          );
        }
        if (!term) return true;
        return producto._comboSearchText.includes(term);
      });
    return stockFiltered;
  }, [eligibleProducts, category, stockFilter, deferredSearch]);
  const visibleProducts = useMemo(
    () => filteredProducts.slice(0, resultLimit),
    [filteredProducts, resultLimit]
  );

  const stockAnalysis = useMemo(
    () => getComboStockAnalysis({ componentesCombo: componentes }, productById),
    [componentes, productById]
  );
  const margin = Number(salePrice) - Number(stockAnalysis.costoComponentes || 0);
  const marginPercentage = Number(salePrice) > 0 && stockAnalysis.costoComponentes !== null
    ? (margin / Number(salePrice)) * 100
    : null;
  const getMode = (productoId) => {
    const medida = getMedidaPorUnidadComponente(productById.get(productoId));
    return medida?.cantidadPorUnidad && quantityModes[productoId] === "medida" ? "medida" : "unidades";
  };
  const rawToUnits = (productoId, raw) => {
    const parsed = parseQuantity(raw);
    if (parsed === null) return null;
    const component = componentById.get(productoId);
    const product = productById.get(productoId);
    const unit = getProductUnit(product || component);
    let units = parsed;
    if (getMode(productoId) === "medida") {
      const per = getMedidaPorUnidadComponente(product)?.cantidadPorUnidad;
      if (!per) return null;
      // Igual que en ventas: las piezas necesarias para cubrir la medida se redondean hacia arriba.
      units = Math.max(1, Math.ceil(parsed / per - 1e-9));
    }
    return isValidComboQuantity(units, unit) ? units : null;
  };
  const hasInvalidDraft = componentes.some((component) => {
    const draft = quantityDrafts[component.productoId];
    return draft !== undefined && rawToUnits(component.productoId, draft) === null;
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
        categoria: producto.categoria || "",
        unidadMedida: getProductUnit(producto),
        cantidad: 1,
      },
    ]);
  };

  const updateQuantity = (productoId, rawValue) => {
    setQuantityDrafts((previous) => ({ ...previous, [productoId]: rawValue }));
    const component = componentes.find((item) => item.productoId === productoId);
    const product = productById.get(productoId);
    const unit = getProductUnit(product || component);
    const quantity = rawToUnits(productoId, rawValue);
    if (quantity === null) return;
    emit(componentes.map((component) =>
      component.productoId === productoId ? { ...component, cantidad: quantity, unidadMedida: unit } : component
    ));
  };

  const commitQuantity = (productoId) => {
    const draft = quantityDrafts[productoId];
    if (draft === undefined) return;
    const component = componentes.find((item) => item.productoId === productoId);
    const product = productById.get(productoId);
    const unit = getProductUnit(product || component);
    const parsed = rawToUnits(productoId, draft);
    if (parsed === null) {
      setQuantityDrafts((previous) => {
        const next = { ...previous };
        delete next[productoId];
        return next;
      });
      return;
    }
    if (parsed !== component?.cantidad) {
      emit(componentes.map((item) => item.productoId === productoId ? { ...item, cantidad: parsed, unidadMedida: unit } : item));
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

  const setMode = (productoId, mode) => {
    setQuantityModes((previous) => ({ ...previous, [productoId]: mode }));
    setQuantityDrafts((previous) => {
      const next = { ...previous };
      delete next[productoId];
      return next;
    });
  };

  const displayValue = (producto, component) => {
    const per = getMedidaPorUnidadComponente(producto)?.cantidadPorUnidad;
    if (getMode(component.productoId) === "medida" && per) {
      return String(Math.round(component.cantidad * per * 1000) / 1000);
    }
    return String(component.cantidad);
  };

  const adjustQuantity = (producto, component, direction) => {
    const id = component.productoId;
    const unit = getProductUnit(producto || component);
    const current = Number(quantityDrafts[id] !== undefined ? parseQuantity(quantityDrafts[id]) : displayValue(producto, component)) || 0;
    const rounded = Math.round(current * 1000) / 1000;
    const next = direction > 0 ? Math.floor(rounded) + 1 : Math.max(1, Math.ceil(rounded) - 1);
    updateQuantity(id, String(next));
  };

  const renderQuantityControl = (producto, component, { wide = false } = {}) => {
    const id = component.productoId;
    const unit = getProductUnit(producto || component);
    const medida = getMedidaPorUnidadComponente(producto);
    const canMeasure = Boolean(medida?.cantidadPorUnidad);
    const mode = getMode(id);
    const label = mode === "medida" ? medida.simbolo : unit;
    const name = producto?.nombre || component.nombre || id;
    const minimum = mode === "medida" ? 0.001 : minimumQuantity(unit);
    return (
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        {canMeasure && (
          <div className="inline-flex rounded-lg bg-muted/60 p-0.5 text-[10px] font-medium" role="group" aria-label={`Modo de cantidad de ${name}`}>
            <button
              type="button"
              onClick={() => setMode(id, "unidades")}
              disabled={disabled}
              className={`rounded-md px-2 py-1 transition-colors ${mode === "unidades" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >Unidades</button>
            <button
              type="button"
              onClick={() => setMode(id, "medida")}
              disabled={disabled}
              className={`rounded-md px-2 py-1 transition-colors ${mode === "medida" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >{medida.simbolo}</button>
          </div>
        )}
        <div className="flex items-center rounded-xl border border-border/70 bg-background p-0.5 shadow-sm">
          <button
            type="button"
            onClick={() => adjustQuantity(producto, component, -1)}
            disabled={disabled || Number(displayValue(producto, component)) <= 1}
            aria-label={`Disminuir cantidad de ${name}`}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-35"
          ><Minus className="h-3 w-3" /></button>
          <input
            type="text"
            inputMode={mode === "medida" || !isDiscreteComboUnit(unit) ? "decimal" : "numeric"}
            autoComplete="off"
            value={quantityDrafts[id] ?? displayValue(producto, component)}
            onChange={(event) => {
              const allowsDecimals = mode === "medida" || !isDiscreteComboUnit(unit);
              const cleaned = event.target.value
                .replace(allowsDecimals ? /[^\d.,]/g : /\D/g, "")
                .replace(/[.,]/g, (separator, offset, text) => (text.search(/[.,]/) === offset ? separator : ""));
              updateQuantity(id, cleaned);
            }}
            onFocus={(event) => event.target.select()}
            onBlur={() => commitQuantity(id)}
            disabled={disabled}
            aria-label={`Cantidad de ${name} en ${label} por combo`}
            className={`h-7 ${wide ? "w-16" : "w-14"} border-0 bg-transparent p-0 text-center text-xs font-semibold tabular-nums outline-none focus:ring-0 disabled:opacity-60`}
          />
          <button
            type="button"
            onClick={() => adjustQuantity(producto, component, 1)}
            disabled={disabled}
            aria-label={`Aumentar cantidad de ${name}`}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-35"
          ><Plus className="h-3 w-3" /></button>
          <span className="px-1.5 text-[10px] font-medium text-muted-foreground">{label}</span>
        </div>
      </div>
    );
  };

  const renderMedidaInfo = (producto) => {
    const medida = getMedidaPorUnidadComponente(producto);
    if (!medida) return null;
    if (!medida.cantidadPorUnidad) {
      return <span className="text-amber-600 dark:text-amber-400">Falta {medida.faltantes.join(" y ")} para calcular {medida.simbolo}</span>;
    }
    return <span className="font-medium text-foreground/80">{medida.formula} por unidad</span>;
  };

  const stockTone = stockAnalysis.stock > 0
    ? "text-emerald-700 dark:text-emerald-300"
    : "text-amber-700 dark:text-amber-300";

  return (
    <section
      className="space-y-5"
      aria-label="Productos del combo"
      onKeyDown={(event) => {
        if (event.key === "Enter" && event.target instanceof HTMLInputElement) event.preventDefault();
      }}
    >
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
                onKeyDown={(event) => {
                  if (event.key === "Escape" && search) {
                    event.preventDefault();
                    setSearch("");
                    return;
                  }
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  const first = visibleProducts.find((item) => !componentById.has(String(item.id)));
                  if (first) addComponent(first);
                }}
                autoComplete="off"
                enterKeyHint="search"
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
            {search !== debouncedSearch && (
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
                {search || category || stockFilter !== "todos" ? `${filteredProducts.length} resultados` : `${filteredProducts.length} productos`}
              </span>
            </div>

            <div className="max-h-[340px] min-h-[130px] divide-y divide-border/50 overflow-y-auto overscroll-contain rounded-xl border border-border/60 bg-card/50" aria-label="Resultados de productos">
              {!search && !category && stockFilter === "todos" ? (
                <div className="flex min-h-[130px] flex-col items-center justify-center px-4 text-center">
                  <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-muted/70 text-muted-foreground"><Search className="h-4 w-4" /></div>
                  <p className="text-xs font-medium text-foreground">¿Qué producto necesitás?</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">Probá con una medida, un nombre o un código.</p>
                </div>
              ) : visibleProducts.length === 0 ? (
                <div className="flex min-h-[130px] flex-col items-center justify-center px-4 text-center">
                  <Package className="mb-2 h-5 w-5 text-muted-foreground/70" />
                  <p className="text-xs font-medium text-foreground">No encontramos coincidencias</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">Probá con otra medida o cambiá los filtros.</p>
                </div>
              ) : visibleProducts.map((producto) => {
                const price = getCalculatedPrice(producto);
                const selectedComponent = componentById.get(String(producto.id));
                const unit = getProductUnit(producto);
                const measuredAmount = getMeasuredAmountPerItem(producto);
                return (
                  <div key={producto.id} className={`group flex flex-wrap items-center gap-3 border-l-2 px-3 py-3 transition-colors sm:px-3.5 motion-safe:duration-150 ${selectedComponent ? "border-l-primary bg-primary/[0.04]" : "border-l-transparent hover:bg-background"}`}>
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${producto.categoria === "Maderas" ? "bg-orange-500/10 text-orange-700 dark:text-orange-300" : "bg-primary/10 text-primary"}`}>
                      {producto.categoria === "Maderas" ? <Ruler className="h-4 w-4" /> : <Package className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0 flex-1 basis-[45%]">
                      <div className="truncate text-xs font-semibold text-foreground">{producto.nombre || "Producto sin nombre"}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                        {selectedComponent && <span className="rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-primary">En el combo</span>}
                        <span className="rounded-full bg-muted px-2 py-0.5 font-medium">{unit}</span>
                        {renderMedidaInfo(producto)}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-[9px] text-muted-foreground">Precio calculado</div>
                      <div className="text-xs font-semibold tabular-nums text-foreground">
                        {price > 0 ? formatMoney(price) : "Sin precio"}
                      </div>
                    </div>
                    {selectedComponent ? (
                      <div className="flex shrink-0 items-start gap-1.5">
                        {renderQuantityControl(producto, selectedComponent)}
                        <button
                          type="button"
                          onClick={() => removeComponent(String(producto.id))}
                          disabled={disabled}
                          aria-label={`Quitar ${producto.nombre} del combo`}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
                        ><X className="h-3.5 w-3.5" /></button>
                      </div>
                    ) : <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => addComponent(producto)}
                      disabled={disabled}
                      aria-label={`Agregar ${producto.nombre || "producto"}`}
                      className="h-8 w-8 shrink-0 rounded-lg border-border/70 text-muted-foreground shadow-none transition-all hover:border-primary/30 hover:bg-primary/5 hover:text-primary group-hover:scale-[1.03] motion-safe:duration-150"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>}
                    {selectedComponent && (
                      <div className="basis-full pl-12 text-[10px] text-muted-foreground">
                        {measuredAmount
                          ? `Incluye ${formatQuantity(measuredAmount.amount * selectedComponent.cantidad)} ${measuredAmount.unit} en el combo`
                          : `Incluye ${formatQuantity(selectedComponent.cantidad)} ${unit} en el combo`}
                      </div>
                    )}
                  </div>
                );
              })}
              {filteredProducts.length > visibleProducts.length && (
                <button
                  type="button"
                  onClick={() => setResultLimit((limit) => limit + 20)}
                  disabled={disabled}
                  className="w-full px-3 py-2.5 text-center text-[11px] font-medium text-primary transition-colors hover:bg-primary/5 disabled:opacity-50"
                >
                  Ver más resultados
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
                const unit = producto ? getProductUnit(producto) : component.unidadMedida || "Unidad";
                const measuredAmount = producto ? getMeasuredAmountPerItem(producto) : null;
                const dimensions = formatDimensions(producto);
                const displayName = producto?.nombre || component.nombre || "Componente no encontrado";
                const nameDigits = normalizeText(displayName).replace(/\D/g, "");
                const dimensionsDigits = String(dimensions || "").replace(/\D/g, "");
                const nameHasDimensions = Boolean(dimensionsDigits && nameDigits.includes(dimensionsDigits));
                const componentTotal = producto ? calcularPrecioComponenteCantidad(producto, component.cantidad) : 0;
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
                            <span className="rounded-full bg-muted px-2 py-0.5 font-medium">{unit}</span>
                            {dimensions && !nameHasDimensions && <span className="inline-flex items-center gap-0.5"><Ruler className="h-2.5 w-2.5" />{dimensions}</span>}
                          </>}
                        </div>
                      </div>
                      {renderQuantityControl(producto, component)}
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
                          <span className="text-[10px] text-muted-foreground">· {formatQuantity(component.cantidad)} {measuredAmount ? "u." : unit} por combo</span>
                          {measuredAmount && (
                            <span className="text-[10px] text-muted-foreground">
                              ({formatQuantity(measuredAmount.amount * component.cantidad)} {measuredAmount.unit})
                            </span>
                          )}
                          {producto && <span className="text-[10px]">{renderMedidaInfo(producto)}</span>}
                      </div>
                      {showCosts && (
                        <span className="text-[10px] tabular-nums text-muted-foreground">
                          {unitCost === null ? "Costo sin cargar" : `${formatMoney(unitCost * component.cantidad)} / combo`}
                        </span>
                      )}
                      <span className="text-[10px] tabular-nums text-muted-foreground">
                        {componentTotal > 0 ? `${formatMoney(componentTotal)} / combo` : "Precio no disponible"}
                      </span>
                    </div>
                    {hasInvalidDraft && quantityDrafts[component.productoId] !== undefined && rawToUnits(component.productoId, quantityDrafts[component.productoId]) === null && (
                      <div className="ml-10 mt-1 text-[10px] text-destructive">
                        {isDiscreteComboUnit(unit) ? "Usá una cantidad entera mayor que cero." : `Ingresá una cantidad válida en ${unit}.`}
                      </div>
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
        </div>
      </div>
    </section>
  );
}
