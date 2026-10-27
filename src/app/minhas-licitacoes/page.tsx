"use client";

import React from "react";
import Link from "next/link";
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
} from "@dnd-kit/core";
import {
  Tag,
  Tile,
  Button,
  Modal,
  TextInput,
  Select,
  SelectItem,
  Toggle,
  InlineLoading,
  InlineNotification,
} from "@carbon/react";
import {
  WarningAlt,
  Launch,
  TrashCan,
  Events,
  Money,
  CheckmarkOutline,
} from "@carbon/icons-react";
import { ModulePageShell } from "@/components/shell/module-page-shell";
import { sintetizarMiniResumo } from "@/lib/resumo-licitacao";

interface LicitacaoItem {
  id: string;
  numeroEdital: string;
  orgaoNome: string;
  uf: string;
  miniResumo: string;
  resumo: string;
  valorEstimado: number;
  dataAbertura: string;
  dataEncerramentoProposta?: string | null;
  status: string;
  tipoSistemaCodigo?: string;
  motivoPerda?: string | null;
  responsavel?: { id: string; name: string } | null;
  atribuidos?: Array<{ usuario: { id: string; name: string } }>;
  isPresencial?: boolean;
  distanciaGoianiaKm?: number | null;
  objeto?: string | null;
}

const COLUNAS_ATIVAS = [
  { id: "ACEITA", label: "Participar (Aceita)", tagType: "blue" as const },
  { id: "ANALISE_TECNICA", label: "Análise Técnica", tagType: "cyan" as const },
  { id: "ANALISE_FINANCEIRA", label: "Análise Financeira", tagType: "teal" as const },
  { id: "REVISAO_PROPOSTA", label: "Revisão da Proposta", tagType: "purple" as const },
  { id: "ENVIADA", label: "Enviada", tagType: "magenta" as const },
  { id: "EM_DISPUTA", label: "Em Disputa / Lances", tagType: "high-contrast" as const },
  { id: "AGUARDANDO_RESULTADO", label: "Aguardando Resultado", tagType: "warm-gray" as const },
  { id: "CONTEMPLADA", label: "Contemplada 🏆", tagType: "green" as const },
  { id: "IMPUGNADA", label: "Impugnada ⚖️", tagType: "red" as const },
];

const COLUNAS_ARQUIVADAS = [
  { id: "NAO_CONTEMPLADA_PRECO", label: "Perda por Preço", tagType: "red" as const },
  { id: "NAO_CONTEMPLADA_DOCUMENTACAO", label: "Perda por Documentação", tagType: "red" as const },
  { id: "NAO_CONTEMPLADA_DESISTENCIA", label: "Desistência Operacional", tagType: "cool-gray" as const },
  { id: "REVOGADA_ANULADA", label: "Revogada / Anulada", tagType: "gray" as const },
];

const STATUS_PERDA = [
  "NAO_CONTEMPLADA_PRECO",
  "NAO_CONTEMPLADA_DOCUMENTACAO",
  "NAO_CONTEMPLADA_DESISTENCIA",
  "REVOGADA_ANULADA",
];

function isAberturaUrgente(dataAberturaStr: string): boolean {
  try {
    const abertura = new Date(dataAberturaStr).getTime();
    const agora = new Date().getTime();
    const diffHoras = (abertura - agora) / (1000 * 60 * 60);
    return diffHoras >= 0 && diffHoras <= 72;
  } catch {
    return false;
  }
}

function formatarMoeda(valor: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(valor || 0);
}

