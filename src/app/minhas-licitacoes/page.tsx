"use client";

import React from "react";
import { Column, Grid, Tag, Tile } from "@carbon/react";
import { ModulePageShell } from "@/components/shell/module-page-shell";

const KANBAN_COLUMNS = [
  "Aceita (GO)",
  "Análise Técnica",
  "Análise Financeira",
  "Revisão da Proposta",
  "Enviada",
  "Em Disputa / Lances",
  "Aguardando Resultado",
  "Contemplada",
];

export default function MinhasLicitacoesPage() {
  return (
    <ModulePageShell routePath="/minhas-licitacoes">
      <Grid fullWidth>
        {KANBAN_COLUMNS.map((col, idx) => (
          <Column
            key={col}
            lg={4}
            md={4}
            sm={4}
            style={{ marginBottom: "1rem" }}
          >
            <Tile style={{ padding: "1rem" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <strong style={{ fontSize: "0.875rem" }}>{col}</strong>
                <Tag size="sm" type="cool-gray" className="pncp-mono">
                  Etapa {idx + 1}
                </Tag>
              </div>
            </Tile>
          </Column>
        ))}
      </Grid>
    </ModulePageShell>
  );
}
