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
import { ArrowLeft, Add, Edit, View } from "@carbon/icons-react";
import {
  AdminTable,
  EngajamentoTag,
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
      lista: Array<{ id: string; nome: string; categoria: string; dataVencimento: string | null; vencido: boolean }>;
    };
    portais: number;
    impugnacoes: number;
    precosSalvos: number;
  };
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
  notasInternasAdm: string | null;
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
  const [espelho, setEspelho] = useState<Record<string, unknown> | null>(null);

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

  const abrirEspelho = async () => {
    const r = await adminFetch<Record<string, unknown>>(`/api/admin/clientes/${tenantId}?espelho=1`);
    if (r.ok) setEspelho(r.data);
    else setFb({ kind: "error", texto: "Não foi possível espelhar a visão do cliente." });
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

  return (
    <div>
      <div style={{ marginBottom: "0.75rem" }}>
        <Link href="/admin/clientes" style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
          <ArrowLeft size={16} /> Clientes
        </Link>
      </div>

      <PageHeader
        titulo={tenant.nomeFantasia || tenant.razaoSocial}
        descricao={`${tenant.razaoSocial} • ${tenant.cnpj}`}
        acoes={
          <>
            <StatusFinanceiroTag status={tenant.billingStatus} />
            <Tag type="blue">{tenant.plano}</Tag>
            {tenant.ativo === false ? <Tag type="red">Conta inativa</Tag> : null}
            <Button kind="tertiary" renderIcon={View} onClick={abrirEspelho}>
              Espelhar visão do cliente
            </Button>
          </>
        }
      />

      <FeedbackBar feedback={fb} onClose={() => setFb(null)} />

      {/* Termômetro de configuração do Trial (7 marcos) */}
      <Tile style={{ marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem" }}>
          <h3 style={{ fontSize: "1rem", fontWeight: 600 }}>
            Termômetro de configuração — {onboarding.score}/7 ({onboarding.percentual}%)
          </h3>
          <EngajamentoTag status={onboarding.statusEngajamento} />
        </div>
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.75rem" }}>
          {MARCOS.map((m) => (
            <Tag key={m.chave} type={onboarding[m.chave] ? "green" : "gray"}>
              {onboarding[m.chave] ? "✓" : "○"} {m.rotulo}
            </Tag>
          ))}
        </div>
      </Tile>

      <Tabs>
        <TabList aria-label="Seções do cliente" contained>
          <Tab>1 · Conta principal</Tab>
          <Tab>2 · Empresas (CNPJs)</Tab>
          <Tab>3 · Usuários</Tab>
          <Tab>4 · Licitações & Cofre</Tab>
          <Tab>5 · Recursos & Cotas</Tab>
        </TabList>
        <TabPanels>
          <TabPanel>
            <ContaPrincipal dossie={data} patch={patch} />
          </TabPanel>
          <TabPanel>
            <Empresas dossie={data} patch={patch} />
          </TabPanel>
          <TabPanel>
            <Usuarios dossie={data} patch={patch} />
          </TabPanel>
          <TabPanel>
            <Patrimonio dossie={data} patch={patch} />
          </TabPanel>
          <TabPanel>
            <Cotas dossie={data} patch={patch} />
          </TabPanel>
        </TabPanels>
      </Tabs>

      {data.disputas.length > 0 && (
        <div style={{ marginTop: "2rem" }}>
          <AdminTable
            titulo="Disputas de titularidade de CNPJ"
            colunas={[
              { key: "cnpj", header: "CNPJ" },
              { key: "req", header: "Requerente" },
              { key: "motivo", header: "Motivo" },
              { key: "status", header: "Status" },
              { key: "acoes", header: "" },
            ]}
            linhas={data.disputas.map((d) => ({
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

      <Modal
        open={Boolean(espelho)}
        modalHeading="Visão do cliente (somente leitura)"
        passiveModal
        size="lg"
        onRequestClose={() => setEspelho(null)}
      >
        {espelho ? <EspelhoView espelho={espelho} /> : null}
      </Modal>

      <KpiGrid>
        <KpiTile rotulo="MENSALIDADE" valor={fmtBRL(tenant.valorMensalidade)} detalhe={`Teste: ${tenant.diasRestantesTrial} dia(s)`} />
        <KpiTile rotulo="COFRE (R2)" valor={`${cotas.storageUsadoMb} MB`} detalhe={`de ${cotas.storageTotalMb} MB`} />
        <KpiTile rotulo="IA NO MÊS" valor={fmtNum(cotas.aiUsadasMes)} detalhe={`Bônus ADM: +${cotas.aiExtraQuotaMes}`} />
        <KpiTile rotulo="PATRIMÔNIO" valor={`${pat.licitacoes.length} licitações`} detalhe={`${pat.documentos.total} docs • ${pat.portais} portais`} />
      </KpiGrid>
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
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div style={{ display: "grid", gap: "1rem", maxWidth: "52rem", paddingTop: "1rem" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "1rem" }}>
        <TextInput id="c-nome" labelText="Nome do titular" value={form.name} onChange={set("name")} />
        <TextInput id="c-email" labelText="E-mail de acesso" value={form.email} onChange={set("email")} />
        <TextInput id="c-cpf" labelText="CPF" value={form.cpf} onChange={set("cpf")} />
        <TextInput id="c-tel" labelText="Telefone / WhatsApp" value={form.telefone} onChange={set("telefone")} />
        <TextInput id="c-cidade" labelText="Cidade" value={form.cidade} onChange={set("cidade")} />
        <TextInput id="c-uf" labelText="UF" maxLength={2} value={form.uf} onChange={set("uf")} />
      </div>
      <TextArea id="c-notas" labelText="Notas internas (visíveis só para a equipe ADM)" value={form.notas} onChange={set("notas")} rows={3} />
      <p style={{ fontSize: "0.8rem", color: "var(--cds-text-secondary)" }}>
        Último login: {fmtData(t.ultimoLoginEm)} • Versão de sessão: {t.sessionVersion}. Senhas nunca são exibidas ou editáveis.
      </p>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <Button
          renderIcon={Edit}
          onClick={() =>
            patch(
              "conta",
              {
                userId: t.id,
                name: form.name,
                email: form.email,
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
        <Button kind="tertiary" onClick={() => patch("conta", { userId: t.id, dispararResetSenha: true }, "Link de redefinição de senha enviado ao cliente.")}>
          Enviar link de redefinição de senha
        </Button>
        <Button kind="tertiary" onClick={() => patch("conta", { userId: t.id, forcarLogout: true }, "Sessões do cliente encerradas (logout forçado).")}>
          Forçar logout
        </Button>
        {t.ativo ? (
          <Button kind="danger--tertiary" onClick={() => setConfirmar("inativar")}>
            Inativar cliente
          </Button>
        ) : (
          <Button kind="primary" onClick={() => setConfirmar("ativar")}>
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
function Empresas({ dossie, patch }: { dossie: Dossie; patch: PatchFn }) {
  const vazio = { id: "", cnpj: "", razaoSocial: "", nomeFantasia: "", uf: "", cidade: "", plano: "BASICO", billingStatus: "TRIAL" };
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
              <strong>{e.nomeFantasia || e.razaoSocial}</strong>
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
              plano: edit.plano,
              billingStatus: edit.billingStatus,
            },
            "Empresa salva.",
          );
          if (ok) setEdit(null);
        }}
      >
        {edit ? (
          <div style={{ display: "grid", gap: "1rem" }}>
            <TextInput id="e-cnpj" labelText="CNPJ" value={edit.cnpj} onChange={(e) => setEdit({ ...edit, cnpj: e.target.value })} />
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
function Usuarios({ dossie, patch }: { dossie: Dossie; patch: PatchFn }) {
  const vazio = {
    userId: "",
    tenantId: dossie.tenantId,
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
            { ...edit, userId: edit.userId || undefined },
            "Usuário salvo. O link de definição de senha é enviado por e-mail.",
          );
          if (ok) setEdit(null);
        }}
      >
        {edit ? (
          <div style={{ display: "grid", gap: "1rem" }}>
            <TextInput id="u-nome" labelText="Nome" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            <TextInput id="u-email" labelText="E-mail" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} />
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

/* ---------------------------- Aba 4 — Licitações & Cofre ---------------------------- */
function Patrimonio({ dossie, patch }: { dossie: Dossie; patch: PatchFn }) {
  const pat = dossie.patrimonioOperacional;
  const [inj, setInj] = useState({ aberto: false, licitacaoId: "", statusKanban: "PENDENTE", tenantId: dossie.tenantId });

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
        <Button renderIcon={Add} onClick={() => setInj({ ...inj, aberto: true })}>
          Injetar licitação no Kanban deste cliente
        </Button>
      </div>

      <AdminTable
        titulo="Licitações em que o cliente participa"
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
          <TextInput id="i-lic" labelText="ID da licitação (veja em Licitações & PNCP)" value={inj.licitacaoId} onChange={(e) => setInj({ ...inj, licitacaoId: e.target.value })} />
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
function Cotas({ dossie, patch }: { dossie: Dossie; patch: PatchFn }) {
  const c = dossie.cotas;
  const [maxCnpjs, setMaxCnpjs] = useState(String(c.maxCnpjs));
  const [maxUsers, setMaxUsers] = useState(String(c.maxUsers));
  const [bonusIa, setBonusIa] = useState(String(c.aiExtraQuotaMes));
  const [licReset, setLicReset] = useState("");

  useEffect(() => {
    setMaxCnpjs(String(c.maxCnpjs));
    setMaxUsers(String(c.maxUsers));
    setBonusIa(String(c.aiExtraQuotaMes));
  }, [c.maxCnpjs, c.maxUsers, c.aiExtraQuotaMes]);

  return (
    <div style={{ paddingTop: "1rem", display: "grid", gap: "1.5rem", maxWidth: "52rem" }}>
      <KpiGrid>
        <KpiTile rotulo="COFRE R2" valor={`${c.storageUsadoMb} / ${c.storageTotalMb} MB`} detalhe={`Base ${c.storageBaseMb} MB + extra ${c.storageExtraQuotaMb} MB`} />
        <KpiTile rotulo="ANÁLISES DE IA (MÊS)" valor={fmtNum(c.aiUsadasMes)} detalhe={`Bônus concedido: +${c.aiExtraQuotaMes}`} />
      </KpiGrid>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem" }}>
        <TextInput id="q-cnpjs" labelText="Máximo de CNPJs" type="number" value={maxCnpjs} onChange={(e) => setMaxCnpjs(e.target.value)} />
        <TextInput id="q-users" labelText="Máximo de usuários" type="number" value={maxUsers} onChange={(e) => setMaxUsers(e.target.value)} />
        <TextInput id="q-ia" labelText="Bônus mensal de análises de IA" type="number" value={bonusIa} onChange={(e) => setBonusIa(e.target.value)} />
      </div>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <Button
          onClick={() =>
            patch(
              "cotas",
              { maxCnpjs: Number(maxCnpjs), maxUsers: Number(maxUsers), aiExtraQuotaMes: Number(bonusIa) },
              "Limites do cliente atualizados.",
            )
          }
        >
          Salvar limites
        </Button>
        <Button kind="tertiary" onClick={() => patch("cotas", { adicionarStorageMb: 1024 }, "+1 GB de Cofre concedido.")}>
          +1 GB de Cofre
        </Button>
        <Button kind="tertiary" onClick={() => patch("cotas", { adicionarStorageMb: 2048 }, "+2 GB de Cofre concedidos.")}>
          +2 GB de Cofre
        </Button>
      </div>

      <Tile>
        <h4 style={{ fontWeight: 600, marginBottom: "0.5rem" }}>Destravar trava de 5 execuções de IA por licitação</h4>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end" }}>
          <TextInput id="q-reset" labelText="ID da licitação" value={licReset} onChange={(e) => setLicReset(e.target.value)} />
          <Button
            kind="secondary"
            disabled={!licReset.trim()}
            onClick={() => patch("cotas", { resetarTravaIaLicitacaoId: licReset.trim() }, "Trava silenciosa de IA zerada para a licitação.")}
          >
            Resetar trava
          </Button>
        </div>
      </Tile>
    </div>
  );
}

/* ---------------------------- Espelho (visão do cliente) ---------------------------- */
function EspelhoView({ espelho }: { espelho: Record<string, unknown> }) {
  const kanban = (espelho.licitacoesKanban as Array<{ id: string; numeroEdital: string; orgaoNome: string; statusKanban: string }>) || [];
  const porColuna = (espelho.kanbanPorColuna as Record<string, number>) || {};
  return (
    <div>
      <p style={{ color: "var(--cds-text-secondary)", marginBottom: "1rem" }}>
        Modo espelho: exibe exatamente o patrimônio que o cliente enxerga, sem permitir alterações e sem iniciar sessão como ele.
      </p>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "1rem" }}>
        {Object.entries(porColuna).map(([col, n]) => (
          <Tag key={col} type="cool-gray">
            {col.replace(/_/g, " ")}: {n}
          </Tag>
        ))}
      </div>
      {kanban.length === 0 ? (
        <p>O cliente ainda não possui licitações no Kanban.</p>
      ) : (
        kanban.map((k) => (
          <div key={k.id} style={{ padding: "0.4rem 0", borderTop: "1px solid var(--cds-border-subtle-01)" }}>
            <strong>{k.numeroEdital}</strong> — {k.orgaoNome} <Tag type="blue">{k.statusKanban.replace(/_/g, " ")}</Tag>
          </div>
        ))
      )}
    </div>
  );
}

