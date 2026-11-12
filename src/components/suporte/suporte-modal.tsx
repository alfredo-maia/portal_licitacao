"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  InlineLoading,
  InlineNotification,
  Modal,
  Pagination,
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
import { Chat, Send } from "@carbon/icons-react";

interface SupportMessageUI {
  id: string;
  ticketId: string;
  autorId: string | null;
  autorNome: string;
  autorTipo: "CLIENTE" | "SUPORTE";
  mensagem: string;
  criadoEm: string;
}

export interface SupportTicketUI {
  id: string;
  protocolo: string;
  categoria: string;
  urgencia: string;
  assunto: string;
  status: string;
  criadoEm: string;
  atualizadoEm: string;
  mensagensNaoLidasCliente?: number;
  mensagens?: SupportMessageUI[];
}

const STATUS_TAG_COLOR: Record<string, "blue" | "teal" | "warm-gray" | "green" | "cool-gray" | "red"> = {
  ABERTO: "blue",
  EM_ATENDIMENTO: "teal",
  AGUARDANDO_CLIENTE: "warm-gray",
  RESPONDIDO: "green",
  CONCLUIDO: "cool-gray",
};

const STATUS_LABEL: Record<string, string> = {
  ABERTO: "Aberto",
  EM_ATENDIMENTO: "Em atendimento",
  AGUARDANDO_CLIENTE: "Aguardando cliente",
  RESPONDIDO: "Respondido",
  CONCLUIDO: "Concluído",
};

const CATEGORIA_LABEL: Record<string, string> = {
  DUVIDA: "Dúvida de Uso",
  PROBLEMA_TECNICO: "Problema Técnico",
  FINANCEIRO: "Financeiro / Plano",
  SUGESTAO: "Sugestão",
};

function getUrgenciaTagColor(urgencia: string): "red" | "warm-gray" | "gray" {
  if (urgencia === "CRITICA" || urgencia === "ALTA") return "red";
  if (urgencia === "MEDIA") return "warm-gray";
  return "gray";
}

