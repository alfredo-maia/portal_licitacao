import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  normalizarUnidadeMedida,
  calcularEstatisticasPrecosHomologados,
  type HomologacaoItemPublico,
  type ItemPrecoSalvoRecord,
} from "@/server/schemas/inteligencia-precos.schema";
import {
  disputaConfigSchema,
  disputaItemRegraSchema,
  calcularItemProposta,
  consolidarCalculadoraProposta,
  type ItemCalculadoraInput,
} from "@/server/schemas/proposta-calculadora.schema";
import RoboDeLancesPage from "@/app/robo-de-lances/page";

// Mocks do Next.js
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

describe("Inteligência de Preços v2 — Normalização e Equiparação de Grandezas", () => {
  it("deve normalizar corretamente unidades sujas do PNCP preservando a sigla oficial", () => {
    expect(normalizarUnidadeMedida("QUILOGRAMA")).toBe("KG");
    expect(normalizarUnidadeMedida("Quilogramas")).toBe("KG");
    expect(normalizarUnidadeMedida("kg.")).toBe("KG");
    expect(normalizarUnidadeMedida("UNIDADE")).toBe("UN");
    expect(normalizarUnidadeMedida("und")).toBe("UN");
    expect(normalizarUnidadeMedida("peça")).toBe("UN");
    expect(normalizarUnidadeMedida("PACOTE")).toBe("PCT");
    expect(normalizarUnidadeMedida("Caixa com 100")).toBe("CX");
    expect(normalizarUnidadeMedida("litros")).toBe("L");
    expect(normalizarUnidadeMedida("METRO QUADRADO")).toBe("M2");
  });

  it("deve calcular estatísticas separadas quando unidades são equiparadas ou filtradas", () => {
    // Exemplo: Pão Francês vendido em UN e KG
    const amostras: HomologacaoItemPublico[] = [
      {
        id: "amostra-1",
        catmat: "12345",
        itemNumero: 1,
        itemDescricao: "Pão Francês 50g",
        marca: "Padaria A",
        unidade: "KG",
        unidadeOriginalAta: "QUILOGRAMA",
        quantidade: 500,
        orgaoNome: "Órgão 1",
        uf: "GO",
        modalidade: "Pregão",
        numeroProcesso: "01/2026",
        dataHomologacao: "01/10/2026",
        empresaVencedora: "Fornecedor 1",
        cnpjVencedor: "00.000.000/0001-00",
        valorEstimadoUnitario: 22.0,
        valorHomologadoUnitario: 18.0,
        descontoPercentual: 18.18,
        fonte: "PNCP_OFICIAL",
      },
      {
        id: "amostra-2",
        catmat: "12345",
        itemNumero: 2,
        itemDescricao: "Pão Francês 50g",
        marca: "Padaria B",
        unidade: "KG",
        unidadeOriginalAta: "KG",
        quantidade: 800,
        orgaoNome: "Órgão 2",
        uf: "DF",
        modalidade: "Pregão",
        numeroProcesso: "02/2026",
        dataHomologacao: "02/10/2026",
        empresaVencedora: "Fornecedor 2",
        cnpjVencedor: "11.111.111/0001-11",
        valorEstimadoUnitario: 24.0,
        valorHomologadoUnitario: 19.5,
        descontoPercentual: 18.75,
        fonte: "PNCP_OFICIAL",
      },
      {
        id: "amostra-3",
        catmat: "12345",
        itemNumero: 3,
        itemDescricao: "Pão Francês 50g avulso",
        marca: "Padaria C",
        unidade: "KG", // Equiparado pelo usuário de UN para KG (R$ 0,90 x 20 = R$ 18,00)
        unidadeOriginalAta: "UNIDADE",
        quantidade: 1000,
        orgaoNome: "Órgão 3",
        uf: "GO",
        modalidade: "Pregão",
        numeroProcesso: "03/2026",
        dataHomologacao: "03/10/2026",
        empresaVencedora: "Fornecedor 3",
        cnpjVencedor: "22.222.222/0001-22",
        valorEstimadoUnitario: 20.0,
        valorHomologadoUnitario: 18.0, // Equiparado
        valorHomologadoOriginal: 0.9,
        unidadeOriginalAntesConversao: "UN",
        editadoPeloUsuario: true,
        descontoPercentual: 10.0,
        fonte: "PNCP_OFICIAL",
      },
    ];

    const stats = calcularEstatisticasPrecosHomologados(amostras);
    expect(stats.amostrasSaneadas).toBe(3);
    expect(stats.menorPreco).toBe(18.0);
    expect(stats.maiorPreco).toBe(19.5);
    expect(stats.mediana).toBe(18.0);
    expect(stats.faixaSugeridaMin).toBeLessThanOrEqual(stats.faixaSugeridaMax);
  });
});

