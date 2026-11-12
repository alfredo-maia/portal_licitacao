import React from "react";
import { unlink } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import ConfiguracoesPage from "@/app/configuracoes/page";
import { AppShell } from "@/components/shell/app-shell";
import { ThemeProvider } from "@/providers/theme-provider";
import {
  resetInMemoryLicitacoes,
  updateInMemoryConfiguracaoEmpresa,
  insertInMemoryLicitacao,
} from "@/server/services/licitacoes-store";
import {
  inMemoryTenants,
  inMemoryTenantUsers,
  resetInMemoryTenantStorage,
} from "@/server/services/tenant.service";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
  usePathname: () => "/dashboard",
}));

vi.mock("next-auth/react", () => ({
  signOut: vi.fn(),
  useSession: vi.fn().mockReturnValue({
    data: {
      user: {
        id: "usr_bloco1_1",
        name: "Vítor Henrique",
        email: "vitor@empresa.com.br",
        role: "DIRETORIA",
        cnpj: "12.345.678/0001-90",
        plano: "PRO",
        activeTenantId: "tenant_bloco1",
      },
    },
    status: "authenticated",
  }),
}));

const { getServerSessionMock } = vi.hoisted(() => ({
  getServerSessionMock: vi.fn(),
}));

vi.mock("next-auth/next", () => ({
  getServerSession: getServerSessionMock,
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: () => ({ value: "tenant_bloco1" }),
  })),
}));

const TEXTO_CARTAO_CNPJ_RFB = `
REPÚBLICA FEDERATIVA DO BRASIL
CADASTRO NACIONAL DA PESSOA JURÍDICA

NÚMERO DE INSCRIÇÃO
12.345.678/0001-90
MATRIZ

COMPROVANTE DE INSCRIÇÃO E DE SITUAÇÃO CADASTRAL

DATA DE ABERTURA
10/05/2018

NOME EMPRESARIAL
APONTA COMERCIO E SERVICOS DE ALIMENTOS LTDA

TÍTULO DO ESTABELECIMENTO (NOME DE FANTASIA)
APONTA ALIMENTOS

PORTE
EPP

CÓDIGO E DESCRIÇÃO DA ATIVIDADE ECONÔMICA PRINCIPAL
62.01-5-01 - Desenvolvimento de programas de computador sob encomenda

CÓDIGO E DESCRIÇÃO DAS ATIVIDADES ECONÔMICAS SECUNDÁRIAS
46.39-7-01 - Comércio atacadista de produtos alimentícios em geral
47.11-3-02 - Comércio varejista de mercadorias em geral, com predominância de produtos alimentícios - supermercados
46.47-8-01 - Comércio atacadista de artigos de escritório e de papelaria

CÓDIGO E DESCRIÇÃO DA NATUREZA JURÍDICA
206-2 - Sociedade Empresária Limitada

LOGRADOURO
AV REPUBLICA DO LIBANO

NÚMERO
1200

COMPLEMENTO
SALA 402 EDIFICIO CENTRO

CEP
74.115-030

BAIRRO/DISTRITO
SETOR OESTE

MUNICÍPIO
GOIANIA

UF
GO

SITUAÇÃO CADASTRAL
ATIVA
`;

const createdUploadFiles: string[] = [];

