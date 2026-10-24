"use client";

import React from "react";
import { Tag, Tile } from "@carbon/react";
import { ModulePageShell } from "@/components/shell/module-page-shell";

export default function PortaisPage() {
  return (
    <ModulePageShell routePath="/portais">
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
            Catálogo de Plataformas e Credenciamentos
          </h2>
          <Tag type="green" size="sm">
            Sem Armazenamento de Senhas
          </Tag>
        </div>
        <p style={{ margin: 0, color: "var(--cds-text-secondary)" }}>
          Controle de cadastros em Compras.gov.br, Portal de Compras Públicas,
          Licitações-e, BLL e BBMNet com alertas preventivos de renovação.
        </p>
      </Tile>
    </ModulePageShell>
  );
}
