"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Tag } from "@carbon/react";
import {
  Checkmark,
  Headset,
  Notification,
  Security,
  UserFollow,
} from "@carbon/icons-react";
import type { AdminNotificationView } from "@/server/services/superadmin/notificacoes";

export type AdminNotificationItem = AdminNotificationView;

interface AdminNotificacoesResponse {
  notificacoes: AdminNotificationItem[];
  naoLidas: number;
}

function fmtNotifDataCurta(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function renderCategoriaIcon(categoria: AdminNotificationItem["categoria"]) {
  switch (categoria) {
    case "NOVO_CLIENTE_TRIAL":
      return <UserFollow size={16} style={{ color: "var(--cds-support-success, #24a148)" }} />;
    case "CHAMADO_SUPORTE":
      return <Headset size={16} style={{ color: "var(--cds-support-info, #4589ff)" }} />;
    case "ACAO_FATURAMENTO_ADM":
    default:
      return <Security size={16} style={{ color: "var(--cds-support-error, #da1e28)" }} />;
  }
}

export function AdminNotificationsBell() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [naoLidas, setNaoLidas] = useState(0);
  const [itens, setItens] = useState<AdminNotificationItem[]>([]);
  const [carregando, setCarregando] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const carregarResumo = useCallback(async () => {
    if (typeof fetch !== "function") return;
    try {
      const res = await fetch("/api/admin/notificacoes?limite=10");
      if (res.ok) {
        const data = (await res.json()) as AdminNotificacoesResponse;
        setNaoLidas(Number(data.naoLidas) || 0);
        setItens(Array.isArray(data.notificacoes) ? data.notificacoes : []);
      }
    } catch {
      // Falha silenciosa em polling do sino
    }
  }, []);

  useEffect(() => {
    void carregarResumo();
    const timer = setInterval(() => {
      void carregarResumo();
    }, 30000);
    const onNotificationsUpdated = () => {
      void carregarResumo();
    };
    window.addEventListener("admin-notifications-updated", onNotificationsUpdated);
    return () => {
      clearInterval(timer);
      window.removeEventListener("admin-notifications-updated", onNotificationsUpdated);
    };
  }, [carregarResumo]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const handleMarcarTodas = async () => {
    setCarregando(true);
    try {
      const res = await fetch("/api/admin/notificacoes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "marcar_todas" }),
      });
      if (res.ok) {
        setNaoLidas(0);
        setItens((prev) => prev.map((n) => ({ ...n, lida: true })));
      }
    } catch {
      // Ignorar
    } finally {
      setCarregando(false);
    }
  };

  const handleItemClick = async (item: AdminNotificationItem) => {
    if (!item.lida) {
      try {
        await fetch("/api/admin/notificacoes", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ acao: "marcar_lida", id: item.id }),
        });
        setNaoLidas((prev) => Math.max(0, prev - 1));
        setItens((prev) => prev.map((n) => (n.id === item.id ? { ...n, lida: true } : n)));
      } catch {
        // Ignorar
      }
    }
    setIsOpen(false);
    router.push(item.linkDestino || "/admin/notificacoes");
  };

  return (
    <div ref={dropdownRef} style={{ position: "relative" }}>
      <button
        type="button"
        aria-label={`Notificações do Portal ADM (${naoLidas} não lidas)`}
        aria-expanded={isOpen}
        data-testid="admin-notifications-bell"
        onClick={() => setIsOpen((prev) => !prev)}
        style={{
          background: "transparent",
          border: "none",
          cursor: "pointer",
          width: "3rem",
          height: "3rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "inherit",
          padding: 0,
        }}
      >
        <span
          style={{
            position: "relative",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Notification size={20} />
          {naoLidas > 0 ? (
            <span
              data-testid="admin-notifications-badge"
              className="pncp-mono"
              style={{
                position: "absolute",
                top: "-6px",
                right: "-8px",
                backgroundColor: "var(--cds-support-error, #da1e28)",
                color: "#ffffff",
                borderRadius: "9999px",
                fontSize: "0.625rem",
                fontWeight: 600,
                minWidth: "1rem",
                height: "1rem",
                padding: "0 0.25rem",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                lineHeight: 1,
              }}
            >
              {naoLidas > 99 ? "99+" : naoLidas}
            </span>
          ) : null}
        </span>
      </button>

      {isOpen && (
        <div
          data-testid="admin-notifications-dropdown"
          style={{
            position: "absolute",
            top: "3rem",
            right: 0,
            width: "24rem",
            maxWidth: "90vw",
            backgroundColor: "var(--cds-layer-01, #f4f4f4)",
            border: "1px solid var(--cds-border-subtle, #e0e0e0)",
            boxShadow: "0 8px 16px rgba(0, 0, 0, 0.2)",
            zIndex: 9999,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            style={{
              padding: "0.875rem 1rem",
              borderBottom: "1px solid var(--cds-border-subtle, #e0e0e0)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span style={{ fontWeight: 600, fontSize: "0.875rem" }}>Notificações ADM</span>
              {naoLidas > 0 ? (
                <Tag size="sm" type="blue" className="pncp-mono">
                  {naoLidas} nova{naoLidas > 1 ? "s" : ""}
                </Tag>
              ) : null}
            </div>
            {naoLidas > 0 ? (
              <Button
                kind="ghost"
                size="sm"
                data-testid="btn-admin-bell-marcar-todas"
                disabled={carregando}
                renderIcon={Checkmark}
                onClick={() => void handleMarcarTodas()}
                style={{ padding: "0 0.5rem", minHeight: "1.75rem", fontSize: "0.75rem" }}
              >
                Marcar todas
              </Button>
            ) : null}
          </div>

          <div style={{ maxHeight: "20rem", overflowY: "auto" }}>
            {itens.length === 0 ? (
              <div
                style={{
                  padding: "2rem 1rem",
                  textAlign: "center",
                  color: "var(--cds-text-secondary, #525252)",
                  fontSize: "0.875rem",
                }}
              >
                Nenhuma notificação no momento.
              </div>
            ) : (
              itens.map((item) => (
                <div
                  key={item.id}
                  data-testid={`admin-notification-item-${item.id}`}
                  onClick={() => void handleItemClick(item)}
                  style={{
                    padding: "0.75rem 1rem",
                    borderBottom: "1px solid var(--cds-border-subtle, #e0e0e0)",
                    backgroundColor: item.lida
                      ? "transparent"
                      : "var(--cds-layer-accent-01, rgba(69, 137, 255, 0.08))",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "0.75rem",
                  }}
                >
                  <div style={{ marginTop: "0.125rem", flexShrink: 0 }}>
                    {renderCategoriaIcon(item.categoria)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.375rem",
                        marginBottom: "0.25rem",
                      }}
                    >
                      {!item.lida ? (
                        <span
                          style={{
                            width: "6px",
                            height: "6px",
                            borderRadius: "50%",
                            backgroundColor: "var(--cds-support-info, #4589ff)",
                            display: "inline-block",
                            flexShrink: 0,
                          }}
                        />
                      ) : null}
                      <span
                        style={{
                          fontWeight: item.lida ? 400 : 600,
                          fontSize: "0.8125rem",
                          color: "var(--cds-text-primary, #161616)",
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {item.titulo}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: "0.75rem",
                        color: "var(--cds-text-secondary, #525252)",
                        lineHeight: 1.3,
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {item.descricao}
                    </div>
                    <div
                      className="pncp-mono"
                      style={{
                        fontSize: "0.6875rem",
                        color: "var(--cds-text-secondary, #8d8d8d)",
                        marginTop: "0.25rem",
                      }}
                    >
                      {fmtNotifDataCurta(item.criadaEm)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div
            style={{
              padding: "0.75rem 1rem",
              borderTop: "1px solid var(--cds-border-subtle, #e0e0e0)",
              textAlign: "center",
              backgroundColor: "var(--cds-layer-02, #ffffff)",
            }}
          >
            <Button
              kind="ghost"
              size="sm"
              onClick={() => {
                setIsOpen(false);
                router.push("/admin/notificacoes");
              }}
              style={{ width: "100%", justifyContent: "center" }}
            >
              Ver todas as notificações →
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

