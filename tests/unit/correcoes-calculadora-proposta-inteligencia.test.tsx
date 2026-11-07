import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  CALCULADORA_TOOLTIPS,
  calcularItemProposta,
  consolidarCalculadoraProposta,
  type ItemCalculadoraInput,
} from "@/server/schemas/proposta-calculadora.schema";
import {
  gerarConteudoPropostaComercial,
  gerarPdfPropostaComercial,
} from "@/lib/proposta-comercial-pdf";
import {
  calcularEstatisticasPrecosHomologados,
  type HomologacaoItemPublico,
} from "@/server/schemas/inteligencia-precos.schema";
import {
  excluirItemPrecoSalvo,
  listarItensPrecosSalvos,
  pesquisarInteligenciaPrecos,
  salvarItemPrecoTenant,
} from "@/server/services/inteligencia-precos.service";
import InteligenciaPrecosPage from "@/app/inteligencia-precos/page";

describe("Calculadora — Tooltips Explicativos (BDI com Energia, Água e Aluguel) e Validações", () => {
  const itemBase: ItemCalculadoraInput = {
    id: "item-calc-1",
    numeroItem: "01",
    descricao: "Servidor Rack 2U Xeon",
    marcaModelo: "Dell PowerEdge R550",
    unidade: "UN",
    quantidade: 2,
    valorEstimadoUnitario: 35000,
    custoUnitario: 20000,
    freteUnitario: 500,
    outrosCustosUnitario: 500,
    impostosPercentual: 12,
    bdiPercentual: 10,
    margemMinimaPercentual: 8,
    margemAlvoPercentual: 18,
  };

  it("deve incluir aluguel, energia elétrica e água na explicação e exemplo do BDI / Desp. Indiretas (%)", () => {
    const bdiInfo = CALCULADORA_TOOLTIPS.bdiPercentual;
    expect(bdiInfo).toContain("BDI");
    expect(bdiInfo.toLowerCase()).toContain("aluguel");
    expect(bdiInfo.toLowerCase()).toContain("energia elétrica");
    expect(bdiInfo.toLowerCase()).toContain("água");
    expect(bdiInfo).toContain("Exemplo:");

    // Todos os 12 campos devem ter explicação e exemplo preenchidos
    const chaves = Object.keys(CALCULADORA_TOOLTIPS) as (keyof typeof CALCULADORA_TOOLTIPS)[];
    expect(chaves.length).toBeGreaterThanOrEqual(11);
    for (const chave of chaves) {
      expect(CALCULADORA_TOOLTIPS[chave].length).toBeGreaterThan(30);
      expect(CALCULADORA_TOOLTIPS[chave]).toContain("Exemplo:");
    }
  });

  it("deve respeitar valorUnitarioArrematado customizado na Proposta Readequada e fazer fallback ao piso seguro", () => {
    const semArremate = calcularItemProposta(itemBase);
    expect(semArremate.valorUnitarioReadequado).toBe(semArremate.pisoUnitarioSeguro);
    expect(semArremate.valorTotalReadequado).toBe(semArremate.pisoTotalSeguro);

    const comArremate = calcularItemProposta({
      ...itemBase,
      valorUnitarioArrematado: 29450.5,
    });
    expect(comArremate.valorUnitarioReadequado).toBe(29450.5);
    expect(comArremate.valorTotalReadequado).toBe(58901);

    const consolidado = consolidarCalculadoraProposta([
      { ...itemBase, valorUnitarioArrematado: 29450.5 },
    ]);
    expect(consolidado.readequadaTotalGeral).toBe(58901);
    expect(consolidado.custoComBdiTotalGeral).toBeGreaterThan(consolidado.custoTotalGeral);
    expect(consolidado.lucroLiquidoEstimadoPiso).toBeGreaterThan(0);
  });

  it("deve sinalizar alertas matemáticos (margem invertida, proposta acima do estimado e soma >= 95%)", () => {
    const invertida = calcularItemProposta({
      ...itemBase,
      margemMinimaPercentual: 22,
      margemAlvoPercentual: 15,
    });
    expect(invertida.alertaMargemInvertida).toBe(true);

    const acimaEstimado = calcularItemProposta({
      ...itemBase,
      valorEstimadoUnitario: 25000,
    });
    expect(acimaEstimado.alertaAcimaEstimado).toBe(true);

    const somaInvalida = calcularItemProposta({
      ...itemBase,
      impostosPercentual: 50,
      margemAlvoPercentual: 46,
    });
    expect(somaInvalida.alertaSomaPercentualInvalida).toBe(true);
  });
});

