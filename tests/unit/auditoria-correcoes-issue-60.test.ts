import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearInMemoryLicitacoes,
  insertInMemoryLicitacao,
  insertInMemoryStatusHistorico,
  resetInMemoryLicitacoes,
  setInMemoryTenantLicitacao,
} from "@/server/services/licitacoes-store";
import {
  buildOrderBySql,
  deliberarOportunidade,
  listOportunidadesPaginadas,
} from "@/server/services/oportunidades.service";
import { getDashboardData } from "@/server/services/dashboard.service";
import { executarIngestaoDiariaPncp } from "@/server/services/pncp-ingestao-diaria.service";
import { DIRETORIA_USER } from "./factories";

function buildLic(
  overrides: Partial<Parameters<typeof insertInMemoryLicitacao>[0]> = {},
) {
  const id = `PNCP-I60-${Math.random().toString(36).slice(2, 10)}`;
  const futuro = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
  return insertInMemoryLicitacao({
    idPncp: id,
    numeroControlePNCP: id,
    numeroEdital: `PE-${id.slice(-5)}`,
    orgaoNome: "Órgão Auditoria 60",
    orgaoCnpj: "04.000.000/0001-00",
    uf: "GO",
    municipio: "Goiânia",
    esfera: "MUNICIPAL",
    poder: "EXECUTIVO",
    modalidade: "Pregão Eletrônico",
    modalidadeCodigo: 6,
    portalDisputa: "ComprasNet",
    miniResumo: "Aquisição de Equipamentos",
    resumo: "Aquisição de equipamentos e materiais de informática.",
    valorEstimado: 120_000,
    dataAbertura: futuro,
    dataEncerramentoProposta: futuro,
    dataPublicacaoPncp: new Date(),
    dataUltimaAtualizacao: new Date(),
    status: "PENDENTE",
    parecerIA: "GO",
    justificativaIA: null,
    tipoSistemaCodigo: "OUTROS",
    segmentoMacro: "INFORMATICA",
    subcategorias: ["3101"],
    atestadosExigidos: [],
    motivoRecusa: null,
    quantidadeLotes: 1,
    loteUnico: true,
    precoPorLote: false,
    isPresencial: false,
    distanciaGoianiaKm: null,
    linkPncp: null,
    linkSistemaOrigem: null,
    hashCritico: null,
    valorArrematado: null,
    responsavelId: null,
    ...overrides,
  });
}

beforeEach(() => {
  resetInMemoryLicitacoes();
  clearInMemoryLicitacoes();
  vi.restoreAllMocks();
});

