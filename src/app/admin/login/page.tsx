"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn, signOut } from "next-auth/react";
import { Button, Form, InlineNotification, PasswordInput, Stack, TextInput, Tile } from "@carbon/react";
import { Login } from "@carbon/icons-react";
import { APP_CONFIG } from "@/config/brand";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const entrar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    if (!email.includes("@") || !password) {
      setErro("Informe e-mail e senha da conta administrativa.");
      return;
    }
    setEnviando(true);
    try {
      const resp = await signIn("credentials", {
        email: email.trim().toLowerCase(),
        password,
        redirect: false,
      });
      if (resp?.error) {
        setErro("Credenciais inválidas.");
      } else {
        const verify = await fetch("/api/admin/metricas").catch(() => null);
        if (!verify || !verify.ok) {
          await signOut({ redirect: false }).catch(() => undefined);
          setErro("Conta sem permissão para acessar o Portal ADM.");
          return;
        }
        router.push("/admin");
        router.refresh();
      }
    } catch {
      setErro("Falha ao comunicar com o servidor de autenticação.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem",
        background: "var(--cds-background)",
        color: "var(--cds-text-primary)",
      }}
    >
      <Tile style={{ width: "100%", maxWidth: "26rem", padding: "2rem" }}>
        <Form onSubmit={entrar} aria-label="Login administrativo">
          <Stack gap={6}>
            <div>
              <h1 style={{ fontSize: "1.5rem", fontWeight: 600 }}>{APP_CONFIG.brandName}</h1>
              <p style={{ color: "var(--cds-text-secondary)", marginTop: "0.25rem" }}>
                Portal ADM — acesso restrito à equipe interna
              </p>
            </div>
            {erro ? (
              <InlineNotification kind="error" title="Acesso negado" subtitle={erro} hideCloseButton lowContrast />
            ) : null}
            <TextInput
              id="admin-email"
              labelText="E-mail administrativo"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <PasswordInput
              id="admin-password"
              labelText="Senha"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Button type="submit" renderIcon={Login} disabled={enviando}>
              {enviando ? "Entrando..." : "Entrar no Portal ADM"}
            </Button>
          </Stack>
        </Form>
      </Tile>
    </div>
  );
}
