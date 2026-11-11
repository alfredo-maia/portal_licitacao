import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextRequest } from "next/server";

const {
  mockGetServerSession,
  mockSignIn,
  mockSignOut,
  mockRouterPush,
  mockRouterRefresh,
} = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockSignIn: vi.fn(),
  mockSignOut: vi.fn(),
  mockRouterPush: vi.fn(),
  mockRouterRefresh: vi.fn(),
}));

vi.mock("next-auth/next", () => ({
  getServerSession: mockGetServerSession,
}));

vi.mock("next-auth/react", () => ({
  signIn: mockSignIn,
  signOut: mockSignOut,
}));

import { prisma } from "@/lib/prisma";
import { adminPodeAcessar } from "@/lib/rbac";
import { runWithAuditActorContext } from "@/server/audit";
import { authorizeCredentials } from "@/server/auth";
import { exigirAdmin } from "@/server/auth/admin-guard";
import { middleware } from "@/middleware";
import { ADMIN_ROUTES } from "@/server/schemas/superadmin.schema";
import {
  obterDossieCliente360SuperAdmin,
  atualizarContaPrincipalSuperAdmin,
  salvarEmpresaClienteSuperAdmin,
  salvarUsuarioClienteSuperAdmin,
  atualizarCotasClienteSuperAdmin,
  obterEspelhamentoClienteSuperAdmin,
  executarAcaoFinanceiraSuperAdmin,
  salvarCupomSuperAdmin,
  listarCuponsSuperAdmin,
  consumirCupomMemoriaSuperAdmin,
  salvarAfiliadoSuperAdmin,
  vincularClienteAfiliadoSuperAdmin,
  listarAfiliadosSuperAdmin,
  atualizarStatusComissaoAfiliadoSuperAdmin,
  registrarConsumoIaSuperAdmin,
  obterPainelConsumoIaSuperAdmin,
  criarAvisoEmMassaSuperAdmin,
  listarAvisosEmMassaSuperAdmin,
  gerarQrCodeWhatsAppSuperAdmin,
  atualizarConfigWhatsAppSuperAdmin,
  salvarLicitacaoManualSuperAdmin,
  injetarLicitacaoNoKanbanClienteSuperAdmin,
  salvarUsuarioAdminSuperAdmin,
  listarUsuariosAdminSuperAdmin,
  resolverDisputaCnpjSuperAdmin,
} from "@/server/services/superadmin.service";
import {
  disputeClaimCnpj,
  inMemoryTenants,
  inMemoryTenantUsers,
} from "@/server/services/tenant.service";
import {
  obterStatusCotaAnaliseIA,
  memoryTenantExtraAiQuota,
  setMemoryTenantExtraAiQuota,
} from "@/server/services/analise-ia-participacao.service";
import { realizarCadastroConta } from "@/server/services/cadastro.service";
import { listNotificacoes } from "@/server/services/notificacoes.service";
import {
  enfileirarMensagemWhatsApp,
  processarFilaWhatsAppComJitter,
  registrarOptOutWhatsApp,
  resetInMemoryWhatsAppStoreForTesting,
} from "@/server/services/whatsapp.service";
import { PATCH as clientePatchRoute } from "@/app/api/admin/clientes/[id]/route";
import { POST as whatsappPostRoute } from "@/app/api/admin/whatsapp/route";
import { POST as sistemaPostRoute } from "@/app/api/admin/sistema/route";
import { GET as avisosAtivosGetRoute } from "@/app/api/avisos/ativos/route";
import { AdminShell } from "@/components/admin/AdminShell";
import { SuperAdminDashboard } from "@/components/admin/SuperAdminDashboard";
import { ClientesScreen } from "@/components/admin/screens/ClientesScreen";
import { Cliente360Screen } from "@/components/admin/screens/Cliente360Screen";
import { FinanceiroScreen } from "@/components/admin/screens/FinanceiroScreen";
import { AfiliadosScreen } from "@/components/admin/screens/AfiliadosScreen";
import { SuporteAdminScreen } from "@/components/admin/screens/SuporteAdminScreen";
import { AvisosScreen } from "@/components/admin/screens/AvisosScreen";
import { WhatsAppScreen } from "@/components/admin/screens/WhatsAppScreen";
import { IaConsumoScreen } from "@/components/admin/screens/IaConsumoScreen";
import { LicitacoesAdminScreen } from "@/components/admin/screens/LicitacoesAdminScreen";
import { SistemaAdminScreen } from "@/components/admin/screens/SistemaAdminScreen";
import AdminLoginPage from "@/app/admin/login/page";
import { AppShell } from "@/components/shell/app-shell";
import { SystemBroadcastBanner } from "@/components/shell/system-broadcast-banner";

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin",
  useRouter: () => ({
    push: mockRouterPush,
    replace: vi.fn(),
    refresh: mockRouterRefresh,
  }),
}));

