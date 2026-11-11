"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Grid,
  Column,
  Tile,
  Tag,
  Button,
  InlineNotification,
} from "@carbon/react";
import { SendAlt } from "@carbon/icons-react";
import { SuperAdminMetrics, SuperAdminTenantItem } from "@/server/schemas/superadmin.schema";
import {
  AdminTable,
  EngajamentoTag,
  KpiGrid,
  KpiTile,
  SiglaInfoTooltip,
  fmtBRL,
  fmtDia,
  fmtNum,
} from "./admin-ui";

interface SuperAdminDashboardProps {
  initialMetrics?: SuperAdminMetrics;
  initialTenants?: SuperAdminTenantItem[];
}

export function SuperAdminDashboard({
  initialMetrics,
  initialTenants,
}: SuperAdminDashboardProps) {
  const [metrics, setMetrics] = useState<SuperAdminMetrics | null>(initialMetrics || null);
  const [tenants, setTenants] = useState<SuperAdminTenantItem[]>(initialTenants || []);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const carregarDados = async () => {
    setLoading(true);
    try {
      const [resMetrics, resTenants] = await Promise.all([
        fetch("/api/admin/metricas").then((r) => (r.ok ? r.json() : null)),
        fetch("/api/admin/tenants").then((r) => (r.ok ? r.json() : [])),
      ]);
      if (resMetrics) setMetrics(resMetrics);
      if (resTenants) setTenants(resTenants);
    } catch {
      // fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!initialMetrics || !initialTenants) {
      carregarDados();
    }
  }, []);

  const handleProcessarFilaWhatsApp = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "processar_fila", limite: 20 }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        processados?: unknown[];
        motivoBloqueio?: "FORA_DA_JANELA" | "LIMITE_DIARIO_ATINGIDO" | null;
        error?: string;
      };
      if (res.ok) {
        if (data.motivoBloqueio === "FORA_DA_JANELA") {
          setFeedback("Envio pausado: fora da janela permitida no horário de Brasília (BRT).");
        } else if (data.motivoBloqueio === "LIMITE_DIARIO_ATINGIDO") {
          setFeedback("Envio pausado: limite diário de warm-up atingido.");
        } else {
          setFeedback(
            `Fila processada com sucesso: ${data.processados?.length || 0} mensagens enviadas com jitter humano.`,
          );
          carregarDados();
        }
      } else {
        setFeedback(data.error || "Erro ao processar fila do WhatsApp.");
      }
    } catch {
      setFeedback("Erro ao processar fila do WhatsApp.");
    } finally {
      setLoading(false);
    }
  };

  const trialsRecentes = [...tenants]
    .filter((t) => t.billingStatus === "TRIAL")
    .sort((a, b) => new Date(b.criadoEm ?? 0).getTime() - new Date(a.criadoEm ?? 0).getTime())
    .slice(0, 10);

  return (
    <div style={{ padding: "2rem", maxWidth: "1600px", margin: "0 auto" }}>
      <div style={{ marginBottom: "2rem" }}>
        <h1 style={{ fontSize: "2rem", fontWeight: 700, marginBottom: "0.5rem" }}>
          Portal Administrativo (SuperAdmin)
        </h1>
        <p style={{ color: "var(--cds-text-secondary)" }}>
          Backoffice Executivo — Gestão consolidada de contas, faturamento Asaas, armazenamento Cloudflare R2 e WhatsApp anti-ban.
        </p>
      </div>

      {feedback && (
        <div style={{ marginBottom: "1.5rem" }}>
          <InlineNotification
            kind="info"
            title="Aviso do Sistema"
            subtitle={feedback}
            onCloseButtonClick={() => setFeedback(null)}
          />
        </div>
      )}

      {/* KPI TILES EXECUTIVOS */}
      <Grid fullWidth style={{ marginBottom: "2rem" }}>
        <Column sm={4} md={4} lg={3}>
          <Tile style={{ minHeight: "140px", backgroundColor: "var(--cds-layer-01)" }}>
            <div style={{ color: "var(--cds-text-secondary)", fontSize: "0.875rem", marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: "0.25rem" }}>
              <span>MRR ESTIMADO (MENSAL)</span>
              <SiglaInfoTooltip texto="MRR (Monthly Recurring Revenue): Receita Recorrente Mensal estimada das contas pagantes e em carência." />
            </div>
            <div style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--cds-support-success)" }}>
              {(metrics?.mrrEstimado || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
            </div>
            <div style={{ fontSize: "0.8rem", marginTop: "0.5rem", color: "var(--cds-text-secondary)" }}>
              {metrics?.tenantsAtivos || 0} cliente(s) pagante(s) ativo(s)
            </div>
          </Tile>
        </Column>

        <Column sm={4} md={4} lg={3}>
          <Tile style={{ minHeight: "140px", backgroundColor: "var(--cds-layer-01)" }}>
            <div style={{ color: "var(--cds-text-secondary)", fontSize: "0.875rem", marginBottom: "0.5rem" }}>
              VOLUME ARREMATADO
            </div>
            <div style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--cds-text-primary)" }}>
              {(metrics?.totalVolumeArrematado || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
            </div>
            <div style={{ fontSize: "0.8rem", marginTop: "0.5rem", color: "var(--cds-text-secondary)" }}>
              {metrics?.totalLicitacoesContempladas || 0} certames arrematados
            </div>
          </Tile>
        </Column>

        <Column sm={4} md={4} lg={3}>
          <Tile style={{ minHeight: "140px", backgroundColor: "var(--cds-layer-01)" }}>
            <div style={{ color: "var(--cds-text-secondary)", fontSize: "0.875rem", marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: "0.25rem" }}>
              <span>ARMAZENAMENTO R2 (STREAMING)</span>
              <SiglaInfoTooltip texto="R2 (Cloudflare R2): Armazenamento em nuvem de alta disponibilidade utilizado pelo Cofre de Documentos." />
            </div>
            <div style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--cds-text-primary)" }}>
              {metrics?.r2StorageTotalMb || 0} MB
            </div>
            <div style={{ fontSize: "0.8rem", marginTop: "0.5rem", color: "var(--cds-support-success)" }}>
              100% Zero-PDF na VPS (Hostinger NVMe)
            </div>
          </Tile>
        </Column>

        <Column sm={4} md={4} lg={3}>
          <Tile style={{ minHeight: "140px", backgroundColor: "var(--cds-layer-01)" }}>
            <div style={{ color: "var(--cds-text-secondary)", fontSize: "0.875rem", marginBottom: "0.5rem" }}>
              CONECTOR WHATSAPP (ANTI-BAN)
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.25rem" }}>
              <Tag type={metrics?.whatsappInstanciaConectada ? "green" : "red"}>
                {metrics?.whatsappInstanciaConectada ? "INSTÂNCIA ATIVA" : "DESCONECTADO"}
              </Tag>
              <span style={{ fontSize: "0.875rem", fontWeight: 600 }}>
                {metrics?.whatsappFilaPendentes || 0} na fila
              </span>
            </div>
            <div style={{ marginTop: "0.75rem" }}>
              <Button
                size="sm"
                kind="ghost"
                renderIcon={SendAlt}
                onClick={handleProcessarFilaWhatsApp}
                disabled={loading}
              >
                Disparar com Jitter
              </Button>
            </div>
          </Tile>
        </Column>
      </Grid>

      {/* PULSO EXECUTIVO ESTENDIDO (Issue #49 / #50) */}
      <KpiGrid>
        <KpiTile
          rotulo="ARR ESTIMADO (ANUAL)"
          infoTooltip="ARR (Annual Recurring Revenue): Projeção anualizada da receita recorrente (MRR x 12)."
          valor={fmtBRL(metrics?.arrEstimado)}
          detalhe={`Receita em risco: ${fmtBRL(metrics?.receitaEmRisco)}`}
          cor="var(--cds-support-success)"
        />
        <KpiTile
          rotulo="NOVOS CLIENTES"
          valor={`${fmtNum(metrics?.novosClientesHoje)} hoje`}
          detalhe={`${fmtNum(metrics?.novosClientes7d)} em 7 dias • ${fmtNum(metrics?.novosClientes30d)} em 30 dias`}
        />
        <KpiTile
          rotulo="TESTE GRÁTIS"
          valor={fmtNum(metrics?.tenantsTrial)}
          detalhe={`${fmtNum(metrics?.trialsEngajados)} engajados • ${fmtNum(metrics?.trialsAbandonados)} pendentes de configuração`}
        />
        <KpiTile
          rotulo="INADIMPLENTES / CARÊNCIA"
          valor={`${fmtNum(metrics?.tenantsBloqueados)} / ${fmtNum(metrics?.tenantsGracePeriod)}`}
          detalhe={`${fmtNum(metrics?.tenantsCancelados)} cancelado(s)`}
          cor="var(--cds-support-error)"
        />
        <KpiTile
          rotulo="GASTO DE IA (HOJE)"
          infoTooltip="IA (Inteligência Artificial): Custo estimado de tokens consumidos nas análises de editais realizadas hoje."
          valor={fmtBRL(metrics?.gastoIaHojeBrl)}
          detalhe={`${fmtNum(metrics?.tokensIaHoje)} tokens • ${fmtNum(metrics?.chamadasIaHoje)} chamadas • mês ${fmtBRL(metrics?.gastoIaMesBrl)}`}
        />
        <KpiTile
          rotulo="SUPORTE & AFILIADOS"
          valor={`${fmtNum(metrics?.ticketsAbertos)} ticket(s) abertos`}
          detalhe={`Comissões pendentes: ${fmtBRL(metrics?.comissoesPendentesBrl)}`}
        />
        <KpiTile
          rotulo="COLETA PNCP"
          infoTooltip="PNCP (Portal Nacional de Contratações Públicas): Situação da última rotina de coleta automática de licitações."
          valor={metrics?.ultimaColetaStatus || "SEM_EXECUCOES"}
          detalhe={`Última: ${metrics?.ultimaColetaEm ? new Date(metrics.ultimaColetaEm).toLocaleString("pt-BR") : "—"}`}
        />
      </KpiGrid>

      {(metrics?.ultimasVitorias?.length ?? 0) > 0 && (
        <Tile style={{ marginBottom: "1.5rem" }}>
          <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.75rem" }}>
            Vitórias recentes dos clientes (CONTEMPLADA)
          </h3>
          {metrics!.ultimasVitorias!.map((v) => (
            <div key={v.id} style={{ display: "flex", justifyContent: "space-between", padding: "0.4rem 0", borderTop: "1px solid var(--cds-border-subtle-01)" }}>
              <span>
                <strong>{v.razaoSocial}</strong> — {v.numeroEdital} ({v.orgaoNome})
              </span>
              <span style={{ color: "var(--cds-support-success)", fontWeight: 600 }}>
                {fmtBRL(v.valorArrematado)} • {fmtDia(v.data)}
              </span>
            </div>
          ))}
        </Tile>
      )}

      {/* RADAR DE TRIAL: últimos 10 clientes cadastrados em teste grátis */}
      <AdminTable
        titulo="Radar de Teste Grátis"
        descricao="Últimos 10 clientes cadastrados em período de teste grátis (agrupados pela conta principal)."
        colunas={[
          { key: "primeiroCnpj", header: "Primeiro CNPJ Cadastrado" },
          { key: "cliente", header: "Nome do Cliente" },
          { key: "marcos", header: "Marcos de Configuração" },
          { key: "diasRestantes", header: "Dias Restantes" },
          { key: "engajamento", header: "Engajamento / Configuração" },
        ]}
        vazio="Nenhum cliente em período de teste grátis no momento."
        linhas={trialsRecentes.map((t) => {
          const extras = Math.max(0, t.cnpjsAdicionaisCount ?? (t.qtdCnpjs ? t.qtdCnpjs - 1 : 0));
          return {
            id: t.id,
            primeiroCnpj: (
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
                  <Link href={`/admin/clientes/${t.id}`} style={{ fontWeight: 600 }}>
                    {t.nomeFantasia || t.razaoSocial}
                  </Link>
                  {extras > 0 ? (
                    <Tag type="cyan" size="sm">
                      +{extras} CNPJ(s)
                    </Tag>
                  ) : null}
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)" }}>{t.cnpj}</div>
              </div>
            ),
            cliente: (
              <div>
                <div>{t.titularNome || "—"}</div>
                <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)" }}>{t.titularEmail || "—"}</div>
              </div>
            ),
            marcos: `${t.onboarding?.score ?? 0}/7 marcos`,
            diasRestantes: `${t.diasRestantesTrial}d restantes`,
            engajamento: (
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                <EngajamentoTag status={t.onboarding?.statusEngajamento} />
                <Link href={`/admin/clientes/${t.id}`} style={{ fontSize: "0.8rem" }}>
                  Abrir 360º
                </Link>
              </div>
            ),
          };
        })}
      />
    </div>
  );
}
