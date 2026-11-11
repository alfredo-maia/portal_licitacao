import React from "react";
import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { NextRequest } from "next/server";

const {
  mockGetServerSession,
  mockSignIn,
  mockSignOut,
  mockRouterPush,
  mockRouterRefresh,
  mockPathnameState,
} = vi.hoisted(() => ({
  mockGetServerSession: vi.fn(),
  mockSignIn: vi.fn(),
  mockSignOut: vi.fn(),
  mockRouterPush: vi.fn(),
  mockRouterRefresh: vi.fn(),
  mockPathnameState: { value: "/admin" },
}));

vi.mock("next-auth/next", () => ({
  getServerSession: mockGetServerSession,
}));

vi.mock("next-auth/react", () => ({
  signIn: mockSignIn,
  signOut: mockSignOut,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathnameState.value,
  useParams: () => ({ id: "lic_reanalise_1" }),
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({
    push: mockRouterPush,
    replace: vi.fn(),
    refresh: mockRouterRefresh,
  }),
}));

vi.mock("@/providers/theme-provider", () => ({
  useAppTheme: () => ({
    theme: "white",
    isDark: false,
    toggleTheme: vi.fn(),
    setTheme: vi.fn(),
  }),
}));

import { prisma } from "@/lib/prisma";
import { maskCnpj, maskCpf, maskPhone } from "@/lib/masks";
import {
  insertInMemoryDocumento,
  insertInMemoryLicitacao,
  insertInMemoryLicitacaoAnaliseIA,
  resetInMemoryLicitacoes,
  setInMemoryTenantLicitacao,
} from "@/server/services/licitacoes-store";
import {
  createTenantForUser,
  inMemoryTenants,
  inMemoryTenantUsers,
  resetInMemoryTenantStorage,
} from "@/server/services/tenant.service";
import {
  adicionarMensagemTicketSuporte,
  criarTicketSuporte,
} from "@/server/services/suporte.service";
import { AdminFinanceiroActionSchema, ADMIN_ROUTES } from "@/server/schemas/superadmin.schema";
import {
  memAdminUsers,
  memAffiliates,
  memAiLogs,
  memBroadcasts,
  memCommissions,
  memCoupons,
  memDisputes,
  memLicitacoesExcluidas,
  memTenantExtras,
  memUsers,
  memoryTenantExtraQuota,
  resetMemSettings,
} from "@/server/services/superadmin/shared";
import {
  atualizarCotasClienteSuperAdmin,
  executarAcaoFinanceiraSuperAdmin,
  injetarLicitacaoNoKanbanClienteSuperAdmin,
  listarTenantsSuperAdmin,
  obterDossieCliente360SuperAdmin,
  obterMetricasSuperAdmin,
  registrarConsumoIaSuperAdmin,
  salvarEmpresaClienteSuperAdmin,
} from "@/server/services/superadmin.service";
import { GET as metricasGET } from "@/app/api/admin/metricas/route";
import { GET as financeiroGET } from "@/app/api/admin/financeiro/route";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminNotificationsBell } from "@/components/admin/AdminNotificationsBell";
import { NotificacoesAdminScreen } from "@/components/admin/screens/NotificacoesAdminScreen";
import { SuperAdminDashboard } from "@/components/admin/SuperAdminDashboard";
import { ClientesScreen } from "@/components/admin/screens/ClientesScreen";
import { Cliente360Screen } from "@/components/admin/screens/Cliente360Screen";
import { FinanceiroScreen } from "@/components/admin/screens/FinanceiroScreen";
import { LicitacoesAdminScreen } from "@/components/admin/screens/LicitacoesAdminScreen";
import { AppShell } from "@/components/shell/app-shell";

