"use client";
import { cn } from "@/lib/utils";
import ThemeButton from "./theme-button";
import { useSidebar, useThemeStore } from "@/store";
import ProfileInfo from "./profile-info";
import VerticalHeader from "./vertical-header";
import HorizontalHeader from "./horizontal-header";
import HorizontalMenu from "./horizontal-menu";
import NotificationMessage from "./notification-message";

import { useMediaQuery } from "@/hooks/use-media-query";
import MobileMenuHandler from "./mobile-menu-handler";
import ClassicHeader from "./layout/classic-header";
import FullScreen from "./full-screen";

const NavTools = ({ isDesktop, isMobile, sidebarType, showFullscreen = true }) => {
  return (
    <div className="nav-tools flex items-center  gap-2">
      {isDesktop && showFullscreen && <FullScreen />}

      <ThemeButton />
      {/* <Inbox /> */}
      <NotificationMessage />

      <div className="ltr:pl-2 rtl:pr-2">
        <ProfileInfo />
      </div>
      {!isDesktop && sidebarType !== "module" && <MobileMenuHandler />}
    </div>
  );
};
const Header = ({ trans }) => {
  const { collapsed, sidebarType } = useSidebar();
  const { layout, navbarType } = useThemeStore();

  const isDesktop = useMediaQuery("(min-width: 1280px)");

  const isMobile = useMediaQuery("(min-width: 768px)");

  // if horizontal layout
  if (layout === "horizontal" && navbarType !== "hidden") {
    return (
      <ClassicHeader
        className={cn(" ", {
          "sticky top-0 z-50": navbarType === "sticky",
        })}
      >
        <div className="w-full bg-card/90 backdrop-blur-lg md:px-6 px-[15px] py-3 border-b border-solid border-border!">
          <div className="flex justify-between items-center h-full">
            <HorizontalHeader />
            <NavTools
              isDesktop={isDesktop}
              isMobile={isMobile}
              sidebarType={sidebarType}
            />
          </div>
        </div>
        {isDesktop && (
          <div className=" bg-card/90 backdrop-blur-lg  w-full px-6  shadow-md">
            <HorizontalMenu trans={trans} />
          </div>
        )}
      </ClassicHeader>
    );
  }
  if (layout === "semibox" && navbarType !== "hidden") {
    return (
      <ClassicHeader
        className={cn(
          "has-sticky-header xl:ltr:ml-[226px] xl:rtl:mr-[226px]",
          navbarType === "sticky" && "sticky top-0"
        )}
      >
        <div className="w-full">
          <div className="flex h-[70px] w-full items-center border-b border-border/70 bg-card/95 px-5 backdrop-blur-lg md:px-8">
            <div className="flex h-full w-full items-center justify-between gap-6">
              <VerticalHeader
                sidebarType={sidebarType}
              />
              <NavTools
                isDesktop={isDesktop}
                isMobile={isMobile}
                sidebarType={sidebarType}
                showFullscreen={false}
              />
            </div>
          </div>
        </div>
      </ClassicHeader>
    );
  }
  if (
    sidebarType !== "module" &&
    navbarType !== "floating" &&
    navbarType !== "hidden"
  ) {
    return (
      <ClassicHeader
        className={cn("", {
          "xl:ltr:ml-[226px] xl:rtl:mr-[226px]": !collapsed,
          "xl:ltr:ml-[72px] xl:rtl:mr-[72px]": collapsed,
          "sticky top-0": navbarType === "sticky",
        })}
      >
        <div className="w-full bg-card/90 backdrop-blur-lg md:px-6 px-[15px] py-3 border-b border-solid border-border!">
          <div className="flex justify-between items-center h-full">
              <VerticalHeader
                sidebarType={sidebarType}
              />
            <NavTools
              isDesktop={isDesktop}
              isMobile={isMobile}
              sidebarType={sidebarType}
            />
          </div>
        </div>
      </ClassicHeader>
    );
  }
  if (navbarType === "hidden") {
    return null;
  }
  if (navbarType === "floating") {
    return (
      <ClassicHeader
        className={cn("  has-sticky-header rounded-md sticky top-6  px-6  ", {
          "ltr:ml-[72px] rtl:mr-[72px]": collapsed,
          "xl:ltr:ml-[300px] xl:rtl:mr-[300px]  ":
            !collapsed && sidebarType === "module",
          "xl:ltr:ml-[226px] xl:rtl:mr-[226px] ":
            !collapsed && sidebarType !== "module",
        })}
      >
        <div className="w-full bg-card/90 backdrop-blur-lg md:px-6 px-[15px] py-3 rounded-md my-6 shadow-md border-border border-b">
          <div className="flex justify-between items-center h-full">
            <VerticalHeader
              sidebarType={sidebarType}
            />
            <NavTools
              isDesktop={isDesktop}
              isMobile={isMobile}
              sidebarType={sidebarType}
            />
          </div>
        </div>
      </ClassicHeader>
    );
  }

  return (
    <ClassicHeader
      className={cn("", {
        "xl:ltr:ml-[300px] xl:rtl:mr-[300px]": !collapsed,
        "xl:ltr:ml-[72px] xl:rtl:mr-[72px]": collapsed,

        "sticky top-0": navbarType === "sticky",
      })}
    >
      <div className="w-full bg-card/90 backdrop-blur-lg md:px-6 px-[15px] py-3 border-b border-solid border-border!">
        <div className="flex justify-between items-center h-full">
          <VerticalHeader
            sidebarType={sidebarType}
          />
          <NavTools
            isDesktop={isDesktop}
            isMobile={isMobile}
            sidebarType={sidebarType}
          />
        </div>
      </div>
    </ClassicHeader>
  );
};

export default Header;
