/**
 * Modelos TypeScript para el sistema de generación de PDF Remito
 */

export interface RemitoItemModel {
  nombre: string;
  cantidad: number;
  cepillado?: boolean;
  precioUnitario?: number;
  descuento?: number;
  subtotal?: number;
  categoria?: string;
  subcategoria?: string;
}

export interface RemitoClienteModel {
  nombre?: string;
  cuit?: string;
  direccion?: string;
  telefono?: string;
  email?: string;
  partido?: string;
  barrio?: string;
  localidad?: string;
}

export interface RemitoEnvioModel {
  tipoEnvio?: string;
  direccion?: string;
  localidad?: string;
  fechaEntrega?: string;
  rangoHorario?: string;
  costoEnvio?: number;
}

export interface RemitoPagoModel {
  total?: number;
  montoAbonado?: number;
  saldoPendiente?: number;
  estadoPago?: "pagado" | "parcial" | "pendiente";
  pagos?: Array<{
    fecha: string;
    metodo: string;
    monto: number;
  }>;
}

export interface RemitoTotalesModel {
  subtotal: number;
  descuentoTotal: number;
  descuentoEfectivo?: number;
  costoEnvio: number;
  total: number;
}

export interface RemitoModel {
  // Identificación
  numero: string;
  fecha: string;
  tipo: "venta" | "presupuesto";
  fechaVencimiento?: string; // Solo para presupuestos
  
  // Empresa
  empresa: {
    nombre: string;
    direccion?: string;
    telefono?: string;
    web?: string;
    logoUrl?: string;
  };
  
  // Cliente
  cliente: RemitoClienteModel;
  
  // Envío
  envio?: RemitoEnvioModel;
  
  // Productos
  items: RemitoItemModel[];
  
  // Totales
  totales: RemitoTotalesModel;
  
  // Pagos (solo para ventas)
  pagos?: RemitoPagoModel;
  
  // Observaciones
  observaciones?: string;
  
  // Forma de pago
  formaPago?: string;
  
  // Vendedor
  vendedor?: string;
}
