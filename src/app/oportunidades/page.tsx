"use client";

import React, { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ActionableNotification,
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
  TableToolbarContent,
  TableToolbarSearch,
  Button,
  Dropdown,
  MultiSelect,
  Select,
  SelectItem,
  TextInput,
  Modal,
  Pagination,
  Tooltip,
  InlineLoading,
} from "@carbon/react";
import { Checkmark, Close, CheckmarkOutline, CloseOutline, WarningAlt, Search } from "@carbon/icons-react";
import { ModulePageShell } from "@/components/shell/module-page-shell";
import { useTenantSubscription } from "@/hooks/use-tenant-subscription";
import { FileDropZone } from "@/components/ui/file-drop-zone";
import { ESTADOS_BRASIL } from "@/config/estados";
import { FAIXAS_VALOR_SPRINT7, maskCnpj } from "@/lib/masks";
import { isValidCnpj } from "@/lib/validations/cnpj";
import { sintetizarMiniResumo } from "@/lib/resumo-licitacao";
import { CATALOGO_MACRO_SEGMENTOS, type MacroSegmento } from "@/server/schemas/segmentos.schema";

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
  const { isReadOnly } = useTenantSubscription();

  const headers = [
    { key: "dataAbertura", header: "Data Limite (Proposta)", isSortable: true },
    { key: "orgaoUF", header: "Órgão e UF", isSortable: true },
    { key: "miniResumo", header: "Objeto", isSortable: true },
    { key: "valorEstimado", header: "Valor Estimado", isSortable: true },
    { key: "acoes", header: "Ações Rápidas", isSortable: false },
  ];

  const [showManualModal, setShowManualModal] = React.useState(false);
  const [showImportModal, setShowImportModal] = React.useState(false);
  const [showRecusarModal, setShowRecusarModal] = React.useState(false);
  const [loadingModalOpen, setLoadingModalOpen] = React.useState(false);
  const [loadingModalMsg, setLoadingModalMsg] = React.useState("Processando deliberação...");
  const [recusaMotivoGenerico, setRecusaMotivoGenerico] = React.useState(MOTIVOS_RECUSA_GENERICOS[0]);
  const [recusaMotivoCustom, setRecusaMotivoCustom] = React.useState("");
  const [selectedOpportunityId, setSelectedOpportunityId] = React.useState<string | null>(null);
  const [loadingPreferencias, setLoadingPreferencias] = React.useState(true);
  const [configuracaoPendente, setConfiguracaoPendente] = React.useState(false);
  const [preferencias, setPreferencias] = React.useState<{
    segmentos: string[];
    subsegmentos: string[];
    ufs: string[];
    brasilInteiro: boolean;
  } | null>(null);
  const [filtroSegmento, setFiltroSegmento] = React.useState('');
  const [filtroSubsegmento, setFiltroSubsegmento] = React.useState('');
  const [filtroUf, setFiltroUf] = React.useState('');
  const [filtroFaixaValor, setFiltroFaixaValor] = React.useState('');
  const [filtroStatus, setFiltroStatus] = React.useState('');
  const [filtroBusca, setFiltroBusca] = React.useState('');

  const [manualNumeroEdital, setManualNumeroEdital] = React.useState("");
  const [manualOrgaoNome, setManualOrgaoNome] = React.useState("");
  const [manualOrgaoCnpj, setManualOrgaoCnpj] = React.useState("");
  const [manualUf, setManualUf] = React.useState("");
  const [manualSegmento, setManualSegmento] = React.useState("");
  const [manualSubsegmento, setManualSubsegmento] = React.useState("");
  const [manualValorEstimado, setManualValorEstimado] = React.useState("");
  const [manualDataAbertura, setManualDataAbertura] = React.useState("");
  const [manualMiniResumo, setManualMiniResumo] = React.useState("");
  const [manualResumoObjeto, setManualResumoObjeto] = React.useState("");

  const [importJsonContent, setImportJsonContent] = React.useState("");
  const [jsonFile, setJsonFile] = React.useState<File | null>(null);

  const processJsonFile = (file: File) => {
    setJsonFile(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        JSON.parse(content);
        setImportJsonContent(content);
      } catch {
        alert("Erro: O arquivo não é um JSON válido.");
        setImportJsonContent("");
      }
    };
    reader.readAsText(file);
  };

  const handleFileImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      processJsonFile(file);
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
      if (data.configuracaoPendente) {
        setConfiguracaoPendente(true);
      } else {
        setConfiguracaoPendente(false);
      }
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

  // Carrega preferências do Tenant
  const carregarPreferencias = React.useCallback(() => {
    setLoadingPreferencias(true);
    fetch("/api/tenant/preferencias")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && data.ok) {
          setPreferencias(data);
          if (!data.segmentos || data.segmentos.length === 0) {
            setConfiguracaoPendente(true);
          }
        }
      })
      .catch(() => undefined)
      .finally(() => setLoadingPreferencias(false));
  }, []);

  React.useEffect(() => {
    carregarPreferencias();

    const handleTenantChanged = () => {
      carregarPreferencias();
      fetchOportunidades();
    };
    window.addEventListener("tenant-changed", handleTenantChanged);
    return () => window.removeEventListener("tenant-changed", handleTenantChanged);
  }, [carregarPreferencias, fetchOportunidades]);

  // Inicializa os filtros com base na URL
  React.useEffect(() => {
    setFiltroSegmento(searchParams.get("segmento") || "");
    setFiltroSubsegmento(searchParams.get("subsegmento") || "");
    setFiltroUf(searchParams.get("uf") || "");
    setFiltroFaixaValor(searchParams.get("faixaValor") || "");
    setFiltroStatus(searchParams.get("status") || "");
    setFiltroBusca(searchParams.get("busca") || "");
  }, [searchParams]);

  const handleFiltersChange = (updates: Record<string, string>) => {
    const currentParams = new URLSearchParams(searchParams.toString());
    for (const [filterName, value] of Object.entries(updates)) {
      if (value) {
        currentParams.set(filterName, value);
      } else {
        currentParams.delete(filterName);
      }
    }
    currentParams.set("page", "1");
    router.push(`/oportunidades?${currentParams.toString()}`);
  };

  const handleFilterChange = (filterName: string, value: string) => {
    handleFiltersChange({ [filterName]: value });
  };

  const [deliberandoId, setDeliberandoId] = React.useState<string | null>(null);

  const handleRecusarClick = (id: string) => {
    setSelectedOpportunityId(id);
    setRecusaMotivoGenerico(MOTIVOS_RECUSA_GENERICOS[0]);
    setRecusaMotivoCustom("");
    setShowRecusarModal(true);
  };

  const handleAceitarClick = async (id: string) => {
    setDeliberandoId(id);
    setLoadingModalMsg("Processando participação na licitação...");
    setLoadingModalOpen(true);
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
      // Remoção otimista local mantendo todos os filtros ativos sem recarregar a janela
      setOportunidades((prev) => prev.filter((o) => o.id !== id));
      setTotal((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.error("Erro ao aceitar oportunidade:", err);
      alert(err instanceof Error ? err.message : "Erro ao aceitar oportunidade. Tente novamente.");
    } finally {
      setDeliberandoId(null);
      setLoadingModalOpen(false);
    }
  };

  const handleConfirmRecusa = async () => {
    if (!selectedOpportunityId) return;
    const recusaId = selectedOpportunityId;
    const motivoFinal =
      recusaMotivoGenerico === "Outro"
        ? (recusaMotivoCustom.trim() || "Outro motivo não especificado")
        : recusaMotivoGenerico;

    setShowRecusarModal(false);
    setLoadingModalMsg("Registrando recusa da oportunidade...");
    setLoadingModalOpen(true);
    setDeliberandoId(recusaId);
    try {
      const response = await fetch(`/api/oportunidades/${recusaId}/decisao`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decisao: "NO_GO", motivoRecusa: motivoFinal }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.message || errorData?.error || "Erro ao recusar oportunidade");
      }
      // Remoção otimista local mantendo todos os filtros ativos sem recarregar a janela
      setOportunidades((prev) => prev.filter((o) => o.id !== recusaId));
      setTotal((prev) => Math.max(0, prev - 1));
      setRecusaMotivoCustom("");
      setSelectedOpportunityId(null);
    } catch (err) {
      console.error("Erro ao recusar oportunidade:", err);
      alert(err instanceof Error ? err.message : "Erro ao recusar oportunidade. Tente novamente.");
    } finally {
      setDeliberandoId(null);
      setLoadingModalOpen(false);
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
      const cnpjDigits = manualOrgaoCnpj.replace(/\D/g, "");
      if (cnpjDigits.length !== 14 || !isValidCnpj(manualOrgaoCnpj)) {
        alert("Informe um CNPJ do órgão válido com 14 dígitos.");
        return;
      }
      if (!manualUf.trim() || manualUf.trim().length !== 2) {
        alert("Selecione a UF da licitação.");
        return;
      }
      if (!manualSegmento) {
        alert("Selecione o Segmento / Ramo da licitação.");
        return;
      }

      // 1. Sanitizar e validar valor estimado
      let valorLimpo = manualValorEstimado.replace(/[^\d,\.]/g, "").trim();
      if (valorLimpo.includes(",") && valorLimpo.includes(".")) {
        valorLimpo = valorLimpo.replace(/\./g, "").replace(",", ".");
      } else if (valorLimpo.includes(",")) {
        valorLimpo = valorLimpo.replace(",", ".");
      }
      const valorNum = parseFloat(valorLimpo);
      if (isNaN(valorNum) || valorNum <= 0) {
        alert("Informe um valor estimado válido maior que zero.");
        return;
      }

      // 2. Sanitizar data limite
      let dataIso: string;
      if (manualDataAbertura.includes("/")) {
        const parts = manualDataAbertura.trim().split(" ");
        const dateParts = parts[0].split("/");
        const dia = parseInt(dateParts[0], 10);
        const mes = parseInt(dateParts[1], 10) - 1;
        const ano = parseInt(dateParts[2], 10);
        let hora = 9;
        let min = 0;
        if (parts[1]) {
          const timeParts = parts[1].split(":");
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
          miniResumoTratado = words.slice(0, 4).join(" ");
        }
      }

      const resumoFinal =
        manualResumoObjeto.trim() ||
        manualMiniResumo.trim() ||
        `Contratação para o órgão ${manualOrgaoNome}.`;

      const response = await fetch("/api/oportunidades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          numeroEdital: manualNumeroEdital.trim(),
          orgaoNome: manualOrgaoNome.trim(),
          orgaoCnpj: maskCnpj(manualOrgaoCnpj.trim()),
          uf: manualUf.trim().toUpperCase(),
          valorEstimado: valorNum,
          dataAbertura: dataIso,
          dataEncerramentoProposta: dataIso,
          miniResumo: miniResumoTratado,
          resumo: resumoFinal,
          tipoSistemaCodigo: "OUTROS",
          segmentoMacro: manualSegmento,
          subsegmento: manualSubsegmento || undefined,
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
      setManualSegmento("");
      setManualSubsegmento("");
      setManualValorEstimado("");
      setManualDataAbertura("");
      setManualMiniResumo("");
      setManualResumoObjeto("");
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

        {configuracaoPendente && (
          <div style={{ marginBottom: "1.5rem" }} data-testid="banner-configuracao-pendente">
            <ActionableNotification
              kind="warning"
              title="Configuração de Segmentos Pendente"
              subtitle="Este CNPJ ainda não possui segmentos ou estados (UFs) de atuação configurados. Para visualizar as oportunidades capturadas pelo robô, defina suas preferências de mercado em Configurações."
              actionButtonLabel="Configurar Agora"
              onActionButtonClick={() => router.push("/configuracoes")}
              hideCloseButton
              style={{ maxWidth: "100%" }}
            />
          </div>
        )}

        <div data-testid="oportunidades-filters" style={{ marginBottom: "1rem", display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "flex-end" }}>
          {/* Segmento / Ramo: MultiSelect quando a empresa possui múltiplos segmentos cadastrados */}
          {preferencias?.segmentos && preferencias.segmentos.length >= 2 ? (
            <div style={{ minWidth: "240px" }} data-testid="filter-segmento-multiselect-wrapper">
              <MultiSelect
                id="filter-segmento"
                data-testid="filter-segmento"
                titleText="Segmentos da Empresa"
                label={loadingPreferencias ? "Carregando preferências..." : "Todos os seus segmentos"}
                disabled={loading || loadingPreferencias}
                items={preferencias.segmentos.map((code) => ({
                  id: code,
                  text: CATALOGO_MACRO_SEGMENTOS[code as MacroSegmento]?.nome || code,
                }))}
                itemToString={(item: any) => (item ? item.text : "")}
                selectedItems={preferencias.segmentos
                  .filter((code) =>
                    filtroSegmento
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean)
                      .includes(code),
                  )
                  .map((code) => ({
                    id: code,
                    text: CATALOGO_MACRO_SEGMENTOS[code as MacroSegmento]?.nome || code,
                  }))}
                onChange={({ selectedItems }: any) => {
                  const codes = (selectedItems || []).map((i: any) => i.id).join(",");
                  handleFiltersChange({
                    segmento: codes,
                    subsegmento: "",
                  });
                }}
              />
            </div>
          ) : (
            <Dropdown
              id="filter-segmento"
              data-testid="filter-segmento"
              titleText="Segmento / Ramo"
              label={loadingPreferencias ? "Carregando preferências..." : "Todos os Segmentos da Empresa"}
              disabled={loading || loadingPreferencias}
              items={
                loadingPreferencias
                  ? [{ id: "", text: "Carregando preferências..." }]
                  : [
                      { id: "", text: "Todos os Segmentos da Empresa" },
                      ...(preferencias?.segmentos && preferencias.segmentos.length > 0
                        ? preferencias.segmentos.map((code) => ({
                            id: code,
                            text: CATALOGO_MACRO_SEGMENTOS[code as MacroSegmento]?.nome || code,
                          }))
                        : Object.values(CATALOGO_MACRO_SEGMENTOS).map((macro) => ({
                            id: macro.codigo,
                            text: macro.nome,
                          }))),
                    ]
              }
              itemToString={(item) => (item ? item.text : "")}
              selectedItem={
                filtroSegmento
                  ? {
                      id: filtroSegmento,
                      text:
                        CATALOGO_MACRO_SEGMENTOS[filtroSegmento as MacroSegmento]?.nome ||
                        filtroSegmento,
                    }
                  : null
              }
              onChange={({ selectedItem }) => {
                const novoSeg = selectedItem?.id || "";
                handleFiltersChange({
                  segmento: novoSeg,
                  subsegmento: "",
                });
              }}
              style={{ minWidth: "220px" }}
            />
          )}

          {/* Sub-segmento dinâmico (restrito ao que o cliente escolheu na Seção 5 de Configurações) */}
          {(() => {
            const isMultiplosSegmentos = filtroSegmento.includes(",");
            return (
              <Dropdown
                id="filter-subsegmento"
                data-testid="filter-subsegmento"
                titleText="Sub-segmento"
                label={
                  isMultiplosSegmentos
                    ? "Todos os sub-segmentos"
                    : filtroSegmento
                    ? "Todos os Sub-segmentos"
                    : "Selecione um segmento primeiro"
                }
                disabled={loading || loadingPreferencias || !filtroSegmento || isMultiplosSegmentos}
                items={
                  isMultiplosSegmentos
                    ? [{ id: "", text: "Todos os sub-segmentos" }]
                    : filtroSegmento && CATALOGO_MACRO_SEGMENTOS[filtroSegmento as MacroSegmento]
                    ? [
                        { id: "", text: "Todos os Sub-segmentos" },
                        ...CATALOGO_MACRO_SEGMENTOS[filtroSegmento as MacroSegmento].subcategorias
                          .filter(
                            (sub) =>
                              !preferencias?.subsegmentos ||
                              preferencias.subsegmentos.length === 0 ||
                              preferencias.subsegmentos.includes(sub.codigo),
                          )
                          .map((sub) => ({ id: sub.codigo, text: sub.nome })),
                      ]
                    : [{ id: "", text: "Selecione um segmento primeiro" }]
                }
                itemToString={(item) => (item ? item.text : "")}
                selectedItem={
                  isMultiplosSegmentos
                    ? { id: "", text: "Todos os sub-segmentos" }
                    : filtroSubsegmento && filtroSegmento
                    ? {
                        id: filtroSubsegmento,
                        text:
                          CATALOGO_MACRO_SEGMENTOS[
                            filtroSegmento as MacroSegmento
                          ]?.subcategorias.find((s) => s.codigo === filtroSubsegmento)?.nome ||
                          filtroSubsegmento,
                      }
                    : null
                }
                onChange={({ selectedItem }) => handleFilterChange("subsegmento", selectedItem?.id || "")}
                style={{ minWidth: "220px" }}
              />
            );
          })()}

          {/* UF: MultiSelect com checkbox quando o cliente escolheu 2+ estados específicos na Seção 5 */}
          {preferencias && !preferencias.brasilInteiro && (preferencias.ufs?.length ?? 0) >= 2 ? (
            <div style={{ minWidth: "220px" }} data-testid="filter-uf-multiselect-wrapper">
              <MultiSelect
                id="filter-uf"
                titleText="UF (Múltiplos Estados)"
                label="Selecione os estados"
                disabled={loading || loadingPreferencias}
                items={ESTADOS_BRASIL.filter((e) => preferencias.ufs.includes(e.sigla)).map((e) => ({
                  id: e.sigla,
                  text: `${e.nome} (${e.sigla})`,
                }))}
                itemToString={(item: any) => (item ? item.text : "")}
                selectedItems={ESTADOS_BRASIL.filter((e) =>
                  filtroUf
                    .split(",")
                    .map((u) => u.trim())
                    .filter(Boolean)
                    .includes(e.sigla),
                ).map((e) => ({
                  id: e.sigla,
                  text: `${e.nome} (${e.sigla})`,
                }))}
                onChange={({ selectedItems }: any) => {
                  const siglas = (selectedItems || []).map((i: any) => i.id).join(",");
                  handleFilterChange("uf", siglas);
                }}
              />
            </div>
          ) : (
            <Dropdown
              id="filter-uf"
              data-testid="filter-uf"
              titleText="UF"
              label="Todas as UFs"
              disabled={loading || loadingPreferencias}
              items={[
                { id: "", text: "Todas as UFs" },
                ...(preferencias && !preferencias.brasilInteiro && preferencias.ufs.length > 0
                  ? ESTADOS_BRASIL.filter((e) => preferencias.ufs.includes(e.sigla)).map((e) => ({
                      id: e.sigla,
                      text: `${e.nome} (${e.sigla})`,
                    }))
                  : ESTADOS_BRASIL.map((e) => ({ id: e.sigla, text: `${e.nome} (${e.sigla})` }))),
              ]}
              itemToString={(item) => (item ? item.text : "")}
              selectedItem={
                filtroUf
                  ? {
                      id: filtroUf,
                      text:
                        ESTADOS_BRASIL.find((e) => e.sigla === filtroUf)
                          ? `${ESTADOS_BRASIL.find((e) => e.sigla === filtroUf)?.nome} (${filtroUf})`
                          : filtroUf,
                    }
                  : null
              }
              onChange={({ selectedItem }) => handleFilterChange("uf", selectedItem?.id || "")}
              style={{ minWidth: "180px" }}
            />
          )}

          {/* Faixa de Valor */}
          <Dropdown
            id="filter-faixa-valor"
            data-testid="filter-faixa-valor"
            titleText="Faixa de Valor"
            label="Selecione uma faixa"
            disabled={loading || loadingPreferencias}
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

          {/* Status */}
          <Dropdown
            id="filter-status"
            data-testid="filter-status"
            titleText="Status"
            label="Pendente (Padrão)"
            disabled={loading || loadingPreferencias}
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
          <div style={{ display: "flex", alignItems: "flex-end", gap: "0.5rem" }}>
            <TextInput
              id="filter-busca"
              data-testid="filter-busca"
              labelText="Busca por palavra-chave"
              placeholder="Digite o termo e clique em buscar..."
              disabled={loading || loadingPreferencias}
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
              disabled={loading || loadingPreferencias}
              onClick={() => handleFilterChange("busca", filtroBusca)}
            >
              Buscar
            </Button>
          </div>
        </div>

        {loading && <p>Carregando oportunidades...</p>}
        {error && <p style={{ color: "red" }}>Erro: {error}</p>}

        {!loading && !error && (
          configuracaoPendente ? (
            <Tile style={{ padding: "3rem", textAlign: "center", marginTop: "1rem" }} data-testid="empty-configuracao-pendente">
              <h3 style={{ marginBottom: "0.5rem" }}>Nenhuma oportunidade disponível</h3>
              <p style={{ color: "var(--cds-text-secondary)", marginBottom: "1.5rem" }}>
                Para que o robô localize oportunidades relevantes, configure os segmentos e estados (UFs) de atuação deste CNPJ.
              </p>
              <Button kind="primary" onClick={() => router.push("/configuracoes")}>
                Ir para Configurações da Empresa
              </Button>
            </Tile>
          ) : (
            <>
              <DataTable
                rows={oportunidades}
              headers={headers}
              isSortable
              sortRow={(
                cellA: any,
                cellB: any,
                { sortDirection, sortStates, key }: any,
              ) => {
                const dir = sortDirection === sortStates.DESC ? -1 : 1;
                if (key === "valorEstimado") {
                  return ((Number(cellA) || 0) - (Number(cellB) || 0)) * dir;
                }
                return (
                  String(cellA ?? "").localeCompare(String(cellB ?? ""), "pt-BR", {
                    sensitivity: "base",
                    numeric: true,
                  }) * dir
                );
              }}
              data-testid="oportunidades-datatable"
              render={({
                rows,
                headers,
                getHeaderProps,
                getRowProps,
              }) => (
                <TableContainer style={{ overflowX: "auto", maxWidth: "100%" }}>
                  <TableToolbar>
                    <TableToolbarContent>
                      <Button
                        onClick={() => setShowManualModal(true)}
                        kind="primary"
                        size="sm"
                        disabled={isReadOnly}
                        data-testid="btn-open-manual-modal"
                        style={{ whiteSpace: "nowrap" }}
                      >
                        + Adicionar Manualmente
                      </Button>
                    </TableToolbarContent>
                  </TableToolbar>
                  <Table className="pncp-opportunities-table">
                    <TableHead>
                      <TableRow>
                        {headers.map((header) => {
                          let headerStyle: React.CSSProperties = {};
                          if (header.key === "dataAbertura") {
                            headerStyle = { width: "120px", whiteSpace: "nowrap" };
                          } else if (header.key === "orgaoUF") {
                            headerStyle = { width: "28%" };
                          } else if (header.key === "miniResumo") {
                            headerStyle = { width: "46%" };
                          } else if (header.key === "valorEstimado") {
                            headerStyle = { width: "140px", whiteSpace: "nowrap" };
                          } else if (header.key === "acoes") {
                            headerStyle = { width: "80px", whiteSpace: "nowrap", textAlign: "center" };
                          }
                          return (
                            <TableHeader
                              {...getHeaderProps({ header, isSortable: header.isSortable })}
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
                              ) : cell.info.header === "miniResumo" ? (
                                <span
                                  style={{ fontWeight: 500, lineHeight: 1.4, wordBreak: "break-word" }}
                                  title={
                                    String(
                                      oportunidades.find((o) => o.id === row.id)?.resumoObjeto ||
                                        cell.value ||
                                        "",
                                    ).slice(0, 300) +
                                    (String(
                                      oportunidades.find((o) => o.id === row.id)?.resumoObjeto ||
                                        cell.value ||
                                        "",
                                    ).length > 300
                                      ? "..."
                                      : "")
                                  }
                                >
                                  {cell.value}
                                </span>
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
                                    className="btn-action-go"
                                    data-testid={`btn-aceitar-${row.id}`}
                                    title={isReadOnly ? "Ação desabilitada no modo somente-leitura" : "Participar"}
                                    aria-label="Participar"
                                    disabled={isReadOnly || deliberandoId === row.id}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (!isReadOnly) handleAceitarClick(row.id);
                                    }}
                                  >
                                    {deliberandoId === row.id ? (
                                      <InlineLoading status="active" style={{ width: "16px", height: "16px" }} />
                                    ) : (
                                      <Checkmark size={18} />
                                    )}
                                  </button>
                                  <button
                                    type="button"
                                    className="btn-action-no-go"
                                    data-testid={`btn-recusar-${row.id}`}
                                    title={isReadOnly ? "Ação desabilitada no modo somente-leitura" : "Não Participar"}
                                    aria-label="Não Participar"
                                    disabled={isReadOnly || deliberandoId === row.id}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (!isReadOnly) handleRecusarClick(row.id);
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
          )
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
         <TextInput
           id="input-manual-edital"
           data-testid="input-manual-edital"
           labelText="Número do Edital *"
           placeholder="Ex: 001/2026"
           value={manualNumeroEdital}
           onChange={(e) => setManualNumeroEdital(e.target.value)}
           style={{ marginBottom: "1rem" }}
         />
         <TextInput
           id="input-manual-orgao"
           data-testid="input-manual-orgao"
           labelText="Órgão *"
           placeholder="Ex: Prefeitura de São Paulo"
           value={manualOrgaoNome}
           onChange={(e) => setManualOrgaoNome(e.target.value)}
           style={{ marginBottom: "1rem" }}
         />
         <TextInput
           id="input-manual-cnpj"
           data-testid="input-manual-cnpj"
           labelText="CNPJ do Órgão *"
           placeholder="00.000.000/0000-00"
           value={manualOrgaoCnpj}
           onChange={(e) => setManualOrgaoCnpj(maskCnpj(e.target.value))}
           invalid={Boolean(manualOrgaoCnpj && manualOrgaoCnpj.replace(/\D/g, "").length === 14 && !isValidCnpj(manualOrgaoCnpj))}
           invalidText="CNPJ inválido segundo a Receita Federal."
           style={{ marginBottom: "1rem" }}
         />
         <Dropdown
           id="input-manual-uf"
           data-testid="input-manual-uf"
           titleText="UF *"
           label="Selecione o Estado (UF)"
           items={ESTADOS_BRASIL.map((e) => ({ id: e.sigla, text: `${e.sigla} — ${e.nome}` }))}
           itemToString={(item) => (item ? item.text : "")}
           selectedItem={
             manualUf
               ? {
                   id: manualUf,
                   text: `${manualUf} — ${ESTADOS_BRASIL.find((e) => e.sigla === manualUf)?.nome || manualUf}`,
                 }
               : null
           }
           onChange={({ selectedItem }) => setManualUf(selectedItem?.id || "")}
           style={{ marginBottom: "1rem" }}
         />
         <Dropdown
           id="input-manual-segmento"
           data-testid="input-manual-segmento"
           titleText="Segmento / Ramo *"
           label="Selecione o Segmento"
           items={Object.values(CATALOGO_MACRO_SEGMENTOS).map((m) => ({ id: m.codigo, text: m.nome }))}
           itemToString={(item) => (item ? item.text : "")}
           selectedItem={
             manualSegmento
               ? {
                   id: manualSegmento,
                   text: CATALOGO_MACRO_SEGMENTOS[manualSegmento as MacroSegmento]?.nome || manualSegmento,
                 }
               : null
           }
           onChange={({ selectedItem }) => {
             setManualSegmento(selectedItem?.id || "");
             setManualSubsegmento("");
           }}
           style={{ marginBottom: "1rem" }}
         />
         <Dropdown
           id="input-manual-subsegmento"
           data-testid="input-manual-subsegmento"
           titleText="Sub-segmento"
           label={manualSegmento ? "Selecione o Sub-segmento" : "Selecione um segmento primeiro"}
           disabled={!manualSegmento}
           items={
             manualSegmento && CATALOGO_MACRO_SEGMENTOS[manualSegmento as MacroSegmento]
               ? CATALOGO_MACRO_SEGMENTOS[manualSegmento as MacroSegmento].subcategorias.map((sub) => ({
                   id: sub.codigo,
                   text: sub.nome,
                 }))
               : []
           }
           itemToString={(item) => (item ? item.text : "")}
           selectedItem={
             manualSubsegmento && manualSegmento
               ? {
                   id: manualSubsegmento,
                   text:
                     CATALOGO_MACRO_SEGMENTOS[manualSegmento as MacroSegmento]?.subcategorias.find(
                       (s) => s.codigo === manualSubsegmento,
                     )?.nome || manualSubsegmento,
                 }
               : null
           }
           onChange={({ selectedItem }) => setManualSubsegmento(selectedItem?.id || "")}
           style={{ marginBottom: "1rem" }}
         />
         <TextInput
           id="input-manual-valor"
           data-testid="input-manual-valor"
           labelText="Valor Estimado (R$) *"
           placeholder="Ex: 150.000,00"
           value={manualValorEstimado}
           onChange={(e) => setManualValorEstimado(e.target.value.replace(/[^\d.,]/g, ""))}
           style={{ marginBottom: "1rem" }}
         />
         <TextInput
           id="input-manual-abertura"
           data-testid="input-manual-abertura"
           labelText="Data Limite para Envio da Proposta"
           placeholder="DD/MM/AAAA"
           value={manualDataAbertura}
           onChange={(e) => setManualDataAbertura(e.target.value)}
           style={{ marginBottom: "1rem" }}
         />
         <TextInput
           id="input-manual-mini-resumo"
           data-testid="input-manual-mini-resumo"
           labelText="Mini-resumo"
           placeholder="Ex: Aquisição de equipamentos"
           value={manualMiniResumo}
           onChange={(e) => setManualMiniResumo(e.target.value)}
           style={{ marginBottom: "1rem" }}
         />
         <TextInput
           id="input-manual-resumo"
           data-testid="input-manual-resumo"
           labelText="Resumo do Objeto"
           placeholder="Ex: Aquisição de equipamentos de informática para secretarias..."
           value={manualResumoObjeto}
           onChange={(e) => setManualResumoObjeto(e.target.value)}
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
         <FileDropZone
           id="input-file-json"
           dataTestId="input-file-json"
           label="Carregar arquivo JSON"
           helperText="Arraste o arquivo .json da listagem de licitações ou clique para buscar"
           accept=".json,application/json"
           selectedFile={jsonFile}
           onFileSelect={processJsonFile}
           onFileClear={() => {
             setJsonFile(null);
             setImportJsonContent("");
           }}
           style={{ marginBottom: "1.5rem" }}
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
         data-testid="modal-recusar-oportunidade"
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

      {/* Modal de Carregamento da Deliberação */}
      {loadingModalOpen && (
        <Modal
          passiveModal
          open
          modalHeading="Processando Deliberação"
          onRequestClose={() => {}}
          preventCloseOnClickOutside
          data-testid="modal-deliberacao-loading"
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "2rem 1rem",
              gap: "1rem",
            }}
          >
            <InlineLoading status="active" description={loadingModalMsg} />
          </div>
        </Modal>
      )}
    </ModulePageShell>
   );
 }