"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  Toggle,
} from "@carbon/react";
import { Download, Flash, Locked, Pause, Play, Time } from "@carbon/icons-react";
import {
  type DisputaItemRegra,
  type TaticaDisputa,
  round2,
} from "@/server/schemas/proposta-calculadora.schema";
import {
  type AvisoSimulacao,
  type EstadoSimulacao,
  type ModoDisputaSimulacao,
  type ParametrosSimulacao,
  type PerfilConcorrenteVirtual,
  alterarTaticaItem,
  criarEstadoSimulacao,
  declinarDesempateMeEpp,
  executarTickSimulacao,
  exercerDesempateMeEpp,
  gerarCenarioDemoDisputa,
  injetarLanceRival,
  listarItensPisoMaiorQueProposta,
  listarItensSemPiso,
  normalizarItensParaSimulacao,
} from "@/lib/robo-lances-engine";

interface CertameSimulavel {
  id: string;
  numeroEdital: string;
  orgao: string;
  portal?: string;
  modoDisputaEdital?: "ABERTO" | "ABERTO_FECHADO" | "FECHADO_ABERTO";
  pausaEmergencia?: boolean;
  segundosFinaisSniper?: number;
  regrasItens?: unknown[];
}

export interface SalaSimuladaModalProps {
  open: boolean;
  onRequestClose: () => void;
  licitacaoInicial?: CertameSimulavel | null;
  planoTenant?: "BASICO" | "PRO" | "ENTERPRISE";
  salasDisponiveis?: CertameSimulavel[];
  preferenciaMeInicial?: boolean;
}

const ORIGEM_DEMO = "DEMO";
const SEM_SALAS: CertameSimulavel[] = [];

