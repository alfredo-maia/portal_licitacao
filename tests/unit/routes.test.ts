import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  APP_ROUTES,
  OFFICIAL_ROUTES,
  ROUTES,
  getRouteByPath,
} from "@/config/routes";
import { routesListSchema } from "@/server/schemas/routes.schema";

const EXPECTED_ROUTES = [
  { order: 1, path: "/dashboard", label: "Dashboard" },
  { order: 2, path: "/oportunidades", label: "Oportunidades" },
  { order: 3, path: "/minhas-licitacoes", label: "Minhas Licitações" },
  { order: 4, path: "/historico-licitacoes", label: "Histórico de Licitações" },
  { order: 5, path: "/calendario", label: "Calendário" },
  { order: 6, path: "/portais", label: "Portais de Licitações" },
  { order: 7, path: "/documentacao", label: "Documentação" },
  { order: 8, path: "/declaracoes", label: "Declarações" },
  { order: 9, path: "/impugnacoes", label: "Impugnações" },
  {
    order: 10,
    path: "/robo-de-lances",
    label: "Robô de Lances",
    badge: "Em breve",
    isPlaceholder: true,
  },
  { order: 11, path: "/notificacoes", label: "Notificações" },
  { order: 12, path: "/planos", label: "Planos" },
  { order: 13, path: "/configuracoes", label: "Configurações" },
] as const;

function hasAppRouterPageForRoute(routePath: string): boolean {
  const cleanSegment = routePath.replace(/^\//, "");
  const appDir = path.resolve(process.cwd(), "src/app");
  if (!fs.existsSync(appDir)) {
    return false;
  }

  const directCandidate = path.join(appDir, cleanSegment, "page.tsx");
  if (fs.existsSync(directCandidate)) {
    return true;
  }

  const entries = fs.readdirSync(appDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name.startsWith("(") && entry.name.endsWith(")")) {
      const groupedCandidate = path.join(
        appDir,
        entry.name,
        cleanSegment,
        "page.tsx",
      );
      if (fs.existsSync(groupedCandidate)) {
        return true;
      }
    }
  }

  return false;
}

describe("Sprint 0 & Nova Sprint — Contrato das 12 Rotas Oficiais (src/config/routes.ts)", () => {
  it("deve validar APP_ROUTES contra o schema Zod routesListSchema", () => {
    const parsed = routesListSchema.safeParse(APP_ROUTES);
    expect(parsed.success).toBe(true);
    expect(ROUTES).toEqual(APP_ROUTES);
    expect(OFFICIAL_ROUTES).toEqual(APP_ROUTES);
  });

  it("deve conter exatamente as 13 rotas na ordem especificada", () => {
    expect(APP_ROUTES).toHaveLength(13);

    EXPECTED_ROUTES.forEach((expected, index) => {
      const actual = APP_ROUTES[index];
      expect(actual).toBeDefined();
      expect(actual?.order).toBe(expected.order);
      expect(actual?.path).toBe(expected.path);
      expect(actual?.href).toBe(expected.path);
      expect(actual?.label).toBe(expected.label);
    });
  });

  it("deve configurar /robo-de-lances (rota 10) com badge 'Em breve' e flag isPlaceholder", () => {
    const roboRoute = getRouteByPath("/robo-de-lances");
    expect(roboRoute).toBeDefined();
    expect(roboRoute?.order).toBe(10);
    expect(roboRoute?.badge).toBe("Em breve");
    expect(roboRoute?.isPlaceholder).toBe(true);
  });

  it("deve possuir os arquivos page.tsx no App Router para todas as 12 rotas oficiais e /login", () => {
    const missingPages: string[] = [];

    for (const route of APP_ROUTES) {
      if (!hasAppRouterPageForRoute(route.path)) {
        missingPages.push(route.path);
      }
    }

    if (!hasAppRouterPageForRoute("/login")) {
      missingPages.push("/login");
    }

    expect(
      missingPages,
      `Páginas page.tsx ausentes no App Router (src/app): ${missingPages.join(", ")}`,
    ).toEqual([]);
  });
});
