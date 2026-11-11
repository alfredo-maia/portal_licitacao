"use client";

import React, { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  DataTable,
  InlineNotification,
  Pagination,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  Tag,
  Tile,
  Tooltip,
} from "@carbon/react";
import { Information } from "@carbon/icons-react";

export const fmtBRL = (v: number | null | undefined): string =>
  (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const fmtNum = (v: number | null | undefined): string =>
  (v ?? 0).toLocaleString("pt-BR");

export const fmtData = (v: string | Date | null | undefined): string => {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
};

export const fmtDia = (v: string | Date | null | undefined): string => {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
};

type TagType = "green" | "cyan" | "warm-gray" | "red" | "blue" | "gray" | "magenta" | "teal";

const STATUS_TAG: Record<string, { type: TagType; label: string }> = {
  ATIVO: { type: "green", label: "Pagante" },
  TRIAL: { type: "cyan", label: "Teste grátis" },
  GRACE_PERIOD: { type: "warm-gray", label: "Carência" },
  BLOQUEADO: { type: "red", label: "Inadimplente" },
  CANCELADO: { type: "gray", label: "Cancelado" },
};

export function StatusFinanceiroTag({ status }: { status: string }) {
  const cfg = STATUS_TAG[status] || { type: "gray" as TagType, label: status };
  return <Tag type={cfg.type}>{cfg.label}</Tag>;
}

export function EngajamentoTag({ status }: { status?: string }) {
  if (status === "ENGAJADO") return <Tag type="green">Engajado</Tag>;
  if (status === "EM_CONFIGURACAO") return <Tag type="blue">Em configuração</Tag>;
  return <Tag type="magenta">Pendente de configuração</Tag>;
}

export function SiglaInfoTooltip({ texto }: { texto: string }) {
  return (
    <Tooltip align="top" label={texto}>
      <button
        type="button"
        data-testid="kpi-info-icon"
        aria-label={texto}
        title={texto}
        style={{
          background: "transparent",
          border: "none",
          padding: 0,
          marginLeft: "0.3rem",
          cursor: "help",
          display: "inline-flex",
          alignItems: "center",
          verticalAlign: "middle",
          color: "var(--cds-icon-secondary, var(--cds-text-secondary))",
        }}
      >
        <Information size={14} />
      </button>
    </Tooltip>
  );
}

export function PageHeader({
  titulo,
  descricao,
  acoes,
}: {
  titulo: string;
  descricao?: string;
  acoes?: ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        gap: "1rem",
        flexWrap: "wrap",
        marginBottom: "1.5rem",
      }}
    >
      <div>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 600, margin: 0 }}>{titulo}</h1>
        {descricao ? (
          <p style={{ color: "var(--cds-text-secondary)", marginTop: "0.5rem", maxWidth: "60rem" }}>
            {descricao}
          </p>
        ) : null}
      </div>
      {acoes ? <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>{acoes}</div> : null}
    </div>
  );
}

export function KpiTile({
  rotulo,
  valor,
  detalhe,
  cor,
  infoTooltip,
}: {
  rotulo: string;
  valor: ReactNode;
  detalhe?: ReactNode;
  cor?: string;
  infoTooltip?: string;
}) {
  return (
    <Tile style={{ minHeight: "120px", backgroundColor: "var(--cds-layer-01)", height: "100%" }}>
      <div
        style={{
          color: "var(--cds-text-secondary)",
          fontSize: "0.75rem",
          letterSpacing: "0.02rem",
          display: "flex",
          alignItems: "center",
          gap: "0.2rem",
        }}
      >
        <span>{rotulo}</span>
        {infoTooltip ? <SiglaInfoTooltip texto={infoTooltip} /> : null}
      </div>
      <div style={{ fontSize: "1.6rem", fontWeight: 600, marginTop: "0.5rem", color: cor || "var(--cds-text-primary)" }}>
        {valor}
      </div>
      {detalhe ? (
        <div style={{ fontSize: "0.8rem", marginTop: "0.4rem", color: "var(--cds-text-secondary)" }}>{detalhe}</div>
      ) : null}
    </Tile>
  );
}

export function KpiGrid({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: "1rem",
        marginBottom: "1.5rem",
      }}
    >
      {children}
    </div>
  );
}

export interface Feedback {
  kind: "success" | "error" | "info" | "warning";
  texto: string;
}

export function FeedbackBar({
  feedback,
  onClose,
}: {
  feedback: Feedback | null;
  onClose: () => void;
}) {
  if (!feedback) return null;
  return (
    <div style={{ marginBottom: "1rem" }}>
      <InlineNotification
        kind={feedback.kind}
        title={feedback.kind === "error" ? "Erro" : "Aviso"}
        subtitle={feedback.texto}
        onCloseButtonClick={onClose}
        lowContrast
      />
    </div>
  );
}

