"use client";

import React from "react";
import { Tag, Tile } from "@carbon/react";
import { ModulePageShell } from "@/components/shell/module-page-shell";

export default function NotificacoesPage() {
  return (
    <ModulePageShell routePath="/notificacoes">
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
            Central de Alertas Operacionais e Retificações
          </h2>
          <Tag type="blue" size="sm" className="pncp-mono">
            3 não lidas
          </Tag>
        </div>
        <p style={{ margin: 0, color: "var(--cds-text-secondary)" }}>
          Avisos sincronizados em tempo real com o sino global de notificações
          para prazos de certames, retificações do PNCP e validade de certidões.
        </p>
      </Tile>
    </ModulePageShell>
  );
}
