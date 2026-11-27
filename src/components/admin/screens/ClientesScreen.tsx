"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Button,
  ContentSwitcher,
  Pagination,
  Search,
  Switch,
  Tag,
  Tile,
} from "@carbon/react";
import { ArrowRight, Renew } from "@carbon/icons-react";
import type { SuperAdminTenantItem } from "@/server/schemas/superadmin.schema";
import {
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
  { id: "EM_CONFIGURACAO", label: "Em configuração" },
  { id: "ABANDONO_TRIAL", label: "Pendente de configuração" },
  { id: "ENGAJADO", label: "Engajados" },
  { id: "GRACE_PERIOD", label: "Carência" },
  { id: "BLOQUEADO", label: "Inadimplentes" },
  { id: "CANCELADO", label: "Cancelados" },
];

const PLANO_TAG_TYPE: Record<string, "blue" | "cyan" | "teal"> = {
  BASICO: "teal",
  PRO: "blue",
  ENTERPRISE: "cyan",
};

export function ClientesScreen({ buscaInicial = "" }: { buscaInicial?: string }) {
  const [busca, setBusca] = useState(buscaInicial);
  const [filtro, setFiltro] = useState("TODOS");
  const [itens, setItens] = useState<SuperAdminTenantItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

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
    setPage(1);
  }, [filtro, busca]);

  useEffect(() => {
    const t = setTimeout(() => void carregar(), 250);
    return () => clearTimeout(t);
  }, [carregar]);

  const totalItens = itens.length;
  const totalPages = Math.max(1, Math.ceil(totalItens / pageSize));
  const paginaSegura = Math.min(page, totalPages);
  const itensPaginados = useMemo(() => {
    const inicio = (paginaSegura - 1) * pageSize;
    return itens.slice(inicio, inicio + pageSize);
  }, [itens, paginaSegura, pageSize]);

  return (
    <div>
      <PageHeader
        titulo="Clientes 360º"
        descricao="Busque por e-mail, nome ou CNPJ. Clique em um cliente para ver conta, CNPJs, equipe, licitações, cofre e recursos."
        acoes={
          <Button
            kind="tertiary"
            size="md"
            renderIcon={Renew}
            onClick={() => void carregar()}
            disabled={loading}
          >
            Atualizar
          </Button>
        }
      />

      <div
        style={{
          display: "flex",
          gap: "1rem",
          flexWrap: "wrap",
          marginBottom: "1rem",
          alignItems: "center",
        }}
      >
        <div style={{ minWidth: "22rem", flex: 1 }}>
          <Search
            size="lg"
            labelText="Buscar cliente"
            placeholder="E-mail, nome, razão social ou CNPJ"
            value={busca}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setBusca(e.target.value)
            }
            onClear={() => setBusca("")}
          />
        </div>
        <ContentSwitcher
          size="md"
          selectedIndex={Math.max(
            0,
            FILTROS.findIndex((f) => f.id === filtro),
          )}
          onChange={(e: { name?: string | number }) =>
            setFiltro(String(e.name))
          }
        >
          {FILTROS.map((f) => (
            <Switch key={f.id} name={f.id} text={f.label} />
          ))}
        </ContentSwitcher>
      </div>

      {erro ? (
        <p style={{ color: "var(--cds-support-error)", marginBottom: "1rem" }}>
          {erro}
        </p>
      ) : null}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "0.75rem",
        }}
      >
        <h2
          style={{
            fontSize: "1.05rem",
            fontWeight: 600,
            margin: 0,
            color: "var(--cds-text-primary)",
          }}
        >
          {totalItens} cliente(s)
        </h2>
      </div>

      {itensPaginados.length === 0 ? (
        <Tile style={{ padding: "2rem", textAlign: "center" }}>
          <span style={{ color: "var(--cds-text-secondary)" }}>
            {loading
              ? "Carregando..."
              : "Nenhum cliente encontrado para o filtro."}
          </span>
        </Tile>
      ) : (
        <div
          data-testid="clientes-cards-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(310px, 1fr))",
            gap: "1rem",
          }}
        >
          {itensPaginados.map((t) => {
            const extras = Math.max(
              0,
              t.cnpjsAdicionaisCount ?? (t.qtdCnpjs ? t.qtdCnpjs - 1 : 0),
            );
            const sub = t.subCnpjEncontrado || null;
            const alvo360Id = sub ? sub.id : t.id;
            const nomeEmpresa = sub
              ? sub.razaoSocial
              : t.nomeFantasia || t.razaoSocial;
            const cnpjExibido = sub ? sub.cnpj : t.cnpj;
            const planoKey = (t.plano || "PRO").toUpperCase();

            return (
              <Link
                key={t.id}
                href={`/admin/clientes/${alvo360Id}`}
                data-testid={`cliente-card-${t.id}`}
                className="pncp-admin-cliente-card"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  gap: "0.75rem",
                  padding: "1.125rem",
                  backgroundColor: "var(--cds-layer-01)",
                  border: "1px solid var(--cds-border-subtle)",
                  borderRadius: "4px",
                  textDecoration: "none",
                  color: "inherit",
                  cursor: "pointer",
                }}
              >
                {/* Topo: Empresa + CNPJ */}
                <div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      gap: "0.5rem",
                      marginBottom: "0.25rem",
                    }}
                  >
                    <span
                      style={{
                        fontWeight: 600,
                        fontSize: "0.95rem",
                        color: "var(--cds-text-primary)",
                        lineHeight: 1.3,
                      }}
                    >
                      {nomeEmpresa}
                    </span>
                    {extras > 0 ? (
                      <Tag
                        type="cyan"
                        size="sm"
                        style={{ flexShrink: 0, margin: 0 }}
                      >
                        +{extras} CNPJ(s)
                      </Tag>
                    ) : null}
                  </div>
                  <div
                    style={{
                      fontSize: "0.78rem",
                      fontFamily: "monospace",
                      color: "var(--cds-text-secondary)",
                    }}
                  >
                    {cnpjExibido}
                  </div>
                  {sub ? (
                    <div
                      style={{
                        fontSize: "0.72rem",
                        color: "var(--cds-text-helper)",
                        marginTop: "0.2rem",
                      }}
                    >
                      Pertencente à conta de{" "}
                      {t.titularNome || t.titularEmail || "titular"} (CNPJ
                      principal: {t.cnpj})
                    </div>
                  ) : null}
                </div>

                {/* Tags: Plano + Status + Termômetro */}
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    gap: "0.35rem",
                  }}
                >
                  <Tag type={PLANO_TAG_TYPE[planoKey] ?? "blue"} size="sm">
                    {planoKey}
                  </Tag>
                  <StatusFinanceiroTag status={t.billingStatus} />
                  {!t.ativo ? (
                    <Tag type="red" size="sm">
                      Inativo
                    </Tag>
                  ) : null}
                  <EngajamentoTag status={t.onboarding?.statusEngajamento} />
                  <span
                    style={{
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      color: "var(--cds-text-secondary)",
                    }}
                  >
                    {t.onboarding?.score ?? 0}/7
                  </span>
                </div>

                {/* Titular */}
                <div
                  style={{
                    fontSize: "0.8125rem",
                    borderTop: "1px solid var(--cds-border-subtle)",
                    paddingTop: "0.625rem",
                  }}
                >
                  <div
                    style={{
                      fontWeight: 500,
                      color: "var(--cds-text-primary)",
                    }}
                  >
                    {t.titularNome || "—"}
                  </div>
                  <div
                    style={{
                      fontSize: "0.75rem",
                      color: "var(--cds-text-secondary)",
                      wordBreak: "break-word",
                    }}
                  >
                    {t.titularEmail || "—"}
                  </div>
                </div>

                {/* Uso + Rodapé */}
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.4rem",
                    borderTop: "1px solid var(--cds-border-subtle)",
                    paddingTop: "0.625rem",
                  }}
                >
                  <div
                    style={{
                      fontSize: "0.75rem",
                      color: "var(--cds-text-secondary)",
                    }}
                  >
                    {t.totalLicitacoesKanban} lic. • {t.totalDocumentosCofre}{" "}
                    docs • {t.totalUsuarios} usuário(s) • {t.aiUsadasMes ?? 0}{" "}
                    IA/mês
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      fontSize: "0.75rem",
                    }}
                  >
                    <span style={{ color: "var(--cds-text-helper)" }}>
                      Cadastro: {fmtDia(t.criadoEm)}
                    </span>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.25rem",
                        fontWeight: 600,
                        color: "var(--cds-link-primary, #4589ff)",
                      }}
                    >
                      Abrir 360º <ArrowRight size={14} />
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {totalItens > 0 && (
        <div style={{ marginTop: "1rem" }}>
          <Pagination
            page={paginaSegura}
            pageSize={pageSize}
            pageSizes={[20, 40, 60, 100]}
            totalItems={totalItens}
            itemsPerPageText="Cards por página:"
            backwardText="Página anterior"
            forwardText="Próxima página"
            itemRangeText={(min, max, total) => `${min}–${max} de ${total} clientes`}
            pageRangeText={(_current, total) => `de ${total} página(s)`}
            onChange={({
              page: nextPage,
              pageSize: nextPageSize,
            }: {
              page: number;
              pageSize: number;
            }) => {
              if (nextPageSize !== pageSize) {
                setPageSize(nextPageSize);
                setPage(1);
              } else {
                setPage(nextPage);
              }
            }}
          />
        </div>
      )}
    </div>
  );
}
