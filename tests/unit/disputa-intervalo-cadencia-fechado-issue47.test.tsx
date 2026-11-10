import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { getServerSession } from "next-auth/next";
import * as roboEngine from "@/lib/robo-lances-engine";
import { SalaSimuladaModal } from "@/components/robo-lances/sala-simulada-modal";
import { GET as getSalasRobo } from "@/app/api/robo-de-lances/salas/route";
import {
  insertInMemoryLicitacao,
  resetInMemoryLicitacoes,
} from "@/server/services/licitacoes-store";
import OportunidadesDetalhePage from "@/app/oportunidades/[id]/page";
import RoboDeLancesPage from "@/app/robo-de-lances/page";
import type {
  DisputaItemRegra,
  ItemCalculadoraInput,
} from "@/server/schemas/proposta-calculadora.schema";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next-auth/next", () => ({
  getServerSession: vi.fn(),
}));

const getServerSessionMock = vi.mocked(getServerSession);

const itemCalcBase: ItemCalculadoraInput = {
  id: "item_calc_47",
  numeroItem: "01",
  descricao: "Servidor Corporativo Rack 2U",
  marcaModelo: "Dell PowerEdge",
  unidade: "UN",
  quantidade: 2,
  valorEstimadoUnitario: 1500,
  custoUnitario: 600,
  freteUnitario: 0,
  outrosCustosUnitario: 0,
  impostosPercentual: 12,
  bdiPercentual: 25,
  margemMinimaPercentual: 10,
  margemAlvoPercentual: 20,
  valorUnitarioArrematado: null,
};

const regraItemBase: DisputaItemRegra = {
  itemId: "item_calc_47",
  numeroItem: "01",
  descricao: "Servidor Corporativo Rack 2U",
  unidade: "UN",
  quantidade: 2,
  ativoNoRobo: true,
  pisoUnitarioSeguro: 961.54,
  propostaUnitaria: 1200.0,
  tipoDecremento: "CENTAVOS_1",
  valorDecremento: 0.01,
  tatica: "IMEDIATO",
  statusItem: "PRONTO",
  melhorLanceSala: 1100.0,
  meuUltimoLance: 1200.0,
  minhaPosicao: 2,
  observacoes: "",
};

