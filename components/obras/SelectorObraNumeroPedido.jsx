"use client";
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Search, X, ClipboardList } from "lucide-react";
import { db } from "@/lib/firebase";
import { collection, getDocs } from "firebase/firestore";

let obrasCache = null;
let obrasCacheTs = null;
const CACHE_MS = 5 * 60 * 1000;

export default function SelectorObraNumeroPedido({ open, onClose, obraActual = null, onObraSeleccionada }) {
  const [obras, setObras] = useState(obrasCache || []);
  const [loading, setLoading] = useState(false);
  const [busqueda, setBusqueda] = useState("");

  useEffect(() => {
    if (!open) return;
    setBusqueda("");
    const now = Date.now();
    const cacheValido = obrasCache && obrasCacheTs && now - obrasCacheTs < CACHE_MS;
    if (cacheValido) {
      setObras(obrasCache);
    } else {
      cargarObras();
    }
  }, [open]);

  const cargarObras = useCallback(async () => {
    try {
      setLoading(true);
      const snap = await getDocs(collection(db, "obras"));
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      obrasCache = data;
      obrasCacheTs = Date.now();
      setObras(data);
    } catch (e) {
      console.error("Error al cargar obras:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  const obrasFiltradas = useMemo(() => {
    if (!busqueda.trim()) return obras;
    const q = busqueda.toLowerCase();
    return obras.filter((o) => {
      const num = String(o.numeroPedido || o.numero || "").toLowerCase();
      const nombre = String(o.nombre || "").toLowerCase();
      const clienteNombre = String(o.cliente?.nombre || "").toLowerCase();
      return num.includes(q) || nombre.includes(q) || clienteNombre.includes(q);
    });
  }, [obras, busqueda]);

  const seleccionar = useCallback(
    (obra) => {
      if (onObraSeleccionada) {
        const obraCompleta = { id: obra.id, ...obra };
        onObraSeleccionada(obraCompleta);
      }
      onClose();
    },
    [onObraSeleccionada, onClose]
  );

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="w-[95vw] max-w-3xl max-h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="border-b pb-4 px-6 pt-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center shadow-lg">
              <ClipboardList className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <DialogTitle className="text-xl font-bold text-gray-900">
                {obraActual ? "Cambiar Obra" : "Seleccionar Obra por N°"}
              </DialogTitle>
              <DialogDescription className="text-sm text-gray-600 mt-1">
                Busca por N°, nombre de obra o cliente
              </DialogDescription>
            </div>
            <Button variant="outline" size="icon" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col gap-4 px-6 py-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <Input
              type="text"
              placeholder="Ej: 2024-00123"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="pl-11 h-11 text-base"
              autoFocus
            />
          </div>

          <div className="flex-1 overflow-y-auto border border-gray-200 rounded-lg bg-white">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-16">
                <Loader2 className="w-8 h-8 animate-spin text-emerald-600 mb-3" />
                <span className="text-gray-600 font-medium">Cargando obras...</span>
              </div>
            ) : obrasFiltradas.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center px-6">
                <p className="text-gray-700 font-semibold text-lg mb-2">Sin resultados</p>
                <p className="text-sm text-gray-500">Verifica el N° de pedido o intenta con otro término</p>
              </div>
            ) : (
              <ul className="divide-y">
                {obrasFiltradas.map((o) => (
                  <li key={o.id} className="px-4 py-3 hover:bg-gray-50 cursor-pointer" onClick={() => seleccionar(o)}>
                    <div className="flex items-center justify-between">
                      <div className="font-medium text-gray-900">{o.numeroPedido || o.numero || o.id}</div>
                      <Button size="sm" variant="outline">Seleccionar</Button>
                    </div>
                    <div className="text-sm text-gray-700">
                      {o.nombre || "Sin nombre"}
                    </div>
                    <div className="text-xs text-gray-500">
                      Cliente: {o.cliente?.nombre || "-"}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
