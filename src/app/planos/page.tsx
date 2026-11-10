"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Button,
  InlineLoading,
  InlineNotification,
  Modal,
  RadioButton,
  RadioButtonGroup,
  Tag,
  Tile,
} from "@carbon/react";
import {
  Checkmark,
  Copy,
  Launch,
  Receipt,
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
  id: "BASICO" | "PRO" | "ENTERPRISE";
  nome: string;
  preco: string;
  frequencia: string;
  descricao: string;
  destaque?: boolean;
  recursos: string[];
  maxCnpjs: number;
  maxUsers: number;
}

type FormaPagamentoAsaas = "PIX" | "BOLETO" | "CREDIT_CARD";

interface CheckoutResultadoUI {
  ok: boolean;
  mock: boolean;
  plano: string;
  valor: number;
  billingType: string;
  subscriptionId: string;
  paymentId?: string | null;
  invoiceUrl?: string | null;
  bankSlipUrl?: string | null;
  pixPayload?: string | null;
  pixQrCodeBase64?: string | null;
  status: string;
}

interface FaturaItemUI {
  id: string;
  value: number;
  status: string;
  dueDate: string;
  billingType: string;
  invoiceUrl?: string | null;
  bankSlipUrl?: string | null;
  description?: string | null;
}

const FATURA_STATUS_MAP: Record<
  string,
  { label: string; color: "green" | "blue" | "red" | "warm-gray" | "cool-gray" }
