import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import DeclaracoesPage from "@/app/declaracoes/page";

vi.mock("next/navigation", () => ({
  usePathname: () => "/declaracoes",
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

describe("Sprint New - Task 6: Declarações (Sem Erro ao Entrar, Molde A4 Imediato e Impressão em 1 Página)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("não deve exibir erro 'Dados inválidos para geração de declaração' nem 'Carregando modelo A4 oficial...' ao entrar na página", async () => {
    const gerarSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        tipo: "HABILITACAO_PLENA",
        titulo: "Declaração de Pleno Atendimento aos Requisitos de Habilitação",
        fundamentoLegal: "Art. 63, I da Lei nº 14.133/2021",
        conteudoHtml:
          "<div class='declaracao-a4-documento'><h2>EMPRESA ATUALIZADA LTDA</h2><p>Texto atualizado pelo botão.</p></div>",
        conteudoTexto: "EMPRESA ATUALIZADA LTDA\nTexto atualizado pelo botão.",
        dadosPreenchidos: {},
      }),
    });

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/declaracoes/templates")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ ok: true, templates: [] }),
        });
      }
      if (url.includes("/api/oportunidades")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ ok: true, oportunidades: [] }),
        });
      }
      if (url.includes("/api/configuracoes/empresa")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ ok: true, empresa: null }),
        });
      }
      if (url.includes("/api/declaracoes/gerar")) {
        return gerarSpy();
      }
      return Promise.resolve({ ok: true, json: async () => ({ ok: true }) });
    });

    render(<DeclaracoesPage />);

    // Não deve exibir "Carregando modelo A4 oficial..."
    expect(screen.queryByText(/Carregando modelo A4 oficial/i)).toBeNull();

    // Não deve exibir erro de dados inválidos ao entrar
    expect(screen.queryByText(/Dados inválidos para geração de declaração/i)).toBeNull();

    // Deve exibir imediatamente o molde de pré-visualização na Folha A4
    const preview = screen.getByTestId("folha-a4-preview");
    expect(preview).toBeDefined();
    expect(preview.textContent).toContain("Declaração de Pleno Atendimento aos Requisitos de Habilitação");

    // Não deve ter chamado /api/declaracoes/gerar automaticamente no mount
    expect(gerarSpy).not.toHaveBeenCalled();

    // Quando o usuário clica no botão "Atualizar Folha A4", atualiza a Pré-visualização da Folha A4 Oficial
    const btnAtualizar = screen.getByText("Atualizar Folha A4");
    fireEvent.click(btnAtualizar);

    await waitFor(() => {
      expect(gerarSpy).toHaveBeenCalledTimes(1);
      expect(screen.getByText("EMPRESA ATUALIZADA LTDA")).toBeDefined();
      expect(screen.getByText("Texto atualizado pelo botão.")).toBeDefined();
    });
  });
});

