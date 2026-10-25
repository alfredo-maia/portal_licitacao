"use client";

import React from "react";
import { Tile } from "@carbon/react";
import { ModulePageShell } from "@/components/shell/module-page-shell";

export default function OportunidadeDetalhePage({ params }: { params: { id: string } }) {
  return (
    <ModulePageShell routePath={`/oportunidades/${params.id}`}>
      <Tile style={{ padding: "1.5rem" }} data-testid="oportunidade-detalhe-page">
        <h2 style={{ margin: 0, fontSize: "1.5rem", marginBottom: "1rem" }}>
          Detalhes da Oportunidade #{params.id}
        </h2>
        <p>Aqui você encontrará os detalhes completos da oportunidade.</p>
        {/* Futuramente, aqui serão exibidos os dados da oportunidade */}
      </Tile>
    </ModulePageShell>
  );
}