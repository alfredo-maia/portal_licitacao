/**
/**
 * Validador Oficial de CNPJ segundo algoritmo de Módulo 11 da Receita Federal
 * PRD §3.4 / ADR 0007 / Issue #9
 */

/**
 * Remove qualquer caractere que não seja dígito
 */
export function cleanCnpj(cnpj: string): string {
  return cnpj.replace(/\D/g, "");
}

/**
 * Valida os 14 dígitos de um CNPJ brasileiro calculando ambos os dígitos verificadores
 * Rejeita sequências com todos os dígitos idênticos (ex: 00.000.000/0000-00, 11.111.111/1111-11)
 */
export function isValidCnpj(cnpj: string): boolean {
  if (!cnpj || typeof cnpj !== "string") {
    return false;
  }

  const cleaned = cleanCnpj(cnpj);

  if (cleaned.length !== 14) {
    return false;
  }

  // Rejeita sequências de dígitos idênticos (ex: "00000000000000", "11111111111111", etc.)
  if (/^(\d)\1{13}$/.test(cleaned)) {
    return false;
  }

  // Cálculo do 1º dígito verificador
  const weightsFirst = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let sumFirst = 0;
  for (let i = 0; i < 12; i++) {
    sumFirst += Number.parseInt(cleaned[i], 10) * weightsFirst[i];
  }
  const remainderFirst = sumFirst % 11;
  const expectedDigit1 = remainderFirst < 2 ? 0 : 11 - remainderFirst;

  if (Number.parseInt(cleaned[12], 10) !== expectedDigit1) {
    return false;
  }

  // Cálculo do 2º dígito verificador
  const weightsSecond = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  let sumSecond = 0;
  for (let i = 0; i < 13; i++) {
    sumSecond += Number.parseInt(cleaned[i], 10) * weightsSecond[i];
  }
  const remainderSecond = sumSecond % 11;
  const expectedDigit2 = remainderSecond < 2 ? 0 : 11 - remainderSecond;

  if (Number.parseInt(cleaned[13], 10) !== expectedDigit2) {
    return false;
  }

  return true;
}

/**
 * Formata um CNPJ de 14 dígitos no padrão 00.000.000/0000-00
 */
export function formatCnpj(cnpj: string): string {
  const digits = cleanCnpj(cnpj).slice(0, 14);
  return digits
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}
