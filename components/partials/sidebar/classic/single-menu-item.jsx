"use client";
import React from "react";

import { Badge } from "@/components/ui/badge";
import { cn, isLocationMatch, translate, getDynamicPath, useLocalizedPath } from "@/lib/utils";
import { usePathname } from "next/navigation";
import Link from "next/link";

const SingleMenuItem = ({ item, collapsed, hovered, trans }) => {
  const { badge, href, title } = item;

  const pathname = usePathname();
  const locationName = getDynamicPath(pathname);
  const localize = useLocalizedPath();
  const active = isLocationMatch(href, locationName);

  // Verificación de seguridad para el icono
  const IconComponent = item.icon;
  const hasValidIcon = IconComponent && typeof IconComponent === 'function';

  return (
    <Link href={localize(href)} aria-current={active ? "page" : undefined} className="block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
      <div
        className={cn(
          "flex min-h-10 items-center gap-3 rounded-md px-3 py-2 text-[13px] font-medium capitalize text-default-700 transition-colors hover:bg-muted/70 hover:text-foreground",
          {
            "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground": active,
          }
        )}
      >
        <span className="inline-flex shrink-0 items-center justify-center">
          {hasValidIcon ? (
            <IconComponent className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />
          ) : (
            <div className="h-[18px] w-[18px] rounded bg-muted" aria-hidden="true" />
          )}
        </span>
        <span className="text-box min-w-0 flex-1 truncate">{translate(title, trans)}</span>
        {badge && <Badge className=" rounded">{item.badge}</Badge>}
      </div>
    </Link>
  );
};

export default SingleMenuItem;
