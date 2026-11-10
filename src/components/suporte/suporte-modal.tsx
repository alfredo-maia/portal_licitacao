"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Button,
  InlineLoading,
  InlineNotification,
  Modal,
  Select,
  SelectItem,
  Tab,
  TabList,
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

interface SupportTicketUI {
  id: string;
  protocolo: string;
  categoria: string;
  urgencia: string;
  assunto: string;
  status: string;
  criadoEm: string;
  atualizadoEm: string;
  mensagens: SupportMessageUI[];
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
  const [ticketSelecionadoId, setTicketSelecionadoId] = useState<string | null>(null);
  const [novaMensagem, setNovaMensagem] = useState("");
  const [enviandoMsg, setEnviandoMsg] = useState(false);

  const carregarTickets = useCallback(async () => {
    if (typeof fetch !== "function") return;
    setCarregandoTickets(true);
    try {
      const res = await fetch("/api/suporte/tickets");
      if (res.ok) {
        const data = await res.json();
        if (data.ok && Array.isArray(data.tickets)) {
          setTickets(data.tickets);
          if (!ticketSelecionadoId && data.tickets.length > 0) {
            setTicketSelecionadoId(data.tickets[0].id);
          }
        }
      }
    } catch {
      // Silencioso caso offline/teste sem mock
    } finally {
      setCarregandoTickets(false);
    }
  }, [ticketSelecionadoId]);

  useEffect(() => {
    if (open) {
      carregarTickets();
    }
  }, [open, carregarTickets]);

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
      setTicketSelecionadoId(criado.id);
      setAssunto("");
      setDescricao("");
    } catch {
      setErro("Erro de comunicação ao registrar o chamado.");
    } finally {
      setEnviando(false);
    }
  };

  const handleResponderTicket = async (ticketId: string) => {
    if (!novaMensagem.trim() || typeof fetch !== "function") return;
    setEnviandoMsg(true);
    setErro(null);
    try {
      const res = await fetch(`/api/suporte/tickets/${ticketId}/mensagens`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensagem: novaMensagem.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.ok && data.ticket) {
        setTickets((prev) =>
          prev.map((t) => (t.id === ticketId ? data.ticket : t)),
        );
        setNovaMensagem("");
      } else {
        setErro(data.error || "Falha ao enviar resposta.");
      }
    } catch {
      setErro("Erro de comunicação ao responder chamado.");
    } finally {
      setEnviandoMsg(false);
    }
  };

  const ticketAtivo = tickets.find((t) => t.id === ticketSelecionadoId) || tickets[0] || null;

  return (
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
            subtitle={`Seu número de protocolo é ${sucessoProtocolo}. Nossa equipe também enviará confirmações por e-mail/WhatsApp quando configurados.`}
            onCloseButtonClick={() => setSucessoProtocolo(null)}
            style={{ marginBottom: "1rem" }}
          />
        )}

        <Tabs
          selectedIndex={aba}
          onChange={({ selectedIndex }) => setAba(selectedIndex)}
        >
          <TabList aria-label="Opções de Suporte">
            <Tab>Abrir Chamado</Tab>
            <Tab>Meus Protocolos ({tickets.length})</Tab>
          </TabList>
        </Tabs>

        {aba === 0 && (
          <form onSubmit={handleEnviarChamado} style={{ marginTop: "1rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
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
              <Button
                kind="primary"
                type="submit"
                renderIcon={Send}
                disabled={enviando}
              >
                {enviando ? "Registrando..." : "Enviar Chamado"}
              </Button>
            </div>
          </form>
        )}

        {aba === 1 && (
          <div style={{ marginTop: "1rem" }}>
            {carregandoTickets ? (
              <InlineLoading description="Carregando protocolos..." />
            ) : tickets.length === 0 ? (
              <Tile style={{ padding: "1.25rem", textAlign: "center" }}>
                <Chat size={24} style={{ marginBottom: "0.5rem" }} />
                <p style={{ margin: 0, color: "var(--cds-text-secondary)" }}>
                  Você ainda não possui chamados abertos nesta empresa.
                </p>
              </Tile>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                  {tickets.map((t) => {
                    const selected = ticketAtivo?.id === t.id;
                    return (
                      <Button
                        key={t.id}
                        kind={selected ? "primary" : "tertiary"}
                        size="sm"
                        type="button"
                        onClick={() => setTicketSelecionadoId(t.id)}
                      >
                        {t.protocolo} — {t.assunto.slice(0, 28)}
                      </Button>
                    );
                  })}
                </div>

                {ticketAtivo && (
                  <Tile style={{ padding: "1rem", border: "1px solid var(--cds-border-subtle)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.75rem" }}>
                      <div>
                        <strong>{ticketAtivo.protocolo}</strong> — {ticketAtivo.assunto}
                        <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)", marginTop: "0.25rem" }}>
                          {CATEGORIA_LABEL[ticketAtivo.categoria] || ticketAtivo.categoria} • Urgência {ticketAtivo.urgencia}
                        </div>
                      </div>
                      <Tag
                        size="sm"
                        type={STATUS_TAG_COLOR[ticketAtivo.status] || "blue"}
                      >
                        {STATUS_LABEL[ticketAtivo.status] || ticketAtivo.status}
                      </Tag>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxHeight: "220px", overflowY: "auto", marginBottom: "0.75rem" }}>
                      {ticketAtivo.mensagens.map((m) => (
                        <div
                          key={m.id}
                          style={{
                            padding: "0.625rem 0.75rem",
                            borderRadius: "4px",
                            backgroundColor:
                              m.autorTipo === "SUPORTE"
                                ? "var(--cds-layer-selected-01, #e0e0e0)"
                                : "var(--cds-layer-01, #f4f4f4)",
                            borderLeft:
                              m.autorTipo === "SUPORTE"
                                ? "3px solid #0f62fe"
                                : "3px solid #8d8d8d",
                          }}
                        >
                          <div style={{ fontSize: "0.75rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                            {m.autorNome} ({m.autorTipo === "SUPORTE" ? "Equipe de Suporte" : "Você"})
                          </div>
                          <div style={{ fontSize: "0.875rem", whiteSpace: "pre-wrap" }}>
                            {m.mensagem}
                          </div>
                        </div>
                      ))}
                    </div>

                    {ticketAtivo.status !== "CONCLUIDO" && (
                      <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end" }}>
                        <div style={{ flex: 1 }}>
                          <TextInput
                            id={`reply-ticket-${ticketAtivo.id}`}
                            labelText="Adicionar mensagem ao chamado"
                            placeholder="Escreva um complemento ou dúvida..."
                            value={novaMensagem}
                            onChange={(e) => setNovaMensagem(e.target.value)}
                          />
                        </div>
                        <Button
                          kind="secondary"
                          size="md"
                          type="button"
                          disabled={enviandoMsg || !novaMensagem.trim()}
                          onClick={() => handleResponderTicket(ticketAtivo.id)}
                        >
                          Enviar
                        </Button>
                      </div>
                    )}
                  </Tile>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
