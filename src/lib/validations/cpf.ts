/**
 * Validador Oficial de CPF segundo algoritmo de Módulo 11 da Receita Federal
 */

export function cleanCpf(cpf: string): string {
  return (cpf || "").replace(/\D/g, "");
}

export function isValidCpf(cpf: string): boolean {
  if (!cpf || typeof cpf !== "string") {
    return false;
  }

  const cleaned = cleanCpf(cpf);
  if (cleaned.length !== 11) {
    return false;
  }

  // Rejeita sequências de dígitos idênticos (ex: 111.111.111-11, 000.000.000-00)
  if (/^(\d)\1{10}$/.test(cleaned)) {
    return false;
  }

  // Cálculo do 1º dígito verificador
  let sum1 = 0;
  for (let i = 0; i < 9; i++) {
    sum1 += Number.parseInt(cleaned[i], 10) * (10 - i);
  }
  let rev1 = 11 - (sum1 % 11);
  if (rev1 === 10 || rev1 === 11) rev1 = 0;
  if (rev1 !== Number.parseInt(cleaned[9], 10)) {
    return false;
  }

  // Cálculo do 2º dígito verificador
  let sum2 = 0;
  for (let i = 0; i < 10; i++) {
    sum2 += Number.parseInt(cleaned[i], 10) * (11 - i);
  }
  let rev2 = 11 - (sum2 % 11);
  if (rev2 === 10 || rev2 === 11) rev2 = 0;
  if (rev2 !== Number.parseInt(cleaned[10], 10)) {
    return false;
  }

  return true;
}

