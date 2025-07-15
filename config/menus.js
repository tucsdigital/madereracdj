import {
  DashBoard,
  Users,
  Building,
  Graph,
  Settings,
} from "@/components/svg";

export const menusConfig = {
  mainNav: [
    {
      title: "Inicio",
      icon: DashBoard,
      href: "/dashboard",
    },
    {
      title: "Leads",
      icon: Users,
      href: "/leads",
    },
    {
      title: "Vendedores",
      icon: Building,
      href: "/vendedores",
    },
    {
      title: "Métricas",
      icon: Graph,
      href: "/metricas",
    },
    {
      title: "Configuración",
      icon: Settings,
      href: "/configuracion",
    },
  ],
  sidebarNav: {
    modern: [
      {
        title: "Sección dashboard",
        href: "/dashboard",
      },
      {
        title: "Ventas / Presupuestos",
        href: "/ventas",
      },
      {
        title: "Envíos",
        href: "/envios",
      },
      {
        title: "Productos",
        href: "/productos",
      },
      {
        title: "Stock y Compras",
        href: "/stock-compras",
      },
      {
        title: "Gastos",
        href: "/gastos",
      },
      {
        title: "Obras / Proyectos",
        href: "/obras-proyectos",
      },
      {
        title: "Clientes",
        href: "/clientes",
      },
    ],
    classic: [
      {
        isHeader: true,
        title: "Menú Principal",
      },
      {
        title: "Sección dashboard",
        href: "/dashboard",
      },
      {
        title: "Ventas / Presupuestos",
        href: "/ventas",
      },
      {
        title: "Envíos",
        href: "/envios",
      },
      {
        title: "Productos",
        href: "/productos",
      },
      {
        title: "Stock y Compras",
        href: "/stock-compras",
      },
      {
        title: "Gastos",
        href: "/gastos",
      },
      {
        title: "Obras / Proyectos",
        href: "/obras-proyectos",
      },
      {
        title: "Clientes",
        href: "/clientes",
      },
    ],
  },
};
