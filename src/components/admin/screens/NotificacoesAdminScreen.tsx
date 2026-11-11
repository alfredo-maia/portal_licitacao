"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { Button, ContentSwitcher, Switch, Tag } from "@carbon/react";
import { Checkmark, Renew } from "@carbon/icons-react";
import {
  AdminTable,
  FeedbackBar,
  PageHeader,
  adminFetch,
  fmtData,
  useAdminData,
  type Feedback,
} from "../admin-ui";
import type { AdminNotificationView } from "@/server/services/superadmin/notificacoes";

interface NotificacoesPayload {
  notificacoes: AdminNotificationView[];
  naoLidas: number;
}

const CATEGORIA_LABELS: Record<
  AdminNotificationView["categoria"],
  { label: string; tagType: "green" | "blue" | "red" }
> = {
  NOVO_CLIENTE_TRIAL: { label: "Novo Trial (1º CNPJ)", tagType: "green" },
  CHAMADO_SUPORTE: { label: "Chamado de Suporte", tagType: "blue" },
  ACAO_FATURAMENTO_ADM: { label: "Controle de Fraude (Faturamento)", tagType: "red" },
};

export function NotificacoesAdminScreen({ adminRole }: { adminRole?: string | null }) {
  const { data, loading, erro, recarregar } = useAdminData<NotificacoesPayload>(
    "/api/admin/notificacoes?limite=200",
  );
  const [fb, setFb] = useState<Feedback | null>(null);
  const [categoria, setCategoria] = useState<string>("TODAS");
  const [somenteNaoLidas, setSomenteNaoLidas] = useState(false);

  const notificacoes = useMemo(() => data?.notificacoes || [], [data?.notificacoes]);

  const mostrarControleFraude =
    adminRole === "SUPERADMIN_MASTER" ||
    notificacoes.some((n) => n.categoria === "ACAO_FATURAMENTO_ADM");

  const filtrosCategoria = useMemo(() => {
    const base = [
      { id: "TODAS", label: "Todas" },
      { id: "NOVO_CLIENTE_TRIAL", label: "Novos em Trial" },
      { id: "CHAMADO_SUPORTE", label: "Chamados de Suporte" },
    ];
    if (mostrarControleFraude) {
      base.push({ id: "ACAO_FATURAMENTO_ADM", label: "Controle de Fraude" });
    }
    return base;
  }, [mostrarControleFraude]);

  const filtradas = useMemo(() => {
    return notificacoes.filter((n) => {
      if (categoria !== "TODAS" && n.categoria !== categoria) return false;
      if (somenteNaoLidas && n.lida) return false;
      return true;
    });
  }, [notificacoes, categoria, somenteNaoLidas]);

  const marcarLida = async (id: string) => {
    const r = await adminFetch<{ error?: string }>("/api/admin/notificacoes", {
      method: "PATCH",
      body: { acao: "marcar_lida", id },
    });
    if (r.ok) {
      await recarregar();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("admin-notifications-updated"));
      }
    } else {
      setFb({ kind: "error", texto: r.data?.error || "Não foi possível marcar como lida." });
    }
  };

  const marcarTodas = async () => {
    const r = await adminFetch<{ error?: string }>("/api/admin/notificacoes", {
      method: "PATCH",
      body: { acao: "marcar_todas" },
    });
    if (r.ok) {
      setFb({ kind: "success", texto: "Todas as notificações foram marcadas como lidas." });
      await recarregar();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("admin-notifications-updated"));
      }
    } else {
      setFb({ kind: "error", texto: r.data?.error || "Não foi possível marcar todas como lidas." });
    }
  };

  return (
    <div>
      <PageHeader
        titulo="Central de Notificações do Portal ADM"
        descricao="Acompanhe em tempo real novos cadastros em Teste Grátis (1º CNPJ), chamados de suporte dos clientes e eventos de controle de fraude financeira."
        acoes={
          <>
            <Button
              kind="secondary"
              renderIcon={Checkmark}
              disabled={(data?.naoLidas ?? 0) === 0}
              onClick={() => void marcarTodas()}
            >
              Marcar todas como lidas ({data?.naoLidas ?? 0})
            </Button>
            <Button
              kind="tertiary"
              renderIcon={Renew}
              onClick={() => void recarregar()}
              disabled={loading}
            >
              Atualizar
            </Button>
          </>
        }
      />

      <FeedbackBar feedback={fb} onClose={() => setFb(null)} />
      {erro ? <p style={{ color: "var(--cds-support-error)" }}>{erro}</p> : null}

      <div
        style={{
          display: "flex",
          gap: "1rem",
          flexWrap: "wrap",
          alignItems: "center",
          marginBottom: "1rem",
        }}
      >
        <div style={{ flex: 1, minWidth: "20rem" }}>
          <ContentSwitcher
            size="md"
            selectedIndex={Math.max(
              0,
              filtrosCategoria.findIndex((f) => f.id === categoria),
            )}
            onChange={(e: { name?: string | number }) => setCategoria(String(e.name))}
          >
            {filtrosCategoria.map((f) => (
              <Switch key={f.id} name={f.id} text={f.label} />
            ))}
          </ContentSwitcher>
        </div>
        <Button
          size="sm"
          kind={somenteNaoLidas ? "primary" : "tertiary"}
          onClick={() => setSomenteNaoLidas((prev) => !prev)}
        >
          {somenteNaoLidas ? "Exibindo: Não lidas" : "Somente não lidas"}
        </Button>
      </div>

      <AdminTable
        titulo={`${filtradas.length} notificação(ões)`}
        pageSize={10}
        resetPageKey={`${categoria}|${String(somenteNaoLidas)}`}
        colunas={[
          { key: "categoria", header: "Gatilho" },
          { key: "conteudo", header: "Título & Detalhes" },
          { key: "ator", header: "Origem" },
          { key: "quando", header: "Data/Hora" },
          { key: "status", header: "Leitura" },
          { key: "acoes", header: "Ações" },
        ]}
        vazio={loading ? "Carregando..." : "Nenhuma notificação registrada para este filtro."}
        linhas={filtradas.map((n) => {
          const cfg = CATEGORIA_LABELS[n.categoria] ?? {
            label: n.categoria,
            tagType: "blue" as const,
          };
          return {
            id: n.id,
            categoria: <Tag type={cfg.tagType}>{cfg.label}</Tag>,
            conteudo: (
              <div>
                <strong style={{ fontWeight: n.lida ? 500 : 700 }}>{n.titulo}</strong>
                <div style={{ fontSize: "0.8rem", color: "var(--cds-text-secondary)" }}>
                  {n.descricao}
                </div>
              </div>
            ),
            ator: n.atorNome || "Sistema",
            quando: fmtData(n.criadaEm),
            status: (
              <Tag type={n.lida ? "gray" : "cyan"}>{n.lida ? "Lida" : "Não lida"}</Tag>
            ),
            acoes: (
              <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                {n.linkDestino ? (
                  <Link href={n.linkDestino}>
                    <Button size="sm" kind="tertiary" as="span">
                      Abrir
                    </Button>
                  </Link>
                ) : null}
                {!n.lida ? (
                  <Button
                    size="sm"
                    kind="ghost"
                    onClick={() => void marcarLida(n.id)}
                  >
                    Marcar lida
                  </Button>
                ) : null}
              </div>
            ),
          };
        })}
      />
    </div>
  );
}

