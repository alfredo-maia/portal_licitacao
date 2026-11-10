import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { getServerSession } from "next-auth/next";
import { resetInMemoryLicitacoes, insertInMemoryLicitacao, listInMemoryLicitacoes } from "@/server/services/licitacoes-store";
import { ingestLicitacoesV2 } from "@/server/services/ingestao.service";

vi.mock("next-auth/next", () => ({
  getServerSession: vi.fn(),
}));

const getServerSessionMock = vi.mocked(getServerSession);

describe("Bloco 2 (Issue #39) — Cron PNCP Diário & Motor Duplo de Títulos/Resumos", () => {
  const envBackup = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    resetInMemoryLicitacoes();
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    process.env.CRON_SECRET = "cron-secret-test-min-16-chars";
    getServerSessionMock.mockResolvedValue(null);
  });

  afterEach(() => {
    process.env = { ...envBackup };
    vi.restoreAllMocks();
  });

  it("1. Heurística V2 (Prioridade 2) e Schema de Ingestão não truncam palavras no meio nem iniciam com bordões tipo 'Empresa Esp'", async () => {
    const {
      sintetizarTituloHeuristicoV2,
      pareceTituloTruncadoOuPobre,
      resolverTituloExibicaoLicitacao,
    } = await import("@/lib/licitacao-texto");

    const exemplosReais = [
      "CONTRATAÇÃO DE EMPRESA DE ENGENHARIA PARA ELABORAÇÃO DE PROJETOS EXECUTIVOS DE PAVIMENTAÇÃO ASFÁLTICA NO MUNICÍPIO",
      "CONTRATAÇÃO DE EMPRESA ESPECIALIZADA PARA A REVISÃO DO PLANO DIRETOR MUNICIPAL E CÓDIGO DE OBRAS",
      "CONTRATAÇÃO DE EMPRESA PARA FORNECIMENTO DE GÊNEROS ALIMENTÍCIOS PERECÍVEIS PARA MERENDA ESCOLAR",
      "CONTRATAÇÃO DE EMPRESA ESPECIALIZADA NA EXECUÇÃO DE CALÇAMENTO E DRENAGEM PLUVIAL",
      "SELEÇÃO DE EMPRESA QUALIFICADA PARA O FORNECIMENTO DE MATERIAIS AMBULATORIAIS E MEDICAMENTOS",
    ];

    for (const objeto of exemplosReais) {
      const titulo = sintetizarTituloHeuristicoV2(objeto);
      expect(titulo.length).toBeGreaterThanOrEqual(15);
      expect(titulo.length).toBeLessThanOrEqual(90);
      expect(pareceTituloTruncadoOuPobre(titulo)).toBe(false);
      expect(titulo).not.toMatch(/^(Empresa|Contratação de Empresa)/i);
      expect(titulo).not.toMatch(/\s(P|Pl|Par|Esp|C|de|da|do|para|em|a|o)$/i);
    }

    // Rejeita strings truncadas antigas quando o objeto completo existe
    expect(pareceTituloTruncadoOuPobre("Elaboração de P")).toBe(true);
    expect(pareceTituloTruncadoOuPobre("Empresa Esp")).toBe(true);
    expect(pareceTituloTruncadoOuPobre("Empresa Par")).toBe(true);
    expect(pareceTituloTruncadoOuPobre("Revisão do Pl")).toBe(true);
    expect(pareceTituloTruncadoOuPobre("Empresa Qualificada para o Fornecimento")).toBe(true);

    const corrigidoDisplay = resolverTituloExibicaoLicitacao(
      "Empresa Esp",
      "Contratação de empresa especializada para aquisição de medicamentos básicos e insumos hospitalares",
      "OUTROS",
    );
    expect(corrigidoDisplay).not.toBe("Empresa Esp");
    expect(corrigidoDisplay.toLowerCase()).toMatch(/medicament|insumo/);
    expect(pareceTituloTruncadoOuPobre(corrigidoDisplay)).toBe(false);

    // Schema / Ingestão sem miniResumo explícito NÃO pode cortar em slice(0, 50)
    const ingRes = await ingestLicitacoesV2({
      versaoContrato: 2,
      executadoEm: new Date().toISOString(),
      licitacoes: [
        {
          pncpId: "pncp-b2-no-slice-50",
          numeroEdital: "PE 101/2026",
          orgao: {
            cnpj: "01.000.000/0001-01",
            nome: "MUNICIPIO DE RAFARD",
            uf: "SP",
          },
          modalidade: "Pregão Eletrônico",
          valorEstimado: 280979.44,
          dataAbertura: new Date(Date.now() + 5 * 86400000).toISOString(),
          resumo:
            "Contratação de empresa especializada para a revisão do Plano Diretor Municipal e Legislação Urbanística",
          tipoSistemaSugerido: "OUTROS",
          parecerGoNoGo: "AVALIAR",
        } as any,
      ],
    });

    expect(ingRes.criados).toBe(1);
    const savedTitle = ingRes.registros[0].miniResumo;
    expect(savedTitle).not.toBe("Revisão do Pl");
    expect(savedTitle).not.toMatch(/Pl$/);
    expect(savedTitle.toLowerCase()).toContain("plano diretor");
  });

  it("2. Motor Duplo de Títulos usa Prioridade 1 (IA) em lote quando configurado e cai para Prioridade 2 em fallback inválido", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-b2";
    const llmMod = await import("@/server/services/llm-multimodal.service");
    const spyLlm = vi.spyOn(llmMod, "chamarLlmJsonMultimodal").mockResolvedValueOnce({
      provider: "LLM_GEMINI",
      model: "gemini-2.5-flash",
      data: {
        titulos: [
          {
            pncpId: "p1",
            titulo: "Pavimentação Asfáltica e Projetos Executivos Viários",
          },
          {
            pncpId: "p2",
            // Simula IA retornando corte ruim para forçar fallback automático à Prioridade 2
            titulo: "Empresa Esp",
          },
        ],
      },
    });

    const { gerarTitulosEmLotePrioridadeDupla } = await import(
      "@/server/services/resumo-objeto-licitacao.service"
    );

    const mapa = await gerarTitulosEmLotePrioridadeDupla([
      {
        pncpId: "p1",
        objeto:
          "CONTRATAÇÃO DE EMPRESA DE ENGENHARIA PARA ELABORAÇÃO DE PROJETOS EXECUTIVOS E EXECUÇÃO DA OBRA DE PAVIMENTAÇÃO ASFÁLTICA",
      },
      {
        pncpId: "p2",
        objeto:
          "CONTRATAÇÃO DE EMPRESA ESPECIALIZADA PARA FORNECIMENTO DE GÊNEROS ALIMENTÍCIOS PARA MERENDA ESCOLAR",
      },
    ]);

    expect(spyLlm).toHaveBeenCalledTimes(1);
    expect(mapa.get("p1")?.metodo).toBe("IA");
    expect(mapa.get("p1")?.titulo).toBe("Pavimentação Asfáltica e Projetos Executivos Viários");

    // p2 recebeu resposta ruim da IA, então caiu automaticamente para Prioridade 2!
    expect(mapa.get("p2")?.metodo).toBe("HEURISTICA_V2");
    expect(mapa.get("p2")?.titulo.toLowerCase()).toMatch(/gênero|aliment|merenda/);
    expect(mapa.get("p2")?.titulo).not.toBe("Empresa Esp");
  });

  it("3. Retro-higienização corrige títulos truncados já salvos preservando registros válidos", async () => {
    const licRuim = insertInMemoryLicitacao({
      idPncp: "retro-ruim-1",
      numeroControlePNCP: "retro-ruim-1",
      numeroEdital: "PE 02/2026",
      orgaoNome: "MUNICIPIO DE MUCURICI",
      orgaoCnpj: "27174069000198",
      uf: "ES",
      municipio: "Mucurici",
      esfera: "M",
      poder: "E",
      modalidade: "Pregão Eletrônico",
      modalidadeCodigo: 6,
      portalDisputa: "PNCP",
      miniResumo: "Empresa Par",
      resumo:
        "Contratação de empresa para fornecimento de material de limpeza, higiene e copa para escolas municipais",
      valorEstimado: 190000,
      dataAbertura: new Date(Date.now() + 6 * 86400000),
      dataEncerramentoProposta: new Date(Date.now() + 6 * 86400000),
      dataPublicacaoPncp: new Date(),
      dataUltimaAtualizacao: new Date(),
      status: "PENDENTE",
      parecerIA: "AVALIAR",
      justificativaIA: null,
      tipoSistemaCodigo: "OUTROS",
      segmentoMacro: "CONSUMO",
      subcategorias: [],
      atestadosExigidos: [],
      motivoRecusa: null,
      quantidadeLotes: 1,
      loteUnico: true,
      precoPorLote: false,
      isPresencial: false,
      distanciaGoianiaKm: null,
      linkPncp: null,
      linkSistemaOrigem: null,
      hashCritico: "hash_retro_1",
      valorArrematado: null,
      responsavelId: null,
    });

    const licBoa = insertInMemoryLicitacao({
      idPncp: "retro-boa-1",
      numeroControlePNCP: "retro-boa-1",
      numeroEdital: "PE 03/2026",
      orgaoNome: "PREFEITURA DE GOIANIA",
      orgaoCnpj: "01612092000123",
      uf: "GO",
      municipio: "Goiânia",
      esfera: "M",
      poder: "E",
      modalidade: "Pregão Eletrônico",
      modalidadeCodigo: 6,
      portalDisputa: "PNCP",
      miniResumo: "Sistema de gestão tributária municipal completo",
      resumo: "Contratação de sistema de gestão tributária municipal e NFS-e em nuvem",
      valorEstimado: 300000,
      dataAbertura: new Date(Date.now() + 8 * 86400000),
      dataEncerramentoProposta: new Date(Date.now() + 8 * 86400000),
      dataPublicacaoPncp: new Date(),
      dataUltimaAtualizacao: new Date(),
      status: "PENDENTE",
      parecerIA: "GO",
      justificativaIA: null,
      tipoSistemaCodigo: "TRIBUTARIO",
      segmentoMacro: "INFORMATICA",
      subcategorias: [],
      atestadosExigidos: [],
      motivoRecusa: null,
      quantidadeLotes: 1,
      loteUnico: true,
      precoPorLote: false,
      isPresencial: false,
      distanciaGoianiaKm: null,
      linkPncp: null,
      linkSistemaOrigem: null,
      hashCritico: "hash_retro_boa",
      valorArrematado: null,
      responsavelId: null,
    });

    const { higienizarTitulosExistentesService } = await import(
      "@/server/services/resumo-objeto-licitacao.service"
    );

    const res = await higienizarTitulosExistentesService({
      apenasTruncados: true,
      usarIa: false,
    });

    expect(res.ok).toBe(true);
    expect(res.atualizados).toBeGreaterThanOrEqual(1);

    const todos = listInMemoryLicitacoes();
    const atualizado = todos.find((l) => l.id === licRuim.id)!;
    const preservado = todos.find((l) => l.id === licBoa.id)!;

    expect(atualizado.miniResumo).not.toBe("Empresa Par");
    expect(atualizado.miniResumo.toLowerCase()).toMatch(/limpeza|higiene|copa/);
    expect(preservado.miniResumo).toBe("Sistema de gestão tributária municipal completo");
  });

  it("4. Coletor diário PNCP consulta API oficial com paginação, gera títulos pelo Motor Duplo e grava PncpIngestRun", async () => {
    process.env.GEMINI_API_KEY = "test-gemini-cron";
    const llmMod = await import("@/server/services/llm-multimodal.service");
    vi.spyOn(llmMod, "chamarLlmJsonMultimodal").mockResolvedValueOnce({
      provider: "LLM_GEMINI",
      model: "gemini-2.5-flash",
      data: {
        titulos: [
          {
            pncpId: "46634143000109-1-000888/2026",
            titulo: "Aquisição de Gêneros Alimentícios e Panificação",
          },
        ],
      },
    });

    const fetchSpy = vi.fn().mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes("codigoModalidadeContratacao=6") && u.includes("pagina=1")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: [
              {
                numeroControlePNCP: "46634143000109-1-000888/2026",
                numeroCompra: "088",
                anoCompra: 2026,
                sequencialCompra: 888,
                objetoCompra:
                  "Contratação de empresa especializada para fornecimento de gêneros alimentícios e panificação para merenda escolar",
                modalidadeId: 6,
                modalidadeNome: "Pregão - Eletrônico",
                valorTotalEstimado: 420500.0,
                dataPublicacaoPncp: "2026-11-09T10:00:00",
                dataAberturaProposta: new Date(Date.now() + 7 * 86400000).toISOString(),
                dataEncerramentoProposta: new Date(Date.now() + 7 * 86400000).toISOString(),
                srp: true,
                orgaoEntidade: {
                  cnpj: "46634143000109",
                  razaoSocial: "PREFEITURA MUNICIPAL DE PIEDADE",
                  esferaId: "M",
                  poderId: "E",
                },
                unidadeOrgao: {
                  ufSigla: "SP",
                  municipioNome: "Piedade",
                },
              },
            ],
            totalRegistros: 2,
            totalPaginas: 2,
            numeroPagina: 1,
          }),
        };
      }
      if (u.includes("codigoModalidadeContratacao=6") && u.includes("pagina=2")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: [
              {
                numeroControlePNCP: "01612092000123-1-000999/2026",
                numeroCompra: "099",
                anoCompra: 2026,
                sequencialCompra: 999,
                objetoCompra:
                  "Contratação de empresa especializada para aquisição de equipamentos de informática e impressoras térmicas",
                modalidadeId: 6,
                modalidadeNome: "Pregão - Eletrônico",
                valorTotalEstimado: 195000.0,
                dataPublicacaoPncp: "2026-11-10T08:00:00",
                dataAberturaProposta: new Date(Date.now() + 10 * 86400000).toISOString(),
                dataEncerramentoProposta: new Date(Date.now() + 10 * 86400000).toISOString(),
                orgaoEntidade: {
                  cnpj: "01612092000123",
                  razaoSocial: "PREFEITURA MUNICIPAL DE GOIANIA",
                  esferaId: "M",
                  poderId: "E",
                },
                unidadeOrgao: {
                  ufSigla: "GO",
                  municipioNome: "Goiânia",
                },
              },
            ],
            totalRegistros: 2,
            totalPaginas: 2,
            numeroPagina: 2,
          }),
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: [], totalRegistros: 0, totalPaginas: 0 }),
      };
    });
    global.fetch = fetchSpy as any;

    const { executarIngestaoDiariaPncp, listarExecucoesIngestaoPncp } = await import(
      "@/server/services/pncp-ingestao-diaria.service"
    );

    const run = await executarIngestaoDiariaPncp({
      modalidades: [6],
      diasRetroativos: 1,
      maxPaginasPorModalidade: 3,
      usarIa: true,
      origem: "CRON",
    });

    expect(run.ok).toBe(true);
    expect(run.totalConsultadoPncp).toBe(2);
    expect(run.criados).toBe(2);
    expect(run.titulosViaIa).toBe(1);
    expect(run.titulosViaHeuristica).toBe(1);

    const inseridas = listInMemoryLicitacoes();
    const p1 = inseridas.find((l) => l.idPncp === "46634143000109-1-000888/2026");
    const p2 = inseridas.find((l) => l.idPncp === "01612092000123-1-000999/2026");
    expect(p1?.miniResumo).toBe("Aquisição de Gêneros Alimentícios e Panificação");
    expect(p2?.miniResumo.toLowerCase()).toMatch(/informática|equipamento|impressora/);
    expect(p1?.segmentoMacro).toBe("ALIMENTACAO");
    expect(p2?.segmentoMacro).toBe("INFORMATICA");

    const historico = await listarExecucoesIngestaoPncp(10);
    expect(historico.length).toBeGreaterThanOrEqual(1);
    expect(historico[0].status).toBe("CONCLUIDO");
  });

  it("5. Rota GET/POST /api/cron/ingest-pncp valida CRON_SECRET e vercel.json agenda execução diária", async () => {
    const { GET, POST } = await import("@/app/api/cron/ingest-pncp/route");

    const reqSemAuth = new Request("http://localhost/api/cron/ingest-pncp", { method: "GET" });
    const resUnauth = await GET(reqSemAuth);
    expect(resUnauth.status).toBe(401);

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [], totalRegistros: 0, totalPaginas: 0 }),
    }) as any;

    const reqBearer = new Request("http://localhost/api/cron/ingest-pncp", {
      method: "GET",
      headers: {
        Authorization: "Bearer cron-secret-test-min-16-chars",
      },
    });
    const resOkGet = await GET(reqBearer);
    expect(resOkGet.status).toBe(200);
    const jsonGet = await resOkGet.json();
    expect(jsonGet.ok).toBe(true);

    const reqPost = new Request("http://localhost/api/cron/ingest-pncp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-cron-secret": "cron-secret-test-min-16-chars",
      },
      body: JSON.stringify({ modalidades: [6], usarIa: false }),
    });
    const resOkPost = await POST(reqPost);
    expect(resOkPost.status).toBe(200);
    const jsonPost = await resOkPost.json();
    expect(jsonPost.ok).toBe(true);

    // Verifica vercel.json
    const vercelPath = path.join(process.cwd(), "vercel.json");
    expect(existsSync(vercelPath)).toBe(true);
    const vercelJson = JSON.parse(readFileSync(vercelPath, "utf8"));
    expect(Array.isArray(vercelJson.crons)).toBe(true);
    expect(
      vercelJson.crons.some(
        (c: any) => c.path === "/api/cron/ingest-pncp" && typeof c.schedule === "string",
      ),
    ).toBe(true);
  });
});
