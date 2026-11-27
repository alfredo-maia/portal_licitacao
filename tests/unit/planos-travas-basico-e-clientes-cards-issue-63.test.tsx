import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

const pushMock = vi.fn();
const replaceMock = vi.fn();
let currentPathname = "/dashboard";

vi.mock("next/navigation", () => ({
  usePathname: () => currentPathname,
  useRouter: () => ({
    push: pushMock,
    replace: replaceMock,
    refresh: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next-auth/react", () => ({
  signOut: vi.fn(),
}));

import { PLAN_LIMITS } from "@/server/schemas/tenant.schema";
import { calcularCotaAnaliseIA } from "@/server/schemas/analise-ia.schema";
import {
  isPlanoBasicoRestrito,
  isRouteRestrictedForBasicPlan,
  canUseTimbradoOuLogo,
} from "@/lib/subscription-guard";
import { exigirPlanoMinimoEmApi } from "@/server/services/subscription-status.service";
import { AppShell } from "@/components/shell/app-shell";
import PlanosPage from "@/app/planos/page";
import { ClientesScreen } from "@/components/admin/screens/ClientesScreen";

function mockClientFetch(statusPayload: Record<string, unknown>) {
  global.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/planos/status")) {
      return new Response(JSON.stringify({ ok: true, ...statusPayload }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(
      JSON.stringify({ ok: true, avisos: [], tickets: [], tenants: [], faturas: [] }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }) as unknown as typeof fetch;
}

describe("Issue #63 — Alinhamento de Planos (5/15/50 IA, Enterprise 5 usuários), Travas do Básico e Cards em Clientes 360°", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentPathname = "/dashboard";
    if (typeof window !== "undefined") {
      try {
        window.sessionStorage.clear();
      } catch {}
    }
  });

  describe("1. Limites Unificados (PLAN_LIMITS e Cota de IA)", () => {
    it("define IA 5 / 15 / 50, Enterprise com máximo de 5 usuários e Pro com todos os segmentos macro", () => {
      expect(PLAN_LIMITS.BASICO.aiAnalisesMes).toBe(5);
      expect(PLAN_LIMITS.BASICO.maxUsers).toBe(1);
      expect(PLAN_LIMITS.BASICO.maxCnpjs).toBe(1);
      expect(PLAN_LIMITS.BASICO.maxMacroSegmentos).toBe(1);

      expect(PLAN_LIMITS.PRO.aiAnalisesMes).toBe(15);
      expect(PLAN_LIMITS.PRO.maxUsers).toBe(2);
      expect(PLAN_LIMITS.PRO.maxCnpjs).toBe(2);
      expect(PLAN_LIMITS.PRO.maxMacroSegmentos).toBeGreaterThanOrEqual(7);

      expect(PLAN_LIMITS.ENTERPRISE.aiAnalisesMes).toBe(50);
      expect(PLAN_LIMITS.ENTERPRISE.maxUsers).toBe(5);
      expect(PLAN_LIMITS.ENTERPRISE.maxCnpjs).toBe(5);
      expect(PLAN_LIMITS.ENTERPRISE.maxMacroSegmentos).toBeGreaterThanOrEqual(7);

      const cota30 = calcularCotaAnaliseIA({ plano: "ENTERPRISE", usadas: 30 });
      expect(cota30.limite).toBe(50);
      expect(cota30.restantes).toBe(20);
      expect(cota30.atingiuLimite).toBe(false);

      const cota50 = calcularCotaAnaliseIA({ plano: "ENTERPRISE", usadas: 50 });
      expect(cota50.atingiuLimite).toBe(true);
      expect(cota50.acaoSugerida).toBe("CONTATO_VENDAS");
    });

    it("helpers de plano identificam corretamente restrições do Básico ativo vs Trial/Pro/Enterprise", () => {
      expect(isPlanoBasicoRestrito({ plano: "BASICO", billingStatus: "ATIVO" })).toBe(true);
      expect(isPlanoBasicoRestrito({ plano: "BASICO", billingStatus: "TRIAL" })).toBe(false);
      expect(isPlanoBasicoRestrito({ plano: "PRO", billingStatus: "ATIVO" })).toBe(false);
      expect(isPlanoBasicoRestrito({ plano: "ENTERPRISE", billingStatus: "ATIVO" })).toBe(false);

      expect(canUseTimbradoOuLogo({ plano: "BASICO", billingStatus: "ATIVO" })).toBe(false);
      expect(canUseTimbradoOuLogo({ plano: "BASICO", billingStatus: "TRIAL" })).toBe(true);
      expect(canUseTimbradoOuLogo({ plano: "PRO", billingStatus: "ATIVO" })).toBe(true);
      expect(canUseTimbradoOuLogo({ plano: "ENTERPRISE", billingStatus: "ATIVO" })).toBe(true);

      expect(isRouteRestrictedForBasicPlan("/inteligencia-precos")).toBe(true);
      expect(isRouteRestrictedForBasicPlan("/robo-de-lances")).toBe(true);
      expect(isRouteRestrictedForBasicPlan("/oportunidades")).toBe(false);
      expect(isRouteRestrictedForBasicPlan("/declaracoes")).toBe(false);
      expect(isRouteRestrictedForBasicPlan("/configuracoes")).toBe(false);
    });
  });

  describe("2. AppShell — Bloqueio de Inteligência de Preços e Robô de Lances no Plano Básico", () => {
    it("redireciona cliente BASICO ativo de /inteligencia-precos e /robo-de-lances para /planos?upgrade=1 sem renderizar conteúdo", async () => {
      for (const rota of ["/inteligencia-precos", "/robo-de-lances"]) {
        vi.clearAllMocks();
        currentPathname = rota;
        mockClientFetch({
          plano: "BASICO",
          billingStatus: "ATIVO",
          isReadOnly: false,
          isBlocked: false,
          inGracePeriod: false,
        });

        const { unmount } = render(
          <AppShell>
            <div data-testid="pro-only-content">Conteúdo Exclusivo Pro</div>
          </AppShell>,
        );

        await waitFor(() => {
          expect(replaceMock).toHaveBeenCalledWith(
            expect.stringMatching(/^\/planos\?upgrade=1/),
          );
        });
        expect(screen.queryByTestId("pro-only-content")).not.toBeInTheDocument();
        unmount();
      }
    });

    it("exibe cadeado em Inteligência de Preços e Robô de Lances na Sidebar para BASICO ativo e libera demais módulos", async () => {
      currentPathname = "/dashboard";
      mockClientFetch({
        plano: "BASICO",
        billingStatus: "ATIVO",
        isReadOnly: false,
        isBlocked: false,
        inGracePeriod: false,
      });

      render(
        <AppShell>
          <div data-testid="dash-basico">Dashboard Básico</div>
        </AppShell>,
      );

      await waitFor(() => {
        expect(screen.getByTestId("nav-locked-inteligencia-precos")).toBeInTheDocument();
      });

      expect(screen.getByTestId("nav-locked-robo-de-lances")).toBeInTheDocument();
      expect(screen.queryByTestId("nav-locked-oportunidades")).not.toBeInTheDocument();
      expect(screen.queryByTestId("nav-locked-historico-licitacoes")).not.toBeInTheDocument();
      expect(replaceMock).not.toHaveBeenCalled();
    });
  });

  describe("3. Barreira Backend (HTTP 403 PLANO_INSUFICIENTE) para Recursos Pro/Enterprise", () => {
    it("bloqueia tenant BASICO ativo com HTTP 403 PLANO_INSUFICIENTE e libera PRO/TRIAL", async () => {
      const { inMemoryTenants } = await import("@/server/services/tenant.service");
      const basicoId = "tnt_basico_ativo_issue63";
      const proId = "tnt_pro_ativo_issue63";

      inMemoryTenants.set(basicoId, {
        id: basicoId,
        cnpj: "11222333000144",
        razaoSocial: "Empresa Básico Issue 63",
        plano: "BASICO",
        billingStatus: "ATIVO",
        maxCnpjs: 1,
        maxUsers: 1,
      });
      inMemoryTenants.set(proId, {
        id: proId,
        cnpj: "11222333000155",
        razaoSocial: "Empresa Pro Issue 63",
        plano: "PRO",
        billingStatus: "ATIVO",
        maxCnpjs: 2,
        maxUsers: 2,
      });

      try {
        const resBasico = await exigirPlanoMinimoEmApi({
          user: { id: "usr_b63", email: "basico63@emp.com", role: "DIRETORIA", activeTenantId: basicoId },
          cookieTenant: basicoId,
          planoMinimo: "PRO",
          recursoLabel: "emissão de PDF timbrado",
        });
        expect(resBasico.ok).toBe(false);
        if (!resBasico.ok) {
          expect(resBasico.response.status).toBe(403);
          const body = await resBasico.response.json();
          expect(body.error).toBe("PLANO_INSUFICIENTE");
        }

        const resPro = await exigirPlanoMinimoEmApi({
          user: { id: "usr_p63", email: "pro63@emp.com", role: "DIRETORIA", activeTenantId: proId },
          cookieTenant: proId,
          planoMinimo: "PRO",
          recursoLabel: "emissão de PDF timbrado",
        });
        expect(resPro.ok).toBe(true);
      } finally {
        inMemoryTenants.delete(basicoId);
        inMemoryTenants.delete(proId);
      }
    });

    it("todas as 8 rotas de Inteligência de Preços, Robô de Lances e PDF Timbrado aplicam verificarPlanoMinimoNaRota", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const routes = [
        "src/app/api/inteligencia-precos/busca/route.ts",
        "src/app/api/inteligencia-precos/salvos/route.ts",
        "src/app/api/inteligencia-precos/salvos/[id]/route.ts",
        "src/app/api/robo-de-lances/salas/route.ts",
        "src/app/api/declaracoes/pdf/route.ts",
        "src/app/api/impugnacoes/[id]/pdf/route.ts",
        "src/app/api/propostas/pdf/route.ts",
        "src/app/api/cotacoes/pdf/route.ts",
      ];
      for (const rel of routes) {
        const content = fs.readFileSync(path.join(process.cwd(), rel), "utf8");
        expect(content.includes("verificarPlanoMinimoNaRota"), `Faltando guard de plano em ${rel}`).toBe(true);
      }
    });
  });

  describe("4. Novos Cards da Tela /planos (5/15/50 IA, Enterprise 5 usuários, sem Cofre/R2/PNCP/RBAC)", () => {
    it("exibe 5 / 15 / 50 análises IA, até 5 usuários no Enterprise e omite Cofre/R2/PNCP/RBAC dos cards", async () => {
      mockClientFetch({
        plano: "PRO",
        billingStatus: "TRIAL",
        diasRestantesTrial: 10,
        isReadOnly: false,
        isBlocked: false,
        inGracePeriod: false,
        maxCnpjs: 2,
        maxUsers: 2,
      });

      const { container } = render(<PlanosPage />);
      expect(await screen.findByText(/^5 Análises de Viabilidade com IA/i)).toBeInTheDocument();
      expect(screen.getByText(/^15 Análises de Viabilidade com IA/i)).toBeInTheDocument();
      expect(screen.getByText(/^50 Análises de Viabilidade com IA/i)).toBeInTheDocument();
      expect(screen.getByText(/Até 5 Usuários/i)).toBeInTheDocument();

      const cardsSection = container.querySelector('[data-testid="planos-cards-grid"]');
      expect(cardsSection).toBeTruthy();
      const cardsText = cardsSection?.textContent || "";
      expect(cardsText).not.toMatch(/Cofre/i);
      expect(cardsText).not.toMatch(/\bR2\b/i);
      expect(cardsText).not.toMatch(/certidões/i);
      expect(cardsText).not.toMatch(/\bPNCP\b/i);
      expect(cardsText).not.toMatch(/\bRBAC\b/i);
      expect(cardsText).not.toMatch(/10 Colaboradores|10 Usuários/i);
    });
  });

  describe("5. ADM Clientes 360° (/admin/clientes) — Cards Clicáveis com Paginação de 20+", () => {
    it("renderiza 20 cards clicáveis na página 1 e pagina os 5 restantes para a página 2 (sem tabela)", async () => {
      const mockClients = Array.from({ length: 25 }, (_, i) => ({
        id: `tnt_cli_${i + 1}`,
        cnpj: `10.000.000/0001-${String(10 + i).padStart(2, "0")}`,
        razaoSocial: `Empresa Cliente ${i + 1} Ltda`,
        nomeFantasia: `Cliente Card ${i + 1}`,
        plano: i % 3 === 0 ? "ENTERPRISE" : i % 2 === 0 ? "PRO" : "BASICO",
        billingStatus: i % 2 === 0 ? "ATIVO" : "TRIAL",
        ativo: true,
        titularNome: `Titular ${i + 1}`,
        titularEmail: `cliente${i + 1}@empresa.com`,
        totalLicitacoesKanban: i,
        totalDocumentosCofre: i + 1,
        totalUsuarios: 1,
        aiUsadasMes: i,
        qtdCnpjs: i === 0 ? 3 : 1,
        cnpjsAdicionaisCount: i === 0 ? 2 : 0,
        criadoEm: "2026-11-01T12:00:00.000Z",
        onboarding: { score: 6, statusEngajamento: "ENGAJADO" },
      }));

      global.fetch = vi.fn(async () =>
        new Response(JSON.stringify(mockClients), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ) as unknown as typeof fetch;

      const { container } = render(<ClientesScreen />);

      await waitFor(() => {
        expect(screen.getAllByTestId(/^cliente-card-/).length).toBe(20);
      });

      // Sem tabela de dados
      expect(container.querySelector("table")).toBeNull();
      // Cards são links clicáveis apontando para /admin/clientes/[id]
      const firstCard = screen.getByTestId("cliente-card-tnt_cli_1");
      expect(firstCard.getAttribute("href")).toBe("/admin/clientes/tnt_cli_1");
      expect(screen.getByText("+2 CNPJ(s)")).toBeInTheDocument();

      // Navega para página 2 -> exibe os 5 cards restantes
      const nextPageBtn = screen.getByRole("button", { name: /Próxima página|Next page/i });
      fireEvent.click(nextPageBtn);

      await waitFor(() => {
        expect(screen.getAllByTestId(/^cliente-card-/).length).toBe(5);
      });
      expect(screen.getByTestId("cliente-card-tnt_cli_25")).toBeInTheDocument();
    });
  });
});
