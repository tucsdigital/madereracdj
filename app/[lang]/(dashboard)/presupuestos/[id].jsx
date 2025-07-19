"use client";
import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { Button } from "@/components/ui/button";

const PresupuestoDetalle = () => {
  const params = useParams();
  const { id } = params;
  const [presupuesto, setPresupuesto] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPresupuesto = async () => {
      const docRef = doc(db, "presupuestos", id);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        setPresupuesto({ id: docSnap.id, ...docSnap.data() });
      }
      setLoading(false);
    };
    fetchPresupuesto();
  }, [id]);

  if (loading) return <div className="p-8">Cargando...</div>;
  if (!presupuesto) return <div className="p-8">No se encontró el presupuesto.</div>;

  return (
    <div className="max-w-3xl mx-auto p-8 bg-white rounded shadow">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Detalle de Presupuesto</h1>
        <Button onClick={() => window.print()}>Imprimir</Button>
      </div>
      <div className="mb-4">
        <b>ID:</b> {presupuesto.id}
      </div>
      <div className="mb-4">
        <b>Cliente:</b> {presupuesto.cliente?.nombre} <br />
        <b>CUIT:</b> {presupuesto.cliente?.cuit} <br />
        <b>Dirección:</b> {presupuesto.cliente?.direccion} <br />
        <b>Teléfono:</b> {presupuesto.cliente?.telefono} <br />
        <b>Email:</b> {presupuesto.cliente?.email}
      </div>
      <div className="mb-4">
        <b>Fecha de emisión:</b> {presupuesto.fecha} <br />
        <b>Validez hasta:</b> {presupuesto.vencimiento}
      </div>
      <div className="mb-4">
        <b>Observaciones:</b> {presupuesto.observaciones}
      </div>
      <div className="mb-4">
        <b>Productos:</b>
        <table className="w-full mt-2 text-sm">
          <thead>
            <tr className="bg-gray-100">
              <th className="p-2">Producto</th>
              <th>Cant.</th>
              <th>Precio</th>
              <th>Desc.</th>
              <th>Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {presupuesto.items?.map((p, idx) => (
              <tr key={idx}>
                <td className="p-2">{p.descripcion || p.nombre}</td>
                <td>{p.cantidad}</td>
                <td>${p.precio}</td>
                <td>${p.descuento || 0}</td>
                <td>${(p.precio * p.cantidad - (p.descuento || 0) * p.cantidad).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex justify-end gap-8 mt-6">
        <div> <b>Total:</b> ${presupuesto.total || "-"}</div>
      </div>
    </div>
  );
};

export default PresupuestoDetalle; 