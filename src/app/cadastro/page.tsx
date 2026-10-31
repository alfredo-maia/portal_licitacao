"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import {
  Button,
  Checkbox,
  Form,
  InlineNotification,
  PasswordInput,
  Stack,
  Tag,
  TextInput,
  Tile,
} from "@carbon/react";
import {
  ArrowRight,
  ArrowLeft,
  CheckmarkOutline,
  Light,
  Asleep,
} from "@carbon/icons-react";
import { APP_CONFIG } from "@/config/brand";
import { useAppTheme } from "@/providers/theme-provider";
import {
  CATALOGO_MACRO_SEGMENTOS,
  type MacroSegmento,
} from "@/server/schemas/segmentos.schema";
import { ESTADOS_BRASIL } from "@/config/estados";

export default function CadastroPage() {
  const router = useRouter();
  const { isDark, toggleTheme } = useAppTheme();

  // Etapa ativa: 1 (Dados Cadastrais) ou 2 (Ramo do Negócio & Regiões)
  const [etapa, setEtapa] = useState<1 | 2>(1);

  // Campos da Etapa 1
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [razaoSocial, setRazaoSocial] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [senha, setSenha] = useState("");

  // Campos da Etapa 2
  const [segmentosSelecionados, setSegmentosSelecionados] = useState<string[]>([]);
  const [subsegmentosSelecionados, setSubsegmentosSelecionados] = useState<string[]>([]);
  const [brasilInteiro, setBrasilInteiro] = useState(true);
  const [ufsSelecionadas, setUfsSelecionadas] = useState<string[]>([]);

  // Erros e estados de loading
  const [errosEtapa1, setErrosEtapa1] = useState<Record<string, string>>({});
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

  // Máscara dinâmica para Telefone ((00) 00000-0000)
  const formatarTelefone = (valor: string) => {
    const digits = valor.replace(/\D/g, "").slice(0, 11);
    if (digits.length <= 2) return digits;
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`;
  };

  // Avançar da Etapa 1 para a Etapa 2
  const handleAvancarEtapa1 = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const erros: Record<string, string> = {};
    if (!cnpj.trim() || cnpj.replace(/\D/g, "").length < 14) {
      erros.cnpj = "Informe um CNPJ válido com 14 dígitos.";
    }
    if (!razaoSocial.trim() || razaoSocial.trim().length < 3) {
      erros.razaoSocial = "Informe a Razão Social da empresa.";
    }
    if (!nome.trim() || nome.trim().length < 2) {
      erros.nome = "Informe o nome completo do responsável.";
    }
    if (!email.trim() || !email.includes("@")) {
      erros.email = "Informe um e-mail corporativo válido.";
    }
    if (!whatsapp.trim() || whatsapp.replace(/\D/g, "").length < 10) {
      erros.whatsapp = "Informe um telefone com DDD válido.";
    }
    if (!senha || senha.length < 6) {
      erros.senha = "A senha deve ter no mínimo 6 caracteres.";
    }

    if (Object.keys(erros).length > 0) {
      setErrosEtapa1(erros);
      setErrorMessage("Preencha todos os campos obrigatórios com dados válidos para prosseguir.");
      return;
    }

    setErrosEtapa1({});
    setEtapa(2);
  };

  // Toggle de Macro-Segmento
  const handleToggleMacroSegmento = (codigoMacro: string) => {
    const macroDef = CATALOGO_MACRO_SEGMENTOS[codigoMacro as MacroSegmento];
    const subCodigos = (macroDef?.subcategorias || []).map((s) => s.codigo);

    if (segmentosSelecionados.includes(codigoMacro)) {
      // Desmarca macro e remove seus subsegmentos
      setSegmentosSelecionados((prev) => prev.filter((c) => c !== codigoMacro));
      setSubsegmentosSelecionados((prev) =>
        prev.filter((sub) => !subCodigos.includes(sub)),
      );
    } else {
      // Marca macro e inclui todos os seus subsegmentos por padrão
      setSegmentosSelecionados((prev) => [...prev, codigoMacro]);
      setSubsegmentosSelecionados((prev) => {
        const novos = subCodigos.filter((sub) => !prev.includes(sub));
        return [...prev, ...novos];
      });
    }
  };

  // Toggle individual de Sub-segmento
  const handleToggleSubsegmento = (codigoSub: string) => {
    setSubsegmentosSelecionados((prev) =>
      prev.includes(codigoSub)
        ? prev.filter((s) => s !== codigoSub)
        : [...prev, codigoSub],
    );
  };

  // Toggle de UF
  const handleToggleUf = (sigla: string) => {
    setUfsSelecionadas((prev) =>
      prev.includes(sigla) ? prev.filter((u) => u !== sigla) : [...prev, sigla],
    );
  };

  // Submissão Final (Etapa 2)
  const handleFinalizarCadastro = async (e: React.FormEvent) => {
    e.preventDefault();
    if (segmentosSelecionados.length === 0) {
      setErrorMessage("Selecione pelo menos um segmento de atuação da sua empresa.");
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/auth/cadastro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nomeResponsavel: nome,
          nome,
          email,
          cnpj,
          razaoSocial,
          whatsapp,
          senha,
          segmentos: segmentosSelecionados,
          subsegmentos: subsegmentosSelecionados,
          ufs: brasilInteiro ? [] : ufsSelecionadas,
          brasilInteiro,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMessage(data.error || "Erro ao realizar cadastro.");
        setIsSubmitting(false);
        return;
      }

      // Login automático após cadastro
      const loginRes = await signIn("credentials", {
        email,
        password: senha,
        redirect: false,
      });

      if (loginRes?.error) {
        window.location.href = "/login";
      } else {
        window.location.href = "/dashboard";
      }
    } catch {
      setErrorMessage("Falha de conexão com o servidor ao concluir cadastro.");
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

      <div style={{ width: "100%", maxWidth: etapa === 1 ? "520px" : "680px", transition: "max-width 0.2s ease" }}>
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
              <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
                <Tag type="green" size="sm">
                  14 DIAS GRÁTIS
                </Tag>
                <Tag type="cool-gray" size="sm">
                  SEM CARTÃO DE CRÉDITO
                </Tag>
                <Tag type="blue" size="sm">
                  ETAPA {etapa} DE 2
                </Tag>
              </div>
              <h1 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 700 }}>
                {etapa === 1 ? `Criar Conta — ${APP_CONFIG.brandName}` : "Ramo do seu negócio"}
              </h1>
              <p
                style={{
                  margin: "0.5rem 0 0 0",
                  fontSize: "0.875rem",
                  color: "var(--cds-text-secondary)",
                }}
              >
                {etapa === 1
                  ? "Cadastre sua empresa para monitorar e gerenciar licitações públicas do seu segmento em todo o país."
                  : "Selecione os macro-segmentos e subcategorias que sua empresa comercializa para filtrar os certames ideais."}
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

            {/* ETAPA 1: Dados Cadastrais */}
            {etapa === 1 && (
              <Form noValidate onSubmit={handleAvancarEtapa1}>
                <Stack gap={4}>
                  <TextInput
                    id="cadastro-cnpj"
                    data-testid="cadastro-cnpj"
                    labelText="CNPJ da Empresa"
                    placeholder="00.000.000/0000-00"
                    value={cnpj}
                    onChange={(e) => {
                      setCnpj(formatarCnpj(e.target.value));
                      if (errosEtapa1.cnpj) setErrosEtapa1((prev) => ({ ...prev, cnpj: "" }));
                    }}
                    invalid={Boolean(errosEtapa1.cnpj)}
                    invalidText={errosEtapa1.cnpj}
                  />

                  <TextInput
                    id="cadastro-razao"
                    data-testid="cadastro-razao"
                    labelText="Razão Social"
                    placeholder="Ex: Panificadora & Suprimentos Ltda"
                    value={razaoSocial}
                    onChange={(e) => {
                      setRazaoSocial(e.target.value);
                      if (errosEtapa1.razaoSocial) setErrosEtapa1((prev) => ({ ...prev, razaoSocial: "" }));
                    }}
                    invalid={Boolean(errosEtapa1.razaoSocial)}
                    invalidText={errosEtapa1.razaoSocial}
                  />

                  <TextInput
                    id="cadastro-nome"
                    data-testid="cadastro-nome"
                    labelText="Nome Completo do Responsável"
                    placeholder="Ex: Carlos Silva"
                    value={nome}
                    onChange={(e) => {
                      setNome(e.target.value);
                      if (errosEtapa1.nome) setErrosEtapa1((prev) => ({ ...prev, nome: "" }));
                    }}
                    invalid={Boolean(errosEtapa1.nome)}
                    invalidText={errosEtapa1.nome}
                  />

                  <TextInput
                    id="cadastro-email"
                    data-testid="cadastro-email"
                    labelText="E-mail Corporativo"
                    placeholder="gestor@empresa.com.br"
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (errosEtapa1.email) setErrosEtapa1((prev) => ({ ...prev, email: "" }));
                    }}
                    invalid={Boolean(errosEtapa1.email)}
                    invalidText={errosEtapa1.email}
                  />

                  <TextInput
                    id="cadastro-whatsapp"
                    data-testid="cadastro-whatsapp"
                    labelText="Telefone"
                    placeholder="(62) 99999-8888"
                    value={whatsapp}
                    onChange={(e) => {
                      setWhatsapp(formatarTelefone(e.target.value));
                      if (errosEtapa1.whatsapp) setErrosEtapa1((prev) => ({ ...prev, whatsapp: "" }));
                    }}
                    helperText="Número para avisos operacionais e recebimento de código de acesso."
                    invalid={Boolean(errosEtapa1.whatsapp)}
                    invalidText={errosEtapa1.whatsapp}
                  />

                  <PasswordInput
                    id="cadastro-senha"
                    data-testid="cadastro-senha"
                    labelText="Senha de Acesso"
                    placeholder="Mínimo 6 caracteres"
                    value={senha}
                    onChange={(e) => {
                      setSenha(e.target.value);
                      if (errosEtapa1.senha) setErrosEtapa1((prev) => ({ ...prev, senha: "" }));
                    }}
                    invalid={Boolean(errosEtapa1.senha)}
                    invalidText={errosEtapa1.senha}
                  />

                  <Button
                    type="submit"
                    data-testid="cadastro-btn-avancar"
                    renderIcon={ArrowRight}
                    style={{ width: "100%", maxWidth: "none", marginTop: "1rem" }}
                  >
                    Escolher o ramo do seu negócio
                  </Button>
                </Stack>
              </Form>
            )}

            {/* ETAPA 2: Ramo do Negócio & Regiões */}
            {etapa === 2 && (
              <Form noValidate onSubmit={handleFinalizarCadastro}>
                <Stack gap={5}>
                  {/* Lista de Segmentos */}
                  <div>
                    <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                      Segmentos de Atuação
                    </h2>
                    <p style={{ fontSize: "0.8125rem", color: "var(--cds-text-secondary)", marginBottom: "1rem" }}>
                      Ao selecionar um segmento, todas as subcategorias vêm marcadas por padrão. Desmarque as que não fornecer.
                    </p>

                    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                      {Object.values(CATALOGO_MACRO_SEGMENTOS).map((macro) => {
                        const isMacroChecked = segmentosSelecionados.includes(macro.codigo);
                        return (
                          <div
                            key={macro.codigo}
                            style={{
                              border: "1px solid var(--cds-border-subtle)",
                              borderRadius: "4px",
                              padding: "1rem",
                              backgroundColor: isMacroChecked
                                ? "var(--cds-layer-accent-01, rgba(69, 137, 255, 0.05))"
                                : "var(--cds-layer-02)",
                            }}
                          >
                            <Checkbox
                              id={`macro-${macro.codigo}`}
                              labelText={macro.nome}
                              checked={isMacroChecked}
                              onChange={() => handleToggleMacroSegmento(macro.codigo)}
                            />

                            {isMacroChecked && (
                              <div
                                style={{
                                  marginTop: "0.75rem",
                                  paddingLeft: "1.75rem",
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: "0.35rem",
                                }}
                              >
                                {macro.subcategorias.map((sub) => (
                                  <Checkbox
                                    key={sub.codigo}
                                    id={`sub-${sub.codigo}`}
                                    labelText={sub.nome}
                                    checked={subsegmentosSelecionados.includes(sub.codigo)}
                                    onChange={() => handleToggleSubsegmento(sub.codigo)}
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Abrangência Geográfica */}
                  <div style={{ borderTop: "1px solid var(--cds-border-subtle)", paddingTop: "1rem" }}>
                    <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                      Abrangência Geográfica (Regiões de Monitoramento)
                    </h2>
                    <p style={{ fontSize: "0.8125rem", color: "var(--cds-text-secondary)", marginBottom: "0.75rem" }}>
                      Durante o teste grátis, você pode monitorar o Brasil inteiro ou restringir às suas UFs prioritárias.
                    </p>

                    <Checkbox
                      id="check-brasil-inteiro"
                      labelText="Brasil inteiro (Todas as 27 UFs)"
                      checked={brasilInteiro}
                      onChange={(_, { checked }) => setBrasilInteiro(checked)}
                    />

                    {!brasilInteiro && (
                      <div
                        style={{
                          marginTop: "0.75rem",
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fill, minmax(70px, 1fr))",
                          gap: "0.5rem",
                          maxHeight: "140px",
                          overflowY: "auto",
                          padding: "0.5rem",
                          border: "1px solid var(--cds-border-subtle)",
                        }}
                      >
                        {ESTADOS_BRASIL.map((uf) => (
                          <Checkbox
                            key={uf.sigla}
                            id={`uf-${uf.sigla}`}
                            labelText={uf.sigla}
                            checked={ufsSelecionadas.includes(uf.sigla)}
                            onChange={() => handleToggleUf(uf.sigla)}
                          />
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Botões de Ação da Etapa 2 */}
                  <div style={{ display: "flex", gap: "1rem", marginTop: "1rem", flexWrap: "wrap" }}>
                    <Button
                      type="button"
                      kind="secondary"
                      renderIcon={ArrowLeft}
                      onClick={() => setEtapa(1)}
                      style={{ flex: 1, minWidth: "160px" }}
                    >
                      Voltar
                    </Button>
                    <Button
                      type="submit"
                      data-testid="cadastro-submit"
                      disabled={isSubmitting || segmentosSelecionados.length === 0}
                      renderIcon={CheckmarkOutline}
                      style={{ flex: 2, minWidth: "240px" }}
                    >
                      {isSubmitting ? "Criando sua conta..." : "Começar Teste de 14 Dias Grátis"}
                    </Button>
                  </div>
                </Stack>
              </Form>
            )}

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
