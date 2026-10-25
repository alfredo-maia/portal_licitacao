import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import DeclaracoesPage from "@/app/declaracoes/page";
import ImpugnacoesPage from "@/app/impugnacoes/page";

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/declaracoes",
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

describe("Sprint 5 — Frontend: Declarações Oficiais A4 & Gestão de Impugnações (AV-74)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("1. Gerador das 8 Declarações Oficiais em Split-Screen (/declaracoes)", () => {
    it("deve renderizar formulário com seleção dos modelos e folha A4 em tempo real", async () => {
      const mockTemplates = [
        {
          codigo: "HABILITACAO_PLENA",
          titulo: "Declaração de Pleno Atendimento aos Requisitos de Habilitação",
          fundamentoLegal: "Art. 63, I da Lei nº 14.133/2021",
          descricao: "Assegura o cumprimento integral das exigências editalícias.",
        },
        {
          codigo: "CARTA_CREDENCIAMENTO",
          titulo: "Carta de Credenciamento de Representante Legal / Procurador",
          fundamentoLegal: "Art. 12 da Lei nº 14.133/2021",
          descricao: "Outorga poderes para representação da empresa licitante.",
        },
      ];

      const mockDeclaracaoGerada = {
        ok: true,
        tipo: "HABILITACAO_PLENA",
        titulo: "Declaração de Pleno Atendimento aos Requisitos de Habilitação",
        fundamentoLegal: "Art. 63, I da Lei nº 14.133/2021",
        conteudoHtml: "<div class='declaracao-a4-documento'><h2>APONTA TECNOLOGIA LTDA</h2><p>Cumpre plenamente todos os requisitos.</p></div>",
        conteudoTexto: "APONTA TECNOLOGIA LTDA\nCumpre plenamente todos os requisitos.",
        dadosPreenchidos: {},
      };

      global.fetch = vi.fn().mockImplementation((url: string, opts?: any) => {
        if (url.includes("/api/declaracoes/templates")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ ok: true, templates: mockTemplates }),
          });
        }
        if (url.includes("/api/oportunidades")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ ok: true, oportunidades: [] }),
          });
        }
        if (url.includes("/api/declaracoes/gerar")) {
          return Promise.resolve({
            ok: true,
            json: async () => mockDeclaracaoGerada,
          });
        }
        return Promise.reject(new Error("URL desconhecida: " + url));
      });

      render(<DeclaracoesPage />);

      // Verifica cabeçalho e título
      expect(
        screen.getByText("Gerador dos 8 Modelos Oficiais de Declaração"),
      ).toBeDefined();
      expect(screen.getByText("Anexo 5 • Lei nº 14.133/2021")).toBeDefined();

      // Botões de ação no topo
      expect(screen.getByText("Imprimir / PDF A4")).toBeDefined();
      expect(screen.getByText("Copiar Texto")).toBeDefined();
      expect(screen.getByText("Exportar .TXT")).toBeDefined();

      // Aguarda renderização da folha A4 preview
      await waitFor(() => {
        expect(screen.getByTestId("folha-a4-preview")).toBeDefined();
        expect(screen.getByText("APONTA TECNOLOGIA LTDA")).toBeDefined();
        expect(screen.getByText("Cumpre plenamente todos os requisitos.")).toBeDefined();
      });

      // Valida campos do formulário à esquerda
      expect(screen.getByLabelText(/Número do Edital \/ Pregão/i)).toBeDefined();
      expect(screen.getByLabelText(/Órgão Licitante Convocatório/i)).toBeDefined();
      expect(screen.getByLabelText(/Razão Social da Empresa/i)).toBeDefined();
      expect(screen.getByLabelText(/Nome Completo do Declarante/i)).toBeDefined();
    });
  });

  describe("2. Módulo de Impugnações e Prazos Fatais (/impugnacoes)", () => {
    it("deve renderizar KPIs, lista de impugnações com cálculo do Art. 164 e alerta de risco", async () => {
      const mockImpugnacoes = [
        {
          id: "imp_1",
          numeroEdital: "PE 105/2026",
          orgaoNome: "Tribunal Regional do Trabalho 18ª Região",
          objeto: "Contratação de links e switches gerenciáveis",
          status: "RASCUNHO",
          motivoLegal: "Exigência de atestado de capacitação com marca proprietária",
          dataAberturaSessao: "2026-11-05T09:00:00.000Z",
          prazoFatal: "2026-10-31T18:00:00.000Z",
          fundamentacao: "A exigência fere a Súmula 273 do TCU e o Art. 41 da Lei 14.133.",
          pedidos: "Requer a exclusão da exigência restritiva.",
          numeroProtocolo: null,
          dataProtocolo: null,
          horasRestantesPrazoFatal: 18, // Crítico <= 24h
          prazoVencido: false,
        },
        {
          id: "imp_2",
          numeroEdital: "PE 044/2026",
          orgaoNome: "Prefeitura Municipal de Anápolis",
          objeto: "Fornecimento de licenças de software",
          status: "PROTOCOLADA",
          motivoLegal: "Prazo exíguo de entrega de 3 dias úteis",
          dataAberturaSessao: "2026-11-20T10:00:00.000Z",
          prazoFatal: "2026-11-17T18:00:00.000Z",
          fundamentacao: "Prazo inexequível violando o princípio da razoabilidade.",
          pedidos: "Dilação para 15 dias corridos.",
          numeroProtocolo: "PROT-2026-9900",
          dataProtocolo: "2026-10-24T14:30:00.000Z",
          horasRestantesPrazoFatal: 120,
          prazoVencido: false,
        },
      ];

      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes("/api/impugnacoes")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              ok: true,
              total: mockImpugnacoes.length,
              page: 1,
              pageSize: 10,
              totalPages: 1,
              impugnacoes: mockImpugnacoes,
            }),
          });
        }
        if (url.includes("/api/oportunidades")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ ok: true, oportunidades: [] }),
          });
        }
        return Promise.reject(new Error("URL desconhecida: " + url));
      });

      render(<ImpugnacoesPage />);

      // Verifica título e tags
      expect(
        screen.getByText("Gestão de Impugnações e Pedidos de Esclarecimento"),
      ).toBeDefined();
      expect(screen.getByText("Art. 164 — 3 Dias Úteis")).toBeDefined();

      // Verifica KPIs
      await waitFor(() => {
        expect(screen.getByText("PE 105/2026")).toBeDefined();
        expect(screen.getByText("Tribunal Regional do Trabalho 18ª Região")).toBeDefined();
        expect(screen.getByText("PE 044/2026")).toBeDefined();
      });

      // Verifica sinalização de alerta do prazo fatal (18h restantes ➔ tag CRÍTICO)
      expect(screen.getByText("CRÍTICO: 18h restantes")).toBeDefined();

      // Verifica status badges
      expect(screen.getByText("RASCUNHO")).toBeDefined();
      expect(screen.getByText("PROTOCOLADA")).toBeDefined();

      // Verifica botão de Minuta Jurídica TCU
      expect(screen.getByTestId("btn-ver-minuta-imp_1")).toBeDefined();
    });

    it("deve abrir o modal de Nova Impugnação ao clicar no botão correspondente", async () => {
      global.fetch = vi.fn().mockImplementation((url: string) => {
        return Promise.resolve({
          ok: true,
          json: async () => ({ ok: true, total: 0, impugnacoes: [] }),
        });
      });

      render(<ImpugnacoesPage />);

      const btnNova = screen.getByText("Nova Impugnação");
      fireEvent.click(btnNova);

      expect(
        screen.getByText("Nova Impugnação ou Pedido de Esclarecimento (Art. 164 Lei 14.133)"),
      ).toBeDefined();
      expect(
        screen.getByText(/Modelos Rápidos de Jurisprudência do TCU:/i),
      ).toBeDefined();
      expect(
        screen.getByText("Súmula 273/TCU — Vedação à indicação de marcas exclusivas"),
      ).toBeDefined();
    });
  });
});
