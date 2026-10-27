"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ClickableTile,
  Column,
  Grid,
  InlineLoading,
  Select,
  SelectItem,
  Tag,
  Tile,
} from "@carbon/react";
import {
  ArrowRight,
  ChartLine,
  CheckmarkOutline,
  CloseOutline,
  Money,
  Time,
  Trophy,
  WarningAlt,
} from "@carbon/icons-react";
import { ModulePageShell } from "@/components/shell/module-page-shell";

interface DashboardData {
  ok: true;
  periodo: {
    mes: number;
    ano: number;
    inicioUtc: string;
    fimUtc: string;
  };
  cards: {
    recebidas: { total: number };
    aguardandoDecisao: { total: number; recebidasNoMes: number };
    emPrecificacao: { total: number };
    recusadas: { total: number };
  };
  resultados: {
    contempladas: { total: number; valorTotal: number };
    perdidasPreco: { total: number };
    perdidasDocumentacao: { total: number };
    desistencias: { total: number };
    impugnadas: { total: number };
    taxaConversaoPercentual: number | null;
  };
  indicadores: {
    volumeEmDisputa: number;
    viabilidadeIA: {
      totalAnalisadas: number;
      goPercentual: number | null;
      noGoPercentual: number | null;
    };
    criticas72h: Array<{
      id: string;
      numeroEdital: string;
      orgaoNome: string;
      dataAbertura: string;
      segundosRestantes: number;
      status: string;
    }>;
  };
  topTipos: Array<{
    posicao: number;
    tipoSistemaCodigo: string;
    nome: string;
    total: number;
  }>;
}

function formatarMoeda(valor: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(valor || 0);
}

