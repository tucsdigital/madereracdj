"use client";
import * as NavigationMenu from "@radix-ui/react-navigation-menu";
import { CaretDown } from "@phosphor-icons/react/dist/ssr/CaretDown";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useNavigationMenus } from "@/hooks/use-navigation-menus";
import { cn, translate, useLocalizedPath } from "@/lib/utils";
import { isMenuActive } from "@/lib/menu-location";

export default function MainMenu({ trans }) {
  const menus = useNavigationMenus("main");
  const localize = useLocalizedPath();
  const pathname = usePathname();
  const itemClass = "flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-medium outline-none hover:bg-default-100 focus-visible:ring-2 focus-visible:ring-primary";
  return <NavigationMenu.Root aria-label="Menú Principal">
    <NavigationMenu.List className="flex flex-wrap gap-1">
      {menus.map((item) => <NavigationMenu.Item key={item.id} value={item.id} className="relative">
        {item.child ? <>
          <NavigationMenu.Trigger className={cn(itemClass, "group", isMenuActive(item, pathname) && "text-primary")}>
            <item.icon className="h-5 w-5" /><span>{translate(item.title, trans)}</span><CaretDown aria-hidden weight="light" className="h-4 w-4 transition-transform group-data-[state=open]:rotate-180" />
          </NavigationMenu.Trigger>
          <NavigationMenu.Content className="absolute left-0 top-full z-50 w-64 rounded-xl border border-border bg-popover p-2 shadow-lg">
            {item.child.map((child) => <NavigationMenu.Link key={child.id} asChild active={isMenuActive(child, pathname)}><Link href={localize(child.href)} className={cn(itemClass, isMenuActive(child, pathname) && "text-primary")}><child.icon className="h-5 w-5" />{translate(child.title, trans)}</Link></NavigationMenu.Link>)}
          </NavigationMenu.Content>
        </> : <NavigationMenu.Link asChild active={isMenuActive(item, pathname)}><Link href={localize(item.href)} className={cn(itemClass, isMenuActive(item, pathname) && "text-primary")}><item.icon className="h-5 w-5" />{translate(item.title, trans)}</Link></NavigationMenu.Link>}
      </NavigationMenu.Item>)}
    </NavigationMenu.List>
  </NavigationMenu.Root>;
}
