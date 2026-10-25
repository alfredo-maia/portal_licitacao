import { createHash } from "node:crypto";

/**
 * Campos críticos que compõem o `hashCritico` (SHA-256) de uma licitação
 * (PRD §6.1 / sprint-1-spec §2.2): qualquer mudança nesses campos indica
 * retificação relevante do certame no PNCP e dispara atualização cirúrgica.
 */
export interface HashCriticoInput {
  dataAbertura: Date | string;
  valorEstimado: number;
  resumo: string;
  modalidade: string;
  numeroEdital: string;
  orgaoCnpj: string;
}

function toIsoUtc(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString();
}

/**
 * Gera um hash SHA-256 hex determinístico a partir dos campos críticos:
 * `dataAbertura` (ISO UTC), `valorEstimado` (número normalizado com 2 casas),
 * `resumo`, `modalidade`, `numeroEdital` e `orgaoCnpj` (todos trimmed).
 * Campos não críticos (ex.: `miniResumo`, links) nunca alteram o hash.
 */
export function computeHashCritico(input: HashCriticoInput): string {
  const canonical = [
    toIsoUtc(input.dataAbertura),
    Number(input.valorEstimado).toFixed(2),
    input.resumo.trim(),
    input.modalidade.trim(),
    input.numeroEdital.trim(),
    input.orgaoCnpj.trim(),
  ].join("|");

  return createHash("sha256").update(canonical, "utf8").digest("hex");
}
