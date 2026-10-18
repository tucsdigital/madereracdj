// Evita que «Lista» y «Zona de cobertura» aparezcan activas simultáneamente.
export function isMenuActive(item, pathname = "") {
  const path = pathname.replace(/^\/(en|bn|ar)(?=\/|$)/, "").replace(/\/$/, "") || "/";
  const matches = (href) => Boolean(href) && (path === href || path.startsWith(`${href}/`));
  if (item.child) return item.child.some((child) => isMenuActive(child, path));
  return matches(item.href) && !(item.excludePaths || []).some(matches);
}
