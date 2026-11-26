// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import {
  clearInMemoryLicitacoes,
  insertInMemoryLicitacao,
} from "@/server/services/licitacoes-store";
import { listOportunidadesPaginadas } from "@/server/services/oportunidades.service";
import { listHistoricoLicitacoesPaginado } from "@/server/services/historico-licitacoes.service";

let mockedPathname = "/dashboard";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn() }),
  usePathname: () => mockedPathname,
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next-auth/react", () => ({
  signOut: vi.fn(),
  useSession: () => ({ data: null, status: "unauthenticated" }),
}));

vi.mock("@/providers/theme-provider", () => ({
  useAppTheme: () => ({ isDark: false, toggleTheme: vi.fn() }),
}));

vi.mock("@/components/shell/notifications-bell", () => ({
  NotificationsBell: () => <div />,
}));
vi.mock("@/components/shell/tenant-header-selector", () => ({
  TenantHeaderSelector: () => <div />,
}));
vi.mock("@/components/shell/system-broadcast-banner", () => ({
  SystemBroadcastBanner: () => <div />,
}));
vi.mock("@/components/suporte/suporte-modal", () => ({
  SuporteModal: () => null,
}));

function buildLic(
  overrides: Partial<Parameters<typeof insertInMemoryLicitacao>[0]> = {},
) {
  const id = `PNCP-I61-${Math.random().toString(36).slice(2, 10)}`;
  const futuro = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
  return insertInMemoryLicitacao({
    idPncp: id,
    numeroControlePNCP: id,
    numeroEdital: `PE-${id.slice(-5)}`,
    orgaoNome: "Órgão Pente Fino",
    orgaoCnpj: "06.000.000/0001-00",
    uf: "GO",
    municipio: "Goiânia",
    esfera: "MUNICIPAL",
    poder: "EXECUTIVO",
    modalidade: "Pregão Eletrônico",
    modalidadeCodigo: 6,
    portalDisputa: "ComprasNet",
    miniResumo: "Aquisição Teste Pente Fino",
    resumo: "Aquisição de materiais diversos para órgão municipal.",
    valorEstimado: 100_000,
    dataAbertura: futuro,
    dataEncerramentoProposta: futuro,
    dataPublicacaoPncp: new Date(),
    dataUltimaAtualizacao: new Date(),
    status: "PENDENTE",
    parecerIA: "AVALIAR",
    justificativaIA: null,
    tipoSistemaCodigo: "OUTROS",
    segmentoMacro: "INFORMATICA",
    subcategorias: ["3101"],
    atestadosExigidos: [],
    motivoRecusa: null,
    quantidadeLotes: 1,
    loteUnico: true,
    precoPorLote: false,
    isPresencial: false,
    distanciaGoianiaKm: null,
    linkPncp: null,
    linkSistemaOrigem: null,
    hashCritico: null,
    valorArrematado: null,
    responsavelId: null,
    ...overrides,
  });
}

beforeEach(() => {
  clearInMemoryLicitacoes();
  window.sessionStorage.clear();
  mockedPathname = "/dashboard";
  vi.restoreAllMocks();
});

afterEach(() => {
  cleanup();
});

describe("Issue #61 — Pente fino (escopo de segmento, NULL em OUTROS e limpeza de returningFromDossie)", () => {
  it("1. Bloqueia bypass de segmento via URL em /oportunidades quando segmento solicitado está fora de segmentosTenantAtivo", async () => {
    buildLic({ segmentoMacro: "INFORMATICA", subcategorias: ["3101"] });
    const saude = buildLic({ segmentoMacro: "SAUDE", subcategorias: ["1401"] });

    // Tenant só possui INFORMATICA, mas tenta forçar segmento=SAUDE na URL
    const res = await listOportunidadesPaginadas(
      {
        segmento: "SAUDE",
        segmentosTenantAtivo: ["INFORMATICA"],
        page: 1,
        pageSize: 10,
      },
      "tenant_seg_bypass",
    );

    expect(res.total).toBe(0);
    expect(res.oportunidades.some((o) => o.id === saude.id)).toBe(false);
  });

  it("2. Filtro segmento=OUTROS no Histórico retorna registros com segmentoMacro='OUTROS' E registros legados com segmentoMacro=null", async () => {
    const dt = new Date("2026-11-12T12:00:00.000Z");
    const licOutros = buildLic({
      segmentoMacro: "OUTROS",
      subcategorias: [],
      dataAbertura: dt,
      dataEncerramentoProposta: dt,
    });
    const licNull = buildLic({
      segmentoMacro: null,
      subcategorias: [],
      dataAbertura: dt,
      dataEncerramentoProposta: dt,
    });
    const licSaude = buildLic({
      segmentoMacro: "SAUDE",
      subcategorias: ["1401"],
      dataAbertura: dt,
      dataEncerramentoProposta: dt,
    });

    const res = await listHistoricoLicitacoesPaginado({
      dataInicio: "2026-11-01",
      dataFim: "2026-11-25",
      segmento: "OUTROS",
    });

    const ids = res.itens.map((i) => i.id);
    expect(ids).toContain(licOutros.id);
    expect(ids).toContain(licNull.id);
    expect(ids).not.toContain(licSaude.id);
  });

  it("3. AppShell limpa returningFromDossie no sessionStorage ao navegar para rota fora do Histórico/Dossiê", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: false }), { status: 200 }),
    );

    window.sessionStorage.setItem(
      "portal_historico_last_state",
      JSON.stringify({
        dataInicio: "2026-11-01",
        dataFim: "2026-11-25",
        returningFromDossie: true,
      }),
    );

    mockedPathname = "/dashboard";
    const { AppShell } = await import("@/components/shell/app-shell");
    render(
      <AppShell>
        <div>Dashboard</div>
      </AppShell>,
    );

    await waitFor(() => {
      const saved = JSON.parse(
        window.sessionStorage.getItem("portal_historico_last_state") || "{}",
      );
      expect(saved.returningFromDossie).toBe(false);
    });
  });
});
