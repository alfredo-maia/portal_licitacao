"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Button,
  Column,
  Grid,
  InlineLoading,
  InlineNotification,
  Select,
  SelectItem,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tag,
  Tile,
} from "@carbon/react";
import {
  Launch,
  Locked,
  Pause,
  Play,
  Settings,
  Renew,
  Flash,
} from "@carbon/icons-react";
import { ModulePageShell } from "@/components/shell/module-page-shell";
import { SalaSimuladaModal } from "@/components/robo-lances/sala-simulada-modal";
import type { DisputaItemRegra } from "@/server/schemas/proposta-calculadora.schema";

interface SalaDisputaTenant {
  id: string;
  titulo: string;
  orgao: string;
  uf: string;
  numeroEdital: string;
  portal: string;
  identificadorSala: string;
  modoDisputaEdital?: "ABERTO" | "ABERTO_FECHADO" | "FECHADO_ABERTO";
  intervaloMinimoLances?: string;
  statusGeral: "CONFIGURADA" | "EM_DISPUTA" | "PAUSADA" | "CONCLUIDA";
  pausaEmergencia: boolean;
  tempoRespostaSegundos: number;
  segundosFinaisSniper: number;
  totalItens: number;
  itensAtivosNoRobo: number;
  pisoSeguroTotal: number;
  propostaInicialTotal: number;
  regrasItens: DisputaItemRegra[];
  dataAbertura?: string | null;
  statusKanban: string;
  atualizadoEm?: string | null;
}