describe("Robô de Lances Multi-Item — Schemas e Trava Inviolável de Piso Seguro", () => {
  it("deve validar o schema de regras por item e garantir trava inviolável do piso", () => {
    const regraItem = disputaItemRegraSchema.parse({
      itemId: "item-calc-01",
      numeroItem: "01",
      descricao: "Notebook Corporativo i7 16GB SSD 512GB",
      unidade: "UN",
      quantidade: 50,
      ativoNoRobo: true,
      pisoUnitarioSeguro: 3850.5,
      propostaUnitaria: 4490.0,
      tipoDecremento: "CENTAVOS_1",
      valorDecremento: 0.01,
      tatica: "IMEDIATO",
      statusItem: "PRONTO",
    });

    expect(regraItem.ativoNoRobo).toBe(true);
    expect(regraItem.pisoUnitarioSeguro).toBe(3850.5);
    expect(regraItem.propostaUnitaria).toBe(4490.0);
    expect(regraItem.tipoDecremento).toBe("CENTAVOS_1");

    // Validação da disputa completa
    const configDisputa = disputaConfigSchema.parse({
      portal: "Compras.gov.br",
      identificadorSala: "UASG 158123 • PE 088/2026",
      statusGeral: "CONFIGURADA",
      pausaEmergencia: false,
      tempoRespostaSegundos: 3,
      segundosFinaisSniper: 10,
      regrasItens: [regraItem],
    });

    expect(configDisputa.regrasItens.length).toBe(1);
    expect(configDisputa.portal).toBe("Compras.gov.br");
  });

  it("deve calcular o piso e sincronizar com itens da calculadora preservando independência por item", () => {
    const item1: ItemCalculadoraInput = {
      id: "it-1",
      numeroItem: "01",
      descricao: "Item 01 - Material A",
      marcaModelo: "Marca X",
      unidade: "UN",
      quantidade: 10,
      valorEstimadoUnitario: 100.0,
      custoUnitario: 50.0,
      freteUnitario: 5.0,
      outrosCustosUnitario: 0,
      impostosPercentual: 12,
      bdiPercentual: 20,
      margemMinimaPercentual: 10,
      margemAlvoPercentual: 25,
      valorUnitarioArrematado: null,
    };

    const item2: ItemCalculadoraInput = {
      id: "it-2",
      numeroItem: "02",
      descricao: "Item 02 - Material B",
      marcaModelo: "Marca Y",
      unidade: "KG",
      quantidade: 100,
      valorEstimadoUnitario: 50.0,
      custoUnitario: 20.0,
      freteUnitario: 2.0,
      outrosCustosUnitario: 0,
      impostosPercentual: 12,
      bdiPercentual: 20,
      margemMinimaPercentual: 10,
      margemAlvoPercentual: 25,
      valorUnitarioArrematado: null,
    };

    const consolidado = consolidarCalculadoraProposta([item1, item2], {
      modoEmissao: "ITENS_CALCULADORA",
      tipoTabelaProposta: "PROPOSTA_INICIAL",
      tipoAgrupamentoGlobal: "LOTE_01",
      tituloGlobalCustomizado: "Lote 01",
      descricaoGlobal: "",
      valorGlobalManual: null,
      validadeDias: 60,
      prazoEntrega: "15 dias",
      condicoesPagamento: "30 dias",
      garantiaObservacoes: "Garantia legal",
      dadosBancariosPersonalizados: null,
      dataEmissao: "2026-11-07",
    });

    expect(consolidado.itens.length).toBe(2);
    expect(consolidado.itens[0].pisoUnitarioSeguro).toBeGreaterThan(50);
    expect(consolidado.itens[1].pisoUnitarioSeguro).toBeGreaterThan(20);
    expect(consolidado.pisoTotalGeral).toBe(
      consolidado.itens[0].pisoTotalSeguro + consolidado.itens[1].pisoTotalSeguro,
    );
  });
});

describe("Página /robo-de-lances — Painel Central Conectado ao Tenant", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string) => {
        if (url.includes("/api/robo-de-lances/salas")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              ok: true,
              activeTenantId: "tenant-teste",
              totalSalas: 1,
              salas: [
                {
                  id: "lic-123",
                  titulo: "Pregão Eletrônico 088/2026",
                  orgao: "Tribunal Regional Eleitoral de Goiás",
                  uf: "GO",
                  numeroEdital: "PE 088/2026",
                  portal: "Compras.gov.br",
                  identificadorSala: "UASG 070001",
                  statusGeral: "EM_DISPUTA",
                  pausaEmergencia: false,
                  tempoRespostaSegundos: 3,
                  segundosFinaisSniper: 10,
                  totalItens: 4,
                  itensAtivosNoRobo: 4,
                  pisoSeguroTotal: 154000.0,
                  propostaInicialTotal: 198000.0,
                  regrasItens: [],
                  statusKanban: "EM_DISPUTA",
                },
              ],
            }),
          });
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      }),
    );
  });

  it("deve carregar as salas reais de disputa do tenant ativo e exibir métricas e ações de pausa", async () => {
    render(<RoboDeLancesPage />);

    expect(
      screen.getByRole("heading", { name: /Painel Central de Disputas em Tempo Real/i }),
    ).toBeInTheDocument();

    // Aguarda carregar as salas do tenant
    await screen.findByText("PE 088/2026");
    expect(screen.getByText("Tribunal Regional Eleitoral de Goiás (GO)")).toBeInTheDocument();
    expect(screen.getByText(/4 de 4 item\(ns\)/i)).toBeInTheDocument();
    expect(screen.getByText("Compras.gov.br")).toBeInTheDocument();

    // Botão Abrir Sala presente
    expect(screen.getByRole("button", { name: /Abrir Sala/i })).toBeInTheDocument();
  });
});

