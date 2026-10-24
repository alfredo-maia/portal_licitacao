"use client";

import React from "react";
import { ClickableTile, Column, Grid, Tag, Tile } from "@carbon/react";
import { ModulePageShell } from "@/components/shell/module-page-shell";

const KPI_CARDS = [
  {
    id: "recebidas",
    title: "Recebidas da Coleta PNCP",
    value: "24",
    subtitle: "Editais enviados pela esteira no mês",
    href: "/oportunidades?periodo=mes",
    tagType: "blue" as const,
  },
  {
    id: "pendentes",
    title: "Aguardando Decisão (GO / No-GO)",
    value: "9",
    subtitle: "Backlog pendente de deliberação",
    href: "/oportunidades?status=PENDENTE",
    tagType: "warm-gray" as const,
  },
  {
    id: "precificacao",
    title: "Em Precificação (GO)",
    value: "8",
    subtitle: "Certames aceitos em elaboração ativa",
    href: "/minhas-licitacoes",
    tagType: "green" as const,
  },
  {
    id: "recusadas",
    title: "Recusadas (No-GO)",
    value: "7",
    subtitle: "Certames descartados no período",
    href: "/oportunidades?status=RECUSADA",
    tagType: "red" as const,
  },
];

export default function DashboardPage() {
  return (
    <ModulePageShell routePath="/dashboard">
      <Grid fullWidth>
        {KPI_CARDS.map((card) => (
          <Column
            key={card.id}
            lg={4}
            md={4}
            sm={4}
            style={{ marginBottom: "1rem" }}
          >
            <ClickableTile href={card.href} data-testid={`kpi-card-${card.id}`}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "0.75rem",
                }}
              >
                <span style={{ fontWeight: 600, fontSize: "0.875rem" }}>
                  {card.title}
                </span>
                <Tag type={card.tagType} size="sm" className="pncp-mono">
                  Mês Atual
                </Tag>
              </div>
              <div
                className="pncp-mono"
                style={{ fontSize: "2rem", fontWeight: 600, marginBottom: "0.25rem" }}
              >
                {card.value}
              </div>
              <p
                style={{
                  margin: 0,
                  fontSize: "0.8125rem",
                  color: "var(--cds-text-secondary)",
                }}
              >
                {card.subtitle}
              </p>
            </ClickableTile>
          </Column>
        ))}

        <Column lg={16} md={8} sm={4}>
          <Tile style={{ padding: "1.25rem" }}>
            <h2 style={{ marginTop: 0, fontSize: "1.125rem" }}>
              Painel Executivo de Disputas e Conversão (Lei 14.133/2021)
            </h2>
            <p style={{ margin: 0, color: "var(--cds-text-secondary)" }}>
              Indicadores consolidados de vitórias, conversão financeira e Top 4
              categorias históricas de TI.
            </p>
          </Tile>
        </Column>
      </Grid>
    </ModulePageShell>
  );
}
