"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Button, Column, Grid, Tag } from "@carbon/react";
import { ArrowLeft, MisuseOutline, Search } from "@carbon/icons-react";

interface ForbiddenAccessProps {
  title?: string;
  message?: string;
  showBackButton?: boolean;
  showHomeButton?: boolean;
}

export function ForbiddenAccess({
  title = "Acesso Não Autorizado",
  message = "Seu perfil de usuário não possui permissão para acessar esta área ou executar esta ação. Se você acredita que isso é um erro ou necessita de privilégios para suas funções operacionais, contate a Diretoria ou o Administrador do sistema.",
  showBackButton = true,
  showHomeButton = true,
}: ForbiddenAccessProps) {
  const router = useRouter();

  const handleVoltar = () => {
    router.back();
  };

  return (
    <div
      data-testid="forbidden-page"
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
                  backgroundColor: "rgba(218, 30, 40, 0.1)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--cds-support-error, #da1e28)",
                }}
              >
                <MisuseOutline size={36} />
              </div>
            </div>

            <Tag type="red" size="md" style={{ marginBottom: "1rem" }}>
              Erro 403 • Acesso Restrito
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
              {title}
            </h1>

            <p
              style={{
                fontSize: "0.9375rem",
                color: "var(--cds-text-secondary, #525252)",
                lineHeight: 1.5,
                maxWidth: "500px",
                margin: "0 auto 2rem auto",
              }}
            >
              {message}
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
              {showBackButton && (
                <Button
                  kind="secondary"
                  size="md"
                  renderIcon={ArrowLeft}
                  onClick={handleVoltar}
                  id="btn-forbidden-back"
                >
                  Voltar
                </Button>
              )}

              {showHomeButton && (
                <Button
                  kind="primary"
                  size="md"
                  renderIcon={Search}
                  onClick={() => router.push("/oportunidades")}
                  id="btn-forbidden-home"
                >
                  Área Principal
                </Button>
              )}
            </div>
          </div>
        </Column>
      </Grid>
    </div>
  );
}
