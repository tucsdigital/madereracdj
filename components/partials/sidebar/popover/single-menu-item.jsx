"use client";
import React from "react";

import { Badge } from "@/components/ui/badge";
import { cn, isLocationMatch, translate, getDynamicPath, useLocalizedPath } from "@/lib/utils";

import * as Tooltip from "@radix-ui/react-tooltip";
import { usePathname } from "next/navigation";
import Link from "next/link";
const SingleMenuItem = ({ item, collapsed, trans }) => {
  const { badge, href, title } = item;

  const pathname = usePathname();
  const locationName = getDynamicPath(pathname);
  const localize = useLocalizedPath();
  const active = isLocationMatch(href, locationName);
  return (
    <Link href={localize(href)} aria-current={active ? "page" : undefined} className="block rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60">
      <>
        {collapsed ? (
          <div>
            <Tooltip.Provider>
              <Tooltip.Root>
                <Tooltip.Trigger asChild>
                  <span
                    className={cn(
                      "h-12 w-12 mx-auto rounded-md  transition-all duration-300 inline-flex flex-col items-center justify-center  relative  ",
                      {
                        "bg-primary text-primary-foreground data-[state=delayed-open]:bg-primary/90 data-[state=delayed-open]:text-primary-foreground":
                          active,
                        "text-default-600 data-[state=delayed-open]:bg-muted data-[state=delayed-open]:text-foreground":
                          !active,
                      }
                    )}
                  >
                    <item.icon className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />
                  </span>
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Content
                    side="right"
                    className="bg-primary text-primary-foreground data-[state=delayed-open]:data-[side=top]:animate-slideDownAndFade data-[state=delayed-open]:data-[side=right]:animate-slideLeftAndFade data-[state=delayed-open]:data-[side=left]:animate-slideRightAndFade data-[state=delayed-open]:data-[side=bottom]:animate-slideUpAndFade select-none rounded-[4px] px-[15px] py-[10px] text-[15px] leading-none shadow-sm will-change-[transform,opacity]"
                    sideOffset={5}
                  >
                    {translate(title, trans)}
                    <Tooltip.Arrow className="fill-primary" />
                  </Tooltip.Content>
                </Tooltip.Portal>
              </Tooltip.Root>
            </Tooltip.Provider>
          </div>
        ) : (
          <div
            className={cn(
              "flex gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium capitalize text-default-700 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              {
                "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground": active,
              }
            )}
          >
            <span className="grow-0">
              <item.icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.8} aria-hidden="true" />
            </span>
            <div className="text-box grow ">{translate(title, trans)}</div>
            {badge && <Badge className=" rounded">{item.badge}</Badge>}
          </div>
        )}
      </>
    </Link>
  );
};

export default SingleMenuItem;