function fmtDataBrasil(dataIso: string | undefined): string {
  if (!dataIso) return "—";
  const d = new Date(dataIso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function fmtHoraBrasil(dataIso: string | undefined): string {
  if (!dataIso) return "";
  const d = new Date(dataIso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function SuporteModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [aba, setAba] = useState(0);
  const [categoria, setCategoria] = useState("DUVIDA");
  const [urgencia, setUrgencia] = useState("MEDIA");
  const [assunto, setAssunto] = useState("");
  const [descricao, setDescricao] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucessoProtocolo, setSucessoProtocolo] = useState<string | null>(null);

  const [tickets, setTickets] = useState<SupportTicketUI[]>([]);
  const [carregandoTickets, setCarregandoTickets] = useState(false);

  // Paginação das tabelas
  const [pageAbertos, setPageAbertos] = useState(1);
  const [pageSizeAbertos, setPageSizeAbertos] = useState(5);
  const [pageEncerrados, setPageEncerrados] = useState(1);
  const [pageSizeEncerrados, setPageSizeEncerrados] = useState(5);

  // Modal separado de Chat (Lazy Load)
  const [chatTicketModal, setChatTicketModal] = useState<SupportTicketUI | null>(null);
  const [mensagensChat, setMensagensChat] = useState<SupportMessageUI[]>([]);
  const [carregandoChat, setCarregandoChat] = useState(false);
  const [novaMensagem, setNovaMensagem] = useState("");
  const [enviandoMsg, setEnviandoMsg] = useState(false);

  const carregarTickets = useCallback(async () => {
    if (typeof fetch !== "function") return;
    setCarregandoTickets(true);
    try {
      const res = await fetch("/api/suporte/tickets?resumo=1");
      if (res.ok) {
        const data = await res.json();
        if (data.ok && Array.isArray(data.tickets)) {
          setTickets(data.tickets);
        }
      }
    } catch {
      // Silencioso
    } finally {
      setCarregandoTickets(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      void carregarTickets();
    }
  }, [open, carregarTickets]);

  const ticketsAbertos = useMemo(
    () => tickets.filter((t) => t.status !== "CONCLUIDO"),
    [tickets],
  );

  const ticketsEncerrados = useMemo(
    () => tickets.filter((t) => t.status === "CONCLUIDO"),
    [tickets],
  );

  const ticketsAbertosPaginados = useMemo(() => {
    const inicio = (pageAbertos - 1) * pageSizeAbertos;
    return ticketsAbertos.slice(inicio, inicio + pageSizeAbertos);
  }, [ticketsAbertos, pageAbertos, pageSizeAbertos]);

  const ticketsEncerradosPaginados = useMemo(() => {
    const inicio = (pageEncerrados - 1) * pageSizeEncerrados;
    return ticketsEncerrados.slice(inicio, inicio + pageSizeEncerrados);
  }, [ticketsEncerrados, pageEncerrados, pageSizeEncerrados]);

  const handleEnviarChamado = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setErro(null);
    setSucessoProtocolo(null);

    if (assunto.trim().length < 3) {
      setErro("Informe um assunto com pelo menos 3 caracteres.");
      return;
    }
    if (descricao.trim().length < 5) {
      setErro("Descreva sua solicitação com pelo menos 5 caracteres.");
      return;
    }

    if (typeof fetch !== "function") return;
    setEnviando(true);
    try {
      const res = await fetch("/api/suporte/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoria,
          urgencia,
          assunto: assunto.trim(),
          descricao: descricao.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setErro(data.error || "Não foi possível abrir o chamado no momento.");
        return;
      }

      const criado: SupportTicketUI = data.ticket;
      setSucessoProtocolo(criado.protocolo);
      setTickets((prev) => [criado, ...prev.filter((t) => t.id !== criado.id)]);
      setAssunto("");
      setDescricao("");
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("suporte-tickets-updated"));
      }
    } catch {
      setErro("Erro de comunicação ao registrar o chamado.");
    } finally {
      setEnviando(false);
    }
  };

  // Abrir chat sob demanda (Lazy Load)
  const abrirChatModal = async (ticket: SupportTicketUI) => {
    setChatTicketModal(ticket);
    setMensagensChat(ticket.mensagens || []);
    setNovaMensagem("");
    setCarregandoChat(true);

    try {
      const res = await fetch(`/api/suporte/tickets/${ticket.id}/mensagens`);
      if (res.ok) {
        const data = await res.json();
        const msgs = Array.isArray(data.mensagens)
          ? data.mensagens
          : Array.isArray(data.ticket?.mensagens)
            ? data.ticket.mensagens
            : [];
        setMensagensChat(msgs);
        // Atualiza lista zerando não lidas
        setTickets((prev) =>
          prev.map((t) => (t.id === ticket.id ? { ...t, mensagensNaoLidasCliente: 0 } : t)),
        );
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("suporte-tickets-updated"));
        }
      }
    } catch {
      // Ignorar falha
    } finally {
      setCarregandoChat(false);
    }
  };

  const handleResponderChat = async () => {
    if (!chatTicketModal || !novaMensagem.trim() || typeof fetch !== "function") return;
    setEnviandoMsg(true);
    try {
      const res = await fetch(`/api/suporte/tickets/${chatTicketModal.id}/mensagens`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensagem: novaMensagem.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.ok && data.ticket) {
        setMensagensChat(data.ticket.mensagens || []);
        setNovaMensagem("");
        setTickets((prev) =>
          prev.map((t) => (t.id === chatTicketModal.id ? data.ticket : t)),
        );
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("suporte-tickets-updated"));
        }
      }
    } catch {
      // Ignorar
    } finally {
      setEnviandoMsg(false);
    }
  };

  const renderTabelaTickets = (
    lista: SupportTicketUI[],
    vazioTexto: string,
    ehEncerrado = false,
  ) => {
    if (carregandoTickets) {
      return (
        <div style={{ padding: "2rem", textAlign: "center" }}>
          <InlineLoading description="Carregando chamados..." />
        </div>
      );
    }

    if (lista.length === 0) {
      return (
        <Tile style={{ padding: "1.5rem", textAlign: "center", marginTop: "1rem" }}>
          <Chat size={28} style={{ marginBottom: "0.5rem", color: "var(--cds-text-secondary)" }} />
          <p style={{ margin: 0, color: "var(--cds-text-secondary)" }}>{vazioTexto}</p>
        </Tile>
      );
    }

    return (
      <div style={{ marginTop: "1rem" }}>
        <div
          style={{
            border: "1px solid var(--cds-border-subtle, #393939)",
            borderRadius: "4px",
            overflowX: "auto",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
            <thead>
              <tr style={{ backgroundColor: "var(--cds-layer-02, #262626)", textAlign: "left" }}>
                <th style={{ padding: "0.6rem 0.75rem" }}>Data de Abertura</th>
                <th style={{ padding: "0.6rem 0.75rem" }}>Número do Protocolo</th>
                <th style={{ padding: "0.6rem 0.75rem" }}>Assunto</th>
                <th style={{ padding: "0.6rem 0.75rem" }}>Categoria</th>
                <th style={{ padding: "0.6rem 0.75rem" }}>Urgência</th>
                <th style={{ padding: "0.6rem 0.75rem", textAlign: "center" }}>Chat</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((t, idx) => {
                const temNaoLidas = (t.mensagensNaoLidasCliente || 0) > 0;
                return (
                  <tr
                    key={t.id}
                    style={{
                      borderTop: "1px solid var(--cds-border-subtle, #393939)",
                      backgroundColor:
                        temNaoLidas
                          ? "rgba(15, 98, 254, 0.08)"
                          : idx % 2 === 0
                            ? "var(--cds-layer-01, #161616)"
                            : "transparent",
                    }}
                  >
                    <td style={{ padding: "0.6rem 0.75rem" }}>{fmtDataBrasil(t.criadoEm)}</td>
                    <td style={{ padding: "0.6rem 0.75rem" }}>
                      <Tag type="purple" size="sm">
                        {t.protocolo}
                      </Tag>
                    </td>
                    <td style={{ padding: "0.6rem 0.75rem" }}>
                      <strong>{t.assunto}</strong>
                    </td>
                    <td style={{ padding: "0.6rem 0.75rem" }}>
                      {CATEGORIA_LABEL[t.categoria] || t.categoria}
                    </td>
                    <td style={{ padding: "0.6rem 0.75rem" }}>
                      <Tag size="sm" type={getUrgenciaTagColor(t.urgencia)}>
                        {t.urgencia}
                      </Tag>
                    </td>
                    <td style={{ padding: "0.6rem 0.75rem", textAlign: "center" }}>
                      <div style={{ display: "inline-flex", alignItems: "center", position: "relative" }}>
                        <Button
                          size="sm"
                          kind={temNaoLidas ? "primary" : "ghost"}
                          hasIconOnly
                          iconDescription="Abrir Chat do chamado"
                          renderIcon={Chat}
                          data-testid={`btn-abrir-chat-${t.id}`}
                          onClick={() => void abrirChatModal(t)}
                        />
                        {temNaoLidas && (
                          <span
                            style={{
                              position: "absolute",
                              top: "-4px",
                              right: "-4px",
                              width: "8px",
                              height: "8px",
                              borderRadius: "50%",
                              backgroundColor: "var(--cds-support-error, #da1e28)",
                            }}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <Pagination
          backwardText="Página anterior"
          forwardText="Próxima página"
          itemsPerPageText="Itens por página:"
          page={ehEncerrado ? pageEncerrados : pageAbertos}
          pageNumberText="Número da página"
          pageSize={ehEncerrado ? pageSizeEncerrados : pageSizeAbertos}
          pageSizes={[5, 10, 20]}
          totalItems={ehEncerrado ? ticketsEncerrados.length : ticketsAbertos.length}
          onChange={({ page, pageSize }) => {
            if (ehEncerrado) {
              setPageEncerrados(page);
              setPageSizeEncerrados(pageSize);
            } else {
              setPageAbertos(page);
              setPageSizeAbertos(pageSize);
            }
          }}
        />
      </div>
    );
  };

  return (
    <>
      <Modal
        open={open}
        onRequestClose={onClose}
        modalHeading="Central de Suporte & Atendimento"
        modalLabel="Atendimento ao Licitante"
        passiveModal
        size="lg"
      >
        <div style={{ paddingTop: "0.25rem" }}>
          {erro && (
            <InlineNotification
              kind="error"
              title="Atenção:"
              subtitle={erro}
              onCloseButtonClick={() => setErro(null)}
              style={{ marginBottom: "1rem" }}
            />
          )}

          {sucessoProtocolo && (
            <InlineNotification
              kind="success"
              title="Chamado registrado com sucesso!"
              subtitle={`Seu número de protocolo é ${sucessoProtocolo}. Nossa equipe responderá em breve.`}
              onCloseButtonClick={() => setSucessoProtocolo(null)}
              style={{ marginBottom: "1rem" }}
            />
          )}

          {/* Abas por status do chamado (Item 11.b) */}
          <Tabs selectedIndex={aba} onChange={({ selectedIndex }) => setAba(selectedIndex)}>
            <TabList aria-label="Opções de Suporte" contained>
              <Tab>Abrir Chamado</Tab>
              <Tab>Em Aberto ({ticketsAbertos.length})</Tab>
              <Tab>Encerrados ({ticketsEncerrados.length})</Tab>
            </TabList>
            <TabPanels>
              {/* Aba 0: Formulário de Abertura */}
              <TabPanel>
                <form
                  onSubmit={handleEnviarChamado}
                  style={{ marginTop: "1rem", display: "flex", flexDirection: "column", gap: "1rem" }}
                >
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                    <Select
                      id="suporte-categoria"
                      labelText="Categoria"
                      value={categoria}
                      onChange={(e) => setCategoria(e.target.value)}
                    >
                      <SelectItem value="DUVIDA" text="Dúvida de Uso" />
                      <SelectItem value="PROBLEMA_TECNICO" text="Problema Técnico / Bug" />
                      <SelectItem value="FINANCEIRO" text="Financeiro / Assinatura" />
                      <SelectItem value="SUGESTAO" text="Sugestão de Melhoria" />
                    </Select>

                    <Select
                      id="suporte-urgencia"
                      labelText="Urgência"
                      value={urgencia}
                      onChange={(e) => setUrgencia(e.target.value)}
                    >
                      <SelectItem value="BAIXA" text="Baixa" />
                      <SelectItem value="MEDIA" text="Média" />
                      <SelectItem value="ALTA" text="Alta" />
                      <SelectItem value="CRITICA" text="Crítica (Pregão Iminente)" />
                    </Select>
                  </div>

                  <TextInput
                    id="suporte-assunto"
                    labelText="Assunto *"
                    placeholder="Ex: Dúvida sobre extração de itens ou certidão"
                    value={assunto}
                    onChange={(e) => setAssunto(e.target.value)}
                  />

                  <TextArea
                    id="suporte-descricao"
                    labelText="Descrição *"
                    placeholder="Descreva os detalhes do chamado, número do edital ou documento envolvido..."
                    rows={4}
                    value={descricao}
                    onChange={(e) => setDescricao(e.target.value)}
                  />

                  <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "0.25rem" }}>
                    <Button kind="secondary" type="button" onClick={onClose}>
                      Fechar
                    </Button>
                    <Button kind="primary" type="submit" renderIcon={Send} disabled={enviando}>
                      {enviando ? "Registrando..." : "Enviar Chamado"}
                    </Button>
                  </div>
                </form>
              </TabPanel>

              {/* Aba 1: Em Aberto (Tabela paginada - Item 11.c) */}
              <TabPanel>
                {renderTabelaTickets(
                  ticketsAbertosPaginados,
                  "Nenhum chamado em aberto no momento.",
                  false,
                )}
              </TabPanel>

              {/* Aba 2: Encerrados (Tabela paginada - Item 11.c) */}
              <TabPanel>
                {renderTabelaTickets(
                  ticketsEncerradosPaginados,
                  "Nenhum chamado encerrado ainda.",
                  true,
                )}
              </TabPanel>
            </TabPanels>
          </Tabs>
        </div>
      </Modal>

      {/* Novo Modal Separado de Chat Sob Demanda (Item 11.d - Lazy Load) */}
      <Modal
        open={chatTicketModal !== null}
        modalHeading={
          chatTicketModal
            ? `Chat: ${chatTicketModal.protocolo} — ${chatTicketModal.assunto}`
            : "Chat do Chamado"
        }
        modalLabel="Atendimento Interativo"
        passiveModal
        size="md"
        data-testid="modal-chat-suporte"
        onRequestClose={() => setChatTicketModal(null)}
      >
        {chatTicketModal ? (
          <div style={{ display: "grid", gap: "0.85rem" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "0.5rem",
                padding: "0.6rem 0.75rem",
                backgroundColor: "var(--cds-layer-02, #262626)",
                borderRadius: "4px",
              }}
            >
              <div>
                <strong>{chatTicketModal.protocolo}</strong>
                <span style={{ marginLeft: "0.5rem", color: "var(--cds-text-secondary)", fontSize: "0.8rem" }}>
                  {CATEGORIA_LABEL[chatTicketModal.categoria] || chatTicketModal.categoria} • Urgência: {chatTicketModal.urgencia}
                </span>
              </div>
              <Tag size="sm" type={STATUS_TAG_COLOR[chatTicketModal.status] || "blue"}>
                {STATUS_LABEL[chatTicketModal.status] || chatTicketModal.status}
              </Tag>
            </div>

            {carregandoChat ? (
              <div style={{ padding: "2rem", textAlign: "center" }}>
                <InlineLoading description="Carregando histórico de mensagens..." />
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.6rem",
                  maxHeight: "300px",
                  overflowY: "auto",
                  padding: "0.5rem",
                  border: "1px solid var(--cds-border-subtle, #393939)",
                  borderRadius: "4px",
                  backgroundColor: "var(--cds-layer-01, #161616)",
                }}
              >
                {mensagensChat.length === 0 ? (
                  <p style={{ margin: 0, color: "var(--cds-text-secondary)", textAlign: "center", fontSize: "0.85rem" }}>
                    Nenhuma mensagem registrada no chamado.
                  </p>
                ) : (
                  mensagensChat.map((m) => {
                    const ehSuporte = m.autorTipo === "SUPORTE";
                    return (
                      <div
                        key={m.id}
                        style={{
                          padding: "0.6rem 0.75rem",
                          borderRadius: "4px",
                          backgroundColor: ehSuporte
                            ? "var(--cds-layer-selected-01, #262626)"
                            : "var(--cds-layer-02, #1f1f1f)",
                          borderLeft: ehSuporte ? "3px solid #0f62fe" : "3px solid #8d8d8d",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            fontSize: "0.75rem",
                            marginBottom: "0.25rem",
                            color: "var(--cds-text-secondary)",
                          }}
                        >
                          <strong>
                            {m.autorNome} ({ehSuporte ? "Equipe de Suporte" : "Você"})
                          </strong>
                          <span>
                            {fmtDataBrasil(m.criadoEm)} {fmtHoraBrasil(m.criadoEm)}
                          </span>
                        </div>
                        <div style={{ fontSize: "0.875rem", whiteSpace: "pre-wrap" }}>
                          {m.mensagem}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {chatTicketModal.status !== "CONCLUIDO" ? (
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end" }}>
                <div style={{ flex: 1 }}>
                  <TextInput
                    id={`reply-ticket-${chatTicketModal.id}`}
                    labelText="Mensagem"
                    placeholder="Escreva uma resposta ou complemento..."
                    value={novaMensagem}
                    onChange={(e) => setNovaMensagem(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void handleResponderChat();
                      }
                    }}
                  />
                </div>
                <Button
                  kind="primary"
                  size="md"
                  type="button"
                  renderIcon={Send}
                  disabled={enviandoMsg || !novaMensagem.trim()}
                  onClick={() => void handleResponderChat()}
                >
                  {enviandoMsg ? "Enviando..." : "Enviar"}
                </Button>
              </div>
            ) : (
              <div
                style={{
                  padding: "0.5rem",
                  fontSize: "0.85rem",
                  color: "var(--cds-text-secondary)",
                  textAlign: "center",
                }}
              >
                Este chamado foi concluído. Caso precise de novo auxílio, abra um novo chamado.
              </div>
            )}
          </div>
        ) : null}
      </Modal>
    </>
  );
}
