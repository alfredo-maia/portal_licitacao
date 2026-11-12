"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  Button,
  ContentSwitcher,
  Modal,
  Select,
  SelectItem,
  Switch,
  Tag,
  TextArea,
  Tile,
} from "@carbon/react";
import { Add, Chat, Renew, SendAlt } from "@carbon/icons-react";
import type { SupportTicketItem, SupportTicketStatus } from "@/server/schemas/suporte.schema";
import {
  AdminTable,
  FeedbackBar,
  PageHeader,
  adminFetch,
  fmtData,
  useAdminData,
  type Feedback,
} from "../admin-ui";

interface SuportePayload {
  tickets: SupportTicketItem[];
}

const COLUNAS_SUPORTE: Array<{ id: SupportTicketStatus; label: string; tagType: "red" | "blue" | "warm-gray" | "cyan" | "green" }> = [
  { id: "ABERTO", label: "Aberto", tagType: "red" },
  { id: "EM_ATENDIMENTO", label: "Em Atendimento", tagType: "blue" },
  { id: "AGUARDANDO_CLIENTE", label: "Aguardando Cliente", tagType: "warm-gray" },
  { id: "RESPONDIDO", label: "Respondido", tagType: "cyan" },
  { id: "CONCLUIDO", label: "Concluído", tagType: "green" },
];

const MACROS_RESPOSTA = [
  {
    id: "boas_vindas",
    label: "Boas-vindas / Análise",
    texto: "Olá! Recebemos seu chamado e nossa equipe técnica já está analisando o caso. Retornaremos com a solução em breve.",
  },
  {
    id: "concluido",
    label: "Chamado Concluído",
    texto: "Solicitação atendida com sucesso! Caso precise de qualquer outro suporte, estamos à disposição por aqui.",
  },
  {
    id: "faturamento",
    label: "Faturamento / Pagamento Confirmado",
    texto: "Confirmamos a compensação do seu pagamento. Sua conta e recursos estão ativos e operando normalmente.",
  },
  {
    id: "pncp_sincronizacao",
    label: "Dúvidas sobre Coleta PNCP",
    texto: "A sincronização com o PNCP ocorre automaticamente de forma periódica. As oportunidades correspondentes aos seus filtros já estão sendo processadas.",
  },
  {
    id: "solicitar_dados",
    label: "Solicitação de Informações Adicionais",
    texto: "Poderia nos fornecer mais detalhes ou uma captura de tela do comportamento para que possamos investigar minuciosamente?",
  },
];

function getUrgenciaTagType(urgencia: string): "red" | "warm-gray" | "gray" {
  if (urgencia === "ALTA" || urgencia === "CRITICA") return "red";
  if (urgencia === "MEDIA") return "warm-gray";
  return "gray";
}

function TicketCardContent({ ticket, onOpen }: { ticket: SupportTicketItem; onOpen: () => void }) {
  const urgColor = getUrgenciaTagType(ticket.urgencia);
  return (
    <Tile
      style={{
        marginBottom: "0.5rem",
        padding: "0.75rem",
        backgroundColor: "var(--cds-layer-02, #ffffff)",
        border: "1px solid var(--cds-border-subtle-01)",
        cursor: "grab",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.25rem", marginBottom: "0.35rem" }}>
        <Tag size="sm" type="purple">{ticket.protocolo}</Tag>
        <Tag size="sm" type={urgColor}>{ticket.urgencia}</Tag>
      </div>
      <div style={{ fontWeight: 600, fontSize: "0.875rem", marginBottom: "0.25rem" }}>{ticket.assunto}</div>
      <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)", marginBottom: "0.5rem" }}>
        {ticket.autorNome} • {ticket.categoria}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: "0.7rem", color: "var(--cds-text-secondary)" }}>
          {ticket.mensagens.length} msg(s)
        </span>
        <Button
          size="sm"
          kind="ghost"
          data-testid={`btn-abrir-ticket-${ticket.id}`}
          renderIcon={Chat}
          onClick={(e: React.MouseEvent) => { e.stopPropagation(); onOpen(); }}
        >
          Atender
        </Button>
      </div>
    </Tile>
  );
}

function DraggableTicketCard({ ticket, onOpen }: { ticket: SupportTicketItem; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: ticket.id });
  const { role: _role, ...restAttributes } = attributes;
  const style: React.CSSProperties = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} {...listeners} {...restAttributes}>
      <TicketCardContent ticket={ticket} onOpen={onOpen} />
    </div>
  );
}

