"use client";
import React, { useState } from "react";

import { cn, isLocationMatch, getDynamicPath } from "@/lib/utils";
import SidebarLogo from "../common/logo";
import { useNavigationMenus } from "@/hooks/use-navigation-menus";
import MenuLabel from "../common/menu-label";
import SingleMenuItem from "./single-menu-item";
import SubMenuHandler from "./sub-menu-handler";
import NestedSubMenu from "../common/nested-menus";
import { useSidebar, useThemeStore } from "@/store";
import { ScrollArea } from "@/components/ui/scroll-area";
import { usePathname } from "next/navigation";

const PopoverSidebar = ({ trans }) => {
  const { collapsed, sidebarBg } = useSidebar();
  const { isRtl } = useThemeStore();
  const menus = useNavigationMenus();
  const [activeSubmenu, setActiveSubmenu] = useState(null);
  const [activeMultiMenu, setMultiMenu] = useState(null);

  const toggleSubmenu = (i) => {
    if (activeSubmenu === i) {
      setActiveSubmenu(null);
    } else {
      setActiveSubmenu(i);
    }
  };

  const toggleMultiMenu = (subIndex) => {
    if (activeMultiMenu === subIndex) {
      setMultiMenu(null);
    } else {
      setMultiMenu(subIndex);
    }
  };

  const pathname = usePathname();
  const locationName = getDynamicPath(pathname);

  React.useEffect(() => {
    let subMenuIndex = null;
    let multiMenuIndex = null;
    menus?.map((item, i) => {
      if (item?.child) {
        item.child.map((childItem, j) => {
          if (isLocationMatch(childItem.href, locationName)) {
            subMenuIndex = i;
          }
          if (childItem?.multi_menu) {
            childItem.multi_menu.map((multiItem, k) => {
              if (isLocationMatch(multiItem.href, locationName)) {
                subMenuIndex = i;
                multiMenuIndex = j;
              }
            });
          }
        });
      }
    });
    setActiveSubmenu(subMenuIndex);
    setMultiMenu(multiMenuIndex);
  }, [locationName, menus]);

  // menu title

  return (
    <div
      className="fixed start-0 top-0 z-[60] isolate flex h-dvh w-[226px] flex-col overflow-hidden border-border/70 bg-background ltr:border-r rtl:border-l"
    >
      {sidebarBg !== "none" && (
        <div
          className="pointer-events-none absolute inset-0 z-0 bg-cover bg-center opacity-[0.07]"
          style={{ backgroundImage: `url(${sidebarBg})` }}
        ></div>
      )}
      <div className="relative z-10"><SidebarLogo collapsed={collapsed} /></div>
      <ScrollArea
        className={cn("sidebar-menu relative z-10 min-h-0 flex-1", {
          "px-3": !collapsed,
          "px-2": collapsed,
        })}
      >
        <ul
          dir={isRtl ? "rtl" : "ltr"}
          className={cn("space-y-1.5 py-3", {
            "text-center": collapsed,
          })}
        >
          {menus.map((item, i) => (
            <li key={`menu_key_${i}`}>
              {/* single menu  */}

              {!item.child && !item.isHeader && (
                <SingleMenuItem
                  item={item}
                  collapsed={collapsed}
                  trans={trans}
                />
              )}

              {item.isHeader && !item.child && !collapsed && (
                <MenuLabel item={item} trans={trans} className="mt-1 mb-2 px-3" />
              )}

              {/* sub menu */}
              {item.child && (
                <>
                  <SubMenuHandler
                    item={item}
                    toggleSubmenu={toggleSubmenu}
                    index={i}
                    activeSubmenu={activeSubmenu}
                    collapsed={collapsed}
                    menuTitle={item.title}
                    trans={trans}
                  />
                  {!collapsed && (
                    <NestedSubMenu
                      toggleMultiMenu={toggleMultiMenu}
                      activeMultiMenu={activeMultiMenu}
                      activeSubmenu={activeSubmenu}
                      item={item}
                      index={i}
                      collapsed={collapsed}
                      trans={trans}
                    />
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      </ScrollArea>
    </div>
  );
};

export default PopoverSidebar;
