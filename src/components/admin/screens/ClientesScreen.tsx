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
import { Renew } from "@carbon/icons-react";
import type { SuperAdminTenantItem } from "@/server/schemas/superadmin.schema";
import {
  AdminSortSelect,
  EngajamentoTag,
  OutrosCnpjsPopover,
  PageHeader,
  StatusFinanceiroTag,
  TitularContatoLinha,
  UsoSaudeTag,
  adminFetch,
  fmtDia,
  fmtTempoRelativo,
  type SortOption,
} from "../admin-ui";

const FILTROS = [
  { id: "TODOS", label: "Todos" },
  { id: "TRIAL", label: "Teste grátis" },
  { id: "SEM_USO_OU_ESFRIANDO", label: "Sem uso / Esfriando" },
  { id: "EM_CONFIGURACAO", label: "Em configuração" },
  { id: "ABANDONO_TRIAL", label: "Pendente de configuração" },
];

const ORDENACOES: SortOption[] = [
  { value: "cadastro_desc", label: "Cadastro: mais recente" },
  { value: "cadastro_asc", label: "Cadastro: mais antigo" },
  { value: "uso_desc", label: "Último acesso: mais recente" },
  { value: "uso_asc", label: "Último acesso: menos recente" },
  { value: "ia_desc", label: "Uso de IA: maior → menor" },
  { value: "ia_asc", label: "Uso de IA: menor → maior" },
  { value: "lic_desc", label: "Licitações: maior → menor" },
];

const PLANO_TAG_TYPE: Record<string, "blue" | "cyan" | "teal"> = {
  BASICO: "teal",
  PRO: "blue",
  ENTERPRISE: "cyan",
};

function tsOuZero(v: string | Date | null | undefined): number {
  if (!v) return 0;
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? 0 : t;
}

