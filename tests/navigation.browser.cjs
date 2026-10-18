// Prueba componentes reales con navegación local simulada, sin sesión ni escrituras.
const assert = require("node:assert/strict");
const path = require("node:path");
const http = require("node:http");
const esbuild = require("esbuild");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const root = path.resolve(__dirname, "..");

(async () => {
  const bundle = await esbuild.build({
    absWorkingDir: root, bundle: true, write: false, format: "iife", jsx: "automatic", loader: { ".js": "jsx" },
    define: { "process.env.NODE_ENV": '"production"' },
    stdin: { resolveDir: root, loader: "jsx", contents: `
      import React, { useState } from 'react';
      import { createRoot } from 'react-dom/client';
      import Group from './components/partials/sidebar/common/menu-group';
      import SubMenuItem from './components/partials/sidebar/common/sub-menu-item';
      import Horizontal from './components/partials/header/horizontal-menu';
      import { navigationItems } from './config/menus';
      function App() {
        const [active, setActive] = useState(null);
        const compact = new URLSearchParams(location.search).has('compact');
        const horizontal = new URLSearchParams(location.search).has('horizontal');
        return horizontal ? <Horizontal /> : <nav aria-label="Menú Principal" style={{width:248}}>
          {navigationItems.map((item, i) => <div key={item.id}>
            {item.child ? <><Group item={item} index={i} activeSubmenu={active} toggleSubmenu={(i) => setActive(active === i ? null : i)} collapsed={compact} />
              {!compact && active === i && item.child.map(child => <SubMenuItem key={child.id} subItem={child} />)}</> : <SubMenuItem subItem={item} />}
          </div>)}
        </nav>;
      }
      createRoot(document.getElementById('root')).render(<App />);
    ` },
    plugins: [{ name: "navigation-test-adapters", setup(build) {
      build.onResolve({ filter: /^next\/(navigation|link)$/ }, (args) => ({ path: args.path, namespace: "mock" }));
      build.onResolve({ filter: /^@\/hooks\/use-navigation-menus$/ }, () => ({ path: "menus", namespace: "mock" }));
      build.onLoad({ filter: /.*/, namespace: "mock" }, ({ path: name }) => ({ loader: "jsx", resolveDir: root, contents:
        name === "next/navigation" ? `export const usePathname=()=>location.pathname; export const useRouter=()=>({push:(href)=>location.assign(href)});` :
        name === "menus" ? `import { navigationItems } from './config/menus'; export const useNavigationMenus=()=>navigationItems;` :
        `import React from 'react'; export default React.forwardRef(function Link(props,ref){return <a {...props} ref={ref}/>;});`
      }));
    } }],
  });
  const server = http.createServer((req, res) => {
    res.setHeader("Content-Type", req.url === "/bundle.js" ? "application/javascript" : "text/html; charset=utf-8");
    res.end(req.url === "/bundle.js" ? bundle.outputFiles[0].text : '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:14px sans-serif}svg{width:20px;height:20px}a,button{min-height:44px}a{display:block}button{cursor:pointer}</style></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>');
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ channel: "msedge", headless: true });
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${base}/en/envios/zonas`);
      const envios = page.getByRole("button", { name: "Envíos", exact: true });
      await envios.focus();
      await page.keyboard.press("Enter");
      await page.getByRole("link", { name: "Zona de cobertura" }).waitFor();
      assert.equal(await page.getByRole("link", { name: "Lista", exact: true }).getAttribute("aria-current"), null);
      assert.equal(await page.getByRole("link", { name: "Zona de cobertura" }).getAttribute("aria-current"), "page");
      await page.getByRole("button", { name: "Ecommerce", exact: true }).click();
      const web = page.getByRole("link", { name: "Web", exact: true });
      assert.equal(await web.getAttribute("href"), "/en/tienda-web");
      await web.click();
      await page.waitForURL("**/en/tienda-web");
      console.log(`PASS: menú ${width}px, teclado, selección exclusiva y enlace Web`);
    }
    await page.goto(`${base}/en/envios/zonas?compact=1`);
    const trigger = page.getByRole("button", { name: "Envíos", exact: true });
    await trigger.focus();
    await page.keyboard.press("Enter");
    await page.getByRole("link", { name: "Zona de cobertura" }).waitFor();
    await page.waitForFunction(() => document.querySelector('[role="dialog"]')?.contains(document.activeElement));
    await page.keyboard.press("Escape");
    await page.getByRole("link", { name: "Zona de cobertura" }).waitFor({ state: "hidden" });
    assert.equal(await trigger.evaluate((el) => el === document.activeElement), true);
    console.log("PASS: compacto accesible con Enter, Escape y retorno del foco");
    await page.goto(`${base}/en/envios/zonas?horizontal=1`);
    await page.getByRole("button", { name: "Envíos", exact: true }).click();
    await page.getByRole("link", { name: "Zona de cobertura" }).waitFor();
    assert.equal(await page.getByRole("link", { name: "Ventas", exact: true }).getAttribute("href"), "/en/ventas");
    assert.deepEqual(errors, []);
    console.log("PASS: menú horizontal y cero errores de React");
  } finally {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((e) => { console.error(e); process.exitCode = 1; });
