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
  TextInput,
  Tile,
} from "@carbon/react";
import {
  ArrowRight,
  ArrowLeft,
  Login,
  Light,
  Asleep,
  Password,
  Email,
  Chat,
} from "@carbon/icons-react";
import { APP_CONFIG } from "@/config/brand";
import { useAppTheme } from "@/providers/theme-provider";

type LoginStep = "EMAIL" | "METHOD_SELECT" | "PASSWORD" | "EMAIL_OTP" | "WHATSAPP_OTP";

export default function LoginPage() {
  const router = useRouter();
  const { isDark, toggleTheme } = useAppTheme();

  const [step, setStep] = useState<LoginStep>("EMAIL");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otpCode, setOtpCode] = useState("");

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Validação e avanço do Passo 1
  const handleAvancarEmail = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    if (!email.trim() || !email.includes("@")) {
      setErrorMessage("Informe um e-mail corporativo válido.");
      return;
    }
    setStep("METHOD_SELECT");
  };

  // Solicitar envio de código OTP e abrir tela correspondente
  const handleSolicitarOtp = async (method: "EMAIL_OTP" | "WHATSAPP_OTP") => {
    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/auth/otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), method }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(data.error || "Erro ao solicitar código de acesso.");
        setIsSubmitting(false);
        return;
      }
      setStep(method);
    } catch {
      setErrorMessage("Falha de conexão com o servidor ao gerar código.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submissão do login por Senha
  const handleLoginSenha = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    if (!password) {
      setErrorMessage("Digite sua senha de acesso.");
      return;
    }
    setIsSubmitting(true);
    try {
      const response = await signIn("credentials", {
        email: email.trim().toLowerCase(),
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

  // Submissão do login por Código OTP
  const handleLoginOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    if (!otpCode.trim() || otpCode.trim().length !== 6) {
      setErrorMessage("Digite o código de 6 dígitos enviado.");
      return;
    }
    setIsSubmitting(true);
    try {
      const response = await signIn("credentials", {
        email: email.trim().toLowerCase(),
        code: otpCode.trim(),
        redirect: false,
      });

      if (response?.error) {
        setErrorMessage("Código de validação incorreto ou expirado. Tente novamente.");
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

      {/* Card de Login Multi-Step */}
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
              <h1 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 700 }}>
                {step === "METHOD_SELECT"
                  ? "Como deseja entrar?"
                  : step === "PASSWORD"
                  ? "Digite sua senha"
                  : step === "EMAIL_OTP" || step === "WHATSAPP_OTP"
                  ? "Digite o código"
                  : APP_CONFIG.brandName}
              </h1>

              {step === "EMAIL" && (
                <p
                  style={{
                    margin: "0.25rem 0 0 0",
                    fontSize: "0.875rem",
                    color: "var(--cds-text-secondary)",
                  }}
                >
                  {APP_CONFIG.tagline}
                </p>
              )}

              {step === "METHOD_SELECT" && (
                <p
                  style={{
                    margin: "0.25rem 0 0 0",
                    fontSize: "0.875rem",
                    color: "var(--cds-text-secondary)",
                    fontWeight: 500,
                  }}
                >
                  {email}
                </p>
              )}

              {step === "PASSWORD" && (
                <p
                  style={{
                    margin: "0.25rem 0 0 0",
                    fontSize: "0.875rem",
                    color: "var(--cds-text-secondary)",
                  }}
                >
                  Acessando com: <strong>{email}</strong>
                </p>
              )}

              {step === "EMAIL_OTP" && (
                <p
                  style={{
                    margin: "0.25rem 0 0 0",
                    fontSize: "0.875rem",
                    color: "var(--cds-text-secondary)",
                  }}
                >
                  Código enviado para o seu e-mail (<strong>{email}</strong>).
                </p>
              )}

              {step === "WHATSAPP_OTP" && (
                <p
                  style={{
                    margin: "0.25rem 0 0 0",
                    fontSize: "0.875rem",
                    color: "var(--cds-text-secondary)",
                  }}
                >
                  Código enviado para o seu WhatsApp cadastrado.
                </p>
              )}
            </div>

            {errorMessage && (
              <InlineNotification
                kind="error"
                title="Erro de Autenticação:"
                subtitle={errorMessage}
                lowContrast
                hideCloseButton
              />
            )}

            {/* PASSO 1: E-mail Corporativo */}
            {step === "EMAIL" && (
              <Form noValidate onSubmit={handleAvancarEmail}>
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

                  <Button
                    type="submit"
                    data-testid="login-avancar"
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
                <Button
                  kind="secondary"
                  renderIcon={Password}
                  onClick={() => setStep("PASSWORD")}
                  style={{ width: "100%", maxWidth: "none", justifyContent: "space-between" }}
                >
                  Entrar com senha
                </Button>

                <Button
                  kind="secondary"
                  renderIcon={Email}
                  disabled={isSubmitting}
                  onClick={() => handleSolicitarOtp("EMAIL_OTP")}
                  style={{ width: "100%", maxWidth: "none", justifyContent: "space-between" }}
                >
                  Receber código por E-mail
                </Button>

                <Button
                  kind="secondary"
                  renderIcon={Chat}
                  disabled={isSubmitting}
                  onClick={() => handleSolicitarOtp("WHATSAPP_OTP")}
                  style={{ width: "100%", maxWidth: "none", justifyContent: "space-between" }}
                >
                  Receber código por WhatsApp
                </Button>

                <Button
                  kind="ghost"
                  size="sm"
                  renderIcon={ArrowLeft}
                  onClick={() => setStep("EMAIL")}
                  style={{ width: "100%", maxWidth: "none", marginTop: "0.5rem" }}
                >
                  Trocar e-mail
                </Button>
              </Stack>
            )}

            {/* PASSO 3A: Senha */}
            {step === "PASSWORD" && (
              <Form noValidate onSubmit={handleLoginSenha}>
                <Stack gap={4}>
                  <div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: "0.25rem",
                      }}
                    >
                      <label
                        htmlFor="login-password"
                        className="cds--label"
                        style={{ marginBottom: 0 }}
                      >
                        Senha
                      </label>
                      <a
                        href="/recuperar-senha"
                        style={{
                          fontSize: "0.75rem",
                          color: "var(--cds-link-primary)",
                          textDecoration: "none",
                        }}
                      >
                        Esqueceu a senha?
                      </a>
                    </div>
                    <PasswordInput
                      id="login-password"
                      data-testid="login-password"
                      labelText=""
                      placeholder="Digite sua senha"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>

                  <Button
                    type="submit"
                    data-testid="login-submit"
                    disabled={isSubmitting}
                    renderIcon={Login}
                    style={{ width: "100%", maxWidth: "none" }}
                  >
                    {isSubmitting ? "Autenticando..." : "Entrar"}
                  </Button>

                  <Button
                    type="button"
                    kind="ghost"
                    size="sm"
                    renderIcon={ArrowLeft}
                    onClick={() => {
                      setErrorMessage(null);
                      setStep("METHOD_SELECT");
                    }}
                    style={{ width: "100%", maxWidth: "none" }}
                  >
                    Escolher outro método de entrada
                  </Button>
                </Stack>
              </Form>
            )}

            {/* PASSO 3B / 3C: Código OTP (E-mail ou WhatsApp) */}
            {(step === "EMAIL_OTP" || step === "WHATSAPP_OTP") && (
              <Form noValidate onSubmit={handleLoginOtp}>
                <Stack gap={4}>
                  <TextInput
                    id="login-otp"
                    data-testid="login-otp"
                    labelText="Código de 6 Dígitos"
                    placeholder="0 0 0 0 0 0"
                    maxLength={6}
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    className="pncp-mono"
                    style={{ letterSpacing: "0.25rem", fontSize: "1.25rem", textAlign: "center" }}
                  />

                  <Button
                    type="submit"
                    data-testid="login-submit-otp"
                    disabled={isSubmitting || otpCode.length !== 6}
                    renderIcon={Login}
                    style={{ width: "100%", maxWidth: "none" }}
                  >
                    {isSubmitting ? "Validando código..." : "Entrar"}
                  </Button>

                  <Button
                    type="button"
                    kind="ghost"
                    size="sm"
                    renderIcon={ArrowLeft}
                    onClick={() => {
                      setErrorMessage(null);
                      setOtpCode("");
                      setStep("METHOD_SELECT");
                    }}
                    style={{ width: "100%", maxWidth: "none" }}
                  >
                    Escolher outro método de entrada
                  </Button>
                </Stack>
              </Form>
            )}

            {/* Divisor NOVO POR AQUI? exclusivo do Passo 1 */}
            {step === "EMAIL" && (
              <div
                style={{
                  borderTop: "1px solid var(--cds-border-subtle)",
                  paddingTop: "1.25rem",
                  textAlign: "center",
                }}
              >
                <p
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    letterSpacing: "0.05rem",
                    color: "var(--cds-text-secondary)",
                    marginBottom: "0.75rem",
                  }}
                >
                  NOVO POR AQUI?
                </p>
                <Link href="/cadastro" style={{ textDecoration: "none" }}>
                  <Button
                    kind="tertiary"
                    size="sm"
                    renderIcon={ArrowRight}
                    style={{ width: "100%", maxWidth: "none" }}
                  >
                    Cadastrar Novo Usuário
                  </Button>
                </Link>
              </div>
            )}
          </Stack>
        </Tile>

        {/* Rodapé institucional */}
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
