import { describe, expect, it } from "vitest";
import {
  PORTAL_STATUS,
  PORTAL_PERIODICIDADE,
  portalCriarInputSchema,
  portalItemSchema,
} from "@/server/schemas/portal.schema";
import {
  DOCUMENTO_CATEGORIAS,
  DOCUMENTO_STATUS,
  documentoCriarInputSchema,
  documentoItemSchema,
} from "@/server/schemas/documento.schema";
import { NOTIFICACAO_MATRIZ } from "@/server/schemas/notificacao.schema";

describe("Sprint 4 [TDD RED] — Contratos e Regras de Portais e Documentos", () => {
  describe("1. Contrato e Regras de Segurança de Portais (PRD §4.5)", () => {
    it("deve conter todos os status oficiais de portais", () => {
      expect(PORTAL_STATUS).toEqual([
        "NAO_CADASTRADO",
        "PRE_CADASTRO",
        "AGUARDANDO_APROVACAO",
        "CADASTRADO",
        "REJEITADO",
        "VENCIDO",
        "SUSPENSO",
      ]);
    });

    it("deve conter periodicidades de assinatura válidas", () => {
      expect(PORTAL_PERIODICIDADE).toEqual([
        "MENSAL",
        "TRIMESTRAL",
        "SEMESTRAL",
        "ANUAL",
        "GRATUITO",
      ]);
    });

    it("NÃO deve aceitar nem armazenar senhas em credenciais de portais (segurança estrita)", () => {
      const parsed = portalCriarInputSchema.parse({
        nome: "Compras.gov.br",
        url: "https://www.gov.br/compras",
        login: "empresa.ti",
        email: "comercial@empresa.com",
        cnpj: "01.000.000/0001-00",
        usuario: "admin_licitacao",
        periodicidade: "ANUAL",
        // Campo 'senha' não deve existir no contrato
      });

      expect((parsed as any).senha).toBeUndefined();
      expect((parsed as any).password).toBeUndefined();
    });

    it("deve rejeitar portal com URL inválida ou nome muito curto", () => {
      expect(() =>
        portalCriarInputSchema.parse({
          nome: "A",
          url: "invalido",
        }),
      ).toThrow();
    });
  });

  describe("2. Contrato e Regras de Documentos de Habilitação (PRD §4.6 / Lei 14.133)", () => {
    it("deve cobrir as 5 categorias legais da Lei 14.133/2021", () => {
      expect(DOCUMENTO_CATEGORIAS).toEqual([
        "JURIDICA",
        "FISCAL_TRABALHISTA",
        "QUALIFICACAO_TECNICA",
        "QUALIFICACAO_ECONOMICA",
        "OUTROS",
      ]);
    });

    it("deve exigir data de vencimento se o documento NÃO for permanente (semValidade = false)", () => {
      expect(() =>
        documentoCriarInputSchema.parse({
          nome: "Certidão Negativa Federal",
          categoria: "FISCAL_TRABALHISTA",
          semValidade: false,
          dataVencimento: undefined,
        }),
      ).toThrow(/Data de vencimento é obrigatória/i);
    });

    it("deve permitir data de vencimento nula para documentos permanentes (semValidade = true)", () => {
      const doc = documentoCriarInputSchema.parse({
        nome: "Contrato Social Registrado",
        categoria: "JURIDICA",
        semValidade: true,
      });

      expect(doc.semValidade).toBe(true);
      expect(doc.dataVencimento).toBeUndefined();
    });
  });

  describe("3. Matriz de Notificações N6 e N7 (PRD §6.2)", () => {
    it("deve configurar 5 janelas de aviso para renovação de portais (N6)", () => {
      const n6 = NOTIFICACAO_MATRIZ.N6_VENCIMENTO_PORTAL;
      expect(n6.destinatarios).toBe("DIRETORIA_E_COMERCIAL");
      expect(n6.severidade).toBe("ATENCAO");
      expect(n6.antecedenciaDias).toEqual([30, 21, 14, 7, 1]);
    });

    it("deve configurar 3 janelas de aviso para expiração de documentos (N7)", () => {
      const n7 = NOTIFICACAO_MATRIZ.N7_VENCIMENTO_DOCUMENTO;
      expect(n7.destinatarios).toBe("TODOS");
      expect(n7.severidade).toBe("ATENCAO");
      expect(n7.antecedenciaDias).toEqual([30, 14, 1]);
    });
  });
});
