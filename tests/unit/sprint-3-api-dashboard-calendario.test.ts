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

beforeEach(() => {
  resetInMemoryLicitacoes();
  mockedGetServerSession.mockReset();
  mockedGetServerSession.mockResolvedValue(sessionDe(DIRETORIA_USER));
});

describe("Sprint 3 [TDD RED] — APIs de Dashboard e Calendário", () => {
  describe("1. GET /api/dashboard", () => {
    it("deve responder com status 200 e payload aderente ao dashboardResponseSchema", async () => {
      // Dynamic import do handler que será criado pelo Backend
      const { GET: dashboardGET } = await import("@/app/api/dashboard/route");

      const req = jsonRequest("http://localhost:3010/api/dashboard?mes=10&ano=2026");
      const resp = await dashboardGET(req);

      expect(resp.status).toBe(200);
      const data = await resp.json();
      expect(data.ok).toBe(true);
      expect(data.periodo).toBeDefined();
      expect(data.periodo.mes).toBe(10);
      expect(data.periodo.ano).toBe(2026);
      expect(data.cards).toBeDefined();
      expect(data.cards.recebidas).toBeDefined();
      expect(data.cards.aguardandoDecisao).toBeDefined();
      expect(data.cards.emPrecificacao).toBeDefined();
      expect(data.cards.recusadas).toBeDefined();
      expect(data.resultados).toBeDefined();
      expect(data.indicadores).toBeDefined();
      expect(data.topTipos).toBeDefined();
    });

    it("deve exigir autenticação ativa (retornar 401 se sem sessão)", async () => {
      mockedGetServerSession.mockResolvedValue(null);
      const { GET: dashboardGET } = await import("@/app/api/dashboard/route");

      const req = jsonRequest("http://localhost:3010/api/dashboard");
      const resp = await dashboardGET(req);
      expect(resp.status).toBe(401);
    });

    it("deve calcular backlog total vs recebidas no mês para aguardandoDecisao", async () => {
      const { GET: dashboardGET } = await import("@/app/api/dashboard/route");

      const req = jsonRequest("http://localhost:3010/api/dashboard?mes=10&ano=2026");
      const resp = await dashboardGET(req);
      const data = await resp.json();

      expect(typeof data.cards.aguardandoDecisao.total).toBe("number");
      expect(typeof data.cards.aguardandoDecisao.recebidasNoMes).toBe("number");
      expect(data.cards.aguardandoDecisao.total).toBeGreaterThanOrEqual(
        data.cards.aguardandoDecisao.recebidasNoMes,
      );
    });

    it("deve retornar lista de oportunidades críticas com contagem regressiva em segundos", async () => {
      const { GET: dashboardGET } = await import("@/app/api/dashboard/route");

      const req = jsonRequest("http://localhost:3010/api/dashboard");
      const resp = await dashboardGET(req);
      const data = await resp.json();

      expect(Array.isArray(data.indicadores.criticas72h)).toBe(true);
      for (const item of data.indicadores.criticas72h) {
        expect(item.id).toBeDefined();
        expect(item.numeroEdital).toBeDefined();
        expect(item.segundosRestantes).toBeGreaterThanOrEqual(0);
        expect(item.segundosRestantes).toBeLessThanOrEqual(72 * 3600);
      }
    });

    it("deve limitar o ranking de Top Tipos a no máximo 4 itens ordenados", async () => {
      const { GET: dashboardGET } = await import("@/app/api/dashboard/route");

      const req = jsonRequest("http://localhost:3010/api/dashboard");
      const resp = await dashboardGET(req);
      const data = await resp.json();

      expect(data.topTipos.length).toBeLessThanOrEqual(4);
      if (data.topTipos.length > 1) {
        for (let i = 0; i < data.topTipos.length - 1; i++) {
          expect(data.topTipos[i].total).toBeGreaterThanOrEqual(
            data.topTipos[i + 1].total,
          );
        }
      }
    });
  });

  describe("2. GET /api/calendario", () => {
    it("deve responder com status 200 e payload aderente ao calendarioResponseSchema", async () => {
      const { GET: calendarioGET } = await import("@/app/api/calendario/route");

      const req = jsonRequest("http://localhost:3010/api/calendario?mes=10&ano=2026");
      const resp = await calendarioGET(req);

      expect(resp.status).toBe(200);
      const data = await resp.json();
      expect(data.ok).toBe(true);
      expect(data.mes).toBe(10);
      expect(data.ano).toBe(2026);
      expect(Array.isArray(data.chips)).toBe(true);
      expect(Array.isArray(data.alertasDocumentais)).toBe(true);
    });

    it("deve marcar opaco=true para certames de perda e opaco=false para certames ativos", async () => {
      const { GET: calendarioGET } = await import("@/app/api/calendario/route");

      const req = jsonRequest("http://localhost:3010/api/calendario?mes=10&ano=2026");
      const resp = await calendarioGET(req);
      const data = await resp.json();

      for (const chip of data.chips) {
        if (
          [
            "NAO_CONTEMPLADA_PRECO",
            "NAO_CONTEMPLADA_DOCUMENTACAO",
            "NAO_CONTEMPLADA_DESISTENCIA",
            "REVOGADA_ANULADA",
          ].includes(chip.status)
        ) {
          expect(chip.opaco).toBe(true);
        } else {
          expect(chip.opaco).toBe(false);
        }
        // Jamais deve conter PENDENTE ou RECUSADA
        expect(chip.status).not.toBe("PENDENTE");
        expect(chip.status).not.toBe("RECUSADA");
      }
    });

    it("deve retornar alertasDocumentais como array vazio nesta sprint", async () => {
      const { GET: calendarioGET } = await import("@/app/api/calendario/route");

      const req = jsonRequest("http://localhost:3010/api/calendario?mes=10&ano=2026");
      const resp = await calendarioGET(req);
      const data = await resp.json();

      expect(data.alertasDocumentais).toEqual([]);
    });
  });
});
