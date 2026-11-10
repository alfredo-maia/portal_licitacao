import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  criarEstadoSimulacao,
  executarTickSimulacao,
  injetarLanceRival,
  simularLanceConcorrente,
} from "@/lib/robo-lances-engine";
import { SalaSimuladaModal } from "@/components/robo-lances/sala-simulada-modal";
import type {
  DisputaItemRegra,
  ItemCalculadoraInput,
} from "@/server/schemas/proposta-calculadora.schema";
import OportunidadesDetalhePage from "@/app/oportunidades/[id]/page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const itemCalcBase: ItemCalculadoraInput = {
  id: "item_calc_45",
  numeroItem: "01",
  descricao: "Notebook Corporativo i7",
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
};

const regraItemBase: DisputaItemRegra = {
  itemId: "item_calc_45",
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

describe("Issue #45 — Aba Disputa: Regras de Decremento, Massa, Status e Homologação", () => {
  const originalFetch = global.fetch;
  let patchPayloads: Record<string, unknown>[] = [];

  function mockOportunidadeFetch(statusInicial = "ACEITA", statusGeralDisputa = "CONFIGURADA") {
    patchPayloads = [];
    global.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (init?.method === "PATCH" && url.includes("/api/oportunidades/opp_issue45/status")) {
        const parsed = JSON.parse(String(init.body || "{}"));
        patchPayloads.push(parsed);
        return new Response(
          JSON.stringify({ ok: true, oportunidade: { id: "opp_issue45", ...parsed } }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/api/oportunidades/opp_issue45/notas")) {
        return new Response(JSON.stringify({ ok: true, notas: [] }), { status: 200 });
      }
      if (url.includes("/api/oportunidades/opp_issue45/analise-ia")) {
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
      if (url.includes("/api/oportunidades/opp_issue45")) {
        return new Response(
          JSON.stringify({
            ok: true,
            oportunidade: {
              id: "opp_issue45",
              idPncp: "12345678000190-1-000045/2026",
              numeroEdital: "PE 045/2026",
              orgaoNome: "Prefeitura Teste Issue 45",
              orgaoCnpj: "12.345.678/0001-90",
              municipio: "Campinas",
              uf: "SP",
              modalidade: "Pregão Eletrônico",
              valorEstimado: 50000,
              dataAbertura: "2026-12-10T09:00:00.000Z",
              miniResumo: "Notebooks",
              resumo: "Aquisição de Notebooks Corporativos",
              status: statusInicial,
              valorProposta: 367.64,
              lanceMinimo: 320.52,
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
                itens: [itemCalcBase],
                disputaConfig: {
                  portal: "Compras.gov.br",
                  identificadorSala: "PE 045/2026",
                  modoDisputaEdital: "FECHADO_ABERTO",
                  intervaloMinimoLances: "R$ 0,01",
                  origemPrecos: "CALCULADORA",
                  statusGeral: statusGeralDisputa,
                  pausaEmergencia: false,
                  tempoRespostaSegundos: 3,
                  segundosFinaisSniper: 10,
                  regrasItens: [regraItemBase],
                },
              },
            },
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("aceita vírgula brasileira e decimais no campo individual de decremento da linha sem zerar ou truncar", async () => {
    mockOportunidadeFetch();
    render(<OportunidadesDetalhePage params={{ id: "opp_issue45" }} />);
    await screen.findByTestId("dossie-header");

    fireEvent.click(screen.getByTestId("tab-disputa"));
    const calcOriginal = await screen.findByTestId("disputa-piso-calc-original-item_calc_45");
    const row = calcOriginal.closest("tr")!;
    const selectTipo = row.querySelectorAll("select")[0] as HTMLSelectElement;

    // Muda de R$ 0,01 para % Desc: deve inicializar valor coerente (> 0.01) e permitir digitar "0,5"
    fireEvent.change(selectTipo, { target: { value: "PERCENTUAL" } });

    const inputDec = selectTipo.parentElement!.querySelector("input") as HTMLInputElement;
    expect(inputDec).toBeInTheDocument();
    expect(Number.parseFloat(inputDec.value)).toBeGreaterThan(0.01);

    fireEvent.focus(inputDec);
    fireEvent.change(inputDec, { target: { value: "0,5" } });
    fireEvent.blur(inputDec);

    fireEvent.click(screen.getByTestId("btn-salvar-disputa-topo"));
    await waitFor(() => {
      expect(patchPayloads).toHaveLength(1);
    });
    const regraSalva = (patchPayloads[0].calculadoraDados as any).disputaConfig.regrasItens[0];
    expect(regraSalva.tipoDecremento).toBe("PERCENTUAL");
    expect(regraSalva.valorDecremento).toBe(0.5);

    // Também deve aceitar "10,50" sem truncar para 10
    fireEvent.change(selectTipo, { target: { value: "FIXO_REAIS" } });
    fireEvent.focus(inputDec);
    fireEvent.change(inputDec, { target: { value: "10,50" } });
    fireEvent.blur(inputDec);

    fireEvent.click(screen.getByTestId("btn-salvar-disputa-topo"));
    await waitFor(() => {
      expect(patchPayloads).toHaveLength(2);
    });
    const regraFixo = (patchPayloads[1].calculadoraDados as any).disputaConfig.regrasItens[0];
    expect(regraFixo.tipoDecremento).toBe("FIXO_REAIS");
    expect(regraFixo.valorDecremento).toBe(10.5);
  });

  it("interpreta corretamente ponto e vírgula em 'Aplicar Regras de Disputa em Massa' (ex.: 0.5%, 10.50)", async () => {
    mockOportunidadeFetch();
    render(<OportunidadesDetalhePage params={{ id: "opp_issue45" }} />);
    await screen.findByTestId("dossie-header");

    fireEvent.click(screen.getByTestId("tab-disputa"));
    await screen.findByTestId("disputa-piso-calc-original-item_calc_45");

    const selectMassaTipo = document.getElementById("select-massa-tipo-decremento") as HTMLSelectElement;
    const inputMassaValor = document.getElementById("input-massa-valor-decremento") as HTMLInputElement;
    const selectMassaTatica = document.getElementById("select-massa-tatica") as HTMLSelectElement;
    const btnAplicarTodos = screen.getByRole("button", { name: /Aplicar a Todos/i });

    // Caso 1: PERCENTUAL com "0.5" (ponto decimal) -> deve resultar em 0.5, NÃO 5
    fireEvent.change(selectMassaTipo, { target: { value: "PERCENTUAL" } });
    fireEvent.change(selectMassaTatica, { target: { value: "SNIPER" } });
    fireEvent.change(inputMassaValor, { target: { value: "0.5" } });
    fireEvent.click(btnAplicarTodos);

    fireEvent.click(screen.getByTestId("btn-salvar-disputa-topo"));
    await waitFor(() => {
      expect(patchPayloads).toHaveLength(1);
    });
    const regraPerc = (patchPayloads[0].calculadoraDados as any).disputaConfig.regrasItens[0];
    expect(regraPerc.tipoDecremento).toBe("PERCENTUAL");
    expect(regraPerc.valorDecremento).toBe(0.5);
    expect(regraPerc.tatica).toBe("SNIPER");

    // Caso 2: FIXO_REAIS com "10.50" -> deve resultar em 10.5, NÃO 1050
    fireEvent.change(selectMassaTipo, { target: { value: "FIXO_REAIS" } });
    fireEvent.change(inputMassaValor, { target: { value: "10.50" } });
    fireEvent.click(btnAplicarTodos);

    fireEvent.click(screen.getByTestId("btn-salvar-disputa-topo"));
    await waitFor(() => {
      expect(patchPayloads).toHaveLength(2);
    });
    const regraReais = (patchPayloads[1].calculadoraDados as any).disputaConfig.regrasItens[0];
    expect(regraReais.tipoDecremento).toBe("FIXO_REAIS");
    expect(regraReais.valorDecremento).toBe(10.5);
  });

  it("sincroniza oportunidade.status localmente para EM_DISPUTA e preserva decimais ao salvar Valor Homologado", async () => {
    mockOportunidadeFetch("ACEITA", "CONFIGURADA");
    render(<OportunidadesDetalhePage params={{ id: "opp_issue45" }} />);
    await screen.findByTestId("dossie-header");

    fireEvent.click(screen.getByTestId("tab-disputa"));
    await screen.findByTestId("disputa-piso-calc-original-item_calc_45");

    // Seleciona Status Operacional = EM_DISPUTA e salva
    const selectSala = document.getElementById("select-status-sala") as HTMLSelectElement;
    fireEvent.change(selectSala, { target: { value: "EM_DISPUTA" } });
    fireEvent.click(screen.getByTestId("btn-salvar-disputa-topo"));

    await waitFor(() => {
      expect(patchPayloads).toHaveLength(1);
    });
    expect(patchPayloads[0].status).toBe("EM_DISPUTA");

    // Cabeçalho local deve refletir EM_DISPUTA imediatamente (sem reverter ao salvar outra aba depois)
    expect(screen.getByTestId("dossie-header")).toHaveTextContent(/Status:\s*EM_DISPUTA/);

    // Agora testa "Salvar Valor Homologado" com lanceMinimoInput="320.52" e valorPropostaInput="367.64"
    const inputHomologado = screen.getByTestId("input-valor-homologado") as HTMLInputElement;
    fireEvent.change(inputHomologado, { target: { value: "350.00" } });
    fireEvent.click(screen.getByRole("button", { name: /Salvar Valor Homologado/i }));

    await waitFor(() => {
      expect(patchPayloads).toHaveLength(2);
    });
    // Bug antigo multiplicava "320.52" -> 32052, "367.64" -> 36764 e "350.00" -> 35000!
    expect(patchPayloads[1].status).toBe("EM_DISPUTA");
    expect(patchPayloads[1].lanceMinimo).toBe(320.52);
    expect(patchPayloads[1].valorProposta).toBe(367.64);
    expect(patchPayloads[1].valorHomologado).toBe(350);
  });

  it("exibe tag dedicada quando Status Operacional da Sala estiver CONCLUIDA", async () => {
    mockOportunidadeFetch("EM_DISPUTA", "CONCLUIDA");
    render(<OportunidadesDetalhePage params={{ id: "opp_issue45" }} />);
    await screen.findByTestId("dossie-header");

    fireEvent.click(screen.getByTestId("tab-disputa"));
    expect(await screen.findByText(/^🏁 Disputa Concluída$/)).toBeInTheDocument();
  });
});

describe("Issue #45 — Simulação de Disputa e Motor (FECHADO_ABERTO, Demo Reset, Itens <= R$ 1,00, Badges)", () => {
  it("suporta FECHADO_ABERTO no engine com prorrogação automática na etapa aberta", () => {
    const estado = criarEstadoSimulacao(
      [
        {
          ...regraItemBase,
          melhorLanceSala: 180,
          meuUltimoLance: 183.82,
          minhaPosicao: 2,
          tatica: "SNIPER",
        },
      ],
      8,
    );

    const tick = executarTickSimulacao(estado, {
      perfil: "CONSERVADOR",
      pausaEmergencia: false,
      segundosFinaisSniper: 10,
      minhaEmpresaMeEpp: true,
      modoDisputa: "FECHADO_ABERTO" as any,
    });

    expect(tick.itens[0].minhaPosicao).toBe(1);
    expect(tick.tempoRestante).toBeGreaterThan(8);
  });

  it("opera Forçar Rival (injetarLanceRival) e concorrente AGRESSIVO normalmente em itens <= R$ 1,00", () => {
    const itemCentavos: DisputaItemRegra = {
      ...regraItemBase,
      itemId: "item_centavos",
      pisoUnitarioSeguro: 0.4,
      propostaUnitaria: 0.9,
      melhorLanceSala: 0.9,
      meuUltimoLance: 0.9,
      minhaPosicao: 1,
      tipoDecremento: "CENTAVOS_1",
      valorDecremento: 0.01,
    };

    const lanceAgressivo = simularLanceConcorrente(
      { ...itemCentavos, propostaUnitaria: 0.4, melhorLanceSala: 0.4, pisoUnitarioSeguro: 0.2 },
      "AGRESSIVO",
      20,
      1,
      () => 0.1,
    );
    expect(lanceAgressivo).not.toBeNull();
    expect(lanceAgressivo!.valorUnitario).toBeGreaterThan(0);
    expect(lanceAgressivo!.valorUnitario).toBeLessThan(0.4);

    const estado = criarEstadoSimulacao([itemCentavos], 30);
    const aposRival = injetarLanceRival(estado, "item_centavos", {
      perfil: "MODERADO",
      pausaEmergencia: false,
      segundosFinaisSniper: 10,
      minhaEmpresaMeEpp: true,
      modoDisputa: "ABERTO",
    });

    // Rival injetou abaixo de 0.90 (> 0) e robô imediato cobriu
    expect(aposRival.eventos.length).toBeGreaterThan(estado.eventos.length);
    const itemAtualizado = aposRival.itens[0];
    expect(itemAtualizado.meuUltimoLance).toBeLessThan(0.9);
    expect(itemAtualizado.meuUltimoLance).toBeGreaterThan(0.4);
  });

  it("sincroniza FECHADO_ABERTO, herda Pausa de Emergência, exibe badge de robô desativado e reseta defaults ao voltar para Demo", () => {
    render(
      <SalaSimuladaModal
        open={true}
        onRequestClose={() => {}}
        planoTenant="PRO"
        licitacaoInicial={{
          id: "cert-fechado-aberto",
          numeroEdital: "PE 900/2026",
          orgao: "Órgão Fechado/Aberto",
          portal: "Compras.gov.br",
          modoDisputaEdital: "FECHADO_ABERTO",
          pausaEmergencia: true,
          segundosFinaisSniper: 20,
          regrasItens: [
            {
              ...regraItemBase,
              itemId: "item_desativado",
              ativoNoRobo: false,
            },
          ],
        } as any}
      />,
    );

    const selectModo = document.getElementById("select-modo-disputa-simulada") as HTMLSelectElement;
    const selectSniper = document.getElementById("select-janela-sniper") as HTMLSelectElement;
    const selectOrigem = document.getElementById("select-origem-disputa") as HTMLSelectElement;

    expect(selectModo.value).toBe("FECHADO_ABERTO");
    expect(selectSniper.value).toBe("20");
    expect(screen.getByText(/⏸️ Robô desativado/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Retomar Robô/i })).toBeInTheDocument();

    // Volta para Cenário Demo -> deve resetar Modo para ABERTO, Sniper para 10s e Pausa para desligada
    fireEvent.change(selectOrigem, { target: { value: "DEMO" } });
    expect(selectModo.value).toBe("ABERTO");
    expect(selectSniper.value).toBe("10");
    expect(screen.getByRole("button", { name: /Pausa Pânico/i })).toBeInTheDocument();
  });
});
