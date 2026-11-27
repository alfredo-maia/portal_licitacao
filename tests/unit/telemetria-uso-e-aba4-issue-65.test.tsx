import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/clientes",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

import {
  classificarSaudeUso,
  normalizarModuloDaRota,
  registrarAtividadeCliente,
  registrarAcaoValorCliente,
  agregarTelemetriaUsoTenants,
  clearInMemoryDailyActivity,
} from "@/server/services/usage-telemetry.service";
import { ClientesScreen } from "@/components/admin/screens/ClientesScreen";
import { Cliente360Screen } from "@/components/admin/screens/Cliente360Screen";

describe("Issue #65 — Aba 4 Limpa + Radar de Uso & Engajamento (Global e por CNPJ)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearInMemoryDailyActivity();
  });

  describe("1. Motor de Telemetria — Classificação, Normalização e Consolidação Diária", () => {
    it("classifica corretamente USO_DIARIO (3-7d), USO_SEMANAL (1-2d), ESFRIANDO (8-14d) e SEM_USO (15+d / nunca)", () => {
      const ref = new Date("2026-11-27T15:00:00-03:00");

      expect(
        classificarSaudeUso({
          diasAtivos7d: 4,
          diasAtivos30d: 12,
          ultimoAcessoEm: new Date("2026-11-27T12:00:00-03:00"),
          agora: ref,
        }),
      ).toMatchObject({ status: "USO_DIARIO", rotulo: "Uso diário" });

      expect(
        classificarSaudeUso({
          diasAtivos7d: 2,
          diasAtivos30d: 5,
          ultimoAcessoEm: new Date("2026-11-26T10:00:00-03:00"),
          agora: ref,
        }),
      ).toMatchObject({ status: "USO_SEMANAL", rotulo: "Uso semanal" });

      expect(
        classificarSaudeUso({
          diasAtivos7d: 0,
          diasAtivos30d: 3,
          ultimoAcessoEm: new Date("2026-11-17T10:00:00-03:00"), // 10 dias atrás
          agora: ref,
        }),
      ).toMatchObject({ status: "ESFRIANDO", rotulo: "Esfriando" });

      expect(
        classificarSaudeUso({
          diasAtivos7d: 0,
          diasAtivos30d: 0,
          ultimoAcessoEm: null,
          agora: ref,
        }),
      ).toMatchObject({ status: "SEM_USO", rotulo: "Sem uso" });
    });

    it("normaliza rotas de cliente para nomes de módulo e consolida 1 linha por dia/CNPJ/usuário", async () => {
      expect(normalizarModuloDaRota("/oportunidades/abc-123")).toBe("dossie");
      expect(normalizarModuloDaRota("/oportunidades")).toBe("oportunidades");
      expect(normalizarModuloDaRota("/historico-licitacoes")).toBe("historico-licitacoes");
      expect(normalizarModuloDaRota("/minhas-licitacoes")).toBe("minhas-licitacoes");

      const ref = new Date("2026-11-27T14:00:00-03:00");
      const d1 = new Date("2026-11-27T10:00:00-03:00");
      const d2 = new Date("2026-11-25T10:00:00-03:00");
      const d3 = new Date("2026-11-23T10:00:00-03:00");

      await registrarAtividadeCliente({
        tenantId: "tnt_uso_a",
        userId: "usr_1",
        usuarioNome: "Ana",
        usuarioEmail: "ana@emp.com",
        rota: "/oportunidades",
        ocorridoEm: d1,
      });
      await registrarAtividadeCliente({
        tenantId: "tnt_uso_a",
        userId: "usr_1",
        usuarioNome: "Ana",
        usuarioEmail: "ana@emp.com",
        rota: "/oportunidades/lic_1",
        ocorridoEm: d1,
      });
      await registrarAcaoValorCliente({
        tenantId: "tnt_uso_a",
        userId: "usr_1",
        acao: "deliberacao",
        ocorridoEm: d1,
      });
      await registrarAtividadeCliente({
        tenantId: "tnt_uso_a",
        userId: "usr_1",
        usuarioNome: "Ana",
        usuarioEmail: "ana@emp.com",
        rota: "/historico-licitacoes",
        ocorridoEm: d2,
      });
      await registrarAtividadeCliente({
        tenantId: "tnt_uso_a",
        userId: "usr_1",
        usuarioNome: "Ana",
        usuarioEmail: "ana@emp.com",
        rota: "/dashboard",
        ocorridoEm: d3,
      });

      // Segundo CNPJ da mesma conta com apenas 1 dia na semana
      await registrarAtividadeCliente({
        tenantId: "tnt_uso_b",
        userId: "usr_1",
        usuarioNome: "Ana",
        usuarioEmail: "ana@emp.com",
        rota: "/dashboard",
        ocorridoEm: d1,
      });

      const mapa = await agregarTelemetriaUsoTenants(["tnt_uso_a", "tnt_uso_b"], {
        agora: ref,
        incluirRetroativoDb: false,
      });

      const usoA = mapa.porTenant.get("tnt_uso_a")!;
      expect(usoA.diasAtivos7d).toBe(3);
      expect(usoA.status).toBe("USO_DIARIO");
      expect(usoA.totalAcessos30d).toBe(4);
      expect(usoA.totalAcoesValor30d).toBe(1);
      expect(usoA.serie14Dias).toHaveLength(14);
      expect(usoA.modulosTop.some((m) => m.modulo === "oportunidades")).toBe(true);

      const usoB = mapa.porTenant.get("tnt_uso_b")!;
      expect(usoB.diasAtivos7d).toBe(1);
      expect(usoB.status).toBe("USO_SEMANAL");
    });
  });

  describe("2. Cards & Filtro 'Sem uso / Esfriando' em /admin/clientes", () => {
    it("exibe status de uso entre usuários e IA/mês no card e envia status=SEM_USO_OU_ESFRIANDO ao clicar no filtro", async () => {
      const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(async () =>
        new Response(
          JSON.stringify([
            {
              id: "tnt_card_1",
              cnpj: "10.000.000/0001-10",
              razaoSocial: "Empresa Engajada Ltda",
              nomeFantasia: "Engajada Tech",
              plano: "PRO",
              billingStatus: "TRIAL",
              ativo: true,
              titularNome: "Carlos",
              titularEmail: "carlos@engajada.com",
              totalLicitacoesKanban: 4,
              totalDocumentosCofre: 2,
              totalUsuarios: 2,
              aiUsadasMes: 6,
              criadoEm: "2026-11-10T12:00:00.000Z",
              onboarding: { score: 6, statusEngajamento: "ENGAJADO" },
              uso: {
                status: "USO_DIARIO",
                rotulo: "Uso diário",
                diasAtivos7d: 5,
                diasAtivos30d: 14,
                totalAcessos30d: 42,
                totalAcoesValor30d: 11,
                ultimoAcessoEm: "2026-11-27T12:00:00.000Z",
              },
            },
          ]),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      );

      render(<ClientesScreen />);

      const card = await screen.findByTestId("cliente-card-tnt_card_1");
      expect(card.textContent).toMatch(/2 usuário\(s\).*Uso diário.*6 IA\/mês/i);

      const filtroSemUso = screen.getByRole("tab", { name: /Sem uso \/ Esfriando/i });
      fireEvent.click(filtroSemUso);

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith(
          expect.stringContaining("status=SEM_USO_OU_ESFRIANDO"),
          expect.anything(),
        );
      });
    });
  });

  describe("3. Cliente360Screen — Aba 4 só CNPJ Ativo + Nova Aba 7 (Uso & Engajamento)", () => {
    it("Aba 4 mostra apenas o CNPJ selecionado no topo e Aba 7 mostra uso do CNPJ ativo, 14 dias, módulos e comparativo", async () => {
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
          diasRestantesTrial: 5,
        },
        titular: {
          id: "usr_1",
          name: "Vitor",
          email: "vitor@panificadora.com",
          cpf: null,
          telefone: null,
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
            segmentos: ["ALIMENTACAO"],
            subsegmentos: [],
          },
          {
            id: "tnt_2",
            cnpj: "22.222.222/0001-22",
            razaoSocial: "DM TECH Ltda",
            nomeFantasia: "DM TECH",
            uf: "MG",
            cidade: "Uberlândia",
            plano: "PRO",
            billingStatus: "TRIAL",
            ativo: true,
            brasilInteiro: false,
            ufs: ["MG"],
            segmentos: ["TECNOLOGIA"],
            subsegmentos: [],
          },
        ],
        usuarios: [
          {
            id: "usr_1",
            name: "Vitor",
            email: "vitor@panificadora.com",
            role: "DIRETORIA",
            ativo: true,
            tenantRole: "TITULAR",
            tenants: ["tnt_1", "tnt_2"],
            telefone: null,
            ultimoLoginEm: "2026-11-27T12:00:00.000Z",
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
          diasAtivos30d: 16,
          totalAcessos30d: 60,
          totalAcoesValor30d: 14,
          ultimoAcessoEm: "2026-11-27T13:00:00.000Z",
          ultimaRota: "/oportunidades",
        },
        usoPorEmpresa: {
          tnt_1: {
            tenantId: "tnt_1",
            status: "USO_DIARIO",
            rotulo: "Uso diário",
            diasAtivos7d: 5,
            diasAtivos30d: 15,
            totalAcessos30d: 50,
            totalAcoesValor30d: 12,
            ultimoAcessoEm: "2026-11-27T13:00:00.000Z",
            ultimaRota: "/oportunidades",
            serie14Dias: Array.from({ length: 14 }, (_, idx) => ({
              dataBrt: `2026-11-${String(14 + idx).padStart(2, "0")}`,
              acessos: idx % 2 === 0 ? 4 : 0,
              acoesValor: idx % 2 === 0 ? 1 : 0,
            })),
            modulosTop: [
              { modulo: "oportunidades", rotulo: "Oportunidades", acessos: 28 },
              { modulo: "dossie", rotulo: "Dossiê da Licitação", acessos: 14 },
            ],
            acoesTop: [{ acao: "deliberacao", rotulo: "Deliberações (Participar/Recusar)", total: 9 }],
          },
          tnt_2: {
            tenantId: "tnt_2",
            status: "SEM_USO",
            rotulo: "Sem uso",
            diasAtivos7d: 0,
            diasAtivos30d: 0,
            totalAcessos30d: 0,
            totalAcoesValor30d: 0,
            ultimoAcessoEm: null,
            ultimaRota: null,
            serie14Dias: Array.from({ length: 14 }, (_, idx) => ({
              dataBrt: `2026-11-${String(14 + idx).padStart(2, "0")}`,
              acessos: 0,
              acoesValor: 0,
            })),
            modulosTop: [],
            acoesTop: [],
          },
        },
        usoPorUsuario: [
          {
            userId: "usr_1",
            nome: "Vitor",
            email: "vitor@panificadora.com",
            diasAtivos7d: 5,
            diasAtivos30d: 16,
            totalAcessos30d: 60,
            totalAcoesValor30d: 14,
            ultimoAcessoEm: "2026-11-27T13:00:00.000Z",
          },
        ],
        notasInternasAdm: null,
        disputas: [],
      };

      vi.spyOn(global, "fetch").mockResolvedValue(
        new Response(JSON.stringify(dossieMock), { status: 200 }),
      );

      render(<Cliente360Screen tenantId="tnt_1" />);
      await screen.findAllByText(/Panificadora ME/i);

      // Aba 4: mostra APENAS tnt_1 (Panificadora ME), NÃO tnt_2 (DM TECH)
      fireEvent.click(screen.getByRole("tab", { name: /4 · Segmentos & Regiões/i }));
      expect(await screen.findByTestId("tile-segmentos-empresa-tnt_1")).toBeInTheDocument();
      expect(screen.queryByTestId("tile-segmentos-empresa-tnt_2")).not.toBeInTheDocument();

      // Troca para DM TECH no seletor de topo -> Aba 4 agora mostra APENAS tnt_2!
      fireEvent.click(screen.getByTestId("cnpj-card-tnt_2"));
      expect(await screen.findByTestId("tile-segmentos-empresa-tnt_2")).toBeInTheDocument();
      expect(screen.queryByTestId("tile-segmentos-empresa-tnt_1")).not.toBeInTheDocument();

      // Volta para Panificadora ME e abre Aba 7 · Uso & Engajamento
      fireEvent.click(screen.getByTestId("cnpj-card-tnt_1"));
      const tabUso = screen.getByRole("tab", { name: /7 · Uso & Engajamento/i });
      fireEvent.click(tabUso);

      expect(await screen.findByTestId("aba-uso-engajamento")).toBeInTheDocument();
      expect(screen.getByTestId("uso-heatmap-14d")).toBeInTheDocument();
      expect(screen.getByText(/5\/7 dias/i)).toBeInTheDocument();
      expect(screen.getByText(/^Oportunidades$/i)).toBeInTheDocument();
    });
  });
});
