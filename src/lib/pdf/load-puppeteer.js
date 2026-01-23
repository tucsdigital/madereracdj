/**
 * Cargador de módulos Puppeteer
 * Este archivo .js se ejecuta directamente en Node.js sin ser procesado por webpack
 * 
 * IMPORTANTE: Usar múltiples estrategias para compatibilidad con Vercel
 */

function loadPuppeteerModule(moduleName) {
  try {
    // Estrategia 1: Usar __non_webpack_require__ si está disponible (Next.js)
    if (typeof __non_webpack_require__ !== "undefined") {
      return __non_webpack_require__(moduleName);
    }
    
    // Estrategia 2: Usar require global si está disponible
    if (typeof require !== "undefined") {
      return require(moduleName);
    }
    
    // Estrategia 3: Usar createRequire si estamos en ESM
    try {
      const { createRequire } = require("module");
      const requireFunc = createRequire(process.cwd() + "/package.json");
      return requireFunc(moduleName);
    } catch (e) {
      // Si createRequire falla, continuar con la siguiente estrategia
    }
    
    // Estrategia 4: Usar Function constructor como último recurso
    const requireFunc = new Function('moduleName', `
      const r = typeof require !== "undefined" ? require : (() => {
        try {
          const { createRequire } = require("module");
          return createRequire(process.cwd() + "/package.json");
        } catch (e) {
          throw new Error("No se pudo crear require");
        }
      })();
      return r(moduleName);
    `);
    
    return requireFunc(moduleName);
  } catch (error) {
    throw new Error(`Error al cargar el módulo ${moduleName}: ${error.message}`);
  }
}

module.exports = { loadPuppeteerModule };
