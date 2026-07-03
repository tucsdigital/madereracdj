/**
 * Pool de navegadores Puppeteer para reutilización
 * Evita el "cold start" al mantener una instancia del navegador en memoria
 */

let browserInstance: any = null;
let browserPromise: Promise<any> | null = null;
let isInitializing = false;

const BROWSER_TIMEOUT = 30000; // 30 segundos de inactividad antes de cerrar
let browserTimeoutId: NodeJS.Timeout | null = null;

/**
 * Obtiene o crea una instancia del navegador
 * Reutiliza la instancia existente si está disponible
 */
export async function getBrowser(): Promise<any> {
  // Si ya hay una instancia activa, retornarla
  if (browserInstance) {
    try {
      // Verificar que el navegador sigue conectado
      const pages = await browserInstance.pages();
      if (pages.length >= 0) {
        // Resetear timeout de cierre
        resetBrowserTimeout();
        return browserInstance;
      }
    } catch (e) {
      // Si el navegador está desconectado, limpiar y crear uno nuevo
      browserInstance = null;
      browserPromise = null;
    }
  }

  // Si ya hay una inicialización en curso, esperar a que termine
  if (browserPromise) {
    return browserPromise;
  }

  // Crear nueva instancia
  isInitializing = true;
  browserPromise = createBrowser();
  
  try {
    browserInstance = await browserPromise;
    resetBrowserTimeout();
    return browserInstance;
  } finally {
    isInitializing = false;
    browserPromise = null;
  }
}

/**
 * Crea una nueva instancia del navegador
 */
async function createBrowser(): Promise<any> {
  const isProduction = process.env.NODE_ENV === "production" || process.env.VERCEL;
  
  if (isProduction) {
    // Producción (Vercel): usar @sparticuz/chromium y puppeteer-core
    const chromiumModule = await import("@sparticuz/chromium");
    const puppeteerCoreModule = await import("puppeteer-core");
    
    const chromium: any = (chromiumModule as any).default || chromiumModule;
    const puppeteerCore: any = (puppeteerCoreModule as any).default || puppeteerCoreModule;
    
    // setGraphicsMode puede no estar disponible en todas las versiones
    if (chromium && typeof chromium.setGraphicsMode === "function") {
      chromium.setGraphicsMode(false);
    }
    
    // executablePath es una función async en @sparticuz/chromium
    const executablePath = await chromium.executablePath();
    
    return await puppeteerCore.launch({
      args: [
        ...(chromium.args || []),
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--disable-software-rasterizer",
        "--disable-extensions",
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-background-networking",
        "--disable-background-timer-throttling",
        "--disable-backgrounding-occluded-windows",
        "--disable-breakpad",
        "--disable-client-side-phishing-detection",
        "--disable-default-apps",
        "--disable-features=TranslateUI",
        "--disable-hang-monitor",
        "--disable-ipc-flooding-protection",
        "--disable-popup-blocking",
        "--disable-prompt-on-repost",
        "--disable-renderer-backgrounding",
        "--disable-sync",
        "--disable-translate",
        "--metrics-recording-only",
        "--no-first-run",
        "--safebrowsing-disable-auto-update",
        "--enable-automation",
        "--password-store=basic",
        "--use-mock-keychain",
      ],
      defaultViewport: {
        deviceScaleFactor: 1,
        hasTouch: false,
        height: 1123, // A4 height in pixels at 96 DPI
        isLandscape: false,
        isMobile: false,
        width: 794, // A4 width in pixels at 96 DPI
      },
      executablePath: executablePath,
      headless: chromium.headless || "shell",
    });
  } else {
    // Desarrollo: usar puppeteer normal
    const puppeteerModule = await import("puppeteer");
    const puppeteer: any = (puppeteerModule as any).default || puppeteerModule;
    
    return await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--disable-software-rasterizer",
        "--disable-extensions",
        "--disable-background-networking",
        "--disable-background-timer-throttling",
        "--disable-backgrounding-occluded-windows",
        "--disable-breakpad",
        "--disable-client-side-phishing-detection",
        "--disable-default-apps",
        "--disable-features=TranslateUI",
        "--disable-hang-monitor",
        "--disable-ipc-flooding-protection",
        "--disable-popup-blocking",
        "--disable-prompt-on-repost",
        "--disable-renderer-backgrounding",
        "--disable-sync",
        "--disable-translate",
        "--metrics-recording-only",
        "--no-first-run",
        "--safebrowsing-disable-auto-update",
        "--enable-automation",
        "--password-store=basic",
      ],
    });
  }
}

/**
 * Resetea el timeout de cierre del navegador
 */
function resetBrowserTimeout() {
  if (browserTimeoutId) {
    clearTimeout(browserTimeoutId);
  }
  
  browserTimeoutId = setTimeout(async () => {
    if (browserInstance) {
      try {
        await browserInstance.close();
      } catch (e) {
        // Ignorar errores al cerrar
      }
      browserInstance = null;
    }
    browserTimeoutId = null;
  }, BROWSER_TIMEOUT);
}

/**
 * Cierra el navegador manualmente
 */
export async function closeBrowser(): Promise<void> {
  if (browserTimeoutId) {
    clearTimeout(browserTimeoutId);
    browserTimeoutId = null;
  }
  
  if (browserInstance) {
    try {
      await browserInstance.close();
    } catch (e) {
      // Ignorar errores al cerrar
    }
    browserInstance = null;
  }
}
