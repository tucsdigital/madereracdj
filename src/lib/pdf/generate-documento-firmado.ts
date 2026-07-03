import { getBrowser } from "./browser-pool";

export async function generatePdfFromHtml(html: string): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: ["domcontentloaded", "networkidle0"] });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: {
        top: "12mm",
        right: "12mm",
        bottom: "12mm",
        left: "12mm",
      },
    });
    return Buffer.from(pdf);
  } finally {
    try {
      await page.close();
    } catch {}
  }
}

