import { navigationItems, buildMenusConfig } from "@/config/menus";

export function generateMenusConfig(enabledModules = []) {
  if (!enabledModules.length) return buildMenusConfig(navigationItems);
  const byId = new Map(navigationItems.map((item) => [item.id, item]));
  const items = [...enabledModules]
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .map((module) => byId.get(module.id || module))
    .filter(Boolean);
  return buildMenusConfig(items);
}

export function useDynamicMenus(enabledModules) {
  return generateMenusConfig(enabledModules);
}