describe("Proposta Comercial — Objeto Preenchido no Anexo 1 e Valores Arrematados Readequados", () => {
  const itensReadequados: ItemCalculadoraInput[] = [
    {
      id: "it-read-1",
      numeroItem: "01",
      descricao: "Switch Gerenciável 24 Portas Gigabit PoE+",
      marcaModelo: "Cisco CBS350",
      unidade: "UN",
      quantidade: 4,
      valorEstimadoUnitario: 4500,
      custoUnitario: 2400,
      freteUnitario: 100,
      outrosCustosUnitario: 0,
      impostosPercentual: 12,
      bdiPercentual: 10,
      margemMinimaPercentual: 8,
      margemAlvoPercentual: 18,
      valorUnitarioArrematado: 3650,
    },
  ];

  it("deve exibir o Objeto preenchido no Anexo 1 e aplicar o valorUnitarioArrematado na PROPOSTA_READEQUADA", async () => {
    const objetoTexto =
      "Aquisição de equipamentos ativos de rede (Switches PoE+) para modernização de infraestrutura.";

    const doc = gerarConteudoPropostaComercial({
      orgaoNome: "SECRETARIA DE ESTADO DE INFRAESTRUTURA E MOBILIDADE (SIE)",
      numeroEdital: "PE 145/2026",
      objetoLicitacao: objetoTexto,
      itens: itensReadequados,
      configuracao: {
        modoEmissao: "ITENS_CALCULADORA",
        tipoTabelaProposta: "PROPOSTA_READEQUADA",
        validadeDias: 90,
        prazoEntrega: "Até 20 dias corridos",
        garantiaObservacoes: "12 meses",
      },
      empresa: {
        razaoSocial: "TESTE NOVA 04 LTDA",
        cnpj: "91.205.461/0001-56",
        cidade: "Goiânia",
        uf: "GO",
      },
    });

    expect(doc.conteudoHtml).toContain(objetoTexto);
    expect(doc.conteudoHtml).toContain("90 (noventa) dias");
    expect(doc.conteudoTexto).toContain(`Objeto: ${objetoTexto}`);
    expect(doc.valorTotalFormatado).toContain("14.600,00"); // 4 * 3650
    expect(doc.conteudoHtml.toUpperCase()).toContain("READEQUADA");

    const pdf = await gerarPdfPropostaComercial({
      orgaoNome: "SECRETARIA DE ESTADO DE INFRAESTRUTURA E MOBILIDADE (SIE)",
      numeroEdital: "PE 145/2026",
      objetoLicitacao: objetoTexto,
      itens: itensReadequados,
      configuracao: {
        modoEmissao: "ITENS_CALCULADORA",
        tipoTabelaProposta: "PROPOSTA_READEQUADA",
      },
      empresa: {
        razaoSocial: "TESTE NOVA 04 LTDA",
        cnpj: "91.205.461/0001-56",
      },
    });
    expect(pdf.pdfBuffer.length).toBeGreaterThan(500);
  });
});

