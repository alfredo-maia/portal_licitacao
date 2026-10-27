"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Column,
  Grid,
  InlineLoading,
  ActionableNotification,
  Select,
  SelectItem,
  Tag,
  Tile,
} from "@carbon/react";
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  Document,
  Time,
} from "@carbon/icons-react";
import { ModulePageShell } from "@/components/shell/module-page-shell";
import { sintetizarMiniResumo } from "@/lib/resumo-licitacao";

interface CalendarioChip {
  id: string;
  numeroEdital: string;
  orgaoNome: string;
  dataAbertura: string;
  dataEncerramentoProposta?: string;
  dia: number;
  status: string;
  opaco: boolean;
  linkDestino: string;
}

interface AlertaDocumental {
  documentoId: string;
  titulo: string;
  dia: number;
  mensagem: string;
  linkDestino: "/documentacao";
}

interface CalendarioResponse {
  ok: true;
  mes: number;
  ano: number;
  chips: CalendarioChip[];
  alertasDocumentais: AlertaDocumental[];
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

const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export default function CalendarioPage() {
  const router = useRouter();
  const hoje = new Date();
  const diaHoje = hoje.getDate();
  const mesAtual = hoje.getMonth() + 1;
  const anoAtual = hoje.getFullYear();

  const [mesSelecionado, setMesSelecionado] = useState(mesAtual);
  const [anoSelecionado, setAnoSelecionado] = useState(anoAtual);
  const [dados, setDados] = useState<CalendarioResponse | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let ativo = true;
    async function carregarCalendario() {
      setCarregando(true);
      try {
        const res = await fetch(`/api/calendario?mes=${mesSelecionado}&ano=${anoSelecionado}`);
        if (res.ok) {
          const json: CalendarioResponse = await res.json();
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
    carregarCalendario();
    return () => {
      ativo = false;
    };
  }, [mesSelecionado, anoSelecionado]);

  const handleMesAnterior = () => {
    if (mesSelecionado === 1) {
      setMesSelecionado(12);
      setAnoSelecionado((a) => a - 1);
    } else {
      setMesSelecionado((m) => m - 1);
    }
  };

  const handleMesSeguinte = () => {
    if (mesSelecionado === 12) {
      setMesSelecionado(1);
      setAnoSelecionado((a) => a + 1);
    } else {
      setMesSelecionado((m) => m + 1);
    }
  };

  const handleHoje = () => {
    setMesSelecionado(mesAtual);
    setAnoSelecionado(anoAtual);
  };

  // Cálculo da grade mensal
  const primeiroDiaSemana = new Date(anoSelecionado, mesSelecionado - 1, 1).getDay();
  const totalDiasMes = new Date(anoSelecionado, mesSelecionado, 0).getDate();

  const totalCelulas = Math.ceil((primeiroDiaSemana + totalDiasMes) / 7) * 7;
  const celulas = Array.from({ length: totalCelulas }, (_, index) => {
    const diaNum = index - primeiroDiaSemana + 1;
    if (diaNum >= 1 && diaNum <= totalDiasMes) {
      return diaNum;
    }
    return null;
  });

  const getStatusTagType = (status: string, opaco: boolean) => {
    if (opaco) return "cool-gray" as const;
    if (status === "CONTEMPLADA") return "green" as const;
    if (status === "EM_DISPUTA") return "purple" as const;
    if (status === "IMPUGNADA") return "cyan" as const;
    return "blue" as const;
  };

  return (
    <ModulePageShell
      routePath="/calendario"
      subtitle="Cronograma mensal de sessões públicas, disputas de certames aceitos e alertas documentais."
    >
      <Grid fullWidth>
        {/* Barra de Navegação Temporal */}
        <Column lg={16} md={8} sm={4} style={{ marginBottom: "1rem" }}>
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
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <Button
                kind="ghost"
                size="sm"
                hasIconOnly
                renderIcon={ArrowLeft}
                iconDescription="Mês anterior"
                onClick={handleMesAnterior}
              />
              <Button
                kind="ghost"
                size="sm"
                hasIconOnly
                renderIcon={ArrowRight}
                iconDescription="Mês seguinte"
                onClick={handleMesSeguinte}
              />
              <Button kind="tertiary" size="sm" onClick={handleHoje}>
                Hoje
              </Button>
              <h2 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 600 }}>
                {MESES.find((m) => m.valor === mesSelecionado)?.rotulo} de {anoSelecionado}
              </h2>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <span style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)" }}>
                  Legenda:
                </span>
                <Tag size="sm" type="purple">
                  Prazo Fatal (Envio de Proposta)
                </Tag>
                <Tag size="sm" type="blue">
                  Certame Ativo
                </Tag>
                <Tag size="sm" type="cool-gray" style={{ opacity: 0.6 }}>
                  Não Prosseguida (40%)
                </Tag>
              </div>

