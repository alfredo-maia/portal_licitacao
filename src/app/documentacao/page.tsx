"use client";

import React from "react";
import { Tag, Tile } from "@carbon/react";
import { ModulePageShell } from "@/components/shell/module-page-shell";

export default function DocumentacaoPage() {
  return (
    <ModulePageShell routePath="/documentacao">
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
            Repositório de Habilitação Jurídica, Fiscal e Técnica (ACTs)
          </h2>
          <Tag type="red" size="sm">
            Monitoramento ≤ 30 dias
          </Tag>
        </div>
        <p style={{ margin: 0, color: "var(--cds-text-secondary)" }}>
          Gestão centralizada de certidões negativas, balanços patrimoniais,
          diplomas e Atestados de Capacidade Técnica com versionamento.
        </p>
      </Tile>
    </ModulePageShell>
  );
}
