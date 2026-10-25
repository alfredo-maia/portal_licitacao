/**
 * Utilitários de Máscaras e Formatações Globais — Sprint 7
 * Atende às diretrizes de máscaras para CNPJ, CPF, inputs estritamente numéricos e e-mails.
 */

/**
 * Aplica máscara de CNPJ (00.000.000/0000-00)
 */
export function maskCnpj(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 14);
  return digits
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

/**
 * Aplica máscara de CPF (000.000.000-00)
 */
export function maskCpf(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  return digits
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1-$2");
}

/**
 * Aceita estritamente dígitos numéricos (remove tudo o que não for número)
 */
export function maskNumericOnly(value: string): string {
  return value.replace(/\D/g, "");
}

/**
 * Validação sintática de endereço de e-mail corporativo
 */
export function isValidEmail(email: string): boolean {
  const regex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  return regex.test(email.trim());
}

/**
 * Limpa e higieniza e-mail (lowercase e trim)
 */
export function sanitizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Faixas de Valor de Licitações (Sprint 7 — Item 2.9)
 */
export const FAIXAS_VALOR_SPRINT7 = [
  { id: "TODAS", label: "Todas as faixas de valor", min: undefined, max: undefined },
  { id: "ATE_100K", label: "Até R$ 100.000,00", min: 0, max: 100000 },
  { id: "100K_A_200K", label: "Entre R$ 100.000 e R$ 200.000", min: 100000, max: 200000 },
  { id: "200K_A_500K", label: "Entre R$ 200.000 e R$ 500.000", min: 200000, max: 500000 },
  { id: "500K_A_1M", label: "Entre R$ 500.000 e R$ 1.000.000", min: 500000, max: 1000000 },
  { id: "1M_A_2M", label: "Entre R$ 1.000.000 e R$ 2.000.000", min: 1000000, max: 2000000 },
  { id: "ACIMA_2M", label: "Acima de R$ 2.000.000", min: 2000000, max: undefined },
] as const;

export type FaixaValorId = (typeof FAIXAS_VALOR_SPRINT7)[number]["id"];