              <Select
                id="select-cal-mes"
                labelText=""
                aria-label="Selecionar Mês"
                size="sm"
                value={mesSelecionado}
                onChange={(e) => setMesSelecionado(Number(e.target.value))}
                style={{ minWidth: "8.5rem" }}
              >
                {MESES.map((m) => (
                  <SelectItem key={m.valor} value={m.valor} text={m.rotulo} />
                ))}
              </Select>

              <Select
                id="select-cal-ano"
                labelText=""
                aria-label="Selecionar Ano"
                size="sm"
                value={anoSelecionado}
                onChange={(e) => setAnoSelecionado(Number(e.target.value))}
                style={{ minWidth: "6.5rem" }}
              >
                {[2024, 2025, 2026, 2027].map((ano) => (
                  <SelectItem key={ano} value={ano} text={String(ano)} />
                ))}
              </Select>
            </div>
          </Tile>
        </Column>

        {/* Faixa de Alerta Documental (Sprint 4 preparada) */}
        {dados?.alertasDocumentais && dados.alertasDocumentais.length > 0 && (
          <Column lg={16} md={8} sm={4} style={{ marginBottom: "1rem" }}>
            <div data-testid="alertas-documentais-banner">
              {dados.alertasDocumentais.map((alerta) => (
                <ActionableNotification
                  key={alerta.documentoId}
                  inline
                  kind="warning"
                  title={`Dia ${alerta.dia}: ${alerta.titulo}`}
                  subtitle={alerta.mensagem}
                  actionButtonLabel="Ver Documentos"
                  onActionButtonClick={() => router.push(alerta.linkDestino)}
                  style={{ marginBottom: "0.5rem" }}
                />
              ))}
            </div>
          </Column>
        )}

        {/* Grade Mensal */}
        <Column lg={16} md={8} sm={4}>
          {carregando && !dados ? (
            <Tile style={{ padding: "3rem", textAlign: "center" }}>
              <InlineLoading description="Carregando certames do mês..." />
            </Tile>
          ) : (
            <div
              data-testid="calendario-grid"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(7, 1fr)",
                gap: "1px",
                backgroundColor: "var(--cds-border-subtle, #e0e0e0)",
                border: "1px solid var(--cds-border-subtle, #e0e0e0)",
              }}
            >
              {/* Cabeçalho dos Dias da Semana */}
              {DIAS_SEMANA.map((diaNome, idx) => (
                <div
                  key={diaNome}
                  style={{
                    padding: "0.5rem",
                    backgroundColor: "var(--cds-layer-02, #f4f4f4)",
                    textAlign: "center",
                    fontWeight: 600,
                    fontSize: "0.8125rem",
                    color: idx === 0 || idx === 6 ? "var(--cds-text-secondary)" : "var(--cds-text-primary)",
                  }}
                >
                  {diaNome}
                </div>
              ))}

