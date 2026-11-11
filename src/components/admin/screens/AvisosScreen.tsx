"use client";

import React, { useState } from "react";
import { Button, Select, SelectItem, Tag, TextArea, TextInput, Tile } from "@carbon/react";
import { Bullhorn, CloseOutline, Renew } from "@carbon/icons-react";
import {
  AdminTable,
  FeedbackBar,
  PageHeader,
  adminFetch,
  fmtData,
  useAdminData,
  type Feedback,
} from "../admin-ui";

interface AvisoItem {
  id: string;
  titulo: string;
  mensagem: string;
  severidade: string;
  formato: string;
  publicoAlvo: string;
  targetIds: string[];
  linkDestino: string | null;
  ativo: boolean;
  criadoPorNome: string | null;
  totalDestinatarios: number;
  totalEntreguesNotif?: number;
  totalLidas?: number;
  taxaLeituraPct?: number;
  criadoEm: string;
}

export function AvisosScreen() {
  const { data, loading, erro, recarregar } = useAdminData<{ avisos: AvisoItem[] }>("/api/admin/avisos");
  const [fb, setFb] = useState<Feedback | null>(null);
  const [form, setForm] = useState({
    titulo: "",
    mensagem: "",
    severidade: "INFO",
    formato: "AMBOS",
    publicoAlvo: "TODOS",
    targetIdsText: "",
    linkDestino: "",
    expiraEm: "",
  });

  const disparar = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetIds = form.targetIdsText
      .split(/[\s,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const r = await adminFetch<{ totalDestinatarios?: number; error?: string }>("/api/admin/avisos", {
      method: "POST",
      body: {
        acao: "criar",
        titulo: form.titulo,
        mensagem: form.mensagem,
        severidade: form.severidade,
        formato: form.formato,
        publicoAlvo: form.publicoAlvo,
        targetIds,
        linkDestino: form.linkDestino || null,
        expiraEm: form.expiraEm ? new Date(form.expiraEm).toISOString() : null,
      },
    });
    if (r.ok) {
      setFb({ kind: "success", texto: `Aviso enviado para ${r.data.totalDestinatarios ?? 0} empresa(s).` });
      setForm({ ...form, titulo: "", mensagem: "", targetIdsText: "", linkDestino: "" });
      await recarregar();
    } else {
      setFb({ kind: "error", texto: r.data?.error || "Erro ao disparar aviso." });
    }
  };

  const desativar = async (id: string) => {
    const r = await adminFetch<{ error?: string }>("/api/admin/avisos", {
      method: "POST",
      body: { acao: "desativar", id },
    });
    if (r.ok) {
      setFb({ kind: "info", texto: "Aviso encerrado." });
      await recarregar();
    } else {
      setFb({ kind: "error", texto: r.data?.error || "Erro ao encerrar aviso." });
    }
  };

  const avisos = data?.avisos || [];

  return (
    <div>
      <PageHeader
        titulo="Disparo de Avisos em Massa"
        descricao="Publique comunicados no sino global de notificações e/ou banner de topo segmentados por público-alvo."
        acoes={
          <Button kind="tertiary" renderIcon={Renew} onClick={() => void recarregar()} disabled={loading}>
            Atualizar
          </Button>
        }
      />

      <FeedbackBar feedback={fb} onClose={() => setFb(null)} />
      {erro ? <p style={{ color: "var(--cds-support-error)" }}>{erro}</p> : null}

      <Tile style={{ marginBottom: "1.5rem", maxWidth: "56rem" }}>
        <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1rem" }}>Novo comunicado em massa</h3>
        <form onSubmit={(e) => void disparar(e)} style={{ display: "grid", gap: "1rem" }}>
          <TextInput id="av-tit" labelText="Título do aviso" value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} required />
          <TextArea id="av-msg" labelText="Mensagem" value={form.mensagem} onChange={(e) => setForm({ ...form, mensagem: e.target.value })} rows={3} required />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem" }}>
            <Select id="av-sev" labelText="Severidade" value={form.severidade} onChange={(e) => setForm({ ...form, severidade: e.target.value })}>
              <SelectItem value="INFO" text="Informativo" />
              <SelectItem value="ATENCAO" text="Atenção" />
              <SelectItem value="CRITICA" text="Crítico / Urgente" />
            </Select>
            <Select id="av-fmt" labelText="Canal dentro do sistema" value={form.formato} onChange={(e) => setForm({ ...form, formato: e.target.value })}>
              <SelectItem value="AMBOS" text="Sino Global + Banner de Topo" />
              <SelectItem value="SINO" text="Somente Sino Global" />
              <SelectItem value="BANNER_TOPO" text="Somente Banner de Topo" />
            </Select>
            <Select id="av-pub" labelText="Público-alvo" value={form.publicoAlvo} onChange={(e) => setForm({ ...form, publicoAlvo: e.target.value })}>
              <SelectItem value="TODOS" text="Todos os clientes" />
              <SelectItem value="TRIAL" text="Todos em Teste Grátis" />
              <SelectItem value="ABANDONO_TRIAL" text="Trials pendentes de configuração" />
              <SelectItem value="PAGANTES" text="Clientes pagantes ativos" />
              <SelectItem value="INADIMPLENTES" text="Inadimplentes / Em carência" />
              <SelectItem value="PLANO_BASICO" text="Somente Plano Básico" />
              <SelectItem value="PLANO_PRO" text="Somente Plano Pro" />
              <SelectItem value="PLANO_ENTERPRISE" text="Somente Plano Enterprise" />
              <SelectItem value="ESPECIFICO" text="IDs de Tenants específicos" />
            </Select>
          </div>
          {form.publicoAlvo === "ESPECIFICO" ? (
            <TextInput
              id="av-targets"
              labelText="IDs dos clientes (separados por vírgula)"
              value={form.targetIdsText}
              onChange={(e) => setForm({ ...form, targetIdsText: e.target.value })}
            />
          ) : null}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <TextInput id="av-link" labelText="Link de destino opcional (ex.: /planos)" value={form.linkDestino} onChange={(e) => setForm({ ...form, linkDestino: e.target.value })} />
            <TextInput id="av-exp" labelText="Expira em (opcional)" type="datetime-local" value={form.expiraEm} onChange={(e) => setForm({ ...form, expiraEm: e.target.value })} />
          </div>
          <div>
            <Button type="submit" renderIcon={Bullhorn}>
              Disparar aviso agora
            </Button>
          </div>
        </form>
      </Tile>

      <AdminTable
        titulo={`Histórico de avisos (${avisos.length})`}
        colunas={[
          { key: "titulo", header: "Comunicado" },
          { key: "canal", header: "Canal & Severidade" },
          { key: "publico", header: "Público" },
          { key: "alcance", header: "Empresas & Leitura" },
          { key: "status", header: "Status" },
          { key: "data", header: "Disparado em" },
          { key: "acoes", header: "" },
        ]}
        linhas={avisos.map((a) => ({
          id: a.id,
          titulo: (
            <div>
              <strong>{a.titulo}</strong>
              <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)" }}>{a.mensagem}</div>
            </div>
          ),
          canal: (
            <div>
              <Tag type={a.severidade === "CRITICA" ? "red" : a.severidade === "ATENCAO" ? "warm-gray" : "blue"}>
                {a.severidade}
              </Tag>
              <Tag type="cool-gray">{a.formato}</Tag>
            </div>
          ),
          publico: a.publicoAlvo,
          alcance: (
            <div>
              <div>{a.totalDestinatarios} empresa(s)</div>
              {(a.totalEntreguesNotif ?? 0) > 0 ? (
                <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)" }}>
                  {a.totalLidas ?? 0}/{a.totalEntreguesNotif} lida(s) ({a.taxaLeituraPct ?? 0}%)
                </div>
              ) : null}
            </div>
          ),
          status: <Tag type={a.ativo ? "green" : "gray"}>{a.ativo ? "Ativo" : "Encerrado"}</Tag>,
          data: fmtData(a.criadoEm),
          acoes: a.ativo ? (
            <Button size="sm" kind="danger--tertiary" renderIcon={CloseOutline} onClick={() => void desativar(a.id)}>
              Encerrar
            </Button>
          ) : null,
        }))}
      />
    </div>
  );
}
