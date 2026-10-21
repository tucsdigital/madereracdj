export function mergeVentaClientLocation<T extends Record<string, any>>(
  venta: T,
  savedClient: Record<string, any>,
): T & { cliente: Record<string, any> };
