import { describe, expect, it } from "vitest";
import {
  CATALOGO_MACRO_SEGMENTOS,
  MacroSegmentoEnum,
} from "@/server/schemas/segmentos.schema";
import {
  CODIGO_MODALIDADE_PNCP,
  normalizarModalidade,
} from "@/server/schemas/modalidades.schema";
import { classificarLicitacaoPorTexto } from "@/server/services/classificador-segmentos.service";

describe("Sprint SaaS 2 — Dicionário de Segmentos, Taxonomia e Classificador Semântico", () => {
  it("deve conter exatamente as 40 macro-categorias oficiais da árvore Conlicitação", () => {
    const segmentos = Object.keys(CATALOGO_MACRO_SEGMENTOS);
    expect(segmentos).toHaveLength(40);
    expect(MacroSegmentoEnum.options).toHaveLength(40);
    for (const code of ["SAUDE", "INFORMATICA", "ALIMENTACAO", "ENGENHARIA_SERVICOS", "TRANSPORTES_RODOVIARIOS", "LEILOES"]) {
      expect(segmentos).toContain(code);
    }
  });

  it("cada macro-categoria deve possuir subatividades com palavras-chave", () => {
    for (const macro of Object.values(CATALOGO_MACRO_SEGMENTOS)) {
      expect(macro.subcategorias.length).toBeGreaterThanOrEqual(1);
      for (const sub of macro.subcategorias) {
        expect(sub.palavrasChave.length).toBeGreaterThanOrEqual(4);
      }
    }
  });

  describe("Classificador Semântico por Texto de Objeto/Descrição", () => {
    it("deve classificar edital de antibióticos e injetáveis em SAUDE", () => {
      const resultado = classificarLicitacaoPorTexto(
        "Aquisição de medicamentos injetáveis e antibióticos para abastecimento do Hospital Municipal e Farmácia Básica",
        "Amoxicilina, dipirona comprimido, soro fisiológico e ampolas descartáveis.",
      );

      expect(resultado.macro).toBe("SAUDE");
      expect(resultado.subcategorias).toContain("2201");
      expect(resultado.score).toBeGreaterThan(0);
    });

    it("deve classificar edital de seringas e luvas descartáveis em SAUDE com subcategoria 2202", () => {
      const resultado = classificarLicitacaoPorTexto(
        "Registro de Preços para aquisição de materiais hospitalares, seringas estéreis e luvas de procedimento cirúrgico",
      );

      expect(resultado.macro).toBe("SAUDE");
      expect(resultado.subcategorias).toContain("2202");
    });

    it("deve classificar edital de pneus e câmaras de ar em TRANSPORTES_RODOVIARIOS", () => {
      const resultado = classificarLicitacaoPorTexto(
        "Contratação de empresa para fornecimento parcelado de pneus novos radiais, câmaras de ar e serviços de recapagem para frota pesada",
      );

      expect(resultado.macro).toBe("TRANSPORTES_RODOVIARIOS");
      expect(resultado.subcategorias).toContain("1705");
    });

    it("deve classificar edital de pavimentação asfáltica e drenagem em ENGENHARIA_SERVICOS", () => {
      const resultado = classificarLicitacaoPorTexto(
        "Execução de obra de engenharia de pavimentação asfáltica em CBUQ, recapeamento e drenagem pluvial urbana",
      );

      expect(resultado.macro).toBe("ENGENHARIA_SERVICOS");
      expect(resultado.subcategorias).toContain("0103");
    });

    it("deve classificar edital de merenda escolar (arroz, feijão, hortifrúti) em ALIMENTACAO", () => {
      const resultado = classificarLicitacaoPorTexto(
        "Aquisição de gêneros alimentícios e hortifrúti da agricultura familiar para atender ao Programa Nacional de Alimentação Escolar (PNAE)",
        "Arroz tipo 1, feijão carioca, leite em pó e frutas frescas.",
      );

      expect(resultado.macro).toBe("ALIMENTACAO");
      expect(resultado.subcategorias).toContain("2501");
    });

    it("deve classificar edital de notebooks, servidores e fibra óptica em INFORMATICA", () => {
      const resultado = classificarLicitacaoPorTexto(
        "Registro de preços para eventual aquisição de computadores desktop, notebooks corporativos e switch gerenciável para rede de dados",
      );

      expect(resultado.macro).toBe("INFORMATICA");
      expect(resultado.subcategorias).toContain("3102");
    });

    it("deve classificar edital de vigilância patrimonial armada em PRESTACAO_DE_SERVICOS_MAO_DE_OBRA", () => {
      const resultado = classificarLicitacaoPorTexto(
        "Contratação de serviços de vigilância armada e segurança eletrônica com monitoramento 24h para os prédios públicos",
      );

      expect(resultado.macro).toBe("PRESTACAO_DE_SERVICOS_MAO_DE_OBRA");
      expect(resultado.subcategorias).toContain("0310");
    });

    it("deve classificar edital de papel A4 e materiais escolares em ESCRITORIO_E_GRAFICA", () => {
      const resultado = classificarLicitacaoPorTexto(
        "Aquisição de material de expediente e papelaria para as secretarias municipais: papel A4, canetas esferográficas e pastas suspensas",
      );

      expect(resultado.macro).toBe("ESCRITORIO_E_GRAFICA");
      expect(resultado.subcategorias).toContain("3001");
    });

    it("deve retornar fallback quando o texto for genérico ou sem correspondência clara", () => {
      const resultado = classificarLicitacaoPorTexto(
        "Contratação de soluções diversas para atendimento de demanda administrativa",
      );

      expect(resultado.score).toBe(0);
      expect(resultado.macro).toBeDefined();
    });
  });

  describe("Normalização e Catálogo de Modalidades PNCP (Lei 14.133/2021)", () => {
    it("deve mapear Pregão Eletrônico com código 6", () => {
      const norm1 = normalizarModalidade("Pregão - Eletrônico");
      const norm2 = normalizarModalidade(6);
      expect(norm1.codigo).toBe(CODIGO_MODALIDADE_PNCP.PREGAO_ELETRONICO);
      expect(norm2.codigo).toBe(6);
      expect(norm1.nome).toBe("Pregão Eletrônico");
    });

    it("deve mapear Dispensa de Licitação com código 8", () => {
      const norm = normalizarModalidade("Dispensa de Licitação - Compra Direta Art. 75");
      expect(norm.codigo).toBe(CODIGO_MODALIDADE_PNCP.DISPENSA_LICITACAO);
      expect(norm.nome).toContain("Dispensa de Licitação");
    });

    it("deve mapear Concorrência Eletrônica com código 5", () => {
      const norm = normalizarModalidade("Concorrência Eletrônica de Obra Pública");
      expect(norm.codigo).toBe(CODIGO_MODALIDADE_PNCP.CONCORRENCIA_ELETRONICA);
      expect(norm.nome).toBe("Concorrência Eletrônica");
    });

    it("deve mapear Inexigibilidade com código 9", () => {
      const norm = normalizarModalidade("Inexigibilidade de Licitação Art. 74");
      expect(norm.codigo).toBe(CODIGO_MODALIDADE_PNCP.INEXIGIBILIDADE);
      expect(norm.nome).toBe("Inexigibilidade de Licitação");
    });

    it("deve mapear Leilão Eletrônico com código 1", () => {
      const norm = normalizarModalidade("Leilão Eletrônico para Alienação de Bens");
      expect(norm.codigo).toBe(CODIGO_MODALIDADE_PNCP.LEILAO_ELETRONICO);
      expect(norm.nome).toBe("Leilão Eletrônico");
    });
  });
});
