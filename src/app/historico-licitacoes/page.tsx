"use client";

import React, { Suspense } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Dropdown,
  InlineLoading,
  InlineNotification,
  Modal,
  Pagination,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  Tag,
  TextInput,
  Tile,
} from "@carbon/react";
import { Reset, Search } from "@carbon/icons-react";
import { ModulePageShell } from "@/components/shell/module-page-shell";
import { ESTADOS_BRASIL } from "@/config/estados";
import { FAIXAS_VALOR_SPRINT7 } from "@/lib/masks";
import { resolverTituloExibicaoLicitacao } from "@/lib/resumo-licitacao";
import {
  CATALOGO_MACRO_SEGMENTOS,
  type MacroSegmento,
} from "@/server/schemas/segmentos.schema";
import {
  MAX_HISTORICO_DIAS_JANELA,
  type SituacaoPrazoHistorico,
} from "@/server/schemas/historico-licitacoes.schema";
import type {
  OportunidadesSortBy,
  SortDir,
} from "@/server/schemas/oportunidades.schema";

interface HistoricoItemDTO {
  id: string;
  orgaoNome: string;
  uf: string;
  miniResumo: string;
  resumo: string;
  valorEstimado: number;
  dataAbertura: string;
  dataEncerramentoProposta?: string | null;
  tipoSistemaCodigo?: string | null;
  segmentoMacro?: string | null;
  prazoEncerrado: boolean;
  statusTenant: string | null;
}

const HEADERS: Array<{
  key: OportunidadesSortBy | "situacao";
  label: string;
  sortable: boolean;
  style?: React.CSSProperties;
}> = [
  {
    key: "dataLimite",
    label: "Data Limite (Proposta)",
    sortable: true,
    style: { width: "145px", whiteSpace: "nowrap" },
  },
  {
    key: "orgaoNome",
    label: "Órgão e UF",
    sortable: true,
    style: { width: "26%" },
  },
  {
    key: "miniResumo",
    label: "Objeto",
    sortable: true,
    style: { width: "40%" },
  },
  {
    key: "valorEstimado",
    label: "Valor Estimado",
    sortable: true,
    style: { width: "140px", whiteSpace: "nowrap" },
  },
  {
    key: "situacao",
    label: "Situação",
    sortable: false,
    style: { width: "145px", whiteSpace: "nowrap" },
  },
];

