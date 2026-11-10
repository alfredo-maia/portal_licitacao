import { unlink } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  insertInMemoryLicitacao,
  insertInMemoryLicitacaoArquivo,
  insertInMemoryDocumento,
  insertInMemoryUsuario,
  listInMemoryNotificacoesUsuario,
  resetInMemoryLicitacoes,
} from "@/server/services/licitacoes-store";
import {
  inMemoryTenants,
  inMemoryTenantUsers,
  resetInMemoryTenantStorage,
  createTenantForUser,
} from "@/server/services/tenant.service";
import {
  atualizarDocumento,
  criarDocumento,
  excluirDocumento,
  listarDocumentos,
  obterDocumento,
} from "@/server/services/documentos.service";
import {
  executarJobNotificacoesDiarias,
  verificarDisparoImediatoVencimentoDocumento,
  verificarDisparoImediatoVencimentoPortal,
} from "@/server/services/notificacoes.service";
import { gerarConteudoPropostaComercial } from "@/lib/proposta-comercial-template";
import { gerarPdfPropostaComercial } from "@/lib/proposta-comercial-pdf";
import type { ItemCalculadoraInput } from "@/server/schemas/proposta-calculadora.schema";
import { enviarEmailFaturamento } from "@/server/services/email.service";
import { processarWebhookAsaas } from "@/server/services/asaas.service";

const { getServerSessionMock, redirectMock, cookieStoreMock } = vi.hoisted(() => ({
  getServerSessionMock: vi.fn(),
  redirectMock: vi.fn((dest: string) => {
    throw new Error(`NEXT_REDIRECT:${dest}`);
  }),
  cookieStoreMock: new Map<string, string>(),
}));

vi.mock("next-auth/next", () => ({
  getServerSession: getServerSessionMock,
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) => {
      const val = cookieStoreMock.get(name);
      return val ? { name, value: val } : undefined;
    },
  })),
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

const tempPublicUploads: string[] = [];

