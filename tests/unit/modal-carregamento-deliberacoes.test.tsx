import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import OportunidadesPage from "@/app/oportunidades/page";
import OportunidadesDetalhePage from "@/app/oportunidades/[id]/page";

// Mocks do Next Navigation
const pushMock = vi.fn();
const searchParamsMock = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => searchParamsMock,
}));

// Mock do hook de subscrição
vi.mock("@/hooks/use-tenant-subscription", () => ({
  useTenantSubscription: () => ({
    isReadOnly: false,
    loading: false,
    billingStatus: "ATIVO",
    plano: "ENTERPRISE",
  }),
}));

const mockLicitacao = {
  id: "lic_test_modal_1",
  idPncp: "12345678000199-1-000001/2026",
  numeroEdital: "001/2026",
  orgaoNome: "PREFEITURA DE TESTE",
  orgaoCnpj: "12345678000199",
  uf: "GO",
  miniResumo: "Aquisição de Merenda Escolar",
  resumo: "Aquisição de Merenda Escolar",
  valorEstimado: 150000,
  dataAbertura: "2026-11-20T10:00:00.000Z",
  status: "PENDENTE",
  tipoSistemaCodigo: "ALIMENTACAO",
  arquivos: [],
  repositoriosSimilares: [],
  analisesIA: [],
};

