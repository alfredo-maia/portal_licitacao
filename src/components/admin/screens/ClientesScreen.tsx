"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button, ContentSwitcher, Search, Switch, Tag } from "@carbon/react";
import { Renew } from "@carbon/icons-react";
import type { SuperAdminTenantItem } from "@/server/schemas/superadmin.schema";
import {
  AdminTable,
  EngajamentoTag,
  PageHeader,
  StatusFinanceiroTag,
  adminFetch,
  fmtDia,
} from "../admin-ui";

const FILTROS = [
  { id: "TODOS", label: "Todos" },
  { id: "ATIVO", label: "Pagantes" },
  { id: "TRIAL", label: "Teste grátis" },
  { id: "ABANDONO_TRIAL", label: "Cadastrou e saiu" },
  { id: "GRACE_PERIOD", label: "Carência" },
  { id: "BLOQUEADO", label: "Inadimplentes" },
  { id: "CANCELADO", label: "Cancelados" },
];

export function ClientesScreen({ buscaInicial = "" }: { buscaInicial?: string }) {
  const [busca, setBusca] = useState(buscaInicial);
  const [filtro, setFiltro] = useState("TODOS");
  const [itens, setItens] = useState<SuperAdminTenantItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useMemo(
    () => async () => {
      setLoading(true);
      const qs = new URLSearchParams();
      if (filtro !== "TODOS") qs.set("status", filtro);
      if (busca.trim()) qs.set("busca", busca.trim());
      try {
        const r = await adminFetch<SuperAdminTenantItem[] & { error?: string }>(
          `/api/admin/tenants?${qs.toString()}`,
        );
        if (r.ok && Array.isArray(r.data)) {
          setItens(r.data);
          setErro(null);
        } else {
          setErro("Falha ao carregar clientes.");
        }
      } catch (e: unknown) {
        setErro(e instanceof Error ? e.message : "Falha ao carregar clientes.");
      } finally {
        setLoading(false);
      }
    },
    [filtro, busca],
  );

  useEffect(() => {
    const t = setTimeout(() => void carregar(), 250);
    return () => clearTimeout(t);
  }, [carregar]);

  return (
    <div>
      <PageHeader
        titulo="Clientes 360º"
        descricao="Busque por e-mail, nome ou CNPJ. Abra um cliente para ver conta, CNPJs, equipe, licitações, cofre e recursos."
        acoes={
          <Button kind="tertiary" size="md" renderIcon={Renew} onClick={() => void carregar()} disabled={loading}>
            Atualizar
          </Button>
        }
      />

      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginBottom: "1rem", alignItems: "center" }}>
        <div style={{ minWidth: "22rem", flex: 1 }}>
          <Search
            size="lg"
            labelText="Buscar cliente"
            placeholder="E-mail, nome, razão social ou CNPJ"
            value={busca}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setBusca(e.target.value)}
            onClear={() => setBusca("")}
          />
        </div>
        <ContentSwitcher
          size="md"
          selectedIndex={Math.max(0, FILTROS.findIndex((f) => f.id === filtro))}
          onChange={(e: { name?: string | number }) => setFiltro(String(e.name))}
        >
          {FILTROS.map((f) => (
            <Switch key={f.id} name={f.id} text={f.label} />
          ))}
        </ContentSwitcher>
      </div>

      {erro ? <p style={{ color: "var(--cds-support-error)" }}>{erro}</p> : null}

      <AdminTable
        titulo={`${itens.length} cliente(s)`}
        colunas={[
          { key: "empresa", header: "Empresa / CNPJ" },
          { key: "titular", header: "Titular" },
          { key: "plano", header: "Plano" },
          { key: "status", header: "Status" },
          { key: "termometro", header: "Termômetro de configuração" },
          { key: "uso", header: "Uso" },
          { key: "criado", header: "Cadastro" },
          { key: "acoes", header: "" },
        ]}
        vazio={loading ? "Carregando..." : "Nenhum cliente encontrado para o filtro."}
        linhas={itens.map((t) => ({
          id: t.id,
          empresa: (
            <div>
              <div style={{ fontWeight: 600 }}>{t.nomeFantasia || t.razaoSocial}</div>
              <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)" }}>{t.cnpj}</div>
            </div>
          ),
          titular: (
            <div>
              <div>{t.titularNome || "—"}</div>
              <div style={{ fontSize: "0.75rem", color: "var(--cds-text-secondary)" }}>{t.titularEmail || "—"}</div>
            </div>
          ),
          plano: <Tag type="blue">{t.plano}</Tag>,
          status: (
            <div>
              <StatusFinanceiroTag status={t.billingStatus} />
              {!t.ativo ? <Tag type="red">Inativo</Tag> : null}
            </div>
          ),
          termometro: (
            <div>
              <EngajamentoTag status={t.onboarding?.statusEngajamento} />
              <span style={{ marginLeft: "0.5rem", fontSize: "0.8rem" }}>{t.onboarding?.score ?? 0}/7</span>
            </div>
          ),
          uso: (
            <span style={{ fontSize: "0.8rem" }}>
              {t.totalLicitacoesKanban} lic. • {t.totalDocumentosCofre} docs • {t.totalUsuarios} usuário(s)
            </span>
          ),
          criado: fmtDia(t.criadoEm),
          acoes: (
            <Link href={`/admin/clientes/${t.id}`}>
              <Button size="sm" kind="primary" as="span">
                Abrir 360º
              </Button>
            </Link>
          ),
        }))}
      />
    </div>
  );
}
