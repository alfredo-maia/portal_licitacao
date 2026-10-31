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
