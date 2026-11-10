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
      <div className="flex min-h-[360px] items-center justify-center rounded-lg border border-slate-200 bg-white" aria-hidden><span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" /></div>
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
    <main className="mx-auto w-full max-w-[1600px] px-3 py-5 sm:px-6 sm:py-7">
      <FormularioVentaPresupuesto tipo="venta" onClose={() => {}} onSubmit={handleSubmit} />
    </main>
  );
}
