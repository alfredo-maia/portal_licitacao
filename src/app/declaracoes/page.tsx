"use client";

import React from "react";
import { Tag, Tile } from "@carbon/react";
import { ModulePageShell } from "@/components/shell/module-page-shell";

export default function DeclaracoesPage() {
  return (
    <ModulePageShell routePath="/declaracoes">
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
            Gerador dos 8 Modelos Oficiais com Pré-visualização A4
          </h2>
          <Tag type="purple" size="sm" className="pncp-mono">
            8 Modelos (Lei 14.133)
          </Tag>
        </div>
        <p style={{ margin: 0, color: "var(--cds-text-secondary)" }}>
          Emissão instantânea de declarações formais pré-preenchidas com dados
          societários e pronta exportação para assinatura ICP-Brasil / Gov.br.
        </p>
      </Tile>
    </ModulePageShell>
  );
}