describe("Issue #60 — Correções Backend, Coletor PNCP, Isolamento Multi-Tenant e SQL", () => {
  it("Item 1: Fase 2 do coletor PNCP usa /api/consulta/v1/contratacoes/atualizacao (com dataInicial e dataFinal)", async () => {
    const urls: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      urls.push(String(input));
      return new Response(JSON.stringify({ data: [], totalPaginas: 1 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });

    await executarIngestaoDiariaPncp({
      origem: "SCRIPT",
      dataInicial: "20261125",
      dataFinal: "20261126",
      modalidades: [6],
      maxPaginasPorModalidade: 1,
      usarIa: false,
      incluirPropostasAbertas: true,
      maxPaginasPropostas: 1,
    });

    const urlFase2 = urls.find((u) =>
      u.includes("/api/consulta/v1/contratacoes/atualizacao"),
    );
    expect(urlFase2).toBeDefined();
    expect(urlFase2).toContain("dataInicial=20261125");
    expect(urlFase2).toContain("dataFinal=20261126");
  });

  it("Item 3: periodo='mes' em oportunidades usa dataPublicacaoPncp em BRT e não inclui backfill de janeiro criado hoje", async () => {
    const futuro = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);
    const licJanBackfill = buildLic({
      dataPublicacaoPncp: new Date("2026-01-10T12:00:00.000Z"),
      dataAbertura: futuro,
      dataEncerramentoProposta: futuro,
      miniResumo: "Publicada em Janeiro",
    });
    const licMesAtual = buildLic({
      dataPublicacaoPncp: new Date(),
      dataAbertura: futuro,
      dataEncerramentoProposta: futuro,
      miniResumo: "Publicada no Mês Atual",
    });

    const res = await listOportunidadesPaginadas(
      { periodo: "mes", segmentosTenantAtivo: ["INFORMATICA"] },
      "tenant_periodo",
    );

    expect(res.oportunidades.map((o) => o.id)).toEqual([licMesAtual.id]);
    expect(res.oportunidades.some((o) => o.id === licJanBackfill.id)).toBe(false);
  });

  it("Item 4: status=TODOS em oportunidades inclui PENDENTE vigentes + deliberadas do tenant (inclusive OUTROS resgatados)", async () => {
    const pendente = buildLic({ miniResumo: "Pendente Vigente" });
    const resgatadaAceita = buildLic({
      uf: "RJ",
      segmentoMacro: "OUTROS",
      subcategorias: [],
      miniResumo: "Resgatada OUTROS Aceita",
    });
    setInMemoryTenantLicitacao("tenant_todos", resgatadaAceita.id, {
      statusKanban: "ACEITA",
    });

    const resTodos = await listOportunidadesPaginadas(
      {
        status: "TODOS",
        segmentosTenantAtivo: ["INFORMATICA"],
        ufsTenantAtivo: ["GO"],
      },
      "tenant_todos",
    );
    const idsTodos = resTodos.oportunidades.map((o) => o.id);
    expect(idsTodos).toContain(pendente.id);
    expect(idsTodos).toContain(resgatadaAceita.id);

    const resAceita = await listOportunidadesPaginadas(
      { status: "ACEITA" },
      "tenant_todos",
    );
    expect(resAceita.oportunidades.map((o) => o.id)).toEqual([resgatadaAceita.id]);
  });

  it("Item 5: deliberarOportunidade rejeita decisao='GO' em edital com prazo encerrado (400 PRAZO_ENCERRADO)", async () => {
    const ontem = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const vencida = buildLic({
      dataAbertura: ontem,
      dataEncerramentoProposta: ontem,
      miniResumo: "Edital Vencido Ontem",
    });

    await expect(
      deliberarOportunidade({
        id: vencida.id,
        decisao: "GO",
        user: DIRETORIA_USER,
        tenantId: "tenant_vencida",
      }),
    ).rejects.toMatchObject({
      code: "PRAZO_ENCERRADO",
      status: 400,
    });
  });

  it("Item 7: Dashboard multi-tenant isola transições por tenant (não contabiliza transição de outro tenant no mês)", async () => {
    const lic = buildLic({
      dataPublicacaoPncp: new Date("2026-09-10T12:00:00.000Z"),
    });

    // Tenant A aceitou em Outubro/2026
    setInMemoryTenantLicitacao("tenant_A", lic.id, {
      statusKanban: "ACEITA",
      dataDecisao: new Date("2026-10-15T12:00:00.000Z"),
    });
    // Tenant B aceitou a MESMA licitação em Novembro/2026 (registra histórico global sem tenantId)
    setInMemoryTenantLicitacao("tenant_B", lic.id, {
      statusKanban: "ACEITA",
      dataDecisao: new Date("2026-11-15T12:00:00.000Z"),
    });
    insertInMemoryStatusHistorico({
      licitacaoId: lic.id,
      statusAnterior: "PENDENTE",
      statusNovo: "ACEITA",
      motivo: null,
      usuarioId: "user_b",
      ocorridoEm: new Date("2026-11-15T12:00:00.000Z"),
    });

    const dashTenantANov = await getDashboardData({
      mes: 11,
      ano: 2026,
      tenantId: "tenant_A",
      segmentosTenantAtivo: ["INFORMATICA"],
    });
    const dashTenantBNov = await getDashboardData({
      mes: 11,
      ano: 2026,
      tenantId: "tenant_B",
      segmentosTenantAtivo: ["INFORMATICA"],
    });

    expect(dashTenantANov.cards.emPrecificacao.total).toBe(0);
    expect(dashTenantBNov.cards.emPrecificacao.total).toBe(1);
  });

  it("Item 8: buildOrderBySql força nulls: 'last' em dataEncerramentoProposta", () => {
    const order = buildOrderBySql("dataLimite", "desc");
    expect(order[0]).toEqual({
      dataEncerramentoProposta: { sort: "desc", nulls: "last" },
    });
  });
});
