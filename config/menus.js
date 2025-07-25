import {
  DashBoard,
  Users,
  Building,
  Settings,
} from "@/components/svg";
import { Users2, Boxes, DollarSign, Briefcase, Receipt, Truck, PiggyBank, Wallet } from "lucide-react";

export const menusConfig = {
  mainNav: [
    {
      title: "Inicio",
      icon: DashBoard,
      href: "/dashboard",
    },
    {
      title: "Ventas / Presupuestos",
      icon: Receipt,
      href: "/ventas",
    },
    {
      title: "Envíos",
      icon: Truck,
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
      icon: PiggyBank,
      href: "/gastos",
    },
    {
      title: "Obras / Proyectos",
      icon: Briefcase,
      href: "/obras-proyectos",
    },
    {
      title: "Clientes",
      icon: Users2,
      href: "/clientes",
    },
    {
      title: "Precios",
      icon: DollarSign,
      href: "/precios",
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
        icon: Receipt,
        href: "/ventas",
      },
      {
        title: "Envíos",
        icon: Truck,
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
        icon: PiggyBank,
        href: "/gastos",
      },
      {
        title: "Obras / Proyectos",
        icon: Briefcase,
        href: "/obras-proyectos",
      },
      {
        title: "Clientes",
        icon: Users2,
        href: "/clientes",
      },
      {
        title: "Precios",
        icon: DollarSign,
        href: "/precios",
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
        icon: Receipt,
        href: "/ventas",
      },
      {
        title: "Envíos",
        icon: Truck,
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
        icon: PiggyBank,
        href: "/gastos",
      },
      {
        title: "Obras / Proyectos",
        icon: Briefcase,
        href: "/obras-proyectos",
      },
      {
        title: "Clientes",
        icon: Users2,
        href: "/clientes",
      },
      {
        title: "Precios",
        icon: DollarSign,
        href: "/precios",
      },
    ],
  },
};
