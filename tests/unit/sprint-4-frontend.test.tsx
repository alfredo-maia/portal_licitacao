import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import PortaisPage from "@/app/portais/page";
import DocumentacaoPage from "@/app/documentacao/page";

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => "/portais",
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

describe("Sprint 4 — Frontend Portais & Documentação de Habilitação (AV-64)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("1. Catálogo de Portais (/portais)", () => {
    it("deve renderizar a listagem de portais, aviso de zero senhas e modal sem campos de senha", async () => {
      const mockPortais = [
        {
          id: "portal_comprasnet",
          nome: "Comprasnet / Compras.gov.br",
          url: "https://comprasnet.gov.br",
          login: "empresa_licitante",
          status: "CADASTRADO",
          valorAssinatura: 0,
          periodicidade: "GRATUITO",
          aceitaRobo: true,
          exigeCertificadoDigital: true,
        },
        {
          id: "portal_bec",
          nome: "Bolsa Eletrônica de Compras - BEC SP",
          url: "https://bec.sp.gov.br",
          cnpj: "12.345.678/0001-90",
          status: "PRE_CADASTRO",
          valorAssinatura: 350.0,
          periodicidade: "MENSAL",
          aceitaRobo: false,
          exigeCertificadoDigital: false,
        },
      ];

      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes("/api/portais")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              ok: true,
              portais: mockPortais,
              total: mockPortais.length,
            }),
          });
        }
        return Promise.reject(new Error("URL desconhecida: " + url));
      });

      render(<PortaisPage />);

      // Aguarda carregar dados
      await waitFor(() => {
        expect(screen.getByText("Comprasnet / Compras.gov.br")).toBeDefined();
        expect(screen.getByText("Bolsa Eletrônica de Compras - BEC SP")).toBeDefined();
      });

      // Verifica aviso de segurança de credenciais (zero senhas)
      expect(
        screen.getAllByText(/Credenciais Seguras \(sem senhas\)/i).length,
      ).toBeGreaterThanOrEqual(1);

      // Verifica tags de robô e certificado
      expect(screen.getByText("✔ Aceita Robô")).toBeDefined();
      expect(screen.getByText("Sem Robô")).toBeDefined();
      expect(screen.getByText("Certificado A1/A3")).toBeDefined();
      expect(screen.getByText("Acesso via Login")).toBeDefined();

      // Clica no botão + Novo Portal
      const btnNovo = screen.getByTestId("btn-novo-portal");
      fireEvent.click(btnNovo);

      // Modal de criação deve abrir
      expect(screen.getByTestId("modal-portal")).toBeDefined();

      // Confirma que NÃO existe campo de senha em nenhum lugar do formulário
      expect(screen.queryByLabelText(/senha/i)).toBeNull();
      expect(screen.queryByPlaceholderText(/senha/i)).toBeNull();
    });
  });

  describe("2. Repositório de Documentação Legal da Lei 14.133 (/documentacao)", () => {
    it("deve renderizar abas de categorias legais e destacar documentos vencendo em vermelho e negrito", async () => {
      const mockDocumentos = [
        {
          id: "doc_cnd_federal",
          nome: "Certidão Negativa de Débitos Federais e Previdenciários",
          categoria: "REGULARIDADE_FISCAL_TRABALHISTA",
          tipo: "Certidão",
          orgaoEmissor: "Receita Federal do Brasil / PGFN",
          semValidade: false,
          dataEmissao: "2026-05-01T00:00:00.000Z",
          dataVencimento: "2026-11-10T00:00:00.000Z",
          alertaVencimento: true,
          diasParaVencer: 16,
          versao: 1,
          status: "VIGENTE",
          arquivoNome: "cnd_federal_2026.pdf",
        },
        {
          id: "doc_contrato_social",
          nome: "Contrato Social Consolidado",
          categoria: "HABILITACAO_JURIDICA",
          tipo: "Contrato Social",
          orgaoEmissor: "Junta Comercial",
          semValidade: true,
          dataEmissao: "2024-01-10T00:00:00.000Z",
          dataVencimento: null,
          alertaVencimento: false,
          diasParaVencer: null,
          versao: 3,
          status: "VIGENTE",
          arquivoNome: "contrato_social_v3.pdf",
        },
      ];

      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes("/api/documentos")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              ok: true,
              documentos: mockDocumentos,
              total: mockDocumentos.length,
            }),
          });
        }
        return Promise.reject(new Error("URL desconhecida: " + url));
      });

      render(<DocumentacaoPage />);

      // Aguarda carregar dados
      await waitFor(() => {
        expect(
          screen.getByText("Certidão Negativa de Débitos Federais e Previdenciários"),
        ).toBeDefined();
        expect(screen.getByText("Contrato Social Consolidado")).toBeDefined();
      });

      // Verifica abas da Lei 14.133
      expect(screen.getByText(/Todas as Categorias/i)).toBeDefined();
      expect(screen.getAllByText(/Habilitação Jurídica/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/Fiscal & Trabalhista/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/Qualificação Técnica/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText(/Qualificação Econômica/i).length).toBeGreaterThanOrEqual(1);

      // Verifica que o documento em alerta de vencimento possui aviso visual
      const badgeAlerta = screen.getByTestId("documento-alerta-vencimento");
      expect(badgeAlerta).toBeDefined();
      expect(badgeAlerta.textContent).toMatch(/16 dias/i);

      // Documento permanente sem validade deve indicar tag Permanente
      expect(screen.getByText("Permanente")).toBeDefined();
    });

    it("deve abrir o modal de Nova Versão ao clicar no botão correspondente", async () => {
      const mockDoc = {
        id: "doc_balanco",
        nome: "Balanço Patrimonial e DRE",
        categoria: "QUALIFICACAO_ECONOMICO_FINANCEIRA",
        tipo: "Balanço",
        orgaoEmissor: "Contabilidade",
        semValidade: false,
        dataEmissao: "2026-01-01T00:00:00.000Z",
        dataVencimento: "2027-04-30T00:00:00.000Z",
        alertaVencimento: false,
        diasParaVencer: 180,
        versao: 1,
        status: "VIGENTE",
        arquivoNome: "balanco_2025.pdf",
      };

      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes("/api/documentos")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              ok: true,
              documentos: [mockDoc],
              total: 1,
            }),
          });
        }
        return Promise.reject(new Error("URL desconhecida: " + url));
      });

      render(<DocumentacaoPage />);

      await waitFor(() => {
        expect(screen.getByText("Balanço Patrimonial e DRE")).toBeDefined();
      });

      // Clica no botão + Nova Versão
      const btnNovaVersao = screen.getByTestId("btn-nova-versao-doc_balanco");
      fireEvent.click(btnNovaVersao);

      // Modal de nova versão deve abrir com mensagem de arquivamento da versão anterior
      expect(screen.getByTestId("modal-nova-versao")).toBeDefined();
      expect(screen.getByText(/Adicionar Nova Versão — Balanço Patrimonial e DRE/i)).toBeDefined();
      expect(screen.getByText(/nova versão \(v2\)/i)).toBeDefined();
    });
  });
});
