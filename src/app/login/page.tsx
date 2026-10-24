"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import {
  Button,
  Column,
  Form,
  Grid,
  InlineNotification,
  PasswordInput,
  Stack,
  Tag,
  TextInput,
  Tile,
} from "@carbon/react";
import { APP_CONFIG } from "@/config/brand";

export default function LoginPage() {
  const router = useRouter();
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
    <Grid fullWidth>
      <Column lg={{ span: 6, offset: 5 }} md={{ span: 6, offset: 1 }} sm={4}>
        <Tile data-testid="login-tile" style={{ padding: "2rem" }}>
          <Stack gap={6}>
            <div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "0.5rem",
                }}
              >
                <h1 style={{ margin: 0, fontSize: "1.5rem" }}>
                  Acesso Corporativo — {APP_CONFIG.brandName}
                </h1>
                <Tag type="blue" size="sm" className="pncp-mono">
                  v{APP_CONFIG.version}
                </Tag>
              </div>
              <p style={{ margin: 0, color: "var(--cds-text-secondary)" }}>
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
                  style={{ width: "100%", maxWidth: "none" }}
                >
                  {isSubmitting ? "Autenticando..." : "Entrar no Sistema"}
                </Button>
              </Stack>
            </Form>
          </Stack>
        </Tile>
      </Column>
    </Grid>
  );
}
