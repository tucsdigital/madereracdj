import React from "react";
import { useSidebar, useThemeStore } from "@/store";
import { cn } from "@/lib/utils";
import { Icon } from "@iconify/react";
import { Search } from "lucide-react";
import { SiteLogo } from "@/components/svg";
import Link from "next/link";
import { useMediaQuery } from "@/hooks/use-media-query";

const MenuBar = ({ collapsed, setCollapsed }) => {
  return (
    <button
      className="relative group p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors duration-200 cursor-pointer"
      onClick={() => setCollapsed(!collapsed)}
    >
      <div>
        <div
          className={cn(
            "flex flex-col justify-between w-[20px] h-[16px] transform transition-all duration-300 origin-center overflow-hidden",
            {
              "-translate-x-1.5 rotate-180": collapsed,
            }
          )}
        >
          <div
            className={cn(
              "bg-card-foreground h-[2px] transform transition-all duration-300 origin-left delay-150",
              {
                "rotate-[42deg] w-[11px]": collapsed,
                "w-7": !collapsed,
              }
            )}
          ></div>
          <div
            className={cn(
              "bg-card-foreground h-[2px] w-7 rounded transform transition-all duration-300",
              {
                "translate-x-10": collapsed,
              }
            )}
          ></div>
          <div
            className={cn(
              "bg-card-foreground h-[2px] transform transition-all duration-300 origin-left delay-150",
              {
                "-rotate-[43deg] w-[11px]": collapsed,
                "w-7": !collapsed,
              }
            )}
          ></div>
        </div>
      </div>
    </button>
  );
};

const VerticalHeader = ({ handleOpenSearch }) => {
  const { collapsed, setCollapsed, subMenu, sidebarType } = useSidebar();
  const { layout } = useThemeStore();
  const isDesktop = useMediaQuery("(min-width: 1280px)");
  const isMobile = useMediaQuery("(min-width: 768px)");
  let LogoContent = null;
  let menuBarContent = null;
  // let searchButtonContent = null;

  // Debug logs
  console.log("VerticalHeader Debug:", {
    layout,
    sidebarType,
    isDesktop,
    isMobile,
    subMenu,
    collapsed
  });

  const MainLogo = (
    <Link href="/dashboard" className=" text-primary ">
      <SiteLogo className="h-7 w-7" />
    </Link>
  );
  // const SearchButton = (
  //   <div>
  //     <button
  //       className=" inline-flex  gap-2 items-center text-default-600 text-sm cursor-pointer"
  //       onClick={handleOpenSearch}
  //     >
  //       <span>
  //         <Search className=" h-4 w-4" />
  //       </span>
  //       <span className=" md:block hidden"> Search...</span>
  //     </button>
  //   </div>
  // );
  if (layout === "semibox" && !isDesktop) {
    LogoContent = MainLogo;
  }
  if (
    layout === "vertical" &&
    !isDesktop &&
    isMobile &&
    sidebarType === "module"
  ) {
    LogoContent = MainLogo;
  }
  if (layout === "vertical" && !isDesktop && sidebarType !== "module") {
    LogoContent = MainLogo;
  }

  // menu bar content condition - Simplificada para module
  if (sidebarType === "module") {
    menuBarContent = (
      <MenuBar collapsed={collapsed} setCollapsed={setCollapsed} />
    );
  } else if (isDesktop && sidebarType !== "module") {
    menuBarContent = (
      <MenuBar collapsed={collapsed} setCollapsed={setCollapsed} />
    );
  } else if (sidebarType === "classic") {
    menuBarContent = null;
  }
  
  // Solo ocultar si hay submenu activo en desktop Y NO es module
  if (subMenu && isDesktop && sidebarType !== "module") {
    menuBarContent = null;
  }
  
  // Fallback: Si sidebarType es "module", siempre mostrar el botón
  if (sidebarType === "module" && !menuBarContent) {
    menuBarContent = (
      <MenuBar collapsed={collapsed} setCollapsed={setCollapsed} />
    );
  }
  
  console.log("MenuBar Content:", menuBarContent ? "Will show" : "Will hide");
  
  // if (sidebarType === "module" && isMobile) {
  //   searchButtonContent = SearchButton;
  // }
  // if (sidebarType === "classic" || sidebarType === "popover") {
  //   searchButtonContent = SearchButton;
  // }
  return (
    <>
      <div className="flex items-center md:gap-6 gap-3">
        {LogoContent}
        {menuBarContent}
      </div>
    </>
  );
};

export default VerticalHeader;
