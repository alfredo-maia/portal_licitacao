"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import {
  Button,
  Form,
  InlineNotification,
  PasswordInput,
  Stack,
  Tag,
  TextInput,
  Tile,
} from "@carbon/react";
import { ArrowRight, Login, Light, Asleep } from "@carbon/icons-react";
import { APP_CONFIG } from "@/config/brand";
import { useAppTheme } from "@/providers/theme-provider";

export default function LoginPage() {
  const router = useRouter();
  const { isDark, toggleTheme } = useAppTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const response = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (response?.error) {
        setErrorMessage("Credenciais inválidas. Verifique seu e-mail e senha.");
      } else {
        router.push("/dashboard");
      }
    } catch {
      setErrorMessage("Falha ao comunicar com o servidor de autenticação.");
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
          iconDescription={isDark ? "Alternar para Tema Claro" : "Alternar para Tema Escuro"}
          onClick={toggleTheme}
        />
      </div>

      {/* Card de Login Centralizado e Proporcional */}
      <div style={{ width: "100%", maxWidth: "440px" }}>
        <Tile
          data-testid="login-tile"
          style={{
            padding: "2.5rem 2rem",
            backgroundColor: "var(--cds-layer-01)",
            border: "1px solid var(--cds-border-subtle)",
            boxShadow: "0 8px 24px rgba(0, 0, 0, 0.25)",
          }}
        >
          <Stack gap={6}>
            {/* Header da Marca */}
            <div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "0.5rem",
                }}
              >
                <h1 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 700 }}>
                  {APP_CONFIG.brandName}
                </h1>
                <Tag type="blue" size="sm" className="pncp-mono">
                  v{APP_CONFIG.version}
                </Tag>
              </div>
              <p
                style={{
                  margin: 0,
                  fontSize: "0.875rem",
                  color: "var(--cds-text-secondary)",
                }}
              >
                {APP_CONFIG.tagline}
              </p>
            </div>

            {errorMessage ? (
              <InlineNotification
                kind="error"
                title="Erro de Autenticação:"
                subtitle={errorMessage}
                lowContrast
                hideCloseButton
              />
            ) : null}

            {/* Formulário de Login */}
            <Form onSubmit={handleSubmit}>
              <Stack gap={5}>
                <TextInput
                  id="login-email"
                  data-testid="login-email"
                  labelText="E-mail Corporativo"
                  placeholder="nome@empresa.com.br"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
                <PasswordInput
                  id="login-password"
                  data-testid="login-password"
                  labelText="Senha"
                  placeholder="Digite sua senha"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <Button
                  type="submit"
                  data-testid="login-submit"
                  disabled={isSubmitting}
                  renderIcon={Login}
                  style={{ width: "100%", maxWidth: "none", marginTop: "0.5rem" }}
                >
                  {isSubmitting ? "Autenticando..." : "Entrar no Sistema"}
                </Button>
              </Stack>
            </Form>

            {/* Divisor & Link de Cadastro / Trial de 14 Dias */}
            <div
              style={{
                borderTop: "1px solid var(--cds-border-subtle)",
                paddingTop: "1.25rem",
                textAlign: "center",
              }}
            >
              <p
                style={{
                  fontSize: "0.875rem",
                  color: "var(--cds-text-secondary)",
                  marginBottom: "0.75rem",
                }}
              >
                Ainda não possui conta corporativa?
              </p>
              <Link href="/cadastro" style={{ textDecoration: "none" }}>
                <Button
                  kind="tertiary"
                  size="sm"
                  renderIcon={ArrowRight}
                  style={{ width: "100%", maxWidth: "none" }}
                >
                  Criar Conta Grátis (14 Dias de Teste)
                </Button>
              </Link>
            </div>
          </Stack>
        </Tile>

        {/* Rodapé institucional discreto */}
        <div
          style={{
            textAlign: "center",
            marginTop: "1.5rem",
            fontSize: "0.75rem",
            color: "var(--cds-text-secondary)",
          }}
        >
          Protegido por criptografia ponta a ponta e Lei Geral de Proteção de Dados (LGPD).
        </div>
      </div>
    </div>
  );
}
