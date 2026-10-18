import { createElement } from "react";
// Imports individuales: el compilador no recorre el catálogo completo de íconos.
import { SquaresFour } from "@phosphor-icons/react/dist/ssr/SquaresFour";
import { Receipt } from "@phosphor-icons/react/dist/ssr/Receipt";
import { Truck } from "@phosphor-icons/react/dist/ssr/Truck";
import { ListBullets } from "@phosphor-icons/react/dist/ssr/ListBullets";
import { MapTrifold } from "@phosphor-icons/react/dist/ssr/MapTrifold";
import { Storefront } from "@phosphor-icons/react/dist/ssr/Storefront";
import { ShoppingCart } from "@phosphor-icons/react/dist/ssr/ShoppingCart";
import { GlobeHemisphereWest } from "@phosphor-icons/react/dist/ssr/GlobeHemisphereWest";
import { Package } from "@phosphor-icons/react/dist/ssr/Package";
import { Warehouse } from "@phosphor-icons/react/dist/ssr/Warehouse";
import { Wallet } from "@phosphor-icons/react/dist/ssr/Wallet";
import { CurrencyDollar } from "@phosphor-icons/react/dist/ssr/CurrencyDollar";
import { Factory } from "@phosphor-icons/react/dist/ssr/Factory";
import { HardHat } from "@phosphor-icons/react/dist/ssr/HardHat";
import { Files } from "@phosphor-icons/react/dist/ssr/Files";
import { UsersThree } from "@phosphor-icons/react/dist/ssr/UsersThree";
import { Tag } from "@phosphor-icons/react/dist/ssr/Tag";
import { ShieldCheck } from "@phosphor-icons/react/dist/ssr/ShieldCheck";
import { Ticket } from "@phosphor-icons/react/dist/ssr/Ticket";
import { CalendarCheck } from "@phosphor-icons/react/dist/ssr/CalendarCheck";

const light = (Icon, name) => {
  const MenuIcon = (props) => createElement(Icon, { weight: "light", "aria-hidden": true, ...props });
  MenuIcon.displayName = `MenuIcon.${name}`;
  return MenuIcon;
};

export const menuIcons = Object.fromEntries(Object.entries({
  dashboard: SquaresFour, ventas: Receipt, envios: Truck, lista: ListBullets,
  zonas: MapTrifold, ecommerce: Storefront, pedidos: ShoppingCart,
  web: GlobeHemisphereWest, productos: Package, stock: Warehouse,
  gastos: Wallet, dolares: CurrencyDollar, proveedores: Factory,
  obras: HardHat, documentacion: Files, clientes: UsersThree, precios: Tag,
  auditoria: ShieldCheck, tickets: Ticket, asistencia: CalendarCheck,
}).map(([name, Icon]) => [name, light(Icon, name)]));
