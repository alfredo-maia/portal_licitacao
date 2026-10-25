import { describe, expect, it } from "vitest";
import {
  DECLARACAO_TIPOS,
  DECLARACAO_METADATA,
  declaracaoGerarInputSchema,
  declaracaoTipoSchema,
} from "@/server/schemas/declaracao.schema";
import {
  IMPUGNACAO_STATUS,
  calcularPrazoFatalImpugnacao,
  impugnacaoCriarInputSchema,
  impugnacaoStatusSchema,
} from "@/server/schemas/impugnacao.schema";

describe("Sprint 5 [TDD RED] — Contratos e Regras de Negócio (Declarações & Impugnações)", () => {
  describe("1. Contratos dos 8 Modelos Oficiais de Declaração (PRD §4.7 / Anexo 5)", () => {
    it("deve conter exatamente os 8 tipos oficiais previstos no PRD e Anexo 5", () => {
      expect(DECLARACAO_TIPOS).toHaveLength(8);
      expect(DECLARACAO_TIPOS).toEqual([
        "CARTA_CREDENCIAMENTO",
        "ELABORACAO_INDEPENDENTE",
        "INEXISTENCIA_FATOS_IMPEDITIVOS",
        "NAO_TRABALHO_FORCADO",
        "RENUNCIA_VISTORIA",
        "HABILITACAO_PLENA",
        "ME_EPP",
        "NAO_EMPREGA_MENOR",
      ]);
    });

    it("deve mapear metadados legais e fundamentos para todos os 8 modelos", () => {
      for (const tipo of DECLARACAO_TIPOS) {
        const meta = DECLARACAO_METADATA[tipo];
        expect(meta).toBeDefined();
        expect(meta.codigo).toBe(tipo);
        expect(meta.titulo).toBeTruthy();
        expect(meta.fundamentoLegal).toBeTruthy();
        expect(meta.descricao).toBeTruthy();
      }
    });

    it("deve validar campos mandatórios para geração de declarações", () => {
      const payloadValido = {
        tipo: "ELABORACAO_INDEPENDENTE",
        numeroEdital: "001/2026-SEDUC-GO",
        orgaoNome: "Secretaria de Estado da Educação de Goiás",
        empresaRazaoSocial: "Empresa Tecnologia Licitante LTDA",
        empresaCnpj: "12.345.678/0001-90",
        representanteNome: "Carlos Eduardo Silva",
        representanteCpf: "123.456.789-00",
      };

      const parsed = declaracaoGerarInputSchema.parse(payloadValido);
      expect(parsed.tipo).toBe("ELABORACAO_INDEPENDENTE");
      expect(parsed.representanteCargo).toBe("Representante Legal");
      expect(parsed.cidade).toBe("Goiânia");
      expect(parsed.uf).toBe("GO");

      // Payload sem CNPJ deve falhar
      expect(() =>
        declaracaoGerarInputSchema.parse({
          ...payloadValido,
          empresaCnpj: "",
        }),
      ).toThrow();

      // Payload com tipo inexistente deve falhar
      expect(() =>
        declaracaoGerarInputSchema.parse({
          ...payloadValido,
          tipo: "DECLARACAO_INEXISTENTE" as any,
        }),
      ).toThrow();
    });
  });

  describe("2. Cálculo de Prazo Fatal de Impugnação — Art. 164 Lei 14.133/2021", () => {
    it("deve calcular exatamente 3 dias úteis antes da abertura da sessão pública", () => {
      // Cenário 1: Sessão em uma Quinta-Feira (29/10/2026 às 09:00)
      // 3 dias úteis antes: Quarta (1), Terça (2), Segunda (3) ➔ 26/10/2026
      const aberturaQuinta = new Date("2026-10-29T09:00:00.000Z");
      const prazo1 = calcularPrazoFatalImpugnacao(aberturaQuinta);
      expect(prazo1.getDate()).toBe(26);
      expect(prazo1.getMonth()).toBe(9); // Outubro
      expect(prazo1.getDay()).toBe(1); // Segunda-feira

      // Cenário 2: Sessão em uma Segunda-Feira (02/11/2026 às 10:00)
      // Pula Domingo (01) e Sábado (31/10).
      // 3 dias úteis antes: Sexta (30/10), Quinta (29/10), Quarta (28/10) ➔ 28/10/2026
      const aberturaSegunda = new Date("2026-11-02T10:00:00.000Z");
      const prazo2 = calcularPrazoFatalImpugnacao(aberturaSegunda);
      expect(prazo2.getDate()).toBe(28);
      expect(prazo2.getMonth()).toBe(9); // Outubro
      expect(prazo2.getDay()).toBe(3); // Quarta-feira

      // Cenário 3: Sessão em uma Terça-Feira (03/11/2026 às 14:00)
      // 3 dias úteis antes: Segunda (02/11), pula dom/sáb, Sexta (30/10), Quinta (29/10) ➔ 29/10/2026
      const aberturaTerca = new Date("2026-11-03T14:00:00.000Z");
      const prazo3 = calcularPrazoFatalImpugnacao(aberturaTerca);
      expect(prazo3.getDate()).toBe(29);
      expect(prazo3.getMonth()).toBe(9);
      expect(prazo3.getDay()).toBe(4); // Quinta-feira
    });
  });

  describe("3. Contratos de Impugnações (PRD §4.9)", () => {
    it("deve validar os status válidos do funil de impugnações", () => {
      expect(IMPUGNACAO_STATUS).toEqual([
        "RASCUNHO",
        "PROTOCOLADA",
        "ACATADA",
        "INDEFERIDA",
      ]);

      expect(impugnacaoStatusSchema.parse("RASCUNHO")).toBe("RASCUNHO");
      expect(impugnacaoStatusSchema.parse("PROTOCOLADA")).toBe("PROTOCOLADA");
      expect(impugnacaoStatusSchema.parse("ACATADA")).toBe("ACATADA");
      expect(impugnacaoStatusSchema.parse("INDEFERIDA")).toBe("INDEFERIDA");
      expect(() => impugnacaoStatusSchema.parse("CANCELADA")).toThrow();
    });

    it("deve validar a integridade dos dados de criação de impugnação", () => {
      const payloadValido = {
        numeroEdital: "042/2026-CPL",
        orgaoNome: "Prefeitura Municipal de Goiânia",
        motivoLegal: "Exigência de atestado com marca exclusiva de software",
        dataAberturaSessao: "2026-11-10T09:00:00.000Z",
        fundamentacao:
          "O edital viola a Súmula 273 do TCU e o Art. 41, I da Lei 14.133/2021 ao vedar soluções congêneres de mercado.",
        pedidos:
          "Requer a suspensão cautelar do certame e a republicação do edital com a exclusão da cláusula 4.2.1.",
      };

      const parsed = impugnacaoCriarInputSchema.parse(payloadValido);
      expect(parsed.numeroEdital).toBe("042/2026-CPL");
      expect(parsed.status).toBe("RASCUNHO");
      expect(parsed.dataAberturaSessao).toBeInstanceOf(Date);

      // Fundamentação com menos de 10 caracteres deve falhar
      expect(() =>
        impugnacaoCriarInputSchema.parse({
          ...payloadValido,
          fundamentacao: "Curto",
        }),
      ).toThrow();
    });
  });
});
