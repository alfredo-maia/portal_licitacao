"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  Button,
  Checkbox,
  Modal,
  Select,
  SelectItem,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Tag,
  TextArea,
  TextInput,
  Tile,
} from "@carbon/react";
import { ArrowLeft, Add, Edit } from "@carbon/icons-react";
import { maskCnpj, maskCpf, maskPhone, sanitizeEmail } from "@/lib/masks";
import { CATALOGO_MACRO_SEGMENTOS, type MacroSegmento } from "@/server/schemas/segmentos.schema";
import {
  AdminTable,
  EngajamentoTag,
  FeedbackBar,
  KpiGrid,
  KpiTile,
  PageHeader,
  StatusFinanceiroTag,
  UsoSaudeTag,
  adminFetch,
  fmtBRL,
  fmtData,
  fmtDia,
  fmtNum,
  fmtTempoRelativo,
  useAdminData,
  type Feedback,
} from "../admin-ui";

/* Contrato mínimo do dossiê retornado por GET /api/admin/clientes/[id] */
interface Marco {
  chave: string;
  rotulo: string;
}
interface Dossie {
  tenantId: string;
  tenant: {
    razaoSocial: string;
    nomeFantasia?: string | null;
    cnpj: string;
    plano: string;
    billingStatus: string;
    ativo?: boolean;
    diasRestantesTrial: number;
    valorMensalidade?: number;
  };
  titular: {
    id: string;
    name: string;
    email: string;
    cpf: string | null;
    telefone: string | null;
    cidade: string | null;
    uf: string | null;
    ativo: boolean;
    sessionVersion: number;
    ultimoLoginEm: string | null;
  } | null;
  onboarding: Record<string, boolean | number | string> & {
    score: number;
    percentual: number;
    statusEngajamento: string;
  };
  empresas: Array<{
    id: string;
    cnpj: string;
    razaoSocial: string;
    nomeFantasia: string | null;
    uf: string | null;
    cidade: string | null;
    plano: string;
    billingStatus: string;
    ativo: boolean;
    segmentos?: string[];
    subsegmentos?: string[];
    ufs?: string[];
    brasilInteiro?: boolean;
  }>;
  usuarios: Array<{
    id: string;
    name: string;
    email: string;
    role: string;
    ativo: boolean;
    tenantRole: string;
    tenants: string[];
    telefone: string | null;
    ultimoLoginEm: string | null;
  }>;
  patrimonioOperacional: {
    licitacoes: Array<{
      id: string;
      tenantId?: string;
      tenantNome: string;
      licitacaoId: string;
      numeroEdital: string;
      orgaoNome: string;
      statusKanban: string;
      valorEstimado: number;
      dataAbertura: string | null;
    }>;
    kanbanPorColuna: Record<string, number>;
    documentos: {
      total: number;
      vencidos: number;
      bytes: number;
      lista: Array<{
        id: string;
        tenantId?: string;
        nome: string;
        categoria: string;
        dataVencimento: string | null;
        vencido: boolean;
      }>;
    };
    portais: number;
    impugnacoes: number;
    precosSalvos: number;
  };
  porEmpresa?: Record<
    string,
    {
      onboarding?: Record<string, boolean | number | string> & {
        score: number;
        percentual: number;
        statusEngajamento: string;
      };
      patrimonioOperacional: {
        licitacoes: Array<{
          id: string;
          tenantId?: string;
          tenantNome: string;
          licitacaoId: string;
          numeroEdital: string;
          orgaoNome: string;
          statusKanban: string;
          valorEstimado: number;
          dataAbertura: string | null;
        }>;
        kanbanPorColuna: Record<string, number>;
        documentos: {
          total: number;
          vencidos: number;
          bytes: number;
          lista: Array<{
            id: string;
            tenantId?: string;
            nome: string;
            categoria: string;
            dataVencimento: string | null;
            vencido: boolean;
          }>;
        };
        portais: number;
        impugnacoes: number;
        precosSalvos: number;
      };
    }
  >;
  cotas: {
    maxCnpjs: number;
    maxUsers: number;
    storageBaseMb: number;
    storageExtraQuotaMb: number;
    storageTotalMb: number;
    storageUsadoMb: number;
    aiExtraQuotaMes: number;
    aiUsadasMes: number;
  };
  cotasPorEmpresa?: Record<
    string,
    {
      maxCnpjs: number;
      maxUsers: number;
      storageBaseMb: number;
      storageExtraQuotaMb: number;
      storageTotalMb: number;
      storageUsadoMb: number;
      aiExtraQuotaMes: number;
      aiUsadasMes: number;
    }
  >;
  contaGlobal?: {
    valorMensalidade: number;
    diasRestantesTrial: number;
    storageUsadoMb: number;
    storageTotalMb: number;
    aiUsadasMes: number;
    aiExtraQuotaMes: number;
    totalLicitacoes: number;
    totalDocumentos: number;
    totalPortais: number;
  };
  financeiro?: {
    plano?: string;
    billingStatus?: string;
    valorMensalidade?: number;
    trialFim?: string | null;
    vencimentoAssinatura?: string | null;
    ultimoPagamentoEm?: string | null;
    cupomCodigo?: string | null;
    affiliateId?: string | null;
  };
  notasInternasAdm: string | null;
  usoGlobal?: {
    status: string;
    rotulo: string;
    diasAtivos7d: number;
    diasAtivos30d: number;
    totalAcessos30d: number;
    totalAcoesValor30d: number;
    ultimoAcessoEm: string | null;
    ultimaRota: string | null;
  };
  usoPorEmpresa?: Record<
    string,
    {
      tenantId: string;
      status: string;
      rotulo: string;
      diasAtivos7d: number;
      diasAtivos30d: number;
      totalAcessos30d: number;
      totalAcoesValor30d: number;
      ultimoAcessoEm: string | null;
      ultimaRota: string | null;
      serie14Dias: Array<{
        dataBrt: string;
        acessos: number;
        acoesValor: number;
      }>;
      modulosTop: Array<{
        modulo: string;
        rotulo: string;
        acessos: number;
      }>;
      acoesTop: Array<{
        acao: string;
        rotulo: string;
        total: number;
      }>;
    }
  >;
  usoPorUsuario?: Array<{
    userId: string;
    nome: string;
    email: string;
    diasAtivos7d: number;
    diasAtivos30d: number;
    totalAcessos30d: number;
    totalAcoesValor30d: number;
    ultimoAcessoEm: string | null;
  }>;
  disputas: Array<{
    id: string;
    cnpj: string;
    requerenteNome: string;
    requerenteEmail: string;
    motivo: string;
    status: string;
  }>;
}

const MARCOS: Marco[] = [
  { chave: "contaCriada", rotulo: "Conta criada" },
  { chave: "cnpjCadastrado", rotulo: "CNPJ cadastrado" },
  { chave: "filtrosConfigurados", rotulo: "Filtros configurados" },
  { chave: "empresaPreenchida", rotulo: "Dados da empresa" },
  { chave: "documentoCofreEnviado", rotulo: "Documento no Cofre" },
  { chave: "licitacaoNoKanban", rotulo: "Licitação no Kanban" },
  { chave: "iaOuCalculadoraUsada", rotulo: "IA / Calculadora usada" },
];

const STATUS_KANBAN = [
  "PENDENTE",
  "ACEITA",
  "ANALISE_TECNICA",
  "ANALISE_FINANCEIRA",
  "REVISAO_PROPOSTA",
  "ENVIADA",
  "EM_DISPUTA",
  "AGUARDANDO_RESULTADO",
  "CONTEMPLADA",
  "RECUSADA",
];

