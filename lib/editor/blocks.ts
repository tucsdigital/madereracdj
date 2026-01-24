/**
 * Sistema de bloques para editor de contenido destacado
 * Tipos, validadores y renderer seguro
 */

export type BlockType = "heading" | "paragraph" | "link" | "youtube" | "image" | "callout";

export interface BaseBlock {
  id: string;
  type: BlockType;
}

export interface HeadingBlock extends BaseBlock {
  type: "heading";
  level: 1 | 2 | 3;
  text: string;
}

export interface ParagraphBlock extends BaseBlock {
  type: "paragraph";
  text: string;
}

export interface LinkBlock extends BaseBlock {
  type: "link";
  url: string;
  text: string;
  description?: string;
}

export interface YoutubeBlock extends BaseBlock {
  type: "youtube";
  videoId: string; // Solo ID, no URL completa
}

export interface ImageBlock extends BaseBlock {
  type: "image";
  url: string;
  alt?: string;
  caption?: string;
}

export interface CalloutBlock extends BaseBlock {
  type: "callout";
  variant: "info" | "success" | "warning" | "error";
  text: string;
}

export type Block = HeadingBlock | ParagraphBlock | LinkBlock | YoutubeBlock | ImageBlock | CalloutBlock;

/**
 * Valida un bloque individual
 */
export function validateBlock(block: any): block is Block {
  if (!block || typeof block !== "object") return false;
  if (!block.id || typeof block.id !== "string") return false;
  if (!block.type || typeof block.type !== "string") return false;

  switch (block.type) {
    case "heading":
      return (
        typeof block.level === "number" &&
        [1, 2, 3].includes(block.level) &&
        typeof block.text === "string" &&
        block.text.length > 0 &&
        block.text.length <= 200
      );

    case "paragraph":
      return typeof block.text === "string" && block.text.length > 0 && block.text.length <= 2000;

    case "link":
      return (
        typeof block.url === "string" &&
        isValidUrl(block.url) &&
        typeof block.text === "string" &&
        block.text.length > 0 &&
        block.text.length <= 100
      );

    case "youtube":
      return typeof block.videoId === "string" && /^[a-zA-Z0-9_-]{11}$/.test(block.videoId);

    case "image":
      return (
        typeof block.url === "string" &&
        isValidUrl(block.url) &&
        (block.alt === undefined || (typeof block.alt === "string" && block.alt.length <= 200))
      );

    case "callout":
      return (
        ["info", "success", "warning", "error"].includes(block.variant) &&
        typeof block.text === "string" &&
        block.text.length > 0 &&
        block.text.length <= 500
      );

    default:
      return false;
  }
}

/**
 * Valida un array de bloques
 */
export function validateBlocks(blocks: any[]): blocks is Block[] {
  if (!Array.isArray(blocks)) return false;
  if (blocks.length === 0 || blocks.length > 20) return false; // Máximo 20 bloques
  return blocks.every(validateBlock);
}

/**
 * Valida URL básica
 */
function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    // Solo permitir http/https
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Extrae ID de video de YouTube de una URL
 */
export function extractYoutubeId(urlOrId: string): string | null {
  // Si ya es un ID válido
  if (/^[a-zA-Z0-9_-]{11}$/.test(urlOrId)) {
    return urlOrId;
  }

  // Intentar extraer de URL
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
  ];

  for (const pattern of patterns) {
    const match = urlOrId.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

/**
 * Sanitiza texto para prevenir XSS
 */
function sanitizeText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

/**
 * Renderiza bloques a HTML seguro
 * @param blocks - Array de bloques validados
 * @returns HTML string seguro
 */
export function renderBlocks(blocks: Block[]): string {
  return blocks
    .map((block) => {
      switch (block.type) {
        case "heading":
          return `<h${block.level} class="text-${block.level === 1 ? "2xl" : block.level === 2 ? "xl" : "lg"} font-bold mb-2">${sanitizeText(block.text)}</h${block.level}>`;

        case "paragraph":
          return `<p class="mb-4 text-gray-700">${sanitizeText(block.text)}</p>`;

        case "link":
          return `<div class="mb-4">
            <a href="${sanitizeText(block.url)}" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline font-medium">
              ${sanitizeText(block.text)}
            </a>
            ${block.description ? `<p class="text-sm text-gray-600 mt-1">${sanitizeText(block.description)}</p>` : ""}
          </div>`;

        case "youtube":
          return `<div class="mb-4 aspect-video">
            <iframe 
              src="https://www.youtube.com/embed/${block.videoId}" 
              frameborder="0" 
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
              allowfullscreen
              class="w-full h-full rounded-lg"
            ></iframe>
          </div>`;

        case "image":
          return `<div class="mb-4">
            <img src="${sanitizeText(block.url)}" alt="${block.alt ? sanitizeText(block.alt) : ""}" class="w-full rounded-lg" />
            ${block.caption ? `<p class="text-sm text-gray-600 mt-2 text-center">${sanitizeText(block.caption)}</p>` : ""}
          </div>`;

        case "callout":
          const calloutColors = {
            info: "bg-blue-50 border-blue-200 text-blue-800",
            success: "bg-green-50 border-green-200 text-green-800",
            warning: "bg-yellow-50 border-yellow-200 text-yellow-800",
            error: "bg-red-50 border-red-200 text-red-800",
          };
          return `<div class="mb-4 p-4 rounded-lg border ${calloutColors[block.variant]}">
            ${sanitizeText(block.text)}
          </div>`;

        default:
          return "";
      }
    })
    .join("");
}
