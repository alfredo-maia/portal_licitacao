/**
 * Sanitizador HTML dedicado para pré-visualizações de documentos A4 (Declarações,
 * Impugnações, Pedidos de Cotação e Propostas Comerciais) (Issue #42).
 *
 * Remove vetores de XSS (`<script>`, `<iframe>`, `<svg>`, handlers `on*`,
 * URIs `javascript:`/`vbscript:`/`data:text/html` e expressões CSS inseguras)
 * preservando integralmente a formatação de tabelas, estilos seguros e layouts A4.
 */

const DANGEROUS_BLOCK_TAGS = [
  "script",
  "iframe",
  "object",
  "embed",
  "applet",
  "svg",
  "math",
  "noscript",
  "frame",
  "frameset",
];

const DANGEROUS_VOID_TAGS = [
  "base",
  "meta",
  "link",
  "form",
  "input",
  "textarea",
  "button",
  "select",
];

function isSafeUrl(rawUrl: string): boolean {
  const cleaned = rawUrl
    .replace(/[\u0000-\u0020\u007f]+/g, "")
    .trim()
    .toLowerCase();

  if (!cleaned) return true;
  if (
    cleaned.startsWith("#") ||
    cleaned.startsWith("/") ||
    cleaned.startsWith("https://") ||
    cleaned.startsWith("http://") ||
    cleaned.startsWith("mailto:")
  ) {
    return true;
  }

  // Permite apenas imagens raster em data URI base64 (proíbe svg/html/script)
  if (/^data:image\/(?:png|jpeg|jpg|gif|webp);base64,[a-z0-9+/=]+$/i.test(cleaned)) {
    return true;
  }

  return false;
}

function sanitizeCssText(css: string): string {
  return css
    .replace(/@import[^;]*;?/gi, "")
    .replace(/expression\s*\([^)]*\)/gi, "")
    .replace(/javascript\s*:/gi, "")
    .replace(/vbscript\s*:/gi, "")
    .replace(/-moz-binding\s*:[^;"]*;?/gi, "")
    .replace(/behavior\s*:[^;"]*;?/gi, "")
    .replace(/url\s*\(\s*["']?\s*(?:javascript:|vbscript:|data:(?!image\/(?:png|jpe?g|gif|webp)))[^)]*\)/gi, "");
}

function sanitizeTagAttributes(tagName: string, attrs: string): string {
  if (!attrs.trim()) return "";

  let cleaned = attrs;

  // Remove todos os event handlers inline (onload=, onclick=, onerror=, etc.)
  cleaned = cleaned.replace(
    /\s+on[a-z0-9_-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi,
    "",
  );
  // Remove srcdoc / formaction
  cleaned = cleaned.replace(
    /\s+(?:srcdoc|formaction)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi,
    "",
  );

  // Valida atributos de URL (href, src, action, xlink:href)
  cleaned = cleaned.replace(
    /(\s+(?:href|src|action|xlink:href)\s*=\s*)(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi,
    (_full, prefix: string, dq?: string, sq?: string, bare?: string) => {
      const value = dq ?? sq ?? bare ?? "";
      if (!isSafeUrl(value)) {
        return "";
      }
      return `${prefix}"${value.replace(/"/g, "&quot;")}"`;
    },
  );

  // Sanitiza atributo style inline
  cleaned = cleaned.replace(
    /(\s+style\s*=\s*)(?:"([^"]*)"|'([^']*)')/gi,
    (_full, prefix: string, dq?: string, sq?: string) => {
      const styleContent = dq ?? sq ?? "";
      const safeStyle = sanitizeCssText(styleContent);
      return `${prefix}"${safeStyle}"`;
    },
  );

  if (tagName.toLowerCase() === "a") {
    if (!/\brel\s*=/i.test(cleaned)) {
      cleaned += ' rel="noopener noreferrer"';
    }
  }

  return cleaned;
}

export function sanitizarHtmlDocumento(html: string | null | undefined): string {
  if (!html || typeof html !== "string") {
    return "";
  }

  let output = html;

  // Remove comentários HTML condicionais / anômalos
  output = output.replace(/<!--[\s\S]*?-->/g, "");

  // Remove blocos perigosos completos e tags soltas
  for (const tag of DANGEROUS_BLOCK_TAGS) {
    const blockRegex = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}\\s*>`, "gi");
    output = output.replace(blockRegex, "");
    const openOrVoidRegex = new RegExp(`<\\/?${tag}\\b[^>]*>`, "gi");
    output = output.replace(openOrVoidRegex, "");
  }

  // Remove tags estruturais ou interativas de alto risco
  for (const tag of DANGEROUS_VOID_TAGS) {
    const voidRegex = new RegExp(`<\\/?${tag}\\b[^>]*>`, "gi");
    output = output.replace(voidRegex, "");
  }

  // Sanitiza conteúdo interno de tags <style>
  output = output.replace(
    /<style\b([^>]*)>([\s\S]*?)<\/style\s*>/gi,
    (_m, attrs: string, cssBody: string) =>
      `<style${sanitizeTagAttributes("style", attrs)}>${sanitizeCssText(cssBody)}</style>`,
  );

  // Sanitiza atributos de todas as tags HTML restantes
  output = output.replace(
    /<([a-zA-Z][a-zA-Z0-9-]*)(\s+[^>]*?)(\s*\/?)>/g,
    (full, tagName: string, attrs: string, selfClose: string) => {
      if (tagName.toLowerCase() === "style") {
        return full;
      }
      const safeAttrs = sanitizeTagAttributes(tagName, attrs);
      return `<${tagName}${safeAttrs}${selfClose}>`;
    },
  );

  return output;
}

