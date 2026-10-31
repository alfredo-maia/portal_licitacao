"use client";

import React, { useEffect, useState } from "react";
import {
  Button,
  InlineNotification,
  Modal,
  Tag,
  Tile,
} from "@carbon/react";
import {
  Checkmark,
  Information,
  Money,
  StarFilled,
  Upgrade,
} from "@carbon/icons-react";
import { APP_CONFIG } from "@/config/brand";

interface StatusAssinatura {
  ok: boolean;
  plano: string;
  billingStatus: string;
  diasRestantesTrial: number;
  diasRestantesCarencia: number;
  isReadOnly: boolean;
  isBlocked: boolean;
  inGracePeriod: boolean;
  mensagemStatus: string;
  maxCnpjs: number;
  maxUsers: number;
  cnpj?: string | null;
  razaoSocial?: string | null;
}

interface PlanoDefinicao {
  id: string;
  nome: string;
  preco: string;
  frequencia: string;
  descricao: string;
  destaque?: boolean;
  recursos: string[];
  maxCnpjs: number;
  maxUsers: number;
}

const PLANOS_CATALOGO: PlanoDefinicao[] = [
  {
    id: "BASICO",
    nome: "Básico",
    preco: "R$ 197",
    frequencia: "/ mês",
    descricao: "Ideal para empresas iniciantes em licitações públicas com atuação regional.",
    recursos: [
      "1 CNPJ cadastrado",
      "1 Usuário de acesso",
      "1 Segmento Macro de atuação",
      "1 Estado (UF da sede da empresa)",
      "Busca de oportunidades PNCP",
      "Dossiê básico e análise de editais",
      "Suporte via e-mail",
    ],
    maxCnpjs: 1,
    maxUsers: 1,
  },
  {
    id: "PRO",
    nome: "Pro",
    preco: "R$ 497",
    frequencia: "/ mês",
    descricao: "Para empresas consolidadas que participam ativamente em âmbito nacional.",
    destaque: true,
    recursos: [
      "Até 2 CNPJs cadastrados",
      "Até 2 Usuários simultâneos",
      "Todos os Segmentos Macros liberados",
      "Todas as 27 UFs (Todo o Brasil)",
      "Triagem com IA e Parecer Go/No-Go",
      "Dossiê avançado com download automático de anexos",
      "Gestão de certidões e alertas de validade",
      "Suporte prioritário via WhatsApp",
    ],
    maxCnpjs: 2,
    maxUsers: 2,
  },
  {
    id: "ENTERPRISE",
    nome: "Enterprise",
    preco: "R$ 997",
    frequencia: "/ mês",
    descricao: "Para grandes corporações e grupos empresariais com alta demanda de disputas.",
    recursos: [
      "Até 5 CNPJs cadastrados",
      "Até 10 Colaboradores na equipe",
      "Cobertura nacional completa e ilimitada",
      "Prioridade máxima na coleta e análise de editais",
      "Trilha de auditoria executiva completa",
      "Gerente de contas dedicado",
      "Onboarding assistido e treinamento de equipe",
    ],
    maxCnpjs: 5,
    maxUsers: 10,
  },
];