function KanbanCardContent({
  lic,
  onMarcarPerda,
  isDragOverlay = false,
}: {
  lic: LicitacaoItem;
  onMarcarPerda?: (lic: LicitacaoItem) => void;
  isDragOverlay?: boolean;
}) {
  const dataPrazo = lic.dataEncerramentoProposta || lic.dataAbertura;
  const urgente = isAberturaUrgente(dataPrazo);
  const dataFormatada = new Date(dataPrazo).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <Tile
      style={{
        padding: "0.875rem",
        borderRadius: "4px",
        backgroundColor: "var(--cds-layer)",
        border: urgente ? "1px solid var(--cds-support-error)" : "1px solid var(--cds-border-subtle)",
        boxShadow: isDragOverlay ? "0 8px 16px rgba(0,0,0,0.3)" : "none",
      }}
      data-testid={`kanban-card-${lic.id}`}
    >
      {/* 1. Nome do Órgão — Objeto da licitação */}
      <div style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "0.5rem", lineHeight: 1.3 }}>
        <Link
          href={`/oportunidades/${lic.id}?origem=/minhas-licitacoes`}
          style={{ color: "var(--cds-text-primary)", textDecoration: "none" }}
          onClick={(e) => e.stopPropagation()}
        >
          {lic.orgaoNome} — {sintetizarMiniResumo(lic.miniResumo || lic.objeto || lic.resumo, lic.tipoSistemaCodigo)}
        </Link>
      </div>

      {/* 2. Tipo de Sistema */}
      {lic.tipoSistemaCodigo && (
        <div style={{ marginBottom: "0.5rem" }}>
          <Tag size="sm" type="cool-gray" style={{ margin: 0 }}>
            {lic.tipoSistemaCodigo}
          </Tag>
        </div>
      )}

      {/* 3. Valor */}
      <div style={{ marginBottom: "0.5rem" }}>
        <span
          style={{
            fontFamily: "var(--cds-code-01-font-family, 'IBM Plex Mono', monospace)",
            fontSize: "0.9375rem",
            fontWeight: 600,
            color: "var(--cds-text-primary)",
          }}
          data-testid="kanban-card-valor"
        >
          {formatarMoeda(lic.valorEstimado)}
        </span>
      </div>

      {/* 4. Nome Responsável Coordenador */}
      {lic.responsavel && (
        <div style={{ fontSize: "0.8125rem", color: "var(--cds-text-secondary)", marginBottom: "0.5rem" }}>
          Coordenador: <strong style={{ color: "var(--cds-text-primary)" }}>{lic.responsavel.name}</strong>
        </div>
      )}

      {/* 5. Data e hora de abertura da sessão / prazo fatal de envio de proposta */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.5rem" }}>
        <Tag size="sm" type={urgente ? "red" : "cool-gray"} renderIcon={urgente ? WarningAlt : Events}>
          Prazo: {dataFormatada}
        </Tag>

        {/* 6. Se for presencial, Informar o numero de distancia em KM de Goiania. Ex: 344 KM */}
        {lic.isPresencial && (
          <Tag size="sm" type="blue">
            {lic.distanciaGoianiaKm ? `${lic.distanciaGoianiaKm} KM` : "Presencial"}
          </Tag>
        )}
      </div>

      {/* 7. Botão Abrir Projeto */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--cds-border-subtle)", paddingTop: "0.5rem", marginTop: "0.5rem" }}>
        <Link
          href={`/oportunidades/${lic.id}?origem=/minhas-licitacoes`}
          style={{
            fontSize: "0.8125rem",
            fontWeight: 600,
            display: "inline-flex",
            alignItems: "center",
            gap: "0.35rem",
            color: "var(--cds-link-primary)",
            textDecoration: "none",
            padding: "0.25rem 0.5rem",
            backgroundColor: "var(--cds-layer-01)",
            borderRadius: "3px",
            border: "1px solid var(--cds-border-subtle)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          Abrir Projeto <Launch size={14} />
        </Link>
        {onMarcarPerda && !STATUS_PERDA.includes(lic.status) && (
          <Button
            size="sm"
            kind="ghost"
            hasIconOnly
            renderIcon={TrashCan}
            iconDescription="Registrar Perda / Desistência"
            onClick={(e) => {
              e.stopPropagation();
              onMarcarPerda(lic);
            }}
          />
        )}
      </div>
    </Tile>
  );
}

function DraggableCard({
  lic,
  onMarcarPerda,
}: {
  lic: LicitacaoItem;
  onMarcarPerda: (lic: LicitacaoItem) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: lic.id,
    data: { lic },
  });

  const style: React.CSSProperties = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0.3 : 1,
    cursor: "grab",
    marginBottom: "0.75rem",
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <KanbanCardContent lic={lic} onMarcarPerda={onMarcarPerda} />
    </div>
  );
}

