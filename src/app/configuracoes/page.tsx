"use client";

import React from "react";
import { Tag, Tile } from "@carbon/react";
import { ModulePageShell } from "@/components/shell/module-page-shell";

export default function ConfiguracoesPage() {
  return (
    <ModulePageShell routePath="/configuracoes">
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
            Parâmetros Corporativos, Perfil, Equipe e Trilha de Auditoria
          </h2>
          <Tag type="high-contrast" size="sm">
            RBAC & Audit Log
          </Tag>
        </div>
        <p style={{ margin: 0, color: "var(--cds-text-secondary)" }}>
          Gerenciamento de dados cadastrais da empresa, permissões da equipe
          (Diretoria, Analista Comercial e Operador) e consulta à trilha
          imutável de auditoria.
        </p>
      </Tile>
    </ModulePageShell>
  );
}