function formatDateIsoLocal(d: Date): string {
  const ano = d.getFullYear();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

function deslocarDiasIso(base: Date, deltaDias: number): string {
  const copy = new Date(base.getTime() + deltaDias * 24 * 60 * 60 * 1000);
  return formatDateIsoLocal(copy);
}

function calcularDiferencaDiasIso(inicio: string, fim: string): number {
  const [y1, m1, d1] = inicio.split("-").map(Number);
  const [y2, m2, d2] = fim.split("-").map(Number);
  if (!y1 || !m1 || !d1 || !y2 || !m2 || !d2) return NaN;
  const ms1 = Date.UTC(y1, m1 - 1, d1);
  const ms2 = Date.UTC(y2, m2 - 1, d2);
  return Math.round((ms2 - ms1) / (24 * 60 * 60 * 1000));
}

function formatarDataExibicao(rawDate?: string | null): string {
  if (!rawDate) return "—";
  const d = new Date(rawDate);
  if (Number.isNaN(d.getTime())) return "—";
  const dataStr = d.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const horaStr = d.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return horaStr && horaStr !== "00:00" ? `${dataStr} ${horaStr}` : dataStr;
}

const SEGMENTOS_OPTIONS = [
  { id: "", text: "Todos os Segmentos (40 + Outros)" },
  { id: "OUTROS", text: "Outros / Sem Segmento Definido" },
  ...Object.values(CATALOGO_MACRO_SEGMENTOS).map((macro) => ({
    id: macro.codigo,
    text: macro.nome,
  })),
];

const SITUACAO_OPTIONS: Array<{ id: SituacaoPrazoHistorico; text: string }> = [
  { id: "TODAS", text: "Todas (Encerradas e Em Aberto)" },
  { id: "ENCERRADAS", text: "Encerradas" },
  { id: "ABERTAS", text: "Em Aberto" },
];

export default function HistoricoLicitacoesPage() {
  return (
    <Suspense fallback={<div>Carregando Histórico de Licitações...</div>}>
      <HistoricoLicitacoesContent />
    </Suspense>
  );
}

const HISTORICO_STORAGE_KEY = "portal_historico_last_state";

interface HistoricoSavedState {
  dataInicio: string;
  dataFim: string;
  situacaoPrazo: SituacaoPrazoHistorico;
  segmento: string;
  subsegmento: string;
  uf: string;
  faixaValor: string;
  busca: string;
  sortBy: OportunidadesSortBy;
  sortDir: SortDir;
  page: number;
  pageSize: number;
  returningFromDossie?: boolean;
}

function HistoricoLicitacoesContent() {
  const router = useRouter();
  const hoje = React.useMemo(() => new Date(), []);

  const [dataInicio, setDataInicio] = React.useState<string>(() =>
    deslocarDiasIso(hoje, -MAX_HISTORICO_DIAS_JANELA),
  );
  const [dataFim, setDataFim] = React.useState<string>(() =>
    formatDateIsoLocal(hoje),
  );
  const [situacaoPrazo, setSituacaoPrazo] =
    React.useState<SituacaoPrazoHistorico>("TODAS");
  const [segmento, setSegmento] = React.useState<string>("");
  const [subsegmento, setSubsegmento] = React.useState<string>("");
  const [uf, setUf] = React.useState<string>("");
  const [faixaValor, setFaixaValor] = React.useState<string>("");
  const [busca, setBusca] = React.useState<string>("");

  const [hasSearched, setHasSearched] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [loadingMsg, setLoadingMsg] = React.useState(
    "Consultando base histórica no banco de dados...",
  );
  const [validationError, setValidationError] = React.useState<string | null>(
    null,
  );
  const [apiError, setApiError] = React.useState<string | null>(null);

  const [itens, setItens] = React.useState<HistoricoItemDTO[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(10);
  const [sortBy, setSortBy] = React.useState<OportunidadesSortBy>("dataLimite");
  const [sortDir, setSortDir] = React.useState<SortDir>("desc");

  const executarConsultaComParams = React.useCallback(
    async (
      params: Omit<HistoricoSavedState, "returningFromDossie">,
      mensagemLoading?: string,
    ) => {
      if (!params.dataInicio || !params.dataFim) {
        setValidationError(
          "Informe a data inicial e a data final (máximo de 30 dias).",
        );
        return;
      }
      const diff = calcularDiferencaDiasIso(params.dataInicio, params.dataFim);
      if (Number.isNaN(diff)) {
        setValidationError("As datas informadas são inválidas.");
        return;
      }
      if (diff < 0) {
        setValidationError(
          "A data final deve ser igual ou posterior à data inicial.",
        );
        return;
      }
      if (diff > MAX_HISTORICO_DIAS_JANELA) {
        setValidationError(
          `O intervalo máximo de consulta no Histórico é de ${MAX_HISTORICO_DIAS_JANELA} dias corridos.`,
        );
        return;
      }
      const buscaTrim = params.busca.trim();
      if (buscaTrim.length > 0 && buscaTrim.length < 3) {
        setValidationError(
          "Informe ao menos 3 caracteres para pesquisar por palavra-chave.",
        );
        return;
      }

      setValidationError(null);
      setApiError(null);
      setLoadingMsg(
        mensagemLoading || "Consultando base histórica no banco de dados...",
      );
      setLoading(true);
      setHasSearched(true);

      try {
        const qs = new URLSearchParams({
          dataInicio: params.dataInicio,
          dataFim: params.dataFim,
          situacaoPrazo: params.situacaoPrazo,
          sortBy: params.sortBy,
          sortDir: params.sortDir,
          page: String(params.page),
          pageSize: String(params.pageSize),
        });
        if (params.segmento) qs.set("segmento", params.segmento);
        if (params.subsegmento) qs.set("subsegmento", params.subsegmento);
        if (params.uf) qs.set("uf", params.uf);
        if (params.faixaValor) qs.set("faixaValor", params.faixaValor);
        if (buscaTrim) qs.set("busca", buscaTrim);

        const response = await fetch(`/api/historico-licitacoes?${qs.toString()}`);
        const data = await response.json().catch(() => null);
        if (!response.ok || !data?.ok) {
          throw new Error(
            data?.message ||
              data?.issues?.[0]?.message ||
              "Erro ao consultar o Histórico de Licitações.",
          );
        }

        setItens(Array.isArray(data.itens) ? data.itens : []);
        setTotal(Number(data.total) || 0);
        setPage(Number(data.page) || params.page);
        setPageSize(Number(data.pageSize) || params.pageSize);
        setSortBy(params.sortBy);
        setSortDir(params.sortDir);
      } catch (err: unknown) {
        setApiError(
          err instanceof Error
            ? err.message
            : "Não foi possível carregar o Histórico de Licitações.",
        );
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const executarConsulta = React.useCallback(
    async (opts: {
      targetPage: number;
      targetPageSize: number;
      targetSortBy: OportunidadesSortBy;
      targetSortDir: SortDir;
      mensagemLoading?: string;
    }) => {
      await executarConsultaComParams(
        {
          dataInicio,
          dataFim,
          situacaoPrazo,
          segmento,
          subsegmento,
          uf,
          faixaValor,
          busca,
          sortBy: opts.targetSortBy,
          sortDir: opts.targetSortDir,
          page: opts.targetPage,
          pageSize: opts.targetPageSize,
        },
        opts.mensagemLoading,
      );
    },
    [
      busca,
      dataFim,
      dataInicio,
      executarConsultaComParams,
      faixaValor,
      segmento,
      situacaoPrazo,
      subsegmento,
      uf,
    ],
  );

  // Restaura automaticamente a última pesquisa somente quando o usuário retorna do Dossiê
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.sessionStorage.getItem(HISTORICO_STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as HistoricoSavedState;
      if (!saved?.returningFromDossie) return;

      window.sessionStorage.setItem(
        HISTORICO_STORAGE_KEY,
        JSON.stringify({ ...saved, returningFromDossie: false }),
      );

      setDataInicio(saved.dataInicio);
      setDataFim(saved.dataFim);
      setSituacaoPrazo(saved.situacaoPrazo);
      setSegmento(saved.segmento || "");
      setSubsegmento(saved.subsegmento || "");
      setUf(saved.uf || "");
      setFaixaValor(saved.faixaValor || "");
      setBusca(saved.busca || "");
      setSortBy(saved.sortBy || "dataLimite");
      setSortDir(saved.sortDir || "desc");
      setPage(saved.page || 1);
      setPageSize(saved.pageSize || 10);

      void executarConsultaComParams(
        {
          dataInicio: saved.dataInicio,
          dataFim: saved.dataFim,
          situacaoPrazo: saved.situacaoPrazo,
          segmento: saved.segmento || "",
          subsegmento: saved.subsegmento || "",
          uf: saved.uf || "",
          faixaValor: saved.faixaValor || "",
          busca: saved.busca || "",
          sortBy: saved.sortBy || "dataLimite",
          sortDir: saved.sortDir || "desc",
          page: saved.page || 1,
          pageSize: saved.pageSize || 10,
        },
        "Restaurando sua última pesquisa no Histórico...",
      );
    } catch {
      // Ignora erro de storage
    }
  }, [executarConsultaComParams]);

  const abrirDossiePreservandoBusca = (id: string) => {
    if (typeof window !== "undefined") {
      try {
        const snapshot: HistoricoSavedState = {
          dataInicio,
          dataFim,
          situacaoPrazo,
          segmento,
          subsegmento,
          uf,
          faixaValor,
          busca,
          sortBy,
          sortDir,
          page,
          pageSize,
          returningFromDossie: true,
        };
        window.sessionStorage.setItem(
          HISTORICO_STORAGE_KEY,
          JSON.stringify(snapshot),
        );
      } catch {
        // Ignora erro de storage
      }
    }
    router.push(`/oportunidades/${id}`);
  };

  const handleSituacaoChange = (nova: SituacaoPrazoHistorico) => {
    setSituacaoPrazo(nova);
    const agoraLocal = new Date();
    if (nova === "ABERTAS") {
      setDataInicio(formatDateIsoLocal(agoraLocal));
      setDataFim(deslocarDiasIso(agoraLocal, MAX_HISTORICO_DIAS_JANELA));
    } else if (situacaoPrazo === "ABERTAS") {
      setDataInicio(deslocarDiasIso(agoraLocal, -MAX_HISTORICO_DIAS_JANELA));
      setDataFim(formatDateIsoLocal(agoraLocal));
    }
  };

  const handleLimparFiltros = () => {
    const agoraLocal = new Date();
    setDataInicio(deslocarDiasIso(agoraLocal, -MAX_HISTORICO_DIAS_JANELA));
    setDataFim(formatDateIsoLocal(agoraLocal));
    setSituacaoPrazo("TODAS");
    setSegmento("");
    setSubsegmento("");
    setUf("");
    setFaixaValor("");
    setBusca("");
    setValidationError(null);
    setApiError(null);
    setHasSearched(false);
    setItens([]);
    setTotal(0);
    setPage(1);
  };

  const handleSortHeader = (col: OportunidadesSortBy) => {
    const nextDir: SortDir =
      sortBy === col ? (sortDir === "desc" ? "asc" : "desc") : "desc";
    void executarConsulta({
      targetPage: 1,
      targetPageSize: pageSize,
      targetSortBy: col,
      targetSortDir: nextDir,
      mensagemLoading:
        "Ordenando toda a base correspondente no banco de dados...",
    });
  };

  const subsegmentosDisponiveis = React.useMemo(() => {
    if (!segmento || segmento === "OUTROS") return [];
    const def = CATALOGO_MACRO_SEGMENTOS[segmento as MacroSegmento];
    return def ? def.subcategorias : [];
  }, [segmento]);

  return (
    <ModulePageShell routePath="/historico-licitacoes">
      <Tile style={{ padding: "1.5rem" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "1rem",
            marginBottom: "1rem",
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: "1.125rem" }}>
              Pesquisa Livre na Base Geral e Histórica de Licitações
            </h2>
            <p
              style={{
                margin: "0.25rem 0 0 0",
                fontSize: "0.875rem",
                color: "var(--cds-text-secondary)",
              }}
            >
              Todos os 40 segmentos + Outros e todas as 27 UFs liberados para
              consulta de editais, atas, histórico e análise de IA. Janela
              máxima de {MAX_HISTORICO_DIAS_JANELA} dias por busca.
            </p>
          </div>
        </div>

        <div
          data-testid="historico-filters"
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "1rem",
            alignItems: "flex-end",
            marginBottom: "1rem",
          }}
        >
          <TextInput
            id="historico-data-inicio"
            data-testid="historico-filter-data-inicio"
            type="date"
            labelText="Data Limite (De) *"
            value={dataInicio}
            disabled={loading}
            onChange={(e) => setDataInicio(e.target.value)}
            style={{ minWidth: "155px" }}
          />
          <TextInput
            id="historico-data-fim"
            data-testid="historico-filter-data-fim"
            type="date"
            labelText="Data Limite (Até) *"
            value={dataFim}
            disabled={loading}
            onChange={(e) => setDataFim(e.target.value)}
            style={{ minWidth: "155px" }}
          />

          <Dropdown
            id="historico-situacao"
            data-testid="historico-filter-situacao"
            titleText="Situação do Prazo"
            label="Todas (Encerradas e Em Aberto)"
            disabled={loading}
            items={SITUACAO_OPTIONS}
            itemToString={(item) => (item ? item.text : "")}
            selectedItem={
              SITUACAO_OPTIONS.find((s) => s.id === situacaoPrazo) ||
              SITUACAO_OPTIONS[0]
            }
            onChange={({ selectedItem }) => {
              if (selectedItem?.id) {
                handleSituacaoChange(selectedItem.id);
              }
            }}
            style={{ minWidth: "230px" }}
          />

          <Dropdown
            id="historico-segmento"
            data-testid="historico-filter-segmento"
            titleText="Segmento / Ramo"
            label="Todos os Segmentos (40 + Outros)"
            disabled={loading}
            items={SEGMENTOS_OPTIONS}
            itemToString={(item) => (item ? item.text : "")}
            selectedItem={
              SEGMENTOS_OPTIONS.find((s) => s.id === segmento) ||
              SEGMENTOS_OPTIONS[0]
            }
            onChange={({ selectedItem }) => {
              setSegmento(selectedItem?.id || "");
              setSubsegmento("");
            }}
            style={{ minWidth: "250px" }}
          />

          <Dropdown
            id="historico-subsegmento"
            data-testid="historico-filter-subsegmento"
            titleText="Sub-segmento"
            label={
              segmento && segmento !== "OUTROS"
                ? "Todos os Sub-segmentos"
                : "Selecione um segmento"
            }
            disabled={loading || !segmento || segmento === "OUTROS"}
            items={[
              { id: "", text: "Todos os Sub-segmentos" },
              ...subsegmentosDisponiveis.map((sub) => ({
                id: sub.codigo,
                text: sub.nome,
              })),
            ]}
            itemToString={(item) => (item ? item.text : "")}
            selectedItem={
              subsegmento
                ? {
                    id: subsegmento,
                    text:
                      subsegmentosDisponiveis.find(
                        (s) => s.codigo === subsegmento,
                      )?.nome || subsegmento,
                  }
                : { id: "", text: "Todos os Sub-segmentos" }
            }
            onChange={({ selectedItem }) =>
              setSubsegmento(selectedItem?.id || "")
            }
            style={{ minWidth: "220px" }}
          />

          <Dropdown
            id="historico-uf"
            data-testid="historico-filter-uf"
            titleText="UF (Todos os Estados)"
            label="Todas as UFs"
            disabled={loading}
            items={[
              { id: "", text: "Todas as UFs" },
              ...ESTADOS_BRASIL.map((e) => ({
                id: e.sigla,
                text: `${e.nome} (${e.sigla})`,
              })),
            ]}
            itemToString={(item) => (item ? item.text : "")}
            selectedItem={
              uf
                ? {
                    id: uf,
                    text: ESTADOS_BRASIL.find((e) => e.sigla === uf)
                      ? `${ESTADOS_BRASIL.find((e) => e.sigla === uf)?.nome} (${uf})`
                      : uf,
                  }
                : { id: "", text: "Todas as UFs" }
            }
            onChange={({ selectedItem }) => setUf(selectedItem?.id || "")}
            style={{ minWidth: "180px" }}
          />

          <Dropdown
            id="historico-faixa-valor"
            data-testid="historico-filter-faixa-valor"
            titleText="Faixa de Valor"
            label="Todas as faixas"
            disabled={loading}
            items={[
              { id: "", text: "Todas as faixas" },
              ...FAIXAS_VALOR_SPRINT7.map((f) => ({ id: f.id, text: f.label })),
            ]}
            itemToString={(item) => (item ? item.text : "")}
            selectedItem={
              faixaValor
                ? {
                    id: faixaValor,
                    text:
                      FAIXAS_VALOR_SPRINT7.find((f) => f.id === faixaValor)
                        ?.label || faixaValor,
                  }
                : { id: "", text: "Todas as faixas" }
            }
            onChange={({ selectedItem }) =>
              setFaixaValor(selectedItem?.id || "")
            }
            style={{ minWidth: "210px" }}
          />

          <div
            style={{ display: "flex", alignItems: "flex-end", gap: "0.5rem" }}
          >
            <TextInput
              id="historico-busca"
              data-testid="historico-filter-busca"
              labelText="Palavra-chave (mín. 3 letras)"
              placeholder="Ex: pavimentação, software, edital..."
              value={busca}
              disabled={loading}
              onChange={(e) => setBusca(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  void executarConsulta({
                    targetPage: 1,
                    targetPageSize: pageSize,
                    targetSortBy: sortBy,
                    targetSortDir: sortDir,
                  });
                }
              }}
              style={{ minWidth: "250px" }}
            />
            <Button
              kind="primary"
              size="md"
              renderIcon={Search}
              data-testid="btn-buscar-historico"
              disabled={loading}
              onClick={() =>
                void executarConsulta({
                  targetPage: 1,
                  targetPageSize: pageSize,
                  targetSortBy: sortBy,
                  targetSortDir: sortDir,
                })
              }
            >
              Buscar
            </Button>
            <Button
              kind="ghost"
              size="md"
              renderIcon={Reset}
              disabled={loading}
              onClick={handleLimparFiltros}
            >
              Limpar
            </Button>
          </div>
        </div>

        {validationError && (
          <div style={{ marginBottom: "1rem" }}>
            <InlineNotification
              kind="warning"
              title="Ajuste os filtros de busca"
              subtitle={validationError}
              hideCloseButton
              lowContrast
            />
          </div>
        )}

        {apiError && (
          <div style={{ marginBottom: "1rem" }}>
            <InlineNotification
              kind="error"
              title="Falha na consulta"
              subtitle={apiError}
              hideCloseButton
              lowContrast
            />
          </div>
        )}

        {!hasSearched ? (
          <Tile
            data-testid="historico-empty-initial"
            style={{
              padding: "3rem 2rem",
              textAlign: "center",
              marginTop: "1rem",
              border: "1px dashed var(--cds-border-subtle)",
            }}
          >
            <h3 style={{ margin: "0 0 0.5rem 0", fontSize: "1rem" }}>
              Defina os filtros e clique em &quot;Buscar&quot; para pesquisar no
              Histórico de Licitações
            </h3>
            <p
              style={{
                margin: 0,
                color: "var(--cds-text-secondary)",
                fontSize: "0.875rem",
              }}
            >
              A consulta não é disparada automaticamente ao abrir a tela para
              manter o sistema rápido. Você pode pesquisar licitações
              encerradas, em aberto e da categoria &quot;Outros&quot; em todo o
              Brasil (janelas de até {MAX_HISTORICO_DIAS_JANELA} dias).
            </p>
          </Tile>
        ) : (
          <>
            <TableContainer
              style={{ overflowX: "auto", maxWidth: "100%", marginTop: "1rem" }}
            >
              <Table
                className="pncp-opportunities-table"
                data-testid="historico-datatable"
              >
                <TableHead>
                  <TableRow>
                    {HEADERS.map((col) => {
                      const isActive = col.sortable && sortBy === col.key;
                      const carbonSortDir = !col.sortable
                        ? "NONE"
                        : isActive
                          ? sortDir === "desc"
                            ? "DESC"
                            : "ASC"
                          : "NONE";
                      return (
                        <TableHeader
                          key={col.key}
                          isSortable={col.sortable}
                          isSortHeader={isActive}
                          sortDirection={carbonSortDir}
                          onClick={
                            col.sortable
                              ? () =>
                                  handleSortHeader(
                                    col.key as OportunidadesSortBy,
                                  )
                              : undefined
                          }
                          style={col.style}
                        >
                          {col.label}
                        </TableHeader>
                      );
                    })}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {itens.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={HEADERS.length}>
                        <div
                          style={{
                            padding: "2rem",
                            textAlign: "center",
                            color: "var(--cds-text-secondary)",
                          }}
                        >
                          Nenhuma licitação encontrada para os filtros
                          informados neste período.
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    itens.map((item) => {
                      const titulo = resolverTituloExibicaoLicitacao(
                        item.miniResumo,
                        item.resumo,
                        item.tipoSistemaCodigo,
                      );
                      return (
                        <TableRow
                          key={item.id}
                          data-testid={`historico-row-${item.id}`}
                          onClick={() => abrirDossiePreservandoBusca(item.id)}
                          style={{ cursor: "pointer" }}
                        >
                          <TableCell style={{ whiteSpace: "nowrap" }}>
                            <span
                              style={{
                                fontFamily:
                                  "var(--cds-code-01-font-family, 'IBM Plex Mono', monospace)",
                              }}
                            >
                              {formatarDataExibicao(
                                item.dataEncerramentoProposta ||
                                  item.dataAbertura,
                              )}
                            </span>
                          </TableCell>
                          <TableCell style={{ wordBreak: "break-word" }}>
                            {item.orgaoNome} - {item.uf}
                          </TableCell>
                          <TableCell style={{ wordBreak: "break-word" }}>
                            <span
                              style={{ fontWeight: 500, lineHeight: 1.4 }}
                              title={String(item.resumo || titulo).slice(0, 300)}
                            >
                              {titulo}
                            </span>
                            {item.segmentoMacro === "OUTROS" && (
                              <Tag
                                type="cool-gray"
                                size="sm"
                                style={{ marginLeft: "0.5rem" }}
                              >
                                Outros
                              </Tag>
                            )}
                          </TableCell>
                          <TableCell style={{ whiteSpace: "nowrap" }}>
                            <span
                              style={{
                                fontFamily: "'IBM Plex Mono', monospace",
                              }}
                            >
                              {new Intl.NumberFormat("pt-BR", {
                                style: "currency",
                                currency: "BRL",
                              }).format(item.valorEstimado || 0)}
                            </span>
                          </TableCell>
                          <TableCell style={{ whiteSpace: "nowrap" }}>
                            {item.prazoEncerrado ? (
                              <Tag type="cool-gray" size="sm">
                                Prazo Encerrado
                              </Tag>
                            ) : (
                              <Tag type="green" size="sm">
                                Em Aberto
                              </Tag>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </TableContainer>

            <Pagination
              backwardText="Página anterior"
              forwardText="Próxima página"
              itemsPerPageText="Itens por página:"
              page={page}
              pageNumberText="Número da página"
              pageSize={pageSize}
              pageSizes={[10, 25, 50, 100]}
              totalItems={total}
              onChange={({ page: newPage, pageSize: newPageSize }) => {
                void executarConsulta({
                  targetPage: newPageSize !== pageSize ? 1 : newPage,
                  targetPageSize: newPageSize,
                  targetSortBy: sortBy,
                  targetSortDir: sortDir,
                  mensagemLoading: "Carregando página de resultados...",
                });
              }}
              data-testid="historico-pagination"
            />
          </>
        )}
      </Tile>

      <Modal
        open={loading}
        passiveModal
        preventCloseOnClickOutside
        modalHeading="Consultando Base de Licitações"
        size="xs"
        data-testid="historico-loading-modal"
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            padding: "0.75rem 0",
          }}
        >
          <InlineLoading status="active" description={loadingMsg} />
        </div>
      </Modal>
    </ModulePageShell>
  );
}
