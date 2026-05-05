"use client";
import React from "react";
import { useRouter, useParams } from "next/navigation";
import { db } from "@/lib/firebase";
import { useAuth } from "@/provider/auth.provider";
import { FormularioVentaPresupuesto } from "@/components/ventas/FormularioVentaPresupuesto";
import { createPresupuesto } from "@/lib/ventas";

export default function CreatePresupuestoPage() {
  const router = useRouter();
  const params = useParams();
  const { lang } = params;
  const { user } = useAuth();

  const handleSubmit = async (formData) => {
    try {
      const { id } = await createPresupuesto({ db, user, formData });
      router.push(`/${lang}/presupuestos/${id}`);
    } finally {
    }
  };

  return (
    <div className="py-6">
      <FormularioVentaPresupuesto tipo="presupuesto" onClose={() => {}} onSubmit={handleSubmit} />
    </div>
  );
}


