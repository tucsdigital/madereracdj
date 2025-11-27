import {
  DashBoard,
} from "@/components/svg";
import { Building } from "@/components/svg";
import { Users2, Boxes, DollarSign, Briefcase, Receipt, Truck, PiggyBank, ClipboardList, Building2 } from "lucide-react";

// Mapa de iconos por módulo
const iconMap = {
  dashboard: DashBoard,
  ventas: Receipt,
  envios: Truck,
  productos: Building,
  stock: Boxes,
  gastos: PiggyBank,
  proveedores: Building2,
  obras: Briefcase,
  clientes: Users2,
  precios: DollarSign,
  auditoria: ClipboardList,
};

// Configuración base de módulos (títulos y rutas)
const moduleConfig = {
  dashboard: { title: "Dashboard", href: "/dashboard" },
  ventas: { title: "Ventas / Presupuestos", href: "/ventas" },
  envios: { title: "Envíos", href: "/envios" },
  productos: { title: "Productos", href: "/productos" },
  stock: { title: "Stock", href: "/stock-compras" },
  gastos: { title: "Gastos", href: "/gastos" },
  proveedores: { title: "Proveedores", href: "/proveedores" },
  obras: { title: "Obras", href: "/obras" },
  clientes: { title: "Clientes", href: "/clientes" },
  precios: { title: "Precios", href: "/precios" },
  auditoria: { title: "Auditoría", href: "/auditoria" },
};

/**
 * Genera la configuración de menús basada en los módulos habilitados
 * @param {Array} enabledModules - Lista de módulos habilitados desde Firestore
 * @returns {Object} Configuración de menús
 */
export function generateMenusConfig(enabledModules = []) {
  // Si no hay módulos habilitados o no se proporcionan, usar todos por defecto
  const modulesToShow = enabledModules.length > 0 
    ? enabledModules 
    : Object.keys(moduleConfig);

  // Generar menús basados en módulos habilitados
  const mainNav = modulesToShow
    .filter(module => moduleConfig[module.id || module])
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .map(module => {
      const moduleId = module.id || module;
      const config = moduleConfig[moduleId];
      const Icon = iconMap[moduleId] || DashBoard;
      
      return {
        title: config?.title || module.name || moduleId,
        icon: Icon,
        href: config?.href || module.route || `/${moduleId}`,
        id: moduleId,
      };
    });

  // Sidebar modern usa la misma estructura
  const modernNav = [...mainNav];

  // Sidebar classic tiene un header
  const classicNav = [
    {
      isHeader: true,
      title: "Menú Principal",
    },
    ...mainNav,
  ];

  return {
    mainNav,
    sidebarNav: {
      modern: modernNav,
      classic: classicNav,
    },
  };
}

/**
 * Hook personalizado para obtener menús dinámicos
 * Se debe usar en componentes del lado del cliente
 */
export function useDynamicMenus(enabledModules) {
  return generateMenusConfig(enabledModules);
}

