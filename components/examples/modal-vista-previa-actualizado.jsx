"use client";
import React from "react";
import PrintDownloadButtons from "@/components/ui/print-download-buttons";

// Ejemplo del modal de vista previa actualizado
const ModalVistaPreviaActualizado = () => {
  // Datos de ejemplo para una obra
  const obraEjemplo = {
    tipo: "obra",
    numeroPedido: "OB-001",
    cliente: {
      nombre: "Juan Pérez",
      email: "juan@ejemplo.com",
      telefono: "123-456-789",
      direccion: "Av. Principal 123",
      cuit: "20-12345678-9"
    },
    estado: "en_progreso",
    nombreObra: "Construcción de Deck",
    tipoObra: "Exterior",
    prioridad: "Alta",
    responsable: "Carlos López",
    fechas: {
      inicio: "2024-01-15",
      fin: "2024-02-15"
    },
    ubicacion: {
      direccion: "Calle Secundaria 456",
      localidad: "Buenos Aires",
      provincia: "Buenos Aires"
    },
    materialesCatalogo: [
      {
        nombre: "Machimbre de Pino",
        categoria: "Maderas",
        subcategoria: "machimbre",
        precio: 1500,
        descuento: 10,
        alto: 2.5,
        largo: 3.0,
        cantidad: 10,
        unidad: "M2"
      }
    ],
    gastoObraManual: 5000
  };

  const presupuestoEjemplo = {
    subtotal: 15000,
    descuentoTotal: 1500,
    total: 13500,
    productos: [
      {
        nombre: "Machimbre de Pino",
        categoria: "Maderas",
        subCategoria: "machimbre",
        valorVenta: 1500,
        descuento: 10,
        precio: 15000,
        alto: 2.5,
        largo: 3.0,
        cantidad: 10,
        unidadMedida: "M2"
      }
    ]
  };

  const movimientosEjemplo = [
    {
      fecha: "2024-01-20",
      tipo: "pago",
      metodo: "transferencia",
      monto: 5000,
      nota: "Pago inicial"
    }
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-4">
          Ejemplo de Impresión
        </h2>
        
        <p className="text-gray-600 mb-6">
          Este ejemplo muestra los botones de impresión sin modal de vista previa.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <PrintDownloadButtons
          obra={obraEjemplo}
          presupuesto={presupuestoEjemplo}
          modoCosto="venta"
          movimientos={movimientosEjemplo}
          variant="default"
          size="sm"
        />
      </div>

      <div className="bg-gray-50 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-700 mb-4">
          Cambios Implementados:
        </h3>
        
        <div className="space-y-3 text-sm text-gray-600">
          <div className="flex items-start gap-2">
            <span className="text-green-600 font-bold">✓</span>
            <span>Se reemplazó el botón único de "Imprimir" por el componente <code className="bg-gray-200 px-2 py-1 rounded">PrintDownloadButtons</code></span>
          </div>
          
          <div className="flex items-start gap-2">
            <span className="text-green-600 font-bold">✓</span>
            <span>Ahora hay <strong>dos botones</strong>: "Imprimir" (gris) y "Descargar PDF" (verde)</span>
          </div>
          
          <div className="flex items-start gap-2">
            <span className="text-green-600 font-bold">✓</span>
            <span>El botón "Descargar PDF" genera un archivo PDF que mantiene exactamente el mismo formato visual</span>
          </div>
          
          <div className="flex items-start gap-2">
            <span className="text-green-600 font-bold">✓</span>
            <span>Se actualizó la descripción del modal para indicar que ahora se pueden hacer ambas acciones</span>
          </div>
          
          <div className="flex items-start gap-2">
            <span className="text-green-600 font-bold">✓</span>
            <span>Los botones se integran perfectamente con el diseño existente del modal</span>
          </div>
        </div>
        
        <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
          <h4 className="font-semibold text-blue-800 mb-2">Archivos Modificados:</h4>
          <ul className="text-sm text-blue-700 space-y-1">
            <li>• <code>app/[lang]/(dashboard)/obras/[id]/page.jsx</code> - Modal de obras</li>
            <li>• <code>app/[lang]/(dashboard)/obras/presupuesto/[id]/page.jsx</code> - Modal de presupuestos</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default ModalVistaPreviaActualizado;