describe("Inteligência de Preços — Estatísticas Saneadas e Base Multi-Tenant de Itens Salvos", () => {
  const amostrasComOutlier: HomologacaoItemPublico[] = [
    {
      id: "h-1",
      catmat: "452109",
      itemNumero: 1,
      itemDescricao: "iPhone 16 128GB 5G Tela 6.1 OLED",
      marca: "Apple",
      modelo: "iPhone 16 128GB",
      informacaoComplementar: null,
      unidade: "UN",
      quantidade: 10,
      orgaoNome: "Órgão A",
      orgaoCnpj: "00.000.000/0001-00",
      uf: "GO",
      municipio: "Goiânia",
      modalidade: "Pregão Eletrônico",
      numeroProcesso: "PE 01/2026",
      dataHomologacao: "01/10/2026",
      empresaVencedora: "Fornecedor A",
      cnpjVencedor: "11.111.111/0001-11",
      porteFornecedor: "EPP",
      tipoBeneficio: null,
      valorEstimadoUnitario: 6200,
      valorHomologadoUnitario: 5400,
      valorTotalHomologado: 54000,
      descontoPercentual: 12.9,
      linkPncp: "https://pncp.gov.br",
      fonte: "PNCP_OFICIAL",
    },
    {
      id: "h-2",
      catmat: "452109",
      itemNumero: 1,
      itemDescricao: "iPhone 16 128GB Preto",
      marca: "Apple",
      modelo: "A3287",
      informacaoComplementar: null,
      unidade: "UN",
      quantidade: 5,
      orgaoNome: "Órgão B",
      orgaoCnpj: "00.000.000/0001-00",
      uf: "SP",
      municipio: "São Paulo",
      modalidade: "Pregão Eletrônico",
      numeroProcesso: "PE 02/2026",
      dataHomologacao: "05/10/2026",
      empresaVencedora: "Fornecedor B",
      cnpjVencedor: "22.222.222/0001-22",
      porteFornecedor: "Demais",
      tipoBeneficio: null,
      valorEstimadoUnitario: 6000,
      valorHomologadoUnitario: 5200,
      valorTotalHomologado: 26000,
      descontoPercentual: 13.33,
      linkPncp: "https://pncp.gov.br",
      fonte: "PNCP_OFICIAL",
    },
    {
      id: "h-3",
      catmat: "452109",
      itemNumero: 1,
      itemDescricao: "Smartphone Apple iPhone 16 128GB",
      marca: "Apple",
      modelo: "128GB",
      informacaoComplementar: null,
      unidade: "UN",
      quantidade: 8,
      orgaoNome: "Órgão C",
      orgaoCnpj: "00.000.000/0001-00",
      uf: "DF",
      municipio: "Brasília",
      modalidade: "Pregão Eletrônico",
      numeroProcesso: "PE 03/2026",
      dataHomologacao: "10/10/2026",
      empresaVencedora: "Fornecedor C",
      cnpjVencedor: "33.333.333/0001-33",
      porteFornecedor: "ME",
      tipoBeneficio: null,
      valorEstimadoUnitario: 6100,
      valorHomologadoUnitario: 5300,
      valorTotalHomologado: 42400,
      descontoPercentual: 13.11,
      linkPncp: "https://pncp.gov.br",
      fonte: "PNCP_OFICIAL",
    },
    {
      id: "h-outlier-pelicula",
      catmat: "999999",
      itemNumero: 9,
      itemDescricao: "Película de Vidro para iPhone 16",
      marca: "Genérica",
      modelo: null,
      informacaoComplementar: null,
      unidade: "UN",
      quantidade: 50,
      orgaoNome: "Órgão D",
      orgaoCnpj: "00.000.000/0001-00",
      uf: "MG",
      municipio: "BH",
      modalidade: "Dispensa",
      numeroProcesso: "DE 04/2026",
      dataHomologacao: "12/10/2026",
      empresaVencedora: "Fornecedor D",
      cnpjVencedor: "44.444.444/0001-44",
      porteFornecedor: "ME",
      tipoBeneficio: null,
      valorEstimadoUnitario: 40,
      valorHomologadoUnitario: 25, // Outlier extremo (< 30% da mediana)
      valorTotalHomologado: 1250,
      descontoPercentual: 37.5,
      linkPncp: "https://pncp.gov.br",
      fonte: "PNCP_OFICIAL",
    },
  ];

  it("deve descartar outliers extremos (acessórios baratos) na Média Saneada e calcular Mediana e Faixa Competitiva", () => {
    const stats = calcularEstatisticasPrecosHomologados(amostrasComOutlier);
    expect(stats.totalAmostras).toBe(4);
    expect(stats.outliersDescartados).toBe(1);
    expect(stats.amostrasSaneadas).toBe(3);
    expect(stats.precoMedio).toBe(5300);
    expect(stats.mediana).toBe(5300);
    expect(stats.menorPreco).toBe(5200);
    expect(stats.maiorPreco).toBe(5400);
    expect(stats.faixaSugeridaMin).toBeGreaterThanOrEqual(5000);
    expect(stats.faixaSugeridaMax).toBeLessThanOrEqual(5300);
  });

  it("deve pesquisar, salvar, filtrar por nome/marca/CATMAT e isolar itens salvos por tenant", async () => {
    const busca = await pesquisarInteligenciaPrecos({
      q: "Notebook i7",
      periodoMeses: 12,
      limite: 20,
    });
    expect(busca.itens.length).toBeGreaterThan(0);
    expect(busca.estatisticas.precoMedio).toBeGreaterThan(0);

    const tenantA = `tenant-teste-a-${Date.now()}`;
    const tenantB = `tenant-teste-b-${Date.now()}`;

    const salvoA = await salvarItemPrecoTenant(tenantA, {
      nomeProduto: "iPhone 16 Corporativo 128GB",
      termoPesquisado: "iPhone 16 128GB",
      marcaReferencia: "Apple A3287",
      catmat: "452109",
      observacoes: "Referência diretoria",
      homologacoes: amostrasComOutlier.slice(0, 3),
    });

    expect(salvoA.id).toBeTruthy();
    expect(salvoA.precoMedio).toBe(5300);

    // Tenant B não pode enxergar nem excluir item do Tenant A
    const listaB = await listarItensPrecosSalvos(tenantB);
    expect(listaB.some((x) => x.id === salvoA.id)).toBe(false);
    const tentouExcluirOutroTenant = await excluirItemPrecoSalvo(tenantB, salvoA.id);
    expect(tentouExcluirOutroTenant).toBe(false);

    // Tenant A encontra por nome e por marca/CATMAT
    const buscaPorMarca = await listarItensPrecosSalvos(tenantA, "A3287");
    expect(buscaPorMarca.length).toBe(1);
    expect(buscaPorMarca[0]?.nomeProduto).toBe("iPhone 16 Corporativo 128GB");

    const excluiuProprio = await excluirItemPrecoSalvo(tenantA, salvoA.id);
    expect(excluiuProprio).toBe(true);
  });
});

