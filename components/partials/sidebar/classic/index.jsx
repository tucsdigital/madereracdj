"use client";
import React, { useState } from "react";
import { cn, isLocationMatch, getDynamicPath } from "@/lib/utils";
import { useSidebar, useThemeStore } from "@/store";
import SidebarLogo from "../common/logo";
import { useNavigationMenus } from "@/hooks/use-navigation-menus";
import MenuLabel from "../common/menu-label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { usePathname } from "next/navigation";
import SingleMenuItem from "./single-menu-item";
import SubMenuHandler from "./sub-menu-handler";
import NestedSubMenu from "../common/nested-menus";

const ClassicSidebar = ({ trans }) => {
  const { sidebarBg } = useSidebar();
  const [activeSubmenu, setActiveSubmenu] = useState(null);
  const [activeMultiMenu, setMultiMenu] = useState(null);
  const menus = useNavigationMenus();
  const { collapsed, setCollapsed } = useSidebar();
  const { isRtl } = useThemeStore();
  const [hovered, setHovered] = useState(false);

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

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        "fixed left-0 top-0 z-[60] h-dvh border-r border-border/70 bg-background transition-[width,box-shadow] duration-200 hover:w-[226px]! hover:shadow-lg",
        {
          "w-[226px]": !collapsed,
          "w-[72px] shadow-sm": collapsed,
        }
      )}
    >
      {sidebarBg !== "none" && (
        <div
          className=" absolute left-0 top-0   z-[-1] w-full h-full bg-cover bg-center opacity-[0.07]"
          style={{ backgroundImage: `url(${sidebarBg})` }}
        ></div>
      )}

      <SidebarLogo hovered={hovered} />

      <ScrollArea className={cn("sidebar-menu h-[calc(100%-84px)]", { "px-3": !collapsed || hovered, "px-2": collapsed && !hovered })}>
        <ul
          dir={isRtl ? "rtl" : "ltr"}
          className={cn("space-y-1.5 py-3", {
            "space-y-1.5 text-center": collapsed,
            "text-start": collapsed && hovered,
          })}
        >
          {menus.map((item, i) => (
            <li key={`menu_key_${i}`}>
              {/* single menu  */}

              {!item.child && !item.isHeader && (
                <SingleMenuItem
                  item={item}
                  collapsed={collapsed}
                  hovered={hovered}
                  trans={trans}
                />
              )}

              {/* menu label */}
              {item.isHeader && !item.child && (!collapsed || hovered) && (
                <MenuLabel item={item} trans={trans} />
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
                    hovered={hovered}
                    trans={trans}
                  />

                  {(!collapsed || hovered) && (
                    <NestedSubMenu
                      toggleMultiMenu={toggleMultiMenu}
                      activeMultiMenu={activeMultiMenu}
                      activeSubmenu={activeSubmenu}
                      item={item}
                      index={i}
                      collapsed={collapsed}
                      hovered={hovered}
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

export default ClassicSidebar;
