"use client";

import React from "react";
import { Tag, Tile } from "@carbon/react";
import { ModulePageShell } from "@/components/shell/module-page-shell";

export default function RoboDeLancesPage() {
  return (
    <ModulePageShell routePath="/robo-de-lances">
      <Tile style={{ padding: "1.5rem" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "0.75rem",
          }}
        >
          <h2 style={{ margin: 0, fontSize: "1.125rem" }}>
            Módulo em Construção — Automação de Disputa Eletrônica
          </h2>
          <Tag type="cool-gray" size="sm">
            Em breve
          </Tag>
        </div>
        <p style={{ margin: 0, color: "var(--cds-text-secondary)" }}>
          Este módulo encontra-se planejado para evolução futura do ecossistema
          e permanece desabilitado nesta versão operacional.
        </p>
      </Tile>
    </ModulePageShell>
  );
}