describe("Bloco 1 (Issue #38) — Header Trial Badge, Cartão CNPJ, CNAEs Secundários, IA e Suporte FAB", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cleanup();
    resetInMemoryLicitacoes();
    resetInMemoryTenantStorage();

    inMemoryTenants.set("tenant_bloco1", {
      id: "tenant_bloco1",
      cnpj: "12345678000190",
      razaoSocial: "EMPRESA ANTERIOR LTDA",
      plano: "PRO",
      billingStatus: "TRIAL",
      maxCnpjs: 2,
      maxUsers: 2,
      ativo: true,
      segmentos: ["INFORMATICA"],
      subsegmentos: [],
      ufs: ["GO"],
      brasilInteiro: false,
      criadoEm: new Date(),
      updatedAt: new Date(),
    });
    inMemoryTenantUsers.push({
      id: "tu_b1",
      tenantId: "tenant_bloco1",
      userId: "usr_bloco1_1",
      userEmail: "vitor@empresa.com.br",
      userName: "Vítor Henrique",
      role: "TITULAR",
      ativo: true,
      criadoEm: new Date(),
    });

    updateInMemoryConfiguracaoEmpresa(
      {
        id: "cfg_tenant_bloco1",
        tenantId: "tenant_bloco1",
        razaoSocial: "EMPRESA ANTERIOR LTDA",
        nomeFantasia: "ANTERIOR",
        cnpj: "12.345.678/0001-90",
        inscricaoEstadual: "10.999.888-7",
        inscricaoMunicipal: "554433-2",
        cnae: "6201-5/01 - Desenvolvimento de programas de computador sob encomenda",
        cnaesSecundarios: [],
        segmentos: ["INFORMATICA"],
        ufs: ["GO"],
        brasilInteiro: false,
      },
      "tenant_bloco1",
    );

    getServerSessionMock.mockResolvedValue({
      user: {
        id: "usr_bloco1_1",
        name: "Vítor Henrique",
        email: "vitor@empresa.com.br",
        role: "DIRETORIA",
        activeTenantId: "tenant_bloco1",
      },
    });
  });

  afterEach(async () => {
    cleanup();
    vi.restoreAllMocks();
    while (createdUploadFiles.length > 0) {
      const rel = createdUploadFiles.pop();
      if (rel) {
        const cleanRel = rel.replace(/^\/+/, "");
        await unlink(join(process.cwd(), "public", cleanRel)).catch(() => undefined);
      }
    }
  });

  it("1. AppShell exibe badge clicável 'Grátis - Pro • X dias de teste' para TRIAL e oculta para ATIVO", async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/planos/status")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              ok: true,
              billingStatus: "TRIAL",
              plano: "PRO",
              diasRestantesTrial: 12,
              isReadOnly: false,
              inGracePeriod: false,
            }),
        });
      }
      if (url.includes("/api/configuracoes/tenants")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, tenants: [] }) });
      }
      if (url.includes("/api/notificacoes")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, notificacoes: [], naoLidas: 0 }) });
      }
      if (url.includes("/api/suporte/tickets")) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, tickets: [] }) });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) });
    });

    render(
      <ThemeProvider>
        <AppShell>
          <div>Conteúdo</div>
        </AppShell>
      </ThemeProvider>,
    );

    const badge = await screen.findByTestId("header-trial-badge");
    expect(badge.textContent).toMatch(/Grátis - Pro/i);
    expect(badge.textContent).toMatch(/12 dias de teste/i);
    expect(badge.getAttribute("data-severity")).toBe("safe");

    fireEvent.click(badge);
    expect(pushMock).toHaveBeenCalledWith("/planos");
  });

  it("2. AppShell usa '1 dia de teste' (alerta) quando resta 1 dia e oculta badge quando ATIVO", async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/planos/status")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              ok: true,
              billingStatus: "TRIAL",
              plano: "PRO",
              diasRestantesTrial: 1,
              isReadOnly: false,
              inGracePeriod: false,
            }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, tickets: [], tenants: [], notificacoes: [] }) });
    });

    const { unmount } = render(
      <ThemeProvider>
        <AppShell>
          <div>Conteúdo</div>
        </AppShell>
      </ThemeProvider>,
    );

    const badge = await screen.findByTestId("header-trial-badge");
    expect(badge.textContent).toMatch(/Grátis - Pro • 1 dia de teste/i);
    expect(badge.getAttribute("data-severity")).toBe("warning");
    unmount();

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/planos/status")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              ok: true,
              billingStatus: "ATIVO",
              plano: "PRO",
              diasRestantesTrial: 0,
              isReadOnly: false,
              inGracePeriod: false,
            }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, tickets: [], tenants: [], notificacoes: [] }) });
    });

    render(
      <ThemeProvider>
        <AppShell>
          <div>Conteúdo</div>
        </AppShell>
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(screen.queryByTestId("header-trial-badge")).not.toBeInTheDocument();
    });
  });

  it("3. Suporte Flutuante (FAB) no canto inferior direito abre modal com abertura de chamado e gera PROT-AAAAMM-XXXX", async () => {
    const ticketsCreated: any[] = [];
    global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes("/api/suporte/tickets") && init?.method === "POST") {
        const novo = {
          id: "tkt_1",
          protocolo: "PROT-202611-0001",
          tenantId: "tenant_bloco1",
          userId: "usr_bloco1_1",
          autorNome: "Vítor Henrique",
          autorEmail: "vitor@empresa.com.br",
          autorTelefone: null,
          categoria: "PROBLEMA_TECNICO",
          urgencia: "ALTA",
          assunto: "Erro ao anexar Cartão CNPJ",
          status: "ABERTO",
          criadoEm: new Date().toISOString(),
          atualizadoEm: new Date().toISOString(),
          concluidoEm: null,
          mensagens: [
            {
              id: "msg_1",
              ticketId: "tkt_1",
              autorId: "usr_bloco1_1",
              autorNome: "Vítor Henrique",
              autorTipo: "CLIENTE",
              mensagem: "Preciso de ajuda para validar o arquivo.",
              criadoEm: new Date().toISOString(),
            },
          ],
        };
        ticketsCreated.push(novo);
        return Promise.resolve({
          ok: true,
          status: 201,
          json: () => Promise.resolve({ ok: true, ticket: novo }),
        });
      }
      if (url.includes("/api/suporte/tickets")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ ok: true, tickets: ticketsCreated }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, tenants: [], notificacoes: [] }) });
    });

    render(
      <ThemeProvider>
        <AppShell>
          <div>Conteúdo Principal</div>
        </AppShell>
      </ThemeProvider>,
    );

    const fab = screen.getByTestId("support-fab-btn");
    expect(fab).toBeInTheDocument();
    expect(fab.style.position).toBe("fixed");

    fireEvent.click(fab);

    expect(await screen.findByText(/Central de Suporte/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Assunto/i), {
      target: { value: "Erro ao anexar Cartão CNPJ" },
    });
    fireEvent.change(screen.getByLabelText(/Descrição/i), {
      target: { value: "Preciso de ajuda para validar o arquivo." },
    });

    fireEvent.click(screen.getByRole("button", { name: /Enviar Chamado/i }));

    await waitFor(() => {
      expect(screen.getAllByText(/PROT-202611-0001/).length).toBeGreaterThan(0);
    });
  });

  it("4. Backend de Suporte (suporte.service.ts) cria ticket PROT-AAAAMM-XXXX e isola por tenant/usuário mesmo sem chaves externas", async () => {
    const {
      criarTicketSuporte,
      listarTicketsSuporte,
      adicionarMensagemTicketSuporte,
      resetInMemorySuporteStore,
    } = await import("@/server/services/suporte.service");

    resetInMemorySuporteStore();

    const ticket = await criarTicketSuporte(
      {
        categoria: "DUVIDA",
        urgencia: "MEDIA",
        assunto: "Dúvida sobre cota de IA",
        descricao: "Como funciona a contagem de análises no Trial Pro?",
      },
      {
        id: "usr_bloco1_1",
        name: "Vítor Henrique",
        email: "vitor@empresa.com.br",
        tenantId: "tenant_bloco1",
      },
    );

    expect(ticket.protocolo).toMatch(/^PROT-\d{6}-\d{4}$/);
    expect(ticket.status).toBe("ABERTO");
    expect(ticket.mensagens).toHaveLength(1);

    const updated = await adicionarMensagemTicketSuporte(
      ticket.id,
      { mensagem: "Segue detalhe adicional do edital." },
      {
        id: "usr_bloco1_1",
        name: "Vítor Henrique",
        email: "vitor@empresa.com.br",
        tenantId: "tenant_bloco1",
      },
    );
    expect(updated?.mensagens).toHaveLength(2);

    const listaTenantA = await listarTicketsSuporte("tenant_bloco1", "usr_bloco1_1");
    expect(listaTenantA.map((t) => t.id)).toContain(ticket.id);

    const listaOutroTenant = await listarTicketsSuporte("tenant_outro", "usr_outro");
    expect(listaOutroTenant).toHaveLength(0);
  });

  it("5. Extrator de Cartão CNPJ (Camada 1 RFB) extrai Seções 1 e 2 completas e múltiplos CNAEs Secundários", async () => {
    const { extrairDadosCartaoCnpjDeTexto } = await import(
      "@/server/services/extrator-cartao-cnpj.service"
    );

    const extraido = extrairDadosCartaoCnpjDeTexto(TEXTO_CARTAO_CNPJ_RFB);

    expect(extraido).not.toBeNull();
    expect(extraido!.cnpj).toBe("12.345.678/0001-90");
    expect(extraido!.razaoSocial).toBe("APONTA COMERCIO E SERVICOS DE ALIMENTOS LTDA");
    expect(extraido!.nomeFantasia).toBe("APONTA ALIMENTOS");
    expect(extraido!.cnaePrincipal).toContain("6201-5/01");
    expect(extraido!.cnaesSecundarios.length).toBe(3);
    expect(extraido!.cnaesSecundarios[0]).toContain("4639-7/01");
    expect(extraido!.cnaesSecundarios[1]).toContain("4711-3/02");
    expect(extraido!.cnaesSecundarios[2]).toContain("4647-8/01");
    expect(extraido!.endereco).toContain("AV REPUBLICA DO LIBANO");
    expect(extraido!.numero).toBe("1200");
    expect(extraido!.complemento).toContain("SALA 402");
    expect(extraido!.bairro).toBe("SETOR OESTE");
    expect(extraido!.cidade).toBe("GOIANIA");
    expect(extraido!.uf).toBe("GO");
    expect(extraido!.cep).toBe("74115-030");
  });

  it("6. Extrator de Cartão CNPJ aciona IA Multimodal quando documento é imagem/escaneado", async () => {
    const llmMod = await import("@/server/services/llm-multimodal.service");
    const spyLlm = vi.spyOn(llmMod, "chamarLlmJsonMultimodal").mockResolvedValueOnce({
      provider: "LLM_GEMINI",
      model: "gemini-2.5-flash",
      data: {
        cnpj: "80.445.611/0001-82",
        razaoSocial: "PAO NOSSO PANIFICADORA LTDA",
        nomeFantasia: "PAO NOSSO",
        cnaePrincipal: "1091-1/02 - Fabricação de produtos de padaria",
        cnaesSecundarios: [
          "4639-7/01 - Comércio atacadista de produtos alimentícios em geral",
          "4721-1/02 - Padaria e confeitaria com predominância de revenda",
        ],
        cep: "74000-100",
        endereco: "RUA 10",
        numero: "45",
        complemento: "QUADRA 2",
        bairro: "CENTRO",
        cidade: "GOIANIA",
        uf: "GO",
      },
    });

    const { extrairDadosCartaoCnpjDeBuffer } = await import(
      "@/server/services/extrator-cartao-cnpj.service"
    );

    // Buffer simulando PNG válido
    const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
    const res = await extrairDadosCartaoCnpjDeBuffer({
      buffer: pngMagic,
      nomeArquivo: "cartao-cnpj.png",
      mimeType: "image/png",
    });

    expect(spyLlm).toHaveBeenCalledTimes(1);
    expect(res.razaoSocial).toBe("PAO NOSSO PANIFICADORA LTDA");
    expect(res.cnpj).toBe("80.445.611/0001-82");
    expect(res.cnaesSecundarios).toHaveLength(2);
    expect(res.origemExtracao).toBe("LLM_MULTIMODAL");
  });

  it("7. POST /api/configuracoes/empresa/cartao-cnpj preenche e salva Seções 1 e 2 preservando IE/IM e salva em /documentacao sem validade", async () => {
    const llmMod = await import("@/server/services/llm-multimodal.service");
    vi.spyOn(llmMod, "chamarLlmJsonMultimodal").mockResolvedValueOnce({
      provider: "LLM_GEMINI",
      model: "gemini-2.5-flash",
      data: {
        cnpj: "12.345.678/0001-90",
        razaoSocial: "APONTA COMERCIO E SERVICOS DE ALIMENTOS LTDA",
        nomeFantasia: "APONTA ALIMENTOS",
        cnaePrincipal: "6201-5/01 - Desenvolvimento de programas de computador sob encomenda",
        cnaesSecundarios: ["4639-7/01 - Comércio atacadista de produtos alimentícios em geral"],
        cep: "74115-030",
        endereco: "AV REPUBLICA DO LIBANO",
        numero: "1200",
        complemento: "SALA 402",
        bairro: "SETOR OESTE",
        cidade: "GOIANIA",
        uf: "GO",
      },
    });

    const { POST } = await import("@/app/api/configuracoes/empresa/cartao-cnpj/route");
    const { listarDocumentos } = await import("@/server/services/documentos.service");

    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
    const mockFile = {
      name: "cartao_cnpj.png",
      type: "image/png",
      size: pngBytes.byteLength,
      arrayBuffer: async () => pngBytes.buffer.slice(pngBytes.byteOffset, pngBytes.byteOffset + pngBytes.byteLength),
    };
    const fields = new Map<string, any>([
      ["file", mockFile],
      ["modo", "atualizar_ativo"],
    ]);
    const req = {
      url: "http://localhost/api/configuracoes/empresa/cartao-cnpj",
      method: "POST",
      formData: async () => ({
        get: (k: string) => fields.get(k) ?? null,
      }),
    } as unknown as Request;

    const res = await POST(req);
    const json = await res.json();
    if (json.documentoCartaoCnpj?.arquivoUrl) {
      createdUploadFiles.push(json.documentoCartaoCnpj.arquivoUrl);
    }

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.empresa.razaoSocial).toBe("APONTA COMERCIO E SERVICOS DE ALIMENTOS LTDA");
    expect(json.empresa.nomeFantasia).toBe("APONTA ALIMENTOS");
    expect(json.empresa.cnaesSecundarios).toEqual([
      "4639-7/01 - Comércio atacadista de produtos alimentícios em geral",
    ]);
    // IE e IM preservados!
    expect(json.empresa.inscricaoEstadual).toBe("10.999.888-7");
    expect(json.empresa.inscricaoMunicipal).toBe("554433-2");
    expect(json.empresa.endereco).toBe("AV REPUBLICA DO LIBANO");
    expect(json.empresa.numero).toBe("1200");
    expect(json.empresa.bairro).toBe("SETOR OESTE");
    expect(json.empresa.cidade).toBe("GOIANIA");
    expect(json.empresa.uf).toBe("GO");

    // Verifica documento salvo no cofre /documentacao sem data de validade
    expect(json.documentoCartaoCnpj).toBeDefined();
    expect(json.documentoCartaoCnpj.categoria).toBe("JURIDICA");
    expect(json.documentoCartaoCnpj.tipo).toBe("Cartão CNPJ");
    expect(json.documentoCartaoCnpj.semValidade).toBe(true);
    expect(json.documentoCartaoCnpj.dataVencimento).toBeNull();
    expect(json.documentoCartaoCnpj.validacaoStatus).toBe("VALIDADO");

    const listaDocs = await listarDocumentos({ tenantId: "tenant_bloco1", pageSize: 50 });
    const salvo = listaDocs.documentos.find((d) => d.tipo === "Cartão CNPJ");
    expect(salvo).toBeDefined();
    expect(salvo!.semValidade).toBe(true);
    expect(salvo!.possuiAnexo).toBe(true);
  });

  it("8. Relatório IA reconhece CNAEs Secundários da empresa como compatíveis e contabiliza Cartão CNPJ em /documentacao", async () => {
    const { criarDocumento } = await import("@/server/services/documentos.service");
    const {
      avaliarCompatibilidadeCnaesComEdital,
      construirRelatorioParticipacaoHibrido,
    } = await import("@/server/services/analise-ia-participacao.service");

    const compat = avaliarCompatibilidadeCnaesComEdital({
      cnaePrincipal: "6201-5/01 - Desenvolvimento de programas de computador sob encomenda",
      cnaesSecundarios: ["4639-7/01 - Comércio atacadista de produtos alimentícios em geral"],
      objetoEdital: "Aquisição de gêneros alimentícios e merenda escolar",
      segmentoEdital: "ALIMENTACAO",
    });

    expect(compat.compativel).toBe(true);
    expect(compat.origemMatch).toBe("SECUNDARIO");
    expect(compat.cnaesCompativeis[0]).toContain("4639-7/01");

    // Empresa configurada com segmento INFORMATICA, mas CNAE secundário alimentício!
    updateInMemoryConfiguracaoEmpresa(
      {
        id: "cfg_tenant_bloco1",
        tenantId: "tenant_bloco1",
        razaoSocial: "APONTA COMERCIO E SERVICOS DE ALIMENTOS LTDA",
        cnpj: "12.345.678/0001-90",
        cnae: "6201-5/01 - Desenvolvimento de programas de computador sob encomenda",
        cnaesSecundarios: ["4639-7/01 - Comércio atacadista de produtos alimentícios em geral"],
        segmentos: ["INFORMATICA"],
        ufs: ["GO"],
        brasilInteiro: true,
      },
      "tenant_bloco1",
    );

    await criarDocumento(
      {
        nome: "Cartão CNPJ (Comprovante de Inscrição e Situação Cadastral)",
        categoria: "JURIDICA",
        tipo: "Cartão CNPJ",
        orgaoEmissor: "Receita Federal do Brasil",
        semValidade: true,
        dataVencimento: null,
        arquivoUrl: "/uploads/documentos/cartao_cnpj.pdf",
        arquivoNome: "cartao_cnpj.pdf",
        validacaoStatus: "VALIDADO",
      },
      "usr_bloco1_1",
      "tenant_bloco1",
    );

    const lic = insertInMemoryLicitacao({
      idPncp: "pncp-b1-alimentos",
      numeroControlePNCP: "pncp-b1-alimentos",
      numeroEdital: "PE 010/2026",
      orgaoNome: "Prefeitura Municipal de Piedade",
      orgaoCnpj: "46634143000109",
      uf: "SP",
      municipio: "Piedade",
      esfera: "M",
      poder: "E",
      modalidade: "Pregão Eletrônico",
      modalidadeCodigo: 6,
      portalDisputa: "BLL Compras",
      miniResumo: "Aquisição de gêneros alimentícios",
      resumo: "Aquisição de gêneros alimentícios e biscoitos para merenda escolar",
      valorEstimado: 150000,
      dataAbertura: new Date(Date.now() + 7 * 86400000),
      dataEncerramentoProposta: new Date(Date.now() + 7 * 86400000),
      dataPublicacaoPncp: new Date(),
      dataUltimaAtualizacao: new Date(),
      status: "PENDENTE",
      parecerIA: "GO",
      justificativaIA: null,
      tipoSistemaCodigo: "PNCP",
      segmentoMacro: "ALIMENTACAO",
      subcategorias: [],
      atestadosExigidos: [],
      motivoRecusa: null,
      quantidadeLotes: 1,
      loteUnico: false,
      precoPorLote: false,
      isPresencial: false,
      distanciaGoianiaKm: null,
      linkPncp: null,
      linkSistemaOrigem: null,
      hashCritico: "hash_b1_alimentos",
      valorArrematado: null,
      responsavelId: null,
    });

    const analise = await construirRelatorioParticipacaoHibrido(
      lic.id,
      {},
      "tenant_bloco1",
    );

    expect(analise.relatorio.aderenciaEscopo?.compativel).toBe(true);
    expect(analise.relatorio.aderenciaEscopo?.observacao).toMatch(/4639-7\/01|Secund[áa]ri/i);
    expect(
      analise.relatorio.checklistDocumental?.some(
        (c) => c.documento.includes("Cartão CNPJ") && c.status === "REGULAR",
      ),
    ).toBe(true);
  });

  it("9. Tela /configuracoes exibe botões Upload Cartão CNPJ ao lado de Adicionar CNPJ e Modal de CNAEs Secundários", async () => {
    global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes("/api/auth/session")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              user: {
                id: "usr_bloco1_1",
                name: "Vítor Henrique",
                email: "vitor@empresa.com.br",
                role: "DIRETORIA",
                plano: "PRO",
                billingStatus: "TRIAL",
              },
            }),
        });
      }
      if (url.includes("/api/configuracoes/empresa/cartao-cnpj") && init?.method === "POST") {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              ok: true,
              extraido: {
                cnpj: "12.345.678/0001-90",
                razaoSocial: "NOVA RAZAO IMPORTADA LTDA",
                nomeFantasia: "NOVA IMPORTADA",
                cnaePrincipal: "4639-7/01 - Comércio atacadista de produtos alimentícios em geral",
                cnaesSecundarios: ["4711-3/02 - Comércio varejista de mercadorias em geral"],
                endereco: "RUA NOVA",
                numero: "99",
                bairro: "CENTRO",
                cidade: "GOIANIA",
                uf: "GO",
                cep: "74000-000",
                origemExtracao: "REGEX_RFB",
              },
              empresa: {
                id: "cfg_tenant_bloco1",
                razaoSocial: "NOVA RAZAO IMPORTADA LTDA",
                nomeFantasia: "NOVA IMPORTADA",
                cnpj: "12.345.678/0001-90",
                inscricaoEstadual: "10.123.456-7",
                inscricaoMunicipal: "98765-4",
                cnae: "4639-7/01 - Comércio atacadista de produtos alimentícios em geral",
                cnaesSecundarios: ["4711-3/02 - Comércio varejista de mercadorias em geral"],
                endereco: "RUA NOVA",
                numero: "99",
                complemento: "",
                bairro: "CENTRO",
                cidade: "GOIANIA",
                uf: "GO",
                cep: "74000-000",
              },
            }),
        });
      }
      if (url.includes("/api/configuracoes/empresa")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              ok: true,
              empresa: {
                id: "cfg_tenant_bloco1",
                razaoSocial: "EMPRESA ANTERIOR LTDA",
                cnpj: "12.345.678/0001-90",
                inscricaoEstadual: "10.123.456-7",
                inscricaoMunicipal: "98765-4",
                cnae: "6201-5/01",
                cnaesSecundarios: [],
                endereco: "Av. Goiás",
                cidade: "Goiânia",
                uf: "GO",
                cep: "74000-000",
              },
            }),
        });
      }
      if (url.includes("/api/configuracoes/tenants")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              ok: true,
              tenants: [
                {
                  id: "tenant_bloco1",
                  cnpj: "12345678000190",
                  razaoSocial: "EMPRESA ANTERIOR LTDA",
                  plano: "PRO",
                  billingStatus: "TRIAL",
                },
              ],
            }),
        });
      }
      if (url.includes("/api/configuracoes/perfil")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ ok: true, perfil: { name: "Vítor Henrique", email: "vitor@empresa.com.br" } }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true, usuarios: [] }) });
    });

    render(<ConfiguracoesPage />);

    const tabs = screen.getAllByRole("tab");
    fireEvent.click(tabs[1]);

    // Botão Upload Cartão CNPJ ao lado de Adicionar CNPJ + botão CNAEs Secundários (0)
    const btnUploadCartao = await screen.findByRole("button", { name: /Upload Cartão CNPJ/i });
    const btnAddCnpj = screen.getByRole("button", { name: /Adicionar CNPJ/i });
    const btnCnaesSec = screen.getByRole("button", { name: /CNAEs Secundários \(0\)/i });

    expect(btnUploadCartao).toBeInTheDocument();
    expect(btnAddCnpj).toBeInTheDocument();
    expect(btnCnaesSec).toBeInTheDocument();

    // Abre Modal CNAEs Secundários e adiciona um CNAE
    fireEvent.click(btnCnaesSec);
    expect(await screen.findByText(/Gerenciar CNAEs Secundários/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Adicionar CNAE Secundário/i), {
      target: { value: "4639-7/01 — Comércio atacadista de produtos alimentícios em geral" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Adicionar CNAE/i }));
    expect(screen.getAllByText(/4639-7\/01 — Comércio atacadista/i).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole("button", { name: /Remover 4639-7\/01/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Concluir/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /CNAEs Secundários \(1\)/i })).toBeInTheDocument();
    });

    // Abre Modal Upload Cartão CNPJ, anexa arquivo e importa
    fireEvent.click(btnUploadCartao);
    expect(await screen.findByText(/Importar Dados pelo Cartão CNPJ/i)).toBeInTheDocument();
    const inputFile = screen.getByTestId("input-upload-cartao-cnpj") as HTMLInputElement;
    const pdfFile = new File(["%PDF-1.4 cartao"], "cartao_cnpj.pdf", { type: "application/pdf" });
    fireEvent.change(inputFile, { target: { files: [pdfFile] } });
    fireEvent.click(screen.getByRole("button", { name: /Extrair e Preencher Empresa/i }));

    await waitFor(() => {
      expect(screen.getByDisplayValue("NOVA RAZAO IMPORTADA LTDA")).toBeInTheDocument();
      expect(screen.getByDisplayValue("RUA NOVA")).toBeInTheDocument();
      expect(screen.getByDisplayValue("10.123.456-7")).toBeInTheDocument();
    });
  });
});
