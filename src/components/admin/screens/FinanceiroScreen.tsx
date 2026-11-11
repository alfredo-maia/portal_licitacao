"use client";

import React, { useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Button,
  Checkbox,
  ContentSwitcher,
  Modal,
  Search,
  Select,
  SelectItem,
  Switch,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Tag,
  TextInput,
  Tile,
} from "@carbon/react";
import { Add, CloudUpload, Currency, Document, Renew, Time, TrashCan } from "@carbon/icons-react";
import { ASAAS_PLAN_PRICES_BRL } from "@/server/schemas/asaas.schema";
import type {
  SuperAdminTenantItem,
  TenantInvoicePaymentMethod,
  TenantInvoiceRecord,
} from "@/server/schemas/superadmin.schema";
import {
  AdminTable,
  FeedbackBar,
  KpiGrid,
  KpiTile,
  PageHeader,
  StatusFinanceiroTag,
  adminFetch,
  fmtBRL,
  fmtData,
  fmtDia,
  fmtNum,
  useAdminData,
  type Feedback,
} from "../admin-ui";

interface CupomItem {
  id: string;
  codigo: string;
  descricao: string | null;
  descontoPercentual: number;
  diasExtrasTrial: number;
  affiliateId: string | null;
  maxUsos: number | null;
  usosAtuais: number;
  ativo: boolean;
  expiraEm: string | null;
}

interface FinanceiroPayload {
  clientes: SuperAdminTenantItem[];
  cupons: CupomItem[];
}

const FILTROS_STATUS = [
  { id: "TODOS", label: "Todos" },
  { id: "ATIVO", label: "Pagantes" },
  { id: "EM_RISCO", label: "Em risco" },
  { id: "GRACE_PERIOD", label: "Carência" },
  { id: "BLOQUEADO", label: "Inadimplentes" },
  { id: "TRIAL", label: "Teste grátis" },
  { id: "CANCELADO", label: "Cancelados" },
];

const ALLOWED_RECEIPT_MIMES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/pdf",
]);

function resolverMimeComprovante(file: File): string {
  const raw = file.type.trim().toLowerCase();
  if (raw === "image/jpg") return "image/jpeg";
  if (raw) return raw;
  const name = file.name.toLowerCase();
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".pdf")) return "application/pdf";
  return "";
}

const ACAO_FATURA_LABELS: Record<string, string> = {
  DAR_BAIXA_MANUAL: "Dar Baixa (+30d)",
  PRORROGAR_TRIAL: "Prorrogar Trial",
  ALTERAR_PLANO: "Alterar Plano",
  ALTERAR_STATUS: "Alterar Status",
  APLICAR_CUPOM: "Aplicar Cupom",
};

const METODO_PAGAMENTO_LABELS: Record<string, string> = {
  PIX: "PIX",
  BOLETO: "Boleto Bancário",
  CARTAO: "Cartão de Crédito",
};

