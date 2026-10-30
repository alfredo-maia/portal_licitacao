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
  it("deve conter exatamente os 7 Macro-Segmentos oficiais na taxonomia", () => {
    const segmentos = Object.keys(CATALOGO_MACRO_SEGMENTOS);
    expect(segmentos).toHaveLength(7);
    expect(segmentos).toContain("SAUDE_MEDICAMENTOS_HOSPITALAR");
    expect(segmentos).toContain("AUTOMOTIVO_PECAS_FROTAS");
    expect(segmentos).toContain("OBRAS_CONSTRUCAO_MANUTENCAO");
    expect(segmentos).toContain("ALIMENTOS_MERENDA_ESCOLAR");
    expect(segmentos).toContain("TECNOLOGIA_TELECOM");
    expect(segmentos).toContain("SERVICOS_TERCEIRIZADOS_OPERACIONAIS");
    expect(segmentos).toContain("MATERIAIS_ESCRITORIO_SUPRIMENTOS");
  });

  it("cada macro-segmento deve possuir ao menos 4 subcategorias essenciais com palavras-chave", () => {
    for (const macro of Object.values(CATALOGO_MACRO_SEGMENTOS)) {
      expect(macro.subcategorias.length).toBeGreaterThanOrEqual(4);
      for (const sub of macro.subcategorias) {
        expect(sub.palavrasChave.length).toBeGreaterThanOrEqual(5);
      }
    }
  });

  describe("Classificador Semântico por Texto de Objeto/Descrição", () => {
    it("deve classificar edital de antibióticos e injetáveis em SAUDE_MEDICAMENTOS_HOSPITALAR", () => {
      const resultado = classificarLicitacaoPorTexto(
        "Aquisição de medicamentos injetáveis e antibióticos para abastecimento do Hospital Municipal e Farmácia Básica",
        "Amoxicilina, dipirona comprimido, soro fisiológico e ampolas descartáveis.",
      );

      expect(resultado.macro).toBe("SAUDE_MEDICAMENTOS_HOSPITALAR");
      expect(resultado.subcategorias).toContain("MEDICAMENTOS_FARMACOS");
      expect(resultado.score).toBeGreaterThan(0);
    });

    it("deve classificar edital de seringas e luvas descartáveis em SAUDE_MEDICAMENTOS_HOSPITALAR com subcategoria MATERIAIS_HOSPITALARES_DESCARTAVEIS", () => {
      const resultado = classificarLicitacaoPorTexto(
        "Registro de Preços para aquisição de materiais hospitalares, seringas estéreis e luvas de procedimento cirúrgico",
      );

      expect(resultado.macro).toBe("SAUDE_MEDICAMENTOS_HOSPITALAR");
      expect(resultado.subcategorias).toContain("MATERIAIS_HOSPITALARES_DESCARTAVEIS");
    });

    it("deve classificar edital de pneus e câmaras de ar em AUTOMOTIVO_PECAS_FROTAS", () => {
      const resultado = classificarLicitacaoPorTexto(
        "Contratação de empresa para fornecimento parcelado de pneus novos radiais, câmaras de ar e serviços de recapagem para frota pesada",
      );

      expect(resultado.macro).toBe("AUTOMOTIVO_PECAS_FROTAS");
      expect(resultado.subcategorias).toContain("PNEUS_CAMARAS_RECAPAGEM");
    });

    it("deve classificar edital de pavimentação asfáltica e drenagem em OBRAS_CONSTRUCAO_MANUTENCAO", () => {
      const resultado = classificarLicitacaoPorTexto(
        "Execução de obra de engenharia de pavimentação asfáltica em CBUQ, recapeamento e drenagem pluvial urbana",
      );

      expect(resultado.macro).toBe("OBRAS_CONSTRUCAO_MANUTENCAO");
      expect(resultado.subcategorias).toContain("OBRAS_ENGENHARIA_PAVIMENTACAO");
    });

    it("deve classificar edital de merenda escolar (arroz, feijão, hortifrúti) em ALIMENTOS_MERENDA_ESCOLAR", () => {
      const resultado = classificarLicitacaoPorTexto(
        "Aquisição de gêneros alimentícios e hortifrúti da agricultura familiar para atender ao Programa Nacional de Alimentação Escolar (PNAE)",
        "Arroz tipo 1, feijão carioca, leite em pó e frutas frescas.",
      );

      expect(resultado.macro).toBe("ALIMENTOS_MERENDA_ESCOLAR");
      expect(resultado.subcategorias).toContain("GENEROS_NAO_PERECIVEIS");
    });

    it("deve classificar edital de notebooks, servidores e fibra óptica em TECNOLOGIA_TELECOM", () => {
      const resultado = classificarLicitacaoPorTexto(
        "Registro de preços para eventual aquisição de computadores desktop, notebooks corporativos e switch gerenciável para rede de dados",
      );

      expect(resultado.macro).toBe("TECNOLOGIA_TELECOM");
      expect(resultado.subcategorias).toContain("EQUIPAMENTOS_HARDWARE");
    });

    it("deve classificar edital de vigilância patrimonial armada em SERVICOS_TERCEIRIZADOS_OPERACIONAIS", () => {
      const resultado = classificarLicitacaoPorTexto(
        "Contratação de serviços de vigilância armada e segurança eletrônica com monitoramento 24h para os prédios públicos",
      );

      expect(resultado.macro).toBe("SERVICOS_TERCEIRIZADOS_OPERACIONAIS");
      expect(resultado.subcategorias).toContain("VIGILANCIA_SEGURANCA_ELETRONICA");
    });

    it("deve classificar edital de papel A4 e materiais escolares em MATERIAIS_ESCRITORIO_SUPRIMENTOS", () => {
      const resultado = classificarLicitacaoPorTexto(
        "Aquisição de material de expediente e papelaria para as secretarias municipais: papel A4, canetas esferográficas e pastas suspensas",
      );

      expect(resultado.macro).toBe("MATERIAIS_ESCRITORIO_SUPRIMENTOS");
      expect(resultado.subcategorias).toContain("PAPELARIA_MATERIAL_ESCOLAR");
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