export function ClientesScreen({ buscaInicial = "" }: { buscaInicial?: string }) {
  const [busca, setBusca] = useState(buscaInicial);
  const [filtro, setFiltro] = useState("TODOS");
  const [ordenacao, setOrdenacao] = useState("cadastro_desc");
  const [itens, setItens] = useState<SuperAdminTenantItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

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
  }, [filtro, busca, ordenacao]);

  useEffect(() => {
    const t = setTimeout(() => void carregar(), 250);
    return () => clearTimeout(t);
  }, [carregar]);

  const itensOrdenados = useMemo(() => {
    const lista = [...itens];
    lista.sort((a, b) => {
      switch (ordenacao) {
        case "cadastro_asc":
          return tsOuZero(a.criadoEm) - tsOuZero(b.criadoEm);
        case "uso_desc":
          return (
            tsOuZero(b.uso?.ultimoAcessoEm ?? b.ultimaAtividadeEm) -
            tsOuZero(a.uso?.ultimoAcessoEm ?? a.ultimaAtividadeEm)
          );
        case "uso_asc": {
          const ta = tsOuZero(a.uso?.ultimoAcessoEm ?? a.ultimaAtividadeEm);
          const tb = tsOuZero(b.uso?.ultimoAcessoEm ?? b.ultimaAtividadeEm);
          return ta - tb;
        }
        case "ia_desc":
          return (b.aiUsadasMes ?? 0) - (a.aiUsadasMes ?? 0);
        case "ia_asc":
          return (a.aiUsadasMes ?? 0) - (b.aiUsadasMes ?? 0);
        case "lic_desc":
          return (b.totalLicitacoesKanban ?? 0) - (a.totalLicitacoesKanban ?? 0);
        case "cadastro_desc":
        default:
          return tsOuZero(b.criadoEm) - tsOuZero(a.criadoEm);
      }
    });
    return lista;
  }, [itens, ordenacao]);

  const totalItens = itensOrdenados.length;
  const totalPages = Math.max(1, Math.ceil(totalItens / pageSize));
  const paginaSegura = Math.min(page, totalPages);
  const itensPaginados = useMemo(() => {
    const inicio = (paginaSegura - 1) * pageSize;
    return itensOrdenados.slice(inicio, inicio + pageSize);
  }, [itensOrdenados, paginaSegura, pageSize]);

  return (
    <div>
      <PageHeader
        titulo="Clientes"
        descricao="Busque por e-mail, nome ou CNPJ. Clique em um cliente para ver conta, CNPJs, equipe, licitações e uso."
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
          gap: "0.75rem",
          flexWrap: "wrap",
          marginBottom: "1rem",
          alignItems: "center",
        }}
      >
        <div style={{ minWidth: "20rem", flex: 1 }}>
          <Search
            size="md"
            labelText="Buscar cliente"
            placeholder="E-mail, nome, razão social ou CNPJ"
            value={busca}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setBusca(e.target.value)
            }
            onClear={() => setBusca("")}
          />
        </div>
        <AdminSortSelect
          id="clientes-sort"
          testId="clientes-sort-select"
          value={ordenacao}
          options={ORDENACOES}
          onChange={setOrdenacao}
        />
        <div style={{ maxWidth: "100%", overflowX: "auto" }}>
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
            gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
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
            const outrosCnpjs = (t.cnpjsVinculados || []).filter(
              (emp) => emp.id !== alvo360Id && emp.cnpj !== cnpjExibido,
            );
            const isHovered = hoveredId === t.id;

            return (
              <Link
                key={t.id}
                href={`/admin/clientes/${alvo360Id}`}
                data-testid={`cliente-card-${t.id}`}
                className="pncp-admin-cliente-card"
                onMouseEnter={() => setHoveredId(t.id)}
                onMouseLeave={() =>
                  setHoveredId((prev) => (prev === t.id ? null : prev))
                }
                style={{
                  position: "relative",
                  zIndex: isHovered ? 25 : 1,
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

                {/* Tags: Plano + Status + Configuração */}
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
                </div>

                {/* Titular: Nome • Telefone • E-mail */}
                <div
                  style={{
                    borderTop: "1px solid var(--cds-border-subtle)",
                    paddingTop: "0.625rem",
                  }}
                >
                  <TitularContatoLinha
                    nome={t.titularNome}
                    telefone={t.telefone}
                    email={t.titularEmail}
                  />
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
                      display: "flex",
                      flexWrap: "wrap",
                      alignItems: "center",
                      gap: "0.35rem",
                      fontSize: "0.75rem",
                      color: "var(--cds-text-secondary)",
                    }}
                  >
                    <span>
                      {t.totalLicitacoesKanban} lic. • {t.totalUsuarios}{" "}
                      usuário(s) •
                    </span>
                    <UsoSaudeTag
                      status={t.uso?.status}
                      rotulo={t.uso?.rotulo}
                      size="sm"
                    />
                    {t.uso && t.uso.diasAtivos7d > 0 ? (
                      <span
                        style={{
                          fontSize: "0.72rem",
                          color: "var(--cds-text-helper)",
                        }}
                      >
                        ({t.uso.diasAtivos7d}d/7d)
                      </span>
                    ) : null}
                    <span>• {t.aiUsadasMes ?? 0} IA/mês</span>
                  </div>
                  <div
                    style={{
                      fontSize: "0.75rem",
                      color: "var(--cds-text-helper)",
                    }}
                  >
                    Cadastro: {fmtDia(t.criadoEm)} • Último acesso:{" "}
                    {fmtTempoRelativo(
                      t.uso?.ultimoAcessoEm ?? t.ultimaAtividadeEm,
                    )}
                  </div>
                </div>

                {isHovered && outrosCnpjs.length > 0 ? (
                  <OutrosCnpjsPopover cardId={t.id} empresas={outrosCnpjs} />
                ) : null}
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
            itemRangeText={(min, max, total) =>
              `${min}–${max} de ${total} clientes`
            }
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
