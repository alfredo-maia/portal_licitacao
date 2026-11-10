import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  validarRegrasDisputa,
  type DisputaItemRegra,
  type ItemCalculadoraInput,
} from "@/server/schemas/proposta-calculadora.schema";
import {
  atualizarKanbanStatus,
} from "@/server/services/oportunidades.service";
import {
  insertInMemoryLicitacao,
  resetInMemoryLicitacoes,
} from "@/server/services/licitacoes-store";
import { PATCH as patchSalasRobo } from "@/app/api/robo-de-lances/salas/route";
import OportunidadesDetalhePage from "@/app/oportunidades/[id]/page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const regraBase: DisputaItemRegra = {
  itemId: "item_01",
  numeroItem: "01",
  descricao: "Notebook Corporativo i7",
  unidade: "UN",
  quantidade: 2,
  ativoNoRobo: true,
  pisoUnitarioSeguro: 160.26,
  propostaUnitaria: 183.82,
  tipoDecremento: "CENTAVOS_1",
  valorDecremento: 0.01,
  tatica: "IMEDIATO",
  statusItem: "PRONTO",
  melhorLanceSala: null,
  meuUltimoLance: null,
  minhaPosicao: null,
  observacoes: "",
};

function criarLicitacaoTesteEmMemoria() {
  resetInMemoryLicitacoes();
  return insertInMemoryLicitacao({
    idPncp: "88888888000188-1-000044/2026",
    numeroControlePNCP: "88888888000188-1-000044/2026",
    numeroEdital: "PE 044/2026",
    orgaoNome: "Prefeitura de Teste Issue 44",
    orgaoCnpj: "88.888.888/0001-88",
    uf: "SP",
    municipio: "Campinas",
    esfera: "M",
    poder: "E",
    modalidade: "Pregão Eletrônico",
    modalidadeCodigo: 6,
    portalDisputa: "Compras.gov.br",
    valorEstimado: 50000,
    dataAbertura: new Date("2026-12-10T10:00:00.000Z"),
    dataEncerramentoProposta: new Date("2026-12-10T10:00:00.000Z"),
    dataPublicacaoPncp: new Date("2026-11-01T10:00:00.000Z"),
    dataUltimaAtualizacao: new Date("2026-11-01T10:00:00.000Z"),
    miniResumo: "Aquisição de Notebooks",
    resumo: "Aquisição de Notebooks Corporativos",
    justificativaIA: null,
    tipoSistemaCodigo: "TI",
    segmentoMacro: "TI_INFORMATICA",
    subcategorias: [],
    atestadosExigidos: [],
    motivoRecusa: null,
    parecerIA: "GO",
    status: "ACEITA",
    quantidadeLotes: 1,
    loteUnico: false,
    precoPorLote: false,
    isPresencial: false,
    distanciaGoianiaKm: null,
  } as any);
}

describe("Issue #44 — Contrato validarRegrasDisputa (Piso R$ 0,00 bloqueado em CALCULADORA e MANUAL)", () => {
  it("bloqueia Piso Seguro = R$ 0,00 também no modo CALCULADORA", () => {
    const res = validarRegrasDisputa(
      [{ ...regraBase, pisoUnitarioSeguro: 0, propostaUnitaria: 180 }],
      "CALCULADORA",
    );

    expect(res.valido).toBe(false);
    expect(res.itensSemValorIds).toContain("item_01");
    expect(res.erros.some((e) => /0,00/.test(e))).toBe(true);
  });

  it("bloqueia Piso Seguro = R$ 0,00 mesmo quando o item está desmarcado no robô (ativoNoRobo = false)", () => {
    const resManual = validarRegrasDisputa(
      [{ ...regraBase, ativoNoRobo: false, pisoUnitarioSeguro: 0, propostaUnitaria: 180 }],
      "MANUAL",
    );
    expect(resManual.valido).toBe(false);
    expect(resManual.itensSemValorIds).toContain("item_01");

    const resCalc = validarRegrasDisputa(
      [{ ...regraBase, ativoNoRobo: false, pisoUnitarioSeguro: 0, propostaUnitaria: 0 }],
      "CALCULADORA",
    );
    expect(resCalc.valido).toBe(false);
    expect(resCalc.itensSemValorIds).toContain("item_01");
  });

  it("mantém errosPisoMaior separados de errosSemValor para exibição precisa", () => {
    const res = validarRegrasDisputa(
      [
        { ...regraBase, itemId: "item_01", numeroItem: "01", pisoUnitarioSeguro: 0, propostaUnitaria: 100 },
        { ...regraBase, itemId: "item_02", numeroItem: "02", pisoUnitarioSeguro: 500, propostaUnitaria: 400 },
      ],
      "MANUAL",
    );

    expect(res.valido).toBe(false);
    expect(res.itensSemValorIds).toEqual(["item_01"]);
    expect(res.itensPisoMaiorIds).toEqual(["item_02"]);
    expect((res as any).errosPisoMaior).toHaveLength(1);
    expect((res as any).errosPisoMaior[0]).toContain("#02");
  });
});