export default function PlanosPage() {
  const [status, setStatus] = useState<StatusAssinatura | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [modalCheckoutAberto, setModalCheckoutAberto] = useState(false);
  const [planoSelecionado, setPlanoSelecionado] = useState<PlanoDefinicao | null>(null);

  useEffect(() => {
    fetch("/api/planos/status")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.ok) {
          setStatus(data);
        }
      })
      .catch(() => {})
      .finally(() => setCarregando(false));
  }, []);

  const handleContratar = (plano: PlanoDefinicao) => {
    setPlanoSelecionado(plano);
    setModalCheckoutAberto(true);
  };

  const planoAtivoId = status?.plano?.toUpperCase() || "PRO";

  return (
    <div style={{ padding: "2rem", maxWidth: "1280px", margin: "0 auto" }}>
      {/* Cabeçalho */}
      <div style={{ marginBottom: "2rem" }}>
        <h1
          style={{
            fontSize: "2rem",
            fontWeight: 600,
            color: "var(--cds-text-primary, #161616)",
            marginBottom: "0.5rem",
          }}
        >
          Planos & Assinatura
        </h1>
        <p style={{ color: "var(--cds-text-secondary, #525252)", fontSize: "0.95rem" }}>
          Gerencie a assinatura do {APP_CONFIG.brandName}, limites de CNPJ e membros da equipe.
        </p>
      </div>

      {/* Alertas de Carência ou Somente-Leitura */}
      {status?.isReadOnly && (
        <div style={{ marginBottom: "1.5rem" }}>
          <InlineNotification
            kind="error"
            title="Acesso Somente-Leitura:"
            subtitle={
              status.mensagemStatus ||
              "Seu período de avaliação expirou. Escolha um dos planos abaixo para restabelecer o acesso total."
            }
            hideCloseButton
          />
        </div>
      )}

      {status?.inGracePeriod && (
        <div style={{ marginBottom: "1.5rem" }}>
          <InlineNotification
            kind="warning"
            title="Período de Carência Ativo:"
            subtitle={
              status.mensagemStatus ||
              "Seu período de teste terminou. Você está no período de carência de 3 dias. Escolha um plano para evitar a interrupção das ações."
            }
            hideCloseButton
          />
        </div>
      )}

      {/* Card do Status Atual */}
      <Tile
        style={{
          marginBottom: "2.5rem",
          padding: "1.5rem",
          backgroundColor: "var(--cds-layer-01, #f4f4f4)",
          border: "1px solid var(--cds-border-subtle, #e0e0e0)",
        }}
      >
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "1rem",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" }}>
              <span style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--cds-text-primary)" }}>
                Plano Atual da Empresa:
              </span>
              <Tag type={planoAtivoId === "PRO" ? "blue" : planoAtivoId === "ENTERPRISE" ? "purple" : "teal"}>
                {planoAtivoId}
              </Tag>
              {status?.billingStatus === "TRIAL" && (
                <Tag type="cyan">
                  {status.diasRestantesTrial > 0
                    ? `Degustação: ${status.diasRestantesTrial} dia(s) restante(s)`
                    : "Trial Finalizado"}
                </Tag>
              )}
              {status?.billingStatus === "ATIVO" && <Tag type="green">Assinatura Ativa</Tag>}
            </div>
            <p style={{ fontSize: "0.875rem", color: "var(--cds-text-secondary)" }}>
              {status?.razaoSocial ? `${status.razaoSocial} • ` : ""}
              {status?.cnpj ? `CNPJ: ${status.cnpj} • ` : ""}
              Capacidade: até {status?.maxCnpjs ?? 1} CNPJ(s) e até {status?.maxUsers ?? 1} Colaborador(es).
            </p>
          </div>

          <div>
            <Button
              kind="tertiary"
              size="sm"
              renderIcon={Upgrade}
              onClick={() => {
                const pro = PLANOS_CATALOGO.find((p) => p.id === "PRO") || PLANOS_CATALOGO[0];
                handleContratar(pro);
              }}
            >
              Fazer Upgrade / Renovar
            </Button>
          </div>
        </div>
      </Tile>

      {/* Grid de Cards de Planos */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: "1.5rem",
          alignItems: "stretch",
        }}
      >
        {PLANOS_CATALOGO.map((plano) => {
          const isPlanoAtual = plano.id === planoAtivoId;

          return (
            <Tile
              key={plano.id}
              style={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                padding: "2rem",
                position: "relative",
                border: plano.destaque
                  ? "2px solid var(--cds-interactive, #0f62fe)"
                  : "1px solid var(--cds-border-subtle, #e0e0e0)",
                backgroundColor: "var(--cds-layer-01, #f4f4f4)",
                borderRadius: "4px",
              }}
            >
              {/* Badges superiores */}
              <div
                style={{
                  position: "absolute",
                  top: "-12px",
                  right: "16px",
                  display: "flex",
                  gap: "0.5rem",
                }}
              >
                {plano.destaque && (
                  <Tag type="blue" size="sm">
                    Mais Recomendado
                  </Tag>
                )}
                {isPlanoAtual && (
                  <Tag type="green" size="sm">
                    Plano Atual
                  </Tag>
                )}
              </div>

              <div>
                <h2
                  style={{
                    fontSize: "1.5rem",
                    fontWeight: 600,
                    marginBottom: "0.5rem",
                    color: "var(--cds-text-primary)",
                  }}
                >
                  {plano.nome}
                </h2>
                <p
                  style={{
                    fontSize: "0.875rem",
                    color: "var(--cds-text-secondary)",
                    marginBottom: "1.5rem",
                    minHeight: "40px",
                  }}
                >
                  {plano.descricao}
                </p>

                {/* Preço */}
                <div style={{ marginBottom: "1.5rem" }}>
                  <span
                    style={{
                      fontSize: "2.25rem",
                      fontWeight: 700,
                      color: "var(--cds-text-primary)",
                    }}
                  >
                    {plano.preco}
                  </span>
                  <span
                    style={{
                      fontSize: "0.875rem",
                      color: "var(--cds-text-secondary)",
                      marginLeft: "0.25rem",
                    }}
                  >
                    {plano.frequencia}
                  </span>
                </div>

                {/* Linha Divisória */}
                <div
                  style={{
                    height: "1px",
                    backgroundColor: "var(--cds-border-subtle, #e0e0e0)",
                    marginBottom: "1.5rem",
                  }}
                />

                {/* Lista de Recursos */}
                <ul style={{ listStyle: "none", padding: 0, margin: "0 0 2rem 0" }}>
                  {plano.recursos.map((rec, i) => (
                    <li
                      key={i}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "0.5rem",
                        marginBottom: "0.75rem",
                        fontSize: "0.875rem",
                        color: "var(--cds-text-primary)",
                      }}
                    >
                      <Checkmark
                        size={16}
                        style={{
                          color: "var(--cds-support-success, #24a148)",
                          flexShrink: 0,
                          marginTop: "2px",
                        }}
                      />
                      <span>{rec}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Ação */}
              <div>
                {isPlanoAtual ? (
                  <Button kind="secondary" size="md" disabled style={{ width: "100%" }}>
                    Seu Plano Atual
                  </Button>
                ) : (
                  <Button
                    kind={plano.destaque ? "primary" : "tertiary"}
                    size="md"
                    style={{ width: "100%" }}
                    onClick={() => handleContratar(plano)}
                  >
                    Contratar {plano.nome}
                  </Button>
                )}
              </div>
            </Tile>
          );
        })}
      </div>

      {/* Modal de Confirmação / Checkout */}
      <Modal
        open={modalCheckoutAberto}
        onRequestClose={() => setModalCheckoutAberto(false)}
        modalHeading={`Contratar Plano ${planoSelecionado?.nome || ""}`}
        primaryButtonText="Confirmar Contratação"
        secondaryButtonText="Voltar"
        onRequestSubmit={() => {
          setModalCheckoutAberto(false);
          alert(
            `Solicitação de upgrade para o plano ${planoSelecionado?.nome} registrada! O faturamento será processado via Asaas.`,
          );
        }}
      >
        <div style={{ padding: "1rem 0" }}>
          <p style={{ marginBottom: "1rem", color: "var(--cds-text-primary)" }}>
            Você está contratando o plano <strong>{planoSelecionado?.nome}</strong> por{" "}
            <strong>{planoSelecionado?.preco}/mês</strong>.
          </p>
          <p style={{ fontSize: "0.875rem", color: "var(--cds-text-secondary)" }}>
            A fatura de cobrança será emitida para o CNPJ cadastrado com opção de Pix ou Cartão de
            Crédito corporativo. Seus limites de CNPJ ({planoSelecionado?.maxCnpjs}) e colaboradores (
            {planoSelecionado?.maxUsers}) serão aplicados imediatamente.
          </p>
        </div>
      </Modal>
    </div>
  );
}

