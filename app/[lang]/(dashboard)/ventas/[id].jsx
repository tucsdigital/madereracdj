"use client";
import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { Button } from "@/components/ui/button";

const VentaDetalle = () => {
  const params = useParams();
  const { id } = params;
  const [venta, setVenta] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchVenta = async () => {
      const docRef = doc(db, "ventas", id);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        setVenta({ id: docSnap.id, ...docSnap.data() });
      }
      setLoading(false);
    };
    fetchVenta();
  }, [id]);

  if (loading) return <div className="p-8">Cargando...</div>;
  if (!venta) return <div className="p-8">No se encontró la venta.</div>;

  return (
    <div className="max-w-3xl mx-auto p-8 bg-white rounded shadow">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Detalle de Venta</h1>
        <Button onClick={() => window.print()}>Imprimir</Button>
      </div>
      <div className="mb-4">
        <b>ID:</b> {venta.id}
      </div>
      <div className="mb-4">
        <b>Cliente:</b> {venta.cliente?.nombre} <br />
        <b>CUIT:</b> {venta.cliente?.cuit} <br />
        <b>Dirección:</b> {venta.cliente?.direccion} <br />
        <b>Teléfono:</b> {venta.cliente?.telefono} <br />
        <b>Email:</b> {venta.cliente?.email}
      </div>
      <div className="mb-4">
        <b>Fecha de emisión:</b> {venta.fecha} <br />
        <b>Fecha de entrega:</b> {venta.fechaEntrega} <br />
        <b>Transportista:</b> {venta.transportista} <br />
        <b>Remito/Factura:</b> {venta.remito}
      </div>
      <div className="mb-4">
        <b>Condiciones de pago:</b> {venta.condicionesPago} <br />
        <b>Estado de pago:</b> {venta.estadoPago} <br />
        <b>Método de pago:</b> {venta.metodoPago}
      </div>
      <div className="mb-4">
        <b>Observaciones:</b> {venta.observaciones}
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
            {venta.items?.map((p, idx) => (
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
        <div> <b>Total:</b> ${venta.total || "-"}</div>
      </div>
    </div>
  );
};

export default VentaDetalle; 