function formatBRL(valor: number | null | undefined): string {
  return (valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatRelogio(segundos: number): string {
  const s = Math.max(0, segundos);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function estadoDemo(): { estado: EstadoSimulacao; portal: string } {
  const demo = gerarCenarioDemoDisputa();
  return { estado: criarEstadoSimulacao(demo.itens), portal: demo.config.portal };
}

function rotuloPosicao(item: DisputaItemRegra): { texto: string; tipo: "green" | "red" | "cool-gray" | "warm-gray" | "teal" } {
  if (item.statusItem === "VENCEDOR") return { texto: "🏆 Arrematado", tipo: "green" };
  if (item.minhaPosicao === 1) return { texto: "🥇 1º Lugar", tipo: "green" };
  if (item.statusItem === "PISO_ATINGIDO") return { texto: "🔒 Piso Atingido", tipo: "red" };
  if (item.statusItem === "FINALIZADO") return { texto: "Não arrematado", tipo: "warm-gray" };
  return { texto: `${item.minhaPosicao || 2}º Lugar`, tipo: "cool-gray" };
}

function rotuloDecremento(item: DisputaItemRegra): string {
  if (item.tipoDecremento === "PERCENTUAL") return `${item.valorDecremento}%`;
  if (item.tipoDecremento === "FIXO_REAIS") return formatBRL(item.valorDecremento);
  return "R$ 0,01";
}

export function SalaSimuladaModal({
  open,
  onRequestClose,
  licitacaoInicial,
  planoTenant = "PRO",
  salasDisponiveis = SEM_SALAS,
  preferenciaMeInicial = true,
}: SalaSimuladaModalProps) {
  const isPlanoBasico = planoTenant === "BASICO";

  const [origemSelecionada, setOrigemSelecionada] = useState<string>(ORIGEM_DEMO);
  const [portal, setPortal] = useState<string>("Compras.gov.br");
  const [estado, setEstado] = useState<EstadoSimulacao>(() => estadoDemo().estado);
  const [emExecucao, setEmExecucao] = useState(false);

  const [perfilConcorrente, setPerfilConcorrente] = useState<PerfilConcorrenteVirtual>("MODERADO");
  const [pausaEmergencia, setPausaEmergencia] = useState(false);
  const [modoDisputa, setModoDisputa] = useState<ModoDisputaSimulacao>("ABERTO");
  const [minhaEmpresaMeEpp, setMinhaEmpresaMeEpp] = useState(preferenciaMeInicial);
  const [segundosSniper, setSegundosSniper] = useState(10);

  const [notificacao, setNotificacao] = useState<Omit<AvisoSimulacao, "id"> | null>(null);
  const [avisoOrigem, setAvisoOrigem] = useState<Omit<AvisoSimulacao, "id"> | null>(null);

  const parametros: ParametrosSimulacao = {
    perfil: perfilConcorrente,
    pausaEmergencia,
    segundosFinaisSniper: segundosSniper,
    minhaEmpresaMeEpp,
    modoDisputa,
  };
  const parametrosRef = useRef(parametros);
  parametrosRef.current = parametros;

  // Certames reais disponíveis (o atalho do Dossiê pode não estar na lista)
  const certames = useMemo(() => {
    if (isPlanoBasico) return SEM_SALAS;
    const lista = [...salasDisponiveis];
    if (licitacaoInicial && !lista.some((s) => s.id === licitacaoInicial.id)) {
      lista.unshift(licitacaoInicial);
    }
    return lista;
  }, [isPlanoBasico, salasDisponiveis, licitacaoInicial]);

  const carregarOrigem = useCallback(
    (origem: string) => {
      setEmExecucao(false);
      setPausaEmergencia(false);
      setNotificacao(null);
      setAvisoOrigem(null);

      const certame = origem === ORIGEM_DEMO ? null : certames.find((c) => c.id === origem);
      const itens = certame ? normalizarItensParaSimulacao(certame.regrasItens || []) : [];

      if (!certame || itens.length === 0) {
        const demo = estadoDemo();
        setEstado(demo.estado);
        setPortal(demo.portal);
        setOrigemSelecionada(ORIGEM_DEMO);
        setModoDisputa("ABERTO");
        setSegundosSniper(10);
        setPausaEmergencia(false);
        if (certame) {
          setAvisoOrigem({
            tipo: "info",
            texto: `O certame ${certame.numeroEdital} ainda não tem itens configurados na aba ⚡ Disputa. Carregamos o Cenário Demo para você testar.`,
          });
        }
        return;
      }

      setEstado(criarEstadoSimulacao(itens));
      setPortal(certame.portal || "Compras.gov.br");
      setOrigemSelecionada(certame.id);
      const pausaInicial = Boolean(certame.pausaEmergencia);
      setPausaEmergencia(pausaInicial);
      if (certame.modoDisputaEdital === "ABERTO_FECHADO") {
        setModoDisputa("ABERTO_FECHADO");
      } else if (certame.modoDisputaEdital === "FECHADO_ABERTO") {
        setModoDisputa("FECHADO_ABERTO");
      } else {
        setModoDisputa("ABERTO");
      }
      if (certame.segundosFinaisSniper && [5, 10, 15, 20].includes(certame.segundosFinaisSniper)) {
        setSegundosSniper(certame.segundosFinaisSniper);
      } else {
        setSegundosSniper(10);
      }

      const pisoMaior = listarItensPisoMaiorQueProposta(itens);
      if (pisoMaior.length > 0) {
        setAvisoOrigem({
          tipo: "error",
          texto: `Configuração bloqueada: Item(ns) ${pisoMaior.map((i) => `#${i.numeroItem}`).join(", ")} com Valor Mínimo (Piso) maior que a Proposta Inicial. Ajuste os valores na aba Disputa antes de simular.`,
        });
      } else {
        const semPiso = listarItensSemPiso(itens);
        if (semPiso.length > 0) {
          setAvisoOrigem({
            tipo: "warning",
            texto: `Item(ns) ${semPiso.map((i) => i.numeroItem).join(", ")} sem Piso Seguro/Proposta na Calculadora: o robô ficará bloqueado neles por segurança.`,
          });
        }
        if (pausaInicial) {
          setNotificacao({
            tipo: "warning",
            texto:
              "🛑 Disputa iniciada com Pausa de Emergência ativa na configuração do certame. Clique em 'Retomar Robô' para liberar os disparos nesta simulação.",
          });
        }
      }
    },
    [certames],
  );

  // Ao abrir: certame do atalho (se permitido) ou Cenário Demo
  useEffect(() => {
    if (!open) {
      setEmExecucao(false);
      return;
    }
    carregarOrigem(licitacaoInicial && !isPlanoBasico ? licitacaoInicial.id : ORIGEM_DEMO);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, licitacaoInicial?.id, isPlanoBasico]);

  // Relógio da sessão: 1 tick por segundo, estado avançado por função pura
  useEffect(() => {
    if (!open || !emExecucao || estado.fase === "ENCERRADA") return;
    const timer = setInterval(() => {
      setEstado((prev) => executarTickSimulacao(prev, parametrosRef.current));
    }, 1000);
    return () => clearInterval(timer);
  }, [open, emExecucao, estado.fase]);

  useEffect(() => {
    if (estado.fase === "ENCERRADA") setEmExecucao(false);
  }, [estado.fase]);

  // Avisos emitidos pelo motor
  const ultimoAvisoId = estado.ultimoAviso?.id;
  useEffect(() => {
    if (estado.ultimoAviso) {
      setNotificacao({ tipo: estado.ultimoAviso.tipo, texto: estado.ultimoAviso.texto });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ultimoAvisoId]);

  const itensPisoInvalido = useMemo(
    () => listarItensPisoMaiorQueProposta(estado.itens),
    [estado.itens],
  );
  const encerrada = estado.fase === "ENCERRADA";
  const sessaoIniciada = emExecucao || encerrada || estado.tempoRestante < 45;

  const handleAlternarPausa = () => {
    const novoStatus = !pausaEmergencia;
    setPausaEmergencia(novoStatus);
    setNotificacao({
      tipo: novoStatus ? "warning" : "success",
      texto: novoStatus
        ? "🛑 PAUSA DE EMERGÊNCIA: o robô parou de enviar lances. O relógio e os concorrentes continuam, como na sessão real."
        : "▶️ Robô retomado. Ele volta a atuar nos itens viáveis.",
    });
  };

  const handleExportarLog = () => {
    const relatorio = {
      titulo: "Relatório de Sessão Simulada de Pregão (Auto-Bidder Sandbox)",
      geradoEm: new Date().toISOString(),
      origem: origemSelecionada,
      portal,
      plano: planoTenant,
      parametros: { ...parametros },
      itens: estado.itens.map((it) => ({
        item: it.numeroItem,
        descricao: it.descricao,
        quantidade: it.quantidade,
        tatica: it.tatica,
        pisoUnitarioSeguro: it.pisoUnitarioSeguro,
        meuUltimoLance: it.meuUltimoLance,
        melhorLanceFinal: it.melhorLanceSala,
        posicaoFinal: it.minhaPosicao,
        status: it.statusItem,
      })),
      fitaLances: [...estado.eventos].reverse(),
    };
    const blob = new Blob([JSON.stringify(relatorio, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `log-disputa-simulada-${new Date().toISOString().split("T")[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const totalPisoSeguro = estado.itens.reduce(
    (acc, it) => acc + round2(it.pisoUnitarioSeguro * (it.quantidade || 1)),
    0,
  );
  const itensNaLideranca = estado.itens.filter((it) => it.minhaPosicao === 1).length;

  const textoBotaoPrimario = encerrada
    ? "Reiniciar Disputa"
    : emExecucao
    ? "Pausar Simulação"
    : sessaoIniciada
    ? "Continuar Simulação"
    : "Iniciar Disputa";

  return (
    <Modal
      open={open}
      modalHeading="🎮 Sala de Disputa Simulada (Auto-Bidder Sandbox)"
      modalLabel="Ambiente de teste isolado — nenhum lance é enviado a portais reais"
      primaryButtonText={textoBotaoPrimario}
      primaryButtonDisabled={itensPisoInvalido.length > 0}
      secondaryButtonText="Fechar Sala"
      onRequestClose={onRequestClose}
      onRequestSubmit={() => {
        if (itensPisoInvalido.length > 0) {
          setEmExecucao(false);
          setNotificacao({
            tipo: "error",
            texto: `Disputa bloqueada: corrija os itens com Valor Mínimo (Piso) maior que a Proposta Inicial (${itensPisoInvalido.map((i) => `#${i.numeroItem}`).join(", ")}).`,
          });
          return;
        }
        if (encerrada) {
          carregarOrigem(origemSelecionada);
          setEmExecucao(true);
        } else {
          setEmExecucao((v) => !v);
        }
      }}
      size="lg"
      preventCloseOnClickOutside
      hasScrollingContent
    >
      <div style={{ padding: "0.5rem 0" }}>
        {isPlanoBasico && (
          <InlineNotification
            style={{ marginBottom: "1rem" }}
            kind="info"
            lowContrast
            hideCloseButton
            title="Modo Vitrine de Demonstração (Plano Básico)"
            subtitle="Você está testando o Robô no Cenário Demo. Faça upgrade para PRO ou ENTERPRISE para simular com os itens reais do seu Pipeline."
          />
        )}

        {avisoOrigem && (
          <InlineNotification
            style={{ marginBottom: "1rem" }}
            kind={avisoOrigem.tipo}
            lowContrast
            title="Origem dos itens"
            subtitle={avisoOrigem.texto}
            onCloseButtonClick={() => setAvisoOrigem(null)}
          />
        )}

        {notificacao && (
          <InlineNotification
            style={{ marginBottom: "1rem" }}
            kind={notificacao.tipo}
            lowContrast
            title="Sala de Disputa"
            subtitle={notificacao.texto}
            onCloseButtonClick={() => setNotificacao(null)}
          />
        )}

        {/* Direito de preferência ME/EPP */}
        {estado.desempates.map((d) => (
          <Tile
            key={d.itemId}
            style={{
              marginBottom: "1rem",
              border: "2px solid var(--cds-support-warning, #f1c21b)",
              padding: "1rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
              <div>
                <h4 style={{ margin: 0, fontSize: "1rem", fontWeight: 700 }}>
                  ⚖️ Item {d.numeroItem}: Desempate ME/EPP (LC 123/2006)
                </h4>
                <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.85rem", color: "var(--cds-text-secondary)" }}>
                  {d.motivo}
                </p>
              </div>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <Button
                  size="sm"
                  kind="primary"
                  renderIcon={Flash}
                  onClick={() => setEstado((prev) => exercerDesempateMeEpp(prev, d.itemId, minhaEmpresaMeEpp))}
                >
                  Cobrir com {formatBRL(d.lanceSugerido)}
                </Button>
                <Button size="sm" kind="ghost" onClick={() => setEstado((prev) => declinarDesempateMeEpp(prev, d.itemId))}>
                  Declinar
                </Button>
              </div>
            </div>
          </Tile>
        ))}

        {/* Controles da sessão */}
        <Tile style={{ padding: "1.25rem", marginBottom: "1rem", backgroundColor: "var(--cds-layer-01, #ffffff)" }}>
          <Grid style={{ padding: 0 }}>
            <Column lg={5} md={4} sm={4} style={{ marginBottom: "0.75rem" }}>
              <Select
                id="select-origem-disputa"
                labelText="Certame / Origem dos Itens"
                value={origemSelecionada}
                disabled={emExecucao}
                onChange={(e) => carregarOrigem(e.target.value)}
              >
                <SelectItem value={ORIGEM_DEMO} text="🎯 Cenário Demo (3 itens pré-montados)" />
                {certames.map((c) => (
                  <SelectItem key={c.id} value={c.id} text={`📁 ${c.numeroEdital} — ${c.orgao}`} />
                ))}
              </Select>
            </Column>

            <Column lg={4} md={4} sm={4} style={{ marginBottom: "0.75rem" }}>
              <Select
                id="select-perfil-concorrente"
                labelText="Perfil dos Concorrentes Virtuais"
                value={perfilConcorrente}
                onChange={(e) => setPerfilConcorrente(e.target.value as PerfilConcorrenteVirtual)}
              >
                <SelectItem value="MODERADO" text="Moderado (aceita até 18% de desconto)" />
                <SelectItem value="AGRESSIVO" text="Agressivo (aceita até 22% de desconto)" />
                <SelectItem value="CONSERVADOR" text="Conservador (desiste com 15%)" />
              </Select>
            </Column>

            <Column lg={4} md={4} sm={4} style={{ marginBottom: "0.75rem" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)", marginBottom: "0.25rem" }}>
                Relógio da Sessão (acelerado)
              </div>
              <div
                data-testid="relogio-sala-simulada"
                style={{
                  fontSize: "1.5rem",
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  fontFamily: "var(--cds-code-01-font-family, 'IBM Plex Mono', monospace)",
                  color: encerrada
                    ? "var(--cds-text-secondary)"
                    : estado.tempoRestante <= 10
                    ? "var(--cds-support-error, #da1e28)"
                    : "var(--cds-interactive, #0f62fe)",
                }}
              >
                <Time size={22} />
                {encerrada ? "Encerrada" : formatRelogio(estado.tempoRestante)}
                {!encerrada && estado.tempoRestante <= segundosSniper && (
                  <Tag type="red" size="sm">🎯 Janela Sniper</Tag>
                )}
              </div>
            </Column>

            <Column lg={3} md={4} sm={4} style={{ display: "flex", alignItems: "flex-end", marginBottom: "0.75rem" }}>
              <Button
                kind={pausaEmergencia ? "danger" : "danger--tertiary"}
                size="md"
                style={{ width: "100%" }}
                renderIcon={pausaEmergencia ? Play : Pause}
                onClick={handleAlternarPausa}
                disabled={encerrada}
              >
                {pausaEmergencia ? "Retomar Robô" : "Pausa Pânico"}
              </Button>
            </Column>

            <Column lg={5} md={4} sm={4} style={{ marginBottom: "0.5rem" }}>
              <Select
                id="select-modo-disputa-simulada"
                labelText="Modo de Disputa do Edital"
                value={modoDisputa}
                disabled={sessaoIniciada && !encerrada}
                onChange={(e) => setModoDisputa(e.target.value as ModoDisputaSimulacao)}
              >
                <SelectItem value="ABERTO" text="Aberto (prorrogação +15s nos 10s finais)" />
                <SelectItem value="ABERTO_FECHADO" text="Aberto e Fechado (lance final sigiloso)" />
                <SelectItem value="FECHADO_ABERTO" text="Fechado e Aberto (etapa aberta com prorrogação)" />
              </Select>
            </Column>

            <Column lg={4} md={4} sm={4} style={{ marginBottom: "0.5rem" }}>
              <Select
                id="select-janela-sniper"
                labelText="Janela da Tática Sniper"
                value={String(segundosSniper)}
                onChange={(e) => setSegundosSniper(Number(e.target.value))}
              >
                <SelectItem value="5" text="Últimos 5 segundos" />
                <SelectItem value="10" text="Últimos 10 segundos" />
                <SelectItem value="15" text="Últimos 15 segundos" />
                <SelectItem value="20" text="Últimos 20 segundos" />
              </Select>
            </Column>

            <Column lg={7} md={8} sm={4} style={{ marginBottom: "0.5rem" }}>
              <Toggle
                id="toggle-me-epp-simulada"
                size="sm"
                labelText="Minha empresa é ME/EPP (LC 123/2006)"
                labelA="Não"
                labelB="Sim"
                toggled={minhaEmpresaMeEpp}
                onToggle={(checked: boolean) => setMinhaEmpresaMeEpp(checked)}
              />
            </Column>
          </Grid>

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
              <strong>{portal}</strong>
            </div>
            <div>
              <span style={{ color: "var(--cds-text-secondary)" }}>Piso Protegido Total: </span>
              <strong style={{ color: "var(--cds-support-info, #0043ce)" }}>
                <Locked size={14} style={{ verticalAlign: "middle", marginRight: "3px" }} />
                {formatBRL(totalPisoSeguro)}
              </strong>
            </div>
            <div>
              <span style={{ color: "var(--cds-text-secondary)" }}>Itens em 1º Lugar: </span>
              <strong style={{ color: "var(--cds-support-success, #24a148)" }}>
                {itensNaLideranca} de {estado.itens.length}
              </strong>
            </div>
            <div>
              <span style={{ color: "var(--cds-text-secondary)" }}>Robô: </span>
              <Tag type={pausaEmergencia ? "red" : emExecucao ? "green" : "cool-gray"} size="sm">
                {pausaEmergencia ? "🛑 Pausa de Emergência" : emExecucao ? "● Operando" : encerrada ? "Sessão encerrada" : "⏸️ Em espera"}
              </Tag>
            </div>
          </div>
        </Tile>

        {/* Grade de itens */}
        <div style={{ marginBottom: "1.5rem" }}>
          <h4 style={{ margin: "0 0 0.5rem 0", fontSize: "1rem", fontWeight: 600 }}>
            📋 Itens da Sala de Disputa ({estado.itens.length})
          </h4>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "1rem" }}>
            {estado.itens.map((item) => {
              const posicao = rotuloPosicao(item);
              const lider = estado.liderConcorrente[item.itemId];
              const semPiso = !(item.pisoUnitarioSeguro > 0 && item.propostaUnitaria > 0);
              const corBorda =
                item.minhaPosicao === 1
                  ? "var(--cds-support-success, #24a148)"
                  : item.statusItem === "PISO_ATINGIDO"
                  ? "var(--cds-support-error, #da1e28)"
                  : "var(--cds-interactive, #0f62fe)";

              return (
                <Tile key={item.itemId} style={{ padding: "1rem", borderLeft: `4px solid ${corBorda}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.5rem", marginBottom: "0.5rem" }}>
                    <div style={{ minWidth: 0 }}>
                      <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>
                        Item {item.numeroItem} ({item.quantidade} {item.unidade})
                      </span>
                      <div
                        style={{ fontSize: "0.78rem", color: "var(--cds-text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                        title={item.descricao}
                      >
                        {item.descricao}
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.25rem" }}>
                      <Tag type={posicao.tipo} size="sm">{posicao.texto}</Tag>
                      {!item.ativoNoRobo && <Tag type="cool-gray" size="sm">⏸️ Robô desativado</Tag>}
                      {semPiso && <Tag type="warm-gray" size="sm">⚠️ Sem Piso</Tag>}
                    </div>
                  </div>

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
                      <div style={{ color: "var(--cds-text-secondary)", fontSize: "0.72rem" }}>Menor Oferta da Sala</div>
                      <div style={{ fontWeight: 700 }}>{formatBRL(item.melhorLanceSala ?? item.propostaUnitaria)}</div>
                    </div>
                    <div>
                      <div style={{ color: "var(--cds-text-secondary)", fontSize: "0.72rem" }}>Seu Último Lance</div>
                      <div style={{ fontWeight: 700, color: item.minhaPosicao === 1 ? "var(--cds-support-success, #24a148)" : "inherit" }}>
                        {formatBRL(item.meuUltimoLance ?? item.propostaUnitaria)}
                      </div>
                    </div>
                    <div>
                      <div style={{ color: "var(--cds-text-secondary)", fontSize: "0.72rem" }}>Piso Seguro 🔒</div>
                      <div style={{ fontWeight: 700, color: "var(--cds-support-info, #0043ce)" }}>{formatBRL(item.pisoUnitarioSeguro)}</div>
                    </div>
                    <div>
                      <div style={{ color: "var(--cds-text-secondary)", fontSize: "0.72rem" }}>Decremento</div>
                      <div style={{ fontWeight: 600 }}>{rotuloDecremento(item)}</div>
                    </div>
                    {lider && item.minhaPosicao !== 1 && (
                      <div style={{ gridColumn: "1 / -1", fontSize: "0.72rem", color: "var(--cds-text-secondary)" }}>
                        Líder atual: <strong>{lider.nome}</strong>
                        {lider.isMeEpp ? " (ME/EPP)" : ""}
                      </div>
                    )}
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                    <div style={{ display: "flex", gap: "0.25rem" }}>
                      {(["IMEDIATO", "SNIPER", "MONITORAR"] as TaticaDisputa[]).map((tatica) => (
                        <Button
                          key={tatica}
                          size="sm"
                          kind={item.tatica === tatica ? "primary" : "ghost"}
                          disabled={encerrada}
                          onClick={() => setEstado((prev) => alterarTaticaItem(prev, item.itemId, tatica))}
                        >
                          {tatica === "IMEDIATO" ? "Imediato" : tatica === "SNIPER" ? "Sniper" : "Monitorar"}
                        </Button>
                      ))}
                    </div>
                    <Button
                      size="sm"
                      kind="tertiary"
                      disabled={encerrada}
                      onClick={() => setEstado((prev) => injetarLanceRival(prev, item.itemId, parametrosRef.current))}
                    >
                      💥 Forçar Rival
                    </Button>
                  </div>
                </Tile>
              );
            })}
          </div>
        </div>

        {/* Fita de lances */}
        <Tile style={{ padding: "1.25rem", backgroundColor: "var(--cds-layer-01, #ffffff)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem", flexWrap: "wrap", gap: "0.5rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Flash size={18} />
              <h4 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 600 }}>Fita de Lances em Tempo Real (Audit Tape)</h4>
              <Tag type="cool-gray" size="sm">{estado.eventos.length} evento(s)</Tag>
            </div>
            <Button size="sm" kind="ghost" renderIcon={Download} onClick={handleExportarLog} disabled={estado.eventos.length === 0}>
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
            {estado.eventos.length === 0 ? (
              <div style={{ padding: "1.5rem", textAlign: "center", color: "var(--cds-text-secondary)" }}>
                Nenhum lance registrado. Clique em "Iniciar Disputa" para começar.
              </div>
            ) : (
              estado.eventos.map((ev) => (
                <div
                  key={ev.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "0.5rem",
                    padding: "0.35rem 0.5rem",
                    borderBottom: "1px solid var(--cds-border-subtle, #ebebeb)",
                    backgroundColor: ev.isMinhaEmpresa ? "rgba(36, 161, 72, 0.08)" : "transparent",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", minWidth: 0 }}>
                    <span style={{ color: "var(--cds-text-secondary)", minWidth: "48px" }}>{formatRelogio(ev.tempoRestanteSegundos)}</span>
                    <Tag type={ev.tipoDisparo === "SNIPER" ? "red" : ev.isMinhaEmpresa ? "green" : "cool-gray"} size="sm">
                      Item {ev.numeroItem}
                    </Tag>
                    <strong style={{ color: ev.isMinhaEmpresa ? "var(--cds-support-success, #24a148)" : "inherit", whiteSpace: "nowrap" }}>
                      {ev.autorNome}
                    </strong>
                    <span style={{ color: "var(--cds-text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {ev.mensagem}
                    </span>
                  </div>
                  <div style={{ fontWeight: 700, whiteSpace: "nowrap" }}>{formatBRL(ev.valorUnitario)}</div>
                </div>
              ))
            )}
          </div>
        </Tile>
      </div>
    </Modal>
  );
}