function CountdownTimer({ inicialSegundos }: { inicialSegundos: number }) {
  const [segundos, setSegundos] = useState(inicialSegundos);

  useEffect(() => {
    setSegundos(inicialSegundos);
    const interval = setInterval(() => {
      setSegundos((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [inicialSegundos]);

  if (segundos <= 0) {
    return (
      <span className="pncp-mono" style={{ color: "var(--cds-support-error, #da1e28)", fontWeight: 600 }}>
        Prazo Encerrado
      </span>
    );
  }

  const h = Math.floor(segundos / 3600);
  const m = Math.floor((segundos % 3600) / 60);
  const s = segundos % 60;

  return (
    <span
      className="pncp-mono"
      style={{
        fontWeight: 600,
        color: segundos < 86400 ? "var(--cds-support-error, #da1e28)" : "var(--cds-support-warning, #f1c21b)",
      }}
    >
      {String(h).padStart(2, "0")}h {String(m).padStart(2, "0")}m {String(s).padStart(2, "0")}s
    </span>
  );
}

const MESES = [
  { valor: 1, rotulo: "Janeiro" },
  { valor: 2, rotulo: "Fevereiro" },
  { valor: 3, rotulo: "Março" },
  { valor: 4, rotulo: "Abril" },
  { valor: 5, rotulo: "Maio" },
  { valor: 6, rotulo: "Junho" },
  { valor: 7, rotulo: "Julho" },
  { valor: 8, rotulo: "Agosto" },
  { valor: 9, rotulo: "Setembro" },
  { valor: 10, rotulo: "Outubro" },
  { valor: 11, rotulo: "Novembro" },
  { valor: 12, rotulo: "Dezembro" },
];

export default function DashboardPage() {
  const router = useRouter();
  const hoje = new Date();
  const [mesSelecionado, setMesSelecionado] = useState(hoje.getMonth() + 1);
  const [anoSelecionado, setAnoSelecionado] = useState(hoje.getFullYear());
  const [dados, setDados] = useState<DashboardData | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let ativo = true;
    async function carregarDashboard() {
      setCarregando(true);
      try {
        const res = await fetch(`/api/dashboard?mes=${mesSelecionado}&ano=${anoSelecionado}`);
        if (res.ok) {
          const json: DashboardData = await res.json();
          if (ativo) {
            setDados(json);
          }
        }
      } finally {
        if (ativo) {
          setCarregando(false);
        }
      }
    }
    carregarDashboard();
    return () => {
      ativo = false;
    };
  }, [mesSelecionado, anoSelecionado]);

  return (
    <ModulePageShell routePath="/dashboard">
      <Grid fullWidth>
        {/* Seletor de Período Temporal */}
        <Column lg={16} md={8} sm={4} style={{ marginBottom: "1.5rem" }}>
          <Tile
            style={{
              padding: "1rem 1.25rem",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "1rem",
            }}
          >
            <div>
              <span style={{ fontSize: "0.875rem", fontWeight: 600 }}>
                Período de Referência:
              </span>{" "}
              <span style={{ color: "var(--cds-text-secondary)", fontSize: "0.875rem" }}>
                {MESES.find((m) => m.valor === mesSelecionado)?.rotulo} de {anoSelecionado}
              </span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
              <Select
                id="select-mes"
                labelText=""
                aria-label="Selecionar Mês"
                size="sm"
                value={mesSelecionado}
                onChange={(e) => setMesSelecionado(Number(e.target.value))}
                style={{ minWidth: "9rem" }}
              >
                {MESES.map((m) => (
                  <SelectItem key={m.valor} value={m.valor} text={m.rotulo} />
                ))}
              </Select>

              <Select
                id="select-ano"
                labelText=""
                aria-label="Selecionar Ano"
                size="sm"
                value={anoSelecionado}
                onChange={(e) => setAnoSelecionado(Number(e.target.value))}
                style={{ minWidth: "7rem" }}
              >
                {[2024, 2025, 2026, 2027].map((ano) => (
                  <SelectItem key={ano} value={ano} text={String(ano)} />
                ))}
              </Select>
            </div>
          </Tile>
        </Column>

        {carregando && !dados ? (
          <Column lg={16} md={8} sm={4}>
            <Tile style={{ padding: "3rem", textAlign: "center" }}>
              <InlineLoading description="Carregando indicadores executivos do período..." />
            </Tile>
          </Column>
        ) : dados ? (
          <>
            {/* LINHA 1 — Os 4 Cards Mensais Principais (Clicáveis com Navegação Filtrada) */}
            <Column lg={4} md={4} sm={4} style={{ marginBottom: "1rem" }}>
              <ClickableTile
                href="/oportunidades?periodo=mes"
                data-testid="kpi-card-recebidas"
                style={{ height: "100%" }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "0.5rem",
                  }}
                >
                  <span style={{ fontWeight: 600, fontSize: "0.875rem" }}>
                    Recebidas da Coleta PNCP
                  </span>
                  <Tag type="blue" size="sm" className="pncp-mono">
                    Mês
                  </Tag>
                </div>
                <div
                  className="pncp-mono"
                  style={{ fontSize: "2.25rem", fontWeight: 700, marginBottom: "0.25rem" }}
                >
                  {dados.cards.recebidas.total}
                </div>
                <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--cds-text-secondary)" }}>
                  Editais enviados pela esteira no mês
                </p>
              </ClickableTile>
            </Column>

            <Column lg={4} md={4} sm={4} style={{ marginBottom: "1rem" }}>
              <ClickableTile
                href="/oportunidades?status=PENDENTE"
                data-testid="kpi-card-pendentes"
                style={{ height: "100%" }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "0.5rem",
                  }}
                >
                  <span style={{ fontWeight: 600, fontSize: "0.875rem" }}>
                    Aguardando Decisão (GO/NO-GO)
                  </span>
                  <Tag type="warm-gray" size="sm" className="pncp-mono">
                    Backlog
                  </Tag>
                </div>
                <div
                  className="pncp-mono"
                  style={{ fontSize: "2.25rem", fontWeight: 700, marginBottom: "0.25rem" }}
                >
                  {dados.cards.aguardandoDecisao.total}
                </div>
                <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--cds-text-secondary)" }}>
                  {dados.cards.aguardandoDecisao.recebidasNoMes} recebidas no mês
                </p>
              </ClickableTile>
            </Column>

            <Column lg={4} md={4} sm={4} style={{ marginBottom: "1rem" }}>
              <ClickableTile
                href="/minhas-licitacoes"
                data-testid="kpi-card-precificacao"
                style={{ height: "100%" }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "0.5rem",
                  }}
                >
                  <span style={{ fontWeight: 600, fontSize: "0.875rem" }}>
                    Em Precificação (GO)
                  </span>
                  <Tag type="green" size="sm" className="pncp-mono">
                    Ativas
                  </Tag>
                </div>
                <div
                  className="pncp-mono"
                  style={{ fontSize: "2.25rem", fontWeight: 700, marginBottom: "0.25rem" }}
                >
                  {dados.cards.emPrecificacao.total}
                </div>
                <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--cds-text-secondary)" }}>
                  Certames aceitos em elaboração ativa
                </p>
              </ClickableTile>
            </Column>

            <Column lg={4} md={4} sm={4} style={{ marginBottom: "1rem" }}>
              <ClickableTile
                href="/oportunidades?status=RECUSADA"
                data-testid="kpi-card-recusadas"
                style={{ height: "100%" }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "0.5rem",
                  }}
                >
                  <span style={{ fontWeight: 600, fontSize: "0.875rem" }}>
                    Recusadas (NO-GO)
                  </span>
                  <Tag type="red" size="sm" className="pncp-mono">
                    Descarte
                  </Tag>
                </div>
                <div
                  className="pncp-mono"
                  style={{ fontSize: "2.25rem", fontWeight: 700, marginBottom: "0.25rem" }}
                >
                  {dados.cards.recusadas.total}
                </div>
                <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--cds-text-secondary)" }}>
                  Certames descartados no período
                </p>
              </ClickableTile>
            </Column>

            {/* LINHA 2 — Painel de Desfecho & Resultados das Disputas */}
            <Column lg={16} md={8} sm={4} style={{ marginBottom: "1.5rem" }}>
              <Tile data-testid="painel-desfecho" style={{ padding: "1.5rem" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "1.25rem",
                    flexWrap: "wrap",
                    gap: "0.5rem",
                  }}
                >
                  <div>
                    <h2 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 600 }}>
                      Painel de Desfecho & Resultados das Disputas
                    </h2>
                    <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.8125rem", color: "var(--cds-text-secondary)" }}>
                      Controle das decisões finais de certames deliberados e finalizados no mês
                    </p>
                  </div>
                  <Tag type="teal" size="md" className="pncp-mono">
                    Taxa de Conversão:{" "}
                    <strong>
                      {dados.resultados.taxaConversaoPercentual !== null
                        ? `${dados.resultados.taxaConversaoPercentual}%`
                        : "—"}
                    </strong>
                  </Tag>
                </div>

                <Grid fullWidth style={{ padding: 0 }}>
                  <Column lg={4} md={4} sm={4} style={{ marginBottom: "0.75rem" }}>
                    <div
                      style={{
                        padding: "1rem",
                        backgroundColor: "var(--cds-layer-02, rgba(255,255,255,0.05))",
                        borderLeft: "4px solid var(--cds-support-success, #24a148)",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
                        <Trophy size={18} style={{ color: "var(--cds-support-success, #24a148)" }} />
                        <span style={{ fontWeight: 600, fontSize: "0.875rem" }}>Contempladas (Ganha)</span>
                      </div>
                      <div className="pncp-mono" style={{ fontSize: "1.75rem", fontWeight: 700 }}>
                        {dados.resultados.contempladas.total}
                      </div>
                      <div className="pncp-mono" style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--cds-support-success, #24a148)" }}>
                        {formatarMoeda(dados.resultados.contempladas.valorTotal)}
                      </div>
                      <div style={{ fontSize: "0.6875rem", color: "var(--cds-text-muted, #8d8d8d)", marginTop: "0.25rem" }}>
                        *Valor total estimado das vitórias (captura de arremate em implantação)
                      </div>
                    </div>
                  </Column>

                  <Column lg={3} md={2} sm={2} style={{ marginBottom: "0.75rem" }}>
                    <div
                      style={{
                        padding: "1rem",
                        backgroundColor: "var(--cds-layer-02, rgba(255,255,255,0.05))",
                        borderLeft: "4px solid var(--cds-support-error, #da1e28)",
                      }}
                    >
                      <span style={{ fontWeight: 600, fontSize: "0.8125rem", color: "var(--cds-text-secondary)" }}>
                        Perdidas (Preço)
                      </span>
                      <div className="pncp-mono" style={{ fontSize: "1.75rem", fontWeight: 700, margin: "0.25rem 0" }}>
                        {dados.resultados.perdidasPreco.total}
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)" }}>
                        Concorrente com menor lance
                      </div>
                    </div>
                  </Column>

                  <Column lg={3} md={2} sm={2} style={{ marginBottom: "0.75rem" }}>
                    <div
                      style={{
                        padding: "1rem",
                        backgroundColor: "var(--cds-layer-02, rgba(255,255,255,0.05))",
                        borderLeft: "4px solid var(--cds-support-warning, #f1c21b)",
                      }}
                    >
                      <span style={{ fontWeight: 600, fontSize: "0.8125rem", color: "var(--cds-text-secondary)" }}>
                        Perdidas (Documento)
                      </span>
                      <div className="pncp-mono" style={{ fontSize: "1.75rem", fontWeight: 700, margin: "0.25rem 0" }}>
                        {dados.resultados.perdidasDocumentacao.total}
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)" }}>
                        Inabilitação técnica/fiscal
                      </div>
                    </div>
                  </Column>

                  <Column lg={3} md={2} sm={2} style={{ marginBottom: "0.75rem" }}>
                    <div
                      style={{
                        padding: "1rem",
                        backgroundColor: "var(--cds-layer-02, rgba(255,255,255,0.05))",
                        borderLeft: "4px solid var(--cds-text-secondary, #8d8d8d)",
                      }}
                    >
                      <span style={{ fontWeight: 600, fontSize: "0.8125rem", color: "var(--cds-text-secondary)" }}>
                        Desistências
                      </span>
                      <div className="pncp-mono" style={{ fontSize: "1.75rem", fontWeight: 700, margin: "0.25rem 0" }}>
                        {dados.resultados.desistencias.total}
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)" }}>
                        Abandonadas antes do envio
                      </div>
                    </div>
                  </Column>

                  <Column lg={3} md={2} sm={2} style={{ marginBottom: "0.75rem" }}>
                    <div
                      style={{
                        padding: "1rem",
                        backgroundColor: "var(--cds-layer-02, rgba(255,255,255,0.05))",
                        borderLeft: "4px solid var(--cds-support-info, #4589ff)",
                      }}
                    >
                      <span style={{ fontWeight: 600, fontSize: "0.8125rem", color: "var(--cds-text-secondary)" }}>
                        Impugnadas
                      </span>
                      <div className="pncp-mono" style={{ fontSize: "1.75rem", fontWeight: 700, margin: "0.25rem 0" }}>
                        {dados.resultados.impugnadas.total}
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)" }}>
                        Suspensas ou contestadas
                      </div>
                    </div>
                  </Column>
                </Grid>
              </Tile>
            </Column>

            {/* LINHA 3 — Indicadores Financeiros e Operacionais */}
            <Column lg={8} md={8} sm={4} style={{ marginBottom: "1.5rem" }}>
              <Tile data-testid="indicadores-operacionais" style={{ padding: "1.5rem", height: "100%" }}>
                <h3 style={{ margin: "0 0 1rem 0", fontSize: "1rem", fontWeight: 600 }}>
                  Indicadores Financeiros & Esteira de IA
                </h3>

                <Grid fullWidth style={{ padding: 0 }}>
                  <Column lg={8} md={4} sm={4} style={{ marginBottom: "1rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
                      <Money size={18} style={{ color: "var(--cds-support-info, #4589ff)" }} />
                      <span style={{ fontWeight: 600, fontSize: "0.875rem" }}>Volume Estimado em Disputa</span>
                    </div>
                    <div className="pncp-mono" style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--cds-text-primary)" }}>
                      {formatarMoeda(dados.indicadores.volumeEmDisputa)}
                    </div>
                    <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.75rem", color: "var(--cds-text-secondary)" }}>
                      Soma total do valor de editais no pipeline ativo
                    </p>
                  </Column>

                  <Column lg={8} md={4} sm={4} style={{ marginBottom: "1rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
                      <ChartLine size={18} style={{ color: "var(--cds-support-success, #24a148)" }} />
                      <span style={{ fontWeight: 600, fontSize: "0.875rem" }}>Taxa de Viabilidade IA</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", margin: "0.25rem 0" }}>
                      <Tag type="green" size="md" className="pncp-mono" renderIcon={CheckmarkOutline}>
                        {dados.indicadores.viabilidadeIA.goPercentual !== null
                          ? `${dados.indicadores.viabilidadeIA.goPercentual}% GO`
                          : "—"}
                      </Tag>
                      <Tag type="red" size="md" className="pncp-mono" renderIcon={CloseOutline}>
                        {dados.indicadores.viabilidadeIA.noGoPercentual !== null
                          ? `${dados.indicadores.viabilidadeIA.noGoPercentual}% NO-GO`
                          : "—"}
                      </Tag>
                    </div>
                    <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.75rem", color: "var(--cds-text-secondary)" }}>
                      {dados.indicadores.viabilidadeIA.totalAnalisadas} editais analisados no período
                    </p>
                  </Column>
                </Grid>
              </Tile>
            </Column>

            {/* Oportunidades Críticas (< 72 Horas) */}
            <Column lg={8} md={8} sm={4} style={{ marginBottom: "1.5rem" }}>
              <Tile data-testid="criticas-72h-panel" style={{ padding: "1.5rem", height: "100%" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <Time size={18} style={{ color: "var(--cds-support-error, #da1e28)" }} />
                    <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 600 }}>
                      Oportunidades Críticas (&lt; 72h)
                    </h3>
                  </div>
                  <Tag type="red" size="sm" className="pncp-mono">
                    {dados.indicadores.criticas72h.length} certame{dados.indicadores.criticas72h.length !== 1 ? "s" : ""}
                  </Tag>
                </div>

                {dados.indicadores.criticas72h.length === 0 ? (
                  <div
                    style={{
                      padding: "2rem 1rem",
                      textAlign: "center",
                      color: "var(--cds-text-secondary)",
                      fontSize: "0.875rem",
                    }}
                  >
                    Nenhum certame ativo com abertura prevista nas próximas 72 horas.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxHeight: "14rem", overflowY: "auto" }}>
                    {(dados.indicadores?.criticas72h || []).map((critica) => (
                      <div
                        key={critica.id}
                        data-testid={`critica-row-${critica.id}`}
                        onClick={() => router.push(`/oportunidades/${critica.id}?origem=/dashboard`)}
                        style={{
                          padding: "0.75rem 1rem",
                          backgroundColor: "var(--cds-layer-02, rgba(255,255,255,0.05))",
                          borderLeft: "4px solid var(--cds-support-error, #da1e28)",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          cursor: "pointer",
                          gap: "0.75rem",
                          transition: "background-color 0.15s ease",
                        }}
                      >
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: "0.8125rem", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {critica.numeroEdital} — {critica.orgaoNome}
                          </div>
                          <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)" }}>
                            Abertura:{" "}
                            {new Date(critica.dataAbertura).toLocaleString("pt-BR", {
                              day: "2-digit",
                              month: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </div>
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <CountdownTimer inicialSegundos={critica.segundosRestantes} />
                          <ArrowRight size={16} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Tile>
            </Column>

            {/* LINHA 4 — Top 4 Tipos de Licitação (Histórico Acumulado) */}
            <Column lg={16} md={8} sm={4}>
              <Tile data-testid="top-tipos-panel" style={{ padding: "1.5rem" }}>
                <div style={{ marginBottom: "1rem" }}>
                  <h3 style={{ margin: "0 0 0.25rem 0", fontSize: "1rem", fontWeight: 600 }}>
                    Top 4 Categorias de TI (Histórico Acumulado)
                  </h3>
                  <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--cds-text-secondary)" }}>
                    Ranking histórico dinâmico das categorias com maior volume de editais desde a criação do portal. Clique para filtrar a tabela de oportunidades.
                  </p>
                </div>

                <Grid fullWidth style={{ padding: 0 }}>
                  {(dados.topTipos || []).map((tipo) => (
                    <Column key={tipo.tipoSistemaCodigo} lg={4} md={2} sm={4} style={{ marginBottom: "0.5rem" }}>
                      <ClickableTile
                        href={`/oportunidades?tipoSistema=${tipo.tipoSistemaCodigo}`}
                        data-testid={`top-tipo-card-${tipo.posicao}`}
                        style={{ height: "100%", padding: "1rem" }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                          <Tag type="cool-gray" size="sm" className="pncp-mono">
                            {tipo.posicao}º Lugar
                          </Tag>
                          <span className="pncp-mono" style={{ fontSize: "1.25rem", fontWeight: 700 }}>
                            {tipo.total}
                          </span>
                        </div>
                        <div style={{ fontWeight: 600, fontSize: "0.875rem", color: "var(--cds-text-primary)" }}>
                          {tipo.nome}
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)", marginTop: "0.25rem" }}>
                          Clique para ver oportunidades →
                        </div>
                      </ClickableTile>
                    </Column>
                  ))}
                </Grid>
              </Tile>
            </Column>
          </>
        ) : null}
      </Grid>
    </ModulePageShell>
  );
}