export function Cliente360Screen({ tenantId }: { tenantId: string }) {
  const { data, loading, erro, recarregar } = useAdminData<Dossie>(`/api/admin/clientes/${tenantId}`);
  const [fb, setFb] = useState<Feedback | null>(null);
  const [selectedTenantId, setSelectedTenantId] = useState<string>(tenantId);

  useEffect(() => {
    setSelectedTenantId(data?.tenantId || tenantId);
  }, [tenantId, data?.tenantId]);

  const empresasLista = data?.empresas || [];
  const activeTenantId = empresasLista.some((e) => e.id === selectedTenantId)
    ? selectedTenantId
    : data?.tenantId || tenantId;
  const selectedEmpresa = empresasLista.find((e) => e.id === activeTenantId) || null;

  const patch = async (tipo: string, corpo: Record<string, unknown>, sucesso: string) => {
    const r = await adminFetch<{ error?: string; mensagem?: string }>(`/api/admin/clientes/${tenantId}`, {
      method: "PATCH",
      body: { tipo, ...corpo },
    });
    if (r.ok) {
      setFb({ kind: "success", texto: sucesso });
      await recarregar();
    } else {
      setFb({ kind: "error", texto: r.data?.error || "Falha na operação." });
    }
    return r.ok;
  };

  if (loading && !data) return <p>Carregando dossiê do cliente...</p>;
  if (erro || !data) {
    return (
      <div>
        <p style={{ color: "var(--cds-support-error)" }}>{erro || "Cliente não encontrado."}</p>
        <Link href="/admin/clientes">Voltar para clientes</Link>
      </div>
    );
  }

  const { tenant, titular, onboarding, cotas, patrimonioOperacional: pat } = data;
  const activeOnboarding =
    data.porEmpresa?.[activeTenantId]?.onboarding ??
    onboarding ?? {
      score: 0,
      percentual: 0,
      statusEngajamento: "NOVO",
    };
  const tituloEmpresa = selectedEmpresa?.nomeFantasia || selectedEmpresa?.razaoSocial || tenant.nomeFantasia || tenant.razaoSocial;
  const descEmpresa = `${selectedEmpresa?.razaoSocial || tenant.razaoSocial} • ${selectedEmpresa?.cnpj || tenant.cnpj}`;
  const planoAtivo = selectedEmpresa?.plano || tenant.plano;
  const statusAtivo = selectedEmpresa?.billingStatus || tenant.billingStatus;
  const ativoEmpresa = selectedEmpresa ? selectedEmpresa.ativo : tenant.ativo !== false;

  const resumoGlobal = data.contaGlobal ?? {
    valorMensalidade: tenant.valorMensalidade ?? 0,
    diasRestantesTrial: tenant.diasRestantesTrial ?? 0,
    storageUsadoMb: cotas.storageUsadoMb,
    storageTotalMb: cotas.storageTotalMb,
    aiUsadasMes: cotas.aiUsadasMes,
    aiExtraQuotaMes: cotas.aiExtraQuotaMes,
    totalLicitacoes: pat.licitacoes.length,
    totalDocumentos: pat.documentos.total,
    totalPortais: pat.portais,
  };

  return (
    <div>
      <div style={{ marginBottom: "0.75rem" }}>
        <Link href="/admin/clientes" style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
          <ArrowLeft size={16} /> Clientes
        </Link>
      </div>

      <PageHeader
        titulo={tituloEmpresa}
        descricao={descEmpresa}
        acoes={
          <>
            <div
              data-testid="cliente-ultimo-acesso-global"
              title={
                data.usoGlobal?.ultimoAcessoEm
                  ? `Último acesso global da conta: ${fmtData(data.usoGlobal.ultimoAcessoEm)}`
                  : "Nenhum acesso global registrado nos últimos 30 dias"
              }
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.35rem",
                padding: "0.25rem 0.65rem",
                borderRadius: "4px",
                backgroundColor: "var(--cds-layer-01)",
                border: "1px solid var(--cds-border-subtle)",
                fontSize: "0.78rem",
                color: "var(--cds-text-secondary)",
              }}
            >
              <span>Último acesso (global):</span>
              <strong style={{ color: "var(--cds-text-primary)" }}>
                {fmtTempoRelativo(data.usoGlobal?.ultimoAcessoEm)}
              </strong>
            </div>
            <StatusFinanceiroTag status={statusAtivo} />
            <Tag type="blue">{planoAtivo}</Tag>
            {!ativoEmpresa ? <Tag type="red">Conta inativa</Tag> : null}
          </>
        }
      />

      <FeedbackBar feedback={fb} onClose={() => setFb(null)} />

      {/* Seletor de CNPJs da Conta Principal no topo */}
      {empresasLista.length > 0 && (
        <div data-testid="cnpj-selector" style={{ marginBottom: "1.25rem" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "0.75rem",
              marginBottom: "0.5rem",
            }}
          >
            <span style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--cds-text-secondary)" }}>
              CNPJs da Conta ({empresasLista.length}) — Selecionado: {tituloEmpresa}
            </span>
            {empresasLista.length > 4 ? (
              <div style={{ minWidth: "18rem" }}>
                <Select
                  id="c360-cnpj-select"
                  labelText="Selecionar CNPJ"
                  hideLabel
                  size="sm"
                  value={activeTenantId}
                  onChange={(e) => setSelectedTenantId(e.target.value)}
                >
                  {empresasLista.map((emp) => (
                    <SelectItem
                      key={emp.id}
                      value={emp.id}
                      text={`${emp.nomeFantasia || emp.razaoSocial} — ${emp.cnpj}`}
                    />
                  ))}
                </Select>
              </div>
            ) : null}
          </div>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            {empresasLista.map((emp) => {
              const isSelected = emp.id === activeTenantId;
              return (
                <button
                  key={emp.id}
                  type="button"
                  data-testid={`cnpj-card-${emp.id}`}
                  onClick={() => setSelectedTenantId(emp.id)}
                  style={{
                    textAlign: "left",
                    padding: "0.55rem 0.85rem",
                    borderRadius: "4px",
                    cursor: "pointer",
                    backgroundColor: isSelected ? "var(--cds-layer-selected-01)" : "var(--cds-layer-01)",
                    border: isSelected
                      ? "2px solid var(--cds-border-interactive)"
                      : "1px solid var(--cds-border-subtle-01)",
                    color: "var(--cds-text-primary)",
                    minWidth: "13rem",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
                    <strong style={{ fontSize: "0.85rem" }}>{emp.nomeFantasia || emp.razaoSocial}</strong>
                    {isSelected ? <Tag type="cyan" size="sm">Ativo</Tag> : null}
                  </div>
                  <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)", marginTop: "0.15rem" }}>
                    {emp.cnpj}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Termômetro de configuração do Trial (7 marcos) — Individual por CNPJ selecionado */}
      <Tile style={{ marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
          <h3 style={{ fontSize: "1rem", fontWeight: 600 }}>
            Termômetro de configuração — {activeOnboarding.score}/7 ({activeOnboarding.percentual}%)
          </h3>
          <EngajamentoTag status={activeOnboarding.statusEngajamento} />
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.75rem" }}>
          {MARCOS.map((m) => (
            <Tag key={m.chave} type={activeOnboarding[m.chave] ? "green" : "gray"}>
              {activeOnboarding[m.chave] ? "✓" : "○"} {m.rotulo}
            </Tag>
          ))}
        </div>
      </Tile>

      <Tabs>
        <TabList aria-label="Seções do cliente" contained>
          <Tab>1 · Conta principal</Tab>
          <Tab>2 · Empresas (CNPJs)</Tab>
          <Tab>3 · Usuários</Tab>
          <Tab>4 · Segmentos & Regiões (UFs)</Tab>
          <Tab>5 · Licitações & Cofre</Tab>
          <Tab>6 · Recursos & Cotas</Tab>
          <Tab>7 · Uso & Engajamento</Tab>
        </TabList>
        <TabPanels>
          <TabPanel>
            <ContaPrincipal dossie={data} patch={patch} />
          </TabPanel>
          <TabPanel>
            <Empresas dossie={data} activeTenantId={activeTenantId} patch={patch} />
          </TabPanel>
          <TabPanel>
            <Usuarios dossie={data} activeTenantId={activeTenantId} patch={patch} />
          </TabPanel>
          <TabPanel>
            <SegmentosUfs dossie={data} activeTenantId={activeTenantId} />
          </TabPanel>
          <TabPanel>
            <Patrimonio dossie={data} activeTenantId={activeTenantId} patch={patch} />
          </TabPanel>
          <TabPanel>
            <Cotas dossie={data} activeTenantId={activeTenantId} patch={patch} />
          </TabPanel>
          <TabPanel>
            <UsoEngajamento dossie={data} activeTenantId={activeTenantId} />
          </TabPanel>
        </TabPanels>
      </Tabs>

      {Boolean(data.disputas && data.disputas.length > 0) && (
        <div style={{ marginTop: "2rem" }}>
          <AdminTable
            titulo="Disputas de titularidade de CNPJ"
            pageSize={5}
            colunas={[
              { key: "cnpj", header: "CNPJ" },
              { key: "req", header: "Requerente" },
              { key: "motivo", header: "Motivo" },
              { key: "status", header: "Status" },
              { key: "acoes", header: "" },
            ]}
            linhas={(data.disputas || []).map((d) => ({
              id: d.id,
              cnpj: d.cnpj,
              req: `${d.requerenteNome} (${d.requerenteEmail})`,
              motivo: d.motivo,
              status: <Tag type={d.status === "PENDENTE" ? "warm-gray" : "green"}>{d.status}</Tag>,
              acoes:
                d.status === "PENDENTE" ? (
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <Button size="sm" onClick={() => patch("disputa", { disputaId: d.id, status: "APROVADA" }, "Disputa aprovada.")}>
                      Aprovar
                    </Button>
                    <Button size="sm" kind="danger--tertiary" onClick={() => patch("disputa", { disputaId: d.id, status: "REJEITADA" }, "Disputa rejeitada.")}>
                      Rejeitar
                    </Button>
                  </div>
                ) : null,
            }))}
          />
        </div>
      )}

      <Tile
        data-testid="conta-global-resumo"
        style={{
          marginTop: "1.5rem",
          padding: "0.85rem 1.25rem",
          backgroundColor: "var(--cds-layer-01)",
          borderTop: "2px solid var(--cds-border-subtle-01)",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
            gap: "1rem",
            alignItems: "center",
          }}
        >
          <div>
            <div style={{ fontSize: "0.7rem", color: "var(--cds-text-secondary)", letterSpacing: "0.03rem" }}>MENSALIDADE</div>
            <div style={{ fontSize: "1rem", fontWeight: 600 }}>{fmtBRL(resumoGlobal.valorMensalidade)}</div>
            <div style={{ fontSize: "0.72rem", color: "var(--cds-text-secondary)" }}>
              Teste: {resumoGlobal.diasRestantesTrial} dia(s)
            </div>
          </div>
          <div>
            <div style={{ fontSize: "0.7rem", color: "var(--cds-text-secondary)", letterSpacing: "0.03rem" }}>COFRE (R2)</div>
            <div style={{ fontSize: "1rem", fontWeight: 600 }}>{resumoGlobal.storageUsadoMb} MB</div>
            <div style={{ fontSize: "0.72rem", color: "var(--cds-text-secondary)" }}>
              de {resumoGlobal.storageTotalMb} MB
            </div>
          </div>
          <div>
            <div style={{ fontSize: "0.7rem", color: "var(--cds-text-secondary)", letterSpacing: "0.03rem" }}>IA NO MÊS</div>
            <div style={{ fontSize: "1rem", fontWeight: 600 }}>{fmtNum(resumoGlobal.aiUsadasMes)}</div>
            <div style={{ fontSize: "0.72rem", color: "var(--cds-text-secondary)" }}>
              Bônus ADM: +{resumoGlobal.aiExtraQuotaMes}
            </div>
          </div>
          <div>
            <div style={{ fontSize: "0.7rem", color: "var(--cds-text-secondary)", letterSpacing: "0.03rem" }}>PATRIMÔNIO</div>
            <div style={{ fontSize: "1rem", fontWeight: 600 }}>{resumoGlobal.totalLicitacoes} licitações</div>
            <div style={{ fontSize: "0.72rem", color: "var(--cds-text-secondary)" }}>
              {resumoGlobal.totalDocumentos} docs • {resumoGlobal.totalPortais} portais
            </div>
          </div>
        </div>
      </Tile>
      {titular ? null : <p style={{ color: "var(--cds-text-secondary)" }}>Este cliente ainda não possui titular vinculado.</p>}
    </div>
  );
}

type PatchFn = (tipo: string, corpo: Record<string, unknown>, sucesso: string) => Promise<boolean>;

/* ---------------------------- Aba 1 — Conta principal ---------------------------- */
function ContaPrincipal({ dossie, patch }: { dossie: Dossie; patch: PatchFn }) {
  const t = dossie.titular;
  const [form, setForm] = useState({
    name: t?.name || "",
    email: t?.email || "",
    cpf: t?.cpf || "",
    telefone: t?.telefone || "",
    cidade: t?.cidade || "",
    uf: t?.uf || "",
    notas: dossie.notasInternasAdm || "",
  });
  const [confirmar, setConfirmar] = useState<null | "inativar" | "ativar">(null);

  useEffect(() => {
    setForm({
      name: t?.name || "",
      email: t?.email || "",
      cpf: t?.cpf || "",
      telefone: t?.telefone || "",
      cidade: t?.cidade || "",
      uf: t?.uf || "",
      notas: dossie.notasInternasAdm || "",
    });
  }, [t?.id, t?.name, t?.email, t?.cpf, t?.telefone, t?.cidade, t?.uf, t?.ativo, t?.sessionVersion, dossie.notasInternasAdm]);

  if (!t) return <Tile>Sem titular vinculado.</Tile>;
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    let val = e.target.value;
    if (k === "cpf") val = maskCpf(val);
    else if (k === "telefone") val = maskPhone(val);
    setForm((f) => ({ ...f, [k]: val }));
  };

  return (
    <div style={{ display: "grid", gap: "1rem", maxWidth: "52rem", paddingTop: "1rem" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "1rem" }}>
        <TextInput id="c-nome" labelText="Nome do titular" value={form.name} onChange={set("name")} />
        <TextInput
          id="c-email"
          labelText="E-mail de acesso"
          value={form.email}
          onChange={set("email")}
          onBlur={() => setForm((f) => ({ ...f, email: sanitizeEmail(f.email) }))}
        />
        <TextInput id="c-cpf" labelText="CPF" value={form.cpf} onChange={set("cpf")} />
        <TextInput id="c-tel" labelText="Telefone / WhatsApp" value={form.telefone} onChange={set("telefone")} />
        <TextInput id="c-cidade" labelText="Cidade" value={form.cidade} onChange={set("cidade")} />
        <TextInput id="c-uf" labelText="UF" maxLength={2} value={form.uf} onChange={(e) => setForm((f) => ({ ...f, uf: e.target.value.toUpperCase() }))} />
      </div>
      <TextArea id="c-notas" labelText="Notas internas (visíveis só para a equipe ADM)" value={form.notas} onChange={set("notas")} rows={3} />
      <p style={{ fontSize: "0.8rem", color: "var(--cds-text-secondary)" }}>
        Último login: {fmtData(t.ultimoLoginEm)} • Versão de sessão: {t.sessionVersion}. Senhas nunca são exibidas ou editáveis.
      </p>
      <div
        data-testid="conta-principal-acoes"
        style={{ display: "flex", gap: "0.5rem", flexWrap: "nowrap", overflowX: "auto", alignItems: "center" }}
      >
        <Button
          renderIcon={Edit}
          style={{ whiteSpace: "nowrap", flexShrink: 0 }}
          onClick={() =>
            patch(
              "conta",
              {
                userId: t.id,
                name: form.name,
                email: sanitizeEmail(form.email),
                cpf: form.cpf || null,
                telefone: form.telefone || null,
                cidade: form.cidade || null,
                uf: form.uf || null,
                notasInternasAdm: form.notas || null,
              },
              "Conta principal atualizada.",
            )
          }
        >
          Salvar alterações
        </Button>
        <Button kind="tertiary" style={{ whiteSpace: "nowrap", flexShrink: 0 }} onClick={() => patch("conta", { userId: t.id, dispararResetSenha: true }, "Link de redefinição de senha enviado ao cliente.")}>
          Enviar link de redefinição de senha
        </Button>
        <Button kind="tertiary" style={{ whiteSpace: "nowrap", flexShrink: 0 }} onClick={() => patch("conta", { userId: t.id, forcarLogout: true }, "Sessões do cliente encerradas (logout forçado).")}>
          Forçar logout
        </Button>
        {t.ativo ? (
          <Button kind="danger--tertiary" style={{ whiteSpace: "nowrap", flexShrink: 0 }} onClick={() => setConfirmar("inativar")}>
            Inativar cliente
          </Button>
        ) : (
          <Button kind="primary" style={{ whiteSpace: "nowrap", flexShrink: 0 }} onClick={() => setConfirmar("ativar")}>
            Reativar cliente
          </Button>
        )}
      </div>

      <Modal
        open={confirmar !== null}
        danger={confirmar === "inativar"}
        modalHeading={confirmar === "inativar" ? "Inativar cliente?" : "Reativar cliente?"}
        primaryButtonText="Confirmar"
        secondaryButtonText="Cancelar"
        onRequestClose={() => setConfirmar(null)}
        onRequestSubmit={async () => {
          const ativar = confirmar === "ativar";
          setConfirmar(null);
          await patch("conta", { userId: t.id, ativo: ativar }, ativar ? "Cliente reativado." : "Cliente inativado e sessões encerradas.");
        }}
      >
        <p>
          {confirmar === "inativar"
            ? "A conta e as empresas do titular serão bloqueadas e todas as sessões ativas serão encerradas imediatamente."
            : "A conta e as empresas do titular voltarão a ficar disponíveis."}
        </p>
      </Modal>
    </div>
  );
}

/* ---------------------------- Aba 2 — Empresas ---------------------------- */
function Empresas({
  dossie,
  activeTenantId,
  patch,
}: {
  dossie: Dossie;
  activeTenantId: string;
  patch: PatchFn;
}) {
  const planoConta = dossie.financeiro?.plano || dossie.tenant?.plano || "BASICO";
  const statusConta = dossie.financeiro?.billingStatus || dossie.tenant?.billingStatus || "TRIAL";
  const vazio = {
    id: "",
    cnpj: "",
    razaoSocial: "",
    nomeFantasia: "",
    uf: "",
    cidade: "",
    plano: planoConta,
    billingStatus: statusConta,
    originalPlano: planoConta,
    originalBillingStatus: statusConta,
  };
  const [edit, setEdit] = useState<typeof vazio | null>(null);

  return (
    <div style={{ paddingTop: "1rem" }}>
      <div style={{ marginBottom: "1rem" }}>
        <Button renderIcon={Add} onClick={() => setEdit({ ...vazio })}>
          Nova empresa (CNPJ)
        </Button>
      </div>
      <AdminTable
        titulo={`${dossie.empresas.length} CNPJ(s) do cliente`}
        pageSize={5}
        rowClassName={(id) => (id === activeTenantId ? "pncp-admin-row--active" : undefined)}
        colunas={[
          { key: "emp", header: "Empresa" },
          { key: "loc", header: "Local" },
          { key: "plano", header: "Plano" },
          { key: "status", header: "Status" },
          { key: "acoes", header: "" },
        ]}
        linhas={dossie.empresas.map((e) => ({
          id: e.id,
          emp: (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", flexWrap: "wrap" }}>
                <strong>{e.nomeFantasia || e.razaoSocial}</strong>
                {e.id === activeTenantId ? (
                  <Tag type="cyan" size="sm">
                    Visualizando
                  </Tag>
                ) : null}
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)" }}>{e.cnpj}</div>
            </div>
          ),
          loc: `${e.cidade || "—"}/${e.uf || "—"}`,
          plano: <Tag type="blue">{e.plano}</Tag>,
          status: (
            <>
              <StatusFinanceiroTag status={e.billingStatus} />
              {!e.ativo ? <Tag type="red">Inativa</Tag> : null}
            </>
          ),
          acoes: (
            <Button
              size="sm"
              kind="ghost"
              renderIcon={Edit}
              onClick={() =>
                setEdit({
                  id: e.id,
                  cnpj: e.cnpj,
                  razaoSocial: e.razaoSocial,
                  nomeFantasia: e.nomeFantasia || "",
                  uf: e.uf || "",
                  cidade: e.cidade || "",
                  plano: e.plano,
                  billingStatus: e.billingStatus,
                  originalPlano: e.plano,
                  originalBillingStatus: e.billingStatus,
                })
              }
            >
              Editar
            </Button>
          ),
        }))}
      />

      <Modal
        open={edit !== null}
        modalHeading={edit?.id ? "Editar empresa" : "Nova empresa"}
        primaryButtonText="Salvar"
        secondaryButtonText="Cancelar"
        onRequestClose={() => setEdit(null)}
        onRequestSubmit={async () => {
          if (!edit) return;
          const planoMudou = !edit.id || edit.plano !== edit.originalPlano;
          const statusMudou = !edit.id || edit.billingStatus !== edit.originalBillingStatus;
          const ok = await patch(
            "empresa",
            {
              tenantId: edit.id || undefined,
              ownerUserId: dossie.titular?.id,
              cnpj: edit.cnpj,
              razaoSocial: edit.razaoSocial,
              nomeFantasia: edit.nomeFantasia || null,
              uf: edit.uf || null,
              cidade: edit.cidade || null,
              ...(planoMudou ? { plano: edit.plano } : {}),
              ...(statusMudou ? { billingStatus: edit.billingStatus } : {}),
            },
            "Empresa salva.",
          );
          if (ok) setEdit(null);
        }}
      >
        {edit ? (
          <div style={{ display: "grid", gap: "1rem" }}>
            <TextInput id="e-cnpj" labelText="CNPJ" value={edit.cnpj} onChange={(e) => setEdit({ ...edit, cnpj: maskCnpj(e.target.value) })} />
            <TextInput id="e-razao" labelText="Razão social" value={edit.razaoSocial} onChange={(e) => setEdit({ ...edit, razaoSocial: e.target.value })} />
            <TextInput id="e-fantasia" labelText="Nome fantasia" value={edit.nomeFantasia} onChange={(e) => setEdit({ ...edit, nomeFantasia: e.target.value })} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 5rem", gap: "1rem" }}>
              <TextInput id="e-cidade" labelText="Cidade" value={edit.cidade} onChange={(e) => setEdit({ ...edit, cidade: e.target.value })} />
              <TextInput id="e-uf" labelText="UF" maxLength={2} value={edit.uf} onChange={(e) => setEdit({ ...edit, uf: e.target.value.toUpperCase() })} />
            </div>
            <Select id="e-plano" labelText="Plano" value={edit.plano} onChange={(e) => setEdit({ ...edit, plano: e.target.value })}>
              {["BASICO", "PRO", "ENTERPRISE"].map((p) => (
                <SelectItem key={p} value={p} text={p} />
              ))}
            </Select>
            <Select id="e-status" labelText="Status financeiro" value={edit.billingStatus} onChange={(e) => setEdit({ ...edit, billingStatus: e.target.value })}>
              {["TRIAL", "ATIVO", "GRACE_PERIOD", "BLOQUEADO", "CANCELADO"].map((p) => (
                <SelectItem key={p} value={p} text={p} />
              ))}
            </Select>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

/* ---------------------------- Aba 3 — Usuários ---------------------------- */
function Usuarios({
  dossie,
  activeTenantId,
  patch,
}: {
  dossie: Dossie;
  activeTenantId: string;
  patch: PatchFn;
}) {
  const vazio = {
    userId: "",
    tenantId: activeTenantId,
    name: "",
    email: "",
    role: "ANALISTA_COMERCIAL",
    tenantRole: "MEMBRO",
    ativo: true,
  };
  const [edit, setEdit] = useState<typeof vazio | null>(null);

  return (
    <div style={{ paddingTop: "1rem" }}>
      <div style={{ marginBottom: "1rem" }}>
        <Button renderIcon={Add} onClick={() => setEdit({ ...vazio })}>
          Novo usuário da equipe
        </Button>
      </div>
      <AdminTable
        titulo={`${dossie.usuarios.length} usuário(s) — senhas nunca são exibidas`}
        pageSize={5}
        colunas={[
          { key: "nome", header: "Usuário" },
          { key: "perfil", header: "Perfil" },
          { key: "vinculo", header: "Vínculo" },
          { key: "login", header: "Último login" },
          { key: "status", header: "Status" },
          { key: "acoes", header: "" },
        ]}
        linhas={dossie.usuarios.map((u) => ({
          id: u.id,
          nome: (
            <div>
              <strong>{u.name}</strong>
              <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)" }}>{u.email}</div>
            </div>
          ),
          perfil: <Tag type="blue">{u.role}</Tag>,
          vinculo: `${u.tenantRole} em ${u.tenants.length} CNPJ(s)`,
          login: fmtData(u.ultimoLoginEm),
          status: <Tag type={u.ativo ? "green" : "red"}>{u.ativo ? "Ativo" : "Inativo"}</Tag>,
          acoes: (
            <div style={{ display: "flex", gap: "0.25rem" }}>
              <Button
                size="sm"
                kind="ghost"
                renderIcon={Edit}
                onClick={() =>
                  setEdit({
                    userId: u.id,
                    tenantId: u.tenants[0] || dossie.tenantId,
                    name: u.name,
                    email: u.email,
                    role: u.role,
                    tenantRole: u.tenantRole,
                    ativo: u.ativo,
                  })
                }
              >
                Editar
              </Button>
              <Button size="sm" kind="ghost" onClick={() => patch("conta", { userId: u.id, dispararResetSenha: true }, "Link de redefinição enviado.")}>
                Reset de senha
              </Button>
            </div>
          ),
        }))}
      />

      <Modal
        open={edit !== null}
        modalHeading={edit?.userId ? "Editar usuário" : "Novo usuário"}
        primaryButtonText="Salvar"
        secondaryButtonText="Cancelar"
        onRequestClose={() => setEdit(null)}
        onRequestSubmit={async () => {
          if (!edit) return;
          const ok = await patch(
            "usuario",
            { ...edit, email: sanitizeEmail(edit.email), userId: edit.userId || undefined },
            "Usuário salvo. O link de definição de senha é enviado por e-mail.",
          );
          if (ok) setEdit(null);
        }}
      >
        {edit ? (
          <div style={{ display: "grid", gap: "1rem" }}>
            <TextInput id="u-nome" labelText="Nome" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            <TextInput
              id="u-email"
              labelText="E-mail"
              value={edit.email}
              onChange={(e) => setEdit({ ...edit, email: e.target.value })}
              onBlur={() => setEdit({ ...edit, email: sanitizeEmail(edit.email) })}
            />
            <Select id="u-empresa" labelText="Empresa (CNPJ)" value={edit.tenantId} onChange={(e) => setEdit({ ...edit, tenantId: e.target.value })}>
              {dossie.empresas.map((emp) => (
                <SelectItem key={emp.id} value={emp.id} text={`${emp.nomeFantasia || emp.razaoSocial} — ${emp.cnpj}`} />
              ))}
            </Select>
            <Select id="u-role" labelText="Perfil de acesso" value={edit.role} onChange={(e) => setEdit({ ...edit, role: e.target.value })}>
              {["DIRETORIA", "ANALISTA_COMERCIAL", "OPERADOR"].map((p) => (
                <SelectItem key={p} value={p} text={p} />
              ))}
            </Select>
            <Select id="u-trole" labelText="Papel na empresa" value={edit.tenantRole} onChange={(e) => setEdit({ ...edit, tenantRole: e.target.value })}>
              {["TITULAR", "MEMBRO", "CONSULTOR"].map((p) => (
                <SelectItem key={p} value={p} text={p} />
              ))}
            </Select>
            <Checkbox id="u-ativo" labelText="Usuário ativo" checked={edit.ativo} onChange={(_, { checked }) => setEdit({ ...edit, ativo: checked })} />
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

/* ---------------------------- Aba 4 — Segmentos & Regiões (UFs) ---------------------------- */
function SegmentosUfs({
  dossie,
  activeTenantId,
}: {
  dossie: Dossie;
  activeTenantId: string;
}) {
  const empresas = dossie.empresas || [];
  const emp = empresas.find((e) => e.id === activeTenantId) || empresas[0] || null;

  if (!emp) {
    return (
      <div style={{ paddingTop: "1rem" }}>
        <Tile>Nenhuma empresa vinculada para exibir segmentos e regiões.</Tile>
      </div>
    );
  }

  const ufs = emp.ufs || [];
  const brasilInteiro = emp.brasilInteiro ?? (ufs.length === 0);
  const segmentos = emp.segmentos || [];
  const subsegmentos = emp.subsegmentos || [];

  return (
    <div style={{ display: "grid", gap: "1.25rem", paddingTop: "1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
        <div>
          <h3 style={{ fontSize: "1.125rem", fontWeight: 600 }}>
            Segmentos & Regiões de Atuação — {emp.nomeFantasia || emp.razaoSocial}
          </h3>
          <p style={{ fontSize: "0.875rem", color: "var(--cds-text-secondary)" }}>
            Exibindo as UFs de monitoramento e Segmentos/Subsegmentos cadastrados para o CNPJ selecionado no topo.
            {empresas.length > 1 ? " Alterne o card de CNPJ no topo para visualizar as demais empresas da conta." : ""}
          </p>
        </div>
        <Tag type="blue">{maskCnpj(emp.cnpj)}</Tag>
      </div>

      <Tile
        key={emp.id}
        data-testid={`tile-segmentos-empresa-${emp.id}`}
        style={{
          padding: "1.5rem",
          border: "1px solid var(--cds-border-subtle)",
          backgroundColor: "var(--cds-layer-01)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            flexWrap: "wrap",
            gap: "0.5rem",
            marginBottom: "1rem",
            paddingBottom: "0.75rem",
            borderBottom: "1px solid var(--cds-border-subtle)",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
              <strong style={{ fontSize: "1.05rem" }}>
                {emp.nomeFantasia || emp.razaoSocial}
              </strong>
              <Tag type="green" size="sm">Visualizando</Tag>
              <Tag type="cyan" size="sm">{emp.plano}</Tag>
            </div>
            <div style={{ fontSize: "0.8125rem", color: "var(--cds-text-secondary)", marginTop: "0.25rem" }}>
              {emp.razaoSocial} • CNPJ: {maskCnpj(emp.cnpj)} {emp.cidade && emp.uf ? `• Sede: ${emp.cidade}/${emp.uf}` : ""}
            </div>
          </div>
        </div>

        {/* UFs */}
        <div style={{ marginBottom: "1rem" }}>
          <span
            style={{
              display: "block",
              fontSize: "0.8125rem",
              fontWeight: 600,
              color: "var(--cds-text-secondary)",
              marginBottom: "0.4rem",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}
          >
            Regiões de Atuação (UFs)
          </span>
          {brasilInteiro ? (
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Tag type="teal" size="md">
                Todo o Brasil (27 UFs)
              </Tag>
            </div>
          ) : ufs.length > 0 ? (
            <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
              {ufs.map((uf) => (
                <Tag key={uf} type="blue" size="sm">
                  {uf}
                </Tag>
              ))}
            </div>
          ) : (
            <p style={{ fontSize: "0.85rem", color: "var(--cds-text-secondary)", fontStyle: "italic" }}>
              Nenhuma UF específica configurada.
            </p>
          )}
        </div>

        {/* Segmentos Macro */}
        <div style={{ marginBottom: "1rem" }}>
          <span
            style={{
              display: "block",
              fontSize: "0.8125rem",
              fontWeight: 600,
              color: "var(--cds-text-secondary)",
              marginBottom: "0.4rem",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}
          >
            Segmentos Macro de Atuação
          </span>
          {segmentos.length > 0 ? (
            <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
              {segmentos.map((seg) => {
                const def = CATALOGO_MACRO_SEGMENTOS[seg as MacroSegmento];
                const nomeAmigavel = def?.nome || seg;
                return (
                  <Tag key={seg} type="purple" size="md">
                    {nomeAmigavel}
                  </Tag>
                );
              })}
            </div>
          ) : (
            <p style={{ fontSize: "0.85rem", color: "var(--cds-text-secondary)", fontStyle: "italic" }}>
              Nenhum segmento macro selecionado no momento.
            </p>
          )}
        </div>

        {/* Subsegmentos */}
        <div>
          <span
            style={{
              display: "block",
              fontSize: "0.8125rem",
              fontWeight: 600,
              color: "var(--cds-text-secondary)",
              marginBottom: "0.4rem",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
            }}
          >
            Subsegmentos Especializados ({subsegmentos.length})
          </span>
          {subsegmentos.length > 0 ? (
            <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
              {subsegmentos.map((sub) => {
                let subNome = sub;
                for (const macro of Object.values(CATALOGO_MACRO_SEGMENTOS)) {
                  const found = macro.subcategorias?.find((s) => s.codigo === sub);
                  if (found) {
                    subNome = found.nome;
                    break;
                  }
                }
                return (
                  <Tag key={sub} type="cool-gray" size="sm">
                    {subNome}
                  </Tag>
                );
              })}
            </div>
          ) : (
            <p style={{ fontSize: "0.85rem", color: "var(--cds-text-secondary)", fontStyle: "italic" }}>
              Nenhum subsegmento específico selecionado.
            </p>
          )}
        </div>
      </Tile>
    </div>
  );
}

/* ---------------------------- Aba 5 — Licitações & Cofre ---------------------------- */
function Patrimonio({
  dossie,
  activeTenantId,
  patch,
}: {
  dossie: Dossie;
  activeTenantId: string;
  patch: PatchFn;
}) {
  const patFromMap = dossie.porEmpresa?.[activeTenantId]?.patrimonioOperacional;
  const rawPat: Dossie["patrimonioOperacional"] = patFromMap ?? {
    ...dossie.patrimonioOperacional,
    licitacoes: dossie.patrimonioOperacional.licitacoes.some((l) => l.tenantId)
      ? dossie.patrimonioOperacional.licitacoes.filter((l) => !l.tenantId || l.tenantId === activeTenantId)
      : dossie.patrimonioOperacional.licitacoes,
    documentos: {
      ...dossie.patrimonioOperacional.documentos,
      lista: dossie.patrimonioOperacional.documentos.lista.some((d) => d.tenantId)
        ? dossie.patrimonioOperacional.documentos.lista.filter((d) => !d.tenantId || d.tenantId === activeTenantId)
        : dossie.patrimonioOperacional.documentos.lista,
    },
  };
  const licitacoesSemRecusadas = rawPat.licitacoes.filter((l) => l.statusKanban !== "RECUSADA");
  const kanbanSemRecusadas = Object.fromEntries(
    Object.entries(rawPat.kanbanPorColuna).filter(([col]) => col !== "RECUSADA"),
  );
  const pat: Dossie["patrimonioOperacional"] = {
    ...rawPat,
    licitacoes: licitacoesSemRecusadas,
    kanbanPorColuna: kanbanSemRecusadas,
  };
  const [inj, setInj] = useState({ aberto: false, licitacaoId: "", statusKanban: "PENDENTE", tenantId: activeTenantId });

  useEffect(() => {
    setInj((prev) => ({ ...prev, tenantId: activeTenantId }));
  }, [activeTenantId]);

  return (
    <div style={{ paddingTop: "1rem" }}>
      <KpiGrid>
        <KpiTile rotulo="CARDS NO KANBAN" valor={fmtNum(pat.licitacoes.length)} />
        <KpiTile rotulo="DOCUMENTOS NO COFRE" valor={fmtNum(pat.documentos.total)} detalhe={`${pat.documentos.vencidos} vencido(s)`} cor={pat.documentos.vencidos ? "var(--cds-support-error)" : undefined} />
        <KpiTile rotulo="PORTAIS CADASTRADOS" valor={fmtNum(pat.portais)} />
        <KpiTile rotulo="IMPUGNAÇÕES" valor={fmtNum(pat.impugnacoes)} />
        <KpiTile rotulo="PREÇOS SALVOS" valor={fmtNum(pat.precosSalvos)} />
      </KpiGrid>

      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1rem" }}>
        {Object.entries(pat.kanbanPorColuna).map(([col, n]) => (
          <Tag key={col} type="cool-gray">
            {col.replace(/_/g, " ")}: {n}
          </Tag>
        ))}
      </div>

      <div style={{ marginBottom: "1rem" }}>
        <Button renderIcon={Add} onClick={() => setInj({ ...inj, tenantId: activeTenantId, aberto: true })}>
          Injetar licitação no Kanban deste cliente
        </Button>
      </div>

      <AdminTable
        titulo="Licitações em que o cliente participa"
        pageSize={5}
        resetPageKey={activeTenantId}
        colunas={[
          { key: "edital", header: "Edital / Órgão" },
          { key: "empresa", header: "CNPJ" },
          { key: "status", header: "Coluna do Kanban" },
          { key: "valor", header: "Valor estimado" },
          { key: "abertura", header: "Abertura" },
        ]}
        linhas={pat.licitacoes.map((l) => ({
          id: l.id,
          edital: (
            <div>
              <strong>{l.numeroEdital}</strong>
              <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)" }}>{l.orgaoNome}</div>
            </div>
          ),
          empresa: l.tenantNome,
          status: <Tag type={l.statusKanban === "CONTEMPLADA" ? "green" : "blue"}>{l.statusKanban.replace(/_/g, " ")}</Tag>,
          valor: fmtBRL(l.valorEstimado),
          abertura: fmtDia(l.dataAbertura),
        }))}
      />

      <div style={{ marginTop: "1.5rem" }}>
        <AdminTable
          titulo="Cofre de documentos (R2)"
          pageSize={5}
          resetPageKey={activeTenantId}
          colunas={[
            { key: "nome", header: "Documento" },
            { key: "cat", header: "Categoria" },
            { key: "venc", header: "Validade" },
          ]}
          linhas={pat.documentos.lista.map((d) => ({
            id: d.id,
            nome: d.nome,
            cat: d.categoria,
            venc: d.dataVencimento ? (
              <Tag type={d.vencido ? "red" : "green"}>
                {d.vencido ? "Vencido em " : "Vence em "}
                {fmtDia(d.dataVencimento)}
              </Tag>
            ) : (
              <Tag type="gray">Sem validade</Tag>
            ),
          }))}
        />
      </div>

      <Modal
        open={inj.aberto}
        modalHeading="Injetar licitação no Kanban"
        primaryButtonText="Injetar"
        secondaryButtonText="Cancelar"
        onRequestClose={() => setInj({ ...inj, aberto: false })}
        onRequestSubmit={async () => {
          const ok = await patch(
            "injetar",
            { licitacaoId: inj.licitacaoId, tenantId: inj.tenantId, statusKanban: inj.statusKanban, notas: "Injetada pela equipe ADM" },
            "Licitação injetada no Kanban do cliente.",
          );
          if (ok) setInj({ ...inj, aberto: false, licitacaoId: "" });
        }}
      >
        <div style={{ display: "grid", gap: "1rem" }}>
          <TextInput
            id="i-lic"
            labelText="ID, idPncp ou Link completo do PNCP"
            placeholder="Ex.: https://pncp.gov.br/app/editais/00394460000141/2026/1 ou id interno"
            value={inj.licitacaoId}
            onChange={(e) => setInj({ ...inj, licitacaoId: e.target.value })}
          />
          <Select id="i-empresa" labelText="CNPJ de destino" value={inj.tenantId} onChange={(e) => setInj({ ...inj, tenantId: e.target.value })}>
            {dossie.empresas.map((emp) => (
              <SelectItem key={emp.id} value={emp.id} text={`${emp.nomeFantasia || emp.razaoSocial} — ${emp.cnpj}`} />
            ))}
          </Select>
          <Select id="i-status" labelText="Coluna inicial" value={inj.statusKanban} onChange={(e) => setInj({ ...inj, statusKanban: e.target.value })}>
            {STATUS_KANBAN.map((s) => (
              <SelectItem key={s} value={s} text={s.replace(/_/g, " ")} />
            ))}
          </Select>
        </div>
      </Modal>
    </div>
  );
}

/* ---------------------------- Aba 5 — Recursos & Cotas ---------------------------- */
function Cotas({
  dossie,
  activeTenantId,
  patch,
}: {
  dossie: Dossie;
  activeTenantId: string;
  patch: PatchFn;
}) {
  const c = dossie.cotas;
  const [maxCnpjs, setMaxCnpjs] = useState(String(c.maxCnpjs));
  const [maxUsers, setMaxUsers] = useState(String(c.maxUsers));
  const [bonusIa, setBonusIa] = useState(String(c.aiExtraQuotaMes));
  const [bonusStorageMb, setBonusStorageMb] = useState(String(c.storageExtraQuotaMb));
  const [licReset, setLicReset] = useState("");

  useEffect(() => {
    setMaxCnpjs(String(c.maxCnpjs));
    setMaxUsers(String(c.maxUsers));
    setBonusIa(String(c.aiExtraQuotaMes));
    setBonusStorageMb(String(c.storageExtraQuotaMb));
  }, [activeTenantId, c.maxCnpjs, c.maxUsers, c.aiExtraQuotaMes, c.storageExtraQuotaMb]);

  return (
    <div style={{ paddingTop: "1rem", display: "grid", gap: "1.5rem", maxWidth: "56rem" }}>
      <KpiGrid>
        <KpiTile rotulo="COFRE R2" valor={`${c.storageUsadoMb} / ${c.storageTotalMb} MB`} detalhe={`Base ${c.storageBaseMb} MB + extra ${c.storageExtraQuotaMb} MB (conta unificada)`} />
        <KpiTile rotulo="ANÁLISES DE IA (MÊS)" valor={fmtNum(c.aiUsadasMes)} detalhe={`Bônus concedido: +${c.aiExtraQuotaMes} (todos os CNPJs)`} />
      </KpiGrid>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "1rem" }}>
        <TextInput id="q-cnpjs" labelText="Máximo de CNPJs" type="number" value={maxCnpjs} onChange={(e) => setMaxCnpjs(e.target.value)} />
        <TextInput id="q-users" labelText="Máximo de usuários" type="number" value={maxUsers} onChange={(e) => setMaxUsers(e.target.value)} />
        <TextInput id="q-ia" labelText="Bônus mensal de análises de IA" type="number" min={0} value={bonusIa} onChange={(e) => setBonusIa(e.target.value)} />
        <TextInput id="q-storage" labelText="Bônus de Cofre R2 (MB)" type="number" min={0} value={bonusStorageMb} onChange={(e) => setBonusStorageMb(e.target.value)} />
      </div>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <Button
          onClick={() =>
            patch(
              "cotas",
              {
                tenantId: activeTenantId,
                maxCnpjs: Number(maxCnpjs),
                maxUsers: Number(maxUsers),
                aiExtraQuotaMes: Math.max(0, Number(bonusIa) || 0),
                storageExtraQuotaMb: Math.max(0, Number(bonusStorageMb) || 0),
              },
              "Limites do cliente atualizados.",
            )
          }
        >
          Salvar limites
        </Button>
      </div>

      <Tile>
        <h4 style={{ fontWeight: 600, marginBottom: "0.5rem" }}>Destravar trava de 5 execuções de IA por licitação</h4>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end" }}>
          <TextInput id="q-reset" labelText="ID da licitação" value={licReset} onChange={(e) => setLicReset(e.target.value)} />
          <Button
            kind="secondary"
            disabled={!licReset.trim()}
            onClick={() => patch("cotas", { tenantId: activeTenantId, resetarTravaIaLicitacaoId: licReset.trim() }, "Trava silenciosa de IA zerada para a licitação.")}
          >
            Resetar trava
          </Button>
        </div>
      </Tile>
    </div>
  );
}

/* ---------------------------- Aba 7 — Uso & Engajamento ---------------------------- */
function formatDiaCurtoBrt(dataBrt: string): string {
  const partes = dataBrt.split("-");
  if (partes.length !== 3) return dataBrt;
  return `${partes[2]}/${partes[1]}`;
}

function UsoEngajamento({
  dossie,
  activeTenantId,
}: {
  dossie: Dossie;
  activeTenantId: string;
}) {
  const empresas = dossie.empresas || [];
  const empAtiva = empresas.find((e) => e.id === activeTenantId) || empresas[0] || null;
  const usoAtivo = dossie.usoPorEmpresa?.[activeTenantId] ?? {
    tenantId: activeTenantId,
    status: "SEM_USO",
    rotulo: "Sem uso",
    diasAtivos7d: 0,
    diasAtivos30d: 0,
    totalAcessos30d: 0,
    totalAcoesValor30d: 0,
    ultimoAcessoEm: null,
    ultimaRota: null,
    serie14Dias: [],
    modulosTop: [],
    acoesTop: [],
  };
  const usoGlobal = dossie.usoGlobal ?? {
    status: usoAtivo.status,
    rotulo: usoAtivo.rotulo,
    diasAtivos7d: usoAtivo.diasAtivos7d,
    diasAtivos30d: usoAtivo.diasAtivos30d,
    totalAcessos30d: usoAtivo.totalAcessos30d,
    totalAcoesValor30d: usoAtivo.totalAcoesValor30d,
    ultimoAcessoEm: usoAtivo.ultimoAcessoEm,
    ultimaRota: usoAtivo.ultimaRota,
  };
  const maxAcessosModulo = Math.max(
    1,
    ...usoAtivo.modulosTop.map((m) => m.acessos),
  );
  const usuariosUso = dossie.usoPorUsuario || [];

  return (
    <div
      data-testid="aba-uso-engajamento"
      style={{ paddingTop: "1rem", display: "grid", gap: "1.25rem" }}
    >
      {/* Cabeçalho contextual do CNPJ ativo + resumo global */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: "0.75rem",
        }}
      >
        <div>
          <h3 style={{ fontSize: "1.125rem", fontWeight: 600, margin: 0 }}>
            Uso & Engajamento — {empAtiva?.nomeFantasia || empAtiva?.razaoSocial || dossie.tenant.razaoSocial}
          </h3>
          <p style={{ fontSize: "0.85rem", color: "var(--cds-text-secondary)", marginTop: "0.25rem" }}>
            Acompanhamento de frequência (dias ativos na semana e no mês), telas visitadas e ações de valor do CNPJ selecionado.
          </p>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            flexWrap: "wrap",
            padding: "0.5rem 0.75rem",
            backgroundColor: "var(--cds-layer-01)",
            border: "1px solid var(--cds-border-subtle)",
            borderRadius: "4px",
            fontSize: "0.78rem",
            color: "var(--cds-text-secondary)",
          }}
        >
          <strong>Conta Global ({empresas.length} CNPJ):</strong>
          <UsoSaudeTag status={usoGlobal.status} rotulo={usoGlobal.rotulo} size="sm" />
          <span>
            {usoGlobal.diasAtivos7d}/7d • {usoGlobal.diasAtivos30d}/30d • Último:{" "}
            {fmtTempoRelativo(usoGlobal.ultimoAcessoEm)}
          </span>
        </div>
      </div>

      {/* KPIs do CNPJ ativo */}
      <KpiGrid>
        <KpiTile
          rotulo="FREQUÊNCIA (CNPJ ATIVO)"
          valor={
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
              <UsoSaudeTag status={usoAtivo.status} rotulo={usoAtivo.rotulo} size="md" />
            </div>
          }
          detalhe={`${usoAtivo.diasAtivos7d}/7 dias na semana • ${usoAtivo.diasAtivos30d}/30 dias no mês`}
        />
        <KpiTile
          rotulo="ÚLTIMO ACESSO"
          valor={fmtTempoRelativo(usoAtivo.ultimoAcessoEm)}
          detalhe={
            usoAtivo.ultimoAcessoEm
              ? `${fmtData(usoAtivo.ultimoAcessoEm)}${usoAtivo.ultimaRota ? ` • ${usoAtivo.ultimaRota}` : ""}`
              : "Nenhuma abertura registrada nos últimos 30 dias"
          }
        />
        <KpiTile
          rotulo="ACESSOS (30 DIAS)"
          valor={fmtNum(usoAtivo.totalAcessos30d)}
          detalhe="Navegações consolidadas no portal"
        />
        <KpiTile
          rotulo="AÇÕES DE VALOR (30 DIAS)"
          valor={fmtNum(usoAtivo.totalAcoesValor30d)}
          detalhe="Deliberações, buscas, IA e documentos"
        />
      </KpiGrid>

      {/* Heatmap de presença dos últimos 14 dias */}
      <Tile
        data-testid="uso-heatmap-14d"
        style={{
          padding: "1.25rem",
          backgroundColor: "var(--cds-layer-01)",
          border: "1px solid var(--cds-border-subtle)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "0.5rem",
            marginBottom: "0.75rem",
          }}
        >
          <div>
            <h4 style={{ fontSize: "0.95rem", fontWeight: 600, margin: 0 }}>
              Presença nos últimos 14 dias (horário de Brasília)
            </h4>
            <p style={{ fontSize: "0.78rem", color: "var(--cds-text-secondary)", margin: "0.2rem 0 0" }}>
              Cada bloco representa 1 dia. Passe o mouse para ver acessos e ações de valor naquele dia.
            </p>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", fontSize: "0.72rem", color: "var(--cds-text-secondary)" }}>
            <span>Sem uso</span>
            <span style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: "var(--cds-layer-02)", border: "1px solid var(--cds-border-subtle)", display: "inline-block" }} />
            <span>Ativo</span>
            <span style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: "var(--cds-support-info, #4589ff)", display: "inline-block" }} />
            <span>Intenso</span>
            <span style={{ width: 12, height: 12, borderRadius: 2, backgroundColor: "var(--cds-support-success, #24a148)", display: "inline-block" }} />
          </div>
        </div>

        <div style={{ overflowX: "auto" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(14, minmax(46px, 1fr))",
              gap: "0.4rem",
            }}
          >
            {usoAtivo.serie14Dias.map((dia) => {
              const intensidade =
                dia.acessos === 0 && dia.acoesValor === 0
                  ? "vazio"
                  : dia.acessos >= 5 || dia.acoesValor >= 2
                    ? "intenso"
                    : "ativo";
              const bg =
                intensidade === "intenso"
                  ? "var(--cds-support-success, #24a148)"
                  : intensidade === "ativo"
                    ? "var(--cds-support-info, #4589ff)"
                    : "var(--cds-layer-02)";
              const corTexto =
                intensidade === "vazio"
                  ? "var(--cds-text-secondary)"
                  : "var(--cds-text-on-color, #ffffff)";

              return (
                <div
                  key={dia.dataBrt}
                  title={`${formatDiaCurtoBrt(dia.dataBrt)} — ${dia.acessos} acesso(s), ${dia.acoesValor} ação(ões) de valor`}
                  style={{
                    padding: "0.45rem 0.25rem",
                    borderRadius: "4px",
                    backgroundColor: bg,
                    color: corTexto,
                    border: "1px solid var(--cds-border-subtle)",
                    textAlign: "center",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.15rem",
                  }}
                >
                  <span style={{ fontSize: "0.68rem", fontWeight: 600 }}>
                    {formatDiaCurtoBrt(dia.dataBrt)}
                  </span>
                  <span style={{ fontSize: "0.75rem", fontWeight: 700 }}>
                    {dia.acessos > 0 ? dia.acessos : dia.acoesValor > 0 ? dia.acoesValor : "—"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </Tile>

      {/* Telas mais acessadas + Ações de valor */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
          gap: "1rem",
        }}
      >
        <Tile
          style={{
            padding: "1.25rem",
            backgroundColor: "var(--cds-layer-01)",
            border: "1px solid var(--cds-border-subtle)",
          }}
        >
          <h4 style={{ fontSize: "0.95rem", fontWeight: 600, margin: "0 0 0.75rem" }}>
            Telas mais acessadas (30 dias)
          </h4>
          {usoAtivo.modulosTop.length === 0 ? (
            <p style={{ fontSize: "0.85rem", color: "var(--cds-text-secondary)", fontStyle: "italic" }}>
              Nenhuma navegação registrada neste CNPJ nos últimos 30 dias.
            </p>
          ) : (
            <div style={{ display: "grid", gap: "0.65rem" }}>
              {usoAtivo.modulosTop.map((m) => {
                const pct = Math.max(8, Math.round((m.acessos / maxAcessosModulo) * 100));
                return (
                  <div key={m.modulo}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontSize: "0.8125rem",
                        marginBottom: "0.2rem",
                      }}
                    >
                      <span style={{ fontWeight: 500 }}>{m.rotulo}</span>
                      <span style={{ color: "var(--cds-text-secondary)" }}>
                        {fmtNum(m.acessos)} acesso(s)
                      </span>
                    </div>
                    <div
                      style={{
                        height: "6px",
                        borderRadius: "3px",
                        backgroundColor: "var(--cds-layer-02)",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          width: `${pct}%`,
                          height: "100%",
                          backgroundColor: "var(--cds-interactive, #0f62fe)",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Tile>

        <Tile
          style={{
            padding: "1.25rem",
            backgroundColor: "var(--cds-layer-01)",
            border: "1px solid var(--cds-border-subtle)",
          }}
        >
          <h4 style={{ fontSize: "0.95rem", fontWeight: 600, margin: "0 0 0.75rem" }}>
            Ações de valor realizadas (30 dias)
          </h4>
          {usoAtivo.acoesTop.length === 0 ? (
            <p style={{ fontSize: "0.85rem", color: "var(--cds-text-secondary)", fontStyle: "italic" }}>
              Nenhuma ação operacional registrada neste CNPJ nos últimos 30 dias.
            </p>
          ) : (
            <div style={{ display: "grid", gap: "0.55rem" }}>
              {usoAtivo.acoesTop.map((a) => (
                <div
                  key={a.acao}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "0.45rem 0.65rem",
                    backgroundColor: "var(--cds-layer-02)",
                    borderRadius: "4px",
                    fontSize: "0.8125rem",
                  }}
                >
                  <span>{a.rotulo}</span>
                  <Tag type="teal" size="sm">
                    {fmtNum(a.total)}
                  </Tag>
                </div>
              ))}
            </div>
          )}
        </Tile>
      </div>

      {/* Comparativo entre CNPJs da conta */}
      <AdminTable
        titulo={`Comparativo de uso entre CNPJs da conta (${empresas.length})`}
        descricao="Permite identificar rapidamente quais CNPJs da conta estão ativos e quais estão parados."
        pageSize={5}
        rowClassName={(id) => (id === activeTenantId ? "pncp-admin-row--active" : undefined)}
        colunas={[
          { key: "empresa", header: "Empresa (CNPJ)" },
          { key: "saude", header: "Frequência" },
          { key: "dias", header: "Dias ativos" },
          { key: "acessos", header: "Acessos (30d)" },
          { key: "acoes", header: "Ações de valor (30d)" },
          { key: "ultimo", header: "Último acesso" },
        ]}
        linhas={empresas.map((emp) => {
          const u = dossie.usoPorEmpresa?.[emp.id];
          return {
            id: emp.id,
            empresa: (
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
                  <strong>{emp.nomeFantasia || emp.razaoSocial}</strong>
                  {emp.id === activeTenantId ? (
                    <Tag type="cyan" size="sm">Visualizando</Tag>
                  ) : null}
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)" }}>
                  {maskCnpj(emp.cnpj)}
                </div>
              </div>
            ),
            saude: <UsoSaudeTag status={u?.status} rotulo={u?.rotulo} size="sm" />,
            dias: `${u?.diasAtivos7d ?? 0}/7d • ${u?.diasAtivos30d ?? 0}/30d`,
            acessos: fmtNum(u?.totalAcessos30d ?? 0),
            acoes: fmtNum(u?.totalAcoesValor30d ?? 0),
            ultimo: u?.ultimoAcessoEm ? (
              <span title={fmtData(u.ultimoAcessoEm)}>{fmtTempoRelativo(u.ultimoAcessoEm)}</span>
            ) : (
              "Sem registro"
            ),
          };
        })}
      />

      {/* Atividade por usuário da equipe */}
      <AdminTable
        titulo={`Atividade por usuário da equipe (${usuariosUso.length})`}
        pageSize={5}
        vazio="Nenhum usuário com atividade registrada nos últimos 30 dias."
        colunas={[
          { key: "usuario", header: "Usuário" },
          { key: "dias", header: "Dias ativos" },
          { key: "acessos", header: "Acessos (30d)" },
          { key: "acoes", header: "Ações de valor (30d)" },
          { key: "ultimo", header: "Último acesso" },
        ]}
        linhas={usuariosUso.map((u) => ({
          id: u.userId,
          usuario: (
            <div>
              <strong>{u.nome}</strong>
              <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)" }}>{u.email}</div>
            </div>
          ),
          dias: `${u.diasAtivos7d}/7d • ${u.diasAtivos30d}/30d`,
          acessos: fmtNum(u.totalAcessos30d),
          acoes: fmtNum(u.totalAcoesValor30d),
          ultimo: u.ultimoAcessoEm ? (
            <span title={fmtData(u.ultimoAcessoEm)}>{fmtTempoRelativo(u.ultimoAcessoEm)}</span>
          ) : (
            "Sem registro"
          ),
        }))}
      />
    </div>
  );
}

