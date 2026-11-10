import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { getServerSession } from "next-auth/next";
import {
  insertInMemoryLicitacao,
  insertInMemoryLicitacaoArquivo,
  listInMemoryLicitacoes,
  resetInMemoryLicitacoes,
} from "@/server/services/licitacoes-store";
import { inMemoryTenants } from "@/server/services/tenant.service";
import { extrairItensCertameCompleto } from "@/server/services/extracao-itens-certame.service";
import { construirRelatorioParticipacaoHibrido } from "@/server/services/analise-ia-participacao.service";
import { GET as getItensCertame } from "@/app/api/oportunidades/[id]/itens-certame/route";
import { GET as getSalasRobo } from "@/app/api/robo-de-lances/salas/route";
import OportunidadesDetalhePage from "@/app/oportunidades/[id]/page";
import RoboDeLancesPage from "@/app/robo-de-lances/page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next-auth/next", () => ({
  getServerSession: vi.fn(),
}));

const getServerSessionMock = vi.mocked(getServerSession);

async function criarPdfComTexto(texto: string): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([595, 842]);
  const linhas = texto.split("\n");
  let y = 790;
  for (const linha of linhas) {
    page.drawText(linha, { x: 40, y, size: 10, font });
    y -= 14;
  }
  return Buffer.from(await pdf.save());
}