/** Chamada JSON ao `/api/admin/*` com tratamento uniforme de erro. */
export async function adminFetch<T = unknown>(
  url: string,
  init?: { method?: string; body?: unknown },
): Promise<{ ok: boolean; status: number; data: T }> {
  const res = await fetch(url, {
    method: init?.method || "GET",
    headers: { "Content-Type": "application/json" },
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as T;
  return { ok: res.ok, status: res.status, data };
}

/** Hook de carga inicial/recarga de dados de uma tela ADM. */
export function useAdminData<T>(url: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    setLoading(true);
    try {
      const r = await adminFetch<T & { error?: string }>(url);
      if (r.ok) {
        setData(r.data);
        setErro(null);
      } else {
        setErro(r.data?.error || `Falha ao carregar (HTTP ${r.status})`);
      }
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : "Falha ao carregar dados.");
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  return { data, loading, erro, recarregar, setData };
}

/* ---------------------------------------------------------------------------
   Tabela Carbon genérica do Portal ADM
--------------------------------------------------------------------------- */

export interface AdminColumn {
  key: string;
  header: string;
}

export type AdminRow = { id: string } & Record<string, ReactNode>;

export function AdminTable({
  titulo,
  descricao,
  colunas,
  linhas,
  vazio = "Nenhum registro encontrado.",
  rowClassName,
  pageSize = 10,
  pageSizes,
  resetPageKey,
}: {
  titulo?: string;
  descricao?: string;
  colunas: AdminColumn[];
  linhas: AdminRow[];
  vazio?: string;
  rowClassName?: (id: string) => string | undefined;
  pageSize?: number;
  pageSizes?: number[];
  resetPageKey?: string | number;
}) {
  const [page, setPage] = useState(1);
  const [currentSize, setCurrentSize] = useState(pageSize);

  useEffect(() => {
    setCurrentSize(pageSize);
  }, [pageSize]);

  useEffect(() => {
    setPage(1);
  }, [resetPageKey]);

  const effectiveSize = currentSize > 0 ? currentSize : linhas.length || 1;
  const totalPages = Math.max(1, Math.ceil(linhas.length / effectiveSize));
  const paginaSegura = Math.min(page, totalPages);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const linhasVisiveis =
    currentSize > 0
      ? linhas.slice((paginaSegura - 1) * currentSize, paginaSegura * currentSize)
      : linhas;

  const baseSizes =
    pageSizes && pageSizes.length > 0
      ? pageSizes
      : pageSize === 5
        ? [5, 10, 20]
        : [10, 20, 50];
  const resolvedPageSizes = baseSizes.includes(currentSize)
    ? baseSizes
    : [currentSize, ...baseSizes].sort((a, b) => a - b);

  const rows = linhasVisiveis.map((l) => ({ ...l, id: String(l.id) }));
  return (
    <DataTable rows={rows} headers={colunas}>
      {({ rows: rs, headers, getTableProps, getHeaderProps, getRowProps }) => (
        <TableContainer title={titulo} description={descricao}>
          <Table {...getTableProps()}>
            <TableHead>
              <TableRow>
                {headers.map((h) => (
                  <TableHeader {...getHeaderProps({ header: h })} key={h.key}>
                    {h.header}
                  </TableHeader>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {rs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={colunas.length}>
                    <span style={{ color: "var(--cds-text-secondary)" }}>{vazio}</span>
                  </TableCell>
                </TableRow>
              ) : (
                rs.map((row) => (
                  <TableRow
                    {...getRowProps({
                      row,
                      className: rowClassName ? rowClassName(row.id) : undefined,
                    })}
                    key={row.id}
                  >
                    {row.cells.map((cell) => (
                      <TableCell key={cell.id}>{cell.value}</TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          {currentSize > 0 && linhas.length > 0 ? (
            <Pagination
              backwardText="Página anterior"
              forwardText="Próxima página"
              itemsPerPageText="Itens por página:"
              pageNumberText="Página"
              page={paginaSegura}
              pageSize={currentSize}
              pageSizes={resolvedPageSizes}
              totalItems={linhas.length}
              onChange={({ page: nextPage, pageSize: nextSize }) => {
                if (typeof nextSize === "number" && nextSize !== currentSize) {
                  setCurrentSize(nextSize);
                  setPage(1);
                } else {
                  setPage(nextPage);
                }
              }}
            />
          ) : null}
        </TableContainer>
      )}
    </DataTable>
  );
}
