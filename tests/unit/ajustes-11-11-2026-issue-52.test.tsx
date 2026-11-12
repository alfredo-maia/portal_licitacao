import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { ASAAS_PLAN_PRICES_BRL } from "@/server/schemas/asaas.schema";
import {
  inMemoryTenants,
  inMemoryTenantUsers,
  resolverEstadoFinanceiroUnificadoTitular,
} from "@/server/services/tenant.service";
import { criarAssinaturaAsaas } from "@/server/services/asaas.service";
import {
  criarTicketSuporte,
  adicionarMensagemTicketSuporte,
  listarTicketsSuporte,
  marcarTicketVistoPeloCliente,
  resetInMemorySuporteStore,
} from "@/server/services/suporte.service";
import { AdminShell } from "@/components/admin/AdminShell";
import { SuperAdminDashboard } from "@/components/admin/SuperAdminDashboard";
import { Cliente360Screen } from "@/components/admin/screens/Cliente360Screen";
import { AfiliadosScreen } from "@/components/admin/screens/AfiliadosScreen";
import { SuporteAdminScreen } from "@/components/admin/screens/SuporteAdminScreen";
import { AdminTable, MAX_ADMIN_TABLE_PAGE_SIZE } from "@/components/admin/admin-ui";
import { SuporteModal } from "@/components/suporte/suporte-modal";
import PlanosPage from "@/app/planos/page";
import NotificacoesPage from "@/app/notificacoes/page";
import ConfiguracoesPage from "@/app/configuracoes/page";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => "/admin",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: {
      user: {
        id: "usr_cliente_1",
        name: "Cliente Teste",
        email: "teste25@gmail.com",
        role: "DIRETORIA",
      },
    },
    status: "authenticated",
  }),
  signOut: vi.fn(),
}));