              {/* Células de Dias */}
              {celulas.map((dia, idx) => {
                const isHoje =
                  dia !== null &&
                  dia === diaHoje &&
                  mesSelecionado === mesAtual &&
                  anoSelecionado === anoAtual;

                const chipsDoDia = dia !== null && dados?.chips
                  ? dados.chips.filter((c) => c.dia === dia)
                  : [];

                return (
                  <div
                    key={idx}
                    style={{
                      minHeight: "7.5rem",
                      padding: "0.5rem",
                      backgroundColor: dia !== null
                        ? isHoje
                          ? "var(--cds-layer-accent-01, rgba(69, 137, 255, 0.08))"
                          : "var(--cds-layer-01, #ffffff)"
                        : "var(--cds-layer-02, #f4f4f4)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.375rem",
                    }}
                  >
                    {dia !== null ? (
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: "0.25rem",
                        }}
                      >
                        <span
                          className="pncp-mono"
                          style={{
                            fontSize: "0.875rem",
                            fontWeight: isHoje ? 700 : 500,
                            color: isHoje
                              ? "var(--cds-support-info, #4589ff)"
                              : "var(--cds-text-primary)",
                            padding: isHoje ? "0.125rem 0.375rem" : undefined,
                            backgroundColor: isHoje ? "var(--cds-layer-03, #e0e0e0)" : undefined,
                            borderRadius: "4px",
                          }}
                        >
                          {dia}
                        </span>
                        {chipsDoDia.length > 0 && (
                          <span
                            className="pncp-mono"
                            style={{
                              fontSize: "0.6875rem",
                              color: "var(--cds-text-secondary)",
                            }}
                          >
                            {chipsDoDia.length} certame{chipsDoDia.length > 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                    ) : null}

                    {/* Chips do Dia */}
                    {chipsDoDia.map((chip) => {
                      const rawDate = chip.dataEncerramentoProposta || chip.dataAbertura;
                      const hora = new Date(rawDate).toLocaleTimeString("pt-BR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      });

                      const tituloLicitacao = sintetizarMiniResumo(
                        (chip as any).miniResumo || (chip as any).titulo || (chip as any).objeto || chip.numeroEdital
                      );

                      return (
                        <div
                          key={chip.id}
                          data-testid="calendario-chip"
                          onClick={() => router.push(chip.linkDestino)}
                          title={`Órgão: ${chip.orgaoNome}\nTítulo: ${tituloLicitacao}\nStatus: ${chip.status}\nFechamento: ${hora}`}
                          style={{
                            padding: "0.45rem 0.5rem",
                            borderRadius: "4px",
                            backgroundColor: chip.opaco
                              ? "var(--cds-layer-02, #e0e0e0)"
                              : "var(--cds-layer-03, #d0e2ff)",
                            opacity: chip.opaco ? 0.4 : 1.0,
                            cursor: "pointer",
                            transition: "all 0.15s ease",
                            display: "flex",
                            flexDirection: "column",
                            gap: "0.25rem",
                            border: "1px solid var(--cds-border-subtle)",
                          }}
                        >
                          {/* 1. Nome do Órgão */}
                          <div
                            style={{
                              fontSize: "0.75rem",
                              fontWeight: 600,
                              color: "var(--cds-text-primary)",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              lineHeight: 1.2,
                            }}
                          >
                            {chip.orgaoNome}
                          </div>

                          {/* 2. Título da Licitação */}
                          <div
                            style={{
                              fontSize: "0.6875rem",
                              color: "var(--cds-text-secondary)",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              lineHeight: 1.2,
                            }}
                          >
                            {tituloLicitacao}
                          </div>

                          {/* 3. Status da Licitação e 4. Horário do Fechamento */}
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              gap: "0.25rem",
                              marginTop: "0.125rem",
                            }}
                          >
                            <Tag
                              type={getStatusTagType(chip.status, chip.opaco)}
                              size="sm"
                              className="pncp-mono"
                              style={{
                                fontSize: "0.625rem",
                                minHeight: "1.125rem",
                                padding: "0 0.35rem",
                                margin: 0,
                              }}
                            >
                              {chip.status}
                            </Tag>
                            <span
                              className="pncp-mono"
                              style={{
                                fontSize: "0.6875rem",
                                fontWeight: 600,
                                color: chip.opaco
                                  ? "var(--cds-text-secondary)"
                                  : "var(--cds-support-info, #0043ce)",
                              }}
                            >
                              {hora}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </Column>
      </Grid>
    </ModulePageShell>
  );
}