function formatBRL(valor: number): string {
  return (valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export default function RoboDeLancesPage() {
  const [feedback, setFeedback] = useState<{
    kind: "success" | "warning" | "error";
    text: string;
  } | null>(null);

  // Estado das Salas Configuradas do Tenant e Preferência Sandbox
  const [salas, setSalas] = useState<SalaDisputaTenant[]>([]);
  const [carregandoSalas, setCarregandoSalas] = useState(true);
  const [erroCarregarSalas, setErroCarregarSalas] = useState<string | null>(null);
  const [preferenciaMe, setPreferenciaMe] = useState("ATIVO");

  // Estado da Sala Simulada (Sandbox)
  const [modalSimuladorAberto, setModalSimuladorAberto] = useState(false);
  const [salaSimuladaAlvo, setSalaSimuladaAlvo] = useState<SalaDisputaTenant | null>(null);
  const [planoTenant, setPlanoTenant] = useState<"BASICO" | "PRO" | "ENTERPRISE">("PRO");

  const carregarSalasDisputa = useCallback(async () => {
    setCarregandoSalas(true);
    setErroCarregarSalas(null);
    try {
      const res = await fetch("/api/robo-de-lances/salas", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok && Array.isArray(data.salas)) {
        setSalas(data.salas);
        if (data.plano) {
          setPlanoTenant(data.plano);
        }
      } else {
        setSalas([]);
        setErroCarregarSalas(
          data?.error || "Não foi possível carregar as salas de disputa da empresa.",
        );
      }
    } catch {
      setSalas([]);
      setErroCarregarSalas(
        "Falha de conexão ao carregar as salas de disputa da empresa.",
      );
    } finally {
      setCarregandoSalas(false);
    }
  }, []);

  useEffect(() => {
    carregarSalasDisputa();
    const onTenantChange = () => {
      carregarSalasDisputa();
    };
    window.addEventListener("tenant-changed", onTenantChange);
    return () => window.removeEventListener("tenant-changed", onTenantChange);
  }, [carregarSalasDisputa]);

  const handleAlternarPausaEmergencia = async (sala: SalaDisputaTenant) => {
    try {
      const acao = sala.pausaEmergencia ? "RETOMAR_DISPUTA" : "PAUSAR_EMERGENCIA";
      const res = await fetch("/api/robo-de-lances/salas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          licitacaoId: sala.id,
          acao,
        }),
      });

      if (!res.ok) {
        throw new Error("Falha ao alterar estado da disputa.");
      }

      setSalas((prev) =>
        prev.map((s) =>
          s.id === sala.id
            ? {
                ...s,
                pausaEmergencia: !sala.pausaEmergencia,
                statusGeral: !sala.pausaEmergencia ? "PAUSADA" : "EM_DISPUTA",
              }
            : s,
        ),
      );

      setFeedback({
        kind: !sala.pausaEmergencia ? "warning" : "success",
        text: !sala.pausaEmergencia
          ? `Disputa do certame ${sala.numeroEdital} pausada preventivamente.`
          : `Disputa do certame ${sala.numeroEdital} retomada com sucesso.`,
      });
    } catch (err: unknown) {
      setFeedback({
        kind: "error",
        text: err instanceof Error ? err.message : "Erro ao atualizar estado da disputa.",
      });
    }
  };

  const totalItensAtivosGeral = salas.reduce((acc, s) => acc + (s.itensAtivosNoRobo || 0), 0);
  const pisoSeguroTotalGeral = salas.reduce((acc, s) => acc + (s.pisoSeguroTotal || 0), 0);

  return (
    <ModulePageShell
      title="Robô de Lances"
      badge="Em breve • Sandbox"
      subtitle="Central de preparação estratégica das licitações com regras de disputa configuradas na aba ⚡ Disputa, proteção do Piso Seguro calculado e Simulador de Disputa em ambiente Sandbox isolado."
    >
      {feedback && (
        <InlineNotification
          style={{ marginBottom: "1rem" }}
          kind={feedback.kind}
          title={feedback.kind === "success" ? "Operação Concluída" : "Aviso de Disputa"}
          subtitle={feedback.text}
          onCloseButtonClick={() => setFeedback(null)}
        />
      )}

      <InlineNotification
        data-testid="robo-lances-sandbox-aviso"
        style={{ marginBottom: "1rem" }}
        kind="info"
        lowContrast
        hideCloseButton
        title="Ambiente de Preparação & Simulação (Sandbox Isolado):"
        subtitle="O disparo automático ao vivo dentro dos portais externos (Compras.gov.br, Compras Públicas, Licitar Digital, BBMNet) ainda não está conectado. Utilize este painel para acompanhar salas configuradas, proteger seus pisos mínimos e testar táticas no Simulador antes da sessão oficial."
      />

      <Tile style={{ padding: "1.5rem", marginTop: "1rem" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: "1.25rem",
            flexWrap: "wrap",
            gap: "1rem",
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: "1.25rem" }}>
              Painel Central de Disputas &amp; Preparação de Lances
            </h2>
            <p
              style={{
                margin: "0.25rem 0 0 0",
                fontSize: "0.875rem",
                color: "var(--cds-text-secondary)",
              }}
            >
              Centraliza as licitações com regras na aba ⚡ Disputa (ou em status Em Disputa), mantendo trava matemática contra inexequibilidade (Art. 59 da Lei 14.133/2021).
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
            <Button
              size="sm"
              kind="secondary"
              renderIcon={Flash}
              onClick={() => {
                setSalaSimuladaAlvo(null);
                setModalSimuladorAberto(true);
              }}
              data-testid="btn-abrir-sala-simulada"
            >
              🎮 Simular Disputa (Sandbox)
            </Button>
            <Button
              size="sm"
              kind="ghost"
              renderIcon={Renew}
              onClick={carregarSalasDisputa}
              disabled={carregandoSalas}
            >
              {carregandoSalas ? "Atualizando..." : "Atualizar Salas"}
            </Button>
          </div>
        </div>

        {/* Métricas do Robô */}
        <Grid style={{ padding: 0, marginBottom: "1.5rem" }}>
          <Column lg={3} md={2} sm={4} style={{ marginBottom: "1rem" }}>
            <Tile style={{ padding: "1rem", borderLeft: "4px solid var(--cds-interactive, #0f62fe)", height: "100%" }}>
              <div style={{ fontSize: "0.8rem", color: "var(--cds-text-secondary)" }}>Salas Configuradas / Disputa</div>
              <div style={{ fontSize: "1.6rem", fontWeight: 700, marginTop: "0.25rem" }}>
                {salas.length} Certame(s)
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--cds-support-success, #24a148)", marginTop: "0.25rem" }}>
                {salas.filter((s) => s.statusGeral === "EM_DISPUTA").length} em disputa ativa
              </div>
            </Tile>
          </Column>

          <Column lg={3} md={2} sm={4} style={{ marginBottom: "1rem" }}>
            <Tile style={{ padding: "1rem", borderLeft: "4px solid var(--cds-support-success, #24a148)", height: "100%" }}>
              <div style={{ fontSize: "0.8rem", color: "var(--cds-text-secondary)" }}>Itens com Robô Ativo</div>
              <div style={{ fontSize: "1.6rem", fontWeight: 700, color: "var(--cds-support-success, #24a148)", marginTop: "0.25rem" }}>
                {totalItensAtivosGeral} Item(ns)
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)", marginTop: "0.25rem" }}>
                Regras de lances multi-item
              </div>
            </Tile>
          </Column>

          <Column lg={3} md={2} sm={4} style={{ marginBottom: "1rem" }}>
            <Tile style={{ padding: "1rem", borderLeft: "4px solid var(--cds-support-info, #0043ce)", height: "100%" }}>
              <div style={{ fontSize: "0.8rem", color: "var(--cds-text-secondary)" }}>Piso Seguro Total Protegido</div>
              <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--cds-support-info, #0043ce)", marginTop: "0.25rem", display: "flex", alignItems: "center", gap: "0.35rem" }}>
                <Locked size={18} />
                {formatBRL(pisoSeguroTotalGeral)}
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)", marginTop: "0.25rem" }}>
                Pisos calculados via Aba Calculadora
              </div>
            </Tile>
          </Column>

          <Column lg={3} md={2} sm={4} style={{ marginBottom: "1rem" }}>
            <Tile style={{ padding: "1rem", borderLeft: "4px solid var(--cds-support-warning, #f1c21b)", height: "100%" }}>
              <div style={{ fontSize: "0.8rem", color: "var(--cds-text-secondary)" }}>Proteção de Piso Seguro</div>
              <div style={{ fontSize: "1.6rem", fontWeight: 700, color: "var(--cds-support-warning, #f1c21b)", marginTop: "0.25rem" }}>
                100% Inviolável
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)", marginTop: "0.25rem" }}>
                Bloqueio automático contra inexequibilidade
              </div>
            </Tile>
          </Column>
        </Grid>

        {/* Tabela ou Lista de Salas de Disputa Ativas */}
        <div style={{ marginBottom: "1.5rem" }}>
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
            <h4 style={{ fontSize: "1rem", fontWeight: 600, margin: 0 }}>
              ⚡ Salas de Disputa Configuradas ({salas.length})
            </h4>
            <div style={{ fontSize: "0.8rem", color: "var(--cds-text-secondary)" }}>
              Para configurar novos itens e pisos, acesse a aba ⚡ Disputa no Dossiê da Licitação.
            </div>
          </div>

          {carregandoSalas && salas.length === 0 ? (
            <div style={{ padding: "2rem", textAlign: "center" }} data-testid="salas-loading-state">
              <InlineLoading status="active" description="Carregando salas de disputa da empresa..." />
            </div>
          ) : erroCarregarSalas ? (
            <div data-testid="salas-error-state" style={{ padding: "1rem 0" }}>
              <InlineNotification
                kind="error"
                lowContrast
                hideCloseButton
                title="Erro ao carregar salas de disputa:"
                subtitle={erroCarregarSalas}
                style={{ marginBottom: "0.75rem" }}
              />
              <Button kind="tertiary" size="sm" renderIcon={Renew} onClick={carregarSalasDisputa}>
                Tentar novamente
              </Button>
            </div>
          ) : salas.length === 0 ? (
            <div
              data-testid="salas-empty-state"
              style={{
                padding: "2.5rem 1.5rem",
                textAlign: "center",
                border: "1px dashed var(--cds-border-subtle)",
                borderRadius: "4px",
                backgroundColor: "var(--cds-layer-02)",
              }}
            >
              <div style={{ fontSize: "1.8rem", marginBottom: "0.5rem" }}>⚡</div>
              <h4 style={{ fontSize: "1.05rem", fontWeight: 600, marginBottom: "0.35rem" }}>
                Nenhuma sala de disputa ativa ou configurada no momento.
              </h4>
              <p
                style={{
                  fontSize: "0.85rem",
                  color: "var(--cds-text-secondary)",
                  maxWidth: "520px",
                  margin: "0 auto 1.25rem auto",
                  lineHeight: 1.4,
                }}
              >
                Abra qualquer certame no Pipeline de Oportunidades, cadastre os itens e custos na aba 🧮 Calculadora e ative as regras do robô na aba ⚡ Disputa para monitoramento automático.
              </p>
              <Button kind="primary" size="sm" as={Link} href="/oportunidades">
                Ir para Oportunidades
              </Button>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <Table size="lg">
                <TableHead>
                  <TableRow>
                    <TableHeader>Certame & Órgão</TableHeader>
                    <TableHeader>Portal & Sala</TableHeader>
                    <TableHeader>Itens Ativos</TableHeader>
                    <TableHeader>Proposta Inicial</TableHeader>
                    <TableHeader>Piso Seguro 🔒</TableHeader>
                    <TableHeader>Status da Disputa</TableHeader>
                    <TableHeader>Ações</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {salas.map((sala) => (
                    <TableRow key={sala.id}>
                      <TableCell>
                        <strong style={{ fontSize: "0.9rem" }}>{sala.numeroEdital}</strong>
                        <div style={{ fontSize: "0.78rem", color: "var(--cds-text-secondary)" }}>
                          {sala.orgao} ({sala.uf})
                        </div>
                      </TableCell>

                      <TableCell>
                        <Tag type="cool-gray" size="sm">
                          {sala.portal}
                        </Tag>
                        {sala.modoDisputaEdital && (
                          <div style={{ fontSize: "0.72rem", color: "var(--cds-text-secondary)", marginTop: "0.2rem" }}>
                            {sala.modoDisputaEdital === "ABERTO_FECHADO"
                              ? "Modo: Aberto e Fechado"
                              : sala.modoDisputaEdital === "FECHADO_ABERTO"
                                ? "Modo: Fechado e Aberto"
                                : "Modo: Aberto"}
                          </div>
                        )}
                        {sala.identificadorSala && (
                          <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)", marginTop: "0.15rem" }}>
                            {sala.identificadorSala}
                          </div>
                        )}
                      </TableCell>

                      <TableCell>
                        <span style={{ fontWeight: 600 }}>
                          {sala.itensAtivosNoRobo} de {sala.totalItens} item(ns)
                        </span>
                      </TableCell>

                      <TableCell>{formatBRL(sala.propostaInicialTotal)}</TableCell>

                      <TableCell>
                        <strong
                          style={{
                            color: "var(--cds-support-success, #24a148)",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.3rem",
                          }}
                        >
                          <Locked size={14} />
                          {formatBRL(sala.pisoSeguroTotal)}
                        </strong>
                      </TableCell>

                      <TableCell>
                        <Tag
                          type={
                            sala.pausaEmergencia
                              ? "red"
                              : sala.statusGeral === "EM_DISPUTA"
                              ? "green"
                              : sala.statusGeral === "PAUSADA"
                              ? "warm-gray"
                              : sala.statusGeral === "CONCLUIDA"
                              ? "blue"
                              : "teal"
                          }
                          size="sm"
                        >
                          {sala.pausaEmergencia
                            ? "🛑 Pausa Emergência"
                            : sala.statusGeral === "EM_DISPUTA"
                            ? "● Em Disputa"
                            : sala.statusGeral === "PAUSADA"
                            ? "Pausada"
                            : sala.statusGeral === "CONCLUIDA"
                            ? "🏁 Concluída"
                            : "Configurada"}
                        </Tag>
                      </TableCell>

                      <TableCell>
                        <div style={{ display: "flex", gap: "0.5rem" }}>
                          <Button
                            kind="ghost"
                            size="sm"
                            hasIconOnly
                            renderIcon={Flash}
                            iconDescription="Simular disputa deste certame (Sandbox)"
                            onClick={() => {
                              setSalaSimuladaAlvo(sala);
                              setModalSimuladorAberto(true);
                            }}
                          />
                          <Button
                            kind={sala.pausaEmergencia ? "primary" : "ghost"}
                            size="sm"
                            hasIconOnly
                            renderIcon={sala.pausaEmergencia ? Play : Pause}
                            iconDescription={sala.pausaEmergencia ? "Retomar disputa" : "Pausar disputa"}
                            onClick={() => handleAlternarPausaEmergencia(sala)}
                          />
                          <Button
                            kind="tertiary"
                            size="sm"
                            renderIcon={Launch}
                            as={Link}
                            href={`/oportunidades/${sala.id}?tab=disputa`}
                          >
                            Abrir Sala
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        {/* Preferências do Simulador (Sandbox) */}
        <Tile style={{ padding: "1.25rem", backgroundColor: "var(--cds-layer-02)", borderRadius: "4px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
            <Settings size={18} />
            <h4 style={{ fontSize: "0.95rem", fontWeight: 600, margin: 0 }}>
              Preferências do Simulador (Sandbox)
            </h4>
          </div>
          <Grid style={{ padding: 0 }}>
            <Column lg={6} md={4} sm={4} style={{ marginBottom: "0.5rem" }}>
              <Select
                id="select-empate-me"
                labelText="Direito de Preferência ME/EPP (LC 123/2006)"
                value={preferenciaMe}
                onChange={(e) => setPreferenciaMe(e.target.value)}
              >
                <SelectItem value="ATIVO" text="Ativo: Habilitar lance de desempate (até 5%)" />
                <SelectItem value="DESATIVO" text="Desativado" />
              </Select>
            </Column>
            <Column lg={6} md={4} sm={4} style={{ display: "flex", alignItems: "center" }}>
              <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--cds-text-secondary)", lineHeight: 1.4 }}>
                As regras por item (Piso Seguro, Decremento, Tática Imediato/Sniper/Monitorar e Modo de Disputa do edital) são definidas diretamente na aba{" "}
                <strong>⚡ Disputa</strong> de cada oportunidade.
              </p>
            </Column>
          </Grid>
        </Tile>
      </Tile>

      {modalSimuladorAberto && (
        <SalaSimuladaModal
          open={modalSimuladorAberto}
          onRequestClose={() => {
            setModalSimuladorAberto(false);
            setSalaSimuladaAlvo(null);
          }}
          licitacaoInicial={salaSimuladaAlvo}
          planoTenant={planoTenant}
          preferenciaMeInicial={preferenciaMe === "ATIVO"}
          salasDisponiveis={salas.map((s) => ({
            id: s.id,
            numeroEdital: s.numeroEdital,
            orgao: s.orgao,
            portal: s.portal,
            modoDisputaEdital: s.modoDisputaEdital,
            intervaloMinimoLances: s.intervaloMinimoLances,
            pausaEmergencia: s.pausaEmergencia,
            tempoRespostaSegundos: s.tempoRespostaSegundos,
            segundosFinaisSniper: s.segundosFinaisSniper,
            regrasItens: s.regrasItens || [],
          }))}
        />
      )}
    </ModulePageShell>
  );
}