describe("Issue #44 — Bloqueio Backend para Piso Seguro R$ 0,00 ao salvar Disputa", () => {
  it("PATCH /api/robo-de-lances/salas bloqueia HTTP 400 com Piso Seguro = 0 no modo CALCULADORA ou item desmarcado", async () => {
    const criada = criarLicitacaoTesteEmMemoria();

    const resCalcZero = await patchSalasRobo(
      new Request("http://localhost:3000/api/robo-de-lances/salas?tenantId=tenant-default", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          licitacaoId: criada.id,
          disputaConfig: {
            origemPrecos: "CALCULADORA",
            statusGeral: "CONFIGURADA",
            regrasItens: [{ ...regraBase, pisoUnitarioSeguro: 0, propostaUnitaria: 0 }],
          },
        }),
      }),
    );

    expect(resCalcZero.status).toBe(400);
    const jsonCalcZero = await resCalcZero.json();
    expect(jsonCalcZero.ok).toBe(false);

    const resInativoZero = await patchSalasRobo(
      new Request("http://localhost:3000/api/robo-de-lances/salas?tenantId=tenant-default", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          licitacaoId: criada.id,
          disputaConfig: {
            origemPrecos: "MANUAL",
            statusGeral: "CONFIGURADA",
            regrasItens: [
              { ...regraBase, ativoNoRobo: false, pisoUnitarioSeguro: 0, propostaUnitaria: 150 },
            ],
          },
        }),
      }),
    );

    expect(resInativoZero.status).toBe(400);
  });

  it("atualizarKanbanStatus bloqueia Piso R$ 0,00 quando validarDisputaEstrita = true (mesmo em status CONFIGURADA), mas preserva salvamento de Proposta/Cotação sem a flag", async () => {
    const criada = criarLicitacaoTesteEmMemoria();

    // Fluxo de salvamento de Proposta Comercial (sem validarDisputaEstrita) com custos zerados na Calculadora deve continuar permitido
    const salvoProposta = await atualizarKanbanStatus(
      criada.id,
      {
        status: "ACEITA",
        valorProposta: 200,
        lanceMinimo: 0,
        calculadoraDados: {
          disputaConfig: {
            portal: "Compras.gov.br",
            origemPrecos: "CALCULADORA",
            statusGeral: "CONFIGURADA",
            pausaEmergencia: false,
            tempoRespostaSegundos: 3,
            segundosFinaisSniper: 10,
            regrasItens: [{ ...regraBase, pisoUnitarioSeguro: 0, propostaUnitaria: 200 }],
          },
        },
      },
      null,
      undefined,
      "tenant-default",
    );
    expect(salvoProposta).toBeDefined();

    // Fluxo da aba Disputa (validarDisputaEstrita = true) deve rejeitar Piso R$ 0,00 com 400
    await expect(
      atualizarKanbanStatus(
        criada.id,
        {
          status: "ACEITA",
          validarDisputaEstrita: true,
          calculadoraDados: {
            disputaConfig: {
              portal: "Compras.gov.br",
              origemPrecos: "CALCULADORA",
              statusGeral: "CONFIGURADA",
              pausaEmergencia: false,
              tempoRespostaSegundos: 3,
              segundosFinaisSniper: 10,
              regrasItens: [{ ...regraBase, pisoUnitarioSeguro: 0, propostaUnitaria: 200 }],
            },
          },
        },
        null,
        undefined,
        "tenant-default",
      ),
    ).rejects.toMatchObject({
      code: "PRECOS_DISPUTA_INVALIDOS",
      status: 400,
    });
  });
});