function KanbanColumn({
  coluna,
  licitacoes,
  onMarcarPerda,
}: {
  coluna: { id: string; label: string; tagType: any };
  licitacoes: LicitacaoItem[];
  onMarcarPerda: (lic: LicitacaoItem) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: coluna.id,
  });

  const totalValor = licitacoes.reduce((acc, l) => acc + (l.valorEstimado || 0), 0);

  return (
    <div
      ref={setNodeRef}
      data-testid={`kanban-column-${coluna.id}`}
      style={{
        flex: "0 0 310px",
        display: "flex",
        flexDirection: "column",
        backgroundColor: isOver ? "var(--cds-layer-hover)" : "var(--cds-layer-01)",
        border: "1px solid var(--cds-border-subtle)",
        borderRadius: "4px",
        padding: "0.75rem",
        minHeight: "560px",
        transition: "background-color 0.15s ease",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
        <strong style={{ fontSize: "0.875rem" }}>{coluna.label}</strong>
        <Tag size="sm" type={coluna.tagType}>
          {licitacoes.length}
        </Tag>
      </div>

      <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)", marginBottom: "0.75rem" }}>
        Total:{" "}
        <span style={{ fontFamily: "var(--cds-code-01-font-family, 'IBM Plex Mono', monospace)" }}>
          {formatarMoeda(totalValor)}
        </span>
      </div>

      <div style={{ flex: 1, overflowY: "auto", minHeight: "150px" }}>
        {licitacoes.map((lic) => (
          <DraggableCard key={lic.id} lic={lic} onMarcarPerda={onMarcarPerda} />
        ))}
      </div>
    </div>
  );
}

