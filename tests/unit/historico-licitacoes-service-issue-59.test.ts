// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";

vi.mock("next-auth/next", () => ({
  getServerSession: vi.fn(),
}));

import { getServerSession } from "next-auth/next";
import {
  clearInMemoryLicitacoes,
  insertInMemoryLicitacao,
  setInMemoryTenantLicitacao,
} from "@/server/services/licitacoes-store";
import { listHistoricoLicitacoesPaginado } from "@/server/services/historico-licitacoes.service";
import { GET as historicoGET } from "@/app/api/historico-licitacoes/route";

const mockedGetServerSession = vi.mocked(getServerSession);

function buildHistLic(
  overrides: Partial<Parameters<typeof insertInMemoryLicitacao>[0]> = {},
) {
  const id = `PNCP-T4-${Math.random().toString(36).slice(2, 10)}`;
  const padrao = new Date("2026-11-15T12:00:00.000Z");
  return insertInMemoryLicitacao({
    idPncp: id,
    numeroControlePNCP: id,
    numeroEdital: `PE-${id.slice(-5)}`,
    orgaoNome: "Prefeitura Histórica",
    orgaoCnpj: "03.000.000/0001-00",
    uf: "SP",
    municipio: "São Paulo",
    esfera: "MUNICIPAL",
    poder: "EXECUTIVO",
    modalidade: "Pregão Eletrônico",
    modalidadeCodigo: 6,
    portalDisputa: "ComprasNet",
    miniResumo: "Aquisição de materiais diversos",
    resumo: "Contratação de fornecimento de materiais de escritório e expediente.",
    valorEstimado: 150_000,
    dataAbertura: padrao,
    dataEncerramentoProposta: padrao,
    dataPublicacaoPncp: padrao,
    dataUltimaAtualizacao: padrao,
    status: "PENDENTE",
    parecerIA: "AVALIAR",
    justificativaIA: null,
    tipoSistemaCodigo: "OUTROS",
    segmentoMacro: "ESCRITORIO_E_GRAFICA",
    subcategorias: ["1101"],
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
  mockedGetServerSession.mockReset();
});

describe("Issue #59 (Task 4) — Serviço & API /api/historico-licitacoes", () => {
  it("retorna editais encerrados, abertos e OUTROS de qualquer UF, respeitando situacaoPrazo e segmento=OUTROS", async () => {
    const ontem = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const amanha = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    const dataInicio = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const dataFim = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    const encerrada = buildHistLic({
      uf: "AM",
      segmentoMacro: "SAUDE",
      subcategorias: ["1401"],
      dataAbertura: ontem,
      dataEncerramentoProposta: ontem,
      miniResumo: "Edital encerrado saúde",
    });
    const abertaOutros = buildHistLic({
      uf: "RS",
      segmentoMacro: "OUTROS",
      subcategorias: [],
      dataAbertura: amanha,
      dataEncerramentoProposta: amanha,
      miniResumo: "Edital aberto sem segmento",
    });

    setInMemoryTenantLicitacao("tenant_t4", encerrada.id, {
      statusKanban: "ACEITA",
    });

    const todas = await listHistoricoLicitacoesPaginado(
      { dataInicio, dataFim, situacaoPrazo: "TODAS", page: 1, pageSize: 25 },
      "tenant_t4",
    );
    expect(todas.total).toBe(2);
    const encItem = todas.itens.find((i) => i.id === encerrada.id);
    const abItem = todas.itens.find((i) => i.id === abertaOutros.id);
    expect(encItem?.prazoEncerrado).toBe(true);
    expect(encItem?.statusTenant).toBe("ACEITA");
    expect(abItem?.prazoEncerrado).toBe(false);
    expect(abItem?.statusTenant).toBeNull();

    const soEncerradas = await listHistoricoLicitacoesPaginado({
      dataInicio,
      dataFim,
      situacaoPrazo: "ENCERRADAS",
    });
    expect(soEncerradas.itens.map((i) => i.id)).toEqual([encerrada.id]);

    const soAbertas = await listHistoricoLicitacoesPaginado({
      dataInicio,
      dataFim,
      situacaoPrazo: "ABERTAS",
    });
    expect(soAbertas.itens.map((i) => i.id)).toEqual([abertaOutros.id]);

    const soOutros = await listHistoricoLicitacoesPaginado({
      dataInicio,
      dataFim,
      segmento: "OUTROS",
    });
    expect(soOutros.itens.map((i) => i.id)).toEqual([abertaOutros.id]);
  });

  it("rejeita janela > 30 dias e busca com menos de 3 letras, e ordena globalmente em paginação", async () => {
    await expect(
      listHistoricoLicitacoesPaginado({
        dataInicio: "2026-10-01",
        dataFim: "2026-11-05",
      }),
    ).rejects.toBeInstanceOf(ZodError);

    await expect(
      listHistoricoLicitacoesPaginado({
        dataInicio: "2026-11-01",
        dataFim: "2026-11-25",
        busca: "da",
      }),
    ).rejects.toBeInstanceOf(ZodError);

    for (let i = 1; i <= 12; i++) {
      const dt = new Date(Date.UTC(2026, 10, i, 12, 0, 0));
      buildHistLic({
        valorEstimado: i * 50_000,
        dataAbertura: dt,
        dataEncerramentoProposta: dt,
        miniResumo: `Item histórico ${i}`,
      });
    }

    const res = await listHistoricoLicitacoesPaginado({
      dataInicio: "2026-11-01",
      dataFim: "2026-11-25",
      sortBy: "valorEstimado",
      sortDir: "desc",
      page: 1,
      pageSize: 10,
    });
    expect(res.total).toBe(12);
    expect(res.totalPages).toBe(2);
    expect(res.itens).toHaveLength(10);
    expect(res.itens[0].valorEstimado).toBe(600_000);
    expect(res.itens[9].valorEstimado).toBe(150_000);
  });

  it("GET /api/historico-licitacoes responde 401 sem sessão, 403 para SuperAdmin, 400 para busca 2 letras e 200 para cliente BASICO/TRIAL", async () => {
    const urlOk =
      "http://localhost:3010/api/historico-licitacoes?dataInicio=2026-11-01&dataFim=2026-11-25";

    mockedGetServerSession.mockResolvedValueOnce(null);
    const resp401 = await historicoGET(new Request(urlOk));
    expect(resp401.status).toBe(401);

    mockedGetServerSession.mockResolvedValueOnce({
      user: {
        id: "adm_1",
        email: "vitorhenrique018@gmail.com",
        role: "SUPERADMIN",
        isSuperAdmin: true,
      },
      expires: "2999-01-01",
    } as never);
    const resp403 = await historicoGET(new Request(urlOk));
    expect(resp403.status).toBe(403);

    mockedGetServerSession.mockResolvedValueOnce({
      user: {
        id: "cli_basico",
        email: "cliente@basico.com",
        role: "DIRETORIA",
        plano: "BASICO",
        activeTenantId: "tenant_basico",
      },
      expires: "2999-01-01",
    } as never);
    const resp400 = await historicoGET(
      new Request(`${urlOk}&busca=da`),
    );
    expect(resp400.status).toBe(400);

    mockedGetServerSession.mockResolvedValueOnce({
      user: {
        id: "cli_basico",
        email: "cliente@basico.com",
        role: "DIRETORIA",
        plano: "BASICO",
        activeTenantId: "tenant_basico",
      },
      expires: "2999-01-01",
    } as never);
    const resp200 = await historicoGET(new Request(urlOk));
    expect(resp200.status).toBe(200);
    const json = await resp200.json();
    expect(json.ok).toBe(true);
    expect(Array.isArray(json.itens)).toBe(true);
  });
});
