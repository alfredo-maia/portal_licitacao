"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Button,
  Column,
  Grid,
  InlineNotification,
  Modal,
  Select,
  SelectItem,
  Tag,
  Tile,
} from "@carbon/react";
import {
  Close,
  Download,
  Launch,
  Locked,
  Pause,
  Play,
  Renew,
  Settings,
  Time,
  Warning,
  CheckmarkFilled,
  Flash,
} from "@carbon/icons-react";
import {
  type DisputaConfig,
  type DisputaItemRegra,
  type TaticaDisputa,
  round2,
} from "@/server/schemas/proposta-calculadora.schema";
import {
  type LanceDisputaEvento,
  type PerfilConcorrenteVirtual,
  type ContextoDisputa,
  avaliarProximoLance,
  verificarEmpateFictoMeEpp,
  simularLanceConcorrente,
  gerarCenarioDemoDisputa,
} from "@/lib/robo-lances-engine";

export interface SalaSimuladaModalProps {
  open: boolean;
  onRequestClose: () => void;
  licitacaoInicial?: {
    id: string;
    numeroEdital: string;
    orgao: string;
    portal?: string;
    regrasItens?: DisputaItemRegra[];
    disputaConfig?: DisputaConfig;
  } | null;
  planoTenant?: "BASICO" | "PRO" | "ENTERPRISE";
  salasDisponiveis?: Array<{
    id: string;
    numeroEdital: string;
    orgao: string;
    portal: string;
    regrasItens: DisputaItemRegra[];
  }>;
}

