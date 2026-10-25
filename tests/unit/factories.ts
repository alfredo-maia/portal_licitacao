import { randomUUID } from "node:crypto";
import type { RbacUser } from "@/lib/rbac";

/**
 * Factories compartilhadas dos testes de backend da Sprint 1 (AV-36).
 * Ids/edi­táis únicos por invocação garantem determinismo tanto com o
 * PostgreSQL ativo quanto no fallback em memória.
 */
let counter = 0;

export function uniqueId(prefix = "TEST"): string {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}-${randomUUID().slice(0, 8)}`;
}

export const DIRETORIA_USER: RbacUser = {
  id: "user-dir-test",
  name: "Diretora Teste",
  email: "diretora@teste.dev",
  role: "DIRETORIA",
  ativo: true,
};

export const ANALISTA_USER: RbacUser = {
  id: "user-ana-test",
  name: "Analista Teste",
  email: "analista@teste.dev",
  role: "ANALISTA_COMERCIAL",
  ativo: true,
};

export const OPERADOR_USER: RbacUser = {
  id: "user-ope-test",
  name: "Operador Teste",
  email: "operador@teste.dev",
  role: "OPERADOR",
  ativo: true,
};

const DIA_EM_MS = 24 * 60 * 60 * 1000;

export function diasNoFuturo(dias: number): string {
  return new Date(Date.now() + dias * DIA_EM_MS).toISOString();
}

export function buildIngestaoItem(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const id = uniqueId("PNCP");
  return {
    pncpId: id,
    numeroEdital: `PE-${id}`,
    orgao: {
      cnpj: "00.000.000/0001-00",
      nome: `Órgão Teste ${id}`,
      uf: "GO",
      municipio: "Goiânia",
    },
    modalidade: "Pregão Eletrônico",
    valorEstimado: 100_000,
    dataAbertura: diasNoFuturo(5),
    isPresencial: false,
    miniResumo: "Sistema de teste",
    resumo: `Resumo do certame de teste ${id}`,
    tipoSistemaSugerido: "SISTEMA_NOVO",
    quantidadeLotes: 1,
    loteUnico: true,
    precoPorLote: false,
    parecerGoNoGo: "AVALIAR",
    atestadosExigidos: [],
    ...overrides,
  };
}

export function buildIngestaoPayload(
  licitacoes: unknown[],
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    versaoContrato: 2,
    executadoEm: new Date().toISOString(),
    totalRegistros: licitacoes.length,
    licitacoes,
    ...overrides,
  };
}

export function buildCriarManualInput(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const id = uniqueId("MAN");
  return {
    numeroEdital: `EDITAL-${id}`,
    orgaoNome: `Órgão Manual ${id}`,
    orgaoCnpj: "11.222.333/0001-44",
    uf: "GO",
    valorEstimado: 250_000,
    dataAbertura: diasNoFuturo(6),
    miniResumo: "Cadastro manual teste",
    resumo: `Resumo do cadastro manual ${id}`,
    tipoSistemaCodigo: "SISTEMA_NOVO",
    ...overrides,
  };
}
