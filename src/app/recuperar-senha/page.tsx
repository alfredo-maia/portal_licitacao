"use client";

import React, { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Button,
  Form,
  InlineLoading,
  InlineNotification,
  PasswordInput,
  Stack,
  TextInput,
  Tile,
} from "@carbon/react";
import {
  ArrowLeft,
  Asleep,
  CheckmarkFilled,
  Light,
  Password,
} from "@carbon/icons-react";
import { APP_CONFIG } from "@/config/brand";
import { useAppTheme } from "@/providers/theme-provider";

function RecuperarSenhaFormContent() {
  const searchParams = useSearchParams();
  const { isDark, toggleTheme } = useAppTheme();

  const tokenFromUrl = (searchParams.get("token") || "").trim();
  const [token, setToken] = useState(tokenFromUrl);
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");
  const [validatingToken, setValidatingToken] = useState(Boolean(tokenFromUrl));
  const [tokenStatus, setTokenStatus] = useState<{
    valid: boolean;
    message?: string;
    emailMasked?: string;
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setToken(tokenFromUrl);
    if (!tokenFromUrl) {
      setValidatingToken(false);
      setTokenStatus(null);
      return;
    }

    let cancelled = false;
    setValidatingToken(true);
    setErrorMessage(null);

    fetch(`/api/auth/recuperar-senha?token=${encodeURIComponent(tokenFromUrl)}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok && data.valid) {
          setTokenStatus({ valid: true, emailMasked: data.emailMasked });
        } else {
          setTokenStatus({
            valid: false,
            message:
              data.message ||
              "Link de recuperação inválido ou expirado. Solicite um novo e-mail.",
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTokenStatus({
            valid: false,
            message: "Não foi possível validar o link de recuperação no momento.",
          });
        }
      })
      .finally(() => {
        if (!cancelled) {
          setValidatingToken(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [tokenFromUrl]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!token.trim()) {
      setErrorMessage("Informe o código de recuperação recebido por e-mail.");
      return;
    }

    if (novaSenha.length < 6) {
      setErrorMessage("A nova senha deve ter pelo menos 6 caracteres.");
      return;
    }

    if (novaSenha !== confirmarSenha) {
      setErrorMessage("As senhas informadas não coincidem.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/auth/recuperar-senha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: token.trim(),
          novaSenha,
          confirmarSenha,
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) {
        setErrorMessage(
          data.message ||
            "Não foi possível redefinir a senha. Verifique o token e tente novamente.",
        );
      } else {
        setSuccessMessage(
          data.message || "Senha redefinida com sucesso! Você já pode fazer login.",
        );
        setNovaSenha("");
        setConfirmarSenha("");
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

      <div style={{ width: "100%", maxWidth: "440px" }}>
        <Tile
          data-testid="recuperar-senha-tile"
          style={{
            padding: "2.5rem 2rem",
            backgroundColor: "var(--cds-layer-01)",
            border: "1px solid var(--cds-border-subtle)",
            boxShadow: "0 8px 24px rgba(0, 0, 0, 0.25)",
          }}
        >
          <Stack gap={6}>
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
                Redefinir Senha
              </h1>
              <p
                style={{
                  margin: "0.5rem 0 0 0",
                  fontSize: "0.875rem",
                  color: "var(--cds-text-secondary)",
                  lineHeight: "1.4",
                }}
              >
                {tokenStatus?.emailMasked
                  ? `Defina uma nova senha de acesso para ${tokenStatus.emailMasked}.`
                  : "Informe o token de recuperação e defina uma nova senha de acesso."}
              </p>
            </div>

            {validatingToken && (
              <InlineLoading description="Validando link de recuperação..." />
            )}

            {tokenStatus && !tokenStatus.valid && !successMessage && (
              <InlineNotification
                kind="error"
                title="Link inválido ou expirado:"
                subtitle={tokenStatus.message}
                hideCloseButton
                data-testid="recuperar-senha-token-erro"
              />
            )}

            {successMessage && (
              <InlineNotification
                kind="success"
                title="Sucesso:"
                subtitle={successMessage}
                hideCloseButton
                data-testid="recuperar-senha-sucesso"
              />
            )}

            {errorMessage && (
              <InlineNotification
                kind="error"
                title="Atenção:"
                subtitle={errorMessage}
                hideCloseButton
                data-testid="recuperar-senha-erro"
              />
            )}

            {!validatingToken && !successMessage && tokenStatus?.valid !== false && (
              <Form onSubmit={handleSubmit} noValidate>
                <Stack gap={5}>
                  {!tokenFromUrl && (
                    <TextInput
                      id="recuperar-senha-token"
                      data-testid="recuperar-senha-token"
                      labelText="Código de Recuperação"
                      placeholder="Cole o código enviado por e-mail"
                      value={token}
                      onChange={(e) => setToken(e.target.value)}
                      disabled={isSubmitting}
                    />
                  )}

                  <PasswordInput
                    id="recuperar-senha-nova"
                    data-testid="recuperar-senha-nova"
                    labelText="Nova Senha"
                    placeholder="Mínimo de 6 caracteres"
                    value={novaSenha}
                    onChange={(e) => setNovaSenha(e.target.value)}
                    disabled={isSubmitting}
                    autoComplete="new-password"
                  />

                  <PasswordInput
                    id="recuperar-senha-confirmar"
                    data-testid="recuperar-senha-confirmar"
                    labelText="Confirmar Nova Senha"
                    placeholder="Repita a nova senha"
                    value={confirmarSenha}
                    onChange={(e) => setConfirmarSenha(e.target.value)}
                    disabled={isSubmitting}
                    autoComplete="new-password"
                  />

                  <Button
                    type="submit"
                    data-testid="recuperar-senha-submit"
                    disabled={isSubmitting || !token.trim() || !novaSenha || !confirmarSenha}
                    renderIcon={Password}
                    style={{ width: "100%", maxWidth: "none" }}
                  >
                    {isSubmitting ? "Salvando..." : "Salvar Nova Senha"}
                  </Button>
                </Stack>
              </Form>
            )}

            {successMessage && (
              <Link href="/login" style={{ textDecoration: "none" }}>
                <Button
                  kind="primary"
                  renderIcon={CheckmarkFilled}
                  style={{ width: "100%", maxWidth: "none" }}
                  data-testid="recuperar-senha-ir-login"
                >
                  Ir para o Login
                </Button>
              </Link>
            )}

            <div
              style={{
                borderTop: "1px solid var(--cds-border-subtle)",
                paddingTop: "1.25rem",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "0.75rem",
                flexWrap: "wrap",
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
              <Link
                href="/esqueci-senha"
                data-testid="link-solicitar-novo-token"
                style={{
                  fontSize: "0.875rem",
                  color: "var(--cds-link-primary)",
                  textDecoration: "none",
                  fontWeight: 500,
                }}
              >
                Solicitar novo link
              </Link>
            </div>
          </Stack>
        </Tile>
      </div>
    </div>
  );
}

export default function RecuperarSenhaPage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "var(--cds-background)",
          }}
        >
          <InlineLoading description="Carregando..." />
        </div>
      }
    >
      <RecuperarSenhaFormContent />
    </Suspense>
  );
}

