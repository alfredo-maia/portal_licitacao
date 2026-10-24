"use client";

import React from "react";
import { Tag, Tile } from "@carbon/react";
import { ModulePageShell } from "@/components/shell/module-page-shell";

export default function CalendarioPage() {
  return (
    <ModulePageShell routePath="/calendario">
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
            Cronograma Mensal de Sessões Públicas e Certidões
          </h2>
          <Tag type="teal" size="sm" className="pncp-mono">
            Visão Mensal
          </Tag>
        </div>
        <p style={{ margin: 0, color: "var(--cds-text-secondary)" }}>
          Exibição de certames aceitos, disputas agendadas e alertas de
          vencimento documental da empresa.
        </p>
      </Tile>
    </ModulePageShell>
  );
}
