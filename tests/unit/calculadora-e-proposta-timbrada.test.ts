import { describe, expect, it } from "vitest";
import {
  calcularItemProposta,
  consolidarCalculadoraProposta,
  formatarMoedaBrl,
  type ItemCalculadoraInput,
} from "@/server/schemas/proposta-calculadora.schema";
import {
  gerarConteudoPropostaComercial,
  gerarPdfPropostaComercial,
} from "@/lib/proposta-comercial-pdf";

describe("Calculadora Multi-Item de Custos, BDI & Piso Seguro", () => {
  const itemExemplo: ItemCalculadoraInput = {
    id: "item_1",
    numeroItem: "01",
    descricao: "Notebook Corporativo i7 16GB SSD 512GB",
    marcaModelo: "Dell Latitude 3440",
    unidade: "UN",
    quantidade: 10,
    valorEstimadoUnitario: 5000,
    custoUnitario: 2500,
    freteUnitario: 100,
    outrosCustosUnitario: 0,
    impostosPercentual: 12,
    bdiPercentual: 25,
    margemMinimaPercentual: 10,
    margemAlvoPercentual: 20,
  };

  it("deve calcular o custo com BDI e o piso seguro unitário e total com markup por dentro", () => {
    const res = calcularItemProposta(itemExemplo);

    // Custo Total Direto = 2500 + 100 = 2600
    expect(res.custoTotalUnitario).toBe(2600);

    // Custo com BDI = 2600 * 1.25 = 3250
    expect(res.custoComBdiUnitario).toBe(3250);

    // Divisor Piso Seguro = 1 - (0.12 + 0.10) = 0.78
    // Piso Unitário = 3250 / 0.78 ≈ 4166.67
    expect(res.pisoUnitarioSeguro).toBe(4166.67);
    expect(res.pisoTotalSeguro).toBe(41666.7);

    // Divisor Proposta = 1 - (0.12 + 0.20) = 0.68
    // Proposta Unitária = 3250 / 0.68 ≈ 4779.41
    expect(res.propostaUnitaria).toBe(4779.41);
    expect(res.propostaTotal).toBe(47794.1);

    expect(res.lucroLiquidoProposta).toBeGreaterThan(0);
    expect(res.alertaInexequivel).toBe(false);
  });

  it("deve disparar alerta de inexequibilidade (Art. 59 §4º) quando o piso estiver abaixo de 50% do estimado", () => {
    const itemBaixo: ItemCalculadoraInput = {
      ...itemExemplo,
      valorEstimadoUnitario: 10000,
      custoUnitario: 1500,
      freteUnitario: 0,
      bdiPercentual: 10,
      impostosPercentual: 5,
      margemMinimaPercentual: 5,
    };

    const res = calcularItemProposta(itemBaixo);
    expect(res.pisoUnitarioSeguro).toBeLessThan(5000);
    expect(res.alertaInexequivel).toBe(true);
    expect(res.motivoAlerta).toContain("Art. 59, §4º");
  });

  it("deve consolidar múltiplos itens com soma correta de custos, piso e proposta inicial", () => {
    const item2: ItemCalculadoraInput = {
      id: "item_2",
      numeroItem: "02",
      descricao: "Mouse Óptico USB",
      marcaModelo: "Logitech M90",
      unidade: "UN",
      quantidade: 20,
      valorEstimadoUnitario: 60,
      custoUnitario: 25,
      freteUnitario: 2,
      outrosCustosUnitario: 0,
      impostosPercentual: 12,
      bdiPercentual: 20,
      margemMinimaPercentual: 10,
      margemAlvoPercentual: 20,
    };

    const consolidado = consolidarCalculadoraProposta([itemExemplo, item2]);

    expect(consolidado.totalItens).toBe(2);
    expect(consolidado.custoTotalGeral).toBeGreaterThan(0);
    expect(consolidado.pisoTotalGeral).toBeGreaterThan(consolidado.custoTotalGeral);
    expect(consolidado.propostaTotalGeral).toBeGreaterThan(consolidado.pisoTotalGeral);
    expect(consolidado.lucroLiquidoEstimadoProposta).toBeGreaterThan(0);
  });
});

