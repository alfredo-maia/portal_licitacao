import { beforeEach, describe, expect, it } from "vitest";
import {
  clearInMemoryLicitacoes,
  insertInMemoryLicitacao,
  setInMemoryTenantLicitacao,
} from "@/server/services/licitacoes-store";
import {
  deliberarOportunidade,
  getOportunidadeById,
  listOportunidadesPaginadas,
} from "@/server/services/oportunidades.service";
import { REABERTA_POS_RECUSA_TAG } from "@/server/schemas/oportunidades.schema";
import { DIRETORIA_USER } from "./factories";

function buildLic(overrides: Partial<Parameters<typeof insertInMemoryLicitacao>[0]> = {}) {
  const futuro = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
  const id = `PNCP-T2-${Math.random().toString(36).slice(2, 10)}`;
  return insertInMemoryLicitacao({
    idPncp: id,
    numeroControlePNCP: id,
    numeroEdital: `PE-${id.slice(-5)}`,
    orgaoNome: "Prefeitura Teste",
    orgaoCnpj: "01.000.000/0001-00",
    uf: "GO",
    municipio: "Goiânia",
    esfera: "MUNICIPAL",
    poder: "EXECUTIVO",
    modalidade: "Pregão Eletrônico",
    modalidadeCodigo: 6,
    portalDisputa: "ComprasNet",
    miniResumo: "Aquisição de computadores",
    resumo: "Aquisição de computadores e servidores para rede municipal.",
    valorEstimado: 100_000,
    dataAbertura: futuro,
    dataEncerramentoProposta: futuro,
    dataPublicacaoPncp: new Date(),
    dataUltimaAtualizacao: new Date(),
    status: "PENDENTE",
    parecerIA: "AVALIAR",
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
  clearInMemoryLicitacoes();
});

describe("Issue #59 (Task 2) — Oportunidades estritamente vigentes, UFs automáticas e ordenação global", () => {
  it("omite licitações PENDENTES com prazo vencido e mantém apenas vigentes", async () => {
    const ontem = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const amanha = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const vencida = buildLic({
      miniResumo: "Edital vencido ontem",
      dataAbertura: ontem,
      dataEncerramentoProposta: ontem,
    });
    const vigente = buildLic({
      miniResumo: "Edital vigente amanhã",
      dataAbertura: amanha,
      dataEncerramentoProposta: amanha,
    });

    const res = await listOportunidadesPaginadas(
      { segmentosTenantAtivo: ["INFORMATICA"], page: 1, pageSize: 10 },
      "tenant_vigencia",
    );

    expect(res.total).toBe(1);
    expect(res.oportunidades.map((o) => o.id)).toEqual([vigente.id]);
    expect(res.oportunidades.some((o) => o.id === vencida.id)).toBe(false);
  });

  it("aplica ufsTenantAtivo automaticamente bloqueando editais de outros estados", async () => {
    const go = buildLic({ uf: "GO", miniResumo: "Equipamento em Goiás" });
    const sp = buildLic({ uf: "SP", miniResumo: "Equipamento em São Paulo" });

    const res = await listOportunidadesPaginadas(
      {
        segmentosTenantAtivo: ["INFORMATICA"],
        ufsTenantAtivo: ["GO"],
        page: 1,
        pageSize: 10,
      },
      "tenant_uf",
    );

    expect(res.total).toBe(1);
    expect(res.oportunidades.map((o) => o.id)).toEqual([go.id]);
    expect(res.oportunidades.some((o) => o.id === sp.id)).toBe(false);
  });

  it("mantém licitação ACEITA no Kanban (status=MINHAS) mesmo após o prazo encerrar", async () => {
    const passada = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const aceitaVencida = buildLic({
      uf: "RJ",
      segmentoMacro: "OUTROS",
      subcategorias: [],
      dataAbertura: passada,
      dataEncerramentoProposta: passada,
      miniResumo: "Certame aceito já encerrado",
    });

    setInMemoryTenantLicitacao("tenant_kanban", aceitaVencida.id, {
      statusKanban: "ACEITA",
    });

    const res = await listOportunidadesPaginadas(
      { status: "MINHAS", page: 1, pageSize: 10 },
      "tenant_kanban",
    );

    expect(res.total).toBe(1);
    expect(res.oportunidades[0].id).toBe(aceitaVencida.id);
    expect(res.oportunidades[0].status).toBe("ACEITA");
  });

  it("ordena globalmente os 15 registros antes de paginar em pageSize=10 (valorEstimado e dataLimite)", async () => {
    const baseMs = Date.now() + 2 * 24 * 60 * 60 * 1000;
    for (let i = 1; i <= 15; i++) {
      const dt = new Date(baseMs + i * 24 * 60 * 60 * 1000);
      buildLic({
        valorEstimado: i * 10_000,
        dataAbertura: dt,
        dataEncerramentoProposta: dt,
        orgaoNome: `Órgão ${String(16 - i).padStart(2, "0")}`,
        miniResumo: `Objeto ${String(i).padStart(2, "0")}`,
      });
    }

    const descValor = await listOportunidadesPaginadas(
      {
        segmentosTenantAtivo: ["INFORMATICA"],
        sortBy: "valorEstimado",
        sortDir: "desc",
        page: 1,
        pageSize: 10,
      },
      "tenant_sort",
    );
    expect(descValor.total).toBe(15);
    expect(descValor.oportunidades).toHaveLength(10);
    expect(descValor.oportunidades[0].valorEstimado).toBe(150_000);
    expect(descValor.oportunidades[9].valorEstimado).toBe(60_000);

    const ascValorP2 = await listOportunidadesPaginadas(
      {
        segmentosTenantAtivo: ["INFORMATICA"],
        sortBy: "valorEstimado",
        sortDir: "asc",
        page: 2,
        pageSize: 10,
      },
      "tenant_sort",
    );
    expect(ascValorP2.oportunidades).toHaveLength(5);
    expect(ascValorP2.oportunidades[0].valorEstimado).toBe(110_000);
    expect(ascValorP2.oportunidades[4].valorEstimado).toBe(150_000);

    const descData = await listOportunidadesPaginadas(
      {
        segmentosTenantAtivo: ["INFORMATICA"],
        sortBy: "dataLimite",
        sortDir: "desc",
        page: 1,
        pageSize: 10,
      },
      "tenant_sort",
    );
    expect(descData.oportunidades[0].valorEstimado).toBe(150_000);
    expect(
      new Date(descData.oportunidades[0].dataEncerramentoProposta!).getTime(),
    ).toBeGreaterThan(
      new Date(descData.oportunidades[1].dataEncerramentoProposta!).getTime(),
    );
  });

  it("limpa a tag REABERTA_POS_RECUSA quando o tenant delibera novamente", async () => {
    const lic = buildLic({ miniResumo: "Certame reaberto no PNCP" });
    setInMemoryTenantLicitacao("tenant_reab", lic.id, {
      statusKanban: "PENDENTE",
      tags: [REABERTA_POS_RECUSA_TAG, "PRIORIDADE"],
      motivoRecusa: "Prazo anterior curto",
    });

    await deliberarOportunidade({
      id: lic.id,
      decisao: "GO",
      user: DIRETORIA_USER,
      tenantId: "tenant_reab",
    });

    const dossie = await getOportunidadeById(lic.id, "tenant_reab");
    expect(dossie.status).toBe("ACEITA");
    expect(dossie.reabertaPosRecusa).toBe(false);
    expect(dossie.tags).toEqual(["PRIORIDADE"]);
  });
});
