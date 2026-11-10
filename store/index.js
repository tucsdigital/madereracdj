import { create } from "zustand";
import { siteConfig } from "@/config/site";
import { persist, createJSONStorage } from "zustand/middleware";
export const useThemeStore = create(
  persist(
    (set) => ({
      theme: siteConfig.theme,
      setTheme: (theme) => set({ theme }),
      radius: siteConfig.radius,
      setRadius: (value) => set({ radius: value }),
      layout: "semibox",
      setLayout: () => {
        set({ layout: "semibox" });
        useSidebar.setState({ sidebarType: "popover", collapsed: false });
      },
      navbarType: "sticky",
      setNavbarType: () => set({ navbarType: "sticky" }),
      footerType: siteConfig.footerType,
      setFooterType: (value) => set({ footerType: value }),
      isRtl: false,
      setRtl: (value) => set({ isRtl: value }),
    }),
    {
      name: "theme-store",
      storage: createJSONStorage(() => localStorage),
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...persistedState,
        // Ignore layout values saved by older versions of the customizer.
        layout: "semibox",
        navbarType: "sticky",
      }),
    }
  )
);

export const useSidebar = create(
  persist(
    (set) => ({
      collapsed: false,
      setCollapsed: () => set({ collapsed: false }),
      sidebarType: "popover",
      setSidebarType: () => set({ sidebarType: "popover" }),
      subMenu: false,
      setSubmenu: (value) => set({ subMenu: value }),
      // background image
      sidebarBg: siteConfig.sidebarBg,
      setSidebarBg: (value) => set({ sidebarBg: value }),
      mobileMenu: false,
      setMobileMenu: (value) => set({ mobileMenu: value }),
    }),
    {
      name: "sidebar-store",
      storage: createJSONStorage(() => localStorage),
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...persistedState,
        // Keep legacy saved preferences from collapsing or changing the sidebar.
        collapsed: false,
        sidebarType: "popover",
      }),
    }
  )
);
