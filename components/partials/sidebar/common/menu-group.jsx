"use client";
import { useState } from "react";
import { usePathname } from "next/navigation";
import * as Popover from "@radix-ui/react-popover";
import { ChevronRight } from "lucide-react";
import { cn, translate } from "@/lib/utils";
import { isMenuActive } from "@/lib/menu-location";
import SubMenuItem from "./sub-menu-item";

export default function MenuGroup({ item, index, activeSubmenu, toggleSubmenu, collapsed, hovered, trans }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const active = isMenuActive(item, pathname);
  const compact = collapsed && !hovered;
  const expanded = activeSubmenu === index;
  if (compact) return <Popover.Root open={open} onOpenChange={setOpen}>
    <Popover.Trigger asChild>
      <button type="button" aria-label={translate(item.title, trans)} className={cn("inline-flex h-10 w-10 items-center justify-center rounded-md outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary", active && "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground")}>
        <item.icon className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />
      </button>
    </Popover.Trigger>
    <Popover.Portal>
      <Popover.Content side="right" sideOffset={8} collisionPadding={12} className="z-[10000] w-64 rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-lg">
        <p className="px-2 pb-2 text-xs font-semibold text-default-500">{translate(item.title, trans)}</p>
        <ul>{item.child.map((child) => <li key={child.id || child.href} onClick={() => setOpen(false)} className="px-2"><SubMenuItem subItem={child} trans={trans} /></li>)}</ul>
      </Popover.Content>
    </Popover.Portal>
  </Popover.Root>;

  return <button type="button" aria-expanded={expanded} onClick={() => toggleSubmenu(index)} className={cn("flex min-h-10 w-full items-center gap-3 rounded-md px-3 py-2 text-left text-[13px] font-medium text-default-700 outline-none transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary", expanded && !active && "bg-muted text-foreground", active && "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground")}>
    <item.icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.8} aria-hidden="true" />
    <span className="flex-1">{translate(item.title, trans)}</span>
    <ChevronRight aria-hidden="true" className={cn("h-4 w-4 shrink-0 transition-transform motion-reduce:transition-none", expanded && "rotate-90")} />
  </button>;
}
