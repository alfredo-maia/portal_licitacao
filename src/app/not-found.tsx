"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Button, Column, Grid, Tag } from "@carbon/react";
import { ArrowLeft, Search, DocumentUnknown } from "@carbon/icons-react";

export default function NotFoundPage() {
  const router = useRouter();

  const handleVoltar = () => {
    router.back();
  };

  return (
    <div
      data-testid="not-found-page"
      style={{
        minHeight: "75vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem 1rem",
      }}
    >
      <Grid fullWidth style={{ maxWidth: "680px", margin: "0 auto" }}>
        <Column sm={4} md={8} lg={16}>
          <div
            style={{
              backgroundColor: "var(--cds-layer-01, #ffffff)",
              border: "1px solid var(--cds-border-subtle, #e0e0e0)",
              borderRadius: "4px",
              padding: "2.5rem 2rem",
              textAlign: "center",
              boxShadow: "0 2px 6px rgba(0, 0, 0, 0.08)",
            }}
          >
            <div style={{ marginBottom: "1.25rem", display: "flex", justifyContent: "center" }}>
              <div
                style={{
                  width: "72px",
                  height: "72px",
                  borderRadius: "50%",
                  backgroundColor: "var(--cds-layer-02, #f4f4f4)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--cds-interactive, #0f62fe)",
                }}
              >
                <DocumentUnknown size={36} />
              </div>
            </div>

            <Tag type="cool-gray" size="md" style={{ marginBottom: "1rem" }}>
              Erro 404 • Não Encontrado
            </Tag>

            <h1
              style={{
                fontSize: "1.75rem",
                fontWeight: 600,
                color: "var(--cds-text-primary, #161616)",
                marginBottom: "0.75rem",
                lineHeight: 1.3,
              }}
            >
              Página não encontrada
            </h1>

            <p
              style={{
                fontSize: "0.9375rem",
                color: "var(--cds-text-secondary, #525252)",
                lineHeight: 1.5,
                maxWidth: "480px",
                margin: "0 auto 2rem auto",
              }}
            >
              O endereço acessado não existe, foi movido ou está temporariamente indisponível. Verifique a URL digitada ou retorne para uma área de trabalho segura do portal.
            </p>

            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "1rem",
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Button
                kind="secondary"
                size="md"
                renderIcon={ArrowLeft}
                onClick={handleVoltar}
                id="btn-not-found-back"
              >
                Voltar
              </Button>

              <Button
                kind="primary"
                size="md"
                renderIcon={Search}
                onClick={() => router.push("/oportunidades")}
                id="btn-not-found-home"
              >
                Central de Oportunidades
              </Button>
            </div>
          </div>
        </Column>
      </Grid>
    </div>
  );
}