describe("Issue #47 — Intervalo Mínimo, Cadência Real, Fechado/Aberto Art. 25 e Remoção de Demo Flash", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    resetInMemoryLicitacoes();
    getServerSessionMock.mockResolvedValue(null);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe("1. Intervalo Mínimo do Edital no motor (aplicarDecremento, avaliarProximoLance e adequação)", () => {
    it("faz parse de R$ e % e identifica itens com decremento menor que o exigido pelo edital", () => {
      const engineAny = roboEngine as Record<string, unknown>;
      expect(typeof engineAny.parseIntervaloMinimoEdital).toBe("function");
      expect(typeof engineAny.listarItensAbaixoIntervaloMinimo).toBe("function");
      expect(typeof engineAny.adequarItensAoIntervaloMinimo).toBe("function");

      const parseFn = roboEngine.parseIntervaloMinimoEdital;
      expect(parseFn("R$ 5,00")).toMatchObject({ tipo: "FIXO_REAIS", valor: 5 });
      expect(parseFn("0,5%")).toMatchObject({ tipo: "PERCENTUAL", valor: 0.5 });
      expect(parseFn("R$ 0,00")).toBeNull();
      expect(parseFn("")).toBeNull();

      const abaixo = roboEngine.listarItensAbaixoIntervaloMinimo([regraItemBase], "R$ 5,00");
      expect(abaixo).toHaveLength(1);
      expect(abaixo[0].item.itemId).toBe("item_calc_47");

      const adequados = roboEngine.adequarItensAoIntervaloMinimo([regraItemBase], "R$ 5,00");
      expect(adequados[0].tipoDecremento).toBe("FIXO_REAIS");
      expect(adequados[0].valorDecremento).toBe(5);
      expect(roboEngine.listarItensAbaixoIntervaloMinimo(adequados, "R$ 5,00")).toHaveLength(0);
    });

    it("em aplicarDecremento e avaliarProximoLance, ajusta o passo mínimo ao do edital e bloqueia com BLOQUEADO_PISO_SEGURO se cruzar o piso", () => {
      // Caso 1: item em CENTAVOS_1 (0,01) e edital exige R$ 5,00 -> deve cobrir com -5,00 (1095,00)
      const decAjustada = roboEngine.aplicarDecremento(
        1100,
        "CENTAVOS_1",
        0.01,
        961.54,
        "R$ 5,00",
      );
      expect(decAjustada.novoValor).toBe(1095);
      expect(decAjustada.pisoAtingido).toBe(false);
      expect(decAjustada.ajustadoPeloIntervaloEdital).toBe(true);

      const decisaoAjustada = roboEngine.avaliarProximoLance(regraItemBase, {
        pausaEmergencia: false,
        tempoRestanteSegundos: 30,
        segundosFinaisSniper: 10,
        tempoRespostaSegundos: 1,
        modoDisputa: "ABERTO",
        minhaEmpresaMeEpp: false,
        intervaloMinimoLances: "R$ 5,00",
      });
      expect(decisaoAjustada.deveDisparar).toBe(true);
      expect(decisaoAjustada.novoValorUnitario).toBe(1095);
      expect(decisaoAjustada.motivo).toMatch(/intervalo m[ií]nimo/i);

      // Caso 2: intervalo percentual (1% de 1000 = 10 -> 990)
      const decisaoPerc = roboEngine.avaliarProximoLance(
        {
          ...regraItemBase,
          melhorLanceSala: 1000,
          pisoUnitarioSeguro: 900,
        },
        {
          pausaEmergencia: false,
          tempoRestanteSegundos: 30,
          segundosFinaisSniper: 10,
          tempoRespostaSegundos: 1,
          modoDisputa: "ABERTO",
          minhaEmpresaMeEpp: false,
          intervaloMinimoLances: "1%",
        },
      );
      expect(decisaoPerc.deveDisparar).toBe(true);
      expect(decisaoPerc.novoValorUnitario).toBe(990);

      // Caso 3: melhorLanceSala=103, piso=100, intervaloMinimo="R$ 5,00" -> 103-5=98 < 100 -> DEVE BLOQUEAR!
      const decisaoBloqueada = roboEngine.avaliarProximoLance(
        {
          ...regraItemBase,
          pisoUnitarioSeguro: 100,
          propostaUnitaria: 120,
          melhorLanceSala: 103,
          meuUltimoLance: 110,
          minhaPosicao: 2,
        },
        {
          pausaEmergencia: false,
          tempoRestanteSegundos: 30,
          segundosFinaisSniper: 10,
          tempoRespostaSegundos: 1,
          modoDisputa: "ABERTO",
          minhaEmpresaMeEpp: false,
          intervaloMinimoLances: "R$ 5,00",
        },
      );
      expect(decisaoBloqueada.deveDisparar).toBe(false);
      expect(decisaoBloqueada.tipo).toBe("BLOQUEADO_PISO_SEGURO");
      expect(decisaoBloqueada.pisoAtingido).toBe(true);
    });
  });

  describe("2. Cadência real (tempoRespostaSegundos) no Simulador", () => {
    it("respeita tempoRespostaSegundos configurado em executarTickSimulacao e injetarLanceRival", () => {
      const itemLider: DisputaItemRegra = {
        ...regraItemBase,
        melhorLanceSala: 1200,
        meuUltimoLance: 1200,
        minhaPosicao: 1,
      };
      const estado = roboEngine.criarEstadoSimulacao([itemLider], 40);

      // Injeta rival com cadência configurada de 3s -> robô NÃO dispara imediatamente
      const aposRival = roboEngine.injetarLanceRival(estado, itemLider.itemId, {
        perfil: "CONSERVADOR",
        pausaEmergencia: false,
        segundosFinaisSniper: 10,
        tempoRespostaSegundos: 3,
        minhaEmpresaMeEpp: false,
        modoDisputa: "ABERTO",
      });

      expect(aposRival.itens[0].minhaPosicao).toBe(2);
      const ultimoEventoInjection = aposRival.eventos[0];
      expect(ultimoEventoInjection.isMinhaEmpresa).toBe(false);

      // Tick 1 (1s após rival): ainda em cooldown (faltam 2s)
      const tick1 = roboEngine.executarTickSimulacao(aposRival, {
        perfil: "CONSERVADOR",
        pausaEmergencia: false,
        segundosFinaisSniper: 10,
        tempoRespostaSegundos: 3,
        minhaEmpresaMeEpp: false,
        modoDisputa: "ABERTO",
        random: () => 0.99,
      });
      expect(tick1.itens[0].minhaPosicao).toBe(2);

      // Tick 2 (2s após rival): ainda em cooldown (falta 1s)
      const tick2 = roboEngine.executarTickSimulacao(tick1, {
        perfil: "CONSERVADOR",
        pausaEmergencia: false,
        segundosFinaisSniper: 10,
        tempoRespostaSegundos: 3,
        minhaEmpresaMeEpp: false,
        modoDisputa: "ABERTO",
        random: () => 0.99,
      });
      expect(tick2.itens[0].minhaPosicao).toBe(2);

      // Tick 3 (3s após rival): cadência cumprida -> robô cobre para 1º lugar!
      const tick3 = roboEngine.executarTickSimulacao(tick2, {
        perfil: "CONSERVADOR",
        pausaEmergencia: false,
        segundosFinaisSniper: 10,
        tempoRespostaSegundos: 3,
        minhaEmpresaMeEpp: false,
        modoDisputa: "ABERTO",
        random: () => 0.99,
      });
      expect(tick3.itens[0].minhaPosicao).toBe(1);
      expect(tick3.eventos[0].isMinhaEmpresa).toBe(true);
    });
  });

  describe("3. Modo Fechado e Aberto (IN SEGES/ME 73/2022 Art. 25)", () => {
    it("elimina item cuja proposta fechada excede +10% da melhor quando há >= 3 concorrentes dentro dos 10%", () => {
      const engineAny = roboEngine as Record<string, unknown>;
      expect(typeof engineAny.executarEtapaFechadaInicial).toBe("function");

      const estado = roboEngine.criarEstadoSimulacao(
        [
          {
            ...regraItemBase,
            pisoUnitarioSeguro: 150,
            propostaUnitaria: 250,
            melhorLanceSala: 250,
            meuUltimoLance: 250,
            minhaPosicao: 1,
            tatica: "IMEDIATO",
          },
        ],
        45,
      );

      // 3 concorrentes dentro dos +10% (180..198): minha proposta 250 fica fora dos 10% e fora top 3
      const apurado = roboEngine.executarEtapaFechadaInicial(
        estado,
        {
          perfil: "CONSERVADOR",
          pausaEmergencia: false,
          segundosFinaisSniper: 10,
          tempoRespostaSegundos: 1,
          minhaEmpresaMeEpp: false,
          modoDisputa: "FECHADO_ABERTO",
        },
        { [regraItemBase.itemId]: [180, 190, 195] },
      );

      expect(apurado.etapaFechadaApurada).toBe(true);
      expect(apurado.classificacaoFechadoAberto?.[regraItemBase.itemId]?.classificado).toBe(false);
      expect(apurado.itens[0].statusItem).toBe("FINALIZADO");

      // Próximo tick da etapa aberta NÃO pode enviar lance para o item desclassificado
      const tickAberta = roboEngine.executarTickSimulacao(apurado, {
        perfil: "CONSERVADOR",
        pausaEmergencia: false,
        segundosFinaisSniper: 10,
        tempoRespostaSegundos: 1,
        minhaEmpresaMeEpp: false,
        modoDisputa: "FECHADO_ABERTO",
        random: () => 0.99,
      });
      expect(tickAberta.itens[0].statusItem).toBe("FINALIZADO");
      expect(tickAberta.eventos.some((e) => e.tipoDisparo === "IMEDIATO")).toBe(false);
    });

    it("classifica até os 3 melhores colocados quando menos de 3 propostas ficarem na faixa de +10%", () => {
      const estado = roboEngine.criarEstadoSimulacao(
        [
          {
            ...regraItemBase,
            pisoUnitarioSeguro: 95,
            propostaUnitaria: 120,
            melhorLanceSala: 120,
            meuUltimoLance: 120,
            minhaPosicao: 1,
            tatica: "IMEDIATO",
          },
        ],
        45,
      );

      // Melhor=100, +10%=110 (apenas 1 proposta dentro de +10%). Top 3 = [100, 115, 120] -> minha(120) avança!
      const apurado = roboEngine.executarEtapaFechadaInicial(
        estado,
        {
          perfil: "CONSERVADOR",
          pausaEmergencia: false,
          segundosFinaisSniper: 10,
          tempoRespostaSegundos: 1,
          minhaEmpresaMeEpp: false,
          modoDisputa: "FECHADO_ABERTO",
        },
        { [regraItemBase.itemId]: [100, 115, 140] },
      );

      expect(apurado.classificacaoFechadoAberto?.[regraItemBase.itemId]?.classificado).toBe(true);
      expect(apurado.itens[0].statusItem).not.toBe("FINALIZADO");
    });
  });

  describe("4. Aba ⚡ Disputa, SalaSimuladaModal, API Salas e /robo-de-lances sem demo flash", () => {
    it("Aba ⚡ Disputa alerta intervalo mínimo incompatível, adequa itens, permite editar tempoRespostaSegundos e janela Sniper, e encaminha ao Simulador", async () => {
      const patchPayloads: Record<string, unknown>[] = [];
      global.fetch = vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();
        if (init?.method === "PATCH" && url.includes("/api/oportunidades/opp_47/status")) {
          const parsed = JSON.parse(String(init.body || "{}"));
          patchPayloads.push(parsed);
          return new Response(
            JSON.stringify({ ok: true, oportunidade: { id: "opp_47", ...parsed } }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }
        if (url.includes("/notas")) return new Response(JSON.stringify({ ok: true, notas: [] }), { status: 200 });
        if (url.includes("/analise-ia")) return new Response(JSON.stringify({ ok: true, analises: [], cota: null }), { status: 200 });
        if (url.includes("/api/usuarios")) return new Response(JSON.stringify({ ok: true, usuarios: [] }), { status: 200 });
        if (url.includes("/api/configuracoes/empresa")) return new Response(JSON.stringify({ ok: true, empresa: {} }), { status: 200 });
        if (url.includes("/api/oportunidades/opp_47")) {
          return new Response(
            JSON.stringify({
              ok: true,
              oportunidade: {
                id: "opp_47",
                idPncp: "12345678000190-1-000047/2026",
                numeroEdital: "PE 047/2026",
                orgaoNome: "Órgão Teste Issue 47",
                orgaoCnpj: "12.345.678/0001-90",
                municipio: "Goiânia",
                uf: "GO",
                modalidade: "Pregão Eletrônico",
                valorEstimado: 100000,
                dataAbertura: "2026-12-15T10:00:00.000Z",
                miniResumo: "Servidores",
                resumo: "Aquisição de Servidores",
                status: "ACEITA",
                isPresencial: false,
                arquivos: [],
                repositoriosSimilares: [],
                analisesIA: [],
                regrasDisputaDetectadas: {
                  portal: "Compras.gov.br",
                  modoDisputaEdital: "ABERTO",
                  intervaloMinimoLances: "R$ 5,00",
                  fontes: ["Edital PDF"],
                  confianca: "ALTA",
                },
                calculadoraDados: {
                  parametrosPadrao: {
                    impostosPercentual: 12,
                    bdiPercentual: 25,
                    margemMinimaPercentual: 10,
                    margemAlvoPercentual: 20,
                  },
                  itens: [itemCalcBase],
                },
              },
            }),
            { status: 200 },
          );
        }
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      });

      render(<OportunidadesDetalhePage params={{ id: "opp_47" }} />);
      await screen.findByTestId("dossie-header");

      fireEvent.click(screen.getByTestId("tab-disputa"));
      await screen.findByTestId("disputa-piso-calc-original-item_calc_47");

      // Como o edital exige R$ 5,00 e o item inicia em CENTAVOS_1 (0,01), o alerta de intervalo mínimo deve aparecer
      expect(await screen.findByTestId("alerta-intervalo-minimo-disputa")).toBeInTheDocument();

      // Clica no botão para adequar itens ao intervalo mínimo
      fireEvent.click(screen.getByTestId("btn-adequar-intervalo-minimo"));
      await waitFor(() => {
        expect(screen.queryByTestId("alerta-intervalo-minimo-disputa")).not.toBeInTheDocument();
      });

      // Edita Tempo de Resposta (s) e Janela Sniper (s) na Aba Disputa
      const inputCadencia = document.getElementById("input-tempo-resposta-disputa") as HTMLInputElement;
      const selectSniper = document.getElementById("select-janela-sniper-disputa") as HTMLSelectElement;
      expect(inputCadencia).toBeInTheDocument();
      expect(selectSniper).toBeInTheDocument();

      fireEvent.change(inputCadencia, { target: { value: "5" } });
      fireEvent.change(selectSniper, { target: { value: "15" } });

      fireEvent.click(screen.getByTestId("btn-salvar-disputa-topo"));
      await waitFor(() => {
        expect(patchPayloads).toHaveLength(1);
      });
      const disputaSalva = (patchPayloads[0].calculadoraDados as Record<string, any>).disputaConfig;
      expect(disputaSalva.tempoRespostaSegundos).toBe(5);
      expect(disputaSalva.segundosFinaisSniper).toBe(15);
      expect(disputaSalva.intervaloMinimoLances).toBe("R$ 5,00");
      expect(disputaSalva.regrasItens[0].tipoDecremento).toBe("FIXO_REAIS");
      expect(disputaSalva.regrasItens[0].valorDecremento).toBe(5);

      // Abre o Simulador e valida herança + campos editáveis no modal
      fireEvent.click(screen.getByTestId("btn-simular-disputa-certame"));
      const modalIntervalo = (await screen.findByTestId("input-intervalo-minimo-simulada")) as HTMLInputElement;
      const modalCadencia = screen.getByTestId("input-tempo-resposta-simulada") as HTMLInputElement;
      expect(modalIntervalo.value).toBe("R$ 5,00");
      expect(modalCadencia.value).toBe("5");
    });

    it("SalaSimuladaModal permite editar intervaloMinimoLances e tempoRespostaSegundos e exibe alerta quando decremento do item é menor", () => {
      render(
        <SalaSimuladaModal
          open={true}
          onRequestClose={() => {}}
          planoTenant="PRO"
          licitacaoInicial={{
            id: "cert-47",
            numeroEdital: "PE 047/2026",
            orgao: "Órgão 47",
            portal: "Compras.gov.br",
            intervaloMinimoLances: "R$ 5,00",
            tempoRespostaSegundos: 4,
            segundosFinaisSniper: 15,
            regrasItens: [regraItemBase],
          }}
        />,
      );

      const inputIntervalo = screen.getByTestId("input-intervalo-minimo-simulada") as HTMLInputElement;
      const inputCadencia = screen.getByTestId("input-tempo-resposta-simulada") as HTMLInputElement;
      expect(inputIntervalo.value).toBe("R$ 5,00");
      expect(inputCadencia.value).toBe("4");

      expect(screen.getByTestId("alerta-intervalo-minimo-simulada")).toBeInTheDocument();

      fireEvent.change(inputIntervalo, { target: { value: "R$ 10,00" } });
      fireEvent.change(inputCadencia, { target: { value: "6" } });
      expect(inputIntervalo.value).toBe("R$ 10,00");
      expect(inputCadencia.value).toBe("6");
    });

    it("GET /api/robo-de-lances/salas retorna intervaloMinimoLances e tempoRespostaSegundos; /robo-de-lances exibe erro em falha HTTP sem dados demo", async () => {
      insertInMemoryLicitacao({
        idPncp: "77777777000177-1-000047/2026",
        numeroControlePNCP: "77777777000177-1-000047/2026",
        numeroEdital: "PE 447/2026",
        orgaoNome: "Órgão Sala 47",
        orgaoCnpj: "77777777000177",
        uf: "GO",
        municipio: "Goiânia",
        esfera: "M",
        poder: "E",
        modalidade: "Pregão Eletrônico",
        modalidadeCodigo: 6,
        portalDisputa: "Compras.gov.br",
        miniResumo: "Servidores",
        resumo: "Aquisição Servidores 47",
        valorEstimado: 100000,
        dataAbertura: new Date("2026-12-20T10:00:00Z"),
        dataEncerramentoProposta: new Date("2026-12-20T10:00:00Z"),
        dataPublicacaoPncp: new Date("2026-11-01T10:00:00Z"),
        dataUltimaAtualizacao: new Date("2026-11-01T10:00:00Z"),
        status: "EM_DISPUTA",
        parecerIA: "GO",
        justificativaIA: null,
        tipoSistemaCodigo: "TI_INFORMATICA",
        segmentoMacro: "INFORMATICA",
        subcategorias: [],
        atestadosExigidos: [],
        motivoRecusa: null,
        quantidadeLotes: 1,
        loteUnico: false,
        precoPorLote: false,
        isPresencial: false,
        distanciaGoianiaKm: null,
        hashCritico: "hash-sala-447",
        valorArrematado: null,
        responsavelId: null,
        calculadoraDados: {
          disputaConfig: {
            portal: "Compras.gov.br",
            identificadorSala: "UASG 160047",
            modoDisputaEdital: "FECHADO_ABERTO",
            intervaloMinimoLances: "R$ 5,00",
            origemPrecos: "CALCULADORA",
            statusGeral: "EM_DISPUTA",
            pausaEmergencia: false,
            tempoRespostaSegundos: 6,
            segundosFinaisSniper: 15,
            regrasItens: [regraItemBase],
          },
        },
      } as any);

      const resSalas = await getSalasRobo(
        new Request("http://localhost/api/robo-de-lances/salas?tenantId=tenant-default"),
      );
      expect(resSalas.status).toBe(200);
      const jsonSalas = await resSalas.json();
      const sala = jsonSalas.salas.find((s: any) => s.numeroEdital === "PE 447/2026");
      expect(sala).toBeDefined();
      expect(sala.intervaloMinimoLances).toBe("R$ 5,00");
      expect(sala.tempoRespostaSegundos).toBe(6);
      expect(sala.segundosFinaisSniper).toBe(15);

      // Falha da API na página /robo-de-lances não pode renderizar salas demo
      global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));
      render(<RoboDeLancesPage />);

      expect(await screen.findByTestId("salas-error-state")).toBeInTheDocument();
      expect(screen.queryByText("PE 099/2026 - TRE-GO")).not.toBeInTheDocument();
      expect(screen.queryByText("PE 045/2026 - Prefeitura de Anápolis/GO")).not.toBeInTheDocument();
    });
  });
});
