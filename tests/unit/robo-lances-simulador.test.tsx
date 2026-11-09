import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import {
  aplicarDecremento,
  avaliarProximoLance,
  verificarEmpateFictoMeEpp,
  gerarCenarioDemoDisputa,
  simularLanceConcorrente,
  calcularPisoConcorrente,
  normalizarItensParaSimulacao,
  listarItensSemPiso,
  criarEstadoSimulacao,
  executarTickSimulacao,
  injetarLanceRival,
  exercerDesempateMeEpp,
  declinarDesempateMeEpp,
  alterarTaticaItem,
  type ContextoDisputa,
} from "@/lib/robo-lances-engine";
import { SalaSimuladaModal } from "@/components/robo-lances/sala-simulada-modal";
import type { DisputaItemRegra } from "@/server/schemas/proposta-calculadora.schema";

describe("Motor Determinístico de Lances (Auto-Bidder Engine)", () => {
  const contextoPadrao: ContextoDisputa = {
    pausaEmergencia: false,
    tempoRestanteSegundos: 30,
    segundosFinaisSniper: 10,
    tempoRespostaSegundos: 3,
    modoDisputa: "ABERTO",
    minhaEmpresaMeEpp: true,
  };

  const itemBase: DisputaItemRegra = {
    itemId: "item-teste-1",
    numeroItem: "01",
    descricao: "Notebook Corporativo i7",
    unidade: "UN",
    quantidade: 10,
    ativoNoRobo: true,
    pisoUnitarioSeguro: 4000.0,
    propostaUnitaria: 5000.0,
    tipoDecremento: "CENTAVOS_1",
    valorDecremento: 0.01,
    tatica: "IMEDIATO",
    statusItem: "EM_DISPUTA",
    melhorLanceSala: 4900.0,
    meuUltimoLance: 5000.0,
    minhaPosicao: 2,
    observacoes: "",
  };

  describe("aplicarDecremento", () => {
    it("deve decrementar R$ 0,01 quando configurado para CENTAVOS_1", () => {
      const res = aplicarDecremento(5000.0, "CENTAVOS_1", 0.01, 4000.0);
      expect(res.novoValor).toBe(4999.99);
      expect(res.pisoAtingido).toBe(false);
    });

    it("deve decrementar valor fixo quando configurado para FIXO_REAIS", () => {
      const res = aplicarDecremento(5000.0, "FIXO_REAIS", 50.0, 4000.0);
      expect(res.novoValor).toBe(4950.0);
      expect(res.pisoAtingido).toBe(false);
    });

    it("deve decrementar percentual quando configurado para PERCENTUAL", () => {
      // 1% de 5000 = 50 -> 4950
      const res = aplicarDecremento(5000.0, "PERCENTUAL", 1.0, 4000.0);
      expect(res.novoValor).toBe(4950.0);
      expect(res.pisoAtingido).toBe(false);
    });

    it("nunca deve ultrapassar o piso seguro (trava inviolável)", () => {
      // Lance atual de 4005 com decremento de 50 e piso de 4000
      const res = aplicarDecremento(4005.0, "FIXO_REAIS", 50.0, 4000.0);
      expect(res.novoValor).toBe(4000.0);
      expect(res.pisoAtingido).toBe(true);
    });
  });

  describe("avaliarProximoLance", () => {
    it("deve disparar lance imediato cobrindo o concorrente por R$ 0,01", () => {
      const item: DisputaItemRegra = {
        ...itemBase,
        melhorLanceSala: 4500.0,
        meuUltimoLance: 4600.0,
        minhaPosicao: 2,
      };

      const decisao = avaliarProximoLance(item, contextoPadrao);

      expect(decisao.deveDisparar).toBe(true);
      expect(decisao.tipo).toBe("ENVIAR_LANCE");
      expect(decisao.novoValorUnitario).toBe(4499.99);
      expect(decisao.novoValorTotal).toBe(44999.9);
      expect(decisao.pisoAtingido).toBe(false);
    });

    it("bloqueia disparo quando o melhor lance da sala atinge ou fica abaixo do piso seguro", () => {
      const item: DisputaItemRegra = {
        ...itemBase,
        melhorLanceSala: 3950.0, // Abaixo do piso de 4000.00
        meuUltimoLance: 4050.0,
        minhaPosicao: 2,
      };

      const decisao = avaliarProximoLance(item, contextoPadrao);

      expect(decisao.deveDisparar).toBe(false);
      expect(decisao.tipo).toBe("BLOQUEADO_PISO_SEGURO");
      expect(decisao.pisoAtingido).toBe(true);
      expect(decisao.motivo).toContain("Piso Seguro");
    });

    it("não queima margem contra si mesmo se já estiver em 1º lugar", () => {
      const item: DisputaItemRegra = {
        ...itemBase,
        melhorLanceSala: 4400.0,
        meuUltimoLance: 4400.0,
        minhaPosicao: 1,
      };

      const decisao = avaliarProximoLance(item, contextoPadrao);

      expect(decisao.deveDisparar).toBe(false);
      expect(decisao.tipo).toBe("JA_ESTA_VENCENDO");
      expect(decisao.motivo).toContain("já ocupa a 1ª posição");
    });

    it("tática SNIPER aguarda quando o tempo restante for superior à janela configurada", () => {
      const item: DisputaItemRegra = {
        ...itemBase,
        tatica: "SNIPER",
        melhorLanceSala: 4500.0,
        minhaPosicao: 2,
      };

      const contextoForaDaJanela = { ...contextoPadrao, tempoRestanteSegundos: 25 };
      const decisao = avaliarProximoLance(item, contextoForaDaJanela);

      expect(decisao.deveDisparar).toBe(false);
      expect(decisao.tipo).toBe("AGUARDAR_JANELA_SNIPER");
    });

    it("tática SNIPER dispara quando entrar na janela final dos 10 segundos", () => {
      const item: DisputaItemRegra = {
        ...itemBase,
        tatica: "SNIPER",
        melhorLanceSala: 4500.0,
        minhaPosicao: 2,
      };

      const contextoNaJanela = { ...contextoPadrao, tempoRestanteSegundos: 7 };
      const decisao = avaliarProximoLance(item, contextoNaJanela);

      expect(decisao.deveDisparar).toBe(true);
      expect(decisao.tipo).toBe("ENVIAR_LANCE");
      expect(decisao.novoValorUnitario).toBe(4499.99);
      expect(decisao.taticaUsada).toBe("SNIPER");
    });

    it("tática MONITORAR apenas acompanha e nunca dispara automaticamente", () => {
      const item: DisputaItemRegra = {
        ...itemBase,
        tatica: "MONITORAR",
        melhorLanceSala: 4500.0,
        minhaPosicao: 2,
      };

      const decisao = avaliarProximoLance(item, contextoPadrao);

      expect(decisao.deveDisparar).toBe(false);
      expect(decisao.tipo).toBe("MONITORAR_APENAS");
    });

    it("interrompe imediatamente qualquer lance se houver pausa de emergência ativa", () => {
      const item: DisputaItemRegra = {
        ...itemBase,
        melhorLanceSala: 4500.0,
        minhaPosicao: 2,
      };

      const contextoPausado = { ...contextoPadrao, pausaEmergencia: true };
      const decisao = avaliarProximoLance(item, contextoPausado);

      expect(decisao.deveDisparar).toBe(false);
      expect(decisao.tipo).toBe("PAUSADO_EMERGENCIA");
    });

    it("não dispara quando o item está desativado no robô", () => {
      const item: DisputaItemRegra = {
        ...itemBase,
        ativoNoRobo: false,
      };

      const decisao = avaliarProximoLance(item, contextoPadrao);

      expect(decisao.deveDisparar).toBe(false);
      expect(decisao.tipo).toBe("ITEM_INATIVO");
    });

    it("dispara exatamente no valor do Piso Seguro quando o decremento fixo ultrapassa o piso mas ainda há margem", () => {
      const item: DisputaItemRegra = {
        ...itemBase,
        tipoDecremento: "FIXO_REAIS",
        valorDecremento: 50.0,
        pisoUnitarioSeguro: 4000.0,
        melhorLanceSala: 4005.0,
        meuUltimoLance: 4100.0,
        minhaPosicao: 2,
      };

      const decisao = avaliarProximoLance(item, contextoPadrao);

      expect(decisao.deveDisparar).toBe(true);
      expect(decisao.tipo).toBe("ENVIAR_LANCE");
      expect(decisao.novoValorUnitario).toBe(4000.0);
      expect(decisao.pisoAtingido).toBe(true);
    });

    it("bloqueia com PISO_NAO_CONFIGURADO se pisoUnitarioSeguro ou propostaUnitaria forem zero", () => {
      const itemSemPiso: DisputaItemRegra = {
        ...itemBase,
        pisoUnitarioSeguro: 0,
      };

      const decisao = avaliarProximoLance(itemSemPiso, contextoPadrao);

      expect(decisao.deveDisparar).toBe(false);
      expect(decisao.tipo).toBe("PISO_NAO_CONFIGURADO");
      expect(decisao.motivo).toContain("Piso Seguro ou Proposta Inicial não configurados");
    });
  });

  describe("verificarEmpateFictoMeEpp (LC 123/2006)", () => {
    it("habilita direito de preferência se empresa for ME/EPP e estiver a até 5% do líder não-ME", () => {
      // Líder não-ME: 1000.00 | Meu último: 1030.00 (3% de diferença) | Piso: 950.00
      const res = verificarEmpateFictoMeEpp(1000.0, false, 1030.0, 950.0, true);

      expect(res.podeDesempatar).toBe(true);
      expect(res.margemPercentual).toBe(3);
      expect(res.lanceSugerido).toBe(999.99);
      expect(res.motivo).toContain("Direito de Preferência ME/EPP ATIVO");
    });

    it("recusa desempate se a margem for superior a 5,0%", () => {
      // Líder não-ME: 1000.00 | Meu último: 1060.00 (6% de diferença)
      const res = verificarEmpateFictoMeEpp(1000.0, false, 1060.0, 950.0, true);

      expect(res.podeDesempatar).toBe(false);
      expect(res.margemPercentual).toBe(6);
      expect(res.motivo).toContain("excede o limite legal de 5,0%");
    });

    it("recusa desempate se o lance de desempate violar o piso seguro da empresa", () => {
      // Líder não-ME: 1000.00 | Meu último: 1020.00 (2%) | Porém meu Piso é 1005.00
      const res = verificarEmpateFictoMeEpp(1000.0, false, 1020.0, 1005.0, true);

      expect(res.podeDesempatar).toBe(false);
      expect(res.motivo).toContain("violaria o Piso Seguro");
    });

    it("não aplica empate ficto se o primeiro colocado já for ME/EPP", () => {
      const res = verificarEmpateFictoMeEpp(1000.0, true, 1020.0, 950.0, true);

      expect(res.podeDesempatar).toBe(false);
      expect(res.motivo).toContain("O 1º colocado já é ME/EPP");
    });
  });

  describe("Cenário Demo e Concorrentes", () => {
    it("gera o cenário demo completo com 3 itens balanceados", () => {
      const { config, itens } = gerarCenarioDemoDisputa();

      expect(itens).toHaveLength(3);
      expect(config.portal).toBe("Compras.gov.br");
      expect(itens[0].tatica).toBe("IMEDIATO");
      expect(itens[1].tatica).toBe("SNIPER");
      expect(itens[2].tatica).toBe("MONITORAR");
      expect(itens[0].pisoUnitarioSeguro).toBe(4350.0);
    });

    it("simularLanceConcorrente gera lances consistentes quando sorteado", () => {
      const item: DisputaItemRegra = { ...itemBase, melhorLanceSala: 5000.0 };

      // Executa algumas iterações para verificar o formato do lance concorrente
      let gerouLance = false;
      for (let i = 0; i < 20; i++) {
        const lance = simularLanceConcorrente(item, "AGRESSIVO", 25, i);
        if (lance) {
          gerouLance = true;
          expect(lance.isMinhaEmpresa).toBe(false);
          expect(lance.valorUnitario).toBeLessThan(5000.0);
          expect(lance.valorTotal).toBe(lance.valorUnitario * item.quantidade);
          expect(lance.tipoDisparo).toBe("CONCORRENTE");
          break;
        }
      }
      expect(gerouLance).toBe(true);
    });

    it("calcularPisoConcorrente ancora o piso do rival na propostaUnitaria fixa (evitando queda infinita)", () => {
      const itemA: DisputaItemRegra = { ...itemBase, propostaUnitaria: 5000.0, melhorLanceSala: 5000.0 };
      const itemB: DisputaItemRegra = { ...itemBase, propostaUnitaria: 5000.0, melhorLanceSala: 4100.0 };

      expect(calcularPisoConcorrente(itemA, "MODERADO")).toBe(4100.0);
      expect(calcularPisoConcorrente(itemB, "MODERADO")).toBe(4100.0);
      expect(calcularPisoConcorrente(itemA, "AGRESSIVO")).toBe(3900.0);
      expect(calcularPisoConcorrente(itemA, "CONSERVADOR")).toBe(4250.0);
    });

    it("normalizarItensParaSimulacao e listarItensSemPiso validam itens reais do pipeline", () => {
      const itensNorm = normalizarItensParaSimulacao([
        {
          ...itemBase,
          melhorLanceSala: null,
          meuUltimoLance: null,
          minhaPosicao: null,
        },
        {
          ...itemBase,
          itemId: "item-sem-piso",
          numeroItem: "02",
          pisoUnitarioSeguro: 0,
        },
      ]);

      expect(itensNorm[0].melhorLanceSala).toBe(5000.0);
      expect(itensNorm[0].minhaPosicao).toBe(1);
      expect(listarItensSemPiso(itensNorm).map((i) => i.numeroItem)).toEqual(["02"]);
    });
  });

  describe("Máquina de Estados da Sessão Simulada (Pure Engine)", () => {
    it("injetarLanceRival registra lance concorrente + resposta imediata do robô em ordem cronológica", () => {
      const { itens } = gerarCenarioDemoDisputa();
      const estadoInicial = criarEstadoSimulacao(itens, 45);

      const aposInjecao = injetarLanceRival(estadoInicial, "demo-item-1", {
        perfil: "MODERADO",
        pausaEmergencia: false,
        segundosFinaisSniper: 10,
        modoDisputa: "ABERTO",
        minhaEmpresaMeEpp: true,
      });

      const item1 = aposInjecao.itens.find((i) => i.itemId === "demo-item-1")!;
      // No Item 01 (tática IMEDIATO), o robô cobre imediatamente e retoma o 1º lugar
      expect(item1.minhaPosicao).toBe(1);
      expect(item1.meuUltimoLance).toBeLessThan(5180.0);
      // Fita deve ter o lance da nossa empresa no topo (índice 0) e o do concorrente logo abaixo (índice 1)
      expect(aposInjecao.eventos[0].isMinhaEmpresa).toBe(true);
      expect(aposInjecao.eventos[1].isMinhaEmpresa).toBe(false);
      expect(aposInjecao.ultimoAviso?.texto).toMatch(/Lance concorrente de .* injetado no Item 01/i);
    });

    it("executarTickSimulacao prorroga +15s quando ocorre lance nos últimos 10s do modo ABERTO", () => {
      const { itens } = gerarCenarioDemoDisputa();
      // Coloca Item 02 (SNIPER) perdendo para forçar disparo do Sniper na janela final
      const itensMod = itens.map((it) =>
        it.itemId === "demo-item-2"
          ? { ...it, melhorLanceSala: 1580.0, meuUltimoLance: 1620.0, minhaPosicao: 2 }
          : it,
      );
      const estado = criarEstadoSimulacao(itensMod, 8); // 8s restantes (dentro da janela sniper de 10s)

      const novoEstado = executarTickSimulacao(estado, {
        perfil: "CONSERVADOR",
        pausaEmergencia: false,
        segundosFinaisSniper: 10,
        modoDisputa: "ABERTO",
        minhaEmpresaMeEpp: true,
      });

      const item2 = novoEstado.itens.find((i) => i.itemId === "demo-item-2")!;
      expect(item2.minhaPosicao).toBe(1);
      expect(item2.meuUltimoLance).toBe(1575.0); // 1580 - 5 (FIXO_REAIS do demo-item-2)
      expect(novoEstado.tempoRestante).toBeGreaterThan(8); // Prorrogado com +15s
    });

    it("executarTickSimulacao encerra sessão no segundo final e detecta empate ficto ME/EPP", () => {
      const { itens } = gerarCenarioDemoDisputa();
      // No Cenário Demo, demo-item-3 (MONITORAR) já tem melhorLanceSala=16400, meuUltimoLance=16900 (~3,05% <= 5%) e piso=14500
      const base = criarEstadoSimulacao(itens, 1);
      const estado = {
        ...base,
        liderConcorrente: {
          ...base.liderConcorrente,
          "demo-item-3": { nome: "Licitante Alfa Comércio Ltda", isMeEpp: false },
        },
      };

      const encerrado = executarTickSimulacao(estado, {
        perfil: "MODERADO",
        pausaEmergencia: false,
        segundosFinaisSniper: 10,
        modoDisputa: "ABERTO",
        minhaEmpresaMeEpp: true,
      });

      expect(encerrado.fase).toBe("ENCERRADA");
      expect(encerrado.tempoRestante).toBe(0);
      expect(encerrado.desempates.length).toBeGreaterThan(0);
      const desempateItem3 = encerrado.desempates.find((d) => d.itemId === "demo-item-3");
      expect(desempateItem3).toBeDefined();
      expect(desempateItem3?.lanceSugerido).toBe(16399.99);

      // Exercer o desempate ME/EPP
      const posDesempate = exercerDesempateMeEpp(encerrado, "demo-item-3", true);
      const item3 = posDesempate.itens.find((i) => i.itemId === "demo-item-3")!;
      expect(item3.minhaPosicao).toBe(1);
      expect(item3.meuUltimoLance).toBe(16399.99);
      expect(posDesempate.desempates.find((d) => d.itemId === "demo-item-3")).toBeUndefined();
    });

    it("declinarDesempateMeEpp e alterarTaticaItem atualizam o estado corretamente", () => {
      const { itens } = gerarCenarioDemoDisputa();
      const estado = {
        ...criarEstadoSimulacao(itens, 0),
        desempates: [
          {
            itemId: "demo-item-3",
            numeroItem: "03",
            lanceSugerido: 12099.99,
            margemPercentual: 2.48,
            motivo: "Teste",
          },
        ],
      };

      const posDeclinio = declinarDesempateMeEpp(estado, "demo-item-3");
      expect(posDeclinio.desempates).toHaveLength(0);

      const posTatica = alterarTaticaItem(posDeclinio, "demo-item-3", "SNIPER");
      expect(posTatica.itens.find((i) => i.itemId === "demo-item-3")?.tatica).toBe("SNIPER");
    });
  });

  describe("SalaSimuladaModal (Componente de UI Sandbox)", () => {
    it("deve renderizar a sala simulada com os 3 itens do Cenário Demo e controles", () => {
      render(
        <SalaSimuladaModal
          open={true}
          onRequestClose={() => {}}
          planoTenant="PRO"
        />,
      );

      expect(screen.getByText(/Sala de Disputa Simulada/i)).toBeInTheDocument();
      expect(screen.getByText(/Notebook Corporativo Core i7/i)).toBeInTheDocument();
      expect(screen.getByText(/Monitor Profissional 27/i)).toBeInTheDocument();
      expect(screen.getByText(/Estação de Trabalho Gráfica Xeon/i)).toBeInTheDocument();
      expect(screen.getByText(/Piso Protegido Total:/i)).toBeInTheDocument();
      expect(screen.getByText(/Fita de Lances em Tempo Real/i)).toBeInTheDocument();
    });

    it("deve exibir banner informativo do modo vitrine quando o tenant for do Plano BÁSICO", () => {
      render(
        <SalaSimuladaModal
          open={true}
          onRequestClose={() => {}}
          planoTenant="BASICO"
        />,
      );

      expect(
        screen.getByText(/Modo Vitrine de Demonstração \(Plano Básico\)/i),
      ).toBeInTheDocument();
    });

    it("permite injetar lance rival manualmente em um item", () => {
      render(
        <SalaSimuladaModal
          open={true}
          onRequestClose={() => {}}
          planoTenant="PRO"
        />,
      );

      const botoesForcarRival = screen.getAllByRole("button", {
        name: /Forçar Rival/i,
      });
      expect(botoesForcarRival.length).toBeGreaterThan(0);

      fireEvent.click(botoesForcarRival[0]);

      expect(
        screen.getByText(/Lance concorrente de .* injetado no Item 01/i),
      ).toBeInTheDocument();
    });

    it("restringe tenant do Plano BÁSICO ao Cenário Demo mesmo quando licitacaoInicial é fornecida", () => {
      render(
        <SalaSimuladaModal
          open={true}
          onRequestClose={() => {}}
          planoTenant="BASICO"
          licitacaoInicial={{
            id: "lic-real-123",
            numeroEdital: "PE 777/2026 - Órgão Real",
            orgao: "Órgão Real",
            portal: "Compras.gov.br",
            regrasItens: [
              {
                ...itemBase,
                itemId: "real-1",
                descricao: "Servidor Dedicado Exclusivo Real",
              },
            ],
          }}
        />,
      );

      // Deve continuar exibindo os itens do Cenário Demo e não o item real bloqueado
      expect(screen.getByText(/Notebook Corporativo Core i7/i)).toBeInTheDocument();
      expect(screen.queryByText(/Servidor Dedicado Exclusivo Real/i)).not.toBeInTheDocument();
    });
  });
});

