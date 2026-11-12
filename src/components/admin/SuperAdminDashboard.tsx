"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Grid,
  Column,
  Tile,
  Tag,
  Button,
  Select,
  SelectItem,
  InlineNotification,
} from "@carbon/react";
import { Renew } from "@carbon/icons-react";
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
  metrics?: SuperAdminMetrics;
  tenants?: SuperAdminTenantItem[];
}

const MESES_ANO = [
  { value: "1", label: "Janeiro" },
  { value: "2", label: "Fevereiro" },
  { value: "3", label: "Março" },
  { value: "4", label: "Abril" },
  { value: "5", label: "Maio" },
  { value: "6", label: "Junho" },
  { value: "7", label: "Julho" },
  { value: "8", label: "Agosto" },
  { value: "9", label: "Setembro" },
  { value: "10", label: "Outubro" },
  { value: "11", label: "Novembro" },
  { value: "12", label: "Dezembro" },
];

export function SuperAdminDashboard({
  initialMetrics,
  initialTenants,
  metrics: propMetrics,
  tenants: propTenants,
}: SuperAdminDashboardProps) {
  let router: any = null;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    router = useRouter();
  } catch {
    router = null;
  }
  const navegarPara = (url: string) => {
    if (router && typeof router.push === "function") {
      router.push(url);
    } else if (typeof window !== "undefined") {
      window.location.href = url;
    }
  };
  const seedMetrics = initialMetrics ?? propMetrics ?? null;
  const seedTenants = initialTenants ?? propTenants ?? [];
  const hoje = new Date();
  const [mes, setMes] = useState<string>(
    String(seedMetrics?.periodoMes ?? hoje.getMonth() + 1),
  );
  const [ano, setAno] = useState<string>(
    String(seedMetrics?.periodoAno ?? hoje.getFullYear()),
  );
  const [metrics, setMetrics] = useState<SuperAdminMetrics | null>(seedMetrics);
  const [tenants, setTenants] = useState<SuperAdminTenantItem[]>(seedTenants);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const anoBase = hoje.getFullYear();
  const anosDisponiveis = Array.from(
    new Set([anoBase - 2, anoBase - 1, anoBase, anoBase + 1, Number(ano)].filter(Boolean)),
  ).sort((a, b) => a - b);

  const carregarDados = async (mesParam = mes, anoParam = ano) => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ mes: mesParam, ano: anoParam }).toString();
      const [resMetrics, resTenants] = await Promise.all([
        fetch(`/api/admin/metricas?${qs}`).then((r) => (r.ok ? r.json() : null)),
        fetch("/api/admin/tenants").then((r) => (r.ok ? r.json() : [])),
      ]);
      if (resMetrics) setMetrics(resMetrics);
      if (Array.isArray(resTenants)) setTenants(resTenants);
    } catch {
      // fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!seedMetrics || (!initialTenants && !propTenants)) {
      void carregarDados();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const trialsRecentes = [...tenants]
    .filter((t) => t.billingStatus === "TRIAL")
    .sort((a, b) => new Date(b.criadoEm ?? 0).getTime() - new Date(a.criadoEm ?? 0).getTime())
    .slice(0, 10);

  return (
    <div style={{ padding: "2rem", maxWidth: "1600px", margin: "0 auto" }}>
      <div
        style={{
          marginBottom: "2rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          gap: "1rem",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 style={{ fontSize: "2rem", fontWeight: 700, marginBottom: "0.5rem" }}>
            Portal Administrativo (SuperAdmin)
          </h1>
          <p style={{ color: "var(--cds-text-secondary)" }}>
            Backoffice Executivo — Gestão consolidada de contas, faturamento Asaas, armazenamento Cloudflare R2 e WhatsApp anti-ban.
          </p>
        </div>

        <div
          data-testid="dashboard-periodo-filtro"
          style={{ display: "flex", alignItems: "flex-end", gap: "0.5rem", flexWrap: "wrap" }}
        >
          <div style={{ minWidth: "9rem" }}>
            <Select
              id="dash-mes"
              size="sm"
              labelText="Mês"
              value={mes}
              onChange={(e) => setMes(e.target.value)}
            >
              {MESES_ANO.map((m) => (
                <SelectItem key={m.value} value={m.value} text={m.label} />
              ))}
            </Select>
          </div>
          <div style={{ minWidth: "6.5rem" }}>
            <Select
              id="dash-ano"
              size="sm"
              labelText="Ano"
              value={ano}
              onChange={(e) => setAno(e.target.value)}
            >
              {anosDisponiveis.map((y) => (
                <SelectItem key={y} value={String(y)} text={String(y)} />
              ))}
            </Select>
          </div>
          <Button
            size="sm"
            kind="tertiary"
            renderIcon={Renew}
            disabled={loading}
            onClick={() => void carregarDados(mes, ano)}
          >
            Atualizar
          </Button>
        </div>
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

      {/* 4 KPIS PRINCIPAIS — RETÂNGULOS SEPARADOS E CLICÁVEIS (SIMILAR AO PORTAL DO CLIENTE) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: "1rem",
          marginBottom: "1.5rem",
        }}
      >
        <Tile
          data-testid="admin-kpi-card-mrr"
          role="link"
          tabIndex={0}
          onClick={() => navegarPara("/admin/financeiro")}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              navegarPara("/admin/financeiro");
            }
          }}
          style={{
            minHeight: "140px",
            backgroundColor: "var(--cds-layer-01)",
            border: "1px solid var(--cds-border-subtle)",
            cursor: "pointer",
            height: "100%",
          }}
        >
          <div
            style={{
              color: "var(--cds-text-secondary)",
              fontSize: "0.875rem",
              fontWeight: 600,
              marginBottom: "0.5rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "0.25rem",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <span
              onClick={() => navegarPara("/admin/financeiro")}
              style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}
            >
              <span>MRR ESTIMADO (MENSAL)</span>
              <SiglaInfoTooltip texto="MRR (Monthly Recurring Revenue): Receita Recorrente Mensal estimada das contas pagantes e em carência." />
            </span>
            <Tag type="green" size="sm" className="pncp-mono">
              Financeiro
            </Tag>
          </div>
          <div style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--cds-support-success)" }}>
            {(metrics?.mrrEstimado || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
          </div>
          <div style={{ fontSize: "0.8rem", marginTop: "0.5rem", color: "var(--cds-text-secondary)" }}>
            {metrics?.tenantsAtivos || 0} cliente(s) pagante(s) ativo(s)
          </div>
        </Tile>

        <Tile
          data-testid="admin-kpi-card-volume"
          role="link"
          tabIndex={0}
          onClick={() => navegarPara("/admin/licitacoes")}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              navegarPara("/admin/licitacoes");
            }
          }}
          style={{
            minHeight: "140px",
            backgroundColor: "var(--cds-layer-01)",
            border: "1px solid var(--cds-border-subtle)",
            cursor: "pointer",
            height: "100%",
          }}
        >
          <div
            style={{
              color: "var(--cds-text-secondary)",
              fontSize: "0.875rem",
              fontWeight: 600,
              marginBottom: "0.5rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "0.25rem",
            }}
          >
            <span>VOLUME ARREMATADO MENSAL</span>
            <Tag type="blue" size="sm" className="pncp-mono">
              Licitações
            </Tag>
          </div>
          <div style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--cds-text-primary)" }}>
            {(metrics?.totalVolumeArrematado || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
          </div>
          <div style={{ fontSize: "0.8rem", marginTop: "0.5rem", color: "var(--cds-text-secondary)" }}>
            Soma ganha pelos clientes no mês ({metrics?.totalLicitacoesContempladas || 0} certames contemplados)
          </div>
        </Tile>

        <Tile
          data-testid="admin-kpi-card-r2"
          role="link"
          tabIndex={0}
          onClick={() => navegarPara("/admin/clientes")}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              navegarPara("/admin/clientes");
            }
          }}
          style={{
            minHeight: "140px",
            backgroundColor: "var(--cds-layer-01)",
            border: "1px solid var(--cds-border-subtle)",
            cursor: "pointer",
            height: "100%",
          }}
        >
          <div
            style={{
              color: "var(--cds-text-secondary)",
              fontSize: "0.875rem",
              fontWeight: 600,
              marginBottom: "0.5rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "0.25rem",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <span
              onClick={() => navegarPara("/admin/clientes")}
              style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}
            >
              <span>ARMAZENAMENTO R2 (STREAMING)</span>
              <SiglaInfoTooltip texto="R2 (Cloudflare R2): Armazenamento em nuvem de alta disponibilidade utilizado pelo Cofre de Documentos." />
            </span>
            <Tag type="cyan" size="sm" className="pncp-mono">
              Clientes
            </Tag>
          </div>
          <div style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--cds-text-primary)" }}>
            {metrics?.r2StorageTotalMb || 0} MB
          </div>
          <div style={{ fontSize: "0.8rem", marginTop: "0.5rem", color: "var(--cds-support-success)" }}>
            100% Zero-PDF na VPS (Hostinger NVMe)
          </div>
        </Tile>

        <Tile
          data-testid="admin-kpi-card-whatsapp"
          role="link"
          tabIndex={0}
          onClick={() => navegarPara("/admin/whatsapp")}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              navegarPara("/admin/whatsapp");
            }
          }}
          style={{
            minHeight: "140px",
            backgroundColor: "var(--cds-layer-01)",
            border: "1px solid var(--cds-border-subtle)",
            cursor: "pointer",
            height: "100%",
          }}
        >
          <div
            style={{
              color: "var(--cds-text-secondary)",
              fontSize: "0.875rem",
              fontWeight: 600,
              marginBottom: "0.5rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "0.25rem",
            }}
          >
            <span>CONECTOR WHATSAPP (ANTI-BAN)</span>
            <Tag type="teal" size="sm" className="pncp-mono">
              WhatsApp
            </Tag>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.25rem" }}>
            <Tag type={metrics?.whatsappInstanciaConectada ? "green" : "red"}>
              {metrics?.whatsappInstanciaConectada ? "INSTÂNCIA ATIVA" : "DESCONECTADO"}
            </Tag>
            <span style={{ fontSize: "0.875rem", fontWeight: 600 }}>
              {metrics?.whatsappFilaPendentes || 0} na fila
            </span>
          </div>
        </Tile>
      </div>

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
        pageSize={10}
        colunas={[
          { key: "primeiroCnpj", header: "Primeiro CNPJ Cadastrado" },
          { key: "cliente", header: "Nome do Cliente" },
          { key: "marcos", header: "Marcos de Configuração" },
          { key: "diasRestantes", header: "Dias Restantes" },
          { key: "engajamento", header: "Engajamento" },
          { key: "configuracao", header: "Configuração" },
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
            engajamento: <EngajamentoTag status={t.onboarding?.statusEngajamento} />,
            configuracao: (
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                <span style={{ fontSize: "0.8rem", color: "var(--cds-text-secondary)" }}>
                  {t.onboarding?.percentual ?? 0}% concluído
                </span>
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
