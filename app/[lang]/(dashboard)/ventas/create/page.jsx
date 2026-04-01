"use client";
import React, { useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, useParams } from "next/navigation";
import { addDoc, collection, doc, getDoc, increment, serverTimestamp, updateDoc, writeBatch, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/provider/auth.provider";

const FormularioVentaPresupuesto = dynamic(
  () => import("@/components/ventas/FormularioVentaPresupuesto").then((m) => ({ default: m.FormularioVentaPresupuesto })),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center min-h-[400px] rounded-2xl bg-default-100/50 animate-pulse" aria-hidden />
    ),
  }
);

const getNextVentaNumber = async () => {
  const snap = await getDocs(collection(db, "ventas"));
  let maxNum = 0;
  snap.docs.forEach((docSnap) => {
    const data = docSnap.data();
    if (data.numeroPedido && data.numeroPedido.startsWith("VENTA-")) {
      const num = parseInt(data.numeroPedido.replace("VENTA-", ""), 10);
      if (!isNaN(num) && num > maxNum) maxNum = num;
    }
  });
  return `VENTA-${String(maxNum + 1).padStart(5, "0")}`;
};

export default function CreateVentaPage() {
  const router = useRouter();
  const params = useParams();
  const { lang } = params;
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (formData) => {
    setLoading(true);
    try {
      const numeroPedido = await getNextVentaNumber();
      const venta = {
        ...formData,
        numeroPedido,
        fechaCreacion: new Date().toISOString(),
        vendedor: user?.email || "Usuario no identificado",
        tipo: "venta",
      };
      const cleanVenta = JSON.parse(
        JSON.stringify(venta, (k, v) => (v === undefined ? undefined : v))
      );
      const docRef = await addDoc(collection(db, "ventas"), cleanVenta);

      // Descontar stock y registrar movimientos (batch)
      const batch = writeBatch(db);
      const porProductoId = new Map();
      for (const prod of cleanVenta.productos) {
        const productoId = String(prod?.originalId || prod?.id || "").trim();
        if (!productoId) continue;
        const cantidad = Math.max(0, Math.ceil(Number(prod?.cantidad) || 0));
        if (cantidad === 0) continue;
        const prev = porProductoId.get(productoId);
        porProductoId.set(productoId, {
          productoId,
          cantidad: (prev?.cantidad || 0) + cantidad,
          nombre: prev?.nombre || prod?.nombre || "",
        });
      }

      for (const entry of porProductoId.values()) {
        const productoRef = doc(db, "productos", entry.productoId);
        const productoSnap = await getDoc(productoRef);
        if (!productoSnap.exists()) continue;
        batch.update(productoRef, { stock: increment(-entry.cantidad) });
        const movRef = doc(collection(db, "movimientos"));
        batch.set(movRef, {
          productoId: entry.productoId,
          tipo: "salida",
          cantidad: entry.cantidad,
          usuario: user?.email || "Sistema",
          fecha: serverTimestamp(),
          referencia: "venta",
          referenciaId: docRef.id,
          observaciones: "Salida por venta",
          productoNombre: entry.nombre,
        });
      }
      await batch.commit();

      // Crear envío si corresponde
      if (cleanVenta.tipoEnvio && cleanVenta.tipoEnvio !== "retiro_local") {
        const envio = {
          ventaId: docRef.id,
          clienteId: cleanVenta.clienteId,
          cliente: cleanVenta.cliente,
          fechaCreacion: new Date().toISOString(),
          fechaEntrega: cleanVenta.fechaEntrega,
          estado: "pendiente",
          vendedor: user?.email || "Usuario no identificado",
          direccionEnvio: cleanVenta.direccionEnvio,
          localidadEnvio: cleanVenta.localidadEnvio,
          tipoEnvio: cleanVenta.tipoEnvio,
          costoEnvio: parseFloat(cleanVenta.costoEnvio) || 0,
          numeroFactura: cleanVenta.numeroFactura,
          numeroRemito: cleanVenta.numeroRemito,
          numeroPedido: cleanVenta.numeroPedido,
          totalVenta: cleanVenta.total,
          productos: cleanVenta.productos,
          cantidadTotal: cleanVenta.productos.reduce((acc, p) => acc + p.cantidad, 0),
          historialEstados: [
            {
              estado: "pendiente",
              fecha: new Date().toISOString(),
              comentario: "Envío creado automáticamente desde la venta",
            },
          ],
          observaciones: cleanVenta.observaciones,
          instruccionesEspeciales: "",
          fechaActualizacion: new Date().toISOString(),
          creadoPor: "sistema",
        };
        const cleanEnvio = Object.fromEntries(
          Object.entries(envio).filter(([_, v]) => v !== undefined)
        );
        await addDoc(collection(db, "envios"), cleanEnvio);
      }

      router.push(`/${lang}/ventas/${docRef.id}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="py-6">
      <FormularioVentaPresupuesto tipo="venta" onClose={() => {}} onSubmit={handleSubmit} />
    </div>
  );
}

