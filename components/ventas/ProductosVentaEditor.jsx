"use client";

import React, { useEffect, useMemo, useState, useTransition } from "react";
import { computeLineBase, computeLineSubtotal, computeTotals } from "@/lib/pricing";
import QuantityMeasureControl, { MedidaValue } from "@/components/ui/quantity-measure-control";
import ComboComponentRows from "@/components/ventas/ComboComponentRows";
import { isComboProduct, normalizeComboComponents } from "@/lib/combos";
import { Button } from "@/components/ui/button";
import {
  Check,
  Copy,
  Layers,
  Package,
  PackageOpen,
  Plus,
  Ruler,
  Search,
  Tag,
  Trash2,
  Trees,
} from "lucide-react";

const noop = () => {};

/**
 * Shared catalog selector and editable line-item table for sales and budgets.
 * Document-specific pricing and persistence rules stay in the parent pages.
 */
export default function ProductosVentaEditor({
  items = [],
  productos = [],
  onAgregarProductoCatalogo = noop,
  getProductoCatalogoPreview = noop,
  onAgregarEjemplo = noop,
  onQuitarProductoDesdeCatalogo = noop,
  loadingPrecios = false,
  pagoEnEfectivo = false,
  onPagoEnEfectivoChange,
  idPagoEnEfectivo = "pagoEnEfectivo",
  textoPagoEnEfectivo = "Pago en efectivo (-10%)",
  formatearNumeroArgentino = (value) => Number(value || 0).toLocaleString("es-AR"),
  defaultCepilladoPorcentaje = 6,
  defaultCalibradoPorcentaje = 3,
  disableMaderaTreatmentsForUnit = false,
  clampDiscount = false,
  onNombreChange = noop,
  onUnidadMaderaChange,
  onDimensionChange = noop,
  onPrecioPorPieChange = noop,
  onCantidadChange = noop,
  onIncrementarCantidad = noop,
  onDecrementarCantidad = noop,
  onCepilladoChange = noop,
  onCepilladoPorcentajeChange = noop,
  onCalibradoChange = noop,
  onCalibradoPorcentajeChange = noop,
  onPrecioChange = noop,
  onDescuentoChange = noop,
  onClonarProducto = noop,
  onQuitarProducto = noop,
  headerAction = null,
  footer = null,
  showWhenEmpty = false,
}) {
  const [categoriaId, setCategoriaId] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [filtroTipoMadera, setFiltroTipoMadera] = useState("");
  const [filtroSubCategoria, setFiltroSubCategoria] = useState("");
  const [paginaActual, setPaginaActual] = useState(1);
  const [isPending, startTransition] = useTransition();
  const busquedaDiferida = React.useDeferredValue(busqueda);
  const productosPorPagina = 12;

  const categorias = useMemo(
    () => [...new Set(productos.map((producto) => producto.categoria).filter(Boolean))],
    [productos]
  );
  const tiposMadera = useMemo(
    () => [...new Set(productos.filter((producto) => producto.categoria === "Maderas").map((producto) => producto.tipoMadera).filter(Boolean))],
    [productos]
  );
  const subCategoriasFerreteria = useMemo(
    () => [...new Set(productos.filter((producto) => producto.categoria === "Ferretería").map((producto) => producto.subCategoria || producto.subcategoria).filter(Boolean))],
    [productos]
  );
  const productosFiltrados = useMemo(() => {
    const normalizar = (value) => String(value || "").toLocaleLowerCase("es-AR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "");
    const termino = normalizar(busquedaDiferida.trim());
    return productos
      .filter((producto) => {
        if (categoriaId && producto.categoria !== categoriaId) return false;
        if (categoriaId === "Maderas" && filtroTipoMadera && producto.tipoMadera !== filtroTipoMadera) return false;
        if (categoriaId === "Ferretería" && filtroSubCategoria && (producto.subCategoria || producto.subcategoria) !== filtroSubCategoria) return false;
        if (!termino) return true;
        const nombre = normalizar(producto.nombre);
        const unidad = normalizar(producto.unidadMedida || producto.unidad || "");
        const busquedaNormalizada = termino.endsWith(".") ? termino.slice(0, -1) : termino;
        return termino.endsWith(".")
          ? nombre.startsWith(busquedaNormalizada) || unidad.startsWith(busquedaNormalizada)
          : nombre.includes(busquedaNormalizada) || unidad.includes(busquedaNormalizada);
      })
      .sort((a, b) => {
        const stockA = Number(a.stock) || 0;
        const stockB = Number(b.stock) || 0;
        if (stockA > 0 && stockB === 0) return -1;
        if (stockA === 0 && stockB > 0) return 1;
        return 0;
      });
  }, [productos, categoriaId, busquedaDiferida, filtroTipoMadera, filtroSubCategoria]);
  const totalProductos = productosFiltrados.length;
  const totalPaginas = Math.max(1, Math.ceil(totalProductos / productosPorPagina));
  const productosPaginados = useMemo(() => {
    const start = (paginaActual - 1) * productosPorPagina;
    return productosFiltrados.slice(start, start + productosPorPagina);
  }, [productosFiltrados, paginaActual]);

  useEffect(() => {
    setPaginaActual(1);
  }, [categoriaId, busquedaDiferida, filtroTipoMadera, filtroSubCategoria]);

  useEffect(() => {
    if (paginaActual > totalPaginas) setPaginaActual(totalPaginas);
  }, [paginaActual, totalPaginas]);

  const cambiarPagina = (pagina) => {
    startTransition(() => setPaginaActual(Math.max(1, Math.min(pagina, totalPaginas))));
  };

  const handleCategoriaChange = (categoria) => {
    setCategoriaId(categoria);
    setFiltroTipoMadera("");
    setFiltroSubCategoria("");
  };

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-border/60 bg-card p-4 shadow-sm sm:p-6">
        <h2 className="mb-4 text-lg font-semibold tracking-tight text-foreground">Editar productos de la venta</h2>
        <div className="overflow-hidden rounded-xl border border-border/60 bg-card">
          <div className="border-b border-border/60 bg-gradient-to-r from-sky-500/10 via-transparent to-transparent px-4 py-4 sm:px-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary" aria-hidden="true">
                  <Package className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-foreground">Productos</h3>
                  <p className="text-sm text-muted-foreground">Selecciona los productos para tu venta</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Button type="button" variant="outline" size="sm" onClick={onAgregarEjemplo} disabled={loadingPrecios} className="border-emerald-500/20 bg-emerald-500/10 text-emerald-800 hover:bg-emerald-500/15 dark:text-emerald-300">
                  <Plus className="mr-1 h-4 w-4" />Agregar Ejemplo
                </Button>
                <div className="text-right"><div className="text-2xl font-bold text-primary">{items.length}</div><div className="text-xs text-muted-foreground">productos agregados</div></div>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Categorías de productos">
                {categorias.map((categoria) => (
                  <button key={categoria} type="button" role="tab" aria-selected={categoriaId === categoria} onClick={() => handleCategoriaChange(categoriaId === categoria ? "" : categoria)} className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${categoriaId === categoria ? "bg-primary text-primary-foreground" : "bg-muted/50 text-foreground hover:bg-muted"}`}>
                    {categoria}
                  </button>
                ))}
              </div>
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input type="search" value={busqueda} onChange={(event) => setBusqueda(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }} placeholder="Buscar productos…" aria-label="Buscar productos" className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
              </label>
              {categoriaId === "Maderas" && tiposMadera.length ? <label className="flex flex-wrap items-center gap-2 text-sm"><span className="text-muted-foreground">Tipo de madera</span><select value={filtroTipoMadera} onChange={(event) => setFiltroTipoMadera(event.target.value)} className="h-9 min-w-48 rounded-md border border-input bg-background px-2 text-sm text-foreground"><option value="">Todos los tipos</option>{tiposMadera.map((tipo) => <option key={tipo} value={tipo}>{tipo}</option>)}</select></label> : null}
              {categoriaId === "Ferretería" && subCategoriasFerreteria.length ? <label className="flex flex-wrap items-center gap-2 text-sm"><span className="text-muted-foreground">Subcategoría</span><select value={filtroSubCategoria} onChange={(event) => setFiltroSubCategoria(event.target.value)} className="h-9 min-w-48 rounded-md border border-input bg-background px-2 text-sm text-foreground"><option value="">Todas</option>{subCategoriasFerreteria.map((subCategoria) => <option key={subCategoria} value={subCategoria}>{subCategoria}</option>)}</select></label> : null}
            </div>
          </div>

          {!productos.length ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">No hay productos disponibles en el catálogo.</p>
          ) : !categoriaId && !busquedaDiferida.trim() ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">Elegí una categoría o buscá un producto para comenzar.</p>
          ) : !productosFiltrados.length ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">No se encontraron productos. Probá con otros filtros o términos de búsqueda.</p>
          ) : (
            <div className="relative">
              {isPending ? <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/70 text-sm text-muted-foreground" role="status">Actualizando resultados…</div> : null}
              <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 xl:grid-cols-4">
                {productosPaginados.map((producto) => {
                  const productoOrigen = (item) => (item.originalId || item.id) === producto.id;
                  const itemsOrigen = items.filter(productoOrigen);
                  const itemAgregado = itemsOrigen[0];
                  const esCombo = isComboProduct(producto);
                  const preview = getProductoCatalogoPreview(producto) || {};
                  const itemPreview = preview.item || {};
                  const categoriaProducto = itemPreview.categoria || producto.categoria;
                  const unidadProducto = itemPreview.unidad || producto.unidadMedida || producto.unidad || producto.unidadVenta || (esCombo ? "Combo" : null);
                  const tipoMadera = producto.tipoMadera || (producto.categoria === "Maderas" ? producto.tipo : null);
                  const subcategoria = producto.subCategoria || producto.subcategoria;
                  const tipoProducto = subcategoria || (
                    producto.categoria === "Maderas" && producto.tipo && producto.tipo !== tipoMadera
                      ? producto.tipo
                      : null
                  );
                  const codigoDistinto = producto.codigo && normalizeProductLabel(producto.codigo) !== normalizeProductLabel(producto.nombre);
                  const stock = Number(producto.stock);
                  const stockConocido = producto.stock !== undefined && producto.stock !== null && producto.stock !== "" && Number.isFinite(stock);
                  const stockMinimo = Number(producto.stockMinimo ?? producto.min);
                  const stockAgotado = stockConocido && stock <= 0;
                  const stockBajo = stockConocido && !stockAgotado && stockMinimo > 0 && stock <= stockMinimo;
                  const stockEstado = !stockConocido
                    ? "No informado"
                    : stockAgotado
                      ? "Sin stock"
                      : stockBajo
                        ? "Stock bajo"
                        : "Disponible";
                  const cantidadActual = itemsOrigen.reduce((total, item) => total + Math.max(1, Math.ceil(Number(item.cantidad) || 1)), 0);
                  const subtotalSeleccionado = computeTotals(itemsOrigen).total;
                  const importeSeleccionado = Math.round(subtotalSeleccionado * (pagoEnEfectivo ? 0.9 : 1));
                  const precioUnitarioDeLinea = (item) => {
                    const cantidad = Math.max(1, Number(item.cantidad) || 1);
                    const precio = Number(item.precio) || 0;
                    return item.categoria === "Maderas" && ["M2", "ML"].includes(item.unidad)
                      ? precio / cantidad
                      : precio;
                  };
                  const precioUnitario = itemsOrigen.length
                    ? itemsOrigen.reduce((total, item) => total + precioUnitarioDeLinea(item) * Math.max(1, Number(item.cantidad) || 1), 0) / cantidadActual
                    : precioUnitarioDeLinea(itemPreview);
                  const unidadPrecio = unidadProducto || "unidad";
                  const metadata = [
                    { label: "Categoría", value: categoriaProducto, Icon: Tag },
                    { label: "Unidad", value: unidadProducto, Icon: Ruler, valueClassName: "uppercase" },
                    { label: "Madera", value: tipoMadera, Icon: Trees },
                    { label: "Tipo", value: tipoProducto, Icon: Layers },
                  ].filter((dato) => dato.value);
                  const stockStateClasses = !stockConocido
                    ? { text: "text-muted-foreground", background: "bg-muted", dot: "bg-muted-foreground" }
                    : stockAgotado
                      ? { text: "text-destructive", background: "bg-destructive/10", dot: "bg-destructive" }
                      : stockBajo
                        ? { text: "text-warning", background: "bg-warning/10", dot: "bg-warning" }
                        : { text: "text-success", background: "bg-success/10", dot: "bg-success" };

                  return (
                    <article
                      key={producto.id}
                      className={`flex h-full flex-col rounded-2xl border bg-card p-3 shadow-sm transition-colors sm:p-4 ${
                        itemAgregado
                          ? "border-success/40 bg-success/[0.03]"
                          : "border-border/70 hover:border-border hover:shadow-md"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-3 sm:gap-4">
                          <span
                            className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl sm:h-12 sm:w-12 ${
                              itemAgregado ? "bg-success/10 text-success" : "bg-muted text-foreground"
                            }`}
                            aria-hidden="true"
                          >
                            {producto.categoria === "Maderas" ? <Layers className="h-7 w-7" /> : <Package className="h-7 w-7" />}
                          </span>
                          <div className="min-w-0 pt-0.5">
                            <h4 className="line-clamp-2 text-sm font-semibold leading-snug text-foreground sm:text-base">
                              {producto.nombre || "Producto sin nombre"}
                            </h4>
                            {codigoDistinto ? (
                              <p className="mt-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                Código: {producto.codigo}
                              </p>
                            ) : null}
                          </div>
                        </div>
                        {itemAgregado ? (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-success/10 px-2.5 py-1.5 text-xs font-semibold text-success">
                            <Check className="h-3.5 w-3.5" aria-hidden="true" />
                            Agregado
                          </span>
                        ) : null}
                      </div>
                      <dl className="mt-3 grid grid-cols-2 gap-y-2 border-y border-border/60 py-3">
                        {metadata.map(({ label, value, Icon, valueClassName }, index) => (
                          <ProductMetadata
                            key={label}
                            label={label}
                            value={value}
                            Icon={Icon}
                            valueClassName={valueClassName}
                            className={index % 2 === 1 ? "border-l border-border/60 pl-3 sm:pl-4" : ""}
                          />
                        ))}
                      </dl>
                      {producto.detalle || esCombo ? (
                        <div className="mt-2 space-y-1">
                          {producto.detalle ? (
                            <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">{producto.detalle}</p>
                          ) : null}
                          {esCombo ? (
                            <p className="text-xs text-muted-foreground">
                              {normalizeComboComponents(producto.componentesCombo).length} componentes
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                      <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-border/60 pb-3 sm:gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-muted-foreground">Precio unitario</p>
                          <p className="mt-1 flex flex-wrap items-baseline gap-x-2">
                            <span className="text-lg font-bold leading-none tracking-tight tabular-nums text-foreground sm:text-xl">
                              ${formatearNumeroArgentino(precioUnitario)}
                            </span>
                            <span className="text-sm font-medium text-muted-foreground">/ {unidadPrecio}</span>
                          </p>
                        </div>
                        <div className="flex min-w-[5.5rem] items-center gap-2 border-l border-border/60 pl-2 sm:min-w-[6rem] sm:gap-2 sm:pl-3">
                          <div className="min-w-0">
                            <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                              <PackageOpen className="h-4 w-4 shrink-0 text-foreground" aria-hidden="true" />
                              Stock
                            </p>
                            <span
                              className={`mt-1 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-sm font-semibold tabular-nums ${stockStateClasses.background} ${stockStateClasses.text}`}
                              aria-label={`${stockEstado}: ${stockConocido ? formatearNumeroArgentino(stock) : "sin dato"}`}
                              title={stockEstado}
                            >
                              <span className={`h-2 w-2 shrink-0 rounded-full ${stockStateClasses.dot}`} aria-hidden="true" />
                              {stockConocido ? formatearNumeroArgentino(stock) : "—"}
                            </span>
                          </div>
                        </div>
                      </div>
                      {itemAgregado ? (
                        <div aria-live="polite" className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-success/10 px-3 py-2">
                          <span className="text-xs font-semibold text-foreground sm:text-sm">
                            {pagoEnEfectivo ? "Total en efectivo" : "Total seleccionado"}
                          </span>
                          <span className="text-lg font-bold tracking-tight tabular-nums text-foreground sm:text-xl">
                            ${formatearNumeroArgentino(importeSeleccionado)}
                          </span>
                        </div>
                      ) : null}
                      <div className="mt-auto flex flex-wrap items-center gap-2 pt-3 sm:gap-2">
                        {itemAgregado ? (
                          <>
                            <div className="inline-flex h-10 min-w-[8.5rem] flex-1 overflow-hidden rounded-lg border border-border bg-background sm:flex-none xl:w-full">
                              <button
                                type="button"
                                aria-label={`Quitar una unidad de ${producto.nombre}`}
                                disabled={loadingPrecios}
                                onClick={() => {
                                  if (itemsOrigen.length > 1 || Number(itemAgregado.cantidad) <= 1) onQuitarProductoDesdeCatalogo(producto.id);
                                  else onDecrementarCantidad(itemAgregado.id);
                                }}
                                className="grid w-10 shrink-0 place-items-center bg-muted/70 text-xl text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                −
                              </button>
                              <span className="grid min-w-10 flex-1 place-items-center px-2 text-sm font-semibold tabular-nums text-foreground">
                                {cantidadActual}
                              </span>
                              <button
                                type="button"
                                aria-label={`Agregar una unidad de ${producto.nombre}`}
                                disabled={loadingPrecios}
                                onClick={() => onIncrementarCantidad(itemAgregado.id)}
                                className="grid w-10 shrink-0 place-items-center bg-muted/70 text-xl text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                +
                              </button>
                            </div>
                            <span className="hidden h-8 w-px bg-border sm:block xl:hidden" aria-hidden="true" />
                            <button
                              type="button"
                              disabled={loadingPrecios}
                              onClick={() => onClonarProducto(itemAgregado.id)}
                              className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-2.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none sm:px-3 sm:text-sm xl:flex-1 xl:px-2"
                            >
                              <Copy className="h-4 w-4" aria-hidden="true" />
                              Clonar
                            </button>
                            <button
                              type="button"
                              aria-label={`Eliminar ${producto.nombre} de la selección`}
                              title="Eliminar"
                              disabled={loadingPrecios}
                              onClick={() => itemsOrigen.forEach((item) => onQuitarProducto(item.id))}
                              className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-border bg-background text-foreground transition-colors hover:bg-destructive hover:text-destructive-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 xl:ml-auto"
                            >
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            aria-label={`Agregar ${producto.nombre}`}
                            title={preview.error ? "Completar datos del producto" : "Agregar producto"}
                            disabled={loadingPrecios || preview.error}
                            onClick={() => onAgregarProductoCatalogo(producto)}
                            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <Plus className="h-5 w-5" aria-hidden="true" />
                            {preview.error ? "Completar datos" : "Agregar"}
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
              {totalPaginas > 1 ? <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 px-4 py-3"><span className="text-xs text-muted-foreground">Página {paginaActual} de {totalPaginas} · {totalProductos} productos</span><div className="flex items-center gap-2"><Button type="button" variant="outline" size="sm" disabled={paginaActual <= 1 || isPending} onClick={() => cambiarPagina(paginaActual - 1)}>Anterior</Button><Button type="button" variant="outline" size="sm" disabled={paginaActual >= totalPaginas || isPending} onClick={() => cambiarPagina(paginaActual + 1)}>Siguiente</Button></div></div> : null}
            </div>
          )}
        </div>
      </section>

      {items.length || showWhenEmpty ? <section className="mt-4 overflow-hidden rounded-xl border border-default-200 bg-card/60 p-0 shadow-lg ring-1 ring-default-200/60">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-gradient-to-r from-default-50 to-default-100 px-4 py-3">
        <h3 className="text-base font-semibold text-default-900 md:text-lg">Productos Seleccionados</h3>
        <div className="flex flex-wrap items-center justify-end gap-3">
          {onPagoEnEfectivoChange ? (
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id={idPagoEnEfectivo}
                checked={Boolean(pagoEnEfectivo)}
                onChange={(event) => onPagoEnEfectivoChange(event.target.checked)}
                className="h-4 w-4 rounded border-default-300 bg-background text-blue-600 focus:ring-2 focus:ring-blue-500"
                disabled={loadingPrecios}
              />
              <label htmlFor={idPagoEnEfectivo} className="text-sm font-medium text-default-700">
                {textoPagoEnEfectivo}
              </label>
            </div>
          ) : null}
          {headerAction}
          <span className="inline-flex items-center gap-1 rounded-full border border-default-300 bg-default-200/60 px-2.5 py-1 text-[11px] font-medium text-default-700">
            {items.length} producto{items.length === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      {items.length ? (
        <div className="overflow-x-auto">
          <table className="min-w-full text-[15px]">
            <thead className="sticky top-0 z-10 bg-default-50/80 backdrop-blur supports-[backdrop-filter]:bg-default-50/60">
              <tr className="border-b border-default-200">
                <th className="h-12 px-4 text-left text-xs font-semibold uppercase tracking-wide text-default-600">Categoría</th>
                <th className="h-12 px-4 text-left text-xs font-semibold uppercase tracking-wide text-default-600">Producto</th>
                <th className="h-12 px-4 text-center text-xs font-semibold uppercase tracking-wide text-default-600">Medida</th>
                <th className="h-12 px-4 text-center text-xs font-semibold uppercase tracking-wide text-default-600">Cepillado</th>
                <th className="h-12 px-4 text-center text-xs font-semibold uppercase tracking-wide text-default-600">Canteado</th>
                <th className="h-12 px-4 text-right text-xs font-semibold uppercase tracking-wide text-default-600">Precio unit.</th>
                <th className="h-12 px-4 text-center text-xs font-semibold uppercase tracking-wide text-default-600">Desc.</th>
                <th className="h-12 px-4 text-right text-xs font-semibold uppercase tracking-wide text-default-600">Precio en efectivo</th>
                <th className="h-12 px-4 text-right text-xs font-semibold uppercase tracking-wide text-default-600">Subtotal</th>
                <th className="h-12 px-4 text-center text-xs font-semibold uppercase tracking-wide text-default-600">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-default-200">
              {items.map((p, idx) => {
                const cantidad = Math.max(1, Math.ceil(Number(p.cantidad) || 1));
                const precioBase = computeLineBase(p);
                const descuentoRaw = Number(p.descuento) || 0;
                const descuento = clampDiscount
                  ? Math.min(100, Math.max(0, descuentoRaw))
                  : descuentoRaw;
                const precioConDescuento = precioBase * (1 - descuento / 100);
                const precioEfectivo = Math.round(pagoEnEfectivo ? precioConDescuento * 0.9 : precioConDescuento);

                return (
                  <React.Fragment key={p.id ?? idx}>
                    <tr className="border-b border-default-300 transition-colors data-[state=selected]:bg-muted">
                      <td className="p-4 align-middle text-sm text-default-600">
                        {p.categoria ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-default-200 bg-default-100 px-2 py-1 text-[11px] font-medium text-default-700">
                            {p.categoria}
                          </span>
                        ) : null}
                      </td>
                      <td className="p-4 align-top text-sm text-default-600">
                        <div className="font-semibold text-default-900">
                          {p.esEditable ? (
                            <input
                              type="text"
                              value={p.nombre || ""}
                              onChange={(event) => onNombreChange(p.id, event.target.value)}
                              className="w-full rounded border border-border/60 bg-background px-2 py-1 text-base font-bold uppercase text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                              disabled={loadingPrecios}
                              placeholder="Nombre del producto"
                            />
                          ) : (
                            <div>
                              {p.nombre || p.descripcion || "Producto sin nombre"}
                              {p.categoria === "Maderas" && p.tipoMadera ? (
                                <span className="font-semibold text-default-900">{" - "}{String(p.tipoMadera).toUpperCase()}</span>
                              ) : null}
                            </div>
                          )}
                        </div>
                        {p.detalle ? <div className="mt-1 text-xs text-default-500">{p.detalle}</div> : null}
                        {p.categoria === "Ferretería" && (p.subCategoria || p.subcategoria) ? (
                          <div className="mt-1 text-xs font-medium text-blue-600 dark:text-blue-400">{p.subCategoria || p.subcategoria}</div>
                        ) : null}
                        {p.categoria === "Maderas" && p.esEditable && onUnidadMaderaChange ? (
                          <div className="mt-2 flex items-center gap-2">
                            <label htmlFor={`unidad-${idPagoEnEfectivo}-${p.id}`} className="text-xs font-semibold text-default-600">Unidad</label>
                            <select
                              id={`unidad-${idPagoEnEfectivo}-${p.id}`}
                              value={p.unidad || "Pie"}
                              onChange={(event) => onUnidadMaderaChange(p.id, event.target.value)}
                              className="h-8 rounded-md border border-default-300 bg-background px-2 text-xs text-foreground focus:border-primary focus:ring-1 focus:ring-primary"
                              disabled={loadingPrecios}
                            >
                              <option value="Unidad">Unidad</option>
                              <option value="M2">M2</option>
                              <option value="ML">ML</option>
                              <option value="Pie">Fórmula pie</option>
                            </select>
                          </div>
                        ) : null}
                        {p.categoria === "Maderas" && p.unidad !== "Unidad" ? (
                          <div className="mt-2 flex flex-wrap items-start gap-3">
                            <div className="inline-block w-fit rounded-md border border-orange-500/20 bg-orange-500/10 p-1.5 align-top">
                              <div className="mb-1 flex items-center gap-1.5">
                                <span className="rounded-full bg-orange-500/10 px-1.5 py-0.5 text-sm font-semibold text-orange-700 dark:text-orange-300">Dimensiones</span>
                                <span className="rounded bg-orange-500/10 px-1.5 py-0.5 text-sm font-semibold text-orange-700 dark:text-orange-300">
                                  {p.unidad === "M2"
                                    ? `Total ${((Number(p.alto) || 0) * (Number(p.largo) || 0) * cantidad).toFixed(2)} m²`
                                    : `Volumen ${((Number(p.alto) || 0) * (Number(p.ancho) || 0) * (Number(p.largo) || 0)).toFixed(2)} m³`}
                                </span>
                              </div>
                              <div className="flex flex-wrap items-end gap-2">
                                <DimensionInput label="Alto" value={p.alto} disabled={loadingPrecios} onChange={(value) => onDimensionChange(p.id, "alto", value, p)} />
                                {p.unidad !== "M2" ? <DimensionInput label="Ancho" value={p.ancho} disabled={loadingPrecios} onChange={(value) => onDimensionChange(p.id, "ancho", value, p)} /> : null}
                                <DimensionInput label="Largo" value={p.largo} disabled={loadingPrecios} onChange={(value) => onDimensionChange(p.id, "largo", value, p)} />
                              </div>
                            </div>
                            <div className="inline-block w-fit rounded-md border border-emerald-500/20 bg-emerald-500/10 p-1.5 align-top">
                              <div className="mb-1 text-sm font-semibold text-green-700 dark:text-green-400">Precio</div>
                              <label className="mb-0.5 block text-[11px] font-semibold text-green-700 dark:text-green-300">Valor</label>
                              <div className="relative">
                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm font-medium text-green-600 dark:text-green-400">$</span>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={p.precioPorPie === "" ? "" : p.precioPorPie || ""}
                                  onChange={(event) => onPrecioPorPieChange(p.id, event.target.value, p)}
                                  className="h-8 w-[88px] rounded-md border border-green-300 bg-background pl-5 pr-2 text-sm tabular-nums text-foreground transition-colors focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-200 dark:border-green-600 dark:focus:ring-green-800"
                                  disabled={loadingPrecios}
                                  placeholder="0.00"
                                />
                              </div>
                            </div>
                          </div>
                        ) : null}
                      </td>
                      <td className="p-4 align-middle text-sm text-default-600">
                        <div className="flex items-center justify-center">
                          <QuantityMeasureControl
                            product={p}
                            cantidad={p.cantidad === "" ? "" : p.cantidad}
                            disabled={loadingPrecios}
                            onCantidadChange={(next) => onCantidadChange(p.id, next)}
                            onIncrement={() => onIncrementarCantidad(p.id)}
                            onDecrement={() => onDecrementarCantidad(p.id)}
                          />
                        </div>
                        <div className="mt-1 text-center text-[11px] tabular-nums text-default-500">
                          <MedidaValue product={{ ...p, cantidad }} className="text-[11px] text-default-500" />
                        </div>
                      </td>
                      <td className="p-4 align-middle text-sm text-default-600">
                        {p.categoria === "Maderas" ? (
                          <TreatmentEditor
                            label="Cepillado"
                            checked={Boolean(p.cepilladoAplicado)}
                            value={p.unidad === "M2" ? 0 : p.cepilladoPorcentaje === "" ? "" : p.cepilladoPorcentaje ?? defaultCepilladoPorcentaje}
                            onCheckedChange={(checked) => onCepilladoChange(p.id, checked)}
                            onValueChange={(value) => onCepilladoPorcentajeChange(p.id, value)}
                            disabled={loadingPrecios || (disableMaderaTreatmentsForUnit && p.unidad === "Unidad")}
                            valueDisabled={loadingPrecios || !p.cepilladoAplicado || p.unidad === "M2" || (disableMaderaTreatmentsForUnit && p.unidad === "Unidad")}
                          />
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="p-4 align-middle text-sm text-default-600">
                        {p.categoria === "Maderas" ? (
                          <TreatmentEditor
                            label="Canteado"
                            checked={Boolean(p.calibradoAplicado)}
                            value={p.calibradoPorcentaje === "" ? "" : p.calibradoPorcentaje ?? defaultCalibradoPorcentaje}
                            onCheckedChange={(checked) => onCalibradoChange(p.id, checked)}
                            onValueChange={(value) => onCalibradoPorcentajeChange(p.id, value)}
                            disabled={loadingPrecios || (disableMaderaTreatmentsForUnit && p.unidad === "Unidad")}
                            valueDisabled={loadingPrecios || !p.calibradoAplicado || (disableMaderaTreatmentsForUnit && p.unidad === "Unidad")}
                          />
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="p-4 align-middle text-sm text-default-600">
                        {p.esEditable ? (
                          <input
                            type="number"
                            min="0"
                            step="100"
                            value={p.precio === "" ? "" : p.categoria === "Maderas" && ["M2", "ML"].includes(p.unidad) ? (Number(p.precio) || 0) / (Number(p.cantidad) || 1) : p.precio ?? 0}
                            onChange={(event) => onPrecioChange(p.id, event.target.value, p)}
                            className="ml-auto block w-24 rounded-md border border-default-300 bg-background px-2 py-1 text-right text-sm font-semibold tabular-nums text-foreground focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-200"
                            disabled={loadingPrecios}
                            placeholder="0"
                          />
                        ) : (
                          <span className="block text-right font-semibold tabular-nums text-default-900">
                            ${formatearNumeroArgentino(p.categoria === "Maderas" && ["M2", "ML"].includes(p.unidad) ? (Number(p.precio) || 0) / (Number(p.cantidad) || 1) : p.precio)}
                          </span>
                        )}
                      </td>
                      <td className="p-4 align-middle text-sm text-default-600">
                        <div className="relative mx-auto w-20 md:w-24">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={p.descuento === "" ? "" : p.descuento || ""}
                            onChange={(event) => onDescuentoChange(p.id, event.target.value)}
                            className="w-full rounded-md border border-default-300 bg-background px-2 py-1 pr-6 text-center text-foreground focus:border-blue-500 focus:ring-1 focus:ring-blue-200"
                            disabled={loadingPrecios}
                          />
                          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-default-500">%</span>
                        </div>
                      </td>
                      <td className="p-4 text-right align-middle text-sm font-bold tabular-nums text-default-900">${formatearNumeroArgentino(precioEfectivo)}</td>
                      <td className="p-4 text-right align-middle text-sm font-bold tabular-nums text-default-900">${formatearNumeroArgentino(computeLineSubtotal(p))}</td>
                      <td className="p-4 text-center align-middle text-sm text-default-600">
                        <div className="flex items-center justify-center gap-2">
                          <button type="button" onClick={() => onClonarProducto(p.id)} disabled={loadingPrecios} className="cursor-pointer rounded-md bg-blue-500 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50" title="Clonar producto">Clonar</button>
                          <button type="button" aria-label={`Eliminar ${p.nombre || "producto"}`} onClick={() => onQuitarProducto(p.id)} disabled={loadingPrecios} className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-red-200 text-red-600 shadow-sm transition-all hover:border-red-600 hover:bg-red-600 hover:text-white focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50" title="Eliminar">
                            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M9 3a1 1 0 00-1 1v1H5.5a1 1 0 100 2H6v12a2 2 0 002 2h8a2 2 0 002-2V7h.5a1 1 0 100-2H16V4a1 1 0 00-1-1H9zm2 2h4v1h-4V5zm-1 5a1 1 0 112 0v7a1 1 0 11-2 0v-7zm5 0a1 1 0 112 0v7a1 1 0 11-2 0v-7z" /></svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                    {isComboProduct(p) ? <ComboComponentRows combo={p} productos={productos} colSpan={10} /> : null}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="px-4 py-10 text-center text-sm text-default-600">Todavía no agregaste productos.</div>
      )}
      {footer}
      </section> : null}
    </div>
  );
}

function normalizeProductLabel(value) {
  return String(value || "")
    .toLocaleLowerCase("es-AR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function ProductMetadata({ label, value, Icon, valueClassName = "", className = "" }) {
  return (
    <div className={`min-w-0 ${className}`}>
      <dt className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground sm:text-xs">
        {Icon ? <Icon className="h-4 w-4 shrink-0 text-foreground" aria-hidden="true" /> : null}
        <span className="truncate">{label}</span>
      </dt>
      <dd className={`mt-0.5 truncate text-sm font-semibold text-foreground ${valueClassName}`} title={String(value)}>
        {value}
      </dd>
    </div>
  );
}

function DimensionInput({ label, value, disabled, onChange }) {
  return (
    <div className="flex flex-col gap-0.5">
      <label className="text-[11px] font-semibold text-orange-700">{label}</label>
      <input
        type="number"
        min="0"
        step="0.01"
        value={value === "" ? "" : value || ""}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 w-[68px] rounded-sm border border-orange-300 bg-background px-1.5 text-sm text-foreground focus:border-orange-500 focus:ring-1 focus:ring-orange-200 dark:border-orange-600 dark:focus:ring-orange-800 sm:w-[80px]"
        disabled={disabled}
      />
    </div>
  );
}

function TreatmentEditor({ label, checked, value, onCheckedChange, onValueChange, disabled, valueDisabled }) {
  return (
    <div className="flex items-center justify-center gap-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onCheckedChange(event.target.checked)}
        className="h-4 w-4 rounded border-default-300 bg-background text-blue-600 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-600"
        disabled={disabled}
        title={`Aplicar ${label.toLowerCase()}`}
      />
      <div className="relative w-16">
        <input
          type="number"
          min="0"
          step="0.1"
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          className="w-full rounded-md border border-default-300 bg-background px-2 py-1 pr-5 text-center text-xs text-foreground focus:border-indigo-500 focus:ring-1 focus:ring-indigo-200"
          disabled={valueDisabled}
          aria-label={`Porcentaje de ${label.toLowerCase()}`}
        />
        <span className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-default-500">%</span>
      </div>
    </div>
  );
}
