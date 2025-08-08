"use client";
import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Edit, Printer, Download } from "lucide-react";
import { db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { Icon } from "@iconify/react";

const ObraDetallePage = () => {
  const params = useParams();
  const router = useRouter();
  const { id, lang } = params;
  const [obra, setObra] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchObra = async () => {
      try {
        setLoading(true);
        const obraDoc = await getDoc(doc(db, "obras", id));
        
        if (obraDoc.exists()) {
          setObra({ id: obraDoc.id, ...obraDoc.data() });
        } else {
          setError("Obra no encontrada");
        }
      } catch (err) {
        console.error("Error al cargar la obra:", err);
        setError("Error al cargar la obra");
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      fetchObra();
    }
  }, [id]);

  const formatearNumeroArgentino = (numero) => {
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: "ARS",
    }).format(numero);
  };

  const formatearFecha = (fecha) => {
    if (!fecha) return "No especificada";
    return new Date(fecha).toLocaleDateString("es-AR", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const getEstadoColor = (estado) => {
    switch (estado) {
      case "pendiente":
        return "bg-yellow-100 text-yellow-800";
      case "en_progreso":
        return "bg-blue-100 text-blue-800";
      case "completada":
        return "bg-green-100 text-green-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getTipoColor = (tipo) => {
    switch (tipo) {
      case "obra":
        return "bg-orange-100 text-orange-800";
      case "presupuesto":
        return "bg-purple-100 text-purple-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-gray-600">Cargando obra...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-red-600 text-lg mb-4">{error}</p>
          <Button onClick={() => router.back()}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Volver
          </Button>
        </div>
      </div>
    );
  }

  if (!obra) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-gray-600 text-lg mb-4">Obra no encontrada</p>
          <Button onClick={() => router.back()}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Volver
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            onClick={() => router.back()}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              {obra.tipo === "presupuesto" ? "Presupuesto" : "Obra"} #{obra.numeroPedido}
            </h1>
            <p className="text-gray-600">
              Cliente: {obra.cliente?.nombre}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <Edit className="w-4 h-4 mr-2" />
            Editar
          </Button>
          <Button variant="outline">
            <Printer className="w-4 h-4 mr-2" />
            Imprimir
          </Button>
          <Button variant="outline">
            <Download className="w-4 h-4 mr-2" />
            Exportar
          </Button>
        </div>
      </div>

      {/* Información principal */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Información del cliente */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Icon icon="heroicons:user" className="w-5 h-5" />
              Información del Cliente
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-sm text-gray-500">Nombre</p>
              <p className="font-medium">{obra.cliente?.nombre}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Email</p>
              <p className="font-medium">{obra.cliente?.email || "No especificado"}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Teléfono</p>
              <p className="font-medium">{obra.cliente?.telefono}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Dirección</p>
              <p className="font-medium">{obra.cliente?.direccion}</p>
            </div>
            {obra.cliente?.cuit && (
              <div>
                <p className="text-sm text-gray-500">CUIT</p>
                <p className="font-medium">{obra.cliente.cuit}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Información de la obra */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Icon icon="heroicons:document-text" className="w-5 h-5" />
              Información de la {obra.tipo === "presupuesto" ? "Presupuesto" : "Obra"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Badge className={getTipoColor(obra.tipo)}>
                {obra.tipo === "presupuesto" ? "Presupuesto" : "Obra"}
              </Badge>
              <Badge className={getEstadoColor(obra.estado)}>
                {obra.estado === "en_progreso" ? "En Progreso" : obra.estado}
              </Badge>
            </div>
            <div>
              <p className="text-sm text-gray-500">Número de Pedido</p>
              <p className="font-medium">{obra.numeroPedido}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Fecha</p>
              <p className="font-medium">{formatearFecha(obra.fecha)}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Fecha de Creación</p>
              <p className="font-medium">{formatearFecha(obra.fechaCreacion)}</p>
            </div>
            {obra.vendedor && (
              <div>
                <p className="text-sm text-gray-500">Vendedor</p>
                <p className="font-medium">{obra.vendedor}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Resumen financiero */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Icon icon="heroicons:currency-dollar" className="w-5 h-5" />
              Resumen Financiero
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-sm text-gray-500">Subtotal</p>
              <p className="font-medium">{formatearNumeroArgentino(obra.subtotal || 0)}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Descuento Total</p>
              <p className="font-medium">{formatearNumeroArgentino(obra.descuentoTotal || 0)}</p>
            </div>
            {obra.costoEnvio && obra.costoEnvio > 0 && (
              <div>
                <p className="text-sm text-gray-500">Costo de Envío</p>
                <p className="font-medium">{formatearNumeroArgentino(obra.costoEnvio)}</p>
              </div>
            )}
            <Separator />
            <div>
              <p className="text-sm text-gray-500">Total</p>
              <p className="font-bold text-lg">{formatearNumeroArgentino(obra.total || 0)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Productos */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Icon icon="heroicons:cube" className="w-5 h-5" />
            Productos ({obra.productos?.length || 0})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">Producto</th>
                  <th className="text-left py-2">Cantidad</th>
                  <th className="text-left py-2">Precio Unitario</th>
                  <th className="text-left py-2">Descuento</th>
                  <th className="text-left py-2">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {obra.productos?.map((producto, index) => (
                  <tr key={index} className="border-b">
                    <td className="py-2">
                      <div>
                        <p className="font-medium">{producto.nombre}</p>
                        {producto.categoria === "Maderas" && (
                          <p className="text-sm text-gray-500">
                            {producto.alto} x {producto.ancho} x {producto.largo} cm
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="py-2">{producto.cantidad} {producto.unidad}</td>
                    <td className="py-2">{formatearNumeroArgentino(producto.precio)}</td>
                    <td className="py-2">{producto.descuento || 0}%</td>
                    <td className="py-2">
                      {formatearNumeroArgentino(
                        (producto.precio * producto.cantidad) * (1 - (producto.descuento || 0) / 100)
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Información de envío si existe */}
      {obra.tipoEnvio && obra.tipoEnvio !== "retiro_local" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Icon icon="heroicons:truck" className="w-5 h-5" />
              Información de Envío
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-sm text-gray-500">Tipo de Envío</p>
              <p className="font-medium">{obra.tipoEnvio}</p>
            </div>
            {obra.direccionEnvio && (
              <div>
                <p className="text-sm text-gray-500">Dirección de Envío</p>
                <p className="font-medium">{obra.direccionEnvio}</p>
              </div>
            )}
            {obra.localidadEnvio && (
              <div>
                <p className="text-sm text-gray-500">Localidad</p>
                <p className="font-medium">{obra.localidadEnvio}</p>
              </div>
            )}
            {obra.transportista && (
              <div>
                <p className="text-sm text-gray-500">Transportista</p>
                <p className="font-medium">{obra.transportista}</p>
              </div>
            )}
            {obra.fechaEntrega && (
              <div>
                <p className="text-sm text-gray-500">Fecha de Entrega</p>
                <p className="font-medium">{formatearFecha(obra.fechaEntrega)}</p>
              </div>
            )}
            {obra.rangoHorario && (
              <div>
                <p className="text-sm text-gray-500">Rango Horario</p>
                <p className="font-medium">{obra.rangoHorario}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ObraDetallePage;
