import React from "react";
import fs from "node:fs";
import path from "node:path";
import * as sass from "sass";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "@/providers/theme-provider";
import { AppShell } from "@/components/shell/app-shell";
import DashboardPage from "@/app/dashboard/page";
import RoboDeLancesPage from "@/app/robo-de-lances/page";
import { PaywallBanner } from "@/components/faturamento/PaywallBanner";
import { THEME_STORAGE_KEY } from "@/types/theme";

const routerPushMock = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({
    push: routerPushMock,
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
}));

vi.mock("next/link", () => ({
  default: React.forwardRef<
    HTMLAnchorElement,
    React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }
  >(function MockNextLink({ href, onClick, children, ...rest }, ref) {
    return (
      <a
        ref={ref}
        href={href}
        data-nextjs-link="true"
        onClick={(e) => {
          onClick?.(e);
          e.preventDefault();
          routerPushMock(href);
        }}
        {...rest}
      >
        {children}
      </a>
    );
  }),
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: {
      user: {
        name: "Vítor Henrique",
        email: "vitor@empresa.com.br",
        role: "ADMIN",
      },
    },
    status: "authenticated",
  }),
  signOut: vi.fn(),
}));

describe("Issue #48 — Blindagem Dark Mode sem FOUC (SSR/CSS) e Navegação SPA em Carbon", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-carbon-theme");
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("1. globals.scss compilado deve aplicar tokens Carbon g100/g90 também sobre .cds--app-theme-root.cds--white antes da hidratação", () => {
    const globalsPath = path.resolve(process.cwd(), "src/app/globals.scss");
    const nodeModulesPath = path.resolve(process.cwd(), "node_modules");
    const pnpmDir = path.join(nodeModulesPath, ".pnpm");
    const pnpmCarbonLoadPaths = fs.existsSync(pnpmDir)
      ? fs
          .readdirSync(pnpmDir)
          .filter((dir) => dir.startsWith("@carbon"))
          .map((dir) => path.join(pnpmDir, dir, "node_modules"))
          .filter((dir) => fs.existsSync(dir))
      : [];
    const compiled = sass.compile(globalsPath, {
      loadPaths: [nodeModulesPath, ...pnpmCarbonLoadPaths],
      silenceDeprecations: ["legacy-js-api", "import", "color-4-api", "global-builtin", "if-function"],
    });

    const css = compiled.css;
    expect(css).toContain(".cds--app-theme-root.cds--white");
    expect(css).toMatch(
      /html\[data-carbon-theme=["']?g100["']?\][^{}]*\.cds--app-theme-root\.cds--white[^}]*--cds-background:\s*#161616/i,
    );
    expect(css).toMatch(
      /html\[data-carbon-theme=["']?g90["']?\][^{}]*\.cds--app-theme-root\.cds--white[^}]*--cds-background:\s*#262626/i,
    );
  });

  it("2. ThemeProvider hidrata HTML SSR sem divergência (zero recoverable hydration error) mesmo com g100 salvo no localStorage", async () => {
    const ssrHtml = renderToString(
      <ThemeProvider>
        <div data-testid="conteudo-ssr">Conteúdo</div>
      </ThemeProvider>,
    );

    expect(ssrHtml).toContain("cds--app-theme-root");
    expect(ssrHtml).toContain("cds--white");

    window.localStorage.setItem(THEME_STORAGE_KEY, "g100");
    document.documentElement.setAttribute("data-carbon-theme", "g100");

    const host = document.createElement("div");
    host.innerHTML = ssrHtml;
    document.body.appendChild(host);

    const hydrationErrors: unknown[] = [];
    let root: ReturnType<typeof hydrateRoot> | null = null;

    await act(async () => {
      root = hydrateRoot(
        host,
        <ThemeProvider>
          <div data-testid="conteudo-ssr">Conteúdo</div>
        </ThemeProvider>,
        {
          onRecoverableError: (err) => {
            hydrationErrors.push(err);
          },
        },
      );
    });

    expect(hydrationErrors).toHaveLength(0);
    expect(host.querySelector(".cds--app-theme-root")).toHaveClass("cds--g100");
    expect(document.documentElement.getAttribute("data-carbon-theme")).toBe("g100");

    await act(async () => {
      root?.unmount();
    });
    host.remove();
  });

  it("3. AppShell deve usar next/link (SPA) em HeaderName, SideNavLink e SideNavMenuItem evitando hard reload", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, naoLidas: 0, recentes: [] }),
    });

    render(
      <AppShell>
        <div>Página Atual</div>
      </AppShell>,
    );

    const headerBrand = document.querySelector("a.cds--header__name");
    expect(headerBrand).toHaveAttribute("data-nextjs-link", "true");
    expect(headerBrand).toHaveAttribute("href", "/dashboard");

    const oppLink = screen
      .getAllByRole("link", { name: /Oportunidades/i })
      .find((el) => el.getAttribute("href") === "/oportunidades");
    expect(oppLink).toBeDefined();
    expect(oppLink).toHaveAttribute("data-nextjs-link", "true");

    const roboLink = screen
      .getAllByRole("link", { name: /Robô de Lances/i })
      .find((el) => el.getAttribute("href") === "/robo-de-lances");
    expect(roboLink).toBeDefined();
    expect(roboLink).toHaveAttribute("data-nextjs-link", "true");

    fireEvent.click(oppLink!);
    expect(routerPushMock).toHaveBeenCalledWith("/oportunidades");
  });

  it("4. DashboardPage ClickableTile, RoboDeLancesPage e PaywallBanner devem navegar em modo SPA sem full page reload", async () => {
    global.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/dashboard")) {
        return new Response(
          JSON.stringify({
            ok: true,
            periodo: {
              mes: 11,
              ano: 2026,
              inicioUtc: "2026-11-01T03:00:00.000Z",
              fimUtc: "2026-12-01T03:00:00.000Z",
            },
            cards: {
              recebidas: { total: 10 },
              aguardandoDecisao: { total: 4, recebidasNoMes: 4 },
              emPrecificacao: { total: 2 },
              recusadas: { total: 1 },
            },
            resultados: {
              contempladas: { total: 1, valorTotal: 50000 },
              perdidasPreco: { total: 0 },
              perdidasDocumentacao: { total: 0 },
              desistencias: { total: 0 },
              impugnadas: { total: 0 },
              taxaConversaoPercentual: 100,
            },
            indicadores: {
              volumeEmDisputa: 50000,
              viabilidadeIA: { totalAnalisadas: 1, goPercentual: 100, noGoPercentual: 0 },
              criticas72h: [],
            },
            topTipos: [],
          }),
          { status: 200 },
        );
      }
      if (url.includes("/api/robo-de-lances/salas")) {
        return new Response(
          JSON.stringify({
            ok: true,
            plano: "PRO",
            salas: [
              {
                id: "lic-spa-48",
                titulo: "Pregão Teste SPA",
                orgao: "Órgão Teste",
                uf: "GO",
                numeroEdital: "PE 48/2026",
                portal: "Compras.gov.br",
                identificadorSala: "UASG 123456",
                statusGeral: "EM_DISPUTA",
                pausaEmergencia: false,
                tempoRespostaSegundos: 3,
                segundosFinaisSniper: 10,
                totalItens: 1,
                itensAtivosNoRobo: 1,
                pisoSeguroTotal: 1000,
                propostaInicialTotal: 1200,
                regrasItens: [],
                statusKanban: "EM_DISPUTA",
              },
            ],
          }),
          { status: 200 },
        );
      }
      if (url.includes("/api/faturamento")) {
        return new Response(
          JSON.stringify({
            status: "GRACE_PERIOD",
            diasAtraso: 2,
            emPeriodoDeGraca: true,
            bloqueado: false,
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });

    // Dashboard ClickableTiles devem interceptar clique simples e chamar router.push
    const dash = render(<DashboardPage />);
    const cardRecebidas = await screen.findByTestId("kpi-card-recebidas");
    fireEvent.click(cardRecebidas);
    expect(routerPushMock).toHaveBeenCalledWith("/oportunidades?periodo=mes");
    dash.unmount();

    // RoboDeLancesPage sem window.location.href (usa Link SPA em Abrir Sala e Ir para Oportunidades)
    const robo = render(<RoboDeLancesPage />);
    const abrirSalaLink = await screen.findByRole("link", { name: /Abrir Sala/i });
    expect(abrirSalaLink).toHaveAttribute("data-nextjs-link", "true");
    expect(abrirSalaLink).toHaveAttribute("href", "/oportunidades/lic-spa-48?tab=disputa");
    fireEvent.click(abrirSalaLink);
    expect(routerPushMock).toHaveBeenCalledWith("/oportunidades/lic-spa-48?tab=disputa");
    robo.unmount();

    // RoboDeLancesPage vazio -> Ir para Oportunidades também usa Link SPA
    const originalFetchFn = global.fetch;
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true, plano: "PRO", salas: [] }), { status: 200 }),
    );
    const roboVazio = render(<RoboDeLancesPage />);
    await waitFor(() => {
      expect(screen.getByTestId("salas-empty-state")).toBeInTheDocument();
    });
    const irOppLink = screen.getByRole("link", { name: /Ir para Oportunidades/i });
    expect(irOppLink).toHaveAttribute("data-nextjs-link", "true");
    expect(irOppLink).toHaveAttribute("href", "/oportunidades");
    roboVazio.unmount();
    global.fetch = originalFetchFn;

    // PaywallBanner deve usar Link SPA em vez de <a> puro
    render(<PaywallBanner initialStatus="GRACE_PERIOD" />);
    const linkFaturamento = screen.getByRole("link", { name: /Regularizar Pagamento/i });
    expect(linkFaturamento).toHaveAttribute("data-nextjs-link", "true");
    expect(linkFaturamento).toHaveAttribute("href", "/faturamento");

    // Checa ausência de window.location.href em RoboDeLancesPage
    const roboSrc = fs.readFileSync(
      path.resolve(process.cwd(), "src/app/robo-de-lances/page.tsx"),
      "utf-8",
    );
    expect(roboSrc).not.toContain("window.location.href");
  });
});
