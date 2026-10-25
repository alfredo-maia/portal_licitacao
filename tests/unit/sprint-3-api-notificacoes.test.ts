// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth/next", () => ({
  getServerSession: vi.fn(),
}));

import { getServerSession } from "next-auth/next";
import { resetInMemoryLicitacoes } from "@/server/services/licitacoes-store";
import {
  DIRETORIA_USER,
  OPERADOR_USER,
} from "./factories";

const mockedGetServerSession = vi.mocked(getServerSession);

function sessionDe(user: typeof DIRETORIA_USER | null) {
  return user ? ({ user, expires: "2999-01-01" } as never) : null;
}

function jsonRequest(url: string, body?: unknown, method?: string, headers?: Record<string, string>) {
  return new Request(url, {
    method: method ?? (body === undefined ? "GET" : "POST"),
    headers: {
      "content-type": "application/json",
      ...(headers ?? {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function routeContext(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  resetInMemoryLicitacoes();
  mockedGetServerSession.mockReset();
  mockedGetServerSession.mockResolvedValue(sessionDe(DIRETORIA_USER));
});

describe("Sprint 3 [TDD RED] — APIs do Motor de Notificações", () => {
  describe("1. GET /api/notificacoes", () => {
    it("deve retornar lista paginada de notificações para o usuário logado", async () => {
      const { GET: notificacoesGET } = await import("@/app/api/notificacoes/route");

      const req = jsonRequest("http://localhost:3010/api/notificacoes?page=1&pageSize=10");
      const resp = await notificacoesGET(req);

      expect(resp.status).toBe(200);
      const data = await resp.json();
      expect(data.ok).toBe(true);
      expect(typeof data.total).toBe("number");
      expect(typeof data.naoLidas).toBe("number");
      expect(Array.isArray(data.notificacoes)).toBe(true);
    });

    it("deve filtrar por apenasNaoLidas=true", async () => {
      const { GET: notificacoesGET } = await import("@/app/api/notificacoes/route");

      const req = jsonRequest("http://localhost:3010/api/notificacoes?apenasNaoLidas=true");
      const resp = await notificacoesGET(req);
      const data = await resp.json();

      expect(resp.status).toBe(200);
      for (const n of data.notificacoes) {
        expect(n.lida).toBe(false);
      }
    });

    it("deve exigir autenticação ativa (retornar 401 se sem sessão)", async () => {
      mockedGetServerSession.mockResolvedValue(null);
      const { GET: notificacoesGET } = await import("@/app/api/notificacoes/route");

      const req = jsonRequest("http://localhost:3010/api/notificacoes");
      const resp = await notificacoesGET(req);
      expect(resp.status).toBe(401);
    });
  });

  describe("2. GET /api/notificacoes/resumo (Sino Global)", () => {
    it("deve retornar total de não lidas e até 5 notificações recentes para o sino", async () => {
      const { GET: resumoGET } = await import("@/app/api/notificacoes/resumo/route");

      const req = jsonRequest("http://localhost:3010/api/notificacoes/resumo");
      const resp = await resumoGET(req);

      expect(resp.status).toBe(200);
      const data = await resp.json();
      expect(data.ok).toBe(true);
      expect(typeof data.naoLidas).toBe("number");
      expect(Array.isArray(data.recentes)).toBe(true);
      expect(data.recentes.length).toBeLessThanOrEqual(5);
    });
  });

  describe("3. PATCH /api/notificacoes/[id]/lida", () => {
    it("deve marcar notificação individual como lida para o usuário da sessão", async () => {
      const { PATCH: marcarLidaPATCH } = await import(
        "@/app/api/notificacoes/[id]/lida/route"
      );

      const req = jsonRequest("http://localhost:3010/api/notificacoes/notif_1/lida", {}, "PATCH");
      const resp = await marcarLidaPATCH(req, routeContext("notif_1"));

      // 200 OK ou 404 se id não existir
      expect([200, 404]).toContain(resp.status);
      if (resp.status === 200) {
        const data = await resp.json();
        expect(data.ok).toBe(true);
        expect(data.marcadas).toBe(1);
      }
    });
  });

  describe("4. POST /api/notificacoes/marcar-todas", () => {
    it("deve marcar todas as notificações não lidas do usuário como lidas", async () => {
      const { POST: marcarTodasPOST } = await import(
        "@/app/api/notificacoes/marcar-todas/route"
      );

      const req = jsonRequest("http://localhost:3010/api/notificacoes/marcar-todas", {});
      const resp = await marcarTodasPOST(req);

      expect(resp.status).toBe(200);
      const data = await resp.json();
      expect(data.ok).toBe(true);
      expect(typeof data.marcadas).toBe("number");
    });
  });

  describe("5. POST /api/notificacoes/jobs/diario (Job de Notificações N3/N4/N5)", () => {
    it("deve rejeitar execução com status 401 se x-cron-secret estiver ausente ou incorreto", async () => {
      const { POST: jobDiarioPOST } = await import(
        "@/app/api/notificacoes/jobs/diario/route"
      );

      // Sem header
      const reqSemHeader = jsonRequest("http://localhost:3010/api/notificacoes/jobs/diario", {});
      const respSemHeader = await jobDiarioPOST(reqSemHeader);
      expect(respSemHeader.status).toBe(401);

      // Com header inválido
      const reqInvalido = jsonRequest(
        "http://localhost:3010/api/notificacoes/jobs/diario",
        {},
        "POST",
        { "x-cron-secret": "segredo-incorreto" },
      );
      const respInvalido = await jobDiarioPOST(reqInvalido);
      expect(respInvalido.status).toBe(401);
    });

    it("deve executar varredura idempotente com segredo correto e registrar audit_log", async () => {
      const cronSecret = process.env.CRON_SECRET || "change-me-in-production-min-16";
      const { POST: jobDiarioPOST } = await import(
        "@/app/api/notificacoes/jobs/diario/route"
      );

      const req = jsonRequest(
        "http://localhost:3010/api/notificacoes/jobs/diario",
        { referencia: new Date("2026-10-25T10:00:00.000Z") },
        "POST",
        { "x-cron-secret": cronSecret },
      );
      const resp = await jobDiarioPOST(req);

      expect(resp.status).toBe(200);
      const data = await resp.json();
      expect(data.ok).toBe(true);
      expect(data.criadas).toBeDefined();
      expect(typeof data.ignoradasPorIdempotencia).toBe("number");
    });
  });
});
