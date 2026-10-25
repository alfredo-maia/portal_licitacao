"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Tag } from "@carbon/react";
import { Checkmark, Notification, Warning, Information, Misuse } from "@carbon/icons-react";

interface NotificacaoItem {
  id: string;
  tipo: string;
  titulo: string;
  descricao: string;
  severidade: "INFO" | "ATENCAO" | "CRITICA";
  linkDestino: string | null;
  criadaEm: string;
  lida: boolean;
  lidaEm: string | null;
}

interface ResumoResponse {
  ok: boolean;
  naoLidas: number;
  recentes: NotificacaoItem[];
}

export function NotificationsBell() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [naoLidas, setNaoLidas] = useState(0);
  const [recentes, setRecentes] = useState<NotificacaoItem[]>([]);
  const [carregando, setCarregando] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const carregarResumo = async () => {
    try {
      const res = await fetch("/api/notificacoes/resumo");
      if (res.ok) {
        const data: ResumoResponse = await res.json();
        setNaoLidas(data.naoLidas || 0);
        setRecentes(data.recentes || []);
      }
    } catch {
      // Falha silenciosa em polling/resumo
    }
  };

  useEffect(() => {
    carregarResumo();
    const interval = setInterval(carregarResumo, 30000); // Polling a cada 30s
    return () => clearInterval(interval);
  }, []);

  // Fechar ao clicar fora
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
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

  const handleMarcarTodasLidas = async () => {
    setCarregando(true);
    try {
      const res = await fetch("/api/notificacoes/marcar-todas", {
        method: "POST",
      });
      if (res.ok) {
        setNaoLidas(0);
        setRecentes((prev) => prev.map((item) => ({ ...item, lida: true })));
      }
    } catch {
      // Ignorar
    } finally {
      setCarregando(false);
    }
  };

  const handleItemClick = async (item: NotificacaoItem) => {
    if (!item.lida) {
      try {
        await fetch(`/api/notificacoes/${item.id}/lida`, { method: "PATCH" });
        setNaoLidas((prev) => Math.max(0, prev - 1));
        setRecentes((prev) =>
          prev.map((n) => (n.id === item.id ? { ...n, lida: true } : n)),
        );
      } catch {
        // Ignorar
      }
    }
    setIsOpen(false);
    if (item.linkDestino) {
      router.push(item.linkDestino);
    } else {
      router.push("/notificacoes");
    }
  };

  const renderIconSeveridade = (severidade: "INFO" | "ATENCAO" | "CRITICA") => {
    switch (severidade) {
      case "CRITICA":
        return <Misuse size={16} style={{ color: "var(--cds-support-error, #da1e28)" }} />;
      case "ATENCAO":
        return <Warning size={16} style={{ color: "var(--cds-support-warning, #f1c21b)" }} />;
      case "INFO":
      default:
        return <Information size={16} style={{ color: "var(--cds-support-info, #4589ff)" }} />;
    }
  };

  return (
    <div ref={dropdownRef} style={{ position: "relative" }}>
      <button
        type="button"
        aria-label={`Notificações (${naoLidas} não lidas)`}
        aria-expanded={isOpen}
        data-testid="notifications-bell"
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
              data-testid="notifications-badge"
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
          data-testid="notifications-dropdown"
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
              <span style={{ fontWeight: 600, fontSize: "0.875rem" }}>
                Notificações
              </span>
              {naoLidas > 0 && (
                <Tag size="sm" type="blue" className="pncp-mono">
                  {naoLidas} nova{naoLidas > 1 ? "s" : ""}
                </Tag>
              )}
            </div>
            {naoLidas > 0 && (
              <Button
                kind="ghost"
                size="sm"
                data-testid="btn-bell-marcar-todas"
                disabled={carregando}
                renderIcon={Checkmark}
                onClick={handleMarcarTodasLidas}
                style={{ padding: "0 0.5rem", minHeight: "1.75rem", fontSize: "0.75rem" }}
              >
                Marcar todas
              </Button>
            )}
          </div>

          <div style={{ maxHeight: "20rem", overflowY: "auto" }}>
            {recentes.length === 0 ? (
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
              recentes.map((item) => (
                <div
                  key={item.id}
                  data-testid={`notification-item-${item.id}`}
                  onClick={() => handleItemClick(item)}
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
                    transition: "background-color 0.15s ease",
                  }}
                >
                  <div style={{ marginTop: "0.125rem", flexShrink: 0 }}>
                    {renderIconSeveridade(item.severidade)}
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
                      {!item.lida && (
                        <span
                          data-testid="unread-dot"
                          style={{
                            width: "6px",
                            height: "6px",
                            borderRadius: "50%",
                            backgroundColor: "var(--cds-support-info, #4589ff)",
                            display: "inline-block",
                            flexShrink: 0,
                          }}
                        />
                      )}
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
                        color: "var(--cds-text-muted, #8d8d8d)",
                        marginTop: "0.25rem",
                      }}
                    >
                      {new Date(item.criadaEm).toLocaleDateString("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
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
                router.push("/notificacoes");
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
