"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Button,
  Form,
  InlineNotification,
  Stack,
  TextInput,
  Tile,
} from "@carbon/react";
import {
  ArrowLeft,
  Asleep,
  Email,
  Light,
  Send,
} from "@carbon/icons-react";
import { APP_CONFIG } from "@/config/brand";
import { useAppTheme } from "@/providers/theme-provider";

export default function EsqueciSenhaPage() {
  const { isDark, toggleTheme } = useAppTheme();

  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !trimmedEmail.includes("@")) {
      setErrorMessage("Informe um e-mail corporativo válido.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/auth/esqueci-senha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmedEmail }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setErrorMessage(
          data.message ||
            "Não foi possível processar a recuperação. Tente novamente mais tarde.",
        );
      } else {
        setSuccessMessage(
          data.message ||
            "Enviamos as instruções de recuperação para o seu e-mail. Verifique sua caixa de entrada e spam.",
        );
      }
    } catch {
      setErrorMessage("Falha de conexão com o servidor. Verifique sua internet.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "1.5rem",
        backgroundColor: "var(--cds-background)",
        position: "relative",
      }}
    >
      {/* Botão de Tema no Canto Superior Direito */}
      <div style={{ position: "absolute", top: "1.5rem", right: "1.5rem" }}>
        <Button
          kind="ghost"
          size="sm"
          hasIconOnly
          renderIcon={isDark ? Light : Asleep}
          iconDescription={
            isDark ? "Alternar para Tema Claro" : "Alternar para Tema Escuro"
          }
          onClick={toggleTheme}
        />
      </div>

      {/* Card Centralizado de Recuperação de Senha */}
      <div style={{ width: "100%", maxWidth: "440px" }}>
        <Tile
          data-testid="esqueci-senha-tile"
          style={{
            padding: "2.5rem 2rem",
            backgroundColor: "var(--cds-layer-01)",
            border: "1px solid var(--cds-border-subtle)",
            boxShadow: "0 8px 24px rgba(0, 0, 0, 0.25)",
          }}
        >
          <Stack gap={6}>
            {/* Header da Marca e Título */}
            <div>
              <span
                style={{
                  display: "block",
                  fontSize: "0.875rem",
                  color: "var(--cds-text-secondary)",
                  marginBottom: "0.25rem",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.5px",
                }}
              >
                {APP_CONFIG.brandName}
              </span>
              <h1
                style={{
                  margin: 0,
                  fontSize: "1.5rem",
                  fontWeight: 700,
                  color: "var(--cds-text-primary)",
                }}
              >
                Recuperar Senha
              </h1>
              <p
                style={{
                  margin: "0.5rem 0 0 0",
                  fontSize: "0.875rem",
                  color: "var(--cds-text-secondary)",
                  lineHeight: "1.4",
                }}
              >
                Informe seu e-mail corporativo cadastrado para receber instruções de
                recuperação de acesso.
              </p>
            </div>

            {/* Notificação de Sucesso */}
            {successMessage && (
              <InlineNotification
                kind="success"
                title="E-mail enviado:"
                subtitle={successMessage}
                hideCloseButton
                data-testid="esqueci-senha-sucesso"
              />
            )}

            {/* Notificação de Erro / Rate Limit */}
            {errorMessage && (
              <InlineNotification
                kind="error"
                title="Atenção:"
                subtitle={errorMessage}
                hideCloseButton
                data-testid="esqueci-senha-erro"
              />
            )}

            {/* Formulário de Envio */}
            {!successMessage && (
              <Form onSubmit={handleSubmit} noValidate>
                <Stack gap={5}>
                  <TextInput
                    id="esqueci-senha-email"
                    data-testid="esqueci-senha-email"
                    labelText="E-mail Corporativo"
                    placeholder="usuario@empresa.com.br"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isSubmitting}
                    autoComplete="email"
                    autoFocus
                  />

                  <Button
                    type="submit"
                    data-testid="esqueci-senha-submit"
                    disabled={isSubmitting || !email.trim()}
                    renderIcon={Send}
                    style={{ width: "100%", maxWidth: "none" }}
                  >
                    {isSubmitting ? "Enviando instruções..." : "Recuperar Senha"}
                  </Button>
                </Stack>
              </Form>
            )}

            {/* Link de Retorno ao Login */}
            <div
              style={{
                borderTop: "1px solid var(--cds-border-subtle)",
                paddingTop: "1.25rem",
                textAlign: "center",
              }}
            >
              <Link
                href="/login"
                data-testid="link-voltar-login"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.375rem",
                  fontSize: "0.875rem",
                  color: "var(--cds-link-primary)",
                  textDecoration: "none",
                  fontWeight: 500,
                }}
              >
                <ArrowLeft size={16} /> Voltar para o Login
              </Link>
            </div>
          </Stack>
        </Tile>
      </div>
    </div>
  );
}
