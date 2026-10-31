import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import React from "react";
import DeclaracoesPage from "@/app/declaracoes/page";

describe("Sprint Nova Task 6 — Declarações: Preenchimento Completo de Dados da Empresa", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("deve carregar Razão Social, CNPJ, Endereço Completo, RG e Cargo do Representante", async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (typeof url === "string" && url.includes("/api/configuracoes/empresa")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            ok: true,
            empresa: {
              razaoSocial: "EMPRESA LICITANTE NACIONAL LTDA",
              cnpj: "12.345.678/0001-90",
              endereco: "Av. Paulista, 1000",
              numero: "1000",
              bairro: "Bela Vista",
              cidade: "São Paulo",
              uf: "SP",
              cep: "01310-100",
              representanteNome: "Carlos Alberto Silva",
              representanteCpf: "123.456.789-00",
              representanteRg: "MG-12.345.678",
              representanteCargo: "Diretor Presidente",
            },
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ ok: true, templates: [], oportunidades: [] }),
      });
    });

    render(<DeclaracoesPage />);

    await waitFor(() => {
      expect(screen.getByDisplayValue("EMPRESA LICITANTE NACIONAL LTDA")).toBeInTheDocument();
      expect(screen.getByDisplayValue("Carlos Alberto Silva")).toBeInTheDocument();
      expect(screen.getByDisplayValue("MG-12.345.678")).toBeInTheDocument();
      expect(screen.getByDisplayValue("Diretor Presidente")).toBeInTheDocument();
    });
  });

  it("deve recarregar dados da empresa ao escutar o evento tenant-changed", async () => {
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (typeof url === "string" && url.includes("/api/configuracoes/empresa")) {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              ok: true,
              empresa: {
                razaoSocial: "EMPRESA PRIMEIRA LTDA",
                cnpj: "11.111.111/0001-11",
                representanteNome: "Primeiro Representante",
                representanteRg: "RG-111",
                representanteCargo: "Gerente",
              },
            }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({
            ok: true,
            empresa: {
              razaoSocial: "NOVA EMPRESA TROCADA LTDA",
              cnpj: "22.222.222/0001-22",
              representanteNome: "Novo Representante",
              representanteRg: "RG-222",
              representanteCargo: "Diretor Geral",
            },
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ ok: true, templates: [], oportunidades: [] }),
      });
    });

    render(<DeclaracoesPage />);

    await waitFor(() => {
      expect(screen.getByDisplayValue("EMPRESA PRIMEIRA LTDA")).toBeInTheDocument();
    });

    act(() => {
      window.dispatchEvent(new CustomEvent("tenant-changed", { detail: { tenantId: "tenant_2" } }));
    });

    await waitFor(() => {
      expect(screen.getByDisplayValue("NOVA EMPRESA TROCADA LTDA")).toBeInTheDocument();
      expect(screen.getByDisplayValue("Novo Representante")).toBeInTheDocument();
      expect(screen.getByDisplayValue("RG-222")).toBeInTheDocument();
      expect(screen.getByDisplayValue("Diretor Geral")).toBeInTheDocument();
    });
  });
});