describe("Issue #31 — Modal de Carregamento nas Deliberações de Oportunidades e Dossiê", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("1. Na tela /oportunidades, ao clicar em Participar, deve exibir modal de loading e fechar após término", async () => {
    let resolvePost: (value: any) => void;
    const postPromise = new Promise((resolve) => {
      resolvePost = resolve;
    });

    global.fetch = vi.fn().mockImplementation((url: string, opts?: any) => {
      if (opts?.method === "POST" && url.includes("/decisao")) {
        return postPromise;
      }
      if (url.includes("/api/tenant/preferencias")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              ok: true,
              segmentos: ["ALIMENTACAO"],
              brasilInteiro: true,
              ufs: [],
            }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            ok: true,
            total: 1,
            page: 1,
            pageSize: 10,
            totalPages: 1,
            oportunidades: [mockLicitacao],
          }),
      });
    });

    render(<OportunidadesPage />);

    // Aguarda carregar a tabela
    const btnAceitar = await screen.findByTestId(`btn-aceitar-${mockLicitacao.id}`);
    expect(btnAceitar).toBeInTheDocument();

    // Modal de carregamento NÃO deve estar visível
    expect(screen.queryByTestId("modal-deliberacao-loading")).toBeNull();

    // Clica em Participar
    fireEvent.click(btnAceitar);

    // Modal de carregamento DEVE ficar visível
    await waitFor(() => {
      expect(screen.getByTestId("modal-deliberacao-loading")).toBeInTheDocument();
    });

    // Resolve a requisição da API
    resolvePost!({
      ok: true,
      json: () => Promise.resolve({ ok: true, oportunidade: { ...mockLicitacao, status: "ACEITA" } }),
    });

    // Modal de carregamento DEVE fechar
    await waitFor(() => {
      expect(screen.queryByTestId("modal-deliberacao-loading")).toBeNull();
    });
  });

  it("2. Na tela /oportunidades, ao confirmar recusa em Não Participar, deve exibir modal de loading e fechar após término", async () => {
    let resolvePost: (value: any) => void;
    const postPromise = new Promise((resolve) => {
      resolvePost = resolve;
    });

    global.fetch = vi.fn().mockImplementation((url: string, opts?: any) => {
      if (opts?.method === "POST" && url.includes("/decisao")) {
        return postPromise;
      }
      if (url.includes("/api/tenant/preferencias")) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              ok: true,
              segmentos: ["ALIMENTACAO"],
              brasilInteiro: true,
              ufs: [],
            }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            ok: true,
            total: 1,
            page: 1,
            pageSize: 10,
            totalPages: 1,
            oportunidades: [mockLicitacao],
          }),
      });
    });

    render(<OportunidadesPage />);

    const btnRecusar = await screen.findByTestId(`btn-recusar-${mockLicitacao.id}`);
    fireEvent.click(btnRecusar);

    // Modal de seleção de motivo abre
    const modalRecusar = await screen.findByTestId("modal-recusar-oportunidade");
    expect(modalRecusar).toBeInTheDocument();

    // Confirma recusa
    const btnConfirmarRecusa = screen.getByText("Confirmar Recusa");
    fireEvent.click(btnConfirmarRecusa);

    // Modal de carregamento DEVE abrir
    await waitFor(() => {
      expect(screen.getByTestId("modal-deliberacao-loading")).toBeInTheDocument();
    });

    // Resolve a requisição
    resolvePost!({
      ok: true,
      json: () => Promise.resolve({ ok: true, oportunidade: { ...mockLicitacao, status: "RECUSADA" } }),
    });

    // Modal de carregamento fecha
    await waitFor(() => {
      expect(screen.queryByTestId("modal-deliberacao-loading")).toBeNull();
    });
  });

  it("3. Na tela /oportunidades/[id], ao clicar em Participar, deve exibir modal de loading e fechar após término", async () => {
    let resolvePost: (value: any) => void;
    const postPromise = new Promise((resolve) => {
      resolvePost = resolve;
    });

    global.fetch = vi.fn().mockImplementation((url: string, opts?: any) => {
      if (opts?.method === "POST" && url.includes("/decisao")) {
        return postPromise;
      }
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            ok: true,
            oportunidade: mockLicitacao,
            usuarios: [],
          }),
      });
    });

    render(<OportunidadesDetalhePage params={{ id: mockLicitacao.id }} />);

    const btnAceitar = await screen.findByTestId("btn-dossie-aceitar");
    expect(btnAceitar).toBeInTheDocument();

    // Clica em Participar
    fireEvent.click(btnAceitar);

    // Modal de loading do dossiê DEVE aparecer
    await waitFor(() => {
      expect(screen.getByTestId("modal-dossie-deliberacao-loading")).toBeInTheDocument();
    });

    // Resolve a API
    resolvePost!({
      ok: true,
      json: () => Promise.resolve({ ok: true, oportunidade: { ...mockLicitacao, status: "ACEITA" } }),
    });

    // Modal de loading deve fechar
    await waitFor(() => {
      expect(screen.queryByTestId("modal-dossie-deliberacao-loading")).toBeNull();
    });
  });

  it("4. Na tela /oportunidades/[id], ao confirmar recusa no modal, deve exibir modal de loading e fechar após término", async () => {
    let resolvePost: (value: any) => void;
    const postPromise = new Promise((resolve) => {
      resolvePost = resolve;
    });

    global.fetch = vi.fn().mockImplementation((url: string, opts?: any) => {
      if (opts?.method === "POST" && url.includes("/decisao")) {
        return postPromise;
      }
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            ok: true,
            oportunidade: mockLicitacao,
            usuarios: [],
          }),
      });
    });

    render(<OportunidadesDetalhePage params={{ id: mockLicitacao.id }} />);

    const btnRecusar = await screen.findByTestId("btn-dossie-recusar");
    fireEvent.click(btnRecusar);

    // Modal de recusa do dossiê abre
    const modalRecusa = await screen.findByTestId("modal-recusar-dossie");
    expect(modalRecusa).toBeInTheDocument();

    // Clica em Confirmar Recusa
    const btnConfirmar = screen.getByText("Confirmar Recusa");
    fireEvent.click(btnConfirmar);

    // Modal de carregamento DEVE aparecer
    await waitFor(() => {
      expect(screen.getByTestId("modal-dossie-deliberacao-loading")).toBeInTheDocument();
    });

    // Resolve a API
    resolvePost!({
      ok: true,
      json: () => Promise.resolve({ ok: true, oportunidade: { ...mockLicitacao, status: "RECUSADA" } }),
    });

    // Modal de carregamento fecha
    await waitFor(() => {
      expect(screen.queryByTestId("modal-dossie-deliberacao-loading")).toBeNull();
    });
  });
});
