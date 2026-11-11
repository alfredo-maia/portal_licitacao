"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn, signOut } from "next-auth/react";
import { Button, Form, InlineNotification, PasswordInput, Stack, TextInput, Tile } from "@carbon/react";
import { Chat, Email, Login, Password } from "@carbon/icons-react";
import { APP_CONFIG } from "@/config/brand";
import { sanitizeEmail } from "@/lib/masks";

type AdminLoginMode = "PASSWORD" | "EMAIL_OTP" | "WHATSAPP_OTP";

export default function AdminLoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<AdminLoginMode>("PASSWORD");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const finalizarLoginAdmin = async () => {
    const verify = await fetch("/api/admin/metricas").catch(() => null);
    if (!verify || !verify.ok) {
      await signOut({ redirect: false }).catch(() => undefined);
      setErro("Conta sem permissão para acessar o Portal ADM.");
      return;
    }
    router.push("/admin");
    router.refresh();
  };

  const solicitarOtp = async (method: "EMAIL_OTP" | "WHATSAPP_OTP") => {
    setErro(null);
    setAviso(null);
    const normalizedEmail = sanitizeEmail(email);
    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      setErro("Informe o e-mail da conta administrativa antes de solicitar o código.");
      return;
    }
    setEnviando(true);
    try {
      const res = await fetch("/api/auth/otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: normalizedEmail,
          method,
          realm: "admin",
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!res.ok) {
        setErro(data.error || "Não foi possível enviar o código de acesso.");
        return;
      }
      setOtpCode("");
      setMode(method);
      setAviso(
        method === "EMAIL_OTP"
          ? `Código de 6 dígitos enviado para ${normalizedEmail}.`
          : "Código de 6 dígitos enviado para o WhatsApp cadastrado da conta ADM.",
      );
    } catch {
      setErro("Falha de conexão com o servidor ao solicitar código.");
    } finally {
      setEnviando(false);
    }
  };

  const entrar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    const normalizedEmail = sanitizeEmail(email);

    if (mode === "PASSWORD") {
      if (!normalizedEmail.includes("@") || !password) {
        setErro("Informe e-mail e senha da conta administrativa.");
        return;
      }
      setEnviando(true);
      try {
        const resp = await signIn("credentials", {
          email: normalizedEmail,
          password,
          realm: "admin",
          redirect: false,
        });
        if (resp?.error) {
          setErro("Credenciais inválidas.");
        } else {
          await finalizarLoginAdmin();
        }
      } catch {
        setErro("Falha ao comunicar com o servidor de autenticação.");
      } finally {
        setEnviando(false);
      }
      return;
    }

    const code = otpCode.trim();
    if (!normalizedEmail.includes("@") || code.length !== 6) {
      setErro("Informe o e-mail administrativo e o código de 6 dígitos.");
      return;
    }
    setEnviando(true);
    try {
      const resp = await signIn("credentials", {
        email: normalizedEmail,
        code,
        realm: "admin",
        redirect: false,
      });
      if (resp?.error) {
        setErro("Código de acesso inválido ou expirado.");
      } else {
        await finalizarLoginAdmin();
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
      <Tile style={{ width: "100%", maxWidth: "28rem", padding: "2rem" }}>
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
            {aviso ? (
              <InlineNotification kind="info" title="Código enviado" subtitle={aviso} hideCloseButton lowContrast />
            ) : null}
            <TextInput
              id="admin-email"
              labelText="E-mail administrativo"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setEmail((prev) => sanitizeEmail(prev))}
            />

            {mode === "PASSWORD" ? (
              <>
                <PasswordInput
                  id="admin-password"
                  labelText="Senha"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <Button type="submit" renderIcon={Login} disabled={enviando} style={{ width: "100%", maxWidth: "none" }}>
                  {enviando ? "Entrando..." : "Entrar no Portal ADM"}
                </Button>
              </>
            ) : (
              <>
                <TextInput
                  id="admin-otp"
                  labelText="Código de 6 Dígitos"
                  placeholder="000000"
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className="pncp-mono"
                  style={{ letterSpacing: "0.25rem", fontSize: "1.2rem", textAlign: "center" }}
                />
                <Button type="submit" renderIcon={Login} disabled={enviando} style={{ width: "100%", maxWidth: "none" }}>
                  {enviando ? "Validando..." : "Validar e Entrar"}
                </Button>
              </>
            )}

            <div style={{ borderTop: "1px solid var(--cds-border-subtle-01)", paddingTop: "1rem" }}>
              <p style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)", marginBottom: "0.6rem" }}>
                Formas de acesso disponíveis:
              </p>
              <Stack gap={3}>
                {mode !== "PASSWORD" ? (
                  <Button
                    type="button"
                    kind="secondary"
                    size="sm"
                    renderIcon={Password}
                    disabled={enviando}
                    onClick={() => {
                      setErro(null);
                      setAviso(null);
                      setOtpCode("");
                      setMode("PASSWORD");
                    }}
                    style={{ width: "100%", maxWidth: "none", justifyContent: "space-between" }}
                  >
                    Entrar com senha
                  </Button>
                ) : null}
                <Button
                  type="button"
                  kind="secondary"
                  size="sm"
                  renderIcon={Email}
                  disabled={enviando}
                  onClick={() => void solicitarOtp("EMAIL_OTP")}
                  style={{ width: "100%", maxWidth: "none", justifyContent: "space-between" }}
                >
                  Receber código por E-mail
                </Button>
                <Button
                  type="button"
                  kind="secondary"
                  size="sm"
                  renderIcon={Chat}
                  disabled={enviando}
                  onClick={() => void solicitarOtp("WHATSAPP_OTP")}
                  style={{ width: "100%", maxWidth: "none", justifyContent: "space-between" }}
                >
                  Receber código no WhatsApp
                </Button>
              </Stack>
            </div>
          </Stack>
        </Form>
      </Tile>
    </div>
  );
}
