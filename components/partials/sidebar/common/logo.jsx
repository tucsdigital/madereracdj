import { SiteLogo } from "@/components/svg";
import { useSidebar } from "@/store";
import Link from "next/link";
import React from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useLocalizedPath } from "@/lib/utils";

const SidebarLogo = ({ hovered }) => {
  const { sidebarType, setCollapsed, collapsed } = useSidebar();
  const localize = useLocalizedPath();
  const isExpanded = !collapsed || hovered;
  return (
    <div className="flex h-[84px] items-center border-b border-border/70 px-4">
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <Link
          href={localize("/dashboard")}
          aria-label="Ir al panel principal"
          className="inline-flex shrink-0 items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          <SiteLogo
            width={672}
            height={507}
            alt="Maderas Caballero"
            className="h-9 w-10 object-contain text-default-950 dark:text-foreground"
          />
        </Link>
        {isExpanded && (
          <Link href={localize("/dashboard")} className="min-w-0 leading-tight text-default-950 dark:text-foreground">
            <span className="block truncate text-[13px] font-semibold tracking-tight">Maderas Caballero</span>
            <span className="mt-0.5 block text-[11px] font-medium text-muted-foreground">ERP</span>
          </Link>
        )}
      </div>
      {sidebarType === "classic" && isExpanded && (
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? "Expandir menú" : "Contraer menú"}
          className="ml-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
        >
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>
      )}
    </div>
  );
};

export default SidebarLogo;
