"use client";
import { useMemo } from "react";
import { useAuth } from "@/provider/auth.provider";
import { menusConfig } from "@/config/menus";
import { filterMenusForUser } from "@/lib/access-control";

export function useNavigationMenus(variant = "classic") {
  const { user } = useAuth();
  const source = variant === "main" ? menusConfig.mainNav : menusConfig.sidebarNav[variant];
  return useMemo(() => filterMenusForUser(source, user), [source, user]);
}
