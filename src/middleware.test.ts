import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import * as nextAuthJwt from "next-auth/jwt";
import { middleware } from "./middleware";

describe("Task 1 - Middleware de Autenticação Estrita e Proteção Pós-Logout", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("Bloqueio de rotas protegidas sem sessão", () => {
    it.each([
      "/dashboard",
      "/oportunidades",
      "/configuracoes",
      "/documentacao",
      "/portais",
      "/declaracoes",
      "/impugnacoes",
      "/calendario",
      "/planos",
    ])("deve redirecionar (307) para /login ao acessar %s sem cookies de sessão", async (path) => {
      const req = new NextRequest(`http://localhost:3000${path}`);
      const res = await middleware(req);

      expect(res.status).toBe(307);
      const location = res.headers.get("location");
      expect(location).toBe("http://localhost:3000/login");
    });
  });

  describe("Liberação de rotas públicas sem sessão", () => {
    it.each([
      "/login",
      "/cadastro",
      "/esqueci-senha",
      "/recuperar-senha",
    ])("deve permitir acesso à rota pública %s sem redirecionar", async (path) => {
      const req = new NextRequest(`http://localhost:3000${path}`);
      const res = await middleware(req);

      // Não deve redirecionar (status != 307 e location null)
      expect(res.status).not.toBe(307);
      expect(res.headers.get("location")).toBeNull();
    });
  });

  describe("Acesso com sessão válida", () => {
    it("deve permitir navegação para /dashboard com cookie next-auth.session-token", async () => {
      const req = new NextRequest("http://localhost:3000/dashboard", {
        headers: {
          cookie: "next-auth.session-token=mock-token",
        },
      });
      const res = await middleware(req);
      expect(res.status).not.toBe(307);
      expect(res.headers.get("location")).toBeNull();
    });

    it("deve permitir navegação com cookie __Secure-next-auth.session-token", async () => {
      const req = new NextRequest("http://localhost:3000/dashboard", {
        headers: {
          cookie: "__Secure-next-auth.session-token=mock-secure-token",
        },
      });
      const res = await middleware(req);
      expect(res.status).not.toBe(307);
      expect(res.headers.get("location")).toBeNull();
    });

    it("deve permitir navegação com cookie portal_licitacao_token", async () => {
      const req = new NextRequest("http://localhost:3000/dashboard", {
        headers: {
          cookie: "portal_licitacao_token=mock-jwt-token",
        },
      });
      const res = await middleware(req);
      expect(res.status).not.toBe(307);
      expect(res.headers.get("location")).toBeNull();
    });
  });

  describe("Barreira Invisível para o Portal SuperAdmin (/admin)", () => {
    it("deve reescrever para /404 quando o usuário não for SUPERADMIN", async () => {
      vi.spyOn(nextAuthJwt, "getToken").mockResolvedValue({
        email: "usuario@comum.com.br",
        role: "DIRETORIA",
      } as any);

      const req = new NextRequest("http://localhost:3000/admin", {
        headers: {
          cookie: "next-auth.session-token=token-cliente",
        },
      });

      const res = await middleware(req);
      const rewriteHeader = res.headers.get("x-middleware-rewrite");
      expect(rewriteHeader).toContain("/404");
    });

    it("deve liberar /admin para SUPERADMIN", async () => {
      vi.spyOn(nextAuthJwt, "getToken").mockResolvedValue({
        email: "vitorhenrique018@gmail.com",
        role: "SUPERADMIN",
      } as any);

      const req = new NextRequest("http://localhost:3000/admin", {
        headers: {
          cookie: "__Secure-next-auth.session-token=token-super",
        },
      });

      const res = await middleware(req);
      const rewriteHeader = res.headers.get("x-middleware-rewrite");
      expect(rewriteHeader).toBeNull();
      expect(res.status).not.toBe(307);
    });
  });
});
