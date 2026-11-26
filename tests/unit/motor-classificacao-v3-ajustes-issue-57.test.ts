import { describe, expect, it } from "vitest";
import { sintetizarMiniResumo } from "@/lib/resumo-licitacao";
import { classificarLicitacaoPorTexto } from "@/server/services/classificador-segmentos.service";

describe("Issue #57 — Ajustes pós-ingestão: leilões/alienações, títulos burocráticos e segurança patrimonial", () => {
  it("classifica alienações de imóveis, glebas e bens inservíveis em LEILOES (nunca em OUTROS)", () => {
    const gleba = classificarLicitacaoPorTexto(
      "Constitui objeto do presente processo licitatório a alienação de uma gleba de terras urbana de propriedade do município",
    );
    expect(gleba.macro).toBe("LEILOES");
    expect(gleba.subcategorias).toContain("3702");

    const moveis = classificarLicitacaoPorTexto(
      "Alienação de bens móveis inservíveis pertencentes ao patrimônio da Prefeitura",
    );
    expect(moveis.macro).toBe("LEILOES");
    expect(moveis.subcategorias).toContain("3708");

    const imovel = classificarLicitacaoPorTexto(
      "Alienação no estado em que se encontra de imóvel situado na Rua das Flores",
    );
    expect(imovel.macro).toBe("LEILOES");
    expect(imovel.subcategorias).toContain("3702");
  });

  it("não inicia títulos com preâmbulos burocráticos como 'Constitui Objeto do Presente Processo Licitatório'", () => {
    const titulo = sintetizarMiniResumo(
      "Constitui objeto do presente processo licitatório a alienação de uma gleba de terras urbana de propriedade do município",
    );
    expect(titulo.toLowerCase()).not.toContain("constitui");
    expect(titulo.toLowerCase()).not.toContain("presente processo");
    expect(titulo.toLowerCase()).toContain("alienação");

    const titulo2 = sintetizarMiniResumo(
      "Aviso de Leilão nº 001/2026. Constitui objeto do presente edital a venda de bens móveis inservíveis",
    );
    expect(titulo2.toLowerCase()).not.toContain("constitui");
  });

  it("classifica segurança não armada / portaria em PRESTACAO_DE_SERVICOS_MAO_DE_OBRA (0310), não em INFORMATICA", () => {
    const res = classificarLicitacaoPorTexto(
      "Registro de preços para possível prestação de serviços de segurança não armada, destinados ao controle de acesso e portaria das unidades municipais",
    );
    expect(res.macro).toBe("PRESTACAO_DE_SERVICOS_MAO_DE_OBRA");
    expect(res.subcategorias).toContain("0310");
  });

  it("mantém controle de acesso eletrônico (catraca/biometria) em INFORMATICA", () => {
    const res = classificarLicitacaoPorTexto(
      "Aquisição e implantação de relógio de ponto eletrônico biométrico e controle de acesso por catraca",
    );
    expect(res.macro).toBe("INFORMATICA");
    expect(res.subcategorias).toContain("3106");
  });
});
