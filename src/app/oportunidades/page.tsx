"use client";

import React from "react";
import { Tag, Tile } from "@carbon/react";
import { CheckmarkOutline, CloseOutline, WarningAlt } from "@carbon/icons-react";
import { ModulePageShell } from "@/components/shell/module-page-shell";

export default function OportunidadesPage() {
  return (
    <ModulePageShell routePath="/oportunidades">
      <Tile style={{ padding: "1.5rem" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "1rem",
            marginBottom: "1rem",
          }}
        >
          <h2 style={{ margin: 0, fontSize: "1.125rem" }}>
            Central de Triagem e Deliberação (GO / No-GO)
          </h2>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <Tag type="green" renderIcon={CheckmarkOutline}>
              GO - Recomendado
            </Tag>
            <Tag type="warm-gray" renderIcon={WarningAlt}>
              AVALIAR DIRETORIA
            </Tag>
            <Tag type="red" renderIcon={CloseOutline}>
              NO-GO
            </Tag>
          </div>
        </div>
        <p style={{ margin: 0, color: "var(--cds-text-secondary)" }}>
          Tabela de alta densidade ordenada por data de abertura do certame para
          decisão estratégica da Diretoria e Analistas Comerciais.
        </p>
      </Tile>
    </ModulePageShell>
  );
}