describe("Issue #44 — UI /oportunidades/[id] aba Disputa: Histórico discreto do Piso Calculado e Bloqueio R$ 0,00", () => {
  const originalFetch = global.fetch;
  let patchPayloads: Record<string, unknown>[] = [];

  function mockFetchComCalculadora(itemCalcInicial: ItemCalculadoraInput) {
    patchPayloads = [];
    global.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (init?.method === "PATCH" && url.includes("/api/oportunidades/opp_issue44/status")) {
        const parsed = JSON.parse(String(init.body || "{}"));
        patchPayloads.push(parsed);
        return new Response(JSON.stringify({ ok: true, oportunidade: { id: "opp_issue44", ...parsed } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.includes("/api/oportunidades/opp_issue44/notas")) {
        return new Response(JSON.stringify({ ok: true, notas: [] }), { status: 200 });
      }
      if (url.includes("/api/oportunidades/opp_issue44/analise-ia")) {
        return new Response(JSON.stringify({ ok: true, analises: [], cota: null }), { status: 200 });
      }
      if (url.includes("/api/usuarios")) {
        return new Response(JSON.stringify({ ok: true, usuarios: [] }), { status: 200 });
      }
      if (url.includes("/api/configuracoes/empresa")) {
        return new Response(
          JSON.stringify({
            ok: true,
            empresa: { razaoSocial: "Empresa Exemplo LTDA", cnpj: "12.345.678/0001-90" },
          }),
          { status: 200 },
        );
      }
      if (url.includes("/api/oportunidades/opp_issue44")) {
        return new Response(
          JSON.stringify({
            ok: true,
            oportunidade: {
              id: "opp_issue44",
              idPncp: "12345678000190-1-000044/2026",
              numeroEdital: "PE 044/2026",
              orgaoNome: "Prefeitura Teste UI",
              orgaoCnpj: "12.345.678/0001-90",
              municipio: "Campinas",
              uf: "SP",
              modalidade: "Pregão Eletrônico",
              valorEstimado: 50000,
              dataAbertura: "2026-12-10T09:00:00.000Z",
              miniResumo: "Notebooks",
              resumo: "Aquisição de Notebooks Corporativos",
              status: "ACEITA",
              isPresencial: false,
              arquivos: [],
              repositoriosSimilares: [],
              analisesIA: [],
              calculadoraDados: {
                parametrosPadrao: {
                  impostosPercentual: 12,
                  bdiPercentual: 25,
                  margemMinimaPercentual: 10,
                  margemAlvoPercentual: 20,
                },
                itens: [itemCalcInicial],
              },
            },
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
  }

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exibe Calc. original fixo abaixo do Piso Seguro e mostra alerta discreto em amarelo quando valor manual fica abaixo do calculado", async () => {
    // custo 100 + BDI 25% = 125; / (1 - (12%+10%)) = 125 / 0.78 = R$ 160,26
    mockFetchComCalculadora({
      id: "item_calc_44",
      numeroItem: "01",
      descricao: "Notebook i7 16GB",
      marcaModelo: "Dell",
      unidade: "UN",
      quantidade: 2,
      valorEstimadoUnitario: 300,
      custoUnitario: 100,
      freteUnitario: 0,
      outrosCustosUnitario: 0,
      impostosPercentual: 12,
      bdiPercentual: 25,
      margemMinimaPercentual: 10,
      margemAlvoPercentual: 20,
      valorUnitarioArrematado: null,
    });

    render(<OportunidadesDetalhePage params={{ id: "opp_issue44" }} />);
    await screen.findByTestId("dossie-header");

    fireEvent.click(screen.getByTestId("tab-disputa"));

    // No modo CALCULADORA (seletor preservado), já mostra Calc. original: R$ 160,26 sem alerta amarelo
    const calcRef = await screen.findByTestId("disputa-piso-calc-original-item_calc_44");
    expect(calcRef).toHaveTextContent(/Calc\. original:\s*R\$\s*160,26/);
    expect(screen.queryByTestId("disputa-piso-alerta-abaixo-item_calc_44")).not.toBeInTheDocument();

    // Troca seletor para MANUAL (seletor continua obrigatório para editar)
    const selectOrigem = document.getElementById("select-origem-precos-disputa") as HTMLSelectElement;
    fireEvent.change(selectOrigem, { target: { value: "MANUAL" } });

    const inputPiso = document.getElementById("disputa-piso-item_calc_44") as HTMLInputElement;
    expect(inputPiso).toBeInTheDocument();

    // Edita Piso para R$ 140,00 (< R$ 160,26): deve manter Calc. original e exibir alerta discreto
    fireEvent.focus(inputPiso);
    fireEvent.change(inputPiso, { target: { value: "140" } });
    fireEvent.blur(inputPiso);

    expect(screen.getByTestId("disputa-piso-calc-original-item_calc_44")).toHaveTextContent(
      /Calc\. original:\s*R\$\s*160,26/,
    );
    const alertaAbaixo = screen.getByTestId("disputa-piso-alerta-abaixo-item_calc_44");
    expect(alertaAbaixo).toHaveTextContent(/Abaixo do piso calculado/i);

    // Edita Piso para R$ 165,00 (>= R$ 160,26): alerta some e Calc. original permanece visível
    fireEvent.focus(inputPiso);
    fireEvent.change(inputPiso, { target: { value: "165" } });
    fireEvent.blur(inputPiso);

    expect(screen.getByTestId("disputa-piso-calc-original-item_calc_44")).toHaveTextContent(
      /Calc\. original:\s*R\$\s*160,26/,
    );
    expect(screen.queryByTestId("disputa-piso-alerta-abaixo-item_calc_44")).not.toBeInTheDocument();

    // Salvar deve enviar validarDisputaEstrita: true
    fireEvent.click(screen.getByTestId("btn-salvar-disputa-topo"));
    await waitFor(() => {
      expect(patchPayloads).toHaveLength(1);
    });
    expect(patchPayloads[0].validarDisputaEstrita).toBe(true);
  });

  it("bloqueia salvar na aba Disputa quando Piso Seguro for R$ 0,00 em modo CALCULADORA ou MANUAL (mesmo desmarcado)", async () => {
    mockFetchComCalculadora({
      id: "item_zero_44",
      numeroItem: "01",
      descricao: "Monitor 24 Full HD",
      marcaModelo: null,
      unidade: "UN",
      quantidade: 3,
      valorEstimadoUnitario: 900,
      custoUnitario: 0,
      freteUnitario: 0,
      outrosCustosUnitario: 0,
      impostosPercentual: 12,
      bdiPercentual: 25,
      margemMinimaPercentual: 10,
      margemAlvoPercentual: 20,
      valorUnitarioArrematado: null,
    });

    render(<OportunidadesDetalhePage params={{ id: "opp_issue44" }} />);
    await screen.findByTestId("dossie-header");

    fireEvent.click(screen.getByTestId("tab-disputa"));

    // Em CALCULADORA com custo = 0 (Piso R$ 0,00), não dispara alerta de "abaixo" mas bloqueia salvamento
    expect(await screen.findByTestId("disputa-piso-calc-original-item_zero_44")).toHaveTextContent(
      /Calc\. original:\s*R\$\s*0,00/,
    );
    expect(screen.queryByTestId("disputa-piso-alerta-abaixo-item_zero_44")).not.toBeInTheDocument();
    expect(screen.getByTestId("alerta-disputa-validacao")).toHaveTextContent(/0,00/);

    fireEvent.click(screen.getByTestId("btn-salvar-disputa-topo"));
    fireEvent.click(screen.getByTestId("btn-salvar-disputa-rodape"));
    expect(patchPayloads).toHaveLength(0);

    // Troca para MANUAL, informa Proposta = 500, desmarca o robô e mantém Piso = 0: ainda bloqueia
    fireEvent.change(document.getElementById("select-origem-precos-disputa") as HTMLSelectElement, {
      target: { value: "MANUAL" },
    });
    const inputProp = document.getElementById("disputa-proposta-item_zero_44") as HTMLInputElement;
    fireEvent.focus(inputProp);
    fireEvent.change(inputProp, { target: { value: "500" } });
    fireEvent.blur(inputProp);

    const checkRobo = document.getElementById("check-robo-item-item_zero_44") as HTMLInputElement;
    fireEvent.click(checkRobo);
    expect(checkRobo.checked).toBe(false);

    fireEvent.click(screen.getByTestId("btn-salvar-disputa-topo"));
    expect(patchPayloads).toHaveLength(0);

    // Informa Piso Seguro = 380 (> 0 e <= 500): erro desaparece e salvamento funciona
    const inputPiso = document.getElementById("disputa-piso-item_zero_44") as HTMLInputElement;
    fireEvent.focus(inputPiso);
    fireEvent.change(inputPiso, { target: { value: "380" } });
    fireEvent.blur(inputPiso);

    expect(screen.queryByTestId("alerta-disputa-validacao")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("btn-salvar-disputa-topo"));
    await waitFor(() => {
      expect(patchPayloads).toHaveLength(1);
    });
    expect(patchPayloads[0].lanceMinimo).toBe(1140);
  });
});