> = {
  CONFIRMED: { label: "Pago", color: "green" },
  RECEIVED: { label: "Recebido", color: "green" },
  PENDING: { label: "Aguardando", color: "blue" },
  OVERDUE: { label: "Em atraso", color: "red" },
  REFUNDED: { label: "Estornado", color: "cool-gray" },
  DELETED: { label: "Cancelado", color: "cool-gray" },
};

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
      "5 Análises de Viabilidade com IA por mês",
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
      "10 Análises de Viabilidade com IA por mês (com PDF executivo)",
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
      "20 Análises de Viabilidade com IA por mês",
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
  const [, setCarregando] = useState(true);
  const [modalCheckoutAberto, setModalCheckoutAberto] = useState(false);
  const [planoSelecionado, setPlanoSelecionado] = useState<PlanoDefinicao | null>(null);
  const [formaPagamento, setFormaPagamento] = useState<FormaPagamentoAsaas>("PIX");
  const [submittingCheckout, setSubmittingCheckout] = useState(false);
  const [erroCheckout, setErroCheckout] = useState<string | null>(null);
  const [checkoutResultado, setCheckoutResultado] = useState<CheckoutResultadoUI | null>(null);
  const [pixCopiado, setPixCopiado] = useState(false);
  const [faturas, setFaturas] = useState<FaturaItemUI[]>([]);
  const [carregandoFaturas, setCarregandoFaturas] = useState(true);

  const carregarStatus = useCallback(() => {
    fetch("/api/planos/status")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.ok) {
          setStatus(data);
        }
      })
      .catch(() => { })
      .finally(() => setCarregando(false));
  }, []);

  const carregarFaturas = useCallback(() => {
    setCarregandoFaturas(true);
    fetch("/api/faturamento/faturas")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.ok && Array.isArray(data.faturas)) {
          setFaturas(data.faturas);
        }
      })
      .catch(() => {})
      .finally(() => setCarregandoFaturas(false));
  }, []);

  useEffect(() => {
    carregarStatus();
    carregarFaturas();
  }, [carregarStatus, carregarFaturas]);

  const handleContratar = (plano: PlanoDefinicao) => {
    setPlanoSelecionado(plano);
    setErroCheckout(null);
    setModalCheckoutAberto(true);
  };

  const handleConfirmarCheckout = async () => {
    if (!planoSelecionado || submittingCheckout) return;

    setSubmittingCheckout(true);
    setErroCheckout(null);
    setPixCopiado(false);

    try {
      const resp = await fetch("/api/planos/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plano: planoSelecionado.id,
          billingType: formaPagamento,
        }),
      });
      const data = await resp.json().catch(() => ({}));

      if (!resp.ok || !data?.ok) {
        setErroCheckout(
          data?.error || "Não foi possível gerar a cobrança no Asaas. Verifique seu perfil.",
        );
        return;
      }

      setCheckoutResultado(data as CheckoutResultadoUI);
      setModalCheckoutAberto(false);
      carregarStatus();
      carregarFaturas();
    } catch {
      setErroCheckout("Falha de comunicação com o servidor ao iniciar assinatura.");
    } finally {
      setSubmittingCheckout(false);
    }
  };

  const handleCopiarPix = async (codigo: string) => {
    try {
      await navigator.clipboard?.writeText(codigo);
      setPixCopiado(true);
      setTimeout(() => setPixCopiado(false), 3000);
    } catch {
      setPixCopiado(false);
    }
  };

  const planoAtivoId = status?.plano?.toUpperCase() || "PRO";
  const isTrial = !status || status.billingStatus === "TRIAL";
  const maxCnpjsDisplay = isTrial
    ? Math.max(status?.maxCnpjs ?? 2, 2)
    : status?.maxCnpjs ?? 2;
  const maxUsersDisplay = isTrial
    ? Math.max(status?.maxUsers ?? 2, 2)
    : status?.maxUsers ?? 2;
  const diasTrialDisplay =
    status && typeof status.diasRestantesTrial === "number" && status.diasRestantesTrial > 0
      ? status.diasRestantesTrial
      : 14;

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
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem", flexWrap: "wrap" }}>
              <span style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--cds-text-primary)" }}>
                Plano Atual da Empresa:
              </span>
              {isTrial ? (
                <>
                  <Tag type="blue">Teste Grátis</Tag>
                  <Tag type="cyan">
                    {status && status.diasRestantesTrial === 0 && status.inGracePeriod
                      ? "Trial Finalizado"
                      : `Degustação: ${diasTrialDisplay} dia(s) restante(s)`}
                  </Tag>
                </>
              ) : (
                <>
                  <Tag type={planoAtivoId === "PRO" ? "blue" : planoAtivoId === "ENTERPRISE" ? "cyan" : "teal"}>
                    {planoAtivoId}
                  </Tag>
                  {status?.billingStatus === "ATIVO" && <Tag type="green">Assinatura Ativa</Tag>}
                </>
              )}
            </div>
            <p style={{ fontSize: "0.875rem", color: "var(--cds-text-secondary)" }}>
              {status?.razaoSocial ? `${status.razaoSocial} • ` : ""}
              {status?.cnpj ? `CNPJ: ${status.cnpj} • ` : ""}
              Capacidade: até {maxCnpjsDisplay} CNPJ(s) e até {maxUsersDisplay} Colaborador(es).
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

      {/* Resumo do Checkout / Cobrança Gerada */}
      {checkoutResultado && (
        <Tile
          style={{
            marginBottom: "2rem",
            padding: "1.5rem",
            backgroundColor: "var(--cds-layer-01, #f4f4f4)",
            border: "1px solid var(--cds-interactive, #0f62fe)",
            borderLeft: "4px solid var(--cds-support-success, #24a148)",
          }}
        >
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: "1rem",
            }}
          >
            <div style={{ flex: "1 1 360px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem", flexWrap: "wrap" }}>
                <strong style={{ fontSize: "1.05rem", color: "var(--cds-text-primary, #161616)" }}>
                  Cobrança do Plano {checkoutResultado.plano} Gerada
                </strong>
                <Tag type={checkoutResultado.mock ? "warm-gray" : "green"} size="sm">
                  {checkoutResultado.mock ? "Modo Simulado (Sem Chave Asaas)" : "Asaas Ativo"}
                </Tag>
              </div>
              <p style={{ fontSize: "0.875rem", color: "var(--cds-text-secondary, #525252)", marginBottom: "0.75rem" }}>
                Assinatura <code>{checkoutResultado.subscriptionId}</code> •{" "}
                <strong>
                  {checkoutResultado.valor.toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  })}
                  /mês
                </strong>{" "}
                • Forma: <strong>{checkoutResultado.billingType}</strong>
              </p>

              {checkoutResultado.pixPayload && (
                <div
                  style={{
                    marginTop: "0.75rem",
                    padding: "0.75rem",
                    backgroundColor: "var(--cds-layer-02, #ffffff)",
                    border: "1px solid var(--cds-border-subtle, #e0e0e0)",
                  }}
                >
                  <div style={{ fontSize: "0.75rem", fontWeight: 600, marginBottom: "0.35rem", color: "var(--cds-text-secondary)" }}>
                    PIX Copia e Cola
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                    <code
                      style={{
                        fontSize: "0.75rem",
                        wordBreak: "break-all",
                        color: "var(--cds-text-primary)",
                        flex: 1,
                      }}
                    >
                      {checkoutResultado.pixPayload}
                    </code>
                    <Button
                      kind="ghost"
                      size="sm"
                      renderIcon={Copy}
                      onClick={() => handleCopiarPix(checkoutResultado.pixPayload!)}
                    >
                      {pixCopiado ? "Copiado" : "Copiar PIX"}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {checkoutResultado.invoiceUrl && (
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                <Button
                  as="a"
                  href={checkoutResultado.invoiceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  kind="primary"
                  size="sm"
                  renderIcon={Launch}
                >
                  Abrir Fatura / Cobrança
                </Button>
              </div>
            )}
          </div>
        </Tile>
      )}

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
          const isPlanoAtual = !isTrial && plano.id === planoAtivoId;

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

      {/* Histórico de Cobranças & Faturas */}
      <Tile
        style={{
          marginTop: "2.5rem",
          padding: "1.5rem",
          backgroundColor: "var(--cds-layer-01, #f4f4f4)",
          border: "1px solid var(--cds-border-subtle, #e0e0e0)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "1rem",
            gap: "0.75rem",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Receipt size={20} style={{ color: "var(--cds-interactive, #0f62fe)" }} />
            <h2 style={{ fontSize: "1.125rem", fontWeight: 600, color: "var(--cds-text-primary, #161616)" }}>
              Histórico de Cobranças &amp; Faturas
            </h2>
          </div>
          <Button kind="ghost" size="sm" onClick={carregarFaturas}>
            Atualizar Faturas
          </Button>
        </div>

        {carregandoFaturas && faturas.length === 0 ? (
          <InlineLoading description="Consultando cobranças..." />
        ) : faturas.length === 0 ? (
          <p style={{ fontSize: "0.875rem", color: "var(--cds-text-secondary, #525252)" }}>
            Nenhuma cobrança emitida até o momento. Selecione um plano acima para gerar sua assinatura corporativa via Asaas.
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
              <thead>
                <tr
                  style={{
                    borderBottom: "1px solid var(--cds-border-strong, #8d8d8d)",
                    textAlign: "left",
                    color: "var(--cds-text-secondary, #525252)",
                  }}
                >
                  <th style={{ padding: "0.65rem 0.5rem" }}>Cobrança</th>
                  <th style={{ padding: "0.65rem 0.5rem" }}>Vencimento</th>
                  <th style={{ padding: "0.65rem 0.5rem" }}>Meio</th>
                  <th style={{ padding: "0.65rem 0.5rem" }}>Valor</th>
                  <th style={{ padding: "0.65rem 0.5rem" }}>Status</th>
                  <th style={{ padding: "0.65rem 0.5rem", textAlign: "right" }}>Ação</th>
                </tr>
              </thead>
              <tbody>
                {faturas.map((fatura) => {
                  const st = FATURA_STATUS_MAP[fatura.status] || {
                    label: fatura.status,
                    color: "cool-gray" as const,
                  };
                  return (
                    <tr
                      key={fatura.id}
                      style={{ borderBottom: "1px solid var(--cds-border-subtle, #e0e0e0)" }}
                    >
                      <td style={{ padding: "0.75rem 0.5rem", fontWeight: 500 }}>
                        <code>{fatura.id}</code>
                      </td>
                      <td style={{ padding: "0.75rem 0.5rem" }}>{fatura.dueDate || "—"}</td>
                      <td style={{ padding: "0.75rem 0.5rem" }}>{fatura.billingType}</td>
                      <td style={{ padding: "0.75rem 0.5rem", fontWeight: 600 }}>
                        {Number(fatura.value || 0).toLocaleString("pt-BR", {
                          style: "currency",
                          currency: "BRL",
                        })}
                      </td>
                      <td style={{ padding: "0.75rem 0.5rem" }}>
                        <Tag type={st.color} size="sm">
                          {st.label}
                        </Tag>
                      </td>
                      <td style={{ padding: "0.75rem 0.5rem", textAlign: "right" }}>
                        {fatura.invoiceUrl ? (
                          <a
                            href={fatura.invoiceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              color: "var(--cds-link-primary, #0f62fe)",
                              textDecoration: "none",
                              fontWeight: 500,
                            }}
                          >
                            Abrir Fatura
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Tile>

      {/* Modal de Confirmação / Checkout Real Asaas */}
      <Modal
        open={modalCheckoutAberto}
        onRequestClose={() => {
          if (!submittingCheckout) {
            setModalCheckoutAberto(false);
          }
        }}
        modalHeading={`Contratar Plano ${planoSelecionado?.nome || ""}`}
        primaryButtonText={submittingCheckout ? "Processando..." : "Confirmar Contratação"}
        secondaryButtonText="Voltar"
        primaryButtonDisabled={submittingCheckout}
        onRequestSubmit={handleConfirmarCheckout}
      >
        <div style={{ padding: "1rem 0", display: "flex", flexDirection: "column", gap: "1rem" }}>
          <p style={{ color: "var(--cds-text-primary)" }}>
            Você está contratando o plano <strong>{planoSelecionado?.nome}</strong> por{" "}
            <strong>{planoSelecionado?.preco}/mês</strong>.
          </p>

          <RadioButtonGroup
            legendText="Forma de pagamento"
            name="forma-pagamento-asaas"
            orientation="vertical"
            valueSelected={formaPagamento}
            onChange={(value) =>
              setFormaPagamento(((value as FormaPagamentoAsaas) || "PIX") as FormaPagamentoAsaas)
            }
          >
            <RadioButton
              id="billing-pix"
              labelText="PIX — Liberação imediata com QR Code"
              value="PIX"
            />
            <RadioButton
              id="billing-boleto"
              labelText="Boleto Bancário — Vencimento em 1 dia útil"
              value="BOLETO"
            />
            <RadioButton
              id="billing-credit-card"
              labelText="Cartão de Crédito Corporativo — Renovação mensal"
              value="CREDIT_CARD"
            />
          </RadioButtonGroup>

          <p style={{ fontSize: "0.875rem", color: "var(--cds-text-secondary)" }}>
            A cobrança mensal será vinculada ao CNPJ cadastrado. Seus limites de CNPJ (
            {planoSelecionado?.maxCnpjs}) e colaboradores ({planoSelecionado?.maxUsers}) serão
            atualizados automaticamente após confirmação do pagamento.
          </p>

          {submittingCheckout && (
            <InlineLoading description="Gerando assinatura recorrente no Asaas..." />
          )}

          {erroCheckout && (
            <InlineNotification
              kind="error"
              title="Erro ao iniciar checkout:"
              subtitle={erroCheckout}
              hideCloseButton
            />
          )}
        </div>
      </Modal>
    </div>
  );
}