function DroppableSuporteColuna({
  col,
  tickets,
  onSelectTicket,
}: {
  col: (typeof COLUNAS_SUPORTE)[number];
  tickets: SupportTicketItem[];
  onSelectTicket: (t: SupportTicketItem) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: col.id });
  return (
    <div
      ref={setNodeRef}
      style={{
        minWidth: "250px",
        flex: "1 1 250px",
        backgroundColor: isOver ? "var(--cds-layer-hover-01)" : "var(--cds-layer-01)",
        border: isOver ? "1px dashed var(--cds-focus)" : "1px solid var(--cds-border-subtle-01)",
        padding: "0.75rem",
        minHeight: "420px",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
        <Tag type={col.tagType}>{col.label}</Tag>
        <span style={{ fontSize: "0.8rem", fontWeight: 600 }}>{tickets.length}</span>
      </div>
      {tickets.length === 0 ? (
        <p style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)" }}>Arraste um ticket para cá</p>
      ) : (
        tickets.map((t) => (
          <DraggableTicketCard key={t.id} ticket={t} onOpen={() => onSelectTicket(t)} />
        ))
      )}
    </div>
  );
}

export function SuporteAdminScreen() {
  const { data, loading, erro, recarregar } = useAdminData<SuportePayload>("/api/admin/suporte");
  const [fb, setFb] = useState<Feedback | null>(null);
  const [visao, setVisao] = useState<"KANBAN" | "LISTA">("KANBAN");
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);
  const [resposta, setResposta] = useState("");
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const tickets: SupportTicketItem[] = Array.isArray(data)
    ? data
    : Array.isArray(data?.tickets)
      ? data.tickets
      : [];
  const ticketAtual = useMemo(
    () => tickets.find((t) => t.id === selecionadoId) || null,
    [tickets, selecionadoId],
  );
  const draggingTicket = useMemo(
    () => tickets.find((t) => t.id === draggingId) || null,
    [tickets, draggingId],
  );

  const alterarStatus = async (ticketId: string, status: SupportTicketStatus) => {
    const r = await adminFetch<{ error?: string }>("/api/admin/suporte", {
      method: "POST",
      body: { acao: "status", ticketId, status },
    });
    if (r.ok) {
      setFb({ kind: "success", texto: `Status alterado para ${status.replace(/_/g, " ")}.` });
      await recarregar();
    } else {
      setFb({ kind: "error", texto: r.data?.error || "Erro ao alterar status do ticket." });
    }
  };

  const enviarResposta = async () => {
    if (!ticketAtual || !resposta.trim()) return;
    const r = await adminFetch<{ error?: string }>("/api/admin/suporte", {
      method: "POST",
      body: { acao: "responder", ticketId: ticketAtual.id, mensagem: resposta.trim() },
    });
    if (r.ok) {
      setResposta("");
      setFb({ kind: "success", texto: `Resposta enviada ao protocolo ${ticketAtual.protocolo}.` });
      await recarregar();
    } else {
      setFb({ kind: "error", texto: r.data?.error || "Erro ao responder ticket." });
    }
  };

  const onDragStart = (event: DragStartEvent) => {
    setDraggingId(String(event.active.id));
  };

  const onDragEnd = (event: DragEndEvent) => {
    setDraggingId(null);
    const over = event.over?.id;
    const activeId = String(event.active.id);
    if (!over) return;
    const targetStatus = String(over) as SupportTicketStatus;
    const t = tickets.find((x) => x.id === activeId);
    if (t && t.status !== targetStatus) {
      void alterarStatus(t.id, targetStatus);
    }
  };

  return (
    <div>
      <PageHeader
        titulo="Chamados de Suporte — Lista & Kanban"
        descricao="Visualize e mova protocolos (PROT-AAAAMM-XXXX) entre colunas do atendimento ou na tabela completa, responda como suporte e conceda recursos em 1 clique."
        acoes={
          <>
            <ContentSwitcher
              size="md"
              selectedIndex={visao === "KANBAN" ? 0 : 1}
              onChange={(e: { name?: string | number }) => setVisao(String(e.name) as "KANBAN" | "LISTA")}
            >
              <Switch name="KANBAN" text="Quadro Kanban" />
              <Switch name="LISTA" text="Lista (Tabela)" />
            </ContentSwitcher>
            <Button kind="tertiary" renderIcon={Renew} onClick={() => void recarregar()} disabled={loading}>
              Atualizar
            </Button>
          </>
        }
      />

      <FeedbackBar feedback={fb} onClose={() => setFb(null)} />
      {erro ? <p style={{ color: "var(--cds-support-error)" }}>{erro}</p> : null}

      {visao === "KANBAN" ? (
        <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
          <div style={{ display: "flex", gap: "0.75rem", overflowX: "auto", paddingBottom: "1rem" }}>
            {COLUNAS_SUPORTE.map((col) => (
              <DroppableSuporteColuna
                key={col.id}
                col={col}
                tickets={tickets.filter((t) => t.status === col.id)}
                onSelectTicket={(t) => setSelecionadoId(t.id)}
              />
            ))}
          </div>
          <DragOverlay>
            {draggingTicket ? <TicketCardContent ticket={draggingTicket} onOpen={() => undefined} /> : null}
          </DragOverlay>
        </DndContext>
      ) : (
        <AdminTable
          titulo={`${tickets.length} chamado(s) de suporte`}
          colunas={[
            { key: "protocolo", header: "Protocolo" },
            { key: "cliente", header: "Solicitante" },
            { key: "assunto", header: "Assunto" },
            { key: "urgencia", header: "Urgência" },
            { key: "status", header: "Status" },
            { key: "atualizado", header: "Atualização" },
            { key: "acoes", header: "" },
          ]}
          vazio={loading ? "Carregando..." : "Nenhum chamado registrado."}
          linhas={tickets.map((t) => {
            const colCfg = COLUNAS_SUPORTE.find((c) => c.id === t.status);
            return {
              id: t.id,
              protocolo: <Tag type="purple">{t.protocolo}</Tag>,
              cliente: (
                <div>
                  <strong>{t.autorNome}</strong>
                  <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)" }}>
                    {t.autorEmail || "—"} {t.autorTelefone ? `• ${t.autorTelefone}` : ""}
                  </div>
                </div>
              ),
              assunto: (
                <div>
                  <strong>{t.assunto}</strong>
                  <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)" }}>{t.categoria}</div>
                </div>
              ),
              urgencia: <Tag type={getUrgenciaTagType(t.urgencia)}>{t.urgencia}</Tag>,
              status: <Tag type={colCfg?.tagType || "gray"}>{colCfg?.label || t.status}</Tag>,
              atualizado: fmtData(t.atualizadoEm),
              acoes: (
                <Button
                  size="sm"
                  kind="primary"
                  data-testid={`btn-atender-ticket-${t.id}`}
                  renderIcon={Chat}
                  onClick={() => setSelecionadoId(t.id)}
                >
                  Atender
                </Button>
              ),
            };
          })}
        />
      )}

      <Modal
        open={ticketAtual !== null}
        modalHeading={ticketAtual ? `${ticketAtual.protocolo} — ${ticketAtual.assunto}` : ""}
        passiveModal
        size="lg"
        onRequestClose={() => setSelecionadoId(null)}
      >
        {ticketAtual ? (
          <div style={{ display: "grid", gap: "1rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem", alignItems: "center" }}>
              <div>
                <strong>{ticketAtual.autorNome}</strong> ({ticketAtual.autorEmail || "sem e-mail"} • {ticketAtual.autorTelefone || "sem tel"})
                {ticketAtual.tenantId ? (
                  <span style={{ marginLeft: "0.75rem" }}>
                    <Link href={`/admin/clientes/${ticketAtual.tenantId}`}>Abrir Cliente 360º</Link>
                  </span>
                ) : null}
              </div>
              <Select
                id="sup-status-select"
                labelText="Status do chamado"
                inline
                value={ticketAtual.status}
                onChange={(e) => void alterarStatus(ticketAtual.id, e.target.value as SupportTicketStatus)}
              >
                {COLUNAS_SUPORTE.map((c) => (
                  <SelectItem key={c.id} value={c.id} text={c.label} />
                ))}
              </Select>
            </div>

            <div style={{ maxHeight: "260px", overflowY: "auto", display: "grid", gap: "0.5rem", padding: "0.5rem", border: "1px solid var(--cds-border-subtle-01)" }}>
              {ticketAtual.mensagens.map((m) => (
                <Tile
                  key={m.id}
                  style={{
                    backgroundColor: m.autorTipo === "SUPORTE" ? "var(--cds-layer-selected-01)" : "var(--cds-layer-01)",
                    padding: "0.65rem",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", marginBottom: "0.25rem" }}>
                    <strong>
                      {m.autorNome} <Tag size="sm" type={m.autorTipo === "SUPORTE" ? "blue" : "gray"}>{m.autorTipo}</Tag>
                    </strong>
                    <span style={{ color: "var(--cds-text-secondary)" }}>{fmtData(m.criadoEm)}</span>
                  </div>
                  <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{m.mensagem}</p>
                </Tile>
              ))}
            </div>

            {/* Select de Macros Rápidas (Item 9.b) */}
            <Select
              id="select-macro-suporte"
              data-testid="select-macro-suporte"
              labelText="Mensagens rápidas (Macros)"
              value=""
              onChange={(e) => {
                const val = e.target.value;
                const m = MACROS_RESPOSTA.find((item) => item.id === val);
                if (m) {
                  setResposta(m.texto);
                }
              }}
            >
              <SelectItem value="" text="Selecione uma resposta rápida pronta (Macro)..." />
              {MACROS_RESPOSTA.map((m) => (
                <SelectItem key={m.id} value={m.id} text={m.label} />
              ))}
            </Select>

            <TextArea
              id="sup-resp-txt"
              labelText="Responder ao cliente (notifica por e-mail e WhatsApp se configurado)"
              value={resposta}
              onChange={(e) => setResposta(e.target.value)}
              rows={3}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
              <Button kind="secondary" onClick={() => void alterarStatus(ticketAtual.id, "CONCLUIDO")}>
                Concluir chamado
              </Button>
              <Button renderIcon={SendAlt} disabled={!resposta.trim()} onClick={() => void enviarResposta()}>
                Enviar resposta
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

