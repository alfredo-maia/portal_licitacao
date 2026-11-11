"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Grid,
  Column,
  Tile,
  DataTable,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  TableContainer,
  Tag,
  Button,
  Modal,
  InlineNotification,
  ProgressBar,
} from "@carbon/react";
import {
  Renew,
  Add,
  SendAlt,
  CheckmarkOutline,
  Enterprise,
  CloudUpload,
  Analytics,
} from "@carbon/icons-react";
import { SuperAdminMetrics, SuperAdminTenantItem } from "@/server/schemas/superadmin.schema";
import { EngajamentoTag, KpiGrid, KpiTile, fmtBRL, fmtDia, fmtNum } from "./admin-ui";

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
  const [expandingTenant, setExpandingTenant] = useState<string | null>(null);

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

  const handleExpandQuota = async (tenantId: string, adicionarMb: number) => {
    setExpandingTenant(tenantId);
    setFeedback(null);
    try {
      const res = await fetch("/api/admin/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, adicionarMb }),
      });
      const data = await res.json();
      if (res.ok) {
        setFeedback(data.mensagem || `Cota expandida com sucesso em +${adicionarMb} MB.`);
        carregarDados();
      } else {
        setFeedback(`Erro ao expandir cota: ${data.error || "Falha na solicitação."}`);
      }
    } catch (err: unknown) {
      setFeedback(
        `Erro na requisição: ${err instanceof Error ? err.message : "Erro inesperado"}`,
      );
    } finally {
      setExpandingTenant(null);
    }
  };

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

  const headers = [
    { key: "razaoSocial", header: "Empresa / CNPJ" },
    { key: "plano", header: "Plano" },
    { key: "billingStatus", header: "Status Faturamento" },
    { key: "espaco", header: "Espaço R2 (Cofre)" },
    { key: "volumeArrematado", header: "Volume Ganho (R$)" },
    { key: "acoes", header: "Expansão de Cota (1 Clique)" },
  ];

  const rows = tenants.map((t) => ({
    id: t.id,
    razaoSocial: (
      <div>
        <div style={{ fontWeight: 600 }}>{t.razaoSocial}</div>
        <div style={{ fontSize: "0.8rem", color: "var(--cds-text-secondary)" }}>{t.cnpj}</div>
      </div>
    ),
    plano: <Tag type="blue">{t.plano}</Tag>,
    billingStatus: (
      <Tag
        type={
          t.billingStatus === "ATIVO"
            ? "green"
            : t.billingStatus === "TRIAL"
            ? "cyan"
            : t.billingStatus === "GRACE_PERIOD"
            ? "warm-gray"
            : "red"
        }
      >
        {t.billingStatus}
        {t.billingStatus === "TRIAL" ? ` (${t.diasRestantesTrial}d)` : ""}
        {t.billingStatus === "GRACE_PERIOD" ? ` (${t.diasAtraso}d atraso)` : ""}
      </Tag>
    ),
    espaco: (
      <div style={{ minWidth: "140px" }}>
        <div style={{ fontSize: "0.8rem", marginBottom: "4px" }}>
          {t.espacoUsadoMb} MB de {t.cotaTotalMb} MB ({t.percentualUsado}%)
        </div>
        <ProgressBar
          label="Uso de espaço R2"
          value={t.percentualUsado}
          max={100}
          status={t.percentualUsado >= 90 ? "error" : "active"}
          hideLabel
        />
      </div>
    ),
    volumeArrematado: (
      <div>
        <div style={{ fontWeight: 600, color: "var(--cds-support-success)" }}>
          {t.volumeArrematado.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
        </div>
        <div style={{ fontSize: "0.8rem", color: "var(--cds-text-secondary)" }}>
          {t.totalContempladas} pregão(ões) arrematado(s)
        </div>
      </div>
    ),
    acoes: (
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <Button
          size="sm"
          kind="tertiary"
          renderIcon={Add}
          disabled={expandingTenant === t.id}
          onClick={() => handleExpandQuota(t.id, 1024)}
        >
          +1 GB
        </Button>
        <Button
          size="sm"
          kind="secondary"
          renderIcon={Add}
          disabled={expandingTenant === t.id}
          onClick={() => handleExpandQuota(t.id, 2048)}
        >
          +2 GB
        </Button>
      </div>
    ),
  }));

  return (
    <div style={{ padding: "2rem", maxWidth: "1600px", margin: "0 auto" }}>
      <div style={{ marginBottom: "2rem" }}>
        <h1 style={{ fontSize: "2rem", fontWeight: 700, marginBottom: "0.5rem" }}>
          Portal Administrativo (SuperAdmin)
        </h1>
        <p style={{ color: "var(--cds-text-secondary)" }}>
          Backoffice Executivo — Gestão consolidada de empresas, faturamento Asaas, cotas Cloudflare R2 e WhatsApp anti-ban.
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
            <div style={{ color: "var(--cds-text-secondary)", fontSize: "0.875rem", marginBottom: "0.5rem" }}>
              MRR ESTIMADO (MENSAL)
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
            <div style={{ color: "var(--cds-text-secondary)", fontSize: "0.875rem", marginBottom: "0.5rem" }}>
              ARMAZENAMENTO R2 (STREAMING)
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

      {/* PULSO EXECUTIVO ESTENDIDO (Issue #49) */}
      <KpiGrid>
        <KpiTile
          rotulo="ARR ESTIMADO (ANUAL)"
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
          detalhe={`${fmtNum(metrics?.trialsEngajados)} engajados • ${fmtNum(metrics?.trialsAbandonados)} cadastraram e saíram`}
        />
        <KpiTile
          rotulo="INADIMPLENTES / CARÊNCIA"
          valor={`${fmtNum(metrics?.tenantsBloqueados)} / ${fmtNum(metrics?.tenantsGracePeriod)}`}
          detalhe={`${fmtNum(metrics?.tenantsCancelados)} cancelado(s)`}
          cor="var(--cds-support-error)"
        />
        <KpiTile
          rotulo="GASTO DE IA (HOJE)"
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

      {/* RADAR DE TRIAL: clientes em teste grátis e nível de configuração */}
      {tenants.some((t) => t.billingStatus === "TRIAL") && (
        <Tile style={{ marginBottom: "1.5rem" }}>
          <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.75rem" }}>
            Radar de Teste Grátis
          </h3>
          {tenants
            .filter((t) => t.billingStatus === "TRIAL")
            .slice(0, 8)
            .map((t) => (
              <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.4rem 0", borderTop: "1px solid var(--cds-border-subtle-01)" }}>
                <Link href={`/admin/clientes/${t.id}`}>{t.nomeFantasia || t.razaoSocial}</Link>
                <span style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
                  <span style={{ fontSize: "0.8rem" }}>{t.onboarding?.score ?? 0}/7 marcos • {t.diasRestantesTrial}d restantes</span>
                  <EngajamentoTag status={t.onboarding?.statusEngajamento} />
                </span>
              </div>
            ))}
        </Tile>
      )}

      {/* TABELA DE GESTÃO DE TENANTS */}
      <DataTable rows={rows} headers={headers}>
        {({ rows, headers, getTableProps, getHeaderProps, getRowProps }) => (
          <TableContainer
            title="Clientes & Assinaturas (Multi-Tenant)"
            description="Controle de cotas de armazenamento por CNPJ, dias restantes de trial e expansão imediata de espaço."
          >
            <Table {...getTableProps()}>
              <TableHead>
                <TableRow>
                  {headers.map((header) => (
                    <TableHeader {...getHeaderProps({ header })} key={header.key}>
                      {header.header}
                    </TableHeader>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row) => (
                  <TableRow {...getRowProps({ row })} key={row.id}>
                    {row.cells.map((cell) => (
                      <TableCell key={cell.id}>{cell.value}</TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DataTable>
    </div>
  );
}
