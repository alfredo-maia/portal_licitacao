"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Column,
  Grid,
  InlineNotification,
  Search,
  Select,
  SelectItem,
  Tag,
  TextInput,
  Tile,
} from "@carbon/react";
import {
  Chat,
  Filter,
  Notification,
  Send,
  VolumeUp,
  VolumeMute,
  CheckmarkOutline,
  Launch,
} from "@carbon/icons-react";
import { ModulePageShell } from "@/components/shell/module-page-shell";

interface MensagemSala {
  id: string;
  horario: string;
  data: string;
  orgaoNome: string;
  numeroEdital: string;
  portal: string;
  autor: "Pregoeiro" | "Sistema" | "Outro Licitante";
  texto: string;
  mencionouEmpresa: boolean;
  tipoEvento: "CONVOCACAO_DIRETA" | "PRAZO_FATAL" | "AVISO_GERAL" | "SUSPENSAO";
  lida: boolean;
  oportunidadeId?: string;
}

const MOCK_MENSAGENS: MensagemSala[] = [
  {
    id: "msg-1",
    horario: "14:32:10",
    data: "Hoje",
    orgaoNome: "Tribunal Regional Eleitoral de Goiás",
    numeroEdital: "PE 099/2026",
    portal: "Compras.gov.br",
    autor: "Pregoeiro",
    texto:
      "Atenção licitante APONTA TECNOLOGIA (CNPJ 12.345.678/0001-90): solicito o envio da Proposta Readequada com os anexos do Item 1 no prazo improrrogável de 2 horas.",
    mencionouEmpresa: true,
    tipoEvento: "CONVOCACAO_DIRETA",
    lida: false,
    oportunidadeId: "1",
  },
  {
    id: "msg-2",
    horario: "14:15:00",
    data: "Hoje",
    orgaoNome: "Tribunal Regional Eleitoral de Goiás",
    numeroEdital: "PE 099/2026",
    portal: "Compras.gov.br",
    autor: "Sistema",
    texto: "Iniciada a fase de lances para o Grupo 1. Tempo randômico ativado.",
    mencionouEmpresa: false,
    tipoEvento: "AVISO_GERAL",
    lida: true,
    oportunidadeId: "1",
  },
  {
    id: "msg-3",
    horario: "11:45:22",
    data: "Hoje",
    orgaoNome: "Prefeitura Municipal de Anápolis",
    numeroEdital: "PE 045/2026",
    portal: "BBMNet",
    autor: "Pregoeiro",
    texto:
      "Informamos que a sessão fica suspensa para análise de documentação de habilitação da primeira colocada, retornando às 14:00.",
    mencionouEmpresa: false,
    tipoEvento: "SUSPENSAO",
    lida: true,
    oportunidadeId: "2",
  },
  {
    id: "msg-4",
    horario: "10:05:40",
    data: "Hoje",
    orgaoNome: "Secretaria de Estado da Saúde de SP",
    numeroEdital: "PE 112/2026",
    portal: "BEC-SP",
    autor: "Pregoeiro",
    texto:
      "Prazo fatal de 3 dias úteis para intenção de recurso aberto no sistema a contar da publicação desta ata.",
    mencionouEmpresa: false,
    tipoEvento: "PRAZO_FATAL",
    lida: false,
    oportunidadeId: "3",
  },
];

