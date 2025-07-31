"use client";
import React from "react";
import { Input } from "@/components/ui/input";

export function DataTableToolbar({ table }) {
  const [globalFilter, setGlobalFilter] = React.useState("");

  React.useEffect(() => {
    // Configurar la función de filtrado global para buscar solo en N° Pedido y Cliente
    table.setGlobalFilter((row, columnId, filterValue) => {
      const searchValue = filterValue.toLowerCase();
      
      // Buscar en el campo numeroPedido
      const numeroPedido = row.getValue("numeroPedido")?.toString().toLowerCase() || "";
      if (numeroPedido.includes(searchValue)) return true;
      
      // Buscar en el campo cliente (nombre del cliente)
      const cliente = row.getValue("cliente")?.toString().toLowerCase() || "";
      if (cliente.includes(searchValue)) return true;
      
      return false;
    });
  }, [globalFilter, table]);

  return (
    <div className="flex justify-center w-full py-2">
      <Input
        placeholder="Buscar por N° Pedido o Cliente..."
        value={globalFilter}
        onChange={e => setGlobalFilter(e.target.value)}
        className="w-full max-w-lg text-base px-4 py-2 rounded border border-gray-300 dark:border-gray-600 focus:border-primary focus:ring-2 focus:ring-primary/30 transition"
      />
    </div>
  );
}