describe("Geração de Conteúdo e PDF da Proposta Comercial", () => {
  const itens: ItemCalculadoraInput[] = [
    {
      id: "it_1",
      numeroItem: "01",
      descricao: "Estação de Trabalho Computacional",
      marcaModelo: "Lenovo ThinkCentre",
      unidade: "UN",
      quantidade: 5,
      valorEstimadoUnitario: 5000,
      custoUnitario: 3000,
      freteUnitario: 50,
      outrosCustosUnitario: 0,
      impostosPercentual: 10,
      bdiPercentual: 20,
      margemMinimaPercentual: 10,
      margemAlvoPercentual: 25,
    },
  ];

  it("deve gerar HTML e Texto puro no modo ITENS_CALCULADORA com declaração da Lei 14.133/2021", () => {
    const doc = gerarConteudoPropostaComercial({
      orgaoNome: "Tribunal Regional Eleitoral de Goiás",
      numeroEdital: "PE 099/2026",
      objetoLicitacao: "Aquisição de computadores corporativos",
      itens,
      configuracao: {
        modoEmissao: "ITENS_CALCULADORA",
        tipoTabelaProposta: "PROPOSTA_INICIAL",
        validadeDias: 60,
        prazoEntrega: "10 dias úteis",
        condicoesPagamento: "30 dias pós NF",
      },
      empresa: {
        razaoSocial: "TECH LICITACOES LTDA",
        cnpj: "12.345.678/0001-90",
        cidade: "Goiânia",
        uf: "GO",
        representanteNome: "Carlos Eduardo Silva",
        representanteCargo: "Diretor Comercial",
      },
    });

    expect(doc.titulo).toBe("Proposta Comercial - PE 099/2026");
    expect(doc.conteudoHtml).toContain("PROPOSTA COMERCIAL DE PREÇOS");
    expect(doc.conteudoHtml).toContain("Art. 63, §1º da Lei Federal nº 14.133/2021");
    expect(doc.conteudoHtml).toContain("Estação de Trabalho Computacional");
    expect(doc.conteudoHtml).toContain("Lenovo ThinkCentre");
    expect(doc.conteudoHtml).toContain("TECH LICITACOES LTDA");
    expect(doc.conteudoHtml).toContain("page-break-inside: avoid; break-inside: avoid;");

    expect(doc.conteudoTexto).toContain("PE 099/2026");
    expect(doc.conteudoTexto).toContain("VALOR GLOBAL TOTAL DA PROPOSTA");
  });

  it("deve alternar para Proposta Readequada ao selecionar tipoTabelaProposta === 'PROPOSTA_READEQUADA'", () => {
    const doc = gerarConteudoPropostaComercial({
      orgaoNome: "Prefeitura de Goiânia",
      numeroEdital: "PE 045/2026",
      objetoLicitacao: "Serviços e equipamentos",
      itens,
      configuracao: {
        modoEmissao: "ITENS_CALCULADORA",
        tipoTabelaProposta: "PROPOSTA_READEQUADA",
      },
      empresa: {
        razaoSocial: "TECH LICITACOES LTDA",
        cnpj: "12.345.678/0001-90",
      },
    });

    expect(doc.conteudoHtml).toContain("PROPOSTA COMERCIAL DE PREÇOS READEQUADA");
    expect(doc.conteudoTexto).toContain("PROPOSTA COMERCIAL DE PREÇOS READEQUADA");
  });

  it("deve renderizar modo VALOR_GLOBAL com Lote 01 ou Preço Global", () => {
    const doc = gerarConteudoPropostaComercial({
      orgaoNome: "Prefeitura de Anápolis",
      numeroEdital: "PE 012/2026",
      objetoLicitacao: "Lote Global de Equipamentos",
      itens,
      configuracao: {
        modoEmissao: "VALOR_GLOBAL",
        tipoAgrupamentoGlobal: "PRECO_GLOBAL",
        descricaoGlobal: "Fornecimento global de equipamentos de TI",
        valorGlobalManual: 50000,
      },
      empresa: {
        razaoSocial: "TECH LICITACOES LTDA",
        cnpj: "12.345.678/0001-90",
      },
    });

    expect(doc.conteudoHtml).toContain("Preço Global");
    expect(doc.conteudoHtml).toContain(formatarMoedaBrl(50000));
    expect(doc.conteudoTexto).toContain("AGRUPAMENTO: Preço Global");
    expect(doc.conteudoTexto).toContain(formatarMoedaBrl(50000));
  });

  it("deve incluir Dados Bancários somente quando informados", () => {
    const docComBanco = gerarConteudoPropostaComercial({
      orgaoNome: "Prefeitura",
      numeroEdital: "PE 001/2026",
      objetoLicitacao: "Objeto",
      itens,
      empresa: {
        razaoSocial: "TECH LICITACOES LTDA",
        cnpj: "12.345.678/0001-90",
        bancoNome: "Banco do Brasil",
        agencia: "1234-5",
        contaCorrente: "98765-4",
        chavePix: "12.345.678/0001-90",
      },
    });

    expect(docComBanco.conteudoHtml).toContain("Banco do Brasil");
    expect(docComBanco.conteudoHtml).toContain("1234-5");
    expect(docComBanco.conteudoTexto).toContain("Dados Bancários para Pagamento");

    const docSemBanco = gerarConteudoPropostaComercial({
      orgaoNome: "Prefeitura",
      numeroEdital: "PE 001/2026",
      objetoLicitacao: "Objeto",
      itens,
      empresa: {
        razaoSocial: "TECH LICITACOES LTDA",
        cnpj: "12.345.678/0001-90",
        bancoNome: "",
        agencia: "",
        contaCorrente: "",
        chavePix: "",
      },
    });

    expect(docSemBanco.conteudoHtml).not.toContain("Dados Bancários para Liquidação");
    expect(docSemBanco.conteudoTexto).not.toContain("Dados Bancários para Pagamento");
  });

  it("deve gerar buffer binário de PDF válido com cabeçalho %PDF- via pdf-lib", async () => {
    const { pdfBuffer, pdfNome } = await gerarPdfPropostaComercial({
      orgaoNome: "Tribunal Regional Eleitoral",
      numeroEdital: "PE 099/2026",
      objetoLicitacao: "Aquisição de Notebooks Corporativos",
      itens,
      empresa: {
        razaoSocial: "APONTA SERVICOS LTDA",
        cnpj: "12.345.678/0001-90",
        cidade: "Goiânia",
        uf: "GO",
        representanteNome: "Vítor Henrique",
        representanteCargo: "Sócio-Administrador",
      },
    });

    expect(pdfBuffer).toBeInstanceOf(Buffer);
    expect(pdfBuffer.length).toBeGreaterThan(1000);
    // Valida magic bytes de PDF
    expect(pdfBuffer.subarray(0, 4).toString("utf-8")).toBe("%PDF");
    expect(pdfNome).toContain("proposta_comercial_PE_099_2026");
  });
});
