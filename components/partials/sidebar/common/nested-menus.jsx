"use client";
import React, { useState } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import MultiMenuHandler from "./multi-menu-handler";
import MultiNestedMenu from "./multi-nested-menu";
import SubMenuItem from "./sub-menu-item";
import { usePathname } from "next/navigation";
import { isLocationMatch, cn, getDynamicPath } from "@/lib/utils";
import { isMenuActive } from "@/lib/menu-location";

const NestedSubMenu = ({
  activeSubmenu,
  item,
  index,
  activeMultiMenu,
  toggleMultiMenu,
  title,
  trans,
}) => {
  const pathname = usePathname();
  const locationName = getDynamicPath(pathname);
  return (
    <Collapsible open={activeSubmenu === index}>
      <CollapsibleContent className="CollapsibleContent">
        <ul className="sub-menu relative before:absolute before:left-4 before:top-0 before:h-full before:w-px before:bg-primary/10">
          {item.child?.map((subItem, j) => (
            <li
              className={cn(
                "block pl-8 relative before:absolute before:top-0 before:left-4 before:w-px",
                {
                  "before:bg-primary first:before:h-[calc(100%-16px)]  before:h-full":
                    isMenuActive(subItem, locationName),
                  " ": activeSubmenu === index,
                }
              )}
              key={`sub_menu_${j}`}
            >
              {subItem?.multi_menu ? (
                <div>
                  <MultiMenuHandler
                    subItem={subItem}
                    subIndex={j}
                    activeMultiMenu={activeMultiMenu}
                    toggleMultiMenu={toggleMultiMenu}
                    trans={trans}
                  />
                  <MultiNestedMenu
                    subItem={subItem}
                    subIndex={j}
                    activeMultiMenu={activeMultiMenu}
                    trans={trans}
                  />
                </div>
              ) : (
                <SubMenuItem subItem={subItem} subIndex={j} trans={trans} />
              )}
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
};

export default NestedSubMenu;
