"use client";

import React from "react";
import { normalizeComboComponents } from "@/lib/combos";

export default function ComboComponentRows({ combo, productos = [], colSpan = 10 }) {
  if (!combo?.esCombo && combo?.tipoProducto !== "combo" && !combo?.componentesCombo?.length) {
    return null;
  }

  return normalizeComboComponents(combo.componentesCombo).map((componente) => {
    const producto = productos.find((item) => String(item.id) === String(componente.productoId));
    const stock = Number(producto?.stock);
    const requerido = (Number(componente.cantidad) || 0) * (Number(combo.cantidad) || 1);
    const sinStock = !Number.isFinite(stock) || stock <= 0;
    const stockBajo = !sinStock && stock < requerido;
    const estado = sinStock ? "Sin stock" : stockBajo ? "Stock bajo" : "Disponible";
    const estadoClase = sinStock
      ? "bg-red-100 text-red-700"
      : stockBajo
        ? "bg-amber-100 text-amber-700"
        : "bg-emerald-100 text-emerald-700";

    return (
      <tr key={`${combo.id}-componente-${componente.productoId}`} className="bg-muted/20">
        <td colSpan={2} className="p-3 pl-10 text-sm text-muted-foreground">
          <span className="mr-2 text-primary">↳</span>
          <span className="font-medium text-foreground">
            {componente.nombre || producto?.nombre || componente.productoId}
          </span>
          <span className="ml-2 text-xs">{componente.codigo || producto?.codigo || ""}</span>
        </td>
        <td className="p-3 text-center text-sm text-muted-foreground">{requerido}</td>
        <td colSpan={Math.max(1, colSpan - 6)} className="p-3 text-center text-xs text-muted-foreground">
          Componente del combo · {Number(componente.cantidad) || 0} por unidad
        </td>
        <td colSpan={2} className="p-3 text-center">
          <span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${estadoClase}`}>
            {estado} {Number.isFinite(stock) ? `(${stock})` : ""}
          </span>
        </td>
        <td className="p-3" />
      </tr>
    );
  });
}
