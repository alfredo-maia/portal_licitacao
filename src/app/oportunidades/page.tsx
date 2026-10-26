"use client";

import React, { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Tag,
  Tile,
  DataTable,
  TableContainer,
  Table,
  TextArea,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell,
  TableToolbar,
  TableBatchActions,
  TableBatchAction,
  TableSelectAll,
  TableSelectRow,
  TableToolbarContent,
  TableToolbarSearch,
  TableToolbarMenu,
  TableToolbarAction,
  Button,
  Dropdown,
  Select,
  SelectItem,
  TextInput,
  Modal,
  Pagination,
} from "@carbon/react";
import { Checkmark, Close, CheckmarkOutline, CloseOutline, WarningAlt, Edit, TrashCan, Download, Search } from "@carbon/icons-react";
import { ModulePageShell } from "@/components/shell/module-page-shell";
import { TIPOS_SISTEMA_CATALOG } from "@/config/tipos-sistema";
import { FAIXAS_VALOR_SPRINT7 } from "@/lib/masks";
import { sintetizarMiniResumo } from "@/lib/resumo-licitacao";

export const MOTIVOS_RECUSA_GENERICOS = [
  "Não se encaixa no perfil ou core business da empresa",
  "Prazo de entrega ou execução incompatível",
  "Exigência de atestado técnico ou certidão não atendida",
  "Preço estimado inexequível / margem insuficiente",
  "Localização geográfica inviável / custo logístico elevado",
  "Edital com risco jurídico, técnico ou cláusulas restritivas",
  "Outro",
];

interface Oportunidade {
  id: string;
  dataAbertura: string;
  orgaoUF: string;
  miniResumo: string;
  resumoObjeto: string;
  valorEstimado: number;
  parecerIA: string;
  acoes: string;
  tipoSistemaCodigo?: string;
  numeroEdital?: string;
  orgaoNome?: string;
  orgaoCnpj?: string;
  uf?: string;
  status?: string;
  tipoSistema?: string;
}


export default function OportunidadesPage() {
  return (
    <Suspense fallback={<div>Carregando oportunidades...</div>}>
      <OportunidadesContent />
    </Suspense>
  );
}

function OportunidadesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [oportunidades, setOportunidades] = React.useState<Oportunidade[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [total, setTotal] = React.useState(0);

  const page = Number(searchParams.get("page")) || 1;
  const pageSize = Number(searchParams.get("pageSize")) || 10;

  const headers = [
    { key: "dataAbertura", header: "Data Limite (Proposta)" },
    { key: "orgaoUF", header: "Órgão e UF" },
    { key: "miniResumo", header: "Mini-resumo" },
    { key: "valorEstimado", header: "Valor Estimado" },
    { key: "parecerIA", header: "Parecer da IA" },
    { key: "acoes", header: "Ações Rápidas" },
  ];

  const [showManualModal, setShowManualModal] = React.useState(false);
  const [showImportModal, setShowImportModal] = React.useState(false);
  const [showRecusarModal, setShowRecusarModal] = React.useState(false);
  const [recusaMotivoGenerico, setRecusaMotivoGenerico] = React.useState(MOTIVOS_RECUSA_GENERICOS[0]);
  const [recusaMotivoCustom, setRecusaMotivoCustom] = React.useState("");
  const [selectedOpportunityId, setSelectedOpportunityId] = React.useState<string | null>(null);
  const [filtroTipoSistema, setFiltroTipoSistema] = React.useState('');
  const [filtroUf, setFiltroUf] = React.useState('');
  const [filtroFaixaValor, setFiltroFaixaValor] = React.useState('');
  const [filtroStatus, setFiltroStatus] = React.useState('');
  const [filtroParecerIA, setFiltroParecerIA] = React.useState('');
  const [filtroBusca, setFiltroBusca] = React.useState('');

  const [manualNumeroEdital, setManualNumeroEdital] = React.useState("");
  const [manualOrgaoNome, setManualOrgaoNome] = React.useState("");
  const [manualOrgaoCnpj, setManualOrgaoCnpj] = React.useState("");
  const [manualUf, setManualUf] = React.useState("");
  const [manualValorEstimado, setManualValorEstimado] = React.useState("");
  const [manualDataAbertura, setManualDataAbertura] = React.useState("");
  const [manualMiniResumo, setManualMiniResumo] = React.useState("");
  const [manualResumoObjeto, setManualResumoObjeto] = React.useState("");
  const [manualTipoSistema, setManualTipoSistema] = React.useState("");

  const [importJsonContent, setImportJsonContent] = React.useState("");

  const handleFileImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const content = e.target?.result as string;
          JSON.parse(content); // Valida se é um JSON válido
          setImportJsonContent(content);
        } catch (error) {
          alert("Erro: O arquivo não é um JSON válido.");
          setImportJsonContent("");
        }
      };
      reader.readAsText(file);
    }
  };

  const fetchOportunidades = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams(searchParams.toString()).toString();
      const response = await fetch(`/api/oportunidades?${query}`);
      if (!response.ok) {
        throw new Error("Erro ao carregar oportunidades");
      }
      const data = await response.json();
      const mappedOportunidades = (data.oportunidades || []).map((dto: any) => {
        const rawDate = dto.dataEncerramentoProposta || dto.dataAbertura;
        const d = new Date(rawDate);
        const dataStr = !isNaN(d.getTime())
          ? d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
          : "";
        const horaStr = !isNaN(d.getTime())
          ? d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
          : "";
        const dataExibicao = dataStr && horaStr && horaStr !== "00:00" ? `${dataStr} ${horaStr}` : dataStr;
        return {
          ...dto,
          miniResumo: sintetizarMiniResumo(dto.miniResumo || dto.resumo || (dto as any).objeto, dto.tipoSistemaCodigo),
          orgaoUF: `${dto.orgaoNome} - ${dto.uf}`,
          resumoObjeto: dto.resumo,
          acoes: "",
          dataAbertura: dataExibicao,
        };
      });
      setOportunidades(mappedOportunidades);
      setTotal(data.total ?? mappedOportunidades.length);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Um erro desconhecido ocorreu.");
    } finally {
      setLoading(false);
    }
  }, [searchParams]);

  React.useEffect(() => {
    fetchOportunidades();
  }, [fetchOportunidades]);

  // Inicializa os filtros com base na URL
  React.useEffect(() => {
    setFiltroTipoSistema(searchParams.get("tipoSistema") || "");
    setFiltroUf(searchParams.get("uf") || "");
    setFiltroFaixaValor(searchParams.get("faixaValor") || "");
    setFiltroStatus(searchParams.get("status") || "");
    setFiltroParecerIA(searchParams.get("parecerIA") || "");
    setFiltroBusca(searchParams.get("busca") || "");
  }, [searchParams]);

  const handleFilterChange = (filterName: string, value: string) => {
    const currentParams = new URLSearchParams(searchParams.toString());
    if (value) {
      currentParams.set(filterName, value);
    } else {
      currentParams.delete(filterName);
    }
    currentParams.set("page", "1");
    router.push(`/oportunidades?${currentParams.toString()}`);
  };

  const handleRecusarClick = (id: string) => {
    setSelectedOpportunityId(id);
    setRecusaMotivoGenerico(MOTIVOS_RECUSA_GENERICOS[0]);
    setRecusaMotivoCustom("");
    setShowRecusarModal(true);
  };

  const handleAceitarClick = async (id: string) => {
    try {
      const response = await fetch(`/api/oportunidades/${id}/decisao`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decisao: "GO" }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.message || errorData?.error || "Erro ao aceitar oportunidade");
      }
      await fetchOportunidades();
    } catch (err) {
      console.error("Erro ao aceitar oportunidade:", err);
      alert(err instanceof Error ? err.message : "Erro ao aceitar oportunidade. Tente novamente.");
    }
  };

  const handleConfirmRecusa = async () => {
    if (!selectedOpportunityId) return;
    const motivoFinal =
      recusaMotivoGenerico === "Outro"
        ? (recusaMotivoCustom.trim() || "Outro motivo não especificado")
        : recusaMotivoGenerico;

    try {
      const response = await fetch(`/api/oportunidades/${selectedOpportunityId}/decisao`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decisao: "NO_GO", motivoRecusa: motivoFinal }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.message || errorData?.error || "Erro ao recusar oportunidade");
      }
      await fetchOportunidades();
      setShowRecusarModal(false);
      setRecusaMotivoCustom("");
      setSelectedOpportunityId(null);
    } catch (err) {
      console.error("Erro ao recusar oportunidade:", err);
      alert(err instanceof Error ? err.message : "Erro ao recusar oportunidade. Tente novamente.");
    }
  };

  const handleSalvarManual = async () => {
    try {
      if (!manualNumeroEdital.trim()) {
        alert("Informe o número do edital.");
        return;
      }
      if (!manualOrgaoNome.trim()) {
        alert("Informe o nome do órgão.");
        return;
      }
      if (!manualOrgaoCnpj.trim() || manualOrgaoCnpj.trim().length < 11) {
        alert("Informe um CNPJ válido com pelo menos 11 dígitos.");
        return;
      }
      if (!manualUf.trim() || manualUf.trim().length !== 2) {
        alert("Informe a UF com 2 letras (ex: GO, SP).");
        return;
      }
      if (!manualTipoSistema) {
        alert("Selecione o tipo de sistema.");
        return;
      }

      // 1. Sanitizar valor estimado
      let valorLimpo = manualValorEstimado.replace(/[^\d,\.]/g, '').trim();
      if (valorLimpo.includes(',') && valorLimpo.includes('.')) {
        valorLimpo = valorLimpo.replace(/\./g, '').replace(',', '.');
      } else if (valorLimpo.includes(',')) {
        valorLimpo = valorLimpo.replace(',', '.');
      }
      const valorNum = parseFloat(valorLimpo);
      if (isNaN(valorNum) || valorNum < 0) {
        alert("Informe um valor estimado válido.");
        return;
      }

      // 2. Sanitizar data limite
      let dataIso: string;
      if (manualDataAbertura.includes('/')) {
        const parts = manualDataAbertura.trim().split(' ');
        const dateParts = parts[0].split('/');
        const dia = parseInt(dateParts[0], 10);
        const mes = parseInt(dateParts[1], 10) - 1;
        const ano = parseInt(dateParts[2], 10);
        let hora = 9;
        let min = 0;
        if (parts[1]) {
          const timeParts = parts[1].split(':');
          hora = parseInt(timeParts[0], 10) || 0;
          min = parseInt(timeParts[1], 10) || 0;
        }
        const d = new Date(ano, mes, dia, hora, min);
        if (isNaN(d.getTime())) {
          alert("Data inválida. Use o formato DD/MM/AAAA.");
          return;
        }
        dataIso = d.toISOString();
      } else if (manualDataAbertura.trim()) {
        const d = new Date(manualDataAbertura.trim());
        if (isNaN(d.getTime())) {
          alert("Data inválida. Use o formato DD/MM/AAAA.");
          return;
        }
        dataIso = d.toISOString();
      } else {
        const d = new Date(Date.now() + 15 * 24 * 3600 * 1000);
        dataIso = d.toISOString();
      }

      // 3. Mini-resumo: entre 2 e 5 palavras
      let miniResumoTratado = manualMiniResumo.trim();
      if (!miniResumoTratado) {
        miniResumoTratado = "Licitação do Órgão";
      } else {
        const words = miniResumoTratado.split(/\s+/).filter(Boolean);
        if (words.length < 2) {
          miniResumoTratado = `${miniResumoTratado} certame`;
        } else if (words.length > 5) {
          miniResumoTratado = words.slice(0, 4).join(' ');
        }
      }

      const resumoFinal =
        manualResumoObjeto.trim() ||
        manualMiniResumo.trim() ||
        `Contratação de soluções de tecnologia e serviços correlatos para o órgão ${manualOrgaoNome}.`;

      const response = await fetch("/api/oportunidades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          numeroEdital: manualNumeroEdital.trim(),
          orgaoNome: manualOrgaoNome.trim(),
          orgaoCnpj: manualOrgaoCnpj.trim(),
          uf: manualUf.trim().toUpperCase(),
          valorEstimado: valorNum,
          dataAbertura: dataIso,
          dataEncerramentoProposta: dataIso,
          miniResumo: miniResumoTratado,
          resumo: resumoFinal,
          tipoSistemaCodigo: manualTipoSistema,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        const msg =
          errData?.issues?.[0]?.message ||
          errData?.message ||
          errData?.error ||
          "Erro ao adicionar oportunidade manualmente.";
        throw new Error(msg);
      }

      await fetchOportunidades();
      setShowManualModal(false);
      setManualNumeroEdital("");
      setManualOrgaoNome("");
      setManualOrgaoCnpj("");
      setManualUf("");
      setManualValorEstimado("");
      setManualDataAbertura("");
      setManualMiniResumo("");
      setManualResumoObjeto("");
      setManualTipoSistema("");
      alert("Oportunidade adicionada com sucesso!");
    } catch (err) {
      console.error("Erro ao salvar oportunidade manual:", err);
      alert(err instanceof Error ? err.message : "Erro ao salvar oportunidade manual. Tente novamente.");
    }
  };

  const handleImportarJson = async () => {
    try {
      const response = await fetch("/api/ingestao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: importJsonContent,
      });
      if (!response.ok) {
        throw new Error("Erro ao importar relatório JSON");
      }
      const data = await response.json();
      alert(`Importação concluída:\nCriados: ${data.criados}\nAtualizados: ${data.atualizados}\nInalterados: ${data.inalterados}`);
      fetchOportunidades();
      setShowImportModal(false);
      setImportJsonContent(""); // Limpa o campo após a importação
    } catch (err) {
      console.error("Erro ao importar JSON:", err);
      alert("Erro ao importar JSON. Verifique o formato e tente novamente.");
    }
  };

  return (
    <ModulePageShell routePath="/oportunidades">
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
          <h2 style={{ margin: 0, fontSize: "1.125rem" }}>
            Central de Triagem e Deliberação (Participar / Não Participar)
          </h2>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <Tag type="green" renderIcon={CheckmarkOutline}>
              Participar - Recomendado
            </Tag>
            <Tag type="warm-gray" renderIcon={WarningAlt}>
              AVALIAR DIRETORIA
            </Tag>
            <Tag type="red" renderIcon={CloseOutline}>
              Não Participar
            </Tag>
          </div>
        </div>

        <div data-testid="oportunidades-filters" style={{ marginBottom: "1rem", display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "flex-end" }}>
          <Dropdown
            id="filter-tipo-sistema"
            data-testid="filter-tipo-sistema"
            titleText="Tipo de Sistema"
            label="Selecione um tipo"
            items={[
              { id: "", text: "Todos" },
              ...TIPOS_SISTEMA_CATALOG.map((tipo) => ({ id: tipo.codigo, text: tipo.nome })),
            ]}
            itemToString={(item) => (item ? item.text : "")}
            selectedItem={filtroTipoSistema ? { id: filtroTipoSistema, text: TIPOS_SISTEMA_CATALOG.find(t => t.codigo === filtroTipoSistema)?.nome || "" } : null}
            onChange={({ selectedItem }) => handleFilterChange("tipoSistema", selectedItem?.id || "")}
            style={{ minWidth: "200px" }}
          />
          <Dropdown
            id="filter-uf"
            data-testid="filter-uf"
            titleText="UF"
            label="Selecione um estado"
            items={[
              { id: "", text: "Todas" },
              { id: "SP", text: "São Paulo" },
              { id: "RJ", text: "Rio de Janeiro" },
              { id: "MG", text: "Minas Gerais" },
              { id: "BA", text: "Bahia" },
              { id: "DF", text: "Distrito Federal" },
              { id: "GO", text: "Goiás" },
            ]}
            itemToString={(item) => (item ? item.text : "")}
            selectedItem={filtroUf ? { id: filtroUf, text: filtroUf } : null}
            onChange={({ selectedItem }) => handleFilterChange("uf", selectedItem?.id || "")}
            style={{ minWidth: "150px" }}
          />
          <Dropdown
            id="filter-faixa-valor"
            data-testid="filter-faixa-valor"
            titleText="Faixa de Valor"
            label="Selecione uma faixa"
            items={FAIXAS_VALOR_SPRINT7.map((f) => ({ id: f.id, text: f.label }))}
            itemToString={(item) => (item ? item.text : "")}
            selectedItem={
              filtroFaixaValor
                ? {
                    id: filtroFaixaValor,
                    text: FAIXAS_VALOR_SPRINT7.find((f) => f.id === filtroFaixaValor)?.label || "",
                  }
                : null
            }
            onChange={({ selectedItem }) => handleFilterChange("faixaValor", selectedItem?.id || "")}
            style={{ minWidth: "220px" }}
          />
          <Dropdown
            id="filter-status"
            data-testid="filter-status"
            titleText="Status"
            label="Pendente (Padrão)"
            items={[
              { id: "", text: "Pendente (Padrão)" },
              { id: "ACEITA", text: "Aceita" },
              { id: "RECUSADA", text: "Recusada (Arquivada)" },
              { id: "TODOS", text: "Todas" },
            ]}
            itemToString={(item) => (item ? item.text : "")}
            selectedItem={
              filtroStatus === "TODOS"
                ? { id: "TODOS", text: "Todas" }
                : filtroStatus === "RECUSADA"
                ? { id: "RECUSADA", text: "Recusada (Arquivada)" }
                : filtroStatus === "ACEITA"
                ? { id: "ACEITA", text: "Aceita" }
                : filtroStatus === "PENDENTE"
                ? { id: "PENDENTE", text: "Pendente (Padrão)" }
                : null
            }
            onChange={({ selectedItem }) => handleFilterChange("status", selectedItem?.id || "")}
            style={{ minWidth: "170px" }}
          />
          <Dropdown
            id="filter-parecer-ia"
            data-testid="filter-parecer-ia"
            titleText="Parecer da IA"
            label="Selecione um parecer"
            items={[
              { id: "", text: "Todos" },
              { id: "GO", text: "Participar" },
              { id: "AVALIAR", text: "AVALIAR" },
              { id: "NO_GO", text: "Não Participar" },
            ]}
            itemToString={(item) => (item ? item.text : "")}
            selectedItem={
              filtroParecerIA
                ? {
                    id: filtroParecerIA,
                    text:
                      filtroParecerIA === "GO"
                        ? "Participar"
                        : filtroParecerIA === "NO_GO"
                        ? "Não Participar"
                        : filtroParecerIA,
                  }
                : null
            }
            onChange={({ selectedItem }) => handleFilterChange("parecerIA", selectedItem?.id || "")}
            style={{ minWidth: "160px" }}
          />
          <div style={{ display: "flex", alignItems: "flex-end", gap: "0.5rem" }}>
            <TextInput
              id="filter-busca"
              data-testid="filter-busca"
              labelText="Busca por palavra-chave"
              placeholder="Digite o termo e clique em buscar..."
              value={filtroBusca}
              onChange={(e) => setFiltroBusca(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleFilterChange("busca", filtroBusca);
                }
              }}
              style={{ minWidth: "240px" }}
            />
            <Button
              kind="secondary"
              size="md"
              renderIcon={Search}
              id="btn-executar-busca-oportunidades"
              onClick={() => handleFilterChange("busca", filtroBusca)}
            >
              Buscar
            </Button>
          </div>
        </div>

        {loading && <p>Carregando oportunidades...</p>}
        {error && <p style={{ color: "red" }}>Erro: {error}</p>}

        {!loading && !error && (
          <>
            <DataTable
            rows={oportunidades}
            headers={headers}
            data-testid="oportunidades-datatable"
            render={({
              rows,
              headers,
              getHeaderProps,
              getRowProps,
              getBatchActionProps,
              onInputChange,
              selectedRows,
              getSelectionProps,
            }) => (
                <TableContainer style={{ overflowX: "auto", maxWidth: "100%" }}>
                <TableToolbar>
                  <TableBatchActions {...getBatchActionProps()}>
                    <TableBatchAction
                      tabIndex={getBatchActionProps().shouldShowBatchActions ? 0 : -1}
                      onClick={() => {}}
                    >
                      Excluir
                    </TableBatchAction>
                    <TableBatchAction
                      tabIndex={getBatchActionProps().shouldShowBatchActions ? 0 : -1}
                      onClick={() => {}}
                    >
                      Marcar como lido
                    </TableBatchAction>
                  </TableBatchActions>
                  <TableToolbarContent>
                    <TableToolbarSearch
                      id="search-oportunidades"
                      persistent
                      labelText="Filtrar tabela..."
                      placeholder="Filtrar tabela..."
                      onChange={onInputChange}
                    />
                    <TableToolbarMenu>
                      <TableToolbarAction onClick={() => alert("Download")}>
                        <Download size={16} />
                      </TableToolbarAction>
                      <TableToolbarAction onClick={() => alert("Editar")}>
                        <Edit size={16} />
                      </TableToolbarAction>
                      <TableToolbarAction onClick={() => alert("Deletar")}>
                        <TrashCan size={16} />
                      </TableToolbarAction>
                    </TableToolbarMenu>
                    <Button
                      onClick={() => setShowManualModal(true)}
                      kind="primary"
                      data-testid="btn-open-manual-modal"
                      style={{ maxWidth: "230px", whiteSpace: "nowrap" }}
                    >
                      + Adicionar Manualmente
                    </Button>
                    <Button
                      onClick={() => setShowImportModal(true)}
                      kind="ghost"
                      size="sm"
                      data-testid="btn-open-import-modal"
                    >
                      Importar JSON
                    </Button>
                  </TableToolbarContent>
                </TableToolbar>
                <Table className="pncp-opportunities-table">
                  <TableHead>
                    <TableRow>
                      <TableSelectAll {...getSelectionProps()} />
                      {headers.map((header) => {
                        let headerStyle: React.CSSProperties = {};
                        if (header.key === "dataAbertura") {
                          headerStyle = { width: "115px", whiteSpace: "nowrap" };
                        } else if (header.key === "orgaoUF") {
                          headerStyle = { width: "18%" };
                        } else if (header.key === "miniResumo") {
                          headerStyle = { width: "42%" };
                        } else if (header.key === "valorEstimado") {
                          headerStyle = { width: "130px", whiteSpace: "nowrap" };
                        } else if (header.key === "parecerIA") {
                          headerStyle = { width: "110px", whiteSpace: "nowrap" };
                        } else if (header.key === "acoes") {
                          headerStyle = { width: "80px", whiteSpace: "nowrap", textAlign: "center" };
                        }
                        return (
                          <TableHeader
                            {...getHeaderProps({ header })}
                            style={headerStyle}
                          >
                            {header.header}
                          </TableHeader>
                        );
                      })}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow
                        {...getRowProps({ row })}
                        data-testid={`oportunidade-row-${row.id}`}
                        onClick={() => router.push(`/oportunidades/${row.id}`)}
                        style={{ cursor: "pointer" }}
                      >
                        <TableSelectRow {...getSelectionProps({ row })} />
                        {row.cells.map((cell) => (
                          <TableCell
                            key={cell.id}
                            style={
                              cell.info.header === "dataAbertura"
                                ? { whiteSpace: "nowrap" }
                                : cell.info.header === "orgaoUF"
                                ? { wordBreak: "break-word" }
                                : cell.info.header === "miniResumo"
                                ? { wordBreak: "break-word" }
                                : cell.info.header === "valorEstimado"
                                ? { whiteSpace: "nowrap" }
                                : cell.info.header === "parecerIA"
                                ? { whiteSpace: "nowrap" }
                                : cell.info.header === "acoes"
                                ? { width: "80px", textAlign: "center", padding: "0 0.25rem" }
                                : undefined
                            }
                          >
                            {cell.info.header === "dataAbertura" ? (
                              <span
                                style={{
                                  fontFamily: "var(--cds-code-01-font-family, 'IBM Plex Mono', monospace)",
                                }}
                              >
                                {cell.value}
                              </span>
                            ) : cell.info.header === "valorEstimado" ? (
                              <span
                                style={{ fontFamily: "'IBM Plex Mono', monospace" }}
                                data-testid="valor-estimado-cell"
                              >
                                {new Intl.NumberFormat("pt-BR", {
                                  style: "currency",
                                  currency: "BRL",
                                }).format(cell.value)}
                              </span>
                            ) : cell.info.header === "parecerIA" ? (
                              <Tag
                                type={
                                  cell.value === "GO"
                                    ? "green"
                                    : cell.value === "AVALIAR"
                                    ? "warm-gray"
                                    : "red"
                                }
                                renderIcon={
                                  cell.value === "GO"
                                    ? CheckmarkOutline
                                    : cell.value === "AVALIAR"
                                    ? WarningAlt
                                    : CloseOutline
                                }
                              >
                                {cell.value}
                              </Tag>
                            ) : cell.info.header === "miniResumo" ? (
                              <div
                                style={{
                                  display: "flex",
                                  flexDirection: "column",
                                  alignItems: "flex-start",
                                  gap: "0.35rem",
                                  wordBreak: "break-word",
                                  lineHeight: 1.4,
                                }}
                              >
                                <span style={{ fontWeight: 500 }}>{cell.value}</span>
                                {oportunidades.find((opp: Oportunidade) => opp.id === row.id)?.tipoSistemaCodigo && (
                                  <div>
                                    <Tag type="gray" size="sm" style={{ margin: 0 }}>
                                      {oportunidades.find((opp: Oportunidade) => opp.id === row.id)?.tipoSistemaCodigo}
                                    </Tag>
                                  </div>
                                )}
                              </div>
                            ) : cell.info.header === "resumoObjeto" ? (
                              <span title={String(cell.value)}>
                                {String(cell.value).substring(0, 100)}...
                              </span>
                            ) : cell.info.header === "acoes" ? (
                              <div
                                onClick={(e) => e.stopPropagation()}
                                style={{
                                  display: "flex",
                                  gap: "0.4rem",
                                  alignItems: "center",
                                  justifyContent: "center",
                                }}
                              >
                                <button
                                  type="button"
                                  data-testid={`btn-aceitar-${row.id}`}
                                  title="Participar"
                                  aria-label="Participar"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleAceitarClick(row.id);
                                  }}
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    width: "30px",
                                    height: "30px",
                                    borderRadius: "4px",
                                    border: "1px solid rgba(36, 161, 72, 0.3)",
                                    background: "rgba(36, 161, 72, 0.08)",
                                    color: "#24a148",
                                    cursor: "pointer",
                                    transition: "all 0.15s ease",
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.background = "#24a148";
                                    e.currentTarget.style.color = "#ffffff";
                                    e.currentTarget.style.borderColor = "#24a148";
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.background = "rgba(36, 161, 72, 0.08)";
                                    e.currentTarget.style.color = "#24a148";
                                    e.currentTarget.style.borderColor = "rgba(36, 161, 72, 0.3)";
                                  }}
                                >
                                  <Checkmark size={18} />
                                </button>
                                <button
                                  type="button"
                                  data-testid={`btn-recusar-${row.id}`}
                                  title="Não Participar"
                                  aria-label="Não Participar"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRecusarClick(row.id);
                                  }}
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    width: "30px",
                                    height: "30px",
                                    borderRadius: "4px",
                                    border: "1px solid rgba(218, 30, 40, 0.3)",
                                    background: "rgba(218, 30, 40, 0.08)",
                                    color: "#da1e28",
                                    cursor: "pointer",
                                    transition: "all 0.15s ease",
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.background = "#da1e28";
                                    e.currentTarget.style.color = "#ffffff";
                                    e.currentTarget.style.borderColor = "#da1e28";
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.background = "rgba(218, 30, 40, 0.08)";
                                    e.currentTarget.style.color = "#da1e28";
                                    e.currentTarget.style.borderColor = "rgba(218, 30, 40, 0.3)";
                                  }}
                                >
                                  <Close size={18} />
                                </button>
                              </div>
                            ) : (
                              cell.value
                            )}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          />
          <Pagination
            backwardText="Página anterior"
            forwardText="Próxima página"
            itemsPerPageText="Itens por página:"
            page={page}
            pageNumberText="Número da página"
            pageSize={pageSize}
            pageSizes={[10, 25, 50]}
            totalItems={total}
            onChange={({ page: newPage, pageSize: newPageSize }) => {
              const currentParams = new URLSearchParams(searchParams.toString());
              currentParams.set("page", String(newPage));
              currentParams.set("pageSize", String(newPageSize));
              router.push(`/oportunidades?${currentParams.toString()}`);
            }}
            data-testid="oportunidades-pagination"
          />
        </>
        )}
       </Tile>

       {/* Modal Adicionar Licitação Manualmente */}
       <Modal
         open={showManualModal}
         onRequestClose={() => setShowManualModal(false)}
         modalHeading="+ Adicionar Licitação Manualmente"
         passiveModal
         data-testid="modal-adicionar-manual"
       >
         <p style={{ marginBottom: "1rem" }}>
           Preencha os campos abaixo para adicionar uma nova licitação manualmente.
         </p>
         <TextInput id="input-manual-edital" data-testid="input-manual-edital" labelText="Número do Edital" placeholder="Ex: 001/2026" value={manualNumeroEdital} onChange={(e) => setManualNumeroEdital(e.target.value)} style={{ marginBottom: "1rem" }} />
         <TextInput id="input-manual-orgao" data-testid="input-manual-orgao" labelText="Órgão" placeholder="Ex: Prefeitura de São Paulo" value={manualOrgaoNome} onChange={(e) => setManualOrgaoNome(e.target.value)} style={{ marginBottom: "1rem" }} />
         <TextInput id="input-manual-cnpj" data-testid="input-manual-cnpj" labelText="CNPJ do Órgão" placeholder="Ex: 00.000.000/0000-00" value={manualOrgaoCnpj} onChange={(e) => setManualOrgaoCnpj(e.target.value)} style={{ marginBottom: "1rem" }} />
         <TextInput id="input-manual-uf" data-testid="input-manual-uf" labelText="UF" placeholder="Ex: SP" value={manualUf} onChange={(e) => setManualUf(e.target.value)} style={{ marginBottom: "1rem" }} />
         <TextInput id="input-manual-valor" data-testid="input-manual-valor" labelText="Valor Estimado" placeholder="Ex: 1500000.00" value={manualValorEstimado} onChange={(e) => setManualValorEstimado(e.target.value)} style={{ marginBottom: "1rem" }} />
         <TextInput id="input-manual-abertura" data-testid="input-manual-abertura" labelText="Data Limite para Envio da Proposta" placeholder="DD/MM/AAAA" value={manualDataAbertura} onChange={(e) => setManualDataAbertura(e.target.value)} style={{ marginBottom: "1rem" }} />
         <TextInput id="input-manual-mini-resumo" data-testid="input-manual-mini-resumo" labelText="Mini-resumo" placeholder="Ex: Aquisição de equipamentos" value={manualMiniResumo} onChange={(e) => setManualMiniResumo(e.target.value)} style={{ marginBottom: "1rem" }} />
         <TextInput id="input-manual-resumo" data-testid="input-manual-resumo" labelText="Resumo do Objeto" placeholder="Ex: Aquisição de equipamentos de informática para secretarias..." value={manualResumoObjeto} onChange={(e) => setManualResumoObjeto(e.target.value)} style={{ marginBottom: "1rem" }} />
         <Dropdown
           id="input-manual-tipo-sistema"
           data-testid="input-manual-tipo-sistema"
           titleText="Tipo de Sistema"
           label="Selecione um tipo"
           items={TIPOS_SISTEMA_CATALOG.map((tipo) => ({ id: tipo.codigo, text: tipo.nome }))}
           itemToString={(item) => (item ? item.text : "")}
           selectedItem={manualTipoSistema ? { id: manualTipoSistema, text: TIPOS_SISTEMA_CATALOG.find(t => t.codigo === manualTipoSistema)?.nome || "" } : null}
           onChange={({ selectedItem }) => setManualTipoSistema(selectedItem?.id || "")}
           style={{ marginBottom: "1rem" }}
         />
         <div className="cds--modal-footer">
           <Button kind="secondary" onClick={() => setShowManualModal(false)}>
             Cancelar
           </Button>
           <Button kind="primary" onClick={handleSalvarManual} data-testid="btn-salvar-manual">
             Adicionar
           </Button>
         </div>
       </Modal>

       {/* Modal Importar Relatório (JSON) */}
       <Modal
         open={showImportModal}
         onRequestClose={() => setShowImportModal(false)}
         modalHeading="Importar Relatório (JSON)"
         passiveModal
         data-testid="modal-importar-json"
       >
         <p style={{ marginBottom: "1rem" }}>
           Cole o conteúdo JSON do relatório de licitações ou faça upload de um arquivo.
         </p>
         <TextInput
           type="file"
           id="input-file-json"
           data-testid="input-file-json"
           labelText="Carregar arquivo JSON"
           accept=".json"
           onChange={handleFileImport}
           style={{ marginBottom: "1rem" }}
         />
         <TextArea
           id="import-json-content"
           data-testid="textarea-import-json"
           labelText="Ou cole o conteúdo JSON aqui"
           placeholder={'[{ "id": "...", "dataAbertura": "..." }]'}
           rows={10}
           value={importJsonContent}
           onChange={(e) => setImportJsonContent(e.target.value)}
           style={{ marginBottom: "1rem" }}
         />
         <div className="cds--modal-footer">
           <Button kind="secondary" onClick={() => setShowImportModal(false)}>
             Cancelar
           </Button>
           <Button kind="primary" onClick={handleImportarJson} data-testid="btn-confirmar-importacao">
             Importar
           </Button>
         </div>
       </Modal>

       {/* Modal Recusar Licitação */}
       <Modal
         open={showRecusarModal}
         onRequestClose={() => {
           setShowRecusarModal(false);
           setRecusaMotivoCustom("");
         }}
         modalHeading="Recusar Oportunidade"
         primaryButtonText="Confirmar Recusa"
         secondaryButtonText="Cancelar"
         danger
         onRequestSubmit={handleConfirmRecusa}
         onSecondarySubmit={() => {
           setShowRecusarModal(false);
           setRecusaMotivoCustom("");
         }}
         data-testid="modal-recusar-licitacao"
       >
         <p style={{ marginBottom: "1rem" }}>
           Selecione um motivo genérico para a recusa ou escolha &quot;Outro&quot; para especificar:
         </p>
         <div style={{ marginBottom: "1rem" }}>
           <Select
             id="select-motivo-recusa"
             labelText="Motivo da Recusa"
             data-testid="select-motivo-recusa"
             value={recusaMotivoGenerico}
             onChange={(e) => setRecusaMotivoGenerico(e.target.value)}
           >
             {MOTIVOS_RECUSA_GENERICOS.map((motivo) => (
               <SelectItem key={motivo} value={motivo} text={motivo} />
             ))}
           </Select>
         </div>
         {recusaMotivoGenerico === "Outro" && (
           <div style={{ marginBottom: "1rem" }}>
             <TextInput
               id="input-motivo-recusa"
               labelText="Especifique o Motivo da Recusa"
               placeholder="Descreva o motivo da recusa..."
               value={recusaMotivoCustom}
               onChange={(e) => setRecusaMotivoCustom(e.target.value)}
               data-testid="input-motivo-recusa"
             />
           </div>
         )}
       </Modal>
     </ModulePageShell>
   );
 }