export default function MinhasLicitacoesPage() {
  const [licitacoes, setLicitacoes] = React.useState<LicitacaoItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [exibirArquivadas, setExibirArquivadas] = React.useState(false);
  const [activeItem, setActiveItem] = React.useState<LicitacaoItem | null>(null);

  // Modal de Motivo de Perda
  const [modalPerdaOpen, setModalPerdaOpen] = React.useState(false);
  const [itemParaPerda, setItemParaPerda] = React.useState<LicitacaoItem | null>(null);
  const [targetPerdaStatus, setTargetPerdaStatus] = React.useState<string>("NAO_CONTEMPLADA_PRECO");
  const [motivoPerdaInput, setMotivoPerdaInput] = React.useState<string>("");

  // Modal de Contemplada / Valor Arrematado (PRD §4.3 & ADR 0004)
  const [modalContempladaOpen, setModalContempladaOpen] = React.useState(false);
  const [itemParaContemplada, setItemParaContemplada] = React.useState<LicitacaoItem | null>(null);
  const [valorArrematadoInput, setValorArrematadoInput] = React.useState<string>("");

  const [salvandoStatus, setSalvandoStatus] = React.useState(false);
  const [feedbackMsg, setFeedbackMsg] = React.useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
  );

  const carregarLicitacoes = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/oportunidades?status=TODOS&pageSize=100");
      if (!response.ok) {
        throw new Error("Erro ao carregar certames do funil");
      }
      const data = await response.json();
      setLicitacoes(data.oportunidades || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    carregarLicitacoes();
  }, [carregarLicitacoes]);

  const handleDragStart = (event: DragStartEvent) => {
    const item = licitacoes.find((l) => l.id === event.active.id);
    if (item) setActiveItem(item);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveItem(null);

    if (!over) return;
    const item = licitacoes.find((l) => l.id === active.id);
    if (!item) return;

    const newStatus = String(over.id);
    if (item.status === newStatus) return;

    // Se o status de destino for CONTEMPLADA, solicita valor arrematado (ADR 0004 §2.5)
    if (newStatus === "CONTEMPLADA") {
      setItemParaContemplada(item);
      setValorArrematadoInput(item.valorEstimado ? String(item.valorEstimado) : "");
      setModalContempladaOpen(true);
      return;
    }

    // Se o status de destino for de perda, exige modal de justificativa
    if (STATUS_PERDA.includes(newStatus)) {
      setItemParaPerda(item);
      setTargetPerdaStatus(newStatus);
      setMotivoPerdaInput("");
      setModalPerdaOpen(true);
      return;
    }

    // Atualização otimista
    const prevLicitacoes = [...licitacoes];
    setLicitacoes((prev) =>
      prev.map((l) => (l.id === item.id ? { ...l, status: newStatus } : l)),
    );

    try {
      const res = await fetch(`/api/oportunidades/${item.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || "Erro ao mover status");
      }
      setFeedbackMsg(`Licitação movida para '${newStatus}' com sucesso.`);
      setTimeout(() => setFeedbackMsg(null), 3500);
    } catch (err) {
      setLicitacoes(prevLicitacoes);
      alert(err instanceof Error ? err.message : "Erro ao atualizar status");
    }
  };

  const confirmarContemplada = async () => {
    if (!itemParaContemplada) return;

    const valorNum = valorArrematadoInput ? parseFloat(valorArrematadoInput.replace(/\./g, "").replace(",", ".")) : undefined;

    setSalvandoStatus(true);
    try {
      const res = await fetch(`/api/oportunidades/${itemParaContemplada.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "CONTEMPLADA",
          ...(valorNum !== undefined && !isNaN(valorNum) ? { valorArrematado: valorNum } : {}),
        }),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || "Erro ao homologar como contemplada");
      }

      setLicitacoes((prev) =>
        prev.map((l) =>
          l.id === itemParaContemplada.id
            ? { ...l, status: "CONTEMPLADA" }
            : l,
        ),
      );
      setModalContempladaOpen(false);
      setItemParaContemplada(null);
      setFeedbackMsg("Certame homologado como CONTEMPLADA com sucesso! 🏆");
      setTimeout(() => setFeedbackMsg(null), 3500);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erro ao homologar como contemplada");
    } finally {
      setSalvandoStatus(false);
    }
  };

  const confirmarPerda = async () => {
    if (!itemParaPerda) return;
    if (!motivoPerdaInput.trim()) {
      alert("É obrigatório informar uma justificativa para a perda ou desistência.");
      return;
    }

    setSalvandoStatus(true);
    try {
      const res = await fetch(`/api/oportunidades/${itemParaPerda.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: targetPerdaStatus,
          motivoPerda: motivoPerdaInput.trim(),
        }),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || "Erro ao registrar perda");
      }

      setLicitacoes((prev) =>
        prev.map((l) =>
          l.id === itemParaPerda.id
            ? { ...l, status: targetPerdaStatus, motivoPerda: motivoPerdaInput.trim() }
            : l,
        ),
      );
      setModalPerdaOpen(false);
      setItemParaPerda(null);
      setFeedbackMsg("Status de perda/desistência registrado com sucesso.");
      setTimeout(() => setFeedbackMsg(null), 3500);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erro ao registrar perda");
    } finally {
      setSalvandoStatus(false);
    }
  };

  const licitacoesFiltradas = licitacoes.filter((l) => {
    if (l.status === "PENDENTE" || l.status === "RECUSADA") return false;
    if (!exibirArquivadas && STATUS_PERDA.includes(l.status)) return false;
    return true;
  });

  const totalAtivas = licitacoes.filter((l) =>
    COLUNAS_ATIVAS.some((c) => c.id === l.status),
  );
  const totalValorAtivas = totalAtivas.reduce(
    (acc, l) => acc + (l.valorEstimado || 0),
    0,
  );
  const urgentesCount = totalAtivas.filter((l) =>
    isAberturaUrgente(l.dataAbertura),
  ).length;

  return (
    <ModulePageShell routePath="/minhas-licitacoes">
      <div style={{ marginBottom: "1rem" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "1rem",
            marginBottom: "0.75rem",
          }}
        >
          <div>
            <h1 style={{ fontSize: "1.5rem", fontWeight: 600, margin: 0 }}>
              Minhas Licitações
            </h1>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <Toggle
              id="toggle-arquivadas"
              data-testid="toggle-arquivadas"
              labelText="Exibir arquivadas / não contempladas"
              labelA="Ocultar"
              labelB="Exibir"
              toggled={exibirArquivadas}
              onToggle={(toggled) => setExibirArquivadas(toggled)}
            />
          </div>
        </div>

        {/* Painel de Métricas do Funil */}
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginBottom: "1rem" }}>
          <Tile style={{ padding: "0.75rem 1rem", minWidth: "160px" }}>
            <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)" }}>Licitações Ativas</div>
            <div style={{ fontSize: "1.25rem", fontWeight: 600 }}>{totalAtivas.length}</div>
          </Tile>
          <Tile style={{ padding: "0.75rem 1rem", minWidth: "220px" }}>
            <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)" }}>Valor em Disputa</div>
            <div
              style={{
                fontSize: "1.25rem",
                fontWeight: 600,
                fontFamily: "var(--cds-code-01-font-family, 'IBM Plex Mono', monospace)",
                color: "var(--cds-support-success)",
              }}
            >
              {formatarMoeda(totalValorAtivas)}
            </div>
          </Tile>
          {urgentesCount > 0 && (
            <Tile style={{ padding: "0.75rem 1rem", minWidth: "180px", borderLeft: "4px solid var(--cds-support-error)" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--cds-support-error)", fontWeight: 600 }}>
                Abertura &lt; 72 Horas
              </div>
              <div style={{ fontSize: "1.25rem", fontWeight: 600, color: "var(--cds-support-error)" }}>
                {urgentesCount} certame{urgentesCount > 1 ? "s" : ""}
              </div>
            </Tile>
          )}
        </div>

        {feedbackMsg && (
          <div style={{ marginBottom: "1rem" }}>
            <InlineNotification
              kind="success"
              title="Operação realizada:"
              subtitle={feedbackMsg}
              hideCloseButton
            />
          </div>
        )}

        {loading && <p>Carregando funil kanban...</p>}
        {error && <p style={{ color: "red" }}>Erro: {error}</p>}
      </div>

      {!loading && !error && (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div
            data-testid="kanban-board-container"
            style={{
              display: "flex",
              gap: "1rem",
              overflowX: "auto",
              paddingBottom: "1.5rem",
            }}
          >
            {COLUNAS_ATIVAS.map((col) => (
              <KanbanColumn
                key={col.id}
                coluna={col}
                licitacoes={licitacoesFiltradas.filter((l) => l.status === col.id)}
                onMarcarPerda={(lic) => {
                  setItemParaPerda(lic);
                  setTargetPerdaStatus("NAO_CONTEMPLADA_PRECO");
                  setMotivoPerdaInput("");
                  setModalPerdaOpen(true);
                }}
              />
            ))}

            {exibirArquivadas &&
              COLUNAS_ARQUIVADAS.map((col) => (
                <KanbanColumn
                  key={col.id}
                  coluna={col}
                  licitacoes={licitacoesFiltradas.filter((l) => l.status === col.id)}
                  onMarcarPerda={() => {}}
                />
              ))}
          </div>

          <DragOverlay>
            {activeItem ? <KanbanCardContent lic={activeItem} isDragOverlay /> : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* Modal Obrigatório de Motivo de Perda / Desistência (PRD §4.3) */}
      <Modal
        open={modalPerdaOpen}
        modalHeading="Registrar Perda ou Desistência de Certame"
        primaryButtonText={salvandoStatus ? "Salvando..." : "Confirmar e Gravar"}
        secondaryButtonText="Cancelar"
        onRequestClose={() => {
          if (!salvandoStatus) {
            setModalPerdaOpen(false);
            setItemParaPerda(null);
          }
        }}
        onRequestSubmit={confirmarPerda}
        primaryButtonDisabled={salvandoStatus || !motivoPerdaInput.trim()}
        data-testid="modal-motivo-perda"
      >
        <p style={{ marginBottom: "1rem", fontSize: "0.875rem" }}>
          Ao registrar o desfecho negativo para a oportunidade{" "}
          <strong>{itemParaPerda?.numeroEdital || itemParaPerda?.id}</strong>, é mandatório
          fornecer a justificativa oficial para fins de auditoria e governança (PRD §4.3).
        </p>

        <Select
          id="select-tipo-perda"
          labelText="Tipo de Desfecho"
          value={targetPerdaStatus}
          onChange={(e) => setTargetPerdaStatus(e.target.value)}
          style={{ marginBottom: "1rem" }}
          data-testid="select-tipo-perda"
        >
          <SelectItem value="NAO_CONTEMPLADA_PRECO" text="Não Contemplada: Preço Acima da Margem" />
          <SelectItem value="NAO_CONTEMPLADA_DOCUMENTACAO" text="Não Contemplada: Inabilitação / Documentação" />
          <SelectItem value="NAO_CONTEMPLADA_DESISTENCIA" text="Desistência Estratégica da Diretoria" />
          <SelectItem value="REVOGADA_ANULADA" text="Certame Revogado / Anulado pelo Órgão" />
        </Select>

        <TextInput
          id="input-motivo-perda"
          data-testid="input-motivo-perda"
          labelText="Justificativa Oficial Detalhada *"
          placeholder="Ex: Concorrente ofertou lance 40% abaixo da nossa margem operacional mínima."
          value={motivoPerdaInput}
          onChange={(e) => setMotivoPerdaInput(e.target.value)}
          invalid={modalPerdaOpen && !motivoPerdaInput.trim()}
          invalidText="A justificativa é obrigatória para este desfecho."
        />
      </Modal>

      {/* Modal de Homologação / Contemplada com Valor Arrematado (ADR 0004 §2.5) */}
      <Modal
        open={modalContempladaOpen}
        modalHeading="Homologar Vitória no Certame (Contemplada 🏆)"
        primaryButtonText={salvandoStatus ? "Registrando..." : "Confirmar Vitória"}
        secondaryButtonText="Cancelar"
        onRequestClose={() => {
          if (!salvandoStatus) {
            setModalContempladaOpen(false);
            setItemParaContemplada(null);
          }
        }}
        onRequestSubmit={confirmarContemplada}
        primaryButtonDisabled={salvandoStatus}
        data-testid="modal-contemplada"
      >
        <p style={{ marginBottom: "1rem", fontSize: "0.875rem" }}>
          Parabéns pela vitória! Confirme a homologação da oportunidade{" "}
          <strong>{itemParaContemplada?.numeroEdital || itemParaContemplada?.id}</strong>{" "}
          ({itemParaContemplada?.orgaoNome}).
        </p>

        <div style={{ marginBottom: "1rem", backgroundColor: "var(--cds-layer-01)", padding: "0.75rem", borderRadius: "4px" }}>
          <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)" }}>Valor Estimado do Edital</div>
          <div style={{ fontSize: "1rem", fontWeight: 600 }}>
            {formatarMoeda(itemParaContemplada?.valorEstimado || 0)}
          </div>
        </div>

        <TextInput
          id="input-valor-arrematado"
          data-testid="input-valor-arrematado"
          labelText="Valor Final Arrematado / Homologado (R$)"
          helperText="Informe o valor final arrematado em lances ou mantenha o valor estimado."
          placeholder="Ex: 1450000.00"
          value={valorArrematadoInput}
          onChange={(e) => setValorArrematadoInput(e.target.value)}
        />
      </Modal>
    </ModulePageShell>
  );
}