describe("Auditoria Pós-Compilação — Regressões Críticas, Multi-Tenant e Consistência", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cookieStoreMock.clear();
    resetInMemoryLicitacoes();
    resetInMemoryTenantStorage();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    while (tempPublicUploads.length > 0) {
      const url = tempPublicUploads.pop();
      if (url) {
        const clean = url.replace(/^\/+/, "");
        await unlink(join(process.cwd(), "public", clean)).catch(() => undefined);
      }
    }
  });

  it("1. Notificações N6/N7 usam relation tenantMemberships no Prisma e respeitam 2º CNPJ sem vazar entre tenants", async () => {
    const tenantQueryCalls: any[] = [];
    const findManyUserSpy = vi
      .spyOn(prisma.user, "findMany")
      .mockImplementation((async (args: any) => {
        if (args?.where?.tenantMemberships) {
          tenantQueryCalls.push(args);
          return [{ id: "usr_sec" }];
        }
        return [];
      }) as any);

    const amanha = new Date();
    amanha.setDate(amanha.getDate() + 3);

    const resDoc = await verificarDisparoImediatoVencimentoDocumento({
      id: "doc_n7_rel_1",
      nome: "Certidão Negativa Federal",
      categoria: "FISCAL_TRABALHISTA",
      status: "ATIVO",
      semValidade: false,
      dataVencimento: amanha,
      tenantId: "tenant_n7_a",
    });
    expect(resDoc.acionada).toBe(true);
    expect(tenantQueryCalls[0]).toEqual(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantMemberships: { some: { tenantId: "tenant_n7_a", ativo: true } },
        }),
      }),
    );

    const resPortal = await verificarDisparoImediatoVencimentoPortal({
      id: "portal_n6_rel_1",
      nome: "Compras.gov",
      dataVencimento: amanha,
      tenantId: "tenant_n6_b",
    });
    expect(resPortal.acionada).toBe(true);
    expect(tenantQueryCalls[1]).toEqual(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantMemberships: { some: { tenantId: "tenant_n6_b", ativo: true } },
        }),
      }),
    );
    expect(findManyUserSpy).toHaveBeenCalled();

    // Job diário entregando para usuário com 2º CNPJ ativo e sem vazar para outro tenant
    resetInMemoryLicitacoes();
    const findUsersDailySpy = vi.spyOn(prisma.user, "findMany").mockResolvedValueOnce([
      {
        id: "usr_multi_cnpj",
        role: "DIRETORIA",
        tenantMemberships: [{ tenantId: "tenant_1" }, { tenantId: "tenant_2" }],
      },
      {
        id: "usr_outro_tenant",
        role: "DIRETORIA",
        tenantMemberships: [{ tenantId: "tenant_3" }],
      },
    ] as any);
    vi.spyOn(prisma.licitacao, "findMany").mockResolvedValueOnce([] as any);
    vi.spyOn(prisma.portal, "findMany").mockResolvedValueOnce([] as any);
    vi.spyOn(prisma.documento, "findMany").mockRejectedValueOnce(new Error("Offline docs"));
    vi.spyOn(prisma.impugnacao, "findMany").mockResolvedValueOnce([] as any);

    const hoje = new Date("2026-11-10T10:00:00Z");
    const vence14d = new Date("2026-11-24T10:00:00Z");
    insertInMemoryDocumento({
      id: "doc_cnpj2_14d",
      nome: "Balanco Patrimonial CNPJ 2",
      categoria: "ECONOMICO_FINANCEIRA",
      dataVencimento: vence14d,
      semValidade: false,
      status: "ATIVO",
      tenantId: "tenant_2",
    });

    const jobRes = await executarJobNotificacoesDiarias(hoje);
    expect(findUsersDailySpy).toHaveBeenCalled();
    expect(jobRes.contagens.N7_VENCIMENTO_DOCUMENTO).toBeGreaterThanOrEqual(1);
    expect(listInMemoryNotificacoesUsuario("usr_multi_cnpj")).toHaveLength(1);
    expect(listInMemoryNotificacoesUsuario("usr_outro_tenant")).toHaveLength(0);
  });

  it("2. Documentos: excluirDocumento limpa DB + memória e rotas [id], [id]/nova-versao e [id]/download isolam tenant", async () => {
    inMemoryTenantUsers.push(
      {
        id: "tu_doc_a",
        tenantId: "tenant_doc_a",
        userId: "usr_doc_a",
        userEmail: "a@empresa.com",
        userName: "Gestor A",
        role: "TITULAR",
        ativo: true,
        criadoEm: new Date(),
      },
      {
        id: "tu_doc_b",
        tenantId: "tenant_doc_b",
        userId: "usr_doc_b",
        userEmail: "b@empresa.com",
        userName: "Gestor B",
        role: "TITULAR",
        ativo: true,
        criadoEm: new Date(),
      },
    );

    const docA = await criarDocumento(
      {
        nome: "Certidão FGTS A",
        categoria: "FISCAL_TRABALHISTA",
        tipo: "FGTS",
        semValidade: false,
        dataVencimento: new Date("2027-06-01T12:00:00Z"),
      },
      "usr_doc_a",
      "tenant_doc_a",
    );

    // Sem anexo inicialmente -> /nova-versao anexa in-place na V1 (200)
    const { POST: novaVersaoPost } = await import("@/app/api/documentos/[id]/nova-versao/route");
    getServerSessionMock.mockResolvedValue({
      user: { id: "usr_doc_a", role: "DIRETORIA", activeTenantId: "tenant_doc_a" },
    });

    const pdfBytes = Buffer.from("%PDF-1.4\nCNPJ 12.345.678/0001-90\n");
    const makeFormReq = (fileName: string) =>
      ({
        headers: new Headers({ "content-type": "multipart/form-data; boundary=---test" }),
        formData: async () => {
          const map = new Map<string, any>([
            [
              "file",
              {
                name: fileName,
                type: "application/pdf",
                size: pdfBytes.length,
                arrayBuffer: async () =>
                  pdfBytes.buffer.slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength),
              },
            ],
          ]);
          return { get: (k: string) => map.get(k) ?? null };
        },
      }) as unknown as Request;

    const resAnexoV1 = await novaVersaoPost(makeFormReq("fgts_v1.pdf"), {
      params: Promise.resolve({ id: docA.id }),
    });
    const jsonAnexoV1 = await resAnexoV1.json();
    if (jsonAnexoV1?.documento?.arquivoUrl) {
      tempPublicUploads.push(jsonAnexoV1.documento.arquivoUrl);
    }
    expect(resAnexoV1.status).toBe(200);
    expect(jsonAnexoV1.documento.versao).toBe(1);
    expect(jsonAnexoV1.documento.arquivoNome).toBe("fgts_v1.pdf");

    // Já possui anexo -> 2º /nova-versao cria V2 (201) arquivando V1 e retorna histórico ordenado
    const resAnexoV2 = await novaVersaoPost(makeFormReq("fgts_v2.pdf"), {
      params: Promise.resolve({ id: docA.id }),
    });
    const jsonAnexoV2 = await resAnexoV2.json();
    if (jsonAnexoV2?.documento?.arquivoUrl) {
      tempPublicUploads.push(jsonAnexoV2.documento.arquivoUrl);
    }
    expect(resAnexoV2.status).toBe(201);
    expect(jsonAnexoV2.documento.versao).toBe(2);

    const detalheMem = await obterDocumento(jsonAnexoV2.documento.id, "tenant_doc_a");
    expect(detalheMem?.historicoVersoes).toHaveLength(2);
    expect(detalheMem?.historicoVersoes?.map((v) => v.status)).toEqual(
      expect.arrayContaining(["ATIVO", "SUBSTITUIDO"]),
    );

    // Tentativa cross-tenant (Tenant B tentando acessar/alterar/baixar/deletar doc do Tenant A) -> bloqueio
    const {
      GET: getDocById,
      PATCH: patchDocById,
      DELETE: deleteDocById,
    } = await import("@/app/api/documentos/[id]/route");
    const { GET: downloadDoc } = await import("@/app/api/documentos/[id]/download/route");

    getServerSessionMock.mockResolvedValue({
      user: { id: "usr_doc_b", role: "DIRETORIA", activeTenantId: "tenant_doc_b" },
    });
    expect(
      (await getDocById(new Request("http://localhost"), { params: Promise.resolve({ id: jsonAnexoV2.documento.id }) }))
        .status,
    ).toBe(404);
    expect(
      (
        await patchDocById(
          new Request("http://localhost", {
            method: "PATCH",
            body: JSON.stringify({ nome: "Hackeado" }),
          }),
          { params: Promise.resolve({ id: jsonAnexoV2.documento.id }) },
        )
      ).status,
    ).toBe(404);
    expect(
      (await deleteDocById(new Request("http://localhost"), { params: Promise.resolve({ id: jsonAnexoV2.documento.id }) }))
        .status,
    ).toBe(404);
    expect(
      (await downloadDoc(new Request("http://localhost"), { params: Promise.resolve({ id: jsonAnexoV2.documento.id }) }))
        .status,
    ).toBe(404);

    // /download sem autenticação -> 401
    getServerSessionMock.mockResolvedValueOnce(null);
    expect(
      (await downloadDoc(new Request("http://localhost"), { params: Promise.resolve({ id: jsonAnexoV2.documento.id }) }))
        .status,
    ).toBe(401);

    // Tenant A exclui com sucesso mesmo se DB existir e limpar memória
    const delResult = await excluirDocumento(jsonAnexoV2.documento.id, "usr_doc_a", "tenant_doc_a");
    expect(delResult).toBe(true);
    const aposExcluir = await listarDocumentos({ tenantId: "tenant_doc_a", pageSize: 50 });
    expect(aposExcluir.documentos.some((d) => d.id === jsonAnexoV2.documento.id)).toBe(false);
    expect(await atualizarDocumento(jsonAnexoV2.documento.id, { nome: "Ghost" }, "usr_doc_a", "tenant_doc_a")).toBeNull();
  });

  it("3. DELETE /api/oportunidades/[id]/arquivos/[arquivoId] exige auth (401) e bloqueia exclusão cross-tenant (403)", async () => {
    const lic = insertInMemoryLicitacao({
      idPncp: "pncp-aud-arq",
      numeroControlePNCP: "pncp-aud-arq",
      numeroEdital: "PE 99/2026",
      orgaoNome: "Prefeitura Teste",
      orgaoCnpj: "12345678000190",
      uf: "GO",
      municipio: "Goiânia",
      esfera: "M",
      poder: "E",
      modalidade: "Pregão Eletrônico",
      modalidadeCodigo: 6,
      portalDisputa: "PNCP",
      miniResumo: "Compra teste",
      resumo: "Compra teste",
      valorEstimado: 10000,
      dataAbertura: new Date(),
      dataEncerramentoProposta: new Date(),
      dataPublicacaoPncp: new Date(),
      dataUltimaAtualizacao: new Date(),
      status: "PENDENTE",
      parecerIA: "GO",
      justificativaIA: null,
      tipoSistemaCodigo: "PNCP",
      segmentoMacro: "INFORMATICA",
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
      hashCritico: "hash-aud-arq",
      valorArrematado: null,
      responsavelId: null,
    });
    const arq = insertInMemoryLicitacaoArquivo(lic.id, {
      id: "arq_tenant_owner",
      nome: "planilha_owner.xlsx",
      tamanho: 100,
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      caminho: "/uploads/planilha_owner.xlsx",
      tenantId: "tenant_arq_a",
    });

    const { DELETE } = await import("@/app/api/oportunidades/[id]/arquivos/[arquivoId]/route");

    getServerSessionMock.mockResolvedValueOnce(null);
    const res401 = await DELETE(new Request("http://localhost"), {
      params: Promise.resolve({ id: lic.id, arquivoId: arq.id }),
    });
    expect(res401.status).toBe(401);

    inMemoryTenantUsers.push({
      id: "tu_arq_b",
      tenantId: "tenant_arq_b",
      userId: "usr_arq_b",
      userEmail: "b@emp.com",
      userName: "Invasor B",
      role: "TITULAR",
      ativo: true,
      criadoEm: new Date(),
    });
    getServerSessionMock.mockResolvedValueOnce({
      user: { id: "usr_arq_b", name: "B", role: "DIRETORIA", activeTenantId: "tenant_arq_b" },
    });
    const res403 = await DELETE(new Request("http://localhost"), {
      params: Promise.resolve({ id: lic.id, arquivoId: arq.id }),
    });
    expect(res403.status).toBe(403);
  });

  it("4. Tenants: POST /api/configuracoes/tenants falha fechado (403) ao trocar para empresa sem vínculo e createTenantForUser preenche trialFim", async () => {
    const { POST } = await import("@/app/api/configuracoes/tenants/route");
    getServerSessionMock.mockResolvedValue({
      user: { id: "usr_switch_1", name: "User Switch", email: "u@emp.com.br", plano: "PRO" },
    });

    vi.spyOn(prisma.tenantUser, "findUnique").mockRejectedValueOnce(new Error("DB offline"));
    const resForbidden = await POST(
      new Request("http://localhost/api/configuracoes/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId: "tenant_sem_vinculo" }),
      }),
    );
    expect(resForbidden.status).toBe(403);

    const novo = await createTenantForUser({
      userId: "usr_switch_1",
      userEmail: "u@emp.com.br",
      userName: "User Switch",
      userPlan: "PRO",
      input: {
        cnpj: "11.222.333/0001-81",
        razaoSocial: "NOVA EMPRESA TESTE LTDA",
        plano: "PRO",
      },
    });
    expect(novo.billingStatus).toBe("TRIAL");
    expect(novo.trialFim).toBeInstanceOf(Date);
    expect((novo.trialFim as Date).getTime()).toBeGreaterThan(Date.now() + 13 * 86400_000);
  });

  it("5. GET /api/oportunidades/[id]/itens-certame sem refresh=true não estoura limite silencioso após 6 leituras; refresh=true aplica limite", async () => {
    const { GET } = await import("@/app/api/oportunidades/[id]/itens-certame/route");
    getServerSessionMock.mockResolvedValue({
      user: {
        id: "usr_itens_view",
        role: "DIRETORIA",
        plano: "PRO",
        activeTenantId: "tenant_itens_view",
      },
    });
    inMemoryTenants.set("tenant_itens_view", {
      id: "tenant_itens_view",
      cnpj: "12345678000190",
      razaoSocial: "Empresa View LTDA",
      plano: "PRO",
      billingStatus: "ATIVO",
      maxCnpjs: 2,
      maxUsers: 2,
      ativo: true,
      criadoEm: new Date(),
      updatedAt: new Date(),
    });
    const lic = insertInMemoryLicitacao({
      idPncp: "pncp-itens-view-check",
      numeroControlePNCP: "pncp-itens-view-check",
      numeroEdital: "PE 200/2026",
      orgaoNome: "Órgão Itens",
      orgaoCnpj: "12345678000190",
      uf: "GO",
      municipio: "Goiânia",
      esfera: "M",
      poder: "E",
      modalidade: "Pregão Eletrônico",
      modalidadeCodigo: 6,
      portalDisputa: "PNCP",
      miniResumo: "Aquisição de computadores",
      resumo: "Aquisição de 10 computadores desktop",
      valorEstimado: 50000,
      dataAbertura: new Date(),
      dataEncerramentoProposta: new Date(),
      dataPublicacaoPncp: new Date(),
      dataUltimaAtualizacao: new Date(),
      status: "PENDENTE",
      parecerIA: "GO",
      justificativaIA: null,
      tipoSistemaCodigo: "PNCP",
      segmentoMacro: "INFORMATICA",
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
      hashCritico: "hash-itens-view-check",
      valorArrematado: null,
      responsavelId: null,
    });

    for (let i = 0; i < 7; i++) {
      const res = await GET(new Request(`http://localhost/api/oportunidades/${lic.id}/itens-certame`), {
        params: Promise.resolve({ id: lic.id }),
      });
      expect(res.status).toBe(200);
    }

    // Já com refresh=true, 5 chamadas passam e a 6ª trava silenciosamente
    for (let i = 0; i < 5; i++) {
      const resRef = await GET(
        new Request(`http://localhost/api/oportunidades/${lic.id}/itens-certame?refresh=true`),
        { params: Promise.resolve({ id: lic.id }) },
      );
      expect(resRef.status).toBe(200);
    }
    const resSixthRefresh = await GET(
      new Request(`http://localhost/api/oportunidades/${lic.id}/itens-certame?refresh=true`),
      { params: Promise.resolve({ id: lic.id }) },
    );
    expect(resSixthRefresh.status).toBe(500);
  });

  it("6. Cron ingest-pncp rejeita secret padrão inseguro em produção e Proposta respeita validadeDias dinâmico", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CRON_SECRET", "");
    getServerSessionMock.mockResolvedValueOnce(null);

    const { GET: cronGet } = await import("@/app/api/cron/ingest-pncp/route");
    const resCron = await cronGet(
      new Request("http://localhost/api/cron/ingest-pncp", {
        headers: { Authorization: "Bearer change-me-in-production-min-16" },
      }),
    );
    expect(resCron.status).toBe(401);

    const itemSample: ItemCalculadoraInput = {
      id: "i1",
      numeroItem: "1",
      descricao: "Notebook",
      unidade: "UN",
      quantidade: 2,
      custoUnitario: 2000,
      freteUnitario: 0,
      outrosCustosUnitario: 0,
      impostosPercentual: 12,
      bdiPercentual: 25,
      margemMinimaPercentual: 10,
      margemAlvoPercentual: 20,
    };

    const tpl = gerarConteudoPropostaComercial({
      orgaoNome: "Prefeitura Modelo",
      numeroEdital: "PE 05/2026",
      objetoLicitacao: "Fornecimento de insumos",
      itens: [itemSample],
      configuracao: { validadeDias: 30, tipoTabelaProposta: "PROPOSTA_INICIAL" },
    });
    expect(tpl.conteudoTexto).toContain("30 (trinta) dias");
    expect(tpl.conteudoTexto).not.toContain("(sessenta)");
    expect(tpl.conteudoHtml).toContain("30 (trinta) dias");

    const pdfRes = await gerarPdfPropostaComercial({
      orgaoNome: "Prefeitura Modelo",
      numeroEdital: "PE 05/2026",
      objetoLicitacao: "Fornecimento de insumos",
      itens: [itemSample],
      configuracao: { validadeDias: 30, tipoTabelaProposta: "PROPOSTA_INICIAL" },
    });
    expect(pdfRes.pdfBuffer.byteLength).toBeGreaterThan(500);
    expect(pdfRes.pdfNome).toContain(".pdf");
  });

  it("7. Planos/status deriva trial de criadoEm (+14d) em memória, e-mail normaliza invoiceUrl relativo, Asaas atualiza inMemoryTenants e /faturamento redireciona", async () => {
    const quatroDiasAtras = new Date(Date.now() - 4 * 86400_000 - 1000);
    inMemoryTenants.set("tenant_trial_calc", {
      id: "tenant_trial_calc",
      cnpj: "12345678000190",
      razaoSocial: "Trial Calc LTDA",
      plano: "PRO",
      billingStatus: "TRIAL",
      trialFim: null,
      maxCnpjs: 2,
      maxUsers: 2,
      ativo: true,
      criadoEm: quatroDiasAtras,
      updatedAt: new Date(),
    });
    getServerSessionMock.mockResolvedValue({
      user: { id: "usr_trial", email: "user@trial.com", activeTenantId: "tenant_trial_calc" },
    });

    const { GET: planosStatusGet } = await import("@/app/api/planos/status/route");
    const resStatus = await planosStatusGet();
    const jsonStatus = await resStatus.json();
    expect(resStatus.status).toBe(200);
    expect(jsonStatus.diasRestantesTrial).toBe(10);

    // Email normaliza invoiceUrl relativo
    process.env.RESEND_API_KEY = "re_test_abs_url";
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "mail_abs_1" }), { status: 200 }),
    );
    await enviarEmailFaturamento({
      destinatarioEmail: "fin@emp.com.br",
      tipo: "CHECKOUT",
      razaoSocial: "Trial Calc LTDA",
      plano: "PRO",
      valor: 497,
      invoiceUrl: "/planos?fatura=sub_1",
      tenantId: "tenant_trial_calc",
    });
    const emailPayload = JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body || "{}"));
    expect(emailPayload.html).toContain("/planos?fatura=sub_1");
    expect(emailPayload.html).toMatch(/https?:\/\/[^"]+\/planos\?fatura=sub_1/);

    // Webhook Asaas sincroniza inMemoryTenants mesmo com banco offline
    vi.spyOn(prisma.tenant, "update").mockRejectedValueOnce(new Error("DB offline"));
    await processarWebhookAsaas({
      id: "evt_mem_cancel_1",
      event: "SUBSCRIPTION_DELETED",
      subscription: {
        id: "sub_mem_1",
        customer: "cus_mem_1",
        externalReference: "tenant_trial_calc",
      },
    });
    expect(inMemoryTenants.get("tenant_trial_calc")?.billingStatus).toBe("CANCELADO");

    // /faturamento redireciona para /planos sem 404
    const { default: FaturamentoRedirectPage } = await import("@/app/faturamento/page");
    expect(() => FaturamentoRedirectPage()).toThrow("NEXT_REDIRECT:/planos");
    expect(redirectMock).toHaveBeenCalledWith("/planos");
  });
});