function formatBRL(valor: number): string {
  return (valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

const EMPTY_SALAS_DISPONIVEIS: any[] = [];

export function SalaSimuladaModal({
  open,
  onRequestClose,
  licitacaoInicial,
  planoTenant = "PRO",
  salasDisponiveis = EMPTY_SALAS_DISPONIVEIS,
}: SalaSimuladaModalProps) {
  // Configuração da Origem
  const [origemSelecionada, setOrigemSelecionada] = useState<string>("DEMO");
  const [itens, setItens] = useState<DisputaItemRegra[]>([]);
  const [config, setConfig] = useState<DisputaConfig>(() => gerarCenarioDemoDisputa().config);

  // Relógio e Ciclo da Disputa
  const [emExecucao, setEmExecucao] = useState<boolean>(false);
  const [tempoRestante, setTempoRestante] = useState<number>(45);
  const [tempoInicialConfig, setTempoInicialConfig] = useState<number>(45);
  const [segundosSniper, setSegundosSniper] = useState<number>(10);
  const [disputaEncerrada, setDisputaEncerrada] = useState<boolean>(false);

  // Parâmetros de Disputa & Concorrentes
  const [perfilConcorrente, setPerfilConcorrente] = useState<PerfilConcorrenteVirtual>("MODERADO");
  const [pausaEmergencia, setPausaEmergencia] = useState<boolean>(false);
  const [modoDisputa, setModoDisputa] = useState<"ABERTO" | "ABERTO_FECHADO">("ABERTO");
  const [minhaEmpresaMeEpp, setMinhaEmpresaMeEpp] = useState<boolean>(true);

  // Fita de Lances (Tape) & Eventos
  const [fitaLances, setFitaLances] = useState<LanceDisputaEvento[]>([]);
  const [notificacao, setNotificacao] = useState<{
    tipo: "info" | "success" | "warning" | "error";
    texto: string;
  } | null>(null);

  // Desempate ME/EPP
  const [painelDesempateMe, setPainelDesempateMe] = useState<{
    itemId: string;
    numeroItem: string;
    lanceSugerido: number;
    margemPercentual: number;
    motivo: string;
  } | null>(null);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const timeoutsRef = useRef<NodeJS.Timeout[]>([]);
  const rodadaContadorRef = useRef<number>(1);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timeoutsRef.current.forEach((t) => clearTimeout(t));
      timeoutsRef.current = [];
    };
  }, []);

  // Inicializa o cenário conforme props
  const carregarOrigem = useCallback(
    (tipoOrigem: string) => {
      setEmExecucao(false);
      setDisputaEncerrada(false);
      setPainelDesempateMe(null);
      setTempoRestante(tempoInicialConfig);

      if (tipoOrigem === "DEMO" || !tipoOrigem) {
        const demo = gerarCenarioDemoDisputa();
        setItens(demo.itens);
        setConfig(demo.config);
        setOrigemSelecionada("DEMO");
        setFitaLances([
          {
            id: `init-1`,
            itemId: demo.itens[0].itemId,
            numeroItem: demo.itens[0].numeroItem,
            autorNome: "Sua Empresa",
            isMinhaEmpresa: true,
            isMeEpp: true,
            valorUnitario: demo.itens[0].propostaUnitaria,
            valorTotal: demo.itens[0].propostaUnitaria * demo.itens[0].quantidade,
            timestamp: Date.now() - 5000,
            tempoRestanteSegundos: 45,
            tipoDisparo: "PROPOSTA_INICIAL",
            mensagem: "Proposta inicial cadastrada no sistema.",
          },
        ]);
      } else {
        // Origem de licitação real selecionada
        const salaEncontrada =
          salasDisponiveis.find((s) => s.id === tipoOrigem) ||
          (licitacaoInicial && licitacaoInicial.id === tipoOrigem ? licitacaoInicial : null);

        if (salaEncontrada && Array.isArray(salaEncontrada.regrasItens) && salaEncontrada.regrasItens.length > 0) {
          setItens(salaEncontrada.regrasItens);
          setOrigemSelecionada(salaEncontrada.id);
          setFitaLances([
            {
              id: `init-opp`,
              itemId: salaEncontrada.regrasItens[0]?.itemId || "1",
              numeroItem: salaEncontrada.regrasItens[0]?.numeroItem || "01",
              autorNome: "Sua Empresa",
              isMinhaEmpresa: true,
              isMeEpp: true,
              valorUnitario: salaEncontrada.regrasItens[0]?.propostaUnitaria || 0,
              valorTotal:
                (salaEncontrada.regrasItens[0]?.propostaUnitaria || 0) *
                (salaEncontrada.regrasItens[0]?.quantidade || 1),
              timestamp: Date.now(),
              tempoRestanteSegundos: 45,
              tipoDisparo: "PROPOSTA_INICIAL",
              mensagem: `Certame importado do Pipeline: ${salaEncontrada.numeroEdital}`,
            },
          ]);
        } else {
          // Fallback para demo
          const demo = gerarCenarioDemoDisputa();
          setItens(demo.itens);
          setConfig(demo.config);
          setOrigemSelecionada("DEMO");
        }
      }
    },
    [licitacaoInicial, salasDisponiveis, tempoInicialConfig],
  );

  useEffect(() => {
    if (open) {
      if (licitacaoInicial && licitacaoInicial.regrasItens && licitacaoInicial.regrasItens.length > 0) {
        carregarOrigem(licitacaoInicial.id);
      } else {
        carregarOrigem("DEMO");
      }
    } else {
      setEmExecucao(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, licitacaoInicial?.id]);

  // Tick da Simulação (Relógio Acelerado de 1 segundo)
  useEffect(() => {
    if (!emExecucao || pausaEmergencia || disputaEncerrada) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(() => {
      setTempoRestante((prev) => {
        if (prev <= 1) {
          // Encerramento da rodada
          setEmExecucao(false);
          setDisputaEncerrada(true);

          // Checagem de Desempate ME/EPP
          if (minhaEmpresaMeEpp) {
            // Varre itens para ver se há direito de desempate
            for (const it of itens) {
              if (it.minhaPosicao !== 1 && it.melhorLanceSala != null) {
                const checkMe = verificarEmpateFictoMeEpp(
                  it.melhorLanceSala,
                  false, // Assume que líder foi comum
                  it.meuUltimoLance,
                  it.pisoUnitarioSeguro,
                  true,
                );
                if (checkMe.podeDesempatar) {
                  setPainelDesempateMe({
                    itemId: it.itemId,
                    numeroItem: it.numeroItem,
                    lanceSugerido: checkMe.lanceSugerido,
                    margemPercentual: checkMe.margemPercentual,
                    motivo: checkMe.motivo,
                  });
                  break;
                }
              }
            }
          }

          setNotificacao({
            tipo: "info",
            texto: "🏁 Sessão pública encerrada. Resumo final dos itens computado com sucesso.",
          });
          return 0;
        }

        rodadaContadorRef.current += 1;
        const novoTempo = prev - 1;

        // Contexto para avaliação
        const contexto: ContextoDisputa = {
          pausaEmergencia,
          tempoRestanteSegundos: novoTempo,
          segundosFinaisSniper: segundosSniper,
          tempoRespostaSegundos: 3,
          modoDisputa,
          minhaEmpresaMeEpp,
        };

        // 1. Simula lances dos concorrentes virtuais
        setItens((itensAtuais) => {
          let houveLanceNovoNoItem = false;
          let tempoComProrrogacao = novoTempo;

          const itensAtualizados = itensAtuais.map((item) => {
            // Tenta lance de concorrente aleatório a cada 3 a 5 ciclos
            const lanceRival = simularLanceConcorrente(
              item,
              perfilConcorrente,
              novoTempo,
              rodadaContadorRef.current,
            );

            let itemAtualizado = { ...item };

            if (lanceRival) {
              houveLanceNovoNoItem = true;
              itemAtualizado.melhorLanceSala = lanceRival.valorUnitario;
              itemAtualizado.minhaPosicao =
                item.meuUltimoLance && item.meuUltimoLance < lanceRival.valorUnitario ? 1 : 2;

              setFitaLances((fita) => [lanceRival, ...fita.slice(0, 49)]);

              // Prorrogação automática da Lei 14.133/2021 se houver lance nos 10s finais
              if (novoTempo <= 10) {
                tempoComProrrogacao = Math.min(novoTempo + 15, 60);
                setNotificacao({
                  tipo: "warning",
                  texto: `⏱️ Prorrogação Automática (+15s): Concorrente deu lance no Item ${item.numeroItem} nos momentos finais!`,
                });
              }
            }

            // 2. Avalia reação autônoma do Robô
            const decisaoRobo = avaliarProximoLance(itemAtualizado, {
              ...contexto,
              tempoRestanteSegundos: tempoComProrrogacao,
            });

            if (decisaoRobo.deveDisparar && decisaoRobo.novoValorUnitario) {
              const meuNovoValor = decisaoRobo.novoValorUnitario;
              const meuNovoTotal = decisaoRobo.novoValorTotal || meuNovoValor * item.quantidade;

              itemAtualizado.meuUltimoLance = meuNovoValor;
              itemAtualizado.melhorLanceSala = meuNovoValor;
              itemAtualizado.minhaPosicao = 1;
              itemAtualizado.statusItem = decisaoRobo.pisoAtingido ? "PISO_ATINGIDO" : "EM_DISPUTA";

              const meuLanceEvento: LanceDisputaEvento = {
                id: `lance-meu-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
                itemId: item.itemId,
                numeroItem: item.numeroItem,
                autorNome: `Sua Empresa (${decisaoRobo.taticaUsada || "Robô"})`,
                isMinhaEmpresa: true,
                isMeEpp: minhaEmpresaMeEpp,
                valorUnitario: meuNovoValor,
                valorTotal: meuNovoTotal,
                timestamp: Date.now(),
                tempoRestanteSegundos: tempoComProrrogacao,
                tipoDisparo: decisaoRobo.taticaUsada === "SNIPER" ? "SNIPER" : "IMEDIATO",
                mensagem: decisaoRobo.motivo,
              };

              setFitaLances((fita) => [meuLanceEvento, ...fita.slice(0, 49)]);

              // Prorrogação se nosso lance também ocorreu nos últimos 10s
              if (tempoComProrrogacao <= 10) {
                tempoComProrrogacao = Math.min(tempoComProrrogacao + 15, 60);
              }
            } else if (decisaoRobo.pisoAtingido) {
              itemAtualizado.statusItem = "PISO_ATINGIDO";
            }

            return itemAtualizado;
          });

          if (tempoComProrrogacao !== novoTempo) {
            setTempoRestante(tempoComProrrogacao);
          }

          return itensAtualizados;
        });

        return novoTempo;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [
    emExecucao,
    pausaEmergencia,
    disputaEncerrada,
    segundosSniper,
    modoDisputa,
    perfilConcorrente,
    minhaEmpresaMeEpp,
    itens,
  ]);

  // Forçar lance rival manual para teste de estresse
  const handleForcarLanceRival = (itemAlvo: DisputaItemRegra) => {
    const melhorAtual = itemAlvo.melhorLanceSala || itemAlvo.propostaUnitaria;
    const desconto = round2(Math.max(1.0, melhorAtual * 0.01));
    const novoValorRival = round2(melhorAtual - desconto);

    if (novoValorRival <= 0) return;

    const lanceRivalManual: LanceDisputaEvento = {
      id: `manual-rival-${Date.now()}`,
      itemId: itemAlvo.itemId,
      numeroItem: itemAlvo.numeroItem,
      autorNome: "Concorrente Desafiante (Injetado)",
      isMinhaEmpresa: false,
      isMeEpp: false,
      valorUnitario: novoValorRival,
      valorTotal: round2(novoValorRival * itemAlvo.quantidade),
      timestamp: Date.now(),
      tempoRestanteSegundos: tempoRestante,
      tipoDisparo: "LANCE_MANUAL",
      mensagem: `Lance concorrente de R$ ${novoValorRival.toFixed(2)} injetado manualmente para teste.`,
    };

    setFitaLances((prev) => [lanceRivalManual, ...prev.slice(0, 49)]);

    setItens((prev) =>
      prev.map((it) => {
        if (it.itemId === itemAlvo.itemId) {
          const novoItem = {
            ...it,
            melhorLanceSala: novoValorRival,
            minhaPosicao: 2,
          };

          // Avalia se o robô responde no próximo ciclo ou de imediato
          const decisao = avaliarProximoLance(novoItem, {
            pausaEmergencia,
            tempoRestanteSegundos: tempoRestante,
            segundosFinaisSniper: segundosSniper,
            tempoRespostaSegundos: 3,
            modoDisputa,
            minhaEmpresaMeEpp,
          });

          if (decisao.deveDisparar && decisao.novoValorUnitario) {
            novoItem.meuUltimoLance = decisao.novoValorUnitario;
            novoItem.melhorLanceSala = decisao.novoValorUnitario;
            novoItem.minhaPosicao = 1;

            const meuContraLance: LanceDisputaEvento = {
              id: `lance-contra-${Date.now()}`,
              itemId: it.itemId,
              numeroItem: it.numeroItem,
              autorNome: `Sua Empresa (${decisao.taticaUsada || "Robô"})`,
              isMinhaEmpresa: true,
              isMeEpp: minhaEmpresaMeEpp,
              valorUnitario: decisao.novoValorUnitario,
              valorTotal: round2(decisao.novoValorUnitario * it.quantidade),
              timestamp: Date.now(),
              tempoRestanteSegundos: tempoRestante,
              tipoDisparo: decisao.taticaUsada === "SNIPER" ? "SNIPER" : "IMEDIATO",
              mensagem: decisao.motivo,
            };
            setFitaLances((f) => [meuContraLance, ...f]);
          } else if (decisao.pisoAtingido) {
            novoItem.statusItem = "PISO_ATINGIDO";
          }

          return novoItem;
        }
        return it;
      }),
    );

    setNotificacao({
      tipo: "info",
      texto: `💥 Lance concorrente de ${formatBRL(novoValorRival)} injetado no Item ${itemAlvo.numeroItem}. Observe a reação do robô!`,
    });
  };

  // Exercer Direito de Preferência ME/EPP
  const handleExercerDesempateMeEpp = () => {
    if (!painelDesempateMe) return;

    const itemAlvo = itens.find((i) => i.itemId === painelDesempateMe.itemId);
    if (!itemAlvo) return;

    const lanceDesempate: LanceDisputaEvento = {
      id: `me-epp-win-${Date.now()}`,
      itemId: itemAlvo.itemId,
      numeroItem: itemAlvo.numeroItem,
      autorNome: "Sua Empresa (Desempate LC 123/2006)",
      isMinhaEmpresa: true,
      isMeEpp: true,
      valorUnitario: painelDesempateMe.lanceSugerido,
      valorTotal: round2(painelDesempateMe.lanceSugerido * itemAlvo.quantidade),
      timestamp: Date.now(),
      tempoRestanteSegundos: 0,
      tipoDisparo: "DESEMPATE_ME_EPP",
      mensagem: `Direito de preferência exercido: lance de ${formatBRL(painelDesempateMe.lanceSugerido)} arrematou o item!`,
    };

    setFitaLances((prev) => [lanceDesempate, ...prev.slice(0, 49)]);
    setItens((prev) =>
      prev.map((it) =>
        it.itemId === itemAlvo.itemId
          ? {
              ...it,
              meuUltimoLance: painelDesempateMe.lanceSugerido,
              melhorLanceSala: painelDesempateMe.lanceSugerido,
              minhaPosicao: 1,
              statusItem: "VENCEDOR",
            }
          : it,
      ),
    );

    setPainelDesempateMe(null);
    setNotificacao({
      tipo: "success",
      texto: `🏆 Direito de preferência exercido com sucesso! Sua empresa venceu o Item ${itemAlvo.numeroItem} por ${formatBRL(painelDesempateMe.lanceSugerido)}.`,
    });
  };

  // Exportar Fita de Lances para download
  const handleExportarLog = () => {
    const relatorio = {
      titulo: "Relatório de Sessão Simulada de Pregão (Auto-Bidder Sandbox)",
      geradoEm: new Date().toISOString(),
      origem: origemSelecionada,
      plano: planoTenant,
      itensDisputados: itens.map((it) => ({
        item: it.numeroItem,
        descricao: it.descricao,
        quantidade: it.quantidade,
        pisoUnitarioSeguro: it.pisoUnitarioSeguro,
        meuUltimoLance: it.meuUltimoLance,
        melhorLanceFinal: it.melhorLanceSala,
        posicaoFinal: it.minhaPosicao,
        status: it.statusItem,
        tatica: it.tatica,
      })),
      fitaLances,
    };

    const blob = new Blob([JSON.stringify(relatorio, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `log-disputa-simulada-${new Date().toISOString().split("T")[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const totalPisoSeguroGeral = itens.reduce(
    (acc, it) => acc + round2(it.pisoUnitarioSeguro * (it.quantidade || 1)),
    0,
  );
  const itensVencendo = itens.filter((it) => it.minhaPosicao === 1).length;
  const isPlanoBasico = planoTenant === "BASICO";

  return (
    <Modal
      open={open}
      modalHeading="🎮 Sala de Disputa Simulada (Auto-Bidder Sandbox)"
      modalLabel="Ambiente de Teste em Tempo Real — Lei 14.133/2021 & LC 123/2006"
      primaryButtonText={emExecucao ? "Pausar Simulação" : disputaEncerrada ? "Reiniciar Disputa" : "Iniciar Disputa"}
      secondaryButtonText="Fechar Sala"
      onRequestClose={onRequestClose}
      onRequestSubmit={() => {
        if (disputaEncerrada) {
          carregarOrigem(origemSelecionada);
          setEmExecucao(true);
        } else {
          setEmExecucao(!emExecucao);
        }
      }}
      size="lg"
      preventCloseOnClickOutside
      hasScrollingContent
    >
      <div style={{ padding: "0.5rem 0" }}>
        {/* Banner para Plano Básico (Modo Vitrine Demo) */}
        {isPlanoBasico && (
          <InlineNotification
            style={{ marginBottom: "1rem" }}
            kind="info"
            title="Modo Vitrine de Demonstração (Plano Básico)"
            subtitle="Você está testando o Robô no Cenário Demo pré-montado. Faça upgrade para o Plano PRO ou ENTERPRISE para conectar o Robô diretamente aos editais reais do seu Pipeline e aos portais oficiais de compras."
          />
        )}

        {/* Notificações Dinâmicas */}
        {notificacao && (
          <InlineNotification
            style={{ marginBottom: "1rem" }}
            kind={notificacao.tipo}
            title="Aviso da Sala de Disputa"
            subtitle={notificacao.texto}
            onCloseButtonClick={() => setNotificacao(null)}
          />
        )}

        {/* Painel Especial de Empate Ficto ME/EPP */}
        {painelDesempateMe && (
          <Tile
            style={{
              marginBottom: "1rem",
              border: "2px solid var(--cds-support-warning, #f1c21b)",
              backgroundColor: "var(--cds-layer-02, #f4f4f4)",
              padding: "1rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
              <div>
                <h4 style={{ margin: 0, fontSize: "1rem", fontWeight: 700, color: "var(--cds-text-primary)" }}>
                  ⚖️ Oportunidade de Desempate ME/EPP (Lei Complementar 123/2006)
                </h4>
                <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.85rem", color: "var(--cds-text-secondary)" }}>
                  {painelDesempateMe.motivo}
                </p>
              </div>
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                <Button
                  size="sm"
                  kind="primary"
                  renderIcon={Flash}
                  onClick={handleExercerDesempateMeEpp}
                >
                  Cobrir com {formatBRL(painelDesempateMe.lanceSugerido)}
                </Button>
                <Button
                  size="sm"
                  kind="ghost"
                  onClick={() => setPainelDesempateMe(null)}
                >
                  Declinar
                </Button>
              </div>
            </div>
          </Tile>
        )}

        {/* Barra Superior de Controles e Cronômetro */}
        <Tile style={{ padding: "1.25rem", marginBottom: "1rem", backgroundColor: "var(--cds-layer-01, #ffffff)" }}>
          <Grid style={{ padding: 0 }}>
            {/* Seletor de Origem */}
            <Column lg={4} md={2} sm={4} style={{ marginBottom: "0.75rem" }}>
              <Select
                id="select-origem-disputa"
                labelText="Certame / Origem dos Dados"
                value={origemSelecionada}
                disabled={emExecucao}
                onChange={(e) => carregarOrigem(e.target.value)}
              >
                <SelectItem value="DEMO" text="🎯 Cenário Demo (3 Itens Pré-Montados)" />
                {!isPlanoBasico &&
                  salasDisponiveis.map((s) => (
                    <SelectItem key={s.id} value={s.id} text={`📁 ${s.numeroEdital} - ${s.orgao}`} />
                  ))}
              </Select>
            </Column>

            {/* Perfil de Concorrentes */}
            <Column lg={3} md={2} sm={4} style={{ marginBottom: "0.75rem" }}>
              <Select
                id="select-perfil-concorrente"
                labelText="Perfil Concorrentes Virtuais"
                value={perfilConcorrente}
                onChange={(e) => setPerfilConcorrente(e.target.value as PerfilConcorrenteVirtual)}
              >
                <SelectItem value="MODERADO" text="Moderado (Disputa Equilibrada)" />
                <SelectItem value="AGRESSIVO" text="Agressivo (Quedas Fortes)" />
                <SelectItem value="CONSERVADOR" text="Conservador (Poucos Lances)" />
              </Select>
            </Column>

            {/* Tempo Restante & Cronômetro */}
            <Column lg={3} md={2} sm={4} style={{ marginBottom: "0.75rem" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)", marginBottom: "0.25rem" }}>
                Relógio da Disputa (Acelerado)
              </div>
              <div
                style={{
                  fontSize: "1.5rem",
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  color:
                    tempoRestante <= 10 && tempoRestante > 0
                      ? "var(--cds-support-error, #da1e28)"
                      : tempoRestante === 0
                      ? "var(--cds-text-secondary)"
                      : "var(--cds-interactive, #0f62fe)",
                }}
              >
                <Time size={22} />
                {disputaEncerrada ? "00:00 (Fim)" : `00:${tempoRestante < 10 ? `0${tempoRestante}` : tempoRestante}`}
                {tempoRestante <= segundosSniper && tempoRestante > 0 && (
                  <Tag type="red" size="sm">
                    🎯 Sniper ({tempoRestante}s)
                  </Tag>
                )}
              </div>
            </Column>

            {/* Botão de Emergência / Pânico */}
            <Column lg={2} md={2} sm={4} style={{ display: "flex", alignItems: "flex-end", marginBottom: "0.75rem" }}>
              <Button
                kind={pausaEmergencia ? "danger" : "danger--tertiary"}
                size="md"
                style={{ width: "100%" }}
                renderIcon={pausaEmergencia ? Play : Pause}
                onClick={() => {
                  const novoStatus = !pausaEmergencia;
                  setPausaEmergencia(novoStatus);
                  setNotificacao({
                    tipo: novoStatus ? "warning" : "success",
                    texto: novoStatus
                      ? "🛑 PAUSA DE EMERGÊNCIA ATIVADA: Todos os lances do robô foram congelados instantaneamente."
                      : "▶️ Disputa retomada. O robô voltou a atuar nas oportunidades viáveis.",
                  });
                }}
              >
                {pausaEmergencia ? "Retomar Robô" : "Pausa Pânico"}
              </Button>
            </Column>
          </Grid>

          {/* Métricas Rápidas */}
          <div
            style={{
              display: "flex",
              gap: "1.5rem",
              flexWrap: "wrap",
              marginTop: "0.5rem",
              paddingTop: "0.75rem",
              borderTop: "1px solid var(--cds-border-subtle, #e0e0e0)",
              fontSize: "0.85rem",
            }}
          >
            <div>
              <span style={{ color: "var(--cds-text-secondary)" }}>Portal Simulado: </span>
              <strong>{config.portal}</strong>
            </div>
            <div>
              <span style={{ color: "var(--cds-text-secondary)" }}>Piso Protegido Total: </span>
              <strong style={{ color: "var(--cds-support-info, #0043ce)" }}>
                <Locked size={14} style={{ verticalAlign: "middle", marginRight: "3px" }} />
                {formatBRL(totalPisoSeguroGeral)}
              </strong>
            </div>
            <div>
              <span style={{ color: "var(--cds-text-secondary)" }}>Itens em 1º Lugar: </span>
              <strong style={{ color: "var(--cds-support-success, #24a148)" }}>
                {itensVencendo} de {itens.length}
              </strong>
            </div>
            <div>
              <span style={{ color: "var(--cds-text-secondary)" }}>Status do Robô: </span>
              <Tag type={pausaEmergencia ? "red" : emExecucao ? "green" : "cool-gray"} size="sm">
                {pausaEmergencia ? "🛑 Em Pausa Preventiva" : emExecucao ? "● Operando em Tempo Real" : "⏸️ Em Espera"}
              </Tag>
            </div>
          </div>
        </Tile>

        {/* Grid de Itens em Disputa */}
        <div style={{ marginBottom: "1.5rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
            <h4 style={{ margin: 0, fontSize: "1rem", fontWeight: 600 }}>
              📋 Grade de Itens da Sala de Disputa ({itens.length})
            </h4>
            <div style={{ fontSize: "0.8rem", color: "var(--cds-text-secondary)" }}>
              Trava de Piso Seguro calculada via Aba Calculadora • Lei 14.133/2021
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "1rem" }}>
            {itens.map((item) => {
              const estaVencendo = item.minhaPosicao === 1;
              const pisoAtingido = item.statusItem === "PISO_ATINGIDO";

              return (
                <Tile
                  key={item.itemId}
                  style={{
                    padding: "1rem",
                    borderLeft: estaVencendo
                      ? "4px solid var(--cds-support-success, #24a148)"
                      : pisoAtingido
                      ? "4px solid var(--cds-support-error, #da1e28)"
                      : "4px solid var(--cds-interactive, #0f62fe)",
                    position: "relative",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.5rem" }}>
                    <div>
                      <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>
                        Item {item.numeroItem} ({item.quantidade} {item.unidade})
                      </span>
                      <div
                        style={{
                          fontSize: "0.78rem",
                          color: "var(--cds-text-secondary)",
                          maxWidth: "240px",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                        title={item.descricao}
                      >
                        {item.descricao}
                      </div>
                    </div>
                    <Tag
                      type={estaVencendo ? "green" : pisoAtingido ? "red" : "cool-gray"}
                      size="sm"
                    >
                      {estaVencendo ? "🥇 1º Lugar" : pisoAtingido ? "🔒 Piso Atingido" : `${item.minhaPosicao || 2}º Lugar`}
                    </Tag>
                  </div>

                  {/* Preços e Valores */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "0.5rem",
                      backgroundColor: "var(--cds-layer-accent, #f4f4f4)",
                      padding: "0.6rem 0.75rem",
                      borderRadius: "4px",
                      marginBottom: "0.75rem",
                      fontSize: "0.8rem",
                    }}
                  >
                    <div>
                      <div style={{ color: "var(--cds-text-secondary)", fontSize: "0.72rem" }}>Menor Oferta Sala</div>
                      <div style={{ fontWeight: 700, color: "var(--cds-text-primary)" }}>
                        {formatBRL(item.melhorLanceSala || item.propostaUnitaria)}
                      </div>
                    </div>
                    <div>
                      <div style={{ color: "var(--cds-text-secondary)", fontSize: "0.72rem" }}>Seu Último Lance</div>
                      <div style={{ fontWeight: 700, color: estaVencendo ? "var(--cds-support-success, #24a148)" : "var(--cds-text-primary)" }}>
                        {formatBRL(item.meuUltimoLance || item.propostaUnitaria)}
                      </div>
                    </div>
                    <div>
                      <div style={{ color: "var(--cds-text-secondary)", fontSize: "0.72rem" }}>Piso Seguro 🔒</div>
                      <div style={{ fontWeight: 700, color: "var(--cds-support-info, #0043ce)" }}>
                        {formatBRL(item.pisoUnitarioSeguro)}
                      </div>
                    </div>
                    <div>
                      <div style={{ color: "var(--cds-text-secondary)", fontSize: "0.72rem" }}>Tática & Decremento</div>
                      <div style={{ fontWeight: 600 }}>
                        {item.tatica} ({item.tipoDecremento === "CENTAVOS_1" ? "R$ 0,01" : `R$ ${item.valorDecremento}`})
                      </div>
                    </div>
                  </div>

                  {/* Controles do Item */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}>
                    <div style={{ display: "flex", gap: "0.25rem" }}>
                      <Button
                        size="sm"
                        kind={item.tatica === "IMEDIATO" ? "primary" : "ghost"}
                        onClick={() => {
                          setItens((prev) =>
                            prev.map((i) =>
                              i.itemId === item.itemId ? { ...i, tatica: "IMEDIATO" } : i,
                            ),
                          );
                        }}
                      >
                        Imediato
                      </Button>
                      <Button
                        size="sm"
                        kind={item.tatica === "SNIPER" ? "primary" : "ghost"}
                        onClick={() => {
                          setItens((prev) =>
                            prev.map((i) =>
                              i.itemId === item.itemId ? { ...i, tatica: "SNIPER" } : i,
                            ),
                          );
                        }}
                      >
                        Sniper
                      </Button>
                      <Button
                        size="sm"
                        kind={item.tatica === "MONITORAR" ? "primary" : "ghost"}
                        onClick={() => {
                          setItens((prev) =>
                            prev.map((i) =>
                              i.itemId === item.itemId ? { ...i, tatica: "MONITORAR" } : i,
                            ),
                          );
                        }}
                      >
                        Monitorar
                      </Button>
                    </div>

                    <Button
                      size="sm"
                      kind="tertiary"
                      disabled={pisoAtingido || disputaEncerrada}
                      onClick={() => handleForcarLanceRival(item)}
                    >
                      💥 Forçar Rival
                    </Button>
                  </div>
                </Tile>
              );
            })}
          </div>
        </div>

        {/* Fita de Lances em Tempo Real (Tape) */}
        <Tile style={{ padding: "1.25rem", backgroundColor: "var(--cds-layer-01, #ffffff)" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "0.75rem",
              flexWrap: "wrap",
              gap: "0.5rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Flash size={18} />
              <h4 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 600 }}>
                Fita de Lances em Tempo Real (Audit Tape)
              </h4>
              <Tag type="cool-gray" size="sm">
                {fitaLances.length} evento(s)
              </Tag>
            </div>

            <Button
              size="sm"
              kind="ghost"
              renderIcon={Download}
              onClick={handleExportarLog}
              disabled={fitaLances.length === 0}
            >
              Exportar Log (.JSON)
            </Button>
          </div>

          <div
            style={{
              maxHeight: "220px",
              overflowY: "auto",
              fontFamily: "var(--cds-code-01-font-family, 'IBM Plex Mono', monospace)",
              fontSize: "0.78rem",
              border: "1px solid var(--cds-border-subtle, #e0e0e0)",
              backgroundColor: "var(--cds-layer-accent, #fafafa)",
              borderRadius: "4px",
              padding: "0.5rem",
            }}
          >
            {fitaLances.length === 0 ? (
              <div style={{ padding: "1.5rem", textAlign: "center", color: "var(--cds-text-secondary)" }}>
                Nenhum lance registrado na fita até o momento. Inicie a disputa para começar.
              </div>
            ) : (
              fitaLances.map((ev) => (
                <div
                  key={ev.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "0.35rem 0.5rem",
                    borderBottom: "1px solid var(--cds-border-subtle, #ebebeb)",
                    backgroundColor: ev.isMinhaEmpresa
                      ? "rgba(36, 161, 72, 0.08)"
                      : "transparent",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <span style={{ color: "var(--cds-text-secondary)", minWidth: "55px" }}>
                      T-{ev.tempoRestanteSegundos}s
                    </span>
                    <Tag
                      type={
                        ev.tipoDisparo === "SNIPER"
                          ? "red"
                          : ev.isMinhaEmpresa
                          ? "green"
                          : "cool-gray"
                      }
                      size="sm"
                    >
                      Item {ev.numeroItem}
                    </Tag>
                    <strong style={{ color: ev.isMinhaEmpresa ? "var(--cds-support-success, #24a148)" : "var(--cds-text-primary)" }}>
                      {ev.autorNome}
                    </strong>
                    <span style={{ color: "var(--cds-text-secondary)" }}>
                      {ev.mensagem}
                    </span>
                  </div>

                  <div style={{ fontWeight: 700, color: ev.isMinhaEmpresa ? "var(--cds-support-success, #24a148)" : "var(--cds-text-primary)" }}>
                    {formatBRL(ev.valorUnitario)}
                  </div>
                </div>
              ))
            )}
          </div>
        </Tile>
      </div>
    </Modal>
  );
}
