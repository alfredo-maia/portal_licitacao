"use client";

import React from "react";
import { Tag, Tile } from "@carbon/react";
import { ModulePageShell } from "@/components/shell/module-page-shell";

export default function ImpugnacoesPage() {
  return (
    <ModulePageShell routePath="/impugnacoes">
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
            Controle de Petições, Esclarecimentos e Prazos Fatais
          </h2>
          <Tag type="magenta" size="sm" className="pncp-mono">
            Art. 164 — 3 Dias Úteis
          </Tag>
        </div>
        <p style={{ margin: 0, color: "var(--cds-text-secondary)" }}>
          Gestão jurídica contra cláusulas restritivas em editais públicos de TI
          e acompanhamento de respostas de pregoeiros.
        </p>
      </Tile>
    </ModulePageShell>
  );
}
