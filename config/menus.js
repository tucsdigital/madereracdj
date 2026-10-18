import { menuIcons as I } from "./menu-icons";

// Una única definición para escritorio, compacto, móvil y módulos dinámicos.
export const navigationItems = [
  { id: "dashboard", title: "Dashboard", icon: I.dashboard, href: "/dashboard" },
  { id: "ventas", title: "Ventas", icon: I.ventas, href: "/ventas" },
  { id: "envios", title: "Envíos", icon: I.envios, child: [
    { id: "envios-lista", title: "Lista", icon: I.lista, href: "/envios", excludePaths: ["/envios/zonas"] },
    { id: "envios-zonas", title: "Zona de cobertura", icon: I.zonas, href: "/envios/zonas", featureFlag: "deliveryZonesEnabled" },
  ] },
  { id: "ecommerce", title: "Ecommerce", icon: I.ecommerce, child: [
    { id: "ecommerce-ventas", title: "Ecommerce", icon: I.pedidos, href: "/ecommerce" },
    { id: "tienda-web", title: "Web", icon: I.web, href: "/tienda-web" },
  ] },
  { id: "productos", title: "Productos", icon: I.productos, href: "/productos" },
  { id: "stock", title: "Stock", icon: I.stock, href: "/stock-compras" },
  { id: "gastos", title: "Gastos", icon: I.gastos, href: "/gastos" },
  { id: "dolares", title: "Dólares", icon: I.dolares, href: "/dolares" },
  { id: "proveedores", title: "Proveedores", icon: I.proveedores, href: "/proveedores" },
  { id: "obras", title: "Obras", icon: I.obras, href: "/obras" },
  { id: "documentacion", title: "Documentación", icon: I.documentacion, href: "/documentacion" },
  { id: "clientes", title: "Clientes", icon: I.clientes, href: "/clientes" },
  { id: "precios", title: "Precios", icon: I.precios, href: "/precios" },
  { id: "auditoria", title: "Auditoría", icon: I.auditoria, href: "/auditoria" },
  { id: "tickets", title: "Tickets", icon: I.tickets, href: "/tickets" },
  { id: "asistencia", title: "Asistencia", icon: I.asistencia, href: "/asistencia" },
];

export function buildMenusConfig(items) {
  return { mainNav: items, sidebarNav: { modern: items, classic: [{ isHeader: true, title: "Menú Principal" }, ...items] } };
}

export const menusConfig = buildMenusConfig(navigationItems);
