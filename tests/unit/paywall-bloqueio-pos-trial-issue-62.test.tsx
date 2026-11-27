import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const pushMock = vi.fn();
const replaceMock = vi.fn();
const refreshMock = vi.fn();
let currentPathname = "/oportunidades";

vi.mock("next/navigation", () => ({
  usePathname: () => currentPathname,
  useRouter: () => ({
    push: pushMock,
    replace: replaceMock,
    refresh: refreshMock,
  }),
}));

vi.mock("next-auth/react", () => ({
  signOut: vi.fn(),
}));

import {
  evaluateTenantAccess,
  isSubscriptionLocked,
  isRouteAllowedWhenSubscriptionBlocked,
  isApiRouteAllowedWhenSubscriptionBlocked,
} from "@/lib/subscription-guard";
import { AppShell } from "@/components/shell/app-shell";
import { exigirAssinaturaAtivaEmApi } from "@/server/services/subscription-status.service";

function mockStatusFetch(statusPayload: Record<string, unknown>) {
  global.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/api/planos/status")) {
      return new Response(JSON.stringify({ ok: true, ...statusPayload }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(
      JSON.stringify({ ok: true, avisos: [], tickets: [], tenants: [] }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }) as unknown as typeof fetch;
}

describe("Issue #62 — Paywall pós-trial/carência: Whitelist, Redirecionamento no AppShell e Barreira nas APIs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentPathname = "/oportunidades";
    if (typeof window !== "undefined") {
      try {
        window.sessionStorage.clear();
      } catch {}
    }
  });

  describe("1. Regras de Carência (3 dias), Bloqueio no 4º dia e Whitelist de Rotas", () => {
    it("mantém acesso durante os 3 dias de carência e bloqueia a partir do 4º dia pós-trial", () => {
      const trialFim = new Date("2026-11-20T12:00:00Z");

      // Dia 2 de carência -> liberado com inGracePeriod
      const emCarencia = evaluateTenantAccess(
        { plano: "PRO", billingStatus: "TRIAL", trialFim },
        new Date("2026-11-22T12:00:00Z"),
      );
      expect(emCarencia.inGracePeriod).toBe(true);
      expect(isSubscriptionLocked(emCarencia)).toBe(false);

      // Dia 4 pós-trial -> bloqueado
      const aposCarencia = evaluateTenantAccess(
        { plano: "PRO", billingStatus: "TRIAL", trialFim },
        new Date("2026-11-24T12:00:01Z"),
      );
      expect(aposCarencia.inGracePeriod).toBe(false);
      expect(aposCarencia.isBlocked).toBe(true);
      expect(isSubscriptionLocked(aposCarencia)).toBe(true);
    });

    it("libera exclusivamente /dashboard, /planos, /configuracoes, /notificacoes e rotas de auth/admin quando bloqueado", () => {
      const liberadas = [
        "/",
        "/dashboard",
        "/planos",
        "/planos?bloqueado=1",
        "/configuracoes",
        "/configuracoes/equipe",
        "/notificacoes",
        "/login",
        "/cadastro",
        "/esqueci-senha",
        "/recuperar-senha",
        "/admin",
      ];
      for (const rota of liberadas) {
        expect(isRouteAllowedWhenSubscriptionBlocked(rota), `Deveria liberar ${rota}`).toBe(true);
      }

      const bloqueadas = [
        "/oportunidades",
        "/oportunidades/abc-123",
        "/minhas-licitacoes",
        "/historico-licitacoes",
        "/calendario",
        "/portais",
        "/documentacao",
        "/declaracoes",
        "/impugnacoes",
        "/inteligencia-precos",
        "/robo-de-lances",
      ];
      for (const rota of bloqueadas) {
        expect(isRouteAllowedWhenSubscriptionBlocked(rota), `Deveria bloquear ${rota}`).toBe(false);
      }
    });

    it("libera APIs da whitelist e bloqueia APIs operacionais quando assinatura estiver expirada", () => {
      const apisLiberadas = [
        "/api/auth/session",
        "/api/planos/status",
        "/api/planos/checkout",
        "/api/faturamento/faturas",
        "/api/suporte/tickets",
        "/api/dashboard",
        "/api/configuracoes/empresa",
        "/api/configuracoes/tenants",
        "/api/notificacoes",
        "/api/notificacoes/resumo",
        "/api/tenants",
        "/api/tenant/preferencias",
        "/api/avisos/ativos",
        "/api/cep/01001000",
        "/api/cnae",
        "/api/usuarios",
        "/api/audit",
        "/api/webhooks/asaas",
        "/api/cron/ingest-pncp",
        "/api/admin/metricas",
      ];
      for (const api of apisLiberadas) {
        expect(isApiRouteAllowedWhenSubscriptionBlocked(api), `API liberada: ${api}`).toBe(true);
      }

      const apisBloqueadas = [
        "/api/oportunidades",
        "/api/oportunidades/123",
        "/api/oportunidades/123/decisao",
        "/api/historico-licitacoes",
        "/api/licitacoes/busca",
        "/api/calendario",
        "/api/portais",
        "/api/documentos",
        "/api/declaracoes/gerar",
        "/api/impugnacoes",
        "/api/inteligencia-precos/busca",
        "/api/propostas/pdf",
        "/api/cotacoes/pdf",
        "/api/arsenal",
        "/api/robo-de-lances/salas",
      ];
      for (const api of apisBloqueadas) {
        expect(isApiRouteAllowedWhenSubscriptionBlocked(api), `API bloqueada: ${api}`).toBe(false);
      }
    });
  });

  describe("2. AppShell — Redirecionamento, Ocultação de Conteúdo Protegido e Cadeados na Sidebar", () => {
    it("redireciona de /oportunidades para /planos?bloqueado=1 e NÃO renderiza conteúdo protegido quando bloqueado", async () => {
      currentPathname = "/oportunidades";
      mockStatusFetch({
        billingStatus: "TRIAL",
        plano: "PRO",
        isReadOnly: true,
        isBlocked: true,
        inGracePeriod: false,
        diasRestantesTrial: 0,
        mensagemStatus:
          "Seu período de teste expirou. Escolha um plano para reativar.",
      });

      render(
        <AppShell>
          <div data-testid="protected-oportunidades-content">Tabela Sigilosa de Oportunidades</div>
        </AppShell>,
      );

      await waitFor(() => {
        expect(replaceMock).toHaveBeenCalledWith("/planos?bloqueado=1");
      });

      expect(screen.queryByTestId("protected-oportunidades-content")).not.toBeInTheDocument();
      expect(screen.getByTestId("paywall-redirect-guard")).toBeInTheDocument();
      expect(screen.getByTestId("support-fab-btn")).toBeInTheDocument();
    });

    it("mantém /dashboard, /configuracoes, /notificacoes e /planos liberados com Suporte acessível e exibe cadeado nos módulos bloqueados", async () => {
      for (const allowedPath of ["/dashboard", "/configuracoes", "/notificacoes", "/planos"]) {
        vi.clearAllMocks();
        currentPathname = allowedPath;
        mockStatusFetch({
          billingStatus: "BLOQUEADO",
          plano: "PRO",
          isReadOnly: true,
          isBlocked: true,
          inGracePeriod: false,
          diasRestantesTrial: 0,
          mensagemStatus: "Assinatura suspensa ou bloqueada.",
        });

        const { unmount } = render(
          <AppShell>
            <div data-testid={`allowed-content-${allowedPath}`}>Conteúdo liberado</div>
          </AppShell>,
        );

        await waitFor(() => {
          expect(screen.getByTestId("nav-locked-oportunidades")).toBeInTheDocument();
        });

        expect(replaceMock).not.toHaveBeenCalled();
        expect(screen.getByTestId(`allowed-content-${allowedPath}`)).toBeInTheDocument();
        expect(screen.getByTestId("support-fab-btn")).toBeInTheDocument();

        // Itens bloqueados exibem cadeado e apontam para /planos?bloqueado=1
        expect(screen.getByTestId("nav-locked-minhas-licitacoes")).toBeInTheDocument();
        expect(screen.getByTestId("nav-locked-historico-licitacoes")).toBeInTheDocument();
        expect(screen.getByTestId("nav-locked-calendario")).toBeInTheDocument();
        expect(screen.getByTestId("nav-locked-documentacao")).toBeInTheDocument();

        // Itens liberados NÃO exibem cadeado
        expect(screen.queryByTestId("nav-locked-dashboard")).not.toBeInTheDocument();
        expect(screen.queryByTestId("nav-locked-notificacoes")).not.toBeInTheDocument();
        expect(screen.queryByTestId("nav-locked-planos")).not.toBeInTheDocument();
        expect(screen.queryByTestId("nav-locked-configuracoes")).not.toBeInTheDocument();

        unmount();
      }
    });

    it("NÃO bloqueia /oportunidades durante o período de carência (3 dias pós-trial)", async () => {
      currentPathname = "/oportunidades";
      mockStatusFetch({
        billingStatus: "TRIAL",
        plano: "PRO",
        isReadOnly: false,
        isBlocked: false,
        inGracePeriod: true,
        diasRestantesTrial: 0,
        diasRestantesCarencia: 2,
        mensagemStatus: "Você tem 2 dia(s) de carência.",
      });

      render(
        <AppShell>
          <div data-testid="grace-oportunidades-content">Oportunidades Liberadas na Carência</div>
        </AppShell>,
      );

      await waitFor(() => {
        expect(screen.getByTestId("banner-carencia-planos")).toBeInTheDocument();
      });

      expect(replaceMock).not.toHaveBeenCalled();
      expect(screen.getByTestId("grace-oportunidades-content")).toBeInTheDocument();
      expect(screen.queryByTestId("nav-locked-oportunidades")).not.toBeInTheDocument();
    });
  });

  describe("3. Barreira de Backend — exigirAssinaturaAtivaEmApi retorna HTTP 402", () => {
    it("retorna HTTP 402 SUBSCRIPTION_REQUIRED quando tenant está após a carência ou BLOQUEADO", async () => {
      const { inMemoryTenants } = await import("@/server/services/tenant.service");
      const expiredTenantId = "tnt_expired_issue62_test";
      inMemoryTenants.set(expiredTenantId, {
        id: expiredTenantId,
        cnpj: "99888777000166",
        razaoSocial: "Empresa Expirada Issue 62",
        plano: "PRO",
        billingStatus: "TRIAL",
        trialFim: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 dias após fim do trial
        maxCnpjs: 2,
        maxUsers: 2,
      });

      try {
        const res = await exigirAssinaturaAtivaEmApi({
          user: {
            id: "usr_expired_issue62",
            email: "expirado62@cliente.com",
            role: "DIRETORIA",
            activeTenantId: expiredTenantId,
          },
          cookieTenant: expiredTenantId,
          pathname: "/api/oportunidades",
        });

        expect(res.ok).toBe(false);
        if (!res.ok) {
          expect(res.response.status).toBe(402);
          const body = await res.response.json();
          expect(body.ok).toBe(false);
          expect(body.error).toBe("SUBSCRIPTION_REQUIRED");
          expect(body.redirectTo).toBe("/planos");
        }

        // Mesma conta expirada em API da whitelist (/api/dashboard, /api/suporte/tickets) -> liberada
        const allowedDash = await exigirAssinaturaAtivaEmApi({
          user: {
            id: "usr_expired_issue62",
            email: "expirado62@cliente.com",
            role: "DIRETORIA",
            activeTenantId: expiredTenantId,
          },
          cookieTenant: expiredTenantId,
          pathname: "/api/dashboard",
        });
        expect(allowedDash.ok).toBe(true);
      } finally {
        inMemoryTenants.delete(expiredTenantId);
      }
    });

    it("libera API operacional durante os 3 dias de carência pós-trial", async () => {
      const { inMemoryTenants } = await import("@/server/services/tenant.service");
      const graceTenantId = "tnt_grace_issue62_test";
      inMemoryTenants.set(graceTenantId, {
        id: graceTenantId,
        cnpj: "99888777000177",
        razaoSocial: "Empresa Carência Issue 62",
        plano: "PRO",
        billingStatus: "TRIAL",
        trialFim: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // 1 dia após fim -> em carência (3 dias)
        maxCnpjs: 2,
        maxUsers: 2,
      });

      try {
        const res = await exigirAssinaturaAtivaEmApi({
          user: {
            id: "usr_grace_issue62",
            email: "carencia62@cliente.com",
            role: "DIRETORIA",
            activeTenantId: graceTenantId,
          },
          cookieTenant: graceTenantId,
          pathname: "/api/oportunidades",
        });

        expect(res.ok).toBe(true);
      } finally {
        inMemoryTenants.delete(graceTenantId);
      }
    });

    it("todos os 41 arquivos de rotas operacionais estão protegidos por verificarBloqueioAssinaturaNaRota", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const operationalRoutes = [
        "src/app/api/oportunidades/route.ts",
        "src/app/api/oportunidades/[id]/route.ts",
        "src/app/api/oportunidades/[id]/decisao/route.ts",
        "src/app/api/historico-licitacoes/route.ts",
        "src/app/api/calendario/route.ts",
        "src/app/api/portais/route.ts",
        "src/app/api/documentos/route.ts",
        "src/app/api/declaracoes/gerar/route.ts",
        "src/app/api/impugnacoes/route.ts",
        "src/app/api/inteligencia-precos/busca/route.ts",
        "src/app/api/propostas/pdf/route.ts",
        "src/app/api/cotacoes/pdf/route.ts",
        "src/app/api/arsenal/route.ts",
        "src/app/api/robo-de-lances/salas/route.ts",
      ];

      for (const rel of operationalRoutes) {
        const content = fs.readFileSync(path.join(process.cwd(), rel), "utf8");
        expect(
          content.includes("verificarBloqueioAssinaturaNaRota"),
          `Rota operacional sem guard: ${rel}`,
        ).toBe(true);
      }
    });
  });
});
