"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn, signOut } from "next-auth/react";
import {
  Button,
  Form,
  InlineNotification,
  PasswordInput,
  Stack,
  TextInput,
  Tile,
} from "@carbon/react";
import {
  ArrowLeft,
  ArrowRight,
  Chat,
  Email,
  Login,
  Password,
  Renew,
} from "@carbon/icons-react";
import { APP_CONFIG } from "@/config/brand";
import { sanitizeEmail } from "@/lib/masks";

type AdminLoginStep = "EMAIL" | "METHOD_SELECT" | "PASSWORD" | "EMAIL_OTP" | "WHATSAPP_OTP";

export default function AdminLoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<AdminLoginStep>("EMAIL");
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

  // Passo 1: Validação do E-mail e Avanço
  const handleAvancarEmail = (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    setAviso(null);
    const normalizedEmail = sanitizeEmail(email);
    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      setErro("Informe um e-mail administrativo válido.");
      return;
    }
    setStep("METHOD_SELECT");
  };

  // Solicitar envio de código OTP
  const handleSolicitarOtp = async (method: "EMAIL_OTP" | "WHATSAPP_OTP") => {
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
      setStep(method);
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

  // Passo 3A: Login com Senha
  const handleLoginSenha = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    const normalizedEmail = sanitizeEmail(email);
    if (!password) {
      setErro("Digite sua senha de acesso.");
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
        setErro("Credenciais inválidas. Verifique seu e-mail e senha.");
      } else {
        await finalizarLoginAdmin();
      }
    } catch {
      setErro("Falha ao comunicar com o servidor de autenticação.");
    } finally {
      setEnviando(false);
    }
  };

  // Passo 3B / 3C: Login com Código OTP
  const handleLoginOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    const normalizedEmail = sanitizeEmail(email);
    const code = otpCode.trim();
    if (code.length !== 6) {
      setErro("Digite o código de 6 dígitos enviado.");
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
        setErro("Código de validação incorreto ou expirado. Tente novamente.");
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
        <Stack gap={6}>
          <div>
            <h1 style={{ fontSize: "1.5rem", fontWeight: 600 }}>{APP_CONFIG.brandName}</h1>
            <p style={{ color: "var(--cds-text-secondary)", marginTop: "0.25rem" }}>
              Portal ADM — acesso restrito à equipe interna
            </p>

            {step === "METHOD_SELECT" && (
              <p style={{ margin: "0.5rem 0 0 0", fontSize: "0.875rem", color: "var(--cds-text-secondary)" }}>
                Acessando com: <strong>{email}</strong>
              </p>
            )}

            {step === "PASSWORD" && (
              <p style={{ margin: "0.5rem 0 0 0", fontSize: "0.875rem", color: "var(--cds-text-secondary)" }}>
                Acessando com: <strong>{email}</strong>
              </p>
            )}

            {step === "EMAIL_OTP" && (
              <p style={{ margin: "0.5rem 0 0 0", fontSize: "0.875rem", color: "var(--cds-text-secondary)" }}>
                Código enviado para o e-mail: <strong>{email}</strong>
              </p>
            )}

            {step === "WHATSAPP_OTP" && (
              <p style={{ margin: "0.5rem 0 0 0", fontSize: "0.875rem", color: "var(--cds-text-secondary)" }}>
                Código enviado para o WhatsApp da conta ADM.
              </p>
            )}
          </div>

          {erro ? (
            <InlineNotification kind="error" title="Acesso negado" subtitle={erro} hideCloseButton lowContrast />
          ) : null}

          {aviso ? (
            <InlineNotification kind="info" title="Código enviado" subtitle={aviso} hideCloseButton lowContrast />
          ) : null}

          {/* PASSO 1: Informar E-mail */}
          {step === "EMAIL" && (
            <Form onSubmit={handleAvancarEmail} aria-label="Login administrativo - E-mail">
              <Stack gap={5}>
                <TextInput
                  id="admin-email"
                  labelText="E-mail administrativo"
                  type="email"
                  autoComplete="username"
                  placeholder="admin@empresa.com.br"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => setEmail((prev) => sanitizeEmail(prev))}
                  required
                />
                <Button
                  type="submit"
                  renderIcon={ArrowRight}
                  style={{ width: "100%", maxWidth: "none" }}
                >
                  Avançar
                </Button>
              </Stack>
            </Form>
          )}

          {/* PASSO 2: Como deseja entrar? */}
          {step === "METHOD_SELECT" && (
            <Stack gap={3}>
              <p style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--cds-text-primary)" }}>
                Como deseja entrar?
              </p>

              <Button
                kind="secondary"
                renderIcon={Password}
                onClick={() => {
                  setErro(null);
                  setAviso(null);
                  setStep("PASSWORD");
                }}
                style={{ width: "100%", maxWidth: "none", justifyContent: "space-between" }}
              >
                Entrar com Senha
              </Button>

              <Button
                kind="secondary"
                renderIcon={Email}
                disabled={enviando}
                onClick={() => void handleSolicitarOtp("EMAIL_OTP")}
                style={{ width: "100%", maxWidth: "none", justifyContent: "space-between" }}
              >
                Receber código por E-mail
              </Button>

              <Button
                kind="secondary"
                renderIcon={Chat}
                disabled={enviando}
                onClick={() => void handleSolicitarOtp("WHATSAPP_OTP")}
                style={{ width: "100%", maxWidth: "none", justifyContent: "space-between" }}
              >
                Receber código no WhatsApp
              </Button>

              <Button
                kind="ghost"
                size="sm"
                renderIcon={ArrowLeft}
                onClick={() => {
                  setErro(null);
                  setAviso(null);
                  setStep("EMAIL");
                }}
                style={{ width: "100%", maxWidth: "none", marginTop: "0.5rem" }}
              >
                Trocar e-mail
              </Button>
            </Stack>
          )}

          {/* PASSO 3A: Senha */}
          {step === "PASSWORD" && (
            <Form onSubmit={handleLoginSenha} aria-label="Login administrativo - Senha">
              <Stack gap={4}>
                <PasswordInput
                  id="admin-password"
                  labelText="Senha"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />

                <Button
                  type="submit"
                  renderIcon={Login}
                  disabled={enviando}
                  style={{ width: "100%", maxWidth: "none" }}
                >
                  {enviando ? "Entrando..." : "Entrar no Portal ADM"}
                </Button>

                <Button
                  kind="ghost"
                  size="sm"
                  renderIcon={ArrowLeft}
                  disabled={enviando}
                  onClick={() => {
                    setErro(null);
                    setAviso(null);
                    setPassword("");
                    setStep("METHOD_SELECT");
                  }}
                  style={{ width: "100%", maxWidth: "none" }}
                >
                  Voltar
                </Button>
              </Stack>
            </Form>
          )}

          {/* PASSO 3B / 3C: Código OTP */}
          {(step === "EMAIL_OTP" || step === "WHATSAPP_OTP") && (
            <Form onSubmit={handleLoginOtp} aria-label="Login administrativo - Código OTP">
              <Stack gap={4}>
                <TextInput
                  id="admin-otp"
                  labelText="Código de 6 Dígitos"
                  placeholder="000000"
                  maxLength={6}
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className="pncp-mono"
                  style={{ letterSpacing: "0.25rem", fontSize: "1.2rem", textAlign: "center" }}
                  required
                />

                <Button
                  type="submit"
                  renderIcon={Login}
                  disabled={enviando || otpCode.trim().length !== 6}
                  style={{ width: "100%", maxWidth: "none" }}
                >
                  {enviando ? "Validando..." : "Validar e Entrar"}
                </Button>

                <div style={{ display: "flex", gap: "0.5rem", justifyContent: "space-between" }}>
                  <Button
                    kind="ghost"
                    size="sm"
                    renderIcon={ArrowLeft}
                    disabled={enviando}
                    onClick={() => {
                      setErro(null);
                      setAviso(null);
                      setOtpCode("");
                      setStep("METHOD_SELECT");
                    }}
                  >
                    Voltar
                  </Button>

                  <Button
                    kind="ghost"
                    size="sm"
                    renderIcon={Renew}
                    disabled={enviando}
                    onClick={() => void handleSolicitarOtp(step)}
                  >
                    Reenviar código
                  </Button>
                </div>
              </Stack>
            </Form>
          )}
        </Stack>
      </Tile>
    </div>
  );
}
