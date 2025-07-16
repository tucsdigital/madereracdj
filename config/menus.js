import {
  DashBoard,
  Users,
  Building,
  Graph,
  Settings,
} from "@/components/svg";
import { Users2, Boxes } from "lucide-react";

export const menusConfig = {
  mainNav: [
    {
      title: "Inicio",
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
      icon: Boxes,
      href: "/stock-compras",
    },
    {
      title: "Gastos",
      icon: Graph,
      href: "/gastos",
    },
    {
      title: "Obras",
      icon: Settings,
      href: "/obras-proyectos",
    },
    {
      title: "Clientes",
      icon: Users2,
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
        icon: Boxes,
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
        icon: Users2,
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
        icon: Boxes,
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
        icon: Users2,
        href: "/clientes",
      },
    ],
  },
};