function gerarCnpjValido(baseOitoDigitos: string): string {
  const base12 = `${baseOitoDigitos.padStart(8, "0").slice(0, 8)}0001`.split("").map(Number);
  const calcDv = (nums: number[], pesos: number[]) => {
    const soma = nums.reduce((acc, n, i) => acc + n * pesos[i], 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const d1 = calcDv(base12, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = calcDv([...base12, d1], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const full = [...base12, d1, d2].join("");
  return `${full.slice(0, 2)}.${full.slice(2, 5)}.${full.slice(5, 8)}/${full.slice(8, 12)}-${full.slice(12, 14)}`;
}

describe("Issue #49 — Portal ADM Completo (Deus ex Machina)", () => {
  describe("1. Autenticação da Conta ADM Master (vitorhenrique018@gmail.com / 123456) e Middleware /admin/login", () => {
    it("deve autenticar vitorhenrique018@gmail.com com a senha 123456 retornando SUPERADMIN e SUPERADMIN_MASTER", async () => {
      const user = await authorizeCredentials({
        email: "vitorhenrique018@gmail.com",
        password: "123456",
      });

      expect(user).not.toBeNull();
      expect(user?.email).toBe("vitorhenrique018@gmail.com");
      expect(user?.role).toBe("SUPERADMIN");
      expect(user?.isSuperAdmin).toBe(true);
      expect(user?.adminRole).toBe("SUPERADMIN_MASTER");
    });

    it("deve liberar acesso público à rota /admin/login no middleware sem redirecionar para /404 ou /login", async () => {
      const req = new NextRequest("http://localhost:3011/admin/login");
      const res = await middleware(req);
      expect(res?.headers.get("x-middleware-rewrite")).toBeNull();
      expect(res?.status).not.toBe(307);
    });
  });

  describe("2. Isolamento de Shell Carbon (AppShell vs AdminShell com 10 rotas)", () => {
    it("AppShell não deve renderizar elementos do cliente (Suporte FAB / Menu Licitações) quando em /admin", () => {
      render(
        <AppShell>
          <div data-testid="conteudo-admin-isolado">Conteúdo ADM</div>
        </AppShell>,
      );

      expect(screen.getByTestId("conteudo-admin-isolado")).toBeInTheDocument();
      expect(screen.queryByTestId("support-fab-btn")).not.toBeInTheDocument();
    });

    it("AdminShell deve renderizar o SideNav retrátil com todas as 10 telas de ADMIN_ROUTES", () => {
      expect(ADMIN_ROUTES).toHaveLength(10);

      render(
        <AdminShell>
          <div data-testid="painel-filho">Painel Central</div>
        </AdminShell>,
      );

      expect(screen.getByTestId("admin-carbon-shell")).toBeInTheDocument();
      for (const route of ADMIN_ROUTES) {
        expect(screen.getByText(route.label)).toBeInTheDocument();
      }
    });
  });

  describe("3. Clientes 360º, Termômetro de Trial, Cotas & Espelhamento", () => {
    it("deve obter o dossiê 360º do cliente com checklist de 7 marcos, CNPJs, usuários (sem senha) e licitações", async () => {
      const dossie = await obterDossieCliente360SuperAdmin("tnt_demo_01");

      expect(dossie).toBeDefined();
      expect(dossie.onboarding).toBeDefined();
      expect(typeof dossie.onboarding.score).toBe("number");
      expect(Array.isArray(dossie.empresas)).toBe(true);
      expect(Array.isArray(dossie.usuarios)).toBe(true);
      for (const u of dossie.usuarios) {
        expect((u as Record<string, unknown>).passwordHash).toBeUndefined();
      }
      expect(dossie.patrimonioOperacional).toBeDefined();
      expect(Array.isArray(dossie.patrimonioOperacional.licitacoes)).toBe(true);
    });

    it("deve permitir atualizar conta principal, inativar cliente e incrementar sessionVersion (Killswitch)", async () => {
      const res = await atualizarContaPrincipalSuperAdmin({
        userId: "usr_demo_titular",
        name: "Titular Editado ADM",
        ativo: false,
        forcarLogout: true,
      });

      expect(res.ok).toBe(true);
      expect(res.usuario.ativo).toBe(false);
      expect(res.usuario.sessionVersion).toBeGreaterThanOrEqual(2);
    });

    it("deve permitir criar/editar CNPJ e usuário da equipe do cliente pelo ADM", async () => {
      const emp = await salvarEmpresaClienteSuperAdmin({
        ownerUserId: "usr_demo_titular",
        cnpj: "45.842.639/0001-01",
        razaoSocial: "NOVA FILIAL TESTE ADM LTDA",
        nomeFantasia: "Filial ADM",
        uf: "GO",
        cidade: "Goiânia",
        plano: "PRO",
        billingStatus: "TRIAL",
      });
      expect(emp.ok).toBe(true);
      expect(emp.empresa.razaoSocial).toBe("NOVA FILIAL TESTE ADM LTDA");

      const usr = await salvarUsuarioClienteSuperAdmin({
        tenantId: emp.empresa.id,
        name: "Analista Equipe ADM",
        email: "analista.adm.teste@empresa.com.br",
        role: "ANALISTA_COMERCIAL",
        tenantRole: "MEMBRO",
        ativo: true,
      });
      expect(usr.ok).toBe(true);
      expect(usr.usuario.email).toBe("analista.adm.teste@empresa.com.br");
      expect((usr.usuario as Record<string, unknown>).passwordHash).toBeUndefined();
    });

    it("deve permitir aumentar cotas de CNPJs, usuários, R2 e cota bônus mensal de IA", async () => {
      const cotas = await atualizarCotasClienteSuperAdmin({
        tenantId: "tnt_demo_01",
        maxCnpjs: 6,
        maxUsers: 12,
        adicionarStorageMb: 2048,
        aiExtraQuotaMes: 10,
      });

      expect(cotas.ok).toBe(true);
      expect(cotas.maxCnpjs).toBe(6);
      expect(cotas.maxUsers).toBe(12);
      expect(cotas.aiExtraQuotaMes).toBe(10);

      const statusCotaIa = await obterStatusCotaAnaliseIA("tnt_demo_01");
      expect(statusCotaIa.limite).toBeGreaterThanOrEqual(25); // 15 (PRO) + 10 bônus
    });

    it("deve retornar espelhamento da visão do cliente com oportunidades e kanban do CNPJ", async () => {
      const espelho = await obterEspelhamentoClienteSuperAdmin("tnt_demo_01");
      expect(espelho.ok).toBe(true);
      expect(espelho.tenantId).toBe("tnt_demo_01");
      expect(Array.isArray(espelho.licitacoesKanban)).toBe(true);
    });
  });

  describe("4. Acompanhamento Financeiro, Planos & Cupons (/admin/financeiro)", () => {
    it("deve trocar plano, prorrogar trial e dar baixa manual em assinatura", async () => {
      const r1 = await executarAcaoFinanceiraSuperAdmin({
        tenantId: "tnt_demo_01",
        action: "ALTERAR_PLANO",
        plano: "ENTERPRISE",
      });
      expect(r1.ok).toBe(true);
      expect(r1.tenant.plano).toBe("ENTERPRISE");

      const r2 = await executarAcaoFinanceiraSuperAdmin({
        tenantId: "tnt_demo_01",
        action: "PRORROGAR_TRIAL",
        diasExtrasTrial: 14,
      });
      expect(r2.ok).toBe(true);
      expect(r2.tenant.billingStatus).toBe("TRIAL");

      const r3 = await executarAcaoFinanceiraSuperAdmin({
        tenantId: "tnt_demo_01",
        action: "DAR_BAIXA_MANUAL",
      });
      expect(r3.ok).toBe(true);
      expect(r3.tenant.billingStatus).toBe("ATIVO");
    });

    it("deve criar e listar cupons promocionais", async () => {
      const cupom = await salvarCupomSuperAdmin({
        codigo: "lancamento25",
        descricao: "25% OFF de lançamento",
        descontoPercentual: 25,
        diasExtrasTrial: 7,
        ativo: true,
      });

      expect(cupom.ok).toBe(true);
      expect(cupom.cupom.codigo).toBe("LANCAMENTO25");

      const lista = await listarCuponsSuperAdmin();
      expect(lista.some((c) => c.codigo === "LANCAMENTO25")).toBe(true);
    });
  });

  describe("5. Controle de Afiliados & Comissões (/admin/afiliados)", () => {
    it("deve cadastrar afiliado, vincular cliente indicado e pagar comissão PIX", async () => {
      const af = await salvarAfiliadoSuperAdmin({
        nome: "João Consultor Licitações",
        documento: "123.456.789-00",
        email: "joao@consultor.com.br",
        telefone: "62988887777",
        chavePix: "joao@consultor.com.br",
        codigo: "joao20",
        percentualComissao: 20,
        tipoComissao: "RECORRENTE",
        descontoIndicadosPct: 10,
        diasExtrasTrial: 7,
        ativo: true,
      });

      expect(af.ok).toBe(true);
      expect(af.afiliado.codigo).toBe("JOAO20");

      const vinc = await vincularClienteAfiliadoSuperAdmin({
        tenantId: "tnt_demo_01",
        affiliateId: af.afiliado.id,
      });
      expect(vinc.ok).toBe(true);

      const lista = await listarAfiliadosSuperAdmin();
      const encontrado = lista.afiliados.find((a) => a.id === af.afiliado.id);
      expect(encontrado).toBeDefined();
      expect(encontrado!.totalIndicados).toBeGreaterThanOrEqual(1);

      if (lista.comissoes.length > 0) {
        const pago = await atualizarStatusComissaoAfiliadoSuperAdmin({
          commissionId: lista.comissoes[0].id,
          status: "PAGO",
          comprovanteObs: "PIX enviado E2E",
        });
        expect(pago.ok).toBe(true);
        expect(pago.comissao.status).toBe("PAGO");
      }
    });
  });

  describe("6. Telemetria Diária de IA (/admin/ia)", () => {
    it("deve registrar consumo de tokens/custo de IA e consolidar painel diário por usuário e feature", async () => {
      await registrarConsumoIaSuperAdmin({
        tenantId: "tnt_demo_01",
        userId: "usr_demo_titular",
        usuarioNome: "Carlos Silva",
        empresaNome: "Grupo Maia",
        feature: "RAIO_X_EDITAL",
        provider: "LLM_GEMINI",
        model: "gemini-2.5-flash",
        promptTokens: 12000,
        outputTokens: 3500,
        duracaoMs: 2800,
        status: "SUCESSO",
      });

      const painel = await obterPainelConsumoIaSuperAdmin();
      expect(painel.totalTokensHoje).toBeGreaterThanOrEqual(15500);
      expect(painel.gastoHojeBrl).toBeGreaterThan(0);
      expect(painel.porCliente.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("7. Avisos em Massa, WhatsApp QR Code, Injeção de Licitações e Equipe ADM", () => {
    it("deve disparar aviso em massa (Sino + Banner), listar no histórico e acompanhar taxa de leitura (lidaEm)", async () => {
      const res = await criarAvisoEmMassaSuperAdmin({
        titulo: "Atualização do Robô de Lances",
        mensagem: "Nova versão liberada para todos os clientes.",
        severidade: "INFO",
        formato: "AMBOS",
        publicoAlvo: "TODOS",
        targetIds: [],
        linkDestino: "/robo-de-lances",
      });

      expect(res.ok).toBe(true);
      const avisos = await listarAvisosEmMassaSuperAdmin();
      const encontrado = avisos.find((a) => a.titulo === "Atualização do Robô de Lances");
      expect(encontrado).toBeDefined();
      expect(typeof encontrado!.totalLidas).toBe("number");
      expect(typeof encontrado!.taxaLeituraPct).toBe("number");
    });

    it("deve gerar QR Code de conexão do WhatsApp e atualizar parâmetros de Jitter Anti-Ban", async () => {
      const qr = await gerarQrCodeWhatsAppSuperAdmin();
      expect(qr.ok).toBe(true);
      expect(qr.qrCodeSvgDataUrl).toContain("data:image/svg+xml");

      const cfg = await atualizarConfigWhatsAppSuperAdmin({
        minDelaySegundos: 5,
        maxDelaySegundos: 10,
        limiteDiarioWarmup: 50,
        janelaInicio: "06:30",
        janelaFim: "08:30",
      });
      expect(cfg.ok).toBe(true);
      expect(cfg.config.minDelaySegundos).toBe(5);
    });

    it("deve cadastrar licitação manualmente e injetar no Kanban de um cliente", async () => {
      const lic = await salvarLicitacaoManualSuperAdmin({
        numeroEdital: "PE 999/2026-ADM",
        orgaoNome: "Prefeitura Municipal de Goiânia",
        orgaoCnpj: "01.612.092/0001-23",
        uf: "GO",
        municipio: "Goiânia",
        modalidade: "Pregão Eletrônico",
        miniResumo: "Aquisição de Notebooks Corporativos",
        resumo: "Registro de preços para aquisição de notebooks corporativos de alto desempenho.",
        valorEstimado: 850000,
        dataAbertura: new Date(Date.now() + 7 * 86400000).toISOString(),
        parecerIA: "GO",
        injetarParaTenantId: "tnt_demo_01",
        statusKanbanInicial: "ACEITA",
      });

      expect(lic.ok).toBe(true);
      expect(lic.licitacao.numeroEdital).toBe("PE 999/2026-ADM");

      const inj = await injetarLicitacaoNoKanbanClienteSuperAdmin({
        licitacaoId: lic.licitacao.id,
        tenantId: "tnt_demo_01",
        statusKanban: "EM_DISPUTA",
        notas: "Injetado pela equipe ADM",
      });
      expect(inj.ok).toBe(true);
    });

    it("deve gerenciar administradores da equipe interna do Portal ADM", async () => {
      const adm = await salvarUsuarioAdminSuperAdmin({
        name: "Operador Suporte N1",
        email: "suporte.n1@portal.internal",
        adminRole: "SUPORTE_N1",
        ativo: true,
      });

      expect(adm.ok).toBe(true);
      const lista = await listarUsuariosAdminSuperAdmin();
      expect(lista.some((u) => u.email === "suporte.n1@portal.internal")).toBe(true);
    });
  });

  describe("8. Barreira de Invisibilidade (404) & RBAC Granular do Portal ADM", () => {
    it("middleware deve reescrever /admin para /404 quando visitante não é admin", async () => {
      const req = new NextRequest("http://localhost:3011/admin");
      const res = await middleware(req);
      expect(res?.headers.get("x-middleware-rewrite")).toContain("/404");
    });

    it("exigirAdmin deve retornar 404 para anônimos e usuários de clientes (DIRETORIA / OPERADOR)", async () => {
      mockGetServerSession.mockResolvedValueOnce(null);
      const anon = await exigirAdmin("dashboard", "ler");
      expect(anon.ok).toBe(false);
      if (!anon.ok) expect(anon.response.status).toBe(404);

      mockGetServerSession.mockResolvedValueOnce({
        user: {
          id: "usr_cliente",
          email: "cliente@empresa.com.br",
          role: "DIRETORIA",
          ativo: true,
          isSuperAdmin: false,
        },
      });
      const cliente = await exigirAdmin("clientes", "ler");
      expect(cliente.ok).toBe(false);
      if (!cliente.ok) expect(cliente.response.status).toBe(404);
    });

    it("exigirAdmin deve aplicar matriz granular SUPORTE_N1 vs ADMIN_OPERACIONAL vs SUPERADMIN_MASTER", async () => {
      mockGetServerSession.mockResolvedValue({
        user: {
          id: "adm_n1",
          email: "n1@portal.internal",
          name: "Suporte N1",
          role: "SUPERADMIN",
          ativo: true,
          isSuperAdmin: true,
          adminRole: "SUPORTE_N1",
        },
      });
      const supEscrita = await exigirAdmin("suporte", "escrever");
      expect(supEscrita.ok).toBe(true);
      const sisEscrita = await exigirAdmin("sistema", "escrever");
      expect(sisEscrita.ok).toBe(false);
      if (!sisEscrita.ok) expect(sisEscrita.response.status).toBe(404);
      const finEscrita = await exigirAdmin("financeiro", "escrever");
      expect(finEscrita.ok).toBe(false);
      if (!finEscrita.ok) expect(finEscrita.response.status).toBe(404);

      mockGetServerSession.mockResolvedValue({
        user: {
          id: "adm_op",
          email: "op@portal.internal",
          name: "Operacional",
          role: "SUPERADMIN",
          ativo: true,
          isSuperAdmin: true,
          adminRole: "ADMIN_OPERACIONAL",
        },
      });
      const opFin = await exigirAdmin("financeiro", "escrever");
      expect(opFin.ok).toBe(true);
      const opSis = await exigirAdmin("sistema", "escrever");
      expect(opSis.ok).toBe(false);

      mockGetServerSession.mockResolvedValue({
        user: {
          id: "adm_master",
          email: "vitorhenrique018@gmail.com",
          name: "Vítor Master",
          role: "SUPERADMIN",
          ativo: true,
          isSuperAdmin: true,
          adminRole: "SUPERADMIN_MASTER",
        },
      });
      const masterSis = await exigirAdmin("sistema", "escrever");
      expect(masterSis.ok).toBe(true);
    });
  });

  describe("9. Fluxo Ponta-a-Ponta de Disputa de CNPJ & Transferência de Titularidade", () => {
    it("deve registrar disputa via disputeClaimCnpj, exibir no Dossiê 360º e transferir titularidade ao aprovar no ADM", async () => {
      const emp = await salvarEmpresaClienteSuperAdmin({
        ownerUserId: "usr_demo_titular",
        cnpj: "33.000.167/0001-01",
        razaoSocial: "EMPRESA DISPUTA CNPJ LTDA",
        nomeFantasia: "Empresa Disputa",
        uf: "SP",
        cidade: "São Paulo",
        plano: "PRO",
        billingStatus: "ATIVO",
      });

      const disputa = await disputeClaimCnpj({
        userId: "usr_novo_titular_cnpj",
        userEmail: "novo.titular@disputa.com.br",
        userName: "Novo Titular Legal",
        input: {
          cnpj: "33.000.167/0001-01",
          motivo: "Alteração contratual registrada na JUCESP transferindo administração.",
          metodo: "SUPORTE_DOCUMENTAL",
        },
      });

      const dossie = await obterDossieCliente360SuperAdmin(emp.empresa.id);
      const pendente = dossie.disputas.find((d) => d.id === disputa.protocolo);
      expect(pendente).toBeDefined();
      expect(pendente?.status).toBe("PENDENTE");

      const resolucao = await resolverDisputaCnpjSuperAdmin(
        disputa.protocolo,
        "APROVADA",
        "Vítor Master",
      );
      expect(resolucao.ok).toBe(true);
      expect(resolucao.status).toBe("APROVADA");
      expect(resolucao.titularTransferidoParaUserId).toBe("usr_novo_titular_cnpj");

      const vinculoNovoTitular = inMemoryTenantUsers.find(
        (m) => m.tenantId === emp.empresa.id && m.userId === "usr_novo_titular_cnpj",
      );
      expect(vinculoNovoTitular?.role).toBe("TITULAR");
      expect(vinculoNovoTitular?.ativo).toBe(true);
    });
  });

  describe("10. Renderização das Telas Carbon do Portal ADM, Alternância Kanban/Lista e Banner Cliente", () => {
    const mockTenants = [
      {
        id: "tnt_mock_1",
        cnpj: "12.345.678/0001-90",
        razaoSocial: "Alpha Tecnologia Ltda",
        nomeFantasia: "Alpha Tech",
        plano: "PRO",
        billingStatus: "TRIAL",
        diasRestantesTrial: 10,
        diasAtraso: 0,
        valorMensalidade: 97,
        titularNome: "João Silva",
        titularEmail: "joao@alphatech.com.br",
        ativo: true,
        cotaBaseMb: 5120,
        cotaExtraMb: 0,
        cotaTotalMb: 5120,
        espacoUsadoMb: 120,
        percentualUsado: 2,
        totalContempladas: 1,
        volumeArrematado: 250000,
        totalLicitacoesKanban: 4,
        totalDocumentosCofre: 6,
        totalUsuarios: 2,
        aiUsadasMes: 3,
        gastoIaDiaBrl: 1.5,
        gastoIaMesBrl: 12.4,
        onboarding: {
          contaCriada: true,
          cnpjCadastrado: true,
          filtrosConfigurados: true,
          empresaPreenchida: false,
          documentoCofreEnviado: false,
          licitacaoNoKanban: true,
          iaOuCalculadoraUsada: false,
          score: 4,
          percentual: 57,
          statusEngajamento: "EM_CONFIGURACAO",
        },
        criadoEm: new Date().toISOString(),
      },
    ];

    const mockTickets = [
      {
        id: "tkt_1",
        protocolo: "PROT-202611-0001",
        tenantId: "tnt_mock_1",
        userId: "usr_1",
        autorNome: "João Silva",
        autorEmail: "joao@alphatech.com.br",
        autorTelefone: "62999990000",
        categoria: "DUVIDA",
        urgencia: "ALTA",
        assunto: "Dúvida sobre limite de IA",
        status: "ABERTO",
        criadoEm: new Date().toISOString(),
        atualizadoEm: new Date().toISOString(),
        concluidoEm: null,
        mensagens: [
          {
            id: "msg_1",
            ticketId: "tkt_1",
            autorId: "usr_1",
            autorNome: "João Silva",
            autorTipo: "CLIENTE",
            mensagem: "Preciso de ajuda com cota.",
            criadoEm: new Date().toISOString(),
          },
        ],
      },
    ];

    beforeEach(() => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL) => {
          const url = String(input);
          let payload: unknown = {};
          if (url.startsWith("/api/admin/tenants")) payload = mockTenants;
          else if (url.startsWith("/api/admin/metricas")) {
            payload = {
              mrrEstimado: 970,
              arrEstimado: 11640,
              receitaEmRisco: 194,
              tenantsAtivos: 10,
              tenantsTrial: 3,
              tenantsGracePeriod: 1,
              tenantsBloqueados: 1,
              tenantsCancelados: 0,
              novosClientesHoje: 1,
              novosClientes7d: 4,
              novosClientes30d: 12,
              trialsEngajados: 2,
              trialsAbandonados: 1,
              totalVolumeArrematado: 500000,
              totalLicitacoesContempladas: 2,
              r2StorageTotalMb: 2048,
              whatsappInstanciaConectada: true,
              whatsappFilaPendentes: 2,
              gastoIaHojeBrl: 4.2,
              gastoIaMesBrl: 58.9,
              tokensIaHoje: 25000,
              chamadasIaHoje: 8,
              ticketsAbertos: 1,
              comissoesPendentesBrl: 120,
              ultimaColetaStatus: "CONCLUIDO",
              ultimaColetaEm: new Date().toISOString(),
              ultimasVitorias: [],
            };
          } else if (url.startsWith("/api/admin/clientes/")) {
            payload = {
              tenantId: "tnt_mock_1",
              tenant: mockTenants[0],
              titular: {
                id: "usr_1",
                name: "João Silva",
                email: "joao@alphatech.com.br",
                cpf: null,
                telefone: "62999990000",
                cidade: "Goiânia",
                uf: "GO",
                ativo: true,
                sessionVersion: 1,
                ultimoLoginEm: new Date().toISOString(),
              },
              onboarding: mockTenants[0].onboarding,
              empresas: [mockTenants[0]],
              usuarios: [
                {
                  id: "usr_1",
                  name: "João Silva",
                  email: "joao@alphatech.com.br",
                  role: "DIRETORIA",
                  ativo: true,
                  tenantRole: "TITULAR",
                  tenants: ["tnt_mock_1"],
                  telefone: "62999990000",
                  ultimoLoginEm: new Date().toISOString(),
                },
              ],
              patrimonioOperacional: {
                licitacoes: [],
                kanbanPorColuna: {},
                documentos: { total: 0, vencidos: 0, bytes: 0, lista: [] },
                portais: 0,
                impugnacoes: 0,
                precosSalvos: 0,
              },
              cotas: {
                maxCnpjs: 2,
                maxUsers: 2,
                storageBaseMb: 5120,
                storageExtraQuotaMb: 0,
                storageTotalMb: 5120,
                storageUsadoMb: 120,
                aiExtraQuotaMes: 0,
                aiUsadasMes: 3,
              },
              notasInternasAdm: null,
              disputas: [],
            };
          } else if (url.startsWith("/api/admin/financeiro")) {
            payload = { clientes: mockTenants, cupons: [] };
          } else if (url.startsWith("/api/admin/afiliados")) {
            payload = { afiliados: [], comissoes: [] };
          } else if (url.startsWith("/api/admin/suporte")) {
            payload = { tickets: mockTickets };
          } else if (url.startsWith("/api/admin/avisos")) {
            payload = { avisos: [] };
          } else if (url.startsWith("/api/admin/whatsapp")) {
            payload = {
              instanciaConectada: true,
              nomeInstancia: "portal-main",
              filaTamanho: 0,
              totalEnviadas: 15,
              totalOptOuts: 0,
              provedorConfigurado: true,
              config: {
                minDelaySegundos: 8,
                maxDelaySegundos: 25,
                limiteDiarioWarmup: 30,
                janelaInicio: "08:00",
                janelaFim: "18:00",
              },
              fila: [],
              optOuts: [],
            };
          } else if (url.startsWith("/api/admin/ia")) {
            payload = {
              totalTokensHoje: 12000,
              chamadasHoje: 4,
              gastoHojeBrl: 2.5,
              gastoHojeUsd: 0.45,
              totalTokensMes: 120000,
              chamadasMes: 32,
              gastoMesBrl: 25.0,
              gastoMesUsd: 4.54,
              cotacaoUsdBrl: 5.5,
              porCliente: [],
              porUsuario: [],
              porFeature: [],
              porModelo: [],
              serieDiaria: [],
              ultimasChamadas: [],
            };
          } else if (url.startsWith("/api/admin/licitacoes")) {
            payload = { licitacoes: [], execucoes: [] };
          } else if (url.startsWith("/api/admin/sistema")) {
            payload = { usuarios: [], logs: [] };
          } else if (url.startsWith("/api/avisos/ativos")) {
            payload = {
              avisos: [
                {
                  id: "bc_smoke_1",
                  titulo: "Manutenção Programada",
                  mensagem: "Janela preventiva neste domingo.",
                  severidade: "ATENCAO",
                  formato: "AMBOS",
                  linkDestino: "/dashboard",
                },
              ],
            };
          }

          return new Response(JSON.stringify(payload), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }),
      );
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("deve renderizar /admin/login, Dashboard, Clientes, Cliente 360º, Financeiro, Afiliados, Avisos, WhatsApp, IA, Licitações e Sistema", async () => {
      const s0 = render(<AdminLoginPage />);
      expect(screen.getByText(/Entrar no Portal ADM/i)).toBeInTheDocument();
      s0.unmount();

      const s1 = render(<SuperAdminDashboard />);
      await waitFor(() => expect(screen.getByText("MRR ESTIMADO (MENSAL)")).toBeInTheDocument());
      s1.unmount();

      const s2 = render(<ClientesScreen />);
      await waitFor(() => expect(screen.getByText("Alpha Tech")).toBeInTheDocument());
      s2.unmount();

      const s3 = render(<Cliente360Screen tenantId="tnt_mock_1" />);
      await waitFor(() => expect(screen.getByText(/Termômetro de configuração — 4\/7/i)).toBeInTheDocument());
      s3.unmount();

      const s4 = render(<FinanceiroScreen />);
      await waitFor(() => expect(screen.getByText("Acompanhamento Financeiro & Planos")).toBeInTheDocument());
      s4.unmount();

      const s5 = render(<AfiliadosScreen />);
      await waitFor(() => expect(screen.getByText("Controle de Afiliados & Comissões PIX")).toBeInTheDocument());
      s5.unmount();

      const s6 = render(<AvisosScreen />);
      expect(screen.getByText("Disparo de Avisos em Massa")).toBeInTheDocument();
      s6.unmount();

      const s7 = render(<WhatsAppScreen />);
      await waitFor(() => expect(screen.getByText("Configuração do WhatsApp & QR Code")).toBeInTheDocument());
      s7.unmount();

      const s8 = render(<IaConsumoScreen />);
      await waitFor(() => expect(screen.getByText("Consumo & Custos Diários de IA")).toBeInTheDocument());
      s8.unmount();

      const s9 = render(<LicitacoesAdminScreen />);
      expect(screen.getByText("Catálogo de Licitações, Injeção Manual & PNCP")).toBeInTheDocument();
      s9.unmount();

      const s10 = render(<SistemaAdminScreen />);
      expect(screen.getByText("Equipe ADM & Logs Administrativos")).toBeInTheDocument();
      s10.unmount();
    });

    it("deve alternar SuporteAdminScreen entre Quadro Kanban e Lista (Tabela)", async () => {
      render(<SuporteAdminScreen />);
      await waitFor(() => expect(screen.getByText("PROT-202611-0001")).toBeInTheDocument());
      expect(screen.getByText("Aberto")).toBeInTheDocument();

      const btnLista = screen.getByRole("tab", { name: "Lista (Tabela)" });
      fireEvent.click(btnLista);

      await waitFor(() => expect(screen.getByText("Atender")).toBeInTheDocument());
    });

    it("deve exibir SystemBroadcastBanner quando /api/avisos/ativos retornar aviso ativo e link interno seguro", async () => {
      render(<SystemBroadcastBanner />);
      await waitFor(() => expect(screen.getByTestId("system-broadcast-banner")).toBeInTheDocument());
      expect(screen.getByText(/Janela preventiva neste domingo\./i)).toBeInTheDocument();
      const link = screen.getByRole("link", { name: "Ver detalhes" });
      expect(link).toHaveAttribute("href", "/dashboard");
    });
  });

  describe("11. Regressões & Controles Críticos Pós-Code Review (Issue #49)", () => {
    afterEach(() => {
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
      mockGetServerSession.mockReset();
      mockSignIn.mockReset();
      mockSignOut.mockReset();
      mockRouterPush.mockReset();
      mockRouterRefresh.mockReset();
    });

    it("fail-closed RBAC: adminPodeAcessar, exigirAdmin (sem adminRole), AdminShell e AdminLoginPage não-admin", async () => {
      expect(adminPodeAcessar(null, "dashboard", "ler")).toBe(false);
      expect(adminPodeAcessar(undefined, "clientes", "ler")).toBe(false);
      expect(adminPodeAcessar("", "suporte", "ler")).toBe(false);
      expect(adminPodeAcessar("ROLE_DESCONHECIDO", "dashboard", "ler")).toBe(false);

      mockGetServerSession.mockResolvedValueOnce({
        user: {
          id: "adm_sem_role",
          email: "sem.role@portal.internal",
          role: "SUPERADMIN",
          isSuperAdmin: true,
          ativo: true,
        },
      });
      const semRoleGuard = await exigirAdmin("dashboard", "ler");
      expect(semRoleGuard.ok).toBe(false);
      if (!semRoleGuard.ok) expect(semRoleGuard.response.status).toBe(404);

      const shellN1 = render(
        <AdminShell adminRole="SUPORTE_N1">
          <div>N1</div>
        </AdminShell>,
      );
      expect(screen.getByText("Dashboard Executivo")).toBeInTheDocument();
      expect(screen.getByText("Clientes 360º")).toBeInTheDocument();
      expect(screen.getByText("Suporte (Lista & Kanban)")).toBeInTheDocument();
      expect(screen.getByText("Licitações & PNCP")).toBeInTheDocument();
      expect(screen.queryByText("Financeiro & Planos")).not.toBeInTheDocument();
      expect(screen.queryByText("Equipe ADM & Logs")).not.toBeInTheDocument();
      shellN1.unmount();

      const shellNull = render(
        <AdminShell adminRole={null}>
          <div>Fail-Closed</div>
        </AdminShell>,
      );
      expect(screen.queryByText("Dashboard Executivo")).not.toBeInTheDocument();
      shellNull.unmount();

      mockSignIn.mockResolvedValue({ ok: true, error: null });
      mockSignOut.mockResolvedValue({ url: "/admin/login" });
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response(JSON.stringify({ error: "Página não encontrada" }), { status: 404 })),
      );

      const loginView = render(<AdminLoginPage />);
      fireEvent.change(screen.getByLabelText("E-mail administrativo"), {
        target: { value: "cliente@empresa.com.br" },
      });
      fireEvent.change(screen.getByLabelText("Senha"), {
        target: { value: "123456" },
      });
      fireEvent.click(screen.getByRole("button", { name: /Entrar no Portal ADM/i }));

      await waitFor(() =>
        expect(screen.getByText(/Conta sem permissão para acessar o Portal ADM\./i)).toBeInTheDocument(),
      );
      expect(mockSignOut).toHaveBeenCalledWith({ redirect: false });
      expect(mockRouterPush).not.toHaveBeenCalledWith("/admin");
      loginView.unmount();
    });

    it("consumo atômico de cupons: rejeita expirado/esgotado/inativo, respeita maxUsos e preserva pagante ATIVO", async () => {
      const alvo = await salvarEmpresaClienteSuperAdmin({
        ownerUserId: "usr_demo_titular",
        cnpj: gerarCnpjValido("44556677"),
        razaoSocial: "PAGANTE CUPOM TESTE LTDA",
        uf: "GO",
        cidade: "Goiânia",
        plano: "PRO",
        billingStatus: "ATIVO",
      });

      const expirado = await salvarCupomSuperAdmin({
        codigo: "EXPIRADO49",
        descricao: "Expirado",
        descontoPercentual: 15,
        diasExtrasTrial: 7,
        ativo: true,
        expiraEm: new Date(Date.now() - 86400000).toISOString(),
      });
      expect(expirado.ok).toBe(true);
      expect(consumirCupomMemoriaSuperAdmin("EXPIRADO49")).toBe(false);
      await expect(
        executarAcaoFinanceiraSuperAdmin({
          tenantId: alvo.empresa.id,
          action: "APLICAR_CUPOM",
          cupomCodigo: "EXPIRADO49",
        }),
      ).rejects.toMatchObject({ statusCode: 400 });

      await salvarCupomSuperAdmin({
        codigo: "INATIVO49",
        descricao: "Inativo",
        descontoPercentual: 10,
        diasExtrasTrial: 0,
        ativo: false,
      });
      expect(consumirCupomMemoriaSuperAdmin("INATIVO49")).toBe(false);

      await salvarCupomSuperAdmin({
        codigo: "UNICO49",
        descricao: "Limite 1 uso",
        descontoPercentual: 30,
        diasExtrasTrial: 5,
        maxUsos: 1,
        ativo: true,
      });

      const primeiroUso = await executarAcaoFinanceiraSuperAdmin({
        tenantId: alvo.empresa.id,
        action: "APLICAR_CUPOM",
        cupomCodigo: "UNICO49",
      });
      expect(primeiroUso.ok).toBe(true);
      expect(primeiroUso.tenant.cupomCodigo).toBe("UNICO49");
      expect(primeiroUso.tenant.billingStatus).toBe("ATIVO");

      await expect(
        executarAcaoFinanceiraSuperAdmin({
          tenantId: alvo.empresa.id,
          action: "APLICAR_CUPOM",
          cupomCodigo: "UNICO49",
        }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("barreira anti-IDOR em PATCH /api/admin/clientes/[id]: retorna 403 quando target pertence a outro cliente", async () => {
      mockGetServerSession.mockResolvedValue({
        user: {
          id: "adm_master",
          email: "vitorhenrique018@gmail.com",
          name: "Vítor Master",
          role: "SUPERADMIN",
          ativo: true,
          isSuperAdmin: true,
          adminRole: "SUPERADMIN_MASTER",
        },
      });

      const empA = await salvarEmpresaClienteSuperAdmin({
        cnpj: gerarCnpjValido("55667788"),
        razaoSocial: "CLIENTE ALVO IDOR A LTDA",
        uf: "GO",
        cidade: "Goiânia",
        plano: "PRO",
        billingStatus: "ATIVO",
      });
      const cnpjB = gerarCnpjValido("66778899");
      const empB = await salvarEmpresaClienteSuperAdmin({
        cnpj: cnpjB,
        razaoSocial: "CLIENTE ALHEIO IDOR B LTDA",
        uf: "SP",
        cidade: "São Paulo",
        plano: "PRO",
        billingStatus: "ATIVO",
      });
      const usrB = await salvarUsuarioClienteSuperAdmin({
        tenantId: empB.empresa.id,
        name: "Usuário B Isolado",
        email: `idor.b.${Date.now()}@empresa.com.br`,
        role: "ANALISTA_COMERCIAL",
        tenantRole: "MEMBRO",
        ativo: true,
      });
      const dispB = await disputeClaimCnpj({
        userId: "usr_disp_b",
        userEmail: "disp.b@empresa.com.br",
        userName: "Requerente B",
        input: {
          cnpj: cnpjB,
          motivo: "Disputa pertencente apenas ao cliente B",
          metodo: "SUPORTE_DOCUMENTAL",
        },
      });

      const callPatch = (body: Record<string, unknown>) =>
        clientePatchRoute(
          new NextRequest(`http://localhost:3011/api/admin/clientes/${empA.empresa.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }),
          { params: Promise.resolve({ id: empA.empresa.id }) },
        );

      const resConta = await callPatch({
        tipo: "conta",
        userId: usrB.usuario.id,
        name: "Tentativa Cruzada",
      });
      expect(resConta.status).toBe(403);

      const resEmpresa = await callPatch({
        tipo: "empresa",
        tenantId: empB.empresa.id,
        cnpj: cnpjB,
        razaoSocial: "Alteração Indevida",
      });
      expect(resEmpresa.status).toBe(403);

      const resDisputa = await callPatch({
        tipo: "disputa",
        disputaId: dispB.protocolo,
        status: "APROVADA",
      });
      expect(resDisputa.status).toBe(403);
    });

    it("WhatsApp anti-ban: valida minDelay <= maxDelay (400), respeita janela BRT, opt-out e limiteDiarioWarmup", async () => {
      resetInMemoryWhatsAppStoreForTesting();
      mockGetServerSession.mockResolvedValue({
        user: {
          id: "adm_master",
          email: "vitorhenrique018@gmail.com",
          name: "Vítor Master",
          role: "SUPERADMIN",
          ativo: true,
          isSuperAdmin: true,
          adminRole: "SUPERADMIN_MASTER",
        },
      });

      try {
        const resInvalido = await whatsappPostRoute(
          new NextRequest("http://localhost:3011/api/admin/whatsapp", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              acao: "config",
              minDelaySegundos: 20,
              maxDelaySegundos: 5,
              limiteDiarioWarmup: 10,
              janelaInicio: "08:00",
              janelaFim: "18:00",
            }),
          }),
        );
        expect(resInvalido.status).toBe(400);

        await atualizarConfigWhatsAppSuperAdmin({
          minDelaySegundos: 4,
          maxDelaySegundos: 9,
          limiteDiarioWarmup: 1,
          janelaInicio: "08:00",
          janelaFim: "18:00",
        });

        const hojeBrt = new Date().toLocaleDateString("sv-SE", {
          timeZone: "America/Sao_Paulo",
        });
        const foraJanela = new Date(`${hojeBrt}T22:30:00-03:00`);
        const dentroJanela = new Date(`${hojeBrt}T12:00:00-03:00`);
        const baseTs = Math.min(Date.now(), dentroJanela.getTime()) - 10_000;

        const msgOptOut = await enfileirarMensagemWhatsApp({
          destinatario: "5562991112233",
          mensagem: "Mensagem antes do opt-out",
          tipo: "ALERTA",
          agendadoPara: new Date(baseTs),
        });
        await registrarOptOutWhatsApp("5562991112233", "Teste anti-ban");

        await enfileirarMensagemWhatsApp({
          destinatario: "5562994445566",
          mensagem: "Mensagem dentro do warmup",
          tipo: "ALERTA",
          agendadoPara: new Date(baseTs + 1000),
        });
        await enfileirarMensagemWhatsApp({
          destinatario: "5562997778899",
          mensagem: "Mensagem excedente do warmup",
          tipo: "ALERTA",
          agendadoPara: new Date(baseTs + 2000),
        });

        const rFora = await processarFilaWhatsAppComJitter({
          respeitarJanela: true,
          referencia: foraJanela,
        });
        expect(rFora.motivoBloqueio).toBe("FORA_DA_JANELA");
        expect(rFora.processados).toHaveLength(0);

        const rOptOut = await processarFilaWhatsAppComJitter({
          respeitarJanela: true,
          limite: 10,
          referencia: dentroJanela,
        });
        expect(rOptOut.processados).toHaveLength(1);
        expect(rOptOut.processados[0].id).toBe(msgOptOut.id);
        expect(rOptOut.processados[0].status).toBe("PAUSADO_OPT_OUT");

        const rDentro = await processarFilaWhatsAppComJitter({
          respeitarJanela: true,
          limite: 10,
          referencia: dentroJanela,
        });
        expect(rDentro.motivoBloqueio).toBeNull();
        expect(rDentro.processados).toHaveLength(1);
        expect(rDentro.processados[0].status).toBe("ENVIADO");

        const rLimite = await processarFilaWhatsAppComJitter({
          respeitarJanela: true,
          limite: 10,
          referencia: dentroJanela,
        });
        expect(rLimite.motivoBloqueio).toBe("LIMITE_DIARIO_ATINGIDO");
        expect(rLimite.processados).toHaveLength(0);
      } finally {
        resetInMemoryWhatsAppStoreForTesting();
        await atualizarConfigWhatsAppSuperAdmin({
          minDelaySegundos: 4,
          maxDelaySegundos: 9,
          limiteDiarioWarmup: 30,
          janelaInicio: "08:00",
          janelaFim: "18:00",
        });
      }
    });

    it("equipe ADM: POST /api/admin/sistema nega ADMIN_OPERACIONAL/SUPORTE_N1 (404) e impede auto-inativação", async () => {
      for (const papel of ["ADMIN_OPERACIONAL", "SUPORTE_N1"] as const) {
        mockGetServerSession.mockResolvedValueOnce({
          user: {
            id: `adm_${papel}`,
            email: `${papel.toLowerCase()}@portal.internal`,
            role: "SUPERADMIN",
            isSuperAdmin: true,
            adminRole: papel,
            ativo: true,
          },
        });
        const res = await sistemaPostRoute(
          new NextRequest("http://localhost:3011/api/admin/sistema", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: "Invasor ADM",
              email: "invasor@portal.internal",
              adminRole: "SUPERADMIN_MASTER",
              ativo: true,
            }),
          }),
        );
        expect(res.status).toBe(404);
      }

      const criado = await salvarUsuarioAdminSuperAdmin({
        name: "Admin Auto Proteção",
        email: `autoprotecao.${Date.now()}@portal.internal`,
        adminRole: "SUPERADMIN_MASTER",
        ativo: true,
      });

      await expect(
        runWithAuditActorContext(
          { usuarioId: criado.usuario.id, usuarioNome: criado.usuario.name },
          () =>
            salvarUsuarioAdminSuperAdmin({
              id: criado.usuario.id,
              name: criado.usuario.name,
              email: criado.usuario.email,
              adminRole: "SUPERADMIN_MASTER",
              ativo: false,
            }),
        ),
      ).rejects.toThrow("Você não pode desativar sua própria conta administrativa.");
    });

    it("onboarding de novo trial recém-cadastrado (sem edição posterior) deve pontuar 2/7 (CADASTROU_E_SAIU)", async () => {
      const cad = await realizarCadastroConta({
        cnpj: gerarCnpjValido("77889900"),
        razaoSocial: "NOVO TRIAL ONBOARDING LTDA",
        nomeResponsavel: "Ana Trial",
        email: `ana.trial.${Date.now()}@gmail.com`,
        whatsapp: "62991234567",
        senha: "SenhaForte@2026",
        segmentos: ["ALIMENTACAO"],
        subsegmentos: [],
        ufs: ["SP"],
        brasilInteiro: false,
      });

      const dossie = await obterDossieCliente360SuperAdmin(cad.tenantId);
      expect(dossie.onboarding.contaCriada).toBe(true);
      expect(dossie.onboarding.cnpjCadastrado).toBe(true);
      expect(dossie.onboarding.filtrosConfigurados).toBe(false);
      expect(dossie.onboarding.empresaPreenchida).toBe(false);
      expect(dossie.onboarding.score).toBe(2);
      expect(dossie.onboarding.statusEngajamento).toBe("CADASTROU_E_SAIU");
    });

    it("cota multi-tenant de IA soma memória + banco sem duplicar o mesmo CNPJ", async () => {
      const uid = `usr_multi_ia_${Date.now()}`;
      const tidMem = `tnt_ia_mem_${Date.now()}`;
      const tidDb = `tnt_ia_db_${Date.now()}`;

      inMemoryTenants.set(tidMem, {
        id: tidMem,
        cnpj: gerarCnpjValido("88990011"),
        razaoSocial: "MULTI IA MEM LTDA",
        nomeFantasia: null,
        plano: "PRO",
        billingStatus: "ATIVO",
        maxCnpjs: 5,
        maxUsers: 5,
        ativo: true,
        segmentos: ["ALIMENTACAO"],
        subsegmentos: [],
        ufs: ["GO"],
        brasilInteiro: false,
        criadoEm: new Date(),
        updatedAt: new Date(),
      });
      inMemoryTenants.set(tidDb, {
        id: tidDb,
        cnpj: gerarCnpjValido("99001122"),
        razaoSocial: "MULTI IA DB LTDA",
        nomeFantasia: null,
        plano: "PRO",
        billingStatus: "ATIVO",
        maxCnpjs: 5,
        maxUsers: 5,
        ativo: true,
        segmentos: ["ALIMENTACAO"],
        subsegmentos: [],
        ufs: ["SP"],
        brasilInteiro: false,
        criadoEm: new Date(),
        updatedAt: new Date(),
      });
      inMemoryTenantUsers.push(
        {
          id: `tu_${tidMem}`,
          tenantId: tidMem,
          userId: uid,
          userEmail: "multi@ia.com.br",
          userName: "Multi IA",
          role: "TITULAR",
          ativo: true,
          criadoEm: new Date(),
        },
        {
          id: `tu_${tidDb}`,
          tenantId: tidDb,
          userId: uid,
          userEmail: "multi@ia.com.br",
          userName: "Multi IA",
          role: "MEMBRO",
          ativo: true,
          criadoEm: new Date(),
        },
      );
      setMemoryTenantExtraAiQuota(tidMem, 3);

      vi.spyOn(prisma.tenant, "findMany").mockResolvedValue([
        { id: tidMem, aiExtraQuotaMes: 3, plano: "PRO" },
        { id: tidDb, aiExtraQuotaMes: 4, plano: "PRO" },
      ] as unknown as Awaited<ReturnType<typeof prisma.tenant.findMany>>);

      try {
        const status = await obterStatusCotaAnaliseIA(tidMem, new Date(), uid);
        expect(status.limite).toBe(22); // 15 base PRO + max(3,3) + 4 = 22
      } finally {
        memoryTenantExtraAiQuota.delete(tidMem);
        memoryTenantExtraAiQuota.delete(tidDb);
        inMemoryTenants.delete(tidMem);
        inMemoryTenants.delete(tidDb);
        for (let i = inMemoryTenantUsers.length - 1; i >= 0; i--) {
          if (inMemoryTenantUsers[i].userId === uid) inMemoryTenantUsers.splice(i, 1);
        }
      }
    });

    it("aviso em massa SINO+AMBOS entrega N12_AVISO_SISTEMA, aparece em /api/avisos/ativos e rejeita link externo malicioso", async () => {
      const uid = `usr_bc_${Date.now()}`;
      const emp = await salvarEmpresaClienteSuperAdmin({
        cnpj: gerarCnpjValido("12131415"),
        razaoSocial: "CLIENTE BROADCAST SINO LTDA",
        uf: "MG",
        cidade: "Belo Horizonte",
        plano: "PRO",
        billingStatus: "ATIVO",
      });
      inMemoryTenantUsers.push({
        id: `tu_bc_${Date.now()}`,
        tenantId: emp.empresa.id,
        userId: uid,
        userEmail: "bc@cliente.com.br",
        userName: "Cliente Broadcast",
        role: "TITULAR",
        ativo: true,
        criadoEm: new Date(),
      });

      const aviso = await criarAvisoEmMassaSuperAdmin({
        titulo: "Comunicado Crítico SINO",
        mensagem: "Confira o novo módulo disponível.",
        severidade: "ATENCAO",
        formato: "AMBOS",
        publicoAlvo: "ESPECIFICO",
        targetIds: [emp.empresa.id],
        linkDestino: "/notificacoes",
      });
      expect(aviso.ok).toBe(true);

      const notifs = await listNotificacoes(uid);
      const n12 = notifs.notificacoes.find((n) => n.tipo === "N12_AVISO_SISTEMA");
      expect(n12).toBeDefined();
      expect(n12?.titulo).toBe("Comunicado Crítico SINO");

      mockGetServerSession.mockResolvedValue({
        user: {
          id: uid,
          email: "bc@cliente.com.br",
          role: "DIRETORIA",
          ativo: true,
          activeTenantId: emp.empresa.id,
        },
      });
      const resAtivos = await avisosAtivosGetRoute(
        new NextRequest(
          `http://localhost:3011/api/avisos/ativos?tenantId=${encodeURIComponent(emp.empresa.id)}`,
        ),
      );
      expect(resAtivos.status).toBe(200);
      const jsonAtivos = (await resAtivos.json()) as {
        avisos: Array<{ titulo: string }>;
      };
      expect(jsonAtivos.avisos.some((a) => a.titulo === "Comunicado Crítico SINO")).toBe(true);

      vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
          new Response(
            JSON.stringify({
              avisos: [
                {
                  id: "bc_malicioso",
                  titulo: "Aviso Malicioso",
                  mensagem: "Link externo não permitido.",
                  severidade: "INFO",
                  formato: "AMBOS",
                  linkDestino: "https://evil.example/phish",
                },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        ),
      );
      const bannerMal = render(<SystemBroadcastBanner />);
      await waitFor(() =>
        expect(screen.getByText(/Link externo não permitido\./i)).toBeInTheDocument(),
      );
      expect(screen.queryByRole("link", { name: "Ver detalhes" })).not.toBeInTheDocument();
      bannerMal.unmount();

      for (let i = inMemoryTenantUsers.length - 1; i >= 0; i--) {
        if (inMemoryTenantUsers[i].userId === uid) inMemoryTenantUsers.splice(i, 1);
      }
    });
  });
});