describe("Issue #46 — Importação Automática de Regras de Disputa (PNCP/Edital/IA) & Higienização /robo-de-lances", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    resetInMemoryLicitacoes();
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    getServerSessionMock.mockResolvedValue(null);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("1. Detector puro normaliza modo PNCP, infere portal real via URL/texto e extrai intervalo mínimo, critério e UASG do Edital", async () => {
    const modPath = "@/lib/regras-disputa-edital";
    const detector = await import(/* @vite-ignore */ modPath);

    expect(detector.normalizarModoDisputaPncp(1, "Aberto")).toBe("ABERTO");
    expect(detector.normalizarModoDisputaPncp(3, "Aberto-Fechado")).toBe("ABERTO_FECHADO");
    expect(detector.normalizarModoDisputaPncp(6, "Fechado-Aberto")).toBe("FECHADO_ABERTO");
    expect(detector.normalizarModoDisputaPncp(2, "Fechado")).toBeNull();
    expect(detector.normalizarModoDisputaPncp(null, "Modo de Disputa Fechado e Aberto")).toBe(
      "FECHADO_ABERTO",
    );

    expect(
      detector.detectarPortalDisputaPorTextoEUrl({
        linkSistemaOrigem:
          "https://cnetmobile.estaleiro.serpro.gov.br/comprasnet-web/seguro/fornecedor/compras",
        portalAtual: "PNCP",
      }).portal,
    ).toBe("Compras.gov.br");

    expect(
      detector.detectarPortalDisputaPorTextoEUrl({
        linkSistemaOrigem: "https://www.portaldecompraspublicas.com.br/processos/123",
        portalAtual: "PNCP",
      }).portal,
    ).toBe("Portal de Compras Públicas");

    expect(
      detector.detectarPortalDisputaPorTextoEUrl({
        linkSistemaOrigem: "https://licitardigital.com.br/editais/456",
        portalAtual: "PNCP",
      }).portal,
    ).toBe("Licitar Digital");

    expect(
      detector.detectarPortalDisputaPorTextoEUrl({
        usuarioNome: "BLL Compras Eletrônicas",
        portalAtual: "PNCP",
      }).portal,
    ).toBe("BLL Compras");

    const extraido = detector.extrairRegrasDisputaDeTextoEdital(
      [
        "PREGÃO ELETRÔNICO Nº 046/2026 - UASG: 158123",
        "Sessão Pública realizada por meio do portal https://www.portaldecompraspublicas.com.br",
        "Critério de Julgamento: Menor Preço por Item",
        "Será adotado para o envio de lances o modo de disputa aberto e fechado.",
        "O intervalo mínimo de diferença de valores entre os lances será de R$ 5,00 (cinco reais).",
      ].join("\n"),
    );

    expect(extraido.portal).toBe("Portal de Compras Públicas");
    expect(extraido.modoDisputaEdital).toBe("ABERTO_FECHADO");
    expect(extraido.intervaloMinimoLances).toBe("R$ 5,00");
    expect(extraido.criterioJulgamento).toBe("Menor Preço");
    expect(extraido.uasg).toBe("158123");
  });

  it("2. Ingestão diária PNCP infere portalDisputa real (em vez de 'PNCP' cego) a partir de linkSistemaOrigem e usuarioNome", async () => {
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes("codigoModalidadeContratacao=6") && u.includes("pagina=1")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: [
              {
                numeroControlePNCP: "11111111000111-1-000010/2026",
                numeroCompra: "010",
                anoCompra: 2026,
                sequencialCompra: 10,
                objetoCompra: "Aquisição de notebooks corporativos",
                modalidadeId: 6,
                modalidadeNome: "Pregão - Eletrônico",
                modoDisputaId: 3,
                modoDisputaNome: "Aberto-Fechado",
                criterioJulgamentoNome: "Menor Preço",
                usuarioNome: "Compras.gov.br",
                linkSistemaOrigem: "https://cnetmobile.estaleiro.serpro.gov.br/comprasnet-web/123",
                valorTotalEstimado: 150000,
                dataAberturaProposta: new Date(Date.now() + 86400_000).toISOString(),
                orgaoEntidade: { cnpj: "11111111000111", razaoSocial: "Órgão A" },
                unidadeOrgao: { codigoUnidade: "158123", ufSigla: "SP", municipioNome: "São Paulo" },
              },
              {
                numeroControlePNCP: "22222222000122-1-000020/2026",
                numeroCompra: "020",
                anoCompra: 2026,
                sequencialCompra: 20,
                objetoCompra: "Aquisição de insumos laboratoriais",
                modalidadeId: 6,
                modalidadeNome: "Pregão - Eletrônico",
                modoDisputaId: 6,
                modoDisputaNome: "Fechado-Aberto",
                usuarioNome: "Licitar Digital",
                linkSistemaOrigem: "https://licitardigital.com.br/edital/20",
                valorTotalEstimado: 90000,
                dataAberturaProposta: new Date(Date.now() + 86400_000).toISOString(),
                orgaoEntidade: { cnpj: "22222222000122", razaoSocial: "Órgão B" },
                unidadeOrgao: { ufSigla: "MG", municipioNome: "Belo Horizonte" },
              },
            ],
            totalPaginas: 1,
            numeroPagina: 1,
          }),
        };
      }
      return { ok: true, status: 200, json: async () => ({ data: [], totalPaginas: 0 }) };
    }) as any;

    const { executarIngestaoDiariaPncp } = await import(
      "@/server/services/pncp-ingestao-diaria.service"
    );
    const run = await executarIngestaoDiariaPncp({
      modalidades: [6],
      diasRetroativos: 1,
      usarIa: false,
      origem: "MANUAL",
    });

    expect(run.ok).toBe(true);
    const todas = listInMemoryLicitacoes();
    const comprasGov = todas.find((l) => l.idPncp === "11111111000111-1-000010/2026");
    const licitarDig = todas.find((l) => l.idPncp === "22222222000122-1-000020/2026");

    expect(comprasGov?.portalDisputa).toBe("Compras.gov.br");
    expect(licitarDig?.portalDisputa).toBe("Licitar Digital");
  });

  it("3. Extração de itens, API /itens-certame e Raio-X IA retornam regrasDisputaDetectadas a partir do PDF e URL de origem", async () => {
    const pdfEdital = await criarPdfComTexto(
      [
        "EDITAL DE PREGÃO ELETRÔNICO Nº 046/2026 - UASG 986531",
        "Portal Eletrônico: https://licitardigital.com.br/sessao/986531",
        "Modo de Disputa: Aberto e Fechado",
        "Critério de Julgamento: Menor Preço",
        "O intervalo mínimo de diferença entre os lances será de R$ 5,00.",
        "Item 1 | Notebook Corporativo i7 | UN | 10",
      ].join("\n"),
    );

    const lic = insertInMemoryLicitacao({
      idPncp: "33333333000133-1-000046/2026",
      numeroControlePNCP: "33333333000133-1-000046/2026",
      numeroEdital: "PE 046/2026",
      orgaoNome: "Prefeitura Teste Regras",
      orgaoCnpj: "33333333000133",
      uf: "GO",
      municipio: "Goiânia",
      esfera: "M",
      poder: "E",
      modalidade: "Pregão Eletrônico",
      modalidadeCodigo: 6,
      portalDisputa: "PNCP",
      linkSistemaOrigem: "https://licitardigital.com.br/edital/46",
      miniResumo: "Aquisição de Notebooks",
      resumo: "Aquisição de Notebooks Corporativos",
      valorEstimado: 80000,
      dataAbertura: new Date("2026-12-15T10:00:00Z"),
      dataEncerramentoProposta: new Date("2026-12-15T10:00:00Z"),
      dataPublicacaoPncp: new Date("2026-11-01T10:00:00Z"),
      dataUltimaAtualizacao: new Date("2026-11-01T10:00:00Z"),
      status: "ACEITA",
      parecerIA: "GO",
      justificativaIA: null,
      tipoSistemaCodigo: "TI_INFORMATICA",
      segmentoMacro: "INFORMATICA",
      subcategorias: [],
      atestadosExigidos: [],
      motivoRecusa: null,
      quantidadeLotes: 1,
      loteUnico: false,
      precoPorLote: false,
      isPresencial: false,
      distanciaGoianiaKm: null,
      hashCritico: "hash-issue46-3",
      valorArrematado: null,
      responsavelId: null,
    } as any);

    insertInMemoryLicitacaoArquivo(lic.id, {
      id: "arq_edital_46",
      nome: "Edital_PE_046_2026.pdf",
      r2Url: "https://pncp.gov.br/arquivos/edital_46.pdf",
      mimeType: "application/pdf",
    });

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes("edital_46.pdf")) {
        return {
          ok: true,
          headers: new Headers({ "content-type": "application/pdf" }),
          arrayBuffer: async () =>
            pdfEdital.buffer.slice(pdfEdital.byteOffset, pdfEdital.byteOffset + pdfEdital.byteLength),
        };
      }
      if (u.includes("/itens?")) {
        return {
          ok: true,
          json: async () => [
            {
              numeroItem: 1,
              descricao: "Notebook Corporativo i7",
              quantidade: 10,
              unidadeMedida: "UN",
              valorUnitarioEstimado: 5000,
            },
          ],
        };
      }
      return { ok: true, json: async () => [] };
    }) as any;

    const resultadoExtracao = await extrairItensCertameCompleto(lic, {
      forcarVarreduraDocumentos: true,
    });

    expect((resultadoExtracao as any).regrasDisputaDetectadas).toMatchObject({
      portal: "Licitar Digital",
      modoDisputaEdital: "ABERTO_FECHADO",
      intervaloMinimoLances: "R$ 5,00",
      criterioJulgamento: "Menor Preço",
      uasg: "986531",
    });

    const relatorioHibrido = await construirRelatorioParticipacaoHibrido(lic.id, {});
    expect(relatorioHibrido.relatorio.regrasDisputa).toMatchObject({
      portal: "Licitar Digital",
      modoDisputaEdital: "ABERTO_FECHADO",
      intervaloMinimoLances: "R$ 5,00",
      uasg: "986531",
    });

    getServerSessionMock.mockResolvedValue({
      user: { id: "usr_46", name: "Tester 46", role: "DIRETORIA", activeTenantId: "tenant_46" },
    });
    inMemoryTenants.set("tenant_46", {
      id: "tenant_46",
      cnpj: "33333333000133",
      razaoSocial: "Empresa 46 LTDA",
      plano: "PRO",
      billingStatus: "ATIVO",
      maxCnpjs: 2,
      maxUsers: 2,
      ativo: true,
      criadoEm: new Date(),
      updatedAt: new Date(),
    });

    const resApi = await getItensCertame(
      new Request(`http://localhost/api/oportunidades/${lic.id}/itens-certame?refresh=true`, {
        method: "GET",
      }),
      { params: Promise.resolve({ id: lic.id }) },
    );
    expect(resApi.status).toBe(200);
    const jsonApi = await resApi.json();
    expect(jsonApi.regrasDisputaDetectadas).toMatchObject({
      portal: "Licitar Digital",
      modoDisputaEdital: "ABERTO_FECHADO",
      intervaloMinimoLances: "R$ 5,00",
    });
  });

  it("4. Aba ⚡ Disputa pré-preenche regras quando não há disputaConfig manual salva, mas nunca sobrescreve edição manual existente sem clique explícito", async () => {
    const setupFetch = (comDisputaSalva: boolean) => {
      global.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input.toString();
        if (url.includes("/notas")) {
          return new Response(JSON.stringify({ ok: true, notas: [] }), { status: 200 });
        }
        if (url.includes("/analise-ia")) {
          return new Response(JSON.stringify({ ok: true, analises: [], cota: null }), { status: 200 });
        }
        if (url.includes("/api/usuarios")) {
          return new Response(JSON.stringify({ ok: true, usuarios: [] }), { status: 200 });
        }
        if (url.includes("/api/configuracoes/empresa")) {
          return new Response(JSON.stringify({ ok: true, empresa: {} }), { status: 200 });
        }
        if (url.includes("/api/oportunidades/opp_46_ui")) {
          return new Response(
            JSON.stringify({
              ok: true,
              oportunidade: {
                id: "opp_46_ui",
                idPncp: "33333333000133-1-000046/2026",
                numeroEdital: "PE 046/2026",
                orgaoNome: "Prefeitura UI Issue 46",
                orgaoCnpj: "33333333000133",
                municipio: "Goiânia",
                uf: "GO",
                modalidade: "Pregão Eletrônico",
                portalDisputa: "Portal de Compras Públicas",
                linkSistemaOrigem: "https://www.portaldecompraspublicas.com.br/processo/46",
                valorEstimado: 45000,
                dataAbertura: "2026-12-15T10:00:00.000Z",
                miniResumo: "Aquisição UI 46",
                resumo: "Aquisição de equipamentos UI 46",
                status: "ACEITA",
                isPresencial: false,
                arquivos: [],
                repositoriosSimilares: [],
                analisesIA: [],
                regrasDisputaDetectadas: {
                  portal: "Portal de Compras Públicas",
                  modoDisputaEdital: "ABERTO_FECHADO",
                  intervaloMinimoLances: "R$ 5,00",
                  criterioJulgamento: "Menor Preço",
                  identificadorSala: "UASG 158123",
                  uasg: "158123",
                  linkSessao: "https://www.portaldecompraspublicas.com.br/processo/46",
                  fontes: ["Edital PDF", "Link de Origem"],
                  confianca: "ALTA",
                },
                calculadoraDados: {
                  parametrosPadrao: {
                    impostosPercentual: 12,
                    bdiPercentual: 25,
                    margemMinimaPercentual: 10,
                    margemAlvoPercentual: 20,
                  },
                  itens: [
                    {
                      id: "item_ui_46",
                      numeroItem: "01",
                      descricao: "Notebook i7",
                      unidade: "UN",
                      quantidade: 2,
                      custoUnitario: 100,
                      freteUnitario: 0,
                      outrosCustosUnitario: 0,
                      impostosPercentual: 12,
                      bdiPercentual: 25,
                      margemMinimaPercentual: 10,
                      margemAlvoPercentual: 20,
                    },
                  ],
                  ...(comDisputaSalva
                    ? {
                        disputaConfig: {
                          portal: "BBMNet",
                          identificadorSala: "Sala Manual 99",
                          modoDisputaEdital: "FECHADO_ABERTO",
                          intervaloMinimoLances: "R$ 10,00",
                          origemPrecos: "CALCULADORA",
                          statusGeral: "CONFIGURADA",
                          pausaEmergencia: false,
                          tempoRespostaSegundos: 3,
                          segundosFinaisSniper: 10,
                          regrasItens: [],
                        },
                      }
                    : {}),
                },
              },
            }),
            { status: 200 },
          );
        }
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      });
    };

    // Caso A: Sem disputaConfig prévia -> pré-preenche com regras detectadas
    setupFetch(false);
    const { unmount } = render(<OportunidadesDetalhePage params={{ id: "opp_46_ui" }} />);
    await screen.findByTestId("dossie-header");
    fireEvent.click(screen.getByTestId("tab-disputa"));

    await waitFor(() => {
      const portalEl = document.getElementById("select-portal-disputa") as HTMLSelectElement;
      const modoEl = document.getElementById("select-modo-disputa-edital") as HTMLSelectElement;
      const intEl = document.getElementById("input-intervalo-minimo-lances") as HTMLInputElement;
      const salaEl = document.getElementById("input-identificador-sala") as HTMLInputElement;
      expect(portalEl.value).toBe("Portal de Compras Públicas");
      expect(modoEl.value).toBe("ABERTO_FECHADO");
      expect(intEl.value).toBe("R$ 5,00");
      expect(salaEl.value).toContain("158123");
    });
    expect(screen.getByTestId("disputa-regras-detectadas-banner")).toBeInTheDocument();
    unmount();

    // Caso B: Com disputaConfig manual salva -> preserva valores manuais e aplica somente após clique explícito
    setupFetch(true);
    render(<OportunidadesDetalhePage params={{ id: "opp_46_ui" }} />);
    await screen.findByTestId("dossie-header");
    fireEvent.click(screen.getByTestId("tab-disputa"));

    const btnAplicar = await screen.findByTestId("btn-aplicar-regras-edital");
    expect((document.getElementById("select-portal-disputa") as HTMLSelectElement).value).toBe("BBMNet");
    expect((document.getElementById("select-modo-disputa-edital") as HTMLSelectElement).value).toBe(
      "FECHADO_ABERTO",
    );
    expect((document.getElementById("input-intervalo-minimo-lances") as HTMLInputElement).value).toBe(
      "R$ 10,00",
    );

    fireEvent.click(btnAplicar);
    await waitFor(() => {
      expect((document.getElementById("select-portal-disputa") as HTMLSelectElement).value).toBe(
        "Portal de Compras Públicas",
      );
      expect((document.getElementById("select-modo-disputa-edital") as HTMLSelectElement).value).toBe(
        "ABERTO_FECHADO",
      );
      expect((document.getElementById("input-intervalo-minimo-lances") as HTMLInputElement).value).toBe(
        "R$ 5,00",
      );
    });
  });

  it("5. /robo-de-lances remove controles visuais sem efeito (Pausar Motor Global, Randômico, Decremento Global) e explica ambiente Sandbox", async () => {
    render(<RoboDeLancesPage />);

    expect(screen.queryByRole("button", { name: /Pausar Motor Global/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/● Motor em Tempo Real ATIVO/i)).not.toBeInTheDocument();
    expect(document.getElementById("select-decremento-padrao")).toBeNull();
    expect(document.getElementById("select-tempo-disparo")).toBeNull();
    expect(screen.queryByText(/Randômico/i)).not.toBeInTheDocument();

    expect(screen.getByTestId("robo-lances-sandbox-aviso")).toBeInTheDocument();
    expect(document.getElementById("select-empate-me")).toBeInTheDocument();

    // Verifica enriquecimento de /api/robo-de-lances/salas com portal real detectado
    const licSala = insertInMemoryLicitacao({
      idPncp: "44444444000144-1-000046/2026",
      numeroControlePNCP: "44444444000144-1-000046/2026",
      numeroEdital: "PE 446/2026",
      orgaoNome: "Órgão Sala Enriquecida",
      orgaoCnpj: "44444444000144",
      uf: "SP",
      municipio: "Campinas",
      esfera: "M",
      poder: "E",
      modalidade: "Pregão Eletrônico",
      modalidadeCodigo: 6,
      portalDisputa: "PNCP",
      linkSistemaOrigem: "https://licitardigital.com.br/sala/446",
      miniResumo: "Licença de Software",
      resumo: "Licença de Software Corporativo",
      valorEstimado: 100000,
      dataAbertura: new Date("2026-12-20T10:00:00Z"),
      dataEncerramentoProposta: new Date("2026-12-20T10:00:00Z"),
      dataPublicacaoPncp: new Date("2026-11-01T10:00:00Z"),
      dataUltimaAtualizacao: new Date("2026-11-01T10:00:00Z"),
      status: "EM_DISPUTA",
      parecerIA: "GO",
      justificativaIA: null,
      tipoSistemaCodigo: "TI_INFORMATICA",
      segmentoMacro: "INFORMATICA",
      subcategorias: [],
      atestadosExigidos: [],
      motivoRecusa: null,
      quantidadeLotes: 1,
      loteUnico: false,
      precoPorLote: false,
      isPresencial: false,
      distanciaGoianiaKm: null,
      hashCritico: "hash-sala-446",
      valorArrematado: null,
      responsavelId: null,
    } as any);

    const resSalas = await getSalasRobo(
      new Request("http://localhost/api/robo-de-lances/salas?tenantId=tenant-default"),
    );
    expect(resSalas.status).toBe(200);
    const jsonSalas = await resSalas.json();
    const salaEncontrada = jsonSalas.salas.find((s: any) => s.id === licSala.id);
    expect(salaEncontrada).toBeDefined();
    expect(salaEncontrada.portal).toBe("Licitar Digital");
  });
});