describe("Página /inteligencia-precos — Abas, Faixa Competitiva e Modais de Detalhes", () => {
  it("deve renderizar as abas, a Faixa de Lance Competitivo Sugerida e abrir o modal de detalhes ao clicar na linha", () => {
    render(<InteligenciaPrecosPage />);

    expect(
      screen.getByRole("heading", { name: /Inteligência de Preços Homologados/i }),
    ).toBeInTheDocument();

    expect(screen.getByRole("tab", { name: /Pesquisar no Banco Público/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Meus Itens Salvos/i })).toBeInTheDocument();
    expect(
      screen.getByText(/Faixa de Lance Competitivo Sugerida para/i),
    ).toBeInTheDocument();

    // Clicar em uma linha abre o modal de detalhes da homologação com marca e modelo
    const celulaOrgao = screen.getByText("Tribunal Regional Eleitoral de Goiás");
    fireEvent.click(celulaOrgao);

    expect(
      screen.getByText(/Especificação Técnica Completa do Item/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Marca: Dell/i)).toBeInTheDocument();

    // Botão de Salvar Item abre o modal de salvamento
    const btnSalvar = screen.getByRole("button", { name: /Salvar Item na Minha Base/i });
    fireEvent.click(btnSalvar);
    expect(
      screen.getByText(/Salvar Item na Base de Inteligência de Preços/i),
    ).toBeInTheDocument();
  });
});
