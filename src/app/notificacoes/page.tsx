"use client";

import React, { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Column,
  Grid,
  InlineLoading,
  Pagination,
  Tab,
  TabList,
  Tabs,
  Tag,
  Tile,
} from "@carbon/react";
import {
  ArrowRight,
  Checkmark,
  Information,
  Misuse,
  Notification,
  Renew,
  Warning,
} from "@carbon/icons-react";
import { ModulePageShell } from "@/components/shell/module-page-shell";

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

interface ListResponse {
  ok: boolean;
  total: number;
  naoLidas: number;
  page: number;
  pageSize: number;
  totalPages: number;
  notificacoes: NotificacaoItem[];
}

export default function NotificacoesPage() {
  const router = useRouter();
  const [apenasNaoLidas, setApenasNaoLidas] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [carregando, setCarregando] = useState(true);
  const [processandoAcao, setProcessandoAcao] = useState(false);
  const [dados, setDados] = useState<ListResponse>({
    ok: true,
    total: 0,
    naoLidas: 0,
    page: 1,
    pageSize: 10,
    totalPages: 0,
    notificacoes: [],
  });

  const carregarNotificacoes = useCallback(async () => {
    setCarregando(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (apenasNaoLidas) {
        params.set("apenasNaoLidas", "true");
      }
      const res = await fetch(`/api/notificacoes?${params.toString()}`);
      if (res.ok) {
        const json: ListResponse = await res.json();
        setDados(json);
      }
    } catch {
      // Ignorar erro de rede
    } finally {
      setCarregando(false);
    }
  }, [apenasNaoLidas, page, pageSize]);

  useEffect(() => {
    carregarNotificacoes();
  }, [carregarNotificacoes]);

  const handleMarcarTodas = async () => {
    setProcessandoAcao(true);
    try {
      const res = await fetch("/api/notificacoes/marcar-todas", {
        method: "POST",
      });
      if (res.ok) {
        await carregarNotificacoes();
      }
    } finally {
      setProcessandoAcao(false);
    }
  };

  const handleMarcarLida = async (id: string) => {
    try {
      const res = await fetch(`/api/notificacoes/${id}/lida`, {
        method: "PATCH",
      });
      if (res.ok) {
        setDados((prev) => ({
          ...prev,
          naoLidas: Math.max(0, prev.naoLidas - 1),
          notificacoes: prev.notificacoes.map((item) =>
            item.id === id ? { ...item, lida: true, lidaEm: new Date().toISOString() } : item,
          ),
        }));
      }
    } catch {
      // Ignorar
    }
  };

  const renderIconSeveridade = (severidade: "INFO" | "ATENCAO" | "CRITICA") => {
    switch (severidade) {
      case "CRITICA":
        return <Misuse size={18} style={{ color: "var(--cds-support-error, #da1e28)" }} />;
      case "ATENCAO":
        return <Warning size={18} style={{ color: "var(--cds-support-warning, #f1c21b)" }} />;
      case "INFO":
      default:
        return <Information size={18} style={{ color: "var(--cds-support-info, #4589ff)" }} />;
    }
  };

  const getTagTypeSeveridade = (severidade: "INFO" | "ATENCAO" | "CRITICA") => {
    switch (severidade) {
      case "CRITICA":
        return "red" as const;
      case "ATENCAO":
        return "warm-gray" as const;
      case "INFO":
      default:
        return "blue" as const;
    }
  };

  return (
    <ModulePageShell
      routePath="/notificacoes"
      subtitle="Avisos sincronizados em tempo real com o sino global de notificações para prazos de certames, retificações do PNCP e validade de certidões."
    >
      <Grid fullWidth>
        <Column lg={16} md={8} sm={4}>
          <Tile
            style={{
              padding: "1rem 1.25rem",
              marginBottom: "1rem",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "1rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
              <Tabs
                selectedIndex={apenasNaoLidas ? 1 : 0}
                onChange={({ selectedIndex }) => {
                  setApenasNaoLidas(selectedIndex === 1);
                  setPage(1);
                }}
              >
                <TabList aria-label="Filtro de notificações" contained>
                  <Tab>Todas ({dados.total})</Tab>
                  <Tab>Não lidas ({dados.naoLidas})</Tab>
                </TabList>
              </Tabs>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <Button
                kind="ghost"
                size="sm"
                hasIconOnly
                renderIcon={Renew}
                iconDescription="Atualizar lista"
                onClick={() => carregarNotificacoes()}
              />
              <Button
                kind="tertiary"
                size="sm"
                data-testid="btn-marcar-todas"
                disabled={dados.naoLidas === 0 || processandoAcao}
                renderIcon={Checkmark}
                onClick={handleMarcarTodas}
              >
                {processandoAcao ? "Marcando..." : "✔ Marcar todas como lidas"}
              </Button>
            </div>
          </Tile>
        </Column>

        <Column lg={16} md={8} sm={4}>
          {carregando ? (
            <Tile style={{ padding: "3rem 1rem", textAlign: "center" }}>
              <InlineLoading description="Carregando notificações operacionais..." />
            </Tile>
          ) : dados.notificacoes.length === 0 ? (
            <Tile
              style={{
                padding: "3.5rem 1rem",
                textAlign: "center",
                color: "var(--cds-text-secondary)",
              }}
            >
              <Notification size={36} style={{ marginBottom: "1rem", opacity: 0.5 }} />
              <h3 style={{ margin: "0 0 0.5rem 0", fontSize: "1.125rem", fontWeight: 600 }}>
                Nenhuma notificação encontrada
              </h3>
              <p style={{ margin: 0, fontSize: "0.875rem" }}>
                {apenasNaoLidas
                  ? "Você leu todas as notificações recentes. Alterne para a aba 'Todas' para ver o histórico."
                  : "Não há avisos registrados no sistema para o seu usuário."}
              </p>
            </Tile>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {dados.notificacoes.map((item) => (
                <Tile
                  key={item.id}
                  data-testid={`notification-card-${item.id}`}
                  style={{
                    padding: "1.25rem",
                    borderLeft: item.lida
                      ? "4px solid transparent"
                      : "4px solid var(--cds-support-info, #4589ff)",
                    backgroundColor: item.lida
                      ? "var(--cds-layer-01)"
                      : "var(--cds-layer-accent-01, rgba(69, 137, 255, 0.05))",
                    transition: "background-color 0.15s ease",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: "1rem",
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ display: "flex", gap: "1rem", flex: 1, minWidth: "16rem" }}>
                      <div style={{ marginTop: "0.25rem", flexShrink: 0 }}>
                        {renderIconSeveridade(item.severidade)}
                      </div>

                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.5rem",
                            flexWrap: "wrap",
                            marginBottom: "0.375rem",
                          }}
                        >
                          {!item.lida && (
                            <span
                              data-testid="unread-dot"
                              style={{
                                width: "8px",
                                height: "8px",
                                borderRadius: "50%",
                                backgroundColor: "var(--cds-support-info, #4589ff)",
                                display: "inline-block",
                              }}
                            />
                          )}
                          <Tag
                            type={getTagTypeSeveridade(item.severidade)}
                            size="sm"
                            className="pncp-mono"
                          >
                            {item.severidade}
                          </Tag>
                          <span
                            className="pncp-mono"
                            style={{
                              fontSize: "0.75rem",
                              color: "var(--cds-text-secondary)",
                            }}
                          >
                            {item.tipo}
                          </span>
                          <span
                            className="pncp-mono"
                            style={{
                              fontSize: "0.75rem",
                              color: "var(--cds-text-muted, #8d8d8d)",
                              marginLeft: "auto",
                            }}
                          >
                            {new Date(item.criadaEm).toLocaleString("pt-BR", {
                              day: "2-digit",
                              month: "2-digit",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>

                        <h3
                          style={{
                            margin: "0 0 0.5rem 0",
                            fontSize: "1rem",
                            fontWeight: item.lida ? 500 : 700,
                            color: "var(--cds-text-primary)",
                          }}
                        >
                          {item.titulo}
                        </h3>

                        <p
                          style={{
                            margin: 0,
                            fontSize: "0.875rem",
                            color: "var(--cds-text-secondary)",
                            lineHeight: 1.4,
                          }}
                        >
                          {item.descricao}
                        </p>
                      </div>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                        marginLeft: "auto",
                      }}
                    >
                      {!item.lida && (
                        <Button
                          kind="ghost"
                          size="sm"
                          data-testid="btn-marcar-lida"
                          renderIcon={Checkmark}
                          onClick={() => handleMarcarLida(item.id)}
                        >
                          Marcar como lida
                        </Button>
                      )}
                      {item.linkDestino && (
                        <Button
                          kind="tertiary"
                          size="sm"
                          renderIcon={ArrowRight}
                          onClick={() => router.push(item.linkDestino!)}
                        >
                          Ver licitação
                        </Button>
                      )}
                    </div>
                  </div>
                </Tile>
              ))}

              {dados.totalPages > 1 && (
                <div style={{ marginTop: "1rem" }}>
                  <Pagination
                    backwardText="Página anterior"
                    forwardText="Próxima página"
                    itemsPerPageText="Itens por página:"
                    page={page}
                    pageNumberText="Número da página"
                    pageSize={pageSize}
                    pageSizes={[10, 20, 50]}
                    totalItems={dados.total}
                    onChange={({ page: novaPagina, pageSize: novoPageSize }) => {
                      setPage(novaPagina);
                      setPageSize(novoPageSize);
                    }}
                  />
                </div>
              )}
            </div>
          )}
        </Column>
      </Grid>
    </ModulePageShell>
  );
}
