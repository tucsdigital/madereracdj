"use client";
import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Printer, Download } from "lucide-react";

const PresupuestoDetalle = () => {
  const params = useParams();
  const router = useRouter();
  const { id } = params;
  const [presupuesto, setPresupuesto] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPresupuesto = async () => {
      try {
        const docRef = doc(db, "presupuestos", id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setPresupuesto({ id: docSnap.id, ...docSnap.data() });
        } else {
          console.error("Presupuesto no encontrado");
        }
      } catch (error) {
        console.error("Error al cargar presupuesto:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchPresupuesto();
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-gray-600">Cargando presupuesto...</p>
        </div>
      </div>
    );
  }

  if (!presupuesto) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">Presupuesto no encontrado</h2>
          <p className="text-gray-600 mb-6">El presupuesto que buscas no existe o ha sido eliminado.</p>
          <Button onClick={() => router.back()}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Volver
          </Button>
        </div>
      </div>
    );
  }

  // Función para formatear fecha
  const formatDate = (dateString) => {
    if (!dateString) return "-";
    try {
      return new Date(dateString).toLocaleDateString('es-AR');
    } catch {
      return dateString;
    }
  };

  // Función para imprimir
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Presupuesto #{presupuesto.id.slice(-8)}</h1>
              <p className="text-gray-600 mt-1">
                {presupuesto.nombre || `Presupuesto ${formatDate(presupuesto.fecha)}`}
              </p>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => router.back()}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Volver
              </Button>
              <Button onClick={handlePrint}>
                <Printer className="w-4 h-4 mr-2" />
                Imprimir
              </Button>
            </div>
          </div>

          {/* Información del cliente */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="font-semibold text-lg mb-3 text-gray-900">Información del Cliente</h3>
              <div className="space-y-2 text-sm">
                <div><span className="font-medium">Nombre:</span> {presupuesto.cliente?.nombre || "-"}</div>
                <div><span className="font-medium">CUIT:</span> {presupuesto.cliente?.cuit || "-"}</div>
                <div><span className="font-medium">Dirección:</span> {presupuesto.cliente?.direccion || "-"}</div>
                <div><span className="font-medium">Teléfono:</span> {presupuesto.cliente?.telefono || "-"}</div>
                <div><span className="font-medium">Email:</span> {presupuesto.cliente?.email || "-"}</div>
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="font-semibold text-lg mb-3 text-gray-900">Información del Presupuesto</h3>
              <div className="space-y-2 text-sm">
                <div><span className="font-medium">Fecha de emisión:</span> {formatDate(presupuesto.fecha)}</div>
                <div><span className="font-medium">Fecha de vencimiento:</span> {formatDate(presupuesto.vencimiento)}</div>
                <div><span className="font-medium">Tipo:</span> {presupuesto.tipo || "Presupuesto"}</div>
                <div><span className="font-medium">Estado:</span> 
                  <span className="ml-2 px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs">
                    Activo
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Productos */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h3 className="font-semibold text-lg mb-4 text-gray-900">Productos y Servicios</h3>
          
          {/* Usar productos si existe, sino usar items */}
          {(presupuesto.productos || presupuesto.items) && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-100 border-b">
                    <th className="text-left p-3 font-medium">Producto</th>
                    <th className="text-center p-3 font-medium">Cantidad</th>
                    <th className="text-center p-3 font-medium">Unidad</th>
                    <th className="text-right p-3 font-medium">Precio Unit.</th>
                    <th className="text-right p-3 font-medium">Descuento</th>
                    <th className="text-right p-3 font-medium">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {(presupuesto.productos || presupuesto.items || []).map((producto, idx) => (
                    <tr key={idx} className="border-b hover:bg-gray-50">
                      <td className="p-3 font-medium">
                        {producto.descripcion || producto.nombre || "Producto sin nombre"}
                      </td>
                      <td className="p-3 text-center">{producto.cantidad || 0}</td>
                      <td className="p-3 text-center">{producto.unidad || "-"}</td>
                      <td className="p-3 text-right">${(producto.precio || 0).toFixed(2)}</td>
                      <td className="p-3 text-right">${(producto.descuento || 0).toFixed(2)}</td>
                      <td className="p-3 text-right font-medium">
                        ${((producto.precio || 0) * (producto.cantidad || 0) - (producto.descuento || 0) * (producto.cantidad || 0)).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Totales */}
          <div className="mt-6 flex justify-end">
            <div className="bg-gray-50 rounded-lg p-4 min-w-[300px]">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span>${(presupuesto.subtotal || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Descuento total:</span>
                  <span>${(presupuesto.descuentoTotal || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>IVA (21%):</span>
                  <span>${(presupuesto.iva || 0).toFixed(2)}</span>
                </div>
                <div className="border-t pt-2 flex justify-between font-bold text-lg">
                  <span>Total:</span>
                  <span className="text-primary">${(presupuesto.total || 0).toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Observaciones */}
        {presupuesto.observaciones && (
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
            <h3 className="font-semibold text-lg mb-3 text-gray-900">Observaciones</h3>
            <p className="text-gray-700 whitespace-pre-wrap">{presupuesto.observaciones}</p>
          </div>
        )}

        {/* Información adicional */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h3 className="font-semibold text-lg mb-3 text-gray-900">Información Adicional</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div><span className="font-medium">ID del documento:</span> {presupuesto.id}</div>
            <div><span className="font-medium">Fecha de creación:</span> {formatDate(presupuesto.fechaCreacion)}</div>
            <div><span className="font-medium">Cliente ID:</span> {presupuesto.clienteId || "-"}</div>
            <div><span className="font-medium">Cantidad de productos:</span> {(presupuesto.productos || presupuesto.items || []).length}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PresupuestoDetalle; 