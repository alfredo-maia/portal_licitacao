import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/clientes",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next-auth/react", () => ({
  signOut: vi.fn(),
}));

import { ADMIN_ROUTES } from "@/server/schemas/superadmin.schema";
import { ClientesScreen } from "@/components/admin/screens/ClientesScreen";
import { Cliente360Screen } from "@/components/admin/screens/Cliente360Screen";
import { FinanceiroScreen } from "@/components/admin/screens/FinanceiroScreen";
import { AfiliadosScreen } from "@/components/admin/screens/AfiliadosScreen";

describe("Issue #66 — Cards em Financeiro e Afiliados, Ordenação, Último Acesso Global no Topo, Hover Multi-CNPJ e Refinamento de Clientes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("1. Navbar & Nomenclatura (Clientes sem 360º)", () => {
    it("renomeia rota de Clientes na navbar para 'Clientes' sem '360º'", () => {
      const rotaClientes = ADMIN_ROUTES.find((r) => r.id === "clientes");
      expect(rotaClientes?.label).toBe("Clientes");
    });
  });

  describe("2. /admin/clientes/[id] — Último acesso global no topo direito + 'Configurado'", () => {
    it("exibe Último acesso (global) à esquerda das tags de status e plano e usa 'Configurado' em vez de 'Engajado'", async () => {
      const dossieMock = {
        ok: true,
        tenantId: "tnt_1",
        tenant: {
          id: "tnt_1",
          cnpj: "11.111.111/0001-11",
          razaoSocial: "Panificadora ME Ltda",
          nomeFantasia: "Panificadora ME",
          plano: "PRO",
          billingStatus: "TRIAL",
          ativo: true,
          diasRestantesTrial: 6,
        },
        titular: {
          id: "usr_1",
          name: "Vitor Silva",
          email: "vitor@panificadora.com",
          cpf: null,
          telefone: "(62) 99999-1234",
          cidade: "Goiânia",
          uf: "GO",
          ativo: true,
          sessionVersion: 1,
          ultimoLoginEm: "2026-11-27T12:00:00.000Z",
        },
        onboarding: { score: 7, percentual: 100, statusEngajamento: "ENGAJADO" },
        empresas: [
          {
            id: "tnt_1",
            cnpj: "11.111.111/0001-11",
            razaoSocial: "Panificadora ME Ltda",
            nomeFantasia: "Panificadora ME",
            uf: "GO",
            cidade: "Goiânia",
            plano: "PRO",
            billingStatus: "TRIAL",
            ativo: true,
            brasilInteiro: true,
            ufs: [],
            segmentos: [],
            subsegmentos: [],
          },
        ],
        usuarios: [],
        patrimonioOperacional: {
          licitacoes: [],
          kanbanPorColuna: {},
          documentos: { total: 0, vencidos: 0, bytes: 0, lista: [] },
          portais: 0,
          impugnacoes: 0,
          precosSalvos: 0,
        },
        porEmpresa: {},
        cotasPorEmpresa: {},
        cotas: {
          maxCnpjs: 2,
          maxUsers: 2,
          storageBaseMb: 2000,
          storageExtraQuotaMb: 0,
          storageTotalMb: 2000,
          storageUsadoMb: 0,
          aiExtraQuotaMes: 0,
          aiUsadasMes: 0,
        },
        usoGlobal: {
          status: "USO_DIARIO",
          rotulo: "Uso diário",
          diasAtivos7d: 5,
          diasAtivos30d: 14,
          totalAcessos30d: 40,
          totalAcoesValor30d: 12,
          ultimoAcessoEm: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
          ultimaRota: "/oportunidades",
        },
        usoPorEmpresa: {},
        usoPorUsuario: [],
        notasInternasAdm: null,
        disputas: [],
      };

      vi.spyOn(global, "fetch").mockResolvedValue(
        new Response(JSON.stringify(dossieMock), { status: 200 }),
      );

      render(<Cliente360Screen tenantId="tnt_1" />);
      const globalBadge = await screen.findByTestId("cliente-ultimo-acesso-global");
      expect(globalBadge.textContent).toMatch(/Último acesso \(global\)/i);
      expect(globalBadge.textContent).toMatch(/há 10 min|agora/i);

      // Rótulo 'Configurado' no lugar de 'Engajado'
      expect(screen.getByText("Configurado")).toBeInTheDocument();
      expect(screen.queryByText("Engajado")).not.toBeInTheDocument();
    });
  });

  describe("3. /admin/clientes — Filtros limpos, Ordenação, Hover Multi-CNPJ e Card Enxuto", () => {
    it("remove filtros de pagamento, ordena por IA/uso/cadastro, exibe Nome-Telefone-Email, remove docs/X-7/Abrir 360º e mostra outros CNPJs no hover", async () => {
      const mockClients = [
        {
          id: "tnt_a",
          cnpj: "10.000.000/0001-10",
          razaoSocial: "Alpha Matriz Ltda",
          nomeFantasia: "Alpha Tech",
          plano: "PRO",
          billingStatus: "TRIAL",
          ativo: true,
          titularNome: "Vitor Silva",
          titularEmail: "vitor@alpha.com",
          telefone: "62999991111",
          totalLicitacoesKanban: 5,
          totalDocumentosCofre: 9,
          totalUsuarios: 2,
          aiUsadasMes: 3,
          qtdCnpjs: 3,
          cnpjsAdicionaisCount: 2,
          cnpjsVinculados: [
            { id: "tnt_a", cnpj: "10.000.000/0001-10", razaoSocial: "Alpha Matriz Ltda", nomeFantasia: "Alpha Tech" },
            { id: "tnt_a2", cnpj: "20.000.000/0001-20", razaoSocial: "Filial Beta Comercio SA", nomeFantasia: "Beta Filial" },
            { id: "tnt_a3", cnpj: "30.000.000/0001-30", razaoSocial: "Gama Servicos Ltda", nomeFantasia: null },
          ],
          criadoEm: "2026-11-25T12:00:00.000Z",
          onboarding: { score: 7, statusEngajamento: "ENGAJADO" },
          uso: {
            status: "USO_SEMANAL",
            rotulo: "Uso semanal",
            diasAtivos7d: 1,
            diasAtivos30d: 4,
            totalAcessos30d: 10,
            totalAcoesValor30d: 2,
            ultimoAcessoEm: "2026-11-25T10:00:00.000Z",
          },
        },
        {
          id: "tnt_b",
          cnpj: "40.000.000/0001-40",
          razaoSocial: "Omega Licitações Ltda",
          nomeFantasia: "Omega",
          plano: "ENTERPRISE",
          billingStatus: "ATIVO",
          ativo: true,
          titularNome: "Carla Dias",
          titularEmail: "carla@omega.com",
          telefone: null,
          totalLicitacoesKanban: 12,
          totalDocumentosCofre: 4,
          totalUsuarios: 4,
          aiUsadasMes: 28,
          qtdCnpjs: 1,
          cnpjsAdicionaisCount: 0,
          cnpjsVinculados: [
            { id: "tnt_b", cnpj: "40.000.000/0001-40", razaoSocial: "Omega Licitações Ltda", nomeFantasia: "Omega" },
          ],
          criadoEm: "2026-11-10T12:00:00.000Z",
          onboarding: { score: 4, statusEngajamento: "EM_CONFIGURACAO" },
          uso: {
            status: "USO_DIARIO",
            rotulo: "Uso diário",
            diasAtivos7d: 6,
            diasAtivos30d: 20,
            totalAcessos30d: 80,
            totalAcoesValor30d: 30,
            ultimoAcessoEm: "2026-11-27T14:00:00.000Z",
          },
        },
      ];

      vi.spyOn(global, "fetch").mockResolvedValue(
        new Response(JSON.stringify(mockClients), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      render(<ClientesScreen />);

      // Título limpo 'Clientes' sem '360º'
      expect(screen.getByRole("heading", { level: 1, name: "Clientes" })).toBeInTheDocument();

      // Filtros de pagamento/engajados removidos
      expect(screen.queryByRole("tab", { name: /^Engajados$/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("tab", { name: /^Inadimplentes$/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("tab", { name: /^Cancelados$/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("tab", { name: /^Pagantes$/i })).not.toBeInTheDocument();
      expect(screen.queryByRole("tab", { name: /^Carência$/i })).not.toBeInTheDocument();

      // Filtros operacionais presentes
      expect(screen.getByRole("tab", { name: /^Todos$/i })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: /Teste grátis/i })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: /Sem uso \/ Esfriando/i })).toBeInTheDocument();

      const cardA = await screen.findByTestId("cliente-card-tnt_a");
      expect(cardA.textContent).toContain("Configurado");
      expect(cardA.textContent).not.toContain("Engajado");
      expect(cardA.textContent).not.toContain("7/7");
      expect(cardA.textContent).not.toMatch(/\bdocs\b/i);
      expect(cardA.textContent).not.toMatch(/Abrir 360/i);

      // Ordem: Nome -> Telefone -> E-mail
      expect(cardA.textContent).toMatch(/Vitor Silva.*\(62\) 99999-1111.*vitor@alpha\.com/);

      // Hover exibe Razão Social e CNPJ das demais contas vinculadas
      fireEvent.mouseEnter(cardA);
      const popover = await screen.findByTestId("card-outros-cnpjs-popover-tnt_a");
      expect(popover.textContent).toContain("Filial Beta Comercio SA");
      expect(popover.textContent).toContain("20.000.000/0001-20");
      expect(popover.textContent).toContain("Gama Servicos Ltda");
      expect(popover.textContent).toContain("30.000.000/0001-30");

      // Ordenação: Uso de IA maior -> menor coloca tnt_b (28 IA) antes de tnt_a (3 IA)
      const sortSelect = screen.getByTestId("clientes-sort-select");
      fireEvent.change(sortSelect, { target: { value: "ia_desc" } });
      await waitFor(() => {
        const cards = screen.getAllByTestId(/^cliente-card-/);
        expect(cards[0].getAttribute("data-testid")).toBe("cliente-card-tnt_b");
        expect(cards[1].getAttribute("data-testid")).toBe("cliente-card-tnt_a");
      });
    });
  });

  describe("4. /admin/financeiro — Cards Paginados (20/pág), Sem 'Em risco' e com Ordenação", () => {
    it("renderiza carteira em cards (sem tabela), pagina 20 por página, remove 'Em risco' e ordena por mensalidade", async () => {
      const mockClientes = Array.from({ length: 23 }, (_, i) => ({
        id: `fin_${i + 1}`,
        cnpj: `50.000.000/0001-${String(10 + i).padStart(2, "0")}`,
        razaoSocial: `Financeiro Empresa ${i + 1} Ltda`,
        nomeFantasia: `FinCard ${i + 1}`,
        plano: i === 22 ? "ENTERPRISE" : "BASICO",
        billingStatus: i % 3 === 0 ? "ATIVO" : "TRIAL",
        valorMensalidade: i === 22 ? 997 : 197,
        diasRestantesTrial: 7,
        diasAtraso: 0,
        qtdCnpjs: 1,
        cnpjsAdicionaisCount: 0,
        cnpjsVinculados: [],
        titularNome: `Resp ${i + 1}`,
        titularEmail: `fin${i + 1}@emp.com`,
        telefone: null,
        criadoEm: `2026-11-${String(Math.max(1, 27 - i)).padStart(2, "0")}T12:00:00.000Z`,
        trialFim: "2026-12-04T12:00:00.000Z",
        vencimentoAssinatura: "2026-12-20T12:00:00.000Z",
        cupomCodigo: null,
      }));

      vi.spyOn(global, "fetch").mockResolvedValue(
        new Response(JSON.stringify({ clientes: mockClientes, cupons: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

      const { container } = render(<FinanceiroScreen />);

      await waitFor(() => {
        expect(screen.getAllByTestId(/^financeiro-card-/).length).toBe(20);
      });

      // Sem tabela na carteira de clientes
      expect(container.querySelector('[data-testid="financeiro-cards-grid"] table')).toBeNull();

      // Filtro 'Em risco' removido
      expect(screen.queryByRole("tab", { name: /^Em risco$/i })).not.toBeInTheDocument();

      // Ordenar por maior mensalidade coloca fin_23 (R$ 997) em primeiro lugar na página 1!
      const sortFin = screen.getByTestId("financeiro-sort-select");
      fireEvent.change(sortFin, { target: { value: "valor_desc" } });
      await waitFor(() => {
        const cards = screen.getAllByTestId(/^financeiro-card-/);
        expect(cards[0].getAttribute("data-testid")).toBe("financeiro-card-fin_23");
      });
    });
  });

  describe("5. /admin/afiliados — Cards para Afiliados e Repasses & Comissões", () => {
    it("renderiza afiliados e comissões em cards paginados sem tabelas mantendo ações", async () => {
      const payloadAfiliados = {
        afiliados: [
          {
            id: "aff_1",
            nome: "Parceiro Ouro",
            documento: "123.456.789-00",
            email: "ouro@parceiro.com",
            telefone: "(62) 98888-7777",
            chavePix: "ouro@pix.com",
            codigo: "OURO20",
            percentualComissao: 20,
            tipoComissao: "RECORRENTE",
            descontoIndicadosPct: 10,
            diasExtrasTrial: 7,
            ativo: true,
            linkIndicacao: "/cadastro?ref=OURO20",
            totalIndicados: 3,
            indicados: [{ id: "t1", nome: "Empresa Indicada 1" }],
            comissaoPendenteBrl: 150,
            comissaoPagaBrl: 450,
          },
        ],
        comissoes: [
          {
            id: "com_1",
            affiliateId: "aff_1",
            tenantId: "t1",
            tenantNome: "Empresa Indicada 1",
            competenciaMes: "2026-11",
            valorBasePlano: 500,
            percentualAplicado: 20,
            valorComissao: 100,
            status: "PENDENTE",
            pagoEm: null,
            comprovanteObs: null,
            quantidadeIndicados: 2,
          },
        ],
      };

      vi.spyOn(global, "fetch").mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes("/api/admin/tenants")) {
          return new Response(JSON.stringify([]), { status: 200 });
        }
        return new Response(JSON.stringify(payloadAfiliados), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      });

      const { container } = render(<AfiliadosScreen />);

      const cardAff = await screen.findByTestId("afiliado-card-aff_1");
      expect(cardAff.textContent).toContain("Parceiro Ouro");
      expect(cardAff.textContent).toContain("OURO20");
      expect(container.querySelector('[data-testid="afiliados-cards-grid"] table')).toBeNull();

      // Troca para Aba 2 (Repasses & Comissões) -> também renderiza em cards
      fireEvent.click(screen.getByRole("tab", { name: /Repasses & Comissões/i }));
      const cardCom = await screen.findByTestId("comissao-card-com_1");
      expect(cardCom.textContent).toContain("2026-11");
      expect(cardCom.textContent).toContain("Parceiro Ouro");
      expect(screen.getByTestId("btn-relatorio-comissao-com_1")).toBeInTheDocument();
    });
  });
});
