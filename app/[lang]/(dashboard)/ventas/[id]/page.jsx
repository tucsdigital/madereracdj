"use client";
import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Printer, Download } from "lucide-react";

const VentaDetalle = () => {
  const params = useParams();
  const router = useRouter();
  const { id, lang } = params;
  const [venta, setVenta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchVenta = async () => {
      try {
        console.log("=== DEBUG VENTA ===");
        console.log("Params completos:", params);
        console.log("ID extraído:", id);
        console.log("Lang extraído:", lang);
        console.log("URL actual:", window.location.href);
        
        if (!id) {
          console.error("No se encontró ID en los parámetros");
          setError("No se proporcionó ID de venta");
          setLoading(false);
          return;
        }
        
        const docRef = doc(db, "ventas", id);
        console.log("Referencia del documento:", docRef);
        
        const docSnap = await getDoc(docRef);
        console.log("Documento existe:", docSnap.exists());
        console.log("Datos del documento:", docSnap.data());
        
        if (docSnap.exists()) {
          const ventaData = { id: docSnap.id, ...docSnap.data() };
          console.log("Venta cargada exitosamente:", ventaData);
          setVenta(ventaData);
        } else {
          console.error("Venta no encontrada en Firebase");
          setError("La venta no existe en la base de datos");
        }
      } catch (error) {
        console.error("Error al cargar venta:", error);
        setError(`Error al cargar la venta: ${error.message}`);
      } finally {
        setLoading(false);
      }
    };
    
    fetchVenta();
  }, [id, lang, params]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-gray-600">Cargando venta...</p>
          <p className="text-sm text-gray-500 mt-2">ID: {id}</p>
          <p className="text-sm text-gray-500">Lang: {lang}</p>
        </div>
      </div>
    );
  }

  if (error || !venta) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center max-w-md">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">Venta no encontrada</h2>
          <p className="text-gray-600 mb-4">
            {error || "La venta que buscas no existe o ha sido eliminada."}
          </p>
          <div className="bg-gray-100 rounded-lg p-4 mb-6 text-left">
            <p className="text-sm text-gray-700">
              <strong>ID buscado:</strong> {id}
            </p>
            <p className="text-sm text-gray-700">
              <strong>Lang:</strong> {lang}
            </p>
            <p className="text-sm text-gray-700">
              <strong>URL:</strong> {window.location.href}
            </p>
            <p className="text-sm text-gray-700">
              <strong>Params:</strong> {JSON.stringify(params)}
            </p>
          </div>
          <div className="flex gap-3 justify-center">
            <Button onClick={() => router.back()}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Volver
            </Button>
            <Button variant="outline" onClick={() => router.push(`/${lang}/ventas`)}>
              Ver todas las ventas
            </Button>
          </div>
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

  // Función para obtener el estado del pago
  const getEstadoPagoColor = (estado) => {
    switch (estado) {
      case 'pagado':
        return 'bg-green-100 text-green-800';
      case 'pendiente':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Venta #{venta.id.slice(-8)}</h1>
              <p className="text-gray-600 mt-1">
                {venta.nombre || `Venta ${formatDate(venta.fecha)}`}
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
                <div><span className="font-medium">Nombre:</span> {venta.cliente?.nombre || "-"}</div>
                <div><span className="font-medium">CUIT:</span> {venta.cliente?.cuit || "-"}</div>
                <div><span className="font-medium">Dirección:</span> {venta.cliente?.direccion || "-"}</div>
                <div><span className="font-medium">Teléfono:</span> {venta.cliente?.telefono || "-"}</div>
                <div><span className="font-medium">Email:</span> {venta.cliente?.email || "-"}</div>
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="font-semibold text-lg mb-3 text-gray-900">Información de la Venta</h3>
              <div className="space-y-2 text-sm">
                <div><span className="font-medium">Fecha de emisión:</span> {formatDate(venta.fecha)}</div>
                <div><span className="font-medium">Fecha de entrega:</span> {formatDate(venta.fechaEntrega)}</div>
                <div><span className="font-medium">Tipo:</span> {venta.tipo || "Venta"}</div>
                <div><span className="font-medium">Estado de pago:</span> 
                  <span className={`ml-2 px-2 py-1 rounded-full text-xs ${getEstadoPagoColor(venta.estadoPago)}`}>
                    {venta.estadoPago || "No especificado"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Información de entrega y pago */}
        {(venta.transportista || venta.remito || venta.condicionesPago || venta.metodoPago) && (
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
            <h3 className="font-semibold text-lg mb-4 text-gray-900">Información de Entrega y Pago</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <div><span className="font-medium">Transportista:</span> {venta.transportista || "-"}</div>
                <div><span className="font-medium">N° Remito/Factura:</span> {venta.remito || "-"}</div>
              </div>
              <div className="space-y-3">
                <div><span className="font-medium">Condiciones de pago:</span> {venta.condicionesPago || "-"}</div>
                <div><span className="font-medium">Método de pago:</span> {venta.metodoPago || "-"}</div>
              </div>
            </div>
          </div>
        )}

        {/* Productos */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <h3 className="font-semibold text-lg mb-4 text-gray-900">Productos y Servicios</h3>
          
          {/* Usar productos si existe, sino usar items */}
          {(venta.productos || venta.items) && (
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
                  {(venta.productos || venta.items || []).map((producto, idx) => (
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
                  <span>${(venta.subtotal || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Descuento total:</span>
                  <span>${(venta.descuentoTotal || 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span>IVA (21%):</span>
                  <span>${(venta.iva || 0).toFixed(2)}</span>
                </div>
                <div className="border-t pt-2 flex justify-between font-bold text-lg">
                  <span>Total:</span>
                  <span className="text-primary">${(venta.total || 0).toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Observaciones */}
        {venta.observaciones && (
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
            <h3 className="font-semibold text-lg mb-3 text-gray-900">Observaciones</h3>
            <p className="text-gray-700 whitespace-pre-wrap">{venta.observaciones}</p>
          </div>
        )}

        {/* Información adicional */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h3 className="font-semibold text-lg mb-3 text-gray-900">Información Adicional</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div><span className="font-medium">ID del documento:</span> {venta.id}</div>
            <div><span className="font-medium">Fecha de creación:</span> {formatDate(venta.fechaCreacion)}</div>
            <div><span className="font-medium">Cliente ID:</span> {venta.clienteId || "-"}</div>
            <div><span className="font-medium">Cantidad de productos:</span> {(venta.productos || venta.items || []).length}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VentaDetalle; 