export function FinanceiroScreen() {
  const { data, loading, erro, recarregar } = useAdminData<FinanceiroPayload>("/api/admin/financeiro");
  const [fb, setFb] = useState<Feedback | null>(null);
  const [modalFb, setModalFb] = useState<Feedback | null>(null);
  const [filtro, setFiltro] = useState("TODOS");
  const [busca, setBusca] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // Modal de gerenciamento financeiro de um cliente
  const [modalCliente, setModalCliente] = useState<{
    tenant: SuperAdminTenantItem;
    action: "ALTERAR_PLANO" | "ALTERAR_STATUS" | "DAR_BAIXA_MANUAL" | "PRORROGAR_TRIAL" | "APLICAR_CUPOM";
    plano: string;
    billingStatus: string;
    diasExtrasTrial: string;
    cupomCodigo: string;
    observacao: string;
    metodoPagamento: TenantInvoicePaymentMethod;
    valorPago: string;
    comprovanteDataUrl: string | null;
    comprovanteNome: string | null;
    comprovanteMimeType: "image/png" | "image/jpeg" | "image/webp" | "application/pdf" | null;
  } | null>(null);

  const [faturasHistorico, setFaturasHistorico] = useState<TenantInvoiceRecord[]>([]);
  const [faturasLoading, setFaturasLoading] = useState(false);
  const [faturaSelecionada, setFaturaSelecionada] = useState<TenantInvoiceRecord | null>(null);

  // Modal de cupom promocional
  const [modalCupom, setModalCupom] = useState<{
    id?: string;
    codigo: string;
    descricao: string;
    descontoPercentual: string;
    diasExtrasTrial: string;
    maxUsos: string;
    ativo: boolean;
  } | null>(null);

  const clientes = data?.clientes || [];
  const cupons = data?.cupons || [];

  const resumo = useMemo(() => {
    let mrr = 0;
    let emRisco = 0;
    let pagantes = 0;
    let inadimplentes = 0;
    let trials = 0;
    for (const c of clientes) {
      const fallbackPreco =
        ASAAS_PLAN_PRICES_BRL[c.plano as keyof typeof ASAAS_PLAN_PRICES_BRL] ??
        ASAAS_PLAN_PRICES_BRL.PRO;
      const val = c.valorMensalidade ?? fallbackPreco;
      if (c.billingStatus === "ATIVO") {
        pagantes++;
        mrr += val;
      } else if (c.billingStatus === "GRACE_PERIOD") {
        mrr += val;
        emRisco += val;
      } else if (c.billingStatus === "BLOQUEADO") {
        inadimplentes++;
        emRisco += val;
      } else if (c.billingStatus === "TRIAL") {
        trials++;
      }
    }
    return { mrr, emRisco, pagantes, inadimplentes, trials };
  }, [clientes]);

  const toggleKpiFiltro = (target: string) => {
    setFiltro((prev) => (prev === target ? "TODOS" : target));
  };

  const abrirFaturamentoModal = async (c: SuperAdminTenantItem) => {
    const fallbackPreco =
      ASAAS_PLAN_PRICES_BRL[c.plano as keyof typeof ASAAS_PLAN_PRICES_BRL] ??
      ASAAS_PLAN_PRICES_BRL.PRO;
    setModalFb(null);
    setModalCliente({
      tenant: c,
      action: "ALTERAR_PLANO",
      plano: c.plano,
      billingStatus: c.billingStatus,
      diasExtrasTrial: "14",
      cupomCodigo: c.cupomCodigo || "",
      observacao: "",
      metodoPagamento: "PIX",
      valorPago: String(c.valorMensalidade ?? fallbackPreco),
      comprovanteDataUrl: null,
      comprovanteNome: null,
      comprovanteMimeType: null,
    });
    setFaturasHistorico([]);
    setFaturaSelecionada(null);
    setFaturasLoading(true);
    try {
      const r = await adminFetch<{ faturas?: TenantInvoiceRecord[] }>(
        `/api/admin/financeiro?faturasTenantId=${encodeURIComponent(c.id)}`,
      );
      if (r.ok && Array.isArray(r.data?.faturas)) {
        setFaturasHistorico(r.data.faturas);
      }
    } finally {
      setFaturasLoading(false);
    }
  };

  const carregarComprovante = (file: File | null | undefined) => {
    if (!file) return;
    const normalizedMime = resolverMimeComprovante(file);
    if (!ALLOWED_RECEIPT_MIMES.has(normalizedMime)) {
      setModalFb({
        kind: "error",
        texto: "Formato inválido para comprovante. Envie PNG, JPG, WEBP ou PDF.",
      });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setModalFb({
        kind: "error",
        texto: "O comprovante excede o limite de 5 MB.",
      });
      return;
    }
    setModalFb(null);
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : null;
      if (!result) return;
      setModalCliente((prev) =>
        prev
          ? {
              ...prev,
              comprovanteDataUrl: result,
              comprovanteNome: file.name,
              comprovanteMimeType: normalizedMime as
                | "image/png"
                | "image/jpeg"
                | "image/webp"
                | "application/pdf",
            }
          : prev,
      );
    };
    reader.readAsDataURL(file);
  };

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, "");
    return clientes.filter((c) => {
      if (filtro === "EM_RISCO") {
        if (c.billingStatus !== "GRACE_PERIOD" && c.billingStatus !== "BLOQUEADO") return false;
      } else if (filtro !== "TODOS" && c.billingStatus !== filtro) {
        return false;
      }
      if (!q) return true;
      const matchPrincipal =
        c.razaoSocial.toLowerCase().includes(q) ||
        (c.nomeFantasia || "").toLowerCase().includes(q) ||
        (c.titularEmail || "").toLowerCase().includes(q) ||
        (c.titularNome || "").toLowerCase().includes(q) ||
        c.cnpj.includes(q) ||
        (qDigits.length >= 4 && c.cnpj.replace(/\D/g, "").includes(qDigits));
      const matchSub = c.cnpjsVinculados?.some(
        (sub) =>
          sub.razaoSocial.toLowerCase().includes(q) ||
          (sub.nomeFantasia || "").toLowerCase().includes(q) ||
          sub.cnpj.includes(q) ||
          (qDigits.length >= 4 && sub.cnpj.replace(/\D/g, "").includes(qDigits)),
      );
      return matchPrincipal || Boolean(matchSub);
    });
  }, [clientes, filtro, busca]);

  const executarAcao = async (
    payload: Record<string, unknown>,
    msgOk: string,
    opts?: { insideModal?: boolean },
  ) => {
    const r = await adminFetch<{ error?: string }>("/api/admin/financeiro", {
      method: "POST",
      body: { tipo: "acao", ...payload },
    });
    if (r.ok) {
      setModalFb(null);
      setFb({ kind: "success", texto: msgOk });
      await recarregar();
    } else {
      const msgErro = r.data?.error || "Erro ao executar ação financeira.";
      if (opts?.insideModal) {
        setModalFb({ kind: "error", texto: msgErro });
      } else {
        setFb({ kind: "error", texto: msgErro });
      }
    }
    return r.ok;
  };

  const salvarCupom = async () => {
    if (!modalCupom) return;
    const r = await adminFetch<{ error?: string }>("/api/admin/financeiro", {
      method: "POST",
      body: {
        tipo: "cupom",
        id: modalCupom.id || undefined,
        codigo: modalCupom.codigo,
        descricao: modalCupom.descricao || null,
        descontoPercentual: Number(modalCupom.descontoPercentual) || 0,
        diasExtrasTrial: Number(modalCupom.diasExtrasTrial) || 0,
        maxUsos: modalCupom.maxUsos ? Number(modalCupom.maxUsos) : null,
        ativo: modalCupom.ativo,
      },
    });
    if (r.ok) {
      setFb({ kind: "success", texto: `Cupom ${modalCupom.codigo.toUpperCase()} salvo.` });
      setModalCupom(null);
      await recarregar();
    } else {
      setFb({ kind: "error", texto: r.data?.error || "Erro ao salvar cupom." });
    }
  };

  return (
    <div>
      <PageHeader
        titulo="Acompanhamento Financeiro & Planos"
        descricao="Controle de clientes pagantes, em carência, inadimplentes e em teste grátis, além de planos, baixas manuais e cupons promocionais."
        acoes={
          <Button kind="tertiary" renderIcon={Renew} onClick={() => void recarregar()} disabled={loading}>
            Atualizar
          </Button>
        }
      />

      <FeedbackBar feedback={fb} onClose={() => setFb(null)} />
      {erro ? <p style={{ color: "var(--cds-support-error)" }}>{erro}</p> : null}

      <KpiGrid>
        <button
          type="button"
          onClick={() => toggleKpiFiltro("ATIVO")}
          aria-pressed={filtro === "ATIVO"}
          style={{
            width: "100%",
            height: "100%",
            padding: 0,
            textAlign: "left",
            background: "transparent",
            border: filtro === "ATIVO" ? "2px solid var(--cds-border-interactive)" : "2px solid transparent",
            cursor: "pointer",
          }}
        >
          <KpiTile rotulo="MRR ATIVO" valor={fmtBRL(resumo.mrr)} detalhe={`ARR: ${fmtBRL(resumo.mrr * 12)}`} cor="var(--cds-support-success)" />
        </button>
        <button
          type="button"
          onClick={() => toggleKpiFiltro("EM_RISCO")}
          aria-pressed={filtro === "EM_RISCO"}
          style={{
            width: "100%",
            height: "100%",
            padding: 0,
            textAlign: "left",
            background: "transparent",
            border: filtro === "EM_RISCO" ? "2px solid var(--cds-border-interactive)" : "2px solid transparent",
            cursor: "pointer",
          }}
        >
          <KpiTile rotulo="RECEITA EM RISCO" valor={fmtBRL(resumo.emRisco)} detalhe="Carência + inadimplentes" cor="var(--cds-support-error)" />
        </button>
        <button
          type="button"
          onClick={() => toggleKpiFiltro("ATIVO")}
          aria-pressed={filtro === "ATIVO"}
          style={{
            width: "100%",
            height: "100%",
            padding: 0,
            textAlign: "left",
            background: "transparent",
            border: filtro === "ATIVO" ? "2px solid var(--cds-border-interactive)" : "2px solid transparent",
            cursor: "pointer",
          }}
        >
          <KpiTile rotulo="CLIENTES PAGANTES" valor={fmtNum(resumo.pagantes)} detalhe="Clique para filtrar" />
        </button>
        <button
          type="button"
          onClick={() => toggleKpiFiltro("BLOQUEADO")}
          aria-pressed={filtro === "BLOQUEADO"}
          style={{
            width: "100%",
            height: "100%",
            padding: 0,
            textAlign: "left",
            background: "transparent",
            border: filtro === "BLOQUEADO" ? "2px solid var(--cds-border-interactive)" : "2px solid transparent",
            cursor: "pointer",
          }}
        >
          <KpiTile rotulo="INADIMPLENTES" valor={fmtNum(resumo.inadimplentes)} detalhe="Clique para filtrar" />
        </button>
        <button
          type="button"
          onClick={() => toggleKpiFiltro("TRIAL")}
          aria-pressed={filtro === "TRIAL"}
          style={{
            width: "100%",
            height: "100%",
            padding: 0,
            textAlign: "left",
            background: "transparent",
            border: filtro === "TRIAL" ? "2px solid var(--cds-border-interactive)" : "2px solid transparent",
            cursor: "pointer",
          }}
        >
          <KpiTile rotulo="EM TESTE GRÁTIS" valor={fmtNum(resumo.trials)} detalhe="Clique para filtrar" />
        </button>
      </KpiGrid>

      <Tabs>
        <TabList aria-label="Visões financeiras" contained>
          <Tab>Carteira de Clientes ({clientes.length})</Tab>
          <Tab>Cupons Promocionais ({cupons.length})</Tab>
        </TabList>
        <TabPanels>
          <TabPanel>
            <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", margin: "1rem 0", alignItems: "center" }}>
              <div style={{ minWidth: "20rem", flex: 1 }}>
                <Search
                  size="md"
                  labelText="Buscar cliente"
                  placeholder="Razão social, e-mail ou CNPJ"
                  value={busca}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setBusca(e.target.value)}
                  onClear={() => setBusca("")}
                />
              </div>
              <ContentSwitcher
                size="md"
                selectedIndex={Math.max(0, FILTROS_STATUS.findIndex((f) => f.id === filtro))}
                onChange={(e: { name?: string | number }) => setFiltro(String(e.name))}
              >
                {FILTROS_STATUS.map((f) => (
                  <Switch key={f.id} name={f.id} text={f.label} />
                ))}
              </ContentSwitcher>
            </div>

            <AdminTable
              titulo={`${filtrados.length} conta(s)`}
              pageSize={10}
              resetPageKey={`${filtro}|${busca}`}
              colunas={[
                { key: "cliente", header: "Cliente / E-mail" },
                { key: "qtdCnpjs", header: "Qtd de CNPJ" },
                { key: "plano", header: "Plano" },
                { key: "status", header: "Status Financeiro" },
                { key: "vencimento", header: "Vencimento / Trial" },
                { key: "cupom", header: "Cupom" },
                { key: "faturamento", header: "Faturamento" },
              ]}
              vazio={loading ? "Carregando..." : "Nenhum registro financeiro para este filtro."}
              linhas={filtrados.map((c) => ({
                id: c.id,
                cliente: (
                  <div>
                    <Link href={`/admin/clientes/${c.id}`} style={{ fontWeight: 600 }}>
                      {c.nomeFantasia || c.razaoSocial}
                    </Link>
                    <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)" }}>
                      {c.cnpj} • {c.titularEmail || "—"}
                    </div>
                  </div>
                ),
                qtdCnpjs: (
                  <Tag type="cyan" size="sm">
                    {c.qtdCnpjs ?? 1} CNPJ(s)
                  </Tag>
                ),
                plano: (
                  <div>
                    <Tag type="blue">{c.plano}</Tag>
                    <div style={{ fontSize: "0.72rem", color: "var(--cds-text-secondary)", marginTop: "0.15rem" }}>
                      {fmtBRL(c.valorMensalidade)}/mês
                    </div>
                  </div>
                ),
                status: (
                  <div>
                    <StatusFinanceiroTag status={c.billingStatus} />
                    {c.billingStatus === "TRIAL" ? (
                      <span style={{ marginLeft: "0.4rem", fontSize: "0.75rem" }}>({c.diasRestantesTrial}d)</span>
                    ) : null}
                    {c.diasAtraso > 0 ? (
                      <span style={{ marginLeft: "0.4rem", fontSize: "0.75rem", color: "var(--cds-support-error)" }}>
                        ({c.diasAtraso}d atraso)
                      </span>
                    ) : null}
                  </div>
                ),
                vencimento: c.billingStatus === "TRIAL" ? fmtDia(c.trialFim) : fmtDia(c.vencimentoAssinatura),
                cupom: c.cupomCodigo ? <Tag type="teal">{c.cupomCodigo}</Tag> : "—",
                faturamento: (
                  <Button
                    size="sm"
                    kind="tertiary"
                    renderIcon={Currency}
                    onClick={() => void abrirFaturamentoModal(c)}
                  >
                    Acessar Faturamento do cliente
                  </Button>
                ),
              }))}
            />
          </TabPanel>

          <TabPanel>
            <div style={{ margin: "1rem 0" }}>
              <Button
                renderIcon={Add}
                onClick={() =>
                  setModalCupom({
                    codigo: "",
                    descricao: "",
                    descontoPercentual: "20",
                    diasExtrasTrial: "7",
                    maxUsos: "",
                    ativo: true,
                  })
                }
              >
                Novo cupom promocional
              </Button>
            </div>
            <AdminTable
              titulo="Cupons cadastrados"
              colunas={[
                { key: "codigo", header: "Código" },
                { key: "descricao", header: "Descrição" },
                { key: "beneficios", header: "Benefício" },
                { key: "usos", header: "Usos" },
                { key: "status", header: "Status" },
                { key: "acoes", header: "" },
              ]}
              linhas={cupons.map((cp) => ({
                id: cp.id,
                codigo: <Tag type="teal">{cp.codigo}</Tag>,
                descricao: cp.descricao || "—",
                beneficios: `${cp.descontoPercentual}% OFF • +${cp.diasExtrasTrial} dias trial`,
                usos: `${cp.usosAtuais}${cp.maxUsos ? ` / ${cp.maxUsos}` : ""}`,
                status: <Tag type={cp.ativo ? "green" : "gray"}>{cp.ativo ? "Ativo" : "Inativo"}</Tag>,
                acoes: (
                  <Button
                    size="sm"
                    kind="ghost"
                    onClick={() =>
                      setModalCupom({
                        id: cp.id,
                        codigo: cp.codigo,
                        descricao: cp.descricao || "",
                        descontoPercentual: String(cp.descontoPercentual),
                        diasExtrasTrial: String(cp.diasExtrasTrial),
                        maxUsos: cp.maxUsos ? String(cp.maxUsos) : "",
                        ativo: cp.ativo,
                      })
                    }
                  >
                    Editar
                  </Button>
                ),
              }))}
            />
          </TabPanel>
        </TabPanels>
      </Tabs>

      <Modal
        open={modalCliente !== null}
        size="lg"
        modalHeading={
          modalCliente
            ? `Faturamento da conta — ${modalCliente.tenant.nomeFantasia || modalCliente.tenant.razaoSocial}`
            : ""
        }
        primaryButtonText="Aplicar alteração"
        secondaryButtonText="Cancelar"
        onRequestClose={() => {
          setModalFb(null);
          setModalCliente(null);
        }}
        onRequestSubmit={async () => {
          if (!modalCliente) return;
          setModalFb(null);
          const payload: Record<string, unknown> = {
            tenantId: modalCliente.tenant.id,
            action: modalCliente.action,
            observacao: modalCliente.observacao || undefined,
          };
          if (modalCliente.action === "ALTERAR_PLANO") {
            payload.plano = modalCliente.plano;
          } else if (modalCliente.action === "ALTERAR_STATUS") {
            payload.billingStatus = modalCliente.billingStatus;
          } else if (modalCliente.action === "PRORROGAR_TRIAL") {
            payload.diasExtrasTrial = Number(modalCliente.diasExtrasTrial) || 7;
          } else if (modalCliente.action === "APLICAR_CUPOM") {
            payload.cupomCodigo = modalCliente.cupomCodigo || undefined;
          } else if (modalCliente.action === "DAR_BAIXA_MANUAL") {
            payload.metodoPagamento = modalCliente.metodoPagamento;
            const rawValor = modalCliente.valorPago.trim();
            if (rawValor === "") {
              payload.valorPago = null;
            } else {
              const parsedValor = Number(rawValor.replace(",", "."));
              if (!Number.isFinite(parsedValor) || parsedValor < 0) {
                setModalFb({
                  kind: "error",
                  texto: "Informe um valor pago numérico válido (maior ou igual a zero).",
                });
                return;
              }
              payload.valorPago = parsedValor;
            }
            payload.comprovanteDataUrl = modalCliente.comprovanteDataUrl;
            payload.comprovanteNome = modalCliente.comprovanteNome;
            payload.comprovanteMimeType = modalCliente.comprovanteMimeType;
          }
          const ok = await executarAcao(payload, "Operação financeira aplicada.", {
            insideModal: true,
          });
          if (ok) setModalCliente(null);
        }}
      >
        {modalCliente ? (
          <div style={{ display: "grid", gap: "1rem" }}>
            <FeedbackBar feedback={modalFb} onClose={() => setModalFb(null)} />
            <Tile style={{ backgroundColor: "var(--cds-layer-02)", padding: "0.85rem 1rem" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "0.75rem" }}>
                <div>
                  <div style={{ fontSize: "0.7rem", color: "var(--cds-text-secondary)" }}>CLIENTE / E-MAIL</div>
                  <div style={{ fontWeight: 600, fontSize: "0.85rem" }}>{modalCliente.tenant.titularNome || modalCliente.tenant.razaoSocial}</div>
                  <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)" }}>{modalCliente.tenant.titularEmail || modalCliente.tenant.cnpj}</div>
                </div>
                <div>
                  <div style={{ fontSize: "0.7rem", color: "var(--cds-text-secondary)" }}>CONTA & PLANO</div>
                  <div style={{ fontWeight: 600, fontSize: "0.85rem" }}>
                    {modalCliente.tenant.plano} • {fmtBRL(modalCliente.tenant.valorMensalidade)}
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)" }}>
                    {modalCliente.tenant.qtdCnpjs ?? 1} CNPJ(s) vinculado(s)
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "0.7rem", color: "var(--cds-text-secondary)" }}>STATUS & VENCIMENTO</div>
                  <div>
                    <StatusFinanceiroTag status={modalCliente.tenant.billingStatus} />
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)", marginTop: "0.15rem" }}>
                    {modalCliente.tenant.billingStatus === "TRIAL"
                      ? `Trial até ${fmtDia(modalCliente.tenant.trialFim)}`
                      : `Vence em ${fmtDia(modalCliente.tenant.vencimentoAssinatura)}`}
                  </div>
                </div>
              </div>
            </Tile>

            {modalCliente.tenant.billingStatus === "TRIAL" ? (
              <Tile style={{ backgroundColor: "var(--cds-layer-02)", padding: "0.85rem 1rem" }}>
                <div style={{ fontSize: "0.8rem", fontWeight: 600, marginBottom: "0.4rem" }}>
                  Ações rápidas (aplicadas a todos os CNPJs em Trial desta conta)
                </div>
                <p style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)", marginBottom: "0.75rem" }}>
                  Estenda rapidamente o período de avaliação gratuita ou selecione &ldquo;Dar baixa manual (+30 dias)&rdquo; abaixo para anexar o comprovante de pagamento.
                </p>
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  <Button
                    size="sm"
                    kind="tertiary"
                    renderIcon={Time}
                    onClick={async () => {
                      const ok = await executarAcao(
                        { tenantId: modalCliente.tenant.id, action: "PRORROGAR_TRIAL", diasExtrasTrial: 7 },
                        `Trial estendido +7 dias para ${modalCliente.tenant.razaoSocial}.`,
                        { insideModal: true },
                      );
                      if (ok) setModalCliente(null);
                    }}
                  >
                    +7d Trial
                  </Button>
                  <Button
                    size="sm"
                    kind="tertiary"
                    renderIcon={Time}
                    onClick={async () => {
                      const ok = await executarAcao(
                        { tenantId: modalCliente.tenant.id, action: "PRORROGAR_TRIAL", diasExtrasTrial: 14 },
                        `Trial estendido +14 dias para ${modalCliente.tenant.razaoSocial}.`,
                        { insideModal: true },
                      );
                      if (ok) setModalCliente(null);
                    }}
                  >
                    +14d Trial
                  </Button>
                </div>
              </Tile>
            ) : null}

            <Select
              id="fin-acao"
              labelText="Ação detalhada de assinatura"
              value={modalCliente.action}
              onChange={(e) => setModalCliente({ ...modalCliente, action: e.target.value as typeof modalCliente.action })}
            >
              <SelectItem value="ALTERAR_PLANO" text="Trocar Plano (Básico / Pro / Enterprise)" />
              <SelectItem value="ALTERAR_STATUS" text="Alterar Status Financeiro manualmente" />
              <SelectItem value="DAR_BAIXA_MANUAL" text="Dar baixa manual (+30 dias)" />
              <SelectItem value="PRORROGAR_TRIAL" text="Prorrogar Trial grátis (7, 14 ou 21 dias)" />
              <SelectItem value="APLICAR_CUPOM" text="Aplicar Cupom promocional" />
            </Select>
            {modalCliente.action === "ALTERAR_PLANO" ? (
              <Select id="fin-plano" labelText="Novo plano" value={modalCliente.plano} onChange={(e) => setModalCliente({ ...modalCliente, plano: e.target.value })}>
                <SelectItem value="BASICO" text={`BASICO (${fmtBRL(ASAAS_PLAN_PRICES_BRL.BASICO)}/mês)`} />
                <SelectItem value="PRO" text={`PRO (${fmtBRL(ASAAS_PLAN_PRICES_BRL.PRO)}/mês)`} />
                <SelectItem value="ENTERPRISE" text={`ENTERPRISE (${fmtBRL(ASAAS_PLAN_PRICES_BRL.ENTERPRISE)}/mês)`} />
              </Select>
            ) : null}
            {modalCliente.action === "ALTERAR_STATUS" ? (
              <Select id="fin-status" labelText="Novo status" value={modalCliente.billingStatus} onChange={(e) => setModalCliente({ ...modalCliente, billingStatus: e.target.value })}>
                {["ATIVO", "TRIAL", "GRACE_PERIOD", "BLOQUEADO", "CANCELADO"].map((s) => (
                  <SelectItem key={s} value={s} text={s} />
                ))}
              </Select>
            ) : null}
            {modalCliente.action === "PRORROGAR_TRIAL" ? (
              <Select
                id="fin-dias"
                labelText="Dias extras de Trial"
                value={modalCliente.diasExtrasTrial}
                onChange={(e) => setModalCliente({ ...modalCliente, diasExtrasTrial: e.target.value })}
              >
                <SelectItem value="7" text="7 dias" />
                <SelectItem value="14" text="14 dias" />
                <SelectItem value="21" text="21 dias (Máximo)" />
              </Select>
            ) : null}
            {modalCliente.action === "DAR_BAIXA_MANUAL" ? (
              <div style={{ display: "grid", gap: "0.75rem", padding: "0.85rem", border: "1px solid var(--cds-border-subtle-01)", backgroundColor: "var(--cds-layer-02)" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                  <Select
                    id="fin-metodo"
                    labelText="Forma de pagamento"
                    value={modalCliente.metodoPagamento}
                    onChange={(e) =>
                      setModalCliente({
                        ...modalCliente,
                        metodoPagamento: e.target.value as TenantInvoicePaymentMethod,
                      })
                    }
                  >
                    <SelectItem value="PIX" text="PIX" />
                    <SelectItem value="BOLETO" text="Boleto" />
                    <SelectItem value="CARTAO" text="Cartão de Crédito" />
                  </Select>
                  <TextInput
                    id="fin-valor"
                    labelText="Valor pago (R$)"
                    type="number"
                    min={0}
                    step="0.01"
                    value={modalCliente.valorPago}
                    onChange={(e) => setModalCliente({ ...modalCliente, valorPago: e.target.value })}
                  />
                </div>

                <div>
                  <div style={{ fontSize: "0.75rem", fontWeight: 600, marginBottom: "0.35rem", color: "var(--cds-text-secondary)" }}>
                    Comprovante de pagamento (Foto ou PDF — arraste ou selecione)
                  </div>
                  <div
                    data-testid="dropzone-comprovante"
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragOver(true);
                    }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragOver(false);
                      carregarComprovante(e.dataTransfer.files?.[0]);
                    }}
                    onClick={() => fileInputRef.current?.click()}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        fileInputRef.current?.click();
                      }
                    }}
                    style={{
                      padding: "1rem",
                      border: dragOver
                        ? "2px dashed var(--cds-border-interactive)"
                        : "2px dashed var(--cds-border-strong-01)",
                      backgroundColor: dragOver ? "var(--cds-layer-selected-01)" : "var(--cds-layer-01)",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "0.75rem",
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <CloudUpload size={20} />
                      <span style={{ fontSize: "0.8rem" }}>
                        {modalCliente.comprovanteNome
                          ? `Anexado: ${modalCliente.comprovanteNome}`
                          : "Arraste aqui uma foto (PNG/JPG/WEBP) ou PDF do comprovante, ou clique para escolher"}
                      </span>
                    </div>
                    {modalCliente.comprovanteNome ? (
                      <Button
                        size="sm"
                        kind="danger--ghost"
                        renderIcon={TrashCan}
                        onClick={(e: React.MouseEvent) => {
                          e.stopPropagation();
                          setModalCliente((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  comprovanteDataUrl: null,
                                  comprovanteNome: null,
                                  comprovanteMimeType: null,
                                }
                              : prev,
                          );
                        }}
                      >
                        Remover
                      </Button>
                    ) : null}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,application/pdf"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      carregarComprovante(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                </div>
              </div>
            ) : null}
            {modalCliente.action === "APLICAR_CUPOM" ? (
              <TextInput
                id="fin-cupom"
                labelText="Código do cupom"
                value={modalCliente.cupomCodigo}
                onChange={(e) => setModalCliente({ ...modalCliente, cupomCodigo: e.target.value.toUpperCase() })}
              />
            ) : null}
            <TextInput
              id="fin-obs"
              labelText="Observação"
              value={modalCliente.observacao}
              onChange={(e) => setModalCliente({ ...modalCliente, observacao: e.target.value })}
            />

            <div style={{ marginTop: "0.5rem" }}>
              <AdminTable
                titulo="Histórico de faturas e pagamentos registrados para esta conta"
                pageSize={5}
                resetPageKey={modalCliente.tenant.id}
                vazio={faturasLoading ? "Carregando faturas..." : "Nenhuma fatura registrada para esta conta."}
                colunas={[
                  { key: "data", header: "Data" },
                  { key: "operacao", header: "Ação / Observação" },
                  { key: "pagamento", header: "Pagamento" },
                  { key: "comprovante", header: "Comprovante" },
                  { key: "acoes", header: "Detalhes" },
                ]}
                linhas={faturasHistorico.map((f) => ({
                  id: f.id,
                  data: fmtData(f.criadoEm),
                  operacao: (
                    <div>
                      <strong>{ACAO_FATURA_LABELS[f.acao] || f.acao}</strong>
                      <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)" }}>
                        {f.observacao || "—"}
                      </div>
                    </div>
                  ),
                  pagamento: (
                    <div>
                      {f.metodoPagamento ? (
                        <Tag size="sm" type="teal">{METODO_PAGAMENTO_LABELS[f.metodoPagamento] || f.metodoPagamento}</Tag>
                      ) : (
                        "—"
                      )}
                      {typeof f.valorPago === "number" ? (
                        <div style={{ fontSize: "0.75rem", marginTop: "0.15rem" }}>{fmtBRL(f.valorPago)}</div>
                      ) : null}
                    </div>
                  ),
                  comprovante: f.comprovanteDataUrl ? (
                    <Tag size="sm" type="green">Anexado</Tag>
                  ) : (
                    <span style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)" }}>—</span>
                  ),
                  acoes: (
                    <Button
                      size="sm"
                      kind="ghost"
                      renderIcon={Document}
                      onClick={() => setFaturaSelecionada(f)}
                    >
                      Ver detalhes
                    </Button>
                  ),
                }))}
              />
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={faturaSelecionada !== null}
        passiveModal
        size="md"
        modalHeading={
          faturaSelecionada
            ? `Detalhes da fatura — ${ACAO_FATURA_LABELS[faturaSelecionada.acao] || faturaSelecionada.acao}`
            : ""
        }
        onRequestClose={() => setFaturaSelecionada(null)}
      >
        {faturaSelecionada ? (
          <div style={{ display: "grid", gap: "0.75rem" }}>
            <div>
              <strong>Empresa:</strong> {faturaSelecionada.empresaNome}
            </div>
            <div>
              <strong>Data/Hora:</strong> {fmtData(faturaSelecionada.criadoEm)}
            </div>
            <div>
              <strong>Operador responsável:</strong> {faturaSelecionada.operadorNome || "SuperAdmin"}
            </div>
            <div>
              <strong>Plano & Status:</strong> {faturaSelecionada.plano} ({faturaSelecionada.statusAnterior} → {faturaSelecionada.statusNovo})
            </div>
            <div>
              <strong>Forma de pagamento:</strong>{" "}
              {faturaSelecionada.metodoPagamento
                ? METODO_PAGAMENTO_LABELS[faturaSelecionada.metodoPagamento] || faturaSelecionada.metodoPagamento
                : "Não aplicável"}
              {typeof faturaSelecionada.valorPago === "number"
                ? ` • ${fmtBRL(faturaSelecionada.valorPago)}`
                : ""}
            </div>
            <div>
              <strong>Observação:</strong> {faturaSelecionada.observacao || "—"}
            </div>
            {faturaSelecionada.comprovanteDataUrl ? (
              <div style={{ borderTop: "1px solid var(--cds-border-subtle-01)", paddingTop: "0.75rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                  <strong>Comprovante ({faturaSelecionada.comprovanteNome || "anexo"})</strong>
                  <a
                    href={faturaSelecionada.comprovanteDataUrl}
                    download={faturaSelecionada.comprovanteNome || "comprovante"}
                  >
                    Baixar comprovante
                  </a>
                </div>
                {faturaSelecionada.comprovanteMimeType === "application/pdf" ||
                faturaSelecionada.comprovanteDataUrl.startsWith("data:application/pdf") ? (
                  <object
                    data={faturaSelecionada.comprovanteDataUrl}
                    type="application/pdf"
                    width="100%"
                    height="360"
                  >
                    <p>Pré-visualização indisponível. Use &ldquo;Baixar comprovante&rdquo; acima.</p>
                  </object>
                ) : (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={faturaSelecionada.comprovanteDataUrl}
                    alt={faturaSelecionada.comprovanteNome || "Comprovante"}
                    style={{ maxWidth: "100%", maxHeight: "360px", objectFit: "contain", border: "1px solid var(--cds-border-subtle-01)" }}
                  />
                )}
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>

      <Modal
        open={modalCupom !== null}
        modalHeading={modalCupom?.id ? "Editar cupom" : "Novo cupom promocional"}
        primaryButtonText="Salvar cupom"
        secondaryButtonText="Cancelar"
        onRequestClose={() => setModalCupom(null)}
        onRequestSubmit={() => void salvarCupom()}
      >
        {modalCupom ? (
          <div style={{ display: "grid", gap: "1rem" }}>
            <TextInput id="cp-cod" labelText="Código (ex.: BLACK25)" value={modalCupom.codigo} onChange={(e) => setModalCupom({ ...modalCupom, codigo: e.target.value.toUpperCase() })} />
            <TextInput id="cp-desc" labelText="Descrição" value={modalCupom.descricao} onChange={(e) => setModalCupom({ ...modalCupom, descricao: e.target.value })} />
            <TextInput id="cp-pct" labelText="Desconto (%)" type="number" value={modalCupom.descontoPercentual} onChange={(e) => setModalCupom({ ...modalCupom, descontoPercentual: e.target.value })} />
            <TextInput id="cp-dias" labelText="Dias extras no Trial" type="number" value={modalCupom.diasExtrasTrial} onChange={(e) => setModalCupom({ ...modalCupom, diasExtrasTrial: e.target.value })} />
            <TextInput id="cp-max" labelText="Limite máximo de usos (vazio = ilimitado)" type="number" value={modalCupom.maxUsos} onChange={(e) => setModalCupom({ ...modalCupom, maxUsos: e.target.value })} />
            <Checkbox id="cp-ativo" labelText="Cupom ativo" checked={modalCupom.ativo} onChange={(_, { checked }) => setModalCupom({ ...modalCupom, ativo: checked })} />
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