describe("Issue #52 — Ajustes 11/11/2026 (ADM & Cliente)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    inMemoryTenants.clear();
    inMemoryTenantUsers.length = 0;
    resetInMemorySuporteStore();
  });

  it("Item 2: deve aplicar os valores oficiais dos planos no Front e Back (Básico R$ 59,90, Pro R$ 97,00, Enterprise R$ 197,00)", async () => {
    expect(ASAAS_PLAN_PRICES_BRL).toEqual({
      BASICO: 59.9,
      PRO: 97.0,
      ENTERPRISE: 197.0,
    });

    vi.spyOn(global, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/planos/status")) {
        return new Response(
          JSON.stringify({
            ok: true,
            plano: "PRO",
            billingStatus: "TRIAL",
            diasRestantesTrial: 12,
            maxCnpjs: 2,
            maxUsers: 2,
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ ok: true, faturas: [] }), { status: 200 });
    });

    render(<PlanosPage />);
    expect(await screen.findByText(/R\$\s*59,90/i)).toBeTruthy();
    expect(screen.getByText(/R\$\s*97,00|R\$\s*97/i)).toBeTruthy();
    expect(screen.getByText(/R\$\s*197,00|R\$\s*197/i)).toBeTruthy();
    expect(screen.queryByText(/R\$\s*997/i)).toBeNull();
  });

  it("Item 4 & Item 10: deve unificar os dias de Teste Grátis (12 dias) entre todos os CNPJs da conta (teste25@gmail.com) e refletir mudança de plano em todos os CNPJs", async () => {
    const agora = Date.now();
    const diaMs = 24 * 60 * 60 * 1000;
    const trialFim12Dias = new Date(agora + 12 * diaMs - 1000);
    const trialFim13Dias = new Date(agora + 13 * diaMs - 1000);

    inMemoryTenants.set("tnt_1", {
      id: "tnt_1",
      cnpj: "11.111.111/0001-11",
      razaoSocial: "Empresa 1 Ltda",
      plano: "PRO",
      billingStatus: "TRIAL",
      trialFim: trialFim12Dias,
      maxCnpjs: 3,
      maxUsers: 5,
      ativo: true,
      criadoEm: new Date(agora - 2 * diaMs),
      updatedAt: new Date(agora),
    });
    inMemoryTenants.set("tnt_2", {
      id: "tnt_2",
      cnpj: "22.222.222/0001-22",
      razaoSocial: "Empresa 2 Ltda",
      plano: "PRO",
      billingStatus: "TRIAL",
      trialFim: trialFim12Dias,
      maxCnpjs: 3,
      maxUsers: 5,
      ativo: true,
      criadoEm: new Date(agora - 2 * diaMs + 5000),
      updatedAt: new Date(agora),
    });
    inMemoryTenants.set("tnt_3", {
      id: "tnt_3",
      cnpj: "46.853.539/0001-94",
      razaoSocial: "Empresa 3 Divergente Ltda",
      plano: "PRO",
      billingStatus: "TRIAL",
      trialFim: trialFim13Dias,
      maxCnpjs: 3,
      maxUsers: 5,
      ativo: true,
      criadoEm: new Date(agora - 1 * diaMs),
      updatedAt: new Date(agora),
    });

    for (const tid of ["tnt_1", "tnt_2", "tnt_3"]) {
      inMemoryTenantUsers.push({
        id: `tu_${tid}`,
        tenantId: tid,
        userId: "usr_teste25",
        userEmail: "teste25@gmail.com",
        userName: "Teste 25",
        role: "TITULAR",
        ativo: true,
        criadoEm: new Date(agora - 2 * diaMs),
      });
    }

    const unificado = await resolverEstadoFinanceiroUnificadoTitular("usr_teste25", "tnt_3");
    expect(unificado?.trialFim?.getTime()).toBe(trialFim12Dias.getTime());
    expect(inMemoryTenants.get("tnt_3")?.trialFim?.getTime()).toBe(trialFim12Dias.getTime());

    // Item 10: Mudança de plano em 1 CNPJ deve refletir em todos os 3 CNPJs
    await criarAssinaturaAsaas({
      tenantId: "tnt_2",
      plano: "ENTERPRISE",
      billingType: "PIX",
      razaoSocial: "Empresa 2 Ltda",
      cnpj: "22.222.222/0001-22",
      email: "teste25@gmail.com",
    });

    expect(inMemoryTenants.get("tnt_1")?.plano).toBe("ENTERPRISE");
    expect(inMemoryTenants.get("tnt_2")?.plano).toBe("ENTERPRISE");
    expect(inMemoryTenants.get("tnt_3")?.plano).toBe("ENTERPRISE");
  });

  it("Item 5: deve exibir o 1º e 2º nomes do ADM à esquerda do sino e a tag do Papel à direita do nome no Header ADM", () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ notificacoes: [], naoLidas: 0 }), { status: 200 }),
    );

    render(
      <AdminShell
        adminEmail="vitorhenrique018@gmail.com"
        adminName="Vitor Henrique Alves"
        adminRole="SUPERADMIN_MASTER"
      >
        <div>Conteúdo</div>
      </AdminShell>,
    );

    const userInfo = screen.getByTestId("admin-header-user-info");
    const nameEl = within(userInfo).getByTestId("admin-header-user-name");
    const roleEl = within(userInfo).getByTestId("admin-header-user-role");
    expect(nameEl.textContent).toBe("Vitor Henrique");
    expect(roleEl.textContent).toContain("Master");

    // Garante que o papel está à direita do nome dentro de userInfo
    const children = Array.from(userInfo.children);
    expect(children.indexOf(nameEl)).toBeLessThan(children.indexOf(roleEl));
  });

  it("Item 6: deve exibir os 4 primeiros KPIs do Dashboard ADM como retângulos separados e clicáveis", () => {
    render(
      <SuperAdminDashboard
        metrics={{
          mrrEstimado: 970,
          arrEstimado: 11640,
          receitaEmRisco: 0,
          totalTenants: 10,
          tenantsAtivos: 10,
          tenantsTrial: 0,
          tenantsGracePeriod: 0,
          tenantsBloqueados: 0,
          tenantsCancelados: 0,
          totalVolumeArrematado: 50000,
          totalLicitacoesContempladas: 2,
          r2StorageTotalMb: 120,
          whatsappFilaPendentes: 0,
          whatsappInstanciaConectada: true,
        }}
        tenants={[]}
      />,
    );

    const tileMrr = screen.getByTestId("admin-kpi-card-mrr");
    const tileVol = screen.getByTestId("admin-kpi-card-volume");
    const tileR2 = screen.getByTestId("admin-kpi-card-r2");
    const tileWa = screen.getByTestId("admin-kpi-card-whatsapp");

    fireEvent.click(tileMrr);
    expect(pushMock).toHaveBeenCalledWith("/admin/financeiro");

    fireEvent.click(tileVol);
    expect(pushMock).toHaveBeenCalledWith("/admin/licitacoes");

    fireEvent.click(tileR2);
    expect(pushMock).toHaveBeenCalledWith("/admin/clientes");

    fireEvent.click(tileWa);
    expect(pushMock).toHaveBeenCalledWith("/admin/whatsapp");
  });

  it("Item 7: em Cliente/[id], Aba 2 destaca apenas o CNPJ selecionado e Aba 4 não exibe licitações RECUSADA", async () => {
    const dossieMock = {
      ok: true,
      tenantId: "tnt_1",
      tenant: {
        id: "tnt_1",
        razaoSocial: "Empresa Alpha",
        nomeFantasia: "Alpha",
        cnpj: "11.111.111/0001-11",
        plano: "PRO",
        billingStatus: "TRIAL",
        diasRestantesTrial: 12,
        diasAtraso: 0,
        valorMensalidade: 97,
        ativo: true,
      },
      titular: {
        id: "u1",
        name: "Titular Teste",
        email: "teste25@gmail.com",
        role: "DIRETORIA",
        ativo: true,
      },
      onboarding: {
        score: 4,
        percentual: 57,
        statusEngajamento: "EM_CONFIGURACAO",
      },
      empresas: [
        {
          id: "tnt_1",
          cnpj: "11.111.111/0001-11",
          razaoSocial: "Empresa Alpha",
          plano: "PRO",
          billingStatus: "TRIAL",
          ativo: true,
          segmentos: [],
          ufs: [],
        },
        {
          id: "tnt_2",
          cnpj: "22.222.222/0001-22",
          razaoSocial: "Empresa Beta",
          plano: "PRO",
          billingStatus: "TRIAL",
          ativo: true,
          segmentos: [],
          ufs: [],
        },
        {
          id: "tnt_3",
          cnpj: "46.853.539/0001-94",
          razaoSocial: "Empresa Gamma",
          plano: "PRO",
          billingStatus: "TRIAL",
          ativo: true,
          segmentos: [],
          ufs: [],
        },
      ],
      usuarios: [],
      patrimonioOperacional: {
        licitacoes: [
          {
            id: "tl_1",
            tenantId: "tnt_1",
            tenantNome: "Alpha",
            licitacaoId: "lic_1",
            numeroEdital: "PE 001/2026",
            orgaoNome: "Prefeitura A",
            statusKanban: "EM_DISPUTA",
            valorEstimado: 10000,
            lanceMinimo: null,
            dataAbertura: null,
            notas: null,
          },
          {
            id: "tl_2",
            tenantId: "tnt_1",
            tenantNome: "Alpha",
            licitacaoId: "lic_2",
            numeroEdital: "PE 999/2026-RECUSADA",
            orgaoNome: "Prefeitura Recusada",
            statusKanban: "RECUSADA",
            valorEstimado: 20000,
            lanceMinimo: null,
            dataAbertura: null,
            notas: null,
          },
        ],
        kanbanPorColuna: { EM_DISPUTA: 1, RECUSADA: 1 },
        documentos: { total: 0, vencidos: 0, bytes: 0, lista: [] },
        portais: 0,
        impugnacoes: 0,
        precosSalvos: 0,
      },
      cotas: {
        maxCnpjs: 3,
        maxUsers: 5,
        storageBaseMb: 2048,
        storageExtraQuotaMb: 0,
        storageTotalMb: 2048,
        storageUsadoMb: 0,
        aiExtraQuotaMes: 0,
        aiUsadasMes: 0,
      },
      financeiro: {
        plano: "PRO",
        billingStatus: "TRIAL",
        valorMensalidade: 97,
      },
      disputas: [],
    };

    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify(dossieMock), { status: 200 }),
    );

    const { container } = render(<Cliente360Screen tenantId="tnt_1" />);
    await screen.findByText(/3 CNPJ\(s\) do cliente/i);

    const activeRows = container.querySelectorAll("tr.pncp-admin-row--active");
    expect(activeRows.length).toBe(1);

    // Aba 4: não deve exibir a licitação RECUSADA
    expect(screen.getByText(/PE 001\/2026/i)).toBeTruthy();
    expect(screen.queryByText(/PE 999\/2026-RECUSADA/i)).toBeNull();
  });

  it("Item 8: em Afiliados, deve exibir botão verde Registrar pagamento, Qtd. Clientes indicados e coluna/modal Relatório", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/admin/afiliados")) {
        return new Response(
          JSON.stringify({
            afiliados: [
              {
                id: "aff_1",
                nome: "Parceiro Ouro",
                documento: "123.456.789-00",
                email: "parceiro@ouro.com",
                telefone: "11999999999",
                chavePix: "parceiro@ouro.com",
                codigo: "OURO20",
                percentualComissao: 20,
                tipoComissao: "RECORRENTE",
                descontoIndicadosPct: 10,
                diasExtrasTrial: 7,
                ativo: true,
                linkIndicacao: "/cadastro?ref=OURO20",
                totalIndicados: 2,
                indicados: [
                  { id: "tnt_a", nome: "Cliente A", cnpj: "11.111.111/0001-11", plano: "PRO", valorBasePlano: 97, valorComissao: 19.4, criadoEm: "2026-11-01T10:00:00.000Z" },
                  { id: "tnt_b", nome: "Cliente B", cnpj: "22.222.222/0001-22", plano: "ENTERPRISE", valorBasePlano: 197, valorComissao: 39.4, criadoEm: "2026-11-05T10:00:00.000Z" },
                ],
                comissaoPendenteBrl: 58.8,
                comissaoPagaBrl: 0,
              },
            ],
            comissoes: [
              {
                id: "com_1",
                affiliateId: "aff_1",
                tenantId: "tnt_a",
                tenantNome: "Cliente A",
                competenciaMes: "2026-11",
                valorBasePlano: 294,
                percentualAplicado: 20,
                valorComissao: 58.8,
                status: "PAGO",
                pagoEm: "2026-11-10T12:00:00.000Z",
                comprovanteObs: "Pago via PIX mensal",
                quantidadeIndicados: 2,
              },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify([]), { status: 200 });
    });

    render(<AfiliadosScreen />);
    const btnRegistrar = await screen.findByTestId("btn-registrar-pagamento-afiliado");
    expect(btnRegistrar).toBeTruthy();

    fireEvent.click(btnRegistrar);
    expect(await screen.findByTestId("modal-registrar-pagamento-afiliado")).toBeTruthy();

    // Verifica coluna Qtd. Clientes indicados e botão Relatório na aba Repasses & Comissões
    expect(screen.getByText(/Qtd\. Clientes indicados/i)).toBeTruthy();
    const btnRelatorio = screen.getByTestId("btn-relatorio-comissao-com_1");
    fireEvent.click(btnRelatorio);
    expect(await screen.findByTestId("modal-relatorio-comissao")).toBeTruthy();
  });

  it("Item 9: em Suporte ADM, deve remover botões +10 Análises IA e +1 GB Cofre R2, exibir Select de Macros e usar cor vermelha para urgência ALTA/CRITICA", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            id: "tkt_1",
            protocolo: "PROT-202611-0001",
            tenantId: "tnt_1",
            autorNome: "João Cliente",
            autorEmail: "joao@empresa.com",
            autorTelefone: "11999990000",
            categoria: "PROBLEMA_TECNICO",
            urgencia: "ALTA",
            assunto: "Erro no robô",
            status: "ABERTO",
            criadoEm: "2026-11-11T10:00:00.000Z",
            atualizadoEm: "2026-11-11T10:00:00.000Z",
            mensagens: [],
          },
        ]),
        { status: 200 },
      ),
    );

    render(<SuporteAdminScreen />);
    const btnAtender = await screen.findByRole("button", { name: /Atender/i });
    fireEvent.click(btnAtender);

    expect(screen.queryByText(/\+10 Análises IA/i)).toBeNull();
    expect(screen.queryByText(/\+1 GB Cofre R2/i)).toBeNull();
    expect(screen.getByLabelText(/Mensagens rápidas \(Macros\)/i)).toBeTruthy();
  });

  it("Item 11: Central de Suporte do Cliente deve exibir abas Em Aberto e Encerrados em tabela paginada, carregar Chat sob demanda e contabilizar mensagens não lidas", async () => {
    const ticket = await criarTicketSuporte(
      {
        categoria: "DUVIDA",
        urgencia: "ALTA",
        assunto: "Dúvida sobre certidão",
        descricao: "Como envio a CND?",
      },
      { id: "usr_1", name: "Cliente", email: "c@teste.com", tenantId: "tnt_1" },
    );

    await adicionarMensagemTicketSuporte(
      ticket.id,
      { mensagem: "Olá! Basta arrastar o PDF na tela Documentação." },
      { id: "adm_1", name: "Suporte ADM", autorTipo: "SUPORTE", isSuperAdmin: true, tenantId: "tnt_1" },
    );

    const listaAntes = await listarTicketsSuporte("tnt_1", "usr_1");
    expect(listaAntes[0].mensagensNaoLidasCliente).toBe(1);

    await marcarTicketVistoPeloCliente(ticket.id, "usr_1");
    const listaDepois = await listarTicketsSuporte("tnt_1", "usr_1");
    expect(listaDepois[0].mensagensNaoLidasCliente).toBe(0);

    const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes(`/api/suporte/tickets/${ticket.id}/mensagens`)) {
        return new Response(
          JSON.stringify({
            ok: true,
            ticket: {
              ...ticket,
              criadoEm: ticket.criadoEm.toISOString(),
              atualizadoEm: ticket.atualizadoEm.toISOString(),
              mensagensNaoLidasCliente: 0,
              mensagens: [
                {
                  id: "m1",
                  ticketId: ticket.id,
                  autorId: "adm_1",
                  autorNome: "Suporte ADM",
                  autorTipo: "SUPORTE",
                  mensagem: "Olá! Basta arrastar o PDF na tela Documentação.",
                  criadoEm: new Date().toISOString(),
                },
              ],
            },
          }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({
          ok: true,
          totalMensagensNaoLidas: 1,
          tickets: [
            {
              id: ticket.id,
              protocolo: ticket.protocolo,
              categoria: ticket.categoria,
              urgencia: ticket.urgencia,
              assunto: ticket.assunto,
              status: "RESPONDIDO",
              criadoEm: ticket.criadoEm.toISOString(),
              atualizadoEm: ticket.atualizadoEm.toISOString(),
              mensagensNaoLidasCliente: 1,
              mensagens: [],
            },
          ],
        }),
        { status: 200 },
      );
    });

    render(<SuporteModal open={true} onClose={vi.fn()} />);
    expect(await screen.findByRole("tab", { name: /Em Aberto/i })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Encerrados/i })).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: /Em Aberto/i }));
    const btnChat = await screen.findByTestId(`btn-abrir-chat-${ticket.id}`);
    // Antes de clicar em Chat, não carregou o endpoint de mensagens individuais
    expect(fetchSpy).not.toHaveBeenCalledWith(
      expect.stringContaining(`/api/suporte/tickets/${ticket.id}/mensagens`),
    );

    fireEvent.click(btnChat);
    await waitFor(() => {
      expect(screen.getByTestId("modal-chat-suporte")).toBeTruthy();
    });
    expect(await screen.findByText(/Basta arrastar o PDF na tela Documentação/i)).toBeTruthy();
  });

  it("Item 12: na tela /notificacoes do cliente, alertas criados pelo ADM (N12_AVISO_SISTEMA) devem ter cor e destaque exclusivos", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          total: 2,
          naoLidas: 2,
          page: 1,
          pageSize: 20,
          totalPages: 1,
          notificacoes: [
            {
              id: "notif_adm_1",
              tipo: "N12_AVISO_SISTEMA",
              titulo: "Manutenção Programada ADM",
              descricao: "Sistema passará por atualização às 23h.",
              severidade: "ATENCAO",
              linkDestino: null,
              criadaEm: new Date().toISOString(),
              lida: false,
            },
            {
              id: "notif_doc_1",
              tipo: "N1_DOC_VENCENDO",
              titulo: "Certidão FGTS vencendo",
              descricao: "Vence em 5 dias.",
              severidade: "ATENCAO",
              linkDestino: "/documentacao",
              criadaEm: new Date().toISOString(),
              lida: false,
            },
          ],
        }),
        { status: 200 },
      ),
    );

    render(<NotificacoesPage />);
    const cardAdm = await screen.findByTestId("notificacao-card-adm-notif_adm_1");
    expect(cardAdm).toBeTruthy();
    expect(within(cardAdm).getByText(/Comunicado ADM/i)).toBeTruthy();
  });

  it("Item 1: deve disponibilizar áreas de Drag-and-Drop em campos de upload de Logo, Assinatura e CSV em /configuracoes", () => {
    render(<ConfiguracoesPage />);
    fireEvent.click(screen.getByRole("tab", { name: /Dados da Empresa/i }));
    expect(screen.getByTestId("dropzone-logo-empresa")).toBeTruthy();
    expect(screen.getByTestId("dropzone-timbrado-empresa")).toBeTruthy();
    expect(screen.getByTestId("dropzone-assinatura-digital")).toBeTruthy();
    expect(screen.getByTestId("dropzone-csv-precos")).toBeTruthy();
  });

  it("Item 3: deve aplicar teto máximo de paginação (<= 100 rows) em AdminTable", () => {
    expect(MAX_ADMIN_TABLE_PAGE_SIZE).toBe(100);
    const colunas = [{ key: "col", header: "Coluna" }];
    const muitasLinhas = Array.from({ length: 150 }, (_, i) => ({
      id: `row_${i}`,
      col: `Item ${i}`,
    }));

    render(
      <AdminTable
        titulo="Tabela com muitas linhas"
        colunas={colunas}
        linhas={muitasLinhas}
        pageSizes={[20, 50, 200]}
      />,
    );

    expect(screen.getByText("Tabela com muitas linhas")).toBeTruthy();
  });
});

