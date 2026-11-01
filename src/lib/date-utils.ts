/**
 * Utilitários determinísticos para manipulação e formatação de datas.
 * Garante imunidade contra discrepâncias de fuso horário (ex: UTC vs America/Sao_Paulo UTC-3).
 */

export function formatarDataSemOffset(valor: string | Date | null | undefined): string {
  if (!valor) return "";

  if (typeof valor === "string") {
    const limpo = valor.trim();
    const parteData = limpo.includes("T") ? limpo.split("T")[0] : limpo;
    const partes = parteData.split("-");
    if (partes.length === 3 && partes[0].length === 4) {
      const [ano, mes, dia] = partes;
      return `${dia.padStart(2, "0")}/${mes.padStart(2, "0")}/${ano}`;
    }
  }

  const d = new Date(valor);
  if (isNaN(d.getTime())) return "";

  // Componentes em UTC para evitar que 00:00:00Z vire 21:00 do dia anterior
  const dia = String(d.getUTCDate()).padStart(2, "0");
  const mes = String(d.getUTCMonth() + 1).padStart(2, "0");
  const ano = d.getUTCFullYear();

  return `${dia}/${mes}/${ano}`;
}

/**
 * Converte string 'YYYY-MM-DD' em um Date alinhado ao meio-dia UTC (12:00:00Z).
 * Isso garante que ao converter para qualquer fuso horário entre UTC-11 e UTC+11
 * (incluindo o horário de Brasília UTC-3), o dia civil permaneça exatamente o mesmo.
 */
export function parseDataCivil(valor: string | Date | null | undefined): Date | null {
  if (!valor) return null;
  if (valor instanceof Date) {
    if (isNaN(valor.getTime())) return null;
    return valor;
  }
  const limpo = String(valor).trim();
  const parteData = limpo.includes("T") ? limpo.split("T")[0] : limpo;
  const partes = parteData.split("-").map(Number);
  if (partes.length === 3 && !isNaN(partes[0]) && !isNaN(partes[1]) && !isNaN(partes[2])) {
    const [ano, mes, dia] = partes;
    return new Date(Date.UTC(ano, mes - 1, dia, 12, 0, 0));
  }
  const d = new Date(valor);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Extrai o dia do mês (1 a 31) de uma data civil, imune a fuso horário.
 * Se a hora gravada for 00:00:00 UTC ou 12:00:00 UTC, usa getUTCDate().
 */
export function extrairDiaCivil(valor: Date | string | null | undefined): number {
  if (!valor) return 1;
  const d = typeof valor === "string" ? new Date(valor) : valor;
  if (isNaN(d.getTime())) return 1;
  if (d.getUTCHours() === 0 || d.getUTCHours() === 12) {
    return d.getUTCDate();
  }
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    day: "numeric",
  });
  return parseInt(formatter.format(d), 10);
}
