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
import { ArrowRight, CheckmarkOutline, Light, Asleep } from "@carbon/icons-react";
import { APP_CONFIG } from "@/config/brand";
import { useAppTheme } from "@/providers/theme-provider";

export default function CadastroPage() {
  const router = useRouter();
  const { isDark, toggleTheme } = useAppTheme();

  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [razaoSocial, setRazaoSocial] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [senha, setSenha] = useState("");

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Máscara dinâmica para CNPJ (00.000.000/0000-00)
  const formatarCnpj = (valor: string) => {
    const digits = valor.replace(/\D/g, "").slice(0, 14);
    if (digits.length <= 2) return digits;
    if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
    if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
    if (digits.length <= 12) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`;
  };

  // Máscara dinâmica para WhatsApp ((00) 00000-0000)
  const formatarTelefone = (valor: string) => {
    const digits = valor.replace(/\D/g, "").slice(0, 11);
    if (digits.length <= 2) return digits;
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/auth/cadastro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome,
          email,
          cnpj,
          razaoSocial,
          whatsapp,
          senha,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMessage(data.error || "Erro ao realizar cadastro.");
        setIsSubmitting(false);
        return;
      }

      // Login automático após cadastro bem-sucedido
      const loginRes = await signIn("credentials", {
        email,
        password: senha,
        redirect: false,
      });

      if (loginRes?.error) {
        router.push("/login");
      } else {
        router.push("/dashboard");
      }
    } catch {
      setErrorMessage("Falha de conexão com o servidor.");
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
        padding: "2rem 1.5rem",
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

      <div style={{ width: "100%", maxWidth: "520px" }}>
        <Tile
          data-testid="cadastro-tile"
          style={{
            padding: "2.5rem 2rem",
            backgroundColor: "var(--cds-layer-01)",
            border: "1px solid var(--cds-border-subtle)",
            boxShadow: "0 8px 24px rgba(0, 0, 0, 0.25)",
          }}
        >
          <Stack gap={6}>
            {/* Header com Tag de 14 Dias Grátis */}
            <div>
              <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem", flexWrap: "wrap" }}>
                <Tag type="green" size="sm">
                  14 DIAS GRÁTIS
                </Tag>
                <Tag type="cool-gray" size="sm">
                  SEM CARTÃO DE CRÉDITO
                </Tag>
              </div>
              <h1 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 700 }}>
                Criar Conta — {APP_CONFIG.brandName}
              </h1>
              <p
                style={{
                  margin: "0.5rem 0 0 0",
                  fontSize: "0.875rem",
                  color: "var(--cds-text-secondary)",
                }}
              >
                Inicie sua degustação corporativa gratuita e monitore licitações do seu segmento em tempo real.
              </p>
            </div>

            {errorMessage && (
              <InlineNotification
                kind="error"
                title="Atenção:"
                subtitle={errorMessage}
                lowContrast
                hideCloseButton
              />
            )}

            {/* Formulário de Cadastro */}
            <Form onSubmit={handleSubmit}>
              <Stack gap={4}>
                <TextInput
                  id="cadastro-nome"
                  data-testid="cadastro-nome"
                  labelText="Nome Completo do Responsável"
                  placeholder="Ex: Carlos Silva"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  required
                />

                <TextInput
                  id="cadastro-email"
                  data-testid="cadastro-email"
                  labelText="E-mail Corporativo"
                  placeholder="gestor@empresa.com.br"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  helperText="Não utilize e-mails temporários ou descartáveis."
                  required
                />

                <TextInput
                  id="cadastro-cnpj"
                  data-testid="cadastro-cnpj"
                  labelText="CNPJ da Empresa"
                  placeholder="00.000.000/0000-00"
                  value={cnpj}
                  onChange={(e) => setCnpj(formatarCnpj(e.target.value))}
                  required
                />

                <TextInput
                  id="cadastro-razao"
                  data-testid="cadastro-razao"
                  labelText="Razão Social"
                  placeholder="Ex: Silva & Santos Suprimentos Ltda"
                  value={razaoSocial}
                  onChange={(e) => setRazaoSocial(e.target.value)}
                  required
                />

                <TextInput
                  id="cadastro-whatsapp"
                  data-testid="cadastro-whatsapp"
                  labelText="WhatsApp para Alertas Matinais"
                  placeholder="(62) 99999-8888"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(formatarTelefone(e.target.value))}
                  helperText="Enviaremos alertas diários de certames e o código de validação."
                  required
                />

                <PasswordInput
                  id="cadastro-senha"
                  data-testid="cadastro-senha"
                  labelText="Criar Senha de Acesso"
                  placeholder="Mínimo 6 caracteres"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  required
                />

                <Button
                  type="submit"
                  data-testid="cadastro-submit"
                  disabled={isSubmitting}
                  renderIcon={ArrowRight}
                  style={{ width: "100%", maxWidth: "none", marginTop: "1rem" }}
                >
                  {isSubmitting ? "Criando sua conta..." : "Começar Teste de 14 Dias Grátis"}
                </Button>
              </Stack>
            </Form>

            {/* Link para quem já possui conta */}
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
                  marginBottom: "0.5rem",
                }}
              >
                Já possui uma conta corporativa?
              </p>
              <Link href="/login" style={{ textDecoration: "none" }}>
                <Button
                  kind="ghost"
                  size="sm"
                  style={{ width: "100%", maxWidth: "none" }}
                >
                  Fazer Login no Sistema
                </Button>
              </Link>
            </div>
          </Stack>
        </Tile>
      </div>
    </div>
  );
}
