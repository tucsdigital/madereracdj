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
      title: "Sección dashboard",
      icon: DashBoard,
      href: "/dashboard",
    },
    {
      title: "Ventas / Presupuestos",
      icon: Graph,
      href: "/ventas",
    },
    {
      title: "Envíos",
      icon: Settings,
      href: "/envios",
    },
    {
      title: "Productos",
      icon: Building,
      href: "/productos",
    },
    {
      title: "Stock y Compras",
      icon: Users,
      href: "/stock-compras",
    },
    {
      title: "Gastos",
      icon: Graph,
      href: "/gastos",
    },
    {
      title: "Obras / Proyectos",
      icon: Settings,
      href: "/obras-proyectos",
    },
    {
      title: "Clientes",
      icon: Users,
      href: "/clientes",
    },
  ],
  sidebarNav: {
    modern: [
      {
        title: "Sección dashboard",
        icon: DashBoard,
        href: "/dashboard",
      },
      {
        title: "Ventas / Presupuestos",
        icon: Graph,
        href: "/ventas",
      },
      {
        title: "Envíos",
        icon: Settings,
        href: "/envios",
      },
      {
        title: "Productos",
        icon: Building,
        href: "/productos",
      },
      {
        title: "Stock y Compras",
        icon: Users,
        href: "/stock-compras",
      },
      {
        title: "Gastos",
        icon: Graph,
        href: "/gastos",
      },
      {
        title: "Obras / Proyectos",
        icon: Settings,
        href: "/obras-proyectos",
      },
      {
        title: "Clientes",
        icon: Users,
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
        icon: DashBoard,
        href: "/dashboard",
      },
      {
        title: "Ventas / Presupuestos",
        icon: Graph,
        href: "/ventas",
      },
      {
        title: "Envíos",
        icon: Settings,
        href: "/envios",
      },
      {
        title: "Productos",
        icon: Building,
        href: "/productos",
      },
      {
        title: "Stock y Compras",
        icon: Users,
        href: "/stock-compras",
      },
      {
        title: "Gastos",
        icon: Graph,
        href: "/gastos",
      },
      {
        title: "Obras / Proyectos",
        icon: Settings,
        href: "/obras-proyectos",
      },
      {
        title: "Clientes",
        icon: Users,
        href: "/clientes",
      },
    ],
  },
};