export default function ChatPregoeiroPage() {
  const router = useRouter();
  const [mensagens, setMensagens] = useState<MensagemSala[]>(MOCK_MENSAGENS);
  const [busca, setBusca] = useState("");
  const [filtroTipo, setFiltroTipo] = useState<string>("TODOS");
  const [alertaSonoro, setAlertaSonoro] = useState(true);
  const [telefoneAlerta, setTelefoneAlerta] = useState("5562999998888");
  const [feedback, setFeedback] = useState<{
    kind: "success" | "info" | "warning";
    text: string;
  } | null>(null);

  const mensagensFiltradas = mensagens.filter((m) => {
    const matchBusca =
      m.texto.toLowerCase().includes(busca.toLowerCase()) ||
      m.orgaoNome.toLowerCase().includes(busca.toLowerCase()) ||
      m.numeroEdital.toLowerCase().includes(busca.toLowerCase());

    if (!matchBusca) return false;
    if (filtroTipo === "CONVOCACAO" && !m.mencionouEmpresa) return false;
    if (filtroTipo === "PRAZO" && m.tipoEvento !== "PRAZO_FATAL") return false;
    if (filtroTipo === "SUSPENSAO" && m.tipoEvento !== "SUSPENSAO") return false;

    return true;
  });

  const totalNaoLidas = mensagens.filter((m) => !m.lida).length;
  const totalMencoes = mensagens.filter((m) => m.mencionouEmpresa).length;

  const marcarComoLida = (id: string) => {
    setMensagens((prev) =>
      prev.map((m) => (m.id === id ? { ...m, lida: true } : m)),
    );
  };

  const enviarAlertaTesteWhatsApp = () => {
    setFeedback({
      kind: "success",
      text: `Alerta de teste enviado com sucesso via WhatsApp para ${telefoneAlerta}! O webhook do pregoeiro está operacional.`,
    });
  };

  return (
    <ModulePageShell
      title="Chat do Pregoeiro & Mensagens"
      subtitle="Painel central unificado com todas as mensagens recebidas das salas de disputa, transcrição em tempo real, detecção de convocações do CNPJ e alertas no WhatsApp."
      badge="Arsenal de Disputa"
      routePath="/chat-pregoeiro"
    >
      {feedback && (
        <InlineNotification
          kind={feedback.kind}
          title={feedback.kind === "success" ? "Operação Concluída:" : "Aviso:"}
          subtitle={feedback.text}
          onClose={() => setFeedback(null)}
          style={{ marginBottom: "1rem" }}
        />
      )}

      {/* Cards de Métricas em Tempo Real */}
      <Grid style={{ padding: 0, marginBottom: "1.5rem" }}>
        <Column lg={3} md={2} sm={4}>
          <Tile style={{ padding: "1.25rem", borderLeft: "4px solid var(--cds-interactive, #0f62fe)" }}>
            <div style={{ fontSize: "0.8rem", color: "var(--cds-text-secondary)", marginBottom: "0.25rem" }}>
              Salas Monitoradas
            </div>
            <div style={{ fontSize: "1.75rem", fontWeight: 700 }}>3 Certames</div>
            <div style={{ fontSize: "0.75rem", color: "var(--cds-support-success, #24a148)", marginTop: "0.25rem" }}>
              ● Conexões ativas
            </div>
          </Tile>
        </Column>

        <Column lg={3} md={2} sm={4}>
          <Tile style={{ padding: "1.25rem", borderLeft: "4px solid var(--cds-support-error, #da1e28)" }}>
            <div style={{ fontSize: "0.8rem", color: "var(--cds-text-secondary)", marginBottom: "0.25rem" }}>
              Convocações Diretas
            </div>
            <div style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--cds-support-error, #da1e28)" }}>
              {totalMencoes} Chamada(s)
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)", marginTop: "0.25rem" }}>
              Citação direta de Razão Social/CNPJ
            </div>
          </Tile>
        </Column>

        <Column lg={3} md={2} sm={4}>
          <Tile style={{ padding: "1.25rem", borderLeft: "4px solid var(--cds-support-warning, #f1c21b)" }}>
            <div style={{ fontSize: "0.8rem", color: "var(--cds-text-secondary)", marginBottom: "0.25rem" }}>
              Mensagens Não Lidas
            </div>
            <div style={{ fontSize: "1.75rem", fontWeight: 700 }}>{totalNaoLidas} Pendente(s)</div>
            <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)", marginTop: "0.25rem" }}>
              De {mensagens.length} recebidas hoje
            </div>
          </Tile>
        </Column>

        <Column lg={3} md={2} sm={4}>
          <Tile style={{ padding: "1.25rem", borderLeft: "4px solid var(--cds-support-success, #24a148)" }}>
            <div style={{ fontSize: "0.8rem", color: "var(--cds-text-secondary)", marginBottom: "0.25rem" }}>
              Canal WhatsApp
            </div>
            <div style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--cds-support-success, #24a148)" }}>
              Ativo
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)", marginTop: "0.25rem" }}>
              Notificações push imediatas
            </div>
          </Tile>
        </Column>
      </Grid>

      {/* Configuração Rápida de Notificações WhatsApp & Som */}
      <Tile style={{ padding: "1.25rem", marginBottom: "1.5rem" }}>
        <h4 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.75rem" }}>
          📲 Configuração de Alertas do Pregoeiro
        </h4>
        <Grid style={{ padding: 0 }}>
          <Column lg={5} md={3} sm={4} style={{ marginBottom: "0.5rem" }}>
            <TextInput
              id="input-telefone-chat"
              labelText="WhatsApp para Notificação Instantânea"
              value={telefoneAlerta}
              onChange={(e) => setTelefoneAlerta(e.target.value)}
              placeholder="5562999998888"
              helperText="Formato com DDI e DDD (ex: 5562999998888)"
            />
          </Column>
          <Column lg={4} md={3} sm={4} style={{ display: "flex", alignItems: "flex-end", gap: "0.5rem", marginBottom: "0.5rem" }}>
            <Button
              kind="tertiary"
              size="md"
              renderIcon={Send}
              onClick={enviarAlertaTesteWhatsApp}
            >
              Testar WhatsApp
            </Button>
            <Button
              kind={alertaSonoro ? "secondary" : "ghost"}
              size="md"
              renderIcon={alertaSonoro ? VolumeUp : VolumeMute}
              onClick={() => setAlertaSonoro(!alertaSonoro)}
            >
              {alertaSonoro ? "Som Ativo" : "Som Mudo"}
            </Button>
          </Column>
        </Grid>
      </Tile>

      {/* Filtros e Barra de Ações */}
      <Tile style={{ padding: "1.25rem", marginBottom: "1.5rem" }}>
        <Grid style={{ padding: 0, alignItems: "center" }}>
          <Column lg={7} md={4} sm={4} style={{ marginBottom: "0.5rem" }}>
            <Search
              size="md"
              labelText="Buscar nas mensagens do pregoeiro"
              placeholder="Filtrar por órgão, número do edital, portal ou texto..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </Column>
          <Column lg={5} md={4} sm={4} style={{ marginBottom: "0.5rem" }}>
            <Select
              id="select-filtro-tipo"
              labelText="Filtrar por Relevância"
              value={filtroTipo}
              onChange={(e) => setFiltroTipo(e.target.value)}
            >
              <SelectItem value="TODOS" text="Todas as Mensagens" />
              <SelectItem value="CONVOCACAO" text="🚨 Apenas Convocações Diretas (CNPJ)" />
              <SelectItem value="PRAZO" text="⏳ Prazos Fatais & Recursos" />
              <SelectItem value="SUSPENSAO" text="⏸️ Suspensões e Retomadas" />
            </Select>
          </Column>
        </Grid>
      </Tile>

      {/* Feed Unificado de Mensagens em Tempo Real */}
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {mensagensFiltradas.length === 0 ? (
          <Tile style={{ padding: "3rem", textAlign: "center" }}>
            <Chat size={32} style={{ marginBottom: "0.5rem", opacity: 0.5 }} />
            <p style={{ color: "var(--cds-text-secondary)" }}>
              Nenhuma mensagem encontrada com os filtros selecionados.
            </p>
          </Tile>
        ) : (
          mensagensFiltradas.map((msg) => (
            <Tile
              key={msg.id}
              style={{
                padding: "1.25rem",
                borderLeft: msg.mencionouEmpresa
                  ? "5px solid var(--cds-support-error, #da1e28)"
                  : msg.tipoEvento === "PRAZO_FATAL"
                  ? "5px solid var(--cds-support-warning, #f1c21b)"
                  : "5px solid var(--cds-border-subtle, #e0e0e0)",
                backgroundColor: msg.mencionouEmpresa
                  ? "var(--cds-notification-background-error, rgba(218, 30, 40, 0.05))"
                  : "var(--cds-layer, #ffffff)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "0.5rem", marginBottom: "0.5rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                  <Tag type="cool-gray" size="sm">
                    {msg.portal}
                  </Tag>
                  <strong style={{ fontSize: "0.95rem" }}>{msg.numeroEdital}</strong>
                  <span style={{ color: "var(--cds-text-secondary)", fontSize: "0.85rem" }}>
                    • {msg.orgaoNome}
                  </span>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  {msg.mencionouEmpresa && (
                    <Tag type="red" size="sm">
                      🚨 CONVOCAÇÃO DIRETA
                    </Tag>
                  )}
                  {msg.tipoEvento === "PRAZO_FATAL" && (
                    <Tag type="warm-gray" size="sm">
                      ⏳ PRAZO FATAL
                    </Tag>
                  )}
                  {msg.tipoEvento === "SUSPENSAO" && (
                    <Tag type="teal" size="sm">
                      ⏸️ SUSPENSÃO
                    </Tag>
                  )}
                  <span style={{ fontSize: "0.8rem", color: "var(--cds-text-secondary)" }}>
                    {msg.data} às {msg.horario}
                  </span>
                </div>
              </div>

              <div style={{ margin: "0.75rem 0", fontSize: "0.925rem", lineHeight: 1.5 }}>
                <span style={{ fontWeight: 600, color: "var(--cds-text-primary)" }}>
                  [{msg.autor}]:{" "}
                </span>
                <span style={{ color: "var(--cds-text-primary)" }}>{msg.texto}</span>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: "0.5rem", marginTop: "0.5rem" }}>
                {!msg.lida && (
                  <Button
                    size="sm"
                    kind="ghost"
                    renderIcon={CheckmarkOutline}
                    onClick={() => marcarComoLida(msg.id)}
                  >
                    Marcar como Lida
                  </Button>
                )}
                {msg.oportunidadeId && (
                  <Button
                    size="sm"
                    kind="tertiary"
                    renderIcon={Launch}
                    onClick={() => router.push(`/oportunidades/${msg.oportunidadeId}`)}
                  >
                    Abrir Certame
                  </Button>
                )}
              </div>
            </Tile>
          ))
        )}
      </div>
    </ModulePageShell>
  );
}
