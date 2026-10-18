"use client";
import { cn, isLocationMatch, translate, getDynamicPath, useLocalizedPath } from "@/lib/utils";
import React from "react";

import { Badge } from "@/components/ui/badge";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { isMenuActive } from "@/lib/menu-location";
function LockLink({ href, children, subItem, trans }) {
  if (subItem.badge) {
    return (
      <span className="text-sm flex space-x-3 items-center transition-all duration-150 opacity-50  cursor-not-allowed">
        <span
          className={` h-2 w-2 rounded-full border border-default-600  inline-block flex-none`}
        ></span>
        <div className="flex-1 truncate  flex  text-default-600">
          <div className="flex-1  truncate">
            {translate(subItem.title, trans)}
          </div>
          <Badge className="leading-0 capitalize flex-none px-1 text-xs font-normal">
            {subItem.badge}
          </Badge>
        </div>
      </span>
    );
  } else {
    return <Link href={href} aria-current={subItem.active ? "page" : undefined} className="block rounded-md outline-none focus-visible:ring-2 focus-visible:ring-primary">{children}</Link>;
  }
}

const SubMenuItem = ({ subItem, trans }) => {
  const pathname = usePathname();
  const locationName = getDynamicPath(pathname);
  const localize = useLocalizedPath();
  return (
    <LockLink href={localize(subItem.href)} subItem={{ ...subItem, active: isMenuActive(subItem, pathname) }} trans={trans}>
      <div
        className={cn(
          "min-h-11 text-sm font-normal flex gap-2 items-center transition-colors rounded-md hover:text-primary",
          {
            "text-primary font-medium": isMenuActive(subItem, pathname),
            "text-default-600 dark:text-default-700": !isMenuActive(subItem, pathname),
          }
        )}
      >
        {subItem.icon && <subItem.icon className="h-4 w-4 shrink-0" />}
        <span className="flex-1">
          {translate(subItem.title, trans)}
        </span>
      </div>
    </LockLink>
  );
};

export default SubMenuItem;
