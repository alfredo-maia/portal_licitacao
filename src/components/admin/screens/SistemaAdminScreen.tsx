"use client";

import React, { useState } from "react";
import {
  Button,
  Checkbox,
  Modal,
  PasswordInput,
  Select,
  SelectItem,
  Tab,
  TabList,
  TabPanel,
  TabPanels,
  Tabs,
  Tag,
  TextInput,
} from "@carbon/react";
import { Add, Edit, Renew } from "@carbon/icons-react";
import {
  AdminTable,
  FeedbackBar,
  PageHeader,
  adminFetch,
  fmtData,
  useAdminData,
  type Feedback,
} from "../admin-ui";

interface AdminUserItem {
  id: string;
  name: string;
  email: string;
  adminRole: string;
  ativo: boolean;
  ultimoLoginEm: string | null;
}

interface AdminAuditItem {
  id: string;
  ocorridoEm: string;
  usuarioNome: string | null;
  acao: string;
  entidadeTipo: string;
  entidadeId: string;
  tenantId: string | null;
  depois: unknown;
}

interface SistemaPayload {
  usuarios: AdminUserItem[];
  logs: AdminAuditItem[];
}

export function SistemaAdminScreen() {
  const { data, loading, erro, recarregar } = useAdminData<SistemaPayload>("/api/admin/sistema");
  const [fb, setFb] = useState<Feedback | null>(null);
  const [form, setForm] = useState<{
    id?: string;
    name: string;
    email: string;
    password: string;
    adminRole: "SUPERADMIN_MASTER" | "ADMIN_OPERACIONAL" | "SUPORTE_N1";
    ativo: boolean;
  } | null>(null);

  const salvarAdmin = async () => {
    if (!form) return;
    const r = await adminFetch<{ error?: string }>("/api/admin/sistema", {
      method: "POST",
      body: {
        id: form.id || undefined,
        name: form.name,
        email: form.email,
        password: form.password.trim() || undefined,
        adminRole: form.adminRole,
        ativo: form.ativo,
      },
    });
    if (r.ok) {
      setFb({ kind: "success", texto: "Operador administrativo salvo." });
      setForm(null);
      await recarregar();
    } else {
      setFb({ kind: "error", texto: r.data?.error || "Erro ao salvar operador." });
    }
  };

  const usuarios = data?.usuarios || [];
  const logs = data?.logs || [];

  return (
    <div>
      <PageHeader
        titulo="Equipe ADM & Logs Administrativos"
        descricao="Gerencie os operadores internos do Portal ADM por nível de acesso (SUPERADMIN_MASTER, ADMIN_OPERACIONAL, SUPORTE_N1) e audite todas as mutações administrativas."
        acoes={
          <>
            <Button
              renderIcon={Add}
              onClick={() =>
                setForm({
                  name: "",
                  email: "",
                  password: "",
                  adminRole: "ADMIN_OPERACIONAL",
                  ativo: true,
                })
              }
            >
              Novo operador ADM
            </Button>
            <Button kind="tertiary" renderIcon={Renew} onClick={() => void recarregar()} disabled={loading}>
              Atualizar
            </Button>
          </>
        }
      />

      <FeedbackBar feedback={fb} onClose={() => setFb(null)} />
      {erro ? <p style={{ color: "var(--cds-support-error)" }}>{erro}</p> : null}

      <Tabs>
        <TabList aria-label="Equipe e logs" contained>
          <Tab>Equipe Interna ADM ({usuarios.length})</Tab>
          <Tab>Logs Administrativos ({logs.length})</Tab>
        </TabList>
        <TabPanels>
          <TabPanel>
            <AdminTable
              titulo="Contas com acesso ao Portal ADM"
              colunas={[
                { key: "nome", header: "Nome / E-mail" },
                { key: "papel", header: "Nível de Acesso" },
                { key: "login", header: "Último login" },
                { key: "status", header: "Status" },
                { key: "acoes", header: "" },
              ]}
              vazio={loading ? "Carregando..." : "Nenhum operador cadastrado."}
              linhas={usuarios.map((u) => ({
                id: u.id,
                nome: (
                  <div>
                    <strong>{u.name}</strong>
                    <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)" }}>{u.email}</div>
                  </div>
                ),
                papel: (
                  <Tag type={u.adminRole === "SUPERADMIN_MASTER" ? "red" : u.adminRole === "ADMIN_OPERACIONAL" ? "blue" : "cyan"}>
                    {u.adminRole}
                  </Tag>
                ),
                login: fmtData(u.ultimoLoginEm),
                status: <Tag type={u.ativo ? "green" : "gray"}>{u.ativo ? "Ativo" : "Inativo"}</Tag>,
                acoes: (
                  <Button
                    size="sm"
                    kind="ghost"
                    renderIcon={Edit}
                    onClick={() =>
                      setForm({
                        id: u.id,
                        name: u.name,
                        email: u.email,
                        password: "",
                        adminRole:
                          u.adminRole === "SUPORTE_N1" || u.adminRole === "ADMIN_OPERACIONAL"
                            ? u.adminRole
                            : "SUPERADMIN_MASTER",
                        ativo: u.ativo,
                      })
                    }
                  >
                    Editar
                  </Button>
                ),
              }))}
            />
          </TabPanel>

          <TabPanel>
            <AdminTable
              titulo="Auditoria de ações executadas no Portal ADM (ADMIN_*)"
              colunas={[
                { key: "quando", header: "Data/Hora" },
                { key: "operador", header: "Operador" },
                { key: "acao", header: "Ação" },
                { key: "alvo", header: "Entidade / ID" },
                { key: "detalhes", header: "Detalhes" },
              ]}
              vazio={loading ? "Carregando..." : "Nenhuma ação administrativa registrada ainda."}
              linhas={logs.map((l) => ({
                id: l.id,
                quando: fmtData(l.ocorridoEm),
                operador: l.usuarioNome || "SuperAdmin",
                acao: <Tag type="purple">{l.acao}</Tag>,
                alvo: `${l.entidadeTipo} • ${l.entidadeId}`,
                detalhes: (
                  <span style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)" }}>
                    {l.depois ? JSON.stringify(l.depois).slice(0, 120) : "—"}
                  </span>
                ),
              }))}
            />
          </TabPanel>
        </TabPanels>
      </Tabs>

      <Modal
        open={form !== null}
        modalHeading={form?.id ? "Editar operador administrativo" : "Novo operador administrativo"}
        primaryButtonText="Salvar"
        secondaryButtonText="Cancelar"
        onRequestClose={() => setForm(null)}
        onRequestSubmit={() => void salvarAdmin()}
      >
        {form ? (
          <div style={{ display: "grid", gap: "1rem" }}>
            <TextInput id="adm-nome" labelText="Nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <TextInput id="adm-email" labelText="E-mail" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <PasswordInput
              id="adm-pass"
              labelText={form.id ? "Nova senha (opcional — deixe em branco para manter)" : "Senha inicial (mín. 6 caracteres)"}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
            <Select id="adm-role" labelText="Papel na equipe ADM" value={form.adminRole} onChange={(e) => setForm({ ...form, adminRole: e.target.value as typeof form.adminRole })}>
              <SelectItem value="SUPERADMIN_MASTER" text="SUPERADMIN_MASTER (Acesso total)" />
              <SelectItem value="ADMIN_OPERACIONAL" text="ADMIN_OPERACIONAL (Clientes, Financeiro, Afiliados, Suporte, Avisos, IA)" />
              <SelectItem value="SUPORTE_N1" text="SUPORTE_N1 (Somente leitura + Atendimento de Suporte)" />
            </Select>
            <Checkbox id="adm-ativo" labelText="Operador ativo" checked={form.ativo} onChange={(_, { checked }) => setForm({ ...form, ativo: checked })} />
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