function gerarCnpjValido(baseOitoDigitos: string): string {
  const base12 = `${baseOitoDigitos.padStart(8, "0").slice(0, 8)}0001`
    .split("")
    .map(Number);
  const calcDv = (nums: number[], pesos: number[]) => {
    const soma = nums.reduce((acc, n, i) => acc + n * pesos[i], 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const dv1 = calcDv(base12, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const base13 = [...base12, dv1];
  const dv2 = calcDv(base13, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return [...base13, dv2].join("");
}

function resetStores() {
  resetInMemoryTenantStorage();
  resetInMemoryLicitacoes();
  memAffiliates.clear();
  memCommissions.clear();
  memCoupons.clear();
  memBroadcasts.clear();
  memDisputes.clear();
  memAdminUsers.clear();
  memUsers.clear();
  memTenantExtras.clear();
  memAiLogs.length = 0;
  memLicitacoesExcluidas.clear();
  memoryTenantExtraQuota.clear();
  resetMemSettings();
}

describe("Issue #51 — Novos Ajustes (Portal ADM & Área do Cliente)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    resetStores();
    mockPathnameState.value = "/admin";
    vi.spyOn(prisma.auditLog, "create").mockRejectedValue(new Error("Offline test DB"));
    vi.spyOn(prisma.adminSetting, "upsert").mockRejectedValue(new Error("Offline test DB"));
    vi.spyOn(prisma.adminSetting, "findUnique").mockRejectedValue(new Error("Offline test DB"));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /* -------------------------------------------------------------------------
     FRENTE 1 — Geral ADM: Nav Bar, Paginação Global, Máscaras & Notificações ADM
  ------------------------------------------------------------------------- */
  describe("Frente 1 — Geral ADM, Máscaras, Header Order & Notificações ADM", () => {
    it("1.1 Mantém 10 rotas no SideNav, possui CSS com maior espaçamento vertical e ordena Header ADM (Notificações -> Tema -> Perfil/Config -> Sair)", () => {
      expect(ADMIN_ROUTES).toHaveLength(10);

      const scss = fs.readFileSync(
        path.resolve(process.cwd(), "src/app/globals.scss"),
        "utf-8",
      );
      expect(scss).toContain('[data-testid="admin-carbon-shell"]');
      expect(scss).toContain("cds--side-nav__link");

      vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
          new Response(JSON.stringify({ notificacoes: [], naoLidas: 0 }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        ),
      );

      const view = render(
        <AdminShell adminRole="SUPERADMIN_MASTER">
          <div>Conteúdo</div>
        </AdminShell>,
      );

      const bellBtn = screen.getByTestId("admin-notifications-bell");
      const themeBtn = screen.getByTestId("admin-theme-toggle");
      const profileBtn = screen.getByTestId("admin-profile-action");
      const logoutBtn = screen.getByTestId("admin-logout-btn");

      expect(
        bellBtn.compareDocumentPosition(themeBtn) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(
        themeBtn.compareDocumentPosition(profileBtn) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(
        profileBtn.compareDocumentPosition(logoutBtn) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();

      fireEvent.click(profileBtn);
      expect(mockRouterPush).toHaveBeenCalledWith("/admin/sistema");

      view.unmount();
    });

    it("1.2 Dispara notificação NOVO_CLIENTE_TRIAL apenas no 1º CNPJ da conta (nunca no 2º CNPJ), CHAMADO_SUPORTE em tickets e ACAO_FATURAMENTO_ADM restrito a SUPERADMIN_MASTER", async () => {
      const uid = `usr_notif_trial_${Date.now()}`;

      // 1º CNPJ em Trial -> DEVE gerar NOVO_CLIENTE_TRIAL
      const t1 = await createTenantForUser({
        userId: uid,
        userEmail: "novo.trial@empresa.com.br",
        userName: "Empreendedor Novo",
        input: {
          cnpj: gerarCnpjValido("51010101"),
          razaoSocial: "PRIMEIRA EMPRESA TRIAL LTDA",
          uf: "GO",
        },
      });

      // 2º CNPJ da mesma conta -> NÃO deve gerar segunda notificação NOVO_CLIENTE_TRIAL
      await createTenantForUser({
        userId: uid,
        userEmail: "novo.trial@empresa.com.br",
        userName: "Empreendedor Novo",
        input: {
          cnpj: gerarCnpjValido("51010102"),
          razaoSocial: "FILIAL SEGUNDO CNPJ LTDA",
          uf: "GO",
        },
      });

      // Chamado de suporte e réplica do cliente -> DEVEM gerar CHAMADO_SUPORTE
      const tkt = await criarTicketSuporte(
        {
          categoria: "FINANCEIRO",
          urgencia: "ALTA",
          assunto: "Dúvida na nota fiscal",
          descricao: "Preciso da 2ª via da NFS-e",
        },
        {
          id: uid,
          name: "Empreendedor Novo",
          email: "novo.trial@empresa.com.br",
          tenantId: t1.id,
        },
      );

      await adicionarMensagemTicketSuporte(
        tkt.id,
        { mensagem: "Complementando com os dados fiscais." },
        {
          id: uid,
          name: "Empreendedor Novo",
          email: "novo.trial@empresa.com.br",
          tenantId: t1.id,
          autorTipo: "CLIENTE",
        },
      );

      // Ação financeira no modal -> DEVE gerar ACAO_FATURAMENTO_ADM somente para SUPERADMIN_MASTER
      await executarAcaoFinanceiraSuperAdmin({
        tenantId: t1.id,
        action: "PRORROGAR_TRIAL",
        diasExtrasTrial: 7,
        observacao: "Cortesia atendimento inicial",
      });

      const routeMod = await import("@/app/api/admin/notificacoes/route");

      // Como SUPERADMIN_MASTER vê todas as categorias incluindo Controle de Fraude Financeiro
      mockGetServerSession.mockResolvedValue({
        user: {
          id: "adm_master",
          email: "vitorhenrique018@gmail.com",
          name: "Vitor Master",
          role: "SUPERADMIN",
          isSuperAdmin: true,
          adminRole: "SUPERADMIN_MASTER",
          ativo: true,
        },
      });
      const resMaster = await routeMod.GET(
        new NextRequest("http://localhost:3011/api/admin/notificacoes"),
      );
      expect(resMaster.status).toBe(200);
      const dataMaster = (await resMaster.json()) as {
        notificacoes: Array<{ id: string; categoria: string; titulo: string; somenteMaster: boolean }>;
        naoLidas: number;
      };

      const trialNotifs = dataMaster.notificacoes.filter(
        (n) => n.categoria === "NOVO_CLIENTE_TRIAL",
      );
      expect(trialNotifs).toHaveLength(1);
      expect(trialNotifs[0].titulo).toContain("PRIMEIRA EMPRESA TRIAL");

      const suporteNotifs = dataMaster.notificacoes.filter(
        (n) => n.categoria === "CHAMADO_SUPORTE",
      );
      expect(suporteNotifs.length).toBeGreaterThanOrEqual(2);

      const fraudeNotifs = dataMaster.notificacoes.filter(
        (n) => n.categoria === "ACAO_FATURAMENTO_ADM",
      );
      expect(fraudeNotifs.length).toBeGreaterThanOrEqual(1);
      expect(fraudeNotifs[0].somenteMaster).toBe(true);

      // Como ADMIN_OPERACIONAL NÃO deve enxergar notificações de Controle de Fraude Financeiro
      mockGetServerSession.mockResolvedValue({
        user: {
          id: "adm_op",
          email: "operacional@portal.com",
          name: "Operador",
          role: "SUPERADMIN",
          isSuperAdmin: true,
          adminRole: "ADMIN_OPERACIONAL",
          ativo: true,
        },
      });
      const resOp = await routeMod.GET(
        new NextRequest("http://localhost:3011/api/admin/notificacoes"),
      );
      expect(resOp.status).toBe(200);
      const dataOp = (await resOp.json()) as {
        notificacoes: Array<{ categoria: string }>;
      };
      expect(
        dataOp.notificacoes.some((n) => n.categoria === "ACAO_FATURAMENTO_ADM"),
      ).toBe(false);
    });

    it("1.3 Aplica máscaras de CPF, CNPJ e Telefone corretamente nos helpers e formulários ADM", () => {
      expect(maskCpf("12345678901")).toBe("123.456.789-01");
      expect(maskCnpj("12345678000195")).toBe("12.345.678/0001-95");
      expect(maskPhone("62999998888")).toBe("(62) 99999-8888");
    });

    it("1.4 AdminNotificationsBell e NotificacoesAdminScreen formatam criadaEm corretamente e sincronizam via admin-notifications-updated", async () => {
      let lida = false;
      const criadaEm = "2026-11-11T15:30:00.000Z";
      vi.stubGlobal(
        "fetch",
        vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
          if (init?.method === "PATCH") {
            lida = true;
            return new Response(JSON.stringify({ ok: true, id: "notif_sync_1" }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          }
          return new Response(
            JSON.stringify({
              notificacoes: [
                {
                  id: "notif_sync_1",
                  categoria: "NOVO_CLIENTE_TRIAL",
                  titulo: "Nova conta trial sincronizada",
                  descricao: "Empresa Alpha iniciou teste grátis.",
                  severidade: "INFO",
                  somenteMaster: false,
                  tenantId: "t_sync",
                  linkDestino: "/admin/clientes/t_sync",
                  atorNome: "Cadastro Portal",
                  lidaPor: lida ? ["adm_1"] : [],
                  lida,
                  criadaEm,
                },
              ],
              naoLidas: lida ? 0 : 1,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }),
      );

      const view = render(
        <div>
          <AdminNotificationsBell />
          <NotificacoesAdminScreen adminRole="SUPERADMIN_MASTER" />
        </div>,
      );

      await waitFor(() => expect(screen.getByTestId("admin-notifications-badge")).toHaveTextContent("1"));
      await waitFor(() =>
        expect(screen.getByText("Nova conta trial sincronizada")).toBeInTheDocument(),
      );

      // Data/Hora na tabela nunca exibe Invalid Date nem placeholder "—"
      const esperadoTabela = new Date(criadaEm).toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
      });
      const tableCellQuando = screen.getByText(esperadoTabela);
      expect(tableCellQuando).toBeInTheDocument();
      expect(screen.queryByText(/Invalid Date/i)).not.toBeInTheDocument();

      // Abre o sino e verifica data formatada no item
      fireEvent.click(screen.getByTestId("admin-notifications-bell"));
      const esperadoSino = new Date(criadaEm).toLocaleString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
      expect(
        within(screen.getByTestId("admin-notifications-dropdown")).getByText(esperadoSino),
      ).toBeInTheDocument();

      // Marca como lida na tela Central -> dispara admin-notifications-updated -> sino remove badge
      fireEvent.click(screen.getByRole("button", { name: /^Marcar lida$/i }));
      await waitFor(() =>
        expect(screen.queryByTestId("admin-notifications-badge")).not.toBeInTheDocument(),
      );

      view.unmount();
    });
  });

  /* -------------------------------------------------------------------------
     FRENTE 2 — Dashboard (/admin)
  ------------------------------------------------------------------------- */
  describe("Frente 2 — Dashboard (/admin)", () => {
    it("2.1 Filtra VOLUME ARREMATADO MENSAL e vitórias por mês/ano via obterMetricasSuperAdmin e GET /api/admin/metricas?mes=&ano=", async () => {
      const emp = await salvarEmpresaClienteSuperAdmin({
        cnpj: gerarCnpjValido("52020202"),
        razaoSocial: "CAMPEÃ LICITAÇÕES LTDA",
        uf: "GO",
        plano: "PRO",
        billingStatus: "ATIVO",
      });
      const licJan = insertInMemoryLicitacao({
        idPncp: "PNCP-JAN-51",
        numeroEdital: "PE 01/2026-JAN",
        orgaoNome: "Órgão Janeiro",
        orgaoCnpj: "00000000000100",
        uf: "GO",
        municipio: "Goiânia",
        esfera: null,
        poder: null,
        modalidade: "Pregão",
        portalDisputa: null,
        miniResumo: "Vitória Janeiro",
        resumo: "Objeto Janeiro",
        valorEstimado: 120000,
        dataAbertura: new Date("2026-01-10T12:00:00-03:00"),
        dataEncerramentoProposta: null,
        dataPublicacaoPncp: new Date("2026-01-05T12:00:00-03:00"),
        dataUltimaAtualizacao: new Date("2026-01-10T12:00:00-03:00"),
        status: "PENDENTE",
        parecerIA: "GO",
        justificativaIA: null,
        tipoSistemaCodigo: null,
        atestadosExigidos: null,
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
        modalidadeCodigo: null,
        numeroControlePNCP: null,
        segmentoMacro: null,
        subcategorias: null,
      });
      const licOut = insertInMemoryLicitacao({
        idPncp: "PNCP-OUT-51",
        numeroEdital: "PE 10/2026-OUT",
        orgaoNome: "Órgão Outubro",
        orgaoCnpj: "00000000000100",
        uf: "GO",
        municipio: "Goiânia",
        esfera: null,
        poder: null,
        modalidade: "Pregão",
        portalDisputa: null,
        miniResumo: "Vitória Outubro",
        resumo: "Objeto Outubro",
        valorEstimado: 350000,
        dataAbertura: new Date("2026-10-15T12:00:00-03:00"),
        dataEncerramentoProposta: null,
        dataPublicacaoPncp: new Date("2026-10-05T12:00:00-03:00"),
        dataUltimaAtualizacao: new Date("2026-10-15T12:00:00-03:00"),
        status: "PENDENTE",
        parecerIA: "GO",
        justificativaIA: null,
        tipoSistemaCodigo: null,
        atestadosExigidos: null,
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
        modalidadeCodigo: null,
        numeroControlePNCP: null,
        segmentoMacro: null,
        subcategorias: null,
      });

      setInMemoryTenantLicitacao(emp.empresa.id, licJan.id, {
        statusKanban: "CONTEMPLADA",
        valorHomologado: 100000,
        dataDecisao: new Date("2026-01-20T12:00:00-03:00"),
      });
      setInMemoryTenantLicitacao(emp.empresa.id, licOut.id, {
        statusKanban: "CONTEMPLADA",
        valorHomologado: 250000,
        dataDecisao: new Date("2026-10-20T12:00:00-03:00"),
      });

      const mOut = await obterMetricasSuperAdmin({ mes: 10, ano: 2026 });
      expect(mOut.totalVolumeArrematado).toBe(250000);
      expect(mOut.totalLicitacoesContempladas).toBe(1);
      expect(mOut.periodoMes).toBe(10);
      expect(mOut.periodoAno).toBe(2026);

      mockGetServerSession.mockResolvedValue({
        user: {
          id: "adm_m",
          email: "vitorhenrique018@gmail.com",
          name: "Master",
          role: "SUPERADMIN",
          isSuperAdmin: true,
          adminRole: "SUPERADMIN_MASTER",
          ativo: true,
        },
      });
      const res = await metricasGET(
        new NextRequest("http://localhost:3011/api/admin/metricas?mes=1&ano=2026"),
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        totalVolumeArrematado: number;
        totalLicitacoesContempladas: number;
      };
      expect(body.totalVolumeArrematado).toBe(100000);
      expect(body.totalLicitacoesContempladas).toBe(1);

      // Query inválida (mes=99) deve retornar HTTP 400 pela validação Zod
      const resInvalid = await metricasGET(
        new NextRequest("http://localhost:3011/api/admin/metricas?mes=99"),
      );
      expect(resInvalid.status).toBe(400);
    });

    it("2.2 SuperAdminDashboard exibe filtro Mês/Ano + Atualizar, card 'VOLUME ARREMATADO MENSAL', colunas separadas 'Engajamento' e 'Configuração' e remove 'Disparar com Jitter'", async () => {
      const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/admin/metricas")) {
          return new Response(
            JSON.stringify({
              mrrEstimado: 1994,
              arrEstimado: 23928,
              receitaEmRisco: 0,
              totalTenants: 2,
              tenantsAtivos: 1,
              tenantsTrial: 1,
              tenantsGracePeriod: 0,
              tenantsBloqueados: 0,
              tenantsCancelados: 0,
              novosClientesHoje: 1,
              novosClientes7d: 2,
              novosClientes30d: 2,
              trialsAbandonados: 0,
              trialsEngajados: 1,
              totalVolumeArrematado: 450000,
              totalLicitacoesContempladas: 2,
              r2StorageTotalMb: 12,
              whatsappFilaPendentes: 3,
              whatsappInstanciaConectada: true,
              gastoIaHojeBrl: 0,
              gastoIaMesBrl: 0,
              tokensIaHoje: 0,
              chamadasIaHoje: 0,
              ticketsAbertos: 0,
              comissoesPendentesBrl: 0,
              ultimaColetaStatus: "CONCLUIDO",
              ultimaColetaEm: null,
              ultimasVitorias: [],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      });
      vi.stubGlobal("fetch", fetchMock);

      const view = render(
        <SuperAdminDashboard
          initialMetrics={{
            mrrEstimado: 1994,
            arrEstimado: 23928,
            receitaEmRisco: 0,
            totalTenants: 2,
            tenantsAtivos: 1,
            tenantsTrial: 1,
            tenantsGracePeriod: 0,
            tenantsBloqueados: 0,
            tenantsCancelados: 0,
            novosClientesHoje: 1,
            novosClientes7d: 2,
            novosClientes30d: 2,
            trialsAbandonados: 0,
            trialsEngajados: 1,
            totalVolumeArrematado: 123000,
            totalLicitacoesContempladas: 1,
            r2StorageTotalMb: 10,
            whatsappFilaPendentes: 0,
            whatsappInstanciaConectada: true,
            gastoIaHojeBrl: 0,
            gastoIaMesBrl: 0,
            tokensIaHoje: 0,
            chamadasIaHoje: 0,
            ticketsAbertos: 0,
            comissoesPendentesBrl: 0,
            ultimaColetaStatus: "CONCLUIDO",
            ultimaColetaEm: null,
            ultimasVitorias: [],
          }}
          initialTenants={[
            {
              id: "tnt_radar_1",
              cnpj: "52020202000100",
              razaoSocial: "RADAR TRIAL LTDA",
              plano: "PRO",
              billingStatus: "TRIAL",
              diasRestantesTrial: 10,
              diasAtraso: 0,
              cotaBaseMb: 2000,
              cotaExtraMb: 0,
              cotaTotalMb: 2000,
              espacoUsadoMb: 0,
              percentualUsado: 0,
              volumeArrematado: 0,
              totalContempladas: 0,
              criadoEm: new Date(),
              onboarding: {
                contaCriada: true,
                cnpjCadastrado: true,
                filtrosConfigurados: true,
                empresaPreenchida: false,
                documentoCofreEnviado: false,
                licitacaoNoKanban: false,
                iaOuCalculadoraUsada: false,
                score: 3,
                percentual: 43,
                statusEngajamento: "EM_CONFIGURACAO",
              },
            },
          ]}
        />,
      );

      expect(screen.getByText(/VOLUME ARREMATADO MENSAL/i)).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Disparar com Jitter/i })).not.toBeInTheDocument();
      expect(screen.getByRole("columnheader", { name: "Engajamento" })).toBeInTheDocument();
      expect(screen.getByRole("columnheader", { name: "Configuração" })).toBeInTheDocument();

      const selMes = screen.getByLabelText("Mês");
      const selAno = screen.getByLabelText("Ano");
      fireEvent.change(selMes, { target: { value: "5" } });
      fireEvent.change(selAno, { target: { value: "2026" } });
      fireEvent.click(screen.getByRole("button", { name: /Atualizar/i }));

      await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringContaining("/api/admin/metricas?mes=5&ano=2026"),
        ),
      );
      view.unmount();
    });
  });

  /* -------------------------------------------------------------------------
     FRENTE 3 — Clientes (/admin/clientes): Filtro Em configuração + Contagem IA
  ------------------------------------------------------------------------- */
  describe("Frente 3 — Clientes (/admin/clientes)", () => {
    it("3.1 Filtra EM_CONFIGURACAO corretamente e contabiliza análises de IA reais de AnaliseStatusParticipacao", async () => {
      const uidEmConfig = `usr_cfg_${Date.now()}`;
      const tCfg = await createTenantForUser({
        userId: uidEmConfig,
        userEmail: "emconfig@cliente.com.br",
        userName: "Cliente Config",
        input: {
          cnpj: gerarCnpjValido("53030301"),
          razaoSocial: "EM CONFIGURACAO LTDA",
          uf: "SP",
        },
      });
      // Garante segmento configurado (3/7 marcos -> EM_CONFIGURACAO)
      const memCfg = inMemoryTenants.get(tCfg.id)!;
      memCfg.segmentos = ["TECNOLOGIA"];
      memCfg.ufs = ["SP"];
      memCfg.preferenciasUpdatedAt = new Date();
      inMemoryTenants.set(tCfg.id, memCfg);

      // Segunda conta: apenas criada (2/7 -> CADASTROU_E_SAIU)
      const uidAbandono = `usr_aband_${Date.now()}`;
      await createTenantForUser({
        userId: uidAbandono,
        userEmail: "abandono@cliente.com.br",
        userName: "Cliente Parado",
        input: {
          cnpj: gerarCnpjValido("53030302"),
          razaoSocial: "PARADO INICIO LTDA",
          uf: "MG",
        },
      });

      // Grava análise real via AnaliseStatusParticipacao em memória para tCfg
      insertInMemoryLicitacaoAnaliseIA("lic_fake_51", {
        id: "an_real_issue51_1",
        tenantId: tCfg.id,
        executadoPorId: uidEmConfig,
        status: "CONCLUIDO",
        criadoEm: new Date(),
      });
      insertInMemoryLicitacaoAnaliseIA("lic_fake_52", {
        id: "an_real_issue51_2",
        tenantId: tCfg.id,
        executadoPorId: uidEmConfig,
        status: "CONCLUIDO",
        criadoEm: new Date(),
      });

      const emConfigLista = await listarTenantsSuperAdmin({
        statusFiltro: "EM_CONFIGURACAO",
      });
      expect(emConfigLista.map((x) => x.id)).toContain(tCfg.id);
      expect(emConfigLista.some((x) => x.razaoSocial === "PARADO INICIO LTDA")).toBe(false);

      const encontrado = emConfigLista.find((x) => x.id === tCfg.id)!;
      expect(encontrado.aiUsadasMes).toBeGreaterThanOrEqual(2);
    });

    it("3.2 ClientesScreen oferece botão de filtro 'Em configuração' e consulta ?status=EM_CONFIGURACAO", async () => {
      const fetchMock = vi.fn(async () =>
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
      vi.stubGlobal("fetch", fetchMock);

      const view = render(<ClientesScreen />);
      const switchEmConfig = await screen.findByRole("tab", {
        name: /Em configuração/i,
      });
      fireEvent.click(switchEmConfig);

      await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith(
          expect.stringContaining("/api/admin/tenants?status=EM_CONFIGURACAO"),
          expect.any(Object),
        ),
      );
      view.unmount();
    });
  });

  /* -------------------------------------------------------------------------
     FRENTE 4 — Ficha Cliente 360º (/admin/clientes/[id])
  ------------------------------------------------------------------------- */
  describe("Frente 4 — Ficha Cliente 360º", () => {
    it("4.1 Individualiza termômetro por CNPJ, unifica Cofre/IA na Aba 5 sem multiplicar por CNPJ (5000+24=5024) e injeta licitação por Link PNCP", async () => {
      const uid = `usr_360_u51_${Date.now()}`;
      const emp1 = await createTenantForUser({
        userId: uid,
        userEmail: "grupo51@empresa.com.br",
        userName: "Gestor Grupo 51",
        userPlan: "ENTERPRISE",
        input: {
          cnpj: gerarCnpjValido("54040401"),
          razaoSocial: "MATRIZ ENTERPRISE 51 LTDA",
          uf: "GO",
        },
      });
      const emp2 = await createTenantForUser({
        userId: uid,
        userEmail: "grupo51@empresa.com.br",
        userName: "Gestor Grupo 51",
        userPlan: "ENTERPRISE",
        input: {
          cnpj: gerarCnpjValido("54040402"),
          razaoSocial: "FILIAL ENTERPRISE 51 LTDA",
          uf: "SP",
        },
      });

      // Matriz tem documento no cofre + segmentos configurados; Filial só conta criada
      const r1 = inMemoryTenants.get(emp1.id)!;
      r1.plano = "ENTERPRISE";
      r1.segmentos = ["ENGENHARIA"];
      r1.ufs = ["GO"];
      inMemoryTenants.set(emp1.id, r1);
      const r2 = inMemoryTenants.get(emp2.id)!;
      r2.plano = "ENTERPRISE";
      inMemoryTenants.set(emp2.id, r2);

      insertInMemoryDocumento({
        id: "doc_m1_51",
        tenantId: emp1.id,
        nome: "Balanco Matriz.pdf",
        categoria: "QUALIFICACAO_ECONOMICA",
        arquivoTamanho: 5 * 1024 * 1024,
      });

      // Bônus de 24 MB concedido
      await atualizarCotasClienteSuperAdmin({
        tenantId: emp1.id,
        maxCnpjs: 5,
        maxUsers: 10,
        storageExtraQuotaMb: 24,
        aiExtraQuotaMes: 8,
      });

      const dossie = (await obterDossieCliente360SuperAdmin(emp1.id)) as unknown as {
        porEmpresa: Record<string, { onboarding?: { score: number; licitacaoNoKanban: boolean } }>;
        cotas: {
          storageBaseMb: number;
          storageExtraQuotaMb: number;
          storageTotalMb: number;
          storageUsadoMb: number;
          aiExtraQuotaMes: number;
        };
        contaGlobal: {
          storageTotalMb: number;
          storageUsadoMb: number;
          aiExtraQuotaMes: number;
        };
      };

      // 5000 MB (ENTERPRISE) + 24 MB bônus = 5024 MB mesmo tendo 2 CNPJs (NÃO 10048)
      expect(dossie.cotas.storageBaseMb).toBe(5000);
      expect(dossie.cotas.storageExtraQuotaMb).toBe(24);
      expect(dossie.cotas.storageTotalMb).toBe(5024);
      expect(dossie.contaGlobal.storageTotalMb).toBe(5024);
      expect(dossie.cotas.storageUsadoMb).toBe(5);
      expect(dossie.cotas.aiExtraQuotaMes).toBe(8);
      expect(dossie.contaGlobal.aiExtraQuotaMes).toBe(8);

      // Termômetro individual por CNPJ
      expect(dossie.porEmpresa[emp1.id]?.onboarding?.score).toBeGreaterThan(
        dossie.porEmpresa[emp2.id]?.onboarding?.score ?? 99,
      );

      // Injeção por Link completo do PNCP com hidratação da API do PNCP + anexos
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL) => {
          const url = String(input);
          if (url.includes("/consulta/v1/orgaos/00394460000141/compras/2026/77")) {
            return new Response(
              JSON.stringify({
                numeroControlePNCP: "00394460000141-1-000077/2026",
                numeroCompra: "77",
                anoCompra: 2026,
                modalidadeId: 6,
                modalidadeNome: "Pregão - Eletrônico",
                objetoCompra: "Aquisição de servidores corporativos em alta disponibilidade",
                valorTotalEstimado: 680000,
                dataAberturaProposta: "2026-12-01T10:00:00",
                orgaoEntidade: {
                  cnpj: "00394460000141",
                  razaoSocial: "Ministério da Fazenda",
                },
                unidadeOrgao: {
                  ufSigla: "DF",
                  municipioNome: "Brasília",
                },
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            );
          }
          if (url.includes("/compras/2026/77/arquivos")) {
            return new Response(
              JSON.stringify([
                {
                  sequencialDocumento: 1,
                  titulo: "Edital_77_2026.pdf",
                  url: "https://pncp.gov.br/pncp-api/v1/orgaos/00394460000141/compras/2026/77/arquivos/1",
                },
              ]),
              { status: 200, headers: { "Content-Type": "application/json" } },
            );
          }
          return new Response("Not Found", { status: 404 });
        }),
      );

      const inj = await injetarLicitacaoNoKanbanClienteSuperAdmin({
        licitacaoId: "https://pncp.gov.br/app/editais/00394460000141/2026/77",
        tenantId: emp2.id,
        statusKanban: "ACEITA",
      });
      expect(inj.ok).toBe(true);
      expect(inj.statusKanban).toBe("ACEITA");
      const dossiePos = await obterDossieCliente360SuperAdmin(emp2.id);
      expect(
        (dossiePos.porEmpresa?.[emp2.id]?.patrimonioOperacional.licitacoes ?? []).some(
          (l) => l.numeroEdital.includes("77/2026"),
        ),
      ).toBe(true);
    });

    it("4.2 Cliente360Screen remove 'Espelhar visão do cliente', alterna Termômetro por CNPJ e exibe campo Bônus Cofre (MB) ao lado de IA sem botões +1/+2 GB", async () => {
      const empresas = [
        {
          id: "tnt_360_a",
          cnpj: "54040401000100",
          razaoSocial: "Matriz A Ltda",
          nomeFantasia: "Matriz A",
          uf: "GO",
          cidade: "Goiânia",
          plano: "ENTERPRISE",
          billingStatus: "ATIVO",
          ativo: true,
        },
        {
          id: "tnt_360_b",
          cnpj: "54040402000100",
          razaoSocial: "Filial B Ltda",
          nomeFantasia: "Filial B",
          uf: "SP",
          cidade: "São Paulo",
          plano: "ENTERPRISE",
          billingStatus: "ATIVO",
          ativo: true,
        },
      ];

      const dossie = {
        tenantId: "tnt_360_a",
        tenant: {
          razaoSocial: "Matriz A Ltda",
          nomeFantasia: "Matriz A",
          cnpj: "54040401000100",
          plano: "ENTERPRISE",
          billingStatus: "ATIVO",
          ativo: true,
          diasRestantesTrial: 0,
          valorMensalidade: 997,
        },
        titular: {
          id: "usr_360_m",
          name: "Carlos Titular",
          email: "carlos@grupo.com.br",
          cpf: null,
          telefone: null,
          cidade: "Goiânia",
          uf: "GO",
          ativo: true,
          sessionVersion: 1,
          ultimoLoginEm: null,
        },
        onboarding: {
          contaCriada: true,
          cnpjCadastrado: true,
          filtrosConfigurados: true,
          empresaPreenchida: true,
          documentoCofreEnviado: true,
          licitacaoNoKanban: true,
          iaOuCalculadoraUsada: true,
          score: 7,
          percentual: 100,
          statusEngajamento: "ENGAJADO",
        },
        empresas,
        usuarios: [],
        patrimonioOperacional: {
          licitacoes: [],
          kanbanPorColuna: {},
          documentos: { total: 0, vencidos: 0, bytes: 0, lista: [] },
          portais: 0,
          impugnacoes: 0,
          precosSalvos: 0,
        },
        porEmpresa: {
          tnt_360_a: {
            onboarding: {
              contaCriada: true,
              cnpjCadastrado: true,
              filtrosConfigurados: true,
              empresaPreenchida: true,
              documentoCofreEnviado: true,
              licitacaoNoKanban: true,
              iaOuCalculadoraUsada: true,
              score: 7,
              percentual: 100,
              statusEngajamento: "ENGAJADO",
            },
            patrimonioOperacional: {
              licitacoes: [],
              kanbanPorColuna: {},
              documentos: { total: 0, vencidos: 0, bytes: 0, lista: [] },
              portais: 0,
              impugnacoes: 0,
              precosSalvos: 0,
            },
          },
          tnt_360_b: {
            onboarding: {
              contaCriada: true,
              cnpjCadastrado: true,
              filtrosConfigurados: false,
              empresaPreenchida: false,
              documentoCofreEnviado: false,
              licitacaoNoKanban: false,
              iaOuCalculadoraUsada: false,
              score: 2,
              percentual: 29,
              statusEngajamento: "CADASTROU_E_SAIU",
            },
            patrimonioOperacional: {
              licitacoes: [],
              kanbanPorColuna: {},
              documentos: { total: 0, vencidos: 0, bytes: 0, lista: [] },
              portais: 0,
              impugnacoes: 0,
              precosSalvos: 0,
            },
          },
        },
        cotas: {
          maxCnpjs: 5,
          maxUsers: 10,
          storageBaseMb: 5000,
          storageExtraQuotaMb: 24,
          storageTotalMb: 5024,
          storageUsadoMb: 12,
          aiExtraQuotaMes: 4,
          aiUsadasMes: 3,
        },
        contaGlobal: {
          valorMensalidade: 997,
          diasRestantesTrial: 0,
          storageUsadoMb: 12,
          storageTotalMb: 5024,
          aiUsadasMes: 3,
          aiExtraQuotaMes: 4,
          totalLicitacoes: 0,
          totalDocumentos: 0,
          totalPortais: 0,
        },
        notasInternasAdm: null,
        disputas: [],
      };

      vi.stubGlobal(
        "fetch",
        vi.fn(async () =>
          new Response(JSON.stringify(dossie), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        ),
      );

      const view = render(<Cliente360Screen tenantId="tnt_360_a" />);
      await waitFor(() =>
        expect(screen.getByText(/Termômetro de configuração — 7\/7/i)).toBeInTheDocument(),
      );

      expect(screen.queryByRole("button", { name: /Espelhar visão do cliente/i })).not.toBeInTheDocument();

      // Alterna para Filial B e Termômetro deve mudar para 2/7 (29%)
      fireEvent.click(screen.getByTestId("cnpj-card-tnt_360_b"));
      await waitFor(() =>
        expect(screen.getByText(/Termômetro de configuração — 2\/7/i)).toBeInTheDocument(),
      );

      // Aba 5: verifica unificação e campo Bônus de Cofre R2 (MB) ao lado de Bônus IA, sem +1 GB/+2 GB
      fireEvent.click(screen.getByRole("tab", { name: /5 · Recursos & Cotas/i }));
      expect(screen.getByText(/12 \/ 5024 MB/i)).toBeInTheDocument();
      const inputIa = screen.getByLabelText(/Bônus mensal de análises de IA/i);
      const inputCofre = screen.getByLabelText(/Bônus de Cofre R2 \(MB\)/i);
      expect(
        inputIa.compareDocumentPosition(inputCofre) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(screen.queryByRole("button", { name: /\+1 GB de Cofre/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /\+2 GB de Cofre/i })).not.toBeInTheDocument();

      view.unmount();
    });
  });

  /* -------------------------------------------------------------------------
     FRENTE 5 — Financeiro (/admin/financeiro) & Badge Trial no Cliente
  ------------------------------------------------------------------------- */
  describe("Frente 5 — Financeiro, Faturas, Upload de Comprovante & Prorrogação 7/14/21", () => {
    it("5.1 Schema limita PRORROGAR_TRIAL a 7/14/21, registra Dar Baixa com comprovante/método e exibe histórico de faturas + dias no AppShell sem cap de 14d", async () => {
      // Prorrogar com 10 dias deve falhar no Zod Schema
      expect(() =>
        AdminFinanceiroActionSchema.parse({
          tenantId: "t1",
          action: "PRORROGAR_TRIAL",
          diasExtrasTrial: 10,
        }),
      ).toThrow();

      // Prorrogar com 21 dias é aceito
      expect(
        AdminFinanceiroActionSchema.parse({
          tenantId: "t1",
          action: "PRORROGAR_TRIAL",
          diasExtrasTrial: 21,
        }).diasExtrasTrial,
      ).toBe(21);

      const emp = await salvarEmpresaClienteSuperAdmin({
        cnpj: gerarCnpjValido("55050501"),
        razaoSocial: "FATURA TESTE LTDA",
        uf: "GO",
        plano: "PRO",
        billingStatus: "TRIAL",
      });

      const baixa = await executarAcaoFinanceiraSuperAdmin({
        tenantId: emp.empresa.id,
        action: "DAR_BAIXA_MANUAL",
        metodoPagamento: "PIX",
        valorPago: 497,
        comprovanteDataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        comprovanteNome: "comprovante-pix.png",
        comprovanteMimeType: "image/png",
        observacao: "Pagamento PIX confirmado no banco",
      });
      expect(baixa.ok).toBe(true);

      mockGetServerSession.mockResolvedValue({
        user: {
          id: "adm_fin",
          email: "vitorhenrique018@gmail.com",
          name: "Master Fin",
          role: "SUPERADMIN",
          isSuperAdmin: true,
          adminRole: "SUPERADMIN_MASTER",
          ativo: true,
        },
      });
      const resFin = await financeiroGET(
        new NextRequest(
          `http://localhost:3011/api/admin/financeiro?faturasTenantId=${encodeURIComponent(emp.empresa.id)}`,
        ),
      );
      expect(resFin.status).toBe(200);
      const payloadFin = (await resFin.json()) as {
        faturas?: Array<{ metodoPagamento: string; valorPago: number; comprovanteNome: string }>;
      };
      expect(payloadFin.faturas?.length).toBeGreaterThanOrEqual(1);
      expect(payloadFin.faturas?.[0].metodoPagamento).toBe("PIX");
      expect(payloadFin.faturas?.[0].valorPago).toBe(497);
      expect(payloadFin.faturas?.[0].comprovanteNome).toBe("comprovante-pix.png");

      // AppShell do cliente deve exibir 21 dias quando o ADM prorroga (sem truncar em 14!)
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL) => {
          const url = String(input);
          if (url.includes("/api/planos/status")) {
            return new Response(
              JSON.stringify({
                ok: true,
                billingStatus: "TRIAL",
                plano: "PRO",
                diasRestantesTrial: 21,
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            );
          }
          return new Response(JSON.stringify({ ok: true, naoLidas: 0, recentes: [], avisos: [] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }),
      );

      mockPathnameState.value = "/dashboard";
      const appView = render(
        <AppShell>
          <div>Conteúdo Cliente</div>
        </AppShell>,
      );
      await waitFor(() =>
        expect(screen.getByTestId("header-trial-badge")).toHaveTextContent("21 dias de teste"),
      );
      appView.unmount();
    });

    it("5.2 FinanceiroScreen permite filtrar clicando nos KPIs, mostra 'Ações rápidas' apenas para TRIAL, exibe campos de Dar Baixa e histórico de faturas 5/pág", async () => {
      const clientes = [
        {
          id: "tnt_fin_ativo",
          cnpj: gerarCnpjValido("55100001"),
          razaoSocial: "Cliente Pagante SA",
          nomeFantasia: "Pagante SA",
          plano: "ENTERPRISE",
          billingStatus: "ATIVO" as const,
          diasRestantesTrial: 0,
          diasAtraso: 0,
          cotaBaseMb: 5000,
          cotaExtraMb: 0,
          cotaTotalMb: 5000,
          espacoUsadoMb: 10,
          percentualUsado: 1,
          volumeArrematado: 0,
          totalContempladas: 0,
          valorMensalidade: 997,
          qtdCnpjs: 1,
          criadoEm: new Date(),
        },
        {
          id: "tnt_fin_trial",
          cnpj: gerarCnpjValido("55100002"),
          razaoSocial: "Cliente Em Trial Ltda",
          nomeFantasia: "Trial Ltda",
          plano: "PRO",
          billingStatus: "TRIAL" as const,
          diasRestantesTrial: 7,
          diasAtraso: 0,
          cotaBaseMb: 2000,
          cotaExtraMb: 0,
          cotaTotalMb: 2000,
          espacoUsadoMb: 0,
          percentualUsado: 0,
          volumeArrematado: 0,
          totalContempladas: 0,
          valorMensalidade: 497,
          qtdCnpjs: 1,
          criadoEm: new Date(),
        },
      ];

      const faturasMock = Array.from({ length: 6 }, (_, i) => ({
        id: `fat_51_${i + 1}`,
        tenantId: "tnt_fin_ativo",
        empresaNome: "Pagante SA",
        acao: "DAR_BAIXA_MANUAL",
        plano: "ENTERPRISE",
        statusAnterior: "TRIAL",
        statusNovo: "ATIVO",
        valorPago: 997,
        metodoPagamento: "PIX",
        comprovanteDataUrl: "data:image/png;base64,AAA",
        comprovanteNome: `comp-${i + 1}.png`,
        comprovanteMimeType: "image/png",
        observacao: `Baixa mês ${i + 1}`,
        operadorNome: "Master ADM",
        criadoEm: new Date(Date.now() - i * 86400000).toISOString(),
      }));

      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL) => {
          const url = String(input);
          if (url.includes("faturasTenantId=")) {
            return new Response(JSON.stringify({ faturas: faturasMock }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          }
          return new Response(JSON.stringify({ clientes, cupons: [] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }),
      );

      const view = render(<FinanceiroScreen />);
      await waitFor(() => expect(screen.getByText("Pagante SA")).toBeInTheDocument());
      expect(screen.getByText("Trial Ltda")).toBeInTheDocument();

      // Clica no KPI EM TESTE GRÁTIS e filtra tabela
      fireEvent.click(screen.getByText("EM TESTE GRÁTIS"));
      await waitFor(() => {
        expect(screen.getByText("Trial Ltda")).toBeInTheDocument();
        expect(screen.queryByText("Pagante SA")).not.toBeInTheDocument();
      });

      // Abre modal do cliente TRIAL -> tem Ações rápidas com +7d Trial e +14d Trial (SEM Dar Baixa rápido)
      fireEvent.click(screen.getByRole("button", { name: /Acessar Faturamento do cliente/i }));
      expect(screen.getByRole("button", { name: /\+7d Trial/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /\+14d Trial/i })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Dar Baixa \(\+30d\)/i })).not.toBeInTheDocument();

      // Verifica opções de Prorrogar Trial: apenas 7, 14, 21
      fireEvent.change(screen.getByLabelText(/Ação detalhada de assinatura/i), {
        target: { value: "PRORROGAR_TRIAL" },
      });
      const selTrial = screen.getByLabelText(/Dias extras de Trial/i) as HTMLSelectElement;
      expect(Array.from(selTrial.options).map((o) => o.value)).toEqual(["7", "14", "21"]);

      // Seleciona Dar Baixa (+30d) -> mostra Forma de Pagamento, Valor e Upload
      fireEvent.change(screen.getByLabelText(/Ação detalhada de assinatura/i), {
        target: { value: "DAR_BAIXA_MANUAL" },
      });
      expect(screen.getByLabelText(/Forma de pagamento/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Valor pago/i)).toBeInTheDocument();
      expect(screen.getByTestId("dropzone-comprovante")).toBeInTheDocument();

      // Fecha modal, restaura Todos e abre modal do cliente ATIVO -> SEM bloco Ações rápidas + histórico 5/pág
      const visibleModal = document.querySelector(".cds--modal.is-visible") as HTMLElement;
      fireEvent.click(within(visibleModal).getByRole("button", { name: /Cancelar/i }));
      fireEvent.click(screen.getByText("EM TESTE GRÁTIS"));
      await waitFor(() => expect(screen.getByText("Pagante SA")).toBeInTheDocument());

      const btns = screen.getAllByRole("button", { name: /Acessar Faturamento do cliente/i });
      fireEvent.click(btns[0]);
      await waitFor(() =>
        expect(screen.getByText(/Histórico de faturas e pagamentos registrados/i)).toBeInTheDocument(),
      );
      expect(screen.queryByRole("button", { name: /\+7d Trial/i })).not.toBeInTheDocument();
      expect(screen.getByText("Baixa mês 1")).toBeInTheDocument();
      expect(screen.queryByText("Baixa mês 6")).not.toBeInTheDocument();

      view.unmount();
    });

    it("5.3 Rejeita magic bytes/MIME inválidos, aceita valorPago null em DAR_BAIXA_MANUAL e seleciona aba 'Em risco' ao clicar em RECEITA EM RISCO", async () => {
      // Schema: valorPago null é válido, magic bytes falsos e MIME divergente são rejeitados
      expect(
        AdminFinanceiroActionSchema.parse({
          tenantId: "t1",
          action: "DAR_BAIXA_MANUAL",
          metodoPagamento: "PIX",
          valorPago: null,
        }).valorPago,
      ).toBeNull();

      expect(() =>
        AdminFinanceiroActionSchema.parse({
          tenantId: "t1",
          action: "DAR_BAIXA_MANUAL",
          metodoPagamento: "PIX",
          valorPago: 100,
          comprovanteDataUrl: "data:image/png;base64,QUFBQUFBQUE=",
          comprovanteMimeType: "image/png",
        }),
      ).toThrow(/assinatura|inválido|inconsistente|formato/i);

      expect(() =>
        AdminFinanceiroActionSchema.parse({
          tenantId: "t1",
          action: "DAR_BAIXA_MANUAL",
          metodoPagamento: "PIX",
          valorPago: 100,
          comprovanteDataUrl:
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
          comprovanteMimeType: "application/pdf",
        }),
      ).toThrow(/MIME|diverge/i);

      const postBodies: Array<Record<string, unknown>> = [];
      const clientes = [
        {
          id: "tnt_fin_ok",
          cnpj: gerarCnpjValido("55200001"),
          razaoSocial: "Cliente Regular Ltda",
          nomeFantasia: "Regular Ltda",
          plano: "PRO",
          billingStatus: "ATIVO" as const,
          diasRestantesTrial: 0,
          diasAtraso: 0,
          cotaBaseMb: 2000,
          cotaExtraMb: 0,
          cotaTotalMb: 2000,
          espacoUsadoMb: 0,
          percentualUsado: 0,
          volumeArrematado: 0,
          totalContempladas: 0,
          valorMensalidade: 497,
          qtdCnpjs: 1,
          criadoEm: new Date(),
        },
        {
          id: "tnt_fin_risco",
          cnpj: gerarCnpjValido("55200002"),
          razaoSocial: "Empresa Em Carência SA",
          nomeFantasia: "Em Carência SA",
          plano: "ENTERPRISE",
          billingStatus: "GRACE_PERIOD" as const,
          diasRestantesTrial: 0,
          diasAtraso: 2,
          cotaBaseMb: 5000,
          cotaExtraMb: 0,
          cotaTotalMb: 5000,
          espacoUsadoMb: 0,
          percentualUsado: 0,
          volumeArrematado: 0,
          totalContempladas: 0,
          valorMensalidade: 997,
          qtdCnpjs: 1,
          criadoEm: new Date(),
        },
      ];

      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
          const url = String(input);
          if (init?.method === "POST" && url.includes("/api/admin/financeiro")) {
            postBodies.push(JSON.parse(String(init.body || "{}")) as Record<string, unknown>);
            return new Response(JSON.stringify({ ok: true }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          }
          if (url.includes("faturasTenantId=")) {
            return new Response(JSON.stringify({ faturas: [] }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          }
          return new Response(JSON.stringify({ clientes, cupons: [] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }),
      );

      const view = render(<FinanceiroScreen />);
      await waitFor(() => expect(screen.getByText("Em Carência SA")).toBeInTheDocument());

      // Clicar em RECEITA EM RISCO seleciona aba 'Em risco' no ContentSwitcher e filtra
      fireEvent.click(screen.getByText("RECEITA EM RISCO"));
      await waitFor(() => {
        expect(screen.getByRole("tab", { name: "Em risco" })).toHaveAttribute(
          "aria-selected",
          "true",
        );
        expect(screen.getByText("Em Carência SA")).toBeInTheDocument();
        expect(screen.queryByText("Regular Ltda")).not.toBeInTheDocument();
      });

      // Abre modal, escolhe DAR_BAIXA_MANUAL, limpa Valor pago e envia null
      fireEvent.click(screen.getByRole("button", { name: /Acessar Faturamento do cliente/i }));
      fireEvent.change(screen.getByLabelText(/Ação detalhada de assinatura/i), {
        target: { value: "DAR_BAIXA_MANUAL" },
      });
      const inputValor = screen.getByLabelText(/Valor pago/i);
      fireEvent.change(inputValor, { target: { value: "" } });

      const visibleModal = document.querySelector(".cds--modal.is-visible") as HTMLElement;
      fireEvent.click(within(visibleModal).getByRole("button", { name: /Aplicar alteração/i }));

      await waitFor(() => expect(postBodies.length).toBeGreaterThanOrEqual(1));
      expect(postBodies[0].action).toBe("DAR_BAIXA_MANUAL");
      expect(postBodies[0].valorPago).toBeNull();

      view.unmount();
    });
  });

  /* -------------------------------------------------------------------------
     FRENTE 6 — Licitações (/admin/licitacoes): Paginação 10/20/50
  ------------------------------------------------------------------------- */
  describe("Frente 6 — Licitações (/admin/licitacoes)", () => {
    it("6.1 Exibe seletor de 10, 20 e 50 itens por página na tabela de catálogo global", async () => {
      const licitacoes = Array.from({ length: 25 }, (_, i) => ({
        id: `lic_pg_${i + 1}`,
        idPncp: `00000000000100-1-${String(i + 1).padStart(6, "0")}/2026`,
        numeroEdital: `PE-${String(i + 1).padStart(2, "0")}/2026`,
        orgaoNome: `Prefeitura Teste ${i + 1}`,
        uf: "GO",
        municipio: "Goiânia",
        modalidade: "Pregão Eletrônico",
        miniResumo: `Objeto ${i + 1}`,
        valorEstimado: 100000,
        dataAbertura: new Date().toISOString(),
        parecerIA: "GO",
        status: "PENDENTE",
        manual: false,
      }));

      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL) => {
          const url = String(input);
          if (url.includes("/api/admin/tenants")) {
            return new Response(JSON.stringify([]), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          }
          return new Response(JSON.stringify({ licitacoes, execucoes: [] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }),
      );

      const view = render(<LicitacoesAdminScreen />);
      await waitFor(() => expect(screen.getByText("PE-01/2026")).toBeInTheDocument());
      expect(screen.getByText("PE-10/2026")).toBeInTheDocument();
      expect(screen.queryByText("PE-11/2026")).not.toBeInTheDocument();

      const sizeSelect = screen.getByLabelText(/Itens por página/i) as HTMLSelectElement;
      expect(Array.from(sizeSelect.options).map((o) => o.value)).toEqual(["10", "20", "50"]);
      fireEvent.change(sizeSelect, { target: { value: "20" } });
      await waitFor(() => expect(screen.getByText("PE-20/2026")).toBeInTheDocument());
      expect(screen.queryByText("PE-21/2026")).not.toBeInTheDocument();

      view.unmount();
    });
  });

  /* -------------------------------------------------------------------------
     FRENTE 7 — Área do Cliente (/oportunidades/[id]): Alerta de Reanálise IA
  ------------------------------------------------------------------------- */
  describe("Frente 7 — Área do Cliente (/oportunidades/[id]): Alerta de Reanálise com IA", () => {
    it("7.1 Exibe modal de alerta de consumo de cota quando já existem análises de IA e prossegue ao confirmar", async () => {
      const { default: OportunidadeDetalhesPage } = await import(
        "@/app/oportunidades/[id]/page"
      );

      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL) => {
          const url = String(input);
          if (url.includes("/api/oportunidades/lic_reanalise_1/analise-ia")) {
            return new Response(
              JSON.stringify({
                ok: true,
                analises: [
                  {
                    id: "an_prev_1",
                    status: "CONCLUIDO",
                    criadoEm: new Date().toISOString(),
                    parecer: "PARTICIPACAO_RECOMENDADA",
                    relatorioTexto: "Relatório prévio",
                  },
                ],
                cota: { usadas: 1, limite: 15, restantes: 14, atingiuLimite: false },
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            );
          }
          if (url.includes("/api/oportunidades/lic_reanalise_1") && !url.includes("/notas")) {
            return new Response(
              JSON.stringify({
                ok: true,
                oportunidade: {
                  id: "lic_reanalise_1",
                  idPncp: "00000000000100-1-000001/2026",
                  numeroEdital: "PE 01/2026",
                  orgaoNome: "Órgão Alerta IA",
                  orgaoCnpj: "00.000.000/0001-00",
                  uf: "GO",
                  municipio: "Goiânia",
                  modalidade: "Pregão Eletrônico",
                  miniResumo: "Aquisição de Hardware",
                  resumo: "Objeto completo",
                  valorEstimado: 150000,
                  dataAbertura: new Date(Date.now() + 86400000).toISOString(),
                  status: "PENDENTE",
                  parecerIA: "GO",
                  arquivos: [],
                  itens: [],
                  notas: [],
                  historicoStatus: [],
                  analisesIA: [],
                },
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            );
          }
          if (url.includes("/api/faturamento") || url.includes("/api/planos/status")) {
            return new Response(
              JSON.stringify({ ok: true, billingStatus: "ATIVO", plano: "PRO", isReadOnly: false }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            );
          }
          return new Response(JSON.stringify({ ok: true, documentos: [], templates: [], notas: [] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }),
      );

      const view = render(
        <OportunidadeDetalhesPage params={Promise.resolve({ id: "lic_reanalise_1" })} />,
      );
      const btnTrigger = await screen.findByTestId("btn-open-verificar-participacao");

      // Aguarda carga das análises prévias para garantir analises.length > 0
      await waitFor(() =>
        expect(btnTrigger).toHaveTextContent(/1\/15/),
      );

      fireEvent.click(btnTrigger);

      // Modal de alerta deve aparecer ANTES do modal Raio-X
      expect(
        await screen.findByText(/Esta licitação já possui análise de IA realizada/i),
      ).toBeInTheDocument();
      expect(
        screen.queryByText(/⚡ Raio-X de Edital & ATA com Inteligência Artificial/i),
      ).not.toBeVisible();

      // Confirmar abre o modal Raio-X
      fireEvent.click(screen.getByRole("button", { name: /Sim, consumir cota e continuar/i }));
      await waitFor(() =>
        expect(
          screen.getByText(/⚡ Raio-X de Edital & ATA com Inteligência Artificial/i),
        ).toBeVisible(),
      );

      view.unmount();
    });

    it("7.2 Ignora análises com status ERRO ao decidir alerta de reanálise e não exibe '/10' quando cota ainda está carregando", async () => {
      const { default: OportunidadeDetalhesPage } = await import(
        "@/app/oportunidades/[id]/page"
      );

      vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL) => {
          const url = String(input);
          if (url.includes("/api/oportunidades/lic_reanalise_1/analise-ia")) {
            return new Response(
              JSON.stringify({
                ok: true,
                analises: [
                  {
                    id: "an_err_only",
                    status: "ERRO",
                    criadoEm: new Date().toISOString(),
                  },
                ],
                cota: null,
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            );
          }
          if (url.includes("/api/oportunidades/lic_reanalise_1") && !url.includes("/notas")) {
            return new Response(
              JSON.stringify({
                ok: true,
                oportunidade: {
                  id: "lic_reanalise_1",
                  idPncp: "00000000000100-1-000002/2026",
                  numeroEdital: "PE 02/2026",
                  orgaoNome: "Órgão Erro IA",
                  orgaoCnpj: "00.000.000/0001-00",
                  uf: "GO",
                  municipio: "Goiânia",
                  modalidade: "Pregão Eletrônico",
                  miniResumo: "Aquisição de Serviços",
                  resumo: "Objeto completo",
                  valorEstimado: 90000,
                  dataAbertura: new Date(Date.now() + 86400000).toISOString(),
                  status: "PENDENTE",
                  parecerIA: "GO",
                  arquivos: [],
                  itens: [],
                  notas: [],
                  historicoStatus: [],
                  analisesIA: [
                    {
                      id: "an_err_only",
                      status: "ERRO",
                      criadoEm: new Date().toISOString(),
                    },
                  ],
                },
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            );
          }
          if (url.includes("/api/faturamento") || url.includes("/api/planos/status")) {
            return new Response(
              JSON.stringify({ ok: true, billingStatus: "ATIVO", plano: "PRO", isReadOnly: false }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            );
          }
          return new Response(JSON.stringify({ ok: true, documentos: [], templates: [], notas: [] }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }),
      );

      const view = render(
        <OportunidadeDetalhesPage params={Promise.resolve({ id: "lic_reanalise_1" })} />,
      );
      const btnTrigger = await screen.findByTestId("btn-open-verificar-participacao");

      expect(btnTrigger).toHaveTextContent(/\(\.\.\.\)/);
      expect(btnTrigger.textContent).not.toContain("/10");

      fireEvent.click(btnTrigger);

      await waitFor(() =>
        expect(
          screen.getByText(/⚡ Raio-X de Edital & ATA com Inteligência Artificial/i),
        ).toBeVisible(),
      );
      expect(screen.getByTestId("modal-confirmar-reanalise-ia")).not.toHaveClass("is-visible");

      view.unmount();
    });
  });
});
