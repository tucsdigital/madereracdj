import React from "react";

import { Badge } from "@/components/ui/badge";
import { cn, isLocationMatch, getDynamicPath, useLocalizedPath } from "@/lib/utils";
import { usePathname } from "next/navigation";
import Link from "next/link";
const SingleMenuItem = ({ item, collapsed }) => {
  const { badge, href, title } = item;
  const pathname = usePathname();
  const locationName = getDynamicPath(pathname);
  const localize = useLocalizedPath();
  const active = isLocationMatch(href, locationName);
  return (
    <Link href={localize(href)} aria-current={active ? "page" : undefined} className="block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
      <>
        {collapsed ? (
          <div>
            <span
              className={cn(
                "relative mx-auto inline-flex h-10 w-10 flex-col items-center justify-center rounded-md transition-colors",
                {
                  "bg-primary text-primary-foreground": active,
                  "text-default-600 hover:bg-muted hover:text-foreground": !active,
                }
              )}
            >
              <item.icon className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />
            </span>
          </div>
        ) : (
          <div
            className={cn(
              "flex min-h-10 items-center gap-3 rounded-md px-3 py-2 text-[13px] font-medium capitalize text-default-700 transition-colors hover:bg-muted/70 hover:text-foreground",
              {
                "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground": active,
              }
            )}
          >
            <span className="grow-0">
              <item.icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.8} aria-hidden="true" />
            </span>
            <div className="text-box grow">{title}</div>
            {badge && <Badge className=" rounded">{item.badge}</Badge>}
          </div>
        )}
      </>
    </Link>
  );
};

export default SingleMenuItem;
