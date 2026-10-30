/**
 * Validador e Sanitizador de E-mails com Bloqueio de Provedores Descartáveis/Temporários
 * PRD §3.4 / ADR 0007 / Issue #9
 */

/**
 * Lista negra de domínios conhecidos de e-mails descartáveis e temporários
 */
export const DISPOSABLE_EMAIL_DOMAINS: ReadonlySet<string> = new Set([
  "mailinator.com",
  "guerrillamail.com",
  "guerrillamailblock.com",
  "sharklasers.com",
  "grr.la",
  "10minutemail.com",
  "10minutemail.net",
  "tempmail.com",
  "temp-mail.org",
  "throwawaymail.com",
  "yopmail.com",
  "yopmail.fr",
  "yopmail.net",
  "getnada.com",
  "trashmail.com",
  "fakemailgenerator.com",
  "maildrop.cc",
  "dispostable.com",
  "mohmal.com",
  "crazymailing.com",
  "burnermail.io",
]);

/**
 * Sanitiza o endereço de e-mail removendo espaços externos e convertendo para minúsculas
 */
export function sanitizeEmail(email: string): string {
  if (!email || typeof email !== "string") {
    return "";
  }
  return email.trim().toLowerCase();
}

/**
 * Verifica se o e-mail possui formato sintático válido (RFC 5322 simplificado)
 */
export function isValidEmailFormat(email: string): boolean {
  if (!email || typeof email !== "string") {
    return false;
  }
  const normalized = email.trim();
  const rfcRegex =
    /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  return rfcRegex.test(normalized) && normalized.length <= 150;
}

/**
 * Verifica se o domínio do e-mail é de um provedor temporário/descartável
 */
export function isDisposableEmail(email: string): boolean {
  const sanitized = sanitizeEmail(email);
  const parts = sanitized.split("@");
  if (parts.length !== 2) {
    return false;
  }
  const domain = parts[1];
  return DISPOSABLE_EMAIL_DOMAINS.has(domain);
}

/**
 * Validação completa corporativa: formato RFC + não ser descartável
 */
export function validateCorporateEmail(email: string): {
  isValid: boolean;
  sanitized: string;
  error?: string;
} {
  const sanitized = sanitizeEmail(email);

  if (!isValidEmailFormat(sanitized)) {
    return {
      isValid: false,
      sanitized,
      error: "Formato de e-mail inválido.",
    };
  }

  if (isDisposableEmail(sanitized)) {
    return {
      isValid: false,
      sanitized,
      error:
        "E-mails temporários ou descartáveis não são permitidos. Utilize seu e-mail corporativo.",
    };
  }

  return {
    isValid: true,
    sanitized,
  };
}
