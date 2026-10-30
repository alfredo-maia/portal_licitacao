import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { ModalAbrirDocumentos } from "@/components/licitacoes/ModalAbrirDocumentos";

describe("Sprint SaaS 3 — Frontend: Modal de Documentos Cloudflare R2 e Cache PNCP", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deve carregar e renderizar os documentos sincronizados no modal Carbon", async () => {
    const mockResponse = {
      ok: true,
      licitacaoId: "lic_123",
      numeroEdital: "PE 12/2026",
      totalArquivos: 1,
      origem: "R2_CACHE",
      sincronizadoEm: new Date().toISOString(),
      arquivos: [
        {
          id: "doc_1",
          nome: "Edital_PE_12_2026.pdf",
          tamanho: 2500000,
          mimeType: "application/pdf",
          r2Key: "editais/lic_123/Edital_PE_12_2026.pdf",
          r2Url: "https://docs.licitacao.internal/editais/lic_123/Edital_PE_12_2026.pdf",
          cachedAt: new Date().toISOString(),
          statusCache: "CACHE_HIT",
          urlDownload: "https://docs.licitacao.internal/editais/lic_123/Edital_PE_12_2026.pdf",
        },
      ],
    };

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/api/licitacoes/lic_123/documentos")) {
        return Promise.resolve({
          ok: true,
          json: async () => mockResponse,
        });
      }
      return Promise.reject(new Error("URL desconhecida"));
    });

    render(
      <ModalAbrirDocumentos
        open={true}
        onClose={vi.fn()}
        licitacaoId="lic_123"
        numeroEdital="PE 12/2026"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/Edital_PE_12_2026.pdf/i)).toBeInTheDocument();
      expect(screen.getByText(/Cache R2 Válido \(TTL 24h\)/i)).toBeInTheDocument();
      expect(screen.getByText(/Abrir PDF/i)).toBeInTheDocument();
    });
  });
});
