/**
 * Cargador de módulos Puppeteer
 * Este archivo .js se ejecuta directamente en Node.js sin ser procesado por webpack
 * 
 * IMPORTANTE: Usar Function constructor para evitar que webpack analice el require
 */

function loadPuppeteerModule(moduleName) {
  // Usar Function constructor para construir el require dinámicamente
  // Esto evita que webpack analice estáticamente el código y cree webpackEmptyContext
  try {
    // Intentar usar __non_webpack_require__ primero (si está disponible)
    if (typeof __non_webpack_require__ !== "undefined") {
      return __non_webpack_require__(moduleName);
    }
    
    // Si no está disponible, construir el require usando Function constructor
    // Esto fuerza a webpack a no procesar el require como un contexto dinámico
    const requireFunc = new Function('moduleName', `
      const r = typeof require !== "undefined" ? require : (() => {
        const { createRequire } = require("module");
        return createRequire(process.cwd() + "/package.json");
      })();
      return r(moduleName);
    `);
    
    return requireFunc(moduleName);
  } catch (error) {
    throw new Error(`Error al cargar el módulo ${moduleName}: ${error.message}`);
  }
}

module.exports = { loadPuppeteerModule };
