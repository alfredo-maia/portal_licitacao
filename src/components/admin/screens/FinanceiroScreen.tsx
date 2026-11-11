"use client";

import React, { useMemo, useState } from "react";
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
import { Add, CheckmarkOutline, Currency, Renew, Time } from "@carbon/icons-react";
import { ASAAS_PLAN_PRICES_BRL } from "@/server/schemas/asaas.schema";
import type { SuperAdminTenantItem } from "@/server/schemas/superadmin.schema";
import {
  AdminTable,
  FeedbackBar,
  KpiGrid,
  KpiTile,
  PageHeader,
  StatusFinanceiroTag,
  adminFetch,
  fmtBRL,
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
  { id: "GRACE_PERIOD", label: "Carência" },
  { id: "BLOQUEADO", label: "Inadimplentes" },
  { id: "TRIAL", label: "Teste grátis" },
  { id: "CANCELADO", label: "Cancelados" },
];

export function FinanceiroScreen() {
  const { data, loading, erro, recarregar } = useAdminData<FinanceiroPayload>("/api/admin/financeiro");
  const [fb, setFb] = useState<Feedback | null>(null);
  const [filtro, setFiltro] = useState("TODOS");
  const [busca, setBusca] = useState("");

  // Modal de gerenciamento financeiro de um cliente
  const [modalCliente, setModalCliente] = useState<{
    tenant: SuperAdminTenantItem;
    action: "ALTERAR_PLANO" | "ALTERAR_STATUS" | "DAR_BAIXA_MANUAL" | "PRORROGAR_TRIAL" | "APLICAR_CUPOM";
    plano: string;
    billingStatus: string;
    diasExtrasTrial: string;
    cupomCodigo: string;
    observacao: string;
  } | null>(null);

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

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, "");
    return clientes.filter((c) => {
      if (filtro !== "TODOS" && c.billingStatus !== filtro) return false;
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

  const executarAcao = async (payload: Record<string, unknown>, msgOk: string) => {
    const r = await adminFetch<{ error?: string }>("/api/admin/financeiro", {
      method: "POST",
      body: { tipo: "acao", ...payload },
    });
    if (r.ok) {
      setFb({ kind: "success", texto: msgOk });
      await recarregar();
    } else {
      setFb({ kind: "error", texto: r.data?.error || "Erro ao executar ação financeira." });
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
        <KpiTile rotulo="MRR ATIVO" valor={fmtBRL(resumo.mrr)} detalhe={`ARR: ${fmtBRL(resumo.mrr * 12)}`} cor="var(--cds-support-success)" />
        <KpiTile rotulo="RECEITA EM RISCO" valor={fmtBRL(resumo.emRisco)} detalhe="Carência + inadimplentes" cor="var(--cds-support-error)" />
        <KpiTile rotulo="CLIENTES PAGANTES" valor={fmtNum(resumo.pagantes)} />
        <KpiTile rotulo="INADIMPLENTES" valor={fmtNum(resumo.inadimplentes)} />
        <KpiTile rotulo="EM TESTE GRÁTIS" valor={fmtNum(resumo.trials)} />
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
                    onClick={() =>
                      setModalCliente({
                        tenant: c,
                        action: "ALTERAR_PLANO",
                        plano: c.plano,
                        billingStatus: c.billingStatus,
                        diasExtrasTrial: "14",
                        cupomCodigo: c.cupomCodigo || "",
                        observacao: "",
                      })
                    }
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
        modalHeading={
          modalCliente
            ? `Faturamento da conta — ${modalCliente.tenant.nomeFantasia || modalCliente.tenant.razaoSocial}`
            : ""
        }
        primaryButtonText="Aplicar alteração"
        secondaryButtonText="Cancelar"
        onRequestClose={() => setModalCliente(null)}
        onRequestSubmit={async () => {
          if (!modalCliente) return;
          const ok = await executarAcao(
            {
              tenantId: modalCliente.tenant.id,
              action: modalCliente.action,
              plano: modalCliente.plano,
              billingStatus: modalCliente.billingStatus,
              diasExtrasTrial: Number(modalCliente.diasExtrasTrial) || 7,
              cupomCodigo: modalCliente.cupomCodigo || undefined,
              observacao: modalCliente.observacao || undefined,
            },
            "Operação financeira aplicada.",
          );
          if (ok) setModalCliente(null);
        }}
      >
        {modalCliente ? (
          <div style={{ display: "grid", gap: "1rem" }}>
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

            <Tile style={{ backgroundColor: "var(--cds-layer-02)", padding: "0.85rem 1rem" }}>
              <div style={{ fontSize: "0.8rem", fontWeight: 600, marginBottom: "0.4rem" }}>
                Ações rápidas (aplicadas a todos os CNPJs da conta)
              </div>
              <p style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)", marginBottom: "0.75rem" }}>
                Registrar Pagamento Manual (Dar Baixa +30 dias): ativa a conta imediatamente, marca o status como Pagante e renova o vencimento por +30 dias (útil para pagamentos recebidos via PIX/TED fora do gateway automático).
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
                    );
                    if (ok) setModalCliente(null);
                  }}
                >
                  +14d Trial
                </Button>
                <Button
                  size="sm"
                  kind="primary"
                  renderIcon={CheckmarkOutline}
                  onClick={async () => {
                    const ok = await executarAcao(
                      { tenantId: modalCliente.tenant.id, action: "DAR_BAIXA_MANUAL" },
                      `Baixa manual aplicada (+30d) para ${modalCliente.tenant.razaoSocial}.`,
                    );
                    if (ok) setModalCliente(null);
                  }}
                >
                  Dar Baixa (+30d)
                </Button>
              </div>
            </Tile>

            <Select
              id="fin-acao"
              labelText="Ação detalhada de assinatura"
              value={modalCliente.action}
              onChange={(e) => setModalCliente({ ...modalCliente, action: e.target.value as typeof modalCliente.action })}
            >
              <SelectItem value="ALTERAR_PLANO" text="Trocar Plano (Básico / Pro / Enterprise)" />
              <SelectItem value="ALTERAR_STATUS" text="Alterar Status Financeiro manualmente" />
              <SelectItem value="DAR_BAIXA_MANUAL" text="Dar baixa manual (+30 dias)" />
              <SelectItem value="PRORROGAR_TRIAL" text="Prorrogar Trial grátis (valor customizado)" />
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
              <TextInput
                id="fin-dias"
                labelText="Dias extras de Trial"
                type="number"
                value={modalCliente.diasExtrasTrial}
                onChange={(e) => setModalCliente({ ...modalCliente, diasExtrasTrial: e.target.value })}
              />
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
              labelText="Observação / Comprovante"
              value={modalCliente.observacao}
              onChange={(e) => setModalCliente({ ...modalCliente, observacao: e.target.value })}
            />
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

