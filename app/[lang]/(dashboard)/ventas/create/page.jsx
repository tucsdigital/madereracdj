"use client";
import React from "react";
import dynamic from "next/dynamic";
import { useRouter, useParams } from "next/navigation";
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

export default function CreateVentaPage() {
  const router = useRouter();
  const params = useParams();
  const { lang } = params;
  const { user } = useAuth();
  const idempotencyKeyRef = React.useRef(
    (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`)
  );

  const handleSubmit = async (formData) => {
    if (!user || typeof user.getIdToken !== "function") {
      throw new Error("No hay usuario autenticado");
    }
    const idToken = await user.getIdToken();
    const resp = await fetch("/api/erp/ventas", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${idToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        venta: { ...formData, idempotencyKey: idempotencyKeyRef.current },
        origen: "ui_ventas_create",
      }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data?.ok) {
      throw new Error(data?.error || "Error al crear la venta");
    }
    router.push(`/${lang}/ventas/${data.ventaId}`);
  };

  return (
    <div className="py-6">
      <FormularioVentaPresupuesto tipo="venta" onClose={() => {}} onSubmit={handleSubmit} />
    </div>
  );
}
